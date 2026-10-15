async page => {
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(new URL('/',page.url()).href);
  await page.waitForFunction(()=>window.Pavoia?.stations?.length===9);
  await page.locator('#language').selectOption('en');
  assert(await page.locator('.collection-nav').count()===0,'Detached navigation remains');
  assert(await page.locator('#go-deeper').textContent()==="See the roots it's built on",'Unclear Explore entry');
  const subtitles={
    en:{Ambiance:'A safe, quiet space to lie down, relax and feel good. Nothing demanding your energy.',Closing:'Tracks I could play to close a set.'},
    de:{Ambiance:'Ein sicherer, ruhiger Ort zum Hinlegen, Entspannen und Wohlfühlen. Hier musst du nichts leisten.',Closing:'Tracks, mit denen ich ein Set beenden könnte.'}
  };
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:width===1440?1000:844});
    assert(await page.locator('#bus-link').evaluate(n=>n===n.parentElement.lastElementChild&&n.previousElementSibling.classList.contains('mood-essentials')),'Bus is not last');
    for(const language of ['en','de']){
      await page.locator('#language').selectOption(language);
      for(const name of ['Ambiance','Closing']){
        if(width<=760)await page.locator('#open-stations').click();
        await page.getByRole('radio',{name,exact:true}).check();
        assert(await page.locator('#mood-place').innerText()===subtitles[language][name],'Wrong '+language+' '+name+' description');
        assert(await page.locator('#mood-place').evaluate(n=>n.scrollHeight<=n.clientHeight+1),'Subtitle clipped');
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page overflow '+width);
      }
    }
  }
  await page.locator('#language').selectOption('en');
  await page.locator('#audio').evaluate(a=>{a.volume=0;});
  await page.locator('#play').click();
  await page.waitForFunction(()=>window.Pavoia.getState().playbackState==='playing');
  const source=await page.locator('#audio').getAttribute('src');
  await page.locator('#go-deeper').click();
  await page.locator('.explorer-nav a[href="#history"]').click();
  await page.locator('#music-stage').selectOption('ambiance');
  await page.locator('#history-period').selectOption('all');
  await page.waitForFunction(()=>document.querySelector('.history-row small')?.textContent==='Ambiance');
  for(let attempt=0;attempt<8&&!await page.locator('.history-record strong').filter({hasText:/^Bipoler Assaults$/}).count();attempt++){
    if(!await page.locator('#history-more').isVisible())break;
    const before=await page.locator('.history-row').count();
    await page.locator('#history-more').click();
    await page.waitForFunction(n=>document.querySelectorAll('.history-row').length>n,before);
  }
  await page.locator('.history-record strong').filter({hasText:/^Bipoler Assaults$/}).first().click();
  await page.waitForFunction(()=>location.hash==='#explore/plex_128670'&&!document.getElementById('explore-workspace').hidden);
  assert((await page.locator('#entity-inspector').innerText()).includes('Blausch;Meshcut'),'Basic artist missing');
  assert(await page.locator('.connection-map').isHidden(),'Empty graph shown');
  assert(await page.locator('.entity-connections').count()===0,'Empty connections shown');
  assert(!await page.locator('#discovery-status').textContent(),'Stale error shown');
  await page.screenshot({path:'output/playwright/corrections-basic-320.png'});
  await page.goBack();
  await page.waitForFunction(()=>!document.getElementById('music-view').hidden&&document.querySelector('.history-row'));
  await page.locator('.explorer-nav a[href="#statistics"]').click();
  await page.locator('#music-stage').selectOption('radio');
  await page.waitForFunction(()=>document.querySelector('.music-summary')&&document.getElementById('music-status').textContent==='');
  const chart=page.locator('.music-chart').filter({has:page.getByRole('heading',{name:'Release years',exact:true})});
  const years=await chart.locator('.chart-row > span:first-child').allTextContents();
  assert(years.length>12,'Year chart still truncated');
  assert(years.every((y,i)=>i===0||Number(years[i-1])>Number(y)),'Years are not newest first');
  for(const width of [1440,390,320]){
    await page.setViewportSize({width,height:width===1440?1000:844});
    assert(await page.locator('#explorer').evaluate(n=>n.scrollWidth<=n.clientWidth+1),'Statistics overflow '+width);
  }
  assert(await page.locator('#audio').getAttribute('src')===source&&await page.locator('#audio').evaluate(a=>!a.paused),'Browsing stopped the radio');
  await page.evaluate(()=>window.Pavoia.openTrack('168908'));
  await page.waitForFunction(()=>location.hash==='#explore/plex_168908'&&!document.getElementById('explore-workspace').hidden);
  assert((await page.locator('#entity-inspector').innerText()).includes('Recondite'),'Closing track did not open');
  const cover=page.locator('#entity-inspector .entity-image');
  if(await cover.count())await page.waitForFunction(()=>{const n=document.querySelector('#entity-inspector .entity-image');return n.complete&&n.naturalWidth>0;});
  await page.reload();
  await page.waitForFunction(()=>!document.getElementById('explore-workspace').hidden);
  assert((await page.locator('#entity-inspector').innerText()).includes('Recondite'),'Basic link failed on reload');
  assert(await page.locator('#audio').evaluate(a=>a.paused),'Reload unexpectedly autoplayed');
  await page.locator('.explorer-nav a[href="#explore"]').click();
  assert(await page.locator('#explore-workspace').isHidden(),'Explore root retained old details');
  await page.evaluate(()=>window.Pavoia.openTrack('143095'));
  await page.waitForFunction(()=>/^#explore\/trk_/.test(location.hash)&&!document.getElementById('explore-workspace').hidden);
  assert(await page.locator('.entity-connections').count()===1,'Rich connections lost');
  await page.screenshot({path:'output/playwright/corrections-rich-320.png'});
  await page.locator('#explorer-close').click();
  await page.locator('#language').selectOption('de');
  await page.evaluate(()=>window.Pavoia.openTrack('128670'));
  await page.waitForFunction(()=>document.getElementById('entity-inspector').textContent.includes('Veröffentlichungsprofile'));
  await page.locator('.explorer-nav a[href="#history"]').click();
  assert(await page.locator('#explorer-title').textContent()==='Verlauf','History translation missing');
  await page.locator('#explorer-close').click();
  await page.locator('#language').selectOption('en');
  assert(!errors.length,errors.join('; '));
  return {busLast:true,subtitles:['en','de'],viewports:[1440,390,320],historyFallback:true,directLinkReload:true,richProfile:true,libraryArtwork:true,yearCount:years.length,newestYear:years[0],playbackPreserved:true,errors};
}
