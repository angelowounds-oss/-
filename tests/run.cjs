#!/usr/bin/env node
// Regression runner. Usage:
//   node tests/run.cjs                 # all suites (~35-45 min on a 4-core container)
//   node tests/run.cjs quick           # unit + smoke + the render identity checks (~4 min)
//   node tests/run.cjs render gameplay # chosen suites
//   node tests/run.cjs --only breach   # one test by name
// Tests run one after another (each opens its own headless browser; running them in parallel distorts the timing tests).
// Build first: node build/build.mjs. Results go to tests/results/last-run.json.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SUITES = {
  unit: ['unit/builder-bitexact.test.mjs'],
  smoke: ['e2e/boot.test.cjs'],
  render: ['e2e/cull-identity.test.cjs', 'e2e/pack-identity.test.cjs', 'e2e/light-skip-identity.test.cjs', 'e2e/sign-ctx-restore.test.cjs', 'e2e/no-runtime-compile.test.cjs'],
  gameplay: ['e2e/entrance-holes.test.cjs', 'e2e/breach.test.cjs', 'e2e/floor-population.test.cjs', 'e2e/ai-behaviour.test.cjs', 'e2e/military.test.cjs', 'e2e/pool-integrity.test.cjs', 'e2e/shop-robbery.test.cjs', 'e2e/fire-spread.test.cjs', 'e2e/building-fire.test.cjs'],
  perf: ['e2e/frame-time.test.cjs', 'e2e/physics-interp.test.cjs', 'e2e/gunfire-load.test.cjs', 'e2e/nav-perf.test.cjs', 'e2e/autoquality.test.cjs'],
};
SUITES.quick = [...SUITES.unit, ...SUITES.smoke, 'e2e/cull-identity.test.cjs', 'e2e/light-skip-identity.test.cjs'];
SUITES.all = [...SUITES.unit, ...SUITES.smoke, ...SUITES.render, ...SUITES.gameplay, ...SUITES.perf];

const args = process.argv.slice(2);
let files = [];
const oi = args.indexOf('--only');
if (oi >= 0) { const name = args[oi + 1]; files = SUITES.all.filter((f) => path.basename(f).startsWith(name + '.')); if (!files.length) { console.error('no test named ' + name); process.exit(2); } }
else for (const s of (args.length ? args : ['all'])) { if (!SUITES[s]) { console.error('unknown suite ' + s + ' (' + Object.keys(SUITES).join(', ') + ')'); process.exit(2); } files.push(...SUITES[s]); }
files = [...new Set(files)];

const game = path.join(__dirname, '..', 'neon_city_v9.html');
if (!fs.existsSync(game) && files.some((f) => f.startsWith('e2e/'))) { console.error('build the game first: node build/build.mjs'); process.exit(2); }

const results = [];
for (const f of files) {
  const t0 = Date.now();
  process.stdout.write(`- ${f} ... `);
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', timeout: 15 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 });
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
console.log(`\n${results.length - failed.length}/${results.length} passed` + (failed.length ? ' - failed: ' + failed.map((r) => r.test).join(', ') : ''));
process.exit(failed.length ? 1 : 0);
