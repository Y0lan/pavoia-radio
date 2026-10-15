# Pavoia Radio delivery status

## Latest checkpoint: 15 October 2026, stations, history and statistics

All nine stations are public. Ambiance has 70 playable tracks; Closing has 91.
Fontanna now combines 746 unique tracks and Etage 0 combines 181.
The public history and music-statistics views are live and preserve playback.
All nine public streams, APIs and browser station changes passed verification.
Existing audio services kept their start times. The temporary candidate was removed.
See [the release record](STATIONS_HISTORY_2026-10-15.md) and [roadmap](ROADMAP.md).
Calendar, BPM analysis and musical key analysis remain outside this release.

## Earlier checkpoint: 9 October 2026, public release

Published the reviewed horizontal player and Hermes discovery integration at
https://pavoia.gaende.box.ca/ at 00:35 UTC. Release directory on Whatbox:
`artifacts/player-release-20261009T002855Z`. Only the primary web controller was
replaced; all audio-engine and Icecast start times stayed unchanged.

The current interface has the blended stage/cover/portrait composition, a single
horizontal player, real optional waveform, Spotify logos/links, and Go deeper in
the header. Track Hunt branding, rejected accordions, player logo and footer are
removed. English/German and persistent listening remain.

The imported catalogue, private image proxy and three candidate previews are now
online. Counts remain 5,910 tracks, 4,337 artists, 2,224 releases and 783 labels,
at release time, cursor 47974. Complete metadata is not delivered.

The hourly Hermes refresh is installed (see the next section). Its first production
run applied 5,581 waiting changes: cursor 53669, 5,910 tracks, 4,323 artists, 2,224
releases, 895 labels and seven playlists, equal to the Hermes counts. Backups and
the previous crontab are in `artifacts/catalogue-refresh-20261009T020008Z/`. No
container was restarted; all seven stations kept playing.

All seven public streams passed short decoding checks. Public browser tests passed
live navigation, search, real preview/resume behavior, EN/DE, responsive layouts
and error handling. Private routes remain blocked. Full details, rollback and
remaining scope: [continuation prompt](SESSION_HANDOFF_2026-10-09.md).

Earlier entries below are historical; their UI descriptions, Hermes blocker and
six-station counts do not describe the current release.

## Catalogue refresh: behaviour and recovery

`ops/discovery_sync.py` refreshes the Hermes catalogue cache. Cron runs it at
minute 5 of every hour, through `manage.py install-cron`, with `nice -n 10` and a
hard 900-second `timeout`. The controller opens the cache per request, so a
published file goes live without a restart. Playback never depends on it.

Each run takes `state/discovery/sync.lock`. A second run exits without changes.
It removes leftovers from interrupted runs and then reads Hermes changes for up
to 600 seconds or 100 pages. A longer backlog is published in part and marked
`behind`; the next run continues from the saved cursor. Without new changes, the
run publishes nothing. A new version of `discovery_sync.py` republishes once. A
shrinking catalogue is refused: any playlist loss, or another kind losing more
than max(50, 10%). A malformed document stops the run and names the entity. The
previous cache stays live after every failure, and on SIGTERM the run cleans up
before it exits.

Every attempt writes `state/discovery/sync-status.json` (mode 0600). `checkedAt`
is the last successful run that read the whole change feed. `publishedAt` is the
last new cache. The file also records the cursor and counts of the live cache,
Hermes `builtAt`/`latestSeq`, consecutive failures and the error of the latest
attempt; the next success clears that error. A count difference against Hermes at
the same cursor appears as a warning in the file and in the run output: it can
mean a missed change. `python3 ops/manage.py status` prints one `catalogue` line
and marks it STALE when the last attempt is older than two hours. Cron output of
the last run is in `artifacts/discovery-refresh.log`.

Before each publication, the replaced cache stays as `catalogue.previous.sqlite`.
It undoes only the last published batch and is not a backup.

Recovery. Never write `catalogue.sqlite` in place: copy a file to a name starting
with `.catalogue-restore` in `state/discovery`, then `mv` it over the cache. Run
these commands from `~/pavoia-radio`.

