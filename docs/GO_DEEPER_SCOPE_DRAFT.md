# Pavoia: Go Deeper scope

Working consolidation of a feature package supplied for discussion, alongside
the explicit decisions in [the feature draft](FEATURE_LIST_DRAFT.md). The user
clarified that they had not reviewed the package in detail: they want many of
its capabilities, often with different behavior. Its wording, module boundaries,
layout details and phase order are candidates, not approved requirements.
Nothing in this document establishes deployed functionality.

See [the roadmap](ROADMAP.md) for current delivery status grouped by category.

## Decision status

- Agreed separately: focused Listen plus connected Explore, contextual entry from
  an artist/release, access to the wider data from there, cards and a map, shared
  context, public collection statistics and the instrument-panel visual direction.
- Agreed separately: the playback, selection, preview, Track Hunt synchronization
  and calendar decisions recorded in the feature draft remain in force.
- Candidate: the detailed feature lists below, exact navigation, dashboard controls,
  data capture, metric definitions, comparisons, insights, Wrapped and delivery order.
- Not planned: a new protected admin interface. The user explicitly corrected
  that assumption. No manual excerpt editor is wanted either.

Evaluate feature families through concrete listener journeys; do not treat each
line of the supplied package as a separate approval or a fixed implementation.

## Product contract

Listen answers what is playing. Explore lets visitors follow the music through
artists, releases, labels, selections, discoveries, broadcasts and statistics.
Entering through an artist or release must not restrict the rest of Explore.
Visitors can retain that context, expand it, change filters or reset to the whole
collection. One application shares selection, period, filters and playback.

The package proposes nine conceptual modules: Music Universe, Library, Discovery,
History, Analytics, Timeline, Live Radio, Insights and Wrapped. They are different
views of shared data, not nine independent applications. Do not force every
module into a permanently visible top-level tab or overlay.

## 1. Workspace and cross-view interaction

Candidate layout from the package: a full-screen central graph, left-side exploration navigation,
a right-side entity inspector and an expandable bottom table/history/timeline
panel. Panels can collapse and resize. Include focus/fullscreen modes and a
persistent mini-player. Mobile and tablet must offer practical touch navigation;
keyboard access and a list alternative must cover graph interactions.

All views use the same entity inspector. Search focuses the graph; graph choices
can filter tables; table rows open profiles; profile links expand connections;
charts filter compatible views. Preserve browser back/forward state, filters and
active period. Give visible scope and reset controls. Incompatible filters must
not silently disappear or produce misleading counts. Radio playback remains
independent of explorer navigation and data loading.

Design direction: dark violet-black, restrained accents, sharp rectangles,
clipped edges, thin dividers, distinctive display typography and monospaced
labels, numbers and states. Retain Pavoia/Gaende identity and EN/DE. Use consistent
entity and relationship encoding. Animate focus, expansion, panel transitions,
filter changes and timeline changes; support reduced motion. The instrument and
game references do not themselves request points, rewards or competitive scores.

## 2. Music Universe

Graph controls: zoom, pan, drag, center, reset, fit selection, direct search,
navigation history, hover previews, click selection and focused neighborhoods.
Use a force-directed layout, progressive neighbor loading, expandable/collapsible
clusters and connected-node emphasis with unrelated nodes dimmed. Support metric
based node size and type/genre/stage/community color, plus saved/shareable views.
Load the relevant neighborhood first; do not render the whole catalogue at once.

Entities: artists, tracks, singles, EPs, albums, compilations, labels, genres,
subgenres, radio stages, playlists, Track Hunts and digging sessions. Countries
must support artist relationships and geographic views.

Relationships: artist credits on tracks/releases; aliases; collaboration and
similarity; track/release membership; original/remix/version relationships and
remixer credits; release/label and track/label links; genre assignments; playlist
and stage membership; Hunt membership; artist/country; artist/label relationships
and cross-stage overlap. Show connections through shared labels, releases and
remixes without presenting those links as proof of sonic similarity.

Modes: Artist Network, Label Network, Release Network, Genre Universe, Stage
Network and Discovery Network. Show similarity basis and evidence strength.
Discovery paths require actual recorded links, not inferred causal stories.

## 3. Entity profiles

| Profile | Candidate information and actions |
|---|---|
| Artist | Name, aliases, portrait, sourced biography, country, genres, collected tracks/releases, labels, collaborators, remixes, explained similar artists, stages, track totals, radio plays/airtime, first/latest discovery and playback where known, top tracks, digging and release activity timelines, platform links, expand graph |
| Track | Title, cover, full credits, release, label, release date/year, genres/tags, duration, BPM, key/Camelot, playlists/stages, plays and first/latest broadcast, available addition/discovery dates and sources, digging/Hunt references, similar tracks, original/remix/alternate versions, linked entities, permitted playback |
| Release | Artwork, title/type, contributors, label, catalogue number, release date, tracklist, owned and playlist-selected tracks, broadcast status, statistics, related editions/releases/remixes, discovery context and external sources |
| Label | Name, logo, country, sourced biography and links, associated artists, collected releases/tracks, genre/stage distribution, growth, most-played tracks, first/latest discovery and related labels with explanations |
| Genre/stage | Identity/description, artists/tracks/labels, BPM/key/year distributions, evolution, representation and crossover, most-played and recent discoveries, neighboring genres/stages |

