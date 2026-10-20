#!/usr/bin/env python3
"""Scoped Whatbox lifecycle. Never operates on unrelated services or media."""
import argparse
from datetime import datetime, timedelta, timezone
import fcntl
import json
import os
from pathlib import Path
import secrets
import signal
import subprocess
import xml.etree.ElementTree as ET

from deploy_web import REQUIRED as WEBSITE_FILES

ROOT = Path(__file__).resolve().parents[1]
LABEL = "pavoia.pilot"
SCENES = (
    {"id": "palac-feel", "name": "Palac Feel", "port": 14502, "suffix": "", "state": "state"},
    {"id": "palac-dance", "name": "Palac Dance", "port": 14503, "suffix": "-dance", "state": "state-dance"},
    {"id": "bermuda-day", "name": "Under the Sun", "port": 14504, "suffix": "-bermuda-day", "state": "state-bermuda-day"},
    {"id": "bermuda-evening", "name": "As Night Begins", "port": 14505, "suffix": "-bermuda-evening", "state": "state-bermuda-evening"},
    {"id": "essentials", "name": "Essentials", "port": 14506, "suffix": "-essentials", "state": "state-essentials"},
    {"id": "etage-zero", "name": "Etage 0", "port": 14507, "suffix": "-etage-zero", "state": "state-etage-zero"},
    {"id": "fontanna", "name": "Fontanna", "port": 14508, "suffix": "-fontanna", "state": "state-fontanna"},
    {"id": "ambiance", "name": "Ambiance", "port": 14509, "suffix": "-ambiance", "state": "state-ambiance"},
    {"id": "closing", "name": "Closing", "port": 14511, "suffix": "-closing", "state": "state-closing"},
)
NAMES = ["pavoia-pilot-icecast"] + [
    f"pavoia-pilot-{service}{scene['suffix']}"
    for scene in SCENES for service in ("controller", "liquidsoap")
]
LIQUIDSOAP = "docker.io/savonet/liquidsoap@sha256:c30745e4f3e5b80a3ee2a05d65fe2b203373e238f600581d5f741ec64e928ed5"
NGINX = ROOT / "nginx/nginx.conf"
# Each site serves ROOT/web-<env>, a static release (ops/deploy_web.py) of branch production or main,
# on top of the same live stations.
SITES = (("prod", "pavoia.gaende.box.ca", 14500), ("dev", "pavoia-dev.gaende.box.ca", 14520))


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def private_write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = path.with_suffix(path.suffix + ".new")
    with open(temporary, "w", encoding="utf-8") as f:
        os.fchmod(f.fileno(), 0o600)
        f.write(content)
        f.flush()
        os.fsync(f.fileno())
    temporary.replace(path)


