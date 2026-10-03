import * as THREE from 'three';
import { Builder, mats, disposeGroup } from './gfx.js';
import { GR, grp } from './physics.js';
import { accentColor, BAY } from './world.js';
import { mulberry32, clamp, lerp, damp, TAU, LIGHT_CAP } from './util.js';

// ====================================================================
// Physically continuous buildings: every road-facing tower has a real entrance, real floors,
// a stair core, a working elevator and an accessible roof. Interiors are streamed around the
// player (shell colliders + meshes are built per-floor on demand and torn down when far).
// ====================================================================
const FH = 4.0, SLAB = 0.35, WALL = 0.5, ACT_R = 62, DROP_R = 96;
const CORE_W = 6.6, CORE_D = 6.0, COR_W = 2.6;

const hexc = (h) => new THREE.Color(h);
const KINDS = ['apartment', 'office', 'hotel'];

export class Building {
  constructor(mgr, lot) {
    this.M = mgr; this.G = mgr.G; this.lot = lot; this.id = lot.id; this.name = lot.name; this.door = lot.door;
    this.accent = accentColor(lot.accent);
    this.rnd = mulberry32(Math.floor(lot.seed * 1000) + 17);
    this.open = false; this.floors = new Map(); this.planned = false;
    this.cx = (lot.x0 + lot.x1) / 2; this.cz = (lot.z0 + lot.z1) / 2;
    this.kind = KINDS[Math.floor(lot.seed * 13) % 3];
    this.group = null; this.doors = []; this.ctx = [];
  }
  // ---------- plan ----------
  plan() {
    if (this.planned) return; this.planned = true;
    const t = this.lot.tiers, pod = t.podium, tow = t.tower;
    this.pod = pod; this.tow = tow;
    const np = Math.max(1, Math.round(pod.y1 / FH)), fhp = pod.y1 / np;
    const nt = Math.max(2, Math.floor((tow.y1 - tow.y0) / FH)), fht = (tow.y1 - tow.y0) / nt;
    const L = [];
    for (let i = 0; i < np; i++) L.push({ y: i * fhp, h: fhp, tier: 'podium', rect: pod, slab: i === 0 ? null : pod, type: i === 0 ? 'lobby' : 'retail' });
    for (let j = 0; j < nt; j++) L.push({ y: pod.y1 + j * fht, h: fht, tier: 'tower', rect: tow, slab: j === 0 ? pod : tow, type: this.kind });
    L.push({ y: tow.y1, h: 3.4, tier: 'roof', rect: tow, slab: tow, type: 'roof' });
    L.forEach((l, k) => { l.k = k; });
    this.levels = L;
    this.core = { x0: tow.x0 + WALL, z0: tow.z0 + WALL };
    this.core.zc = this.core.z0 + CORE_D;
    this.shaft = { x0: this.core.x0 + 3.6, x1: this.core.x0 + CORE_W - 0.2, z0: this.core.zc - 2.8, z1: this.core.zc };
    this.stairB = { x0: this.core.x0 + 1.8, x1: this.core.x0 + 3.4, z0: this.core.z0, z1: this.core.zc };
    this.roofY = tow.y1;
  }
  levelAt(y) { const L = this.levels; let k = 0; for (let i = 0; i < L.length; i++) if (y >= L[i].y - 0.6) k = i; return k; }

