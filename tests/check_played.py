#!/usr/bin/env python3
"""Exercise the actual Liquidsoap retry function with native mocked HTTP responses.

Run with python3 tests/check_played.py [Liquidsoap command], or emit stdin with --emit.
"""
from pathlib import Path
import subprocess
import sys

source = (Path(__file__).resolve().parents[1] / "ops/radio.liq").read_text()
retry = "def send_played() =" + source.split("def send_played() =", 1)[1].split("\ndef actual_start", 1)[0]
retry = retry.replace("http.post(", "test_post(").replace("log(", "test_log(")
actual = "def actual_start(m) =" + source.split("def actual_start(m) =", 1)[1].split("\nradio.on_metadata", 1)[0]
actual = actual.replace("time()", "test_time()").replace("log(", "test_log(")
script = '''settings.init.allow_root.set(true)
time.zone.set("UTC")
settings.log.file.set(false)
settings.log.stdout.set(true)
settings.log.level.set(3)
controller = "fixture"
headers = []
pending_played = ref([])
settled_events = ref([])
seen = ref([])
statuses = ref([])
warnings = ref([])
last_event = ref("")
clock_calls = ref(0)
clock_value = ref(1791252000.125)
def test_time() =
  clock_calls := clock_calls() + 1
  clock_value()
end
transport_error = error.register("fixture_transport")
def test_log(~level, message) =
  assert(level == 2)
  warnings := list.add(message, warnings())
end
def test_post(~headers:_, ~redirect:_, ~timeout:_, ~data, _) =
  seen := list.add(data, seen())
  status = list.assoc(default=204, data, statuses())
  if status == 0 then error.raise(transport_error, "connection refused") end
  {status_code=status}
end
''' + retry + actual + '''
pending_played := []
actual_start([("pavoia_id", "1"), ("pavoia_event", "same-second-first")])
assert(clock_calls() == 1)
assert(string.contains(substring="2026-10-06T02:00:00.125Z", snd(list.hd(pending_played()))))
clock_value := 1791252000.750
actual_start([("pavoia_id", "1"), ("pavoia_event", "same-second-later")])
assert(clock_calls() == 2)
assert(string.contains(substring="2026-10-06T02:00:00.750Z", snd(list.last(pending_played()))))
clock_value := 1791252001.007
actual_start([("pavoia_id", "1"), ("pavoia_event", "next-second-padded")])
assert(clock_calls() == 3)
assert(string.contains(substring="2026-10-06T02:00:01.007Z", snd(list.last(pending_played()))))

terminal_codes = [400, 409, 413, 415, 400, 409, 413, 415]
terminal_events = list.mapi(fun (i, _) -> ("terminal-#{i}", "terminal-#{i}"), terminal_codes)
statuses := list.mapi(fun (i, code) -> ("terminal-#{i}", code), terminal_codes)
pending_played := list.append(terminal_events, [("valid", "valid")])
send_played()
assert(list.length(seen()) == 8)
assert(not list.mem("valid", seen()))
assert(list.length(settled_events()) == 8)
assert(list.length(warnings()) == 8)
send_played()
assert(list.mem("valid", seen()))
assert(list.mem("valid", settled_events()))
assert(list.length(seen()) == 9)

statuses := [("auth", 401), ("rate", 429), ("db", 503), ("transport", 0)]
pending_played := list.map(fun (item) -> (fst(item), fst(item)), statuses())
settled_events := []
seen := []
send_played()
send_played()
assert(settled_events() == [])
assert(list.length(seen()) == 8)
statuses := []
send_played()
assert(list.length(settled_events()) == 4)
assert(list.length(seen()) == 12)
print("CALLBACK RETRY CHECK OK")
'''

if __name__ == "__main__":
    if sys.argv[1:] == ["--emit"]:
        print(script, end="")
    else:
        result = subprocess.run(sys.argv[1:] or ["liquidsoap", "-"], input=script, text=True, capture_output=True)
        output = result.stdout + result.stderr
        # No audio outputs are created; Liquidsoap exits 1 after the assertions.
        assert "CALLBACK RETRY CHECK OK" in output, output
        assert result.returncode == 0 or (result.returncode == 1 and "No output defined, nothing to do" in output), output
        print("CALLBACK RETRY CHECK OK")
