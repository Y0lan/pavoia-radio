'use strict';

// Stage visuals stay local; track metadata and audio come from the live radio.
const moods = [
  { id: '01', title: ["Under the", "Sun"], stage: 'bermuda-day', photos: [
    { src: 'photos/selected/p036.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p058.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p057.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p089.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p165.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p167.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p225.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p257.jpg', focus: '50% 50%' },
  ] },
  { id: '02', title: ["As Night", "Begins"], stage: 'bermuda-evening', photos: [
    { src: 'photos/selected/p008.jpg', focus: '58% 38%' },
    { src: 'photos/selected/p013.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p045.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p062.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p063.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p067.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p122.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p132.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p133.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p238.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p240.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p327.jpg', focus: '50% 50%' },
  ] },
  { id: '03', title: ["Night in", "Motion"], stage: 'palac-dance', photos: [
    { src: 'photos/selected/p250.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p252.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p265.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p306.jpg', focus: '50% 50%' },
  ] },
  { id: '04', title: ["Lost in", "Feelings"], stage: 'palac-feel', photos: [
    { src: 'photos/selected/p005.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p204.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p306.jpg', focus: '50% 50%' },
  ] },
  { id: '06', title: ["Etage", "0"], stage: 'etage-zero', photos: [
    { src: 'photos/selected/p015.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p024.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p025.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p066.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p085.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p086.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p252.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p255.jpg', focus: '50% 50%' },
  ] },
  { id: '07', title: ["", "Fontanna"], stage: 'fontanna', photos: [
    { src: 'photos/selected/p052.jpg', focus: '50% 50%' },
  ] },
  { id: '08', title: ['', 'Ambiance'], stage: 'ambiance', photos: [{ src: 'photos/selected/p084.jpg', focus: '50% 50%' }] },
  { id: '09', title: ['', 'Closing'], stage: 'closing', photos: [{ src: 'photos/selected/p313.jpg', focus: '50% 50%' }] },
  { id: '05', title: ["", "Essentials"], stage: 'essentials', photos: [
    { src: 'photos/selected/p007.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p016.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p017.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p039.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p063.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p080.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p092.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p131.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p165.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p204.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p218.jpg', focus: '50% 50%' },
  ] },
];