  // ---------- open / close ----------
  activate() {
    if (this.open) return; this.plan(); this.open = true;
    const G = this.G, lot = this.lot, col = G.world.colliders;
    this.group = new THREE.Group(); G.scene.add(this.group);
    col.removeBox(lot.solid); lot.solid = null;
    // crown (non walkable) stays solid above the roof
    const cr = lot.tiers.crown;
    if (cr) this.crownBox = col.addBox(cr.x0, cr.z0, cr.x1, cr.z1, cr.y1 + 2, 'building', cr.y0);
    this.boxes = [];
    this.built = new Set(); this.pending = [];
    this.elev = new Elevator(this);
    this.solidTower = null;
    this.ensureRange(0, Math.min(3, this.levels.length - 1), false);
    this.buildFloor(0); this.pending = this.pending.filter((k) => k !== 0);
    this.updateSolid();
  }
  deactivate() {
    if (!this.open) return; this.open = false;
    const col = this.G.world.colliders;
    for (const k of [...this.floors.keys()]) this.dropFloor(k);
    this.elev?.destroy(); this.elev = null;
    if (this.solidTower) for (const b of this.solidTower) col.removeBox(b);
    this.solidTower = null;
    if (this.crownBox) { col.removeBox(this.crownBox); this.crownBox = null; }
    disposeGroup(this.group); this.group = null;
    this.lot.solid = col.addBox(this.lot.x0, this.lot.z0, this.lot.x1, this.lot.z1, this.lot.h + 5, 'building');
  }
  // keep floors [a..b] built, drop others (outside a margin)
  ensureRange(a, b, now = false) {
    const keep = new Set();
    // podium + level0 always present while open
    for (let k = 0; k < this.levels.length; k++) if (this.levels[k].tier === 'podium') keep.add(k);
    for (let k = Math.max(0, a); k <= Math.min(this.levels.length - 1, b); k++) keep.add(k);
    for (const k of [...this.floors.keys()]) if (!keep.has(k)) this.dropFloor(k);
    for (const k of keep) if (!this.floors.has(k) && !this.pending.includes(k)) { if (now) this.buildFloor(k); else this.pending.push(k); }
  }
  // solid box(es) covering the unbuilt tower volume, so bullets/cars/camera still see a building
  updateSolid() {
    const col = this.G.world.colliders;
    if (this.solidTower) for (const b of this.solidTower) col.removeBox(b);
    this.solidTower = [];
    const tow = this.tow, L = this.levels;
    let run = null;
    const flush = (yEnd) => { if (run != null && yEnd > run) this.solidTower.push(col.addBox(tow.x0, tow.z0, tow.x1, tow.z1, yEnd, 'building', run)); run = null; };
    for (let k = 0; k < L.length - 1; k++) {
      const lv = L[k]; if (lv.tier !== 'tower') continue;
      const top = lv.y + lv.h;
      if (!this.floors.has(k)) { if (run == null) run = lv.y + 0.0; }
      else flush(lv.y);
    }
    flush(this.levels[this.levels.length - 1].y + 0.0);
    // everything above the roof level is the crown/air; nothing else
  }
  tick(dt) {
    if (this.pending.length) { const k = this.pending.shift(); if (!this.floors.has(k)) { this.buildFloor(k); if (this.levels[k].tier !== 'podium') this.updateSolid(); } }
    this.elev?.update(dt);
    for (const d of this.doors) d.update(dt);
  }
  // ====================================================================
  // floor construction
  // ====================================================================
  buildFloor(k) {
    const G = this.G, col = G.world.colliders, L = this.levels[k], r = L.rect;
    const fl = { k, boxes: [], bodies: [], doors: [], fixtures: [], interact: [], group: new THREE.Group(), glass: [], props: [] };
    this.group.add(fl.group);
    const B = new Builder();
    const rnd = mulberry32(Math.floor(this.lot.seed * 1000) * 31 + k * 977);
    const R = (a, b) => a + (b - a) * rnd();
    const cc = (x0, z0, x1, z1, y0, y1, tag = 'int') => { const b = col.addBox(x0, z0, x1, z1, y1, tag, y0); fl.boxes.push(b); return b; };
    const solid = (key, x0, y0, z0, x1, y1, z1, color, em = 1, tag) => { B.ext(key, x0, y0, z0, x1, y1, z1, color, em); return cc(x0, z0, x1, z1, y0, y1, tag); };
    const acc = new THREE.Color(...this.accent);
    const wallC = { lobby: 0x6a7080, retail: 0x5f6475, apartment: 0x8a7f90, office: 0x777e92, hotel: 0x5a5470, roof: 0x4a4e5a }[L.type] || 0x6a7080;
    const slabC = { lobby: 0x1a1d27, retail: 0x20232e, apartment: 0x3c3440, office: 0x252a3c, hotel: 0x2a2236, roof: 0x30343e }[L.type] || 0x20232e;
    fl.B = B; fl.solid = solid; fl.cc = cc; fl.rnd = rnd; fl.R = R; fl.wallC = wallC; fl.acc = acc;
    const y = L.y, top = y + L.h;
    const isRoof = L.tier === 'roof';
    // ---- slab ----
    if (L.slab) {
      const s = L.slab, holes = [this.shaft];
      if (L.tier !== 'podium' || L.k > 0) holes.push(this.stairB);
      // podium levels lie below the tower's core only if tower rect intersects them; core always inside podium rect
      for (const piece of rectMinusHoles(s.x0, s.z0, s.x1, s.z1, holes)) solid('decor', piece[0], y - SLAB, piece[1], piece[2], y, piece[3], slabC, 1, 'slab');
      // ceiling light strips under this slab (visual belongs to floor below, added there)
    }
    if (k === 0) B.ext('decor', r.x0, 0.0, r.z0, r.x1, 0.03, r.z1, slabC);
    // ---- perimeter ----
    const ceilY = isRoof ? y : top;
    if (!isRoof) this.perimeter(fl, B, cc, L, r, y, L.h, wallC);
    else this.parapet(fl, B, cc, r, y, wallC);
    if (L.tier === 'tower' && L.k === this.levels.findIndex((l) => l.tier === 'tower')) this.parapet(fl, B, cc, this.pod, y, wallC, 1.0);
    // ---- core ----
    this.buildCore(fl, B, cc, L, y, wallC, isRoof);
    if (k === 0) { this.addLadder(fl, B, 'base'); this.addLadder(fl, B, 'base', -7, '배수관'); } else if (L.tier === 'tower' && L.slab === this.pod && L.k === this.levels.findIndex((l) => l.tier === 'tower')) { this.addLadder(fl, B, 'top'); this.addLadder(fl, B, 'top', -7, '배수관'); }
    // ---- ceiling lights / fixtures ----
    if (!isRoof) this.lighting(fl, B, L, r, y, top, acc);
    // ---- contents ----
    if (L.type === 'lobby') this.furnishLobby(fl, L);
    else if (L.type === 'retail') this.furnishOpen(fl, L, 'retail');
    else if (L.type === 'roof') this.furnishRoof(fl, L);
    else this.furnishRooms(fl, L);
    // ---- finish meshes ----
    B.finish(fl.group);
    this.buildGlassMesh(fl);
    this.floors.set(k, fl);
    this.built.add(k);
    this.M.onFloorBuilt?.(this, fl, L);
  }
  // fire-escape ladder on the side opposite the entrance: base at the street level, top on the podium roof
  addLadder(fl, B, which, off = 0, label = '비상 사다리') {
    const G = this.G, d = this.door, pod = this.pod, H = pod.y1;
    const nx = -d.nx, nz = -d.nz; // outward normal of the back side
    const along = (nx !== 0 ? (pod.z0 + pod.z1) / 2 + 3 : (pod.x0 + pod.x1) / 2 + 3) + off;
    const ex = nx !== 0 ? (nx > 0 ? pod.x1 : pod.x0) : along, ez = nz !== 0 ? (nz > 0 ? pod.z1 : pod.z0) : along;
    const ox = ex + nx * 0.22, oz = ez + nz * 0.22;
    if (which === 'base') {
      const px = -nz, pz = nx; // along-wall direction
      for (const s of [-0.28, 0.28]) B.ext('steel', ox + px * s - 0.03 + (nx !== 0 ? 0 : 0), 0, oz + pz * s - 0.03, ox + px * s + 0.03, H + 1.0, oz + pz * s + 0.03, 0x9aa0ac);
      for (let yy = 0.4; yy < H + 0.9; yy += 0.4) B.ext('steel', Math.min(ox - 0.03, ox + px * 0.28 - 0.03), yy, Math.min(oz - 0.03, oz + pz * 0.28 - 0.03), Math.max(ox + 0.03, ox + px * 0.28 + 0.03), yy + 0.05, Math.max(oz + 0.03, oz + pz * 0.28 + 0.03), 0x9aa0ac);
      const o = { x: ox + nx * 0.7, z: oz + nz * 0.7, cy: 1, r: 1.9, name: label, verbs: [{ key: 'F', label: () => (off ? '배수관 타고 오르기' : '사다리 오르기'), run: () => G.climbTo(ox + nx * 0.7, 0, oz + nz * 0.7, ex - nx * 1.4, H, ez - nz * 1.4, 2.4) }] };
      G.interact.add(o); (fl.interact || (fl.interact = [])).push(o);
    } else {
      const o = { x: ex - nx * 1.2, z: ez - nz * 1.2, cy: H + 1, r: 1.9, name: label, verbs: [{ key: 'F', label: () => (off ? '배수관 타고 내려가기' : '사다리 내려가기'), run: () => G.climbTo(ex - nx * 1.2, H, ez - nz * 1.2, ox + nx * 0.8, 0, oz + nz * 0.8, 2.6) }] };
      G.interact.add(o); (fl.interact || (fl.interact = [])).push(o);
    }
  }
  buildGlassMesh(fl) {
    if (!fl.glass.length) return;
    const geo = new THREE.BoxGeometry(1, 1, 1), im = new THREE.InstancedMesh(geo, mats().glass, fl.glass.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    fl.glass.forEach((gb, i) => { const e = gb.pane.ex; p.set((e[0] + e[3]) / 2, (e[1] + e[4]) / 2, (e[2] + e[5]) / 2); sc.set(e[3] - e[0], e[4] - e[1], e[5] - e[2]); m.compose(p, q, sc); im.setMatrixAt(i, m); gb.pane.idx = i; });
    im.frustumCulled = false; im.renderOrder = 3; fl.group.add(im); fl.glassMesh = im;
  }
  breakPane(box, by) {
    const pn = box.pane; if (!pn || pn.broken) return false;
    pn.broken = true; const G = this.G, fl = pn.fl;
    G.world.colliders.removeBox(box); const i = fl.boxes.indexOf(box); if (i >= 0) fl.boxes.splice(i, 1);
    const j = fl.glass.indexOf(box); if (j >= 0) fl.glass.splice(j, 1);
    const m = new THREE.Matrix4().makeScale(0, 0, 0); fl.glassMesh.setMatrixAt(pn.idx, m); fl.glassMesh.instanceMatrix.needsUpdate = true;
    G.state.glass[pn.key] = 1;
    const e = pn.ex, cx = (e[0] + e[3]) / 2, cy = (e[1] + e[4]) / 2, cz = (e[2] + e[5]) / 2;
    for (let n = 0; n < 26; n++) G.sparksP.emit(cx + (Math.random() - 0.5) * (e[3] - e[0]), cy + (Math.random() - 0.5) * (e[4] - e[1]), cz + (Math.random() - 0.5) * (e[5] - e[2]), (Math.random() - 0.5) * 5, Math.random() * 3 - 1, (Math.random() - 0.5) * 5, 0.5 + Math.random() * 0.8, 0.07 + Math.random() * 0.08, 1.4, 1.9, 2.4, 1, -14, 0.3);
    G.audio.glass?.(Math.hypot(cx - G.camera.position.x, cz - G.camera.position.z));
    G.noise?.(cx, cz, 40);
    if (by === G.player) G.noteCrime?.(by, 'vandal', 2);
    return true;
  }
  dropFloor(k) {
    const fl = this.floors.get(k); if (!fl) return;
    const col = this.G.world.colliders;
    if (fl.glassMesh) fl.glassMesh.dispose();
    for (const b of fl.boxes) col.removeBox(b);
    for (const c of fl.bodies) this.G.phys.world.removeCollider(c, false);
    for (const d of [...fl.doors]) { d.destroy(); const i = this.doors.indexOf(d); if (i >= 0) this.doors.splice(i, 1); }
    this.M.onFloorDropped?.(this, fl);
    disposeGroup(fl.group);
    this.floors.delete(k); this.built.delete(k);
  }

  // ---------- exterior wall with windows ----------
  perimeter(fl, B, cc, L, r, y, h, wallC) {
    const sides = [
      { s: 'n', x0: r.x0, x1: r.x1, z: r.z0, d: 1, ax: 'x' },
      { s: 's', x0: r.x0, x1: r.x1, z: r.z1, d: -1, ax: 'x' },
      { s: 'w', x0: r.z0, x1: r.z1, z: r.x0, d: 1, ax: 'z' },
      { s: 'e', x0: r.z0, x1: r.z1, z: r.x1, d: -1, ax: 'z' },
    ];
    const ground = L.k === 0 && L.tier === 'podium';
    const sill = ground ? 0.3 : 0.95, head = ground ? Math.min(h - 0.6, 3.1) : Math.min(h - 0.6, 3.1);
    const pw = 0.7, door = this.door, isTowerSide = L.tier === 'tower';
    for (const sd of sides) {
      const len = sd.x1 - sd.x0, nb = Math.max(3, Math.round(len / BAY)), bay = len / nb;
      const a0 = sd.ax === 'x' ? 0 : 0;
      // wall slab extents along the axis (corners handled by n/s full, e/w shortened)
      let u0 = sd.x0, u1 = sd.x1; if (sd.ax === 'z') { u0 += WALL; u1 -= WALL; }
      const wi0 = sd.z + sd.d * 0.05, wi1 = sd.z + sd.d * WALL;
      const mn = Math.min(wi0, wi1), mx = Math.max(wi0, wi1);
      const box = (ua, ub, ya, yb, key, color, collide = true, tag) => {
        if (ub - ua < 0.01 || yb - ya < 0.01) return null;
        const ex = sd.ax === 'x' ? [ua, ya, mn, ub, yb, mx] : [mn, ya, ua, mx, yb, ub];
        B.ext(key, ex[0], ex[1], ex[2], ex[3], ex[4], ex[5], color);
        if (collide) return cc(ex[0], ex[2], ex[3], ex[5], ya, yb, tag);
        return null;
      };
      const isDoorSide = ground && door && door.side === sd.s;
      const dBay = isDoorSide ? door.bayIndex : -1;
      // pillars
      for (let i = 0; i <= nb; i++) { const u = sd.x0 + i * bay; box(Math.max(u0, u - pw / 2), Math.min(u1, u + pw / 2), y, y + h, 'decor', wallC); }
      // per bay: sill + glass + lintel (lintel/sill full-length strips would block doors, so per-bay)
      for (let i = 0; i < nb; i++) {
        const ua = sd.x0 + i * bay + pw / 2, ub = sd.x0 + (i + 1) * bay - pw / 2;
        const ca = Math.max(u0, ua), cb = Math.min(u1, ub);
        if (cb <= ca) continue;
        if (i === dBay) { box(ca, cb, y + 2.7, y + h, 'decor', wallC); this.makeEntrance(fl, sd, ca, cb, y, mn, mx); continue; }
        box(ca, cb, y, y + sill, 'decor', wallC);
        box(ca, cb, y + head, y + h, 'decor', wallC);
        // glass pane (breakable, persisted)
        const gkey = `g${this.id}:${L.k}:${sd.s}:${i}`;
        if (!this.G.state.glass[gkey]) {
          const gm = sd.d > 0 ? mn + 0.2 : mx - 0.28, gt = 0.06;
          const gex = sd.ax === 'x' ? [ca, y + sill, gm, cb, y + head, gm + gt] : [gm, y + sill, ca, gm + gt, y + head, cb];
          const gb = cc(gex[0], gex[2], gex[3], gex[5], gex[1], gex[4], 'glass');
          gb.pane = { key: gkey, fl, ex: gex, b: this }; fl.glass.push(gb);
        }
      }
    }
  }
  parapet(fl, B, cc, r, y, wallC, hh = 0.95) {
    const t = 0.3, hy = y + hh;
    const seg = (x0, z0, x1, z1) => { B.ext('decor', x0, y, z0, x1, hy, z1, wallC); cc(x0, z0, x1, z1, y, hy, 'parapet'); };
    seg(r.x0, r.z0, r.x1, r.z0 + t); seg(r.x0, r.z1 - t, r.x1, r.z1); seg(r.x0, r.z0 + t, r.x0 + t, r.z1 - t); seg(r.x1 - t, r.z0 + t, r.x1, r.z1 - t);
  }
  // street entrance: opening between pillars, double glass door leaves (real, hinged)
  makeEntrance(fl, sd, ca, cb, y, mn, mx) {
    const G = this.G, w = cb - ca, mid = (ca + cb) / 2;
    const hingeA = new Door(this, fl, { axis: sd.ax, wallC: (mn + mx) / 2, from: ca, to: mid - 0.02, y, h: 2.65, thick: 0.08, kind: 'glass', hingeAt: 'from', swing: sd.d, name: this.name + ' 정문' });
    const hingeB = new Door(this, fl, { axis: sd.ax, wallC: (mn + mx) / 2, from: mid + 0.02, to: cb, y, h: 2.65, thick: 0.08, kind: 'glass', hingeAt: 'to', swing: sd.d, name: this.name + ' 정문' });
    hingeA.partner = hingeB; hingeB.partner = hingeA;
    fl.entrance = [hingeA, hingeB];
    // threshold light strip & welcome mat
    const e = sd.ax === 'x' ? [ca, y, mn, cb, y + 0.02, mx + 0.6 * sd.d] : [mn - (sd.d < 0 ? 0 : 0.6), y, ca, mx, y + 0.02, cb];
    fl.B.ext('emit', Math.min(e[0], e[3]), y + 0.03, Math.min(e[2], e[5]), Math.max(e[0], e[3]), y + 0.05, Math.max(e[2], e[5]), new THREE.Color(1, 0.8, 0.55), 0.6);
  }

  // ---------- core: stairs + elevator shaft ----------
  buildCore(fl, B, cc, L, y, wallC, isRoof) {
    const c = this.core, zc = c.zc, h = L.h, top = y + h, cx0 = c.x0, cz0 = c.z0;
    const steel = 0x30343f, W = wallC;
    const solid = (x0, y0, z0, x1, y1, z1, color, tag) => { B.ext('decor', x0, y0, z0, x1, y1, z1, color); cc(x0, z0, x1, z1, y0, y1, tag); };
    const hh = isRoof ? 3.4 : h;
    if (L.tier !== 'tower') { // podium/roof: the core is not hugging an outer wall
      solid(cx0 - 0.15, y, cz0 - 0.15, cx0 + CORE_W, y + hh, cz0, W);
      solid(cx0 - 0.15, y, cz0, cx0, y + hh, zc, W);
    }
    // east core wall, stair/shaft partition, column divider
    solid(cx0 + CORE_W - 0.1, y, cz0, cx0 + CORE_W + 0.0, y + hh, zc, W);
    solid(cx0 + 3.4, y, cz0, cx0 + 3.6, y + hh, zc, W);
    solid(cx0 + 1.6, y, cz0 + 1.6, cx0 + 1.8, y + hh, zc - 0.2, W);
    // utility block north of the shaft
    solid(cx0 + 3.6, y, cz0, cx0 + CORE_W - 0.1, y + hh, zc - 2.8, 0x2a2d38);
    // shaft front wall with door opening (1.4m) -> sliding doors live in Elevator
    const sx0 = this.shaft.x0, sx1 = this.shaft.x1, smid = (sx0 + sx1) / 2;
    solid(sx0, y, zc - 0.2, smid - 0.75, y + hh, zc, W);
    solid(smid + 0.75, y, zc - 0.2, sx1, y + hh, zc, W);
    solid(smid - 0.75, y + 2.45, zc - 0.2, smid + 0.75, y + hh, zc, W);
    B.ext('emit', smid - 0.75, y + 2.45, zc + 0.01, smid + 0.75, y + 2.52, zc + 0.04, new THREE.Color(...this.accent), 2);
    // level number plate above doors
    fl.indicator = { x: smid, y: y + 2.7, z: zc + 0.05 };
    // stairs
    const rise = L.h / 2, run = CORE_D - 1.6, ang = Math.atan2(rise, run);
    if (!isRoof) {
      // landing (mid-level) over both columns at the north end
      const ly = y + L.h * 0.45;
      solid(cx0, ly - 0.2, cz0, cx0 + 3.4, ly, cz0 + 1.6, steel, 'stair');
      // flight A up (column A, from south to north), flight B up (column B, from north landing to south)
      this.ramp(fl, B, cc, cx0, cx0 + 1.6, zc, cz0 + 1.6, y, ly, steel);
      this.ramp(fl, B, cc, cx0 + 1.8, cx0 + 3.4, cz0 + 1.6, zc, ly, y + h, steel);
      // handrail posts (visual)
      B.ext('steel', cx0 + 1.65, y + 0.9, cz0 + 1.6, cx0 + 1.75, y + 1.0, zc - 0.2, 0xb8bec8);
    } else {
      // bulkhead cap and ramp B arrives from below; roof stair exit
      B.ext('decor', cx0, y + 3.4, cz0, cx0 + CORE_W, y + 3.4 + SLAB, zc, wallC); cc(cx0, cz0, cx0 + CORE_W, zc, y + 3.4, y + 3.4 + SLAB, 'cap');
    }
  }
  ramp(fl, B, cc, x0, x1, za, zb, ya, yb, color) {
    const n = 14, dz = (zb - za) / n, dy = (yb - ya) / n;
    for (let i = 0; i < n; i++) {
      const z0 = za + dz * i, z1 = za + dz * (i + 1), top = ya + dy * (i + 1);
      B.ext('decor', x0, ya, Math.min(z0, z1), x1, top, Math.max(z0, z1), color);
    }
    fl.bodies.push(this.G.phys.addRamp((x0 + x1) / 2, (ya + yb) / 2, (za + zb) / 2, (x1 - x0) / 2, 0.08, Math.hypot(zb - za, yb - ya) / 2, yb - ya, zb - za));
  }
  lighting(fl, B, L, r, y, top, acc) {
    const em = new THREE.Color(1, 0.88, 0.7).multiplyScalar(1.15);
    for (let x = r.x0 + 3; x < r.x1 - 2; x += 6) B.ext('emit', x, top - 0.45 - 0.06, r.z0 + 1, x + 0.35, top - 0.45, r.z1 - 1, em);
    const nx = Math.max(1, Math.floor((r.x1 - r.x0) / 9)), nz = Math.max(1, Math.floor((r.z1 - r.z0) / 9));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      fl.fixtures.push([r.x0 + (i + 0.5) * (r.x1 - r.x0) / nx, top - 0.7, r.z0 + (j + 0.5) * (r.z1 - r.z0) / nz, L.type === 'lobby' ? [this.accent[0] * 0.6 + 0.4, this.accent[1] * 0.6 + 0.4, this.accent[2] * 0.6 + 0.4] : [1, 0.86, 0.68]]);
    }
  }
  // ====================================================================
  // contents (static decor; physical items spawned via M.items when present)
  // ====================================================================
  furnishLobby(fl, L) {
    const { B, solid, R } = fl, r = L.rect, acc = fl.acc, c = this.core;
    const em = acc.clone().multiplyScalar(2.4);
    // reception desk facing the entrance
    const d = this.door, inX = d.nx !== 0;
    const cx = this.cx, cz = this.cz;
    const rx = clamp(cx - d.nx * 6, r.x0 + 4, r.x1 - 4), rz = clamp(cz - d.nz * 6, r.z0 + 4, r.z1 - 4);
    const dx = inX ? 1.2 : 6, dz = inX ? 6 : 1.2;
    const ok = !(rx + dx / 2 > c.x0 - 1 && rx - dx / 2 < c.x0 + CORE_W + 2 && rz + dz / 2 > c.z0 - 1 && rz - dz / 2 < c.zc + 3);
    if (ok) {
      solid('decor', rx - dx / 2, 0, rz - dz / 2, rx + dx / 2, 1.1, rz + dz / 2, 0x1b1d28);
      B.ext('emit', rx - dx / 2, 1.1, rz - dz / 2, rx + dx / 2, 1.16, rz + dz / 2, em);
      fl.reception = { x: rx + d.nx * 1.2, z: rz + d.nz * 1.2 };
      this.M.spawnNPC?.(this, fl, 'reception', rx - d.nx * 0.9, rz - d.nz * 0.9);
    }
    // seating + plants on the opposite side of the core
    for (let i = 0; i < 3; i++) this.sofa(fl, r.x1 - 3.2 - i * 0, r.z1 - 3 - i * 3.4, Math.PI / 2, [0x3a2f55, 0x22304a, 0x4a2a5a][i]);
    this.plant(fl, r.x0 + 1.4, r.z1 - 1.4); this.plant(fl, r.x1 - 1.4, r.z0 + 1.4); this.plant(fl, r.x1 - 1.4, r.z1 - 1.4);
    // logo wall
    B.ext('emit', c.x0 + CORE_W + 0.3, 1.6, c.zc - 0.4, c.x0 + CORE_W + 2.4, 2.0, c.zc - 0.34, acc.clone().multiplyScalar(1.4));
    this.M.populateFloor?.(this, fl, L);
  }
  furnishOpen(fl, L, kind) {
    const { B, solid, R } = fl, r = L.rect, c = this.core;
    const free = (x0, z0, x1, z1) => !(x1 > c.x0 - 1.2 && x0 < c.x0 + CORE_W + 1.2 && z1 > c.z0 - 1.2 && z0 < c.zc + 3.2);
    const cols = [0x4a3a2a, 0x2c3a4a, 0x3a2c4a, 0x2c4a3a];
    fl.shelves = []; let n = 0;
    for (let x = r.x0 + 3; x < r.x1 - 3; x += 4.2) {
      if (!free(x - 0.5, r.z1 - 6, x + 0.5, r.z1 - 1.5)) continue;
      const col = cols[(n++) % 4];
      solid('decor', x - 0.4, L.y, r.z1 - 6, x + 0.4, L.y + 1.9, r.z1 - 2, col);
      B.ext('emit', x - 0.42, L.y + 0.4, r.z1 - 6, x - 0.38, L.y + 0.5, r.z1 - 2, fl.acc.clone().multiplyScalar(1.5));
      fl.shelves.push({ x, z0: r.z1 - 6, z1: r.z1 - 2 });
    }
    const spots = [[r.x0 + 2, r.z0 + 2], [r.x1 - 7, r.z0 + 2], [r.x0 + 2, r.z1 - 9]];
    for (const [cx, cz] of spots) if (free(cx, cz, cx + 5, cz + 1.2)) {
      solid('decor', cx, L.y, cz, cx + 5, L.y + 1.05, cz + 1.2, 0x1b1d28);
      B.ext('emit', cx, L.y + 1.05, cz, cx + 5, L.y + 1.1, cz + 1.2, fl.acc.clone().multiplyScalar(2.2));
      fl.counter = { x0: cx, z0: cz, x1: cx + 5, z1: cz + 1.2 }; break;
    }
    this.M.populateFloor?.(this, fl, L);
  }
  furnishRoof(fl, L) {
    const { B, solid, R } = fl, tow = this.tow;
    // heliport + AC units + water tank for parkour
    const cx = (tow.x0 + tow.x1) / 2 + 2, cz = (tow.z0 + tow.z1) / 2 + 2;
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; B.box('emit', cx + Math.cos(a) * 4, this.roofY + 0.02, cz + Math.sin(a) * 4, 0.5, 0.02, 0.18, new THREE.Color(1, 0.85, 0.3), -a, 1.4); }
    B.box('emit', cx, this.roofY + 0.02, cz - 1.2, 0.35, 0.02, 2.4, new THREE.Color(1, 0.9, 0.4), 0, 1.4);
    B.box('emit', cx - 1.4, this.roofY + 0.02, cz, 0.35, 0.02, 2.4, new THREE.Color(1, 0.9, 0.4), 0, 1.4);
    B.box('emit', cx + 1.4, this.roofY + 0.02, cz, 0.35, 0.02, 2.4, new THREE.Color(1, 0.9, 0.4), 0, 1.4);
    B.box('emit', cx, this.roofY + 0.02, cz, 2.8, 0.02, 0.35, new THREE.Color(1, 0.9, 0.4), 0, 1.4);
    for (let i = 0; i < 3; i++) {
      const ax = tow.x1 - 3.2, az = tow.z0 + 2.5 + i * 3.4;
      if (az > tow.z1 - 2) break;
      solid('steel', ax - 1.0, this.roofY, az - 1.0, ax + 1.0, this.roofY + 1.3, az + 1.0, 0x3b414d);
    }
    fl.fixtures.push([cx, this.roofY + 4, cz, [0.8, 0.9, 1]]);
    this.M.populateFloor?.(this, fl, L);
  }
  furnishRooms(fl, L) {
    const { B, solid, cc, R, rnd } = fl, r = L.rect, c = this.core, zc = c.zc;
    const ix0 = r.x0 + WALL, ix1 = r.x1 - WALL, iz0 = r.z0 + WALL, iz1 = r.z1 - WALL, y = L.y, h = L.h - SLAB;
    const wallC = fl.wallC, rooms = [];
    const t = 0.18;
    const wallSeg = (x0, z0, x1, z1) => { B.ext('decor', x0, y, z0, x1, y + h, z1, wallC); cc(x0, z0, x1, z1, y, y + h, 'part'); };
    // wall along x at z with doorways [(u,w)] ; along z at x
    const wallX = (z, xa, xb, gaps) => {
      let cur = xa; const g = [...gaps].sort((p, q) => p[0] - q[0]);
      for (const [u, w] of g) { if (u - w / 2 > cur) wallSeg(cur, z - t / 2, u - w / 2, z + t / 2); B.ext('decor', u - w / 2, y + 2.15, z - t / 2, u + w / 2, y + h, z + t / 2, wallC); cc(u - w / 2, z - t / 2, u + w / 2, z + t / 2, y + 2.15, y + h, 'part'); cur = u + w / 2; }
      if (xb > cur) wallSeg(cur, z - t / 2, xb, z + t / 2);
    };
    const wallZ = (x, za, zb, gaps) => {
      let cur = za; const g = [...gaps].sort((p, q) => p[0] - q[0]);
      for (const [u, w] of g) { if (u - w / 2 > cur) wallSeg(x - t / 2, cur, x + t / 2, u - w / 2); B.ext('decor', x - t / 2, y + 2.15, u - w / 2, x + t / 2, y + h, u + w / 2, wallC); cc(x - t / 2, u - w / 2, x + t / 2, u + w / 2, y + 2.15, y + h, 'part'); cur = u + w / 2; }
      if (zb > cur) wallSeg(x - t / 2, cur, x + t / 2, zb);
    };
    const doors = [];
    const hasR1 = iz1 - (zc + COR_W) >= 4.2;
    const corrZ1 = hasR1 ? zc + COR_W : iz1;
    // R1: rooms south of the corridor, doors in the north wall z=corrZ1
    if (hasR1) {
      const W = ix1 - ix0, n = Math.max(1, Math.floor(W / 5.8)), rw = W / n, gaps = [];
      for (let i = 0; i < n; i++) {
        const a = ix0 + i * rw, b = a + rw, dx = a + rw * R(0.3, 0.7);
        gaps.push([dx, 1.05]);
        rooms.push({ x0: a, z0: corrZ1, x1: b, z1: iz1, wall: 'n', dx, dz: corrZ1 });
        if (i > 0) wallZ(a, corrZ1, iz1, []);
        doors.push({ axis: 'x', c: corrZ1, u: dx });
      }
      wallX(corrZ1, ix0, ix1, gaps);
    }
    // R2: rooms east of the core, north of corridor, doors in south wall z=zc
    const r2x0 = c.x0 + CORE_W + 0.1, W2 = ix1 - r2x0;
    if (W2 >= 4.2) {
      const n = Math.max(1, Math.floor(W2 / 5.8)), rw = W2 / n, gaps = [];
      for (let i = 0; i < n; i++) {
        const a = r2x0 + i * rw, b = a + rw, dx = a + rw * R(0.3, 0.7);
        gaps.push([dx, 1.05]);
        rooms.push({ x0: a, z0: iz0, x1: b, z1: zc, wall: 's', dx, dz: zc });
        if (i > 0) wallZ(a, iz0, zc, []);
        doors.push({ axis: 'x', c: zc, u: dx });
      }
      wallX(zc, r2x0, ix1, gaps);
    }
    // corridor carpet lighting accent
    B.ext('decor', ix0, y + 0.002, zc, ix1, y + 0.02, corrZ1, 0x3a1f2f);
    B.ext('emit', ix0 + 1, y + 0.025, (zc + corrZ1) / 2 - 0.03, ix1 - 1, y + 0.035, (zc + corrZ1) / 2 + 0.03, fl.acc.clone().multiplyScalar(1.2), 1);
    for (const d of doors) {
      const dr = new Door(this, fl, { axis: 'x', wallC: d.c, from: d.u - 0.5, to: d.u + 0.5, y, h: 2.12, thick: 0.05, kind: 'wood', hingeAt: 'from', swing: 1, name: '방 문', lock: true });
      void dr;
    }
    // furnish
    rooms.forEach((rm, i) => this.furnishRoom(fl, L, rm, i));
    // open spaces: corridor decor
    this.plant(fl, ix0 + 0.6, corrZ1 - 0.6);
    this.M.populateFloor?.(this, fl, L, rooms);
    fl.rooms = rooms;
  }
  furnishRoom(fl, L, rm, i) {
    const { B, solid, R } = fl, y = L.y;
    const kind = L.type === 'office' ? ['office', 'office', 'meeting', 'server', 'office'][i % 5] : L.type === 'hotel' ? 'bedroom' : ['living', 'bedroom', 'kitchen', 'bedroom'][i % 4];
    rm.kind = kind;
    const x0 = rm.x0 + 0.2, x1 = rm.x1 - 0.2, z0 = rm.z0 + 0.2, z1 = rm.z1 - 0.2, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const south = rm.wall === 'n';  // room lies south of its door wall: door side is north (z0)
    const back = south ? z1 : z0, dirIn = south ? 1 : -1; // direction from door wall into the room
    const col = (cx_, cz_, w, d, hgt, color, em) => solid('decor', cx_ - w / 2, y, cz_ - d / 2, cx_ + w / 2, y + hgt, cz_ + d / 2, color, em);
    const acc = fl.acc;
    if (kind === 'bedroom') {
      col(cx, back - dirIn * 1.2, 2.0, 2.1, 0.5, 0xd8d0d8);
      B.ext('decor', cx - 1.0, y + 0.5, back - dirIn * 2.0, cx + 1.0, y + 0.7, back - dirIn * 1.7, 0xc8c0c8);
      B.ext('emit', cx - 1.2, y + 0.9, back - dirIn * 0.15, cx + 1.2, y + 1.7, back - dirIn * 0.1, acc.clone().multiplyScalar(0.9));
      col(x0 + 0.5, back - dirIn * 0.5, 1.0, 0.5, 2.0, 0x2a2d38); // wardrobe
      col(cx + 1.5, back - dirIn * 0.5, 0.5, 0.5, 0.55, 0x2a2d38);
      fl.fixtures.push([cx, y + 3.2, cz, [1, 0.78, 0.55]]);
    } else if (kind === 'living') {
      this.sofa(fl, cx, back - dirIn * 0.9, south ? 0 : Math.PI, 0x2f3b5a, 2.6);
      col(cx, back - dirIn * 3.4, 1.8, 0.5, 0.4, 0x1b1d26);
      B.ext('emit', cx - 0.9, y + 0.7, back - dirIn * 0.15 + 0, cx + 0.9, y + 1.5, back - dirIn * 0.1, new THREE.Color(0.3, 0.5, 1).multiplyScalar(1.5));
      this.plant(fl, x1 - 0.6, z0 + 0.8);
      fl.fixtures.push([cx, y + 3.2, cz, [1, 0.8, 0.6]]);
    } else if (kind === 'kitchen') {
      col(cx, back - dirIn * 0.45, Math.min(4.4, x1 - x0 - 0.4), 0.7, 0.92, 0x2a2d3a);
      B.ext('decor', cx - 2.2, y + 0.92, back - dirIn * 0.8, cx + 2.2, y + 0.98, back - dirIn * 0.1, 0xb7b9c4);
      col(cx, cz, 1.6, 0.9, 0.9, 0x3a2f2a); // island
      col(x1 - 0.4, back - dirIn * 0.5, 0.7, 0.7, 1.9, 0xc8cad2); // fridge
      fl.fixtures.push([cx, y + 3.2, cz, [1, 0.95, 0.85]]);
    } else if (kind === 'office') {
      for (let a = x0 + 1; a < x1 - 0.8; a += 2.2) for (const b of [back - dirIn * 1.0, back - dirIn * 3.0]) {
        if ((b < z0 || b > z1)) continue;
        col(a, b, 1.5, 0.75, 0.74, 0x6a5b4c);
        B.ext('emit', a - 0.3, y + 0.9, b - 0.05, a + 0.3, y + 1.25, b, new THREE.Color(0.25, 0.6, 1).multiplyScalar(R(1, 2)));
        B.ext('decor', a - 0.25, y, b + dirIn * 0.9 - 0.25, a + 0.25, y + 0.5, b + dirIn * 0.9 + 0.25, 0x22252f);
      }
      fl.fixtures.push([cx, y + 3.2, cz, [0.9, 0.95, 1]]);
    } else if (kind === 'meeting') {
      col(cx, cz, Math.min(3.6, x1 - x0 - 1), 1.4, 0.76, 0x4a3d33);
      for (let a = -1; a <= 1; a++) { B.ext('decor', cx + a * 1.1 - 0.25, y, cz - 1.1 - 0.25, cx + a * 1.1 + 0.25, y + 0.5, cz - 1.1 + 0.25, 0x22252f); B.ext('decor', cx + a * 1.1 - 0.25, y, cz + 1.1 - 0.25, cx + a * 1.1 + 0.25, y + 0.5, cz + 1.1 + 0.25, 0x22252f); }
      B.ext('emit', cx - 1.2, y + 1.2, back - dirIn * 0.12, cx + 1.2, y + 2.0, back - dirIn * 0.08, new THREE.Color(0.9, 0.9, 1).multiplyScalar(1.0));
      fl.fixtures.push([cx, y + 3.2, cz, [1, 1, 1]]);
    } else if (kind === 'server') {
      for (let a = x0 + 0.8; a < x1 - 0.6; a += 1.4) {
        col(a, back - dirIn * 0.7, 0.9, 0.9, 2.2, 0x14161d);
        for (let yy = 0; yy < 12; yy++) B.ext('emit', a - 0.3, y + 0.2 + yy * 0.16, back - dirIn * 1.17 - 0.0, a + 0.3, y + 0.25 + yy * 0.16, back - dirIn * 1.2, new THREE.Color(...(rm.i % 2 ? [0.2, 1, 0.5] : [0.2, 0.6, 1])).multiplyScalar(2.2));
      }
      fl.fixtures.push([cx, y + 3.2, cz, [0.4, 0.7, 1]]);
    }
  }
  sofa(fl, x, z, ry, color, w = 2.6) {
    const { B, solid } = fl, y = this.levels[fl.k].y, e = Math.abs(Math.cos(ry)) > 0.7;
    const hx = e ? w / 2 : 0.5, hz = e ? 0.5 : w / 2;
    solid('decor', x - hx, y, z - hz, x + hx, y + 0.5, z + hz, color);
    const bx = e ? 0 : Math.sin(ry) * -0.38, bz = e ? Math.cos(ry) * -0.38 : 0;
    B.ext('decor', x - hx + bx, y + 0.5, z - hz + bz, x + hx + bx, y + 1.0, z + hz + bz, color);
  }
  plant(fl, x, z) {
    const { B, solid } = fl, y = this.levels[fl.k].y;
    solid('decor', x - 0.4, y, z - 0.4, x + 0.4, y + 0.55, z + 0.4, 0x2a2430);
    B.ico('decor', x, y + 1.3, z, 0.7, 0x1f6b44, 1.3); B.ico('decor', x + 0.2, y + 1.8, z, 0.5, 0x2a8a56, 1.2);
  }
}

