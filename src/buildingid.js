import { layouts, KIND } from './citylayout.js';
import { cities } from './worldmap.js';
import { settlements } from './settlements.js';
import { net } from './roadnet.js';
import { LM_DIMS } from './landmarkdims.js';

// Building numbers (ADR-0030): every building of the game has a stable id made from where it stands and its place in its generator's order there,
// so the same sources always give the same numbers and a change elsewhere does not renumber a city. `registry()` lists them all (the capital's
// lots only in the browser, where the world is built); docs/buildings/registry.csv is that list, made by tests/tools/building-registry.cjs.
const pad = (n, w) => String(n).padStart(w, '0');
const KIND_NAME = Object.fromEntries(Object.entries(KIND).map(([k, v]) => [v, k]));

// the capital: a block lot is numbered in its block (blocks counted from the ring, 00..10), a model tower along its side, a far tower in order
export const neonBlockUid = (bi, bj, k) => `NC-B${pad(bi + 1, 2)}_${pad(bj + 1, 2)}-${k}`;
export const neonRingUid = (side, k) => `NC-R${side.toUpperCase()}${pad(k, 2)}`;
export const neonFarUid = (k) => `NC-F${pad(k, 3)}`;
// another city: the index of the building in its layout (citylayout.js `bld`), a landmark tower by its index in `lm`
export const cityUid = (cityId, i) => `${cityId.toUpperCase()}-${pad(i, 4)}`;
export const landmarkUid = (cityId, i) => `${cityId.toUpperCase()}-L${i}`;
// a village house by its index in the village plan, the water tower and the filling-station canopy by name; a farm's house and barn
export const villageUid = (vid, idx) => `${vid.toUpperCase()}-${typeof idx === 'number' ? pad(idx, 3) : idx.toUpperCase().slice(0, 3)}`;
export const farmUid = (fid, kind) => `${fid.toUpperCase()}-${kind === 'barn' ? 'B' : 'H'}`;
export const siteUid = (id) => id.toUpperCase();
export const serviceUid = (road, idx) => `SA-${road.replace(/[^\w]/g, '').toUpperCase()}-${idx}`;

// give every lot of the capital its number (world.js, after all lots exist); the sky tower keeps its block number and is also NC-SKY
export function assignNeonIds(lots) {
  const per = new Map(), side = new Map(); let far = 0;
  for (const l of lots) {
    if (l.far) l.uid = neonFarUid(far++);
    else if (l.model) { const s = l.model.side, k = side.get(s) || 0; side.set(s, k + 1); l.uid = neonRingUid(s, k); }
    else { const key = l.bi + ',' + l.bj, k = per.get(key) || 0; per.set(key, k + 1); l.uid = neonBlockUid(l.bi, l.bj, k); }
    if (l.landmark) l.alias = 'NC-SKY';
  }
}

const row = (uid, area, kind, x, z, w, d, h, name = '', enter = false, src = '') => ({ uid, area, kind, x: Math.round(x), z: Math.round(z), w: +w.toFixed(1), d: +d.toFixed(1), h: +h.toFixed(1), floors: Math.max(1, Math.round(h / 3.4)), name, enter, src });

// every building as a row {uid, area, kind, x, z, w, d, h, floors, name, enter, src}; `lots` = the capital's world.lots when there is a world
export function registry(lots = null) {
  const out = [];
  if (lots) for (const l of lots) out.push(row(l.uid, 'NEON', l.far ? 'far' : l.model ? 'ring-model' : l.landmark ? 'sky-tower' : l.ring ? 'ring' : 'block', (l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2, l.x1 - l.x0, l.z1 - l.z0, l.h, l.name || '', !!l.door, 'world.js'));
  const C = new Map(cities().map((c) => [c.id, c]));
  for (const [id, L] of layouts()) {
    const c = C.get(id); if (!c) continue;
    for (let i = 0; i < L.bld.length / 12; i++) {
      const b = L.bld.subarray(i * 12, i * 12 + 12), kind = KIND_NAME[Math.floor(b[9] / 16)] || 'normal', h = b[4] + b[5];
      const enter = ['normal', 'hospital', 'school', 'terminal', 'station'].includes(kind) && Math.min(b[2], b[3]) >= 17 && h >= 20;   // as citysites.makeNear (a few have no room for a door)
      out.push(row(cityUid(id, i), id.toUpperCase(), kind, c.x + b[0], c.z + b[1], b[2], b[3], h, '', enter, 'citylayout.js'));
    }
    for (let i = 0; i < L.lm.length / 7; i++) { const m = L.lm.subarray(i * 7, i * 7 + 7), dims = LM_DIMS[m[2]] || [0]; out.push(row(landmarkUid(id, i), id.toUpperCase(), 'landmark', c.x + m[0], c.z + m[1], m[5], m[6], dims[0] * m[4], '', false, 'landmarks.js')); }
  }
  const S = settlements();
  for (const v of S.villages) {
    const area = v.tag === 'real' ? v.name : v.id.toUpperCase();
    (v.houses || []).forEach((h, i) => out.push(row(villageUid(v.id, i), area, h.kind, v.x + h.x, v.z + h.z, h.w, h.d, h.kind === 'block' ? 18 : h.kind === 'church' ? 11 : 6, h.name || '', h.kind === 'house' || h.kind === 'shop', 'settlements.js')));
    if (v.tower) out.push(row(villageUid(v.id, 'tower'), area, 'water-tower', v.x - 26, v.z - 34, 7, 7, 15, '', false, 'village.js'));
    if (v.gas) out.push(row(villageUid(v.id, 'canopy'), area, 'canopy', v.x - 48, v.z + 22, 17, 11, 5.5, '', false, 'village.js'));
  }
  for (const f of S.farms) for (const h of f.houses || []) out.push(row(farmUid(f.id, h.kind), f.id.toUpperCase(), h.kind, f.x + h.x, f.z + h.z, h.w, h.d, h.kind === 'barn' ? 9 : 6, f.name || '', h.kind === 'house', 'settlements.js'));
  for (const s of S.industry) out.push(row(siteUid(s.id), s.id.toUpperCase(), s.type, s.x, s.z, 0, 0, 0, '', false, 'industry.js'));
  for (const t of S.towers) out.push(row(siteUid(t.id), t.id.toUpperCase(), 'comms-tower', t.x, t.z, 4, 4, 60, '', false, 'industry.js'));
  for (const sv of net().services || []) out.push(row(serviceUid(sv.road, sv.idx), 'SERVICE', 'service-area', sv.x ?? 0, sv.z ?? 0, 2 * (sv.r || 52), 2 * (sv.r || 52), 8, '', false, 'highways.js'));
  return out;
}

export const CSV_HEAD = 'uid,area,kind,x,z,w,d,h,floors,name,enter,src';
export const toCsv = (rows) => [CSV_HEAD, ...rows.map((r) => [r.uid, r.area, r.kind, r.x, r.z, r.w, r.d, r.h, r.floors, JSON.stringify(r.name || ''), r.enter ? 1 : 0, r.src].join(','))].join('\n') + '\n';
