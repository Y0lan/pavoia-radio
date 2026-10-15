# Pavoia Radio: working feature list

Draft for discussion, 7 October 2026. This is not an approved implementation scope.

For current delivery status grouped by category, see [the roadmap](ROADMAP.md).
This document preserves the discussion and decision history; some delivery notes are older.

The supplied Go Deeper feature package is consolidated in
[Go Deeper scope](GO_DEEPER_SCOPE_DRAFT.md). The user clarified that it is a
wishlist to adapt, not a reviewed specification. Only explicit discussion
decisions are confirmed; its details and delivery order remain candidates.

## Purpose

Keep Pavoia's music playing between editions, and let people explore the collection,
its artists, its labels and the choices behind it. Preserve the user-revised
Pavoia/Gaende identity, English/German interface and every original music file.

## Discussion progress

- [x] Compare the old specification and source with the current radio.
- [x] Merge the user-supplied second review and check material differences.
- [ ] In progress: decide listener actions, content scope and acceptance criteria, one topic at a time.
- [ ] Compare delivery approaches and agree the priorities.
- [ ] Present and review the final feature list. Use a visual comparison only when a visual decision needs it.
- [ ] Write and check the approved specification, then prepare its implementation plan.

## Listener playback decisions

Confirmed: live radio plus 60-second individual track excerpts, not full-track on-demand playback.
Preview playback must not change the shared broadcast.
Confirmed: previews cover every track in the owned collection, including tracks
not selected for a radio playlist. Playlist membership affects emphasis, not
preview eligibility. This is approved scope, not implemented.

Current preference: Spotify only for the first version, replacing the earlier
Spotify / Apple Music / Deezer proposal. Offer a link to the matching Spotify
track so the listener can save it there. This means opening Spotify, not an
in-radio account connection or automatic playlist write. Exact track matching
must be verified; a search fallback, if used, must be labelled as search.

Confirmed: when a preview finishes, resume the live station only if it was playing
before the preview; otherwise remain paused. Return to the current live broadcast.

Confirmed: the user wants 60 seconds from the musical highlight of each track.
A fixed midpoint is not the accepted selection rule. "Best moment" is a subjective
editorial target, not a guarantee that an automated method can identify it.
Confirmed: Track Hunt selects excerpts automatically, and the user says this
selection needs improvement. Its stored excerpt_start is a candidate input, not
a curator-approved highlight. Inspect the existing method before reusing it and
check whether its excerpts support a longer 60-second window.
Confirmed: highlight selection must be synchronized between Track Hunt and the
radio. Both must use a shared selection for the same recording, rather than
independently choose different passages. Keep the musical highlight consistent
while accommodating each format's excerpt duration; the radio uses 60 seconds.
Selection improvements should feed both consumers. Existing published Track Hunt
media need not be regenerated automatically. Storage ownership and synchronization
transport are implementation decisions pending inspection of the existing system.
Recommendation: review excerpts across contrasting moods with the user before
catalogue-wide processing. Implementation, access, coverage for other tracks
and source handling remain unresolved. No Track Hunt changes are deployed or
authorized for publication by this discussion alone.
Do not substitute the loudest passage for the musical highlight without validation.

Confirmed failure case: current excerpts start too far ahead of the main musical
moment. Final direction: always target the strongest passage for the track's
mood. A build-up can introduce that passage when musically appropriate, but a
fixed 20-seconds-before-drop rule is not required. Tracks without a drop must
still receive a meaningful highlight. Confirmed: selection remains automatic;
the user declined manual correction controls. Improve and validate the shared
selection method instead of adding an excerpt editor.

## Artist page scope under discussion

The user likes the idea of a wider discography with unavailable releases greyed
out, but currently leans toward showing only music in their collection and
highlighting their liked tracks, similar to Track Hunt. This preference is
tentative, not final approval of a complete artist-page design.

Recommendation for the first version: show releases represented in the Plex
collection, list the tracks actually present, highlight the curator's liked
tracks and show their radio playlist memberships. Do not imply an album is
complete when only some tracks are owned. Use the agreed 60-second excerpts and
verified Spotify links. Keep wider discography as a possible later addition.