Keep prior decisions: show owned releases first, highlight playlist selections,
keep unselected owned tracks visible but subdued, and preview every owned track
for 60 seconds. Selection is playlist membership, not a separate star rating.
Do not present partial albums as complete. A complete tracklist, when reliably
available, can show missing tracks without promising playback. Full external
artist discographies remain a later possibility, not a prerequisite.

Related artists include those inside and outside the collection. Verified
Spotify links provide an external destination; local preview availability must
remain explicit. Prioritize Spotify for listener music links; retain verified
artist/label social links and research provenance as already requested.

Full-track on-demand playback is superseded by the agreed preview model.
Audio download appeared as conditional in the supplied inventory and is not
enabled. Recommendation: omit it from the release scope. Metadata and chart
export are separate candidate features.

## 4. Library and global search

Unified track/artist/release/label catalogues with table, cover-grid and graph
views; compact/expanded density; sortable/customizable columns; multiple filters;
autocomplete; counted facets; pagination or virtualization; grouping by artist,
label, genre, year, stage and country. Support entity comparisons, permitted
metadata export and copied entity/filter links. Find versions/remixes, stage
overlap and underrepresented artists/genres/labels. Show missing metadata.

Global search also covers genres, stages, Hunts, sessions, history and discoveries.
Include Ctrl+K/Cmd+K, categorized suggestions and recent searches. Shared filter
chips support appropriate AND/OR combinations, individual reset, clear all,
result counts and saved/shareable views. Saved views need not require accounts;
storage and sharing behavior are implementation decisions.

## 5. Digging calendar and sessions

Calendar: full-year heatmap, year selection, year comparison, day/week/month
breakdowns, hover counts, day details, color by volume/stage/genre/decade/country,
and artist/genre/stage/label/date filters. Calendar events represent playlist
additions, not Plex library imports.

Metrics: additions by period, new artists/labels, active days, current/longest
streak, most productive periods, longest inactivity, additions per active day,
weekday/hour distribution and stage distribution. Each metric needs a defined
counting unit and data coverage. A track in two playlists is not automatically
two unique tracks.

Sessions: recorded evaluated releases/tracks; listened, revisited, accepted and
rejected states; movement into playlists/stages; keeper counts; related graphs.
Only show evaluation states and transitions when recorded. Membership alone
does not establish evaluation, rejection, first listen or the reason for selection.

## 6. Discovery and Track Hunt

Public feed: chronological additions, newly discovered releases/artists/labels,
first appearances, stage assignment, available timestamps, artwork and metadata;
filter by genre, stage, label, source and period; enter the graph from any record.

Hunt browser: numbered Hunts, investigated releases/artists, evaluated tracks,
keepers, first/repeat-listen decisions when recorded, playlists, discovery trail,
published content links, contributions to stages and comparisons between Hunts.

Metrics: investigated versus collected, defined acceptance rates, new artists and
labels per Hunt, repeat listening, discovery-to-selection delay, productive
artists/labels/sessions and genre/date trends. Denominators must reflect the
recorded population. Do not equate inspected, selected and broadcast music.

Track Hunt and the radio share automatic musical-highlight selection. The radio
uses 60 seconds around the strongest passage; no manual excerpt editor is wanted.
Inspect and improve the existing selector before catalogue-wide processing.

## 7. History and Live Radio

Playback history: every recorded start by stage, timestamp, artist/track/release/
label, duration/status, chronology, period navigation, search, advanced filters,
counts, replay frequency, time since broadcast and first/latest appearances.
Link records to previews and graph nodes. Distinguish actual playback from a
scheduled queue item; unavailable ended/status data must remain unknown.

Collection history: recorded additions, stage/playlist assignment changes,
first artist/label appearances, removals/reclassifications and selected-versus-
broadcast comparisons. Keep original library dates distinct when displayed as
metadata; they do not drive the digging calendar.

Live views: every stage, current artwork/metadata, listener counts and total,
availability, progress/remaining time, recent tracks, upcoming queue where exposed,
stage statistics/trends and stage switching that retains Explore context.
Current tracks/artists/releases open the shared inspector and graph.
Queue availability is a capability to verify, not an existing guarantee.
Audience counts measure audio connections, not identified unique people.

## 8. Analytics

| Dimension | Candidate views |
|---|---|
| Geography | Country choropleth, artist/track distribution, regions, concentration and discovery trends |
| Release date | Decade stacked bars with year drilldown, yearly distributions and evolution |
| Genres | Weighted tags, rankings, distributions and evolution area charts |
| Labels/artists | Label treemaps, release/artist counts, most-collected/played/recent entities |
| Audio metadata | BPM histogram/density/means/trends, key/Camelot wheel and stage comparison, duration distribution and collection duration |
| Stages | Track/artist totals, airtime, genre profile, growth and cross-stage overlaps |
| Activity | Plays and frequency, airtime by entity/period, additions, discoveries, diversity/concentration and recency |

