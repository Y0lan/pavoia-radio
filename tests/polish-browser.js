// Run against a candidate or public page. Fault injection stays in this browser.
async page => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const origin = new URL(page.url()).origin;
  // Install photo faults before sheet thumbnails can cache the same images.
  let releaseImage;
  const imageGate = new Promise(resolve => { releaseImage = resolve; });
  const delayed = async route => { await imageGate; await route.continue().catch(() => {}); };
  const failed = route => route.abort();
  await page.route('**/photos/selected/p036.jpg', delayed);
  await page.route('**/photos/selected/p052.jpg', failed);
  const select=async id=>{
    if(await page.locator('#open-stations').isVisible())await page.locator('#open-stations').click();
    await page.locator(`input[name="mood"][value="${id}"]`).check();
    await page.waitForFunction(()=>getComputedStyle(document.getElementById('stations-sheet')).display==='none');
  };
  const loaded = () => page.waitForFunction(() => {
    const image = document.getElementById('photo');
    return !document.body.hasAttribute('data-photo-loading') && image.complete && image.naturalWidth > 0;
  });
  await page.goto(origin + '/');
  await loaded();
  await page.evaluate(() => document.fonts.ready);
  assert(await page.locator('img.photo').count() === 2, 'Scene images are not bounded to two layers');
  assert(await page.evaluate(() => !performance.getEntriesByType('resource').some(r => r.name.endsWith('.ttf'))), 'Uncompressed fonts still load');

  await page.waitForFunction(() => document.querySelector('#credited-artists button'), null, {timeout:15000});
  await page.locator('#credited-artists button').first().focus();
  const focusPreserved = await page.evaluate(async () => {
    const focused = document.activeElement;
    await poll();
    return focused.isConnected && focused === document.activeElement;
  });
  assert(focusPreserved, 'Metadata polling removed keyboard focus');

  for (const width of [1440, 760, 390, 320]) {
    await page.setViewportSize({width, height:width === 1440 ? 1000 : 844});
    if(width<=760)await page.locator('#open-stations').click();
    await page.waitForFunction(() => {
      const rail = document.getElementById('station-selector').getBoundingClientRect();
      const item = document.querySelector('.mood:has(input:checked)').getBoundingClientRect();
      return item.left >= rail.left - 1 && item.right <= rail.right + 1;
    });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page overflow at ' + width);
    const busBox=await page.locator('#bus-link').boundingBox();
    assert(busBox.width>=44&&busBox.height>=44,'Small Bus touch target');
    if(width<=760){await page.keyboard.press('Escape');await page.waitForFunction(()=>getComputedStyle(document.getElementById('stations-sheet')).display==='none');}
    for (const id of ['play', 'change-photo']) {
      const box = await page.locator('#' + id).boundingBox();
      assert(box.width >= 44 && box.height >= 44, 'Small touch target: ' + id);
    }
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({path:`output/playwright/polish-${width}.png`});
  }

  await page.locator('#audio').evaluate(audio => { audio.volume = 0; });
  await page.locator('#play').click();
  await page.waitForFunction(() => window.Pavoia.getState().playbackState === 'playing');
  const previous = await page.locator('#photo').getAttribute('src');
  await select('01');
  assert(await page.locator('#audio').getAttribute('src') === '/stream/bermuda-day.mp3', 'Audio waited for a photo');
  assert(await page.locator('#photo').getAttribute('src') === previous, 'A pending photo cleared the scene');
  await select('02');
  await loaded();
  releaseImage();
  await page.unroute('**/photos/selected/p036.jpg', delayed);
  assert(await page.locator('#photo').getAttribute('src') === 'photos/selected/p008.jpg', 'An older scene won the race');
  assert(await page.locator('#photo').evaluate(e => getComputedStyle(e).objectPosition) === '58% 38%', 'Photo crop was lost');

  await select('07');
  await loaded();
  assert(await page.locator('#photo').getAttribute('src') === 'photos/selected/p008.jpg', 'Failed photo replaced a valid image');
  assert(await page.locator('#audio').getAttribute('src') === '/stream/fontanna.mp3', 'Failed photo interrupted station selection');
  await page.unroute('**/photos/selected/p052.jpg', failed);

  await page.emulateMedia({reducedMotion:'reduce'});
  await select('05');
  await loaded();
  await page.locator('#change-photo').click();
  await loaded();
  assert(await page.locator('#photo').evaluate(e => e.getAnimations().length) === 0, 'Reduced motion still crossfades');
  assert(await page.locator('#mood-name').evaluate(e => e.getAnimations().length) === 0, 'Reduced motion still moves the title');
  await page.emulateMedia({reducedMotion:'no-preference'});

  let releaseStream;
  const streamGate = new Promise(resolve => { releaseStream = resolve; });
  const unavailable = async route => { await streamGate; await route.abort().catch(() => {}); };
  await page.route('**/stream/fontanna.mp3', unavailable);
  await select('07');
  await page.waitForFunction(() => window.Pavoia.getState().playbackState === 'connecting');
  assert(await page.locator('#playback-status').isVisible(), 'Mobile connection status is hidden');
  assert((await page.locator('#playback-status').boundingBox()).height > 10, 'Mobile connection status is clipped');
  assert(await page.locator('#play').getAttribute('aria-label') === 'Pause', 'Cannot pause a pending connection');
  await page.screenshot({path:'output/playwright/polish-mobile-connecting.png'});
  releaseStream();
  await page.waitForFunction(() => window.Pavoia.getState().playbackState === 'retrying');
  assert(await page.locator('#playback-status').innerText() === 'Reconnecting', 'Retry feedback missing');
  await page.waitForFunction(() => window.Pavoia.getState().playbackState === 'error', null, {timeout:25000});
  assert(await page.locator('#play').getAttribute('aria-label') === 'Retry playback', 'Terminal error has no retry control');
  await page.locator('#language').selectOption('de');
  assert(await page.locator('#playback-status').innerText() === 'Erneut versuchen', 'German error feedback missing');
  assert((await page.locator('#playback-status').boundingBox()).width <= 320, 'German feedback overflows');
  await page.unroute('**/stream/fontanna.mp3', unavailable);
  await page.locator('#play').click();
  await page.waitForFunction(() => window.Pavoia.getState().playbackState === 'playing');
  await page.locator('#play').click();
  await page.locator('#language').selectOption('en');
  assert(errors.length === 0, errors.join('\n'));
  return {focusPreserved, widths:[1440,760,390,320], photoRaces:true, photoFailure:true, audioIndependent:true, reducedMotion:true, mobileRecovery:true, pageErrors:errors};
}
