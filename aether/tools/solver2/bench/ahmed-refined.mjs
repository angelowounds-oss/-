#!/usr/bin/env node
// CFD V3 P2 decisive test: Ahmed body, 25 deg slant (Ahmed, Ramm & Faltin 1984), wall-modelled LES on nested refinement (refine.mjs), CPU.
//   Geometry, levels and options: bench/ahmed-case.mjs (shared with the WebGPU page dist/AETHER_CFD_AHMED_GPU.html).
// Reference: Cd ~ 0.285 with stilts (Ahmed et al. 1984); this simplified body is expected in 0.25-0.30. CdBreakdown: drag per surface region,
// pressure (normal part of the momentum exchange per wall cell) and friction (the rest), averaged over the window. Pass (docs/CFD-V3-PLAN.md P2): within 0.285 +- 15 %
// and monotone with nH = 12, 16, 24.
// node tools/solver2/bench/ahmed-refined.mjs [nH = 16] [T in L/U = 12] [threads = 4] [Cs = 0.12]   env: WM=0 (no wall model), WMF (filter steps, 400), HRR (hybrid regularization), WMS=instant (wall-model slip direction), DIAG=1, TAG (output file suffix)
import fs from 'node:fs'; import path from 'node:path';
import { createRefined } from '../refine.mjs';
import { ahmedCase, AHMED } from './ahmed-case.mjs';
const [nHArg = '16', tArg = '12', thArg = '4', csArg = '.12'] = process.argv.slice(2), nH = +nHArg, Tend = +tArg, Cs = +csArg;
const { o, Ul, A, stepsPerLU, toM, REGIONS, E, boxes, hf, h0, tauF } = ahmedCase(nH, { cs: Cs, hrr: +(process.env.HRR || 1), wallModel: process.env.WM === '0' ? false : { filter: +(process.env.WMF || 400), ...(process.env.WMS ? { slip: process.env.WMS } : {}) } });
const { Uphys, nuPhys } = AHMED;
const t0 = Date.now(), Sim = createRefined({ ...o, threads: +thArg });
const regAcc = REGIONS.map(() => ({ pressure: 0, friction: 0 })); let regN = 0;
const cells = Sim.cells(), every = Math.max(1, Math.round(stepsPerLU / 8)), maxSteps = Math.round(Tend * stepsPerLU), hist = [];
console.log(JSON.stringify({ nH, E, boxes, cells, total: cells.reduce((a, b) => a + b, 0), work: cells.reduce((a, c, l) => a + c * 2 ** l, 0), tauF, tau0: o.tau0, stepsPerLU, setupS: (Date.now() - t0) / 1000, threads: Sim.threads }));
const out = path.join(path.dirname(new URL(import.meta.url).pathname), `../out/ahmed_refined_nH${nH}_cs${Cs}${process.env.WM === '0' ? '_noWM' : '_wmf' + (process.env.WMF || 400)}${process.env.HRR ? '_hrr' + process.env.HRR : ''}${process.env.TAG || ''}.json`);
const save = final => { const tail = hist.filter(h => h.tLU >= Tend / 2), m = tail.length ? tail.reduce((a, h) => a + h.Cd, 0) / tail.length : null, sd = tail.length ? Math.sqrt(tail.reduce((a, h) => a + (h.Cd - m) ** 2, 0) / tail.length) : null;
  const breakdown = regN ? Object.fromEntries(REGIONS.map((r, i) => [r, { pressure: +(regAcc[i].pressure / regN).toFixed(4), friction: +(regAcc[i].friction / regN).toFixed(4) }])) : null;
  const res = { nH, Uphys, nuPhys, hf, h0, E, boxes, cells, tauF, Cs, steps: Sim.step, tLU: +(Sim.step / stepsPerLU).toFixed(2), CdMean: m, CdStd: sd, window: `t >= ${Tend / 2} L/U`, CdBreakdown: breakdown, ref: { Cd: .285, band: [.285 * .85, .285 * 1.15] }, pass: final && m !== null ? m >= .285 * .85 && m <= .285 * 1.15 : null, wall: Sim.wall(), wallS: (Date.now() - t0) / 1000, hist };
  fs.writeFileSync(out, JSON.stringify(res, null, 1)); return res; };
while (Sim.step < maxSteps) {
  Sim.advance(every); const F = Sim.force, Cd = 2 * F[0] / (Ul * Ul * A), Cl = 2 * F[1] / (Ul * Ul * A); hist.push({ step: Sim.step, tLU: +(Sim.step / stepsPerLU).toFixed(3), Cd, Cl });
  if (Sim.step / stepsPerLU >= Tend / 2) { Sim.forceRegions().forEach((r, i) => { regAcc[i].pressure += 2 * r.pressure[0] / (Ul * Ul * A); regAcc[i].friction += 2 * r.friction[0] / (Ul * Ul * A); }); regN++; } // drag breakdown over the averaging window
  if (!Number.isFinite(Cd)) { console.log('diverged at', Sim.step); break; }
  if (hist.length % 8 === 0) { process.stdout.write(`t ${(Sim.step / stepsPerLU).toFixed(2)} L/U  Cd ${Cd.toFixed(4)}  Cl ${Cl.toFixed(4)}  ${((Date.now() - t0) / 1000).toFixed(0)} s\n`); save(false);
    if (process.env.DIAG) console.log(JSON.stringify(Sim.extremes().map(e => ({ l: e.level, u: +(e.umax / Ul).toFixed(2), at: e.at && toM(e.at).map(v => +v.toFixed(2)), drho: +e.drhoMax.toExponential(2), rhoAt: e.rhoAt && toM(e.rhoAt).map(v => +v.toFixed(2)) })))); }
}
const r = save(true); await Sim.close();
console.log(JSON.stringify({ nH, tLU: r.tLU, CdMean: r.CdMean && +r.CdMean.toFixed(4), CdStd: r.CdStd && +r.CdStd.toFixed(4), pass: r.pass, wallS: +r.wallS.toFixed(0) }));
