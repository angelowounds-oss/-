import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Builder, mats, disposeGroup, SURF } from './gfx.js';
import { GR, grp } from './physics.js';
import { accentColor, BAY } from './world.js';
import { mulberry32, clamp, lerp, damp, TAU, LIGHT_CAP } from './util.js';
import { livingSet, LIVING_COLLIDERS } from './livingset.js';
import { Frame, FloorDecor, furnitureReady, decorateRoom } from './rooms.js';

// ====================================================================
// Physically continuous buildings: every road-facing tower has a real entrance, real floors,
// a stair core, a working elevator and an accessible roof. Interiors are streamed around the
// player (shell colliders + meshes are built per-floor on demand and torn down when far).
// ====================================================================
const FH = 4.0, SLAB = 0.35, WALL = 0.5, ACT_R = 62, DROP_R = 96, MAX_ACTIVE = 6;
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
    if (this.pending.length) { const k = this.pending.shift(); if (!this.floors.has(k)) { this.buildFloor(k); if (this.levels[k].tier !== 'podium' && !(this.elev && this.elev.state === 'moving')) this.updateSolid(); } }
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
    fl.deco = furnitureReady() ? new FloorDecor(fl, y) : null;
    if (L.type === 'lobby') this.furnishLobby(fl, L);
    else if (L.type === 'retail') this.furnishOpen(fl, L, 'retail');
    else if (L.type === 'roof') this.furnishRoof(fl, L);
    else this.furnishRooms(fl, L);
    fl.deco?.finish(fl.group);
    // ---- finish meshes ----
    B.finish(fl.group);
    this.buildGlassMesh(fl);
    this.G.breach?.applyFloor(this, fl, k);   // walls breached earlier stay open
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
    { const L = this.levels[k], r = L.rect; this.G.ragdolls?.bakeInBox(r.x0, r.z0, r.x1, r.z1, L.y, L.y + L.h); }   // bodies lying on this floor freeze before it disappears
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
        if (!ground) { // interior dressing: sill board, curtains (every other bay) in a few fabrics
          const inner = sd.d > 0 ? mx : mn - 0.09, o = sd.d > 0 ? mx + 0.09 : mn;
          const place = (ua2, ub2, ya, yb, col, off) => { const e = sd.ax === 'x' ? [ua2, ya, inner - (sd.d < 0 ? off : 0), ub2, yb, inner + 0.09 + (sd.d > 0 ? off : 0)] : [inner - (sd.d < 0 ? off : 0), ya, ua2, inner + 0.09 + (sd.d > 0 ? off : 0), yb, ub2]; B.ext('decor', e[0], e[1], e[2], e[3], e[4], e[5], col); };
          place(ca, cb, y + sill, y + sill + 0.04, 0xd9d4c8, 0.16);
          if ((i + L.k) % 2 === 0) { const col = [0x7a3a48, 0x35546a, 0xb9a98a, 0x4e4e5e][(i * 3 + L.k) % 4], cw = Math.min(0.55, (cb - ca) * 0.2); place(ca, ca + cw, y + 0.25, y + head + 0.25, col, 0.06); place(cb - cw, cb, y + 0.25, y + head + 0.25, col, 0.06); }
        }
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
    // big floor number on the corridor side of the lift wall (readable from down the corridor)
    if (!isRoof && hh > 3.1) {
      const txt = String(fl.k + 1), gs = [];
      for (let q = 0; q < txt.length; q++) {
        const g = new THREE.PlaneGeometry(0.26, 0.4), uv = g.attributes.uv;
        for (let j = 0; j < uv.count; j++) uv.setX(j, (+txt[q] + uv.getX(j)) / 10);
        g.translate(smid + (q - (txt.length - 1) / 2) * 0.27, y + 2.95, zc + 0.06); gs.push(g);
      }
      const m = new THREE.Mesh(mergeGeometries(gs), digitMaterial()); m.frustumCulled = false; fl.group.add(m);
    }
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
  // thin floor finish over a rect (wood / tile / carpet / concrete pattern from the interior surface shader, tinted by `col`)
  floorFinish(fl, x0, z0, x1, z1, y, surf, col) {
    const B = fl.B; B.surf = surf; B.ext('decor', x0, y + 0.004, z0, x1, y + 0.014, z1, col); B.surf = 0;
  }
  furnishLobby(fl, L) {
    this.floorFinish(fl, L.rect.x0 + WALL, L.rect.z0 + WALL, L.rect.x1 - WALL, L.rect.z1 - WALL, L.y, SURF.tile, 0xc8ccd6);
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
    const D = fl.deco;
    if (D) {
      if (ok) D.put('CashRegister_01', rx, rz, Math.atan2(d.nx, d.nz), { lift: 1.1, solid: false });
      if (ok) { D.put('carved_wooden_elephant', rx - d.nz * 0.7, rz + d.nx * 0.7, Math.atan2(d.nx, d.nz), { lift: 1.1, s: 2, solid: false }); D.put('croissant', rx + d.nz * 0.7, rz - d.nx * 0.7, 1, { lift: 1.1, s: 1.2, solid: false }); }
      const coreHit = (x, z) => x > c.x0 - 1 && x < c.x0 + CORE_W + 2 && z > c.z0 - 1 && z < c.zc + 3;
      // the lobby walls are mostly glass, so the directory stands on a free post beside the entrance route
      const kx = clamp(cx - d.nx * 5 + (inX ? 0 : -3.6), r.x0 + 2, r.x1 - 2), kz = clamp(cz - d.nz * 5 + (inX ? -3.6 : 0), r.z0 + 2, r.z1 - 2), fry = Math.atan2(d.nx, d.nz);
      const kok = !coreHit(kx, kz);
      if (kok) { solid('decor', kx - 0.5, 0, kz - 0.06, kx + 0.5, 0.08, kz + 0.06, 0x1b1d28); solid('decor', kx - 0.04, 0.08, kz - 0.04, kx + 0.04, 1.35, kz + 0.04, 0x1b1d28); }
      if (ok) D.put('lion_head', rx - d.nz * 1.9, rz + d.nx * 1.9, fry, { lift: 1.1, s: 0.9, solid: false });
      {   // wall directory: building name and what is on each level
        const np = this.levels.filter((l) => l.tier === 'podium').length, nt = this.levels.filter((l) => l.tier === 'tower').length;
        const cv = document.createElement('canvas'); cv.width = 512; cv.height = 320; const g = cv.getContext('2d');
        g.fillStyle = '#0b0e14'; g.fillRect(0, 0, 512, 320); g.strokeStyle = 'rgb(255,200,120)'; g.lineWidth = 6; g.strokeRect(8, 8, 496, 304);
        g.fillStyle = 'rgb(255,200,120)'; g.font = 'bold 40px sans-serif'; g.textBaseline = 'top'; g.fillText(String(this.name || 'BUILDING').slice(0, 18), 28, 24);
        g.font = '28px sans-serif'; g.fillStyle = '#d8dce6';
        const rows = [['1F', 'LOBBY'], np > 1 ? [`2-${np}F`, 'RETAIL'] : null, [`${np + 1}-${np + nt}F`, this.kind === 'hotel' ? 'ROOMS' : this.kind === 'office' ? 'OFFICES' : 'RESIDENCES'], ['ROOF', 'ACCESS']].filter(Boolean);
        rows.forEach((rw, i) => { g.fillText(rw[0], 40, 92 + i * 52); g.fillText(rw[1], 190, 92 + i * 52); });
        const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
        const pm = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.69), new THREE.MeshBasicMaterial({ map: tx, toneMapped: false }));
        pm.rotation.y = fry; pm.position.set(kx + d.nx * 0.06, 1.62, kz + d.nz * 0.06); if (kok) fl.group.add(pm);
      }
      for (let i = 0; i < 3; i++) D.put(i === 1 ? 'painted_wooden_sofa' : 'sofa_02', r.x1 - 2.4, r.z1 - 3 - i * 3.4, -Math.PI / 2);
      D.put('coffee_table_round_01', r.x1 - 4.4, r.z1 - 4.7, 0);
      // lounge groups: two lounge chairs around a low table, plus plants and sconces along the walls
      for (const [gx, gz] of [[r.x0 + 6, r.z0 + 6], [r.x0 + 6, r.z1 - 7], [(r.x0 + r.x1) / 2 + 5, r.z0 + 5]]) {
        D.put('modern_coffee_table_01', gx, gz, 0); D.put('mid_century_lounge_chair', gx - 1.5, gz, Math.PI / 2); D.put('mid_century_lounge_chair', gx + 1.5, gz, -Math.PI / 2); D.put('potted_plant_02', gx + 2.4, gz - 1.6, Math.random() * 6);
      }
      for (let k = 0; k < 6; k++) { D.put('industrial_wall_sconce', r.x0 + 0.16, r.z0 + 4 + k * ((r.z1 - r.z0 - 8) / 5), Math.PI / 2, { lift: 2.3, solid: false }); }
      for (const [tx, tz] of [[r.x0 + 1.2, (r.z0 + r.z1) / 2], [r.x1 - 1.2, (r.z0 + r.z1) / 2 + 4]]) D.put('metal_trash_can', tx, tz, 0, { s: 0.38 });
      D.put('fancy_picture_frame_02', r.x0 + 0.1, (r.z0 + r.z1) / 2 - 3, Math.PI / 2, { lift: 1.7, solid: false, s: 1.6 });
      D.put('Chandelier_03', (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, 0, { lift: L.h - 1.2, solid: false });
      for (const [px, pz] of [[r.x0 + 1.4, r.z1 - 1.4], [r.x1 - 1.4, r.z0 + 1.4], [r.x1 - 1.4, r.z1 - 1.4], [r.x0 + 1.4, r.z0 + 1.4]]) D.put('potted_plant_02', px, pz, Math.random() * 6);
      D.put('wall_clock', r.x0 + 0.12, (r.z0 + r.z1) / 2 + 3, Math.PI / 2, { lift: 2.6, solid: false });
      D.put('security_camera_01', r.x0 + 0.5, r.z0 + 0.5, Math.PI / 4, { lift: L.h - 0.7, solid: false, s: 0.8 });
      D.put('WetFloorSign_01', this.cx + d.nx * 2.5 + d.nz * 3, this.cz + d.nz * 2.5 - d.nx * 3, Math.random() * 6);
    }
    // seating + plants on the opposite side of the core
    if (!D) for (let i = 0; i < 3; i++) this.sofa(fl, r.x1 - 3.2 - i * 0, r.z1 - 3 - i * 3.4, Math.PI / 2, [0x3a2f55, 0x22304a, 0x4a2a5a][i]);
    if (!D) { this.plant(fl, r.x0 + 1.4, r.z1 - 1.4); this.plant(fl, r.x1 - 1.4, r.z0 + 1.4); this.plant(fl, r.x1 - 1.4, r.z1 - 1.4); }
    // logo wall
    B.ext('emit', c.x0 + CORE_W + 0.3, 1.6, c.zc - 0.4, c.x0 + CORE_W + 2.4, 2.0, c.zc - 0.34, acc.clone().multiplyScalar(1.4));
    this.M.populateFloor?.(this, fl, L);
  }
  furnishOpen(fl, L, kind) {
    this.floorFinish(fl, L.rect.x0 + WALL, L.rect.z0 + WALL, L.rect.x1 - WALL, L.rect.z1 - WALL, L.y, SURF.tile, 0xb4b8c4);
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
    const D = fl.deco;
    if (D && fl.counter) {
      const k = fl.counter; D.put('CashRegister_01', k.x0 + 1, (k.z0 + k.z1) / 2, 0, { lift: 1.05, solid: false });
      D.put('CashRegister_01', k.x1 - 1, (k.z0 + k.z1) / 2, 0, { lift: 1.05, solid: false });
    }
    if (D) {
      for (let x = r.x0 + 3; x < r.x1 - 3; x += 6.5) D.put('mounted_fluorescent_lights', x, (r.z0 + r.z1) / 2, 0, { lift: L.h - 0.42, solid: false });
      for (const sh of fl.shelves) {
        D.put('cardboard_box_01', sh.x - 0.9, sh.z0 + 0.6, Math.random() * 6); D.put('plastic_monobloc_chair_01', sh.x + 0.9, sh.z1 - 0.5, Math.random() * 6);
        // stock on top and along the shelf: crates, baskets, boxes
        for (let q = 0; q < 5; q++) { const z = sh.z0 + 0.5 + q * ((sh.z1 - sh.z0 - 1) / 4), id = ['plastic_crate_02', 'wicker_basket_01', 'cardboard_box_01', 'plastic_crate_02', 'trashbag'][q]; D.put(id, sh.x, z, Math.random() * 6, { lift: 1.9, solid: false }); }
      }
      D.put('potted_plant_02', r.x0 + 1.2, r.z0 + 1.2, 0); D.put('potted_plant_02', r.x1 - 1.2, r.z0 + 1.2, 1.5);
      D.put('security_camera_01', r.x1 - 0.5, r.z1 - 0.5, -Math.PI * 0.75, { lift: L.h - 0.7, solid: false, s: 0.8 });
    }
    this.M.populateFloor?.(this, fl, L);
  }
  furnishRoof(fl, L) {
    const { B, solid, cc, R } = fl, tow = this.tow;
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
    // AC unit fan grilles, a water tank on a steel stand, and an antenna mast with a red aviation light
    for (let i = 0; i < 3; i++) {
      const ax = tow.x1 - 3.2, az = tow.z0 + 2.5 + i * 3.4; if (az > tow.z1 - 2) break;
      B.ext('decor', ax - 0.7, this.roofY + 1.3, az - 0.7, ax + 0.7, this.roofY + 1.36, az + 0.7, 0x15181f);
      B.ext('decor', ax - 0.06, this.roofY + 1.36, az - 0.7, ax + 0.06, this.roofY + 1.4, az + 0.7, 0x2a2e38); B.ext('decor', ax - 0.7, this.roofY + 1.36, az - 0.06, ax + 0.7, this.roofY + 1.4, az + 0.06, 0x2a2e38);
    }
    {
      const wx = tow.x0 + 3.4, wz = tow.z1 - 3.4, ry = this.roofY;
      for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) solid('steel', wx + dx - 0.07, ry, wz + dz - 0.07, wx + dx + 0.07, ry + 1.4, wz + dz + 0.07, 0x3b414d);
      cc(wx - 1.1, wz - 1.1, wx + 1.1, wz + 1.1, ry + 1.4, ry + 3.5, 'furniture');
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 2.1, 12), new THREE.MeshStandardMaterial({ color: 0x6d7480, roughness: 0.6, metalness: 0.4 }));
      tank.position.set(wx, ry + 2.45, wz); fl.group.add(tank);
      const mx = tow.x1 - 1.6, mz = tow.z1 - 1.6;
      solid('steel', mx - 0.08, ry, mz - 0.08, mx + 0.08, ry + 9, mz + 0.08, 0x2a2e38);
      B.box('emit', mx, ry + 9.15, mz, 0.3, 0.3, 0.3, new THREE.Color(1, 0.1, 0.1), 0, 3);
      for (let k = 1; k <= 3; k++) B.ext('decor', mx - 0.7, ry + 2 + k * 2, mz - 0.03, mx + 0.7, ry + 2.06 + k * 2, mz + 0.03, 0x2a2e38);
    }
    fl.fixtures.push([cx, this.roofY + 4, cz, [0.8, 0.9, 1]]);
    this.M.populateFloor?.(this, fl, L);
  }
  furnishRooms(fl, L) {
    const { B, solid, cc, R, rnd } = fl, r = L.rect, c = this.core, zc = c.zc;
    const ix0 = r.x0 + WALL, ix1 = r.x1 - WALL, iz0 = r.z0 + WALL, iz1 = r.z1 - WALL, y = L.y, h = L.h - SLAB;
    const wallC = fl.wallC, rooms = [];
    const t = 0.18;
    const wallSeg = (x0, z0, x1, z1) => {
      B.ext('decor', x0, y, z0, x1, y + h, z1, wallC); cc(x0, z0, x1, z1, y, y + h, 'part');
      // baseboard and crown moulding on both faces
      B.ext('decor', x0 - 0.025, y, z0 - 0.025, x1 + 0.025, y + 0.13, z1 + 0.025, 0xded8cc);
      B.ext('decor', x0 - 0.02, y + h - 0.09, z0 - 0.02, x1 + 0.02, y + h, z1 + 0.02, 0xeae6dc);
    };
    // door frame (jambs + head) around a doorway, plus a small number plate on the corridor side
    const frame = (axis, c, u, w, side) => {
      const f = 0x4a3626, th = t + 0.1, jw = 0.07;
      if (axis === 'x') {
        B.ext('decor', u - w / 2 - jw, y, c - th / 2, u - w / 2, y + 2.15, c + th / 2, f); B.ext('decor', u + w / 2, y, c - th / 2, u + w / 2 + jw, y + 2.15, c + th / 2, f);
        B.ext('decor', u - w / 2 - jw, y + 2.12, c - th / 2, u + w / 2 + jw, y + 2.2, c + th / 2, f);
        B.ext('emit', u + w / 2 + 0.22, y + 1.55, c + side * (t / 2 + 0.012) - 0.0, u + w / 2 + 0.42, y + 1.67, c + side * (t / 2 + 0.03), new THREE.Color(1, 0.82, 0.55).multiplyScalar(0.9));
      }
    };
    // wall along x at z with doorways [(u,w)] ; along z at x
    const wallX = (z, xa, xb, gaps) => {
      let cur = xa; const g = [...gaps].sort((p, q) => p[0] - q[0]);
      for (const [u, w] of g) { frame('x', z, u, w, z > zc ? -1 : 1); if (u - w / 2 > cur) wallSeg(cur, z - t / 2, u - w / 2, z + t / 2); B.ext('decor', u - w / 2, y + 2.15, z - t / 2, u + w / 2, y + h, z + t / 2, wallC); cc(u - w / 2, z - t / 2, u + w / 2, z + t / 2, y + 2.15, y + h, 'part'); cur = u + w / 2; }
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
        // a 20 m deep strip becomes a flat: front room on the corridor, then inner rooms behind partitions with open doorways
        const Dn = iz1 - corrZ1, ns = Math.max(1, Math.round(Dn / 6.8)), sg = Dn / ns;
        for (let q = 0; q < ns; q++) {
          const z0s = corrZ1 + q * sg, door = q === 0 ? dx : a + rw * 0.5 + (q % 2 ? 0.9 : -0.9);
          rooms.push({ x0: a, z0: z0s, x1: b, z1: z0s + sg, wall: 'n', dx: door, dz: z0s, sub: q, ns });
          if (q > 0) wallX(z0s, a, b, [[door, 1.05]]);
        }
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
        const Dn = zc - iz0, ns = Math.max(1, Math.round(Dn / 6.8)), sg = Dn / ns;
        for (let q = 0; q < ns; q++) {
          const z1s = zc - q * sg, door = q === 0 ? dx : a + rw * 0.5 + (q % 2 ? 0.9 : -0.9);
          rooms.push({ x0: a, z0: z1s - sg, x1: b, z1: z1s, wall: 's', dx: door, dz: z1s, sub: q, ns });
          if (q > 0) wallX(z1s, a, b, [[door, 1.05]]);
        }
        if (i > 0) wallZ(a, iz0, zc, []);
        doors.push({ axis: 'x', c: zc, u: dx });
      }
      wallX(zc, r2x0, ix1, gaps);
    }
    // corridor carpet lighting accent
    this.floorFinish(fl, ix0, zc, ix1, corrZ1, y, SURF.carpet, L.type === 'hotel' ? 0xa65a72 : L.type === 'office' ? 0x6a74a0 : 0x8a6078);
    B.ext('emit', ix0 + 1, y + 0.025, (zc + corrZ1) / 2 - 0.03, ix1 - 1, y + 0.035, (zc + corrZ1) / 2 + 0.03, fl.acc.clone().multiplyScalar(1.2), 1);
    let doorNo = 0; const numGeos = [];
    for (const d of doors) {
      // room number above the door, on the corridor side: three digit quads from a shared digit sheet
      const face = d.c > zc + 0.5 ? -1 : 1, txt = String(fl.k * 100 + ++doorNo).padStart(3, '0');
      for (let q = 0; q < txt.length; q++) {
        const dg = +txt[q], g = new THREE.PlaneGeometry(0.1, 0.15), uv = g.attributes.uv;
        for (let j = 0; j < uv.count; j++) uv.setX(j, (dg + uv.getX(j)) / 10);
        if (face < 0) g.rotateY(Math.PI);
        g.translate(d.u + (q - 1) * 0.105 * (face < 0 ? -1 : 1), y + 2.3, d.c + face * (t / 2 + 0.034)); numGeos.push(g);
      }
      const dr = new Door(this, fl, { axis: 'x', wallC: d.c, from: d.u - 0.5, to: d.u + 0.5, y, h: 2.12, thick: 0.05, kind: 'wood', hingeAt: 'from', swing: 1, name: '방 문', lock: true });
      void dr;
    }
    if (numGeos.length) { const m = new THREE.Mesh(mergeGeometries(numGeos), digitMaterial()); m.frustumCulled = false; fl.group.add(m); }
    // furnish
    rooms.forEach((rm, i) => this.furnishRoom(fl, L, rm, i));
    this.addLivingSets(fl, y);
    // open spaces: corridor decor
    this.plant(fl, ix0 + 0.6, corrZ1 - 0.6);
    const D = fl.deco;
    if (D) {
      const mid = (zc + corrZ1) / 2;
      for (let x = ix0 + 4; x < ix1 - 2; x += 7.5) D.put('mounted_fluorescent_lights', x, mid, 0, { lift: L.h - 0.42, solid: false });
      D.put('wall_clock', ix0 + 0.12, mid, Math.PI / 2, { lift: 2.3, solid: false });
      D.put('fire_alarm', ix1 - 0.12, corrZ1 - 0.2, -Math.PI / 2, { lift: 1.5, solid: false });
      D.put('security_camera_01', ix1 - 0.4, mid, 0, { lift: L.h - 0.65, solid: false, s: 0.8 });
      D.put('painted_wooden_cabinet', ix1 - 0.5, zc + 0.9, -Math.PI / 2, { tag: 'furniture' });
      // fire safety and wayfinding: extinguishers with signs, glowing exit sign at the far end, bins, wall lights, duct + pipe runs
      for (const xx of [r2x0 + 3, ix0 + 9]) { D.put('korean_fire_extinguisher_01', xx, zc + 0.3, 0, { lift: 0.95, solid: false }); B.ext('emit', xx - 0.14, y + 1.75, zc + 0.065, xx + 0.14, y + 2.0, zc + 0.08, new THREE.Color(1, 0.2, 0.15).multiplyScalar(1.3)); }
      B.ext('emit', ix1 - 0.06, y + 2.3, mid - 0.45, ix1 - 0.03, y + 2.62, mid + 0.45, new THREE.Color(0.2, 1, 0.45).multiplyScalar(1.7));
      B.ext('emit', ix0 + 0.03, y + 2.3, mid - 0.45, ix0 + 0.06, y + 2.62, mid + 0.45, new THREE.Color(0.2, 1, 0.45).multiplyScalar(1.7));
      D.put('metal_trash_can', ix0 + 6, corrZ1 - 0.35, 0, { s: 0.38, solid: false });
      for (let x = ix0 + 5; x < ix1 - 2; x += 6) { D.put('industrial_wall_sconce', x, corrZ1 - 0.12, Math.PI, { lift: 2.1, solid: false }); }
      B.ext('steel', ix0, y + L.h - 0.62, zc + 0.14, ix1, y + L.h - 0.5, zc + 0.3, 0x6c727c);
      B.ext('steel', ix0, y + L.h - 0.78, zc + 0.14, ix1, y + L.h - 0.7, zc + 0.2, 0x8a6a3a);
      B.ext('decor', ix0, y + L.h - 0.5, zc + 0.05, ix1, y + L.h - 0.46, zc + 0.45, 0x3c4048);          // cable tray
      // vending machine at the end of the corridor
      { const vx = ix1 - 1.1, vz = corrZ1 - 0.5; fl.solid('decor', vx - 0.45, y, vz - 0.4, vx + 0.45, y + 1.85, vz + 0.4, 0x2a3a5a); B.ext('emit', vx - 0.38, y + 0.9, vz - 0.405, vx + 0.38, y + 1.7, vz - 0.395, new THREE.Color(0.35, 0.75, 1).multiplyScalar(1.5)); B.ext('emit', vx - 0.38, y + 0.3, vz - 0.405, vx + 0.38, y + 0.38, vz - 0.395, new THREE.Color(1, 0.5, 0.2).multiplyScalar(1.3)); }
    }
    this.M.populateFloor?.(this, fl, L, rooms);
    fl.rooms = rooms;
  }
  furnishRoom(fl, L, rm, i) {
    const { B, solid, R } = fl, y = L.y;
    const unit = (rm.sub != null ? Math.floor(i / Math.max(1, rm.ns)) : i);
    const kind = rm.sub != null
      ? (L.type === 'office' ? [['office', 'server', 'meeting'], ['meeting', 'office', 'office'], ['office', 'server', 'office'], ['office', 'office', 'office']][unit % 4][rm.sub % 3] : L.type === 'hotel' ? ['bedroom', 'living', 'bedroom'][rm.sub % 3] : ['living', 'kitchen', 'bedroom'][rm.sub % 3])
      : L.type === 'office' ? ['office', 'office', 'meeting', 'server', 'office'][i % 5] : L.type === 'hotel' ? 'bedroom' : ['living', 'bedroom', 'kitchen', 'bedroom'][i % 4];
    rm.kind = kind;
    {
      const fx = { living: [SURF.wood, 0xc89a68], bedroom: [L.type === 'hotel' ? SURF.carpet : SURF.wood, L.type === 'hotel' ? 0x9a6a80 : 0xc99a66], kitchen: [SURF.tile, 0xd6dae2], office: [SURF.carpet, 0x7480ae], meeting: [SURF.carpet, 0x5a6c88], server: [SURF.concrete, 0x9096a0] }[kind];
      if (fx) this.floorFinish(fl, rm.x0 + 0.1, rm.z0 + 0.1, rm.x1 - 0.1, rm.z1 - 0.1, y, fx[0], fx[1]);
    }
    const x0 = rm.x0 + 0.2, x1 = rm.x1 - 0.2, z0 = rm.z0 + 0.2, z1 = rm.z1 - 0.2, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const south = rm.wall === 'n';  // room lies south of its door wall: door side is north (z0)
    const back = south ? z1 : z0, dirIn = south ? 1 : -1; // direction from door wall into the room
    const col = (cx_, cz_, w, d, hgt, color, em) => solid('decor', cx_ - w / 2, y, cz_ - d / 2, cx_ + w / 2, y + hgt, cz_ + d / 2, color, em);
    const acc = fl.acc;
    if (rm.kind === 'bedroom' && rm.sub != null && fl.deco && (L.type === 'apartment' || L.type === 'hotel')) this.bathCell(fl, L, rm, y);
    if (fl.deco) {
      // rooms are ~8 x 20 m: split into zones of ~6.5 m from the back wall and furnish each as its own room-like area
      const D = rm.z1 - rm.z0 - 0.4, nseg = Math.max(1, Math.round(D / 6.5)), seg = D / nseg;
      const cycle = { office: ['office', 'office', 'office'], meeting: ['meeting', 'meeting', 'office'], server: ['server', 'server', 'server'], bedroom: L.type === 'hotel' ? ['bedroom', 'living', 'bedroom'] : ['bedroom', 'living', 'kitchen'], kitchen: ['kitchen', 'living', 'bedroom'], living: ['living', 'bedroom', 'kitchen'] }[kind] || ['living'];
      const tint = { bedroom: [1, 0.78, 0.55], kitchen: [1, 0.95, 0.85], office: [0.9, 0.95, 1], meeting: [1, 1, 1], server: [0.4, 0.7, 1], living: [1, 0.8, 0.6] };
      for (let sI = 0; sI < nseg; sI++) {
        const k2 = cycle[sI % cycle.length];
        if (kind === 'living' && sI === 0) continue;       // the first living zone keeps the hand-placed sofa / TV anchors of life.js
        decorateRoom(new Frame(rm, y, [sI * seg, (sI + 1) * seg]), fl.deco, k2, L);
        if (sI > 0) { const south2 = rm.wall === 'n', zz = south2 ? rm.z1 - 0.2 - (sI + 0.5) * seg : rm.z0 + 0.2 + (sI + 0.5) * seg; fl.fixtures.push([cx, y + 3.2, zz, tint[k2] || [1, 1, 1]]); }
      }
      if (kind !== 'living') { fl.fixtures.push([cx, y + 3.2, rm.wall === 'n' ? rm.z1 - 0.2 - 0.5 * seg : rm.z0 + 0.2 + 0.5 * seg, tint[kind] || [1, 1, 1]]); return; }
    }
    if (kind === 'bedroom') {
      col(cx, back - dirIn * 1.2, 2.0, 2.1, 0.5, 0xd8d0d8);
      B.ext('decor', cx - 1.0, y + 0.5, back - dirIn * 2.0, cx + 1.0, y + 0.7, back - dirIn * 1.7, 0xc8c0c8);
      B.ext('emit', cx - 1.2, y + 0.9, back - dirIn * 0.15, cx + 1.2, y + 1.7, back - dirIn * 0.1, acc.clone().multiplyScalar(0.9));
      col(x0 + 0.5, back - dirIn * 0.5, 1.0, 0.5, 2.0, 0x2a2d38); // wardrobe
      col(cx + 1.5, back - dirIn * 0.5, 0.5, 0.5, 0.55, 0x2a2d38);
      fl.fixtures.push([cx, y + 3.2, cz, [1, 0.78, 0.55]]);
    } else if (kind === 'living') {
      (fl.livings = fl.livings || []).push({ x: cx, z: back, ry: south ? Math.PI : 0 });
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
  // en-suite bathroom in the back corner of a bedroom: walls with a doorway, tiled floor, toilet, basin with mirror, tub
  bathCell(fl, L, rm, y) {
    const { B, solid, cc } = fl, south = rm.wall === 'n', dirIn = south ? 1 : -1, back = south ? rm.z1 - 0.2 : rm.z0 + 0.2;
    const xa = rm.x0 + 0.2, xb = xa + 2.35, zf = back - dirIn * 2.75, wallC = fl.wallC, t = 0.14, h = L.h - 0.35;
    const zmin = Math.min(back, zf), zmax = Math.max(back, zf), gap = [xa + 0.35, xa + 1.25];   // doorway towards the bedroom
    // front wall with the doorway and a lintel, side wall towards the bedroom
    solid('decor', gap[1], y, zf - t / 2, xb, y + h, zf + t / 2, wallC, 1, 'part');
    solid('decor', xa, y, zf - t / 2, gap[0], y + h, zf + t / 2, wallC, 1, 'part');
    B.ext('decor', gap[0], y + 2.1, zf - t / 2, gap[1], y + h, zf + t / 2, wallC); cc(gap[0], zf - t / 2, gap[1], zf + t / 2, y + 2.1, y + h, 'part');
    solid('decor', xb - t / 2, y, zmin, xb + t / 2, y + h, zmax, wallC, 1, 'part');
    this.floorFinish(fl, xa, zmin, xb, zmax, y, SURF.tile, 0xe6eaf0);
    B.surf = SURF.tile; B.ext('decor', xa, y + 0.015, zmin, xa + 0.02, y + 1.5, zmax, 0xcfd6de); B.ext('decor', xb - 0.02, y + 0.015, zmin, xb, y + 1.5, zmax, 0xcfd6de); B.surf = 0; // tiled wainscot
    const bx = (x0, z0, x1, z1, y0, y1, col, key = 'decor', sol = true) => { const a = Math.min(x0, x1), b = Math.max(x0, x1), c = Math.min(z0, z1), d = Math.max(z0, z1); B.ext(key, a, y + y0, c, b, y + y1, d, col); if (sol) cc(a, c, b, d, y + y0, y + y1, 'furniture'); };
    const d1 = (k) => back - dirIn * k;
    // tub along the back wall
    bx(xa + 0.05, d1(0.05), xa + 0.8, d1(1.75), 0, 0.55, 0xf2f4f8); bx(xa + 0.14, d1(0.14), xa + 0.71, d1(1.66), 0.5, 0.56, 0x9ecbe6, 'decor', false);
    // toilet (bowl + tank) against the side wall
    bx(xb - 0.5, d1(0.9), xb - 0.05, d1(1.4), 0, 0.42, 0xf4f6fa); bx(xb - 0.45, d1(0.82), xb - 0.08, d1(0.98), 0.42, 0.85, 0xf4f6fa);
    // basin on a stand with a mirror above
    bx(xa + 1.0, d1(1.95), xa + 1.55, d1(2.25), 0, 0.84, 0xe9edf2); bx(xa + 1.02, d1(1.97), xa + 1.53, d1(2.23), 0.82, 0.86, 0x9aa4b0, 'decor', false);
    bx(xa + 1.0, d1(2.72), xa + 1.6, d1(2.69), 1.15, 1.9, new THREE.Color(0.55, 0.7, 0.85).multiplyScalar(1.1), 'emit', false);
    fl.fixtures.push([(xa + xb) / 2, y + L.h - 0.5, (back + zf) / 2, [1, 1, 1]]);
    rm.reserved = [{ x0: xa - 0.1, x1: xb + 0.3, z0: zmin - 0.1, z1: zmax + 0.1 }];
  }
  // glTF living-room furniture, one instanced mesh per material for all living rooms on the floor
  addLivingSets(fl, y) {
    const list = fl.livings, set = list?.length && livingSet(); if (!set) return;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), ax = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
    for (const part of set) {
      const im = new THREE.InstancedMesh(part.geo, part.mat, list.length);
      list.forEach((p, i) => { q.setFromAxisAngle(ax, p.ry); pv.set(p.x, y, p.z); m4.compose(pv, q, one); im.setMatrixAt(i, m4); });
      im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false; fl.group.add(im);
    }
    for (const p of list) {
      const f = Math.cos(p.ry) < 0 ? -1 : 1;
      for (const [x0, z0, x1, z1, h] of LIVING_COLLIDERS) {
        const ax0 = p.x + f * x0, ax1 = p.x + f * x1, az0 = p.z + f * z0, az1 = p.z + f * z1;
        fl.cc(Math.min(ax0, ax1), Math.min(az0, az1), Math.max(ax0, ax1), Math.max(az0, az1), y, y + h, 'furniture');
      }
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
    if (st && st.swing) this.swing = st.swing;
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
    this.x = this.axis === 'x' ? (o.from + o.to) / 2 : o.wallC; this.z = this.axis === 'x' ? o.wallC : (o.from + o.to) / 2; this.r = 2.0; this.cy = o.y + 1.0; if (o.kind === 'glass') this.r = 2.8;
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
    if (!this.locked) { const dir = this.axis === 'x' ? Math.sign(pl.z - this.o.wallC) : Math.sign(pl.x - this.o.wallC); this.swing = dir >= 0 ? -1 : 1; this.target = 1.55; this.vel = 6; if (this.partner && this.o.kind === 'glass') { this.partner.vel = 6; } this.G.toast('문이 벌컥 열렸다'); } else this.G.toast('끄떡도 안 한다');
    this.save();
  }
  save(inner) { this.G.state.doors[this.id] = { locked: this.locked, ang: this.target, broken: this.broken, swing: this.swing }; if (!inner && this.partner && this.o.kind === 'glass') { this.partner.target = this.target; this.partner.swing = this.swing; this.partner.save(true); } }
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
    // front: pillars beside the 1.5 m door opening and a header, so the cab is a closed box seen from inside
    L(-hw, 0, hd - 0.06, -0.75, 2.7, hd, 0x7a808c); L(0.75, 0, hd - 0.06, hw, 2.7, hd, 0x7a808c); L(-0.75, 2.4, hd - 0.06, 0.75, 2.7, hd + 0.06, 0x15171f, 'decor');
    L(-0.8, 2.66, -0.8, 0.8, 2.7, 0.8, 0xfff2dd, 'emit', 2.4);
    L(hw - 0.04, 1.0, -0.4, hw, 1.9, 0.4, 0x1a2a40, 'emit', 1.0);
    L(-hw, 0.9, -0.4 - hd + hd, -hw + 0.06, 0.96, hd - 0.2, 0xb8bec8);
    B.finish(this.group);
    // doors on the cab front (so riders see closed doors while moving) and shaft doors per level
    this.lamp = this.makeDisplay(); this.group.add(this.lamp.mesh); this.lamp.mesh.position.set(0, 2.55, hd - 0.08); this.lampTxt = '';
    const leafMat = new THREE.MeshStandardMaterial({ color: 0xaab0bc, metalness: 0.7, roughness: 0.35 });
    this.leafL = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.4, 0.06), leafMat); this.leafR = this.leafL.clone();
    for (const m of [this.leafL, this.leafR]) { m.frustumCulled = false; m.castShadow = false; this.group.add(m); }
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
    if (this.G.power?.offAt(this.b.cx, this.b.cz)) { if (!silent) this.G.toast('정전', '엘리베이터가 멈췄다 · 계단을 이용하세요'); return; }
    if (this.state === 'idle' && this.level === k && this.doorOpen > 0.9) { this.G.audio.ding?.(); return; }
    if (this.target !== k && !this.queue.includes(k)) this.queue.push(k);
    if (!silent) this.G.toast('엘리베이터 호출', this.floorLabel(k));
    this.G.audio.tone?.(900, 0.1, 'sine', 0.1);
  }
  send(k) { if (this.G.power?.offAt(this.b.cx, this.b.cz)) { this.G.toast('정전', '엘리베이터가 움직이지 않는다'); return; } this.queue = [k]; if (this.state === 'idle') this.state = 'closing'; this.G.audio.tone?.(900, 0.1, 'sine', 0.1); }
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
    if (this.state === 'closing' && this.doorOpen <= 0) { this.target = this.queue[0]; this.state = 'moving'; this.G.audio.elevator?.(clamp(Math.abs(this.levelY(this.target) - this.y) / 4, 1.5, 6)); this.target > this.level ? b.ensureRange(this.level - 1, this.level + 4) : b.ensureRange(this.level - 4, this.level + 1); }
    if (this.state === 'moving') {
      const ty = this.levelY(this.target), dist = ty - this.y, dir = Math.sign(dist);
      const v = Math.min(5.2, Math.max(0.6, Math.sqrt(2 * 1.6 * Math.abs(dist))));
      const ride = this.riding(pl);
      const dy = dir * Math.min(Math.abs(dist), v * dt);
      this.y += dy;
      if (ride) { pl.body3.shift(0, dy, 0); pl.y += dy; if (pl.group) pl.group.position.y += dy; }
      this.vy = dy / Math.max(dt, 1e-4);
      const lvNow = b.levelAt(this.y + 0.3);
      if (lvNow !== this.level) { this.level = lvNow; b.ensureRange(lvNow - 1 + (dir > 0 ? 0 : -2), lvNow + 1 + (dir > 0 ? 2 : 0)); }
      if (Math.abs(dist) < 0.01) { this.y = ty; this.level = this.target; this.queue.shift(); this.state = 'opening'; this.G.audio.ding?.(); b.updateSolid(); if (ride) pl.body3.shift(0, 0.06, 0); }
    }
    this.syncCab();
    this.shaftDoorsUpdate();
    const lv = this.state === 'moving' ? b.levelAt(this.y + 0.3) : this.level;
    const txt = this.floorLabel(lv) + (this.state === 'moving' ? (this.levelY(this.target) > this.y ? '▲' : '▼') : ''); if (txt !== this.lampTxt) { this.lampTxt = txt; this.lamp.draw(txt); }
    this.nearK = b.levelAt(pl.y);
  }
  syncCab(force) {
    const p = { x: this.cx, y: this.y, z: this.cz };
    this.body.setTranslation(p, true);
    this.group.position.set(this.cx, this.y, this.cz);
    const o = this.doorOpen * 0.5;
    this.leafL.position.set(-0.4 - o, 1.2, 1.22 + 0.03); this.leafR.position.set(0.4 + o, 1.2, 1.22 + 0.03);
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
let digitMat = null;
function digitMaterial() {
  if (digitMat) return digitMat;
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 64; const g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.font = 'bold 54px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < 10; i++) g.fillText(String(i), i * 64 + 32, 35);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  digitMat = new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(1, 0.82, 0.5).multiplyScalar(1.1), transparent: true, alphaTest: 0.4, toneMapped: false });
  return digitMat;
}
export class Buildings {
  constructor(G) {
    this.G = G; this.list = []; this.active = new Set(); this.t = 0;
    for (const l of G.world.lots) if (l.name && l.door) this.list.push(new Building(this, l));
    this.byLot = new Map(this.list.map((b) => [b.lot, b]));
    this.lights = Array.from({ length: 6 }, () => { const l = new THREE.PointLight(0xffe2b0, 0, 17, 1.6); G.scene.add(l); return l; });
    this.lt = 0;
  }
  populateFloor(b, fl, L, rooms) { this.G.life.populate(b, fl, L, rooms); this.G.citizens?.populateFloor(b, fl, L, rooms); }
  onFloorDropped(b, fl) { this.G.citizens?.floorDropped(fl); this.G.life.dropFloor(b, fl); }
  // nearest ceiling fixtures around the player become real lights
  updateLights(dt, pl) {
    this.lt -= dt; if (this.lt > 0) return; this.lt = 0.15;
    const b = this.at(pl.x, pl.z); const cand = [];
    if (b && b.open && !this.G.power?.offAt(b.cx, b.cz)) {
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
      const dist = (b) => Math.hypot(b.cx - fx, b.cz - fz) - Math.max(b.lot.x1 - b.lot.x0, b.lot.z1 - b.lot.z0) * 0.5;
      const near = [];
      for (const b of this.list) {
        const d = dist(b);
        if (b.open) { if (d > DROP_R) { b.deactivate(); this.active.delete(b); } }
        else if (d < ACT_R) near.push([d, b]);
      }
      // nearest first; a full pool gives up its farthest building so the one the player stands at is never left without doors
      near.sort((a, c) => a[0] - c[0]);
      for (const [d, b] of near) {
        if (this.active.size >= MAX_ACTIVE) {
          let far = null, fd = -1;
          for (const o of this.active) { const od = dist(o); if (od > fd) { fd = od; far = o; } }
          if (!far || fd <= d + 8) break;
          far.deactivate(); this.active.delete(far);
        }
        b.activate(); this.active.add(b);
      }
    }
    this.updateLights(dt, this.G.player);
    for (const b of this.active) {
      const inside = fx >= b.lot.x0 - 3 && fx <= b.lot.x1 + 3 && fz >= b.lot.z0 - 3 && fz <= b.lot.z1 + 3;
      if (inside && !(b.elev && b.elev.state === 'moving')) { const k = b.levelAt(py); b.ensureRange(k - 2, k + 3); b.curLevel = k; }
      b.tick(dt);
    }
  }
  cabOf(pl) { for (const b of this.active) if (b.elev && b.elev.riding(pl)) return b.elev; return null; }
  ridingElevator(pl) { for (const b of this.active) if (b.elev && b.elev.state === 'moving' && b.elev.riding(pl)) return true; return false; }
  current(x, z, y) { const b = this.at(x, z); return b && b.open ? b : null; }
}
