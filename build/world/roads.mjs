// The road pass of the world compiler (ADR-0019, KOREA-PLAN v2 M3a): the real arterial roads, generalized to 1:1 design rules at 1:6.5 and laid into
// the ground in one pass. Each carriageway is a line of its own: at 1:6.5 the two sides of a dual road lie a few metres apart and their corridors merge.
//   1. chain the OpenStreetMap pieces (split at every bridge and junction) into long lines per class and name
//   2. generalize: resample every STEP, then relax the stretches tighter than the class's minimum radius (the ends stay put)
//   3. profile: the ground under the line (bridges and tunnels left out and bridged straight), smoothed, grade-limited both ways
//   4. lay in: line by line, highest class and longest first; each line reads the ground the earlier ones left, meets their surface where it touches
//      them, and its own flat surface becomes final for the lines after it
import { project } from '../../src/koreamap.js';

const STEP = 8;   // map metres between line points
// per class: minimum radius and maximum grade (1:1 design rules, game metres), half width of one carriageway, priority (lower lays first)
export const CLASS = {
  motorway: { rmin: 154, grade: 0.06, half: 7, order: 0 },
  trunk: { rmin: 60, grade: 0.08, half: 6, order: 1 },
  primary: { rmin: 60, grade: 0.08, half: 5, order: 2 },
  secondary: { rmin: 30, grade: 0.1, half: 4, order: 3 },
};
const FADE = 30, SMOOTH = 12;   // metres from the flat edge back to the ground; samples each side in the profile mean
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// 1. long lines: pieces of the same class and name (or ref) joined where one ends and the next begins, in the direction of travel
function chains(els) {
  const key = (p) => `${Math.round(p.lon * 1e6)},${Math.round(p.lat * 1e6)}`, groups = new Map();
  for (const e of els) {
    const t = e.tags || {}; if (!CLASS[t.highway] || !e.geometry || e.geometry.length < 2) continue;
    const g = t.highway + '|' + (t.ref || t.name || e.id); if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push({ pts: e.geometry, bridge: !!t.bridge && t.bridge !== 'no', tunnel: !!t.tunnel && t.tunnel !== 'no', oneway: t.oneway === 'yes', hw: t.highway, used: false });
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
      if (line.length >= 2) out.push({ hw: w0.hw, pts: line });
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
  let rminSeen = Infinity; for (let i = k; i < n - k; i++) rminSeen = Math.min(rminSeen, radius(i));
  return { hw: c.hw, X: x, Z: z, cls: Uint8Array.from(C), shift, tight, rminSeen, n };
}

// bilinear ground of a raster at map metres
function ground(R, gh, x, z) {
  const fx = Math.min(R.nx - 1.001, Math.max(0, (x - R.x0) / R.g)), fz = Math.min(R.nz - 1.001, Math.max(0, (z - R.z0) / R.g)), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, k = j * R.nx + i;
  return (gh[k] * (1 - u) + gh[k + 1] * u) * (1 - v) + (gh[k + R.nx] * (1 - u) + gh[k + R.nx + 1] * u) * v;
}

// 3. the surface along a line: ground where the road is on the ground, bridged straight over bridges, tunnels and water, then smoothed and grade-limited
function profile(L, R, gh, claimed) {
  const n = L.n, g = new Float64Array(n), fixed = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const ci = Math.round((L.X[i] - R.x0) / R.g), cj = Math.round((L.Z[i] - R.z0) / R.g), wet = ci >= 0 && cj >= 0 && ci < R.nx && cj < R.nz && R.water[cj * R.nx + ci];
    g[i] = L.cls[i] || wet ? NaN : ground(R, gh, L.X[i], L.Z[i]);
    if (!L.cls[i] && ci >= 0 && cj >= 0 && ci < R.nx && cj < R.nz && claimed[cj * R.nx + ci]) fixed[i] = 1;   // a junction with a road already laid: meet its surface
  }
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
  for (let i = 1; i < n - 1; i++) if (fixed[i] && Math.abs(g[i] - y[i]) > 4) { fixed[i] = 0; L.cls[i] = y[i] > g[i] ? 1 : 2; }
  fixed[0] = fixed[n - 1] = 1;   // the ends meet what is there (a road already laid, or the ground)
  // the grade limit over each segment's own length (relaxing a bend draws its points closer than STEP); the fixed points are put back after each
  // round, so the limit bends the road towards them instead of moving them
  const gr = CLASS[L.hw].grade, seg = (i) => Math.hypot(L.X[i + 1] - L.X[i], L.Z[i + 1] - L.Z[i]);
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < n; i++) if (fixed[i]) y[i] = g[i];
    for (let i = 1; i < n; i++) { const dh = gr * seg(i - 1); y[i] = Math.max(y[i - 1] - dh, Math.min(y[i - 1] + dh, y[i])); }
    for (let i = n - 2; i >= 0; i--) { const dh = gr * seg(i); y[i] = Math.max(y[i + 1] - dh, Math.min(y[i + 1] + dh, y[i])); }
  }
  // where the surface leaves the ground by much, the road is a viaduct (fill over 8 m) or a tunnel (cut over 15 m) and leaves the ground alone
  const raw = new Float64Array(n); for (let i = 0; i < n; i++) raw[i] = ground(R, gh, L.X[i], L.Z[i]);
  for (let i = 0; i < n; i++) if (!L.cls[i]) { if (y[i] - raw[i] > 8) L.cls[i] = 1; else if (raw[i] - y[i] > 15) L.cls[i] = 2; }
  L.Y = y; L.G = raw;
}

