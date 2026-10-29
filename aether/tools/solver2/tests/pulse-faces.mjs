#!/usr/bin/env node
// CFD V3 P2b: stability at very low viscosity (tau - 1/2 = 1e-5, Smagorinsky 0.15, D3Q19 regularized) where domain faces meet refined boxes.
//   A small acoustic pulse (rho' = 0.01, Gaussian, 2 cells) in a uniform stream U along x (x periodic), 32 x 16 x 16 level-0 cells.
//   The disturbance energy sum vol [(rho - 1)^2 / 3 + rho |u - U|^2] must not grow: E(end) / E(0) <= 1 and E(end) <= 1.5 x its lowest sampled value
//   (a slow regrowth after the decay counts as growth). A growing E is a numerical instability
//   (nothing drives the flow), and in the Ahmed run it shows up as pressure noise far above the dynamic pressure.
// Configurations (faces y, z; box in level-0 cells):
//   slip            free-slip floor, ceiling and side walls, no box             periodic-box   all periodic, box away from every face
//   slip-box        all four faces slip, box in the floor / side-wall corner    floor-box      slip floor and ceiling, z periodic, box on the floor
//   xfloor-box      as floor-box, box spanning x (only z interfaces meet the floor)
//   zfloor-box      as floor-box, box spanning z (only x interfaces meet the floor)
//   floorwall       moving no-slip floor (belt speed U), slip ceiling, no box   floorwall-box  the same with a box on the floor
//   pz-box, px-box  no faces, box spanning periodic z / x                       tall-box       no faces, box 10 cells tall
// node tools/solver2/tests/pulse-faces.mjs [config ...]   (default: all, four at a time)   env: STEPS (3000), METHOD (N1C), HRR (1), TAU (1e-5), U (0.05),
//   MODEL (reg), CS (0.15), MIRROR=0 (one-sided interface gradients at slip faces), NEQ=grad (interface stress from the velocity gradient), RR=1 (recursive regularization),
//   IFT, IFW (interface damping band: tau - 1/2 floor in coarse units, width in coarse cells)
import { spawn } from 'node:child_process';
import { createRefined } from '../refine.mjs';
const SLIP4 = { yLo: 'slip', yHi: 'slip', zLo: 'slip', zHi: 'slip' }, FLOOR = { yLo: 'slip', yHi: 'slip' }, U = +(process.env.U ?? .05), BELT = { yLo: { type: 'wall', u: [U, 0, 0] }, yHi: 'slip' };
const CFG = {
  slip: [SLIP4, [], [16, 3, 3]], 'periodic-box': [undefined, [{ lo: [8, 4, 4], hi: [24, 10, 10] }], [16, 7, 7]],
  'slip-box': [SLIP4, [{ lo: [8, 0, 0], hi: [24, 6, 6] }], [16, 3, 3]], 'floor-box': [FLOOR, [{ lo: [8, 0, 5], hi: [24, 6, 11] }], [16, 3, 8]],
  'xfloor-box': [FLOOR, [{ lo: [0, 0, 5], hi: [32, 6, 11] }], [16, 3, 8]], 'zfloor-box': [FLOOR, [{ lo: [8, 0, 0], hi: [24, 6, 16] }], [16, 3, 8]],
  floorwall: [BELT, [], [16, 3, 8]], 'floorwall-box': [BELT, [{ lo: [8, 0, 5], hi: [24, 6, 11] }], [16, 3, 8]],
  // controls without domain faces: a box spanning periodic z or x, and a taller box
  'pz-box': [undefined, [{ lo: [8, 4, 0], hi: [24, 10, 16] }], [16, 7, 8]], 'px-box': [undefined, [{ lo: [0, 4, 5], hi: [32, 10, 11] }], [16, 7, 8]],
  'tall-box': [undefined, [{ lo: [8, 3, 4], hi: [24, 13, 12] }], [16, 8, 8]] };
const args = process.argv.slice(2);
if (args.length === 1 && CFG[args[0]]) { // one configuration: print one JSON line
  const name = args[0], [faces, boxes, pc] = CFG[name], steps = +(process.env.STEPS || 3000), method = process.env.METHOD || 'N1C', hrr = +(process.env.HRR || 1), tau0 = .5 + +(process.env.TAU || 1e-5), model = process.env.MODEL || 'reg', cs = +(process.env.CS ?? .15), mirror = process.env.MIRROR !== '0', neq = process.env.NEQ || undefined, recursive = process.env.RR === '1', iface = process.env.IFT ? { tau: +process.env.IFT, width: +(process.env.IFW || 2) } : undefined;
  const S = createRefined({ lattice: 'D3Q19', E: [32, 16, 16], tau0, model, cs, method, hrr, mirror, neq, recursive, iface, faces, boxes,
    init: p => { const r2 = (p[0] - pc[0]) ** 2 + (p[1] - pc[1]) ** 2 + (p[2] - pc[2]) ** 2; return [1 + .01 * Math.exp(-r2 / 4), U, 0, 0]; } });
  const energy = () => { let e = 0; S.forEachCell((p, r, ux, uy, uz, vol) => { e += vol * ((r - 1) ** 2 / 3 + r * ((ux - U) ** 2 + uy * uy + uz * uz)); }); return e; };
  const e0 = energy(), hist = [];
  for (let s = 0; s < steps; s += 250) { S.advance(Math.min(250, steps - s)); const e = energy() / e0; hist.push(+e.toExponential(2)); if (!Number.isFinite(e)) break; }
  const end = hist[hist.length - 1], peak = Math.max(...hist);
  console.log(JSON.stringify({ name, model, cs, method, hrr, recursive, iface, mirror, neq, tau0, steps, energyRatio: hist, end, peak, ok: Number.isFinite(end) && end <= 1 && peak <= 2 && end <= 1.5 * Math.min(...hist) }));
  await S.close();
} else {
  const names = args.length ? args : Object.keys(CFG), res = []; let next = 0;
  const run = () => new Promise(done => { const name = names[next++]; let out = ''; const ch = spawn(process.execPath, [new URL(import.meta.url).pathname, name], { env: process.env });
    ch.stdout.on('data', b => { out += b; }); ch.stderr.on('data', b => { out += b; }); ch.on('close', () => { const line = out.trim().split('\n').pop(); try { res.push(JSON.parse(line)); } catch { res.push({ name, ok: false, error: out.slice(-300) }); } console.log(line); done(); }); });
  const lane = async () => { while (next < names.length) await run(); };
  await Promise.all([0, 1, 2, 3].map(lane));
  const bad = res.filter(r => !r.ok).map(r => r.name);
  console.log(bad.length ? `FAIL (${bad.join(', ')})` : 'PASS'); process.exit(bad.length ? 1 : 0);
}
