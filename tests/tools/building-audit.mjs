// Building audit, pass A (Q0-7): the outside of every building that does not need the browser, from the generators' own data.
// Usage: node tests/tools/building-audit.mjs [--json out.json]   (the capital's lots are pass B: building-audit.cjs)
// Checks per building: odd values, a road through it, overlap with another building / landmark / airfield strip, water at a corner or the centre,
// and how far the ground under the footprint is from the level the building stands on.
import '../../build/jobs.mjs';
import fs from 'node:fs';
const { layouts } = await import('../../src/citylayout.js');
const { cities, SEA } = await import('../../src/worldmap.js');
const { settlements, layoutVillage } = await import('../../src/settlements.js');
const { cityUid, landmarkUid, villageUid, farmUid } = await import('../../src/buildingid.js');
const { landHeight } = await import('../../src/landfn.js');
const { farWater } = await import('../../src/waterfn.js');
const { roadAt, net } = await import('../../src/roadnet.js');
const { KIND } = await import('../../src/citylayout.js');

const KIND_NAME = Object.fromEntries(Object.entries(KIND).map(([k, v]) => [v, k]));
const out = [];   // {uid, area, kind, x0, z0, x1, z1, h, y (level it stands on or null), enter}
const C = new Map(cities().map((c) => [c.id, c]));
const strips = [];   // [x0, z0, x1, z1, type, area]: airfield strips, aprons, port yards (no building belongs on them)
const roadsOf = new Map();
for (const [id, L] of layouts()) {
  const c = C.get(id); if (!c) continue;
  const rd = []; for (let i = 0; i < L.roads.length / 5; i++) { const r = L.roads.subarray(i * 5, i * 5 + 5); rd.push([c.x + r[0], c.z + r[1], c.x + r[2], c.z + r[3], r[4]]); } roadsOf.set(id, rd);
  for (let i = 0; i < L.areas.length / 6; i++) { const a = L.areas.subarray(i * 6, i * 6 + 6); if (a[0] >= 10) strips.push([c.x + a[1], c.z + a[2], c.x + a[3], c.z + a[4], a[0], id]); }
  for (let i = 0; i < L.bld.length / 12; i++) {
    const b = L.bld.subarray(i * 12, i * 12 + 12), kind = KIND_NAME[Math.floor(b[9] / 16)] || 'normal', x = c.x + b[0], z = c.z + b[1];
    out.push({ uid: cityUid(id, i), area: id, kind, x0: x - b[2] / 2, z0: z - b[3] / 2, x1: x + b[2] / 2, z1: z + b[3] / 2, h: b[4] + b[5], y: c.y, edges: b[11], city: true });
  }
  for (let i = 0; i < L.lm.length / 7; i++) { const m = L.lm.subarray(i * 7, i * 7 + 7), x = c.x + m[0], z = c.z + m[1]; out.push({ uid: landmarkUid(id, i), area: id, kind: 'landmark', x0: x - m[5] / 2, z0: z - m[6] / 2, x1: x + m[5] / 2, z1: z + m[6] / 2, h: 0, y: c.y, city: true }); }
}
const S = settlements(), padY = new Map(net().pads.map((p) => [p.id, p.y]));   // villages and farms stand on the carved pad (roadnet.js)
for (const v of S.villages) {
  if (!v.houses) layoutVillage(v);
  const y = padY.get(v.id) ?? null;
  (v.houses || []).forEach((h, i) => out.push({ uid: villageUid(v.id, i), area: v.id, kind: h.kind, x0: v.x + h.x - h.w / 2, z0: v.z + h.z - h.d / 2, x1: v.x + h.x + h.w / 2, z1: v.z + h.z + h.d / 2, h: 6, y }));
}
for (const f of S.farms) for (const h of f.houses || []) out.push({ uid: farmUid(f.id, h.kind), area: f.id, kind: h.kind, x0: f.x + h.x - h.w / 2, z0: f.z + h.z - h.d / 2, x1: f.x + h.x + h.w / 2, z1: f.z + h.z + h.d / 2, h: 6, y: padY.get(f.id) ?? null });

