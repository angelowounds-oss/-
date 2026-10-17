import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { settlements } from './settlements.js';
import { net } from './roadnet.js';
import { landHeight } from './landfn.js';
import { nightU, timeUniform } from './shaders.js';
import { rand } from './util.js';

// The country's works (ADR-0013): wind farms (rotors turn), solar fields, mines, refineries with a flare, comms towers with beacons and the pylon lines
// with their wires. Towers, pylons and turbines are instances of one mesh each so that they can be knocked over one at a time: a blast that hurts one
// past its strength sends it falling away from the blast, its collider goes, the beacon dies, the wires beside a fallen pylon drop to the ground, and the
// wreck stays (remembered in the save for five days). Tanks of a refinery explode. Sites are drawn within 9 km; the colliders of a site exist while the
// player is within 260 m. Plans: settlements.js; flat pads: roadnet.js.
const SITE_VIS = 9000, COLL = 260, REBUILD = 7200, G0 = new THREE.Vector3(0, 1, 0);
const hash = (a, b = 0) => { let h = Math.imul(Math.floor(a * 1000) | 0, 0x9e3779b1) ^ Math.imul(Math.floor(b * 1000) | 0, 0x85ebca6b); h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };
function part(geo0, col, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  const geo = geo0.index ? geo0.toNonIndexed() : geo0; geo.deleteAttribute('uv');
  geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)));
  const c = new Float32Array(geo.attributes.position.count * 3); for (let i = 0; i < c.length; i += 3) { c[i] = col[0]; c[i + 1] = col[1]; c[i + 2] = col[2]; } geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); return geo;
}
const box = (w, h, d, col, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => part(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), col, x, y, z, 1, 1, 1, rx, ry, rz);
const cyl = (r0, r1, h, col, x = 0, y = 0, z = 0, seg = 10) => part(new THREE.CylinderGeometry(r1, r0, h, seg, 1).translate(0, h / 2, 0), col, x, y, z);
const STEEL = [0.34, 0.35, 0.38], WHITE = [0.72, 0.74, 0.76], RED = [0.7, 0.1, 0.08];
// lattice mast: four legs that lean together, rungs every few metres, optional arms; h metres tall, base half width b
function mast(h, b, arms, col = STEEL) {
  const g = [], top = Math.max(0.4, b * 0.18);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const l = Math.hypot(h, b - top); g.push(part(new THREE.BoxGeometry(0.22, l, 0.22).translate(0, l / 2, 0), col, sx * b, 0, sz * b, 1, 1, 1, sz * Math.atan2(b - top, h) * -1, 0, sx * Math.atan2(b - top, h))); }
  for (let y = h * 0.15; y < h; y += h * 0.17) { const w = b + (top - b) * (y / h); g.push(box(w * 2, 0.14, 0.14, col, 0, y, w), box(w * 2, 0.14, 0.14, col, 0, y, -w), box(0.14, 0.14, w * 2, col, w, y, 0), box(0.14, 0.14, w * 2, col, -w, y, 0)); }
  for (const a of arms || []) { g.push(box(a.len * 2, 0.3, 0.3, col, 0, a.y, 0)); for (const s of [-1, 1]) g.push(cyl(0.12, 0.12, 1.3, [0.8, 0.8, 0.82], s * a.len, a.y - 1.3, 0, 6)); }
  return mergeGeometries(g);
}
const MODELS = {
  pylon: () => mast(34, 3.4, [{ y: 31, len: 5.2 }, { y: 26.5, len: 4.4 }]),
  comms: () => mergeGeometries([mast(60, 3.2, null), cyl(0.5, 0.5, 6, STEEL, 0, 60, 0, 6), box(1.6, 0.9, 1.2, WHITE, 2.2, 38, 0), part(new THREE.CylinderGeometry(1.1, 1.1, 0.2, 10).rotateZ(Math.PI / 2), WHITE, 3, 46, 0), box(1.2, 0.8, 1, WHITE, -2.4, 30, 0)]),
  tower: () => mergeGeometries([cyl(2.0, 1.2, 76, WHITE, 0, 0, 0, 12), box(3.2, 3, 7, WHITE, 0, 76, 0)]),
  rotor: () => mergeGeometries([0, 1, 2].map((k) => part(new THREE.BoxGeometry(1.5, 42, 0.5).translate(0, 22, 0), WHITE, 0, 0, 0, 1, 1, 1, 0, 0, k * 2.094)).concat([part(new THREE.SphereGeometry(1.5, 8, 6), WHITE, 0, 0, 0)])),
};
const TYPES = { pylon: { hp: 90, col: 3.4, hh: 34 }, comms: { hp: 140, col: 3.2, hh: 60 }, tower: { hp: 120, col: 2.4, hh: 76 } };

