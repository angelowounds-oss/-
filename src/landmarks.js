import * as THREE from 'three';
import lmBinUrl from '../assets/landmarks/landmarks.bin';
import { need, bytes } from './files.js';
import { layouts } from './citylayout.js';
import { cities } from './worldmap.js';
import { nightU } from './shaders.js';
import { rand } from './util.js';
const lmBin = need(lmBinUrl);   // decoded by synchronous code (files.js)

// Landmark towers (assets/landmarks, docs/ASSETS.md): the shapes of real skyscrapers from the supplied Manhattan and Camellia City models stand in the
// blocks citylayout.js keeps free for them (L.lm). The faces carry a planar window tile (4 bays x 4 floors) that is drawn here, so the windows light up at
// night like the rest of the city. A tower is built when the player comes near, has a box for the physics, and comes down like a village house (hit
// points, a few seconds of collapse, a ruin that is rebuilt after two days; the ruin is kept in state.places).
const BUILD = 1500, DROP = 1900, COLL = 260, HP = 1600, RUIN_K = 0.07, REBUILD = 2880;
const TINTS = [[0.82, 0.84, 0.88], [0.72, 0.76, 0.82], [0.86, 0.8, 0.7], [0.7, 0.72, 0.7], [0.78, 0.72, 0.68], [0.66, 0.7, 0.78]];
let models = null;

function decode() {
  if (models) return models;
  const bin = bytes(lmBin), dv = new DataView(bin.buffer), hl = dv.getUint32(0, true), head = JSON.parse(new TextDecoder().decode(bin.subarray(4, 4 + hl))), base = 4 + hl;
  models = head.models.map((m) => { const nv = m.nWall + m.nRoof; return { ...m, nv, posA: new Int16Array(bin.buffer.slice(base + m.pos, base + m.pos + nv * 6)), nrmA: new Int8Array(bin.buffer.slice(base + m.nrm, base + m.nrm + nv * 3)), uvA: new Float32Array(bin.buffer.slice(base + m.uv, base + m.uv + m.nWall * 8)) }; });
  return models;
}

// the window tile: 4 x 4 bays, glass in a frame by day, lit rooms (random) by night
function tiles() {
  const mk = (draw) => { const cv = document.createElement('canvas'); cv.width = cv.height = 512; draw(cv.getContext('2d')); const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  let s = 12345; const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const day = mk((g) => {
    g.fillStyle = '#d9dde2'; g.fillRect(0, 0, 512, 512);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
      const x = i * 128 + 14, y = j * 128 + 18, w = 100, h = 84, k = g.createLinearGradient(0, y, 0, y + h); k.addColorStop(0, '#5d7f9c'); k.addColorStop(1, '#22364a');
      g.fillStyle = '#9aa1a8'; g.fillRect(x - 4, y - 4, w + 8, h + 8); g.fillStyle = k; g.fillRect(x, y, w, h); g.fillStyle = '#b8c0c8'; g.fillRect(x + w / 2 - 2, y, 4, h);
    }
  });
  const night = mk((g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) for (const half of [0, 1]) { const v = r(); if (v > 0.42) continue; g.fillStyle = v < 0.06 ? '#9fc4ff' : v < 0.2 ? '#ffe2b0' : '#ffb95a'; g.fillRect(i * 128 + 14 + half * 50 + 2, j * 128 + 18 + 2, 46, 80); }
  });
  return { day, night };
}

