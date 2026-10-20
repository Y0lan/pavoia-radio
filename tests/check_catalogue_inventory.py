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
        assert current.execute('SELECT kind FROM music_names ORDER BY kind').fetchall() == [('artists',), ('labels',)]
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
    stats, _ = ci.music_statistics(fixture, discovery)
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
    many, many_names = ci.music_statistics(fixture, discovery)
    years_chart = many['fontanna']['years']
    # Statistics keep a top 12 in every scope; the radio names document lists every artist.
    assert len(many['fontanna']['topArtists']) == len(many['radio']['topArtists']) == len(many['library']['topArtists']) == 12
    assert many['radio']['topArtists'][-1] == {'name': 'Artist 11', 'count': 1}
    assert many['radio']['artists'] == many_names['artists']['total'] == len(many_names['artists']['items']) == 17
    assert [entry['name'] for entry in years_chart] == [str(year) for year in range(2014, 1999, -1)]
    assert years_chart[0]['count'] == 1 and years_chart[-1]['count'] == 3

print('Music statistics checks passed')

# A credit string splits on ';' and featuring marks always, on joiners only into known artists.
def names(credit, known):
    return [e['name'] for e in ci.credited({'plex_rating_key': '0', 'artist_credit': credit}, {}, {}, known)]
for credit in ['A; B', 'A;B', 'A feat. B', 'A Feat B', 'A ft. B', 'A FT B', 'A featuring B', 'A (feat. B)', 'A (ft. B)', 'A (Featuring B)']:
    assert names(credit, {}) == ['A', 'B'], credit
known = {'a': None, 'b': None, 'c': None}
for credit in ['A, B', 'A & B', 'A x B', 'A X B', 'A and B', 'A vs B', 'A vs. B']:
    assert names(credit, known) == ['A', 'B'], credit
assert names('A, B & C', known) == ['A', 'B', 'C']
assert names('A & Unknown', known) == ['A & Unknown']
assert names('Defeat X', {}) == ['Defeat X'] and names('A ;; B', {}) == ['A', 'B'] and names('', {}) == []
# Placeholders name nobody; a linked discovery name stays whole, an unlinked one splits into known artists.
assert names('Various Artists', {}) == names('various', {}) == names('[unknown]', {}) == [] and names('A; Unknown Artist (TZU)', {}) == ['A']
assert names('A & B', dict(known, **{'a & b': dict(id='art_000000000abc', title='A & B', links=[{'kind': 'discogs'}])})) == ['A & B']
assert names('A & B', dict(known, **{'a & b': dict(id='art_000000000abc', title='A & B', links=[])})) == ['A', 'B']
print('Artist credit splitting checks passed')

