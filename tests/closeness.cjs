// The closeness rules of web/closeness.js on small made-up records: no page, no network, no fixture files.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { artistCandidates, regions, namingPlan } = require('../web/closeness.js');

const prefix = {artist:'art', release:'rel', label:'lab', track:'trk'};
// A record as the API sends it: its connections are ids and relations only.
const rec = (type, n, connections=[], more={}) => ({id:prefix[type]+'_'+String(n).padStart(12,'0'), type, title:type+' '+n, connections:connections.map(([id,relation])=>({id,relation})), ...more});
const docs = (...list) => new Map(list.map(r=>[r.id,r]));
const region = (list, key) => list.find(r=>r.key===key);
const ids = (list, key) => region(list,key)?.items.map(i=>i.id) || [];
const A = n => 'art_'+String(n).padStart(12,'0'), L = n => 'lab_'+String(n).padStart(12,'0'), R = n => 'rel_'+String(n).padStart(12,'0');

test('a direct similar artist lands in Similar artists, said similar to the centre', () => {
  const centre = rec('artist',1,[[A(2),'similar']]), other = rec('artist',2);
  const found = regions(centre, docs(centre, other));
  assert.deepEqual(ids(found,'similar'), [A(2)]);
  assert.deepEqual(region(found,'similar').items[0].reason, [{kind:'similarTo', names:[A(1)]}]);
});

test('a direct remix and shared release lands in Worked with, never in Similar artists', () => {
  const centre = rec('artist',1,[[A(2),'remix/shared_release']]), other = rec('artist',2);
  const found = regions(centre, docs(centre, other));
  assert.deepEqual([ids(found,'worked'), ids(found,'similar')], [[A(2)], []]);
  assert.deepEqual(region(found,'worked').items[0].reason, [{kind:'relation', names:['remix','shared_release']}]);
});

test('a second-step artist reached only through a label is listed nowhere', () => {
  const centre = rec('artist',1,[[L(1),'label']]), label = rec('label',1,[[A(3),'artist']]), mate = rec('artist',3);
  const found = regions(centre, docs(centre, label, mate));
  assert.ok(found.every(r=>!r.ids.includes(A(3))), 'sharing a label is no proof of sound');
});

test('one similar step lists a second-step artist; one worked step from a neighbour that is not similar does not', () => {
  const centre = rec('artist',1,[[A(2),'similar'],[A(4),'collaboration']]);
  const similar = rec('artist',2,[[A(3),'similar']]), worked = rec('artist',4,[[A(5),'collaboration']]);
  const all = docs(centre, similar, worked, rec('artist',3), rec('artist',5));
  const scores = artistCandidates(centre, all);
  assert.deepEqual([scores.get(A(3)).score, scores.get(A(5)).score], [1.5, 1]);
  assert.deepEqual(ids(regions(centre, all),'similar'), [A(2), A(3)], 'A(3) is in, with the reason of its path; A(5) is out');
  assert.deepEqual(region(regions(centre, all),'similar').items[1].reason, [{kind:'similarTo', names:[A(2)]}]);
});

test('a collaborator of a similar artist is not similar, and a similar step leads the reason even when lighter', () => {
  const centre = rec('artist',1,[[A(2),'similar'],[A(6),'collaboration'],[A(7),'collaboration']]);
  const similar = rec('artist',2,[[A(3),'collaboration'],[A(4),'similar']]), one = rec('artist',6,[[A(4),'collaboration']]), two = rec('artist',7,[[A(4),'remix']]);
  const all = docs(centre, similar, one, two, rec('artist',3), rec('artist',4));
  const found = regions(centre, all);
  assert.ok(!region(found,'similar').ids.includes(A(3)), 'worked with a similar artist: no proof of sound');
  assert.deepEqual(ids(found,'similar'), [A(4), A(2)]);
  assert.deepEqual(region(found,'similar').items[0].reason, [{kind:'similarTo', names:[A(2)]}, {kind:'workedWithNames', names:[A(6),A(7)]}], 'two worked steps outweigh one similar step, yet the row says first why it is similar');
});

test('a label with more than 20 connections halves the paths through it', () => {
  const centre = rec('artist',1,[[L(1),'label'],[L(2),'label']]);
  const big = rec('label',1,[[A(3),'artist'],...Array.from({length:20},(_,i)=>[A(100+i),'artist'])]), small = rec('label',2,[[A(3),'artist']]);
  const scores = artistCandidates(centre, docs(centre, big, small));
  assert.equal(big.connections.length, 21);
  assert.equal(scores.get(A(3)).score, .25 + .5, 'a quarter through the big label, a half through the small one');
});

