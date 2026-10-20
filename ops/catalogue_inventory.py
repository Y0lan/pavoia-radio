#!/usr/bin/env python3
"""Export a private Plex metadata inventory. Never read or modify audio files."""
import argparse
from collections import Counter
from contextlib import closing
import json
import math
import fcntl
import os
import sqlite3
import tempfile
import re
from datetime import datetime, timezone
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET

from manage import ROOT, private_write

PLAYLISTS = {
    '146686': 'palac-feel', '145470': 'palac-dance',
    '146377': 'bermuda-day', '145468': 'bermuda-evening',
    '145471': 'etage-zero', '147167': 'essentials', '145469': 'fontanna',
    '147259': 'etage-zero', '162633': 'fontanna', '145472': 'ambiance', '162463': 'closing',
}
ID = re.compile(r'[0-9]{1,32}')
IMAGE = re.compile(r'/library/metadata/[0-9]{1,32}/(?:thumb|art)/[0-9]+')
PAGE_SIZE = 200


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def plex_reader(env):
    opener = urllib.request.build_opener(NoRedirect())
    def read(path):
        request = urllib.request.Request(env['PAVOIA_PLEX_URL'].rstrip('/') + path,
                                         headers={'X-Plex-Token': env['PAVOIA_PLEX_TOKEN']})
        with opener.open(request, timeout=20) as response:
            raw = response.read(8 * 1024 * 1024 + 1)
        if len(raw) > 8 * 1024 * 1024:
            raise ValueError('Plex metadata response exceeded limit')
        return ET.fromstring(raw)
    return read


def identifier(value):
    return value if value and ID.fullmatch(value) else None


def image_path(value):
    return value if value and IMAGE.fullmatch(value) else None


def record(item):
    key = identifier(item.get('ratingKey'))
    if not key:
        raise ValueError('Missing or invalid track ID')
    album_artist = item.get('grandparentTitle', '')
    credit = item.get('originalTitle') or album_artist
    # Plex's album artist does not identify the performer on compilation tracks.
    attributable = credit.casefold() == album_artist.casefold() and album_artist.casefold() not in ('', 'various artists', 'various')
    duration = int(item.get('duration', '0'))
    if not 0 <= duration <= 86400000:
        raise ValueError('Invalid track duration')
    rating = float(item.get('userRating')) if item.get('userRating') else None
    if rating is not None and (not math.isfinite(rating) or not 0 <= rating <= 10):
        raise ValueError('Invalid user rating')
    return {
        'plex_rating_key': key, 'title': item.get('title', ''), 'artist_credit': credit,
        'duration_ms': duration, 'plex_album_id': identifier(item.get('parentRatingKey')),
        'album': item.get('parentTitle'), 'album_artist': album_artist,
        'plex_artist_id': identifier(item.get('grandparentRatingKey')) if attributable else None,
        'cover_path': image_path(item.get('thumb') or item.get('parentThumb')),
        'artist_image_path': image_path(item.get('grandparentThumb')) if attributable else None,
        'user_rating': rating,
        'plex_guid': item.get('guid') if item.get('guid', '').startswith('plex://track/') else None,
        'playlist_ids': [],
    }


def paged_tracks(read, path):
    expected, start = None, 0
    separator = '&' if '?' in path else '?'
    while expected is None or start < expected:
        page = read(f'{path}{separator}X-Plex-Container-Start={start}&X-Plex-Container-Size={PAGE_SIZE}')
        items = list(page)
        total = int(page.get('totalSize', '-1'))
        if expected is None:
            expected = total
        if (not 0 <= total <= 1000000 or total != expected
                or int(page.get('offset', str(start))) != start
                or int(page.get('size', '-1')) != len(items)
                or len(items) > PAGE_SIZE or (not items and expected != 0) or start + len(items) > expected):
            raise ValueError('Incomplete or changing Plex collection')
        for item in items:
            if item.tag != 'Track':
                raise ValueError('Non-track item in music collection')
            yield item
        start += len(items)


