import * as THREE from 'three';
import { landHeight } from './landfn.js';
import { nightU } from './shaders.js';

// The procedural buildings of the capital region (WLD-24a, ADR-0039), drawn and made solid. The baked chunk `bld/<ti>_<tj>` holds one 512 m tile of
// rotated rectangles (centre, width, depth, turn, floors, kind, an optional notched corner); this file turns the tiles around the player into one merged
// mesh each and, within a short walk, into solid boxes. A tile is built a little every frame (a few ms), so no frame stalls. One lit material with a
// window pattern drawn in its fragment shader (cells of the wall coordinate; at night a share of the windows glows), so the buildings need no texture,
// and the material exists from the start (a placeholder in the scene) so that no program is compiled while playing (ARCHITECTURE.md section 3).
const TILE = 512, OFF = 256;
const KCOL = [[0.80, 0.70, 0.56], [0.72, 0.50, 0.40], [0.72, 0.71, 0.67], [0.56, 0.66, 0.78], [0.85, 0.85, 0.81], [0.60, 0.64, 0.61], [0.50, 0.66, 0.80]];   // house villa shop office apartment industrial tower
const FLH = [2.9, 2.9, 3.6, 3.9, 2.9, 6.0, 3.9];    // storey height by kind (metres)
const CWIN = [3.0, 3.0, 3.6, 3.4, 3.2, 9.0, 3.4];   // width of one window bay by kind
const GLASS = [0, 0, 0, 2, 0, 0, 2];                // 2: a curtain wall (wide glass bands), 1: punched windows
const FOUND = 1.2;                                  // a wall goes this far below the lowest ground at its corners, so a slope shows no gap
const hash = (a, b) => { let h = Math.imul(a, 0x27d4eb2d) ^ Math.imul(b + 1, 0x165667b1); h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// the rectangles (in the building's own axes: u along the width, v along the depth) that make up its footprint: one, or two for an L
export function footprint(w, d, notch) {
  const hw = w / 2, hd = d / 2;
  if (!notch) return [[-hw, hw, -hd, hd]];
  const c = notch >> 6, f = Math.min(0.45, Math.max(0.12, (notch & 63) / 64)), fw = w * f, fd = d * f, su = c === 1 || c === 2 ? 1 : -1, sv = c >= 2 ? 1 : -1;
  return [[-hw, hw, sv < 0 ? -hd + fd : -hd, sv < 0 ? hd : hd - fd], [su < 0 ? -hw + fw : -hw, su < 0 ? hw : hw - fw, sv < 0 ? -hd : hd - fd, sv < 0 ? -hd + fd : hd]];
}

function makeMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.FrontSide });
  m.onBeforeCompile = (s) => {
    s.uniforms.uNight = nightU;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aWin;\nvarying vec4 vWin;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWin = aWin;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying vec4 vWin;\nfloat bwin = 0.0; float blit = 0.0;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vWin.z > 0.5) {
          vec2 f = fract(vWin.xy), id = floor(vWin.xy), lo = vWin.z > 1.5 ? vec2(0.03, 0.14) : vec2(0.22, 0.2);
          bwin = step(lo.x, f.x) * step(f.x, 1.0 - lo.x) * step(lo.y, f.y) * step(f.y, 1.0 - lo.y);
          float h = fract(sin(dot(id + vWin.w * 37.0, vec2(12.9898, 78.233))) * 43758.5453);
          blit = step(0.72, h) * uNight;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.10, 0.15, 0.21), bwin * 0.9);
        }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += bwin * blit * vec3(1.0, 0.74, 0.4) * 0.65;');
  };
  m.customProgramCacheKey = () => 'realbuildings';
  return m;
}

