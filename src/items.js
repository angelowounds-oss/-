import * as THREE from 'three';
import { GR, grp } from './physics.js';
import { clamp, damp, rand } from './util.js';

// ====================================================================
// Items: catalogue, physical props (grab / carry / throw / kick), inventory, containers
// ====================================================================
export const ITEMS = {
  // id: name, shape [kind,...dims], color, mass, price, use
  burger: { name: '버거', shape: ['box', 0.14, 0.09, 0.14], color: 0xc08a40, mass: 0.3, price: 6, eat: { food: 32 } },
  noodles: { name: '컵라면', shape: ['cyl', 0.07, 0.11], color: 0xd04030, mass: 0.35, price: 4, eat: { food: 38 } },
  sandwich: { name: '샌드위치', shape: ['box', 0.2, 0.06, 0.1], color: 0xd8c898, mass: 0.25, price: 5, eat: { food: 26 } },
  soda: { name: '탄산음료', shape: ['cyl', 0.033, 0.12], color: 0xe03040, mass: 0.35, price: 2, eat: { water: 24 }, throwDmg: 2 },
  water: { name: '생수', shape: ['cyl', 0.035, 0.2], color: 0x70b8e0, mass: 0.5, price: 2, eat: { water: 40 } },
  coffee: { name: '커피', shape: ['cyl', 0.04, 0.12], color: 0x6a4630, mass: 0.3, price: 3, eat: { water: 10, energy: 30 } },
  energy: { name: '에너지 드링크', shape: ['cyl', 0.03, 0.14], color: 0x40ff90, mass: 0.3, price: 4, eat: { energy: 45, water: 8 } },
  medkit: { name: '구급상자', shape: ['box', 0.26, 0.1, 0.18], color: 0xf0f0f0, mass: 0.8, price: 40, heal: 60 },
  bandage: { name: '붕대', shape: ['box', 0.1, 0.04, 0.06], color: 0xf0e8d8, mass: 0.1, price: 8, heal: 20 },
  pills: { name: '진통제', shape: ['cyl', 0.03, 0.06], color: 0xe0e0ff, mass: 0.05, price: 15, heal: 25, eat: { energy: -10 } },
  lockpick: { name: '락픽', shape: ['box', 0.12, 0.01, 0.02], color: 0xb0b0b8, mass: 0.05, price: 35, tool: 'lockpick' },
  crowbar: { name: '빠루', shape: ['box', 0.5, 0.03, 0.03], color: 0x703030, mass: 1.6, price: 30, tool: 'crowbar', melee: { dmg: 28, rate: 0.55, name: '빠루' } },
  bat: { name: '야구 방망이', shape: ['cyl', 0.035, 0.85], color: 0xb08850, mass: 1.1, price: 25, melee: { dmg: 24, rate: 0.5, name: '방망이' }, laid: true },
  knife: { name: '단검', shape: ['box', 0.22, 0.015, 0.03], color: 0xc8ccd8, mass: 0.2, price: 30, melee: { dmg: 22, rate: 0.35, name: '단검' } },
  flashlight: { name: '손전등', shape: ['cyl', 0.03, 0.18], color: 0x303040, mass: 0.3, price: 18, tool: 'flashlight' },
  grenade: { name: '수류탄', shape: ['ball', 0.045], color: 0x405030, mass: 0.4, price: 90, grenade: true },
  mag_pistol: { name: '권총 탄창', shape: ['box', 0.03, 0.1, 0.07], color: 0x303038, mass: 0.2, price: 12, ammo: [0, 12] },
  mag_rifle: { name: '카빈 탄창', shape: ['box', 0.035, 0.16, 0.08], color: 0x303038, mass: 0.3, price: 20, ammo: [1, 30] },
  watch: { name: '명품 시계', shape: ['cyl', 0.03, 0.02], color: 0xe8c860, mass: 0.1, price: 420, valuable: true },
  laptop: { name: '노트북', shape: ['box', 0.34, 0.03, 0.24], color: 0x404858, mass: 1.6, price: 600, valuable: true },
  gold: { name: '금괴', shape: ['box', 0.18, 0.04, 0.08], color: 0xf0c030, mass: 2.0, price: 900, valuable: true },
  cashroll: { name: '현금 뭉치', shape: ['box', 0.16, 0.06, 0.08], color: 0x40a060, mass: 0.2, price: 300, valuable: true, cash: 300 },
  docs: { name: '기밀 문서', shape: ['box', 0.3, 0.02, 0.22], color: 0xe8e0c8, mass: 0.2, price: 220, valuable: true },
  keycard: { name: '보안 카드', shape: ['box', 0.085, 0.003, 0.054], color: 0x40d0ff, mass: 0.02, price: 50, tool: 'keycard' },
  bottle: { name: '병', shape: ['cyl', 0.04, 0.26], color: 0x2a6a40, mass: 0.5, price: 1, fragile: true, throwDmg: 6 },
  brick: { name: '벽돌', shape: ['box', 0.2, 0.065, 0.1], color: 0x904830, mass: 2.0, price: 0, throwDmg: 12 },
  can: { name: '빈 캔', shape: ['cyl', 0.033, 0.12], color: 0xa0a0a8, mass: 0.05, price: 0, throwDmg: 1 },
  cigarette: { name: '담배', shape: ['box', 0.1, 0.01, 0.01], color: 0xf0f0f0, mass: 0.01, price: 8 },
  newspaper: { name: '신문', shape: ['box', 0.3, 0.02, 0.22], color: 0xd0d0d0, mass: 0.1, price: 2 },
  // furniture-like props (heavy ones can only be carried)
  chair: { name: '의자', shape: ['box', 0.46, 0.9, 0.46], color: 0x3a3f4d, mass: 6, price: 0, furniture: true, sit: true, h: 0.45 },
  stool: { name: '스툴', shape: ['cyl', 0.2, 0.5], color: 0x4a3a30, mass: 3, price: 0, furniture: true, sit: true, h: 0.5 },
  crate: { name: '나무 상자', shape: ['box', 0.55, 0.45, 0.45], color: 0x7a5a38, mass: 8, price: 0, furniture: true },
  box: { name: '박스', shape: ['box', 0.4, 0.3, 0.35], color: 0xa08868, mass: 4, price: 0, furniture: true, container: 6 },
  trash: { name: '쓰레기통', shape: ['cyl', 0.28, 0.7], color: 0x384048, mass: 5, price: 0, furniture: true, container: 4 },
  extinguisher: { name: '소화기', shape: ['cyl', 0.07, 0.38], color: 0xd02020, mass: 3, price: 0, furniture: true, throwDmg: 8 },
  houseplant: { name: '화분', shape: ['cyl', 0.2, 0.45], color: 0x2f6a46, mass: 4, price: 0, furniture: true, throwDmg: 5, fragile: true },
};
export const ITEM_IDS = Object.keys(ITEMS);
const SMALL = 2.5;