const words = {
 en: { promise:'So it never ends.', choose:'Choose a stage', letterTitle:'The festival ends.', letterEnd:'The music stays.',
  letterOne:'Years spent finding tracks, keeping them close and collecting them in playlists named after the stages of Pavoia.',
  letterTwo:'This radio is a way to share them. To return to a little of that place between editions, and keep discovering music there.',
  love:'With love,', footer:'Pavoia Radio · A personal selection by Gaende', language:'Language', selectedBy:'Selected by Gaende',
  play:'Play', pause:'Pause', space:'Space', retry:'Try again', paused:'Paused', connecting:'Connecting…', playing:'Playing', buffering:'Buffering…',
  retrying:'Reconnecting…', blocked:'Press play to start', error:'Stream lost. Press play to retry.', untitled:'Untitled track', unknownArtist:'Unknown artist',
  noTrack:'No track announced', notOnAir:'Not on air yet', loading:'Loading track…', onAir:'On air now', lastTrack:'Last known track',
  live:'Live', listening:'listening', audience:'listening to this stage',
  cover:'Cover artwork', portrait:'Portrait of', home:'Pavoia Radio, home', player:'Player', changePhoto:'Next photo', of:'of', photoOnly:'Photo only',
  busPlace:'Somewhere in the forest. No playlist here, you have to be there.', busTicket:'Get your Pavoia ticket',
  places:['Finding your own rhythm in the open air, with no pressure to rush the day.','A growing sense of possibility: something is beginning, and you want to be part of it!','Pałac at its peak. The shared moment when everyone commits to the dance and everything else can wait.','The inward side of Pałac. Longing, tenderness, melancholy: giving those feelings room to unfold while you keep moving.','The tracks I keep close and always come back to, at different times for different reasons.','The basement. Giving yourself fully to the speed and intensity, whether the feeling is dark or joyful.','The simple happiness of dancing together in daylight. Being there already feels good; the music makes you want to join in.'],
  lines:['Sunny, groovy open-air warm-up','Bright and melodic, building up','Driving peak-time dance music','Melancholic, hypnotic and deep','The tracks I keep coming back to','Hard techno and hard trance','Happy house for daylight','Ambient, to lie down and rest','Tracks to close a set'] },
 de: { promise:'Damit es niemals aufhört.', choose:'Wähle eine Bühne', letterTitle:'Das Festival endet.', letterEnd:'Die Musik bleibt.',
  letterOne:'Über Jahre gesammelt: Tracks, die bleiben. Vereint in Playlists, die die Namen der Bühnen von Pavoia tragen.',
  letterTwo:'Mit diesem Radio möchte ich sie teilen. Ein Stück dieses Ortes zwischen den Festivals wiederfinden und dort weiter Musik entdecken.',
  love:'Mit Liebe,', footer:'Pavoia Radio · Eine persönliche Auswahl von Gaende', language:'Sprache', selectedBy:'Ausgewählt von Gaende',
  play:'Abspielen', pause:'Pause', space:'Leertaste', retry:'Erneut versuchen', paused:'Pausiert', connecting:'Verbinden…', playing:'Wiedergabe', buffering:'Puffern…',
  retrying:'Neu verbinden…', blocked:'Zum Starten Play drücken', error:'Stream unterbrochen. Play erneut drücken.', untitled:'Titel unbekannt', unknownArtist:'Künstler unbekannt',
  noTrack:'Kein Titel gemeldet', notOnAir:'Noch nicht auf Sendung', loading:'Titel wird geladen…', onAir:'Gerade läuft', lastTrack:'Zuletzt gemeldeter Titel',
  live:'Live', listening:'hören', audience:'hören auf dieser Bühne',
  cover:'Cover', portrait:'Porträt von', home:'Pavoia Radio, Startseite', player:'Player', changePhoto:'Nächstes Foto', of:'von', photoOnly:'Nur Foto',
  busPlace:'Irgendwo im Wald. Hier gibt es keine Playlist, du musst dabei sein.', busTicket:'Hol dir dein Pavoia-Ticket',
  places:['Unter freiem Himmel den eigenen Rhythmus finden und dem Tag seine Zeit lassen.','Das Gefühl, dass immer mehr möglich ist: Etwas beginnt, und du möchtest dabei sein!','Pałac auf dem Höhepunkt. Dieser gemeinsame Moment, in dem sich alle ganz dem Tanzen hingeben und alles andere warten kann.','Pałac, mit dem Blick nach innen. Sehnsucht, Zärtlichkeit, Melancholie: diesen Gefühlen Raum geben, während du weitertanzt.','Die Tracks, die mir am Herzen liegen und zu denen ich immer wieder zurückkehre, zu verschiedenen Zeiten aus verschiedenen Gründen.','Der Keller. Sich ganz dem Tempo und der Intensität hingeben, ob düster oder voller Freude.','Die einfache Freude, bei Tageslicht zusammen zu tanzen. Hier zu sein fühlt sich schon gut an; die Musik macht Lust, mitzutanzen.'],
  lines:['Sonnig, groovig, zum Aufwärmen','Hell und melodisch, steigend','Treibende Peak-Time-Musik','Melancholisch, hypnotisch, tief','Tracks, zu denen ich zurückkehre','Hard Techno und Hard Trance','Fröhlicher House bei Tageslicht','Ambient, zum Hinlegen','Tracks zum Ende eines Sets'] }
};
words.en.places.push('A safe, quiet space to lie down, relax and feel good. Nothing demanding your energy.', 'Tracks I could play to close a set.');
words.de.places.push('Ein sicherer, ruhiger Ort zum Hinlegen, Entspannen und Wohlfühlen. Hier musst du nichts leisten.', 'Tracks, mit denen ich ein Set beenden könnte.');
Object.assign(words.en, {stations:'Change stage', closeStations:'Close', stationPosition:'Stage', notStreamed:'Not streamed. You have to be there.'});
Object.assign(words.de, {stations:'Bühne wechseln', closeStations:'Schließen', stationPosition:'Bühne', notStreamed:'Nicht im Radio. Du musst dabei sein.'});
let language = 'en';
try { const saved=localStorage.getItem('pavoia-language'); if (Object.hasOwn(words,saved)) language=saved; } catch { /* Storage is optional. */ }
const text = key => words[language][key];
let playbackState='paused';
let playbackText='paused';
let radioData=null;
let dataFresh=false;
let loading=true;

