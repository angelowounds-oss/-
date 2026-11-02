// The real records of the capital region (DATA-01, ADR-0042) read from the OpenStreetMap tiles that build/world/fetch-detail.mjs cached: building outlines
// with their real height when the map has one, and the street points (signals, crossings, bus stops, trees, lamps, subway entrances). Everything is in world
// metres (x east, z south, relative to the capital, as the roads), deduplicated across tiles by OSM id, and keeps that id so every baked object can say
// where it came from. Nothing here is guessed: what the map lacks is left empty for the bake to fill and to mark as guessed.
import fs from 'node:fs';
import { project, CAPITAL } from '../../src/koreamap.js';
import { tiles, BOX } from './fetch-detail.mjs';
import { cacheFile } from './osm.mjs';

export const LEVEL_H = 3.3, GROUND_H = 4.5;   // a storey and a shop's ground floor in Korea (metres): the height of a building known only by its levels
const xz = (lon, lat) => { const p = project(lon, lat); return [p.x - CAPITAL.x, p.z - CAPITAL.z]; };
// a length tag ("15", "15 m", "15.5m", "50'") in metres, or NaN
export function metres(v) {
  if (v == null) return NaN; const s = String(v).trim().replace(',', '.'), m = s.match(/^(-?\d+(?:\.\d+)?)\s*(m|ft|')?$/i);
  if (!m) return NaN; const n = parseFloat(m[1]); return m[2] && m[2] !== 'm' && m[2] !== 'M' ? n * 0.3048 : n;
}
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : NaN; };
// the signed area of a ring of [x, z] (positive counter-clockwise in x-right z-down terms)
export function area(ring) { let a = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]); return a / 2; }
// a ring without the closing duplicate and without points closer than 0.15 m to the previous one
function clean(g) {
  const out = []; for (const p of g) { const q = xz(p.lon, p.lat); const l = out[out.length - 1]; if (!l || Math.hypot(q[0] - l[0], q[1] - l[1]) > 0.15) out.push(q); }
  if (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 0.15) out.pop();
  return out.length >= 3 ? out : null;
}
// join the member ways of a multipolygon into closed rings (members come in any order and direction)
function joinRings(ways) {
  const rings = [], open = ways.map((w) => w.slice());
  while (open.length) {
    let cur = open.shift(), guard = 0;
    while (guard++ < 1000) {
      const a = cur[0], b = cur[cur.length - 1]; if (a.lat === b.lat && a.lon === b.lon && cur.length > 3) break;
      const k = open.findIndex((w) => (w[0].lat === b.lat && w[0].lon === b.lon) || (w[w.length - 1].lat === b.lat && w[w.length - 1].lon === b.lon));
      if (k < 0) break;
      const w = open.splice(k, 1)[0]; cur = cur.concat(w[0].lat === b.lat && w[0].lon === b.lon ? w.slice(1) : w.slice(0, -1).reverse());
    }
    rings.push(cur);
  }
  return rings;
}

// the height facts of a building or part: total height and base height in metres, levels, and where the height came from
// (2: a `height` tag, 1: `building:levels`, 0: nothing on the map)
export function heightOf(t) {
  const h = metres(t.height), lv = num(t['building:levels']), mh = metres(t.min_height), ml = num(t['building:min_level']), rl = num(t['roof:levels']) || 0;
  const base = Number.isFinite(mh) ? mh : Number.isFinite(ml) ? ml * LEVEL_H : 0;
  if (Number.isFinite(h) && h > 0) return { h, base, levels: Number.isFinite(lv) ? lv : Math.max(1, Math.round((h - base) / LEVEL_H)), src: 2 };
  if (Number.isFinite(lv) && lv > 0) {
    const shop = /^(retail|commercial|supermarket|kiosk)$/.test(t.building || '') || !!t.shop;
    return { h: (shop ? GROUND_H - LEVEL_H : 0) + (lv + rl * 0.5) * LEVEL_H + 0.6, base, levels: lv, src: 1 };
  }
  return { h: NaN, base, levels: NaN, src: 0 };
}

