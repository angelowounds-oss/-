#!/usr/bin/env node
// S1 test 1: the multi-threaded TRT kernel must reproduce the single-thread reference (lbm3d.mjs) bit for bit on the fluid nodes, and report the speed-up.
// node tools/solver2/tests/mt-equivalence.mjs [steps = 300] [threads = 4]
import { createLBM3D } from '../lbm3d.mjs';
import { createLBM3DMT } from '../core3d.mjs';
const steps = +(process.argv[2] || 300), threads = +(process.argv[3] || 4), nx = 80, ny = 40, nz = 40, R = 4.5, cx = 20, cy = 20, cz = 20, U = .05, nu = .01;
const C3 = [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 1, 0], [-1, -1, 0], [1, -1, 0], [-1, 1, 0], [1, 0, 1], [-1, 0, -1], [1, 0, -1], [-1, 0, 1], [0, 1, 1], [0, -1, -1], [0, 1, -1], [0, -1, 1]];
const solid = (i, j, k) => (i + .5 - cx) ** 2 + (j + .5 - cy) ** 2 + (k + .5 - cz) ** 2 < R * R;
const linkQ = (i, j, k, q) => { const x = i + .5 - cx, y = j + .5 - cy, z = k + .5 - cz, [dx, dy, dz] = C3[q], a = dx * dx + dy * dy + dz * dz, b = 2 * (dx * x + dy * y + dz * z), c = x * x + y * y + z * z - R * R; return Math.min(1, Math.max(1e-6, (-b - Math.sqrt(Math.max(b * b - 4 * a * c, 0))) / (2 * a))); };
const o = { nx, ny, nz, nu, solid, linkQ, U };
const A = createLBM3D(o); let t = Date.now(); A.advance(steps); const tA = (Date.now() - t) / 1e3;
const B = createLBM3DMT({ ...o, threads }); t = Date.now(); B.advance(steps); const tB = (Date.now() - t) / 1e3;
let maxDiff = 0, nDiff = 0; const Nn = A.N;
for (let n = 0; n < Nn; n++) { if (A.isSolid[n]) continue; for (let q = 0; q < 19; q++) { const d = Math.abs(A.f[q * Nn + n] - B.f[q * Nn + n]); if (d > 0) nDiff++; if (d > maxDiff) maxDiff = d; } }
const fa = A.force, fb = B.force, rel = Math.abs(fa[0] - fb[0]) / Math.abs(fa[0]); // x component only: the y/z components are rounding noise around 0
console.log(JSON.stringify({ steps, threads: B.T, links: A.links, populationsDifferent: nDiff, maxAbsPopulationDiff: maxDiff, forceSingle: fa, forceMT: fb, forceRelDiff: rel, secSingle: tA, secMT: tB, speedup: +(tA / tB).toFixed(2), mlupsMT: +(nx * ny * nz * steps / tB / 1e6).toFixed(2) }));
await B.close();
process.exit(nDiff === 0 ? 0 : 1);
