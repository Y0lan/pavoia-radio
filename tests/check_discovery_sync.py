#!/usr/bin/env python3
"""Cache boundary checks: public projection, incremental deletes, failed-run rollback, unattended refresh."""
import fcntl
import hashlib
import http.client
import importlib.util
import json
import os
from pathlib import Path
import runpy
import signal
import sqlite3
import sys
import tempfile
from unittest.mock import patch

spec=importlib.util.spec_from_file_location('sync',Path(__file__).resolve().parents[1]/'ops/discovery_sync.py')
sync=importlib.util.module_from_spec(spec);spec.loader.exec_module(sync)
track={'id':'trk_000000000001','type':'track','title':'Test','liked':True,'plex':{'rating_key':'123','file':'/private/music.opus'},'playlists':[{'plex_rating_key':'146686'}]}
artist={'id':'art_000000000001','type':'artist','name':'Ambiguous','bio':{'text':'Multiple artists with this name'},'spotify':{'url':'https://open.spotify.com/artist/test'},'links':[{'kind':'instagram','status':'verified','url':'https://instagram.com/test'}]}
assert sync.project(track)['selected'] and not sync.project(track)['favorite']
track['playlists'].append({'plex_rating_key':'147167'})
assert sync.project(track)['favorite']
assert not sync.project(artist)['links'] and not sync.project(artist)['bio']
assert '/private' not in json.dumps(sync.project(track))
# Every document, including connected records, crosses the same public projection.
private='/home/yolan/private/music.opus'
private_artist=artist|{'name':'Artist '+private,'bio':{'text':'From '+private},'country':private,'tags':[private]}
private_track=track|{'title':'Track '+private,'credited_artist_string':private,
    'release':{'id':'rel_000000000001'},'credits':[{'artist_id':artist['id'],'role':private}],
    'plex':{'rating_key':private},'playlists':[{'title':private,'plex_rating_key':private}]}
private_release={'id':'rel_000000000001','type':'release','title':'Album '+private}
with sqlite3.connect(':memory:') as db:
    db.executescript('CREATE TABLE raw(id TEXT PRIMARY KEY,doc TEXT); CREATE TABLE entities(id TEXT,kind TEXT,plex_id TEXT,name TEXT,doc TEXT); CREATE TABLE media(sha TEXT PRIMARY KEY,path TEXT); CREATE TABLE info(key TEXT PRIMARY KEY,value TEXT);')
    for doc in (private_track,private_artist,private_release):sync.put(db,doc)
    sync.publish(db)
    documents=dict(db.execute('SELECT id,doc FROM entities'))
    assert all(private not in doc for doc in documents.values())
    assert json.loads(documents[track['id']])['album']=='Album'
    assert len(json.loads(documents[track['id']])['connections'])==2
for value in (private,r'C:\Users\private\music.opus',r'\\server\private\music.opus','/secret'):
    assert sync.text(value)==''
for value in ('AC/DC','Longing, tenderness, melancholy','https://example.com/artist/profile','primary/featured'):
    assert sync.text(value)==value
