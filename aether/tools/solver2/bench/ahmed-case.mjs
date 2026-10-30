// CFD V3: the Ahmed body case (25 deg slant) for createRefined, shared by the CPU run (bench/ahmed-refined.mjs) and the WebGPU page
// (dist/AETHER_CFD_AHMED_GPU.html), so both build exactly the same geometry, levels and options. No Node or browser dependencies.
//   Standard geometry (L 1.044, W 0.389, H 0.288, nose radius 0.1, slant 0.222 m at 25 deg), 0.05 m above a free-slip floor, no stilts (as tests/ahmed.mjs),
//   U = 40 m/s, nu = 1.5e-5 (Re_L = 2.8e6; the drag of this body is nearly Reynolds-independent above ~5e5). Four levels, the finest has H / h = nH.
//   Free-slip floor, ceiling and side walls (blockage about 1.4 %), inlet, outlet with an absorbing layer. Regularized collision + Smagorinsky, wall model.
// ahmedCase(nH, { cs = 0.12, hrr = 1, wallModel = { filter: 400 } | false }) -> { o (createRefined options), Ul, A (frontal area, finest lattice units),
//   stepsPerLU (coarse steps per L / U), toM (level-0 units -> metres), REGIONS, E, boxes, hf, h0, tauF, tau0 }
export const AHMED = { Lb: 1.044, Wb: .389, Hb: .288, Rn: .1, ls: .222, th: 25 * Math.PI / 180, clear: .05, Uphys: 40, nuPhys: 1.5e-5, CdRef: .285 };
export const REGIONS = ['front', 'roof', 'slant', 'base', 'sides', 'underbody'];
export function ahmedCase(nH, { cs = .12, hrr = 1, wallModel = { filter: 400 } } = {}) {
  const { Lb, Wb, Hb, Rn, ls, th, clear, Uphys, nuPhys } = AHMED, Ul = .05, NL = 3;
  const hf = Hb / nH, h0 = hf * 2 ** NL; // finest and coarsest cell sizes, m
  // domain (m): x from 3 L ahead of the nose to 7 L behind, floor y = 0 to 7 H, z +-(W/2 + 5 H); body centre at x = 0
  const X0 = -Lb / 2 - 3 * Lb, X1 = Lb / 2 + 7 * Lb, Y1 = 7 * Hb, Z1 = Wb / 2 + 5 * Hb;
  const E = [Math.round((X1 - X0) / h0), Math.round(Y1 / h0), 2 * Math.round(Z1 / h0)], zc = E[2] / 2 * h0; // z = 0 at the domain centre
  const toM = p => [X0 + p[0] * h0, p[1] * h0, p[2] * h0 - zc]; // level-0 units -> metres
  // signed distance to the body (m, negative inside): front-rounded box intersected with the slant half-space
  const sdf = (x, y, z) => {
    const u = x, v = y - (clear + Hb / 2), w = z, hl = Lb / 2, hh = Hb / 2, hw = Wb / 2;
    let db;
    if (u < -hl + Rn) { // front part: rounded-box distance (edges and corners of the nose rounded with radius Rn)
      const qx = -hl + Rn - u, qy = Math.abs(v) - (hh - Rn), qz = Math.abs(w) - (hw - Rn);
      db = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - Rn;
    } else db = Math.max(Math.abs(v) - hh, Math.abs(w) - hw, u - hl, -u - hl);
    const us = hl - ls * Math.cos(th), dp = (u - us) * Math.sin(th) + (v - hh) * Math.cos(th); // slant plane through (us, hh), outward normal (sin, cos, 0)
    return Math.max(db, dp);
  };
  const S3 = p => { const m = toM(p); return sdf(m[0], m[1], m[2]); };
  const solid = p => S3(p) < 0;
  const frac = (p, c) => { let a = 0, b = 1; for (let i = 0; i < 40; i++) { const t = (a + b) / 2; if (S3([p[0] + t * c[0], p[1] + t * c[1], p[2] + t * c[2]]) < 0) b = t; else a = t; } return (a + b) / 2; };
  const normal = p => { const e = 1e-3, m = toM(p), g = [0, 1, 2].map(k => { const a = m.slice(), b = m.slice(); a[k] += e; b[k] -= e; return (sdf(...a) - sdf(...b)) / (2 * e); }); return g; };
  const dist = p => Math.max(1e-6, S3(p)) / h0; // level-0 units
  // surface regions for the drag breakdown (Ahmed et al. 1984 split the drag into forebody, slant, base pressure and friction)
  const region = (p, nv) => { const m = toM(p); if (nv[0] * Math.sin(th) + nv[1] * Math.cos(th) > .85 && m[0] > 0) return 2; if (nv[0] > .7 && m[0] > 0) return 3;
    if (m[0] < -Lb / 2 + Rn) return 0; if (nv[1] > .7) return 1; if (nv[1] < -.7) return 5; return 4; };
  // nested boxes (m): level 1, 2, 3 around the body (all touch the floor)
  const boxM = [[-Lb / 2 - 1.6 * Lb, Lb / 2 + 5 * Lb, clear + Hb + 2.5 * Hb, Wb / 2 + 2.5 * Hb], [-Lb / 2 - .8 * Lb, Lb / 2 + 2.5 * Lb, clear + Hb + 1.2 * Hb, Wb / 2 + 1.2 * Hb], [-Lb / 2 - .3 * Lb, Lb / 2 + 1 * Lb, clear + Hb + .4 * Hb, Wb / 2 + .4 * Hb]];
  const boxes = boxM.map(([xa, xb, yt, zw], i) => { const hp = h0 / 2 ** i; return { lo: [Math.floor((xa - X0) / hp), 0, Math.floor((zc - zw) / hp)], hi: [Math.ceil((xb - X0) / hp), Math.ceil(yt / hp), Math.ceil((zc + zw) / hp)] }; });
  const nuF = nuPhys * Ul / (Uphys * hf), tauF = .5 + 3 * nuF, tau0 = .5 + (tauF - .5) / 2 ** NL;
  const o = { lattice: 'D3Q19', E, inletOutlet: true, U: Ul, tau0, model: 'reg', cs, hrr, method: 'N1C', sponge: { Lo: Math.round(1.5 * Lb / h0), sigma: .1 },
    faces: { yLo: 'slip', yHi: 'slip', zLo: 'slip', zHi: 'slip' }, boxes, body: { level: NL, solid, frac, normal, dist, region, wallModel } };
  return { o, Ul, A: Wb * Hb / (hf * hf), stepsPerLU: Lb / h0 / Ul, toM, REGIONS, E, boxes, hf, h0, tauF, tau0 };
}
