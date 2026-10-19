// The highway network as geometry data (no three.js): the routes of worldmap.js resampled every DS metres, a ring road around every city,
// four connectors from the capital's mountain loop to its ring, the interchanges where highways meet the rings, toll plazas, service areas
// and sign gantries. Every road gets an elevation profile (smoothed terrain, grade-limited) and a class per sample: 0 on the ground, 1 bridge
// (the terrain falls away), 2 tunnel (the terrain rises over the road). A spatial index answers "how far is the nearest road, and what is its
// surface height" for carving the terrain (farland.js) and for the physics ground.
import { cities, highways, farHeight, SEA, WORLD_HALF } from './worldmap.js';
import { baseHeight, roadsData } from './terrainfn.js';
import { settlements } from './settlements.js';
import { regionHeight, regionRoads } from './region.js';

export const DS = 30, HALF_W = 17.5, CARVE_FADE = 46, GRADE = 0.055;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// ground height as the far land draws it (the city's own hills near the origin, the world from ~9 km on); roads follow this
export function groundH(x, z, cell = 200) { const r = Math.hypot(x, z), w = sstep(1400, 9000, r), f = farHeight(x, z, cell); return w >= 1 ? f : baseHeight(x, z) * (1 - w) + f * w; }
const RING_R = { metropolis: 5600, port: 3700, airport: 4300, town: 2700 };
const INTERCHANGE = { metropolis: 'stack', port: 'trumpet', airport: 'cloverleaf', town: 'diamond' };

let NET = null;
export const net = () => NET || (NET = globalThis.__BAKED?.net || build());

function resample(pts, ds) {
  const out = [pts[0].slice()]; let acc = 0, prev = pts[0];
  for (let k = 1; k < pts.length; k++) {
    let a = prev, b = pts[k], seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (acc + seg >= ds) { const t = (ds - acc) / seg; a = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; out.push(a); seg = Math.hypot(b[0] - a[0], b[1] - a[1]); acc = 0; }
    acc += seg; prev = b;
  }
  if (Math.hypot(out[out.length - 1][0] - pts[pts.length - 1][0], out[out.length - 1][1] - pts[pts.length - 1][1]) > ds * 0.4) out.push(pts[pts.length - 1].slice());
  return out;
}
function profile(P, closed, fixed0, fixed1) {
  const n = P.length; let y = P.map((p) => groundH(p[0], p[1], 200));
  if (fixed0 != null) y[0] = fixed0; if (fixed1 != null) y[n - 1] = fixed1;
  const at = (a, i) => (closed ? a[(i + n) % n] : a[Math.min(n - 1, Math.max(0, i))]);
  for (let it = 0; it < 4; it++) { const o = y.slice(); for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let k = -7; k <= 7; k++) { s += at(y, i + k); c++; } o[i] = s / c; } y = o; if (fixed0 != null) y[0] = fixed0; if (fixed1 != null) y[n - 1] = fixed1; }
  const g = GRADE * DS;
  for (let pass = 0; pass < (closed ? 4 : 2); pass++) {
    for (let i = 1; i < (closed ? n * 2 : n); i++) { const a = (i - 1) % n, b = i % n; y[b] = Math.min(y[a] + g, Math.max(y[a] - g, y[b])); }
    for (let i = (closed ? n * 2 : n) - 2; i >= 0; i--) { const a = (i + 1) % n, b = i % n; y[b] = Math.min(y[a] + g, Math.max(y[a] - g, y[b])); }
  }
  // the road meets the city plateau (y = 0) over as many samples as the height difference needs, so real terrain around a town never makes a steep ramp
  const blendLen = (d) => Math.min(n - 1, Math.max(30, Math.ceil(Math.abs(d) / (0.35 * g))));
  if (fixed0 != null && !closed) { const d = fixed0 - y[0], k = blendLen(d); for (let i = 0; i <= k; i++) y[i] += d * (1 - i / k); }
  if (fixed1 != null && !closed) { const d = fixed1 - y[n - 1], k = blendLen(d); for (let i = 0; i <= k; i++) y[n - 1 - i] += d * (1 - i / k); }
  return Float32Array.from(y);
}
function classify(P, y) {
  const n = P.length, c = new Uint8Array(n);
  for (let i = 0; i < n; i++) { const d = groundH(P[i][0], P[i][1], 48) - y[i]; c[i] = d > 15 ? 2 : d < -5.5 ? 1 : 0; }
  // short runs are not worth a bridge or a tunnel (the corridor is just filled / cut)
  for (let v = 1; v <= 2; v++) { let i = 0; while (i < n) { if (c[i] !== v) { i++; continue; } let j = i; while (j < n && c[j] === v) j++; if (j - i < 7) for (let k = i; k < j; k++) c[k] = 0; i = j; } }
  return c;
}
const isDry = (x, z) => farHeight(x, z, 64) > SEA + 2.5;

