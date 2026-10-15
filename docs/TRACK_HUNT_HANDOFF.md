# Track Hunt integration handoff

Proposed contract for Hermes, pending inspection of the actual export/API.
No remote API implementation, bulk research run or catalogue import has been
performed by Pavoia. The user confirmed both systems use the same Plex server.

## Ownership and delivery

Hermes owns research, editorial facts and catalogue writes. INSERT/UPDATE remain
private to that service. Pavoia uses authenticated read access from its backend
and serves a local last-successful copy of metadata/images to listeners. No API
key reaches the browser. Hermes downtime must not interrupt radio playback.
A versioned JSON snapshot and bundled assets are sufficient for the first import;
an API can expose the same data for ongoing updates.

## Minimum records

- Track: stable ID, Plex ratingKey as a string plus Plex server identifier,
  existing Spotify URI/ISRC when available, title, duration, release ID,
  artists with explicit primary/featured/remixer roles, playlist memberships.
  Liked status must come from an identified collection or explicit user action;
  do not infer it from every playlist inclusion.
- Release: stable ID, Plex album ID, Spotify album ID where available, title,
  release date, credited label IDs and cover.
- Artist: stable ID, name, available external identifiers, portraits, social
  and music-platform links, sourced biography text with language.
- Label: stable ID, name, image/logo, links and sourced biography with language.
- Relations: source/target IDs, type (collaboration, remix, release on label),
  supporting track/release IDs and evidence. Editorial similarity must be marked
  separately with its basis; do not manufacture related-artist relationships.

Each image needs a readable asset URL or relative snapshot path, source URL,
checksum and dimensions. Preserve known credit/usage information without treating
source provenance alone as permission. No Hermes absolute filesystem paths or
private Plex part/file paths in public-facing data.

Links carry status, confidence, source/evidence and checked_at. Instagram is
publishable only when status is resolved and confidence is official or structured,
as specified by Hermes. Preserve unconfirmed data privately; never silently
promote search_match. Agree other confidence values explicitly before importing.
Biographies need sources, language (EN/DE), verification date and optional missing
value; translations must retain the underlying evidence. Unknown facts stay null.

## Read interface

Agree endpoint names with Hermes's existing implementation. Required operations:
lookup a track by Plex identity with its release/artists/labels; paginated full
snapshot; incremental changes for those entities and assets. Return schema version,
record IDs and updated_at. Incremental sync needs a stable cursor and deletions
(tombstones or a complete replacement snapshot). Publish complete batches so the
reader never accepts half of a nightly update.

Static image URLs must be retrievable by Pavoia's backend without expiring before
synchronisation. Private authenticated downloads are fine; the browser uses the
radio's cached image URLs. No browser dependency on Hermes availability.

## Backfill order

1. Inventory all tracks in the intended Plex playlists against existing Hunts,
   deduplicate by Plex identity and existing artist/release IDs, and report coverage.
2. Reuse known data. Fill missing cover/artist identity/portrait/verified links first;
   source accurate bios and evidenced relations next. Report unresolved matches.
3. Run new research within existing service quotas, with checkpoints and resumable
   batches. Subsequent nightly Hunts update the same records without duplication.

Pavoia now broadcasts all six playlists: 146686 (Lost in Feelings), 145470
(Night in Motion), 146377 (Under the Sun), 145468 (As Night Begins), 147167
(Essentials, explicitly mapped to ❤️ Tracks) and 145471 (Etage 0).
The private Whatbox inventory contains 5,533 unique tracks. Regenerate it with
`python3 ops/catalogue_inventory.py`; it never reads or modifies music files.
The output includes the Plex server identity and playlist membership needed for
matching. Keep private source paths and server identity out of public responses.

Public catalogue reads already exist at
`https://pavoia.gaende.box.ca/api/radio/<stage>/catalogue?limit=100`.
Follow `next` using `after`. Stage IDs and fields are in `docs/CONTRACTS.md`.
These routes provide existing Plex metadata, not researched artist/label facts.

First delivery: backend access instructions or a complete JSON snapshot with
readable assets, plus its schema. Use any real overlapping track to validate
identity and provenance; no specific Hunt number is required. Then import all
available verified records and report missing coverage. Never fill gaps with
unrelated example artists. Do not start paid or quota-heavy research without
agreed service limits.

## Radio selection changes

`GET /api/radio/<stage>/changes` now reports observed additions and removals with
stable sequence cursors and the date tracking began. Use it to prioritize new
research, then confirm membership against the current catalogue. This journal
covers playable radio selections; a missing/restored file can also cause an event.
It is not a historical Plex edit log or an instruction to delete Track Hunt
entities. The same track can remain in other stations. See `docs/CONTRACTS.md`.

## Full catalogue for backfill

Whatbox now has `artifacts/full-music-inventory.json`, schema 2, with 90,536 unique
tracks from all Plex music sections and the six radio playlists. Of these, 85,003
are outside the radio playlists. `playlist_ids` and `library_section_ids` retain
membership. `generated_at` and `completed_at` bound the metadata scan.
The private server identity plus `plex_rating_key` remain the matching keys.
This is an available source file, not a claim that Hermes has received it.


## Rendering records are not the research export

The private `Y0lan/track-hunt-source` repository was inspected at commit
`e9e39f897e747bd87dd88f8c9876eb205dc1a5d6`. Its `docs/DATA_CONTRACT.md` specifies
`hunt.json` for story rendering. The 15 committed preview records do not include
the Plex keys and verification fields needed for this import; some contain synthetic
audio references and repeated Hunt numbers. No preview record was promoted into
the radio's canonical catalogue. The required next input remains the real HUNT.json /
plex_keepers / social registry / asset provenance export from Hermes, with readable
assets and stable Plex identity. No rendering code changes are required for that handoff.