Confirmed: "liked" means selected by the curator for the radio playlists.
Membership in any playlist feeding the agreed radio stations is the selection
signal, not library ownership or a separate Plex rating. The "❤️ Tracks" playlist
is one source through Essentials, not the sole definition of liked tracks.
Highlight selected tracks and identify their destination stations. Multiple
playlist memberships do not create duplicate tracks in the artist view.

User clarification: these signals express different levels of preference.
Tracks selected for Pavoia playlists are music the curator likes; tracks placed
in Essentials are personal favorites they like especially strongly. Preserve
this distinction in profiles and filtering: owned but unselected, selected for
radio, and Essentials favorites. Memberships can overlap; Essentials favorites
may also belong to other stations. Essentials membership identifies this stronger
selection; retain raw Plex rating signals without assuming every five-star track
is necessarily in Essentials. No additional rating system is needed.

Catalogue audit clarification: the Hermes export's `liked` field preserves a
different source signal, Plex ratings or the liked playlist. Keep it separately
from radio-selection membership; neither definition invalidates the other.
Suggested UI wording is "Selected for radio" for membership. The user challenged
the need for full-library coverage: it is not needed for broadcast or initial
enrichment. Fetch owned album siblings when needed for the requested unselected
track display, rather than require full-library research.

Confirmed: unselected tracks in owned albums remain visible but visually subdued.
Selected tracks receive emphasis and station labels. Subdued text must remain
readable and meet accessibility contrast requirements; it does not imply that
the track is missing from the collection. Confirmed: unselected tracks also offer
60-second previews, just like selected tracks.

Confirmed: related-artist recommendations include both artists represented in
the collection and artists not yet collected. Distinguish collection availability
from playlist selection. Owned tracks can offer the agreed previews; external
recommendations can link to verified Spotify artist pages without implying local
audio availability. This does not approve a complete external discography import.
Recommendation: explain each suggestion's basis, distinguishing musical similarity
from documented shared labels, collaborations or remix credits. Sources and
ranking remain to be defined. Both linked cards and an interactive map are now
requested, within the two-level experience below.

## Listening view and deeper explorer

Confirmed direction: combine a convenient, focused listener experience with a
"go deeper" area that works as a data-rich web application. Both linked artist
and label cards and an interactive relationship map belong in the intended scope.
The deeper area should expose collection data, workflow and statistics. This
approves the direction, not a finished layout or implementation.

User-specified visual direction for the deeper application:
- A technical interface inspired by terminals, control rooms and explorers.
- Distinctive headings; monospaced labels, numbers and status indicators.
- A full-screen interactive map with compact floating panels.
- Sharp corners, thin borders and clipped edges.
- An instrument-panel feel with game elements and small animations.

Proposed structure: the listening view prioritizes the current track, cover,
artist, stage and a few relevant links. "Go deeper" opens the explorer at the
current artist or release. Playback continues through navigation. Start the map
with relevant nearby relationships, then expand on demand. Selecting an entity
opens one compact detail panel; lists and statistical views serve questions that
a map does not answer well. Preserve the user's Pavoia/Gaende identity and EN/DE.

Proposed interaction safeguards: clear labels, readable contrast, keyboard access,
reduced-motion support and a list alternative to the map. On small screens, use
an appropriate detail sheet instead of overlapping desktop panels. Motion should
explain focus, connections and state changes. Specific game mechanics remain
undefined; the visual reference does not authorize points or reward systems.

Correction from the user: no protected admin area is agreed or planned. The
package's management section must not create that requirement. Public workflow
can expose the musical process and outcomes; its exact contents remain under
discussion. Visitors' playback and exploration controls do not grant catalogue
writes or control of the shared broadcast. No production design changes made.

"Go deeper" entry at an artist or release is confirmed. From there, visitors can
explore the broader data and relationships, not remain confined to that entity.
Filters and selection are shared and can be cleared or changed. The package's
nine-module organization, dark violet-black palette, resizable panels, contextual
inspector, bottom panel, sharing controls and five-phase order are candidate
details to adapt. The previously agreed full-screen map, compact panels and
instrument-panel direction remain. Tables and charts can take focus where useful.

## Public curation calendar decisions

