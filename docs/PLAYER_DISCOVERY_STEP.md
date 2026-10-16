# Player and connected discovery: first review

Published 9 October 2026 after the local reviews recorded below. The current
release, verification and remaining work are in
[the continuation prompt](SESSION_HANDOFF_2026-10-09.md). Statements below about
local-only deployment describe their dated review step, not today's public state.

Authorized scope: connect the supplied Hermes catalogue; improve the existing
desktop/mobile player; explain Track Hunt; link the five supplied Spotify
playlists; provide a real artist/release/label discovery journey. Keep EN/DE and
the existing audio lifecycle. The large Explore dashboard and new admin UI are
outside this increment. This is a reviewable step, not the whole roadmap.

## Progress

- [x] Import and synchronize a local catalogue cache with bounded public reads.
- [x] Build the listening view and Track Hunt introduction with real metadata.
- [x] Connect artist, release and label navigation without interrupting playback.
- [x] Verify audio behavior, stale/error states, desktop/mobile layout and EN/DE.
- [x] Present the working preview and outstanding data requirements for review.

## Design plan

Use the existing revised identity: Instrument Serif for station names, Inter for
reading and JetBrains Mono for status and measurements. Retain these fonts in
this focused change rather than replace the user's frontend typography.
Palette: room #0b0a09, panel #171412, text #f0ede5, secondary #b6b1a8, signal #ee1f09,
line #39342e. The album artwork supplies the changing color.

Desktop and mobile: the official stage photograph fills the listening viewport.
The record artwork and credited artist portraits blend directly into it with soft
edge masks and restrained opacity. Controls and titles sit on the composition,
without panels. The original cover remains legible in the persistent dock.

Blend refinement: preserve the cover's aspect ratio, sharpness and original
colors. Use normal transparency instead of screen/luminosity blending, with
separate cover and portrait positions. Explicit ellipse radii make all image
edges fully transparent. One continuous hero overlay provides header and text
contrast. This avoids bounded header shading and hard image-mask edges.

Local checks: bright, dark and daylight compositions with real catalogue images;
320/390/760/1440-pixel layouts; uninterrupted live playback through Explore.
Palette screenshots are composition fixtures, not broadcast records. No
production deployment was made for this refinement.

Player consolidation: the fixed bottom bar contains play/pause, cover, clickable
artist credits, elapsed time, progress and volume. Remove its Gaende logo and
duplicate Explore button. Put Go deeper beside Live in the header, with a
transparent language selector. The player is one horizontal strip on desktop
and mobile. On small screens the waveform stays visible; playback status and
timing remain available to assistive technology. The footer has been removed.
Spotify destinations use the locally served Spotify icon from Simple Icons.

The waveform shows recent RMS levels from a separate capture of the live audio.
The native audio element remains the playback output. Browsers without capture
support use a static line; reduced motion and paused playback also use that
fallback. Stop capture and drawing when the page is hidden. No microphone,
second stream request or simulated audio data is used. Browser checks cover
actual changing samples, station switching, volume, EN/DE layouts, paused and
reduced-motion states, and playback when capture is unavailable.

Critique: preserve the sense of being at the stage. Avoid decorative waveforms
and let the stage remain visible around the compact controls. Show actual elapsed broadcast time as an indicator, not a
seek control. The explorer starts with related entity links and a bounded map;
information remains readable on small screens.

## Contracts and limits

Spotify links are external playlist destinations, not a claim of matching every
current radio track. The radio contains the full selections; Spotify is updated
daily. Preserve separate radio-selection and Essentials-favorite membership.

Hermes remains the research source. Local cached data survives its downtime.
Only public fields and allowlisted media paths reach the browser. API credentials
stay outside frontend assets. Preserve the source snapshot and apply changes
transactionally, with tombstones and a cursor advanced only after application.

The snapshot has no highlight offsets. The user chose radio-side selection and
suggested PyChorus. Trial three contrasting owned tracks before adopting it.
Export positions and method for Track Hunt to consume; do not imply the
strongest passage is proven by repetition alone.

No production deployment is implied by a local preview. Keep a reversible copy
of the pre-change files and validate before the user's visual checkpoint.

## Local review, 8 October 2026

Available at `http://127.0.0.1:14521`. The preview uses production's public audio
and status endpoints. Its discovery service runs separately at loopback port
14522. No Whatbox service or public Nginx route was changed for this step.

