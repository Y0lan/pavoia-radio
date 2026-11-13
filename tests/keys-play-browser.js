// A number key on a playing radio: the station at that place on screen plays, and only one stream is open at a time.
// This check plays, so it runs only on the fake preview (/var/tmp/yolan/ultimate/player/fakeserve.py), whose
// /stream/** is a local tone that is never relayed: its first action asks /__mode?set=ok, and it stops unless the answer
// is "ok". On serve.py or the live site that address is not "ok", so the check never counts as a listener.
async page => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const origin = new URL(page.url()).origin;
  const answer = await (await page.request.get(origin + '/__mode?set=ok')).text();
  if (answer !== 'ok') throw new Error('not the fake preview, so nothing plays: ' + answer.slice(0, 60));
  const events = [];
  const stream = url => new URL(url).pathname.startsWith('/stream/') ? new URL(url).pathname : null;
  page.on('request', request => { if (stream(request.url())) events.push(['start', stream(request.url())]); });
  page.on('requestfailed', request => { if (stream(request.url())) events.push(['end', stream(request.url())]); });
  page.on('requestfinished', request => { if (stream(request.url())) events.push(['end', stream(request.url())]); });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(origin + '/?station=palac-feel');
  await page.waitForFunction(() => window.Pavoia?.getState);
  if (await page.locator('#ways button[value=stage]').getAttribute('aria-pressed') !== 'true') await page.evaluate(() => document.querySelector('#ways button[value=stage]').click());
  await page.locator('#audio').evaluate(audio => { audio.volume = 0; });
  await page.locator('body').click({ position: { x: 4, y: 4 } });
  const playing = id => page.waitForFunction(id => { const s = window.Pavoia.getState(); return s.stage === id && s.playbackState === 'playing' && document.getElementById('audio').currentTime > 0; }, id, { timeout: 20000 });
  await page.keyboard.press('Space');
  await playing('palac-feel');
  // The page drops the old source (no src, then load()) before it sets the new one, as the rail does. The browser reports the network
  // side in its own order, so the requests are only counted, and the old one must end.
  await page.locator('#audio').evaluate(audio => {
    window.keysMedia = [];
    const load = audio.load.bind(audio), src = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
    audio.load = () => { window.keysMedia.push('load:' + (audio.getAttribute('src') || '')); load(); };
    Object.defineProperty(audio, 'src', { configurable: true, get: () => src.get.call(audio), set: value => { window.keysMedia.push('src:' + new URL(value, location.href).pathname); src.set.call(audio, value); } });
  });
  await page.keyboard.press('2');
  await playing('bermuda-evening');
  assert(await page.locator('#audio').getAttribute('src') === '/stream/bermuda-evening.mp3', '2 plays the second station by stage');
  const media = await page.evaluate(() => window.keysMedia);
  assert(media.at(-1) === 'src:/stream/bermuda-evening.mp3' && media.length > 1 && media.slice(0, -1).every(step => step === 'load:'), 'the old source is dropped before the new one is set: ' + JSON.stringify(media));
  for (let i = 0; i < 40 && !events.some(([kind, path]) => kind === 'end' && path === '/stream/palac-feel.mp3'); i++) await page.waitForTimeout(50);
  assert(events.some(([kind, path]) => kind === 'end' && path === '/stream/palac-feel.mp3'), 'the old stream request ended: ' + JSON.stringify(events));
  assert(events.filter(([kind]) => kind === 'start').length === 2, 'one request per station: ' + JSON.stringify(events));
  await page.keyboard.press('Space');
  await page.waitForFunction(() => !window.Pavoia.getState().wanted);
  return JSON.stringify({ result: 'keys play ok', media, events });
}
