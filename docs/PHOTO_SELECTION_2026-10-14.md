# Station photo selection, 14 October 2026

The selected station photos are live at https://pavoia.gaende.box.ca/.

| Station | Photos |
| --- | ---: |
| Under the Sun | 8 |
| As Night Begins | 13 |
| Night in Motion | 4 |
| Lost in Feelings | 4 |
| Essentials | 13 |
| Etage 0 | 8 |
| Fontanna | 1 |
| The Bus Easter egg | 1 |

The seven live stations use 44 distinct photos. Some photos belong to more than
one station. The Bus Easter egg uses the official pavoia.com bus photo, bringing
the total to 45. It is a scene, not a broadcast station.

A station displays its next selected photo when the listener enters it. The
Change photo / Foto wechseln button advances through that station's photos.
The button is hidden when the station has only one photo. Track updates and
language changes keep the current photo. Changing a photo does not restart audio.
Crop positions come from the saved selection. Photo order resets on page reload.

The faint bus icon after Fontanna opens `https://pavoia.gaende.box.ca/#bus`.
It brightens on hover or keyboard focus. The scene displays "The Bus",
"Somewhere in the forest", and "No playlist here. You have to be there."
The ticket link opens `https://pavoia.com/#tickets` in another tab. EN/DE copy
is supported. The playing station, metadata updates, and player controls remain
active. A direct Bus link starts paused, like the normal radio page.

Source: `web/app.js`, `web/photos/selected/`, `web/index.html`, `web/style.css`.
Selection backup: `artifacts/photo-selection-20261014-vj5a76d9/`.
Release evidence: `artifacts/photo-release-20261014/`.
Bus release evidence: `artifacts/bus-release-20261014/`.
Browser checks: `tests/photos-browser.js`, `tests/bus-browser.js`, and
`output/playwright/`.

The release uses the deployed backend source with the new frontend assets.
Only the primary controller was replaced. Icecast, Liquidsoap, and the other
controllers kept their original start times. Nginx configuration did not change.

Bus rollback image: `localhost/pavoia-controller:before-bus-20261014`.
The earlier photo release rollback is `localhost/pavoia-controller:before-photos-20261014`.
The remote release directory contains the previous frontend files and binary
under `before/`, plus the previous service image and start-time record in
`services-before.json`. Rollback must replace only the primary controller and
restore those files. Do not stop the audio engines or restore the database.

Validation: ten player tests, Go race tests and vet for the release source,
exact public hashes for all 47 changed assets, and all seven station APIs.
The browser checks cover photo sequences, keyboard control, EN/DE, playback,
and widths of 320, 390, 760, and 1440 pixels. The Bus checks also cover its direct
link, Back/Forward, Explore navigation, and entering and leaving the scene during
playback. Physical phones were not tested.
