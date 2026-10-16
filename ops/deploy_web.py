#!/usr/bin/env python3
"""Publish the website of one GitHub commit on pavoia-dev, without restarting any service.

Nginx serves ROOT/web-dev, a symlink to an unpacked release folder, so a deploy or a
rollback is one atomic symlink swap. Only static files are copied: nothing from the
repository is executed here. Production keeps its reviewed release process for now.

GitHub Actions reaches this through an SSH key restricted to `deploy_web.py --ssh`,
which accepts exactly "dev <sha>" in SSH_ORIGINAL_COMMAND. A commit deploys only if it
is on branch main and newer than the live release.
Local use: deploy_web.py dev <sha> | deploy_web.py rollback dev
"""
import argparse
import fcntl
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path.home() / "pavoia-radio-src"
REPO = "https://github.com/Y0lan/pavoia-radio.git"
LFS_URL = "https://github.com/Y0lan/pavoia-radio.git/info/lfs"
TARGETS = {"dev": ("main", 14520)}
KEEP = 5
REQUIRED = ("index.html", "app.js", "style.css")
TYPES = {"/": "text/html", "/app.js": "text/javascript", "/style.css": "text/css"}
LFS_POINTER = b"version https://git-lfs.github.com/spec/v1"
MAX_BYTES = 300 << 20


class Refused(Exception):
    pass


def clean_env():
    # Variables a calling Git hook sets (GIT_DIR, GIT_INDEX_FILE...) would point these commands at another repository.
    return {**{key: value for key, value in os.environ.items() if not key.startswith("GIT_")}, "GIT_TERMINAL_PROMPT": "0"}


def git(*args, check=True):
    return subprocess.run(["git", "-C", str(SOURCE), *args], check=check, capture_output=True, text=True, env=clean_env())


def link(env):
    return ROOT / f"web-{env}"


def point(path, target):
    temporary = path.with_name(path.name + ".tmp")
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(target)
    os.replace(temporary, path)


def resolved(path):
    return path.resolve() if path.is_symlink() else None


def fetch(branch):
    if not (SOURCE / ".git").exists():
        subprocess.run(["git", "clone", "--quiet", "--no-checkout", REPO, str(SOURCE)], check=True, capture_output=True, text=True, env=clean_env())
        git("lfs", "install", "--local")
    # Local config wins over a committed .lfsconfig: large files only ever come from this repository,
    # and only the website's.
    git("config", "lfs.url", LFS_URL)
    git("config", "lfs.fetchinclude", "web/**")
    git("fetch", "--quiet", "--prune", "--no-tags", "origin", f"+refs/heads/{branch}:refs/remotes/origin/{branch}")
    return git("rev-parse", f"refs/remotes/origin/{branch}").stdout.strip()


def ancestor(older, newer):
    return git("merge-base", "--is-ancestor", older, newer, check=False).returncode == 0


def build(env, sha):
    # Git records symlinks (120000) and submodules (160000) by mode; refuse them, web itself included.
    for line in git("ls-tree", "-r", "-t", sha, "--", "web").stdout.splitlines():
        mode, _, rest = line.partition(" ")
        if mode in ("120000", "160000"):
            raise Refused(f"symlink or submodule in the website: {rest.split(chr(9), 1)[1]}")
    git("-c", "advice.detachedHead=false", "checkout", "--quiet", "--force", "--detach", sha)
    git("lfs", "pull", "--include", "web/**")
    source = SOURCE / "web"
    if source.is_symlink() or not source.is_dir():
        raise Refused("web/ is not a folder")
    total = 0
    for path in source.rglob("*"):
        if path.is_symlink():
            raise Refused(f"symlink in web/: {path.relative_to(SOURCE)}")
        if path.is_file():
            total += path.stat().st_size
            with path.open("rb") as handle:
                if handle.read(len(LFS_POINTER)) == LFS_POINTER:
                    raise Refused(f"LFS file not downloaded: {path.relative_to(SOURCE)}")
    if total > MAX_BYTES:
        raise Refused(f"website is {total >> 20} MB, above {MAX_BYTES >> 20} MB")
    for name in REQUIRED:
        if not (source / name).is_file():
            raise Refused(f"missing web/{name}")
    releases = ROOT / "releases"
    releases.mkdir(exist_ok=True)
    release = releases / f"web-{env}-{sha}"
    if not release.exists():
        partial = releases / f".partial-{env}-{sha}"
        shutil.rmtree(partial, ignore_errors=True)
        try:
            shutil.copytree(source, partial)
        except OSError:
            shutil.rmtree(partial, ignore_errors=True)
            raise
        os.replace(partial, release)
    os.utime(release)
    return release


