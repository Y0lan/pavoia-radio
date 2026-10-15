#!/usr/bin/env python3
"""Preview server: serves this folder and forwards the production radio routes.

The live radio sends no CORS headers, so the preview mirrors production's same-origin
paths (/api/radio/<id>, /stream/<id>.mp3) by relaying them to the live server.
Usage: python3 serve.py [port]   (default 14521)
"""
import http.server
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
ROUTES.update(('/api/library/catalogue', '/api/library/statistics', '/api/audience'))
ROUTES.update(f'/stream/{stage}.mp3' for stage in STAGES)


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


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 14521
    http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
