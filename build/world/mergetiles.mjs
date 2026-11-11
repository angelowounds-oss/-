// The building and street tiles of several compiled regions as one set (ADR-0044): the capital's and each province's (blocks.mjs, streets.mjs) are cut
// into the same 512 m tiles, and a tile on a seam between two regions holds records of both. The game reads one chunk per tile (realbuildings.js,
// streetscape.js), so the bake joins them here. A street tile names road lines by their index in its own region; src/region.js regionRoads joins the
// regions' lines capital first, then the provinces in order, so a province's indices move up by the lines before it.

// the fields of a tile, by the count they go with: [count field, per-record fields, offset fields (one more than the count, into the next group)]
const BLD = [['n', ['cx', 'cz', 'w', 'd', 'rot', 'fl', 'kind', 'notch']], ['pn', ['ph', 'pb', 'pfl', 'pk', 'ps', 'pid'], 'pr', 'ro', 'px']];
const STR = [['nj', ['jx', 'jz', 'jy', 'jf', 'jn'], 'jo', 'aang'], ['na', ['aang', 'ahalf', 'ameta', 'aw', 'atl', 'atr', 'aline', 'aarr', 'amark']],
  ['nr', ['rline', 'ri0', 'ri1', 'rw', 'rm', 'rta', 'rtb']], ['nf', ['ft', 'fx', 'fz', 'fy', 'fdir', 'fv']], ['nc', ['cx', 'cz', 'cy', 'cang', 'chalf', 'cwid', 'cf']]];

const cat = (a, b) => { const o = new a.constructor(a.length + b.length); o.set(a); o.set(b, a.length); return o; };
// an offset array (count + 1 entries) of b put after a's: a's without its end, then b's moved by what a holds
const catOff = (a, b, shift) => { const o = new a.constructor(a.length + b.length - 1); o.set(a.subarray(0, a.length - 1)); for (let k = 0; k < b.length; k++) o[a.length - 1 + k] = b[k] + shift; return o; };

// one tile with b's records after a's
function join(a, b, schema) {
  const t = { ...a };
  for (const [count, fields, off, inner, deep] of schema) {
    if (!b[count]) continue;
    if (!a[count]) { for (const f of [count, ...fields, off, inner, deep].filter(Boolean)) if (b[f] !== undefined) t[f] = b[f]; continue; }
    t[count] = a[count] + b[count];
    for (const f of fields) t[f] = cat(a[f], b[f]);
    if (off) t[off] = catOff(a[off], b[off], inner === 'aang' ? a.na : a[inner].length - 1);
    if (deep) { t[inner] = catOff(a[inner], b[inner], a[deep].length); t[deep] = cat(a[deep], b[deep]); t.pz = cat(a.pz, b.pz); }
  }
  return t;
}

// a province's street tile with its road indices moved up by `off`
function shiftLines(t, off) {
  if (!off) return t;
  const o = { ...t };
  if (t.aline) o.aline = Int32Array.from(t.aline, (v) => v + off);
  if (t.rline) o.rline = Int32Array.from(t.rline, (v) => v + off);
  return o;
}

// sets: [{ tiles, roadOff }] in region order (the capital first); kind 'bld' or 'str'. Returns the joined tiles, and how many tiles held more than one region
export function mergeTiles(sets, kind) {
  const schema = kind === 'bld' ? BLD : STR, out = {}; let shared = 0;
  for (const { tiles, roadOff = 0 } of sets) for (const [k, t0] of Object.entries(tiles || {})) {
    const t = kind === 'str' ? shiftLines(t0, roadOff) : t0;
    if (out[k]) { out[k] = join(out[k], t, schema); shared++; } else out[k] = t;
  }
  return { tiles: out, shared };
}

// the capital's and the provinces' building and street sets joined (the bake's job list and its workers must see the same tiles): `capital` the
// capital's region (or its road count), `provinces` the loaded province regions in src/region.js order (or { name, roads: count })
export async function joinedSets(root, capital, provinces) {
  const path = await import('node:path'), { readBuildings } = await import('./blocks.mjs'), { readStreets } = await import('./streets.mjs');
  const dir = (n) => path.join(root, 'build/baked/world', n), count = (R) => (typeof R?.roads === 'number' ? R.roads : R?.roads?.length || 0);
  let B = readBuildings(path.join(dir('capital'), 'buildings.bin')), S = readStreets(path.join(dir('capital'), 'streets.bin'));
  if (!provinces.length) return { B, S };
  let off = count(capital); const bs = [{ tiles: B?.tiles }], ss = [{ tiles: S?.tiles }];
  for (const R of provinces) {
    const b = readBuildings(path.join(dir(R.name), 'buildings.bin')), t = readStreets(path.join(dir(R.name), 'streets.bin'));
    if (b) bs.push({ tiles: b.tiles }); if (t) ss.push({ tiles: t.tiles, roadOff: off }); off += count(R);
  }
  const base = (T) => T || { tile: 512, off: 256, tiles: {} };
  if (bs.length > 1) B = { ...base(B), tiles: mergeTiles(bs, 'bld').tiles };
  if (ss.length > 1) S = { ...base(S), tiles: mergeTiles(ss, 'str').tiles };
  return { B, S };
}
