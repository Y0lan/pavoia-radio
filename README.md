# Pavoia Radio

Listen at **https://pavoia.gaende.box.ca/**. Select a station and press Play.
The horizontal player stays available while you explore artist, release and label
profiles through **See the roots it's built on**, beneath the Gaende signature. On mobile, the station photograph appears behind
the full description. Desktop keeps the artwork composition. The player contains
the record details, artist and label links, and Spotify where a mapping exists.
Use **Change stage** or swipe the photo on mobile. Essentials and The Bus appear as full Special rows in the mobile menu.
The Bus stays last and keeps the current station playing. See the [stage controls release](docs/STAGE_CONTROLS_2026-10-15.md).

See [the feature roadmap](docs/ROADMAP.md) for remaining work grouped by category
and approval status. [The continuation prompt](docs/SESSION_HANDOFF_2026-10-09.md)
records the broader vision, data sources and earlier delivery context.

The site is public and supports English and German. Pause closes the audio
connection. Resume joins the current broadcast. Changing stations while paused
does not start playback.

The [15 October release](docs/STATIONS_HISTORY_2026-10-15.md) adds Ambiance, Closing,
combined Fontanna and Etage 0 selections, playback history and music statistics.
Open `#history` or `#statistics` on the radio site.

## Stations

| Station | Plex playlist | Tracks at deployment |
|---|---|---:|
| Lost in Feelings | 146686 | 1,094 |
| Night in Motion | 145470 | 1,625 |
| Under the Sun | 146377 | 1,113 |
| As Night Begins | 145468 | 2,040 |
| Essentials (❤️ Tracks) | 147167 | 317 |
| Etage 0 | 145471 + 147259 | 181 |
| Fontanna | 145469 + 162633 | 746 |
| Ambiance | 145472 | 70 |
| Closing | 162463 | 91 |

Counts change with Plex. Each station broadcasts MP3 at 320 kbit/s. Music files
and tags stay unchanged; containers mount the music directory read-only.

## Source and operation

`web/` is the production frontend. It retains the user's revised stage layout,
with official Pavoia photographs, Gaende assets, live covers and attributable
Plex artist portraits. `design/` preserves earlier design work and preview tools.
Hermes artist/label profiles and verified links are available through a local
read cache. Metadata coverage is partial. Hourly refresh is deployed and preserves
the last good cache when the source is unavailable.

The Go controller synchronizes Plex every five minutes into SQLite. Incomplete
imports preserve the last successful catalogue. Nine independent controller and
Liquidsoap pairs share Icecast and Nginx. Each station has its own history,
metadata, fallback playlist, audience statistics and image cache.

Liquidsoap selects shuffled cycles, avoids the three recent artists when possible,
and applies a three-second crossfade. Cached selection continues during controller
outages. Actual starts generate history; up to 1,024 unacknowledged callbacks remain
in Liquidsoap memory. Stopping that process loses unacknowledged events.

Audience counts represent audio connections, not unique people. Samples are taken
every ten seconds and retained for thirty days. The visible Live count uses a
shared one-second Icecast cache through `/api/audience?stage=<id>`; it does not
increase database writes. Daily aggregates persist. Listening
hours are estimates; collection gaps remain unknown. Test listeners are included.
No third-party visitor tracking is used.

## Development and checks

Photographs and fonts use Git LFS. Install Git LFS before cloning:

```sh
git lfs install
git clone https://github.com/Y0lan/pavoia-radio.git
cd pavoia-radio
git lfs pull
```

The [publication notes](docs/RELEASE_2026-10-16.md) distinguish repository fixes
from the live website release.

```sh
go test -race ./...
go vet ./...
node tests/player.cjs
python3 tests/check_ops.py
python3 tests/check_load.py
python3 tests/check_catalogue_inventory.py
python3 tests/check_discovery_sync.py
python3 tests/check_deploy_web.py
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -o bin/pavoia .
```

