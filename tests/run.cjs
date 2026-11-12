#!/usr/bin/env node
// Regression runner. Usage:
//   node tests/run.cjs                 # all suites (~35-45 min on a 4-core container)
//   node tests/run.cjs quick           # unit + smoke + the render identity checks (~4 min)
//   node tests/run.cjs render gameplay # chosen suites
//   node tests/run.cjs --only breach   # one test by name
// An entry 'file#K=V' runs the file with the environment variable K=V (a long test split into parts, EV-91).
// tests/results/history.json keeps the last 20 outcomes of every test; one that both passed and failed on the same build is reported as flaky.
// Tests run one after another (each opens its own headless browser; running them in parallel distorts the timing tests).
// Build first: node build/build.mjs. Results go to tests/results/last-run.json.
const { spawnSync } = require('child_process');
const { TIMEOUT } = require('./lib.cjs');
const fs = require('fs');
const path = require('path');

const SUITES = {
  unit: ['unit/builder-bitexact.test.mjs', 'unit/savefile.test.mjs', 'unit/shapes.test.mjs', 'unit/worldmap.test.mjs', 'unit/regions.test.mjs', 'unit/roadnet.test.mjs', 'unit/osm-roads.test.mjs', 'unit/osm-routes.test.mjs', 'unit/credits.test.mjs', 'unit/korea-rivers.test.mjs', 'unit/bake.test.mjs', 'unit/chunkpack.test.mjs', 'unit/heightmap.test.mjs', 'unit/citydetail.test.mjs', 'unit/worldnav.test.mjs', 'unit/countryroads-quality.test.mjs', 'unit/koreamap.test.mjs', 'unit/koreamap-land.test.mjs', 'unit/scale.test.mjs', 'unit/procedural-buildings.test.mjs', 'unit/streets.test.mjs', 'unit/real-data.test.mjs', 'unit/ground-contract.test.mjs', 'unit/frame.test.mjs', 'unit/korea-match.test.mjs', 'unit/world-region.test.mjs', 'unit/highway-drivable.test.mjs', 'unit/world-places.test.mjs', 'unit/world-crossings.test.mjs', 'unit/world-road-ends.test.mjs', 'unit/placement.test.mjs', 'unit/carriage.test.mjs', 'unit/regions-multi.test.mjs', 'unit/neon-connectors.test.mjs', 'unit/incheon-roads.test.mjs', 'unit/bridges.test.mjs', 'unit/assets-manifest.test.mjs', 'unit/building-ids.test.mjs', 'unit/room-walkways.test.mjs', 'unit/keys.test.mjs', 'unit/launcher.test.mjs', 'unit/package.test.mjs', 'unit/vehicle-lab.test.mjs', 'unit/audio-pipeline.test.mjs'],
  smoke: ['e2e/boot.test.cjs', 'e2e/loading-screen.test.cjs'],
  render: ['e2e/cull-identity.test.cjs', 'e2e/pack-identity.test.cjs', 'e2e/light-skip-identity.test.cjs', 'e2e/sign-ctx-restore.test.cjs', 'e2e/facade-relief.test.cjs', 'e2e/low-tier.test.cjs', 'e2e/no-runtime-compile.test.cjs', 'e2e/golden-views.test.cjs'],
  gameplay: ['e2e/region.test.cjs', 'e2e/region-drive.test.cjs', ...[0, 1, 2, 3, 4, 5].map((k) => `e2e/highway-drive.test.cjs#HD_PART=${k}/6`), 'e2e/deck-spawn.test.cjs', 'e2e/highway-spawn.test.cjs', 'e2e/vehicle-camera.test.cjs', 'e2e/realbuildings.test.cjs', 'e2e/streetscape.test.cjs', 'e2e/character.test.cjs', 'e2e/motions.test.cjs', 'e2e/motion-realism.test.cjs', 'e2e/physics-reality.test.cjs', 'e2e/vehicle-lab.test.cjs', 'e2e/traffic-audit.test.cjs', 'e2e/physics-extra.test.cjs', 'e2e/settings.test.cjs', 'e2e/dent-nan.test.cjs', 'e2e/sniper-model.test.cjs', 'e2e/building-shapes.test.cjs', 'e2e/entrance-holes.test.cjs', 'e2e/window-interiors.test.cjs', 'e2e/breach.test.cjs', 'e2e/floor-population.test.cjs', 'e2e/floor-strand.test.cjs', 'e2e/ai-behaviour.test.cjs', 'e2e/military.test.cjs', 'e2e/pool-integrity.test.cjs', 'e2e/shop-robbery.test.cjs', 'e2e/fire-spread.test.cjs', 'e2e/building-fire.test.cjs', 'e2e/sky-tower.test.cjs', 'e2e/war-craft.test.cjs', 'e2e/ragdoll-skytower.test.cjs', 'e2e/ragdoll-getup.test.cjs', 'e2e/farland.test.cjs', 'e2e/highways.test.cjs', 'e2e/cities.test.cjs', 'e2e/worldnav.test.cjs', 'e2e/water.test.cjs', 'e2e/citydetail.test.cjs', 'e2e/forest.test.cjs', 'e2e/village.test.cjs', 'e2e/landmarks.test.cjs', 'e2e/industry.test.cjs', 'e2e/pack.test.cjs', 'e2e/hiassets.test.cjs', 'e2e/transit.test.cjs', 'e2e/cityrules.test.cjs', 'e2e/flightassist.test.cjs', 'e2e/world-small.test.cjs', 'e2e/elevation-play.test.cjs'],
  perf: ['e2e/heap-gate.test.cjs', 'e2e/world-perf.test.cjs', 'e2e/frame-time.test.cjs', 'e2e/physics-interp.test.cjs', 'e2e/gunfire-load.test.cjs', 'e2e/nav-perf.test.cjs', 'e2e/autoquality.test.cjs'],
};
SUITES.quick = [...SUITES.unit, ...SUITES.smoke, 'e2e/cull-identity.test.cjs', 'e2e/light-skip-identity.test.cjs', 'e2e/error-resilience.test.cjs', 'e2e/perf-overlay.test.cjs', 'e2e/save-migrate.test.cjs'];
// what a fresh checkout can run with no baked world or OSM cache (CI, EV-90): the unit tests minus the four that read baked data
const NEEDS_BAKED = ['unit/bridges.test.mjs', 'unit/incheon-roads.test.mjs', 'unit/ktx2-pack.test.mjs', 'unit/neon-connectors.test.mjs'];
SUITES.ci = SUITES.unit.filter((t) => !NEEDS_BAKED.includes(t));
SUITES.all = [...SUITES.unit, ...SUITES.smoke, ...SUITES.render, ...SUITES.gameplay, ...SUITES.perf];

