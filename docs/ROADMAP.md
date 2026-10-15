# Pavoia Radio: features by category

Updated 15 October 2026, after the stage controls and live audience release.

This is the current index of remaining work. It groups existing decisions and
ideas; it does not approve the whole wishlist or set a delivery schedule.
The decision history remains in [the feature draft](FEATURE_LIST_DRAFT.md).
The detailed Explore wishlist remains in [Go Deeper scope](GO_DEEPER_SCOPE_DRAFT.md).

Status includes the 15 October release and its API, stream and browser checks.
Physical-phone, long-duration and high-load acceptance remain separate pending work.

## Status labels

- **Delivered:** published; see the linked release evidence.
- **Approved, pending:** an agreed feature that still needs implementation.
- **Partial, approved:** a working foundation exists; the agreed outcome is incomplete.
- **Candidate:** an idea to select and define before implementation.
- **Verification pending:** an existing capability or operating target needs evidence.
- **Later:** explicitly outside the current phase.

## Already delivered

- Nine continuous stations, reconnect handling, play/pause, volume, track progress,
  Media Session controls, and an optional waveform from actual audio.
- EN/DE, selected stage photos, manual photo changes, photo counters and fades,
  control feedback, reduced motion, and the approved emotional descriptions.
- **Change stage** opens eight photo rows and an Essentials row with a globe and sprinkles on mobile.
  Horizontal swipes include all nine stations, with a discreet swipe hint.
  Full approved descriptions appear directly below the title over one photograph.
- A radio icon beside the wordmark, plain Explore text, and record details in
  the player. Artist and label links preserve playback; Spotify uses known links.
- The per-stage Live count refreshes each second from a shared Icecast sample.
- The hidden Bus scene, its shareable `#bus` route and ticket link. Visiting it
  preserves the playing station. The Bus row always comes last, immediately after Essentials. Both have a Special label.
- Explore search and track, artist, release and label profiles, with
  available metadata, links, membership badges and a small connection diagram.
  Entity navigation and browser history preserve radio playback. Tracks without
  rich profiles open their available library details.
- Playback of prepared 60-second previews with the agreed live-resume behavior.
  Collection-wide preview coverage and musical quality are still unfinished.
- Public playback history with stage and period filters, plus selection statistics,
  stage overlaps, and broadcast statistics for the last 30 days. Both views are
  reached through Explore. Release years include all known years, newest first.
- Stored broadcast starts, observed playlist changes, audience measurements,
  catalogue caching, documented hourly Hermes refresh, backups and release rollback.
  Stored data does not mean all corresponding public views exist.

## 1. Stations and programming

| Feature | Status |
| --- | --- |
| Add Ambiance from playlist `145472` | Delivered: 70 playable tracks at release |
| Add Closing from playlist `162463` | Delivered: 91 playable tracks at release |
| Combine Fontanna `145469` with MINIMAL `162633`, without duplicate tracks | Delivered: 746 playable tracks at release |
| Combine Etage 0 `145471` with FAST DARK MINIMAL `147259`, without duplicate tracks | Delivered: 181 playable tracks at release |
| Extend metadata coverage to these additional selections | Partial, approved |
| Broadcast live from the festival, including input and equipment arrangements | Later |

The agreed lineup is nine stations. Closing is a curated playlist station;
festival live input is a separate project. All nine stations are now public.

## 2. Listening, access and sharing

| Feature | Status |
| --- | --- |
| Remember the last selected station without forcing autoplay | Candidate |
| Open and share a specific radio station through its own URL | Candidate |
| Application shortcuts and shortcut help, beyond existing native keyboard controls | Candidate |
| Installable PWA with an offline interface; live audio still needs a connection | Candidate |
| Lower-bandwidth audio options, a dedicated mute button and other audio settings | Candidate |

The Bus and Explore entities already have routes. Ordinary station links are
still missing. Volume control already exists. The user chose to keep native
single-stream playback and its station connection gap; audio crossfading is not
an outstanding requirement.

## 3. Explore the music collection

| Feature | Status |
| --- | --- |
| Expand artist/release views with owned album tracks, including unselected tracks | Partial, approved |
| Clearly distinguish owned music, radio selections and Essentials favourites throughout those views | Partial, approved |
| Extend artist recommendations inside and outside the collection, with a clear basis for each connection | Partial, approved |
| Grow the existing diagram into the agreed connected Explore experience, with shared context and usable mobile navigation | Partial, approved |
| Advanced library filters, sortable tables, cover grids and saved/shared views | Candidate |
| Graph zoom/pan, clusters, and artist/label/release/remix/genre/stage modes | Candidate |

Basic profiles, entity search and connections are already available. The full
Music Universe is not. A shared label or remix credit is a factual connection,
not proof that two artists sound alike. Wider external discographies remain a
later possibility; they are not required for owned-album browsing.

## 4. Audio previews and Track Hunt

