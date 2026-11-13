// Playwright CLI run-code callback for the Index: lines that fit, the place kept across changes and on return, speed,
// nothing that moves, the phone header, the keys, and step 2: the rail, the mark in the address, type-ahead and the lit
// stations. Step 2's names (Recondite, Maceo Plex's five stations, Under the Sun's bands) are those of the stand-in in
// /var/tmp/yolan/names-standin. Run it against the preview with the names documents:
//   PAVOIA_NAMES=<folder with names-artists.json and names-labels.json> python3 design/stage-direction/serve.py 14541
//   playwright-cli cli -s=index open http://127.0.0.1:14541/
//   playwright-cli cli -s=index run-code --filename=tests/index-browser.js
// The stream is blocked. Every picture is one local photo, 120 ms late; the rest of the discovery API is what the preview
// relays, so a record may say it is unavailable, which changes nothing here. Names come from the documents, so the checks
// hold for any of them.
async page => {
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const origin=new URL(page.url()).origin,photo=Buffer.from(await (await fetch(origin+'/photos/selected/p005.jpg')).arrayBuffer());
  await page.route('**/stream/**',route=>route.abort());
  await page.route('**/api/discovery/media/**',async route=>{await new Promise(r=>setTimeout(r,120));await route.fulfill({status:200,contentType:'image/jpeg',body:photo});});
  const drawn=()=>page.waitForFunction(()=>document.querySelector('#music-content .index-section')&&!document.getElementById('music-content').hasAttribute('aria-busy'),null,{timeout:30000});
  const frames=(n=3,p=page)=>p.evaluate(n=>new Promise(done=>{const tick=()=>--n?requestAnimationFrame(tick):done();requestAnimationFrame(tick);}),n);
  const open=async(hash,width=1440,height=900,lang='en')=>{
    await page.setViewportSize({width,height});await page.goto(origin+'/');await page.waitForFunction(()=>window.Pavoia?.getState);
    await page.locator('#language [value='+lang+']').dispatchEvent('click');
    await page.evaluate(h=>{history.pushState({},'',h);dispatchEvent(new PopStateEvent('popstate'));},hash);await drawn();await frames();
  };
  // The first row whose top is at or under the stage bar's bottom, found section by section, and where the bar ends.
  const under=()=>page.evaluate(()=>{
    const line=document.getElementById('music-filters').getBoundingClientRect().bottom,sections=[...document.querySelectorAll('#music-content .index-section')];
    for(let k=Math.max(0,sections.findLastIndex(s=>s.getBoundingClientRect().top<=line+16));k<sections.length;k++){
      const a=[...sections[k].querySelectorAll('.row')].find(a=>a.getBoundingClientRect().top>=line-1);
      if(a)return {name:a.querySelector('.row-name').textContent,top:a.getBoundingClientRect().top,line,mark:sections[k].dataset.mark};
    }
    return null;
  });
  // A row put where the Index puts one: its top 16 px under the bar on a wide screen.
  const place=(name,y=16)=>page.evaluate(([name,y])=>{
    const a=[...document.querySelectorAll('#music-content .row')].find(a=>a.querySelector('.row-name').textContent===name),explorer=document.getElementById('explorer');
    explorer.scrollTop+=a.getBoundingClientRect().top-document.getElementById('music-filters').getBoundingClientRect().bottom-y;
  },[name,y]);
  const shown=()=>page.evaluate(()=>[...document.querySelectorAll('#music-content .row')].map(a=>({name:a.querySelector('.row-name').textContent,stages:a.dataset.stages.split(' ')})));
  const report=[];

  // 6. No second line is cut, at four widths, in both languages, on All stations and on a station.
  const cut=()=>page.evaluate(()=>{
    const sections=[...document.querySelectorAll('#music-content .index-section')];for(const s of sections)s.style.contentVisibility='visible';
    const lines=[...document.querySelectorAll('#music-content .row-line')].filter(n=>n.scrollWidth>n.clientWidth).map(n=>n.textContent);
    for(const s of sections)s.style.contentVisibility='';return lines;
  });
  for(const [width,height] of [[1440,900],[1366,768],[1100,800],[390,844]])for(const lang of ['en','de'])for(const hash of ['#index/artists','#index/artists/palac-feel']){
    await open(hash,width,height,lang);const lines=await cut();assert(lines.length===0,`cut lines at ${width} ${lang} ${hash}: ${lines.slice(0,3)}`);
  }
  await open('#index/artists/palac-feel',360,740,'de');
  const narrow=await cut();assert(narrow.every(t=>t.startsWith('Auch auf')),'at 360 px only Auch auf lines may be cut: '+narrow.filter(t=>!t.startsWith('Auch auf')).slice(0,3));
  report.push('6: 0 cut lines at 16 views, '+narrow.length+' Auch auf lines cut at 360 px');

  // The stage bar says which station the list shows. After a tap on a station, after a filter typed and cleared, and on
  // a fresh load, the current station lies inside the bar, clear of its faded edges, and each edge fades exactly where
  // stations wait: on a phone, where the bar scrolls sideways, and on a narrow window in German, where it is cut by a little.
  const bar=()=>page.evaluate(()=>{
    const row=document.getElementById('stage-row'),box=row.getBoundingClientRect(),c=row.querySelector('[aria-current]').getBoundingClientRect(),before=row.scrollLeft>1,more=row.scrollWidth-row.scrollLeft-row.clientWidth>1;
    return {left:Math.round(c.left-box.left),right:Math.round(box.right-c.right),shown:c.left>=box.left+(before?40:0)-.5&&c.right<=box.right-(more?40:0)+.5,faded:row.hasAttribute('data-before')===before&&row.hasAttribute('data-more')===more};
  });
  const inBar=async what=>{const b=await bar();assert(b.shown&&b.faded,'the current station in the bar, '+what+': '+JSON.stringify(b));return what+' '+b.left+'/'+b.right;};
  const bars=[];
  await open('#index/artists',390,844);await page.locator('#stage-row a[data-stage=closing]').click();await drawn();await frames();bars.push(await inBar('Closing tapped'));
  // A filter no name matches empties every count, and clearing it brings them back: the row narrows and widens again.
  for(const [text,hash] of [['xqzjvkwpxqzj','#index/artists/closing?q=xqzjvkwpxqzj'],['','#index/artists/closing']]){
    await page.locator('#index-query').fill(text);await page.waitForFunction(hash=>location.hash===hash,hash);await frames();
  }
  bars.push(await inBar('Closing filtered and cleared'));
  await open('#index/artists/essentials?by=tracks',390,844);bars.push(await inBar('Essentials loaded'));
  await open('#index/labels/fontanna?by=tracks',1100,800,'de');bars.push(await inBar('Fontanna at 1100 px in German'));
  report.push('bar: '+bars.join(', ')+' px from its edges');
  // A keyboard user in the bar while a side loads slowly keeps the station they reached in view when the names come.
  // Shift+Tab reaches All stations, far from the current station, on a laptop and on a phone. Tab reaches the last
  // station that shows whole, which the counts that come push out.
  const reached=async(hash,width,height,back)=>{
    await open(hash,width,height,'de');
    let release;const held=new Promise(r=>release=r),labels=/\/api\/library\/names\?kind=labels$/;
    await page.route(labels,async route=>{await held;await route.continue();});
    await page.locator('#index-sides a[data-side=labels]').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>location.hash.startsWith('#index/labels'));
    if(back)for(let i=0;i<20&&await page.evaluate(()=>document.activeElement.dataset.stage!=='radio');i++)await page.keyboard.press('Shift+Tab');
    else{
      const steps=await page.evaluate(()=>{const row=document.getElementById('stage-row'),right=row.getBoundingClientRect().right;return [...row.children].findLastIndex(a=>a.getBoundingClientRect().right<=right);});
      await page.locator('#stage-row a[data-stage=radio]').focus();for(let i=0;i<steps;i++)await page.keyboard.press('Tab');
    }
    const stage=await page.evaluate(()=>document.activeElement.dataset.stage);release();await drawn();await frames();await page.unroute(labels);
    const kept=await page.evaluate(()=>{const box=document.getElementById('stage-row').getBoundingClientRect(),a=document.activeElement,f=a.getBoundingClientRect();
      return {stage:a.dataset.stage,left:Math.round(f.left-box.left),right:Math.round(box.right-f.right)};});
    assert(kept.stage===stage&&kept.left>=0&&kept.right>=0,'the station reached with the keyboard stays in the bar as the names come, '+hash+' at '+width+' px: '+JSON.stringify(kept));
    return stage+' '+kept.left+'/'+kept.right;
  };
  const keys=[await reached('#index/artists/fontanna',800,800,true),await reached('#index/artists/fontanna',390,844,true),await reached('#index/artists',800,800,false)];
  report.push('bar with keys: '+keys.join(', ')+' px from its edges');

  // 8. The name under the bar stays there, or the first one that does not sort before it, across a station, an order and a
  // side: that row's line sits 16 px under the bar, and stays there. Rows read left to right, so names before it in the
  // new list may share its line. A pointer scrolls up to the head to reach a side or an order, which brings the list's top
  // into view, so those are pressed here where they are, as a script or an address change would.
  const at=name=>page.evaluate(name=>{const a=[...document.querySelectorAll('#music-content .row')].find(a=>a.querySelector('.row-name').textContent===name);
    return {top:a.getBoundingClientRect().top,line:document.getElementById('music-filters').getBoundingClientRect().bottom,mark:a.closest('section').dataset.mark};},name);
  const kept=async(name,what)=>{const now=await at(name);assert(Math.abs(now.top-now.line-16)<=1,`${what}: ${name} at ${JSON.stringify(now)}`);
    await page.waitForTimeout(1200);const later=await at(name);assert(Math.abs(later.top-now.top)<.5,`${what}: ${name} moved 1.2 s later`);return now;};
  await open('#index/artists');
  const all=await shown();let k=Math.floor(all.length*.6);while(all[k].stages.includes('bermuda-day'))k++;
  await place(all[k].name);await frames();const anchor=(await under()).name,expected=all.slice(all.findIndex(n=>n.name===anchor)).find(n=>n.stages.includes('bermuda-day')).name;
  await page.locator('#stage-row a[data-stage=bermuda-day]').click();await drawn();await frames();
  const onStage=await kept(expected,'a stage keeps the next name'),again=(await under()).name;
  await page.locator('#index-order a[data-by=tracks]').evaluate(a=>a.click());await drawn();await frames();
  const byTracks=await kept(again,'Most tracks keeps the same name');
  report.push(`8: ${anchor} -> ${expected} on Under the Sun (${(onStage.top-onStage.line).toFixed(1)} px under the bar); ${again} stays first in ${byTracks.mark} by Most tracks`);
  await open('#index/artists');await place(anchor);await frames();
  await page.locator('#index-sides a[data-side=labels]').evaluate(a=>a.click());await drawn();await frames();
  const fold=s=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[øœæßłđþ]/g,c=>({ø:'o',œ:'oe',æ:'ae',ß:'ss',ł:'l',đ:'d',þ:'th'})[c]);
  const collator=new Intl.Collator('en',{sensitivity:'base',numeric:true}),letter=s=>/^[a-z]/.test(fold(s))?fold(s)[0]:'{',sorts=(a,b)=>letter(a)<letter(b)?-1:letter(a)>letter(b)?1:collator.compare(a,b);
  const first=(await shown()).map(n=>n.name).find(n=>sorts(n,anchor)>=0);
  await kept(first,'Labels keeps the place by name');
  report.push(`8: ${anchor} -> ${first} on Labels`);

  // 10. A record opened from the Index comes back to the same row at the same height, focused, also after a resize.
  await open('#index/artists/bermuda-day?by=tracks');
  const pick=(await shown())[40].name,row=page.locator('#music-content .row').filter({has:page.locator('.row-name',{hasText:new RegExp('^'+pick.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')})}).first();
  await place(pick,300);await frames();const before=await row.evaluate(a=>a.getBoundingClientRect().top);
  await row.click();await page.waitForFunction(()=>/^#explore/.test(location.hash)&&document.getElementById('music-view').hidden);
  await page.locator('#index-tab').click();await frames();
  const back=await row.evaluate(a=>({top:a.getBoundingClientRect().top,focused:document.activeElement===a}));
  assert(back.focused&&Math.abs(back.top-before)<=1,`the row comes back where it stood, focused: ${before} -> ${JSON.stringify(back)}`);
  await row.click();await page.waitForFunction(()=>document.getElementById('music-view').hidden);await page.setViewportSize({width:1100,height:800});
  await page.locator('#index-tab').click();await frames();
  const resized=await row.evaluate(a=>({top:a.getBoundingClientRect().top,focused:document.activeElement===a,bar:document.getElementById('music-filters').getBoundingClientRect().bottom,bottom:document.getElementById('explorer').getBoundingClientRect().bottom}));
  assert(resized.focused&&resized.top>=resized.bar&&resized.top<=resized.bottom-56,'after a resize the row is in view below the bar: '+JSON.stringify(resized));
  await open('#index/artists/bermuda-day?by=tracks',390,844);
  await row.evaluate(a=>{const e=document.getElementById('explorer');e.scrollTop+=a.getBoundingClientRect().top-400;});await frames();
  await row.click();await page.waitForFunction(()=>document.getElementById('music-view').hidden);await page.setViewportSize({width:844,height:390});
  await page.locator('#index-tab').click();await frames();
  const turned=await row.evaluate(a=>({top:a.getBoundingClientRect().top,bottom:a.getBoundingClientRect().bottom,bar:document.getElementById('music-filters').getBoundingClientRect().bottom,end:document.getElementById('explorer').getBoundingClientRect().bottom}));
  assert(turned.top>=turned.bar&&turned.bottom<=turned.end,'a turned phone finds the row inside the list: '+JSON.stringify(turned));
  report.push(`10: ${pick} back at ${back.top.toFixed(1)} (was ${before.toFixed(1)}), focused; in view after 1440->1100 and 390x844->844x390`);

  // 11. Speed in the page, from the answer or the input to the end of the next frame: the first draw, a station switch from
  // All stations to Night in Motion, and one keystroke after the debounce (the third of "ame", and a first "a", the
  // largest redraw), at 1x and with a 6x slower CPU; then the list's weight and how smoothly it scrolls, on a laptop
  // window and on a phone. Each is the better of two tries, since other work on the machine adds to one. The spec asks
  // 150, 60 (300 at 6x) and 40 (200 at 6x) ms; this guards against twice that.
  const cdp=await page.context().newCDPSession(page),spec={first:150,switch1:60,switch6:300,key1:40,key6:200},speeds={};
  const firstDraw=()=>page.evaluate(()=>new Promise(done=>{const t0=performance.now();history.pushState({},'','#index/artists');dispatchEvent(new PopStateEvent('popstate'));
    const wait=()=>{if(document.querySelector('#music-content .index-section'))requestAnimationFrame(()=>setTimeout(()=>{const answer=performance.getEntriesByType('resource').find(e=>e.name.includes('/api/library/names'));
      done({draw:performance.now()-answer.responseEnd,rows:performance.now()-t0});},0));else requestAnimationFrame(wait);};requestAnimationFrame(wait);}));
  const click=selector=>page.evaluate(selector=>new Promise(done=>{const t0=performance.now();document.querySelector(selector).click();requestAnimationFrame(()=>setTimeout(()=>done(performance.now()-t0),0));}),selector);
  const typed=text=>page.evaluate(text=>new Promise(done=>{const field=document.getElementById('index-query'),note=document.getElementById('index-note'),said=note.textContent;field.value=text;const t0=performance.now();field.dispatchEvent(new Event('input',{bubbles:true}));
    const wait=()=>{if(note.textContent!==said)requestAnimationFrame(()=>setTimeout(()=>done(performance.now()-t0-120),0));else requestAnimationFrame(wait);};setTimeout(wait,100);}),text);
  for(const [width,height] of [[1440,900],[390,844]]){
    const r={},best=(key,ms)=>{r[key]=Math.min(r[key]??Infinity,ms);};
    for(const rate of [1,6,1,6]){
      await page.setViewportSize({width,height});await page.goto(origin+'/');await page.waitForFunction(()=>window.Pavoia?.getState);await page.waitForTimeout(500);
      await cdp.send('Emulation.setCPUThrottlingRate',{rate});const first=await firstDraw();await frames();
      best('first'+rate,first.draw);best('rows'+rate,first.rows);
      best('switch'+rate,await click('#stage-row a[data-stage=palac-dance]'));await frames();await click('#stage-row a[data-stage=radio]');await frames();
      await typed('am');await frames();best('key'+rate,await typed('ame'));await frames();best('keyA'+rate,await typed('a'));await frames();await typed('');await frames();
      await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
    }
    const heap=(await cdp.send('Runtime.getHeapUsage')).usedSize/1048576,nodes=await page.evaluate(()=>document.getElementsByTagName('*').length);
    await page.mouse.move(width/2,height/2);await page.evaluate(()=>{window.gaps=[];let last=performance.now();const tick=now=>{window.gaps.push(now-last);last=now;if(window.gaps.length<120)requestAnimationFrame(tick);};requestAnimationFrame(tick);});
    for(let i=0;i<30;i++){await page.mouse.wheel(0,400);await page.waitForTimeout(40);}
    await page.waitForFunction(()=>window.gaps.length>=120,null,{timeout:10000});
    const gaps=await page.evaluate(()=>window.gaps.slice(2).sort((a,b)=>a-b));
    speeds[width]={...Object.fromEntries(Object.entries(r).map(([k,v])=>[k,Math.round(v)])),p95:Math.round(gaps[Math.floor(gaps.length*.95)]*10)/10,slow:gaps.filter(g=>g>34).length,frames:gaps.length,nodes,heap:Math.round(heap*10)/10};
  }
  const desk=speeds[1440],over=Object.entries(spec).filter(([k,v])=>(k==='first'?desk.first1:desk[k])>v).map(([k])=>k);
  report.push('11: '+JSON.stringify(speeds)+(over.length?' over the spec: '+over.join(', '):' within the spec'));
  assert(desk.first1<=2*spec.first&&desk.switch1<=2*spec.switch1&&desk.switch6<=2*spec.switch6&&desk.key1<=2*spec.key1&&desk.key6<=2*spec.key6,'speed: '+JSON.stringify(desk));

  // 12. Nothing in the explorer moves: on load, while every picture arrives, and while scrolling up from the end. The player
  // bar under it follows the radio, whose new tracks may shift their own line.
  await page.setViewportSize({width:1440,height:900});await page.goto(origin+'/');await page.waitForFunction(()=>window.Pavoia?.getState);
  await page.evaluate(()=>{window.shift=0;new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput&&e.sources.some(s=>document.getElementById('explorer').contains(s.node)))window.shift+=e.value;}).observe({type:'layout-shift'});
    history.pushState({},'','#index/artists');dispatchEvent(new PopStateEvent('popstate'));});
  await drawn();await page.waitForTimeout(1500);const loadShift=await page.evaluate(()=>window.shift);
  assert(loadShift<=.01,'CLS on load '+loadShift);
  const artists=/\/api\/library\/names\?kind=artists$/;
  await page.route(artists,async route=>{const doc=await (await route.fetch()).json();for(const item of doc.items)item.image='/api/discovery/media/'+'b'.repeat(40);await route.fulfill({json:doc});});
  await page.goto(origin+'/');await page.waitForFunction(()=>window.Pavoia?.getState);
  await page.evaluate(()=>{window.shift=0;new PerformanceObserver(list=>{for(const e of list.getEntries())if(!e.hadRecentInput&&e.sources.some(s=>document.getElementById('explorer').contains(s.node)))window.shift+=e.value;}).observe({type:'layout-shift'});
    history.pushState({},'','#index/artists');dispatchEvent(new PopStateEvent('popstate'));});
  await drawn();await page.waitForTimeout(1000);for(let i=0;i<4;i++){await page.evaluate(()=>{document.getElementById('explorer').scrollTop+=700;});await page.waitForTimeout(400);}
  const pictureShift=await page.evaluate(()=>({shift:window.shift,loaded:[...document.querySelectorAll('#music-content img')].filter(i=>i.complete&&!i.dataset.wait).length}));
  assert(pictureShift.shift===0&&pictureShift.loaded>0,'CLS while every picture arrives '+JSON.stringify(pictureShift));
  await page.unroute(artists);
  await page.evaluate(()=>{const e=document.getElementById('explorer');e.scrollTop=e.scrollHeight;});await frames(4);
  let worst=0;
  for(let i=0;i<25;i++){
    const before=await under();
    const after=await page.evaluate(name=>{const e=document.getElementById('explorer');e.scrollTop-=600;return new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
      const a=[...document.querySelectorAll('#music-content .row')].find(a=>a.querySelector('.row-name').textContent===name);done(a.getBoundingClientRect().top);})));},before.name);
    worst=Math.max(worst,Math.abs(after-before.top-600));
  }
  assert(worst<.5,'scrolling up moves rows beyond the scroll by '+worst+' px');
  report.push(`12: CLS ${loadShift.toFixed(4)} on load, ${pictureShift.shift} with ${pictureShift.loaded} pictures arriving, ${worst.toFixed(2)} px off over 25 steps up`);

  // 13. On a 360x740 phone in German the explorer's header is one line, 61 px high, with ✕ inside the screen. A phone's
  // scrollbars take no room, so this runs in a phone's own window.
  const phone=await page.context().browser().newContext({viewport:{width:360,height:740},isMobile:true,hasTouch:true}),small=await phone.newPage();
  await small.route('**/stream/**',route=>route.abort());await small.goto(origin+'/');await small.waitForFunction(()=>window.Pavoia?.getState);
  await small.locator('#language [value=de]').dispatchEvent('click');
  await small.evaluate(()=>{history.pushState({},'','#index/labels/fontanna');dispatchEvent(new PopStateEvent('popstate'));});
  await small.waitForFunction(()=>document.querySelector('#music-content .index-section'),null,{timeout:30000});
  const header=await small.evaluate(()=>{const top=document.querySelector('.explorer-top').getBoundingClientRect(),tabs=[...document.querySelectorAll('.explorer-nav a')].map(a=>a.getBoundingClientRect().top);
    return {height:top.height,lines:new Set(tabs.map(Math.round)).size,close:document.getElementById('explorer-close').getBoundingClientRect().right,width:innerWidth};});
  await phone.close();
  assert(Math.abs(header.height-61)<1&&header.lines===1&&header.close<=header.width,'the phone header: '+JSON.stringify(header));
  report.push(`13: header ${header.height} px, one line, ✕ ends at ${header.close} of ${header.width}`);

  // Step 2. The rail, the mark in the address, type-ahead and the lit stations.
  const stuck=()=>page.evaluate(()=>{const bar=document.getElementById('music-filters');return document.getElementById('explorer').getBoundingClientRect().top+parseFloat(getComputedStyle(bar).top)+bar.offsetHeight;});
  const sectionTop=(mark,p=page)=>p.evaluate(m=>document.querySelector(`#music-content .index-section[data-mark="${m}"]`).getBoundingClientRect().top,mark);
  const current=(p=page)=>p.evaluate(()=>document.querySelector('.rail-marks [aria-current]')?.dataset.mark||'');
  // s2-2. At 1440x900 a click on M puts the M section's hairline at the stage bar's bottom, it stays there, and the
  // address names M 250 ms after.
  await open('#index/artists');
  await page.locator('.rail-marks [data-mark=M]').click();const jumped=await sectionTop('M')-await stuck();
  await page.waitForTimeout(400);const named=await page.evaluate(()=>location.hash);
  await page.waitForTimeout(800);const later=await sectionTop('M')-await stuck();
  assert(Math.abs(jumped)<.5&&Math.abs(later)<.5&&named==='#index/artists?at=M'&&await current()==='M','a click on M: '+JSON.stringify({jumped,later,named}));
  report.push(`s2-2: M ${jumped.toFixed(1)} px off, ${later.toFixed(1)} px 1.2 s later, ${named} after 400 ms`);
  // s2-4. A reload on a mark opens on it.
  await page.goto(origin+'/#index/artists/bermuda-day?at=K');await drawn();await frames();
  const reloaded={off:await sectionTop('K')-await stuck(),mark:await current(),hash:await page.evaluate(()=>location.hash)};
  assert(Math.abs(reloaded.off)<.5&&reloaded.mark==='K'&&reloaded.hash==='#index/artists/bermuda-day?at=K','a reload on K: '+JSON.stringify(reloaded));
  report.push(`s2-4: a reload of ?at=K opens on K, ${reloaded.off.toFixed(1)} px off`);
  // s2-5. From the dialog, at most 21 Tab presses reach the first name: the rail is out of the Tab order.
  await open('#index/artists');await page.evaluate(()=>document.getElementById('explorer').focus());
  let tabs=0;while(tabs<40&&!await page.evaluate(()=>document.activeElement.matches('#music-content .row'))){await page.keyboard.press('Tab');tabs++;}
  assert(tabs<=21,'Tab presses to the first name: '+tabs);report.push(`s2-5: ${tabs} Tab presses to the first name`);
  // s2-6 and s2-12. With focus on a row, "recon" focuses Recondite within 1 s, Space still plays and pauses, and "1" and
  // "m" change neither the station nor the volume.
  await page.locator('#music-content .row').first().focus();const t0=Date.now();await page.keyboard.type('recon');
  await page.waitForFunction(()=>document.activeElement.querySelector?.('.row-name')?.textContent==='Recondite',null,{timeout:1000});const ms=Date.now()-t0;
  const was=await page.evaluate(()=>window.Pavoia.getState().wanted);await page.keyboard.press('Space');
  const toggled=await page.evaluate(()=>window.Pavoia.getState().wanted)!==was;if(toggled)await page.keyboard.press('Space');
  assert(toggled,'Space toggles the radio after the type-ahead');
  const radio=()=>page.evaluate(()=>[window.Pavoia.getState().stage,document.getElementById('volume').value,document.getElementById('audio').volume]),keysBefore=await radio();
  await page.waitForTimeout(1000);await page.keyboard.press('1');await page.keyboard.press('m');
  const keysAfter=await radio(),landed=await page.evaluate(()=>document.activeElement.querySelector?.('.row-name')?.textContent);
  assert(JSON.stringify(keysAfter)===JSON.stringify(keysBefore),'1 and m in the list: '+JSON.stringify([keysBefore,keysAfter]));
  report.push(`s2-6: "recon" on Recondite in ${ms} ms, Space toggles; s2-12: 1 and m leave ${keysBefore[0]} and the volume ${keysBefore[1]} (focus on ${landed})`);
  // s2-7. Pointing at Maceo Plex lights All stations and its stations and dims the others to muted.
  await page.locator('#index-query').fill('Maceo Plex');await page.waitForFunction(()=>location.hash==='#index/artists?q=Maceo+Plex');await frames();
  await page.locator('#music-content .row').filter({has:page.locator('.row-name',{hasText:/^Maceo Plex$/})}).hover();await page.waitForTimeout(300);
  const lights=await page.evaluate(()=>{const probe=document.createElement('i');probe.style.color='var(--muted)';document.body.append(probe);const dim=getComputedStyle(probe).color;probe.remove();
    return [...document.querySelectorAll('#stage-row a')].map(a=>({stage:a.dataset.stage,lit:a.hasAttribute('data-lit'),dim:getComputedStyle(a).color===dim}));});
  const lit=lights.filter(l=>l.lit).map(l=>l.stage),dimmed=lights.filter(l=>l.dim).map(l=>l.stage);
  // Maceo Plex plays on five stations in the names stand-in; the check reads them from its row.
  const own=await page.evaluate(()=>[...document.querySelectorAll('#music-content .row')].find(a=>a.querySelector('.row-name').textContent==='Maceo Plex').dataset.stages.split(' '));
  assert(lit.join()===lights.filter(l=>l.stage==='radio'||own.includes(l.stage)).map(l=>l.stage).join()&&dimmed.join()===lights.filter(l=>!l.lit).map(l=>l.stage).join()&&lit.length===own.length+1,'Maceo Plex lights: '+JSON.stringify({own,lights}));
  report.push(`s2-7: Maceo Plex lights ${lit.join(' ')}, dims ${dimmed.join(' ')}`);
  // s2-8. Under the Sun in Most tracks has no name of 100, 50 or 20 tracks or more; All stations has a name under every letter.
  const disabled=()=>page.evaluate(()=>[...document.querySelectorAll('.rail-marks [data-mark]')].filter(b=>b.disabled).map(b=>b.dataset.mark));
  await open('#index/artists/bermuda-day?by=tracks');const bands=await disabled();await open('#index/artists');const none=await disabled();
  assert(bands.join()==='100+,50+,20+'&&none.length===0,'disabled marks: '+JSON.stringify({bands,none}));
  report.push(`s2-8: Under the Sun by Most tracks disables ${bands.join(' ')}; All stations none`);
  // s2-9. Serif 19 in a 32 px rail on a tall desktop window, mono 11 at 1366x768, no rail on a phone held sideways.
  const look=async(w,h)=>{await open('#index/artists',w,h);return page.evaluate(()=>{const b=document.querySelector('.rail-marks [data-mark=A]'),r=document.getElementById('index-rail');
    return {shown:r.offsetParent!==null,font:getComputedStyle(b).fontSize+' '+getComputedStyle(b).fontFamily.split(',')[0],rail:getComputedStyle(document.getElementById('music-view')).getPropertyValue('--rail').trim()};});};
  const tall=await look(1440,900),laptop=await look(1366,768),sideways=await look(844,390);
  assert(tall.shown&&tall.font==='19px "Instrument Serif"'&&tall.rail==='32px'&&laptop.shown&&laptop.font==='11px "JetBrains Mono"'&&!sideways.shown,'the rail\'s look: '+JSON.stringify({tall,laptop,sideways}));
  report.push(`s2-9: ${tall.font} in ${tall.rail} at 1440x900, ${laptop.font} at 1366x768, no rail at 844x390`);
  // s2-3. On a phone, a thumb drags from C to M: M's heading sits under the stage bar, the rail marks M, and the rail never
  // moves. The phone's window has overlay scrollbars and touch. At 320 px the explorer's bar takes two lines, so the rail
  // rests lower, and still stands still. In Most tracks, 100+ is a little wider than the rail and must not let the explorer
  // scroll sideways. A name typed on a phone comes clear of its section's heading, which sticks under the bar.
  const phoneIndex=async(width,height,hash)=>{
    const context=await page.context().browser().newContext({viewport:{width,height},isMobile:true,hasTouch:true}),m=await context.newPage();
    await m.route('**/stream/**',route=>route.abort());await m.goto(origin+'/');await m.waitForFunction(()=>window.Pavoia?.getState);
    await m.evaluate(h=>{history.pushState({},'',h);dispatchEvent(new PopStateEvent('popstate'));},hash);
    await m.waitForFunction(()=>document.querySelector('#music-content .index-section')&&!document.getElementById('music-content').hasAttribute('aria-busy'),null,{timeout:30000});
    // The explorer slides 12 px up as it opens: a thumb aims at the rail once it stands still.
    await m.waitForFunction(()=>getComputedStyle(document.getElementById('explorer')).transform==='none');
    return [context,m];
  };
  for(const [width,height] of [[390,844],[320,640]]){
    const [thumb,m]=await phoneIndex(width,height,'#index/artists');
    const railTop=()=>m.evaluate(()=>document.querySelector('.rail-marks').getBoundingClientRect().top),centre=mark=>m.evaluate(k=>{const b=document.querySelector(`.rail-marks [data-mark="${k}"]`).getBoundingClientRect();return {x:b.left+b.width/2,y:b.top+b.height/2};},mark);
    const touch=await thumb.newCDPSession(m),from=await centre('C'),to=await centre('M'),tops=[await railTop()],letters=[];
    const bar=await m.evaluate(()=>document.querySelector('.explorer-top').getBoundingClientRect().height);
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from.x,y:from.y}]});tops.push(await railTop());
    // The first jump from the top lands under the bar where it sticks once the tabs have scrolled away, not where it rests.
    const firstJump=await m.evaluate(()=>document.querySelector('#music-content .index-section[data-mark=C] .index-mark').getBoundingClientRect().top-document.getElementById('music-filters').getBoundingClientRect().bottom);
    // Held still a pixel lower, the thumb stays on C.
    await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x,y:from.y+1}]});const held=await current(m);
    for(let i=1;i<=10;i++){await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x,y:from.y+(to.y-from.y)*i/10}]});tops.push(await railTop());
      letters.push(await m.evaluate(()=>{const s=document.getElementById('index-scrub');return s.hasAttribute('data-on')?s.textContent:'';}));}
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await m.waitForTimeout(600);tops.push(await railTop());
    const phoneBar=await m.evaluate(()=>{const bar=document.getElementById('music-filters');return bar.getBoundingClientRect().bottom;}),heading=await m.evaluate(()=>document.querySelector('#music-content .index-section[data-mark=M] .index-mark').getBoundingClientRect().top);
    const scrubbed={width,bar,first:firstJump,held,heading,phoneBar,mark:await current(m),tops,letters:[...new Set(letters)].join(''),gone:await m.evaluate(()=>!document.getElementById('index-scrub').hasAttribute('data-on'))};
    await thumb.close();
    assert(Math.abs(firstJump)<.5&&held==='C'&&Math.abs(scrubbed.heading-scrubbed.phoneBar)<.5&&scrubbed.mark==='M'&&Math.max(...tops)-Math.min(...tops)<=1&&scrubbed.letters.endsWith('M')&&scrubbed.gone,'a thumb from C to M: '+JSON.stringify(scrubbed));
    report.push(`s2-3 at ${width}: the explorer's bar ${bar} px; the first touch on C puts its heading ${firstJump.toFixed(1)} px from the bar and stays on C a pixel lower; thumb C to M shows ${scrubbed.letters}, M's heading at ${heading.toFixed(1)} under the bar at ${phoneBar.toFixed(1)}, the rail's top ${Math.min(...tops).toFixed(1)}-${Math.max(...tops).toFixed(1)}`);
  }
  const flat=[];
  for(const [width,height] of [[390,844],[360,740],[320,640]]){
    const [context,m]=await phoneIndex(width,height,'#index/labels?by=tracks');
    const wide=await m.evaluate(()=>{const e=document.getElementById('explorer');e.scrollLeft=20;return {width:e.scrollWidth,client:e.clientWidth,left:e.scrollLeft};});
    await context.close();
    assert(wide.width<=wide.client&&wide.left===0,'Most tracks on a phone scrolls sideways at '+width+': '+JSON.stringify(wide));flat.push(`${width} ${wide.width}/${wide.client}`);
  }
  report.push('s2-3 sideways: none in Most tracks at '+flat.join(', '));
  {
    const [context,m]=await phoneIndex(390,844,'#index/artists');
    await m.locator('.rail-marks [data-mark=M]').click();await frames(3,m);await m.evaluate(()=>{document.getElementById('explorer').scrollTop+=30;});await frames(3,m);
    const name=await m.evaluate(()=>document.querySelector('#music-content .index-section[data-mark=M] .row .row-name').textContent);
    await m.evaluate(()=>document.getElementById('explorer').focus({preventScroll:true}));for(const key of name.toLowerCase().slice(0,4))await m.keyboard.press(key);await frames(3,m);
    const clear=await m.evaluate(()=>{const a=document.activeElement,box=a.getBoundingClientRect(),h=a.closest('.index-section').querySelector('.index-mark').getBoundingClientRect(),hit=document.elementFromPoint(box.left+30,box.top+8);
      return {name:a.querySelector('.row-name')?.textContent,top:box.top,heading:h.bottom,hit:a.contains(hit)};});
    await context.close();
    assert(clear.name===name&&clear.top>=clear.heading-.5&&clear.hit,'a name typed on a phone shows clear of its heading: '+JSON.stringify(clear));
    report.push(`s2-6 on a phone: "${name.toLowerCase().slice(0,4)}" brings ${name} to ${clear.top.toFixed(1)}, under its heading ending at ${clear.heading.toFixed(1)}`);
  }
  // The head stands still: the field keeps its place while the names load, and while a filter narrows the list to one
  // name and to none, on a laptop and on a phone, in German.
  for(const [width,height] of [[1440,900],[390,844]]){
    await page.setViewportSize({width,height});await page.goto(origin+'/');await page.waitForFunction(()=>window.Pavoia?.getState);
    await page.locator('#language [value=de]').dispatchEvent('click');
    let release;const held=new Promise(r=>release=r),artists=/\/api\/library\/names\?kind=artists$/;
    await page.route(artists,async route=>{await held;await route.continue();});
    await page.evaluate(()=>{history.pushState({},'','#index/artists');dispatchEvent(new PopStateEvent('popstate'));});
    await page.waitForFunction(()=>!document.getElementById('index-rail').hidden);await page.waitForTimeout(400);await frames();
    const field=()=>page.evaluate(()=>document.getElementById('index-query').getBoundingClientRect().top),tops=[await field()];
    release();await drawn();await frames();await page.unroute(artists);tops.push(await field());
    await page.locator('#index-query').click();
    for(const key of 'recondite'){await page.keyboard.type(key);await page.waitForTimeout(700);await frames();tops.push(await field());}
    const one=await page.evaluate(()=>document.querySelectorAll('#music-content .row').length);
    await page.locator('#index-query').fill('zzqx');await page.waitForFunction(()=>location.hash==='#index/artists?q=zzqx');await frames();tops.push(await field());
    assert(one===1&&Math.max(...tops)-Math.min(...tops)<=.5,'the field moves at '+width+': '+JSON.stringify({one,tops}));
    report.push(`head at ${width}: the field stays at ${tops[0].toFixed(1)} while loading, down to ${one} name and to none`);
  }

  // 15. Space plays everywhere, the arrows change the radio's station, Enter keeps focus on a station and hands it from
  // Look on all stations to the field, and a mouse starts in the field: from the page, and by a click on the Index tab, which
  // focuses the tab first.
  await page.setViewportSize({width:1440,height:900});await page.goto(origin+'/');await page.waitForFunction(()=>window.Pavoia?.getState);
  await page.evaluate(()=>{history.pushState({},'','#index/artists');dispatchEvent(new PopStateEvent('popstate'));});await drawn();
  assert(await page.evaluate(()=>document.activeElement.id)==='index-query','a first entry with a mouse puts focus in the field');
  await page.click('.explorer-nav a[href^="#statistics"]');await page.waitForFunction(()=>document.getElementById('music-view').dataset.view==='statistics');
  await page.click('#index-tab');await drawn();
  assert(await page.evaluate(()=>document.activeElement.id)==='index-query','a click on the Index tab puts focus in the field');
  const wanted=()=>page.evaluate(()=>window.Pavoia.getState().wanted),space=async()=>{await page.keyboard.down('Space');await page.keyboard.up('Space');};
  for(const target of ['#music-content .row','#stage-row a[data-stage=fontanna]','#index-order a[data-by=tracks]']){
    await page.locator(target).first().focus();const was=await wanted();await space();assert(await wanted()!==was,'Space toggles the radio on '+target);
  }
  const radioStage=()=>page.evaluate(()=>window.Pavoia.getState().stage),stageBefore=await radioStage();
  await page.locator('#music-content .row').first().focus();await page.keyboard.press('ArrowRight');
  assert(await radioStage()!==stageBefore,'the right arrow changes the radio\'s station');
  await page.keyboard.press('ArrowLeft');assert(await radioStage()===stageBefore,'and the left arrow brings it back');
  await page.locator('#stage-row a[data-stage=bermuda-day]').focus();await page.keyboard.press('Enter');await drawn();await frames();
  assert(await page.evaluate(()=>document.activeElement.dataset.stage==='bermuda-day'&&location.hash==='#index/artists/bermuda-day'),'Enter on Under the Sun keeps focus on it');
  // A name that plays on other stations but not on Ambiance, and that no name of Ambiance holds: filtered on Ambiance,
  // the note offers every station. Enter there redraws the note, and focus goes to the field.
  await page.locator('#stage-row a[data-stage=radio]').click();await drawn();
  const every=await shown(),lone=every.find(n=>/^[a-z]{5,}$/i.test(n.name)&&!n.stages.includes('ambiance')&&!every.some(m=>m.stages.includes('ambiance')&&fold(m.name).includes(fold(n.name)))).name;
  await page.evaluate(h=>{history.replaceState(history.state,'',h);dispatchEvent(new PopStateEvent('popstate'));},'#index/artists/ambiance?q='+encodeURIComponent(lone));
  await page.waitForFunction(()=>document.querySelector('#index-note a'));await page.locator('#index-note a').focus();await page.keyboard.press('Enter');await drawn();await frames();
  const looked=await page.evaluate(()=>({hash:location.hash,focus:document.activeElement.id||document.activeElement.localName}));
  assert(looked.hash==='#index/artists?q='+encodeURIComponent(lone)&&looked.focus==='index-query','Enter on Look on all stations hands focus to the field: '+JSON.stringify(looked));
  report.push('15: Space on a row, a station and an order; arrows; Enter on a station and on Look on all stations ('+lone+'); the field on a first entry and on a click on the Index tab');
  assert(!errors.length,'page errors: '+errors.join(' | '));
  return 'index ok: '+report.join(' · ');
}