test('the centre never appears in its own lists', () => {
  const centre = rec('artist',1,[[A(2),'similar'],[R(1),'release']]);
  const back = rec('artist',2,[[A(1),'similar'],[A(3),'similar']]), release = rec('release',1,[[A(1),'artist']]);
  const found = regions(centre, docs(centre, back, release, rec('artist',3)));
  assert.ok(found.every(r=>!r.ids.includes(A(1))));
  assert.ok(!artistCandidates(centre, docs(centre, back, release)).has(A(1)));
});

test('own labels come first in Labels, then the labels its artist neighbours share', () => {
  const centre = rec('artist',1,[[L(1),'label'],[A(2),'similar'],[A(3),'similar']]);
  const a = rec('artist',2,[[L(2),'label']]), b = rec('artist',3,[[L(2),'label']]);
  const found = regions(centre, docs(centre, a, b, rec('label',1), rec('label',2)));
  assert.deepEqual(ids(found,'labels'), [L(1), L(2)], 'its own label first, then the one two of its artists share');
  assert.deepEqual(region(found,'labels').items.map(i=>i.reason), [[], [{kind:'labelOf', names:[A(2),A(3)]}]]);
});

test('similar labels fall back to one shared artist only when none shares two', () => {
  const two = rec('label',1,[[A(1),'artist'],[A(2),'artist']]);
  const artists = [rec('artist',1,[[L(2),'label'],[L(3),'label']]), rec('artist',2,[[L(2),'label']])];
  const found = regions(two, docs(two, ...artists, rec('label',2), rec('label',3)));
  assert.deepEqual([ids(found,'similarLabels'), region(found,'similarLabels').total], [[L(2)], 1], 'L(3) shares one artist, so it waits');
  assert.deepEqual(region(found,'similarLabels').items[0].reason, [{kind:'inCommon', names:[A(1),A(2)]}]);
  const one = rec('label',9,[[A(1),'artist']]), alone = regions(one, docs(one, artists[0], rec('label',2), rec('label',3)));
  assert.deepEqual(ids(alone,'similarLabels'), [L(2), L(3)], 'none shares two: those that share one show');
});

test('a label lists the releases fetched elsewhere that point back to it', () => {
  const label = rec('label',1,[[R(1),'release']]), own = rec('release',1,[[L(1),'label']],{releaseDate:'2019-01-01'});
  const back = rec('release',2,[[L(1),'label']],{releaseDate:'2024-05-01', artist:'Mind Against'}), other = rec('release',3,[[L(1),'distributor']]);
  const found = regions(label, docs(label, own, back, other));
  assert.deepEqual(ids(found,'releases'), [R(2), R(1)], 'newest first; only a label relation counts');
  assert.deepEqual(region(found,'releases').items[0].reason, [{kind:'text', names:['Mind Against']}]);
});

test('records fetched later name candidates and never change a score', () => {
  const centre = rec('artist',1,[[A(2),'similar'],[L(1),'label']],{tags:['techno','ambient']});
  const near = [rec('artist',2,[[A(3),'similar'],[R(1),'release']],{tags:['techno']}), rec('label',1,[[A(3),'artist']])];
  const before = artistCandidates(centre, docs(centre, ...near));
  // The naming fetch brings the second step in full, with its own neighbours and tags.
  const later = [rec('artist',3,[[A(4),'similar'],[A(1),'similar']],{tags:['techno','ambient']}), rec('release',1,[[A(5),'artist']]), rec('artist',4,[],{tags:['techno']})];
  const after = artistCandidates(centre, docs(centre, ...near, ...later));
  assert.deepEqual([...after].map(([id,c])=>[id,c.score]), [...before].map(([id,c])=>[id,c.score]));
  const named = regions(centre, docs(centre, ...near, ...later));
  assert.deepEqual([ids(regions(centre, docs(centre, ...near)),'similar'), ids(named,'similar'), region(named,'similar').total], [[A(2)], [A(2), A(3)], 2], 'the count holds still while a name arrives');
});

