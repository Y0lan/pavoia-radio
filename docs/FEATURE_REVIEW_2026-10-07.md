# Pavoia Radio: full feature comparison

Review date: 7 October 2026. Old repository pinned to `6fd53fee208595a45d12bfc29ec293f1dbd60d81`.

**The live radio and basic catalogue work. The richer discovery and curation product remains largely unbuilt.** The old repository also contains real implementation work that the new radio has not carried forward: played-history views, a digging calendar, artist pages, music charts, volume/mute, and station crossfading.

This is a read-only review. No playlist, deployment, music file or service was changed. Old code was inspected, not executed or assumed operational. Current public endpoints were checked; existing browser, decoder and recovery evidence was reviewed rather than repeated.

## Sources and interpretation

The old [complete specification](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md), [addendum](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_ADDENDUM_V3.1.md), [design decisions](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/DESIGN.md), [architecture](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/ARCHITECTURE.md), [visual system](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/DESIGN_SYSTEM.md), actual application routes/pages and operations scripts were compared with the current source and live radio.

The specification advertises approximately 260 features. Its explicit checklist has **177 rows**, several combining multiple behaviors; other features are described in sections 21-29. Headings do not consistently match their row counts. No completion percentage is defensible from these numbers.

Status meanings: **Delivered** = implemented outcome with evidence; **Partial** = a narrower outcome; **Backend only** = no listener-facing interface; **Missing** = absent; **Replaced** = different implementation serving the relevant purpose; **Superseded** = old presentation direction conflicts with the current direction; **Deferred** = explicitly postponed. Missing does not automatically mean approved for implementation.

Current-source paths below are relative to this project. Old-source links are pinned to the reviewed commit. Live evidence: [feature-audit-live-20261007.json](../artifacts/feature-audit-live-20261007.json). Detailed previous validation: [ACCEPTANCE.md](ACCEPTANCE.md).

## Station and playlist coverage

| Old station/source | Current radio | Result |
|---|---|---|
| gaende-favorites / ❤️ Tracks | Essentials, 147167, 315 entries | Present. Plex summary says 323; item endpoint yields 315. |
| palac-slow-hypno / PALAC - SLOW AND HYPNOTIC - POETIC | Lost in Feelings, 146686, 1,094 | Present. |
| palac-dance / PALAC - DANCE | Night in Motion, 145470, 1,625 | Present. |
| bermuda-day / BERMUDA - BEFORE 6 | Under the Sun, 146377, 1,113 | Present. |
| bermuda-night / BERMUDA - AFTER 6 | As Night Begins, 145468, 2,040 | Present. |
| etage-0 / ETAGE 0 + Etage 0 - FAST DARK MINIMAL | Etage 0, 145471, 174 | Partial source coverage. Secondary playlist 147259 has 7 entries and is not mapped. |
| fontanna-laputa / FONTANNA + MINIMAL | Fontanna, 145469, 660 | Partial source coverage. Secondary playlist 162633 has 93 entries and is not mapped. |
| ambiance-safe / AMBIANCE | No station | Missing. Playlist 145472 has 70 entries. |
| closing / Outro | No station | Missing. Playlist 162463 has 91 entries. |
| Hidden bus stages | None | Specification idea, no configured current station. |

The four missing source selections were checked against their actual Plex item endpoints during this review. Counts are playlist entries, not additional unique tracks; overlaps are not measured here. The old [sync mapping](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/scripts/plex-sync/README.md) explicitly combines the two secondary selections. That mapping is evidence for a parity decision, not authorization to silently merge their moods today. Closing/Outro is a playlist station, separate from later festival live input.

## Current verified foundation

Seven public station APIs returned HTTP 200, current tracks, recent successful syncs and available audience measurements. Full-library search reports **90,536 tracks**, refreshed at 03:35 UTC. The latest seven-station inventory contains **5,909 unique radio tracks**.

The current radio supplies MP3 320, server-side three-second transitions between tracks, shuffled cycles, recent-artist avoidance, reconnect handling, current covers and attributable portraits, EN/DE, catalogue pagination/search, observed selection changes, per-station live connection counts and daily audience statistics. Music mounts are read-only. Daily consistent backups and bounded caches/logs exist.

The current 24-hour observer had 499 samples and two failed API reads at the inspection point. It is incomplete and covers the original six stations, not Fontanna. Physical iPhone behavior and the 100-listener public acceptance target remain unverified/failed respectively; the shared temporary limit is 90 streams.

## What existed in old code, beyond its plans

| Area | Source-level old implementation | Current gap / caution |
|---|---|---|
| Audio controls | [audio-engine.ts](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/apps/web/src/lib/audio-engine.ts): dual slots, five curves, volume/mute; [player bar](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/apps/web/src/components/player-bar.tsx) exposes volume/mute | Current radio has neither station crossfade nor volume/mute. Old code alone is not reliability proof. |
| Played history | [history API](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/apps/bridge/api/history.go) and [history page](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/apps/web/src/app/history/page.tsx): table, stage/search, pagination | Current actual-start records are internal only. |
| Digging | [digging API](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/apps/bridge/api/digging.go), [calendar page](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/apps/web/src/app/digging/page.tsx): yearly calendar and streak cards | No current calendar. Old cells have hover titles, not the full promised day drill-down. |
| Music statistics | [stats API](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/apps/bridge/api/stats.go), [stats page](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/apps/web/src/app/stats/page.tsx), Camelot wheel | Current statistics concern listeners, not tracks/artists/genres/keys. Old chart endpoints and views do not establish populated data. |
| Dashboard | [dashboard page](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/apps/web/src/app/dashboard/page.tsx): overview cards and all-stage now-playing | Missing today. The richer insights/taste dashboard was not all implemented. |
| Artists | [artist API](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/apps/bridge/api/artists.go), list/detail pages: basic bio, tags, tracks and similar list | No entity pages today. The full six-tab detail and interactive graph were not present. |
| Research | [worker](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/apps/bridge/enrichment/worker.go): Last.fm + MusicBrainz, rate pacing and circuit breakers | No current research worker/import. Old code is not the promised five-source system and is not proof of verified identities. |
| Metadata | [tag_extract.py](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/scripts/plex-sync/tag_extract.py), sidecar importer: BPM, Camelot, genre, year and dates | Current snapshot drops these fields. Reuse parsing rules after checking data and provenance; never write music tags. |
| Search | [search.go](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/apps/bridge/api/search.go): Postgres substring matching for tracks/artists | Meilisearch was not wired. Current search is also substring matching, with broader full-library coverage but fewer entity types. |
| Queue | [queue.go](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/apps/bridge/api/queue.go) returns only the current song | The old queue endpoint was not a true upcoming queue. Current public queue is also absent. |
| Live updates | [hub](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/apps/bridge/hub/hub.go), handlers and frontend WS state | Current poll interval is 10 seconds. Functional metadata updates exist, but not instant WS/SSE events. |
| Operations | [ops scripts](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/scripts/ops/README.md): backup heartbeat and health watchdog; richer health checks in main.go | Current backups/restart policy exist; no equivalent health dashboard, backup-age alarm or hung-process watchdog. |