`python3 tests/media-session.py` checks metadata freshness and history navigation with mocked APIs.
It requires Python Playwright and Chromium at `/usr/bin/chromium`.

For a local preview with production metadata and audio:

```sh
python3 design/stage-direction/serve.py
```

Open http://127.0.0.1:14521/. The preview serves `web/` and proxies known radio
routes. Discovery also requires the local backend on loopback port 14522; see the
continuation prompt for its cache paths. Playwright callbacks are in `design/stage-direction/check-browser.js`
and `tests/journey-browser.js` and `tests/waveform-browser.js`. Run them through Playwright CLI from
`output/playwright/`. They include short real audio connections in audience counts.

On Whatbox, from `~/pavoia-radio`:

```sh
python3 ops/manage.py status
python3 ops/manage.py stop
python3 ops/manage.py start
```

These commands target only the radio's owned services. Stop also disables reboot
startup until Start. Never stop Nginx or Podman globally. `ops/observe.py` records
24 hours of source/API availability without opening audio connections. It does
not continuously decode audio or replace physical Android/iOS tests.

`ops/check_audio.py` checks generated audio with temporary services on ports
14541-14543. `ops/check_load.py` opens 100 HTTPS audio connections for fifteen
minutes, transferring about 4 GB. It also checks public status and catalogue APIs.
Run it only during planned acceptance. The temporary shared stream limit is 90;
the 100-listener target remains unresolved. See `docs/WHATBOX_CAPACITY.md`.

New container logs are capped at 4 MB each. On 16 October, the nineteen live
containers had a combined 100 MB cap: seventeen at 4 MB and two at 16 MB.
Recreating the two older Palac Liquidsoap containers with the existing default
will reduce the total to 76 MB. This operation remains pending; the live total
does not yet meet the target below 100 MB.
Nginx keeps no persistent access/error logs. Plex artwork is limited to 640 by 640
pixels. Its cache is capped at 64 MiB per
station. SQLite makes a consistent daily backup, retaining seven dated copies.
Before restoring, stop the target controller and preserve its current state.
Never copy only the main database file while WAL writes are active.

See [delivery status](docs/PROGRESS.md), [contracts](docs/CONTRACTS.md),
[acceptance evidence](docs/ACCEPTANCE.md) and [Hermes handoff](docs/TRACK_HUNT_HANDOFF.md).

Full-library metadata remains available through `/api/library/catalogue`. The old
Collection, playlist-change and audience accordions were removed from Listen at
the user's request. Their data/APIs remain for the future Explore experience.
The Whatbox helper refreshes full-library metadata hourly;
failed refreshes retain the previous snapshot. See `docs/CONTRACTS.md` for details.

`python3 ops/check_restore.py` verifies each station's latest daily backup on Whatbox.
It starts temporary controllers with isolated state, unreachable test upstreams and
random local ports. It checks database integrity, catalogue reads, playback/daily
counts and rebuilt fallback playlists. Production services and music stay unchanged.
This verifies restoration of the saved snapshot, not recovery of changes made after it.

## Publishing the website

Every push runs the checks in GitHub Actions. When they pass on `main`, the
website of that commit goes live on https://pavoia-dev.gaende.box.ca/. Both sites
play the same live stations; only the page differs. A later commit always wins: a
delayed job for an older commit never moves dev back. Production still receives the
website through the reviewed release, which rebuilds the Go controllers.

A website deploy never restarts anything. `ops/deploy_web.py` unpacks the commit's
`web/` folder into `releases/` on Whatbox, switches the `web-dev` link to
it, checks that Nginx serves the new files and switches back if not. Changes to the Go
controllers, Liquidsoap or Icecast still follow the reviewed release process, because
they restart services.

To undo the last dev deploy on Whatbox: `python3 ops/deploy_web.py rollback dev`.

GitHub reaches Whatbox with one SSH key whose `authorized_keys` entry is restricted to
`deploy_web.py --ssh`. That key can only ask to publish a commit of `main` on dev. It
cannot open a shell or run anything else.
