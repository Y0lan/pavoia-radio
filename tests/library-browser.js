// Playwright CLI callback. Uses the live catalogue; fault cases are browser-local.
async page => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('#language [value=en]').dispatchEvent('click');
  await page.locator('#play').click();
  await page.waitForFunction(() => document.getElementById('audio').currentTime > 1);
  await page.locator('#catalogue-panel summary').click();
  await page.waitForFunction(() => document.querySelectorAll('#catalogue-tracks li').length === 30);
  await page.locator('#catalogue-scope').selectOption('library');
  await page.waitForFunction(() => document.getElementById('catalogue-freshness').textContent.includes('90,536'));
  assert(await page.locator('#collection-station').textContent() === 'Entire music library', 'Wrong scope label');
  await page.locator('#catalogue-more').click();
  await page.waitForFunction(() => document.querySelectorAll('#catalogue-tracks li').length === 60);
  await page.locator('#catalogue-query').fill('Jimi');
  await page.locator('#catalogue-search button').click();
  await page.waitForFunction(() => /tracks shown/.test(document.getElementById('catalogue-status').textContent));
  assert((await page.locator('#catalogue-tracks').textContent()).toLowerCase().includes('jimi'), 'Library search mismatch');
  assert(await page.locator('#audio').evaluate(a => !a.paused), 'Library browsing stopped audio');
  await page.locator('#language [value=de]').dispatchEvent('click');
  assert(await page.locator('#collection-station').textContent() === 'Gesamte Musikbibliothek', 'German library scope');
  assert((await page.locator('#catalogue-freshness').textContent()).includes('90.536'), 'German library total');
  for (const width of [320,390,760,1440]) {
    await page.setViewportSize({width,height:900});
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`);
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('#catalogue-panel summary').scrollIntoViewIfNeeded();
  await page.screenshot({path:'library-mobile-de.png'});
  await page.locator('#language [value=en]').dispatchEvent('click');
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('#catalogue-panel summary').scrollIntoViewIfNeeded();
  await page.screenshot({path:'library-desktop.png'});
  await page.locator('#play').click();
  // A late library response must not replace the selected radio catalogue.
  let release, started=false;
  await page.route('**/api/library/catalogue?**', async route => {
    started=true; await new Promise(resolve => {release=resolve;});
    await route.fulfill({json:{tracks:[{id:'999',title:'Stale library',artist:'Old result'}],next:null,library:{total:1,updatedAt:'2026-10-07T00:00:00Z'}}}).catch(()=>{});
  });
  await page.locator('#catalogue-search button').click();
  for(let i=0; !started && i<50; i++) await page.waitForTimeout(20);
  assert(started,'Held library request did not start');
  await page.locator('#catalogue-query').fill('');
  await page.locator('#catalogue-scope').selectOption('radio');
  await page.waitForFunction(() => document.querySelectorAll('#catalogue-tracks li').length === 30);
  release(); await page.waitForTimeout(100);
  assert(!(await page.locator('#catalogue-tracks').textContent()).includes('Stale library'),'Stale library response rendered');
  assert(await page.locator('#catalogue-freshness').textContent() === '', 'Library count leaked into radio scope');
  await page.unroute('**/api/library/catalogue?**');
  await page.route('**/api/library/catalogue?**', route => route.fulfill({status:503,body:'unavailable'}));
  await page.locator('#catalogue-scope').selectOption('library');
  await page.waitForFunction(() => document.getElementById('catalogue-status').textContent.includes('unavailable'));
  await page.unroute('**/api/library/catalogue?**');
  await page.locator('#catalogue-search button').click();
  await page.waitForFunction(() => document.querySelectorAll('#catalogue-tracks li').length === 30);
  assert(await page.locator('#audio').getAttribute('src') === null,'Catalogue started audio');
  assert(errors.length===0,errors.join('; '));
  return {live:'library search, pagination, snapshot date/count, playback preserved, EN/DE',simulated:'late scope response, error recovery',widths:[320,390,760,1440],pageErrors:errors};
}
