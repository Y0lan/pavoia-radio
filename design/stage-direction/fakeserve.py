#!/usr/bin/env python3
"""Preview server for the checks that play: serve.py, but /stream/** is a local tone and is never relayed.

serve.py forwards /stream/<id>.mp3 to the live radio, so a check that plays there opens a real audio
connection and counts in the audience. Here every stream is tone.mp3 in a loop, sent at its bit rate, so a
check can play, pause and reconnect, and the radio never hears of it.

A check that plays first asks GET /__mode?set=ok and stops unless the answer is "ok": serve.py and the public
sites answer 404 there. The mode also steers the fake stream, for the reconnect checks:
  ok      the tone plays
  stall   the connection stays open and sends nothing
  close   open streams end, and new ones answer 503
  refuse  new streams answer 503

Usage: python3 fakeserve.py [port]   (default 14521; PAVOIA_NAMES as in serve.py)
"""
import http.server
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import serve

AUDIO = (Path(__file__).resolve().parent / 'tone.mp3').read_bytes()
RATE = 8000  # bytes a second: tone.mp3 is 64 kbit/s
MODES = ('ok', 'stall', 'close', 'refuse')
state = {'mode': 'ok'}


class Handler(serve.Handler):
    def do_GET(self):
        if self.path.startswith('/__mode?set='):
            asked = self.path.split('=', 1)[1]
            if asked in MODES:
                state['mode'] = asked
            body = state['mode'].encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if not self.path.startswith('/stream/'):
            return super().do_GET()
        if state['mode'] in ('refuse', 'close'):
            return self.send_error(503, 'fake stream down')
        if state['mode'] == 'stall':
            while state['mode'] == 'stall':
                time.sleep(0.2)
            return
        self.send_response(200)
        self.send_header('Content-Type', 'audio/mpeg')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        position, sent, start = 0, 0, time.time()
        try:
            while state['mode'] != 'close':
                if state['mode'] == 'stall':
                    time.sleep(0.2)
                    continue
                # Two seconds ahead of real time, as a live stream's buffer is.
                if sent < RATE * 2 + (time.time() - start) * RATE:
                    chunk = (AUDIO + AUDIO)[position:position + 2000]
                    position = (position + 2000) % len(AUDIO)
                    self.wfile.write(chunk)
                    self.wfile.flush()
                    sent += 2000
                else:
                    time.sleep(0.05)
        except (BrokenPipeError, ConnectionResetError):
            pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 14521
    print(f'Fake preview at http://127.0.0.1:{port}/ (streams are a local tone)')
    http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