// read every cached tile of the box: { buildings: [{ id, rings: [[x, z]...] (outer first, counter-clockwise; holes after, clockwise), h, base, levels, src,
// tag, part, name }], points: [{ id, t, x, z, ...facts }], missing: [tile names not yet fetched], underground: buildings left out as below the ground }
export function readDetail(box = BOX) {
  const seenW = new Set(), seenN = new Set(), buildings = [], points = [], missing = [];
  let underground = 0;
  for (const [name, ql] of tiles(box)) {
    const f = cacheFile(name, ql); if (!fs.existsSync(f)) { missing.push(name); continue; }
    const els = JSON.parse(fs.readFileSync(f, 'utf8')).elements;
    for (const e of els) {
      const t = e.tags || {}, key = e.type + e.id;
      if (e.type === 'node') {
        if (seenN.has(e.id)) continue; seenN.add(e.id);
        const [x, z] = xz(e.lon, e.lat), hw = t.highway, base = { id: 'n' + e.id, x, z };
        if (hw === 'traffic_signals') points.push({ ...base, t: 'signal', dir: t['traffic_signals:direction'] || t.direction || '' });
        else if (hw === 'crossing') points.push({ ...base, t: 'crossing', signal: t.crossing === 'traffic_signals' || t['crossing:signals'] === 'yes' || t.crossing_ref === 'pelican', marked: t.crossing !== 'unmarked' });
        else if (hw === 'bus_stop' || (t.public_transport === 'platform' && t.bus === 'yes')) points.push({ ...base, t: 'bus', name: t['name:ko'] || t.name || '', shelter: t.shelter === 'yes' ? true : t.shelter === 'no' ? false : null });
        else if (hw === 'street_lamp') points.push({ ...base, t: 'lamp' });
        else if (hw === 'stop' || hw === 'give_way') points.push({ ...base, t: hw });
        else if (t.natural === 'tree') points.push({ ...base, t: 'tree', species: t['species:ko'] || t.species || t.genus || '', leaf: t.leaf_type || '' });
        else if (t.railway === 'subway_entrance') points.push({ ...base, t: 'subway', name: t.name || '', ref: t.ref || '' });
        else if (t.amenity || t.emergency) points.push({ ...base, t: t.emergency === 'fire_hydrant' || t.amenity === 'fire_hydrant' ? 'hydrant' : t.amenity });
        continue;
      }
      if (seenW.has(key)) continue; seenW.add(key);
      // a shopping arcade under a station square or a substation under a park is mapped with its outline but stands below the ground: drawn as a
      // building it would cover the street over it (강남역지하쇼핑센터, w305923846). A negative layer alone is not enough (it is also used for a building
      // that a flyover passes over), so only the explicit tags count.
      if (t.location === 'underground' || t.tunnel === 'yes' || t.building === 'underground') { underground++; continue; }
      let rings = [];
      if (e.type === 'way' && e.geometry) { const r = clean(e.geometry); if (r) rings.push(r); }
      else if (e.type === 'relation' && e.members) {
        const outer = joinRings(e.members.filter((m) => m.type === 'way' && m.geometry && m.role !== 'inner').map((m) => m.geometry)), inner = joinRings(e.members.filter((m) => m.type === 'way' && m.geometry && m.role === 'inner').map((m) => m.geometry));
        // each outer ring is its own building record, with the holes that lie in it; the second and later pieces are numbered (r123-1) so every uid is unique
        const outs = outer.map(clean).filter(Boolean), ins = inner.map(clean).filter(Boolean);
        outs.forEach((o, k) => { const hs = ins.filter((h) => inside(h[0], o)); emit(e, t, [o, ...hs], buildings, k ? '-' + k : ''); });
        continue;
      }
      if (rings.length) emit(e, t, rings, buildings);
    }
  }
  return { buildings, points, missing, underground };
}
function emit(e, t, rings, out, piece = '') {
  const [o, ...hs] = rings; if (area(o) < 0) o.reverse(); for (const h of hs) if (area(h) > 0) h.reverse();
  if (Math.abs(area(o)) < 4) return;   // a kiosk or a mapping slip: smaller than 2 x 2 m
  out.push({ id: e.type[0] + e.id + piece, rings: [o, ...hs], ...heightOf(t), tag: t['building:part'] || t.building || 'yes', part: !!t['building:part'] && !t.building, name: t['name:ko'] || t.name || '' });
}
// is the point inside the ring (even-odd)
export function inside(p, ring) {
  let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; }
  return c;
}