Implemented: local Hermes snapshot import and incremental updates; bounded
entity/search/image reads; desktop/mobile player; credited artists and labels;
five stage Spotify links; EN/DE Track Hunt introduction; connected track, artist,
release and label inspector; catalogue-row navigation; shared browser history.
The map is a bounded connection diagram. It is not the full planned graph engine.

The 5,910-track snapshot is cached locally. A live read-only update advanced the
cursor from 47971 to 47974. The synchronizer retains the previous cache if a batch
fails. An automatic production sync schedule is not installed yet.

Three real owned tracks have candidate previews. Original music files were only
read. Clips are 60-second MP3 files, verified with ffprobe:

| Track | Candidate excerpt | Repeated section detected |
| --- | --- | --- |
| Jimi Jules - Too Far | 3:05 to 4:05 | 3:25 |
| Never Lost - Ritual | 2:22.278 to 3:22.278 | 2:42.278 |
| Dusty Kid - Tsunamy | 6:25.381 to 7:25.381 | 6:45.381 |

PyChorus revision `e8daf59783fe4ebb4fc6e76422d8640d52e5e4c2` selects a repeated
section. This trial uses 2 chroma frames per second and a 15-second detection
window. The exported clip starts 20 seconds before that candidate. The lead is
an experiment, not proof of a detected buildup or drop. Repetition does not
prove the strongest passage. The late Tsunamy candidate especially needs a
listening check before choosing this method for bulk processing.

`ops/highlight_trial.py` runs in an isolated optional Python environment. It does
not add audio-analysis dependencies to the radio service. Reproducible trial
versions are in `artifacts/player-discovery-step/pychorus-requirements.txt`.
The combined `highlight-candidates.json` records Plex identity, source checksum,
position, duration, method and candidate status. Hermes has not consumed these
positions yet. No Hermes write API is available.

Checks: Go tests, race detector, vet, existing player lifecycle checks, cache
projection/deletion/rollback checks, and Chromium browser flow. The browser check
covers live audio during navigation, an actual prepared clip, conditional radio
resume, browser-back clip cancellation, EN/DE, failed metadata and widths 320,
390, 760 and 1440. Screenshots and browser output are under
`artifacts/player-discovery-step/`. Native iPhone background playback is not
reconfirmed by these Chromium checks.

Next checkpoint: review the player and listen to the three trial passages.
Remaining separately: production routing/deployment and sync scheduling; stronger
highlight selection if this baseline disappoints; Track Hunt position ingestion;
own non-selected album siblings; missing research data and the wider roadmap.

### Design hook follow-up

Raised functional labels and controls below 11px to 11px. The Track Hunt sentence
uses normal capitalization. Chromium checks at 320/390/760/1440 px found no
horizontal overflow, visible broken images, or undersized checked labels.
The scoped image exception covers hidden runtime artwork. The scoped padding
exception covers edge-to-edge record artwork and verified Track Hunt gutters
(20px minimum). Final detector output is empty. Evidence: `readability-check.txt`,
`readability-*.png` and `design-findings-final.json` in the review artifacts.

### Fullscreen stage direction

User feedback: restore the feeling of being at the stage and blend the stage,
record cover and artist portraits. The stage now fills the listening viewport.
A compact record panel keeps real cover artwork, artist portraits and controls
together over the photo. Solid translucent surfaces protect text contrast;
there are no artificial vignettes or masks between the images. This replaces
the previous side-by-side poster and large sleeve composition in the local preview.

Fullscreen composition checks: 320/390/760/1440 px without horizontal overflow;
photo covers the listening viewport; actual live playback continues in Explore.
Screenshots: `stage-desktop.png`, `stage-mobile.png`, `stage-day-mobile.png`.
No production deployment was made.

### Painterly blend and removed panels

The user rejected the boxed composition. The local preview now uses a continuous
stage/cover/portrait composition. Only real matched catalogue images are used;
missing portraits disappear. Credit buttons and Go deeper remain interactive.
The three old Listen accordions (catalogue, changes, audience history) were removed,
along with their script include and styles. Catalogue search remains in Explore.
History and audience data/APIs remain intact; their replacement UI is pending.

### Spotify-only playlist message

The user approved the photographic blend. It stays unchanged. Track Hunt
introductions and profile references are hidden from the site. Each of the five
mapped playlists now links to Spotify with: "Follow this playlist on Spotify"
and "I add new tracks every day." The equivalent German copy is included.
Etage 0 and Fontanna still have no supplied Spotify destination, so no link or
daily-update claim is shown for them. Track Hunt research data remains cached.
