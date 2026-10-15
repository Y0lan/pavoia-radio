# Pavoia Radio: continuation prompt

You are taking over Pavoia Radio for Yolan / GAENDE. Read this document first,
then inspect the working tree and live services. Continue the existing project.
Do not restart the project or replace the frontend without a concrete reason.

## Immediate objective

Finish a reliable, beautiful radio and a connected music explorer, in small,
reviewable steps. The user has many ideas and wants quality and frequent visual
checkpoints. They also authorized autonomous implementation: do useful work,
finish each agreed increment, and avoid repeated permission questions.

The latest request was to publish the reviewed player and leave this handoff.
Deployment results are recorded in the release section below. Verify live state
before making further operational changes.

## The bigger picture

This is a personal declaration of love for Pavoia. GAENDE spent years collecting
music into playlists named after the festival's stages, so the festival can keep
playing between editions. The approved phrase is **"So it never ends."**

The three original goals, in order:

1. Stream the selected Plex playlists continuously, with smooth, fast and reliable
   listening on desktop, Android and iOS, including locked-screen playback.
2. Make the collection explorable: artists, labels, releases, tracks, musical
   connections, selection history and useful statistics. Help visitors discover
   music and help GAENDE understand his selections.
3. Later, stream actual festival sets in high quality through hardware bought for
   that purpose. Plan this only after radio listening and exploration work well.

Listen should answer "What am I hearing?" Explore should explain the music,
its connections and the collection. This is one connected application with a
persistent player, not nine separate dashboard applications.

## What changed from the old vision

Original reference: https://github.com/Y0lan/pavoia-webradio-v2 . Its source and
large specification were reviewed; they were not complete or proven production
features. `docs/FEATURE_REVIEW_2026-10-07.md` records the comparison at old commit
`6fd53fee208595a45d12bfc29ec293f1dbd60d81`.

The current implementation deliberately uses Go, SQLite, Liquidsoap, Icecast,
Nginx and plain HTML/CSS/JavaScript. It does not restore the old MPD/browser
crossfade architecture or adopt a framework just to match v2. Playback reliability
came first. Status uses polling, so the Whatbox WebSocket option is not needed.

The user supplied a much larger Go Deeper inventory. They later clarified that
it is a wishlist to adapt, not a specification approved line by line. Read
`docs/FEATURE_LIST_DRAFT.md` and `docs/GO_DEEPER_SCOPE_DRAFT.md`; distinguish explicit
user decisions from candidate details. No protected admin interface is requested.

Track Hunt was initially going to have a public introduction and discovery feed.
The user then explicitly asked to hide Track Hunt from the site. It remains an
important data source and future highlight-synchronization partner. Do not restore
its public branding or module without confirming that newer direction.

Full-library research is not a prerequisite. Only playlist items are broadcast.
Fetch owned album siblings when needed to show unselected tracks. There is already
a full-library metadata helper, but this does not justify researching every file.

## Current visual decisions

The user revised the frontend and continues to refine it. Preserve their changes.
Use the official Pavoia website's photos and identity, with approved GAENDE assets.
Do not source stage pictures from the user's Drive. The press kit is a branding
reference, not permission to substitute its photographs for the stages.

The listening view uses a full-screen stage photograph with softly blended cover
art and artist portraits. The user specifically rejected boxed artwork, cards,
fake vignettes and panel-heavy layouts. They liked the painted blend. The latest
refinement uses normal opacity, preserves cover colors and sharpness, and fades
all image edges to transparency. Do not revert to screen/luminosity blending that
washed out bright covers or produced color artifacts. The stage remains visible.

Fonts are the approved Pavoia identity: Instrument Serif, Inter and JetBrains Mono.
Scoped Impeccable exceptions exist. Do not replace approved fonts because a generic
audit calls them common. Original photos and music files remain unchanged.

