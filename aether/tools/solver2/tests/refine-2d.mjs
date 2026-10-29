#!/usr/bin/env node
// CFD V3 P1: 2D tests of the refinement interface (tools/solver2/refine.mjs), D2Q9, periodic boxes, against analytic solutions.
//   shear   shear wave u_x = U sin(k (y - n/4)) on a 4 x n box; band y in [n/4, 3n/4) refined, so both interfaces sit where the shear stress is largest
//   tgv     Taylor-Green vortex on n x n; square patch [n/4, 3n/4)^2 refined (interface corners)
//   pulse   right-going plane acoustic pulse (x, periodic y) through a band x in [48, 80) refined on a 128-cell box; reflection = largest density
//           difference to an unrefined run in the region the pulse has left (x < 44 after the entry, and around the band exit afterwards), over the amplitude
// Variants per coarse size N: 'coarse' (N, no refinement), 'fine' (2N, no refinement), refined methods V0, N0, N1, N1C (N with the patch on level 1).
// Diffusive scaling between sizes (tau fixed, lattice velocity ~ 1/n, steps ~ n^2), so every variant simulates the same physical problem and time.
// Initial state: equilibrium plus the Navier-Stokes non-equilibrium part (initNeq), so the start-up layer does not hide the interface error.
// Reported: relative L2 velocity error over all active cells (volume weighted) after one decay time, its observed order, and the largest relative
// change of the total mass during the run.
// node tools/solver2/tests/refine-2d.mjs [shear|tgv|pulse|all] [model = reg] [tau0 = 0.8] [sizes = 16,32,64]   env: REFINE_VARIANTS, HRR (hybrid regularization), CGG=1 (central interface gradients)
import fs from 'node:fs'; import path from 'node:path';
import { createRefined } from '../refine.mjs';
const [which = 'all', model = 'reg', tauArg = '.8', sizeArg = '16,32,64'] = process.argv.slice(2), tau0 = +tauArg, nu = (tau0 - .5) / 3, Ns = sizeArg.split(',').map(Number);
const VARIANTS = (process.env.REFINE_VARIANTS || 'coarse,fine,V0,N0,N1,N1C').split(',');
const out = { model, tau0, variants: VARIANTS, results: {} };
const CASES = {
  shear: {
    box: n => [4, n], patch: N => ({ lo: [0, N / 4], hi: [4, 3 * N / 4] }), // margin N/4 >= 3 parent cells needs N >= 12
    // exact solution on a lattice of n cells per unit length after s steps (lattice units of that run)
    exact: (n, p, s) => { const U = .4 / n, k = 2 * Math.PI / n; return [U * Math.sin(k * (p[1] - n / 4)) * Math.exp(-nu * k * k * s), 0]; },
    steps: n => Math.round(1 / (nu * (2 * Math.PI / n) ** 2))
  },
  tgv: {
    box: n => [n, n], patch: N => ({ lo: [N / 4, N / 4], hi: [3 * N / 4, 3 * N / 4] }),
    exact: (n, p, s) => { const U = .4 / n, k = 2 * Math.PI / n, e = Math.exp(-2 * nu * k * k * s); return [-U * Math.cos(k * p[0]) * Math.sin(k * p[1]) * e, U * Math.sin(k * p[0]) * Math.cos(k * p[1]) * e]; },
    // the TGV pressure field makes the equilibrium start inconsistent only in the density; start from rho = 1 + 3 p with p = -U^2/4 (cos 2kx + cos 2ky)
    rho: (n, p) => { const U = .4 / n, k = 2 * Math.PI / n; return 1 - 3 * U * U / 4 * (Math.cos(2 * k * p[0]) + Math.cos(2 * k * p[1])); },
    steps: n => Math.round(1 / (2 * nu * (2 * Math.PI / n) ** 2))
  }
};
function run(c, N, v) {
  const n = v === 'fine' ? 2 * N : N, refined = v !== 'coarse' && v !== 'fine';
  const S = createRefined({ lattice: 'D2Q9', E: [...c.box(n), 1], tau0, model, hrr: +(process.env.HRR || 1), cgGrad: process.env.CGG === '1', initNeq: true, method: refined ? v : 'V0', boxes: refined ? [c.patch(N)] : [],
    init: p => { const [ux, uy] = c.exact(n, p, 0); return [c.rho ? c.rho(n, p) : 1, ux, uy, 0]; } });
  const steps = c.steps(n), m0 = S.mass(); let drift = 0;
  for (let s = 0; s < steps; s++) { S.advance(1); if (s % 8 === 0) drift = Math.max(drift, Math.abs(S.mass() - m0) / m0); }
  drift = Math.max(drift, Math.abs(S.mass() - m0) / m0);
  let e = 0, a = 0; S.forEachCell((p, rho, ux, uy, uz, vol) => { const [ex, ey] = c.exact(n, p, steps); e += vol * ((ux - ex) ** 2 + (uy - ey) ** 2); a += vol * (ex * ex + ey * ey); });
  return { err: Math.sqrt(e / a), drift, steps, cells: S.cells() };
}
function pulse() {
  const NX = 128, NY = 4, eps = 1e-3, sg = 3, x0 = 24, cs = 1 / Math.sqrt(3), res = {};
  const init = p => { const g = eps * Math.exp(-(((p[0] - x0) / sg) ** 2)); return [1 + g, cs * g, 0, 0]; };
  const field = S => { const m = new Map(); S.forEachCell((p, rho) => { const k = Math.round(p[0] * 4); m.set(k, (m.get(k) || []).concat(rho - 1)); }); return m; };
  const at = (fl, x) => { const v = fl.get(Math.round(x * 4)); return v ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const mk = v => createRefined({ lattice: 'D2Q9', E: [NX, NY, 1], tau0, model, hrr: +(process.env.HRR || 1), cgGrad: process.env.CGG === '1', initNeq: false, method: v === 'coarse' ? 'V0' : v, boxes: v === 'coarse' ? [] : [{ lo: [48, 0], hi: [80, NY] }], init });
  const ref = mk('coarse'), runsP = {}; for (const v of VARIANTS.filter(v => v !== 'coarse' && v !== 'fine')) runsP[v] = mk(v);
  // t1: the pulse has entered the band (entry reflection travelling left, x < 44); t2: it has left the band (exit reflection inside/left of the band)
  const t1 = Math.round((60 - x0) / cs), t2 = Math.round((112 - x0) / cs);
  let t = 0; const step = n => { ref.advance(n); for (const S of Object.values(runsP)) S.advance(n); t += n; };
  step(t1); { const fr = field(ref); for (const [v, S] of Object.entries(runsP)) { const fs2 = field(S); let mx = 0; for (let x = .5; x < 44; x += 1) mx = Math.max(mx, Math.abs(at(fs2, x) - at(fr, x))); res[v] = { entryReflection: +(mx / eps).toExponential(3) }; } }
  step(t2 - t1); { const fr = field(ref); for (const [v, S] of Object.entries(runsP)) { const fs2 = field(S); let mx = 0; for (let x = 30.5; x < 96; x += 1) mx = Math.max(mx, Math.abs(at(fs2, x) - at(fr, x))); res[v].exitReflection = +(mx / eps).toExponential(3); } }
  // amplitude of the reference pulse at t2 (viscous decay), for scale
  { const fr = field(ref); let mx = 0; for (let x = .5; x < NX; x += 1) mx = Math.max(mx, Math.abs(at(fr, x))); res.referenceAmplitudeAtT2 = +(mx / eps).toFixed(3); }
  res.steps = [t1, t2]; return res;
}
if (which === 'pulse' || which === 'all') { out.results.pulse = pulse(); console.log('pulse', JSON.stringify(out.results.pulse)); }
for (const name of which === 'all' ? Object.keys(CASES) : which === 'pulse' ? [] : [which]) {
  const c = CASES[name], rows = [], t0 = Date.now();
  for (const N of Ns) {
    const row = { N };
    for (const v of VARIANTS) { const r = run(c, N, v); row[v] = +r.err.toExponential(4); row[v + '_mass'] = +r.drift.toExponential(2); }
    rows.push(row); console.log(name, JSON.stringify(row));
  }
  const ord = k => rows.slice(1).map((r, i) => +Math.log2(rows[i][k] / r[k]).toFixed(2));
  out.results[name] = { rows, order: Object.fromEntries(VARIANTS.map(v => [v, ord(v)])), wallS: (Date.now() - t0) / 1000 };
  console.log(name, 'order', JSON.stringify(out.results[name].order));
}
const dir = path.join(path.dirname(new URL(import.meta.url).pathname), '../out'); fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, `refine2d_${which}_${model}_tau${tau0}.json`), JSON.stringify(out, null, 1));
