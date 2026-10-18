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
    en:{ deeper:'See the roots it’s built on',roots:'The roots',back:'Back to listening',
      spotifyTrack:'Open track on Spotify',spotifyStage:'Follow this playlist on Spotify',spotifyDaily:'I add new tracks every day',volume:'Volume',
      searchLabel:'Artist, track, release or label',searchPlaceholder:'Search artists, tracks, releases, labels',nothingOnAir:'Nothing on air right now. Search to start.',
      loading:'Loading the connections…',unavailable:'These details are unavailable. Try another record or search again.',empty:'No matches in the radio catalogue.',
      artist:'Artist',track:'Track',release:'Release',label:'Label',playlist:'Playlist',primary:'Artist',featured:'Featuring',remixer:'Remixed by',
      similar:'Similar',collaboration:'Collaboration',remix:'Remix','musicbrainz:member of band':'Band member','musicbrainz:collaboration':'Collaboration',
      favorite:'Essentials favourite',onRadio:'On the radio',bioFrom:'Biography from',more:'More',less:'Less',moreRoots:'more',trail:'Path',
      bioEnglish:'Biography in English',held:'Artist details are being checked.',artists:'Artists',tracks:'Tracks',
      preview:'Listen · 60 s',stopPreview:'Stop',previewError:'The preview could not play. Try again.',
      result:'result',results:'results',firstResults:'First 40 results. Add a word to narrow them.',
      basicDetails:'Artist and release profiles are not available for this track yet.',cover:'Release artwork',portrait:'Artist portrait',
      artistImage:'Portrait',releaseImage:'Cover',trackImage:'Cover',labelImage:'Label logo',playlistImage:'Cover',
    },
    de:{ deeper:'Entdecke die Wurzeln dahinter',roots:'Die Wurzeln',back:'Zurück zum Radio',
      spotifyTrack:'Track auf Spotify öffnen',spotifyStage:'Folge dieser Playlist auf Spotify',spotifyDaily:'Ich füge jeden Tag neue Tracks hinzu',volume:'Lautstärke',
      searchLabel:'Künstler, Track, Veröffentlichung oder Label',searchPlaceholder:'Künstler, Tracks, Alben, Labels suchen',nothingOnAir:'Gerade läuft nichts. Suche, um anzufangen.',
      loading:'Verbindungen werden geladen…',unavailable:'Diese Details sind nicht verfügbar. Wähle einen anderen Eintrag oder suche erneut.',empty:'Keine Treffer im Radiokatalog.',
      artist:'Künstler',track:'Track',release:'Veröffentlichung',label:'Label',playlist:'Playlist',primary:'Künstler',featured:'Mit',remixer:'Remix von',
      similar:'Ähnlich',collaboration:'Zusammenarbeit',remix:'Remix','musicbrainz:member of band':'Bandmitglied','musicbrainz:collaboration':'Zusammenarbeit',
      favorite:'Essentials-Favorit',onRadio:'Im Radio',bioFrom:'Biografie von',more:'Mehr',less:'Weniger',moreRoots:'weitere',trail:'Pfad',
      bioEnglish:'Biografie auf Englisch',held:'Die Künstlerdaten werden geprüft.',artists:'Künstler',tracks:'Tracks',
      preview:'Anhören · 60 s',stopPreview:'Stopp',previewError:'Die Hörprobe konnte nicht starten. Bitte erneut versuchen.',
      result:'Treffer',results:'Treffer',firstResults:'Die ersten 40 Treffer. Ergänze ein Wort, um sie einzugrenzen.',
      basicDetails:'Für diesen Track gibt es noch keine Künstler- und Veröffentlichungsprofile.',cover:'Cover der Veröffentlichung',portrait:'Künstlerporträt',
      artistImage:'Porträt',releaseImage:'Cover',trackImage:'Cover',labelImage:'Label-Logo',playlistImage:'Cover',
    },
  };
  Object.assign(copy.en, {exploreTab:'Roots',history:'History',statistics:'Statistics',stage:'Stage',period:'Period',day:'Last 24 hours',week:'Last 7 days',month:'Last 30 days',allHistory:'All recorded history',older:'Older tracks',radioSelection:'All radio selections',library:'Whole music library',historyNote:'Confirmed broadcast starts. Times use your local timezone.',noHistory:'No broadcasts recorded in this period.',musicLoading:'Loading the music…',noOverlap:'No shared tracks.',musicError:'These records could not load.',retry:'Try again',selection:'In the selection',artistCredits:'Artist credits',releases:'Releases',hours:'Hours of music',topArtists:'Artists in the selection',years:'Release years',labels:'Labels',genres:'Track tags',overlap:'Shared with other stages',stageSizes:'Tracks per stage',coverage:'tracks with metadata',missingMetadata:'No metadata available yet.',snapshot:'Selection checked',definitions:'Each track is counted once per selection. Artist credits are kept as credited, including collaborations. Shared tracks can appear on several stages.',broadcasts:'Broadcast starts',differentTracks:'Different tracks played',unplayed:'Selected tracks not played',frequent:'Most played · last 30 days',broadcastNote:'Broadcast statistics cover the last 30 days, or the available history if shorter. They count starts, not completed listens.',recordingSince:'Earliest recorded start',broadcastError:'Broadcast statistics are unavailable. Selection statistics are shown below.',noPlays:'No broadcasts recorded yet.',plays:'plays',topNote:'All known release years, newest first. Other charts show up to 12 entries. Missing metadata is excluded.',statisticsNote:'Selection snapshots include playlist tracks; a station can play only tracks with accessible audio.'});
  Object.assign(copy.de, {exploreTab:'Wurzeln',history:'Verlauf',statistics:'Statistik',stage:'Bühne',period:'Zeitraum',day:'Letzte 24 Stunden',week:'Letzte 7 Tage',month:'Letzte 30 Tage',allHistory:'Gesamter Verlauf',older:'Ältere Tracks',radioSelection:'Alle Radioauswahlen',library:'Gesamte Musikbibliothek',historyNote:'Bestätigte Sendestarts. Die Zeiten entsprechen deiner lokalen Zeitzone.',noHistory:'In diesem Zeitraum wurden keine Sendestarts erfasst.',musicLoading:'Musik wird geladen…',noOverlap:'Keine gemeinsamen Tracks.',musicError:'Diese Daten konnten nicht geladen werden.',retry:'Erneut versuchen',selection:'Tracks in der Auswahl',artistCredits:'Künstlerangaben',releases:'Veröffentlichungen',hours:'Stunden Musik',topArtists:'Künstler in der Auswahl',years:'Erscheinungsjahre',labels:'Labels',genres:'Track-Tags',overlap:'Gemeinsam mit anderen Bühnen',stageSizes:'Tracks je Bühne',coverage:'Tracks mit Metadaten',missingMetadata:'Noch keine Metadaten verfügbar.',snapshot:'Auswahl geprüft',definitions:'Jeder Track zählt einmal pro Auswahl. Künstlerangaben bleiben einschließlich Zusammenarbeiten erhalten. Gemeinsame Tracks können auf mehreren Bühnen erscheinen.',broadcasts:'Sendestarts',differentTracks:'Verschiedene gespielte Tracks',unplayed:'Ausgewählte, nicht gespielte Tracks',frequent:'Am häufigsten gespielt · letzte 30 Tage',broadcastNote:'Sendestatistiken zeigen die letzten 30 Tage oder den kürzeren verfügbaren Verlauf. Sie zählen Starts, keine vollständigen Hörvorgänge.',recordingSince:'Frühester erfasster Start',broadcastError:'Sendestatistiken sind nicht verfügbar. Die Auswahlstatistiken stehen unten.',noPlays:'Noch keine Sendestarts erfasst.',plays:'Starts',topNote:'Alle bekannten Erscheinungsjahre, neueste zuerst. Andere Diagramme zeigen bis zu 12 Einträge. Fehlende Metadaten werden nicht mitgezählt.',statisticsNote:'Auswahlstatistiken enthalten Playlist-Tracks. Ein Sender kann nur Tracks mit verfügbaren Audiodateien abspielen.'});
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
  function action(title,handler,cls='') {const b=node('button',cls,title);b.type='button';b.addEventListener('click',handler);return b;}
  // An inline drawing: the roots band, the preview's play and pause, the Essentials heart.
  function drawing(box,paths,cls) {
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',box);svg.setAttribute('aria-hidden','true');svg.setAttribute('class',cls);
    for(const d of paths){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',d);svg.append(path);}return svg;
  }
  // A picture keeps its box, round for an artist, while it loads or when there is none, so nothing jumps.
  function picture(v,alt) {const box=node('span','picture'),img=node('img');box.dataset.type=v.type;image(img,v.image,alt);box.append(img);return box;}
  // Every name in the roots and the search is a link to its record; a second line says what the name does not.
  function door(v,line) {const a=node('a','root-node'),text=node('span');a.href='#explore/'+v.id;text.append(node('span','root-name',v.title));if(line)text.append(line);a.append(picture(v,''),text);return a;}
  // Records by kind, in a fixed order, six to a group until the listener asks for the rest, whose
  // pictures load only then.
  function groups(items) {
    return ['artist','release','track','label'].map(type=>{
      const kind=items.filter(i=>i.v.type===type&&entityID(i.v.id)),doors=list=>list.map(i=>door(i.v,i.line));if(!kind.length)return null;
      const group=node('section','root-group'),heading=node('h4','',word(type+'s')),list=node('div','root-nodes');
      heading.append(node('small','',number(kind.length)));list.append(...doors(kind.slice(0,6)));group.append(heading,list);
      // The button goes once used, so focus moves on to the first name it showed, never to the page.
      if(kind.length>6){const more=action('+ '+number(kind.length-6)+' '+word('moreRoots'),()=>{const rest=doors(kind.slice(6));list.append(...rest);more.remove();rest[0].focus();},'text-button');group.append(more);}
      return group;
    }).filter(Boolean);
  }
  // Credits first, then the artists it shares records with, then the ones it sounds like. A relation shows
  // only where the group heading does not already say it.
  const tier=relation=>['similar','related'].includes(relation)?2:['collaboration','remix','shared_release'].includes(relation)||relation.startsWith('musicbrainz:')?1:0;
  const telling=['featured','remixer','remix','collaboration','similar','musicbrainz:member of band','musicbrainz:collaboration'];
  function renderRoots(e,all) {
    const byID=new Map(all.map(v=>[v.id,v]));
    const items=(e.connections||[]).filter(c=>byID.has(c.id)).map(c=>({v:byID.get(c.id),relation:c.relation.split('/')[0]}))
      .sort((a,b)=>tier(a.relation)-tier(b.relation)).map(({v,relation})=>({v,line:telling.includes(relation)?node('small','',word(relation)):null}));
    const list=groups(items);if(!list.length)return [];
    // One curve per group, from the profile down to where its heading starts, drawn like the footer roots.
    const band=drawing('0 0 1000 72',list.map((_,i)=>{const x=i*1000/list.length+10;return `M500 0C500 40 ${x} 32 ${x} 72`;}),'roots-band');band.setAttribute('preserveAspectRatio','none');
    const roots=node('div','root-groups');roots.append(...list);return [band,roots];
  }
  // External links: listening services first, then the rest in a fixed order, each address once.
  const services=new Map(Object.entries({spotify:'Spotify',apple_music:'Apple Music',bandcamp:'Bandcamp',soundcloud:'SoundCloud',beatport:'Beatport',deezer:'Deezer',tidal:'Tidal',youtube:'YouTube',website:'Website',wikipedia:'Wikipedia',resident_advisor:'Resident Advisor',discogs:'Discogs',instagram:'Instagram',facebook:'Facebook',twitter:'X',musicbrainz:'MusicBrainz',lastfm:'Last.fm'}));
  const order=[...services.keys()],place=kind=>order.includes(kind)?order.indexOf(kind):order.length;
  // A site's own name, or its address without www. for the rest.
  const site=(kind,url)=>services.get(kind)||(url?new URL(url).hostname.replace(/^www\./,''):kind);
  function sites(list) {const seen=new Set();return list.map(l=>({kind:l.kind,url:external(l.url)})).filter(l=>l.url&&l.kind!=='wikidata').sort((a,b)=>place(a.kind)-place(b.kind)).filter(l=>!seen.has(l.url)&&seen.add(l.url));}
  const region=code=>{try{return new Intl.DisplayNames([radio.getState().language],{type:'region'}).of(code);}catch{return code;}};
  const time=n=>Math.floor(n/60)+':'+String(Math.floor(n%60)).padStart(2,'0');
  let recordTitle=null, bioWatch=null, enriched=null, nowKey='', nowRequest=null, explorerRequest=null, selected=null, preview=null, previewButton=null, trail=[], currentLanguage='', renderedPlayer='', shownQuery='', shownCount=0, typing=null;
  // The explorer is a plain dialog over an inert page: the player bar under it stays in reach.
  // It takes one history entry, right above the page's, and moves inside replace that entry, so Back
  // or ✕ always lands on the page in one step.
  const dialog=$('explorer'),behind=document.querySelectorAll('main, .roots-footer');
  // An entry this page opened carries this page's life in its state, so Back and Forward, which keep
  // the page, keep it too; any other explorer entry is marked as found, not owned.
  const life=performance.timeOrigin||Date.now();
  let landing=false,closing=false;
  // A new visit starts with an empty trail, and never shows the last visit's record while the first loads.
  function open() {if(dialog.open)return;trail=[];$('explore-workspace').hidden=true;dialog.show();for(const n of behind)n.inert=true;}
  // The record on air, as the roots know it, or as the radio does until they answer.
  const nowID=()=>{const t=radio.getState().track;return enriched?.entity.id||(t?'plex_'+t.id:'');};
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
    const people=all.filter(v=>v.type==='artist'&&entityID(v.id)&&(e?.connections||[]).some(c=>c.id===v.id&&['primary','featured','remixer'].includes(c.relation)));
    const portraits=people.filter(a=>a.image);
    image($('hero-cover'),cover,word('cover'));
    // Without a cover the bar shows the stage, so the record cell never starts on an empty square.
    const dock=$('dock-cover'),thumb=radio.stations.find(v=>v.id===s.stage).thumb;
    if(imagePath(cover))image(dock,cover,word('cover'));
    else if(dock.getAttribute('src')!==thumb){dock.onload=dock.onerror=null;dock.alt='';dock.src=thumb;dock.hidden=false;}
    image($('painted-artist'),portraits[0]?.image||t?.artistImageUrl,'');
    const key=JSON.stringify([s.stage,s.language,t,enriched]);
    // Playback and audience updates must not replace focused record controls.
    if (key !== renderedPlayer) {
      renderedPlayer=key;
      const pl=playlists.find(p=>p[0]===s.stage);
      $('stage-spotify').hidden=!pl;
      if(pl){$('stage-spotify').href='https://open.spotify.com/playlist/'+pl[2];}
      const root=nowID();
      if(entityID(root))$('player-title').href='#explore/'+root;else $('player-title').removeAttribute('href');
      const spotify=e?.links?.find(l=>l.kind==='spotify'&&external(l.url));
      $('track-spotify').hidden=!spotify;if(spotify)$('track-spotify').href=spotify.url;
      const release=all.find(v=>v.type==='release' && entityID(v.id) && e?.connections?.some(c=>c.id===v.id && c.relation==='release'));
      if(release && t?.album)$('player-album').href='#explore/'+release.id;
      else $('player-album').removeAttribute('href');
      const label=all.find(v=>v.type==='label'&&entityID(v.id));
      $('label-note').hidden=!label;$('label-note').replaceChildren();
      if(label){const a=node('a','',label.title);a.href='#explore/'+label.id;a.setAttribute('aria-label',word('label')+': '+label.title);$('label-note').append(a);}
      $('credited-artists').replaceChildren(...people.slice(0,5).map(a=>{
        const role=e.connections.find(c=>c.id===a.id)?.relation;
        const b=node('a','artist-credit');b.href='#explore/'+a.id;
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
    const valid=s.dataFresh&&Number.isFinite(duration)&&duration>0&&Number.isFinite(elapsed);
    $('track-clock').textContent=valid?time(elapsed)+' / '+time(duration):'—';
    $('track-progress').value=valid?elapsed/duration:0;
    $('track-progress').setAttribute('aria-label',radio.getState().language==='de'?'Fortschritt des Live-Tracks':'Live track progress');
    previewState();
  }
  // The preview's own button says what it does next, and counts the seconds while it plays.
  function previewState() {
    if(!previewButton)return;previewButton.toggleAttribute('data-playing',Boolean(preview));
    previewButton.children[1].textContent=preview?word('stopPreview')+' · '+time($('preview-audio').currentTime||0):word('preview');
  }
  function localise() {
    shownQuery='';// Results drawn in the old language are searched again.
    for(const n of document.querySelectorAll('[data-journey]'))n.textContent=word(n.dataset.journey);
    $('stage-spotify').setAttribute('aria-label',word('spotifyStage'));
    $('stage-spotify').title=word('spotifyStage');
    $('track-spotify').setAttribute('aria-label',word('spotifyTrack'));
    $('track-spotify').title=word('spotifyTrack');
    $('explorer-close').setAttribute('aria-label',word('back'));
    $('explorer-close').title=word('back');
    $('discovery-query').placeholder=word('searchPlaceholder');
    renderPlayer();if(selected)renderEntity(selected);
    if(dialog.open&&view!=='explore'){fillStages($('music-stage').value);loadMusic();}
  }
  // Every move into or inside the explorer comes through go(): opening adds the explorer's one entry,
  // and a move inside replaces it.
  function go(hash) {
    if(closing||(dialog.open&&hash===location.hash))return;
    if(dialog.open)history.replaceState(history.state,'',hash);
    else history.pushState({explorer:life},'',hash);
    radio.renderScene();restore();
  }
  async function loadEntity(id) {
    setView('explore');if(preview)finishPreview();
    selected=null;explorerRequest?.abort();const controller=new AbortController();explorerRequest=controller;
    // A record opened from a focused result or a name in the last record keeps focus visible and off the
    // field: on the explorer while it loads, then on the record's title. Touch screens open no keyboard.
    const workspace=$('explore-workspace');
    if($('discovery-results').contains(document.activeElement)||workspace.contains(document.activeElement))dialog.focus({preventScroll:true});
    // A hop keeps the last record in place, dimmed and out of reach, until the next one is drawn, so its
    // preview cannot start; only a first load says so.
    $('discovery-results').hidden=true;
    $('discovery-status').textContent=workspace.hidden?word('loading'):'';if(!workspace.hidden){workspace.setAttribute('aria-busy','true');workspace.inert=true;}
    const timeout=setTimeout(()=>controller.abort(),10000);
    try{const data=await request('/api/discovery/entity/'+id,controller.signal);
      if(explorerRequest!==controller)return;if(id!==data.entity.id){history.replaceState(history.state,'','#explore/'+data.entity.id);radio.renderScene();}
      selected=data;$('discovery-status').textContent='';workspace.removeAttribute('aria-busy');workspace.inert=false;workspace.hidden=false;renderEntity(data);dialog.scrollTop=0;
      // The new record starts at its title, unless the listener moved focus while it loaded: a field they
      // type in, the player or the volume keeps the keys.
      if([dialog,document.body].includes(document.activeElement))recordTitle.focus({preventScroll:true});
    }catch{if(explorerRequest===controller){workspace.removeAttribute('aria-busy');workspace.inert=false;workspace.hidden=true;$('discovery-status').textContent=word('unavailable');}}
    finally{clearTimeout(timeout);}
  }
  radio.openTrack=id=>{if(entityID('plex_'+id))go('#explore/plex_'+id);};
  // One column: the profile, then its roots growing down from it.
  function renderEntity(data) {
    const e=data.entity,all=data.included,panel=$('entity-inspector'),heading=node('div','entity-heading'),about=node('div');
    bioWatch?.disconnect();
    // The trail of records opened in this visit; going back to one cuts the trail there.
    const at=trail.findIndex(t=>t.id===e.id);trail.splice(at<0?trail.length:at,Infinity,{id:e.id,title:e.title});
    if(trail.length>1){
      const path=node('nav','entity-trail');path.setAttribute('aria-label',word('trail'));
      trail.slice(-4).forEach((t,i,shown)=>{
        if(i){const slash=node('span','',' / ');slash.setAttribute('aria-hidden','true');path.append(slash);}
        const step=node(i<shown.length-1?'a':'span','',t.title);if(step.localName==='a')step.href='#explore/'+t.id;else step.setAttribute('aria-current','page');path.append(step);
      });about.append(path);
    }
    recordTitle=node('h3','',e.title);recordTitle.tabIndex=-1;about.append(node('p','eyebrow',word(e.type)),recordTitle);
    previewButton=null;
    if(/^\/api\/discovery\/preview\/trk_[a-f0-9]{12}$/.test(e.previewUrl||'')){
      const circle=node('span','preview-icon');circle.append(drawing('0 0 24 24',['M7 4.5v15l13-7.5z'],'icon-start'),drawing('0 0 24 24',['M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z'],'icon-stop'));
      previewButton=action('',()=>{if(preview)finishPreview();else startPreview(e);},'preview-toggle');previewButton.append(circle,node('span'));about.append(previewButton);
    }
    previewState();
    const meta=[e.artist,e.album,/^\d{4}/.exec(e.releaseDate||'')?.[0],region(e.country||'')].filter(Boolean).join(' · ');
    if(meta)about.append(node('p','entity-meta',meta));
    if(e.tags?.length)about.append(node('p','entity-tags',e.tags.slice(0,4).join(' · ')));
    heading.append(picture(e,word(e.type+'Image')),about);panel.replaceChildren(heading);
    if(e.basicDetails)panel.append(node('p','collection-note',word('basicDetails')));
    if(e.reviewRequired)panel.append(node('p','collection-note',word('held')));
    const shown=sites(e.links||[]);
    if(shown.length){const line=node('p','entity-links');line.append(...shown.map(l=>link(site(l.kind,l.url),l.url)));panel.append(line);}
    // The stages that play it tune the radio in place; the player bar shows the switch.
    const stages=(e.playlists||[]).map(p=>radio.stations.find(s=>s.id===p.id||s.name===p.station)).filter(Boolean);
    if(stages.length){
      const line=node('p','entity-radio',word('onRadio'));
      for(const s of stages){
        const tune=action(s.name,()=>radio.tune(s.id),'text-button');
        if(s.id!=='essentials'||!e.favorite){line.append(tune);continue;}
        const heart=drawing('0 0 36 36',['M18 30.5S5 22.6 5 13.6A6.6 6.6 0 0 1 18 10.4a6.6 6.6 0 0 1 13 3.2c0 9-13 16.9-13 16.9Z'],'essentials-icon'),pair=node('span');
        heart.removeAttribute('aria-hidden');heart.setAttribute('role','img');heart.setAttribute('aria-label',word('favorite'));pair.append(heart,tune);line.append(pair);
      }
      panel.append(line);
    }
    let text=null,more=null,fit=null;
    if(e.bio){
      // The biography reads open, up to four lines; More appears only when there is more.
      const bio=node('div','entity-bio'),foot=node('p','bio-foot'),source=external(e.bioUrl),name=source?site(e.bioSource,source):services.get(e.bioSource);
      text=node('p','',e.bio);text.lang='en';
      // Closed again, it may fit now, after the window grew while it was open: its height does not change then.
      more=action(word('more'),()=>{const open=more.getAttribute('aria-expanded')!=='true';more.setAttribute('aria-expanded',open);more.textContent=word(open?'less':'more');fit();},'text-button');
      more.setAttribute('aria-expanded','false');more.hidden=true;
      // The source links once: in the line above when it is there, or here.
      const credit=node('span','',radio.getState().language==='de'?word('bioEnglish'):'');
      if(name)credit.append((credit.textContent?' · ':'')+word('bioFrom')+' ',source&&!shown.some(l=>l.url===source)?link(name,source):name);
      foot.append(more,credit);bio.append(text,foot);panel.append(bio);
    }
    panel.append(...renderRoots(e,all));
    // More follows the width and the font: a turned phone, a narrower window or a late Inter can cut a
    // biography that fitted. Open, it stays, to close it again.
    if(text){
      fit=()=>{const cut=text.scrollHeight>text.clientHeight;more.hidden=!cut&&more.getAttribute('aria-expanded')!=='true';};
      bioWatch=new ResizeObserver(fit);bioWatch.observe(text);document.fonts.ready.then(fit);
    }
  }
  // On the search page, results that go away while one has focus hand it to the field, never to the
  // page, where Space plays. Opening a record or a tab moves on instead: no keyboard pops up on touch.
  const hideResults=()=>{if($('discovery-results').contains(document.activeElement))$('discovery-query').focus();$('discovery-results').hidden=true;};
  // Results stay in place while the next ones load. The URL holds the query (#explore?q=…), so each
  // history entry keeps its own search, and the Roots tab points to the last one.
  const searchPage=query=>{history.replaceState(history.state,'',query?'#explore?q='+encodeURIComponent(query):'#explore');$('roots-tab').setAttribute('href',location.hash);};
  // Leaving a record for a search or a tab ends its preview, whose button goes with it.
  const hideRecord=()=>{if(preview)finishPreview();$('explore-workspace').hidden=true;};
  const found=n=>n>=40?word('firstResults'):n?number(n)+' '+word(n===1?'result':'results'):word('empty');
  async function search() {
    clearTimeout(typing);selected=null;explorerRequest?.abort();const c=new AbortController(),query=$('discovery-query').value;explorerRequest=c;
    searchPage(query);
    $('discovery-status').textContent=word('loading');hideRecord();
    const timeout=setTimeout(()=>c.abort(),10000);
    try {const res=await fetch('/api/discovery/search?q='+encodeURIComponent(query),{signal:c.signal});if(!res.ok)throw new Error();
      const data=await res.json();if(explorerRequest!==c)return;if(!Array.isArray(data.items))throw new Error();
      const focused=$('discovery-results').contains(document.activeElement);
      // The same groups and names as the roots; the second line says who made a release or a track, and on what.
      $('discovery-results').replaceChildren(...groups(data.items.map(v=>({v,line:v.artist||v.album?node('span','root-line',[v.artist,v.album].filter(Boolean).join(' · ')):null}))));
      if(focused)$('discovery-query').focus();
      shownQuery=query;shownCount=data.items.length;$('discovery-results').hidden=false;$('discovery-status').textContent=found(shownCount);
    }catch{if(explorerRequest===c){hideResults();$('discovery-status').textContent=word('unavailable');}}finally{clearTimeout(timeout);}
  }
  function cancelPreview() {
    const resume=preview?.resume;preview=null;const audio=$('preview-audio');audio.pause();audio.removeAttribute('src');audio.load();previewState();return resume;
  }
  async function startPreview(e) {
    const resume=preview?preview.resume:radio.getState().wanted;
    cancelPreview();radio.pause();const current={id:e.id,resume,entity:e};preview=current;
    const a=$('preview-audio');a.volume=$('audio').volume;a.src=e.previewUrl;previewState();
    try{await a.play();if(preview===current)renderPlayer();}catch{if(preview===current){cancelPreview();$('discovery-status').textContent=word('previewError');if(resume)radio.play();}}
  }
  function finishPreview() {const resume=preview?.resume;cancelPreview();if(resume)radio.play();else renderPlayer();}
  radio.cancelPreview=cancelPreview;
  radio.stopPreview=()=>{if(!preview)return false;finishPreview();return true;};
  $('preview-audio').addEventListener('ended',finishPreview);
  $('preview-audio').addEventListener('error',()=>{if(preview){$('discovery-status').textContent=word('previewError');finishPreview();}});
  try{const saved=parseFloat(localStorage.getItem('pavoia-volume'));if(saved>=0&&saved<=1)$('volume').value=saved;}catch{/* Storage is optional. */}
  // Where the stylesheet hides the slider, the device sets the level, so a remembered low volume cannot silence the radio.
  const fixedVolume=matchMedia('(max-width:760px), (pointer:coarse)');
  const volume=()=>{$('audio').volume=$('preview-audio').volume=fixedVolume.matches?1:Number($('volume').value);};volume();
  fixedVolume.addEventListener('change',volume);
  $('volume').addEventListener('input',()=>{volume();try{localStorage.setItem('pavoia-volume',$('volume').value);}catch{/* Storage is optional. */}});
  // The footer opens the record on air; only with nothing on air does it open the search.
  $('go-deeper').addEventListener('click',()=>go(entityID(nowID())?'#explore/'+nowID():'#explore'));
  // ✕ and Escape. An entry this page opened goes back to the page's entry right under it, and
  // restore() then closes the dialog; until then, work stops and moves wait. Any other (a shared link,
  // a reload, a restored session, a typed URL) closes in place, since the entry under it may not be
  // this page. A plain dialog fires no cancel event, so Escape is caught below.
  const halt=()=>{clearTimeout(typing);explorerRequest?.abort();explorerRequest=null;musicRequest?.abort();musicRequest=null;};
  const close=()=>{
    if(!dialog.open||closing)return;
    halt();
    // The browser may have pruned the page's entry; the Navigation API says so before going back.
    // ponytail: without that API, such a pruned history (over 50 entries in one tab) leaves the close
    // waiting, since a slow Back and a failed one look the same; every current browser has the API.
    if(history.state?.explorer===life&&window.navigation?.canGoBack!==false){closing=true;history.back();return;}
    shut();history.replaceState(null,'',location.pathname+location.search);radio.renderScene();
  };
  function shut(){closing=false;halt();finishPreview();for(const n of behind)n.inert=false;dialog.close();}
  $('explorer-close').addEventListener('click',close);
  // Explorer links, in the explorer or the player bar, go through go(). Ctrl, Cmd, Shift and middle
  // clicks keep opening them in a new tab or window.
  document.addEventListener('click',event=>{
    if(event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    const href=event.target.closest?.('a[href^="#"]')?.getAttribute('href')||'';
    if(!/^#(?:explore|history|statistics)(?:[/?]|$)/.test(href))return;
    event.preventDefault();go(href);
  });
  // Escape over the modal stations sheet closes that sheet only. Closing keeps the typed query, which
  // Escape would otherwise clear in the search field.
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.isComposing&&!event.defaultPrevented&&dialog.open&&!document.querySelector('dialog:modal')){event.preventDefault();close();}});
  $('discovery-search').addEventListener('submit',event=>{event.preventDefault();search();});
  // Under two characters the search page empties, and a search still loading is dropped with it.
  $('discovery-query').addEventListener('input',()=>{
    clearTimeout(typing);
    if($('discovery-query').value.trim().length>=2){typing=setTimeout(search,300);return;}
    if(!/^#explore(?:\?|$)/.test(location.hash))return;
    searchPage('');explorerRequest?.abort();explorerRequest=null;shownQuery='';hideResults();$('discovery-status').textContent='';
  });
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
    view=next;clearTimeout(typing);musicRequest?.abort();
    $('music-view').hidden=next==='explore';$('discovery-search').hidden=next!=='explore';
    $('discovery-status').hidden=next!=='explore';
    for(const link of document.querySelectorAll('.explorer-nav a')) {
      // The Roots link carries the last search (#explore?q=…); its route alone names the tab.
      if(link.getAttribute('href').split('?')[0]==='#'+next)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
    }
    if(next!=='explore'){
      explorerRequest?.abort();selected=null;$('discovery-results').hidden=true;hideRecord();
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
  // Touch screens keep their keyboard down until the listener asks for it.
  const finePointer=matchMedia('(pointer:fine)');
  function restore(){
    landing=false;
    const [path,params='']=location.hash.split('?');
    const candidate=path.startsWith('#explore/')?path.slice(9):'';
    const id=entityID(candidate)?candidate:null;
    const section=path.slice(1);
    if(!id&&!['explore','history','statistics'].includes(section)){if(dialog.open)shut();return;}
    // Going back landed on another explorer entry, so the page was not right under: close in place.
    if(closing){shut();history.replaceState(null,'',location.pathname+location.search);radio.renderScene();return;}
    // An entry the browser added itself, such as a typed URL, may not sit right above the page.
    if(!history.state?.explorer)history.replaceState({...history.state,explorer:true},'');
    open();
    if(id)return loadEntity(id);
    setView(section);
    if(section!=='explore')return loadMusic();
    // The Roots tab returns to the last results, searches again for a changed query, or lands on the record on air.
    explorerRequest?.abort();explorerRequest=null;selected=null;hideRecord();
    const query=new URLSearchParams(params).get('q')||'';$('discovery-query').value=query;
    const again=Boolean(query.trim())&&query===shownQuery&&$('discovery-results').children.length>0;
    $('discovery-results').hidden=!again;$('discovery-status').textContent=again?found(shownCount):'';
    if(finePointer.matches)$('discovery-query').focus();
    if(again)return;
    if(query.trim())search();
    else if(entityID(nowID())){history.replaceState(history.state,'','#explore/'+nowID());loadEntity(nowID());}
    // Until a record is on air the page waits for one: the radio's next answer with a track lands it.
    else{landing=true;if(radio.getState().dataFresh)$('discovery-status').textContent=word('nothingOnAir');}
  }
  window.addEventListener('popstate',restore);
  window.addEventListener('hashchange',restore);
  window.addEventListener('pavoia:radio',()=>{const lang=radio.getState().language;if(currentLanguage!==lang){currentLanguage=lang;localise();}enrich();
    if(landing&&!closing&&radio.getState().dataFresh&&(entityID(nowID())||!$('discovery-status').textContent)){landing=false;if(dialog.open&&location.hash==='#explore'&&!$('discovery-query').value.trim())restore();}});
  currentLanguage=radio.getState().language;localise();enrich();restore();setInterval(clock,1000);
})();
