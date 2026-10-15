#!/usr/bin/env python3
"""Publish a local read cache of Hermes metadata. Never changes Plex or audio."""
import argparse
from contextlib import closing
import fcntl
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import signal
import sqlite3
import tempfile
import time
from datetime import datetime, timezone
from urllib.parse import urlsplit
import urllib.request

API = 'https://gaende-slave-5720.agents.nousresearch.com/api/plugins/pavoia-catalogue/v1'
ENTITY = re.compile(r'(?:art|trk|rel|lab|pl)_[a-f0-9]{12}')
SHA = re.compile(r'[a-f0-9]{40}')
PUBLIC_TEXT = re.compile(r'''https?://[^\s"'<>]+|(?:/[\w.~ -]+){2,}|(?<![\w/])/\w[^\s"'<>]*|[A-Za-z]:[\\/][^\s"'<>]+|\\\\[^\s"'<>]+''')
AMBIGUOUS = re.compile(r'more than one|multiple artists|(?:artists?|bands?) (?:with|by) (?:the |this |same )*name', re.I)
KINDS = {'tracks':'track','releases':'release','artists':'artist','labels':'label','playlists':'playlist'}
# A new projection rule republishes once even when Hermes has no new changes.
PROJECTOR = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()[:16]

def valid_id(value):
    return isinstance(value, str) and ENTITY.fullmatch(value)

def safe_url(value):
    if not isinstance(value, str) or len(value)>2048 or any(ord(c)<32 for c in value):
        return None
    u=urlsplit(value)
    return value if u.scheme in ('https','http') and u.hostname and not u.username and not u.password else None

def text(value, limit=800):
    value=''.join(c for c in str(value or '') if c in '\n\t' or ord(c)>=32)
    # Keep public web URLs; remove filesystem paths before truncation.
    return PUBLIC_TEXT.sub(lambda m:m[0] if m[0].startswith(('https://','http://')) else '',value).strip()[:limit]

def plex_id(value):
    value=str(value or '')
    return value if re.fullmatch(r'[0-9]{1,32}',value) else ''

def images(doc):
    return doc.get('images',[]) or doc.get('cover',[])

def project(doc):
    kind=doc['type']
    bio=doc.get('bio') or {}
    held=bool(AMBIGUOUS.search(bio.get('text','')))
    links=[{'kind':text(l.get('kind'),40),'url':safe_url(l.get('url'))} for l in doc.get('links',[])
           if l.get('status')=='verified' and safe_url(l.get('url'))] if not held else []
    spotify=doc.get('spotify') or {}
    if not held and safe_url(spotify.get('url')):
        links.insert(0,{'kind':'spotify','url':spotify['url']})
    image=next((im for im in images(doc) if SHA.fullmatch(str(im.get('sha1','')))),None) if not held else None
    playlists=[{'code':text(p.get('code'),30),'station':text(p.get('station') or p.get('title'),100),
                'plexId':plex_id(p.get('plex_rating_key'))} for p in doc.get('playlists',[])]
    connections=[]
    def link(identifier, relation):
        if valid_id(identifier) and identifier!=doc['id']:
            connections.append({'id':identifier,'relation':text(relation,80)})
    for credit in doc.get('credits',[]):
        link(credit.get('artist_id'),credit.get('role','artist'))
    link((doc.get('release') or {}).get('id'),'release')
    link((doc.get('label') or {}).get('id'),'label')
    for field,relation in [('label_ids','label'),('artist_ids','artist'),('release_ids','release')]:
        for identifier in doc.get(field,[]):link(identifier,relation)
    for rel in doc.get('related_artists',[])[:16]:
        basis=[b.get('type','related') for b in rel.get('basis',[])]
        link(rel.get('artist_id'),'/'.join(basis[:2]) or 'related')
    for rel in doc.get('similar_artists',[])[:8]:
        link(rel.get('artist_id'),'similar')
    tracks=[v for v in doc.get('track_ids',[]) if valid_id(v)]
    for identifier in tracks:link(identifier,'track')
    # A profile shows a bounded neighborhood; other records remain searchable.
    seen=set()
    connections=[c for c in connections if not (c['id'] in seen or seen.add(c['id']))][:80]
    release=doc.get('release') or {}
    return {'id':doc['id'],'type':kind,'title':text(doc.get('name') or doc.get('title')),
            'artist':text(doc.get('credited_artist_string') or doc.get('album_artist')),
            'album':text(release.get('title')),'plexId':plex_id((doc.get('plex') or {}).get('rating_key')),
            'image':('/api/discovery/media/'+image['sha1']) if image else None,
            'bio':text(bio.get('text'),12000) if not held else None,
            'bioSource':text(bio.get('source'),80) if not held else None,
            'bioUrl':safe_url(bio.get('source_url')) if not held else None,
            'reviewRequired':held,'links':links[:24], 'country':text(doc.get('country'),80),
            'tags':[text(v,60) for v in (doc.get('tags') or doc.get('styles') or [])[:8] if isinstance(v,str)],
            'releaseDate':text(doc.get('release_date') or release.get('release_date'),30),
            'durationMs':doc.get('duration_ms') if isinstance(doc.get('duration_ms'),int) else None,
            'selected':bool(playlists),'favorite':any(p['plexId']=='147167' for p in playlists),
            'playlists':playlists,'trackCount':len(tracks),'connections':connections,
            'hunt':{'number':doc['hunt'].get('number') if type(doc['hunt'].get('number')) is int else None,'date':text(doc['hunt'].get('date'),40),'published':doc['hunt'].get('published') is True} if isinstance(doc.get('hunt'),dict) else None}

