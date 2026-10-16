// Playwright CLI run-code callback for the open candidate or public radio.
async page => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const errors = [], busRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (/\/(api\/radio|stream)\/bus(?:[./?]|$)/.test(request.url())) busRequests.push(request.url());
  });
  await page.goto(new URL('/', page.url()).href);
  await page.setViewportSize({width:1440, height:1000});
  await page.locator('#language [value=en]').dispatchEvent('click');
  const icon = page.getByRole('link', { name: 'The Bus', exact: true });
  assert(await icon.getAttribute('href') === '#bus', 'Bus icon has no shareable route');
  assert(await page.locator('#bus-link').evaluate(link => link === link.parentElement.lastElementChild), 'Bus icon must remain last');
  assert(await page.getByRole('radio', { name: 'The Bus' }).count() === 0, 'Bus became a regular station');
  // The bus rests in the soft colour and turns cream on hover; it is never dimmed.
  assert(await icon.evaluate(link => getComputedStyle(link).color === 'rgba(240, 237, 229, 0.78)' && getComputedStyle(link).opacity === '1'), 'Bus icon does not rest in the soft colour');
  await icon.hover();
  await page.waitForFunction(() => getComputedStyle(document.getElementById('bus-link')).color === 'rgb(240, 237, 229)').catch(() => { throw new Error('Bus icon does not turn cream on hover'); });

  await page.locator('#audio').evaluate(audio => { audio.volume = 0; });
  await page.locator('#play').click();
  await page.waitForFunction(() => document.getElementById('audio').currentTime > 1);
  const before = await page.locator('#audio').evaluate(audio => ({ src: audio.currentSrc, time: audio.currentTime }));
  const stage = await page.evaluate(() => window.Pavoia.getState().stage);
  const playlist = await page.locator('#stage-spotify').getAttribute('href');
  await icon.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.body.hasAttribute('data-bus'));
  await page.waitForFunction(() => { const image = document.getElementById('photo'); return !document.body.hasAttribute('data-photo-loading') && image.complete && image.naturalWidth > 0; });
  assert(await page.locator('#mood-name').innerText() === 'The Bus', 'Wrong Bus title');
  assert(await page.locator('#mood-place').innerText() === 'Somewhere in the forest. No playlist here, you have to be there.', 'Wrong Bus subtitle');
  const ticket = page.getByRole('link', { name: 'Get your Pavoia ticket', exact: true });
  assert(await ticket.getAttribute('href') === 'https://pavoia.com/#tickets', 'Wrong ticket URL');
  assert(await ticket.getAttribute('target') === '_blank', 'Ticket navigation would replace the radio');
  assert(await page.locator('#photo').getAttribute('src') === 'photos/bus-stage.jpg', 'Wrong Bus photo');
  assert(await page.locator('#change-photo').isHidden(), 'Bus offers unselected photos');
  assert(await page.locator('#on-air').isHidden(), 'Track scene covers the Bus');
  assert(await page.locator('#hero-cover').isHidden(), 'Album cover obscures the Bus');
  assert(await page.locator('#stage-spotify').getAttribute('href') === playlist, 'Bus changed the playing station playlist');
  const after = await page.locator('#audio').evaluate(audio => ({ src: audio.currentSrc, time: audio.currentTime, paused: audio.paused }));
  assert(!after.paused && after.src === before.src && after.time >= before.time, 'Opening Bus interrupted audio');
  assert(await page.evaluate(() => window.Pavoia.getState().stage) === stage, 'Bus replaced the playing station');
  await page.goBack();
  assert(await page.locator('.bus-ticket').isHidden(), 'Back did not restore the station scene');
  await page.goForward();
  assert(await page.locator('.bus-ticket').isVisible(), 'Forward did not restore Bus');
  await page.locator('#language [value=de]').dispatchEvent('click');
  assert(await page.locator('#mood-place').innerText() === 'Irgendwo im Wald. Hier gibt es keine Playlist, du musst dabei sein.', 'Bus subtitle is not localized');
  await page.locator('#language [value=en]').dispatchEvent('click');
  await page.locator('input[value="04"]').click();
  assert(!page.url().endsWith('#bus'), 'Selecting the current station did not leave Bus');
  assert(await page.locator('#audio').evaluate(audio => !audio.paused && audio.currentSrc.endsWith('/stream/palac-feel.mp3')), 'Returning to the current station stopped audio');
  await icon.click();
  await page.evaluate(() => window.Pavoia.openTrack('143095'));
  await page.waitForFunction(() => location.hash.startsWith('#explore/') && !document.getElementById('explore-workspace').hidden);
  assert(await page.locator('.bus-ticket').isHidden(), 'Explore route retained the Bus scene');
  await page.locator('#explorer-close').click();
  assert(await page.locator('#audio').evaluate(audio => !audio.paused), 'Closing Explore stopped audio');
  await icon.click();

  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow at ' + width);
    if(width<=760)await page.locator('#open-stations').click();
    const box = await icon.boundingBox();
    assert(box.width >= 44 && box.height >= 44, 'Bus touch target is too small');
    if(width<=760){await page.keyboard.press('Escape');await page.waitForFunction(()=>getComputedStyle(document.getElementById('stations-sheet')).display==='none');}
    if (width !== 320) {
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: `output/playwright/bus-${width}.png` });
    }
  }
  await page.reload();
  await page.waitForFunction(() => document.body.hasAttribute('data-bus'));
  assert(page.url().endsWith('#bus'), 'Reload lost the shared Bus route');
  assert(await page.locator('#audio').evaluate(audio => audio.paused && !audio.getAttribute('src')), 'Direct Bus link started autoplay');
  assert(await page.locator('#play').isEnabled(), 'Bus disabled the existing player');
  assert(errors.length === 0, errors.join('\n'));
  assert(busRequests.length === 0, 'Bus requested a nonexistent station');
  return { busScene: true, directLink: true, history: true, playbackPreserved: true, keyboard: true, ticketLink: true, pageErrors: errors };
}
