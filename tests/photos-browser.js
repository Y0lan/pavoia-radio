// Playwright CLI run-code callback for the open candidate or live radio page.
async page => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(new URL('/', page.url()).href);
  await page.setViewportSize({width:1440, height:1000});
  const photo = page.locator('#photo');
  const change = page.locator('#change-photo');
  const loaded = () => page.waitForFunction(() => {
    const image = document.getElementById('photo');
    return !document.body.hasAttribute('data-photo-loading') && image.complete && image.naturalWidth > 0;
  });
  await page.locator('#language [value=en]').dispatchEvent('click');
  await loaded();
  await page.locator('#audio').evaluate(audio => { audio.volume = 0; });
  await page.locator('#play').click();
  await page.waitForFunction(() => document.getElementById('audio').currentTime > 1);
  const before = await page.locator('#audio').evaluate(audio => ({ time: audio.currentTime, src: audio.currentSrc }));
  const initialPhoto = await photo.getAttribute('src');
  await change.click();
  await loaded();
  assert(await photo.getAttribute('src') !== initialPhoto, 'Manual change kept the same photo');
  const after = await page.locator('#audio').evaluate(audio => ({ time: audio.currentTime, src: audio.currentSrc, paused: audio.paused }));
  assert(!after.paused && after.src === before.src && after.time >= before.time, 'Manual photo change interrupted playback');
  const stablePhoto = await photo.getAttribute('src');
  await page.locator('#language [value=de]').dispatchEvent('click');
  assert(/^Nächstes Foto, \d+ von \d+$/.test(await change.getAttribute('aria-label')), 'Missing German button label');
  assert(await photo.getAttribute('src') === stablePhoto, 'Language change advanced the photo');
  await page.locator('#language [value=en]').dispatchEvent('click');
  await change.focus();
  await page.keyboard.press('Enter');
  await loaded();
  assert(await photo.getAttribute('src') !== stablePhoto, 'Keyboard activation did not change the photo');
  await page.locator('#play').click();

  const counts = { '01': 8, '02': 13, '03': 4, '04': 4, '05': 13, '06': 8, '07': 1 };
  for (const [stage, count] of Object.entries(counts)) {
    await page.locator(`input[name="mood"][value="${stage}"]`).check();
    await loaded();
    const first = await photo.getAttribute('src');
    assert(await change.isVisible() === (count > 1), 'Photo button visibility is wrong for ' + stage);
    if (count === 1) continue;
    const seen = new Set([first]);
    for (let index = 1; index < count; index++) {
      await change.click();
      await loaded();
      const src = await photo.getAttribute('src');
      assert(!seen.has(src), 'Photo repeated before the full selection: ' + stage);
      seen.add(src);
    }
    await change.click();
    await loaded();
    assert(await photo.getAttribute('src') === first, 'Photo sequence did not wrap: ' + stage);
  }
  await page.locator('input[value="02"]').check();
  await loaded();
  await page.waitForFunction(() => window.Pavoia.getState().dataFresh);
  assert(await photo.evaluate(image => getComputedStyle(image).objectPosition) === '50% 50%', 'Crop position did not advance with the photo');
  for (const width of [1440, 760, 390, 320]) {
    await page.setViewportSize({ width, height: width > 900 ? 1000 : 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow at ' + width);
    assert((await change.boundingBox()).height >= 44, 'Photo button touch target is too small');
    if (width === 1440 || width === 390) {
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: `output/playwright/photos-${width}.png` });
    }
  }
  assert(errors.length === 0, errors.join('\n'));
  return { stageCounts: counts, playbackPreserved: true, keyboard: true, languages: ['en', 'de'], viewportWidths: [1440, 760, 390, 320], pageErrors: errors };
}
