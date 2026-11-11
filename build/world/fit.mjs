// Fit the streets to the gaps between the map's buildings (WLD-33, docs/IMPROVEMENTS-2026-11-11.md 3.5). The map's residential streets carry no width:
// the compiler gave every two-way one 12.3 m (two 3.75 m lanes and the motorway's 2.4 m shoulders, roads.mjs halfOf), and the map's lines and outlines
// come from different surveys, a few metres apart. 129,041 real buildings stood on a carriageway. This step, between the compiler and grade.mjs:
//   1. moves a residential line toward the middle of the gap between the walls on its two sides (at most SHIFT m, smoothed along the line, never at its
//      ends, at a sample another line meets, or on a bridge or in a tunnel, so every junction stays where it was);
//   2. gives it the width of a Korean side street (two 3.0 m lanes with 0.25 m edges, 3.5 m one-way), or less where the walls are nearer (CLEAR from the
//      wall, measured at the 10th percentile along the line so one bay window does not decide);
//   3. marks a line with less than MIN half width left, or less than PASS m between the walls anywhere along it, an alley: paved for walkers, no road
//      for cars (src/worldnav.js leaves it out).
// The walls are those of buildings.bin (the real outlines; the procedural buildings were set back from the old widths and are placed again after this).
// usage: node --max-old-space-size=12000 build/world/fit.mjs [region dir]   rewrites region-raw.bin (the compiler's copy kept as region-prefit.bin); run
// grade.mjs, blocks.mjs and streets.mjs after it
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { readRegion } from './emit.mjs';
import { readBuildings } from './blocks.mjs';
import { wallIndex, REACH } from './corridor.mjs';
import { encodeChunk } from '../../src/bakefmt.js';

export const WANT = { two: 3.25, one: 1.75 }, CLEAR = 0.3, MIN = 1.5, PASS = 3, ALLEY = 1.25, SHIFT = 3, WINDOW = 10, TAPER = 15, STEP = 4;
export const FIT_VERSION = 1;
const pct = (a, p) => { if (!a.length) return NaN; const s = Float64Array.from(a).sort(); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

// fit R's residential lines in place to the walls of W (corridor.mjs wallIndex). Returns the counts
export function fitStreets(R, W) {
  const st = { lines: 0, moved: 0, shiftKm: 0, narrowed: 0, alleys: 0, pinched: 0, alleyKm: 0, km: 0 };
  // the samples other lines end on: they must not move
  const pinned = new Set(); for (const r of R.roads) for (const [lj, i] of [...(r.next || []), ...(r.prev || [])]) pinned.add(lj + ':' + i);
  R.roads.forEach((r, ri) => {
    if (r.hw !== 'residential') return;
    const n = r.x.length; if (n < 2) return; st.lines++;
    const want = r.oneway ? WANT.one : WANT.two, clear = want + CLEAR;
    // arc length, and the direction at every sample
    const s = new Float64Array(n), tx = new Float64Array(n), tz = new Float64Array(n);
    for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(r.x[i] - r.x[i - 1], r.z[i] - r.z[i - 1]);
    for (let i = 0; i < n; i++) { const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1), dx = r.x[b] - r.x[a], dz = r.z[b] - r.z[a], l = Math.hypot(dx, dz) || 1; tx[i] = dx / l; tz[i] = dz / l; }
    // 1. the wanted move at each sample, to the right of the direction (-tz, tx) as corridor.mjs measures it; NaN inside a building (no gap seen from there)
    const want0 = new Float64Array(n), fixed = [];
    for (let i = 0; i < n; i++) {
      if (r.cls[i] || i === 0 || i === n - 1 || pinned.has(ri + ':' + i)) { want0[i] = 0; fixed.push(s[i]); continue; }
      const x = r.x[i], z = r.z[i];
      if (W.which(x, z) >= 0) { want0[i] = NaN; continue; }
      const l = W.ray(x, z, tz[i], -tx[i]), rr = W.ray(x, z, -tz[i], tx[i]);
      let o = 0;
      if (l + rr >= 2 * clear) o = l < clear ? clear - l : rr < clear ? -(clear - rr) : 0;
      else if (l < REACH || rr < REACH) o = (rr - l) / 2;
      want0[i] = Math.max(-SHIFT, Math.min(SHIFT, o));
    }
    // smoothed over WINDOW m each way, faded to nothing TAPER m from a fixed sample
    const o = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0, c = 0; for (let j = i; j >= 0 && s[i] - s[j] <= WINDOW; j--) if (want0[j] === want0[j]) { sum += want0[j]; c++; }
      for (let j = i + 1; j < n && s[j] - s[i] <= WINDOW; j++) if (want0[j] === want0[j]) { sum += want0[j]; c++; }
      let near = Infinity; for (const f of fixed) near = Math.min(near, Math.abs(s[i] - f));
      o[i] = c ? (sum / c) * Math.min(1, near / TAPER) : 0;
    }
    let movedHere = 0; for (let i = 0; i < n; i++) if (Math.abs(o[i]) > 0.05) { r.x[i] += -tz[i] * o[i]; r.z[i] += tx[i] * o[i]; movedHere = Math.max(movedHere, Math.abs(o[i])); }
    if (movedHere > 0.05) { st.moved++; st.shiftKm += s[n - 1] / 1000; }
    // 2. the width the walls leave along the moved line (ground samples every STEP m)
    const sides = []; let len = 0, pinch = 0;
    for (let i = 0; i + 1 < n; i++) {
      if (r.cls[i] || r.cls[i + 1]) continue;
      const ax = r.x[i], az = r.z[i], dx = r.x[i + 1] - ax, dz = r.z[i + 1] - az, L = Math.hypot(dx, dz); if (L < 0.5) continue;
      const ux = dx / L, uz = dz / L, m = Math.max(1, Math.round(L / STEP)); len += L;
      for (let k = 0; k < m; k++) {
        const x = ax + dx * (k + 0.5) / m, z = az + dz * (k + 0.5) / m, inB = W.which(x, z) >= 0, l = inB ? 0 : W.ray(x, z, uz, -ux), rr = inB ? 0 : W.ray(x, z, -uz, ux);
        sides.push(Math.min(l, rr)); if (l + rr < PASS) pinch++;
      }
    }
    st.km += len / 1000;
    const free = sides.length ? pct(sides, 0.1) : REACH, half = Math.min(want, free - CLEAR);
    // a car needs PASS m between the walls all along the line: one pinch (a corner the map draws into the street) closes it to cars as surely as a narrow line
    if (half < MIN || pinch) { r.half = ALLEY; r.alley = 1; st.alleys++; if (half >= MIN) st.pinched++; st.alleyKm += len / 1000; }
    else { r.half = +half.toFixed(2); if (half < want - 1e-6) st.narrowed++; }
    r.fit = FIT_VERSION;
  });
  for (const k of ['shiftKm', 'alleyKm', 'km']) st[k] = +st[k].toFixed(1);
  return st;
}