// the nearest point of a compiled road to a highway end that stops at the region (within 600 m), or null
function joinRegion(p) {
  let best = null, bd = 600 * 600;
  for (const r of regionRoads()) { if (r.hw !== 'motorway' && r.hw !== 'trunk') continue; for (let i = 0; i < r.x.length; i += 2) { const d = (r.x[i] - p[0]) ** 2 + (r.z[i] - p[1]) ** 2; if (d < bd) { bd = d; best = { road: r.id, i, d: Math.sqrt(d) }; } } }
  return best;
}
function build() {
  const N = { roads: [], junctions: [], tolls: [], services: [], gantries: [], rings: new Map() };
  const cs = cities(), byId = new Map(cs.map((c) => [c.id, c]));
  // ---- ring roads: the largest radius (down from the wished one) with at least 75 % dry ground; broken into arcs where it would cross water
  const compiled = regionRoads().length > 0;   // a compiled region (ADR-0019) brings the capital's real roads: no ring or connectors there
  for (const c of cs) {
    if (compiled && c.id === 'neon') continue;
    let R = RING_R[c.type] || 2700, dry = 0;
    for (; R > 1500; R -= 200) { dry = 0; for (let a = 0; a < 48; a++) if (isDry(c.x + Math.cos(a / 48 * 6.2832) * R, c.z + Math.sin(a / 48 * 6.2832) * R)) dry++; if (dry >= 36) break; }
    const n = Math.max(24, Math.round(6.2832 * R / DS)), P = []; for (let i = 0; i < n; i++) { const a = i / n * 6.2832; P.push([c.x + Math.cos(a) * R, c.z + Math.sin(a) * R]); }
    const wet = P.map((p) => !isDry(p[0], p[1]));
    const arcs = []; let cur = null; const start = wet.indexOf(true);   // begin the walk at a wet sample so no arc straddles index 0
    if (start < 0) arcs.push({ P, closed: true });
    else { for (let k = 1; k <= n; k++) { const i = (start + k) % n; if (wet[i]) { if (cur && cur.length > 8) arcs.push({ P: cur, closed: false }); cur = null; } else (cur || (cur = [])).push(P[i]); } if (cur && cur.length > 8) arcs.push({ P: cur, closed: false }); }
    N.rings.set(c.id, { R, cx: c.x, cz: c.z, roads: [] });
    arcs.forEach((a, k) => { const y = profile(a.P, a.closed); const road = { id: `ring:${c.id}:${k}`, kind: 'ring', city: c.id, pts: a.P, y, closed: a.closed, cls: classify(a.P, y), lanes: 3 }; N.roads.push(road); N.rings.get(c.id).roads.push(road); });
  }
  const ringY = (cid, x, z) => { if (!N.rings.has(cid)) return null; let best = null, bd = 1e18; for (const r of N.rings.get(cid).roads) for (let i = 0; i < r.pts.length; i++) { const d = (r.pts[i][0] - x) ** 2 + (r.pts[i][1] - z) ** 2; if (d < bd) { bd = d; best = { road: r, i, d: Math.sqrt(d) }; } } return best; };
  // ---- highways: trimmed at the rings of their two cities, the profile ends on the ring's height
  for (const h of highways()) {
    let P = resample(h.pts, DS);
    const a = byId.get(h.a), b = byId.get(h.b), Ra = N.rings.get(a.id)?.R, Rb = N.rings.get(b.id)?.R;
    const dist = (p, c) => Math.hypot(p[0] - c.x, p[1] - c.z);
    // an end at a city with a ring stops at the ring; an end in a compiled region stops where the region begins (its own roads go on from there)
    const inside = (p, c, R) => (R ? dist(p, c) < R : regionHeight(p[0], p[1]) === regionHeight(p[0], p[1]));   // NaN outside the region's raster
    let i0 = 0; while (i0 < P.length - 1 && inside(P[i0], a, Ra)) i0++;
    let i1 = P.length - 1; while (i1 > 0 && inside(P[i1], b, Rb)) i1--;
    if (i1 - i0 < 6) continue;
    P = P.slice(i0, i1 + 1);
    const ja = ringY(a.id, P[0][0], P[0][1]), jb = ringY(b.id, P[P.length - 1][0], P[P.length - 1][1]);
    const y = profile(P, false, ja ? ja.road.y[ja.i] : null, jb ? jb.road.y[jb.i] : null);
    const road = { id: `hw:${h.id}`, kind: 'highway', a: a.id, b: b.id, pts: P, y, closed: false, cls: classify(P, y), lanes: 3 }; N.roads.push(road);
    for (const [end, c, jn] of [[0, a, ja], [P.length - 1, b, jb]]) {
      if (!N.rings.has(c.id)) { road[end ? 'joinB' : 'joinA'] = joinRegion(P[end]); continue; }   // no ring: the end meets the region's roads, no interchange or toll
      const p = P[end], q = P[end === 0 ? 1 : P.length - 2], dir = Math.atan2(q[0] - p[0], q[1] - p[1]);   // heading pointing away from the city
      N.junctions.push({ id: `${road.id}@${c.id}`, city: c.id, type: INTERCHANGE[c.type] || 'diamond', x: p[0], z: p[1], y: y[end], heading: dir, road: road.id, end, ring: jn ? jn.road.id : null });
      N.tolls.push({ road: road.id, x: P[end === 0 ? Math.min(P.length - 1, 14) : Math.max(0, P.length - 15)][0], z: P[end === 0 ? Math.min(P.length - 1, 14) : Math.max(0, P.length - 15)][1], idx: end === 0 ? 14 : P.length - 15, city: c.id });
    }
    // sign gantries 400 m after each junction and every ~6 km
    const gi = (i, to, km) => { if (i > 2 && i < P.length - 2) N.gantries.push({ road: road.id, idx: i, to, km }); };
    gi(14 + 4, b.name, Math.round(h.length / 1000)); gi(P.length - 19, a.name, Math.round(h.length / 1000));
    for (let i = 200; i < P.length - 200; i += 200) gi(i, i < P.length / 2 ? b.name : a.name, Math.round((i < P.length / 2 ? P.length - i : i) * DS / 1000));
    // service areas about every 12 km, on the side of the road
    for (let i = 400, k = 0; i < P.length - 300; i += 400, k++) N.services.push({ road: road.id, idx: i, side: k % 2 ? 1 : -1 });
  }
  // ---- the capital's connectors: from the mountain loop (r ~ 1.3 km) straight out to the ring road
  const cap = byId.get('neon'), loop = roadsData()[0].pts;
  for (let k = 0; k < (N.rings.has('neon') ? 4 : 0); k++) {
    const a = Math.PI / 4 + k * Math.PI / 2 + 0.0;
    let ln = loop[0], bd = 9; for (const p of loop) { const d = Math.abs(((p.a - a + Math.PI * 3) % 6.2832) - Math.PI); if (d < bd) { bd = d; ln = p; } }
    const R = N.rings.get('neon').R, P0 = []; const steps = Math.round((R - Math.hypot(ln.x, ln.z)) / DS);
    for (let i = 0; i <= steps; i++) { const t = i / steps, r = Math.hypot(ln.x, ln.z) + (R - Math.hypot(ln.x, ln.z)) * t, ang = Math.atan2(ln.z, ln.x) + 0.12 * Math.sin(t * Math.PI * 2); P0.push([cap.x + Math.cos(ang) * r, cap.z + Math.sin(ang) * r]); }
    const jr = ringY('neon', P0[P0.length - 1][0], P0[P0.length - 1][1]);
    const y = profile(P0, false, ln.y, jr ? jr.road.y[jr.i] : null);
    const road = { id: `conn:${k}`, kind: 'connector', city: 'neon', pts: P0, y, closed: false, cls: classify(P0, y), lanes: 2 }; N.roads.push(road);
    N.junctions.push({ id: `${road.id}@neon`, city: 'neon', type: 'diamond', x: P0[P0.length - 1][0], z: P0[P0.length - 1][1], y: y[y.length - 1], heading: Math.atan2(P0[P0.length - 2][0] - P0[P0.length - 1][0], P0[P0.length - 2][1] - P0[P0.length - 1][1]), road: road.id, end: 1, ring: jr ? jr.road.id : null });
  }
  // ---- with a compiled region the capital's four connectors run straight out along the diagonals (through the corner gates of the city's boundary
  // walls, world.js) to the nearest big compiled road beyond the capital's keep band, and meet it at its height
  if (compiled) for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
    let ln = loop[0], bd = 9; for (const p of loop) { const d = Math.abs(((p.a - a + Math.PI * 3) % 6.2832) - Math.PI); if (d < bd) { bd = d; ln = p; } }
    const r0 = Math.hypot(ln.x, ln.z), out = 2200 / Math.max(Math.abs(ca), Math.abs(sa)), ox = cap.x + ca * out, oz = cap.z + sa * out;   // just beyond the keep band (1500 + 600)
    let tgt = null, td = 900;
    for (const r of regionRoads()) { if (r.hw === 'secondary') continue; for (let i = 0; i < r.x.length; i += 2) { const d = Math.hypot(r.x[i] - ox, r.z[i] - oz); if (d < td) { td = d; tgt = { r, i }; } } }
    if (!tgt) continue;
    const P0 = [], via = [[cap.x + ca * r0, cap.z + sa * r0], [ox, oz], [tgt.r.x[tgt.i], tgt.r.z[tgt.i]]];
    for (let s2 = 0; s2 + 1 < via.length; s2++) { const [A, B] = [via[s2], via[s2 + 1]], m = Math.max(1, Math.round(Math.hypot(B[0] - A[0], B[1] - A[1]) / DS)); for (let i = 0; i < m; i++) P0.push([A[0] + (B[0] - A[0]) * i / m, A[1] + (B[1] - A[1]) * i / m]); }
    P0.push(via[2]);
    const y = profile(P0, false, ln.y, tgt.r.y[tgt.i]);
    N.roads.push({ id: `conn:${k}`, kind: 'connector', city: 'neon', pts: P0, y, closed: false, cls: classify(P0, y), lanes: 2, joinB: { road: tgt.r.id, i: tgt.i, d: 0 } });
  }
  // ---- interchange ramps: slip roads (Bezier) from a point of the highway back from the ring onto the ring, by interchange type
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const bez = (p0, p1, p2, p3, t) => { const u = 1 - t; return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]; };
  for (const j of N.junctions.slice()) {
    const ringRoad = N.roads.find((r) => r.id === j.ring), hw = N.roads.find((r) => r.id === j.road); if (!ringRoad || !hw) continue;
    // ring tangent at the junction, highway point a few hundred metres back
    let bi = 0, bd = 1e18; ringRoad.pts.forEach((p, i) => { const d = (p[0] - j.x) ** 2 + (p[1] - j.z) ** 2; if (d < bd) { bd = d; bi = i; } });
    const rn = ringRoad.pts.length, ra = ringRoad.pts[(bi + rn - 1) % rn], rb = ringRoad.pts[(bi + 1) % rn]; let Tx = rb[0] - ra[0], Tz = rb[1] - ra[1]; const tl = Math.hypot(Tx, Tz) || 1; Tx /= tl; Tz /= tl;
    const dx = Math.sin(j.heading), dz = Math.cos(j.heading);   // away from the city: the outside of the ring
    const sIdx = j.end === 0 ? Math.min(hw.pts.length - 1, 13) : Math.max(0, hw.pts.length - 14), sP = hw.pts[sIdx], sY = hw.y[sIdx];
    const loops = j.type === 'cloverleaf' ? 2 : j.type === 'trumpet' ? 1 : 0, fly = j.type === 'stack';
    const mk = (side, kind) => {   // side: +1 / -1 along the ring; kind: 'slip' | 'loop' | 'fly'
      const ex = j.x + Tx * side * (kind === 'loop' ? 300 : 230), ez = j.z + Tz * side * (kind === 'loop' ? 300 : 230);
      const lat = side * 8.5, S = [sP[0] + dz * lat, sP[1] - dx * lat], E = [ex + dx * (side * 0 + 0), ez + dz * 0];
      const dist = Math.hypot(E[0] - S[0], E[1] - S[1]), k = dist * (kind === 'loop' ? 1.15 : 0.55);
      const c1 = [S[0] - dx * k, S[1] - dz * k], c2 = kind === 'loop' ? [E[0] + dx * k * 0.9 - Tx * side * k * 0.5, E[1] + dz * k * 0.9 - Tz * side * k * 0.5] : [E[0] - Tx * side * k, E[1] - Tz * side * k];
      const n = Math.max(10, Math.round(dist * (kind === 'loop' ? 1.8 : 1.1) / 18)), pts = [], y = [], cls = [];
      const ey = ringRoad.y[(bi + (side > 0 ? 8 : -8) + rn * 4) % rn];
      for (let i = 0; i <= n; i++) { const t = i / n; pts.push(bez(S, c1, c2, E, t)); const hump = kind === 'fly' ? 9 * Math.sin(Math.PI * Math.min(1, t * 1.15)) : 0; y.push(sY + (ey - sY) * sm(0, 1, t) + hump); cls.push(hump > 3.5 ? 1 : 0); }
      N.roads.push({ id: `ramp:${j.id}:${side}:${kind}`, kind: 'ramp', city: j.city, pts, y: Float32Array.from(y), closed: false, cls: Uint8Array.from(cls), lanes: 1 });
    };
    if (fly) { mk(1, 'fly'); mk(-1, 'fly'); mk(1, 'slip'); mk(-1, 'slip'); }
    else { mk(1, loops >= 2 || j.type === 'trumpet' ? 'loop' : 'slip'); mk(-1, loops >= 2 ? 'loop' : 'slip'); if (loops >= 1) { mk(1, 'slip'); if (loops >= 2) mk(-1, 'slip'); } }
  }
  // ---- the compiled region's arterial roads (ADR-0019): one record per carriageway line, with its own width, lanes, direction and junctions
  const idOf = new Map();
  for (const r of regionRoads()) {
    const road = { id: r.id, kind: 'arterial', hw: r.hw, oneway: r.oneway, lanes: r.lanes, half: r.half, ds: r.ds, ref: r.ref, name: r.name,
      pts: Array.from(r.x, (x, i) => [x, r.z[i]]), y: r.y, cls: r.cls, closed: false, next: [], prev: [] };
    idOf.set(r, road); N.roads.push(road);
  }
  const lines = regionRoads();
  for (const r of lines) { const road = idOf.get(r); road.next = r.next.map(([li, i]) => ({ road: lines[li].id, i })); road.prev = r.prev.map(([li, i]) => ({ road: lines[li].id, i })); }
  // ---- service area pads: flat ground next to the road, carved into the terrain (the buildings stand on them)
  N.pads = [];
  for (const sv of N.services) {
    const r = N.roads.find((q) => q.id === sv.road), i = sv.idx, p = r.pts[i], q = r.pts[Math.min(r.pts.length - 1, i + 1)], l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1, nx = (q[1] - p[1]) / l, nz = -(q[0] - p[0]) / l;
    sv.x = p[0] + nx * sv.side * 62; sv.z = p[1] + nz * sv.side * 62; sv.y = r.y[i] - 0.25; sv.heading = Math.atan2(q[0] - p[0], q[1] - p[1]); sv.r = 52; N.pads.push(sv);
  }
  // ---- flat pads under the villages, farms, industry and comms towers (settlements.js): carved into the terrain, the places stand on them
  { const S = settlements(), pad = (id, x, z, r) => N.pads.push({ id, x, z, y: Math.round(groundH(x, z, 100) * 10) / 10, r });
    for (const v of S.villages) pad(v.id, v.x, v.z, v.r); for (const f of S.farms) pad(f.id, f.x, f.z, 70);
    for (const s of S.industry) pad(s.id, s.x, s.z, s.type === 'wind' ? 60 : s.type === 'refinery' ? 210 : s.type === 'mine' ? 190 : 150); for (const t of S.towers) pad(t.id, t.x, t.z, 24); }
  // ---- spatial index for carving: cell 240 m, every segment of every road
  const CS = 240, grid = new Map();
  N.roads.forEach((r, ri) => { const n = r.pts.length, m = r.closed ? n : n - 1; for (let i = 0; i < m; i++) { const A = r.pts[i], B = r.pts[(i + 1) % n]; const x0 = Math.floor((Math.min(A[0], B[0]) - 70) / CS), x1 = Math.floor((Math.max(A[0], B[0]) + 70) / CS), z0 = Math.floor((Math.min(A[1], B[1]) - 70) / CS), z1 = Math.floor((Math.max(A[1], B[1]) + 70) / CS); for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) { const key = cx * 100003 + cz; (grid.get(key) || grid.set(key, []).get(key)).push(ri, i); } } });
  N.grid = grid; N.CS = CS;
  return N;
}

