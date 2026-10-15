#!/usr/bin/env python3
"""Exercise the real audio stack with generated tones, isolated ports and state."""
import json
import os
from pathlib import Path
import secrets
import sqlite3
import subprocess
import threading
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parents[1]
LAB = ROOT / "artifacts" / ("audio-check-" + time.strftime("%Y%m%dT%H%M%S"))
TOKEN = secrets.token_urlsafe(24)
PLAYLIST = [1, 2, 3]
CREATED = []
REPORT = {}


def command(*args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def request(path, method="GET", port=14542):
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", method=method,
                                 headers={"Authorization": "Bearer " + TOKEN})
    with urllib.request.urlopen(req, timeout=4) as response:
        return response.read()


def status():
    return json.loads(request("/api/radio/palac-feel"))


def until(predicate, seconds=40):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        try:
            if predicate():
                return
        except (OSError, ValueError, KeyError, TypeError):
            pass
        time.sleep(1)
    raise AssertionError("audio condition timed out")


class Plex(BaseHTTPRequestHandler):
    def do_GET(self):
        tracks = list(PLAYLIST)
        page = ET.Element("MediaContainer", size=str(len(tracks)), totalSize=str(len(tracks)), offset="0")
        for n in tracks:
            track = ET.SubElement(page, "Track", ratingKey=str(n), title=f"Tone {n}",
                                  grandparentTitle=f"Artist {n}", duration="12000")
            media = ET.SubElement(track, "Media")
            ET.SubElement(media, "Part", file=str(LAB / "music" / f"{n}.mp3"))
        data = ET.tostring(page)
        self.send_response(200)
        self.send_header("Content-Type", "application/xml")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_):
        pass