1. Pause: `touch state/discovery/sync.hold`, then wait for a running sync with
   `flock state/discovery/sync.lock true`. Later runs record `held` and do nothing.
2. Restore the last batch from `catalogue.previous.sqlite`, or extract the release
   cache from `artifacts/player-release-20261009T002855Z/discovery.tar.gz` (cursor
   47974) into a scratch folder, run `PRAGMA quick_check`, then install it. A
   restored cache has an older cursor: the next run applies the same changes
   again. Keep the hold until the cause in Hermes or in the code is fixed.
3. Remove `sync.hold`, run the cron command once by hand without the log redirect,
   then read `python3 ops/manage.py status`. If the run reports `Cursor ahead`, or
   a count warning remains after a complete read, Hermes no longer serves the
   needed changes: rebuild from a new export with `--snapshot DIR --key-file KEY`.
   Add `--allow-shrink` only after you confirm that a large removal is intended.
4. The hourly job continues on its own.

## Earlier deployment record

Updated 7 October 2026. Autonomous continuation requested by the user.

1. DONE: inventory the intended Plex playlists and available metadata on Whatbox.
2. DONE: deploy six stations, the revised bilingual frontend, live covers and portraits.
3. DONE: publish catalogue search and audience history; public headless-shell browser checks passed.
4. PENDING ACCESS: import verified Track Hunt biographies, links and artist/label relationships.
5. EXTERNAL INPUTS REQUIRED: Hermes access, Whatbox capacity confirmation and physical iPhone results. The existing 24-hour observer continues. The full objective is not complete.

## Current state

Production: https://pavoia.gaende.box.ca/. Canonical frontend source: `web/`.
Music files and tags remain unchanged. The user's revised layout is preserved.
Official Pavoia stage photographs and Gaende assets remain in use. The selected
Plex playlists are Feel 146686, Dance 145470, Bermuda day 146377, Bermuda evening
145468, Essentials 147167 (❤️ Tracks, confirmed), and Etage 0 145471.
At deployment they contain 1,094 / 1,625 / 1,113 / 2,040 / 315 / 174 tracks.

Radio-playlist inventory found 5,533 unique tracks, 5,424 cover references, 1,662
attributable portrait references, 2,121 albums and 830 attributable Plex artist IDs.
These are source references, not proof that every image downloads. 3,548 tracks
lack an attributable artist ID. Compilation portraits are not assigned to their
individual performers. The Essentials playlist summary reports 323 entries; its
paginated item endpoint returns 315. Both values remain in the private inventory.

Whatbox owns Plex synchronization and playback. Hermes owns researched facts.
No Hermes API, SSH connection or export has been supplied. Access was requested;
no messages were sent to Hermes. Missing biographies and verified links stay absent.
Future festival live broadcasting and equipment remain deferred.

## Delivery and checks

- Catalogue backend: remote rollback directory `artifacts/catalogue-deploy-20261006T230854Z`.
- Six stations and revised frontend: `artifacts/six-stations-20261006T232139Z`.
- Catalogue search and audience history: `artifacts/catalogue-ui-20261006T234740Z`.
- Bounded thumbnails: `artifacts/thumbnails-20261006T235735Z`.
- Final text catalogue: `artifacts/catalogue-text-20261007T000206Z`.

Each deployment retained consistent SQLite backups and a rollback image. The six
station expansion briefly recreated shared Icecast. Later frontend publication
recreated only controllers; Liquidsoap and Icecast kept running. No Git commit or
push has occurred. The latest release also copied current source to Whatbox.

Six public HTTPS streams decoded without errors for three seconds each:
`artifacts/six-stations-audio.json`. Chromium verified real playback, cover loads,
language changes, persistence and 320/390/760/1440 px layouts for all six stations:
`output/playwright/six-stations-browser-retry.log`.