// 4. one line laid into gh: the cells within reach of its segments, pulled towards its surface; its flat surface becomes final (claimed), so the lines
// laid after it (lower classes, and later lines of the same class) lay in around it and meet its height
function layLine(R, gh, L, claimed) {
  const half = CLASS[L.hw].half, flat = Math.max(half + 1, R.g * 1.05), reach = flat + FADE, best = new Map();   // at least one cell flat each side
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

// the whole pass: returns the generalized lines (with profiles) and their numbers; gh is changed in place
export function roadPass(R, gh, els) {
  const lines = chains(els).map(generalize).filter((L) => L.n >= 3).sort((a, b) => CLASS[a.hw].order - CLASS[b.hw].order);
  // highest class first, longest line first within a class: each line reads the ground the earlier ones left, then is laid
  const claimed = new Uint8Array(R.nx * R.nz);
  lines.sort((a, b) => CLASS[a.hw].order - CLASS[b.hw].order || b.n - a.n);
  for (const L of lines) { profile(L, R, gh, claimed); layLine(R, gh, L, claimed); }
  // last, one rule for every road: the ground under a carriageway is never above its surface (it is only lowered), measured against the surface at
  // the nearest point of the line. Only the carriageway's own width: a cell-wide reach also pushed the ground down under the roads beside it
  for (const L of lines) {
    const r = CLASS[L.hw].half + 1;   // the carriageway itself: a wider reach pushes the ground down under the roads beside it
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
    let km = 0, onGround = 0, bridge = 0, tunnel = 0, gradeMax = 0, tightLeft = 0, shiftMax = 0, poke = 0, floating = 0; const grades = [], gaps = [];
    for (const L of ls) {
      shiftMax = Math.max(shiftMax, L.shift); if (L.rminSeen < CLASS[hw].rmin * 0.95) tightLeft++;
      for (let i = 0; i + 1 < L.n; i++) {
        const seg = Math.hypot(L.X[i + 1] - L.X[i], L.Z[i + 1] - L.Z[i]); km += seg; if (seg < 0.5) continue;   // the last point can sit on top of the one before
        if (L.cls[i] === 1) bridge += seg; else if (L.cls[i] === 2) tunnel += seg;
        else { onGround += seg; const gr = Math.abs(L.Y[i + 1] - L.Y[i]) / (seg || 1); grades.push(gr); gradeMax = Math.max(gradeMax, gr); const sg = ground(R, gh, L.X[i], L.Z[i]) - L.Y[i]; gaps.push(Math.abs(sg)); if (sg > 0.3) poke++; if (sg < -2) floating++; }
      }
    }
    grades.sort((a, b) => a - b); gaps.sort((a, b) => a - b);
    const q = (a, p) => a[Math.floor(p * (a.length - 1))] || 0;
    stats[hw] = { lines: ls.length, kmReal: Math.round(km * 6.5 / 1000), bridgePct: +(bridge / km * 100).toFixed(1), tunnelPct: +(tunnel / km * 100).toFixed(1), gradeP99: +q(grades, 0.99).toFixed(3), gradeMax: +gradeMax.toFixed(3),
      groundGapP99m: +q(gaps, 0.99).toFixed(2), within05m: +(gaps.filter((v) => v <= 0.5).length / (gaps.length || 1) * 100).toFixed(2), groundAbove03Pct: +(poke / (gaps.length || 1) * 100).toFixed(2), floatingOver2mPct: +(floating / (gaps.length || 1) * 100).toFixed(2), linesStillTight: tightLeft, shiftMaxRealM: Math.round(shiftMax * 6.5) };
  }
  return { lines, stats };
}
