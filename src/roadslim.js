// The decoded core chunk's road records made lighter once, before anything reads them (AAA-1 heap). JSON decoding gives every string and every
// empty list its own object: the 460 k road records of the capital build held 25 MB of repeated ids, kinds and names and some 116 MB of next/prev
// lists, most of them empty or naming another road by a fresh copy of its id. Strings are interned (one object per distinct text) and an empty
// list becomes one shared frozen list (a push into it throws instead of growing every road). Pure (no three.js).
export const EMPTY = Object.freeze([]);
// one shared string per distinct text
export function interner() { const m = new Map(); return (s) => { if (typeof s !== 'string') return s; const o = m.get(s); if (o !== undefined) return o; m.set(s, s); return s; }; }
const TEXT = ['id', 'kind', 'hw', 'city', 'ref', 'name'];
// one road record: its texts interned, its empty lists shared, the road a join names interned
function slimRoad(r, I) {
  for (const k of TEXT) if (typeof r[k] === 'string') r[k] = I(r[k]);
  for (const k of ['next', 'prev']) { const a = r[k]; if (!Array.isArray(a)) continue; if (!a.length) { r[k] = EMPTY; continue; } for (const t of a) if (t && typeof t.road === 'string') t.road = I(t.road); }
  for (const k of ['joinA', 'joinB']) if (r[k] && typeof r[k].road === 'string') r[k].road = I(r[k].road);
}
// the core chunk's net roads and every region's road lines, in place; returns the core
export function slimCore(core) {
  if (!core) return core; const I = interner();
  for (const r of core.net?.roads || []) slimRoad(r, I);
  for (const R of [core.region, ...(core.regions || [])]) for (const r of R?.roads || []) slimRoad(r, I);
  return core;
}
