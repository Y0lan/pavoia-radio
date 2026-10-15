# Hermes catalogue audit, 8 October 2026

## Verdict

This is a useful seed for playlist-centered radio metadata and Explore. Its
read-only API works. No production, Plex or Hermes records were changed.

The full Plex library is not required for broadcasting or initial enrichment.
To show unselected owned tracks in an album, fetch that album's tracklist when
needed. The user challenged full-library coverage as a requirement; it is not one.

Source: `/home/yolan/Downloads/Telegram Desktop/pavoia-catalogue-2026-10-08`.
Snapshot built `2026-10-08T01:05:04Z`, exported `01:40:19+00:00`, cursor 47971.
Local files occupy about 56 MiB. This report separates computed coverage, limited
live checks and source documentation. It does not certify every fact or identity.

## Measured contents

| Data | Count | Detail |
|---|---:|---|
| Unique tracks | 5,910 | All belong to an exported playlist; no duplicate Plex track keys |
| Playlist memberships | 7,022 | 996 tracks belong to multiple playlists |
| Releases | 2,224 | 2,198 cover references/dates; 1,611 labels; 723 formats |
| Artists | 4,337 | 2,983 with images (68.8%); 2,018 biographies (46.5%); 3,461 with links (79.8%) |
| Labels | 783 | 613 with images (78.3%); 545 biographies (69.6%); 713 with links (91.1%) |
| Track Spotify matches | 699 | 11.8%; 5,211 lack a Spotify object |
| Track identifiers | 1,353 ISRC; 1,975 MusicBrainz recording IDs | Partial matching inputs |
| Track label associations | 4,062 | 68.7%; 1,848 missing |
| Geography | 1,234 artists; 300 labels | Countries cover 28.5% and 38.3% respectively |
| Artist tags/styles | 2,707 with tags; 385 with styles | Artist metadata, not per-track genre evidence |
| Track Hunt references | 45 releases; 115 keeper tracks | Hunt summaries and keeper slugs, not a complete evaluation journal |

Biography language fields are English only. Text depth varies: 404 main artist
bios and 323 main label bios have fewer than 150 characters.

Exported stations: Under the Sun 1,113; Lost in Feelings 1,094; Night in Motion
1,625; Fontanna 660; Etage 0 174; As Night Begins 2,040; Essentials 316.
These are snapshot counts, not a new production synchronization.

Missing from the agreed future lineup: Ambiance (145472), Closing/Outro (162463),
the extra MINIMAL source (162633) and extra Etage 0 source (147259). The eventual
nine stations use 11 source playlists, deduplicated within each station.

## Plex liked versus radio selection

The export correctly preserves its source definition: Plex five-star ratings or
the liked playlist. Its `liked.value` is true for 316 tracks, false for two and
unknown for 5,592. This is not an export defect.

Earlier discussion called any track selected for a radio playlist "liked". All
5,910 exported tracks satisfy that separate rule. Preserve both signals. Proposed
UI wording: "Selected for radio" with station badges for membership. Do not
overwrite Plex ratings, or treat unknown ratings as false. This wording is a
recommendation, not an additional approved interface decision.

## Relationships already available

There are 6,722 directed related-artist records with collaboration, remix,
shared-release and some MusicBrainz evidence. Many reference concrete track or
release IDs. There are 104,794 directed similarity suggestions from Last.fm and
Plex metadata. These are not unique undirected edge counts.

Of those suggestions, 76,978 point outside the catalogue, representing 38,901
case-folded names. These are suggestions, not complete researched profiles or
resolved identities. This supports internal/external discovery with explicit
availability. Shared compilation membership does not prove collaboration or
sonic similarity. Source scores are not calibrated confidence probabilities.

## Live API, images and Plex checks

The image manifest references 8,223 files, 8,198 unique SHA-1 values and
964,808,056 bytes (920.1 MiB). Image bytes are not in the snapshot. Sources include
Plex, Beatport, Resident Advisor, Discogs, Cover Art Archive, Spotify and websites.
1,218 files have a minimum dimension below 600px; small logos/covers are not
automatically defective portraits.

Authenticated GET checks returned HTTP 200 for info, coverage, an expanded track
lookup, a two-track catalogue page, current and historical change pages and one
cover. The downloaded JPEG matches the manifest SHA-1. Other images were not
downloaded or visually certified.

Live info matched the snapshot counts and cursor 47971. The current change page
was empty. An older one-event page advanced 47969 to 47970 with `has_more=true`.
This checks basic paging, not a deployed synchronization loop or concurrency,
retention, deletion propagation and recovery behavior.

