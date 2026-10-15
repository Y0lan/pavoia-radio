'use strict';

// The collection reads the same committed catalogue as the player. It never selects audio.
(() => {
  const copy = {
    en: { scope:'Search in', radioScope:'This radio selection', libraryScope:'Entire music library', libraryUpdated:'Catalogue updated', libraryTotal:'tracks in the library', changesTitle:'How the selection changes', changesNote:"Additions and removals observed in this radio's playable selection. Dates show when the radio noticed a change, not when the playlist was edited. Earlier history is unknown.", changesSince:'Tracking since', changesEmpty:'No changes observed since tracking began.', changesPending:'Waiting for the first successful synchronization.', changesFailed:'Selection history is unavailable. Try Refresh again.', added:'Added', removed:'Removed',
      collection:'Collection', browse:'Explore the selection', searchLabel:'Track, artist or album', search:'Search', more:'Show more',
      loading:'Loading', empty:'No matching tracks in this selection.', failed:'The catalogue is unavailable. Try Search again.',
      loaded:'tracks shown', tooLong:'Use a shorter search (maximum 200 bytes).',
      audienceTitle:'Listening together', refresh:'Refresh', date:'Date (UTC)', peak:'Peak connections', hours:'Listening hours', observed:'Hours measured',
      audienceNote:'Audio connections, not unique people. Test listeners are included. Listening hours are estimates; gaps remain unknown.',
      audienceFailed:'Audience history is unavailable. Try Refresh again.', noHistory:'No measurements yet.', recent:'Latest 30 measured days', unknown:'Unknown' },
    de: { scope:'Suchbereich', radioScope:'Diese Radioauswahl', libraryScope:'Gesamte Musikbibliothek', libraryUpdated:'Sammlung aktualisiert', libraryTotal:'Tracks in der Bibliothek', changesTitle:'Wie sich die Auswahl verändert', changesNote:'Beobachtete Zu- und Abgänge in der spielbaren Radioauswahl. Das Datum zeigt, wann das Radio eine Änderung erkannt hat, nicht wann die Playlist bearbeitet wurde. Frühere Änderungen sind unbekannt.', changesSince:'Erfasst seit', changesEmpty:'Seit Beginn der Erfassung wurden keine Änderungen beobachtet.', changesPending:'Die erste erfolgreiche Synchronisierung steht noch aus.', changesFailed:'Der Verlauf ist nicht verfügbar. Bitte erneut aktualisieren.', added:'Hinzugefügt', removed:'Entfernt',
      collection:'Sammlung', browse:'Die Auswahl entdecken', searchLabel:'Track, Künstler oder Album', search:'Suchen', more:'Mehr anzeigen',
      loading:'Wird geladen', empty:'Keine passenden Tracks in dieser Auswahl.', failed:'Die Sammlung ist nicht verfügbar. Bitte erneut suchen.',
      loaded:'Tracks angezeigt', tooLong:'Bitte kürzer suchen (höchstens 200 Bytes).',
      audienceTitle:'Gemeinsam hören', refresh:'Aktualisieren', date:'Datum (UTC)', peak:'Verbindungen maximal', hours:'Hörstunden', observed:'Erfasste Stunden',
      audienceNote:'Audioverbindungen, keine einzelnen Personen. Testverbindungen sind enthalten. Hörstunden sind Schätzungen; Lücken bleiben unbekannt.',
      audienceFailed:'Der Hörverlauf ist nicht verfügbar. Bitte erneut aktualisieren.', noHistory:'Noch keine Messungen.', recent:'Letzte 30 erfasste Tage', unknown:'Unbekannt' },
  };
  const word = key => copy[language][key];
  let rows = [], next = null, query = '', catalogueState = '', statsState = '', stats = null;
  let library = null;
  let catalogueRequest, statsRequest, changesRequest;
  let changes = [], changesNext = null, trackingSince = null, changesState = '';
  const changesPanel = $('changes-panel');
  const cataloguePanel = $('catalogue-panel'), audiencePanel = $('audience-panel');
  const element = (tag, content, className) => Object.assign(document.createElement(tag), { textContent:content, ...(className ? {className} : {}) });

  function renderCatalogue() {
    $('collection-station').textContent = $('catalogue-scope').value === 'library' ? word('libraryScope') : plain(currentMood);
    $('catalogue-freshness').textContent = library ? `${new Intl.NumberFormat(language).format(library.total)} ${word('libraryTotal')} · ${word('libraryUpdated')} ${observedDate(library.updatedAt)}` : '';
    $('catalogue-status').textContent = catalogueState === 'ready'
      ? rows.length ? `${rows.length} ${word('loaded')}` : word('empty')
      : catalogueState ? word(catalogueState) : '';
    $('catalogue-more').hidden = !next;
    $('catalogue-more').disabled = catalogueState === 'loading';
    $('catalogue-tracks').replaceChildren(...rows.map(row => {
      const item = document.createElement('li');
      const info = document.createElement('div');
      const title=element('button',row.title || text('untitled'),'catalogue-title');
      title.type='button';title.addEventListener('click',()=>window.Pavoia?.openTrack(row.id));
      info.append(title,element('p',row.artist || text('unknownArtist')));
      if (row.album) info.append(element('p', row.album, 'catalogue-album'));
      const seconds = Math.floor(row.durationMs / 1000);
      const duration = Number.isFinite(seconds) && seconds > 0 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : '';
      item.append(info, element('span', duration, 'catalogue-duration'));
      return item;
    }));
  }

  async function loadCatalogue(append = false) {
    catalogueRequest?.abort();
    const request = new AbortController();
    catalogueRequest = request;
    if (!append) { rows = []; next = null; library = null; query = $('catalogue-query').value.trim(); }
    if (new TextEncoder().encode(query).length > 200) {
      catalogueRequest = null; catalogueState = 'tooLong'; renderCatalogue(); return;
    }
    const params = new URLSearchParams({ q:query, limit:'30' });
    if (append && next) params.set('after', next);
    catalogueState = 'loading'; renderCatalogue();
    const timeout = setTimeout(() => request.abort(), 8000);
    try {
      const base = $('catalogue-scope').value === 'library' ? '/api/library' : `/api/radio/${currentMood.stage}`;
      const response = await fetch(`${base}/catalogue?${params}`, { signal:request.signal, cache:'no-store' });
      if (!response.ok) throw new Error('catalogue');
      const data = await response.json();
      if (catalogueRequest !== request) return;
      if (!Array.isArray(data.tracks) || data.tracks.some(t => !t || typeof t.id !== 'string' || typeof t.title !== 'string' || typeof t.artist !== 'string') ||
          !(data.next === null || typeof data.next === 'string' && /^[0-9]+$/.test(data.next))) throw new Error('schema');
      if (base === '/api/library' && (!data.library || !Number.isSafeInteger(data.library.total) || data.library.total < 0 || !Number.isFinite(Date.parse(data.library.updatedAt)))) throw new Error('schema');
      library = data.library || null;
      const known = new Set(rows.map(t => t.id));
      rows.push(...data.tracks.filter(t => !known.has(t.id)));
      next = data.next; catalogueState = 'ready';
    } catch {
      if (catalogueRequest !== request) return;
      catalogueState = 'failed';
    } finally {
      clearTimeout(timeout);
      if (catalogueRequest === request) { catalogueRequest = null; renderCatalogue(); }
    }
  }

  function renderStats() {
    $('audience-status').textContent = statsState === 'ready' ? stats.days.length ? '' : word('noHistory') : statsState ? word(statsState) : '';
    $('audience-refresh').disabled = statsState === 'loading';
    $('audience-table').hidden = statsState !== 'ready' || !stats.days.length;
    $('audience-caption').textContent = `${plain(currentMood)} · ${word('recent')}`;
    if (statsState !== 'ready') return;
    const numeric = value => Number.isFinite(value) && value >= 0 ? new Intl.NumberFormat(language, { maximumFractionDigits:1 }).format(value) : word('unknown');
    $('audience-days').replaceChildren(...stats.days.slice(-30).reverse().map(day => {
      const row = document.createElement('tr');
      const date = element('th', day.date); date.scope = 'row';
      row.append(date, element('td', numeric(day.peak)), element('td', numeric(day.listenerHours)),
        element('td', numeric(Number.isFinite(day.measuredSeconds) ? day.measuredSeconds / 3600 : null)));
      return row;
    }));
  }

  async function loadStats() {
    statsRequest?.abort();
    const request = new AbortController(); statsRequest = request;
    statsState = 'loading'; renderStats();
    const timeout = setTimeout(() => request.abort(), 8000);
    try {
      const response = await fetch(`/api/radio/${currentMood.stage}/stats`, { signal:request.signal, cache:'no-store' });
      if (!response.ok) throw new Error('stats');
      const data = await response.json();
      if (statsRequest !== request) return;
      if (!data.available || !Array.isArray(data.days) || data.days.some(day => !day || typeof day.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day.date))) throw new Error('schema');
      stats = data; statsState = 'ready';
    } catch {
      if (statsRequest !== request) return;
      statsState = 'audienceFailed';
    } finally {
      clearTimeout(timeout);
      if (statsRequest === request) { statsRequest = null; renderStats(); }
    }
  }

  const observedDate = value => new Intl.DateTimeFormat(language, {dateStyle:'medium', timeStyle:'short', timeZone:'UTC'}).format(new Date(value)) + ' UTC';
  function renderChanges() {
    $('changes-since').textContent = trackingSince ? `${plain(currentMood)} · ${word('changesSince')} ${observedDate(trackingSince)}` : plain(currentMood);
    $('changes-status').textContent = changesState === 'ready'
      ? !trackingSince ? word('changesPending') : changes.length ? '' : word('changesEmpty')
      : changesState ? word(changesState) : '';
    $('changes-refresh').disabled = changesState === 'loading';
    $('changes-more').hidden = !changesNext;
    $('changes-more').disabled = changesState === 'loading';
    $('changes-list').replaceChildren(...changes.map(change => {
      const item = document.createElement('li');
      const info = document.createElement('div');
      info.append(element('p', word(change.kind), 'catalogue-album'), element('p', change.title || text('untitled'), 'catalogue-title'), element('p', change.artist || text('unknownArtist')));
      if (change.album) info.append(element('p', change.album, 'catalogue-album'));
      const time = element('time', observedDate(change.observedAt), 'catalogue-duration');
      time.dateTime = change.observedAt;
      item.append(info, time);
      return item;
    }));
  }

  async function loadChanges(append = false) {
    changesRequest?.abort();
    const request = new AbortController(); changesRequest = request;
    if (!append) { changes = []; changesNext = null; trackingSince = null; }
    const params = new URLSearchParams({limit:'30'});
    if (append && changesNext) params.set('before', changesNext);
    changesState = 'loading'; renderChanges();
    const timeout = setTimeout(() => request.abort(), 8000);
    try {
      const response = await fetch(`/api/radio/${currentMood.stage}/changes?${params}`, {signal:request.signal, cache:'no-store'});
      if (!response.ok) throw new Error('changes');
      const data = await response.json();
      if (changesRequest !== request) return;
      if (!(data.trackingSince === null || typeof data.trackingSince === 'string' && Number.isFinite(Date.parse(data.trackingSince))) ||
          !(data.next === null || typeof data.next === 'string' && /^[0-9]+$/.test(data.next)) ||
          !Array.isArray(data.changes) || data.changes.some(change => !change || !['added','removed'].includes(change.kind) ||
            typeof change.sequence !== 'string' || !/^[0-9]+$/.test(change.sequence) || typeof change.id !== 'string' ||
            typeof change.title !== 'string' || typeof change.artist !== 'string' || !Number.isFinite(Date.parse(change.observedAt)))) throw new Error('schema');
      const known = new Set(changes.map(change => change.sequence));
      changes.push(...data.changes.filter(change => !known.has(change.sequence)));
      trackingSince = data.trackingSince; changesNext = data.next; changesState = 'ready';
    } catch {
      if (changesRequest !== request) return;
      changesState = 'changesFailed';
    } finally {
      clearTimeout(timeout);
      if (changesRequest === request) { changesRequest = null; renderChanges(); }
    }
  }

  function localiseCollection() {
    document.querySelectorAll('[data-explore]').forEach(node => { node.textContent = word(node.dataset.explore); });
    $('collection').setAttribute('aria-label', word('collection'));
        renderCatalogue(); renderStats(); renderChanges();
  }
  cataloguePanel.addEventListener('toggle', () => { if (cataloguePanel.open && !catalogueState) loadCatalogue(); });
  audiencePanel.addEventListener('toggle', () => { if (audiencePanel.open) loadStats(); });
  $('catalogue-search').addEventListener('submit', event => { event.preventDefault(); loadCatalogue(); });
  $('catalogue-scope').addEventListener('change', () => loadCatalogue());
  $('catalogue-more').addEventListener('click', () => { if (next && !catalogueRequest) loadCatalogue(true); });
  $('audience-refresh').addEventListener('click', loadStats);
  changesPanel.addEventListener('toggle', () => { if (changesPanel.open) loadChanges(); });
  $('changes-refresh').addEventListener('click', () => loadChanges());
  $('changes-more').addEventListener('click', () => { if (changesNext && !changesRequest) loadChanges(true); });
  $('language').addEventListener('change', localiseCollection);
  let stage = currentMood.stage;
  $('moods').addEventListener('change', () => {
    if (stage === currentMood.stage) return;
    stage = currentMood.stage;
    catalogueRequest?.abort(); statsRequest?.abort(); catalogueRequest = statsRequest = null;
    changesRequest?.abort(); changesRequest = null; changes = []; changesNext = null; trackingSince = null; changesState = '';
    rows = []; next = null; library = null; stats = null; catalogueState = statsState = '';
    localiseCollection();
    if (cataloguePanel.open) loadCatalogue();
    if (audiencePanel.open) loadStats();
    if (changesPanel.open) loadChanges();
  });
  localiseCollection();
})();
