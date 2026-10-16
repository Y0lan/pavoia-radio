#!/usr/bin/env python3
"""Run with python3 tests/check_deploy_web.py; uses a temporary Git repository, no network."""
import io
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ops"))
import deploy_web

TYPES = {".html": "text/html", ".js": "text/javascript", ".css": "text/css"}


def git(repo, *args):
    # The throwaway fixture repository ignores this machine's Git config (hooks, templates, signing) and any
    # repository a calling Git hook exports through GIT_DIR or GIT_INDEX_FILE.
    isolated = {**{key: value for key, value in os.environ.items() if not key.startswith("GIT_")}, "GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1"}
    return subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True, env=isolated).stdout.strip()


class Response(io.BytesIO):
    def __init__(self, body, content_type):
        super().__init__(body)
        self.headers = {"Content-Type": content_type}

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False


class DeployWebChecks(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        base = Path(self.directory.name)
        self.root, self.repo = base / "pavoia-radio", base / "github"
        self.root.mkdir()
        git(base, "init", "--quiet", "-b", "main", str(self.repo))
        git(self.repo, "config", "user.email", "test@example.invalid")
        git(self.repo, "config", "user.name", "Test")
        for name, value in [("ROOT", self.root), ("SOURCE", base / "source"), ("REPO", str(self.repo)), ("LFS_URL", str(self.repo))]:
            change = patch.object(deploy_web, name, value)
            change.start()
            self.addCleanup(change.stop)
        self.served, self.content_type = None, None  # None: Nginx serves web-dev with correct types.
        change = patch.object(deploy_web.urllib.request, "urlopen", self.urlopen)
        change.start()
        self.addCleanup(change.stop)

    def urlopen(self, request, timeout):
        port, path = request.full_url.split(":", 2)[2].split("/", 1)
        env = {"14520": "dev", "14500": "prod"}[port]
        body = self.served if self.served is not None else (self.root / f"web-{env}" / (path or "index.html")).read_bytes()
        name = path or "index.html"
        return Response(body, self.content_type or TYPES[Path(name).suffix] + "; charset=utf-8")

    def commit(self, version, extra=None):
        web = self.repo / "web"
        web.mkdir(exist_ok=True)
        for name in deploy_web.REQUIRED:
            (web / name).write_text(f"{name} {version}\n")
        for name, content in (extra or {}).items():
            path = self.repo / name
            if isinstance(content, str):
                path.symlink_to(content)
            else:
                path.write_bytes(content)
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "--quiet", "-m", version)
        return git(self.repo, "rev-parse", "HEAD")

    def run_command(self, *words, ssh=None):
        argv = ["deploy_web.py", *words] if ssh is None else ["deploy_web.py", "--ssh"]
        env = {} if ssh is None else {"SSH_ORIGINAL_COMMAND": ssh}
        with patch.object(sys, "argv", argv), patch.dict(os.environ, env), patch("sys.stdout", new=io.StringIO()), patch("sys.stderr", new=io.StringIO()) as errors:
            code = deploy_web.main()
        return code, errors.getvalue()

    def serving(self, env="dev"):
        return (self.root / f"web-{env}" / "app.js").read_text().split()[1]

    def test_ssh_accepts_only_one_exact_dev_deploy(self):
        sha = self.commit("one")
        for command in ("", f"dev {sha} extra", f"dev {sha};id", f"dev {sha[:12]}", "dev main", f"stage {sha}", "rollback dev", f"dev  {sha}", f"dev {sha}\n"):
            self.assertEqual(self.run_command(ssh=command)[0], 2, command)
        self.assertFalse((self.root / "web-dev").exists())
        self.assertEqual(self.run_command(ssh=f"dev {sha}")[0], 0)
        self.assertEqual(self.serving(), "one")

    def test_production_publishes_only_commits_on_production(self):
        live = self.commit("zero")
        git(self.repo, "branch", "production", live)
        sha = self.commit("one")
        code, errors = self.run_command(ssh=f"prod {sha}")
        self.assertEqual(code, 1)
        self.assertIn("not on production", errors)
        self.assertFalse((self.root / "web-prod").exists())
        git(self.repo, "branch", "--force", "production", sha)
        self.assertEqual(self.run_command(ssh=f"prod {sha}")[0], 0)
        self.assertEqual(self.serving("prod"), "one")
        self.assertFalse((self.root / "web-dev").exists(), "production never touches dev")

    def test_first_install_prepares_production_before_nginx_serves_it(self):
        sha = self.commit("one")
        git(self.repo, "branch", "production", sha)
        self.served = b"Nginx is not configured for web-prod yet"
        self.assertEqual(self.run_command("prod", sha)[0], 1, "a normal deploy cannot bootstrap")
        self.assertFalse((self.root / "web-prod").exists())
        self.assertEqual(self.run_command(ssh=f"prepare prod {sha}")[0], 2, "the deploy key cannot prepare")
        self.assertEqual(self.run_command("prepare", "prod", sha)[0], 0)
        self.assertEqual(self.serving("prod"), "one")
        self.assertEqual(self.run_command("prepare", "prod", sha)[0], 1, "prepare is for a first install only")
        self.served = None  # manage.py configure and the Nginx reload happen here
        self.assertEqual(self.run_command("prod", sha)[0], 0)
        self.assertEqual(self.serving("prod"), "one")

    def test_only_newer_commits_on_main_deploy(self):
        first = self.commit("one")
        second = self.commit("two")
        self.assertEqual(self.run_command("dev", first)[0], 0, "a good commit deploys even if a newer push failed CI")
        self.assertEqual(self.serving(), "one")
        self.assertEqual(self.run_command("dev", second)[0], 0)
        self.assertEqual(self.serving(), "two")
        self.assertEqual(self.run_command("dev", first)[0], 0)
        self.assertEqual(self.serving(), "two", "a late job for an older commit never moves dev back")
        self.assertIn("superseded", (self.root / "artifacts/deploy-web.log").read_text())
        git(self.repo, "switch", "--quiet", "-c", "elsewhere")
        stray = self.commit("stray")
        git(self.repo, "switch", "--quiet", "main")
        code, errors = self.run_command("dev", stray)
        self.assertEqual(code, 1)
        self.assertIn("not on main", errors)
        self.assertEqual(self.run_command("rollback", "dev")[0], 0)
        self.assertEqual(self.serving(), "one")

    def test_unsafe_or_incomplete_websites_are_refused(self):
        good = self.commit("good")
        self.assertEqual(self.run_command("dev", good)[0], 0)
        outside = Path(self.directory.name) / "outside"
        outside.mkdir()
        for name in deploy_web.REQUIRED + ("secret.env",):
            (outside / name).write_text("outside\n")
        for extra in ({"web/leak": "/etc/passwd"}, {"web/photo.jpg": b"version https://git-lfs.github.com/spec/v1\noid sha256:00\n"}):
            sha = self.commit("bad", extra)
            code, errors = self.run_command("dev", sha)
            self.assertEqual(code, 1)
            self.assertRegex(errors, "symlink|LFS")
            self.assertEqual(self.serving(), "good")
            git(self.repo, "reset", "--quiet", "--hard", good)
        git(self.repo, "rm", "--quiet", "-r", "web")
        (self.repo / "web").symlink_to(outside)
        git(self.repo, "add", "-A")
        git(self.repo, "commit", "--quiet", "-m", "swap")
        sha = git(self.repo, "rev-parse", "HEAD")
        code, errors = self.run_command("dev", sha)
        self.assertEqual(code, 1)
        self.assertIn("symlink", errors)
        self.assertEqual(self.serving(), "good")
        self.assertEqual(git(Path(self.directory.name) / "source", "config", "lfs.url"), deploy_web.LFS_URL)

    def test_failed_smoke_test_restores_the_live_release(self):
        self.run_command("dev", self.commit("one"))
        self.run_command("dev", self.commit("two"))
        third = self.commit("three")
        for broken in ("served", "content_type"):
            setattr(self, broken, b"stale page" if broken == "served" else "application/octet-stream")
            code, errors = self.run_command("dev", third)
            self.assertEqual(code, 1)
            self.assertIn("smoke test failed", errors)
            self.assertEqual(self.serving(), "two")
            setattr(self, broken, None)
        self.run_command("rollback", "dev")
        self.assertEqual(self.serving(), "one", "the failed release never becomes the rollback target")

    def test_a_failed_check_never_takes_down_the_live_release(self):
        self.run_command("dev", self.commit("one"))
        second = self.commit("two")
        self.run_command("dev", second)
        self.served = b"temporary failure"
        self.assertEqual(self.run_command("dev", second)[0], 1, "redeploying the live commit")
        self.assertEqual(self.run_command("rollback", "dev")[0], 1)
        self.served = None
        self.assertEqual(self.serving(), "two", "both failures leave the live release in place")
        self.assertEqual(self.run_command("rollback", "dev")[0], 0)
        self.assertEqual(self.serving(), "one", "the rollback target survived both failures")

    def test_a_failed_link_update_keeps_the_rollback_target(self):
        self.run_command("dev", self.commit("one"))
        self.run_command("dev", self.commit("two"))
        third = self.commit("three")
        point = deploy_web.point
        def failing(path, target):
            if path == self.root / "web-dev" and "three" in (Path(target) / "app.js").read_text():
                raise OSError("disk full")
            point(path, target)
        with patch.object(deploy_web, "point", failing):
            self.assertEqual(self.run_command("dev", third)[0], 1)
        self.assertEqual(self.serving(), "two")
        self.assertEqual(self.run_command("rollback", "dev")[0], 0)
        self.assertEqual(self.serving(), "one")

    def test_failed_releases_are_pruned_too(self):
        self.run_command("dev", self.commit("live"))
        self.served = b"broken"
        for number in range(deploy_web.KEEP + 3):
            self.run_command("dev", self.commit(f"bad{number}"))
        self.served = None
        releases = list((self.root / "releases").glob("web-dev-*"))
        self.assertLessEqual(len(releases), deploy_web.KEEP + 2, "the newest releases plus the live and rollback ones")
        self.assertIn((self.root / "web-dev").resolve(), releases)
        self.assertEqual(self.serving(), "live")

    def test_failed_first_deploy_leaves_nothing_live_and_a_rerun_checks_again(self):
        sha = self.commit("one")
        self.content_type = "application/octet-stream"
        self.assertEqual(self.run_command("dev", sha)[0], 1)
        self.assertFalse((self.root / "web-dev").exists())
        self.served = b"x"
        self.assertEqual(self.run_command("dev", sha)[0], 1, "a re-run is never green without a passing smoke test")
        self.served, self.content_type = None, None
        self.assertEqual(self.run_command("dev", sha)[0], 0)
        self.assertEqual(self.serving(), "one")

    def test_a_calling_hook_repository_is_never_touched(self):
        decoy = Path(self.directory.name) / "decoy"
        git(Path(self.directory.name), "init", "--quiet", str(decoy))
        files = [decoy / ".git/config", decoy / ".git/HEAD"]
        before = [path.read_bytes() for path in files]
        hook = {"GIT_DIR": str(decoy / ".git"), "GIT_INDEX_FILE": str(decoy / ".git/index"), "GIT_WORK_TREE": str(decoy)}
        sha = self.commit("one")
        with patch.dict(os.environ, hook):
            self.assertEqual(self.run_command("dev", sha)[0], 0)
        self.assertEqual(self.serving(), "one")
        self.assertEqual([path.read_bytes() for path in files], before)
        self.assertFalse((decoy / ".git/index").exists())

    def test_old_releases_and_partial_copies_are_pruned(self):
        (self.root / "releases").mkdir()
        (self.root / "releases/.partial-dev-left-over").mkdir()
        for number in range(deploy_web.KEEP + 3):
            self.run_command("dev", self.commit(str(number)))
        releases = list((self.root / "releases").glob("web-dev-*"))
        self.assertEqual(len(releases), deploy_web.KEEP)
        self.assertIn((self.root / "web-dev").resolve(), releases)
        self.assertFalse((self.root / "releases/.partial-dev-left-over").exists())


if __name__ == "__main__":
    unittest.main()
