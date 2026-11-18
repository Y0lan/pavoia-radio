// Playwright CLI callback. Added and removed, in a station's Statistics place and merged under All stations, and the place
// kept on Back from a record. With rows it is the first region, in sessions, each under its line; with none it is the
// last and says why, with Try again when the changes did not load. Every changes record, statistics document and plays
// document here is browser-only test data; the stream is never asked for.
async page => {
 const assert=(ok,message)=>{if(!ok)throw new Error(message);};
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const origin=new URL(page.url()).origin;
 await page.route('**/stream/**',route=>route.abort());
 // 213 changes on Fontanna in sessions of 9, a day apart, the newest today, one change a look a minute apart: pages of
 // 100, 100 and 13. One session of 12 on Essentials. Merged, Essentials has one session of 110, one page more, and
 // Fontanna 3 changes a day apart, the newest tying with it. Bulk: 86 tracks added to Fontanna in one look, and one to
 // Essentials. Year: one session of 12 additions and 3 removals on 12 November 2025, at noon. Every page is asked 100
 // at a time, as the server answers it.
 const now=Date.now(),at=(day,minute=0)=>new Date(now-60000-day*86400000-minute*60000).toISOString().replace(/\.\d+Z$/,'Z');
 const feed=(stage,n,per)=>Array.from({length:n},(_,i)=>({sequence:String(n-i),kind:i%3===2?'removed':'added',id:String(700000+n-i),title:stage+' change '+(n-i),artist:'Test artist '+(n-i),album:'Test album',observedAt:at(Math.floor(i/per),i%per)}));
 const look=new Date(now-3*86400000).toISOString().replace(/\.\d+Z$/,'Z'),bulk=Array.from({length:86},(_,i)=>({sequence:String(86-i),kind:'added',id:String(800086-i),title:'Bulk track '+(86-i),artist:'Bulk artist',album:'Test album',observedAt:look}));
 const year=Array.from({length:15},(_,i)=>({sequence:String(15-i),kind:i%5===4?'removed':'added',id:String(900015-i),title:'Year track '+(15-i),artist:'Year artist',album:'Test album',observedAt:new Date(2025,10,12,12,30-i).toISOString()}));
 const sets={records:{fontanna:feed('fontanna',213,9),essentials:feed('essentials',12,12)},merge:{fontanna:feed('fontanna',3,1),essentials:feed('essentials',110,110)},bulk:{fontanna:bulk,essentials:feed('essentials',1,1)},year:{essentials:year}},feeds=sets.records;
 let mode='records',held=null,hold=false;const asked=[],numbers=[],limits=new Set();
 await page.route('**/api/radio/*/changes?**',async route=>{
  const url=new URL(route.request().url()),stage=url.pathname.split('/')[3],limit=Number(url.searchParams.get('limit')),before=Number(url.searchParams.get('before')||Infinity);asked.push(stage+(url.searchParams.get('before')?' before '+url.searchParams.get('before'):''));limits.add(url.searchParams.get('limit'));
  if(hold){hold=false;await new Promise(resolve=>{held=resolve;});}
  if(mode==='error')return route.fulfill({status:503,body:'changes unavailable'}).catch(()=>{});
  const rest=(sets[mode]?.[stage]||[]).filter(r=>Number(r.sequence)<before),out=rest.slice(0,limit);
  await route.fulfill({json:{trackingSince:mode==='pending'?null:'2026-10-07T00:15:13Z',changes:out,next:rest.length>limit?out.at(-1).sequence:null}}).catch(()=>{});
 });
 await page.route('**/api/library/statistics?**',route=>{const scope=new URL(route.request().url()).searchParams.get('scope');numbers.push('statistics '+scope);
  route.fulfill({json:{scope,updatedAt:new Date(now).toISOString(),tracks:400,artists:300,releases:200,durationMs:90000000,coverage:{artists:400,labels:400,years:400,releases:400,genres:0},topArtists:[{name:'Test artist',count:9}],labels:[{name:'Test label',count:8}],years:[{name:'2020',count:300},{name:'2024',count:100}],genres:[],stages:[]}});});
 await page.route('**/api/radio/*/music',route=>{numbers.push('music');return route.fulfill({json:{from:new Date(now-30*86400000).toISOString(),until:new Date(now).toISOString(),earliest:'2026-10-06T23:27:25Z',tracks:400,plays:900,distinctPlayed:400,unplayed:0,top:[]}});});
 const region='#music-content section[aria-labelledby=r-changes]',rows=region+' li > a.row',more=region+' > button',lines=region+' li > .release-line';
 const drawn=()=>page.waitForFunction(()=>document.querySelector('#music-content .entity-heading')&&!document.getElementById('music-content').hasAttribute('aria-busy'));
 const visit=async stage=>{await page.locator(`#stage-row a[href="#statistics/${stage}"]`).click();await drawn();};
 // A page load reads every journal again: the page keeps them 5 minutes, for every place.
 const fresh=async stage=>{
  await page.goto(origin+'/?station=palac-feel');
  await page.waitForFunction(()=>window.Pavoia?.stations?.length===9);
  await page.locator('#language [value=en]').dispatchEvent('click');
  await page.evaluate(h=>{history.pushState({explorer:true},'',h);dispatchEvent(new PopStateEvent('popstate'));},'#statistics/'+stage);
  await drawn();
 };
 // A press shows the next session of nine held in memory, and asks for nothing.
 const fromMemory=async()=>{const n=await page.locator(rows).count(),sent=asked.length;await page.locator(more).click();await page.waitForFunction(([r,n])=>document.querySelectorAll(r).length===n,[rows,n+9]);assert(asked.length===sent,'A press with a session in memory asked: '+asked.slice(sent));};
 // Each line stands first in the item of its session's first row; a line and a row line show, not hidden to 1 px.
 const read=()=>page.locator(region+' ol > li').evaluateAll(items=>items.map(li=>[...li.children].map(n=>n.localName==='p'?'LINE '+n.textContent:(n.hasAttribute('href')?'ROW ':'BULK ')+n.querySelector('.row-name').textContent).join(' / ')));
 // A row line may end on an ellipsis, as every row line does when it is long; a session line shows whole.
 const shown=(selector,whole=false)=>page.locator(selector).evaluateAll((n,whole)=>n.map(e=>{const b=e.getBoundingClientRect();return b.width>1&&b.height>1&&(!whole||e.scrollWidth<=e.clientWidth);}),whole);
 await fresh('fontanna');
 assert(await page.locator(rows).count()===9,'The first batch is not one session of nine');
 const today=await page.locator(lines).allTextContents();
 assert(JSON.stringify(today)==='["Today · 6 new tracks · 3 removed"]'&&(await read())[0]==='LINE Today · 6 new tracks · 3 removed / ROW fontanna change 213','The first line is not over the first row: '+JSON.stringify(today));
 assert(JSON.stringify(asked)==='["fontanna"]','The place did not ask once for its first page: '+asked);
 assert(await page.locator(region+' h4').textContent()==='Added and removed','Missing heading');
 assert(await page.locator('#music-content .regions > section').first().getAttribute('aria-labelledby')==='r-changes','The region with rows is not the first of the regions');
 assert(await page.locator(region).getAttribute('data-key')===null&&await page.locator(rows+' .row-line').first().isVisible(),'The region has a data-key, which hides its row lines');
 const first=await page.locator(rows).first().evaluate(a=>[a.getAttribute('href'),a.querySelector('time').dateTime,a.querySelector('.row-name').textContent,a.querySelector('.row-line').textContent,a.querySelector('.row-fact').textContent]);
 assert(JSON.stringify(first)===JSON.stringify(['#explore/plex_700213',feeds.fontanna[0].observedAt,'fontanna change 213','Test artist 213','added']),'First row: '+JSON.stringify(first));
 assert(await page.locator(rows).nth(2).locator('.row-fact').textContent()==='removed','A removal does not say so');
 const times=await page.locator(rows+' time').allTextContents(),clock=c=>new Date(c.observedAt).toLocaleTimeString('en',{timeStyle:'short'});
 assert(times[0]===clock(feeds.fontanna[0])&&times[8]===clock(feeds.fontanna[8]),'A row does not read its time: '+times.join(','));
 assert((await shown(rows+' .row-line')).every(Boolean)&&(await shown(lines,true)).every(Boolean),'A row line or a session line is cut');
 // The first page holds 100: a session more at a press, with no request, under the rows shown.
 await page.locator(rows).first().evaluate(a=>{a.dataset.ten='';});await fromMemory();
 assert(await page.locator(rows).first().getAttribute('data-ten')===''&&await page.locator(more).textContent()==='Show earlier changes','The rows held in memory drew the list again');
 assert(JSON.stringify(await page.locator(lines).allTextContents())==='["Today · 6 new tracks · 3 removed","Yesterday · 6 new tracks · 3 removed"]','The second session has no line of its own');
 for(let n=27;n<=90;n+=9)await fromMemory();
 // Paging: busy in place, focus kept, then appended under the rows shown.
 held=null;hold=true;await page.locator(more).focus();await page.keyboard.press('Enter');
 for(let i=0;!held&&i<100;i++)await page.waitForTimeout(20);
 assert(held,'The next page was not asked for');
 assert(await page.locator(more).getAttribute('aria-disabled')==='true'&&await page.locator(more).textContent()==='Loading…','The button does not say it is busy');
 assert(await page.evaluate(()=>document.activeElement.matches('section[aria-labelledby=r-changes] > button')),'Focus left the button while it loads');
 const sent=asked.length;await page.keyboard.press('Enter');await page.waitForTimeout(200);
 assert(asked.length===sent,'A second press while it loads asked again');
 const top=await page.locator(rows).first().evaluate(a=>a.dataset.mark='first');
 // The last session of the page waits, with one row so far, and could join the batch: the press asks for the next page.
 held();await page.waitForFunction(r=>document.querySelectorAll(r).length===99,rows);
 assert(await page.locator(rows).first().getAttribute('data-mark')==='first','The first rows were drawn again');
 assert(asked.at(-1)==='fontanna before 114','Paging did not ask from the oldest change read: '+asked.at(-1));
 for(let n=108;n<=189;n+=9)await fromMemory();
 mode='error';await page.locator(more).click();
 await page.waitForFunction(b=>document.querySelector(b)?.textContent==='Try again',more);
 assert(await page.locator(rows).count()===189,'A failed page dropped rows');
 mode='records';await page.locator(more).focus();await page.keyboard.press('Enter');
 await page.waitForFunction(r=>document.querySelectorAll(r).length===198,rows);
 assert(asked.at(-1)==='fontanna before 14','Try again did not ask for the same page: '+asked.at(-1));
 await page.keyboard.press('Enter');await page.waitForFunction(r=>document.querySelectorAll(r).length===207,rows);
 await page.keyboard.press('Enter');await page.waitForFunction(r=>document.querySelectorAll(r).length===213,rows);
 assert(await page.locator(more).count()===0,'The last session left the button');
 assert(await page.evaluate(r=>document.activeElement===document.querySelectorAll(r)[207],rows),'Focus did not move to the first change of the last session');
 assert((await page.locator('#music-content .stage-notes').textContent()).includes('Changes are recorded since Oct 7.'),'Missing the date changes are recorded since');
 for(const width of [320,360,390,760,1100,1440]){
  await page.setViewportSize({width,height:900});await page.waitForTimeout(100);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.getElementById('explorer').scrollWidth<=document.getElementById('explorer').clientWidth),`Overflow at ${width}`);
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('#language [value=de]').dispatchEvent('click');await drawn();
 assert(await page.locator(region+' h4').textContent()==='Hinzugefügt und entfernt','Heading not translated');
 assert(JSON.stringify(await page.locator(rows+' .row-fact').evaluateAll(n=>n.slice(0,3).map(f=>f.textContent)))==='["hinzugefügt","hinzugefügt","entfernt"]','Facts not translated');
 assert(await page.locator(more).textContent()==='Frühere Änderungen anzeigen','Button not translated');
 for(const width of [390,360]){
  await page.setViewportSize({width,height:844});await page.waitForTimeout(100);
  assert(JSON.stringify(await page.locator(lines).allTextContents())==='["Heute · 6 neue Tracks · 3 entfernt"]'&&(await shown(lines,true)).every(Boolean)&&(await shown(rows+' .row-line')).every(Boolean),`The German line at ${width}: `+await page.locator(lines).allTextContents());
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.getElementById('explorer').scrollWidth<=document.getElementById('explorer').clientWidth),`Overflow at ${width} in German`);
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator(region).scrollIntoViewIfNeeded();
 await page.screenshot({path:'changes-fixture-mobile-de.png'});
 await page.locator('#language [value=en]').dispatchEvent('click');await drawn();
 // All stations: the nine first pages, merged by time, ties in the order on screen; only Essentials pages again.
 await page.setViewportSize({width:1440,height:900});
 mode='merge';asked.length=0;await fresh('radio');
 assert(asked.length===9&&asked.every(a=>!a.includes('before')),'All stations did not ask each station once: '+asked.join(','));
 const merged=await page.locator(rows).evaluateAll(n=>n.map(a=>[a.querySelector('time').dateTime,a.querySelector('.row-line').textContent.split(' · ')[0]]));
 const order=await page.evaluate(()=>window.Pavoia.stations.map(s=>s.name));
 assert(merged.every(r=>order.includes(r[1])),'A row does not name its station: '+JSON.stringify(merged[0]));
 assert(merged.every((r,i)=>!i||r[0]<merged[i-1][0]||r[0]===merged[i-1][0]&&order.indexOf(r[1])>=order.indexOf(merged[i-1][1])),'Not newest first with ties in screen order');
 const cut=sets.merge.essentials[99].observedAt;
 assert(merged.length>0&&merged.every(r=>r[0]>=cut),'A change older than the oldest loaded of a station with more is shown');
 const two=(await read()).slice(0,2);
 assert(JSON.stringify(two)==='["LINE '+two[0].slice(5).split(' · ')[0]+' · 68 new tracks · 33 removed / ROW fontanna change 3","ROW essentials change 110"]','The session of two stations does not count its rows: '+JSON.stringify(two));
 // The region reads across the columns before the last one, as Release years does, which keeps its width: from 761px
 // they share one edge and one width, and Release years is no taller than its strip.
 for(const width of [1440,1100,900]){
  await page.setViewportSize({width,height:900});await page.waitForTimeout(100);
  const [years,changes]=await page.evaluate(r=>[document.querySelector('#music-content .release-years'),document.querySelector(r)].map(n=>{const b=n.getBoundingClientRect();return [Math.round(b.left),Math.round(b.width),Math.round(b.height)];}),region);
  assert(years[0]===changes[0]&&years[1]===changes[1]&&years[2]<400,`At ${width} Release years ${years} and the changes ${changes} do not share their columns`);
 }
 await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(100);
 // Where the heading stands in the explorer at 1440x900, the place at its top: on the map, under its box, and in the list.
 const headingTop=()=>page.evaluate(()=>{const x=document.getElementById('explorer');x.scrollTop=0;return Math.round(document.getElementById('r-changes').getBoundingClientRect().top-x.getBoundingClientRect().top);});
 const tops={map:await headingTop()};assert(await page.locator('#music-content .neighbourhood').count()===1,'1440px does not show the map');
 await page.locator('#music-content .neighbourhood-caption button').click();await page.waitForFunction(()=>!document.querySelector('#music-content .neighbourhood'));tops.list=await headingTop();
 assert(await page.locator('#music-content .regions > section').first().getAttribute('aria-labelledby')==='r-changes','In the list the region is not first');
 await page.locator('#music-content .neighbourhood-caption button').click();await page.waitForFunction(()=>document.querySelector('#music-content .neighbourhood'));
 // The first session never waits, though Essentials has more: it shows whole, and grows with the next page.
 asked.length=0;
 for(let i=0;i<20&&await page.locator(more).count();i++){const n=await page.locator(rows).count();await page.locator(more).click();await page.waitForFunction(([r,b,n])=>document.querySelectorAll(r).length>n||!document.querySelector(b),[rows,more,n]);}
 assert(JSON.stringify(asked)==='["essentials before 11"]','Paging asked other stations: '+asked.join(','));
 assert(await page.locator(rows).count()===113&&merged.length===101,'Merged rows: '+merged.length+' then '+await page.locator(rows).count());
 assert(JSON.stringify(await page.locator(lines).evaluateAll(n=>n.map(p=>p.textContent.split(' · ').slice(1))))==='[["75 new tracks","36 removed"],["1 new track"],["1 removed"]]','The session that grew does not count its rows');
 await page.locator(region).scrollIntoViewIfNeeded();
 await page.screenshot({path:'changes-fixture-desktop.png'});
 // No row: the region is the last one, its heading and one sentence. No change yet: nothing added or removed since the
 // date. Not watched yet: no change recorded yet. A feed that fails: it could not load, with Try again; the rest draws.
 const last=async()=>page.locator('#music-content .regions > section').last().getAttribute('aria-labelledby');
 const said=()=>page.locator(region).evaluate(r=>[...r.children].slice(1).map(n=>n.localName+' '+n.textContent));
 mode='baseline';await fresh('etage-zero');
 assert(await last()==='r-changes'&&JSON.stringify(await said())==='["p Nothing added or removed since Oct 7."]','An empty feed does not say so last: '+JSON.stringify(await said()));
 assert((await page.locator('#music-content .stage-notes').textContent()).includes('Changes are recorded since'),'An empty feed lost its date');
 mode='pending';await visit('closing');
 assert(await last()==='r-changes'&&JSON.stringify(await said())==='["p No changes are recorded yet."]'&&!(await page.locator('#music-content .stage-notes').textContent()).includes('Changes are recorded'),'A feed not watched yet: '+JSON.stringify(await said()));
 mode='error';await visit('ambiance');
 assert(await last()==='r-changes'&&JSON.stringify(await said())==='["p The changes could not load.","button Try again"]','A failing feed does not say so: '+JSON.stringify(await said()));
 assert(await page.locator('#music-content .release-years').count()===1&&await page.locator('#music-status').textContent()==='','A failing feed broke the place');
 const empty={};
 for(const width of [320,360,390,760,1100,1440]){
  await page.setViewportSize({width,height:900});await page.waitForTimeout(100);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.getElementById('explorer').scrollWidth<=document.getElementById('explorer').clientWidth),`Overflow at ${width} with the error`);
 }
 await page.setViewportSize({width:390,height:844});await page.locator('#language [value=de]').dispatchEvent('click');await drawn();
 assert(JSON.stringify(await said())==='["p Die Änderungen konnten nicht geladen werden.","button Erneut versuchen"]','The error not in German: '+JSON.stringify(await said()));
 await page.locator(region).scrollIntoViewIfNeeded();await page.screenshot({path:'changes-fixture-error-mobile-de.png'});
 // Try again asks again: the changes come, and none changed.
 mode='baseline';const tried=asked.length;await page.locator(region+' > button').click();await drawn();
 assert(asked.slice(tried).join()==='ambiance'&&JSON.stringify(await said())==='["p Seit 7. Okt. nichts hinzugefügt oder entfernt."]','Try again did not ask again: '+asked.slice(tried)+' '+JSON.stringify(await said()));
 empty.de=await said();
 await page.locator('#language [value=en]').dispatchEvent('click');await drawn();await page.setViewportSize({width:1440,height:900});
 // A bulk look is one row that opens nothing, on All stations and on its station's place: no link, no fact, no focus,
 // no pointer, and its lines show whole. Its session says its day only.
 for(const [width,height] of [[1440,900],[390,844]]){
  await page.setViewportSize({width,height});mode='bulk';await fresh('radio');
  const all=await read(),row=page.locator(region+' li > a.row:not([href])');
  assert(all.length===2&&all[1].startsWith('LINE ')&&!all[1].split(' / ')[0].includes(' · ')&&all[1].endsWith('BULK 86 tracks added at once'),`At ${width} the bulk session: `+JSON.stringify(all));
  const seen=await row.evaluate(a=>{a.focus();return [a.querySelector('.row-line').textContent,a.querySelectorAll('.row-fact').length,document.activeElement===a,getComputedStyle(a).cursor,getComputedStyle(a.querySelector('.row-name')).textDecorationLine];});
  assert(JSON.stringify(seen)==='["Fontanna · Bulk track 86, Bulk track 85 and 84 more",0,false,"auto","none"]',`At ${width} the bulk row: `+JSON.stringify(seen));
  await row.hover();assert(await row.evaluate(a=>getComputedStyle(a.querySelector('.row-name')).textDecorationLine)==='none',`At ${width} the bulk row underlines on hover`);
  assert((await shown(rows+' .row-line')).every(Boolean)&&(await shown(region+' li > a.row:not([href]) .row-line')).every(Boolean),`At ${width} a row line is hidden`);
  await visit('fontanna');
  assert(JSON.stringify(await read())==='["LINE '+all[1].split(' / ')[0].slice(5)+' / BULK 86 tracks added at once"]'&&await page.locator(region+' li > a.row:not([href]) .row-line').textContent()==='Bulk track 86, Bulk track 85 and 84 more',`At ${width} the bulk row on its station: `+JSON.stringify(await read()));
  await page.mouse.move(2,2);
 }
 // The longest line, a day of another year in German with both counts, shows whole at 320 and 360 px, laid out as on a
 // phone, whose scrollbar takes no width: Chromium's mobile emulation while it measures. (A desktop window keeps 15 px
 // for its scrollbar, html's scrollbar-gutter, and cuts the line at 320 px with an ellipsis.)
 mode='year';await fresh('essentials');await page.locator('#language [value=de]').dispatchEvent('click');await drawn();
 const longest={},cdp=await page.context().newCDPSession(page);
 for(const width of [320,360]){
  await page.setViewportSize({width,height:740});await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:740,deviceScaleFactor:1,mobile:true});
  await page.waitForFunction(w=>document.body.clientWidth===w&&document.querySelector('#music-content .release-line'),width,{timeout:30000});
  longest[width]=await page.locator(lines).evaluate(p=>[p.textContent,p.scrollWidth,p.clientWidth]);
  assert(longest[width][0]==='12. November 2025 · 12 neue Tracks · 3 entfernt'&&longest[width][1]<=longest[width][2],`The line with a year at ${width}: `+JSON.stringify(longest[width]));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.getElementById('explorer').scrollWidth<=document.getElementById('explorer').clientWidth),`Overflow at ${width} with the year line`);
 }
 await cdp.send('Emulation.clearDeviceMetricsOverride');await cdp.detach();
 await page.locator('#language [value=en]').dispatchEvent('click');await drawn();await page.setViewportSize({width:1440,height:900});
 // A page still loading when the listener leaves never lands in the next place.
 mode='records';await fresh('fontanna');for(let n=18;n<=90;n+=9)await fromMemory();held=null;hold=true;await page.locator(more).click();
 for(let i=0;!held&&i<100;i++)await page.waitForTimeout(20);
 await visit('essentials');held();await page.waitForTimeout(200);
 assert(await page.locator(rows).count()===12&&(await page.locator(rows).first().textContent()).includes('essentials'),'A page of the station left landed in the next one');
 // Back from a record opened from the place: the same rows, the same scroll, focus on the row opened, and no request for
 // the numbers, the plays or the changes. The record itself does not matter here: it may fail to load.
 const kept=[];
 for(const [width,height] of [[1440,900],[390,844]]){
  await page.setViewportSize({width,height});await visit('essentials');await visit('fontanna');
  await page.evaluate(()=>{document.getElementById('explorer').scrollTop=600;});await page.locator(more).click();
  await page.waitForFunction(r=>document.querySelectorAll(r).length===18,rows);
  await page.locator(rows).nth(4).evaluate(a=>{a.dataset.opened='';a.scrollIntoView({block:'center'});});await page.waitForTimeout(100);
  const left=await page.evaluate(r=>[document.querySelectorAll(r).length,document.getElementById('explorer').scrollTop],rows),sent=[asked.length,numbers.length],href=await page.locator(rows).nth(4).getAttribute('href');
  await page.locator(rows).nth(4).click();
  await page.waitForFunction(h=>location.hash===h&&document.getElementById('music-view').hidden&&document.getElementById('discovery-status').textContent!=='Loading…',href);
  await page.evaluate(()=>{document.getElementById('explorer').scrollTop=0;history.back();});
  await page.waitForFunction(()=>location.hash.startsWith('#statistics/')&&!document.getElementById('music-view').hidden);await drawn();await page.waitForTimeout(200);
  const back=await page.evaluate(r=>[document.querySelectorAll(r).length,document.getElementById('explorer').scrollTop,document.activeElement===document.querySelector('[data-opened]'),document.activeElement.closest('#music-content')!==null],rows);
  assert(back[0]===left[0]&&Math.abs(back[1]-left[1])<=1,`At ${width} Back did not bring the place back: ${left} then ${back}`);
  assert(back[2]&&back[3],`At ${width} focus is not on the row opened`);
  assert(asked.length===sent[0]&&numbers.length===sent[1],`At ${width} Back asked again: ${asked.slice(sent[0])} ${numbers.slice(sent[1])}`);
  kept.push({width,rows:back[0],scrollTop:[left[1],back[1]],requests:asked.length-sent[0]+numbers.length-sent[1]});
 }
 assert(JSON.stringify([...limits])==='["100"]','A page was not asked 100 at a time: '+[...limits]);
 assert(await page.locator('#audio').evaluate(a=>a.paused&&!a.getAttribute('src')),'Statistics started audio');
 assert(errors.length===0,errors.join('; '));
 return {checks:'first region with rows, session lines over their rows, row times, pages of 100, a session more from memory, paging busy/append/Try again/last session focus, since date, EN/DE at 390 and 360, widths, All stations merge and paging with a first session that grows, bulk rows with no link, fact, focus or pointer, the line with a year at 320 and 360, heading top at 1440x900, last region with the empty, not watched and 503 sentences, Try again, race, Back keeps the place, paused audio',widths:[320,360,390,760,1100,1440],headingTop1440x900:tops,longest,emptyDe:empty.de,kept,pageErrors:errors};
}