// ---------- axis-aligned rect minus holes -> list of [x0,z0,x1,z1] ----------
function rectMinusHoles(x0, z0, x1, z1, holes) {
  const xs = new Set([x0, x1]), zs = new Set([z0, z1]);
  for (const h of holes) { for (const x of [h.x0, h.x1]) if (x > x0 && x < x1) xs.add(x); for (const z of [h.z0, h.z1]) if (z > z0 && z < z1) zs.add(z); }
  const X = [...xs].sort((a, b) => a - b), Z = [...zs].sort((a, b) => a - b), out = [];
  for (let i = 0; i < X.length - 1; i++) {
    let start = null;
    for (let j = 0; j <= Z.length - 1; j++) {
      const inHole = j < Z.length - 1 && holes.some((h) => X[i] >= h.x0 - 1e-6 && X[i + 1] <= h.x1 + 1e-6 && Z[j] >= h.z0 - 1e-6 && Z[j + 1] <= h.z1 + 1e-6);
      if (j < Z.length - 1 && !inHole) { if (start == null) start = Z[j]; } else if (start != null) { out.push([X[i], start, X[i + 1], Z[j]]); start = null; }
    }
  }
  // normalise ordering [x0,z0,x1,z1] -> callers expect [x0,z0,x1,z1]
  return out.map((p) => [p[0], p[1], p[2], p[3]]);
}

