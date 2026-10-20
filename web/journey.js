'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const radio = window.Pavoia;
  // The artist row in the bar scrolls sideways when names do not fit. A plain mouse wheel scrolls it
  // too, until its end, and data-before and data-more fade each edge where names wait. The explorer's stage row on a
  // phone fades the same way.
  const credits = $('credited-artists'), stageRow = $('stage-row');
  const fade = row => {
    row.toggleAttribute('data-before', row.scrollLeft>1);
    row.toggleAttribute('data-more', row.scrollWidth-row.scrollLeft-row.clientWidth>1);
  };
  const moreCredits = () => fade(credits);
  credits.addEventListener('scroll', moreCredits, {passive:true});
  stageRow.addEventListener('scroll', () => fade(stageRow), {passive:true});
  window.addEventListener('resize', () => {moreCredits();fade(stageRow);});
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
      similar:'Similar artists',collaboration:'Collaboration',remix:'Remix',shared_release:'Shared release','musicbrainz:member of band':'Band member','musicbrainz:collaboration':'Collaboration',
      favorite:'Essentials favourite',onRadio:'On the radio',bioFrom:'Biography from',more:'More',less:'Less',showAll:'Show all {n}',trail:'Path',elsewhere:'Elsewhere',
      bioEnglish:'Biography in English',held:'Artist details are being checked.',artists:'Artists',tracks:'Tracks',
      preview:'Listen · 60 s',stopPreview:'Stop',previewError:'The preview could not play. Try again.',
      result:'result',results:'results',firstResults:'First 40 results. Add a word to narrow them.',
      basicDetails:'Artist and release profiles are not available for this track yet.',cover:'Release artwork',portrait:'Artist portrait',
      artistImage:'Portrait',releaseImage:'Cover',trackImage:'Cover',labelImage:'Label logo',playlistImage:'Cover',
      worked:'Worked with',madeBy:'Made by',similarLabels:'Similar labels',similarReleases:'Similar releases',about:'About {title}',onAir:'On air',playsOn:'Plays on',onStage:'On',
      similarTo:'Similar to {names}',workedWithNames:'Worked with {names}',alsoOn:'Also on {names}',byNames:'By {names}',labelOf:'Label of {names}',alsoBy:'Also by {names}',
      inCommon:'{n} artists in common',inCommon1:'1 artist in common',moreNames:'{n} more',tracksN:'{n} tracks',tracks1:'1 track',
      noSimilar:'No similar artists in the collection yet.',noSimilarLabels:'No similar labels in the collection yet.',noSimilarReleases:'No similar releases in the collection yet.',
      noLabelReleases:'This label’s releases are not listed yet.',nothingLinked:'Nothing in the collection is linked to {title} yet.',
      showList:'Show as a list',showMap:'Show as a map',mapHint:'The nearer a name, the closer it is. Pick one to go there.',
    },
    de:{ deeper:'Entdecke die Wurzeln dahinter',roots:'Die Wurzeln',back:'Zurück zum Radio',
      spotifyTrack:'Track auf Spotify öffnen',spotifyStage:'Folge dieser Playlist auf Spotify',spotifyDaily:'Ich füge jeden Tag neue Tracks hinzu',volume:'Lautstärke',
      searchLabel:'Künstler, Track, Veröffentlichung oder Label',searchPlaceholder:'Künstler, Tracks, Alben, Labels suchen',nothingOnAir:'Gerade läuft nichts. Suche, um anzufangen.',
      loading:'Verbindungen werden geladen…',unavailable:'Diese Details sind nicht verfügbar. Wähle einen anderen Eintrag oder suche erneut.',empty:'Keine Treffer im Radiokatalog.',
      artist:'Künstler',track:'Track',release:'Veröffentlichung',label:'Label',playlist:'Playlist',primary:'Künstler',featured:'Mit',remixer:'Remix von',
      similar:'Ähnliche Künstler',collaboration:'Zusammenarbeit',remix:'Remix',shared_release:'Gemeinsame Veröffentlichung','musicbrainz:member of band':'Bandmitglied','musicbrainz:collaboration':'Zusammenarbeit',
      favorite:'Essentials-Favorit',onRadio:'Im Radio',bioFrom:'Biografie von',more:'Mehr',less:'Weniger',showAll:'Alle {n} zeigen',trail:'Pfad',elsewhere:'Anderswo',
      bioEnglish:'Biografie auf Englisch',held:'Die Künstlerdaten werden geprüft.',artists:'Künstler',tracks:'Tracks',
      preview:'Anhören · 60 s',stopPreview:'Stopp',previewError:'Die Hörprobe konnte nicht starten. Bitte erneut versuchen.',
      result:'Treffer',results:'Treffer',firstResults:'Die ersten 40 Treffer. Ergänze ein Wort, um sie einzugrenzen.',
      basicDetails:'Für diesen Track gibt es noch keine Künstler- und Veröffentlichungsprofile.',cover:'Cover der Veröffentlichung',portrait:'Künstlerporträt',
      artistImage:'Porträt',releaseImage:'Cover',trackImage:'Cover',labelImage:'Label-Logo',playlistImage:'Cover',
      worked:'Gearbeitet mit',madeBy:'Gemacht von',similarLabels:'Ähnliche Labels',similarReleases:'Ähnliche Veröffentlichungen',about:'Über {title}',onAir:'Auf Sendung',playsOn:'Läuft auf',onStage:'Auf',
      similarTo:'Ähnlich wie {names}',workedWithNames:'Gearbeitet mit {names}',alsoOn:'Auch bei {names}',byNames:'Von {names}',labelOf:'Label von {names}',alsoBy:'Auch von {names}',
      inCommon:'{n} gemeinsame Künstler',inCommon1:'1 gemeinsamer Künstler',moreNames:'{n} weitere',tracksN:'{n} Tracks',tracks1:'1 Track',
      noSimilar:'Noch keine ähnlichen Künstler in der Sammlung.',noSimilarLabels:'Noch keine ähnlichen Labels in der Sammlung.',noSimilarReleases:'Noch keine ähnlichen Veröffentlichungen in der Sammlung.',
      noLabelReleases:'Die Veröffentlichungen dieses Labels sind noch nicht verzeichnet.',nothingLinked:'In der Sammlung ist noch nichts mit {title} verbunden.',
      showList:'Als Liste zeigen',showMap:'Als Karte zeigen',mapHint:'Je näher ein Name, desto enger die Verbindung. Wähle einen, um dorthin zu gehen.',
    },
  };
  Object.assign(copy.en, {exploreTab:'Roots',history:'History',statistics:'Statistics',stage:'Stage',historyDay:'Day',older:'Show earlier tracks',loadingMore:'Loading…',now:'Now',allStages:'All stages',noHistory:'Nothing has played on this stage yet.',noDay:'Nothing played on this stage that day.',historyError:'The history could not load.',musicLoading:'Loading the music…',musicError:'These records could not load.',retry:'Try again',releases:'Releases',years:'Release years',labels:'Labels',
    statLine:'{tracks} tracks by {artists} artists, {hours} hours of music',playsSince:'{plays} plays since {date}',plays30:'{plays} plays in the last 30 days',allPlayed:'every track has played',notPlayed:'{n} not played yet',seeWhatPlayed:'See what played',playsError:'Plays could not load.',switchStage:'Switch to this stage',
    mostTracksBy:'Most tracks by',mostTracksOn:'Most tracks on',sharesWith:'Shares tracks with',stages:'Stages',tracksOn:'{tracks} on {stage}',tracksInCommon:'{tracks} in common',mostPlayedSince:'Most played since {date}',mostPlayed30:'Most played in the last 30 days',howCounted:'How these numbers are counted',
    definitions:'Each track counts once per playlist. Artists are counted as credited, collaborations included. A track can be on several stages.',playIsStart:'A play is a start on the stream, not a full listen.',checkedAt:'Playlist checked at {time}',knownArtist:'Artist known for {n} of {total} tracks',knownLabel:'Label known for {n} of {total} tracks',knownYear:'Year known for {n} of {total} tracks',
    statLineAll:'{tracks} tracks by {artists} on {labels}, {hours} hours of music',artistsLink:'{n} artists',labelsLink:'{n} labels',allArtists:'All {n} artists',allLabels:'All {n} labels',
    listArtists:'{n} artists',listLabels:'{n} labels',byCount:'most tracks first',byName:'A to Z',sortCount:'Most tracks',sortName:'A to Z',filterArtists:'Filter artists',filterLabels:'Filter labels',
    showMore:'Show more',nOfTotal:'{n} of {total}',noArtistMatch:'No artist matches “{q}”.',noLabelMatch:'No label matches “{q}”.'});
  Object.assign(copy.de, {exploreTab:'Wurzeln',history:'Verlauf',statistics:'Statistik',stage:'Bühne',historyDay:'Tag',older:'Frühere Tracks anzeigen',loadingMore:'Wird geladen…',now:'Jetzt',allStages:'Alle Bühnen',noHistory:'Auf dieser Bühne lief noch nichts.',noDay:'An diesem Tag lief hier nichts.',historyError:'Der Verlauf konnte nicht geladen werden.',musicLoading:'Musik wird geladen…',musicError:'Diese Daten konnten nicht geladen werden.',retry:'Erneut versuchen',releases:'Veröffentlichungen',years:'Erscheinungsjahre',labels:'Labels',
    statLine:'{tracks} Tracks von {artists} Künstlern, {hours} Stunden Musik',playsSince:'{plays} Wiedergaben seit {date}',plays30:'{plays} Wiedergaben in den letzten 30 Tagen',allPlayed:'jeder Track lief schon',notPlayed:'{n} noch nicht gespielt',seeWhatPlayed:'Sieh, was lief',playsError:'Die Wiedergaben konnten nicht geladen werden.',switchStage:'Zu dieser Bühne wechseln',
    mostTracksBy:'Die meisten Tracks von',mostTracksOn:'Die meisten Tracks bei',sharesWith:'Teilt Tracks mit',stages:'Bühnen',tracksOn:'{tracks} auf {stage}',tracksInCommon:'{tracks} gemeinsam',mostPlayedSince:'Am häufigsten gespielt seit {date}',mostPlayed30:'Am häufigsten gespielt in den letzten 30 Tagen',howCounted:'So wird gezählt',
    definitions:'Jeder Track zählt einmal pro Playlist. Künstler zählen wie angegeben, Zusammenarbeiten eingeschlossen. Ein Track kann auf mehreren Bühnen laufen.',playIsStart:'Eine Wiedergabe ist ein Start im Stream, kein ganzes Anhören.',checkedAt:'Playlist geprüft um {time}',knownArtist:'Künstler bekannt für {n} von {total} Tracks',knownLabel:'Label bekannt für {n} von {total} Tracks',knownYear:'Jahr bekannt für {n} von {total} Tracks',
    statLineAll:'{tracks} Tracks von {artists} auf {labels}, {hours} Stunden Musik',artistsLink:'{n} Künstlern',labelsLink:'{n} Labels',allArtists:'Alle {n} Künstler',allLabels:'Alle {n} Labels',
    listArtists:'{n} Künstler',listLabels:'{n} Labels',byCount:'die meisten Tracks zuerst',byName:'von A bis Z',sortCount:'Die meisten Tracks',sortName:'A bis Z',filterArtists:'Künstler filtern',filterLabels:'Labels filtern',
    showMore:'Mehr zeigen',nOfTotal:'{n} von {total}',noArtistMatch:'Kein Künstler passt zu „{q}“.',noLabelMatch:'Kein Label passt zu „{q}“.'});
  const word = key => copy[radio.getState().language][key] || key;
  const node = (tag,cls,value) => {const n=document.createElement(tag);if(cls)n.className=cls;if(value)n.textContent=value;return n;};
  const entityID = value => /^(?:(?:art|trk|rel|lab|pl)_[a-f0-9]{12}|plex_[0-9]{1,32})$/.test(value || '');
  // A record's image from the API, or a stage's own photo for a stage place.
  const imagePath = value => typeof value==='string' && (/^\/api\/discovery\/media\/[a-f0-9]{40}$/.test(value) || /^\/api\/(?:radio\/[a-z-]+|library)\/artwork\/\d+\/(cover|portrait)\?v=[a-f0-9]{16}$/.test(value) || /^photos\/selected\/p\d{3}\.jpg$/.test(value));
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
  // An inline drawing: the preview's play and pause, the Essentials heart.
  function drawing(box,paths,cls) {
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',box);svg.setAttribute('aria-hidden','true');svg.setAttribute('class',cls);
    for(const d of paths){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',d);svg.append(path);}return svg;
  }
  // A picture keeps its box, round for an artist, while it loads or when there is none, so nothing jumps.
  // Until an image shows, the box holds the name's first letter: never an empty disc.
  function picture(v,alt) {const box=node('span','picture'),img=node('img');box.dataset.type=v.type;box.dataset.initial=[...(v.title||'').trim()][0]?.toLocaleUpperCase()||'';image(img,v.image,alt);box.append(img);return box;}
  // Every name in a region and in the search is a row that links to its record: its picture, the name over the
  // reason it is there, and a fact on the right.
  // A name with an href of its own links there, and one whose href is null links nowhere.
  function door(v,line,fact) {const a=node('a','row'),text=node('span','row-text'),href=v.href===undefined?'#explore/'+v.id:v.href;if(href)a.href=href;text.append(node('span','row-name',v.title));if(line)text.append(node('span','row-line',line));a.append(picture(v,''),text);if(fact)a.append(node('span','row-fact',fact));return a;}
  // A region: a heading with the count of its names, then a list, six rows until the listener asks for the rest, whose
  // pictures load only then: Show all {n} shows that count. One with nothing in it says so in one sentence. On the map
  // it holds the 14 closest at once, the most a side shows, each knowing the name it hangs from. A region whose every
  // name has a place of its own links there instead of Show all, and on the map from its count.
  function regionSection(key,items,empty,prefix='r',map=false,count=items.length,all=null) {
    const section=node('section','region'),heading=node('h4','',word(key)),list=node('ol'),rows=part=>part.map(i=>{const li=node('li');li.dataset.id=i.id;if(i.via)li.dataset.via=i.via;li.append(door(i,i.line,i.fact));return li;});
    heading.id=prefix+'-'+key;section.setAttribute('aria-labelledby',heading.id);section.dataset.key=key;
    if(count!==null){const n=node('small','',map&&all?'':number(count));if(map&&all){const a=node('a','',number(count));a.href=all.getAttribute('href');a.setAttribute('aria-label',all.textContent);n.append(a);}heading.append(' ',n);}
    section.append(heading);
    if(!items.length){section.append(node('p','collection-note',word(empty)));return section;}
    list.append(...rows(items.slice(0,map?14:6)));section.append(list);
    if(map)return section;
    // The button goes once used, so focus moves on to the first row it showed, never to the page.
    if(items.length>6){const more=all||action(word('showAll').replace('{n}',number(items.length)),()=>{const rest=rows(items.slice(6));list.append(...rest);more.remove();rest[0].children[0].focus();},'text-button');section.append(more);}
    return section;
  }
  // {names}: "A", "A and B", or "A, B and 3 more", in the listener's language.
  function names(ids) {
    const titles=ids.map(id=>records.get(id)?.title).filter(Boolean),list=new Intl.ListFormat(radio.getState().language,{type:'conjunction'});
    return titles.length>2?titles[0]+', '+list.format([titles[1],word('moreNames').replace('{n}',number(titles.length-2))]):list.format(titles);
  }
  // A reason from closeness.js in words: each part states its evidence, and parts read apart by a middle dot.
  const say=reason=>reason.map(({kind,names:list})=>kind==='relation'?[...new Set(list.map(word))].join(' · '):kind==='text'?list.join(', '):kind==='title'?names(list):
    kind==='inCommon'&&list.length===1?word('inCommon1'):word(kind).replace('{names}',names(list)).replace('{n}',number(list.length))).filter(Boolean).join(' · ');
  // An artist counts its tracks, a release shows its year, a label shows nothing.
  const fact=i=>i.type==='release'?i.fact:i.fact?word(i.fact===1?'tracks1':'tracksN').replace('{n}',number(i.fact)):'';
  // External links: listening services first, then the rest in a fixed order, each address once.
  const services=new Map(Object.entries({spotify:'Spotify',apple_music:'Apple Music',bandcamp:'Bandcamp',soundcloud:'SoundCloud',beatport:'Beatport',deezer:'Deezer',tidal:'Tidal',youtube:'YouTube',website:'Website',wikipedia:'Wikipedia',resident_advisor:'Resident Advisor',discogs:'Discogs',instagram:'Instagram',facebook:'Facebook',twitter:'X',musicbrainz:'MusicBrainz',lastfm:'Last.fm'}));
  const order=[...services.keys()],place=kind=>order.includes(kind)?order.indexOf(kind):order.length;
  // A site's own name, or its address without www. for the rest.
  const site=(kind,url)=>services.get(kind)||(url?new URL(url).hostname.replace(/^www\./,''):kind);
  function sites(list) {const seen=new Set();return list.map(l=>({kind:l.kind,url:external(l.url)})).filter(l=>l.url&&l.kind!=='wikidata').sort((a,b)=>place(a.kind)-place(b.kind)).filter(l=>!seen.has(l.url)&&seen.add(l.url));}
  const region=code=>{try{return new Intl.DisplayNames([radio.getState().language],{type:'region'}).of(code);}catch{return code;}};
  const time=n=>Math.floor(n/60)+':'+String(Math.floor(n%60)).padStart(2,'0');
  let recordTitle=null, bioWatch=null, mapWatch=null, trailWatch=null, glide=null, enriched=null, nowKey='', nowRequest=null, hop=null, selected=null, bodyShown=false, preview=null, previewButton=null, trail=[], currentLanguage='', renderedPlayer='', shownQuery='', shownCount=0, typing=null;
  // A window 1100px wide or more draws a record as a map, unless the listener chose the list; the choice is kept, and a
  // page that cannot read it draws the map.
  let listView=false;try{listView=localStorage.getItem('pavoia-explorer-view')==='list';}catch{/* Storage is optional. */}
  const wide=matchMedia('(min-width:1100px)'),still=matchMedia('(prefers-reduced-motion: reduce)'),mapOn=()=>wide.matches&&!listView;
  // The explorer is a plain dialog over an inert page: the player bar under it stays in reach.
  // It takes one history entry, right above the page's, and moves inside replace that entry, so Back
  // or ✕ always lands on the page in one step.
  const dialog=$('explorer'),behind=document.querySelectorAll('main, .roots-footer');
  // An entry this page opened carries this page's life in its state, so Back and Forward, which keep
  // the page, keep it too; any other explorer entry is marked as found, not owned.
  const life=performance.timeOrigin||Date.now();
  let landing=false,closing=false;
  // A new visit starts with an empty trail and a fresh History, and never shows the last visit's record while the first loads.
  // The dialog takes focus itself, not its first tab, which would show a ring on a page just loaded.
  function open() {if(dialog.open)return;trail=[];$('explore-workspace').hidden=true;delete $('music-content').dataset.key;dialog.show();dialog.focus({preventScroll:true});for(const n of behind)n.inert=true;}
  // The record on air, as the roots know it, or as the radio does until they answer.
  const nowID=()=>{const t=radio.getState().track;return enriched?.entity.id||(t?'plex_'+t.id:'');};
  async function request(path,signal) {
    const res=await fetch(path,{signal,cache:'no-cache'});
    if(!res.ok)throw new Error('unavailable');
    const data=await res.json();
    if(!entityID(data.entity?.id)||!Array.isArray(data.included))throw new Error('schema');
    remember(data);return data;
  }
  // Every payload fetched feeds two caches: the last 16 payloads, and every record they hold, by id. The track on
  // air comes in through enrich(), so the explorer opens on it with no request.
  // ponytail: clear-all cap, an LRU if hops get slow
  const near=PavoiaCloseness,payloads=new Map(),records=new Map();
  // A copy another payload includes lacks what only a record's own payload brings, such as its preview: it never
  // replaces the record of a payload kept.
  const hold=data=>{for(const r of [data.entity,...data.included])if(entityID(r?.id)&&(r===data.entity||!payloads.has(r.id)))records.set(r.id,r);};
  function remember(data) {
    payloads.delete(data.entity.id);payloads.set(data.entity.id,data);
    if(payloads.size>16)payloads.delete(payloads.keys().next().value);
    hold(data);if(records.size>3000){records.clear();for(const p of payloads.values())hold(p);}
  }
  const cached=id=>{const data=payloads.get(id);if(data){payloads.delete(id);payloads.set(id,data);}return data;};
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
    stageRow.setAttribute('aria-label',word('stage'));
    $('discovery-query').placeholder=word('searchPlaceholder');
    renderPlayer();redraw();
    if(dialog.open&&view!=='explore'){fillRow();loadMusic();}
  }
  // Every move into or inside the explorer comes through go(): opening adds the explorer's one entry,
  // and a move inside replaces it.
  function go(hash) {
    if(closing||(dialog.open&&hash===location.hash))return;
    if(dialog.open)history.replaceState(history.state,'',hash);
    else history.pushState({explorer:life},'',hash);
    radio.renderScene();restore();
  }
  // A hop paints twice, and nothing moves once it shows. The header comes at once from a record already fetched, or
  // with its payload. The regions, About and On the radio come once: when the payload, the credited artists and the
  // naming fetch have answered, or 2.5 s after the header at most, with the records at hand. Later answers only fill
  // the caches.
  async function loadEntity(id) {
    const from=glide;setView('explore');if(preview)finishPreview();
    selected=null;hop?.abort();const controller=new AbortController();hop=controller;
    // A record opened from a focused result, a History row or a name in the last record keeps focus visible
    // and off the field: on the explorer while it loads, then on the record's title. Touch screens open no keyboard.
    const workspace=$('explore-workspace');
    if([$('discovery-results'),$('music-content'),workspace].some(n=>n.contains(document.activeElement)))dialog.focus({preventScroll:true});
    $('discovery-results').hidden=true;
    // Every request of the hop shares its controller: the next hop, a tab or closing the explorer drops them all.
    const timeout=setTimeout(()=>controller.abort(),10000),fetched=async id=>cached(id)||request('/api/discovery/entity/'+id,controller.signal);
    let wake,start,painted=null;const deadline=new Promise(resolve=>{start=()=>{wake=setTimeout(resolve,2500);};});
    const header=e=>{
      selected=e;
      const paint=()=>{
        if(hop!==controller)return;
        $('discovery-status').textContent='';workspace.removeAttribute('aria-busy');workspace.inert=false;workspace.hidden=false;renderEntity(selected);dialog.scrollTop=0;
        // The new record starts at its title, unless the listener moved focus while it loaded: a field they
        // type in, the player or the volume keeps the keys.
        if([dialog,document.body].includes(document.activeElement))recordTitle.focus({preventScroll:true});
        start();
      };
      // A pictured name clicked on the map glides into the middle, unless motion is reduced or the list shows. The
      // body paints after it.
      if(!from?.isConnected||!document.startViewTransition||still.matches||!mapOn())return paint();
      let to=null;from.style.viewTransitionName='centre';
      const move=document.startViewTransition(()=>{if(hop!==controller)return;paint();to=$('entity-inspector').querySelector('.picture');if(to)to.style.viewTransitionName='centre';});
      const done=()=>{for(const n of [from,to])if(n)n.style.viewTransitionName='';};
      painted=move.updateCallbackDone.catch(()=>{});move.finished.then(done,done);
    };
    if(records.has(id))header(records.get(id));
    // Without it, the last record stays in place, dimmed and out of reach, so its preview cannot start; only a
    // first load says it is loading.
    else{$('discovery-status').textContent=workspace.hidden?word('loading'):'';if(!workspace.hidden){workspace.setAttribute('aria-busy','true');workspace.inert=true;}}
    // Its payload, the credited artists of a track or a small release, then the fewest neighbours that name the rest.
    const named=(async()=>{
      const data=await fetched(id),e=data.entity;if(hop!==controller)return;
      if(id!==e.id){history.replaceState(history.state,'','#explore/'+e.id);radio.renderScene();}
      // A header drawn from an included copy has no preview: the record's own payload draws it again, before the body,
      // and focus in it stays on the title.
      if(selected&&e.previewUrl&&!selected.previewUrl&&!bodyShown){const held=$('entity-inspector').contains(document.activeElement);renderEntity(e);if(held)recordTitle.focus({preventScroll:true});}
      if(selected)selected=e;else header(e);
      const ours=[data,...(await Promise.all(near.credited(e).map(a=>fetched(a).catch(()=>null)))).filter(Boolean)];
      const pool=new Map(ours.flatMap(p=>[p.entity,...p.included]).map(r=>[r.id,r]));
      await Promise.all(near.namingPlan(near.regions(e,records),pool,payloads,navigator.connection?.saveData===true).map(a=>fetched(a).catch(()=>null)));
    })();
    // An answer that fails after the body painted changes nothing. The 10 s limit holds until every request of the hop
    // settles, the naming ones still out when the deadline painted the body too.
    named.catch(()=>{}).then(()=>clearTimeout(timeout));
    try{await Promise.race([named,deadline]);if(painted)await painted;if(hop===controller)renderBody(selected);}
    // A payload that fails after its header showed from a record at hand is as late as one past the deadline: the header
    // stays, in the trail and with focus, and the body paints with the records at hand.
    catch{if(painted)await painted;if(hop===controller){if(selected)renderBody(selected);else{workspace.removeAttribute('aria-busy');workspace.inert=false;workspace.hidden=true;$('discovery-status').textContent=word('unavailable');}}}
    finally{clearTimeout(wake);}
  }
  radio.openTrack=id=>{if(entityID('plex_'+id))go('#explore/plex_'+id);};
  // The stages that play a track, by name.
  const stagesOf=t=>[...new Set((t.playlists||[]).map(p=>radio.stations.find(s=>s.id===p.id||s.name===p.station)).filter(Boolean))];
  // One line of facts under the title, in a sentence: where it plays, and the one fact its type has. Each stage
  // links to its place in Statistics, and a favourite keeps the Essentials heart.
  function recordLine(e) {
    const line=node('p','entity-line'),count=new Map(),year=/^\d{4}/.exec(e.releaseDate||'')?.[0];
    const tracks=e.type==='track'?[e]:(e.connections||[]).filter(c=>c.relation==='track').map(c=>records.get(c.id)).filter(Boolean);
    for(const t of tracks)for(const s of stagesOf(t))count.set(s,(count.get(s)||0)+1);
    const stages=[...count].sort((a,b)=>b[1]-a[1]).flatMap(([s,n],i)=>{
      const pair=node('span');if(s.id==='essentials'&&e.favorite){
        const heart=drawing('0 0 36 36',['M18 30.5S5 22.6 5 13.6A6.6 6.6 0 0 1 18 10.4a6.6 6.6 0 0 1 13 3.2c0 9-13 16.9-13 16.9Z'],'essentials-icon');
        heart.removeAttribute('aria-hidden');heart.setAttribute('role','img');heart.setAttribute('aria-label',word('favorite'));pair.append(heart);
      }
      // An artist counts its tracks on each stage.
      const place=node('a','',s.name);place.href='#statistics/'+s.id;pair.append(place);if(e.type==='artist')pair.append(' ',node('small','',number(n)));return i?[', ',pair]:[pair];
    });
    // A track with no credited artist under Made by, such as one with no profiles yet or whose credited records are not
    // at hand, names its artist and release.
    const parts=[...e.type==='track'&&!near.credited(e).some(id=>records.has(id))?[e.artist,e.album]:[],['artist','label'].includes(e.type)&&e.country&&region(e.country),e.type==='release'&&year,stages.length&&[word(e.type==='track'?'playsOn':'onStage')+' ',...stages],e.type==='track'&&e.durationMs&&time(e.durationMs/1000)];
    parts.filter(Boolean).forEach((part,i)=>{if(i)line.append(' · ');line.append(...[part].flat());});
    return line;
  }
  // The header: the trail, the picture, the type, the title and its line.
  function renderEntity(e) {
    const panel=$('entity-inspector'),heading=node('div','entity-heading'),about=node('div');
    bioWatch?.disconnect();mapWatch?.disconnect();trailWatch?.disconnect();bodyShown=false;
    // The trail of records opened in this visit; going back to one cuts the trail there.
    const at=trail.findIndex(t=>t.id===e.id);trail.splice(at<0?trail.length:at,Infinity,{id:e.id,title:e.title});
    if(trail.length>1){
      const path=node('nav','entity-trail');path.setAttribute('aria-label',word('trail'));
      trail.slice(-4).forEach((t,i,shown)=>{
        if(i){const slash=node('span','',' / ');slash.setAttribute('aria-hidden','true');path.append(slash);}
        const step=node(i<shown.length-1?'a':'span','',t.title);if(step.localName==='a')step.href='#explore/'+t.id;else step.setAttribute('aria-current','page');path.append(step);
      });heading.append(path);
      // It fits again when its box or the font changes: a resize, the map, a late Inter.
      trailWatch=new ResizeObserver(()=>fitTrail(path));trailWatch.observe(path);document.fonts.ready.then(()=>fitTrail(path));
    }
    // The track on air says so in red, the colour of what plays now; the pavoia:radio listener puts it out in place.
    const kind=node('p','eyebrow',word(e.type));
    if(e.id===enriched?.entity.id)kind.append(onAirMark());
    recordTitle=node('h3','',e.title);recordTitle.tabIndex=-1;about.append(kind,recordTitle,recordLine(e));
    previewButton=null;
    if(/^\/api\/discovery\/preview\/trk_[a-f0-9]{12}$/.test(e.previewUrl||'')){
      const circle=node('span','preview-icon');circle.append(drawing('0 0 24 24',['M7 4.5v15l13-7.5z'],'icon-start'),drawing('0 0 24 24',['M6.5 4.5h4v15h-4zM13.5 4.5h4v15h-4z'],'icon-stop'));
      previewButton=action('',()=>{if(preview)finishPreview();else startPreview(e);},'preview-toggle');previewButton.append(circle,node('span'));about.append(previewButton);
    }
    previewState();
    // Notes about the record itself close the header, on the map as in the list.
    about.append(...[e.basicDetails&&'basicDetails',e.reviewRequired&&'held'].filter(Boolean).map(key=>node('p','collection-note',word(key))));
    heading.append(picture(e,word(e.type+'Image')),about);
    // On the map the header sits in the middle of its neighbourhood from its first paint, so it never moves.
    if(mapOn()){const map=node('div','neighbourhood');map.append(heading);panel.replaceChildren(map);}else panel.replaceChildren(heading);
  }
  // The trail stays in its box, on the map the header's: the record shown keeps its whole name whenever the box can hold
  // it, and the steps before it give way first, the oldest first, each keeping a few letters. Each step is as wide as its
  // name until it is cut here.
  function fitTrail(path) {
    const all=[...path.children],steps=all.filter(n=>n.getAttribute('aria-hidden')!=='true'),width=n=>n.getBoundingClientRect().width;
    for(const n of steps)n.style.maxWidth='';
    let over=all.at(-1).getBoundingClientRect().right-all[0].getBoundingClientRect().left-path.clientWidth;
    for(const n of steps){if(!(over>0))break;const w=width(n),cut=Math.min(over,n===steps.at(-1)?w:Math.max(0,w-40));if(cut>0){n.style.maxWidth=w-cut+'px';over-=cut;}}
  }
  // Similar regions keep their heading when empty, and say so in one sentence; so do a label's releases.
  const empties={similar:'noSimilar',similarLabels:'noSimilarLabels',similarReleases:'noSimilarReleases'};
  // The body, painted once: the regions as lists, closest first, then About and On the radio, in the same grid so they
  // sit on the regions' columns.
  function renderBody(e) {
    const panel=$('entity-inspector'),found=near.regions(e,records),map=panel.querySelector('.neighbourhood'),grid=node('div','regions'),line=panel.querySelector('.entity-line');
    bodyShown=true;
    // The line fills in with what the payload brought, such as an artist's stages, unless the listener is in it.
    if(line&&!line.contains(document.activeElement)){line.before(recordLine(e));line.remove();}
    // Its tracks on the radio: where each plays, or its release where none does, and how long it lasts.
    const played=(e.connections||[]).filter(c=>c.relation==='track').map(c=>records.get(c.id)).filter(t=>t?.type==='track')
      .map(t=>({...t,line:stagesOf(t).map(s=>s.name).join(', ')||t.album||'',fact:t.durationMs?time(t.durationMs/1000):''}));
    // Nothing close at all, not even a track on the radio, says so in one sentence, unless the header already said this
    // track has no profiles yet: at the end of the header, with its notes. On the map the regions sit around the header;
    // in the list, in the grid under it.
    if(found.every(r=>!r.total)&&!played.length){if(!e.basicDetails)recordTitle.parentNode.append(node('p','collection-note',word('nothingLinked').replace('{title}',e.title)));}
    else for(const r of found){
      const empty=e.type==='label'&&r.key==='releases'?'noLabelReleases':empties[r.key];
      if(r.items.length||(empty&&!r.total))(map||grid).append(regionSection(r.key,r.items.map(i=>({...i,line:say(i.reason),fact:fact(i)})),empty,'r',Boolean(map)));
    }
    const about=node('section','record-about'),title=node('h4','',word('about').replace('{title}',e.title)),shown=sites(e.links||[]);
    title.id='r-about';about.setAttribute('aria-labelledby',title.id);about.append(title);
    let text=null,more=null,fit=null;
    if(e.bio){
      // The biography reads open, up to four lines; More appears only when there is more.
      const bio=node('div','entity-bio'),foot=node('p','bio-foot'),source=external(e.bioUrl),name=source?site(e.bioSource,source):services.get(e.bioSource);
      text=node('p','',e.bio);text.lang='en';
      // Closed again, it may fit now, after the window grew while it was open: its height does not change then.
      more=action(word('more'),()=>{const open=more.getAttribute('aria-expanded')!=='true';more.setAttribute('aria-expanded',open);more.textContent=word(open?'less':'more');fit();},'text-button');
      more.setAttribute('aria-expanded','false');more.hidden=true;
      // The source links once: in the links line when it is there, or here.
      const credit=node('span','',radio.getState().language==='de'?word('bioEnglish'):'');
      if(name)credit.append((credit.textContent?' · ':'')+word('bioFrom')+' ',source&&!shown.some(l=>l.url===source)?link(name,source):name);
      foot.append(more,credit);bio.append(text,foot);about.append(bio);
    }
    // Library bookkeeping tags (seen_live, batch names) and the tag every record here shares say nothing.
    const tags=(e.tags||[]).filter(t=>!t.includes('_')&&t.toLowerCase()!=='electronic').slice(0,4);
    if(tags.length)about.append(node('p','entity-tags',tags.join(', ')));
    if(shown.length){const links=node('p','entity-links');links.append(node('span','',word('elsewhere')),...shown.map(l=>link(site(l.kind,l.url),l.url)));about.append(links);}
    if(about.children.length>1)grid.append(about);if(played.length)grid.append(regionSection('onRadio',played));
    if(wide.matches)drawMap(panel,map,e);
    if(grid.children.length)panel.append(grid);
    // More follows the width and the font: a turned phone, a narrower window or a late Inter can cut a
    // biography that fitted. Open, it stays, to close it again.
    if(text){
      fit=()=>{const cut=text.scrollHeight>text.clientHeight;more.hidden=!cut&&more.getAttribute('aria-expanded')!=='true';};
      bioWatch=new ResizeObserver(fit);bioWatch.observe(text);document.fonts.ready.then(fit);
    }
  }
  // The header and, once painted, the body again: in another language, or switched between the map and the list.
  // A stage place in Statistics is drawn again from the numbers it showed.
  const redraw=()=>{if(view==='statistics'){if(shownStage)renderStage(...shownStage);return;}if(!selected)return;const body=bodyShown;renderEntity(selected);if(body)renderBody(selected);};
  // Under the map, a caption says what the map means, or why the name in focus is there, and offers the list; over
  // the list, it offers the map. The caption's words repeat the names' links, so screen readers skip them.
  function drawMap(panel,map,e) {
    const caption=node('p','neighbourhood-caption'),hint=node('span'),toggle=action(word(map?'showList':'showMap'),()=>{
      listView=Boolean(map);try{localStorage.setItem('pavoia-explorer-view',listView?'list':'map');}catch{/* Storage is optional. */}
      redraw();panel.querySelector('.neighbourhood-caption')?.querySelector('button')?.focus();
    },'text-button');
    if(!map){caption.append(toggle);panel.querySelector('.entity-heading').after(caption);return;}
    hint.setAttribute('aria-hidden','true');caption.append(hint,toggle);map.after(caption);
    const plan=plans[e.type];if(!plan)return;
    const lines=document.createElementNS('http://www.w3.org/2000/svg','svg');lines.setAttribute('class','map-lines');lines.setAttribute('aria-hidden','true');map.prepend(lines);
    // A name under the pointer or in focus lights its path and its parent's, and the caption says why it is there. A map
    // with no name on it offers none to pick.
    let paths=new Map();const light=li=>{
      for(const path of lines.children)path.removeAttribute('data-lit');
      for(const path of paths.get(li)||[])path.setAttribute('data-lit','');
      hint.textContent=paths.has(li)?['.row-name','.row-line','.row-fact'].map(c=>li.querySelector(c)?.textContent).filter(Boolean).join(' · '):paths.size?word('mapHint'):'';
    };
    // Positions change only when the window does; a map hidden behind another tab has no size to lay out. Laying out
    // hides every name for a moment, which drops focus from the one that had it: focus goes back to that name when the
    // map keeps it, or to the title when a narrower window drops it, never to the page.
    const draw=()=>{
      if(!map.clientWidth)return;const li=document.activeElement?.closest?.('.neighbourhood li'),held=map.contains(li)?li.dataset.id:null;
      paths=layoutMap(map,plan,lines);light(null);
      if(held!==null)([...paths.keys()].find(n=>n.dataset.id===held)?.children[0]||recordTitle).focus({preventScroll:true});
    };draw();
    mapWatch=new ResizeObserver(draw);mapWatch.observe(map);document.fonts.ready.then(draw);
    for(const type of ['pointerover','focusin'])map.addEventListener(type,event=>light(event.target.closest?.('.region li')));
    for(const type of ['pointerleave','focusout'])map.addEventListener(type,()=>light(null));
  }
  // The map's sides: which regions sit left and right of the record, and how each shows its names. rank: 3 pictured of
  // 9; full: 4 pictured of 14, down the whole side; r1: up to 4, pictured only; r2: up to 14, plain only.
  const plans={artist:{left:[['similar','rank'],['worked','rank']],right:[['releases','rank'],['labels','rank']]},
    track:{left:[['madeBy','r1'],['similar','r2']],right:[['releases','rank'],['labels','rank']]},
    release:{left:[['madeBy','r1'],['similar','r2']],right:[['similarReleases','rank'],['labels','rank']]},
    label:{left:[['artists','full']],right:[['similarLabels','rank'],['releases','rank']]},
    // A stage: the artists and labels with the most tracks on it; the stages it shares tracks with, or every stage.
    stage:{left:[['mostTracksBy','rank'],['mostTracksOn','rank']],right:[['sharesWith','full'],['stages','full']]}};
  const rings={rank:[3,9],full:[4,14],r1:[4,4],r2:[0,14]};
  // The record in the middle and its closest names on two ellipses around it, nearer the middle when closer: plain
  // arithmetic on the box and the names' measured sizes, so the same records in the same window give the same map. A
  // plain name hangs in the outer column from a pictured name of its band; any other sits in the inner column. A name
  // or a region name moves out just enough to clear the header, the trail and what is already placed; a plain name with
  // no room in its band, or past the edge, leaves the map (the list keeps it). Returns the paths each name lights.
  function layoutMap(box,plan,lines) {
    const W=box.clientWidth,H=box.clientHeight,cx=W/2,cy=H/2,rx1=Math.min(.19*W,250),rx2=Math.min(.36*W,470),ry=.62*H,origin=box.getBoundingClientRect();
    const on=(rx,y)=>rx*Math.sqrt(1-Math.min(1,Math.abs(y-cy)/ry)**2),paths=new Map();
    const rect=n=>{const r=n.getBoundingClientRect();return {top:r.top-origin.top,bottom:r.bottom-origin.top,inner:0,reach:Math.max(cx-r.left+origin.left,r.right-origin.left-cx),width:r.width,height:r.height};};
    // How far from the middle a box w wide, from top to bottom, starts when it may not start nearer than x: past each box
    // already there that it would meet, 16px clear. Each one taken spans from inner to reach, out from the middle.
    const fit=(x,w,top,bottom,list)=>{for(const o of list.filter(o=>o.top<bottom&&top<o.bottom).sort((a,b)=>a.inner-b.inner))if(o.inner<x+w+16&&x<o.reach+16)x=o.reach+16;return x;};
    const span=(x,y,w,h)=>({top:y-h/2,bottom:y+h/2,inner:x,reach:x+w});
    // An outer name starts past its parent's outer edge, its line's start, even where the ellipse runs nearer the middle.
    const past=p=>p.x+p.width+24,outerX=(i,y)=>Math.max(on(rx2,y),past(i.parent));
    const heading=box.querySelector('.entity-heading'),head=[heading,box.querySelector('.entity-trail')].filter(Boolean).map(rect).filter(r=>r.width);
    // Paths start at the sides of the middle picture; a place with none, such as All stages, starts them at the sides of
    // its words, the heading's last box, level with their middle, so no path runs into a line of them.
    const words=heading.querySelector('.picture')?null:rect([...heading.children].at(-1));
    const start=sign=>words?[cx+sign*(words.reach+8),(words.top+words.bottom)/2]:[cx+sign*68,cy-30];
    const regions=[...box.children].filter(n=>n.dataset?.key);
    for(const r of regions){r.hidden=true;for(const li of r.querySelector('ol')?.children||[])li.hidden=true;}
    lines.replaceChildren();
    for(const side of ['left','right']){
      const sign=side==='left'?-1:1,whole=plan[side].some(([,ring])=>ring!=='rank'),taken=[...head],slot=i=>i.pictured?60:34;
      // A region with nothing in it keeps its heading and its one sentence, where its first name would be.
      const rows=plan[side].map(([key,ring])=>{
        const section=regions.find(r=>r.dataset.key===key),[pictured,most]=rings[ring],note=section?.querySelector('.collection-note');
        return {section,heading:section?.querySelector('h4'),items:note?[{li:note}]:[...section?.querySelector('ol')?.children||[]].slice(0,most).map((li,k)=>({li,id:li.dataset.id,via:li.dataset.via,pictured:k<pictured}))};
      }).filter(x=>x.items.length);
      // Every pictured name keeps its 60px: a side too short for them all shows the lowest of its fullest region as plain
      // names, which then leave like any plain name with no room. No name ends below the map.
      const room=H-80-(whole?0:64*(rows.length-1)),pictured=x=>x.items.filter(i=>i.pictured),need=x=>pictured(x).length*60;
      while(rows.reduce((s,x)=>s+need(x),0)>room)rows.reduce((a,b)=>need(b)>=need(a)?b:a).items.findLast(i=>i.pictured).pictured=false;
      for(const items of whole?[rows.flatMap(x=>x.items)]:rows.map(x=>x.items))for(const i of items)i.outer=!i.pictured&&items.some(p=>p.pictured&&p.id===i.via);
      // The stylesheet sizes a pictured name and a plain one differently: mark them, then measure.
      for(const x of rows){x.section.hidden=false;x.heading.dataset.side=side;for(const i of x.items){i.li.hidden=false;i.li.dataset.side=side;i.li.dataset.ring=i.pictured?'r1':'r2';}}
      for(const i of rows.flatMap(x=>x.items)){const r=rect(i.li);i.width=r.width;i.height=r.height;}
      // One band down the side when a region spans it; otherwise the regions share it by the names each stacks, and a band
      // shorter than its pictured names takes what they need from the others, in proportion to what they have over theirs.
      const weight=x=>x.items.filter(i=>!i.outer).reduce((s,i)=>s+slot(i),0)+40,total=rows.reduce((s,x)=>s+weight(x),0),share=rows.map(x=>room*weight(x)/total);
      const lack=rows.reduce((s,x,k)=>s+Math.max(0,need(x)-share[k]),0),over=rows.reduce((s,x,k)=>s+Math.max(0,share[k]-need(x)),0);let y=64;
      const bands=whole?[[rows,64,H-16]]:rows.map((x,k)=>{const h=need(x)+Math.max(0,share[k]-need(x))*(1-(over&&lack/over)),band=[[x],y,y+h];y+=h+64;return band;});
      for(const [group,y0,y1] of bands){
        // The inner column stacks from the middle of its band; when it runs out of room the lowest plain names leave.
        const inner=group.flatMap(x=>x.items.filter(i=>!i.outer));let need=inner.reduce((s,i)=>s+slot(i),0);
        while(need>y1-y0){const k=inner.findLastIndex(i=>!i.pictured);if(k<0)break;need-=slot(inner[k]);inner.splice(k,1);}
        let at=y0+Math.max(0,(y1-y0-need)/2);
        for(const i of inner){i.y=at+slot(i)/2;at+=slot(i);i.x=fit(on(rx1,i.y),i.width,i.y-i.height/2,i.y+i.height/2,head);i.placed=true;}
        taken.push(...inner.map(i=>span(i.x,i.y,i.width,i.height)));
        // Outer names start level with their parent, 30px apart; a sweep from the top keeps 32px between them, and the
        // column moves up when it runs past its band. A name too wide to fit past its parent is left out first, so the
        // column has no gap.
        const outer=group.flatMap(x=>x.items).filter(i=>{const p=i.outer&&inner.find(p=>p.id===i.via);return p&&past(p)+i.width<=cx;}).slice(0,Math.floor((y1-y0)/32));
        const kids=inner.flatMap(p=>{const k=outer.filter(i=>i.via===p.id);return k.map((i,n)=>Object.assign(i,{parent:p,want:p.y+(n-(k.length-1)/2)*30}));});
        let last=-Infinity;for(const i of kids){i.y=Math.max(i.want,last+32,y0);last=i.y;}
        for(const i of kids){if(last>y1)i.y-=last-y1;i.x=fit(outerX(i,i.y),i.width,i.y-i.height/2,i.y+i.height/2,taken);i.placed=i.x+i.width<=cx;}
        taken.push(...kids.filter(i=>i.placed).map(i=>span(i.x,i.y,i.width,i.height)));
      }
      // A region's name sits just above its first name, on the same curve, and inside the map.
      for(const x of rows){
        const first=x.items.filter(i=>i.placed).sort((a,b)=>a.y-b.y)[0];if(!first){x.section.hidden=true;continue;}
        // Clearing what is placed can push it past the map's edge: it stops at the edge.
        const h=rect(x.heading),hy=first.y-(first.pictured?44:30),hx=Math.min(fit(Math.min(first.outer?outerX(first,hy):on(rx1,hy),cx-h.width),h.width,hy-h.height,hy,taken),cx-h.width);
        x.heading.style.left=cx+sign*hx+'px';x.heading.style.top=hy+'px';taken.push(span(hx,hy-h.height/2,h.width,h.height));
      }
      // Each name placed, and its path: from the side of the middle picture, or from its parent's outer edge, to its own
      // inner edge, where the stylesheet anchors it.
      for(const i of rows.flatMap(x=>x.items)){
        i.li.hidden=!i.placed;if(!i.placed)continue;
        i.li.style.left=cx+sign*i.x+'px';i.li.style.top=i.y+'px';
        // A region's one sentence links nowhere, so no line leads to it.
        if(i.li.localName!=='li')continue;
        const from=i.parent?[cx+sign*(i.parent.x+i.parent.width+8),i.parent.y]:start(sign),to=[cx+sign*i.x,i.y],m=(from[0]+to[0])/2;
        const path=document.createElementNS(lines.namespaceURI,'path');path.setAttribute('d',`M${from[0]} ${from[1]}C${m} ${from[1]} ${m} ${to[1]} ${to[0]} ${to[1]}`);lines.append(path);
        paths.set(i.li,[path,...i.parent?paths.get(i.parent.li).slice(0,1):[]]);
      }
    }
    return paths;
  }
  // On the search page, results that go away while one has focus hand it to the field, never to the
  // page, where Space plays. Opening a record or a tab moves on instead: no keyboard pops up on touch.
  const hideResults=()=>{if($('discovery-results').contains(document.activeElement))$('discovery-query').focus();$('discovery-results').hidden=true;};
  // Results stay in place while the next ones load. The URL holds the query (#explore?q=…), so each
  // history entry keeps its own search, and the Roots tab points to the last one.
  const searchPage=query=>{history.replaceState(history.state,'',query?'#explore?q='+encodeURIComponent(query):'#explore');$('roots-tab').setAttribute('href',location.hash);};
  // Leaving a record for a search or a tab ends its preview, whose button goes with it.
  const hideRecord=()=>{if(preview)finishPreview();$('explore-workspace').hidden=true;};
  // The results speak for themselves; only a cut list or an empty one says so on screen. The count is still
  // said to screen readers, which do not announce a status that empties.
  const found=n=>n>=40?word('firstResults'):n?node('span','visually-hidden',number(n)+' '+word(n===1?'result':'results')):word('empty');
  async function search() {
    clearTimeout(typing);selected=null;hop?.abort();const c=new AbortController(),query=$('discovery-query').value;hop=c;
    searchPage(query);
    $('discovery-status').textContent=word('loading');hideRecord();
    const timeout=setTimeout(()=>c.abort(),10000);
    try {const res=await fetch('/api/discovery/search?q='+encodeURIComponent(query),{signal:c.signal});if(!res.ok)throw new Error();
      const data=await res.json();if(hop!==c)return;if(!Array.isArray(data.items))throw new Error();
      const focused=$('discovery-results').contains(document.activeElement);
      // The same regions and rows as a record: artists, labels, releases, then tracks. The second line says who made
      // a release, and who made a track and on what.
      $('discovery-results').replaceChildren(...[['artist','artists'],['label','labels'],['release','releases'],['track','tracks']].map(([type,key])=>{
        const hits=data.items.filter(v=>v.type===type&&entityID(v.id)).map(v=>({...v,line:[v.artist,type==='track'&&v.album].filter(Boolean).join(' · ')}));
        return hits.length?regionSection(key,hits,'','q'):'';
      }).filter(Boolean));
      if(focused)$('discovery-query').focus();
      shownQuery=query;shownCount=data.items.length;$('discovery-results').hidden=false;$('discovery-status').replaceChildren(found(shownCount));
    }catch{if(hop===c){hideResults();$('discovery-status').textContent=word('unavailable');}}finally{clearTimeout(timeout);}
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
  const halt=()=>{clearTimeout(typing);hop?.abort();hop=null;musicRequest?.abort();musicRequest=null;naming?.abort();};
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
    const link=event.target.closest?.('a[href^="#"]'),href=link?.getAttribute('href')||'';
    if(!/^#(?:explore|history|statistics)(?:[/?]|$)/.test(href))return;
    event.preventDefault();
    // Rows kept on screen while the next ones load are out of date: Enter on one opens nothing.
    const list=$('music-content');
    if(list.contains(link)){if(list.getAttribute('aria-busy'))return;clicked=link;}
    // The picture of a pictured name on the map, for loadEntity() to glide into the middle.
    glide=link.closest?.('.neighbourhood li[data-ring=r1]')?.querySelector('.picture')||null;
    go(href);glide=null;
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
    searchPage('');hop?.abort();hop=null;shownQuery='';hideResults();$('discovery-status').textContent='';
  });
  let view='explore',musicRequest=null,historyPage=null,musicPlace=null,clicked=null,musicScope='',musicKind='',musicDay='',shownStage=null,naming=null;
  const stationName = id => radio.stations.find(s=>s.id===id)?.name || id;
  // A place in Statistics by name: a stage, or all stages together, which hold the whole collection.
  const scopeName = id => id==='radio'?word('allStages'):stationName(id);
  const shortTime = value => new Date(value).toLocaleTimeString(radio.getState().language, {timeStyle:'short'});
  // A day by its month and number: Oct 7.
  const shortDay = value => new Date(value).toLocaleDateString(radio.getState().language, {day:'numeric',month:'short'});
  const number = value => Number(value).toLocaleString(radio.getState().language);
  // The local date as a date field writes it.
  const today = () => new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
  // History's address: a stage, and a day only when it is one before today; today is the live list.
  const historyAt = (stage,day) => '#history/'+stage+(day&&day<today()?'/'+day:'');
  // A day an address can name: a real calendar date the Day field accepts, from its 1970-01-01 minimum, before today.
  const pastDay = day => {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||day<'1970-01-01'||day>=today())return false;
    const [y,m,d]=day.split('-').map(Number);return new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10)===day;
  };
  // A tab's route alone names it: Roots carries the last search (#explore?q=…), History and Statistics their last place.
  const tab = link => link.getAttribute('href').split(/[/?]/)[0].slice(1);
  // Today and yesterday by name, older days by weekday and date.
  function dayName(at) {
    const lang=radio.getState().language,midnight=d=>new Date(d.getFullYear(),d.getMonth(),d.getDate()),days=Math.round((midnight(new Date(Date.now()))-midnight(at))/86400000);
    if(days>1)return at.toLocaleDateString(lang,{weekday:'long',day:'numeric',month:'long'});
    const name=new Intl.RelativeTimeFormat(lang,{numeric:'auto'}).format(-days,'day');return name[0].toUpperCase()+name.slice(1);
  }
  // What the shown music is for: the stage, the list and the day of its address, and the language, since rows drawn in
  // another one are drawn again.
  const musicKey = () => [view,musicScope,musicKind,musicDay,radio.getState().language].join(':');
  // History drawn under a Today that has become Yesterday is drawn again.
  const stale = () => historyPage?.drawn!==today();
  // Both starts come from one playback row: the radio writes it to the second, History to the millisecond.
  // The same second is the same play. Without a start, the track alone decides.
  const samePlay = (item,track) => item.id===track.id&&(!track.startedAt||Math.floor(Date.parse(item.startedAt)/1000)===Date.parse(track.startedAt)/1000);
  // While History shows the newest tracks of the stage on air, its first row follows the radio's play: the
  // start time tells a track played twice in a row from one play.
  const onAir = () => {const s=radio.getState();return s.dataFresh&&s.track&&musicScope===s.stage&&!musicDay?[s.stage,s.track.id,s.track.startedAt].join(':'):'';};
  // The stage row, in the radio rail's style: the stages, and in Statistics all of them together before. The current one
  // is marked; History's links keep the day picked, and a list of names keeps its kind for the other stages, while its
  // own stage leads back to its place. On a phone the row scrolls
  // sideways from the current stage, faded where stages wait. Focus in it moves to the current stage, never to the page.
  function fillRow() {
    const held=stageRow.contains(document.activeElement),ids=radio.stations.map(s=>s.id);
    if(view==='statistics')ids.unshift('radio');
    stageRow.replaceChildren(...ids.map(id=>{const a=node('a','',scopeName(id));a.href=view==='history'?historyAt(id,musicDay):'#statistics/'+id+(musicKind&&id!==musicScope?'/'+musicKind:'');if(id===musicScope)a.setAttribute('aria-current','page');return a;}));
    const current=stageRow.querySelector('[aria-current]');
    stageRow.scrollLeft=current.offsetLeft-(stageRow.clientWidth-current.offsetWidth)/2;fade(stageRow);
    if(held)current.focus({preventScroll:true});
  }
  function setView(next) {
    // Leaving History or a list of names keeps its place: how far it was scrolled, and the row opened from it. That is
    // the row clicked, by pointer, touch or Enter, when it links where the explorer went: a track played twice links
    // twice, and a tap focuses no link.
    if((view==='history'||view==='statistics'&&musicKind)&&next!==view){
      const content=$('music-content'),opened=r=>content.contains(r)&&r.getAttribute('href')===location.hash;
      musicPlace={key:content.dataset.key,top:dialog.scrollTop,row:opened(clicked)?clicked:[...content.children].find(opened)};
    }
    clicked=null;
    view=next;clearTimeout(typing);musicRequest?.abort();musicRequest=null;naming?.abort();
    $('music-view').hidden=next==='explore';$('discovery-search').hidden=next!=='explore';
    $('discovery-status').hidden=next!=='explore';
    for(const link of document.querySelectorAll('.explorer-nav a')) {
      if(tab(link)===next)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
    }
    if(next!=='explore'){
      hop?.abort();hop=null;selected=null;$('discovery-results').hidden=true;hideRecord();mapWatch?.disconnect();
      $('history-day-label').hidden=next!=='history';if($('history-day').max!==today())$('history-day').max=today();if(next!=='history')$('history-more').hidden=true;fillRow();
    }
  }
  async function readJSON(path,signal) {
    const response=await fetch(path,{signal,cache:'no-cache'});
    if(!response.ok)throw new Error('unavailable');return response.json();
  }
  // A name from the statistics is the record of that type and name when the search finds exactly one, compared in one
  // form and case (Âme is âme). Answers are kept for the visit, misses too; a failed search is not an answer.
  const named=new Map(),fold=s=>s.normalize('NFC').toLocaleLowerCase(radio.getState().language);
  async function lookup(type,name,signal) {
    const key=type+':'+name;if(named.has(key))return named.get(key);
    const res=await fetch('/api/discovery/search?q='+encodeURIComponent(name),{signal});if(!res.ok)throw new Error('unavailable');
    const hits=((await res.json()).items||[]).filter(v=>v.type===type&&entityID(v.id)&&fold(v.title||'')===fold(name));
    named.set(key,hits.length===1?hits[0]:null);return named.get(key);
  }
  // #explore/artist/{name} and #explore/label/{name} open the one record of that type and name, or search for the name.
  async function byName(type,name) {
    setView('explore');hideRecord();selected=null;hop?.abort();const c=new AbortController(),timeout=setTimeout(()=>c.abort(),10000);hop=c;
    $('discovery-results').hidden=true;$('discovery-status').textContent=word('loading');
    let hit=null;try{hit=await lookup(type,name,c.signal);}catch{/* The search page says what went wrong. */}finally{clearTimeout(timeout);}
    if(hop!==c)return;
    if(hit){history.replaceState(history.state,'','#explore/'+hit.id);radio.renderScene();loadEntity(hit.id);}
    else{history.replaceState(history.state,'','#explore?q='+encodeURIComponent(name));restore();}
  }
  // "Various Artists" and a name left empty are no one to open.
  const someone = name => Boolean(name.trim())&&name!=='Various Artists';
  // The red On air of what plays now.
  const onAirMark = () => {const on=node('span','on-air',' · ');on.append(node('span','',word('onAir')));return on;};
  const tracks = n => word(n===1?'tracks1':'tracksN').replace('{n}',number(n));
  // An artist or a label opens its record, found by its name, or at once when this visit already found it.
  const credit = (type,name) => {const known=named.get(type+':'+name);
    return {id:type+':'+name,type,title:name,image:known?.image,href:!someone(name)?null:known?'#explore/'+known.id:'#explore/'+type+'/'+encodeURIComponent(name)};};
  // The listener's words with some {parts} as nodes, such as links in a sentence.
  const sentence = (text,parts) => text.split(/(\{\w+\})/).map((p,i)=>i%2?parts[p.slice(1,-1)]:p).filter(p=>p!=='');
  // The numbers of each place fetched in this visit, which a list of its names reuses. Until the server keeps every
  // name, they hold the first 12 only, and the place offers no list.
  const placeStats=new Map(),complete=data=>data.topArtists.length===data.artists;
  // A stage in Statistics is a place on the map of a record: its photo, its name and its numbers in the middle, the
  // artists and labels with the most tracks on it and the stages it shares tracks with around them, each opening its own
  // place. Under it: its release years, what it played most, and how all of it is counted.
  function renderStage(data,music) {
    const content=$('music-content'),scope=data.scope,station=radio.stations.find(s=>s.id===scope),title=scopeName(scope),map=mapOn()?node('div','neighbourhood'):null,grid=node('div','regions');
    const heading=node('div','entity-heading'),about=node('div'),since=Date.parse(music?.earliest)>Date.parse(music?.from),every=complete(data);
    shownStage=[data,music];mapWatch?.disconnect();content.replaceChildren();
    recordTitle=node('h3','',title);recordTitle.tabIndex=-1;
    if(station)about.append(node('p','eyebrow',word('stage')));
    // With every name kept, its artists and its labels are links in the sentence to their lists. The map keeps the shorter
    // sentence, which fits its middle on one line, and links them from the counts over its regions.
    const list=(kind,key,n,cls)=>{const a=node('a',cls,word(key).replace('{n}',number(n)));a.href='#statistics/'+scope+'/'+kind;return a;},line=node('p','entity-line'),linked=every&&!map;
    // One text node between links, as the plain line had: the words shape as they did.
    line.append(...sentence(word(linked?'statLineAll':'statLine'),{tracks:number(data.tracks),hours:number(Math.round(data.durationMs/3600000)),artists:linked?list('artists','artistsLink',data.artists):number(data.artists),labels:linked&&list('labels','labelsLink',data.labels.length)}));line.normalize();
    about.append(recordTitle,line);
    // A station's plays in a sentence that ends on a link to what played there; plays that failed to load say so in
    // their place, and the rest still shows.
    if(station){
      const plays=node('p','entity-line',music?'':word('playsError'));
      // Each dot holds to the word after it, so a line breaks before a dot, never after one.
      if(music){const see=node('a','',word('seeWhatPlayed'));see.href='#history/'+scope;plays.append([word(since?'playsSince':'plays30').replace('{plays}',number(music.plays)).replace('{date}',shortDay(music.earliest)),music.unplayed?word('notPlayed').replace('{n}',number(music.unplayed)):word('allPlayed'),''].join(' ·\u00a0'),see);}
      about.append(plays,action(word('switchStage'),()=>radio.tune(scope),'stage-switch'));
    }
    heading.append(...station?[picture({type:'stage',title,image:station.thumb},'')]:[],about);
    // The first 12 artists and labels, and the stages; each opens its own place, and the count is the fact.
    const names=(type,list)=>list.slice(0,12).map(({name,count})=>({...credit(type,name),line:station?word('tracksOn').replace('{tracks}',tracks(count)).replace('{stage}',title):tracks(count),fact:number(count)}));
    const stages=data.stages.map(({name,count})=>[radio.stations.find(s=>s.id===name),count]).filter(([s])=>s)
      .map(([s,count])=>({id:s.id,type:'stage',title:s.name,image:s.thumb,href:'#statistics/'+s.id,line:station?word('tracksInCommon').replace('{tracks}',tracks(count)):tracks(count),fact:number(count)}));
    const regions=[['mostTracksBy',names('artist',data.topArtists),data.artists,every&&list('artists','allArtists',data.artists,'text-button')],['mostTracksOn',names('label',data.labels),every?data.labels.length:null,every&&list('labels','allLabels',data.labels.length,'text-button')],[station?'sharesWith':'stages',stages,stages.length]]
      .filter(([,items])=>items.length).map(([key,items,count,all])=>regionSection(key,items,'','r',Boolean(map),count,all||null));
    if(map){map.append(heading,...regions);content.append(map);}else{content.append(heading);grid.append(...regions);}
    if(wide.matches)drawMap(content,map,{type:'stage'});
    // Release years in one strip, a bar a year from the first to the last, the empty ones kept as a line.
    const notes=node('section','region release-years'),details=node('details','stage-notes'),years=data.years.filter(y=>/^\d{4}$/.test(y.name)).map(y=>[Number(y.name),y.count]);
    if(years.length){
      const first=Math.min(...years.map(y=>y[0])),last=Math.max(...years.map(y=>y[0])),peak=years.reduce((a,b)=>b[1]>a[1]?b:a),count=new Map(years),strip=node('div','years'),axis=node('p','years-axis'),h=node('h4','',word('years'));
      h.id='r-years';notes.setAttribute('aria-labelledby',h.id);strip.setAttribute('role','list');
      for(let y=first;y<=last;y++){const n=count.get(y)||0,bar=node('span');bar.setAttribute('role','listitem');bar.setAttribute('aria-label',y+': '+tracks(n));if(n)bar.style.height=n/peak[1]*100+'%';else bar.dataset.empty='';strip.append(bar);}
      // The peak's label sits under its bar, but never over the four-digit years at either end: in a mono font each
      // character is 1ch, so it keeps 2ch clear of them.
      const top=node('span','years-peak',peak[0]+' · '+number(peak[1])),clear=6+[...top.textContent].length/2;
      top.style.left=`clamp(${clear}ch, ${(peak[0]-first+.5)/(last-first+1)*100}%, calc(100% - ${clear}ch))`;
      axis.append(node('span','',String(first)),top,node('span','',String(last)));notes.append(h,strip,axis);
    }
    // How it is all counted, closed until asked: the only notes of the view.
    const checked=new Date(data.updatedAt).toDateString()===new Date(Date.now()).toDateString()?shortTime(data.updatedAt):shortDay(data.updatedAt);
    details.append(node('summary','',word('howCounted')),...[word('definitions'),station&&word('playIsStart'),word('checkedAt').replace('{time}',checked),
      ...[['artists','knownArtist'],['labels','knownLabel'],['years','knownYear']].filter(([key])=>data.coverage?.[key]<data.tracks).map(([key,say])=>word(say).replace('{n}',number(data.coverage[key])).replace('{total}',number(data.tracks)))]
      .filter(Boolean).map(text=>node('p','collection-note',text)));
    notes.append(details);grid.append(notes);
    // What it played most, five tracks at most, each opening its record; a list where every count ties says nothing.
    const top=(music?.top||[]).slice(0,5);
    if(top.length&&top[0].plays!==top.at(-1).plays){
      const played=node('section','region'),h=node('h4','',since?word('mostPlayedSince').replace('{date}',shortDay(music.earliest)):word('mostPlayed30')),list=node('ol');
      h.id='r-played';played.setAttribute('aria-labelledby',h.id);
      for(const item of top){const li=node('li'),row=node('a','row'),text=node('span','row-text');if(entityID('plex_'+item.id))row.href='#explore/plex_'+item.id;text.append(node('span','row-name',item.title),node('span','row-line',item.artist));row.append(text,node('span','row-fact',number(item.plays)+'×'));li.append(row);list.append(li);}
      played.append(h,list);grid.append(played);
    }
    content.append(grid);
    // The first three artists and labels that open a record get its picture and its link in place, one search each, unless
    // the listener saves data. Leaving the view drops the searches; the other names keep their initial.
    const rows=regions.flatMap(r=>[...r.querySelector('ol')?.children||[]]);
    if(navigator.connection?.saveData!==true){
      naming?.abort();const c=new AbortController();naming=c;
      for(const [type,list] of [['artist',data.topArtists],['label',data.labels]])for(const {name} of list.filter(i=>someone(i.name)).slice(0,3)){
        if(named.has(type+':'+name))continue;
        lookup(type,name,c.signal).then(hit=>{const li=rows.find(n=>n.dataset.id===type+':'+name);if(!hit||!li)return;const row=li.children[0];row.href='#explore/'+hit.id;image(row.children[0].children[0],hit.image,'');}).catch(()=>{});
      }
    }
    stageAir();
  }
  // A stage place says in red that it is on air, as a record does, and offers to switch to it only when it is not; both
  // follow the radio in place. The button hands its focus to the stage's name when it goes.
  function stageAir() {
    const panel=$('music-content'),kind=panel.querySelector('.eyebrow'),button=panel.querySelector('.stage-switch'),on=shownStage?.[0].scope===radio.getState().stage;
    if(!kind||!button)return;
    if(!on)kind.querySelector('.on-air')?.remove();else if(!kind.querySelector('.on-air'))kind.append(onAirMark());
    if(on&&document.activeElement===button)recordTitle.focus({preventScroll:true});button.hidden=on;
  }
  // Every artist or label of a place, a hundred rows at a time, most tracks first or A to Z, and a filter that ignores
  // case and accents. The filter, the order and the rows shown live in the page, so a record opened from a row comes
  // back to them; none of them changes the address.
  function renderList(data,kind) {
    const content=$('music-content'),scope=data.scope,lang=radio.getState().language,type=kind.slice(0,-1),all=kind==='artists'?data.topArtists:data.labels;
    const loose=s=>s.normalize('NFD').replace(/\p{M}/gu,'').toLocaleLowerCase(lang),collator=new Intl.Collator(lang,{sensitivity:'base',numeric:true});
    const heading=node('div','entity-heading'),about=node('div'),eyebrow=node('p','eyebrow'),back=node('a','',scopeName(scope)),line=node('p','entity-line');
    const controls=node('div','list-controls'),field=node('input'),orders=node('div','stage-row'),status=node('p','collection-note list-status'),spoken=node('span','visually-hidden'),list=node('ol','list-rows');
    let order='count',shown=100,az=null,said=null;
    back.href='#statistics/'+scope;eyebrow.append(back);
    recordTitle=node('h3','',word(kind));recordTitle.tabIndex=-1;about.append(eyebrow,recordTitle,line);heading.append(about);
    // The names that match, in the order asked for.
    const matches=()=>{const q=loose(field.value.trim()),from=order==='name'?(az||=[...all].sort((a,b)=>collator.compare(a.name,b.name))):all;return q?from.filter(i=>loose(i.name).includes(q)):from;};
    const row=({name,count})=>{const li=node('li');li.append(door(credit(type,name),'',tracks(count)));return li;};
    // The button adds a hundred and keeps focus; when it goes, focus moves on to the first name it showed, which takes it
    // even as plain text (Various Artists).
    const more=action(word('showMore'),()=>{const hits=matches(),next=hits.slice(shown,shown+100).map(row);shown+=100;list.append(...next);more.hidden=hits.length<=shown;if(more.hidden){const first=next[0].children[0];if(first.getAttribute('href')==null)first.tabIndex=-1;first.focus();}},'list-more');
    // How many match shows with the rows they leave, so the rows move once, and is said once typing pauses.
    const draw=()=>{
      const hits=matches(),q=field.value.trim();list.replaceChildren(...hits.slice(0,shown).map(row));more.hidden=hits.length<=shown;
      status.textContent=!q?'':hits.length?word('nOfTotal').replace('{n}',number(hits.length)).replace('{total}',number(all.length)):word(kind==='artists'?'noArtistMatch':'noLabelMatch').replace('{q}',q);
      line.textContent=word(kind==='artists'?'listArtists':'listLabels').replace('{n}',number(all.length))+', '+word(order==='count'?'byCount':'byName');
      for(const a of orders.children)if(a.dataset.order===order)a.setAttribute('aria-current','true');else a.removeAttribute('aria-current');
    };
    field.type='search';field.autocomplete='off';field.placeholder=word(kind==='artists'?'filterArtists':'filterLabels');field.setAttribute('aria-label',field.placeholder);
    field.addEventListener('input',()=>{shown=100;draw();clearTimeout(said);said=setTimeout(()=>{spoken.textContent=status.textContent;},300);});
    // The two orders are links to this list itself, in the stage row's style: Space plays over them, as over any link, and
    // the explorer's click router keeps them from moving. Ctrl, Cmd, Shift and middle clicks open the list elsewhere.
    for(const [key,label] of [['count','sortCount'],['name','sortName']]){
      const a=node('a','',word(label));a.href='#statistics/'+scope+'/'+kind;a.dataset.order=key;orders.append(a);
      a.addEventListener('click',event=>{if(event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;order=key;shown=100;draw();});
    }
    spoken.setAttribute('role','status');controls.append(field,orders);draw();
    content.replaceChildren(heading,controls,status,spoken,list,more);
  }
  // follow: the radio asked for this first page, as a new track came on air or another stage was tuned.
  async function loadMusic(more=false,follow=false) {
    musicRequest?.abort();const controller=new AbortController();musicRequest=controller;
    const timeout=setTimeout(()=>controller.abort(),12000),scope=musicScope,kind=musicKind,mode=view,day=musicDay,key=musicKey(),content=$('music-content'),button=$('history-more'),field=$('history-day');
    // The current stage in the row takes focus that has nowhere left to be.
    const stage=()=>stageRow.querySelector('[aria-current]');
    // The field shows the picked day, or today by itself rather than mm/dd/yyyy: past midnight it moves on with the
    // list. A year typed digit by digit passes through years like 0002, under the field's min: the field is left alone.
    // Chrome drops the segment being typed whenever the field is written, so it is written only when it changes.
    if(mode==='history'&&field.validity.valid&&field.value!==(day||today()))field.value=day||today();
    // The button says what it does next, in place, in either language.
    const say=label=>{button.dataset.journey=label;button.textContent=word(label);};
    // The track on air goes back to its time, and the list marks no track as Now.
    const unmark=()=>{const old=historyPage.now;if(old){old.removeAttribute('aria-current');old.children[0].textContent=shortTime(old.children[0].dateTime);}historyPage.now=null;historyPage.live='';};
    // History stays in place, dimmed, until the next rows replace it; Statistics and another view's music
    // go at once, as before. Only an empty list says it is loading. A link that goes with them, or with the record left
    // behind, parks focus on the explorer, as a hop between records does, until the new place takes it.
    let parked=false;
    if(mode!=='history'||content.dataset.key?.split(':')[0]!=='history'){
      parked=[content,$('entity-inspector')].some(n=>n.contains(document.activeElement));if(parked)dialog.focus({preventScroll:true});
      content.replaceChildren();delete content.dataset.key;shownStage=null;
    }
    if($('music-status').contains(document.activeElement))stage().focus();
    // While any request runs the button does nothing, and says so: aria-disabled, unlike disabled, keeps focus on
    // it. Earlier tracks load under the busy button; other requests dim the list.
    button.setAttribute('aria-disabled','true');
    if(more){say('loadingMore');button.setAttribute('aria-busy','true');}
    else content.setAttribute('aria-busy','true');
    $('music-status').textContent=content.children.length?'':word('musicLoading');
    try {
      if(mode==='history'){
        // A picked day lists back from its end; paging then carries on across the days before it. With no day
        // the list ends at the server's now, the clock that announces the track on air: the browser's may run behind.
        const [y,m,d]=day.split('-').map(Number),query=new URLSearchParams({from:new Date(0).toISOString(),limit:'50'});
        if(more){query.set('until',historyPage.until);query.set('before',historyPage.next);}else if(day)query.set('until',new Date(y,m-1,d+1).toISOString());
        // The track on air as the request leaves: one that starts while it travels is still to show.
        const s=radio.getState(),live=more?'':onAir();
        const data=await readJSON('/api/radio/'+scope+'/history?'+query,controller.signal);
        if(musicRequest!==controller)return;
        const rows=[];let shown=more?historyPage.day:'',now=null;
        for(const item of data.items){
          // A heading opens each local day, and stays in view while its rows scroll under it.
          const at=new Date(item.startedAt),row=node('a','row'),when=node('time','',shortTime(item.startedAt)),record=node('span','row-text');
          if(at.toDateString()!==shown){shown=at.toDateString();rows.push(node('h3','history-day',dayName(at)));}
          if(entityID('plex_'+item.id))row.href='#explore/plex_'+item.id;when.dateTime=item.startedAt;
          if(live&&item===data.items[0]&&samePlay(item,s.track)){now=row;row.setAttribute('aria-current','true');when.textContent=word('now');}
          record.append(node('span','row-name',item.title),node('span','row-line',item.artist));row.append(when,record);rows.push(row);
        }
        const focused=document.activeElement;
        // Earlier tracks stop the list following the radio.
        if(more){content.append(...rows);unmark();}
        else{
          // The rows in view stay where they were: a new track above them does not push them down.
          const mark=n=>n.querySelector('time')?.dateTime,top=dialog.scrollTop,anchor=top>0&&[...content.children].find(n=>mark(n)&&n.offsetTop>=top),from=anchor&&anchor.offsetTop;
          // A focused row hands focus to the same play (a track can play twice, at two times), or, once that play
          // has left the page, to the current stage in the row, scrolled into view: never to the page.
          const held=content.contains(focused)?focused:null;content.replaceChildren(...rows);
          const same=anchor&&rows.find(n=>mark(n)===mark(anchor));if(same)dialog.scrollTop=top+same.offsetTop-from;
          if(held){
            const play=rows.find(r=>r.getAttribute('href')===held.getAttribute('href')&&mark(r)===mark(held));
            if(play)play.focus({preventScroll:true});else stage().focus();
          }
          // Reached from a link that went with the last place, History starts on its stage in the row.
          else if(parked&&document.activeElement===dialog)stage().focus();
        }
        // The list follows the play on air only once it shows it: until then each radio answer asks again.
        // ponytail: a stage whose history never records its play would ask at every answer; cap the retries then.
        historyPage={...data,day:shown,more,live:now?live:'',now,drawn:today()};content.dataset.key=key;
        $('music-status').textContent=content.children.length?'':word(day?'noDay':'noHistory');
        button.hidden=!data.next;say('older');
        // A button that goes while it has focus hands it on: to the first track it showed, or to the current stage.
        if(focused===button&&button.hidden)((more&&rows.find(r=>r.getAttribute('href')))||stage()).focus();
      }else{
        // A station's plays come with its numbers; plays that fail leave the numbers to show. A list of names reuses the
        // numbers of its place when this visit has them.
        const [data,music]=await Promise.all([kind&&placeStats.get(scope)||readJSON('/api/library/statistics?scope='+scope,controller.signal),!kind&&radio.stations.some(s=>s.id===scope)?readJSON('/api/radio/'+scope+'/music',controller.signal).catch(()=>null):null]);
        if(musicRequest!==controller)return;placeStats.set(scope,data);
        // A list the numbers cannot fill yet is its place.
        if(kind&&!complete(data))return go('#statistics/'+scope);
        // A place starts at its top, as a record does: a list drawn from the numbers already here leaves no empty page
        // in between for the browser to scroll back up.
        dialog.scrollTop=0;
        if(kind)renderList(data,kind);else renderStage(data,music);content.dataset.key=key;$('music-status').textContent='';
        // A stage place starts at its name, as a record starts at its title, unless the listener moved focus while it loaded.
        if([dialog,document.body].includes(document.activeElement))recordTitle.focus({preventScroll:true});
      }
    }catch {if(musicRequest===controller){
      if(more)say('retry');
      // A refresh the radio asked for keeps the rows, the place and what the list said; its next answer tries again.
      else if(follow){unmark();$('music-status').textContent=content.children.length?'':word(day?'noDay':'noHistory');}
      else{
        if(content.contains(document.activeElement)||document.activeElement===button)stage().focus();
        content.replaceChildren();delete content.dataset.key;historyPage=null;shownStage=null;button.hidden=true;
        $('music-status').replaceChildren(node('span','',word(mode==='history'?'historyError':'musicError')+' '),action(word('retry'),()=>loadMusic()));
      }
    }}
    // A newer load keeps its own busy state; this one clears it, also when leaving the view dropped it.
    finally{clearTimeout(timeout);if(!musicRequest||musicRequest===controller){musicRequest=null;content.removeAttribute('aria-busy');button.removeAttribute('aria-busy');button.removeAttribute('aria-disabled');if(button.dataset.journey==='loadingMore')say('older');}}
  }
  $('music-filters').addEventListener('submit',event=>event.preventDefault());
  // A day picked goes into the address, as a stage does; picking the day shown asks for it again. A year typed digit by
  // digit passes through years like 0002, under the field's min: the list waits for a real day.
  $('history-day').addEventListener('change',()=>{const field=$('history-day');if(!field.validity.valid)return;const place=historyAt(musicScope,field.value);if(place===location.hash)loadMusic();else go(place);});
  // The field allows days up to today, as of when the listener reaches for it: History can stay open past midnight.
  $('history-day').addEventListener('focus',()=>{$('history-day').max=today();});
  $('history-more').addEventListener('click',()=>{if(!musicRequest)loadMusic(true);});
  // Touch screens keep their keyboard down until the listener asks for it.
  const finePointer=matchMedia('(pointer:fine)');
  // A new track on air, or another stage tuned, redraws History's first page in place while it follows the radio.
  // A lost answer redraws nothing, nor does a half-typed day over a picked one: the list shows what it is for.
  // A list with earlier pages follows nothing, but past midnight its days are named anew in place: each heading
  // takes the day of the row under it, and the rows, the pages and the place stay.
  function followRadio(){
    if(!dialog.open||closing||view!=='history'||musicRequest||!historyPage||$('music-content').dataset.key!==musicKey())return;
    if(historyPage.more){if(stale()){const rows=[...$('music-content').children];rows.forEach((n,i)=>{if(n.localName==='h3')n.textContent=dayName(new Date(rows[i+1].children[0].dateTime));});historyPage.drawn=today();}return;}
    if(radio.getState().dataFresh&&(stale()||onAir()!==historyPage.live))loadMusic(false,true);
  }
  function restore(){
    landing=false;
    const [path,params='']=location.hash.split('?');
    // Each part of the path as written; one that cannot be read is an empty part.
    const parts=path.slice(1).split('/').map(part=>{try{return decodeURIComponent(part);}catch{return '';}}),[section,first,second]=parts;
    const id=section==='explore'&&parts.length===2&&entityID(first)?first:null;
    const name=section==='explore'&&parts.length===3&&['artist','label'].includes(first)&&second&&second.length<=200?second:'';
    if(!['explore','history','statistics'].includes(section)||(section==='explore'&&parts.length>1&&!id&&!name)){if(dialog.open)shut();return;}
    // Going back landed on another explorer entry, so the page was not right under: close in place.
    if(closing){shut();history.replaceState(null,'',location.pathname+location.search);radio.renderScene();return;}
    // An entry the browser added itself, such as a typed URL, may not sit right above the page.
    if(!history.state?.explorer)history.replaceState({...history.state,explorer:true},'');
    open();
    if(id)return loadEntity(id);
    if(name)return byName(first,name);
    // History and Statistics read their stage, History its day and Statistics its list of artists or labels, from the
    // address. A bare or unknown stage is the one on air, the whole library is All stages, which holds every playlist,
    // and a day that is not a real one before today is none; the address is rewritten to say so, and the tab keeps it.
    if(section!=='explore'){
      const statistics=section==='statistics',known=[...radio.stations.map(s=>s.id),...statistics?['radio']:[]].includes(first);
      musicScope=known?first:statistics&&first==='library'?'radio':radio.getState().stage;
      musicKind=statistics&&known&&['artists','labels'].includes(second)?second:'';
      musicDay=section==='history'&&pastDay(second||'')?second:'';
      const place=section==='history'?historyAt(musicScope,musicDay):'#statistics/'+musicScope+(musicKind?'/'+musicKind:'');
      if(location.hash!==place)history.replaceState(history.state,'',place);
      for(const link of document.querySelectorAll('.explorer-nav a'))if(tab(link)===section)link.setAttribute('href',place);
    }
    setView(section);
    // The History tab, or the Statistics tab on a list of names, from a record or another tab, brings back the same
    // rows without a reload, scrolled where they were, with focus on the row that was opened; a list keeps its filter, its
    // order and the rows it showed. The place is used once: the second restore() of a browser move changes nothing.
    if((section==='history'||musicKind)&&$('music-content').dataset.key===musicKey()){
      // Only the rows the place was taken from: History's place never scrolls a list drawn since.
      if(musicPlace?.key===musicKey()){dialog.scrollTop=musicPlace.top;if($('music-content').contains(musicPlace.row))musicPlace.row.focus({preventScroll:true});}
      musicPlace=null;
      // A track that came on air while a record was open, or a new day, shows now, not at the next radio answer.
      return followRadio();
    }
    if(section!=='explore')return loadMusic();
    // The Roots tab returns to the last results, searches again for a changed query, or lands on the record on air.
    hop?.abort();hop=null;selected=null;hideRecord();
    const query=new URLSearchParams(params).get('q')||'';$('discovery-query').value=query;
    const again=Boolean(query.trim())&&query===shownQuery&&$('discovery-results').children.length>0;
    $('discovery-results').hidden=!again;$('discovery-status').replaceChildren(again?found(shownCount):'');
    if(finePointer.matches)$('discovery-query').focus();
    if(again)return;
    if(query.trim())search();
    else if(entityID(nowID())){history.replaceState(history.state,'','#explore/'+nowID());loadEntity(nowID());}
    // Until a record is on air the page waits for one: the radio's next answer with a track lands it.
    else{landing=true;if(radio.getState().dataFresh)$('discovery-status').textContent=word('nothingOnAir');}
  }
  // Crossing 1100px swaps the map and the list; focus in the record or the stage place goes back to its title.
  wide.addEventListener('change',()=>{const held=$(view==='explore'?'entity-inspector':'music-content').contains(document.activeElement);redraw();if(held&&(view==='explore'?selected!==null:shownStage!==null))recordTitle.focus({preventScroll:true});});
  window.addEventListener('popstate',restore);
  window.addEventListener('hashchange',restore);
  window.addEventListener('pavoia:radio',()=>{const lang=radio.getState().language;if(currentLanguage!==lang){currentLanguage=lang;localise();}enrich();
    // A record that has left the air loses its red dot in place; nothing else on the page moves.
    if(selected&&selected.id!==enriched?.entity.id)$('entity-inspector').querySelector('.on-air')?.remove();
    stageAir();followRadio();
    if(landing&&!closing&&radio.getState().dataFresh&&(entityID(nowID())||!$('discovery-status').textContent)){landing=false;if(dialog.open&&location.hash==='#explore'&&!$('discovery-query').value.trim())restore();}});
  currentLanguage=radio.getState().language;localise();enrich();restore();setInterval(clock,1000);
})();