const findings = [], add = (uid, code, info) => findings.push({ uid, code, ...info });
const pts = (b) => [[(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2], [b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]];

// 1. odd values
for (const b of out) {
  const w = b.x1 - b.x0, d = b.z1 - b.z0;
  if (![b.x0, b.z0, b.x1, b.z1, b.h].every(Number.isFinite)) add(b.uid, 'nan', {});
  else if (b.kind !== 'landmark' && (w < 4 || d < 4)) add(b.uid, 'tiny', { w: +w.toFixed(1), d: +d.toFixed(1) });
  else if (b.city && b.kind !== 'landmark' && b.kind !== 'park' && b.h < 4) add(b.uid, 'low', { h: +b.h.toFixed(1) });
}

// 2. a street through a city building (segment against the footprint grown by half the street, within the 0.5 m a lot may touch)
const hit = (s, r) => {   // Liang-Barsky: does segment s enter rect r = [x0, z0, x1, z1]?
  let t0 = 0, t1 = 1; const dx = s[2] - s[0], dz = s[3] - s[1];
  for (const [p, q] of [[-dx, s[0] - r[0]], [dx, r[2] - s[0]], [-dz, s[1] - r[1]], [dz, r[3] - s[1]]]) { if (p === 0) { if (q < 0) return false; } else { const t = q / p; if (p < 0) { if (t > t1) return false; t0 = Math.max(t0, t); } else { if (t < t0) return false; t1 = Math.min(t1, t); } } }
  return t0 <= t1;
};
for (const b of out) if (b.city && b.kind !== 'landmark' && !['park', 'stadium'].includes(b.kind)) for (const s of roadsOf.get(b.area)) {
  const g = s[4] / 2 - 0.5; if (!hit(s, [b.x0 - g, b.z0 - g, b.x1 + g, b.z1 + g])) continue;
  const n = Math.max(2, Math.ceil(Math.hypot(s[2] - s[0], s[3] - s[1]) / 1)); let near = Infinity;   // how deep the street reaches into the footprint: half its width less the nearest centre-line point
  for (let q = 0; q <= n; q++) { const x = s[0] + (s[2] - s[0]) * q / n, z = s[1] + (s[3] - s[1]) * q / n; if (x < b.x0 - g || x > b.x1 + g || z < b.z0 - g || z > b.z1 + g) continue; near = Math.min(near, Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.z0 - z, 0, z - b.z1))); }
  if (s[4] / 2 - near > 1) add(b.uid, 'road-through', { depth: +(s[4] / 2 - near).toFixed(1), width: s[4], road: s.map((v) => Math.round(v)).join(',') });   // 0.5 m is the street edge touching a lot's inset line, not a defect
  break;
}
// highways and rings: villages, farms and city lots against roadnet (the road's own half width plus a 2 m verge)
for (const b of out) {
  let worst = null;
  for (const [x, z] of pts(b)) { const r = roadAt(x, z, 30); if (r) { const half = (r.road.w ?? 14) / 2 + 2; if (r.d < half && (!worst || r.d < worst.d)) worst = { d: +r.d.toFixed(1), half, kind: r.road.kind || r.road.hw || '?' }; } }
  if (worst && worst.half - worst.d > 3) add(b.uid, 'highway-through', { ...worst, depth: +(worst.half - worst.d).toFixed(1) });
}

// 3. overlap: building against building / landmark (0.5 m of give), and against the airfield strips and port yards
const G = 64, grid = new Map(), K = (a, b) => a * 100003 + b;
out.forEach((b, i) => { for (let a = Math.floor(b.x0 / G); a <= Math.floor(b.x1 / G); a++) for (let c = Math.floor(b.z0 / G); c <= Math.floor(b.z1 / G); c++) { const k = K(a, c); (grid.get(k) || grid.set(k, []).get(k)).push(i); } });
const seen = new Set(), tol = 0.5;
for (const l of grid.values()) for (let u = 0; u < l.length; u++) for (let v = u + 1; v < l.length; v++) {
  const A = out[l[u]], B = out[l[v]], key = l[u] * 1e6 + l[v]; if (seen.has(key)) continue; seen.add(key);
  const ox = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0), oz = Math.min(A.z1, B.z1) - Math.max(A.z0, B.z0);
  if (ox > tol && oz > tol) add(A.uid, 'overlap', { with: B.uid, ox: +ox.toFixed(1), oz: +oz.toFixed(1) });
}
for (const b of out) if (b.city && b.kind !== 'landmark') for (const s of strips) if (s[5] === b.area && b.x1 > s[0] + 1 && b.x0 < s[2] - 1 && b.z1 > s[1] + 1 && b.z0 < s[3] - 1 && !['hangar', 'terminal', 'tower', 'warehouse', 'station'].includes(b.kind)) { add(b.uid, 'on-strip', { strip: s[4] }); break; }

// 4. water at the centre or a corner, and the ground under the footprint against the level the building stands on
for (const b of out) {
  if (b.kind === 'park') continue;
  let wet = 0, lo = Infinity, hi = -Infinity;
  for (const [x, z] of pts(b)) { if (farWater(x, z)) wet++; const g = landHeight(x, z, 8); lo = Math.min(lo, g); hi = Math.max(hi, g); }
  if (wet) add(b.uid, 'in-water', { corners: wet });
  if (b.y != null && Number.isFinite(lo)) { const up = lo - b.y, dn = b.y - hi; if (up > 1.5) add(b.uid, 'buried', { by: +up.toFixed(1) }); else if (dn > 1.5) add(b.uid, 'floating', { by: +dn.toFixed(1) }); }
}

// summary
const by = {}, areas = {};
for (const f of findings) { by[f.code] = (by[f.code] || 0) + 1; const a = out.find((b) => b.uid === f.uid)?.area || '?'; (areas[f.code] ||= {})[a] = (areas[f.code][a] || 0) + 1; }
console.log(`buildings checked ${out.length}; findings ${findings.length}`);
for (const [code, n] of Object.entries(by).sort((a, b) => b[1] - a[1])) {
  const worst = findings.filter((f) => f.code === code).slice(0, 5).map((f) => f.uid + (f.with ? '<>' + f.with : '')).join(' ');
  console.log(`  ${code.padEnd(16)} ${String(n).padStart(6)}   by area ${JSON.stringify(areas[code])}   e.g. ${worst}`);
}
const ji = process.argv.indexOf('--json'); if (ji > 0) { fs.writeFileSync(process.argv[ji + 1], JSON.stringify({ checked: out.length, by, findings }, null, 1)); console.log('written ' + process.argv[ji + 1]); }
