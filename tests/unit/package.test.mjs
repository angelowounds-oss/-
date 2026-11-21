// The delivered folder's own files and the zip (build/package.mjs, BLD-06, BD-1): README.txt is Windows text (BOM, CRLF) that names the launcher,
// LICENSES.txt lists every manifest entry and carries the licence texts, and a zip has Korea/ at its top with the launcher, the readme and the
// page, stores the already compressed files as they are, is refused for a folder without the launcher, and splits a build above the upload
// limit into parts that each open on their own and merge when extracted into one folder. `unzip` stays the independent reader where it exists.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { writeReadme, writeLicences, zipDist, readZip } from '../../build/package.mjs';

const bad = [], metrics = {};
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'neon-package-')), dist = path.join(tmp, 'Build Folder'), game = path.join(dist, 'game');
fs.mkdirSync(path.join(game, 'world', 'base'), { recursive: true });
fs.writeFileSync(path.join(game, 'index.html'), '<!doctype html>'.repeat(100));
fs.writeFileSync(path.join(game, 'world', 'base', 'core.pak'), Buffer.alloc(50000, 7));
const info = { date: '2026-10-28', commit: 'abc1234' };
writeReadme(dist, info); writeLicences(game);

const readme = fs.readFileSync(path.join(dist, 'README.txt'));
if (readme[0] !== 0xef || readme[1] !== 0xbb || readme[2] !== 0xbf) bad.push(['readme has no BOM']);
const rt = readme.toString('utf8');
if (/[^\r]\n/.test(rt)) bad.push(['readme has bare LF line ends']);
if (!rt.includes('Korea.exe') || !rt.includes('abc1234')) bad.push(['readme misses the launcher or the build']);
const lic = fs.readFileSync(path.join(game, 'LICENSES.txt'), 'utf8'), man = JSON.parse(fs.readFileSync('build/assets/manifest.json', 'utf8'));
const missing = man.assets.filter((a) => !lic.includes(a.title)).map((a) => a.id); if (missing.length) bad.push(['licences miss', missing.join(',')]);
for (const t of ['SIL OPEN FONT LICENSE', 'Apache License', 'The MIT License', 'OpenStreetMap']) if (!lic.includes(t)) bad.push(['licence text missing', t]);
metrics.licencesKB = Math.round(lic.length / 1024);

const hasUnzip = (() => { try { execFileSync('unzip', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } })();
let refused = false; try { zipDist(dist, info); } catch { refused = true; }
if (!refused) bad.push(['zipped a folder without the launcher']);
fs.writeFileSync(path.join(dist, 'Korea.exe'), Buffer.from('MZ fake'));
const zips = zipDist(dist, info);
if (zips.length !== 1) bad.push(['one part expected', String(zips.length)]);
const zip = zips[0];
if (path.basename(zip) !== 'Korea-20261028-abc1234.zip') bad.push(['zip name', path.basename(zip)]);
const listed = readZip(zip), names = listed.map((e) => e.name);
for (const n of ['Korea/Korea.exe', 'Korea/README.txt', 'Korea/game/index.html', 'Korea/game/LICENSES.txt', 'Korea/game/world/base/core.pak']) if (!names.includes(n)) bad.push(['zip misses', n]);
if (names.some((n) => !n.startsWith('Korea/'))) bad.push(['zip entry outside Korea/']);
const pak = listed.find((e) => e.name === 'Korea/game/world/base/core.pak');
if (!pak || pak.method !== 0) bad.push(['pak not stored as is', pak ? 'method ' + pak.method : 'missing']);
if (hasUnzip) {
  const ext = execFileSync('unzip', ['-Z1', zip]).toString().trim().split('\n');
  if (ext.length !== names.length || ext.some((n) => !names.includes(n))) bad.push(['unzip lists other entries']);
  const verbose = execFileSync('unzip', ['-v', zip]).toString(), pakLine = verbose.split('\n').find((l) => l.includes('world/base/core.pak')) || '';
  if (!/Stored/.test(pakLine)) bad.push(['unzip: pak not stored', pakLine.trim()]);
}
metrics.entries = names.length;

// BD-1: a build above the upload limit goes out as parts that each open on their own and merge when extracted into one folder
const splitDist = path.join(tmp, 'Split Folder'), splitGame = path.join(splitDist, 'game');
fs.mkdirSync(splitGame, { recursive: true });
fs.writeFileSync(path.join(splitDist, 'Korea.exe'), Buffer.from('MZ fake'));
const packed = [];
// incompressible payloads, so a part's size on disk really tracks the budget the split promises
const noise = (n, seed) => { const b = Buffer.alloc(n); let s = seed; for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; b[i] = s >>> 16; } return b; };
for (let i = 0; i < 10; i++) { const n = `chunk${i}.bin`; fs.writeFileSync(path.join(splitGame, n), noise(8000, i + 1)); packed.push('Korea/game/' + n); }
const parts = zipDist(splitDist, info, { partBytes: 25000, splitAbove: 0 });
if (parts.length < 2) bad.push(['no split', String(parts.length)]);
const seen = new Set();
for (const [i, p] of parts.entries()) {
  const want = `Korea-20261028-abc1234-${i + 1}of${parts.length}.zip`;
  if (path.basename(p) !== want) bad.push(['part name', path.basename(p), want]);
  const size = fs.statSync(p).size;
  if (size > 25000) bad.push(['part over budget', path.basename(p), String(size)]);
  const entries = readZip(p);
  if (!entries.length || entries.some((e) => !e.name.startsWith('Korea/'))) bad.push(['part entry outside Korea/', path.basename(p)]);
  for (const e of entries) { if (seen.has(e.name)) bad.push(['entry in two parts', e.name]); seen.add(e.name); }
}
for (const n of [...packed, 'Korea/Korea.exe']) if (!seen.has(n)) bad.push(['split misses', n]);
metrics.parts = parts.length;
metrics.partMaxMB = Math.max(...parts.map((p) => fs.statSync(p).size)) / 1048576;
fs.rmSync(tmp, { recursive: true, force: true });

console.log('RESULT ' + JSON.stringify({ test: 'package', pass: bad.length === 0, metrics, note: bad.map((b) => b.join(' ')).join(' | ') }));
process.exitCode = bad.length ? 1 : 0;