// the nearest road within `max` metres of (x, z): { d, y (surface height there), cls, road, i, t }, or null
export function roadAt(x, z, max = CARVE_FADE + HALF_W) {
  const N = net(), CS = N.CS, cell = N.grid.get(Math.floor(x / CS) * 100003 + Math.floor(z / CS)); if (!cell) return null;
  let best = null, bd = max * max;
  for (let q = 0; q < cell.length; q += 2) {
    const r = N.roads[cell[q]], i = cell[q + 1], n = r.pts.length, A = r.pts[i], B = r.pts[(i + 1) % n];
    const dx = B[0] - A[0], dz = B[1] - A[1], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - A[0]) * dx + (z - A[1]) * dz) / l2)), px = A[0] + dx * t, pz = A[1] + dz * t, d2 = (x - px) ** 2 + (z - pz) ** 2;
    if (d2 < bd) { bd = d2; best = { d: Math.sqrt(d2), road: r, i, t, y: r.y[i] + (r.y[(i + 1) % n] - r.y[i]) * t, cls: r.cls[i] }; }
  }
  return best;
}
// terrain next to a road is cut / filled to the road surface by roadgrade.js (it reads the roads, pads and bridge states from here)
// blown-up bridge spans (highways.js): the sample segments 'road:i' and circles around their centres; the physics ground no longer fills them
export const BROKEN = new Set(), BREAK_AT = [];
if (typeof window !== 'undefined') window.__bro = BROKEN;   // test hook
export const brokenAt = (x, z) => { for (const b of BREAK_AT) if ((x - b.x) ** 2 + (z - b.z) ** 2 < b.r * b.r) return true; return false; };
export function breakSegment(road, i) { const k = road.id + ':' + i; if (BROKEN.has(k)) return; BROKEN.add(k); const p = road.pts[i], q = road.pts[Math.min(road.pts.length - 1, i + 1)]; BREAK_AT.push({ k, x: (p[0] + q[0]) / 2, z: (p[1] + q[1]) / 2, r: 21 }); }
export function repairSegment(road, i) { const k = road.id + ':' + i; BROKEN.delete(k); const j = BREAK_AT.findIndex((b) => b.k === k); if (j >= 0) BREAK_AT.splice(j, 1); }
export { WORLD_HALF };
