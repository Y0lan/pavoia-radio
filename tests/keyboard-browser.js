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
  await page.keyboard.press('Escape');
  return 'keyboard ok';
}
