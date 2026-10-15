# Radio contracts

| Stage ID | Playlist | Controller port | State directory |
|---|---|---|---|
| palac-feel | 146686 | 14502 | state |
| palac-dance | 145470 | 14503 | state-dance |
| bermuda-day | 146377 | 14504 | state-bermuda-day |
| bermuda-evening | 145468 | 14505 | state-bermuda-evening |
| essentials | 147167 | 14506 | state-essentials |
| etage-zero | 145471 + 147259 | 14507 | state-etage-zero |
| fontanna | 145469 + 162633 | 14508 | state-fontanna |
| ambiance | 145472 | 14509 | state-ambiance |
| closing | 162463 | 14511 | state-closing |

`PAVOIA_STAGE` selects exactly one stage per controller, defaulting to Feel;
unknown values fail startup. Internal services bind to loopback using Podman
host networking. Shared Icecast listens on 14501; Nginx serves the radio on 14500.

All stage-qualified routes below exist for each listed stage, with its own data
and `/stream/<stage>.mp3`. Each controller serves only its configured stage;
Nginx explicitly routes these nine stations. Unknown stage routes return 404.
Only one audio element lives in the page.

Public GET /api/radio/palac-feel returns:
```
{"stage":{"id":"palac-feel","name":"Palac Feel"},"track":{"id":"123","title":"...","artist":"...","startedAt":"RFC3339"},"audience":{"listeners":2,"measuredAt":"RFC3339","available":true},"sync":{"lastSuccess":"RFC3339","trackCount":1094},"streamUrl":"/stream/palac-feel.mp3"}
```
track may be null; listeners may be null when unavailable. No public file paths,
Plex token or internal error details. timestamps UTC. GET /api/radio/palac-feel/stats
returns `{ "available": true, "days": [{ "date": "2026-10-06", "peak": 2,
"listenerHours": 0.5, "measuredSeconds": 900 }], "totals": { "peak": 2,
"listenerHours": 0.5, "measuredSeconds": 900 } }`.
Totals are null until corresponding measurements exist; listenerHours is null
when no complete measured interval exists. Database errors return HTTP 503,
available=false and null totals, never invented zeros. Hours use trapezoidal
estimation between consecutive valid samples no more than 20 seconds apart;
unavailable samples break continuity. Intervals split at UTC midnight; daily
peaks reflect observed counts. Raw samples retain 30 days; daily totals persist.
Current track is null if the mount or file is unavailable, or its last actual
start exceeds the known duration plus 30 seconds (10 minutes for unknown duration).
GET /healthz returns 200 if DB works. Public routes remain functional with no sync.
web/ served by Go using embedded filesystem; only known assets, no directory listing.

Public `GET /api/audience?stage=<id>` returns
`{"listeners":2,"measuredAt":"RFC3339Nano","available":true}` from the primary controller.
The stage is required; missing or unknown values return HTTP 400. One Icecast
sample is shared across requests for one second. The upstream timeout is two
seconds. Browser cancellation does not cancel this shared refresh. Failures are
also cached for one second and return HTTP 503 with unavailable data. A missing
mount returns HTTP 200 with `available=false` and `listeners=null`.
Responses use `Cache-Control: no-store`. The browser requests a sample each second
while visible, rejects stale stage responses and hides unavailable counts.
The ten-second database sampling interval remains unchanged.

Internal endpoints require Authorization: Bearer PAVOIA_INTERNAL_TOKEN:
- GET /internal/next: text/plain annotated URI, e.g.
  `annotate:pavoia_id="123",pavoia_event="uuid",title="...",artist="...":/music/path.mp3`
  return 204 when no playable selection. Annotation escaping must reject control
  characters and escape backslash/quotes. pavoia_event is unique per reservation.
- GET /internal/enabled: text/plain `true` after a successful sync with accessible
  audio, otherwise `false`; 503 on a database failure. Liquidsoap retains its last
  enabled state on transport failures, but gates both sources at track boundaries
  when the controller explicitly returns false. A 204 selection alone does not
  establish an empty stage (tracks may be reserved or temporarily missing).
