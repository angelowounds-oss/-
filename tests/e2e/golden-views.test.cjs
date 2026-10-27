// render (AAA-PLAN Q0-3): the twelve reference views (src/views.js) all settle (ground and city tiles streamed in within 600 frames), a view taken
// twice gives the same picture (at most 0.5 % of the bytes differ: particles and lights that run on their own clocks), no view is missing and
// the page throws nothing (shader programs added after the first view are reported, not judged). Runs tests/tools/golden-views.cjs with TWICE=1.
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { result } = require('../lib.cjs');
let text = '';
try { text = execFileSync('node', [path.join(__dirname, '../tools/golden-views.cjs')], { env: { ...process.env, TWICE: '1' }, encoding: 'utf8', timeout: 3000000 }); } catch (e) { text = String(e.stdout || '') + String(e.stderr || e.message); }
const views = text.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l)), sheet = text.split('\n').find((l) => l.startsWith('sheet')) || '';
const errors = +(sheet.match(/page errors (\d+)/) || [0, -1])[1];
const skipped = views.filter((v) => v.skipped).map((v) => v.id), slow = views.filter((v) => !v.skipped && v.frames >= 600).map((v) => v.id);
const unstable = views.filter((v) => !v.skipped && v.diffShare > 0.005).map((v) => `${v.id}:${v.diffShare}`);
const compiled = views.length > 1 ? views[views.length - 1].programs - views[0].programs : 0;
const pass = views.length === 12 && !skipped.length && !slow.length && !unstable.length && errors === 0;
result('golden-views', pass, { views: views.length, skipped, slow, unstable, programsAfterFirst: compiled, errors }, pass ? '' : text.slice(-400));