const geoCache = new Map(), matCache = new Map();
function meshFor(id) {
  const d = ITEMS[id];
  let g = geoCache.get(id);
  if (!g) {
    const [k, a, b, c] = d.shape;
    g = k === 'box' ? new THREE.BoxGeometry(a, b, c) : k === 'cyl' ? new THREE.CylinderGeometry(a, a, b, 14) : new THREE.SphereGeometry(a, 12, 10);
    if (d.laid) g.rotateZ(Math.PI / 2);
    geoCache.set(id, g);
  }
  let m = matCache.get(id);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.55, metalness: d.valuable ? 0.8 : 0.1, emissive: d.valuable ? d.color : 0x000000, emissiveIntensity: d.valuable ? 0.18 : 0 }); matCache.set(id, m); }
  const mesh = new THREE.Mesh(g, m); mesh.castShadow = false; mesh.frustumCulled = true; return mesh;
}
export const itemName = (id) => ITEMS[id]?.name || id;

export class Prop {
  constructor(W, rec) {
    this.W = W; this.rec = rec; this.id = rec.id; this.def = ITEMS[rec.id]; this.key = rec.key; this.isProp = true;
    const G = W.G, R = G.RAPIER, w = G.phys.world, d = this.def;
    this.mesh = meshFor(rec.id); G.scene.add(this.mesh);
    const [k, a, b, c] = d.shape;
    const body = this.body = w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(rec.x, rec.y, rec.z).setRotation(rec.q || { x: 0, y: 0, z: 0, w: 1 }).setLinearDamping(0.25).setAngularDamping(0.6).setCcdEnabled(!d.furniture));
    let cd;
    if (k === 'box') cd = R.ColliderDesc.cuboid(a / 2, b / 2, c / 2); else if (k === 'cyl') cd = d.laid ? R.ColliderDesc.cylinder(b / 2, a).setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }) : R.ColliderDesc.cylinder(b / 2, a); else cd = R.ColliderDesc.ball(a);
    this.col = w.createCollider(cd.setMass(d.mass).setFriction(0.7).setRestitution(d.fragile ? 0.05 : 0.25).setCollisionGroups(grp(GR.PROP, 0xffff)).setActiveEvents(R.ActiveEvents.COLLISION_EVENTS), body);
    G.phys.colRef.set(this.col.handle, this);
    this.carried = false; this.sale = rec.sale || 0; this.verbsCache = null;
    this.sync();
  }
  get x() { return this.body.translation().x; } get y() { return this.body.translation().y; } get z() { return this.body.translation().z; }
  sync() { const t = this.body.translation(), q = this.body.rotation(); this.mesh.position.set(t.x, t.y, t.z); this.mesh.quaternion.set(q.x, q.y, q.z, q.w); }
  hit(dx, dy, dz, dmg) { this.body.applyImpulse({ x: dx * dmg * 0.04, y: dy * dmg * 0.04 + 0.1, z: dz * dmg * 0.04 }, true); this.body.wakeUp(); if (this.def.fragile && dmg > 5) this.shatter(); }
  shatter() { const G = this.W.G; G.audio.glass?.(0); const p = this.body.translation(); G.sparksP.emit(p.x, p.y, p.z, 0, 2, 0, 0.5, 0.1, 1.5, 2, 1.5, 1, -12, 0.3); this.W.remove(this, true); }
  record() { const t = this.body.translation(), q = this.body.rotation(); Object.assign(this.rec, { x: t.x, y: t.y, z: t.z, q: { x: q.x, y: q.y, z: q.z, w: q.w } }); return this.rec; }
  dispose() { const G = this.W.G; G.phys.colRef.delete(this.col.handle); G.phys.world.removeRigidBody(this.body); G.scene.remove(this.mesh); }
}