`CLAUDE.md` contains stale statements, including a Plex Go package no longer in the tree. The April architecture report also describes failures before later changes. Neither is treated as proof that the final old deployment worked or remained broken.

## Full explicit checklist comparison

All 177 explicit checklist rows follow, in source order. Category evidence identifies the inspected current implementation. One row may include several subfeatures; the explanation determines its actual status.

### Core Audio

Current evidence: `web/app.js; ops/radio.liq; tests/player.cjs`.

| Old feature | Current status | Evidence or missing behavior |
|---|---|---|
| [Web Audio API engine, dual slots, 5 crossfade curves](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1787) | Partial | Playback exists; five-curve browser station crossfading does not. Liquidsoap fades consecutive tracks within a station. |
| [Equal-power, S-curve, exponential, linear, cut](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1788) | Missing | No listener-selectable crossfade curves. |
| [Master GainNode volume, mute toggle](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1789) | Missing | No volume slider or mute control; device volume remains available. |
| [AudioContext resume on user gesture](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1790) | Replaced | Explicit user gesture starts native audio; rejected play promises are handled. |
| [Pre-buffering before crossfade](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1791) | Partial | Liquidsoap prefetches tracks. Browser station switching does not prebuffer a second stream. |
| [Crossfade progress tracking (exposed to UI)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1792) | Missing | No browser audio-processing or quality settings; one native MP3 320 stream. |
| [Audio quality auto-selection by connection type](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1793) | Missing | No browser audio-processing or quality settings; one native MP3 320 stream. |
| [Stream reconnection on error](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1794) | Delivered | Bounded reconnect delays and a playback watchdog; pause cancels reconnection. |
| [Multiple quality mountpoints (128/192/320/FLAC)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1795) | Missing | MP3 320 kbit/s only; no low-bandwidth or lossless mounts. |
| [Volume normalization option](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1796) | Missing | No browser audio-processing or quality settings; one native MP3 320 stream. |

### Uninterrupted Playback

Current evidence: `web/index.html; web/app.js; web/explore.js`.

| Old feature | Current status | Evidence or missing behavior |
|---|---|---|
| [Audio engine in root layout](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1799) | Replaced | One persistent native audio element and player in the single page; no framework navigation. |
| [PlayerBar in root layout](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1800) | Replaced | One persistent native audio element and player in the single page; no framework navigation. |
| [WebSocket in root layout](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1801) | Replaced | Status polling every 10 seconds replaces WebSocket/SSE. It is not event-driven real-time delivery. |
| [Zustand state persists across navigation](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1802) | Replaced | One persistent native audio element and player in the single page; no framework navigation. |
| [AnimatePresence on {children} only](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1803) | Replaced | No React route transitions; catalogue panels do not replace the player. |

### About Page

Current evidence: `web/index.html; web/style.css`.

| Old feature | Current status | Evidence or missing behavior |
|---|---|---|
| [Animated mesh gradient background (audio-reactive)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1806) | Superseded | The current direction uses official Pavoia imagery, Gaende assets and a personal festival dedication. |
| [GAENDE title with letter-reveal animation](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1807) | Superseded | The current direction uses official Pavoia imagery, Gaende assets and a personal festival dedication. |
| [Bio with Instrument Serif, staggered fade-in](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1808) | Partial | Festival dedication and Gaende signature exist; no full artist biography page. |
| [ANTI-ALGORITHM inline badge with glitch animation](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1809) | Superseded | The current direction uses official Pavoia imagery, Gaende assets and a personal festival dedication. |
| [SoundCloud CTA + booking email](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1810) | Missing | No SoundCloud or booking contact call to action. |
| [PAVOIA festival link + cities line](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1811) | Partial | Pavoia festival link exists; no cities line. |

### Dashboard

Current evidence: `web/index.html; web/explore.js; http.go`.