def configure():
    if not all((ROOT / "web-prod" / name).is_file() for name in WEBSITE_FILES):
        raise RuntimeError("web-prod is missing or incomplete: on a first install run ops/deploy_web.py prepare prod <sha> first")
    for name in ["secrets", "icecast", "nginx", "artifacts", "bin", *(scene["state"] for scene in SCENES)]:
        (ROOT / name).mkdir(exist_ok=True, mode=0o700)
    credential_file = ROOT / "secrets/credentials.json"
    if credential_file.exists():
        credentials = json.loads(credential_file.read_text())
    else:
        credentials = {name: secrets.token_urlsafe(32) for name in ["internal", "source", "admin"]}
        private_write(credential_file, json.dumps(credentials))
    preferences = Path.home() / "Library/Application Support/Plex Media Server/Preferences.xml"
    plex = ET.parse(preferences).getroot().attrib
    port = int(plex.get("ManualPortMappingPort", "31711"))
    if not 1 <= port <= 65535:
        raise ValueError("invalid Plex port")
    music = Path.home() / "files/plex_music_library/opus"
    if not music.is_dir():
        raise ValueError("music root unavailable")
    controller = {
        "PAVOIA_STATE_DIR": "/state",
        "PAVOIA_MUSIC_ROOT": str(music), "PAVOIA_PLEX_URL": f"http://127.0.0.1:{port}",
        "PAVOIA_PLEX_TOKEN": plex["PlexOnlineToken"], "PAVOIA_INTERNAL_TOKEN": credentials["internal"],
        "PAVOIA_ICECAST_URL": "http://127.0.0.1:14501",
    }
    liquidsoap = {"PAVOIA_INTERNAL_TOKEN": credentials["internal"],
                  "PAVOIA_ICECAST_SOURCE_PASSWORD": credentials["source"],
                  "PAVOIA_FADE_SECONDS": "3", "TZ": "UTC"}
    for scene in SCENES:
        url = f"http://127.0.0.1:{scene['port']}"
        environments = [
            ("controller", {**controller, "PAVOIA_LISTEN": f"127.0.0.1:{scene['port']}", "PAVOIA_STAGE": scene["id"]}),
            ("liquidsoap", {**liquidsoap, "PAVOIA_CONTROLLER_URL": url,
                           "PAVOIA_MOUNT": f"/{scene['id']}.mp3", "PAVOIA_RADIO_NAME": f"Pavoia - {scene['name']}"}),
        ]
        for name, values in environments:
            if any("\n" in value or "\r" in value for value in values.values()):
                raise ValueError("invalid environment value")
            private_write(ROOT / f"secrets/{name}{scene['suffix']}.env", "".join(f"{k}={v}\n" for k, v in values.items()))
    private_write(ROOT / "secrets/preview-access.txt", "URL=https://pavoia.gaende.box.ca/\n")

    icecast = ET.Element("icecast")
    def element(parent, key, value):
        ET.SubElement(parent, key).text = str(value)
    for key, value in [("location", "Pavoia"), ("admin", "radio@localhost"), ("hostname", "127.0.0.1")]:
        element(icecast, key, value)
    limits = ET.SubElement(icecast, "limits")
    # 320 kbps is 40,000 B/s. The burst is each new listener's head start, about 19.7 s, which absorbs
    # dips on long routes (Noumea to the server is ~311 ms per round trip). The queue must stay larger.
    for key, value in [("clients", 160), ("sources", len(SCENES)), ("queue-size", 2097152), ("client-timeout", 15), ("header-timeout", 10), ("source-timeout", 10), ("burst-size", 786432)]:
        element(limits, key, value)
    auth = ET.SubElement(icecast, "authentication")
    for key, value in [("source-password", credentials["source"]), ("relay-password", credentials["admin"]), ("admin-user", "admin"), ("admin-password", credentials["admin"])]:
        element(auth, key, value)
    listen = ET.SubElement(icecast, "listen-socket")
    element(listen, "port", 14501)
    element(listen, "bind-address", "127.0.0.1")
    for scene in SCENES:
        mount = ET.SubElement(icecast, "mount", {"type": "normal"})
        for key, value in [("mount-name", f"/{scene['id']}.mp3"), ("public", "false"), ("max-listeners", 120)]:
            element(mount, key, value)
    paths = ET.SubElement(icecast, "paths")
    for key, value in [("basedir", "/opt/icecast/share/icecast"), ("logdir", "/"), ("webroot", "/opt/icecast/share/icecast/web"), ("adminroot", "/opt/icecast/share/icecast/admin"), ("reportxmldb", "/opt/icecast/share/icecast/report-db.xml")]:
        element(paths, key, value)
    logging = ET.SubElement(icecast, "logging")
    for key, value in [("accesslog", "dev/null"), ("errorlog", "-"), ("loglevel", "warning"), ("logarchive", "false")]:
        element(logging, key, value)
    private_write(ROOT / "icecast/icecast.xml", ET.tostring(icecast, encoding="unicode"))
    for scene in SCENES:
        fallback = ROOT / scene["state"] / "fallback.m3u"
        if not fallback.exists():
            private_write(fallback, "#EXTM3U\n")
    # Temporary headroom: managed HTTPS resets new connections at 100 held streams.
    # Remove/revise after Whatbox confirms sufficient website + audio capacity.
    stream_locations = "".join(f'''    location = /stream/{scene['id']}.mp3 {{
      limit_except GET {{ deny all; }}
      limit_conn pavoia_streams 90;
      limit_conn_status 503;
      proxy_pass http://127.0.0.1:14501/{scene['id']}.mp3;
      proxy_http_version 1.1;
      proxy_set_header Connection "";
      proxy_set_header Authorization "";
      proxy_set_header Icy-MetaData "";
      proxy_buffering off;
      proxy_request_buffering off;
      proxy_read_timeout 60s;
      send_timeout 15s;
      add_header Cache-Control "no-store" always;
    }}
''' for scene in SCENES)
    routes = [(path, 14502) for path in ("/api/library/catalogue", "/api/library/statistics", "/api/library/names", "/api/audience")]
    routes += [(f"/api/radio/{scene['id']}{suffix}", scene["port"])
               for scene in SCENES for suffix in ("", "/stats", "/catalogue", "/changes", "/history", "/music")]
    def controller_locations(routes):
        return "".join(f'''    location = {path} {{
      limit_except GET {{ deny all; }}
      proxy_pass http://127.0.0.1:{port};
      proxy_set_header Authorization "";
      proxy_set_header Host $host;
      proxy_connect_timeout 3s;
      proxy_read_timeout 5s;
    }}
''' for path, port in routes)
    artwork_scenes = [(f"/api/radio/{scene['id']}/artwork/", scene["port"]) for scene in SCENES] + [("/api/library/artwork/",14502), ("/api/discovery/",14502)]
    artwork_locations = "".join(f'''    location ^~ {path} {{
      limit_except GET {{ deny all; }}
      proxy_pass http://127.0.0.1:{port};
      proxy_set_header Authorization "";
      proxy_connect_timeout 3s;
      proxy_read_timeout 15s;
    }}
''' for path, port in artwork_scenes)
    # Browsers refuse scripts and styles with a wrong type because the site sends nosniff, and
    # nginx's built-in type map lacks js, css, svg and fonts.
    def static_site(env):
        return "".join(f'''    location {match} {{
      limit_except GET {{ deny all; }}
      root {ROOT / f"web-{env}"};
      try_files {files} =404;
      types {{ text/html html; text/css css; text/javascript js; image/svg+xml svg; image/jpeg jpg; font/woff2 woff2; font/ttf ttf; text/plain txt; }}
      charset utf-8;
      charset_types text/css text/javascript text/plain image/svg+xml;
      expires epoch;
    }}
''' for match, files in (("= /", "/index.html"), ("/", "$uri")))

    def server(host, port, site):
        return f'''  server {{
    listen 0.0.0.0:{port};
    listen [::]:{port};
    server_name {host};
    add_header X-Robots-Tag "noindex, nofollow" always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy no-referrer always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; media-src 'self'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'" always;
    location ^~ /internal/ {{ return 404; }}
    location = /healthz {{ return 404; }}
{stream_locations}{controller_locations(routes)}{artwork_locations}{site}  }}
'''
    private_write(NGINX, f'''worker_processes 1;
pid {ROOT}/nginx/nginx.pid;
error_log /dev/null warn;
events {{ worker_connections 1024; }}
http {{
  map $server_port $pavoia_stream_key {{ default pavoia; }}
  limit_conn_zone $pavoia_stream_key zone=pavoia_streams:32k;
  access_log off;
  default_type application/octet-stream;
  server_tokens off;
  client_max_body_size 8k;
  client_body_temp_path {ROOT}/nginx/client_body;
  proxy_temp_path {ROOT}/nginx/proxy;
  keepalive_timeout 15;
{"".join(server(host, port, static_site(env)) for env, host, port in SITES)}}}
''')
    print("Configuration ready; public URL in secrets/preview-access.txt")