export class Industry {
  constructor(G) {
    this.G = G; this.group = new THREE.Group(); this.group.name = 'industry'; G.scene.add(this.group); this.t = 0; this.time = 0;
    const S = settlements(), N = net(); this.S = S;
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.25 });
    this.glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    this.P = G.state.places = G.state.places || { dead: {}, ruins: {} }; this.P.fallen = this.P.fallen || {};
    // the instanced things: pylons, comms towers, turbine towers (and one rotor mesh per turbine, turned every frame)
    const items = { pylon: [], comms: [], tower: [] }; this.sites = [];
    for (const l of S.pylons) l.pts.forEach((p, i) => items.pylon.push({ id: l.id + ':' + i, type: 'pylon', x: p[0], z: p[1], y: p[2], line: l, i }));
    for (const t of S.towers) items.comms.push({ id: t.id, type: 'comms', x: t.x, z: t.z, y: N.pads.find((q) => q.id === t.id)?.y ?? t.y, s: t.h / 60 });
    this.turbines = [];
    for (const s of S.industry) if (s.type === 'wind') { const pad = N.pads.find((q) => q.id === s.id); for (let k = 0; k < s.n; k++) { const a = k * 2.399 + s.seed, r = 90 + Math.sqrt(k) * 190, x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r, y = landHeight(x, z, 8); items.tower.push({ id: s.id + ':' + k, type: 'tower', x, z, y: r < 60 ? pad.y : y, site: s, k }); } }
    this.inst = {}; this.items = [];
    for (const [type, list] of Object.entries(items)) {
      const m = new THREE.InstancedMesh(MODELS[type](), this.mat, Math.max(1, list.length)); m.frustumCulled = false; m.count = list.length; this.group.add(m); this.inst[type] = m;
      list.forEach((it, i) => { it.slot = i; it.hp = TYPES[type].hp; it.alive = true; it.fall = null; it.rot = hash(it.x, it.z) * 6.28; it.s = it.s || 1; this.items.push(it); this.place(it); });
      m.instanceMatrix.needsUpdate = true;
    }
    // rotors: one mesh per turbine
    const rg = MODELS.rotor(); this.rotors = [];
    for (const it of this.items) if (it.type === 'tower') { const m = new THREE.Mesh(rg, this.mat); m.frustumCulled = false; this.group.add(m); it.rotor = m; this.rotors.push(it); }
    // beacons on the comms towers (blink) and wires between pylons
    this.beacons = new THREE.InstancedMesh(new THREE.SphereGeometry(0.6, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false, fog: true }), Math.max(1, items.comms.length)); this.beacons.frustumCulled = false; this.group.add(this.beacons);
    this.wires = []; for (const l of S.pylons) this.wire(l);
    // the sites with their own buildings
    for (const s of S.industry) { const site = this.buildSite(s, N.pads.find((q) => q.id === s.id)); if (site) { this.sites.push(site); this.group.add(site.group); } }
    this.refreshBeacons(); this.cb = new Map(); this.stats = { fallen: 0, boxes: 0 };
    for (const it of this.items) { const f = this.P.fallen[it.id]; if (f != null && G.clock.t - f < REBUILD) { it.alive = false; it.hp = 0; it.fall = { t: 9, dx: Math.cos(hash(it.x, 4) * 6.28), dz: Math.sin(hash(it.x, 4) * 6.28), done: true }; this.place(it); } else delete this.P.fallen[it.id]; }
    for (const m of Object.values(this.inst)) m.instanceMatrix.needsUpdate = true; for (const l of S.pylons) this.wire(l);
  }

  // the instance matrix of an item: standing, or tipped over about its foot away from (dx, dz) by the angle of its fall
  place(it) {
    const m = this.inst[it.type], M = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(G0, it.rot), pos = new THREE.Vector3(it.x, it.y, it.z), sc = new THREE.Vector3(it.s, it.s, it.s);
    if (it.fall) { const a = Math.min(1.5, it.fall.ang ?? (it.fall.done ? 1.45 : 0)), ax = new THREE.Vector3(-it.fall.dz, 0, it.fall.dx); q.premultiply(new THREE.Quaternion().setFromAxisAngle(ax, a)); }
    M.compose(pos, q, sc); m.setMatrixAt(it.slot, M);
    if (it.type === 'tower' && it.rotor) this.rotor(it);
  }
  rotor(it) {   // the rotor sits at the nacelle: on top of the tower, turned about the tower's axis, spinning about the horizontal axis along the wind
    const h = 74 * it.s, wind = 0.6 + it.site.seed * 0.1, a = this.time * (0.9 + (it.k % 3) * 0.12) * (it.alive ? 1 : 0), m = it.rotor, yaw = wind;
    if (it.fall) { const k = Math.min(1.5, it.fall.ang ?? (it.fall.done ? 1.45 : 0)), ax = new THREE.Vector3(-it.fall.dz, 0, it.fall.dx), q = new THREE.Quaternion().setFromAxisAngle(ax, k); const p = new THREE.Vector3(0, h, 0).applyQuaternion(q); m.position.set(it.x + p.x, it.y + p.y, it.z + p.z); m.quaternion.copy(q); m.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0))); m.rotateX(Math.PI / 2); return; }
    m.position.set(it.x + Math.sin(yaw) * 5, it.y + h, it.z + Math.cos(yaw) * 5); m.rotation.set(0, yaw, a, 'YXZ'); m.scale.setScalar(1);
  }
  refreshBeacons() { const M = new THREE.Matrix4(); let n = 0; for (const it of this.items) if (it.type === 'comms') { if (it.alive) { M.makeTranslation(it.x, it.y + 66 * it.s, it.z); this.beacons.setMatrixAt(n++, M); } } this.beacons.count = n; this.beacons.instanceMatrix.needsUpdate = true; }

  // the wires of a line: three per span with a sag; beside a fallen pylon they lie on the ground
  wire(l) {
    if (l.mesh) { this.group.remove(l.mesh); l.mesh.geometry.dispose(); }
    const pos = [], P = this.items.filter((it) => it.line === l).sort((a, b) => a.i - b.i);
    for (let i = 0; i + 1 < P.length; i++) {
      const a = P[i], b = P[i + 1];
      for (const off of [-4.4, 0, 4.4]) for (let k = 0; k < 6; k++) {
        const pt = (t) => { const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, ya = a.alive ? a.y + 31 : a.y + 0.6, yb = b.alive ? b.y + 31 : b.y + 0.6, sag = a.alive && b.alive ? 5 * 4 * t * (1 - t) : 0.4 * Math.sin(t * 3.14), dx = b.x - a.x, dz = b.z - a.z, l2 = Math.hypot(dx, dz) || 1; return [x + (-dz / l2) * off * (a.alive ? 1 : 0.4), ya + (yb - ya) * t - sag, z + (dx / l2) * off * (a.alive ? 1 : 0.4)]; };
        pos.push(...pt(k / 6), ...pt((k + 1) / 6));
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(pos), 3));
    l.mesh = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x15171c })); l.mesh.frustumCulled = false; this.group.add(l.mesh);
  }

  // ---------------------------------------------------------------- the sites
  buildSite(s, pad) {
    const y = pad?.y ?? s.y, g = new THREE.Group(), geo = [], glow = [], R = (k) => hash(s.seed, k);
    g.position.set(s.x, y, s.z);
    if (s.type === 'solar') {   // rows of tilted panels on posts: 12 rows of 20 panels
      for (let r = 0; r < 14; r++) for (let c = 0; c < 18; c++) { const x = (c - 8.5) * 7.2, z = (r - 6.5) * 9; geo.push(part(new THREE.BoxGeometry(6.2, 0.12, 3.6).translate(0, 1.7, 0), [0.04, 0.09, 0.2], x, 0, z, 1, 1, 1, -0.5, 0, 0)); geo.push(box(0.15, 1.6, 0.15, STEEL, x, 0, z)); }
      geo.push(box(10, 3.4, 7, WHITE, 78, 0, 0), box(9, 0.3, 6, STEEL, 78, 3.4, 0));
    } else if (s.type === 'mine') {
      geo.push(box(14, 9, 12, [0.4, 0.38, 0.33], -20, 0, -10), box(10, 5, 8, [0.45, 0.4, 0.3], 28, 0, 8), mast(22, 6, null, [0.5, 0.35, 0.1]), box(22, 0.5, 1.4, [0.2, 0.2, 0.22], 0, 13, 0, 0, 0, 0.35));
      for (let k = 0; k < 4; k++) { const a = k * 1.7 + 0.5, r = 55 + k * 14; geo.push(part(new THREE.ConeGeometry(14 + k * 3, 11 + k * 2, 7).translate(0, (11 + k * 2) / 2, 0), [0.28 + 0.04 * k, 0.26, 0.23], Math.cos(a) * r, 0, Math.sin(a) * r)); }
      for (let k = 0; k < 3; k++) geo.push(box(5, 2.4, 3, [0.8, 0.55, 0.1], -30 + k * 9, 0, 30), box(2.4, 2, 2.8, [0.25, 0.25, 0.28], -27 + k * 9, 2.4, 30));
    } else if (s.type === 'refinery') {
      for (let k = 0; k < 9; k++) { const x = (k % 3 - 1) * 36, z = (Math.floor(k / 3) - 1) * 36 - 40, r = 13 + (k % 2) * 3, h = 12 + R(k) * 6; geo.push(cyl(r, r, h, [0.7, 0.72, 0.74], x, 0, z, 16), part(new THREE.CylinderGeometry(r, r * 0.8, 2.2, 16).translate(0, h + 1.1, 0), [0.62, 0.64, 0.66], x, 0, z)); }
      for (let k = 0; k < 4; k++) geo.push(cyl(3.2, 2.2, 38 + k * 5, [0.62, 0.62, 0.64], -80 + k * 12, 0, 40, 10), box(2, 0.6, 30, [0.4, 0.4, 0.42], -74 + k * 12, 12, 40));
      geo.push(box(30, 8, 16, [0.5, 0.5, 0.52], 60, 0, 40), box(16, 12, 14, [0.46, 0.46, 0.5], 100, 0, 10), box(120, 1, 1.2, [0.4, 0.35, 0.3], 0, 6, -10), box(1.2, 1, 80, [0.4, 0.35, 0.3], 0, 5, -40));
      geo.push(cyl(1.2, 0.6, 55, [0.5, 0.5, 0.52], 90, 0, -70, 8)); glow.push(box(1, 2.2, 1, [4, 2.2, 0.5], 90, 55, -70)); s.flare = { x: 90, y: 57, z: -70 };
      for (let k = 0; k < 14; k++) glow.push(box(0.5, 0.5, 0.5, [2.2, 1.9, 1.2], -100 + k * 14, 13.5 + (k % 3), -78));
    }
    if (s.type === 'wind') return null;
    const m = new THREE.Mesh(mergeGeometries(geo), this.mat); m.frustumCulled = true; g.add(m); s.m = m;
    if (glow.length) { const gm = new THREE.Mesh(mergeGeometries(glow), this.glow); g.add(gm); }
    if (s.flare) { const f = new THREE.Mesh(new THREE.PlaneGeometry(5, 12).translate(0, 6, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 2.4, 0.5), toneMapped: false, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide })); f.position.set(s.flare.x, s.flare.y, s.flare.z); g.add(f); s.flameMesh = f; }
    return { s, group: g, y, tanks: s.type === 'refinery' ? Array.from({ length: 9 }, (_, k) => ({ x: s.x + (k % 3 - 1) * 36, z: s.z + (Math.floor(k / 3) - 1) * 36 - 40, r: 13 + (k % 2) * 3, hp: 160, burning: 0 })) : [] };
  }

  // ---------------------------------------------------------------- every frame
  update(dt, cam, focus) {
    this.time += dt; this.t -= dt; const bl = Math.sin(this.time * 4.4) > 0.55;
    this.beacons.visible = bl || nightU.value > 0.5; this.beacons.material.opacity = 1;
    for (const it of this.rotors) if (Math.hypot(it.x - cam.position.x, it.z - cam.position.z) < 5000) this.rotor(it);
    for (const st of this.sites) { const d = Math.hypot(st.s.x - cam.position.x, st.s.z - cam.position.z); st.group.visible = d < SITE_VIS; if (st.s.flameMesh && st.group.visible) { const f = st.s.flameMesh; f.scale.set(0.8 + 0.4 * Math.sin(this.time * 17) * Math.sin(this.time * 5.3), 0.7 + 0.5 * Math.abs(Math.sin(this.time * 9.1 + 1)), 1); f.lookAt(cam.position.x - st.group.position.x, f.position.y, cam.position.z - st.group.position.z); f.rotation.x = 0; } for (const tk of st.tanks) if (tk.burning > 0) { tk.burning -= dt; if (Math.random() < dt * 8) this.G.smokeP.emit(tk.x + rand(-5, 5), st.y + 14, tk.z + rand(-5, 5), rand(-1, 1), rand(4, 9), rand(-1, 1), rand(4, 7), rand(5, 9), 0.05, 0.05, 0.06, 0.8, 0.2, 0.4); } }
    // falls
    let moved = false;
    for (const it of this.items) { const f = it.fall; if (!f || f.done) continue; f.t += dt; const T = it.type === 'pylon' ? 1.8 : 2.8, k = Math.min(1, f.t / T); f.ang = 1.45 * (k * k * (1.4 - 0.4 * k)); if (k >= 1) { f.done = true; f.ang = 1.45; this.dust(it); if (it.line) this.wire(it.line); } this.place(it); moved = true; }
    if (moved) for (const m of Object.values(this.inst)) m.instanceMatrix.needsUpdate = true;
    // colliders for what stands near the player
    if (this.t <= 0) { this.t = 0.5; this.colliders(focus); }
  }
  dust(it) { const G = this.G; for (let k = 0; k < 18; k++) G.smokeP.emit(it.x + rand(-4, 4) + it.fall.dx * 20, it.y + rand(0, 2), it.z + rand(-4, 4) + it.fall.dz * 20, rand(-2, 2), rand(1, 4), rand(-2, 2), rand(3, 6), rand(3, 6), 0.12, 0.11, 0.1, 0.8, 0.2, 0.4); G.audio.explosion?.(0.8, 0); }
  colliders(focus) {
    const col = this.G.world.colliders;
    for (const it of this.items) {
      const near = it.alive && Math.hypot(it.x - focus.x, it.z - focus.z) < COLL, has = this.cb.get(it.id);
      if (near && !has) { const w = TYPES[it.type].col * 0.6 * it.s; this.cb.set(it.id, col.addBox(it.x - w, it.z - w, it.x + w, it.z + w, it.y + 7, 'tower', it.y - 0.5)); }
      else if (!near && has) { col.removeBox(has); this.cb.delete(it.id); }
    }
    for (const st of this.sites) if (st.s.type === 'refinery' || st.s.type === 'mine') {
      const near = Math.hypot(st.s.x - focus.x, st.s.z - focus.z) < COLL + 120, has = st.cb;
      if (near && !has) { st.cb = st.tanks.map((tk) => col.addBox(tk.x - tk.r, tk.z - tk.r, tk.x + tk.r, tk.z + tk.r, st.y + 12, 'tower', st.y)); }
      else if (!near && has) { for (const b of has) col.removeBox(b); st.cb = null; }
    }
    this.stats.boxes = this.cb.size;
  }

  // explosions
  blast(x, y, z, radius, dmg, src) {
    const G = this.G;
    for (const it of this.items) {
      if (!it.alive) continue; const d = Math.hypot(it.x - x, it.z - z); if (d > radius + 4) continue;
      it.hp -= dmg * (1 - Math.max(0, d - 2) / (radius + 4)) * 1.2; if (it.hp > 0) continue;
      it.alive = false; it.fall = { t: 0, dx: d > 0.5 ? (it.x - x) / d : 1, dz: d > 0.5 ? (it.z - z) / d : 0, ang: 0 }; this.P.fallen[it.id] = G.clock.t; this.stats.fallen++;
      if (it.type === 'comms') this.refreshBeacons(); const has = this.cb.get(it.id); if (has) { G.world.colliders.removeBox(has); this.cb.delete(it.id); }
      G.memory?.log('collapse', it.x, it.z, { city: '', text: it.type === 'pylon' ? '송전탑 붕괴' : it.type === 'comms' ? '통신탑 붕괴' : '풍력 터빈 붕괴' }); G.addHeat?.(8);
    }
    for (const st of this.sites) for (const tk of st.tanks) {
      const d = Math.hypot(tk.x - x, tk.z - z); if (tk.hp <= 0 || d > radius + tk.r) continue; tk.hp -= dmg * (1 - Math.max(0, d - tk.r) / (radius + tk.r)); if (tk.hp > 0) continue;
      tk.burning = 60; G.fire?.ignite?.(tk.x, tk.z, { fuel: 30, r: 6, src: null }); G.explosion?.(tk.x, st.y + 6, tk.z, 16, 160, src);
    }
  }
  dispose() { this.G.scene.remove(this.group); this.group.traverse((o) => { o.geometry?.dispose?.(); }); for (const b of this.cb.values()) this.G.world.colliders.removeBox(b); }
}
export { timeUniform };
