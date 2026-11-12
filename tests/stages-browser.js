// Playwright CLI run-code callback for the two ways through the stations: the first visit, one row and a title that
// stands still on a laptop, whole groups at 1100 px, no sideways scroll, the order with real keys, radios and swipes,
// the phone sheet, blocked storage, nothing playing, the text styles, the player bar, Chrome's accessibility tree and the
// focus rings (checks 2 to 11, 13, 14 and 15 of the radio page step), then a slow first load (16) and short windows
// (17). Run it against the preview:
//   python3 design/stage-direction/serve.py 14541
//   playwright-cli cli -s=stages open http://127.0.0.1:14541/
//   playwright-cli cli -s=stages run-code --filename=tests/stages-browser.js
// Every page it opens blocks the stream, so nothing plays and nothing counts as a listener. The radio data is what the
// preview relays; no check depends on the track.
async page => {
  const assert=(ok,message)=>{if(!ok)throw new Error(message);};
  // A wait that says what it waited for.
  const until=(p,fn,arg,what)=>p.waitForFunction(fn,arg,{timeout:15000}).catch(e=>{throw new Error(what+': '+e.message.split('\n')[0]);});
  const origin=new URL(page.url()).origin,browser=page.context().browser(),errors=[],streams=[],report=[],contexts=[];
  const guard=async p=>{p.on('pageerror',e=>errors.push(e.message));p.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/stream/'))streams.push(r.url());});await p.route('**/stream/**',route=>route.abort());};
  // A phone's own window: no classic scrollbar, touch on.
  const phone=async(width,height,lang='en')=>{const context=await browser.newContext({viewport:{width,height},isMobile:true,hasTouch:true});contexts.push(context);
    const p=await context.newPage();await guard(p);await p.goto(origin+'/');await ready(p);if(lang!=='en')await set(p,lang);return p;};
  const ready=async p=>{await until(p,()=>window.Pavoia?.getState,null,'the page did not start');await p.evaluate(()=>document.fonts.ready);};
  // A first visit: nothing stored, so the page lists by stage, in English.
  const visit=async(width,height)=>{await page.setViewportSize({width,height});await page.goto(origin+'/');await page.evaluate(()=>localStorage.clear());await page.reload();await ready(page);};
  // The language and the way as a script presses them, wherever the switch stands.
  const set=async(p,lang,way)=>{if(lang)await p.locator('#language [value='+lang+']').dispatchEvent('click');if(way)await p.locator('#ways [value='+way+']').dispatchEvent('click');};
  const stage=p=>p.evaluate(()=>window.Pavoia.getState().stage);
  const silent=async(p,what)=>assert(await p.evaluate(()=>document.getElementById('audio').getAttribute('src'))===null,'10: the audio has a source after '+what);
  const byStage=['bermuda-day','bermuda-evening','palac-dance','palac-feel','etage-zero','fontanna','ambiance','closing','essentials'];
  const byFeeling=['bermuda-day','fontanna','bermuda-evening','palac-dance','etage-zero','palac-feel','closing','ambiance','essentials'];
  await guard(page);

  // 2. A first visit at 1440×900 lists by stage and names every stage over its stations; the fact stands over the title.
  await visit(1440,900);
  const first=await page.evaluate(()=>{const groups=[...document.querySelectorAll('#moods > .mood-group')],fact=document.getElementById('mood-stage');
    return {pressed:[...document.querySelectorAll('#ways button')].map(b=>b.value+'='+b.getAttribute('aria-pressed')).join(' '),words:groups.map(g=>g.querySelector('.group-name').innerText),
      over:groups.every(g=>g.querySelector('.group-name').getBoundingClientRect().bottom<=g.querySelector('.group-moods').getBoundingClientRect().top),
      fact:fact.innerText,above:fact.getBoundingClientRect().bottom<=document.getElementById('mood-name').getBoundingClientRect().top,title:document.getElementById('mood-name').innerText,keys:Object.keys(localStorage)};});
  assert(first.pressed==='feeling=false stage=true','2: By stage is pressed: '+first.pressed);
  assert(first.words.join('|')==='BERMUDA|PAŁAC|ETAGE 0|FONTANNA|AMBIANCE|THE BUS|SELECTED BY GAENDE'&&first.over,'2: every stage named over its stations: '+JSON.stringify(first));
  assert(first.fact==='PAŁAC STAGE'&&first.above&&first.title==='Lost in Feelings','2: the fact over the title: '+JSON.stringify(first));
  assert(first.keys.length===0,'2: a first visit stores nothing: '+first.keys);
  await silent(page,'a first visit');
  report.push(`2: By stage pressed, ${first.words.join(', ')}, ${first.fact} over ${first.title}, ${first.keys.length} keys stored`);

  // 3, 4 and 5. At 1440 and 1366 px the switch and every group share one bottom, with room to spare; at 1100 px both ways
  // take two rows of whole groups that start on the gutter; and the title stands still when the way changes. 70a6e4e put
  // the title's top at 478.39 px in English and 447.95 px in German at 1440×900 in this Chromium (the German place takes
  // a third line), so the rail's second tier lifts it by 20 px at most.
  const rail=()=>page.evaluate(()=>{const box=document.getElementById('moods').getBoundingClientRect(),items=[document.getElementById('ways'),...document.querySelectorAll('#moods > .mood-group')].map(n=>n.getBoundingClientRect());
    return {items:items.map(r=>({bottom:r.bottom,left:r.left})),spare:box.right-Math.max(...items.map(r=>r.right)),left:box.left,title:document.getElementById('mood-name').getBoundingClientRect().top,
      tall:[...document.querySelectorAll('#moods .group-moods')].filter(n=>n.getBoundingClientRect().height>45).length,bus:document.getElementById('bus-link')?.closest('.mood-group')?.getAttribute('aria-label')};});
  const lines=items=>{const out=[];for(const item of [...items].sort((a,b)=>a.bottom-b.bottom)){const line=out.at(-1);if(line&&item.bottom-line.bottom<=1)line.items.push(item);else out.push({bottom:item.bottom,items:[item]});}return out;};
  const spare=[],titles=[],wrapped=[],before={en:478.39,de:447.95};
  for(const [width,height,least] of [[1440,900,64],[1366,768,24],[1100,800,null]]){
    await page.setViewportSize({width,height});
    for(const lang of ['en','de']){
      const tops={};
      for(const way of ['stage','feeling']){
        await set(page,lang,way);const r=await rail(),rows=lines(r.items);tops[way]=r.title;
        assert(r.bus===(lang==='de'?'Bühne The Bus':'The Bus stage'),`3: the bus left its group at ${width} ${lang} by ${way}: ${r.bus}`);
        if(least!==null){
          assert(rows.length===1&&r.spare>=least,`3: one row at ${width} ${lang} by ${way}: ${rows.length} rows, ${r.spare.toFixed(1)} px to spare`);
          spare.push(`${width} ${lang} ${way} ${Math.round(r.spare)}`);
        } else {
          const starts=rows.map(row=>Math.min(...row.items.map(i=>i.left))-r.left);
          assert(rows.length===2&&r.tall===0&&starts.every(s=>Math.abs(s)<=1),`5: two rows of whole groups on the gutter at 1100 ${lang} by ${way}: ${JSON.stringify({rows:rows.length,tall:r.tall,starts})}`);
          wrapped.push(`${lang} ${way} ${rows.length} rows`);
        }
      }
      assert(Math.abs(tops.stage-tops.feeling)<=.5,`4: the title moves at ${width} ${lang}: ${tops.stage} by stage, ${tops.feeling} by feeling`);
      if(width===1440)assert(before[lang]-tops.stage<=20,`4: the title rose more than 20 px at 1440 ${lang}: ${tops.stage}, ${before[lang]} on 70a6e4e`);
      titles.push(`${width} ${lang} ${tops.stage.toFixed(2)}`+(width===1440?` (${(before[lang]-tops.stage).toFixed(2)} px higher than 70a6e4e)`:''));
    }
  }
  report.push('3: one row, px to spare: '+spare.join(', '));
  // Where one way would take a row more than the other, the other breaks before its last group: neither the title nor
  // the switch moves when the way changes (English about 1197 to 1227 px, German 1264 to 1306 px, and under 800 px).
  const still=()=>page.evaluate(()=>['mood-name','ways'].map(id=>document.getElementById(id).getBoundingClientRect().top));
  for(const [width,height] of [[1220,800],[1280,800],[1300,800],[780,900]]){
    await page.setViewportSize({width,height});
    for(const lang of ['en','de']){
      const at={};
      for(const way of ['stage','feeling']){await set(page,lang,way);at[way]=await still();}
      assert(at.stage.every((top,i)=>Math.abs(top-at.feeling[i])<=.5),`4: a press moves the title or the switch at ${width} ${lang}: ${at.stage} by stage, ${at.feeling} by feeling`);
      titles.push(`${width} ${lang} ${at.stage[0].toFixed(2)}, switch ${at.stage[1].toFixed(2)}`);
    }
  }
  report.push('4: title top in both ways: '+titles.join(', '));
  report.push('5: at 1100: '+wrapped.join(', ')+', no group split, every row on the gutter');

  // 6. No sideways scroll at thirteen widths, in both languages and both ways.
  const widths=[1920,1440,1366,1280,1100,1024,900,800,761,760,390,360,320];
  for(const width of widths){
    await page.setViewportSize({width,height:width>760?900:844});
    for(const lang of ['en','de'])for(const way of ['stage','feeling']){
      await set(page,lang,way);const over=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
      assert(over<=0,`6: ${over} px of sideways scroll at ${width} ${lang} by ${way}`);
    }
  }
  report.push(`6: no sideways scroll at ${widths.length} widths x 2 languages x 2 ways`);
  await silent(page,'both ways at every width');

  // 7. The page's arrows and a focused radio's own arrows walk the order on screen in each way, and wrap at both ends.
  await page.setViewportSize({width:1440,height:900});await set(page,'en');
  const walks=[];
  for(const [way,order] of [['stage',byStage],['feeling',byFeeling]]){
    await page.locator('#ways [value='+way+']').click();await page.evaluate(()=>document.activeElement.blur());
    const start=await stage(page),from=order.indexOf(start),right=order.map((_,k)=>order[(from+k+1)%order.length]),left=order.map((_,k)=>order[(from-k-1+2*order.length)%order.length]);
    const keys=async key=>{const seen=[];for(let i=0;i<order.length;i++){await page.keyboard.press(key);seen.push(await stage(page));}return seen;};
    const ahead=await keys('ArrowRight');assert(ahead.join()===right.join(),`7: the page's ArrowRight by ${way}: ${ahead}`);
    const back=await keys('ArrowLeft');assert(back.join()===left.join(),`7: the page's ArrowLeft by ${way}: ${back}`);
    await page.keyboard.press('Shift');await page.locator('#moods input:checked').focus();
    const own=await keys('ArrowRight');assert(own.join()===right.join(),`7: a focused radio's ArrowRight by ${way}: ${own}`);
    await page.evaluate(()=>document.activeElement.blur());
    walks.push(`${way}: ${ahead.length} right, ${back.length} left, ${own.length} radio steps from ${start}`);
  }
  await silent(page,'the arrows');
  // A swipe to the left from Lost in Feelings, on a phone, by stage and by feeling.
  const m=await phone(390,844),cdp=await m.context().newCDPSession(m);
  const swipe=async()=>{await m.evaluate(()=>scrollTo(0,0));const [x,y]=[280,220];
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let s=1;s<=6;s++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-160*s/6,y}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    // A tap while the fling still runs only stops it, as on a phone, so the next tap waits for it to settle.
    await m.waitForTimeout(1500);};
  const sheetOpen=open=>until(m,open=>document.getElementById('stations-sheet').open===open,open,'7: the sheet did not '+(open?'open':'close'));
  const swipes=[];
  for(const [way,next] of [['stage','etage-zero'],['feeling','closing']]){
    await m.locator('#open-stations').tap();await sheetOpen(true);
    await m.locator('#ways [value='+way+']').tap();await m.locator('#moods input[value="04"]').tap();await sheetOpen(false);
    await swipe();await m.waitForFunction(id=>window.Pavoia.getState().stage===id,next,{timeout:5000}).catch(()=>{});
    const landed=await stage(m);assert(landed===next,`7: a swipe left from Lost in Feelings by ${way} lands on ${landed}, not ${next}`);swipes.push(`${way} -> ${landed}`);
  }
  await silent(m,'the swipes');
  report.push('7: '+walks.join('; ')+'; swipe left from Lost in Feelings: '+swipes.join(', '));

  // 8. The sheet: a 64 px title row over the switch, which stays in the heading to the end of the list; a way pressed with
  // Closing chosen keeps Closing's row whole under the heading and focus on the button; no word or phrase cut at 360 px.
  const sheets=[];
  for(const [width,height,lang] of [[390,844,'en'],[360,740,'de']]){
    const p=width===390?m:await phone(width,height,lang),open=state=>until(p,open=>document.getElementById('stations-sheet').open===open,state,`8: the sheet did not ${state?'open':'close'} at ${width}`);
    await set(p,null,'stage');await p.locator('#open-stations').tap();await open(true);
    const head=()=>p.evaluate(()=>{const s=document.getElementById('stations-sheet').getBoundingClientRect(),h=document.querySelector('.stations-heading').getBoundingClientRect(),w=document.getElementById('ways').getBoundingClientRect();
      return {first:w.top-h.top,top:h.top-s.top,inside:[...document.querySelectorAll('#ways button')].map(b=>b.getBoundingClientRect()).every(r=>r.top>=h.top&&r.bottom<=h.bottom&&r.left>=h.left&&r.right<=h.right)};});
    const top=await head();assert(Math.abs(top.first-64)<=.5&&top.inside,`8: the heading at ${width}: ${JSON.stringify(top)}`);
    await p.evaluate(()=>{const s=document.getElementById('stations-sheet');s.scrollTop=s.scrollHeight;});
    const end=await head();assert(end.inside&&end.top<=1,`8: scrolled to the end at ${width}: ${JSON.stringify(end)}`);
    await p.locator('#moods input[value="09"]').tap();await open(false);
    await p.locator('#open-stations').tap();await open(true);await p.locator('#ways [value=feeling]').tap();
    const kept=await p.evaluate(()=>{const row=document.querySelector('#moods input[value="09"]').closest('label').getBoundingClientRect(),h=document.querySelector('.stations-heading').getBoundingClientRect(),s=document.getElementById('stations-sheet').getBoundingClientRect();
      return {under:row.top-h.bottom,above:Math.min(s.bottom,innerHeight)-row.bottom,focus:document.activeElement.value||document.activeElement.id,open:document.getElementById('stations-sheet').open};});
    assert(kept.under>=-.5&&kept.above>=-.5&&kept.focus==='feeling'&&kept.open,`8: Closing kept in view at ${width}: ${JSON.stringify(kept)}`);
    let cut=[];
    if(width===360)for(const way of ['stage','feeling']){await set(p,null,way);cut=cut.concat(await p.evaluate(()=>[...document.querySelectorAll('#stations-sheet .group-name, #stations-sheet .mood-group > .sheet-line')].filter(n=>n.scrollWidth>n.clientWidth).map(n=>n.textContent)));}
    assert(!cut.length,'8: cut at 360 px in German: '+cut);
    sheets.push(`${width}: title row ${top.first} px, switch in the heading at the end, Closing ${Math.round(kept.under)} px under the heading, focus on ${kept.focus}`+(width===360?', nothing cut in German':''));
    await p.keyboard.press('Escape');await open(false);
  }
  report.push('8: '+sheets.join('; '));

  // 9. A storage that throws lists by stage, and both ways work, with no page error.
  const blocked=await browser.newContext({viewport:{width:1440,height:900}});contexts.push(blocked);
  await blocked.addInitScript(()=>{Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new DOMException('The storage is blocked','SecurityError');}});});
  const b=await blocked.newPage();await guard(b);await b.goto(origin+'/');await ready(b);
  const order=()=>b.evaluate(()=>[...window.Pavoia.stations].map(s=>s.id).join());
  const lists=[await order()];await b.locator('#ways [value=feeling]').click();lists.push(await order());await b.locator('#ways [value=stage]').click();lists.push(await order());
  assert(lists.join('|')===[byStage,byFeeling,byStage].map(o=>o.join()).join('|'),'9: blocked storage: '+lists.join(' | '));
  report.push('9: blocked storage lists by stage, then by feeling and back');

  // 11. The text styles: the switch in Inter 12 or 14, the words and the fact in mono 11, the stations in serif 19; in the
  // sheet, its own title, rows and lines, the words in mono 11 and the switch in Inter 14. Weight 400 everywhere.
  const styles=(p,selector)=>p.evaluate(selector=>{const seen=new Set();
    for(const root of document.querySelectorAll(selector))for(const n of [root,...root.querySelectorAll('*')]){
      if(n.closest('[hidden], .visually-hidden')||![...n.childNodes].some(c=>c.nodeType===3&&c.textContent.trim())||!n.getBoundingClientRect().width)continue;
      const s=getComputedStyle(n);seen.add(s.fontFamily.split(',')[0].replace(/['"]/g,'')+' '+s.fontSize+' '+s.fontWeight);}
    return [...seen].sort();},selector);
  const only=(seen,allowed,what)=>assert(seen.every(s=>allowed.includes(s)),`11: ${what}: ${seen.join(', ')}`);
  const probes=[];
  for(const [width,inter] of [[1440,'Inter 14px 400'],[800,'Inter 12px 400']]){
    await page.setViewportSize({width,height:900});
    for(const lang of ['en','de'])for(const way of ['stage','feeling']){await set(page,lang,way);const seen=await styles(page,'#mood-stage, #station-selector');only(seen,['Instrument Serif 19px 400',inter,'JetBrains Mono 11px 400'],`the rail at ${width} ${lang} by ${way}`);if(lang==='en'&&way==='stage')probes.push(`${width}: ${seen.join(', ')}`);}
  }
  await m.locator('#open-stations').tap();await sheetOpen(true);
  for(const way of ['stage','feeling']){await set(m,null,way);const seen=await styles(m,'#stations-sheet');only(seen,['Instrument Serif 28px 400','Instrument Serif 22px 400','Inter 14px 400','Inter 12px 400','JetBrains Mono 11px 400'],'the sheet by '+way);if(way==='stage')probes.push('sheet: '+seen.join(', '));}
  report.push('11: '+probes.join('; '));

  // 15. Focus rings. In the sheet, By feeling reached with the keyboard rings above the heading's bottom border. On the
  // rail, the rings of Essentials, the bus and a station stay below their group's word.
  // The sheet opens again on the current station, and Shift+Tab walks back along the screen to By feeling.
  await set(m,null,'stage');await m.keyboard.press('Escape');await sheetOpen(false);
  await m.locator('#open-stations').tap();await sheetOpen(true);
  const walked=[];
  for(let i=0;i<6&&!walked.includes('feeling');i++){await m.keyboard.press('Shift+Tab');walked.push(await m.evaluate(()=>document.activeElement.value||document.activeElement.id));}
  const sheetRing=await m.evaluate(()=>{const a=document.activeElement,s=getComputedStyle(a),h=document.querySelector('.stations-heading').getBoundingClientRect();
    return {value:a.value,visible:a.matches(':focus-visible'),gap:(h.bottom-1)-(a.getBoundingClientRect().bottom+parseFloat(s.outlineOffset)+parseFloat(s.outlineWidth))};});
  assert(sheetRing.value==='feeling'&&sheetRing.visible&&sheetRing.gap>=-.5,'15: the ring of By feeling in the sheet: '+JSON.stringify({...sheetRing,walked}));
  await m.keyboard.press('Escape');await sheetOpen(false);
  await visit(1440,900);
  const railRings=[];
  for(const selector of ['#moods input[value="05"]','#bus-link','#moods input[value="04"]']){
    await page.keyboard.press('Shift');await page.locator(selector).focus();
    const ring=await page.evaluate(selector=>{const target=document.querySelector(selector),ringed=target.matches('input')?(target.closest('.mood-essentials')||target.closest('label').querySelector('span')):target,s=getComputedStyle(ringed);
      return {visible:target.matches(':focus-visible'),gap:ringed.getBoundingClientRect().top-parseFloat(s.outlineOffset)-parseFloat(s.outlineWidth)-target.closest('.mood-group').querySelector('.group-name').getBoundingClientRect().bottom};},selector);
    assert(ring.visible&&ring.gap>=-.5,'15: the ring of '+selector+' reaches its word: '+JSON.stringify(ring));railRings.push(`${selector} ${ring.gap.toFixed(1)} px`);
  }
  report.push(`15: Shift+Tab from the current station walks ${walked.join(', ')}; By feeling's ring ${sheetRing.gap.toFixed(1)} px above the heading's border; rings under their word: ${railRings.join(', ')}`);

  // 13. The player bar names the stage after Lost in Feelings, whole, except where its column is narrow.
  const bars=[];
  for(const [width,height,expected] of [[1440,900,'LOST IN FEELINGS · PAŁAC'],[390,844,'LOST IN FEELINGS · PAŁAC'],[360,740,'LOST IN FEELINGS · PAŁAC'],[1100,800,'LOST IN FEELINGS'],[900,800,'LOST IN FEELINGS']]){
    await page.setViewportSize({width,height});
    const bar=await page.evaluate(()=>{const n=document.getElementById('player-stage');return {text:n.innerText,cut:n.scrollWidth>n.clientWidth};});
    assert(bar.text===expected&&!bar.cut,`13: the bar at ${width}: ${JSON.stringify(bar)}`);bars.push(`${width} "${bar.text}"`);
  }
  report.push('13: '+bars.join(', ')+', none cut');

  // 14. Chrome's accessibility tree: the fieldset, the switch's two toggle buttons, the groups with their names and
  // descriptions, nine radios named by their station; by feeling a radio's description ends on its stage.
  const tree=async()=>{const session=await page.context().newCDPSession(page),{nodes}=await session.send('Accessibility.getFullAXTree');await session.detach();
    const byId=new Map(nodes.map(n=>[n.nodeId,n])),find=(root,test)=>{const out=[],walk=n=>{for(const id of n.childIds||[]){const c=byId.get(id);if(!c)continue;if(test(c))out.push(c);walk(c);}};walk(root);return out;};
    const role=n=>n.role?.value,name=n=>n.name?.value,fieldset=nodes.find(n=>role(n)==='group'&&name(n)==='Choose a station');
    return {fieldset,find,role,name,description:n=>n.description?.value};};
  await page.setViewportSize({width:1440,height:900});
  const ax=await tree();assert(ax.fieldset,'14: no group named Choose a station');
  const switcher=ax.find(ax.fieldset,n=>ax.role(n)==='group'&&ax.name(n)==='Order the stations')[0],toggles=switcher?ax.find(switcher,n=>ax.role(n)==='button'):[];
  const pressed=toggles.map(n=>n.properties?.find(p=>p.name==='pressed')?.value.value),groups=ax.find(ax.fieldset,n=>ax.role(n)==='group').map(n=>ax.name(n));
  const radios=ax.find(ax.fieldset,n=>ax.role(n)==='radio'),palac=ax.find(ax.fieldset,n=>ax.role(n)==='group'&&ax.name(n)==='Pałac stage')[0];
  assert(toggles.length===2&&pressed.join()==='false,true','14: the switch: '+JSON.stringify(toggles.map(n=>[ax.name(n),n.properties])));
  assert(radios.length===9&&radios.map(ax.name).join()==='Under the Sun,As Night Begins,Night in Motion,Lost in Feelings,Etage 0,Fontanna,Ambiance,Closing,Essentials','14: the radios: '+radios.map(ax.name));
  assert(palac&&ax.description(palac)==='Its peak and its inward side','14: the Pałac group: '+JSON.stringify(palac&&[ax.name(palac),ax.description(palac)]));
  const night=radios.find(n=>ax.name(n)==='Night in Motion');
  await page.locator('#ways [value=feeling]').click();
  const felt=await tree(),motion=felt.find(felt.fieldset,n=>felt.role(n)==='radio'&&felt.name(n)==='Night in Motion')[0];
  assert(ax.description(night)==='Driving peak-time dance music'&&felt.description(motion)==='Driving peak-time dance music Pałac stage','14: the radio descriptions: '+[ax.description(night),felt.description(motion)]);
  report.push(`14: Choose a station holds Order the stations (2 toggle buttons, ${pressed}), the groups ${groups.filter(g=>g!=='Order the stations').join(', ')}, 9 radios; Pałac stage described as "${ax.description(palac)}"; Night in Motion described by feeling as "${felt.description(motion)}"`);
  await page.locator('#ways [value=stage]').click();await page.evaluate(()=>localStorage.clear());

  // 16. A slow first load: with app.js held back, the rail already holds the height app.js gives it, so the title does not
  // jump when the groups arrive. From 1101 px, where some widths wrap, only one row is held.
  const firsts=[];
  for(const [width,height] of [[1440,900],[1366,768],[1100,800]]){
    const context=await browser.newContext({viewport:{width,height}});contexts.push(context);
    const p=await context.newPage();await guard(p);
    let release;const held=new Promise(resolve=>{release=resolve;});
    await p.route('**/app.js',async route=>{await held;await route.continue();});
    await p.goto(origin+'/',{waitUntil:'commit'});
    await until(p,()=>document.getElementById('mood-name')&&getComputedStyle(document.body).backgroundColor!=='rgba(0, 0, 0, 0)',null,'16: the page did not paint');
    await p.evaluate(()=>document.fonts.ready);
    const top=()=>p.evaluate(()=>document.getElementById('mood-name').getBoundingClientRect().top),early=await top();
    release();await ready(p);const late=await top();
    assert(Math.abs(early-late)<=.5,`16: the title moves ${(early-late).toFixed(1)} px when app.js arrives at ${width}x${height}`);
    firsts.push(`${width}x${height} ${late.toFixed(1)}`);
  }
  report.push('16: the title stands still when app.js arrives late: '+firsts.join(', '));

  // 17. Short windows: the photo tools end at least 32 px above the player bar, as on 70a6e4e, in both ways.
  const shorts=[];
  for(const [width,height,lang] of [[1280,600,'de'],[1180,640,'en'],[1180,640,'de'],[1100,620,'de'],[1024,600,'de'],[800,600,'de'],[780,705,'de']]){
    await page.setViewportSize({width,height});
    for(const way of ['stage','feeling']){
      await set(page,lang,way);
      const gap=await page.evaluate(()=>{scrollTo(0,0);return document.querySelector('.player').getBoundingClientRect().top-document.querySelector('.stage-actions').getBoundingClientRect().bottom;});
      assert(gap>=31.5,`17: the photo tools end ${gap.toFixed(1)} px above the player bar at ${width}x${height} ${lang} by ${way}`);
      if(way==='stage')shorts.push(`${width}x${height} ${lang} ${gap.toFixed(1)} px`);
    }
  }
  report.push('17: photo tools above the bar by '+shorts.join(', '));
  await set(page,'en','stage');await page.evaluate(()=>localStorage.clear());

  // 10. Nothing played: no page asked for a stream, and no audio element got a source.
  await silent(page,'the run');
  for(const context of contexts)await context.close();
  assert(!streams.length,'10: stream requests: '+streams.join(' '));
  assert(!errors.length,'page errors: '+errors.join(' | '));
  report.push('10: no stream request, no audio source, no page error');
  return 'stages ok: '+report.join(' · ');
}
