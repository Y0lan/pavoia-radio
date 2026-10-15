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
    { src: 'photos/selected/p313.jpg', focus: '50% 50%' },
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
    { src: 'photos/selected/p250.jpg', focus: '50% 50%' },
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
    { src: 'photos/selected/p015.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p016.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p017.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p039.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p063.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p080.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p084.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p092.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p131.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p165.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p204.jpg', focus: '50% 50%' },
    { src: 'photos/selected/p218.jpg', focus: '50% 50%' },
  ] },
];


const words = {
 en: { promise:'So it never ends.', choose:'Choose a radio', letterTitle:'The festival ends.', letterEnd:'The music stays.',
  letterOne:'Years spent finding tracks, keeping them close and collecting them in playlists named after the stages of Pavoia.',
  letterTwo:'This radio is a way to share them. To return to a little of that place between editions, and keep discovering music there.',
  love:'With love,', footer:'Pavoia Radio · A personal selection by Gaende', language:'Language', selectedBy:'Selected by Gaende',
  play:'Play', pause:'Pause', retry:'Retry playback', paused:'Paused', connecting:'Connecting', playing:'Playing', buffering:'Buffering',
  retrying:'Reconnecting', blocked:'Tap to play', error:'Tap to retry', soon:'Soon', soonSuffix:' (soon)', untitled:'Untitled track', unknownArtist:'Unknown artist',
  noTrack:'No track announced', notOnAir:'Not on air yet', loading:'Loading track…', onAir:'On air now', lastTrack:'Last known track',
  unavailableTrack:'Track unavailable', live:'Live', standby:'Standby', offline:'Data unavailable', audience:'live audio connections', audienceUnknown:'Audience unavailable',
  cover:'Cover artwork', portrait:'Portrait of', home:'Pavoia Radio, home', player:'Player', changePhoto:'Change photo',
  busPlace:'Somewhere in the forest', busLine:'No playlist here. You have to be there.', busTicket:'Get your Pavoia ticket ↗',
  places:['Finding your own rhythm in the open air, with no pressure to rush the day.','A growing sense of possibility: something is beginning, and you want to be part of it!','Pałac at its peak. The shared moment when everyone commits to the dance and everything else can wait.','The inward side of Pałac. Longing, tenderness, melancholy: giving those feelings room to unfold while you keep moving.','The tracks I keep close and always come back to, at different times for different reasons.','The basement. Giving yourself fully to the speed and intensity, whether the feeling is dark or joyful.','The simple happiness of dancing together in daylight. Being there already feels good; the music makes you want to join in.'],
  lines:['Sunny, groovy and easygoing records for warm ups and the open air.','Bright, melodic and a little energetic, building toward the dance floor.','Physical, driving, peak time. Built to move a room.','Melancholic, hypnotic and deep. Night music with a focus on feeling.','The tracks I keep coming back to.','Hard techno and hard trance from the basement. Dark or happy, always fast and full of energy.','Happy house for daylight dancing and relaxed afternoons.'] },
 de: { promise:'Damit es niemals aufhört.', choose:'Wähle ein Radio', letterTitle:'Das Festival endet.', letterEnd:'Die Musik bleibt.',
  letterOne:'Über Jahre gesammelt: Tracks, die bleiben. Vereint in Playlists, die die Namen der Bühnen von Pavoia tragen.',
  letterTwo:'Mit diesem Radio möchte ich sie teilen. Ein Stück dieses Ortes zwischen den Festivals wiederfinden und dort weiter Musik entdecken.',
  love:'Mit Liebe,', footer:'Pavoia Radio · Eine persönliche Auswahl von Gaende', language:'Sprache', selectedBy:'Ausgewählt von Gaende',
  play:'Abspielen', pause:'Pause', retry:'Erneut abspielen', paused:'Pausiert', connecting:'Verbinden', playing:'Wiedergabe', buffering:'Lädt',
  retrying:'Neu verbinden', blocked:'Zum Start tippen', error:'Erneut versuchen', soon:'Bald', soonSuffix:' (bald)', untitled:'Titel unbekannt', unknownArtist:'Künstler unbekannt',
  noTrack:'Kein Titel gemeldet', notOnAir:'Noch nicht auf Sendung', loading:'Titel wird geladen…', onAir:'Gerade läuft', lastTrack:'Zuletzt gemeldeter Titel',
  unavailableTrack:'Titel nicht verfügbar', live:'Live', standby:'Bereit', offline:'Daten fehlen', audience:'Live-Audioverbindungen', audienceUnknown:'Hörerzahl nicht verfügbar',
  cover:'Cover', portrait:'Porträt von', home:'Pavoia Radio, Startseite', player:'Player', changePhoto:'Foto wechseln',
  busPlace:'Irgendwo im Wald', busLine:'Hier gibt es keine Playlist. Du musst dabei sein.', busTicket:'Hol dir dein Pavoia-Ticket ↗',
  places:['Unter freiem Himmel den eigenen Rhythmus finden und dem Tag seine Zeit lassen.','Das Gefühl, dass immer mehr möglich ist: Etwas beginnt, und du möchtest dabei sein!','Pałac auf dem Höhepunkt. Dieser gemeinsame Moment, in dem sich alle ganz dem Tanzen hingeben und alles andere warten kann.','Pałac, mit dem Blick nach innen. Sehnsucht, Zärtlichkeit, Melancholie: diesen Gefühlen Raum geben, während du weitertanzt.','Die Tracks, die mir am Herzen liegen und zu denen ich immer wieder zurückkehre, zu verschiedenen Zeiten aus verschiedenen Gründen.','Der Keller. Sich ganz dem Tempo und der Intensität hingeben, ob düster oder voller Freude.','Die einfache Freude, bei Tageslicht zusammen zu tanzen. Hier zu sein fühlt sich schon gut an; die Musik macht Lust, mitzutanzen.'],
  lines:['Sonnige, groovige und entspannte Musik zum Aufwärmen und für draußen.','Melodisch und zunehmend energiegeladen, auf dem Weg zur Tanzfläche.','Kraftvoll und treibend. Musik für die volle Tanzfläche.','Melancholisch, hypnotisch und tief. Nachtmusik mit Gefühl.','Die Tracks, zu denen ich immer wieder zurückkehre.','Hard Techno und Hard Trance aus dem Keller. Dunkel oder fröhlich, immer schnell und voller Energie.','Fröhlicher House zum Tanzen bei Tageslicht und für entspannte Nachmittage.'] }
};
words.en.places.push('A safe, quiet space to lie down, relax and feel good. Nothing demanding your energy.', 'Tracks I could play to close a set.');
words.de.places.push('Ein sicherer, ruhiger Ort zum Hinlegen, Entspannen und Wohlfühlen. Hier musst du nichts leisten.', 'Tracks, mit denen ich ein Set beenden könnte.');
Object.assign(words.en, {special:'Special', stations:'Change stage', closeStations:'Close stages', stationPosition:'Stage', swipeHint:'Swipe to change stage', audience:'listening to this stage'});
Object.assign(words.de, {special:'Besonders', stations:'Bühne wechseln', closeStations:'Bühnen schließen', stationPosition:'Bühne', swipeHint:'Wischen, um die Bühne zu wechseln', audience:'hören auf dieser Bühne'});
words.en.lines.push('Ambiance', 'Closing');
words.de.lines.push('Ambiance', 'Closing');
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
let audienceController, audienceData=null;
const delays = [1000, 2000, 4000, 8000];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const mobileLayout = matchMedia('(max-width: 760px)');
let photoRequest = '', photoVersion = 0, photoAnimation, sceneID = '';
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
        photoAnimation = incoming.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 350, easing: 'ease-out' });
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

