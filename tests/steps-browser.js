// Playwright CLI run-code callback for the walk in the explorer (explore plan step 3): each move is one history entry,
// Back and Forward walk the visit, and ✕ or Escape leave all of it in one press, with no reload. Part one needs no
// sound: it blocks the stream and the previews, so it never counts as a listener, and it runs on serve.py. At 1440x900
// and at 390x844 (a phone) it walks the records and the Index, then proves a typed address, a station change deep in a
// visit, a link to the History place shown, the search, and 60 hops against the browser's 50 kept entries; then that
// Back and Forward return to the place left, a record and the Index, each in one frame (explore plan step 4); then the
// line over a record's title at five sizes in two languages, and its links with and without the Navigation API and
// through a reload (explore plan step 5). Part two
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
  // Super Flu, similar to Maceo Plex, has twelve tracks on Night in Motion: open whole, his record is taller than the
  // window, so a Back to it has a scroll to bring back. He is also similar to Flu Friend, whose own record names a third
  // artist that no answer includes: each time Super Flu opens, his naming asks for Flu Friend's record, which answers
  // 404 after 400 ms, so even a Back to him waits for his body over many frames.
  const superflu='art_56f6aff9324c',flu=n=>'trk_5f00000000'+String(n).padStart(2,'0'),friend='art_5f0000000098',unnamed='art_5f0000000099';
  docs[superflu]={id:superflu,type:'artist',title:'Super Flu',bio:'Super Flu is a duo.',trackCount:12,
    connections:[...Array.from({length:12},(_,i)=>({id:flu(i+1),relation:'track'})),{id:maceo,relation:'similar'},{id:friend,relation:'similar'},{id:unnamed,relation:'similar'}]};
  docs[friend]={id:friend,type:'artist',title:'Flu Friend',trackCount:0,connections:[{id:unnamed,relation:'similar'}]};
  for(let n=1;n<=12;n++)docs[flu(n)]={id:flu(n),type:'track',title:'Flu Track '+n,artist:'Super Flu',album:'',releaseDate:'2020-01-01',durationMs:300000+n*1000,plexId:String(900100+n),
    playlists:[{code:'NIM',station:'Night in Motion'}],connections:[{id:superflu,relation:'primary'}]};
  for(const d of Object.values(docs))Object.assign(d,{image:media,playlists:d.playlists||[]});
  const answer=id=>({entity:docs[id],included:docs[id].connections.map(c=>docs[c.id]).filter(Boolean)});
  const search={items:[{id:maceo,type:'artist',title:'Maceo Plex',image:media},{id:track,type:'track',title:'Conjure Balearia',artist:'Maceo Plex',image:media}]};
  // 120 names before AIKON make the Index taller than the window, so it has a place to come back to.
  const names={kind:'artists',updatedAt:'2026-11-01T00:00:00Z',total:126,items:[['Aaron Suiss',aaron,3],['AIKON',aikon,22],['Maceo Plex',maceo,16],['Morttagua',morttagua,11],['Bermuda Kin',undefined,2],['Zeta Kin',undefined,1],
    ...Array.from({length:120},(_,i)=>['Aa Kin '+String(i+1).padStart(3,'0'),undefined,1])].map(([name,id,count])=>({name,id,count,stages:{'palac-dance':count}}))};
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
      if(id===friend)return new Promise(done=>setTimeout(done,400)).then(()=>route.fulfill({status:404,contentType:'text/plain',body:'no record'}));
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
  // A link of the record, never one of its line, scrolled into view and clicked as a listener does. A real click
  // only: a link that is covered or does not take the pointer fails the step.
  const follow=(p,id)=>p.locator('#entity-inspector a[href="#explore/'+id+'"]:not(.entity-trail a)').first().click({timeout:10000});
  // A record is measured once it stands still: its fonts are in, no animation runs, and its title keeps its height for
  // three looks 150 ms apart. A busy machine paints late, and a fixed wait then measures a record on its way.
  const still=async p=>{
    await p.evaluate(()=>document.fonts.ready.then(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>null)))));
    for(let i=0,last=null,same=0;i<60&&same<3;i++){const y=await p.evaluate(()=>Math.round(document.querySelector('#entity-inspector h3')?.getBoundingClientRect().top??-1));same=y===last?same+1:0;last=y;await p.waitForTimeout(150);}
  };
  // The player's artist opens the visit; the explorer covers the hero, so it is reached only with the explorer closed.
  const credit=async p=>{const link=p.locator('#credited-artists a.artist-credit[href="#explore/'+maceo+'"]');await link.waitFor({timeout:15000});await link.click();await record(p,'Maceo Plex');};
  const spy=p=>p.evaluate(()=>{window.__goes=[];if(history.go.__spied)return;const go=history.go.bind(history),spied=n=>{window.__goes.push(n);go(n);};spied.__spied=true;history.go=spied;});
  const goes=p=>p.evaluate(()=>window.__goes);
  // Every frame from now on, read in requestAnimationFrame before it paints: the record's title, whether its regions
  // are there, the scroll, and which view shows. frames() counts the frames from the first one that shows the place
  // to the one at its final scroll: a place that paints whole at once counts 1. Until it shows, the last view must.
  const sample=p=>p.evaluate(()=>{window.__frames=[];const d=document.getElementById('explorer');let n=0;
    const tick=()=>{const w=document.getElementById('explore-workspace'),v=document.getElementById('music-view'),r=document.getElementById('discovery-results');
      window.__frames.push({h3:w.hidden?null:document.querySelector('#entity-inspector h3')?.textContent||null,regions:!w.hidden&&Boolean(document.querySelector('#entity-inspector .region')),top:Math.round(d.scrollTop),view:v.hidden?null:v.dataset.view,ws:!w.hidden,res:!r.hidden});
      if(++n<120)requestAnimationFrame(tick);};
    requestAnimationFrame(tick);});
  const frames=async(p,want)=>{await p.waitForTimeout(150);const f=await p.evaluate(()=>window.__frames.slice()),shows=x=>want.title?x.h3===want.title:x.view===want.view;
    const first=f.findIndex(shows),last=f.findIndex(x=>shows(x)&&Math.abs(x.top-want.top)<=2&&(!want.title||x.regions));
    return {count:first<0||last<0?null:last-first+1,waited:first,empty:f.slice(0,first<0?f.length:first).filter(x=>!x.view&&!x.ws&&!x.res).length};};
  const place=p=>p.evaluate(()=>{const a=document.activeElement,d=document.getElementById('explorer');return {top:Math.round(d.scrollTop),href:a?.getAttribute('href')||a?.localName,region:a?.closest('.region')?.dataset.key||null,
    y:Math.round(a.getBoundingClientRect().top),open:[...document.querySelectorAll('#entity-inspector .region[data-open]')].map(n=>n.dataset.key)};});
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

    // Back and Forward return to the place left (explore plan step 4), each in one paint. Super Flu, opened whole and
    // scrolled, then a track: Back brings him back at that scroll, with focus on the track followed; Forward brings the
    // track back at its title, and a Back with focus on the player bar leaves focus there. The Index, scrolled, then AIKON: Back brings the Index back at that scroll, with focus
    // on AIKON's row at the same height. Back from the Index to Super Flu never leaves the explorer empty. A new hop by a
    // link still starts at its title.
    {
      const {ctx,p}=await open({width,height,phone});
      await p.goto(origin+'/?station=palac-dance');await p.locator('#language [value=en]').dispatchEvent('click');
      await p.evaluate(href=>{const a=document.createElement('a');a.href=href;document.body.append(a);a.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));a.remove();},'#explore/'+superflu);
      await record(p,'Super Flu');
      await p.locator('#entity-inspector .region[data-key=onRadio] > button.text-button').click();
      const track=p.locator('#entity-inspector .region[data-key=onRadio] a.row[href="#explore/'+flu(10)+'"]');
      await track.evaluate(a=>{const d=document.getElementById('explorer');d.scrollTop+=a.getBoundingClientRect().top-d.getBoundingClientRect().top-160;});await p.waitForTimeout(100);
      const left={...await place(p),y:await track.evaluate(a=>Math.round(a.getBoundingClientRect().top))};assert(left.top>=100,'Super Flu is not taller than the window at '+width+' px: '+JSON.stringify(left));
      await track.click();await record(p,'Flu Track 10');
      const hop=await place(p);assert(hop.top===0&&hop.href==='h3','a hop by a link must start at its title at '+width+' px: '+JSON.stringify(hop));
      // He is the first record of the visit: he comes back with the line over his title, which was not there when he was
      // left. He was left scrolled past it, so the line is out of view and the scroll grows by its height (0 px on the
      // map, where the line stands over the picture): the track followed stands where it stood.
      await sample(p);await p.goBack();await record(p,'Super Flu');const back=await place(p),backFrames=await frames(p,{title:'Super Flu',top:back.top});
      assert(Math.abs(back.y-left.y)<=1&&back.top>=left.top&&back.top-left.top<=48&&back.href==='#explore/'+flu(10)&&back.region==='onRadio'&&back.open.includes('onRadio')&&backFrames.count===1&&!backFrames.empty,
        'Back to Super Flu at '+width+' px: '+JSON.stringify({left,back,backFrames}));
      await sample(p);await p.goForward();await record(p,'Flu Track 10');const forward=await place(p),forwardFrames=await frames(p,{title:'Flu Track 10',top:0});
      assert(forward.top===0&&forwardFrames.count===1&&!forwardFrames.empty,'Forward to the track at '+width+' px: '+JSON.stringify({forward,forwardFrames}));
      // Focus on the player bar stays there through Back: on the volume, the next arrow sets the volume, not the station.
      const control=phone?'#play':'#volume';await p.locator(control).focus();
      await p.goBack();await record(p,'Super Flu');
      if(!phone)await p.keyboard.press('ArrowRight');
      const kept=await p.evaluate(()=>({focus:document.activeElement?.id,station:new URLSearchParams(location.search).get('station')}));
      assert(kept.focus===control.slice(1)&&kept.station==='palac-dance','Back with focus on '+control+' at '+width+' px: '+JSON.stringify(kept));
      // The Index from Super Flu, scrolled so AIKON stands 300 px down, then AIKON. The tab is clicked where it stands:
      // a pointer click would first scroll the explorer to bring the sticky tab into view.
      await p.locator('#index-tab').dispatchEvent('click');await tab(p,'index','#music-content a.row');
      const aikonRow=p.locator('#music-content a.row[href="#explore/'+aikon+'"]');
      await aikonRow.evaluate(a=>{const d=document.getElementById('explorer');d.scrollTop+=a.getBoundingClientRect().top-d.getBoundingClientRect().top-300;});await p.waitForTimeout(400);
      const index=await p.evaluate(sel=>({top:Math.round(document.getElementById('explorer').scrollTop),y:Math.round(document.querySelector(sel).getBoundingClientRect().top)}),'#music-content a.row[href="#explore/'+aikon+'"]');
      assert(index.top>=100,'the Index is not taller than the window at '+width+' px: '+JSON.stringify(index));
      await aikonRow.click();await record(p,'AIKON');
      await sample(p);await p.goBack();await tab(p,'index','#music-content a.row');const indexBack=await place(p),indexFrames=await frames(p,{view:'index',top:index.top});
      assert(Math.abs(indexBack.top-index.top)<=2&&indexBack.href==='#explore/'+aikon&&Math.abs(indexBack.y-index.y)<=2&&indexFrames.count===1,'Back to the Index at '+width+' px: '+JSON.stringify({index,indexBack,indexFrames}));
      // Back from the Index to Super Flu: the Index stays until Super Flu paints whole, at the scroll he had.
      await sample(p);await p.goBack();await record(p,'Super Flu');const fromIndex=await frames(p,{title:'Super Flu',top:back.top}),again=await place(p);
      assert(fromIndex.count===1&&fromIndex.waited>=5&&fromIndex.empty===0&&Math.abs(again.top-back.top)<=2,'Back from the Index to Super Flu at '+width+' px: '+JSON.stringify({fromIndex,again}));
      // He left Super Flu by a tab, so no link of his record is kept, and his title is far up: focus goes to a link
      // that shows whole, so the first Tab keeps the record where it is.
      const held=await p.evaluate(()=>{const a=document.activeElement,d=document.getElementById('explorer'),box=a.getBoundingClientRect(),bar=Math.max(d.querySelector('.explorer-top').getBoundingClientRect().bottom,d.getBoundingClientRect().top);
        return {inRecord:Boolean(a.closest('#entity-inspector')),whole:box.top>=bar-0.5&&box.bottom<=d.getBoundingClientRect().bottom+0.5};});
      assert(held.inRecord&&held.whole,'Back from the Index to Super Flu put focus on something out of view at '+width+' px: '+JSON.stringify(held));
      await p.keyboard.press('Tab');const tabbed=await place(p);assert(Math.abs(tabbed.top-back.top)<=120,'the first Tab lost the scroll at '+width+' px: '+JSON.stringify({tabbed,back}));
      walk['place'+width]={left,hop,back,backFrames,forward,forwardFrames,kept,index,indexBack,indexFrames,fromIndex,again};
      await ctx.close();
    }
  }

  // The line over a record's title (explore plan step 5) replaces the Path, in its place and at its height. Morttagua,
  // Timeless Ibiza, Aaron Suiss, then Back: Timeless Ibiza names the place before and the place after. On the map at 1440
  // and 1100, in the list at 1100, and on phones at 390 and 360, in English and German, its title stands where the Path
  // put it, the line overflows nothing, and each link's 44 px target (14 px over and under it, 8 px beside it) covers no
  // name of the map and no control of the bar. The titles stand where the Path put them with these records: 415, 365,
  // 172, 213 and 213 px (dev's Timeless Ibiza, whose map is laid out from more names, puts them at 467 and 417 on the maps).
  const line=p=>p.evaluate(()=>{const box=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};},nav=document.querySelector('#entity-inspector .entity-trail');
    const meet=(a,b)=>a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom,shown=n=>{const r=n.getBoundingClientRect();return r.width>0&&r.height>0&&!n.closest('[hidden]');};
    const others=[...document.querySelectorAll('#entity-inspector .neighbourhood li'),...document.querySelectorAll('.explorer-top :is(a, button, input)')].filter(shown);
    const links=nav?[...nav.querySelectorAll('a')].map(a=>{const r=box(a),grown={left:r.left-8,right:r.right+8,top:r.top-14,bottom:r.bottom+14};
      return {text:a.textContent,name:a.getAttribute('aria-label'),href:a.getAttribute('href'),step:a.dataset.step,width:Math.round(r.width),covers:others.filter(o=>meet(grown,box(o))).map(o=>o.textContent.trim().slice(0,30)||o.id)};}):[];
    // Over: how far a link stands past the line's edges. The 44 px targets reach past them, as they may: nothing scrolls.
    const d=document.getElementById('explorer'),edge=nav&&box(nav),over=nav?Math.max(0,...[...nav.querySelectorAll('a')].map(a=>{const r=box(a);return Math.max(edge.left-r.left,r.right-edge.right);})):0;
    return {title:Math.round(document.querySelector('#entity-inspector h3').getBoundingClientRect().top),line:nav?{label:nav.getAttribute('aria-label'),width:Math.round(edge.width),height:Math.round(edge.height),over}:null,links,page:document.documentElement.scrollWidth,frame:d.scrollWidth-d.clientWidth};});
  const toIbiza=async p=>{
    await p.evaluate(href=>{const a=document.createElement('a');a.href=href;document.body.append(a);a.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));a.remove();},'#explore/'+morttagua);
    // The explorer slides in as it opens: Morttagua is measured once it stands still.
    await record(p,'Morttagua');await still(p);const first={...await line(p),at:await p.evaluate(()=>Math.round(document.getElementById('explorer').scrollTop))},link=p.locator('#entity-inspector a[href="#explore/'+ibiza+'"]:not(.entity-trail a)').first();
    await link.scrollIntoViewIfNeeded();first.left=await link.evaluate(a=>({y:Math.round(a.getBoundingClientRect().top),top:Math.round(document.getElementById('explorer').scrollTop)}));
    await follow(p,ibiza);await record(p,'Timeless Ibiza');await follow(p,aaron);await record(p,'Aaron Suiss');
    await p.goBack();await record(p,'Timeless Ibiza');await still(p);return first;};
  walk.line={};
  for(const [size,width,height,phone,list,title] of [['1440 map',1440,900,false,false,415],['1100 map',1100,800,false,false,365],['1100 list',1100,800,false,true,172],['390',390,844,true,false,213],['360',360,740,true,false,213]])
    for(const [lang,back,ahead] of [['en','Back to Morttagua','Forward to Aaron Suiss'],['de','Zurück zu Morttagua','Weiter zu Aaron Suiss']]){
      const {ctx,p}=await open({width,height,phone});
      if(list)await ctx.addInitScript(()=>{try{localStorage.setItem('pavoia-explorer-view','list');}catch{/* Storage is optional. */}});
      await p.goto(origin+'/?station=palac-dance');await p.locator('#language [value='+lang+']').dispatchEvent('click');
      const first=await toIbiza(p),m=await line(p),label=size+' '+lang+': '+JSON.stringify({first,m});
      assert(first.line===null,'the first record of a visit has a line at '+label);
      assert(m.title===title,'the title moved from '+title+' px at '+label);
      assert(m.line&&m.line.height===17&&m.line.over<=0.5&&m.page<=width&&m.frame<=0,'the line is not 17 px high on one row inside its box, or something scrolls sideways, at '+label);
      assert(JSON.stringify(m.links.map(l=>[l.name,l.text,l.step]))===JSON.stringify([[back,'Morttagua','-1'],[ahead,'Aaron Suiss','1']]),'the line does not name both places at '+label);
      assert(m.links.every(l=>l.covers.length===0&&l.width<=m.line.width/2+0.5),'a link covers a name or a control, or takes more than half the line, at '+label);
      // Back to Morttagua, the first record: the line now stands over his title. On the map it stands over the picture:
      // nothing moves. In the list, where the line shows at the place left, under the bar, the scroll stays and all under
      // the line stands lower by its height; where it is scrolled out of view, the scroll moves by its height, so the link
      // followed stands where it stood (the explorer may scroll that far only where the record is taller than the window).
      await p.goBack();await record(p,'Morttagua');
      const home=await p.evaluate(id=>({y:Math.round(document.querySelector('#entity-inspector a[href="#explore/'+id+'"]:not(.entity-trail a)').getBoundingClientRect().top),top:Math.round(document.getElementById('explorer').scrollTop),max:(d=>d.scrollHeight-d.clientHeight)(document.getElementById('explorer')),
        title:Math.round(document.querySelector('#entity-inspector h3').getBoundingClientRect().top),ahead:document.querySelector('#entity-inspector .entity-trail a[data-step="1"]')?.textContent,
        line:Math.round(document.querySelector('#entity-inspector .entity-trail')?.getBoundingClientRect().bottom??-1),bar:Math.round(Math.max(document.querySelector('.explorer-top').getBoundingClientRect().bottom,document.getElementById('explorer').getBoundingClientRect().top))}),ibiza);
      // How much lower his title stands in the record than when he was left: the line's height and its gap.
      home.grown=home.title+home.top-first.title-first.at;home.shows=home.line>home.bar;
      const kept=JSON.stringify({left:first.left,home,first:first.title,at:first.at});
      assert(home.ahead==='Timeless Ibiza','Back to Morttagua shows no line forward at '+label+' '+kept);
      if(!phone&&!list)assert(home.title===first.title&&home.top===first.left.top&&home.y===first.left.y,'on the map, Morttagua moved at '+size+' '+lang+': '+kept);
      else if(home.shows)assert(home.top===first.left.top&&home.grown>=17&&home.grown<=48&&Math.abs(home.y-first.left.y-home.grown)<=1,'the line shows, and the scroll moved or the record did not stand lower by the line at '+size+' '+lang+': '+kept);
      else assert(home.grown>=17&&(Math.abs(home.y-first.left.y)<=1||home.top===home.max),'the line is out of view, and the link followed moved at '+size+' '+lang+': '+kept);
      walk.line[size+' '+lang]={title:m.title,width:m.line.width,links:m.links.map(l=>[l.text,l.width]),first:{left:first.left,home}};
      await ctx.close();
    }

  // A double click on the line steps once. On the map a lone link stands in the middle, so the second click of a double
  // click lands on the link drawn in its place, or, when both come before the browser moves, on the same link again:
  // either would undo the step, or step twice back, out of the explorer.
  walk.double={};
  for(const [width,height] of [[1440,900],[1100,800]])
    for(const gap of [0,40,150,300]){
      const {ctx,p}=await open({width,height});
      await p.goto(origin+'/?station=palac-dance');await p.locator('#language [value=en]').dispatchEvent('click');
      await p.evaluate(href=>{const a=document.createElement('a');a.href=href;document.body.append(a);a.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));a.remove();},'#explore/'+morttagua);
      // A pictured name glides into the middle: the double click comes once the link takes the pointer where it stands.
      await record(p,'Morttagua');await follow(p,ibiza);await record(p,'Timeless Ibiza');
      await p.waitForFunction(()=>{const a=document.querySelector('#entity-inspector .entity-trail a[data-step="-1"]'),r=a?.getBoundingClientRect();
        return r&&!document.getAnimations().length&&document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest('a')===a;},null,{timeout:8000});
      const box=await p.locator('#entity-inspector .entity-trail a[data-step="-1"]').evaluate(a=>{const r=a.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,links:a.parentNode.children.length};});
      assert(box.links===1,'Timeless Ibiza has more than its back link at '+width+' px');
      if(gap){await p.mouse.click(box.x,box.y);await p.waitForTimeout(gap);await p.mouse.click(box.x,box.y);}else await p.mouse.dblclick(box.x,box.y);
      await p.waitForTimeout(800);const s=await state(p);
      assert(s.open&&s.shown==='Morttagua'&&s.hash==='#explore/'+morttagua,'a double click '+gap+' ms apart at '+width+' px ended on '+JSON.stringify(s));
      walk.double[width+' '+gap]=s.shown;
      await ctx.close();
    }

  // The line's links are the browser's Back and Forward, with the Navigation API and without it: each one steps one
  // entry and loads no other document. A reload keeps the line, from the entry's state.
  for(const hide of [false,true]){
    const {ctx,p}=await open({width:1440,height:900});
    if(hide)await ctx.addInitScript(()=>{delete window.navigation;if('navigation' in window)Object.defineProperty(window,'navigation',{value:undefined,configurable:true});});
    await p.goto(origin+'/?station=palac-dance');await p.locator('#language [value=en]').dispatchEvent('click');
    await toIbiza(p);await p.evaluate(()=>{window.__mark=1;});await spy(p);
    const at=await state(p),api=await p.evaluate(()=>typeof window.navigation);
    assert(api===(hide?'undefined':'object'),'the Navigation API is '+api+' with hide='+hide);
    const click=async(step,title)=>{await p.locator('#entity-inspector .entity-trail a[data-step="'+step+'"]').click();await record(p,title);return state(p);};
    const ahead=await click(1,'Aaron Suiss'),back=await click(-1,'Timeless Ibiza'),label=JSON.stringify({hide,at,ahead,back,goes:await goes(p)});
    assert(ahead.length===at.length&&back.length===at.length&&ahead.mark===1&&back.mark===1&&ahead.hash==='#explore/'+aaron&&back.hash==='#explore/'+ibiza&&JSON.stringify(await goes(p))==='[1,-1]','the line did not step as Back and Forward do: '+label);
    if(!hide)assert(ahead.at===at.at+1&&back.at===at.at,'the line moved the entry by more than one: '+label);
    const before=await line(p);await p.reload();await record(p,'Timeless Ibiza');const after=await line(p);
    assert(JSON.stringify(after.links.map(l=>[l.name,l.href]))===JSON.stringify(before.links.map(l=>[l.name,l.href]))&&after.links.length===2,'a reload lost the line: '+JSON.stringify({hide,before:before.links,after:after.links}));
    walk['steps'+(hide?'NoApi':'Api')]={at:at.at,ahead:ahead.at,back:back.at,length:[at.length,ahead.length,back.length],reload:after.links.map(l=>l.name)};
    await ctx.close();
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
  // The line's links are moves too: they leave the music alone.
  await p.locator('#entity-inspector .entity-trail a[data-step="1"]').click();await record(p,'Morttagua');await playsOn('the line forward');
  await p.locator('#entity-inspector .entity-trail a[data-step="-1"]').click();await record(p,'Maceo Plex');await playsOn('the line back');
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