- POST /internal/played: JSON {"id":"123","event":"uuid","startedAt":"RFC3339"};
  Liquidsoap includes milliseconds from one clock sample, preserving ordering
  against cycle creation within the same second. Retries retain that timestamp.
  optional startedAt preserves the original start during retries; absent uses
  server UTC time. Supplied time must be within the past 48 hours and at most
  5 seconds in the future. First accepted time wins;
  duplicate event callbacks idempotent. Fallback uses pavoia_event if available;
  otherwise callback adapter supplies a unique value per actual playback.
  Accepted/idempotent callbacks return 204; invalid input 400, missing track or
  conflicting event 409, unsupported content type 415, storage failure 503,
  unauthenticated requests 401. Retry transport failures and transient errors;
  retire terminal 400/409/413/415 responses so they cannot starve later callbacks.
- POST /internal/sync triggers complete sync (single-flight).

Paths in Plex are /home/yolan/files/plex_music_library/opus/... or physical alias
/mnt/mpathj/yolan/files/plex_music_library/opus/.... Mount source directory at
the same logical path in both Go and Liquidsoap containers to avoid rewriting
filenames or storing duplicate music. PAVOIA_MUSIC_ROOT config validates containment.
State mounted /state in both containers: Go rw, Liquidsoap ro. fallback.m3u written
under /state, with no fixed playback event in fallback entries. Protect against
symlinks escaping allowed root. Physical aliases are normalized to the mounted
logical root after containment checks; this changes cached names only, never music.
State backups under /state/backups use a consistent SQLite snapshot daily and
retain seven dated copies. Startup rebuilds fallback from the committed database.
Feel mounts host `state/` and Dance mounts host `state-dance/` at `/state`,
so tracks, cycles, callbacks, fallback and audience remain independent even
when both playlists contain the same Plex track ID. No table migration is needed.

