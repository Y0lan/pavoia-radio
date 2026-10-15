# Stage controls and live audience, 15 October 2026

Published at https://pavoia.gaende.box.ca/.
Release evidence: `artifacts/stage-controls-20261015/`.

## Delivered

- The Live count requests a fresh audience sample each second while the page is visible.
  Counts describe audio connections to the selected stage. They are never incremented speculatively.
- The primary controller shares one Icecast sample for one second. Statistics still write every ten seconds.
  A browser leaving or switching stages cannot cancel the shared sample. Failures remain unavailable, never zero.
- Mobile descriptions appear directly below the title. More has been removed.
- The later roots-footer release uses the user's revised Essentials icon: a globe with sprinkles.
  Essentials and the Bus have full Special rows; the Bus stays last. Swipes include all nine stations.
  The Bus remains a separate scene and preserves the playing station.
- A radio icon with antennas replaces the word beside the Pavoia logo.
- Change stage replaces Stations. A discreet hint explains horizontal swipes. Explore has no arrow.
- Record information appears in the playback bar. Artist and label links open Explore without stopping playback.
  The Spotify icon links to the current track when an existing mapping is available.
- The local preview proxy also forwards the audience endpoint.

## Verification

- The release snapshot passed `go test -race ./...`. The audience test covers shared concurrent requests,
  stage validation, missing mounts, unavailable upstream responses, cache expiry and canceled callers.
- All 13 player tests and all 11 operations tests passed.
- The final candidate Chromium review covered nine stations, EN/DE, swipes, photo changes, focus,
  resizing, reduced motion, the Bus, history and playback. It produced 39 screenshots with no page errors,
  console errors or unexpected request failures. Expected canceled requests occur during station changes.
- Visual review included 320 and 390 pixel phones, long descriptions, bright photos, the station sheet,
  and 1024 and 1440 pixel desktops. See `design-review.md` in the release directory.
- A real enriched record, 143095, was forced as current metadata to check artist, label and Spotify controls.
  Seven widths from 320 to 1440 pixels passed layout checks. Artist and label navigation preserved real audio playback.
- Candidate and public WebKit checks passed with the iPhone 13 profile. The public test used no asset overrides.
- After publication, Chromium played all nine public streams. History navigation and the Bus preserved playback.
- All four public frontend files match the tested snapshot by SHA-256.

The public audience test used two independent browser contexts on Closing:

| Action | Delay until both displays matched |
| --- | ---: |
| First listener starts | 1.338 seconds |
| Second listener starts | 1.616 seconds |
| Second listener pauses | 0.864 seconds |
| First listener pauses | 1.784 seconds |

These are observed times, not a guaranteed maximum. See `public-audience.json`.

The initial local preview used an SSH tunnel between the controller and Icecast.
That artificial extra network path sometimes exceeded the two-second upstream timeout.
Final candidate checks ran against an isolated controller on Whatbox, next to Icecast.
The production timeout was not increased.

## Deployment

The build used the previous production source snapshot plus the scoped audience and frontend changes.
Unshipped artwork and other local backend work were excluded.

Only `pavoia-pilot-controller` was replaced. Eighteen other managed services retained their start times.
Nginx passed configuration validation and reloaded gracefully with the same master process.
The release stores prior files and an executable, and has an automatic rollback path.

Image: `3468b3eccca3c0c2758bd169e9d264a699a54da5fed4f401928d74beea645721`.
Rollback image: `localhost/pavoia-controller:before-stage-controls-20261015`.

## Limits

No physical-phone, long-duration playback or capacity test was performed.
The source changes remain uncommitted; the existing staged and unrelated work was preserved.

## Legibility follow-up

The mobile swipe hint was increased from 11 px to 14 px after the design hook
identified it. The detector is clean without a suppression. Candidate and public
Chromium checks passed at 320, 390, 430 and 760 px in EN/DE, with no wrapping or
horizontal overflow. The public stylesheet hash matches the tested file.

Release: `artifacts/swipe-legibility-20261015/`. Only the embedded stylesheet
changed. Eighteen other managed services retained their start times.
Image: `5d2948c9b3ac460e43d055243fd4ca8aba95a3940911df1a2cd0197c4586dcc7`.
Rollback: `localhost/pavoia-controller:before-swipe-legibility-20261015`.