const $ = id => document.getElementById(id);
const plain = mood => mood.title.join(' ').trim();
const audio = $('audio');
const button = $('play');
let currentMood = moods[3];
let track = null;
let wanted = false;
let generation = 0;
let retries = 0;
let retryTimer;
let watchdog;
let healthyTimer;
let removeListeners = () => {};
let pollController;
let audienceController, audienceData=null, audienceStage;
const delays = [1000, 2000, 4000, 8000];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const mobileLayout = matchMedia('(max-width: 760px)');
// Below 900 px the header has no room for the word after the count.
const narrowHeader = matchMedia('(max-width: 900px)');
let photoRequest = '', photoVersion = 0, photoAnimation, sceneID = '';
const sceneText = document.querySelector('.bottom');
const nextPhoto = new Image();
nextPhoto.fetchPriority = 'low';

async function showPhoto(photo) {
  const key = photo.src + ':' + photo.focus;
  if (key === photoRequest) return;
  photoRequest = key;
  const version = ++photoVersion;
  photoAnimation?.cancel();
  const previous = $('photo');
  const incoming = previous.getAttribute('src') === photo.src ? previous : $('photo-buffer');
  const index = currentMood.photoIndex ?? 0;
  const count = currentMood.photos.length;
  const following = location.hash === '#bus' || count < 2 ? null : currentMood.photos[(index + 1) % count];
  document.body.setAttribute('data-photo-loading', '');
  $('photo-count').textContent = '';
  if (incoming !== previous) incoming.hidden = true;
  incoming.style.objectPosition = photo.focus;
  incoming.src = photo.src;
  try {
    await incoming.decode();
    if (version !== photoVersion) return;
    incoming.hidden = false;
    if (incoming !== previous) {
      previous.id = 'photo-buffer';
      incoming.id = 'photo';
      previous.classList.add('photo-back');
      incoming.classList.remove('photo-back');
      if (!reducedMotion.matches && !document.hidden && previous.complete && previous.naturalWidth) {
        photoAnimation = incoming.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 360, easing: 'cubic-bezier(.22, 1, .36, 1)' });
        photoAnimation.finished.then(() => { if (version === photoVersion) previous.hidden = true; }).catch(() => {});
      } else previous.hidden = true;
    }
    document.documentElement.style.setProperty('--focus', photo.focus);
    $('photo-count').textContent = `${index + 1} / ${count}`;
    if (following && !navigator.connection?.saveData && !document.hidden) nextPhoto.src = following.src;
  } catch {
    // Keep the last decoded image when a replacement cannot load.
    if (version === photoVersion) {
      photoRequest = '';
      if (!previous.naturalWidth) previous.hidden = true;
    }
  } finally {
    if (version === photoVersion) document.body.removeAttribute('data-photo-loading');
  }
}

document.documentElement.toggleAttribute('data-page-hidden', document.hidden);
document.addEventListener('visibilitychange', () => {
  document.documentElement.toggleAttribute('data-page-hidden', document.hidden);
  if (document.hidden) {
    photoAnimation?.cancel();
    sceneText.getAnimations().forEach(animation => animation.cancel());
  }
});
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) {
    photoAnimation?.cancel();
    sceneText.getAnimations().forEach(animation => animation.cancel());
  }
});

function setTitle(element, [roman, italic]) {
  const em = Object.assign(document.createElement('em'), { textContent: italic });
  element.replaceChildren(...(roman ? [`${roman} `, em] : [em]));
}

