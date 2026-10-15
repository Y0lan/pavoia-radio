// One real gesture-to-playing measurement per station. This is not a mobile-device test.
async page => {
  const results=[];
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('#language').selectOption('en');
  for(const [mood,stage] of [['04','palac-feel'],['03','palac-dance'],['01','bermuda-day'],['02','bermuda-evening'],['05','essentials'],['06','etage-zero'],['07','fontanna']]) {
    if(await page.locator('#open-stations').isVisible())await page.locator('#open-stations').click();
    await page.locator(`input[name="mood"][value="${mood}"]`).check();
    await page.evaluate(() => {
      window.startTiming={gesture:null,playing:null};
      document.getElementById('play').addEventListener('click',()=>{window.startTiming.gesture=performance.now();},{once:true,capture:true});
      document.getElementById('audio').addEventListener('playing',()=>{window.startTiming.playing=performance.now();},{once:true});
    });
    try {
      await page.locator('#play').click();
      await page.waitForFunction(()=>window.startTiming.playing!==null && document.getElementById('audio').currentTime>.3,null,{timeout:15000});
      const timing=await page.evaluate(()=>({milliseconds:Math.round(window.startTiming.playing-window.startTiming.gesture),source:document.getElementById('audio').getAttribute('src')}));
      if(timing.source!==`/stream/${stage}.mp3`)throw new Error('Wrong station');
      results.push({stage,...timing,withinThreeSeconds:timing.milliseconds<3000});
    } finally {
      await page.evaluate(()=>pause());
    }
  }
  return {scope:'Automated public HTTPS, one gesture-to-playing sample per station',userAgent:await page.evaluate(()=>navigator.userAgent),targetMilliseconds:3000,allWithinTarget:results.every(r=>r.withinThreeSeconds),results};
}