Environment: PAVOIA_LISTEN (default 127.0.0.1:14502), PAVOIA_STATE_DIR,
PAVOIA_MUSIC_ROOT, PAVOIA_PLEX_URL (http://127.0.0.1:31711), PAVOIA_PLEX_TOKEN,
PAVOIA_INTERNAL_TOKEN, PAVOIA_ICECAST_URL (http://127.0.0.1:14501).
Plex token only in server request header; do not follow redirects to other origins.
SQLite is accessed by one control process, with short serialized writes.

## Catalogue extension (7 October 2026)

The radio track object additionally returns `durationMs`, `album`, `albumId`,
`artistId`, `coverUrl` and `artistImageUrl` when known. Image URLs are relative
radio routes. Plex URLs, tokens and filesystem paths remain private. Compilation
album portraits are omitted when the track credit differs from the album artist.

GET `/api/radio/<stage>/catalogue` reads committed SQLite metadata and returns
`{ "tracks": [...], "next": "last-id-or-null" }`. Query parameters: `q` (literal
substring in title/artist/album, maximum 200 bytes), `limit` (1–100, default 50),
`after` (previous page's `next`). IDs sort lexicographically. Pagination reflects
the current catalogue, not a frozen multi-request snapshot. Tracks omit start
time outside the live status response. Never interpret catalogue entries as
proof that a track has played.

GET `/api/radio/<stage>/artwork/<track-id>/cover` or `/portrait` serves only
artwork associated with a track in that stage's catalogue. A `v` query identifies
the metadata artwork revision for browser caching. Source paths are restricted
to Plex metadata artwork paths. Plex generates thumbnails within 640 by 640 pixels, without upscaling. Only
bounded JPEG/PNG responses are accepted. Cache keys include the thumbnail profile
so original full-resolution cache entries are not reused. Cached
images remain available without Plex. Per-controller disk cache is capped at
64 MiB, excluding images being downloaded (each capped at 8 MiB). Cache files
are separate from SQLite backups. The image-fetch lock is separate from playback
and metadata synchronization locks. Missing images return 404; upstream failures
return 503. Source redirects are not followed.

Playlist sync commits core tracks and associated artwork metadata together.
An incomplete sync retains both previous datasets. Existing SQLite databases
receive the new additive `track_details` table; no music or tags are modified.

## Selection history (7 October 2026)

GET `/api/radio/<stage>/changes?limit=30&before=<sequence>` returns
`trackingSince` (UTC timestamp or null before the first successful baseline),
`changes` and `next` (a string cursor or null). Each change has `sequence` as a
string, `kind` (`added` or `removed`), track `id`, title, artist, album and
`observedAt`. Newest sequences come first; limit is 1–100. The cursor excludes
newer records, so new observations do not shift subsequent pages.

The first successful synchronization establishes a baseline and records no
invented historical additions. Later successful synchronizations compare the
committed playable selection with the incoming selection. Changes, the baseline
marker and catalogue writes share one SQLite transaction. Incomplete imports,
failed writes and failed commits do not change history. Repeated identical imports
create no duplicate events; metadata edits alone create no membership event.
Removals retain their last known credits even after the track leaves the catalogue.
Re-additions create a new event. Each station retains its own journal.

These are observation dates, not Plex playlist edit dates. Unreadable or restored
audio files can change the playable selection without a playlist edit. Additions
and removals between two successful snapshots are not recoverable. No music,
Plex metadata or playlist is written by this feature. Public history contains no
file paths, tokens or internal errors. Database failures return 503, not a false
empty history. History persists with the station's existing SQLite backups.

## Entire music library

`GET /api/library/catalogue?q=&limit=30&after=` uses the same search and pagination
contract as station catalogues. It adds `library: {total, updatedAt}` for the last
complete snapshot. `updatedAt` is the scan completion time. It is not a track's
addition date. A missing or unreadable snapshot returns 503. The client must not
interpret that response as an empty library.

`GET /api/library/artwork/{id}/{cover|portrait}` serves bounded artwork for snapshot
track IDs, including tracks outside the radio playlists. It shares image validation
and cache limits with the primary controller. Raw Plex paths and tokens stay private.

`python3 ops/catalogue_inventory.py --publish-library --output artifacts/full-music-inventory.json`
refreshes all music metadata. It runs hourly at minute 35 in the server's cron time
zone. The read-only SQLite snapshot is replaced only after successful construction.
No audio files, file tags, Plex playlists or playback queues are modified. Snapshot
publication is atomic; the source Plex scan itself spans multiple paginated reads.

## Broadcast history and music statistics (15 October 2026)

`GET /api/radio/<stage>/history` returns `{stage, from, until, items, next}`.
Each item contains `{id, title, artist, startedAt}` from a confirmed broadcast start.
The period includes `from` and excludes `until`. Both parameters accept RFC3339
timestamps; defaults are the Unix epoch and the request time. `limit` defaults to
50 and accepts 1 through 100. `before` is the opaque cursor returned in `next`.
Preserve `from` and `until` when requesting older pages. Ordering uses descending
start time and row ID, so equal start times do not omit records.

`GET /api/radio/<stage>/music` returns current playable track count, broadcast
start count, distinct played track count, current unplayed track count and the
ten most played tracks. It includes the last-30-day bounds and earliest retained
broadcast time. Historical plays can include tracks removed from the selection.

`GET /api/library/statistics?scope=radio` reads the hourly immutable library cache.
Scope accepts `radio`, `library` or a configured stage ID. Counts include tracks,
artist credit strings, Plex albums and total duration. Distributions cover
artist credits, labels, release years, available track tags and stage memberships.
Release years include every known year, newest first, regardless of track count.
Other distributions show up to 12 entries ranked by track count.
Coverage counts state how many selected tracks have each metadata field.
Shared tracks count once per scope. The full library scope uses music-library
membership; the radio scope uses the union of the configured playlists.

Invalid parameters return 400. Unavailable databases or snapshots return 503,
never an empty successful result. These endpoints do not return paths or tokens.
The history and statistics interface preserves the selected radio stream.
Playlist unions publish only when every source fetch succeeds.

## Basic track details (15 October 2026)

`GET /api/discovery/track/<plex-id>` uses the rich discovery profile when available.
If no rich track matches, it returns public metadata from the immutable library:
title, artist, album, duration and available library artwork. The entity has
`id: "plex_<plex-id>"`, `type: "track"`, `basicDetails: true`, and empty connections.
The response keeps the existing `{entity, included}` shape.

`GET /api/discovery/entity/plex_<plex-id>` resolves the same track. This alias
prefers a rich profile if one becomes available later. Both routes accept only
1 to 32 decimal digits. Unknown tracks return 404; unavailable or corrupt storage
returns 503. Basic aliases do not grant preview access or invent related entities.
The frontend supports reloadable `#explore/plex_<plex-id>` links and library artwork.
It omits empty connection diagrams and lists. Browsing keeps the radio playing.
Track navigation sets its URL before loading metadata. If a rich profile exists,
the alias is replaced in the same history entry with its rich ID.

The header Explore button opens the existing panel. History and Music statistics
are available in that panel. The separate navigation row below the player is removed.