// Each label carries its stage's line: a second line in the phone sheet, a tooltip on the desktop rail.
// The line describes the radio and stays out of its name, so the radio is called by the stage alone.
// Essentials and the Bus close the rail as one group, so they never wrap apart.
for (const mood of moods) {
  const label = document.createElement('label');
  label.className = 'mood';
  const input = Object.assign(document.createElement('input'), { type: 'radio', name: 'mood', value: mood.id });
  input.setAttribute('aria-describedby', `line-${mood.id}`);
  const text = Object.assign(document.createElement('span'), { textContent: plain(mood) });
  const thumbnail = Object.assign(document.createElement('img'), {className:'mood-preview', src:mood.photos[0].src, alt:'', width:52, height:52, loading:'lazy', decoding:'async'});
  thumbnail.style.objectPosition = mood.photos[0].focus;
  const line = Object.assign(document.createElement('small'), { className: 'sheet-line', id: `line-${mood.id}` });
  line.setAttribute('aria-hidden', 'true');
  label.append(input, thumbnail, text, line);
  if (mood.stage==='essentials') {
    label.classList.add('mood-essentials');
    const heart=document.createElementNS('http://www.w3.org/2000/svg','svg');
    heart.setAttribute('viewBox','0 0 36 36');heart.setAttribute('class','essentials-icon');heart.setAttribute('aria-hidden','true');
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d','M18 30.5S5 22.6 5 13.6A6.6 6.6 0 0 1 18 10.4a6.6 6.6 0 0 1 13 3.2c0 9-13 16.9-13 16.9Z');
    heart.append(path);label.prepend(heart);
    $('bus-link').before(label);
  } else $('moods').querySelector('.mood-specials').before(label);
}

function closeStations() {
  if ($('stations-sheet').open) $('stations-sheet').close();
}
function arrangeStations() {
  swipe=null;
  const wasOpen=$('stations-sheet').open;
  closeStations();
  (mobileLayout.matches ? $('station-sheet-list') : $('station-selector-home')).append($('station-selector'));
  if (wasOpen && !mobileLayout.matches) document.querySelector(`input[value="${currentMood.id}"]`).focus();
  renderScene();
}
// The sheet opens on the current stage, not on its close button, and scrolls it into view.
$('open-stations').addEventListener('click', () => {
  $('stations-sheet').showModal();
  (location.hash === '#bus' ? $('bus-link') : document.querySelector(`input[value="${currentMood.id}"]`)).focus();
  $('open-stations').setAttribute('aria-expanded', 'true');
});
$('close-stations').addEventListener('click', closeStations);
$('stations-sheet').addEventListener('click', event => {
  if (event.target !== $('stations-sheet')) return;
  const r=event.target.getBoundingClientRect();
  if (event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) closeStations();
});
$('stations-sheet').addEventListener('close', () => $('open-stations').setAttribute('aria-expanded', 'false'));
$('bus-link').addEventListener('click', closeStations);
mobileLayout.addEventListener('change', arrangeStations);
function step(dir) {
  selectMood(moods[(moods.indexOf(currentMood) + dir + moods.length) % moods.length].id);
}
let swipe = null;
$('poster').addEventListener('pointerdown', event => {
  if (event.pointerType==='touch' && !event.isPrimary) {swipe=null;return;}
  if (!mobileLayout.matches || event.pointerType !== 'touch' || !event.isPrimary || location.hash === '#bus' || event.target.closest('a,button,input,select,details')) return;
  swipe = {id:event.pointerId, x:event.clientX, y:event.clientY};
  $('poster').setPointerCapture(event.pointerId);
});
$('poster').addEventListener('pointercancel', () => {swipe=null;});
$('poster').addEventListener('pointerup', event => {
  const start=swipe;swipe=null;
  if (!start || event.pointerId!==start.id) return;
  const x=event.clientX-start.x,y=event.clientY-start.y;
  if (Math.abs(x)<60 || Math.abs(x)<Math.abs(y)*1.5) return;
  step(x<0?1:-1);
});

function metadata(value) {
  track = value;
  $('player-title').textContent = track ? track.title || text('untitled') : currentMood.stage ? text('noTrack') : text('notOnAir');
  $('player-artist').textContent = track ? track.artist || text('unknownArtist') : '';
  $('player-album').textContent = track?.album || '';
  $('player-album').hidden = !track?.album;
  if ('mediaSession' in navigator && 'MediaMetadata' in window) {
    navigator.mediaSession.metadata = track ? new MediaMetadata({
      title: track.title || text('untitled'), artist: track.artist || '', album: plain(currentMood),
    }) : null;
  }
  tabTitle();
  announceRadio();
}

