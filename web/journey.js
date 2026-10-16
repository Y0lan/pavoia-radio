'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const radio = window.Pavoia;
  // The artist row in the bar scrolls sideways when names do not fit. A plain mouse wheel scrolls it
  // too, until its end, and data-before and data-more fade each edge where names wait.
  const credits = $('credited-artists');
  const moreCredits = () => {
    credits.toggleAttribute('data-before', credits.scrollLeft>1);
    credits.toggleAttribute('data-more', credits.scrollWidth-credits.scrollLeft-credits.clientWidth>1);
  };
  credits.addEventListener('scroll', moreCredits, {passive:true});
  window.addEventListener('resize', moreCredits);
  credits.addEventListener('wheel', event => {
    // Ctrl+wheel and pinch stay the browser's zoom. deltaMode counts pixels, lines or pages.
    // The browser clamps scrollLeft at both ends, fractional ones too: the page keeps the wheel
    // whenever the row did not move. An event the page cannot cancel is the page's, so both never move.
    if (!event.cancelable || event.ctrlKey || Math.abs(event.deltaX)>=Math.abs(event.deltaY)) return;
    const before=credits.scrollLeft;
    credits.scrollLeft=before+event.deltaY*[1,16,credits.clientWidth][event.deltaMode];
    if (credits.scrollLeft!==before) event.preventDefault();
  }, {passive:false});
  const playlists = [
    ['bermuda-day','Under the Sun','72rXpksfahfeQ7h1Xge02n'],
    ['bermuda-evening','As Night Begins','1OIvw3QkFGru27JDgXK49d'],
    ['palac-dance','Night in Motion','7kl1EQc1ZnvLq8vZXH3qaJ'],
    ['palac-feel','Lost in Feelings','4ZyQd8CWhF3uO8C6sHcACS'],
    ['essentials','Essentials','5X4mHMKyWISt9RldrxuDb8'],
  ];
  const copy = {
    en:{ deeper:"See the roots it's built on",explore:'Explore',exploreLabel:'EXPLORE',connections:'Follow the music.',
      spotifyTrack:'Open track on Spotify',spotifyStage:'Follow this playlist on Spotify',spotifyDaily:'I add new tracks every day',volume:'Volume',
      searchLabel:'Artist, track, release or label',search:'Search',
      playRadio:'Play radio',pauseRadio:'Pause radio',backListen:'Back to listening ↙',mapNote:'Choose a connection to continue exploring.',
      loading:'Loading the connections…',unavailable:'These details are unavailable. Try another record or search again.',empty:'No matches in the radio catalogue.',
      artist:'Artist',track:'Track',release:'Release',label:'Label',playlist:'Playlist',primary:'Artist',featured:'Featuring',remixer:'Remixed by',
      similar:'Similar artist',related:'Related artist',collaboration:'Collaboration',remix:'Remix',shared_release:'Shared release','musicbrainz:member of band':'Band member','musicbrainz:is person':'Identity','musicbrainz:collaboration':'Collaboration',
      selected:'Selected for radio',favorite:'Essentials favorite',moreBio:'Read the biography',bioSource:'Biography source',
      bioEnglish:'Biography in English',held:'Artist details are being checked.',relatedTitle:'Connections',tracks:'Tracks in the selection',
      preview:'Listen · 60 seconds',previewPending:'No audio preview available yet.',stopPreview:'Stop preview',previewError:'The preview could not play. Try again.',
      results:'results',firstResults:'Showing up to 40 matches.',limited:'Showing the nearest connections. Search to explore further.',
      basicDetails:'Artist and release profiles are not available for this track yet.',cover:'Release artwork',portrait:'Artist portrait',source:'Source',
    },
    de:{ deeper:'Entdecke die Wurzeln dahinter',explore:'Entdecken',exploreLabel:'ENTDECKEN',connections:'Folge der Musik.',
      spotifyTrack:'Track auf Spotify öffnen',spotifyStage:'Folge dieser Playlist auf Spotify',spotifyDaily:'Ich füge jeden Tag neue Tracks hinzu',volume:'Lautstärke',
      searchLabel:'Künstler, Track, Veröffentlichung oder Label',search:'Suchen',
      playRadio:'Radio abspielen',pauseRadio:'Radio pausieren',backListen:'Zurück zum Radio ↙',mapNote:'Wähle eine Verbindung und entdecke mehr.',
      loading:'Verbindungen werden geladen…',unavailable:'Diese Details sind nicht verfügbar. Wähle einen anderen Eintrag oder suche erneut.',empty:'Keine Treffer im Radiokatalog.',
      artist:'Künstler',track:'Track',release:'Veröffentlichung',label:'Label',playlist:'Playlist',primary:'Künstler',featured:'Mit',remixer:'Remix von',
      similar:'Ähnlicher Künstler',related:'Verwandter Künstler',collaboration:'Zusammenarbeit',remix:'Remix',shared_release:'Gemeinsame Veröffentlichung','musicbrainz:member of band':'Bandmitglied','musicbrainz:is person':'Identität','musicbrainz:collaboration':'Zusammenarbeit',
      selected:'Für das Radio ausgewählt',favorite:'Essentials-Favorit',moreBio:'Biografie lesen',bioSource:'Quelle der Biografie',
      bioEnglish:'Biografie auf Englisch',held:'Die Künstlerdaten werden geprüft.',relatedTitle:'Verbindungen',tracks:'Tracks in der Auswahl',
      preview:'Anhören · 60 Sekunden',previewPending:'Noch keine Hörprobe verfügbar.',stopPreview:'Hörprobe stoppen',previewError:'Die Hörprobe konnte nicht starten. Bitte erneut versuchen.',
      results:'Treffer',firstResults:'Bis zu 40 Treffer werden angezeigt.',limited:'Die nächsten Verbindungen werden angezeigt. Suche, um mehr zu entdecken.',
      basicDetails:'Für diesen Track gibt es noch keine Künstler- und Veröffentlichungsprofile.',cover:'Cover der Veröffentlichung',portrait:'Künstlerporträt',source:'Quelle',
    },
  };
  Object.assign(copy.en, {exploreTab:'Explore',history:'History',statistics:'Music statistics',stage:'Stage',period:'Period',day:'Last 24 hours',week:'Last 7 days',month:'Last 30 days',allHistory:'All recorded history',older:'Older tracks',radioSelection:'All radio selections',library:'Whole music library',historyNote:'Confirmed broadcast starts. Times use your local timezone.',noHistory:'No broadcasts recorded in this period.',musicLoading:'Loading the music…',noOverlap:'No shared tracks.',musicError:'These records could not load.',retry:'Try again',selection:'In the selection',artistCredits:'Artist credits',releases:'Releases',hours:'Hours of music',topArtists:'Artists in the selection',years:'Release years',labels:'Labels',genres:'Track tags',overlap:'Shared with other stages',stageSizes:'Tracks per stage',coverage:'tracks with metadata',missingMetadata:'No metadata available yet.',snapshot:'Selection checked',definitions:'Each track is counted once per selection. Artist credits are kept as credited, including collaborations. Shared tracks can appear on several stages.',broadcasts:'Broadcast starts',differentTracks:'Different tracks played',unplayed:'Selected tracks not played',frequent:'Most played · last 30 days',broadcastNote:'Broadcast statistics cover the last 30 days, or the available history if shorter. They count starts, not completed listens.',recordingSince:'Earliest recorded start',broadcastError:'Broadcast statistics are unavailable. Selection statistics are shown below.',noPlays:'No broadcasts recorded yet.',plays:'plays',topNote:'All known release years, newest first. Other charts show up to 12 entries. Missing metadata is excluded.',statisticsNote:'Selection snapshots include playlist tracks; a station can play only tracks with accessible audio.'});
  Object.assign(copy.de, {exploreTab:'Entdecken',history:'Verlauf',statistics:'Musikstatistik',stage:'Bühne',period:'Zeitraum',day:'Letzte 24 Stunden',week:'Letzte 7 Tage',month:'Letzte 30 Tage',allHistory:'Gesamter Verlauf',older:'Ältere Tracks',radioSelection:'Alle Radioauswahlen',library:'Gesamte Musikbibliothek',historyNote:'Bestätigte Sendestarts. Die Zeiten entsprechen deiner lokalen Zeitzone.',noHistory:'In diesem Zeitraum wurden keine Sendestarts erfasst.',musicLoading:'Musik wird geladen…',noOverlap:'Keine gemeinsamen Tracks.',musicError:'Diese Daten konnten nicht geladen werden.',retry:'Erneut versuchen',selection:'Tracks in der Auswahl',artistCredits:'Künstlerangaben',releases:'Veröffentlichungen',hours:'Stunden Musik',topArtists:'Künstler in der Auswahl',years:'Erscheinungsjahre',labels:'Labels',genres:'Track-Tags',overlap:'Gemeinsam mit anderen Bühnen',stageSizes:'Tracks je Bühne',coverage:'Tracks mit Metadaten',missingMetadata:'Noch keine Metadaten verfügbar.',snapshot:'Auswahl geprüft',definitions:'Jeder Track zählt einmal pro Auswahl. Künstlerangaben bleiben einschließlich Zusammenarbeiten erhalten. Gemeinsame Tracks können auf mehreren Bühnen erscheinen.',broadcasts:'Sendestarts',differentTracks:'Verschiedene gespielte Tracks',unplayed:'Ausgewählte, nicht gespielte Tracks',frequent:'Am häufigsten gespielt · letzte 30 Tage',broadcastNote:'Sendestatistiken zeigen die letzten 30 Tage oder den kürzeren verfügbaren Verlauf. Sie zählen Starts, keine vollständigen Hörvorgänge.',recordingSince:'Frühester erfasster Start',broadcastError:'Sendestatistiken sind nicht verfügbar. Die Auswahlstatistiken stehen unten.',noPlays:'Noch keine Sendestarts erfasst.',plays:'Starts',topNote:'Alle bekannten Erscheinungsjahre, neueste zuerst. Andere Diagramme zeigen bis zu 12 Einträge. Fehlende Metadaten werden nicht mitgezählt.',statisticsNote:'Auswahlstatistiken enthalten Playlist-Tracks. Ein Sender kann nur Tracks mit verfügbaren Audiodateien abspielen.'});
  const word = key => copy[radio.getState().language][key] || key;
  const node = (tag,cls,value) => {const n=document.createElement(tag);if(cls)n.className=cls;if(value)n.textContent=value;return n;};
  const entityID = value => /^(?:(?:art|trk|rel|lab|pl)_[a-f0-9]{12}|plex_[0-9]{1,32})$/.test(value || '');
  const imagePath = value => typeof value==='string' && (/^\/api\/discovery\/media\/[a-f0-9]{40}$/.test(value) || /^\/api\/(?:radio\/[a-z-]+|library)\/artwork\/\d+\/(cover|portrait)\?v=[a-f0-9]{16}$/.test(value));
  const external = value => {try {const u=new URL(value);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null;} catch{return null;}};
  function link(label,url) {const a=node('a','',label);a.href=external(url);a.target='_blank';a.rel='noopener noreferrer';return a;}
  function image(element,url,alt) {
    element.alt=alt;
    if (!imagePath(url)) {element.hidden=true;element.removeAttribute('src');return;}
    if (element.getAttribute('src')===url)return;
    element.hidden=true;
    element.onload=()=>{element.hidden=false;};
    function load(attempt=0) {
      const failed=()=>{
        element.hidden=true;
        if(attempt<2)setTimeout(()=>{
          if(element.isConnected&&element.onerror===failed&&element.getAttribute('src')===url)load(attempt+1);
        },attempt===0?1000:5000);
        else element.removeAttribute('src');
      };
      element.onerror=failed;element.src=url;
    }
    load();
  }
  function action(title,handler,cls='entity-link') {const b=node('button',cls,title);b.type='button';b.addEventListener('click',handler);return b;}
  let enriched=null, nowKey='', nowRequest=null, explorerRequest=null, selected=null, preview=null, currentLanguage='', renderedPlayer='';
  const dialog=$('explorer');
  async function request(path,signal) {
    const res=await fetch(path,{signal,cache:'no-cache'});
    if(!res.ok)throw new Error('unavailable');
    const data=await res.json();
    if(!entityID(data.entity?.id)||!Array.isArray(data.included))throw new Error('schema');
    return data;
  }
  async function enrich() {
    const s=radio.getState(),key=s.stage+':'+(s.track?.id||'');
    if(key===nowKey){renderPlayer();return;}
    nowKey=key;nowRequest?.abort();enriched=null;renderPlayer();
    if(!s.track)return;
    const controller=new AbortController();nowRequest=controller;
    const timeout=setTimeout(()=>controller.abort(),10000);
    try {const data=await request('/api/discovery/track/'+encodeURIComponent(s.track.id),controller.signal);
      if(nowKey!==key||nowRequest!==controller)return;enriched=data;renderPlayer();
    } catch {if(nowRequest===controller)nowKey='';} finally {clearTimeout(timeout);}
  }
  function renderPlayer() {
    const s=radio.getState(),t=s.track,e=enriched?.entity,all=enriched?.included||[];
    const cover=e?.image||t?.coverUrl;
    const people=all.filter(v=>v.type==='artist'&&(e?.connections||[]).some(c=>c.id===v.id&&['primary','featured','remixer'].includes(c.relation)));
    const portraits=people.filter(a=>a.image);
    image($('hero-cover'),cover,word('cover'));
    // Without a cover the bar shows the stage, so the record cell never starts on an empty square.
    const dock=$('dock-cover'),thumb=radio.stations.find(v=>v.id===s.stage).thumb;
    if(imagePath(cover))image(dock,cover,word('cover'));
    else if(dock.getAttribute('src')!==thumb){dock.onload=dock.onerror=null;dock.alt='';dock.src=thumb;dock.hidden=false;}
    image($('painted-artist'),portraits[0]?.image||t?.artistImageUrl,'');
    $('explorer-play').textContent=s.wanted?word('pauseRadio'):word('playRadio');
    const key=JSON.stringify([s.stage,s.language,t,enriched]);
    // Playback and audience updates must not replace focused record controls.
    if (key !== renderedPlayer) {
      renderedPlayer=key;
      const pl=playlists.find(p=>p[0]===s.stage);
      $('stage-spotify').hidden=!pl;
      if(pl){$('stage-spotify').href='https://open.spotify.com/playlist/'+pl[2];}
      const root=e?.id||(t?'plex_'+t.id:'');
      if(entityID(root))$('player-title').href='#explore/'+root;else $('player-title').removeAttribute('href');
      const spotify=e?.links?.find(l=>l.kind==='spotify'&&external(l.url));
      $('track-spotify').hidden=!spotify;if(spotify)$('track-spotify').href=spotify.url;
      const release=all.find(v=>v.type==='release' && entityID(v.id) && e?.connections?.some(c=>c.id===v.id && c.relation==='release'));
      if(release && t?.album)$('player-album').href='#explore/'+release.id;
      else $('player-album').removeAttribute('href');
      const label=all.find(v=>v.type==='label');
      $('label-note').hidden=!label;$('label-note').replaceChildren();
      if(label){const button=action(label.title,()=>openEntity(label.id));button.setAttribute('aria-label',word('label')+': '+label.title);$('label-note').append(button);}
      $('credited-artists').replaceChildren(...people.slice(0,5).map(a=>{
        const role=e.connections.find(c=>c.id===a.id)?.relation;
        const b=action('',()=>openEntity(a.id),'artist-credit');
        if(a.image){const img=node('img');img.width=52;img.height=52;image(img,a.image,word('portrait'));b.append(img);}
        const text=node('span');text.append(node('small','',word(role)),node('span','',a.title));b.append(text);return b;
      }));
      $('credited-artists').scrollLeft=0;moreCredits();
    }
    if('mediaSession' in navigator && 'MediaMetadata' in window){
      const playing=preview?.entity||(s.dataFresh?t:null),art=preview?.entity.image||cover;
      navigator.mediaSession.metadata=playing?new MediaMetadata({title:playing.title||'',artist:playing.artist||'',album:preview?playing.album||'':s.name,artwork:imagePath(art)?[{src:art}]:[]}):null;
      if(preview)navigator.mediaSession.playbackState=$('preview-audio').paused?'paused':'playing';
      else navigator.mediaSession.playbackState=s.playbackState==='playing'?'playing':'paused';
    }
    clock();
  }
  function clock() {
    const s=radio.getState(),t=s.track;
    const duration=t?.durationMs/1000,start=Date.parse(t?.startedAt);
    const elapsed=Math.max(0,Math.min(duration,(Date.now()-start)/1000));
    const format=n=>Math.floor(n/60)+':'+String(Math.floor(n%60)).padStart(2,'0');
    const valid=s.dataFresh&&Number.isFinite(duration)&&duration>0&&Number.isFinite(elapsed);
    $('track-clock').textContent=valid?format(elapsed)+' / '+format(duration):'—';
    $('track-progress').value=valid?elapsed/duration:0;
    $('track-progress').setAttribute('aria-label',radio.getState().language==='de'?'Fortschritt des Live-Tracks':'Live track progress');
  }
  function localise() {
    for(const n of document.querySelectorAll('[data-journey]'))n.textContent=word(n.dataset.journey);
    $('stage-spotify').setAttribute('aria-label',word('spotifyStage'));
    $('stage-spotify').title=word('spotifyStage');
    $('track-spotify').setAttribute('aria-label',word('spotifyTrack'));
    $('track-spotify').title=word('spotifyTrack');
    renderPlayer();if(selected)renderEntity(selected);
    $('explorer-title').textContent=word(view==='explore'?'connections':view);
    if(dialog.open&&view!=='explore'){fillStages($('music-stage').value);loadMusic();}
  }
  function navigate(id) {history.pushState(null,'','#explore/'+id);radio.renderScene();loadEntity(id);}
  function openEntity(id) {if(!entityID(id))return;if(!dialog.open)dialog.showModal();navigate(id);}
  async function loadEntity(id) {
    setView('explore');
    selected=null;explorerRequest?.abort();const controller=new AbortController();explorerRequest=controller;
    $('discovery-status').textContent=word('loading');$('discovery-results').hidden=true;$('explore-workspace').hidden=true;
    const timeout=setTimeout(()=>controller.abort(),10000);
    try{const data=await request('/api/discovery/entity/'+id,controller.signal);
      if(explorerRequest!==controller)return;if(id!==data.entity.id){history.replaceState(null,'','#explore/'+data.entity.id);radio.renderScene();}selected=data;renderEntity(data);$('discovery-status').textContent='';
    }catch{if(explorerRequest===controller)$('discovery-status').textContent=word('unavailable');}
    finally{clearTimeout(timeout);}
  }
  radio.openTrack=id=>openEntity('plex_'+id);
  function renderEntity(data) {
    const e=data.entity,all=data.included,byID=new Map(all.map(v=>[v.id,v]));
    const panel=$('entity-inspector');panel.replaceChildren();
    const heading=node('div','entity-heading');
    if(e.image){const img=node('img','entity-image');img.width=100;img.height=100;image(img,e.image,word('cover'));heading.append(img);}
    const title=node('div');title.append(node('p','eyebrow',word(e.type)),node('h3','',e.title));
    if(e.artist)title.append(node('p','entity-subtitle',e.artist));heading.append(title);panel.append(heading);
    const badges=node('div','entity-badges');
    if(e.favorite)badges.append(node('span','favorite-badge',word('favorite')));
    for(const p of e.playlists||[])badges.append(node('span','',p.station));panel.append(badges);
    if(e.album)panel.append(node('p','entity-subtitle',e.album));
    if(e.basicDetails)panel.append(node('p','collection-note',word('basicDetails')));
    if(e.releaseDate)panel.append(node('p','entity-subtitle',e.releaseDate));
    if(e.tags?.length)panel.append(node('p','entity-subtitle',e.tags.join(' · ')));
    if(e.country)panel.append(node('p','entity-subtitle',e.country));
    if(e.reviewRequired)panel.append(node('p','collection-note',word('held')));
    if(e.bio){const details=node('details','entity-bio');details.append(node('summary','',word('moreBio')));
      if(radio.getState().language==='de')details.append(node('small','',word('bioEnglish')));
      const bio=node('p','',e.bio);bio.lang='en';details.append(bio);
      if(external(e.bioUrl))details.append(link(word('bioSource'),e.bioUrl));panel.append(details);}
    const links=node('div','entity-links');for(const l of (e.links||[]).slice(0,8)){if(external(l.url))links.append(link(l.kind.replaceAll('_',' '),l.url));}panel.append(links);
    if(e.type==='track'&&!e.basicDetails){
      if(/^\/api\/discovery\/preview\/trk_[a-f0-9]{12}$/.test(e.previewUrl||''))panel.append(action(word('preview'),()=>startPreview(e),'preview-button'));
      else panel.append(node('p','collection-note',word('previewPending')));
    }
    const list=node('div','entity-connections');list.append(node('h4','',word('relatedTitle')));
    for(const ref of e.connections||[]){const related=byID.get(ref.id);if(!related)continue;
      const b=action('',()=>navigate(ref.id),'connection-row');
      b.append(node('span','relation-kind',word(ref.relation.split('/')[0])),node('span','',related.title));
      if(related.favorite)b.append(node('span','favorite-mark','♥'));list.append(b);
    }if(list.children.length>1)panel.append(list);
    const hasConnections=all.length>0;
    $('connection-map').parentElement.hidden=!hasConnections;
    $('explore-workspace').classList.toggle('is-basic',!hasConnections);
    if(hasConnections)renderMap(e,all);$('explore-workspace').hidden=false;
  }
  function renderMap(e,all) {
    const map=$('connection-map');map.replaceChildren();
    const nearby=all.filter(v=>v.type!=='track').slice(0,8);
    if(!nearby.length)nearby.push(...all.slice(0,6));
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 640 450');svg.setAttribute('aria-hidden','true');
    const coords=nearby.map((v,i)=>({v,x:320+225*Math.cos(-Math.PI/2+i*2*Math.PI/nearby.length),y:225+160*Math.sin(-Math.PI/2+i*2*Math.PI/nearby.length)}));
    for(const p of coords){const line=document.createElementNS(svg.namespaceURI,'line');for(const [k,v] of Object.entries({x1:320,y1:225,x2:p.x,y2:p.y}))line.setAttribute(k,v);svg.append(line);}map.append(svg);
    const center=node('div','map-center');center.append(node('small','',word(e.type)),node('span','',e.title));map.append(center);
    for(const p of coords){const b=action('',()=>navigate(p.v.id),'map-node');b.style.left=(p.x/640*100)+'%';b.style.top=(p.y/450*100)+'%';b.append(node('small','',word(p.v.type)),node('span','',p.v.title));map.append(b);}
  }
  async function search(event) {
    event.preventDefault();selected=null;explorerRequest?.abort();const c=new AbortController();explorerRequest=c;
    $('discovery-status').textContent=word('loading');$('discovery-results').hidden=true;$('explore-workspace').hidden=true;
    const timeout=setTimeout(()=>c.abort(),10000);
    try {const res=await fetch('/api/discovery/search?q='+encodeURIComponent($('discovery-query').value),{signal:c.signal});if(!res.ok)throw new Error();
      const data=await res.json();if(explorerRequest!==c)return;if(!Array.isArray(data.items))throw new Error();
      $('discovery-results').replaceChildren(...data.items.map(e=>{const b=action('',()=>navigate(e.id),'search-result');b.append(node('small','',word(e.type)),node('span','',e.title));return b;}));
      $('discovery-results').hidden=false;$('discovery-status').textContent=data.items.length?word('firstResults'):word('empty');
    }catch{if(explorerRequest===c)$('discovery-status').textContent=word('unavailable');}finally{clearTimeout(timeout);}
  }
  function cancelPreview() {
    preview=null;const audio=$('preview-audio');audio.pause();audio.removeAttribute('src');audio.load();$('preview-banner').hidden=true;
  }
  async function startPreview(e) {
    const resume=preview?preview.resume:radio.getState().wanted;
    cancelPreview();radio.pause();const current={id:e.id,resume,entity:e};preview=current;
    const a=$('preview-audio');a.volume=$('audio').volume;a.src=e.previewUrl;
    $('preview-title').textContent=e.title+' · 60s';$('preview-banner').hidden=false;
    try{await a.play();if(preview===current)renderPlayer();}catch{if(preview===current){cancelPreview();$('discovery-status').textContent=word('previewError');if(resume)radio.play();}}
  }
  function finishPreview() {const resume=preview?.resume;cancelPreview();if(resume)radio.play();else renderPlayer();}
  radio.cancelPreview=cancelPreview;
  radio.stopPreview=()=>{if(!preview)return false;finishPreview();return true;};
  $('preview-audio').addEventListener('ended',finishPreview);
  $('preview-audio').addEventListener('error',()=>{if(preview){$('discovery-status').textContent=word('previewError');finishPreview();}});
  $('preview-stop').addEventListener('click',finishPreview);
  $('explorer-play').addEventListener('click',radio.toggle);
  try{const saved=parseFloat(localStorage.getItem('pavoia-volume'));if(saved>=0&&saved<=1)$('volume').value=saved;}catch{/* Storage is optional. */}
  // Where the stylesheet hides the slider, the device sets the level, so a remembered low volume cannot silence the radio.
  const fixedVolume=matchMedia('(max-width:760px), (pointer:coarse)');
  const volume=()=>{$('audio').volume=$('preview-audio').volume=fixedVolume.matches?1:Number($('volume').value);};volume();
  fixedVolume.addEventListener('change',volume);
  $('volume').addEventListener('input',()=>{volume();try{localStorage.setItem('pavoia-volume',$('volume').value);}catch{/* Storage is optional. */}});
  $('go-deeper').addEventListener('click',()=>{if(enriched)openEntity(enriched.entity.id);else location.hash='explore';});
  function close(){explorerRequest?.abort();musicRequest?.abort();finishPreview();dialog.close();history.replaceState(null,'',location.pathname+location.search);radio.renderScene();}
  $('explorer-close').addEventListener('click',close);dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  $('discovery-search').addEventListener('submit',search);
  let view='explore',musicRequest=null,historyPage=null;
  const stationName = id => radio.stations.find(s=>s.id===id)?.name || id;
  const date = value => new Date(value).toLocaleString(radio.getState().language, {dateStyle:'medium',timeStyle:'short'});
  const number = value => Number(value).toLocaleString(radio.getState().language);
  function fillStages(value) {
    const options=radio.stations.map(s=>[s.id,s.name]);
    if(view==='statistics')options.unshift(['radio',word('radioSelection')],['library',word('library')]);
    $('music-stage').replaceChildren(...options.map(([id,name])=>{const option=node('option','',name);option.value=id;return option;}));
    $('music-stage').value=options.some(([id])=>id===value)?value:radio.getState().stage;
  }
  function setView(next) {
    view=next;musicRequest?.abort();
    $('music-view').hidden=next==='explore';$('discovery-search').hidden=next!=='explore';
    $('discovery-status').hidden=next!=='explore';
    $('explorer-title').textContent=word(next==='explore'?'connections':next);
    for(const link of document.querySelectorAll('.explorer-nav a')) {
      if(link.getAttribute('href')==='#'+next)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
    }
    if(next!=='explore'){
      explorerRequest?.abort();selected=null;$('discovery-results').hidden=true;$('explore-workspace').hidden=true;
      $('history-period-label').hidden=next!=='history';fillStages($('music-stage').value);
    }
  }
  async function readJSON(path,signal) {
    const response=await fetch(path,{signal,cache:'no-cache'});
    if(!response.ok)throw new Error('unavailable');return response.json();
  }
  function metric(label,value) {const d=node('div');d.append(node('dt','',word(label)),node('dd','',number(value)));return d;}
  function chart(title,items,coverage,total,stages=false) {
    const section=node('section','music-chart');section.append(node('h3','',word(title)));
    if(coverage!==null)section.append(node('p','collection-note',number(coverage)+' / '+number(total)+' '+word('coverage')));
    if(!items.length)section.append(node('p','collection-note',word(stages?'noOverlap':'missingMetadata')));
    const max=Math.max(1,...items.map(i=>i.count));
    for(const item of items) {
      const row=node('div','chart-row'),label=node('span','',stages?stationName(item.name):item.name);
      const bar=node('meter');bar.min=0;bar.max=max;bar.value=item.count;bar.setAttribute('aria-label',label.textContent);
      row.append(label,node('span','chart-count',number(item.count)),bar);section.append(row);
    }return section;
  }
  function renderStatistics(data,broadcast) {
    const content=$('music-content'),summary=node('dl','music-summary');
    summary.append(metric('selection',data.tracks),metric('artistCredits',data.artists),metric('releases',data.releases),metric('hours',Math.round(data.durationMs/3600000)));
    content.append(summary,node('p','collection-note',word('definitions')),node('p','collection-note',word('snapshot')+': '+date(data.updatedAt)));
    if(broadcast){
      const counts=node('dl','music-summary broadcast-summary');counts.append(metric('broadcasts',broadcast.plays),metric('differentTracks',broadcast.distinctPlayed),metric('unplayed',broadcast.unplayed));content.append(counts,node('p','collection-note',word('broadcastNote')));
      if(broadcast.earliest)content.append(node('p','collection-note',word('recordingSince')+': '+date(broadcast.earliest)));
      const list=node('section','played-ranking');list.append(node('h3','',word('frequent')));
      if(!broadcast.top.length)list.append(node('p','collection-note',word('noPlays')));
      for(const item of broadcast.top){const b=action('',()=>radio.openTrack(item.id),'connection-row');b.append(node('span','',item.artist+' · '+item.title),node('span','chart-count',number(item.plays)+' '+word('plays')));list.append(b);}content.append(list);
    }else if(radio.stations.some(s=>s.id===data.scope))content.append(node('p','collection-note',word('broadcastError')));
    const charts=node('div','music-charts');
    charts.append(chart('topArtists',data.topArtists,data.coverage.artists,data.tracks),chart(['radio','library'].includes(data.scope)?'stageSizes':'overlap',data.stages,null,data.tracks,true),chart('labels',data.labels,data.coverage.labels,data.tracks),chart('years',data.years,data.coverage.years,data.tracks));
    if(data.genres.length)charts.append(chart('genres',data.genres,data.coverage.genres,data.tracks));
    content.append(charts,node('p','collection-note',word('topNote')),node('p','collection-note',word('statisticsNote')));
  }
  async function loadMusic(more=false) {
    musicRequest?.abort();const controller=new AbortController();musicRequest=controller;
    const timeout=setTimeout(()=>controller.abort(),12000),scope=$('music-stage').value,mode=view;
    $('music-status').textContent=word('musicLoading');$('history-more').hidden=true;
    if(!more){$('music-content').replaceChildren();historyPage=null;}
    try {
      if(mode==='history'){
        const until=more?historyPage.until:new Date().toISOString(),period=$('history-period').value;
        const from=more?historyPage.from:period==='all'?new Date(0).toISOString():new Date(Date.parse(until)-Number(period)*86400000).toISOString();
        const query=new URLSearchParams({from,until,limit:'50'});if(more)query.set('before',historyPage.next);
        const data=await readJSON('/api/radio/'+scope+'/history?'+query,controller.signal);
        if(musicRequest!==controller)return;
        historyPage=data;
        for(const item of data.items){const row=action('',()=>radio.openTrack(item.id),'history-row');const when=node('time','',date(item.startedAt));when.dateTime=item.startedAt;
          const record=node('span','history-record');record.append(node('strong','',item.title),node('span','',item.artist));row.append(when,record,node('small','',stationName(scope)));$('music-content').append(row);}
        $('music-status').textContent=$('music-content').children.length?word('historyNote'):word('noHistory');$('history-more').hidden=!data.next;
      }else{
        const [data,broadcast]=await Promise.all([readJSON('/api/library/statistics?scope='+scope,controller.signal),radio.stations.some(s=>s.id===scope)?readJSON('/api/radio/'+scope+'/music',controller.signal).catch(()=>null):null]);
        if(musicRequest!==controller)return;renderStatistics(data,broadcast);$('music-status').textContent='';
      }
    }catch {if(musicRequest===controller){$('music-status').replaceChildren(node('span','',word('musicError')+' '),action(word('retry'),()=>loadMusic(more)));}}
    finally{clearTimeout(timeout);}
  }
  $('music-filters').addEventListener('submit',event=>event.preventDefault());
  $('music-stage').addEventListener('change',()=>loadMusic());$('history-period').addEventListener('change',()=>loadMusic());
  $('history-more').addEventListener('click',()=>loadMusic(true));
  function restore(){
    const candidate=location.hash.startsWith('#explore/')?location.hash.slice(9):'';
    const id=entityID(candidate)?candidate:null;
    const section=location.hash.slice(1);
    if(id){if(!dialog.open)dialog.showModal();loadEntity(id);}
    else if(['explore','history','statistics'].includes(section)){
      if(!dialog.open)dialog.showModal();setView(section);
      if(section!=='explore')loadMusic();else{
        explorerRequest?.abort();explorerRequest=null;selected=null;
        $('discovery-status').textContent='';$('discovery-results').hidden=true;$('explore-workspace').hidden=true;
        $('discovery-query').focus();
      }
    }else if(dialog.open){explorerRequest?.abort();musicRequest?.abort();finishPreview();dialog.close();}
  }
  window.addEventListener('popstate',restore);
  window.addEventListener('hashchange',restore);
  window.addEventListener('pavoia:radio',()=>{const lang=radio.getState().language;if(currentLanguage!==lang){currentLanguage=lang;localise();}enrich();});
  currentLanguage=radio.getState().language;localise();enrich();restore();setInterval(clock,1000);
})();
