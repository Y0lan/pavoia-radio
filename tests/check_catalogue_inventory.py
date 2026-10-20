"""Run with python3 tests/check_catalogue_inventory.py. No live services used."""
import sys
from pathlib import Path
import xml.etree.ElementTree as ET
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'ops'))
import catalogue_inventory as ci


def read(path):
    if path == '/identity': return ET.fromstring('<MediaContainer machineIdentifier="test-server"/>')
    if path == '/playlists': return ET.fromstring('<MediaContainer><Playlist ratingKey="7" title="Test" playlistType="audio" leafCount="2"/></MediaContainer>')
    index = 0 if 'Start=0&' in path else 1
    return ET.fromstring(f'''<MediaContainer totalSize="2" size="1" offset="{index}">
      <Track ratingKey="{index+1}" title="Song" duration="1000" originalTitle="Performer" grandparentTitle="Various Artists"
       parentRatingKey="9" grandparentRatingKey="10" thumb="/library/metadata/9/thumb/1"
       grandparentThumb="/library/metadata/10/thumb/1"><Media><Part file="/private/music.mp3"/></Media></Track>
    </MediaContainer>''')


with patch.object(ci, 'PLAYLISTS', {'7': 'test'}), patch.object(ci, 'PAGE_SIZE', 1):
    result = ci.inventory(read)
    assert result['coverage']['unique_tracks'] == 2
    assert result['coverage']['cover_references'] == 2
    assert result['coverage']['attributable_artist_image_references'] == 0
    assert result['tracks'][0]['artist_credit'] == 'Performer'
    assert '/private/' not in str(result)
    def incomplete(path):
        page = read(path)
        if 'Start=1&' in path: page.set('totalSize', '3')
        return page
    try: ci.inventory(incomplete)
    except ValueError: pass
    else: raise AssertionError('Changing playlist was accepted')
assert ci.image_path('https://example.test/image.jpg') is None
assert ci.image_path('/library/metadata/9/thumb/1?token=secret') is None
assert ci.identifier('../9') is None
print('Catalogue inventory checks passed')

# Full-library inventory preserves radio membership and does not visit video sections.
def library_read(path):
    if path == '/library/sections':
        return ET.fromstring('<MediaContainer><Directory key="8" type="artist" title="Music"/><Directory key="9" type="movie" title="Video"/></MediaContainer>')
    assert path.startswith('/library/sections/8/all?type=10&')
    page = read(path)
    if 'Start=1&' in path:
        page[0].set('ratingKey', '3')
    return page

with patch.object(ci, 'PLAYLISTS', {'7': 'test'}), patch.object(ci, 'PAGE_SIZE', 1):
    full = ci.add_music_library(library_read, ci.inventory(read))
    assert full['schema_version'] == 2
    assert full['coverage']['unique_tracks'] == 3
    assert full['coverage']['radio_tracks'] == 2
    assert full['coverage']['library_tracks'] == 2
    assert full['coverage']['library_tracks_outside_radio'] == 1
    assert full['coverage']['radio_tracks_outside_library'] == 1
    assert full['tracks'][0]['playlist_ids'] == ['7']
    assert full['tracks'][0]['library_section_ids'] == ['8']
    assert full['tracks'][2]['playlist_ids'] == []
    assert full['music_sections'][0]['tracks'] == 2
    assert '/private/' not in str(full)
    def repeated(path):
        page = library_read(path)
        if path.startswith('/library/sections/8/all'):
            page[0].set('ratingKey', '1')
        return page
    try: ci.add_music_library(repeated, ci.inventory(read))
    except ValueError: pass
    else: raise AssertionError('Repeated library item accepted')
print('Full music-library inventory checks passed')