// one tile built a slice at a time: step(ms) returns true when it is done
class TileBuild {
  constructor(key, ti, tj, t) {
    this.key = key; this.ti = ti; this.tj = tj; this.t = t; this.q = 0; this.p = 0; this.n = t.n;
    this.ox = (ti - OFF) * TILE + TILE / 2; this.oz = (tj - OFF) * TILE + TILE / 2;
    // the real outlines (WLD-24h): a wall quad per edge and the roof's own vertices, after the procedural boxes
    this.pn = t.pn || 0; const pv = this.pn ? t.ro[t.pr[this.pn]] : 0;
    const cap = t.n * 2 * 20 + pv * 5;   // an L is two boxes of five faces
    this.pos = new Float32Array(cap * 3); this.nor = new Float32Array(cap * 3); this.col = new Float32Array(cap * 3); this.win = new Float32Array(cap * 4); this.idx = new Uint32Array(t.n * 2 * 30 + pv * 9);
    this.nv = 0; this.ni = 0; this.base = new Float32Array(t.n); this.pbase = new Float32Array(this.pn); this.roofs = new Array(this.pn);   // the lowest ground under each building (colliders start there)
  }
  quad(a, b, c, d, nx, ny, nz, col, wa, wb, wc, wd, kind, seed) {
    const P = this.pos, N = this.nor, C = this.col, W = this.win, v0 = this.nv;
    [a, b, c, d].forEach((p, i) => {
      const o = (v0 + i) * 3; P[o] = p[0]; P[o + 1] = p[1]; P[o + 2] = p[2]; N[o] = nx; N[o + 1] = ny; N[o + 2] = nz; C[o] = col[0]; C[o + 1] = col[1]; C[o + 2] = col[2];
      const w = [wa, wb, wc, wd][i], q = (v0 + i) * 4; W[q] = w[0]; W[q + 1] = w[1]; W[q + 2] = kind; W[q + 3] = seed;
    });
    // winding: the triangle's own normal must agree with the one asked for
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2], e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
    const tx = e1y * e2z - e1z * e2y, ty = e1z * e2x - e1x * e2z, tz = e1x * e2y - e1y * e2x, I = this.idx, k = this.ni;
    if (tx * nx + ty * ny + tz * nz >= 0) { I[k] = v0; I[k + 1] = v0 + 1; I[k + 2] = v0 + 2; I[k + 3] = v0; I[k + 4] = v0 + 2; I[k + 5] = v0 + 3; }
    else { I[k] = v0; I[k + 1] = v0 + 2; I[k + 2] = v0 + 1; I[k + 3] = v0; I[k + 4] = v0 + 3; I[k + 5] = v0 + 2; }
    this.nv += 4; this.ni += 6;
  }
  step(ms) {
    const t0 = performance.now(), T = this.t;
    while (this.q < this.n) {
      const q = this.q++, kind = T.kind[q], fl = Math.max(1, T.fl[q]), w = T.w[q] / 10, d = T.d[q] / 10, rot = T.rot[q] / 65535 * Math.PI;
      const cx = T.cx[q] / 10, cz = T.cz[q] / 10, ux = Math.cos(rot), uz = Math.sin(rot), vx = -uz, vz = ux;
      const gx = this.ox + cx, gz = this.oz + cz, rects = footprint(w, d, T.notch[q]);
      let low = Infinity;
      for (const [u0, u1, v0, v1] of rects) for (const [su, sv] of [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]) low = Math.min(low, landHeight(gx + ux * su + vx * sv, gz + uz * su + vz * sv, 8));
      const base = low, y0 = base - FOUND, fh = FLH[kind], y1 = base + fl * fh + 0.4, seed = hash(this.ti * 1024 + this.tj, q), cw = CWIN[kind];
      const tint = 0.9 + 0.2 * hash(q, this.ti * 7 + this.tj), c = KCOL[kind], col = [c[0] * tint, c[1] * tint, c[2] * tint], roof = [col[0] * 0.62, col[1] * 0.62, col[2] * 0.62];
      this.base[q] = base;
      const wk = GLASS[kind] || 1;
      for (const [u0, u1, v0, v1] of rects) {
        const P = (u, v, y) => [cx + ux * u + vx * v, y, cz + uz * u + vz * v];
        // roof, then the four walls (outward normal of each: the box's own axis)
        this.quad(P(u0, v0, y1), P(u1, v0, y1), P(u1, v1, y1), P(u0, v1, y1), 0, 1, 0, roof, [0, 0], [0, 0], [0, 0], [0, 0], 0, seed);
        const wall = (a, b, nx, nz, ua, ub) => this.quad(a, b, [b[0], y1, b[2]], [a[0], y1, a[2]], nx, 0, nz, col, [ua / cw, (y0 - base) / fh], [ub / cw, (y0 - base) / fh], [ub / cw, (y1 - base) / fh], [ua / cw, (y1 - base) / fh], wk, seed);
        const dot_u = (x, z) => (this.ox + x) * ux + (this.oz + z) * uz, dot_v = (x, z) => (this.ox + x) * vx + (this.oz + z) * vz;
        let a, b;
        a = P(u0, v0, y0); b = P(u1, v0, y0); wall(a, b, -vx, -vz, dot_u(a[0], a[2]), dot_u(b[0], b[2]));
        a = P(u1, v0, y0); b = P(u1, v1, y0); wall(a, b, ux, uz, dot_v(a[0], a[2]), dot_v(b[0], b[2]));
        a = P(u1, v1, y0); b = P(u0, v1, y0); wall(a, b, vx, vz, dot_u(a[0], a[2]), dot_u(b[0], b[2]));
        a = P(u0, v1, y0); b = P(u0, v0, y0); wall(a, b, -ux, -uz, dot_v(a[0], a[2]), dot_v(b[0], b[2]));
      }
      if ((this.q & 15) === 0 && performance.now() - t0 > ms) break;
    }
    if (this.q < this.n) return false;
    while (this.p < this.pn) { this.poly(this.p++); if ((this.p & 7) === 0 && performance.now() - t0 > ms) break; }
    return this.p >= this.pn;
  }
  // one real building: walls along every ring (outer and courtyards), a flat roof over the outline with its holes, windows by its real storey count
  poly(q) {
    const T = this.t, rings = [];
    for (let r = T.pr[q]; r < T.pr[q + 1]; r++) { const ring = []; for (let v = T.ro[r]; v < T.ro[r + 1]; v++) ring.push([T.px[v] / 10, T.pz[v] / 10]); rings.push(ring); }
    let low = Infinity; const o = rings[0], st = Math.max(1, Math.floor(o.length / 12));
    for (let v = 0; v < o.length; v += st) low = Math.min(low, landHeight(this.ox + o[v][0], this.oz + o[v][1], 8));
    const kind = T.pk[q], h = T.ph[q] / 10, b0 = T.pb[q] / 10, fl = Math.max(1, T.pfl[q]), base = low, y0 = b0 > 0.5 ? base + b0 : base - FOUND, y1 = base + Math.max(h, b0 + 2.5);
    const fh = Math.max(2.4, (h - b0) / fl), cw = CWIN[kind], wk = GLASS[kind] || 1, seed = hash(this.ti * 1024 + this.tj, 100000 + q);
    const tint = 0.9 + 0.2 * hash(q + 7, this.ti * 7 + this.tj), c = KCOL[kind], col = [c[0] * tint, c[1] * tint, c[2] * tint], roof = [col[0] * 0.62, col[1] * 0.62, col[2] * 0.62];
    this.pbase[q] = base;
    rings.forEach((ring, ri) => {
      // the outward side of each edge: shoelace sign of the ring, turned round for a courtyard (its walls face into the hole)
      let a2 = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a2 += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      const s = (a2 > 0 ? 1 : -1) * (ri ? -1 : 1); let u = 0;
      for (let i = 0; i < ring.length; i++) {
        const A = ring[i], B = ring[(i + 1) % ring.length], dx = B[0] - A[0], dz = B[1] - A[1], l = Math.hypot(dx, dz); if (l < 0.05) continue;
        const nx = s * dz / l, nz = -s * dx / l, va = (y0 - base - b0) / fh, vb = (y1 - base - b0) / fh;
        this.quad([A[0], y0, A[1]], [B[0], y0, B[1]], [B[0], y1, B[1]], [A[0], y1, A[1]], nx, 0, nz, col, [u / cw, va], [(u + l) / cw, va], [(u + l) / cw, vb], [u / cw, vb], wk, seed);
        u += l;
      }
    });
    // the roof: triangulated once and kept for the colliders
    const V2 = (p) => new THREE.Vector2(p[0], p[1]), faces = THREE.ShapeUtils.triangulateShape(o.map(V2), rings.slice(1).map((r) => r.map(V2))), all = rings.flat();
    this.roofs[q] = { all, faces, y0: b0 > 0.5 ? base + b0 : base - FOUND, y1 };
    const P = this.pos, N = this.nor, C = this.col, W = this.win, I = this.idx, v0 = this.nv;
    all.forEach((p, i) => { const k = (v0 + i) * 3; P[k] = p[0]; P[k + 1] = y1; P[k + 2] = p[1]; N[k] = 0; N[k + 1] = 1; N[k + 2] = 0; C[k] = roof[0]; C[k + 1] = roof[1]; C[k + 2] = roof[2]; const w = (v0 + i) * 4; W[w] = 0; W[w + 1] = 0; W[w + 2] = 0; W[w + 3] = seed; });
    for (const f of faces) {
      // up-facing winding (x right, z down in the plane: counter-clockwise seen from above is negative shoelace)
      const a = all[f[0]], b = all[f[1]], c2 = all[f[2]], cr = (b[0] - a[0]) * (c2[1] - a[1]) - (b[1] - a[1]) * (c2[0] - a[0]), k = this.ni;
      if (cr < 0) { I[k] = v0 + f[0]; I[k + 1] = v0 + f[1]; I[k + 2] = v0 + f[2]; } else { I[k] = v0 + f[0]; I[k + 1] = v0 + f[2]; I[k + 2] = v0 + f[1]; }
      this.ni += 3;
    }
    this.nv += all.length;
  }
  geometry() {
    const g = new THREE.BufferGeometry(), nv = this.nv;
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, nv * 3), 3)); g.setAttribute('normal', new THREE.BufferAttribute(this.nor.slice(0, nv * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, nv * 3), 3)); g.setAttribute('aWin', new THREE.BufferAttribute(this.win.slice(0, nv * 4), 4));
    g.setIndex(new THREE.BufferAttribute(this.idx.slice(0, this.ni), 1)); g.computeBoundingSphere(); g.computeBoundingBox();
    // x and z are in the tile's frame (the mesh sits at the tile centre), y is absolute
    return g;
  }
}

