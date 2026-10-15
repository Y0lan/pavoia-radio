"""Check metadata freshness and history navigation with the frontend and mocked APIs."""
import mimetypes
import base64
from pathlib import Path
import time
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[1]/'web'
failed=False
errors=[]
artwork_attempts=0
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium')
    page=browser.new_page()
    page.on('pageerror',lambda error:errors.append(str(error)))
    def respond(route):
        global artwork_attempts
        path=urlsplit(route.request.url).path
        if path.startswith('/api/discovery/media/'):
            artwork_attempts+=1
            if artwork_attempts==1:route.fulfill(status=503,body='unavailable')
            else:route.fulfill(content_type='image/gif',body=base64.b64decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'))
        elif path.endswith('/history'):
            route.fulfill(json={'items':[{'id':'123','title':'History from '+path.split('/')[-2],
                'artist':'Artist','startedAt':'2026-10-15T00:00:00Z'}],'next':None})
        elif path.startswith('/api/discovery/'):
            route.fulfill(json={'entity':{'id':'trk_000000000123','type':'track','title':'Current record','image':'/api/discovery/media/'+'a'*40,
                'connections':[{'id':'art_000000000001','relation':'primary'}]},
                'included':[{'id':'art_000000000001','type':'artist','title':'Artist'}]})
        elif path.startswith('/api/radio/'):
            route.fulfill(status=503 if failed else 200,json={'stage':{'id':path.split('/')[-1]},
                'track':{'id':'123','title':'Current record','artist':'Artist'},'audience':{'available':False}})
        elif path.startswith('/api/audience'):
            route.fulfill(json={'available':False})
        elif path.startswith('/api/'):
            route.fulfill(status=503,body='unavailable')
        else:
            file=root/(path.lstrip('/') or 'index.html')
            if file.is_file():route.fulfill(body=file.read_bytes(),content_type=mimetypes.guess_type(file)[0] or 'application/octet-stream')
            else:route.fulfill(status=404)
    page.route('**/*',respond)
    page.clock.install()
    page.goto('https://radio.test/')
    def wait_for(expression):
        deadline=time.monotonic()+5
        while time.monotonic()<deadline:
            if page.evaluate(expression):return
            page.wait_for_timeout(20)
        raise AssertionError((expression,errors,page.evaluate('({state:window.Pavoia?.getState(), metadata:navigator.mediaSession.metadata})')))
    wait_for("window.Pavoia?.getState().dataFresh && navigator.mediaSession.metadata?.title==='Current record'")
    wait_for("document.getElementById('hero-cover').getAttribute('src')?.startsWith('/api/discovery/media/')")
    page.locator('#credited-artists button').focus()
    page.clock.fast_forward(1500)
    wait_for("document.getElementById('hero-cover').naturalWidth>0 && !document.getElementById('hero-cover').hidden")
    assert artwork_attempts>1,'Artwork did not retry after a temporary failure'
    assert page.evaluate("document.activeElement.classList.contains('artist-credit')"),'Artwork retry moved focus'
    failed=True
    page.clock.fast_forward(10000)
    wait_for('!window.Pavoia.getState().dataFresh')
    page.evaluate("dispatchEvent(new CustomEvent('pavoia:radio'))")
    assert page.evaluate('navigator.mediaSession.metadata===null'),'Stale metadata returned after radio event'
    failed=False
    page.clock.fast_forward(10000)
    wait_for("window.Pavoia.getState().dataFresh && navigator.mediaSession.metadata?.title==='Current record'")
    page.locator('#go-deeper').click()
    page.locator('.explorer-nav a[href="#history"]').click()
    page.locator('#music-stage').select_option('ambiance')
    wait_for("document.querySelector('.history-row')?.textContent.includes('History from ambiance')")
    page.locator('.history-row').click()
    wait_for("!document.getElementById('explore-workspace').hidden")
    page.go_back()
    wait_for("!document.getElementById('music-view').hidden && document.querySelector('.history-row')?.textContent.includes('History from ambiance')")
    assert page.locator('#music-stage').input_value()=='ambiance','History lost the selected stage'
    assert not errors,errors
    browser.close()
print('Media Session freshness and history navigation checks passed')
