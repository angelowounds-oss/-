import * as THREE from 'three';
import { cities, farHeight, SEA } from './worldmap.js';
import { layouts, STYLES, KIND } from './citylayout.js';
import { GLSL_NOISE, nightU, timeUniform } from './shaders.js';
import { doorSpec, accentColor } from './world.js';

// The other cities as drawn places (ADR-0012 phase 4). citylayout.js has the plans; this file turns them into three levels of detail:
//   L0 (within NEAR m of the camera)   the capital's own facade shader on instanced boxes, one mesh per tile, made and dropped on demand,
//                                      with collision boxes within COLL m of the player and neon signs in the city's language
//   L1 (within MID m)                  one merged mesh per tile with a cheap window shader (vertex colours, hashed lit windows)
//   L2 (any distance)                  one merged mesh per city of the buildings taller than TALL m: the skyline
// L1 and L2 use one material (one program). Roads, parks, runways, container yards and cranes are a separate merged mesh per tile (always
// there while the tile is in range) because the L0 facades replace only the buildings. Tiles are TILE m squares relative to the city centre;
// every position is stored relative to the tile so Float32 stays exact 40 km from the origin.
const TILE = 600, NEAR = 650, NEAR_OFF = 850, MID = 6500, COLL = 420, COLL_OFF = 640, TALL = 30;
const lerp = (a, b, t) => a + (b - a) * t;

class Acc {
  constructor() { this.n = 0; this.v = 0; this.p = new Float32Array(3000); this.nr = new Float32Array(3000); this.c = new Float32Array(3000); this.k = new Float32Array(1000); this.idx = new Uint32Array(4500); this.ni = 0; }
  grow(nv, ni) {
    if ((this.v + nv) * 3 > this.p.length) { const l = Math.max(this.p.length * 2, (this.v + nv) * 3); for (const key of ['p', 'nr', 'c']) { const a = new Float32Array(l); a.set(this[key]); this[key] = a; } const k = new Float32Array(l / 3); k.set(this.k); this.k = k; }
    if (this.ni + ni > this.idx.length) { const a = new Uint32Array(Math.max(this.idx.length * 2, this.ni + ni)); a.set(this.idx); this.idx = a; }
  }
  quad(a, b, c, d, nx, ny, nz, col, kk) {
    this.grow(4, 6); const v = this.v;
    [a, b, c, d].forEach((q, i) => { const o = (v + i) * 3; this.p[o] = q[0]; this.p[o + 1] = q[1]; this.p[o + 2] = q[2]; this.nr[o] = nx; this.nr[o + 1] = ny; this.nr[o + 2] = nz; this.c[o] = col[0]; this.c[o + 1] = col[1]; this.c[o + 2] = col[2]; this.k[v + i] = kk; });
    this.idx.set([v, v + 1, v + 2, v, v + 2, v + 3], this.ni); this.ni += 6; this.v += 4;
  }
  // an axis-aligned box [x0,x1]x[y0,y1]x[z0,z1] without its bottom face; `kk` > 0 gives the walls windows (value = seed)
  box(x0, y0, z0, x1, y1, z1, col, kk, roof) {
    const r = roof || col, rc = [col[0] * 0.9, col[1] * 0.9, col[2] * 0.9];
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1, col, kk);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, -1, rc, kk);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 1, 0, 0, col, kk);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -1, 0, 0, rc, kk);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 1, 0, r, 0);
  }
  flat(x0, z0, x1, z1, y, col, kk = 0) { this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], 0, 1, 0, col, kk); }
  get empty() { return this.v === 0; }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p.slice(0, this.v * 3), 3)); g.setAttribute('normal', new THREE.BufferAttribute(this.nr.slice(0, this.v * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.c.slice(0, this.v * 3), 3)); g.setAttribute('aK', new THREE.BufferAttribute(this.k.slice(0, this.v), 1));
    g.setIndex(new THREE.BufferAttribute(this.idx.slice(0, this.ni), 1)); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.castShadow = false; m.receiveShadow = false; return m;
  }
}
const rgb = (hex, k = 1) => [((hex >> 16) & 255) / 255 * k, ((hex >> 8) & 255) / 255 * k, (hex & 255) / 255 * k];
const hash = (n) => { let h = Math.imul(Math.floor(n * 1000) | 0, 0x9e3779b1); h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };

// the volumes of building `i` of layout L as facade tiers (relative to the tile origin), for both the merged meshes and the instanced facade
function tiersOf(L, S, i, ox, oz, y0) {
  const o = i * 12, b = L.bld, x = b[o] - ox, z = b[o + 1] - oz, W = b[o + 2], D = b[o + 3], hp = b[o + 4], ht = b[o + 5], seed = b[o + 6], style = b[o + 7], accent = b[o + 8], code = b[o + 9], ins = b[o + 10], edges = b[o + 11];
  const kind = Math.floor(code / 16), pal = code % 16, out = []; out.edges = edges; out.kind = kind; out.rect = { x0: x - W / 2, z0: z - D / 2, x1: x + W / 2, z1: z + D / 2 }; out.hp = hp; out.ht = ht; out.seed = seed; out.accent = accent; out.style = style; out.W = W; out.D = D;
  let hex = S.palette[pal % S.palette.length];
  if (kind === KIND.hospital) hex = 0xe4e8ec; else if (kind === KIND.school) hex = 0x8a4b3a; else if (kind === KIND.stadium) hex = 0x9aa0a8; else if (kind === KIND.terminal) hex = 0x7ea6c4; else if (kind === KIND.hangar) hex = 0x8d949b; else if (kind === KIND.station) hex = 0x6d7a88; else if (kind === KIND.warehouse) hex = 0xa9b2bb;
  const shade = 0.82 + 0.3 * hash(seed + 3);
  out.push({ x, z, w: W, d: D, h: hp, y: y0, style: style === 3 ? 2 : style, accent, seed, podium: 1, tex: Math.floor(seed * 7.13) % 4, col: rgb(hex, shade), kind });
  const tw = W - ins * 2, td = D - ins * 2;
  if (ht > 0 && tw > 6 && td > 6) {
    out.push({ x, z, w: tw, d: td, h: ht, y: y0 + hp, style, accent, seed: seed + 1, podium: 0, tex: Math.floor(seed * 7.13) % 4, col: rgb(hex, shade * 0.92), kind });
    if (hp + ht > 52 && kind === 0 && hash(seed + 5) < 0.8) {
      const i2 = Math.min(3 + hash(seed + 6) * 4, Math.min(tw, td) * 0.22), ch = 10 + hash(seed + 7) * 18;
      out.push({ x, z, w: tw - i2 * 2, d: td - i2 * 2, h: ch, y: y0 + hp + ht, style: (style + 1) % 4, accent, seed: seed + 2, podium: 0, crown: 1, tex: Math.floor(seed * 7.13) % 4, col: rgb(hex, shade * 0.8), kind });
    }
  }
  return out;
}

export class CitySites {
  constructor(scene, world, phys, G) {
    this.scene = scene; this.world = world; this.phys = phys; this.G = G; this.group = new THREE.Group(); this.group.name = 'citysites'; this.cities = []; this.stats = { near: 0, mid: 0, coll: 0, lots: 0, tiles: 0, tris: 0, signs: 0 };
    this.mat = this.makeMaterial();
    this.groundMat = this.mat;   // roads / props use the same program (aK = 0: no windows) with a depth bias applied per mesh below
    this.roadMat = this.mat.clone(); this.roadMat.polygonOffset = true; this.roadMat.polygonOffsetFactor = -4; this.roadMat.polygonOffsetUnits = -4; this.roadMat.onBeforeCompile = this.mat.onBeforeCompile; this.roadMat.customProgramCacheKey = () => 'citysite-v1';
    const lay = globalThis.__BAKED?.layouts || layouts(), defs = cities();
    defs.forEach((c, k) => { const L = lay.get(c.id); if (L) this.cities.push(this.buildCity(c, L, k)); });
    this.stats.tiles = this.cities.reduce((s, c) => s + c.tiles.size, 0);
    scene.add(this.group);
    this.t = 0; this.nearQueue = [];
  }