The final public collection interface passed search, pagination, empty results,
station changes, EN/DE, real playback and current-cover loading, late-response
handling, error recovery and unknown-versus-zero statistics in Chrome headless-shell
151.0.7922.34. Evidence: `output/playwright/collection-browser-headless-shell.log`.
Desktop/mobile screenshots were inspected. Catalogue rows are text-only; live
artwork stays in the current-track section. Public image downloads passed full
decoding and the 640-pixel limit on all six stations:
`artifacts/thumbnails-public.json`.

System Chromium 152 and Playwright's full Chrome runtime also experienced native
renderer SIGTRAP crashes, including page load, compositor and thread-pool paths.
No OOM kill or configured memory ceiling was established. Blocking catalogue images
passed one isolation check, but resizing and removing them did not eliminate every
full-Chrome crash. Do not claim a confirmed browser root cause or universal fix.
Headless-shell passed the final public test with current-track artwork enabled.
Physical browser/device testing remains separate. Crash logs are preserved in
`output/playwright/`; no extracted memory dump was created.

Local Go race tests, go vet, seven player tests, ten operations tests, four load
script tests, catalogue inventory checks, JavaScript syntax, whitespace and
Impeccable checks pass. No new load test was run. Typography detector exceptions
are restricted to the Pavoia fonts in the approved frontend files.

## Remaining evidence

The old two-station observation was deliberately stopped for expansion after 2,100
samples with no failures. It did not complete 24 hours. New six-station observation:
`artifacts/observation-20261006T233838/`; read its latest summary before claiming
completion. It checks API/source presence, not continuous audio decoding.

Earlier user confirmation covers desktop playback and Android locked-screen audio
on the earlier pilot. The new six-station frontend still needs physical Android/iOS
network-change and locked-screen validation. Public HTTPS capacity at 100 listeners
remains unproven; historical failures are documented in `docs/ACCEPTANCE.md`.

Observation at 00:05 UTC on 7 October: 55 samples, one failed API read. The failure
occurred at 00:02:09 UTC on palac-feel during its targeted controller replacement;
its audio source remained present. All 13 containers and six audio sources were
running at the final service check. The 24-hour observation remains incomplete.

## Selection history delivered

Deployed 7 October 2026 at 00:15 UTC. Rollback image and consistent six-station
SQLite backups: `artifacts/selection-history-20261007T001459Z` on Whatbox.
Controllers were replaced sequentially. Audio engines were not restarted.
All previous playback counts were retained. Each station completed its baseline
with zero invented changes; no production playlist or music file was edited.

The public English/German section **How the selection changes** displays observed
additions and removals, with pagination, refresh and the tracking start date.
Observation dates are not historical Plex edit dates. File availability can also
change the playable selection. Earlier history is unknown.

Go race tests and vet passed. The new checks cover baseline initialization,
additions/removals/re-additions, metadata-only updates, empty selections, failed
fetches, rollback after a database write failure, station isolation, pagination,
input validation and database failure responses. Seven player tests and ten
operations checks still pass. UI fixture tests cover EN/DE, four viewport widths,
late-response rejection, failure recovery and empty states. Fixtures exist only
in the test browser and temporary databases.

Public evidence: `artifacts/history-public-api.json` and
`output/playwright/history-collection-public.log`. All six real baseline APIs
responded successfully; opening history preserved decoded audio playback.
Screenshots of populated history use labelled test records and are not real
listening or curation history. No Git commit or push has occurred.

## Full music library (7 October)

The first complete Plex music scan found 90,536 tracks and 9,799 albums in section 8.
Only 5,533 tracks belong to the six radio playlists; 85,003 are outside them.
The scan took 26 seconds. It collected metadata only, without reading audio files.
There are 89,206 cover references and 31,382 attributable portrait references.
55,932 tracks lack an attributable Plex artist ID. These counts do not prove image
availability or resolved performer identities.

The hourly helper builds an immutable SQLite snapshot in the primary controller's
state directory. Atomic replacement preserves the last successful catalogue when
Plex pagination, database writes or validation fail. Concurrent refreshes use a
file lock. The private JSON inventory remains available for Hermes backfill.
The public catalogue reports its snapshot time and total; radio selections keep
their existing five-minute synchronization. Full-library browsing never queues audio.