function changePhoto() {
  currentMood.photoIndex = ((currentMood.photoIndex ?? -1) + 1) % currentMood.photos.length;
  renderScene();
}
$('change-photo').addEventListener('click', changePhoto);

// Desktop viewers can hide the record sleeve and artist portraits to see the stage photo alone.
let photoOnly = false;
try { photoOnly = localStorage.getItem('pavoia-photo-only') === 'on'; } catch { /* Storage is optional. */ }
function renderArtworkToggle() {
  document.body.toggleAttribute('data-photo-only', photoOnly);
  $('artwork-toggle').setAttribute('aria-pressed', photoOnly);
}
$('artwork-toggle').addEventListener('click', () => {
  photoOnly = !photoOnly;
  try { localStorage.setItem('pavoia-photo-only', photoOnly ? 'on' : 'off'); } catch { /* Storage is optional. */ }
  renderArtworkToggle();
});

function renderScene() {
  const bus = location.hash === '#bus';
  const photo = bus ? { src: 'photos/bus-stage.jpg', focus: '50% 50%' }
    : currentMood.photos[currentMood.photoIndex ?? 0];
  document.body.toggleAttribute('data-bus', bus);
  if (bus) $('bus-link').setAttribute('aria-current', 'page');
  else $('bus-link').removeAttribute('aria-current');
  $('change-photo').hidden = bus || currentMood.photos.length < 2;
  $('change-photo').setAttribute('aria-label', `${text('changePhoto')}, ${(currentMood.photoIndex ?? 0) + 1} ${text('of')} ${currentMood.photos.length}`);
  showPhoto(photo);
  tabTitle();
  const nextScene = bus ? 'bus' : currentMood.id;
  if (nextScene !== sceneID) {
    setTitle($('mood-name'), bus ? ['The', 'Bus'] : currentMood.title);
    sceneText.getAnimations().forEach(animation => animation.cancel());
    if (sceneID && !reducedMotion.matches && !document.hidden) sceneText.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.22, 1, .36, 1)' });
      sceneID = nextScene;
  }
  const index=moods.indexOf(currentMood);
  $('mood-place').textContent = bus ? text('busPlace') : words[language].places[Number(currentMood.id)-1];
  $('station-text').textContent = `${index+1} / ${moods.length}`;
  $('station-label').textContent = `${text('stationPosition')} ${index+1} ${text('of')} ${moods.length}, ${plain(currentMood)}`;
  $('station-position').hidden = bus;
}
// The tab names the record while it plays, and the stage otherwise.
function tabTitle() {
  const name = playbackState === 'playing' && track ? `▶ ${track.title || text('untitled')} · ${track.artist || text('unknownArtist')}`
    : location.hash === '#bus' ? 'The Bus' : plain(currentMood);
  document.title = `${name} · Pavoia Radio`;
}
window.addEventListener('hashchange', renderScene);
window.addEventListener('popstate', renderScene);

function leaveBus() {
  if (location.hash !== '#bus') return;
  history.pushState(null, '', location.pathname + location.search);
  renderScene();
}
$('moods').addEventListener('click', event => {
  if (event.target.name === 'mood' && event.target.value === currentMood.id) {leaveBus();closeStations();}
});

function render() {
  changePhoto();
  renderStatus();
  button.disabled = !currentMood.stage;
  document.querySelector(`input[value="${currentMood.id}"]`).checked = true;
  metadata(null);
  $('player-stage').textContent = plain(currentMood);
  if (currentMood.stage) $('player-title').textContent = text('loading');
}

function state(value, status) {
  playbackState=value; playbackText=status;
  Object.assign(document.querySelector('.player').dataset, { state: value, status });
  document.body.toggleAttribute('data-playing', value === 'playing');
  document.body.toggleAttribute('data-wanted', wanted);
  const label = wanted ? text('pause') : value === 'error' ? text('retry') : text('play');
  button.setAttribute('aria-label', label);
  button.title = `${label} (${text('space')})`;
  $('playback-status').textContent = text(status);
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = value === 'playing' ? 'playing' : 'paused';
  tabTitle();
  announceRadio();
}