def activate(env, release):
    """Serve release, which makes the release served until now the rollback target, and check it.
    If the check fails, both links return exactly to what they were."""
    links = (link(env), ROOT / f".web-{env}.previous")
    saved = [resolved(path) for path in links]
    try:
        if saved[0] and saved[0] != release.resolve():
            point(links[1], saved[0])
        point(links[0], release)
        smoke(env, release)
    except Exception as error:
        for path, target in zip(links, saved):
            if target:
                point(path, target)
            else:
                path.unlink(missing_ok=True)
        raise Refused(f"smoke test failed ({error}); the previous state is restored")


def smoke(env, release):
    port = TARGETS[env][1]
    for path, name in (("/", "index.html"), ("/app.js", "app.js"), ("/style.css", "style.css")):
        request = urllib.request.Request(f"http://127.0.0.1:{port}{path}", headers={"Host": "localhost", "Cache-Control": "no-cache"})
        with urllib.request.urlopen(request, timeout=10) as response:
            if response.read() != (release / name).read_bytes():
                raise Refused(f"{path} does not serve the new release")
            # Browsers refuse scripts and styles with the wrong type, because the site sends nosniff.
            if not response.headers.get("Content-Type", "").startswith(TYPES[path]):
                raise Refused(f"{path} is served as {response.headers.get('Content-Type')}")


def prune(env):
    keep = {resolved(link(env)), resolved(ROOT / f".web-{env}.previous")}
    releases = ROOT / "releases"
    for partial in releases.glob(f".partial-{env}-*"):
        shutil.rmtree(partial, ignore_errors=True)
    for old in sorted(releases.glob(f"web-{env}-*"), key=lambda path: path.stat().st_mtime, reverse=True)[KEEP:]:
        if old not in keep:
            shutil.rmtree(old)


def record(env, sha, result):
    log = ROOT / "artifacts/deploy-web.log"
    log.parent.mkdir(exist_ok=True)
    with log.open("a") as handle:
        handle.write(f"{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())} {env} {sha} {result}\n")


def deploy(env, sha):
    branch = TARGETS[env][0]
    tip = fetch(branch)
    if not ancestor(sha, tip):
        raise Refused(f"{sha[:12]} is not on {branch}")
    live = resolved(link(env))
    live_sha = live.name.rsplit("-", 1)[-1] if live else None
    if live_sha and live_sha != sha and ancestor(sha, live_sha):
        print(f"::notice::Skipped: {sha[:12]} is older than the live {env} release {live_sha[:12]}.")
        record(env, sha, "superseded")
        return
    release = build(env, sha)
    try:
        activate(env, release)
    except Refused as error:
        record(env, sha, str(error))
        raise
    finally:
        # Failed releases count too, so repeated failures cannot fill the disk.
        prune(env)
    record(env, sha, "live")
    print(f"{env} now serves {sha[:12]} from {release.name}.")


def rollback(env):
    release = resolved(ROOT / f".web-{env}.previous")
    if not release:
        raise Refused(f"no previous {env} release")
    activate(env, release)
    record(env, release.name, "rollback")
    print(f"{env} rolled back to {release.name}.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("words", nargs="*")
    parser.add_argument("--ssh", action="store_true", help="read the command from SSH_ORIGINAL_COMMAND")
    args = parser.parse_args()
    command = os.environ.get("SSH_ORIGINAL_COMMAND", "") if args.ssh else " ".join(args.words)
    envs = "|".join(TARGETS)
    deploying = re.fullmatch(rf"({envs}) ([0-9a-f]{{40}})", command)
    rolling = None if args.ssh else re.fullmatch(rf"rollback ({envs})", command)
    if not (deploying or rolling):
        print(f"Refused: expected '<{envs}> <40-hex sha>'.", file=sys.stderr)
        return 2
    (ROOT / "secrets").mkdir(exist_ok=True, mode=0o700)
    with open(ROOT / "secrets/deploy-web.lock", "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            if deploying:
                deploy(*deploying.groups())
            else:
                rollback(rolling.group(1))
        except (Refused, subprocess.CalledProcessError, OSError) as error:
            detail = getattr(error, "stderr", "") or ""
            print(f"Deploy failed: {error} {detail.strip()[-300:]}".strip(), file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