test('the naming plan takes the payload that names the most, the smaller on a tie, up to 4 or 400 KB, and none under Save-Data', () => {
  const want = n => Array.from({length:n},(_,i)=>A(500+i));
  const list = [{key:'similar', items:[], total:12, ids:want(12)}];
  const record = (n, cover, size) => rec('artist', n, [...cover.map(id=>[id,'similar']), ...Array.from({length:size-cover.length},(_,i)=>[A(9000+n*100+i),'similar'])]);
  const pool = docs(record(1,want(3),3), record(2,want(4),40), record(3,want(4),10), record(4,want(4).slice(1),4), record(5,want(12).slice(4,6),2), record(6,want(12).slice(6,8),2), record(7,want(12).slice(8,10),2));
  assert.deepEqual(namingPlan(list, pool, new Set(), false), [A(3), A(5), A(6), A(7)], 'four at most: the one covering four with 10 connections, not 40; then those covering what is left');
  assert.deepEqual(namingPlan([{...list[0], ids:want(12).slice(0,9)}], pool, new Set([A(3)]), false).slice(0,1), [A(2)], 'a payload already cached is not fetched again');
  const big = docs(record(1,[want(1)[0]],120), record(2,[want(2)[1]],120), record(3,[want(3)[2]],120));
  assert.deepEqual(namingPlan([{key:'similar', items:[], total:3, ids:want(3)}], big, new Set(), false), [A(1)], 'each costs 3 + 1.7 × 120 = 207 KB: the second would pass 400 KB');
  assert.deepEqual(namingPlan(list, pool, new Set(), true), [], 'Save-Data');
  assert.deepEqual(namingPlan([{key:'similar', items:[{id:A(500)}], total:1, ids:[A(500)]}], pool, new Set(), false), [], 'nothing unnamed, nothing to fetch');
});

test('the plan wants the top nine unnamed of each region', () => {
  const list = [{key:'similar', items:[{id:A(1)}], total:12, ids:Array.from({length:12},(_,i)=>A(i+1))}];
  const pool = docs(rec('artist',50,[[A(11),'similar']]), rec('artist',51,[[A(10),'similar']]));
  assert.deepEqual(namingPlan(list, pool, new Set(), false), [A(51)], 'A(2) to A(10) are wanted; A(11) is the tenth unnamed');
});

test('a release looks for similar artists through 1 to 3 credited artists, and a compilation leaves the region out', () => {
  const duo = rec('release',1,[[A(1),'artist'],[A(2),'artist']]), people = [rec('artist',1,[[A(9),'similar']]), rec('artist',2,[[A(9),'similar']]), rec('artist',9)];
  assert.deepEqual(ids(regions(duo, docs(duo, ...people)),'similar'), [A(9)]);
  assert.deepEqual(region(regions(duo, docs(duo, ...people)),'similar').items[0].reason, [{kind:'similarTo', names:[A(1),A(2)]}]);
  const compilation = rec('release',2,[1,2,3,4].map(n=>[A(n),'artist']));
  assert.deepEqual(regions(compilation, docs(compilation, ...people)).map(r=>r.key), ['madeBy','similarReleases','labels']);
});

test('a track names who calls a similar artist similar, not the credited artist that brought it', () => {
  // The track is credited to A(1); A(1) worked with A(2); A(2) calls A(3) similar.
  const track = rec('track',1,[[A(1),'primary']]), credited = rec('artist',1,[[A(2),'collaboration'],[A(4),'similar']]);
  const all = docs(track, credited, rec('artist',2,[[A(3),'similar']]), rec('artist',3), rec('artist',4));
  const similar = region(regions(track, all),'similar');
  assert.deepEqual(similar.items.map(i=>[i.id, i.via, i.reason]), [[A(4), A(1), [{kind:'similarTo', names:[A(1)]}]], [A(3), A(1), [{kind:'similarTo', names:[A(2)]}]]],
    'A(4) is similar to the credited artist; A(3) is similar to A(2), and hangs from A(1) on the map');
});

test('the naming plan skips a payload over the budget left, and still takes a smaller one that fits', () => {
  const want = n => Array.from({length:n},(_,i)=>A(700+i));
  const record = (n, cover, size) => rec('artist', n, [...cover.map(id=>[id,'similar']), ...Array.from({length:size-cover.length},(_,i)=>[A(9000+n*200+i),'similar'])]);
  // The first takes 207 KB; the second best would bring the total to 414 KB; the third covers less and fits.
  const pool = docs(record(1,want(2),120), record(2,want(4).slice(2),120), record(3,want(3).slice(2),10));
  assert.deepEqual(namingPlan([{key:'similar', items:[], total:4, ids:want(4)}], pool, new Set(), false), [A(1), A(3)]);
});
