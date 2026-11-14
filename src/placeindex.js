// The country's places of interest (EV-72): fuel stations, convenience stores, supermarkets, restaurants, cafes, banks, hospitals, pharmacies,
// police and fire stations, garages, bus terminals, hotels and schools, from OpenStreetMap (build/world/poi-extract.py, placeindex.mjs). The jobs
// and missions send the player to them anywhere in the country, not only to the capital's grid. world/places.bin is read once after the boot (it
// is not needed to start) and kept as typed arrays: a 2,048 m cell index over positions sorted by cell, kinds as bytes and the names as one UTF-8
// block decoded only when a name is asked for. Pure apart from loadPlaces (fetch); the bake uses encodePlaces.
export const PLACE_KINDS = ['fuel', 'convenience', 'supermarket', 'food', 'cafe', 'bank', 'hospital', 'pharmacy', 'police', 'fire', 'car_repair', 'bus_station', 'hotel', 'school'];
// what the player reads for a place with no name of its own
export const KIND_LABEL = ['주유소', '편의점', '마트', '식당', '카페', '은행', '병원', '약국', '경찰서', '소방서', '정비소', '버스터미널', '숙박', '학교'];
export const CELL = 2048;
const MAGIC = 0x31434c50;   // 'PLC1'
const cellKey = (x, z) => (Math.floor(x / CELL) + 32768) * 65536 + (Math.floor(z / CELL) + 32768);

// pack places [{ k: kind index, x, z, name }] (game metres) into the file's bytes: sorted by cell so a cell's places are one run
export function encodePlaces(list) {
  const P = list.slice().sort((a, b) => cellKey(a.x, a.z) - cellKey(b.x, b.z)), n = P.length, enc = new TextEncoder();
  const names = P.map((p) => enc.encode(p.name || '')), nb = names.reduce((s, b) => s + b.length, 0), pad = (4 - (n % 4)) % 4;
  const size = 12 + n * 8 + n + pad + (n + 1) * 4 + nb, buf = new ArrayBuffer(size), dv = new DataView(buf);
  dv.setUint32(0, MAGIC, true); dv.setUint32(4, n, true); dv.setUint32(8, PLACE_KINDS.length, true);
  const X = new Float32Array(buf, 12, n), Z = new Float32Array(buf, 12 + n * 4, n), K = new Uint8Array(buf, 12 + n * 8, n), O = new Uint32Array(buf, 12 + n * 9 + pad, n + 1), T = new Uint8Array(buf, 12 + n * 9 + pad + (n + 1) * 4, nb);
  let o = 0; P.forEach((p, i) => { X[i] = p.x; Z[i] = p.z; K[i] = p.k; O[i] = o; T.set(names[i], o); o += names[i].length; }); O[n] = o;
  return new Uint8Array(buf);
}

// the index over a file's bytes: queries by distance and kind, names on demand
export function decodePlaces(bytes) {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('places.bin: not a place index');
  const n = dv.getUint32(4, true), pad = (4 - (n % 4)) % 4;
  const X = new Float32Array(buf, 12, n), Z = new Float32Array(buf, 12 + n * 4, n), K = new Uint8Array(buf, 12 + n * 8, n), O = new Uint32Array(buf, 12 + n * 9 + pad, n + 1), T = new Uint8Array(buf, 12 + n * 9 + pad + (n + 1) * 4);
  // cell key -> [first, end) of its run (the places are sorted by cell)
  const runs = new Map(); for (let i = 0; i < n;) { const c = cellKey(X[i], Z[i]); let j = i + 1; while (j < n && cellKey(X[j], Z[j]) === c) j++; runs.set(c, [i, j]); i = j; }
  const dec = new TextDecoder();
  const I = {
    count: n,
    // the place i as an object (its name, or the kind's label when it has none)
    get(i) { const nm = dec.decode(T.subarray(O[i], O[i + 1])); return { i, x: X[i], z: Z[i], kind: PLACE_KINDS[K[i]], k: K[i], name: nm || KIND_LABEL[K[i]], named: !!nm }; },
    // the indices of the places within r of (x, z), of the kinds in `kinds` (a Set of kind names; all when absent), unsorted
    near(x, z, r, kinds) {
      const out = [], ks = kinds ? new Set([...kinds].map((k) => PLACE_KINDS.indexOf(k))) : null, r2 = r * r;
      const c0 = Math.floor((x - r) / CELL), c1 = Math.floor((x + r) / CELL), d0 = Math.floor((z - r) / CELL), d1 = Math.floor((z + r) / CELL);
      for (let cx = c0; cx <= c1; cx++) for (let cz = d0; cz <= d1; cz++) {
        const run = runs.get((cx + 32768) * 65536 + (cz + 32768)); if (!run) continue;
        for (let i = run[0]; i < run[1]; i++) if ((!ks || ks.has(K[i])) && (X[i] - x) ** 2 + (Z[i] - z) ** 2 <= r2) out.push(i);
      }
      return out;
    },
    // the nearest place of the kinds within max m (and beyond min m), or null
    nearest(x, z, kinds, max = 3000, min = 0) {
      let best = -1, bd = Infinity; for (const i of I.near(x, z, max, kinds)) { const d = (X[i] - x) ** 2 + (Z[i] - z) ** 2; if (d >= min * min && d < bd) { bd = d; best = i; } }
      return best < 0 ? null : I.get(best);
    },
    // a random place of the kinds between min and max m away (rnd: a 0..1 source, Math.random by default), or null
    pick(x, z, kinds, min, max, rnd = Math.random) {
      const l = I.near(x, z, max, kinds).filter((i) => (X[i] - x) ** 2 + (Z[i] - z) ** 2 >= min * min); return l.length ? I.get(l[Math.floor(rnd() * l.length)]) : null;
    },
    // how many places of each kind
    counts() { const c = Object.fromEntries(PLACE_KINDS.map((k) => [k, 0])); for (let i = 0; i < n; i++) c[PLACE_KINDS[K[i]]]++; return c; },
  };
  return I;
}

let INDEX = null, LOADING = null;
// the loaded index, or null until loadPlaces has finished (or when the build has no places.bin)
export function places() { return INDEX; }
// read world/places.bin once (later calls share the first); a missing file leaves places() null and the jobs on their old destinations
export function loadPlaces(url = 'world/places.bin') {
  if (!LOADING) LOADING = fetch(url).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => { if (b) INDEX = decodePlaces(new Uint8Array(b)); return INDEX; }).catch(() => null);
  return LOADING;
}
if (typeof window !== 'undefined') window.__places = { places, loadPlaces };   // test hook
