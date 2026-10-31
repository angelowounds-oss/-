// The road pass of the world compiler (ADR-0019, KOREA-PLAN v2 M3a): the real arterial roads, generalized to 1:1 design rules at 1:6.5 and laid into
// the ground in one pass. Each carriageway is a line of its own: at 1:6.5 the two sides of a dual road lie a few metres apart and their corridors merge.
//   1. chain the OpenStreetMap pieces (split at every bridge and junction) into long lines per class and name
//   2. generalize: resample every STEP, then relax the stretches tighter than the class's minimum radius (the ends stay put)
//   3. profile: the ground under the line (bridges and tunnels left out and bridged straight), smoothed, grade-limited both ways
//   4. lay in: line by line, highest class and longest first; each line reads the ground the earlier ones left, meets their surface where it touches
//      them, and its own flat surface becomes final for the lines after it
import { project, KOREA_SCALE } from '../../src/koreamap.js';

const STEP = 8, MIN_GAP = 3;   // map metres between line points; the closest two points may be after relaxing
// per class: minimum radius and maximum grade (1:1 design rules, game metres), half width of one carriageway, priority (lower lays first)
export const CLASS = {
  motorway: { rmin: 154, grade: 0.06, half: 7, order: 0 },
  trunk: { rmin: 60, grade: 0.08, half: 6, order: 1 },
  primary: { rmin: 60, grade: 0.08, half: 5, order: 2 },
  secondary: { rmin: 30, grade: 0.1, half: 4, order: 3 },
  // slip roads and interchange ramps (OpenStreetMap *_link): slower design speed than the road they leave, one lane, one way; laid just after it
  motorway_link: { rmin: 50, grade: 0.08, half: 4, order: 0.5 },
  trunk_link: { rmin: 40, grade: 0.09, half: 4, order: 1.5 },
  primary_link: { rmin: 30, grade: 0.09, half: 4, order: 2.5 },
  secondary_link: { rmin: 25, grade: 0.1, half: 3.5, order: 3.5 },
  // collectors and streets (KOR-R4): a street follows the ground (lay: false) instead of cutting a corridor through the 16 m raster, where it would
  // flatten a town into steps; its dead ends are real, so they are not led on to the next road
  tertiary: { rmin: 20, grade: 0.12, half: 3.5, order: 4 },
  tertiary_link: { rmin: 20, grade: 0.12, half: 3, order: 4.5 },
  residential: { rmin: 12, grade: 0.15, half: 3, order: 5, lay: false },
};
const NORM = { unclassified: 'residential', living_street: 'residential' };   // other OpenStreetMap classes that are streets here
const FADE = 30, SMOOTH = 12;
// the width the game draws (src/highways.js artWidth): a one-way carriageway of n lanes, or a two-way road of n lanes each side, plus shoulders
export const DEFAULT_LANES = { motorway: 3, trunk: 2, primary: 2, secondary: 1, motorway_link: 1, trunk_link: 1, primary_link: 1, secondary_link: 1, tertiary: 1, tertiary_link: 1, residential: 1 };   // per direction when OpenStreetMap gives none
export function lanesOf(L) { return L.lanes || (L.oneway ? DEFAULT_LANES[L.hw] : 2 * DEFAULT_LANES[L.hw]); }
export function halfOf(L) { const per = Math.max(1, Math.min(4, L.oneway ? lanesOf(L) : Math.ceil(lanesOf(L) / 2))), w = per * 3.75 + 2.4; return L.oneway ? w / 2 : w; }   // metres from the flat edge back to the ground; samples each side in the profile mean
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// a way with a point inside a site (map metres, with its radius and a margin for the streets around it)
function inSites(geom, sites) {
  for (const p of geom) { const q = project(p.lon, p.lat); for (const o of sites) if (Math.hypot(q.x - o.x, q.z - o.z) < o.r) return true; }
  return false;
}
// 1. long lines: pieces of the same class and name (or ref) joined where one ends and the next begins, in the direction of travel
function chains(els, sites) {
  const key = (p) => `${Math.round(p.lon * 1e6)},${Math.round(p.lat * 1e6)}`, groups = new Map();
  for (const e of els) {
    const t = e.tags || {}, hw = NORM[t.highway] || t.highway; if (!CLASS[hw] || !e.geometry || e.geometry.length < 2) continue;
    if (CLASS[hw].lay === false && !inSites(e.geometry, sites)) continue;   // streets only where there is a town
    const g = hw + '|' + (t.ref || t.name || e.id); if (!groups.has(g)) groups.set(g, []);
    const lanes = parseInt(t.lanes, 10);
    groups.get(g).push({ pts: e.geometry, bridge: !!t.bridge && t.bridge !== 'no', tunnel: !!t.tunnel && t.tunnel !== 'no', oneway: t.oneway === 'yes' || ((hw === 'motorway' || hw.endsWith('_link')) && t.oneway !== 'no'),
      lanes: lanes > 0 ? lanes : 0, ref: t.ref || null, name: t.name || null, hw, used: false });
  }
  const out = [];
  for (const list of groups.values()) {
    const starts = new Map(); for (const w of list) { const k = key(w.pts[0]); if (!starts.has(k)) starts.set(k, []); starts.get(k).push(w); }
    const ends = new Set(list.map((w) => key(w.pts[w.pts.length - 1])));
    // begin at pieces nothing leads into, then the rest (rings)
    const order = [...list.filter((w) => !ends.has(key(w.pts[0]))), ...list];
    for (const w0 of order) {
      if (w0.used) continue;
      const line = []; let w = w0;
      while (w && !w.used) {
        w.used = true;
        for (let i = line.length ? 1 : 0; i < w.pts.length; i++) line.push({ lon: w.pts[i].lon, lat: w.pts[i].lat, bridge: w.bridge, tunnel: w.tunnel });
        const next = (starts.get(key(w.pts[w.pts.length - 1])) || []).filter((q) => !q.used);
        w = next[0] || null;
      }
      if (line.length >= 2) out.push({ hw: w0.hw, oneway: w0.oneway, lanes: w0.lanes, ref: w0.ref, name: w0.name, pts: line });
    }
  }
  return out;
}