// ====================================================================
// Hinged door (kinematic rigid body, real collider; opened/locked/kicked through interaction verbs)
// ====================================================================
export class Door {
  constructor(b, fl, o) {
    this.b = b; this.fl = fl; this.o = o; this.G = b.G;
    this.axis = o.axis; this.len = o.to - o.from; this.y = o.y; this.h = o.h;
    this.hinge = o.hingeAt === 'from' ? o.from : o.to; this.sign = o.hingeAt === 'from' ? 1 : -1;
    this.swing = o.swing || 1;
    this.name = o.name; this.kind = o.kind;
    this.id = `b${b.id}:f${fl.k}:d${fl.doors.length + (fl.entrance ? fl.entrance.length : 0)}`;
    const st = this.G.state.doors[this.id];
    this.locked = st ? st.locked : (o.lock ? Math.random() < 0.28 : false);
    this.ang = st ? st.ang : 0; this.target = this.ang; this.vel = 0;
    this.broken = st?.broken || false;
    const m = mats();
    const color = o.kind === 'glass' ? 0x9fb8d0 : 0x5a4636;
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), o.kind === 'glass' ? new THREE.MeshPhysicalMaterial({ color: 0x9fd0e0, roughness: 0.05, transparent: true, opacity: 0.32, clearcoat: 1 }) : new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1 }));
    this.mesh.scale.set(o.thick, o.h, this.len); this.mesh.castShadow = false; this.mesh.frustumCulled = false;
    this.pivot = new THREE.Group(); this.pivot.add(this.mesh);
    this.mesh.position.set(0, o.h / 2, this.sign * this.len / 2);
    if (o.kind === 'wood') { const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: 0xc8b070, metalness: 0.9, roughness: 0.2 })); knob.position.set(o.thick / 2 + 0.03, 1.0, this.sign * (this.len - 0.12)); this.mesh.add(knob); knob.scale.set(1 / o.thick, 1 / o.h, 1 / this.len); }
    this.pivot.position.set(...(o.axis === 'x' ? [this.hinge, o.y, o.wallC] : [o.wallC, o.y, this.hinge]));
    // along-x doors: leaf extends along +x (rot about Y), along-z: extends along +z
    fl.group.add(this.pivot);
    const R = this.G.RAPIER, w = this.G.phys.world;
    this.body = w.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0, 0));
    this.col = w.createCollider(R.ColliderDesc.cuboid(o.thick / 2, o.h / 2, this.len / 2).setCollisionGroups(grp(GR.OBJ, 0xffff)), this.body);
    this.G.phys.colRef.set(this.col.handle, this);
    this.isDoor = true;
    this.verbs = this.makeVerbs();
    fl.doors.push(this); b.doors.push(this);
    this.x = this.axis === 'x' ? (o.from + o.to) / 2 : o.wallC; this.z = this.axis === 'x' ? o.wallC : (o.from + o.to) / 2; this.r = 2.0; this.cy = o.y + 1.0;
    this.apply(true);
    this.G.interact.add(this);
  }
  // leaf lies along local z; pivot sits on the hinge. ang 0 = closed, swing = +1/-1 side of the wall normal.
  apply(force) {
    const sg = this.sign, ry = this.axis === 'x' ? Math.PI / 2 - sg * this.swing * this.ang : sg * this.swing * this.ang;
    this.pivot.rotation.y = ry;
    const half = this.len / 2;
    const px = this.pivot.position.x + Math.sin(ry) * half * sg, pz = this.pivot.position.z + Math.cos(ry) * half * sg;
    const q = { x: 0, y: Math.sin(ry / 2), z: 0, w: Math.cos(ry / 2) };
    if (force) { this.body.setTranslation({ x: px, y: this.y + this.h / 2, z: pz }, true); this.body.setRotation(q, true); }
    else { this.body.setNextKinematicTranslation({ x: px, y: this.y + this.h / 2, z: pz }); this.body.setNextKinematicRotation(q); }
    this.isOpen = Math.abs(this.ang) > 0.35;
  }
  makeVerbs() {
    const G = this.G, d = this;
    return [
      { key: 'F', label: () => (d.broken ? '부서진 문' : d.locked ? '잠겨 있음' : d.target > 0.1 ? '문 닫기' : '문 열기'), enabled: () => !d.broken, run: (pl) => d.toggle(pl) },
      { key: 'G', label: () => (d.locked ? '문 따기' : '문 잠그기'), enabled: () => !d.broken && d.kind === 'wood' && (d.locked ? true : G.hasItem?.('lockpick') || true), run: (pl) => d.lockToggle(pl) },
      { key: 'T', label: () => '문 걷어차기', enabled: () => !d.broken && d.target < 0.1, run: (pl) => d.kick(pl) },
    ];
  }
  toggle(pl) {
    if (this.locked) { this.G.toast('잠겨 있습니다', 'G 키로 따거나 걷어찰 수 있습니다'); this.G.audio.tone?.(200, 0.08, 'square', 0.08); return; }
    if (this.target > 0.1) { this.target = 0; this.G.audio.door?.(); }
    else {
      // swing away from the player
      const dir = this.axis === 'x' ? Math.sign(pl.z - this.o.wallC) : Math.sign(pl.x - this.o.wallC);
      this.swing = dir >= 0 ? -1 : 1;
      this.target = 1.55; this.G.audio.door?.();
    }
    this.partner && this.o.kind === 'glass' && (this.partner.target = this.target, this.partner.swing = this.swing);
    this.save();
  }
  lockToggle(pl) {
    if (this.locked) { this.G.audio.tone?.(1200, 0.06, 'square', 0.06); this.G.beginTimed?.('자물쇠 따는 중…', 2.2, () => { this.locked = false; this.G.toast('잠금 해제'); this.G.noteCrime?.(pl, 'lockpick', 3); this.save(); }); }
    else { this.target = 0; this.locked = true; this.G.toast('문을 잠갔습니다'); this.save(); }
  }
  kick(pl) {
    this.G.shake(0.2); this.G.audio.impact(0.8, 0);
    this.G.noteCrime?.(pl, 'breakin', 4);
    if (this.locked && Math.random() < 0.55) { this.locked = false; }
    if (!this.locked) { const dir = this.axis === 'x' ? Math.sign(pl.z - this.o.wallC) : Math.sign(pl.x - this.o.wallC); this.swing = dir >= 0 ? -1 : 1; this.target = 1.55; this.vel = 6; this.G.toast('문이 벌컥 열렸다'); } else this.G.toast('끄떡도 안 한다');
    this.save();
  }
  save() { this.G.state.doors[this.id] = { locked: this.locked, ang: this.target, broken: this.broken }; }
  update(dt) {
    if (Math.abs(this.ang - this.target) > 0.004) {
      const sp = 2.6 + Math.abs(this.vel);
      this.ang += Math.sign(this.target - this.ang) * Math.min(Math.abs(this.target - this.ang), sp * dt);
      this.vel = Math.max(0, this.vel - dt * 14);
      this.apply();
    }
  }
  destroy() {
    this.G.interact.remove(this);
    this.G.phys.colRef.delete(this.col.handle);
    this.G.phys.world.removeCollider(this.col, false); this.G.phys.world.removeRigidBody(this.body);
    this.mesh.geometry.dispose(); this.mesh.material.dispose();
  }
}

