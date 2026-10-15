# Stations, playback history and music statistics

Release: `artifacts/stations-history-20261015/`.

## Scope

- Add Ambiance (`145472`) and Closing (`162463`).
- Combine Fontanna (`145469`, `162633`) and Etage 0 (`145471`, `147259`).
  Deduplicate by Plex track ID. A failed source fetch retains the last complete selection.
- Add `#history`, with stage selection, period selection and pagination.
  History uses confirmed audio-engine callbacks. It does not count reservations.
- Add `#statistics`, with stage, all-radio and whole-library views.
- Preserve playback when browsing these views. Keep the Bus icon last, after Closing (corrected in the follow-up release).
- Exclude the calendar, BPM analysis and musical key analysis.

## Definitions and coverage

Selection statistics use the hourly Plex inventory. A track counts once per scope.
A shared track can count on multiple stages. Artist counts preserve the complete
credit string, including collaborations. Release counts use Plex album IDs.
Durations use the Plex duration metadata.

Label and release-year statistics use the existing public discovery metadata.
Each chart shows coverage against the selected track count. Unknown metadata
is excluded. Track tags have no current coverage, so no genre chart is displayed.
There are no BPM values in the inspected discovery records or new playlist samples.

Broadcast statistics show confirmed starts during the last 30 days and the earliest
available record. They include tracks removed from the current selection.
The unplayed count uses only the current playable selection. Counts represent
starts, not completed listens or distinct listeners.

The two new stations begin their playback history at deployment. Older stations
keep their existing history. History displays the visitor's local timezone.
Additional records have basic Plex metadata; some still lack rich Explore profiles.
The follow-up [correction release](RADIO_CORRECTIONS_2026-10-15.md) displays these
basic details when a rich profile is absent.

## Implementation and compatibility

- Each controller serves its own `/api/radio/{stage}/history` and `/music` routes.
- History uses timestamp and row-ID pagination, including tied timestamps.
  Responses contain public metadata only and are limited to 100 entries.
- `/api/library/statistics?scope=...` reads summaries from the immutable library cache.
  Summaries are built during the existing hourly refresh. Page visits do not scan Plex.
- The library cache replacement is atomic. A failed refresh retains the previous cache.
- The release adds controller ports 14509 and 14511. Port 14510 belongs to another service.
- Nginx explicitly exposes the new public routes. Internal controls remain private.
- Icecast reloads its source limit. Existing Liquidsoap processes remain running.
- No dependencies, permanent preview service, calendar or audio-analysis job were added.

## Source isolation and rollback

The build starts from the deployed intentions release. It includes only this task's
changes. Existing unshipped artwork and discovery-cache changes remain in the local
working tree. Their separate tests remain there too. The release test snapshot includes
its matching deployed backend tests and the new feature tests.

The release stores source hashes, the binary hash, service image IDs, previous source,
configuration and database snapshots. `publish.py` checks its baseline and refuses
repeat execution after a release attempt. It replaces controllers individually and
restores the previous configuration and images if a deployment check fails.
Rollback retains broadcast records; old controllers restore their original selections
on the next sync. No audio files or Plex playlists are modified.

## Verification

The release passed Go tests with the race detector, Go vet, operations configuration
checks, inventory and statistics checks, and all 13 existing player tests.
New checks cover union deduplication, failed-source retention, history pagination,
period boundaries, stage isolation, unavailable databases and private metadata filtering.

Candidate browser checks passed at 1440, 390 and 320 pixels, in English and German.
They cover history pagination, period changes, track navigation, retries, statistics,
mobile overflow and continued playback. Screenshots are in `output/playwright/`.
Public API checks confirmed all nine streams, station history and statistics.
A fresh browser passed the same interface checks without candidate overrides.
A browser also switched through all nine live stations, checked history for the new
stations, and verified that history filters and the Bus preserve playback.
The temporary candidate container and tunnel were removed.
Evidence is recorded in the release directory.

Physical phones, long-duration observation and high-load capacity were not retested.
The existing combined public stream cap remains 90. No commit or push was made.
