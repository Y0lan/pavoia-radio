# Mobile layout, 15 October 2026

Public site: https://pavoia.gaende.box.ca/
Release: `artifacts/mobile-layout-20261015/`.

## Changes

- On phones, only the selected station photograph appears behind the title.
  The album cover and artist portraits appear in On air below the station.
- A stronger gradient and a title shadow keep the words readable on bright photos.
- A short location line identifies the stage. More reveals the approved description.
- Stations opens a native bottom sheet with nine photo rows. The existing radio
  group moves between the sheet and the desktop layout; it is not duplicated.
- Horizontal swipes on the photo select the next or previous station.
  Vertical scrolling and pinch gestures remain available. The counter shows the
  selected station within the nine-station sequence.
- Spotify and manual photo controls use compact icons on phones. The language
  selector uses plain text. Controls retain accessible names and touch targets.
- The Bus stays last in the sheet. Opening it preserves the playing station.
  Swipes do not enter the Bus. Its shared link and ticket link remain available.
- Desktop keeps its layout and full descriptions. EN/DE, reduced motion,
  keyboard focus, photo selections and crop positions remain supported.

## Evidence

- All 13 player tests passed: `player-check.txt` in the release directory.
- The candidate Chromium run covered six viewport widths from 320 to 1440 pixels,
  all nine stations, EN/DE, touch gestures, focus, resize, reduced motion,
  playback, photo changes, the Bus and history navigation.
- Forty candidate screenshots were captured. The visual review included all nine
  stations, bright photographs, On air, the sheet, desktop, expanded descriptions
  and the Bus. Images are under `output/playwright/mobile-layout/`.
- WebKit with the iPhone 13 profile passed station selection, descriptions,
  playback and Bus playback preservation. Its screenshots were reviewed.
- Existing browser checks passed for corrections, the Bus, photo races/failures,
  reconnection and playback of all nine stations. Logs are `existing-check.log`
  and `existing-recheck.log`. The first run exposed an outdated photo-fault setup;
  the corrected run installs faults before thumbnails can cache those images.
- The controller build succeeded from the current production snapshot with only
  `web/app.js`, `web/index.html`, `web/style.css` and `web/journey.js` replaced.
- The isolated smoke controller passed. Public HTTPS hashes match all four files.
  See `manifest.json`, `smoke.json`, `public-assets.json` and `published.json`.

- The full public Chromium run passed after deployment with no asset overrides:
  40 screenshots, no page errors, no console errors and no unexpected request
  failures. The test driver needed protocol polling because its default wait
  helper used eval, which the public Content Security Policy correctly blocked.
  The security policy was not changed or bypassed. See `public-review.json`.

- The public WebKit run also passed without asset overrides. It verified all
  nine stations, descriptions, playback and Bus playback preservation with no
  page errors. See `public-webkit-check.log`.

## Deployment

Only `pavoia-pilot-controller` was replaced. Eighteen other managed services
retained their start times, including every audio engine and Icecast.
No backend source changes or unrelated local artwork changes were released.

Image: `48846e55d6973f1b65e154a601a07fc9791863b0fc6c1062ee82c69fd52e51e2`.
Rollback image: `localhost/pavoia-controller:before-mobile-layout-20261015`.
The remote release directory retains the previous files and executable.

## Limits

Automated mobile profiles do not replace tests on physical phones.
Long-duration playback and load capacity were not tested in this release.