def inspect(name):
    p = subprocess.run(["podman", "container", "inspect", name], capture_output=True, text=True)
    if p.returncode:
        return None
    data = json.loads(p.stdout)[0]
    if data.get("Config", {}).get("Labels", {}).get("project") != LABEL:
        raise RuntimeError("refusing to operate on a container without pilot ownership label")
    return data


def create_containers():
    music = Path.home() / "files/plex_music_library/opus"
    # Whatbox keep-id returned Config.User=0:0 and could not read private host files.
    # In rootless Podman's own namespace, UID 0 maps to the unprivileged host owner.
    common = ["--label", "project="+LABEL, "--network=host", "--userns=host", "--user", "0:0",
              "--read-only", "--tmpfs", "/tmp:rw,nosuid,nodev,size=64m", "--cap-drop=ALL", "--security-opt", "no-new-privileges",
              "--restart=always", "--log-driver=k8s-file", "--log-opt", "max-size=4mb", "--pids-limit", "128"]
    specs = [
        (NAMES[0], ["-v", f"{ROOT}/icecast:/config:ro", "localhost/pavoia-icecast:2.5.0"]),
    ]
    for scene in SCENES:
        suffix = scene["suffix"]
        state = ROOT / scene["state"]
        specs += [
            (f"pavoia-pilot-controller{suffix}", ["--env-file", str(ROOT/f"secrets/controller{suffix}.env"), "-v", f"{state}:/state:rw", "-v", f"{music}:{music}:ro", "-v", "/etc/ssl/certs:/etc/ssl/certs:ro", "localhost/pavoia-controller:pilot"]),
            (f"pavoia-pilot-liquidsoap{suffix}", ["--env-file", str(ROOT/f"secrets/liquidsoap{suffix}.env"), "-v", f"{state}:/state:ro", "-v", f"{ROOT}/ops/radio.liq:/config/radio.liq:ro", "-v", f"{music}:{music}:ro", LIQUIDSOAP, "/config/radio.liq"]),
        ]
    for name, spec in specs:
        if inspect(name) is None:
            run(["podman", "create", "--name", name, *common, *spec], stdout=subprocess.DEVNULL)


