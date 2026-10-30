// The pack path end to end in node: bake a pack with the parallel job runner, mount it with detail.js, and check that its chunks come in front of the
// embedded ones, that a wrong size or damaged chunk is refused, that a pack baked for another base world is refused, and that the cache gives
// the same bytes.
import { bake } from '../../build/bake.mjs';
import { WorldData, memoryReader } from '../../src/chunkstore.js';
import { openContainer } from '../../src/bakefmt.js';
import { mountPack } from '../../src/detail.js';

const bad = [], S = ['src/bakefmt.js', 'build/jobs.mjs'], jobs = [
  { key: 'core', tier: 'embed', src: ['src/worldmap.js', 'src/terrainfn.js', 'src/roadnet.js', 'src/citylayout.js', ...S] },
  { key: 'selftest', tier: 'embed', src: S },
  { key: 'h/a', gen: 'selftest', tier: 'pack', src: S }, { key: 'h/b', gen: 'selftest', tier: 'pack', src: S },
];
const a = await bake({ pack: true, jobs, cache: false, threads: 3 }), b = await bake({ pack: true, jobs, threads: 2 });
if (a.manifest.data !== b.manifest.data) bad.push(['embedded differs between runs']);
if (!a.pack.get('high.pak') || Buffer.compare(Buffer.from(a.pack.get('high.pak')), Buffer.from(b.pack.get('high.pak')))) bad.push(['pack differs between runs']);

const wd = new WorldData(); wd.add('embedded', await openContainer(memoryReader(a.embedded)));
const mkFile = (name, bytes) => ({ name, size: bytes.length, slice: (o, e) => ({ arrayBuffer: async () => new Uint8Array(bytes.subarray(o, e)).buffer }), text: async () => Buffer.from(bytes).toString('utf8') });
const dir = (files) => ({ async get(n) { return files.get(n) ? mkFile(n, files.get(n)) : null; } });
if (wd.has('h/a')) bad.push(['pack chunk before the pack is mounted']);
const r = await mountPack(dir(a.pack), wd);
if (r.files !== 1 || !wd.has('h/a') || !wd.has('selftest')) bad.push(['mount', r]);
const o = await wd.get('h/a');
if (o.a[1] !== 1.5 || o.m.get('k').v !== 7) bad.push(['pack chunk content']);
if (wd.find('h/a').name !== 'pack:high.pak') bad.push(['pack not in front']);
// a damaged chunk is refused by its hash; a pack of the wrong size is refused at mount
const hp = Buffer.from(a.pack.get('high.pak')); hp[hp.length - 3] ^= 0xff;
const wd2 = new WorldData(); wd2.add('embedded', await openContainer(memoryReader(a.embedded)));
const files2 = new Map(a.pack); files2.set('high.pak', hp);
await mountPack(dir(files2), wd2);
let refused = 0; for (const k of ['h/a', 'h/b']) { try { await wd2.get(k); } catch (e) { refused++; } }
if (refused < 1) bad.push(['damaged chunk accepted']);
try { await mountPack(dir(new Map([...a.pack, ['high.pak', hp.subarray(0, 40)]])), new WorldData()); bad.push(['short pack accepted']); } catch (e) { /* expected */ }
// the pack belongs to the base world it was baked with (BLD-07): the same world id in both, and a pack is refused over another base world
const idOf = async (bytes) => (await openContainer(memoryReader(bytes))).meta.world;
if (!(await idOf(a.embedded)) || (await idOf(a.embedded)) !== (await idOf(a.pack.get('high.pak')))) bad.push(['world id', await idOf(a.embedded), await idOf(a.pack.get('high.pak'))]);
const other = await bake({ pack: true, jobs: jobs.filter((j) => j.key !== 'selftest'), cache: false, threads: 2 }), wd3 = new WorldData();
wd3.add('embedded', await openContainer(memoryReader(other.embedded)));
try { await mountPack(dir(a.pack), wd3); bad.push(['pack of another world accepted']); } catch (e) { if (wd3.sources.length !== 1) bad.push(['refused pack left mounted']); }
console.log('RESULT ' + JSON.stringify({ test: 'chunkpack', pass: bad.length === 0, metrics: { cached: b.manifest.cached, jobs: b.manifest.jobs.length }, note: bad.slice(0, 5).join(' | ') }));
process.exitCode = bad.length ? 1 : 0;