Current layout: one horizontal bottom player with cover, play/pause, title,
clickable artists, live waveform, timing/progress and volume. Small screens retain
one row; timing and playback status are visually hidden there. Go deeper sits by
Live in the header. The language selector has no filled background. The bottom
Gaende logo and site footer were removed at the user's request. The personal letter
and its signature remain. Spotify links have the Spotify logo and this message:
"Follow this playlist on Spotify" / "I add new tracks every day," with German copy.

The old Listen accordions were rejected and removed: Explore the selection,
How the selection changes, and Listening together. Their data and APIs remain.
Do not restore those panels. Build their future experience inside a coherent Explore.

All interface copy must be English/German. Source biographies are currently English;
the German UI identifies that limitation. The user rejects generic AI-looking design.

## Source, hosting and access

| Item | Location |
| --- | --- |
| Current source | `/home/yolan/Projects/pavoia-radio` |
| Public radio | `https://pavoia.gaende.box.ca/` |
| Local preview | `http://127.0.0.1:14521/` |
| Local discovery backend | `http://127.0.0.1:14522/` |
| SSH | `ssh -F /home/yolan/.ssh/config -o BatchMode=yes whatbox` |
| Whatbox project | `~/pavoia-radio`, resolving to `/mnt/mpathj/yolan/pavoia-radio` |
| Music, never modify | `~/files/plex_music_library/opus` on Whatbox |
| Plex | Same Whatbox server, loopback port `31711` |
| Public app route | Whatbox Manage Links: `pavoia.gaende.box.ca`, port `14500` |

Whatbox terminates public HTTPS. The radio's owned Nginx listens on 14500, Icecast
on loopback 14501, and seven station controllers on 14502 through 14508.
Rootless Podman manages the controller/Liquidsoap pairs and shared Icecast.
Container ownership label: `project=pavoia.pilot`.

`web/` is the actual frontend, embedded into the Go executable. Editing remote
HTML alone does not publish it. Build the executable/image and replace the
appropriate controller. `design/` contains earlier mockups and local preview tools.

Important files:

- `web/index.html`, `style.css`, `app.js`, `journey.js`, `waveform.js`: layout,
  playback lifecycle, discovery navigation and optional live visualization.
- `main.go`, `controller.go`, `plex.go`, `http.go`, `catalogue.go`, `changes.go`,
  `artwork.go`, `discovery.go`: configuration, sync, APIs, history and metadata.
- `ops/manage.py`, `radio.liq`, `catalogue_inventory.py`, `discovery_sync.py`:
  owned services, broadcast selection, full-library helper and Hermes import.
- `docs/PLAYER_DISCOVERY_STEP.md`, `CATALOGUE_AUDIT_2026-10-08.md`,
  `FEATURE_LIST_DRAFT.md`, `GO_DEEPER_SCOPE_DRAFT.md`: implementation and decisions.
- `docs/PROGRESS.md`, `ACCEPTANCE.md`, `WHATBOX_CAPACITY.md`: operations and limits.

The branch is `feat/palac-scenes`; the old Git HEAD is
`8ba2fd2ff66341bce4f8b36b2c4aebf262bddb84`. Many delivered files remain modified or
untracked. There is no configured Git remote in this checkout. The old GitHub v2
repository is not the current source of truth. Preserve the working tree. Do not
reset, clean, stage everything or force-push. Release archives preserve the actual
published code. Before any commit/push, the mandatory Ponytail hook must pass.

## Stations and selection semantics

| Public station | Plex playlist | Meaning / Spotify |
| --- | --- | --- |
| Lost in Feelings | `146686` | Palac interior, slow/emotional/melancholic/hypnotic; `4ZyQd8CWhF3uO8C6sHcACS` |
| Night in Motion | `145470` | Same Palac stage, peak-time dance; `7kl1EQc1ZnvLq8vZXH3qaJ` |
| Under the Sun | `146377` | Bermuda before 18:00, outdoor/day; `72rXpksfahfeQ7h1Xge02n` |
| As Night Begins | `145468` | Bermuda after 18:00, sunset/night; `1OIvw3QkFGru27JDgXK49d` |
| Essentials | `147167`, Plex `❤️ Tracks` | GAENDE's most loved tracks; `5X4mHMKyWISt9RldrxuDb8` |
| Etage 0 | `145471` | Live; no supplied Spotify playlist mapping |
| Fontanna | `145469` | Live; no supplied Spotify playlist mapping |

