// Playwright CLI run-code callback for On the radio (explore plan step 6): an artist's tracks by release, each with its
// stations, at 1440, 1100, 390 and 360 px, in English and German. It proves that the page never scrolls sideways, that
// no station line is cut, that every row keeps its 56 px, that Show all adds rows below without moving any row already
// shown, and that the keyboard focus ring of a row clears the release line over it. It needs no sound: the stream and
// the previews are blocked, so it never counts as a listener. The discovery service does not run on a developer
// machine, so the three records are inline, modelled on Morttagua, Maceo Plex and Frivolous; every picture is one local
// photo. Run it against the preview:
//   python3 design/stage-direction/serve.py 14541
//   playwright-cli cli -s=radio-tracks open http://127.0.0.1:14541/
//   playwright-cli cli -s=radio-tracks run-code --filename=tests/radio-tracks-browser.js
async page => {
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const origin=new URL(page.url()).origin,photo=Buffer.from(await (await fetch(origin+'/photos/selected/p005.jpg')).arrayBuffer());
  // An artist record as the API sends it: its tracks in the record's order, each [title, stations, release, artist,
  // relation], then the releases [key, title, date]. A release key that is not in the list has no record at hand.
  const hex=n=>n.toString(16).padStart(12,'0'),art=n=>'art_'+hex(n),trk=n=>'trk_'+hex(n),rel=n=>'rel_'+hex(n),media='/api/discovery/media/'+'a'.repeat(40);
  const record=(n,title,tracks,releases)=>{
    const entity={id:art(n),type:'artist',title,image:media,trackCount:tracks.length,playlists:[],connections:tracks.map((_,i)=>({id:trk(n*100+i),relation:'track'}))};
    const songs=tracks.map(([name,stations,release,artist=title,relation='primary'],i)=>({id:trk(n*100+i),type:'track',title:name,artist,album:releases.find(r=>r[0]===release)?.[1]||'',
      releaseDate:releases.find(r=>r[0]===release)?.[2]||'',durationMs:400000+i*7000,image:media,playlists:stations.map(station=>({code:'X',station})),
      connections:[{id:art(n),relation},...release?[{id:rel(n*100+release),relation:'release'}]:[]]}));
    const albums=releases.map(([key,name,date])=>({id:rel(n*100+key),type:'release',title:name,artist:title,releaseDate:date,image:media,connections:[]}));
    return {entity,included:[...songs,...albums]};
  };
  const records={
    morttagua:record(1,'Morttagua',[
      ['Fragarach (Remake 2023)',['Lost in Feelings'],1],['Dhaboros',['Lost in Feelings','Night in Motion'],1],['Dissonant Shadows',['Lost in Feelings'],1],
      ['Hollow (Morttagua Remix)',['Lost in Feelings'],2,'Uncloak','remixer'],['Timoycos (Morttagua remix)',['Night in Motion'],3,'John Cosani & Mariano Mellino','remixer'],
      ['Centurions',['Night in Motion'],3],['The Parallel (Brigado Crew & Crisstiano Italo remix)',['As Night Begins'],3],['Urania (Stan Kolev remix)',['As Night Begins','Night in Motion'],3],
      ['Redroids',['As Night Begins','Lost in Feelings'],4],['Aten',['Night in Motion','Essentials'],4],['Laziness (Morttagua Remix)',['Lost in Feelings'],5,'Space Motion;NekliFF','remixer']],
      [[1,'OBSCURITY, Vol. 01','2024-02-02'],[2,'Pres. Uncloak','2023-05-05'],[3,'Timeless Ibiza','2022-06-06'],[4,'Timeless Weapons','2022-01-01'],[5,'5 Years, Vol. 2','2021-03-03']]),
    maceo:record(2,'Maceo Plex',[
      ['Conjure Balearia',['Night in Motion'],1],['Daliah (Maceo Plex remix)',['Lost in Feelings'],2,'Melawati','remixer'],['Lonely Tribe (Fango Remix)',['Night in Motion'],3],
      ['Lonely Tribe',['Night in Motion'],3],['Mutant Robotics',['Night in Motion'],4],['Why (Original Mix)',['Under the Sun'],5],['Calm Under Pressure',['Night in Motion','Fontanna'],6],
      ['Can\'t Leave You (Tale of Us remix)',['Night in Motion'],0]],
      [[1,'Conjure One EP','2014-03-31'],[2,'Daliah EP','2020-07-23'],[3,'Lonely Tribe','2019-07-22'],[4,'Mutant Series','2019-03-01'],[5,'Watergate Records 2008-2018','2019-01-01'],[6,'Too Underground For The Main Stage','2013-01-01']]),
    frivolous:record(3,'Frivolous',[
      ['Tonight (Original Mix)',['As Night Begins','Under the Sun'],1],['Monster You, Monster Me (Original Mix)',['Essentials','Fontanna','As Night Begins'],1],
      ['For the Message (Dirty Doering & Sascha Cawa\'s Upside Down Mix)',['As Night Begins','Fontanna','Essentials'],2],['Rise Up',['Under the Sun','As Night Begins','Fontanna','Essentials'],2],
      ['C: My Consciousness (Original Mix)',['Under the Sun','Night in Motion','Fontanna','Essentials'],3],['Sooo Savvy...',['Fontanna'],4],['Just Add Irony',['Fontanna'],5],
      ['The Emoticon Don (Movimento primo)',['Under the Sun','Fontanna'],5]],
      [[1,'The Tiny House Of Delusion','2022-01-01'],[2,'Lost & Forgotten','2014-01-01'],[3,'Cadenza Music 10 Year Anniversary','2013-01-01'],[4,'Midnight Black Indulgence','2007-01-01'],[5,'The Emoticon Don E.P.','']])};
  const byId=new Map(Object.values(records).map(r=>[r.entity.id,r]));
  await page.route('**/stream/**',route=>route.abort());
  await page.route('**/api/discovery/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.startsWith('/api/discovery/preview/'))return route.abort();
    if(path.startsWith('/api/discovery/media/'))return route.fulfill({status:200,contentType:'image/jpeg',body:photo});
    const found=byId.get(decodeURIComponent(path.split('/').pop()));
    return found?route.fulfill({json:found}):route.fulfill({status:404,contentType:'text/plain',body:'no record'});
  });
  const frames=(n=3)=>page.evaluate(n=>new Promise(done=>{const tick=()=>--n?requestAnimationFrame(tick):done();requestAnimationFrame(tick);}),n);
  const region='#entity-inspector .region[data-key=onRadio]';
  // Every row of the region: its top from the record's top, which no scroll changes, its height, and whether its
  // station line is cut.
  const rows=()=>page.locator(region).evaluate(section=>{const origin=document.getElementById('entity-inspector').getBoundingClientRect().top;return [...section.querySelectorAll('.row')].map(a=>{const box=a.getBoundingClientRect(),line=a.querySelector('.row-line');
    return {name:a.querySelector('.row-name').textContent,top:box.top-origin,height:box.height,cut:line.scrollWidth>line.clientWidth,line:line.textContent};});});
  const sideways=()=>page.evaluate(()=>{const d=document.getElementById('explorer');return document.documentElement.scrollWidth>innerWidth||d.scrollWidth>d.clientWidth;});
  for(const width of [1440,1100,390,360])for(const language of ['en','de'])for(const [name,data] of Object.entries(records)){
    const at=`${name} at ${width} in ${language}`;
    await page.setViewportSize({width,height:width>760?900:780});
    await page.goto(origin+'/?station=palac-feel');await page.waitForFunction(()=>window.Pavoia?.stations?.length===9);
    await page.locator('#language [value='+language+']').dispatchEvent('click');
    await page.evaluate(id=>{location.hash='#explore/'+id;},data.entity.id);
    await page.waitForFunction(()=>{const w=document.getElementById('explore-workspace');return !w.hidden&&!w.hasAttribute('aria-busy')&&document.querySelector('#entity-inspector .regions');},null,{timeout:15000});
    await page.evaluate(()=>document.fonts.ready);await frames();
    const total=data.included.filter(r=>r.type==='track').length;
    assert(await page.locator(region+' h4').textContent()===(language==='de'?'Im Radio ':'On the radio ')+total,'Wrong heading: '+at);
    assert(await page.locator(region+' .release-line').count()>1,'No release line: '+at);
    const before=await rows();
    assert(before.length===6,'Not six rows first: '+at);
    assert(!await sideways(),'The page scrolls sideways: '+at);
    await page.locator(region+' > button').click();await frames();
    const after=await rows();
    assert(after.length===total,'Show all did not show every row: '+at);
    assert(before.every((row,i)=>Math.abs(after[i].top-row.top)<0.5&&after[i].name===row.name),'A row moved when Show all added the rest: '+at);
    assert(after.slice(6).every(row=>row.top>before.at(-1).top),'The rest is not below: '+at);
    assert(await page.evaluate(region=>document.activeElement===document.querySelectorAll(region+' .row')[6],region),'Focus is not on the first new row: '+at);
    // The keyboard ring of a row that opens a release (2px wide, 3px out) stays whole: its top clears the letters of
    // the release line over the row, descenders included.
    const rings=await page.locator(region).evaluate(section=>[...section.querySelectorAll('li')].filter(li=>li.firstElementChild?.classList.contains('release-line')).map(li=>{
      const row=li.querySelector('.row'),words=document.createRange();row.focus({focusVisible:true});words.selectNodeContents(li.firstElementChild);const style=getComputedStyle(row);
      return {name:row.querySelector('.row-name').textContent,ring:row.matches(':focus-visible')&&style.outlineStyle!=='none',gap:row.getBoundingClientRect().top-parseFloat(style.outlineOffset)-parseFloat(style.outlineWidth)-words.getBoundingClientRect().bottom};}));
    assert(rings.length&&rings.every(r=>r.ring),'No focus ring on a row that opens a release: '+at);
    const struck=rings.filter(r=>r.gap<0);
    assert(!struck.length,'The focus ring strikes the release line over its row: '+at+': '+struck.map(r=>r.name+' '+r.gap.toFixed(2)).join(' | '));
    const cut=after.filter(row=>row.cut),low=after.filter(row=>row.height<56);
    assert(!cut.length,'A station line is cut: '+at+': '+cut.map(row=>row.line).join(' | '));
    assert(!low.length,'A row is lower than 56px: '+at+': '+low.map(row=>row.name+' '+row.height).join(' | '));
    const remixes=data.included.filter(t=>t.type==='track'&&t.connections[0].relation!=='primary').length;
    assert(after.filter(row=>row.line.includes(language==='de'?' · Von ':' · By ')).length===remixes,'A credit is missing or extra: '+at);
    assert(!after.some(row=>row.line.includes(';')),'A raw ";" in a credit: '+at);
    assert(!await sideways(),'The page scrolls sideways after Show all: '+at);
  }
  assert(!errors.length,'Page errors: '+errors.join(' | '));
  return 'radio tracks: 24 records checked (3 artists, 4 widths, 2 languages)';
}