// 2. map metres, resampled every STEP, relaxed where tighter than rmin; returns { X, Z, cls (0 ground, 1 bridge, 2 tunnel), shift (largest move) }
function generalize(c) {
  const P = c.pts.map((p) => { const q = project(p.lon, p.lat); return { x: q.x, z: q.z, cls: p.tunnel ? 2 : p.bridge ? 1 : 0 }; });
  const X = [], Z = [], C = []; let acc = 0;
  X.push(P[0].x); Z.push(P[0].z); C.push(P[0].cls);
  for (let i = 1; i < P.length; i++) {
    let ax = X[X.length - 1], az = Z[Z.length - 1]; const bx = P[i].x, bz = P[i].z; let l = Math.hypot(bx - ax, bz - az);
    while (acc + l >= STEP) { const f = (STEP - acc) / l; ax += (bx - ax) * f; az += (bz - az) * f; X.push(ax); Z.push(az); C.push(P[i].cls); l = Math.hypot(bx - ax, bz - az); acc = 0; }
    acc += l;
  }
  X.push(P[P.length - 1].x); Z.push(P[P.length - 1].z); C.push(P[P.length - 1].cls);
  const n = X.length, X0 = Float64Array.from(X), Z0 = Float64Array.from(Z), x = Float64Array.from(X), z = Float64Array.from(Z), rmin = CLASS[c.hw].rmin;
  const k = Math.max(1, Math.round(rmin * 0.5 / STEP));   // the circle through i-k, i, i+k measures the bend over about one radius
  const radius = (i) => {
    const a = i - k, b = i + k, ux = x[i] - x[a], uz = z[i] - z[a], vx = x[b] - x[i], vz = z[b] - z[i], wx = x[b] - x[a], wz = z[b] - z[a];
    const cross = Math.abs(ux * vz - uz * vx); return cross < 1e-9 ? Infinity : (Math.hypot(ux, uz) * Math.hypot(vx, vz) * Math.hypot(wx, wz)) / (2 * cross);
  };
  let tight = 0;
  for (let it = 0; it < 600; it++) {
    const bad = new Uint8Array(n); tight = 0;
    for (let i = k; i < n - k; i++) if (radius(i) < rmin) { tight++; for (let q = Math.max(1, i - k); q <= Math.min(n - 2, i + k); q++) bad[q] = 1; }
    if (!tight) break;
    for (let i = 1; i < n - 1; i++) if (bad[i]) { x[i] = 0.5 * x[i] + 0.25 * (x[i - 1] + x[i + 1]); z[i] = 0.5 * z[i] + 0.25 * (z[i - 1] + z[i + 1]); }
  }
  let shift = 0; for (let i = 0; i < n; i++) shift = Math.max(shift, Math.hypot(x[i] - X0[i], z[i] - Z0[i]));
  // relaxing a bend packs points a metre apart; they add nothing and make a kink in the ribbon, so drop the ones closer than MIN_GAP (the ends stay)
  const keep = [0]; for (let i = 1; i < n - 1; i++) if (Math.hypot(x[i] - x[keep[keep.length - 1]], z[i] - z[keep[keep.length - 1]]) >= MIN_GAP) keep.push(i);
  if (keep.length > 1 && Math.hypot(x[n - 1] - x[keep[keep.length - 1]], z[n - 1] - z[keep[keep.length - 1]]) < MIN_GAP) keep.pop();
  keep.push(n - 1);
  if (keep.length < n) { const nx = Float64Array.from(keep, (i) => x[i]), nz = Float64Array.from(keep, (i) => z[i]), nc = Uint8Array.from(keep, (i) => C[i]); return { hw: c.hw, oneway: c.oneway, lanes: c.lanes, ref: c.ref, name: c.name, X: nx, Z: nz, cls: nc, shift, tight, rminSeen: Infinity, n: keep.length }; }
  let rminSeen = Infinity; for (let i = k; i < n - k; i++) rminSeen = Math.min(rminSeen, radius(i));
  return { hw: c.hw, oneway: c.oneway, lanes: c.lanes, ref: c.ref, name: c.name, X: x, Z: z, cls: Uint8Array.from(C), shift, tight, rminSeen, n };
}

