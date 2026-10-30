// The pack path end to end in node: bake a pack with the parallel job runner, mount it with detail.js, and check that its chunks come in front of the
// embedded ones, that a wrong size or damaged chunk is refused, that a pack baked for another base world is refused, and that the cache gives
// the same bytes. The world files by province (WLD-21c): the base and the pack are each core.pak plus a file per province with chunks, the base
// loader (bakedload.js) reads them into the same chunks as the one container, and refuses a listed file that is missing or cut short.
import { bake } from '../../build/bake.mjs';
import { WorldData, memoryReader } from '../../src/chunkstore.js';
import { openContainer } from '../../src/bakefmt.js';
import { mountPack } from '../../src/detail.js';
import { loadBaked } from '../../src/bakedload.js';

const bad = [], S = ['src/bakefmt.js', 'build/jobs.mjs'], jobs = [
  { key: 'core', tier: 'embed', region: null, src: ['src/worldmap.js', 'src/terrainfn.js', 'src/roadnet.js', 'src/citylayout.js', ...S] },
  { key: 'selftest', tier: 'embed', region: 'seoul', src: S },
  { key: 'h/a', gen: 'selftest', tier: 'pack', region: 'sea', src: S }, { key: 'h/b', gen: 'selftest', tier: 'pack', region: 'jeju', src: S },
];
const a = await bake({ pack: true, jobs, cache: false, threads: 3 }), b = await bake({ pack: true, jobs, threads: 2 });
if (a.manifest.data !== b.manifest.data) bad.push(['embedded differs between runs']);
const names = (m) => [...m.keys()].join(',');
if (names(a.base) !== 'core.pak,seoul.pak,index.json' || names(a.pack) !== 'core.pak,jeju.pak,index.json') bad.push(['files by province', names(a.base), names(a.pack)]);
for (const k of ['base', 'pack']) for (const [n, f] of a[k]) if (!b[k].get(n) || Buffer.compare(Buffer.from(f), Buffer.from(b[k].get(n)))) bad.push(['file differs between runs', k, n]);
const ix = JSON.parse(a.pack.get('index.json'));
if (ix.files.map((f) => `${f.name}:${f.region}:${f.chunks}`).join(' ') !== 'core.pak:null:1 jeju.pak:jeju:1') bad.push(['pack index', JSON.stringify(ix.files)]);

// the base loader over the files (a fetch stand-in): the same keys and chunk bytes as the one container
const serve = (files) => async (n) => (files.has(n) ? { ok: true, json: async () => JSON.parse(files.get(n)), arrayBuffer: async () => new Uint8Array(files.get(n)).buffer } : { ok: false });
const fresh = () => { delete globalThis.__BAKED; globalThis.__WORLD = new WorldData(); return globalThis.__WORLD; };
let wd = fresh(); await loadBaked(serve(a.base));
const one = await openContainer(memoryReader(a.embedded)), sum = (c) => Object.entries(c.chunks).map(([k, e]) => k + ':' + e.h).sort().join(' ');
if (!globalThis.__BAKED || wd.sources.map((s) => s.name).join(',') !== 'base:core.pak,base:seoul.pak') bad.push(['base loaded', wd.sources.map((s) => s.name).join(',')]);
if (wd.sources.map((s) => sum(s.c)).join(' ').split(' ').sort().join(' ') !== sum(one)) bad.push(['base files hold other chunks than the one container']);
for (const [what, files] of [['missing', new Map([...a.base].filter(([n]) => n !== 'seoul.pak'))], ['short', new Map([...a.base, ['seoul.pak', a.base.get('seoul.pak').subarray(0, 40)]])]]) {
  fresh(); try { await loadBaked(serve(files)); bad.push(['base file ' + what + ' accepted']); } catch (e) { /* expected */ }
}

wd = new WorldData(); wd.add('embedded', one);
const mkFile = (name, bytes) => ({ name, size: bytes.length, slice: (o, e) => ({ arrayBuffer: async () => new Uint8Array(bytes.subarray(o, e)).buffer }), text: async () => Buffer.from(bytes).toString('utf8') });
const dir = (files) => ({ async get(n) { return files.get(n) ? mkFile(n, files.get(n)) : null; } });
if (wd.has('h/a')) bad.push(['pack chunk before the pack is mounted']);
const r = await mountPack(dir(a.pack), wd);
if (r.files !== 2 || !wd.has('h/a') || !wd.has('h/b') || !wd.has('selftest')) bad.push(['mount', JSON.stringify(r)]);
const o = await wd.get('h/a');
if (o.a[1] !== 1.5 || o.m.get('k').v !== 7) bad.push(['pack chunk content']);
if (wd.find('h/a').name !== 'pack:core.pak' || wd.find('h/b').name !== 'pack:jeju.pak') bad.push(['pack not in front', wd.find('h/a').name, wd.find('h/b').name]);
// a damaged chunk is refused by its hash; a pack of the wrong size is refused at mount
const hp = Buffer.from(a.pack.get('core.pak')); hp[hp.length - 3] ^= 0xff;
const wd2 = new WorldData(); wd2.add('embedded', one);
const files2 = new Map(a.pack); files2.set('core.pak', hp);
await mountPack(dir(files2), wd2);
let refused = 0; try { await wd2.get('h/a'); } catch (e) { refused++; }
if (refused < 1) bad.push(['damaged chunk accepted']);
try { await mountPack(dir(new Map([...a.pack, ['jeju.pak', a.pack.get('jeju.pak').subarray(0, 40)]])), new WorldData()); bad.push(['short pack accepted']); } catch (e) { /* expected */ }
// the pack belongs to the base world it was baked with (BLD-07): the same world id in every file, and a pack is refused over another base world
const idOf = async (bytes) => (await openContainer(memoryReader(bytes))).meta.world, ids = new Set();
for (const m of [a.base, a.pack]) for (const [n, f] of m) if (n !== 'index.json') ids.add(await idOf(f));
if (!one.meta.world || ids.size !== 1 || !ids.has(one.meta.world)) bad.push(['world id', one.meta.world, [...ids].join(',')]);
const other = await bake({ pack: true, jobs: jobs.filter((j) => j.key !== 'selftest'), cache: false, threads: 2 }), wd3 = new WorldData();
wd3.add('embedded', await openContainer(memoryReader(other.embedded)));
try { await mountPack(dir(a.pack), wd3); bad.push(['pack of another world accepted']); } catch (e) { if (wd3.sources.length !== 1) bad.push(['refused pack left mounted']); }
console.log('RESULT ' + JSON.stringify({ test: 'chunkpack', pass: bad.length === 0, metrics: { cached: b.manifest.cached, jobs: b.manifest.jobs.length, base: names(a.base), pack: names(a.pack) }, note: bad.slice(0, 5).join(' | ') }));
process.exitCode = bad.length ? 1 : 0;