Deployed at 00:41 UTC, with rollback image and primary-state backup in
`artifacts/full-library-20261007T004116Z` on Whatbox. Only the primary controller
was replaced; all seven audio-engine container start times stayed unchanged.
The full-library API returned 90,536 tracks. First-page metadata matched the
private SQLite snapshot, and a public cover decoded at 640 x 640 pixels.
Public evidence: `artifacts/library-public-api.json`.

Local queries against the real 90,536-track snapshot took 8-51 ms in this run.
This is a local timing sample, not a concurrent-capacity result. Go race tests,
vet, player/operations checks and atomic snapshot publication checks passed.
`output/playwright/library-public-browser.log` records successful public search,
pagination, EN/DE, live playback preservation, 320/390/760/1440 px layouts,
late-scope response rejection and catalogue failure recovery. Desktop/mobile
screenshots were inspected. The only console error was the simulated 503.
The browser runtime was Chrome headless-shell; physical iPhone remains untested.

The installed refresh command completed successfully at 00:43 UTC. The running
public catalogue observed the new snapshot without a controller restart.
At that check, the observation had 129 samples, two failed API reads, and remained
incomplete. Failures were Palac Feel at 00:02:09 UTC and Bermuda evening at
00:15:14 UTC, during controller deployments. Both samples still reported their
audio source present. Source presence does not prove continuous decoded audio.


## Capacity and restore verification, 7 October

The public load test now checks both status and full-library APIs under load.
Six local acceptance-script checks passed, including a case where streams survive
but the public API fails. The live test opened 100 streams, then failed its public
API check during TLS negotiation. It stopped after 76 seconds, without a completed
15-minute hold. A short second check reproduced API resets from both the seedbox
and workstation while 100 streams remained open. The exact provider setting is
unknown. See `docs/WHATBOX_CAPACITY.md` for evidence and an unsent support draft.

A temporary Nginx limit of 90 streams shared across six stations now reserves
website capacity. A short live check confirmed 90 established streams, HTTP 503
for overflow and healthy public APIs from both test origins. All streams closed
normally. No container restart was required. This mitigation does not meet or
replace the 100-listener target. Whatbox confirmation was requested through the
user; no support message was sent.

`ops/check_restore.py` restored all six latest daily backups into disposable state,
started isolated copies of the current controller binary, checked catalogue reads,
preserved track/playback/daily row counts and rebuilt fallback playlists. Production
state and music were unchanged. Evidence: `artifacts/restore-check-20261007T004936Z.json`.
These checks cover saved snapshots; later changes are outside their recovery point.


Public gesture-to-playing startup measured 519-806 ms in one desktop headless-shell
sample per station. All six samples met the three-second target. Evidence:
`artifacts/start-latency-public.json` and `output/playwright/start-latency-public.log`.
This sample does not establish physical iPhone performance or mobile-network behavior.


## Browser compatibility and completion audit, 7 October

WebKit 26.6 (build 2368) with mobile emulation passed public catalogue search,
pagination, English/German, 320/390/760/1440 px layouts, error recovery and real
playback. One gesture-to-playing sample per station measured 556-648 ms.
These are automated Linux WebKit checks, not tests on a physical iPhone.

Full Chrome for Testing 151.0.7922.34 (build 1234) passed the same functional checks
inside the Ubuntu container. Startup samples measured 450-2,583 ms. No native crash
occurred in this run. This narrows the earlier failure to a runtime-dependent case;
it does not establish or fix the cause of the host-native SIGTRAP crashes.

