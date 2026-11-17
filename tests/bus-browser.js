// Playwright CLI run-code callback for the open candidate. It plays, so it runs only on the fake preview, whose
// /stream/** is a local tone that never reaches the radio (python3 design/stage-direction/fakeserve.py <port>):
// its first request asks the fake for its normal mode and stops unless the answer is "ok".
async page => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const mode = await (await page.request.get(new URL('/__mode?set=ok', page.url()).href)).text();
  assert(mode === 'ok', 'not the fake preview, stopping before any play: ' + mode.slice(0, 80));
  const errors = [], busRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (/\/(api\/radio|stream)\/bus(?:[./?]|$)/.test(request.url())) busRequests.push(request.url());
  });
  // From a known station: the radio would otherwise open on the station this browser played last.
  await page.goto(new URL('/?station=palac-feel', page.url()).href);
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
  // The station heard, from the Bus: its red dot on the rail and in the sheet, and the bar's door back to it.
  const home = async (width, height) => { await page.setViewportSize({ width, height }); await page.waitForFunction(phone => Boolean(document.getElementById('station-selector').closest(phone ? '#stations-sheet' : '.poster')), width <= 760); };
  await home(1440, 1000);
  const dots = () => page.evaluate(() => [...document.querySelectorAll('#moods .mood')].filter(label => { const dot = getComputedStyle(label.querySelector(':scope > span'), '::before'); return dot.content !== 'none' && dot.opacity === '1'; }).map(label => label.querySelector('input').value));
  assert(JSON.stringify(await dots()) === '["04"]', 'The rail dot does not mark the station heard alone: ' + JSON.stringify(await dots()));
  assert(await page.evaluate(() => getComputedStyle(document.querySelector('input[value="04"]').closest('.mood').querySelector(':scope > span'), '::before').position) === 'absolute', 'The rail dot takes room');
  const door = page.locator('#player-stage .stage-door');
  assert(await door.innerText() === 'TUNED TO LOST IN FEELINGS' && await door.getAttribute('title') === 'Back to Lost in Feelings' && await door.getAttribute('aria-label') === null, 'Wrong door on the Bus');
  await page.locator('#play').focus();
  for (let i = 0; i < 40 && !await door.evaluate(node => node === document.activeElement); i++) await page.keyboard.press('Tab');
  assert(await door.evaluate(node => node === document.activeElement && node.matches(':focus-visible')), 'The keyboard does not reach the door');
  await page.screenshot({ path: 'output/playwright/bus-door-focus.png' });
  // The door's underline shows: the strip just under the 14px label is drawn while the door is lit, and empty at rest.
  const label = await page.locator('#player-stage').boundingBox(), doorBox = await door.boundingBox();
  const strip = { x: doorBox.x, y: label.y + label.height, width: doorBox.width, height: 3 };
  assert(label.height === 14, 'The door grew the label: ' + label.height);
  const lit = await page.screenshot({ clip: strip });
  await page.locator('#play').focus();
  await page.waitForFunction(() => !document.querySelector('.stage-door').matches(':focus'));
  assert(!lit.equals(await page.screenshot({ clip: strip })), 'The door cuts its own underline');
  // In the bar's narrow column, the door shows the station's name whole, as the plain label does; its name keeps "Tuned to".
  for (const [language, name] of [['en', 'Tuned to Lost in Feelings'], ['de', 'Sender: Lost in Feelings']]) {
    await home(900, 800);
    await page.locator(`#language [value=${language}]`).dispatchEvent('click');
    await page.waitForFunction(language => document.documentElement.lang === language, language);
    const cut = await door.evaluate(node => [node.clientWidth, node.scrollWidth]);
    assert(cut[1] <= cut[0], `The door cuts the station at 900 ${language}: ${cut}`);
    assert(await page.getByRole('button', { name, exact: true }).count() === 1, `The door lost its name at 900 ${language}`);
  }
  // In the one-row bar just above 1100 px, the door is whole in both languages and leaves the waveform its room.
  for (const language of ['en', 'de']) {
    await home(1110, 800);
    await page.locator(`#language [value=${language}]`).dispatchEvent('click');
    await page.waitForFunction(language => document.documentElement.lang === language, language);
    const room = await page.evaluate(() => { const door = document.querySelector('.stage-door'); return [door.clientWidth, door.scrollWidth, document.getElementById('waveform').getBoundingClientRect().width]; });
    assert(room[1] <= room[0] && room[2] >= 16, `The door takes the waveform's room at 1110 ${language}: ${room}`);
  }
  await page.locator('#language [value=en]').dispatchEvent('click');
  await home(390, 844);
  await page.locator('#open-stations').click();
  await page.waitForFunction(() => getComputedStyle(document.getElementById('stations-sheet')).opacity === '1');
  const sheetDot = await page.evaluate(() => [...document.querySelectorAll('#stations-sheet .mood')].filter(label => getComputedStyle(label, '::after').backgroundColor === 'rgb(238, 31, 9)').map(label => label.querySelector('input').value));
  assert(JSON.stringify(sheetDot) === '["04"]', 'The sheet dot does not mark the station heard on the Bus: ' + JSON.stringify(sheetDot));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('stations-sheet')).display === 'none');
  await home(1440, 1000);
  const streams = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/stream/')) streams.push(request.url()); });
  const heard = await page.locator('#audio').evaluate(audio => ({ src: audio.currentSrc, time: audio.currentTime }));
  await door.click();
  await page.waitForFunction(() => !document.body.hasAttribute('data-bus'));
  await page.waitForTimeout(1200);
  const back = await page.locator('#audio').evaluate(audio => ({ src: audio.currentSrc, time: audio.currentTime, paused: audio.paused }));
  assert(!page.url().endsWith('#bus') && streams.length === 0 && back.src === heard.src && !back.paused && back.time > heard.time, 'The door cut the music: ' + JSON.stringify({ streams, heard, back }));
  assert(await page.evaluate(() => document.activeElement?.id) === 'play', 'The door left its focus nowhere');
  assert(await page.locator('#player-stage .stage-door').count() === 0 && await page.locator('#player-stage').innerText() === 'LOST IN FEELINGS · PAŁAC', 'The label did not turn plain again');
  await icon.click();
  await page.reload();
  await page.waitForFunction(() => document.body.hasAttribute('data-bus'));
  assert(page.url().endsWith('#bus'), 'Reload lost the shared Bus route');
  assert(await page.locator('#audio').evaluate(audio => audio.paused && !audio.getAttribute('src')), 'Direct Bus link started autoplay');
  assert(await page.locator('#play').isEnabled(), 'Bus disabled the existing player');
  assert(errors.length === 0, errors.join('\n'));
  assert(busRequests.length === 0, 'Bus requested a nonexistent station');
  return { busScene: true, directLink: true, history: true, playbackPreserved: true, keyboard: true, ticketLink: true, heardMarks: true, door: true, pageErrors: errors };
}
