async (page) => {
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const root = 'https://pavoia.gaende.box.ca/';
  const choose = async id => { if(await page.locator('#open-stations').isVisible())await page.locator('#open-stations').click(); await page.locator(`input[name="mood"][value="${id}"]`).check(); };
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (page.url() !== root) await page.goto(root);
  await page.locator('#language').selectOption('en');
  await page.waitForFunction(() => /^Live/.test(document.getElementById('live-text').textContent));
  assert(await page.locator('#audio').getAttribute('src') === null, 'Must not autoplay');
  const live = [];
  try {
    for (const [id, stage] of [['04', 'palac-feel'], ['03', 'palac-dance'], ['01', 'bermuda-day'], ['02', 'bermuda-evening'], ['05', 'essentials'], ['06', 'etage-zero'], ['07', 'fontanna'], ['08', 'ambiance'], ['09', 'closing']]) {
      await choose(id);
      if (await page.locator('#play').getAttribute('aria-pressed') !== 'true') await page.locator('#play').click();
      await page.waitForFunction(() => document.querySelector('.player').dataset.state === 'playing', { timeout: 30000 });
      await page.waitForFunction(() => document.getElementById('audio').currentTime > 1);
      assert((await page.locator('#audio').getAttribute('src')) === `/stream/${stage}.mp3`, 'Wrong stream');
      await page.waitForFunction(() => /^Live/.test(document.getElementById('live-text').textContent));
      const seconds = await page.locator('#audio').evaluate(a => a.currentTime);
      const title = await page.locator('#player-title').innerText();
      const expectedCover = await page.evaluate(() => Boolean(track?.coverUrl));
      if (expectedCover) await page.waitForFunction(() => [...document.querySelectorAll('#hero-cover,#dock-cover')].some(i => i.complete && i.naturalWidth > 0 && !i.hidden));
      live.push({ stage, title, decodedSeconds: seconds, coverLoaded: expectedCover });
    }
    await page.locator('#language').selectOption('de');
    assert(await page.locator('#play').getAttribute('aria-label') === 'Pause', 'Language switch lost playback state');
    assert(await page.locator('#playback-status').textContent() === 'Wiedergabe', 'Playback status not translated');
    assert(await page.locator('html').getAttribute('lang') === 'de', 'Document language not changed');
    await page.locator('#play').click();
    assert(await page.locator('#audio').getAttribute('src') === null, 'Pause did not release stream');
    await page.locator('#language').selectOption('en');
    await choose('04');
    assert(await page.locator('#audio').getAttribute('src') === null, 'Paused mood change played audio');
    await page.waitForFunction(() => /^Live/.test(document.getElementById('live-text').textContent));
    for (const width of [320, 390, 760, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow ${width}: ${await page.evaluate(()=>[...document.querySelectorAll("body *")].filter(e=>e.getBoundingClientRect().right>innerWidth).map(e=>e.id || e.className).join(","))}`);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: 'stage-live-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'stage-live-mobile.png', fullPage: true });
    await page.locator('#language').selectOption('de');
    for (const width of [320, 390, 760, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `German overflow ${width}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'stage-live-mobile-de.png', fullPage: true });
    await page.reload();
    assert(await page.locator('html').getAttribute('lang') === 'de', 'Language preference not retained');
    await page.locator('#language').selectOption('en');

  } finally {
    await page.evaluate(() => pause());
  }

  // Exercise races and failures without opening real listener connections.
  await page.addInitScript(() => {
    window.attempts = [];
    Object.defineProperty(HTMLMediaElement.prototype, 'paused', { get() { return this._paused !== false; } });
    Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { get() { return 4; } });
    HTMLMediaElement.prototype.pause = function () { this._paused = true; };
    HTMLMediaElement.prototype.load = function () {};
    HTMLMediaElement.prototype.play = function () {
      this._paused = false;
      window.attempts.push(this.getAttribute('src'));
      return new Promise((resolve, reject) => { window.lastResolve = resolve; window.lastReject = reject; });
    };
  });
  let failure = false;
  let staleAudience = false;
  let heldResolve;
  let hold = false;
  let sequence = 0;
  const payload = stage => ({
    stage: { id: stage },
    track: { id: String(++sequence), title: `Actual track ${sequence}`, artist: `Actual artist ${sequence}` },
    audience: { available: true, listeners: 7, measuredAt: new Date(Date.now() - (staleAudience ? 120000 : 0)).toISOString() },
  });
  await page.route('**/api/radio/*', async route => {
    if (hold) {
      hold = false;
      await new Promise(resolve => { heldResolve = resolve; });
    }
    await route.fulfill({ status: failure ? 503 : 200, contentType: 'application/json', body: JSON.stringify(payload(route.request().url().split('/').pop())) }).catch(() => {});
  });
  await page.route('**/api/audience?**', route => route.fulfill({json: payload('').audience}));
  await page.reload();
  await page.waitForFunction(() => document.getElementById('live-text').textContent === 'Live · 7');
  const first = await page.locator('#player-title').innerText();
  await page.evaluate(() => poll());
  assert(await page.locator('#player-title').innerText() !== first, 'Track did not advance');
  assert(await page.locator('.track-images img').count() === 0, 'Unrelated portrait displayed');
  staleAudience = true;
  await page.evaluate(() => pollListeners());
  assert(await page.locator('#live-text').textContent() === 'Live', 'Stale audience shown as current');
  failure = true;
  await page.evaluate(() => poll());
  assert(!await page.evaluate(() => window.Pavoia.getState().dataFresh) && await page.evaluate(() => navigator.mediaSession.metadata === null), 'Failed status restored stale metadata');
  failure = false;

  hold = true;
  await page.evaluate(() => { poll(); });
  await page.waitForTimeout(100);
  await choose('03');
  await page.waitForFunction(() => document.getElementById('live-text').textContent === 'Live');
  const latest = await page.locator('#player-title').innerText();
  assert(Boolean(heldResolve), 'Race request not captured');
  heldResolve();
  await page.waitForTimeout(100);
  assert(await page.locator('#player-title').innerText() === latest, 'Stale station response overwrote current track');

  await page.locator('#play').click();
  await page.evaluate(() => { window.oldReject = window.lastReject; });
  await choose('04');
  await page.evaluate(() => window.oldReject(Object.assign(new Error('Old request'), { name: 'NotAllowedError' })));
  assert(await page.locator('#play').getAttribute('aria-pressed') === 'true', 'Old audio error stopped new station');
  await page.evaluate(() => document.getElementById('audio').dispatchEvent(new Event('playing')));
  assert(await page.locator('#playback-status').innerText() === 'Playing', 'Playing state missing');
  await page.locator('#play').click();
  assert(await page.locator('#audio').getAttribute('src') === null, 'Mock pause did not release source');
  await page.locator('#play').click();
  await page.evaluate(() => window.lastReject(Object.assign(new Error('Blocked'), { name: 'NotAllowedError' })));
  await page.waitForFunction(() => document.getElementById('playback-status').textContent === 'Tap to play');
  assert(await page.locator('#play').getAttribute('aria-pressed') === 'false', 'Blocked play must need a new gesture');
  await page.locator('#play').click();
  await page.evaluate(() => document.getElementById('audio').dispatchEvent(new Event('ended')));
  await page.waitForFunction(() => document.getElementById('playback-status').textContent === 'Reconnecting');
  await page.locator('#play').click();
  await page.waitForTimeout(1200);
  assert(await page.locator('#audio').getAttribute('src') === null, 'Pause failed to cancel retry');
  assert(errors.length === 0, errors.join('; '));
  return { live, simulatedChecks: 'track updates, missing portraits, stale audience, stale metadata, response races, audio races, blocked playback, retry cancellation', widths: [320, 390, 760, 1440], pageErrors: errors };
}
