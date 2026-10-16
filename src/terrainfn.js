import { TAU } from './util.js';

export const R0 = 1060, R_WALL = 1470, CELL = 10, EXTENT = 1500, INNER = 1000;
export const ROAD_W = 11;

export const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
export const vnoise = (x, y) => {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return (hash(ix, iy) * (1 - ux) + hash(ix + 1, iy) * ux) * (1 - uy) + (hash(ix, iy + 1) * (1 - ux) + hash(ix + 1, iy + 1) * ux) * uy;
};
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// terrain without roads
export function baseHeight(x, z) {
  const r = Math.hypot(x, z);
  const s = smooth(R0, R0 + 190, r), hi = smooth(1180, 1460, r);
  const ridge = 0.55 + 0.9 * vnoise(x * 0.0042 + 3.1, z * 0.0042 - 1.7), detail = vnoise(x * 0.013, z * 0.013);
  return s * ((18 + 78 * hi) * ridge + 9 * detail);
}

// ---------- road network: closed mountain loop + 4 access roads, sampled every ~8 m ----------
const roads = [];
function buildRoads() {
  const loop = [], N = 900;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU, r = 1262 + 52 * Math.sin(3 * a + 0.7) + 28 * Math.sin(7 * a + 2.1) + 14 * Math.sin(13 * a);
    loop.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, a });
  }
  // altitude: follow the slope but smooth along the road so the grade stays drivable
  let y = loop.map((p) => 12 + 0.55 * baseHeight(p.x, p.z) + 4);
  for (let it = 0; it < 6; it++) y = y.map((_, i) => { let s = 0; for (let k = -10; k <= 10; k++) s += y[(i + k + N) % N]; return s / 21; });
  loop.forEach((p, i) => (p.y = y[i]));
  roads.push({ pts: loop, closed: true });
  // access roads from the flat city edge up to the loop, bending on the way
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2, pts = [], target = loop.reduce((b, p) => (Math.abs(((p.a - a + Math.PI * 3) % TAU) - Math.PI) < Math.abs(((b.a - a + Math.PI * 3) % TAU) - Math.PI) ? p : b), loop[0]);
    const tr = Math.hypot(target.x, target.z), tA = Math.atan2(target.z, target.x), n = 60;
    for (let i = 0; i <= n; i++) {
      const t = i / n, r = 1010 + (tr - 1010) * t, ang = a + (tA - a) * t + 0.09 * Math.sin(t * TAU * 1.5) * (1 - t * 0.3);
      pts.push({ x: Math.cos(ang) * r, z: Math.sin(ang) * r, y: target.y * smooth(0, 1, t) * smooth(0, 1, t * 1.25), a: ang });
    }
    roads.push({ pts, closed: false });
  }
  // spatial hash of dense road samples for fast nearest queries
  const dense = [];
  for (const rd of roads) {
    const P = rd.pts, n = P.length;
    for (let i = 0; i < (rd.closed ? n : n - 1); i++) {
      const A = P[i], B = P[(i + 1) % n], seg = Math.hypot(B.x - A.x, B.z - A.z), steps = Math.max(1, Math.ceil(seg / 6));
      for (let s = 0; s < steps; s++) { const t = s / steps; dense.push({ x: A.x + (B.x - A.x) * t, z: A.z + (B.z - A.z) * t, y: A.y + (B.y - A.y) * t }); }
    }
  }
  const G = new Map(), CS = 40;
  for (const p of dense) { const key = Math.floor(p.x / CS) + ',' + Math.floor(p.z / CS); (G.get(key) || G.set(key, []).get(key)).push(p); }
  return { dense, G, CS };
}
let RD = null;
export function nearestRoad(x, z) {
  RD = RD || (RD = buildRoads());
  const { G, CS } = RD, cx = Math.floor(x / CS), cz = Math.floor(z / CS);
  let best = null, bd = 1e9;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const c = G.get(cx + i + ',' + (cz + j)); if (!c) continue;
    for (const p of c) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = p; } }
  }
  return best ? { d: Math.sqrt(bd), y: best.y } : null;
}
export function roadsData() { RD = RD || (RD = buildRoads()); return roads; }

export function heightAt(x, z) {
  if (Math.abs(x) < INNER && Math.abs(z) < INNER) return 0;
  let h = baseHeight(x, z);
  if (Math.hypot(x, z) < R0 - 60) return 0;
  const rd = nearestRoad(x, z);
  if (rd) { const w = 1 - smooth(8, 26, rd.d); h = h * (1 - w) + rd.y * w; }
  return Math.max(0, h);
}

