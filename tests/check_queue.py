#!/usr/bin/env python3
"""Exercise the actual Liquidsoap queue and fallback decision. Use --emit for a container."""
from pathlib import Path
import re,subprocess,sys
source=(Path(__file__).resolve().parents[1]/'ops/radio.liq').read_text()
next_track='def next_track() ='+source.split('def next_track() =',1)[1].split('\nprogram =',1)[0]
next_track=next_track.replace('http.get(', 'test_get(')
supervise='def supervise() ='+source.split('def supervise() =',1)[1].split('\nthread.run',1)[0]
supervise=supervise.replace('http.get(', 'test_get(')
predicate=re.search(r'rescue = switch.*?\[\(\{(.*?)\}',source).group(1)
script='''settings.init.allow_root.set(true)
settings.log.file.set(false)
controller="fixture"
headers=[]
enabled=ref(true)
enabled_known=ref(true)
controller_down=ref(false)
queue_empty=ref(false)
status=ref(204)
enabled_body=ref("true")
program=().{queue=fun () -> [], set_queue=fun (_) -> ()}
cached_playlist=().{reload=fun (~empty_queue:_) -> ()}
cached=().{is_ready=fun () -> true}
def test_get(~headers:_, ~redirect:_, ~timeout:_, endpoint) =
  if string.contains(substring="/enabled", endpoint) then
    enabled_body().{status_code=200}
  else
    "/fixture.mp3".{status_code=status()}
  end
end
'''+next_track+supervise+'''
def allow_rescue() = '''+predicate+''' end
let _ = next_track()
supervise()
assert(allow_rescue())
enabled := false
assert(not allow_rescue())
enabled := true
status := 200
let _ = next_track()
assert(not allow_rescue())
status := 503
let _ = next_track()
assert(allow_rescue())
supervise()
assert(allow_rescue())
status := 200
let _ = next_track()
assert(not allow_rescue())
enabled_body := "false"
supervise()
assert(not allow_rescue())
print("QUEUE RECOVERY CHECK OK")
'''
if sys.argv[1:]==['--emit']:print(script,end='')
else:
 result=subprocess.run(sys.argv[1:] or ['liquidsoap','-'],input=script,text=True,capture_output=True)
 output=result.stdout+result.stderr
 assert 'QUEUE RECOVERY CHECK OK' in output,output
 assert result.returncode==0 or (result.returncode==1 and 'No output defined, nothing to do' in output),output
 print('QUEUE RECOVERY CHECK OK')
