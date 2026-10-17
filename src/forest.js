import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { landHeight } from './landfn.js';
import { vegCell, CELL, VT } from './vegfn.js';
import { nightU } from './shaders.js';

// Trees, shrubs, rocks and grass over the whole world (ADR-0013). The data is one byte per 32 m cell (vegfn.js: kind << 5 | trees, baked as the tiles
// `veg/<i>_<j>` and kept in memory as one array); the instances inside a cell are made from hashes of the cell, so the same place always grows the same
// things, a denser detail (the high pack tier) only draws more of them, and no positions are stored. What is drawn depends on the sight: the fog thins with
// height, so the radius follows the fog. Near the camera, real low-poly models in instanced meshes; further out, one instanced billboard per tree
// (a silhouette drawn in the fragment shader, no texture); trunks within 24 m of the player are collision boxes. Everything is created at start (count 0)
// so no program compiles during play.
const NV = 25 * VT, ORIGIN = -50000;
let VEG = null;
export async function loadVeg(wd) {
  const keys = wd.keys('veg/'); if (!keys.length) return 0;
  VEG = new Uint8Array(NV * NV);
  for (let a = 0; a < keys.length; a += 24) await Promise.all(keys.slice(a, a + 24).map(async (k) => {
    const [i, j] = k.slice(4).split('_').map(Number), v = (await wd.get(k)).v; wd.drop(k);
    for (let r = 0; r < VT; r++) VEG.set(v.subarray(r * VT, (r + 1) * VT), (j * VT + r) * NV + i * VT);
  }));
  return keys.length;
}
const SYNTH = new Map();   // without baked data (WORLD=small, tests): the cell byte is computed on first use
const byteAt = (cx, cz) => {
  if (cx < 0 || cz < 0 || cx >= NV || cz >= NV) return 0;
  if (VEG) return VEG[cz * NV + cx];
  const k = cz * NV + cx; let b = SYNTH.get(k); if (b === undefined) { b = vegCell(ORIGIN + (cx + 0.5) * CELL, ORIGIN + (cz + 0.5) * CELL); SYNTH.set(k, b); if (SYNTH.size > 20000) SYNTH.clear(); } return b;
};
const hash = (a, b, c) => { let h = Math.imul(a, 0x27d4eb2d) ^ Math.imul(b, 0x165667b1) ^ Math.imul(c + 1, 0x9e3779b1); h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ---- models: merged primitives with vertex colours (the instance colour tints them)
function part(geo0, col, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0) {
  const geo = geo0.index ? geo0.toNonIndexed() : geo0; geo.deleteAttribute('uv');
  /* the parts are merged: all non-indexed */ const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)), new THREE.Vector3(sx, sy, sz)); geo.applyMatrix4(m);
  const c = new Float32Array(geo.attributes.position.count * 3); for (let i = 0; i < c.length; i += 3) { c[i] = col[0]; c[i + 1] = col[1]; c[i + 2] = col[2]; } geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); return geo;
}
const cyl = (r0, r1, h, seg = 6) => new THREE.CylinderGeometry(r1, r0, h, seg, 1).translate(0, h / 2, 0);
const MODELS = {
  broad: () => mergeGeometries([part(cyl(0.3, 0.2, 2.8), [0.1, 0.065, 0.04]), part(new THREE.IcosahedronGeometry(1, 0), [0.07, 0.2, 0.06], 0, 3.6, 0, 2.2, 1.9, 2.2), part(new THREE.IcosahedronGeometry(1, 0), [0.09, 0.24, 0.07], 0.8, 4.4, 0.4, 1.4, 1.2, 1.4), part(new THREE.IcosahedronGeometry(1, 0), [0.05, 0.17, 0.05], -0.7, 4.1, -0.5, 1.5, 1.3, 1.5)]),
  conifer: () => mergeGeometries([part(cyl(0.28, 0.2, 2.2), [0.09, 0.06, 0.04]), part(new THREE.ConeGeometry(2.0, 3.6, 7).translate(0, 1.8, 0), [0.03, 0.13, 0.07], 0, 2.0), part(new THREE.ConeGeometry(1.5, 3.2, 7).translate(0, 1.6, 0), [0.04, 0.16, 0.08], 0, 4.2), part(new THREE.ConeGeometry(1.0, 2.8, 7).translate(0, 1.4, 0), [0.05, 0.19, 0.09], 0, 6.2)]),
  palm: () => mergeGeometries([part(cyl(0.3, 0.16, 7.5, 5), [0.28, 0.2, 0.12]), ...[0, 1, 2, 3, 4, 5].map((k) => part(new THREE.ConeGeometry(0.4, 4, 3).translate(0, 2, 0), [0.07, 0.3, 0.09], Math.cos(k * 1.047) * 0.2, 7.4, Math.sin(k * 1.047) * 0.2, 1, 1, 1, Math.sin(k * 1.047) * 1.15, -Math.cos(k * 1.047) * 1.15))]),
  cactus: () => mergeGeometries([part(cyl(0.38, 0.34, 3, 6), [0.1, 0.3, 0.12]), part(cyl(0.2, 0.2, 1.1, 5), [0.1, 0.3, 0.12], 0.5, 1.1, 0), part(cyl(0.2, 0.2, 0.9, 5), [0.1, 0.3, 0.12], -0.5, 1.6, 0), part(cyl(0.2, 0.2, 0.7, 5), [0.1, 0.3, 0.12], 0.5, 0.6, 0, 1, 1, 1, 0, 1.57)]),
  dead: () => mergeGeometries([part(cyl(0.25, 0.12, 4.2, 5), [0.16, 0.14, 0.12]), part(cyl(0.1, 0.05, 1.8, 4), [0.15, 0.13, 0.11], 0.1, 2.6, 0, 1, 1, 1, 0, -0.9), part(cyl(0.1, 0.05, 1.5, 4), [0.15, 0.13, 0.11], -0.1, 3.2, 0, 1, 1, 1, 0, 0.8), part(cyl(0.08, 0.04, 1.2, 4), [0.15, 0.13, 0.11], 0, 3.6, 0.1, 1, 1, 1, 0.8, 0)]),
  shrub: () => mergeGeometries([part(new THREE.IcosahedronGeometry(1, 0), [0.07, 0.2, 0.07], 0, 0.5, 0, 0.8, 0.55, 0.8), part(new THREE.IcosahedronGeometry(1, 0), [0.09, 0.23, 0.08], 0.5, 0.35, 0.2, 0.55, 0.4, 0.55)]),
  rock: () => { const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = 0.78 + 0.34 * hash(Math.round(p.getX(i) * 40), Math.round(p.getY(i) * 40), Math.round(p.getZ(i) * 40)); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k); } g.computeVertexNormals(); return mergeGeometries([part(g, [0.2, 0.19, 0.18], 0, 0.3)]); },
  grass: () => { const blades = []; for (let k = 0; k < 4; k++) { const a = k * 0.8 + 0.3, h = 0.55 + (k % 2) * 0.25, g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.07, 0, 0, 0.07, 0, 0, 0.0, h, 0.0]), 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array([0.03, 0.09, 0.03, 0.03, 0.09, 0.03, 0.12, 0.3, 0.1]), 3)); g.setIndex([0, 1, 2]); g.rotateY(a); g.translate(Math.cos(a * 3) * 0.12, 0, Math.sin(a * 3) * 0.12); g.rotateZ(0); blades.push(g); } return mergeGeometries(blades); },
};
const TYPES = ['broad', 'conifer', 'palm', 'cactus', 'dead', 'shrub', 'rock'], BILL = { broad: 0, conifer: 1, palm: 2, cactus: 3, dead: 4 };
const CAP = { broad: 3500, conifer: 3500, palm: 800, cactus: 1200, dead: 800, shrub: 1500, rock: 900, grass: 9000 }, BILL_CAP = 26000;
const SAFE_FOG = 2.9;