# Publication is atomic; failed replacement retains the last complete snapshot.
import copy
import sqlite3
import tempfile
with tempfile.TemporaryDirectory() as directory:
    target = Path(directory) / 'library.sqlite'
    full['completed_at'] = '2026-10-07T00:00:00+00:00'
    ci.publish_library(full, target)
    assert target.stat().st_mode & 0o777 == 0o600
    old = sqlite3.connect(f'file:{target}?mode=ro&immutable=1', uri=True)
    assert old.execute('SELECT total FROM library_info').fetchone() == (3,)
    broken = copy.deepcopy(full)
    broken['tracks'].append(broken['tracks'][0])
    try: ci.publish_library(broken, target)
    except sqlite3.IntegrityError: pass
    else: raise AssertionError('Duplicate snapshot accepted')
    with sqlite3.connect(target) as current:
        assert current.execute('SELECT COUNT(*) FROM tracks').fetchone() == (3,)
    smaller = copy.deepcopy(full)
    smaller['tracks'].pop()
    ci.publish_library(smaller, target)
    assert old.execute('SELECT COUNT(*) FROM tracks').fetchone() == (3,)
    old.close()
    with sqlite3.connect(target) as current:
        assert current.execute('SELECT total FROM library_info').fetchone() == (2,)
        assert not any(row[1] == 'path' for row in current.execute('PRAGMA table_info(tracks)'))
    assert not list(Path(directory).glob('.library-*'))
print('Atomic library publication checks passed')

# Statistics count each track once in a union and disclose missing metadata.
import json
with tempfile.TemporaryDirectory() as directory:
    root=Path(directory); discovery=root/'catalogue.sqlite'
    with sqlite3.connect(discovery) as db:
        db.executescript('CREATE TABLE entities(id TEXT,doc TEXT); CREATE TABLE info(key TEXT,value TEXT);')
        db.execute('INSERT INTO info VALUES(?,?)',('publishedAt','2026-10-15T00:00:00Z'))
        docs=[{'id':'trk_000000000001','type':'track','plexId':'1','releaseDate':'2004-01-01',
               'connections':[{'id':'lab_000000000001','relation':'label'}],'tags':[]},
              {'id':'lab_000000000001','type':'label','title':'Test label'}]
        db.executemany('INSERT INTO entities VALUES(?,?)',[(d['id'],json.dumps(d)) for d in docs])
    fixture=copy.deepcopy(full)
    fixture['tracks'][0]['playlist_ids']=['145469','162633','145471']
    fixture['tracks'][1]['playlist_ids']=['162633']
    fixture['tracks'][2]['playlist_ids']=[]
    stats=dict(ci.music_statistics(fixture,discovery))
    assert stats['fontanna']['tracks']==2
    assert stats['radio']['tracks']==2
    assert stats['library']['tracks']==2
    assert stats['fontanna']['stages']==[{'name':'etage-zero','count':1}]
    assert stats['fontanna']['coverage']['labels']==1 and stats['fontanna']['coverage']['years']==1
    assert stats['fontanna']['years']==[{'name':'2004','count':1}]
    assert stats['ambiance']['tracks']==0 and stats['ambiance']['topArtists']==[]
    assert '/private/' not in json.dumps(stats)
    # A rare recent year must precede a common older year; retain more than 12 years.
    years = list(range(2000, 2015)) + [2000, 2000]
    fixture['tracks'] = []
    with sqlite3.connect(discovery) as db:
        db.execute('DELETE FROM entities')
        for index, year in enumerate(years):
            track = copy.deepcopy(full['tracks'][0])
            track.update(plex_rating_key=str(index), playlist_ids=['145469'], artist_credit=f'Artist {index:02d}')
            fixture['tracks'].append(track)
            doc = dict(id=f'trk_{index:012x}', type='track', plexId=str(index), releaseDate=str(year))
            db.execute('INSERT INTO entities VALUES(?,?)', (doc['id'], json.dumps(doc)))
    many = dict(ci.music_statistics(fixture, discovery))
    years_chart = many['fontanna']['years']
    # Every artist of a stage and of all stages is listed; the whole library stops at 12.
    assert len(many['fontanna']['topArtists']) == len(many['radio']['topArtists']) == 17
    assert many['fontanna']['topArtists'][-1] == {'name': 'Artist 16', 'count': 1}
    assert len(many['library']['topArtists']) == 12
    assert [entry['name'] for entry in years_chart] == [str(year) for year in range(2014, 1999, -1)]
    assert years_chart[0]['count'] == 1 and years_chart[-1]['count'] == 3

print('Music statistics checks passed')
