#!/usr/bin/env node
// S1 test 3: reflection of a plane acoustic pulse at the outlet (fixed-density NEEM) and at the inlet (moving-wall bounce-back, here a rigid wall: U = 0),
// with and without the absorbing layers. Fluid at rest, Gaussian density pulse (sigma 6 cells, amplitude 0.002) in the middle of a 400 x 8 x 8 box.
// R = (largest reflected |rho - 1|, sign kept) / (incident amplitude), measured at probes 50 cells either side of the pulse, in windows that contain only the first reflection.
// node tools/solver2/tests/acoustic-reflection.mjs [model = trt] [sweep = 1]
import { createLBM3DMT } from '../core3d.mjs';
const model = process.argv[2] || 'trt', sweep = (process.argv[3] || '1') === '1', full = (process.argv[4] || '1') === '1';
const nx = 400, ny = 8, nz = 8, x0 = 200, sg = 6, A = .002, nu = .02, steps = 900, cs = Math.sqrt(1 / 3);
async function run(sponge) {
  const S = createLBM3DMT({ nx, ny, nz, nu, solid: () => false, linkQ: () => .5, U: 0, model, sponge, threads: 4, init: i => [1 + A * Math.exp(-((i + .5 - x0) ** 2) / (2 * sg * sg)), 0, 0, 0] });
  const pr = [], pl = [];
  for (let s = 0; s < steps; s++) { S.advance(1); pr.push(S.probe(x0 + 50, 3, 3)[0] - 1); pl.push(S.probe(x0 - 50, 3, 3)[0] - 1); }
  await S.close();
  const peak = (a, t0, t1) => { let b = 0; for (let t = t0; t < t1; t++) if (Math.abs(a[t]) > Math.abs(b)) b = a[t]; return b; };
  const tIn = Math.round(50 / cs), inc = peak(pr, tIn - 40, tIn + 40), tOut = Math.round((2 * (nx - 1 - x0) - 50) / cs), tInl = Math.round((x0 + 50 + 50 - 50) / cs);
  void tInl;
  // outlet: right-going pulse returns to the right probe after (nx - 1 - x0) + (nx - 1 - x0 - 50) cells; inlet: left-going pulse returns to the left probe after x0 + (x0 - 50) cells
  const tOut2 = Math.round(((nx - 1 - x0) + (nx - 1 - x0 - 50)) / cs), tInl2 = Math.round((x0 + (x0 - 50)) / cs);
  void tOut;
  return { incident: peak(pr, tIn - 40, tIn + 40), incidentL: peak(pl, tIn - 40, tIn + 40), Rout: peak(pr, tOut2 - 60, tOut2 + 60) / inc, Rin: peak(pl, tInl2 - 60, tInl2 + 60) / peak(pl, tIn - 40, tIn + 40) };
}
const cases = [{}];
if (sweep) for (const L of [20, 40, 60]) for (const sigma of [.02, .05, .1, .2]) for (const dtau of [0, .3]) cases.push({ Lo: L, Li: L, sigma, dtau, full });
for (const sp of cases) { const r = await run(sp); console.log(JSON.stringify({ model, sponge: sp, incident: +r.incident.toExponential(3), Rout: +r.Rout.toFixed(3), Rin: +r.Rin.toFixed(3) })); }