// after grade.mjs has moved the lines again (its snap and fuse steps, up to 6.5 m): a fitted residential line that now runs where the walls leave under
// PASS m becomes an alley too, the same rule as fitStreets step 2. Returns the number of lines changed
export function recheckPinches(R, W) {
  let n = 0;
  for (const r of R.roads) {
    if (r.hw !== 'residential' || !r.fit || r.alley) continue;
    let pinch = false;
    for (let i = 0; i + 1 < r.x.length && !pinch; i++) {
      if (r.cls[i] || r.cls[i + 1]) continue;
      const ax = r.x[i], az = r.z[i], dx = r.x[i + 1] - ax, dz = r.z[i + 1] - az, L = Math.hypot(dx, dz); if (L < 0.5) continue;
      const ux = dx / L, uz = dz / L, m = Math.max(1, Math.round(L / STEP));
      for (let k = 0; k < m && !pinch; k++) {
        const x = ax + dx * (k + 0.5) / m, z = az + dz * (k + 0.5) / m;
        pinch = W.which(x, z) >= 0 || W.ray(x, z, uz, -ux) + W.ray(x, z, -uz, ux) < PASS;
      }
    }
    if (pinch) { r.half = ALLEY; r.alley = 1; n++; }
  }
  return n;
}

// ---- command line
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const dir = process.argv[2] || path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'baked', 'world', 'capital');
  const raw = path.join(dir, 'region-raw.bin'), pre = path.join(dir, 'region-prefit.bin'), bfile = path.join(dir, 'buildings.bin');
  // always from the compiler's output: a fitted region fitted again would drift. A raw copy with no fitted line is a new compile's (grade.mjs copied it)
  if (!fs.existsSync(raw)) { console.error('no region-raw.bin in ' + dir + ' (run grade.mjs once after compiling)'); process.exit(1); }
  if (!fs.existsSync(pre) || !readRegion(raw).roads.some((r) => r.fit)) fs.copyFileSync(raw, pre);
  const R = readRegion(pre), B = readBuildings(bfile);
  if (!R || !B) { console.error('no region or buildings in ' + dir); process.exit(1); }
  const t0 = Date.now(), st = fitStreets(R, wallIndex(B));
  fs.writeFileSync(raw, zlib.deflateRawSync(encodeChunk(R), { level: 9 }));
  // grade.mjs grades the raw copy when region.bin says it is graded: make sure it does
  const cur = readRegion(path.join(dir, 'region.bin')); if (cur && !cur.graded) fs.copyFileSync(raw, path.join(dir, 'region.bin'));
  st.seconds = (Date.now() - t0) / 1000; fs.writeFileSync(path.join(dir, 'fit-stats.json'), JSON.stringify(st)); console.log(JSON.stringify(st));
}