function release() {
  generation++;
  clearTimeout(watchdog);
  watchdog = null;
  clearTimeout(healthyTimer);
  removeListeners();
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
}

function pause() {
  window.Pavoia?.cancelPreview?.();
  wanted = false;
  clearTimeout(retryTimer);
  release();
  state('paused', 'paused');
}

function fail(token, blocked = false) {
  if (!wanted || token !== generation) return;
  release();
  if (blocked || retries >= delays.length) {
    wanted = false;
    if (blocked) state('paused', 'blocked');
    else state('error', 'error');
    return;
  }
  const delay = delays[retries++];
  state('retrying', 'retrying');
  retryTimer = setTimeout(connect, delay);
}

function connect() {
  clearTimeout(retryTimer);
  release();
  if (!wanted) return;
  const token = generation;
  const current = () => wanted && token === generation;
  state('connecting', 'connecting');
  let started = false;
  const handlers = {
    playing: () => {
      if (!current() || audio.paused || audio.readyState < 3) return;
      started = true;
      clearTimeout(watchdog);
      watchdog = null;
      clearTimeout(healthyTimer);
      healthyTimer = setTimeout(() => { if (current()) retries = 0; }, 30000);
      state('playing', 'playing');
    },
    waiting: () => {
      if (!current()) return;
      clearTimeout(healthyTimer);
      state('connecting', started ? 'buffering' : 'connecting');
      if (watchdog == null) watchdog = setTimeout(() => fail(token), 20000);
    },
    stalled: () => { if (audio.readyState < 3) handlers.waiting(); },
    error: () => { if (audio.error) fail(token); },
    ended: () => fail(token),
    pause: () => { if (current() && audio.paused && !audio.ended && !audio.error) pause(); },
  };
  for (const [event, handler] of Object.entries(handlers)) audio.addEventListener(event, handler);
  removeListeners = () => {
    for (const [event, handler] of Object.entries(handlers)) audio.removeEventListener(event, handler);
  };
  watchdog = setTimeout(() => fail(token), 20000);
  // A new source discards any buffered audio and joins the current broadcast.
  audio.src = `/stream/${currentMood.stage}.mp3`;
  try {
    const attempt = audio.play();
    if (attempt) attempt.catch(error => fail(token, error.name === 'NotAllowedError'));
  } catch (error) {
    fail(token, error.name === 'NotAllowedError');
  }
}

function play() {
  window.Pavoia?.cancelPreview?.();
  if (wanted || !currentMood.stage) return;
  wanted = true;
  retries = 0;
  connect();
}


const toggle = () => wanted ? pause() : play();
button.addEventListener('click', toggle);
// Space plays from anywhere and the arrows repeat the swipe. Typing keeps its keys, and so do the
// keyboard-focused controls that Space activates. A held Space toggles once and never scrolls or clicks.
// Chromium marks the target :focus-visible as soon as a key goes down, so keep how the target got focus.
// Space keeps its native action on a control the keyboard reached, and on a station not yet selected.
// A control last pressed with the mouse or a finger does not capture it, even if Tab reached it first.
// The arrows stay with a modal dialog, the stations sheet; the explorer leaves the player and its keys in reach.
let keyboardFocus = false;
document.addEventListener('focusin', event => { keyboardFocus = event.target.matches(':focus-visible'); });
document.addEventListener('pointerdown', () => { keyboardFocus = false; }, true);
document.addEventListener('keydown', event => {
  const target = event.target;
  if (event.ctrlKey || event.metaKey || event.altKey || target.matches('input:not([type=range],[type=radio]), textarea, select, [contenteditable]')) return;
  if (event.code === 'Space') {
    if ((keyboardFocus && target.matches('button, summary')) || target.matches('[type=radio]:not(:checked)')) return;
    event.preventDefault();
    if (!event.repeat && !window.Pavoia.stopPreview?.()) toggle();
  } else if (!event.repeat && (event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !document.querySelector('dialog:modal') && !target.matches('[type=radio], [type=range]')) {
    step(event.key === 'ArrowLeft' ? -1 : 1);
  }
});
if ('mediaSession' in navigator) {
  for (const [action, handler] of Object.entries({ play, pause, stop: pause, previoustrack: () => step(-1), nexttrack: () => step(1) })) {
    try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* Unsupported action. */ }
  }
}