function revealStation(smooth = false) {
  const rail = $('station-selector');
  const selected = location.hash === '#bus' ? $('bus-link') : document.querySelector(`input[value="${currentMood.id}"]`).parentElement;
  if (!selected || rail.scrollWidth <= rail.clientWidth) return;
  const bounds = rail.getBoundingClientRect(), item = selected.getBoundingClientRect();
  const left = item.left < bounds.left + 24 || item.right > bounds.right - 24 ? (item.left + item.right - bounds.left - bounds.right) / 2 : 0;
  if (left) rail.scrollBy({ left, behavior: smooth && !reducedMotion.matches ? 'smooth' : 'instant' });
}
document.fonts.ready.then(() => revealStation());
window.addEventListener('resize', () => revealStation());
document.documentElement.toggleAttribute('data-page-hidden', document.hidden);
document.addEventListener('visibilitychange', () => {
  document.documentElement.toggleAttribute('data-page-hidden', document.hidden);
  if (document.hidden) {
    photoAnimation?.cancel();
    $('mood-name').getAnimations().forEach(animation => animation.cancel());
  }
});
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) {
    photoAnimation?.cancel();
    $('mood-name').getAnimations().forEach(animation => animation.cancel());
  }
});

function setTitle(element, [roman, italic]) {
  const em = Object.assign(document.createElement('em'), { textContent: italic });
  element.replaceChildren(...(roman ? [`${roman} `, em] : [em]));
}

