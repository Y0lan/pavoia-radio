#!/usr/bin/env python3
"""Preview server: serves this folder and forwards the production radio routes.

The live radio sends no CORS headers, so the preview mirrors production's same-origin
paths (/api/radio/<id>, /stream/<id>.mp3) by relaying them to the live server.
With PAVOIA_NAMES set to a folder, /api/library/names?kind=… answers from its names-<kind>.json instead.
Usage: python3 serve.py [port]   (default 14521)
"""
import http.server
import os
import sys
import re
import urllib.parse
import urllib.error
import urllib.request
from pathlib import Path

UPSTREAM = 'https://pavoia.gaende.box.ca'
PROJECT = Path(__file__).resolve().parents[2]
ROOT = PROJECT / 'web'
sys.path.insert(0, str(PROJECT / 'ops'))
from manage import SCENES
STAGES = tuple(scene['id'] for scene in SCENES)
ROUTES = {f'/api/radio/{stage}{suffix}' for stage in STAGES for suffix in ('', '/stats', '/catalogue', '/changes', '/history', '/music')}
ROUTES.update(('/api/library/catalogue', '/api/library/statistics', '/api/library/names', '/api/audience'))
ROUTES.update(f'/stream/{stage}.mp3' for stage in STAGES)
NAMES = os.environ.get('PAVOIA_NAMES')


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path.startswith('/api/discovery/'):
            request=urllib.request.Request('http://127.0.0.1:14522'+self.path, headers={'Range':self.headers['Range']} if self.headers.get('Range') else {})
            try:
                with urllib.request.urlopen(request,timeout=15) as response:
                    self.send_response(response.status)
                    for key in ('Content-Type','Cache-Control','Content-Length','Content-Range','Accept-Ranges'):
                        if response.headers.get(key):self.send_header(key,response.headers[key])
                    self.end_headers()
                    self.wfile.write(response.read(8*1024*1024))
            except urllib.error.HTTPError as error:self.send_error(error.code)
            except (BrokenPipeError,ConnectionResetError):pass
            except OSError:self.send_error(503)
            return
        if not self.path.startswith(('/api/radio/', '/api/library/', '/api/audience', '/stream/')):
            return super().do_GET()
        path = urllib.parse.urlsplit(self.path).path
        if path == '/api/library/names' and NAMES:
            return self.names()
        artwork = re.fullmatch(r'/api/radio/(?:' + '|'.join(STAGES) + r')/artwork/[0-9]{1,32}/(?:cover|portrait)', path)
        artwork = artwork or re.fullmatch(r'/api/library/artwork/[0-9]{1,32}/(?:cover|portrait)', path)
        if path not in ROUTES and not artwork:
            return self.send_error(404)
        request = urllib.request.Request(UPSTREAM + self.path, headers={'User-Agent': 'pavoia-preview'})
        started = False
        try:
            with urllib.request.urlopen(request, timeout=15) as upstream:
                self.send_response(upstream.status)
                for name in ('Content-Type', 'Cache-Control'):
                    if upstream.headers.get(name):
                        self.send_header(name, upstream.headers[name])
                self.end_headers()
                started = True
                # The stream never ends: copy in small chunks until the browser hangs up.
                while chunk := upstream.read1(16 * 1024):
                    self.wfile.write(chunk)
                    self.wfile.flush()
        except urllib.error.HTTPError as error:
            self.send_error(error.code)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except OSError:
            if not started:
                self.send_error(502, 'Live radio unreachable')

    # A stand-in names document, as the Go handler answers: 400 for another kind, 503 when it is missing, and image
    # addresses on this origin, so the page accepts them.
    def names(self):
        kind = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query).get('kind', [''])[0]
        if kind not in ('artists', 'labels'):
            return self.send_error(400, 'invalid names kind')
        try:
            text = (Path(NAMES) / f'names-{kind}.json').read_text(encoding='utf-8')
        except OSError:
            return self.send_error(503, 'names unavailable')
        body = re.sub(r'https://[^"/]+(/api/discovery/media/)', r'\1', text).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 14521
    http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