# Discovery credits win; Âme credited in three spellings is one artist with a picture; names list every radio artist.
with tempfile.TemporaryDirectory() as directory:
    discovery = Path(directory) / 'catalogue.sqlite'
    picture = '/api/discovery/media/' + 'a' * 40
    records = [dict(id='art_000000000a01', type='artist', title='Âme', image=picture),
               dict(id='art_000000000a02', type='artist', title='Mathew Jonson'),
               dict(id='art_000000000a03', type='artist', title='Vulkano', image='https://example.test/vulkano.jpg'),
               dict(id='art_000000000a04', type='artist', title='Twin'), dict(id='art_000000000a05', type='artist', title='TWIN'),
               dict(id='art_000000000a06', type='artist', title='Remixer One'), dict(id='art_000000000a07', type='artist', title='Guest'),
               dict(id='art_000000000a08', type='artist', title='Kiki & Herb', links=[dict(kind='discogs', url='https://www.discogs.com/artist/1')]),
               dict(id='lab_000000000b01', type='label', title='Innervisions', image='/api/discovery/media/' + 'b' * 40),
               dict(id='lab_000000000b02', type='label', title='Label Two'),
               dict(id='trk_000000000c01', type='track', plexId='1', connections=[
                   dict(id='art_000000000a01', relation='primary'), dict(id='art_000000000a06', relation='remixer'),
                   dict(id='art_000000000a07', relation='featured/collaboration'), dict(id='art_000000000a02', relation='similar'),
                   dict(id='art_000000000a01', relation='primary'), dict(id='lab_000000000b01', relation='label')]),
               dict(id='trk_000000000c05', type='track', plexId='5', connections=[dict(id='lab_000000000b02', relation='label')]),
               dict(id='trk_000000000c07', type='track', plexId='7', connections=[dict(id='lab_000000000b01', relation='label')])]
    with sqlite3.connect(discovery) as db:
        db.executescript('CREATE TABLE entities(id TEXT,doc TEXT); CREATE TABLE info(key TEXT,value TEXT);')
        db.executemany('INSERT INTO entities VALUES(?,?)', [(d['id'], json.dumps(d)) for d in records])
    credits = [('Whatever Credit', ['146686', '146377']), ('Âme; Mathew Jonson', ['146686']), ('ÂME;Vulkano', ['146377']),
               ('Solo Artist feat. Guest', ['145470']), ('SOLOMUN & Stimming', ['145470']), ('Solomun', []),
               ('Stimming', ['145470']), ('Frankey & Sandrino', ['145470']), ('Guest, Twin', ['145470']),
               ('Twin (feat. Vulkano)', ['145470']), ('frankey', ['145470']), ('Kiki & Herb', ['145470']), ('Kiki', []), ('Herb', []), ('Solomun', [])]
    fixture = copy.deepcopy(full)
    fixture['tracks'] = [dict(copy.deepcopy(full['tracks'][0]), plex_rating_key=str(index), artist_credit=credit,
                              playlist_ids=playlists, library_section_ids=['8']) for index, (credit, playlists) in enumerate(credits, 1)]
    stats, docs = ci.music_statistics(fixture, discovery)
    artists = {item['name']: item for item in docs['artists']['items']}
    ame = dict(name='Âme', id='art_000000000a01', image=picture, count=3, stages={'palac-feel': 2, 'bermuda-day': 2})
    assert artists['Âme'] == ame
    assert artists['Guest'] == dict(name='Guest', id='art_000000000a07', count=3, stages={'palac-feel': 1, 'bermuda-day': 1, 'palac-dance': 2})
    assert artists['Vulkano'] == dict(name='Vulkano', id='art_000000000a03', count=2, stages={'bermuda-day': 1, 'palac-dance': 1})
    assert artists['Twin'] == dict(name='Twin', count=2, stages={'palac-dance': 2})  # ambiguous title: no id
    assert artists['Remixer One']['id'] == 'art_000000000a06' and artists['Mathew Jonson']['count'] == 1
    assert 'Whatever Credit' not in artists and 'Solo Artist' in artists
    # 'SOLOMUN' on the radio track shows as 'Solomun', its most common spelling.
    assert artists['Solomun'] == dict(name='Solomun', count=1, stages={'palac-dance': 1}) and artists['Stimming']['count'] == 2
    assert 'Frankey & Sandrino' in artists and artists['frankey']['count'] == 1
    assert artists['Kiki & Herb']['id'] == 'art_000000000a08' and 'Kiki' not in artists
    order = [item['name'] for item in docs['artists']['items']]
    # Ties sort by folded name, so 'frankey' comes before 'Frankey & Sandrino' and 'Guest' before 'Âme'.
    assert order == ['Guest', 'Âme', 'Stimming', 'Twin', 'Vulkano', 'frankey', 'Frankey & Sandrino', 'Kiki & Herb',
                     'Mathew Jonson', 'Remixer One', 'Solo Artist', 'Solomun'], order
    assert docs['artists']['total'] == 12 and docs['artists']['kind'] == 'artists' and docs['artists']['updatedAt'] == fixture['completed_at']
    assert docs['labels'] == dict(kind='labels', updatedAt=fixture['completed_at'], total=2, items=[
        dict(name='Innervisions', id='lab_000000000b01', image='/api/discovery/media/' + 'b' * 40, count=2,
             stages={'palac-feel': 1, 'bermuda-day': 1, 'palac-dance': 1}),
        dict(name='Label Two', id='lab_000000000b02', count=1, stages={'palac-dance': 1})])
    radio = stats['radio']
    assert radio['artists'] == 12 and radio['coverage']['artists'] == 11 and radio['coverage']['labels'] == 3
    assert radio['topArtists'][:2] == [dict(name='Guest', count=3, id='art_000000000a07'), dict(name='Âme', count=3, id='art_000000000a01', image=picture)]
    assert stats['bermuda-day']['topArtists'][0] == dict(name='Âme', count=2, id='art_000000000a01', image=picture)
    assert stats['palac-dance']['labels'] == [dict(name='Innervisions', count=1, id='lab_000000000b01', image='/api/discovery/media/' + 'b' * 40),
                                              dict(name='Label Two', count=1, id='lab_000000000b02')]
    library = stats['library']
    assert library['tracks'] == 15 and library['artists'] == 14
    assert [(item['name'], item['count']) for item in library['topArtists']] == [
        ('Guest', 3), ('Solomun', 3), ('Âme', 3), ('Stimming', 2), ('Twin', 2), ('Vulkano', 2), ('frankey', 1),
        ('Frankey & Sandrino', 1), ('Herb', 1), ('Kiki', 1), ('Kiki & Herb', 1), ('Mathew Jonson', 1)]
