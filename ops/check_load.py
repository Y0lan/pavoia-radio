#!/usr/bin/env python3
"""Approved pilot acceptance: ramp to 100 audio connections, hold 15 min."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import threading
import time
import urllib.request
import urllib.parse

ROOT = Path(__file__).resolve().parents[1]
STOP = threading.Event()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--local", action="store_true", help="Test loopback HTTP; this does not validate public HTTPS")
    args = parser.parse_args()
    values = dict(line.split("=", 1) for line in (ROOT / "secrets/preview-access.txt").read_text().splitlines())
    base_url = "http://127.0.0.1:14500" if args.local else values["URL"].rstrip("/")
    url = base_url + "/stream/palac-feel.mp3"
    artifact = ROOT / "artifacts" / ("load-" + time.strftime("%Y%m%dT%H%M%S") + ".json")
    results, samples = [], []

    def listen(number):
        result = {"connection": number, "bytes": 0}
        start = time.monotonic()
        try:
            with urllib.request.urlopen(url, timeout=12) as response:
                while not STOP.is_set():
                    chunk = response.read(8192)
                    if not chunk:
                        raise EOFError("stream ended")
                    if not result["bytes"]:
                        result["firstBytesSeconds"] = round(time.monotonic() - start, 3)
                    result["bytes"] += len(chunk)
        except Exception as exc:
            result["error"] = type(exc).__name__
            result["errorDetail"] = str(exc)
            reason = getattr(exc, "reason", None)
            if reason is not None:
                result["reasonType"] = type(reason).__name__
                result["reasonCode"] = getattr(reason, "errno", getattr(reason, "code", None))
            if getattr(exc, "code", None) is not None:
                result["errorCode"] = exc.code
        result["seconds"] = round(time.monotonic() - start, 2)
        return result

    def sample(target):
        sample = {"at": time.time(), "target": target, "publicChecks": []}
        samples.append(sample)
        with urllib.request.urlopen("http://127.0.0.1:14502/api/radio/palac-feel", timeout=5) as response:
            data = json.load(response)
        sample["audience"] = data["audience"]
        if args.local:
            return
        for path in ("/api/radio/palac-feel", "/api/library/catalogue?limit=1"):
            check = {"path": path}
            sample["publicChecks"].append(check)
            start = time.monotonic()
            try:
                with urllib.request.urlopen(base_url + path, timeout=5) as response:
                    check["status"] = response.status
                    body = response.read(65537)
                if len(body) > 65536:
                    raise ValueError("public API response exceeded limit")
                public = json.loads(body)
                if path.startswith("/api/radio/"):
                    valid = public.get("stage", {}).get("id") == "palac-feel" and public.get("audience", {}).get("available") is True
                else:
                    valid = isinstance(public.get("tracks"), list) and public.get("library", {}).get("total", 0) > 0
                if not valid:
                    raise ValueError("public API returned unavailable or invalid data")
            except Exception as exc:
                check["error"] = type(exc).__name__
                check["errorDetail"] = str(exc)
                raise RuntimeError("public API failed under load: " + path) from exc
            finally:
                check["seconds"] = round(time.monotonic() - start, 3)

    started = time.time()
    futures = []
    hold_completed, error = False, None
    try:
        sample(0)
        with ThreadPoolExecutor(max_workers=100) as pool:
            try:
                for target in (10, 25, 50, 100):
                    for number in range(len(futures), target):
                        futures.append(pool.submit(listen, number))
                        time.sleep(0.15)
                    time.sleep(15)
                    sample(target)
                    print(json.dumps({"phase": "ramp", "target": target, "audience": samples[-1]["audience"], "publicChecks": samples[-1]["publicChecks"]}), flush=True)
                    if any(f.done() for f in futures):
                        raise RuntimeError("an audio connection ended during the load ramp")
                hold_started = time.monotonic()
                while time.monotonic() - hold_started < 900:
                    if any(f.done() for f in futures):
                        raise RuntimeError("an audio connection ended before the load test finished")
                    time.sleep(min(10, max(0, 900 - (time.monotonic() - hold_started))))
                    sample(100)
                hold_completed = True
            finally:
                STOP.set()
                results = [f.result(timeout=20) for f in futures]
    except BaseException as exc:
        error = {"type": type(exc).__name__, "message": str(exc)}
        raise
    finally:
        report = {"startedAt": started, "finishedAt": time.time(), "connections": results, "samples": samples,
                  "streamUrl": url, "transport": urllib.parse.urlsplit(url).scheme,
                  "scope": "loopback" if args.local else "public", "holdCompleted": hold_completed,
                  "publicAPIsChecked": not args.local,
                  "error": error,
                  "passed": hold_completed and error is None and len(results) == 100 and all("error" not in r and r["seconds"] >= 900 for r in results)}
        artifact.write_text(json.dumps(report, indent=2) + "\n")
        print(json.dumps({"artifact": str(artifact), "passed": report["passed"],
                          "streamUrl": url, "transport": report["transport"], "scope": report["scope"], "error": error,
                          "connections": len(results), "errors": sum("error" in r for r in results),
                          "bytes": sum(r["bytes"] for r in results)}), flush=True)
    if not report["passed"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
