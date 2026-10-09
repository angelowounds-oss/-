#!/usr/bin/env node
// S0 benchmark 2: steady flow past a sphere, Re = 100 (axisymmetric, steady below Re ~ 210).
//   reference Cd: 1.087 (Johnson & Patel 1999, unbounded); Clift–Grace–Weber correlation 1.09. Blockage of the periodic box is reported, not corrected.
// node tools/solver2/bench/sphere3d.mjs lbm <D/h> [U0=0.06] [maxT in D/U = 60] [box: Lx,Ly in D = 12,6]
import fs from 'node:fs'; import path from 'node:path';
import { createLBM3D } from '../lbm3d.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const [method, ndArg, u0Arg, maxTArg, boxArg] = process.argv.slice(2), Nd = +ndArg, Re = 100, REF = 1.087;
if (method !== 'lbm') throw Error('only lbm is implemented for the 3D benchmark');
const [LxD, LyD] = (boxArg || '12,6').split(',').map(Number), nx = Math.round(LxD * Nd), ny = Math.round(LyD * Nd), nz = ny;
const U = +(u0Arg || .06), nu = U * Nd / Re, R = Nd / 2, cx = 3 * Nd, cy = ny / 2, cz = nz / 2;
const Cd3 = [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 1, 0], [-1, -1, 0], [1, -1, 0], [-1, 1, 0], [1, 0, 1], [-1, 0, -1], [1, 0, -1], [-1, 0, 1], [0, 1, 1], [0, -1, -1], [0, 1, -1], [0, -1, 1]];
const pos = (i, j, k) => [i + .5 - cx, j + .5 - cy, k + .5 - cz];
const solid = (i, j, k) => { const [x, y, z] = pos(i, j, k); return x * x + y * y + z * z < R * R; };
const linkQ = (i, j, k, q) => { const [x, y, z] = pos(i, j, k), [dx, dy, dz] = Cd3[q], a = dx * dx + dy * dy + dz * dz, b = 2 * (dx * x + dy * y + dz * z), c = x * x + y * y + z * z - R * R, disc = b * b - 4 * a * c; return Math.min(1, Math.max(1e-6, (-b - Math.sqrt(Math.max(disc, 0))) / (2 * a))); };
const t0 = Date.now(), S = createLBM3D({ nx, ny, nz, nu, solid, linkQ, U });
const stepsPerT = Nd / U, ramp = Math.round(2 * stepsPerT) /* start-up transient excluded from the convergence test */, maxSteps = Math.round(+(maxTArg || 60) * stepsPerT), every = Math.round(stepsPerT / 2), A = Math.PI * R * R;
const coef = () => 2 * S.force[0] / (U * U * A);
let last = null, hist = [], conv = false;
while (S.step < maxSteps) {
  S.step1(1); // the field starts at the free-stream velocity: no inlet ramp (a ramp against a moving interior launches a long-lived pressure wave; measured Cd < 0 at 22 D/U)
  if (S.step % every === 0 && S.step > ramp) {
    const Cd = coef(), side = Math.hypot(S.force[1], S.force[2]) * 2 / (U * U * A); hist.push({ step: S.step, tD: S.step / stepsPerT, Cd, side });
    process.stdout.write(`t ${(S.step / stepsPerT).toFixed(1)} D/U Cd ${Cd.toFixed(5)} side ${side.toExponential(2)} ${((Date.now() - t0) / 1000).toFixed(0)} s\r`);
    if (last !== null && Math.abs(Cd - last) < 2e-5 * Cd) { conv = true; last = Cd; break; } last = Cd;
  }
}
const res = { method, Nd, grid: [nx, ny, nz], U, nu, tau: S.tau, Re, steps: S.step, converged: conv, Cd: last, ref: REF, err: (last - REF) / REF, blockage: Math.PI / 4 / (LyD * LyD), links: S.links, wallS: (Date.now() - t0) / 1000, hist };
res.cellUpdates = nx * ny * nz * res.steps; res.mlups = res.cellUpdates / res.wallS / 1e6;
const out = path.join(root, 'tools/solver2/out'); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, `sphere3d_${method}_${Nd}.json`), JSON.stringify(res, null, 1));
console.log('\n' + JSON.stringify({ method, Nd, grid: res.grid, Cd: +last.toFixed(4), errPct: +(res.err * 100).toFixed(2), blockagePct: +(res.blockage * 100).toFixed(2), converged: conv, steps: res.steps, wallS: res.wallS, mlups: +res.mlups.toFixed(2) }));
