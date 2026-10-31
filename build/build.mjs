import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { writeReadme, writeLicences, zipDist, buildInfo } from './package.mjs';
// The game is built as a folder (BLD-06, ADR-0034): dist/Korea/ holds the launcher Korea.exe and game/ (the page, the code, the asset
// files, the baked world and the high pack). The launcher serves game/ on 127.0.0.1 and opens it in an app window.
// usage: node build/build.mjs [--zip]   --zip also makes dist/Korea-<date>-<commit>.zip for delivery
// env: DIST=<folder> (default dist/Korea), WORLD=small (no baked world: the page generates it), PACK=0 (no high pack), LAUNCHER=0 (no
// launcher), DEV=1 (unminified code), REGIONS=seoul,incheon (bake only those provinces and the core: the page computes the rest; ADR-0036)
const DIST = process.env.DIST || 'dist/Korea', GAME = path.join(DIST, 'game'), small = process.env.WORLD === 'small';
const regions = process.env.REGIONS ? process.env.REGIONS.split(',').map((r) => r.trim()).filter(Boolean) : null;
if (regions) { const { IDS } = await import('../src/regions/index.js'), bad = regions.filter((r) => !IDS.some(([id]) => id === r)); if (bad.length) { console.error('REGIONS: no such province:', bad.join(','), '(src/regions/index.js)'); process.exit(1); } }
// every shipped file is listed with its licence (ADR-0028): an unlisted file, a changed one or a licence outside the allowed list stops the build
{ const { check } = await import('./assets/fetch.mjs'), m = check(); if (m.errors.length) { for (const e of m.errors) console.error('asset:', e); process.exit(1); } }
// the compiled region (ADR-0019) is made before the bake reads it: again when it is missing or older than the compiler (DEM and OSM are cached)
if (!small) {
  const { V_SCALE } = await import('../src/koreamap.js');
  const out = 'build/baked/world/capital/region.bin', srcs = [...fs.readdirSync('build/world').filter((f) => f !== 'blocks.mjs').map((f) => 'build/world/' + f), 'src/koreamap.js'];   // the scale lives in koreamap.js; blocks.mjs reads the region, it does not make it
  if (!fs.existsSync(out) || srcs.some((f) => fs.statSync(f).mtimeMs > fs.statSync(out).mtimeMs)) execFileSync('node', ['build/world/compile.mjs', '--region', 'capital', '--v', String(V_SCALE), '--roads', '--emit'], { stdio: 'inherit' });
  // the procedural buildings (WLD-24a) stand on the compiled region: again when it, their generator or the district table is newer
  const bout = 'build/baked/world/capital/buildings.bin', bsrcs = [out, 'build/world/blocks.mjs', 'build/world/emit.mjs', 'src/districts.js', 'src/koreamap.js'];
  if (!fs.existsSync(bout) || bsrcs.some((f) => fs.statSync(f).mtimeMs > fs.statSync(bout).mtimeMs)) execFileSync('node', ['--max-old-space-size=8000', 'build/world/blocks.mjs'], { stdio: 'inherit' });
}
const { bake, writePack, writeBase } = await import('./bake.mjs');
fs.rmSync(DIST, { recursive: true, force: true });
for (const d of ['fonts', 'world']) fs.mkdirSync(path.join(GAME, d), { recursive: true });

// code to main.js; every imported model, texture and data file is copied to assets/ under a hashed name, and the import gives its URL (files.js)
await build({
  entryPoints: ['src/main.js'], bundle: true, minify: !process.env.DEV, format: 'iife', outdir: GAME, entryNames: 'main', assetNames: 'assets/[name]-[hash]',
  loader: { '.glb': 'file', '.jpg': 'file', '.bin': 'file', '.rgbe': 'file' }, target: 'es2020', legalComments: 'none',
  nodePaths: ['build/node_modules'], logLevel: 'warning',
});
// the loading screen's fonts (Anton, Space Mono; both SIL OFL) ship as files: the game must look the same offline
const FONTS = [['Anton-400.woff2', 'Anton', 400], ['SpaceMono-400.woff2', 'Space Mono', 400], ['SpaceMono-700.woff2', 'Space Mono', 700]];
for (const [f] of FONTS) fs.copyFileSync('assets/fonts/' + f, path.join(GAME, 'fonts', f));
const fonts = FONTS.map(([f, family, weight]) => `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;font-display:swap;src:url(fonts/${f}) format('woff2')}`).join('\n');
fs.writeFileSync(path.join(GAME, 'index.html'), fs.readFileSync('src/template.html', 'utf8').replace('/*__FONTS__*/', () => fonts));

// the baked "laptop" world (bakedload.js); WORLD=small leaves it out and the page generates the world itself (slower to start; for quick tests).
// The high pack's world part is baked with it every time (the cache redoes only what changed): copied from the folder as an older bake left
// it, it carried 8 m ground up to 1.4 km off the base ground and city detail of old layouts (BLD-07)
const PACK = 'build/baked/pack', withPack = !small && process.env.PACK !== '0';
// Both are a folder of files by province (ADR-0036): world/base/ and world/high/
if (!small) { const r = await bake({ pack: withPack, regions }); writeBase(r, path.join(GAME, 'world', 'base')); if (r.pack) writePack(r); }
// the high pack (detail.js): the world part just baked and the asset pack of build/assets/pack.mjs
if (withPack && fs.existsSync(path.join(PACK, 'index.json'))) {
  const idx = JSON.parse(fs.readFileSync(path.join(PACK, 'index.json'), 'utf8')), HIGH = path.join(GAME, 'world', 'high'); fs.mkdirSync(HIGH, { recursive: true });
  for (const f of idx.files) fs.copyFileSync(path.join(PACK, f.name), path.join(HIGH, f.name));
  fs.copyFileSync(path.join(PACK, 'index.json'), path.join(HIGH, 'index.json'));
} else if (withPack) console.warn('no high pack in build/baked/pack (node build/assets/pack.mjs): the laptop detail only');

// the Windows launcher (launcher/main.go); without Go the folder still works for tests, but cannot be delivered
if (process.env.LAUNCHER !== '0') {
  const go = ['go', '/usr/local/go/bin/go'].find((g) => { try { execFileSync(g, ['version'], { stdio: 'ignore' }); return true; } catch { return false; } });
  if (go) execFileSync(go, ['build', '-trimpath', '-ldflags', '-s -w -H=windowsgui', '-o', path.resolve(DIST, 'Korea.exe'), '.'], { cwd: 'launcher', stdio: 'inherit', env: { ...process.env, GOOS: 'windows', GOARCH: 'amd64', CGO_ENABLED: '0' } });
  else console.warn('Go not found: no Korea.exe (https://go.dev/dl/)');
}
const info = { ...buildInfo(), regions };
writeReadme(DIST, info); writeLicences(GAME);

// sizes by part
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const parts = {}; for (const f of walk(DIST)) { const r = path.relative(DIST, f).split(path.sep), k = r[0] === 'game' && r.length > 2 ? r[1] : r[r.length - 1]; parts[k] = (parts[k] || 0) + fs.statSync(f).size; }
const mb = (n) => (n / 1048576).toFixed(1) + ' MB';
console.log('built', DIST, mb(Object.values(parts).reduce((a, b) => a + b, 0)), '·', Object.entries(parts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${mb(v)}`).join(', '));
if (process.argv.includes('--zip')) { const z = zipDist(DIST, info); console.log('zip', z, mb(fs.statSync(z).size)); }
