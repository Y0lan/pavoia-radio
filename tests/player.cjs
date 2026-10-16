const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext, runInContext } = require('node:vm');
const web = name => readFileSync(resolve(__dirname, '../web/'+name), 'utf8');
const source = web('app.js');
const flush = async () => { for (let i=0;i<8;i++) await Promise.resolve(); };
// One clock for the page under test and the measurements it receives; tests move it forward by hand.
const clock = {now: Date.now()};
// Just enough CSS matching for the key handler: tags, [attr] and [attr=value], :focus-visible and :not() lists.
function cssMatches(list, el) {
  const parts=[];let depth=0,from=0;
  for(let i=0;i<list.length;i++){if(list[i]==='(')depth++;else if(list[i]===')')depth--;else if(list[i]===','&&!depth){parts.push(list.slice(from,i));from=i+1;}}
  parts.push(list.slice(from));
  return parts.some(part=>{
    let rest=part.trim(),m;
    if((m=/^[a-z]+/.exec(rest))){if(m[0]!==el.tag)return false;rest=rest.slice(m[0].length);}
    while(rest){
      if((m=/^\[([a-z-]+)(?:=([a-z-]+))?\]/.exec(rest))){if(!(m[1] in el.attrs)||(m[2]&&el.attrs[m[1]]!==m[2]))return false;}
      else if((m=/^:focus-visible/.exec(rest))){if(!el.focusVisible)return false;}
      else if((m=/^:checked/.exec(rest))){if(!('checked' in el.attrs))return false;}
      else if((m=/^:not\(/.exec(rest))){let end=m[0].length;for(let d=1;d&&end<rest.length;end++)d+=rest[end]==='('?1:rest[end]===')'?-1:0;if(cssMatches(rest.slice(m[0].length,end-1),el))return false;m=[rest.slice(0,end)];}
      else throw new Error('Unsupported selector: '+rest);
      rest=rest.slice(m[0].length);
    }
    return true;
  });
}
// A focused element as the key handler sees it. Chromium reports :focus-visible during any keydown.
const control=(tag,attrs={},focusVisible=false)=>{const el={tag,attrs,focusVisible};el.matches=selector=>cssMatches(selector,el);return el;};
// Stylesheet rules as selector -> declarations: the top level, or every @media block with this exact condition.
const blocks=css=>{const out=[];let depth=0,start=0,open=0;for(let i=0;i<css.length;i++){if(css[i]==='{'&&!depth++)open=i;else if(css[i]==='}'&&!--depth){out.push([css.slice(start,open).trim(),css.slice(open+1,i)]);start=i+1;}}return out;};
const cssRules=(media='')=>{
  const found=new Map();
  for(const [prelude,body] of blocks(web('style.css').replace(/\/\*[\s\S]*?\*\//g,''))){
    if(!media&&!prelude.startsWith('@'))found.set(prelude,body);
    else if(media&&prelude==='@media '+media)for(const [selector,declarations] of blocks(body))found.set(selector,declarations);
  }
  return found;
};
const status = (title, count=2) => ({track:{id:'123', title, artist:'Artist '+title}, audience:{available:true,listeners:count,measuredAt:new Date(clock.now).toISOString()}});

function setup({deferFetch=false,deferImages=false,saveData=false,hash='',storage={getItem:()=>null,setItem(){}},journey=false,media=[]}={}) {
  const imageRequests=[];
  class Element {
    constructor(){this.dataset={};this.events={};this.children=[];this.attrs={};this.textContent='';this.complete=true;this.naturalWidth=100;this.classList={add(){},remove(){}};this.style={setProperty(key,value){this[key]=value;}};}
    addEventListener(name,fn){(this.events[name] ||= new Set()).add(fn);}
    removeEventListener(name,fn){this.events[name]?.delete(fn);}
    emit(name,event={}){for(const fn of [...this.events[name] || []]) fn(event);}
    setAttribute(name,value){this.attrs[name]=String(value);}
    getAttribute(name){return this.attrs[name] ?? this[name] ?? null;}
    removeAttribute(name){delete this.attrs[name];delete this[name];}
    toggleAttribute(name,enabled){if(enabled)this.setAttribute(name,'');else this.removeAttribute(name);}
    append(...children){for(const child of children){if(typeof child==='object')child.parent=this;this.children.push(child);}}
    prepend(...children){for(const child of children.reverse())this.insertBefore(child,this.children[0]);}
    insertBefore(child,before){const index=this.children.indexOf(before);child.parent=this;if(index<0)this.children.push(child);else this.children.splice(index,0,child);}
    replaceChildren(...children){this.children=[];this.append(...children);}
    querySelector(selector){const kind=/data-kind="([^"]+)"/.exec(selector)?.[1];return this.children.find(c=>c.dataset?.kind===kind)||null;}
    contains(child){return this.children.includes(child);}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
    decode(){return deferImages ? new Promise((resolve,reject)=>imageRequests.push({src:this.src,resolve,reject})) : Promise.resolve();}
    getAnimations(){return [];}
    animate(){return {cancel(){},finished:Promise.resolve()};}
    pause(){}
    load(){}
  }
  const ids=['audio','play','player','player-title','player-artist','player-album','playback-status','player-stage','moods','station-selector','station-selector-home','station-sheet-list','stations-sheet','open-stations','close-stations','station-position','poster','mood-name','mood-place','mood-line','photo','photo-buffer','photo-count','change-photo','artwork-toggle','bus-link','live-text','live-label','language','wordmark','signed'];
  const nodes=ids.map(id=>Object.assign(new Element(),{id}));
  // Any other id gets a plain element, so journey.js finds every node it wires.
  const elements=new Proxy({}, {get:(_target,id)=>nodes.find(node=>node.id===id) || (nodes.push(Object.assign(new Element(),{id})),nodes.at(-1))});
  elements.photo.src='photos/selected/p005.jpg';
  elements['station-selector'].scrollWidth=elements['station-selector'].clientWidth=0;
  const body=new Element();
  const audio=elements.audio;
  audio.paused=true;audio.readyState=0;audio.calls=[];
  audio.pause=()=>{audio.paused=true;};
  audio.load=()=>{audio.readyState=0;audio.error=null;audio.ended=false;};
  audio.play=()=>{audio.paused=false;return new Promise((resolve,reject)=>audio.calls.push({resolve,reject,src:audio.src}));};
  const actions={},timers=new Map(),intervals=[];let timerID=0;
  clock.now=Date.now();
  let wallOffset=0;
  class FakeDate extends Date {static now(){return clock.now+wallOffset;}}
  const mediaSession={setActionHandler(name,fn){actions[name]=fn;}};
  const document=Object.assign(new Element(),{body,documentElement:new Element(),fonts:{ready:Promise.resolve()},getElementById:id=>elements[id],createElement:()=>new Element(),createElementNS:()=>new Element(),
    querySelector:selector=> selector==='dialog[open]' ? env.openDialog || null : selector.startsWith('input') ? new Element() : elements[selector.slice(1)],
    querySelectorAll:()=>[]});
  class MediaMetadata{constructor(value){Object.assign(this,value);}}
  const window=new Element(),location={hash,pathname:'/',search:''};
  window.MediaMetadata=MediaMetadata;window.dispatchEvent=event=>window.emit(event.type,event);
  const history={pushState(_state,_title,url){location.hash=url.includes('#')?url.slice(url.indexOf('#')):'';}};
  // Media queries listed in `media` match; a test flips one with env.queries.get(query).change(matches).
  const queries=new Map();
  const env={clock,elements,audio,actions,timers,mediaSession,document,window,location,imageRequests,queries,requests:[],response:status('First'),
    click:()=>elements.play.emit('click'),
    setLanguage:value=>elements.language.emit('click',{target:{value}}),
    focus:target=>document.emit('focusin',{target}),
    pointer:()=>document.emit('pointerdown',{}),
    key(code,target=control('body'),extra={}){const event={code,key:code==='Space'?' ':code,target,repeat:false,ctrlKey:false,metaKey:false,altKey:false,prevented:false,preventDefault(){event.prevented=true;},...extra};document.emit('keydown',event);return event;},change:id=>elements.moods.emit('change',{target:{value:id}}),
    playing:()=>{audio.readyState=4;audio.emit('playing');},
    error:()=>{audio.error={code:2};audio.emit('error');},
    poll:()=>intervals[0](),
    pollAudience:()=>{clock.now+=30000;return intervals[1]();},
    tickAudience:()=>intervals[1](),
    setWall:offset=>{wallOffset=offset;},
    audienceCalls:0,
    fire(delay){const entry=[...timers].find(([,v])=>v.delay===delay);assert.ok(entry,`Missing ${delay}ms timer`);timers.delete(entry[0]);entry[1].fn();},
    complete(index,data){const r=this.requests[index];r.resolve({ok:true,json:async()=>({...data,stage:{id:r.url.split('/').pop()}})});},
  };
  const context={Date:FakeDate,URL,CustomEvent:class{constructor(type){this.type=type;}},performance:{now:()=>clock.now},document,navigator:{mediaSession,connection:{saveData}},window,location,history,MediaMetadata,AbortController,
    matchMedia:query=>queries.get(query)||queries.set(query,{matches:media.includes(query),listeners:[],addEventListener(_name,fn){this.listeners.push(fn);},change(matches){this.matches=matches;for(const fn of this.listeners)fn();}}).get(query),Image:class extends Element {constructor(){super();env.preloader=this;}},
    localStorage:storage,
    fetch:(url,{signal})=>url.startsWith('/api/discovery/') ? Promise.resolve({ok:Boolean(env.discovery),json:async()=>env.discovery}) : url.startsWith('/api/audience?') ? (env.audienceCalls++,Promise.resolve(env.audienceHold).then(()=>({ok:!(env.audienceResponse instanceof Error),json:async()=>env.audienceResponse || env.response.audience}))) : new Promise((resolve,reject)=>{
      env.requests.push({url,signal,resolve,reject});
      if(!deferFetch){if(env.response instanceof Error)reject(env.response);else env.complete(env.requests.length-1,env.response);}
    }),
    setTimeout:(fn,delay)=>{timers.set(++timerID,{fn,delay});return timerID;},clearTimeout:id=>timers.delete(id),
    setInterval:fn=>intervals.push(fn),
  };
  runInNewContext(source,context);
  if(journey)runInContext(web('journey.js'),context);
  return env;
}

test('Photo only keeps its name, says whether it is pressed, is remembered and works without storage',async()=>{
 assert.match(web('index.html'),/<button type="button" id="artwork-toggle" class="change-photo artwork-toggle" aria-pressed="false" data-copy="photoOnly">Photo only<\/button>/,'one constant, translated label');
 const saved={},storage={getItem:key=>saved[key] ?? null,setItem(key,value){saved[key]=value;}};
 const e=setup({storage});await flush();const toggle=e.elements['artwork-toggle'],body=e.document.body;
 assert.equal(body.getAttribute('data-photo-only'),null);assert.equal(toggle.getAttribute('aria-pressed'),'false');
 toggle.emit('click');assert.equal(body.getAttribute('data-photo-only'),'');assert.equal(toggle.getAttribute('aria-pressed'),'true');assert.equal(saved['pavoia-photo-only'],'on');
 assert.equal(toggle.textContent,'','the label never turns into another name');
 const restored=setup({storage});await flush();
 assert.equal(restored.document.body.getAttribute('data-photo-only'),'');assert.equal(restored.elements['artwork-toggle'].getAttribute('aria-pressed'),'true');
 toggle.emit('click');assert.equal(body.getAttribute('data-photo-only'),null);assert.equal(saved['pavoia-photo-only'],'off');assert.equal(toggle.getAttribute('aria-pressed'),'false');
 const rules=cssRules();
 assert.match(rules.get('.change-photo'),/color:var\(--muted\); font:12px Inter,sans-serif;/,'both photo buttons are quiet 12px Inter');
 assert.doesNotMatch(rules.get('.change-photo'),/text-decoration/,'and carry no underline at rest');
 assert.match(cssRules('(min-width:761px)').get('.change-photo:hover'),/text-decoration:underline/,'a pointer underlines them');
 assert.match(rules.get('.change-photo:hover, .artwork-toggle[aria-pressed=true]'),/color:var\(--cream\)/,'pressed, it turns cream');
 assert.match(rules.get('.artwork-toggle[aria-pressed=true]'),/text-decoration:underline/,'with a solid underline');
 assert.match(rules.get('body:not(:has(#hero-cover[src], #painted-artist[src])) #artwork-toggle:not(:focus)'),/display:none/,'no artwork, no toggle; a cover still loading keeps it, and it never hides while it has focus');
 const denied=()=>{throw new Error('Storage denied');};
 const blocked=setup({storage:{getItem:denied,setItem:denied}});await flush();
 blocked.elements['artwork-toggle'].emit('click');assert.equal(blocked.document.body.getAttribute('data-photo-only'),'');
});

test('the start says Connecting; only a stall during play says Buffering',async()=>{
 const e=setup();await flush();e.click();e.audio.emit('waiting');
 assert.equal(e.elements['playback-status'].textContent,'Connecting…');
 e.playing();e.audio.readyState=2;e.audio.emit('waiting');assert.equal(e.elements['playback-status'].textContent,'Buffering…');
 e.change('03');await flush();e.audio.emit('waiting');assert.equal(e.elements['playback-status'].textContent,'Connecting…','a new station connects again');
});

test('the live count polls fast after a change and backs off while it stays the same',async()=>{
 const e=setup();await flush();assert.equal(e.audienceCalls,1);
 for (const [wait,calls] of [[0,1],[2000,2],[2000,2],[2000,3],[7999,3],[1,4],[16000,5],[29999,5],[1,6],[30000,7]]) {
  e.clock.now+=wait;await e.tickAudience();assert.equal(e.audienceCalls,calls,`${calls} polls expected after +${wait} ms`);
 }
 e.audio.emit('playing');await flush();assert.equal(e.audienceCalls,8,'starting playback polls at once');
 e.clock.now+=4000;await e.tickAudience();assert.equal(e.audienceCalls,9,'and restarts the fast rhythm');
 e.audienceResponse=status('Count',5).audience;e.clock.now+=8000;await e.tickAudience();assert.equal(e.audienceCalls,10);
 e.clock.now+=2000;await e.tickAudience();assert.equal(e.audienceCalls,11,'a new count makes it fast again');
 e.document.hidden=true;e.clock.now+=60000;await e.tickAudience();assert.equal(e.audienceCalls,11,'a hidden page polls nothing');
 e.document.hidden=false;e.change('03');await flush();assert.equal(e.audienceCalls,12,'a station change polls at once');
 e.setWall(-3600000);e.clock.now+=4000;await e.tickAudience();assert.equal(e.audienceCalls,13,'a system clock correction cannot stall polling');
});

test('going back to a stage waits for that stage\'s new audience reply',async()=>{
 const e=setup();await flush();const live=e.elements['live-text'];
 assert.equal(live.getAttribute('data-pending'),null,'the first stage is ready');
 let release;e.audienceHold=new Promise(resolve=>{release=resolve;});
 e.change('03');e.change('04');await flush();
 assert.equal(live.getAttribute('data-pending'),'','A, then B, then A again: A\'s old count is not reused');
 assert.equal(e.elements['live-label'].textContent,'Connecting…');
 release();await flush();
 assert.equal(live.getAttribute('data-pending'),null,'its new reply ends the wait');
});

test('gesture, pause/resume races and media controls release the source',async()=>{
 const e=setup();await flush();assert.equal(e.audio.calls.length,0);
 e.click();const old=e.audio.calls[0],oldPlaying=[...e.audio.events.playing][0];
 e.click();assert.equal(e.audio.src,undefined);e.click();
 old.reject(Object.assign(new Error(),{name:'AbortError'}));oldPlaying();await flush();
 assert.equal(e.elements.player.dataset.state,'connecting');e.playing();
 assert.equal(e.elements.player.dataset.state,'playing');
 await flush();e.actions.pause();assert.equal(e.audio.src,undefined);assert.equal(e.timers.size,0);
 e.actions.play();assert.equal(e.audio.src,'/stream/palac-feel.mp3');
 e.audio.paused=true;e.audio.emit('pause');assert.equal(e.audio.src,undefined);
});

test('four bounded retries, blocking and cancellation',async()=>{
 const e=setup();await flush();e.click();
 for(const delay of [1000,2000,4000,8000]){e.error();e.error();assert.equal(e.timers.size,1);e.fire(delay);}
 e.error();assert.equal(e.elements.player.dataset.state,'error');assert.equal(e.audio.src,undefined);assert.equal(e.timers.size,0);
 e.click();e.audio.calls.at(-1).reject(Object.assign(new Error(),{name:'NotAllowedError'}));await flush();
 assert.equal(e.elements['playback-status'].textContent,'Press play to start');assert.equal(e.timers.size,0);
 e.click();e.error();e.click();assert.equal(e.timers.size,0);assert.equal(e.audio.src,undefined);
 e.click();e.audio.emit('waiting');e.fire(20000);assert.equal(e.elements.player.dataset.state,'retrying');e.click();
});

test('active and paused station changes, stale play rejection and timer reset',async()=>{
 const e=setup();await flush();e.click();const old=e.audio.calls[0];
 e.response=status('Dance',3);e.change('03');await flush();
 old.reject(Object.assign(new Error(),{name:'NotAllowedError'}));await flush();e.playing();
 assert.equal(e.audio.src,'/stream/palac-dance.mp3');assert.equal(e.elements['player-title'].textContent,'Dance');
 assert.equal(e.mediaSession.metadata.album,'Night in Motion');
 e.click();e.change('04');assert.equal(e.audio.src,undefined);await flush();
 assert.equal(e.elements.player.dataset.state,'paused');e.change('not-a-mood');assert.equal(e.audio.src,undefined);
});

test('late metadata cannot overwrite a newer station or clear its poll guard',async()=>{
 const e=setup({deferFetch:true});e.change('03');e.change('04');
 assert.equal(e.requests[0].signal.aborted,true);assert.equal(e.requests[1].signal.aborted,true);
 e.complete(2,status('Current',7));await flush();e.complete(0,status('Old',99));e.requests[1].reject(new Error('Old'));
 await flush();assert.equal(e.elements['player-title'].textContent,'Current');e.audienceResponse=status('Count',7).audience;await e.pollAudience();assert.equal(e.elements['live-text'].textContent,'Live · 7 listening');
 const poll=e.poll();await flush();assert.equal(e.requests.length,4);e.complete(3,status('Next'));await poll;
 assert.equal(e.elements['player-title'].textContent,'Next');
});

test('live audience updates independently and never presents missing data as zero',async()=>{
 const e=setup();await flush();const live=e.elements['live-text'],body=e.document.body;
 e.audienceResponse=status('Count',0).audience;await e.pollAudience();assert.equal(live.textContent,'Live','nobody listening shows no count');
 assert.equal(e.elements['live-label'].textContent,'0 listening to this stage: Lost in Feelings','screen readers get the full sentence, zero included');assert.equal(body.getAttribute('data-on-air'),'');
 e.audienceResponse=status('Count',2).audience;await e.pollAudience();assert.equal(live.textContent,'Live · 2 listening');
 e.response=status('Old metadata count',0);await e.poll();assert.equal(live.textContent,'Live · 2 listening');
 e.audienceResponse.measuredAt=new Date(0).toISOString();await e.pollAudience();assert.equal(live.textContent,'Live');assert.equal(e.elements['live-label'].textContent,'Live','an unknown count is never read as a number');
 e.audienceResponse=new Error('Unavailable');await e.pollAudience();assert.equal(live.textContent,'Live');
 e.audienceResponse=status('Count',2).audience;await e.pollAudience();
 e.response=new Error('Offline');await e.poll();assert.equal(live.textContent,'Live','lost data is not an alarm in the header');assert.equal(body.getAttribute('data-on-air'),null,'the dot goes quiet');
 assert.equal(e.elements['live-label'].textContent,'Live. No track announced','the muted dot is not read aloud, so the label says it');assert.equal(e.mediaSession.metadata,null);
 e.response={track:null,audience:{available:true,listeners:2,measuredAt:new Date(e.clock.now).toISOString()}};await e.poll();
 assert.equal(live.textContent,'Live','no track: no count, no Standby');assert.equal(body.getAttribute('data-on-air'),null);assert.equal(e.elements['player-album'].textContent,'');
});

test('the header holds its words unseen until the radio and the audience answer, and narrow headers drop the word',async()=>{
 const e=setup({deferFetch:true});await flush();const live=e.elements['live-text'],shown=()=>[live.textContent,live.getAttribute('data-pending')];
 assert.deepEqual([live.textContent,e.elements['live-label'].textContent,e.document.body.getAttribute('data-on-air')],['','Connecting…',null],'loading: a muted dot, no words on screen, Connecting for screen readers');
 e.complete(0,status('First'));await flush();e.audienceResponse=status('Count',3).audience;await e.pollAudience();assert.deepEqual(shown(),['Live · 3 listening',null]);
 let answer;e.audienceResponse=new Promise(resolve=>{answer=resolve;});
 e.change('03');assert.deepEqual(shown(),['Live · 3 listening',''],'a stage change keeps the last words in place, unseen, so the dot does not jump');
 assert.equal(e.elements['live-label'].textContent,'Connecting…');
 e.complete(1,status('Dance'));await flush();assert.deepEqual(shown(),['Live · 3 listening',''],'the radio alone does not flash a bare Live');
 answer(status('Count',4).audience);await flush();assert.deepEqual(shown(),['Live · 4 listening',null],'the words change once, to their final value');
 e.audienceResponse=new Error('Unavailable');await e.pollAudience();assert.deepEqual(shown(),['Live',null],'a later failed count never hides the status');
 e.change('04');await flush();assert.deepEqual(shown(),['Live',''],'a failed count ends the wait for the audience');
 e.complete(2,status('Feelings'));await flush();assert.deepEqual(shown(),['Live',null]);
 e.audienceResponse=status('Count',3).audience;await e.pollAudience();e.setLanguage('de');assert.equal(live.textContent,'Live · 3 hören');
 const rules=cssRules();
 assert.match(rules.get('#live-text[data-pending]'),/color:transparent/,'pending words stay unseen but reach screen readers');
 assert.doesNotMatch(rules.get('#live-text[data-pending]'),/visibility:hidden|display:none/,'hiding them would drop the Connecting label');
 assert.match(rules.get('.live'),/white-space:nowrap/,'the status never breaks onto two lines');
 const narrow=setup({media:['(max-width: 900px)']});await flush();narrow.audienceResponse=status('Count',3).audience;await narrow.pollAudience();
 assert.equal(narrow.elements['live-text'].textContent,'Live · 3','phones and tablets keep the count and drop the word');
 narrow.queries.get('(max-width: 900px)').change(false);assert.equal(narrow.elements['live-text'].textContent,'Live · 3 listening','a widened window gets the word back');
});

test('language switching preserves playback and station',async()=>{
 const e=setup();await flush();e.change('07');await flush();
 assert.equal(e.requests.at(-1).url,'/api/radio/fontanna');
 assert.equal(e.elements['mood-place'].textContent,'The simple happiness of dancing together in daylight. Being there already feels good; the music makes you want to join in.');
 e.click();e.playing();
 e.setLanguage('de');
 assert.equal(e.document.documentElement.lang,'de');assert.equal(e.elements['playback-status'].textContent,'Wiedergabe');
 assert.equal(e.audio.src,'/stream/fontanna.mp3');assert.equal(e.audio.calls.length,1);
 assert.equal(e.elements['mood-place'].textContent,'Die einfache Freude, bei Tageslicht zusammen zu tanzen. Hier zu sein fühlt sich schon gut an; die Musik macht Lust, mitzutanzen.');
 assert.equal(e.mediaSession.metadata.album,'Fontanna');
});

test('two language buttons switch in one click and mark the active one',async()=>{
 const html=web('index.html');
 assert.match(html,/<div id="language" role="group" aria-label="Language"><button type="button" value="en" aria-pressed="true">EN<\/button><button type="button" value="de" aria-pressed="false">DE<\/button><\/div>/);
 assert.doesNotMatch(html,/<select id="language"/,'no menu to open for two choices');
 const rules=cssRules();
 assert.match(rules.get('#language button'),/min-width:44px; min-height:44px;.*color:var\(--muted\); font:11px var\(--mono\)/);
 assert.match(rules.get('#language button:is([aria-pressed=true], :hover)'),/color:var\(--cream\)/,'the active language is cream');
 const e=setup();await flush();
 const choice=value=>({value,attrs:{},setAttribute(name,v){this.attrs[name]=String(v);}}),[en,de]=[choice('en'),choice('de')];
 e.elements.language.children.push(en,de);
 e.elements.language.emit('click',{target:e.elements.language});assert.equal(e.document.documentElement.lang,'en','a click beside the buttons changes nothing');
 e.setLanguage('de');assert.equal(e.document.documentElement.lang,'de');assert.deepEqual([en.attrs['aria-pressed'],de.attrs['aria-pressed']],['false','true']);
 e.setLanguage('en');assert.deepEqual([en.attrs['aria-pressed'],de.attrs['aria-pressed']],['true','false']);
});

test('native end/error ordering reconnects and station changes reset retry timers',async()=>{
 for(const ended of [true,false]){
  const e=setup();await flush();e.click();e.playing();
  e.audio.paused=true;e.audio.ended=ended;e.audio.error=ended?null:{code:2};e.audio.emit('pause');
  e.audio.emit(ended?'ended':'error');assert.equal(e.elements.player.dataset.state,'retrying');
  e.fire(1000);e.error();assert.ok([...e.timers.values()].some(t=>t.delay===2000));
  e.change('03');await flush();await flush();assert.deepEqual([...e.timers.values()].map(t=>t.delay),[20000]);
  e.error();await flush();assert.deepEqual([...e.timers.values()].map(t=>t.delay),[1000]);
  e.fire(1000);e.playing();await flush();assert.deepEqual([...e.timers.values()].map(t=>t.delay),[30000]);
  e.click();assert.equal(e.timers.size,0);
 }
});

test('Next photo carries its position and names it in full',async()=>{
 const html=web('index.html'),button=html.slice(html.indexOf('<button type="button" id="change-photo"'),html.indexOf('</button>',html.indexOf('id="change-photo"')));
 assert.match(button,/<span data-copy="changePhoto">Next photo<\/span> <output id="photo-count"/,'the count lives inside the button');
 assert.doesNotMatch(button,/title=/,'no tooltip repeats the label');
 const e=setup();await flush();const next=e.elements['change-photo'];
 assert.equal(next.getAttribute('aria-label'),'Next photo, 1 of 4');assert.equal(e.elements['photo-count'].textContent,'1 / 4');
 next.emit('click');await flush();assert.equal(next.getAttribute('aria-label'),'Next photo, 2 of 4');assert.equal(e.elements['photo-count'].textContent,'2 / 4');
 e.setLanguage('de');assert.equal(next.getAttribute('aria-label'),'Nächstes Foto, 2 von 4');assert.equal(next.title,undefined);
 e.change('01');await flush();assert.equal(next.getAttribute('aria-label'),'Nächstes Foto, 1 von 8');
});

test('selected photos cycle on request and stage entry without changing playback',async()=>{
 const e=setup();await flush();e.click();e.playing();
 const first=e.elements.photo.src,seen=new Set([first]),audioCalls=e.audio.calls.length;
 assert.equal(e.elements['change-photo'].hidden,false);
 for(let i=0;i<3;i++){
  e.elements['change-photo'].emit('click');await flush();
  assert.ok(!seen.has(e.elements.photo.src));seen.add(e.elements.photo.src);
 }
 e.elements['change-photo'].emit('click');await flush();assert.equal(e.elements.photo.src,first);
 assert.equal(e.audio.calls.length,audioCalls);assert.equal(e.audio.paused,false);
 assert.equal(e.elements.player.dataset.state,'playing');
 e.response=status('Another track');await e.poll();assert.equal(e.elements.photo.src,first);
 e.setLanguage('de');assert.equal(e.elements.photo.src,first);
 e.change('04');assert.equal(e.elements.photo.src,first);
 e.change('02');await flush();assert.equal(e.document.documentElement.style['--focus'],'58% 38%');
 e.change('04');await flush();assert.notEqual(e.elements.photo.src,first);assert.ok(seen.has(e.elements.photo.src));
 e.change('07');await flush();assert.equal(e.elements['change-photo'].hidden,true);
 const only=e.elements.photo.src;e.change('04');e.change('07');await flush();assert.equal(e.elements.photo.src,only);
});

test('Bus navigation and metadata updates keep the playing station and source',async()=>{
 const e=setup();await flush();e.change('03');await flush();e.click();e.playing();
 const source=e.audio.src,calls=e.audio.calls.length,photo=e.elements.photo.src;
 e.location.hash='#bus';e.window.emit('hashchange');await flush();
 assert.equal(e.document.title,'▶ First · Artist First · Pavoia Radio','while it plays, the tab names the record even on the Bus');
 assert.equal(e.elements['mood-place'].textContent,'Somewhere in the forest. No playlist here, you have to be there.');
 assert.equal(e.document.body.getAttribute('data-bus'),'');assert.equal(e.elements['change-photo'].hidden,true);
 assert.equal(e.elements.photo.src,'photos/bus-stage.jpg');
 assert.equal(e.audio.src,source);assert.equal(e.audio.calls.length,calls);assert.equal(e.audio.paused,false);
 e.response=status('New track');await e.poll();
 assert.equal(e.elements['player-title'].textContent,'New track');assert.equal(e.elements.photo.src,'photos/bus-stage.jpg');
 assert.equal(e.window.Pavoia.getState().stage,'palac-dance');assert.equal(e.mediaSession.metadata.album,'Night in Motion');
 e.setLanguage('de');
 assert.equal(e.elements['mood-place'].textContent,'Irgendwo im Wald. Hier gibt es keine Playlist, du musst dabei sein.');
 e.location.hash='';e.window.emit('popstate');await flush();assert.equal(e.elements.photo.src,photo);
 e.location.hash='#bus';e.window.emit('popstate');
 e.elements.moods.emit('click',{target:{name:'mood',value:'03'}});
 assert.equal(e.location.hash,'');assert.equal(e.elements.photo.src,photo);assert.equal(e.audio.calls.length,calls);
 e.location.hash='#bus';e.window.emit('hashchange');e.change('01');await flush();
 assert.equal(e.location.hash,'');assert.equal(e.audio.src,'/stream/bermuda-day.mp3');
});

test('direct Bus links remain paused and use the regular station for playback',async()=>{
 const e=setup({hash:'#bus'});await flush();
 assert.equal(e.document.title,'The Bus · Pavoia Radio');assert.equal(e.document.body.getAttribute('data-bus'),'');assert.equal(e.audio.calls.length,0);
 assert.equal(e.elements.play.disabled,false);assert.notEqual(e.elements['player-title'].textContent,'Not on air yet');
 e.click();e.playing();assert.equal(e.audio.src,'/stream/palac-feel.mp3');
 await flush();e.actions.pause();assert.equal(e.audio.src,undefined);assert.equal(e.elements.photo.src,'photos/bus-stage.jpg');
 e.location.hash='#explore/art_123456789abc';e.window.Pavoia.renderScene();await flush();
 assert.equal(e.document.body.getAttribute('data-bus'),null);assert.notEqual(e.elements.photo.src,'photos/bus-stage.jpg');
});

test('late or failed photos keep the latest scene without delaying audio',async()=>{
 const e=setup({deferImages:true});e.imageRequests[0].resolve();await flush();
 const original=e.elements.photo.src;
 e.click();e.playing();e.change('02');
 assert.equal(e.audio.src,'/stream/bermuda-evening.mp3');
 assert.equal(e.elements.photo.src,original);
 e.change('01');assert.equal(e.audio.src,'/stream/bermuda-day.mp3');
 e.imageRequests[2].resolve();await flush();
 assert.equal(e.elements.photo.src,'photos/selected/p036.jpg');
 assert.equal(e.elements['photo-count'].textContent,'1 / 8');
 e.imageRequests[1].resolve();await flush();
 assert.equal(e.elements.photo.src,'photos/selected/p036.jpg');
 assert.equal(e.elements.photo.style.objectPosition,'50% 50%');
 e.elements['change-photo'].emit('click');e.imageRequests[3].reject(new Error('Image unavailable'));await flush();
 assert.equal(e.elements.photo.src,'photos/selected/p036.jpg');
 assert.equal(e.document.body.getAttribute('data-photo-loading'),null);
 assert.equal(e.elements['photo-count'].textContent,'');
 assert.equal(e.audio.src,'/stream/bermuda-day.mp3');
});

test('photo preloading respects data saving and stops at single-photo scenes',async()=>{
 const saving=setup({saveData:true});await flush();assert.equal(saving.preloader.src,undefined);
 const e=setup();await flush();assert.equal(e.preloader.src,'photos/selected/p204.jpg');
 const next=e.preloader.src;e.change('07');await flush();assert.equal(e.preloader.src,next);
 e.location.hash='#bus';e.window.emit('hashchange');await flush();assert.equal(e.preloader.src,next);
});

test('a failed first photo stays hidden and can recover on the next render',async()=>{
 const e=setup({deferImages:true});e.elements.photo.naturalWidth=0;
 e.imageRequests[0].reject(new Error('Image unavailable'));await flush();
 assert.equal(e.elements.photo.hidden,true);
 assert.equal(e.document.body.getAttribute('data-photo-loading'),null);
 e.window.Pavoia.renderScene();e.elements.photo.naturalWidth=100;
 e.imageRequests[1].resolve();await flush();assert.equal(e.elements.photo.hidden,false);
});

test('Space plays and pauses from anywhere, except while typing or on a keyboard-focused button',async()=>{
 const e=setup();await flush();
 assert.equal(e.key('Space').prevented,true);assert.equal(e.audio.src,'/stream/palac-feel.mp3','Space on the page plays');
 e.playing();e.key('Space');assert.equal(e.audio.src,undefined,'Space again pauses');
 for(const [target,why] of [[control('input',{type:'search'}),'search field'],[control('textarea'),'textarea'],[control('select'),'select'],[control('div',{contenteditable:''}),'editable text']]){
  assert.equal(e.key('Space',target).prevented,false,why);assert.equal(e.audio.calls.length,1,why);
 }
 for(const extra of [{ctrlKey:true},{metaKey:true},{altKey:true}]){e.key('Space',undefined,extra);assert.equal(e.audio.calls.length,1,JSON.stringify(extra));}
 assert.equal(e.key('Space',undefined,{repeat:true}).prevented,true,'a held Space does not scroll the page');assert.equal(e.audio.calls.length,1,'and does not toggle again');
 for(const target of [control('button',{},true),control('summary',{},true)]){
  e.focus(target);assert.equal(e.key('Space',target).prevented,false,target.tag+' reached by keyboard keeps its native Space');assert.equal(e.audio.calls.length,1);
 }
 const clicked=control('button');e.focus(clicked);clicked.focusVisible=true;
 assert.equal(e.key('Space',clicked).prevented,true,'a button focused by a click is not clicked again');assert.equal(e.audio.calls.length,2);
 assert.equal(e.key('Space',clicked,{repeat:true}).prevented,true,'holding Space does not click it on release');assert.equal(e.window.Pavoia.getState().wanted,true,'and the radio stays on');
 const volume=control('input',{type:'range'},true);e.focus(volume);e.key('Space',volume);assert.equal(e.audio.src,undefined,'Space on the volume slider pauses');
 const link=control('a',{},true);e.focus(link);assert.equal(e.key('Space',link).prevented,true,'a link has no Space of its own');assert.equal(e.audio.calls.length,3,'so Space plays');
 const radio=control('input',{type:'radio',checked:''},true);e.focus(radio);assert.equal(e.key('Space',radio).prevented,true,'the current station is already checked');assert.equal(e.audio.src,undefined,'so Space pauses');
 const other=control('input',{type:'radio'},true);e.focus(other);assert.equal(e.key('Space',other).prevented,false,'Space selects a station not yet selected');assert.equal(e.audio.src,undefined,'and leaves playback alone');
 const tabbed=control('button',{},true);e.focus(tabbed);e.pointer();assert.equal(e.key('Space',tabbed).prevented,true,'a button reached by Tab and then clicked does not capture Space');assert.equal(e.audio.calls.length,4,'so Space plays');
 e.window.Pavoia.stopPreview=()=>true;e.key('Space');assert.equal(e.audio.calls.length,4,'Space first stops a preview');
});

test('the arrow keys and the media keys step through the stations',async()=>{
 const e=setup();await flush();const stage=()=>e.window.Pavoia.getState().stage;
 e.key('ArrowRight');assert.equal(stage(),'etage-zero');
 e.key('ArrowLeft');e.key('ArrowLeft');assert.equal(stage(),'palac-dance');
 e.key('ArrowLeft',undefined,{repeat:true});assert.equal(stage(),'palac-dance','a held arrow steps once');
 e.actions.nexttrack();assert.equal(stage(),'palac-feel');
 e.actions.previoustrack();assert.equal(stage(),'palac-dance');
 for(const target of [control('input',{type:'radio'}),control('input',{type:'range'}),control('input',{type:'search'})]){e.key('ArrowRight',target);assert.equal(stage(),'palac-dance',target.attrs.type);}
 e.key('ArrowLeft',undefined,{altKey:true});assert.equal(stage(),'palac-dance','Alt+Left stays browser Back');
 e.openDialog={};e.key('ArrowRight');assert.equal(stage(),'palac-dance','an open dialog keeps its arrows');
 e.openDialog=null;e.change('01');e.key('ArrowLeft');assert.equal(stage(),'essentials','the first station wraps to the last');
 e.click();e.key('ArrowRight');assert.equal(e.audio.src,'/stream/bermuda-day.mp3','playback follows the station');
});

test('a blocked autoplay is a neutral pause and only transient states show words',async()=>{
 const e=setup();await flush();const player=e.elements.player;
 assert.deepEqual({...player.dataset},{state:'paused',status:'paused'});
 e.click();assert.equal(player.dataset.status,'connecting');
 e.audio.calls[0].reject(Object.assign(new Error(),{name:'NotAllowedError'}));await flush();
 assert.deepEqual({...player.dataset},{state:'paused',status:'blocked'},'blocked is not the red error state');
 assert.equal(e.elements['playback-status'].textContent,'Press play to start');assert.equal(e.elements.play.getAttribute('aria-label'),'Play');
 e.click();e.playing();assert.deepEqual({...player.dataset},{state:'playing',status:'playing'});
 const rules=cssRules(),reveal=rules.get('.player:not([data-status=paused],[data-status=playing]) #playback-status');
 assert.match(rules.get('#playback-status'),/clip-path:inset\(50%\)/,'paused and playing keep the status out of sight at every width');
 assert.match(reveal,/clip-path:none/,'a transient state shows its words');
 assert.match(rules.get('.player:not([data-status=paused],[data-status=playing]) #player-stage'),/display:none/,'and takes the stage name\'s place');
 assert.match(rules.get('.player[data-state="error"] .play'),/var\(--red\)/,'red stays for a real error');
});

test('the bar names the stage, the tab names the record and Play names its key',async()=>{
 const e=setup();await flush();
 assert.equal(e.elements['player-stage'].textContent,'Lost in Feelings');assert.equal(e.document.title,'Lost in Feelings · Pavoia Radio');
 assert.equal(e.elements.play.title,'Play (Space)');assert.equal(e.elements.play.getAttribute('aria-pressed'),null);
 e.click();assert.equal(e.elements.play.title,'Pause (Space)');assert.equal(e.document.title,'Lost in Feelings · Pavoia Radio','connecting is not playing yet');
 e.playing();assert.equal(e.document.title,'▶ First · Artist First · Pavoia Radio');assert.equal(e.elements['player-artist'].textContent,'Artist First');
 e.response=new Error('Offline');e.change('03');await flush();
 assert.equal(e.elements['player-stage'].textContent,'Night in Motion');assert.equal(e.elements['player-title'].textContent,'Night in Motion','a failed metadata call names the stage');
 assert.equal(e.elements['player-artist'].textContent,'','the artist line does not repeat it');
 e.setLanguage('de');assert.equal(e.elements.play.title,'Pause (Leertaste)');
 e.click();assert.equal(e.elements.play.title,'Abspielen (Leertaste)');assert.equal(e.document.title,'Night in Motion · Pavoia Radio');
});

test('the record title opens its roots, and the stage photo stands in for a missing cover',async()=>{
 const e=setup({journey:true});await flush();const title=e.elements['player-title'],dock=e.elements['dock-cover'];
 assert.equal(title.getAttribute('href'),'#explore/plex_123','before the roots load, the title opens the radio track');
 assert.deepEqual([dock.src,dock.hidden,dock.alt],['photos/selected/p005.jpg',false,''],'no cover: the stage photo, as decoration');
 e.discovery={entity:{id:'trk_0123456789ab',type:'track',title:'First'},included:[]};await e.poll();await flush();
 assert.equal(title.getAttribute('href'),'#explore/trk_0123456789ab','once known, the title opens the track in the roots');
 const cover='/api/radio/palac-feel/artwork/123/cover?v=0123456789abcdef',first=status('First');
 e.response={...first,track:{...first.track,coverUrl:cover}};await e.poll();await flush();assert.equal(dock.src,cover,'a real cover replaces the photo');
 e.response={track:null,audience:{available:false,listeners:null}};await e.poll();await flush();
 assert.equal(title.getAttribute('href'),null,'no track, no link');assert.equal(dock.src,'photos/selected/p005.jpg');
 e.change('03');await flush();assert.equal(dock.src,'photos/selected/p250.jpg','the photo follows the stage');
});

test('the record cell reads title, artists, then a release line that ends on Spotify',async()=>{
 const html=web('index.html'),cell=html.slice(html.indexOf('</button>'),html.indexOf('<div class="transport-track">'));
 assert.deepEqual([...cell.matchAll(/id="([a-z-]+)"/g)].map(m=>m[1]),['player-title','player-artist','credited-artists','player-album','label-note','track-spotify']);
 assert.match(cell,/<a id="player-title"/,'every name is a link, the title too');
 assert.match(cell,/<p class="player-release">.*<a id="track-spotify"[^>]*>Spotify<\/a><\/p>/,'Spotify is a word at the end of the release line');
 const rules=cssRules();
 assert.match(rules.get('.player-release > :not([hidden]) ~ :not([hidden])::before'),/content:'·'/,'a dot separates the shown release items, whichever are hidden');
 assert.match(rules.get('.player .artist-credit:not(:last-child)::after'),/content:',\\a0' \/ ''/,'artists read as a list, without a spoken comma');
 assert.equal([...rules.keys()].some(selector=>selector.includes('label-note::before')),false,'the old label dot is gone');
 const logos=[...rules,...cssRules('(max-width:760px)')].filter(([,body])=>body.includes('spotify.svg')).map(([selector])=>selector);
 assert.ok(logos.length&&logos.every(selector=>selector.startsWith('.stage-spotify')),'the green logo lives on the hero playlist link only: '+logos);
 const e=setup();await flush();assert.equal(e.elements['player-album'].hidden,true,'no album, so no dangling separator');
 const first=status('First');e.response={...first,track:{...first.track,album:'Salewa'}};await e.poll();
 assert.deepEqual([e.elements['player-album'].hidden,e.elements['player-album'].textContent],[false,'Salewa']);
});

test('artist names that do not fit scroll sideways, by wheel too, and a fade shows more wait',async()=>{
 const e=setup({journey:true});await flush();const row=e.elements['credited-artists'];
 // Like a browser, the row clamps its position to the real limit, which can be fractional.
 let left=0;row.limit=100;Object.defineProperty(row,'scrollLeft',{get:()=>left,set:v=>{left=Math.max(0,Math.min(row.limit,v));}});
 Object.assign(row,{scrollWidth:300,clientWidth:200});row.emit('scroll');
 assert.deepEqual([row.getAttribute('data-before'),row.getAttribute('data-more')],[null,''],'names wait to the right only');
 let stopped=0;const wheel=(deltaY,deltaX=0,more={})=>row.emit('wheel',{deltaY,deltaX,deltaMode:0,cancelable:true,preventDefault(){stopped++;},...more});
 wheel(60,0,{cancelable:false});assert.deepEqual([row.scrollLeft,stopped],[0,0],'a wheel event the page cannot cancel scrolls the page alone');
 wheel(60,0,{ctrlKey:true});assert.deepEqual([row.scrollLeft,stopped],[0,0],'Ctrl+wheel and pinch stay the browser zoom');
 wheel(1,0,{deltaMode:1});assert.equal(row.scrollLeft,16,'a wheel counting lines moves a line');
 wheel(0.25,0,{deltaMode:2});assert.equal(row.scrollLeft,66,'a wheel counting pages moves by the row width');
 row.scrollLeft=0;stopped=0;
 wheel(60);assert.deepEqual([row.scrollLeft,stopped],[60,1],'a plain mouse wheel scrolls the row');
 wheel(-1,40);assert.deepEqual([row.scrollLeft,stopped],[60,1],'a sideways trackpad gesture keeps its native scroll');
 wheel(500);assert.equal(row.scrollLeft,100,'the wheel stops at the last name');row.emit('scroll');
 assert.deepEqual([row.getAttribute('data-before'),row.getAttribute('data-more')],['',null],'at the end the fade moves to the start');
 wheel(60);assert.equal(stopped,2,'past the end the page gets the wheel back');
 row.limit=99.5;row.scrollLeft=500;wheel(60);assert.deepEqual([row.scrollLeft,stopped],[99.5,2],'a fractional end gives the wheel back too');
 wheel(-60);assert.deepEqual([row.scrollLeft,stopped],[39.5,3],'and the wheel scrolls back from it');
 row.limit=0;row.clientWidth=300;row.scrollLeft=0;wheel(60);assert.deepEqual([row.scrollLeft,stopped],[0,3],'a row that fits never takes the wheel');
});

test('names in the bar are quiet until a pointer or the keyboard reaches them',()=>{
 const rules=cssRules(),names=/#player-title|#player-album|#track-spotify|\.artist-credit|\.label-note/;
 for(const [selector,body] of rules)if(names.test(selector)&&/text-decoration:underline/.test(body))assert.match(selector,/:hover.*:focus-visible/,'underlined at rest: '+selector);
 const reached=[...rules].find(([selector])=>/#player-title\[href\].*:hover, :focus-visible/.test(selector));
 assert.ok(reached,'a rule underlines the names on hover and focus');assert.match(reached[0],/\.artist-credit:is\(:hover, :focus-visible\)>span>span/);
 assert.match(reached[1],/color:var\(--cream\); text-decoration:underline; text-underline-offset:3px/);
 assert.match(rules.get('.player .credited-artists'),/display:block; min-width:0; flex:1 1 0; padding:6px; margin:-6px;.*white-space:nowrap; overflow-x:auto; overflow-y:hidden; scrollbar-width:none/,'whole names in order, scrolled sideways without a scrollbar, with room for the 5px focus ring');
 assert.match(rules.get('.player .credited-artists:is([data-before], [data-more])'),/mask-image:linear-gradient\(to right, var\(--before\) 6px.*var\(--more\) calc\(100% - 6px\)\)/,'one fade per side where names wait');
 assert.match(rules.get('.player .credited-artists:has(:focus-visible)'),/mask-image:none/,'a focused name is never faded, nor its ring');
 assert.match(rules.get('.player .credited-artists[data-before]'),/--before:transparent/);assert.match(rules.get('.player .credited-artists[data-more]'),/--more:transparent/);
 for(const [selector,body] of rules)if(/artist-credit|credited-artists/.test(selector))assert.doesNotMatch(body,/text-overflow|overflow:clip/,'no name is cut: '+selector);
 assert.match(rules.get('#player-title'),/justify-self:start; max-width:100%/,'the title link, its ring and its click area end with its words');
 assert.match(rules.get('.player .label-note'),/flex-shrink:0; max-width:50%/,'a long album gives way before the label');
 assert.match(rules.get('.player .artist-credit'),/font:inherit/,'artist names use Inter, not the button default');
});

test('the bar is opaque, keeps 96px on desktop and fits 120px on a phone',()=>{
 const player=cssRules().get('.player'),phone=cssRules('(max-width:760px)');
 assert.match(player,/position:fixed;.*height:var\(--bar\);.*grid-template-columns:48px 44px minmax\(220px,1.3fr\) minmax\(120px,1fr\) 88px; grid-template-rows:23px 24px 24px;/);
 assert.match(cssRules().get('.player .artist-credit'),/min-height:24px/,'desktop artist links keep a 24px target');
 assert.match(player,/background:var\(--ink\);/,'the page never shows through the bar');
 const rows=body=>/grid-template-rows:([^;]+)/.exec(body)[1].split(' ').reduce((sum,row)=>sum+parseFloat(row),0);
 assert.ok(rows(player)+12+12+1<=96,'desktop rows, padding and border fit the 96px bar');
 assert.match(phone.get(':root'),/--bar:calc\(120px \+ env\(safe-area-inset-bottom\)\)/);
 assert.match(phone.get('.player'),/grid-template-columns:44px 44px minmax\(0,1fr\);.*padding:12px 12px calc\(11px \+ env\(safe-area-inset-bottom\)\)/);
 assert.equal(rows(phone.get('.player'))+12+11+1,120,'phone rows, padding and border fill the bar exactly, so the page above stays clear');
 assert.match(phone.get('.dock-cover, .dock-artwork'),/width:44px; height:44px/,'the cover matches the play button');
 assert.match(phone.get('.player .player-release'),/grid-column:1 \/ -1; grid-row:3/,'the release line takes the full width');
 assert.match(phone.get('.player .artist-credit'),/min-height:24px/,'artist links keep a 24px target');
});

test('the volume is a thin line, and leaves where a page cannot set it',()=>{
 const rules=cssRules();
 assert.match(rules.get('.volume-control input'),/appearance:none/);
 assert.match(rules.get('.volume-control input::-webkit-slider-runnable-track'),/height:2px; background:var\(--soft\)/);
 assert.match(rules.get('.volume-control input::-webkit-slider-thumb'),/width:12px; height:12px;.*border-radius:50%; background:var\(--cream\)/);
 assert.match(rules.get('.volume-control input::-moz-range-thumb'),/width:12px; height:12px;.*background:var\(--cream\)/);
 assert.match(cssRules('(max-width:760px), (pointer:coarse)').get('.player .volume-control'),/display:none/,'phones and tablets use their own volume keys');
});

test('a remembered volume only applies where its slider is shown',async()=>{
 const query='(max-width:760px), (pointer:coarse)',storage={getItem:key=>key==='pavoia-volume'?'0':null,setItem(){}};
 assert.ok(cssRules(query).has('.player .volume-control'),'the stylesheet hides the slider under the same query');
 const desktop=setup({journey:true,storage});await flush();assert.equal(desktop.audio.volume,0,'the slider on screen keeps its muted level');
 const phone=setup({journey:true,storage,media:[query]});await flush();assert.equal(phone.audio.volume,1,'no slider on screen, so the device sets the level');
 phone.queries.get(query).change(false);assert.equal(phone.audio.volume,0,'a window widened past the phone layout gets its slider level back');
 desktop.queries.get(query).change(true);assert.equal(desktop.audio.volume,1,'a window narrowed to the phone layout is never left silent');
});

test('external links carry a drawn arrow that screen readers skip',()=>{
 assert.match(cssRules().get('a[target="_blank"]:not(.stage-spotify)::after, .stage-spotify>span:first-child::after'),/content:'\\2009↗' \/ ''/);
 for(const name of ['index.html','app.js','journey.js'])assert.doesNotMatch(web(name),/↗/,name+' types no arrow into a label');
});

test('every class in the stylesheet is used by the page',()=>{
 const css=web('style.css').replace(/\/\*[\s\S]*?\*\//g,'').replace(/url\([^)]*\)/g,''),page=['index.html','app.js','journey.js','waveform.js'].map(web).join('\n');
 const unused=[...new Set([...css.matchAll(/\.([a-z][a-z0-9-]*)/g)].map(m=>m[1]))].filter(name=>!new RegExp('(?<![\\w-])'+name+'(?![\\w-])').test(page));
 assert.deepEqual(unused,[]);
});

test('the stage column is one line of stations over one constant line of actions',()=>{
 const rules=cssRules(),html=web('index.html');
 assert.match(rules.get('.listen-layout'),/grid-template-columns:minmax\(0,1fr\); align-items:end;.*padding:clamp\(120px,24svh,320px\) var\(--gutter\) 32px;/,'one column, and a 1366×768 laptop sees all of it');
 assert.ok(!cssRules('(min-width:761px) and (max-width:1100px)').has('.listen-layout'),'no empty second column on small laptops either');
 assert.match(rules.get('.scene-artwork'),/display:contents/,'the artwork layers keep their geometry without taking a grid cell');
 assert.match(rules.get('.stage-actions'),/display:flex; flex-wrap:wrap; align-items:center; gap:8px 24px; min-height:44px;/);
 const line=html.slice(html.indexOf('<div class="stage-actions">'),html.indexOf('</div>',html.indexOf('<div class="stage-actions">')));
 assert.deepEqual([...line.matchAll(/(?:id|class)="([a-z-]+)"/g)].map(m=>m[1]),['stage-actions','stage-action','stage-spotify','stage-spotify','spotify-caption','spotify-daily','bus-ticket','change-photo','change-photo','photo-count','artwork-toggle'],'slot, Next photo, Photo only');
 assert.doesNotMatch(line.slice(0,line.indexOf('>')),/hidden/,'the line is always there, so the rail never moves');
 assert.match(line,/<\/a><span class="spotify-daily" data-journey="spotifyDaily">/,'the daily note sits outside the link');
 assert.match(rules.get('.stage-action'),/font-size:14px;.*color:var\(--muted\)/);
 assert.match(rules.get('.stage-spotify, .bus-ticket'),/color:var\(--soft\)/,'the ticket takes the playlist link style');
 assert.match(rules.get('body:not([data-bus]) :is(.bus-ticket, .stage-action:has(#stage-spotify[hidden]))'),/display:none/,'the ticket only on the Bus; no playlist, no empty slot before the photo tools');
 assert.match(rules.get('body[data-bus] :is(.record-sleeve, .painted-artist, #stage-spotify, .spotify-daily, #artwork-toggle)'),/display:none/,'the Bus swaps the playlist for the ticket');
 assert.match(rules.get('.place'),/min-height:2lh/,'a one-line description keeps the title where two lines put it');
 assert.match(cssRules('(max-width:760px)').get('body[data-bus] .swipe-hint'),/visibility:hidden/,'on phones the Bus keeps the hint\'s height, so its title does not drop');
 assert.match(cssRules('(max-width:760px)').get('.stage-spotify>span:not(.spotify-caption), .spotify-daily'),/display:none/,'phones keep the Playlist tile alone');
 for(const gone of ['bus-copy','bus-line','busLine','sleeve-empty','painted-artist-secondary','.secondary','showArtwork','standby','offline','audienceUnknown'])
  for(const name of ['index.html','app.js','journey.js','style.css'])assert.ok(!web(name).includes(gone),gone+' is gone from '+name);
});

test('the sleeve clears the text column, which sits in a darker pool',()=>{
 const rules=cssRules(),phone=cssRules('(max-width:760px)');
 assert.match(rules.get('.record-sleeve'),/left:28%/);
 assert.match(rules.get('.listen-layout::after'),/background:radial-gradient\(ellipse 60% 55% at 0% 70%,rgb\(11 10 9 \/ \.6\),transparent\),linear-gradient\(/,'the pool is in front of the old gradient');
 assert.match(rules.get('.listen-layout::after'),/linear-gradient\(180deg,rgb\(11 10 9 \/ \.75\),rgb\(11 10 9 \/ \.6\) 90px,rgb\(11 10 9 \/ \.25\) 160px,transparent 30%,/,'the header band is as dark as on phones, so a cover or a pale sky cannot show through the status');
 for(const selector of ['h1','.place'])assert.match(rules.get(selector),/text-shadow:0 2px 18px rgb\(0 0 0 \/ \.45\)/,selector+' carries the shadow at every width');
 assert.match(rules.get('.place'),/color:var\(--cream\)/,'the description reads in cream at every width');
 assert.doesNotMatch(phone.get('h1')+phone.get('.place'),/text-shadow|color:/,'the phone rules no longer carry their own copy');
});

test('title and description arrive together, on the shared curve',async()=>{
 const e=setup();await flush();const moves=[],fades=[];
 e.elements.bottom.animate=(frames,options)=>{moves.push([frames,options]);return {cancel(){},finished:Promise.resolve()};};
 e.elements['photo-buffer'].animate=(frames,options)=>{fades.push(options);return {cancel(){},finished:Promise.resolve()};};
 e.change('03');await flush();
 const plain=value=>JSON.parse(JSON.stringify(value));
 assert.deepEqual(plain(moves),[[[{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:240,easing:'cubic-bezier(.22, 1, .36, 1)'}]]);
 e.setLanguage('de');assert.equal(moves.length,1,'a language change is not a scene change');
 assert.deepEqual(plain(fades),[{duration:360,easing:'cubic-bezier(.22, 1, .36, 1)'}],'the photo crossfade uses the same curve');
});
