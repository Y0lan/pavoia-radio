// Real keyboard and pointer events in a browser: native Space activation happens on keyup,
// which the node harness cannot reproduce. Run through Playwright CLI on a desktop-width page.
// Streams are blocked, so the test never counts as a listener.
async page => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  await page.route('**/stream/**', route => route.abort());
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await page.waitForFunction(() => window.Pavoia?.getState);
  const wanted = () => page.evaluate(() => window.Pavoia.getState().wanted);
  const photoOnly = () => page.evaluate(() => document.body.hasAttribute('data-photo-only'));
  const stage = () => page.evaluate(() => window.Pavoia.getState().stage);
  const space = async () => { await page.keyboard.down('Space'); await page.keyboard.up('Space'); };
  const toggleButton = page.locator('#artwork-toggle');
  assert(!(await wanted()), 'the page starts paused');

  // A button pressed with the mouse does not capture Space; the radio does.
  await toggleButton.click();
  const photo = await photoOnly();
  await space();
  assert(await wanted(), 'Space after a mouse click plays the radio');
  assert(await photoOnly() === photo, 'and does not press the clicked button again');

  // A held Space acts once, on the radio, and never on release.
  await page.keyboard.down('Space');
  assert(!(await wanted()), 'the first Space press pauses');
  for (let i = 0; i < 2; i++) {
    await page.keyboard.down('Space');
    assert(!(await wanted()), 'a held Space does not toggle again on repeat ' + (i + 1));
  }
  await page.keyboard.up('Space');
  assert(!(await wanted()), 'and the release does not toggle either');
  assert(await photoOnly() === photo, 'and the clicked button stays as it was');

  // A button reached with the keyboard keeps its own Space.
  await page.locator('#play').focus();
  for (let i = 0; i < 40 && !(await toggleButton.evaluate(el => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  assert(await toggleButton.evaluate(el => el === document.activeElement), 'Tab reaches Photo only');
  await space();
  assert(await photoOnly() !== photo, 'Space presses a button reached with the keyboard');
  assert(!(await wanted()), 'and leaves the radio alone');

  // Reached with Tab, then pressed with the mouse: Space goes back to the radio.
  await toggleButton.click();
  const clicked = await photoOnly();
  await space();
  assert(await wanted(), 'after a mouse press on a Tab-focused button, Space plays');
  assert(await photoOnly() === clicked, 'and does not press that button again');
  await space();
  assert(!(await wanted()), 'Space pauses again');

  // A station not yet selected, focused by keyboard or assistive navigation: Space selects it.
  const before = await stage();
  await page.keyboard.press('Shift');
  await page.locator('#moods input:not(:checked)').first().focus();
  await space();
  assert(await stage() !== before, 'Space selects a station not yet selected');
  assert(!(await wanted()), 'without starting playback');

  // Typing never toggles the radio.
  await page.evaluate(() => { location.hash = 'explore'; });
  await page.locator('#discovery-query').click();
  await page.keyboard.type('a b');
  assert(await page.locator('#discovery-query').inputValue() === 'a b', 'Space types a space in the search');
  assert(!(await wanted()), 'while the radio stays paused');

  // The explorer is a plain dialog: Space and the arrows still reach the radio from it, and Escape leaves it.
  const explorerOpen = () => page.locator('#explorer').evaluate(dialog => dialog.open);
  await page.locator('#explorer').click({ position: { x: 4, y: 4 } });
  await space();
  assert(await wanted(), 'Space plays from the explorer');
  await space();
  assert(!(await wanted()), 'and pauses');
  const inside = await stage();
  await page.keyboard.press('ArrowRight');
  assert(await stage() !== inside && await explorerOpen(), 'the arrows change stage behind the open explorer');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('explorer').open);
  assert(await page.evaluate(() => location.hash) === '', 'Escape leaves the explorer for the radio page');
  assert(!(await page.locator('main').evaluate(main => main.inert)), 'and gives the page back');

  // The page keys: 1 to 9 pick the station at that place on screen, M mutes where the slider shows, ? shows the keys.
  // Every check starts from Lost in Feelings, by stage, paused; the stream requests are counted, all aborted above.
  const streams = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/stream/')) streams.push(request.url()); });
  const fresh = async () => {
    await page.goto(new URL('/?station=palac-feel', page.url()).href);
    await page.waitForFunction(() => window.Pavoia?.getState);
    if (await page.locator('#ways button[value=stage]').getAttribute('aria-pressed') !== 'true') await page.evaluate(() => document.querySelector('#ways button[value=stage]').click());
    await page.locator('body').click({ position: { x: 4, y: 4 } });
    streams.length = 0;
  };
  await fresh();
  await page.keyboard.press('5');
  assert(await stage() === 'etage-zero' && !(await wanted()) && streams.length === 0, '5 picks the fifth station by stage, paused, with no stream request');
  await page.evaluate(() => document.querySelector('#ways button[value=feeling]').click());
  await page.locator('body').click({ position: { x: 4, y: 4 } });
  await page.keyboard.press('1');
  assert(await stage() === 'bermuda-day', 'By feeling, 1 is the first station of that order');
  await page.keyboard.press('2');
  assert(await stage() === 'fontanna' && !(await wanted()) && streams.length === 0, 'and 2 its second, still paused, with no stream request');

  // Phone: the stations sheet keeps its keys, typing keeps its digits, and Ctrl+1 stays the browser's.
  await page.setViewportSize({ width: 390, height: 844 });
  await fresh();
  await page.locator('#open-stations').click();
  await page.waitForFunction(() => document.getElementById('stations-sheet').open);
  await page.keyboard.press('3');
  assert(await stage() === 'palac-feel', 'with the stations sheet open, 3 changes nothing');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('stations-sheet').open);
  await page.evaluate(() => { location.hash = 'explore'; });
  await page.waitForFunction(() => document.getElementById('explorer').open);
  await page.locator('#discovery-query').click();
  await page.keyboard.type('3');
  assert(await page.locator('#discovery-query').inputValue() === '3' && await stage() === 'palac-feel', 'a 3 typed in the Roots search stays in the search');
  await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('explorer').open);
  await page.locator('body').click({ position: { x: 4, y: 4 } });
  await page.keyboard.press('Control+1');
  assert(await stage() === 'palac-feel', 'Ctrl+1 does nothing on the page');
  // 6. Where the slider is hidden, the device sets the level: M leaves it at 1, and the hidden slider as it was.
  const hidden = () => page.evaluate(() => [document.getElementById('audio').volume, document.getElementById('volume').value, document.getElementById('volume').getAttribute('aria-valuetext')]);
  const unmoved = JSON.stringify(await hidden());
  await page.keyboard.press('m');
  assert(JSON.parse(unmoved)[0] === 1 && JSON.stringify(await hidden()) === unmoved, 'on a phone M leaves the volume to the device: ' + unmoved);

  // 5. Desktop: M puts the slider to 0 and back, stores nothing, and a reload comes back at the stored level.
  await page.setViewportSize({ width: 1440, height: 900 });
  await fresh();
  await page.locator('#volume').evaluate(slider => { slider.value = '0.6'; slider.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('body').click({ position: { x: 4, y: 4 } });
  const level = () => page.evaluate(() => { const s = document.getElementById('volume'); let stored; try { stored = localStorage.getItem('pavoia-volume'); } catch { stored = 'throws'; } return [Number(s.value), document.getElementById('audio').volume, s.getAttribute('aria-valuetext'), stored]; });
  await page.keyboard.press('m');
  let now = await level();
  assert(now[0] === 0 && now[1] === 0 && now[2] === 'Muted' && now[3] === '0.6', 'M mutes: ' + now);
  await page.keyboard.press('M');
  now = await level();
  assert(now[0] === 0.6 && now[1] === 0.6 && now[2] === null && now[3] === '0.6', 'M again brings the level back: ' + now);
  await page.keyboard.press('m');
  await page.reload();
  await page.waitForFunction(() => window.Pavoia?.getState);
  now = await level();
  assert(now[0] === 0.6 && now[1] === 0.6, 'a reload after a mute comes back at the stored level: ' + now);

  // 7. ? opens the keys under the roots, focused and in view; ? again closes them.
  await page.locator('body').click({ position: { x: 4, y: 4 } });
  await page.keyboard.press('?');
  await page.waitForFunction(() => { const s = document.getElementById('keys').getBoundingClientRect(); return s.top >= 0 && s.bottom <= innerHeight - document.querySelector('.player').offsetHeight; });
  assert(await page.evaluate(() => document.getElementById('keys').open && document.activeElement === document.querySelector('#keys summary')), '? opens the keys and focuses their summary');
  await page.keyboard.press('?');
  assert(await page.evaluate(() => !document.getElementById('keys').open && document.activeElement === document.querySelector('#keys summary')), '? again closes them, focus kept');
  assert(streams.length === 0, 'no key started a stream');
  // ? and not Tab focused the summary, so Space still plays (its stream request is aborted above) and pauses again.
  await page.keyboard.press('Space');
  assert(await wanted() && await page.evaluate(() => !document.getElementById('keys').open), 'after ? and ?, Space plays and leaves the keys closed');
  await page.keyboard.press('Space');
  assert(!(await wanted()), 'and Space pauses again');

  // 7. A touch screen sees no closed shortcuts; ? from a keyboard still opens them.
  const touch = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  try {
    await touch.route('**/stream/**', route => route.abort());
    const phone = await touch.newPage();
    await phone.goto(new URL('/?station=palac-feel', page.url()).href);
    await phone.waitForFunction(() => window.Pavoia?.getState);
    assert(await phone.locator('#keys').evaluate(keys => getComputedStyle(keys).display) === 'none', 'a touch screen does not show the closed shortcuts');
    await phone.keyboard.press('?');
    assert(await phone.locator('#keys').evaluate(keys => keys.open && getComputedStyle(keys).display !== 'none'), 'a keyboard on a touch screen still opens them');
    await phone.keyboard.press('?');
    assert(await phone.locator('#keys').evaluate(keys => !keys.open && getComputedStyle(keys).display !== 'none' && document.activeElement === keys.querySelector('summary')), '? again closes them, and the summary keeps the focus, never <body>');
    await phone.evaluate(() => document.activeElement.blur());
    assert(await phone.locator('#keys').evaluate(keys => getComputedStyle(keys).display === 'none'), 'once the focus leaves, the closed shortcuts hide again');
    await phone.keyboard.press('?');
    await phone.locator('#keys summary').tap();
    assert(await phone.locator('#keys').evaluate(keys => !keys.open && getComputedStyle(keys).display !== 'none' && document.activeElement === keys.querySelector('summary')), 'a tap on the summary closes them too, focus kept');
  } finally { await touch.close(); }
  return 'keyboard ok';
}
