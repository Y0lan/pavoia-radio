#!/usr/bin/env python3
"""Mocked acceptance-script checks: no network, containers or real waiting."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.error
from unittest.mock import patch


OPS = Path(__file__).resolve().parents[1] / "ops"
# The ops scripts import their siblings (manage, deploy_web), as they do when run as scripts.
sys.path.insert(0, str(OPS))


def load(name):
    spec = importlib.util.spec_from_file_location(name, OPS / (name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


check_load = load("check_load")
check_audio = load("check_audio")
manage = load("manage")


class Future:
    def __init__(self, number, record=None):
        self.number = number
        self.record = record

    def done(self):
        return self.record is not None

    def result(self, timeout):
        return self.record if self.record is not None else {"connection": self.number, "bytes": 8192, "seconds": 1000}


class Pool:
    def __init__(self, **kwargs):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *args):
        pass

    def submit(self, listener, number):
        return Future(number)


class AcceptanceChecks(unittest.TestCase):
    def run_load(self, interrupted, local, connection_error=None, public_error=False):
        clock = [0.0]
        sample_count, hold_start = [0], [None]
        def sample(*args, **kwargs):
            if args[0].endswith("/stream/palac-feel.mp3") and connection_error is not None:
                raise connection_error
            if args[0].startswith("https://"):
                if public_error and sample_count[0] >= 3:
                    raise urllib.error.URLError(ConnectionResetError(104, "public reset"))
                data = {"stage":{"id":"palac-feel"},"audience":{"available":True}} if "/api/radio/" in args[0] else {"tracks":[],"library":{"total":90536}}
                response = io.BytesIO(json.dumps(data).encode())
                response.status = 200
                return response
            sample_count[0] += 1
            if sample_count[0] == 5:
                hold_start[0] = clock[0]
            if interrupted and hold_start[0] is not None and clock[0] - hold_start[0] >= 890:
                raise RuntimeError("simulated late status outage")
            return io.BytesIO(b'{"audience":{"listeners":100}}')
        class TestingPool(Pool):
            def submit(self, listener, number):
                if number == 0 and connection_error is not None:
                    return Future(number, listener(number))
                return super().submit(listener, number)
        with tempfile.TemporaryDirectory() as directory, contextlib.ExitStack() as stack:
            root = Path(directory)
            (root / "secrets").mkdir()
            (root / "artifacts").mkdir()
            (root / "secrets/preview-access.txt").write_text("URL=https://preview.example.test/\n")
            stack.enter_context(patch.object(check_load, "ROOT", root))
            stack.enter_context(patch.object(check_load, "STOP", threading.Event()))
            stack.enter_context(patch.object(check_load, "ThreadPoolExecutor", TestingPool))
            stack.enter_context(patch.object(check_load.time, "monotonic", side_effect=lambda: clock[0]))
            stack.enter_context(patch.object(check_load.time, "time", side_effect=lambda: clock[0]))
            stack.enter_context(patch.object(check_load.time, "sleep", side_effect=lambda seconds: clock.__setitem__(0, clock[0] + seconds)))
            stack.enter_context(patch.object(check_load.urllib.request, "urlopen", side_effect=sample))
            stack.enter_context(patch.object(sys, "argv", ["check_load.py"] + (["--local"] if local else [])))
            stack.enter_context(contextlib.redirect_stdout(io.StringIO()))
            if interrupted or connection_error is not None or public_error:
                message = "late status outage" if interrupted else "public API failed" if public_error else "audio connection ended"
                with self.assertRaisesRegex(RuntimeError, message):
                    check_load.main()
            else:
                check_load.main()
            report = json.loads(next((root / "artifacts").glob("*.json")).read_text())
            return report, clock[0]

    def test_interrupted_hold_cannot_pass_despite_old_connections(self):
        report, elapsed = self.run_load(interrupted=True, local=False)
        self.assertAlmostEqual(elapsed - report["samples"][4]["at"], 890)
        self.assertEqual(len(report["connections"]), 100)
        self.assertTrue(all(item["seconds"] >= 900 for item in report["connections"]))
        self.assertFalse(report["holdCompleted"])
        self.assertFalse(report["passed"])
        self.assertEqual(report["error"], {"type": "RuntimeError", "message": "simulated late status outage"})
        self.assertEqual(report["streamUrl"], "https://preview.example.test/stream/palac-feel.mp3")
        self.assertEqual(report["transport"], "https")
        self.assertEqual(report["scope"], "public")

    def test_completed_local_hold_reports_loopback_http(self):
        report, elapsed = self.run_load(interrupted=False, local=True)
        self.assertAlmostEqual(elapsed - report["samples"][4]["at"], 900)
        self.assertAlmostEqual(report["samples"][4]["at"] - report["startedAt"], 75)
        self.assertTrue(report["holdCompleted"])
        self.assertTrue(report["passed"])
        self.assertIsNone(report["error"])
        self.assertEqual(report["streamUrl"], "http://127.0.0.1:14500/stream/palac-feel.mp3")
        self.assertEqual(report["transport"], "http")
        self.assertEqual(report["scope"], "loopback")

    def test_failed_connection_retains_underlying_error(self):
        failure = urllib.error.URLError(ConnectionResetError(104, "connection reset"))
        report, _ = self.run_load(interrupted=False, local=False, connection_error=failure)
        connection = report["connections"][0]
        self.assertFalse(report["passed"])
        self.assertEqual(connection["error"], "URLError")
        self.assertIn("connection reset", connection["errorDetail"])
        self.assertEqual(connection["reasonType"], "ConnectionResetError")
        self.assertEqual(connection["reasonCode"], 104)

    def test_public_api_reset_fails_while_audio_survives(self):
        report, _ = self.run_load(interrupted=False, local=False, public_error=True)
        self.assertFalse(report["passed"])
        self.assertFalse(report["holdCompleted"])
        self.assertTrue(report["publicAPIsChecked"])
        self.assertEqual(len(report["connections"]), 25)
        self.assertEqual(report["samples"][-1]["publicChecks"][0]["error"], "URLError")
        self.assertTrue(all("error" not in connection for connection in report["connections"]))

    def test_public_hold_requires_both_public_apis(self):
        report, _ = self.run_load(interrupted=False, local=False)
        self.assertTrue(report["passed"])
        self.assertTrue(all(len(sample["publicChecks"]) == 2 for sample in report["samples"]))
        self.assertTrue(all(check["status"] == 200 for sample in report["samples"] for check in sample["publicChecks"]))

    def test_partial_container_failure_cleans_only_owned_name_and_keeps_error(self):
        for label, cleanup_error in [("pavoia.audio-check", False), ("another-project", False), ("pavoia.audio-check", True)]:
            with self.subTest(label=label, cleanup_error=cleanup_error):
                original = RuntimeError("original run failure")
                data = json.dumps([{"Config": {"Labels": {"project": label}}}])
                def native(args, **kwargs):
                    if args[1:3] == ["rm", "--force"] and cleanup_error:
                        raise OSError("cleanup failed")
                    return subprocess.CompletedProcess(args, 0, data)
                with patch.object(check_audio, "command", side_effect=original), patch.object(check_audio.subprocess, "run", side_effect=native) as run:
                    with self.assertRaises(RuntimeError) as raised:
                        check_audio.container("failure", "test-image")
                self.assertIs(raised.exception, original)
                commands = [call.args[0] for call in run.call_args_list]
                name = "pavoia-audio-check-" + str(check_audio.os.getpid()) + "-failure"
                self.assertEqual(commands[0], ["podman", "container", "inspect", name])
                self.assertEqual(commands[1:], [["podman", "rm", "--force", name]] if label == "pavoia.audio-check" else [])


class AudioConfigurationChecks(unittest.TestCase):
    def test_lab_config_uses_current_path_and_separate_ports(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);lab=root/'lab'
            (root/'icecast').mkdir();(root/'ops').mkdir()
            (root/'icecast/icecast.xml').write_text('<icecast><listen-socket><port>14501</port></listen-socket><authentication><source-password/><relay-password/><admin-password/></authentication></icecast>')
            (root/'ops/radio.liq').write_text((check_audio.ROOT/'ops/radio.liq').read_text())
            calls={}
            def container(suffix,*args,**kwargs):
                calls[suffix]=kwargs
                if suffix=='liquidsoap':raise RuntimeError('configuration ready')
                return suffix
            with patch.object(check_audio,'ROOT',root),patch.object(check_audio,'LAB',lab), \
                 patch.object(check_audio,'container',side_effect=container),patch.object(check_audio,'command'), \
                 patch.object(check_audio,'until'),patch.object(check_audio,'ThreadingHTTPServer') as server, \
                 patch.object(check_audio.threading,'Thread'),patch.object(check_audio.os,'umask'), \
                 patch.dict(sys.modules,{'manage':manage}),contextlib.redirect_stdout(io.StringIO()):
                with self.assertRaisesRegex(RuntimeError,'configuration ready'):check_audio.main()
            iceport=int(check_audio.ET.parse(lab/'icecast.xml').find('listen-socket/port').text)
            env=calls['controller']['env']
            controller_port=int(env['PAVOIA_LISTEN'].split(':')[-1])
            plexport=server.call_args.args[0][1]
            self.assertEqual(len({iceport,controller_port,plexport}),3)
            self.assertTrue({iceport,controller_port,plexport}.isdisjoint({14501,*(s['port'] for s in manage.SCENES)}))
            self.assertEqual(env['PAVOIA_ICECAST_URL'],f'http://127.0.0.1:{iceport}')
            self.assertEqual(env['PAVOIA_PLEX_URL'],f'http://127.0.0.1:{plexport}')
            liquid=(lab/'radio.liq').read_text()
            self.assertIn(f'http://127.0.0.1:{controller_port}',liquid)
            self.assertIn(f'port={iceport}',liquid)


if __name__ == "__main__":
    unittest.main()