Both runs used Playwright CLI 0.1.22 and matching Playwright/browser builds from
1.64.0-alpha-1790635538000. The isolated Ubuntu dependency image was
`mcr.microsoft.com/playwright@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27`.
Its bundled browser versions were not used. Host system libraries were unchanged.
The [official Docker documentation](https://playwright.dev/docs/docker) describes
this isolated runtime option. Only browser test output was mounted writable.
All test containers and browser sessions were closed after completion.

WebKit emitted style-src-attr warnings. A browser-only page containing one native
select reproduced one warning; two selects reproduced two; a plain paragraph
produced none. These fixtures contained no radio scripts or styles. No control
failure was observed. The site's Content Security Policy was not weakened.
The deliberate catalogue HTTP 503 fixture produced the expected console error
in both engines. This is separate from page JavaScript errors, of which none occurred.

Evidence: `artifacts/browser-compatibility.json`, `output/playwright/webkit/`
and `output/playwright/chromium-container/`. Screenshots were reviewed.

| Requirement | Evidence and remaining work |
|---|---|
| Preserve music; synchronize six Plex stations; continuous playback and listeners | Read-only music mounts; six deployed station APIs; source/decoder/player checks; audience sampling and daily aggregates; real backup restores. The 24-hour observation is still incomplete. |
| Full catalogue, artwork, curation statistics and discovery | 90,536-track snapshot, public search, Plex artwork and observed selection changes are delivered. Artist/label biographies, verified links, credits and relationships remain absent: no Hermes connection, API or export has been supplied. |
| Revised frontend, Pavoia/Gaende identity, English/German and mobile behavior | Approved assets/layout retained. Chromium and WebKit functional/layout checks passed. Physical iPhone lock-screen and mobile network-change testing remain unverified. |
| Capacity and later festival broadcast | The 100-listener public target failed at the HTTPS entry point. A verified temporary 90-stream cap protects browsing; Whatbox confirmation is pending. Festival live input and equipment remain explicitly deferred. |

The primary integration blocker is unchanged across successive goal turns: Hermes
access/export is unavailable. The SSH configuration contains no Hermes alias, no
matching connector is available, and the handoff remains a proposed contract rather
than an imported dataset. The radio APIs expose Plex metadata, not researched facts.
Independent deployment and browser/recovery work has been completed. Further
integration needs the actual research dataset and its schema; inventing biographies, verified
links or relationships would not satisfy the objective. Existing access and provider
questions remain pending. No message was sent to Hermes or Whatbox.


Before declaring the integration blocked, the private GitHub repository named by
Hermes was also inspected. `Y0lan/track-hunt-source` is readable at commit
`e9e39f897e747bd87dd88f8c9876eb205dc1a5d6`. Its DATA_CONTRACT describes story rendering,
not the authoritative research export. All 15 preview Hunt JSON files were checked:
none supplies the inspected Plex identity, source/provenance, Instagram confidence
or verification-status fields. Several use synthetic audio references, and Hunt
numbers repeat for different releases. They were not imported as canonical facts.
`Y0lan/track-hunt-ops` could not be read through the current GitHub connection.
Evidence: `artifacts/track-hunt-repository-audit.json` and
`artifacts/track-hunt-rendering-contract.md`.

The same missing Hermes data/access remains the blocker across at least three
consecutive goal turns. No further catalogue enrichment can be verified from the
available source. The existing source/API observer was confirmed live at 200
samples, with two previously explained deployment API gaps and an incomplete
24-hour window. Its earliest completion is 7 October at 23:38 UTC. Blocking agent
work does not stop that process or the radio. No full completion is claimed.

## Fontanna addition, 7 October 2026

Fontanna uses Plex playlist 145469, controller port 14508 and state-fontanna.
All 660 tracks imported successfully. The seventh station is included in the
selector, EN/DE copy, catalogue export, statistics, changes and reboot setup.
The general official Pavoia mood photograph is reused; it is not identified as a
Fontanna stage photograph. No specific musical mood is inferred.

Icecast and Nginx configuration were reloaded. Only the primary controller was
replaced to serve the updated frontend. Six existing audio connections continued
through deployment without errors; existing audio container start times did not
change. Evidence: artifacts/fontanna-deployment.json.

The existing 24-hour observer still covers its original six stations. Fontanna
was added later and has no equivalent 24-hour observation yet. The shared
90-connection audio limit remains unchanged.

Public audio and browser checks passed; see docs/ACCEPTANCE.md for scope and
evidence. Updated metadata export covers 5,909 unique radio tracks and 84,627
library tracks outside the seven selections. The full library remains 90,536
tracks. Hermes access and provider capacity confirmation remain external inputs.