with tempfile.TemporaryDirectory() as temp:
    root=Path(temp);snapshot=root/'snapshot';snapshot.mkdir();state=root/'state'
    manifest={'files':{},'counts':{},'latest_seq':5}
    for filename,rows in [('tracks.json',[track]),('artists.json',[artist]),('releases.json',[]),('labels.json',[]),('playlists.json',[]),('deleted.json',[])]:
        blob=json.dumps(rows).encode();(snapshot/filename).write_bytes(blob)
        manifest['files'][filename]={'bytes':len(blob),'sha256':hashlib.sha256(blob).hexdigest()}
        if filename!='deleted.json':manifest['counts'][sync.KINDS[filename[:-5]]]=len(rows)
    (snapshot/'manifest.json').write_text(json.dumps(manifest));sync.sync(state,snapshot)
    original=(state/'catalogue.sqlite').read_bytes()
    def rejected_snapshot(expected):
        try:sync.sync(state,snapshot)
        except ValueError as error:assert expected in str(error),error
        else:raise AssertionError('Invalid snapshot published')
        assert (state/'catalogue.sqlite').read_bytes()==original
    missing=json.loads(json.dumps(manifest));del missing['files']['tracks.json']
    (snapshot/'manifest.json').write_text(json.dumps(missing))
    rejected_snapshot('checksum entry missing')
    for cursor in ('bad',-1,True,None,1.5):
        (snapshot/'manifest.json').write_text(json.dumps(manifest|{'latest_seq':cursor}))
        rejected_snapshot('Invalid snapshot cursor')
    duplicate=json.loads(json.dumps(manifest));blob=json.dumps([track,track]).encode()
    (snapshot/'tracks.json').write_bytes(blob)
    duplicate['files']['tracks.json']={'bytes':len(blob),'sha256':hashlib.sha256(blob).hexdigest()}
    duplicate['counts']['track']=2
    (snapshot/'manifest.json').write_text(json.dumps(duplicate))
    rejected_snapshot('Duplicate snapshot entity')
    (snapshot/'manifest.json').write_text(json.dumps(manifest))
    (snapshot/'tracks.json').write_text('[]')
    try:sync.sync(state,snapshot)
    except ValueError:pass
    else:raise AssertionError('Corrupt snapshot accepted')
    assert (state/'catalogue.sqlite').read_bytes()==original
    key=root/'key';key.write_text('test-key')
    class Response:
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def read(self,*args):return json.dumps(self.page).encode()
    class Client:
        def open(self,request,timeout):return response
    response=Response();response.page={'next_since':6,'has_more':False,'changes':[{'seq':6,'id':track['id'],'op':'delete'}]}
    with patch.object(sync.urllib.request,'build_opener',return_value=Client()):sync.sync(state,key_file=key)
    db=sqlite3.connect(state/'catalogue.sqlite')
    assert db.execute('select count(*) from entities where kind="track"').fetchone()[0]==0
    assert db.execute('select value from info where key="cursor"').fetchone()[0]=='6';db.close()
    original=(state/'catalogue.sqlite').read_bytes()
    response.page={'next_since':6,'has_more':True,'changes':[]}
    with patch.object(sync.urllib.request,'build_opener',return_value=Client()):
        try:sync.sync(state,key_file=key)
        except ValueError:pass
        else:raise AssertionError('Non-advancing feed accepted')
    assert (state/'catalogue.sqlite').read_bytes()==original

# Unattended refresh: status, no-op runs, rollback copy, guards, partial progress, hold, lock, signals.
def build(root, tracks=1, playlists=0):
    snap=root/'snapshot';snap.mkdir(parents=True);state=root/'state'
    docs={'tracks':[{'id':f'trk_{i:012x}','type':'track','title':f'T{i}'} for i in range(tracks)],
          'playlists':[{'id':f'pl_{i:012x}','type':'playlist','title':f'P{i}'} for i in range(playlists)],
          'artists':[],'releases':[],'labels':[]}
    manifest={'files':{},'counts':{},'latest_seq':5}
    for kind,rows in [*docs.items(),('deleted',[])]:
        blob=json.dumps(rows).encode();(snap/(kind+'.json')).write_bytes(blob)
        manifest['files'][kind+'.json']={'bytes':len(blob),'sha256':hashlib.sha256(blob).hexdigest()}
        if kind!='deleted':manifest['counts'][sync.KINDS[kind]]=len(rows)
    (snap/'manifest.json').write_text(json.dumps(manifest));sync.sync(state,snap)
    return state
def hermes(pages, info=None):
    pages=list(pages)
    class Reply:
        def __init__(self,body):self.body=body
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def read(self,*args):return json.dumps(self.body).encode()
    class Client:
        def open(self,request,timeout):
            if '/info' in request.full_url:
                if isinstance(info,Exception):raise info
                return Reply(info or {})
            page=pages.pop(0) if len(pages)>1 else pages[0]
            return Reply(page() if callable(page) else page)
    return patch.object(sync.urllib.request,'build_opener',return_value=Client())
def status(state):return json.loads((state/'sync-status.json').read_text())
def refused(state, pages, info=None, message='', **options):
    before=(state/'catalogue.sqlite').read_bytes()
    with hermes(pages,info):
        try:sync.sync(state,key_file=key,**options)
        except (ValueError,KeyboardInterrupt) as error:assert message in str(error),error
        else:raise AssertionError('Refresh accepted: '+message)
    assert (state/'catalogue.sqlite').read_bytes()==before and not list(state.glob('.catalogue-*'))
    assert status(state)['result']=='failed' and message in status(state)['error'],status(state)