  makeMaterial() {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uNight = nightU; sh.uniforms.uTime = timeUniform;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aK;varying float vK;varying vec3 vWP;varying vec3 vWN;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvK=aK;vWP=(modelMatrix*vec4(transformed,1.)).xyz;vWN=normalize(mat3(modelMatrix)*objectNormal);');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${GLSL_NOISE}\nvarying float vK;varying vec3 vWP;varying vec3 vWN;uniform float uNight,uTime;float fRough=.85,fMetal=.05;vec3 fEmit=vec3(0.);`)
        .replace('#include <color_fragment>', `#include <color_fragment>
        if(vK>.5&&abs(vWN.y)<.5){
          float sx=3.1,sy=3.6,horiz=abs(vWN.x)>.5?vWP.z:vWP.x,y=vWP.y;vec2 cell=vec2(floor(horiz/sx),floor(y/sy)),f=vec2(fract(horiz/sx),fract(y/sy));
          float rnd=h21(cell+vK*37.1);float wm=step(.2,f.x)*step(f.x,.8)*step(.22,f.y)*step(f.y,.82);
          float lit=step(rnd,mix(.25,.6,fract(vK*3.7)));float cr=h21(cell+11.7);
          vec3 wc=cr<.5?vec3(1.,.74,.42):(cr<.78?vec3(.75,.9,1.):vec3(1.,.6,.9));
          float fw=max(fwidth(horiz/sx),fwidth(y/sy));wm*=1.-smoothstep(.12,.4,fw);   // the pattern fades to the wall colour once it is thinner than a pixel
          diffuseColor.rgb*=mix(1.,.45,wm);
          fEmit=wc*lit*wm*(.35+.65*uNight)*1.1*(.7+h21(cell+4.)*.8);
        }
        if(vK<-1.5)fEmit=vec3(1.,.74,.4)*2.6*uNight;   // street-lamp heads
        else if(vK<-.5)fEmit=vec3(.075,.05,.025)*uNight;   // the sodium wash on streets and kerbs, enough to read the grid from the air`)
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = fRough;').replace('#include <metalnessmap_fragment>', 'float metalnessFactor = fMetal;').replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += fEmit;');
    };
    mat.customProgramCacheKey = () => 'citysite-v1';
    return mat;
  }

  buildCity(c, L, index) {
    const S = STYLES[c.id], tiles = new Map(), city = { c, L, S, tiles, group: new THREE.Group(), sky: null, index };
    city.group.position.set(c.x, c.y, c.z); city.group.name = 'city:' + c.id;
    const tile = (x, z) => { const i = Math.floor((x + L.R * 1.1) / TILE), j = Math.floor((z + L.R * 1.1) / TILE), key = i * 1000 + j; let t = tiles.get(key); if (!t) { t = { key, i, j, ox: -L.R * 1.1 + (i + 0.5) * TILE, oz: -L.R * 1.1 + (j + 0.5) * TILE, bld: [], bldAcc: new Acc(), gndAcc: new Acc(), mid: null, gnd: null, near: null, coll: null, signs: [] }; t.wx = c.x + t.ox; t.wz = c.z + t.oz; tiles.set(key, t); } return t; };
    const nb = L.bld.length / 12;
    for (let i = 0; i < nb; i++) tile(L.bld[i * 12], L.bld[i * 12 + 1]).bld.push(i);
    // roads: dark asphalt with a lighter kerb; a segment is cut at tile borders so each tile owns its pieces
    for (let r = 0; r < L.roads.length; r += 5) {
      const x0 = L.roads[r], z0 = L.roads[r + 1], x1 = L.roads[r + 2], z1 = L.roads[r + 3], w = L.roads[r + 4], len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(len / 120));
      for (let s = 0; s < n; s++) {
        const ax = lerp(x0, x1, s / n), az = lerp(z0, z1, s / n), bx = lerp(x0, x1, (s + 1) / n), bz = lerp(z0, z1, (s + 1) / n);
        if (farHeight(c.x + (ax + bx) / 2, c.z + (az + bz) / 2, 64) < SEA + 2) continue;   // no street across the harbour basin
        const t = tile((ax + bx) / 2, (az + bz) / 2);
        const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, nx = -dz / l * w / 2, nz = dx / l * w / 2, kx = -dz / l * (w / 2 + 4), kz = dx / l * (w / 2 + 4), A = t.gndAcc, ox = t.ox, oz = t.oz;
        A.quad([ax - kx - ox, 0.06, az - kz - oz], [ax + kx - ox, 0.06, az + kz - oz], [bx + kx - ox, 0.06, bz + kz - oz], [bx - kx - ox, 0.06, bz - kz - oz], 0, 1, 0, [0.16, 0.16, 0.18], -1);   // sidewalk
        A.quad([ax - nx - ox, 0.1, az - nz - oz], [ax + nx - ox, 0.1, az + nz - oz], [bx + nx - ox, 0.1, bz + nz - oz], [bx - nx - ox, 0.1, bz - nz - oz], 0, 1, 0, [0.045, 0.045, 0.055], -1);   // asphalt
        if (w > 14) { const cl = 0.35; const px = -dz / l * cl, pz = dx / l * cl; A.quad([ax - px - ox, 0.12, az - pz - oz], [ax + px - ox, 0.12, az + pz - oz], [bx + px - ox, 0.12, bz + pz - oz], [bx - px - ox, 0.12, bz - pz - oz], 0, 1, 0, [0.7, 0.55, 0.15], 0); }   // centre line
        if (w > 16) for (let q = 0; q < l; q += 70) {   // lamps on the avenues, alternating sides
          const s2 = (Math.floor(q / 70) % 2 ? 1 : -1) * (w / 2 + 2), lx = ax + dx / l * q - dz / l * s2 - ox, lz = az + dz / l * q + dx / l * s2 - oz;
          A.box(lx - 0.12, 0, lz - 0.12, lx + 0.12, 8.6, lz + 0.12, [0.05, 0.05, 0.06], 0); A.box(lx - 0.5, 8.6, lz - 0.5, lx + 0.5, 9.1, lz + 0.5, [1, 0.8, 0.5], -2);
        }
      }
    }
    // areas: [kind, x0, z0, x1, z1, arg]
    const AREA_COL = { 1: [[0.05, 0.2, 0.07], [0.07, 0.24, 0.08], [0.09, 0.2, 0.1], [0.06, 0.17, 0.06]], 2: [[0.08, 0.3, 0.1]], 10: [[0.05, 0.05, 0.06]], 11: [[0.07, 0.07, 0.08]], 12: [[0.1, 0.1, 0.11]], 13: [[0.09, 0.09, 0.1]] };
    for (let a = 0; a < L.areas.length; a += 6) {
      const kind = L.areas[a], x0 = L.areas[a + 1], z0 = L.areas[a + 2], x1 = L.areas[a + 3], z1 = L.areas[a + 4], arg = L.areas[a + 5];
      // large areas (runways) span tiles: cut them into TILE-sized pieces
      for (let px = x0; px < x1 - 0.01; px += TILE) for (let pz = z0; pz < z1 - 0.01; pz += TILE) {
        const qx1 = Math.min(x1, px + TILE), qz1 = Math.min(z1, pz + TILE), t = tile((px + qx1) / 2, (pz + qz1) / 2), A = t.gndAcc, col = AREA_COL[kind][Math.floor(arg) % AREA_COL[kind].length];
        A.flat(px - t.ox, pz - t.oz, qx1 - t.ox, qz1 - t.oz, kind === 1 ? 0.09 : 0.14, col, -1);
        if (kind === 10) for (let dx = px; dx < qx1; dx += 45) for (const zz of [z0 - 1.5, z1 + 1.5]) A.box(dx - t.ox - 0.3, 0.1, zz - t.oz - 0.3, dx - t.ox + 0.3, 0.7, zz - t.oz + 0.3, [1, 0.9, 0.7], -2);   // runway edge lights
        if (kind === 10) {   // runway: white centre dashes
          for (let dx = px + 20; dx < qx1 - 20; dx += 70) A.flat(dx - t.ox, (z0 + z1) / 2 - 0.9 - t.oz, dx + 34 - t.ox, (z0 + z1) / 2 + 0.9 - t.oz, 0.16, [0.8, 0.8, 0.78], -2);
        }
        if (kind === 2) { A.flat(px + 12 - t.ox, pz + 22 - t.oz, qx1 - 12 - t.ox, qz1 - 22 - t.oz, 0.15, [0.12, 0.38, 0.14], -1); }   // pitch
      }
      if (kind === 1) {   // park trees: small dark cones as stacked boxes
        const cnt = Math.min(60, Math.floor((x1 - x0) * (z1 - z0) / 520)), t = tile((x0 + x1) / 2, (z0 + z1) / 2);
        for (let k = 0; k < cnt; k++) { const tx = lerp(x0 + 4, x1 - 4, hash(a * 7 + k)), tz = lerp(z0 + 4, z1 - 4, hash(a * 13 + k * 3)), h = 5 + hash(k + a) * 5; if (tile(tx, tz) !== t) continue; t.gndAcc.box(tx - 1.6 - t.ox, 0, tz - 1.6 - t.oz, tx + 1.6 - t.ox, h, tz + 1.6 - t.oz, [0.04 + hash(k) * 0.05, 0.16 + hash(k + 9) * 0.1, 0.05], 0); }
      }
      if (kind === 13) {   // container yard: stacks of coloured containers
        const t = tile((x0 + x1) / 2, (z0 + z1) / 2), cols = [[0.7, 0.18, 0.12], [0.12, 0.3, 0.6], [0.8, 0.55, 0.1], [0.15, 0.5, 0.3], [0.5, 0.5, 0.55]];
        for (let px = x0 + 6; px < x1 - 14; px += 17) for (let pz = z0 + 6; pz < z1 - 10; pz += 9) { const h = 2.6 * (1 + Math.floor(hash(px * 3 + pz) * 4)); if (hash(px + pz * 5) < 0.2) continue; if (tile(px, pz) !== t) continue; t.gndAcc.box(px - t.ox, 0, pz - t.oz, px + 14 - t.ox, h, pz + 6 - t.oz, cols[Math.floor(hash(px * 7 + pz * 11) * cols.length)], -1); }
        for (const [lx, lz] of [[x0 + 2, z0 + 2], [x1 - 2, z0 + 2], [x0 + 2, z1 - 2], [x1 - 2, z1 - 2]]) if (tile(lx, lz) === t) { t.gndAcc.box(lx - t.ox - 0.3, 0, lz - t.oz - 0.3, lx - t.ox + 0.3, 24, lz - t.oz + 0.3, [0.06, 0.06, 0.07], 0); t.gndAcc.box(lx - t.ox - 1.2, 24, lz - t.oz - 0.6, lx - t.ox + 1.2, 24.8, lz - t.oz + 0.6, [1, 0.95, 0.85], -2); }   // flood-light masts
      }
    }
    // props: [kind, x, z, ...] 1 = quay crane (axis along the z axis of the city, boom over the water)
    for (let p = 0; p < L.props.length; p += 7) {
      if (L.props[p] !== 1) continue;
      const x = L.props[p + 1], z = L.props[p + 2], t = tile(x, z), A = t.gndAcc, lx = x - t.ox, lz = z - t.oz, red = [0.75, 0.25, 0.1], gray = [0.3, 0.3, 0.33];
      for (const sx of [-14, 14]) for (const sz of [-8, 8]) A.box(lx + sx - 1, 0, lz + sz - 1, lx + sx + 1, 38, lz + sz + 1, gray, 0);
      A.box(lx - 16, 38, lz - 10, lx + 16, 41, lz + 10, red, 0); A.box(lx - 2, 41, lz - 55, lx + 2, 44, lz + 14, red, 0); A.box(lx - 3, 44, lz - 2, lx + 3, 56, lz + 2, gray, 0);
    }
    // buildings of each tile as one merged mesh (L1) + their share of the skyline mesh (L2)
    const sky = new Acc();
    for (const t of tiles.values()) {
      for (const i of t.bld) {
        for (const T of tiersOf(L, S, i, t.ox, t.oz, 0)) {
          const k = T.kind === KIND.stadium ? 0 : 1 + T.seed % 50;
          t.bldAcc.box(T.x - T.w / 2, T.y, T.z - T.d / 2, T.x + T.w / 2, T.y + T.h, T.z + T.d / 2, T.col, k, T.col.map((v) => v * 0.45));
          if (T.y + T.h > TALL && !T.podium) sky.box(T.x + t.ox - T.w / 2, T.y, T.z + t.oz - T.d / 2, T.x + t.ox + T.w / 2, T.y + T.h, T.z + t.oz + T.d / 2, T.col, k, T.col.map((v) => v * 0.45));
        }
      }
      if (!t.bldAcc.empty) { t.mid = t.bldAcc.mesh(this.mat); t.mid.position.set(t.ox, 0, t.oz); t.mid.visible = false; city.group.add(t.mid); this.stats.tris += t.bldAcc.ni / 3; }
      if (!t.gndAcc.empty) { t.gnd = t.gndAcc.mesh(this.roadMat); t.gnd.position.set(t.ox, 0, t.oz); t.gnd.visible = false; city.group.add(t.gnd); this.stats.tris += t.gndAcc.ni / 3; }
      t.bldAcc = t.gndAcc = null;
    }
    if (!sky.empty) { city.sky = sky.mesh(this.mat); city.sky.frustumCulled = true; city.group.add(city.sky); }
    // neon signs in the city's language: one atlas, one instanced mesh per city
    this.buildSigns(city);
    this.group.add(city.group);
    return city;
  }

  // 8 words on a 2 x 4 canvas atlas; a sign is a plane on a rooftop edge, bright and unlit (neon)
  buildSigns(city) {
    const { S, L, c } = city, cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512;
    const g = cv.getContext('2d'); g.fillStyle = '#05060c'; g.fillRect(0, 0, 1024, 512);
    const neon = ['#ff2ec8', '#27d9ff', '#ffa02a', '#9d6bff', '#35ff9a', '#ff3a52'];
    S.words.forEach((w, k) => {
      const cx = (k % 2) * 512, cy = Math.floor(k / 2) * 128, col = neon[S.accents[k % S.accents.length] % 6];
      g.save(); g.beginPath(); g.rect(cx + 6, cy + 6, 500, 116); g.clip(); g.strokeStyle = col; g.lineWidth = 6; g.strokeRect(cx + 10, cy + 10, 492, 108);
      g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 18; g.font = `700 ${w.length > 10 ? 46 : 62}px "Space Mono", "Noto Sans CJK JP", monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(w, cx + 256, cy + 66, 470); g.restore();
    });
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const signs = []; const nb = L.bld.length / 12;
    for (let i = 0; i < nb; i++) {
      const o = i * 12, h = L.bld[o + 4] + L.bld[o + 5], seed = L.bld[o + 6]; if (h < 14 || hash(seed + 21) > 0.22) continue;
      const W = L.bld[o + 2], D = L.bld[o + 3], face = Math.floor(hash(seed + 22) * 4), wd = Math.min(18, (face < 2 ? W : D) * 0.8);
      const px = L.bld[o] + (face === 2 ? W / 2 + 0.3 : face === 3 ? -W / 2 - 0.3 : 0), pz = L.bld[o + 1] + (face === 0 ? D / 2 + 0.3 : face === 1 ? -D / 2 - 0.3 : 0);
      signs.push({ x: px, y: Math.min(h - 3, 8 + hash(seed + 23) * Math.max(6, h - 12)), z: pz, w: wd, ry: face === 0 ? 0 : face === 1 ? Math.PI : face === 2 ? Math.PI / 2 : -Math.PI / 2, word: Math.floor(hash(seed + 24) * 8) });
    }
    if (!signs.length) return;
    const geo = new THREE.PlaneGeometry(1, 0.25); geo.setAttribute('aUV', new THREE.InstancedBufferAttribute(new Float32Array(signs.length * 4), 4));
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aUV;').replace('#include <project_vertex>', '#include <project_vertex>\nvMapUv = uv * aUV.zw + aUV.xy;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb*=1.4;');
    };
    mat.customProgramCacheKey = () => 'citysite-sign';
    const m = new THREE.InstancedMesh(geo, mat, signs.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), uv = geo.attributes.aUV;
    signs.forEach((sg, k) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sg.ry); s.set(sg.w, sg.w, 1); p.set(sg.x, sg.y, sg.z); M.compose(p, q, s); m.setMatrixAt(k, M);
      uv.setXYZW(k, (sg.word % 2) * 0.5, 1 - (Math.floor(sg.word / 2) + 1) * 0.25, 0.5, 0.25);
    });
    m.frustumCulled = false; m.visible = false; city.signs = m; city.group.add(m); this.stats.signs += signs.length;
  }

  // per-frame: tile visibility by distance to the camera, one L0 tile made per frame, colliders near the player
  update(camera, focus, dt) {
    const cx = camera.position.x, cz = camera.position.z; let near = 0, mid = 0;
    for (const C of this.cities) {
      const dxc = cx - C.c.x, dzc = cz - C.c.z, dc = Math.hypot(dxc, dzc), inReach = dc < C.L.R * 1.2 + MID;
      C.group.visible = dc < 170000;
      if (C.sky) C.sky.visible = dc > C.L.R * 0.6;
      if (C.signs) C.signs.visible = dc < C.L.R + 900;
      for (const t of C.tiles.values()) {
        const d = inReach ? Math.hypot(cx - t.wx, cz - t.wz) - TILE * 0.7 : 1e9, wantNear = d < NEAR, keepNear = d < NEAR_OFF;
        if (t.near && !keepNear) this.dropNear(t); else if (!t.near && wantNear && t.bld.length && !this.madeThisFrame && this.G?.buildings) { this.makeNear(C, t); this.madeThisFrame = true; }
        const vis = d < MID;
        if (t.gnd) t.gnd.visible = vis;
        if (t.mid) t.mid.visible = vis && !t.near;
        if (t.near) near++; if (vis) mid++;
      }
    }
    this.madeThisFrame = false; this.stats.near = near; this.stats.mid = mid;
    let nl = 0, nc = 0; for (const C of this.cities) for (const t of C.tiles.values()) if (t.near) { nl += t.near.lots.length; nc += t.near.boxes.length + t.near.lots.length; } this.stats.lots = nl; this.stats.coll = nc;
  }

  // L0 for one tile: the instanced facade, the collision boxes, and for every building big enough (as in the capital: 17 m wide, 20 m tall) a
  // lot record with a door, handed to the Buildings manager so it can be entered; the entrance markers are one small merged mesh
  makeNear(C, t) {
    const G = this.G, f = this.world.facadeApi, col = this.world.colliders; if (!f || !G) return;
    const list = [], recs = [], ax = C.c.x + t.ox, az = C.c.z + t.oz;
    for (const i of t.bld) { const T = tiersOf(C.L, C.S, i, t.ox, t.oz, 0), at = list.length; for (const x of T) list.push({ ...x, color: new THREE.Color(x.col[0], x.col[1], x.col[2]) }); recs.push({ i, T, at }); }
    const mesh = f.make(list, true, false); mesh.castShadow = false; mesh.receiveShadow = false; mesh.position.set(t.ox, 0, t.oz); C.group.add(mesh);
    const near = { mesh, ent: null, lots: [], boxes: [] }, ent = new Acc(), aDoor = mesh.geometry.attributes.aDoor, ENTER = new Set([KIND.normal, KIND.hospital, KIND.school, KIND.terminal, KIND.station]);
    for (const { i, T, at } of recs) {
      const pod = T[0], top = T[T.length - 1], x0 = ax + pod.x - pod.w / 2, x1 = ax + pod.x + pod.w / 2, z0 = az + pod.z - pod.d / 2, z1 = az + pod.z + pod.d / 2, H = T.length > 1 ? T[1].y + T[1].h : pod.h;
      if (T.length < 2 || !ENTER.has(T.kind) || Math.min(pod.w, pod.d) < 17 || H < 20) { for (const x of T) near.boxes.push(col.addBox(ax + x.x - x.w / 2, az + x.z - x.d / 2, ax + x.x + x.w / 2, az + x.z + x.d / 2, x.y + x.h, 'building', x.y)); continue; }
      const st = (k, x, inst) => ({ kind: k, inst, x0: ax + x.x - x.w / 2, z0: az + x.z - x.d / 2, x1: ax + x.x + x.w / 2, z1: az + x.z + x.d / 2, y0: x.y, y1: x.y + x.h });
      const stages = [st('podium', pod, at), st('tower', T[1], at + 1)]; if (T.length > 2) stages.push(st('crown', T[2], at + 2));
      const lot = {
        x0, z0, x1, z1, h: H, accent: T.accent, edges: { w: !!(T.edges & 1), e: !!(T.edges & 2), n: !!(T.edges & 4), s: !!(T.edges & 8) }, podium: pod.h, style: T.style, ring: false, seed: T.seed,
        tiers: { podium: stages[0], tower: stages[1], crown: stages[2] || null }, stages, topY: top.y + top.h, tierIdx: at, remote: C.c.id,
      };
      const d = doorSpec(lot);
      if (!d) { near.boxes.push(col.addBox(x0, z0, x1, z1, H + 5, 'building')); continue; }
      lot.door = d; lot.name = C.S.words[(i + Math.floor(T.seed)) % C.S.words.length] + ' ' + ['TOWER', 'PLAZA', 'COURT', 'HOUSE', 'POINT', 'GATE'][(i * 3) % 6]; lot.id = C.c.id + ':' + i;
      lot.solid = col.addBox(x0, z0, x1, z1, H + 5, 'building');
      aDoor.setXYZW(at, d.nx !== 0 ? z0 : x0, d.bay, { w: 0, e: 1, n: 2, s: 3 }[d.side], 0); lot.doorRefs = [{ attr: aDoor, start: at, count: 1 }];
      this.entrance(ent, d, accentColor(lot.accent), ax, az);
      lot.fac = { mesh, burn: mesh.geometry.attributes.aBurn, door: aDoor, mat0: mesh.instanceMatrix.array.slice(), ent: null, ox: ax, oz: az };
      near.lots.push(lot); G.buildings.addLot(lot);
    }
    aDoor.needsUpdate = true;
    if (!ent.empty) { near.ent = ent.mesh(this.mat); near.ent.position.set(t.ox, 0, t.oz); C.group.add(near.ent); }
    for (const lot of near.lots) { lot.fac.ent = near.ent; G.blaze?.addLot(lot); }
    t.near = near;
  }
  // the door frame, canopy and a lit path (the capital's entrance markers): lx along the wall, lz out of it; ax, az = origin of the tile mesh
  entrance(A, d, acc, ax, az) {
    const em = acc.map((v) => v * 2.8), dim = acc.map((v) => v * 0.7), tx = d.nz !== 0 ? 1 : 0, tz = d.nx !== 0 ? 1 : 0;
    const bx = (lx, y, lz, w, h, dd, col, kk) => { const x = d.px + tx * lx + d.nx * lz - ax, z = d.pz + tz * lx + d.nz * lz - az, sx = tx ? w : dd, sz = tx ? dd : w; A.box(x - sx / 2, y, z - sz / 2, x + sx / 2, y + h, z + sz / 2, col, kk); };
    bx(-1.3, 0, 0.1, 0.14, 3.1, 0.22, em, -2); bx(1.3, 0, 0.1, 0.14, 3.1, 0.22, em, -2); bx(0, 3.1, 0.1, 2.74, 0.14, 0.22, em, -2);
    bx(0, 0.02, 5.4, 2.0, 0.04, 7.2, dim, -1); bx(0, 3.55, 1.35, 6.2, 0.18, 2.8, [0.04, 0.05, 0.08], 0); bx(0, 3.35, 1.5, 3.2, 0.04, 2.0, [2.2, 1.9, 1.4], -2);
  }
  dropNear(t) {
    const n = t.near; if (!n) return; const G = this.G, col = this.world.colliders;
    for (const lot of n.lots) { G.blaze?.removeLot(lot); G.buildings.removeLot(lot); if (lot.solid) col.removeBox(lot.solid); }
    for (const b of n.boxes) col.removeBox(b);
    for (const m of [n.mesh, n.ent]) if (m) { m.parent?.remove(m); m.geometry.dispose(); }
    t.near = null;
  }

  // the city whose disc contains (x, z), or null
  cityAt(x, z, margin = 0) { for (const C of this.cities) if (Math.hypot(x - C.c.x, z - C.c.z) < C.L.R + margin) return C.c; return null; }
  dispose() { this.scene.remove(this.group); this.group.traverse((o) => { o.geometry?.dispose?.(); }); for (const C of this.cities) for (const t of C.tiles.values()) this.dropNear(t); }
}
