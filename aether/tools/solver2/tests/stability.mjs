#!/usr/bin/env node
// S1 test 2: stability and drag of a sphere (D = 10 cells, lattice velocity 0.06) over Reynolds number, for each collision model.
// node tools/solver2/tests/stability.mjs [models = trt,reg,regles] [Re list = 100,300,1000,3700,100000] [D/U = 24] [threads = 4]
// reg = regularized, regles = regularized + Smagorinsky (Cs = 0.1). Cd is the mean of the last 8 D/U (a stable run is not necessarily an accurate one at unresolved Re).
import { createLBM3DMT } from '../core3d.mjs';
const [modelsArg, reArg, tArg, thArg] = process.argv.slice(2), models = (modelsArg || 'trt,reg,regles').split(','), Res = (reArg || '100,300,1000,3700,100000').split(',').map(Number), TT = +(tArg || 24), threads = +(thArg || 4);
const Nd = 10, U = .06, nx = 80, ny = 40, nz = 40, R = Nd / 2, cx = 25, cy = 20, cz = 20, A = Math.PI * R * R;
const C3 = [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 1, 0], [-1, -1, 0], [1, -1, 0], [-1, 1, 0], [1, 0, 1], [-1, 0, -1], [1, 0, -1], [-1, 0, 1], [0, 1, 1], [0, -1, -1], [0, 1, -1], [0, -1, 1]];
const solid = (i, j, k) => (i + .5 - cx) ** 2 + (j + .5 - cy) ** 2 + (k + .5 - cz) ** 2 < R * R;
const linkQ = (i, j, k, q) => { const x = i + .5 - cx, y = j + .5 - cy, z = k + .5 - cz, [dx, dy, dz] = C3[q], a = dx * dx + dy * dy + dz * dz, b = 2 * (dx * x + dy * y + dz * z), c = x * x + y * y + z * z - R * R; return Math.min(1, Math.max(1e-6, (-b - Math.sqrt(Math.max(b * b - 4 * a * c, 0))) / (2 * a))); };
const rows = [];
for (const m of models) for (const Re of Res) {
  const model = m === 'trt' ? 'trt' : 'reg', cs = m === 'regles' ? .1 : 0, nu = U * Nd / Re, S = createLBM3DMT({ nx, ny, nz, nu, solid, linkQ, U, model, cs, threads }), per = Math.round(Nd / U), hist = [];
  let blew = -1; const t0 = Date.now();
  for (let s = 0; s < TT * 2; s++) { S.advance(Math.round(per / 2)); const Cd = 2 * S.force[0] / (U * U * A); if (!Number.isFinite(Cd) || !S.finite() || Math.abs(Cd) > 50) { blew = S.step; break; } hist.push(Cd); }
  const w = hist.slice(-16), mean = w.length ? w.reduce((a, b) => a + b, 0) / w.length : NaN;
  const row = { model: m, Re, cellRe: +(U / nu).toFixed(1), tau: +(.5 + 3 * nu).toFixed(5), blowupStep: blew, Cd: +mean.toFixed(4), CdMin: w.length ? +Math.min(...w).toFixed(3) : null, CdMax: w.length ? +Math.max(...w).toFixed(3) : null, massDrift: blew < 0 ? +(S.mass() - 1).toExponential(2) : null, sec: +((Date.now() - t0) / 1e3).toFixed(1) };
  rows.push(row); console.log(JSON.stringify(row)); await S.close();
}
