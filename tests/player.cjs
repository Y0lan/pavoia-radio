const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext, runInContext } = require('node:vm');
const web = name => readFileSync(resolve(__dirname, '../web/'+name), 'utf8');
const source = web('app.js');
// Enough turns for a hop: its payload, its credited artists and its naming fetch, each through fetch() and json().
const flush = async () => { for (let i=0;i<32;i++) await Promise.resolve(); };
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
// Stylesheet rules in source order, as [media, selector list, declarations]: of two rules for one selector, the later wins.
const ordered=()=>blocks(web('style.css').replace(/\/\*[\s\S]*?\*\//g,'')).flatMap(([prelude,body])=>prelude.startsWith('@media ')?blocks(body).map(([selector,declarations])=>[prelude.slice(7),selector,declarations]):[['',prelude,body]]);
const lastAt=(media,selector)=>ordered().findLastIndex(([m,list])=>m===media&&list.split(/,\s*/).includes(selector));
const status = (title, count=2) => ({track:{id:'123', title, artist:'Artist '+title}, audience:{available:true,listeners:count,measuredAt:new Date(clock.now).toISOString()}});

function setup({deferFetch=false,deferImages=false,saveData=false,hash='',search='',state=null,below=[],storage={getItem:()=>null,setItem(){}},journey=false,media=[]}={}) {
  const imageRequests=[];
  class Element {
    constructor(){this.dataset={};this.events={};this.children=[];this.attrs={};this.textContent='';this.complete=true;this.naturalWidth=100;this.classList={add(){},remove(){},toggle(){}};this.style={setProperty(key,value){this[key]=value;}};}
    get parentNode(){return this.parent||null;}
    // Writing the text replaces the children, as in a browser.
    get textContent(){return this.text;}
    set textContent(value){this.text=value;this.children=[];}
    addEventListener(name,fn){(this.events[name] ||= new Set()).add(fn);}
    removeEventListener(name,fn){this.events[name]?.delete(fn);}
    emit(name,event={}){for(const fn of [...this.events[name] || []]) fn(event);}
    setAttribute(name,value){this.attrs[name]=String(value);}
    getAttribute(name){return this.attrs[name] ?? this[name] ?? null;}
    removeAttribute(name){delete this.attrs[name];delete this[name];}
    toggleAttribute(name,enabled){if(enabled)this.setAttribute(name,'');else this.removeAttribute(name);}
    // A child moves: it leaves its old parent first, and inserting it before itself changes nothing, as in a browser.
    append(...children){for(const child of children){if(typeof child==='object'){child.remove();child.parent=this;}this.children.push(child);}}
    prepend(...children){for(const child of children.reverse())this.insertBefore(child,this.children[0]);}
    insertBefore(child,before){if(child===before)return;if(typeof child==='object')child.remove();const index=this.children.indexOf(before);child.parent=this;if(index<0)this.children.push(child);else this.children.splice(index,0,child);}
    before(child){this.parent.insertBefore(child,this);}
    after(child){child.parent=this.parent;this.parent.children.splice(this.parent.children.indexOf(this)+1,0,child);}
    replaceChildren(...children){this.textContent='';this.children=[];this.append(...children);}
    normalize(){this.children=this.children.reduce((out,c)=>typeof c==='string'&&typeof out.at(-1)==='string'?[...out.slice(0,-1),out.at(-1)+c]:[...out,c],[]);}
    descendants(){return this.children.flatMap(c=>typeof c==='object'?[c,...c.descendants()]:[]);}
    // A class (.name), a tag, an attribute ([name]), a tag of a class with an attribute (a.row[href]), or the journey's
    // [data-kind] lookup.
    querySelector(selector){
      const whole=/^([a-z]+)\.([\w-]+)\[([a-z-]+)\]$/.exec(selector);
      if(whole)return this.descendants().find(c=>c.localName===whole[1]&&c.className?.split(' ').includes(whole[2])&&c.getAttribute(whole[3])!==null)||null;
      if(selector.startsWith('.'))return this.descendants().find(c=>c.className?.split(' ').includes(selector.slice(1)))||null;
      if(/^\[[a-z-]+\]$/.test(selector))return this.descendants().find(c=>c.attrs&&selector.slice(1,-1) in c.attrs)||null;
      if(/^[a-z]+$/.test(selector))return this.descendants().find(c=>c.localName===selector)||null;
      const kind=/data-kind="([^"]+)"/.exec(selector)?.[1];return this.children.find(c=>c.dataset?.kind===kind)||null;
    }
    // Every descendant of a tag or a class, with an attribute when one is named: a, .region, .region[data-open].
    querySelectorAll(selector){
      const [,tag,name,attr]=/^([a-z]*)(?:\.([\w-]+))?(?:\[([\w-]+)\])?$/.exec(selector)||[];
      if(tag===undefined)throw new Error('the harness reads no selector '+selector);
      return this.descendants().filter(c=>(!tag||c.localName===tag)&&(!name||c.className?.split(' ').includes(name))&&(!attr||Boolean(c.attrs)&&attr in c.attrs));
    }
    // The nearest of itself and its ancestors with a class (.name), as a browser finds it; any other selector finds none.
    closest(selector){if(!/^\.[\w-]+$/.test(selector))return null;for(let n=this;n;n=n.parent)if(n.className?.split(' ').includes(selector.slice(1)))return n;return null;}
    focus(options){document.activeElement=this;this.focusOptions=options;}
    select(){this.selected=true;}
    scrollIntoView(options){this.scrolled=options;}
    showModal(){this.open=true;this.modal=true;}
    show(){this.open=true;this.modal=false;}
    close(){this.open=false;}
    contains(child){return this.descendants().includes(child);}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(c=>c!==this);}
    decode(){return deferImages ? new Promise((resolve,reject)=>imageRequests.push({src:this.src,resolve,reject})) : Promise.resolve();}
    getBoundingClientRect(){return {left:0,top:0,right:0,bottom:0,width:0,height:0};}
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
  // The rail opens on the way switch, then the Bus, as in index.html.
  for(const value of ['feeling','stage'])elements.ways.append(Object.assign(new Element(),{localName:'button',value,attrs:{'aria-pressed':String(value==='stage')}}));
  elements.moods.append(elements.ways,elements['bus-link']);
  // The music view holds its bar, the Index head, the rail and the rows, as in index.html.
  elements['music-filters'].append(elements['stage-row'],elements['history-day']);elements['index-head'].append(elements['index-sides'],elements['index-query'],elements['index-order']);
  elements['music-view'].append(elements['music-filters'],elements['index-head'],elements['index-rail'],elements['music-content'],elements['history-more']);
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
  const document=Object.assign(new Element(),{body,activeElement:body,documentElement:new Element(),fonts:{ready:Promise.resolve()},getElementById:id=>elements[id],createElement:tag=>Object.assign(new Element(),{localName:tag},tag==='input'?{value:''}:{}),createElementNS:()=>new Element(),
    // env.openDialog stands for the modal stations sheet; the explorer counts as an open dialog, never a modal one.
    querySelector:selector=> selector==='dialog:modal' ? env.openDialog || null : selector==='dialog[open]' ? env.openDialog || (elements.explorer.open ? elements.explorer : null) : selector.startsWith('input') ? elements.moods.descendants().find(n=>n.localName==='input'&&selector.includes(`"${n.value}"`)) || new Element() : elements[selector.slice(1)],
    querySelectorAll:selector=>selector==='.explorer-nav a' ? (env.nav ||= ['#explore','#history','#statistics','#index/artists'].map((href,i)=>{const link=i===0?elements['roots-tab']:i===3?elements['index-tab']:new Element();link.setAttribute('href',href);return link;})) : selector==='.mood' ? elements.moods.descendants().filter(n=>n.className==='mood') : selector==='main, .roots-footer' ? [elements.main,elements['roots-footer']] : []});
  class MediaMetadata{constructor(value){Object.assign(this,value);}}
  const window=new Element();
  window.MediaMetadata=MediaMetadata;window.dispatchEvent=event=>window.emit(event.type,event);
  // Session history as a browser keeps it: entries with their state, query and hash, and a position. Assigning the hash
  // adds an entry, as a link does; tests fire its popstate and hashchange themselves, or through env.visit(). `below` holds
  // the entries under the one the page loads on, as after a reload.
  let current=hash,query=search,at=below.length;const entries=[...below.map(entry=>({state:null,hash:'',search,...entry})),{state,hash,search}];
  const urlHash=url=>url.includes('#')?url.slice(url.indexOf('#')):'';
  // A URL with only a hash keeps the query, as a browser resolves it; one with a path takes its own query, or none.
  const urlSearch=url=>{const path=url.split('#')[0];return !path?query:path.includes('?')?path.slice(path.indexOf('?')):'';};
  const location={pathname:'/',get href(){return 'https://radio.test/'+query+current;},get search(){return query;},get hash(){return current;},set hash(value){current=value&&!value.startsWith('#')?'#'+value:value;entries.splice(++at,Infinity,{state:null,hash:current,search:query});}};
  const move=url=>{if(url!==undefined){query=urlSearch(url);current=urlHash(url);}};
  const history={get state(){return entries[at].state;},get length(){return entries.length;},
    pushState(state,_title,url){move(url);entries.splice(++at,Infinity,{state,hash:current,search:query});},
    replaceState(state,_title,url){move(url);entries[at]={state,hash:current,search:query};},
    go(delta){if(!delta)throw new Error('history.go(0) reloads the page');if(!entries[at+delta])return;at+=delta;({hash:current,search:query}=entries[at]);window.emit('popstate');},
    back(){this.go(-1);}};
  // Media queries listed in `media` match; a test flips one with env.queries.get(query).change(matches).
  const queries=new Map();
  const env={Element,intervals,observers:[],clock,elements,audio,actions,timers,mediaSession,document,window,location,history,imageRequests,queries,requests:[],discoveryRequests:[],historyRequests:[],namesRequests:[],changesRequests:[],airRequests:[],response:status('First'),
    entries:()=>entries.map(entry=>entry.hash),urls:()=>entries.map(entry=>location.pathname+entry.search+entry.hash),url:()=>location.pathname+query+current,position:()=>at,evict(n){entries.splice(0,n);at-=n;},
    visit(target){location.hash=target;window.emit('popstate');window.emit('hashchange');},
    click:()=>elements.play.emit('click'),
    setLanguage:value=>elements.language.emit('click',{target:{value}}),
    focus:target=>document.emit('focusin',{target}),
    pointer:()=>document.emit('pointerdown',{}),
    // A key goes down: the document's listeners hear it first, then the window's, as it bubbles in a browser. A printable
    // key comes through extra ({key:'5'}).
    key(code,target=control('body'),extra={}){const event={code,key:code==='Space'?' ':code,target,repeat:false,ctrlKey:false,metaKey:false,altKey:false,isComposing:false,prevented:false,defaultPrevented:false,preventDefault(){event.prevented=event.defaultPrevented=true;},...extra};document.emit('keydown',event);window.emit('keydown',event);return event;},change:id=>elements.moods.emit('change',{target:{value:id}}),
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
  const context={Date:FakeDate,URL,URLSearchParams,CustomEvent:class{constructor(type){this.type=type;}},performance:{now:()=>clock.now},document,navigator:{mediaSession,connection:{saveData}},window,location,history,MediaMetadata,AbortController,
    matchMedia:query=>queries.get(query)||queries.set(query,{matches:media.includes(query),listeners:[],addEventListener(_name,fn){this.listeners.push(fn);},change(matches){this.matches=matches;for(const fn of this.listeners)fn();}}).get(query),Image:class extends Element {constructor(){super();env.preloader=this;}},
    localStorage:storage,
    // A test calls an observer's fn as the browser would after a resize; disconnect() stops it.
    ResizeObserver:class{constructor(fn){this.fn=fn;this.targets=[];env.observers.push(this);}observe(el){this.targets.push(el);}disconnect(){this.targets=[];}},
    // Computed styles as a test sets them on an element (el.computed), and no custom property.
    getComputedStyle:el=>({getPropertyValue:()=>'',...el.computed}),
    // env.discovery is one reply for every discovery path, or a function of the path; env.historyReply, once set, answers History the same way;
    // env.names, once set, holds the names document of each kind, or is a function of the path and the signal; env.changes,
    // once set, answers each page of a station's changes as a function of the path, and until then every station has none
    // yet (each page asked is counted in env.changesRequests either way); env.air, once set, answers each
    // station's /api/radio/<id> as a function of its id (data, null for a failed answer, or a promise of either), for the
    // page's own poll too, as the server does unless the data names another stage, and drops one aborted.
    fetch:(url,{signal})=>/^\/api\/radio\/[a-z-]+$/.test(url)&&env.air ? (()=>{const id=url.split('/').pop();env.airRequests.push({id,at:clock.now,signal});
      return new Promise((resolve,reject)=>{signal?.addEventListener('abort',()=>reject(new Error('aborted')));Promise.resolve(env.air(id)).then(data=>resolve({ok:Boolean(data),json:async()=>data&&{stage:{id},...data}}),reject);});})() :
      url.includes('/changes?') ? (env.changesRequests.push({url,signal}),Promise.resolve(env.changes?env.changes(url,signal):{trackingSince:null,changes:[],next:null}).then(data=>({ok:Boolean(data),json:async()=>data}))) :
      url.startsWith('/api/discovery/') ? (env.discoveryRequests.push({url,signal}),Promise.resolve(typeof env.discovery==='function'?env.discovery(url):env.discovery).then(data=>({ok:Boolean(data),json:async()=>data}))) :
      url.startsWith('/api/library/names?')&&env.names ? (env.namesRequests.push({url,signal}),Promise.resolve(typeof env.names==='function'?env.names(url,signal):env.names[new URL(url,'http://radio').searchParams.get('kind')]).then(data=>({ok:Boolean(data),json:async()=>data}))) :
      url.includes('/history?')&&env.historyReply ? (env.historyRequests.push({url,signal}),Promise.resolve(env.historyReply(url)).then(data=>({ok:Boolean(data),json:async()=>data}))) : url.startsWith('/api/audience?') ? (env.audienceCalls++,Promise.resolve(env.audienceHold).then(()=>({ok:!(env.audienceResponse instanceof Error),json:async()=>env.audienceResponse || env.response.audience}))) : new Promise((resolve,reject)=>{
      env.requests.push({url,signal,resolve,reject});
      if(!deferFetch){if(env.response instanceof Error)reject(env.response);else env.complete(env.requests.length-1,env.response);}
    }),
    setTimeout:(fn,delay)=>{timers.set(++timerID,{fn,delay});return timerID;},clearTimeout:id=>timers.delete(id),
    // A frame is a timer a test fires as env.fire('frame').
    requestAnimationFrame:fn=>{timers.set(++timerID,{fn,delay:'frame'});return timerID;},
    setInterval:fn=>intervals.push(fn),
  };
  runInNewContext(source,context);
  env.run=code=>runInContext(code,context);
  if(journey){elements['discovery-query'].value='';elements['history-day'].value='';elements['history-day'].validity={valid:true};elements['index-query'].value='';
    // The Index's head is static markup: its two sides and its two orders.
    for(const side of ['artists','labels'])elements['index-sides'].append(Object.assign(new Element(),{localName:'a',dataset:{side}}));
    for(const by of ['name','tracks'])elements['index-order'].append(Object.assign(new Element(),{localName:'a',dataset:{by}}));
    // The rail is static markup too: a nav that holds the marks.
    elements['index-rail'].append(Object.assign(new Element(),{localName:'div',className:'rail-marks'}));runInContext(web('closeness.js'),context);runInContext(web('journey.js'),context);}
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
 e.change('03');await flush();e.audio.emit('waiting');assert.equal(e.elements['playback-status'].textContent,'Buffering…','a station change only shows: the music heard stays as it was');
 e.elements['play-shown'].emit('click');await flush();e.audio.emit('waiting');assert.equal(e.elements['playback-status'].textContent,'Connecting…','play on the station shown connects again');
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

test('a lost stream keeps trying on a bounded ladder, and a click pauses it; blocking and cancellation',async()=>{
 const e=setup();await flush();e.click();
 for(const delay of [1000,2000,4000,8000,15000,15000,15000]){e.error();e.error();assert.equal(e.timers.size,1);assert.equal(e.elements['playback-status'].textContent,'Reconnecting…');e.fire(delay);}
 assert.equal(e.elements['playback-status'].textContent,'Reconnecting…','each new try keeps saying Reconnecting, never Connecting');
 e.audio.emit('waiting');assert.equal(e.elements['playback-status'].textContent,'Reconnecting…');
 assert.equal(e.elements.play.getAttribute('aria-label'),'Pause');assert.equal(e.audio.src,'/stream/palac-feel.mp3');
 e.click();assert.equal(e.elements.player.dataset.state,'paused');assert.equal(e.audio.src,undefined);assert.equal(e.timers.size,0);
 e.click();e.audio.calls.at(-1).reject(Object.assign(new Error(),{name:'NotAllowedError'}));await flush();
 assert.equal(e.elements['playback-status'].textContent,'Press play to start');assert.equal(e.timers.size,0);
 e.click();e.error();e.click();assert.equal(e.timers.size,0);assert.equal(e.audio.src,undefined);
 e.click();e.audio.emit('waiting');e.fire(20000);assert.equal(e.elements.player.dataset.state,'retrying');e.click();
});

test('active and paused station changes, stale play rejection and timer reset',async()=>{
 const e=setup();await flush();e.click();const old=e.audio.calls[0];
 e.response=status('Dance',3);e.change('03');await flush();
 assert.deepEqual([e.audio.src,e.audio.calls.length,e.elements['player-title'].textContent,e.mediaSession.metadata.album],['/stream/palac-feel.mp3',1,'First','Lost in Feelings · Pałac'],'an active change keeps the stream, the bar and the lock screen of the station heard');
 e.elements['play-shown'].emit('click');
 old.reject(Object.assign(new Error(),{name:'NotAllowedError'}));await flush();e.playing();
 assert.equal(e.audio.src,'/stream/palac-dance.mp3');assert.equal(e.elements['player-title'].textContent,'Dance');
 assert.equal(e.mediaSession.metadata.album,'Night in Motion · Pałac','the lock screen names the stage after the station');
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

// Two stations inside the page: the one shown and the one tuned. They are one for now, so the page behaves as before.
test('the page asks one /api/radio request per poll while the station shown and the station tuned are one',async()=>{
 const e=setup({deferFetch:true});await flush();const radio=()=>e.requests.filter(r=>r.url.startsWith('/api/radio/')),title=()=>e.elements['player-title'].textContent;
 assert.deepEqual(radio().map(r=>r.url),['/api/radio/palac-feel'],'the start asks once');
 let tick=e.poll();await flush();assert.equal(radio().length,1,'a tick while the station has not answered asks nothing more');
 e.complete(0,status('First'));await tick;await flush();assert.equal(e.elements['player-title'].textContent,'First');
 let said=0;e.window.addEventListener('pavoia:radio',()=>{said++;});
 for(const n of [2,3,4]){
  let answered=false;tick=e.poll();assert.equal(typeof tick?.then,'function','a tick returns its promise');tick.then(()=>{answered=true;});await flush();
  assert.deepEqual([radio().length,radio().at(-1).url,answered],[n,'/api/radio/palac-feel',false],'each 10 s tick asks once, and waits for the answer');
  const before=said;e.complete(n-1,status('Track '+n));await tick;assert.equal(title(),'Track '+n,'its answer is in the bar when the tick ends');
  assert.equal(said-before,1,'an answer is announced once, so the explorer draws the player once');
 }
 tick=e.poll();await flush();const left=radio().at(-1);
 e.change('03');
 assert.deepEqual([left.signal.aborted,radio().length,radio().at(-1).url,title()],[true,6,'/api/radio/palac-dance','Loading track…'],'a station change drops the old station\'s request and asks the new one once');
 left.resolve({ok:true,json:async()=>({...status('Old'),stage:{id:'palac-feel'}})});await tick;await flush();
 assert.equal(title(),'Loading track…','the old station\'s late answer writes nothing');
 e.complete(5,status('Dance'));await flush();assert.equal(title(),'Dance');
 e.change('04');
 assert.deepEqual([radio().length,radio().at(-1).url,title()],[7,'/api/radio/palac-feel','Loading track…'],'back on a station, its record was forgotten: it loads again');
 e.change('03');e.change('04');e.complete(6,status('Old'));await flush();
 assert.deepEqual([radio().length,title()],[9,'Loading track…'],'a dropped request\'s late answer writes nothing while the same station asks again');
 e.complete(8,status('Feelings'));await flush();assert.equal(title(),'Feelings');
});

test('getState names the station shown and the station tuned',async()=>{
 const e=setup({journey:true});await flush();const s=()=>e.window.Pavoia.getState(),both=()=>[s().viewing,s().stage,s().apart];
 assert.deepEqual(both(),['palac-feel','palac-feel',false],'one station at the start');
 assert.deepEqual(s().viewingTrack,{id:'123',title:'First',artist:'Artist First'},'the track the station shown answered');
 e.response=status('Dance');e.change('03');await flush();assert.deepEqual([...both(),s().viewingTrack?.title],['palac-dance','palac-dance',false,'Dance'],'after a rail change');
 e.key('ArrowRight');await flush();assert.deepEqual(both(),['palac-feel','palac-feel',false],'after an arrow');
 e.key('Digit5',undefined,{key:'5'});await flush();assert.deepEqual(both(),['etage-zero','etage-zero',false],'after 1 to 9');
 e.visit('#bus');await flush();assert.deepEqual(both(),['etage-zero','etage-zero',false],'on the Bus');
 e.discovery=url=>url.includes('/search?')?{items:[]}:{entity:{id:'trk_0123456789ab',type:'track',title:'T',previewUrl:'/api/discovery/preview/trk_0123456789ab',connections:[]},included:[]};
 e.elements['preview-audio'].play=async()=>{};e.click();e.playing();
 e.visit('#explore/trk_0123456789ab');await flush();e.elements['entity-inspector'].querySelector('.preview-toggle').emit('click');await flush();
 assert.equal(s().wanted,false,'the preview holds the radio');
 e.change('03');await flush();assert.deepEqual([...both(),s().wanted],['palac-dance','etage-zero',true,false],'a change during a preview shows the station, and the radio held stays on the station heard');
 e.response=new Error('Offline');await e.poll();
 assert.deepEqual([s().viewingTrack,s().track?.title,s().dataFresh],[null,'Dance',false],'a failed answer is no track on air for the station shown');
});

test('the play button is enabled at startup, before any station change',async()=>{
 const e=setup();
 assert.equal(e.elements.play.disabled,false,'the bar is drawn at startup, so the markup\'s disabled goes');
});

test('a language switch keeps the bar on what its station answered: loading, or its name after a failed answer',async()=>{
 const e=setup({deferFetch:true});await flush();const title=()=>e.elements['player-title'].textContent;
 assert.equal(title(),'Loading track…');
 e.setLanguage('de');assert.equal(title(),'Titel wird geladen…','a switch while the station has not answered still says it loads');
 e.requests[0].reject(new Error('Offline'));await flush();
 assert.equal(title(),'Lost in Feelings','a failed answer with no track known names the station');
 e.setLanguage('en');assert.equal(title(),'Lost in Feelings','a switch after it keeps the station\'s name, not No track announced');
 e.setLanguage('de');assert.equal(title(),'Lost in Feelings','in either language');
 assert.equal(e.mediaSession.metadata,null,'and the lock screen stays clear');
});

test('live audience updates independently and never presents missing data as zero',async()=>{
 const e=setup();await flush();const live=e.elements['live-text'],body=e.document.body;
 e.audienceResponse=status('Count',0).audience;await e.pollAudience();assert.equal(live.textContent,'Live','nobody listening shows no count');
 assert.equal(e.elements['live-label'].textContent,'0 listening to this station: Lost in Feelings','screen readers get the full sentence, zero included');assert.equal(body.getAttribute('data-on-air'),'');
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

test('native end/error ordering reconnects, and play on the station shown resets retry timers',async()=>{
 for(const ended of [true,false]){
  const e=setup();await flush();e.click();e.playing();
  e.audio.paused=true;e.audio.ended=ended;e.audio.error=ended?null:{code:2};e.audio.emit('pause');
  e.audio.emit(ended?'ended':'error');assert.equal(e.elements.player.dataset.state,'retrying');
  e.fire(1000);e.error();assert.ok([...e.timers.values()].some(t=>t.delay===2000));
  e.change('03');await flush();await flush();assert.deepEqual([...e.timers.values()].map(t=>t.delay),[2000],'a station change keeps the ladder of the station heard');
  e.elements['play-shown'].emit('click');await flush();await flush();assert.deepEqual([...e.timers.values()].map(t=>t.delay),[20000],'play on the station shown starts afresh');
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
 assert.equal(next.getAttribute('aria-label'),'Next photo, 1 of 3');assert.equal(e.elements['photo-count'].textContent,'1 / 3');
 next.emit('click');await flush();assert.equal(next.getAttribute('aria-label'),'Next photo, 2 of 3');assert.equal(e.elements['photo-count'].textContent,'2 / 3');
 e.setLanguage('de');assert.equal(next.getAttribute('aria-label'),'Nächstes Foto, 2 von 3');assert.equal(next.title,undefined);
 e.change('01');await flush();assert.equal(next.getAttribute('aria-label'),'Nächstes Foto, 1 von 8');
});

test('selected photos cycle on request and stage entry without changing playback',async()=>{
 const e=setup();await flush();e.click();e.playing();
 const first=e.elements.photo.src,seen=new Set([first]),audioCalls=e.audio.calls.length;
 assert.equal(e.elements['change-photo'].hidden,false);
 for(let i=0;i<2;i++){
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
 assert.equal(e.window.Pavoia.getState().stage,'palac-dance');assert.equal(e.mediaSession.metadata.album,'Night in Motion · Pałac');
 e.setLanguage('de');
 assert.equal(e.elements['mood-place'].textContent,'Irgendwo im Wald. Hier gibt es keine Playlist, du musst dabei sein.');
 e.location.hash='';e.window.emit('popstate');await flush();assert.equal(e.elements.photo.src,photo);
 e.location.hash='#bus';e.window.emit('popstate');
 e.elements.moods.emit('click',{target:{name:'mood',value:'03'}});
 assert.equal(e.location.hash,'');assert.equal(e.elements.photo.src,photo);assert.equal(e.audio.calls.length,calls);
 for(const target of [()=>e.elements['player-stage'].children[0],()=>e.elements['dock-artwork']]){
  e.location.hash='#bus';e.window.emit('hashchange');
  target().emit('click');
  assert.deepEqual([e.location.hash,e.audio.src,e.audio.calls.length,e.audio.paused,e.window.Pavoia.getState().stage,e.elements.photo.src],['',source,calls,false,'palac-dance',photo],'the door and the cover leave the Bus; the source, the play calls and the station stay');
 }
 const entries=e.urls().length;e.elements['dock-artwork'].emit('click');
 assert.deepEqual([e.urls().length,e.audio.src,e.audio.calls.length],[entries,source,calls],'on the station heard, the cover leads nowhere');
 e.location.hash='#bus';e.window.emit('hashchange');e.change('01');await flush();
 assert.deepEqual([e.location.hash,e.audio.src,e.audio.calls.length,e.window.Pavoia.getState().viewing],['',source,calls,'bermuda-day'],'a station picked on the Bus shows it, and the music goes on');
 e.elements['play-shown'].emit('click');assert.equal(e.audio.src,'/stream/bermuda-day.mp3','its play moves the music there');
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
 assert.equal(e.audio.src,'/stream/palac-feel.mp3','a change while playing keeps the stream of the station heard');
 assert.equal(e.elements.photo.src,original);
 e.change('01');assert.equal(e.audio.src,'/stream/palac-feel.mp3');
 e.elements['play-shown'].emit('click');assert.equal(e.audio.src,'/stream/bermuda-day.mp3','its play cuts at once, before the photo has loaded');
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
 e.openDialog={};e.key('ArrowRight');assert.equal(stage(),'palac-dance','the modal stations sheet keeps its arrows');
 e.openDialog=null;e.elements.explorer.open=true;e.key('ArrowRight');assert.equal(stage(),'palac-feel','the explorer leaves the arrows to the radio');
 e.elements.explorer.open=false;e.key('ArrowLeft');e.change('01');e.key('ArrowLeft');assert.equal(stage(),'essentials','the first station wraps to the last');
 e.click();e.playing();const calls=e.audio.calls.length,viewing=()=>e.window.Pavoia.getState().viewing;e.key('ArrowRight');
 assert.deepEqual([viewing(),stage(),e.audio.src,e.audio.calls.length],['bermuda-day','essentials','/stream/essentials.mp3',calls],'while it plays, an arrow only shows the station');
 e.actions.previoustrack();
 assert.deepEqual([stage(),viewing(),e.audio.src,e.audio.calls.length],['closing','closing','/stream/closing.mp3',calls+1],'previoustrack steps from the station heard, not the one shown, and plays it in one cut');
 e.key('ArrowLeft');e.actions.nexttrack();
 assert.deepEqual([stage(),viewing(),e.audio.src,e.audio.calls.length],['essentials','essentials','/stream/essentials.mp3',calls+2],'nexttrack too');
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
 assert.equal(rules.get('.player[data-state="error"] .play'),undefined,'no state ends the wanting but a pause or a blocked start');
 assert.doesNotMatch(web('app.js'),/Stream lost|Stream unterbrochen|retry:'/,'the give-up words and its Try again are gone from the player');
});

test('the bar names the stage, the tab names the record and Play names its key',async()=>{
 const e=setup();await flush();
 assert.equal(textOf(e.elements['player-stage']),'Lost in Feelings · Pałac');assert.equal(e.document.title,'Lost in Feelings · Pavoia Radio');
 assert.equal(e.elements.play.title,'Play (Space)');assert.equal(e.elements.play.getAttribute('aria-pressed'),null);
 e.click();assert.equal(e.elements.play.title,'Pause (Space)');assert.equal(e.document.title,'Lost in Feelings · Pavoia Radio','connecting is not playing yet');
 e.playing();assert.equal(e.document.title,'▶ First · Artist First · Pavoia Radio');assert.equal(e.elements['player-artist'].textContent,'Artist First');
 e.location.hash='#bus';e.window.emit('hashchange');
 const bar=e.elements['player-stage'],door=bar.children[0];
 assert.deepEqual([bar.children.length,door.localName,door.type,door.className,textOf(door),door.getAttribute('aria-label'),door.title,e.document.body.getAttribute('data-away')],[1,'button','button','stage-door','Tuned to Lost in Feelings',null,'Back to Lost in Feelings',''],'on the Bus while playing, the page is away, and the bar reads Tuned to, named by its words, described by its title');
 assert.deepEqual([door.children.length,door.children[0].localName,door.children[0].className,door.children[0].textContent,door.children[1]],[2,'span','stage-door-to','Tuned to ','Lost in Feelings'],'"Tuned to" has its own span, then the name');
 const english=door.children[0].textContent.length;
 e.click();assert.deepEqual([bar.children[0]===door,textOf(bar),door.title],[true,'Tuned to Lost in Feelings','Back to Lost in Feelings'],'paused on the Bus, it reads the same and is not drawn again');
 e.click();e.playing();e.location.hash='';e.window.emit('hashchange');
 assert.deepEqual([textOf(bar),e.document.body.getAttribute('data-away')],['Lost in Feelings · Pałac',null],'back on the station, the label is plain text again');
 e.response=new Error('Offline');e.change('03');await flush();
 assert.deepEqual([textOf(e.elements['player-stage']),e.elements['player-title'].textContent,e.document.title],['Tuned to Lost in Feelings','First','▶ First · Artist First · Pavoia Radio'],'while another station shows, the bar and the tab keep the station heard');
 e.response={track:null,audience:status('None').audience};await e.poll();
 assert.deepEqual([e.elements['player-title'].textContent,e.document.title],['No track announced','Lost in Feelings · Pavoia Radio'],'with no track on the station heard, the tab names it, not the station shown');
 e.response=new Error('Offline');e.elements['play-shown'].emit('click');await flush();
 assert.equal(textOf(e.elements['player-stage']),'Night in Motion · Pałac');assert.equal(e.elements['player-title'].textContent,'Night in Motion','a failed metadata call names the station');
 assert.equal(e.elements['player-artist'].textContent,'','the artist line does not repeat it');
 e.setLanguage('de');assert.equal(e.elements.play.title,'Pause (Leertaste)');
 e.click();assert.equal(e.elements.play.title,'Abspielen (Leertaste)');assert.equal(e.document.title,'Night in Motion · Pavoia Radio');
 e.location.hash='#bus';e.window.emit('hashchange');
 assert.deepEqual([textOf(e.elements['player-stage']),e.elements['player-stage'].children[0].title],['Sender: Night in Motion','Zurück zu Night in Motion'],'in German');
 assert.deepEqual([e.elements['player-stage'].children[0].children[0].className,e.elements['player-stage'].children[0].children[0].textContent],['stage-door-to','Sender: '],'its own span in German too');
 assert.ok(e.elements['player-stage'].children[0].children[0].textContent.length<=english,'the German word is no longer than the English one, so the waveform keeps its room in the one-row bar');
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
 assert.match(rules.get(':is(.player .credited-artists, .stage-row):is([data-before], [data-more])'),/mask-image:linear-gradient\(to right, var\(--before\) 6px.*var\(--more\) calc\(100% - 6px\)\)/,'one fade per side where names wait');
 assert.match(rules.get(':is(.player .credited-artists, .stage-row):has(:focus-visible)'),/mask-image:none/,'a focused name is never faded, nor its ring');
 assert.match(rules.get(':is(.player .credited-artists, .stage-row)[data-before]'),/--before:transparent/);assert.match(rules.get(':is(.player .credited-artists, .stage-row)[data-more]'),/--more:transparent/);
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
 assert.match(phone.get('.player'),/grid-template-columns:44px 44px minmax\(0,1fr\);.*padding:12px var\(--gutter\) calc\(11px \+ env\(safe-area-inset-bottom\)\)/,'the cover starts on the gutter');
 assert.match(phone.get('.poster'),/padding:clamp\(180px,30svh,300px\) var\(--gutter\) 24px/,'where the stage title starts');
 assert.match(phone.get('.player:not([data-status=paused],[data-status=playing]) #playback-status'),/padding:8px var\(--gutter\);/,'Connecting… and the other transient words start on the cover\'s edge too');
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

test('the radio page reads one size per line and one underline, and the Bus shows its name in the sheet only',()=>{
 const rules=cssRules(),mid=cssRules('(min-width:860px)'),phone=cssRules('(max-width:760px)');
 assert.match(rules.get('.player-credits'),/font:12px Inter,sans-serif/);
 assert.match(rules.get('.player .artist-credit span'),/font-size:inherit/,'the artist line stays 12px, a credited link or plain text');
 // From 860px the action line holds the larger words in German with a 12-photo count and a classic scrollbar. Narrower,
 // it keeps the sizes that hold it on one line, so the station title never moves.
 assert.match(rules.get('.stage-action'),/font-size:14px/);
 assert.match(mid.get('.change-photo, #photo-count'),/font:14px Inter,sans-serif; font-variant-numeric:tabular-nums/,'Next photo, its count and Photo only read 14px, like the playlist link, in figures of one width');
 assert.deepEqual(ordered().filter(([,list,declarations])=>list.split(/,\s*/).includes('#photo-count')&&/(?<![\w-])color:/.test(declarations)),[],'the count takes its button\'s colour at every width, so it brightens with Next photo on hover');
 for(const selector of ['.change-photo','#photo-count'])assert.ok(lastAt('(min-width:860px)',selector)>lastAt('',selector),'the 860px rule comes after the rule it overrides: '+selector);
 assert.match(rules.get('.change-photo'),/font:12px Inter,sans-serif/);assert.match(rules.get('#photo-count'),/font:11px var\(--mono\)/);assert.match(phone.get('.change-photo'),/font:12px\/18px Inter,sans-serif/,'narrower, the line keeps the sizes it had');
 assert.match(rules.get('a[target="_blank"]:not(.stage-spotify)::after, .stage-spotify>span:first-child::after'),/display:inline-block/,'the arrow is its own box, so the underline stops at the words');
 assert.match(rules.get('.record-sleeve'),/opacity:\.55;/,'the sleeve\'s printed type stays behind the title');
 // The Bus's group word names it on the rail at every width, so its own name shows in the sheet's row only.
 assert.match(rules.get('.spotify-caption, .special-name'),/display:none/,'the rail shows the bus alone');
 assert.match(phone.get('#stations-sheet .special-name'),/display:inline/,'the sheet\'s row names it');
 assert.deepEqual(ordered().filter(([media,list])=>media!=='(max-width:760px)'&&list.includes('special-name')).map(([media,list])=>media+' '+list),[' .spotify-caption, .special-name'],'no wider rule shows the name after the bus');
 assert.match(rules.get('#language'),/margin-right:-15px/,'the DE word ends on the gutter');assert.match(rules.get('#language button'),/min-width:44px; min-height:44px/,'and each button keeps 44px');
 const values=property=>new Set([...web('style.css').replace(/\/\*[\s\S]*?\*\//g,'').matchAll(new RegExp('(?<![\\w-])'+property+':([^;}]+)','g'))].map(m=>m[1].trim()));
 assert.deepEqual([...values('text-underline-offset')],['3px'],'one underline offset');
 assert.deepEqual([...values('border-radius')].sort(),['0','18px 18px 0 0','2px','50%','inherit'],'square, 2px corners, circles, and the sheet\'s top');
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
 assert.match(cssRules('(max-width:760px)').get('.stage-spotify>span:not(.spotify-caption), .spotify-daily'),/display:none/,'phones keep the Playlist tile alone');
 for(const gone of ['bus-copy','bus-line','busLine','sleeve-empty','painted-artist-secondary','.secondary','showArtwork','standby',"offline:'Data","offline:'Daten",'audienceUnknown'])
  for(const name of ['index.html','app.js','journey.js','style.css'])assert.ok(!web(name).includes(gone),gone+' is gone from '+name);
});

test('the sleeve clears the text column, which sits in a darker pool',()=>{
 const rules=cssRules(),phone=cssRules('(max-width:760px)');
 assert.match(rules.get('.record-sleeve'),/left:28%/);
 assert.match(rules.get('.listen-layout::after'),/background:radial-gradient\(ellipse 60% 55% at 0% 70%,rgb\(11 10 9 \/ \.6\),transparent\),linear-gradient\(/,'the pool is in front of the old gradient');
 assert.match(rules.get('.listen-layout::after'),/linear-gradient\(180deg,rgb\(11 10 9 \/ \.75\),rgb\(11 10 9 \/ \.6\) 90px,rgb\(11 10 9 \/ \.25\) 160px,rgb\(11 10 9 \/ var\(--dip, 0\)\) 30%,rgb\(11 10 9 \/ var\(--mid, \.2\)\) 45%,rgb\(11 10 9 \/ \.92\) 100%\)/,'the header band is as dark as on phones, so a cover or a pale sky cannot show through the status');
 assert.match(rules.get('.listen-layout:has(#moods[data-wraps])'),/--dip:\.25; --mid:\.5;/,'where the rail wraps, the band rises with its higher rows: no gap above it, a darker middle');
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

test('a link or a remembered station cuts to its photo, and a change after that fades',async()=>{
 const e=setup({search:'?station=etage-zero'}),fades=[];
 for(const id of ['photo','photo-buffer'])e.elements[id].animate=(frames,options)=>{fades.push(options);return {cancel(){},finished:Promise.resolve()};};
 await flush();assert.equal(fades.length,0,'the opening photo replaces the page photo with no dissolve');
 e.change('03');await flush();assert.equal(fades.length,1,'a station change fades as before');
});

test('Essentials reads like every station, and the Bus closes the stages by stage and the rail by feeling',async()=>{
 const e=setup();await flush();const moods=e.elements.moods,bus=e.elements['bus-link'];
 const groups=()=>moods.children.slice(1),holder=node=>groups().find(group=>group.descendants().includes(node));
 const essentials=moods.descendants().find(n=>n.className==='mood'&&n.querySelector('input').value==='05'),last=group=>group.descendants().filter(n=>n.className==='mood').at(-1);
 assert.deepEqual([groups().indexOf(holder(bus)),groups().length,holder(essentials)===groups().at(-1),last(holder(essentials))===essentials],[5,7,true,true],'by stage the Bus is the last stage, before Gaende\'s selections, which Essentials closes');
 assert.deepEqual(holder(bus).children.at(-1).children,[bus],'the bus stands alone over its word');
 e.elements.ways.children[0].emit('click');
 assert.deepEqual([groups().indexOf(holder(bus)),groups().length,groups().indexOf(holder(essentials)),last(holder(essentials))===essentials],[3,4,2,true],'by feeling it closes the rail, after Any time, which Essentials closes');
 assert.notEqual(essentials.querySelector('span').className,'visually-hidden','its name is visible');
 assert.equal(essentials.title,'The tracks I keep coming back to','its tooltip is its line, like every station');
 assert.match(web('index.html'),/<\/div>\s*<a class="bus-link" id="bus-link" href="#bus" aria-label="The Bus" aria-describedby="line-bus" title="The Bus">\s*<svg viewBox="0 0 24 24" width="18" height="18"[^>]*stroke-width="1.5"/,'an 18px bus, named on hover, after the switch until the page groups it');
 const rules=cssRules(),phone=cssRules('(max-width:760px)');
 assert.match(phone.get('#stations-sheet :is(.mood span, .bus-link)::after'),/display:none/,'the sheet\'s rows carry no rail underline');
 assert.match(rules.get('.essentials-icon'),/width:14px; height:14px;.*stroke-width:1.5/,'a small heart before the name');
 assert.match(rules.get('body:not([data-bus]) .mood-essentials:has(input:checked) .essentials-icon'),/fill:currentColor/,'the heart fills when chosen, except in the Bus scene');
 assert.ok(![...rules.keys()].includes('.mood-essentials:has(input:checked) .essentials-icon'),'no filled heart beside the current bus');
 assert.match(rules.get('.mood-essentials:has(input:focus-visible)'),/outline:2px solid var\(--cream\)/,'the keyboard ring frames the heart with the name');
 assert.match(rules.get('.mood-essentials:has(input:focus-visible) span'),/outline:none/);
 for(const [selector,body] of rules)if(selector.includes('essentials'))assert.doesNotMatch(body,/--red|width:28px/,'checked Essentials is cream like every station: '+selector);
 assert.doesNotMatch(rules.get('.bus-link'),/opacity/,'the bus is not dimmed');
 assert.match(rules.get('.mood:has(input:checked) span::after, .bus-link[aria-current]::after, .ways [aria-pressed=true] span::after'),/transform:scaleX\(1\)/,'the current bus takes the station underline');
 for(const name of ['index.html','app.js','style.css'])for(const gone of ['special-tag','data-copy="special"','special:','Besonders'])assert.ok(!web(name).includes(gone),gone+' is gone from '+name);
});

test('the Bus scene shows one current mark, and the red dot marks the stage you hear',()=>{
 const rules=cssRules(),phone=cssRules('(max-width:760px)');
 assert.match(rules.get('body[data-bus] .mood:has(input:checked):not(:hover)'),/color:var\(--soft\)/,'the stage that keeps playing goes back to rest');
 assert.match(rules.get('body[data-bus] .mood:has(input:checked) span::after'),/transform:scaleX\(0\)/,'and loses its underline');
 assert.match(phone.get('body:not([data-bus]) #stations-sheet .mood:has(input:checked), #stations-sheet .bus-link[aria-current]'),/^\s*background:rgb\(240 237 229 \/ \.06\);\s*$/,'a checked row gets only the background, and only the Bus row in its scene');
 assert.match(phone.get('body[data-wanted] #stations-sheet .mood[data-hearing]::after'),/content:""; grid-area:1 \/ 3 \/ 3; align-self:center; width:6px; height:6px; border-radius:50%; background:var\(--red\)/,'the sheet dot marks the station heard while its sound is wanted, in red, in its own grid area');
 assert.ok(![...phone.keys()].some(selector=>selector.includes('#stations-sheet .mood')&&selector.endsWith('::after')&&selector.includes(':not([data-bus])')),'and shows on the Bus too');
 assert.ok(!phone.has('#stations-sheet .mood[data-hearing]::after')&&!phone.has('#stations-sheet .mood:has(input:checked)::after'),'no dot at rest');
 assert.match(rules.get('.poster .mood > span::before'),/content:""; position:absolute; top:50%; right:calc\(-1 \* var\(--s1\) - 6px\); width:6px; height:6px; margin-top:-2px; border-radius:50%; background:var\(--red\); opacity:0;/,'the rail dot waits unseen in the gap after the name, nearer to its own name than to the next, out of the flow, so no name moves');
 assert.match(rules.get('.poster .mood:has(input:focus-visible) > span::before'),/^\s*right:calc\(-1 \* var\(--s2\) - 6px\);\s*$/,'under the keyboard the dot steps clear of the ring');
 assert.match(rules.get('body[data-wanted] .poster .mood[data-hearing] > span::before'),/^\s*opacity:1;\s*$/,'and shows on the station heard while its sound is wanted, on the Bus too');
 assert.ok(![...rules.keys()].some(selector=>selector.includes('span::before')&&selector.includes('data-bus')),'no Bus exception for the rail dot');
 assert.match(rules.get('#player-stage:has(.stage-door)'),/^\s*overflow:visible;\s*$/,'the bar\'s label lets the door\'s focus ring out');
 assert.match(rules.get('.stage-door'),/padding:0 0 var\(--s1\); margin-bottom:calc\(-1 \* var\(--s1\)\);/,'the door keeps 4px under its words for its underline, and gives them back, so the label stays 14px high');
 assert.match(cssRules('(min-width:761px) and (max-width:1100px)').get('.player .stage-door-to'),/^\s*position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset\(50%\);\s*$/,'where the bar\'s column would cut the name, the door shows the name alone, and keeps "Tuned to" for screen readers');
 assert.match(rules.get('.stage-door'),/display:block; max-width:100%;.*color:var\(--soft\); font:inherit; letter-spacing:inherit; text-transform:inherit;.*overflow:hidden; text-overflow:ellipsis; white-space:nowrap; cursor:pointer;/,'the door keeps the label\'s letters, a step brighter, and cuts its own words');
 assert.match(rules.get('.stage-door:is(:hover, :focus-visible)'),/color:var\(--cream\); text-decoration:underline; text-underline-offset:3px;/,'cream and underlined under a pointer or the keyboard');
 assert.match(rules.get('body[data-away] .player .dock-artwork'),/^\s*cursor:pointer;\s*$/,'away, the cover leads back too');
 for(const [selector,body] of phone)if(selector.includes('#stations-sheet'))assert.doesNotMatch(body,/margin-left/,'no margin hack: '+selector);
});

test('each station has one line: a second line in the sheet, a tooltip on the rail, in both languages',async()=>{
 const e=setup();await flush();
 const lines=()=>Object.fromEntries(e.document.querySelectorAll('.mood').map(label=>[label.querySelector('input').value,[label.querySelector('.sheet-line').textContent,label.title]]));
 const expected=list=>Object.fromEntries(list.map((line,i)=>['0'+(i+1),[line,line]]));
 assert.deepEqual(lines(),expected(['Sunny, groovy open-air warm-up','Bright and melodic, building up','Driving peak-time dance music','Melancholic, hypnotic and deep','The tracks I keep coming back to','Hard techno and hard trance','Happy house for daylight','Ambient, to lie down and rest','Tracks to close a set']));
 e.setLanguage('de');
 assert.deepEqual(lines(),expected(['Sonnig, groovig, zum Aufwärmen','Hell und melodisch, steigend','Treibende Peak-Time-Musik','Melancholisch, hypnotisch, tief','Tracks, zu denen ich zurückkehre','Hard Techno und Hard Trance','Fröhlicher House bei Tageslicht','Ambient, zum Hinlegen','Tracks zum Ende eines Sets']));
 for(const label of e.document.querySelectorAll('.mood')){
  const input=label.querySelector('input'),line=label.querySelector('.sheet-line');
  assert.deepEqual([input.getAttribute('aria-describedby'),line.getAttribute('aria-hidden')],[line.id,'true'],'the line describes the radio and stays out of its name: '+input.value);
 }
 const html=web('index.html');
 assert.match(html,/<small class="sheet-line" id="line-bus" aria-hidden="true" data-copy="notStreamed">Not streamed\. You have to be there\.<\/small>/,'the Bus row says why it has no radio, as the link\'s description');
 assert.equal(e.run('words.de.notStreamed'),'Nicht im Radio. Du musst dabei sein.');
 assert.match(html,/<legend class="visually-hidden" data-copy="choose">Choose a station<\/legend>/,'the legend uses the visible word');
 assert.deepEqual([e.run('words.en.choose'),e.run('words.de.choose')],['Choose a station','Wähle einen Sender']);
 const rules=cssRules(),phone=cssRules('(max-width:760px)');
 assert.match(rules.get('.station-switcher, .station-position, .mood-preview, .sheet-line, .change-photo svg'),/display:none/,'the rail shows no second line');
 assert.match(phone.get('#stations-sheet .sheet-line'),/display:block; grid-area:2 \/ 2; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font:12px\/16px Inter,sans-serif; color:var\(--muted\)/);
 assert.match(phone.get('#stations-sheet .mood, #stations-sheet .bus-link'),/display:grid; grid-template-columns:48px minmax\(0,1fr\) auto;.*min-height:64px/,'rows stay 64px');
 assert.match(phone.get('#stations-sheet :is(.mood-preview, .essentials-icon, .bus-link svg)'),/grid-area:1 \/ 1 \/ 3/,'the picture spans both lines');
});

test('the sheet opens on the current stage, or on the Bus in its scene, and closes with a plain Close',async()=>{
 const e=setup();await flush();const open=()=>{e.elements['stations-sheet'].open=false;e.elements['open-stations'].emit('click');};
 open();assert.equal(e.document.activeElement,e.document.querySelector('input[value="04"]'),'focus lands on the checked stage, not on ✕');
 e.change('03');open();assert.equal(e.document.activeElement,e.document.querySelector('input[value="03"]'));
 e.location.hash='#bus';e.window.emit('hashchange');open();assert.equal(e.document.activeElement,e.elements['bus-link'],'in the Bus scene, on the bus');
 assert.match(web('index.html'),/<button id="close-stations" type="button" aria-label="Close">/);
 assert.equal(e.elements['close-stations'].getAttribute('aria-label'),'Close');e.setLanguage('de');assert.equal(e.elements['close-stations'].getAttribute('aria-label'),'Schließen');
 const rules=cssRules();
 assert.match(rules.get('#stations-sheet'),/transform:translateY\(12px\)/,'a short rise');
 assert.match(web('style.css'),/@starting-style \{ #stations-sheet\[open\] \{ opacity:0; transform:translateY\(12px\); \} #stations-sheet\[open\]::backdrop \{ opacity:0; \} \}/);
 assert.match(rules.get('#stations-sheet::backdrop'),/opacity:0; transition:opacity var\(--panel\) ease, display var\(--panel\) allow-discrete, overlay var\(--panel\) allow-discrete/,'the backdrop fades in like the explorer\'s');
 assert.match(rules.get('#stations-sheet[open]::backdrop'),/opacity:1/);
});

test('the counter carries the swipe arrows, shows numbers and says the stage in words',async()=>{
 const html=web('index.html');
 assert.match(html,/<span class="station-position" id="station-position" aria-live="polite" aria-atomic="true"><svg [^>]*aria-hidden="true"><path d="m5 3-4 4 4 4m14-8 4 4-4 4M2 7h20"\/><\/svg><span id="station-text" aria-hidden="true">4 \/ 9<\/span><span id="station-label" class="visually-hidden">Station 4 of 9, Lost in Feelings, Pałac stage<\/span><\/span>/);
 for(const name of ['index.html','app.js','style.css'])for(const gone of ['swipe-hint','swipeHint'])assert.ok(!web(name).includes(gone),gone+' is gone from '+name);
 const e=setup();await flush();const label=e.elements['station-label'];
 assert.deepEqual([e.elements['station-text'].textContent,label.textContent],['4 / 9','Station 4 of 9, Lost in Feelings, Pałac stage']);
 assert.equal(e.elements['station-position'].getAttribute('aria-label'),null,'the live region reads its words, not a label');
 e.change('03');assert.deepEqual([e.elements['station-text'].textContent,label.textContent],['3 / 9','Station 3 of 9, Night in Motion, Pałac stage']);
 e.setLanguage('de');assert.equal(label.textContent,'Sender 3 von 9, Night in Motion, Bühne Pałac');
 assert.match(cssRules('(max-width:760px)').get('.station-position'),/display:flex; align-items:center; gap:6px/,'the arrows sit before the numbers');
 assert.match(cssRules('(max-width:374px)').get('.station-position svg'),/display:none/,'narrow phones drop the arrows, so the controls stay on one line');
});

test('a first visit opens on Lost in Feelings, a returning listener on the last station, and a link on its own station',async()=>{
 // The station, the position, the address and the entry count after startup, with a stored station and a query.
 const open=async(stored,search='',hash='')=>{const e=setup({search,hash,storage:{getItem:key=>key==='pavoia-station'?stored:null,setItem(){}}});await flush();
  return [e.window.Pavoia.getState().stage,e.elements['station-text'].textContent,e.url(),e.entries().length];};
 assert.deepEqual(await open(null),['palac-feel','4 / 9','/?station=palac-feel',1],'a first visit: Lost in Feelings, as the page HTML shows, and the address names it in place');
 assert.deepEqual(await open('fontanna'),['fontanna','6 / 9','/?station=fontanna',1],'a returning listener: the last station');
 assert.deepEqual(await open(null,'?station=etage-zero'),['etage-zero','5 / 9','/?station=etage-zero',1],'a link: its own station');
 assert.deepEqual(await open('fontanna','?station=closing'),['closing','8 / 9','/?station=closing',1],'a link wins over memory');
 assert.deepEqual(await open('fontanna','?station=nope&n=2'),['fontanna','6 / 9','/?station=fontanna&n=2',1],'an unknown link falls back to memory, and its value is rewritten in place');
 assert.deepEqual(await open(null,'?n=1'),['palac-feel','4 / 9','/?n=1&station=palac-feel',1],'other parameters stay, and the station comes last');
 assert.deepEqual(await open(null,'?station=fontanna','#bus'),['fontanna','6 / 9','/?station=fontanna#bus',1],'the hash keeps its meaning: the Bus, with the linked station behind it');
 for(const value of ['bus','04','toString','__proto__','','Fontanna','FONTANNA',' fontanna','fontanna/']){
  assert.deepEqual(await open('fontanna','?station='+encodeURIComponent(value)),['fontanna','6 / 9','/?station=fontanna',1],`the link "${value}" is not a station`);
  assert.deepEqual(await open(value),['palac-feel','4 / 9','/?station=palac-feel',1],`the stored "${value}" is not a station`);
 }
 const denied=()=>{throw new Error('Storage denied');};
 for(const [search,stage] of [['','palac-feel'],['?station=etage-zero','etage-zero']]){
  const e=setup({search,storage:{getItem:denied,setItem:denied}});await flush();
  assert.deepEqual([e.window.Pavoia.getState().stage,e.url()],[stage,'/?station='+stage],'a storage that throws: the link works, and without one the radio opens on Lost in Feelings');
  e.change('09');e.click();assert.deepEqual([e.window.Pavoia.getState().stage,e.url(),e.audio.src],['closing','/?station=closing','/stream/closing.mp3'],'and a change and a play still work');
 }
});

test('a stage\'s first photo shows under that stage alone',async()=>{
 const e=setup();await flush();const moods=e.run('moods');
 for(const mood of moods)for(const other of moods)if(other!==mood)assert.ok(!other.photos.some(photo=>photo.src===mood.photos[0].src),`${mood.photos[0].src} opens ${mood.stage} and also shows under ${other.stage}`);
 assert.equal(moods.find(mood=>mood.id==='04').photos.map(photo=>photo.src).join(),'photos/selected/p005.jpg,photos/selected/p204.jpg,photos/selected/p306.jpg');
});

test('every mood has a stage, so no Soon code and no rail scrolling remain',async()=>{
 const app=web('app.js');
 for(const gone of ['revealStation','soonSuffix',"'soon'",'is-soon','dataset.soon','data-soon'])assert.ok(!app.includes(gone),gone+' is gone');
 const e=setup();await flush();assert.equal(e.run('words.en.soon'),undefined);
 const small=cssRules('(max-width: 600px)');
 for(const selector of ['.moods','.mood-list','.mood','.mood + .mood::before'])assert.ok(!small.has(selector),selector+' has no phone override left');
});

// Two ways through the same nine stations. A press of the switch, the radios in the order of the DOM, the stations as
// the explorer reads them, and the rail's groups as [name, word, phrase, stations], where the Bus is "bus".
const press=(e,value)=>e.elements.ways.children.find(b=>b.value===value).emit('click');
const radios=e=>e.elements.moods.descendants().filter(n=>n.localName==='input').map(n=>n.value);
const stationIds=e=>[...e.window.Pavoia.stations].map(s=>s.id);
const groupsOf=e=>e.elements.moods.children.filter(n=>n.className==='mood-group').map(group=>{
 const [word,...rest]=group.children,list=rest.at(-1),phrase=rest.length>1?rest[0]:null;
 return [group.attrs['aria-label'],word.textContent,phrase?.textContent??null,list.children.map(n=>n.id==='bus-link'?'bus':n.querySelector('input').value).join(' ')];
});
const byStage=['bermuda-day','bermuda-evening','palac-dance','palac-feel','etage-zero','fontanna','ambiance','closing','essentials'];
const byFeeling=['bermuda-day','fontanna','bermuda-evening','palac-dance','etage-zero','palac-feel','closing','ambiance','essentials'];
const remembered=()=>{const saved={};return {saved,storage:{getItem:key=>saved[key] ?? null,setItem(key,value){saved[key]=String(value);}}};};

test('a first visit lists by stage, in today\'s order, with By stage pressed',async()=>{
 const {saved,storage}=remembered(),e=setup({storage});await flush();
 assert.deepEqual(stationIds(e),byStage,'today\'s nine, in today\'s order');
 assert.deepEqual(radios(e),['01','02','03','04','06','07','08','09','05'],'the rail lists them in that order');
 assert.deepEqual(e.elements.ways.children.map(b=>[b.value,b.attrs['aria-pressed']]),[['feeling','false'],['stage','true']],'By stage is pressed');
 assert.deepEqual([e.elements['station-text'].textContent,e.window.Pavoia.getState().stage],['4 / 9','palac-feel'],'and the visit opens on Lost in Feelings, 4 / 9');
 assert.deepEqual({...saved},{},'a first visit stores nothing');
});

test('By feeling orders the rail, the arrows, the media keys and the position, and is kept',async()=>{
 const {saved,storage}=remembered(),e=setup({storage});await flush();const stage=()=>e.window.Pavoia.getState().stage;
 press(e,'feeling');
 assert.deepEqual([stationIds(e),radios(e)],[byFeeling,['01','07','02','03','06','04','09','08','05']],'the stations and the radios follow one festival day');
 assert.deepEqual([e.elements['station-text'].textContent,e.elements['station-label'].textContent],['6 / 9','Station 6 of 9, Lost in Feelings, Pałac stage'],'the position counts on screen');
 e.key('ArrowRight');assert.equal(stage(),'closing','the next station on screen');
 e.actions.previoustrack();assert.equal(stage(),'palac-feel','the media keys walk the same order');
 e.change('01');e.key('ArrowLeft');assert.equal(stage(),'essentials','the first station wraps to the last on screen');
 assert.equal(saved['pavoia-way'],'feeling','the press is kept');
 const again=setup({storage});await flush();
 assert.deepEqual([stationIds(again),again.elements.ways.children.map(b=>b.attrs['aria-pressed'])],[byFeeling,['true','false']],'a later visit lists by feeling');
 assert.deepEqual([again.window.Pavoia.getState().stage,again.elements['station-text'].textContent],['essentials','9 / 9'],'and opens on the last station, counted by feeling');
 e.click();e.change('04');e.actions.nexttrack();
 assert.deepEqual([stage(),e.window.Pavoia.getState().viewing,e.audio.src],['bermuda-day','bermuda-day','/stream/bermuda-day.mp3'],'while another station shows, the media keys step by feeling from the station heard');
});

test('a way changes no station, no photo and no playback',async()=>{
 const e=setup();await flush();e.click();e.playing();
 const now=()=>[e.window.Pavoia.getState().stage,e.audio.src,e.audio.calls.length,e.audio.paused,e.elements.photo.src];
 const before=now();
 press(e,'feeling');await flush();assert.deepEqual(now(),before,'the same station, stream, play count and photo');
 press(e,'stage');await flush();assert.deepEqual(now(),before,'and back');
 const paused=setup();await flush();press(paused,'feeling');await flush();
 assert.deepEqual([paused.audio.src,paused.audio.calls.length],[undefined,0],'paused, nothing starts');
});

test('a storage that throws, or holds another value, lists by stage, and the switch works for the visit',async()=>{
 const denied=()=>{throw new Error('Storage denied');};
 for(const [storage,what] of [[{getItem:denied,setItem:denied},'a storage that throws'],[{getItem:key=>key==='pavoia-way'?'mood':null,setItem(){}},'another value'],[{getItem:key=>key==='pavoia-way'?'toString':null,setItem(){}},'a name every object has']]){
  const e=setup({storage});await flush();
  assert.deepEqual(stationIds(e),byStage,what+' lists by stage');
  press(e,'feeling');
  assert.deepEqual([stationIds(e),e.elements['station-text'].textContent],[byFeeling,'6 / 9'],what+': the switch still works');
 }
});

test('each way groups its stations under its words, in one radio group',async()=>{
 const e=setup();await flush();const moods=e.elements.moods;
 assert.equal(moods.children[0],e.elements.ways,'the switch opens the rail');
 assert.deepEqual(groupsOf(e),[
  ['Bermuda stage','Bermuda','Open air','01 02'],
  ['Pałac stage','Pałac','Its peak and its inward side','03 04'],
  ['Etage 0 stage','Etage 0','The basement','06'],
  ['Fontanna stage','Fontanna','Dancing in daylight','07'],
  ['Ambiance stage','Ambiance','A safe, quiet space','08'],
  ['The Bus stage','The Bus','Somewhere in the forest','bus'],
  ['Selected by Gaende','Selected by Gaende',null,'09 05']],'by stage every stage is named, with a few of its own words');
 const groups=moods.children.slice(1);
 assert.equal(groups.length+1,moods.children.length,'every group stays in the list of the fieldset');
 for(const group of groups){
  const [word,...rest]=group.children,phrase=rest.length>1?rest[0]:null;
  assert.equal(group.attrs.role,'group');
  assert.equal(word.attrs['aria-hidden'],'true','the word is read once, as the group\'s name: '+word.textContent);
  if(phrase)assert.deepEqual([phrase.attrs['aria-hidden'],group.attrs['aria-describedby'],word.title],['true',phrase.id,phrase.textContent],'the phrase describes the group, and is the word\'s tooltip: '+word.textContent);
  else assert.equal(group.attrs['aria-describedby'],undefined,'no phrase, no description');
 }
 e.setLanguage('de');
 assert.deepEqual(groupsOf(e).map(g=>g.slice(0,3)).filter((_,i)=>[0,6].includes(i)),[['Bühne Bermuda','Bermuda','Unter freiem Himmel'],['Ausgewählt von Gaende','Ausgewählt von Gaende',null]]);
 press(e,'feeling');
 assert.deepEqual(groupsOf(e).map(g=>[g[1],g[3]]),[['Tag','01 07'],['Nacht','02 03 06 04 09'],['Jederzeit','08 05'],['The Bus','bus']],'by feeling: Day, Night, Any time, then the Bus');
 e.setLanguage('en');
 assert.deepEqual(groupsOf(e).map(g=>[g[0],g[1],g[2]]),[['Day','Day',null],['Night','Night',null],['Any time','Any time',null],['The Bus stage','The Bus','Somewhere in the forest']]);
 assert.equal(moods.children[0],e.elements.ways,'the switch is still the first child after a press');
 const inputs=moods.descendants().filter(n=>n.localName==='input');
 assert.deepEqual([inputs.length,inputs.every(n=>n.type==='radio'&&n.name==='mood')],[9,true],'nine radios, one name, so one radio group');
 assert.match(web('index.html'),/<fieldset class="moods" id="station-selector">\s*<legend[^>]*>[^<]*<\/legend>\s*<div class="mood-list" id="moods">\s*<div class="ways" id="ways" role="group" aria-label="Order the stations"><button type="button" value="feeling" aria-pressed="false"><span data-copy="byFeeling">By feeling<\/span><\/button><button type="button" value="stage" aria-pressed="true"><span data-copy="byStage">By stage<\/span><\/button><\/div>/,'the switch opens the list inside the fieldset, as two toggle buttons');
 assert.equal(e.elements.ways.getAttribute('aria-label'),'Order the stations');e.setLanguage('de');assert.equal(e.elements.ways.getAttribute('aria-label'),'Sender ordnen');
 assert.deepEqual([e.run('words.de.byFeeling'),e.run('words.de.byStage')],['Nach Stimmung','Nach Bühne']);
});

test('the hero names the station\'s stage over its title, and hides it on the Bus',async()=>{
 const e=setup();await flush();const fact=e.elements['mood-fact'],eyebrow=e.elements['mood-stage'];
 const facts=()=>Object.fromEntries(['01','03','06','07','08','09','05'].map(id=>{e.change(id);return [id,fact.textContent];}));
 const expected={'01':'Bermuda stage','03':'Pałac stage','06':'Etage 0 stage','07':'Fontanna stage','08':'Ambiance stage','09':'Selected by Gaende','05':'Selected by Gaende'};
 assert.deepEqual({...facts()},expected,'by stage');
 press(e,'feeling');assert.deepEqual({...facts()},expected,'and the same facts by feeling');
 e.setLanguage('de');e.change('03');assert.equal(fact.textContent,'Bühne Pałac');e.change('05');assert.equal(fact.textContent,'Ausgewählt von Gaende');
 assert.equal(eyebrow.hidden,false);
 e.location.hash='#bus';e.window.emit('hashchange');assert.equal(eyebrow.hidden,true,'the Bus hides it, since its title is its stage');
 e.location.hash='';e.window.emit('popstate');assert.equal(eyebrow.hidden,false,'leaving the Bus shows it again');
 assert.equal(eyebrow.textContent,'','the fact is written into its span, so the eyebrow keeps its child');
 assert.match(web('index.html'),/<div class="bottom">\s*<p class="eyebrow" id="mood-stage"><span id="mood-fact">Pałac stage<\/span><button type="button" id="play-shown" class="play-shown" hidden>.*?<\/button><\/p>\s*<h1 id="mood-name">/,'over the title from the first paint, then the hero\'s play, hidden');
});

test('the spoken position says the stage once',async()=>{
 const e=setup();await flush();const label=()=>e.elements['station-label'].textContent;
 assert.equal(label(),'Station 4 of 9, Lost in Feelings, Pałac stage');
 e.change('06');assert.equal(label(),'Station 5 of 9, Etage 0 stage','a station named after its stage says the fact alone');
 e.change('09');assert.equal(label(),'Station 8 of 9, Closing, Selected by Gaende');
 e.change('06');e.setLanguage('de');assert.equal(label(),'Sender 5 von 9, Bühne Etage 0');
});

test('by feeling a radio is described by its line and its stage, by stage by its line alone',async()=>{
 const e=setup();await flush();const input=e.document.querySelector('input[value="03"]'),fact=e.elements.moods.descendants().find(n=>n.id==='stage-03');
 assert.ok(input.parentNode.children.includes(fact),'the stage lives in its station\'s label');
 assert.deepEqual([input.getAttribute('aria-describedby'),fact.hidden,fact.textContent],['line-03',true,'Pałac stage'],'by stage the group\'s name already says it');
 press(e,'feeling');assert.equal(input.getAttribute('aria-describedby'),'line-03 stage-03','by feeling it follows the line');
 e.setLanguage('de');assert.equal(fact.textContent,'Bühne Pałac');
 press(e,'stage');assert.equal(input.getAttribute('aria-describedby'),'line-03');
 for(const label of e.document.querySelectorAll('.mood'))assert.ok(label.children.filter(n=>n.id?.startsWith('stage-')).every(n=>n.hidden),'the stage is never shown in the label: '+label.querySelector('input').value);
});

test('on a phone the switch heads the sheet, and a way keeps the current station in view',async()=>{
 const query='(max-width: 760px)',e=setup({media:[query]});await flush();const ways=e.elements.ways,heading=e.elements['stations-heading'],sheet=e.elements['stations-sheet'];
 assert.deepEqual([ways.parentNode===heading,e.elements.moods.children.includes(ways)],[true,false],'the switch is the heading\'s second row, out of the list');
 e.elements['open-stations'].emit('click');const focused=e.document.activeElement,row=e.document.querySelector('input[value="04"]').parentNode;
 press(e,'feeling');
 assert.deepEqual([{...row.scrolled},ways.parentNode===heading,sheet.open,e.document.activeElement===focused],[{block:'nearest'},true,true,true],'the current row stays in view; the switch stays in the heading, the sheet open and focus where it was');
 row.scrolled=undefined;e.location.hash='#bus';e.window.emit('hashchange');e.elements['open-stations'].emit('click');press(e,'stage');
 assert.deepEqual([{...e.elements['bus-link'].scrolled},row.scrolled],[{block:'nearest'},undefined],'in the Bus scene the bus row is the one kept in view');
 e.queries.get(query).change(false);
 assert.equal(e.elements.moods.children[0],ways,'wider, the switch opens the rail again');
});

test('the bar and the lock screen add the stage to a station named otherwise',async()=>{
 for(const journey of [false,true]){
  const e=setup({journey});await flush();const bar=e.elements['player-stage'],from=journey?' through the explorer':'';
  assert.deepEqual([bar.children.length,bar.children[0],bar.children[1].className,bar.children[1].textContent],[2,'Lost in Feelings','player-stage-of',' · Pałac'],'the name, then its stage');
  assert.deepEqual([e.window.Pavoia.getState().album,e.mediaSession.metadata.album],['Lost in Feelings · Pałac','Lost in Feelings · Pałac'],'the lock screen says both'+from);
  for(const [id,name] of [['06','Etage 0'],['09','Closing']]){e.change(id);await flush();assert.deepEqual([bar.children,e.mediaSession.metadata.album],[[name],name],name+': no stage after it'+from);}
  e.change('01');await flush();assert.equal(e.mediaSession.metadata.album,'Under the Sun · Bermuda');
 }
 assert.match(cssRules('(min-width:761px) and (max-width:1100px)').get('.player .player-stage-of'),/display:none/,'where the bar\'s column would cut the stage, the bar shows the name alone');
});

test('Pavoia.stations keeps one object per station across ways, with its group and its fact',async()=>{
 const e=setup();await flush();const before=[...e.window.Pavoia.stations],fontanna=before.find(s=>s.id==='fontanna');
 assert.notEqual(e.window.Pavoia.stations,e.window.Pavoia.stations,'a new list on every read');
 assert.ok([...e.window.Pavoia.stations].every((s,i)=>s===before[i]),'of the same objects');
 assert.deepEqual([fontanna.name,fontanna.thumb,fontanna.group,fontanna.fact],['Fontanna','photos/selected/p052.jpg','fontanna','Fontanna stage']);
 press(e,'feeling');const after=[...e.window.Pavoia.stations];
 assert.deepEqual(after.map(s=>s.id),byFeeling);
 assert.ok(after.length===9&&after.every(s=>before.includes(s)),'the same objects, in the new order');
 assert.equal(after.find(s=>s.id==='fontanna'),fontanna);
 assert.deepEqual([fontanna.group,fontanna.fact],['day','Fontanna stage']);
 e.setLanguage('de');assert.equal(fontanna.fact,'Bühne Fontanna');
});

test('the rail is two tiers, and the pressed way carries the rail\'s line',()=>{
 const rules=cssRules(),phone=cssRules('(max-width:760px)'),mid=cssRules('(min-width:860px)');
 assert.match(rules.get('.mood-list'),/display:flex; flex-wrap:wrap; align-items:end; gap:var\(--s2\) var\(--s4\)/,'the switch sits on the stations\' line; groups 24px apart, wrapped rows 8px');
 assert.match(rules.get('.mood-group'),/display:flex; flex-direction:column; align-items:flex-start; gap:var\(--s1\); white-space:nowrap/,'a group is its word 4px over its stations, and wraps whole');
 assert.match(rules.get('.group-moods'),/display:flex; gap:0 var\(--s3\)/,'its stations 16px apart');
 assert.match(rules.get('.mood span::after, .bus-link::after, .ways span::after'),/height:1px; background:currentColor; transform:scaleX\(0\)/,'the switch shares the rail\'s line');
 assert.match(rules.get('.mood:has(input:checked) span::after, .bus-link[aria-current]::after, .ways [aria-pressed=true] span::after'),/transform:scaleX\(1\)/,'so the pressed way is marked by more than its colour');
 assert.match(rules.get('.ways button'),/min-height:44px;.*color:var\(--muted\); font:12px Inter,sans-serif/,'the switch reads like the photo tools');
 assert.match(rules.get('.ways button:is([aria-pressed=true], :hover)'),/color:var\(--cream\)/);
 assert.match(mid.get('.ways button'),/font-size:14px/,'and grows with them from 860px');
 assert.ok(lastAt('(min-width:860px)','.ways button')>lastAt('','.ways button'),'the 860px rule comes after the rule it overrides');
 assert.match(rules.get('.poster .ways::after'),/width:1px; height:18px; background:var\(--line\)/,'the rail\'s divider closes the switch, on the rail only');
 assert.match(rules.get('.mood-essentials:has(input:focus-visible)'),/outline:2px solid var\(--cream\); outline-offset:1px/,'the ring around the whole Essentials target keeps inside the 4px under its word');
 assert.match(rules.get('.bus-link:focus-visible'),/outline-offset:1px/,'and so does the bus\'s');
 assert.match(rules.get('body:not([data-bus]) .mood-group:has(input:checked) .group-name, .mood-group:has(.bus-link[aria-current]) .group-name'),/color:var\(--cream\)/,'the current station\'s word turns cream');
 assert.match(rules.get('#mood-stage'),/margin-bottom:var\(--s3\); color:var\(--cream\); text-shadow:0 0 2px var\(--ink\), 0 1px 4px var\(--ink\), 0 0 10px var\(--ink\), 0 2px 18px rgb\(0 0 0 \/ \.45\)/,'one fact over the title, in cream, with a dark halo under the hero\'s shadow');
 assert.match(rules.get('.poster .group-name'),/color:var\(--soft\); text-shadow:0 0 2px var\(--ink\), 0 1px 4px var\(--ink\), 0 0 10px var\(--ink\), 0 2px 18px rgb\(0 0 0 \/ \.45\)/,'the group words read in soft over the photo, with the same halo');
 assert.match(rules.get('.stations-heading'),/position:sticky;.*display:grid; grid-template-columns:minmax\(0,1fr\) auto; grid-template-rows:64px; align-items:center; background:var\(--surface\); border-bottom:1px solid var\(--line\)/,'the sheet\'s title keeps its 64px row, the switch goes under it');
 assert.match(rules.get('.stations-heading .ways'),/grid-column:1 \/ -1; gap:var\(--s4\); padding-bottom:var\(--s2\)/,'8px under the switch hold its focus ring');
 assert.match(phone.get('#stations-sheet'),/scroll-padding-top:calc\(64px \+ 44px \+ var\(--s2\) \+ 1px\)/,'a row scrolled into view clears the two-row heading');
 const sheet=['#stations-sheet .mood-group','#stations-sheet .group-name','#stations-sheet .mood-group > .sheet-line','#stations-sheet .group-moods'].map(selector=>phone.get(selector));
 assert.ok(sheet.every(Boolean),'the sheet\'s group headings have their rules');
 assert.ok(sheet.join('').includes('var(--s1)')&&!/(?<![\w-])\d+px/.test(sheet.join('')),'they use the spacing scale, 4px in like the rows');
 const added=ordered().filter(([,list])=>/mood-group|group-moods|group-name|\.ways|#mood-stage|player-stage-of/.test(list)).map(([,,declarations])=>declarations).join('');
 assert.deepEqual([[...added.matchAll(/rgb\([^)]*\)/g)].map(m=>m[0]).filter(v=>v!=='rgb(0 0 0 / .45)'),/#[0-9a-f]{3,8}\b/i.test(added)],[[],false],'no colour of their own: tokens, and the hero\'s shadow');
 for(const name of ['index.html','app.js','style.css'])assert.ok(!web(name).includes('mood-specials'),'no .mood-specials left in '+name);
 assert.ok(!web('style.css').includes('1101px'),'no wide rule names the Bus after the bus');
});

test('a way takes as many rows on the rail as the other, so a press never moves the title or the switch',async()=>{
 const e=setup();await flush();
 // Widths as a browser lays them out: the switch, a station, the bus, 7px a letter of a group's word, 24px between the
 // groups and 16px between the stations of a group, on a rail `room` wide.
 let room=1310;const P=e.Element.prototype;
 const wide=n=>n.id==='moods'?room:n.id==='ways'?156:n.id==='bus-link'?44:n.className==='mood'?100:n.className==='eyebrow group-name'?7*n.textContent.length:0;
 P.getBoundingClientRect=function(){const width=wide(this);return {left:0,top:0,right:width,bottom:0,width,height:0};};
 Object.defineProperty(P,'computed',{configurable:true,get(){return {columnGap:this.id==='moods'?'24px':this.className==='group-moods'?'16px':'0px'};}});
 const press=value=>e.elements.ways.children.find(b=>b.value===value).emit('click');
 const groups=()=>e.elements.moods.children.filter(n=>n.className==='mood-group');
 const broken=()=>groups().filter(n=>n.getAttribute('data-break')!==null).map(n=>n.getAttribute('aria-label'));
 const wraps=()=>e.elements.moods.getAttribute('data-wraps')!==null;
 // By stage the rail needs 1321px and takes two rows; by feeling it needs 1297px and would take one.
 e.window.emit('resize');
 assert.deepEqual([broken(),wraps(),groups().length],[[],true,7],'by stage wraps by itself, and the other way\'s groups measured at the end are gone');
 press('feeling');
 assert.deepEqual([broken(),wraps(),groups().length],[['The Bus stage'],true,4],'by feeling breaks before its last group, so it takes the same two rows');
 press('stage');assert.deepEqual([broken(),wraps()],[[],true],'by stage needs no break');
 room=1400;e.window.emit('resize');assert.deepEqual([broken(),wraps()],[[],false],'where both ways fit in one row, nothing breaks');
 press('feeling');assert.deepEqual([broken(),wraps()],[[],false]);
 room=1000;e.window.emit('resize');assert.deepEqual([broken(),wraps()],[[],true],'where both take two rows, nothing breaks either');
 room=1310;e.window.emit('resize');assert.deepEqual(broken(),['The Bus stage'],'a resize balances the rail again');
 e.queries.get('(max-width: 760px)').change(true);assert.deepEqual([broken(),wraps()],[[],false],'the phone sheet is a list: no break and no wrap');
 assert.match(cssRules().get('.mood-group[data-break]'),/flex-basis:100%/,'a break puts the last group on a row of its own');
});

test('a short window keeps the photo tools above the player bar, and the rail holds its height before app.js runs',()=>{
 const short='(min-width:761px) and (max-height:700px), (min-width:761px) and (max-width:800px) and (max-height:820px)',compact=cssRules(short),rules=cssRules();
 assert.match(compact.get('.listen-layout'),/padding-top:108px/,'the hero starts where the 108px header ends');
 assert.match(compact.get('.poster .group-name'),/display:none/,'the rail drops its word tier');
 assert.match(compact.get('.mood-list'),/--row:44px/,'so a row is one station high');
 assert.match(compact.get('.moods'),/margin-top:var\(--s2\); padding-block:0/,'and its spacing tightens');
 assert.match(compact.get('#mood-stage'),/margin-bottom:var\(--s2\)/,'the fact over the title stays, closer to it');
 for(const selector of ['.listen-layout','.poster .group-name','.mood-list','.moods','#mood-stage'])assert.ok(lastAt(short,selector)>lastAt('',selector),'the short-window rule comes after the rule it overrides: '+selector);
 assert.match(rules.get('.mood-list'),/--row:calc\(11px \* 1\.4 \+ var\(--s1\) \+ 44px\)/,'a row is the word\'s line, the 4px under it and a 44px station');
 assert.match(cssRules('(min-width:761px)').get('.mood-list'),/min-height:var\(--row\); align-content:flex-start/,'before app.js builds the groups, a laptop\'s rail already holds one row');
 assert.match(cssRules('(min-width:761px) and (max-width:1100px)').get('.mood-list'),/min-height:calc\(2 \* var\(--row\) \+ var\(--s2\)\)/,'and two where both ways always wrap');
});

const entity=(id,type='artist')=>({entity:{id,type,title:'Name '+id},included:[]});
// The first link under an element, and a plain click on it, which the page's document handler routes.
const firstLink=root=>root.descendants().find(n=>n.localName==='a');
const follow=(e,a)=>e.document.emit('click',{button:0,target:{closest:()=>a},preventDefault(){}});
// An element's text with its children's, as a browser reads it.
const textOf=n=>typeof n==='string'?n:(n.textContent||'')+n.children.map(textOf).join('');
// How many times the page writes the address with history.pushState or history.replaceState from now on; a write
// that only changes the state is not counted.
const countWrites=e=>{let n=0;for(const name of ['pushState','replaceState']){const write=e.history[name];e.history[name]=function(state,title,url){const from=e.location.hash;write.call(this,state,title,url);if(e.location.hash!==from)n++;};}return ()=>n;};

test('the explorer opens over an inert page, keeps the player, and ✕ or Escape go back to the page in one step, and Back goes back one move',async()=>{
 const e=setup({journey:true});await flush();const explorer=e.elements.explorer,main=e.elements.main,footer=e.elements['roots-footer'];
 e.discovery=url=>entity(url.includes('plex_')?'trk_0123456789ab':url.split('/').pop());
 const link=href=>e.document.emit('click',{button:0,target:{closest:()=>({getAttribute:()=>href})},preventDefault(){}});
 e.key('Escape');assert.equal(e.position(),0,'Escape with the explorer closed does nothing');
 link('#explore/art_0123456789ab');await flush();
 assert.deepEqual([explorer.open,explorer.modal,main.inert,footer.inert,e.elements.player.inert],[true,false,true,true,undefined],'a plain dialog, so the player bar stays in reach');
 assert.deepEqual([e.entries(),e.position()],[['','#explore/art_0123456789ab'],1],'opening adds one entry above the page');
 link('#history');link('#statistics');await flush();e.elements['credited-artists'].emit('click');
 e.run('window.Pavoia.openTrack("7")');await flush();
 assert.deepEqual([e.location.hash,e.entries().length,e.position()],['#explore/trk_0123456789ab',5,4],'each move inside adds one entry, and the roots rename the record in its own');
 e.elements['explorer-close'].emit('click');await flush();
 assert.deepEqual([explorer.open,main.inert,footer.inert,e.location.hash,e.position()],[false,false,false,'',0],'✕ goes back over the whole visit in one step, to the page, so Back then leaves the site');
 link('#statistics');await flush();link('#history');await flush();e.history.go(-1);await flush();
 assert.deepEqual([explorer.open,e.location.hash,e.position()],[true,'#statistics/palac-feel',1],'the browser\'s Back goes back one move');
 e.history.go(-1);await flush();
 assert.deepEqual([explorer.open,e.location.hash,e.position()],[false,'',0],'and from the first place of the visit, it closes the explorer');
 link('#explore/art_0123456789ab');await flush();
 assert.equal(e.key('Escape').key,'Escape');await flush();
 assert.deepEqual([explorer.open,e.location.hash,e.position()],[false,'',0],'Escape leaves too, though a plain dialog has no cancel event');
 assert.equal(explorer.events.cancel,undefined,'no cancel listener is left');
});

test('a shared explorer link closes in place, onto the radio page',async()=>{
 const e=setup({journey:true,hash:'#explore/art_0123456789ab'});await flush();
 assert.deepEqual([e.entries(),e.elements.explorer.open,e.history.state.explorer],[['#explore/art_0123456789ab'],true,true],'no entry is made up under it, which Chromium would skip on Back');
 e.elements['explorer-close'].emit('click');await flush();
 assert.deepEqual([e.location.hash,e.entries(),e.elements.explorer.open],['',[''],false],'✕ lands on the radio, not off the site');
});

// A link per station: the address is /?station=<id>, written in place; the hash stays the Bus's and the explorer's.
test('a station change by the rail, the arrows, the media keys or the explorer keeps the history length and writes ?station',async()=>{
 const e=setup();await flush();const stage=()=>e.window.Pavoia.getState().stage;
 const steps=[['the rail',()=>e.change('06'),'etage-zero'],['ArrowRight',()=>e.key('ArrowRight'),'fontanna'],['ArrowLeft',()=>e.key('ArrowLeft'),'etage-zero'],
  ['nexttrack',()=>e.actions.nexttrack(),'fontanna'],['previoustrack',()=>e.actions.previoustrack(),'etage-zero'],['tune',()=>e.window.Pavoia.tune('closing'),'closing']];
 for(const [what,act,expected] of steps){act();assert.deepEqual([stage(),e.urls(),e.position()],[expected,['/?station='+expected],0],what+' rewrites the one entry');}
 for(let i=0;i<10;i++){e.key('ArrowRight');assert.deepEqual([e.urls(),e.url()],[['/?station='+stage()],'/?station='+stage()],'ten arrows, one entry that names the station each time');}
 const heard=stage();e.click();e.change('07');
 assert.deepEqual([stage(),e.window.Pavoia.getState().viewing,e.urls()],[heard,'fontanna',['/?station=fontanna']],'while the radio plays, ?station names the station shown, not the station heard');
 const x=setup({journey:true});await flush();
 x.document.emit('click',{button:0,target:{closest:()=>({getAttribute:()=>'#history'})},preventDefault(){}});await flush();
 const opened=x.urls();assert.equal(opened.length,2,'opening the explorer adds its one entry');
 x.window.Pavoia.tune('fontanna');await flush();
 assert.deepEqual([x.window.Pavoia.getState().stage,x.urls().length,x.position(),x.location.search,x.urls()[0]],['fontanna',2,1,'?station=fontanna','/?station=palac-feel'],'inside the explorer, the explorer\'s entry names the new station, and the page entry waits for Back');
 assert.equal(x.location.hash,opened[1].slice(opened[1].indexOf('#')),'and its place stays');
});

test('leaving the Bus adds one entry, and Back shows the current station with no audio call',async()=>{
 const e=setup({search:'?station=fontanna'});await flush();e.click();e.playing();
 e.location.hash='#bus';e.window.emit('hashchange');await flush();
 assert.deepEqual(e.urls(),['/?station=fontanna','/?station=fontanna#bus'],'the Bus link adds one entry, as today');
 const calls=e.audio.calls.length,src=e.audio.src,both=()=>[e.window.Pavoia.getState().viewing,e.window.Pavoia.getState().stage];
 e.change('09');await flush();
 assert.deepEqual([e.urls(),e.document.body.getAttribute('data-bus'),...both(),e.audio.calls.length,e.audio.src],[['/?station=fontanna','/?station=fontanna#bus','/?station=closing'],null,'closing','fontanna',calls,src],'a station picked on the Bus adds one entry, as today, named after it; it shows that station and keeps the sound');
 e.history.back();await flush();
 assert.deepEqual([e.url(),...both(),e.document.body.getAttribute('data-bus'),e.audio.calls.length,e.audio.src,e.audio.paused],['/?station=closing#bus','closing','fontanna','',calls,src,false],'Back shows the Bus over the station shown, and the music goes on untouched');
 e.history.back();await flush();
 assert.deepEqual([e.url(),...both(),e.audio.calls.length,e.audio.paused],['/?station=closing','closing','fontanna',calls,false],'Back again: the station shown, never the old one');
 e.history.go(2);await flush();assert.deepEqual([e.url(),...both(),e.urls().length],['/?station=closing','closing','fontanna',3],'Forward the same');
 e.location.hash='#bus';e.window.emit('hashchange');await flush();
 e.elements['player-stage'].children[0].emit('click');await flush();
 assert.deepEqual([e.urls(),e.position(),e.document.body.getAttribute('data-bus'),...both(),e.audio.calls.length,e.audio.src,e.audio.paused],[['/?station=closing','/?station=closing#bus','/?station=closing','/?station=closing#bus','/?station=fontanna'],4,null,'fontanna','fontanna',calls,src,false],'the door leaves the Bus with exactly one entry onto the station heard, and the music goes on untouched');
});

test('the station heard carries data-hearing and a description only while the sound is wanted',async()=>{
 const e=setup();await flush();
 const labelOf=id=>e.document.querySelectorAll('.mood').find(label=>label.querySelector('input').value===id);
 const marked=()=>e.document.querySelectorAll('.mood').filter(label=>'data-hearing' in label.attrs).map(label=>label.querySelector('input').value);
 const described=id=>labelOf(id).querySelector('input').getAttribute('aria-describedby');
 const note=e.elements['station-selector'].children.find(child=>child.id==='hearing-note');
 assert.deepEqual([marked(),described('04'),described('03'),note.hidden,note.textContent],[['04'],'line-04','line-03',true,'You hear this station'],'paused: the mark is on the station tuned alone, and no radio is described as heard');
 e.click();
 assert.deepEqual([marked(),described('04'),described('03')],[['04'],'line-04 hearing-note','line-03'],'wanted, even while it connects: the radio heard is described as such, after its line');
 e.location.hash='#bus';e.window.emit('hashchange');
 assert.deepEqual([marked(),described('04')],[['04'],'line-04 hearing-note'],'on the Bus too');
 e.elements.ways.children[0].emit('click');
 assert.deepEqual([marked(),described('04'),described('03')],[['04'],'line-04 stage-04 hearing-note','line-03 stage-03'],'a way switch while playing keeps the note, after the line and the stage');
 e.setLanguage('de');
 assert.deepEqual([marked(),described('04'),note.textContent],[['04'],'line-04 stage-04 hearing-note','Diesen Sender hörst du'],'in German');
 e.elements.ways.children[1].emit('click');
 assert.deepEqual([described('04'),described('03')],['line-04 hearing-note','line-03'],'and back by stage, in German');
 e.change('03');
 assert.deepEqual([marked(),described('04'),described('03')],[['04'],'line-04 hearing-note','line-03'],'a change while it plays leaves the mark and the note on the station heard');
 e.elements['play-shown'].emit('click');
 assert.deepEqual([marked(),described('04'),described('03')],[['03'],'line-04','line-03 hearing-note'],'the hero\'s play moves them to the station shown, which is now the one heard');
 e.click();
 assert.deepEqual([marked(),described('03'),note.textContent],[['03'],'line-03','Diesen Sender hörst du'],'a pause keeps the mark, which the stylesheet hides, and takes the note away');
 e.setLanguage('en');assert.equal(note.textContent,'You hear this station');
 e.click();e.error();
 assert.deepEqual([e.document.querySelector('.player').dataset.status,described('03')],['retrying','line-03 hearing-note'],'reconnecting: the sound is still wanted, so the note stays');
});

test('the door gives focus to the play button when it goes: on a press, on Back and on a transient state',async()=>{
 const e=setup();await flush();e.click();e.playing();
 const play=e.elements.play,link=e.elements['bus-link'];
 const door=()=>e.elements['player-stage'].children.find(child=>child.className==='stage-door');
 const toBus=()=>{if(e.location.hash!=='#bus'){e.location.hash='#bus';e.window.emit('hashchange');}};
 const focusDoor=()=>{toBus();door().focus();play.focusOptions=undefined;assert.equal(e.document.activeElement,door());};
 const onPlay=()=>[e.document.activeElement===play,play.focusOptions?.preventScroll,e.document.querySelector('.player').dataset.status];
 link.focus();toBus();
 assert.deepEqual([e.document.activeElement===link,Boolean(door())],[true,true],'the Bus link pressed keeps its focus: a door that had none takes none');
 e.setLanguage('de');assert.equal(e.document.activeElement,link,'nor a door drawn again in another language');
 e.setLanguage('en');
 focusDoor();door().emit('click');
 assert.deepEqual([...onPlay(),e.location.hash,door()],[true,true,'playing','',undefined],'a press: the door goes, and its focus goes to Play, with no scroll');
 toBus();assert.deepEqual([e.document.activeElement===play,Boolean(door())],[true,true],'back on the Bus with the focus on Play, it stays there');
 focusDoor();e.setLanguage('de');
 assert.deepEqual([e.document.activeElement===door(),door().focusOptions?.preventScroll,textOf(door())],[true,true,'Sender: Lost in Feelings'],'a language switch draws the door again and keeps its focus, with no scroll');
 e.setLanguage('en');
 focusDoor();e.history.back();
 assert.deepEqual([...onPlay(),e.location.hash,door()],[true,true,'playing','',undefined],'Back: the same');
 // A transient state hides the label, and its door with it: the door keeps its place, and its focus goes to Play.
 focusDoor();e.audio.readyState=2;e.audio.emit('waiting');
 assert.deepEqual([...onPlay(),Boolean(door())],[true,true,'buffering',true],'buffering');
 e.playing();focusDoor();e.error();
 assert.deepEqual([...onPlay(),Boolean(door())],[true,true,'retrying',true],'reconnecting');
 e.fire(1000);e.playing();e.actions.pause();
 focusDoor();e.actions.play();
 assert.deepEqual([...onPlay(),Boolean(door())],[true,true,'connecting',true],'a play from the lock screen connects');
 e.audio.calls.at(-1).reject(Object.assign(new Error(),{name:'NotAllowedError'}));await flush();
 assert.deepEqual([...onPlay(),e.window.Pavoia.getState().wanted,Boolean(door())],[true,true,'blocked',false,true],'a start the browser refuses keeps the focus on Play');
 assert.notEqual(e.document.activeElement,e.document.body,'focus never falls to the page');
 assert.equal(e.timers.size,0,'no timer left');
});

test('closing the explorer, owned or shared, lands on ?station=<current> with an empty hash',async()=>{
 const e=setup({journey:true,search:'?station=fontanna'});await flush();
 e.document.emit('click',{button:0,target:{closest:()=>({getAttribute:()=>'#statistics'})},preventDefault(){}});await flush();
 e.window.Pavoia.tune('closing');await flush();
 e.elements['explorer-close'].emit('click');await flush();
 assert.deepEqual([e.elements.explorer.open,e.url(),e.location.hash,e.position()],[false,'/?station=closing','',0],'✕ goes back to the page entry, which names the station tuned inside');
 const shared=setup({journey:true,search:'?station=fontanna',hash:'#explore/art_0123456789ab'});await flush();
 shared.window.Pavoia.tune('closing');await flush();
 shared.elements['explorer-close'].emit('click');await flush();
 assert.deepEqual([shared.elements.explorer.open,shared.url(),shared.urls()],[false,'/?station=closing',['/?station=closing']],'a shared explorer link closes in place, on the station tuned inside');
});

test('a link or a remembered station plays nothing',async()=>{
 for(const [search,stored,hash] of [['?station=etage-zero',null,''],['','fontanna',''],['?station=closing','fontanna','#bus'],['?station=ambiance',null,'#history']]){
  const e=setup({search,hash,storage:{getItem:key=>key==='pavoia-station'?stored:null,setItem(){}}});await flush();await e.poll();await flush();
  const s=e.window.Pavoia.getState();
  assert.deepEqual([e.audio.calls.length,e.audio.src,s.wanted,s.playbackState,e.elements.play.getAttribute('aria-label')],[0,undefined,false,'paused','Play'],`${search||stored} ${hash}: paused, no source, no play call`);
 }
});

test('startup stores nothing; a change and a play store the station',async()=>{
 const {saved,storage}=remembered();saved['pavoia-station']='fontanna';
 const link=setup({search:'?station=closing',storage});await flush();await link.poll();
 assert.deepEqual(saved,{'pavoia-station':'fontanna'},'opening a friend\'s link keeps your own station');
 link.change('09');assert.deepEqual(saved,{'pavoia-station':'fontanna'},'and so does choosing the station already shown');
 link.click();assert.equal(saved['pavoia-station'],'closing','a play of the link remembers it');
 link.click();link.change('09');assert.equal(saved['pavoia-station'],'closing');
 const fresh=remembered(),first=setup({storage:fresh.storage});await flush();await first.poll();
 assert.deepEqual(fresh.saved,{},'a first visit stores nothing');
 first.change('03');assert.equal(fresh.saved['pavoia-station'],'palac-dance','a change remembers the station without a play');
 first.key('ArrowRight');assert.equal(fresh.saved['pavoia-station'],'palac-feel','so do the arrows');
 first.click();first.change('06');assert.equal(fresh.saved['pavoia-station'],'palac-feel','while it plays, a change keeps the station heard');
 first.elements['play-shown'].emit('click');assert.equal(fresh.saved['pavoia-station'],'etage-zero','the hero\'s play stores the station shown');
 first.change('07');first.click();first.click();assert.deepEqual([first.audio.src,fresh.saved['pavoia-station']],['/stream/etage-zero.mp3','etage-zero'],'a play while another station shows stores the station it plays');
 const back=setup({storage:fresh.storage});await flush();assert.equal(back.window.Pavoia.getState().stage,'etage-zero','the next visit opens there');
});

test('a replaceState that throws changes nothing else',async()=>{
 const {saved,storage}=remembered(),e=setup({storage});await flush();
 e.history.replaceState=()=>{throw new Error('SecurityError: too many calls to the History API');};
 e.click();e.change('03');e.playing();
 assert.deepEqual([e.window.Pavoia.getState().viewing,e.window.Pavoia.getState().stage,e.audio.src,e.audio.paused,e.elements['station-text'].textContent,saved['pavoia-station'],e.url()],['palac-dance','palac-feel','/stream/palac-feel.mp3',false,'3 / 9','palac-feel','/?station=palac-feel'],'the station shown and the position change, the stream and the memory stay on the station heard; only the address lags');
 e.elements['play-shown'].emit('click');
 assert.deepEqual([e.window.Pavoia.getState().stage,e.audio.src,saved['pavoia-station']],['palac-dance','/stream/palac-dance.mp3','palac-dance'],'the hero\'s play still moves the stream and the memory');
 e.key('ArrowRight');e.location.hash='#bus';e.window.emit('popstate');
 assert.deepEqual([e.window.Pavoia.getState().viewing,e.window.Pavoia.getState().stage,e.document.body.getAttribute('data-bus')],['palac-feel','palac-dance',''],'the arrows step, and Back or a link still draws its scene');
});

test('every way into the explorer lands on music: the record on air, or one line when nothing is',async()=>{
 const e=setup({journey:true});await flush();const deeper=e.elements['go-deeper'],status=e.elements['discovery-status'];
 const last=()=>e.discoveryRequests.at(-1).url,roots=()=>e.document.emit('click',{button:0,target:{closest:()=>({getAttribute:()=>'#explore'})},preventDefault(){}});
 deeper.emit('click');await flush();assert.equal(e.location.hash,'#explore/plex_123','before the roots answer, the radio track opens');
 e.elements['explorer-close'].emit('click');
 e.discovery=url=>url.includes('/track/')?entity('trk_0123456789ab','track'):entity(url.split('/').pop());await e.poll();await flush();
 deeper.emit('click');await flush();assert.deepEqual([e.location.hash,last()],['#explore/trk_0123456789ab','/api/discovery/track/123'],'then the record as the roots know it, from the payload the player bar already has');
 roots();await flush();
 assert.deepEqual([e.location.hash,last()],['#explore/trk_0123456789ab','/api/discovery/track/123'],'the empty Roots tab shows the record on air in place');
 e.elements['explorer-close'].emit('click');
 e.response={track:null,audience:{available:false,listeners:null}};await e.poll();await flush();
 deeper.emit('click');assert.equal(e.location.hash,'#explore','nothing on air: the search');
 e.window.emit('popstate');e.window.emit('hashchange');await flush();
 assert.deepEqual([status.textContent,e.location.hash],['Nothing on air right now. Search to start.','#explore']);
 e.elements['explorer-close'].emit('click');e.setLanguage('de');roots();await flush();
 assert.equal(status.textContent,'Gerade läuft nichts. Suche, um anzufangen.');
 await e.poll();await flush();assert.equal(e.location.hash,'#explore','still nothing on air: the page waits');
 e.response={track:{id:'123',title:'Later',artist:'Artist Later'},audience:{available:true,listeners:2,measuredAt:new Date(e.clock.now).toISOString()}};await e.poll();await flush();
 assert.match(e.location.hash,/^#explore\/(?:plex_123|trk_0123456789ab)$/,'a track that starts later lands the empty page on it');
 assert.match(web('journey.js'),/deeper:'See the roots it’s built on'/,'a typographic apostrophe');
 assert.match(web('index.html'),/data-journey="deeper">See the roots it’s built on</);
});

test('the search runs as you type, through one request at a time, and Enter still submits',async()=>{
 const e=setup({journey:true});await flush();const query=e.elements['discovery-query'],results=e.elements['discovery-results'],typed=()=>[...e.timers.values()].filter(t=>t.delay===300).length;
 e.discovery=url=>url.includes('/search?')?{items:[{id:'art_0123456789ab',type:'artist',title:'Jimi Jules'}]}:entity(url.split('/').pop());
 e.visit('#explore');await flush();const before=e.discoveryRequests.length;
 query.value=' a';query.emit('input');assert.equal(typed(),0,'one character waits for a second');
 query.value='ab';query.emit('input');query.value='abc';query.emit('input');assert.equal(typed(),1,'each key restarts the 300ms wait');
 e.fire(300);await flush();assert.equal(e.discoveryRequests.at(-1).url,'/api/discovery/search?q=abc');assert.equal(e.discoveryRequests.length,before+1);
 assert.equal(e.location.hash,'#explore?q=abc','the search page holds its query in the URL');
 query.value='abcz';query.emit('input');e.fire(300);assert.equal(results.hidden,false,'the last results stay in place while the next ones load');await flush();
 query.value='abcd';e.elements['discovery-search'].emit('submit',{preventDefault(){}});await flush();
 assert.equal(e.discoveryRequests.at(-1).url,'/api/discovery/search?q=abcd','Enter searches at once');assert.equal(e.discoveryRequests.at(-2).signal.aborted,true,'and the earlier request is abandoned');
 query.value='abcde';query.emit('input');e.elements['discovery-search'].emit('submit',{preventDefault(){}});assert.equal(typed(),0,'Enter cancels the pending wait');
});

test('a result opened from the search adds one entry, and the Roots tab returns to the last search',async()=>{
 const e=setup({journey:true});await flush();const query=e.elements['discovery-query'],results=e.elements['discovery-results'];
 e.discovery=url=>url.includes('/search?')?{items:[{id:'art_0123456789ab',type:'artist',title:'Jimi Jules'}]}:entity(url.split('/').pop());
 const link=href=>e.document.emit('click',{button:0,target:{closest:()=>({getAttribute:()=>href})},preventDefault(){}});
 link('#explore');await flush();assert.equal(e.location.hash,'#explore/plex_123');
 query.value='jimi';query.emit('input');e.fire(300);await flush();
 assert.deepEqual([e.location.hash,results.hidden,results.children.length],['#explore?q=jimi',false,1],'typing turns the record into the search page');
 const searches=e.discoveryRequests.length;follow(e,firstLink(results));await flush();
 assert.deepEqual([e.location.hash,e.entries().length,results.hidden,e.elements['explore-workspace'].hidden],['#explore/art_0123456789ab',4,true,false],'the result is one entry over the search, which is one over the record');
 const tab=()=>e.elements['roots-tab'].getAttribute('href'),current=()=>e.nav.map(link=>link.getAttribute('aria-current'));
 assert.deepEqual(current(),['page',null,null,null],'Roots stays the current tab though its link carries the search');
 link('#history');link(tab());await flush();
 assert.deepEqual([e.location.hash,results.hidden,query.value,e.discoveryRequests.length,textOf(e.elements['discovery-status'])],['#explore?q=jimi',false,'jimi',searches+1,'1 result'],'the Roots tab returns to the same results, without searching again, and says their count to screen readers only');
 query.value='jules';query.emit('input');e.fire(300);await flush();
 assert.deepEqual([e.discoveryRequests.at(-1).url,tab()],['/api/discovery/search?q=jules','#explore?q=jules'],'the Roots tab follows the last search');
 query.value='j';query.emit('input');assert.deepEqual([e.location.hash,tab()],['#explore','#explore'],'and a cleared field');
});

test('a search still waiting to run is dropped once the listener leaves it',async()=>{
 const e=setup({journey:true});await flush();const query=e.elements['discovery-query'],results=e.elements['discovery-results'],typed=()=>[...e.timers.values()].filter(t=>t.delay===300).length;
 e.discovery=url=>url.includes('/search?')?{items:[{id:'art_0123456789ab',type:'artist',title:'Jimi Jules'}]}:entity(url.split('/').pop());
 e.visit('#explore');await flush();
 query.value='ab';query.emit('input');e.elements['explorer-close'].emit('click');await flush();
 assert.deepEqual([typed(),e.location.hash,e.elements.explorer.open],[0,'',false],'✕ drops it, so no late search puts #explore back under the radio');
 e.visit('#explore');await flush();query.value='abc';query.emit('input');e.visit('#history');await flush();
 assert.deepEqual([typed(),e.location.hash],[0,'#history/palac-feel'],'so does another tab');
 // No search ran yet, so the tab still has its href from the page HTML.
 e.visit(e.elements['roots-tab'].getAttribute('href')??'#explore');await flush();assert.deepEqual([query.value,results.children.length],['',0],'the typed query left with its wait');
 query.value='abcd';e.elements['discovery-search'].emit('submit',{preventDefault(){}});await flush();query.value='abcde';query.emit('input');follow(e,firstLink(results));await flush();
 assert.deepEqual([typed(),e.location.hash],[0,'#explore/art_0123456789ab'],'and a result clicked while it waits');
});

test('clearing the field drops a search still loading, and Escape over the stations sheet closes the sheet only',async()=>{
 const e=setup({journey:true});await flush();const query=e.elements['discovery-query'],results=e.elements['discovery-results'],status=e.elements['discovery-status'];
 let answer;e.discovery=url=>url.includes('/search?')?new Promise(resolve=>{answer=()=>resolve({items:[{id:'art_0123456789ab',type:'artist',title:'Jimi Jules'}]});}):entity(url.split('/').pop());
 e.visit('#explore');await flush();query.value='jimi';e.elements['discovery-search'].emit('submit',{preventDefault(){}});await flush();
 query.value='j';query.emit('input');answer();await flush();
 assert.deepEqual([results.hidden,results.children.length,status.textContent],[true,0,''],'the late answer for jimi is not shown under j');
 e.openDialog=e.elements['stations-sheet'];e.key('Escape');await flush();
 assert.deepEqual([e.elements.explorer.open,e.location.hash],[true,'#explore'],'the explorer stays under the sheet');
 e.openDialog=null;const escape=e.key('Escape');await flush();assert.equal(e.elements.explorer.open,false,'the next Escape leaves the explorer');
 assert.equal(escape.prevented,true,'without clearing the typed query, so Back finds it again');
});

test('however deep the digging, ✕ reaches the page in one step',async()=>{
 const e=setup({journey:true});await flush();e.discovery=url=>entity(url.split('/').pop());
 const link=href=>e.document.emit('click',{button:0,target:{closest:()=>({getAttribute:()=>href})},preventDefault(){}});
 for(let i=1;i<=60;i++){link('#explore/art_'+i.toString(16).padStart(12,'0'));await flush();}
 assert.deepEqual([e.entries().length,e.position(),e.history.state.depth],[42,41,40],'sixty moves: the page, then depths 0 to 40');
 const steps=[],go=e.history.go;e.history.go=function(delta){steps.push(delta);go.call(this,delta);};
 e.elements['explorer-close'].emit('click');await flush();e.history.go=go;
 assert.deepEqual(steps,[-41],'✕ goes back over the whole visit at once');
 assert.deepEqual([e.position(),e.location.hash,e.elements.explorer.open,e.elements.main.inert],[0,'',false,false]);
 const at=e.position();e.elements['explorer-close'].emit('click');await flush();assert.equal(e.position(),at,'a click on ✕ while it fades out goes nowhere');
 link('#explore/art_0123456789ab');await flush();
 let asked=0,arrive;e.history.go=delta=>{asked++;arrive=()=>go.call(e.history,delta);};
 e.elements['explorer-close'].emit('click');e.key('Escape');link('#history');await flush();
 assert.deepEqual([asked,e.elements.explorer.open,e.location.hash,e.entries()],[1,true,'#explore/art_0123456789ab',['','#explore/art_0123456789ab']],'while a slow Back is on its way, a second close or a move changes nothing');
 arrive();await flush();
 assert.deepEqual([e.elements.explorer.open,e.position(),e.entries()],[false,0,['','#explore/art_0123456789ab']],'then it lands on the page, and Forward still holds the explorer');
 e.history.go=go;link('#explore/art_0123456789ab');await flush();e.evict(1);e.window.navigation={canGoBack:false};
 e.elements['explorer-close'].emit('click');await flush();assert.deepEqual([asked,e.elements.explorer.open,e.location.hash],[1,false,''],'where the Navigation API says the page entry is gone, the close happens in place');
});

test('the current tab keeps its history entry, and a new language searches again',async()=>{
 const e=setup({journey:true});await flush();const click=(href,more={})=>{const event={button:0,target:{closest:()=>({getAttribute:()=>href})},prevented:false,preventDefault(){event.prevented=true;},...more};e.document.emit('click',event);return event.prevented;};
 e.historyReply=()=>({items:[],next:null});e.visit('#history');await flush();
 // The tab's href is #history/palac-feel by now: a link written short, as the page's own links are, is the same place.
 const kept=e.entries(),asked=e.historyRequests.length,writes=countWrites(e);
 assert.equal(click('#history'),true);await flush();
 assert.deepEqual([e.entries(),e.historyRequests.length,writes()],[kept,asked,0],'a link to the view already shown changes nothing: no request, no entry, no address written');
 assert.equal(click('#statistics'),true);assert.deepEqual([e.location.hash,e.entries().length],['#statistics/palac-feel',kept.length+1],'another tab adds one entry');
 e.visit('#explore/art_0123456789ab');await flush();assert.equal(click('#explore/art_0123456789ab'),true,'the player title linking to the record shown is stopped too');
 assert.deepEqual([click('#explore/art_0123456789ab',{ctrlKey:true}),click('#explore/art_0123456789ab',{metaKey:true}),click('#explore/art_0123456789ab',{shiftKey:true}),click('#explore/art_0123456789ab',{button:1})],[false,false,false,false],'a new tab or window still opens it');
 e.discovery=url=>url.includes('/search?')?{items:[{id:'art_0123456789ab',type:'artist',title:'Jimi Jules'}]}:entity(url.split('/').pop());
 e.visit('#explore');await flush();const query=e.elements['discovery-query'];query.value='jimi';e.elements['discovery-search'].emit('submit',{preventDefault(){}});await flush();
 const searches=()=>e.discoveryRequests.filter(r=>r.url.includes('/search?')).length,before=searches();
 e.elements['explorer-close'].emit('click');await flush();e.setLanguage('de');await flush();
 e.visit(e.elements['roots-tab'].getAttribute('href'));await flush();assert.ok(searches()>before,'results drawn in English are searched again in German');
});

test('a link to the place shown, written short, changes nothing',async()=>{
 const e=await indexed();const click=href=>{const event={button:0,target:{closest:()=>({getAttribute:()=>href})},prevented:false,preventDefault(){event.prevented=true;}};e.document.emit('click',event);return event.prevented;};
 const asked=()=>[e.requests.length,e.namesRequests.length,e.discoveryRequests.length,e.historyRequests.length,e.changesRequests.length];
 for(const [shown,link] of [['#index/artists','#index'],['#statistics/palac-feel','#statistics']]){
  e.visit(link);await flush();assert.equal(e.location.hash,shown,'the page shows '+link+' at its one address');
  const kept=e.entries(),before=asked(),writes=countWrites(e);
  assert.equal(click(link),true);await flush();
  assert.deepEqual([e.location.hash,e.entries(),asked(),writes()],[shown,kept,before,0],link+' while '+shown+' shows sends no request, adds no entry and writes no address');
 }
});

test('each address from the page is one entry at its canonical address',async()=>{
 const e=await indexed();e.historyReply=()=>({items:[],next:null});
 const link=href=>e.document.emit('click',{button:0,target:{closest:()=>({getAttribute:()=>href})},preventDefault(){}});
 const day='2020-02-29';
 for(const [href,address] of [
  ['#history','#history/palac-feel'],['#history/radio','#history/radio'],['#history/palac-feel/'+day,'#history/palac-feel/'+day],
  ['#statistics/radio','#statistics/radio'],['#statistics/palac-feel/artists','#index/artists/palac-feel?by=tracks'],
  ['#index/labels/fontanna?by=tracks&q=a','#index/labels/fontanna?by=tracks&q=a'],
  // A mark of the address's own order, which the Index shown last does not use.
  ['#index/artists?at=K','#index/artists?at=K'],
 ]){
  const writes=countWrites(e);link(href);
  assert.deepEqual([e.entries(),e.position(),writes()],[['',address],1,1],href+' from the closed page is one entry, written once, at '+address);
  await flush();assert.equal(e.location.hash,address,href+' stays at '+address);
  e.elements['explorer-close'].emit('click');await flush();assert.equal(e.elements.explorer.open,false);
 }
});

test('a link by an old name of the record shown changes nothing',async()=>{
 const e=setup({journey:true});await flush();
 e.discovery=url=>url.includes('/search?')?{items:[{id:'art_0123456789ab',type:'artist',title:'Jimi Jules'}]}:entity(url.includes('plex_')?'trk_0123456789ab':url.split('/').pop());
 const click=href=>{const event={button:0,target:{closest:()=>({getAttribute:()=>href})},prevented:false,preventDefault(){event.prevented=true;}};e.document.emit('click',event);return event.prevented;};
 for(const [old,address] of [['#explore/plex_7','#explore/trk_0123456789ab'],['#explore/artist/Jimi%20Jules','#explore/art_0123456789ab']]){
  click(old);await flush();assert.equal(e.location.hash,address,old+' opens as '+address);
  const kept=e.entries(),asked=e.discoveryRequests.length,writes=countWrites(e);
  assert.equal(click(old),true);await flush();
  assert.deepEqual([e.location.hash,e.entries(),e.discoveryRequests.length,writes()],[address,kept,asked,0],old+' while '+address+' shows sends no request, adds no entry and writes no address');
 }
});

test('a reload keeps the explorer entry and the Forward ones, and its ✕ closes in place',async()=>{
 const e=setup({journey:true,hash:'#explore?q=alpha',state:{explorer:true}});e.discovery=url=>url.includes('/search?')?{items:[]}:entity(url.split('/').pop());await flush();
 assert.deepEqual([e.entries(),e.elements['discovery-query'].value],[['#explore?q=alpha'],'alpha'],'no page is pushed under it, so Forward entries stay');
 let asked=0;e.history.back=()=>{asked++;};
 e.elements['explorer-close'].emit('click');await flush();
 assert.deepEqual([asked,e.elements.explorer.open,e.location.hash,e.elements.main.inert],[0,false,'',false],'the entry under a reloaded explorer may not be this page, so ✕ never goes back to it');
});

test('an entry the browser added itself closes in place, never onto another explorer entry',async()=>{
 const e=setup({journey:true});e.discovery=url=>entity(url.split('/').pop());await flush();
 e.document.emit('click',{button:0,target:{closest:()=>({getAttribute:()=>'#explore/art_0123456789ab'})},preventDefault(){}});await flush();
 e.visit('#history');await flush();assert.deepEqual([e.entries(),e.position()],[['','#explore/art_0123456789ab','#history/palac-feel'],2],'a typed URL adds its own entry');
 e.elements['explorer-close'].emit('click');await flush();
 assert.deepEqual([e.elements.explorer.open,e.location.hash,e.position()],[false,'',2],'so ✕ closes in place instead of landing on the explorer entry under it');
 e.history.go(-1);await flush();assert.equal(e.elements.explorer.open,true,'Back reopens that older entry, as browsers do');
 e.elements['explorer-close'].emit('click');await flush();assert.deepEqual([e.elements.explorer.open,e.location.hash],[false,''],'and its ✕ closes it in place too');
 e.document.emit('click',{button:0,target:{closest:()=>({getAttribute:()=>'#statistics'})},preventDefault(){}});await flush();
 e.history.back=()=>{e.history.replaceState({explorer:true},'','#history');e.window.emit('popstate');};
 e.elements['explorer-close'].emit('click');await flush();
 assert.deepEqual([e.elements.explorer.open,e.location.hash],[false,''],'a trip back that lands in the explorer still ends closed, never stuck');
});

test('Back then Forward keeps an entry this page opened, and a reloaded typed entry keeps Forward',async()=>{
 const e=setup({journey:true});e.discovery=url=>entity(url.split('/').pop());await flush();
 e.document.emit('click',{button:0,target:{closest:()=>({getAttribute:()=>'#explore/art_0123456789ab'})},preventDefault(){}});await flush();
 e.history.go(-1);await flush();assert.equal(e.elements.explorer.open,false);
 e.history.go(1);await flush();assert.equal(e.elements.explorer.open,true,'Forward reopens it');
 e.elements['explorer-close'].emit('click');await flush();
 assert.deepEqual([e.elements.explorer.open,e.position(),e.entries()],[false,0,['','#explore/art_0123456789ab']],'its close still goes back, so no second radio entry is left behind');
 e.visit('#history');await flush();assert.equal(e.history.state.explorer,true,'an entry the browser added is marked as found');
 const again=setup({journey:true,hash:'#history',state:{explorer:true}});await flush();
 assert.deepEqual(again.entries(),['#history/palac-feel'],'so its reload pushes no page over the Forward entries');
});

test('a focused result replaced by a live search hands focus to the field, not to the page',async()=>{
 const e=setup({journey:true});await flush();const query=e.elements['discovery-query'],results=e.elements['discovery-results'];
 e.discovery=url=>url.includes('/search?')?{items:[{id:'art_0123456789ab',type:'artist',title:'Jimi Jules'}]}:entity(url.split('/').pop());
 e.document.emit('click',{button:0,target:{closest:()=>({getAttribute:()=>'#explore'})},preventDefault(){}});await flush();
 query.value='jimi';query.emit('input');e.fire(300);await flush();firstLink(results).focus();
 query.value='jimi j';query.emit('input');e.fire(300);await flush();
 assert.equal(e.document.activeElement,query,'Space then types, it does not toggle the radio');
 firstLink(results).focus();e.discovery=url=>url.includes('/search?')?null:entity(url.split('/').pop());
 query.value='jimi ju';query.emit('input');e.fire(300);await flush();
 assert.deepEqual([results.hidden,e.document.activeElement],[true,query],'a failed search that hides the results does the same');
 e.discovery=url=>url.includes('/search?')?{items:[{id:'art_0123456789ab',type:'artist',title:'Jimi Jules'}]}:entity(url.split('/').pop());
 query.value='jimi';query.emit('input');e.fire(300);await flush();firstLink(results).focus();
 query.value='j';query.emit('input');assert.equal(e.document.activeElement,query,'and so does a field cut under two characters');
});

test('a track that arrives while the explorer closes does not close it in place, and a result opened by touch raises no keyboard',async()=>{
 const e=setup({journey:true});await flush();
 e.response={track:null,audience:{available:false,listeners:null}};await e.poll();await flush();
 e.document.emit('click',{button:0,target:{closest:()=>({getAttribute:()=>'#explore'})},preventDefault(){}});await flush();
 assert.equal(e.elements['discovery-status'].textContent,'Nothing on air right now. Search to start.');
 let arrive;const go=e.history.go;e.history.go=delta=>{arrive=()=>go.call(e.history,delta);};
 e.elements['explorer-close'].emit('click');
 e.response={track:{id:'123',title:'Later',artist:'Artist Later'},audience:{available:true,listeners:2,measuredAt:new Date(e.clock.now).toISOString()}};await e.poll();await flush();
 assert.deepEqual([e.elements.explorer.open,e.location.hash],[true,'#explore'],'the track waits for the close, it does not land the leaving page');
 arrive();await flush();assert.deepEqual([e.elements.explorer.open,e.position(),e.entries()],[false,0,['','#explore']],'Back lands on the page and Forward keeps the explorer');
 e.history.go=go;e.discovery=url=>url.includes('/search?')?{items:[{id:'art_0123456789ab',type:'artist',title:'Jimi Jules'}]}:entity(url.split('/').pop());
 e.document.emit('click',{button:0,target:{closest:()=>({getAttribute:()=>'#explore?q=jimi'})},preventDefault(){}});await flush();
 const query=e.elements['discovery-query'],results=e.elements['discovery-results'];let loaded;
 e.discovery=url=>url.includes('/search?')?{items:[{id:'art_0123456789ab',type:'artist',title:'Jimi Jules'}]}:new Promise(resolve=>{loaded=()=>resolve(entity(url.split('/').pop()));});
 const result=firstLink(results);result.focus();follow(e,result);await flush();
 assert.equal(e.document.activeElement,e.elements.explorer,'while the record loads, focus waits on the explorer, visible and not a field');
 loaded();await flush();
 const title=e.document.activeElement;assert.deepEqual([title.tabIndex,title===e.elements.explorer,title===query,title.textContent.length>0],[-1,false,false,true],'then it lands on the record\'s title');
});

test('Escape while composing text stays in the field',async()=>{
 const e=setup({journey:true});e.discovery=url=>entity(url.split('/').pop());await flush();
 e.document.emit('click',{button:0,target:{closest:()=>({getAttribute:()=>'#explore/art_0123456789ab'})},preventDefault(){}});await flush();
 assert.equal(e.key('Escape',undefined,{isComposing:true}).prevented,false);await flush();
 assert.equal(e.elements.explorer.open,true,'Escape that ends a composition does not close the explorer');
 e.key('Escape',undefined,{defaultPrevented:true});await flush();assert.equal(e.elements.explorer.open,true,'nor one a field already used');
 e.key('Escape');await flush();assert.deepEqual([e.elements.explorer.open,e.location.hash],[false,''],'a plain Escape closes it');
});

test('with nothing on air, the radio\'s answers leave the search page and its focus alone',async()=>{
 const e=setup({journey:true,media:['(pointer:fine)']});await flush();
 e.response={track:null,audience:{available:false,listeners:null}};await e.poll();await flush();
 const query=e.elements['discovery-query'];let focused=0;query.focus=()=>{focused++;};
 e.visit('#explore');await flush();const opened=focused;assert.ok(opened>=1,'a fine pointer gets the field');
 await e.poll();await e.poll();await flush();
 assert.equal(focused,opened,'answers without a track do not pull focus back to the field');
});

test('an #explore link opened before the radio answers lands on the record once it does',async()=>{
 const e=setup({journey:true,hash:'#explore',deferFetch:true});const note=e.elements['discovery-status'];
 e.discovery=url=>entity(url.split('/').pop());await flush();
 assert.equal(note.textContent,'','no Nothing on air while the radio has not answered');
 e.complete(0,status('First'));await flush();
 assert.equal(e.location.hash,'#explore/plex_123','the answer lands on the record on air');
 const idle=setup({journey:true,hash:'#explore',deferFetch:true});await flush();
 idle.complete(0,{track:null,audience:{available:false,listeners:null}});await flush();
 assert.equal(idle.elements['discovery-status'].textContent,'Nothing on air right now. Search to start.','or says that nothing is on air');
 const typing=setup({journey:true,hash:'#explore',deferFetch:true});await flush();
 typing.elements['discovery-query'].value='a';typing.complete(0,status('First'));await flush();
 assert.equal(typing.location.hash,'#explore','a field the listener started to fill keeps the search page');
});

test('a station change during a preview keeps the preview, and its end gives the radio back to the station it paused',async()=>{
 for(const [on,why] of [[true,'the radio was on: the bar keeps the station it paused'],[false,'the radio was paused: the bar takes the station shown']]){
  const e=setup({journey:true});await flush();
  e.discovery=()=>({entity:{id:'trk_0123456789ab',type:'track',title:'T',previewUrl:'/api/discovery/preview/trk_0123456789ab'},included:[]});
  e.elements['preview-audio'].play=async()=>{};
  if(on){e.click();e.playing();}
  e.visit('#explore/trk_0123456789ab');await flush();
  e.elements['entity-inspector'].querySelector('.preview-toggle').emit('click');await flush();
  assert.equal(e.window.Pavoia.getState().wanted,false,'the preview pauses the radio');
  const toggle=()=>e.elements['entity-inspector'].querySelector('.preview-toggle'),s=()=>e.window.Pavoia.getState();
  const playing=toggle().getAttribute('data-playing');assert.notEqual(playing,null,'the preview plays');
  e.change('06');
  assert.deepEqual([s().viewing,s().stage,s().wanted,e.audio.src,toggle().getAttribute('data-playing')],['etage-zero',on?'palac-feel':'etage-zero',false,undefined,playing],why+', and the preview goes on');
  toggle().emit('click');await flush();
  assert.deepEqual([s().stage,s().wanted,e.audio.src,toggle().getAttribute('data-playing')],[on?'palac-feel':'etage-zero',on,on?'/stream/palac-feel.mp3':undefined,null],on?'its end plays the station it paused':'its end plays nothing');
  if(!on)continue;
  toggle().emit('click');await flush();assert.equal(s().wanted,false,'a second preview holds the radio again');
  e.elements['play-shown'].emit('click');await flush();
  assert.deepEqual([s().stage,s().wanted,e.audio.src,toggle().getAttribute('data-playing')],['etage-zero',true,'/stream/etage-zero.mp3',null],'the hero\'s play ends the preview and plays the station shown');
 }
});

test('the search field takes focus only where a pointer cannot open a keyboard',async()=>{
 for(const [media,focused] of [[['(pointer:fine)'],true],[[],false]]){
  const e=setup({journey:true,media});await flush();e.visit('#explore');await flush();
  assert.equal(e.document.activeElement===e.elements['discovery-query'],focused,media.join()||'touch');
 }
});

test('the explorer header is one row: tabs, the search on Roots, and ✕',async()=>{
 const html=web('index.html'),top=html.slice(html.indexOf('<header class="explorer-top">'),html.indexOf('</header>',html.indexOf('<header class="explorer-top">')));
 assert.deepEqual([...top.matchAll(/<(h2|nav|a|form|label|input|button)\b/g)].map(m=>m[1]),['h2','nav','a','a','a','a','form','label','input','button'],'no eyebrow, no Play radio, no Search button');
 assert.match(top,/<h2 id="explorer-title" class="visually-hidden" data-journey="roots">The roots<\/h2>/,'one constant name, for screen readers');
 assert.match(top,/<a href="#explore" id="roots-tab" data-journey="exploreTab">Roots<\/a><a href="#history" data-journey="history">History<\/a><a href="#statistics" data-journey="statistics">Statistics<\/a><a href="#index\/artists" id="index-tab" data-journey="indexTab">Index<\/a>/);
 assert.match(top,/<label for="discovery-query" class="visually-hidden" data-journey="searchLabel">/);
 assert.match(top,/<input id="discovery-query" type="search" maxlength="100" autocomplete="off" enterkeyhint="search" placeholder="Search artists, tracks, releases, labels">/);
 assert.match(top,/<button id="explorer-close" type="button" aria-label="Back to listening" title="Back to listening"><svg [^>]*aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"\/><\/svg><\/button>/,'the sheet\'s ✕');
 assert.ok(!html.includes('explorer-play')&&!web('waveform.js').includes('explorer-play'),'the second play button is gone');
 const journey=web('journey.js');
 for(const pair of ["roots:'The roots'","roots:'Die Wurzeln'","exploreTab:'Roots'","exploreTab:'Wurzeln'","statistics:'Statistics'","statistics:'Statistik'","history:'Verlauf'","indexTab:'Index'"])assert.ok(journey.includes(pair),pair);
 for(const gone of ['explore','exploreLabel','connections','backListen','playRadio','pauseRadio','search','limited','selected','source'])assert.doesNotMatch(journey,new RegExp('(?<![\\w$])'+gone+':'),gone+' is gone');
 const e=setup({journey:true});await flush();
 assert.deepEqual([e.elements['explorer-close'].getAttribute('aria-label'),e.elements['explorer-close'].title,e.elements['discovery-query'].placeholder],['Back to listening','Back to listening','Search artists, tracks, releases, labels']);
 e.setLanguage('de');
 assert.deepEqual([e.elements['explorer-close'].getAttribute('aria-label'),e.elements['explorer-close'].title,e.elements['discovery-query'].placeholder],['Zurück zum Radio','Zurück zum Radio','Künstler, Tracks, Alben, Labels suchen'],'short enough to fit the 294px field of a 360px phone, verb included');
 e.visit('#history');await flush();assert.equal(e.elements['explorer-title'].textContent,'','no script renames the explorer per tab');
 assert.ok(!require('node:fs').existsSync(resolve(__dirname,'../web/explore.js')),'the unused explore.js is gone');
 assert.doesNotMatch(readFileSync(resolve(__dirname,'../docs/PLAYER_DISCOVERY_STEP.md'),'utf8'),/explore\.js/);
});

test('the explorer frame stops above the player bar and its controls read in Inter',()=>{
 const rules=cssRules(),phone=cssRules('(max-width:760px)');
 assert.match(rules.get(':root'),/--surface: #141210; --raised: rgb\(240 237 229 \/ \.06\);/);
 assert.match(rules.get(':root'),/--s1:4px; --s2:8px; --s3:16px; --s4:24px; --s5:40px; --s6:64px; --top:72px;/,'one spacing scale');
 assert.match(rules.get('#explorer'),/position:fixed; inset:0 0 var\(--bar\); z-index:9; width:auto; height:auto; max-width:none; max-height:none; margin:0; overflow:auto; overscroll-behavior:contain; padding:0 0 var\(--s6\); scroll-padding-top:calc\(var\(--top\) \+ var\(--s2\)\); border:0; background:var\(--surface\);.*transform:translateY\(12px\)/,'edge to edge above the bar, on every width; whatever Tab reaches scrolls into view whole, ring included, under the sticky bar');
 assert.doesNotMatch(rules.get('#explorer'),/box-shadow|inset:16px/,'no frame and no band of dimmed photo around it');
 assert.equal(phone.get('#explorer').trim(),'scroll-padding-top:var(--s2);','the same frame on a phone, where the bar scrolls away and only the ring needs room');
 assert.ok(/z-index:10/.test(rules.get('.player')),'the player bar stays above it');
 assert.ok(![...rules.keys(),...phone.keys()].some(selector=>selector.includes('#explorer')&&selector.includes('backdrop')),'a plain dialog has no backdrop');
 assert.match(web('style.css'),/@starting-style \{ #explorer\[open\] \{ opacity:0; transform:translateY\(12px\); \} \}/,'the sheet\'s 12px rise');
 assert.match(rules.get('body:has(dialog[open])'),/overflow:hidden/,'either dialog locks the page scroll');
 assert.ok(!rules.has('body:has(#stations-sheet[open])'));
 assert.ok(!/#141210|#2c2722/.test([...rules.entries()].filter(([selector])=>selector!==':root').map(([,body])=>body).join()),'surfaces and hovers use the tokens');
 assert.ok(![...rules.keys()].some(selector=>/#explorer.*:hover/.test(selector)&&/background/.test(rules.get(selector))),'no hover boxes');
 assert.match(rules.get('.explorer-top'),/position:sticky; top:0; z-index:2; display:flex; align-items:center; height:var\(--top\); padding:0 var\(--gutter\); gap:var\(--s4\); background:var\(--surface\); border-bottom:1px solid var\(--line\);/,'the bar stays at the top, on the page grid');
 assert.match(rules.get('#explorer > :not(.explorer-top, audio)'),/margin-inline:var\(--gutter\)/,'everything under it starts on the gutter, like the hero and the player bar');
 assert.doesNotMatch(rules.get('#explorer .collection-note'),/margin:/,'a note keeps the gutter: only its block margins are its own');
 assert.match(rules.get('#explorer #explorer-close'),/margin-right:-12px/,'the ✕ glyph ends on the gutter');
 assert.match(rules.get('p, h1, h2'),/font-size: inherit;/,'the hidden explorer title takes no size of its own');
 assert.match(phone.get('.explorer-top'),/position:static; height:auto; flex-wrap:wrap; row-gap:var\(--s2\); padding-block:var\(--s2\);/,'on a phone the bar scrolls away');
 assert.match(rules.get('.discovery-search input'),/text-overflow:ellipsis/,'a long query ends on an ellipsis');
 assert.match(rules.get('#explorer input::placeholder'),/color:var\(--muted\); opacity:1;/,'the placeholder, now the field\'s only visible name, reads at 5.4:1 in the palette');
 assert.match(rules.get('#explorer input[type=search]::-webkit-search-cancel-button'),/appearance:none/,'one ✕ in the explorer: the browser\'s clear mark goes, from the search and from a list\'s filter');
 assert.match(rules.get('html'),/scrollbar-gutter:stable/,'locking the page scroll keeps the scrollbar\'s room, so the player bar does not move');
 const actions='#explorer :is(#music-status button, #history-more, .stage-switch)';
 assert.match(rules.get(actions),/min-height:44px; padding:0 var\(--s3\); font:14px Inter,sans-serif; border:1px solid var\(--line\);/,'Try again and Show earlier tracks');
 assert.match(rules.get(actions+':hover'),/border-color:var\(--muted\)/);
 assert.match(rules.get('#explorer button'),/min-height:44px/);
 assert.match(rules.get('#explorer input'),/height:44px; padding:0 var\(--s3\); font:16px Inter,sans-serif; color:var\(--cream\); background:transparent; border:1px solid var\(--line\); border-radius:0;/,'16px keeps iOS from zooming; the box border is the line');
 assert.match(rules.get('#explorer input:is(:hover, :focus)'),/border-color:var\(--muted\)/);
 assert.ok(![...rules.keys()].some(selector=>/select/.test(selector)),'no select is left to style: the stage row replaced it');
 assert.ok(!/#4b4640|#302a24|#b49b7c/i.test(web('style.css')),'no off-token colours');
 assert.match(rules.get('#explorer input:focus-visible'),/outline-offset:-1px/,'the ring sits on the border');
 assert.ok(!rules.has('.discovery-search>div'));assert.doesNotMatch(rules.get('.discovery-search'),/mono/);
 assert.match(rules.get('.discovery-search'),/flex:0 1 360px/,'360px on the right of the row');
 assert.match(phone.get('.discovery-search'),/order:1; flex-basis:100%/,'full width under the tabs on a phone');
 assert.match(rules.get('.explorer-top'),/display:flex; align-items:center;/);assert.match(phone.get('.explorer-top'),/flex-wrap:wrap/);
 assert.match(rules.get('.explorer-nav'),/flex-shrink:0;.*margin-right:auto/,'the tabs sit left and never wrap for the search');
 assert.match(rules.get('#close-stations, #explorer #explorer-close'),/width:44px; height:44px; padding:0; border:0;/,'both ✕ are the same 44px button');
 assert.ok(![...rules.keys(),...phone.keys()].some(selector=>/explorer-controls|explorer-top h2/.test(selector)),'no 11px mono controls and no serif title left in the header');
 assert.match(rules.get('.explorer-nav a'),/font:22px\/1\.2 var\(--serif\); color:var\(--soft\)/,'the tabs read in the heading style');
 assert.match(rules.get('.explorer-nav a::after'),/position:absolute; inset:auto 0 8px; height:1px; background:currentColor; transform:scaleX\(0\)/);
 assert.match(rules.get('.explorer-nav a[aria-current]::after'),/transform:scaleX\(1\)/,'the current tab takes the 1px line of a checked stage');
 assert.ok(![...rules.values()].some(body=>/text-decoration-thickness/.test(body)),'the current tab takes the 1px line of a checked stage');
 assert.deepEqual([...rules].filter(([selector,body])=>/#explorer|\.explorer|\.entity|\.row|\.root|\.history|\.music|\.chart/.test(selector)&&/text-underline-offset:(?!3px)/.test(body)).map(([selector])=>selector),[],'one underline offset in the explorer: 3px');
 assert.match(rules.get('#explorer .collection-note'),/color:var\(--soft\); font-size:12px/,'notes read the same in every tab');
 assert.ok(!rules.has('#music-view .collection-note'));
 assert.match(rules.get('.explore-workspace'),/margin-top:var\(--s5\)/);assert.match(rules.get('.regions'),/margin-top:var\(--s5\)/,'results start where the regions of a record do');
});

// Step 6, then explorer v2 step 2: a record is a header, then what is close to it, ranked, then About and On the radio.
// Explore plan step 7: with no map, On the radio comes first, before what is close to it.
const byClass=(root,name)=>root.descendants().filter(n=>(n.className||n.attrs?.class||'').split(' ').includes(name));
const inspector=e=>e.elements['entity-inspector'];

// One of the explorer's hooks on window.Pavoia, stood in for: it counts its calls and answers value.
const counting=(e,name,value)=>{const calls=[];e.window.Pavoia[name]=()=>{calls.push(name);return value;};return calls;};

test('the radio is on while its sound is wanted, or while a preview holds it to give it back',async()=>{
 const e=setup();await flush();
 assert.equal(e.run('radioOn()'),false,'paused, with no preview');
 e.window.Pavoia.previewResume=()=>true;assert.equal(e.run('radioOn()'),true,'a preview that paused a playing radio');
 e.window.Pavoia.previewResume=()=>false;assert.equal(e.run('radioOn()'),false,'a preview over a paused radio');
 e.click();assert.equal(e.run('radioOn()'),true,'playing');
 const x=setup({journey:true});await flush();x.elements['preview-audio'].play=async()=>{};
 x.discovery=()=>({entity:{id:'trk_0123456789ab',type:'track',title:'T',previewUrl:'/api/discovery/preview/trk_0123456789ab',connections:[]},included:[]});
 for(const on of [true,false]){
  if(on){x.click();x.playing();}
  x.visit('#explore/trk_0123456789ab');await flush();
  assert.equal(x.window.Pavoia.previewResume(),false,'no preview yet');
  byClass(inspector(x),'preview-toggle')[0].emit('click');await flush();
  assert.deepEqual([x.window.Pavoia.getState().wanted,x.window.Pavoia.previewResume(),x.run('radioOn()')],[false,on,on],on?'a preview over the playing radio gives it back':'a preview over a paused radio gives nothing back');
  byClass(inspector(x),'preview-toggle')[0].emit('click');await flush();
  assert.equal(x.window.Pavoia.previewResume(),false,'its end gives the radio back, and holds nothing more');
  x.elements['explorer-close'].emit('click');await flush();if(on)x.window.Pavoia.pause();
 }
});

test('playShown() plays the station shown: on the station heard it plays or ends a preview, apart it cuts to the station shown',async()=>{
 const {saved,storage}=remembered();const e=setup({storage});await flush();
 const stopped=counting(e,'stopPreview',false);
 e.location.hash='#bus';e.window.emit('hashchange');e.run('playShown()');
 assert.deepEqual([e.window.Pavoia.getState().wanted,e.audio.src],[false,undefined],'the Bus has nothing to play');
 e.location.hash='';e.window.emit('popstate');
 e.run('playShown()');
 assert.deepEqual([e.window.Pavoia.getState().wanted,e.audio.src,stopped.length],[true,'/stream/palac-feel.mp3',0],'paused on the station heard, it plays');
 e.playing();const calls=e.audio.calls.length;e.run('playShown()');
 assert.deepEqual([e.audio.calls.length,stopped.length],[calls,1],'playing the station heard, it only ends a preview: no new connection');
 // The stream drops and waits to try again; then the listener plays the station shown.
 e.error();assert.equal(e.elements['playback-status'].textContent,'Reconnecting…');
 const cancelled=counting(e,'cancelPreview',undefined),asked=e.requests.length;e.change('07');
 assert.deepEqual([e.window.Pavoia.getState().viewing,e.window.Pavoia.getState().apart,e.elements['playback-status'].textContent],['fontanna',true,'Reconnecting…'],'the rail shows another station, and the reconnect goes on');
 e.run('playShown()');
 assert.deepEqual([e.window.Pavoia.getState().stage,e.window.Pavoia.getState().apart,e.window.Pavoia.getState().wanted,e.audio.src,saved['pavoia-station']],['fontanna',false,true,'/stream/fontanna.mp3','fontanna'],'apart, the bar takes the station shown, plays it and remembers it');
 assert.deepEqual([cancelled.length,stopped.length],[1,1],'a preview is cancelled, not ended into the old station');
 assert.equal(e.elements['playback-status'].textContent,'Connecting…','a new station connects; the old one\'s reconnect is over');
 assert.ok(![...e.timers.values()].some(t=>t.delay===1000),'its retry is cleared');
 assert.deepEqual([e.elements['player-title'].textContent,e.elements['player-stage'].children[0]],['Loading track…','Fontanna'],'the bar names the station at once, and waits for its track');
 assert.deepEqual(e.requests.slice(asked).map(r=>r.url),['/api/radio/fontanna'],'and asks what it has on air, once while the change still asks it');
 assert.equal(e.run('air.has("palac-feel")'),false,'the station left is followed no more');
 e.error();assert.ok([...e.timers.values()].some(t=>t.delay===1000),'a loss on the new station starts the ladder from its first step');
 const paused=setup();await flush();paused.click();paused.playing();paused.change('09');await flush();paused.click();
 const again=paused.requests.length;paused.run('playShown()');
 assert.deepEqual([paused.window.Pavoia.getState().stage,paused.window.Pavoia.getState().wanted,paused.audio.src],['closing',true,'/stream/closing.mp3'],'apart and paused, it plays the station shown');
 assert.deepEqual(paused.requests.slice(again).map(r=>r.url),['/api/radio/closing'],'and asks again what it has on air');
});

test('tuneShown() gives the bar the station shown and starts nothing',async()=>{
 const {saved,storage}=remembered();const e=setup({storage});await flush();
 e.click();e.playing();e.change('07');e.click();
 assert.deepEqual([e.window.Pavoia.getState().stage,e.window.Pavoia.getState().apart],['palac-feel',true],'paused while another station shows');
 e.run('lost=true;retries=3;retryTimer=setTimeout(connect,1000)');e.run('tuneShown()');
 assert.deepEqual([e.window.Pavoia.getState().stage,e.window.Pavoia.getState().apart,e.window.Pavoia.getState().wanted,e.audio.src,saved['pavoia-station']],['fontanna',false,false,undefined,'fontanna']);
 assert.deepEqual([e.run('lost'),e.run('retries'),[...e.timers.values()].some(t=>t.delay===1000)],[false,0,false],'no trace of the old station\'s reconnect');
 assert.deepEqual([e.elements['player-title'].textContent,e.elements['player-stage'].children[0]],['Loading track…','Fontanna'],'the bar names it at once');
 assert.equal(e.run('air.has("palac-feel")'),false,'the station left is followed no more');
 e.click();assert.equal(e.audio.src,'/stream/fontanna.mp3','the bar\'s play then starts it');
});

test('Switch to this station moves the music by itself, with a station change that only shows',async()=>{
 // selectMood() only shows while the radio is on, so tune() alone moves the music.
 const e=setup();await flush();e.click();e.playing();const calls=e.audio.calls.length;e.window.Pavoia.tune('closing');
 assert.deepEqual([e.window.Pavoia.getState().stage,e.window.Pavoia.getState().apart,e.audio.src,e.audio.calls.length],['closing',false,'/stream/closing.mp3',calls+1],'while the radio is on, the music moves to it, in one connection');
 const {saved,storage}=remembered();const x=setup({storage});await flush();x.window.Pavoia.tune('closing');
 assert.deepEqual([x.window.Pavoia.getState().stage,x.window.Pavoia.getState().apart,x.audio.src,saved['pavoia-station']],['closing',false,undefined,'closing'],'while it is off, the bar takes it and nothing plays');
});

test('Switch to this station, the media keys and the keys in the explorer go through playShown() while the radio is on',async()=>{
 const e=setup();await flush();const stage=()=>e.window.Pavoia.getState().stage,viewing=()=>e.window.Pavoia.getState().viewing;
 // playShown() on another station cancels a preview first, as its one mark here; play() does too, so each act is counted alone.
 const stopped=counting(e,'stopPreview',false),cancelled=counting(e,'cancelPreview',undefined);
 e.window.Pavoia.tune('fontanna');e.actions.nexttrack();e.elements.explorer.open=true;e.key('2');e.key('ArrowRight');
 assert.deepEqual([stage(),e.audio.src,stopped.length,cancelled.length],['palac-dance',undefined,0,0],'paused, each one only changes the station');
 e.elements.explorer.open=false;e.click();e.playing();
 for(const [what,act,heard,shown] of [['tune',()=>e.window.Pavoia.tune('closing'),'closing','closing'],['nexttrack',()=>e.actions.nexttrack(),'essentials','essentials'],['previoustrack',()=>e.actions.previoustrack(),'closing','closing'],
  ['2, explorer closed',()=>e.key('2'),'closing','bermuda-evening'],['ArrowRight, explorer closed',()=>e.key('ArrowRight'),'closing','palac-dance']]){
  const before=cancelled.length;act();
  assert.deepEqual([stage(),viewing(),e.audio.src,cancelled.length-before],[heard,shown,'/stream/'+heard+'.mp3',/explorer closed/.test(what)?0:1],what);
 }
 e.elements.explorer.open=true;
 for(const [what,act,expected] of [['4 in the explorer',()=>e.key('4'),'palac-feel'],['ArrowLeft in the explorer',()=>e.key('ArrowLeft'),'palac-dance']]){
  const before=cancelled.length;act();assert.deepEqual([stage(),viewing(),e.audio.src,cancelled.length-before],[expected,expected,'/stream/'+expected+'.mp3',1],what);
 }
 e.window.Pavoia.pause();e.window.Pavoia.previewResume=()=>true;const held=cancelled.length;
 e.key('3');assert.deepEqual([stage(),e.audio.src,cancelled.length-held,stopped.length],['palac-dance',undefined,0,0],'in the explorer, the key of the station already shown and heard leaves a preview playing');
 e.key('4');assert.deepEqual([stage(),e.audio.src,cancelled.length-held],['palac-feel','/stream/palac-feel.mp3',1],'another key ends it and plays the station picked');
});

test('the media keys step from the station heard, and a key in the explorer plays the station shown',async()=>{
 const e=setup();await flush();const stage=()=>e.window.Pavoia.getState().stage;
 e.click();e.playing();e.change('07');e.actions.nexttrack();
 assert.deepEqual([stage(),e.window.Pavoia.getState().viewing,e.audio.src],['etage-zero','etage-zero','/stream/etage-zero.mp3'],'next after Lost in Feelings, the station heard, not after Fontanna, the station shown');
 e.change('07');e.actions.previoustrack();assert.equal(stage(),'palac-feel','previous too');
 e.change('07');e.elements.explorer.open=true;e.key('6');
 assert.deepEqual([stage(),e.window.Pavoia.getState().apart,e.audio.src],['fontanna',false,'/stream/fontanna.mp3'],'the key of the station shown moves the music to it');
});
test('paused apart, next on the lock screen and a key in the explorer tune the bar to the station shown, and play nothing',async()=>{
 const run=async act=>{const {saved,storage}=remembered();const e=setup({journey:true,storage});await flush();e.click();e.playing();e.key('ArrowRight');e.click();await flush();
  const s=()=>e.window.Pavoia.getState(),calls=e.audio.calls.length;
  assert.deepEqual([s().stage,s().viewing,s().wanted],['palac-feel','etage-zero',false],'paused while the station after the one heard shows');
  act(e);await flush();
  return [s().stage,s().viewing,s().apart,s().wanted,e.audio.calls.length-calls,e.audio.src,e.mediaSession.metadata?.album,e.mediaSession.playbackState,saved['pavoia-station'],e.elements['play-shown'].hidden];
 };
 const tuned=['etage-zero','etage-zero',false,false,0,undefined,'Etage 0','paused','etage-zero',true];
 assert.deepEqual(await run(e=>e.actions.nexttrack()),tuned,'next steps from the station heard to the station shown: the bar and the lock screen take it');
 assert.deepEqual(await run(e=>{e.elements.explorer.open=true;e.key('5');}),tuned,'in the explorer, the key of the station shown tunes the bar, as Switch to this station does');
 assert.deepEqual(await run(e=>e.key('5')),['palac-feel','etage-zero',true,false,0,undefined,'Lost in Feelings · Pałac','paused','palac-feel',false],'with the hero in sight, the key of the station shown changes nothing: its play is there');
});
test('a preview that holds the radio counts as the radio on, and the arrows in the explorer step from the station shown',async()=>{
 const held=async()=>{const e=setup();await flush();e.window.Pavoia.previewResume=()=>true;return {e,cancelled:counting(e,'cancelPreview',undefined)};};
 const state=e=>[e.window.Pavoia.getState().stage,e.window.Pavoia.getState().wanted,e.audio.src];
 const next=await held();next.e.actions.nexttrack();
 assert.deepEqual([...state(next.e),next.cancelled.length],['etage-zero',true,'/stream/etage-zero.mp3',1],'the lock screen\'s next ends the preview and plays the next station');
 const tuned=await held();tuned.e.window.Pavoia.tune('closing');
 assert.deepEqual([...state(tuned.e),tuned.cancelled.length],['closing',true,'/stream/closing.mp3',1],'Switch to this station too');
 const e=setup();await flush();e.click();e.playing();e.change('07');e.elements.explorer.open=true;e.key('ArrowRight');
 assert.deepEqual(state(e),['ambiance',true,'/stream/ambiance.mp3'],'after Fontanna, the station shown, not after Lost in Feelings, the station heard');
 e.elements.explorer.open=false;e.change('07');e.elements.explorer.open=true;e.key('ArrowLeft');assert.equal(e.window.Pavoia.getState().stage,'etage-zero','and before it, not before Ambiance, the station heard');
 e.change('07');e.window.Pavoia.tune('fontanna');
 assert.deepEqual(state(e),['fontanna',true,'/stream/fontanna.mp3'],'Switch to this station on the station shown, while another plays, moves the music to it');
});

test('Switch to this station leaves a preview playing on the station already shown and heard',async()=>{
 const e=setup();await flush();e.window.Pavoia.previewResume=()=>true;
 const cancelled=counting(e,'cancelPreview',undefined),stopped=counting(e,'stopPreview',false);
 e.window.Pavoia.tune('palac-feel');
 assert.deepEqual([e.window.Pavoia.getState().wanted,e.audio.src,cancelled.length,stopped.length],[false,undefined,0,0]);
 e.window.Pavoia.tune('closing');
 assert.deepEqual([e.window.Pavoia.getState().stage,e.audio.src],['closing','/stream/closing.mp3'],'another station ends it and plays');
});
// Look without losing the music: while the radio is on, a station change shows the station, and the hero's play moves
// the music there in one cut.
test('while the radio plays, the rail, the sheet, the swipe, the arrows and 1 to 9 show a station and ask for no stream',async()=>{
 const e=setup({media:['(max-width: 760px)']});await flush();e.click();e.playing();
 const calls=e.audio.calls.length,src=e.audio.src,s=()=>e.window.Pavoia.getState(),poster=e.elements.poster;poster.setPointerCapture=()=>{};
 const swipe=dx=>{poster.emit('pointerdown',{pointerType:'touch',isPrimary:true,pointerId:1,clientX:200,clientY:300,target:{closest:()=>null}});poster.emit('pointerup',{pointerId:1,clientX:200+dx,clientY:300});};
 for(const [what,act,shown] of [['the rail',()=>e.change('01'),'bermuda-day'],['the sheet',()=>{e.elements['open-stations'].emit('click');e.change('02');},'bermuda-evening'],
  ['a swipe',()=>swipe(-120),'palac-dance'],['ArrowRight',()=>e.key('ArrowRight'),'palac-feel'],['ArrowRight again',()=>e.key('ArrowRight'),'etage-zero'],['ArrowLeft',()=>e.key('ArrowLeft'),'palac-feel'],
  ['a swipe back',()=>swipe(120),'palac-dance'],['6',()=>digit(e,6),'fontanna'],['the keypad 1',()=>e.key('Numpad1',undefined,{key:'1'}),'bermuda-day']]){
  act();
  assert.deepEqual([s().viewing,s().stage,s().wanted,e.audio.calls.length,e.audio.src,e.audio.paused,e.elements['player-title'].textContent,Boolean(e.elements['stations-sheet'].open)],[shown,'palac-feel',true,calls,src,false,'First',false],what+' shows the station, and the music heard goes on');
 }
});

test('the hero\'s play shows only while the bar holds another station, never on the Bus, and names what the station shown plays',async()=>{
 const e=setup();await flush();const control=e.elements['play-shown'];
 const read=()=>[control.hidden,e.elements['play-shown-text'].textContent,control.getAttribute('aria-label'),control.title];
 assert.equal(control.hidden,true,'at the start the bar holds the station shown');
 e.change('03');assert.equal(control.hidden,true,'paused, a change tunes the bar too: there is nothing else to play');
 e.click();e.playing();
 let reply;const audience=status('x').audience;e.air=id=>id==='bermuda-day'?new Promise(resolve=>{reply=resolve;}):{track:{id:'1',title:'Dance',artist:'A'},audience};
 e.change('01');
 assert.deepEqual(read(),[false,'Loading track…','Play Under the Sun, Loading track…','Play Under the Sun'],'while its answer is on its way, it says so, and its name holds its words');
 reply({track:{id:'9',title:'Rumba',artist:'Bawrut'},audience});await flush();
 assert.deepEqual(read(),[false,'Rumba · Bawrut','Play Under the Sun, now Rumba · Bawrut','Play Under the Sun'],'a track: its title and artist, as the bar writes them');
 e.air=id=>id==='bermuda-day'?{track:{id:'8',title:'',artist:''},audience}:{track:null,audience};await e.poll();
 assert.deepEqual(read(),[false,'Untitled track · Unknown artist','Play Under the Sun, now Untitled track · Unknown artist','Play Under the Sun'],'a track with no title or artist');
 e.air=id=>({track:null,audience});await e.poll();
 assert.deepEqual(read(),[false,'Play','Play Under the Sun','Play Under the Sun'],'no track announced: the word Play');
 e.air=id=>({track:{id:'9',title:'Rumba',artist:'Bawrut'},audience});await e.poll();e.air=()=>null;await e.poll();
 assert.deepEqual(read(),[false,'Play','Play Under the Sun','Play Under the Sun'],'a failed answer: Play, never a track it may no longer play');
 e.air=id=>({track:{id:'9',title:'Rumba',artist:'Bawrut'},audience});await e.poll();
 e.setLanguage('de');
 assert.deepEqual(read(),[false,'Rumba · Bawrut','Under the Sun abspielen, gerade Rumba · Bawrut','Under the Sun abspielen'],'in German');
 e.air=()=>({track:null,audience});await e.poll();
 assert.deepEqual(read(),[false,'Abspielen','Under the Sun abspielen','Under the Sun abspielen'],'and its play word');
 e.setLanguage('en');
 e.visit('#bus');assert.equal(control.hidden,true,'the Bus has no stream: it hides');
 e.history.back();assert.equal(control.hidden,false,'leaving the Bus brings it back');
 e.change('03');assert.equal(control.hidden,true,'back on the station heard, it goes');
 const html=web('index.html'),rules=cssRules();
 assert.match(html,/<span id="mood-fact">Pałac stage<\/span><button type="button" id="play-shown" class="play-shown" hidden><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle [^>]+\/><path [^>]+\/><\/svg><span id="play-shown-text"><\/span><\/button>/,'a button after the stage, hidden until needed: a ring with a triangle, unread, then its words');
 assert.match(rules.get('#mood-stage:has(#play-shown:not([hidden]))'),/display:flex; align-items:center; gap:var\(--s3\); width:0; min-width:100%;/,'it shares the eyebrow row, which never widens the title block');
 assert.match(rules.get('.play-shown'),/min-width:0; height:44px; margin-block:calc\(\(1lh - 44px\) \/ 2\);.*border:0; background:none; color:var\(--cream\); font:inherit;/,'a 44px target that overhangs the line evenly, in the eyebrow\'s letters');
 assert.match(rules.get('.play-shown'),/margin-inline:-10px calc\(100% - max\(100%, 46em\) - 10px\); padding:0 10px;/,'past a short title block, the track runs on to a full one, and the target keeps 10px at each side');
 assert.equal(cssRules('(max-width:760px)').get('.play-shown').trim(),'margin-inline-end:-10px;','on a phone the title block is the hero\'s width, so the track ends with it');
 assert.doesNotMatch(web('style.css'),/container-type|\dcq[whib]/,'no query container: an engine that gives one layout containment would draw the hero\'s photo inside the poster');
 assert.match(rules.get('.play-shown:focus-visible'),/outline-offset:-6px;/,'its focus ring stays inside the 44px target, clear of the title');
 assert.match(rules.get('.play-shown span'),/min-width:0; padding:var\(--s4\); margin:calc\(-1 \* var\(--s4\)\); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;/,'a long track ends in an ellipsis, with its clip a halo\'s width out');
 assert.match(rules.get('#mood-fact'),/flex-shrink:0/,'and the stage keeps its words');
 assert.match(rules.get('.play-shown:is(:hover, :focus-visible) span'),/text-decoration:underline/,'its words underline under the pointer and under the keyboard, as the other text buttons do');
});

test('one press on the hero\'s play is one cut to the station shown',async()=>{
 const e=setup();await flush();e.click();e.playing();e.change('03');await flush();
 const calls=e.audio.calls.length,old=e.audio.calls.at(-1),order=[],control=e.elements['play-shown'],play=e.elements.play;
 const {pause,load}=e.audio,start=e.audio.play;
 e.audio.pause=()=>{order.push('pause');pause();};e.audio.load=()=>{order.push('load');load();};e.audio.play=()=>{order.push('play '+e.audio.src);return start();};
 assert.equal(e.document.body.getAttribute('data-away'),'','away while another station shows');
 control.focus();control.emit('click');
 assert.deepEqual([e.audio.calls.length,e.audio.src,order],[calls+1,'/stream/palac-dance.mp3',['pause','load','play /stream/palac-dance.mp3']],'one new connection, after the old stream is released');
 assert.deepEqual([control.hidden,e.document.body.getAttribute('data-away'),e.document.activeElement===play,play.focusOptions?.preventScroll],[true,null,true,true],'the control goes, the page is no longer away, and focus is on Play, with no scroll');
 assert.deepEqual([e.window.Pavoia.getState().stage,e.window.Pavoia.getState().apart,e.window.Pavoia.getState().wanted,e.elements['playback-status'].textContent],['palac-dance',false,true,'Connecting…'],'the bar holds the station shown, and connects to it');
 old.reject(Object.assign(new Error(),{name:'AbortError'}));await flush();e.playing();
 assert.equal(e.elements['playback-status'].textContent,'Playing','the old stream\'s end changes nothing');
});

test('the bar\'s button and Space pause the station heard while another station shows',async()=>{
 const e=setup();await flush();e.click();e.playing();e.change('03');const s=()=>e.window.Pavoia.getState();
 e.click();
 assert.deepEqual([s().wanted,e.audio.src,s().stage,s().viewing,e.elements.play.getAttribute('aria-label')],[false,undefined,'palac-feel','palac-dance','Play'],'the button pauses the music heard in one press');
 assert.equal(e.key('Space').prevented,true);
 assert.deepEqual([s().wanted,e.audio.src,s().stage,s().viewing],[true,'/stream/palac-feel.mp3','palac-feel','palac-dance'],'Space plays it again, not the station shown');
 e.playing();e.key('Space');
 assert.deepEqual([s().wanted,e.audio.src,s().viewing],[false,undefined,'palac-dance'],'and Space pauses it, in one press');
});

test('a pause while apart keeps the bar on the station paused; its play resumes it, the hero\'s play starts the other',async()=>{
 const {saved,storage}=remembered();const e=setup({storage});await flush();e.click();e.playing();e.change('03');e.click();const s=()=>e.window.Pavoia.getState();
 assert.deepEqual([s().stage,s().apart,textOf(e.elements['player-stage']),e.elements['player-title'].textContent,e.elements['play-shown'].hidden],['palac-feel',true,'Tuned to Lost in Feelings','First',false],'paused, the bar still holds the station paused, says so, and the hero still offers the other');
 e.click();assert.deepEqual([e.audio.src,s().stage,saved['pavoia-station']],['/stream/palac-feel.mp3','palac-feel','palac-feel'],'the bar\'s play resumes the station paused');
 e.click();e.elements['play-shown'].emit('click');
 assert.deepEqual([e.audio.src,s().stage,s().apart,saved['pavoia-station']],['/stream/palac-dance.mp3','palac-dance',false,'palac-dance'],'the hero\'s play starts the station shown');
 // A start the browser blocks is a pause: the bar keeps its station with the words, and the next change moves the bar.
 const tried=e.audio.calls.length;e.change('06');e.audio.calls.at(-1).reject(Object.assign(new Error(),{name:'NotAllowedError'}));await flush();
 assert.deepEqual([s().wanted,s().stage,s().viewing,e.elements['playback-status'].textContent],[false,'palac-dance','etage-zero','Press play to start'],'blocked: the bar keeps the station it tried');
 e.change('07');assert.deepEqual([s().stage,s().apart,e.audio.calls.length,e.elements.player.dataset.status],['fontanna',false,tried,'paused'],'the next station change tunes the bar to it, plays nothing, and the refused start is a plain pause again');
});

test('a pause while apart, then Switch to the station shown, tunes the bar to it and plays nothing',async()=>{
 const {saved,storage}=remembered();const e=setup({journey:true,storage});await flush();e.discovery={items:[]};
 e.click();e.playing();e.change('01');e.click();const calls=e.audio.calls.length;
 const hearing=()=>e.document.querySelectorAll('.mood').filter(label=>'data-hearing' in label.attrs).map(label=>label.querySelector('input').value);
 const content=await stagePlace(e,'#statistics/bermuda-day'),button=byClass(content,'stage-switch')[0];
 assert.deepEqual([button.hidden,hearing()],[false,['04']],'the station shown is not the one in the bar, so Switch shows');
 button.emit('click');await flush();
 assert.deepEqual([e.window.Pavoia.getState().stage,e.window.Pavoia.getState().apart,e.window.Pavoia.getState().wanted,e.audio.calls.length,e.audio.src,textOf(e.elements['player-stage']),saved['pavoia-station']],['bermuda-day',false,false,calls,undefined,'Under the Sun · Bermuda','bermuda-day'],'the bar takes the station shown, and nothing plays');
 assert.deepEqual([button.hidden,e.elements['play-shown'].hidden,hearing()],[true,true,['01']],'Switch goes, the hero\'s play too, and the mark moves to the station tuned');
});

test('two stations apart are polled each 10 s, one station once; a station left is forgotten',async()=>{
 const e=setup();await flush();e.air=id=>status('Track '+id);
 let said=0;e.window.addEventListener('pavoia:radio',()=>{said++;});
 const tick=async()=>{const from=e.airRequests.length,before=said;await e.poll();await flush();return [e.airRequests.slice(from).map(r=>r.id).sort(),said-before];};
 assert.deepEqual(await tick(),[['palac-feel'],1],'one station: one request per tick, announced once');
 e.click();e.playing();e.change('03');await flush();
 assert.deepEqual(await tick(),[['palac-dance','palac-feel'],2],'apart: the station shown and the station heard, one announcement per answer');
 assert.deepEqual([e.elements['player-title'].textContent,e.elements['play-shown-text'].textContent],['Track palac-feel','Track palac-dance · Artist Track palac-dance'],'each answer lands in its own place');
 let from=e.airRequests.length;e.document.hidden=false;e.document.emit('visibilitychange');await flush();
 assert.deepEqual(e.airRequests.slice(from).map(r=>r.id).sort(),['palac-dance','palac-feel'],'a page shown again asks both');
 e.change('06');await flush();
 assert.deepEqual([e.run('air.has("palac-dance")'),e.run('polls.has("palac-dance")')],[false,false],'a station left behind is forgotten');
 assert.deepEqual(await tick(),[['etage-zero','palac-feel'],2],'and asked no more');
 e.change('04');await flush();
 assert.deepEqual(await tick(),[['palac-feel'],1],'back on the station heard: one request again');
});

test('the lock screen keeps the station heard: metadata, album and playbackState',async()=>{
 const e=setup({journey:true});await flush();const audience=status('x').audience;
 e.air=id=>({track:{id:'1'+id.length,title:id==='palac-feel'?'Heard':'Shown',artist:'A'},audience});await e.poll();
 e.click();e.playing();e.change('03');await flush();await e.poll();await flush();
 const lock=()=>[e.mediaSession.metadata?.title,e.mediaSession.metadata?.album,e.mediaSession.playbackState];
 assert.deepEqual(lock(),['Heard','Lost in Feelings · Pałac','playing'],'another station shows: the lock screen keeps the one heard');
 e.air=id=>id==='palac-dance'?null:{track:{id:'1'+id.length,title:'Heard',artist:'A'},audience};await e.poll();await flush();
 assert.deepEqual(lock(),['Heard','Lost in Feelings · Pałac','playing'],'a failed answer of the station shown leaves it alone');
 e.click();await flush();assert.deepEqual(lock(),['Heard','Lost in Feelings · Pałac','paused'],'a pause is a pause of the station heard');
 e.click();e.playing();e.air=id=>({track:{id:'1'+id.length,title:'Next',artist:'A'},audience});e.actions.nexttrack();await flush();
 assert.deepEqual([e.window.Pavoia.getState().stage,e.audio.src,...lock()],['etage-zero','/stream/etage-zero.mp3','Next','Etage 0','playing'],'next steps from the station heard and plays it');
});

test('the hero\'s play gives focus to the play button when it goes: on a press, an arrow key and Back to the Bus',async()=>{
 const e=setup();await flush();e.click();e.playing();const control=e.elements['play-shown'],play=e.elements.play;
 const focusControl=()=>{control.focus();play.focusOptions=undefined;assert.equal(control.hidden,false);};
 const onPlay=()=>[e.document.activeElement===play,play.focusOptions?.preventScroll,control.hidden];
 e.change('03');focusControl();control.emit('click');assert.deepEqual(onPlay(),[true,true,true],'a press');
 e.change('02');focusControl();e.key('ArrowRight');assert.deepEqual([...onPlay(),e.window.Pavoia.getState().apart],[true,true,true,false],'an arrow back to the station heard');
 e.visit('#bus');e.change('01');focusControl();e.history.back();assert.deepEqual([...onPlay(),e.location.hash],[true,true,true,'#bus'],'Back to the Bus');
 e.history.go(1);focusControl();e.setLanguage('de');assert.equal(e.document.activeElement,control,'a language switch keeps its focus');
 e.setLanguage('en');const link=e.elements['bus-link'];link.focus();e.change('03');
 assert.deepEqual([control.hidden,e.document.activeElement===link],[true,true],'a control that goes without focus moves none');
});
test('while another station shows, the hero\'s playlist, sleeve and portrait are the station shown\'s, and the bar\'s cover the station heard\'s',async()=>{
 const e=setup({journey:true});await flush();const audience=status('x').audience,n=id=>id==='palac-feel'?1:2;
 e.air=id=>({track:{id:'1',title:'T '+id,artist:'A',coverUrl:`/api/radio/${id}/artwork/${n(id)}/cover?v=${'a'.repeat(16)}`,artistImageUrl:`/api/radio/${id}/artwork/${n(id)}/portrait?v=${'b'.repeat(16)}`},audience});
 await e.poll();await flush();e.click();e.playing();await flush();
 const read=()=>[e.elements['stage-spotify'].hidden,e.elements['stage-spotify'].href,e.elements['hero-cover'].src,e.elements['painted-artist'].src,e.elements['dock-cover'].src];
 assert.deepEqual(read(),[false,'https://open.spotify.com/playlist/4ZyQd8CWhF3uO8C6sHcACS',`/api/radio/palac-feel/artwork/1/cover?v=${'a'.repeat(16)}`,`/api/radio/palac-feel/artwork/1/portrait?v=${'b'.repeat(16)}`,`/api/radio/palac-feel/artwork/1/cover?v=${'a'.repeat(16)}`],'one station: its playlist, its record');
 e.change('03');await flush();
 assert.deepEqual(read(),[false,'https://open.spotify.com/playlist/7kl1EQc1ZnvLq8vZXH3qaJ',`/api/radio/palac-dance/artwork/2/cover?v=${'a'.repeat(16)}`,`/api/radio/palac-dance/artwork/2/portrait?v=${'b'.repeat(16)}`,`/api/radio/palac-feel/artwork/1/cover?v=${'a'.repeat(16)}`],'another station shown: the hero is that station\'s, the bar\'s cover stays the one heard');
 e.change('06');await flush();assert.equal(e.elements['stage-spotify'].hidden,true,'a station with no playlist has no link, while the music heard has one');
});


const cls=n=>n.className||n.attrs?.class;
const links=(over={})=>[{kind:'wikidata',url:'https://www.wikidata.org/wiki/Q1'},{kind:'other',url:'https://www.after.life/'},{kind:'discogs',url:'https://www.discogs.com/artist/1'},
 {kind:'musicbrainz',url:'https://musicbrainz.org/artist/1'},{kind:'twitter',url:'https://twitter.com/a'},{kind:'discogs',url:'https://www.discogs.com/artist/1'},{kind:'juno',url:'https://www.junodownload.com/artists/A'},
 {kind:'wikipedia',url:'https://en.wikipedia.org/wiki/A'},{kind:'lastfm',url:'https://www.last.fm/music/A'},{kind:'resident_advisor',url:'https://ra.co/dj/a'},{kind:'spotify',url:'https://open.spotify.com/artist/1'},{kind:'apple_music',url:'https://music.apple.com/artist/1'},{kind:'javascript',url:'javascript:alert(1)'}];
const recondite=(over={})=>({entity:{id:'art_000000000001',type:'artist',title:'Recondite',country:'DE',tags:['techno','seen_live','house','Electronic','acid house','acid','minimal'],links:links(),
 bio:'Recondite is a German musician.',bioSource:'wikipedia',bioUrl:'https://en.wikipedia.org/wiki/A',image:'/api/discovery/media/'+'a'.repeat(40),playlists:[],connections:[],...over},included:[]});
// Each show() opens its own record: the explorer keeps every payload it fetched, so one id is one record.
const shower=e=>{let shows=0;return async data=>{const id=data.entity.id.slice(0,-3)+String(++shows).padStart(3,'0');data={...data,entity:{...data.entity,id}};e.discovery=()=>data;e.visit('#explore/'+id);await flush();};};
// A neighbourhood as the API sends it: a record, the records it links to in full, and theirs by id only.
const id=(prefix,n)=>prefix+'_'+String(n).padStart(12,'0');
const rec=(key,title,connections=[],more={})=>({id:key,type:{art:'artist',rel:'release',lab:'label',trk:'track'}[key.slice(0,3)],title,connections:connections.map(([to,relation])=>({id:to,relation})),...more});
const hood=()=>{
 const A=n=>id('art',n),R=n=>id('rel',n),L=n=>id('lab',n),T=n=>id('trk',n);
 const centre=rec(A(1),'Recondite',[[A(101),'similar'],[A(102),'similar'],[A(104),'similar'],[A(103),'remix/shared_release'],[R(1),'release'],[R(2),'release'],[L(1),'label'],[T(1),'track'],[T(2),'track'],[T(3),'track']],
  {country:'DE',tags:['techno','ambient','seen_live'],links:links(),bio:'Recondite is a German musician.',bioSource:'wikipedia',bioUrl:'https://en.wikipedia.org/wiki/A'});
 const eulberg=rec(A(101),'Dominik Eulberg',[[A(201),'similar'],[R(3),'release']],{tags:['techno','ambient','seen_live'],trackCount:4});
 const extrawelt=rec(A(102),'Extrawelt',[[A(201),'similar'],[R(3),'release'],[R(4),'release']],{trackCount:1});
 const kiasmos=rec(A(104),'Kiasmos',[[A(201),'similar'],[T(4),'track']],{trackCount:5});
 const jimi=rec(A(103),'Jimi Jules',[[A(202),'remix']],{trackCount:11});
 const taum=rec(R(1),'Taum',[[L(1),'label']],{releaseDate:'2022-03-04'}),theater=rec(R(2),'Theater II EP',[],{releaseDate:'2017-07-21'}),plangent=rec(L(1),'Plangent',[[A(203),'artist']]);
 const tracks=[[1,'Lost in Feelings'],[2,'Lost in Feelings'],[3,'Essentials']].map(([n,station])=>rec(T(n),'Track '+n,[],{album:'Taum',durationMs:424000,playlists:[{code:'X',station}]}));
 // Eulberg's own payload names Hemmann and Shared EP, and two artists that are close, but not in sound.
 const named=[rec(A(201),'Marek Hemmann',[],{trackCount:3}),rec(R(3),'Shared EP',[],{releaseDate:'2020-01-01'}),rec(A(202),'Only Remixed'),rec(A(203),'Label Mate')];
 // Kiasmos's track comes with its own payload only.
 return {[A(1)]:{entity:centre,included:[eulberg,extrawelt,kiasmos,jimi,taum,theater,plangent,...tracks]},[A(101)]:{entity:eulberg,included:named},
  [A(104)]:{entity:kiasmos,included:[rec(T(4),'Track 4',[],{playlists:[{code:'LIF',station:'Lost in Feelings'}]})]}};
};
// The regions around the record, as read: each heading and its rows. On the radio, in their grid, is not one of them.
const regionsOf=e=>byClass(byClass(inspector(e),'regions')[0]||inspector(e),'region').filter(r=>r.attrs['aria-labelledby']!=='r-onRadio').map(r=>[textOf(r.children[0]),...byClass(r,'row').map(a=>[a.getAttribute('href').slice(9),...a.children.slice(1).map(textOf)].join('|'))]);

test('a record reads its header, then what is close to it, then About and On the radio, with no map',async()=>{
 const html=web('index.html'),journey=web('journey.js'),css=web('style.css');
 assert.match(html,/<div class="explore-workspace" id="explore-workspace" hidden><section id="entity-inspector" aria-label="Details"><\/section><\/div>\s*<audio id="preview-audio" preload="none"><\/audio>/,'one section, and the preview audio outside any banner');
 assert.match(html,/<script src="app\.js" defer><\/script>\s*<script src="closeness\.js" defer><\/script>\s*<script src="journey\.js" defer><\/script>/,'closeness.js loads before journey.js, from the same origin');
 assert.doesNotMatch(web('closeness.js'),/^\s*(?:import|export)\b|document|fetch\(|word\(/m,'a plain script: no module syntax, no page, no network, no words');
 for(const gone of ['connection-map','map-caption','map-center','map-node','mapNote','preview-banner','preview-stop','preview-title'])assert.ok(!html.includes(gone)&&!journey.includes(gone)&&!css.includes(gone),gone+' is gone');
 for(const gone of ['renderMap','relatedTitle','entity-connections','relation-kind','entity-badges','favorite-badge','favorite-mark','previewPending','moreBio','function navigate','openEntity','search-result','entity-subtitle','renderRoots','function groups','tier=','telling','root-group','root-node','entity-meta','entity-radio','moreRoots'])assert.ok(!journey.includes(gone)&&!css.includes(gone),gone+' is gone');
 assert.doesNotMatch(journey+css,/entity-link(?!s)/,'entity-link is gone');
 assert.ok(!css.includes('#efb7b0'),'no pink');
 assert.doesNotMatch(cssRules().get('.explore-workspace'),/grid-template-columns/,'one column');
 const e=setup({journey:true});await flush();const data=hood();e.discovery=url=>data[url.split('/').pop()]||null;e.visit('#explore/art_000000000001');await flush();
 assert.deepEqual([inspector(e).children.map(cls),byClass(inspector(e),'regions')[0].children.map(n=>n.dataset.key||cls(n))],[['entity-heading','regions'],['similar','worked','releases','labels','record-about','onRadio']],'the header, then the regions, About and On the radio on the same grid, in the order read');
 for(const gone of ['roots-band',"drawing('0 0 1000 72'"])assert.ok(!journey.includes(gone)&&!css.includes(gone),gone+' is gone');
});

test('a record lists what is close to it, ranked, each name with its reason in words and a fact',async()=>{
 const e=setup({journey:true});await flush();const data=hood();e.discovery=url=>data[url.split('/').pop()]||null;
 const sent=e.discoveryRequests.length;routeTo(e,'#explore/art_000000000001');await flush();
 assert.deepEqual(regionsOf(e),[
  ['Similar artists 4','art_000000000201|Marek HemmannSimilar to Dominik Eulberg, Extrawelt and 1 more|3 tracks','art_000000000101|Dominik EulbergSimilar to Recondite|4 tracks','art_000000000104|KiasmosSimilar to Recondite|5 tracks','art_000000000102|ExtraweltSimilar to Recondite|1 track'],
  ['Worked with 1','art_000000000103|Jimi JulesRemix · Shared release|11 tracks'],
  ['Releases 3','rel_000000000001|TaumPlangent|2022','rel_000000000002|Theater II EP|2017','rel_000000000003|Shared EPBy Dominik Eulberg and Extrawelt|2020'],
  ['Labels 1','lab_000000000001|Plangent']],
  'the closest first, ties to the artist with more tracks; an artist that only remixed or shares a label is never called similar; own releases newest first, then those its artists share');
 assert.deepEqual(e.discoveryRequests.slice(sent).map(r=>r.url),['/api/discovery/entity/art_000000000001','/api/discovery/entity/art_000000000101'],'one naming request: the neighbour that names Hemmann and Shared EP, the smaller of two');
 const similar=byClass(inspector(e),'region').find(r=>r.dataset.key==='similar'),row=byClass(similar,'row')[0];
 assert.deepEqual([similar.localName,similar.attrs['aria-labelledby'],similar.children[0].localName,similar.children[0].id,similar.children[1].localName,similar.children[1].children[0].localName,row.parent.localName],['section','r-similar','h4','r-similar','ol','li','li'],'a region reads as a heading, then a list');
 assert.deepEqual([row.className,row.children.map(cls),row.children[1].children.map(cls)],['row',['picture','row-text','row-fact'],['row-name','row-line']],'each name is one row: picture, name over its reason, and a fact');
 e.elements['explorer-close'].emit('click');e.setLanguage('de');e.visit('#explore/art_000000000001');await flush();
 assert.deepEqual(regionsOf(e).map(r=>r.slice(0,2)),[['Ähnliche Künstler 4','art_000000000201|Marek HemmannÄhnlich wie Dominik Eulberg, Extrawelt und 1 weitere|3 Tracks'],['Gearbeitet mit 1','art_000000000103|Jimi JulesRemix · Gemeinsame Veröffentlichung|11 Tracks'],['Veröffentlichungen 3','rel_000000000001|TaumPlangent|2022'],['Labels 1','lab_000000000001|Plangent']],'the same, in German, with no request');
 assert.equal(e.discoveryRequests.slice(sent).filter(r=>r.url.includes('/entity/')).length,2,'a record already fetched opens from the cache');
 const rules=cssRules(),phone=cssRules('(max-width:760px)');
 assert.match(rules.get('.regions'),/display:grid; grid-template-columns:repeat\(auto-fit,minmax\(280px,1fr\)\); gap:var\(--s5\); margin-top:var\(--s5\);/);
 assert.match(phone.get('.regions'),/grid-template-columns:minmax\(0,1fr\)/,'one column on a phone');
 assert.match(rules.get('.region h4, .record-about h4'),/font:22px\/1\.2 var\(--serif\)/);assert.match(rules.get('.region h4 small'),/font:11px var\(--mono\);.*color:var\(--muted\)/);
 assert.match(rules.get('.region ol'),/margin:0; padding:0; list-style:none;/);
});

test('a region shows six names until the listener asks, says when it is empty, and leaves out the rest',async()=>{
 const e=setup({journey:true});await flush();const A=n=>id('art',n),L=n=>id('lab',n),R=n=>id('rel',n);
 // A label with eight artists: two share Other with it, one shares Third; a release fetched later points back to it.
 const artists=[1,2,3,4,5,6,7,8].map(n=>rec(A(n),'Artist '+n,n===1?[[L(2),'label'],[L(3),'label']]:n===2?[[L(2),'label']]:[],{trackCount:10-n}));
 const label={entity:rec(L(1),'Afterlife',artists.map(a=>[a.id,'artist'])),included:artists};
 // Artist 2 names Other with fewer connections than Artist 1, and brings the release that points back.
 const named={entity:artists[1],included:[rec(L(2),'Other'),rec(L(3),'Third'),rec(R(1),'Back Pointer',[[L(1),'label']],{artist:'Artist 1',releaseDate:'2024-01-01'})]};
 e.discovery=url=>({[L(1)]:label,[A(2)]:named})[url.split('/').pop()]||null;
 e.visit('#explore/'+L(1));await flush();
 assert.deepEqual(regionsOf(e).map(r=>[r[0],r.length-1]),[['Artists 8',6],['Similar labels 1',1],['Releases 1',1]],'six names at first; Third shares one artist only, so it is left out when Other shares two');
 assert.deepEqual(regionsOf(e).slice(1).map(r=>r[1]),['lab_000000000002|Other2 artists in common','rel_000000000001|Back PointerArtist 1|2024'],'a release fetched later that points back to the label is one of its releases');
 const artistsRegion=byClass(inspector(e),'region')[0],more=byClass(artistsRegion,'text-button')[0];
 assert.equal(more.textContent,'Show all 8');more.emit('click');
 const rows=byClass(artistsRegion,'row');
 assert.deepEqual([rows.length,artistsRegion.children.includes(more),e.document.activeElement===rows[6]],[8,false,true],'the list grows in place and focus moves to the first new row');
 // A label whose releases are not in any payload yet says so; an artist with no similar artist keeps the heading.
 e.discovery=url=>url.endsWith(L(9))?{entity:rec(L(9),'Quiet',[[A(9),'artist']]),included:[rec(A(9),'Alone',[],{trackCount:1})]}:url.endsWith(A(11))?{entity:rec(A(11),'Chlär',[[L(11),'label'],[R(11),'release']]),included:[rec(L(11),'C O U P'),rec(R(11),'Don’t Give Yourselves',[[L(11),'label']],{releaseDate:'2021-01-01'})]}:{entity:rec(A(12),'Nobody'),included:[]};
 e.visit('#explore/'+L(9));await flush();
 assert.deepEqual(byClass(inspector(e),'region').map(r=>textOf(r)),['Artists 1Alone1 track','Similar labels 0No similar labels in the collection yet.','Releases 0This label’s releases are not listed yet.']);
 e.visit('#explore/'+A(11));await flush();
 assert.deepEqual(byClass(inspector(e),'region').map(r=>textOf(r.children[0])+'|'+textOf(r.children[1])),['Similar artists 0|No similar artists in the collection yet.','Releases 1|Don’t Give YourselvesC O U P2021','Labels 1|C O U P'],'Worked with, empty, is left out');
 e.visit('#explore/'+A(12));await flush();
 const note=()=>byClass(inspector(e),'entity-heading')[0].children.at(-1).children.at(-1);
 assert.deepEqual([inspector(e).children.map(cls),cls(note()),note().textContent],[['entity-heading'],'collection-note','Nothing in the collection is linked to Nobody yet.'],'nothing close at all: one sentence instead, in the header under its line');
 e.elements['explorer-close'].emit('click');e.setLanguage('de');e.visit('#explore/'+A(12));await flush();
 assert.equal(note().textContent,'In der Sammlung ist noch nichts mit Nobody verbunden.');
});

test('a hop paints its header at once from a record already fetched, and its body once: when the names arrive, or 2.5 s after',async()=>{
 const e=setup({journey:true});await flush();const data=hood();let release;e.elements['explore-workspace'].append(inspector(e));
 e.discovery=url=>{const key=url.split('/').pop();return key==='art_000000000101'?new Promise(resolve=>{release=()=>resolve(data[key]);}):data[key]||null;};
 e.visit('#explore/art_000000000001');await flush();
 const title=()=>inspector(e).descendants().find(n=>n.localName==='h3');
 assert.deepEqual([inspector(e).children.map(cls),e.document.activeElement===title(),[...e.timers.values()].some(t=>t.delay===2500)],[['entity-heading'],true,true],'the header shows and takes focus while the names load');
 release();await flush();
 assert.deepEqual([inspector(e).children.map(cls),[...e.timers.values()].some(t=>t.delay===2500)],[['entity-heading','regions'],false],'then the body, once');
 // Extrawelt came in Recondite's payload: its header shows with no wait, before its own payload answers.
 const before=e.discoveryRequests.length;let late;e.discovery=()=>new Promise(resolve=>{late=resolve;});
 follow(e,byClass(inspector(e),'row').find(a=>a.getAttribute('href')==='#explore/art_000000000102'));await flush();
 assert.deepEqual([title().textContent,e.elements['explore-workspace'].getAttribute('aria-busy'),e.document.activeElement===title(),inspector(e).children.map(cls),e.discoveryRequests.length],['Extrawelt',null,true,['entity-heading'],before+1],'a name already fetched opens at once, at its title');
 e.fire(2500);await flush();
 assert.deepEqual(regionsOf(e),[['Similar artists 1','art_000000000201|Marek HemmannSimilar to Extrawelt|3 tracks'],['Releases 1','rel_000000000003|Shared EP|2020']],'2.5 s later the body paints with the records it has, each heading counting the names it lists');
 const shown=[...inspector(e).descendants()];late({entity:data.art_000000000001.included[1],included:[]});await flush();
 assert.ok(sameRows(inspector(e).descendants(),shown),'a payload that answers after the paint changes nothing on the page');
 const saving=setup({journey:true,saveData:true});await flush();saving.discovery=url=>data[url.split('/').pop()]||null;
 routeTo(saving,'#explore/art_000000000001');await flush();
 assert.deepEqual([saving.discoveryRequests.filter(r=>r.url.includes('/entity/')).length,regionsOf(saving)[0].length-1,regionsOf(saving)[0][0]],[1,3,'Similar artists 3'],'Save-Data sends no naming request and shows the names it has, under their count');
});

test('a track shown from a copy another payload included gets its preview from its own payload, and keeps it after that payload comes again',async()=>{
 const T1='trk_000000000001',track=data=>({entity:{...data.art_000000000001.included.find(r=>r.id===T1),previewUrl:'/api/discovery/preview/'+T1},included:[]});
 const title=e=>inspector(e).descendants().find(n=>n.localName==='h3'),toggle=e=>byClass(inspector(e),'preview-toggle')[0];
 const e=setup({journey:true});await flush();const data=hood();data[T1]=track(data);e.discovery=url=>data[url.split('/').pop()]||null;e.elements['explore-workspace'].append(inspector(e));
 e.visit('#explore/art_000000000001');await flush();
 follow(e,byClass(inspector(e),'row').find(a=>a.getAttribute('href')==='#explore/'+T1));
 assert.deepEqual([title(e).textContent,toggle(e)],['Track 1',undefined],'its header shows at once from the copy Recondite included, which has no preview');
 await flush();
 assert.deepEqual([Boolean(toggle(e)),e.document.activeElement===title(e)],[true,true],'its own payload draws the header again with the preview, and focus stays on the title');
 // Its payload first, then Recondite's, which includes a copy of it: the record kept is still its payload's.
 const back=setup({journey:true});await flush();back.discovery=url=>data[url.split('/').pop()]||null;
 back.visit('#explore/'+T1);await flush();routeTo(back,'#explore/art_000000000001');await flush();routeTo(back,'#explore/'+T1);
 assert.ok(toggle(back),'back on the track, its header shows the preview at once');
});

test('a record shown from a name at hand stays when its own payload fails, and its body paints with the records at hand',async()=>{
 const e=setup({journey:true});await flush();const data=hood();e.discovery=url=>data[url.split('/').pop()]||null;e.elements['explore-workspace'].append(inspector(e));
 e.visit('#explore/art_000000000001');await flush();
 // Extrawelt came in Recondite's payload; its own fails.
 follow(e,byClass(inspector(e),'row').find(a=>a.getAttribute('href')==='#explore/art_000000000102'));await flush();
 const title=inspector(e).descendants().find(n=>n.localName==='h3');
 assert.deepEqual([title.textContent,e.document.activeElement===title,e.elements['explore-workspace'].hidden,e.elements['discovery-status'].textContent,textOf(byClass(inspector(e),'entity-trail')[0])],['Extrawelt',true,false,'','Recondite'],'the header, its focus and its line back to Recondite stay');
 assert.deepEqual(regionsOf(e),[['Similar artists 1','art_000000000201|Marek HemmannSimilar to Extrawelt|3 tracks'],['Releases 1','rel_000000000003|Shared EP|2020']],'as at the deadline');
 e.discovery=()=>null;routeTo(e,'#explore/art_000000000999');await flush();
 assert.deepEqual([e.elements['explore-workspace'].hidden,e.elements['discovery-status'].textContent],[true,'These details are unavailable. Try another record or search again.'],'a record with nothing at hand still says it is unavailable');
});

test('a track with no profiles yet names its artist and release in its line, and says so in one note only',async()=>{
 for(const [language,line,note] of [['en','Someone · Somewhere · 5:01','Artist and release profiles are not available for this track yet.'],['de','Someone · Somewhere · 5:01','Für diesen Track gibt es noch keine Künstler- und Veröffentlichungsprofile.']]){
  const e=setup({journey:true});await flush();e.setLanguage(language);
  e.discovery={entity:{id:'plex_123',plexId:'123',type:'track',title:'A Track Without Profiles',artist:'Someone',album:'Somewhere',durationMs:301000,basicDetails:true,connections:[]},included:[]};
  e.visit('#explore/plex_123');await flush();
  assert.deepEqual([textOf(byClass(inspector(e),'entity-line')[0]),byClass(inspector(e),'collection-note').map(n=>n.textContent),byClass(inspector(e),'regions').length],[line,[note],0]);
 }
});

test('the track on air opens with no request, says it is on air, and puts its dot out in place when it leaves',async()=>{
 const e=setup({journey:true});await flush();
 const track={entity:rec('trk_0123456789ab','Abandoned Soul',[['art_000000000001','primary'],['art_000000000002','remixer'],['lab_000000000001','label']],{durationMs:423993,playlists:[{code:'ANB',station:'As Night Begins'}]}),included:[rec('art_000000000001','Jimi Jules',[['art_000000000003','similar']],{trackCount:11}),rec('art_000000000002','Recondite',[['art_000000000003','similar']],{trackCount:7}),rec('lab_000000000001','Watergate Records')]};
 const credit=n=>({entity:track.included[n],included:[rec('art_000000000003','Guy Gerber',[],{trackCount:3})]});
 e.discovery=url=>url.endsWith('/track/123')?track:url.endsWith('art_000000000001')?credit(0):url.endsWith('art_000000000002')?credit(1):null;
 await e.poll();await flush();const sent=e.discoveryRequests.length;e.elements['go-deeper'].emit('click');await flush();
 assert.deepEqual(e.discoveryRequests.slice(sent).map(r=>r.url),['/api/discovery/entity/art_000000000001','/api/discovery/entity/art_000000000002'],'no request for the track itself, only its credited artists, together');
 const heading=byClass(inspector(e),'entity-heading')[0],eyebrow=heading.children[1].children[0];
 assert.deepEqual([textOf(eyebrow),byClass(eyebrow,'on-air').length],['Track ·\u00a0On air',1],'Track · ● On air');
 assert.deepEqual(regionsOf(e),[['Made by 2','art_000000000001|Jimi JulesArtist|11 tracks','art_000000000002|ReconditeRemixed by|7 tracks'],['Similar artists 1','art_000000000003|Guy GerberSimilar to Jimi Jules and Recondite|3 tracks'],['Labels 1','lab_000000000001|Watergate Records']]);
 const title=e.document.activeElement;e.response=onAirNow('456');await e.poll();await flush();
 assert.deepEqual([textOf(eyebrow),byClass(heading,'entity-heading').length,byClass(inspector(e),'entity-heading')[0]===heading,e.document.activeElement===title],['Track',0,true,true],'a new track on air puts the dot out in place: nothing is drawn again and focus stays');
 assert.match(cssRules().get('.eyebrow .on-air span span::before'),/width:6px; height:6px;.*border-radius:50%; background:var\(--red\)/);
 e.elements['explorer-close'].emit('click');e.setLanguage('de');e.response=status('First');await e.poll();await flush();e.elements['go-deeper'].emit('click');await flush();
 assert.equal(textOf(byClass(inspector(e),'entity-heading')[0].children[1].children[0]),'Track ·\u00a0Auf Sendung');
});

test('the explorer keeps the last 16 payloads, and starts its records again past 3,000',async()=>{
 const e=setup({journey:true});await flush();const workspace=e.elements['explore-workspace'],A=n=>id('art',n);
 // Artist 1 brings Kept along; artist 40 brings 3,000 tracks.
 let hold=null;e.discovery=url=>{const n=parseInt(url.split('_').pop(),10);
  const data={entity:rec(A(n),n===9999?'Kept':'Artist '+n),included:n===1?[rec(A(9999),'Kept')]:n===40?Array.from({length:3000},(_,i)=>rec(id('trk',400000+i),'Track')):[]};
  return n===9999?new Promise(resolve=>{hold=()=>resolve(data);}):data;};
 const entityRequests=()=>e.discoveryRequests.filter(r=>r.url.includes('/entity/')).length;
 for(let n=1;n<=17;n++){routeTo(e,'#explore/'+A(n));await flush();}
 let sent=entityRequests();routeTo(e,'#explore/'+A(2));await flush();
 assert.equal(entityRequests(),sent,'one of the last 16 opens from the cache');
 routeTo(e,'#explore/'+A(1));await flush();
 assert.equal(entityRequests(),sent+1,'the 17th from the end was let go, and is asked again');
 routeTo(e,'#explore/'+A(2));await flush();assert.equal(entityRequests(),sent+1,'opening a payload makes it the newest: the oldest went instead');
 routeTo(e,'#explore/'+A(40));await flush();for(let n=3;n<=17;n++){routeTo(e,'#explore/'+A(n));await flush();}
 routeTo(e,'#explore/'+A(9999));
 assert.deepEqual([workspace.getAttribute('aria-busy'),inspector(e).descendants().find(n=>n.localName==='h3').textContent],['true','Artist 17'],'past 3,000 records the cache starts again from the payloads it keeps: Kept, whose payload went, waits for its own');
 hold();await flush();assert.equal(inspector(e).descendants().find(n=>n.localName==='h3').textContent,'Kept');
 assert.match(web('journey.js'),/\/\/ ponytail: clear-all cap, an LRU if hops get slow/);
});

test('the profile keeps its picture box, names its type above the title and reads one line of facts',async()=>{
 const e=setup({journey:true});await flush();const show=shower(e);
 await show(recondite());
 const box=byClass(inspector(e),'picture')[0],img=box.children[0];
 assert.deepEqual([box.dataset.type,box.dataset.initial,img.alt,img.getAttribute('src')],['artist','R','Portrait','/api/discovery/media/'+'a'.repeat(40)],'the box holds the first letter until the image shows');
 const heading=byClass(inspector(e),'entity-heading')[0],about=heading.children[1];
 assert.deepEqual(about.children.map(n=>n.localName+'.'+(n.className||'')),['p.eyebrow','h3.','p.entity-line','p.collection-note'],'the type above the title, then one line, and a record linked to nothing says so last');
 assert.deepEqual([about.children[0].textContent,about.children[1].textContent,about.children[1].tabIndex],['Artist','Recondite',-1]);
 assert.equal(textOf(about.children[2]),'Germany','a country code reads as its name');
 await show(recondite({id:'lab_000000000001',type:'label',title:'Afterlife',country:'',tags:[],image:null}));
 const empty=byClass(inspector(e),'picture')[0];
 assert.deepEqual([empty.dataset.type,empty.dataset.initial,empty.children[0].hidden,empty.children[0].alt],['label','A',true,'Label logo'],'no image keeps the box, with the first letter in it');
 assert.deepEqual(byClass(inspector(e),'entity-line').map(textOf),[''],'no facts: the line stays, empty, and keeps its height');
 await show({entity:{id:'trk_000000000001',type:'track',title:'Abandoned Soul',artist:'Jimi Jules',album:'Watergate Records 2008-2018',releaseDate:'2019-01-01',durationMs:423993,playlists:[{code:'ANB',station:'As Night Begins'},{code:'X',station:'Not a stage'}],connections:[]},included:[]});
 assert.equal(textOf(byClass(inspector(e),'entity-line')[0]),'Jimi Jules · Watergate Records 2008-2018 · Plays on As Night Begins · 7:03','a track with no credited artist under Made by: who made it and on what, where it plays, then how long');
 assert.equal(byClass(inspector(e),'picture')[0].children[0].alt,'Cover');
 const release={entity:{id:'rel_000000000001',type:'release',title:'Theater II EP',artist:'Recondite',releaseDate:'2017-07-21',connections:[{id:'trk_000000000009',relation:'track'}]},included:[rec('trk_000000000009','Theater',[],{playlists:[{code:'LIF',station:'Lost in Feelings'}]})]};
 await show(release);
 assert.equal(textOf(byClass(inspector(e),'entity-line')[0]),'2017 · On Lost in Feelings','a release: its year, then where its tracks play');
 await show(recondite({id:'art_000000000005',title:'  émile',country:''}));
 assert.deepEqual([byClass(inspector(e),'picture')[0].dataset.initial,textOf(byClass(inspector(e),'entity-line')[0])],['É',''],'the first letter of the trimmed name, in capitals');
 e.elements['explorer-close'].emit('click');e.setLanguage('de');await show(recondite({country:'IT'}));
 assert.deepEqual([textOf(byClass(inspector(e),'entity-line')[0]),byClass(inspector(e),'picture')[0].children[0].alt],['Italien','Porträt']);
 await show(recondite({id:'lab_000000000002',type:'label'}));assert.equal(byClass(inspector(e),'picture')[0].children[0].alt,'Label-Logo');
 const rules=cssRules(),phone=cssRules('(max-width:760px)');
 assert.match(rules.get('.picture'),/position:relative; display:grid; place-items:center;.*border-radius:2px;.*font:20px var\(--serif\); color:var\(--soft\); background:var\(--raised\)/);assert.match(rules.get('.picture[data-type=artist]'),/border-radius:50%/);
 assert.match(rules.get('.picture::before'),/content:attr\(data-initial\) \/ ''/,'the letter, which screen readers skip');
 assert.match(rules.get('.picture:has(> img:not([hidden], [data-wait]))::before'),/visibility:hidden/,'a shown image hides the letter, also behind a transparent logo; a lazy one once it has loaded');
 assert.match(rules.get('.picture::after'),/position:absolute; inset:0; border-radius:inherit; box-shadow:inset 0 0 0 1px var\(--line\)/,'a 1px inner edge, so a white cover is no blank tile');
 assert.match(rules.get('.picture img'),/position:absolute; inset:0;/);
 assert.match(rules.get('.entity-heading .picture'),/width:120px; height:120px; font-size:56px/);assert.match(phone.get('.entity-heading .picture'),/width:88px; height:88px; font-size:40px/);
 assert.match(rules.get('.entity-heading'),/grid-template-columns:120px minmax\(0,1fr\); align-items:start/,'the box is reserved before the image loads, and the title starts at its top');
 assert.match(rules.get('.entity-heading h3'),/font:44px\/1\.05 var\(--serif\)/);assert.match(phone.get('.entity-heading h3'),/font-size:32px/);
 assert.match(rules.get('.eyebrow'),/font:11px\/1\.4 var\(--mono\); letter-spacing:\.08em; text-transform:uppercase; color:var\(--muted\)/);
 assert.match(rules.get('.entity-line'),/min-height:1\.4em;.*font-size:14px; line-height:1\.4; color:var\(--soft\)/,'one 14px line that keeps its height while empty');
});

test('About holds the biography, the tags and the links; On the radio lists its tracks',async()=>{
 const e=setup({journey:true});await flush();const data=hood();e.discovery=url=>data[url.split('/').pop()]||null;
 e.visit('#explore/art_000000000001');await flush();
 const grid=()=>byClass(inspector(e),'regions')[0],about=byClass(grid(),'record-about')[0],radio=grid().children.find(n=>n.dataset.key==='onRadio');
 assert.deepEqual([about.localName,cls(about),about.attrs['aria-labelledby'],about.children[0].id,about.children.map(n=>n.localName+'.'+(cls(n)||''))],['section','record-about','r-about','r-about',['h4.','div.entity-bio','p.entity-tags','p.entity-links']],'About {title}, then the biography, the tags and the links');
 assert.deepEqual([about.children[0].textContent,about.children[2].textContent],['About Recondite','techno, ambient'],'tags in words, no bookkeeping tag');
 assert.deepEqual([textOf(radio.children[0]),byClass(radio,'row').map(a=>[a.getAttribute('href'),...a.children.slice(1).map(textOf)])],['On the radio 3',[['#explore/trk_000000000001','Track 1Lost\u00a0in\u00a0Feelings','7:04'],['#explore/trk_000000000002','Track 2Lost\u00a0in\u00a0Feelings','7:04'],['#explore/trk_000000000003','Track 3Essentials','7:04']]],'each track, where it plays, each station name whole, and how long');
 assert.match(cssRules('(min-width:761px)').get('.regions > :is(.record-about, .release-years, .changes)'),/grid-column:1 \/ -2/,'on a wide screen About spans every column of the regions but the last, where the map puts On the radio');
 assert.ok(!web('style.css').includes('record-more'),'no second grid, whose columns would miss those of the regions');
 e.elements['explorer-close'].emit('click');e.setLanguage('de');e.visit('#explore/art_000000000001');await flush();
 assert.deepEqual([byClass(grid(),'record-about')[0],grid().children.find(n=>n.dataset.key==='onRadio')].map(n=>textOf(n.children[0])),['Über Recondite','Im Radio 3']);
});

test('external links sit in one line, listening services first, named, each address once',async()=>{
 const e=setup({journey:true});await flush();e.discovery=()=>recondite();e.visit('#explore/art_000000000001');await flush();
 const line=byClass(inspector(e),'entity-links')[0],[label,...sites]=line.children;
 assert.deepEqual([label.localName,label.textContent],['span','Elsewhere'],'the line says where it leads');
 assert.deepEqual(sites.map(a=>a.textContent),['Spotify','Apple Music','Wikipedia','Resident Advisor','Discogs','X','MusicBrainz','Last.fm','after.life','junodownload.com'],'all of them, in a fixed order, Wikidata and unsafe links dropped');
 assert.deepEqual([sites[0].target,sites[0].rel,sites[8].href],['_blank','noopener noreferrer','https://www.after.life/']);
 assert.deepEqual(byClass(inspector(e),'record-about')[0].children.map(cls).slice(1),['entity-bio','entity-tags','entity-links'],'last in About: after the biography and the tags');
 const rules=cssRules();
 assert.match(rules.get('.entity-links'),/display:flex; flex-wrap:wrap;.*font-size:14px; line-height:1\.4; color:var\(--soft\)/);
 assert.match(rules.get('.entity-links>span'),/font-size:12px; color:var\(--muted\)/);
 assert.match(rules.get('.entity-links a[href]::after'),/content:none/,'no arrows: the line already says they leave');
 assert.match(rules.get('.entity-links a:is(:hover, :focus-visible)'),/color:var\(--cream\); text-decoration:underline; text-underline-offset:3px/);
 e.elements['explorer-close'].emit('click');e.setLanguage('de');e.visit('#explore/art_000000000001');await flush();
 assert.equal(byClass(inspector(e),'entity-links')[0].children[0].textContent,'Anderswo');
});

test('the biography reads open, offers More only when it is cut, and credits its source once',async()=>{
 const e=setup({journey:true});await flush();const show=shower(e);
 await show(recondite());
 const bio=()=>byClass(inspector(e),'entity-bio')[0],more=()=>bio().children[1].children[0],credit=()=>bio().children[1].children[1];
 assert.deepEqual([bio().localName,bio().children[0].localName,bio().children[0].textContent,bio().children[0].lang],['div','p','Recondite is a German musician.','en'],'no summary to open first');
 assert.equal(more().hidden,true,'a short biography has no More');
 assert.deepEqual([textOf(credit()),credit().children.some(n=>n.localName==='a')],['Biography from Wikipedia',false],'its source is already in the line, so here it is plain text');
 await show(recondite({links:[]}));
 const source=credit().children.find(n=>n.localName==='a');
 assert.deepEqual([source?.textContent,source?.href],['Wikipedia','https://en.wikipedia.org/wiki/A'],'otherwise the credit is the one link');
 await show(recondite({bioSource:'plex_metadata',bioUrl:null}));assert.equal(textOf(credit()),'','no name to give, no credit');
 Object.defineProperty(e.Element.prototype,'scrollHeight',{configurable:true,get(){return this.textContent.length>40?200:100;}});
 Object.defineProperty(e.Element.prototype,'clientHeight',{configurable:true,get(){return 100;}});
 await show(recondite({bio:'A long life in music. '.repeat(20)}));
 assert.deepEqual([more().hidden,more().textContent,more().getAttribute('aria-expanded')],[false,'More','false'],'a cut biography offers More');
 more().emit('click');assert.deepEqual([more().textContent,more().getAttribute('aria-expanded')],['Less','true']);
 more().emit('click');assert.deepEqual([more().textContent,more().getAttribute('aria-expanded')],['More','false']);
 await show(recondite({bio:'Fits in four lines on a wide screen.'}));
 const watch=e.observers.at(-1),text=bio().children[0];
 assert.deepEqual([more().hidden,watch.targets,e.observers.filter(o=>o.targets.length).map(o=>o.targets)],[true,[text],[[text]]],'the biography on screen is the only one watched; nothing watches the line');
 Object.defineProperty(e.Element.prototype,'clientHeight',{configurable:true,get(){return 20;}});watch.fn();
 assert.equal(more().hidden,false,'a narrower window or a turned phone cuts it, and More appears');
 more().emit('click');Object.defineProperty(e.Element.prototype,'clientHeight',{configurable:true,get(){return 100;}});watch.fn();
 assert.equal(more().hidden,false,'open, it keeps Less');
 more().emit('click');assert.equal(more().hidden,true,'closed on a wider screen, where it fits, More goes, with no resize to say so');
 e.elements['explorer-close'].emit('click');e.setLanguage('de');await show(recondite({links:[]}));
 assert.deepEqual([textOf(credit()),more().textContent],['Biografie auf Englisch · Biografie von Wikipedia','Mehr']);
 const rules=cssRules();
 assert.match(rules.get('.entity-bio>p:first-child'),/-webkit-line-clamp:4/);assert.match(rules.get('.entity-bio'),/max-width:65ch/);
 assert.match(rules.get('.entity-bio:has([aria-expanded=true])>p:first-child'),/-webkit-line-clamp:unset; white-space:pre-line/,'More opens it in place, paragraphs apart');
 assert.doesNotMatch(rules.get('.entity-bio>p:first-child'),/white-space/,'cut, the paragraphs run on: no blank fourth line with a lone ellipsis');
});

test('the header line names the stages that play a record: each links to its place in Statistics, and a favourite shows the Essentials heart',async()=>{
 const e=setup({journey:true});await flush();const data=hood();data.art_000000000001.entity.favorite=true;e.discovery=url=>data[url.split('/').pop()]||null;
 e.visit('#explore/art_000000000001');await flush();
 const line=byClass(inspector(e),'entity-line')[0],places=line.descendants().filter(n=>n.localName==='a'),about=byClass(inspector(e),'entity-heading')[0].children.at(-1);
 assert.deepEqual([line.localName,textOf(line),places.map(a=>[a.textContent,a.getAttribute('href')]),byClass(line,'text-button').length],['p','Germany · On Lost in Feelings 2, Essentials 1',[['Lost in Feelings','#statistics/palac-feel'],['Essentials','#statistics/essentials']],0],'an artist: its country, then each stage with its count of tracks, the most played first; each a link, no tune button');
 assert.ok(about.children[2]===line,'in the title column, under the title');
 const heart=line.descendants().find(n=>n.attrs?.role==='img');
 assert.deepEqual([heart.attrs['aria-label'],heart.attrs.class,heart.attrs['aria-hidden'],heart.parent.children[1]],['Essentials favourite','essentials-icon',undefined,places[1]],'the heart goes with Essentials');
 const kept=e.entries().length;follow(e,places[1]);await flush();
 assert.deepEqual([e.window.Pavoia.getState().stage,e.elements.explorer.open,e.location.hash,e.entries().length],['palac-feel',true,'#statistics/essentials',kept+1],'the stage\'s place opens in one entry more, and the radio stays where it is');
 e.window.Pavoia.tune('nowhere');assert.equal(e.window.Pavoia.getState().stage,'palac-feel','an unknown stage changes nothing');
 follow(e,byClass(inspector(e),'row').find(a=>a.getAttribute('href')==='#explore/art_000000000104'));
 assert.deepEqual([inspector(e).descendants().find(n=>n.localName==='h3').textContent,textOf(byClass(inspector(e),'entity-line')[0])],['Kiasmos',''],'a record already fetched shows at once, before its tracks are known');
 await flush();assert.equal(textOf(byClass(inspector(e),'entity-line')[0]),'On Lost in Feelings 1','its line fills in with the body, when its own payload brings its tracks');
 e.elements['explorer-close'].emit('click');e.setLanguage('de');e.visit('#explore/art_000000000001');await flush();
 assert.deepEqual([textOf(byClass(inspector(e),'entity-line')[0]),inspector(e).descendants().find(n=>n.attrs?.role==='img').attrs['aria-label']],['Deutschland · Auf Lost in Feelings 2, Essentials 1','Essentials-Favorit']);
 data.art_000000000001.entity.favorite=false;const plain=setup({journey:true});await flush();plain.discovery=url=>data[url.split('/').pop()]||null;plain.visit('#explore/art_000000000001');await flush();
 assert.equal(inspector(plain).descendants().some(n=>n.attrs?.role==='img'),false,'no favourite, no heart');
 const rules=cssRules();
 assert.match(rules.get('.entity-line .essentials-icon'),/fill:currentColor/);
 assert.match(rules.get('.entity-line a'),/white-space:nowrap; text-decoration:underline; text-decoration-color:var\(--muted\); text-underline-offset:3px/,'stage names in a sentence carry a quiet underline at rest, and a link\'s words stay together');
 assert.ok(![...rules.keys()].some(k=>k.includes('.entity-line')&&k.includes('::after')),'the word is the target: on a wrapped line, a target grown past it would cover the stage on the line above');
 assert.match(rules.get('.entity-line a:is(:hover, :focus-visible)'),/color:var\(--cream\); text-decoration-color:currentColor; outline-offset:1px/,'cream under a pointer, and the focus ring fits in the spaces, off the word before and the count after');
 assert.match(rules.get('.entity-line > span'),/white-space:nowrap/,'a stage keeps its heart and its count on its line');
 assert.ok(places.every(a=>a.parent.localName==='span'&&a.parent.parent===line),'each stage with its count is one span of the line');
 assert.match(rules.get('.entity-line small'),/font:11px\/1\.4 var\(--mono\)/,'counts are facts');
});

test('a preview plays in place under the title, counts its seconds, and ends when its profile is left',async()=>{
 for(const on of [true,false]){
  const e=setup({journey:true});await flush();const audio=e.elements['preview-audio'];audio.play=async()=>{};
  const track=id=>({entity:{id,type:'track',title:'T',previewUrl:'/api/discovery/preview/'+id,connections:[]},included:[]});
  e.discovery=url=>url.includes('/search?')?{items:[]}:track(url.split('/').pop());
  if(on){e.click();e.playing();}
  e.visit('#explore/trk_0123456789ab');await flush();
  const toggle=()=>byClass(inspector(e),'preview-toggle')[0],label=()=>toggle().children[1].textContent;
  const about=byClass(inspector(e),'entity-heading')[0].children[1];
  assert.equal(about.children.indexOf(toggle()),3,'right under the title and its line');
  assert.deepEqual([label(),toggle().getAttribute('data-playing'),byClass(toggle(),'preview-icon')[0].children.map(n=>n.attrs.class)],['Listen · 60 s',null,['icon-start','icon-stop']]);
  toggle().emit('click');await flush();
  assert.deepEqual([audio.src,label(),toggle().getAttribute('data-playing'),e.window.Pavoia.getState().wanted],['/api/discovery/preview/trk_0123456789ab','Stop · 0:00','',false],'it plays in place and pauses the radio');
  audio.currentTime=23;e.intervals.at(-1)();assert.equal(label(),'Stop · 0:23','the clock counts it each second');
  e.visit('#explore/trk_0123456789ac');await flush();
  assert.deepEqual([audio.getAttribute('src'),e.window.Pavoia.getState().wanted,label()],[null,on,'Listen · 60 s'],'leaving its profile ends it and gives the radio back as it was');
  toggle().emit('click');await flush();e.elements['discovery-query'].value='abc';e.elements['discovery-search'].emit('submit',{preventDefault(){}});await flush();
  assert.deepEqual([audio.getAttribute('src'),e.window.Pavoia.getState().wanted],[null,on],'so does a search that replaces it');
 }
 const e=setup({journey:true});await flush();e.setLanguage('de');e.elements['preview-audio'].play=async()=>{};
 e.discovery=()=>({entity:{id:'trk_0123456789ab',type:'track',title:'T',previewUrl:'/api/discovery/preview/trk_0123456789ab',connections:[]},included:[]});
 e.visit('#explore/trk_0123456789ab');await flush();const toggle=byClass(inspector(e),'preview-toggle')[0];
 assert.equal(toggle.children[1].textContent,'Anhören · 60 s');toggle.emit('click');await flush();e.elements['preview-audio'].currentTime=5;e.intervals.at(-1)();
 assert.equal(toggle.children[1].textContent,'Stopp · 0:05');toggle.emit('click');assert.equal(toggle.children[1].textContent,'Anhören · 60 s','a second press stops it');
 const rules=cssRules();
 assert.match(rules.get('.preview-icon'),/width:44px; height:44px; border:1px solid var\(--soft\); border-radius:50%/,'the player\'s circle');
 assert.match(rules.get('.preview-toggle:not([data-playing]) .icon-stop, .preview-toggle[data-playing] .icon-start'),/display:none/);
});

test('every row is one row with no box, and Show all is a quiet text button',()=>{
 const rules=cssRules();
 assert.match(rules.get('.row'),/display:grid; grid-template-columns:40px minmax\(0,1fr\) auto; align-items:center; gap:var\(--s3\); min-height:56px; padding-block:var\(--s2\);/);
 assert.doesNotMatch(rules.get('.row'),/border|background|margin/,'no border, no hover box, nothing sticking out of the column');
 assert.match(rules.get('.row:not(:has(> .picture, > time))'),/grid-template-columns:minmax\(0,1fr\) auto/,'a ranking without pictures');
 assert.match(rules.get('.row-name, .row-line'),/overflow:hidden; text-overflow:ellipsis; white-space:nowrap;/,'one line each');
 assert.match(rules.get('.row-name'),/font-size:14px; color:var\(--cream\)/);assert.match(rules.get('.row-line'),/font-size:12px; color:var\(--soft\)/);
 assert.match(rules.get('.row-fact, .row > time'),/font:11px\/1\.4 var\(--mono\); font-variant-numeric:tabular-nums; color:var\(--muted\)/);
 assert.match(rules.get('.row[href]:is(:hover, :focus-visible) .row-name'),/text-decoration:underline; text-underline-offset:3px/,'a pointer or the keyboard underlines the name');
 assert.ok(![...rules.keys()].some(selector=>/\.root-node(?![\w-])|root-name|root-line|roots-band|root-group/.test(selector)),'the old rows, groups and band are gone');
 assert.match(rules.get('#explorer .text-button'),/color:var\(--soft\); font:14px Inter,sans-serif;/);assert.doesNotMatch(rules.get('#explorer .text-button'),/underline/,'Show all has no underline at rest');
 assert.match(rules.get('#explorer .text-button:is(:hover, :focus-visible)'),/color:var\(--cream\); text-decoration:underline; text-underline-offset:3px/);
});

test('search results use the same regions and rows, show a line only when the list is cut or empty, and say their count unseen',async()=>{
 const e=setup({journey:true});await flush();const query=e.elements['discovery-query'],results=e.elements['discovery-results'],status=e.elements['discovery-status'];
 const items=[{id:'trk_000000000001',type:'track',title:'Taum',artist:'Recondite',album:'Taum'},{id:'art_000000000001',type:'artist',title:'Recondite',artist:'',album:''},{id:'rel_000000000001',type:'release',title:'Taum',artist:'Recondite',album:'Taum'},{id:'lab_000000000001',type:'label',title:'Plangent',artist:'',album:''}];
 let answer={items};e.discovery=url=>url.includes('/search?')?answer:entity(url.split('/').pop());
 const search=async q=>{query.value=q;e.elements['discovery-search'].emit('submit',{preventDefault(){}});await flush();};
 e.visit('#explore');await search('recondite');
 assert.match(web('index.html'),/<div id="discovery-results" class="regions" hidden><\/div>/,'the regions grid');
 assert.deepEqual(results.children.map(g=>[cls(g),g.children[0].id,textOf(g.children[0])]),[['region','q-artists','Artists 1'],['region','q-labels','Labels 1'],['region','q-releases','Releases 1'],['region','q-tracks','Tracks 1']],'artists, labels, releases, tracks, with heading ids of their own');
 assert.deepEqual(results.children.map(g=>byClass(g,'row').map(a=>[a.getAttribute('href'),a.children[1].children.map(textOf)])),[[['#explore/art_000000000001',['Recondite']]],[['#explore/lab_000000000001',['Plangent']]],[['#explore/rel_000000000001',['Taum','Recondite']]],[['#explore/trk_000000000001',['Taum','Recondite · Taum']]]],'a release names its artist, a track its artist and album');
 const unseen=()=>[status.children.map(n=>n.className),textOf(status)];
 assert.deepEqual(unseen(),[['visually-hidden'],'4 results'],'the results speak for themselves on screen; the status still says how many, since an emptied status is not announced');
 answer={items:items.slice(0,1)};await search('taum');assert.deepEqual(unseen(),[['visually-hidden'],'1 result']);
 answer={items:Array.from({length:40},(_,i)=>({id:'art_'+String(i).padStart(12,'0'),type:'artist',title:'A'+i}))};await search('a');assert.deepEqual([status.children.map(n=>n.className),textOf(status)],[[undefined],'First 40 results. Add a word to narrow them.'],'the cut list keeps its visible note');
 assert.equal(byClass(results,'text-button')[0].textContent,'Show all 40','a long list shows six at first');
 answer={items:[]};await search('zz');assert.equal(textOf(status),'No matches in the radio catalogue.');
 e.elements['explorer-close'].emit('click');e.setLanguage('de');e.visit('#explore');answer={items};await search('recondite');assert.deepEqual(unseen(),[['visually-hidden'],'4 Treffer']);
 assert.deepEqual(results.children.map(g=>textOf(g.children[0])),['Künstler 1','Labels 1','Veröffentlichungen 1','Tracks 1']);
 answer={items:Array.from({length:40},(_,i)=>({id:'art_'+String(i).padStart(12,'0'),type:'artist',title:'A'+i}))};await search('a');assert.equal(textOf(status),'Die ersten 40 Treffer. Ergänze ein Wort, um sie einzugrenzen.');
});

test('every name in the player bar is a link the explorer routes, and openTrack still opens a track',async()=>{
 const e=setup({journey:true});await flush();
 e.discovery=url=>url.includes('/track/')?{entity:{id:'trk_0123456789ab',type:'track',title:'First',connections:[{id:'art_000000000001',relation:'primary'},{id:'art_000000000002',relation:'featured'},{id:'lab_000000000001',relation:'label'}]},
  included:[{id:'art_000000000001',type:'artist',title:'Jimi Jules'},{id:'art_000000000002',type:'artist',title:'Guest'},{id:'lab_000000000001',type:'label',title:'Watergate'}]}:entity(url.split('/').pop());
 await e.poll();await flush();
 const credits=e.elements['credited-artists'].children,label=e.elements['label-note'].children[0];
 assert.deepEqual(credits.map(a=>[a.localName,a.className,a.getAttribute('href')]),[['a','artist-credit','#explore/art_000000000001'],['a','artist-credit','#explore/art_000000000002']]);
 assert.deepEqual([label.localName,label.getAttribute('href'),label.getAttribute('aria-label')],['a','#explore/lab_000000000001','Label: Watergate']);
 follow(e,label);await flush();assert.deepEqual([e.elements.explorer.open,e.location.hash,e.discoveryRequests.at(-1).url],[true,'#explore/lab_000000000001','/api/discovery/entity/lab_000000000001'],'the document handler routes it');
 follow(e,credits[1]);await flush();assert.deepEqual([e.location.hash,e.entries().length],['#explore/art_000000000002',3],'inside, it adds one entry');
 e.elements['explorer-close'].emit('click');await flush();
 e.window.Pavoia.openTrack('nope');await flush();assert.deepEqual([e.elements.explorer.open,e.location.hash],[false,''],'an invalid track opens nothing');
 e.window.Pavoia.openTrack('7');await flush();assert.equal(e.location.hash,'#explore/plex_7');
 assert.match(cssRules().get('.player .label-note a'),/min-height:24px/);
});

test('the line names the place before and the place after, and its links step with history.go',async()=>{
 const e=setup({journey:true});await flush();e.discovery=url=>entity(url.split('/').pop());
 const open=href=>e.document.emit('click',{button:0,target:{closest:()=>({getAttribute:()=>href})},preventDefault(){}});
 const line=()=>byClass(inspector(e),'entity-trail')[0],links=()=>line().children,read=()=>links().map(a=>[a.getAttribute('href'),a.attrs['aria-label'],textOf(a),a.dataset.step]);
 const asked=[],go=e.history.go;e.history.go=function(n){asked.push(n);return go.call(this,n);};
 open('#explore/art_000000000001');await flush();assert.equal(line(),undefined,'the first record of a visit has no line');
 for(const n of [2,3]){follow(e,{getAttribute:()=>'#explore/art_00000000000'+n});await flush();}
 assert.deepEqual([line().localName,line().attrs['aria-label'],read()],['nav','Back and forward',[['#explore/art_000000000002','Back to Name art_000000000002','Name art_000000000002','-1']]],'after two hops, one link back, named for the record before');
 assert.ok(byClass(inspector(e),'entity-heading')[0].children[0]===line(),'the header\'s first line, out of the title column');
 const [glyph,name]=links()[0].children;
 assert.deepEqual([glyph.attrs.viewBox,glyph.attrs['aria-hidden'],glyph.children[0].attrs.d,name.localName],['0 0 24 14','true','m5 3-4 4 4 4M2 7h20','span'],'the arrow is hidden, then the name in its own span');
 e.history.go(-1);await flush();asked.length=0;
 assert.deepEqual(read(),[['#explore/art_000000000001','Back to Name art_000000000001','Name art_000000000001','-1'],['#explore/art_000000000003','Forward to Name art_000000000003','Name art_000000000003','1']],'after Back, a link forward too, named at once');
 const [label,arrow]=links()[1].children;assert.deepEqual([label.localName,arrow.children[0].attrs.d],['span','m19 3 4 4-4 4M2 7h20'],'forward: the name, then the arrow');
 const at=e.position(),count=e.entries().length;follow(e,links()[1]);await flush();
 assert.deepEqual([e.position(),e.entries().length,e.location.hash,asked],[at+1,count,'#explore/art_000000000003',[1]],'the forward link is the browser\'s Forward: one step, no entry added');
 follow(e,links()[0]);await flush();
 assert.deepEqual([e.position(),e.entries().length,e.location.hash,asked],[at,count,'#explore/art_000000000002',[1,-1]],'the back link is the browser\'s Back');
 // A link from here drops the entries ahead, and their name: a jump back over two entries cannot name the place ahead.
 for(const n of [5,6]){follow(e,{getAttribute:()=>'#explore/art_00000000000'+n});await flush();}
 e.history.go(-2);await flush();
 assert.deepEqual(read().at(-1),['#explore/art_000000000005','Forward','Forward','1'],'a push forgets the name ahead; Forward says Forward when no Back named it');
 e.elements['explorer-close'].emit('click');await flush();open('#explore/art_000000000009');await flush();assert.equal(line(),undefined,'a new visit starts with no line');
 const rules=cssRules();
 assert.match(rules.get('.entity-trail'),/grid-column:1 \/ -1; display:flex; justify-content:space-between; gap:var\(--s3\); white-space:nowrap; font-size:12px; line-height:1\.4; color:var\(--soft\);/,'one line across the picture and the title, Back at its start, Forward at its end');
 assert.doesNotMatch(rules.get('.entity-trail'),/overflow/,'the line clips nothing: a focused link keeps its whole ring');
 assert.match(rules.get('.entity-trail a'),/position:relative; display:inline-flex; align-items:center; gap:var\(--s1\); min-width:0; max-width:50%;/);
 assert.match(rules.get('.entity-trail a::after'),/content:""; position:absolute; inset:-14px -8px;/,'a 44px target over the 17px line');
 assert.match(rules.get('.entity-trail svg'),/flex:none; width:20px; height:12px; fill:none; stroke:currentColor; stroke-width:1\.4; stroke-linecap:round; stroke-linejoin:round;/);
 assert.match(rules.get('.entity-trail a:is(:hover, :focus-visible)'),/color:var\(--cream\); text-decoration:underline; text-underline-offset:3px;/);
});

test('the line comes back after a reload from history.state',async()=>{
 const reloaded=async()=>{
  const state={explorer:true,seen:1,base:1,depth:2,owned:1,key:'1:2',back:{title:'X'},backHref:'#explore/art_000000000001',next:'#explore/art_000000000003',ahead:{name:{title:'Y'},life:1}};
  const e=setup({journey:true,hash:'#explore/art_000000000002',state,below:[{},{hash:'#explore/art_000000000001'}]});
  // The page loads before the test answers for records; it reads its address again once the test answers.
  e.discovery=url=>entity(url.split('/').pop());e.window.emit('hashchange');await flush();return e;
 };
 const line=e=>byClass(inspector(e),'entity-trail')[0],read=e=>line(e).children.map(a=>[a.getAttribute('href'),a.attrs['aria-label'],textOf(a)]);
 assert.deepEqual(read(await reloaded()),[['#explore/art_000000000001','Back to X','X'],['#explore/art_000000000003','Forward to Y','Y']],'both links, named from the entry');
 // Another page life wrote both neighbours: without the Navigation API, the links go through their addresses.
 for(const [i,to,way] of [[1,'#explore/art_000000000003','Forward'],[0,'#explore/art_000000000001','Back']]){
  const e=await reloaded(),asked=[];e.history.go=n=>asked.push(n);const count=e.entries().length;
  follow(e,line(e).children[i]);await flush();
  assert.deepEqual([e.location.hash,e.entries().length,asked],[to,count+1,[]],way+' after a reload opens its address in a new entry, never history.go');
 }
});

test('a search and a tab are named on the line',async()=>{
 const e=await indexed();const query=e.elements['discovery-query'],results=e.elements['discovery-results'];
 e.discovery=url=>url.includes('/search?')?{items:[{id:'art_0123456789ab',type:'artist',title:'Maceo Plex'}]}:entity(url.split('/').pop());
 const back=()=>{const a=byClass(inspector(e),'entity-trail')[0].children[0];return [textOf(a),a.attrs['aria-label']];};
 routeTo(e,'#explore/art_000000000001');await flush();query.value='maceo';query.emit('input');e.fire(300);await flush();
 follow(e,firstLink(results));await flush();
 assert.deepEqual(back(),['“maceo”','Back to “maceo”'],'from a result, Back names the search in quotes');
 routeTo(e,'#index/artists');await flush();routeTo(e,'#explore/art_000000000002');await flush();
 assert.deepEqual(back(),['Index','Back to the Index'],'from an Index row, Back names the Index');
 e.history.go(-1);await flush();e.history.go(-1);await flush();
 const ahead=byClass(inspector(e),'entity-trail')[0].children.at(-1);
 assert.deepEqual([textOf(ahead),ahead.attrs['aria-label'],ahead.getAttribute('href')],['Index','Forward to the Index','#index/artists'],'and Back to the record names the tab ahead');
 // A tab takes its article in German, so its words are its own: zum Verlauf, zur Statistik, zum Index.
 e.setLanguage('de');await flush();
 const weiter=byClass(inspector(e),'entity-trail')[0].children.at(-1);
 assert.deepEqual([textOf(weiter),weiter.attrs['aria-label']],['Index','Weiter zum Index'],'in German the tab ahead takes its article');
 for(const [tab,en,de,shown] of [['#history','Back to History','Zurück zum Verlauf','Verlauf'],['#statistics','Back to Statistics','Zurück zur Statistik','Statistik']]){
  e.setLanguage('en');await flush();routeTo(e,tab);await flush();routeTo(e,'#explore/art_000000000003');await flush();
  assert.equal(back()[1],en,'from the '+tab+' tab');
  e.setLanguage('de');await flush();assert.deepEqual(back(),[shown,de],'and in German, with its article');
 }
});

test('a middle or Ctrl click on the line opens its address and does not step',async()=>{
 const e=setup({journey:true});await flush();e.discovery=url=>entity(url.split('/').pop());
 for(const n of [1,2])routeTo(e,'#explore/art_00000000000'+n),await flush();
 const link=byClass(inspector(e),'entity-trail')[0].children[0],at=e.position(),count=e.entries().length,asked=[];e.history.go=n=>asked.push(n);
 for(const event of [{button:1},{button:0,ctrlKey:true},{button:0,metaKey:true},{button:0,shiftKey:true}]){
  let prevented=false;e.document.emit('click',{...event,target:{closest:()=>link},preventDefault(){prevented=true;}});await flush();
  assert.deepEqual([prevented,e.position(),e.entries().length,asked],[false,at,count,[]],JSON.stringify(event)+' leaves the link to the browser, which opens its address in a new tab');
 }
});

test('a step on the line while ✕ is on its way changes nothing',async()=>{
 const e=setup({journey:true});await flush();e.discovery=url=>entity(url.split('/').pop());
 for(const n of [1,2,3])routeTo(e,'#explore/art_00000000000'+n),await flush();
 e.history.go(-1);await flush();
 const [back,ahead]=byClass(inspector(e),'entity-trail')[0].children,count=e.entries().length,asked=[];e.history.go=n=>asked.push(n);
 e.elements['explorer-close'].emit('click');await flush();
 for(const link of [back,ahead]){let prevented=false;e.document.emit('click',{button:0,target:{closest:()=>link},preventDefault(){prevented=true;}});await flush();assert.equal(prevented,true,'the click is the page\'s');}
 assert.deepEqual([asked,e.entries().length,e.location.hash],[[-2],count,'#explore/art_000000000002'],'only ✕ asked the browser to move, and no link pushed an entry');
});

test('a line link whose target the browser keeps in another document goes through its address',async()=>{
 const e=setup({journey:true});await flush();e.discovery=url=>entity(url.split('/').pop());
 for(const n of [1,2,3])routeTo(e,'#explore/art_00000000000'+n),await flush();
 e.history.go(-1);await flush();
 // The entry under the one shown is in another document, as after a reload in some browsers; the one above is not.
 const other=e.position()-1;
 e.window.navigation={canGoBack:true,canGoForward:true,currentEntry:{get index(){return e.position();}},entries:()=>e.entries().map((hash,i)=>({url:'https://radio.test/'+hash,sameDocument:i!==other}))};
 const asked=[],go=e.history.go;e.history.go=function(n){asked.push(n);return go.call(this,n);};
 const [back]=byClass(inspector(e),'entity-trail')[0].children,count=e.entries().length,at=e.position();
 follow(e,back);await flush();
 assert.deepEqual([asked,e.location.hash,e.position(),e.entries().length],[[],'#explore/art_000000000001',at+1,count],'Back pushes its address in a new entry, which replaces the one ahead, and never loads another document');
 e.history.go(-1);await flush();asked.length=0;
 const ahead=byClass(inspector(e),'entity-trail')[0].children.at(-1);follow(e,ahead);await flush();
 assert.deepEqual([asked,e.location.hash],[[1],'#explore/art_000000000001'],'a target in this document is a browser step');
 e.window.navigation={...e.window.navigation,canGoForward:false};routeTo(e,'#explore/art_000000000004');await flush();e.history.go(-1);await flush();
 assert.equal(byClass(inspector(e),'entity-trail')[0].children.some(a=>a.dataset.step==='1'),false,'where the browser says nothing is ahead, there is no forward link');
});

test('the line speaks the new language after a switch',async()=>{
 const e=setup({journey:true});await flush();const query=e.elements['discovery-query'],results=e.elements['discovery-results'];
 e.discovery=url=>url.includes('/search?')?{items:[{id:'art_0123456789ab',type:'artist',title:'Maceo Plex'}]}:entity(url.split('/').pop());
 routeTo(e,'#explore/art_000000000001');await flush();query.value='maceo';query.emit('input');e.fire(300);await flush();
 follow(e,firstLink(results));await flush();routeTo(e,'#explore/art_000000000002');await flush();e.history.go(-1);await flush();
 e.setLanguage('de');await flush();
 const line=byClass(inspector(e),'entity-trail')[0];
 assert.deepEqual([line.attrs['aria-label'],...line.children.map(a=>[textOf(a),a.attrs['aria-label']])],['Zurück und weiter',['„maceo“','Zurück zu „maceo“'],['Name art_000000000002','Weiter zu Name art_000000000002']],'the tab words and the quotes change, the titles stay');
});

test('a double click on the line steps once, on the old link or on the one drawn in its place',async()=>{
 const e=setup({journey:true});await flush();e.discovery=url=>entity(url.split('/').pop());
 for(const n of [1,2])routeTo(e,'#explore/art_00000000000'+n),await flush();
 // Every entry is in this document, as Chromium says.
 e.window.navigation={canGoBack:true,canGoForward:true,currentEntry:{get index(){return e.position();}},entries:()=>e.entries().map(hash=>({url:'https://radio.test/'+hash,sameDocument:true}))};
 const asked=[],go=e.history.go;e.history.go=function(n){asked.push(n);return go.call(this,n);};
 const line=()=>byClass(inspector(e),'entity-trail')[0],click=(link,timeStamp,clientX=700)=>e.document.emit('click',{button:0,timeStamp,clientX,clientY:300,target:{closest:()=>link},preventDefault(){}});
 // Both clicks reach the back link before the browser moves: the second one would step back out of the explorer.
 const back=line().children[0];click(back,1000);click(back,1000);await flush();
 assert.deepEqual([asked,e.location.hash,e.elements.explorer.open],[[-1],'#explore/art_000000000001',true],'a 0 ms double click steps back once');
 // On the map the lone forward link stands where the back link stood: the second click of a slower double click lands on it.
 click(line().children.at(-1),1300,710);await flush();
 assert.deepEqual([asked,e.location.hash],[[-1],'#explore/art_000000000001'],'a click 300 ms after the step, on the same spot, changes nothing');
 click(line().children.at(-1),1500);await flush();
 assert.deepEqual([asked,e.location.hash],[[-1,1],'#explore/art_000000000002'],'a click 500 ms after the step steps');
 click(line().children[0],1600,500);await flush();
 assert.deepEqual([asked,e.location.hash],[[-1,1,-1],'#explore/art_000000000001'],'a click on another spot steps at once');
});

test('two quick Backs name the record that waits for its paint on the line ahead',async()=>{
 const {e,gate}=await recondite4();gate.fail=true;const query=e.elements['discovery-query'];
 routeTo(e,'#explore/art_000000000002');await flush();routeTo(e,'#explore/art_000000000001');await flush();
 query.value='jimi';query.emit('input');e.fire(300);await flush();
 // Back to Recondite: its naming fetch waits, so the results stay, dimmed, and the second Back comes in that time.
 gate.fail=false;gate.hold=true;e.history.go(-1);await flush();
 assert.deepEqual([e.location.hash,e.elements['discovery-results'].hidden,e.elements['discovery-results'].getAttribute('aria-busy')],['#explore/art_000000000001',false,'true'],'Recondite waits behind the results');
 e.history.go(-1);await flush();
 const ahead=byClass(inspector(e),'entity-trail')[0].children.at(-1);
 assert.deepEqual([titleShown(e),textOf(ahead),ahead.attrs['aria-label'],ahead.getAttribute('href')],['Name art_000000000002','Recondite','Forward to Recondite','#explore/art_000000000001'],'Forward names Recondite, where it goes, not the search shown while it waited');
});

test('a move from a record that waits for its paint drops the name ahead and points Forward at the move',async()=>{
 const {e,gate}=await recondite4();gate.fail=true;e.names={artists:artistNames(),labels:labelNames()};
 await walk(e,['art_000000000002','art_000000000001','art_000000000003']);
 gate.fail=false;gate.hold=true;e.history.go(-1);await flush();
 assert.deepEqual([e.location.hash,e.history.state.ahead?.name?.title],['#explore/art_000000000001','Name art_000000000003'],'Back to Recondite names the record ahead while Recondite waits');
 // The Index tab while Recondite waits: Recondite has no place to keep, and the record ahead is dropped.
 routeTo(e,'#index/artists');await flush();
 e.history.go(-2);await flush();e.history.go(1);await flush();gate.release();await flush();
 const ahead=byClass(inspector(e),'entity-trail')[0].children.at(-1);
 assert.deepEqual([titleShown(e),textOf(ahead),ahead.attrs['aria-label'],ahead.getAttribute('href')],['Recondite','Forward','Forward','#index/artists'],'reached by a jump, Forward does not know the Index by name, and goes there, not to the record dropped');
});

test('a name with a dollar sign reads on the line as written',async()=>{
 const e=setup({journey:true});await flush();const query=e.elements['discovery-query'],results=e.elements['discovery-results'];
 e.discovery=url=>url.includes('/search?')?{items:[{id:'art_0123456789ab',type:'artist',title:'Maceo Plex'}]}:{entity:{id:url.split('/').pop(),type:'artist',title:'Ca$&h'},included:[]};
 const back=()=>{const a=byClass(inspector(e),'entity-trail')[0].children[0];return [textOf(a),a.attrs['aria-label']];};
 routeTo(e,'#explore/art_000000000001');await flush();query.value="$& su$'";query.emit('input');e.fire(300);await flush();
 follow(e,firstLink(results));await flush();
 assert.deepEqual(back(),["“$& su$'”","Back to “$& su$'”"],'a query, as typed');
 routeTo(e,'#explore/art_000000000002');await flush();
 assert.deepEqual(back(),['Ca$&h','Back to Ca$&h'],'a title, as written');
 e.setLanguage('de');await flush();assert.deepEqual(back(),['Ca$&h','Zurück zu Ca$&h'],'in German too');
});

test('Back to the first record shows its line where its top shows, and keeps the link followed where it stood where the line is out of view',async()=>{
 const {e}=await recondite4();const explorer=e.elements.explorer,eulberg='#explore/art_000000000101',box=e.Element.prototype.getBoundingClientRect;
 // Laid out as a browser does, in the explorer's scroll: the explorer's bar ends 64 px down, the record starts 80 px
 // under it with its line, 17 px tall, and its title stands 200 px under that, 33 px lower when the line shows over it.
 e.Element.prototype.getBoundingClientRect=function(){if(this===explorer)return {left:0,right:0,width:0,height:700,top:64,bottom:764};
  const line=this.className==='entity-trail',at=this===inspector(e)||line?144:this.localName==='h3'?344+(this.parent?.parent?.children[0]?.className==='entity-trail'?33:0):null;
  if(at===null)return box.call(this);const top=at-explorer.scrollTop,height=line?17:40;return {left:0,right:0,width:0,height,top,bottom:top+height};};
 try{
  routeTo(e,'#explore/art_000000000001');await flush();assert.equal(byClass(inspector(e),'entity-trail').length,0,'the first record has no line');
  explorer.scrollTop=600;follow(e,rowTo(e,eulberg,'similar'));await flush();e.history.go(-1);await flush();
  assert.deepEqual([titleShown(e),byClass(inspector(e),'entity-trail').length,explorer.scrollTop,e.document.activeElement.getAttribute?.('href')],['Recondite',1,633,eulberg],'the line pushes the record 33 px down, and the scroll follows: the link followed stands where it stood');
  e.history.go(1);await flush();e.history.go(-1);await flush();
  assert.equal(explorer.scrollTop,633,'left with its line, it comes back at the same scroll');
  e.elements['explorer-close'].emit('click');await flush();
  routeTo(e,'#explore/art_000000000001');await flush();explorer.scrollTop=0;follow(e,rowTo(e,eulberg,'similar'));await flush();e.history.go(-1);await flush();
  assert.deepEqual([byClass(inspector(e),'entity-trail').length,explorer.scrollTop],[1,0],'left at its top, it comes back at its top: the line shows over the title, and the record stands 33 px lower');
  for(const [top,back,why] of [[96,96,'the line still shows 1 px under the bar: the scroll stays'],[97,130,'the line is just out of view under the bar: the scroll follows']]){
   e.elements['explorer-close'].emit('click');await flush();
   routeTo(e,'#explore/art_000000000001');await flush();explorer.scrollTop=top;follow(e,rowTo(e,eulberg,'similar'));await flush();e.history.go(-1);await flush();
   assert.equal(explorer.scrollTop,back,why);
  }
 }finally{e.Element.prototype.getBoundingClientRect=box;}
});

test('a hop keeps the record in place, dimmed, then starts the next one at its title',async()=>{
 const e=setup({journey:true});await flush();const workspace=e.elements['explore-workspace'],status=e.elements['discovery-status'],explorer=e.elements.explorer;
 let pending=[];e.discovery=url=>new Promise(resolve=>pending.push(()=>resolve(entity(url.split('/').pop()))));const answer=async()=>{pending.shift()();await flush();};
 e.document.emit('click',{button:0,target:{closest:()=>({getAttribute:()=>'#explore/art_000000000001'})},preventDefault(){}});await flush();
 assert.deepEqual([workspace.hidden,status.textContent],[true,'Loading the connections…'],'the first record says it is loading');
 pending=pending.slice(-1);await answer();
 const title=()=>inspector(e).descendants().find(n=>n.localName==='h3');
 assert.deepEqual([workspace.hidden,workspace.getAttribute('aria-busy'),status.textContent,e.document.activeElement,title().textContent],[false,null,'',title(),'Name art_000000000001'],'then starts at its title');
 explorer.scrollTop=600;e.document.activeElement=e.document.body;
 follow(e,{getAttribute:()=>'#explore/art_000000000002'});await flush();
 assert.deepEqual([workspace.hidden,workspace.getAttribute('aria-busy'),workspace.inert,status.textContent,title().textContent],[false,'true',true,'','Name art_000000000001'],'a hop keeps the last record on screen, busy and out of reach, with no Loading line');
 await answer();
 assert.deepEqual([workspace.getAttribute('aria-busy'),workspace.inert,explorer.scrollTop,e.document.activeElement,title().textContent],[null,false,0,title(),'Name art_000000000002'],'the next one starts at the top, focus on its title');
 workspace.append(inspector(e));title().focus();
 follow(e,{getAttribute:()=>'#explore/art_000000000005'});await flush();
 assert.deepEqual([workspace.inert,e.document.activeElement],[true,explorer],'focus in the old record waits on the explorer, not on the page');
 await answer();
 follow(e,{getAttribute:()=>'#explore/art_000000000003'});await flush();e.elements['discovery-query'].focus();await answer();
 assert.equal(e.document.activeElement,e.elements['discovery-query'],'a field the listener moved to keeps the keys');
 follow(e,{getAttribute:()=>'#explore/art_000000000006'});await flush();e.elements.play.focus();await answer();
 assert.equal(e.document.activeElement,e.elements.play,'and so does the player');
 e.discovery=()=>null;follow(e,{getAttribute:()=>'#explore/art_000000000004'});await flush();
 assert.deepEqual([workspace.hidden,workspace.getAttribute('aria-busy'),workspace.inert,status.textContent],[true,null,false,'These details are unavailable. Try another record or search again.'],'a failed hop hides the old record');
 assert.match(cssRules().get('.explore-workspace[aria-busy=true]'),/opacity:\.45; transition:opacity var\(--panel\) var\(--ease\)/);
});

test('the explorer takes focus itself when it opens, so no tab shows a ring on a page just loaded',async()=>{
 const e=setup({journey:true,hash:'#statistics'});await flush();
 assert.deepEqual([e.elements.explorer.open,e.document.activeElement===e.elements.explorer,e.elements.explorer.focusOptions?.preventScroll],[true,true,true],'a direct load of #statistics leaves focus on the explorer');
 const footer=setup({journey:true});await flush();footer.discovery=url=>entity(url.split('/').pop(),'track');
 footer.elements['go-deeper'].emit('click');
 assert.ok(footer.document.activeElement===footer.elements.explorer,'so does the footer button, while the record loads');
 await flush();assert.equal(footer.document.activeElement.tabIndex,-1,'then the record\'s title takes it');
});

// Step 7: History finds a time and keeps the place it was left at.
const routeTo=(e,href)=>e.document.emit('click',{button:0,target:{closest:()=>({getAttribute:()=>href})},preventDefault(){}});
// A History page: n tracks six minutes apart from `start` back, echoing the asked bounds as the server does.
// A play keeps its time from one answer to the next, as on the server.
const playedFrom=Date.now(),played=(n,start=0,next=null)=>({items:Array.from({length:n},(_,i)=>({id:String(1000+start+i),title:'Track '+(start+i),artist:'Artist '+(start+i),startedAt:new Date(playedFrom-(start+i)*360000).toISOString()})),next});
// With no until the server ends at its own now, as playbackHistory does.
const answer=page=>url=>{const q=new URL(url,'http://radio').searchParams;return {from:q.get('from'),until:q.get('until')||new Date().toISOString(),...page};};
const asked=e=>new URL(e.historyRequests.at(-1).url,'http://radio').searchParams;
const historyRows=e=>byClass(e.elements['music-content'],'row');
// A status line as read: its own words, or the error and its Try again.
const said=n=>n.children.length?n.children.map(textOf).join(''):n.textContent;
const localDay=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const onAirNow=id=>({track:{id,title:'On air '+id,artist:'Artist'},audience:{available:true,listeners:2,measuredAt:new Date(clock.now).toISOString()}});
// Elements compare by identity, as booleans: a failed deepEqual over the fake DOM takes minutes to print.
const sameRows=(a,b)=>a.length===b.length&&a.every((n,i)=>n===b[i]);
// Explorer v2 step 4: the stage row replaces the Stage select. A stage's link in it, and the current one.
const stageLink=(e,id)=>e.elements['stage-row'].children.find(a=>a.getAttribute('href').split('/')[1]===id);
const currentStage=e=>e.elements['stage-row'].querySelector('[aria-current]');

test('History rows are links that read the time, then the title over its artist, under a heading per local day',async()=>{
 const e=setup({journey:true});await flush();
 const day=(back,hour)=>{const d=new Date();d.setDate(d.getDate()-back);d.setHours(hour,30,0,0);return d.toISOString();};
 const items=[[0,10,'101'],[0,0,'102'],[1,23,'103'],[3,12,'x1']].map(([back,hour,id],i)=>({id,title:'Title '+i,artist:'Artist '+i,startedAt:day(back,hour)}));
 e.historyReply=answer({items,next:null});routeTo(e,'#history');await flush();
 const kids=e.elements['music-content'].children,older=new Date(items[3].startedAt).toLocaleDateString('en',{weekday:'long',day:'numeric',month:'long'});
 assert.deepEqual(kids.map(n=>n.localName+'.'+n.className),['h3.history-day','a.row','a.row','h3.history-day','a.row','h3.history-day','a.row'],'a heading opens each local day');
 assert.deepEqual(kids.filter(n=>n.localName==='h3').map(n=>n.textContent),['Today','Yesterday',older]);
 const row=kids[1];
 assert.deepEqual([row.getAttribute('href'),row.events.click,row.children.map(n=>n.localName+'.'+(n.className||''))],['#explore/plex_101',undefined,['time.','span.row-text']],'a link with no handler of its own, and no stage cell: the time first, then the one row\'s text');
 assert.deepEqual(row.children[1].children.map(n=>n.localName+'.'+n.className),['span.row-name','span.row-line'],'the title over its artist, with no bold');
 assert.deepEqual([row.children[0].textContent,row.children[0].dateTime,row.children[1].children.map(n=>n.textContent)],[new Date(items[0].startedAt).toLocaleTimeString('en',{timeStyle:'short'}),items[0].startedAt,['Title 0','Artist 0']],'the short time only');
 assert.equal(kids[6].getAttribute('href'),null,'a track without a valid id is no link');
 follow(e,row);await flush();assert.deepEqual([e.location.hash,e.entries().length],['#explore/plex_101',3],'the document handler routes it through go(), so it adds one entry');
 e.setLanguage('de');routeTo(e,'#history');await flush();
 assert.deepEqual(e.elements['music-content'].children.filter(n=>n.localName==='h3').map(n=>n.textContent).slice(0,2),['Heute','Gestern'],'rows drawn in English are drawn again in German');
});

test('a picked day lists back from its end, earlier tracks carry on across days, and an empty list says why',async()=>{
 const e=setup({journey:true});await flush();const day=e.elements['history-day'],status=e.elements['music-status'],more=e.elements['history-more'];
 e.historyReply=answer(played(50,0,'9:1'));routeTo(e,'#history');await flush();
 assert.equal(day.max,localDay(new Date()),'no day after today');
 assert.deepEqual([asked(e).get('from'),asked(e).get('until')],[new Date(0).toISOString(),null],'an empty field means the server\'s now, the clock that announces the track on air: the browser\'s may run behind');
 day.value='2026-03-28';day.emit('change');await flush();
 assert.deepEqual([asked(e).get('from'),asked(e).get('until'),asked(e).get('before')],[new Date(0).toISOString(),new Date(2026,2,29).toISOString(),null],'until is the end of that local day');
 // Typing 2026 passes through the years 0002, 0020 and 0202, each a change the field's min marks invalid.
 const typed=e.historyRequests.length;day.validity.valid=false;day.value='0202-03-28';day.emit('change');await flush();day.validity.valid=true;day.value='2026-03-28';
 assert.equal(e.historyRequests.length,typed,'a year still being typed asks for nothing');
 more.emit('click');await flush();
 assert.deepEqual([asked(e).get('until'),asked(e).get('before')],[new Date(2026,2,29).toISOString(),'9:1'],'Show earlier tracks goes on back from there, across the days before it');
 e.historyReply=answer({items:[],next:null});day.emit('change');await flush();
 assert.deepEqual([status.textContent,more.hidden],['Nothing played on this station that day.',true]);
 day.value='';day.emit('change');await flush();assert.equal(status.textContent,'Nothing has played on this station yet.');
 e.setLanguage('de');await flush();assert.equal(status.textContent,'Auf diesem Sender lief noch nichts.');
 day.value='2026-03-28';day.emit('change');await flush();assert.equal(status.textContent,'An diesem Tag lief hier nichts.');
 e.historyReply=()=>null;day.emit('change');await flush();assert.equal(said(status),'Der Verlauf konnte nicht geladen werden. Erneut versuchen');
 const html=web('index.html'),journey=web('journey.js');
 assert.match(html,/<label id="history-day-label"><span data-journey="historyDay">Day<\/span><input type="date" id="history-day" min="1970-01-01"><\/label>/);
 for(const pair of ["historyDay:'Day'","historyDay:'Tag'","noDay:'Nothing played on this station that day.'","historyError:'The history could not load.'"])assert.ok(journey.includes(pair),pair);
 for(const gone of ['history-period','Last 24 hours','Last 7 days','Last 30 days','All recorded history','Letzte 30 Tage','Gesamter Verlauf','historyNote','Older tracks','Ältere Tracks'])assert.ok(!html.includes(gone)&&!journey.includes(gone),gone+' is gone');
});

test('Show earlier tracks stays in place while it loads, keeps focus, and says Try again in place',async()=>{
 const e=setup({journey:true});await flush();const more=e.elements['history-more'];
 e.historyReply=answer(played(50,0,'9:1'));routeTo(e,'#history');await flush();
 assert.deepEqual([more.hidden,more.textContent],[false,'Show earlier tracks']);
 let reply;e.historyReply=url=>new Promise(resolve=>{reply=page=>resolve(page&&answer(page)(url));});
 more.focus();more.emit('click');await flush();
 assert.deepEqual([more.hidden,more.textContent,more.getAttribute('aria-busy'),more.getAttribute('aria-disabled'),e.document.activeElement===more],[false,'Loading…','true','true',true],'in place, busy, and still focused');
 const sent=e.historyRequests.length;more.emit('click');assert.equal(e.historyRequests.length,sent,'a second press while it loads asks for nothing');
 reply(played(50,50,'9:2'));await flush();
 assert.deepEqual([historyRows(e).length,more.textContent,more.getAttribute('aria-busy'),more.getAttribute('aria-disabled'),e.document.activeElement===more],[100,'Show earlier tracks',null,null,true],'the rows append above it and focus stays on it');
 more.emit('click');await flush();reply(null);await flush();
 assert.deepEqual([more.hidden,more.textContent,historyRows(e).length,e.document.activeElement===more],[false,'Try again',100,true],'a failure says so on the button itself');
 more.emit('click');await flush();assert.equal(asked(e).get('before'),'9:2','which asks again for the same tracks');
 reply(played(10,100,null));await flush();
 assert.deepEqual([more.hidden,e.document.activeElement===historyRows(e)[100]],[true,true],'the last page takes the button away, and focus moves to the first track it showed');
 e.setLanguage('de');await flush();e.historyReply=answer(played(50,0,'9:1'));follow(e,stageLink(e,'bermuda-day'));await flush();
 assert.equal(more.textContent,'Frühere Tracks anzeigen');
 more.emit('click');assert.equal(more.textContent,'Wird geladen…');
});

test('a filter change refreshes History in place, dimmed, and Statistics still loads as before',async()=>{
 const e=setup({journey:true});await flush();const content=e.elements['music-content'],status=e.elements['music-status'],day=e.elements['history-day'];
 let reply;e.historyReply=url=>new Promise(resolve=>{reply=page=>resolve(page&&answer(page)(url));});
 routeTo(e,'#history');await flush();assert.equal(status.textContent,'Loading the music…','only the first load says it is loading');
 reply(played(50));await flush();const first=[...content.children];
 follow(e,stageLink(e,'bermuda-day'));await flush();
 assert.deepEqual([sameRows(content.children,first),content.getAttribute('aria-busy'),status.textContent],[true,'true',''],'the rows stay, dimmed, with no Loading line');
 reply(played(50,50));await flush();
 assert.deepEqual([content.getAttribute('aria-busy'),historyRows(e)[0].children[1].children[0].textContent],[null,'Track 50'],'then the next ones replace them');
 day.focus();day.value='2026-03-28';day.emit('change');await flush();reply(played(50));await flush();
 assert.ok(e.document.activeElement===day,'the date field keeps focus while the list refreshes');
 historyRows(e)[3].focus();follow(e,stageLink(e,'palac-dance'));await flush();reply(null);await flush();
 assert.deepEqual([content.children.length,content.dataset.key,said(status),e.document.activeElement===currentStage(e),e.location.hash],[0,undefined,'The history could not load. Try again',true,'#history/palac-dance/2026-03-28'],'an error clears the rows, and focus on one moves to the current stage in the row, which kept the day');
 status.children[1].focus();status.children[1].emit('click');await flush();
 assert.ok(e.document.activeElement===currentStage(e),'Try again goes with the line, so focus moves to the current stage');
 reply(played(50));await flush();
 routeTo(e,'#statistics');
 assert.deepEqual([content.children.length,status.textContent],[0,'Loading the music…'],'Statistics still empties at once and says it is loading');
});

test('the History tab brings back the same rows where they were, with focus on the row that was opened',async()=>{
 const e=setup({journey:true});await flush();const content=e.elements['music-content'],explorer=e.elements.explorer;
 e.discovery=url=>entity(url.split('/').pop(),'track');
 // The track of row 6 plays again at row 46.
 const first=played(50,0,'9:1');first.items[45]={...first.items[45],id:first.items[5].id};
 e.historyReply=answer(first);routeTo(e,'#history');await flush();
 e.historyReply=answer(played(50,50,null));e.elements['history-more'].emit('click');await flush();
 const shown=[...content.children],row=historyRows(e)[69],sent=e.historyRequests.length;
 explorer.scrollTop=4000;row.focus();follow(e,row);
 assert.ok(e.document.activeElement===explorer,'while the record loads, focus waits on the explorer, not on the page');
 await flush();assert.deepEqual([e.location.hash,e.document.activeElement.tabIndex],['#explore/plex_1069',-1],'then on the record\'s title');
 routeTo(e,'#history');await flush();
 assert.deepEqual([e.historyRequests.length,sameRows(content.children,shown),explorer.scrollTop,e.document.activeElement===row],[sent,true,4000,true],'no reload: the same rows, scrolled where they were, focus on the row opened');
 // A typed #history fires popstate, then hashchange: the second restore() must not undo a scroll made in between.
 follow(e,row);await flush();
 e.location.hash='#history';e.window.emit('popstate');explorer.scrollTop=10;e.window.emit('hashchange');await flush();
 assert.deepEqual([e.historyRequests.length,sameRows(content.children,shown),explorer.scrollTop,e.document.activeElement===row],[sent,true,10,true],'restore() twice changes nothing');
 // A tap focuses no link: focus is still on row 70 when row 13 is tapped.
 const tapped=historyRows(e)[12];explorer.scrollTop=700;follow(e,tapped);await flush();
 routeTo(e,'#history');await flush();
 assert.deepEqual([e.historyRequests.length,explorer.scrollTop,e.document.activeElement===tapped],[sent,700,true],'a row opened by a tap is found by its link, not by the focus left on another row');
 const twice=historyRows(e)[45];twice.focus();follow(e,twice);await flush();routeTo(e,'#history');await flush();
 assert.ok(e.document.activeElement===twice,'a track played twice comes back to the row that was opened, not to its first one');
 const firstCopy=historyRows(e)[5];firstCopy.focus();follow(e,twice);await flush();routeTo(e,'#history');await flush();
 assert.ok(e.document.activeElement===twice,'and so does a tap on the second copy while focus sits on the first');
 routeTo(e,'#statistics');await flush();routeTo(e,'#history');await flush();
 assert.equal(e.historyRequests.length,sent+1,'Statistics in between loads History again');
 e.elements['explorer-close'].emit('click');await flush();routeTo(e,'#history');await flush();
 assert.equal(e.historyRequests.length,sent+2,'so does a new visit');
});

test('a row opened again by an old address of its record comes back with its place and its focus, in History and the Index',async()=>{
 // History links a track by plex_, which the roots rename; the Index links a name, which the search finds. Once opened,
 // the link leads to the record's own address, and the row is still the one opened.
 const e=await indexed();const explorer=e.elements.explorer,content=e.elements['music-content'];
 e.discovery=url=>url.includes('/search?')?{items:[{id:'art_00000000aa11',type:'artist',title:'Amelie Lens'}]}:entity(url.includes('plex_')?'trk_'+url.split('plex_').pop().padStart(12,'0'):url.split('/').pop());
 // Two pages: a list with earlier pages follows nothing, so its rows stay drawn while a record shows.
 e.historyReply=answer(played(50,0,'9:1'));routeTo(e,'#history');await flush();
 e.historyReply=answer(played(50,50,null));e.elements['history-more'].emit('click');await flush();
 const track=historyRows(e)[69],shown=[...content.children];
 for(const top of [2000,1500,1000]){
  explorer.scrollTop=top;track.focus();follow(e,track);await flush();assert.equal(e.location.hash,'#explore/trk_000000001069');
  routeTo(e,'#history');await flush();
  assert.deepEqual([sameRows(content.children,shown),explorer.scrollTop,e.document.activeElement===track],[true,top,true],'History, scrolled to '+top+': the same rows, the same place, focus on the row');
 }
 routeTo(e,'#index/artists');await flush();
 const name=rowOf(e,'Amelie Lens');explorer.clientHeight=600;
 name.getBoundingClientRect=()=>({top:1000-explorer.scrollTop,bottom:1056-explorer.scrollTop});
 assert.equal(name.getAttribute('href'),'#explore/artist/Amelie%20Lens');
 for(const top of [700,600,500]){
  explorer.scrollTop=top;follow(e,name);await flush();assert.equal(e.location.hash,'#explore/art_00000000aa11');
  routeTo(e,e.elements['index-tab'].getAttribute('href'));await flush();
  assert.deepEqual([e.document.activeElement===name,explorer.scrollTop],[true,top],'the Index, scrolled to '+top+': the row where it stood, focused');
 }
});

test('the track on air reads Now on the live stage, and the first page follows the radio',async()=>{
 const e=setup({journey:true});await flush();const more=e.elements['history-more'],explorer=e.elements.explorer;
 const page=(id,next='9:1')=>answer({items:[{id,title:'On air',artist:'Artist',startedAt:new Date().toISOString()},...played(49,1).items],next});
 const nowRows=()=>historyRows(e).filter(r=>r.getAttribute('aria-current')==='true');
 e.historyReply=page('123');routeTo(e,'#history');await flush();
 assert.deepEqual([nowRows().length,historyRows(e)[0].getAttribute('aria-current'),historyRows(e)[0].children[0].textContent],[1,'true','Now'],'the first row is marked, and its time says Now');
 const focused=historyRows(e)[3];focused.focus();let sent=e.historyRequests.length;
 e.historyReply=page('456');e.response=onAirNow('456');await e.poll();await flush();
 assert.deepEqual([e.historyRequests.length,historyRows(e)[0].children[1].children[0].textContent,nowRows().length],[sent+1,'On air',1],'a new track redraws the first page');
 assert.deepEqual([e.document.activeElement===focused,e.document.activeElement.getAttribute('href')],[false,focused.getAttribute('href')],'focus moves to the new row of the same track');
 sent=e.historyRequests.length;await e.poll();await flush();assert.equal(e.historyRequests.length,sent,'the same track asks for nothing');
 const later=played(50,60).items;e.historyReply=answer({items:later,next:'9:1'});e.response=onAirNow('789');await e.poll();await flush();
 assert.ok(e.document.activeElement===currentStage(e),'a focused track that left the page hands focus to the current stage');
 Object.defineProperty(e.Element.prototype,'offsetTop',{configurable:true,get(){return this.parent?this.parent.children.indexOf(this)*60:0;}});
 // A new track starts a millisecond after the newest one shown, so no day heading comes between them at any hour.
 const after=(id,last)=>({id,title:'New '+id,artist:'Artist',startedAt:new Date(Date.parse(last.startedAt)+1).toISOString()}),n790=after('790',later[0]);
 explorer.scrollTop=600;
 e.historyReply=answer({items:[n790,...later],next:'9:1'});e.response=onAirNow('790');await e.poll();await flush();
 assert.equal(explorer.scrollTop,660,'the rows in view stay put while a new track lands above them');
 explorer.scrollTop=0;e.historyReply=answer({items:[after('791',n790),n790,...later],next:'9:1'});e.response=onAirNow('791');await e.poll();await flush();
 assert.equal(explorer.scrollTop,0,'at the top, the new track shows above the rows it pushes down');
 e.setLanguage('de');await flush();assert.equal(historyRows(e)[0].children[0].textContent,'Jetzt');e.setLanguage('en');await flush();
 e.historyReply=answer(played(50,50,null));more.emit('click');await flush();
 assert.deepEqual([nowRows().length,historyRows(e)[0].children[0].textContent],[0,new Date(historyRows(e)[0].children[0].dateTime).toLocaleTimeString('en',{timeStyle:'short'})],'an earlier page stops the list following the radio: Now goes back to its time');
 sent=e.historyRequests.length;e.response=onAirNow('800');await e.poll();await flush();assert.equal(e.historyRequests.length,sent,'and a new track redraws nothing');
 e.historyReply=page('800');follow(e,stageLink(e,'bermuda-day'));await flush();assert.equal(nowRows().length,0,'another stage has no Now');
 follow(e,stageLink(e,e.window.Pavoia.getState().stage));await flush();e.elements['history-day'].value='2026-03-28';e.elements['history-day'].emit('change');await flush();assert.equal(nowRows().length,0,'nor has another day');
 e.elements['history-day'].value=localDay(new Date());e.elements['history-day'].emit('change');await flush();assert.equal(nowRows().length,1,'today does');
 // While the radio plays one station and the page shows another, a bare #history opens the one shown, and Now stays on the one heard.
 const x=setup({journey:true});await flush();x.click();x.playing();x.change('03');await flush();
 const now=()=>historyRows(x).filter(r=>r.getAttribute('aria-current')==='true').length;
 x.historyReply=page('123');routeTo(x,'#history');await flush();
 assert.deepEqual([x.location.hash,now()],['#history/palac-dance',0],'the station shown, whose first row is not Now');
 follow(x,stageLink(x,'palac-feel'));await flush();assert.deepEqual([x.location.hash,now()],['#history/palac-feel',1],'Now is on the station heard');
});

test('History keeps its rows through a lost radio answer or a failed refresh, and a half-typed day asks for nothing',async()=>{
 const e=setup({journey:true});await flush();const content=e.elements['music-content'],status=e.elements['music-status'],explorer=e.elements.explorer,day=e.elements['history-day'];
 const page=id=>answer({items:[{id,title:'On air',artist:'Artist',startedAt:new Date().toISOString()},...played(49,1).items],next:'9:1'});
 const nowRows=()=>historyRows(e).filter(r=>r.getAttribute('aria-current')==='true');
 e.historyReply=page('123');routeTo(e,'#history');await flush();
 const shown=[...content.children];explorer.scrollTop=1200;let sent=e.historyRequests.length;
 e.response=new Error('Offline');await e.poll();await flush();
 assert.deepEqual([e.historyRequests.length,sameRows(content.children,shown),nowRows().length,explorer.scrollTop],[sent,true,1,1200],'a lost radio answer redraws nothing');
 e.historyReply=()=>null;e.response=onAirNow('456');await e.poll();await flush();
 assert.deepEqual([e.historyRequests.length,sameRows(content.children,shown),nowRows().length,historyRows(e)[0].children[0].textContent,status.textContent,explorer.scrollTop],[sent+1,true,0,new Date(historyRows(e)[0].children[0].dateTime).toLocaleTimeString('en',{timeStyle:'short'}),'',1200],'a failed refresh keeps the rows and the place; only Now goes back to its time');
 e.historyReply=page('456');await e.poll();await flush();
 assert.deepEqual([e.historyRequests.length,nowRows().length],[sent+2,1],'the next radio answer tries again');
 // Typing 10172026 in Chromium passes through 0002-10-17, under the field's min.
 sent=e.historyRequests.length;day.validity.valid=false;day.value='0002-10-17';day.emit('change');e.response=onAirNow('457');await e.poll();await flush();
 assert.deepEqual([e.historyRequests.length,asked(e).get('until')],[sent+1,null],'a half-typed day over the live list is no day: the new track redraws the live list');
 routeTo(e,'#statistics');await flush();routeTo(e,'#history');await flush();
 assert.deepEqual([e.historyRequests.length,asked(e).get('until')],[sent+2,null],'nor is it sent when History loads again');
 day.validity.valid=true;day.value='2026-03-28';day.emit('change');await flush();sent=e.historyRequests.length;
 day.validity.valid=false;day.value='0002-03-28';day.emit('change');e.response=onAirNow('458');await e.poll();await flush();
 assert.equal(e.historyRequests.length,sent,'over a picked day, the list waits for the new one, and the radio does not swap it for the live list');
});

test('History marks the track that was on air when it asked, opens no row while it reloads, and allows today after midnight',async()=>{
 const e=setup({journey:true});await flush();
 const page=id=>answer({items:[{id,title:'On air',artist:'Artist',startedAt:new Date().toISOString()},...played(49,1).items],next:'9:1'});
 let reply;const later=id=>url=>new Promise(resolve=>{reply=()=>resolve(page(id)(url));});
 e.response=onAirNow('111');await e.poll();await flush();
 e.historyReply=later('111');routeTo(e,'#history');await flush();
 // Track 222 starts while the list for 111 travels.
 e.response=onAirNow('222');await e.poll();await flush();reply();await flush();
 let sent=e.historyRequests.length;e.historyReply=page('222');await e.poll();await flush();
 assert.equal(e.historyRequests.length,sent+1,'the list showed 111 on air, so 222 still has to come');
 assert.equal(historyRows(e)[0].getAttribute('aria-current'),'true','and then reads Now');
 e.historyReply=later('222');follow(e,stageLink(e,'bermuda-day'));await flush();
 const stale=historyRows(e)[4];follow(e,stale);await flush();
 assert.deepEqual([e.location.hash,e.elements['music-content'].getAttribute('aria-busy')],['#history/bermuda-day','true'],'a row of the list being replaced opens nothing');
 reply();await flush();follow(e,historyRows(e)[4]);await flush();
 assert.equal(e.location.hash,historyRows(e)[4].getAttribute('href'),'once drawn, rows open again');
 routeTo(e,'#history');await flush();
 const day=e.elements['history-day'];day.max='2000-01-01';day.emit('focus');
 assert.equal(day.max,localDay(new Date()),'reaching for the Day field sets today as its last day');
});

test('a live refresh keeps focus on the same play of a track played twice, and a track gone hands focus to a visible Stage select',async()=>{
 const e=setup({journey:true});await flush();
 const at=i=>new Date(Date.UTC(2026,9,19,6)-i*360000).toISOString(),play=(id,i)=>({id,title:'Track '+id,artist:'Artist',startedAt:at(i)});
 const list=[play('1',0),play('2',1),play('3',2),play('7',3),play('5',4),play('6',5),play('7',6)];
 e.response=onAirNow('1');await e.poll();await flush();
 e.historyReply=answer({items:list,next:null});routeTo(e,'#history');await flush();
 const second=historyRows(e).filter(r=>r.getAttribute('href')==='#explore/plex_7')[1];second.focus();
 e.historyReply=answer({items:[play('9',-1),...list],next:null});e.response=onAirNow('9');await e.poll();await flush();
 assert.deepEqual([e.document.activeElement.getAttribute('href'),e.document.activeElement.children[0].dateTime],['#explore/plex_7',at(6)],'focus stays on the second play, not the first');
 e.historyReply=answer({items:[play('8',-2),play('9',-1),...list.slice(0,5)],next:null});e.response=onAirNow('8');await e.poll();await flush();
 assert.deepEqual([e.document.activeElement===currentStage(e),currentStage(e).focusOptions?.preventScroll],[true,undefined],'its play gone, the other play of that track may be far off screen: focus goes to the current stage, scrolled into view');
});

test('the same track started again right after itself is a new play, and History asks for it',async()=>{
 const e=setup({journey:true});await flush();
 const on=(id,startedAt)=>{const r=onAirNow(id);r.track.startedAt=startedAt;return r;};
 // History writes a play's start to the millisecond, the radio to the second.
 const list=(...plays)=>answer({items:[...plays.map(([id,at])=>({id,title:'Track '+id,artist:'Artist',startedAt:at})),...played(48,1).items],next:'9:1'});
 const nowRow=()=>historyRows(e).find(r=>r.getAttribute('aria-current')==='true');
 e.response=on('5','2026-10-19T04:00:00Z');await e.poll();await flush();
 e.historyReply=list(['5','2026-10-19T04:00:00.412Z']);routeTo(e,'#history');await flush();
 assert.equal(nowRow()?.children[0].dateTime,'2026-10-19T04:00:00.412Z','the play on air reads Now');
 const sent=e.historyRequests.length;await e.poll();await flush();
 assert.equal(e.historyRequests.length,sent,'the same play asks for nothing');
 e.historyReply=list(['5','2026-10-19T04:07:00.250Z'],['5','2026-10-19T04:00:00.412Z']);e.response=on('5','2026-10-19T04:07:00Z');await e.poll();await flush();
 assert.deepEqual([e.historyRequests.length,nowRow()?.children[0].dateTime],[sent+1,'2026-10-19T04:07:00.250Z'],'the same track, started again, is a new play: History asks and marks it');
});

test('an earlier play of the track on air is not Now, and History asks again until the play shows',async()=>{
 const e=setup({journey:true});await flush();
 const on=(id,startedAt)=>{const r=onAirNow(id);r.track.startedAt=startedAt;return r;};
 const list=(...plays)=>answer({items:[...plays.map(([id,at])=>({id,title:'Track '+id,artist:'Artist',startedAt:at})),...played(48,1).items],next:'9:1'});
 const nowRow=()=>historyRows(e).find(r=>r.getAttribute('aria-current')==='true');
 e.response=on('5','2026-10-19T04:30:00Z');await e.poll();await flush();
 e.historyReply=list(['5','2026-10-19T04:29:30.412Z']);routeTo(e,'#history');await flush();
 assert.equal(nowRow(),undefined,'a play of the same track thirty seconds earlier is not the one on air');
 const sent=e.historyRequests.length;
 e.historyReply=list(['5','2026-10-19T04:30:00.120Z'],['5','2026-10-19T04:29:30.412Z']);await e.poll();await flush();
 assert.deepEqual([e.historyRequests.length,nowRow()?.children[0].dateTime],[sent+1,'2026-10-19T04:30:00.120Z'],'the next radio answer asks again, and the play shows as Now');
});

test('back on History from a record, a track that came on air meanwhile shows at once',async()=>{
 const e=setup({journey:true});await flush();
 e.discovery=url=>entity(url.split('/').pop(),'track');
 const page=id=>answer({items:[{id,title:'On air '+id,artist:'Artist',startedAt:new Date().toISOString()},...played(49,1).items],next:'9:1'});
 e.response=onAirNow('123');await e.poll();await flush();
 e.historyReply=page('123');routeTo(e,'#history');await flush();
 follow(e,historyRows(e)[3]);await flush();
 // The radio answer comes while the record is open: History is not in view, so it waits.
 e.historyReply=page('456');e.response=onAirNow('456');await e.poll();await flush();
 const sent=e.historyRequests.length;
 routeTo(e,'#history');await flush();
 assert.deepEqual([e.historyRequests.length,historyRows(e)[0].children[1].children[0].textContent,historyRows(e)[0].getAttribute('aria-current')],[sent+1,'On air 456','true'],'the History tab asks at once and marks the new play');
});

test('a failed follow refresh of an empty History says it is empty again, and a new local day draws the headings again',async()=>{
 const e=setup({journey:true});await flush();const status=e.elements['music-status'];
 e.response=onAirNow('1');await e.poll();await flush();
 e.historyReply=answer({items:[],next:null});routeTo(e,'#history');await flush();
 assert.equal(status.textContent,'Nothing has played on this station yet.');
 e.historyReply=()=>null;e.response=onAirNow('2');await e.poll();await flush();
 assert.equal(status.textContent,'Nothing has played on this station yet.','the failed refresh does not leave Loading on screen');
 e.discovery=url=>entity(url.split('/').pop(),'track');
 // The list shows the play on air, so only the day can make it ask again.
 e.historyReply=answer({items:[{id:'2',title:'On air',artist:'Artist',startedAt:new Date().toISOString()},...played(49,1).items],next:'9:1'});follow(e,stageLink(e,'bermuda-day'));await flush();follow(e,stageLink(e,'palac-feel'));await flush();
 assert.equal(historyRows(e)[0].getAttribute('aria-current'),'true');
 follow(e,historyRows(e)[2]);await flush();
 const sent=e.historyRequests.length;e.setWall(86400000);routeTo(e,'#history');await flush();
 assert.equal(e.historyRequests.length,sent+1,'past midnight, Today has become Yesterday: History is drawn again');
});

test('the Day field shows today rather than mm/dd/yyyy, and moves on past midnight while History follows the radio',async()=>{
 const e=setup({journey:true});await flush();const day=e.elements['history-day'],status=e.elements['music-status'];
 e.response=onAirNow('2');await e.poll();await flush();
 e.historyReply=answer({items:[{id:'2',title:'On air',artist:'Artist',startedAt:new Date().toISOString()},...played(49,1).items],next:'9:1'});routeTo(e,'#history');await flush();
 assert.deepEqual([day.value,asked(e).get('until'),historyRows(e)[0].getAttribute('aria-current')],[localDay(new Date()),null,'true'],'today, shown by itself, is no picked day: the list ends at the server\'s now and marks Now');
 e.setWall(86400000);await e.poll();await flush();
 assert.deepEqual([day.value,asked(e).get('until')],[localDay(new Date(Date.now()+86400000)),null],'past midnight the field moves on with the list, which still follows the radio');
 day.value='2026-03-28';day.emit('change');await flush();e.setWall(2*86400000);await e.poll();await flush();
 assert.deepEqual([day.value,asked(e).get('until')],['2026-03-28',new Date(2026,2,29).toISOString()],'a picked day stays picked');
 e.historyReply=answer({items:[],next:null});day.value='';day.emit('change');await flush();
 assert.deepEqual([day.value,status.textContent],[localDay(new Date(Date.now()+2*86400000)),'Nothing has played on this station yet.'],'a cleared field shows today again, and the list is the live one');
});

test('History left open past midnight follows the radio again and names its days anew',async()=>{
 const e=setup({journey:true});await flush();
 e.response=onAirNow('2');await e.poll();await flush();
 e.historyReply=answer({items:[{id:'2',title:'On air',artist:'Artist',startedAt:new Date().toISOString()},...played(49,1).items],next:'9:1'});routeTo(e,'#history');await flush();
 const sent=e.historyRequests.length;await e.poll();await flush();assert.equal(e.historyRequests.length,sent,'the same play, the same day: nothing to ask');
 e.setWall(86400000);e.response=onAirNow('2');await e.poll();await flush();
 assert.equal(e.historyRequests.length,sent+1,'past midnight the next radio answer draws History again');
 await e.poll();await flush();assert.equal(e.historyRequests.length,sent+1,'once');
});

test('past midnight, a History list with earlier pages names its days anew in place, and keeps its rows and its place',async()=>{
 const e=setup({journey:true});await flush();const content=e.elements['music-content'],explorer=e.elements.explorer;
 e.response=onAirNow('2');await e.poll();await flush();
 e.historyReply=answer({items:[{id:'2',title:'On air',artist:'Artist',startedAt:new Date().toISOString()},...played(49,1).items],next:'9:1'});routeTo(e,'#history');await flush();
 e.historyReply=answer(played(50,50,null));e.elements['history-more'].emit('click');await flush();
 // Each day heading, with the start of the row under it.
 const heads=()=>content.children.map((n,i,all)=>n.localName==='h3'?[n.textContent,all[i+1].children[0].dateTime]:null).filter(Boolean);
 const shown=[...content.children],sent=e.historyRequests.length;
 assert.equal(heads()[0][0],'Today');
 explorer.scrollTop=2000;e.setWall(86400000);await e.poll();await flush();
 assert.deepEqual(heads().map(h=>h[0]),heads().map(([,at],i)=>i?new Date(at).toLocaleDateString('en',{weekday:'long',day:'numeric',month:'long'}):'Yesterday'),'Today is Yesterday now, and each heading names the day of the row under it');
 assert.deepEqual([e.historyRequests.length,sameRows(content.children,shown),explorer.scrollTop],[sent,true,2000],'without a reload: the same rows, both pages, scrolled where they were');
 await e.poll();await flush();assert.equal(e.historyRequests.length,sent,'once named, the day asks for nothing');
});

test('Show earlier tracks says it is disabled while any History request runs, and keeps focus',async()=>{
 const e=setup({journey:true});await flush();const more=e.elements['history-more'];
 let reply;e.historyReply=url=>new Promise(resolve=>{reply=page=>resolve(page&&answer(page)(url));});
 routeTo(e,'#history');await flush();reply(played(50,0,'9:1'));await flush();
 more.focus();follow(e,stageLink(e,'bermuda-day'));await flush();
 let sent=e.historyRequests.length;more.emit('click');
 assert.deepEqual([more.hidden,more.getAttribute('aria-disabled'),more.getAttribute('aria-busy'),e.historyRequests.length,e.document.activeElement===more],[false,'true',null,sent,true],'a filter change: the button stays, says it is disabled, asks for nothing, and keeps focus');
 reply(played(50,50,'9:2'));await flush();
 assert.deepEqual([more.getAttribute('aria-disabled'),more.hidden,e.document.activeElement===more],[null,false,true],'once the rows are drawn it works again, still focused');
 follow(e,stageLink(e,e.window.Pavoia.getState().stage));await flush();reply(played(50,0,'9:1'));await flush();
 e.response=onAirNow('999');await e.poll();await flush();sent=e.historyRequests.length;more.emit('click');
 assert.deepEqual([more.getAttribute('aria-disabled'),e.historyRequests.length,e.document.activeElement===more],['true',sent,true],'so does a refresh that follows the radio');
 reply(played(50,0,'9:1'));await flush();
 assert.deepEqual([more.getAttribute('aria-disabled'),e.document.activeElement===more],[null,true]);
 assert.match(cssRules().get('#history-more[aria-disabled=true]'),/opacity:\.45; cursor:default/,'it looks disabled while it is');
});

test('a day the listener picks stays picked, even the day the field showed by itself, after midnight',async()=>{
 const e=setup({journey:true});await flush();const day=e.elements['history-day'];
 e.historyReply=answer(played(50,0,'9:1'));routeTo(e,'#history');await flush();
 const first=day.value,[y,m,d]=first.split('-').map(Number);
 day.value='2026-03-28';day.emit('change');await flush();
 e.setWall(86400000);day.value=first;day.emit('change');await flush();
 assert.deepEqual([day.value,asked(e).get('until')],[first,new Date(y,m-1,d+1).toISOString()],'picked again after midnight, the day it showed first is a pick, not today');
});

test('a day typed in the Day field moves the address without writing back into the field',async()=>{
 const e=setup({journey:true});await flush();const day=e.elements['history-day'];
 e.historyReply=answer(played(50,0,'9:1'));routeTo(e,'#history/fontanna');await flush();
 // Chrome rebuilds a date field whose value or max is written, and drops the segment being typed: the next digit
 // then starts a new month, and focus leaves the field.
 let value=day.value,max=day.max;const writes=[];
 Object.defineProperty(day,'value',{get:()=>value,set:v=>{writes.push('value='+v);value=v;}});
 Object.defineProperty(day,'max',{get:()=>max,set:v=>{writes.push('max='+v);max=v;}});
 const picked=localDay(new Date(Date.now()-5*86400000));day.focus();value=picked;day.emit('change');await flush();
 assert.deepEqual([e.location.hash,asked(e).get('until')!==null,writes,e.document.activeElement===day],['#history/fontanna/'+picked,true,[],true],'the list moves to the day, and the field keeps what is typed and the focus');
});

// Explorer v2 step 4: a stage in Statistics is a place, drawn from /api/library/statistics and, for a station,
// /api/radio/{stage}/music. Both answer with one object here, as in the server's shapes.
const stageStats=(over={})=>({scope:'bermuda-day',updatedAt:new Date(Date.now()).toISOString(),tracks:1113,artists:860,releases:633,durationMs:439688002,coverage:{artists:1113,genres:0,labels:993,releases:1113,years:1105},
 topArtists:[{name:'Jasper Tygner',count:11},{name:'Various Artists',count:10},{name:'Frivolous',count:9},{name:'Stimming',count:8},{name:'Voilaaa',count:8},{name:'Bicep',count:7},{name:'Solomun',count:7}],
 years:[{name:'2025',count:1},{name:'2024',count:43},{name:'2021',count:215},{name:'2019',count:30}],labels:[{name:'Diynamic Music',count:57},{name:'All Day I Dream',count:21}],genres:[],
 stages:[{name:'fontanna',count:122},{name:'bermuda-evening',count:120},{name:'nowhere',count:3}],...over});
const stageMusic=(over={})=>({from:'2026-09-19T12:49:32Z',until:'2026-10-19T12:49:32Z',earliest:'2026-10-06T23:27:25Z',plays:2689,distinctPlayed:1113,unplayed:0,
 top:[{id:'207593',title:'I Choose You',artist:'CHANEY',plays:4},{id:'119020',title:'Au revoir Paris',artist:'Rodriguez Jr.',plays:3},{id:'x1',title:'No id',artist:'Someone',plays:3},{id:'4',title:'Four',artist:'A',plays:3},{id:'5',title:'Five',artist:'B',plays:3},{id:'6',title:'Six',artist:'C',plays:2}],...over});
const stagePlace=async(e,place,over={},music={})=>{e.response={...status('First'),...stageStats(over),...stageMusic(music)};routeTo(e,place);await flush();return e.elements['music-content'];};
const sinceDay=at=>new Date(at).toLocaleDateString('en',{day:'numeric',month:'short'});

test('a stage in Statistics is a place: its photo, name and numbers, then its top names and the stages it shares tracks with, each a link',async()=>{
 const e=setup({journey:true});await flush();e.discovery={items:[]};
 const content=await stagePlace(e,'#statistics/bermuda-day'),since=sinceDay('2026-10-06T23:27:25Z');
 const [picture,about]=byClass(content,'entity-heading')[0].children;
 assert.deepEqual([e.location.hash,picture.dataset.type,picture.children[0].src,about.children.map(textOf)],['#statistics/bermuda-day','stage','photos/selected/p036.jpg',
  ['Bermuda stage','Under the Sun','1,113 tracks by 860 artists, 122 hours of music','2,689 plays since '+since+' ·\u00a0every track has played ·\u00a0See what played','Switch to this station']],'its photo, its stage over its name, its numbers in two lines, each dot held to the words after it, and the switch, since it is not on air');
 assert.deepEqual([about.children[3].children.at(-1).localName,about.children[3].children.at(-1).getAttribute('href')],['a','#history/bermuda-day'],'See what played is a link in the sentence');
 const regions=byClass(content,'region'),rows=r=>byClass(r,'row').map(a=>[a.getAttribute('href'),...a.children.slice(a.children[0].className==='picture'?1:0).map(textOf)]);
 assert.deepEqual(regions.map(r=>textOf(r.children[0])),['Most tracks by 860','Most tracks on','Shares tracks with 2','Release years','Most played since '+since,'Added and removed'],'the heading counts all its artists; a stage the app does not know is left out; with no change, Added and removed comes last');
 assert.deepEqual(rows(regions[0]).slice(0,3),[['#explore/artist/Jasper%20Tygner','Jasper Tygner11 tracks on Under the Sun','11'],[null,'Various Artists10 tracks on Under the Sun','10'],['#explore/artist/Frivolous','Frivolous9 tracks on Under the Sun','9']],'artists by name, Various Artists as plain text, the count as the fact');
 assert.deepEqual([rows(regions[1])[0],rows(regions[2])],[['#explore/label/Diynamic%20Music','Diynamic Music57 tracks on Under the Sun','57'],[['#statistics/fontanna','Fontanna122 tracks in common','122'],['#statistics/bermuda-evening','As Night Begins120 tracks in common','120']]]);
 assert.deepEqual(byClass(regions[2],'picture').map(p=>[p.dataset.type,p.children[0].src]),[['stage','photos/selected/p052.jpg'],['stage','photos/selected/p008.jpg']],'a stage shows its own photo');
 const strip=byClass(content,'years')[0],axis=byClass(content,'years-axis')[0];
 assert.deepEqual([strip.attrs.role,strip.children.length,strip.children.map(b=>[b.attrs.role,b.attrs['aria-label'],b.style.height??'',b.dataset.empty??null]).slice(0,3),axis.children.map(n=>n.textContent)],
  ['list',7,[['listitem','2019: 30 tracks',30/215*100+'%',null],['listitem','2020: 0 tracks','',''],['listitem','2021: 215 tracks','100%',null]],['2019','2021 · 215','2025']],'one bar a year from the first to the last, the empty years kept; the first year, the peak and the last under it');
 assert.deepEqual([axis.children[1].className,axis.children[1].style.left],['years-peak',`clamp(11ch, ${2.5/7*100}%, calc(100% - 11ch))`],'the peak sits under its own bar, the third of seven, and 2ch clear of the years at each end');
 assert.match(cssRules('(max-width:760px)').get('.years'),/height:80px/);assert.ok(lastAt('(max-width:760px)','.years')>lastAt('','.years'),'the 80px phone strip comes after the 120px rule it overrides');
 assert.match(cssRules().get('.years-axis'),/position:relative;/);assert.match(cssRules().get('.years-peak'),/position:absolute; top:0; transform:translateX\(-50%\)/,'centred where the script puts it');
 assert.deepEqual(rows(regions[4]),[['#explore/plex_207593','I Choose YouCHANEY','4×'],['#explore/plex_119020','Au revoir ParisRodriguez Jr.','3×'],[null,'No idSomeone','3×'],['#explore/plex_4','FourA','3×'],['#explore/plex_5','FiveB','3×']],'five at most, no picture, the plays as the fact');
 const details=byClass(content,'stage-notes')[0];
 assert.deepEqual([details.localName,details.children.map(textOf)],['details',['How these numbers are counted','Each track counts once per playlist. Each artist counts once per track, featured artists and remixers included. A track can be on several stations.','A play is a start on the stream, not a full listen.','Playlist checked at '+new Date(Date.now()).toLocaleTimeString('en',{timeStyle:'short'}),'A change shows the time the radio saw it. The radio looks at the playlists every 5 minutes.','Label known for 993 of 1,113 tracks','Year known for 1,105 of 1,113 tracks']],'the method in one closed panel: a coverage sentence only below the track count');
 assert.deepEqual(byClass(content,'collection-note').filter(n=>!details.contains(n)).map(n=>[n.parent===regions[5],textOf(n)]),[[true,'No changes are recorded yet.']],'no other note shows but the sentence of Added and removed');
 e.setLanguage('de');await flush();
 assert.equal(textOf(byClass(content,'stage-notes')[0].children[1]),'Jeder Track zählt einmal pro Playlist. Jeder Künstler zählt einmal pro Track, Featurings und Remixer eingeschlossen. Ein Track kann auf mehreren Sendern laufen.');
 assert.deepEqual([byClass(content,'entity-heading')[0].children[1].children.slice(0,3).map(textOf),byClass(content,'region').map(r=>textOf(r.children[0]))],[['Bühne Bermuda','Under the Sun','1.113 Tracks von 860 Künstlern, 122 Stunden Musik'],['Die meisten Tracks von 860','Die meisten Tracks bei','Teilt Tracks mit 2','Erscheinungsjahre','Am häufigsten gespielt seit '+new Date('2026-10-06T23:27:25Z').toLocaleDateString('de',{day:'numeric',month:'short'}),'Hinzugefügt und entfernt']]);
 assert.deepEqual([textOf(byClass(content,'region').at(-1).children[1]),textOf(byClass(content,'stage-notes')[0].children[4])],['Noch keine Änderungen erfasst.','Eine Änderung zeigt die Zeit, zu der das Radio sie bemerkt hat. Das Radio schaut alle 5 Minuten in die Playlists.']);
 const journey=web('journey.js'),css=web('style.css'),strings=journey.slice(journey.indexOf('const copy'),journey.indexOf('const word'));
 for(const gone of ['selection','artistCredits','hours','topArtists','genres','overlap','stageSizes','coverage','missingMetadata','snapshot','broadcasts','differentTracks','unplayed','frequent','broadcastNote','recordingSince','broadcastError','noPlays','plays','topNote','statisticsNote','noOverlap','radioSelection','library','wholeLibrary'])assert.doesNotMatch(strings,new RegExp('(?<![\\w$])'+gone+':'),gone+' is gone');
 for(const gone of ['renderStatistics','function metric','function chart','music-summary','broadcast-summary','music-charts','chart-row','fillStages','music-stage','played-ranking'])assert.ok(!journey.includes(gone)&&!css.includes(gone)&&!web('index.html').includes(gone),gone+' is gone');
});

test('Most played shows only counts that differ, plays that fail say so in their place, and All stages has no plays',async()=>{
 const e=setup({journey:true,deferFetch:true});await flush();e.discovery={items:[]};e.names={};e.changes=()=>null;const content=e.elements['music-content'];
 const reply=(path,data)=>e.requests.findLast(r=>r.url.includes(path)).resolve(data?{ok:true,json:async()=>data}:{ok:false});
 routeTo(e,'#statistics/bermuda-day');reply('/statistics?',stageStats());reply('/music',null);await flush();
 assert.deepEqual([textOf(byClass(content,'entity-heading')[0].children[1].children[3]),byClass(content,'stage-switch').length,byClass(content,'region').map(r=>textOf(r.children[0])).slice(-2),changeRegion(e).children.map(n=>n.localName+' '+textOf(n))],
  ['Plays could not load.',1,['Release years','Added and removed'],['h4 Added and removed','p The changes could not load.','button Try again']],'the rest of the place still shows, and the changes that failed say so at the end');
 routeTo(e,'#statistics/fontanna');reply('/statistics?',stageStats({scope:'fontanna'}));reply('/music',stageMusic({earliest:'2026-09-01T00:00:00Z',unplayed:194,top:[1,2,3,4,5,6].map(n=>({id:String(n),title:'T'+n,artist:'A',plays:n===6?2:3}))}));await flush();
 assert.deepEqual([textOf(byClass(content,'entity-heading')[0].children[1].children[3]),byClass(content,'region').map(r=>textOf(r.children[0])).slice(-2),textOf(byClass(content,'region').at(-1).children[1])],['2,689 plays in the last 30 days ·\u00a0194 not played yet ·\u00a0See what played',['Release years','Added and removed'],'The changes could not load.'],'plays older than the window are the last 30 days; five tied counts say nothing');
 const asked=e.requests.length;routeTo(e,'#statistics/radio');reply('/statistics?',stageStats({scope:'radio',stages:[{name:'bermuda-evening',count:2040}]}));await flush();
 const heading=byClass(content,'entity-heading')[0];
 assert.deepEqual([e.requests.length-asked,heading.children.length,heading.children[0].children.map(textOf),byClass(content,'stage-switch').length],[1,1,['All stations','1,113 tracks by 860 artists, 122 hours of music'],0],'one request, no photo, no eyebrow, no plays and no switch');
 assert.deepEqual(byClass(content,'region').slice(0,3).map(r=>[textOf(r.children[0]),textOf(byClass(r,'row')[0].children[1])]),[['Most tracks by 860','Jasper Tygner11 tracks'],['Most tracks on','Diynamic Music57 tracks'],['Stations 1','As Night Begins2,040 tracks']],'every station, by its size');
 assert.ok(!byClass(content,'stage-notes')[0].children.map(textOf).includes('A play is a start on the stream, not a full listen.'),'no word about plays where none show');
 routeTo(e,'#statistics/library');await flush();
 assert.deepEqual([e.location.hash,e.requests.findLast(r=>r.url.includes('/statistics?')).url,e.requests.some(r=>r.url.includes('scope=library'))],['#statistics/radio','/api/library/statistics?scope=radio',false],'the whole library is All stations, which holds every playlist');
});

test('a link that leaves with its place hands focus to the next one: a stage place to its name, History to its stage in the row',async()=>{
 const e=setup({journey:true});await flush();e.discovery={items:[]};e.historyReply=answer(played(50,0,'9:1'));
 const content=await stagePlace(e,'#statistics/bermuda-day'),title=()=>content.descendants().find(n=>n.localName==='h3');
 const link=href=>content.descendants().find(n=>n.localName==='a'&&n.getAttribute('href')===href);
 assert.equal(e.document.activeElement,title(),'a stage place starts at its name, as a record starts at its title');
 const shared=link('#statistics/fontanna');shared.focus();e.response={...status('First'),...stageStats({scope:'fontanna'}),...stageMusic()};follow(e,shared);await flush();
 assert.deepEqual([e.location.hash,e.document.activeElement===title(),textOf(title())],['#statistics/fontanna',true,'Fontanna'],'a stage it shares tracks with, never the page');
 const see=link('#history/fontanna');see.focus();follow(e,see);await flush();
 assert.deepEqual([e.location.hash,e.document.activeElement===currentStage(e),textOf(currentStage(e))],['#history/fontanna',true,'Fontanna'],'See what played starts History on its stage in the row');
 const data=hood();e.discovery=url=>data[url.split('/').pop()]||null;e.visit('#explore/art_000000000001');await flush();
 const place=byClass(inspector(e),'entity-line')[0].descendants().find(n=>n.getAttribute?.('href')==='#statistics/essentials');
 place.focus();e.response={...status('First'),...stageStats({scope:'essentials'}),...stageMusic()};follow(e,place);await flush();
 assert.deepEqual([e.location.hash,e.document.activeElement===title(),textOf(title())],['#statistics/essentials',true,'Essentials'],'so does a stage in a record\'s line');
 const row=byClass(content,'row').find(a=>a.getAttribute('href')==='#statistics/fontanna');row.focus();
 e.response={...status('First'),...stageStats({scope:'fontanna'}),...stageMusic()};follow(e,row);
 const elsewhere=e.elements['history-day'];elsewhere.focus();await flush();
 assert.equal(e.document.activeElement,elsewhere,'focus the listener moved while the place loaded stays where it went');
});

test('Switch to this stage tunes the radio without starting it, then gives way to On air, in place',async()=>{
 const e=setup({journey:true});await flush();e.discovery={items:[]};
 const content=await stagePlace(e,'#statistics/bermuda-day'),button=byClass(content,'stage-switch')[0],kind=byClass(content,'eyebrow')[0],title=content.descendants().find(n=>n.localName==='h3'),shown=[...content.children];
 button.focus();button.emit('click');await flush();
 assert.deepEqual([e.window.Pavoia.getState().stage,e.window.Pavoia.getState().wanted,textOf(e.elements['player-stage']),button.hidden,textOf(kind),e.document.activeElement===title,sameRows(content.children,shown)],['bermuda-day',false,'Under the Sun · Bermuda',true,'Bermuda stage ·\u00a0On air',true,true],'the player bar shows the station and its stage, still paused; the button goes, its focus to the name, and On air shows');
 e.window.Pavoia.tune('palac-feel');await flush();
 assert.deepEqual([button.hidden,textOf(kind),sameRows(content.children,shown)],[false,'Bermuda stage',true],'another station tuned elsewhere brings the button back and puts the dot out');
 e.click();e.playing();const calls=e.audio.calls.length;button.emit('click');await flush();
 assert.deepEqual([e.window.Pavoia.getState().stage,e.window.Pavoia.getState().wanted,e.audio.src,e.audio.calls.length,button.hidden,textOf(kind)],['bermuda-day',true,'/stream/bermuda-day.mp3',calls+1,true,'Bermuda stage ·\u00a0On air'],'while the radio plays, Switch moves the music in one cut, and On air moves with it');
 assert.match(cssRules().get('#explorer :is(#music-status button, #history-more, .stage-switch)'),/border:1px solid var\(--line\)/,'a bordered button');
});

test('History and Statistics keep their stage and day in the address, in one entry each, behind a stage row',async()=>{
 const e=setup({journey:true});await flush();e.discovery={items:[]};e.historyReply=answer(played(50,0,'9:1'));
 const row=e.elements['stage-row'],links=()=>row.children.map(a=>[textOf(a),a.getAttribute('href'),a.attrs['aria-current']??null]),tabs=()=>e.document.querySelectorAll('.explorer-nav a').map(a=>a.getAttribute('href'));
 await stagePlace(e,'#statistics/radio',{scope:'radio'});const kept=e.entries().length;
 assert.deepEqual([links()[0],links()[6],links().at(-1),links().length],[['All stations','#statistics/radio','page'],['Fontanna','#statistics/fontanna',null],['Essentials','#statistics/essentials',null],10],'All stations, then the nine stations; the current one marked');
 assert.equal(row.attrs['aria-label'],'Stations','the row is named by what it lists');
 e.response={...status('First'),...stageStats({scope:'fontanna'}),...stageMusic()};follow(e,stageLink(e,'fontanna'));await flush();
 assert.deepEqual([e.location.hash,e.entries().length,textOf(currentStage(e))],['#statistics/fontanna',kept+1,'Fontanna'],'a stage in the row adds one entry');
 follow(e,byClass(e.elements['music-content'],'row').find(a=>a.getAttribute('href')==='#statistics/bermuda-evening'));await flush();
 assert.deepEqual([e.location.hash,e.entries().length],['#statistics/bermuda-evening',kept+2],'so does a stage it shares tracks with');
 routeTo(e,'#history/bermuda-day/2026-03-28');await flush();
 assert.deepEqual([links().length,links()[0],links()[1],e.elements['history-day'].value,asked(e).get('until'),tabs()],[10,['All stations','#history/radio',null],['Under the Sun','#history/bermuda-day/2026-03-28','page'],'2026-03-28',new Date(2026,2,29).toISOString(),['#explore','#history/bermuda-day/2026-03-28','#statistics/bermuda-evening','#index/artists']],'History: All stations, which has no day, then the nine stages, each keeping the day; each tab keeps its last place');
 const today=localDay(new Date());
 for(const [typed,place] of [['#statistics','#statistics/palac-feel'],['#statistics/bus','#statistics/palac-feel'],['#statistics/library','#statistics/radio'],['#statistics/library/artists','#index/artists?by=tracks'],['#statistics/library/more','#statistics/radio'],['#statistics/fontanna/more','#statistics/fontanna'],['#statistics/bus/artists','#index/artists?by=tracks'],['#history','#history/palac-feel'],['#history/radio','#history/radio'],['#history/radio/2026-03-28','#history/radio'],['#history/%E0','#history/palac-feel'],['#history/fontanna/2999-01-01','#history/fontanna'],['#history/fontanna/'+today,'#history/fontanna'],['#history/fontanna/2026-3-28','#history/fontanna']]){
  e.visit(typed);await flush();assert.equal(e.location.hash,place,typed);
 }
 assert.equal(e.elements['history-day'].value,today,'a bare stage shows today, the live list');
 routeTo(e,'#history/bermuda-day/2999-01-01');await flush();
 assert.deepEqual([e.location.hash,asked(e).get('until'),e.elements['history-day'].value],['#history/bermuda-day',null,today],'a day after today is no day: the live list, asked to the server\'s now, from a link read once');
 // On a phone the row scrolls: it starts on the current stage, and fades where stages wait.
 let left=0;Object.defineProperty(row,'scrollLeft',{get:()=>left,set:v=>{left=Math.max(0,Math.min(800,v));}});Object.assign(row,{clientWidth:300,scrollWidth:1100});
 Object.defineProperty(e.Element.prototype,'offsetLeft',{configurable:true,get(){return this.parent===row?row.children.indexOf(this)*100:0;}});Object.defineProperty(e.Element.prototype,'offsetWidth',{configurable:true,get(){return 90;}});
 routeTo(e,'#statistics/fontanna');await flush();
 assert.deepEqual([row.scrollLeft,row.getAttribute('data-before'),row.getAttribute('data-more')],[600-105,'',''],'Fontanna, the seventh link, in the middle of the row');
 currentStage(e).focus();e.setLanguage('de');await flush();
 assert.deepEqual([row.attrs['aria-label'],links()[0][0],links().at(-1)[0],e.document.activeElement===currentStage(e)],['Sender','Alle Sender','Essentials',true],'in German, and focus in the row stays on the current station');
 const rules=cssRules(),phone=cssRules('(max-width:760px)');
 assert.match(rules.get('.stage-row a, .index-order a'),/font:19px\/1\.2 var\(--serif\); color:var\(--soft\);/,'the radio rail\'s style, which the Index\'s orders share');assert.match(rules.get('.stage-row a:is(:hover, [aria-current]), .index-order a:is(:hover, [aria-current])'),/color:var\(--cream\)/);
 assert.match(rules.get(':is(.stage-row, .index-order) a[aria-current] > span::after'),/position:absolute; inset:auto 0 -3px; height:1px; background:currentColor/,'a 1px line under the current stage\'s name only, 8px above the 44px link\'s bottom as before');
 assert.ok(row.children.every(a=>a.children.length===1&&a.children[0].localName==='span'),'each stage is its name in a span, which carries the line');
 assert.match(rules.get('.stage-row'),/display:flex; gap:0 var\(--s3\); min-width:0; overflow-x:auto; scrollbar-width:none; padding:6px var\(--s2\); margin:-6px calc\(-1 \* var\(--s2\)\);/,'one line at every width, which scrolls sideways where the stations do not fit, with 6px above and below and 8px at each end for a focus ring, the names on the gutter');
 assert.doesNotMatch(rules.get('.stage-row'),/flex-wrap/,'it never wraps, so no line break cuts a group');
 assert.match(phone.get('.stage-row'),/flex:1 0 calc\(100% \+ 2 \* var\(--gutter\)\); margin-inline:calc\(-1 \* var\(--gutter\)\); padding-inline:var\(--gutter\);/,'on a phone, edge to edge, the gutter inside');
 const css=web('style.css');assert.ok(css.indexOf('.stage-row { flex:1 0')>css.indexOf('.stage-row { position:relative'),'the phone rule comes after the rule it overrides');
 assert.match(web('index.html'),/<form id="music-filters" class="music-filters"><nav id="stage-row" class="stage-row" aria-label="Stations"><\/nav><label id="history-day-label">/,'the row, then the Day field');
});

test('a name from the statistics opens the one record of its type and name, or the search for it',async()=>{
 const e=setup({journey:true});await flush();
 const found={'âme':[{id:'art_0000000000a1',type:'artist',title:'Âme'},{id:'trk_0000000000a1',type:'track',title:'Âme'}],ki:[{id:'lab_0000000000b1',type:'label',title:'Ki'},{id:'lab_0000000000b2',type:'label',title:'KI'}]};
 e.discovery=url=>url.includes('/search?')?{items:found[new URL(url,'http://x').searchParams.get('q').toLowerCase()]||[]}:entity(url.split('/').pop());
 const searches=()=>e.discoveryRequests.filter(r=>r.url.includes('/search?')).map(r=>r.url);
 routeTo(e,'#explore/artist/%C3%82me');await flush();
 assert.deepEqual([e.location.hash,searches(),inspector(e).descendants().find(n=>n.localName==='h3')?.textContent],['#explore/art_0000000000a1',['/api/discovery/search?q=%C3%82me'],'Name art_0000000000a1'],'one artist of that name: its record');
 routeTo(e,'#explore/artist/%C3%A2ME');await flush();assert.equal(e.location.hash,'#explore/art_0000000000a1','the same name in another case');
 routeTo(e,'#explore/artist/%C3%82me');await flush();assert.equal(searches().length,2,'a name already found asks nothing');
 routeTo(e,'#explore/label/Ki');await flush();
 assert.deepEqual([e.location.hash,e.elements['discovery-query'].value,e.elements['discovery-results'].hidden,searches().length],['#explore?q=Ki','Ki',false,4],'two labels of that name: the search for it');
 e.visit('#explore/artist/'+'a'.repeat(201));await flush();assert.equal(e.elements.explorer.open,false,'a name over 200 characters is no place');
});

test('a name still being looked up when the listener leaves for History or Statistics never rewrites the address',async()=>{
 const e=setup({journey:true});await flush();e.historyReply=answer(played(5));
 // A browser's fetch rejects an aborted request with an AbortError.
 e.discovery=url=>url.includes('/search?')?new Promise((_resolve,reject)=>e.discoveryRequests.at(-1).signal.addEventListener('abort',()=>reject(new DOMException('This operation was aborted','AbortError')))):entity(url.split('/').pop());
 for(const [away,place] of [['#history/fontanna','#history/fontanna'],['#statistics/fontanna','#statistics/fontanna']]){
  routeTo(e,'#explore/artist/Jasper%20Tygner');await flush();const lookup=e.discoveryRequests.at(-1);
  e.response={...status('First'),...stageStats({scope:'fontanna'}),...stageMusic()};routeTo(e,away);await flush();
  assert.deepEqual([lookup.signal.aborted,e.location.hash,e.elements['music-view'].hidden,e.elements['discovery-query'].value],[true,place,false,''],'the lookup is dropped, and the listener stays where they went: '+away);
 }
});

test('a History address names a real day the Day field can hold, from 1970 to yesterday, or no day',async()=>{
 const e=setup({journey:true});await flush();e.historyReply=answer(played(5));
 for(const [day,kept] of [['2024-02-29',true],['1970-01-01',true],['2025-02-29',false],['2026-02-31',false],['2026-04-31',false],['2026-13-01',false],['2026-00-10',false],['1969-12-31',false],['0001-01-01',false]]){
  e.visit('#history/fontanna/'+day);await flush();
  assert.deepEqual([e.location.hash,e.elements['history-day'].value],kept?['#history/fontanna/'+day,day]:['#history/fontanna',localDay(new Date())],day);
 }
});

test('the first three artists and labels of a stage get their picture and their record in place, unless the listener saves data',async()=>{
 const media='/api/discovery/media/'+'a'.repeat(40),dPicture='/api/discovery/media/'+'d'.repeat(40);
 for(const saveData of [false,true]){
  const e=setup({journey:true,saveData});await flush();
  e.discovery=url=>({items:new URL(url,'http://x').searchParams.get('q')==='Frivolous'?[{id:'art_0000000000c1',type:'artist',title:'Frivolous',image:media}]:[]});
  // Jasper Tygner and Diynamic Music come with their own records, as the statistics give the top names now.
  const own={topArtists:stageStats().topArtists.map(a=>a.name==='Jasper Tygner'?{...a,id:'art_0000000000d1',image:dPicture}:a),labels:[{name:'Diynamic Music',count:57,id:'lab_0000000000d2'},{name:'All Day I Dream',count:21}]};
  const content=await stagePlace(e,'#statistics/bermuda-day',own),asked=e.discoveryRequests.filter(r=>r.url.includes('/search?')).map(r=>new URL(r.url,'http://x').searchParams.get('q')),row=name=>byClass(content,'row').find(a=>textOf(a).startsWith(name));
  if(saveData){assert.deepEqual(asked,[],'Save-Data: no search, every name keeps its initial');continue;}
  assert.deepEqual(asked,['Frivolous','Stimming','All Day I Dream'],'the first three artists, Various Artists left out, and the labels there are, but never a name with its own record');
  assert.deepEqual([row('Frivolous').getAttribute('href'),byClass(row('Frivolous'),'picture')[0].children[0].src,row('Stimming').getAttribute('href'),byClass(row('Stimming'),'picture')[0].dataset.initial,row('Jasper').getAttribute('href'),byClass(row('Jasper'),'picture')[0].children[0].src,row('Diynamic').getAttribute('href')],
   ['#explore/art_0000000000c1',media,'#explore/artist/Stimming','S','#explore/art_0000000000d1',dPicture,'#explore/lab_0000000000d2'],'a match fills its picture and its link in place; a miss keeps its name and its initial; a name with its record links there with its picture');
  routeTo(e,'#statistics/fontanna');await flush();
  assert.equal(e.discoveryRequests.filter(r=>r.url.includes('/search?')).length,3,'names already asked, found or not, ask nothing again');
  e.discovery=()=>new Promise(()=>{});e.response={...status('First'),...stageStats({scope:'etage-zero',topArtists:[{name:'New One',count:3}],labels:[]}),...stageMusic()};routeTo(e,'#statistics/etage-zero');await flush();
  const late=e.discoveryRequests.at(-1);routeTo(e,'#history');await flush();
  assert.deepEqual([new URL(late.url,'http://x').searchParams.get('q'),late.signal.aborted],['New One',true],'leaving the view drops the searches still out');
 }
});

// Step "every name": the inventory keeps every artist and label of the playlists, and the labels document holds them
// all. With it, a place leads its counts into the Index; without it (404 or 503 until the server serves it), the place
// stays as it was.
const everyName=(over={})=>{
 const topArtists=[{name:'Jasper Tygner',count:300},{name:'Various Artists',count:299},{name:'Âme',count:298},...Array.from({length:247},(_,i)=>({name:'Act '+(i+1),count:i<240?297-i:1}))];
 return stageStats({topArtists,artists:topArtists.length,labels:Array.from({length:130},(_,i)=>({name:'Label '+(i+1),count:130-i})),...over});
};
// A labels document of n labels, the first `on` of them on Under the Sun and the rest on Fontanna.
const labelDoc=(n,on)=>({kind:'labels',updatedAt:'2026-10-20T00:00:00Z',total:n,items:Array.from({length:n},(_,i)=>({name:'Label '+(i+1),count:n-i,stages:i<on?{'bermuda-day':n-i}:{fontanna:n-i}}))});
test('with the labels document, a stage links its artists and labels in its numbers, and its regions keep their top names',async()=>{
 const e=setup({journey:true});await flush();e.discovery={items:[]};e.names={labels:labelDoc(140,130)};
 let content=await stagePlace(e,'#statistics/bermuda-day',everyName());
 const line=()=>byClass(content,'entity-heading')[0].children[1].children[2],regions=()=>byClass(content,'region');
 assert.deepEqual([textOf(line()),line().children.filter(n=>n.localName==='a').map(a=>[a.textContent,a.getAttribute('href')])],['1,113 tracks by 250 artists on 130 labels, 122 hours of music',[['250 artists','#index/artists/bermuda-day?by=tracks'],['130 labels','#index/labels/bermuda-day?by=tracks']]],'the artists and the labels are links in the sentence');
 const after=r=>r.children.at(-1);
 assert.deepEqual(regions().slice(0,2).map(r=>[textOf(r.children[0]),byClass(r,'row').length,after(r).localName,cls(after(r)),after(r).textContent,after(r).getAttribute('href')]),
  [['Most tracks by 250',6,'a','text-button','All 250 artists','#index/artists/bermuda-day?by=tracks'],['Most tracks on 130',6,'a','text-button','All 130 labels','#index/labels/bermuda-day?by=tracks']],'six names, then a link to every one of them instead of Show all; the heading counts stay, and the labels have one now');
 assert.deepEqual(e.discoveryRequests.filter(r=>r.url.includes('/search?')).map(r=>new URL(r.url,'http://x').searchParams.get('q')),['Jasper Tygner','Âme','Act 1','Label 1','Label 2','Label 3'],'pictures for the top three of each, as before');
 e.setLanguage('de');await flush();
 assert.deepEqual([textOf(line()),after(regions()[0]).textContent,after(regions()[1]).textContent],['1.113 Tracks von 250 Künstlern auf 130 Labels, 122 Stunden Musik','Alle 250 Künstler','Alle 130 Labels']);
 // Without the labels document the place looks as it did with 12 names, however many names the statistics hold.
 const plain=setup({journey:true});await flush();plain.discovery={items:[]};plain.names={};
 content=await stagePlace(plain,'#statistics/fontanna',everyName({scope:'fontanna'}));
 assert.deepEqual([line().children,textOf(after(regions()[0])),after(regions()[0]).localName,textOf(regions()[1].children[0])],[['1,113 tracks by 250 artists, 122 hours of music'],'Show all 12','button','Most tracks on'],'one plain sentence, one text as before so it shapes the same, the first 12 names only, and no label count');
 // On the map a region holds its first 12 names, not the 14 a side can show.
 const m=setup({journey:true,media:['(min-width:1100px)']});mapBoxes(m);await flush();m.discovery={items:[]};m.names={labels:labelDoc(140,130)};
 const map=byClass(await stagePlace(m,'#statistics/bermuda-day',everyName()),'neighbourhood')[0];
 assert.deepEqual(byClass(map,'region').slice(0,2).map(r=>[byClass(r,'row').length,byClass(r,'text-button').length]),[[12,0],[12,0]],'the map keeps its look: no link under its names');
 // The longer sentence would take a second line in the middle of the map and push its button onto the caption.
 const mapLine=e=>byClass(byClass(e.elements['music-content'],'entity-heading')[0],'entity-line')[0],counts=e=>byClass(e.elements['music-content'],'region').slice(0,2).map(r=>{const a=r.children[0].descendants().find(n=>n.localName==='a');return [textOf(r.children[0]),a?.getAttribute('href'),a?.attrs['aria-label']];});
 assert.deepEqual([mapLine(m).children,counts(m)],[['1,113 tracks by 250 artists, 122 hours of music'],[['Most tracks by 250','#index/artists/bermuda-day?by=tracks','All 250 artists'],['Most tracks on 130','#index/labels/bermuda-day?by=tracks','All 130 labels']]],'on the map the line stays one plain sentence, and the counts over the regions link to the Index');
 const m2=setup({journey:true,media:['(min-width:1100px)']});mapBoxes(m2);await flush();m2.discovery={items:[]};m2.names={};
 await stagePlace(m2,'#statistics/bermuda-day',everyName());
 assert.deepEqual(counts(m2),[['Most tracks by 250',undefined,undefined],['Most tracks on',undefined,undefined]],'without the labels document, the counts are plain, as before');
});

test('the labels document turns the counts into links to the Index, most tracks first, and its absence changes nothing',async()=>{
 // The statistics as the server gives them: the first 12 artists and labels of a station whose 1158 artists they count.
 const real=setup({journey:true});await flush();real.discovery={items:[]};real.names={labels:labelDoc(400,341)};
 const top=n=>Array.from({length:12},(_,i)=>({name:n+' '+(i+1),count:40-i}));
 let content=await stagePlace(real,'#statistics/bermuda-day',{artists:1158,topArtists:top('Act'),labels:top('Label')});
 const links=()=>content.descendants().filter(n=>n.localName==='a'&&/^#index\//.test(n.getAttribute('href')||'')).map(a=>[a.textContent,a.getAttribute('href')]);
 assert.deepEqual(links(),[['1,158 artists','#index/artists/bermuda-day?by=tracks'],['341 labels','#index/labels/bermuda-day?by=tracks'],['All 1,158 artists','#index/artists/bermuda-day?by=tracks'],['All 341 labels','#index/labels/bermuda-day?by=tracks']],
  'a place whose statistics hold 12 of its 1158 artists still leads all of them into the Index, and counts its labels from the document');
 const e=setup({journey:true});await flush();e.discovery={items:[]};e.names={labels:labelDoc(140,131)};
 content=await stagePlace(e,'#statistics/bermuda-day',everyName());
 assert.deepEqual(links(),[['250 artists','#index/artists/bermuda-day?by=tracks'],['131 labels','#index/labels/bermuda-day?by=tracks'],['All 250 artists','#index/artists/bermuda-day?by=tracks'],['All 131 labels','#index/labels/bermuda-day?by=tracks']],
  'the artists counted by the statistics, the labels of the document on this station, each into the Index on this station, most tracks first');
 assert.ok(!content.descendants().some(n=>/^#statistics\/[^/]+\/(?:artists|labels)$/.test(n.getAttribute?.('href')||'')),'no link to the old lists of names');
 const kept=e.entries().length;follow(e,content.descendants().find(n=>n.textContent==='All 250 artists'));await flush();
 assert.deepEqual([e.location.hash,e.entries().length,e.document.querySelectorAll('.explorer-nav a')[2].getAttribute('href')],['#index/artists/bermuda-day?by=tracks',kept+1,'#statistics/bermuda-day'],'the Index adds one entry, and the Statistics tab returns to the place');
 e.response={...status('First'),...everyName({scope:'radio'})};routeTo(e,'#statistics/radio');await flush();content=e.elements['music-content'];
 assert.deepEqual([links(),e.namesRequests.map(r=>r.url).filter(url=>url.endsWith('=labels'))],[[['250 artists','#index/artists?by=tracks'],['140 labels','#index/labels?by=tracks'],['All 250 artists','#index/artists?by=tracks'],['All 140 labels','#index/labels?by=tracks']],['/api/library/names?kind=labels']],
  'All stations counts every label of the document and leads into the Index on all stations; the document loads once per page');
 for(const missing of [()=>null,()=>({kind:'labels'})]){
  const n=setup({journey:true});await flush();n.discovery={items:[]};n.names=missing;
  content=await stagePlace(n,'#statistics/bermuda-day',everyName());
  assert.deepEqual([links(),textOf(byClass(content,'entity-heading')[0].children[1].children[2]),byClass(content,'region').slice(0,2).map(r=>textOf(r.children[0])),textOf(byClass(content,'region')[0].children.at(-1)),n.elements['music-status'].textContent,n.namesRequests.length],
   [[],'1,113 tracks by 250 artists, 122 hours of music',['Most tracks by 250','Most tracks on'],'Show all 12','',1],'a document that fails or cannot be read leaves the place as it was, with no error');
 }
});

test('a place left after the labels document came, before its changes did, leaves the document for the next place',async()=>{
 const e=setup({journey:true});await flush();e.discovery={items:[]};e.names={labels:labelDoc(140,131)};
 e.changes=url=>url.includes('/fontanna/')?new Promise(()=>{}):null;
 const labelsAsked=()=>e.namesRequests.filter(r=>r.url.endsWith('=labels')).length;
 await stagePlace(e,'#statistics/fontanna',everyName({scope:'fontanna'}));
 assert.deepEqual([labelsAsked(),byClass(e.elements['music-content'],'entity-heading').length],[1,0],'the labels document came; the place waits for its changes');
 for(const id of ['essentials','closing']){e.response={...status('First'),...everyName({scope:id}),...stageMusic()};follow(e,stageLink(e,id));await flush();}
 const content=e.elements['music-content'],links=content.descendants().filter(n=>n.localName==='a'&&/^#index\//.test(n.getAttribute('href')||'')).map(a=>a.getAttribute('href'));
 assert.deepEqual([labelsAsked(),links[0],links.length],[1,'#index/artists/closing?by=tracks',4],'one labels document per page load, kept through the places after');
 assert.deepEqual(byClass(content,'region').at(-1).children.map(textOf),['Added and removed','The changes could not load.','Try again'],'and their changes, which fail, say so at the end');
});

// A station's changes: n records over syncs of `per`, newest first, sequence n down to 1, one observedAt per sync, a day
// apart, every third one removed.
const changeFeed=(n,per,newest)=>Array.from({length:n},(_,i)=>({sequence:String(n-i),kind:i%3===2?'removed':'added',id:String(9000+n-i),title:'Change '+(n-i),artist:'Artist '+(n-i),album:'Album',observedAt:new Date(newest-Math.floor(i/per)*86400000).toISOString()}));
// A page as the server answers it, from limit and before, with next only when more records wait; `most`, when set, is a
// server that answers fewer records than the limit asks, which the page follows by next as well.
const changePage=(records,since='2026-10-07T00:15:13Z',most=100)=>url=>{const q=new URL(url,'http://radio').searchParams,limit=Math.min(Number(q.get('limit')||30),most),before=Number(q.get('before')||Infinity),rest=records.filter(r=>Number(r.sequence)<before),out=rest.slice(0,limit);
 return {trackingSince:since,changes:out,next:rest.length>limit?out.at(-1).sequence:null};};
const changeRegion=e=>byClass(e.elements['music-content'],'region').find(r=>r.attrs['aria-labelledby']==='r-changes');
const notesOf=e=>byClass(byClass(e.elements['music-content'],'stage-notes')[0],'collection-note').map(textOf);
test('Added and removed comes first when it has rows, and says at the end when it is empty, not recorded yet or failing, with Try again',async()=>{
 const e=setup({journey:true});await flush();e.discovery={items:[]};
 // 123 changes: a page of 100, then one of 23.
 const records=changeFeed(123,9,clock.now);let reply=null;e.changes=changePage(records);
 const content=await stagePlace(e,'#statistics/bermuda-day'),since=sinceDay('2026-10-06T23:27:25Z');let region=changeRegion(e);
 const rows=()=>byClass(region,'row'),read=a=>[a.getAttribute('href'),a.children[0].localName,a.children[0].dateTime,...a.children.map(textOf)],titles=()=>byClass(region,'row-name').map(textOf);
 assert.deepEqual([byClass(content,'regions')[0].children[0]===region,byClass(content,'region').map(r=>textOf(r.children[0])),region.children[0].id,region.dataset.key,e.changesRequests.map(r=>r.url)],
  [true,['Added and removed','Most tracks by 860','Most tracks on','Shares tracks with 2','Release years','Most played since '+since],'r-changes',undefined,['/api/radio/bermuda-day/changes?limit=100']],'one request for a page of 100, and with rows the region is the first of the grid, labelled by its heading, with no data-key');
 assert.deepEqual([rows().length,read(rows()[0]),read(rows()[2]).at(-1),read(rows()[9])],[10,['#explore/plex_9123','time',records[0].observedAt,new Date(records[0].observedAt).toLocaleTimeString('en',{timeStyle:'short'}),'Change 123Artist 123','added'],'removed',
  ['#explore/plex_9114','time',records[9].observedAt,sinceDay(records[9].observedAt),'Change 114Artist 114','added']],'the newest ten; each row: the time today or the day before, the title over its artist, and what happened; it opens its track');
 let more=region.children.at(-1);const first=rows();
 assert.deepEqual([more.localName,cls(more),more.textContent,notesOf(e).includes('Changes are recorded since '+sinceDay('2026-10-07T00:15:13Z')+'.')],['button','text-button','Show earlier changes',true]);
 more.focus();more.emit('click');
 assert.deepEqual([rows().length,sameRows(rows().slice(0,10),first),e.changesRequests.length,more.textContent,more.getAttribute('aria-busy'),e.document.activeElement===more],[20,true,1,'Show earlier changes',null,true],'ten more wait in memory: the first press shows them at once, under the rows shown, and asks for nothing');
 // A redraw, here across 760px and back, shows the rows the place showed.
 const twenty=titles();
 for(const phone of [true,false]){e.queries.get('(max-width:760px)').change(phone);await flush();region=changeRegion(e);assert.deepEqual([titles(),region.children.at(-1).textContent],[twenty,'Show earlier changes'],'drawn again with its twenty rows');}
 more=region.children.at(-1);
 for(let n=30;n<=100;n+=10){more.emit('click');await flush();assert.equal(rows().length,n);}
 assert.equal(e.changesRequests.length,1,'the first page gives a hundred rows, with no request');
 const hundred=rows();
 e.changes=url=>new Promise(resolve=>{reply=ok=>resolve(ok?changePage(records)(url):null);});
 more.focus();more.emit('click');await flush();
 assert.deepEqual([more.textContent,more.getAttribute('aria-disabled'),more.getAttribute('aria-busy'),e.document.activeElement===more,e.changesRequests.at(-1).url],['Loading…','true','true',true,'/api/radio/bermuda-day/changes?limit=100&before=24'],'then it asks for the next page of 100, from the oldest change read; busy in place and still focused');
 const sent=e.changesRequests.length;more.emit('click');assert.equal(e.changesRequests.length,sent,'a second press while it loads asks for nothing');
 reply(false);await flush();
 assert.deepEqual([more.textContent,rows().length,more.getAttribute('aria-disabled'),e.document.activeElement===more],['Try again',100,null,true],'a failure says so on the button and keeps the rows');
 more.emit('click');await flush();assert.equal(e.changesRequests.at(-1).url,'/api/radio/bermuda-day/changes?limit=100&before=24','Try again asks for the same page');
 reply(true);await flush();
 assert.deepEqual([rows().length,sameRows(rows().slice(0,100),hundred),more.textContent,more.getAttribute('aria-disabled'),more.getAttribute('aria-busy'),e.document.activeElement===more],[110,true,'Show earlier changes',null,null,true],'ten more under the rows shown, and focus stays on the button');
 more.emit('click');await flush();assert.deepEqual([rows().length,e.changesRequests.length,region.children.includes(more)],[120,sent+1,true],'the rest of that page waits in memory too');
 more.emit('click');await flush();
 assert.deepEqual([rows().length,region.children.includes(more),e.document.activeElement===rows()[120],read(rows()[122]).slice(0,2),e.changesRequests.length],[123,false,true,['#explore/plex_9001','time'],sent+1],'the last rows take the button away, and focus moves to the first change they showed');
 // A language switch draws the place again from its top, from the journal kept: no request.
 e.changes=changePage(records);e.setLanguage('de');await flush();region=changeRegion(e);
 assert.deepEqual([textOf(region.children[0]),rows().length,byClass(region,'row-fact').slice(0,3).map(textOf),region.children.at(-1).textContent,notesOf(e).find(t=>t.startsWith('Änderungen')),e.changesRequests.length],
  ['Hinzugefügt und entfernt',10,['hinzugefügt','hinzugefügt','entfernt'],'Frühere Änderungen anzeigen','Änderungen werden seit '+new Date('2026-10-07T00:15:13Z').toLocaleDateString('de',{day:'numeric',month:'short'})+' erfasst.',sent+1]);
 e.setLanguage('en');await flush();
 // The map and the list draw the place again too: with the map, then the list, the same rows.
 const m=setup({journey:true,media:['(min-width:1100px)']});mapBoxes(m);await flush();m.discovery={items:[]};m.changes=changePage(records);
 const placed=await stagePlace(m,'#statistics/bermuda-day'),mapped=()=>byClass(changeRegion(m),'row-name').map(textOf),toggle=()=>byClass(placed,'neighbourhood-caption')[0].children.at(-1);
 changeRegion(m).children.at(-1).emit('click');await flush();changeRegion(m).children.at(-1).emit('click');await flush();
 const thirty=mapped();assert.deepEqual([thirty.length,byClass(placed,'neighbourhood').length],[30,1]);
 toggle().emit('click');await flush();assert.deepEqual([mapped(),byClass(placed,'neighbourhood').length,m.changesRequests.length],[thirty,0,1],'the list: the same thirty rows, and no request');
 toggle().emit('click');await flush();assert.deepEqual([mapped(),byClass(placed,'neighbourhood').length],[thirty,1],'the map again: the same');
 // With no row, the region is the last one, under Most played, and says why in one sentence. A date this year reads as
 // day and month, one of another year with its year.
 const year=new Date(clock.now).getFullYear(),thisYear=new Date(year,0,1,12).toISOString(),lastYear=new Date(year-1,11,30,12).toISOString(),retried=['button Try again'];
 for(const [place,answer,say,line,why] of [['#statistics/fontanna',()=>({trackingSince:thisYear,changes:[],next:null}),'p Nothing added or removed since '+sinceDay(thisYear)+'.',true,'no change yet: nothing added or removed since the date the radio began to watch'],
  ['#statistics/bermuda-evening',()=>({trackingSince:lastYear,changes:[],next:null}),'p Nothing added or removed since '+new Date(lastYear).toLocaleDateString('en',{day:'numeric',month:'short',year:'numeric'})+'.',true,'a date of another year says its year'],
  ['#statistics/etage-zero',()=>({trackingSince:null,changes:[],next:null}),'p No changes are recorded yet.',false,'not watched yet: it says so'],
  ['#statistics/closing',()=>null,'p The changes could not load.',false,'a feed that fails: it says so, with Try again, and the rest of the place shows'],['#statistics/ambiance',()=>({trackingSince:'2026-10-07T00:15:13Z',changes:'none'}),'p The changes could not load.',false,'a feed that cannot be read: the same']]){
  e.changes=answer;e.response={...status('First'),...stageStats({scope:place.split('/')[1]}),...stageMusic()};routeTo(e,place);await flush();region=changeRegion(e);
  assert.deepEqual([byClass(content,'region').at(-1)===region,byClass(content,'region').map(r=>textOf(r.children[0])).slice(-3),region.children.map(n=>n.localName+' '+textOf(n)),notesOf(e).some(t=>t.startsWith('Changes are recorded since')),e.elements['music-status'].textContent],
   [true,['Release years','Most played since '+since,'Added and removed'],['h4 Added and removed',say,...say.includes('could not')?retried:[]],line,''],why);
 }
 // Try again loads the place again and asks for its changes afresh: they come, and the region comes first.
 const tried=e.changesRequests.length,numbers=()=>e.requests.filter(r=>r.url.includes('/statistics?scope=ambiance')).length,loaded=numbers();
 e.changes=changePage(changeFeed(3,3,clock.now));region.children.at(-1).emit('click');await flush();region=changeRegion(e);
 assert.deepEqual([e.changesRequests.slice(tried).map(r=>r.url),numbers()-loaded,byClass(content,'regions')[0].children[0]===region,byClass(region,'row-name').map(textOf),e.location.hash],
  [['/api/radio/ambiance/changes?limit=100'],1,true,['Change 3','Change 2','Change 1'],'#statistics/ambiance'],'Try again: the place again, and a fresh request for its changes');
 // Only records that read as a change show, and only a next that names a sequence after a page with changes; a date that
 // is not one is no date.
 const good=changeFeed(2,2,clock.now),bad=[{...good[0],kind:'renamed',title:'Renamed'},{...good[0],title:undefined},{...good[0],title:'No time',observedAt:'x'}];
 e.changes=()=>({trackingSince:'2026-10-07T00:15:13Z',changes:[good[0],...bad,good[1]],next:'abc'});e.response={...status('First'),...stageStats({scope:'palac-feel'}),...stageMusic()};routeTo(e,'#statistics/palac-feel');await flush();
 region=changeRegion(e);
 assert.deepEqual([byClass(region,'row-name').map(n=>n.textContent),region.children.at(-1).localName],[['Change 2','Change 1'],'ol'],'a record of another kind, without a title or without a time does not show, and a next that is no sequence offers no earlier changes');
 e.changes=()=>({trackingSince:'soon',changes:[],next:'5'});e.response={...status('First'),...stageStats({scope:'essentials'}),...stageMusic()};routeTo(e,'#statistics/essentials');await flush();
 assert.deepEqual([changeRegion(e).children.map(textOf),notesOf(e).some(t=>t.startsWith('Changes are recorded since')),e.elements['music-status'].textContent],[['Added and removed','No changes are recorded yet.'],false,''],'an empty page with a next shows no row, and a date that is not one names no date: nothing is recorded yet');
 // Five minutes on, every station is read again.
 e.clock.now+=300001;
 // On All stations, an empty page with a next holds no other station back.
 e.changes=url=>url.includes('/ambiance/')?{trackingSince:'2026-10-07T00:15:13Z',changes:[],next:'5'}:url.includes('/fontanna/')?changePage(good)(url):null;
 e.response={...status('First'),...stageStats({scope:'radio'})};routeTo(e,'#statistics/radio');await flush();region=changeRegion(e);
 assert.deepEqual([byClass(region,'row-name').map(n=>n.textContent),region.children.slice(1).map(n=>n.localName+' '+textOf(n).slice(0,30)),byClass(content,'regions')[0].children[0]===region,e.elements['music-status'].textContent],[['Change 2','Change 1'],['ol '+textOf(region.children[1]).slice(0,30),'p Not all changes could load.','button Try again'],true,''],'the other stations\' changes show first, with no earlier changes to ask for, and say that not all could load');
 // A later page whose times read newer than the rows shown, as after a clock set back, still appends in the feed's order.
 const skewed=changeFeed(12,12,clock.now-7200000).map((c,i)=>i>=10?{...c,observedAt:new Date(clock.now).toISOString()}:c);
 e.changes=changePage(skewed);e.response={...status('First'),...stageStats({scope:'palac-dance'}),...stageMusic()};routeTo(e,'#statistics/palac-dance');await flush();
 region=changeRegion(e);region.children.at(-1).emit('click');await flush();
 assert.deepEqual(byClass(region,'row-name').map(n=>n.textContent),Array.from({length:12},(_,i)=>'Change '+(12-i)),'every change once, newest sequence first');
});

test('All stations with some feeds failing shows the others and says not all changes could load, with Try again, and never says nothing changed',async()=>{
 const e=setup({journey:true});await flush();e.discovery={items:[]};
 const stageOfUrl=url=>url.split('/')[3],feeds={},failing=new Set(['closing']),said=()=>changeRegion(e).children.slice(1).map(n=>n.localName+' '+textOf(n));
 e.changes=url=>failing.has(stageOfUrl(url))?null:changePage(feeds[stageOfUrl(url)]||[])(url);
 const go=async id=>{e.response={...status('First'),...stageStats({scope:id}),...(id==='radio'?{}:stageMusic())};routeTo(e,'#statistics/'+id);await flush();};
 // Eight stations answer with no change, Closing fails.
 await go('radio');
 assert.deepEqual([said(),byClass(e.elements['music-content'],'region').at(-1)===changeRegion(e),notesOf(e).some(t=>t.startsWith('Changes are recorded since'))],[['p Not all changes could load.','button Try again'],true,false],'the region last, saying not all could load: never that nothing is recorded or changed');
 // Try again asks only the station that failed; the others are kept.
 let sent=e.changesRequests.length;changeRegion(e).children.at(-1).emit('click');await flush();
 assert.deepEqual([e.changesRequests.slice(sent).map(r=>stageOfUrl(r.url)),said()],[['closing'],['p Not all changes could load.','button Try again']],'Try again asks Closing again, which fails again');
 e.setLanguage('de');await flush();
 assert.deepEqual(said(),['p Nicht alle Änderungen konnten geladen werden.','button Erneut versuchen'],'and in German');
 e.setLanguage('en');await flush();
 // Closing answers: every station answered, none changed.
 failing.clear();sent=e.changesRequests.length;changeRegion(e).children.at(-1).emit('click');await flush();
 assert.deepEqual([e.changesRequests.slice(sent).map(r=>stageOfUrl(r.url)),said(),notesOf(e).some(t=>t.startsWith('Changes are recorded since'))],[['closing'],['p Nothing added or removed since '+sinceDay('2026-10-07T00:15:13Z')+'.'],true],'only when all nine answered does it say nothing changed');
 // Fontanna has changes and Closing fails: the rows first, then the sentence, with Try again.
 feeds.fontanna=changeFeed(3,3,clock.now);failing.add('closing');e.clock.now+=300001;await go('fontanna');await go('radio');
 const region=changeRegion(e);
 assert.deepEqual([byClass(e.elements['music-content'],'regions')[0].children[0]===region,byClass(region,'row-name').map(textOf),said().slice(1)],[true,['Change 3','Change 2','Change 1'],['p Not all changes could load.','button Try again']],'the rows of the others first, then not all could load');
 // Under the rows, Try again loads the place again from its top: its numbers, and Closing asked afresh; the stations that
 // answered are kept.
 feeds.fontanna=changeFeed(23,23,clock.now);e.clock.now+=300001;await go('fontanna');await go('radio');
 changeRegion(e).children.find(n=>n.textContent==='Show earlier changes').emit('click');await flush();
 const numbers=()=>e.requests.filter(r=>r.url.includes('/statistics?scope=radio')).length,loaded=numbers();
 assert.deepEqual([byClass(changeRegion(e),'row').length,said().slice(1)],[20,['button Show earlier changes','p Not all changes could load.','button Try again']]);
 sent=e.changesRequests.length;changeRegion(e).children.at(-1).emit('click');await flush();
 assert.deepEqual([e.changesRequests.slice(sent).map(r=>stageOfUrl(r.url)),numbers()-loaded,byClass(changeRegion(e),'row').length,said().slice(1)],
  [['closing'],1,10,['button Show earlier changes','p Not all changes could load.','button Try again']],'Try again under the rows: the place again with its first ten rows, and one fresh request, for Closing');
 // Every station fails: the changes could not load.
 for(const s of e.window.Pavoia.stations)failing.add(s.id);e.clock.now+=300001;await go('fontanna');await go('radio');
 assert.deepEqual([said(),byClass(e.elements['music-content'],'region').at(-1)===changeRegion(e),e.elements['music-status'].textContent],[['p The changes could not load.','button Try again'],true,''],'all nine failed: the changes could not load, and the place shows');
 // A Closing read that never answers: the place shows 2 s past its numbers without it, and Try again stops that read and
 // asks Closing afresh, rather than wait on the same request.
 failing.clear();e.clock.now+=300001;
 e.changes=(url,signal)=>stageOfUrl(url)==='closing'?new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')))):changePage(feeds[stageOfUrl(url)]||[])(url);
 await go('fontanna');await go('radio');e.fire(2000);await flush();
 const slow=e.changesRequests.filter(r=>stageOfUrl(r.url)==='closing').at(-1);
 assert.deepEqual([slow.signal.aborted,byClass(changeRegion(e),'row').length,said().slice(-2)],[false,10,['p Not all changes could load.','button Try again']],'late: the rows of the others, and not all could load; the read goes on');
 e.changes=url=>changePage(feeds[stageOfUrl(url)]||[])(url);sent=e.changesRequests.length;changeRegion(e).children.at(-1).emit('click');await flush();
 assert.deepEqual([slow.signal.aborted,e.changesRequests.slice(sent).map(r=>stageOfUrl(r.url)),said().slice(1)],[true,['closing'],['button Show earlier changes']],'Try again: the read still out stops, Closing is asked again, and every station answered');
});

test('a place missing a station has one Try again, described by its sentence, also when an earlier page fails',async()=>{
 const e=setup({journey:true});await flush();e.discovery={items:[]};
 const stageOfUrl=url=>url.split('/')[3],records=changeFeed(123,9,clock.now);let pageFails=false;
 e.changes=url=>stageOfUrl(url)==='closing'?null:stageOfUrl(url)!=='fontanna'?changePage([])(url):pageFails&&url.includes('before=')?null:changePage(records)(url);
 e.response={...status('First'),...stageStats({scope:'radio'})};routeTo(e,'#statistics/radio');await flush();
 const region=changeRegion(e),more=region.children.find(n=>n.textContent==='Show earlier changes'),said=()=>region.children.slice(2).map(n=>n.localName+' '+textOf(n)),
  retries=()=>byClass(region,'text-button').filter(b=>b.textContent==='Try again');
 for(let n=20;n<=100;n+=10){more.emit('click');await flush();}
 pageFails=true;more.emit('click');await flush();
 const note=region.children.find(n=>n.localName==='p');
 assert.deepEqual([byClass(region,'row').length,e.changesRequests.at(-1).url,said(),retries().length,retries()[0].getAttribute('aria-describedby'),note.id],
  [100,'/api/radio/fontanna/changes?limit=100&before=24',['button Show earlier changes','p Not all changes could load.','button Try again'],1,'r-changes-note','r-changes-note'],
  'a page that fails leaves Show earlier changes as it is: the sentence says not all could load, and its one Try again is described by it');
 pageFails=false;more.emit('click');await flush();
 assert.deepEqual([byClass(region,'row').length,e.changesRequests.at(-1).url,more.textContent],[110,'/api/radio/fontanna/changes?limit=100&before=24','Show earlier changes'],'the button asks for the same page again');
});

test('a station whose changes fail shows its numbers and says the changes could not load',async()=>{
 const e=setup({journey:true});await flush();e.discovery={items:[]};e.changes=()=>null;
 const content=await stagePlace(e,'#statistics/bermuda-day'),heading=byClass(content,'entity-heading')[0];
 assert.deepEqual([e.elements['music-status'].textContent,textOf(heading.children[1].children[1]),byClass(content,'region').map(r=>textOf(r.children[0])).slice(-3),changeRegion(e).children.map(n=>n.localName+' '+textOf(n))],
  ['','Under the Sun',['Release years','Most played since '+sinceDay('2026-10-06T23:27:25Z'),'Added and removed'],['h4 Added and removed','p The changes could not load.','button Try again']],'renderStage() takes {feeds:[],missing:1}: the numbers, Release years, and the sentence at the end');
 assert.deepEqual([changeRegion(e).children[2].getAttribute('aria-describedby'),changeRegion(e).children[1].id],['r-changes-note','r-changes-note'],'the sentence describes its Try again');
 // Changes that are late: the place shows after 2 s, and Try again drops the read still out and asks a fresh one.
 const f=setup({journey:true});await flush();f.discovery={items:[]};
 f.changes=(url,signal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))));
 await stagePlace(f,'#statistics/bermuda-day');f.fire(2000);await flush();
 const slow=f.changesRequests.at(-1);
 assert.deepEqual([slow.signal.aborted,textOf(changeRegion(f).children[1])],[false,'The changes could not load.'],'late: the place says they could not load, and the read goes on');
 f.changes=changePage(changeFeed(4,4,clock.now));changeRegion(f).children.at(-1).emit('click');await flush();
 assert.deepEqual([slow.signal.aborted,f.changesRequests.length,f.changesRequests.at(-1).url,byClass(f.elements['music-content'],'regions')[0].children[0]===changeRegion(f),byClass(changeRegion(f),'row').length],
  [true,2,'/api/radio/bermuda-day/changes?limit=100',true,4],'Try again: the read still out stops, a new one comes, and its rows come first');
});

test('Back to a station place with no row, or with a station missing, brings back its sentence and Try again, with no request',async()=>{
 const e=setup({journey:true});await flush();e.discovery=url=>url.includes('/search?')?{items:[]}:entity(url.split('/').pop(),'track');
 const content=e.elements['music-content'],stageOfUrl=url=>url.split('/')[3],failing=new Set(),feeds={};
 e.changes=url=>failing.has(stageOfUrl(url))?null:changePage(feeds[stageOfUrl(url)]||[])(url);
 const said=()=>changeRegion(e).children.slice(1).map(n=>n.localName+' '+textOf(n)),link=href=>content.querySelectorAll('a').find(a=>a.getAttribute('href')===href);
 const away=async(row,hash)=>{const shown=[...content.children],before=said(),asked=placeAsks(e);row.focus();follow(e,row);await flush();assert.equal(e.location.hash,hash);e.history.back();await flush();
  return [sameRows(content.children,shown),said(),e.document.activeElement===row,placeAsks(e)-asked,JSON.stringify(said())===JSON.stringify(before)];};
 // A station whose changes failed, left for a track of Most played.
 failing.add('bermuda-day');await stagePlace(e,'#statistics/bermuda-day');
 assert.deepEqual(await away(link('#explore/plex_207593'),'#explore/plex_207593'),[true,['p The changes could not load.','button Try again'],true,0,true],'failed: the same place, its sentence and Try again, focus on the row opened, no request');
 failing.clear();const sent=e.changesRequests.length;changeRegion(e).children.at(-1).emit('click');await flush();
 assert.deepEqual([e.changesRequests.length-sent,said()],[1,['p Nothing added or removed since '+sinceDay('2026-10-07T00:15:13Z')+'.']],'Try again still asks, after Back');
 // That place, with no change: the same.
 assert.deepEqual(await away(link('#explore/plex_207593'),'#explore/plex_207593'),[true,['p Nothing added or removed since '+sinceDay('2026-10-07T00:15:13Z')+'.'],true,0,true],'empty: the same place and its sentence, no request');
 // All stations with rows and Closing missing: the rows, then the sentence and Try again.
 feeds.fontanna=changeFeed(3,3,clock.now);failing.add('closing');e.clock.now+=300001;e.response={...status('First'),...stageStats({scope:'radio'})};routeTo(e,'#statistics/radio');await flush();
 const row=changeRows(e)[1];
 assert.deepEqual(await away(row,'#explore/plex_9002'),[true,['ol '+textOf(changeRegion(e).children[1]),'p Not all changes could load.','button Try again'],true,0,true],'partial: the same rows, the sentence and Try again, focus on the row opened, no request');
});

test('All stations merges the nine feeds by time, and pages only the stations that have more',async()=>{
 const e=setup({journey:true});await flush();e.discovery={items:[]};
 const t1=clock.now-3600000,t2=t1-86400000,t3=t2-86400000,rec=(stage,seq,t,kind='added')=>({sequence:String(seq),kind,id:String(seq),title:stage+' '+seq,artist:'Artist',album:'',observedAt:new Date(t).toISOString()});
 const down=(from,to)=>Array.from({length:from-to+1},(_,i)=>from-i);
 // Essentials, last on screen, has more than a page of 100; Under the Sun, first, ties with it a day ago and has an older
 // change; Fontanna ties with it an hour ago, after a newer change of its own.
 let feeds={essentials:[...down(105,101).map(s=>rec('essentials',s,t1)),...down(100,1).map(s=>rec('essentials',s,t2))],'bermuda-day':[rec('bermuda-day',3,t2),rec('bermuda-day',2,t2,'removed'),rec('bermuda-day',1,t3)],fontanna:[rec('fontanna',2,t1+60000),rec('fontanna',1,t1)]};
 let failing='';const stageOfUrl=url=>url.split('/')[3];
 e.changes=url=>stageOfUrl(url)===failing?null:changePage(feeds[stageOfUrl(url)]||[],stageOfUrl(url)==='fontanna'?'2026-10-15T04:48:36Z':'2026-10-07T00:15:13Z')(url);
 e.response={...status('First'),...stageStats({scope:'radio'})};routeTo(e,'#statistics/radio');await flush();
 let region=changeRegion(e);const titles=()=>byClass(region,'row').map(a=>byClass(a,'row-name')[0].textContent),press=()=>region.children.at(-1).emit('click');
 const order=[...e.window.Pavoia.stations].map(s=>s.id),first=['fontanna 2','fontanna 1',...down(105,101).map(s=>'essentials '+s),'bermuda-day 3','bermuda-day 2','essentials 100'];
 assert.deepEqual([e.changesRequests.map(r=>r.url),titles(),byClass(byClass(region,'row')[0],'row-line')[0].textContent,byClass(byClass(region,'row')[8],'row-fact')[0].textContent],
  [order.map(id=>'/api/radio/'+id+'/changes?limit=100'),first,'Fontanna · Artist','removed'],'one first page of 100 per station, its station first on each row; newest first, ties in the order on screen');
 assert.equal(cls(region),'region changes','the region reads across the columns before the last one, as Release years does');
 assert.ok(notesOf(e).includes('Changes are recorded since '+sinceDay('2026-10-15T04:48:36Z')+'.'),'since the last station began to be watched');
 press();await flush();
 assert.deepEqual([e.changesRequests.length,titles(),region.children.at(-1).localName],[9,[...first,...down(99,90).map(s=>'essentials '+s)],'button'],'ten more held in memory: no request');
 for(let i=0;i<8;i++){press();await flush();}
 assert.deepEqual([e.changesRequests.length,titles().length,titles().at(-1)],[9,100,'essentials 10'],'no change older than the oldest one loaded of a station with more');
 const shown=byClass(region,'row'),more=region.children.at(-1);more.focus();more.emit('click');await flush();
 assert.deepEqual([e.changesRequests.slice(9).map(r=>r.url),titles().slice(100),sameRows(byClass(region,'row').slice(0,100),shown),region.children.includes(more),e.document.activeElement===byClass(region,'row')[100]],
  [['/api/radio/essentials/changes?limit=100&before=6'],[...down(9,1).map(s=>'essentials '+s),'bermuda-day 1'],true,false,true],'only the station with more asks again; its changes append, then the older one it held back');
 // Five minutes on, every station is read again.
 e.clock.now+=300001;failing='closing';follow(e,stageLink(e,'fontanna'));await flush();follow(e,stageLink(e,'radio'));await flush();region=changeRegion(e);
 assert.deepEqual([titles(),notesOf(e).some(t=>t.startsWith('Changes are recorded since'))],[first,false],'a station that fails leaves the others merged, and no date');
 // Under the Sun, first on screen, has more changes of the sync Essentials ties with: Essentials waits until they are in.
 e.clock.now+=300001;failing='';feeds={'bermuda-day':down(112,1).map(s=>rec('bermuda-day',s,t2)),essentials:[rec('essentials',2,t2),rec('essentials',1,t2)]};
 follow(e,stageLink(e,'fontanna'));await flush();follow(e,stageLink(e,'radio'));await flush();region=changeRegion(e);
 const day=down(112,1).map(s=>'bermuda-day '+s);
 assert.deepEqual(titles(),day.slice(0,10),'the newest ten');
 for(let i=0;i<9;i++){press();await flush();}
 assert.deepEqual([titles(),e.changesRequests.at(-1).url],[day.slice(0,100),'/api/radio/essentials/changes?limit=100'],'a tie with a station earlier on screen that has more waits for it');
 press();await flush();press();await flush();
 assert.deepEqual([titles(),e.changesRequests.at(-1).url],[[...day,'essentials 2','essentials 1'],'/api/radio/bermuda-day/changes?limit=100&before=13'],'then follows it');
});

// The Index: every artist and label of the playlists, from the names documents, A to Z or most tracks first.
const pic=c=>'/api/discovery/media/'+c.repeat(40);
const artistNames=()=>({kind:'artists',updatedAt:'2026-10-20T00:00:00Z',total:20,items:[
 {name:'Maceo Plex',id:'art_01a5cef5b30e',image:pic('a'),count:13,stages:{'palac-dance':8,'bermuda-day':3,'bermuda-evening':2}},
 {name:'Âme',count:4,stages:{'bermuda-evening':3,'palac-dance':1}},
 {name:'Øostil',count:1,stages:{fontanna:1}},
 {name:'&ME',id:'art_000000000a01',count:2,stages:{'palac-feel':2}},
 {name:'8Kays',count:1,stages:{essentials:1}},
 {name:'Kiasmos',count:5,stages:{'bermuda-day':5}},
 {name:'Frivolous',count:42,stages:{fontanna:17,'bermuda-day':9,essentials:7,'bermuda-evening':5,'palac-dance':2,ambiance:1,closing:1}},
 {name:'Act 10',count:120,stages:{closing:120}},
 {name:'Act 9',count:2,stages:{fontanna:1,'bermuda-day':1}},
 {name:'Amelie Lens',count:23,stages:{'palac-dance':23}},
 {name:'Various Artists',count:50,stages:{fontanna:50}},
 {name:'Bad Id',id:'art_nothex',count:3,stages:{'bermuda-day':3}},
 {name:'Wrong Kind',id:'lab_000000000a02',count:6,stages:{'bermuda-day':6}},
 {name:'Bad Picture',image:'https://elsewhere.example/x.jpg',count:2,stages:{'palac-feel':2}},
 {name:'Somewhere',count:2,stages:{nowhere:2,radio:1,'etage-zero':2,'palac-feel':0,ambiance:1.5}},
 {name:'Nobody',count:0,stages:{fontanna:1}},{name:'Half',count:1.5,stages:{}},{name:'  ',count:3,stages:{}},{name:7,count:3},null,
]});
const labelNames=()=>({kind:'labels',updatedAt:'2026-10-20T00:00:00Z',total:3,items:[
 {name:'Mad Decent',id:'lab_000000000b01',count:12,stages:{'palac-dance':12}},
 {name:'Diynamic Music',count:57,stages:{'bermuda-day':57}},
 {name:'Kompakt',id:'art_000000000b02',count:1,stages:{'bermuda-day':1}},
]});
const indexed=async(over={})=>{const e=setup({journey:true,...over});await flush();e.discovery=url=>entity(url.split('/').pop());e.names={artists:artistNames(),labels:labelNames()};return e;};
const sectionsOf=e=>byClass(e.elements['music-content'],'index-section');
const indexRowsOf=e=>byClass(e.elements['music-content'],'row');
const rowOf=(e,name)=>indexRowsOf(e).find(a=>byClass(a,'row-name')[0].textContent===name);
const marksOf=e=>sectionsOf(e).map(s=>s.dataset.mark);
const namesIn=section=>byClass(section,'row-name').map(n=>n.textContent);
const lineOf=a=>[byClass(a,'row-line')[0]?.textContent,byClass(a,'row-fact').map(textOf)[0]??null];
const stageOf=(e,id)=>e.elements['stage-row'].children.find(a=>a.dataset.stage===id);
const countsOf=e=>Object.fromEntries(e.elements['stage-row'].children.map(a=>[a.dataset.stage,a.children[1].textContent]));
// A typed address: a browser fires hashchange as a task of its own, after the microtasks of popstate.
const browse=async(e,hash)=>{e.location.hash=hash;e.window.emit('popstate');await flush();e.window.emit('hashchange');await flush();};
const typeIndex=(e,text)=>{const field=e.elements['index-query'];field.value=text;field.emit('input');e.fire(120);return field;};
// A key in the field goes to the field first, then to the document, as a browser sends it.
const keyIn=(e,key)=>{const event={key,code:key,repeat:false,isComposing:false,ctrlKey:false,metaKey:false,altKey:false,target:control('input',{type:'search'}),defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};e.elements['index-query'].emit('keydown',event);e.document.emit('keydown',event);return event;};

test('the Index has an address: a side, a stage, an order and a filter, and the old lists of names lead to it, in one entry each',async()=>{
 const e=await indexed();
 routeTo(e,'#index');await flush();const kept=e.entries().length,tab=e.elements['index-tab'];
 assert.deepEqual([e.location.hash,kept,e.elements['music-view'].dataset.view,e.elements['index-head'].hidden,tab.attrs['aria-current'],tab.getAttribute('href')],['#index/artists',2,'index',false,'page','#index/artists'],'bare #index is the Artists side, on All stages, in one entry above the page');
 for(const [typed,place] of [['#index/labels','#index/labels'],['#index/tracks','#index/artists'],['#index/artists/radio','#index/artists'],['#index/artists/bus','#index/artists'],['#index/artists/library','#index/artists'],
  ['#index/labels/fontanna?by=tracks&q=ame&x=1','#index/labels/fontanna?by=tracks&q=ame'],['#index/artists?by=name','#index/artists'],['#index/artists?by=size&q=','#index/artists'],['#index/artists?q=a%20b','#index/artists?q=a+b'],
  ['#index/artists?q='+'a'.repeat(250),'#index/artists?q='+'a'.repeat(200)],
  ['#index/artists?at=K','#index/artists?at=K'],['#index/artists?at=%23','#index/artists?at=%23'],['#index/artists?at=k','#index/artists'],['#index/labels/fontanna?at=K&by=tracks&q=ame','#index/labels/fontanna?by=tracks&q=ame'],
  ['#index/artists?by=tracks&at=100%2B','#index/artists?by=tracks&at=100%2B'],['#index/artists?by=tracks&at=100','#index/artists?by=tracks'],['#index/artists/fontanna?q=fri&at=F','#index/artists/fontanna?q=fri&at=F'],
  ['#statistics/bermuda-day/artists','#index/artists/bermuda-day?by=tracks'],['#statistics/radio/labels','#index/labels?by=tracks'],['#statistics/library/artists','#index/artists?by=tracks'],['#statistics/bus/labels','#index/labels?by=tracks']]){
  // A link to the place shown adds nothing; any other adds one entry, at the place's one address.
  const shown=e.location.hash,before=e.entries().length;routeTo(e,typed);await flush();assert.deepEqual([e.location.hash,tab.getAttribute('href'),e.entries().length],[place,place,before+(place===shown?0:1)],typed);
 }
 assert.equal(e.elements['index-query'].value,'','the field shows the filter of the address');
 routeTo(e,'#index/artists/fontanna?q=fri');await flush();
 assert.deepEqual([e.elements['index-query'].value,e.elements['stage-row'].children.map(a=>[textOf(a.children[0]),a.getAttribute('href'),a.attrs['aria-current']??null]).slice(0,2),textOf(stageOf(e,'fontanna').children[0]),stageOf(e,'fontanna').attrs['aria-current']],
  ['fri',[['All stations','#index/artists?q=fri',null],['Under the Sun','#index/artists/bermuda-day?q=fri',null]],'Fontanna','page'],'All stations first; each station keeps the side, the order and the filter');
 assert.deepEqual([...e.elements['index-sides'].children,...e.elements['index-order'].children].map(a=>[a.getAttribute('href'),a.attrs['aria-current']??null]),
  [['#index/artists/fontanna','page'],['#index/labels/fontanna',null],['#index/artists/fontanna?q=fri','true'],['#index/artists/fontanna?by=tracks&q=fri',null]],'the sides drop the filter, the orders keep it');
 const before=e.entries().length;follow(e,e.elements['index-order'].children[1]);await flush();follow(e,stageOf(e,'radio'));await flush();follow(e,e.elements['index-sides'].children[1]);await flush();
 assert.deepEqual([e.location.hash,e.entries().length],['#index/labels?by=tracks',before+3],'sides, orders and stages add one entry each');
 e.response={...status('First'),...stageStats({scope:'fontanna'}),...stageMusic()};routeTo(e,'#statistics/fontanna');await flush();
 assert.deepEqual([tab.getAttribute('href'),e.document.querySelectorAll('.explorer-nav a')[2].getAttribute('href'),e.elements['index-head'].hidden,e.elements['music-view'].dataset.view],['#index/labels?by=tracks','#statistics/fontanna',true,'statistics'],'the tab keeps its last place; the head shows only in the Index');
 e.history.go(-1);await flush();assert.deepEqual([e.elements.explorer.open,e.location.hash],[true,'#index/labels?by=tracks'],'Back goes back one move');
 e.elements['explorer-close'].emit('click');await flush();assert.deepEqual([e.elements.explorer.open,e.location.hash,e.position()],[false,'',0],'and ✕ closes the explorer in one step');
});

test('a names document keeps only valid names, ids, pictures and stages, and files each name under its folded first letter, # last',async()=>{
 const e=await indexed();routeTo(e,'#index/artists');await flush();
 assert.deepEqual([e.namesRequests.map(r=>r.url),marksOf(e)],[['/api/library/names?kind=artists'],['A','B','F','K','M','O','S','W','#']]);
 assert.deepEqual(sectionsOf(e).map(namesIn),[['Act 9','Act 10','Âme','Amelie Lens'],['Bad Id','Bad Picture'],['Frivolous'],['Kiasmos'],['Maceo Plex'],['Øostil'],['Somewhere'],['Wrong Kind'],['&ME','8Kays']],
  'Âme under A and Øostil under O, numbers read as numbers, symbols and digits under # at the end; Various Artists, empty names and counts that are not whole tracks are left out');
 const href=name=>rowOf(e,name).getAttribute('href');
 assert.deepEqual(['Maceo Plex','&ME','Âme','Bad Id','Wrong Kind'].map(href),['#explore/art_01a5cef5b30e','#explore/art_000000000a01','#explore/artist/%C3%82me','#explore/artist/Bad%20Id','#explore/artist/Wrong%20Kind'],'an artist id opens its record; a bad id or a label\'s id falls back to the name');
 assert.deepEqual([rowOf(e,'Somewhere').dataset.stages,lineOf(rowOf(e,'Somewhere'))[0],rowOf(e,'Frivolous').dataset.stages],['etage-zero','Etage 0','fontanna bermuda-day essentials bermuda-evening palac-dance ambiance closing'],'unknown stages and counts that are not whole tracks go');
 const [section]=sectionsOf(e),heading=section.children[0];
 assert.deepEqual([section.localName,section.attrs['aria-labelledby'],heading.localName,heading.id,heading.attrs['aria-label'],textOf(heading),cls(section.children[1])],['section','m-A','h3','m-A','A, 4 artists','A 4','index-rows'],'each section is labelled by its mark, which says how many it holds');
 assert.deepEqual([sectionsOf(e).at(-1).children[0].attrs['aria-label'],sectionsOf(e)[2].children[0].attrs['aria-label']],['Numbers and symbols, 2 artists','F, 1 artist']);
 follow(e,e.elements['index-sides'].children[1]);await flush();
 assert.deepEqual([marksOf(e),indexRowsOf(e).map(a=>[a.getAttribute('href'),byClass(a,'picture')[0].dataset.type]),sectionsOf(e)[0].children[0].attrs['aria-label']],
  [['D','K','M'],[['#explore/label/Diynamic%20Music','label'],['#explore/label/Kompakt','label'],['#explore/lab_000000000b01','label']],'D, 1 label'],'labels: square pictures, a label id only from lab_');
 e.setLanguage('de');await flush();
 assert.deepEqual([sectionsOf(e)[0].children[0].attrs['aria-label'],e.elements['index-query'].attrs['aria-label'],e.elements['index-sides'].attrs['aria-label'],e.elements['index-order'].attrs['aria-label']],['D, 1 Label','Labels filtern','Künstler oder Labels','Reihenfolge']);
});

test('a row shows its picture once it loads, or no box in A to Z, and its initial is a letter or a digit',async()=>{
 const e=await indexed();routeTo(e,'#index/artists');await flush();
 const img=byClass(rowOf(e,'Maceo Plex'),'picture')[0].children[0];
 assert.deepEqual([img.localName,img.src,img.loading,img.decoding,img.dataset.wait,img.hidden??false,rowOf(e,'Maceo Plex').attrs['data-bare']],['img',pic('a'),'lazy','async','',false,undefined],'a lazy picture is never hidden, since Chrome never loads a lazy image that is not displayed: it waits unseen over its initial');
 img.emit('load');assert.equal(img.dataset.wait,undefined,'once loaded it covers its initial');
 const other=byClass(rowOf(e,'Frivolous'),'picture')[0];assert.deepEqual([other.children.length,rowOf(e,'Frivolous').attrs['data-bare']],[0,''],'no picture: no image, and the row is bare');
 assert.deepEqual([byClass(rowOf(e,'Bad Picture'),'picture')[0].children.length,rowOf(e,'Bad Picture').attrs['data-bare']],[0,''],'a picture from elsewhere is none');
 img.emit('error');assert.deepEqual([byClass(rowOf(e,'Maceo Plex'),'picture')[0].children.length,rowOf(e,'Maceo Plex').attrs['data-bare']],[0,''],'a picture that fails leaves the row bare');
 assert.deepEqual(['&ME','8Kays','Øostil','Âme'].map(n=>byClass(rowOf(e,n),'picture')[0].dataset.initial),['M','8','Ø','Â'],'the first letter or digit, else the first character');
 const rules=cssRules();
 assert.match(rules.get('#music-view[data-by=name] .row[data-bare] .picture'),/visibility:hidden/,'in A to Z a bare row shows no box; the margin letter says its initial');
 assert.match(rules.get('.picture img[data-wait]'),/visibility:hidden/);
 assert.equal(e.elements['music-view'].dataset.by,'name');follow(e,e.elements['index-order'].children[1]);await flush();
 assert.equal(e.elements['music-view'].dataset.by,'tracks','in Most tracks a bare row shows its initial');
});

test('each row says where a name plays and how often: the first stage and how many more, Also on or Only here on a stage, and no count of one',async()=>{
 const e=await indexed();routeTo(e,'#index/artists');await flush();
 assert.deepEqual(['Maceo Plex','Frivolous','Act 9','Øostil'].map(n=>lineOf(rowOf(e,n))),[['Night in Motion and 2 more','13 tracks'],['Fontanna and 6 more','42 tracks'],['Under the Sun and 1 more','2 tracks'],['Fontanna',null]],
  'most tracks first, the stage bar\'s order on ties; one track says no count');
 const maceo=rowOf(e,'Maceo Plex'),fact=byClass(maceo,'row-fact')[0];
 assert.deepEqual([fact.textContent,cls(fact.children[0]),fact.children[0].textContent],['13','fact-word',' tracks'],'the number and the word apart, so a phone can show the number only');
 assert.match(cssRules('(max-width:760px)').get('.fact-word'),/position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset\(50%\)/,'a screen reader still hears the word');
 routeTo(e,'#index/artists/bermuda-day');await flush();
 assert.deepEqual([rowOf(e,'Maceo Plex')===maceo,...['Maceo Plex','Kiasmos','Frivolous'].map(n=>lineOf(rowOf(e,n)))],[true,['Also on Night in Motion and 1 more','3 tracks'],['Only here','5 tracks'],['Also on Fontanna and 5 more','9 tracks']],'the same row, its line and count for the stage');
 assert.deepEqual(namesIn(e.elements['music-content']),['Act 9','Bad Id','Frivolous','Kiasmos','Maceo Plex','Wrong Kind'],'a stage lists only the names that play on it');
 e.setLanguage('de');await flush();
 assert.deepEqual(['Maceo Plex','Kiasmos'].map(n=>lineOf(rowOf(e,n))),[['Auch auf Night in Motion und 1 weitere','3 Tracks'],['Nur hier','5 Tracks']]);
 const journey=web('journey.js'),strings=journey.slice(journey.indexOf('const copy'),journey.indexOf('const word'));
 for(const key of ['indexTab','sides','order','namesLoading','namesError','alsoOnStages','onlyHere','lookAll','markArtists','markArtist1','markLabels','markLabel1','symbols','band','band1'])assert.equal(strings.match(new RegExp('(?<![\\w$])'+key+':','g'))?.length,2,key+' in English and German');
 for(const gone of ['listArtists','listLabels','byCount','byName','showMore'])assert.doesNotMatch(strings,new RegExp('(?<![\\w$])'+gone+':'),gone+' is gone');
 for(const gone of ['renderList','placeStats','list-controls','list-rows','list-more','list-status'])assert.ok(!journey.includes(gone)&&!web('style.css').includes(gone),gone+' is gone');
 assert.ok(!cssRules().has('.eyebrow a'));
});

test('Most tracks groups the names in bands of track counts, most first, ties A to Z, and the bands say so',async()=>{
 const e=await indexed();routeTo(e,'#index/artists?by=tracks');await flush();
 assert.deepEqual([marksOf(e),sectionsOf(e).map(namesIn)],[['100+','20+','10+','5+','2+','1'],[['Act 10'],['Frivolous','Amelie Lens'],['Maceo Plex'],['Wrong Kind','Kiasmos'],['Âme','Bad Id','Act 9','Bad Picture','Somewhere','&ME'],['Øostil','8Kays']]],'empty bands are left out');
 assert.deepEqual([sectionsOf(e)[0].children[0].attrs['aria-label'],sectionsOf(e).at(-1).children[0].attrs['aria-label'],textOf(sectionsOf(e)[1].children[0])],['100 tracks or more, 1 artist','One track, 2 artists','20+ 2']);
 routeTo(e,'#index/artists/palac-dance?by=tracks');await flush();
 assert.deepEqual([marksOf(e),sectionsOf(e).map(namesIn)],[['20+','5+','2+','1'],[['Amelie Lens'],['Maceo Plex'],['Frivolous'],['Âme']]],'on a stage, the counts of that stage');
 e.setLanguage('de');await flush();assert.equal(sectionsOf(e)[0].children[0].attrs['aria-label'],'20 Tracks oder mehr, 1 Künstler');
});

test('the filter ignores case and accents, writes the address in place, and the stage bar and the note follow it',async()=>{
 const e=await indexed();routeTo(e,'#index/artists');await flush();const kept=e.entries().length,note=e.elements['index-note'];
 assert.deepEqual([countsOf(e),note.textContent],[{radio:'14','bermuda-day':'6','bermuda-evening':'3','palac-dance':'4','palac-feel':'2','etage-zero':'1',fontanna:'3',ambiance:'1',closing:'2',essentials:'2'},''],'each stage counts its names; no note without a filter');
 const field=e.elements['index-query'];field.value='AME';field.emit('input');
 assert.deepEqual([namesIn(e.elements['music-content']).length,e.location.hash],[14,'#index/artists'],'the list waits for a pause in typing');
 e.fire(120);
 assert.deepEqual([namesIn(e.elements['music-content']),note.textContent,e.location.hash,e.entries().length,e.elements['index-tab'].getAttribute('href'),stageOf(e,'fontanna').getAttribute('href'),e.elements['index-order'].children[1].getAttribute('href')],
  [['Âme','Amelie Lens'],'2 of 14','#index/artists?q=AME',kept,'#index/artists?q=AME','#index/artists/fontanna?q=AME','#index/artists?by=tracks&q=AME'],'then draws, writes the address in the same entry and keeps the filter in every link');
 assert.deepEqual(countsOf(e),{radio:'2','bermuda-day':'','bermuda-evening':'1','palac-dance':'2','palac-feel':'','etage-zero':'',fontanna:'',ambiance:'',closing:'',essentials:''},'the counts follow the filter, and a count of 0 is left empty');
 assert.equal(e.elements['index-said'].textContent,'','the count is said once typing pauses');e.fire(300);assert.equal(e.elements['index-said'].textContent,'2 of 14');
 typeIndex(e,'oostil');assert.deepEqual(namesIn(e.elements['music-content']),['Øostil'],'Ø reads as O');
 typeIndex(e,'zz');assert.deepEqual([namesIn(e.elements['music-content']),note.textContent,note.children.length],[[],'No artist matches “zz”.',0]);
 // Typed with the list scrolled past its top, the list comes back under the head, so it starts under the field.
 const explorer=e.elements.explorer,rects={'music-content':-2000,'index-head':-2200,'music-filters':72};explorer.scrollTop=3000;
 for(const [id,top] of Object.entries(rects))e.elements[id].getBoundingClientRect=()=>({top,bottom:top+61});
 typeIndex(e,'zzz');assert.equal(explorer.scrollTop,3000-2200-133,'the head\'s top under the stage bar');
 e.elements['music-content'].getBoundingClientRect=()=>({top:300,bottom:361});typeIndex(e,'zz');assert.equal(explorer.scrollTop,3000-2200-133,'a list whose top shows stays where it is');
 for(const id of Object.keys(rects))delete e.elements[id].getBoundingClientRect;
 routeTo(e,'#index/artists/ambiance?q=ame');await flush();
 const look=note.children.find(n=>n.localName==='a');
 assert.deepEqual([textOf(note),look.getAttribute('href'),e.entries().length],['No artist matches “ame”. Look on all stations (2)','#index/artists?q=ame',kept+1],'a station with no match offers every station, with how many match there');
 assert.match(cssRules().get('.index-note a'),/text-decoration:underline; text-decoration-color:var\(--muted\); text-underline-offset:3px/,'a link in a sentence');
 routeTo(e,'#index/artists/bermuda-day?q=ame');await flush();assert.equal(textOf(note),'No artist matches “ame”. Look on all stations (2)');
 routeTo(e,'#index/artists/palac-dance?q=ame');await flush();assert.deepEqual([textOf(note),note.children.length],['2 of 4',0],'the total is the names on this stage');
 e.setLanguage('de');await flush();typeIndex(e,'zz');assert.deepEqual([textOf(note),note.children.length],['Kein Künstler passt zu „zz“.',0],'no other stage holds one: no link');
 typeIndex(e,'a');assert.equal(textOf(note),'3 von 4');
});

test('in the field, Escape empties it first and Enter opens the first name shown',async()=>{
 const e=await indexed();routeTo(e,'#index/artists');await flush();const field=e.elements['index-query'];
 typeIndex(e,'kia');
 let event=keyIn(e,'Escape');
 assert.deepEqual([event.defaultPrevented,field.value,namesIn(e.elements['music-content']).length,e.location.hash,e.elements.explorer.open],[true,'',14,'#index/artists',true],'the text goes and the list draws at once; the explorer stays');
 event=keyIn(e,'Escape');assert.deepEqual([e.elements.explorer.open],[false],'a second Escape closes it, as everywhere');
 routeTo(e,'#index/artists');await flush();field.value='mace';field.emit('input');
 e.elements['index-find'].emit('submit',{preventDefault(){}});await flush();
 assert.deepEqual([e.location.hash,e.document.activeElement.localName],['#explore/art_01a5cef5b30e','h3'],'Enter opens the first name for the text typed so far');
 routeTo(e,e.elements['index-tab'].getAttribute('href'));await flush();
 assert.equal(e.document.activeElement,rowOf(e,'Maceo Plex'),'and comes back to it as to a row clicked');
 assert.equal(web('index.html').match(/<form id="index-find" class="index-find" role="search"><input id="index-query" type="search" maxlength="200" autocomplete="off" enterkeyhint="go" spellcheck="false"><\/form>/)?.length,1);
});

test('focus stays on a side, an order or a stage through its redraw, a row\'s goes to the same name or the field, and a pointer starts in the field',async()=>{
 for(const fine of [true,false]){
  const e=await indexed({media:fine?['(pointer:fine)']:[]});routeTo(e,'#index/artists');await flush();
  assert.equal(e.document.activeElement,fine?e.elements['index-query']:e.elements.explorer,fine?'a first entry with a mouse starts in the field':'a touch screen raises no keyboard');
  // A click on the Index tab focuses the tab before it opens the Index, as a browser does.
  e.response={...status('First'),...stageStats(),...stageMusic()};routeTo(e,'#statistics/bermuda-day');await flush();
  const tab=e.elements['index-tab'];tab.focus();follow(e,tab);await flush();
  assert.equal(e.document.activeElement,fine?e.elements['index-query']:tab,fine?'so does an entry by a click on the Index tab':'and a tap on the tab leaves the keyboard down');
  // Look on all stages goes with the sentence it is in: it hands its focus to the field, or with touch to the explorer,
  // never to the page.
  routeTo(e,'#index/artists/ambiance?q=ame');await flush();
  const look=e.elements['index-note'].children.find(n=>n.localName==='a');look.focus();follow(e,look);await flush();
  assert.deepEqual([e.location.hash,e.document.activeElement===(fine?e.elements['index-query']:e.elements.explorer),textOf(e.elements['index-note'])],['#index/artists?q=ame',true,'2 of 14'],'the link in the note');
 }
 const e=await indexed({media:['(pointer:fine)']});routeTo(e,'#index/artists');await flush();
 const [,labels]=e.elements['index-sides'].children,[,tracks]=e.elements['index-order'].children;
 labels.focus();follow(e,labels);await flush();assert.deepEqual([e.document.activeElement===labels,marksOf(e)],[true,['D','K','M']],'a side');
 tracks.focus();follow(e,tracks);await flush();assert.deepEqual([e.document.activeElement===tracks,marksOf(e)[0]],[true,'50+'],'an order');
 stageOf(e,'bermuda-day').focus();follow(e,stageOf(e,'bermuda-day'));await flush();
 assert.deepEqual([e.document.activeElement===stageOf(e,'bermuda-day'),e.location.hash],[true,'#index/labels/bermuda-day?by=tracks'],'a stage: the new current one');
 routeTo(e,'#index/artists');await flush();
 const maceo=rowOf(e,'Maceo Plex');maceo.focus();await browse(e,'#index/artists/bermuda-day');
 assert.equal(e.document.activeElement,maceo,'a row whose name stays keeps focus');
 rowOf(e,'Kiasmos').focus();await browse(e,'#index/artists/palac-dance');
 assert.equal(e.document.activeElement,e.elements['index-query'],'a row whose name goes hands focus to the field, never to the page');
 rowOf(e,'Maceo Plex').focus();e.setLanguage('de');await flush();
 assert.deepEqual([e.document.activeElement===rowOf(e,'Maceo Plex'),rowOf(e,'Maceo Plex')!==maceo,lineOf(rowOf(e,'Maceo Plex'))[0]],[true,true,'Auch auf Under the Sun und 1 weitere'],'in another language, the same name\'s new row');
});

test('a stage that Tab reached in the bar stays in view when the names come, and the bar centres the current stage otherwise',async()=>{
 // The bar as a browser lays it out in a 300 px row: each stage 90 px wide, 30 px more with its count, 10 px apart. The
 // labels come late, as on a first visit over a slow network.
 const laidOut=async()=>{
  const e=await indexed(),row=e.elements['stage-row'],wide=a=>90+(a.children[1]?.textContent?30:0),run=links=>links.reduce((x,a)=>x+wide(a)+10,0);
  let left=0;Object.defineProperty(row,'scrollLeft',{get:()=>left,set:v=>{left=Math.max(0,Math.min(row.scrollWidth-300,v));}});
  Object.defineProperty(row,'scrollWidth',{get:()=>run(row.children)-10});row.clientWidth=300;
  Object.defineProperty(e.Element.prototype,'offsetLeft',{configurable:true,get(){return this.parent===row?run(row.children.slice(0,row.children.indexOf(this))):0;}});
  Object.defineProperty(e.Element.prototype,'offsetWidth',{configurable:true,get(){return this.parent===row?wide(this):0;}});
  let answer;e.names=url=>url.endsWith('kind=artists')?artistNames():new Promise(resolve=>{answer=resolve;});
  return {e,row,come:async()=>{answer(labelNames());await flush();},middle:a=>a.offsetLeft-(300-a.offsetWidth)/2,shows:a=>a.offsetLeft>=row.scrollLeft&&a.offsetLeft+a.offsetWidth<=row.scrollLeft+300};
 };
 const {e,row,come,middle}=await laidOut();routeTo(e,'#index/artists/fontanna');await flush();
 assert.equal(row.scrollLeft,middle(stageOf(e,'fontanna')),'the current stage in the middle');
 const labels=e.elements['index-sides'].children[1];labels.focus();follow(e,labels);await flush();
 assert.deepEqual([countsOf(e).radio,row.scrollLeft],['',middle(stageOf(e,'fontanna'))],'while the labels load, the counts go and the current stage stays in the middle');
 // Shift+Tab goes back to All stages, far from Fontanna, and the browser scrolls the row to show it.
 const all=stageOf(e,'radio');all.focus();row.scrollLeft=0;await come();
 assert.deepEqual([e.location.hash,countsOf(e).radio,e.document.activeElement===all,row.scrollLeft],['#index/labels/fontanna','3',true,0],'All stages stays where it is, in view, as the counts come');
 // Focus that leaves the row lets the next count centre the current stage again.
 e.elements['index-query'].focus();typeIndex(e,'mad');
 assert.deepEqual([countsOf(e).radio,row.scrollLeft],['1',middle(stageOf(e,'fontanna'))],'with focus in the field, the current stage goes back to the middle');
 // The same slow load with focus on one stage: whether it shows whole before and after the counts, where the row ends,
 // and where that stage's middle is.
 const slow=async(from,id,left)=>{const t=await laidOut();routeTo(t.e,from);await flush();follow(t.e,t.e.elements['index-sides'].children[1]);await flush();
  const a=stageOf(t.e,id);a.focus();if(left!==undefined)t.row.scrollLeft=left;const before=t.shows(a);await t.come();
  return {focused:t.e.document.activeElement===a,before,after:t.shows(a),left:t.row.scrollLeft,middle:Math.max(0,t.middle(a))};};
 // On a phone, Chrome's Shift+Tab can leave All stages half hidden. The counts then bring it into view, at the row's start.
 assert.deepEqual(await slow('#index/artists/fontanna','radio',50),{focused:true,before:false,after:true,left:0,middle:0},'All stages, half hidden');
 // Tab took focus to the last stage that shows whole. The counts widen the stages before it and push it out, so it goes
 // to the middle.
 assert.deepEqual(await slow('#index/artists','bermuda-evening'),{focused:true,before:true,after:true,left:155,middle:155},'As Night Begins, pushed out');
 // A stage that still shows whole after the counts stays where it is, rather than move under the listener's eyes.
 assert.deepEqual(await slow('#index/artists','bermuda-day'),{focused:true,before:true,after:true,left:0,middle:40},'Under the Sun, still whole');
});

test('a record opened from the Index comes back through its tab to the same row, at the same height, focused, with no request',async()=>{
 const e=await indexed();const explorer=e.elements.explorer,list=e.elements['music-content'];
 routeTo(e,'#index/artists/bermuda-day?by=tracks');await flush();const kept=e.entries().length,asked=e.namesRequests.length;
 const row=rowOf(e,'Maceo Plex');explorer.clientHeight=600;explorer.scrollTop=700;
 row.getBoundingClientRect=()=>({top:1000-explorer.scrollTop,bottom:1056-explorer.scrollTop});
 follow(e,row);await flush();
 assert.deepEqual([e.location.hash,e.document.activeElement.localName,explorer.scrollTop],['#explore/art_01a5cef5b30e','h3',0],'the record, at its title');
 routeTo(e,e.elements['index-tab'].getAttribute('href'));await flush();
 assert.deepEqual([e.location.hash,e.namesRequests.length-asked,e.document.activeElement===row,explorer.scrollTop,row.getBoundingClientRect().top,e.entries().length,countsOf(e).radio],
  ['#index/artists/bermuda-day?by=tracks',0,true,700,300,kept+2,'14'],'the same rows, the row where it stood, focused, and the stage bar\'s counts');
 // Back does the same.
 follow(e,row);await flush();e.history.go(-1);await flush();
 assert.deepEqual([e.location.hash,e.namesRequests.length-asked,e.document.activeElement===row,explorer.scrollTop,row.getBoundingClientRect().top],['#index/artists/bermuda-day?by=tracks',0,true,700,300],'and so does Back');
 e.window.emit('popstate');explorer.scrollTop=10;e.window.emit('hashchange');await flush();
 assert.equal(explorer.scrollTop,10,'the place is used once: the hashchange after a browser move restores nothing');
 // A window made shorter while the record showed: the row stays in view, above the dialog's bottom.
 follow(e,row);await flush();explorer.clientHeight=200;routeTo(e,e.elements['index-tab'].getAttribute('href'));await flush();
 assert.deepEqual([row.getBoundingClientRect().top,e.document.activeElement===row],[144,true]);
 // Left by a tab, the Index keeps its first row under the bar, with no focus.
 e.response={...status('First'),...stageStats(),...stageMusic()};routeTo(e,'#statistics/bermuda-day');await flush();
 assert.ok(!list.descendants().includes(row),'another place draws its own');
 e.history.go(-1);await flush();assert.deepEqual([explorer.open,e.location.hash],[true,'#index/artists/bermuda-day?by=tracks'],'and Back goes back one move, to the Index');
 e.elements['explorer-close'].emit('click');await flush();assert.deepEqual([explorer.open,e.location.hash,e.position()],[false,'',0],'then ✕ closes the explorer in one step');
});

test('the names load once per side and page, Try again asks again after a failure, and the head works without them',async()=>{
 const e=await indexed();let hold=null;
 e.names=(url,signal)=>new Promise((resolve,reject)=>{hold={resolve,kind:new URL(url,'http://x').searchParams.get('kind')};signal.addEventListener('abort',()=>reject(new DOMException('This operation was aborted','AbortError')));});
 routeTo(e,'#index/artists');await flush();
 assert.deepEqual([e.elements['music-status'].textContent,e.elements['index-head'].hidden,countsOf(e).radio],['Loading the names…',false,''],'only an empty list says it is loading');
 routeTo(e,'#index/artists/fontanna');await flush();
 assert.deepEqual([e.namesRequests.map(r=>r.signal.aborted),e.elements['music-status'].textContent],[[true,false],'Loading the names…'],'another stage while the names load asks again at once, rather than wait on the request it dropped');
 routeTo(e,'#index/labels');await flush();routeTo(e,'#index/artists');await flush();
 assert.deepEqual(e.namesRequests.map(r=>[new URL(r.url,'http://x').searchParams.get('kind'),r.signal.aborted]),[['artists',true],['artists',true],['labels',true],['artists',false]],'a request dropped on the way leaves the cache, so the next one asks again');
 hold.resolve(artistNames());await flush();
 routeTo(e,'#index/labels');await flush();hold.resolve(labelNames());await flush();routeTo(e,'#index/artists/fontanna');await flush();routeTo(e,'#index/labels?by=tracks');await flush();
 assert.deepEqual([e.namesRequests.length,marksOf(e)],[5,['50+','10+','1']],'then once per side for the page');
 const f=await indexed();f.names={labels:labelNames()};
 routeTo(f,'#index/artists/fontanna');await flush();
 const status=f.elements['music-status'],retry=status.children[1];
 assert.deepEqual([textOf(status),retry.localName,sectionsOf(f).length,countsOf(f).radio,f.elements['index-head'].hidden,f.elements['index-sides'].children[1].getAttribute('href')],['The names could not load. Try again','button',0,'',false,'#index/labels/fontanna'],'a sentence and Try again, no list and no counts; the sides still switch');
 typeIndex(f,'fri');assert.deepEqual([f.location.hash,sectionsOf(f).length],['#index/artists/fontanna?q=fri',0],'a filter typed with no names draws nothing');
 f.names={artists:artistNames()};retry.emit('click');await flush();
 assert.deepEqual([f.namesRequests.length,sectionsOf(f).map(namesIn),f.elements['index-note'].textContent,status.textContent,countsOf(f).fontanna],[2,[['Frivolous']],'1 of 3','','1'],'Try again asks again and draws the filtered list');
 // The labels shown before a side that fails are not its names: a filter typed then draws nothing.
 const g=await indexed();g.names={labels:labelNames()};routeTo(g,'#index/labels');await flush();routeTo(g,'#index/artists');await flush();
 typeIndex(g,'mad');assert.deepEqual([sectionsOf(g).length,textOf(g.elements['music-status'])],[0,'The names could not load. Try again']);
 // The note goes with the list it speaks of: a side that loads, then fails, says only that, never the last filter's sentence.
 let answer;const h=await indexed();h.names=url=>url.endsWith('kind=artists')?artistNames():new Promise(resolve=>{answer=resolve;});
 routeTo(h,'#index/artists/ambiance?q=ame');await flush();const note=h.elements['index-note'];
 assert.equal(textOf(note),'No artist matches “ame”. Look on all stations (2)');
 follow(h,h.elements['index-sides'].children[1]);await flush();
 assert.deepEqual([h.location.hash,textOf(note),textOf(h.elements['music-status'])],['#index/labels/ambiance','','Loading the names…'],'while the labels load');
 answer(null);await flush();
 assert.deepEqual([textOf(note),textOf(h.elements['music-status'])],['','The names could not load. Try again'],'and once they fail: one note');
 typeIndex(h,'kos');assert.deepEqual([h.location.hash,textOf(note)],['#index/labels/ambiance?q=kos',''],'a filter typed then adds none');
});

// The two ways through the stations, step 2: the explorer's station rows follow the radio's way and a thin line parts
// its groups, the Index breaks its ties in the same order, and a station's place carries its stage. A row as read: each
// station's name, after a line where its group starts.
const rowNames=e=>e.elements['stage-row'].children.map(a=>(a.dataset.groupStart===''?'| ':'')+textOf(a.children[0]));
const byFeelingRow=['Under the Sun','Fontanna','| As Night Begins','Night in Motion','Etage 0','Lost in Feelings','Closing','| Ambiance','Essentials'];
const byStageRow=['Under the Sun','As Night Begins','| Night in Motion','Lost in Feelings','| Etage 0','| Fontanna','| Ambiance','| Closing','Essentials'];

test('the station rows follow the radio\'s way and part its groups with a line',async()=>{
 const e=await indexed({storage:{getItem:key=>key==='pavoia-way'?'feeling':null,setItem(){}}});e.historyReply=answer(played(5));
 routeTo(e,'#history');await flush();
 assert.deepEqual(rowNames(e),['All stations','| Under the Sun',...byFeelingRow.slice(1)],'History lists All stations, then the feeling order, with a line before Night and before Any time');
 await stagePlace(e,'#statistics/radio',{scope:'radio'});
 assert.deepEqual(rowNames(e),['All stations','| Under the Sun',...byFeelingRow.slice(1)],'All stations is a group of its own in Statistics');
 routeTo(e,'#index/artists');await flush();
 assert.deepEqual(rowNames(e),['All stations','| Under the Sun',...byFeelingRow.slice(1)],'and in the Index');
 assert.ok(e.elements['stage-row'].children.every(a=>a.localName==='a'),'the children stay links');
 const s=await indexed();s.historyReply=answer(played(5));
 routeTo(s,'#history');await flush();
 assert.deepEqual(rowNames(s),['All stations','| Under the Sun',...byStageRow.slice(1)],'with nothing stored, All stations, then by stage: a line before Night in Motion, Etage 0, Fontanna, Ambiance and Closing');
 await stagePlace(s,'#statistics/radio',{scope:'radio'});
 assert.deepEqual(rowNames(s),['All stations','| Under the Sun',...byStageRow.slice(1)],'and six in Statistics');
 assert.ok(s.elements['stage-row'].children.every(a=>a.localName==='a'));
});

test('the Index breaks ties in the stage bar\'s order, after a change of way too',async()=>{
 const e=await indexed(),artists=artistNames();artists.items.push({name:'Tied',count:2,stages:{'bermuda-evening':1,fontanna:1}});e.names={artists,labels:labelNames()};
 routeTo(e,'#index/artists');await flush();const row=rowOf(e,'Tied');
 assert.deepEqual(lineOf(row),['As Night Begins and 1 more','2 tracks'],'by stage As Night Begins stands before Fontanna in the bar');
 e.history.go(-1);await flush();assert.equal(e.elements.explorer.open,false,'the way changes while the explorer is closed');
 press(e,'feeling');routeTo(e,'#index/artists');await flush();
 assert.deepEqual([rowOf(e,'Tied')===row,stageOf(e,'fontanna')===e.elements['stage-row'].children[2],lineOf(row)],[true,true,['Fontanna and 1 more','2 tracks']],'by feeling Fontanna does, and the same row says so');
});

test('a station\'s place in Statistics carries its stage over its name',async()=>{
 const e=setup({journey:true});await flush();e.discovery={items:[]};const eyebrow=()=>byClass(e.elements['music-content'],'eyebrow').map(textOf);
 await stagePlace(e,'#statistics/bermuda-day');assert.deepEqual(eyebrow(),['Bermuda stage'],'its stage, where the type word was');
 e.window.Pavoia.tune('bermuda-day');await flush();assert.deepEqual(eyebrow(),['Bermuda stage ·\u00a0On air'],'On air after it while it is on air');
 // A narrow phone breaks the eyebrow only at the plain space before the middle dot: the middle dot, the red dot and
 // the words hold together in one span that never wraps, so "Selected by Gaende" stands over "· ● On air".
 const mark=byClass(e.elements['music-content'],'on-air')[0],held=mark.children[0];
 assert.deepEqual([mark.textContent,mark.children.length,held.textContent,held.children.map(textOf)],[' ',1,'·\u00a0',['On air']],'a plain space, then the dot and the words in one span');
 assert.match(cssRules().get('.eyebrow .on-air > span'),/white-space:nowrap/,'which never wraps');
 e.setLanguage('de');await flush();assert.deepEqual(eyebrow(),['Bühne Bermuda ·\u00a0Auf Sendung']);
 e.window.Pavoia.tune('palac-feel');await flush();assert.deepEqual(eyebrow(),['Bühne Bermuda']);
 e.setLanguage('en');await flush();
 await stagePlace(e,'#statistics/closing',{scope:'closing'});assert.deepEqual(eyebrow(),['Selected by Gaende'],'Gaende\'s own selections say so');
 await stagePlace(e,'#statistics/radio',{scope:'radio'});assert.deepEqual(eyebrow(),[],'All stations has no eyebrow');
 e.click();e.playing();e.change('01');
 await stagePlace(e,'#statistics/bermuda-day');assert.deepEqual(eyebrow(),['Bermuda stage'],'while another station plays, the station shown is not on air in the ears');
 await stagePlace(e,'#statistics/palac-feel',{scope:'palac-feel'});assert.deepEqual(eyebrow(),['Pałac stage ·\u00a0On air'],'the station heard is');
});

test('a thin line parts the groups of the station row',()=>{
 const rules=cssRules(),root=rules.get(':root'),token=name=>Number(new RegExp('--'+name+':(\\d+)px').exec(root)[1]);
 const length=value=>Function('return '+value.replace(/calc\(/g,'(').replace(/var\(--(\w+)\)/g,(_,name)=>token(name)).replace(/px/g,''))();
 const get=(selector,property)=>new RegExp('(?:^|;)\\s*'+property+':\\s*([^;]+)').exec(rules.get(selector))[1].trim();
 const line='.stage-row a[data-group-start]::before',left=length(get(line,'left')),width=length(get(line,'width')),row=length(get('.stage-row','gap').split(' ')[1]);
 const gap=row+length(get('.stage-row a[data-group-start]','margin-left'));
 assert.deepEqual([gap,left+width/2,width,length(get(line,'height')),2*length(get(line,'top'))+length(get(line,'height')),get(line,'content'),get(line,'background')],[32,-gap/2,1,18,44,'""','var(--line)'],
  'the first station of a group keeps 16px more before it and draws a 1 by 18px line in the middle of the 32px, centred on its 44px link');
 // The Index's bar also counts each station's names, so it keeps the row's 16px and draws the line in its middle: the
 // 96px of six wider gaps would push Essentials under the fade on a 1366px laptop.
 const index='#music-view[data-view=index] .stage-row a[data-group-start]',inLeft=length(get(index+'::before','left'));
 assert.deepEqual([row+length(get(index,'margin-left')),inLeft+width/2],[16,-8],'the Index draws its line in the middle of the row\'s 16px');
 // In both, the line stands clear of the 5px focus rings of the station before it and the station after it.
 const ring=length(get(':focus-visible','outline-offset'))+length(get(':focus-visible','outline').split(' ')[0]);
 assert.deepEqual([ring,gap+left-ring,-(left+width)-ring,16+inLeft-ring,-(inLeft+width)-ring],[5,10.5,10.5,2.5,2.5],'px between the line and each ring');
});

test('no word of the explorer calls a station a stage, in English or German',()=>{
 const journey=web('journey.js'),strings=journey.slice(journey.indexOf('const copy'),journey.indexOf('const word'));
 const values=[...strings.matchAll(/:'([^']*)'/g)].map(m=>m[1]);
 assert.ok(values.length>250,'every word is read: '+values.length);
 assert.deepEqual(values.filter(v=>/stage|bühne/i.test(v.replaceAll('{stage}',''))),[],'the word stays only in {stage} placeholders and in keys');
 assert.doesNotMatch(strings,/(?<![\w$])stage:/,'the type word Stage is gone');
});

test('History reads time, title and artist on the one row at every width, under sticky day names, with red only for Now',()=>{
 const rules=cssRules(),phone=cssRules('(max-width:760px)'),small=cssRules('(max-width:600px)');
 assert.match(rules.get('.row:has(> time)'),/grid-template-columns:64px minmax\(0,1fr\) auto; scroll-margin-top:56px;/,'a row reached with Tab scrolls clear of the sticky day name; the explorer\'s scroll padding clears the bar and the ring');
 assert.ok(!phone.has('.row:has(> time)'),'the same margin on a phone');
 assert.ok(![...rules.keys(),...phone.keys(),...small.keys()].some(selector=>/history-row|history-record/.test(selector)),'History rows are the explorer\'s one row');
 assert.match(rules.get('.row-fact, .row > time'),/font:11px\/1\.4 var\(--mono\)/,'times are small facts');
 assert.match(rules.get('.history-day'),/position:sticky; top:var\(--top\); z-index:1; margin:0 0 var\(--s2\); padding:var\(--s4\) 0 var\(--s2\); background:var\(--surface\); font:22px\/1\.2 var\(--serif\); color:var\(--cream\);/,'a day name in the heading style sticks under the bar; its opaque bottom padding hides a row before it reaches the name, and the margin under that keeps the focus ring of the row below in view');
 assert.doesNotMatch(rules.get('.history-day'),/mono|uppercase|letter-spacing/);
 assert.match(phone.get('.history-day'),/top:0/);assert.match(rules.get('.explorer-top'),/z-index:2/,'the bar stays over the day names');
 assert.ok(![...rules.values()].some(body=>/font:500|font-weight:500/.test(body)),'no Inter 500 left');
 assert.match(rules.get('#music-content[aria-busy=true]'),/opacity:\.45; pointer-events:none; transition:opacity var\(--hover\) var\(--ease\)/);
 assert.match(small.get('#history-more'),/width:100%/);
 assert.match(rules.get('#history-more'),/min-width:12\.5rem/,'the longest label, Frühere Tracks anzeigen, fits: Loading… and Try again swap in a box of the same width');
 assert.ok(!rules.has('#explorer #history-day'),'the Day field is a field like the others');assert.match(rules.get('.music-filters label'),/color:var\(--soft\); font-size:12px/);
 assert.deepEqual([...rules].filter(([selector,body])=>/--red/.test(body)&&/#explorer|\.explorer|\.entity|\.eyebrow|\.row|\.region|\.record|history|music/.test(selector)).map(([selector])=>selector),['.eyebrow .on-air span span::before','.row[aria-current] time::before'],'in the explorer, red marks only what plays now: Now in History, and On air on the record');
});

test('the explorer and the record title take focus as places to read from, with no control ring',()=>{
 const rules=cssRules();
 assert.match(rules.get('#explorer:focus'),/outline:none/);
 assert.match(rules.get('#explorer h3[tabindex="-1"]:focus'),/outline:none/,'a direct load focuses the title: no white box around it');
});

// Explorer v2 step 3: from 1100px wide a record is a map, a second layout of the same DOM. The fake boxes: the map is
// 1300 × 668 until a test resizes it (e.mapWidth, e.mapHeight), a pictured name 200 × 44, a plain one 120 × 32, a region name
// 150 × 26, and the header, with a long title, 520 wide around the middle from 244 to 470.
const mapBoxes=e=>{
 const P=e.Element.prototype,box=(left,top,width,height)=>({left,top,width,height,right:left+width,bottom:top+height}),is=(n,c)=>(n.className||'').split(' ').includes(c);e.mapWidth=1300;e.mapHeight=668;
 Object.defineProperty(P,'clientWidth',{configurable:true,get(){return is(this,'neighbourhood')?e.mapWidth:0;}});
 Object.defineProperty(P,'clientHeight',{configurable:true,get(){return is(this,'neighbourhood')?e.mapHeight:0;}});
 P.getBoundingClientRect=function(){
  if(is(this,'neighbourhood'))return box(0,0,e.mapWidth,e.mapHeight);
  if(is(this,'entity-heading'))return box(e.mapWidth/2-260,244,520,226);
  if(this.localName==='li')return this.dataset.ring==='r1'?box(0,0,200,44):box(0,0,120,32);
  return this.localName==='h4'?box(0,0,150,26):box(0,0,0,0);
 };
};
// An artist with three similar artists, a fourth one similar to the first, eleven it worked with, a release, a label
// and a track.
const mapHood=()=>{
 const A=n=>id('art',n),T=n=>id('trk',n),workers=Array.from({length:11},(_,n)=>A(311+n));
 const centre=rec(A(1),'Centre',[[A(101),'similar'],[A(102),'similar'],[A(104),'similar'],...workers.map(w=>[w,'collaboration']),[id('rel',1),'release'],[id('lab',1),'label'],[T(1),'track']],{bio:'A bio.'});
 const near=[rec(A(101),'Near One',[[A(201),'similar']],{trackCount:9}),rec(A(102),'Near Two',[],{trackCount:8}),rec(A(104),'Near Three',[],{trackCount:7}),rec(A(201),'Far One',[],{trackCount:1}),
  ...workers.map((w,n)=>rec(w,'Worker '+n,[],{trackCount:30-n})),rec(id('rel',1),'Own Release',[],{releaseDate:'2020-01-01'}),rec(id('lab',1),'Own Label'),rec(T(1),'Own Track',[],{durationMs:300000,playlists:[{code:'LIF',station:'Lost in Feelings'}]})];
 return {[A(1)]:{entity:centre,included:near}};
};
const mapOf=e=>byClass(inspector(e),'neighbourhood')[0];
const nodesOf=map=>map.descendants().filter(n=>n.localName==='li');
const px=value=>parseFloat(value);

test('from 1100px wide a record is a map: the header in the middle, the closest names around it on two ellipses, one line to each',async()=>{
 const e=setup({journey:true,media:['(min-width:1100px)']});mapBoxes(e);await flush();const data=mapHood();e.discovery=url=>data[url.split('/').pop()]||null;
 e.visit('#explore/'+id('art',1));await flush();
 const map=mapOf(e),lines=byClass(map,'map-lines')[0],nodes=nodesOf(map),shown=nodes.filter(n=>!n.hidden),at=key=>nodes.find(n=>n.dataset.id===key);
 assert.deepEqual([inspector(e).children.map(cls),map.children.map(cls),byClass(inspector(e),'regions')[0].children.map(cls)],
  [['neighbourhood','neighbourhood-caption','regions'],['map-lines','entity-heading','region','region','region','region'],['record-about','region']],'the header, the regions and the lines in one box, the caption under it, then About and On the radio');
 assert.equal(lines.attrs['aria-hidden'],'true');
 // The same rows as the list, each knowing what it hangs from: pictured names first, plain ones after.
 assert.deepEqual(['art_000000000101','art_000000000201','art_000000000311','rel_000000000001'].map(key=>[at(key).dataset.side,at(key).dataset.ring]),[['left','r1'],['left','r2'],['left','r1'],['right','r1']]);
 const worked=byClass(map,'region')[1].descendants().filter(n=>n.localName==='li');
 assert.deepEqual([worked.length,worked.filter(n=>n.hidden).length,worked.slice(-2).every(n=>n.hidden)],[11,4,true],'Worked with: 9 at most, and the lowest plain names leave when its band is full; the list keeps them');
 assert.equal(lines.children.length,shown.length,'one line to each name on the map');
 // The arithmetic: cx 650, cy 334, inner rx 247, outer rx 468, ry 414.16; Similar artists stack from y 94, 60px apart.
 const cx=650,cy=334,ry=.62*668,on=(rx,y)=>rx*Math.sqrt(1-Math.min(1,Math.abs(y-cy)/ry)**2),near=at('art_000000000101'),far=at('art_000000000201');
 assert.deepEqual([px(near.style.top),px(byClass(map,'region')[0].children[0].style.top)],[94,50],'the first name in its band, and its region name 44px above it');
 assert.ok(Math.abs(cx-px(near.style.left)-on(247,94))<1e-9,'a name clear of the header sits on the inner ellipse');
 assert.deepEqual([px(far.style.top),cx-px(far.style.left)>=cx-px(near.style.left)+200+16],[94,true],'a plain name similar to a pictured one hangs level with it in the outer column, clear of it');
 assert.ok(lines.children.some(p=>p.attrs.d.startsWith(`M${cx-(cx-px(near.style.left)+208)} 94C`)),'its line starts 8px past the outer edge of its parent');
 assert.ok(lines.children.some(p=>p.attrs.d.startsWith(`M${cx-68} ${cy-30}C`)),'the others start beside the middle picture');
 for(const n of shown.filter(n=>px(n.style.top)+22>244&&px(n.style.top)-22<470))assert.ok(Math.abs(px(n.style.left)-cx)>=260+16,'a name beside the header clears it');
 // The same records in the same box give the same map; only a resize moves the names, along with the box.
 const watch=e.observers.find(o=>o.targets.includes(map)),before=nodes.map(n=>[n.hidden,n.style.left,n.style.top]);watch.fn();
 assert.deepEqual(nodes.map(n=>[n.hidden,n.style.left,n.style.top]),before);
 e.mapWidth=1200;watch.fn();
 assert.deepEqual([px(near.style.left),lines.children.length],[600-on(.19*1200,94),nodes.filter(n=>!n.hidden).length],'a narrower window: a narrower ellipse, its lines drawn again');
 // A name in focus that the window drops hands focus to the title (a browser finds it under [hidden]).
 const row=far.children[0];row.closest=()=>far;row.focus();e.mapWidth=600;watch.fn();
 assert.deepEqual([far.hidden,e.document.activeElement===inspector(e).descendants().find(n=>n.localName==='h3')],[true,true]);
 const rules=cssRules(),still=cssRules('(prefers-reduced-motion: no-preference)');
 assert.match(rules.get('.neighbourhood'),/position:relative; height:clamp\(480px, calc\(100dvh - var\(--bar\) - var\(--top\) - 72px\), 700px\);/,'from a 720px high window down, the caption and its focus ring end above the player bar');
 assert.match(rules.get('.explore-workspace:has(> #entity-inspector > .neighbourhood)'),/margin-top:0/);assert.match(rules.get('#explorer #discovery-status:empty'),/margin:0/,'the map starts right under the explorer\'s bar: an empty status keeps no margin, so the 72px left are the caption\'s');
 assert.match(rules.get('.neighbourhood .entity-heading'),/position:absolute; left:50%; top:calc\(50% - 90px\); width:min\(420px, calc\(38% - var\(--s4\)\)\);.*text-align:center; transform:translateX\(-50%\);/,'420px wide at most, centred, its top 90px above the middle');
 assert.match(rules.get('.neighbourhood .entity-heading :is(nav, p, h3)'),/text-shadow:0 0 3px var\(--surface\), 0 0 6px var\(--surface\), 0 0 10px var\(--surface\)/,'lines pass behind the words');
 assert.match(rules.get('.neighbourhood .entity-heading h3'),/text-wrap:balance;.*-webkit-line-clamp:2/,'the title in two lines at most');
 assert.match(rules.get('.neighbourhood .entity-trail'),/position:absolute; inset:auto 0 calc\(100% \+ var\(--s3\)\);/,'the trail 16px above the picture');
 assert.match(rules.get('.neighbourhood :is(.row-line, .row-fact), #music-content .region[data-key] .row-line'),/position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset\(50%\);/,'the reason and the fact stay for screen readers; a stage place, whose fact is its count, says it once in its lists too');
 assert.match(rules.get('.neighbourhood :is(li, .region > p)[data-side=left]'),/transform:translate\(-100%, -50%\)/);assert.match(rules.get('.neighbourhood [data-side=left] .row'),/flex-direction:row-reverse; text-align:right/,'a left name anchors at its right edge, its picture toward the record');
 assert.match(rules.get('.neighbourhood .row'),/min-height:44px/);assert.match(rules.get('.neighbourhood .row-name'),/max-width:150px/);
 assert.match(rules.get('.neighbourhood [data-ring=r2] .row::before'),/width:5px; height:5px; border-radius:50%; background:var\(--muted\)/);assert.match(rules.get('.neighbourhood [data-ring=r2] .picture'),/display:none/);
 assert.match(rules.get('.map-lines'),/fill:none; stroke:var\(--line\); stroke-width:1;/);assert.match(rules.get('.map-lines [data-lit]'),/stroke:var\(--soft\)/);
 assert.match(rules.get('.neighbourhood ~ .regions'),/padding-top:var\(--s5\); border-top:1px solid var\(--line\)/,'About and On the radio under a line');
 assert.match(still.get('.neighbourhood :is(.region, .map-lines)'),/transition:opacity 180ms ease/);assert.match(still.get('@starting-style'),/\.neighbourhood :is\(\.region, \.map-lines\) \{ opacity:0; \}/,'names and lines fade in, unless motion is reduced');
});

// Explore plan step 7: On the radio comes first in the list and on a phone. On the map, the regions sit around the header
// and only About and On the radio are in the grid under it: there it keeps its place beside About, so About never stands
// alone on its row.
test('On the radio comes first on a phone, and stays beside About, after it, where the grid has columns',async()=>{
 const saved={},storage={getItem:key=>saved[key]??null,setItem(key,value){saved[key]=value;}},data=hood();
 const e=setup({journey:true,media:['(min-width:1100px)'],storage});mapBoxes(e);await flush();e.discovery=url=>data[url.split('/').pop()]||null;
 e.visit('#explore/art_000000000001');await flush();
 const keys=()=>byClass(inspector(e),'regions')[0].children.map(n=>n.dataset.key||cls(n)),wide=['similar','worked','releases','labels','record-about','onRadio'];
 assert.deepEqual([Boolean(mapOf(e)),keys(),byClass(mapOf(e),'region').map(n=>n.dataset.key)],[true,['record-about','onRadio'],['similar','worked','releases','labels']],'on the map: About, then On the radio, in the grid under it');
 byClass(inspector(e),'neighbourhood-caption')[0].children.at(-1).emit('click');
 assert.deepEqual([Boolean(mapOf(e)),keys()],[false,wide],'the list the listener chose, at the same width: still beside About, so no row has a hole');
 // A phone has one column: what the listener came for is first. A window that crosses 760px draws again.
 const p=setup({journey:true,media:['(max-width:760px)']});await flush();p.discovery=url=>data[url.split('/').pop()]||null;p.visit('#explore/art_000000000001');await flush();
 const phone=()=>byClass(inspector(p),'regions')[0].children.map(n=>n.dataset.key||cls(n));
 assert.deepEqual(phone(),['onRadio','similar','worked','releases','labels','record-about'],'on a phone: On the radio, then the regions, then About');
 p.queries.get('(max-width:760px)').change(false);assert.deepEqual(phone(),wide,'widened past the phone layout, it goes back beside About');
 p.queries.get('(max-width:760px)').change(true);assert.deepEqual(phone()[0],'onRadio','and narrowed again, it is first');
});

test('the map or the list is the listener\'s choice, kept across visits; a narrow window or blocked storage draws as before',async()=>{
 const saved={},storage={getItem:key=>saved[key]??null,setItem(key,value){saved[key]=value;}},data=mapHood();
 let e;const open=async options=>{e=setup({journey:true,media:['(min-width:1100px)'],...options});mapBoxes(e);await flush();e.discovery=url=>data[url.split('/').pop()]||null;e.visit('#explore/'+id('art',1));await flush();};
 const caption=()=>byClass(inspector(e),'neighbourhood-caption')[0],toggle=()=>caption().children.at(-1);
 await open({storage});
 assert.deepEqual([caption().children.map(n=>[n.localName,n.attrs['aria-hidden'],n.textContent])],[[['span','true','The nearer a name, the closer it is. Pick one to go there.'],['button',undefined,'Show as a list']]],'the caption\'s words repeat the links, the button does not');
 toggle().emit('click');
 assert.deepEqual([saved['pavoia-explorer-view'],inspector(e).children.map(cls),caption().children.length,toggle().textContent,e.document.activeElement===toggle()],['list',['entity-heading','neighbourhood-caption','regions'],1,'Show as a map',true],'the list of step 2, its switch under the header, with focus');
 await open({storage});
 assert.equal(inspector(e).children[0].className,'entity-heading','the choice survives a reload');
 toggle().emit('click');assert.deepEqual([saved['pavoia-explorer-view'],inspector(e).children[0].className],['map','neighbourhood']);
 const denied=()=>{throw new Error('Storage denied');};
 await open({storage:{getItem:denied,setItem:denied}});
 assert.equal(inspector(e).children[0].className,'neighbourhood','storage that throws still draws the map');
 toggle().emit('click');assert.equal(inspector(e).children[0].className,'entity-heading','and the switch still works for this visit');
 await open({storage,media:[]});
 assert.deepEqual([inspector(e).children.map(cls),byClass(inspector(e),'neighbourhood-caption').length],[['entity-heading','regions'],0],'under 1100px the list stays as it is, with no switch');
 const title=()=>inspector(e).descendants().find(n=>n.localName==='h3');assert.equal(e.document.activeElement,title());
 e.queries.get('(min-width:1100px)').change(true);
 assert.deepEqual([inspector(e).children[0].className,e.document.activeElement===title(),mapOf(e).contains(title())],['neighbourhood',true,true],'widening the window draws the map, and focus stays on the title');
 e.setLanguage('de');
 assert.deepEqual(caption().children.map(n=>n.textContent),['Je näher ein Name, desto enger die Verbindung. Wähle einen, um dorthin zu gehen.','Als Liste zeigen']);
 toggle().emit('click');assert.equal(toggle().textContent,'Als Karte zeigen');
});

test('a name under the pointer or in focus lights its line and its parent\'s, and the caption says why it is there',async()=>{
 const e=setup({journey:true,media:['(min-width:1100px)']});mapBoxes(e);await flush();
 const track={entity:rec('trk_0123456789ab','Abandoned Soul',[['art_000000000001','primary'],['art_000000000002','remixer'],['lab_000000000001','label']],{durationMs:423993,playlists:[{code:'ANB',station:'As Night Begins'}]}),included:[rec('art_000000000001','Jimi Jules',[['art_000000000003','similar']],{trackCount:11}),rec('art_000000000002','Recondite',[['art_000000000003','similar']],{trackCount:7}),rec('lab_000000000001','Watergate Records')]};
 const credit=n=>({entity:track.included[n],included:[rec('art_000000000003','Guy Gerber',[],{trackCount:3})]});
 e.discovery=url=>url.endsWith('/track/123')?track:url.endsWith('art_000000000001')?credit(0):url.endsWith('art_000000000002')?credit(1):null;
 await e.poll();await flush();e.elements['go-deeper'].emit('click');await flush();
 const map=mapOf(e),nodes=nodesOf(map),lines=byClass(map,'map-lines')[0],hint=byClass(inspector(e),'neighbourhood-caption')[0].children[0];
 const jimi=nodes.find(n=>n.dataset.id==='art_000000000001'),guy=nodes.find(n=>n.dataset.id==='art_000000000003'),lit=()=>lines.children.filter(p=>'data-lit' in p.attrs).length;
 assert.deepEqual([jimi.dataset.ring,guy.dataset.ring,guy.dataset.side,px(guy.style.left)<px(jimi.style.left)-200],['r1','r2','left',true],'a track: who made it, pictured, and the similar artists hanging from them in the outer column');
 map.emit('focusin',{target:{closest:()=>guy}});
 assert.deepEqual([lit(),hint.textContent],[2,'Guy Gerber · Similar to Jimi Jules and Recondite · 3 tracks'],'its line and its parent\'s light up');
 map.emit('focusout',{target:guy});
 assert.deepEqual([lit(),hint.textContent],[0,'The nearer a name, the closer it is. Pick one to go there.']);
 map.emit('pointerover',{target:{closest:()=>jimi}});assert.deepEqual([lit(),hint.textContent],[1,'Jimi Jules · Artist · 11 tracks']);
 map.emit('pointerover',{target:{closest:()=>null}});assert.equal(lit(),0,'over the header, nothing is lit');
 map.emit('pointerover',{target:{closest:()=>jimi}});map.emit('pointerleave',{});assert.deepEqual([lit(),hint.textContent],[0,'The nearer a name, the closer it is. Pick one to go there.']);
});

test('an outer name starts past its parent\'s outer edge, also far from its parent\'s level, and its region name stays inside the map',async()=>{
 const e=setup({journey:true,media:['(min-width:1100px)']});mapBoxes(e);await flush();
 // One credited artist, pushed out by the header beside it, with seven similar artists hanging from it.
 const A=n=>id('art',n),T=id('trk',1),kids=Array.from({length:7},(_,n)=>A(201+n));
 const track={entity:rec(T,'Track',[[A(1),'primary']],{durationMs:300000}),included:[rec(A(1),'Parent',kids.map(k=>[k,'similar']),{trackCount:5})]};
 const parent={entity:track.included[0],included:kids.map((k,n)=>rec(k,'Kid '+n,[],{trackCount:9-n}))};
 e.discovery=url=>url.endsWith(T)?track:url.endsWith(A(1))?parent:null;
 e.visit('#explore/'+T);await flush();
 // cx 650; the header reaches 260 from the middle, so the parent starts at 276 and ends at 476, at y 358.
 const map=mapOf(e),cx=650,from=n=>cx-px(n.style.left),nodes=nodesOf(map),p=nodes.find(n=>n.dataset.id===A(1)),shown=nodes.filter(n=>n.dataset.via===A(1)&&!n.hidden);
 assert.deepEqual([from(p),px(p.style.top),shown.length],[276,358,7]);
 assert.ok(shown.some(n=>Math.abs(px(n.style.top)-px(p.style.top))>=90),'a name far above its parent, where the ellipse runs nearer the middle than the parent reaches');
 for(const n of shown)assert.ok(from(n)>=from(p)+200+24,'every outer name starts 24px past its parent\'s outer edge, so its line never runs back across the parent');
 assert.ok(byClass(map,'map-lines')[0].children.filter(l=>l.attrs.d.startsWith(`M${cx-484} 358C`)).length===7,'each line starts 8px past the parent');
 // 40px narrower, the names still fit past the parent; their region name, wider than they are, moves in to stay inside.
 // A name 200px wide no longer fits: it leaves before the column stacks, so the column has no gap.
 const wide=nodes.find(n=>n.dataset.id===kids[1]);wide.getBoundingClientRect=()=>({left:0,top:0,width:200,height:32,right:200,bottom:32});
 e.mapWidth=1260;e.observers.find(o=>o.targets.includes(map)).fn();
 const heading=byClass(map,'region')[1].children[0],left=n=>630-px(n.style.left),tops=nodes.filter(n=>n.dataset.via===A(1)&&!n.hidden).map(n=>px(n.style.top));
 assert.deepEqual([wide.hidden,tops.length,tops.slice(1).every((t,i)=>t-tops[i]===32)],[true,6,true]);
 assert.deepEqual([nodes.filter(n=>n.dataset.via===A(1)&&!n.hidden).every(n=>left(n)===500),left(heading)+150],[true,630],'the region name ends on the map\'s edge');
});

test('an empty region keeps its heading and its one sentence on the map, where its first name would be, with no line to it',async()=>{
 const e=setup({journey:true,media:['(min-width:1100px)']});mapBoxes(e);await flush();
 e.discovery={entity:rec(id('art',11),'Chlär',[[id('lab',11),'label'],[id('rel',11),'release']]),included:[rec(id('lab',11),'C O U P'),rec(id('rel',11),'Don’t Give Yourselves',[[id('lab',11),'label']],{releaseDate:'2021-01-01'})]};
 e.visit('#explore/'+id('art',11));await flush();
 const map=mapOf(e),similar=byClass(map,'region').find(r=>r.dataset.key==='similar'),[heading,note]=similar.children,lines=byClass(map,'map-lines')[0];
 assert.deepEqual([similar.hidden,note.hidden,textOf(heading),note.textContent,note.dataset.side],[false,false,'Similar artists 0','No similar artists in the collection yet.','left'],'seen, and read');
 // The sentence stacks in the middle of the left band, at y 358, clear of the header; its region name 30px above it.
 assert.deepEqual([note.style.left,note.style.top,heading.style.left,heading.style.top],['374px','358px','374px','328px']);
 assert.equal(lines.children.length,nodesOf(map).filter(n=>!n.hidden).length,'a line to each name, none to the sentence');
 const rules=cssRules();
 assert.match(rules.get('.neighbourhood :is(li, .region > p)'),/position:absolute; width:max-content;/);assert.match(rules.get('#explorer .neighbourhood .region > p'),/margin:0/);
});

test('a map with no name on it offers none to pick, and its header says why',async()=>{
 const e=setup({journey:true,media:['(min-width:1100px)']});mapBoxes(e);await flush();
 const open=async entity=>{e.discovery={entity,included:[]};e.visit('#explore/'+entity.id);await flush();};
 const hint=()=>byClass(inspector(e),'neighbourhood-caption')[0].children[0],last=()=>byClass(mapOf(e),'entity-heading')[0].children.at(-1).children.at(-1);
 await open(rec(id('art',12),'Nobody'));
 assert.deepEqual([hint().textContent,last().textContent,inspector(e).children.map(cls)],['','Nothing in the collection is linked to Nobody yet.',['neighbourhood','neighbourhood-caption']],'no hint to pick a name; the sentence sits in the header, in view');
 await open(rec(id('trk',12),'A Track Without Profiles',[],{artist:'Someone',album:'Somewhere',basicDetails:true,reviewRequired:true}));
 assert.deepEqual([hint().textContent,byClass(mapOf(e),'entity-heading')[0].children.at(-1).children.slice(-2).map(n=>n.textContent)],['',['Artist and release profiles are not available for this track yet.','Artist details are being checked.']],'the record\'s own notes close its header too');
 const rules=cssRules();
 assert.match(rules.get('.neighbourhood-caption > span'),/flex:1;.*text-align:center;/,'the words change inside a box of fixed width: the button stays put');
 assert.ok(![...rules].some(([selector,body])=>/neighbourhood-caption/.test(selector)&&/justify-content:center/.test(body)),'no centring that moves the button with the words');
});

test('a pictured name clicked on the map glides into the middle, unless motion is reduced or the list shows',async()=>{
 const data=mapHood(),A=n=>id('art',n);data[A(101)]={entity:data[A(1)].included[0],included:[data[A(1)].included[3]]};
 const open=async options=>{
  const e=setup({journey:true,media:['(min-width:1100px)'],...options});mapBoxes(e);await flush();e.discovery=url=>data[url.split('/').pop()]||null;e.elements['explore-workspace'].append(inspector(e));
  e.visit('#explore/'+id('art',1));await flush();
  // As in a browser, the update runs once the old picture is captured, a frame later: here when the test says.
  e.calls=[];e.document.startViewTransition=fn=>{const call={};e.calls.push(call);const done=new Promise(resolve=>{call.run=()=>{fn();resolve();};});return {updateCallbackDone:done,ready:Promise.reject(new Error('Transition was aborted because of invalid state')),finished:done.then(()=>new Promise(resolve=>{call.finish=resolve;}))};};
  // A browser finds the clicked row's map node, and its picture there.
  const li=inspector(e).descendants().find(n=>n.localName==='li'&&n.dataset.id==='art_000000000101'),row=li.children[0],from=byClass(li,'picture')[0];
  li.dataset.ring='r1';row.closest=()=>li;from.isConnected=true;
  return {e,row,from};
 };
 let {e,row,from}=await open();
 follow(e,row);await flush();
 assert.deepEqual([e.calls.length,from.style.viewTransitionName,inspector(e).descendants().find(n=>n.localName==='h3').textContent],[1,'centre','Centre'],'the clicked picture is named before the snapshot; its own payload came, yet nothing paints before the update');
 e.calls[0].run();await flush();
 const title=inspector(e).descendants().find(n=>n.localName==='h3'),to=byClass(inspector(e),'picture')[0];
 assert.deepEqual([title.textContent,e.document.activeElement===title,to.style.viewTransitionName,Boolean(byClass(mapOf(e),'region').length)],['Near One',true,'centre',true],'the header paints inside the transition, then the body');
 e.calls[0].finish();await flush();
 assert.deepEqual([from.style.viewTransitionName,to.style.viewTransitionName],['',''],'both lose the name when it ends');
 ({e,row}=await open({media:['(min-width:1100px)','(prefers-reduced-motion: reduce)']}));follow(e,row);
 assert.deepEqual([e.calls.length,inspector(e).descendants().find(n=>n.localName==='h3').textContent],[0,'Near One'],'reduced motion: the hop swaps at once');
 ({e,row}=await open({storage:{getItem:()=>'list',setItem(){}}}));follow(e,row);
 assert.deepEqual([e.calls.length,inspector(e).descendants().find(n=>n.localName==='h3').textContent],[0,'Near One'],'the list: no glide');
 assert.match(cssRules().get('::view-transition-group(centre)'),/animation-duration:240ms; animation-timing-function:var\(--ease\);/);
 assert.match(cssRules().get('::view-transition-old(root), ::view-transition-new(root)'),/animation-duration:180ms;/);
});

test('an artist whose only links are its tracks lists them On the radio, and is not said to be linked to nothing',async()=>{
 const e=setup({journey:true});await flush();const T=n=>id('trk',n);
 e.discovery={entity:rec(id('art',1),'Only Tracks',[[T(1),'track'],[T(2),'track']]),included:[rec(T(1),'One',[],{durationMs:300000,playlists:[{code:'LIF',station:'Lost in Feelings'}]}),rec(T(2),'Two',[],{album:'An Album'})]};
 e.visit('#explore/'+id('art',1));await flush();
 const notes=byClass(inspector(e),'collection-note').map(textOf),radio=byClass(inspector(e),'region').find(r=>r.attrs['aria-labelledby']==='r-onRadio');
 assert.ok(!notes.some(n=>n.startsWith('Nothing in the collection')),'no sentence that says nothing is linked');
 assert.deepEqual(byClass(radio,'row').map(a=>a.children.slice(1).map(textOf)),[['OneLost\u00a0in\u00a0Feelings','5:00'],['TwoAn Album']]);
});

// Explore plan step 6: an artist's tracks on the radio by release, each with its stations in the rail's order and, when
// it is someone else's, its credit. song() is a track of the radio: its stations, its release, its artist, and the
// relation of the record's artist on it (none when on is null).
const song=(n,title,{stations=['Night in Motion'],release=null,artist='Maceo Plex',relation='primary',on=id('art',1),album='',date='',ms=300000}={})=>
 rec(id('trk',n),title,[...on?[[on,relation]]:[],...release?[[release,'release']]:[]],{artist,album,releaseDate:date,durationMs:ms,playlists:stations.map(station=>({code:'X',station}))});
// A record and its tracks, as the API sends them, with the releases at hand.
const tracked=(entity,tracks,releases=[])=>({entity:{...entity,connections:[...entity.connections,...tracks.map(t=>({id:t.id,relation:'track'}))]},included:[...tracks,...releases]});
const onRadioOf=e=>byClass(inspector(e),'region').find(r=>r.attrs['aria-labelledby']==='r-onRadio');
// Each item of On the radio: its release line or null, then its row's name, line and fact.
const radioRows=e=>onRadioOf(e).children.find(n=>n.localName==='ol').children.map(li=>[byClass(li,'release-line')[0]?.textContent??null,...['row-name','row-line','row-fact'].map(k=>byClass(li,k)[0]?.textContent??'')]);
const nb=s=>s.replace(/ /g,' ');

test('On the radio groups an artist\'s tracks by release, newest first, undated last, the record\'s order inside',async()=>{
 const e=setup({journey:true});await flush();const show=shower(e),R=n=>id('rel',n);
 const releases=[rec(R(1),'Old EP',[],{releaseDate:'2014-05-01'}),rec(R(2),'New EP',[],{releaseDate:'2020-07-23'}),rec(R(3),'No Date EP',[],{releaseDate:''}),rec(R(0),'Twin EP',[],{releaseDate:'2020-07-23'})];
 // In the record's order: Old, none, New, No Date, New, a release whose record is not at hand, dated by its track, and a
 // release of the same day as New EP, with a lower id, that comes later in the record.
 const tracks=[song(1,'Old One',{release:R(1),album:'Old EP',date:'2014-05-01'}),song(2,'Loose',{album:'Loose Album'}),song(3,'New One',{release:R(2),album:'New EP',date:'2020-07-23'}),
  song(4,'Undated',{release:R(3),album:'No Date EP'}),song(5,'New Two',{release:R(2),album:'New EP',date:'2020-07-23'}),song(6,'Elsewhere',{release:R(4),album:'Lost EP',date:'2017-03-03'}),song(7,'Twin',{release:R(0),album:'Twin EP',date:'2020-07-23'})];
 await show(tracked(rec(id('art',1),'Maceo Plex',[],{trackCount:7}),tracks,releases));
 byClass(onRadioOf(e),'text-button')[0].emit('click');
 const motion=nb('Night in Motion');
 assert.deepEqual(radioRows(e),[['New EP · 2020','New One',motion,'5:00'],[null,'New Two',motion,'5:00'],['Twin EP · 2020','Twin',motion,'5:00'],['Lost EP · 2017','Elsewhere',motion,'5:00'],['Old EP · 2014','Old One',motion,'5:00'],
  ['No Date EP','Undated',motion,'5:00'],[null,'Loose',motion,'5:00']],'newest first, two releases of one day in the record\'s order; a release not at hand takes its track\'s album and date; undated next; no release last, with no line');
 assert.deepEqual(onRadioOf(e).children.find(n=>n.localName==='ol').children.map(li=>li.children.map(cls)),[['release-line','row'],['row'],['release-line','row'],['release-line','row'],['release-line','row'],['release-line','row'],['row']],'a release line sits in the item of its first track, before its row');
 const rules=cssRules();
 assert.match(rules.get('.release-line'),/margin:var\(--s3\) 0 var\(--s1\); font-size:12px; line-height:1\.4; color:var\(--muted\); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;/,'the small muted words of a row, on one line, 4px over its row so the row\'s focus ring clears its letters');
 assert.match(rules.get('.region li:first-child > .release-line'),/margin-top:0/);
});

test('each track names its stations in the rail order',async()=>{
 const e=setup({journey:true});await flush();const show=shower(e);
 const record=()=>tracked(rec(id('art',1),'Maceo Plex'),[song(1,'Two Places',{stations:['Fontanna','Under the Sun']}),song(2,'Three Places',{stations:['Lost in Feelings','Etage 0','Night in Motion']})]);
 await show(record());
 assert.deepEqual(radioRows(e).map(r=>r[2]),[nb('Under the Sun')+', Fontanna',[nb('Night in Motion'),nb('Lost in Feelings'),nb('Etage 0')].join(', ')],'by stage, as the rail shows them');
 e.elements['explorer-close'].emit('click');press(e,'feeling');await show(record());
 assert.deepEqual(radioRows(e).map(r=>r[2]),[nb('Under the Sun')+', Fontanna',[nb('Night in Motion'),nb('Etage 0'),nb('Lost in Feelings')].join(', ')],'by feeling, the rail\'s new order');
});

test('a track names its credit only when the artist is not its main artist',async()=>{
 const e=setup({journey:true});await flush();const show=shower(e),A=id('art',1);
 const artist=()=>tracked(rec(A,'Maceo Plex'),[song(1,'Daliah (Maceo Plex remix)',{artist:'Melawati',relation:'remixer',stations:['Lost in Feelings']}),song(2,'Featured',{artist:'Maceo Plex feat. Maars'}),
  song(3,'Raw Credit (Maceo Plex remix)',{artist:'Arude;Vanice',relation:'remixer'}),song(4,'Spaced',{artist:'Timmy Vegas; Leighton Ashcroft',relation:'remixer'}),
  song(5,'Not Linked',{artist:'Someone Else',on:null}),song(6,'Not Linked Mine',{on:null})]);
 await show(artist());
 assert.deepEqual(radioRows(e).map(r=>r[2]),[nb('Lost in Feelings')+' · By Melawati',nb('Night in Motion'),nb('Night in Motion')+' · By Arude, Vanice',nb('Night in Motion')+' · By Timmy Vegas, Leighton Ashcroft',
  nb('Night in Motion')+' · By Someone Else',nb('Night in Motion')],'a remix says whose track it is; a joint credit where he is the main artist says nothing; a raw ";" reads as a list; with no relation, the names decide');
 await show(tracked(rec(id('rel',1),'Timeless Ibiza',[],{artist:'Various Artists'}),[song(7,'One',{artist:'Morttagua',on:null}),song(8,'Two',{artist:'Aaron Suiss',on:null})]));
 assert.deepEqual(radioRows(e).map(r=>r[2]),[nb('Night in Motion')+' · By Morttagua',nb('Night in Motion')+' · By Aaron Suiss'],'on a compilation every track names its artist');
 await show(tracked(rec(id('rel',2),'Conjure One EP',[],{artist:'Maceo Plex'}),[song(9,'Conjure Balearia',{on:null})]));
 assert.deepEqual(radioRows(e).map(r=>r[2]),[nb('Night in Motion')],'a track by the release\'s own artist names nobody');
 e.elements['explorer-close'].emit('click');e.setLanguage('de');await show(artist());
 assert.equal(radioRows(e)[0][2],nb('Lost in Feelings')+' · Von Melawati','in German, Von; the station keeps its name');
});

test('station names keep their spaces whole, so the line breaks only between names',async()=>{
 const e=setup({journey:true});await flush();const show=shower(e);
 await show(tracked(rec(id('art',1),'Maceo Plex'),[song(1,'Dhaboros',{stations:['Lost in Feelings','Night in Motion']})]));
 const line=radioRows(e)[0][2];
 assert.deepEqual([line,line.includes('Night in'),line.split(', ').length],['Night in Motion, Lost in Feelings',false,2],'a non-breaking space inside each name, a plain one only after the comma');
 const rules=cssRules();
 assert.match(rules.get('.region[data-key=onRadio] .row-line'),/white-space:normal/,'the stations wrap, never cut');
 assert.match(rules.get('.region[data-key=onRadio] .row-name'),/white-space:normal; display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2;/,'the name takes two lines at most');
});

test('one release, or a release record, has no release line',async()=>{
 const e=setup({journey:true});await flush();const show=shower(e),R=id('rel',1);
 await show(tracked(rec(id('art',1),'Maceo Plex'),[song(1,'Lonely Tribe',{release:R,date:'2019-07-22'}),song(2,'Lonely Tribe (Fango Remix)',{release:R,stations:[],album:'Lonely Tribe'})],[rec(R,'Lonely Tribe',[],{releaseDate:'2019-07-22'})]));
 assert.deepEqual(radioRows(e),[[null,'Lonely Tribe',nb('Night in Motion'),'5:00'],[null,'Lonely Tribe (Fango Remix)','Lonely Tribe','5:00']],'one release: no line, and a track no station plays names its album, as before');
 const own=id('rel',2);
 await show(tracked(rec(own,'Conjure One EP',[],{artist:'Maceo Plex',releaseDate:'2014-03-31'}),[song(3,'Conjure Balearia',{release:own}),song(4,'Conjure Dreams',{release:own})]));
 assert.deepEqual(radioRows(e).map(r=>r[0]),[null,null],'a release lists its own tracks with no line');
});

test('the same title on two releases shows twice',async()=>{
 const e=setup({journey:true});await flush();const show=shower(e),R=n=>id('rel',n);
 await show(tracked(rec(id('art',1),'Stimming'),[song(1,'Magdalena',{release:R(1),artist:'Stimming'}),song(2,'Magdalena',{release:R(2),artist:'Stimming'})],
  [rec(R(1),'Mesdames EP',[],{releaseDate:'2008-01-01'}),rec(R(2),'Saturday, I\'m in Love - Chapter.01',[],{releaseDate:'2016-01-01'})]));
 assert.deepEqual(radioRows(e).map(r=>r.slice(0,2)),[['Saturday, I\'m in Love - Chapter.01 · 2016','Magdalena'],['Mesdames EP · 2008','Magdalena']]);
});

test('a cut record says n of m, and one with none listed says so',async()=>{
 const e=setup({journey:true});await flush();const show=shower(e);
 const thirteen=Array.from({length:13},(_,i)=>song(i+1,'Track '+(i+1),{artist:'Arude'}));
 const arude=()=>tracked(rec(id('art',1),'Arude',[[id('rel',9),'release']],{trackCount:39}),thirteen,[rec(id('rel',9),'Some EP')]);
 await show(arude());
 const region=()=>onRadioOf(e),tail=()=>region().children.slice(-2).map(n=>[n.localName,cls(n),textOf(n)]);
 assert.deepEqual([textOf(region().children[0]),tail()],['On the radio 13 of 39',[['button','text-button','Show the 13 listed'],['p','collection-note','Not all of them are listed here yet.']]],'the count of all of them, a button that does not say all, and a note at the end');
 await show(tracked(rec(id('art',1),'Citizen Kain',[[id('rel',9),'release']],{trackCount:32}),[],[rec(id('rel',9),'Some EP')]));
 assert.deepEqual([textOf(region().children[0]),region().children.slice(1).map(n=>[n.localName,cls(n),textOf(n)])],['On the radio 0 of 32',[['p','collection-note','None of them are listed here yet.']]],'none listed: the heading and the note only');
 await show(tracked(rec(id('art',1),'Maceo Plex',[],{trackCount:2}),[song(1,'One'),song(2,'Two')]));
 assert.deepEqual([textOf(region().children[0]),byClass(region(),'collection-note').length],['On the radio 2',0],'a whole list: its number, and no note');
 e.elements['explorer-close'].emit('click');e.setLanguage('de');await show(arude());
 assert.deepEqual([textOf(region().children[0]),textOf(region().children.at(-2)),textOf(region().children.at(-1))],['Im Radio 13 von 39','Die 13 aufgeführten zeigen','Hier sind noch nicht alle aufgeführt.']);
 await show(tracked(rec(id('art',1),'Citizen Kain',[[id('rel',9),'release']],{trackCount:32}),[],[rec(id('rel',9),'Some EP')]));
 assert.deepEqual([textOf(region().children[0]),textOf(region().children.at(-1))],['Im Radio 0 von 32','Hier ist noch keiner davon aufgeführt.']);
});

test('a cut record with nothing else linked is not linked to nothing',async()=>{
 const e=setup({journey:true});await flush();const show=shower(e);
 const said=()=>byClass(inspector(e),'collection-note').map(textOf).filter(n=>n.startsWith('Nothing in the collection'));
 await show(tracked(rec(id('art',1),'Citizen Kain',[],{trackCount:32}),[]));
 assert.deepEqual([said(),textOf(onRadioOf(e).children[0])],[[],'On the radio 0 of 32'],'its tracks exist, they are only not listed here');
 await show(tracked(rec(id('art',1),'Nobody',[],{trackCount:0}),[]));
 assert.deepEqual([said().length,Boolean(onRadioOf(e))],[1,false],'with no track at all, the sentence stays');
});

test('Show all keeps the release lines and focuses the first new row',async()=>{
 const e=setup({journey:true});await flush();const show=shower(e),R=n=>id('rel',n);
 // Eight tracks on four releases of two tracks: the seventh opens the oldest release, so its item starts with a line.
 const tracks=[1,2,3,4,5,6,7,8].map(n=>song(n,'Track '+n,{release:R(Math.ceil(n/2))}));
 await show(tracked(rec(id('art',1),'Maceo Plex'),tracks,[1,2,3,4].map(n=>rec(R(n),'EP '+n,[],{releaseDate:(2024-n)+'-01-01'}))));
 assert.deepEqual(radioRows(e).map(r=>r.slice(0,2)),[['EP 1 · 2023','Track 1'],[null,'Track 2'],['EP 2 · 2022','Track 3'],[null,'Track 4'],['EP 3 · 2021','Track 5'],[null,'Track 6']]);
 const more=byClass(onRadioOf(e),'text-button')[0];assert.equal(more.textContent,'Show all 8');more.emit('click');
 const items=onRadioOf(e).children.find(n=>n.localName==='ol').children;
 assert.deepEqual(radioRows(e).slice(6).map(r=>r.slice(0,2)),[['EP 4 · 2020','Track 7'],[null,'Track 8']],'the rest comes below, its release line with it');
 assert.deepEqual([e.document.activeElement===byClass(items[6],'row')[0],cls(items[6].children[0])],[true,'release-line'],'focus lands on the row link, not on the release line before it');
});

test('a label gets no On the radio',async()=>{
 const e=setup({journey:true});await flush();const show=shower(e),A=n=>id('art',n);
 await show({entity:rec(id('lab',1),'BeatFreak Recordings',[[A(1),'artist'],[A(2),'artist']],{trackCount:57}),included:[rec(A(1),'One',[],{trackCount:1}),rec(A(2),'Two',[],{trackCount:2})]});
 assert.deepEqual([Boolean(onRadioOf(e)),byClass(inspector(e),'region').length>0],[false,true],'a label counts tracks its record does not hold: no list, no note');
 await show({entity:rec(id('trk',1),'A Track',[[A(1),'primary']],{artist:'One',trackCount:3,playlists:[{code:'X',station:'Fontanna'}]}),included:[rec(A(1),'One',[],{trackCount:1})]});
 assert.equal(Boolean(onRadioOf(e)),false,'nor does a track');
});

test('the 10 s limit of a hop holds until the naming requests settle, also after the deadline painted the body',async()=>{
 const e=setup({journey:true});await flush();const data=hood();let release;
 e.discovery=url=>{const key=url.split('/').pop();return key==='art_000000000101'?new Promise(resolve=>{release=()=>resolve(data[key]);}):data[key]||null;};
 e.visit('#explore/art_000000000001');await flush();e.fire(2500);await flush();
 const naming=e.discoveryRequests.find(r=>r.url.endsWith('art_000000000101'));
 assert.deepEqual([Boolean(byClass(inspector(e),'regions').length),naming.signal.aborted],[true,false],'the body painted while a naming request is still out');
 e.fire(10000);assert.ok(naming.signal.aborted,'a stalled request is dropped at 10 s');
 const again=setup({journey:true});await flush();again.discovery=e.discovery;
 again.visit('#explore/art_000000000001');await flush();again.fire(2500);await flush();release();await flush();
 assert.ok(![...again.timers.values()].some(t=>t.delay===10000),'once every request settled, no limit is left waiting');
});

test('a track whose credited artists are not at hand names its artist and release in its line',async()=>{
 const e=setup({journey:true});await flush();
 e.discovery=url=>url.endsWith('trk_000000000077')?{entity:rec('trk_000000000077','Lonely',[['art_000000000077','primary']],{artist:'Someone',album:'Somewhere',durationMs:301000}),included:[]}:null;
 e.visit('#explore/trk_000000000077');await flush();
 assert.deepEqual([textOf(byClass(inspector(e),'entity-line')[0]),byClass(inspector(e),'row').length],['Someone · Somewhere · 5:01',0],'its credited artist failed to load: the line names who made it, since Made by cannot');
});

test('from 1100px wide a stage is a map too: its top names on the left, the stages it shares tracks with on the right, counts beside the names',async()=>{
 const e=setup({journey:true,media:['(min-width:1100px)']});mapBoxes(e);await flush();e.discovery={items:[]};
 const content=await stagePlace(e,'#statistics/bermuda-day'),map=byClass(content,'neighbourhood')[0],nodes=nodesOf(map),at=key=>nodes.find(n=>n.dataset.id===key);
 assert.deepEqual([content.children.map(cls),map.children.map(cls)],[['neighbourhood','neighbourhood-caption','regions'],['map-lines','entity-heading','region','region','region']],'the same map as a record\'s, its caption, then Release years and Most played under it');
 assert.deepEqual([['artist:Jasper Tygner','label:Diynamic Music','fontanna','artist:Voilaaa'].map(key=>[at(key).dataset.side,at(key).dataset.ring]),byClass(map,'map-lines')[0].children.length],[[['left','r1'],['left','r1'],['right','r1'],['left','r2']],nodes.filter(n=>!n.hidden).length],'three pictured names a side, the rest plain, a line to each');
 const starts=m=>[...new Set(byClass(m,'map-lines')[0].children.map(path=>path.attrs.d.split('C')[0]))];
 assert.deepEqual(starts(map),['M582 304','M718 304'],'its lines start at the sides of its photo');
 // All stages has no photo: its lines start beside its words, level with their middle, never inside a line of them.
 const P=e.Element.prototype,base=P.getBoundingClientRect;P.getBoundingClientRect=function(){return this.children.some(n=>n.localName==='h3')?{left:490,top:194,width:320,height:78,right:810,bottom:272}:base.call(this);};
 await stagePlace(e,'#statistics/radio',{scope:'radio'});P.getBoundingClientRect=base;
 assert.deepEqual(starts(byClass(content,'neighbourhood')[0]),['M482 233','M818 233']);
 const rules=cssRules();
 assert.match(rules.get('#music-content .neighbourhood .row-fact'),/position:static; width:auto; height:auto; overflow:visible; clip-path:none;/,'the counts stay beside the names');
 assert.match(rules.get('#music-content .neighbourhood'),/height:clamp\(480px, calc\(100dvh - var\(--bar\) - var\(--top\) - 72px - 44px - 2 \* var\(--s4\)\), 700px\);/,'shorter by the stage row above it, so its caption ends above the player bar');
 byClass(content,'neighbourhood-caption')[0].children.at(-1).emit('click');
 assert.deepEqual([content.children.map(cls),byClass(content,'neighbourhood-caption')[0].children.at(-1).textContent,e.document.activeElement===byClass(content,'neighbourhood-caption')[0].children.at(-1)],[['entity-heading','neighbourhood-caption','regions'],'Show as a map',true],'the list, from the numbers shown, with its switch');
});

test('each name on the line takes half the line at most and is cut at its end',async()=>{
 const e=setup({journey:true});await flush();
 const titles={art_000000000071:'Abandoned Soul (Recondite Remix)',lab_000000000072:'Watergate Records',rel_000000000073:'Watergate Records 2008-2018',art_000000000074:'Tale of Us'};
 e.discovery=url=>{const id=url.split('/').pop();return {entity:{id,type:'artist',title:titles[id]},included:[]};};
 for(const id of Object.keys(titles)){routeTo(e,'#explore/'+id);await flush();}
 e.history.go(-1);await flush();
 const line=byClass(inspector(e),'entity-trail')[0];
 assert.deepEqual(line.children.map(a=>textOf(a)),['Watergate Records','Tale of Us'],'two names, whole in the page: the page cuts them, not the script');
 assert.deepEqual([e.observers.some(o=>o.targets.includes(line)),line.descendants().filter(n=>n.style?.maxWidth).length],[false,0],'nothing watches the line or sets a width on it');
 const rules=cssRules();
 assert.match(rules.get('.entity-trail a'),/min-width:0; max-width:50%;/,'each link takes half the line at most, and may shrink below its name');
 assert.match(rules.get('.entity-trail a > span'),/^\s*overflow:hidden; text-overflow:ellipsis;\s*$/,'the name is cut at its end, the arrow stays');
 assert.match(rules.get('.entity-trail a[data-step="1"]'),/margin-left:auto;/,'a lone forward link stands at the end of the line');
 assert.match(rules.get('.neighbourhood .entity-trail'),/justify-content:center; gap:var\(--s5\);/,'on the map the two stand centred over the picture');
 assert.match(rules.get('.neighbourhood .entity-trail a[data-step="1"]'),/^\s*margin-left:0;\s*$/,'and a lone forward link stays in the middle');
 assert.deepEqual(['.entity-trail > *','.entity-trail > :is(a, [aria-current])','.entity-trail [aria-current]'].map(k=>rules.has(k)),[false,false,false],'the Path\'s step rules are gone');
});

test('a short map gives each band the room its pictured names need, so no name ends below the map',async()=>{
 // Nine similar artists, three of them pictured, then three that worked with the record, all three pictured.
 const A=n=>id('art',n),similar=Array.from({length:9},(_,n)=>A(101+n)),worked=Array.from({length:3},(_,n)=>A(301+n));
 for(const [height,rings] of [[520,[['r1',false],['r1',false],['r1',false]]],[480,[['r1',false],['r1',false],['r2',true]]]]){
  const e=setup({journey:true,media:['(min-width:1100px)']});mapBoxes(e);e.mapHeight=height;await flush();
  e.discovery={entity:rec(A(1),'Centre',[...similar.map(s=>[s,'similar']),...worked.map(w=>[w,'collaboration'])]),included:[...similar.map((s,n)=>rec(s,'Similar '+n,[],{trackCount:30-n})),...worked.map((w,n)=>rec(w,'Worker '+n,[],{trackCount:9-n}))]};
  e.visit('#explore/'+A(1));await flush();
  const nodes=nodesOf(mapOf(e)),half=n=>n.dataset.ring==='r1'?22:16,shown=nodes.filter(n=>!n.hidden);
  assert.deepEqual(shown.filter(n=>px(n.style.top)+half(n)>height).map(n=>n.dataset.id),[],'every name ends inside the '+height+'px map, above the caption');
  assert.ok(shown.every(n=>px(n.style.top)-half(n)>=0),'and none starts above it');
  assert.deepEqual(worked.map(w=>nodes.find(n=>n.dataset.id===w)).map(n=>[n.dataset.ring,n.hidden]),rings,height===520?'520px holds six pictures: the second band takes what its three need from the first':'480px cannot: the lowest of the second band shows as a plain name, which has no room either');
 }
});

test('a region name pushed past the edge by what it clears stays inside the map',async()=>{
 const e=setup({journey:true,media:['(min-width:1100px)']});mapBoxes(e);await flush();
 // A label with one artist: it stacks in the middle of the side, beside the header, and its region name, wide, with it.
 e.discovery={entity:rec(id('lab',1),'Label',[[id('art',1),'artist']]),included:[rec(id('art',1),'Only Artist',[],{trackCount:3})]};
 const heading=()=>byClass(mapOf(e),'region')[0].children[0];
 const P=e.Element.prototype,base=P.getBoundingClientRect;P.getBoundingClientRect=function(){return this.localName==='h4'?{left:0,top:0,width:380,height:26,right:380,bottom:26}:base.call(this);};
 e.visit('#explore/'+id('lab',1));await flush();
 // cx 650: the header reaches 260 from the middle, so the name clears it at 276, and 276 + 380 passes the edge.
 assert.deepEqual([px(heading().style.left)-380,heading().dataset.side],[0,'left'],'it ends on the map\'s edge, not 6px past it');
});

test('a name in focus keeps focus when the map lays out again, and the title takes it when the map drops the name',async()=>{
 const e=setup({journey:true,media:['(min-width:1100px)']});mapBoxes(e);await flush();const data=mapHood();e.discovery=url=>data[url.split('/').pop()]||null;
 e.visit('#explore/'+id('art',1));await flush();
 const map=mapOf(e),watch=e.observers.find(o=>o.targets.includes(map)),release=nodesOf(map).find(n=>n.dataset.id===id('rel',1)),row=release.children[0];
 // As a browser does, a layout read while the focused name's region is hidden drops focus to the page.
 const P=e.Element.prototype,base=P.getBoundingClientRect;
 P.getBoundingClientRect=function(){let n=e.document.activeElement;while(n&&n!==e.document.body){if(n.hidden){e.document.activeElement=e.document.body;break;}n=n.parent;}return base.call(this);};
 row.closest=()=>release;row.focus();watch.fn();
 assert.deepEqual([release.dataset.side,release.hidden,e.document.activeElement===row,row.focusOptions?.preventScroll],['right',false,true,true],'the right side is laid out last, yet its name gets focus back, without a scroll');
 const far=nodesOf(map).find(n=>n.dataset.id===id('art',201));far.children[0].closest=()=>far;far.children[0].focus();e.mapWidth=600;watch.fn();
 assert.deepEqual([far.hidden,e.document.activeElement===inspector(e).descendants().find(n=>n.localName==='h3')],[true,true],'a name the map drops hands focus to the title, never to the page');
});

test('the network back, a shown page and the lock screen try again at once, and start nothing by themselves',async()=>{
 const e=setup();await flush();const waits=()=>[...e.timers.values()].map(t=>t.delay).filter(d=>d!==3000&&d!==6000);
 e.window.emit('online');e.document.emit('visibilitychange');e.actions.pause();e.window.emit('offline');
 await flush();assert.equal(e.audio.calls.length,0,'a first visit plays nothing');assert.deepEqual(waits(),[],'and waits for nothing');
 e.click();e.playing();e.error();assert.deepEqual(waits(),[1000]);
 assert.equal(e.mediaSession.playbackState,'playing','the lock screen offers pause while the radio tries');
 e.fire(1000);e.error();assert.deepEqual(waits(),[2000]);
 const calls=e.audio.calls.length;e.window.emit('online');
 assert.equal(e.audio.calls.length,calls+1,'online connects now');assert.deepEqual(waits(),[20000],'the waiting try is gone');
 e.error();assert.deepEqual(waits(),[1000],'and the ladder starts again');
 e.document.emit('visibilitychange');assert.equal(e.audio.calls.length,calls+2,'a page shown again connects now');
 e.error();e.actions.play();assert.equal(e.audio.calls.length,calls+3,'so does play on the lock screen');
 e.playing();e.actions.play();e.window.emit('online');e.document.emit('visibilitychange');assert.equal(e.audio.calls.length,calls+3,'a playing radio is left alone');
 e.audio.readyState=2;e.audio.emit('waiting');assert.equal(e.elements['playback-status'].textContent,'Buffering…');
 e.document.emit('visibilitychange');assert.equal(e.audio.calls.length,calls+3,'a stall waits for its watchdog when the page is shown');
 e.window.emit('online');assert.equal(e.audio.calls.length,calls+4,'but a stall tries again once the network is back');
 assert.equal(e.elements['playback-status'].textContent,'Reconnecting…','and says so');
 e.error();e.document.hidden=true;e.document.emit('visibilitychange');assert.equal(e.audio.calls.length,calls+4,'hiding the page tries nothing');e.document.hidden=false;
 e.click();e.window.emit('online');e.document.emit('visibilitychange');assert.equal(e.audio.calls.length,calls+4,'pause stays paused');assert.deepEqual(waits(),[]);
 assert.equal(e.mediaSession.playbackState,'paused','and the lock screen offers play again');
});

test('without a network the player says so, in both languages, and keeps trying',async()=>{
 const e=setup();await flush();e.click();e.playing();
 e.run('navigator.onLine=false');e.window.emit('offline');assert.equal(e.elements['playback-status'].textContent,'Playing','a radio still playing its buffer says nothing yet');
 e.error();assert.equal(e.elements['playback-status'].textContent,'Offline. Waiting for the network…');assert.equal(e.elements.player.dataset.state,'retrying');
 e.fire(1000);assert.deepEqual([e.elements['playback-status'].textContent,e.elements.player.dataset.state],['Offline. Waiting for the network…','retrying'],'a new try keeps the offline words');
 e.audio.emit('waiting');assert.equal(e.elements['playback-status'].textContent,'Offline. Waiting for the network…','and so does its waiting');
 e.setLanguage('de');assert.equal(e.elements['playback-status'].textContent,'Offline. Warte auf das Netz…');
 e.run('navigator.onLine=true');e.window.emit('online');assert.equal(e.elements['playback-status'].textContent,'Neu verbinden…');
 e.error();e.run('navigator.onLine=false');e.window.emit('offline');assert.equal(e.elements['playback-status'].textContent,'Offline. Warte auf das Netz…','the words follow the network while it waits');
 assert.deepEqual([...e.timers.values()].map(t=>t.delay).filter(d=>d!==3000&&d!==6000),[1000],'the ladder keeps running: a browser can call itself offline wrongly');
});

test('a preview pauses a reconnecting radio, and its end brings the radio back',async()=>{
 const e=setup({journey:true});await flush();
 e.discovery=()=>({entity:{id:'trk_0123456789ab',type:'track',title:'T',previewUrl:'/api/discovery/preview/trk_0123456789ab'},included:[]});
 e.elements['preview-audio'].play=async()=>{};
 e.click();e.playing();e.error();assert.equal(e.elements.player.dataset.state,'retrying');
 e.visit('#explore/trk_0123456789ab');await flush();
 const toggle=()=>e.elements['entity-inspector'].querySelector('.preview-toggle');
 toggle().emit('click');await flush();
 assert.deepEqual([e.window.Pavoia.getState().wanted,e.timers.size?[...e.timers.values()].map(t=>t.delay):[]],[false,[]],'one sound at a time: no try runs under the preview');
 e.window.emit('online');assert.equal(e.audio.src,undefined,'nor comes back with the network');
 toggle().emit('click');await flush();
 assert.deepEqual([e.window.Pavoia.getState().wanted,e.audio.src,e.elements['playback-status'].textContent],[true,'/stream/palac-feel.mp3','Connecting…'],'the preview ends and the radio connects again');
});

test('a station change during a reconnect leaves the ladder of the station heard; play on the station shown connects it from the first step',async()=>{
 const e=setup();await flush();const waits=()=>[...e.timers.values()].map(t=>t.delay).filter(d=>d!==3000&&d!==6000);
 e.click();e.playing();e.error();e.fire(1000);e.error();assert.equal(e.elements['playback-status'].textContent,'Reconnecting…');
 e.change('03');
 assert.deepEqual([e.audio.src,e.elements.player.dataset.state,e.elements['playback-status'].textContent,waits()],[undefined,'retrying','Reconnecting…',[2000]],'a station change leaves the ladder where it was');
 e.fire(2000);assert.equal(e.audio.src,'/stream/palac-feel.mp3','its next try connects the station heard, not the station shown');
 e.error();e.window.emit('online');assert.equal(e.audio.src,'/stream/palac-feel.mp3','so does the network coming back');
 e.error();e.document.emit('visibilitychange');assert.equal(e.audio.src,'/stream/palac-feel.mp3','and the page shown again');
 e.error();e.elements['play-shown'].emit('click');
 assert.deepEqual([e.audio.src,e.elements.player.dataset.state,e.elements['playback-status'].textContent],['/stream/palac-dance.mp3','connecting','Connecting…'],'play on the station shown is a first try');
 e.error();assert.deepEqual([waits(),e.elements['playback-status'].textContent],[[1000],'Reconnecting…'],'and its ladder starts again');
});

test('a start the browser blocks during a reconnect stops trying and asks for play',async()=>{
 const e=setup();await flush();e.click();e.playing();e.error();e.fire(1000);
 e.audio.calls.at(-1).reject(Object.assign(new Error(),{name:'NotAllowedError'}));await flush();
 assert.deepEqual([e.elements['playback-status'].textContent,e.window.Pavoia.getState().wanted,e.timers.size],['Press play to start',false,0]);
 e.window.emit('online');e.document.emit('visibilitychange');assert.equal(e.audio.src,undefined);
});

// Step 3: the page keys, the shortcuts, the install icon and the share preview.
const digit=(e,n,extra={})=>e.key('Digit'+n,undefined,{key:String(n),...extra});
const keysMarkup=()=>{const html=web('index.html');return html.slice(html.indexOf('<details id="keys"'),html.indexOf('</details>')+10);};

test('1 to 9 show the station at that place on screen; with the explorer open and the radio on, they move the music',async()=>{
 const e=setup();await flush();const stage=()=>e.window.Pavoia.getState().stage,length=e.entries().length;
 digit(e,5);assert.equal(stage(),'etage-zero','5 is the fifth station by stage');
 assert.deepEqual([e.window.Pavoia.getState().wanted,e.audio.calls.length,e.audio.src],[false,0,undefined],'a paused radio stays paused and asks for no stream');
 assert.deepEqual([e.url(),e.entries().length],['/?station=etage-zero',length],'the address names it in place, as the rail does');
 e.key('Numpad1',undefined,{key:'1'});assert.equal(stage(),'bermuda-day','the keypad gives the same key');
 digit(e,0);assert.equal(stage(),'bermuda-day','0 names no station');
 e.click();const calls=e.audio.calls.length,viewing=()=>e.window.Pavoia.getState().viewing;
 digit(e,3);assert.deepEqual([viewing(),stage(),e.audio.calls.length,e.audio.src],['palac-dance','bermuda-day',calls,'/stream/bermuda-day.mp3'],'a playing radio stays on the station heard, and asks for no stream');
 digit(e,3);assert.equal(e.audio.calls.length,calls,'its own number changes nothing');
 e.elements.explorer.open=true;
 digit(e,3);assert.deepEqual([stage(),e.audio.calls.length,e.audio.src],['palac-dance',calls+1,'/stream/palac-dance.mp3'],'with the explorer open, the number of the station shown moves the music there, in one connection');
 digit(e,3);assert.equal(e.audio.calls.length,calls+1,'then its own number changes nothing');
 digit(e,4);assert.deepEqual([stage(),e.audio.calls.length,e.audio.src],['palac-feel',calls+2,'/stream/palac-feel.mp3'],'and another number moves the music to its station');
 e.elements.explorer.open=false;
 press(e,'feeling');digit(e,2);assert.deepEqual([viewing(),stage()],['fontanna','palac-feel'],'By feeling, 2 is the second station of that order');
 digit(e,6);assert.equal(viewing(),'palac-feel','and 6 the sixth');
 e.click();e.location.hash='#bus';e.window.emit('hashchange');await flush();const before=e.urls().length;
 digit(e,9);
 assert.deepEqual([stage(),e.urls().length,e.document.body.getAttribute('data-bus'),e.window.Pavoia.getState().wanted,e.audio.src],['essentials',before+1,null,false,undefined],'from the Bus a number leaves it with one entry, as the rail does, and stays paused');
});

test('the page keys wait while typing, with a modifier, with the stations sheet open, and when an earlier handler took the key',async()=>{
 const e=setup({journey:true,storage:{getItem:key=>key==='pavoia-volume'?'0.6':null,setItem(){}}});await flush();
 e.elements.keys.append(Object.assign(new e.Element(),{localName:'summary'}));
 const now=()=>[e.window.Pavoia.getState().stage,e.audio.volume,Boolean(e.elements.keys.open)],before=now();
 const tries=(why,target,extra={})=>{for(const key of ['5','m','?'])e.key(key==='?'?'Slash':key==='m'?'KeyM':'Digit'+key,target,{key,...extra});assert.deepEqual(now(),before,why);};
 for(const [target,why] of [[control('input',{type:'search'}),'search field'],[control('textarea'),'textarea'],[control('select'),'select'],[control('div',{contenteditable:''}),'editable text']])tries(why,target);
 for(const extra of [{ctrlKey:true},{metaKey:true},{altKey:true}])tries(JSON.stringify(extra),undefined,extra);
 tries('a held key',undefined,{repeat:true});
 tries('a key that composes text',undefined,{isComposing:true});
 e.openDialog={};tries('the modal stations sheet keeps its keys');e.openDialog=null;
 const took=event=>event.preventDefault();e.document.addEventListener('keydown',took);
 tries('a key an earlier handler took, such as the Index type-ahead');
 e.document.removeEventListener('keydown',took);
 for(const [target,why] of [[control('input',{type:'range'}),'the volume slider'],[control('input',{type:'radio'}),'a station'],[control('button',{},true),'a button']]){digit(e,5,{target});assert.equal(e.window.Pavoia.getState().stage,'etage-zero',why+' leaves the number to the page');digit(e,4);}
 digit(e,5);e.key('KeyM',undefined,{key:'M'});e.key('Slash',undefined,{key:'?'});assert.deepEqual(now(),['etage-zero',0,true],'with none of these, each key acts');
});

test('M turns the sound off and back on where the volume shows, stores nothing, and does nothing where the device sets the level',async()=>{
 const query='(max-width:760px), (pointer:coarse)',saved={'pavoia-volume':'0.6'},writes=[],storage={getItem:key=>saved[key] ?? null,setItem(key,value){writes.push(key);saved[key]=String(value);}};
 const e=setup({journey:true,storage});await flush();const slider=e.elements.volume,m=()=>e.key('KeyM',undefined,{key:'m'});
 assert.equal(e.audio.volume,0.6);assert.equal(slider.getAttribute('aria-valuetext'),null,'a level above 0 says no word');
 m();assert.deepEqual([Number(slider.value),e.audio.volume,slider.getAttribute('aria-valuetext')],[0,0,'Muted'],'M puts the slider to 0 and says Muted');
 e.setLanguage('de');assert.equal(slider.getAttribute('aria-valuetext'),'Stumm','in German too');
 saved['pavoia-volume']='0.9';
 e.key('KeyM',undefined,{key:'M'});assert.deepEqual([Number(slider.value),e.audio.volume,slider.getAttribute('aria-valuetext')],[0.6,0.6,null],'M again brings back the level it kept, not the one another tab stored, and the word goes');
 assert.deepEqual(writes.filter(key=>key==='pavoia-volume'),[],'mute writes no storage');
 m();slider.value='0.5';slider.emit('input');
 assert.deepEqual([slider.getAttribute('aria-valuetext'),e.audio.volume],[null,0.5],'a hand move of the slider after a mute takes the word away');
 m();slider.value='0';slider.emit('input');m();assert.equal(Number(slider.value),1,'a hand on the slider forgets the kept level: the stored 0 gives way to full');
 saved['pavoia-volume']='0.4';slider.value='0.4';slider.emit('input');m();slider.value='0.3';slider.emit('input');slider.value='0';slider.emit('input');saved['pavoia-volume']='0.4';m();
 assert.equal(Number(slider.value),0.4,'with no kept level, M brings the stored one back');
 assert.match(web('index.html'),/<input id="volume" type="range"[^>]* aria-keyshortcuts="M">/,'the slider names its key, and no new button is added');
 const phone=setup({journey:true,storage:{getItem:key=>key==='pavoia-volume'?'0.6':null,setItem(){}},media:[query]});await flush();
 phone.key('KeyM',undefined,{key:'m'});assert.deepEqual([phone.audio.volume,phone.elements.volume.getAttribute('aria-valuetext')],[1,null],'where the slider is hidden, M does nothing');
 phone.queries.get(query).change(false);assert.equal(phone.audio.volume,0.6,'and a wider window finds the slider where it was');
 const denied=()=>{throw new Error('Storage denied');};
 const blocked=setup({journey:true,storage:{getItem:denied,setItem:denied}});await flush();blocked.elements.volume.value='0.4';blocked.elements.volume.emit('input');
 blocked.key('KeyM',undefined,{key:'m'});assert.equal(blocked.audio.volume,0,'without storage, M still mutes');
 blocked.key('KeyM',undefined,{key:'m'});assert.deepEqual([Number(blocked.elements.volume.value),blocked.audio.volume],[0.4,0.4],'and brings back the level it kept');
});

test('? opens the shortcuts under the roots button, in both languages, only while the explorer is closed',async()=>{
 const e=setup();await flush();const keys=e.elements.keys,summary=Object.assign(new e.Element(),{localName:'summary'});keys.append(summary);
 const ask=()=>e.key('Slash',undefined,{key:'?',shiftKey:true});
 ask();assert.deepEqual(JSON.parse(JSON.stringify([keys.open,e.document.activeElement===summary,keys.scrolled,summary.focusOptions])),[true,true,{block:'nearest',behavior:'smooth'},{preventScroll:true}],'? opens the shortcuts, brings them into view and focuses their summary');
 ask();assert.deepEqual([keys.open,e.document.activeElement===summary],[false,true],'? again closes them, and focus stays on the summary');
 // Chromium marks the focus a script gives during a keydown :focus-visible, as if the keyboard had reached the summary.
 Object.assign(summary,{tag:'summary',focusVisible:true,matches:selector=>cssMatches(selector,summary),focus(options){e.document.activeElement=this;this.focusOptions=options;e.focus(this);}});
 ask();ask();assert.deepEqual([e.key('Space',summary).prevented,keys.open,e.window.Pavoia.getState().wanted],[true,false,true],'after ? and ?, Space plays, since ? and not Tab focused the summary');
 e.key('Space',summary);ask();assert.deepEqual([e.key('Space',summary).prevented,keys.open,e.window.Pavoia.getState().wanted],[true,true,true],'with the list open, Space still plays');
 e.key('Space',summary);e.focus(summary);assert.equal(e.key('Space',summary).prevented,false,'a summary Tab reached keeps its own Space');ask();
 e.elements.explorer.open=true;ask();assert.equal(keys.open,false,'the open explorer covers them, so ? does nothing');
 const still=setup({media:['(prefers-reduced-motion: reduce)']});await flush();still.elements.keys.append(Object.assign(new still.Element(),{localName:'summary'}));
 still.key('Slash',undefined,{key:'?'});assert.deepEqual({...still.elements.keys.scrolled},{block:'nearest',behavior:'auto'},'reduced motion jumps');
 const html=web('index.html'),block=keysMarkup();
 assert.ok(html.indexOf(block)>html.indexOf('<div class="roots-ground">')&&html.indexOf(block)<html.indexOf('</footer>'),'the shortcuts sit in the footer, after the roots');
 assert.match(block,/^<details id="keys" class="keys"><summary data-copy="keysTitle">Keyboard shortcuts<\/summary>\s*<dl>/,'a native disclosure over a list of terms');
 assert.deepEqual([...block.matchAll(/<dt(?: class="key-mute")?><kbd(?: data-copy="(\w+)")?>([^<]+)<\/kbd><\/dt><dd(?: class="key-mute")? data-copy="(\w+)">/g)].map(m=>[m[1]||m[2],m[3]]),
  [['space','keySpace'],['keyArrowsName','keyArrows'],['1–9','keyNumbers'],['M','keyMute'],['/','keyFilter'],['Esc','keyClose'],['?','keyHelp']],'each key, then what it does');
 const sliderGone='(max-width:760px), (pointer:coarse)';
 assert.ok(block.includes('<dt class="key-mute"><kbd>M</kbd></dt><dd class="key-mute" data-copy="keyMute">')&&web('style.css').includes(`@media ${sliderGone} { .keys .key-mute { display:none; } }`)&&web('journey.js').includes(`matchMedia('${sliderGone}')`),'the M row goes where the volume slider goes, by the same query');
 const words=e.run('words'),copied=[...block.matchAll(/data-copy="(\w+)"/g)].map(m=>m[1]);
 assert.deepEqual(copied.map(key=>[words.en[key],words.de[key]]),[
  ['Keyboard shortcuts','Tastenkürzel'],['Space','Leertaste'],['Play or pause','Abspielen oder pausieren'],['Left and right arrows','Pfeiltasten links und rechts'],
  ['Show the previous or next station','Vorherigen oder nächsten Sender zeigen'],['Show the station at that place in the list','Den Sender an dieser Stelle der Liste zeigen'],['Sound off, and on again','Ton aus und wieder an'],
  ['In the Index: filter the names','Im Index: Namen filtern'],['Back to listening','Zurück zum Radio'],['Show or hide these shortcuts','Diese Kürzel zeigen oder verbergen']],'every words in English and German');
 const rules=cssRules();
 assert.match(rules.get('.stage-notes summary, .keys summary'),/min-height:44px; line-height:44px; font-size:12px; color:var\(--soft\)/,'the summary is the Statistics notes\' quiet 12px button');
 assert.match(rules.get('.keys kbd'),/font:11px\/1\.4 var\(--mono\); color:var\(--muted\)/,'a key is a mono fact');
 assert.match(rules.get('.keys dd'),/font-size:14px; line-height:1\.4; color:var\(--soft\)/,'what it does reads 14px, and a wrapped line keeps the text style\'s height');
 assert.match(rules.get('.keys dt'),/font-size:11px; line-height:1\.4/,'so does a wrapped key name');
 assert.doesNotMatch([...rules].filter(([selector])=>selector.includes('.keys')).map(([,d])=>d).join(''),/border|background/,'no border, no background');
 assert.match(cssRules('(hover:none) and (pointer:coarse)').get('.keys:not([open]):not(:focus-within)'),/display:none/,'a touch screen sees nothing new until ? opens it, and a closed list keeps a focused summary');
});

test('the head names the manifest, the icons and one share preview; the manifest uses the page\'s ink',()=>{
 const html=web('index.html'),head=html.slice(0,html.indexOf('</head>')),manifest=JSON.parse(web('manifest.webmanifest'));
 const ink=/--ink:\s*(#[0-9a-f]{6})/.exec(web('style.css'))[1];
 assert.deepEqual([manifest.background_color,manifest.theme_color,/<meta name="theme-color" content="([^"]+)">/.exec(head)[1]],[ink,ink,ink],'the manifest and the theme colour are the page\'s ink');
 assert.deepEqual([manifest.id,manifest.name,manifest.short_name,manifest.start_url,manifest.scope,manifest.display],['/','Pavoia Radio','Pavoia','/','/','standalone']);
 assert.deepEqual(manifest.icons.map(icon=>[icon.src,icon.sizes,icon.type,icon.purpose||'any']),[['assets/icon-192.png','192x192','image/png','any'],['assets/icon-512.png','512x512','image/png','any'],['assets/icon-maskable-512.png','512x512','image/png','maskable']]);
 assert.ok(!('shortcuts' in manifest)&&!('serviceworker' in manifest),'no shortcuts, no service worker');
 assert.match(head,/<link rel="icon" href="assets\/gaende-icon-white.svg" type="image\/svg\+xml">\s*<link rel="manifest" href="manifest.webmanifest">\s*<link rel="apple-touch-icon" href="assets\/apple-touch-icon.png">/,'the manifest and the touch icon follow the favicon');
 // The CI test checks out without LFS, so only the files' presence is checked, never their bytes.
 for(const path of [...manifest.icons.map(icon=>icon.src),'assets/apple-touch-icon.png'])assert.ok(existsSync(resolve(__dirname,'../web/'+path)),path+' is in web/');
 const meta=[...head.matchAll(/<meta (name|property)="([^"]+)" content="([^"]*)">/g)].map(m=>[m[2],m[3]]).filter(([key])=>key!=='viewport'&&key!=='theme-color');
 assert.deepEqual(meta,[['description','So it never ends. A personal selection by Gaende.'],['og:type','website'],['og:site_name','Pavoia Radio'],['og:title','Pavoia Radio'],
  ['og:description','So it never ends. A personal selection by Gaende.'],['og:url','https://pavoia.gaende.box.ca/'],['og:image','https://pavoia.gaende.box.ca/photos/hero-night.jpg'],
  ['og:image:width','2000'],['og:image:height','1333'],['og:image:alt','Pałac at night, a crowd dancing in blue light'],['twitter:card','summary_large_image']],'one description, one preview, one picture');
 for(const [key,value] of meta.filter(([key])=>key==='og:url'||key==='og:image')){
  const url=new URL(value);assert.equal(url.protocol,'https:',key+' is absolute https');
  assert.ok(existsSync(resolve(__dirname,'../web/'+(url.pathname==='/'?'index.html':url.pathname.slice(1)))),key+' points to a file the site serves');
 }
});

// The Index, step 2: the rail, type-ahead, the mark in the address and the lit stations. The Index as a browser lays it
// out: the explorer at the window's top, 700 px high, the stage bar sticking 72 px down and 61 px high, each section
// 1000 px tall from 300 px down, its rows 56 px apart under a 16 px top, and rows scrolled under the bar 77 px below its
// top; the list moves with the explorer's scroll.
const laidIndex=e=>{
  const explorer=e.elements.explorer,bar=e.elements['music-filters'];bar.computed={top:'72px'};bar.offsetHeight=61;Object.assign(explorer,{scrollTop:0,clientHeight:700,scrollHeight:9300,getBoundingClientRect:()=>({top:0,bottom:700})});
  Object.defineProperty(e.Element.prototype,'computed',{configurable:true,writable:true,value:{scrollMarginTop:'77px'}});
  Object.defineProperty(e.Element.prototype,'getBoundingClientRect',{configurable:true,value(){
    const sections=e.elements['music-content'].children,k=sections.indexOf(this),li=this.parent,s=sections.indexOf(li?.parent?.parent);
    const top=k>=0?300+k*1000:s>=0&&this.className==='row'?300+s*1000+16+li.parent.children.indexOf(li)*56:null;
    return top===null?{left:0,top:0,right:0,bottom:0,width:0,height:0}:{top:top-explorer.scrollTop,bottom:top-explorer.scrollTop+(k>=0?1000:56)};
  }});
};
const railOf=e=>e.elements['index-rail'].children[0];
// The Index's parts sit inside the explorer, as in index.html, so focus on them is focus in the explorer.
const nest=e=>{e.elements.explorer.append(e.elements['music-view']);return e;};
const marksOn=e=>railOf(e).children.slice(1).map(b=>[textOf(b),b.disabled]);
const currentMark=e=>railOf(e).children.filter(b=>b.attrs['aria-current']).map(b=>b.dataset.mark);
const typed=(e,key,target=control('a'))=>e.key(key===' '?'Space':key==='/'?'Slash':'Key'+key.toUpperCase(),target,{key});

test('the rail always has 27 letters or 7 bands, empty ones disabled and out of the Tab order',async()=>{
 const e=await indexed();routeTo(e,'#index/artists');await flush();const rail=railOf(e),[find]=rail.children;
 const present=['A','B','F','K','M','O','S','W','#'];
 assert.deepEqual([e.elements['index-rail'].hidden,e.elements['index-rail'].attrs['aria-label'],marksOn(e)],[false,'Jump to a letter',[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ#'].map(m=>[m,!present.includes(m)])],'27 marks, A to Z then #, those with no names disabled');
 assert.ok(rail.children.every(b=>b.localName==='button'&&b.type==='button'&&b.tabIndex===-1),'every mark and the magnifier stay out of the Tab order');
 assert.deepEqual([find.attrs['aria-label'],find.dataset.mark,byClass(find,'rail-icon').length,...['A','C','#'].map(m=>rail.children.find(b=>b.dataset.mark===m).attrs['aria-label'])],
  ['Back to the filter',undefined,1,'A, 4 artists','C, no artists','Numbers and symbols, 2 artists'],'each mark is named for a screen reader, an empty one too');
 const marks=rail.children.slice();follow(e,e.elements['index-sides'].children[1]);await flush();
 assert.deepEqual([marksOn(e).filter(([,off])=>!off).map(([m])=>m),rail.children.every((b,i)=>b===marks[i]),rail.children.find(b=>b.dataset.mark==='C').attrs['aria-label']],[['D','K','M'],true,'C, no labels'],'the labels keep the same 27 buttons');
 follow(e,e.elements['index-order'].children[1]);await flush();
 assert.deepEqual([e.elements['index-rail'].attrs['aria-label'],marksOn(e).map(([m])=>m),marksOn(e).filter(([,off])=>off).map(([m])=>m)],['Jump to a track count',['100+','50+','20+','10+','5+','2+','1'],['100+','20+','5+','2+']],'Most tracks: always the 7 bands');
 assert.equal(rail.children.find(b=>b.dataset.mark==='100+').attrs['aria-label'],'100 tracks or more, no labels');
 follow(e,e.elements['index-sides'].children[0]);await flush();typeIndex(e,'zzzz');
 assert.deepEqual([marksOn(e).length,marksOn(e).every(([,off])=>off),e.elements['index-rail'].hidden],[7,true,false],'a filter no name matches disables every mark');
 e.setLanguage('de');await flush();assert.deepEqual([e.elements['index-rail'].attrs['aria-label'],rail.children[0].attrs['aria-label'],rail.children[1].attrs['aria-label'],e.elements['index-query'].title],
  ['Zu einer Trackzahl springen','Zurück zum Filter','100 Tracks oder mehr, keine Künstler','Mit / filtern. In der Liste springst du mit den ersten Buchstaben zu einem Namen.'],'in German');
 // While the names load the rail shows with every mark disabled; when they fail it goes, with the list.
 const f=await indexed();let fail;f.names=()=>new Promise((_resolve,reject)=>{fail=reject;});routeTo(f,'#index/labels');await flush();
 assert.deepEqual([f.elements['index-rail'].hidden,marksOn(f).length,marksOn(f).every(([,off])=>off)],[false,27,true],'loading');
 fail(new Error('down'));await flush();assert.deepEqual([f.elements['index-rail'].hidden,textOf(f.elements['music-status'])],[true,'The names could not load. Try again'],'an error');
 f.names={labels:labelNames()};f.elements['music-status'].children[1].emit('click');await flush();assert.deepEqual([f.elements['index-rail'].hidden,marksOn(f).filter(([,off])=>!off).length],[false,3],'Try again brings it back');
 routeTo(f,'#history');await flush();assert.equal(f.elements['index-rail'].hidden,true,'only in the Index');
});

test('the rail jumps to a mark: under the stage bar, for a pointer to the nearest enabled one, and for a screen reader onto its first name',async()=>{
 const e=await indexed();laidIndex(e);routeTo(e,'#index/artists');await flush();const rail=railOf(e),explorer=e.elements.explorer,mark=m=>rail.children.find(b=>b.dataset.mark===m);
 // The marks as a browser lays them out: 20 px apart, the magnifier first at the top.
 for(const [i,b] of rail.children.entries())b.getBoundingClientRect=()=>({top:140+i*20,bottom:160+i*20});
 let captured=null;rail.setPointerCapture=id=>{captured=id;};
 const down={button:0,pointerId:7,pointerType:'mouse',clientY:mark('M').getBoundingClientRect().top+10,target:{closest:()=>null},prevented:false,preventDefault(){this.prevented=true;}};
 rail.emit('pointerdown',down);
 assert.deepEqual([explorer.scrollTop,captured,down.prevented,currentMark(e),e.elements['index-scrub'].attrs['data-on']],[4167,7,true,['M'],undefined],'M\'s section, the fifth, starts at the stage bar\'s bottom, 133 px down; a mouse shows no letter');
 rail.emit('pointermove',{clientY:mark('C').getBoundingClientRect().top+12});
 assert.deepEqual([explorer.scrollTop,currentMark(e)],[1167,['B']],'held and moved to C, which has no names: B, the nearest enabled mark');
 rail.emit('pointerup',{});rail.emit('pointermove',{clientY:mark('W').getBoundingClientRect().top});assert.equal(explorer.scrollTop,1167,'released, the pointer moves nothing');
 const touch={button:0,pointerId:8,pointerType:'touch',clientY:mark('S').getBoundingClientRect().top+3,target:{closest:()=>null},preventDefault(){}},scrub=e.elements['index-scrub'];
 let ticks=0;e.run('navigator.vibrate=()=>{}');e.run('globalThis.ticks=0;navigator.vibrate=ms=>{globalThis.ticks+=ms;}');
 rail.emit('pointerdown',touch);rail.emit('pointermove',{clientY:touch.clientY+5});ticks=e.run('globalThis.ticks');
 assert.deepEqual([explorer.scrollTop,scrub.textContent,scrub.style.top,scrub.attrs['data-on'],scrub.attrs['aria-hidden']??null,ticks],[6167,'S',(touch.clientY+5)+'px','',null,4],'a thumb sees the mark beside it, at its height within the mark, and feels one tick per new mark');
 rail.emit('pointerup',{});assert.equal(scrub.attrs['data-on'],'','the letter stays a moment');e.fire(350);assert.equal(scrub.attrs['data-on'],undefined,'then fades');
 rail.emit('pointerdown',{...touch,target:{closest:selector=>selector==='.rail-find'?rail.children[0]:null}});assert.equal(explorer.scrollTop,6167,'a press on the magnifier is a click, not a scrub');
 rail.emit('click',{detail:1,target:{closest:()=>mark('K')}});assert.equal(explorer.scrollTop,6167,'a pointer\'s click adds nothing to its press');
 rail.emit('click',{detail:0,target:{closest:()=>mark('K')}});
 assert.deepEqual([explorer.scrollTop,e.document.activeElement===rowOf(e,'Kiasmos')],[3167,true],'a screen reader\'s activation jumps and focuses the section\'s first name');
 rail.emit('click',{detail:1,target:{closest:()=>rail.children[0]}});
 assert.deepEqual([explorer.scrollTop,e.document.activeElement===e.elements['index-query']],[0,true],'the magnifier goes back to the filter');
});

test('type-ahead focuses the first name for a prefix, or the next name, and Space still plays',async()=>{
 const e=nest(await indexed());laidIndex(e);routeTo(e,'#index/artists');await flush();const explorer=e.elements.explorer,focused=()=>e.document.activeElement;
 rowOf(e,'Act 9').focus();
 const taken=['a','m'].map(k=>typed(e,k).prevented);
 assert.deepEqual([taken,focused()===rowOf(e,'Âme'),explorer.scrollTop],[[true,true],true,0],'"am" is Âme, the first name shown that starts so, and a row in full view stays where it is');
 typed(e,'e');typed(e,'l');assert.equal(focused(),rowOf(e,'Amelie Lens'),'the letters gather: "amel"');
 e.fire(900);typed(e,'k');
 assert.deepEqual([focused()===rowOf(e,'Kiasmos'),explorer.scrollTop],[true,3167],'900 ms later a new name starts; one out of view comes 16 px under the stage bar, as a kept row does');
 e.fire(900);typed(e,'l');assert.equal(focused(),rowOf(e,'Maceo Plex'),'no name starts with L: the first that sorts after it');
 e.fire(900);for(const k of 'xyz')typed(e,k);assert.equal(focused(),rowOf(e,'&ME'),'after Z come the numbers and symbols');
 e.fire(900);typed(e,'ö');assert.equal(focused(),rowOf(e,'Øostil'),'a letter folds as the filter folds it');
 const was=e.window.Pavoia.getState().wanted,space=e.key('Space',control('a'));
 assert.deepEqual([space.prevented,e.window.Pavoia.getState().wanted===was,focused()===rowOf(e,'Øostil')],[true,false,true],'Space plays and pauses');
 e.focus(control('button',{},true));const button=e.key('Space',control('button',{},true));
 assert.equal(button.prevented,false,'and on a button the keyboard reached, Space is the button\'s: the type-ahead never takes it');
 e.fire(900);typed(e,'k');typed(e,' ');
 assert.equal(e.timers.size&&[...e.timers.values()].filter(t=>t.delay===900).length,1,'a space neither adds to the names nor waits');
 follow(e,e.elements['index-order'].children[1]);await flush();rowOf(e,'Kiasmos').focus();e.fire(900);typed(e,'l');
 assert.equal(focused(),rowOf(e,'Kiasmos'),'in Most tracks a prefix nobody has moves nothing');
 e.fire(900);typed(e,'a');assert.equal(focused(),rowOf(e,'Act 10'),'and a prefix someone has finds the first of them in that order, most tracks first');
 e.fire(900);routeTo(e,'#history');await flush();e.elements.explorer.focus();assert.equal(typed(e,'k').prevented,false,'History has no type-ahead');
});

test('/ focuses the filter',async()=>{
 const e=nest(await indexed());laidIndex(e);routeTo(e,'#index/artists');await flush();const explorer=e.elements.explorer,field=e.elements['index-query'];
 rowOf(e,'Kiasmos').focus();explorer.scrollTop=2400;field.selected=false;
 const slash=typed(e,'/');
 assert.deepEqual([slash.prevented,e.document.activeElement===field,field.selected,explorer.scrollTop],[true,true,true,0],'from a row: the list\'s top, and the field with its text selected');
 const inField=keyIn(e,'/');assert.equal(inField.defaultPrevented,false,'in the field, / is a character');
 rowOf(e,'Kiasmos').focus();explorer.scrollTop=2400;
 assert.deepEqual([typed(e,'/',control('a')).prevented,e.key('Slash',control('a'),{key:'/',ctrlKey:true}).prevented],[true,false],'not with Ctrl');
 e.key('Slash',control('a'),{key:'/',ctrlKey:true});assert.equal(e.document.activeElement===field,true);
 e.elements['player'].focus();explorer.scrollTop=2400;field.selected=false;const outside=typed(e,'/',control('button'));
 assert.deepEqual([outside.prevented,explorer.scrollTop,field.selected],[false,2400,false],'with focus outside the explorer, as on the player bar, / is not the Index\'s');
});

test('at= is written after scrolling stops, read back on a reload, and never part of the kept place',async()=>{
 const e=await indexed();laidIndex(e);routeTo(e,'#index/artists');await flush();const explorer=e.elements.explorer,tab=e.elements['index-tab'],kept=e.entries().length,state=e.history.state;
 const scrollTo=top=>{explorer.scrollTop=top;explorer.emit('scroll');explorer.emit('scroll');e.fire('frame');};
 scrollTo(2500);
 assert.deepEqual([currentMark(e),e.location.hash],[['F'],'#index/artists'],'the rail marks F, the section that crosses the bar; the address waits');
 e.fire(250);
 assert.deepEqual([e.location.hash,tab.getAttribute('href'),e.entries().length,e.history.state===state,e.url()],['#index/artists?at=F','#index/artists?at=F',kept,true,'/'+e.location.search+'#index/artists?at=F'],'250 ms after the list stops, in place, with the station query and the entry\'s state');
 assert.match(e.location.search,/^\?station=/);
 scrollTo(9300-700);e.fire(250);assert.deepEqual([currentMark(e),e.location.hash],[['#'],'#index/artists?at=%23'],'at the list\'s end, its last section');
 scrollTo(100);e.fire(250);assert.deepEqual([currentMark(e),e.location.hash,tab.getAttribute('href')],[[],'#index/artists','#index/artists'],'no mark while the list\'s top is in view');
 scrollTo(4200);e.fire(250);
 assert.deepEqual([stageOf(e,'fontanna').getAttribute('href'),e.elements['index-order'].children[1].getAttribute('href'),e.elements['index-sides'].children[1].getAttribute('href')],['#index/artists/fontanna','#index/artists?by=tracks','#index/labels'],'the links of the head and the bar carry no mark');
 // A record opened from the M section comes back to its row, not to the top of M: the kept place wins, with no request.
 const asked=e.namesRequests.length,row=rowOf(e,'Maceo Plex');follow(e,row);await flush();
 assert.equal(tab.getAttribute('href'),'#index/artists?at=M');
 routeTo(e,tab.getAttribute('href'));await flush();
 assert.deepEqual([e.location.hash,e.namesRequests.length-asked,explorer.scrollTop,e.document.activeElement===row],['#index/artists?at=M',0,4200,true],'the same rows, where they stood');
 typeIndex(e,'a');assert.equal(e.location.hash,'#index/artists?q=a','the filter writes no mark');
 // A reload, or a link shared, opens on its mark; one of another order is dropped.
 const f=await indexed();laidIndex(f);await browse(f,'#index/artists/bermuda-day?at=K');
 assert.deepEqual([f.location.hash,f.elements.explorer.scrollTop,currentMark(f)],['#index/artists/bermuda-day?at=K',3167,['K']],'K, the fourth section on Under the Sun, under the bar');
 await browse(f,'#index/artists?by=tracks&at=K');assert.deepEqual([f.location.hash,f.elements['index-tab'].getAttribute('href')],['#index/artists?by=tracks','#index/artists?by=tracks'],'K is no band');
 const g=await indexed();laidIndex(g);await browse(g,'#index/artists?by=tracks&at=10%2B');
 assert.deepEqual([g.location.hash,g.elements.explorer.scrollTop],['#index/artists?by=tracks&at=10%2B',2167],'10+, the third band shown');
});

test('a focused or pointed row lights its stations in the bar',async()=>{
 const e=await indexed();routeTo(e,'#index/artists');await flush();const list=e.elements['music-content'],bar=e.elements['stage-row'],row=rowOf(e,'Maceo Plex');
 const lit=()=>[bar.attrs['data-lit']!==undefined,bar.children.filter(a=>a.attrs['data-lit']!==undefined).map(a=>a.dataset.stage)];
 list.emit('focusin',{target:{closest:()=>row}});
 assert.deepEqual(lit(),[true,['radio','bermuda-day','bermuda-evening','palac-dance']],'All stations and the stations of the name');
 list.emit('focusout',{});assert.deepEqual(lit(),[false,[]],'focus gone, the bar is as before');
 list.emit('pointerover',{pointerType:'touch',target:{closest:()=>row}});assert.deepEqual(lit(),[false,[]],'a touch lights nothing');
 list.emit('pointerover',{pointerType:'mouse',target:{closest:()=>rowOf(e,'Kiasmos')}});assert.deepEqual(lit(),[true,['radio','bermuda-day']],'a mouse');
 list.emit('pointerover',{pointerType:'mouse',target:{closest:()=>null}});assert.deepEqual(lit(),[false,[]],'between rows, nothing');
 list.emit('pointerover',{pointerType:'mouse',target:{closest:()=>row}});list.emit('pointerleave',{});assert.deepEqual(lit(),[false,[]],'and out of the list');
 list.emit('focusin',{target:{closest:()=>row}});follow(e,stageOf(e,'bermuda-day'));await flush();assert.deepEqual(lit(),[false,[]],'a new bar starts unlit');
 e.historyReply=answer(played(3));routeTo(e,'#history');await flush();list.emit('focusin',{target:{closest:()=>list.descendants().find(n=>n.className==='row')}});
 assert.deepEqual(lit(),[false,[]],'History\'s rows light nothing');
 const css=cssRules();assert.match(css.get('#stage-row[data-lit] a:not([data-lit])'),/color:var\(--muted\)/);assert.match(css.get('#stage-row a'),/transition:color var\(--hover\) var\(--ease\)/);
});

test('type-ahead on a phone brings a row out from under its section\'s sticky heading',async()=>{
 // On a phone the stage bar sticks at the explorer's top and each section's heading under it, so a row's scroll margin
 // is 121 px: a row 89 px down is below the bar but under the heading, and is not in view.
 const e=nest(await indexed());laidIndex(e);e.elements['music-filters'].computed={top:'0px'};
 Object.defineProperty(e.Element.prototype,'computed',{configurable:true,writable:true,value:{scrollMarginTop:'121px'}});
 routeTo(e,'#index/artists');await flush();const explorer=e.elements.explorer;
 rowOf(e,'Act 9').focus();explorer.scrollTop=3227;typed(e,'k');
 assert.deepEqual([e.document.activeElement===rowOf(e,'Kiasmos'),explorer.scrollTop,rowOf(e,'Kiasmos').getBoundingClientRect().top],[true,3195,121],'Kiasmos comes to 121 px, clear of the heading');
 e.fire(900);typed(e,'k');assert.equal(explorer.scrollTop,3195,'once clear, it stays where it is');
});

test('in the Index, digits and letters go to the type-ahead and not to the page keys',async()=>{
 const e=nest(await indexed({storage:{getItem:key=>key==='pavoia-volume'?'0.6':null,setItem(){}}}));routeTo(e,'#index/artists');await flush();
 e.elements.keys.append(Object.assign(new e.Element(),{localName:'summary'}));
 const now=()=>[e.window.Pavoia.getState().stage,e.audio.volume,Boolean(e.elements.keys.open)],before=now();
 rowOf(e,'Kiasmos').focus();
 const keys=[['Digit1','1'],['KeyM','m'],['KeyM','M'],['Slash','?'],['Digit8','8']].map(([code,key])=>e.key(code,control('a'),{key}).prevented);
 assert.deepEqual([keys,now()],[[true,true,true,true,true],before],'with focus in the list: no station, no mute, no shortcuts');
 e.fire(900);e.elements.explorer.focus();assert.deepEqual([e.key('Digit5',control('div'),{key:'5'}).prevented,now()],[true,before],'with focus on the explorer itself too');
 e.elements.volume.focus();digit(e,5,{target:control('input',{type:'range'})});
 assert.deepEqual(now(),['etage-zero',0.6,false],'with focus on the player bar, under the open explorer, 5 is the page\'s');
});

test('the type-ahead leaves every key that is not a character, and a key with Alt, Cmd, an input method or another taker',async()=>{
 const e=nest(await indexed());laidIndex(e);routeTo(e,'#index/artists');await flush();const row=rowOf(e,'Act 9');
 row.focus();
 assert.deepEqual(['Tab','Enter','ArrowRight','ArrowDown','F5'].map(key=>e.key(key,control('a'),{key}).prevented),[false,false,false,false,false],'Tab, Enter, the arrows and the function keys keep their own actions');
 const left=[{altKey:true},{metaKey:true},{isComposing:true}].map(extra=>e.key('KeyK',control('a'),{key:'k',...extra}).prevented);
 const taken=e.key('KeyK',control('a'),{key:'k',defaultPrevented:true});
 assert.deepEqual([left,taken.prevented,e.document.activeElement===row,[...e.timers.values()].filter(t=>t.delay===900).length],[[false,false,false],false,true,0],'none of them is prevented, moves focus or starts a name');
 assert.deepEqual([typed(e,'k').prevented,e.document.activeElement===rowOf(e,'Kiasmos')],[true,true],'a plain k is still the type-ahead\'s');
});

test('a mark of the address leads once: on a reload, on a list already drawn, and never when it has no names here',async()=>{
 const load=async(e,hash)=>{e.location.hash=hash;e.window.emit('popstate');await flush();};
 // One restore(), as a real load makes: the jump after the names arrive is the only one there is.
 const e=await indexed();laidIndex(e);await load(e,'#index/artists/bermuda-day?at=K');const explorer=e.elements.explorer,tab=e.elements['index-tab'],asked=e.namesRequests.length;
 assert.deepEqual([e.location.hash,explorer.scrollTop,currentMark(e)],['#index/artists/bermuda-day?at=K',3167,['K']],'a load opens on K');
 // The same list, another mark: no request, and the mark of the address leads.
 await load(e,'#index/artists/bermuda-day?at=A');
 assert.deepEqual([e.namesRequests.length-asked,explorer.scrollTop,currentMark(e)],[0,167,['A']],'the list already drawn moves to A');
 // The mark is used once: a draw that follows, here another language, moves nothing.
 explorer.scrollTop=40;e.setLanguage('de');await flush();
 assert.equal(explorer.scrollTop,40,'a later draw does not jump again');
 // A mark with no names in this list leaves the address and the tab, on a load and on a list already drawn.
 const f=await indexed();laidIndex(f);await load(f,'#index/artists?q=maceo&at=K');
 assert.deepEqual([f.location.hash,f.elements['index-tab'].getAttribute('href'),f.elements.explorer.scrollTop,currentMark(f)],['#index/artists?q=maceo','#index/artists?q=maceo',0,[]],'K has no name with "maceo": no mark, and the list at its top');
 await load(f,'#index/artists?q=maceo&at=M');assert.equal(f.location.hash,'#index/artists?q=maceo&at=M','M has one');
 await load(f,'#index/artists?q=maceo&at=Z');
 assert.deepEqual([f.location.hash,f.elements['index-tab'].getAttribute('href'),f.entries().length>0],['#index/artists?q=maceo','#index/artists?q=maceo',true],'and on the drawn list Z goes too');
});

test('the labels document and the changes hold a station place 2 s past its numbers at most, and changes that come later say they could not load',async()=>{
 const graces=e=>[...e.timers.values()].filter(t=>t.delay===2000).length,drawn=e=>byClass(e.elements['music-content'],'entity-heading').length;
 const indexLinks=e=>e.elements['music-content'].descendants().filter(n=>n.localName==='a'&&/^#index\//.test(n.getAttribute('href')||'')).length;
 // The labels document does not come: the place waits 2 s for it, then shows without its links, with its changes.
 const e=setup({journey:true});await flush();e.discovery={items:[]};e.changes=changePage(changeFeed(3,3,clock.now));
 let labels=null;e.names=()=>new Promise(resolve=>{labels=resolve;});
 await stagePlace(e,'#statistics/bermuda-day');
 assert.deepEqual([drawn(e),graces(e)],[0,1],'its numbers came: the place waits, for 2 s');
 e.fire(2000);await flush();
 assert.deepEqual([drawn(e),indexLinks(e),byClass(changeRegion(e),'row').length,graces(e),e.elements['music-status'].textContent],[1,0,3,0,''],'then it shows: no link to the Index, its changes, and no error');
 // The document still comes, and the next place has it with no second request.
 labels(labelDoc(140,131));await flush();
 e.response={...status('First'),...stageStats({scope:'fontanna'}),...stageMusic()};follow(e,stageLink(e,'fontanna'));await flush();
 assert.deepEqual([e.namesRequests.length,indexLinks(e)>0,graces(e)],[1,true,0],'one labels document, used by the place after; a place with every answer leaves no timer');
 // The changes do not come: the same wait, then the place, whose changes say at the end that they could not load.
 const f=setup({journey:true});await flush();f.discovery={items:[]};f.names={labels:labelDoc(140,131)};f.changes=()=>new Promise(()=>{});
 await stagePlace(f,'#statistics/bermuda-day');assert.equal(drawn(f),0);
 f.fire(2000);await flush();
 const regions=byClass(f.elements['music-content'],'region');
 assert.deepEqual([drawn(f),indexLinks(f)>0,regions.at(-1)===changeRegion(f),changeRegion(f).children.map(n=>n.localName+' '+textOf(n)),graces(f)],[1,true,true,['h4 Added and removed','p The changes could not load.','button Try again'],0],'the links of the labels document, and Added and removed last, saying the changes could not load');
});

test('the last page of changes hands focus to the first row that opens a track, and a page left while it loads is dropped',async()=>{
 const e=setup({journey:true});await flush();e.discovery={items:[]};
 // Sequence 2 has an id that is no track: its row is no link.
 const records=changeFeed(12,12,clock.now).map(r=>r.sequence==='2'?{...r,id:'x y'}:r);e.changes=changePage(records);
 await stagePlace(e,'#statistics/bermuda-day');const region=changeRegion(e),more=region.children.at(-1);
 more.focus();more.emit('click');await flush();
 const rows=byClass(region,'row');
 assert.deepEqual([rows.length,rows[10].getAttribute('href'),rows[11].getAttribute('href'),e.document.activeElement===rows[11],e.changesRequests.length],[12,null,'#explore/plex_9001',true,1],'the last rows came from memory; the first new row is no link, so focus goes to the next one');
 // From a page asked for, the same: 105 changes, the last 5 on a second page.
 const g=setup({journey:true});await flush();g.discovery={items:[]};g.changes=changePage(changeFeed(105,9,clock.now).map(r=>r.sequence==='5'?{...r,id:'x y'}:r));
 await stagePlace(g,'#statistics/bermuda-day');const asked=changeRegion(g).children.at(-1);
 for(let i=0;i<9;i++){asked.emit('click');await flush();}
 asked.focus();asked.emit('click');await flush();
 const all=byClass(changeRegion(g),'row');
 assert.deepEqual([all.length,g.changesRequests.map(r=>r.url),all[100].getAttribute('href'),changeRegion(g).children.includes(asked),g.document.activeElement===all[101]],
  [105,['/api/radio/bermuda-day/changes?limit=100','/api/radio/bermuda-day/changes?limit=100&before=6'],null,false,true],'the last page asked for: its first row is no link, so focus goes to the next one');
 // A page still out when the listener leaves is aborted. The first 100 changes come in memory, and only the next page is asked.
 const f=setup({journey:true});await flush();f.discovery={items:[]};f.changes=changePage(changeFeed(105,9,clock.now));
 await stagePlace(f,'#statistics/bermuda-day');const button=changeRegion(f).children.at(-1);
 for(let i=0;i<9;i++){button.emit('click');await flush();}
 assert.deepEqual([byClass(changeRegion(f),'row').length,f.changesRequests.length],[100,1]);
 f.changes=()=>new Promise(()=>{});button.emit('click');await flush();const page=f.changesRequests.at(-1);
 assert.deepEqual([new URL(page.url,'http://radio').searchParams.get('before'),page.signal.aborted],['6',false]);
 routeTo(f,'#history');await flush();
 assert.equal(page.signal.aborted,true,'leaving Statistics drops the page');
});

// Step D1: a Statistics place comes back as it was left, as History does. Requests that count: the numbers, the plays and
// the changes; a name search sent again is not counted.
const placeAsks=e=>e.requests.filter(r=>/^\/api\/(library\/statistics\?|radio\/[a-z-]+\/music$)/.test(r.url)).length+e.changesRequests.length;
const changeRows=e=>byClass(changeRegion(e),'row');

test('Back and the Statistics tab bring a station place back with its rows, its pages, its scroll and focus on the row opened, with no request',async()=>{
 const e=setup({journey:true});await flush();e.discovery=url=>url.includes('/search?')?{items:[]}:entity(url.split('/').pop(),'track');
 const records=changeFeed(23,9,clock.now);e.changes=changePage(records);
 const content=await stagePlace(e,'#statistics/bermuda-day'),explorer=e.elements.explorer,title=content.querySelector('.entity-heading').querySelector('h3');
 changeRegion(e).children.at(-1).emit('click');await flush();
 const shown=[...content.children],rows=changeRows(e),row=rows[14],asked=placeAsks(e);
 assert.equal(rows.length,20,'one page more: twenty rows');
 explorer.scrollTop=3000;row.focus();follow(e,row);await flush();
 assert.equal(e.location.hash,'#explore/plex_9009');explorer.scrollTop=40;
 e.history.back();await flush();
 assert.deepEqual([e.location.hash,sameRows(content.children,shown),sameRows(changeRows(e),rows),explorer.scrollTop,e.document.activeElement===row,placeAsks(e)],['#statistics/bermuda-day',true,true,3000,true,asked],'Back: the same rows and pages, scrolled where they were, focus on the row opened, and no request');
 // Forward opens the record again with no click; Back finds the row by its link.
 e.history.go(1);await flush();assert.equal(e.location.hash,'#explore/plex_9009');e.document.activeElement=e.document.body;
 e.history.back();await flush();
 assert.deepEqual([sameRows(changeRows(e),rows),explorer.scrollTop,e.document.activeElement===row,placeAsks(e)],[true,3000,true,asked],'Forward, then Back: the row is found by its link');
 follow(e,row);await flush();explorer.scrollTop=40;
 const tab=e.document.querySelectorAll('.explorer-nav a').find(a=>a.getAttribute('href').startsWith('#statistics'));
 assert.equal(tab.getAttribute('href'),'#statistics/bermuda-day','the tab keeps the place');
 follow(e,tab);await flush();
 assert.deepEqual([e.location.hash,sameRows(content.children,shown),sameRows(changeRows(e),rows),explorer.scrollTop,e.document.activeElement===row,placeAsks(e)],['#statistics/bermuda-day',true,true,3000,true,asked],'the Statistics tab: the same');
 // The Roots tab opens no row of the place: Back gives focus to the station's name, not to the record's hidden title.
 routeTo(e,'#explore');await flush();
 assert.ok(inspector(e).descendants().some(n=>n.localName==='h3'),'the Roots tab shows a record');
 e.history.back();await flush();
 assert.deepEqual([e.location.hash,sameRows(content.children,shown),e.document.activeElement===title,content.contains(e.document.activeElement),placeAsks(e)],['#statistics/bermuda-day',true,true,true,asked],'with no row to focus, the station\'s name inside the place');
 // Scrolled past the station's name, that name is out of view, and the first Tab would bring the place back to its top:
 // focus goes to the first link that shows whole, inside the place. The explorer shows 800px; the name stands at 200px
 // and each link 40px under the one before, from 300px.
 const P=e.Element.prototype,base=P.getBoundingClientRect,box=top=>({left:0,right:300,width:300,top,bottom:top+40,height:40});
 P.getBoundingClientRect=function(){
  if(this===explorer)return {left:0,right:300,width:300,top:0,bottom:800,height:800};
  if(this===title)return box(200-explorer.scrollTop);
  const links=content.querySelectorAll('a');return links.includes(this)?box(300+links.indexOf(this)*40-explorer.scrollTop):base.call(this);
 };
 try{
  explorer.scrollTop=600;routeTo(e,'#explore');await flush();explorer.scrollTop=0;e.history.back();await flush();
  const links=content.querySelectorAll('a'),shownFirst=links.find(a=>a.getAttribute('href')&&a.getBoundingClientRect().top>=0);
  assert.deepEqual([explorer.scrollTop,links.indexOf(e.document.activeElement),e.document.activeElement===title,content.contains(e.document.activeElement),placeAsks(e)],[600,links.indexOf(shownFirst),false,true,asked],'scrolled: the first link that shows, inside the place');
  assert.equal(links.indexOf(shownFirst),8,'links 0 to 7 stand over the explorer\'s top');
 }finally{P.getBoundingClientRect=base;}
 const more=changeRegion(e).children.at(-1);more.focus();more.emit('click');await flush();
 assert.deepEqual([changeRows(e).length,e.document.activeElement===changeRows(e)[20],content.contains(e.document.activeElement)],[23,true,true],'the last page after Back hands focus to its first row, inside the place');
 // On the map, the place kept follows the window again: a live observer on the stage's map.
 const m=setup({journey:true,media:['(min-width:1100px)']});mapBoxes(m);await flush();m.discovery=url=>url.includes('/search?')?{items:[]}:entity(url.split('/').pop(),'track');m.changes=changePage(records);
 const placed=await stagePlace(m,'#statistics/bermuda-day'),map=byClass(placed,'neighbourhood')[0],live=()=>m.observers.filter(o=>o.targets.includes(map));
 assert.equal(live().length,1,'the map watches the window');
 const watching=()=>m.observers.filter(o=>o.targets.length).length,calm=watching();
 const sent=placeAsks(m);follow(m,changeRows(m)[4]);await flush();
 assert.deepEqual([m.location.hash,live().length],['#explore/plex_9019',0],'the record took the observer');
 m.history.back();await flush();
 assert.deepEqual([byClass(placed,'neighbourhood')[0]===map,live().length,placeAsks(m)],[true,1,sent],'Back: the same map, watched again, with no request');
 assert.equal(watching(),calm,'and the record\'s hidden map is watched no more');
 m.mapWidth=1100;live()[0].fn();
 assert.ok(nodesOf(map).some(n=>n.style.top),'and its observer lays the map out');
});

test('a station place left for a record while the window crosses 1100 px comes back drawn for the new width, with the opened row at the same height, and no request',async()=>{
 const e=setup({journey:true,media:['(min-width:1100px)']});mapBoxes(e);await flush();e.discovery=url=>url.includes('/search?')?{items:[]}:entity(url.split('/').pop(),'track');
 // The row opened links to a track that Most played links to as well, lower down.
 const records=changeFeed(23,9,clock.now).map((r,i)=>i===14?{...r,id:'4'}:r);e.changes=changePage(records);
 // A row stands lower on the map, under its 900px box, than in the list, under a 300px header: 40px a row, scrolled.
 const content=e.elements['music-content'],explorer=e.elements.explorer,P=e.Element.prototype,base=P.getBoundingClientRect;
 P.getBoundingClientRect=function(){
  if(!(this.className||'').split(' ').includes('row')||!content.contains(this))return base.call(this);
  const top=(byClass(content,'neighbourhood').length?900:300)+byClass(content,'row').indexOf(this)*40-explorer.scrollTop;return {left:0,top,width:300,height:40,right:300,bottom:top+40};
 };
 await stagePlace(e,'#statistics/bermuda-day');changeRegion(e).children.at(-1).emit('click');await flush();
 const titles=()=>byClass(changeRegion(e),'row-name').map(textOf),before=titles(),row=changeRows(e)[14],href=row.getAttribute('href'),asked=placeAsks(e);
 explorer.scrollTop=2000;const y=row.getBoundingClientRect().top;row.focus();follow(e,row);await flush();explorer.scrollTop=0;
 e.queries.get('(min-width:1100px)').change(false);await flush();
 e.history.back();await flush();
 const again=changeRows(e).find(a=>a.getAttribute('href')===href);
 assert.deepEqual([e.location.hash,byClass(content,'neighbourhood').length,titles(),again===row,again.getBoundingClientRect().top,e.document.activeElement===again,placeAsks(e)],
  ['#statistics/bermuda-day',0,before,false,y,true,asked],'drawn again as a list from the numbers it showed: the same rows, the row opened at its height and in focus, and no request');
 assert.equal(e.document.activeElement===content.querySelector('.entity-heading').querySelector('h3'),false);
 // A crossing of 760px draws the place again too, from the same numbers.
 const f=setup({journey:true});await flush();f.discovery=e.discovery;f.changes=changePage(records);
 const list=await stagePlace(f,'#statistics/bermuda-day'),shown=changeRows(f),sent=placeAsks(f);
 follow(f,shown[6]);await flush();f.queries.get('(max-width:760px)').change(true);f.history.back();await flush();
 assert.deepEqual([sameRows(changeRows(f),shown),byClass(changeRegion(f),'row-name').map(textOf),f.document.activeElement===changeRows(f)[6],list.contains(f.document.activeElement),placeAsks(f)],[false,shown.map(a=>textOf(a.children[1].children[0])),true,true,sent],'a phone width: drawn again, focus on the row with the same link, and no request');
 // A window narrowed or turned inside one layout wraps the text over the row, so the row stands lower at the same scroll:
 // the place is not drawn again, and the scroll moves so that the row opened stands where it stood.
 const g=setup({journey:true});await flush();g.discovery=e.discovery;g.changes=changePage(records);
 const kept=g.elements['music-content'],scroller=g.elements.explorer,Q=g.Element.prototype,own=Q.getBoundingClientRect;let pitch=40;
 Q.getBoundingClientRect=function(){
  if(this===scroller)return {left:0,top:0,width:300,height:800,right:300,bottom:800};
  if(!(this.className||'').split(' ').includes('row')||!kept.contains(this))return own.call(this);
  const top=300+byClass(kept,'row').indexOf(this)*pitch-scroller.scrollTop;return {left:0,top,width:300,height:pitch,right:300,bottom:top+pitch};
 };
 await stagePlace(g,'#statistics/bermuda-day');changeRegion(g).children.at(-1).emit('click');await flush();
 const rowsBefore=changeRows(g),opened=rowsBefore[14],gone=placeAsks(g);scroller.scrollTop=500;const at=opened.getBoundingClientRect().top;
 opened.focus();follow(g,opened);await flush();scroller.scrollTop=0;pitch=60;
 g.history.back();await flush();
 assert.deepEqual([sameRows(changeRows(g),rowsBefore),opened.getBoundingClientRect().top,scroller.scrollTop,g.document.activeElement===opened,placeAsks(g)],[true,at,500+byClass(kept,'row').indexOf(opened)*20,true,gone],'narrowed: the same rows, the row opened at its height and in focus, and no request');
 // Forward opens the record again with no click. The change opened, first in the place, links to the track Most played
 // links to, lower: scrolled to Most played, the change is far over the view, and Back gives focus to the link that
 // showed when the place was left, Most played's, not to the first one in the place.
 const twin=kept.querySelectorAll('a').filter(a=>a.getAttribute('href')===opened.getAttribute('href')),played=twin[1];
 scroller.scrollTop=300+byClass(kept,'row').indexOf(played)*pitch-400;const lower=played.getBoundingClientRect().top;
 assert.deepEqual([twin.length,twin.indexOf(opened),twin[0].getBoundingClientRect().bottom<=0,lower],[2,0,true,400],'two links to the track: the change first, over the view, and Most played in it');
 g.history.go(1);await flush();scroller.scrollTop=0;g.document.activeElement=g.document.body;g.history.back();await flush();
 assert.deepEqual([g.document.activeElement===played,played.getBoundingClientRect().top,placeAsks(g)],[true,lower,gone],'Forward, then Back: focus on the link that showed, at its height');
});

test('a page of changes left while it loads comes back with Show earlier changes ready',async()=>{
 const e=setup({journey:true});await flush();e.discovery=url=>url.includes('/search?')?{items:[]}:entity(url.split('/').pop(),'track');
 // A server that answers pages of 10, so that the first press asks for a page.
 const records=changeFeed(23,9,clock.now);e.changes=changePage(records,undefined,10);
 await stagePlace(e,'#statistics/bermuda-day');const more=changeRegion(e).children.at(-1);
 // The page never answers; leaving drops it, as a browser rejects an aborted fetch.
 e.changes=(url,signal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))));
 more.emit('click');await flush();
 const page=e.changesRequests.at(-1);assert.deepEqual([more.textContent,more.getAttribute('aria-busy')],['Loading…','true']);
 follow(e,changeRows(e)[3]);await flush();assert.equal(page.signal.aborted,true,'leaving drops the page');
 e.history.back();await flush();
 assert.deepEqual([changeRegion(e).children.at(-1)===more,more.textContent,more.getAttribute('aria-disabled'),more.getAttribute('aria-busy'),changeRows(e).length],[true,'Show earlier changes',null,null,10],'the same button, ready to ask again');
 e.changes=changePage(records,undefined,10);more.emit('click');await flush();
 assert.deepEqual([changeRows(e).length,new URL(e.changesRequests.at(-1).url,'http://radio').searchParams.get('before')],[20,'14'],'and it asks for the same page');
 // A page that failed says Try again. Left and come back to, the place offers the page in its own words again.
 e.changes=()=>null;more.emit('click');await flush();assert.equal(more.textContent,'Try again');
 follow(e,changeRows(e)[3]);await flush();e.history.back();await flush();
 assert.deepEqual([changeRegion(e).children.at(-1)===more,more.textContent,more.getAttribute('aria-disabled'),changeRows(e).length],[true,'Show earlier changes',null,20],'a page that failed offers itself again');
});

// Step D2a: one journal of changes per station, for every place of the visit.
test('Try again asks the page that failed, also when another station\'s page came, and a clock set back reads a journal again',async()=>{
 const e=setup({journey:true});await flush();e.discovery={items:[]};
 const stageOfUrl=url=>url.split('/')[3],feeds={fontanna:changeFeed(230,9,clock.now),essentials:changeFeed(150,9,clock.now)};let down=true;
 // Both stations have a second page; Essentials' second page fails once.
 e.changes=url=>{const id=stageOfUrl(url);return down&&id==='essentials'&&url.includes('before=')?null:changePage(feeds[id]||[])(url);};
 e.response={...status('First'),...stageStats({scope:'radio'})};routeTo(e,'#statistics/radio');await flush();
 const more=()=>changeRegion(e).children.at(-1),rows=()=>byClass(changeRegion(e),'row').length,press=()=>{more().emit('click');return flush();},first=e.changesRequests.length;
 const asks=()=>e.changesRequests.slice(first).map(r=>stageOfUrl(r.url)+' '+new URL(r.url,'http://radio').searchParams.get('before'));
 for(let i=0;i<40&&e.changesRequests.length===first;i++)await press();
 assert.deepEqual([asks(),more().textContent],[['fontanna 131','essentials 51'],'Try again'],'one page came and one failed: Try again');
 const shown=rows();down=false;await press();
 assert.deepEqual([asks().slice(2).includes('essentials 51'),more().textContent,rows()],[true,'Show earlier changes',shown+10],'Try again asks the page that failed, and ten more rows show');
 // A clock set back does not keep a journal longer than its 5 minutes: the next place reads the station again.
 const before=e.changesRequests.length;e.clock.now-=60000;
 try{
  e.response={...status('First'),...stageStats({scope:'fontanna'}),...stageMusic()};routeTo(e,'#statistics/fontanna');await flush();
  assert.deepEqual([e.changesRequests.length,e.changesRequests.at(-1).url],[before+1,'/api/radio/fontanna/changes?limit=100'],'a journal read after now is read again');
 }finally{e.clock.now+=60000;}
});

test('each station\'s changes are read 100 at a time, page 1 at once and the next only on a press, kept 5 minutes and shared by the places, and a failed read is asked again',async()=>{
 const e=setup({journey:true});await flush();e.discovery={items:[]};
 const order=[...e.window.Pavoia.stations].map(s=>s.id),stageOfUrl=url=>url.split('/')[3],asked=id=>e.changesRequests.filter(r=>stageOfUrl(r.url)===id).length;
 // Fontanna and Essentials have more than a page of 100; the other stations have no change yet.
 const feeds={fontanna:changeFeed(125,9,clock.now),essentials:changeFeed(105,9,clock.now-3600000)},answers={};
 e.changes=(url,signal)=>{const id=stageOfUrl(url);return answers[id]?answers[id](url,signal):changePage(feeds[id]||[])(url);};
 const go=id=>{e.response={...status('First'),...stageStats({scope:id}),...(id==='radio'?{}:stageMusic())};routeTo(e,'#statistics/'+id);return flush();};
 const titles=()=>byClass(changeRegion(e),'row-name').map(textOf),press=()=>{changeRegion(e).children.at(-1).emit('click');return flush();};
 await go('radio');
 assert.deepEqual(e.changesRequests.map(r=>r.url),order.map(id=>'/api/radio/'+id+'/changes?limit=100'),'a place asks each of its stations once, for its first page of 100');
 e.clock.now+=299000;await go('fontanna');await go('essentials');
 assert.deepEqual([e.changesRequests.length,titles()],[9,changeFeed(105,9,0).slice(0,10).map(r=>r.title)],'the places after, within 5 minutes, ask for nothing');
 // A press that needs a page asks each station that has more, once.
 await go('radio');
 for(let i=0;i<30&&e.changesRequests.length===9;i++)await press();
 assert.deepEqual(e.changesRequests.slice(9).map(r=>r.url),['/api/radio/fontanna/changes?limit=100&before=26','/api/radio/essentials/changes?limit=100&before=6'],'a press that needs a page asks every station that has more for its next page');
 // Fontanna's place, after, shows the longer journal: every change, with no request.
 await go('fontanna');
 for(let i=0;i<12;i++)await press();
 assert.deepEqual([titles(),changeRegion(e).children.at(-1).localName,e.changesRequests.length],[feeds.fontanna.map(r=>r.title),'ol',11],'the next place shows the journal read so far, with no request');
 // Five minutes and one second after the first read, a place reads its station again.
 e.clock.now+=2000;await go('essentials');
 assert.deepEqual([e.changesRequests.length,e.changesRequests.at(-1).url],[12,'/api/radio/essentials/changes?limit=100'],'a journal older than 5 minutes is read again');
 // A first page that fails is not kept: the next place asks again, and keeps what it then reads.
 answers.closing=()=>null;await go('closing');await go('essentials');await go('closing');
 assert.deepEqual([asked('closing'),textOf(changeRegion(e).children[1])],[3,'The changes could not load.'],'a failed first page is asked again by the next place');
 delete answers.closing;await go('essentials');await go('closing');await go('essentials');await go('closing');
 assert.equal(asked('closing'),4,'then kept');
 // A first page that takes 12 s is dropped, and is asked again.
 answers.ambiance=(url,signal)=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))));
 await go('ambiance');e.fire(2000);await flush();const slow=e.changesRequests.at(-1);
 assert.deepEqual([stageOfUrl(slow.url),slow.signal.aborted,byClass(e.elements['music-content'],'entity-heading').length,textOf(changeRegion(e).children[1])],['ambiance',false,1,'The changes could not load.'],'the place shows without it, and says so');
 e.fire(12000);await flush();assert.equal(slow.signal.aborted,true,'12 s, and the read stops');
 delete answers.ambiance;await go('essentials');await go('ambiance');
 assert.equal(asked('ambiance'),3,'and the next place asks again');
 // A place left while its journal loads still fills the journal for the next place.
 let release;answers['palac-feel']=url=>new Promise(resolve=>{release=()=>resolve(changePage(changeFeed(4,4,clock.now))(url));});
 await go('palac-feel');const held=e.changesRequests.at(-1);routeTo(e,'#history');await flush();
 assert.deepEqual([stageOfUrl(held.url),held.signal.aborted],['palac-feel',false],'leaving the place lets the read go on');
 release();await flush();delete answers['palac-feel'];await go('palac-feel');
 assert.deepEqual([asked('palac-feel'),titles()],[2,['Change 4','Change 3','Change 2','Change 1']],'the next place shows it with no request');
 // A next page that takes 12 s says Try again; a page that repeats a change read already shows it once.
 const twice=changeFeed(110,9,clock.now);feeds['etage-zero']=twice;
 answers['etage-zero']=(url,signal)=>url.includes('before=')?new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')))):changePage(twice)(url);
 await go('etage-zero');for(let i=0;i<10;i++)await press();
 const late=e.changesRequests.at(-1);assert.deepEqual([late.url,changeRegion(e).children.at(-1).textContent],['/api/radio/etage-zero/changes?limit=100&before=11','Loading…']);
 e.fire(12000);await flush();
 assert.deepEqual([late.signal.aborted,changeRegion(e).children.at(-1).textContent,titles().length],[true,'Try again',100],'12 s, and the page stops: Try again');
 answers['etage-zero']=url=>url.includes('before=')?{trackingSince:'2026-10-07T00:15:13Z',changes:twice.slice(99),next:null}:changePage(twice)(url);
 await press();await press();
 assert.deepEqual([titles(),e.changesRequests.at(-1).url],[twice.map(r=>r.title),'/api/radio/etage-zero/changes?limit=100&before=11'],'every change once, newest first');
 // Try again while one station's page is still out asks only the station that failed: the page out serves both presses.
 const h=setup({journey:true});await flush();h.discovery={items:[]};let hold=null,fail=true;
 h.changes=url=>{const id=stageOfUrl(url),page=changePage(({fontanna:feeds.fontanna,essentials:feeds.essentials})[id]||[])(url);return !url.includes('before=')?page:id==='fontanna'?fail?null:page:new Promise(resolve=>{hold=()=>resolve(page);});};
 h.response={...status('First'),...stageStats({scope:'radio'})};routeTo(h,'#statistics/radio');await flush();
 const pressed=()=>{changeRegion(h).children.at(-1).emit('click');return flush();},rowsOf=()=>byClass(changeRegion(h),'row').length;
 for(let i=0;i<30&&h.changesRequests.length===9;i++)await pressed();
 const before=rowsOf();assert.equal(changeRegion(h).children.at(-1).textContent,'Try again');
 fail=false;await pressed();hold();await flush();
 assert.deepEqual([h.changesRequests.slice(9).map(r=>r.url),rowsOf()-before,changeRegion(h).children.at(-1).textContent],[['/api/radio/fontanna/changes?limit=100&before=26','/api/radio/essentials/changes?limit=100&before=6','/api/radio/fontanna/changes?limit=100&before=26'],10,'Show earlier changes'],'Try again asks Fontanna again and waits for the page of Essentials still out');
});

// Step 6, On air now: History's All stations. Each station's answer from one function of its id; a track started a minute
// before t0 that has `left` ms to run then, so its row asks again when it ends, 5 s after, between 20 s and 2 min.
const airAt=(t0,id,{left=300000,listeners=1,available=true,track=true}={})=>({track:track?{id:'7'+byStage.indexOf(id),title:'Title '+id,artist:'Artist '+id,startedAt:new Date(t0-60000).toISOString(),durationMs:60000+left}:null,
  audience:available?{available:true,listeners,measuredAt:new Date(t0).toISOString()}:{available:false}});
const airRows=e=>e.elements['music-content'].children.filter(n=>n.localName==='a');
// A row as read: its time, its name, its line, its link and whether it is Now.
const airRead=a=>[a.children[0].textContent,...a.children[1].children.map(textOf),a.getAttribute('href'),a.attrs['aria-current']??null];
const airAsks=(e,from=0)=>e.airRequests.slice(from).map(r=>r.id).sort();
// The view's timers: its waits are 20 s to 2 min, the ones no other part of the explorer uses.
const airWaits=e=>[...e.timers.values()].map(t=>t.delay).filter(d=>[20000,60000,65000,90000,95000,120000].includes(d)).sort((a,b)=>a-b);
const airOpen=async(e,air)=>{e.air=air;routeTo(e,'#history/radio');await flush();return e.elements['music-content'];};
const stationNames=['Under the Sun','As Night Begins','Night in Motion','Lost in Feelings','Etage 0','Fontanna','Ambiance','Closing','Essentials'];

test('History\'s All stations lists the nine stations in screen order with what each plays, and Now only on the tuned one',async()=>{
 const e=setup({journey:true});await flush();const t0=clock.now,content=await airOpen(e,id=>airAt(t0,id));
 assert.deepEqual([e.location.hash,content.children.map(n=>n.localName+'.'+n.className).slice(0,3),content.children[0].textContent,airRows(e).length,textOf(currentStage(e)),currentStage(e).getAttribute('href')],
  ['#history/radio',['h3.history-day','p.collection-note','a.row'],'On air now',9,'All stations','#history/radio'],'a day heading, the total, then nine rows; All stations is current in the row');
 const time=id=>new Date(t0-60000).toLocaleTimeString('en',{timeStyle:'short'});
 assert.deepEqual(airRows(e).map(airRead),byStage.map((id,i)=>[id==='palac-feel'?'Now':time(id),'Title '+id,'Artist '+id+' · '+stationNames[i],'#explore/plex_7'+i,id==='palac-feel'?'true':null]),'by stage: the time, the title over its artist and station, a link to the record; Now only on the station tuned');
 assert.deepEqual([airRows(e)[0].children[0].localName,airRows(e)[0].children[0].dateTime,airRows(e)[0].children[1].children.map(n=>n.className)],['time',new Date(t0-60000).toISOString(),['row-name','row-line']],'History\'s row: the time first');
 assert.deepEqual(airRows(e)[5].children[1].children[1].children.map(textOf),['Artist fontanna',' · Fontanna'],'the station in a span of its own, so a long artist ends before it');
 assert.deepEqual([e.elements['history-day-label'].hidden,e.elements['history-day-label'].attrs['data-off'],e.elements['history-more'].hidden,e.elements['music-status'].textContent],[false,'',true,''],'the Day field is off, and there is no Show earlier tracks');
 // Another language redraws the words in place, with no request.
 const asked=e.airRequests.length,rows=airRows(e);e.setLanguage('de');await flush();
 assert.deepEqual([content.children[0].textContent,airRows(e)[3].children[0].textContent,sameRows(airRows(e),rows),e.airRequests.length,textOf(currentStage(e))],['Gerade läuft','Jetzt',true,asked,'Alle Sender'],'in German, the same rows and no request');
 // By feeling, the rows follow that order.
 const f=setup({journey:true,storage:{getItem:key=>key==='pavoia-way'?'feeling':null,setItem(){}}});await flush();await airOpen(f,id=>airAt(t0,id));
 assert.deepEqual(airRows(f).map(a=>a.children[1].children[0].textContent),byFeeling.map(id=>'Title '+id),'the order on screen');
 const a=setup({journey:true});await flush();a.air=id=>airAt(t0,id);a.click();a.playing();a.change('03');await flush();await airOpen(a,id=>airAt(t0,id));
 assert.deepEqual(airRows(a).map(r=>r.attrs['aria-current']??null),byStage.map(id=>id==='palac-feel'?'true':null),'while another station shows, Now is on the station heard alone');
});

test('each station refreshes after its track ends, between 20 s and 2 min, and nothing is asked while hidden',async()=>{
 const e=setup({journey:true});await flush();const t0=clock.now,left={'bermuda-day':90000,'bermuda-evening':180000,'palac-dance':1000};
 await airOpen(e,id=>airAt(t0,id,{left:left[id]??300000}));
 assert.deepEqual([airAsks(e),airWaits(e)],[[...byStage].sort(),[20000,95000,...Array(7).fill(120000)]],'one request per station, then one wait each: 5 s past its end, at least 20 s, at most 2 min');
 let from=e.airRequests.length;clock.now=t0+95000;e.fire(95000);await flush();
 assert.deepEqual(airAsks(e,from),['bermuda-day'],'90 s left: asked again at +95 s');
 from=e.airRequests.length;clock.now=t0+120000;for(let i=0;i<7;i++)e.fire(120000);await flush();
 assert.ok(airAsks(e,from).includes('bermuda-evening'),'3 min left: asked at +120 s, the cap');
 assert.ok(airWaits(e).includes(65000),'then 65 s later, at +185 s');
 clock.now=t0+185000;from=e.airRequests.length;e.fire(65000);await flush();assert.deepEqual(airAsks(e,from),['bermuda-evening']);
 assert.ok(airWaits(e).every(d=>d>=20000&&d<=120000),'no station waits under 20 s or over 2 min');
 // Hidden, the view asks nothing and keeps no timer; shown, it asks all nine at once.
 e.document.hidden=true;e.document.emit('visibilitychange');from=e.airRequests.length;await flush();
 assert.deepEqual([airWaits(e),e.airRequests.length-from],[[],0],'hidden: no timer and no request');
 e.document.hidden=false;e.document.emit('visibilitychange');await flush();
 assert.deepEqual(airAsks(e,from),[...byStage,'palac-feel'].sort(),'shown: the nine stations, and the page\'s own poll of the station tuned');
 assert.equal(airWaits(e).length,9,'each with its wait again');
});

test('the total counts audio connections on all stations only when all nine answered, and hides a zero',async()=>{
 const e=setup({journey:true});await flush();const t0=clock.now,waiting=new Map();
 const content=await airOpen(e,id=>new Promise(resolve=>waiting.set(id,()=>resolve(airAt(t0,id,{listeners:byStage.indexOf(id)})))));
 const total=content.children[1];
 for(const id of byStage.slice(0,8))waiting.get(id)();await flush();
 assert.equal(total.textContent,'','eight answers: no total, never a part of it');
 waiting.get('essentials')();await flush();
 assert.equal(total.textContent,'36 listening on all stations','0 + 1 + … + 8, counted as the header counts, in its word');
 e.setLanguage('de');await flush();assert.equal(total.textContent,'36 hören auf allen Sendern');
 const one=setup({journey:true});await flush();await airOpen(one,id=>airAt(t0,id,{listeners:3,available:id!=='fontanna'}));
 assert.equal(one.elements['music-content'].children[1].textContent,'','one station that cannot count: no total');
 const zero=setup({journey:true});await flush();await airOpen(zero,id=>airAt(t0,id,{listeners:0}));
 assert.equal(zero.elements['music-content'].children[1].textContent,'','all at zero: no total');
 const failed=setup({journey:true});await flush();await airOpen(failed,id=>id==='closing'?null:airAt(t0,id,{listeners:2}));
 assert.equal(failed.elements['music-content'].children[1].textContent,'','one station failed: no total');
 for(const odd of ['3',2.5,-1]){const c=setup({journey:true});await flush();await airOpen(c,id=>airAt(t0,id,{listeners:id==='fontanna'?odd:2}));
  assert.equal(c.elements['music-content'].children[1].textContent,'',`a count of ${JSON.stringify(odd)}: not a count, so no total`);}
});

test('a station without a track or with an error says so in its row, and all failing offers Try again',async()=>{
 const e=setup({journey:true});await flush();const t0=clock.now;
 await airOpen(e,()=>new Promise(()=>{}));
 assert.deepEqual(airRows(e).map(airRead)[5],['','Fontanna','Loading track…',null,null],'before an answer: the station and Loading track…, no time and no link');
 e.air=id=>id==='fontanna'?{...airAt(t0,id),track:null}:id==='ambiance'?null:airAt(t0,id,{left:85000});e.document.hidden=true;e.document.emit('visibilitychange');e.document.hidden=false;e.document.emit('visibilitychange');await flush();
 assert.deepEqual([airRead(airRows(e)[5]),airRead(airRows(e)[6]),e.elements['music-status'].textContent],[['','Fontanna','No track announced',null,null],['','Ambiance','No track announced',null,null],''],'no track, or a failed answer: the station and No track announced; the others show');
 assert.deepEqual(airWaits(e).filter(d=>d===60000),[60000,60000],'each asks again in 1 min');
 let from=e.airRequests.length;e.fire(60000);e.fire(60000);await flush();
 assert.deepEqual([airAsks(e,from),airWaits(e).filter(d=>d===120000).length>=2],[['ambiance','fontanna'],true],'then every 2 min');
 e.air=id=>airAt(t0,id);e.fire(120000);e.fire(120000);await flush();
 assert.equal(airRead(airRows(e)[5])[1],'Title fontanna','a track again fills the row');
 // A station that never answers gives up after 6 s, says so and waits 1 min; the others do not wait for it.
 const h=setup({journey:true});await flush();await airOpen(h,id=>id==='etage-zero'?new Promise(()=>{}):airAt(t0,id));
 const sixes=()=>[...h.timers.values()].filter(t=>t.delay===6000).length;
 assert.deepEqual([airRead(airRows(h)[4]),airRead(airRows(h)[3])[1],sixes()],[['','Etage 0','Loading track…',null,null],'Title palac-feel',1],'it loads while the others show, under one 6 s limit');
 const before=airWaits(h).filter(d=>d===60000).length;h.fire(6000);await flush();
 assert.deepEqual([airRead(airRows(h)[4]),airWaits(h).filter(d=>d===60000).length-before],[['','Etage 0','No track announced',null,null],1],'after 6 s: No track announced, asked again in 1 min');
 // An answer for another station, or with a field that is not text, is not drawn, as the page's own poll reads it.
 const w=setup({journey:true});await flush();
 await airOpen(w,id=>id==='fontanna'?{...airAt(t0,id),stage:{id:'ambiance'}}:id==='closing'?{...airAt(t0,id),track:{...airAt(t0,id).track,title:42}}:id==='ambiance'?{...airAt(t0,id),track:{...airAt(t0,id).track,artist:null}}:airAt(t0,id));
 assert.deepEqual([5,6,7].map(i=>airRead(airRows(w)[i])),[['','Fontanna','No track announced',null,null],['','Ambiance','No track announced',null,null],['','Closing','No track announced',null,null]],'another station\'s answer, a numeric title, an artist that is not text: No track announced');
 // Every station failing says so in the status, with Try again; once one answers, the status goes.
 const f=setup({journey:true});await flush();await airOpen(f,()=>null);const status=f.elements['music-status'];
 const shown=x=>[x.elements['music-content'].children[0].hidden,x.elements['music-content'].children[1].hidden,...airRows(x).map(a=>a.hidden)];
 assert.deepEqual([said(status),shown(f)],['What plays now could not load. Try again',Array(11).fill(true)],'only the error and Try again, as History says it: the heading, the total and the rows step aside');
 f.setLanguage('de');await flush();assert.equal(said(status),'Was gerade läuft, konnte nicht geladen werden. Erneut versuchen');f.setLanguage('en');await flush();
 const retry=status.children[1];retry.focus();from=f.airRequests.length;f.air=id=>airAt(t0,id);retry.emit('click');await flush();
 assert.deepEqual([airAsks(f,from),said(status),f.document.activeElement===currentStage(f),shown(f)],[[...byStage].sort(),'',true,Array(11).fill(false)],'Try again asks all nine; its focus goes to All stations in the row, and the same rows come back');
 const one=setup({journey:true});await flush();await airOpen(one,id=>id==='closing'?null:airAt(t0,id));
 assert.deepEqual([said(one.elements['music-status']),shown(one).every(h=>!h)],['',true],'one station failing keeps the view, its row says so');
});

test('History\'s old addresses are unchanged, and a day after radio is dropped',async()=>{
 const e=setup({journey:true});await flush();e.historyReply=answer(played(5));e.air=id=>airAt(clock.now,id);
 for(const [typed,place,scope] of [['#history','#history/palac-feel','palac-feel'],['#history/bermuda-day','#history/bermuda-day','bermuda-day'],['#history/bermuda-day/2026-03-28','#history/bermuda-day/2026-03-28','bermuda-day'],['#history/radio/2026-03-28','#history/radio',null],['#history/radio','#history/radio',null]]){
  const asked=e.historyRequests.length;routeTo(e,typed);await flush();
  assert.deepEqual([e.location.hash,e.historyRequests.length>asked,e.elements['history-day-label'].hidden,e.elements['history-day-label'].attrs['data-off']===''],[place,Boolean(scope),false,!scope],typed);
  if(scope)assert.equal(new URL(e.historyRequests.at(-1).url,'http://radio').pathname,'/api/radio/'+scope+'/history');
 }
 assert.equal(stageLink(e,'fontanna').getAttribute('href'),'#history/fontanna','the day dropped from All stations goes: its stations link to today, the live list');
 routeTo(e,'#history/bermuda-day/2026-03-28');await flush();
 assert.deepEqual([stageLink(e,'radio').getAttribute('href'),stageLink(e,'fontanna').getAttribute('href'),e.elements['history-day'].value],['#history/radio','#history/fontanna/2026-03-28','2026-03-28'],'from a day, All stations links without it, the stations with it');
 assert.deepEqual(airWaits(e),[],'leaving All stations keeps no timer');
 routeTo(e,'#history/radio');await flush();assert.equal(airWaits(e).length,9);
 e.elements['explorer-close'].emit('click');await flush();assert.deepEqual([e.elements.explorer.open,airWaits(e)],[false,[]],'nor does closing the explorer');
 const from=e.airRequests.length;e.document.hidden=true;e.document.emit('visibilitychange');e.document.hidden=false;e.document.emit('visibilitychange');await flush();
 assert.deepEqual([airAsks(e,from),airWaits(e)],[['palac-feel'],[]],'closed, a tab shown again asks no station: the one request is the page\'s own poll');
});

test('rows stay in place and keep focus when they refresh',async()=>{
 const e=setup({journey:true});await flush();const t0=clock.now;let title='Title bermuda-day',track=true;
 await airOpen(e,id=>{const d=airAt(t0,id,{left:id==='bermuda-day'?90000:300000,track:id!=='bermuda-day'||track});if(d.track&&id==='bermuda-day')d.track.title=title;return d;});
 const rows=airRows(e),row=rows[0];e.elements.explorer.scrollTop=300;row.focus();
 title='Next one';clock.now=t0+95000;e.fire(95000);await flush();
 assert.deepEqual([sameRows(airRows(e),rows),row.children[1].children[0].textContent,e.document.activeElement===row,e.elements.explorer.scrollTop],[true,'Next one',true,300],'the same node, its new words, its focus and the scroll');
 // A row that loses its link hands focus to the current station in the row.
 track=false;e.fire(20000);await flush();
 assert.deepEqual([airRead(row),e.document.activeElement===currentStage(e)],[['','Under the Sun','No track announced',null,null],true],'never to the page');
 // Another station tuned moves Now in place, and the view asks nothing: the one request is the page's own poll.
 const from=e.airRequests.length;e.key('ArrowRight');await flush();
 assert.deepEqual([airRows(e).filter(a=>a.attrs['aria-current']).map(a=>a.children[1].children[0].textContent),airRows(e)[4].children[0].textContent,airRows(e)[3].children[0].textContent,airAsks(e,from),sameRows(airRows(e),rows)],
  [['Title etage-zero'],'Now',new Date(t0-60000).toLocaleTimeString('en',{timeStyle:'short'}),['etage-zero'],true],'Now moves to Etage 0, Lost in Feelings shows its time again');
});

test('back from a record to #history/radio asks all nine stations again and restarts their timers',async()=>{
 const e=setup({journey:true});await flush();const t0=clock.now;e.discovery=url=>entity(url.split('/').pop(),'track');
 await airOpen(e,id=>airAt(t0,id));const rows=airRows(e),row=rows[2];e.elements.explorer.scrollTop=200;
 follow(e,row);await flush();
 assert.deepEqual([e.location.hash,airWaits(e)],['#explore/plex_72',[]],'a record stops the view: no timer');
 const from=e.airRequests.length;e.elements.explorer.scrollTop=0;routeTo(e,'#history/radio');await flush();
 assert.deepEqual([sameRows(airRows(e),rows),e.document.activeElement===row,e.elements.explorer.scrollTop,airAsks(e,from),airWaits(e).length],[true,true,200,[...byStage].sort(),9],'the same rows, focus and place, and every station asked again with its timer');
});


test('On air now asks each station once per arrival, also by a browser move, and Try again reads Loading until each answers',async()=>{
 // A typed address or Forward restores twice, on popstate and on hashchange: nine requests, none dropped.
 const e=setup({journey:true});await flush();const t0=clock.now;e.air=id=>airAt(t0,id);e.visit('#history/radio');await flush();
 assert.deepEqual([airAsks(e),e.airRequests.filter(r=>r.signal.aborted).length,airRows(e).length],[[...byStage].sort(),0,9],'one request a station');
 // From a station's History to On air now by the address bar: the same.
 const g=setup({journey:true});await flush();g.air=id=>airAt(t0,id);routeTo(g,'#history/fontanna');await flush();
 const from=g.airRequests.length;g.visit('#history/radio');await flush();
 assert.deepEqual([airAsks(g,from),g.airRequests.slice(from).filter(r=>r.signal.aborted).length],[[...byStage].sort(),0]);
 // After every station failed, Try again brings the rows back on the first answer; the stations still asked read Loading.
 const f=setup({journey:true});await flush();await airOpen(f,()=>null);
 const waiting=new Map();f.air=id=>new Promise(resolve=>waiting.set(id,()=>resolve(airAt(t0,id))));
 f.elements['music-status'].children[1].emit('click');await flush();
 assert.equal(airRows(f).every(a=>a.hidden),true,'while none answered, the error stays');
 waiting.get('fontanna')();await flush();
 assert.deepEqual([airRows(f).every(a=>!a.hidden),airRead(airRows(f)[5])[1],airRead(airRows(f)[6])],[true,'Title fontanna',['','Ambiance','Loading track…',null,null]],'Fontanna answered; Ambiance is still asked, and says so');
});

test('On air now: a miss after a track waits 1 min again, a track with no end 2 min, and a row never shows what it has not',async()=>{
 const e=setup({journey:true});await flush();const t0=clock.now;e.elements.explorer.scrollTop=300;
 // The tuned station names no track; Closing's id is no track; Fontanna's start is no time.
 const odd=id=>id==='palac-feel'?{...airAt(t0,id),track:null}:id==='closing'?{...airAt(t0,id),track:{...airAt(t0,id,{left:85000}).track,id:'x y'}}:id==='fontanna'?{...airAt(t0,id),track:{...airAt(t0,id).track,startedAt:'x'}}:airAt(t0,id,{left:85000});
 await airOpen(e,odd);
 assert.equal(e.elements.explorer.scrollTop,0,'a first entry starts at its top');
 assert.deepEqual([airRead(airRows(e)[3]),airRead(airRows(e)[7]).slice(3),airRead(airRows(e)[5])[0]],[['','Lost in Feelings','No track announced',null,null],[null,null],''],'no Now on the tuned station without a track; no link for an id that is no track; no time for a start that is none');
 assert.deepEqual([airWaits(e).filter(d=>d===120000).length,airWaits(e).filter(d=>d===60000).length],[1,1],'the track with no end asks again in 2 min, the station with no track in 1 min');
 // A miss, a track, then a miss again: 1 min each time, since a track ends the count of misses.
 const f=setup({journey:true});await flush();const t1=clock.now;let phase='miss';
 await airOpen(f,id=>id==='ambiance'&&phase==='miss'?null:airAt(t1,id,{left:85000}));
 const waits=delay=>airWaits(f).filter(d=>d===delay).length;
 assert.deepEqual([waits(60000),waits(90000),waits(120000)],[1,8,0]);
 phase='track';f.fire(60000);await flush();assert.deepEqual([airRead(airRows(f)[6])[1],waits(90000)],['Title ambiance',9]);
 phase='miss';clock.now=t1+90000;
 try{for(let i=0;i<9;i++)f.fire(90000);await flush();
  assert.deepEqual([airRead(airRows(f)[6])[2],waits(60000),waits(120000)],['No track announced',1,0],'1 min, not 2');
 }finally{clock.now=t1;}
});

test('a release can be cut too, and a record painted from a copy, before its own answer, is not called cut',async()=>{
 const e=setup({journey:true});await flush();const show=shower(e);
 // A compilation that counts 5 tracks and lists 2.
 await show(tracked(rec(id('rel',1),'Big Compilation',[],{artist:'Various Artists',trackCount:5}),[song(1,'One',{artist:'A'}),song(2,'Two',{artist:'B'})]));
 const region=()=>onRadioOf(e);
 assert.deepEqual([textOf(region().children[0]),textOf(region().children.at(-1))],['On the radio 2 of 5','Not all of them are listed here yet.'],'a release says n of m as an artist does');
 // A track's answer brings a copy of its artist, who counts 16 tracks. The artist's own answer fails: the body paints
 // with the one track at hand, and says nothing about a cut, because only the record's own answer can tell.
 const artist=id('art',700),one={...song(1,'Only One'),connections:[{id:artist,relation:'primary'}]};
 const copy={...rec(artist,'Maceo Plex',[[one.id,'track']]),trackCount:16};
 e.discovery=url=>url.endsWith(one.id)?{entity:one,included:[copy]}:null;
 e.visit('#explore/'+one.id);await flush();e.visit('#explore/'+artist);await flush();
 assert.deepEqual([textOf(region().children[0]),byClass(region(),'collection-note').length],['On the radio 1',0],'the tracks at hand, with no claim about the rest');
});

test('a move inside the open explorer writes the canonical address once',async()=>{
 const e=await indexed();e.historyReply=()=>({items:[],next:null});
 const link=href=>e.document.emit('click',{button:0,target:{closest:()=>({getAttribute:()=>href})},preventDefault(){}});
 link('#explore/art_000000000a01');await flush();assert.equal(e.elements.explorer.open,true);
 for(const [href,address] of [['#history','#history/palac-feel'],['#statistics/palac-feel/artists','#index/artists/palac-feel?by=tracks'],['#index','#index/artists'],['#statistics','#statistics/palac-feel']]){
  const writes=countWrites(e);link(href);
  assert.deepEqual([e.location.hash,writes()],[address,1],href+' from another place is written once, at '+address);
  await flush();assert.deepEqual([e.location.hash,writes()],[address,1],'and nothing renames it after');
 }
});

// One history entry for each move: the browser's Back and Forward, and a phone's Back gesture, walk the visit, and ✕
// leaves all of it in one step.
const titleShown=e=>inspector(e).descendants().find(n=>n.localName==='h3')?.textContent;
const walk=async(e,ids)=>{for(const id of ids){routeTo(e,'#explore/'+id);await flush();}};
// Every history.go(delta) the page asks for from now on, still carried out.
const goes=e=>{const steps=[],go=e.history.go;e.history.go=function(delta){steps.push(delta);go.call(this,delta);};return steps;};

test('each record and each tab move is one entry, and Back and Forward walk them',async()=>{
 const e=setup({journey:true});await flush();e.discovery=url=>entity(url.split('/').pop());e.historyReply=()=>({items:[],next:null});
 await walk(e,['art_000000000001','art_000000000002','art_000000000003']);routeTo(e,'#history');await flush();routeTo(e,'#statistics');await flush();
 assert.deepEqual([e.entries(),e.position(),e.history.length],[['','#explore/art_000000000001','#explore/art_000000000002','#explore/art_000000000003','#history/palac-feel','#statistics/palac-feel'],5,6],'3 records and 2 tabs: 5 entries above the page');
 e.history.go(-1);await flush();assert.deepEqual([e.elements.explorer.open,e.location.hash,e.elements['music-view'].dataset.view],[true,'#history/palac-feel','history'],'Back shows the tab before');
 e.history.go(-1);await flush();assert.deepEqual([e.location.hash,titleShown(e)],['#explore/art_000000000003','Name art_000000000003'],'and then the record before');
 e.history.go(-1);await flush();assert.deepEqual([e.location.hash,titleShown(e)],['#explore/art_000000000002','Name art_000000000002']);
 e.history.go(1);await flush();assert.deepEqual([e.location.hash,titleShown(e),e.position()],['#explore/art_000000000003','Name art_000000000003',3],'Forward shows it again');
 e.history.go(1);await flush();assert.deepEqual([e.location.hash,e.elements['music-view'].dataset.view,e.entries().length],['#history/palac-feel','history',6],'and the tab after it, with every entry kept');
});

test('typing a search, the filter, at= and the Day field write the entry in place',async()=>{
 const e=await indexed();laidIndex(e);e.historyReply=()=>({items:[],next:null});
 e.discovery=url=>url.includes('/search?')?{items:[{id:'art_0123456789ab',type:'artist',title:'Jimi Jules'}]}:entity(url.split('/').pop());
 routeTo(e,'#explore');await flush();const query=e.elements['discovery-query'];
 query.value='jimi';query.emit('input');e.fire(300);await flush();let kept=e.entries().length;
 for(const typed of ['jimi j','jimi ju']){query.value=typed;query.emit('input');e.fire(300);await flush();}
 assert.deepEqual([e.location.hash,e.entries().length],['#explore?q=jimi%20ju',kept],'the search after its first results');
 routeTo(e,'#index/artists');await flush();kept=e.entries().length;
 const explorer=e.elements.explorer;explorer.scrollTop=2500;explorer.emit('scroll');explorer.emit('scroll');e.fire('frame');e.fire(250);
 assert.deepEqual([e.location.hash,e.entries().length],['#index/artists?at=F',kept],'the at= mark');
 typeIndex(e,'am');typeIndex(e,'ame');
 assert.deepEqual([e.location.hash,e.entries().length],['#index/artists?q=ame',kept],'the filter');
 routeTo(e,'#history/bermuda-day');await flush();kept=e.entries().length;const day=e.elements['history-day'];
 for(const value of ['2026-03-28','2026-03-27']){day.value=value;day.emit('change');await flush();}
 assert.deepEqual([e.location.hash,e.entries().length],['#history/bermuda-day/2026-03-27',kept],'the Day field, one day at a time');
 e.history.go(-1);await flush();assert.equal(e.location.hash,'#index/artists?q=ame','so Back skips the days and the keys typed');
});

test('the first result list after a record adds one entry, and the next keys replace it',async()=>{
 const e=setup({journey:true});await flush();const query=e.elements['discovery-query'];
 e.discovery=url=>url.includes('/search?')?{items:[{id:'art_0123456789ab',type:'artist',title:'Jimi Jules'}]}:entity(url.split('/').pop());
 routeTo(e,'#explore/art_000000000001');await flush();
 query.value='jimi';query.emit('input');e.fire(300);await flush();
 assert.deepEqual([e.entries(),e.position()],[['','#explore/art_000000000001','#explore?q=jimi'],2],'the first results are one entry over the record');
 query.value='jimx';query.emit('input');e.fire(300);await flush();query.value='jim';e.elements['discovery-search'].emit('submit',{preventDefault(){}});await flush();
 assert.deepEqual([e.entries(),e.position()],[['','#explore/art_000000000001','#explore?q=jim'],2],'the next keys write that entry');
 e.history.go(-1);await flush();assert.deepEqual([e.location.hash,titleShown(e)],['#explore/art_000000000001','Name art_000000000001'],'Back from the search returns to the record');
});

test('✕ and Escape leave the whole visit in one step, onto the page entry',async()=>{
 const e=setup({journey:true});await flush();e.discovery=url=>entity(url.split('/').pop());
 const ids=['art_000000000001','art_000000000002','art_000000000003','art_000000000004','art_000000000005'];
 for(const leave of [()=>e.elements['explorer-close'].emit('click'),()=>e.key('Escape')]){
  await walk(e,ids);assert.deepEqual([e.history.state.depth,e.position()],[4,5],'depth 4');
  const steps=goes(e);leave();await flush();
  assert.deepEqual([steps,e.position(),e.location.hash,e.elements.explorer.open],[[-5],0,'',false],'one step back to the page');
 }
});

test('a shared link: moves from it add entries, and ✕ goes back to it and closes in place',async()=>{
 const e=setup({journey:true,hash:'#explore/art_0123456789ab'});await flush();e.discovery=url=>entity(url.split('/').pop());
 assert.deepEqual([e.history.state.owned,e.history.state.depth],[0,0],'a shared link is found, not owned');
 await walk(e,['art_000000000001','art_000000000002']);
 assert.deepEqual([e.entries(),e.history.state.depth],[['#explore/art_0123456789ab','#explore/art_000000000001','#explore/art_000000000002'],2],'each move adds one entry');
 const steps=goes(e);e.elements['explorer-close'].emit('click');await flush();
 assert.deepEqual([steps,e.position(),e.elements.explorer.open,e.location.hash,e.url()],[[-2],0,false,'','/?station='+e.window.Pavoia.getState().stage],'✕ goes back to the shared link\'s entry and closes it in place, onto the radio');
});

test('where the Navigation API says the page entry is gone or in another document, ✕ closes in place',async()=>{
 // The Navigation API as Chromium keeps it: every entry of the harness, and those the test marks as another document.
 const api=(e,other=()=>false)=>({entries:()=>e.urls().map((url,index)=>({url:'https://radio.test'+url,index,sameDocument:!other(index)})),get currentEntry(){return {index:e.position()};},canGoBack:true});
 for(const [what,other,expected] of [['in this document',()=>false,[-3]],['in another document',i=>i===0,[]]]){
  const e=setup({journey:true});await flush();e.discovery=url=>entity(url.split('/').pop());e.window.navigation=api(e,other);
  await walk(e,['art_000000000001','art_000000000002','art_000000000003']);
  const steps=goes(e),at=e.position();e.elements['explorer-close'].emit('click');await flush();
  assert.deepEqual([steps,e.position(),e.elements.explorer.open,e.location.hash],[expected,expected.length?0:at,false,''],'the page entry '+what);
 }
 // The page entry pruned, as the oldest entries of a long history are: the entry the visit counts back to is gone.
 const pruned=setup({journey:true});await flush();pruned.discovery=url=>entity(url.split('/').pop());
 await walk(pruned,['art_000000000001','art_000000000002','art_000000000003']);pruned.evict(1);pruned.window.navigation=api(pruned);
 let steps=goes(pruned);pruned.elements['explorer-close'].emit('click');await flush();
 assert.deepEqual([steps,pruned.elements.explorer.open,pruned.location.hash,pruned.position()],[[],false,'',2],'a page entry gone: it closes in place');
 // An owned visit whose entry n steps back holds an explorer place: that entry is not the page, so it is not taken for it.
 const e=setup({journey:true,hash:'#explore/art_000000000003',state:{explorer:1,seen:1,base:1,depth:1,owned:1,key:'1:3'},below:[{hash:''},{hash:'#explore/art_000000000001'},{hash:'#explore/art_000000000002'}]});await flush();
 e.discovery=url=>entity(url.split('/').pop());e.window.navigation=api(e);
 steps=goes(e);e.elements['explorer-close'].emit('click');await flush();
 assert.deepEqual([steps,e.elements.explorer.open,e.location.hash,e.position()],[[],false,'',3],'an explorer entry where the page should be: it closes in place');
});

test('without the Navigation API, ✕ closes in place when the page entry would be past the start of the history',async()=>{
 const e=setup({journey:true});await flush();e.discovery=url=>entity(url.split('/').pop());
 await walk(e,['art_000000000001','art_000000000002','art_000000000003','art_000000000004']);e.evict(1);
 assert.deepEqual([e.history.length,e.history.state.depth+1],[4,4],'the page entry is gone: 4 entries, and the page would be 4 back');
 const steps=goes(e);e.elements['explorer-close'].emit('click');await flush();
 assert.deepEqual([steps,e.elements.explorer.open,e.location.hash],[[],false,''],'it closes in place');
 routeTo(e,'#explore/art_000000000005');await flush();
 assert.deepEqual([e.elements.explorer.open,e.location.hash,titleShown(e)],[true,'#explore/art_000000000005','Name art_000000000005'],'and the close does not stay on its way: a later move opens');
});

test('past depth 40 a move replaces the entry, so ✕ still reaches the page in one step',async()=>{
 const e=setup({journey:true});await flush();e.discovery=url=>entity(url.split('/').pop());
 await walk(e,Array.from({length:45},(_,i)=>'art_'+(i+1).toString(16).padStart(12,'0')));
 assert.deepEqual([e.entries().length,e.history.state.depth,e.location.hash,titleShown(e)],[42,40,'#explore/art_00000000002d','Name art_00000000002d'],'45 moves: the page, then depths 0 to 40, the last one shown');
 const steps=goes(e);e.elements['explorer-close'].emit('click');await flush();
 assert.deepEqual([steps,e.position(),e.location.hash,e.elements.explorer.open],[[-41],0,'',false]);
});

test('after a reload, moves carry the old base, and ✕ without the Navigation API closes in place',async()=>{
 const old=n=>({explorer:1,seen:1,base:1,depth:n,owned:1,key:'1:'+(n+1)});
 const e=setup({journey:true,hash:'#explore/art_000000000003',state:old(2),below:[{hash:''},{hash:'#explore/art_000000000001',state:old(0)},{hash:'#explore/art_000000000002',state:old(1)}]});await flush();
 e.discovery=url=>entity(url.split('/').pop());
 routeTo(e,'#explore/art_000000000004');await flush();
 assert.deepEqual([e.history.state.base,e.history.state.depth,e.history.state.owned,e.history.length],[1,3,1,5],'the move carries the base of the visit, from the page life before the reload');
 const steps=goes(e);e.elements['explorer-close'].emit('click');await flush();
 assert.deepEqual([steps,e.elements.explorer.open,e.location.hash,e.position()],[[],false,'',4],'no Back into entries another document may hold: it closes in place');
});

test('one browser move restores once',async()=>{
 const e=setup({journey:true});await flush();e.discovery=url=>entity(url.split('/').pop());
 await walk(e,['art_000000000001']);
 let before=e.discoveryRequests.length;e.visit('#explore/art_000000000002');await flush();
 assert.equal(e.discoveryRequests.length-before,1,'popstate restores; the hashchange after it asks nothing');
 before=e.discoveryRequests.length;e.location.hash='#explore/art_000000000003';e.window.emit('hashchange');await flush();
 assert.deepEqual([e.discoveryRequests.length-before,titleShown(e)],[1,'Name art_000000000003'],'a hash written with no popstate still restores');
});

test('a station change deep in a visit adds no entry, and ✕ lands on the station tuned',async()=>{
 const e=setup({journey:true});await flush();e.discovery=url=>entity(url.split('/').pop());
 await walk(e,['art_000000000001','art_000000000002','art_000000000003','art_000000000004']);
 const kept=e.entries().length,from=e.window.Pavoia.getState().stage;e.key('ArrowRight');await flush();const to=e.window.Pavoia.getState().stage;
 assert.notEqual(to,from);assert.deepEqual([e.entries().length,e.location.search],[kept,'?station='+to],'the arrow names the station in the entry shown');
 e.elements['explorer-close'].emit('click');await flush();
 assert.deepEqual([e.url(),e.position(),e.elements.explorer.open],['/?station='+to,0,false]);
});

test('a pushState or a replaceState that throws during a move still opens the place',async()=>{
 const e=setup({journey:true});await flush();e.discovery=url=>entity(url.split('/').pop());
 await walk(e,['art_000000000001']);
 for(const name of ['pushState','replaceState'])e.history[name]=()=>{throw new Error('SecurityError: too many calls to the History API');};
 routeTo(e,'#explore/art_000000000002');await flush();
 assert.deepEqual([titleShown(e),e.elements.explorer.open],['Name art_000000000002',true],'the record shows, though the address lags');
 routeTo(e,'#explore/art_000000000003');await flush();
 assert.equal(titleShown(e),'Name art_000000000003','and the next move works');
});

test('the Roots tab on the record on air adds no entry, and from another record it adds one',async()=>{
 const e=setup({journey:true});await flush();
 // The roots rename the record on air, as they rename every plex_ one.
 e.discovery=url=>url.endsWith('/entity/plex_123')?entity('trk_0000000000aa','track'):entity(url.split('/').pop());
 routeTo(e,'#explore');await flush();assert.equal(e.location.hash,'#explore/trk_0000000000aa');
 const kept=e.entries().length,writes=countWrites(e);
 routeTo(e,'#explore');await flush();
 assert.deepEqual([e.location.hash,e.entries().length,writes()],['#explore/trk_0000000000aa',kept,0],'a link to the record on air, shown already, changes nothing');
 routeTo(e,'#explore/art_000000000001');await flush();routeTo(e,'#explore');await flush();
 assert.deepEqual([e.location.hash,e.entries().length,titleShown(e)],['#explore/trk_0000000000aa',kept+2,'Name trk_0000000000aa'],'from another record it is one entry, on the record on air');
 e.history.go(-1);await flush();assert.deepEqual([e.location.hash,titleShown(e)],['#explore/art_000000000001','Name art_000000000001'],'and Back returns to that record');
});

test('Back from a tab to a record puts focus on its title, from a field or a link above the rows too',async()=>{
 const e=await indexed();laidIndex(e);e.historyReply=()=>({items:[],next:null});
 const title=()=>inspector(e).descendants().find(n=>n.localName==='h3');
 for(const [tab,field] of [['#index/artists','index-query'],['#history/bermuda-day','history-day'],['#history/bermuda-day','stage-row']]){
  routeTo(e,'#explore/art_000000000001');await flush();routeTo(e,tab);await flush();
  e.elements[field].focus();e.history.go(-1);await flush();
  assert.deepEqual([e.location.hash,e.document.activeElement===title(),title()?.textContent],['#explore/art_000000000001',true,'Name art_000000000001'],field);
 }
});

test('an address typed short restores once, and a push the browser refuses keeps the depth true',async()=>{
 // A typed #history fires popstate, then hashchange. The first restore rewrites it to its full address; the second
 // event finds the place shown and asks nothing.
 const e=setup({journey:true});await flush();e.discovery=url=>entity(url.split('/').pop());e.historyReply=()=>({items:[],next:null});
 await walk(e,['art_000000000001']);
 const asked=e.historyRequests.length;e.visit('#history');await flush();
 assert.deepEqual([e.location.hash,e.historyRequests.length-asked],['#history/palac-feel',1],'one History request for one typed address');
 // Only pushState throws: the move replaces the entry shown, so the visit is no deeper and ✕ still counts right.
 const f=setup({journey:true});await flush();f.discovery=url=>entity(url.split('/').pop());
 await walk(f,['art_000000000001','art_000000000002']);
 const depth=f.history.state.depth,at=f.position(),entries=f.entries().length,push=f.history.pushState;
 f.history.pushState=()=>{throw new Error('SecurityError: too many calls to the History API');};
 routeTo(f,'#explore/art_000000000003');await flush();
 assert.deepEqual([titleShown(f),f.location.hash,f.history.state.depth,f.position(),f.entries().length],['Name art_000000000003','#explore/art_000000000003',depth,at,entries],'the place opens in the entry shown, at the same depth');
 f.history.pushState=push;f.elements['explorer-close'].emit('click');await flush();
 assert.deepEqual([f.elements.explorer.open,f.position(),f.location.hash],[false,0,''],'✕ goes back to the page entry in one step');
});

// Explore plan step 4: Back and Forward return to the place left. A record comes back whole in one paint, at the scroll
// it had, with the regions that were open, and focus on the link that was followed; until then the last view stays.
const regionOf=(e,key)=>byClass(inspector(e),'region').find(r=>r.dataset.key===key);
// A row of the record shown, as a browser finds its region from it.
const rowTo=(e,href,key)=>{const row=byClass(key?regionOf(e,key):inspector(e),'row').find(a=>a.getAttribute('href')===href),region=byClass(inspector(e),'region').find(r=>r.descendants().includes(row));
 row.closest=selector=>selector==='.region'?region:null;return row;};
// Each state the record passes through, one microtask after another, until it settles: one paint is two states, the
// last view and the place.
const states=async read=>{const seen=[];for(let i=0;i<64;i++){const s=JSON.stringify(read());if(seen.at(-1)!==s)seen.push(s);await Promise.resolve();}return seen.map(s=>JSON.parse(s));};
const painted=e=>()=>({title:titleShown(e),regions:byClass(inspector(e),'region').length>0,top:e.elements.explorer.scrollTop});
// The explorer as index.html nests it: the search field, the music view, the results and the record are inside it, so
// focus on a record's link or title is focus in the explorer, and the player bar is outside.
const nested4=e=>{const el=e.elements;el['explore-workspace'].append(inspector(e));el.explorer.append(el['discovery-query'],el['music-view'],el['discovery-results'],el['explore-workspace']);return e;};
// Recondite, whose naming fetches Eulberg: an answer that failed is not kept, so Back asks again, and a test holds it.
const recondite4=async()=>{
 const e=nested4(setup({journey:true}));await flush();const data=hood(),gate={hold:false,fail:false,release:null};
 e.discovery=url=>{const key=url.split('/').pop();if(url.includes('/search?'))return {items:[{id:'art_0123456789ab',type:'artist',title:'Jimi Jules'},{id:'art_0123456789ac',type:'artist',title:'Jimi Two'}]};
  if(key==='art_000000000101'&&gate.hold)return new Promise(resolve=>{gate.release=()=>resolve(data[key]);});if(key==='art_000000000101'&&gate.fail)return null;return data[key]||entity(key);};
 return {e,data,gate};
};

test('Back to a record brings back its scroll and focuses the link that was followed, in one paint',async()=>{
 const {e}=await recondite4();const explorer=e.elements.explorer,eulberg='#explore/art_000000000101';
 routeTo(e,'#explore/art_000000000001');await flush();explorer.scrollTop=600;
 const more=()=>byClass(inspector(e),'bio-foot')[0]?.children[0];more().emit('click');
 follow(e,rowTo(e,eulberg,'similar'));await flush();
 assert.deepEqual([titleShown(e),explorer.scrollTop],['Dominik Eulberg',0],'a link opens the next record at its title');
 e.history.go(-1);const seen=await states(painted(e));
 assert.deepEqual(seen,[{title:'Dominik Eulberg',regions:true,top:0},{title:'Recondite',regions:true,top:600}],'the header, the regions and the scroll arrive together');
 const focus=e.document.activeElement;
 assert.deepEqual([focus.getAttribute?.('href'),regionOf(e,'similar').contains(focus),e.history.state.top,e.history.state.next,e.history.state.region],[eulberg,true,600,eulberg,'similar'],'focus is on the link followed, in its region; the place is on its entry too');
 assert.deepEqual([more().getAttribute('aria-expanded'),more().textContent,more().hidden],['true','Less',false],'the biography opened stays open');
});

test('Forward to a record brings back its scroll, in one paint',async()=>{
 const {e}=await recondite4();const explorer=e.elements.explorer;
 routeTo(e,'#explore/art_000000000001');await flush();follow(e,rowTo(e,'#explore/art_000000000101','similar'));await flush();
 explorer.scrollTop=400;e.history.go(-1);await flush();
 e.history.go(1);const seen=await states(painted(e));
 assert.deepEqual(seen,[{title:'Recondite',regions:true,top:0},{title:'Dominik Eulberg',regions:true,top:400}],'Eulberg comes back whole at 400 px, in one paint');
 assert.equal(e.document.activeElement,explorer,'left by Back, it names no link, and its title is 400 px up: the explorer takes focus, so the first Tab keeps the scroll');
 // The same move back to a record left at its top: its title shows, and takes focus.
 explorer.scrollTop=0;e.history.go(-1);await flush();e.history.go(1);await flush();
 assert.deepEqual([explorer.scrollTop,e.document.activeElement===inspector(e).descendants().find(n=>n.localName==='h3')],[0,true],'at 0 px the title shows: focus is on it');
});

test('Show all, then a link from row 8, then Back, shows the region whole at the same scroll, focused on row 8',async()=>{
 const e=nested4(setup({journey:true}));await flush();const explorer=e.elements.explorer,T=n=>id('trk',n);
 const tracks=Array.from({length:8},(_,i)=>rec(T(i+1),'Track '+(i+1),[[id('art',1),'primary']],{artist:'Recondite',durationMs:300000,playlists:[{code:'LIF',station:'Lost in Feelings'}]}));
 const similar=Array.from({length:7},(_,i)=>rec(id('art',101+i),'Similar '+(i+1),[],{trackCount:7-i}));
 e.discovery=url=>url.endsWith('/art_000000000001')?{entity:rec(id('art',1),'Recondite',[...tracks.map(t=>[t.id,'track']),...similar.map(a=>[a.id,'similar'])],{trackCount:8}),included:[...tracks,...similar]}:entity(url.split('/').pop(),'track');
 routeTo(e,'#explore/art_000000000001');await flush();
 const shown=()=>[byClass(regionOf(e,'onRadio'),'row').length,'data-open' in regionOf(e,'onRadio').attrs,byClass(regionOf(e,'onRadio'),'text-button').length];
 assert.deepEqual(shown(),[6,false,1],'six rows, then Show all');
 byClass(regionOf(e,'onRadio'),'text-button')[0].emit('click');
 assert.deepEqual(shown(),[8,true,0],'Show all shows them whole and marks the region open');
 byClass(regionOf(e,'similar'),'text-button')[0].emit('click');
 explorer.scrollTop=900;follow(e,rowTo(e,'#explore/'+T(8),'onRadio'));await flush();
 assert.deepEqual([titleShown(e),explorer.scrollTop],['Track 8',0]);
 e.history.go(-1);await flush();
 assert.deepEqual([titleShown(e),shown(),explorer.scrollTop,e.document.activeElement.getAttribute?.('href'),regionOf(e,'onRadio').contains(e.document.activeElement)],['Recondite',[8,true,0],900,'#explore/'+T(8),true],'the region whole, at 900 px, focus on row 8');
 assert.deepEqual([byClass(regionOf(e,'similar'),'row').length,'data-open' in regionOf(e,'similar').attrs,byClass(regionOf(e,'similar'),'text-button').length],[7,true,0],'and Similar artists, opened too, is whole as well');
});

test('Back to a record no longer cached keeps the last view dimmed until the body paints',async()=>{
 const e=setup({journey:true});await flush();const workspace=e.elements['explore-workspace'];let release=null,held=false;
 e.discovery=url=>{const key=url.split('/').pop();return key==='art_000000000001'&&held?new Promise(resolve=>{release=()=>resolve(entity(key));}):entity(key);};
 // 17 records: the explorer keeps the last 16 payloads, so the first one's is gone, and only its record stays.
 const ids=Array.from({length:17},(_,i)=>'art_'+String(i+1).padStart(12,'0'));await walk(e,ids);held=true;
 e.history.go(-16);await flush();
 assert.deepEqual([e.location.hash,titleShown(e),workspace.getAttribute('aria-busy'),workspace.inert,workspace.hidden,e.discoveryRequests.at(-1).url],['#explore/art_000000000001','Name art_000000000017','true',true,false,'/api/discovery/entity/art_000000000001'],'the last record stays, dimmed and out of reach, while the payload loads');
 release();await flush();
 assert.deepEqual([titleShown(e),workspace.getAttribute('aria-busy'),workspace.inert],['Name art_000000000001',null,false],'then the record paints, and the explorer is in reach again');
});

test('a deferred Back paint starts the 2.5 s deadline',async()=>{
 const {e,gate}=await recondite4();gate.fail=true;const workspace=e.elements['explore-workspace'];
 routeTo(e,'#explore/art_000000000001');await flush();routeTo(e,'#explore/art_000000000300');await flush();
 gate.fail=false;gate.hold=true;e.history.go(-1);await flush();
 assert.deepEqual([titleShown(e),workspace.getAttribute('aria-busy'),[...e.timers.values()].filter(t=>t.delay===2500).length],['Name art_000000000300','true',1],'the naming answer waits, and the deadline runs from the start');
 e.fire(2500);await flush();
 assert.deepEqual([titleShown(e),byClass(inspector(e),'region').length>0,workspace.getAttribute('aria-busy')],['Recondite',true,null],'2.5 s later the header and the body paint, with the records at hand');
 gate.release();await flush();
 assert.equal([...e.timers.values()].filter(t=>t.delay===10000).length,0,'and the 10 s limit goes once the naming answer settles');
});

test('Back from the Index to a record never shows an empty explorer',async()=>{
 const {e,gate}=await recondite4();gate.fail=true;e.names={artists:artistNames(),labels:labelNames()};const music=e.elements['music-view'],workspace=e.elements['explore-workspace'];
 routeTo(e,'#explore/art_000000000001');await flush();routeTo(e,'#index/artists');await flush();
 gate.fail=false;gate.hold=true;e.history.go(-1);await flush();
 assert.deepEqual([music.hidden,music.inert,music.getAttribute('aria-busy'),workspace.hidden,e.elements['discovery-status'].textContent],[false,true,'true',true,''],'the Index stays, dimmed and out of reach, with no Loading line');
 assert.match(cssRules().get('#music-view[aria-busy=true], #discovery-results[aria-busy=true]'),/opacity:\.45; transition:opacity var\(--panel\) var\(--ease\)/,'dimmed as a hop dims the last record');
 gate.release();await flush();
 assert.deepEqual([music.hidden,music.inert,music.getAttribute('aria-busy'),workspace.hidden,titleShown(e)],[true,false,null,false,'Recondite'],'then the record shows in its place');
});

test('Back from the search results to a record never shows an empty explorer',async()=>{
 const {e,gate}=await recondite4();gate.fail=true;const results=e.elements['discovery-results'],workspace=e.elements['explore-workspace'],query=e.elements['discovery-query'];
 routeTo(e,'#explore/art_000000000001');await flush();query.value='jimi';query.emit('input');e.fire(300);await flush();
 assert.deepEqual([e.location.hash,results.hidden,workspace.hidden],['#explore?q=jimi',false,true]);
 gate.fail=false;gate.hold=true;e.history.go(-1);await flush();
 assert.deepEqual([results.hidden,results.inert,results.getAttribute('aria-busy'),workspace.hidden],[false,true,'true',true],'the results stay, dimmed and out of reach');
 gate.release();await flush();
 assert.deepEqual([results.hidden,results.inert,results.getAttribute('aria-busy'),workspace.hidden,titleShown(e)],[true,false,null,false,'Recondite'],'then the record shows in their place');
});

test('a language switch or the 1100 px crossing during a deferred Back paint draws nothing early',async()=>{
 const {e,gate}=await recondite4();gate.fail=true;
 routeTo(e,'#explore/art_000000000001');await flush();routeTo(e,'#explore/art_000000000300');await flush();
 gate.fail=false;gate.hold=true;e.history.go(-1);await flush();
 const before=[...inspector(e).descendants()];
 e.setLanguage('de');e.queries.get('(min-width:1100px)').change(true);await flush();
 assert.ok(sameRows(inspector(e).descendants(),before),'the last record stays as it was');
 gate.release();await flush();
 assert.deepEqual([titleShown(e),textOf(inspector(e).descendants().find(n=>cls(n)==='eyebrow')),Boolean(byClass(inspector(e),'neighbourhood').length)],['Recondite','Künstler',true],'then the record paints once, in German, as a map');
});

test('Back to the search page shows the same results at the same scroll, focused on the result opened',async()=>{
 const {e}=await recondite4();const explorer=e.elements.explorer,results=e.elements['discovery-results'],query=e.elements['discovery-query'];
 routeTo(e,'#explore/art_000000000001');await flush();query.value='jimi';query.emit('input');e.fire(300);await flush();
 const rows=byClass(results,'row');explorer.scrollTop=300;follow(e,rows[1]);await flush();
 assert.deepEqual([e.location.hash,titleShown(e),explorer.scrollTop],['#explore/art_0123456789ac','Name art_0123456789ac',0]);
 e.history.go(-1);await flush();
 assert.deepEqual([e.location.hash,results.hidden,sameRows(byClass(results,'row'),rows),explorer.scrollTop,e.document.activeElement===rows[1]],['#explore?q=jimi',false,true,300,true],'the same rows, at 300 px, focus on the one opened');
});

test('Forward to a record whose payload fails hides the search results kept on screen, and says it is unavailable',async()=>{
 const {e}=await recondite4();const results=e.elements['discovery-results'],workspace=e.elements['explore-workspace'],query=e.elements['discovery-query'],status=e.elements['discovery-status'];
 const old=e.discovery;e.discovery=url=>url.endsWith('/art_0123456789ac')?null:old(url);
 routeTo(e,'#explore/art_000000000001');await flush();query.value='jimi';query.emit('input');e.fire(300);await flush();
 follow(e,byClass(results,'row')[1]);await flush();
 const unavailable=['#explore/art_0123456789ac',true,false,null,true,'These details are unavailable. Try another record or search again.'];
 const seen=()=>[e.location.hash,results.hidden,results.inert,results.getAttribute('aria-busy'),workspace.hidden,textOf(status)];
 assert.deepEqual(seen(),unavailable,'a hop hides the results and says the record is unavailable');
 e.history.go(-1);await flush();
 assert.deepEqual([e.location.hash,results.hidden],['#explore?q=jimi',false],'Back shows the results again');
 e.history.go(1);await flush();
 assert.deepEqual(seen(),unavailable,'Forward hides them as the hop did, with nothing dimmed left behind');
});

test('Back or Forward with focus on the player keeps it there; focus elsewhere in the explorer goes to the place',async()=>{
 const {e}=await recondite4();const title=()=>inspector(e).descendants().find(n=>n.localName==='h3');
 routeTo(e,'#explore/art_000000000001');await flush();routeTo(e,'#explore/art_000000000300');await flush();
 // The arrows step the station unless a range has focus: the volume keeps the keys it was given.
 for(const name of ['volume','play']){
  const control=e.elements[name];control.focus();e.history.go(-1);await flush();
  assert.deepEqual([titleShown(e),e.document.activeElement===control],['Recondite',true],name+' keeps focus on Back');
  e.history.go(1);await flush();
  assert.deepEqual([titleShown(e),e.document.activeElement===control],['Name art_000000000300',true],name+' keeps focus on Forward');
 }
 e.elements['discovery-query'].focus();e.history.go(-1);await flush();
 assert.deepEqual([titleShown(e),e.document.activeElement===title()],['Recondite',true],'from the search field, focus goes to the record');
});

test('Back during a hop to a record not at hand keeps no scroll for it',async()=>{
 const {e}=await recondite4();const explorer=e.elements.explorer,old=e.discovery;let release=null,hold=false;
 e.discovery=url=>url.endsWith('/art_000000000300')&&hold?new Promise(resolve=>{release=()=>resolve(old(url));}):old(url);
 routeTo(e,'#explore/art_000000000001');await flush();explorer.scrollTop=600;
 hold=true;routeTo(e,'#explore/art_000000000300');await flush();
 assert.deepEqual([titleShown(e),e.elements['explore-workspace'].getAttribute('aria-busy')],['Recondite','true'],'Recondite stays, dimmed, while the next record loads');
 e.history.go(-1);await flush();hold=false;release();await flush();
 assert.deepEqual([titleShown(e),explorer.scrollTop],['Recondite',600]);
 e.history.go(1);await flush();
 assert.deepEqual([e.location.hash,titleShown(e),explorer.scrollTop],['#explore/art_000000000300','Name art_000000000300',0],'the record never shown opens at its title, not at the scroll of the one dimmed over it');
});

test('a second Back while a place paint waits keeps the place of the record that waits',async()=>{
 const {e,gate}=await recondite4();gate.fail=true;const explorer=e.elements.explorer,query=e.elements['discovery-query'];
 routeTo(e,'#explore/art_000000000001');await flush();explorer.scrollTop=500;
 query.value='jimi';query.emit('input');e.fire(300);await flush();explorer.scrollTop=300;
 gate.fail=false;gate.hold=true;e.history.go(-1);await flush();
 assert.deepEqual([e.location.hash,e.elements['discovery-results'].getAttribute('aria-busy')],['#explore/art_000000000001','true'],'Recondite waits, the results dimmed at 300 px');
 e.history.go(-1);await flush();
 assert.equal(e.elements.explorer.open,false,'a second Back leaves the explorer');
 gate.hold=false;gate.release();e.history.go(1);await flush();
 assert.deepEqual([titleShown(e),explorer.scrollTop],['Recondite',500],'Forward opens Recondite at its own 500 px, not at the results\' 300 px');
});

test('✕ from the Index, then Forward, never shows the last visit\'s Index',async()=>{
 const {e,gate}=await recondite4();gate.fail=true;e.names={artists:artistNames(),labels:labelNames()};const music=e.elements['music-view'],workspace=e.elements['explore-workspace'];
 routeTo(e,'#explore/art_000000000001');await flush();routeTo(e,'#index/artists');await flush();
 e.elements['explorer-close'].emit('click');await flush();
 assert.deepEqual([e.elements.explorer.open,e.location.hash],[false,'']);
 gate.fail=false;gate.hold=true;e.history.go(1);await flush();
 assert.deepEqual([e.location.hash,music.hidden,music.inert,music.getAttribute('aria-busy'),workspace.hidden,e.elements['discovery-status'].textContent],['#explore/art_000000000001',true,false,null,true,'Loading the connections…'],'a new visit says it is loading, with no Index dimmed behind');
 gate.release();await flush();
 assert.deepEqual([titleShown(e),workspace.hidden,e.elements['discovery-status'].textContent],['Recondite',false,'']);
});

test('after a reload, Back brings a record back at the place written on its entry',async()=>{
 const old=n=>({explorer:1,seen:1,base:1,depth:n,owned:1,key:'1:'+(n+1)}),data=hood(),eulberg='#explore/art_000000000101';
 const e=nested4(setup({journey:true,hash:eulberg,state:old(1),below:[{hash:''},{hash:'#explore/art_000000000001',state:{...old(0),top:600,next:eulberg,region:'similar'}}]}));
 // The page loads before the test answers for records, so Eulberg says it is unavailable; Recondite answers.
 e.discovery=url=>data[url.split('/').pop()]||entity(url.split('/').pop());await flush();
 e.history.go(-1);await flush();
 const focus=e.document.activeElement;
 assert.deepEqual([titleShown(e),e.elements.explorer.scrollTop,focus.getAttribute?.('href'),regionOf(e,'similar').contains(focus)],['Recondite',600,eulberg,true],'the page life before the reload left Recondite at 600 px, by Eulberg');
});

test('after a reload, Back to the first record keeps the link followed where it stood, from the place on its entry',async()=>{
 const old=n=>({explorer:1,seen:1,base:1,depth:n,owned:1,key:'1:'+(n+1)}),data=hood(),eulberg='#explore/art_000000000101';
 // Left with no line, its title 200 px down the record; it comes back with a line forward, 33 px taller.
 const e=nested4(setup({journey:true,hash:eulberg,state:old(1),below:[{hash:''},{hash:'#explore/art_000000000001',state:{...old(0),top:600,next:eulberg,region:'similar',head:200}}]}));
 const explorer=e.elements.explorer,box=e.Element.prototype.getBoundingClientRect;explorer.scrollTop=0;
 e.Element.prototype.getBoundingClientRect=function(){if(this===explorer)return {left:0,right:0,width:0,height:700,top:64,bottom:764};
  const line=this.className==='entity-trail',at=this===inspector(e)||line?144:this.localName==='h3'?344+(this.parent?.parent?.children[0]?.className==='entity-trail'?33:0):null;
  if(at===null)return box.call(this);const top=at-explorer.scrollTop,height=line?17:40;return {left:0,right:0,width:0,height,top,bottom:top+height};};
 try{
  e.discovery=url=>data[url.split('/').pop()]||entity(url.split('/').pop());await flush();
  e.history.go(-1);await flush();
  assert.deepEqual([titleShown(e),byClass(inspector(e),'entity-trail').length,explorer.scrollTop],['Recondite',1,633],'the page life before the reload left Recondite at 600 px with no line: he comes back 33 px further down');
 }finally{e.Element.prototype.getBoundingClientRect=box;}
});

test('Back to a record at hand whose payload fails opens it at its title, at 0 px',async()=>{
 const {e,gate}=await recondite4();gate.fail=true;const explorer=e.elements.explorer,workspace=e.elements['explore-workspace'];
 routeTo(e,'#explore/art_000000000001');await flush();follow(e,rowTo(e,'#explore/art_000000000101','similar'));await flush();
 assert.equal(titleShown(e),'Dominik Eulberg','its header from the copy Recondite brought, its payload failed');
 explorer.scrollTop=600;routeTo(e,'#explore/art_000000000300');await flush();
 e.history.go(-1);await flush();
 assert.deepEqual([titleShown(e),explorer.scrollTop,e.document.activeElement===inspector(e).descendants().find(n=>n.localName==='h3'),workspace.getAttribute('aria-busy')],['Dominik Eulberg',0,true,null],'it fails again: the record opens at its title, as a hop opens it');
});

test('Back to a track drawn from an included copy paints its header and its body once, preview included',async()=>{
 const e=nested4(setup({journey:true}));await flush();const data=hood(),T1='trk_000000000001',T2='trk_000000000002';let fail=true,release=null;
 // Its own payload brings a preview and its artist, which the copy in Recondite's payload lacks.
 const own={entity:{...data.art_000000000001.included.find(r=>r.id===T1),previewUrl:'/api/discovery/preview/'+T1,connections:[{id:'art_000000000001',relation:'primary'}]},included:[data.art_000000000001.entity]};
 e.discovery=url=>{const key=url.split('/').pop();if(key===T1)return fail?null:own;if(key===T2)return new Promise(resolve=>{release=()=>resolve(entity(T2,'track'));});return data[key]||entity(key);};
 routeTo(e,'#explore/art_000000000001');await flush();routeTo(e,'#explore/'+T1);await flush();
 // The next track's header paints from its copy too, and its body waits.
 routeTo(e,'#explore/'+T2);await flush();
 assert.deepEqual([titleShown(e),byClass(inspector(e),'region').length],['Track 2',0]);
 fail=false;e.history.go(-1);const seen=await states(()=>({title:titleShown(e),regions:byClass(inspector(e),'region').length>0,preview:byClass(inspector(e),'preview').length>0}));
 assert.deepEqual(seen.map(s=>s.title+(s.regions?' whole':'')),['Track 2','Track 1 whole'],'the last header stays until Track 1 paints whole, never its header alone');
 release();await flush();
});