def add_music_library(read, result):
    tracks = {track['plex_rating_key']: dict(track, library_section_ids=[]) for track in result['tracks']}
    sections = []
    for section in read('/library/sections'):
        if section.tag != 'Directory' or section.get('type') != 'artist':
            continue
        key = identifier(section.get('key'))
        if not key:
            raise ValueError('Invalid music section ID')
        seen = set()
        for item in paged_tracks(read, f'/library/sections/{key}/all?type=10'):
            value = record(item)
            track_id = value['plex_rating_key']
            if track_id in seen:
                raise ValueError('Repeated track during library pagination')
            seen.add(track_id)
            previous = tracks.get(track_id, {})
            # Library metadata is authoritative here; preserve observed radio memberships.
            value['playlist_ids'] = previous.get('playlist_ids', [])
            value['library_section_ids'] = previous.get('library_section_ids', []) + [key]
            tracks[track_id] = value
        sections.append({'plex_id': key, 'name': section.get('title'), 'tracks': len(seen)})
    if not sections:
        raise ValueError('No music library sections found')
    result['schema_version'] = 2
    result['music_sections'] = sections
    result['tracks'] = sorted(tracks.values(), key=lambda track: int(track['plex_rating_key']))
    result['scope'] = 'all_music_and_radio_playlists'
    result['coverage'] = coverage(result['tracks'])
    result['coverage'].update({
        'radio_tracks': sum(bool(track['playlist_ids']) for track in tracks.values()),
        'library_tracks': sum(bool(track['library_section_ids']) for track in tracks.values()),
        'library_tracks_outside_radio': sum(bool(track['library_section_ids']) and not track['playlist_ids'] for track in tracks.values()),
        'radio_tracks_outside_library': sum(bool(track['playlist_ids']) and not track['library_section_ids'] for track in tracks.values()),
    })
    return result


def coverage(tracks):
    return {
        'unique_tracks': len(tracks),
        'cover_references': sum(bool(t['cover_path']) for t in tracks),
        'attributable_artist_image_references': sum(bool(t['artist_image_path']) for t in tracks),
        'distinct_albums': len({t['plex_album_id'] for t in tracks if t['plex_album_id']}),
        'distinct_plex_artists': len({t['plex_artist_id'] for t in tracks if t['plex_artist_id']}),
        'tracks_without_attributable_artist_id': sum(not t['plex_artist_id'] for t in tracks),
    }


def inventory(read):
    identity = read('/identity').get('machineIdentifier')
    if not identity:
        raise ValueError('Plex server identity unavailable')
    available = {p.get('ratingKey'): p for p in read('/playlists') if p.tag == 'Playlist'}
    result = {'schema_version': 1, 'generated_at': datetime.now(timezone.utc).isoformat(),
              'plex_server_id': identity, 'playlists': [], 'tracks': []}
    tracks = {}
    for key, stage in PLAYLISTS.items():
        playlist = available.get(key)
        if playlist is None or playlist.get('playlistType') != 'audio':
            raise ValueError(f'Audio playlist {key} unavailable')
        expected = int(playlist.get('leafCount', '-1'))
        if not 0 <= expected <= 100000:
            raise ValueError('Invalid playlist count')
        reported = expected
        entries, seen = 0, set()
        for item in paged_tracks(read, f'/playlists/{key}/items'):
            value = record(item)
            track_id = value['plex_rating_key']
            existing = tracks.setdefault(track_id, value)
            if {k: v for k, v in existing.items() if k != 'playlist_ids'} != {k: v for k, v in value.items() if k != 'playlist_ids'}:
                raise ValueError('Track metadata changed during inventory')
            if key not in existing['playlist_ids']:
                existing['playlist_ids'].append(key)
            seen.add(track_id)
            entries += 1
        result['playlists'].append({'plex_id': key, 'stage': stage, 'name': playlist.get('title'),
                                   'reported_entries': reported, 'entries': entries, 'unique_tracks': len(seen)})
    result['tracks'] = sorted(tracks.values(), key=lambda t: int(t['plex_rating_key']))
    result['coverage'] = coverage(result['tracks'])
    return result


