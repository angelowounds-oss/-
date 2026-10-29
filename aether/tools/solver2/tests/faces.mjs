#!/usr/bin/env node
// CFD V3: wall faces of refine.mjs (domain faces as free-slip or moving no-slip walls, refined boxes touching them).
//   1. uniform flow along a slip floor and ceiling, with a refined box touching the floor: must stay uniform (to round-off)
//   2. Couette flow: floor moving at U, ceiling at rest (no-slip), with a refined box touching the floor: linear profile u = U (1 - y / H), relative L2 < 1e-3
//   3. decaying slip-wall shear wave u = U cos(pi y / H) exp(-nu (pi / H)^2 t) between slip walls, refined box touching the floor (reflections from
//      cells inside the box, refluxing through the wall-face links): relative L2 < 1e-2 after one decay time and mass change < 1e-12
// node tools/solver2/tests/faces.mjs
import { createRefined } from '../refine.mjs';
let ok = true; const res = {};
for (const method of ['N1C']) {
  const S = createRefined({ lattice: 'D2Q9', E: [32, 16, 1], tau0: .7, model: 'reg', method, faces: { yLo: 'slip', yHi: 'slip' }, boxes: [{ lo: [8, 0], hi: [24, 8] }], init: () => [1, .03, 0, 0] });
  S.advance(200); let mx = 0; S.forEachCell((p, r, ux, uy) => { mx = Math.max(mx, Math.abs(ux - .03), Math.abs(uy), Math.abs(r - 1)); });
  res.slipUniform = +mx.toExponential(2); ok = ok && mx < 1e-12;
  const H = 16, U = .02, tau0 = .8, nu = (tau0 - .5) / 3;
  const T = createRefined({ lattice: 'D2Q9', E: [32, H, 1], tau0, model: 'reg', method, faces: { yLo: { type: 'wall', u: [U, 0, 0] }, yHi: { type: 'wall', u: [0, 0, 0] } }, boxes: [{ lo: [8, 0], hi: [24, 8] }], init: () => [1, 0, 0, 0] });
  T.advance(Math.round(5 * H * H / nu)); let e = 0, a = 0; T.forEachCell((p, r, ux) => { const ex = U * (1 - p[1] / H); e += (ux - ex) ** 2; a += ex * ex; });
  res.couetteRelL2 = +Math.sqrt(e / a).toExponential(2); ok = ok && Math.sqrt(e / a) < 1e-3;
  const k = Math.PI / H, V = createRefined({ lattice: 'D2Q9', E: [32, H, 1], tau0, model: 'reg', method, initNeq: true, faces: { yLo: 'slip', yHi: 'slip' }, boxes: [{ lo: [8, 0], hi: [24, 8] }], init: p => [1, U * Math.cos(k * p[1]), 0, 0] });
  const m0 = V.mass(), steps = Math.round(1 / (nu * k * k)); V.advance(steps); e = 0; a = 0;
  V.forEachCell((p, r, ux, uy, uz, vol) => { const ex = U * Math.cos(k * p[1]) * Math.exp(-nu * k * k * steps); e += vol * ((ux - ex) ** 2 + uy * uy); a += vol * ex * ex; });
  res.slipShearRelL2 = +Math.sqrt(e / a).toExponential(2); res.slipShearMass = +Math.abs(V.mass() / m0 - 1).toExponential(2); ok = ok && Math.sqrt(e / a) < 1e-2 && Math.abs(V.mass() / m0 - 1) < 1e-12;
}
console.log(JSON.stringify(res), ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
