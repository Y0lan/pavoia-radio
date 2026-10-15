const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { runInNewContext } = require('node:vm');
const source = readFileSync(resolve(__dirname, '../web/app.js'), 'utf8');
const flush = async () => { for (let i=0;i<8;i++) await Promise.resolve(); };
const status = (title, count=2) => ({track:{id:'123', title, artist:'Artist '+title}, audience:{available:true,listeners:count,measuredAt:new Date().toISOString()}});

function setup({deferFetch=false,deferImages=false,saveData=false,hash='',storage={getItem:()=>null,setItem(){}}}={}) {
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
  }
  const ids=['audio','play','player','player-title','player-artist','player-album','playback-status','moods','station-selector','station-selector-home','station-sheet-list','stations-sheet','open-stations','close-stations','station-position','poster','mood-name','mood-place','mood-line','photo','photo-buffer','photo-controls','photo-count','change-photo','artwork-toggle','bus-link','bus-copy','live-text','language','wordmark','signed'];
  const nodes=ids.map(id=>Object.assign(new Element(),{id}));
  const elements=new Proxy({}, {get:(_target,id)=>nodes.find(node=>node.id===id)});
  elements.photo.src='photos/selected/p005.jpg';
  elements['station-selector'].scrollWidth=elements['station-selector'].clientWidth=0;
  const body=new Element();
  const audio=elements.audio;
  audio.paused=true;audio.readyState=0;audio.calls=[];
  audio.pause=()=>{audio.paused=true;};
  audio.load=()=>{audio.readyState=0;audio.error=null;audio.ended=false;};
  audio.play=()=>{audio.paused=false;return new Promise((resolve,reject)=>audio.calls.push({resolve,reject,src:audio.src}));};
  const actions={},timers=new Map(),intervals=[];let timerID=0;
  const mediaSession={setActionHandler(name,fn){actions[name]=fn;}};
  const document={body,documentElement:new Element(),fonts:{ready:Promise.resolve()},getElementById:id=>elements[id],createElement:()=>new Element(),createElementNS:()=>new Element(),
    querySelector:selector=> selector.startsWith('input') ? new Element() : elements[selector.slice(1)],
    querySelectorAll:()=>[],addEventListener(){}};
  class MediaMetadata{constructor(value){Object.assign(this,value);}}
  const window=new Element(),location={hash,pathname:'/',search:''};
  window.MediaMetadata=MediaMetadata;
  const history={pushState(_state,_title,url){location.hash=url.includes('#')?url.slice(url.indexOf('#')):'';}};
  const env={elements,audio,actions,timers,mediaSession,document,window,location,imageRequests,requests:[],response:status('First'),
    click:()=>elements.play.emit('click'),change:id=>elements.moods.emit('change',{target:{value:id}}),
    playing:()=>{audio.readyState=4;audio.emit('playing');},
    error:()=>{audio.error={code:2};audio.emit('error');},
    poll:()=>intervals[0](),
    pollAudience:()=>intervals[1](),
    fire(delay){const entry=[...timers].find(([,v])=>v.delay===delay);assert.ok(entry,`Missing ${delay}ms timer`);timers.delete(entry[0]);entry[1].fn();},
    complete(index,data){const r=this.requests[index];r.resolve({ok:true,json:async()=>({...data,stage:{id:r.url.split('/').pop()}})});},
  };
  runInNewContext(source,{document,navigator:{mediaSession,connection:{saveData}},window,location,history,MediaMetadata,AbortController,
    matchMedia:()=>({matches:false,addEventListener(){}}),Image:class extends Element {constructor(){super();env.preloader=this;}},
    localStorage:storage,
    fetch:(url,{signal})=>url.startsWith('/api/audience?') ? Promise.resolve({ok:!(env.audienceResponse instanceof Error),json:async()=>env.audienceResponse || env.response.audience}) : new Promise((resolve,reject)=>{
      env.requests.push({url,signal,resolve,reject});
      if(!deferFetch){if(env.response instanceof Error)reject(env.response);else env.complete(env.requests.length-1,env.response);}
    }),
    setTimeout:(fn,delay)=>{timers.set(++timerID,{fn,delay});return timerID;},clearTimeout:id=>timers.delete(id),
    setInterval:fn=>intervals.push(fn),
  });
  return env;
}

test('photo-only toggle hides artwork, is remembered and works without storage',async()=>{
 const saved={},storage={getItem:key=>saved[key] ?? null,setItem(key,value){saved[key]=value;}};
 const e=setup({storage});await flush();const toggle=e.elements['artwork-toggle'],body=e.document.body;
 assert.equal(body.getAttribute('data-photo-only'),null);assert.equal(toggle.textContent,'Photo only');
 toggle.emit('click');assert.equal(body.getAttribute('data-photo-only'),'');assert.equal(toggle.textContent,'Show artwork');assert.equal(saved['pavoia-photo-only'],'on');
 const restored=setup({storage});await flush();
 assert.equal(restored.document.body.getAttribute('data-photo-only'),'');assert.equal(restored.elements['artwork-toggle'].textContent,'Show artwork');
 toggle.emit('click');assert.equal(body.getAttribute('data-photo-only'),null);assert.equal(saved['pavoia-photo-only'],'off');
 const denied=()=>{throw new Error('Storage denied');};
 const blocked=setup({storage:{getItem:denied,setItem:denied}});await flush();
 blocked.elements['artwork-toggle'].emit('click');assert.equal(blocked.document.body.getAttribute('data-photo-only'),'');
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
 assert.equal(e.elements['playback-status'].textContent,'Tap to play');assert.equal(e.timers.size,0);
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
 await flush();assert.equal(e.elements['player-title'].textContent,'Current');e.audienceResponse=status('Count',7).audience;await e.pollAudience();assert.equal(e.elements['live-text'].textContent,'Live · 7');
 const poll=e.poll();await flush();assert.equal(e.requests.length,4);e.complete(3,status('Next'));await poll;
 assert.equal(e.elements['player-title'].textContent,'Next');
});

