#!/usr/bin/env node
// S0 benchmark 1: Schäfer & Turek (1996) 2D-1 — steady flow past a cylinder in a channel, Re = 20.
//   channel 2.2 x 0.41, cylinder D = 0.1 centred at (0.2, 0.2), parabolic inflow U(y) = 4 Um y (H - y) / H^2 with Um = 0.3, nu = 1e-3, mean velocity 0.2.
//   reference (benchmark range): Cd 5.57-5.59 (5.5795), Cl 0.0104-0.0110 (0.0106), dp = p(0.15,0.2) - p(0.25,0.2) 0.1172-0.1176 (0.1175).
// node tools/solver2/bench/schaefer2d.mjs <lbm|proj> <D/h> [U0 lattice max velocity for LBM]
import fs from 'node:fs'; import path from 'node:path';
import { createLBM2D } from '../lbm2d.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const [method, ndArg, u0Arg, maxTArg] = process.argv.slice(2), Nd = +ndArg;
const H = .41, L = 2.2, D = .1, R = D / 2, CX = .2, CY = .2, Um = .3, NU = 1e-3, Ubar = 2 * Um / 3;
const REF = { Cd: 5.5795, Cl: .0106, dp: .1175, range: { Cd: [5.57, 5.59], Cl: [.0104, .011], dp: [.1172, .1176] } };
const out = path.join(root, 'tools/solver2/out'); fs.mkdirSync(out, { recursive: true });
const h = D / Nd, nx = Math.round(L / h), ny = Math.round(H / h);
if (Math.abs(ny * h - H) > 1e-9) throw Error('H/h must be an integer');
const t0 = Date.now(); let res;
if (method === 'lbm') {
  const U0 = +(u0Arg || .05), nuL = NU * (U0 / Um) / h, UbarL = 2 * U0 / 3;
  const pos = (i, j) => [(i + .5) * h, (j + .5) * h];
  const solid = (i, j) => { const [x, y] = pos(i, j); return (x - CX) ** 2 + (y - CY) ** 2 < R * R; };
  const Cdir = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];
  const linkQ = (i, j, k) => { const [x, y] = pos(i, j), dx = Cdir[k][0] * h, dy = Cdir[k][1] * h, ox = x - CX, oy = y - CY, a = dx * dx + dy * dy, b = 2 * (dx * ox + dy * oy), c = ox * ox + oy * oy - R * R, disc = b * b - 4 * a * c; const t = (-b - Math.sqrt(Math.max(disc, 0))) / (2 * a); return Math.min(1, Math.max(1e-6, t)); };
  const prof = j => { const y = (j + .5) * h; return [4 * U0 * y * (H - y) / (H * H), 0]; };
  const S = createLBM2D({ nx, ny, nu: nuL, solid, linkQ, inletU: prof, uInit: (i, j) => prof(j) });
  const stepsPerT = D / Ubar / (h * U0 / Um), ramp = Math.round(2 * stepsPerT), maxSteps = Math.round(+(maxTArg || 400) * stepsPerT), every = Math.max(100, Math.round(stepsPerT / 2));
  const coef = () => ({ Cd: 2 * S.force[0] / (UbarL * UbarL * Nd), Cl: 2 * S.force[1] / (UbarL * UbarL * Nd), dp: (surfRho(.15, -1) - surfRho(.25, 1)) / 3 * (Um / U0) ** 2 });
  // density on the cylinder surface at y = 0.2: average the two node rows around y, walk away from the surface to the first two fluid columns and extrapolate linearly to the surface point
  function surfRho(xs, dir) { const yj = .2 / h - .5, j0 = Math.floor(yj), ty = yj - j0, col = i => { const a = j0 + S.nx * 0; const n0 = i + S.nx * j0, n1 = i + S.nx * (j0 + 1); if (S.isSolid[n0] || S.isSolid[n1]) return null; return (1 - ty) * S.macro(n0)[0] + ty * S.macro(n1)[0]; };
    let i = Math.floor(xs / h - .5) + (dir > 0 ? 1 : 0), pts = []; while (pts.length < 2 && Math.abs(i - xs / h) < 10) { const r = col(i); if (r !== null) pts.push([(i + .5) * h, r]); i += dir; }
    const [[x1, r1], [x2, r2]] = pts; return r1 + (r2 - r1) * (xs - x1) / (x2 - x1); }
  let last = null, hist = [], conv = false;
  while (S.step < maxSteps) {
    S.step1(S.step < ramp ? Math.sin(Math.PI / 2 * S.step / ramp) : 1);
    if (S.step % every === 0 && S.step > ramp) { const c = coef(); hist.push({ step: S.step, ...c }); if (last && Math.abs(c.Cd - last.Cd) < 1e-6 * Math.abs(c.Cd) && Math.abs(c.dp - last.dp) < 1e-6 * Math.abs(c.dp)) { conv = true; last = c; break; } last = c; if (hist.length % 20 === 0) process.stdout.write(`step ${S.step} Cd ${c.Cd.toFixed(5)} Cl ${c.Cl.toFixed(5)} dp ${c.dp.toFixed(5)}\r`); }
  }
  let mass = 0; for (let n = 0; n < S.N; n++) if (!S.isSolid[n]) mass += S.macro(n)[0];
  res = { method, Nd, h, grid: [nx, ny], U0, tau: S.tau, nuL, steps: S.step, converged: conv, ...last, links: S.links.length, meanRho: mass / (S.N - S.isSolid.reduce((a, b) => a + b, 0)), hist: hist.filter((_, i) => i % 10 === 0) };
} else throw Error('method not implemented yet: ' + method);
res.wallS = (Date.now() - t0) / 1000; res.cellUpdates = res.grid[0] * res.grid[1] * res.steps;
res.err = { Cd: (res.Cd - REF.Cd) / REF.Cd, Cl: (res.Cl - REF.Cl) / REF.Cl, dp: (res.dp - REF.dp) / REF.dp };
res.inRange = { Cd: res.Cd >= REF.range.Cd[0] && res.Cd <= REF.range.Cd[1], Cl: res.Cl >= REF.range.Cl[0] && res.Cl <= REF.range.Cl[1], dp: res.dp >= REF.range.dp[0] && res.dp <= REF.range.dp[1] };
fs.writeFileSync(path.join(out, `schaefer2d_${method}_${Nd}.json`), JSON.stringify(res, null, 1));
console.log('\n' + JSON.stringify({ method, Nd, Cd: +res.Cd.toFixed(4), Cl: +res.Cl.toFixed(5), dp: +res.dp.toFixed(5), errPct: Object.fromEntries(Object.entries(res.err).map(([k, v]) => [k, +(v * 100).toFixed(2)])), converged: res.converged, steps: res.steps, wallS: res.wallS }));