Confirmed on 8 October: the digging calendar and collection statistics are public
for everyone. The user wants a GitHub-style heatmap with day details, especially
when each track was added to a playlist. This is approved scope, not implemented.

Date verification on 8 October: a read-only sample of five tracks from Plex
playlist 146686 exposed addedAt, playlistItemID and sometimes updatedAt. Each
addedAt exactly matched the same track's library metadata. No separate playlist
membership timestamp appeared in that sample. Python PlexAPI's audio documentation
defines addedAt as the library addition date:
https://python-plexapi.readthedocs.io/en/stable/modules/audio.html
This does not establish whether older membership dates can be recovered from
Plex's internal database or backups; that remains unverified.

Keep library addition dates separate from verified playlist addition dates and
the radio's first observation of a membership change. Do not use file timestamps,
playlist update dates or the initial inventory date as historical membership dates.
Unknown actual historical dates remain unknown in source records; the approved
display backfill below supplies invented dates separately. Preserve observed
changes from the monitoring baseline and their coverage information.

Proposed interaction: a yearly daily heatmap, a playlist filter, and a selectable
day showing tracks, artists, destination playlists, 60-second excerpts and Spotify
links where matched. Confirmed: playlist additions only; the user rejected a
library-addition calendar. Initial inventory establishes existing membership and
must not create a bulk addition event on the import date.

Confirmed: the user explicitly approved invented historical dates and the public
title "History", without an "Illustrative history" label. Distribute older tracks
between their release dates and the backfill cutoff to produce regular daily
activity. This is a presentation choice, not recovered evidence of actual saves.
Generate the dates once and keep them stable. Preserve any known membership dates;
mark invented dates internally so they do not overwrite source timestamps or
become evidence for artist research. Do not modify Plex or original music files.

After the baseline, record new additions as detected without randomization.
Detection time from polling is not an exact save time. Historical-date recovery
is no longer a prerequisite. Missing release dates, calendar timezone and counting
rules remain implementation details to resolve. This decision is not deployed.

## Merged findings and corrections

The current radio has stronger explicit playback-failure handling than the inspected
v2 audio engine. Its full reliability acceptance is still open: the public
100-listener test failed, the 24-hour observation is incomplete, and physical
iPhone validation is pending. Android locked-screen playback was user-confirmed
on the earlier pilot.

The principal missing product is curation as content: publicly browsable played
history, digging activity, artist/label pages, music statistics and connections
between records. Current full-library search already covers 90,536 tracks; it is
not restricted to the selected station. It remains basic track-text search,
without separate artist/album/label results or fuzzy matching.

Current audience counts measure audio connections, not unique people. The old
source includes both stream connection counters and WebSocket subscription
counters; its periodic SSE listener broadcast uses the subscription counts.
Calling every old counter an open-tab count would be too broad.

The old calendar first uses sidecar added_to_webradio, then file modification time,
then current time. It is not consistently an original Plex or playlist-addition
date. Our changes endpoint records additions and removals observed after its
baseline, not a complete historical recently-added feed.

The old tag reader extracts BPM, Camelot key, genre and year. It does not extract
label metadata. Researched identities, labels, bios, links and relationships need
separate trustworthy sources. Last.fm/MusicBrainz code is a possible input, not an
automatic substitute for verified Track Hunt data; ambiguous matches must stay
unresolved. No fallback research workflow has been selected yet.

The supplied review counts 103 grouped features, with 24 full and 30 partial.
Its scratchpad/v2-features.md was not available in the checked locations. The
first review retained all 177 explicit specification checklist rows, plus prose
features. These are different counting units; do not combine them or derive a
completion percentage. Source-level implementation is not deployment proof.

## Candidate scope