| Old feature | Current status | Evidence or missing behavior |
|---|---|---|
| [Quick Pulse cards (tracks, artists, plays, hours + deltas)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1814) | Missing | No unified music-collection dashboard or insight engine. |
| [Mini digging calendar (12 months)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1815) | Missing | No unified music-collection dashboard or insight engine. |
| [Today's additions feed](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1816) | Partial | Per-station observed additions/removals are visible; no global today feed. |
| [All stages now-playing overview](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1817) | Missing | No unified music-collection dashboard or insight engine. |
| [Taste snapshot (mini charts: country, decade, label, BPM, key)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1818) | Missing | No unified music-collection dashboard or insight engine. |
| [Automated insights (10 types)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1819) | Missing | No unified music-collection dashboard or insight engine. |
| [Link to full stats](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1820) | Missing | No unified music-collection dashboard or insight engine. |
| [Active listeners total](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1821) | Partial | Selected-station live connection count, not an all-stations total. |

### Stage System

Current evidence: `main.go:sceneFor; ops/manage.py:SCENES; web/app.js:moods`.

| Old feature | Current status | Evidence or missing behavior |
|---|---|---|
| [9 visible stages + hidden bus stages](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1824) | Partial | Seven stations. AMBIANCE and Closing/Outro are missing; no hidden bus stations. |
| [Full config per stage (name, genre, subgenres, color, BPM range, cover)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1825) | Partial | Names, copy and photos exist. No structured genre/subgenre/BPM configuration or dedicated Fontanna photograph. |
| [Stage cards with live preview, listener count, mini waveform](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1826) | Partial | Text selector and selected-station status/count only; no live-preview cards or waveforms. |
| [3 layout modes (grid, list, horizontal scroll)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1827) | Missing | Only the current text station selector and selected-station panel exist. |
| [Active stage indicator (sidebar + player bar)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1828) | Partial | Selected radio is underlined and named in the heading; no sidebar or explicit playing-station label beside an active track. |
| [Stage info panel (track count, artist count, duration)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1829) | Partial | Track counts exist in status JSON; no full count/artist/duration stage panel. |
| [Stage ordering](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1830) | Partial | Fixed source-defined order; no user/admin reorder UI. |
| [Online/offline status](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1831) | Partial | Selected-station live/standby/stale states exist; no simultaneous stage-health overview. |

### Stage Transitions

Current evidence: `web/app.js:release/connect and station change handler`.

| Old feature | Current status | Evidence or missing behavior |
|---|---|---|
| [Audio crossfade synced with visual](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1834) | Missing | Switching stations releases the old stream and connects to the new one. No synchronized audiovisual transition. |
| [Background gradient morph](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1835) | Missing | Switching stations releases the old stream and connects to the new one. No synchronized audiovisual transition. |
| [Album art + blurred backdrop crossfade](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1836) | Missing | Switching stations releases the old stream and connects to the new one. No synchronized audiovisual transition. |
| [Accent color CSS animation](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1837) | Missing | Switching stations releases the old stream and connects to the new one. No synchronized audiovisual transition. |
| [Visualizer blend during transition](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1838) | Missing | Switching stations releases the old stream and connects to the new one. No synchronized audiovisual transition. |
| [Crossfade progress indicator bar](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1839) | Missing | Switching stations releases the old stream and connects to the new one. No synchronized audiovisual transition. |
| [Stage indicator slide animation](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1840) | Missing | Switching stations releases the old stream and connects to the new one. No synchronized audiovisual transition. |

### Now Playing

Current evidence: `http.go:publicTrack/snapshot; web/app.js:metadata/renderImages`.

| Old feature | Current status | Evidence or missing behavior |
|---|---|---|
| [Hero album art + blurred backdrop](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1843) | Partial | Current cover and attributable Plex portrait appear below the stage photo; no cover-led blended hero. |
| [Track/artist/album metadata](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1844) | Delivered | Live title, artist credit and album metadata. |
| [BPM, key, genre, label badges](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1845) | Missing | Not exposed in the current-track interface. |
| [Full visualizer](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1846) | Missing | Not exposed in the current-track interface. |
| [Live indicator + listener count](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1847) | Delivered | Live indicator and current audio connection count; unknown and zero are distinct. |
| [Recently played scroll](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1848) | Missing | Not exposed in the current-track interface. |
| [Queue preview](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1849) | Missing | Not exposed in the current-track interface. |
| [Stage info](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1850) | Partial | Station title and short description; no complete metadata panel. |
| [Fullscreen toggle](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1851) | Missing | Not exposed in the current-track interface. |
| [Artist name clickable → artist page](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1852) | Missing | Not exposed in the current-track interface. |
| [Album art hover: scale(1.02)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1853) | Missing | Not exposed in the current-track interface. |
| [Back to stages nav](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1854) | Replaced | The station selector stays on the same page; no separate back navigation needed. |

### Player Bar

Current evidence: `web/index.html:.player; web/app.js`.

| Old feature | Current status | Evidence or missing behavior |
|---|---|---|
| [Art thumbnail, track info, stage indicator](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1857) | Partial | Track title and artist present. Cover is elsewhere; active station is not explicitly labelled in the playing bar. |
| [Mini visualizer](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1858) | Missing | No corresponding control or interaction in web/app.js and web/index.html. |
| [Play/Pause, Prev/Next stage](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1859) | Partial | Play/pause exists. Previous/next stage buttons do not. |
| [Volume slider (log), mute toggle](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1860) | Missing | No corresponding control or interaction in web/app.js and web/index.html. |
| [Crossfade curve selector](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1861) | Missing | No corresponding control or interaction in web/app.js and web/index.html. |
| [Queue toggle, fullscreen toggle](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1862) | Missing | No corresponding control or interaction in web/app.js and web/index.html. |
| [Glass morphism](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1863) | Superseded | The user-revised Pavoia player design replaces the old glass/terminal prescription. |
| [Desktop 80px, mobile mini 64px, mobile full (swipe-up)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1864) | Partial | Persistent responsive bar exists; no swipe-up expanded player. |
| [Swipe left/right to switch stage (mobile)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1865) | Missing | No corresponding control or interaction in web/app.js and web/index.html. |
| [Double-click to expand](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1866) | Missing | No corresponding control or interaction in web/app.js and web/index.html. |
| [Right-click track → context menu](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1867) | Missing | No corresponding control or interaction in web/app.js and web/index.html. |
| [Hover truncated title → tooltip](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1868) | Missing | No corresponding control or interaction in web/app.js and web/index.html. |
| [Long-press prev/next → stage picker](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1869) | Missing | No corresponding control or interaction in web/app.js and web/index.html. |
| [Scroll on volume area → fine-tune](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1870) | Missing | No corresponding control or interaction in web/app.js and web/index.html. |

### Visualizer

Current evidence: `web/ source inventory; no analyser/canvas implementation`.

| Old feature | Current status | Evidence or missing behavior |
|---|---|---|
| [8 types (bars, mirrored, circular, line, gradient, particles, ring, blob)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1873) | Missing | No audio analyser or visualizer. Optional presentation work, not a playback dependency. |
| [Per-stage auto-selection](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1874) | Missing | No audio analyser or visualizer. Optional presentation work, not a playback dependency. |
| [User-configurable type, color, sensitivity](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1875) | Missing | No audio analyser or visualizer. Optional presentation work, not a playback dependency. |
| [Mini visualizer in player bar](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1876) | Missing | No audio analyser or visualizer. Optional presentation work, not a playback dependency. |
| [Crossfade blend between analysers](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1877) | Missing | No audio analyser or visualizer. Optional presentation work, not a playback dependency. |
| [Pause when tab hidden](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1878) | Missing | No audio analyser or visualizer. Optional presentation work, not a playback dependency. |
| [Fullscreen mode](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1879) | Missing | No audio analyser or visualizer. Optional presentation work, not a playback dependency. |
| [Frequency band selection (all/bass/mids/highs)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1880) | Missing | No audio analyser or visualizer. Optional presentation work, not a playback dependency. |

### Track History

Current evidence: `controller.go:playback/played; ops/radio.liq:actual_start; http.go:routes`.

| Old feature | Current status | Evidence or missing behavior |
|---|---|---|
| [Auto-log every play to PostgreSQL](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1883) | Backend only | Actual starts are stored in SQLite, not PostgreSQL. Pending callback memory is bounded; lossless logging across every crash is not proven. |
| [4 view modes (timeline, grid, table, calendar)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1884) | Missing | Playback is recorded internally, but no public played-history API or page exists. |
| [7 filter types (stage, time, artist, genre, BPM, key, search)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1885) | Missing | Playback is recorded internally, but no public played-history API or page exists. |
| [6 sort options](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1886) | Missing | Playback is recorded internally, but no public played-history API or page exists. |
| [Re-listen (overlay, doesn't interrupt stream)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1887) | Missing | Playback is recorded internally, but no public played-history API or page exists. |
| [Download original file](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1888) | Deferred | Original-file downloads are absent; also deferred in the old DESIGN.md. |
| [Copy link, go to artist, track details](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1889) | Missing | Playback is recorded internally, but no public played-history API or page exists. |
| [History stats sidebar](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1890) | Missing | Playback is recorded internally, but no public played-history API or page exists. |

### Plex Sync & Discovery

Current evidence: `plex.go; changes.go; web/explore.js; main.go; ops/catalogue_inventory.py`.

| Old feature | Current status | Evidence or missing behavior |
|---|---|---|
| [Background sync worker (5min)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1893) | Delivered | Atomic per-station Plex sync every five minutes; full-library snapshot hourly. |
| [Playlist diffing](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1894) | Delivered | Adds/removals are reconciled transactionally; incomplete fetches retain the last catalogue. |
| [MPD playlist sync](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1895) | Replaced | Liquidsoap selection and fallback M3U replace MPD playlist synchronization. |
| [Addition logging](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1896) | Delivered | Observed added/removed events after baseline. Timestamps are radio observations, not original Plex edits. |
| [Discovery feed (chronological, grouped)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1897) | Partial | Per-station paginated change list; no global grouped feed with artwork and all source associations. |
| [Filters (stage, time, artist)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1898) | Partial | Current station selects the change list; no date or artist filters on changes. |
| [Discovery velocity stats](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1899) | Missing | No corresponding discovery aggregate, filter or action. |
| [New artist badges](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1900) | Missing | No corresponding discovery aggregate, filter or action. |
| [Sync status indicators](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1901) | Partial | Status API exposes last successful sync and count; library UI shows refresh time. No per-track pending/failed indicators. |
| [Most-added artist](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1902) | Missing | No corresponding discovery aggregate, filter or action. |
| [Actions per track (listen, download, go to artist)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1903) | Missing | No corresponding discovery aggregate, filter or action. |
| [Force sync (admin)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1904) | Backend only | Authenticated local POST /internal/sync exists; no admin panel button. |

### Digging Calendar

Current evidence: `changes.go; catalogue.go; http.go; web/explore.js`.

| Old feature | Current status | Evidence or missing behavior |
|---|---|---|
| [GitHub-style contribution calendar (@uiw/react-heat-map)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1907) | Missing | No calendar, streak or digging aggregation. Observed changes provide a future baseline, not historical playlist dates. |
| [5 color modes (volume, stage, genre, decade, country)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1908) | Missing | No calendar, streak or digging aggregation. Observed changes provide a future baseline, not historical playlist dates. |
| [Click day → expand to show tracks added](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1909) | Missing | No calendar, streak or digging aggregation. Observed changes provide a future baseline, not historical playlist dates. |
| [Streaks (current, longest, best week/month)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1910) | Missing | No calendar, streak or digging aggregation. Observed changes provide a future baseline, not historical playlist dates. |
| [Digging patterns (day-of-week, time-of-day)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1911) | Missing | No calendar, streak or digging aggregation. Observed changes provide a future baseline, not historical playlist dates. |
| [Digging sessions (clustered additions)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1912) | Missing | No calendar, streak or digging aggregation. Observed changes provide a future baseline, not historical playlist dates. |
| [Year selector + multi-year comparison](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1913) | Missing | No calendar, streak or digging aggregation. Observed changes provide a future baseline, not historical playlist dates. |
| [Summary stats (total, averages, active days %)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1914) | Missing | No calendar, streak or digging aggregation. Observed changes provide a future baseline, not historical playlist dates. |
| [Dry spell tracking with humor](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1915) | Missing | No calendar, streak or digging aggregation. Observed changes provide a future baseline, not historical playlist dates. |
| [Stage-specific calendar view](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1916) | Missing | No calendar, streak or digging aggregation. Observed changes provide a future baseline, not historical playlist dates. |
| [Drill-down to individual tracks](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1917) | Missing | No calendar, streak or digging aggregation. Observed changes provide a future baseline, not historical playlist dates. |
| [Annual overview (327 tracks · 89 artists · 34 labels)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1918) | Missing | No calendar, streak or digging aggregation. Observed changes provide a future baseline, not historical playlist dates. |

### Artist Intelligence

Current evidence: `catalogue.go:trackDetails; artwork.go; docs/TRACK_HUNT_HANDOFF.md`.

| Old feature | Current status | Evidence or missing behavior |
|---|---|---|
| [5-source enrichment (Last.fm, MB, Discogs, Wikidata, TheAudioDB)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1921) | Missing | No research importer or canonical artist/label knowledge store. Hermes access remains unavailable. |
| [Merge strategy (best bio, best image, union tags)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1922) | Missing | No research importer or canonical artist/label knowledge store. Hermes access remains unavailable. |
| [Similar artist edges with weight](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1923) | Missing | No research importer or canonical artist/label knowledge store. Hermes access remains unavailable. |
| [Redis cache (24h TTL)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1924) | Replaced | Bounded Plex thumbnail memory cache and local snapshots replace some caching needs. No researched-fact cache exists. |
| [Background enrichment worker](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1925) | Missing | No research importer or canonical artist/label knowledge store. Hermes access remains unavailable. |
| [Stale re-enrichment (>30 days)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1926) | Missing | No research importer or canonical artist/label knowledge store. Hermes access remains unavailable. |
| [Meilisearch indexing](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1927) | Missing | No fuzzy/indexed discovery search. Meilisearch itself is an implementation option, not a product requirement. |
| [External links aggregation](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1928) | Missing | No research importer or canonical artist/label knowledge store. Hermes access remains unavailable. |
| [Banner, thumb, logo, fanart images](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1929) | Partial | Plex cover and attributable portrait only; no researched banners, logos or fanart bank. |
| [Members/groups relationships](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1930) | Missing | No research importer or canonical artist/label knowledge store. Hermes access remains unavailable. |
| [Enrichment queue status](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1931) | Missing | No research importer or canonical artist/label knowledge store. Hermes access remains unavailable. |
| [Manual merge (admin)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1932) | Missing | No research importer or canonical artist/label knowledge store. Hermes access remains unavailable. |

### Artist Graph

Current evidence: `http.go:routes; controller.go schema; web/ file inventory`.

| Old feature | Current status | Evidence or missing behavior |
|---|---|---|
| [react-force-graph-2d](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1935) | Missing | No graph dataset, public graph API or graph interface. |
| [Node size/color/image](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1936) | Missing | No graph dataset, public graph API or graph interface. |
| [Labels on zoom threshold](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1937) | Missing | No graph dataset, public graph API or graph interface. |
| [Link particles](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1938) | Missing | No graph dataset, public graph API or graph interface. |
| [Click/hover/drag/zoom interactions](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1939) | Missing | No graph dataset, public graph API or graph interface. |
| [5 filter types + 3 color-by modes + 3 size-by modes](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1940) | Missing | No graph dataset, public graph API or graph interface. |
| [Layout modes (force/radial/clustered)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1941) | Missing | No graph dataset, public graph API or graph interface. |
| [Search within graph](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1942) | Missing | No graph dataset, public graph API or graph interface. |
| [Graph stats panel](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1943) | Missing | No graph dataset, public graph API or graph interface. |
| [Ego graph on double-click](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1944) | Missing | No graph dataset, public graph API or graph interface. |
| [Context menu on right-click](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1945) | Missing | No graph dataset, public graph API or graph interface. |
| [Reset view](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1946) | Missing | No graph dataset, public graph API or graph interface. |

### Artist Detail

Current evidence: `http.go:routes/publicTrack; web/index.html hidden biography/link elements`.

| Old feature | Current status | Evidence or missing behavior |
|---|---|---|
| [Banner + photo + metadata + links](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1949) | Partial | Now-playing credit and some portraits exist; no artist page, banner or verified links. |
| [Expandable bio (Instrument Serif)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1950) | Missing | No artist detail route or entity-specific views. Artist text search returns tracks only. |
| [6 tabs (Tracks, Albums, Stats, History, Similar, Timeline)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1951) | Missing | No artist detail route or entity-specific views. Artist text search returns tracks only. |
| [Per-artist BPM range + key distribution](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1952) | Missing | No artist detail route or entity-specific views. Artist text search returns tracks only. |
| [Play heatmap (when do you listen to this artist?)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1953) | Missing | No artist detail route or entity-specific views. Artist text search returns tracks only. |
| [Stage presence bars](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1954) | Missing | No artist detail route or entity-specific views. Artist text search returns tracks only. |
| [Similar artists in library + recommendations](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1955) | Missing | No artist detail route or entity-specific views. Artist text search returns tracks only. |
| [Chronological timeline](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1956) | Missing | No artist detail route or entity-specific views. Artist text search returns tracks only. |
| [Play all / play random](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1957) | Missing | No artist detail route or entity-specific views. Artist text search returns tracks only. |
| [External links (Spotify, BC, SC, IG, RA, etc.)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1958) | Missing | No artist detail route or entity-specific views. Artist text search returns tracks only. |

### Statistics Dashboard

Current evidence: `http.go:routes; controller.go:stats; web/explore.js:renderStats`.

| Old feature | Current status | Evidence or missing behavior |
|---|---|---|
| [Overview cards](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1961) | Missing | Only audience statistics exist publicly. Music-collection and play-distribution analytics are absent. |
| [Top lists (artists, tracks, albums, labels — multi-mode)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1962) | Missing | Only audience statistics exist publicly. Music-collection and play-distribution analytics are absent. |
| [Stage distribution](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1963) | Missing | Only audience statistics exist publicly. Music-collection and play-distribution analytics are absent. |
| [BPM histogram](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1964) | Missing | Only audience statistics exist publicly. Music-collection and play-distribution analytics are absent. |
| [Camelot key wheel](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1965) | Missing | Only audience statistics exist publicly. Music-collection and play-distribution analytics are absent. |
| [Geographic spread](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1966) | Missing | Only audience statistics exist publicly. Music-collection and play-distribution analytics are absent. |
| [Decade breakdown (with deep-dive)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1967) | Missing | Only audience statistics exist publicly. Music-collection and play-distribution analytics are absent. |
| [Label treemap](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1968) | Missing | Only audience statistics exist publicly. Music-collection and play-distribution analytics are absent. |
| [Genre tag cloud + evolution](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1969) | Missing | Only audience statistics exist publicly. Music-collection and play-distribution analytics are absent. |
| [Listening calendar heatmap](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1970) | Missing | Only audience statistics exist publicly. Music-collection and play-distribution analytics are absent. |
| [Time-of-day heatmap](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1971) | Missing | Only audience statistics exist publicly. Music-collection and play-distribution analytics are absent. |
| [Discovery velocity](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1972) | Missing | Only audience statistics exist publicly. Music-collection and play-distribution analytics are absent. |
| [Track length distribution](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1973) | Missing | Only audience statistics exist publicly. Music-collection and play-distribution analytics are absent. |
| [Diversity index](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1974) | Missing | Only audience statistics exist publicly. Music-collection and play-distribution analytics are absent. |
| [Replay value](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1975) | Missing | Only audience statistics exist publicly. Music-collection and play-distribution analytics are absent. |
| [Stage transitions (Sankey)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1976) | Missing | Only audience statistics exist publicly. Music-collection and play-distribution analytics are absent. |
| [Crossover analysis](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1977) | Missing | Only audience statistics exist publicly. Music-collection and play-distribution analytics are absent. |
| [Curator insights (6 types)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1978) | Missing | Only audience statistics exist publicly. Music-collection and play-distribution analytics are absent. |
| [All filterable by time/stage/genre/country](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1979) | Missing | Only audience statistics exist publicly. Music-collection and play-distribution analytics are absent. |
| [Streaks & milestones](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1980) | Missing | Only audience statistics exist publicly. Music-collection and play-distribution analytics are absent. |
| [Genre evolution over time](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1981) | Missing | Only audience statistics exist publicly. Music-collection and play-distribution analytics are absent. |
| [Label distribution](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1982) | Missing | Only audience statistics exist publicly. Music-collection and play-distribution analytics are absent. |

### Wrapped

Current evidence: `http.go:routes; ops/manage.py cron; web/ file inventory`.

| Old feature | Current status | Evidence or missing behavior |
|---|---|---|
| [Annual (December) — animated card sequence](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1985) | Missing | No recap computation, scheduled report, story renderer or share-card export. |
| [Monthly recap](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1986) | Missing | No recap computation, scheduled report, story renderer or share-card export. |
| [Shareable PNG card](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1987) | Missing | No recap computation, scheduled report, story renderer or share-card export. |
| [Archive (past years)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1988) | Missing | No recap computation, scheduled report, story renderer or share-card export. |
| [ANTI-ALGORITHM watermark](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1989) | Missing | No recap computation, scheduled report, story renderer or share-card export. |

### Search

Current evidence: `catalogue.go:serveCatalogue; web/explore.js`.

| Old feature | Current status | Evidence or missing behavior |
|---|---|---|
| [Meilisearch instant fuzzy search](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1992) | Missing | Only submitted substring queries over track title, artist credit and album; no unified entity search UI. |
| [⌘K shortcut](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1993) | Missing | Only submitted substring queries over track title, artist credit and album; no unified entity search UI. |
| [Tracks, artists, albums, labels](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1994) | Partial | Search matches title, artist text and album across 90,536 tracks. No separate artist/album entities or label search. |
| [Category tabs](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1995) | Missing | Only submitted substring queries over track title, artist credit and album; no unified entity search UI. |
| [Recent searches](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1996) | Missing | Only submitted substring queries over track title, artist credit and album; no unified entity search UI. |
| [Click actions (play, navigate)](https://github.com/Y0lan/pavoia-webradio-v2/blob/6fd53fee208595a45d12bfc29ec293f1dbd60d81/docs/GAENDE_WEBRADIO_v3.1_COMPLETE.md#L1997) | Missing | Only submitted substring queries over track title, artist credit and album; no unified entity search UI. |

## Features described outside the explicit checklist

These complete the nine families deferred by checklist section 36 to sections 21-29. They also cover unique addendum ideas and the later requests in this conversation.

| Family | Feature | Current result |
|---|---|---|
| Queue | Upcoming list; count, duration and average BPM | Missing. Internal prefetch/reservations are not a public queue contract. |
| Queue | Drag reorder, remove and skip-to-track | Missing. Requires an operator-control decision because the broadcast is shared by all listeners. |
| Notifications | New current track and stream reconnection | Delivered as player metadata/status updates. |
| Notifications | Playlist additions, new artists and listener milestones | Missing notifications. Changes are available only when their panel is opened/refreshed. |
| Notifications | All-stage online/offline events | Partial: selected-stage status only. |
| Notifications | Per-type switches, toast position/duration, desktop push, Do Not Disturb | Missing. |
| Audio settings | Fade duration/curve, prebuffer, quality auto/manual, normalization | Missing listener settings. Server fade duration is configurable by environment only. |
| Audio settings | Restore last selected station on page load | Missing. Reload starts with Lost in Feelings, paused. |
| Visualizer settings | Type, color, sensitivity, smoothing, bar count, visibility, fullscreen background, frequency band | Missing; no visualizer exists. |
| Appearance settings | Dark/OLED/Midnight themes, custom/stage accent, sidebar and selector layouts, cover shape, font size, compact mode | Missing settings. Current art direction is the default, not a customizable theme engine. |
| Appearance settings | Reduced motion | System preference is respected; no independent user toggle. |
| Data exports | Public history CSV, artist JSON and statistics PDF | Missing. Private metadata JSON inventory is not a listener export feature. |
| Advanced settings | Reconnect interval, latency hint, debug/FPS/graph/network inspectors | Missing user interface. Internal diagnostics exist separately. |
| PWA | Manifest, install icons, standalone mode and app shortcuts | Missing. A responsive website is not an installed PWA. |
| PWA | Service worker and offline shell/metadata cache | Missing. Live audio necessarily needs connectivity. |
| Media Session | Play, pause, stop, title and artist | Implemented where the browser supports it. |
| Media Session | Previous/next stage and lock-screen artwork | Missing. Current MediaMetadata contains title, artist and station album name, without artwork. |
| Mobile | Background/locked-screen playback | Android success was user-confirmed on the earlier pilot. WebKit emulation passed. Physical iPhone and network-change checks remain open. |
| Mobile | Swipe-expand/collapse, swipe-switch, long-press save/share, pull-refresh, pinch graph | Missing. |
| Mobile | Haptics on station/play/volume actions | Missing. |
| Mobile | Responsive persistent player | Delivered. Mobile bottom navigation and full-screen expanded player are missing. |
| Keyboard | Global Space, arrows, M, F, Cmd/Ctrl-K, digits, Escape, shortcut help | Missing application shortcuts. Native focused button/radio keyboard behavior remains available. |
| Accessibility | Semantic controls, labels, visible focus, reduced motion | Implemented basics. No complete WCAG AA audit or screen-reader device acceptance is claimed; dedicated track announcements need review. |
| Admin | Start/stop stations, visibility, metadata, playlist mapping | Operations scripts/source configuration only; no admin page. |
| Admin | Force Plex sync | Authenticated local API exists; no UI or consolidated error-log panel. |
| Admin | Enrichment queue, retries, manual re-enrichment and duplicate merge | Missing. |
| Admin | Queue management | Missing. |
| Admin | CPU/memory/disk, active streams, database/cache/search diagnostics | Some CLI tools and observer artifacts exist; no monitoring interface or alert system. |
| Sharing | Track and station deep links | Missing stateful deep links. Public home URL exists; opening it does not select a specific station/track. |
| Sharing | Track-info clipboard action | Missing. |
| Sharing | Open Graph track cards, stats/Wrapped PNG | Missing. |
| Frontend performance | Virtual lists, lazy image placeholders and multiple artwork sizes | Uses bounded 30-row pages and capped 640px thumbnails instead. Not the same virtualized/infinite catalogue experience. |
| Frontend performance | Optimistic UI | Local selection/playback states update promptly, but reported live state waits for actual events. No generalized optimistic data layer. |
| Frontend performance | Code splitting, link prefetch, service-worker caching | Missing/not needed by the current small static page; reassess if entity pages grow. |
| Frontend performance | Pause canvas when hidden | Not applicable: no canvas visualizer. |
| Frontend performance | WS retry/backoff | Replaced by bounded native stream reconnection and periodic status polling. |
| Backend performance | Persistent MPD connections and idle loop | Replaced by Liquidsoap + Icecast and the Go scheduler. |
| Backend performance | PostgreSQL pool, Redis hot cache, Meilisearch indexing | Replaced/absent: SQLite and bounded image cache. Evaluate query behavior before adding services; fuzzy search remains a real missing outcome. |
| Backend performance | Quota-aware enrichment worker | Missing in the current radio; requires Hermes integration or a separately approved source workflow. |
| Addendum | Stage playlist timeline (“git blame”) | Partial: observed additions/removals since baseline only. No original historical membership dates. |
| Addendum | Addition-source attribution: Bandcamp, Beatport, manual and other sources | Missing. Plex identity is known; purchase/discovery-source provenance is not imported. |
| Addendum | Digging sessions and their trigger/rabbit-hole narrative | Missing. Time grouping can be derived from trustworthy events; narrative causes must not be invented. |
| Insights | Country shift, BPM drift, new top artists, neglected stages, genre shift | All missing. Some need metadata not currently collected; rankings and stage activity can start from local records. |
| Insights | Discovery pace, diversity change, replay behavior, label loyalty, decade shift | All missing. Radio plays measure broadcast rotation, not the curator's personal listening. |
| Curator insights | Harmonic compatibility, energy arc, freshness score | Missing. Require key/BPM and correctly identified date semantics; BPM alone does not establish musical energy. |
| Curator insights | Artist concentration, stage overlap and genre coherence | Missing. Stage overlap and credited-name concentration can start from existing data, with identity limits disclosed. |
| Track Hunt | Bulk initial import and nightly incremental refresh | Missing. Handoff contract exists; no imported canonical dataset or running connector. |
| Track Hunt | INSERT/UPDATE/GET for artists, labels, tracks and releases | Missing shared knowledge API. Public radio endpoints are read-only; research writes belong behind private authentication. |
| Track Hunt | All credited artists, featured performers and remixers | Missing explicit role model. Current artist credit is a string and attributable Plex ID, not a complete multi-artist credit graph. |
| Track Hunt | Verified Instagram, Beatport, Spotify, Bandcamp, SoundCloud, RA and website links | Missing importer/public links. Search matches must not be presented as verified accounts. |
| Track Hunt | Deep artist bios and label bios, logos/photos, catalogue associations | Missing entity data and pages. EN/DE content and source provenance must be retained. |
| Track Hunt | Collaboration/remix/label graph and similar-artist discovery | Missing. Factual relations and editorial/algorithmic similarity must remain distinguishable. |
| Track Hunt | Liked tracks | Essentials uses the confirmed ❤️ Tracks playlist. Per-track liked badge/filter/action across the catalogue is absent; no write-back to Plex. |
| User visual direction | Blend playing cover, artist(s) and stage | Partial. Three image roles can be shown separately; a composed visual treatment and full multi-artist coverage remain unfinished. Fontanna uses a general festival photo. |
| User language requirement | English/German interface | Delivered for current UI; future biography content still needs both languages or honest missing-language states. |
| Festival live | HD live input, source handover, fallback and operator controls | Explicitly deferred. A playlist called Closing/Live Sets is not a live festival ingest system. |
| Operations | Reboot recovery, scoped ownership, read-only music, bounded logs/cache | Implemented. No unrelated service changes required. |
| Operations | Consistent backups and restoration | Daily backups implemented; six original stations have restore-test evidence. Fontanna restore has not yet been tested. |
| Operations | Backup freshness alerts, hung-process watchdog, end-to-end health dashboard | Missing. Restart-on-exit does not prove recovery from a hung healthy-looking process. |
| Capacity | 100 concurrent public listeners for 15 minutes with working website/API | Not achieved. The documented test failed; temporary shared cap is 90. Provider confirmation remains pending. |
| Reliability | 24-hour station/source observation | In progress for six original stations; no completed seven-station soak. Source presence is not continuous decoded-audio proof. |

## Old visual system and technology choices

The old visual system explicitly required scanlines, a CRT vignette, animated noise, angular corners/clip-paths, `//` section labels, monospace-heavy text, cyan-green accents, blue-black surfaces, icy text, glowing elements, a crosshair cursor, angular badges, glass player styling, accent focus states, scanning/pulsing loading states and terminal empty states.

These are presentation prescriptions, not missing radio capabilities. The current user direction is Pavoia photography/typography plus Gaende identity and the revised frontend. Do not restore those old effects merely to check boxes. The product needs readable focus/loading/error/empty states, regardless of visual style.

Likewise, Next.js, Zustand, Framer Motion, PostgreSQL, Redis, Meilisearch, MPD, specific graph/chart packages and WebSocket/SSE are choices, not acceptance criteria by themselves. The current lightweight architecture can support additional catalogue pages and SQL aggregates. Feature gaps should be closed based on behavior and data quality, not by reinstalling the entire old stack.

## API parity by capability

Current route inventory was read in `http.go` and `ops/manage.py`; old planned routes are in specification section 32 and implemented routes in `apps/bridge/api/routes.go` plus `apps/bridge/main.go`.

| API family | Current equivalent / missing scope |
|---|---|
| Stage status, now-playing and art | Per-stage `/api/radio/<stage>` and `/artwork/<id>/<kind>` exist. No public all-stage listing endpoint; selector is static. |
| Stage queue/history/music stats | No public queue or played history. `/stats` means audience statistics, not the old music-statistics contract. |
| Full-library and stage catalogue | `/api/library/catalogue` and `/api/radio/<stage>/catalogue` deliver paginated track search. |
| Individual track stream/download/details | No on-demand stream, file download or dedicated details endpoint. Live station streams are separate. |
| Discovery feed/status/manual sync | Per-stage `/changes`, status `sync`, and authenticated `/internal/sync` cover a narrower subset. No global discovery/new-artist/velocity APIs. |
| Digging calendar, date drill-down, patterns, sessions and streaks | None. |
| Artists, albums, similar artists, history, timeline, stats and enrichment | None. Existing artist/album IDs in track JSON are not entity endpoints. |
| Graph and graph statistics | None. |
| Top artists/tracks/albums/labels; stage/BPM/key/country/genre/decade statistics | None publicly. |
| Listening heatmaps, diversity, length, replay, crossover, transitions, curator insights | None publicly. Some source records already exist. |
| Wrapped stories, monthly recaps and PNG cards | None. |
| Unified search across entities | Track text search only; no type tabs, fuzzy matching or label results. |
| WS events and SSE notifications | No such endpoints; status polls every 10 seconds. |

## Data and interpretation gaps to fix before charts

| Gap | Why it matters | Minimum correct next step |
|---|---|---|
| Dates | Plex library addition, playlist membership addition, Track Hunt publication, and first radio observation are different events. | Preserve separate timestamp fields and provenance. Do not reconstruct playlist history from file mtime or label Plex library dates as membership dates. |
| Old date fallback | Old `disk/sidecar.go:AddedAt` uses sidecar `added_to_webradio`, then file mtime, then current time. That differs from older documentation promising Plex addedAt. | Audit legacy dates before any history migration; importing them blindly would manufacture precision. |
| Musical metadata | Current `plexContainer`/inventory record do not retain release year, genre, label, BPM or Camelot key. | Inspect actual Plex/tag/Track Hunt availability and read existing values without modifying music. Mark missing fields explicitly. |
| Artist identity | Compilation credits and joint artist strings cannot safely be treated as one resolved artist. | Stable IDs, explicit credits/roles and an unresolved state; no blind name-only joins. |
| Membership | Private inventory retains multiple playlist IDs, while the public library track representation omits membership and likes. | Store/serve cross-stage membership when building discovery and overlap views. |
| Listening meaning | All seven streams run continuously. Track starts indicate what the radio broadcast, not what Yolan or each listener heard. | Label broadcast counts, estimated listener-hours and personal library facts separately. Do not infer personal listening streaks or stage switching flows. |
| Source quality | Plex portraits/credits alone do not establish verified biographies, labels or similar artists. | Import Hermes evidence/confidence and publish only supported facts. |
| Metadata delivery | Current UI polls the broadcast head; browser buffering varies. | If exact song-to-art timing is required, verify latency and track-boundary alignment rather than claiming synchronization from polling alone. |

The old implementation is useful reference material for calendar queries, chart semantics, tag parsing and entity models. It should not be copied wholesale without checking those assumptions against current data.

## Recommended delivery order

1. **Complete the station map.** Add AMBIANCE and Closing/Outro if preserving all old stages. Confirm the two historical secondary-playlist combinations before merging their selections.
2. **Expose what already exists.** Public recent-play history, track detail links, cross-stage membership and a small catalogue dashboard. This does not require Hermes access.
3. **Collect the missing source fields.** Separate library/observation dates; read available genre/year/label/BPM/key metadata. Build the first honest digging calendar and music statistics with coverage indicators.
4. **Connect Track Hunt.** Initial import, incremental refresh, verified artist/label pages, credits, links and relations. Continue source-local features while access is pending.
5. **Finish listener experience and acceptance.** Volume/mute, station deep links, last-station preference and PWA if wanted; physical iPhone/network changes, seven-station soak and public capacity resolution. Keep festival live input for its later phase.

No step requires restoring the old neon/terminal design. Artist/label research is blocked by external data access; recent plays, stage overlap, basic collection statistics and source metadata work are not.