def put(db, doc):
    if not isinstance(doc,dict) or not valid_id(doc.get('id')) or doc.get('type') not in KINDS.values():
        raise ValueError('Invalid catalogue entity')
    if doc.get('deleted'):
        db.execute('DELETE FROM raw WHERE id=?',(doc['id'],))
    else:
        db.execute('INSERT OR REPLACE INTO raw VALUES (?,?)',(doc['id'],json.dumps(doc)))

def publish(db):
    docs={identifier:json.loads(doc) for identifier,doc in db.execute('SELECT id,doc FROM raw')}
    db.executescript('DELETE FROM entities; DELETE FROM media;')
    for doc in docs.values():
        release=docs.get((doc.get('release') or {}).get('id'))
        if release:
            doc['release']={k:release.get(k) for k in ('id','title','release_date')}
            if not doc.get('label'):doc['label']=release.get('label')
            doc['cover']=release.get('cover',[])
        try:
            result=project(doc)
            result['connections']=[r for r in result['connections'] if r['id'] in docs]
            # Go rejects NaN/Infinity, so the published projection must be strict JSON.
            projected=json.dumps(result,allow_nan=False)
        except Exception as error:
            raise ValueError(f'Entity {doc.get("id")} cannot be projected: {error!r}') from error
        db.execute('INSERT INTO entities VALUES (?,?,?,?,?)',
                   (result['id'],result['type'],result['plexId'],result['title']+' '+result['artist'],projected))
        for im in images(doc):
            sha=im.get('sha1',''); download=im.get('download','')
            if (SHA.fullmatch(str(sha)) and isinstance(download,str)
                    and download.startswith('/api/plugins/pavoia-catalogue/v1/media?f=')
                    and len(download)<1024 and not any(ord(c)<32 for c in download)):
                db.execute('INSERT OR IGNORE INTO media VALUES (?,?)',(sha,download))
    db.execute('INSERT OR REPLACE INTO info VALUES (?,?)',('publishedAt',datetime.now(timezone.utc).isoformat()))
    db.execute('INSERT OR REPLACE INTO info VALUES (?,?)',('projector',PROJECTOR))

def counts(db):
    try:return dict(db.execute('SELECT kind,count(*) FROM entities GROUP BY kind').fetchall())
    except sqlite3.Error:return {}