for (const mood of moods) {
  const label = document.createElement('label');
  label.className = mood.stage ? 'mood' : 'mood is-soon';
  const input = Object.assign(document.createElement('input'), { type: 'radio', name: 'mood', value: mood.id });
  const text = Object.assign(document.createElement('span'), { textContent: plain(mood) });
  text.dataset.soon = words[language].soonSuffix;
  const thumbnail = Object.assign(document.createElement('img'), {className:'mood-preview', src:mood.photos[0].src, alt:'', width:52, height:52, loading:'lazy', decoding:'async'});
  thumbnail.style.objectPosition = mood.photos[0].focus;
  label.append(input, thumbnail, text);
  if (mood.stage==='essentials') {
    label.classList.add('mood-essentials');label.title=plain(mood);text.className='visually-hidden';
    const globe=document.createElementNS('http://www.w3.org/2000/svg','svg');
    globe.setAttribute('viewBox','0 0 36 36');globe.setAttribute('class','essentials-icon');globe.setAttribute('aria-hidden','true');
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d','M28 21a11 11 0 1 1-22 0 11 11 0 0 1 22 0ZM9 14l6 1 2 4-4 2-1 4-5-1m17-10-4 5 4 3-2 6M28 2v8m-4-4h8M5 4v4M3 6h4M31 28v4m-2-2h4');
    globe.append(path);label.prepend(globe);
    const badge=Object.assign(document.createElement('small'),{className:'special-tag',textContent:words[language].special});
    badge.dataset.copy='special';label.append(badge);
  }
  $('moods').insertBefore(label, $('bus-link'));
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
$('open-stations').addEventListener('click', () => {
  $('stations-sheet').showModal();
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
  const index=(moods.indexOf(currentMood)+(x<0?1:-1)+moods.length)%moods.length;
  selectMood(moods[index].id);
});

function metadata(value) {
  track = value;
  $('player-title').textContent = track ? track.title || text('untitled') : currentMood.stage ? text('noTrack') : text('notOnAir');
  $('player-artist').textContent = track ? track.artist || text('unknownArtist') : plain(currentMood);
  $('player-album').textContent = track?.album || '';
  if ('mediaSession' in navigator && 'MediaMetadata' in window) {
    navigator.mediaSession.metadata = track ? new MediaMetadata({
      title: track.title || text('untitled'), artist: track.artist || '', album: plain(currentMood),
    }) : null;
  }
  announceRadio();
}

function changePhoto() {
  currentMood.photoIndex = ((currentMood.photoIndex ?? -1) + 1) % currentMood.photos.length;
  renderScene();
}
$('change-photo').addEventListener('click', changePhoto);

function renderScene() {
  const bus = location.hash === '#bus';
  const photo = bus ? { src: 'photos/bus-stage.jpg', focus: '50% 50%' }
    : currentMood.photos[currentMood.photoIndex ?? 0];
  document.body.toggleAttribute('data-bus', bus);
  $('bus-copy').hidden = !bus;
  if (bus) $('bus-link').setAttribute('aria-current', 'page');
  else $('bus-link').removeAttribute('aria-current');
  $('change-photo').hidden = bus || currentMood.photos.length < 2;
  $('photo-controls').hidden = $('change-photo').hidden;
  showPhoto(photo);
  document.title = `${bus ? 'The Bus' : plain(currentMood)} · Pavoia Radio`;
  const nextScene = bus ? 'bus' : currentMood.id;
  if (nextScene !== sceneID) {
    const title = $('mood-name');
    setTitle(title, bus ? ['The', 'Bus'] : currentMood.title);
    title.getAnimations().forEach(animation => animation.cancel());
    if (sceneID && !reducedMotion.matches && !document.hidden) title.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'ease-out' });
    revealStation(Boolean(sceneID));
      sceneID = nextScene;
  }
  const index=moods.indexOf(currentMood);
  $('mood-place').textContent = bus ? text('busPlace') : words[language].places[Number(currentMood.id)-1];
  $('station-position').textContent = `${index+1} / ${moods.length}`;
  $('station-position').setAttribute('aria-label', `${text('stationPosition')} ${index+1} / ${moods.length}: ${plain(currentMood)}`);
  $('station-position').hidden = bus;
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
  $('live-text').textContent = currentMood.stage ? text('connecting') : text('soon');
  $('live-text').removeAttribute('aria-label');
  button.disabled = !currentMood.stage;
  document.querySelector(`input[value="${currentMood.id}"]`).checked = true;
  metadata(null);
  if (currentMood.stage) $('player-title').textContent = text('loading');
}

