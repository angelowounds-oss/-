// Vehicle lab in Node (EV-10): runs every scenario of tests/lib/vlab.js for each lab vehicle on the game's physics and writes the values to
// tests/results/vehicle-lab-node.json. Phase 0 only records them: the bar is finite numbers. Targets: docs/design/vehicle-targets.md.
import fs from 'node:fs';
import { nodeAdapter } from '../../build/lab/vehicle-lab.mjs';
import { createRequire } from 'node:module';
const { vehicleLab } = createRequire(import.meta.url)('../lib/vlab.js');
const out = {}, bad = [];
for (const t of ['sedan', 'sport', 'suv', 'truck', 'moto', 'bus']) { try { out[t] = await vehicleLab(nodeAdapter(t), null); } catch (e) { bad.push(t + ': ' + e.message); } }
const walk = (x, p) => { if (typeof x === 'number' && !Number.isFinite(x)) bad.push(p); else if (x && typeof x === 'object') for (const k of Object.keys(x)) walk(x[k], p + '.' + k); };
walk(out, 'lab');
fs.mkdirSync(new URL('../results/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../results/vehicle-lab-node.json', import.meta.url), JSON.stringify(out, null, 1));
const brief = Object.fromEntries(Object.entries(out).map(([t, r]) => [t, { latG: r.skidpad.latG, slalom: r.slalom.kmh, lc: r.iso3888.kmh, brake: r.brake.dry, hold: r.hill.holdSlideM }]));
console.log('RESULT ' + JSON.stringify({ test: 'vehicle-lab-node', pass: bad.length === 0, metrics: { ...brief, bad: bad.slice(0, 6) }, note: '' }));
process.exitCode = bad.length ? 1 : 0;
