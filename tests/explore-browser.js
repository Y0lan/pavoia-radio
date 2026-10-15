// Playwright CLI run-code callback. Open the radio or its local preview first.
async page => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion:'reduce' });
  await page.locator('#language').selectOption('en');
  await page.locator('#catalogue-panel summary').click();
  await page.waitForFunction(() => document.querySelectorAll('#catalogue-tracks li').length === 30);
  const first = await page.locator('.catalogue-title').first().textContent();
  await page.locator('#catalogue-more').click();
  await page.waitForFunction(() => document.querySelectorAll('#catalogue-tracks li').length === 60);
  await page.locator('#catalogue-query').fill(first);
  await page.locator('#catalogue-search button').click();
  await page.waitForFunction(() => /tracks shown/.test(document.getElementById('catalogue-status').textContent));
  assert((await page.locator('#catalogue-tracks').textContent()).includes(first), 'Search lost the matching title');
  await page.locator('#catalogue-query').fill('pavoia-no-match-938127');
  await page.locator('#catalogue-search button').click();
  await page.waitForFunction(() => document.getElementById('catalogue-status').textContent.startsWith('No matching'));
  await page.locator('#catalogue-query').fill('');
  await page.locator('#catalogue-search button').click();
  await page.waitForFunction(() => document.querySelectorAll('#catalogue-tracks li').length === 30);
  await page.locator('#play').click();
  await page.waitForFunction(() => document.getElementById('audio').currentTime > 1);
  if (await page.evaluate(() => Boolean(track?.coverUrl))) await page.waitForFunction(() => [...document.querySelectorAll('.cover-art')].some(image => image.complete && image.naturalWidth > 0 && !image.hidden));
  await page.locator('#changes-panel summary').click();
  await page.waitForFunction(() => document.getElementById('changes-since').textContent.includes('Tracking since'));
  assert(await page.locator('#audio').evaluate(a => !a.paused), 'History interrupted playback');
  await page.locator('#changes-panel summary').click();
  await page.locator('#audience-panel summary').click();
  await page.waitForFunction(() => !document.getElementById('audience-table').hidden);
  await page.locator('#language').selectOption('de');
  assert(await page.locator('#catalogue-panel summary').textContent() === 'Die Auswahl entdecken', 'Catalogue language');
  assert(await page.locator('#audio').evaluate(a => !a.paused), 'Catalogue/language stopped playback');
  await page.locator('#play').click();
  for (const width of [320,390,760,1440]) {
    await page.setViewportSize({width,height:900});
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow at ${width}`);
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('#audience-panel').scrollIntoViewIfNeeded();
  await page.screenshot({path:'collection-mobile-de.png'});
  await page.locator('#language').selectOption('en');
  await page.setViewportSize({width:1440,height:1000});
  await page.locator('#catalogue-panel summary').scrollIntoViewIfNeeded();
  await page.screenshot({path:'collection-desktop.png'});

  // A slow result from a previous station must not replace the new selection.
  let release, started = false;
  await page.route('**/api/radio/palac-feel/catalogue?**', async route => {
    started = true;
    await new Promise(resolve => { release=resolve; });
    await route.fulfill({json:{tracks:[{id:'999',title:'Stale track',artist:'Old station'}],next:null}}).catch(()=>{});
  });
  await page.locator('#catalogue-search button').click();
  for (let i=0;!started && i<50;i++) await page.waitForTimeout(20);
  assert(started, 'Held request did not start');
  await page.locator('input[name="mood"][value="05"]').check();
  await page.waitForFunction(() => document.querySelectorAll('#catalogue-tracks li').length === 30);
  release();
  await page.waitForTimeout(100);
  assert(!(await page.locator('#catalogue-tracks').textContent()).includes('Stale track'), 'Old station overwrote catalogue');
  assert(await page.locator('#collection-station').textContent() === 'Essentials', 'Wrong catalogue station');
  assert(await page.locator('#audio').getAttribute('src') === null, 'Catalogue started playback');
  await page.unroute('**/api/radio/palac-feel/catalogue?**');

  await page.route('**/api/radio/essentials/catalogue?**', route => route.fulfill({status:503,body:'unavailable'}));
  await page.locator('#catalogue-search button').click();
  await page.waitForFunction(() => document.getElementById('catalogue-status').textContent.includes('unavailable'));
  await page.unroute('**/api/radio/essentials/catalogue?**');
  await page.locator('#catalogue-search button').click();
  await page.waitForFunction(() => document.querySelectorAll('#catalogue-tracks li').length === 30);
  await page.route('**/api/radio/essentials/stats', route => route.fulfill({json:{available:true,days:[{date:'2026-10-07',peak:0,listenerHours:null,measuredSeconds:0}]}}));
  await page.locator('#audience-refresh').click();
  await page.waitForFunction(() => document.getElementById('audience-days').textContent.includes('Unknown'));
  assert((await page.locator('#audience-days td').allTextContents()).join('|') === '0|Unknown|0', 'Unknown/zero statistics conflated');
  await page.unroute('**/api/radio/essentials/stats');
  await page.route('**/api/radio/essentials/stats', route => route.fulfill({status:503,body:'unavailable'}));
  await page.locator('#audience-refresh').click();
  await page.waitForFunction(() => document.getElementById('audience-status').textContent.includes('unavailable'));
  assert(await page.locator('#audience-table').isHidden(), 'Failed statistics shown as current');
  await page.unroute('**/api/radio/essentials/stats');
  await page.locator('#audience-refresh').click();
  await page.waitForFunction(() => !document.getElementById('audience-table').hidden);
  assert(errors.length === 0, errors.join('; '));
  return {live:'search, pagination, station selection, audience history, playback preserved, EN/DE', simulated:'late response, catalogue recovery, unknown versus zero, statistics recovery',widths:[320,390,760,1440],pageErrors:errors};
}