Spotify playlist URLs are `https://open.spotify.com/playlist/<ID>`. These are
curator destinations, not proof of complete track-for-track synchronization.
GAENDE is adding tracks to Spotify daily. Never invent mappings for other stages.

Selected means membership in a radio playlist. Favorite/Essentials means membership
in playlist 147167. Plex star ratings are another source signal and must not be
silently substituted for either. The user clarified this distinction explicitly.

Approved but NOT implemented: add Ambiance from `145472` and Closing from `162463`.
Combine Fontanna `145469` with MINIMAL `162633`; combine Etage 0 `145471` with
FAST DARK MINIMAL `147259`. Deduplicate within each station by Plex identity.
This produces nine stations from eleven source playlists. Closing is a curated
station, not the later festival live-input feature.

## What already works

Seven continuous MP3 320 kbit/s stations, shuffled selection, recent-artist
avoidance and three-second server crossfade. Native browser playback has bounded
reconnects and stall handling. Pause closes the connection; resume rejoins live.
Switching a station while paused stays paused. Media Session supplies lock-screen
metadata/controls. Earlier desktop and Android locked-screen listening were
confirmed by the user. Physical iPhone validation is still pending.

Real audio-connection counts, daily listener statistics and listener-hours are
recorded. They are not unique human counts; gaps are unknown, not zero. Playback
history and observed playlist membership changes are stored. Plex playlist sync
runs every five minutes. A separate hourly helper maintains the full-library
metadata snapshot. Failed imports retain previous good data.

Go deeper opens a working entity/search dialog. Tracks connect to artists,
releases and labels; profiles show available images, bios, verified links and
bounded relationships. Navigation preserves live playback. Browser history works.
This is a prototype connection diagram, not the full interactive universe.

The waveform uses a separate `captureStream()` audio tap and recent RMS levels.
Native audio never goes through its AudioContext. Unsupported browsers, reduced
motion and paused playback show a static line. Hidden pages stop visualization.
Do not break mobile background audio to add visual effects. No microphone access,
second broadcast connection, fake waveform or simulated listener count is used.

## Data: source, location and limitations

### Plex and the radio on Whatbox

Plex is authoritative for playable owned files and playlist membership. It is not
on Hermes. Radio music is mounted read-only. Each station has a separate SQLite
state directory: `state`, `state-dance`, `state-bermuda-day`, `state-bermuda-evening`,
`state-essentials`, `state-etage-zero`, `state-fontanna`.

The full-library scan previously found 90,536 tracks and 9,799 albums. Those are
historical scan counts, not current totals. It supplies metadata, not a researched
artist universe or broadcast eligibility. The user does not require complete
external discographies. Owned unselected album tracks should eventually remain
visible but subdued and support previews.

### Hermes / Track Hunt

Track Hunt is GAENDE's release-by-release discovery series, published as Instagram
Stories with artists, label, artwork, excerpts and keeper selections. Musical
choices are GAENDE's. Hermes automates research/rendering, not the musical taste.
The public site currently hides the Track Hunt brand, by explicit request.

Hermes reported these paths on ITS server, not Whatbox:

- `/opt/data/work/track-hunt-source`: rendering code, `docs/DATA_CONTRACT.md`.
- `/opt/data/work/track-hunt-ops`: daily Python routines and `th_lib.py`.
- `/opt/data/integrations/track-hunt/`: Hunt entries, assets, exports and Instagram data.
- `instagram/handles.db` under that directory: researched social handles/provenance.
- GBrain: projects/track-hunt, people/artists and companies/record-labels.

These paths were reported by Hermes. This session did not obtain SSH access to
that machine or change its publication routine. Do not assume direct access.

