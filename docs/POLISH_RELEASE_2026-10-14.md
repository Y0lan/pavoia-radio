# Radio interface polish, 14 October 2026

The frontend update is published at https://pavoia.gaende.box.ca/.
It follows the approved refinement plan and the installed
`redesign-existing-projects` skill.

## Changes

- Station photos crossfade over 350 ms after decoding. Two image layers preserve
  the previous photo during loading. Late requests cannot replace a newer scene.
- Station headings enter over 180 ms. Controls have 140 ms press feedback and
  180 ms colour transitions. Explore opens over 240 ms with warm neutral surfaces.
- The selected station stays visible in the mobile selector. Station selection
  precedes Spotify actions. Change photo includes the current photo number.
- Mobile listeners can see connection, retry, and error messages. Pause remains
  available during connection attempts. The Play control shows a loading ring.
- The player reserves cover space. Routine metadata refreshes preserve artist
  buttons and keyboard focus. New artwork fades in when it loads.
- The four fonts loaded initially use 231,380 bytes instead of 638,520 bytes,
  a reduction of approximately 64%. The typefaces and character coverage remain.
- The next photo for the active station preloads unless data saving is enabled.
  Reduced motion disables motion. Hidden pages pause optional animation.

The native audio player, station playlists, selected photos, crop positions,
EN/DE, Bus Easter egg, and public APIs retain their existing behavior. Audio
requests do not wait for photographs or animations. Station changes still
require a new stream connection. This release does not add audio crossfading.

## Verification

- Thirteen player tests passed, including stale image completion, image failure,
  first-image recovery, data saving, audio races, retries, and Bus behavior.
- Go race tests and vet passed against the deployed backend baseline.
- Candidate browser checks passed at 320, 390, 760, and 1440 pixels. Checks covered
  photo sequences and crops, EN/DE, keyboard focus, reduced motion, image failures,
  connection failures and recovery, Bus navigation, and Explore playback.
- A browser check observed the actual 350 ms photo animation and successful
  recovery after the first photo failed to load.
- Public verification matched all nine changed asset hashes and all seven
  station APIs. A fresh browser without local asset overrides played all seven
  stations and verified manual photo changes and mobile station selection.
- The public Bus checks passed for direct links, browser history, keyboard access,
  the ticket link, and uninterrupted playback through Bus and Explore navigation.
  Both public browser checks reported no page errors.
- The design detector passed with the existing project exceptions. The hidden
  artwork placeholders and photo buffer receive sources before display.

Screenshots are in `output/playwright/polish-*.png`. Release evidence is in
`artifacts/polish-release-20261014/`. Public timing samples include browser
interaction and at least 0.2 seconds of playback; they are not a latency benchmark.
Physical phones, sustained load, and Git-hosted CI were not tested. No Git commit
or push was made.

## Deployment and rollback

Image: `localhost/pavoia-controller:polish-20261014`.
Image ID: `f7a7cf1f53e76444ededf50ef0f13f40d1c10d111e216978cfb99dac6e390a79`.
Rollback image: `localhost/pavoia-controller:before-polish-20261014`.

Only `pavoia-pilot-controller` was replaced. Icecast, all Liquidsoap services,
and the other six controllers kept their start times. Nginx was not changed.

The local and remote release directories contain the source archive, binary,
asset manifest, publish script, and verification records. The remote `before/`
directory contains the previous frontend files and binary. A rollback restores
those files and the previous image, then replaces only the primary controller.
It must preserve databases, music, playlists, and the running audio engines.
The publish script rejects an already attempted release; do not rerun it blindly.

The release uses the verified deployed backend with the updated frontend.
Local backend source still differs from production. Verify the deployed baseline
before building another production release.
