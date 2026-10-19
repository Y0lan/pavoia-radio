async page => {
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const origin=new URL(page.url()).origin;
  await page.goto(origin+'/');
  await page.waitForFunction(()=>window.Pavoia?.stations?.length===9);
  assert(await page.locator('#bus-link').evaluate(n=>n===n.parentElement.lastElementChild),'Bus must remain last');
  await page.locator('#audio').evaluate(a=>{a.volume=0;});
  await page.locator('#play').click();
  await page.waitForFunction(()=>window.Pavoia.getState().playbackState==='playing');
  const source=await page.locator('#audio').getAttribute('src');
  await page.locator('#go-deeper').click();
  // The tabs carry their last place (#history/{stage}), so they are found by their route.
  await page.locator('.explorer-nav a[href^="#history"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('#music-content > .row').length===50);
  const today=await page.evaluate(()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');});
  assert(await page.locator('#history-day').inputValue()===today,'The Day field does not show today');
  const first=await page.locator('#music-content > .row').first().textContent();
  await page.locator('#history-more').click();
  await page.waitForFunction(()=>document.querySelectorAll('#music-content > .row').length===100);
  assert(await page.locator('#music-content > .row').first().textContent()===first,'Older records replaced recent records');
  await page.locator('#history-day').fill(today);
  await page.waitForFunction(()=>document.querySelectorAll('#music-content > .row').length===50&&!document.getElementById('music-content').hasAttribute('aria-busy'));
  // History rows name no stage: the list is Ambiance's once its answer is in and its rows are drawn. The stage row's
  // link keeps the day picked, and the address says both.
  const ambiance=page.waitForResponse(r=>r.url().includes('/api/radio/ambiance/history?'));
  await page.locator('#stage-row a[href^="#history/ambiance"]').click();
  await ambiance;
  assert(await page.evaluate(()=>location.hash)==='#history/ambiance','The address does not name the stage');
  await page.waitForFunction(()=>!document.getElementById('music-content').hasAttribute('aria-busy')&&document.querySelectorAll('#music-content > .row').length>0);
  const row=page.locator('#music-content > .row').first();await row.click();
  await page.waitForFunction(()=>!document.getElementById('explore-workspace').hidden);
  // Back closes the explorer, which keeps one history entry: the History tab is the way back to the list.
  await page.locator('.explorer-nav a[href^="#history"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('#music-content > .row').length===50&&!document.getElementById('music-view').hidden);
  assert((await page.locator('#stage-row [aria-current]').innerText())==='Ambiance','Back lost the selected history stage');
  // Statistics: the stage on air's place, then all stages, then Fontanna's, each from the stage row.
  const place=title=>page.waitForFunction(title=>document.querySelector('#music-content .entity-heading h3')?.textContent===title&&!document.getElementById('music-content').hasAttribute('aria-busy'),title);
  await page.locator('.explorer-nav a[href^="#statistics"]').click();
  await page.waitForFunction(()=>document.querySelector('#music-content .entity-heading .entity-line'));
  assert(Number((await page.locator('#music-content .entity-heading .entity-line').first().innerText()).split(' ')[0].replaceAll(',',''))>0,'Missing stage statistics');
  await page.locator('#stage-row a[href="#statistics/radio"]').click();
  await place('All stages');
  await page.locator('#stage-row a[href="#statistics/fontanna"]').click();
  await place('Fontanna');
  assert((await page.locator('#music-content').innerText()).includes('Shares tracks with'),'Shared stages missing');
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:width===1440?1000:844});
    assert(await page.locator('#explorer').evaluate(n=>n.scrollWidth<=n.clientWidth+1),'Statistics overflow '+width);
    await page.screenshot({path:'output/playwright/music-statistics-'+width+'.png'});
  }
  assert(await page.locator('#audio').getAttribute('src')===source&&await page.locator('#audio').evaluate(a=>!a.paused),'Browsing stopped the radio');
  await page.locator('.explorer-nav a[href^="#history"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('#music-content > .row').length===50);
  assert(await page.locator('#explorer').evaluate(n=>n.scrollWidth<=n.clientWidth+1),'History overflow');
  await page.screenshot({path:'output/playwright/music-history-320.png'});
  // The History tab came back to its own last place, Ambiance, whatever Statistics showed; Fontanna is a stage away.
  assert(await page.evaluate(()=>location.hash)==='#history/ambiance','The History tab lost its place');
  await page.locator('#stage-row a[href^="#history/fontanna"]').click();
  await page.waitForFunction(()=>location.hash==='#history/fontanna'&&document.querySelectorAll('#music-content > .row').length===50&&!document.getElementById('music-content').hasAttribute('aria-busy'));
  await page.route('**/api/radio/fontanna/history?**',r=>r.fulfill({status:503,body:'unavailable'}));
  // Two days back: a whole day of plays, whatever day the test runs.
  const before=await page.evaluate(()=>{const d=new Date(Date.now()-2*86400000);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');});
  await page.locator('#history-day').fill(before);
  await page.getByRole('button',{name:'Try again',exact:true}).waitFor();
  assert(await page.locator('#music-content > .row').count()===0,'Failed request retained misleading rows');
  await page.unroute('**/api/radio/fontanna/history?**');
  await page.getByRole('button',{name:'Try again',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('#music-content > .row').length===50);
  await page.locator('#explorer-close').click();
  await page.locator('#language [value=de]').dispatchEvent('click');
  await page.locator('#go-deeper').click();
  await page.locator('.explorer-nav a[href^="#statistics"]').click();
  await page.waitForFunction(()=>document.querySelector('#music-content .entity-heading'));
  assert(await page.locator('.explorer-nav a[aria-current]').innerText()==='Statistik','Statistics tab not translated');
  await page.screenshot({path:'output/playwright/music-statistics-de-320.png'});
  await page.keyboard.press('Escape');
  await page.locator('#language [value=en]').dispatchEvent('click');
  await page.locator('#play').click();
  assert(errors.length===0,errors.join('; '));
  return {stations:9,historyPagination:true,period:true,entityNavigation:true,retry:true,statistics:true,mobile:true,languages:['en','de'],playbackPreserved:true,errors};
}
