'use strict';
// Which records sit close to a record, ranked, each with its evidence. Pure: no page, no network and no words.
// A reason is a list of {kind, names}: names are record ids (relation tokens for kind 'relation', plain text for
// kind 'text'), and journey.js puts them into words.
(function(root){
  const types={art:'artist',rel:'release',lab:'label',trk:'track',pl:'playlist'};
  const typeOf=id=>types[String(id).split('_')[0]];
  const tokens=relation=>String(relation||'').split('/');
  const isSimilar=relation=>tokens(relation).includes('similar');
  const isRelated=relation=>tokens(relation).some(t=>['collaboration','remix','shared_release'].includes(t)||t.startsWith('musicbrainz:'));
  const links=record=>record?.connections||[];
  const linked=(record,type)=>[...new Set(links(record).filter(c=>typeOf(c.id)===type).map(c=>c.id))];
  const roles=['primary','featured','remixer'];

  // Every record within two steps of an artist, scored. The second step walks the artist's own neighbours,
  // which its payload always carries, so records fetched later only name candidates: no score changes.
  function artistCandidates(A,docs){
    const out=new Map(),get=id=>out.get(id)||out.set(id,{id,score:0,direct:null,similarPath:false,steps:[]}).get(id);
    for(const {id,relation} of links(A))if(id!==A.id){const c=get(id);c.direct=relation;c.score+=isSimilar(relation)?3:2;}
    for(const {id} of links(A)){
      const n=docs.get(id);if(!n||id===A.id)continue;
      // A big label links 80 artists: a path through it says little.
      const half=n.type==='label'&&links(n).length>20?.5:1;
      for(const s of links(n)){
        if(s.id===A.id)continue;
        const c=get(s.id),similar=isSimilar(s.relation),related=isRelated(s.relation),w=(similar?1.5:related?1:.5)*half;
        c.score+=w;
        c.steps.push({via:id,w,kind:similar?'similar':related?'worked':n.type==='label'?'label':n.type==='artist'?'artist':'release'});
        if(typeOf(s.id)==='artist'&&n.type==='artist'&&similar)c.similarPath=true;
      }
    }
    for(const c of out.values()){const d=docs.get(c.id);if(c.direct&&d?.type==='artist')c.score+=jaccard(A.tags,d.tags);}
    return out;
  }
  function jaccard(x,y) {const a=new Set(x||[]),b=new Set(y||[]);let both=0;for(const t of a)if(b.has(t))both++;const all=a.size+b.size-both;return all?both/all:0;}
  // A second-step artist is similar only when an artist next to the record calls it similar: shared labels, releases
  // or collaborations, even with a similar artist, are never presented as proof of sound.
  const similarOf=(A,docs)=>[...artistCandidates(A,docs).values()].filter(c=>c.id!==A.id&&typeOf(c.id)==='artist'&&(c.direct?isSimilar(c.direct)&&!isRelated(c.direct):c.similarPath&&c.score>=1));
  // The steps, grouped by the words that say them, two groups at most: the similar ones first, since only they make
  // an artist similar, then the strongest. A release or a label reached from the record says where it appears too:
  // "Also on", like a label.
  const wording={similar:'similarTo',worked:'workedWithNames',label:'alsoOn',release:'alsoOn',artist:'byNames'};
  function told(steps) {
    const groups=new Map();
    for(const s of [...steps].sort((a,b)=>b.w-a.w)){const g=groups.get(wording[s.kind])||groups.set(wording[s.kind],{w:0,names:[]}).get(wording[s.kind]);g.w+=s.w;if(!g.names.includes(s.via))g.names.push(s.via);}
    return [...groups].sort((a,b)=>(b[0]==='similarTo')-(a[0]==='similarTo')||b[1].w-a[1].w).slice(0,2).map(([kind,g])=>({kind,names:g.names}));
  }
  const strongest=steps=>steps.reduce((best,s)=>!best||s.w>best.w?s:best,null)?.via||null;
  const by=(c,kind)=>[...new Set(c.steps.filter(s=>s.kind===kind).map(s=>s.via))];

  // The credited artists whose own neighbourhoods rank a track's or a release's similar artists: up to 3 for a
  // track, and only 1 to 3 for a release, so a compilation has none.
  function credited(centre) {
    const people=[...new Set(links(centre).filter(c=>typeOf(c.id)==='artist'&&(centre.type==='release'||tokens(c.relation).some(t=>roles.includes(t)))).map(c=>c.id))];
    return centre.type==='track'?people.slice(0,3):centre.type==='release'&&people.length<=3?people:[];
  }

  // The regions around a record, in the order they show. A region lists only records named in docs, while total
  // and ids count every candidate that passes: the naming plan looks for the unnamed ones.
  function regions(centre,docs) {
    const doc=id=>docs.get(id),date=id=>doc(id)?.releaseDate||'',title=id=>doc(id)?.title||'',tracks=id=>doc(id)?.trackCount||0;
    const byScore=(a,b)=>b.score-a.score||tracks(b.id)-tracks(a.id)||title(a.id).localeCompare(title(b.id));
    const newest=(a,b)=>date(b.id).localeCompare(date(a.id))||title(a.id).localeCompare(title(b.id));
    const fact=id=>doc(id)?.type==='release'?/^\d{4}/.exec(date(id))?.[0]||'':doc(id)?.type==='artist'?tracks(id):'';
    const region=(key,list)=>({key,total:list.length,ids:list.map(c=>c.id),items:list.filter(c=>docs.has(c.id)).map(c=>({id:c.id,type:doc(c.id).type,title:title(c.id),image:doc(c.id).image,score:c.score??0,direct:Boolean(c.direct),via:c.via??null,reason:c.reason||[],fact:fact(c.id)}))});
    // Similar labels and releases count each shared artist once: two or more when any candidate has them, else one.
    const shared=(artists,type)=>{
      const count=new Map();
      for(const a of artists)for(const id of linked(doc(a),type))if(id!==centre.id)(count.get(id)||count.set(id,[]).get(id)).push(a);
      const all=[...count].map(([id,names])=>({id,names,score:names.length})),two=all.filter(c=>c.names.length>=2);
      return two.length?two:all;
    };
    // A track's or a release's similar artists: those of each credited artist, scores summed, the credits left out. The
    // reason names who calls each one similar: the credited artist for a direct link, else the artist on its similar
    // step. The map hangs it from the credited artist that brought it.
    const similarTo=credits=>{
      const sum=new Map(),first=list=>[...new Set(list.sort((a,b)=>b[1]-a[1]).map(f=>f[0]))];
      for(const a of credits)if(doc(a))for(const c of similarOf(doc(a),docs)){
        if(credits.includes(c.id)||c.id===centre.id)continue;
        const s=sum.get(c.id)||sum.set(c.id,{id:c.id,score:0,from:[],by:[]}).get(c.id);s.score+=c.score;s.from.push([a,c.score]);
        for(const w of c.direct?[a]:by(c,'similar'))s.by.push([w,c.score]);
      }
      return [...sum.values()].sort(byScore).map(s=>({...s,via:first(s.from)[0],reason:[{kind:'similarTo',names:first(s.by)}]}));
    };
    if(centre.type==='artist'){
      const all=[...artistCandidates(centre,docs).values()].filter(c=>c.id!==centre.id),of=type=>all.filter(c=>typeOf(c.id)===type);
      const similar=similarOf(centre,docs).sort(byScore).map(c=>({...c,via:c.direct?null:strongest(c.steps),reason:c.direct?[{kind:'similarTo',names:[centre.id]}]:told(c.steps)}));
      const worked=of('artist').filter(c=>c.direct&&isRelated(c.direct)).sort(byScore).map(c=>({...c,reason:[{kind:'relation',names:tokens(c.direct).filter(isRelated)}]}));
      // Its own releases and labels first; then those its artist neighbours share, said by whose they are.
      const near=type=>of(type).filter(c=>!c.direct&&c.score>=1&&by(c,'artist').length).sort(byScore).map(c=>({...c,via:strongest(c.steps),reason:[{kind:type==='release'?'byNames':'labelOf',names:by(c,'artist')}]}));
      const label=id=>linked(doc(id),'label').find(l=>docs.has(l));
      const releases=[...of('release').filter(c=>c.direct).sort(newest).map(c=>({...c,reason:label(c.id)?[{kind:'title',names:[label(c.id)]}]:[]})),...near('release')];
      return [region('similar',similar),region('worked',worked),region('releases',releases),region('labels',[...of('label').filter(c=>c.direct).sort(byScore),...near('label')])];
    }
    if(centre.type==='track'||centre.type==='release'){
      const credits=credited(centre),own=type=>linked(centre,type).map(id=>({id,score:0}));
      const madeBy=links(centre).filter((c,i,all)=>typeOf(c.id)==='artist'&&(centre.type==='release'||tokens(c.relation).some(t=>roles.includes(t)))&&all.findIndex(d=>d.id===c.id)===i)
        .map(c=>({id:c.id,score:0,reason:centre.type==='track'?[{kind:'relation',names:tokens(c.relation).filter(t=>roles.includes(t))}]:[]}));
      // What its credited artists have of a type, beyond the record's own, said by who has it.
      const theirs=(type,kind)=>{
        const mine=new Set(linked(centre,type)),count=new Map();
        for(const a of credits)for(const id of linked(doc(a),type))if(id!==centre.id)(count.get(id)||count.set(id,[]).get(id)).push(a);
        const say=id=>count.get(id)?.length?[{kind,names:count.get(id)}]:[];
        return {own:[...mine].map(id=>({id,score:0,reason:say(id)})),more:[...count].filter(([id])=>!mine.has(id)).map(([id,names])=>({id,score:names.length,reason:say(id)}))};
      };
      if(centre.type==='track'){
        const releases=theirs('release','byNames'),labels=theirs('label','labelOf');
        return [region('madeBy',madeBy),region('similar',similarTo(credits)),region('releases',[...releases.own,...releases.more.sort(newest)]),region('labels',[...labels.own,...labels.more.sort(byScore)])];
      }
      const others=shared(linked(centre,'artist'),'release').sort((a,b)=>b.score-a.score||newest(a,b)).map(c=>({...c,reason:[{kind:c.names.length>1?'inCommon':'alsoBy',names:c.names}]}));
      // A compilation has no similar artists to look for: the region is left out, not said to be empty.
      return [region('madeBy',madeBy),...credits.length?[region('similar',similarTo(credits))]:[],region('similarReleases',others),region('labels',own('label'))];
    }
    if(centre.type==='label'){
      const artists=linked(centre,'artist').map(id=>({id,score:0})).sort((a,b)=>tracks(b.id)-tracks(a.id)||title(a.id).localeCompare(title(b.id)));
      const labels=shared(linked(centre,'artist'),'label').sort(byScore).map(c=>({...c,reason:[{kind:'inCommon',names:c.names}]}));
      // A big label loses its releases to the 80-record cap: releases already fetched that point back to it count too.
      const releases=new Set(linked(centre,'release'));
      for(const d of docs.values())if(d.type==='release'&&links(d).some(c=>c.id===centre.id&&c.relation==='label'))releases.add(d.id);
      return [region('artists',artists),region('similarLabels',labels),region('releases',[...releases].map(id=>({id,score:0,reason:doc(id)?.artist?[{kind:'text',names:[doc(id).artist]}]:[]})).sort(newest))];
    }
    return [];
  }

  // The fewest neighbour payloads that name the unnamed top of each region: the record whose connections cover the
  // most wanted ids, the smaller on a tie, at most 4 and about 400 KB. Save-Data fetches nothing.
  function namingPlan(list,docs,cached,saveData) {
    if(saveData)return [];
    const want=new Set(list.flatMap(r=>{const named=new Set(r.items.map(i=>i.id));return r.ids.filter(id=>!named.has(id)).slice(0,9);}));
    const pool=[...docs.values()].filter(d=>links(d).length&&!cached.has(d.id)),picks=[];let kb=0;
    while(want.size&&picks.length<4){
      let best=null,most=0;
      // Each connection costs about 1.7 KB of JSON, plus 3 KB for the record itself: one that would pass the budget is
      // skipped, so a smaller one that fits can still name what is left.
      for(const d of pool){
        if(picks.includes(d.id)||kb+3+1.7*links(d).length>400)continue;const n=links(d).filter(c=>want.has(c.id)).length;
        if(n>most||(n&&n===most&&links(d).length<links(best).length)){best=d;most=n;}
      }
      if(!best)break;
      kb+=3+1.7*links(best).length;picks.push(best.id);for(const c of links(best))want.delete(c.id);
    }
    return picks;
  }

  const api={artistCandidates,regions,namingPlan,credited};
  if(typeof module==='object')module.exports=api;else root.PavoiaCloseness=api;
})(this);
