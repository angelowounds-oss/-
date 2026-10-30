// The delivered folder's own files and the zip (build/package.mjs, BLD-06): README.txt is Windows text (BOM, CRLF) that names the launcher,
// LICENSES.txt lists every manifest entry and carries the licence texts, and the zip has NeonCity/ at its top with the launcher, the readme
// and the page, stores the already compressed files as they are, passes `unzip -t`, and is refused for a folder without the launcher.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { writeReadme, writeLicences, zipDist } from '../../build/package.mjs';

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
if (!rt.includes('NeonCity.exe') || !rt.includes('abc1234')) bad.push(['readme misses the launcher or the build']);
const lic = fs.readFileSync(path.join(game, 'LICENSES.txt'), 'utf8'), man = JSON.parse(fs.readFileSync('build/assets/manifest.json', 'utf8'));
const missing = man.assets.filter((a) => !lic.includes(a.title)).map((a) => a.id); if (missing.length) bad.push(['licences miss', missing.join(',')]);
for (const t of ['SIL OPEN FONT LICENSE', 'Apache License', 'The MIT License', 'OpenStreetMap']) if (!lic.includes(t)) bad.push(['licence text missing', t]);
metrics.licencesKB = Math.round(lic.length / 1024);

let refused = false; try { zipDist(dist, info); } catch { refused = true; }
if (!refused) bad.push(['zipped a folder without the launcher']);
fs.writeFileSync(path.join(dist, 'NeonCity.exe'), Buffer.from('MZ fake'));
const zip = zipDist(dist, info);
if (path.basename(zip) !== 'NeonCity-20261028-abc1234.zip') bad.push(['zip name', path.basename(zip)]);
const names = execFileSync('unzip', ['-Z1', zip]).toString().trim().split('\n');
for (const n of ['NeonCity/NeonCity.exe', 'NeonCity/README.txt', 'NeonCity/game/index.html', 'NeonCity/game/LICENSES.txt', 'NeonCity/game/world/base/core.pak']) if (!names.includes(n)) bad.push(['zip misses', n]);
if (names.some((n) => !n.startsWith('NeonCity/'))) bad.push(['zip entry outside NeonCity/']);
const verbose = execFileSync('unzip', ['-v', zip]).toString(), pakLine = verbose.split('\n').find((l) => l.includes('world/base/core.pak')) || '';
if (!/Stored/.test(pakLine)) bad.push(['pak not stored as is', pakLine.trim()]);
metrics.entries = names.length;
fs.rmSync(tmp, { recursive: true, force: true });

console.log('RESULT ' + JSON.stringify({ test: 'package', pass: bad.length === 0, metrics, note: bad.map((b) => b.join(' ')).join(' | ') }));
process.exitCode = bad.length ? 1 : 0;