export class ItemWorld {
  constructor(G) {
    this.G = G; this.recs = new Map(); this.props = new Map();
    this.nextId = 1; this.t = 0; this.carry = null; this.carryDist = 1.7;
    this.inv = G.state.inv || (G.state.inv = { items: {}, unpaid: {}, equipped: null });
    if (!G.state.dropped) G.state.dropped = [];
    for (const r of G.state.dropped) this.recs.set(r.key, r);
    G.state.taken = G.state.taken || {};
    G.state.containers = G.state.containers || {};
    G.interact.providers.push((pl, out) => this.provider(pl, out));
    G.phys.onPropHit = null;
  }
  // ---------- world records ----------
  // generated spawn (floor furnishing, shop stock, street litter). key must be stable.
  register(key, id, x, y, z, extra = {}) {
    if (this.G.state.taken[key]) return null;
    const saved = this.G.state.moved?.[key];
    let r = this.recs.get(key);
    if (!r) { r = { key, id, x, y, z, ...extra }; if (saved) Object.assign(r, saved); this.recs.set(key, r); }
    return r;
  }
  unregisterNear(pred) { for (const [k, r] of [...this.recs]) if (pred(r)) { const p = this.props.get(k); if (p) this.remove(p, false, true); this.recs.delete(k); } }
  drop(id, x, y, z, vel) {
    const key = 'd' + Date.now().toString(36) + (this.nextId++);
    const r = { key, id, x, y, z, dropped: true };
    this.G.state.dropped.push(r); this.recs.set(key, r);
    const p = this.spawn(r); if (p && vel) p.body.setLinvel(vel, true); return p;
  }
  spawn(r) {
    if (this.props.has(r.key)) return this.props.get(r.key);
    const p = new Prop(this, r); this.props.set(r.key, p); return p;
  }
  // delete from the world; `destroy`=gone forever, otherwise (pickup) marks taken
  remove(p, destroy = false, keepRecord = false) {
    this.props.delete(p.key);
    if (this.carry === p) this.carry = null;
    if (!keepRecord) {
      if (p.rec.dropped) { const i = this.G.state.dropped.indexOf(p.rec); if (i >= 0) this.G.state.dropped.splice(i, 1); } else this.G.state.taken[p.key] = true;
      this.recs.delete(p.key);
    }
    p.dispose();
  }
  update(dt) {
    const G = this.G, pl = G.player;
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 0.35;
      const R2 = 34 * 34;
      for (const [k, r] of this.recs) {
        const p = this.props.get(k);
        const dx = r.x - pl.x, dz = r.z - pl.z, dy = r.y - pl.y, d2 = dx * dx + dz * dz + dy * dy * 4;
        if (!p && d2 < R2) { if (this.props.size < 260) this.spawn(r); }
        else if (p && d2 > R2 * 2.2 && !p.carried) { p.record(); if (!r.dropped) (G.state.moved[k] = { x: r.x, y: r.y, z: r.z, q: r.q }); this.props.delete(k); p.dispose(); }
      }
    }
    for (const p of this.props.values()) if (!p.body.isSleeping() || p.carried) p.sync();
    this.updateCarry(dt);
  }
  // ---------- carrying ----------
  grab(p) {
    if (this.carry) return;
    if (p.def.mass > 30) { this.G.toast('너무 무겁다'); return; }
    this.carry = p; p.carried = true; p.body.setGravityScale(0.2, true); p.body.setLinearDamping(6); p.body.setAngularDamping(6); p.body.wakeUp();
    this.G.player.carrying = p;
  }
  release(throwIt) {
    const p = this.carry; if (!p) return; const G = this.G;
    this.carry = null; p.carried = false; G.player.carrying = null;
    p.body.setGravityScale(1, true); p.body.setLinearDamping(0.25); p.body.setAngularDamping(0.6); p.body.wakeUp();
    if (throwIt) {
      const dir = G.tmpV.set(0, 0, -1).applyQuaternion(G.camera.quaternion);
      const sp = clamp(18 / Math.sqrt(p.def.mass), 5, 22);
      p.body.setLinvel({ x: dir.x * sp, y: dir.y * sp + 1.5, z: dir.z * sp }, true);
      p.body.setAngvel({ x: rand(-6, 6), y: rand(-6, 6), z: rand(-6, 6) }, true);
      p.thrownBy = G.player; p.thrownT = G.time;
      G.audio.tone?.(300, 0.08, 'sine', 0.06, 150);
    }
  }
  updateCarry(dt) {
    const p = this.carry; if (!p) return;
    const G = this.G, pl = G.player, cam = G.camera;
    const dir = G.tmpV.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const t = { x: pl.x + dir.x * this.carryDist, y: pl.y + 1.3 + dir.y * this.carryDist * 0.6, z: pl.z + dir.z * this.carryDist };
    const c = p.body.translation();
    const k = 14 / Math.max(1, Math.sqrt(p.def.mass));
    p.body.setLinvel({ x: (t.x - c.x) * k, y: (t.y - c.y) * k, z: (t.z - c.z) * k }, true);
    if (Math.hypot(t.x - c.x, t.z - c.z) > 3.2 || pl.dead) this.release(false);
  }
  // ---------- inventory ----------
  count(id) { return this.inv.items[id] || 0; }
  add(id, n = 1) { this.inv.items[id] = (this.inv.items[id] || 0) + n; }
  take(id, n = 1) { if (this.count(id) < n) return false; this.inv.items[id] -= n; if (this.inv.items[id] <= 0) delete this.inv.items[id]; return true; }
  weight() { let w = 0; for (const [id, n] of Object.entries(this.inv.items)) w += (ITEMS[id]?.mass || 0.2) * n; return w; }
  pickup(p) {
    const d = p.def; if (d.mass > SMALL) { this.grab(p); return; }
    if (this.weight() + d.mass > 25) { this.G.toast('가방이 가득 찼습니다'); return; }
    if (p.sale) { this.inv.unpaid[p.id] = (this.inv.unpaid[p.id] || 0) + 1; this.inv.unpaidCost = (this.inv.unpaidCost || 0) + p.sale; this.G.toast(`${d.name}`, `계산대에서 $${p.sale} 지불`); }
    this.add(p.id, 1); this.remove(p); this.G.audio.tone?.(900, 0.05, 'sine', 0.05);
    this.G.onItemChange?.();
  }
  // consume / use from the inventory or the world
  use(id) {
    const d = ITEMS[id], G = this.G, pl = G.player;
    if (!d || !this.take(id)) return false;
    if (d.heal) { pl.hpv = Math.min(100, pl.hpv + d.heal); G.toast('치료', `+${d.heal} HP`); }
    if (d.eat) G.needs?.apply(d.eat);
    if (d.cash) { G.cash += d.cash; G.toast(`+$${d.cash}`); G.audio.cash(); }
    if (d.ammo) { pl.ammo[d.ammo[0]].reserve += d.ammo[1]; G.toast('탄약 +' + d.ammo[1]); }
    if (d.eat || d.heal) G.audio.tone?.(520, 0.1, 'triangle', 0.08, 380);
    if (!d.heal && !d.eat && !d.cash && !d.ammo) { this.add(id); return false; }
    G.onItemChange?.();
    return true;
  }
  dropFromInv(id, n = 1) {
    if (!this.take(id, n)) return;
    const G = this.G, pl = G.player, dir = G.tmpV.set(Math.sin(pl.ry), 0, Math.cos(pl.ry));
    for (let i = 0; i < n; i++) this.drop(id, pl.x + dir.x * 0.8, pl.y + 1.1, pl.z + dir.z * 0.8, { x: dir.x * 1.5, y: 1, z: dir.z * 1.5 });
    G.onItemChange?.();
  }
  // ---------- interaction provider ----------
  provider(pl, out) {
    if (this.carry) {
      out.push({ x: pl.x, z: pl.z, cy: pl.y + 1, r: 99, name: this.carry.def.name, verbs: [
        { key: 'F', label: () => '내려놓기', run: () => this.release(false) },
        { key: 'G', label: () => '던지기', run: () => this.release(true) },
      ] });
      return;
    }
    let best = null, bd = 2.3;
    const cam = this.G.camera;
    const fx = Math.sin(this.G.cam.yaw), fz = Math.cos(this.G.cam.yaw);
    for (const p of this.props.values()) {
      const t = p.body.translation(), dx = t.x - pl.x, dz = t.z - pl.z, dy = t.y - (pl.y + 0.9);
      const d = Math.hypot(dx, dz, dy * 0.8);
      if (d > bd) continue;
      const facing = (dx * fx + dz * fz) / (Math.hypot(dx, dz) + 1e-3);
      if (facing < 0.25 && d > 1.0) continue;
      const score = d - facing * 0.8; if (!best || score < best.s) best = { p, s: score, d };
    }
    if (!best) return;
    const p = best.p, d = p.def, t = p.body.translation();
    const verbs = [];
    if (d.mass <= SMALL) verbs.push({ key: 'F', label: () => (p.sale ? `집기 · $${p.sale}` : '줍기'), run: () => this.pickup(p) });
    else verbs.push({ key: 'F', label: () => '들기', run: () => this.grab(p) });
    if (d.eat || d.heal) verbs.push({ key: 'G', label: () => '바로 사용', run: () => { this.pickup(p); if (this.inv.items[p.id]) { this.use(p.id); } } });
    else if (d.sit) verbs.push({ key: 'G', label: () => '앉기', run: () => this.G.sitOn?.({ x: t.x, y: t.y - d.shape[2 === 2 ? 2 : 1] / 2, z: t.z }, p) });
    else if (d.container) verbs.push({ key: 'G', label: () => '뒤져보기', run: () => this.G.openContainer?.(this.containerFor(p)) });
    else if (d.melee) verbs.push({ key: 'G', label: () => '장비', run: () => { this.pickup(p); this.G.equipMelee?.(p.id); } });
    verbs.push({ key: 'T', label: () => '발로 차기', run: () => { const dx = t.x - pl.x, dz = t.z - pl.z, l = Math.hypot(dx, dz) || 1; p.body.applyImpulse({ x: dx / l * d.mass * 5, y: d.mass * 1.5, z: dz / l * d.mass * 5 }, true); p.body.wakeUp(); this.G.audio.impact?.(0.4, 0); } });
    out.push({ x: t.x, z: t.z, cy: t.y, r: 2.6, name: d.name + (p.sale ? ` $${p.sale}` : ''), verbs });
  }
  containerFor(p) {
    const key = 'c:' + p.key;
    const st = this.G.state.containers;
    if (!st[key]) st[key] = { name: p.def.name, items: {} };
    return { key, ...st[key], ref: st[key] };
  }
}
