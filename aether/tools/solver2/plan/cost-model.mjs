#!/usr/bin/env node
// CFD V3 plan (docs/CFD-V3-PLAN.md §2): reproduces the cost tables.
//   work per simulated second on a uniform grid  = (V / h^3) * U / (u_lat * h)
//   nested 2:1 levels with time refinement       = sum over levels of (cells_l) * U / (u_lat * h * 2^l)
//   bandwidth ceiling                            = bandwidth / bytes per cell update (D3Q19: 19 reads + 19 writes)
//   first-cell y+                                = (h / 2) * u_tau / nu,  u_tau = U * sqrt(Cf / 2)
// node tools/solver2/plan/cost-model.mjs [U = 5] [u_lat = 0.1]
const U = +(process.argv[2] || 5), ul = +(process.argv[3] || .1), nu = 1.5e-5;
const domain = 33.5 * 8 * 13; // plenum-wide computational domain, m^3 (src/engine/09-tunnel-spec.js)
const boxes = [[7, 2.4, 3.0], [12, 4, 5], [20, 6, 8]].map(b => b[0] * b[1] * b[2]); // finest box (car + near wake) and two coarser shells, m^3
const vols = [...boxes, domain];
const rows = [];
for (const h of [.24, .12, .06, .05, .04, .03, .02]) {
  let cells = 0, work = 0, prev = 0;
  for (let l = 0; l < vols.length; l++) { const hl = h * 2 ** l, n = (vols[l] - prev) / hl ** 3; prev = vols[l]; cells += n; work += n * U / (ul * hl); }
  const uni = domain / h ** 3, uniWork = uni * U / (ul * h);
  rows.push({ h_cm: h * 100, nestedMcells: +(cells / 1e6).toFixed(2), GLUPS_realtime: +(work / 1e9).toFixed(3), uniformMcells: +(uni / 1e6).toFixed(1), uniformGLUPS: +(uniWork / 1e9).toFixed(2), workRatio: Math.round(uniWork / work), memMB_fp16_inplace: Math.round(cells * 19 * 2 / 2 ** 20), memMB_fp32_pingpong: Math.round(cells * 19 * 4 * 2 / 2 ** 20) });
}
console.table(rows);
// finest h reachable at 1:1 real time for a given sustained throughput (work is dominated by h^-4)
const workAt = h => { let w = 0, prev = 0; for (let l = 0; l < vols.length; l++) { const hl = h * 2 ** l; w += (vols[l] - prev) / hl ** 3 * U / (ul * hl); prev = vols[l]; } return w; };
const hFor = lups => { let lo = .005, hi = 1; for (let i = 0; i < 60; i++) { const m = Math.sqrt(lo * hi); if (workAt(m) > lups) lo = m; else hi = m; } return hi; };
const bytes = { fp32: 19 * 4 * 2, fp16: 19 * 2 * 2 };
const dev = [];
for (const bw of [25, 50, 100, 250, 500, 1000]) for (const eff of [.3, .6]) { const lups = bw * 1e9 / bytes.fp16 * eff; dev.push({ GBps: bw, efficiency: eff, GLUPS_fp16: +(lups / 1e9).toFixed(2), finest_h_cm_realtime: +(hFor(lups) * 100).toFixed(1), at_quarter_speed: +(hFor(lups * 4) * 100).toFixed(1) }); }
console.table(dev);
const yp = [];
for (const h of [.24, .12, .06, .03]) for (const Cf of [.002, .004]) yp.push({ h_cm: h * 100, Cf, yPlus: Math.round(h / 2 * U * Math.sqrt(Cf / 2) / nu) });
console.table(yp);
console.log(JSON.stringify({ U, u_lat: ul, Re_car: +(U * 4.7 / nu).toExponential(2), domain_m3: domain, finest_box_m3: boxes[0], finest_share_pct: +(boxes[0] / domain * 100).toFixed(2), bytesPerUpdate: bytes }));
