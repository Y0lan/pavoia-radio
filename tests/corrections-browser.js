async page => {
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(new URL('/',page.url()).href);
  await page.waitForFunction(()=>window.Pavoia?.stations?.length===9);
  await page.locator('#language [value=en]').dispatchEvent('click');
  assert(await page.locator('.collection-nav').count()===0,'Detached navigation remains');
  assert(await page.locator('#go-deeper').textContent()==='See the roots it’s built on','Unclear Explore entry');
  const subtitles={
    en:{Ambiance:'A safe, quiet space to lie down, relax and feel good. Nothing demanding your energy.',Closing:'Tracks I could play to close a set.'},
    de:{Ambiance:'Ein sicherer, ruhiger Ort zum Hinlegen, Entspannen und Wohlfühlen. Hier musst du nichts leisten.',Closing:'Tracks, mit denen ich ein Set beenden könnte.'}
  };
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:width===1440?1000:844});
    assert(await page.locator('#bus-link').evaluate(n=>n===n.parentElement.lastElementChild&&n.previousElementSibling.classList.contains('mood-essentials')),'Bus is not last');
    for(const language of ['en','de']){
      await page.locator(`#language [value=${language}]`).dispatchEvent('click');
      for(const name of ['Ambiance','Closing']){
        if(width<=760)await page.locator('#open-stations').click();
        await page.getByRole('radio',{name,exact:true}).check();
        assert(await page.locator('#mood-place').innerText()===subtitles[language][name],'Wrong '+language+' '+name+' description');
        assert(await page.locator('#mood-place').evaluate(n=>n.scrollHeight<=n.clientHeight+1),'Subtitle clipped');
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page overflow '+width);
      }
    }
  }
  await page.locator('#language [value=en]').dispatchEvent('click');
  await page.locator('#audio').evaluate(a=>{a.volume=0;});
  await page.locator('#play').click();
  await page.waitForFunction(()=>window.Pavoia.getState().playbackState==='playing');
  const source=await page.locator('#audio').getAttribute('src');
  await page.locator('#go-deeper').click();
  // History carries its stage in the address (#history/{stage}): the tab is found by its route, a stage by its link in
  // the stage row. Rows name no stage, so the list is Ambiance's once its answer is in and its rows are drawn. Show
  // earlier tracks carries on across days, as the period "all" did.
  await page.locator('.explorer-nav a[href^="#history"]').click();
  const ambiance=page.waitForResponse(r=>r.url().includes('/api/radio/ambiance/history?'));
  await page.locator('#stage-row a[href^="#history/ambiance"]').click();
  await ambiance;
  await page.waitForFunction(()=>location.hash==='#history/ambiance'&&!document.getElementById('music-content').hasAttribute('aria-busy')&&document.querySelectorAll('#music-content > .row').length>0);
  const rows=page.locator('#music-content > .row'),bipoler=rows.filter({has:page.locator('.row-name',{hasText:/^Bipoler Assaults$/})});
  for(let attempt=0;attempt<8&&!await bipoler.count();attempt++){
    if(!await page.locator('#history-more').isVisible())break;
    const before=await rows.count();
    await page.locator('#history-more').click();
    await page.waitForFunction(n=>document.querySelectorAll('#music-content > .row').length>n,before);
  }
  await bipoler.first().click();
  await page.waitForFunction(()=>location.hash==='#explore/plex_128670'&&!document.getElementById('explore-workspace').hidden);
  assert((await page.locator('#entity-inspector').innerText()).includes('Blausch;Meshcut'),'Basic artist missing');
  assert(await page.locator('#entity-inspector .neighbourhood').count()===0,'Empty map shown');
  assert(await page.locator('#entity-inspector .regions').count()===0,'Empty connections shown');
  assert(!await page.locator('#discovery-status').textContent(),'Stale error shown');
  await page.screenshot({path:'output/playwright/corrections-basic-320.png'});
  // The explorer keeps one history entry, so Back would close it: the History tab is the way back to the list.
  await page.locator('.explorer-nav a[href^="#history"]').click();
  await page.waitForFunction(()=>!document.getElementById('music-view').hidden&&document.querySelector('#music-content > .row'));
  // Statistics: All stages from the stage row. Release years are one bar a year, oldest first, each named in its label.
  await page.locator('.explorer-nav a[href^="#statistics"]').click();
  await page.locator('#stage-row a[href="#statistics/radio"]').click();
  await page.waitForFunction(()=>location.hash==='#statistics/radio'&&document.querySelector('#music-content .entity-heading h3')?.textContent==='All stages'&&document.querySelector('#music-content .release-years')&&!document.getElementById('music-content').hasAttribute('aria-busy'));
  const years=(await page.locator('#music-content .release-years .years > span').evaluateAll(bars=>bars.map(bar=>bar.getAttribute('aria-label')))).map(label=>Number(label.slice(0,4)));
  assert(years.length>12,'Year chart still truncated');
  assert(years.every((y,i)=>i===0||y===years[i-1]+1),'Years are not one bar a year, oldest first');
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:width===1440?1000:844});
    // A stage drawn as a map from 1100px turns into the list at the next frame, when the browser reports the media change.
    await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
    assert(await page.locator('#explorer').evaluate(n=>n.scrollWidth<=n.clientWidth+1),'Statistics overflow '+width);
  }
  assert(await page.locator('#audio').getAttribute('src')===source&&await page.locator('#audio').evaluate(a=>!a.paused),'Browsing stopped the radio');
  await page.evaluate(()=>window.Pavoia.openTrack('168908'));
  await page.waitForFunction(()=>location.hash==='#explore/plex_168908'&&!document.getElementById('explore-workspace').hidden);
  assert((await page.locator('#entity-inspector').innerText()).includes('Recondite'),'Closing track did not open');
  const cover=page.locator('#entity-inspector .entity-heading img[src]');
  if(await cover.count())await page.waitForFunction(()=>{const n=document.querySelector('#entity-inspector .entity-heading img[src]');return n.complete&&n.naturalWidth>0;});
  await page.reload();
  await page.waitForFunction(()=>!document.getElementById('explore-workspace').hidden);
  assert((await page.locator('#entity-inspector').innerText()).includes('Recondite'),'Basic link failed on reload');
  assert(await page.locator('#audio').evaluate(a=>a.paused),'Reload unexpectedly autoplayed');
  // Roots lands on the record on air, or says that nothing is on air. The player's link to that record
  // can turn from plex_ to trk_ while it loads, so both sides are read together, in the page.
  await page.locator('#roots-tab').click();
  await page.waitForFunction(()=>{
    const onAir=document.getElementById('player-title').getAttribute('href');
    return onAir?location.hash===onAir&&!document.getElementById('explore-workspace').hidden:document.getElementById('discovery-status').textContent!=='';
  },null,{timeout:15000});
  await page.evaluate(()=>window.Pavoia.openTrack('143095'));
  await page.waitForFunction(()=>/^#explore\/trk_/.test(location.hash)&&!document.getElementById('explore-workspace').hidden);
  // The header paints first and the regions once their names arrive, 2.5 s after it at most.
  await page.waitForFunction(()=>document.querySelector('#entity-inspector .regions'),null,{timeout:5000}).catch(()=>{});
  assert(await page.locator('#entity-inspector .regions').count()===1,'Rich connections lost');
  await page.screenshot({path:'output/playwright/corrections-rich-320.png'});
  await page.locator('#explorer-close').click();
  await page.locator('#language [value=de]').dispatchEvent('click');
  await page.evaluate(()=>window.Pavoia.openTrack('128670'));
  await page.waitForFunction(()=>document.getElementById('entity-inspector').textContent.includes('Veröffentlichungsprofile'));
  await page.locator('.explorer-nav a[href^="#history"]').click();
  assert(await page.locator('.explorer-nav a[aria-current]').textContent()==='Verlauf','History translation missing');
  await page.locator('#explorer-close').click();
  await page.locator('#language [value=en]').dispatchEvent('click');
  assert(!errors.length,errors.join('; '));
  return {busLast:true,subtitles:['en','de'],viewports:[1440,390,320],historyFallback:true,directLinkReload:true,richProfile:true,libraryArtwork:true,yearCount:years.length,firstYear:years[0],lastYear:years.at(-1),playbackPreserved:true,errors};
}