// 2b. a line that ends short of another road (generalizing moves ends by tens of metres, and ways end at roads this pass does not carry) is led on to it
const SNAP = 130, SNAP_NEAR = 40, SNAP_ANGLE = 70 * Math.PI / 180;
function snapEnds(lines) {
  const CS = 64, grid = new Map(), K = (a, b) => a * 100003 + b;
  lines.forEach((L, li) => { for (let i = 0; i < L.n; i++) { const k = K(Math.floor(L.X[i] / CS), Math.floor(L.Z[i] / CS)); let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(li, i); } });
  const nearest = (li, x, z, rad) => { let best = null, bd = rad; const n = Math.ceil(rad / CS);
    for (let a = -n; a <= n; a++) for (let b = -n; b <= n; b++) { const c = grid.get(K(Math.floor(x / CS) + a, Math.floor(z / CS) + b)); if (!c) continue; for (let q = 0; q < c.length; q += 2) { if (c[q] === li) continue; const d = Math.hypot(lines[c[q]].X[c[q + 1]] - x, lines[c[q]].Z[c[q + 1]] - z); if (d < bd) { bd = d; best = [c[q], c[q + 1], d]; } } }
    return best; };
  let snapped = 0, left = 0; const add = [];
  lines.forEach((L, li) => {
    for (const end of [0, 1]) {
      const i = end ? L.n - 1 : 0, j = end ? L.n - 2 : 1; if (CLASS[L.hw].lay === false || nearest(li, L.X[i], L.Z[i], SNAP_NEAR)) continue;
      const t = nearest(li, L.X[i], L.Z[i], SNAP); if (!t) { left++; continue; }
      const tx = lines[t[0]].X[t[1]], tz = lines[t[0]].Z[t[1]], da = Math.atan2(L.Z[i] - L.Z[j], L.X[i] - L.X[j]), db = Math.atan2(tz - L.Z[i], tx - L.X[i]);
      let d = Math.abs(da - db) % (2 * Math.PI); d = Math.min(d, 2 * Math.PI - d); if (d > SNAP_ANGLE) { left++; continue; }
      const m = Math.max(1, Math.round(t[2] / STEP)), px = [], pz = []; for (let q = 1; q <= m; q++) { px.push(L.X[i] + (tx - L.X[i]) * q / m); pz.push(L.Z[i] + (tz - L.Z[i]) * q / m); }
      add.push({ li, end, px, pz }); snapped++;
    }
  });
  for (const { li, end, px, pz } of add) {
    const L = lines[li], X = Array.from(L.X), Z = Array.from(L.Z), C = Array.from(L.cls);
    if (end) { X.push(...px); Z.push(...pz); C.push(...px.map(() => 0)); } else { X.unshift(...px.reverse()); Z.unshift(...pz.reverse()); C.unshift(...px.map(() => 0)); }
    L.X = Float64Array.from(X); L.Z = Float64Array.from(Z); L.cls = Uint8Array.from(C); L.n = X.length;
  }
  return { snapped, left };
}

// bilinear ground of a raster at map metres
function ground(R, gh, x, z) {
  const fx = Math.min(R.nx - 1.001, Math.max(0, (x - R.x0) / R.g)), fz = Math.min(R.nz - 1.001, Math.max(0, (z - R.z0) / R.g)), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * R.nx + i;
  return (gh[k] * (1 - u) + gh[k + 1] * u) * (1 - v) + (gh[k + R.nx] * (1 - u) + gh[k + R.nx + 1] * u) * v;
}

