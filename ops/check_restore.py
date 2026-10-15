#!/usr/bin/env python3
"""Restore each station's latest daily backup into temporary state and start a local controller.

No production state, containers, playlists or music files are modified.
Run from the Whatbox checkout: python3 ops/check_restore.py
"""
from contextlib import closing
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import secrets
import socket
import sqlite3
import subprocess
import tempfile
import time
import urllib.request

from manage import ROOT, SCENES


def check(scene):
    backups = sorted((ROOT / scene['state'] / 'backups').glob('????-??-??.sqlite'))
    if not backups:
        raise RuntimeError('No daily backup for ' + scene['id'])
    source_path = backups[-1]
    with tempfile.TemporaryDirectory(prefix='pavoia-restore-') as directory:
        state = Path(directory)
        restored = state / 'radio.sqlite'
        with closing(sqlite3.connect(source_path.as_uri() + '?mode=ro', uri=True)) as source, closing(sqlite3.connect(restored)) as target:
            if source.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise RuntimeError('Backup integrity failed: ' + scene['id'])
            counts = {table: source.execute('SELECT COUNT(*) FROM ' + table).fetchone()[0]
                      for table in ('tracks', 'playback', 'daily')}
            source.backup(target)
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            port = listener.getsockname()[1]
        env = dict(os.environ, PAVOIA_STAGE=scene['id'], PAVOIA_STATE_DIR=str(state),
                   PAVOIA_LISTEN=f'127.0.0.1:{port}',
                   PAVOIA_MUSIC_ROOT=str(Path.home() / 'files/plex_music_library/opus'),
                   PAVOIA_PLEX_URL='http://127.0.0.1:1', PAVOIA_ICECAST_URL='http://127.0.0.1:1',
                   PAVOIA_PLEX_TOKEN=secrets.token_hex(16), PAVOIA_INTERNAL_TOKEN=secrets.token_hex(16))
        with (state / 'controller.log').open('w') as log:
            process = subprocess.Popen([str(ROOT / 'bin/pavoia')], env=env,
                                       stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL)
            try:
                for _ in range(50):
                    if process.poll() is not None:
                        raise RuntimeError('Restored controller exited: ' + scene['id'])
                    try:
                        with urllib.request.urlopen(f'http://127.0.0.1:{port}/healthz', timeout=1):
                            break
                    except OSError:
                        time.sleep(.1)
                else:
                    raise RuntimeError('Restored controller did not become healthy: ' + scene['id'])
                with urllib.request.urlopen(f'http://127.0.0.1:{port}/api/radio/{scene["id"]}/catalogue?limit=1', timeout=3) as response:
                    catalogue = json.load(response)
                if bool(catalogue['tracks']) != bool(counts['tracks']):
                    raise RuntimeError('Restored catalogue differs: ' + scene['id'])
                if not (state / 'fallback.m3u').is_file():
                    raise RuntimeError('Fallback was not rebuilt: ' + scene['id'])
                with closing(sqlite3.connect(restored.as_uri() + '?mode=ro', uri=True)) as db:
                    actual = {table: db.execute('SELECT COUNT(*) FROM ' + table).fetchone()[0] for table in counts}
                if actual != counts:
                    raise RuntimeError('Restored counts differ: ' + scene['id'])
            finally:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
    return {'stage': scene['id'], 'backup': source_path.name, 'counts': counts,
            'controllerHealthy': True, 'catalogueReadable': True, 'fallbackRebuilt': True}


def main():
    os.umask(0o077)
    report = {'checkedAt': datetime.now(timezone.utc).isoformat(), 'stations': []}
    output = ROOT / 'artifacts' / ('restore-check-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '.json')
    try:
        for scene in SCENES:
            result = check(scene)
            report['stations'].append(result)
            print(json.dumps(result), flush=True)
        report['passed'] = True
    finally:
        output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'artifact': str(output), 'passed': report['passed']}))


if __name__ == '__main__':
    main()