empty={'next_since':5,'has_more':False,'changes':[]}
with tempfile.TemporaryDirectory() as temp:
    root=Path(temp);key=root/'key';key.write_text('test-key')
    state=build(root/'a')
    s=status(state);assert s['result']=='ok' and s['published'] and 'checkedAt' not in s and s['cursor']==5
    # A run with no new changes checks Hermes but republishes nothing, so the rollback copy survives.
    published=(state/'catalogue.sqlite').stat()
    with hermes([empty],{'latest_seq':5,'counts':{'track':2}}):sync.sync(state,key_file=key)
    s=status(state);assert not s['published'] and s['checkedAt'] and 'Count drift' in s['warnings'][0]
    assert (state/'catalogue.sqlite').stat().st_mtime_ns==published.st_mtime_ns
    (state/'.catalogue-stale.sqlite').write_text('left by a killed run')
    upsert={'seq':6,'id':'trk_000000000001','op':'upsert','doc':{'id':'trk_000000000001','type':'track','title':'New','hunt':{'number':float('nan')}}}
    with hermes([{'next_since':6,'has_more':False,'changes':[upsert]}],{'latest_seq':6,'counts':{'track':2}}):sync.sync(state,key_file=key)
    s=status(state);assert s['published'] and s['cursor']==6 and s['counts']=={'track':2} and not s.get('warnings')
    assert (state/'catalogue.previous.sqlite').stat().st_ino==published.st_ino and not list(state.glob('.catalogue-*'))
    db=sqlite3.connect(state/'catalogue.sqlite')
    docs=dict(db.execute('select id,doc from entities').fetchall());db.close()
    assert all('NaN' not in doc for doc in docs.values()) and json.loads(docs['trk_000000000001'])['hunt']['number'] is None
    refused(state,[{'next_since':6,'has_more':False,'changes':[]}],{'latest_seq':3},'Cursor ahead')
    bad={'seq':7,'id':'art_000000000009','op':'upsert','doc':{'id':'art_000000000009','type':'artist','name':'X','bio':'plain text'}}
    refused(state,[{'next_since':7,'has_more':False,'changes':[bad]}],message='art_000000000009')
    assert status(state)['consecutiveFailures']==2
    def terminate():
        os.kill(os.getpid(),signal.SIGTERM)
        return empty
    signal.signal(signal.SIGTERM,sync.stop)
    try:refused(state,[terminate],message='terminated')
    finally:signal.signal(signal.SIGTERM,signal.SIG_DFL)
    with hermes([{'next_since':6,'has_more':False,'changes':[]}],sync.urllib.error.URLError('offline')):sync.sync(state,key_file=key)
    s=status(state);assert s['result']=='ok' and s['consecutiveFailures']==0 and 'offline' in s['upstream']['error']
    (state/'sync.hold').touch();(state/'.catalogue-restore.sqlite').write_text('operator copy in progress')
    with hermes([lambda:1/0]):sync.sync(state,key_file=key)
    assert status(state)['result']=='held' and (state/'.catalogue-restore.sqlite').exists()
    (state/'sync.hold').unlink();(state/'.catalogue-restore.sqlite').unlink()
    with (state/'sync.lock').open('a') as busy:
        fcntl.flock(busy,fcntl.LOCK_EX);before=(state/'sync-status.json').read_bytes()
        with hermes([lambda:1/0]):sync.sync(state,key_file=key)
        assert (state/'sync-status.json').read_bytes()==before
    def cursor_of(state):
        db=sqlite3.connect(state/'catalogue.sqlite');value=db.execute("select value from info where key='cursor'").fetchone()[0];db.close()
        return int(value)
    # A broken /info body is advisory; the applied changes still publish.
    with hermes([{'next_since':7,'has_more':False,'changes':[]}],http.client.IncompleteRead(b'')):sync.sync(state,key_file=key)
    s=status(state);assert s['result']=='ok' and s['published'] and s['cursor']==7 and 'IncompleteRead' in s['upstream']['error']
    # A hold placed while a run is fetching stops that run before it replaces an operator restore.
    def hold_now():
        (state/'sync.hold').touch()
        return {'next_since':8,'has_more':False,'changes':[upsert|{'seq':8}]}
    before=(state/'catalogue.sqlite').read_bytes()
    with hermes([hold_now]):sync.sync(state,key_file=key)
    assert status(state)['result']=='held' and (state/'catalogue.sqlite').read_bytes()==before;(state/'sync.hold').unlink()
    # A termination that waited for the swap leaves a published cache and an ok status.
    real_replace=os.replace
    def replace_then_term(source,target):
        real_replace(source,target)
        if Path(target).name=='catalogue.sqlite':os.kill(os.getpid(),signal.SIGTERM)
    signal.signal(signal.SIGTERM,sync.stop)
    try:
        with hermes([{'next_since':9,'has_more':False,'changes':[upsert|{'seq':9}]}]),patch.object(sync.os,'replace',replace_then_term):sync.sync(state,key_file=key)
    finally:signal.signal(signal.SIGTERM,signal.SIG_DFL)
    s=status(state);assert s['result']=='ok' and s['published'] and s['cursor']==9==cursor_of(state)
    # A new version of the tool republishes once without new changes.
    with hermes([{'next_since':9,'has_more':False,'changes':[]}]),patch.object(sync,'PROJECTOR','new-projection'):sync.sync(state,key_file=key)
    assert status(state)['published']
    # The key never reaches an error message.
    (root/'bad-key').write_text('secret-token-123\nsecond line')
    with hermes([lambda:1/0]):
        try:sync.sync(state,key_file=root/'bad-key')
        except ValueError as error:assert 'secret' not in str(error)
    assert 'printable token' in status(state)['error'] and 'secret' not in (state/'sync-status.json').read_text()
    assert oct((state/'sync-status.json').stat().st_mode)[-3:]=='600'
    # The real command line installs the SIGTERM handler: cleanup and a failed status still happen.
    real_mkstemp=tempfile.mkstemp
    def mkstemp_then_term(*args,**kwargs):
        made=real_mkstemp(*args,**kwargs);os.kill(os.getpid(),signal.SIGTERM);return made
    before=(state/'catalogue.sqlite').read_bytes()
    try:
        with patch.object(sys,'argv',['discovery_sync.py','--state',str(state)]),patch.object(tempfile,'mkstemp',mkstemp_then_term):
            runpy.run_path(str(Path(sync.__file__)),run_name='__main__')
    except SystemExit as error:assert 'terminated' in str(error),error
    else:raise AssertionError('Command line ignored SIGTERM')
    finally:signal.signal(signal.SIGTERM,signal.SIG_DFL)
    assert status(state)['result']=='failed' and (state/'catalogue.sqlite').read_bytes()==before
    # The signal landed inside mkstemp, before the run knew the file; the next run sweeps it.
    with hermes([{'next_since':9,'has_more':False,'changes':[]}]):sync.sync(state,key_file=key)
    assert status(state)['result']=='ok' and not list(state.glob('.catalogue-*'))
    state=build(root/'b',tracks=100,playlists=1)
    deletes=[{'seq':6+i,'id':f'trk_{i:012x}','op':'delete'} for i in range(60)]
    refused(state,[{'next_since':65,'has_more':False,'changes':deletes}],message='track count 100 -> 40')
    refused(state,[{'next_since':6,'has_more':False,'changes':[{'seq':6,'id':'pl_000000000000','op':'delete'}]}],message='playlist count 1 -> 0')
    with hermes([{'next_since':65,'has_more':False,'changes':deletes}]):sync.sync(state,key_file=key,allow_shrink=True)
    assert status(state)['counts']['track']==40
    # A backlog longer than one run publishes what it applied and continues next time.
    cursor=iter(range(66,1000));checked=status(state)['checkedAt']
    with hermes([lambda:{'next_since':next(cursor),'has_more':True,'changes':[]}]):sync.sync(state,key_file=key)
    s=status(state);assert s['behind'] and s['published'] and s['cursor']==165 and s['checkedAt']==checked
    with hermes([lambda:1/0]):sync.sync(state,key_file=key,budget=-1)
    s=status(state);assert s['behind'] and not s['published'] and s['result']=='ok'
    refused(state,[{'next_since':1,'has_more':False,'changes':[]}],message='Invalid change cursor')
    assert status(state)['behind'] and status(state)['cursor']==165
    small=root/'small';small.mkdir();manifest={'files':{},'counts':{},'latest_seq':900000}
    for kind in [*sync.KINDS,'deleted']:
        (small/(kind+'.json')).write_text('[]');manifest['files'][kind+'.json']={'bytes':2,'sha256':hashlib.sha256(b'[]').hexdigest()}
        if kind!='deleted':manifest['counts'][sync.KINDS[kind]]=0
    (small/'manifest.json').write_text(json.dumps(manifest))
    try:sync.sync(state,small)
    except ValueError as error:assert 'Shrink guard' in str(error)
    else:raise AssertionError('Empty snapshot accepted')
    assert status(state)['cursor']==165
    # The guard boundary is max(50, 10%): 100 of 1000 tracks may go, 101 may not.
    state=build(root/'c',tracks=1000)
    refused(state,[{'next_since':106,'has_more':False,'changes':[{'seq':6+i,'id':f'trk_{i:012x}','op':'delete'} for i in range(101)]}],message='track count 1000 -> 899')
    with hermes([{'next_since':105,'has_more':False,'changes':[{'seq':6+i,'id':f'trk_{i:012x}','op':'delete'} for i in range(100)]}]):sync.sync(state,key_file=key)
    assert status(state)['counts']['track']==900
spec=importlib.util.spec_from_file_location('highlight',Path(__file__).resolve().parents[1]/'ops/highlight_trial.py')
highlight=importlib.util.module_from_spec(spec);spec.loader.exec_module(highlight)
assert highlight.window(205,284,20)==185
assert highlight.window(10,284,20)==0
assert highlight.window(275,284,0)==224
print('Discovery cache and highlight bounds checks passed')