// ====================================================================
// Elevator: a kinematic cab inside the shaft, doors on every level, real call buttons
// ====================================================================
class Elevator {
  constructor(b) {
    const E = this, G = b.G;
    this.b = b; this.G = b.G; b.plan();
    const sh = b.shaft; this.cx = (sh.x0 + sh.x1) / 2; this.cz = (sh.z0 + sh.z1) / 2 - 0.1;
    this.level = 0; this.target = 0; this.y = 0; this.vy = 0; this.state = 'idle'; this.doorOpen = 0; this.queue = []; this.wait = 0;
    const R = this.G.RAPIER, w = this.G.phys.world;
    // dynamic-but-locked: Rapier's character controller stalls on kinematic floors
    this.body = w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(this.cx, 0, this.cz).setGravityScale(0).lockTranslations().lockRotations().setCanSleep(false));
    const g = grp(GR.OBJ, 0xffff);
    const hw = 1.22, hd = 1.22;
    const add = (hx, hy, hz, x, y, z) => w.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setCollisionGroups(g), this.body);
    this.cols = [add(hw, 0.08, hd, 0, -0.08, 0), add(0.06, 1.35, hd, -hw - 0.04, 1.2, 0), add(0.06, 1.35, hd, hw + 0.04, 1.2, 0), add(hw, 1.35, 0.06, 0, 1.2, -hd - 0.04), add(hw, 0.08, hd, 0, 2.75, 0)];
    this.group = new THREE.Group(); b.group.add(this.group);
    const B = new Builder();
    const L = (x0, y0, z0, x1, y1, z1, c, k = 'steel', em = 1) => B.ext(k, x0, y0, z0, x1, y1, z1, c, em);
    L(-hw, -0.16, -hd, hw, 0, hd, 0x2a2d3a, 'decor');
    L(-hw - 0.1, 0, -hd - 0.1, -hw, 2.7, hd, 0x8a909c); L(hw, 0, -hd - 0.1, hw + 0.1, 2.7, hd, 0x8a909c); L(-hw, 0, -hd - 0.1, hw, 2.7, -hd, 0x7a808c);
    L(-hw, 2.7, -hd - 0.1, hw, 2.85, hd, 0x15171f, 'decor');
    L(-0.8, 2.66, -0.8, 0.8, 2.7, 0.8, 0xfff2dd, 'emit', 2.4);
    L(hw - 0.04, 1.0, -0.4, hw, 1.9, 0.4, 0x1a2a40, 'emit', 1.0);
    L(-hw, 0.9, -0.4 - hd + hd, -hw + 0.06, 0.96, hd - 0.2, 0xb8bec8);
    B.finish(this.group);
    // doors on the cab front (so riders see closed doors while moving) and shaft doors per level
    this.lamp = this.makeDisplay(); this.group.add(this.lamp.mesh); this.lamp.mesh.position.set(0, 2.45, hd + 0.0);
    this.doorsL = []; this.doorsR = [];
    this.syncCab(true);
    this.panel = this.G.interact.add(this.callPanel(0));
    this.cabPanel = this.G.interact.add({ get x() { return E.cx; }, get z() { return E.cz; }, get cy() { return E.y + 1.2; }, r: 1.7, name: '엘리베이터 조작반', verbs: [{ key: 'F', label: () => '층 선택', enabled: () => E.riding(G.player), run: () => G.openElevatorUI(b) }] });
    this.shaftDoors = new Map();
    this.cabDoorCols = [];
  }
  makeDisplay() {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64; const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.35), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
    mesh.rotation.y = Math.PI; mesh.position.z = -1.2;
    const draw = (txt) => { const g = cv.getContext('2d'); g.fillStyle = '#04060c'; g.fillRect(0, 0, 128, 64); g.fillStyle = '#47ffa8'; g.font = 'bold 40px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 64, 34); t.needsUpdate = true; };
    draw('1F'); return { mesh, draw };
  }
  floorLabel(k) { const L = this.b.levels[k]; if (L.tier === 'roof') return 'R'; const n = this.floorNumber(k); return n + 'F'; }
  floorNumber(k) { return k + 1; }
  callPanel(k) {
    const E = this, b = this.b;
    return {
      isElevPanel: true, name: '엘리베이터 버튼', get x() { return E.cx + 2.05; }, get z() { return b.core.zc + 0.6; }, r: 1.9, get cy() { return E.b.levels[E.nearK ?? 0].y + 1.2; },
      verbs: [{ key: 'F', label: () => '엘리베이터 호출', enabled: () => true, run: (pl) => E.call(b.levelAt(pl.y)) }],
    };
  }
  // y of the cab floor for level k
  levelY(k) { return this.b.levels[k].y; }
  call(k, silent) {
    if (this.state === 'idle' && this.level === k && this.doorOpen > 0.9) { this.G.audio.ding?.(); return; }
    if (this.target !== k && !this.queue.includes(k)) this.queue.push(k);
    if (!silent) this.G.toast('엘리베이터 호출', this.floorLabel(k));
    this.G.audio.tone?.(900, 0.1, 'sine', 0.1);
  }
  send(k) { this.queue = [k]; if (this.state === 'idle') this.state = 'closing'; this.G.audio.tone?.(900, 0.1, 'sine', 0.1); }
  riding(pl) { return Math.abs(pl.x - this.cx) < 1.15 && Math.abs(pl.z - this.cz) < 1.15 && pl.y > this.y - 0.2 && pl.y < this.y + 0.5; }
  update(dt) {
    const b = this.b, G = this.G, pl = G.player;
    // doors animate toward state
    const wantOpen = this.state === 'idle' || this.state === 'opening';
    this.doorOpen = clamp(this.doorOpen + (wantOpen ? 1 : -1) * dt * 1.4, 0, 1);
    if (this.state === 'opening' && this.doorOpen >= 1) { this.state = 'idle'; this.wait = 3.5; }
    if (this.state === 'idle') {
      this.wait -= dt;
      if (this.queue.length && (this.wait <= 0 || this.queue[0] === this.level)) { if (this.queue[0] === this.level) { this.queue.shift(); this.G.audio.ding?.(); this.wait = 3.5; } else { this.state = 'closing'; } }
    }
    if (this.state === 'closing' && this.doorOpen <= 0) { this.target = this.queue[0]; this.state = 'moving'; this.G.audio.elevator?.(clamp(Math.abs(this.levelY(this.target) - this.y) / 4, 1.5, 6)); b.ensureRange(this.target - 3, this.target + 3); }
    if (this.state === 'moving') {
      const ty = this.levelY(this.target), dist = ty - this.y, dir = Math.sign(dist);
      const v = Math.min(5.2, Math.max(0.6, Math.sqrt(2 * 1.6 * Math.abs(dist))));
      const ride = this.riding(pl);
      const dy = dir * Math.min(Math.abs(dist), v * dt);
      this.y += dy;
      if (ride) pl.body3.shift(0, dy, 0);
      this.vy = dy / Math.max(dt, 1e-4);
      this.level = b.levelAt(this.y + 0.3);
      if (Math.abs(dist) < 0.01) { this.y = ty; this.level = this.target; this.queue.shift(); this.state = 'opening'; this.G.audio.ding?.(); b.updateSolid(); if (ride) pl.body3.shift(0, 0.06, 0); }
    }
    this.syncCab();
    this.shaftDoorsUpdate();
    const lv = this.state === 'moving' ? b.levelAt(this.y + 0.3) : this.level;
    this.lamp.draw(this.floorLabel(lv) + (this.state === 'moving' ? (this.levelY(this.target) > this.y ? '▲' : '▼') : ''));
    this.nearK = b.levelAt(pl.y);
  }
  syncCab(force) {
    const p = { x: this.cx, y: this.y, z: this.cz };
    this.body.setTranslation(p, true);
    this.group.position.set(this.cx, this.y, this.cz);
  }
  // shaft doors: collider present unless that level's door is open (cab parked there with doors open)
  shaftDoorsUpdate() {
    const b = this.b, col = this.G.world.colliders;
    for (const [k, fl] of b.floors) {
      let d = this.shaftDoors.get(k);
      if (!d) {
        const L = b.levels[k], c = b.core, smid = (b.shaft.x0 + b.shaft.x1) / 2;
        const gp = new THREE.Group(); const m = mats();
        const dl = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.4, 0.06), m.steel.clone()), dr = dl.clone();
        for (const mm of [dl, dr]) { mm.material.vertexColors = false; mm.material.color.set(0x9aa0ac); mm.frustumCulled = false; gp.add(mm); }
        gp.position.set(smid, L.y + 1.2, c.zc - 0.06); fl.group.add(gp);
        const box = col.addBox(smid - 0.75, c.zc - 0.12, smid + 0.75, c.zc, L.y + 2.4, 'elev', L.y); fl.boxes.push(box);
        d = { gp, dl, dr, box, open: 0, hasBox: true, L }; this.shaftDoors.set(k, d);
        fl.elevDoor = d;
      }
      const here = this.state !== 'moving' && this.level === k && Math.abs(this.y - d.L.y) < 0.02;
      const want = here ? this.doorOpen : 0;
      d.open = want;
      d.dl.position.x = -0.37 - 0.7 * want; d.dr.position.x = 0.37 + 0.7 * want;
      const shouldBlock = want < 0.7;
      if (shouldBlock && !d.hasBox) { d.box = col.addBox(this.cx - 0.75, b.core.zc - 0.12, this.cx + 0.75, b.core.zc, d.L.y + 2.4, 'elev', d.L.y); fl.boxes.push(d.box); d.hasBox = true; }
      if (!shouldBlock && d.hasBox) { col.removeBox(d.box); const i = fl.boxes.indexOf(d.box); if (i >= 0) fl.boxes.splice(i, 1); d.hasBox = false; }
    }
    for (const k of [...this.shaftDoors.keys()]) if (!b.floors.has(k)) this.shaftDoors.delete(k);
    // cab front closes with the shaft doors so riders cannot walk out mid-ride
    const closed = this.doorOpen < 0.7;
    if (closed && !this.frontBlock) { this.frontBlock = this.G.phys.world.createCollider(this.G.RAPIER.ColliderDesc.cuboid(1.22, 1.35, 0.05).setTranslation(0, 1.2, 1.22 + 0.04).setCollisionGroups(grp(GR.OBJ, 0xffff)), this.body); }
    if (!closed && this.frontBlock) { this.G.phys.world.removeCollider(this.frontBlock, false); this.frontBlock = null; }
  }
  destroy() {
    const w = this.G.phys.world;
    this.G.interact.remove(this.panel); this.G.interact.remove(this.cabPanel);
    w.removeRigidBody(this.body);
  }
}

