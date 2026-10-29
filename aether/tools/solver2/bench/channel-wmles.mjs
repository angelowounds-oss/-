#!/usr/bin/env node
// CFD V3 P2 check 2: wall-modelled LES of turbulent channel flow (refine.mjs, D3Q19, regularized + Smagorinsky, slip-velocity wall model, Guo forcing).
//   Box 6 delta x 2 delta x 3 delta (x, z periodic), walls at y = 1 and 1 + 2 delta (cells), constant driving force F = u_tau^2 / delta,
//   so the time-averaged wall stress is exactly rho u_tau^2 and u+ = <u> / u_tau can be compared with the law of the wall without fitting.
// Pass (docs/CFD-V3-PLAN.md P2): <u>+ within +-5 % of Reichardt's law over the log region (first cell to y = 0.3 delta), turbulence sustained.
// node tools/solver2/bench/channel-wmles.mjs [delta = 12 cells] [Re_tau = 1000] [spin-up turnovers = 6] [averaging turnovers = 6] [Cs = 0.1]   env: WM=0 (no wall model), THREADS
import fs from 'node:fs'; import path from 'node:path';
import { createRefined } from '../refine.mjs';
const [dArg = '12', reArg = '1000', spinArg = '6', avgArg = '6', csArg = '.1'] = process.argv.slice(2), delta = +dArg, ReT = +reArg, Cs = +csArg;
const Ub = .06, Ubp = 20, utau = Ub / Ubp, nu = utau * delta / ReT, tau0 = .5 + 3 * nu, F = utau * utau / delta; // U_b+ ~ 20 at Re_tau = 1000 (Dean) only sets the lattice speed
const nx = 6 * delta, nz = 3 * delta, y0 = 1, y1 = 1 + 2 * delta, ny = y1 + 1, turn = delta / utau;
const law = yp => Math.log(1 + .41 * yp) / .41 + 7.8 * (1 - Math.exp(-yp / 11) - yp / 11 * Math.exp(-yp / 3));
const wall = { level: 0, wallModel: process.env.WM === '0' ? false : { filter: +(process.env.WMF || 1) }, solid: p => p[1] < y0 || p[1] > y1, frac: (p, c) => c[1] < 0 ? (p[1] - y0) / -c[1] : (y1 - p[1]) / c[1],
  normal: p => [0, p[1] - y0 < y1 - p[1] ? 1 : -1, 0], dist: p => Math.min(p[1] - y0, y1 - p[1]) };
// initial state: law-of-the-wall mean profile + streamwise streaks and spanwise vortices (deterministic, so runs are repeatable)
const init = p => { const yw = Math.min(p[1] - y0, y1 - p[1]), yp = yw * utau / nu, s = (p[1] - y0) / (2 * delta), kx = 2 * Math.PI / nx, kz = 2 * Math.PI / nz;
  const a = .15 * Ub * Math.sin(Math.PI * s); return [1, utau * law(yp) + a * Math.cos(4 * kz * p[2]) * Math.sin(kx * p[0]), .3 * a * Math.sin(2 * kx * p[0]) * Math.sin(2 * Math.PI * s), a * Math.sin(3 * kz * p[2]) * Math.cos(2 * kx * p[0])]; };
const t0 = Date.now(), S = createRefined({ lattice: 'D3Q19', E: [nx, ny, nz], tau0, model: 'reg', cs: Cs, force: [F, 0, 0], body: wall, init, threads: +(process.env.THREADS || 1) });
const spin = Math.round(+spinArg * turn), avg = Math.round(+avgArg * turn), every = 50;
const prof = new Float64Array(ny), prof2 = new Float64Array(ny), cnt = new Float64Array(ny); let samples = 0; const hist = []; let diverged = false;
const sample = acc => { const m = new Float64Array(ny), m2 = new Float64Array(ny), c = new Float64Array(ny); S.forEachCell((p, rho, ux) => { const j = Math.floor(p[1]); m[j] += ux; m2[j] += ux * ux; c[j]++; });
  if (acc) { for (let j = 0; j < ny; j++) if (c[j]) { prof[j] += m[j] / c[j]; prof2[j] += m2[j] / c[j]; cnt[j]++; } samples++; }
  let ub = 0, uu = 0, n = 0; for (let j = 0; j < ny; j++) if (c[j]) { ub += m[j]; uu += m2[j] - m[j] * m[j] / c[j]; n += c[j]; } return { Ub: ub / n, urms: Math.sqrt(uu / n) }; };
const report = final => {
  const rows = []; for (let j = 0; j < ny; j++) if (cnt[j]) { const yc = j + .5, yw = Math.min(yc - y0, y1 - yc), yp = yw * utau / nu, up = prof[j] / cnt[j] / utau, rms = Math.sqrt(Math.max(0, prof2[j] / cnt[j] - (prof[j] / cnt[j]) ** 2)) / utau; rows.push({ y: yc, ywOverDelta: +(yw / delta).toFixed(3), yPlus: +yp.toFixed(1), uPlus: +up.toFixed(3), law: +law(yp).toFixed(3), err: +((up - law(yp)) / law(yp)).toFixed(4), urmsPlus: +rms.toFixed(3) }); }
  const logRegion = rows.filter(r => r.ywOverDelta <= .3), maxErr = logRegion.length && samples ? Math.max(...logRegion.map(r => Math.abs(r.err))) : NaN;
  const res = { delta, ReT, Cs, nu, tau0, F, utau, steps: S.step, turnovers: +(S.step / turn).toFixed(2), samples, maxLogErr: +maxErr.toFixed(4), pass: final ? Number.isFinite(maxErr) && maxErr <= .05 && !diverged : null, diverged, wallUtauMean: S.wall() && +S.wall().utauMean.toExponential(4), wallS: +((Date.now() - t0) / 1000).toFixed(0), rows, hist };
  fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), `../out/channel_wmles_d${delta}_Re${ReT}_cs${Cs}${process.env.WM === '0' ? '_noWM' : ''}${process.env.WMF ? '_f' + process.env.WMF : ''}.json`), JSON.stringify(res, null, 1)); return res; };
while (S.step < spin + avg) {
  S.advance(every); const acc = S.step > spin, st = sample(acc); hist.push({ step: S.step, tTurn: +(S.step / turn).toFixed(2), UbPlus: +(st.Ub / utau).toFixed(3), urmsPlus: +(st.urms / utau).toFixed(3) });
  if (!Number.isFinite(st.Ub)) { console.log('diverged at step', S.step); diverged = true; break; }
  if (S.step % (every * 40) === 0) { process.stdout.write(`t ${(S.step / turn).toFixed(2)} turnovers  Ub+ ${(st.Ub / utau).toFixed(2)}  u'+ ${(st.urms / utau).toFixed(2)}  ${((Date.now() - t0) / 1000).toFixed(0)} s\n`); if (samples) report(false); }
}
const r = report(true); await S.close();
console.log(JSON.stringify({ delta, ReT, Cs, turnovers: r.turnovers, maxLogErr: r.maxLogErr, pass: r.pass, profile: r.rows.filter(x => x.y <= y0 + delta).map(x => `y+ ${x.yPlus}: u+ ${x.uPlus} (law ${x.law}, ${(x.err * 100).toFixed(1)} %)`) }, null, 1));
