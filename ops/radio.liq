# Each scene's source audio and cached state are mounted read-only.
# Rootless container UID 0 maps to host UID1008; Podman drops all capabilities.
settings.init.allow_root.set(true)
settings.log.file.set(false)
settings.log.stdout.set(true)
settings.log.level.set(3)
settings.server.telnet.set(false)

controller = environment.get(default="http://127.0.0.1:14502", "PAVOIA_CONTROLLER_URL")
mount = environment.get(default="/palac-feel.mp3", "PAVOIA_MOUNT")
radio_name = environment.get(default="Pavoia - Palac Feel", "PAVOIA_RADIO_NAME")
internal_token = environment.get("PAVOIA_INTERNAL_TOKEN")
headers = [("Authorization", "Bearer #{internal_token}")]
enabled = ref(false)
enabled_known = ref(false)
controller_down = ref(true)
queue_empty = ref(false)
last_event = ref("")
pending_played = ref([])
settled_events = ref([])
fallback_counter = ref(0)

def next_track() =
  if enabled_known() and not enabled() then
    null
  else
  try
    response = http.get(headers=headers, redirect=false, timeout=3., "#{controller}/internal/next")
    controller_down := response.status_code >= 500
    queue_empty := response.status_code == 204
    if response.status_code == 200 and response != "" and (not enabled_known() or enabled()) then
      request.create(string.trim(response))
    else
      null
    end
  catch _ do
    controller_down := true
    null
  end
  end
end

program = request.dynamic(id="program", available={not enabled_known() or enabled()}, prefetch=1, retry_delay=5., next_track)
cached_playlist = playlist(id="cached", mode="randomize", reload_mode="watch", prefetch=1, "/state/fallback.m3u")

def fallback_event(_) =
  fallback_counter := fallback_counter() + 1
  micros = int_of_float(time() * 1000000.)
  [("pavoia_event", "fallback-#{micros}-#{fallback_counter()}")]
end
cached = metadata.map(fallback_event, cached_playlist)
rescue = switch(track_sensitive=true, [({enabled() and (controller_down() or queue_empty())}, cached)])
radio = fallback(track_sensitive=true, [program, rescue])
radio = switch(track_sensitive=true, [({enabled()}, radio)])
fade_seconds = float_of_string(default=3., environment.get(default="3", "PAVOIA_FADE_SECONDS"))
radio = crossfade(duration=fade_seconds, fade_in=fade_seconds, fade_out=fade_seconds, radio)

def send_played() =
  # Each collection has one writer: audio callback for pending, this worker for settled.
  settled_events := list.filter(fun (event) ->
    list.exists(fun (entry) -> fst(entry) == event, pending_played()), settled_events())
  unsent = list.filter(fun (entry) -> not list.mem(fst(entry), settled_events()), pending_played())
  list.iter(fun (item) -> begin
    let (event, body) = item
    try
      response = http.post(headers=list.append(headers, [("Content-Type", "application/json")]),
        redirect=false, timeout=3., data=body, "#{controller}/internal/played")
      if response.status_code >= 200 and response.status_code < 300 then
        settled_events := list.add(event, settled_events())
      elsif list.mem(response.status_code, [400, 409, 413, 415]) then
        log(level=2, "Retiring rejected actual-start event #{event}: HTTP #{response.status_code}")
        settled_events := list.add(event, settled_events())
      end
    catch _ do () end
  end, list.prefix(8, unsent))
end

def actual_start(m) =
  event = m["pavoia_event"]
  if m["pavoia_id"] != "" and event != "" and event != last_event() then
    last_event := event
    started = time()
    millis = int_of_float(started * 1000.)
    fraction = string.of_int(digits=3, millis - (millis / 1000) * 1000)
    started_at = time.string(time=float_of_int(millis / 1000), "%Y-%m-%dT%H:%M:%S") ^ "." ^ fraction ^ "Z"
    body = json.stringify(compact=true, {
      id=m["pavoia_id"], event=event, startedAt=started_at
    })
    pending_played := list.filter(fun (entry) -> not list.mem(fst(entry), settled_events()), pending_played())
    # ponytail: 1024 in-memory starts; use a durable spool if restart recovery is required.
    if list.length(pending_played()) < 1024 then
      pending_played := list.append(pending_played(), [(event, body)])
    else
      log(level=2, "Pending actual-start queue full; dropping newest event #{event}")
    end
  end
end
radio.on_metadata(synchronous=true, actual_start)

def supervise() =
  try
    response = http.get(headers=headers, redirect=false, timeout=3., "#{controller}/internal/enabled")
    if response.status_code == 200 then
      enabled := string.trim(response) == "true"
      enabled_known := true
      if not enabled() then
        queued = program.queue()
        program.set_queue([])
        list.iter(request.destroy, queued)
        cached_playlist.reload(empty_queue=true)
      end
    else
      controller_down := controller_down() or response.status_code >= 500
    end
  catch _ do
    controller_down := true
  end
  # 503 and transport failures may use the cache only before any authoritative state.
  if controller_down() and not enabled_known() then
    enabled := cached.is_ready()
  end
end
thread.run(fast=false, every=5., supervise)
thread.run(fast=false, every=5., send_played)

output.icecast(%mp3(bitrate=320, samplerate=44100), id="palac_feel",
  host="127.0.0.1", port=14501, mount=mount,
  password=environment.get("PAVOIA_ICECAST_SOURCE_PASSWORD"),
  name=radio_name, public=false, fallible=true,
  icy_metadata=["artist", "title"], radio)
