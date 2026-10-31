// CFD V3 P4: the nested-refinement LBM around the car for the wind-tunnel app (src/engine/87l-lbm-bridge.js), WebGPU.
// World units are metres (x downstream, y up from the floor at 0, z lateral). Three levels; the finest (hf) holds the car, level 0 is 4 hf.
// Free-slip floor, ceiling and side walls, inlet at the free-stream speed, outlet with an absorbing layer; regularized + Smagorinsky + hybrid
// regularization 0.9, no wall model, simple bounce-back on the car (link fraction 1/2: the car comes as a voxel mask at the finest spacing).
// The lattice speed Ul = 0.1 (Mach 0.17) halves the steps of Ul = 0.05; one coarse step is Ul h0 / U seconds of flow time, so on most devices
// the flow runs slower than real time: timeScale reports flow seconds per wall-clock second.
// createAppLbm(device, { car: { min, max }, domain: { min, max }, U, hf, solidAt(x, y, z) -> bool }) ->
//   { pump(), sample(min, h, dims) -> Float32Array (u m/s x3, flag), force(), info }
import { createRefined } from '../refine.mjs';
import { createRefineGpu } from './refine-webgpu.mjs';
export async function createAppLbm(device, { car, domain, U, hf, solidAt, Ul = .1, nu = 1.5e-5 }) {
  const h0 = 4 * hf, L = car.max[0] - car.min[0], H = car.max[1] - car.min[1], Wc = car.max[2] - car.min[2], zc = (car.min[2] + car.max[2]) / 2;
  const cl = (v, a, b) => Math.min(b, Math.max(a, v));
  // domain (m): 1.2 L ahead, 3 L behind, floor to 2 H above the roof, +-(W/2 + 1.6 H), inside the tunnel bounds
  const X0 = cl(car.min[0] - 1.2 * L, domain.min[0], domain.max[0]), X1 = cl(car.max[0] + 3 * L, domain.min[0], domain.max[0]);
  const Y1 = cl(car.max[1] + 2 * H, 0, domain.max[1]), Zh = Math.min(Wc / 2 + 1.6 * H, zc - domain.min[2], domain.max[2] - zc), Z0 = zc - Zh;
  const E = [Math.round((X1 - X0) / h0), Math.round(Y1 / h0), Math.round(2 * Zh / h0)];
  const toL = (x, y, z) => [(x - X0) / h0, y / h0, (z - Z0) / h0], toW = p => [X0 + p[0] * h0, p[1] * h0, Z0 + p[2] * h0];
  // boxes (level-0 cells for level 1, level-1 cells for level 2), floor-touching; margins of 3 parent cells are kept
  const box = (lvl, fr, bk, top, side, outer) => { const s = 2 ** lvl, lo = toL(car.min[0] - fr * L, 0, zc - Wc / 2 - side * H), hi = toL(car.max[0] + bk * L, car.max[1] + top * H, zc + Wc / 2 + side * H);
    const b = { lo: [Math.floor(lo[0] * s), 0, Math.floor(lo[2] * s)], hi: [Math.ceil(hi[0] * s), Math.ceil(hi[1] * s), Math.ceil(hi[2] * s)] };
    for (let a = 0; a < 3; a++) { if (a !== 1) b.lo[a] = Math.max(b.lo[a], outer.lo[a] + 3); b.hi[a] = Math.min(b.hi[a], outer.hi[a] - 3); }
    return b; };
  const b1 = box(0, .6, 1.6, .8, .6, { lo: [0, 0, 0], hi: E }), outer1 = { lo: b1.lo.map(v => 2 * v), hi: b1.hi.map(v => 2 * v) };
  const b2 = box(1, .12, .6, .25, .25, outer1);
  const hfine = hf, s2 = 4, solid = p => { const w = toW(p); return solidAt(w[0], w[1], w[2]); };
  const tauF = .5 + 3 * nu * Ul / (U * hfine), tau0 = .5 + (tauF - .5) / 4;
  const o = { lattice: 'D3Q19', E, inletOutlet: true, U: Ul, tau0, model: 'reg', cs: .15, hrr: .9, method: 'N1C', sponge: { Lo: Math.max(4, Math.round(.8 * L / h0)), sigma: .1 },
    faces: { yLo: 'slip', yHi: 'slip', zLo: 'slip', zHi: 'slip' }, boxes: [b1, b2], body: { level: 2, solid, frac: () => .5 } };
  const t0 = performance.now(), S = createRefined({ ...o, topologyOnly: true }), G = await createRefineGpu(device, S, o); G.init(); await G.finish();
  const dt0 = Ul * h0 / U, work = S.levels.reduce((a, Lv) => a + Lv.N * 2 ** Lv.l, 0);
  const st = { E, boxes: [b1, b2], h0, hf: hfine, dt0, cells: S.levels.map(Lv => Lv.N), work, setupMs: performance.now() - t0, flowTime: 0, timeScale: 0, mlups: 0, steps: 0 };
  // pump(): keeps about one batch in flight; the batch size adapts so a batch takes ~25 ms of GPU time (stays responsive, below the Windows watchdog)
  let busy = false, batch = 2, tWall = performance.now(), flowAt = 0;
  st.pump = () => { if (busy) return; busy = true; const n = batch, t = performance.now(); G.advance(n);
    G.finish().then(() => { const ms = performance.now() - t; busy = false; st.steps += n; st.flowTime += n * dt0; st.mlups = work * n / (ms * 1e3);
      batch = Math.max(1, Math.min(64, Math.round(n * 25 / Math.max(1, ms))));
      const now = performance.now(); if (now - tWall > 1000) { st.timeScale = (st.flowTime - flowAt) / ((now - tWall) / 1000); tWall = now; flowAt = st.flowTime; } }); };
  // velocity (m/s) at world points mn + (i + 1/2) h, flag 1 fluid / 2 solid / 0 outside the LBM domain
  st.sample = async (mn, h, dims) => { const a = await G.sample(toL(...mn), h.map(v => v / h0), dims), k = U / Ul; for (let i = 0; i < a.length; i += 4) { a[i] *= k; a[i + 1] *= k; a[i + 2] *= k; } return a; };
  st.bounds = { min: [X0, 0, Z0], max: [X0 + E[0] * h0, E[1] * h0, Z0 + E[2] * h0] };
  // drag (N per unit density, so multiply by rho) from the momentum exchange, converted to SI: F = F_l * rho (h_f)^2 (U / Ul)^2
  st.force = async () => { const F = await G.force(), k = hfine * hfine * (U / Ul) ** 2; return F.map(v => v * k); };
  return st;
}