print('Credited artists and names documents checks passed')

# Discovery titles naming several artists split; placeholders, remix labels and label spellings do not become names.
with tempfile.TemporaryDirectory() as directory:
    discovery = Path(directory) / 'catalogue.sqlite'
    linked = [dict(kind='discogs', url='https://www.discogs.com/artist/1')]
    titles = ['Ten Systems', 'SANDHAUS', 'Ten Systems feat. SANDHAUS', 'Adam Ten', 'Mita Gami', 'Adam Ten;Mita Gami', 'Adriatique',
              'Marino Canal', 'Adriatique & Marino Canal', 'Pavi & Carlos (IT)', '[unknown]', 'Kevin de Vries', 'Kevin de Vries extended',
              'Garage', 'Purple Dub', 'Locked Club', 'H.O.S.H.', 'Stimming', 'Twin Peaks', 'Twin Peaks', 'Dole', 'Kom',
              'Dole & Kom', 'Prok & Fitch', 'Green Velvet']
    artist = {}
    for index, title in enumerate(titles):
        artist.setdefault(title, f'art_{index:012x}')
    records = [dict(id=f'art_{index:012x}', type='artist', title=title, links=linked if title in ('Ten Systems feat. SANDHAUS', 'Kevin de Vries extended', 'Dole & Kom', 'Prok & Fitch') else [])
               for index, title in enumerate(titles)]
    records += [dict(id='lab_00000000000a', type='label', title='Stil Vor Talent', image='/api/discovery/media/' + 'c' * 40),
                dict(id='lab_00000000000b', type='label', title='Stil Vor Talent Records'), dict(id='lab_00000000000c', type='label', title='[no label]'),
                dict(id='lab_00000000000d', type='label', title='StilVor-Talent')]
    tracks = {  # Plex credit, discovery (artist title, relation), labels
        '1': ('Ten Systems feat. SANDHAUS', [('Ten Systems feat. SANDHAUS', 'primary')], 'a'), '2': ('Ten Systems', [('Ten Systems', 'primary')], 'a'),
        '3': ('Adam Ten;Mita Gami', [('Adam Ten;Mita Gami', 'primary')], 'b'), '4': ('Adriatique & Marino Canal', [('Adriatique & Marino Canal', 'primary')], 'ab'),
        '5': ('Adriatique & Marino Canal', None, ''), '6': ('Pavi & Carlos (IT)', [('Pavi & Carlos (IT)', 'primary')], 'd'), '7': ('Pavi & Carlos (IT)', None, ''),
        '8': ('Unknown Artist', [('[unknown]', 'primary')], 'c'), '9': ('Various Artists', None, ''),
        '10': ('Kevin de Vries', [('Kevin de Vries', 'primary'), ('Kevin de Vries extended', 'remixer'), ('Garage', 'remixer'), ('Purple Dub', 'remixer')], ''),
        '11': ('Locked Club', [('Locked Club', 'primary')], ''), '12': ('Stimming & H.O.S.H.', [('H.O.S.H.', 'primary')], ''),
        '13': ('H.O.S.H. & Nobody', [('H.O.S.H.', 'primary')], ''), '14': ('Twin Peaks', [('Twin Peaks', 'primary')], ''),
        '15': ('Dole & Kom', [('Dole', 'primary'), ('Kom', 'primary')], ''), '16': ('Prok & Fitch, Green Velvet', [('Prok & Fitch', 'primary')], '')}
    records += [dict(id=f'trk_{int(plex):012x}', type='track', plexId=plex, connections=[dict(id=artist[title], relation=relation) for title, relation in people]
                     + [dict(id='lab_00000000000' + label, relation='label') for label in labels]) for plex, (_, people, labels) in tracks.items() if people]
    with sqlite3.connect(discovery) as db:
        db.executescript('CREATE TABLE entities(id TEXT,doc TEXT); CREATE TABLE info(key TEXT,value TEXT);')
        db.executemany('INSERT INTO entities VALUES(?,?)', [(d['id'], json.dumps(d)) for d in records])
    fixture = copy.deepcopy(full)
    fixture['tracks'] = [dict(copy.deepcopy(full['tracks'][0]), plex_rating_key=plex, artist_credit=credit, playlist_ids=['146686'], library_section_ids=['8'])
                         for plex, (credit, _, _) in tracks.items()]
    stats, docs = ci.music_statistics(fixture, discovery)
    items = {item['name']: item for item in docs['artists']['items']}
    assert {name: item['count'] for name, item in items.items()} == {
        'Ten Systems': 2, 'SANDHAUS': 1, 'Adam Ten': 1, 'Mita Gami': 1, 'Adriatique': 2, 'Marino Canal': 2, 'Pavi & Carlos (IT)': 2,
        'Kevin de Vries': 1, 'Purple Dub': 1, 'Locked Club': 1, 'H.O.S.H.': 2, 'Stimming': 1, 'Twin Peaks': 1,
        'Dole': 1, 'Kom': 1, 'Prok & Fitch': 1, 'Green Velvet': 1}, items
    assert items['Ten Systems']['id'] == artist['Ten Systems'] and items['Pavi & Carlos (IT)']['id'] == artist['Pavi & Carlos (IT)']
    assert items['Twin Peaks']['id'] == 'art_000000000012' and items['Stimming']['id'] == artist['Stimming']
    assert stats['radio']['coverage']['artists'] == 14 and stats['radio']['coverage']['labels'] == 5
    assert docs['labels']['items'] == [dict(name='Stil Vor Talent', id='lab_00000000000a', image='/api/discovery/media/' + 'c' * 40, count=5, stages={'palac-feel': 5})]
    # Punctuation and stacked suffixes do not keep spellings of one label apart.
    assert {ci.label_fold(t) for t in ('Foo', 'Foo Records', 'Foo-Records', 'Foo Records Ltd', 'Foo Recordings Limited.')} == {'foo'}
    # An artist the credit string adds counts as credited for the names after it: B then 'B & C' adds B only.
    entities = {'art_a': dict(id='art_a', type='artist', title='A'), 'art_b': dict(id='art_b', type='artist', title='B'),
                'art_bc': dict(id='art_bc', type='artist', title='B & C', links=linked)}
    metadata = {'1': dict(connections=[dict(id='art_a', relation='primary')])}
    added = ci.credited(dict(plex_rating_key='1', artist_credit='A; B; B & C'), metadata, entities, ci.known_artists(entities, []))
    assert [e['name'] for e in added] == ['A', 'B'], added
print('Composite credits, placeholders, remix labels and label spellings checks passed')