// ====================================================================
// Manager: streams buildings around the player
// ====================================================================
export class Buildings {
  constructor(G) {
    this.G = G; this.list = []; this.active = new Set(); this.t = 0;
    for (const l of G.world.lots) if (l.name && l.door) this.list.push(new Building(this, l));
    this.byLot = new Map(this.list.map((b) => [b.lot, b]));
    this.lights = Array.from({ length: 6 }, () => { const l = new THREE.PointLight(0xffe2b0, 0, 17, 1.6); G.scene.add(l); return l; });
    this.lt = 0;
  }
  populateFloor(b, fl, L, rooms) { this.G.life.populate(b, fl, L, rooms); }
  onFloorDropped(b, fl) { this.G.life.dropFloor(b, fl); }
  // nearest ceiling fixtures around the player become real lights
  updateLights(dt, pl) {
    this.lt -= dt; if (this.lt > 0) return; this.lt = 0.15;
    const b = this.at(pl.x, pl.z); const cand = [];
    if (b && b.open) {
      const k = b.levelAt(pl.y + 0.3);
      for (const kk of [k - 1, k, k + 1]) { const fl = b.floors.get(kk); if (fl) for (const f of fl.fixtures) if (!f.room || f.room.on) cand.push(f); }
    }
    cand.sort((a, c) => ((a[0] - pl.x) ** 2 + (a[1] - pl.y - 1.5) ** 2 + (a[2] - pl.z) ** 2) - ((c[0] - pl.x) ** 2 + (c[1] - pl.y - 1.5) ** 2 + (c[2] - pl.z) ** 2));
    this.lights.forEach((l, i) => {
      l.visible = i < LIGHT_CAP.bld;
      const f = cand[i];
      if (!f) { l.intensity = 0; return; }
      l.position.set(f[0], f[1], f[2]); l.color.setRGB(f[3][0], f[3][1], f[3][2]); l.intensity = 28; 
    });
  }
  at(x, z) { for (const b of this.list) { const l = b.lot; if (x >= l.x0 && x <= l.x1 && z >= l.z0 && z <= l.z1) return b; } return null; }
  update(dt, fx, fz, py) {
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 0.4;
      for (const b of this.list) {
        const d = Math.hypot(b.cx - fx, b.cz - fz) - Math.max(b.lot.x1 - b.lot.x0, b.lot.z1 - b.lot.z0) * 0.5;
        if (!b.open && d < ACT_R) { if (this.active.size < 4) { b.activate(); this.active.add(b); } }
        else if (b.open && d > DROP_R) { b.deactivate(); this.active.delete(b); }
      }
    }
    this.updateLights(dt, this.G.player);
    for (const b of this.active) {
      const inside = fx >= b.lot.x0 - 3 && fx <= b.lot.x1 + 3 && fz >= b.lot.z0 - 3 && fz <= b.lot.z1 + 3;
      if (inside && !(b.elev && b.elev.state === 'moving')) { const k = b.levelAt(py); b.ensureRange(k - 2, k + 3); b.curLevel = k; }
      b.tick(dt);
    }
  }
  ridingElevator(pl) { for (const b of this.active) if (b.elev && b.elev.state === 'moving' && b.elev.riding(pl)) return true; return false; }
  current(x, z, y) { const b = this.at(x, z); return b && b.open ? b : null; }
}
