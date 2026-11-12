// The street data of the capital region (WLD-24g-1, build/world/streets.mjs) and the corner maths it shares with the renderer (src/streetgeo.js):
// the same input gives the same bytes, pavement never lies in a tunnel or in the water, every junction has its arms in order, the trims are sane,
// the kerb arc touches both edges, and a stored tile reads back as it was written. Works on a cropped copy of the region (Gangnam, 9 x 9 km); skips with a note
// when the region was never compiled.
import path from 'node:path';
import { project, CAPITAL } from '../../src/koreamap.js';
import { readRegion } from '../../build/world/emit.mjs';
import { makeBuildings, toTiles as bldTiles } from '../../build/world/blocks.mjs';
import { makeStreets, toTiles, readTile, flyovers, RANK, TURN } from '../../build/world/streets.mjs';
import { readTile as readBld } from '../../build/world/blocks.mjs';
import { SPECIES, TREE_MIN_WALK } from '../../build/world/streetfurn.mjs';
import { corner, trims, radiusOf, signalGroups, signalState } from '../../src/streetgeo.js';

const file = path.join(path.dirname(new URL(import.meta.url).pathname), '../../build/baked/world/capital/region.bin');
const R0 = readRegion(file), bad = [], m = {};
const near = (a, b, e) => Math.abs(a - b) <= e;
// ---- the corner maths on a plain crossroads: edges at +-6 m, pavement 3 m, kerb radius 5 m
{
  const arms = [0, 1, 2, 3].map((k) => ({ ang: k * Math.PI / 2, half: 6, w: 3 })), R = 5, T = trims(arms, R);
  if (T.corners.length !== 4) bad.push(['a crossroads has four corners', T.corners.length]);
  for (const { c } of T.corners) {
    if (!c.arc) { bad.push(['no arc on a right-angle corner']); continue; }
    // the arc touches both edges: every point is R from the centre C, the end points lie on the edges (6 m from the arm axes)
    for (const p of c.arcPts) if (!near(Math.hypot(p[0] - c.C[0], p[1] - c.C[1]), R, 1e-6)) bad.push(['arc point off the circle']);
    for (const p of [c.arcPts[0], c.arcPts[c.arcPts.length - 1]]) { const a = [Math.abs(p[0]), Math.abs(p[1])].sort((u, v) => u - v); if (!near(a[0], 6, 1e-6) || !near(a[1], 11, 1e-6)) bad.push(['arc end not on the edge, half + R from the centre', p]); }
    if (!near(c.sa, 11, 1e-6)) bad.push(['trim of a 90 degree corner = half + R', c.sa]);
  }
  // a kerb radius never needs more than the narrowest pavement can follow
  const wide = [{ ang: 0, half: 9.9, w: 1.8 }, { ang: Math.PI / 2, half: 9.9, w: 1.8 }, { ang: Math.PI, half: 9.9, w: 1.8 }];
  if (radiusOf(wide) > 1.8 * 3.3 + 1e-9) bad.push(['radius exceeds what the pavement follows', radiusOf(wide)]);
  // an arm without pavement: the corner stays sharp
  if (corner({ ang: 0, half: 6, w: 0 }, { ang: Math.PI / 2, half: 6, w: 3 }, 5).arc) bad.push(['a corner next to an unpaved arm is rounded']);
  // signals: the two groups never show green together, each cycle has all-red gaps
  let both = 0, reds = 0; for (let t = 0; t < 82; t += 0.5) { const a = signalState(0, t), b = signalState(1, t); if (a === 2 && b === 2) both++; if (a === 0 && b === 0) reds++; }
  if (both) bad.push(['both groups green', both]); if (!reds) bad.push(['no all-red interval']);
  const g = signalGroups(arms); if (!(g[0] === g[2] && g[1] === g[3] && g[0] !== g[1])) bad.push(['signal groups of a crossroads', g]);
}
if (!R0) {
  console.log('RESULT ' + JSON.stringify({ test: 'streets', pass: bad.length === 0, metrics: m, note: 'no compiled region (node build/world/compile.mjs --roads --emit); only the maths was checked' + (bad.length ? ' ' + JSON.stringify(bad) : '') }));
  process.exitCode = bad.length ? 1 : 0;
} else {
  const crop = (cx, cz, half) => {
    const i0 = Math.max(0, Math.floor((cx - half - R0.x0) / R0.g)), i1 = Math.min(R0.nx - 1, Math.ceil((cx + half - R0.x0) / R0.g)), j0 = Math.max(0, Math.floor((cz - half - R0.z0) / R0.g)), j1 = Math.min(R0.nz - 1, Math.ceil((cz + half - R0.z0) / R0.g));
    const nx = i1 - i0 + 1, nz = j1 - j0 + 1, h = new Int16Array(nx * nz), water = new Uint8Array(nx * nz), level = new Int16Array(nx * nz);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i, s = (j + j0) * R0.nx + i + i0; h[k] = R0.h[s]; water[k] = R0.water[s]; level[k] = R0.level[s]; }
    const keep = R0.roads.map((r) => { for (let i = 0; i < r.x.length; i++) if (Math.abs(r.x[i] - cx) < half + 60 && Math.abs(r.z[i] - cz) < half + 60) return true; return false; }), remap = new Map(); keep.forEach((k, i) => { if (k) remap.set(i, remap.size); });
    const roads = R0.roads.filter((r, i) => keep[i]).map((r) => ({ ...r, next: (r.next || []).filter(([l]) => remap.has(l)).map(([l, i]) => [remap.get(l), i]), prev: (r.prev || []).filter(([l]) => remap.has(l)).map(([l, i]) => [remap.get(l), i]) }));
    // edge 0: the cut of a piece of the interior is not the region's border, where the bake would leave the ground to the world outside (emit.mjs drawnGround)
    return { ...R0, nx, nz, x0: R0.x0 + i0 * R0.g, z0: R0.z0 + j0 * R0.g, h, water, level, roads, edge: 0 };
  };
  const at = (lon, lat) => { const p = project(lon, lat); return { x: p.x - CAPITAL.x, z: p.z - CAPITAL.z }; };
  const gn = at(127.0276, 37.4979), C = crop(gn.x, gn.z, 4500);
  const B = makeBuildings(C, {}), bld = { tiles: bldTiles(B) };
  const a = makeStreets(C, bld), b = makeStreets(C, bld), ta = toTiles(a), tb = toTiles(b);
  m.junctions = a.junctions.length; m.signals = a.junctions.filter((j) => j.signal).length; m.runs = a.runs.length; m.tiles = Object.keys(ta).length;
  if (m.junctions < 300 || m.runs < 500) bad.push(['too few junctions or runs in 9 x 9 km of Gangnam', m.junctions, m.runs]);
  if (!m.signals) bad.push(['no signalled junction in Gangnam']);
  // 1. the same input gives the same bytes
  const bytes = (T) => Object.keys(T).sort().map((k) => k + Object.entries(T[k]).map(([f, v]) => (ArrayBuffer.isView(v) ? Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64') : v)).join('|')).join('\n');
  if (bytes(ta) !== bytes(tb)) bad.push(['two runs give different tiles']);
  // 2. junctions: three arms or more, in angle order, trims within 0..25 m, a crossing only on arms with a rank
  let armN = 0, crossN = 0;
  for (const j of a.junctions) {
    if (j.arms.length < 3) bad.push(['junction with fewer than three arms']);
    for (let k = 0; k + 1 < j.arms.length; k++) if (j.arms[k].ang > j.arms[k + 1].ang) { bad.push(['arms not sorted by angle']); break; }
    for (const arm of j.arms) { armN++; if (arm.cross) crossN++; if (arm.tl < 0 || arm.tr < 0 || arm.tl > 25.01 || arm.tr > 25.01) bad.push(['trim out of range', arm.tl, arm.tr]); if (arm.cross && arm.rank > 3) bad.push(['a crossing on a ramp or a motorway']); }
  }
  m.arms = armN; m.crossings = crossN;
  // 3. runs: never in a tunnel, never on a motorway, ramp or flyover, rarely in the water (a quay or a stream bank can touch the 16 m water raster), trims shorter than the run
  const water = (x, z) => { const i = Math.floor((x - C.x0) / C.g), j = Math.floor((z - C.z0) / C.g); return i >= 0 && j >= 0 && i < C.nx && j < C.nz && C.water[j * C.nx + i] > 0; };
  // a flyover carries no pavement; what flyovers() marks is only ever the map's own dry bridge on an arterial (a river bridge keeps its pavements)
  const FLY = flyovers(C); let flyKm = 0;
  FLY.forEach((f, ri) => { const L = C.roads[ri]; for (let i = 0; i < f.length; i++) if (f[i]) { if (L.cls[i] !== 1 || !L.why || L.why[i] !== 1 || !(L.hw in RANK) || RANK[L.hw] > 1 || water(L.x[i], L.z[i])) { bad.push(['a flyover sample that is not a dry mapped bridge of an arterial', L.id, i]); return; } if (i && f[i - 1]) flyKm += Math.hypot(L.x[i] - L.x[i - 1], L.z[i] - L.z[i - 1]) / 1000; } });
  m.flyoverKm = +flyKm.toFixed(1);
  let wet = 0, samples = 0, onFly = 0;
  for (const r of a.runs) {
    const L = C.roads[r.ri]; if (!L) { bad.push(['run without a line']); continue; }
    if (!(L.hw in RANK) || RANK[L.hw] > 3) bad.push(['pavement along a ' + L.hw]);
    const fly = FLY[r.ri]; for (let i = r.i0; i < r.i1; i++) if (fly[i] && fly[i + 1]) onFly++;
    let len = 0; for (let i = r.i0; i < r.i1; i++) { if (L.cls[i] === 2 || L.cls[i + 1] === 2) bad.push(['pavement in a tunnel']); len += Math.hypot(L.x[i + 1] - L.x[i], L.z[i + 1] - L.z[i]); }
    for (let i = r.i0; i < r.i1; i++) { const tx = L.x[i + 1] - L.x[i], tz = L.z[i + 1] - L.z[i], l = Math.hypot(tx, tz) || 1, off = L.half + r.w / 20; samples++; if (water(L.x[i] + tz / l * off, L.z[i] - tx / l * off) || water(L.x[i] - tz / l * off, L.z[i] + tx / l * off)) wet++; }
    if (r.ta[0] + r.tb[0] > len - 1 && r.ta[1] + r.tb[1] > len - 1) bad.push(['both trims eat the run', len, r.ta, r.tb]);
  }
  m.wet = wet; m.samples = samples; m.flyoverSegs = a.flyoverSegs;
  if (onFly) bad.push(['pavement on a flyover', onFly]);
  if (wet > samples * 0.02) bad.push(['pavement in the water', wet, samples]);
  // 4. a stored tile reads back as it was written (0.1 m)
  let jn = 0, rn = 0; for (const [key, t] of Object.entries(ta)) { const d = readTile(key, t); jn += d.J.length; rn += d.R.length; }
  if (jn !== a.junctions.length || rn !== a.runs.length) bad.push(['tiles lose records', jn, a.junctions.length, rn, a.runs.length]);
  // 5. every lamp and tree belongs where it stands, checked here by brute force and not with the bake's own indexes:
  //    not in a building, a tree's crown clear of walls, not on any other carriageway at its level, not in the water, not on a crossing, lamps not doubling up,
  //    trees apart and only along pavements wide enough for a tree pit
  {
    const items = a.items, rects = []; for (const [key, t] of Object.entries(bld.tiles)) for (const b of readBld(key, t)) rects.push(b);
    const wallDist = (x, z) => { let best = 1e9; for (const b of rects) { if (Math.abs(b.x - x) > 60 || Math.abs(b.z - z) > 60) continue; const ux = Math.cos(b.rot), uz = Math.sin(b.rot), px = x - b.x, pz = z - b.z, u = px * ux + pz * uz, v = -px * uz + pz * ux, du = Math.abs(u) - b.w / 2, dv = Math.abs(v) - b.d / 2, d = du > 0 || dv > 0 ? Math.hypot(Math.max(du, 0), Math.max(dv, 0)) : Math.max(du, dv); if (d < best) best = d; } return best; };
    const onRoad = (x, z, y, own) => { for (let ri = 0; ri < C.roads.length; ri++) { if (ri === own) continue; const o = C.roads[ri]; for (let i = 0; i + 1 < o.x.length; i++) { if (Math.abs(o.x[i] - x) > 80 || Math.abs(o.z[i] - z) > 80) continue; const dx = o.x[i + 1] - o.x[i], dz = o.z[i + 1] - o.z[i], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - o.x[i]) * dx + (z - o.z[i]) * dz) / l2)); if (Math.abs(o.y[i] + (o.y[i + 1] - o.y[i]) * t - y) > 4) continue; if (Math.hypot(x - o.x[i] - dx * t, z - o.z[i] - dz * t) < o.half + 0.25) return true; } } return false; };
    const lamps = items.filter((f) => f.t === 0), trees = items.filter((f) => f.t === 1);
    m.lamps = lamps.length; m.trees = trees.length; m.refused = a.why;
    if (lamps.length < 500 || trees.length < 500) bad.push(['too few lamps or trees in Gangnam', lamps.length, trees.length]);
    const v = { building: 0, facade: 0, road: 0, water: 0, lampPair: 0, treePair: 0, narrow: 0, crossing: 0, ground: 0 };
    const gy = (x, z) => { const fx = (x - C.x0) / C.g, fz = (z - C.z0) / C.g, i = Math.floor(fx), j = Math.floor(fz), u = fx - i, w = fz - j, k = j * C.nx + i, h = C.h; return ((h[k] * (1 - u) + h[k + 1] * u) * (1 - w) + (h[k + C.nx] * (1 - u) + h[k + C.nx + 1] * u) * w) / 10; };
    // a sample keeps the brute-force checks short (every 3rd object)
    items.forEach((f, k) => {
      if (k % 3) return;
      const wd = wallDist(f.x, f.z); if (wd < 0.39) v.building++;
      if (f.t === 1 && wd < SPECIES[f.v & 3].r * 0.8 - 0.01) v.facade++;
      if (onRoad(f.x, f.z, f.y, f.ri)) v.road++;
      if (water(f.x, f.z)) v.water++;
      // (inside the cropped raster only: the lines of the crop run on past its edge, where the bake and this check both read no ground)
      const inR = f.x > C.x0 + C.g && f.z > C.z0 + C.g && f.x < C.x0 + (C.nx - 2) * C.g && f.z < C.z0 + (C.nz - 2) * C.g;
      if (inR && !f.bridge && Math.abs(gy(f.x, f.z) - f.y) > 1.01) v.ground++;
      if (a.judge.onCrossing(f.x, f.z, f.t === 0 ? 1.4 : 3.9)) v.crossing++;
    });
    for (const f of lamps) for (const g of lamps) if (f !== g && Math.hypot(f.x - g.x, f.z - g.z) < Math.min(f.S, g.S) * 0.6 - 0.01 && f.ri === g.ri) { v.lampPair++; break; }
    for (const f of trees) for (const g of trees) if (f !== g && Math.abs(f.x - g.x) < 8 && Math.abs(f.z - g.z) < 8 && Math.hypot(f.x - g.x, f.z - g.z) < SPECIES[f.v & 3].gap * 0.8 - 0.01 && f.ri === g.ri) { v.treePair++; break; }
    const walkOf = new Map(a.runs.map((r) => [r.ri, r.w / 10])); for (const f of trees) if ((walkOf.get(f.ri) || 0) < TREE_MIN_WALK) v.narrow++;
    m.violations = v;
    for (const [k, n] of Object.entries(v)) if (n) bad.push(['a ' + k + ' violation', n]);
    // each refusal reason is real: the judge refused something for most of them in 9 x 9 km of Gangnam
    // a wall refuses as 'building' or, for a tree's crown, as 'facade': since the streets are fitted to the walls (build/world/fit.mjs) the procedural
    // buildings of this crop stand back from the narrower carriageways and the wall test mostly speaks through the crown
    const said = (k) => a.why.lamp[k] || a.why.tree[k] || (k === 'building' && (a.why.lamp.facade || a.why.tree.facade));
    for (const k of ['building', 'road', 'crossing', 'signal', 'lit']) if (!said(k)) bad.push(['the judge never refused for ' + k]);
  }
  // 6. road markings: arrows only where traffic arrives on a collector or bigger, every painted arrow names a way out that exists, a bus lane only on a
  //    two-way trunk or primary road with three lanes a way or more, and a diamond only ahead of an unsignalled crossing
  {
    const mk = { arrows: 0, diamonds: 0, busArms: 0, busRuns: 0 };
    for (const j of a.junctions) for (const arm of j.arms) {
      if (!arm.mark) continue;
      const L = C.roads[arm.ri], n = arm.mark >> 4;
      if (arm.rank > 2 || arm.flow === 1) bad.push(['arrows on an arm no traffic of rank <= 2 arrives on', arm.rank, arm.flow]);
      if (n < 1 || n > 4) bad.push(['lane count out of 1..4', n]);
      if (arm.mark & 3) mk.arrows++;
      if (arm.mark & 4) { mk.diamonds++; if (j.signal || !arm.cross) bad.push(['a diamond without an unsignalled crossing']); }
      if (arm.mark & 8) { mk.busArms++; if (!L.bus || L.oneway) bad.push(['a bus arrow on a line without a bus lane']); }
      const tx = -Math.cos(arm.ang), tz = -Math.sin(arm.ang); let ways = 0;
      for (const b of j.arms) { if (b === arm || b.flow === 2 || b.rank > 3) continue; const c = tx * Math.cos(b.ang) + tz * Math.sin(b.ang), sn = tx * Math.sin(b.ang) - tz * Math.cos(b.ang); if (c > Math.cos(0.6)) ways |= TURN.S; else if (c > Math.cos(2.7)) ways |= sn > 0 ? TURN.R : TURN.L; }
      for (let k = 0; k < n; k++) { const t = (arm.arr >> (3 * k)) & 7; if (!t || (t & ~ways)) { bad.push(['a lane arrow to nowhere', t, ways]); break; } }
    }
    for (const r of a.runs) if (r.m & 4) { mk.busRuns++; const L = C.roads[r.ri]; if (L.oneway || !(L.hw === 'trunk' || L.hw === 'primary') || Math.ceil((L.lanes || 0) / 2) < 3) bad.push(['a bus lane on a ' + L.hw, L.lanes, L.oneway]); }
    m.markings = mk;
    if (mk.arrows < 100) bad.push(['too few arrow sets in Gangnam', mk.arrows]);
    if (!mk.busRuns) bad.push(['no bus lane in Gangnam (Gangnam-daero has one)']);
  }
  console.log('RESULT ' + JSON.stringify({ test: 'streets', pass: bad.length === 0, metrics: m, note: bad.length ? JSON.stringify(bad.slice(0, 8)) : '' }));
  process.exitCode = bad.length ? 1 : 0;
}