async function poll() {
  if (!currentMood.stage || pollController) return;
  const controller = new AbortController();
  const stage = currentMood.stage;
  pollController = controller;
  const current = () => pollController === controller;
  const timeout = setTimeout(() => controller.abort(), 6000);
  controller.signal.addEventListener('abort', () => clearTimeout(timeout), { once: true });
  try {
    const response = await fetch(`/api/radio/${stage}`, { cache: 'no-store', signal: controller.signal });
    if (!current()) return;
    if (!response.ok) throw new Error('status');
    const data = await response.json();
    if (!current()) return;
    if (!data || data.stage?.id !== stage || !data.audience || !('track' in data)) throw new Error('schema');
    if (data.track !== null && (typeof data.track.id !== 'string' || typeof data.track.title !== 'string' || typeof data.track.artist !== 'string')) throw new Error('track');
    radioData=data; dataFresh=true; loading=false;
    metadata(data.track);
    renderStatus();
  } catch {
    if (!current()) return;
    dataFresh=false; loading=false;
    renderStatus();
    if ('mediaSession' in navigator) navigator.mediaSession.metadata = null;
    announceRadio();
  } finally {
    clearTimeout(timeout);
    if (current()) pollController = null;
  }
}

// The live count is polled every 2 s after anything that can change it (page shown, station change,
// playback start, a new count) and twice as rarely each time it stays the same, up to every 30 s.
// A hidden page polls nothing. The schedule uses the monotonic clock, so a system clock correction
// cannot stall it.
const AUDIENCE_FAST = 2000, AUDIENCE_SLOW = 30000;
let audienceDelay = AUDIENCE_FAST, audienceDue = 0;
function tickListeners() {
  if (performance.now() >= audienceDue) return pollListeners();
}

async function pollListeners(urgent = false) {
  if (urgent === true) audienceDelay = AUDIENCE_FAST;
  if (document.hidden || audienceController) return;
  const controller=new AbortController(),stage=currentMood.stage;
  audienceController=controller;
  const timeout=setTimeout(()=>controller.abort(),3000);
  try {
    const response=await fetch('/api/audience?stage='+encodeURIComponent(stage), {cache:'no-store',signal:controller.signal});
    if (!response.ok) throw new Error('status');
    const value=await response.json();
    if (!value || typeof value.available!=='boolean' || (value.available && (!Number.isInteger(value.listeners) || value.listeners<0 || !Number.isFinite(Date.parse(value.measuredAt))))) throw new Error('audience');
    if (audienceController===controller && currentMood.stage===stage) {
      const same=audienceData && value.available===audienceData.available && value.listeners===audienceData.listeners;
      audienceDelay=same ? Math.min(audienceDelay*2, AUDIENCE_SLOW) : AUDIENCE_FAST;
      audienceData=value;
    }
  } catch {
    if (audienceController===controller) {audienceData=null;audienceDelay=Math.min(audienceDelay*2, AUDIENCE_SLOW);}
  } finally {
    clearTimeout(timeout);
    if (audienceController===controller) {audienceController=null;audienceStage=stage;audienceDue=performance.now()+audienceDelay;renderStatus();}
  }
}

function selectMood(id) {
  const next = moods.find(mood => mood.id === id);
  if (!next) return;
  closeStations();
  leaveBus();
  if (next === currentMood) return;
  // A preview paused the radio: when it was on before, the new station plays.
  if (window.Pavoia?.cancelPreview?.()) wanted = true;
  clearTimeout(retryTimer);
  release();
  retries = 0;
  if (pollController) pollController.abort();
  pollController = null;
  audienceController?.abort();audienceController=null;audienceData=null;audienceStage=null;
  currentMood = next;
  radioData=null; dataFresh=false; loading=Boolean(next.stage);
  if (!next.stage) wanted = false;
  render();
  if (wanted) connect();
  else state('paused', 'paused');
  poll();
  pollListeners(true);
}
$('moods').addEventListener('change', event => selectMood(event.target.value));