def music_statistics(result, discovery):
    """Count Plex tracks once per scope; enrich only from public catalogue fields."""
    metadata, entities, metadata_at = {}, {}, None
    if discovery.exists():
        with closing(sqlite3.connect(discovery.as_uri() + '?mode=ro&immutable=1', uri=True)) as db:
            entities = {identifier: json.loads(doc) for identifier, doc in db.execute('SELECT id,doc FROM entities')}
            metadata = {d['plexId']: d for d in entities.values() if d.get('type') == 'track' and d.get('plexId')}
            row = db.execute("SELECT value FROM info WHERE key='publishedAt'").fetchone()
            metadata_at = row[0] if row else None
    tracks = result['tracks']
    membership = {t['plex_rating_key']: {PLAYLISTS[p] for p in t['playlist_ids'] if p in PLAYLISTS} for t in tracks}
    groups = {'library': [t for t in tracks if t.get('library_section_ids')], 'radio': [t for t in tracks if membership[t['plex_rating_key']]]}
    groups.update({stage: [t for t in tracks if stage in membership[t['plex_rating_key']]] for stage in dict.fromkeys(PLAYLISTS.values())})
    def ranked(counts, limit=12):
        return [{'name': name, 'count': count} for name, count in sorted(counts.items(), key=lambda p: (-p[1], p[0]))[:limit]]
    for scope, selected in groups.items():
        # Every artist and label of the playlists can be explored; the unused whole-library scope keeps its top 12.
        every = 12 if scope == 'library' else None
        artists, years, labels, genres, overlap = (Counter() for _ in range(5))
        albums = set()
        coverage = dict(artists=0, releases=0, years=0, labels=0, genres=0)
        for t in selected:
            if t['artist_credit']:
                artists[t['artist_credit']] += 1
                coverage['artists'] += 1
            if t['plex_album_id']:
                albums.add(t['plex_album_id'])
                coverage['releases'] += 1
            doc = metadata.get(t['plex_rating_key'], {})
            date = doc.get('releaseDate', '')
            if re.fullmatch(r'[12][0-9]{3}(?:-[0-9]{2}(?:-[0-9]{2})?)?', date):
                years[date[:4]] += 1
                coverage['years'] += 1
            track_labels = {entities[r['id']]['title'] for r in doc.get('connections', [])
                            if r.get('relation') == 'label' and r['id'] in entities and entities[r['id']].get('title')}
            labels.update(track_labels)
            coverage['labels'] += bool(track_labels)
            tags = set(doc.get('tags') or [])
            genres.update(tags)
            coverage['genres'] += bool(tags)
            overlap.update(membership[t['plex_rating_key']] - {scope})
        yield scope, {'scope': scope, 'updatedAt': result['completed_at'], 'metadataAt': metadata_at,
                      'tracks': len(selected), 'artists': len(artists), 'releases': len(albums),
                      'durationMs': sum(t['duration_ms'] for t in selected), 'coverage': coverage,
                      'topArtists': ranked(artists, every), 'years': [{'name': year, 'count': years[year]} for year in sorted(years, reverse=True)], 'labels': ranked(labels, every),
                      'genres': ranked(genres), 'stages': ranked(overlap)}


def publish_library(result, destination):
    """Publish only complete metadata snapshots. Readers keep the previous inode until done."""
    if result.get('scope') != 'all_music_and_radio_playlists' or not result.get('completed_at'):
        raise ValueError('A completed full-library inventory is required')
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.library-', suffix='.sqlite', dir=destination.parent)
    os.close(fd)
    try:
        with closing(sqlite3.connect(temporary)) as db, db:
            db.executescript("""
                CREATE TABLE tracks(id TEXT PRIMARY KEY,title TEXT NOT NULL,artist TEXT NOT NULL,duration INTEGER NOT NULL);
                CREATE TABLE track_details(id TEXT PRIMARY KEY,album_id TEXT,album TEXT,artist_id TEXT,cover_path TEXT,portrait_path TEXT);
                CREATE TABLE library_info(total INTEGER NOT NULL,updated_at TEXT NOT NULL);
                CREATE TABLE music_statistics(scope TEXT PRIMARY KEY,doc TEXT NOT NULL);
            """)
            db.executemany('INSERT INTO tracks VALUES(?,?,?,?)', (
                (t['plex_rating_key'], t['title'], t['artist_credit'], t['duration_ms']) for t in result['tracks']))
            db.executemany('INSERT INTO track_details VALUES(?,?,?,?,?,?)', (
                (t['plex_rating_key'], t['plex_album_id'] or '', t['album'] or '', t['plex_artist_id'] or '',
                 t['cover_path'] or '', t['artist_image_path'] or '') for t in result['tracks']))
            db.execute('INSERT INTO library_info VALUES(?,?)', (len(result['tracks']), result['completed_at']))
            db.executemany('INSERT INTO music_statistics VALUES(?,?)', (
                (scope, json.dumps(doc, allow_nan=False))
                for scope, doc in music_statistics(result, destination.parent / 'discovery/catalogue.sqlite')))
            if db.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('Library snapshot integrity check failed')
        with open(temporary, 'rb') as snapshot:
            os.fsync(snapshot.fileno())
        os.replace(temporary, destination)
    finally:
        Path(temporary).unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--all-music', action='store_true', help='Include every Plex music section; metadata only')
    parser.add_argument('--publish-library', action='store_true', help='Refresh the full music catalogue snapshot used by the website')
    parser.add_argument('--output', type=Path, default=ROOT / 'artifacts/catalogue-inventory.json')
    args = parser.parse_args()
    # A second scheduled/manual refresh must not replace a newer snapshot with older data.
    lock = (ROOT / 'state/library-refresh.lock').open('a')
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print('Catalogue refresh already running')
        return
    env = dict(line.split('=', 1) for line in (ROOT / 'secrets/controller.env').read_text().splitlines() if '=' in line)
    read = plex_reader(env)
    result = inventory(read)
    if args.all_music or args.publish_library:
        result = add_music_library(read, result)
    result['completed_at'] = datetime.now(timezone.utc).isoformat()
    if args.publish_library:
        publish_library(result, ROOT / 'state/library.sqlite')
    private_write(args.output, json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'output': str(args.output), 'playlists': result['playlists'], 'coverage': result['coverage']}, ensure_ascii=False))


if __name__ == '__main__':
    main()