function state(value, status) {
  playbackState=value; playbackText=status;
  document.querySelector('.player').dataset.state = value;
  document.body.toggleAttribute('data-playing', value === 'playing');
  document.body.toggleAttribute('data-wanted', wanted);
  button.setAttribute('aria-pressed', String(wanted));
  button.setAttribute('aria-label', wanted ? text('pause') : value === 'error' ? text('retry') : text('play'));
  $('playback-status').textContent = text(status);
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = value === 'playing' ? 'playing' : 'paused';
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
  state('paused', currentMood.stage ? 'paused' : 'soon');
}

function fail(token, blocked = false) {
  if (!wanted || token !== generation) return;
  release();
  if (blocked || retries >= delays.length) {
    wanted = false;
    state('error', blocked ? 'blocked' : 'error');
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
  const handlers = {
    playing: () => {
      if (!current() || audio.paused || audio.readyState < 3) return;
      clearTimeout(watchdog);
      watchdog = null;
      clearTimeout(healthyTimer);
      healthyTimer = setTimeout(() => { if (current()) retries = 0; }, 30000);
      state('playing', 'playing');
    },
    waiting: () => {
      if (!current()) return;
      clearTimeout(healthyTimer);
      state('connecting', 'buffering');
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


button.addEventListener('click', () => wanted ? pause() : play());
if ('mediaSession' in navigator) {
  for (const [action, handler] of Object.entries({ play, pause, stop: pause })) {
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

async function pollListeners() {
  if (document.hidden || audienceController) return;
  const controller=new AbortController(),stage=currentMood.stage;
  audienceController=controller;
  const timeout=setTimeout(()=>controller.abort(),3000);
  try {
    const response=await fetch('/api/audience?stage='+encodeURIComponent(stage), {cache:'no-store',signal:controller.signal});
    if (!response.ok) throw new Error('status');
    const value=await response.json();
    if (!value || typeof value.available!=='boolean' || (value.available && (!Number.isInteger(value.listeners) || value.listeners<0 || !Number.isFinite(Date.parse(value.measuredAt))))) throw new Error('audience');
    if (audienceController===controller && currentMood.stage===stage) audienceData=value;
  } catch {
    if (audienceController===controller) audienceData=null;
  } finally {
    clearTimeout(timeout);
    if (audienceController===controller) {audienceController=null;renderStatus();}
  }
}

function selectMood(id) {
  const next = moods.find(mood => mood.id === id);
  if (!next) return;
  closeStations();
  leaveBus();
  if (next === currentMood) return;
  window.Pavoia?.cancelPreview?.();
  clearTimeout(retryTimer);
  release();
  retries = 0;
  if (pollController) pollController.abort();
  pollController = null;
  audienceController?.abort();audienceController=null;audienceData=null;
  currentMood = next;
  radioData=null; dataFresh=false; loading=Boolean(next.stage);
  if (!next.stage) wanted = false;
  render();
  if (wanted) connect();
  else state('paused', next.stage ? 'paused' : 'soon');
  poll();
  pollListeners();
}
$('moods').addEventListener('change', event => selectMood(event.target.value));

document.addEventListener('visibilitychange', () => { if (!document.hidden) {poll();pollListeners();} else {audienceController?.abort();} });
arrangeStations();
localise();
render();
state('paused', 'paused');
poll();
setInterval(poll, 10000);
pollListeners();
setInterval(pollListeners, 1000);
audio.addEventListener('playing',pollListeners);

function renderStatus() {
  document.body.toggleAttribute('data-on-air',Boolean(dataFresh && track));
  if (!currentMood.stage) { $('live-text').textContent=text('soon'); return; }
  if (loading) { $('live-text').textContent=text('connecting'); return; }
  if (!dataFresh) {
    $('live-text').textContent=text('offline');
    $('live-text').removeAttribute('aria-label');
    if (!track) $('player-title').textContent=text('unavailableTrack');
    return;
  }
  const { listeners: count, measuredAt, available }=audienceData || {};
  const fresh=Number.isFinite(Date.parse(measuredAt)) && Math.abs(Date.now()-Date.parse(measuredAt))<=5000;
  const known=fresh && available && Number.isInteger(count) && count>=0;
  $('live-text').textContent=track ? known ? `${text('live')} · ${count}` : text('live') : text('standby');
  const hint=known ? `${count} ${text('audience')}: ${plain(currentMood)}` : text('audienceUnknown');
  $('live-text').setAttribute('aria-label',hint);
  $('live-text').title=hint;
}

function localise() {
  document.documentElement.lang=language;
  $('language').value=language;
  $('language').setAttribute('aria-label',text('language'));
  $('close-stations').setAttribute('aria-label',text('closeStations'));
  $('change-photo').setAttribute('aria-label',text('changePhoto'));
  $('change-photo').title=text('changePhoto');
  document.querySelectorAll('[data-copy]').forEach(node=>{node.textContent=text(node.dataset.copy);});
  document.querySelectorAll('.mood span').forEach(node=>{node.dataset.soon=text('soonSuffix');});
  document.querySelector('.wordmark').setAttribute('aria-label',text('home'));
  document.querySelector('.player').setAttribute('aria-label',text('player'));
  renderScene();
  metadata(track);
  if (!dataFresh && 'mediaSession' in navigator) navigator.mediaSession.metadata=null;
  renderStatus();
  state(playbackState,playbackText);
}
$('language').addEventListener('change',()=>{
  if (!Object.hasOwn(words,$('language').value)) return;
  language=$('language').value;
  try { localStorage.setItem('pavoia-language',language); } catch { /* Storage is optional. */ }
  localise();
});

function announceRadio() {
  if (window.dispatchEvent) window.dispatchEvent(new CustomEvent('pavoia:radio'));
}
window.Pavoia = { stations: moods.map(m => ({id:m.stage, name:plain(m)})), getState: () => ({track, stage:currentMood.stage, name:plain(currentMood), language, wanted, playbackState, playbackText, dataFresh}),
  play, pause, renderScene, toggle: () => wanted ? pause() : play() };
