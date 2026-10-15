# Palac Scenes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Switch between Palac Feel and Palac Dance with one audio element and isolated broadcast metadata/audience.

**Architecture:** Reuse the existing Go/controller and Liquidsoap once per scene, sharing Icecast and Nginx. Preserve the Feel database at state/radio.sqlite; Dance uses state-dance/radio.sqlite. No SQL schema migration.

**Tech Stack:** Go stdlib/SQLite, Liquidsoap2.4.5, Icecast2.5.0, native HTML/CSS/JS, Python stdlib operations.

## Global Constraints

- Source music and Plex stay read-only; only pilot containers/configuration may change.
- Exactly two scenes: palac-feel / Palac Feel / playlist146686 and palac-dance / Palac Dance / playlist145470.
- Default configuration and existing Feel URLs/state remain compatible.
- One audio element; change while paused does not autoplay; active change closes old audio first.
- Keep public responses free of secrets/paths and internal endpoints private/authenticated.
- No dependencies or final-brand redesign. Keep logs below100MB total.
- Preserve uncommitted Android acceptance and approved Impeccable exception. No subagent commits or production actions; coordinator owns gated commits/deployment.

### Task 1: Scene-aware controller

**Files:** main.go, controller.go, plex.go, http.go, audience.go, controller_test.go.

**Interfaces:** PAVOIA_STAGE defaults to palac-feel, accepts only the two scene IDs. Each process serves only its own /api/radio/<id> and /stats; existing /internal/* unchanged. Map stage ID to display name and playlist ID in one Go definition. Controller stage determines Icecast mount /<id>.mp3.

- [x] Add focused regression with two controllers and separate state directories; same track/event identifiers must not cross histories or counters. Confirm Dance requests /playlists/145470/items; Feel still146686. Check other-scene API returns404.
- [x] Implement a small scene value selected from PAVOIA_STAGE. Preserve zero-value test config compatibility as Feel; reject unknown configured IDs. Replace hardcoded playlist, API route, mount filter, metadata fields with that selected scene. Reuse existing scheduling/storage unchanged.
- [x] Make Icecast selection explicit, e.g. `icecastListeners(body []byte, mount string)`, update callers and existing tests. Test mixed mounts and missing selected mount rather than summing counts.
- [x] Run `/home/yolan/.local/share/mise/installs/go/1.27.1/bin/go test -race ./...` and `go vet ./...` with that same binary. Record tests and source-only limitations; task review before continuing.

### Task 2: Native scene switch

**Files:** web/index.html, web/style.css, web/app.js, tests/player.cjs.

**Interfaces:** Existing JSON status schema on GET /api/radio/<id>. Audio at /stream/<id>.mp3. Allowlisted native select IDs palac-feel/palac-dance, labels Palac Feel/Palac Dance. Default Feel.

- [x] Add select with label Scène next to heading; retain existing palette/layout and one audio. Render selected scene in heading, document.title, player accessible label and Media Session. Native select remains keyboard/touch accessible, no custom dropdown.
- [x] Route playback and polling through selected scene. In the select change handler, cancel retry/watchdog/old poll, invalidate outstanding generations, clear stale track/audience/MediaSession, release old source. If wanted, synchronously call connect inside the user gesture; otherwise stay paused. Poll new scene immediately.
- [x] Guard old fetch completion (including rejection/finally) from changing the new scene or clearing its in-flight guard. Reuse generation/AbortController; bounded one current poll. Stale play promises must not stop/reconnect the selected scene.
- [x] Extend native Node checks to cover active change, paused change, rapid Feel-Dance-Feel with late fetch/play completion and retry cancellation. Assert one src and selected metadata/audience, existing seven tests still pass. Run `node tests/player.cjs`.

### Task 3: Deploy and verify two independent broadcasts

**Files:** ops/manage.py, ops/radio.liq, ops/observe.py, tests/check_ops.py, ops/check_audio.py if needed for its existing fixture, .gitignore, .containerignore, README.md, docs/CONTRACTS.md, docs/ACCEPTANCE.md.

**Interfaces:** Feel controller127.0.0.1:14502; Dance127.0.0.1:14503. Shared Icecast14501, public Nginx14500. Existing three container names preserved; add pavoia-pilot-controller-dance and pavoia-pilot-liquidsoap-dance with project=pavoia.pilot. Dance state ROOT/state-dance; both mount their own state at /state. PAVOIA_STAGE passed to controllers. LS gains PAVOIA_CONTROLLER_URL(default14502), PAVOIA_MOUNT(default/palac-feel.mp3), PAVOIA_RADIO_NAME(defaultPavoia - Palac Feel). Same config file per process.

- [x] Extend managed scene specs to generate private envs and mount configurations, read-only music, separate states and scoped start/stop/status/update-controller. Keep Feel env filenames and container names compatible. Rootless protections and maintenance/cron behavior unchanged. Use max-size16mb for each of five containers (80MB total). Ignore state-dance/ in Git and container build context, like existing state/.
- [x] Generate exact public Dance status/stats and stream routes to its controller/mount. Preserve public internal/healthz blocking, no auth exposure, and unknown-route404. Configure two Icecast mounts/sources. Verify Python ops tests cover both state mounts, env values, routing and five-container stop/update ownership.
- [x] Update observation for both scenes: each sample checks each status endpoint and exact Icecast listenurl path; one surviving mount must not hide a missing scene. Record per-scene source presence/errors and fail the sample if either is unavailable. Coordinator preserves the old observation artifacts and starts a new24h run after deployment, honestly resetting the elapsed observation interval. Add one fixture checking that Dance alone does not count as a healthy Feel source.
- [x] Validate both Liquidsoap env variants with pinned native binary `--check`, callbacks fixture, Python ops checks and existing isolated audio integration. Inspect14503 before binding. Back up only pilot configs/binary privately before changes; retain coherent Feel DB backup.
- [x] Build Go binary with `CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -o bin/pavoia .`, upload reviewed files, build controller image, deploy scoped services. Announce any necessary brief audio interruption. Validate Nginx config before reload and never signal unrelated services.
- [x] Verify both Plex sync counts, authenticated callbacks and public JSON/mount separation. Real browser desktop/mobile viewport: switch during playback, pause then switch, rapidly switch; verify selected audio/currentTime/title and counter migration. Decode both public streams; ensure source release. Keep physical iOS and24h/public100 evidence honest. Whole-change review passed; global exact Ponytail gate required before the coordinator final commit; no push. Deliver live URL and one user listening test.