// the uid of a real building from its stored OSM id (ways positive, relations negative, a relation's piece k above 2^34: OSM-r123-k; ADR-0042)
export function osmUid(pid) { const a = Math.abs(pid), k = Math.floor(a / 2 ** 34); return `OSM-${pid < 0 ? 'r' : 'w'}${a - k * 2 ** 34}${k ? '-' + k : ''}`; }

export class RealBuildings {
  constructor(scene, phys, G, wd = globalThis.__WORLD) {
    this.scene = scene; this.phys = phys; this.G = G; this.wd = wd; this.tiles = new Map(); this.index = new Map(); this.cols = new Map(); this.t = 0; this.last = -9; this.lastCol = -9; this.jobs = [];
    const high = globalThis.__DETAIL === 'high', simple = !!G?.eng?.q?.simple;
    this.R = simple ? 900 : high ? 2200 : 1500;   // how far tiles are drawn; they sit in the fog beyond it anyway
    this.RC = 220;                                 // buildings this close to the player (or what he drives) are solid
    this.stats = { tiles: 0, buildings: 0, solid: 0, building: 0 };
    for (const k of wd?.keys('bld/') || []) { const [ti, tj] = k.slice(4).split('_').map(Number); this.index.set(ti * 4096 + tj, { key: k, ti, tj }); }
    this.mat = makeMaterial(); this.group = new THREE.Group(); this.group.name = 'realbuildings'; scene.add(this.group);
    // a placeholder with the same attributes: the first frame of the loading warm-up compiles the material (and its shadow program) for all later tiles
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9), 3)); g.setAttribute('aWin', new THREE.BufferAttribute(new Float32Array(12), 4));
    this.warm = new THREE.Mesh(g, this.mat); this.warm.frustumCulled = false; this.warm.castShadow = true; this.warm.position.set(0, -400, 0); this.group.add(this.warm);
  }
  get have() { return this.index.size > 0; }
  wanted(fx, fz) {
    const out = [], R = this.R, i0 = Math.floor((fx - R) / TILE) + OFF, i1 = Math.floor((fx + R) / TILE) + OFF, j0 = Math.floor((fz - R) / TILE) + OFF, j1 = Math.floor((fz + R) / TILE) + OFF;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const e = this.index.get(i * 4096 + j); if (!e) continue;
      const cx = (i - OFF) * TILE + TILE / 2, cz = (j - OFF) * TILE + TILE / 2, dx = Math.max(Math.abs(fx - cx) - TILE / 2, 0), dz = Math.max(Math.abs(fz - cz) - TILE / 2, 0);
      if (dx * dx + dz * dz <= R * R) out.push({ e, d: dx * dx + dz * dz });
    }
    return out.sort((a, b) => a.d - b.d);
  }
  update(dt, cam, focus) {
    if (!this.have) return;
    this.t += dt;
    // the build queue: the nearest unfinished tile first, a few ms a frame
    if (this.jobs.length) { const j = this.jobs[0]; if (j.step(3)) { this.jobs.shift(); this.finish(j); } }
    if (this.t - this.last >= 0.4) {
      this.last = this.t;
      const want = this.wanted(focus.x, focus.z), keep = new Set();
      for (const { e } of want) {
        keep.add(e.ti * 4096 + e.tj);
        const id = e.ti * 4096 + e.tj; if (this.tiles.has(id)) continue;
        const rec = { e, state: 'loading', mesh: null }; this.tiles.set(id, rec);
        this.wd.get(e.key).then((chunk) => { if (this.tiles.get(id) !== rec) return; rec.chunk = chunk; rec.state = 'building'; const b = new TileBuild(e.key, e.ti, e.tj, chunk); rec.build = b; this.jobs.push(b); }, (err) => { rec.state = 'failed'; console.warn('realbuildings', e.key, err); });
      }
      for (const [id, rec] of this.tiles) {
        const cx = (rec.e.ti - OFF) * TILE + TILE / 2, cz = (rec.e.tj - OFF) * TILE + TILE / 2, d = Math.hypot(focus.x - cx, focus.z - cz);
        if (!keep.has(id) && d > this.R + 450) this.drop(id, rec);
        else if (rec.mesh) rec.mesh.castShadow = d < 420;
      }
      this.stats.tiles = this.tiles.size;
    }
    if (this.t - this.lastCol >= 0.25) { this.lastCol = this.t; this.solid(focus); }
  }
  finish(b) {
    const id = b.ti * 4096 + b.tj, rec = this.tiles.get(id); if (!rec || rec.build !== b) return;
    const mesh = new THREE.Mesh(b.geometry(), this.mat); mesh.position.set(b.ox, 0, b.oz); mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mesh.receiveShadow = true; mesh.castShadow = false; mesh.name = 'bld ' + b.key;
    rec.mesh = mesh; rec.state = 'ready'; rec.base = b.base; rec.roofs = b.roofs; rec.build = null; this.group.add(mesh);
    this.stats.buildings += b.n + b.pn;
  }
  drop(id, rec) {
    if (rec.mesh) { this.group.remove(rec.mesh); rec.mesh.geometry.dispose(); this.stats.buildings -= (rec.chunk?.n || 0) + (rec.chunk?.pn || 0); }
    if (rec.build) { const i = this.jobs.indexOf(rec.build); if (i >= 0) this.jobs.splice(i, 1); }
    for (const [k, parts] of this.cols) if ((k / 16384 | 0) === id) { this.release(parts); this.cols.delete(k); }
    this.tiles.delete(id); this.wd.drop(rec.e.key);
  }
  // solid boxes for the buildings within a short distance of the focus, made a few hundred at a time and let go when it moves away
  solid(focus) {
    const RC = this.RC, keepR = RC + 70, fx = focus.x, fz = focus.z, seen = new Set(); let made = 0;
    for (const [id, rec] of this.tiles) {
      if (rec.state !== 'ready') continue;
      const cx = (rec.e.ti - OFF) * TILE + TILE / 2, cz = (rec.e.tj - OFF) * TILE + TILE / 2; if (Math.hypot(fx - cx, fz - cz) > keepR + TILE * 0.72) continue;
      const T = rec.chunk;
      for (let q = 0; q < T.n; q++) {
        const bx = cx + T.cx[q] / 10, bz = cz + T.cz[q] / 10, dx = bx - fx, dz = bz - fz, r = Math.hypot(T.w[q], T.d[q]) / 20, dd = Math.hypot(dx, dz) - r;
        if (dd > keepR) continue;
        const key = id * 16384 + q; seen.add(key);
        if (dd > RC || this.cols.has(key) || made >= 300) continue;
        made++; this.makeSolid(key, rec, q, bx, bz);
      }
      // the real outlines: keyed after the boxes (8192 up), near when any corner of the outline is
      for (let q = 0; q < (T.pn || 0); q++) {
        const R0 = rec.roofs[q]; if (!R0) continue;
        let dd = Infinity; for (const p of R0.all) dd = Math.min(dd, Math.hypot(cx + p[0] - fx, cz + p[1] - fz));
        if (dd > keepR) continue;
        const key = id * 16384 + 8192 + q; seen.add(key);
        if (dd > RC || this.cols.has(key) || made >= 300) continue;
        made++; this.makeHulls(key, rec, q, cx, cz);
      }
    }
    for (const [k, parts] of this.cols) if (!seen.has(k)) { this.release(parts); this.cols.delete(k); }
    this.stats.solid = this.cols.size;
  }
  makeSolid(key, rec, q, bx, bz) {
    const T = rec.chunk, kind = T.kind[q], fl = Math.max(1, T.fl[q]), w = T.w[q] / 10, d = T.d[q] / 10, rot = T.rot[q] / 65535 * Math.PI, ux = Math.cos(rot), uz = Math.sin(rot), vx = -uz, vz = ux;
    const base = rec.base[q], y0 = base - FOUND, y1 = base + fl * FLH[kind] + 0.4, hy = (y1 - y0) / 2, parts = [];
    for (const [u0, u1, v0, v1] of footprint(w, d, T.notch[q])) {
      const mu = (u0 + u1) / 2, mv = (v0 + v1) / 2, x = bx + ux * mu + vx * mv, z = bz + uz * mu + vz * mv, hx = (u1 - u0) / 2, hz = (v1 - v0) / 2;
      // the half-extents are about the building's own axes; Rapier turns about +y the other way round, hence -rot
      parts.push(this.phys.addYawBox(x, y0 + hy, z, hx, hy, hz, -rot, { tag: 'building', kind: 0, x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz, y0, h: y1, uid: `KR-${rec.e.key}-${q}` }));
    }
    this.cols.set(key, parts);
  }
  // a real outline as convex prisms, one per roof triangle (the outline may be any shape; a prism is always convex)
  makeHulls(key, rec, q, cx, cz) {
    const R0 = rec.roofs[q], parts = [], uid = osmUid(rec.chunk.pid[q]);
    for (const f of R0.faces) {
      const pts = new Float32Array(18); let k = 0;
      for (const y of [R0.y0, R0.y1]) for (const i of f) { const p = R0.all[i]; pts[k++] = cx + p[0]; pts[k++] = y; pts[k++] = cz + p[1]; }
      const ref = this.phys.addHull(pts, { tag: 'building', kind: 0, x0: cx + R0.all[f[0]][0], x1: cx + R0.all[f[0]][0], z0: cz + R0.all[f[0]][1], z1: cz + R0.all[f[0]][1], y0: R0.y0, h: R0.y1, uid });
      if (ref) parts.push(ref);
    }
    this.cols.set(key, parts);
  }
  release(parts) { for (const b of parts) this.phys.removeBox(b); }
}