Supplied export: `/home/yolan/Downloads/Telegram Desktop/pavoia-catalogue-2026-10-08`.
Its manifest has checksums, counts and a change cursor. Snapshot size is about
56 MiB. The radio imported and incrementally updated it into a 68 MiB SQLite cache:
`artifacts/player-discovery-step/state/discovery/catalogue.sqlite` locally;
`~/pavoia-radio/state/discovery/catalogue.sqlite` is the production destination.

The imported cache contains 5,910 tracks, 2,224 releases, 4,337 artists, 783 labels
and seven playlists at cursor 47974. It covers radio selections, not full albums
or the entire Plex library. The initial export cursor was 47971. Counts and dates
are snapshot facts; refresh before stating them as current upstream coverage.

Hermes API base:
`https://gaende-slave-5720.agents.nousresearch.com/api/plugins/pavoia-catalogue/v1`.
It is read-only. `ops/discovery_sync.py` handles manifest validation, ordered
change pages, deletions, bounded input and atomic cache publication. It never
writes Plex or audio. It runs hourly in production; see `docs/PROGRESS.md`,
"Catalogue refresh: behaviour and recovery", for status, hold and recovery.

Private read-only key: `/home/yolan/.config/pavoia-radio/hermes-readonly.key` locally.
Production image proxy reads `state/discovery/.api-key` (mode 0600). Never paste the
key in chat, logs, Git, frontend assets or this handoff. No write API is available.

Images are NOT included in the JSON export. Its manifest points to about 920 MiB
of upstream media from Plex, Spotify, Beatport, RA, Discogs and other sources.
The backend requests allowlisted media using its private key, checks the SHA-1
and JPEG bounds, then caches it. Public clients receive same-origin opaque media
URLs, never the credential. Only needed images are cached, not the whole bank.
Container TLS uses the host certificate directory mounted read-only.

Coverage is incomplete: roughly 69% of artists have images, 47% biographies,
80% links; only 699 of 5,910 tracks have Spotify matches. BPM, key/Camelot and
per-track genres are absent. Country coverage is sparse. Source tags on an artist
are not proof of a specific track's genre. Exact release-date precision is often
unknown; many January 1 dates may represent year-only metadata.

Identity quality matters. The audit found ambiguous bios and aliases. The public
projection withholds heuristic-flagged ambiguous biographies and dependent images/
links; this is not full identity resolution. Keep provenance. Suppress self edges.
Shared compilations or labels are not automatically collaborations or sonic similarity.
Many related artists are external names without researched catalogue profiles.

### Audio highlights

The user wants automatic 60-second excerpts from each track's strongest musical
passage, including unselected owned album tracks. They rejected a manual editor.
A buildup may introduce a drop, but a fixed offset or simply the loudest section
is not the accepted musical rule. Sync the same highlight choice with Track Hunt.

Hermes's API has no excerpt positions. The user suggested PyChorus. A small trial
exists in `ops/highlight_trial.py`, pinned at PyChorus revision
`e8daf59783fe4ebb4fc6e76422d8640d52e5e4c2`. Three MP3 candidates are in
`state/discovery/previews/` with method/provenance JSON. Local equivalents and
`highlight-candidates.json` are under `artifacts/player-discovery-step/`.

Candidates: Jimi Jules, Too Far (`trk_5162739e176d`), start 185s; Never Lost, Ritual
(`trk_05c16aed683e`), start 142.278s; Dusty Kid, Tsunamy (`trk_022b6b202871`),
start 385.381s. Each is 60 seconds. The late Tsunamy excerpt needs listening review.
Repetition detection does not prove the best moment. Do not bulk-process the
collection before validating a musically useful method. Track Hunt does not yet
consume these offsets. Original audio files were not changed.

The current UI plays prepared previews, pauses/closes live audio, and resumes live
only if it was playing before. Missing previews are shown as unavailable.

### History and dates

