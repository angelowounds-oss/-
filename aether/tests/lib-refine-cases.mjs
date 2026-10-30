// Small nested-refinement cases shared by the CPU reference (Node) and the WebGPU solver (browser page) in tests/webgpu-refine.mjs.
// Lengths in level-0 cells. A sphere (radius 1.5) sits on the finest level of a box that touches the floor.
const sphere = (c, R) => ({
  solid: p => (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2 < R * R,
  frac: (p, v) => { const x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2], a = v[0] * v[0] + v[1] * v[1] + v[2] * v[2], b = 2 * (v[0] * x + v[1] * y + v[2] * z), cc = x * x + y * y + z * z - R * R;
    return (-b - Math.sqrt(Math.max(b * b - 4 * a * cc, 0))) / (2 * a); },
  normal: p => { const v = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], l = Math.hypot(...v); return v.map(x => x / l); },
  dist: p => Math.max(1e-6, Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) - R) });
const base = { lattice: 'D3Q19', E: [48, 16, 16], inletOutlet: true, U: .05, model: 'reg', method: 'N1C', sponge: { Lo: 8, sigma: .1 } };
// level 1 box x 12..36, y 0..10 (floor), z 3..13; level 2 box (level-1 cells) x 36..60, y 0..14, z 10..22 = level 0 x 18..30, y 0..7, z 5..11
const boxes2 = [{ lo: [12, 0, 3], hi: [36, 10, 13] }, { lo: [36, 0, 10], hi: [60, 14, 22] }];
export const CASES = {
  // one level, periodic y / z, sphere, Smagorinsky
  uniform: () => ({ ...base, tau0: .51, cs: .15, body: { level: 0, ...sphere([14, 8, 8], 2) } }),
  // three levels, slip floor and ceiling (z periodic), sphere on level 2, Smagorinsky + hybrid regularization + wall model
  refined: () => ({ ...base, tau0: .502, cs: .15, hrr: .95, faces: { yLo: 'slip', yHi: 'slip' }, boxes: boxes2, body: { level: 2, ...sphere([22, 3.5, 8], 1.5), wallModel: { filter: 20 } } }),
  // the same with a moving no-slip floor (rolling road), slip ceiling and side walls (box edges where faces meet), no wall model
  walls: () => ({ ...base, tau0: .502, cs: .15, hrr: .95, faces: { yLo: { type: 'wall', u: [.05, 0, 0] }, yHi: 'slip', zLo: 'slip', zHi: 'slip' },
    boxes: boxes2, body: { level: 2, ...sphere([22, 3.5, 8], 1.5) } })
};