Documentation describes two-hour Hermes refreshes and read-only GET access.
The refresh schedule was not observed over multiple cycles. This API cannot
submit research jobs or edit metadata; improvements need the Hermes pipeline.

Seven playlist sample checks, covering six unique track IDs, matched titles on
the existing Whatbox Plex server. Bind the integration to this known server:
the export lacks a Plex server identifier and rating keys are not globally unique.

Concrete album example: Jimi Jules' "+" (Hunt 41, Plex album 143089) exports one
selected track, while Plex contains 12 owned tracks. Release `track_ids` therefore
does not guarantee a complete owned-album tracklist. Targeted album expansion
supports the requested subdued unselected tracks without full-library research.

The API key is stored privately outside the repository, with mode 0600. It is
not in the frontend or this report and has not been installed on Whatbox.

## Integrity and quality findings

All ten manifest checksums/sizes and entity counts match. Checked track, release,
credit, playlist and graph-evidence references resolve. Playlist counts and
checked reverse memberships agree. None of the 69 tombstones overlap live
records. Tombstones represent deletions, not live profiles. Structural integrity
does not prove musical correctness.

| Finding | Evidence | Treatment |
|---|---|---|
| Ambiguous biographies | 102 main bios mention multiple artists with the same name; 128 artists have such wording in any bio | Review or hold ambiguous text and dependent matches. These are heuristic flags, not 102 proven wrong identities |
| Alias/identity collisions | Eight artist groups share MusicBrainz IDs; seven share Discogs IDs | Resolve canonical identities while preserving performing aliases. Examples: H.O.S.H./HOSH and DJ Daddy Trance/Marlon Hoffstadt |
| Self recommendations | 21 graph records link an artist to itself | Suppress self recommendations and inspect matching |
| Stale nested release dates | Five tracks lack dates present in their referenced release | Read canonical releases and fix denormalized updates upstream |
| Date precision | 1,120 release dates end in January 1; 2,195 dates come from Plex | Check year-only normalization before claiming an exact release day |

Example requiring review: Phobia receives remix credits on Sidekick's "Deep Fear"
club mixes, but its biography describes multiple homonyms including a grindcore
band. The export does not resolve which biography belongs to those credits.

All 19,792 exported artist/label links carry `verified`; another 10,864 are reported
held back. This audit did not corroborate all links independently. A real URL
associated with the wrong homonym is still a bad identity match.

The unresolved report lists 237 Spotify no-match records, but 5,211 tracks have
no Spotify object. It is not a complete backlog. Separate unprocessed, failed,
ambiguous and genuinely unmatched records when scheduling work.

One sampled release puts a Plex cover of rank 2 before a Discogs cover of rank 1.
Confirm whether array order or numeric rank determines preference before sorting.

## Missing inputs for the broader roadmap

The export contains no audio, excerpt/highlight offsets, BPM/key/Camelot fields,
per-track genre fields, full Hunt evaluations/rejections/relistens, radio playback
or audience logs, or original playlist-addition event history. Those require
Plex/audio analysis, Track Hunt operations and the radio's existing records.

Entity `created_at` dates concentrate on 6-7 October 2026. These are catalogue
record creation dates, not historical playlist-save dates. Release dates, Hunt
dates, catalogue timestamps and radio observations are distinct. The earlier
synthetic calendar decision does not make these evidence of original listening.

## Recommended next increment

1. Import into an isolated local cache with provenance and tombstone handling.
   Keep broadcast playback independent of Hermes availability.
2. Apply quality controls for identities, canonical release metadata, self edges
   and separate radio-selection/Plex-rating semantics.
3. Cache images needed by a focused Explore prototype; add resumable change-feed
   updates. Do not download the whole image bank for every request.
4. Extend Hermes to the four missing source playlists. Prioritize identity,
   Spotify matching and missing profiles for radio selections.
5. Add targeted album tracklists and shared highlight/event contracts. Keep
   unresolved facts unknown rather than promising complete metadata.

These are recommendations. No importer or production integration was deployed.

## Evidence

Reproducible scripts and results are in `artifacts/catalogue-audit-20261008/`:
`audit_snapshot.py`, `report.json`, `summary.json`, `check_live.py`,
`live-checks.json`, bounded live responses, `check_plex_mapping.py`,
`plex-mapping.json` and one downloaded cover. Live scripts use private credentials
and bounded read-only requests. Offline checks take explicit input/output paths.