def shrunk(before, after):
    # Playlists are few and fixed; any loss is suspicious. Other kinds tolerate normal curation.
    for kind,old in sorted(before.items()):
        new=after.get(kind,0)
        if new<old and (kind=='playlist' or old-new>max(50,old*0.1)):
            return f'{kind} count {old} -> {new}'

def stop(*_):
    raise KeyboardInterrupt('terminated')

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args):
        return None

def fetch(opener, key, path, limit):
    request=urllib.request.Request(API+path,headers={'Authorization':'Bearer '+key,'User-Agent':'pavoia-radio-catalogue-sync/1'})
    with opener.open(request,timeout=30) as response:blob=response.read(limit+1)
    if len(blob)>limit:raise ValueError('Hermes response too large')
    return json.loads(blob)

def refresh(state, snapshot, key_file, allow_shrink, budget, started, outcome):
    target,temporary=state/'catalogue.sqlite',None
    try:
        # A termination inside mkstemp itself can still leave a file; the next run's sweep removes it.
        fd,name=tempfile.mkstemp(prefix='.catalogue-',suffix='.sqlite',dir=state)
        temporary=Path(name)
        os.close(fd)
        with closing(sqlite3.connect(temporary)) as db:
            before,projector={},None
            if target.exists():
                with closing(sqlite3.connect(target.as_uri()+'?mode=ro',uri=True)) as source:
                    if not snapshot:source.backup(db)
                    before=counts(source)
                    try:projector=(source.execute("SELECT value FROM info WHERE key='projector'").fetchone() or [None])[0]
                    except sqlite3.Error:pass
            outcome['counts']=before
            db.executescript('''CREATE TABLE IF NOT EXISTS raw(id TEXT PRIMARY KEY,doc TEXT NOT NULL);
              CREATE TABLE IF NOT EXISTS entities(id TEXT PRIMARY KEY,kind TEXT NOT NULL,plex_id TEXT,name TEXT,doc TEXT NOT NULL);
              CREATE INDEX IF NOT EXISTS entity_plex ON entities(plex_id,kind);
              CREATE TABLE IF NOT EXISTS media(sha TEXT PRIMARY KEY,path TEXT NOT NULL);
              CREATE TABLE IF NOT EXISTS info(key TEXT PRIMARY KEY,value TEXT NOT NULL);''')
            if snapshot:
                manifest=json.loads((snapshot/'manifest.json').read_text())
                since=manifest['latest_seq']
                if type(since) is not int or since<0:raise ValueError('Invalid snapshot cursor')
                required={kind+'.json' for kind in KINDS}|{'deleted.json'}
                if not required.issubset(manifest['files']):raise ValueError('Snapshot checksum entry missing')
                verified={}
                for filename,spec in manifest['files'].items():
                    if Path(filename).name!=filename:raise ValueError('Invalid snapshot filename')
                    blob=(snapshot/filename).read_bytes()
                    if len(blob)!=spec['bytes'] or hashlib.sha256(blob).hexdigest()!=spec['sha256']:
                        raise ValueError('Snapshot checksum mismatch')
                    if filename in required:verified[filename]=blob
                seen=set()
                for kind in KINDS:
                    rows=json.loads(verified[kind+'.json'])
                    if len(rows)!=manifest['counts'][KINDS[kind]]:raise ValueError('Snapshot count mismatch')
                    for doc in rows:
                        if doc.get('id') in seen:raise ValueError('Duplicate snapshot entity')
                        if doc.get('type')!=KINDS[kind]:raise ValueError('Snapshot entity type mismatch')
                        put(db,doc);seen.add(doc['id'])
                for doc in json.loads(verified['deleted.json']):put(db,doc)
                stored=dict(db.execute("SELECT json_extract(doc,'$.type'),count(*) FROM raw GROUP BY 1"))
                if any(stored.get(kind,0)!=manifest['counts'][kind] for kind in KINDS.values()):raise ValueError('Stored snapshot count mismatch')
            else:
                row=db.execute("SELECT value FROM info WHERE key='cursor'").fetchone()
                if not row:raise ValueError('Import a snapshot before syncing')
                since=int(row[0])
            start=since
            if not snapshot:outcome['cursor']=since
            if key_file:
                key=key_file.read_text().strip()
                if not re.fullmatch(r'[!-~]{8,512}',key):raise ValueError('API key file must hold one printable token')
                opener=urllib.request.build_opener(NoRedirect())
                for _ in range(100):
                    # ponytail: one bounded batch per run; the next hourly run continues from the saved cursor.
                    if time.monotonic()-started>budget:break
                    page=fetch(opener,key,f'/changes?since={since}&limit=500',32*1024*1024); nxt=page['next_since']
                    if type(nxt) is not int or nxt<since:raise ValueError('Invalid change cursor')
                    seq=since
                    for change in page['changes']:
                        try:
                            if type(change['seq']) is not int or not seq<change['seq']<=nxt:raise ValueError('Unordered changes')
                            seq=change['seq']
                            if not valid_id(change.get('id')):raise ValueError('Invalid change ID')
                            if change['op']=='delete':db.execute('DELETE FROM raw WHERE id=?',(change['id'],))
                            elif change['op']=='upsert' and change['doc'].get('id')==change['id']:put(db,change['doc'])
                            else:raise ValueError('Invalid change operation')
                        except Exception as error:
                            raise ValueError(f'Change {change.get("seq")} {change.get("id")} rejected: {error!r}') from error
                    outcome['changesApplied']=outcome.get('changesApplied',0)+len(page['changes'])
                    if page['has_more'] and nxt==since:raise ValueError('Non-advancing change cursor')
                    since=nxt
                    if not page['has_more']:
                        outcome['drained']=True
                        break
                outcome['behind']=not outcome.get('drained')
                try:
                    info=fetch(opener,key,'/info',1024*1024)
                    outcome['upstream']={'builtAt':text(info.get('built_at'),40),'latestSeq':info.get('latest_seq')}
                    latest=info.get('latest_seq')
                    if type(latest) is int and since>latest:raise ValueError('Cursor ahead of Hermes; rebuild from a new export')
                    upstream_counts=info.get('counts')
                except (OSError,ValueError,AttributeError,http.client.HTTPException) as error:
                    if 'Cursor ahead' in str(error):raise
                    outcome['upstream']={'error':text(f'{type(error).__name__}: {error}',200)}
                    upstream_counts=latest=None
            def check_drift(local):
                # Same cursor as Hermes: our entity counts should equal its counts; a mismatch hints at a missed gap.
                if key_file and outcome.get('drained') and type(latest) is int and latest==since and isinstance(upstream_counts,dict):
                    drift={k:[local.get(k,0),v] for k,v in upstream_counts.items() if local.get(k,0)!=v}
                    if drift:outcome.setdefault('warnings',[]).append(text('Count drift against Hermes (local, upstream): '+json.dumps(drift,sort_keys=True),300))
            if key_file and not snapshot and since==start and projector==PROJECTOR:
                check_drift(before)
                print('Catalogue unchanged at cursor',since)
                return
            publish(db)
            after=counts(db)
            problem=shrunk(before,after)
            if problem and not allow_shrink:raise ValueError('Shrink guard refused publication: '+problem)
            check_drift(after)
            db.execute('INSERT OR REPLACE INTO info VALUES (?,?)',('cursor',str(since)))
            db.commit()
            if db.execute('PRAGMA quick_check').fetchone()[0]!='ok':raise ValueError('Catalogue integrity check failed')
        with temporary.open('rb') as f:os.fsync(f.fileno())
        # From here a termination waits until the swap and status are complete.
        signal.pthread_sigmask(signal.SIG_BLOCK,{signal.SIGTERM,signal.SIGINT})
        # A hold placed during this run protects an operator restore that may already be in place.
        if (state/'sync.hold').exists():
            outcome['result']='held'
            print('Catalogue sync held during the run; nothing published')
            return
        if target.exists():
            try:
                os.link(target,state/'.catalogue-previous.sqlite')
                os.replace(state/'.catalogue-previous.sqlite',state/'catalogue.previous.sqlite')
            except OSError as error:
                outcome.setdefault('warnings',[]).append(text(f'Rollback copy not kept: {error}',200))
        os.replace(temporary,target)
        outcome.update(published=True,cursor=since,counts=after)
        directory=os.open(state,os.O_RDONLY)
        try:os.fsync(directory)
        finally:os.close(directory)
        print('Catalogue published at cursor',since)
    finally:
        if temporary:temporary.unlink(missing_ok=True)

