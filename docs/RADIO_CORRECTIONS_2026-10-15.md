# Radio corrections, 15 October 2026

Release: `artifacts/radio-corrections-20261015/`.
Navigation follow-up: `artifacts/radio-navigation-20261015/`.
Public site: https://pavoia.gaende.box.ca/

## Changes

- The Bus icon always comes last, after Closing. It keeps its hidden scene and `#bus` link.
- Ambiance describes a safe, quiet space to lie down, relax and feel good.
- Closing says: "Tracks I could play to close a set."
- The header button is Explore. History and Music statistics are inside its existing panel.
  The detached navigation row below the listening area is removed.
- History tracks without a rich Explore profile open their available library details.
  The title, artist, album and available artwork remain useful. Empty connection maps
  and lists are omitted. Basic links support reload and browser navigation.
- Release years show every known year in descending chronological order.
  Artist and label charts keep their ranking by track count.

Both interface languages are updated. Existing playlist descriptions and photos are preserved.
The release adds no dependency, permanent service, calendar, BPM analysis or musical key analysis.

## Verification

The isolated release build passed the Go test suite and inventory/statistics tests.
The working tree passed the focused discovery test and all 13 player tests.
Regression fixtures cover rare recent years, more than 12 years, basic track aliases,
rich profile precedence, missing artwork, metadata filtering and unavailable storage.

Candidate and fresh public browser checks passed at 1440, 390 and 320 pixels, in EN/DE.
They verified Bus order, complete subtitles, history access, both reported missing-profile
tracks, direct links, reload, rich profiles, library artwork and uninterrupted radio playback.
The public history checks also passed pagination, period filters, error retry and statistics.
The Bus regression exposed a race: track navigation waited for metadata before changing
the URL. A pending scene event could close the panel and abort that request. The follow-up
sets the track URL immediately, then replaces the alias with the rich ID when available.
This preserves one history entry per track. The same Bus regression now passes, including
its scene, ticket destination, browser navigation and continued playback.
No browser JavaScript errors were observed.

Public asset hashes match the release. The two reproduced failures now return track details:
`128670` (Bipoler Assaults, Blausch;Meshcut) and `168908` (Cut, Recondite).
The radio selection and library each show 37 known release years, with 2025 first.
For every scope, the sum of year counts equals the reported year coverage.
The latest known year reflects available metadata, not the current calendar year.

Evidence: `public-api-check.json`, `public-browser-check.txt`, `public-history-check.txt`,
`manifest.json` and `release-evidence.tar.gz` in the first release directory.
The first Bus failure is retained there. Final Bus, history and correction checks are
in `artifacts/radio-navigation-20261015/public-browser-check.txt`. That directory also
contains the final public asset hash and deployment evidence.
Screenshots are in `output/playwright/`.

## Deployment and rollback

The build starts from the exact previous deployed source snapshot and adds these corrections.
Separate local artwork and discovery-cache hardening remains outside this release.
Only the primary controller was replaced. Icecast, all nine Liquidsoap processes, and the
other eight controllers retained their start times. Nginx configuration was not changed.

The publisher holds the operations and library-refresh locks. It verifies source hashes,
the previous image and the inventory timestamp before publication. It rebuilds the immutable
library snapshot from the current complete inventory, then replaces the snapshot atomically.
The scheduled inventory script also uses the new year order, so future refreshes preserve it.

Previous source files, binary and library snapshot are retained in the remote release's `before/`.
Rollback for all corrections: `localhost/pavoia-controller:before-radio-corrections-20261015`.
The navigation follow-up retains its own prior image as
`localhost/pavoia-controller:before-radio-navigation-20261015`.
The publisher restores those files and the primary controller on a failed deployment check.
Playback history is not replaced. No audio files, Plex playlists or credentials are changed.
The temporary candidate container and SSH tunnel are removed after verification.

Physical-phone tests, long-duration listening and capacity tests were not repeated.
Tracks absent from both the rich catalogue and the library still return 404.
No commit or push was made; the existing dirty working tree was preserved.
