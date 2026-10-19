async page => {
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  // The page under test is the one the session opened: the live site or a local preview.
  await page.goto(new URL('/',page.url()).href);
  await page.waitForFunction(()=>window.Pavoia?.stations?.length===9);
  await page.locator('#audio').evaluate(a=>{a.volume=0;});
  const stages=await page.evaluate(()=>window.Pavoia.stations);
  await page.locator('#play').click();
  const checked=[];
  for(const stage of stages){
    if(await page.locator('#open-stations').isVisible())await page.locator('#open-stations').click();
    await page.getByRole('radio',{name:stage.name}).check();
    await page.waitForFunction(id=>window.Pavoia.getState().stage===id&&window.Pavoia.getState().playbackState==='playing'&&document.getElementById('audio').currentTime>0,stage.id);
    assert(await page.locator('#audio').getAttribute('src')==='/stream/'+stage.id+'.mp3',stage.id+' wrong stream');
    checked.push(stage.id);
  }
  await page.locator('#go-deeper').click();
  // History carries its stage in the address (#history/{stage}): the tab is found by its route, a stage by its link in
  // the stage row. Rows name no stage, so the list is Ambiance's once its answer is in and its rows are drawn.
  await page.locator('.explorer-nav a[href^="#history"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('#music-content > .row').length>0&&!document.getElementById('music-content').hasAttribute('aria-busy'));
  assert(await page.locator('#stage-row [aria-current]').getAttribute('href')==='#history/essentials','History did not open the current stage');
  const ambiance=page.waitForResponse(r=>r.url().includes('/api/radio/ambiance/history?'));
  await page.locator('#stage-row a[href^="#history/ambiance"]').click();
  await ambiance;
  await page.waitForFunction(()=>location.hash==='#history/ambiance'&&document.querySelector('#stage-row [aria-current]')?.textContent==='Ambiance'&&!document.getElementById('music-content').hasAttribute('aria-busy')&&document.querySelectorAll('#music-content > .row').length>0);
  assert(await page.locator('#audio').getAttribute('src')==='/stream/essentials.mp3'&&await page.locator('#audio').evaluate(a=>!a.paused),'History stage selection changed playback');
  await page.locator('#explorer-close').click();
  if(await page.locator('#open-stations').isVisible())await page.locator('#open-stations').click();
  await page.getByRole('link',{name:'The Bus',exact:true}).click();
  assert(await page.locator('#audio').getAttribute('src')==='/stream/essentials.mp3'&&await page.locator('#audio').evaluate(a=>!a.paused),'Bus stopped Essentials');
  await page.locator('#play').click();
  assert(!errors.length,errors.join('; '));
  return {livePlayback:checked,newStationHistory:true,historyIndependentFromPlayback:true,busPreserved:true,errors};
}