| Feature | Status |
| --- | --- |
| Validate automatic selection of the strongest musical passage across contrasting moods | Partial, approved |
| Prepare 60-second previews for all owned tracks, including unselected album tracks | Partial, approved |
| Share highlight positions between the radio and Track Hunt | Approved, pending |
| Browse Track Hunts, evaluated releases, keepers and recorded discovery trails | Candidate |
| Compare Hunt outcomes and discovery-to-selection activity where events exist | Candidate |

The playback mechanism works with prepared samples. The documented highlight
trial does not establish collection-wide coverage or accepted musical quality.
Track Hunt synchronization is still unfinished. No manual excerpt editor is
wanted. Full-track on-demand playback is outside the agreed preview model.

## 5. History and digging

| Feature | Status |
| --- | --- |
| Public playlist-addition calendar with a yearly heatmap and day details | Later: user deferred it on 15 October |
| Calendar playlist filters, counting rules and timezone | Approved scope; details pending |
| Public recent-play history with station and period navigation | Delivered at `#history` |
| Public discovery feed and collection-change browsing | Candidate; membership-change records exist |
| Session views for first listens, revisits, acceptance and rejection | Candidate; requires the corresponding events |
| All-station now-playing overview and recent tracks | Candidate |

Playlist additions, library imports, broadcast starts and first listens are
different events. The calendar must not treat the first inventory as a mass
playlist-addition day. The separately approved historical display backfill is
not built. Keep synthetic dates separate from real records and factual analytics.

## 6. Music and curation statistics

| Feature | Status |
| --- | --- |
| Public collection statistics with clear definitions and coverage | Delivered at `#statistics` |
| Artist, label, release-year and stage distributions | Delivered; charts show metadata coverage |
| Genre distributions | No current track-tag coverage |
| BPM and key analysis | Excluded from this release; BPM metadata is absent |
| Country and collection-growth charts | Candidate views; data coverage needed |
| Stage overlaps and frequently played records | Delivered |
| Selected tracks not played during the last 30 days | Delivered as a count per station |
| Browse collected-but-rarely-played music | Candidate |
| Comparisons and charts that filter or open the underlying records | Candidate interactions |

Audience statistics already exist in the backend. They count audio connections,
not identified people. Listener activity, collection statistics and curatorial
decisions need separate measures. Missing data must remain distinguishable from zero.

## 7. Stories, insights and recaps

| Feature | Status |
| --- | --- |
| A timeline joining documented additions, discoveries and broadcasts | Candidate |
| Explain changes in taste, stage composition or discovery activity using supporting records | Candidate |
| Monthly and yearly Wrapped-style recaps | Candidate |
| Shareable recap graphics and an archive of previous periods | Candidate |

These depend on useful history and statistics. Historical graph reconstruction
and discovery stories need real events; invented calendar dates cannot establish them.

## 8. Reliability, data quality and release management

| Remaining work | Status |
| --- | --- |
| Capture the delivered source in Git while preserving existing edits and passing the mandatory review hook | Pending |
| Improve missing Spotify matches, entity identities and sourced metadata for selected music | Partial |
| Physical iPhone background playback and mobile network-change checks | Verification pending |
| Complete a continuous 24-hour observation | Verification pending |
| Resolve the documented public HTTPS capacity limit and verify the 100-listener target | Verification pending |

The historical 100-stream test did not meet the full website/API acceptance
target. The latest operations documentation records a temporary combined cap of
90; this inventory did not remeasure capacity. Current release records and rollback
copies exist, but they do not replace a versioned source baseline.

## Scope boundaries

- No new protected admin application or visitor controls over the shared broadcast.
- No new rating system: radio membership and Essentials membership already express
  the agreed selection levels.
- No automatic commitment to every feature or technology in the older audit.
- No requirement to change the approved visual identity to complete Explore.
- The Bus, photos, descriptions, basic Explore, volume and recent polish are delivered,
  not pending features.

## Evidence and decision sources

- [15 October stage controls](STAGE_CONTROLS_2026-10-15.md): live count latency, full mobile descriptions, navigation and player details.

- [15 October mobile layout](MOBILE_LAYOUT_2026-10-15.md): phone layout, station sheet, gestures, visual review and release checks.
- [15 October corrections](RADIO_CORRECTIONS_2026-10-15.md): station copy, Bus order, navigation, basic track details and year order.

- [15 October stations, history and statistics](STATIONS_HISTORY_2026-10-15.md): release scope, counting rules, coverage and checks.
- [Feature decisions](FEATURE_LIST_DRAFT.md): approved stations, previews,
  collection visibility, calendar and scope boundaries.
- [Go Deeper wishlist](GO_DEEPER_SCOPE_DRAFT.md): candidate views and interactions.
- [9 October handoff](SESSION_HANDOFF_2026-10-09.md): deployed foundation, remaining
  data work, preview trial and operational limits.
- [14 October polish release](POLISH_RELEASE_2026-10-14.md): completed interaction work.
- `artifacts/intentions-release-20261015/`: latest descriptions, deployed source
  snapshot, public checks and release records.
- [Earlier full comparison](FEATURE_REVIEW_2026-10-07.md): historical inventory;
  its missing-feature labels must not be read as current status.
