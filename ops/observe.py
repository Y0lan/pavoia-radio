#!/usr/bin/env python3
"""Persist 24 hours of local source/API availability without adding listeners."""
import json
from pathlib import Path
import time
import urllib.parse
import urllib.request
from manage import SCENES

ROOT = Path(__file__).resolve().parents[1]


def collect_sample():
    sample = {"at": time.time(), "scenes": {}}
    sources, icecast_error = [], None
    try:
        with urllib.request.urlopen("http://127.0.0.1:14501/status-json.xsl", timeout=5) as response:
            sources = json.load(response).get("icestats", {}).get("source") or []
        if isinstance(sources, dict):
            sources = [sources]
    except Exception as exc:
        icecast_error = "icecast:" + type(exc).__name__
    for scene in SCENES:
        state = {"sourcePresent": False, "errors": []}
        sample["scenes"][scene["id"]] = state
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{scene['port']}/api/radio/{scene['id']}", timeout=5) as response:
                state["radio"] = json.load(response)
        except Exception as exc:
            state["errors"].append("status:" + type(exc).__name__)
        try:
            state["sourcePresent"] = any(
                urllib.parse.urlsplit(source.get("listenurl", "")).path == f"/{scene['id']}.mp3"
                for source in sources if isinstance(source, dict)
            )
        except (AttributeError, TypeError, ValueError) as exc:
            state["errors"].append("icecast:" + type(exc).__name__)
        if icecast_error:
            state["errors"].append(icecast_error)
        elif not state["sourcePresent"]:
            state["errors"].append("sourceMissing")
    sample["healthy"] = all(state["sourcePresent"] and not state["errors"] for state in sample["scenes"].values())
    return sample


def main():
    directory = ROOT / "artifacts" / ("observation-" + time.strftime("%Y%m%dT%H%M%S"))
    directory.mkdir(parents=True)
    started = time.time()
    deadline = time.monotonic() + 86400
    failures = 0
    samples = 0
    with (directory / "samples.jsonl").open("a", buffering=1) as output:
        while time.monotonic() < deadline:
            sample = collect_sample()
            if not sample["healthy"]:
                failures += 1
            samples += 1
            output.write(json.dumps(sample) + "\n")
            summary = {"startedAt": started, "lastSampleAt": sample["at"], "samples": samples,
                       "failedSamples": failures, "complete": False,
                       "scope": f"30-second local source/API samples for {len(SCENES)} stations; no audio decoder or physical device"}
            (directory / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
            time.sleep(min(30, max(0, deadline - time.monotonic())))
    summary["complete"] = True
    summary["finishedAt"] = time.time()
    (directory / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")


if __name__ == "__main__":
    main()
