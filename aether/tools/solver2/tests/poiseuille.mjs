#!/usr/bin/env node
// CFD V3 P2 check 1: force-driven laminar Poiseuille flow between two walls (D2Q9, refine.mjs, Bouzidi walls, Guo forcing).
//   u(y) = F / (2 nu) (y - y0) (y1 - y), walls at fractional positions (the links cut them at q != 1/2), so the interpolated bounce-back is exercised.
// Variants: no-slip walls, and the wall model on (in the viscous sublayer Reichardt's law reduces to u+ = y+, so the slip velocity must vanish).
// Pass: relative L2 error < 1e-2 at H = 16 and second order between H = 8, 16, 32; the wall-model result within 1 % of the no-slip one.
// node tools/solver2/tests/poiseuille.mjs
import { createRefined } from '../refine.mjs';
const out = [];
for (const wall of [false, true]) {
  const rows = [];
  for (const H of [8, 16, 32]) {
    const tau0 = .8, nu = (tau0 - .5) / 3, umax = .02, F = 8 * nu * umax / (H * H), y0 = 2.3, y1 = y0 + H, ny = Math.ceil(y1) + 3;
    const body = { level: 0, solid: p => p[1] < y0 || p[1] > y1, frac: (p, c) => { const t = c[1] < 0 ? (p[1] - y0) / -c[1] : (y1 - p[1]) / c[1]; return t; },
      normal: p => [0, p[1] - y0 < y1 - p[1] ? 1 : -1, 0], dist: p => Math.min(p[1] - y0, y1 - p[1]), wallModel: wall };
    const S = createRefined({ lattice: 'D2Q9', E: [4, ny, 1], tau0, model: 'reg', force: [F, 0, 0], body, init: () => [1, 0, 0, 0] });
    const steps = Math.round(6 * H * H / nu); S.advance(steps);
    let e = 0, a = 0; S.forEachCell((p, rho, ux) => { const ex = F / (2 * nu) * (p[1] - y0) * (y1 - p[1]); e += (ux - ex) ** 2; a += ex * ex; });
    rows.push({ H, steps, relL2: +Math.sqrt(e / a).toExponential(3), wall: S.wall() && +S.wall().utauMean.toExponential(3) });
  }
  const order = rows.slice(1).map((r, i) => +Math.log2(rows[i].relL2 / r.relL2).toFixed(2));
  out.push({ wallModel: wall, rows, order }); console.log(JSON.stringify(out[out.length - 1]));
}
const ok = out.every(o => o.rows[1].relL2 < 1e-2 && o.order.every(x => x > 1.7)) && Math.abs(out[1].rows[1].relL2 - out[0].rows[1].relL2) < .01;
console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
