// Check the mobile-to-desktop player transition with all controls visible.
async page => {
  await page.goto(new URL('/',page.url()).href);
  await page.evaluate(()=>document.fonts.ready);
  await page.waitForFunction(()=>window.Pavoia.getState().dataFresh);
  const results=[];
  for(const width of [760,761,800,900,1024,1440]) {
    await page.setViewportSize({width,height:900});
    for(const language of ['en','de']) {
      await page.locator('#language').selectOption(language);
      await page.evaluate(()=>{document.getElementById('track-spotify').hidden=false;});
      for(const playback of ['paused','playing','connecting','retrying','blocked']) {
        await page.evaluate(playback=>{state(playback==='blocked'?'paused':playback,playback);document.getElementById('track-clock').textContent='12:34 / 12:34';document.getElementById('track-spotify').hidden=false;},playback);
        const overflow=await page.locator('.player *').evaluateAll(nodes=>nodes.filter(n=>n.getBoundingClientRect().width>1&&n.getBoundingClientRect().height>1).filter(n=>{const box=n.getBoundingClientRect();return box.left<-.5||box.right>innerWidth+.5;}).map(n=>n.id||n.className));
        if(overflow.length)throw Error(`Player overflow at ${width}/${language}/${playback}: ${overflow}`);
        const contained=await page.locator('.transport-track').evaluate(n=>{const box=n.getBoundingClientRect();return [...n.querySelectorAll('#playback-status,#track-clock,#waveform')].every(child=>{const b=child.getBoundingClientRect();return b.height<=1||getComputedStyle(child).position==='absolute'||b.right<=box.right+.5;});});
        if(!contained)throw Error(`Transport overlaps another control at ${width}/${language}/${playback}`);
        if(width===761&&language==='de'&&playback==='blocked')await page.locator('.player').screenshot({path:'output/playwright/player-761-de.png'});
        results.push(`${width}/${language}/${playback}`);
      }
    }
  }
  return results;
}