def nginx_pid():
    try:
        pid = int((ROOT / "nginx/nginx.pid").read_text())
        proc = Path(f"/proc/{pid}")
        cmd = (proc / "cmdline").read_bytes().replace(b"\0", b" ").decode()
        if proc.stat().st_uid == os.getuid() and "nginx: master process" in cmd and str(NGINX) in cmd:
            return pid
    except (FileNotFoundError, ValueError, ProcessLookupError):
        pass
    return None


def start():
    create_containers()
    run(["nginx", "-e", "stderr", "-p", str(ROOT/"nginx"), "-c", str(NGINX), "-t"])
    for name in NAMES:
        if not inspect(name)["State"]["Running"]:
            run(["podman", "start", name], stdout=subprocess.DEVNULL)
    if nginx_pid() is None:
        run(["nginx", "-e", "stderr", "-p", str(ROOT/"nginx"), "-c", str(NGINX)])
    (ROOT / "secrets/maintenance").unlink(missing_ok=True)
    print("Pilot services started")


def stop():
    private_write(ROOT / "secrets/maintenance", "stopped\n")
    pid = nginx_pid()
    if pid:
        os.kill(pid, signal.SIGTERM)
    for name in reversed(NAMES):
        data = inspect(name)
        if data is not None:
            run(["podman", "stop", "-t", "10", name], stdout=subprocess.DEVNULL)
    print("Only pilot services stopped")


