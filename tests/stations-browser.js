async page => {
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://pavoia.gaende.box.ca/');
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
  await page.locator('.explorer-nav a[href="#history"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('.history-row').length>0);
  assert(await page.locator('#music-stage').inputValue()==='essentials','History did not open the current stage');
  await page.locator('#music-stage').selectOption('ambiance');
  await page.waitForFunction(()=>document.querySelector('.history-row small')?.textContent==='Ambiance');
  assert(await page.locator('#audio').getAttribute('src')==='/stream/essentials.mp3'&&await page.locator('#audio').evaluate(a=>!a.paused),'History stage selection changed playback');
  await page.locator('#explorer-close').click();
  if(await page.locator('#open-stations').isVisible())await page.locator('#open-stations').click();
  await page.getByRole('link',{name:'The Bus',exact:true}).click();
  assert(await page.locator('#audio').getAttribute('src')==='/stream/essentials.mp3'&&await page.locator('#audio').evaluate(a=>!a.paused),'Bus stopped Essentials');
  await page.locator('#play').click();
  assert(!errors.length,errors.join('; '));
  return {livePlayback:checked,newStationHistory:true,historyIndependentFromPlayback:true,busPreserved:true,errors};
}