// 3. the surface along a line: ground where the road is on the ground, bridged straight over bridges, tunnels and water, then smoothed and grade-limited,
// and lifted where it must stand higher (opt: V the height scale, spans the main spans of the sea bridges, nearY the surface of the lines done before)
const WHY = { osm: 1, crossing: 2, fill: 3, cut: 4, bump: 5 }, WHY_NAME = ['', 'osm', 'crossing', 'fill', 'cut', 'bump'];
const SEA_DECK = 6;   // game metres of a deck over the sea or wide water at the least (ADR-0037): bridging the shores straight left it about 3 m over the sea
function profile(L, R, gh, claimed, opt = {}) {
  const n = L.n, g = new Float64Array(n), fixed = new Uint8Array(n), floor = new Float64Array(n).fill(-Infinity), V = opt.V || 0.25;
  L.why = Uint8Array.from(L.cls, (c) => (c ? WHY.osm : 0));   // why a sample is a bridge or a tunnel, for the numbers
  let dry = 0, lift = false;
  for (let i = 0; i < n; i++) {
    const ci = Math.round((L.X[i] - R.x0) / R.g), cj = Math.round((L.Z[i] - R.z0) / R.g), inR = ci >= 0 && cj >= 0 && ci < R.nx && cj < R.nz, k = cj * R.nx + ci, wet = inR && R.water[k];
    g[i] = L.cls[i] || wet ? NaN : ground(R, gh, L.X[i], L.Z[i]); if (g[i] === g[i]) dry++;
    if (!L.cls[i] && inR && claimed[k]) fixed[i] = 1;   // a junction with a road already laid: meet its surface
    // the sea, and the inside of wide water (a stream channel is crossed on an embankment or a culvert, as layLine does)
    if (wet === 1) floor[i] = SEA_DECK; else if (wet === 2 && R.fromBank[k] > 1.5) floor[i] = R.level[k] * V + SEA_DECK;
    for (const s of opt.spans || []) if (s.ref === L.ref && s.deck > 0 && Math.hypot(L.X[i] - s.x, L.Z[i] - s.z) < s.half) floor[i] = Math.max(floor[i], s.deck);
    if (floor[i] > -Infinity) lift = true;
  }
  // a line with no ground at all (a bridge that OpenStreetMap chains apart from its road) takes its ends from the lines laid before it; it used to
  // lie on the water (0 here, y = -4 in the game)
  if (!dry && opt.nearY) { const a = opt.nearY(L.X[0], L.Z[0]), b = opt.nearY(L.X[n - 1], L.Z[n - 1]); g[0] = a ?? b ?? 0; g[n - 1] = b ?? a ?? 0; }
  // fill the gaps by straight lines between the ground on either side
  let last = -1;
  for (let i = 0; i <= n; i++) {
    if (i < n && g[i] !== g[i]) continue;
    if (i - last > 1) { const a = last >= 0 ? g[last] : i < n ? g[i] : 0, b = i < n ? g[i] : a; for (let q = last + 1; q < i; q++) g[q] = a + (b - a) * (q - last) / (i - last); }
    last = i;
  }
  let y = g;
  for (let pass = 0; pass < 2; pass++) { const o = new Float64Array(n); for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let q = Math.max(0, i - SMOOTH); q <= Math.min(n - 1, i + SMOOTH); q++) { s += y[q]; c++; } o[i] = s / c; } y = o; }
  // a crossing more than 4 m off the smooth line is a grade separation OpenStreetMap left untagged: pass over it (bridge) or under it (underpass)
  for (let i = 1; i < n - 1; i++) if (fixed[i] && Math.abs(g[i] - y[i]) > 4) { fixed[i] = 0; L.cls[i] = y[i] > g[i] ? 1 : 2; L.why[i] = WHY.crossing; }
  fixed[0] = fixed[n - 1] = 1;   // the ends meet what is there (a road already laid, or the ground)
  // the grade limit over each segment's own length (relaxing a bend draws its points closer than STEP); the fixed points are put back after each
  // round, so the limit bends the road towards them instead of moving them
  const gr = CLASS[L.hw].grade, seg = (i) => Math.hypot(L.X[i + 1] - L.X[i], L.Z[i + 1] - L.Z[i]);
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < n; i++) if (fixed[i]) y[i] = g[i];
    for (let i = 1; i < n; i++) { const dh = gr * seg(i - 1); y[i] = Math.max(y[i - 1] - dh, Math.min(y[i - 1] + dh, y[i])); }
    for (let i = n - 2; i >= 0; i--) { const dh = gr * seg(i); y[i] = Math.max(y[i + 1] - dh, Math.min(y[i + 1] + dh, y[i])); }
  }
  // up to the floor: the floors' envelope falling away at the class grade both ways, so the ramps onto a sea bridge keep the grade
  if (lift) {
    const e = Float64Array.from(floor);
    for (let i = 1; i < n; i++) e[i] = Math.max(e[i], e[i - 1] - gr * seg(i - 1));
    for (let i = n - 2; i >= 0; i--) e[i] = Math.max(e[i], e[i + 1] - gr * seg(i));
    for (let i = 0; i < n; i++) if (e[i] > y[i]) y[i] = e[i];
  }
  // where the surface leaves the ground by much, the road is a viaduct (fill over 8 m) or a tunnel (cut over 15 m) and leaves the ground alone
  const raw = new Float64Array(n); for (let i = 0; i < n; i++) raw[i] = ground(R, gh, L.X[i], L.Z[i]);
  for (let i = 0; i < n; i++) if (!L.cls[i]) { if (y[i] - raw[i] > 8) { L.cls[i] = 1; L.why[i] = WHY.fill; } else if (raw[i] - y[i] > 15) { L.cls[i] = 2; L.why[i] = WHY.cut; } }
  L.Y = y; L.G = raw;
}

// 4. one line laid into gh: the cells within reach of its segments, pulled towards its surface; its flat surface becomes final (claimed), so the lines
// laid after it (lower classes, and later lines of the same class) lay in around it and meet its height
function layLine(R, gh, L, claimed) {
  const half = halfOf(L), flat = Math.max(half + 1, R.g * 1.05), reach = flat + FADE, best = new Map();   // at least one cell flat each side
  // bridges and tunnels leave the ground alone, but for the few points at each end (abutments, portals) where the road meets it
  const lay = new Uint8Array(L.n); for (let i = 0; i < L.n; i++) if (!L.cls[i]) for (let q = Math.max(0, i - 3); q <= Math.min(L.n - 1, i + 3); q++) lay[q] = 1;
  for (let s = 0; s + 1 < L.n; s++) {
    if (!lay[s] || !lay[s + 1]) continue;
    const ax = L.X[s], az = L.Z[s], dx = L.X[s + 1] - ax, dz = L.Z[s + 1] - az, l2 = dx * dx + dz * dz || 1;
    const i0 = Math.max(0, Math.floor((Math.min(ax, ax + dx) - reach - R.x0) / R.g)), i1 = Math.min(R.nx - 1, Math.ceil((Math.max(ax, ax + dx) + reach - R.x0) / R.g));
    const j0 = Math.max(0, Math.floor((Math.min(az, az + dz) - reach - R.z0) / R.g)), j1 = Math.min(R.nz - 1, Math.ceil((Math.max(az, az + dz) + reach - R.z0) / R.g));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * R.nx + i; if (claimed[k]) continue;
      // the sea and the inside of wide water stay; a bank cell or a stream channel can carry an embankment road or a culvert
      if (R.water[k] === 1 || (R.water[k] === 2 && R.fromBank[k] > 1.5)) continue;
      const px = R.x0 + i * R.g, pz = R.z0 + j * R.g, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2)), d = Math.hypot(px - ax - dx * t, pz - az - dz * t);
      if (d >= reach) continue;
      const b = best.get(k); if (b && b[0] <= d) continue;
      best.set(k, [d, L.Y[s] + (L.Y[s + 1] - L.Y[s]) * t]);
    }
  }
  for (const [k, [d, y]] of best) {
    const w = 1 - sstep(flat, reach, d); gh[k] += (y - gh[k]) * w;
    if (w >= 0.999) { claimed[k] = 1; if (R.water[k] === 2) R.water[k] = 0; }
  }
}

