# Pavoia Radio: features by category

Two sites play the same nine stations. Production, https://pavoia.gaende.box.ca/,
serves the release before this build (commit 633804a). Dev,
https://pavoia-dev.gaende.box.ca/, serves this build. On dev the player keeps
reconnecting, every station has a link, new keys work, the radio has an install
icon and a link preview, the Index is faster to move in, Statistics counts open
the Index, each playlist shows its changes, and History shows what all nine
stations play now. This file tells a newcomer what exists, what waits and who
acts, and what is out. This file is item H of the build.

This is the index of remaining work. It groups decisions and ideas. It does
not approve the whole wishlist and it does not set a schedule. The decision
history is in [the feature draft](FEATURE_LIST_DRAFT.md). The detailed Explore
wishlist is in [Go Deeper scope](GO_DEEPER_SCOPE_DRAFT.md).

Each item of this build carries a letter from A to J, once. Its row names its
address, key or place, and the text under the table names the tests that pin
it. Unit tests are in [tests/player.cjs](../tests/player.cjs); run them with
`node --test tests/player.cjs tests/closeness.cjs`. Browser tests are the
`tests/*-browser.js` files.

## Status labels

- **Delivered:** published on production; see the linked release evidence.
- **Built, on dev, waits for the owner's push to prod:** the code is in Git and
  dev serves it. It becomes Delivered when production serves it.
