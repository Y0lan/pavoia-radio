// Playwright CLI run-code callback for the walk in the explorer (explore plan step 3): each move is one history entry,
// Back and Forward walk the visit, and ✕ or Escape leave all of it in one press, with no reload. Part one needs no
// sound: it blocks the stream and the previews, so it never counts as a listener, and it runs on serve.py. At 1440x900
// and at 390x844 (a phone) it walks the records and the Index, then proves a typed address, a station change deep in a
// visit, a link to the History place shown, the search, and 60 hops against the browser's 50 kept entries. Part two
// plays, so it runs only on the fake preview, after GET /__mode?set=ok answered ok; elsewhere it stops before any
// stream request and the result says so. The discovery service does not run on a developer machine, so the six
// records, the search answer, the names and the radio answers are inline: each page opens in a new browser context,
// whose history starts empty. Run it against the preview, then against the fake preview for part two:
//   python3 design/stage-direction/serve.py 14541
//   playwright-cli cli -s=steps open http://127.0.0.1:14541/
//   playwright-cli cli -s=steps run-code --filename=tests/steps-browser.js
//   python3 design/stage-direction/fakeserve.py 14559   (then the same two commands on port 14559)
async page => {
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  const origin=new URL(page.url()).origin,browser=page.context().browser(),errors=[];
  // Six records, modelled on dev's: Maceo Plex and his track Conjure Balearia, which plays on Night in Motion, Morttagua,
  // whom Maceo Plex is similar to, Morttagua's release Timeless Ibiza with Aaron Suiss, and AIKON, similar to Aaron
  // Suiss. Every record links on to the next, so a walk can follow them in both directions.
  const media='/api/discovery/media/'+'a'.repeat(40),maceo='art_01a5cef5b30e',track='trk_0aca6bd42e6d',morttagua='art_3b2ca2e578a6',
    ibiza='rel_825d9614195f',aaron='art_c4ecd93cc408',aikon='art_669e54c0e051';
  const docs={
    [maceo]:{id:maceo,type:'artist',title:'Maceo Plex',bio:'Maceo Plex is a producer.',trackCount:1,connections:[{id:track,relation:'track'},{id:morttagua,relation:'similar'}]},
    [track]:{id:track,type:'track',title:'Conjure Balearia',artist:'Maceo Plex',album:'',releaseDate:'2014-03-31',durationMs:420000,plexId:'900001',
      playlists:[{code:'NIM',station:'Night in Motion'}],connections:[{id:maceo,relation:'primary'}]},
    [morttagua]:{id:morttagua,type:'artist',title:'Morttagua',bio:'Morttagua is a producer.',trackCount:0,connections:[{id:maceo,relation:'similar'},{id:ibiza,relation:'release'}]},
    [ibiza]:{id:ibiza,type:'release',title:'Timeless Ibiza',artist:'Morttagua',releaseDate:'2022-06-06',connections:[{id:morttagua,relation:'primary'},{id:aaron,relation:'primary'}]},
    [aaron]:{id:aaron,type:'artist',title:'Aaron Suiss',bio:'Aaron Suiss is a producer.',trackCount:0,connections:[{id:ibiza,relation:'release'},{id:aikon,relation:'similar'}]},
    [aikon]:{id:aikon,type:'artist',title:'AIKON',bio:'AIKON is a producer.',trackCount:0,connections:[{id:aaron,relation:'similar'}]}};
  for(const d of Object.values(docs))Object.assign(d,{image:media,playlists:d.playlists||[]});
  const answer=id=>({entity:docs[id],included:docs[id].connections.map(c=>docs[c.id])});
  const search={items:[{id:maceo,type:'artist',title:'Maceo Plex',image:media},{id:track,type:'track',title:'Conjure Balearia',artist:'Maceo Plex',image:media}]};
  const names={kind:'artists',updatedAt:'2026-11-01T00:00:00Z',total:6,items:[['Aaron Suiss',aaron,3],['AIKON',aikon,22],['Maceo Plex',maceo,16],['Morttagua',morttagua,11],['Bermuda Kin',undefined,2],['Zeta Kin',undefined,1]]
    .map(([name,id,count])=>({name,id,count,stages:{'palac-dance':count}}))};
  // Every station plays a track of its own; Night in Motion (palac-dance) plays Conjure Balearia. History lists three plays.
  const stations=['ambiance','bermuda-day','bermuda-evening','closing','essentials','etage-zero','fontanna','palac-dance','palac-feel'];
  const radioAnswer=id=>{const now=Date.now(),i=stations.indexOf(id),mine=id==='palac-dance';
    return {stage:{id,name:id},track:{id:mine?'900001':String(800000+i),title:mine?'Conjure Balearia':'Track '+(i+1),artist:mine?'Maceo Plex':'Artist '+(i+1),startedAt:new Date(now-60000).toISOString(),durationMs:3600000,album:''},
      audience:{listeners:0,measuredAt:new Date(now).toISOString(),available:true},sync:{lastSuccess:new Date(now).toISOString(),trackCount:1000},streamUrl:'/stream/'+id+'.mp3'};};
  const plays=id=>({items:[1,2,3].map(k=>({id:String(810000+k),title:'Played '+k,artist:'Artist '+k,startedAt:new Date(Date.now()-k*600000).toISOString(),durationMs:400000})),next:null,station:id});
  // A context with the inline answers. sound=false blocks the stream; with sound, the stream is the fake preview's
  // local tone, which no route touches.
  let searches=0;
  const open=async({width,height,phone=false,sound=false})=>{
    const ctx=await browser.newContext(phone?{viewport:{width,height},isMobile:true,hasTouch:true,deviceScaleFactor:2}:{viewport:{width,height}}),p=await ctx.newPage();
    p.on('pageerror',e=>errors.push(width+': '+e.message));
    if(!sound)await ctx.route('**/stream/**',route=>route.abort());
    await ctx.route('**/api/discovery/**',route=>{
      const url=new URL(route.request().url()),path=url.pathname,id=decodeURIComponent(path.split('/').pop());
      if(path.startsWith('/api/discovery/preview/')||path.startsWith('/api/discovery/media/'))return route.abort();
      if(path==='/api/discovery/search'){searches++;return route.fulfill({json:search});}
      if(path.startsWith('/api/discovery/track/'))return id==='900001'?route.fulfill({json:answer(track)}):route.fulfill({status:404,contentType:'text/plain',body:'no record'});
      return docs[id]?route.fulfill({json:answer(id)}):route.fulfill({status:404,contentType:'text/plain',body:'no record'});
    });
    await ctx.route(url=>/^\/api\/(?:radio\/[a-z-]+(?:\/history)?|audience|library\/names)$/.test(url.pathname),route=>{
      const url=new URL(route.request().url()),[,,kind,id,more]=url.pathname.split('/');
      if(kind==='audience')return route.fulfill({json:{available:true,listeners:0,measuredAt:new Date().toISOString()}});
      if(kind==='library')return url.searchParams.get('kind')==='artists'?route.fulfill({json:names}):route.fulfill({status:503,contentType:'text/plain',body:'unavailable'});
      if(!stations.includes(id))return route.fulfill({status:404,contentType:'text/plain',body:'unknown'});
      return route.fulfill({json:more?plays(id):radioAnswer(id)});
    });
    return {ctx,p};
  };
  const state=p=>p.evaluate(()=>{const d=document.getElementById('explorer'),w=document.getElementById('explore-workspace'),v=document.getElementById('music-view');
    return {length:history.length,at:window.navigation?.currentEntry?.index,search:location.search,hash:location.hash,open:d.open,mark:window.__mark,
      shown:!d.open?'page':!v.hidden?v.dataset.view:w.hidden?'search':document.querySelector('#entity-inspector h3')?.textContent};});
  // A record shows when its title does and its workspace is not busy; a tab when its rows are drawn.
  const record=(p,title)=>p.waitForFunction(title=>{const w=document.getElementById('explore-workspace');return document.getElementById('explorer').open&&!w.hidden&&!w.hasAttribute('aria-busy')&&document.querySelector('#entity-inspector h3')?.textContent===title;},title,{timeout:15000});
  const tab=(p,name,rows)=>p.waitForFunction(([name,rows])=>{const v=document.getElementById('music-view');return document.getElementById('explorer').open&&!v.hidden&&v.dataset.view===name&&!document.getElementById('music-content').hasAttribute('aria-busy')&&document.querySelectorAll(rows).length>0;},[name,rows],{timeout:15000});
  const closed=p=>p.waitForFunction(()=>!document.getElementById('explorer').open,null,{timeout:8000});
  // A link of the record, never one of its trail, scrolled into view and clicked as a listener does. A real click
  // only: a link that is covered or does not take the pointer fails the step.
  const follow=(p,id)=>p.locator('#entity-inspector a[href="#explore/'+id+'"]:not(.entity-trail a)').first().click({timeout:10000});
  // The player's artist opens the visit; the explorer covers the hero, so it is reached only with the explorer closed.
  const credit=async p=>{const link=p.locator('#credited-artists a.artist-credit[href="#explore/'+maceo+'"]');await link.waitFor({timeout:15000});await link.click();await record(p,'Maceo Plex');};
  const spy=p=>p.evaluate(()=>{window.__goes=[];if(history.go.__spied)return;const go=history.go.bind(history),spied=n=>{window.__goes.push(n);go(n);};spied.__spied=true;history.go=spied;});
  const goes=p=>p.evaluate(()=>window.__goes);
  const walk={};

  // Part one, at both widths.
  for(const [width,height,phone] of [[1440,900,false],[390,844,true]]){
    const steps=[],{ctx,p}=await open({width,height,phone});
    const at=async(label,expect)=>{const s=await state(p);steps.push({label,...s});
      for(const [k,v] of Object.entries(expect))assert(s[k]===v,label+' at '+width+' px: '+k+' is '+JSON.stringify(s[k])+', not '+JSON.stringify(v)+' '+JSON.stringify(s));return s;};
    await p.goto(origin+'/?station=palac-dance');
    await p.locator('#language [value=en]').dispatchEvent('click');
    await p.evaluate(()=>{window.__mark=1;});
    const page0=await at('page',{open:false,hash:''}),L=page0.length,base=page0.at;
    // The walk: the player's artist, three hops, the Index tab and one of its rows: depths 0 to 5, one entry each.
    await credit(p);await at('open',{length:L+1,hash:'#explore/'+maceo,shown:'Maceo Plex'});
    const hops=[[morttagua,'Morttagua'],[ibiza,'Timeless Ibiza'],[aaron,'Aaron Suiss']];
    for(const [k,[id,title]] of hops.entries()){await follow(p,id);await record(p,title);await at('hop '+(k+1),{length:L+2+k,hash:'#explore/'+id,shown:title});}
    await p.locator('#index-tab').click();await tab(p,'index','#music-content a.row');await at('Index tab',{length:L+5,hash:'#index/artists',shown:'index'});
    await p.locator('#music-content a.row[href="#explore/'+aikon+'"]').click();await record(p,'AIKON');await at('Index row',{length:L+6,hash:'#explore/'+aikon,shown:'AIKON'});
    // Back, Back, Forward: the Index, Aaron Suiss, the Index again; the browser keeps every entry.
    await p.goBack();await tab(p,'index','#music-content a.row');await at('Back',{length:L+6,hash:'#index/artists',shown:'index'});
    await p.goBack();await record(p,'Aaron Suiss');await at('Back again',{length:L+6,hash:'#explore/'+aaron,shown:'Aaron Suiss'});
    await p.goForward();await tab(p,'index','#music-content a.row');await at('Forward',{length:L+6,hash:'#index/artists',shown:'index'});
    // ✕ from the Index, at depth 4 with a record ahead, goes back over the whole visit to the page in one press.
    await spy(p);await p.locator('#explorer-close').click();await closed(p);
    await at('✕',{open:false,hash:'',search:'?station=palac-dance',at:base,mark:1});
    assert(JSON.stringify(await goes(p))==='[-5]','✕ at depth 4 must call history.go(-5) once at '+width+' px: '+JSON.stringify(await goes(p)));
    // Forward after ✕ opens the first record of the visit, in the browser's order.
    await p.goForward();await record(p,'Maceo Plex');await at('Forward after ✕',{hash:'#explore/'+maceo,shown:'Maceo Plex',mark:1});
    await p.keyboard.press('Escape');await closed(p);await at('Escape',{open:false,hash:'',at:base,mark:1});

    // A typed address opens its record on an entry of its own; two hops later ✕ closes on it, in place, in one press.
    await p.goto(origin+'/?station=palac-dance#explore/'+morttagua);await record(p,'Morttagua');
    await follow(p,ibiza);await record(p,'Timeless Ibiza');await follow(p,aaron);await record(p,'Aaron Suiss');
    await spy(p);await p.locator('#explorer-close').click();await closed(p);
    await at('✕ after a typed address',{open:false,hash:'',search:'?station=palac-dance',mark:1});
    assert((await goes(p)).length===1,'✕ after a typed address took more than one press at '+width+' px');

    // Deep in a visit the arrow steps the station. Back lands on an entry written before it, and Escape still leaves on
    // the address of the station now shown.
    await credit(p);for(const [id,title] of hops){await follow(p,id);await record(p,title);}
    await p.evaluate(()=>document.activeElement?.blur?.());
    await p.keyboard.press('ArrowRight');await p.waitForFunction(()=>window.Pavoia.getState().stage!=='palac-dance');
    const stage=await p.evaluate(()=>window.Pavoia.getState().stage);
    await p.goBack();await record(p,'Timeless Ibiza');await at('Back after the arrow',{search:'?station='+stage});
    await p.keyboard.press('Escape');await closed(p);await at('Escape after the arrow',{open:false,hash:'',search:'?station='+stage,mark:1});
    walk['station'+width]=stage;

    // History on the station shown: a link to the bare #history is the same place, so it adds no entry. The station
    // now plays a track with no record, so the visit opens from a link of the page.
    const follows=(p,href)=>p.evaluate(href=>{const a=document.createElement('a');a.href=href;a.textContent=href;document.getElementById('explorer').append(a);a.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));a.remove();},href);
    await follows(p,'#history/'+stage);await tab(p,'history','#music-content a.row');
    const history0=await at('History',{hash:'#history/'+stage,shown:'history'});
    await follows(p,'#history');await p.waitForTimeout(400);
    await at('#history again',{length:history0.length,hash:'#history/'+stage,shown:'history'});

    // The search on a record: its first result list is one entry, so Back returns to the record; typing more writes it in place.
    await follows(p,'#explore/'+morttagua);await record(p,'Morttagua');
    const roots=await state(p),asked=searches;
    await p.locator('#discovery-query').fill('maceo');await p.waitForFunction(()=>!document.getElementById('discovery-results').hidden&&document.querySelector('#discovery-results .row'));
    await at('maceo',{length:roots.length+1,hash:'#explore?q=maceo'});
    await p.locator('#discovery-query').fill('maceo p');await p.waitForFunction(()=>location.hash==='#explore?q=maceo%20p'&&!document.getElementById('discovery-results').hidden);
    await at('maceo p',{length:roots.length+1,hash:'#explore?q=maceo%20p'});
    assert(searches>=asked+2,'The search did not ask twice at '+width+' px');
    await p.keyboard.press('Escape');await closed(p);await at('Escape after the search',{open:false,hash:'',mark:1});
    walk[width]=steps;
    await ctx.close();

    // Sixty hops in a new tab: from the 41st move each one replaces, so the browser never holds more than 50 entries,
    // ✕ still reaches the page in one press, and Forward opens the visit's first record.
    {
      const {ctx,p}=await open({width,height,phone});
      await p.goto(origin+'/?station=palac-dance');await p.evaluate(()=>{window.__mark=1;});
      const before=await state(p);let most=0;
      await credit(p);
      for(let k=1;k<=60;k++){const [id,title]=k%2?[track,'Conjure Balearia']:[maceo,'Maceo Plex'];await follow(p,id);await record(p,title);
        const s=await state(p);most=Math.max(most,s.length);assert(s.length<=50,'hop '+k+' holds '+s.length+' entries at '+width+' px');}
      await spy(p);await p.locator('#explorer-close').click();await closed(p);
      const after=await state(p);
      // A visit holds 41 entries at most (depths 0 to 40), so ✕ goes back 41 and the page's entry is never pruned.
      assert(JSON.stringify(await goes(p))==='[-41]'&&most===before.length+41&&!after.hash&&!after.open&&after.at===before.at&&after.mark===1,'60 hops then ✕ at '+width+' px: '+JSON.stringify({most,goes:await goes(p),after,before}));
      await p.goForward();await record(p,'Maceo Plex');
      walk['hops'+width]={most,goes:await goes(p),before:before.at,after:after.at};
      await ctx.close();
    }
  }

  // Part two plays: only on the fake preview, whose /stream/** is a local tone, never on serve.py, which relays the
  // stream to the radio and would count it as a listener.
  const mode=await (await page.request.get(origin+'/__mode?set=ok')).text();
  if(mode!=='ok'){assert(errors.length===0,errors.join('; '));return {partOne:true,partTwo:'not run: not the fake preview',walk,errors};}
  const {ctx,p}=await open({width:1440,height:900,sound:true});
  await p.goto(origin+'/?station=palac-dance');
  await p.locator('#audio').evaluate(a=>{a.volume=0;});
  await p.locator('#play').click();
  await p.waitForFunction(()=>window.Pavoia.getState().playbackState==='playing'&&document.getElementById('audio').currentTime>0.2,null,{timeout:15000});
  const source=await p.locator('#audio').getAttribute('src'),times=[];
  // A stop between two samples is still a stop: from here to the listener's own pause, the audio element must fire no
  // pause, emptied, abort or loadstart.
  await p.locator('#audio').evaluate(a=>{window.__cuts=[];for(const type of ['pause','emptied','abort','loadstart'])a.addEventListener(type,()=>window.__cuts.push(type));});
  // Each step lets the music play on: its time grows, it never pauses and its stream never restarts.
  const playsOn=async label=>{const t=times.at(-1)?.time||0;
    const grew=await p.waitForFunction(t=>document.getElementById('audio').currentTime>t+0.3,t,{timeout:10000}).then(()=>true,()=>false);
    const s=await p.locator('#audio').evaluate(a=>({time:a.currentTime,paused:a.paused,src:a.getAttribute('src'),cuts:window.__cuts.slice()}));times.push({label,...s});
    assert(grew&&!s.paused&&s.src===source&&s.cuts.length===0,label+' stopped the music: '+JSON.stringify(times));};
  await credit(p);await playsOn('open');
  for(const [id,title] of [[morttagua,'Morttagua'],[ibiza,'Timeless Ibiza'],[aaron,'Aaron Suiss']]){await follow(p,id);await record(p,title);await playsOn(title);}
  await p.goBack();await record(p,'Timeless Ibiza');await playsOn('Back');
  await p.goBack();await record(p,'Morttagua');await playsOn('Back again');
  await p.goForward();await record(p,'Timeless Ibiza');await playsOn('Forward');
  await p.locator('#explorer-close').click();await closed(p);await playsOn('✕');
  await p.goForward();await record(p,'Maceo Plex');await playsOn('Forward after ✕');
  // A pause stays a pause through Back.
  const cuts=await p.evaluate(()=>window.__cuts);
  assert(cuts.length===0,'The walk cut the music: '+JSON.stringify(cuts));
  await p.locator('#play').click();await p.waitForFunction(()=>document.getElementById('audio').paused);
  await follow(p,morttagua);await record(p,'Morttagua');
  await p.goBack();await record(p,'Maceo Plex');await p.waitForTimeout(500);
  assert(await p.locator('#audio').evaluate(a=>a.paused)&&!(await p.evaluate(()=>window.Pavoia.getState().wanted)),'Back after a pause played again');
  await ctx.close();
  assert(errors.length===0,errors.join('; '));
  return {partOne:true,partTwo:true,walk,sound:times,errors};
}