Plex's sampled `addedAt` values were library-addition dates, not playlist-save
history. Do not convert import timestamps or file dates into actual digging events.
New membership changes are observed by radio polling; this is detection time.

The user explicitly requested stable invented dates for a populated older "History"
heatmap, without a public "illustrative" label. That display backfill is not built.
If implemented, preserve synthetic dates separately from real source/observed
records. Do not let invented history become research evidence or overwrite Plex.
The detailed decision and remaining timezone/counting questions are in the feature
draft. First-listen/rejection/revisit journeys need events that are not supplied.

## Remaining work, in useful increments

1. **Make the data durable and current.** Done: a bounded, observable hourly Hermes
   refresh that keeps the good cache on failure, with a recovery runbook. Next:
   extend Hermes coverage to the approved extra playlists. Prioritize missing
   Spotify matches and identity corrections for actually selected music. Establish
   source control for this delivered tree without losing user edits.
2. **Build the real Explore foundation.** Shared selection/filter/period state,
   global search, useful artist/release/track/label profiles, searchable catalogues,
   contextual entry, progressive graph neighborhoods and browser history. Expand
   owned album tracklists with selected versus subdued tracks. Preserve playback.
3. **Deliver history and musical statistics.** Public recent playback, playlist changes, calendar/day drilldowns and useful
   collection charts. Reuse stored events. Extract or research BPM/key/label/genre
   only with clear provenance and missing-data handling. Replace the rejected panels.
4. **Finish stations and shared highlights.** Add Ambiance/Closing and the two
   playlist unions. Validate automatic highlight quality with the user, prepare
   previews in bounded jobs, and agree a shared Track Hunt offset contract.
5. **Expand after the foundation works.** Rich graph modes, label/remix/genre/stage
   connections, geography/decade/BPM/key/crossover analytics, timelines, explained
   insights, comparisons and Wrapped. PWA, keyboard shortcuts and shareable views
   are later candidates. Festival live ingestion and hardware come last.

The larger Explore package proposes Music Universe, Library, Discovery, History,
Analytics, Timeline, Live Radio, Insights and Wrapped. Treat them as connected
views, not nine required navigation tabs. Desired direction: precise instrument
panel, full-screen graph, compact panels, sharp corners, thin borders, distinctive
headings, monospaced data and restrained useful motion. A terminal/game reference
is not permission to invent points, achievements or decoration.

## Operations, verification and limits

Inspect with `python3 ops/manage.py status` in the remote project. `stop` stops ALL
owned radio services and sets maintenance mode; do not use it for a frontend update.
`update-controller` replaces ALL station controllers; this release can instead
replace only the primary controller. Never stop global Nginx, Podman, Plex, other
apps, user browsers or agent sessions. Read the actual code before lifecycle calls.

Keep consistent SQLite backups through SQLite's backup API; do not copy a live
WAL database's main file alone. Preserve the previous image and Nginx config.
Validate the owned Nginx config before reload. Audio engines can continue serving
cached selections while the primary controller is briefly replaced.

Public routes are intentionally allowlisted. `/internal/` and `/healthz` are not
public. Visitors cannot edit metadata, playlists or the shared broadcast. No login
is needed for listening. Do not introduce a new public write API or admin UI.

Checks: `TMPDIR=/tmp go test -race ./...`, `TMPDIR=/tmp go vet ./...`,
`node --test tests/player.cjs`, `python3 tests/check_ops.py`,
`python3 tests/check_discovery_sync.py`, and `git diff --check`.
Build: `CGO_ENABLED=0 GOOS=linux GOARCH=amd64 TMPDIR=/tmp go build -trimpath -o bin/pavoia .`.

Browser checks: `tests/journey-browser.js` and `tests/waveform-browser.js` are
Playwright CLI callbacks. They default to the local preview; substitute the public
origin for production checks. The second test disables capture at its end, so use
a fresh browser context afterward. Evidence and screenshots are under
`artifacts/player-discovery-step/`. Local browser work used an isolated Docker
Playwright image, `mcr.microsoft.com/playwright:v1.63.0-noble`, with
`artifacts/player-discovery-step/browser.json`. Do not interfere with the user's
browser. Stop only review containers you create.