class Unavailable(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(503)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_POST(self):
        self.do_GET()

    def log_message(self, *_):
        pass


def container(suffix, image, args=(), mounts=(), env=None):
    name = "pavoia-audio-check-" + str(os.getpid()) + "-" + suffix
    cmd = ["podman", "run", "--detach", "--name", name, "--label", "project=pavoia.audio-check",
           "--network=host", "--userns=host", "--user=0:0",
           "--read-only", "--tmpfs", "/tmp:rw,size=64m", "--cap-drop=ALL",
           "--log-driver=k8s-file", "--log-opt", "max-size=5mb"]
    for source, target, mode in mounts:
        cmd += ["-v", f"{source}:{target}:{mode}"]
    if env:
        envfile = LAB / (suffix + ".env")
        envfile.write_text("".join(f"{k}={v}\n" for k, v in env.items()))
        cmd += ["--env-file", str(envfile)]
    try:
        command(*cmd, image, *args, stdout=subprocess.DEVNULL)
    except BaseException:
        # A failed run can still create a container; never remove a foreign name.
        try:
            found = subprocess.run(["podman", "container", "inspect", name], capture_output=True, text=True)
            if found.returncode == 0 and json.loads(found.stdout)[0].get("Config", {}).get("Labels", {}).get("project") == "pavoia.audio-check":
                subprocess.run(["podman", "rm", "--force", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass
        raise
    CREATED.append(name)
    return name


def decode(seconds=5):
    command("ffmpeg", "-hide_banner", "-loglevel", "error", "-rw_timeout", "8000000",
            "-i", "http://127.0.0.1:14541/palac-feel.mp3", "-t", str(seconds),
            "-f", "null", "-", timeout=seconds + 15)


def history():
    with sqlite3.connect(f"file:{LAB}/state/radio.sqlite?mode=ro", uri=True) as db:
        return db.execute("SELECT event,id,started_at FROM playback ORDER BY started_at").fetchall()


def main():
    global PLAYLIST
    os.umask(0o077)
    LAB.mkdir(parents=True)
    for directory in ("state", "music"):
        (LAB / directory).mkdir()
    mock = ThreadingHTTPServer(("127.0.0.1", 14543), Plex)
    threading.Thread(target=mock.serve_forever, daemon=True).start()
    try:
        for n in range(1, 5):
            command("ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
                    f"sine=frequency={180+n*100}:duration=12", "-codec:a", "libmp3lame", "-b:a", "320k",
                    str(LAB / "music" / f"{n}.mp3"))
        ice = ET.parse(ROOT / "icecast/icecast.xml")
        ice.find("listen-socket/port").text = "14541"
        for key in ("source-password", "relay-password", "admin-password"):
            ice.find("authentication/" + key).text = TOKEN
        ice.write(LAB / "icecast.xml")
        container("icecast", "localhost/pavoia-icecast:2.5.0",
                  mounts=[(LAB / "icecast.xml", "/config/icecast.xml", "ro")])
        control = container("controller", "localhost/pavoia-controller:pilot", mounts=[
            (LAB / "state", "/state", "rw"), (LAB / "music", LAB / "music", "ro")], env={
            "PAVOIA_LISTEN": "127.0.0.1:14542", "PAVOIA_STATE_DIR": "/state",
            "PAVOIA_MUSIC_ROOT": str(LAB / "music"), "PAVOIA_PLEX_URL": "http://127.0.0.1:14543",
            "PAVOIA_PLEX_TOKEN": TOKEN, "PAVOIA_INTERNAL_TOKEN": TOKEN,
            "PAVOIA_ICECAST_URL": "http://127.0.0.1:14541"})
        until(lambda: status()["sync"]["trackCount"] == 3)
        (LAB / "radio.liq").write_text((ROOT / "ops/radio.liq").read_text().replace(":14502", ":14542").replace("port=14501", "port=14541"))
        from manage import LIQUIDSOAP
        liquid = container("liquidsoap", LIQUIDSOAP, ["/config/radio.liq"], mounts=[
            (LAB / "state", "/state", "ro"), (LAB / "music", LAB / "music", "ro"),
            (LAB / "radio.liq", "/config/radio.liq", "ro")], env={
            "PAVOIA_INTERNAL_TOKEN": TOKEN, "PAVOIA_ICECAST_SOURCE_PASSWORD": TOKEN, "TZ": "UTC"})
        until(lambda: len(history()) >= 3, seconds=60)
        decode()
        REPORT["normal_boundaries"] = len(history())
        before = len(history())
        command("podman", "stop", "-t", "5", control, stdout=subprocess.DEVNULL)
        # The decoder remains attached across several fallback boundaries.
        decode(35)
        command("podman", "start", control, stdout=subprocess.DEVNULL)
        until(lambda: len(history()) >= before + 3)
        REPORT["outage_events_recovered"] = len(history()) - before
        PLAYLIST = []
        request("/internal/sync", method="POST")
        until(lambda: json.loads(request("/status-json.xsl", port=14541)).get("icestats", {}).get("source") is None, seconds=30)
        REPORT["empty_stopped"] = True
        changed_at = int(time.time() * 1000)
        PLAYLIST = [4]
        request("/internal/sync", method="POST")
        until(lambda: (status().get("track") or {}).get("id") == "4", seconds=45)
        decode(15)
        assert all(row[1] == "4" for row in history() if row[2] > changed_at), "removed queued track played after repopulation"
        REPORT["repopulated_only_new_track"] = True
        command("podman", "stop", "-t", "5", control, liquid, stdout=subprocess.DEVNULL)
        command("podman", "start", liquid, stdout=subprocess.DEVNULL)
        until(lambda: json.loads(request("/status-json.xsl", port=14541)).get("icestats", {}).get("source") is not None, seconds=45)
        decode(12)
        REPORT["cold_cache_controller_refused"] = True
        command("podman", "stop", "-t", "5", liquid, stdout=subprocess.DEVNULL)
        unavailable = ThreadingHTTPServer(("127.0.0.1", 14542), Unavailable)
        threading.Thread(target=unavailable.serve_forever, daemon=True).start()
        try:
            command("podman", "start", liquid, stdout=subprocess.DEVNULL)
            until(lambda: json.loads(request("/status-json.xsl", port=14541)).get("icestats", {}).get("source") is not None, seconds=45)
            decode(12)
            REPORT["cold_cache_controller_503"] = True
        finally:
            unavailable.shutdown()
            unavailable.server_close()
        REPORT["passed"] = True
    finally:
        mock.shutdown()
        for name in reversed(CREATED):
            with (LAB / (name + ".log")).open("w") as log:
                subprocess.run(["podman", "logs", name], stdout=log, stderr=subprocess.STDOUT)
            subprocess.run(["podman", "rm", "--force", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        (LAB / "result.json").write_text(json.dumps(REPORT, indent=2) + "\n")
        print(json.dumps({"artifact": str(LAB), **REPORT}), flush=True)


if __name__ == "__main__":
    main()