// 5. clearance: where two lines cross, the one above must clear the one below by CLEAR (a vehicle and its deck). A structure (bridge) goes up and a tunnel
// down; a motorway never crosses on the level, so the lower class goes over it. Same-class crossings on the ground stay junctions (ADR-0023). Each
// move is a raised cosine along the line, long enough to keep the class's grade, and runs a few rounds because a move can break a neighbouring crossing.
const CLEAR = 6.5, MIN_ANGLE = 20 * Math.PI / 180;
function crossings(lines) {
  const CS = 64, grid = new Map(), K = (a, b) => a * 100003 + b;
  lines.forEach((L, li) => { for (let i = 0; i + 1 < L.n; i++) {
    for (let a = Math.floor(Math.min(L.X[i], L.X[i + 1]) / CS); a <= Math.floor(Math.max(L.X[i], L.X[i + 1]) / CS); a++)
      for (let b = Math.floor(Math.min(L.Z[i], L.Z[i + 1]) / CS); b <= Math.floor(Math.max(L.Z[i], L.Z[i + 1]) / CS); b++) { const k = K(a, b); let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(li, i); }
  } });
  const seen = new Set(), out = [];
  for (const l of grid.values()) for (let u = 0; u < l.length; u += 2) for (let v = u + 2; v < l.length; v += 2) {
    const A = l[u], a = l[u + 1], B = l[v], b = l[v + 1]; if (A === B) continue;
    const key = A < B ? `${A}:${a}:${B}:${b}` : `${B}:${b}:${A}:${a}`; if (seen.has(key)) continue; seen.add(key);
    const P = lines[A], Q = lines[B];
    const ax = P.X[a], az = P.Z[a], bx = P.X[a + 1], bz = P.Z[a + 1], cx = Q.X[b], cz = Q.Z[b], dx = Q.X[b + 1], dz = Q.Z[b + 1];
    const o = (px, pz, qx, qz, rx, rz) => (qx - px) * (rz - pz) - (qz - pz) * (rx - px), d1 = o(ax, az, bx, bz, cx, cz), d2 = o(ax, az, bx, bz, dx, dz), d3 = o(cx, cz, dx, dz, ax, az), d4 = o(cx, cz, dx, dz, bx, bz);
    if (!(d1 * d2 < 0 && d3 * d4 < 0)) continue;
    let ang = Math.abs(Math.atan2(bz - az, bx - ax) - Math.atan2(dz - cz, dx - cx)) % Math.PI; ang = Math.min(ang, Math.PI - ang); if (ang < MIN_ANGLE) continue;
    const t = d3 / (d3 - d4), t2 = d1 / (d1 - d2);
    out.push({ A, a, ta: t, B, b, tb: t2, ya: P.Y[a] + (P.Y[a + 1] - P.Y[a]) * t, yb: Q.Y[b] + (Q.Y[b + 1] - Q.Y[b]) * t2 });
  }
  return out;
}
function bump(L, i, h) {
  // h > 0 raises, h < 0 lowers. The offsets of all moves on a line are kept apart from its profile and combined by taking the largest (a sum of two humps
  // doubles the grade; the largest keeps each hump's own). The foot, measured along the line (relaxing a bend packs points), takes most of the grade the
  // profile leaves free there (at least a quarter of the class grade): a quarter everywhere made each move on a motorway 1.4 km long (ADR-0037)
  if (!L.Y0) { L.Y0 = Float64Array.from(L.Y); L.H = new Float64Array(L.n); L.at = [0]; for (let q = 1; q < L.n; q++) L.at.push(L.at[q - 1] + Math.hypot(L.X[q] - L.X[q - 1], L.Z[q] - L.Z[q - 1])); }
  const T = L.H[i] + h, gr = CLASS[L.hw].grade, top = 14, reach = Math.abs(T) * Math.PI / (2 * gr * 0.25) + top;
  let used = 0; for (let q = 0; q + 1 < L.n; q++) if (Math.abs(L.at[q] - L.at[i]) < reach) { const s = L.at[q + 1] - L.at[q]; if (s > 0.5) used = Math.max(used, Math.abs(L.Y0[q + 1] - L.Y0[q]) / s); }
  const foot = Math.abs(T) * Math.PI / (2 * Math.max(gr * 0.25, gr * 0.9 - used));
  for (let q = 0; q < L.n; q++) {
    const e = Math.max(0, Math.abs(L.at[q] - L.at[i]) - top); if (e >= foot) continue;
    const o = T * 0.5 * (1 + Math.cos(Math.PI * e / foot));
    if (T > 0 ? o > L.H[q] : o < L.H[q]) L.H[q] = o;
    L.Y[q] = L.Y0[q] + L.H[q];
    if (L.H[q] > 1.5 && !L.cls[q]) { L.cls[q] = 1; L.why[q] = WHY.bump; } else if (L.H[q] < -1.5 && !L.cls[q]) { L.cls[q] = 2; L.why[q] = WHY.bump; }
  }
}
// the two carriageways of a motorway (one-way lines of one number side by side, decks touching) stand at one height: laid and moved each on its
// own, the lower one's deck edge was a step of 2 m a car at speed drove into (region-drive), 9 m apart on 인천대교 (ADR-0037). Once, after the
// crossings, the lower one goes up to the other, but only where that keeps the clearance under every road over it (and a tunnel is left as it is):
// levelled in the crossing rounds, a carriageway lifted to its partner was lifted again at the next crossing and the decks climbed past 100 m
const PCS = 48, PK = (a, b) => a * 100003 + b, two = (L) => L.ref && L.oneway && L.hw === 'motorway';   // motorways only: the carriageways of a trunk or primary road meet streets at grade, and a lifted one left its junctions
function levelPairs(lines) {
  const grid = new Map(), over = lines.map(() => []), pk = (a, b) => (a < b ? a + '|' + b : b + '|' + a), crossed = new Set(), idx = new Map(lines.map((L, k) => [L, k]));
  lines.forEach((L, li) => { if (two(L)) for (let i = 0; i < L.n; i++) { const k = PK(Math.floor(L.X[i] / PCS), Math.floor(L.Z[i] / PCS)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(li, i); } });
  // the crossings of each line (the other road's height there), and the carriageways of one road that cross each other (where they swap sides: not partners)
  for (const c of crossings(lines)) {
    over[c.A].push({ i: c.a, y: c.yb }); over[c.B].push({ i: c.b, y: c.ya });
    if (lines[c.A].ref && lines[c.A].hw === lines[c.B].hw && lines[c.A].ref === lines[c.B].ref) crossed.add(pk(c.A, c.B));
  }
  let moves = 0, held = 0;
  for (let sweep = 0; sweep < 2; sweep++) lines.forEach((L, li) => {
    if (!two(L)) return; const hl = halfOf(L);
    for (let i = 1; i + 1 < L.n; i++) {
      if (L.cls[i] === 2) continue;
      const tx = L.X[i + 1] - L.X[i - 1], tz = L.Z[i + 1] - L.Z[i - 1], tl = Math.hypot(tx, tz) || 1, a = Math.floor(L.X[i] / PCS), b = Math.floor(L.Z[i] / PCS);
      let up = 0;
      for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
        const cell = grid.get(PK(a + da, b + db)); if (!cell) continue;
        for (let k = 0; k < cell.length; k += 2) {
          const M = lines[cell[k]], j = cell[k + 1]; if (M === L || M.hw !== L.hw || M.ref !== L.ref || M.cls[j] === 2 || M.Y[j] - L.Y[i] <= up || crossed.has(pk(li, cell[k]))) continue;
          if (Math.hypot(M.X[j] - L.X[i], M.Z[j] - L.Z[i]) > hl + halfOf(M) + 1) continue;
          const mx = M.X[Math.min(M.n - 1, j + 1)] - M.X[Math.max(0, j - 1)], mz = M.Z[Math.min(M.n - 1, j + 1)] - M.Z[Math.max(0, j - 1)];
          if (Math.abs(mx * tx + mz * tz) < 0.8 * tl * (Math.hypot(mx, mz) || 1)) continue;   // side by side, not a crossing
          up = M.Y[j] - L.Y[i];
        }
      }
      if (up <= 0.3) continue;
      // tried, and undone where it cuts the clearance under a road over the line or lifts the line off a road it meets at grade (bump keeps the
      // largest offset, so it can lift a sample by more than up)
      const keep = { Y: Array.from(L.Y), H: L.H ? Array.from(L.H) : null, cls: Array.from(L.cls), why: Array.from(L.why) }, worse = (q) => q < L.n && L.Y[q] > keep.Y[q] + 0.01;
      bump(L, i, up);
      // a crossing short of the clearance that the raise made shorter, or a junction (a ramp joining) it broke
      const hurt = (o, q) => q < L.n && worse(q) && Math.abs(o.y - L.Y[q]) < CLEAR;
      if (over[li].some((o) => hurt(o, o.i) || hurt(o, o.i + 1))) {
        for (let q = 0; q < L.n; q++) { L.Y[q] = keep.Y[q]; L.H[q] = keep.H ? keep.H[q] : 0; L.cls[q] = keep.cls[q]; L.why[q] = keep.why[q]; }
        held++; continue;
      }
      moves++;
    }
  });
  return { moves, held };
}
function clearancePass(lines) {
  const st = { rounds: 0, moved: 0, maxRaise: 0, junctionsLeft: 0, before: null, after: null };
  // who goes over is decided once for each pair of roads in a 1.5 km tile (a road: the lines of one number and class, both carriageways together) and
  // kept, and a decision that would close a loop (A over B over C over A) is turned round. Decided anew at each crossing and round, a motorway that
  // is a bridge over a street went up over it while the street went over the motorway's ramp and the ramp over the motorway, and each round one of
  // them went up a level: decks stood 25-35 m over the ground (ADR-0037)
  const TILE = 1500, road = (k) => (lines[k].ref ? lines[k].hw + ':' + lines[k].ref : '#' + k), decided = new Map(), above = new Map();
  const node = (k, c) => road(k) + '@' + Math.floor(lines[c.A].X[c.a] / TILE) + ',' + Math.floor(lines[c.A].Z[c.a] / TILE);
  const reaches = (a, b) => { const seen = new Set([a]), todo = [a]; while (todo.length) { const u = todo.pop(); if (u === b) return true; for (const v of above.get(u) || []) if (!seen.has(v)) { seen.add(v); todo.push(v); } } return false; };
  for (let round = 0; round < 12; round++) {
    const X = crossings(lines); let bad = 0, junc = 0;
    const need = [];
    for (const c of X) {
      const P = lines[c.A], Q = lines[c.B], sa = P.cls[c.a] || P.cls[c.a + 1], sb = Q.cls[c.b] || Q.cls[c.b + 1], dy = Math.abs(c.ya - c.yb);
      if (dy >= CLEAR) continue;
      const mw = P.hw === 'motorway' || Q.hw === 'motorway';
      if (!sa && !sb && !mw) { junc++; continue; }   // a junction on the ground
      bad++; need.push({ c, P, Q, sa, sb, mw, dy });
    }
    if (round === 0) st.before = { crossings: X.length, deficient: bad, junctions: junc };
    st.junctionsLeft = junc; st.after = { crossings: X.length, deficient: bad, junctions: junc };
    if (!bad) break; st.rounds = round + 1;
    need.sort((p, q) => p.dy - q.dy);
    const moved = new Map();
    for (const { c, P, Q, sa, sb, mw } of need) {
      // who moves: the line with a bridge goes up, a tunnel goes down; on the ground the lower class (or the shorter line) goes over the motorway
      let mover, other, ym, yo, dir;
      if (sa === 2 || sb === 2) { const aTun = sa === 2; mover = aTun ? c.A : c.B; other = aTun ? c.B : c.A; dir = -1; }
      else if (sa === 1 || sb === 1) { const aBr = sa === 1 && (sb !== 1 || c.ya >= c.yb); mover = aBr ? c.A : c.B; other = aBr ? c.B : c.A; dir = 1; }
      else { const aLow = CLASS[P.hw].order > CLASS[Q.hw].order || (P.hw === Q.hw && P.n <= Q.n); mover = aLow ? c.A : c.B; other = aLow ? c.B : c.A; dir = 1; }
      // what is kept is which road is on top; at each crossing the top one goes up, or the one below goes down where it is a tunnel there (a bridge
      // is never lowered: kept as a move, a decision lowered bridges into the ground)
      const na = node(c.A, c), nb = node(c.B, c), key = na < nb ? na + '|' + nb : nb + '|' + na;
      if (na !== nb) {
        let upper = decided.get(key);
        if (!upper) {
          upper = node(dir > 0 ? mover : other, c); const lower = upper === na ? nb : na;
          if (reaches(lower, upper)) upper = lower;   // the other way round closes no loop
          if (!above.has(upper)) above.set(upper, new Set()); above.get(upper).add(upper === na ? nb : na); decided.set(key, upper);
        }
        const U = upper === na ? c.A : c.B, D = U === c.A ? c.B : c.A, dTun = (D === c.A ? sa : sb) === 2;
        if (dTun) { mover = D; other = U; dir = -1; } else { mover = U; other = D; dir = 1; }
      }
      const mi = mover === c.A ? c.a : c.b, mt = mover === c.A ? c.ta : c.tb; ym = mover === c.A ? c.ya : c.yb; yo = mover === c.A ? c.yb : c.ya;
      const L0 = lines[mover], dist = (q) => Math.hypot(L0.X[q] - L0.X[mi], L0.Z[q] - L0.Z[mi]); if ((moved.get(mover) || []).some((q) => dist(q) < 160)) continue; if (!moved.has(mover)) moved.set(mover, []); moved.get(mover).push(mi);   // one move per stretch and round: two on top of each other would double the grade
      const want = dir > 0 ? yo + CLEAR + 0.5 : yo - CLEAR - 0.5, h = want - ym;
      if (dir > 0 ? h <= 0 : h >= 0) continue;
      bump(lines[mover], mt > 0.5 ? mi + 1 : mi, h); st.moved++; st.maxRaise = Math.max(st.maxRaise, Math.abs(h));
      void other; void mw;
    }
  }
  // the deficient crossings left after the last round's moves (st.after counts them before), and after the levelling
  const deficient = () => { let bad = 0; for (const c of crossings(lines)) { const P = lines[c.A], Q = lines[c.B], sa = P.cls[c.a] || P.cls[c.a + 1], sb = Q.cls[c.b] || Q.cls[c.b + 1]; if (Math.abs(c.ya - c.yb) < CLEAR && (sa || sb || P.hw === 'motorway' || Q.hw === 'motorway')) bad++; } return bad; };
  st.afterRounds = deficient(); st.paired = levelPairs(lines); st.afterPairs = deficient();
  return st;
}