def record(state, previous, started, outcome, error=None):
    now=datetime.now(timezone.utc).isoformat(timespec='seconds')
    status={k:previous[k] for k in ('checkedAt','publishedAt','cursor','counts','behind') if k in previous}
    status.update({k:v for k,v in outcome.items() if k!='drained'})
    status.update(attemptAt=now,durationS=round(time.monotonic()-started,1),result='failed' if error else outcome.get('result','ok'))
    status.setdefault('published',False);status.setdefault('behind',False)
    if not error and outcome.get('drained'):status['checkedAt']=now
    if outcome.get('published'):status['publishedAt']=now
    failures=previous.get('consecutiveFailures',0)
    status['consecutiveFailures']=failures+1 if error else (failures if status['result']=='held' else 0)
    if error:status['error']=text(f'{type(error).__name__}: {error}',300)
    for warning in status.get('warnings',[]):print('Warning:',warning)
    temporary=state/'.catalogue-status.json'
    with os.fdopen(os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600),'w') as f:
        f.write(json.dumps(status,indent=1,sort_keys=True)+'\n')
    os.replace(temporary,state/'sync-status.json')

def sync(state, snapshot=None, key_file=None, allow_shrink=False, budget=600):
    state.mkdir(parents=True,exist_ok=True,mode=0o700)
    with (state/'sync.lock').open('a') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            print('Another catalogue sync is running; nothing done')
            return
        started=time.monotonic()
        try:previous=json.loads((state/'sync-status.json').read_text())
        except (OSError,ValueError):previous={}
        if not isinstance(previous,dict):previous={}
        outcome={}
        try:
            # A hold leaves state/discovery untouched, including an operator's restore in progress.
            if (state/'sync.hold').exists():
                outcome['result']='held'
                print('Catalogue sync held by sync.hold; nothing done')
            else:
                # Leftovers of an interrupted run; the lock guarantees no other run owns them.
                for leftover in state.glob('.catalogue-*'):leftover.unlink(missing_ok=True)
                refresh(state,snapshot,key_file,allow_shrink,budget,started,outcome)
        except BaseException as error:
            record(state,previous,started,outcome,error)
            raise
        else:
            record(state,previous,started,outcome)
        finally:
            try:signal.pthread_sigmask(signal.SIG_UNBLOCK,{signal.SIGTERM,signal.SIGINT})
            except KeyboardInterrupt:
                # The termination waited for the swap; the status already records the published cache.
                if not outcome.get('published'):raise

if __name__=='__main__':
    # timeout(1) sends SIGTERM; raising lets cleanup and the failure status run.
    signal.signal(signal.SIGTERM,stop)
    try:
        # If the shared host runs short of memory, the kernel should kill this job before any radio process.
        with open('/proc/self/oom_score_adj','w') as f:f.write('1000')
    except OSError:pass
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--state',type=Path,required=True)
    parser.add_argument('--snapshot',type=Path)
    parser.add_argument('--key-file',type=Path)
    parser.add_argument('--allow-shrink',action='store_true',help='publish even if an entity kind shrinks sharply (manual recovery only)')
    parser.add_argument('--budget',type=int,default=600,help='seconds of change fetching before publishing partial progress')
    args=parser.parse_args()
    try:sync(args.state.resolve(),args.snapshot,args.key_file,args.allow_shrink,args.budget)
    except BaseException as error:
        raise SystemExit('Catalogue sync stopped ('+text(f'{type(error).__name__}: {error}',300)+'). See sync-status.json; the live cache changes only when it shows published.') from None
