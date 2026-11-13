async page => {
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const origin=new URL(page.url()).origin;
  // This test plays the stream: it runs only on the fake preview, whose /stream/** is a local tone, never on serve.py,
  // which relays the stream to the radio and would count it as a listener.
  const mode=await (await page.request.get(origin+'/__mode?set=ok')).text();
  assert(mode==='ok','Not the fake preview: stopping before any stream request');
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
  // Statistics: the place of the station on air, then all stations, then Fontanna's, each from the station row.
  const place=title=>page.waitForFunction(title=>document.querySelector('#music-content .entity-heading h3')?.textContent===title&&!document.getElementById('music-content').hasAttribute('aria-busy'),title);
  await page.locator('.explorer-nav a[href^="#statistics"]').click();
  await page.waitForFunction(()=>document.querySelector('#music-content .entity-heading .entity-line'));
  assert(Number((await page.locator('#music-content .entity-heading .entity-line').first().innerText()).split(' ')[0].replaceAll(',',''))>0,'Missing stage statistics');
  await page.locator('#stage-row a[href="#statistics/radio"]').click();
  await place('All stations');
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
  // On air now, History's All stations: what the nine stations play, from fixtures that hold one long title and one long
  // artist, and the total of their audio connections. No Day field, no earlier tracks, and no overflow at any width.
  // `failing` names the stations whose next answer fails.
  const ids=await page.evaluate(()=>window.Pavoia.stations.map(s=>s.id));
  const onAir=url=>/^\/api\/radio\/[a-z-]+$/.test(url.pathname);let failing=[];
  await page.route(onAir,route=>{
    const id=new URL(route.request().url()).pathname.split('/').pop(),i=ids.indexOf(id),now=Date.now();
    if(failing.includes(id))return route.fulfill({status:503,contentType:'text/plain',body:'unavailable'});
    const title=id==='fontanna'?'A title far too long for one line of a phone, in its extended original club mix':'Track '+(i+1);
    const artist=id==='closing'?'Rodriguez Jr. & Liset Alea feat. a long list of featured remixers':'Artist '+(i+1);
    return route.fulfill({contentType:'application/json',body:JSON.stringify({stage:{id,name:id},track:{id:String(900000+i),title,artist,startedAt:new Date(now-60000).toISOString(),durationMs:600000},audience:{listeners:i,measuredAt:new Date(now).toISOString(),available:true},streamUrl:'/stream/'+id+'.mp3'})});
  });
  // The tab hidden and shown again asks every station at once.
  const reask=()=>page.evaluate(()=>{for(const hidden of [true,false]){Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});document.dispatchEvent(new Event('visibilitychange'));}delete document.hidden;});
  const firstTop=()=>page.locator('#music-content > a.row').first().evaluate(n=>Math.round(n.getBoundingClientRect().top));
  await page.locator('#stage-row a[href="#history/radio"]').click();
  await page.waitForFunction(()=>location.hash==='#history/radio'&&document.querySelectorAll('#music-content > a.row[href]').length===9);
  assert(await page.locator('#music-content > h3').innerText()==='On air now','On air now heading missing');
  assert(await page.locator('#music-content > p.collection-note').innerText()==='36 listening on all stations','The total of audio connections is wrong');
  assert(await page.locator('#music-content > a.row[aria-current]').count()===1,'Now marks more than the tuned station');
  assert(await page.locator('#history-day-label').isHidden()&&await page.locator('#history-more').isHidden(),'All stations shows a day or earlier tracks');
  for(const width of [320,390,760,1440]){
    await page.setViewportSize({width,height:width===1440?1000:844});
    assert(await page.locator('#explorer').evaluate(n=>n.scrollWidth<=n.clientWidth+1),'On air now overflow '+width);
    assert(await page.locator('#music-content > a.row .row-name').evaluateAll(names=>names.every(n=>getComputedStyle(n).whiteSpace==='nowrap'&&getComputedStyle(n).textOverflow==='ellipsis')),'A title wraps at '+width);
    // A long artist ends in an ellipsis before the station, which shows whole on every row.
    assert(await page.locator('#music-content > a.row .row-line').evaluateAll(lines=>lines.every(l=>{const s=l.lastElementChild,b=l.getBoundingClientRect(),r=s.getBoundingClientRect();return r.left>=b.left-0.5&&r.right<=b.right+0.5&&s.scrollWidth<=s.clientWidth+1;})),'A station is cut off its row at '+width);
    // The total reads on the heading's line, whole, and the first row comes 8px under the heading, as in a station's History.
    assert(await page.locator('#music-content').evaluate(c=>{const h=c.children[0].getBoundingClientRect(),t=c.children[1],b=t.getBoundingClientRect(),row=c.querySelector(':scope > a.row').getBoundingClientRect();
      return b.top>=h.top&&b.bottom<=h.bottom&&b.left>=h.right&&t.scrollWidth<=t.clientWidth+1&&Math.abs(row.top-h.bottom-8)<=1;}),'The total is not on the heading\'s line at '+width);
    await page.screenshot({path:'output/playwright/music-on-air-'+width+'.png'});
  }
  // The total goes when one station fails and comes back with it, and the nine rows stay where they are.
  await page.setViewportSize({width:1440,height:900});await page.locator('#explorer').evaluate(n=>{n.scrollTop=0;});
  const top=await firstTop();failing=['fontanna'];await reask();
  await page.waitForFunction(()=>!document.querySelector('#music-content > p.collection-note').textContent);
  assert(await firstTop()===top,'The rows moved when the total went');
  failing=[];await reask();await page.waitForFunction(()=>document.querySelector('#music-content > p.collection-note').textContent);
  assert(await firstTop()===top,'The rows moved when the total came back');
  // Every station failing says it once, with Try again, as History does; Try again brings the same rows back.
  const rowsBefore=await page.locator('#music-content > a.row').evaluateAll(rows=>{window.__airRows=rows;return rows.length;});
  failing=ids;await reask();await page.getByRole('button',{name:'Try again',exact:true}).waitFor();
  assert(await page.locator('#music-content > :not([hidden])').count()===0&&await page.locator('#music-status').innerText()==='What plays now could not load. Try again','All failing shows more than the error and Try again');
  await page.screenshot({path:'output/playwright/music-on-air-allfail-1440.png'});
  failing=[];await page.getByRole('button',{name:'Try again',exact:true}).click();
  await page.waitForFunction(n=>document.querySelectorAll('#music-content > a.row[href]:not([hidden])').length===n&&!document.getElementById('music-status').textContent,rowsBefore);
  assert(await page.locator('#music-content > a.row').evaluateAll(rows=>rows.every((r,i)=>r===window.__airRows[i])),'Try again drew new rows');
  await page.unroute(onAir);
  assert(await page.locator('#audio').getAttribute('src')===source&&await page.locator('#audio').evaluate(a=>!a.paused),'On air now stopped the radio');
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
  return {stations:9,onAirNow:true,historyPagination:true,period:true,entityNavigation:true,retry:true,statistics:true,mobile:true,languages:['en','de'],playbackPreserved:true,errors};
}
