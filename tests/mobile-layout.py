"""Review the mobile layout against the running radio; --candidate overlays local assets."""
import argparse,json,time
from pathlib import Path
from playwright.sync_api import sync_playwright

parser=argparse.ArgumentParser()
parser.add_argument('--candidate',action='store_true')
parser.add_argument('--screenshots-only',action='store_true')
args=parser.parse_args()
order=['01','02','03','04','06','07','08','09','05']
root=Path(__file__).resolve().parents[1]
output=root/'output/playwright/stage-controls';output.mkdir(parents=True,exist_ok=True)
label='candidate' if args.candidate else 'public'
errors=[];console_errors=[];failed=[];shots=[]
with sync_playwright() as p:
 browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium')
 context=browser.new_context(viewport={'width':390,'height':844},has_touch=True,device_scale_factor=1,locale='en')
 page=context.new_page()
 def wait_for(expression,arg=None):
  # Poll through the protocol because this Playwright driver uses eval under CSP.
  deadline=time.monotonic()+30
  while time.monotonic()<deadline:
   if page.evaluate(expression,arg):return
   page.wait_for_timeout(50)
  raise AssertionError('Timed out: '+expression)
 page.on('pageerror',lambda error:errors.append(str(error)))
 page.on('console',lambda message:console_errors.append({'message':message.text,'location':message.location}) if message.type=='error' else None)
 page.on('requestfailed',lambda request:failed.append({'url':request.url,'reason':request.failure}))
 if args.candidate:
  for name in ('index.html','app.js','style.css','journey.js'):
   url='https://pavoia.gaende.box.ca/'+('' if name=='index.html' else name)
   body=(root/'web'/name).read_text()
   mime='text/html' if name.endswith('html') else 'text/css' if name.endswith('css') else 'image/svg+xml' if name.endswith('svg') else 'text/javascript'
   page.route(url,lambda route,*,body=body,mime=mime:route.fulfill(response=route.fetch(),body=body,content_type=mime)) if not name.endswith('svg') else page.route(url,lambda route,*,body=body,mime=mime:route.fulfill(body=body,content_type=mime))
 page.goto('https://pavoia.gaende.box.ca/',wait_until='domcontentloaded')
 page.evaluate('document.fonts.ready')
 wait_for('window.Pavoia?.stations.length===9')
 page.locator('#language').select_option('en')
 def loaded():
  wait_for("!document.body.hasAttribute('data-photo-loading') && document.getElementById('photo').naturalWidth>0")
 def shot(name,full=False):
  path=output/f'{label}-{name}.png';page.screenshot(path=str(path),full_page=full,animations='disabled');shots.append(str(path.relative_to(root)))
 def select(identifier):
  page.locator('#open-stations').click()
  page.locator(f'#moods input[value="{identifier}"]').click()
  wait_for("getComputedStyle(document.getElementById('stations-sheet')).display==='none'")
  loaded()
  wait_for('window.Pavoia.getState().dataFresh')
  if not page.evaluate('window.Pavoia.getState().wanted'):
   page.wait_for_timeout(600)
 def no_overflow():
  assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Page overflow'
 loaded()
 assert page.locator('#station-story').count()==0
 assert page.locator('.broadcast-mark').is_visible()
 assert page.locator('#go-deeper').inner_text()=="See the roots it's built on"
 assert page.locator('.top #go-deeper').count()==0
 assert page.locator('.roots-footer #go-deeper').count()==1
 assert page.locator('.swipe-hint').is_visible()
 assert page.locator('#open-stations').inner_text()=='Change stage'
 assert page.locator('#station-selector').evaluate("n=>n.closest('dialog')?.id==='stations-sheet'")
 assert page.locator('#language').evaluate("n=>getComputedStyle(n).appearance==='none'&&getComputedStyle(n).borderTopWidth==='0px'")
 for identifier in range(1,10):
  select(f'{identifier:02}')
  no_overflow()
  assert page.locator('#station-position').inner_text()==f'{order.index(f"{identifier:02}")+1} / 9'
  assert page.locator('#mood-place').is_visible()
  assert page.locator('#poster .record-sleeve, #poster .painted-artist').count()==0
  assert not page.locator('.scene-artwork').is_visible()
  assert page.locator('#station-controls').evaluate("n=>n.getBoundingClientRect().bottom<=document.querySelector('.player').getBoundingClientRect().top+1"),'Controls under player'
  shot(f'station-{identifier:02}-390')
 select('04')
 wait_for("document.getElementById('hero-cover').naturalWidth>0")
 assert 'Longing, tenderness, melancholy' in page.locator('#mood-place').inner_text()
 shot('description-390',True)
 for width,height in [(320,700),(390,844),(430,932),(760,900)]:
  page.set_viewport_size({'width':width,'height':height})
  no_overflow()
  if width in (320,430):
   for identifier in range(1,10):
    select(f'{identifier:02}');no_overflow();shot(f'station-{identifier:02}-{width}')
  page.locator('#open-stations').click()
  assert page.locator('#moods .mood').count()==9
  assert page.locator('#bus-link').evaluate('n=>n===n.parentElement.lastElementChild&&n.previousElementSibling.classList.contains("mood-essentials")')
  assert page.locator('.essentials-icon').is_visible()
  assert page.locator('.mood-essentials').bounding_box()['height']>=64
  assert page.locator('#stations-sheet').evaluate('n=>n.scrollWidth<=n.clientWidth')
  assert all(row['height']>=60 for row in page.locator('#moods .mood, #moods .bus-link').evaluate_all('nodes=>nodes.map(n=>({height:n.getBoundingClientRect().height}))'))
  shot(f'sheet-{width}')
  page.keyboard.press('Escape')
  assert page.locator('#open-stations').evaluate('n=>document.activeElement===n')
  page.locator('#language').select_option('de')
  for identifier in ('02','04','08','09'):
   select(identifier);no_overflow()
   assert page.locator('#station-position').inner_text()==f'{order.index(identifier)+1} / 9'
  shot(f'german-{width}')
  page.locator('#language').select_option('en')
 for width in (1024,1440):
  page.set_viewport_size({'width':width,'height':1000})
  wait_for("document.getElementById('station-selector').parentElement.id==='station-selector-home'")
  assert page.locator('#mood-place').is_visible()
  assert not page.locator('#open-stations').is_visible()
  page.locator('#moods input[value="04"]').check();loaded();wait_for('window.Pavoia.getState().dataFresh');page.wait_for_timeout(600);no_overflow()
  shot(f'desktop-{width}')
 page.set_viewport_size({'width':390,'height':844})
 if not args.screenshots_only:
  cdp=context.new_cdp_session(page)
  def swipe_photo(dx,dy=0):
   page.evaluate('scrollTo(0,0)')
   x,y=(280 if dx<0 else 90),220
   cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
   for step in range(1,7):
    cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+dx*step/6,'y':y+dy*step/6}]})
   cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
  def stage_is(identifier):
   wait_for('(id)=>window.Pavoia.getState().stage===id',arg=identifier)
  select('05');swipe_photo(-160);stage_is('bermuda-day')
  assert page.locator('#station-position').inner_text()=='1 / 9'
  assert page.locator('#audio').evaluate('a=>a.paused&&!a.getAttribute("src")')
  swipe_photo(160);stage_is('essentials')
  swipe_photo(-25,120);stage_is('essentials')
  page.evaluate('scrollTo(0,0)')
  # A second finger cancels station navigation so pinch gestures stay available.
  cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':280,'y':220,'id':0}]})
  cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':280,'y':220,'id':0},{'x':220,'y':220,'id':1}]})
  cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':120,'y':220,'id':0},{'x':60,'y':220,'id':1}]})
  cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
  stage_is('essentials')
  select('04');page.locator('#audio').evaluate('a=>{a.volume=0;}')
  page.locator('#play').click()
  wait_for('window.Pavoia.getState().playbackState==="playing"&&document.getElementById("audio").currentTime>0')
  source=page.locator('#audio').get_attribute('src')
  page.locator('#open-stations').click();page.keyboard.press('Escape')
  assert page.locator('#audio').evaluate('a=>!a.paused')
  assert page.locator('#audio').get_attribute('src')==source
  select('04')
  assert page.locator('#audio').get_attribute('src')==source
  previous_photo=page.locator('#photo').get_attribute('src')
  page.locator('#change-photo').click();loaded()
  assert page.locator('#photo').get_attribute('src')!=previous_photo
  assert page.locator('#audio').get_attribute('src')==source
  page.locator('#language').select_option('de')
  assert page.locator('#change-photo').get_attribute('aria-label')=='Foto wechseln'
  assert page.locator('#audio').evaluate('a=>!a.paused')
  page.locator('#language').select_option('en')
  swipe_photo(-160);stage_is('etage-zero')
  wait_for('window.Pavoia.getState().playbackState==="playing"')
  assert page.locator('#audio').get_attribute('src')=='/stream/etage-zero.mp3'
  swipe_photo(160);stage_is('palac-feel')
  wait_for('window.Pavoia.getState().playbackState==="playing"')
  source=page.locator('#audio').get_attribute('src')
  page.locator('#open-stations').click();page.locator('#bus-link').focus();page.keyboard.press('Enter')
  wait_for('document.body.hasAttribute("data-bus")')
  wait_for('getComputedStyle(document.getElementById("stations-sheet")).display==="none"')
  loaded();shot('bus-390')
  assert not page.locator('#station-position').is_visible()
  assert page.locator('#mood-place').inner_text()=='Somewhere in the forest'
  assert not page.locator('.swipe-hint').is_visible()
  assert page.locator('#audio').get_attribute('src')==source and page.locator('#audio').evaluate('a=>!a.paused')
  select('04');assert not page.url.endswith('#bus')
  page.locator('#open-stations').click()
  page.set_viewport_size({'width':1440,'height':1000})
  wait_for('getComputedStyle(document.getElementById("stations-sheet")).display==="none"')
  assert page.locator('#moods input:checked').evaluate('n=>document.activeElement===n')
  assert page.locator('#mood-place').is_visible()
  page.set_viewport_size({'width':390,'height':844})
  page.emulate_media(reduced_motion='reduce')
  page.locator('#open-stations').click()
  assert page.locator('#stations-sheet').evaluate('n=>getComputedStyle(n).transitionDuration==="0s"')
  page.keyboard.press('Escape')
  page.emulate_media(reduced_motion='no-preference')
  page.locator('#go-deeper').click();page.locator('.explorer-nav a[href="#history"]').click()
  page.wait_for_selector('.history-row')
  page.locator('.history-row').first.click()
  wait_for('!document.getElementById("explore-workspace").hidden')
  assert page.locator('#audio').get_attribute('src')==source and page.locator('#audio').evaluate('a=>!a.paused')
  page.locator('#explorer-close').click()
  page.locator('#play').click()
  page.goto('https://pavoia.gaende.box.ca/#bus',wait_until='domcontentloaded')
  loaded();assert page.locator('#audio').evaluate('a=>a.paused&&!a.getAttribute("src")')
  assert page.locator('#mood-place').inner_text()=='Somewhere in the forest'
  select('04')
  assert page.locator('#mood-place').is_visible()
  assert not [failure for failure in failed if failure['reason']!='net::ERR_ABORTED'],failed
 assert not errors,errors
 assert not console_errors,console_errors
 result={'mode':label,'stations':9,'screenshots':shots,'pageErrors':errors,'consoleErrors':console_errors,'failedRequests':failed}
 (root/'artifacts/stage-controls-20261015').mkdir(parents=True,exist_ok=True)
 (root/f'artifacts/stage-controls-20261015/{label}-review.json').write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps(result))
 browser.close()
