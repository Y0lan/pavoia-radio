// Look without losing the music, in a real browser: while one station plays, the listener shows another by every way
// the page has, and the music goes on; the hero's play moves it there in one cut, and the bar, the lock screen, the
// address, the memory, a reconnect and a preview keep to the station heard until then. The boxes of the hero stay put.
// This check plays, so it runs only on the fake preview (python3 design/stage-direction/fakeserve.py <port>), whose
// /stream/** is a local tone that never reaches the radio: its first request asks /__mode?set=ok, and it stops unless
// the answer is "ok", in this context and in the phone context it opens. Every audio element plays at volume 0.
async page => {
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const origin = new URL(page.url()).origin;
  const guard = async p => { const answer = await (await p.request.get(origin + '/__mode?set=ok')).text(); assert(answer === 'ok', 'Not the fake preview: this check plays, so it stops before any stream request'); };
  await guard(page);
  const errors = [], consoles = [], report = {};
  // Each page logs its stream requests: when one starts and when it ends.
  const watch = p => {
    const log = [];
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => { if (m.type() === 'error') consoles.push({ text: m.text(), url: m.location().url }); });
    const path = r => new URL(r.url()).pathname;
    p.on('request', r => { if (path(r).startsWith('/stream/')) log.push(['start', path(r)]); });
    for (const end of ['requestfinished', 'requestfailed']) p.on(end, r => { if (path(r).startsWith('/stream/')) log.push(['end', path(r)]); });
    return { log, starts: () => log.filter(([kind]) => kind === 'start').length, ended: name => log.some(([kind, at]) => kind === 'end' && at === '/stream/' + name + '.mp3'),
      open: () => log.reduce((n, [kind]) => n + (kind === 'start' ? 1 : -1), 0) };
  };
  // The lock screen's handlers, kept so the check can press next and previous; and every play() the page asks for.
  const hooks = () => {
    window.__media = {}; const session = navigator.mediaSession, set = session.setActionHandler.bind(session);
    session.setActionHandler = (action, handler) => { window.__media[action] = handler; return set(action, handler); };
    window.__plays = 0; const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { if (this.id === 'audio') window.__plays++; return play.call(this); };
    window.__cut = [];
    document.addEventListener('DOMContentLoaded', () => { const audio = document.getElementById('audio');
      for (const name of ['emptied', 'playing']) audio.addEventListener(name, () => window.__cut.push([name, performance.now()])); });
  };
  const ready = async p => {
    await p.waitForFunction(() => window.Pavoia?.stations?.length === 9 && window.Pavoia.getState().dataFresh, null, { timeout: 30000 });
    await p.evaluate(() => document.fonts.ready);
    await p.locator('#audio').evaluate(audio => { audio.volume = 0; });
  };
  const visit = async (p, query = '?station=palac-feel') => {
    await p.goto(origin + '/' + query); await p.evaluate(() => { try { localStorage.clear(); } catch { /* Storage is optional. */ } });
    await p.goto(origin + '/' + query); await ready(p);
  };
  const playing = (p, id) => p.waitForFunction(id => { const s = window.Pavoia.getState(); return s.stage === id && s.playbackState === 'playing' && document.getElementById('audio').currentTime > 0; }, id, { timeout: 30000 });
  const shows = (p, id) => p.waitForFunction(id => window.Pavoia.getState().viewing === id, id, { timeout: 10000 });
  const read = p => p.evaluate(() => { const s = window.Pavoia.getState(), audio = document.getElementById('audio');
    let saved = null; try { saved = localStorage.getItem('pavoia-station'); } catch { /* Storage is optional. */ }
    return { stage: s.stage, viewing: s.viewing, apart: s.apart, wanted: s.wanted, src: audio.getAttribute('src'), current: audio.currentSrc, paused: audio.paused,
      bar: document.getElementById('player-title').textContent, door: document.getElementById('player-stage').innerText, station: new URLSearchParams(location.search).get('station'), saved,
      away: document.body.hasAttribute('data-away'), offered: !document.getElementById('play-shown').hidden, focus: document.activeElement?.id || document.activeElement?.className || '',
      plays: window.__plays, lock: [navigator.mediaSession.metadata?.title ?? null, navigator.mediaSession.metadata?.album ?? null, navigator.mediaSession.playbackState] }; });
  const blur = p => p.evaluate(() => document.activeElement?.blur());
  await page.addInitScript(hooks);
  await page.setViewportSize({ width: 1440, height: 900 });
  const desk = watch(page);

  // 2. While A plays, every way to another station shows it and asks for no stream.
  await visit(page);
  await page.locator('#play').click(); await playing(page, 'palac-feel');
  const heard = await read(page);
  const kept = async (log, p, what, id, base) => {
    const before = log.starts(); await shows(p, id); await p.waitForTimeout(800);
    const s = await read(p);
    assert(log.starts() === before && s.current === base.current && !s.paused && s.bar === base.bar && s.stage === base.stage && s.apart === (id !== base.stage),
      `2: ${what} moved the music: ${JSON.stringify({ streams: log.log.slice(-4), s, base })}`);
    return `${what}: ${log.starts() - before} new stream requests, src ${s.current.split('/').pop()}, playing, bar "${s.bar}"`;
  };
  const ways = [];
  let before;
  await page.locator('label.mood:has(input[value="06"])').click(); ways.push(await kept(desk, page, 'the rail (1440)', 'etage-zero', heard));
  await blur(page); await page.keyboard.press('2'); ways.push(await kept(desk, page, 'key 2', 'bermuda-evening', heard));
  await blur(page); await page.keyboard.press('ArrowRight'); ways.push(await kept(desk, page, 'the page\'s ArrowRight', 'palac-dance', heard));
  await blur(page); await page.keyboard.press('1'); await shows(page, 'bermuda-day');
  await page.keyboard.press('Shift'); await page.locator('#moods input:checked').focus(); await page.keyboard.press('ArrowRight');
  ways.push(await kept(desk, page, 'ArrowRight on a focused rail radio', 'bermuda-evening', heard));
  // 6. Lock screen: the metadata, the album and the state stay the station heard.
  let s = await read(page);
  assert(s.lock[0] === heard.lock[0] && s.lock[1] === 'Lost in Feelings · Pałac' && s.lock[2] === 'playing', '6: the lock screen left the station heard: ' + JSON.stringify(s.lock));
  report.lockApart = s.lock;
  // 9. Apart: the address names the station shown, the memory the station heard.
  assert(s.station === 'bermuda-evening' && s.saved === 'palac-feel', '9: apart, ?station and pavoia-station: ' + JSON.stringify([s.station, s.saved]));
  report.addressApart = [s.station, s.saved];

  // 3. The lock screen's next steps from the station heard and plays it, in one cut.
  before = desk.starts();
  await page.evaluate(() => window.__media.nexttrack({ action: 'nexttrack' })); await playing(page, 'etage-zero');
  for (let i = 0; i < 40 && !desk.ended('palac-feel'); i++) await page.waitForTimeout(50);
  s = await read(page);
  assert(desk.starts() - before === 1 && desk.ended('palac-feel') && s.src === '/stream/etage-zero.mp3' && s.viewing === 'etage-zero', '3: nexttrack: ' + JSON.stringify({ streams: desk.log.slice(-4), s }));
  report.nexttrack = `${desk.starts() - before} new stream request, palac-feel ended, src ${s.src}, lock screen ${JSON.stringify(s.lock)}`;
  await page.evaluate(() => window.__media.previoustrack({ action: 'previoustrack' })); await playing(page, 'palac-feel');
  await page.evaluate(() => window.__media.nexttrack({ action: 'nexttrack' })); await playing(page, 'etage-zero');
  // Paused while the station after the one heard shows, next tunes the bar and the lock screen to it, and plays nothing.
  await blur(page); await page.keyboard.press('ArrowRight'); await shows(page, 'fontanna');
  await page.locator('#play').click(); await page.waitForFunction(() => !window.Pavoia.getState().wanted);
  before = desk.starts(); const playsBefore = (await read(page)).plays;
  await page.evaluate(() => window.__media.nexttrack({ action: 'nexttrack' })); await page.waitForTimeout(400);
  s = await read(page); const album = await page.evaluate(() => window.Pavoia.getState().album);
  assert(desk.starts() === before && s.plays === playsBefore && s.paused && !s.wanted && s.stage === 'fontanna' && !s.apart && s.lock[1] === album && album !== 'Etage 0' && s.lock[2] === 'paused' && s.saved === 'fontanna',
    '3: paused apart, nexttrack to the station shown: ' + JSON.stringify({ streams: desk.log.slice(-4), s, album }));
  report.pausedNext = `paused apart: ${desk.starts() - before} stream requests, ${s.plays - playsBefore} play() calls, bar and lock screen on ${s.stage} (${JSON.stringify(s.lock)})`;
  await page.locator('#play').click(); await playing(page, 'fontanna');
  await page.evaluate(() => window.__media.previoustrack({ action: 'previoustrack' })); await playing(page, 'etage-zero');

  // 4 and 5. One press on the hero's play is one cut to the station shown, and gives focus to Play.
  await page.locator('label.mood:has(input[value="03"])').click(); await shows(page, 'palac-dance');
  await page.waitForFunction(() => !document.getElementById('play-shown').hidden && !/Loading/.test(document.getElementById('play-shown-text').textContent));
  report.offer = await page.evaluate(() => [document.getElementById('play-shown-text').textContent, document.getElementById('play-shown').getAttribute('aria-label')]);
  // A key first, so the focus shows its ring as a keyboard user sees it.
  await page.keyboard.press('Shift'); await page.locator('#play-shown').focus();
  assert(await page.evaluate(() => document.getElementById('play-shown').matches(':focus-visible')), '5: the hero\'s play shows no focus ring');
  await page.screenshot({ path: 'output/playwright/apart/b3-play-shown-focus-1440.png' });
  before = desk.starts(); await page.evaluate(() => { window.__cut = []; });
  await page.locator('#play-shown').click(); await playing(page, 'palac-dance');
  for (let i = 0; i < 40 && !desk.ended('etage-zero'); i++) await page.waitForTimeout(50);
  await page.waitForTimeout(1000);
  s = await read(page);
  const cut = await page.evaluate(() => { const drop = window.__cut.find(([n]) => n === 'emptied'), back = window.__cut.find(([n, t]) => n === 'playing' && drop && t >= drop[1]); return drop && back ? Math.round(back[1] - drop[1]) : null; });
  assert(desk.starts() - before === 1 && desk.ended('etage-zero') && desk.open() === 1 && s.src === '/stream/palac-dance.mp3', '4: the press: ' + JSON.stringify({ streams: desk.log.slice(-4), open: desk.open(), s }));
  assert(!s.offered && !s.away && s.focus === 'play', '5: after the press: ' + JSON.stringify(s));
  assert(s.station === 'palac-dance' && s.saved === 'palac-dance', '9: after the press, ?station and pavoia-station: ' + JSON.stringify([s.station, s.saved]));
  report.press = { newStreams: desk.starts() - before, oldEnded: true, openAfter1s: desk.open(), src: s.src, emptiedToPlayingMs: cut, offered: s.offered, away: s.away, focus: s.focus, address: [s.station, s.saved] };
  await page.screenshot({ path: 'output/playwright/apart/b3-after-press-1440.png' });

  // 6. The door and the cover show the station heard in one press, with no stream request, also behind the explorer.
  const back = [];
  for (const [what, target] of [['the door', '#player-stage .stage-door'], ['the cover', '.dock-artwork']]) {
    await page.locator('label.mood:has(input[value="07"])').click(); await shows(page, 'fontanna');
    before = desk.starts(); await page.locator(target).click(); await shows(page, 'palac-dance'); await page.waitForTimeout(400);
    s = await read(page); assert(desk.starts() === before && !s.apart && !s.paused, `6: ${what}: ` + JSON.stringify(s));
    back.push(`${what}: 0 stream requests, back on ${s.viewing}`);
  }
  // #play and Space pause the station heard in one press while another shows; play resumes it.
  await page.locator('label.mood:has(input[value="07"])').click(); await shows(page, 'fontanna');
  await page.waitForFunction(() => !/Loading/.test(document.getElementById('play-shown-text').textContent));
  const widths = [];
  const wave = () => page.evaluate(() => document.getElementById('waveform').getBoundingClientRect().width);
  widths.push(await wave());
  await page.locator('#play').click(); s = await read(page);
  assert(!s.wanted && s.paused && s.stage === 'palac-dance' && s.viewing === 'fontanna' && /night in motion/i.test(s.door) && s.offered, '6: #play while apart: ' + JSON.stringify(s));
  widths.push(await wave());
  await page.screenshot({ path: 'output/playwright/apart/b3-paused-apart-1440.png' });
  await page.locator('#play').click(); await playing(page, 'palac-dance'); s = await read(page);
  assert(s.src === '/stream/palac-dance.mp3' && s.viewing === 'fontanna', '6: play while apart resumes the station heard: ' + JSON.stringify(s));
  await blur(page); await page.keyboard.press('Space'); s = await read(page);
  assert(!s.wanted && s.stage === 'palac-dance' && s.lock[2] === 'paused' && s.lock[1] === 'Night in Motion · Pałac', '6: Space while apart: ' + JSON.stringify(s));
  await page.keyboard.press('Space'); await playing(page, 'palac-dance');
  back.push('#play and Space pause the station heard in one press, and play resumes it');
  await page.locator('#go-deeper').click(); await page.locator('.explorer-nav a[href^="#history"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#music-content > .row').length > 0 && !document.getElementById('music-content').hasAttribute('aria-busy'), null, { timeout: 20000 });
  const now = () => page.evaluate(() => [location.hash, document.querySelectorAll('#music-content > .row[aria-current]').length]);
  report.historyApart = { bare: await now() };
  assert(report.historyApart.bare[0] === '#history/fontanna', 'a bare History while apart opens the station shown: ' + report.historyApart.bare);
  await page.locator('#stage-row a[href^="#history/palac-dance"]').click();
  await page.waitForFunction(() => location.hash === '#history/palac-dance' && !document.getElementById('music-content').hasAttribute('aria-busy') && document.querySelectorAll('#music-content > .row').length > 0, null, { timeout: 20000 });
  report.historyApart.heard = await now();
  await page.screenshot({ path: 'output/playwright/apart/b3-explorer-apart-1440.png' });
  for (const [what, target] of [['the door behind the explorer', '#player-stage .stage-door'], ['the cover behind the explorer', '.dock-artwork']]) {
    if (what.includes('cover')) { await page.evaluate(() => { document.querySelector('input[value="07"]').checked = true; document.querySelector('input[value="07"]').dispatchEvent(new Event('change', { bubbles: true })); }); await shows(page, 'fontanna'); }
    before = desk.starts(); await page.locator(target).click(); await shows(page, 'palac-dance'); await page.waitForTimeout(400);
    s = await read(page);
    assert(desk.starts() === before && !s.apart && await page.locator('#explorer').evaluate(d => d.open), `6: ${what}: ` + JSON.stringify(s));
    back.push(`${what}: 0 stream requests, the explorer stays open`);
  }
  await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.getElementById('explorer').open);
  report.back = back;

  // 7. Paused, a change starts nothing, and play then plays the station shown.
  await page.locator('#play').click(); const plays = (await read(page)).plays; before = desk.starts();
  await page.locator('label.mood:has(input[value="08"])').click(); await shows(page, 'ambiance'); await page.waitForTimeout(600);
  s = await read(page);
  assert(s.plays === plays && desk.starts() === before && s.stage === 'ambiance' && !s.apart, '7: a change while paused: ' + JSON.stringify(s));
  await page.locator('#play').click(); await playing(page, 'ambiance');
  report.paused = `0 play() calls and 0 stream requests on a change; play then plays ${(await read(page)).src}`;

  // 8. With the station heard lost and another shown, the retries connect the station heard.
  await page.locator('label.mood:has(input[value="02"])').click(); await shows(page, 'bermuda-evening');
  const from = desk.log.length;
  await page.request.get(origin + '/__mode?set=close');
  await page.waitForFunction(() => window.Pavoia.getState().playbackState === 'retrying', null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'output/playwright/apart/b3-reconnecting-apart-1440.png' });
  assert((await page.request.get(origin + '/__mode?set=ok').then(r => r.text())) === 'ok', 'the fake did not go back to ok');
  await playing(page, 'ambiance'); s = await read(page);
  const retried = desk.log.slice(from).filter(([kind]) => kind === 'start').map(([, at]) => at);
  assert(retried.length > 0 && retried.every(at => at === '/stream/ambiance.mp3') && s.viewing === 'bermuda-evening' && s.src === '/stream/ambiance.mp3', '8: the retries: ' + JSON.stringify({ retried, s }));
  report.reconnect = `${retried.length} retries, all ${retried[0]}, while ${s.viewing} shows`;

  // A preview holds the radio: a station change keeps the preview, and its end gives the radio back to the station heard.
  // The rail is inert behind the explorer, so the change is the rail's own change event, sent by script.
  const wav = seconds => { const rate = 8000, n = rate * seconds, b = Buffer.alloc(44 + n); b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
    b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40); b.fill(128, 44); return b; };
  // An id of its own, so the explorer asks for it, rather than the record on air it may hold already.
  const record = { entity: { id: 'trk_00000000beef', type: 'track', title: 'Preview stand-in', artist: 'Stand-in', previewUrl: '/api/discovery/preview/trk_00000000beef', connections: [] }, included: [] };
  const discovery = route => { const p = new URL(route.request().url()).pathname;
    if (p === '/api/discovery/preview/trk_00000000beef') return route.fulfill({ contentType: 'audio/wav', body: wav(5) });
    if (p.startsWith('/api/discovery/entity/')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify(record) });
    return route.fallback(); };
  await page.route('**/api/discovery/**', discovery);
  await page.evaluate(() => { location.hash = '#explore/trk_00000000beef'; });
  await page.locator('.preview-toggle').click({ timeout: 20000 });
  await page.locator('#preview-audio').evaluate(a => { a.volume = 0; });
  await page.waitForFunction(() => !document.getElementById('preview-audio').paused && !window.Pavoia.getState().wanted, null, { timeout: 10000 });
  await page.evaluate(() => { const input = document.querySelector('input[value="06"]'); input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); });
  await shows(page, 'etage-zero'); s = await read(page);
  const previewOn = await page.locator('#preview-audio').evaluate(a => !a.paused && Boolean(a.getAttribute('src')));
  assert(previewOn && !s.wanted && s.stage === 'ambiance' && s.apart, 'a change during a preview: ' + JSON.stringify({ previewOn, s }));
  await page.waitForFunction(() => window.Pavoia.getState().wanted, null, { timeout: 20000 }); await playing(page, 'ambiance'); s = await read(page);
  assert(s.src === '/stream/ambiance.mp3' && s.viewing === 'etage-zero', 'the end of the preview: ' + JSON.stringify(s));
  report.preview = `a change kept the preview playing; its end played ${s.src} while ${s.viewing} shows`;
  await page.unroute('**/api/discovery/**', discovery);
  await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.getElementById('explorer').open);

  // 12. /api/radio/<id> per 10 s tick: two while apart, one while the page shows the station heard.
  const ticks = async () => { const at = []; const seen = r => { if (/^\/api\/radio\/[a-z-]+$/.test(new URL(r.url()).pathname)) at.push([Date.now(), new URL(r.url()).pathname.split('/').pop()]); };
    page.on('request', seen); await page.waitForTimeout(31500); page.off('request', seen);
    const groups = []; for (const [t, id] of at) { if (!groups.length || t - groups.at(-1).t > 4000) groups.push({ t, ids: [] }); groups.at(-1).ids.push(id); groups.at(-1).t = t; }
    return groups.map(g => g.ids.sort().join('+')); };
  const apartTicks = await ticks();
  await page.locator('label.mood:has(input[value="08"])').click(); await shows(page, 'ambiance'); await page.waitForTimeout(3000);
  const sameTicks = await ticks();
  assert(apartTicks.length >= 3 && apartTicks.every(t => t === 'ambiance+etage-zero'), '12: apart ticks: ' + JSON.stringify(apartTicks));
  assert(sameTicks.length >= 3 && sameTicks.every(t => t === 'ambiance'), '12: same ticks: ' + JSON.stringify(sameTicks));
  report.ticks = { apart: apartTicks, same: sameTicks };

  // 10 and 11. The boxes of the hero, the station shown (Night in Motion) heard, then apart (Lost in Feelings heard), then
  // after the press, then paused; and the waveform across a pause while apart. A long track on the station shown ends in "…".
  const LONG = 'An Extended Club Mix of a Very Long Track Title That Keeps Going Past the Edge of the Hero Block (Remastered Edition 2026)';
  let long = false;
  const radio = route => long ? route.fulfill({ contentType: 'application/json', body: JSON.stringify({ stage: { id: 'palac-dance' }, track: { id: 'long0001', title: LONG, artist: 'Artist' }, audience: { available: false } }) }) : route.fallback();
  await page.route(/\/api\/radio\/palac-dance$/, radio);
  const boxes = () => page.evaluate(() => { scrollTo(0, 0); const y = id => +document.getElementById(id).getBoundingClientRect().y.toFixed(2), r = el => el.getBoundingClientRect();
    const span = document.getElementById('play-shown-text');
    return { eyebrow: y('mood-stage'), eyebrowH: +r(document.getElementById('mood-stage')).height.toFixed(2), title: y('mood-name'), place: y('mood-place'), rail: y('station-selector'), controls: y('station-controls'),
      bottom: +r(document.querySelector('.bottom')).width.toFixed(2), wave: +r(document.getElementById('waveform')).width.toFixed(2),
      cut: span.scrollWidth > span.clientWidth && getComputedStyle(span).textOverflow === 'ellipsis', text: span.textContent }; });
  const same = (a, b, keys) => keys.every(k => Math.abs(a[k] - b[k]) <= .5);
  const layout = [];
  for (const [width, height] of [[1440, 900], [1100, 800], [390, 844], [360, 740]]) {
    for (const lang of ['en', 'de']) {
      for (const withLong of width > 760 ? [false, true] : [false]) {
        long = withLong;
        await page.setViewportSize({ width, height });
        await visit(page, '?station=palac-dance');
        await page.locator('#language [value=' + lang + ']').dispatchEvent('click');
        await page.locator('#play').click(); await playing(page, 'palac-dance'); await page.waitForTimeout(300);
        const heardBox = await boxes();
        await page.locator('#play').click(); await page.waitForTimeout(300);
        const idle = await boxes();
        await page.evaluate(() => { const input = document.querySelector('input[value="04"]'); input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); });
        await page.locator('#play').click(); await playing(page, 'palac-feel');
        await page.evaluate(() => { const input = document.querySelector('input[value="03"]'); input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true })); });
        await shows(page, 'palac-dance');
        await page.waitForFunction(() => !document.getElementById('play-shown').hidden && !/Loading|Titel wird/.test(document.getElementById('play-shown-text').textContent), null, { timeout: 15000 });
        await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(300);
        const apartBox = await boxes();
        if (!withLong) { const name = { 1440: 'b3-apart-1440', 1100: 'b3-apart-1100', 390: 'b3-apart-390', 360: 'b3-apart-360' }[width] + (lang === 'de' ? '-de' : '');
          if ((width === 1440 || width === 390) === (lang === 'en')) await page.screenshot({ path: `output/playwright/apart/${name}.png` }); }
        else if ((width === 1440) === (lang === 'en')) await page.screenshot({ path: `output/playwright/apart/b3-apart-long-${width}${lang === 'de' ? '-de' : ''}.png` });
        await page.locator('#play').click(); await page.waitForTimeout(300);
        const pausedApart = await boxes();
        await page.locator('#play-shown').click(); const pressed = await boxes(); await playing(page, 'palac-dance');
        if (!withLong && width === 390 && lang === 'en') await page.screenshot({ path: 'output/playwright/apart/b3-after-press-390.png' });
        const keys = width > 760 ? ['eyebrow', 'eyebrowH', 'title', 'place', 'rail'] : ['eyebrow', 'eyebrowH', 'controls'];
        const states = { heard: heardBox, idle, apart: apartBox, pressed };
        const moved = Object.entries(states).filter(([, b]) => !same(b, heardBox, keys)).map(([k]) => k);
        assert(!moved.length, `10: the hero moved at ${width} ${lang}${withLong ? ' with a long title' : ''}: ` + JSON.stringify(states));
        assert(Math.abs(apartBox.wave - pausedApart.wave) <= .5, `11: a pause while apart moved the waveform at ${width} ${lang}: ${apartBox.wave} then ${pausedApart.wave}`);
        if (withLong) assert(Math.abs(apartBox.bottom - idle.bottom) <= .5 && apartBox.cut, `10: a long title at ${width} ${lang}: .bottom ${apartBox.bottom} against ${idle.bottom}, cut ${apartBox.cut}`);
        layout.push(`${width} ${lang}${withLong ? ' long' : ''}: ` + keys.map(k => `${k} ${heardBox[k]}`).join(', ') + ` in all four states; .bottom ${idle.bottom}/${apartBox.bottom}; waveform ${apartBox.wave}/${pausedApart.wave} across a pause` + (withLong ? `; ends in an ellipsis: ${apartBox.cut}` : ''));
        await page.locator('#play').click();
      }
    }
  }
  long = false; await page.unroute(/\/api\/radio\/palac-dance$/, radio);
  report.layout = layout; report.waveform1440 = widths;

  // 2, on a phone: the sheet and a swipe show a station and ask for no stream; the Bus keeps the sound and hides the play.
  const context = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const m = await context.newPage(); await guard(m); await m.addInitScript(hooks); const phone = watch(m);
    await visit(m); await m.locator('#play').tap(); await playing(m, 'palac-feel');
    const base = await read(m);
    await m.locator('#open-stations').tap(); await m.waitForFunction(() => document.getElementById('stations-sheet').open);
    await m.locator('#stations-sheet label.mood:has(input[value="06"])').tap();
    await m.waitForFunction(() => !document.getElementById('stations-sheet').open);
    ways.push(await kept(phone, m, 'the sheet (390)', 'etage-zero', base));
    await m.locator('#open-stations').tap(); await m.waitForFunction(() => document.getElementById('stations-sheet').open);
    await m.waitForTimeout(400); await m.screenshot({ path: 'output/playwright/apart/b3-sheet-apart-390.png' });
    await m.locator('#close-stations').tap(); await m.waitForFunction(() => !document.getElementById('stations-sheet').open);
    const cdp = await context.newCDPSession(m);
    await m.evaluate(() => scrollTo(0, 0)); const [x, y] = [280, 220];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 6; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - 160 * step / 6, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    ways.push(await kept(phone, m, 'a swipe (390)', 'fontanna', base));
    await m.evaluate(() => { location.hash = '#bus'; }); await m.waitForFunction(() => document.body.hasAttribute('data-bus'));
    s = await read(m);
    assert(!s.offered && !s.paused && s.stage === 'palac-feel' && phone.starts() === 1, 'the Bus: ' + JSON.stringify(s));
    await m.screenshot({ path: 'output/playwright/apart/b3-bus-apart-390.png' });
    await m.locator('#play').tap();
  } finally { await context.close(); }
  report.ways = ways;

  // The Bus at 1440 while playing: the door leads back, and the hero's play hides.
  await page.setViewportSize({ width: 1440, height: 900 });
  await visit(page); await page.locator('#play').click(); await playing(page, 'palac-feel');
  await page.locator('label.mood:has(input[value="03"])').click(); await shows(page, 'palac-dance');
  await page.evaluate(() => { location.hash = '#bus'; }); await page.waitForFunction(() => document.body.hasAttribute('data-bus'));
  s = await read(page); assert(!s.offered && s.away && /lost in feelings/i.test(s.door), 'the Bus at 1440: ' + JSON.stringify(s));
  await page.waitForTimeout(600); await page.screenshot({ path: 'output/playwright/apart/b3-bus-apart-1440.png' });
  await page.locator('#play').click();

  // 13. No page error and no console error, apart from the stream requests the close mode refused on purpose.
  const refused = consoles.filter(c => /\/stream\/.*\.mp3/.test(c.url) || /503/.test(c.text) && /stream/.test(c.url));
  const other = consoles.filter(c => !refused.includes(c));
  assert(!errors.length && !other.length, '13: ' + JSON.stringify({ errors, other }));
  report.errors = { page: errors.length, console: other.length, refusedStreams: refused.length };
  return JSON.stringify(report);
}