- **Approved, pending:** an agreed feature that still needs implementation.
- **Partial, approved:** a working foundation exists; the agreed outcome is incomplete.
- **Candidate:** an idea to select and define before implementation.
- **Verification pending:** an existing capability or operating target needs evidence.
- **Waiting:** outside this build. The [Waiting](#waiting) section names the
  condition and who acts.
- **Out:** not planned for this site. [Scope boundaries](#scope-boundaries) say why.

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
- The Live count of each station refreshes each second from a shared Icecast
  sample. It counts audio connections, not people.
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
- The Index lists every artist and label of the playlists (`#index/artists`,
  `#index/labels`). The stations show **By stage** or **By feeling**. Production
  serves both (commits 9fb3aba and 267348c).
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
| Broadcast live from the festival, including input and equipment arrangements | Out |

The agreed lineup is nine stations. Closing is a curated playlist station.
All nine stations are public.

## 2. Listening, access and sharing

A listener on a train loses the network for a minute. On production the
player tries four times in about 15 s, then stops with "Stream lost. Press
play to retry." On dev it keeps trying, and the music comes back without a touch.

| Feature | Status | Where, or why |
| --- | --- | --- |
| The player keeps reconnecting while the listener wants to play (item A) | Built, on dev, waits for the owner's push to prod | It tries at +1, +3, +7, +15 and +30 s, then every 15 s, and at once when the network comes back or the page shows again. It says "Reconnecting…" or "Offline. Waiting for the network…". A pause stays a pause. |
| Open a station by its own address, and come back to the last station, with no autoplay (item B) | Built, on dev, waits for the owner's push to prod | `/?station=<id>`, for example `/?station=fontanna`. The address always names the station on screen. The browser keeps the last station chosen or played (`pavoia-station` in localStorage). A link wins over the remembered station. With empty storage and no link, the radio opens on Lost in Feelings. |
| Keys `1` to `9`, `M` and `?` (item I) | Built, on dev, waits for the owner's push to prod | `1` to `9` go to the station at that place in the order on screen, as the rail does, and never start playback. `M` turns the sound off and on again. `?` opens the Keyboard shortcuts list under "See the roots it's built on", while the explorer is closed. No key acts while typing, with a modifier key or while a modal dialog is open. |
| Mute | Built, on dev, waits for the owner's push to prod | The `M` key sets the volume slider to 0 and back. There is no dedicated button. The key acts only where the slider shows, and the radio does not store it. |
| Installable home-screen icon; no offline interface, no service worker (item G) | Built, on dev, waits for the owner's push to prod | [web/manifest.webmanifest](../web/manifest.webmanifest) and four icons in `web/assets/`, made from the Gaende mark. The installed app opens full screen at `/`, named "Pavoia". Live audio needs a connection. |
| A shared link shows a preview (item J) | Built, on dev, waits for the owner's push to prod | Description and Open Graph tags in `web/index.html` give "Pavoia Radio", "So it never ends. A personal selection by Gaende." and the photo `photos/hero-night.jpg`. One preview serves every link, also a station link. |
| Lower-bandwidth audio options | Waiting (item 7) | Each station needs a second stream on the server. |

Tests pin each row. The reconnecting player has
`a lost stream keeps trying on a bounded ladder, and a click pauses it; blocking and cancellation`,
`without a network the player says so, in both languages, and keeps trying`,
`the network back, a shown page and the lock screen try again at once, and start nothing by themselves`
and [tests/polish-browser.js](../tests/polish-browser.js).
Station links and memory have
`a first visit opens on Lost in Feelings, a returning listener on the last station, and a link on its own station`,
`a link or a remembered station plays nothing`,
`startup stores nothing; a change and a play store the station`.
In the browser, [tests/stages-browser.js](../tests/stages-browser.js) checks
only that a first visit stores nothing and names `/?station=palac-feel` in the
address. No browser test opens a link to another station or comes back to a
remembered one.
The keys and mute have
`1 to 9 go to the station at that place on screen, as the rail does, and never start playback`,
`M turns the sound off and back on where the volume shows, stores nothing, and does nothing where the device sets the level`,
`? opens the shortcuts under the roots button, in both languages, only while the explorer is closed`,
`the page keys wait while typing, with a modifier, with the stations sheet open, and when an earlier handler took the key`,
[tests/keyboard-browser.js](../tests/keyboard-browser.js) and
[tests/keys-play-browser.js](../tests/keys-play-browser.js).
The install icon and the link preview have
`the head names the manifest, the icons and one share preview; the manifest uses the page's ink`.

A static page has one preview for every link. The browser does not send the
part after `#`, and the server sends the same file for every `?station=`. A
preview per station needs a page per station on the server.

Audio crossfading is not a requirement. The radio keeps native single-stream
playback and its short gap when the station changes.

## 3. Explore the music collection

| Feature | Status | Where, or why |
| --- | --- | --- |
| Expand artist/release views with owned album tracks, including unselected tracks | Partial, approved | |
| Clearly distinguish owned music, radio selections and Essentials favourites throughout those views | Partial, approved | |
| Extend artist recommendations inside and outside the collection, with a clear basis for each connection | Partial, approved | |
| Grow the existing diagram into the agreed connected Explore experience, with shared context and usable mobile navigation | Partial, approved | |
| The Index rail from A to Z, type-ahead, and the letter in the address (item C) | Built, on dev, waits for the owner's push to prod | The rail in the right gutter jumps to a letter, or to a band of track counts in Most tracks. Typing in the list goes to the first name with those letters. `/` goes to the filter. The address keeps the letter, for example `#index/artists?at=M`. |
| Cover grids | Candidate | |
| Advanced library filters, sortable tables and saved/shared views | Out | |
| Graph zoom/pan, clusters, and artist/label/release/remix/genre/stage modes | Out | It is the Music Universe workspace. |

The Index rail has
`the rail always has 27 letters or 7 bands, empty ones disabled and out of the Tab order`,
`type-ahead focuses the first name for a prefix, or the next name, and Space still plays`,
`/ focuses the filter`,
`at= is written after scrolling stops, read back on a reload, and never part of the kept place`
and [tests/index-browser.js](../tests/index-browser.js).

Basic profiles, entity search and connections are available. The full Music
Universe is not, and it is out. A shared label or remix credit is a factual
connection, not proof that two artists sound alike. Wider external
discographies remain a later possibility; they are not required for
owned-album browsing.

## 4. Audio previews and Track Hunt

| Feature | Status |
| --- | --- |
| Validate automatic selection of the strongest musical passage across contrasting moods | Partial, approved; Waiting (item 1) |
| Prepare 60-second previews for all owned tracks, including unselected album tracks | Partial, approved; Waiting (item 1) |
| Share highlight positions between the radio and Track Hunt | Approved, pending |
| Browse Track Hunts, evaluated releases, keepers and recorded discovery trails | Out |
| Compare Hunt outcomes and discovery-to-selection activity where events exist | Out |

The playback mechanism works with prepared samples. The documented highlight
trial does not establish collection-wide coverage or accepted musical quality.
Track Hunt synchronization is still unfinished. No manual excerpt editor is
wanted. Full-track on-demand playback is outside the agreed preview model.

## 5. History and digging

| Feature | Status | Where, or why |
| --- | --- | --- |
| Public recent-play history with station and period navigation | Delivered at `#history` | |
| What all nine stations play now (item E) | Built, on dev, waits for the owner's push to prod | History, All stations, at `#history/radio`, under "On air now". One row per station, in the order on screen, gives the track over "artist · station", with the station name always whole. The station you hear reads Now. The total of audio connections shows only when all nine stations answered, and never as 0. |
| What was added to and removed from each playlist (item F1) | Built, on dev, waits for the owner's push to prod | "Added and removed" in each station's Statistics place (`#statistics/<id>`) shows the newest ten changes, with "Show earlier changes". All stations merges the nine feeds by time, and its rows read "station · artist". |
| Public playlist-addition calendar with a yearly heatmap and day details | Out | The digging calendar is rejected for this site. |
| Calendar playlist filters, counting rules and timezone | Out | They belong to the calendar. |
| Session views for first listens, revisits, acceptance and rejection | Out | |

On air now has
`History's All stations lists the nine stations in screen order with what each plays, and Now only on the tuned one`,
`the total counts audio connections on all stations only when all nine answered, and hides a zero`,
`each station refreshes after its track ends, between 20 s and 2 min, and nothing is asked while hidden`
and [tests/history-browser.js](../tests/history-browser.js).
Added and removed has
`Added and removed lists the newest ten changes, pages in place, and hides when empty or failing`,
`All stations merges the nine feeds by time, and pages only the stations that have more`
and [tests/changes-browser.js](../tests/changes-browser.js).

Plex gives the date a track came into the library, not the date it joined a
playlist. Real playlist dates exist only from the day the radio began to
record changes. "Added and removed" shows those real records, and nothing
before them. Playlist additions, library imports, broadcast starts and first
listens are different events. Keep synthetic dates separate from real records.

## 6. Music and curation statistics

| Feature | Status | Where, or why |
| --- | --- | --- |
| Public collection statistics with clear definitions and coverage | Delivered at `#statistics` | |
| Artist, label, release-year and stage distributions | Delivered; charts show metadata coverage | |
| The counts of artists and labels open the Index on that station, most tracks first (item D) | Built, on dev, waits for the owner's push to prod | `#index/artists/<id>?by=tracks` and `#index/labels/<id>?by=tracks`. Without the labels document, the place shows its counts with no link. |
| Stage overlaps and frequently played records | Delivered | |
| Selected tracks not played during the last 30 days | Delivered as a count per station | |
| List the tracks of a station that did not play (item F2) | Waiting (item 6) | Without a server route, one click on a big station costs up to about 96 requests in the browser. |
| Collection-growth view | Candidate | It needs months of observed changes. |
| Genre distributions | Out | Genre coverage is 0 in every statistics document. |
| BPM and key analysis | Out | No BPM or key field exists. |
| Country charts | Out | Country is only on single artist and label records, with no total and no coverage. |

The links from the counts have
`the labels document turns the counts into links to the Index, most tracks first, and its absence changes nothing`.

Audience statistics count audio connections, not identified people. Listener
activity, collection statistics and curatorial decisions need separate
measures. Missing data must stay different from zero.

## 7. Stories, insights and recaps

| Feature | Status |
| --- | --- |
| A timeline joining documented additions, discoveries and broadcasts | Candidate |
| Explain changes in taste, stage composition or discovery activity | Out |
| Monthly and yearly recaps | Waiting (item 2) |
| Shareable recap graphics and an archive of previous periods | Waiting (item 2) |

These depend on useful history and statistics. Historical graph reconstruction
and discovery stories need real events; invented calendar dates cannot establish them.

## 8. Reliability, data quality and release management

After a host reboot, the `@reboot` cron entry did not bring the radio back.
Both sites answered 502 until someone ran `python3 ops/manage.py start` by hand.

| Remaining work | Status | Where, or why |
| --- | --- | --- |
| Keep the source in Git and publish the website from it | Delivered | CI publishes `web/` to dev from `main` and to production from `production` ([README](../README.md), Publishing the website). |
| Start the radio again after a host reboot | Verification pending | A crontab line that the owner added on the host runs `python3 ops/manage.py boot` every 5 minutes. A real reboot has not tested it yet. `boot` starts the radio unless `secrets/maintenance` exists; `stop` writes that file and `start` removes it ([ops/manage.py](../ops/manage.py)). The repository's `install-cron` writes only the `@reboot` line. The cause of the failed `@reboot` start is not verified. |
| Serve the install icons and the manifest with their types | Waiting (item 5) | |
| Improve missing Spotify matches, entity identities and sourced metadata for selected music | Partial | |
| Physical iPhone background playback and mobile network-change checks | Verification pending; Waiting (item 4) | |
| Complete a continuous 24-hour observation | Verification pending; Waiting (item 4) | |
| Resolve the documented public HTTPS capacity limit and verify the target of 100 audio connections at a time | Verification pending; Waiting (item 3) | |

The historical 100-stream test did not meet the full website/API acceptance
target. The operations documentation records a temporary shared limit of 90
streams; this inventory did not measure capacity again.

Known test debt:

- [tests/mobile-layout.py](../tests/mobile-layout.py) is stale. It targets
  production and opens real streams.
- Eleven browser tests press play. The local preview,
  `design/stage-direction/serve.py`, relays `/stream/<id>.mp3` to production,
  so a play there opens a real audio connection and counts in the audience.
  Each of the eleven therefore asks `GET /__mode?set=ok` first and stops unless
  the answer is `ok`, which only the fake preview gives:
  `python3 design/stage-direction/fakeserve.py`, the same preview with a local
  tone for every stream. A test run never counts as a listener.
  - Run on the fake preview and passing: [bus](../tests/bus-browser.js),
    [polish](../tests/polish-browser.js),
    [keys-play](../tests/keys-play-browser.js),
    [history](../tests/history-browser.js),
    [stations](../tests/stations-browser.js) and
    [photos](../tests/photos-browser.js).
  - Guarded, and not yet seen passing on the fake preview:
    [corrections](../tests/corrections-browser.js),
    [explore](../tests/explore-browser.js),
    [journey](../tests/journey-browser.js),
    [library](../tests/library-browser.js) and
    [waveform](../tests/waveform-browser.js). They also need the discovery
    service, and waveform still uses an old station id, so each one needs a
    fixture or an update.
  - Two checks open real audio connections by design and are not part of a
    normal run: [tests/start-latency-browser.js](../tests/start-latency-browser.js)
    times the public stream, and
    [design/stage-direction/check-browser.js](../design/stage-direction/check-browser.js)
    is a smoke check of production.
- Several browser tests need fixtures, because the local discovery service
  does not run on a developer machine.

## Waiting

Each item names what it waits for and who acts.

1. **60-second previews for every playlist track.** They wait for the owner to
   listen to the highlight picks on about 20 tracks and say yes or no. Then
   they need a backend release, which the owner runs on the host.
2. **Monthly and yearly recaps.** They wait for one full year of real
   broadcast records. The check is that `/api/radio/<id>/music` reports an
   `earliest` date one year back. Then the owner decides whether to build them.
3. **The target of 100 audio connections at a time.** It waits for the Whatbox
   answer. The owner sends the draft in [WHATBOX_CAPACITY.md](WHATBOX_CAPACITY.md).
   After the answer, the owner runs the load test. Random jitter in the
   reconnect steps waits for this answer too.
4. **A check on a real iPhone, and a 24-hour run.** The owner does them on his
   phone, on dev, and notes yes or no and the seconds for each step:
   1. In Safari, open https://pavoia-dev.gaende.box.ca/?station=fontanna. Fontanna shows, and nothing plays.
   2. Press play and lock the phone for 10 minutes. The music plays all the time, and the lock screen shows the track and Pause.
   3. On the lock screen, press Pause and wait 2 minutes. Nothing starts again. Press Play, and the music comes within 5 s.
   4. While it plays, turn on Airplane mode for 30 s. The player says "Offline. Waiting for the network…". Turn it off, and the music comes back within 10 s without a touch.
   5. Do step 4 again with the phone locked. The lock screen still shows Pause while the player reconnects. Note whether the music came back by itself, and after how many seconds.
   6. Walk out of Wi-Fi range while it plays. The music comes back on mobile data within 30 s. The browser stays online here, so the player reconnects only after a stream error or after its 20 s watchdog.
   7. Share, then Add to Home Screen. The icon is the Gaende mark on black. Open it, play, and lock for 10 minutes. Note whether the music keeps playing. The installed app has its own storage, so it opens on Lost in Feelings the first time.
   8. For the 24-hour run, keep the phone on its charger, open https://pavoia-dev.gaende.box.ca/?station=ambiance, play and lock. At 1 h, 8 h and 24 h, note any silence and whether it ended by itself.
   9. At 24 h, unlock the phone. The player shows only the track, with no error words, and Pause works.
   10. Send the notes to the developer. A "no" in the locked step 5 or the installed step 7 opens a follow-up, which the developer makes.
5. **The types of the install icons and the manifest.** The generated Nginx
   type map on the host has no entry for png and webmanifest, so Nginx serves
   the install icons and `manifest.webmanifest` as `application/octet-stream`.
   The fix is in [ops/manage.py](../ops/manage.py) (commit c8c1d30). It takes
   effect only when the owner runs `python3 ops/manage.py configure` on the host
   and reloads Nginx, by the reviewed release process ([README](../README.md)).
   Chromium reads the manifest and the icons as they are. iPhone behaviour is
   not tested.
6. **The list of tracks that did not play.** It waits for a server route
   `/api/radio/<id>/unplayed`, which makes the list one request. The owner
   acts, through a backend release that he runs on the host.
7. **Other backend changes.** Each one needs the owner to run commands on the host:
   - a lower-bandwidth stream per station (Icecast and the controller);
   - an "up next" route for the next tracks of each station;
   - a preview per station link, from a page per station on the server. The
     owner decides first whether one preview for the whole site is enough.
8. **Production.** The whole build waits for the owner's look at dev and his
   "push to prod". After that push, the developer makes one follow-up commit
   that changes this build's items in this file from "Built, on dev, waits for
   the owner's push to prod" to "Delivered". Without that commit, this file
   says "on dev" for features that production serves.

## Against the original roadmap

The original project, [Y0lan/pavoia-webradio-v2](https://github.com/Y0lan/pavoia-webradio-v2)
("Ultimate Architecture Blueprint v3.1"), lists about 260 features in 37
sections. The radio of today replaces its look (cyber-brutalist, a sidebar,
stage cards, glass, crossfades, toasts, WebSocket and SSE, an admin panel).
Its ideas still count where they fit one page, one stream and one look.

The third column describes dev. Production does not serve this build's parts
until the owner's push: the reconnect that never gives up and its words,
station links and the last station, the `1` to `9`, `M` and `?` keys, the
manifest and icons, the link preview, the Index rail, type-ahead and `/`, the
counts that open the Index, Added and removed, and On air now.

| Category | The original asked | The radio has on dev | Waits | Out, and why |
| --- | --- | --- | --- | --- |
| Core audio | Crossfade engine, volume, mute, quality by connection, reconnect | One audio element, volume, the `M` key, reconnect for as long as the listener wants | A lower-bandwidth stream | The owner rejects crossfades. Nobody asked for normalization. |
| Uninterrupted playback | Player kept across navigation | One page; the explorer is a dialog over it; station links never reload | — | Live push (WebSocket) is rejected. |
| About page | Animated title, bio, booking, festival link | The letter, the signature, the Bus ticket link | — | Animations and glitch belong to the old look. |
| Dashboard | Cards, mini calendar, additions, all stages now, taste, an audience total | Statistics places, On air now with its total of audio connections, Added and removed | — | Cards, the calendar and taste insights are rejected. Taste has no BPM, key or genre data. |
| Stage system | Nine stages and a hidden bus, cards, layouts, ordering | Nine stations and the Bus, rail and sheet, two orders, a link per station, `1` to `9` | — | The layout stays, so no cards and no layout modes. |
| Stage transitions | Audio crossfade, gradient and art morphs | Text fade and photo fade | — | Audio crossfade is rejected. |
| Now playing | Metadata, BPM, key, genre, visualizer, live count, recent tracks, queue | Record sleeve, metadata, waveform, Live count of audio connections, History | An "up next" server route | BPM, key and genre have no data. |
| Player bar | Controls, mute, crossfade selector, glass, menus | Cover, waveform, play/pause, volume, swipe, Media Session | — | The look stays, so no glass, menus or crossfade selector. |
| Visualizer | Eight types and settings | One waveform from the real audio | — | One waveform is the look. |
| Track history | Views, filters, sorts, replay, download | History by station and day, On air now | — | Downloads and full-track replay never come. Sortable tables are out. |
| Plex sync and discovery | Sync, diffs, addition log, discovery feed | Five-minute sync, change records, Added and removed | Velocity, after months of records | Force sync needs an admin area. |
| Digging calendar | Contribution heatmap, streaks, years | Added and removed is its honest start | Several months of records, if the owner reopens it | It is rejected for this site, and Plex has no playlist dates. |
| Artist intelligence | Enrichment, similar artists, manual merge | Discovery records with bio, links, country, tags, picture | — | Manual merge needs an admin area. |
| Artist graph | Force graph, modes, layouts | The neighbourhood map | — | The Music Universe workspace is out. |
| Artist detail | Tabs, BPM, key, heatmap, similar, play all | The record view: bio, links, stations, similar names | — | Tabs change the look. BPM and key have no data. Play all needs full tracks. |
| Statistics | Charts, BPM, key, geography, genres, insights | Counts, top lists, years, most played, the not-played count, counts that open the Index | The not-played list, after a server route | BPM, key, genre and country have no data. Charts and insights are out. |
| Wrapped | Yearly and monthly recaps, PNG cards | — | One full year of records | — |
| Search | Fuzzy search, Ctrl+K, tabs | Roots search, the Index filter, type-ahead and `/` | — | Ctrl+K is out. |
| Queue | Up next, reorder, remove, skip | — | Up next, after a server route | Visitors do not control the broadcast. |
| Notifications | Toasts, push | Honest player words ("Reconnecting…", "Offline. Waiting for the network…") | — | Toasts and push are rejected, and there is no service worker. |
| Settings | Crossfade, quality, themes, exports | Language, order, Photo only, volume, the last station | — | Themes change the look. Nobody asked for the rest. |
| PWA | Manifest, icons, shortcuts, Media Session, background audio | Manifest, icons, Media Session | The types on the host, and the iPhone check | The offline cache and the service worker are out. |
| Mobile | Swipes, haptics, tab bar, mini player | Phone sheet, swipe between stations, player bar, a thumb scrub on the Index rail | — | The layout stays, so no pull to refresh and no expanding player. |
| Keyboard | Space, arrows, volume keys, M, F, Ctrl+K, 1 to 9, Esc, ? | Space, left and right arrows, `1` to `9`, `M`, `/`, `Esc`, `?` | — | Up and down scroll the page. Nobody asked for F. Ctrl+K is out. |
| Admin | Token-protected panel | — | — | An admin area is rejected. |
| Social and sharing | Share track and stage, preview cards, Open Graph | `#bus`, record addresses, station links, one link preview | A preview per station, from a page per station on the server | PNG cards wait with the recaps. |
| Performance | Virtual scroll, lazy images, service worker, reconnect backoff | Lazy pictures, waveform pause, no requests while hidden, reconnect steps | — | The service worker is out. |
| Visual identity | Cyber-brutalist look, neon, glass | Instrument Serif, Inter, JetBrains Mono and tokens | — | The owner replaced the old look. |

## Scope boundaries

- No protected admin application and no visitor controls over the shared broadcast.
- No rating system. Radio membership and Essentials membership express
  the agreed selection levels.
- No cards, sidebar, crossfades, autoplay, live push (WebSocket or SSE) or
  digging calendar on this site.
- These are out for good: the Music Universe workspace (graph zoom, clusters,
  modes, side panels, inspector), genre, BPM, key and country charts (no data),
  sessions, the Hunt browser, taste insights, advanced filters, sortable tables,
  saved views, Ctrl+K, the addition calendar, festival live input, downloads
  and full-track playback on demand.
- No automatic commitment to every feature or technology in the older audit
  or in the original roadmap.
- No requirement to change the approved visual identity to complete Explore.
- Audience numbers count audio connections, not people. Missing data never shows as zero.

## Evidence and decision sources

- [Stage controls release](STAGE_CONTROLS_2026-10-15.md): live count latency, full mobile descriptions, navigation and player details.
- [Mobile layout release](MOBILE_LAYOUT_2026-10-15.md): phone layout, station sheet, gestures, visual review and release checks.
- [Radio corrections](RADIO_CORRECTIONS_2026-10-15.md): station copy, Bus order, navigation, basic track details and year order.
- [Stations, history and statistics release](STATIONS_HISTORY_2026-10-15.md): release scope, counting rules, coverage and checks.
- [GitHub publication](RELEASE_2026-10-16.md): the source in Git and the review fixes.
- [Feature decisions](FEATURE_LIST_DRAFT.md): approved stations, previews,
  collection visibility, calendar and scope boundaries.
- [Go Deeper wishlist](GO_DEEPER_SCOPE_DRAFT.md): candidate views and interactions.
- [Session handoff](SESSION_HANDOFF_2026-10-09.md): deployed foundation, remaining
  data work, preview trial and operational limits.
- [Polish release](POLISH_RELEASE_2026-10-14.md): completed interaction work.
- `artifacts/intentions-release-20261015/`: latest descriptions, deployed source
  snapshot, public checks and release records.
- [Earlier full comparison](FEATURE_REVIEW_2026-10-07.md): historical inventory;
  its missing-feature labels must not be read as current status.
- `git log --oneline 633804a..HEAD` lists the commits of this build.
