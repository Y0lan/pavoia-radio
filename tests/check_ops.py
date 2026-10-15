#!/usr/bin/env python3
"""Run with python3 tests/check_ops.py; no host services are changed."""
import io
import json
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ops"))
import manage
import observe


class OpsChecks(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        for name, value in [("ROOT", self.root), ("NGINX", self.root / "nginx/nginx.conf")]:
            change = patch.object(manage, name, value)
            change.start()
            self.addCleanup(change.stop)

    def test_foreign_container_is_rejected(self):
        foreign = [{"Config": {"Labels": {"project": "another-service"}}}]
        with patch.object(manage.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, json.dumps(foreign))):
            with self.assertRaisesRegex(RuntimeError, "ownership"):
                manage.inspect(manage.NAMES[0])

    def test_fixed_containers_and_readonly_media(self):
        with patch.object(manage, "inspect", return_value=None), patch.object(manage, "run") as run:
            manage.create_containers()
        commands = [call.args[0] for call in run.call_args_list]
        self.assertEqual(manage.NAMES, ["pavoia-pilot-icecast", "pavoia-pilot-controller", "pavoia-pilot-liquidsoap",
                                       "pavoia-pilot-controller-dance", "pavoia-pilot-liquidsoap-dance",
                                       "pavoia-pilot-controller-bermuda-day", "pavoia-pilot-liquidsoap-bermuda-day",
                                       "pavoia-pilot-controller-bermuda-evening", "pavoia-pilot-liquidsoap-bermuda-evening",
                                       "pavoia-pilot-controller-essentials", "pavoia-pilot-liquidsoap-essentials",
                                       "pavoia-pilot-controller-etage-zero", "pavoia-pilot-liquidsoap-etage-zero",
                                       "pavoia-pilot-controller-fontanna", "pavoia-pilot-liquidsoap-fontanna",
                                       "pavoia-pilot-controller-ambiance", "pavoia-pilot-liquidsoap-ambiance",
                                       "pavoia-pilot-controller-closing", "pavoia-pilot-liquidsoap-closing"])
        self.assertEqual([command[command.index("--name") + 1] for command in commands], manage.NAMES)
        music = Path.home() / "files/plex_music_library/opus"
        for command in commands:
            self.assertIn("project=pavoia.pilot", command)
            self.assertIn("max-size=4mb", command)
            self.assertIn("--userns=host", command)
            self.assertEqual(command[command.index("--user") + 1], "0:0")
            self.assertIn("--cap-drop=ALL", command)
            self.assertIn("no-new-privileges", command)
        self.assertIn(f"{self.root}/icecast:/config:ro", commands[0])
        for index, state, suffix in [(1, "state", ""), (3, "state-dance", "-dance"), (5, "state-bermuda-day", "-bermuda-day"), (7, "state-bermuda-evening", "-bermuda-evening"), (9, "state-essentials", "-essentials"), (11, "state-etage-zero", "-etage-zero"), (13, "state-fontanna", "-fontanna"), (15, "state-ambiance", "-ambiance"), (17, "state-closing", "-closing")]:
            for command in commands[index:index+2]:
                self.assertIn(f"{music}:{music}:ro", command)
            self.assertIn(f"{self.root}/{state}:/state:rw", commands[index])
            self.assertIn("/etc/ssl/certs:/etc/ssl/certs:ro", commands[index])
            self.assertIn(f"{self.root}/{state}:/state:ro", commands[index+1])
            self.assertIn(str(self.root / f"secrets/controller{suffix}.env"), commands[index])
            self.assertIn(str(self.root / f"secrets/liquidsoap{suffix}.env"), commands[index+1])
            other = "state-dance" if state == "state" else "state"
            self.assertFalse(any(f"{self.root}/{other}:/state:" in arg for command in commands[index:index+2] for arg in command))

    def test_cron_preserves_unrelated_lines_and_is_idempotent(self):
        original = "MAILTO=owner@example.test\n0 1 * * * /unrelated/backup\n"
        current = original
        def crontab(args, **kwargs):
            nonlocal current
            if args == ["crontab", "-"]:
                current = kwargs["input"]
            return subprocess.CompletedProcess(args, 0, current)
        with patch.object(manage.subprocess, "run", side_effect=crontab):
            manage.install_cron()
            once = current
            manage.install_cron()
        self.assertEqual(once, current)
        self.assertTrue(current.startswith(original))
        self.assertEqual(current.count("@reboot"), 1)
        self.assertNotIn(" rotate ", current)
        self.assertEqual(current.count("--publish-library"), 1)
        self.assertIn("35 * * * *", current)
        self.assertEqual(current.count("discovery_sync.py"), 1)
        self.assertIn(f"\n5 * * * * /usr/bin/nice -n 10 /usr/bin/timeout -k 60 900 /usr/bin/python3 {manage.ROOT}/ops/discovery_sync.py ", current)
        self.assertIn(f"--key-file {manage.ROOT}/state/discovery/.api-key >{manage.ROOT}/artifacts/discovery-refresh.log 2>&1\n", current)

    def test_stop_then_boot_honors_maintenance(self):
        with patch.object(manage, "nginx_pid", return_value=None), patch.object(manage, "inspect", return_value={"State": {"Running": True}}), patch.object(manage, "run") as run:
            manage.stop()
        self.assertTrue((self.root / "secrets/maintenance").exists())
        self.assertEqual([call.args[0][-1] for call in run.call_args_list], list(reversed(manage.NAMES)))
        with patch.object(sys, "argv", ["manage.py", "boot"]), patch.object(manage, "start") as start:
            manage.main()
            start.assert_not_called()
            (self.root / "secrets/maintenance").unlink()
            manage.main()
            start.assert_called_once_with()

    def test_stop_covers_restart_gap_and_skips_absent_containers(self):
        # Running=false is only a snapshot; always send manual stop to owned containers.
        restarting = {"State": {"Running": False, "Restarting": True}}
        with patch.object(manage, "nginx_pid", return_value=None), patch.object(manage, "inspect", side_effect=[restarting, None, {"State": {"Running": False}}] + [None] * (len(manage.NAMES)-3)), patch.object(manage, "run") as run:
            manage.stop()
        self.assertEqual([call.args[0] for call in run.call_args_list], [
            ["podman", "stop", "-t", "10", manage.NAMES[-1]],
            ["podman", "stop", "-t", "10", manage.NAMES[-3]],
        ])

    def test_start_checks_nginx_and_clears_maintenance(self):
        manage.private_write(self.root / "secrets/maintenance", "stopped\n")
        with patch.object(manage, "create_containers"), patch.object(manage, "inspect", return_value={"State": {"Running": False}}), patch.object(manage, "nginx_pid", return_value=None), patch.object(manage, "run") as run:
            manage.start()
        self.assertFalse((self.root / "secrets/maintenance").exists())
        commands = [call.args[0] for call in run.call_args_list]
        self.assertEqual(commands[0], ["nginx", "-e", "stderr", "-p", str(self.root / "nginx"), "-c", str(manage.NGINX), "-t"])
        self.assertEqual([command[-1] for command in commands[1:1+len(manage.NAMES)]], manage.NAMES)
        self.assertEqual(commands[-1], commands[0][:-1])

    def test_update_controller_replaces_only_owned_controllers(self):
        with patch.object(sys, "argv", ["manage.py", "update-controller"]), patch.object(manage, "inspect", return_value={}) as inspect, patch.object(manage, "create_containers") as create, patch.object(manage, "run") as run:
            manage.main()
        names = ["pavoia-pilot-controller" + suffix for suffix in ("", "-dance", "-bermuda-day", "-bermuda-evening", "-essentials", "-etage-zero", "-fontanna", "-ambiance", "-closing")]
        self.assertEqual([call.args[0] for call in inspect.call_args_list], names)
        create.assert_called_once_with()
        self.assertEqual([call.args[0] for call in run.call_args_list],
                         [["podman", "rm", "-f", name] for name in names] + [["podman", "start", name] for name in names])
        with patch.object(manage, "inspect", side_effect=[{}, RuntimeError("ownership")]), patch.object(manage, "run") as run, patch.object(manage, "create_containers") as create:
            with self.assertRaisesRegex(RuntimeError, "ownership"):
                manage.update_controllers()
            run.assert_not_called()
            create.assert_not_called()

    def test_status_inspects_only_owned_radio_containers(self):
        with patch.object(sys, "argv", ["manage.py", "status"]), patch.object(manage, "inspect", return_value=None) as inspect, patch.object(manage, "nginx_pid", return_value=None), patch("builtins.print") as printed, patch.object(manage, "run") as run:
            manage.main()
        self.assertEqual([call.args[0] for call in inspect.call_args_list], manage.NAMES)
        self.assertEqual([call.args for call in printed.call_args_list], [(name, "absent") for name in manage.NAMES] + [("nginx", "stopped"), ("catalogue", "unknown (no readable sync status)")])
        run.assert_not_called()

    def test_catalogue_status_reports_age_and_staleness(self):
        status = manage.ROOT / "state/discovery/sync-status.json"
        status.parent.mkdir(parents=True)
        status.write_text("{not json")
        self.assertEqual(manage.catalogue_status(), "unknown (no readable sync status)")
        old = (manage.datetime.now(manage.timezone.utc) - manage.timedelta(hours=3)).isoformat()
        status.write_text(json.dumps({"attemptAt": old, "result": "failed", "cursor": 47974, "consecutiveFailures": 3,
                                      "error": "URLError: offline", "warnings": ["Count drift"]}))
        line = manage.catalogue_status()
        self.assertTrue(line.startswith("failed STALE | attempt 3h ago | checked never | published never | cursor 47974 | behind no | failures 3"), line)
        self.assertIn("error URLError: offline", line)
        self.assertIn("warnings Count drift", line)
        recent = (manage.datetime.now(manage.timezone.utc) - manage.timedelta(minutes=10)).isoformat()
        status.write_text(json.dumps({"attemptAt": recent, "checkedAt": recent, "result": "ok", "cursor": 53669}))
        self.assertTrue(manage.catalogue_status().startswith("ok | attempt 10m ago | checked 10m ago | published never | cursor 53669"))

    def test_generated_nginx_has_no_persistent_log(self):
        music = self.root / "files/plex_music_library/opus"
        music.mkdir(parents=True)
        preferences = self.root / "Library/Application Support/Plex Media Server/Preferences.xml"
        preferences.parent.mkdir(parents=True)
        preferences.write_text('<Preferences PlexOnlineToken="test-only"/>')
        with patch.object(manage.Path, "home", return_value=self.root), patch.object(manage, "run") as commands:
            manage.configure()
            commands.assert_not_called()
        config = manage.NGINX.read_text()
        self.assertIn("error_log /dev/null warn;", config)
        self.assertIn("access_log off;", config)
        self.assertNotIn("error.log", config)
        self.assertIn("listen 0.0.0.0:14500;", config)
        self.assertIn("listen [::]:14500;", config)
        self.assertIn("server_name pavoia.gaende.box.ca;", config)
        self.assertNotIn("auth_basic", config)
        self.assertIn("location ^~ /internal/ { return 404; }", config)
        self.assertIn("location = /healthz { return 404; }", config)
        self.assertIn("location / { return 404; }", config)
        routes = dict(re.findall(r"location = (\S+) \{\n(.*?)\n    \}", config, re.S))
        expected = {"/", "/index.html", "/app.js", "/journey.js", "/waveform.js", "/explore.js", "/style.css", "/api/library/catalogue", "/api/library/statistics", "/api/audience"}
        self.assertIn("location ^~ /api/discovery/ {", config)
        for scene in manage.SCENES:
            for suffix in ("", "/stats", "/catalogue", "/changes", "/history", "/music"):
                path = f"/api/radio/{scene['id']}{suffix}"
                expected.add(path)
                self.assertIn(f"proxy_pass http://127.0.0.1:{scene['port']};", routes[path])
            path = f"/stream/{scene['id']}.mp3"
            expected.add(path)
            self.assertIn(f"proxy_pass http://127.0.0.1:14501/{scene['id']}.mp3;", routes[path])
            self.assertIn("limit_conn pavoia_audio 90;", routes[path])
            self.assertIn("limit_conn_status 503;", routes[path])
        self.assertIn("limit_conn_zone $server_name zone=pavoia_audio:32k;", config)
        for path, body in routes.items():
            if not path.startswith("/stream/"):
                self.assertNotIn("limit_conn pavoia_audio", body)
        self.assertEqual(set(routes), expected)
        for route in routes.values():
            self.assertIn('proxy_set_header Authorization "";', route)
            self.assertIn("limit_except GET { deny all; }", route)
        self.assertEqual((self.root / "secrets/preview-access.txt").read_text(), "URL=https://pavoia.gaende.box.ca/\n")
        credentials = self.root / "secrets/credentials.json"
        values = json.loads(credentials.read_text())
        self.assertEqual(set(values), {"internal", "source", "admin"})
        # A legacy preview secret and htpasswd remain private and untouched.
        values["preview"] = "legacy-test-only"
        credentials.write_text(json.dumps(values))
        htpasswd = self.root / "secrets/htpasswd"
        htpasswd.write_text("legacy-test-only\n")
        with patch.object(manage.Path, "home", return_value=self.root):
            manage.configure()
        self.assertEqual(json.loads(credentials.read_text()), values)
        self.assertEqual(htpasswd.read_text(), "legacy-test-only\n")
        for scene in manage.SCENES:
            for service in ("controller", "liquidsoap"):
                path = self.root / f"secrets/{service}{scene['suffix']}.env"
                env = dict(line.split("=", 1) for line in path.read_text().splitlines())
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)
                if service == "controller":
                    self.assertEqual(env["PAVOIA_STAGE"], scene["id"])
                    self.assertEqual(env["PAVOIA_LISTEN"], f"127.0.0.1:{scene['port']}")
                    self.assertEqual(env["PAVOIA_STATE_DIR"], "/state")
                else:
                    self.assertEqual(env["PAVOIA_CONTROLLER_URL"], f"http://127.0.0.1:{scene['port']}")
                    self.assertEqual(env["PAVOIA_MOUNT"], f"/{scene['id']}.mp3")
                    self.assertEqual(env["PAVOIA_RADIO_NAME"], f"Pavoia - {scene['name']}")
            fallback = self.root / scene["state"] / "fallback.m3u"
            self.assertEqual(fallback.read_text(), "#EXTM3U\n")
            fallback.write_text("retained-test-cache\n")
        with patch.object(manage.Path, "home", return_value=self.root):
            manage.configure()
        for scene in manage.SCENES:
            self.assertEqual((self.root / scene["state"] / "fallback.m3u").read_text(), "retained-test-cache\n")
        icecast = ET.parse(self.root / "icecast/icecast.xml").getroot()
        self.assertEqual([mount.findtext("mount-name") for mount in icecast.findall("mount")],
                         ["/palac-feel.mp3", "/palac-dance.mp3", "/bermuda-day.mp3", "/bermuda-evening.mp3", "/essentials.mp3", "/etage-zero.mp3", "/fontanna.mp3", "/ambiance.mp3", "/closing.mp3"])
        for mount in icecast.findall("mount"):
            self.assertEqual(mount.findtext("public"), "false")
        limits = icecast.find("limits")
        self.assertEqual(limits.findtext("sources"), "9")
        queue = int(limits.findtext("queue-size"))
        burst = int(limits.findtext("burst-size"))
        self.assertEqual(queue, 524288)
        self.assertEqual(burst, 262144)
        self.assertLess(burst, queue)

    def test_observation_requires_exact_both_mounts_and_both_apis(self):
        self.enterContext(patch.object(observe, "SCENES", manage.SCENES[:2]))
        def sample(sources, failed_url=None):
            calls = []
            def respond(url, **kwargs):
                calls.append(url)
                if url == failed_url:
                    raise OSError("fixture unavailable")
                body = {"icestats": {"source": sources}} if url.endswith("status-json.xsl") else {"stage": {"name": "fixture"}}
                return io.BytesIO(json.dumps(body).encode())
            with patch.object(observe.urllib.request, "urlopen", side_effect=respond):
                result = observe.collect_sample()
            self.assertEqual(set(calls), {"http://127.0.0.1:14501/status-json.xsl", *(f"http://127.0.0.1:{s['port']}/api/radio/{s['id']}" for s in observe.SCENES)})
            return result
        dance = {"listenurl": "http://localhost:14501/palac-dance.mp3"}
        feel = {"listenurl": "http://localhost:14501/palac-feel.mp3"}
        for sources in [dance, [dance], [dance, {"listenurl": "http://localhost:14501/other/palac-feel.mp3"}]]:
            result = sample(sources)
            self.assertFalse(result["healthy"])
            self.assertFalse(result["scenes"]["palac-feel"]["sourcePresent"])
            self.assertEqual(result["scenes"]["palac-feel"]["errors"], ["sourceMissing"])
            self.assertTrue(result["scenes"]["palac-dance"]["sourcePresent"])
        result = sample([feel, dance])
        self.assertTrue(result["healthy"])
        self.assertTrue(all(not scene["errors"] for scene in result["scenes"].values()))
        result = sample([feel, dance], "http://127.0.0.1:14503/api/radio/palac-dance")
        self.assertFalse(result["healthy"])
        self.assertEqual(result["scenes"]["palac-dance"]["errors"], ["status:OSError"])
        self.assertEqual(result["scenes"]["palac-feel"]["errors"], [])
        result = sample([feel, dance], "http://127.0.0.1:14501/status-json.xsl")
        self.assertFalse(result["healthy"])
        self.assertTrue(all(scene["errors"] == ["icecast:OSError"] for scene in result["scenes"].values()))
        result = sample([{"listenurl": 7}, dance])
        self.assertFalse(result["healthy"])
        self.assertIn("icecast:AttributeError", result["scenes"]["palac-feel"]["errors"])


if __name__ == "__main__":
    unittest.main()