Charts support details, underlying-record drilldown, click-to-filter, periods,
stage/category comparison, multi-selection, absolute/percentage values, sorting,
grouping, historical comparison, definitions and permitted export/sharing.

Advanced views: growth versus broadcast; collected but rarely played tracks;
low-play artists with multiple tracks; artists with a single collected track;
label exploration depth; stage genre diversity; overlap matrix; unusual genre
combinations; old releases newly discovered; recent releases entering the
collection; rediscovered artists; BPM/key, genre/decade, artist/label and
country/genre matrices. Use factual labels: low radio play count alone does not
prove an artist is underrated or unpopular elsewhere.

## 9. Timeline, Insights and Wrapped

Timeline combines additions, artist/label discoveries, playback, genre/BPM changes,
stage composition, milestones, large sessions, first appearances and Hunt
publication. Compare periods. Historical graph reconstruction requires membership
events or snapshots; current membership filtered by invented dates is insufficient.

Insights cover country, BPM, genre and decade shifts; new top artists and labels;
neglected stages; discovery pace; diversity; replay/discovery behavior; emerging
labels/genre combinations; release age; stage overlap; new discoveries entering
heavy rotation; artists absent from rotation; new graph connections; unusual
sessions; growing communities and stage imbalance. Every claim links to its
supporting records, period, comparison and explanation. Unknown data is not zero.

Wrapped provides monthly/yearly archives: selected tracks, new artists/labels,
radio plays and broadcast hours, top tracks/artists, genres/labels, geography,
decades, BPM/key, digging and streaks, active dates, changes, discoveries and
stage highlights. Include animated storytelling and shareable graphics. Keep
broadcast hours distinct from listener-hours and collection duration.

## 10. Public workflow, without a new admin interface

The user corrected the package's protected-admin assumption. No new /admin route,
management dashboard or web editing controls are planned. Existing operational
tools remain separate; there is no need to build an admin application for visitors
to explore musical data.

Public workflow candidates include discoveries, digging, Hunt outcomes, selection
history, broadcasts, relationships and statistics. Exact visible stages and data
still need definition. Public status must not expose secrets, private paths or
internal logs. Visitor navigation and playback do not grant catalogue-write or
shared-broadcast control. This does not require a new admin UI.

## 11. Evidence and shared data requirements

Stable entity/recording identities; deduplication and aliases; sourced relationship
records and confidence; dated events; session capture; stage/playlist membership;
actual broadcast events; search indexes; efficient graph neighborhoods; aggregate
statistics; period/dimension filters; incremental sync; missing-data states;
privileged access controls; caches; large-collection rendering; shareable URL state
and consistent graph/list/chart contracts. Select technologies after inspecting
the existing implementation and data sources; no new service is chosen here.

Keep the user's prior invented-date decision scoped to the historical calendar
display. Preserve the synthetic marker internally. Recommended reconciliation
with this inventory's evidence requirements: do not use invented dates as proof
of first listening, rejection, discovery delay, historical membership, causal
discovery paths or factual taste-change insights. Real event capture proceeds
from the available baseline. Coverage and provenance must survive aggregation.

Previously recorded blockers still require verification: Hermes access/data
contract, enrichment coverage, historical event availability, excerpt quality,
exposed queue semantics, required mobile/capacity acceptance and a versioned
production baseline. They do not prevent building views over available data.

## 12. Proposed delivery and validation

| Phase | Usable outcome | Validation focus |
|---|---|---|
| 1. Core exploration | Shared state/search, artist/release/track/label inspectors, library, persistent playback and a focused artist graph | From the playing track, open artist, browse owned releases, follow a label, change filters, return through browser history without audio interruption |
| 2. Connected universe | Label/release/remix/genre/stage relations, modes, progressive expansion and advanced filters | Explained relationships, stable identities, bounded loading and consistent results across graph/list |
| 3. History and digging | Playback history, discovery feed, calendar, historical drilldown and Hunt explorer | Date provenance, explicit coverage, correct membership counts and recorded event distinctions |
| 4. Analytics | Musical dimensions, chart filtering, comparisons and matrices | Chart totals reconcile with the visible records and metric definitions |
| 5. Insights and retrospectives | Evidence-backed insights, supported historical evolution, discovery journeys and Wrapped | Every statement can be traced to source data and a defined comparison period |

The package contains this phase order; it is retained as a candidate, not a decision
to build everything before the next review. Capture usable events early, even
when their views arrive later. Protect the existing player throughout.

Recommended first-review artifact: one populated artist-centered Explore screen,
with a connected label, shared inspector, library panel and navigation back to
Listen. Evaluate information density and mobile behavior before generalizing the
layout. This does not replace implementation or acceptance with a visual mock.

Proposed deferrals, awaiting agreement: audio downloads omitted; exhaustive
external discographies later; configurable graph appearance and custom columns
after useful defaults; historical graph time travel only when data supports it.
The modules, links, profiles, statistics and Track Hunt integration remain in
the candidate inventory for adaptation and prioritization.
