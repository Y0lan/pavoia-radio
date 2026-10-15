// Run against the local preview with Playwright CLI. Uses the real live stream.
async page => {
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/waveform.js',route=>route.fallback());
  await page.goto('http://127.0.0.1:14521');
  await page.waitForFunction(()=>!document.getElementById('go-deeper').disabled);
  assert(await page.locator('.player .signed, #dock-deeper, #hero-play').count()===0,'Duplicate dock controls remain');
  assert(await page.locator('.roots-footer #go-deeper').count()===1,'Explore missing from roots footer');
  assert(await page.locator('#language').evaluate(n=>getComputedStyle(n).backgroundColor==='rgba(0, 0, 0, 0)'),'Language background is opaque');
  await page.locator('#play').click();
  await page.waitForFunction(()=>document.getElementById('audio').currentTime>1);
  // Real samples must draw beyond the resting center line.
  await page.waitForFunction(()=>{
    const c=document.getElementById('waveform'),data=c.getContext('2d').getImageData(0,0,c.width,c.height/3).data;
    return data.some((value,i)=>i%4===3&&value>0);
  });
  const first=await page.locator('#waveform').evaluate(c=>c.toDataURL());
  await page.waitForFunction(before=>document.getElementById('waveform').toDataURL()!==before,first);
  await page.locator('#volume').fill('0.4');
  assert(await page.locator('#audio').evaluate(a=>a.volume===.4),'Dock volume did not control radio');
  if(await page.locator('#open-stations').isVisible())await page.locator('#open-stations').click();
  await page.locator('#moods input[value="03"]').check();
  await page.waitForFunction(()=>document.getElementById('audio').currentTime>1);
  await page.waitForFunction(()=>{const c=document.getElementById('waveform');return c.getContext('2d').getImageData(0,0,c.width,c.height/3).data.some((v,i)=>i%4===3&&v>0);});
  await page.locator('#go-deeper').click();
  await page.waitForFunction(()=>!document.getElementById('explore-workspace').hidden);
  assert(await page.locator('#audio').evaluate(a=>!a.paused),'Explore interrupted radio');
  await page.locator('#explorer-close').click();
  for(const width of [320,390,760,1440]){
    await page.setViewportSize({width,height:900});
    for(const lang of ['en','de']){
      await page.locator('#language').selectOption(lang);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Overflow '+width+'/'+lang);
      const boxes=await page.locator('.top .wordmark,.station-status').evaluateAll(ns=>ns.map(n=>({left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right})));
      assert(boxes[0].right<=boxes[1].left,'Header overlap '+width+'/'+lang);
    }
  }
  await page.locator('#language').selectOption('en');
  await page.setViewportSize({width:1440,height:1000});
  await page.screenshot({path:'artifacts/player-discovery-step/bar-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'artifacts/player-discovery-step/bar-mobile.png'});
  await page.locator('#play').click();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const still=await page.locator('#waveform').evaluate(c=>c.toDataURL());
  await page.waitForTimeout(150);
  assert(still===await page.locator('#waveform').evaluate(c=>c.toDataURL()),'Paused waveform still animates');
  // Reduced motion must retain live audio without an animated waveform.
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('#play').click();
  await page.waitForFunction(()=>document.getElementById('audio').currentTime>1);
  const reduced=await page.locator('#waveform').evaluate(c=>c.toDataURL());
  await page.waitForTimeout(150);
  assert(reduced===await page.locator('#waveform').evaluate(c=>c.toDataURL()),'Reduced motion ignored');
  await page.locator('#play').click();
  await page.emulateMedia({reducedMotion:'no-preference'});
  // Unsupported capture must not change the native playback route.
  await page.addInitScript(()=>{HTMLMediaElement.prototype.captureStream=undefined;HTMLMediaElement.prototype.mozCaptureStream=undefined;});
  await page.reload();
  await page.locator('#play').click();
  await page.waitForFunction(()=>document.getElementById('audio').currentTime>1);
  assert(await page.locator('#audio').evaluate(a=>!a.paused),'Fallback stopped audio');
  await page.locator('#play').click();
  assert(errors.length===0,errors.join('; '));
  return {passed:['live waveform samples','station switch','volume','Explore during playback','EN/DE responsive layout','paused waveform','reduced motion','capture unavailable fallback'],pageErrors:errors};
}