const args = process.argv.slice(2);
let files = [];
const oi = args.indexOf('--only');
if (oi >= 0) { const name = args[oi + 1]; files = SUITES.all.filter((f) => path.basename(f).startsWith(name + '.') || path.basename(f).startsWith(name + '#')); if (!files.length) { console.error('no test named ' + name); process.exit(2); } }
else for (const s of (args.length ? args : ['all'])) { if (!SUITES[s]) { console.error('unknown suite ' + s + ' (' + Object.keys(SUITES).join(', ') + ')'); process.exit(2); } files.push(...SUITES[s]); }
files = [...new Set(files)];

const game = path.join(path.resolve(process.env.GAME_DIR || path.join(__dirname, '..', 'dist', 'Korea', 'game')), 'index.html');
if (!fs.existsSync(game) && files.some((f) => f.startsWith('e2e/'))) { console.error('build the game first: node build/build.mjs (no ' + game + ')'); process.exit(2); }

const results = [];
for (const f of files) {
  const t0 = Date.now();
  process.stdout.write(`- ${f} ... `);
  const [file, envs] = f.split('#'), env = { ...process.env };
  if (envs) for (const kv of envs.split(',')) { const i = kv.indexOf('='); env[kv.slice(0, i)] = kv.slice(i + 1); }
  const r = spawnSync(process.execPath, [path.join(__dirname, file)], { encoding: 'utf8', timeout: TIMEOUT.test, maxBuffer: 64 * 1024 * 1024, env });
  const secs = Math.round((Date.now() - t0) / 1000);
  const lines = (r.stdout || '').split('\n').filter((l) => l.startsWith('RESULT '));
  if (!lines.length) {
    const why = r.error ? String(r.error) : 'no RESULT line (exit ' + r.status + ')';
    results.push({ file: f, test: path.basename(f).split('.')[0], pass: false, secs, metrics: { error: why, stderr: (r.stderr || '').slice(-800) } });
    console.log(`FAIL (${secs}s) ${why}`);
    continue;
  }
  for (const l of lines) { const o = JSON.parse(l.slice(7)); o.file = f; o.secs = secs; results.push(o); }
  const ok = lines.every((l) => JSON.parse(l.slice(7)).pass);
  console.log(`${ok ? 'ok' : 'FAIL'} (${secs}s)`);
  if (!ok) for (const l of lines) { const o = JSON.parse(l.slice(7)); if (!o.pass) console.log('    ' + o.test + ': ' + JSON.stringify(o.metrics).slice(0, 600)); }
}
const failed = results.filter((r) => !r.pass);
fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'results', 'last-run.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 1));
// flake tracking: a test whose outcome changed on the same build (same index.html) without a code change is flaky, not fixed or broken
const hp = path.join(__dirname, 'results', 'history.json');
let hist = {}; try { hist = JSON.parse(fs.readFileSync(hp, 'utf8')); } catch {}
let build = ''; try { build = String(fs.statSync(game).mtimeMs); } catch {}
const flaky = [];
for (const r of results) { const h = (hist[r.test] = hist[r.test] || []); h.push({ at: Date.now(), build, pass: !!r.pass, secs: r.secs }); if (h.length > 20) h.splice(0, h.length - 20); const same = h.filter((e) => e.build === build); if (same.some((e) => e.pass) && same.some((e) => !e.pass)) flaky.push(r.test); }
fs.writeFileSync(hp, JSON.stringify(hist));
if (flaky.length) console.log('flaky on this build: ' + flaky.join(', '));
console.log(`\n${results.length - failed.length}/${results.length} passed` + (failed.length ? ' - failed: ' + failed.map((r) => r.test).join(', ') : ''));
process.exit(failed.length ? 1 : 0);
