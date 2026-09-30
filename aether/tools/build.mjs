#!/usr/bin/env node
// AETHER build: src/ -> js/ (dev, used by index.html) and dist/aether.html (single self-contained file).
// No bundler dependency (npm registry is not reachable in the build environment); the engine is a
// single classic-script IIFE, so modules are ordered files concatenated in name order.
//   node tools/build.mjs                   dev js/ + dist/aether.html
//   node tools/build.mjs --out=path.html   custom output path
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const rd = p => fs.readFileSync(path.join(root, p), 'utf8');
const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };

const engineFiles = fs.readdirSync(path.join(root, 'src/engine')).filter(f => f.endsWith('.js')).sort();
const engine = engineFiles.map(f => rd('src/engine/' + f)).join('');
const ui = rd('src/ui.js');
fs.mkdirSync(path.join(root, 'js'), { recursive: true });
fs.writeFileSync(path.join(root, 'js/engine.js'), engine);
fs.writeFileSync(path.join(root, 'js/ui.js'), ui);

// ---- vehicle: the user-provided GLB (personal use build; owner decision 2026-09-29, not for public redistribution)
const vehicle = 'user';
const vehicleFile = 'assets/vehicle-asset.js';
const out = path.resolve(root, arg('out', 'dist/aether.html'));

// ---- inline assets
const assetFiles = ['assets/console-asset.js', vehicleFile, 'assets/fan-asset.js', 'assets/s3-worker.js', 'assets/bluenoise.js'];
const build = { version: rd('VERSION').trim(), vehicle, time: new Date().toISOString(), engineFiles, assets: {} };
let html = rd('index.html');
html = html.replace('<link rel="stylesheet" href="css/style.css">', () => '<style>' + rd('css/style.css') + '</style>');
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  const body = rd(src);
  if (assetFiles.includes(src)) build.assets[src] = { bytes: body.length, sha256: crypto.createHash('sha256').update(body).digest('hex').slice(0, 16) };
  return '<script>' + body.replace(/<\/script/gi, '<\\/script') + '</script>';
});
html = html.replace('<script>window.setStatus', () => `<script>window.__AETHER_BUILD=${JSON.stringify({ version: build.version, vehicle, time: build.time })};</script>\n<script>window.setStatus`);

// guard: no runtime references to remote hosts in src/href attributes
const remote = html.match(/(?:src|href)\s*=\s*["']https?:\/\//gi);
if (remote) throw Error('remote asset reference in build: ' + remote.slice(0, 3).join(', '));

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
build.outBytes = Buffer.byteLength(html);
build.outGzipBytes = zlib.gzipSync(html).length;
fs.writeFileSync(out.replace(/\.html$/, '.manifest.json'), JSON.stringify(build, null, 1));
console.log(`build ok  ${path.relative(root, out)}  ${(build.outBytes / 1048576).toFixed(2)} MB  vehicle=${vehicle}  engine=${engine.length} chars`);