test('live audience updates independently and never presents missing data as zero',async()=>{
 const e=setup();await flush();e.audienceResponse=status('Count',0).audience;await e.pollAudience();assert.equal(e.elements['live-text'].textContent,'Live · 0');
 e.audienceResponse=status('Count',2).audience;await e.pollAudience();assert.equal(e.elements['live-text'].textContent,'Live · 2');
 e.response=status('Old metadata count',0);await e.poll();assert.equal(e.elements['live-text'].textContent,'Live · 2');
 e.audienceResponse.measuredAt=new Date(0).toISOString();await e.pollAudience();assert.equal(e.elements['live-text'].textContent,'Live');
 e.audienceResponse=new Error('Unavailable');await e.pollAudience();assert.equal(e.elements['live-text'].textContent,'Live');
 e.response=new Error('Offline');await e.poll();assert.equal(e.elements['live-text'].textContent,'Data unavailable');assert.equal(e.mediaSession.metadata,null);
 e.response={track:null,audience:{available:false,listeners:null}};await e.poll();assert.equal(e.elements['player-album'].textContent,'');
});

test('language switching preserves playback and station',async()=>{
 const e=setup();await flush();e.change('07');await flush();
 assert.equal(e.requests.at(-1).url,'/api/radio/fontanna');
 assert.equal(e.elements['mood-place'].textContent,'The simple happiness of dancing together in daylight. Being there already feels good; the music makes you want to join in.');
 e.click();e.playing();
 e.elements.language.value='de';e.elements.language.emit('change');
 assert.equal(e.document.documentElement.lang,'de');assert.equal(e.elements['playback-status'].textContent,'Wiedergabe');
 assert.equal(e.audio.src,'/stream/fontanna.mp3');assert.equal(e.audio.calls.length,1);
 assert.equal(e.elements['mood-place'].textContent,'Die einfache Freude, bei Tageslicht zusammen zu tanzen. Hier zu sein fühlt sich schon gut an; die Musik macht Lust, mitzutanzen.');
 assert.equal(e.mediaSession.metadata.album,'Fontanna');
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
 e.elements.language.value='de';e.elements.language.emit('change');assert.equal(e.elements.photo.src,first);
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
 assert.equal(e.document.title,'The Bus · Pavoia Radio');
 assert.equal(e.elements['mood-place'].textContent,'Somewhere in the forest');
 assert.equal(e.elements['bus-copy'].hidden,false);assert.equal(e.elements['change-photo'].hidden,true);
 assert.equal(e.elements.photo.src,'photos/bus-stage.jpg');
 assert.equal(e.audio.src,source);assert.equal(e.audio.calls.length,calls);assert.equal(e.audio.paused,false);
 e.response=status('New track');await e.poll();
 assert.equal(e.elements['player-title'].textContent,'New track');assert.equal(e.elements.photo.src,'photos/bus-stage.jpg');
 assert.equal(e.window.Pavoia.getState().stage,'palac-dance');assert.equal(e.mediaSession.metadata.album,'Night in Motion');
 e.elements.language.value='de';e.elements.language.emit('change');
 assert.equal(e.elements['mood-place'].textContent,'Irgendwo im Wald');
 e.location.hash='';e.window.emit('popstate');await flush();assert.equal(e.elements.photo.src,photo);
 e.location.hash='#bus';e.window.emit('popstate');
 e.elements.moods.emit('click',{target:{name:'mood',value:'03'}});
 assert.equal(e.location.hash,'');assert.equal(e.elements.photo.src,photo);assert.equal(e.audio.calls.length,calls);
 e.location.hash='#bus';e.window.emit('hashchange');e.change('01');await flush();
 assert.equal(e.location.hash,'');assert.equal(e.audio.src,'/stream/bermuda-day.mp3');
});

test('direct Bus links remain paused and use the regular station for playback',async()=>{
 const e=setup({hash:'#bus'});await flush();
 assert.equal(e.elements['bus-copy'].hidden,false);assert.equal(e.audio.calls.length,0);
 assert.equal(e.elements.play.disabled,false);assert.notEqual(e.elements['player-title'].textContent,'Not on air yet');
 e.click();e.playing();assert.equal(e.audio.src,'/stream/palac-feel.mp3');
 await flush();e.actions.pause();assert.equal(e.audio.src,undefined);assert.equal(e.elements.photo.src,'photos/bus-stage.jpg');
 e.location.hash='#explore/art_123456789abc';e.window.Pavoia.renderScene();await flush();
 assert.equal(e.elements['bus-copy'].hidden,true);assert.notEqual(e.elements.photo.src,'photos/bus-stage.jpg');
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