export class Forest {
  constructor(scene, world, G) {
    this.scene = scene; this.world = world; this.G = G; this.group = new THREE.Group(); this.group.name = 'forest';
    const high = globalThis.__DETAIL === 'high'; this.f = high ? 1 : 0.5; this.maxR = high ? 900 : 520; this.nearR = high ? 230 : 170; this.grassR = high ? 80 : 56; this.bbCap = high ? BILL_CAP : BILL_CAP * 0.7;
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
    this.meshes = {}; this.cells = new Map(); this.t = 0; this.last = [1e9, 1e9]; this.cols = new Map(); this.stats = { near: 0, bill: 0, grass: 0, cells: 0, boxes: 0 };
    for (const t of [...TYPES, 'grass']) {
      const m = new THREE.InstancedMesh(MODELS[t](), this.mat, CAP[t]); m.count = 0; m.frustumCulled = false; m.castShadow = false; m.receiveShadow = false;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP[t] * 3), 3); this.meshes[t] = m; this.group.add(m);
    }
    // billboards: a quad that turns to the camera about the vertical axis; the silhouette is drawn by type in the fragment shader
    const bg = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0); bg.setAttribute('aT', new THREE.InstancedBufferAttribute(new Float32Array(this.bbCap), 1));
    this.bmat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uNight: nightU }]), fog: true, transparent: false, side: THREE.DoubleSide,
      vertexShader: `attribute float aT;varying vec2 vUv;varying float vT;varying vec3 vC;
        #include <fog_pars_vertex>
        void main(){vec3 ip=instanceMatrix[3].xyz;vec3 to=cameraPosition-ip;vec3 right=normalize(vec3(to.z,0.,-to.x));float sx=length(instanceMatrix[0].xyz),sy=length(instanceMatrix[1].xyz);
          vec3 wp=ip+right*position.x*sx+vec3(0.,position.y*sy,0.);vec4 mvPosition=viewMatrix*vec4(wp,1.);gl_Position=projectionMatrix*mvPosition;vUv=uv;vT=aT;vC=instanceColor;
          #include <fog_vertex>
        }`,
      fragmentShader: `varying vec2 vUv;varying float vT;varying vec3 vC;uniform float uNight;
        #include <fog_pars_fragment>
        void main(){vec2 p=vUv;float a=0.;
          if(vT<.5){float r=length((p-vec2(.5,.64))/vec2(.46,.36));a=float(r<1.)+float(abs(p.x-.5)<.045&&p.y<.34);}
          else if(vT<1.5){a=float(p.y>.1&&abs(p.x-.5)<(1.-p.y)*.42)+float(abs(p.x-.5)<.04&&p.y<.14);}
          else if(vT<2.5){a=float(abs(p.x-.5)<.025&&p.y<.82)+float(length((p-vec2(.5,.86))/vec2(.4,.14))<1.);}
          else if(vT<3.5){a=float(abs(p.x-.5)<.1&&p.y<.95)+float(abs(p.x-.5)<.38&&abs(p.y-.55)<.07)+float(abs(p.x-.14)<.06&&p.y>.5&&p.y<.8);}
          else {a=float(abs(p.x-.5)<.035&&p.y<.95)+float(abs(p.x-.5-(p.y-.5)*.5)<.02&&p.y>.45&&p.y<.85);}
          if(a<.5)discard;
          vec3 col=vC*(.55+.5*p.y)*mix(1.,.2,uNight);gl_FragColor=vec4(col,1.);
          #include <fog_fragment>
        }`,
    });
    this.bill = new THREE.InstancedMesh(bg, this.bmat, this.bbCap); this.bill.count = 0; this.bill.frustumCulled = false; this.bill.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.bbCap * 3), 3); this.group.add(this.bill);
    scene.add(this.group); this.boxes = new Map();
  }

  // the trees, shrubs and rocks of a cell as records [x, y, z, rot, size, type] (type: index in TYPES), made once and kept
  cell(cx, cz, byte) {
    const key = cz * NV + cx; let r = this.cells.get(key); if (r) return r;
    const kind = byte >> 5, n0 = byte & 31, out = [], f = this.f, x0 = ORIGIN + cx * CELL, z0 = ORIGIN + cz * CELL;
    const put = (k, type, size) => { const x = x0 + hash(cx, cz, k * 3) * CELL, z = z0 + hash(cx, cz, k * 3 + 1) * CELL; out.push(x, landHeight(x, z, 8), z, hash(cx, cz, k * 3 + 2) * 6.283, size, type); };
    const n = Math.floor(n0 * f + hash(cx, cz, 900));
    for (let k = 0; k < n; k++) {
      const u = hash(cx, cz, 100 + k), sz = 0.75 + 0.6 * hash(cx, cz, 200 + k);
      if (kind === 1) put(k, u < 0.82 ? 0 : 1, sz); else if (kind === 2) put(k, u < 0.9 ? 1 : 0, sz); else if (kind === 3) put(k, 2, 0.8 + 0.5 * u); else if (kind === 4) put(k, u < 0.7 ? 3 : 5, 0.7 + 0.7 * u);
      else if (kind === 5) put(k, u < 0.75 ? 4 : 5, sz); else if (kind === 6) put(k, 5, 0.6 + 0.8 * u);
    }
    const rocks = kind === 7 ? 3 : kind === 4 || kind === 5 ? 0.7 : kind === 2 ? 0.25 : 0, nr = Math.floor(rocks * f * (kind === 7 ? 1.4 : 1) + hash(cx, cz, 901));
    for (let k = 0; k < nr; k++) put(300 + k, 6, 0.5 + 2.2 * hash(cx, cz, 400 + k) ** 2);
    r = Float32Array.from(out); this.cells.set(key, r); if (this.cells.size > 9000) { let i = 0; for (const k of this.cells.keys()) { this.cells.delete(k); if (++i > 4500) break; } }
    return r;
  }

  // the growth byte at a world position (kind << 5 | trees), for tests and tools
  byteAtWorld(x, z) { return byteAt(Math.floor((x - ORIGIN) / CELL), Math.floor((z - ORIGIN) / CELL)); }

  update(cam, focus, dt) {
    this.t -= dt; const dx = cam.position.x - this.last[0], dz = cam.position.z - this.last[1];
    if (this.t <= 0 || dx * dx + dz * dz > 225) { this.t = 0.25; this.last = [cam.position.x, cam.position.z]; this.refresh(cam); }
    this.colliders(focus);
  }

  refresh(cam) {
    const cx = cam.position.x, cz = cam.position.z, fog = this.scene.fog, R = Math.min(this.maxR, Math.max(120, SAFE_FOG / Math.max(fog ? fog.density : 0.01, 1e-4) + 30)), Rn = Math.min(R, this.nearR);
    // too high to see single trees (beyond 1 km the ground colour carries the forest): nothing is drawn
    const alt = cam.position.y - landHeight(cx, cz, 64), idle = alt > 600;
    const c0x = Math.floor((cx - R - ORIGIN) / CELL), c1x = Math.floor((cx + R - ORIGIN) / CELL), c0z = Math.floor((cz - R - ORIGIN) / CELL), c1z = Math.floor((cz + R - ORIGIN) / CELL), list = [];
    if (!idle) for (let j = c0z; j <= c1z; j++) for (let i = c0x; i <= c1x; i++) {
      const b = byteAt(i, j); if (!(b >> 5) && !(b & 31)) continue;
      const ex = ORIGIN + (i + 0.5) * CELL - cx, ez = ORIGIN + (j + 0.5) * CELL - cz, d2 = ex * ex + ez * ez; if (d2 > (R + 24) * (R + 24)) continue; list.push([d2, i, j, b]);
    }
    list.sort((a, b) => a[0] - b[0]);
    const cnt = {}; for (const t of [...TYPES, 'grass']) cnt[t] = 0; let nb = 0, mc = 0;
    const set = (m, k, x, y, z, rot, s, tint) => { const a = m.instanceMatrix.array, o = k * 16, c = Math.cos(rot) * s, sn = Math.sin(rot) * s; a[o] = c; a[o + 1] = 0; a[o + 2] = -sn; a[o + 3] = 0; a[o + 4] = 0; a[o + 5] = s; a[o + 6] = 0; a[o + 7] = 0; a[o + 8] = sn; a[o + 9] = 0; a[o + 10] = c; a[o + 11] = 0; a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1; const ic = m.instanceColor.array; ic[k * 3] = tint[0]; ic[k * 3 + 1] = tint[1]; ic[k * 3 + 2] = tint[2]; };
    const bm = this.bill, bt = bm.geometry.attributes.aT.array, bc = bm.instanceColor.array, bmat = bm.instanceMatrix.array;
    const BC = [[0.1, 0.27, 0.08], [0.04, 0.16, 0.08], [0.08, 0.3, 0.1], [0.1, 0.3, 0.12], [0.2, 0.18, 0.15]];
    const grassKinds = [0, 0.9, 0.6, 0, 0.12, 0, 1.0, 0];
    for (const [d2, i, j, b] of list) {
      const rec = this.cell(i, j, b), d = Math.sqrt(d2), kind = b >> 5; mc++;
      for (let q = 0; q < rec.length; q += 6) {
        const type = rec[q + 5], name = TYPES[type];
        if (d < Rn) { const m = this.meshes[name]; if (cnt[name] >= CAP[name]) continue; const t = 0.85 + 0.3 * hash(q, i, j), tint = name === 'rock' ? [t, t, t] : [t, 0.9 + 0.2 * hash(i, j, q), t * 0.95]; set(m, cnt[name]++, rec[q], rec[q + 1], rec[q + 2], rec[q + 3], rec[q + 4], tint); }
        else if (type < 5 && nb < this.bbCap && d < R) {
          const keep = Math.min(1, 1.15 - 0.7 * (d - Rn) / Math.max(1, R - Rn)); if (hash(q, i + 7, j) > keep) continue;
          const sz = rec[q + 4], h = (type === 1 ? 8.8 : type === 2 ? 8.4 : type === 3 ? 3.2 : type === 4 ? 4.4 : 6.2) * sz, w = (type === 1 ? 4 : type === 2 ? 2.4 : type === 3 ? 1.6 : type === 4 ? 2.0 : 5) * sz, o = nb * 16;
          bmat[o] = w; bmat[o + 1] = 0; bmat[o + 2] = 0; bmat[o + 3] = 0; bmat[o + 4] = 0; bmat[o + 5] = h; bmat[o + 6] = 0; bmat[o + 7] = 0; bmat[o + 8] = 0; bmat[o + 9] = 0; bmat[o + 10] = 1; bmat[o + 11] = 0; bmat[o + 12] = rec[q]; bmat[o + 13] = rec[q + 1]; bmat[o + 14] = rec[q + 2]; bmat[o + 15] = 1;
          const t = 0.85 + 0.3 * hash(q, i, j), c = BC[type]; bc[nb * 3] = c[0] * t; bc[nb * 3 + 1] = c[1] * t; bc[nb * 3 + 2] = c[2] * t; bt[nb] = BILL[name]; nb++;
        }
      }
      // grass tufts close to the camera, from the cell's hash (not kept)
      if (d < this.grassR && grassKinds[kind] > 0) {
        const per = Math.floor(grassKinds[kind] * 70 * this.f + hash(i, j, 910)), gm = this.meshes.grass;
        for (let k = 0; k < per && cnt.grass < CAP.grass; k++) {
          const x = ORIGIN + i * CELL + hash(i, j, 1000 + k * 2) * CELL, z = ORIGIN + j * CELL + hash(i, j, 1001 + k * 2) * CELL, s = 0.7 + 0.9 * hash(i, j, 1500 + k), t = 0.8 + 0.4 * hash(i, j, 1700 + k);
          set(gm, cnt.grass++, x, landHeight(x, z, 8), z, hash(i, j, 1900 + k) * 6.28, s, [t, t, t]);
        }
      }
    }
    let near = 0; for (const t of [...TYPES, 'grass']) { const m = this.meshes[t]; m.count = cnt[t]; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; if (t !== 'grass') near += cnt[t]; }
    bm.count = nb; bm.instanceMatrix.needsUpdate = true; bm.instanceColor.needsUpdate = true; bm.geometry.attributes.aT.needsUpdate = true;
    this.stats.near = near; this.stats.bill = nb; this.stats.grass = cnt.grass; this.stats.cells = mc;
  }

  // trunks within 24 m of the player are solid boxes (made and removed as he walks)
  colliders(focus) {
    const fx = focus.x, fz = focus.z, col = this.world.colliders; if (!col) return;
    if (this.boxAt && Math.abs(fx - this.boxAt[0]) < 4 && Math.abs(fz - this.boxAt[1]) < 4) return; this.boxAt = [fx, fz];
    const want = new Map(), R = 24, ci = Math.floor((fx - ORIGIN) / CELL), cj = Math.floor((fz - ORIGIN) / CELL);
    for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
      const b = byteAt(i, j); if (!(b & 31) && (b >> 5) !== 7 && (b >> 5) !== 4) continue; const rec = this.cell(i, j, b);
      for (let q = 0; q < rec.length; q += 6) {
        const type = rec[q + 5], s = rec[q + 4]; if (type === 5 || (type === 6 && s < 1.2)) continue;
        if (Math.hypot(rec[q] - fx, rec[q + 2] - fz) > R) continue;
        want.set((j * NV + i) * 64 + q / 6, q + ',' + i + ',' + j);
      }
    }
    for (const [k, b] of this.boxes) if (!want.has(k)) { col.removeBox(b); this.boxes.delete(k); }
    for (const [k, v] of want) {
      if (this.boxes.has(k)) continue; const [q, i, j] = v.split(',').map(Number), rec = this.cell(i, j, byteAt(i, j)), type = rec[q + 5], s = rec[q + 4], hw = type === 6 ? 0.8 * s : type === 3 ? 0.35 : 0.3 * Math.min(1.3, s), top = type === 6 ? 1.2 * s : type === 2 ? 7 : 5;
      this.boxes.set(k, col.addBox(rec[q] - hw, rec[q + 2] - hw, rec[q] + hw, rec[q + 2] + hw, rec[q + 1] + top, 'tree', rec[q + 1] - 0.3));
    }
    this.stats.boxes = this.boxes.size;
  }
  dispose() { this.scene.remove(this.group); this.group.traverse((o) => { o.geometry?.dispose?.(); }); const col = this.world.colliders; for (const b of this.boxes.values()) col?.removeBox(b); this.boxes.clear(); }
}