document.addEventListener('visibilitychange', () => { if (!document.hidden) {poll();pollListeners(true);} else {audienceController?.abort();} });
arrangeStations();
localise();
render();
state('paused', 'paused');
poll();
setInterval(poll, 10000);
pollListeners(true);
setInterval(tickListeners, 1000);
audio.addEventListener('playing', () => pollListeners(true));

// The header says Live and counts only real listeners; the dot is red only while a track is on air.
// Until the stage's radio data and audience have both answered, the last words stay in place, unseen,
// so the dot moves at most once per stage change. Screen readers get #live-label instead of the
// visible words: "Connecting…" while pending, then the full sentence, zero included, and whether a track is on air.
function renderStatus() {
  const live=$('live-text'),label=$('live-label'),onAir=Boolean(dataFresh && track);
  const pending=Boolean(currentMood.stage) && (loading || audienceStage!==currentMood.stage);
  document.body.toggleAttribute('data-on-air',onAir);
  live.toggleAttribute('data-pending',pending);
  live.removeAttribute('title');
  if (!loading && !dataFresh && !track) $('player-title').textContent=plain(currentMood);
  if (pending) { label.textContent=text('connecting'); return; }
  const { listeners: count, measuredAt, available }=audienceData || {};
  const fresh=Number.isFinite(Date.parse(measuredAt)) && Math.abs(Date.now()-Date.parse(measuredAt))<=AUDIENCE_SLOW+5000;
  const known=dataFresh && fresh && available && Number.isInteger(count) && count>=0;
  live.textContent=text('live')+(onAir && known && count>=1 ? ` · ${count}${narrowHeader.matches ? '' : ' '+text('listening')}` : '');
  if (known) live.title=`${count} ${text('audience')}: ${plain(currentMood)}`;
  // The muted dot is not read aloud, so the label says when no track is on air.
  label.textContent=(known ? live.title : live.textContent)+(onAir ? '' : '. '+text('noTrack'));
}
narrowHeader.addEventListener('change', renderStatus);

function localise() {
  document.documentElement.lang=language;
  for (const choice of $('language').children) choice.setAttribute('aria-pressed',choice.value===language);
  $('language').setAttribute('aria-label',text('language'));
  $('close-stations').setAttribute('aria-label',text('closeStations'));
  document.querySelectorAll('[data-copy]').forEach(node=>{node.textContent=text(node.dataset.copy);});
  document.querySelectorAll('.mood').forEach(node=>{node.title=node.querySelector('.sheet-line').textContent=text('lines')[Number(node.querySelector('input').value)-1];});
  document.querySelector('.wordmark').setAttribute('aria-label',text('home'));
  document.querySelector('.player').setAttribute('aria-label',text('player'));
  renderArtworkToggle();
  renderScene();
  metadata(track);
  if (!dataFresh && 'mediaSession' in navigator) navigator.mediaSession.metadata=null;
  renderStatus();
  state(playbackState,playbackText);
}
$('language').addEventListener('click',event=>{
  if (!Object.hasOwn(words,event.target.value)) return;
  language=event.target.value;
  try { localStorage.setItem('pavoia-language',language); } catch { /* Storage is optional. */ }
  localise();
});

// The explorer tunes the radio to a stage that plays a record; the player bar shows the switch.
function tune(stage) {
  const mood = moods.find(m => m.stage === stage);
  if (mood) selectMood(mood.id);
}

function announceRadio() {
  if (window.dispatchEvent) window.dispatchEvent(new CustomEvent('pavoia:radio'));
}
window.Pavoia = { stations: moods.map(m => ({id:m.stage, name:plain(m), thumb:m.photos[0].src})), getState: () => ({track, stage:currentMood.stage, name:plain(currentMood), language, wanted, playbackState, playbackText, dataFresh}),
  play, pause, renderScene, toggle, tune };