The Whatbox shared HTTPS path failed additional requests during a historical
100-stream test, although existing streams continued. A temporary combined stream
cap of 90 reserves headroom. The exact provider limit is unresolved. Do not claim
100-listener readiness. `docs/WHATBOX_CAPACITY.md` has evidence and an UNSENT support
draft. Do not send messages to Whatbox or Hermes without explicit instructions.

Physical iPhone background/network-change tests remain undone. Android locked
screen worked in the user's earlier test. Browser checks do not prove native
mobile behavior. A complete 24-hour observation and festival live acceptance are
not established. Do not run the 4 GB / 100-listener test as routine verification.

## Release record

Published on **9 October 2026 at 00:35 UTC** (11:35 Pacific/Noumea), at
https://pavoia.gaende.box.ca/ . Release: `player-release-20261009T002855Z`.

Primary controller image: `localhost/pavoia-controller:player-20261009t002855z`,
image ID `4961591cc5258a4b3782c70bc54f17eccb31540d151389c63866893654faf399`.
The `pilot` tag points to it. Only `pavoia-pilot-controller` was recreated. The
other six controllers remain on their existing images. Icecast and all seven
Liquidsoap start times were unchanged; music files were not modified.

The owned Nginx configuration now allows `journey.js`, `waveform.js` and
`/api/discovery/`. All controller creation specifications mount system TLS
certificates read-only. The primary state directory now contains the catalogue,
needed cached images, the three candidate previews and the private Hermes key.
The hourly Hermes refresh was installed after this release; see `docs/PROGRESS.md`.

Remote release/rollback directory:
`~/pavoia-radio/artifacts/player-release-20261009T002855Z/`.
Local evidence directory has the same relative path under the project.
Remote files include `source.tar.gz`, `discovery.tar.gz`, `manifest.json`,
`source-before.tar.gz`, `radio-before.sqlite`, `nginx.before.conf`,
`icecast.before.xml`, `pavoia.before`, `services-before.json`, `smoke.json` and
`published.json`. These are restricted operational files, not public assets.
The source archive records deployment code; this handoff and updated documentation
are also copied to the remote project after verification.

Rollback image: `localhost/pavoia-controller:before-player-20261009t002855z`.
To roll back, restore its `pilot` tag and `nginx.before.conf`, validate Nginx,
recreate ONLY the primary owned controller using the existing environment and
mounts, and reload ONLY the radio Nginx. Do not stop Icecast/Liquidsoap or restore
the database merely to roll back frontend code. Preserve new playback history.
Inspect `prepare.py` and `publish.py` in the local release directory for the exact
release procedure; `publish.py` has rollback handling and is deliberately not
idempotent once `state/discovery` exists. Do not rerun it blindly.

Verified: local Go race tests and vet, operations tests, discovery import checks,
and player tests. An isolated Whatbox candidate fetched an uncached Hermes image
over validated TLS. Public checks verified exact asset bytes, all seven status
APIs, three seconds of decoded audio per station, preview HTTP 206 byte ranges,
and HTTP 404 on private paths. Chromium tested uninterrupted radio through entity
navigation/search, real preview audio, conditional resume, browser-back cancellation,
EN/DE, 320/390/760/1440 layouts and metadata-failure handling, with no page errors.

Evidence: local `public-check.json`, `public-browser-check.txt`, and desktop/mobile
screenshots in the release directory; remote `smoke.json` and `published.json`.
No high-load test, physical iPhone test, Git commit/push or Git-hosted CI ran for
this release. Files are preserved in release archives but source-control cleanup
remains outstanding.

## Start the next session

Read this handoff, inspect Git status and the live release, then propose one
concrete next increment. Recommended: make catalogue refresh reliable and visible
before adding more UI. Keep the agreed visual direction and original music safe.
