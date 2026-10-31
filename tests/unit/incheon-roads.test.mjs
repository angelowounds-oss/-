// Seoul to Incheon by the real roads (WLD-22, ADR-0037): the airport city stands at Incheon airport on Yeongjong; no generated highway runs to it;
// its connectors meet the real motorways 110 (인천대교) and 130 (공항고속도로) on its plateau and at their height, within the grade; from there the
// compiled motorways lead on to the capital's connectors; the compiled 110 and 130 follow the real lines (korearoads.js); no bridge lies on the
// sea, a sea bridge clears the water by SEA_DECK, and the main span of 인천대교 stands at its navigation clearance at the terrain's height scale.
import '../../build/jobs.mjs';
const { net, groundH } = await import('../../src/roadnet.js');
const { cities, highways, SEA } = await import('../../src/worldmap.js');
const { regionRoads, regionWater } = await import('../../src/region.js');
const { CAPITAL, project } = await import('../../src/koreamap.js');
const { ROADS } = await import('../../src/korearoads.js');
const { BRIDGES } = await import('../../src/regions/index.js');
const bad = [], m = {};
const air = cities().find((c) => c.id === 'airfield'), at = project(126.41, 37.462);
m.airfield = { x: Math.round(air.x), z: Math.round(air.z), r: air.r };
if (Math.hypot(air.x - (at.x - CAPITAL.x), air.z - (at.z - CAPITAL.z)) > 50) bad.push(['airfield not at the airport', m.airfield]);
if (highways().some((h) => h.a === 'airfield' || h.b === 'airfield')) bad.push(['a generated highway runs to the airfield']);

// the connectors: two (110, 130), from the plateau (y 0) to the motorway end they join, on the ground within 4 m, within the grade
const N = net(), rr = regionRoads(), byId = new Map(rr.map((r) => [r.id, r]));
const conns = N.roads.filter((r) => r.kind === 'connector' && r.city === 'airfield');
m.connectors = conns.map((r) => r.id);
for (const ref of ['110', '130']) if (!conns.some((r) => r.id === 'conn:airfield:' + ref)) bad.push(['no connector to', ref]);
for (const r of conns) {
  const j = byId.get(r.joinB?.road), n = r.pts.length; let off = 0, grade = 0;
  if (!j) { bad.push(['connector joins nothing', r.id]); continue; }
  if (Math.abs(r.y[0]) > 0.5) bad.push(['connector does not start on the plateau', r.id, r.y[0]]);
  if (Math.abs(r.y[n - 1] - j.y[r.joinB.i]) > 0.3) bad.push(['connector misses the motorway height', r.id, r.y[n - 1], j.y[r.joinB.i]]);
  for (let i = 0; i < n; i++) { if (r.cls[i] === 0 && Math.abs(r.y[i] - groundH(r.pts[i][0], r.pts[i][1])) > 4) off++; if (i) grade = Math.max(grade, Math.abs(r.y[i] - r.y[i - 1]) / Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1])); }
  m[r.id] = { pts: n, off, grade: +grade.toFixed(3) };
  if (off) bad.push(['connector off the ground', r.id, off]); if (grade > 0.07) bad.push(['connector grade', r.id, grade]);
}

// from each joined motorway along the compiled roads to a road a capital connector joins, by roads only: a line's ends join another line
// (next / prev: [road index, point index], emit.mjs), both ways
const ix = new Map(rr.map((r, k) => [r.id, k])), adj = rr.map(() => []);
rr.forEach((r, k) => { for (const [o] of [...r.next, ...r.prev]) { adj[k].push(o); adj[o].push(k); } });
const goal = new Set(N.roads.filter((r) => r.kind === 'connector' && r.city === 'neon').map((r) => ix.get(r.joinB?.road)).filter((k) => k != null));
const reach = (start) => { const seen = new Set([start]), q = [start]; while (q.length) { const k = q.shift(); if (goal.has(k)) return seen.size; for (const o of adj[k]) if (!seen.has(o)) { seen.add(o); q.push(o); } } return 0; };
for (const r of conns) { const s = reach(ix.get(r.joinB.road)); m[r.id].toCapital = s; if (!s) bad.push(['no road from the airport to the capital', r.id]); }

// the compiled 110 and 130 near the airport follow the real lines: mean distance of their samples to korearoads' line of the same ref
const real = (ref) => ROADS.roads.filter((r) => r.ref === ref && r.hw === 'motorway').map((r) => r.pts.map(([x, z]) => [x - CAPITAL.x, z - CAPITAL.z]));
const segD = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1))); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
for (const ref of ['110', '130']) {
  const L = real(ref); let s = 0, c = 0;
  for (const r of rr) if (r.ref === ref && r.hw === 'motorway') for (let i = 0; i < r.x.length; i += 4) { if (Math.hypot(r.x[i] - air.x, r.z[i] - air.z) > 12000) continue; let d = Infinity; for (const p of L) for (let k = 0; k + 1 < p.length; k++) d = Math.min(d, segD(r.x[i], r.z[i], p[k], p[k + 1])); s += d; c++; }
  m['meanDev' + ref] = c ? +(s / c).toFixed(1) : null;
  if (!c || s / c > 50) bad.push(['compiled line off the real one', ref, m['meanDev' + ref]]);
}

// heights: no motorway or trunk bridge on the water's surface (sea or river, its level); over the sea at least SEA_DECK (6 m) up; the main spans at their clearance
let onSea = 0, low = 0, overSea = 0;
for (const r of rr) { if (r.hw !== 'motorway' && r.hw !== 'trunk') continue; for (let i = 0; i < r.x.length; i++) {
  const w = regionWater(r.x[i], r.z[i]); if (w && w.cls && r.cls[i] === 1 && r.y[i] < w.level + 0.5) onSea++;
  if (w && w.cls === 1 && r.cls[i] === 1) { overSea++; if (r.y[i] < SEA + 5.9) low++; }
} }
m.heights = { onSea, overSea, low };
if (onSea) bad.push(['bridges on the water surface', onSea]); if (low) bad.push(['sea bridge samples under SEA_DECK', low]);
for (const b of BRIDGES) {
  const p = project(b.lon, b.lat), x = p.x - CAPITAL.x, z = p.z - CAPITAL.z; let top = -Infinity;
  for (const r of rr) if (r.ref === b.ref) for (let i = 0; i < r.x.length; i++) if (Math.hypot(r.x[i] - x, r.z[i] - z) < 30) top = Math.max(top, r.y[i]);
  m[b.id] = +(top - SEA).toFixed(1);
  if (!(top > -Infinity)) bad.push(['no deck at the main span', b.id]);
  else if (b.clearance && top - SEA < b.clearance * 0.25 - 0.5) bad.push(['main span under its clearance', b.id, top - SEA, b.clearance * 0.25]);
}
console.log('RESULT ' + JSON.stringify({ test: 'incheon-roads', pass: bad.length === 0, metrics: m, note: bad.map((b) => b.join(' ')).join(' | ') }));
process.exitCode = bad.length ? 1 : 0;