// the whole pass: returns the generalized lines (with profiles) and their numbers; gh is changed in place
export function roadPass(R, gh, els, sites = [], opt = {}) {
  const lines = chains(els, sites).map(generalize).filter((L) => L.n >= 3).sort((a, b) => CLASS[a.hw].order - CLASS[b.hw].order);
  // highest class first, longest line first within a class: each line reads the ground the earlier ones left, then is laid
  const snap = snapEnds(lines);
  const claimed = new Uint8Array(R.nx * R.nz);
  lines.sort((a, b) => CLASS[a.hw].order - CLASS[b.hw].order || b.n - a.n);
  // the surface of the lines done so far nearest a point (within SNAP), for a line with no ground of its own
  const done = [], nearY = (x, z) => { let best = null, bd = SNAP; for (const D of done) for (let q = 0; q < D.n; q++) { const d = Math.hypot(D.X[q] - x, D.Z[q] - z); if (d < bd) { bd = d; best = D.Y[q]; } } return best; };
  for (const L of lines) { profile(L, R, gh, claimed, { ...opt, nearY }); done.push(L); if (CLASS[L.hw].lay !== false) layLine(R, gh, L, claimed); }
  const clearance = clearancePass(lines);
  // last, one rule for every road: the ground under a carriageway is never above its surface (it is only lowered), measured against the surface at
  // the nearest point of the line. Only the carriageway's own width: a cell-wide reach also pushed the ground down under the roads beside it
  for (const L of lines) {
    if (CLASS[L.hw].lay === false) continue;
    const r = halfOf(L) + 1;   // the carriageway itself: a wider reach pushes the ground down under the roads beside it
    for (let s = 0; s + 1 < L.n; s++) {
      if (L.cls[s] || L.cls[s + 1]) continue;
      const ax = L.X[s], az = L.Z[s], dx = L.X[s + 1] - ax, dz = L.Z[s + 1] - az, l2 = dx * dx + dz * dz || 1;
      for (let j = Math.max(0, Math.floor((Math.min(az, az + dz) - r - R.z0) / R.g)); j <= Math.min(R.nz - 1, Math.ceil((Math.max(az, az + dz) + r - R.z0) / R.g)); j++)
        for (let i = Math.max(0, Math.floor((Math.min(ax, ax + dx) - r - R.x0) / R.g)); i <= Math.min(R.nx - 1, Math.ceil((Math.max(ax, ax + dx) + r - R.x0) / R.g)); i++) {
          const k = j * R.nx + i; if (R.water[k] === 1) continue;
          const px = R.x0 + i * R.g, pz = R.z0 + j * R.g, t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
          if (Math.hypot(px - ax - dx * t, pz - az - dz * t) > r) continue;
          const y = L.Y[s] + (L.Y[s + 1] - L.Y[s]) * t - 0.05; if (gh[k] > y) gh[k] = y;
        }
    }
  }
  // numbers per class: length, generalization, grades on the ground, structures, the ground left under the road after laying
  const stats = {};
  for (const hw of Object.keys(CLASS)) {
    const ls = lines.filter((L) => L.hw === hw); if (!ls.length) continue;
    let km = 0, onGround = 0, bridge = 0, tunnel = 0, gradeMax = 0, tightLeft = 0, shiftMax = 0, poke = 0, floating = 0; const grades = [], gaps = [], why = {};
    for (const L of ls) {
      shiftMax = Math.max(shiftMax, L.shift); if (L.rminSeen < CLASS[hw].rmin * 0.95) tightLeft++;
      for (let i = 0; i + 1 < L.n; i++) {
        const seg = Math.hypot(L.X[i + 1] - L.X[i], L.Z[i + 1] - L.Z[i]); km += seg; if (seg < 0.5) continue;   // the last point can sit on top of the one before
        if (L.cls[i]) { const w = (L.cls[i] === 1 ? 'bridge:' : 'tunnel:') + WHY_NAME[L.why[i]]; why[w] = (why[w] || 0) + seg; }
        if (L.cls[i] === 1) bridge += seg; else if (L.cls[i] === 2) tunnel += seg;
        else { onGround += seg; const gr = Math.abs(L.Y[i + 1] - L.Y[i]) / (seg || 1); grades.push(gr); gradeMax = Math.max(gradeMax, gr); const sg = ground(R, gh, L.X[i], L.Z[i]) - L.Y[i]; gaps.push(Math.abs(sg)); if (sg > 0.3) poke++; if (sg < -2) floating++; }
      }
    }
    grades.sort((a, b) => a - b); gaps.sort((a, b) => a - b);
    const q = (a, p) => a[Math.floor(p * (a.length - 1))] || 0;
    stats[hw] = { lines: ls.length, kmReal: Math.round(km * KOREA_SCALE / 1000), bridgePct: +(bridge / km * 100).toFixed(1), tunnelPct: +(tunnel / km * 100).toFixed(1), gradeP99: +q(grades, 0.99).toFixed(3), gradeMax: +gradeMax.toFixed(3),
      groundGapP99m: +q(gaps, 0.99).toFixed(2), within05m: +(gaps.filter((v) => v <= 0.5).length / (gaps.length || 1) * 100).toFixed(2), groundAbove03Pct: +(poke / (gaps.length || 1) * 100).toFixed(2), floatingOver2mPct: +(floating / (gaps.length || 1) * 100).toFixed(2), linesStillTight: tightLeft, shiftMaxRealM: Math.round(shiftMax * 6.5),
      whyPct: Object.fromEntries(Object.entries(why).map(([k, v]) => [k, +(v / km * 100).toFixed(1)])) };
  }
  // per motorway number: the bridge share against OpenStreetMap's own, and the deck's height over the ground on the bridges the profile made
  const refs = {};
  for (const L of lines) {
    if (L.hw !== 'motorway' || !L.ref) continue; const r = refs[L.ref] || (refs[L.ref] = { km: 0, bridge: 0, osm: 0, gaps: [] });
    for (let i = 0; i + 1 < L.n; i++) { const seg = Math.hypot(L.X[i + 1] - L.X[i], L.Z[i + 1] - L.Z[i]); r.km += seg; if (L.cls[i] !== 1) continue; r.bridge += seg; if (L.why[i] === WHY.osm) r.osm += seg; else if (!(R.water[Math.round((L.Z[i] - R.z0) / R.g) * R.nx + Math.round((L.X[i] - R.x0) / R.g)])) r.gaps.push(L.Y[i] - ground(R, gh, L.X[i], L.Z[i])); }
  }
  stats.motorwayRefs = Object.fromEntries(Object.entries(refs).filter(([, r]) => r.km > 2000).map(([k, r]) => { r.gaps.sort((a, b) => a - b); return [k, { kmReal: Math.round(r.km * KOREA_SCALE / 1000), bridgePct: +(r.bridge / r.km * 100).toFixed(1), osmPct: +(r.osm / r.km * 100).toFixed(1), madeGapMedian: +(r.gaps[r.gaps.length >> 1] || 0).toFixed(1) }]; }));
  stats.clearance = clearance; stats.snap = snap;
  return { lines, stats };
}