| Area | Preserve / already available | Candidate additions |
|---|---|---|
| Listen | Seven continuous stations; MP3 320; track fades; reconnect; persistent player; Media Session | Complete stage selection; volume/mute; remember station; stage deep links; decide station fades and individual-track playback |
| Discover a record | Current track/cover/available portrait; library and station search; observed playlist changes | Recent-play history; track/release pages; BPM/key/genre/year/label where supported; playlist membership and liked status |
| Explore the collection | 90,536-track inventory; actual-start records; membership inventory | Artist and label pages; sourced bios/links/photos; multi-artist/remixer credits; album views; search filters; related artists and factual relationships |
| Understand the curation | Per-station audience statistics; observation dates | Digging calendar; additions by period; stage overlap; artist concentration; music distributions; public collection statistics with clear date and coverage definitions |
| Use and operate it | EN/DE; responsive user-revised layout; backups; rollback copies; scoped operations | Source versioning; current reference preview; mobile/network/soak/capacity checks; operator visibility; decide PWA, shortcuts, sharing and later recaps |

These are candidates, not a commitment to reproduce every old visual effect or
technical dependency. Festival live input and equipment remain a later phase.

## Station decisions

| Existing Plex selection | Items verified in the audit | Old role | Current status |
|---|---:|---|---|
| AMBIANCE (145472) | 70 | Ambient / Safe Space | Approved as the separate Ambiance station; not yet deployed |
| Outro (162463) | 91 | Closing | Approved as the separate Closing station; not yet deployed |
| MINIMAL (162633) | 93 | Added to Fontanna | Approved for combination with FONTANNA (145469); not yet deployed |
| Etage 0 - FAST DARK MINIMAL (147259) | 7 | Added to Etage 0 | Approved for combination with ETAGE 0 (145471); not yet deployed |

Confirmed: add Ambiance and Closing as separate stations, bringing the agreed
radio lineup to nine stations. Fontanna will combine FONTANNA (145469) and
MINIMAL (162633), deduplicated by Plex track identity. This combination is
approved but not yet deployed. Etage 0 will combine ETAGE 0 (145471) and
Etage 0 - FAST DARK MINIMAL (147259), also deduplicated by Plex track identity.
Both combinations are approved; neither has been deployed during this discussion.

Closing is a curated playlist station, not festival live ingestion. Playlist counts
do not establish additional unique tracks. Both historical combinations have now been confirmed by the user.

## Operational findings

The repository still has modified and untracked production work; the last commit
is 8ba2fd2. The source exists locally and on Whatbox with deployment backups, but
the current release is not captured in Git. Recommended prerequisite before more
implementation: review the diff, check for secrets, complete required checks and
the mandatory Ponytail gate, then create a recoverable versioned baseline.

The archived design/stage-direction/radio.js still has Etage 0 without a live stage
mapping and omits Fontanna. Production web/app.js has both. The preview server
already serves web/, so the archive is not the deployed UI. Keep one current
reference and clearly identify archives; do not overwrite the revised frontend.

## Proposed discussion sequence

| Topic | Decision needed |
|---|---|
| Listener playback | 60-second musical highlights for all owned tracks; Spotify-only links. Resume live only if previously playing. Automatic selection shared with Track Hunt; no manual editor. Implementation and source handling remain open. |
| Stations and music | Settled: nine stations, with both Fontanna and Etage 0 secondary selections combined. Changes await implementation. |
| Discovery | Artist releases in the collection, selections highlighted, all owned tracks previewable. Related artists inside and outside the collection. Both cards and a map in a deeper explorer approved in principle. Wider discography remains a later possibility. |
| Curation and privacy | Public playlist-only "History": stable invented dates for older tracks, observed dates for new additions. No library-date view or initial-import spike. Define counting rules and timezone. |
| Finish and acceptance | Listen plus connected Explore. Supplied feature package is a wishlist to adapt, not an approved specification. No new admin area planned. Agree listener journeys, scope, layout and acceptance. |

Listener playback mode and duration are selected: 60-second excerpts alongside live
radio. Return behavior and the musical-highlight target are confirmed. The
highlight selection method and source handling remain open.

## References

- [Hermes snapshot and live API audit](CATALOGUE_AUDIT_2026-10-08.md)
- [Complete Go Deeper scope consolidation](GO_DEEPER_SCOPE_DRAFT.md)
- [Full source-backed comparison](FEATURE_REVIEW_2026-10-07.md)
- [Current acceptance evidence](ACCEPTANCE.md)
- [Track Hunt data handoff](TRACK_HUNT_HANDOFF.md)
- User-supplied second review in this conversation, merged with the corrections above.