def install_cron():
    previous = subprocess.run(["crontab", "-l"], capture_output=True, text=True)
    if previous.returncode not in (0, 1):
        raise RuntimeError("could not read crontab")
    begin, end = "# BEGIN PAVOIA PILOT", "# END PAVOIA PILOT"
    lines, inside = [], False
    for line in previous.stdout.splitlines():
        if line == begin:
            inside = True
        elif line == end:
            inside = False
        elif not inside:
            lines.append(line)
    if inside:
        raise RuntimeError("unclosed pilot cron block")
    private_write(ROOT / "secrets/crontab-before.txt", previous.stdout)
    command = f"/usr/bin/python3 {ROOT}/ops/manage.py"
    refresh = f"/usr/bin/python3 {ROOT}/ops/catalogue_inventory.py --publish-library --output {ROOT}/artifacts/full-music-inventory.json"
    # Low priority with a hard stop; the sync itself records every attempt in sync-status.json.
    discovery = (f"/usr/bin/nice -n 10 /usr/bin/timeout -k 60 900 /usr/bin/python3 {ROOT}/ops/discovery_sync.py "
                 f"--state {ROOT}/state/discovery --key-file {ROOT}/state/discovery/.api-key")
    lines += [begin, f"@reboot {command} boot >/dev/null 2>&1",
              f"35 * * * * {refresh} >{ROOT}/artifacts/library-refresh.log 2>&1",
              f"5 * * * * {discovery} >{ROOT}/artifacts/discovery-refresh.log 2>&1", end]
    run(["crontab", "-"], input="\n".join(lines)+"\n", text=True)
    current = run(["crontab", "-l"], capture_output=True, text=True).stdout
    if current != "\n".join(lines)+"\n":
        raise RuntimeError("crontab read-back differs")
    print("Radio reboot, hourly library and discovery catalogue refresh installed; other entries preserved")


def catalogue_status():
    try:
        status = json.loads((ROOT / "state/discovery/sync-status.json").read_text())
        attempt = datetime.fromisoformat(status["attemptAt"])
    except (OSError, ValueError, KeyError, TypeError):
        return "unknown (no readable sync status)"
    now = datetime.now(timezone.utc)
    def age(key):
        try:
            minutes = int((now - datetime.fromisoformat(status[key])).total_seconds() // 60)
        except (KeyError, TypeError, ValueError):
            return "never"
        return f"{minutes}m ago" if minutes < 120 else f"{minutes // 60}h ago"
    # The hourly job always records an attempt; an old attempt means cron or the job itself stopped.
    parts = [str(status.get("result", "unknown")) + (" STALE" if now - attempt > timedelta(hours=2) else ""),
             f"attempt {age('attemptAt')}", f"checked {age('checkedAt')}", f"published {age('publishedAt')}",
             f"cursor {status.get('cursor')}", f"behind {'yes' if status.get('behind') else 'no'}",
             f"failures {status.get('consecutiveFailures', 0)}"]
    if status.get("error"):
        parts.append(f"error {status['error']}")
    if status.get("warnings"):
        parts.append("warnings " + "; ".join(map(str, status["warnings"])))
    return " | ".join(parts)


def update_controllers():
    names = [f"pavoia-pilot-controller{scene['suffix']}" for scene in SCENES]
    owned = [inspect(name) for name in names]
    for name, info in zip(names, owned):
        if info is not None:
            run(["podman", "rm", "-f", name], stdout=subprocess.DEVNULL)
    create_containers()
    for name in names:
        run(["podman", "start", name], stdout=subprocess.DEVNULL)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["configure", "start", "boot", "stop", "status", "install-cron", "update-controller"])
    action = parser.parse_args().action
    os.umask(0o077)
    (ROOT / "secrets").mkdir(exist_ok=True, mode=0o700)
    with open(ROOT / "secrets/ops.lock", "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if action == "configure": configure()
        elif action == "start": start()
        elif action == "boot":
            if not (ROOT / "secrets/maintenance").exists(): start()
        elif action == "stop": stop()
        elif action == "install-cron": install_cron()
        elif action == "update-controller": update_controllers()
        elif action == "status":
            for name in NAMES:
                info = inspect(name)
                print(name, info["State"]["Status"] if info else "absent")
            print("nginx", "running" if nginx_pid() else "stopped")
            print("catalogue", catalogue_status())


if __name__ == "__main__":
    main()
