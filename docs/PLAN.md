# Palac Feel pilot

User approved: Liquidsoap + Icecast, Go + SQLite, playlist 146686 (Palac Feel).
Source library and all music files MUST remain unchanged. New isolated workspace,
no modifications to the old repository or unrelated Whatbox services. Latest user
decision: public listening without a password at https://pavoia.gaende.box.ca/.

## Global constraints
- All music mounts read-only; never modify audio or tags. No Plex tokens, file paths,
  listener IPs or internal credentials in public JSON or browser assets.
- Keep audio independent of website and Plex availability. HTTP audio streams go
  through Nginx to Icecast, not through the Go control service.
- Native HTML audio pilot, no frontend framework, no external analytics.
- Private control APIs authenticated; passwords generated outside tracked state.
- No commit/push hook bypass. Preserve Plex, Flood, all unrelated services/crons.

## Task 1: Go control service
Go + modernc.org/sqlite. Atomic Plex playlist import every 5 minutes, complete
pagination verified, retaining previous data on failures; valid empty playlist
must be represented, not confused with failure. Read Plex XML using server-side
token. Verify paths beneath configured music root, regular existing audio files.
Read Plex playlist 146686. SQLite owns cached tracks, cycle selections, playback
history, audience samples and daily aggregates. Preserve data across restarts.
Select shuffled cycle without repeats, avoid last 3 artists where feasible; next
selection is NOT a playback. Record actual starts via Liquidsoap callbacks.
Export annotated fallback M3U atomically after successful sync. Reserve queued
tracks separately from played history; bounded retries for missing files.
API contracts in CONTRACTS.md. Poll Icecast /status-json.xsl every 10 seconds;
only mount /palac-feel.mp3. Distinguish zero from missing, no bridging collection
gaps >20 seconds. Stats: current, peak, estimated listener hours. Raw samples 30
days; daily aggregates retained. Consistent SQLite backup daily, retain 7.
Use net/http server, timeouts, bounded request bodies, graceful stop. Public
responses minimal sanitized data; public routes read-only. Internal auth bearer.
Focused tests for atomic import failures/pagination/path containment, scheduling,
actual-start idempotency, audience gaps/zero, restart persistence and public
data redaction. Run go test -race ./... and go vet ./....

## Task 2: Listening page
Native HTML/CSS/JS. French, simple Pavoia-inspired warm cream, charcoal, restrained
peach; named Palac Feel, no neon, emojis, fake equalizers or invented imagery.
Functional prototype, not final visual identity. One audio element, play/pause,
current broadcast title/artist, connection state, small audience counter. No
autoplay. Pause cancels retries and removes src to close connection. Resume joins
live. Controlled reconnect backoff, no duplicate streams. Handle rejected play()
honestly. Media Session where available, accessible controls/focus/contrast,
reduced-motion respect. Poll status 10s; handle stale/error distinctly from zero.
Use textContent for metadata. Follow CONTRACTS.md, write web/ only.

## Task 3: Audio and deployment
Rootless Podman services: Go, Liquidsoap 2.4.5 and Icecast 2.5.0. Build from official
upstreams and lock release versions/digests. Existing Nginx routes dedicated radio
listener 14500 to loopback app/audio ports, keeps file service 15801 unchanged.
Public listening at Nginx as explicitly requested by the user, HTTPS at Whatbox ingress.
MP3 320kbps, server-side 3-second transition adjustable by config. Liquidsoap
request.dynamic uses Go next endpoint; actual played metadata callback after
crossfade; cached M3U fallback when controller unavailable. Stage-disabled/empty
playlist must not silently keep playing removed tracks. Config checks before
start. No network exposure of internal APIs or Icecast admin/source credentials.
Restart policies and one scoped @reboot entry; no systemd on host. Bound radio logs
to <100MB total, test rotation. Consistent backup/restore and scoped stop/start.

## Task 4: Acceptance and handoff
Local tests, configuration checks, real decoded stream and track boundary check,
Plex/controller failures, pause/disconnect audience behavior, gradual load test to
100 listeners for 15 minutes. External HTTPS start latency target <3s on stable
connection. No claim of real iOS/Android locked-screen success without a physical
device test. Start a 24-hour observation with persisted evidence; only claim it
passed after actual elapsed time. User listens before expanding to other scenes.
Document exact URL/access method, service state, tests, pending physical/24h checks.