export class Landmarks {
  constructor(G) {
    this.G = G; this.group = new THREE.Group(); this.group.name = 'landmarks'; G.scene.add(this.group);
    const tx = tiles();
    this.facade = new THREE.MeshStandardMaterial({ vertexColors: true, map: tx.day, emissiveMap: tx.night, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.38, metalness: 0.22, side: THREE.DoubleSide });   // the source models have faces of both windings
    this.roof = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    this.rubble = new THREE.MeshStandardMaterial({ color: 0x4a4642, roughness: 1 });
    // one small mesh per material, so the load-time compile covers their programs
    for (const m of [this.facade, this.roof, this.rubble]) { const w = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3)).setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3)).setAttribute('uv', new THREE.BufferAttribute(new Float32Array(6), 2)).setAttribute('color', new THREE.BufferAttribute(new Float32Array(9).fill(1), 3)), m); w.frustumCulled = false; this.group.add(w); }
    const lay = globalThis.__BAKED?.layouts || layouts(); this.list = [];
    for (const c of cities()) { const L = lay.get(c.id); if (!L?.lm) continue; for (let i = 0; i < L.lm.length / 7; i++) { const a = i * 7, [lx, lz, model, turn, s, w, d] = [0, 1, 2, 3, 4, 5, 6].map((k) => L.lm[a + k]); this.list.push({ c, i, key: `lm:${c.id}:${i}`, x: c.x + lx, z: c.z + lz, y: c.y || 0, model, turn, s, w, d, built: false, alive: true, hp: HP, cb: null, anim: undefined }); } }
    this.P = G.state.places = G.state.places || { dead: {}, ruins: {} }; this.stats = { built: 0 };
  }

  update(dt, focus) {
    this.facade.emissiveIntensity = Math.max(0, nightU.value - 0.08) * 1.25; const col = this.G.world.colliders, t = this.G.clock.t; let built = 0;
    for (const L of this.list) {
      const d = Math.hypot(focus.x - L.x, focus.z - L.z);
      if (d < BUILD && !L.built) this.build(L); else if (d > DROP && L.built) this.dispose(L);
      if (!L.built) continue; built++;
      if (!L.alive && L.anim === undefined && this.P.ruins[L.key] != null && t - this.P.ruins[L.key] > REBUILD) { delete this.P.ruins[L.key]; this.look(L, false); }
      if (L.anim !== undefined) this.collapse(L, dt);
      const near = L.alive && d < COLL + Math.max(L.w, L.d);
      if (near && !L.cb) { const h = decode()[L.model].h * L.s; L.cb = col.addBox(L.x - L.w / 2, L.z - L.d / 2, L.x + L.w / 2, L.z + L.d / 2, L.y + h, 'building', L.y); } else if (!near && L.cb) this.unbox(L);
    }
    this.stats.built = built;
  }
  unbox(L) { if (L.cb) { this.G.world.colliders.removeBox(L.cb); L.cb = null; } }

  build(L) {
    const m = decode()[L.model], tint = TINTS[(L.model * 5 + L.i) % TINTS.length], g = new THREE.Group(); L.built = true; L.group = g; g.position.set(L.x, L.y, L.z); this.group.add(g);
    const inner = new THREE.Group(); inner.rotation.y = L.turn * Math.PI / 2; inner.scale.setScalar(L.s / 64); g.add(inner);
    const part = (from, n, uv) => {
      const geo = new THREE.BufferGeometry(), col = new Float32Array(n * 3); for (let k = 0; k < n; k++) { col[k * 3] = tint[0]; col[k * 3 + 1] = tint[1]; col[k * 3 + 2] = tint[2]; }
      geo.setAttribute('position', new THREE.BufferAttribute(m.posA.subarray(from * 3, (from + n) * 3), 3)); geo.setAttribute('normal', new THREE.BufferAttribute(m.nrmA.subarray(from * 3, (from + n) * 3), 3, true)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(m.uvA.subarray(0, n * 2), 2)); const mesh = new THREE.Mesh(geo, uv ? this.facade : this.roof); mesh.frustumCulled = true; inner.add(mesh); return mesh;
    };
    if (m.nWall) part(0, m.nWall, true); if (m.nRoof) { const r = part(m.nWall, m.nRoof, false); r.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(m.nRoof * 3).fill(0.3), 3)); }
    // a paved plinth under the foot, so the tower stands on something at the edges of the block
    const pl = new THREE.Mesh(new THREE.BoxGeometry(L.w + 8, 0.5, L.d + 8), this.roof); pl.position.y = 0.2; const pc = new Float32Array(24 * 3).fill(0.32); pl.geometry.setAttribute('color', new THREE.BufferAttribute(pc, 3)); g.add(pl); L.plinth = pl;
    const ruin = this.P.ruins[L.key]; L.alive = true; L.anim = undefined; if (ruin != null && this.G.clock.t - ruin < REBUILD) this.look(L, true); else delete this.P.ruins[L.key];
  }
  dispose(L) {
    this.unbox(L); L.group.parent?.remove(L.group); L.group.traverse((o) => { o.geometry?.dispose?.(); }); L.group = null; L.built = false; L.anim = undefined;
  }
  look(L, ruined) {
    L.alive = !ruined; L.anim = undefined; L.group.rotation.set(0, 0, 0); L.group.scale.set(1, ruined ? RUIN_K : 1, 1);
    L.group.traverse((o) => { if (o.isMesh && o !== L.plinth) { if (o.userData.keep === undefined) o.userData.keep = o.material; o.material = ruined ? this.rubble : o.userData.keep; } });
    if (!ruined) L.hp = HP;
  }
  // the collapse: the tower shakes, leans and sinks into a column of dust over several seconds
  collapse(L, dt) {
    const h = decode()[L.model].h * L.s, T = 3 + h * 0.035, G = this.G; L.anim += dt; const u = Math.min(1, L.anim / T), e = u * u * (3 - 2 * u);
    L.group.scale.set(1, 1 - (1 - RUIN_K) * e, 1); L.group.rotation.set(Math.sin(L.anim * 23) * 0.006 * (1 - u) + 0.04 * e, 0, Math.sin(L.anim * 19) * 0.006 * (1 - u) - 0.03 * e);
    for (let k = 0; k < 2; k++) G.smokeP.emit(L.x + rand(-L.w / 2, L.w / 2), L.y + rand(0, h * (1 - e) + 2), L.z + rand(-L.d / 2, L.d / 2), rand(-4, 4), rand(1, 6), rand(-4, 4), rand(6, 12), rand(6, 12), 0.12, 0.11, 0.1, 0.9, 0.2, 0.4);
    if (u >= 1) this.look(L, true);
  }
  blast(x, y, z, radius, dmg, src) {
    const G = this.G;
    for (const L of this.list) {
      if (!L.built || !L.alive || Math.hypot(x - L.x, z - L.z) > Math.max(L.w, L.d) + radius + 4) continue;
      const dx = Math.max(Math.abs(x - L.x) - L.w / 2, 0), dz = Math.max(Math.abs(z - L.z) - L.d / 2, 0), d = Math.hypot(dx, dz); if (d > radius) continue;
      L.hp -= dmg * (1 - d / radius) * 1.3; if (L.hp > 0) continue;
      L.alive = false; L.anim = 0; this.unbox(L); this.P.ruins[L.key] = G.clock.t;
      G.memory?.log('collapse', L.x, L.z, { city: L.c.name, text: `${L.c.name} 랜드마크 타워 붕괴` }); G.addHeat?.(40); G.audio.explosion?.(2, 0);
    }
  }
}
