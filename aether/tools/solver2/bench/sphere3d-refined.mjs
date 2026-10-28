#!/usr/bin/env node
// CFD V3 P1 decisive test: sphere Re = 100 with local refinement (tools/solver2/refine.mjs), compared with uniform grids.
//   level 0: D/h = Nd over the same 12 D x 6 D x 6 D box as bench/sphere3d.mjs (inlet, outlet with a 2.5 D absorbing layer, periodic y and z);
//   level 1 (optional): D/h = 2 Nd in a box from 1 D upstream to 3 D downstream of the sphere centre and +-1.25 D across. The sphere lies in level 1.
// Pass criterion (docs/CFD-V3-PLAN.md P1): refined Cd within +-1 % of the uniform D/h = 2 Nd result (bench/sphere3d.mjs, same collision model and layer).
// node tools/solver2/bench/sphere3d-refined.mjs <Nd = 8> <refined: 0 | 1> [method = N1C] [model = reg] [maxT in D/U = 60]
import fs from 'node:fs'; import path from 'node:path';
import { createRefined } from '../refine.mjs';
const [ndArg = '8', refArg = '1', method = 'N1C', model = 'reg', maxTArg = '60'] = process.argv.slice(2), Nd = +ndArg, refined = refArg === '1', Re = 100, U = .06;
const nx = 12 * Nd, ny = 6 * Nd, nz = ny, cxS = 3 * Nd, cyS = ny / 2, czS = nz / 2, R = Nd / 2, nu0 = U * Nd / Re, tau0 = .5 + 3 * nu0;
const lo = [cxS - Nd, Math.round(cyS - 1.25 * Nd), Math.round(czS - 1.25 * Nd)], hi = [cxS + 3 * Nd, Math.round(cyS + 1.25 * Nd), Math.round(czS + 1.25 * Nd)];
const solid = p => (p[0] - cxS) ** 2 + (p[1] - cyS) ** 2 + (p[2] - czS) ** 2 < R * R;
// fraction of the link from p along c (level-0 units) to the sphere surface
const frac = (p, c) => { const x = p[0] - cxS, y = p[1] - cyS, z = p[2] - czS, a = c[0] * c[0] + c[1] * c[1] + c[2] * c[2], b = 2 * (c[0] * x + c[1] * y + c[2] * z), cc = x * x + y * y + z * z - R * R, disc = b * b - 4 * a * cc; return (-b - Math.sqrt(Math.max(disc, 0))) / (2 * a); };
const t0 = Date.now();
const S = createRefined({ lattice: 'D3Q19', E: [nx, ny, nz], inletOutlet: true, U, tau0, model, method, sponge: { Lo: Math.round(2.5 * Nd), sigma: .1 },
  boxes: refined ? [{ lo, hi }] : [], body: { level: refined ? 1 : 0, solid, frac } });
const DL = refined ? 2 * Nd : Nd, A = Math.PI * (DL / 2) ** 2, stepsPerT = Nd / U, every = Math.round(stepsPerT / 2), maxSteps = Math.round(+maxTArg * stepsPerT), WIN = 20;
const hist = []; let conv = false, last = null; const m0 = S.mass();
while (S.step < maxSteps) {
  S.advance(every);
  const Cd = 2 * S.force[0] / (U * U * A); hist.push({ step: S.step, tD: S.step / stepsPerT, Cd });
  process.stdout.write(`t ${(S.step / stepsPerT).toFixed(1)} D/U Cd ${Cd.toFixed(5)} ${((Date.now() - t0) / 1000).toFixed(0)} s\r`);
  if (!Number.isFinite(Cd)) break;
  const w = hist.slice(-WIN).map(h => h.Cd), mean = w.reduce((a, b) => a + b, 0) / w.length; last = mean;
  if (S.step / stepsPerT > 30 && w.length === WIN && Math.max(...w) - Math.min(...w) < .005 * mean) { conv = true; break; }
}
const res = { Nd, refined, method: refined ? method : null, model, levels: S.cells(), taus: S.taus(), fineBox: refined ? { lo, hi } : null, Cd: last, converged: conv, steps: S.step, tD: S.step / stepsPerT, wallS: (Date.now() - t0) / 1000, massChange: (S.mass() - m0) / m0, hist };
const out = path.join(path.dirname(new URL(import.meta.url).pathname), '../out'); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, `sphere3d_refined_${Nd}_${refined ? method : 'uniform'}_${model}.json`), JSON.stringify(res, null, 1));
console.log('\n' + JSON.stringify({ Nd, refined, method: res.method, model, cells: res.levels, Cd: last && +last.toFixed(4), converged: conv, tD: +res.tD.toFixed(1), wallS: +res.wallS.toFixed(0), massChange: +res.massChange.toExponential(2) }));
