// Playwright CLI run-code callback. Local player preview and discovery cache must be running.
async page => {
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/journey.js',route=>route.fallback()); // Disable browser cache for this local code review.
  await page.goto('http://127.0.0.1:14521');
  await page.locator('#language [value=en]').dispatchEvent('click');
  await page.waitForFunction(()=>!document.getElementById('go-deeper').disabled);
  await page.locator('#play').click();
  await page.waitForFunction(()=>document.getElementById('audio').currentTime>1);
  await page.locator('#go-deeper').click();
  await page.waitForFunction(()=>!document.getElementById('explore-workspace').hidden);
  await page.locator('.connection-row').first().click();
  await page.waitForFunction(()=>!document.getElementById('explore-workspace').hidden);
  assert(await page.locator('#audio').evaluate(a=>!a.paused),'Entity navigation stopped live playback');
  await page.locator('#discovery-query').fill('Jimi Jules');
  await page.locator('#discovery-query').press('Enter');
  await page.waitForFunction(()=>!document.getElementById('discovery-results').hidden);
  await page.locator('.search-result').filter({hasText:'Jimi Jules'}).first().click();
  await page.waitForFunction(()=>!document.getElementById('explore-workspace').hidden);
  assert(await page.locator('#audio').evaluate(a=>!a.paused),'Search stopped live playback');
  // Navigate to a real prepared candidate without reloading the audio element.
  await page.evaluate(()=>{history.pushState(null,'','#explore/trk_5162739e176d');dispatchEvent(new PopStateEvent('popstate'));});
  await page.locator('.preview-button').click();
  await page.waitForFunction(()=>document.getElementById('preview-audio').currentTime>1);
  assert(await page.locator('#audio').evaluate(a=>a.paused&&!a.getAttribute('src')),'Preview left live stream open');
  await page.locator('#preview-stop').click();
  await page.waitForFunction(()=>!document.getElementById('audio').paused&&document.getElementById('audio').currentTime>1);
  await page.locator('#play').click();
  await page.locator('.preview-button').click();
  await page.waitForFunction(()=>document.getElementById('preview-audio').currentTime>0.5);
  assert(await page.evaluate(()=>navigator.mediaSession.playbackState==='playing'),'Preview media state is not playing');
  const previewTitle=await page.evaluate(()=>navigator.mediaSession.metadata.title);
  const offline=route=>route.fulfill({status:503,body:'unavailable'});
  await page.route('**/api/radio/*',offline);
  await page.evaluate(()=>poll());
  assert(await page.evaluate(title=>navigator.mediaSession.metadata?.title===title,previewTitle),'Radio failure cleared preview metadata');
  await page.unroute('**/api/radio/*',offline);
  await page.evaluate(()=>poll());
  await page.locator('#preview-stop').click();
  assert(await page.locator('#audio').evaluate(a=>a.paused&&!a.getAttribute('src')),'Paused radio resumed after preview');
  assert(await page.evaluate(()=>navigator.mediaSession.playbackState==='paused'),'Stopped preview left Media Session playing');
  // Browser history must also close the clip when leaving Explore.
  await page.locator('.preview-button').click();
  await page.waitForFunction(()=>document.getElementById('preview-audio').currentTime>0.5);
  await page.evaluate(()=>{history.pushState(null,'','/');dispatchEvent(new PopStateEvent('popstate'));});
  assert(await page.locator('#preview-audio').evaluate(a=>a.paused&&!a.getAttribute('src')),'Back navigation left preview playing');
  await page.locator('#language [value=de]').dispatchEvent('click');
  assert((await page.locator('#go-deeper').textContent()).includes('Wurzeln'),'German player missing');
  assert((await page.locator('#stage-spotify').getAttribute('aria-label')).includes('Spotify'),'Spotify action label missing');
  assert(await page.locator('#track-hunt').count()===0,'Track Hunt returned to Listen');
  for(const width of [320,390,760,1440]){
    await page.setViewportSize({width,height:900});
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Listen overflow '+width);
  }
  await page.locator('#language [value=en]').dispatchEvent('click');
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:'artifacts/player-discovery-step/desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:'artifacts/player-discovery-step/mobile.png'});
  await page.locator('#go-deeper').click();
  await page.waitForFunction(()=>!document.getElementById('explore-workspace').hidden);
  for(const width of [320,390,760,1440]){
    await page.setViewportSize({width,height:900});
    assert(await page.locator('#explorer').evaluate(n=>n.scrollWidth<=n.clientWidth),'Explore overflow '+width);
  }
  await page.evaluate(()=>{history.pushState(null,'','#explore/trk_5162739e176d');dispatchEvent(new PopStateEvent('popstate'));});
  await page.waitForFunction(()=>document.querySelector('#entity-inspector h3')?.textContent==='Too Far');
  await page.screenshot({path:'artifacts/player-discovery-step/explorer.png'});
  await page.locator('#explorer-close').click();
  assert(await page.locator('#collection').count()===0,'Retired panels returned to Listen');
  await page.locator('#go-deeper').click();
  await page.waitForFunction(()=>!document.getElementById('explore-workspace').hidden);
  // Failed metadata must leave the radio controls usable and hide the old entity.
  await page.route('**/api/discovery/entity/art_000000000001',route=>route.fulfill({status:503,body:'unavailable'}));
  await page.evaluate(()=>{history.pushState(null,'','#explore/art_000000000001');dispatchEvent(new PopStateEvent('popstate'));});
  await page.waitForFunction(()=>document.getElementById('discovery-status').textContent.includes('unavailable'));
  assert(await page.locator('#explore-workspace').isHidden(),'Failed entity left stale details visible');
  await page.unroute('**/api/discovery/entity/art_000000000001');
  await page.locator('#explorer-close').click();
  await page.unroute('**/journey.js');
  assert(errors.length===0,errors.join('; '));
  return {passed:['live navigation','search','real 60-second clip','resume only previously playing radio','back closes clip','EN/DE','320/390/760/1440 layouts','metadata failure'],pageErrors:errors};
}
