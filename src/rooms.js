import * as THREE from 'three';
import { FloorDecor, furnitureReady } from './furnish.js';
const THREE_C = THREE.Color;

// Room templates for the packed furniture set. The interaction anchors in life.js (sofa/TV/bed/fridge/wardrobe/desk coordinates)
// are kept, so only what is *visible* changes. Every room works in a local frame: lx = lateral offset from the room centre,
// ld = depth measured from the BACK wall towards the door wall; furniture fronts face +Z of the model.
const PI = Math.PI;

class Frame {
  // sub = [a, b]: only the slice of the room between a and b metres from the back wall (big rooms are furnished zone by zone)
  constructor(rm, y, sub) {
    const x0 = rm.x0 + 0.2, x1 = rm.x1 - 0.2, south = rm.wall === 'n';
    let z0 = rm.z0 + 0.2, z1 = rm.z1 - 0.2; const full = z1 - z0;
    if (sub) { if (south) z0 = z1 - sub[1]; else z1 = z0 + sub[1]; if (south) z1 -= sub[0]; else z0 += sub[0]; }
    this.rm = rm; this.y = y; this.x0 = x0; this.x1 = x1; this.cx = (x0 + x1) / 2; this.fullD = full;
    this.back = south ? z1 : z0; this.dirIn = south ? 1 : -1; this.W = x1 - x0; this.D = z1 - z0;
    this.taken = [];
    // world-space rectangles other builders have claimed (e.g. the bathroom cell)
    for (const r of rm.reserved || []) { const a = Math.abs(r.z0 - this.back), b = Math.abs(r.z1 - this.back); this.taken.push({ lx0: r.x0 - this.cx, lx1: r.x1 - this.cx, ld0: Math.min(a, b), ld1: Math.max(a, b) }); }
    // keep the door clear: a 2 m wide strip in front of the door wall (only the zone that touches it)
    if (!sub || sub[1] >= full - 0.1) this.taken.push({ lx0: rm.dx - this.cx - 1.0, lx1: rm.dx - this.cx + 1.0, ld0: this.D - 1.7, ld1: this.D + 0.5 });
  }
  wx(lx) { return this.cx + lx; }
  wz(ld) { return this.back - this.dirIn * ld; }
  // yaw so that the model front looks: 'in' (towards the door wall), 'back' (towards the back wall), 'l'/'r' (world -x / +x as seen from inside)
  ry(face) { const d = this.dirIn; return face === 'in' ? (d > 0 ? PI : 0) : face === 'back' ? (d > 0 ? 0 : PI) : face === 'r' ? PI / 2 : -PI / 2; }
  free(lx, ld, hx, hz, m = 0.12) {
    if (lx - hx < -this.W / 2 + 0.04 || lx + hx > this.W / 2 - 0.04 || ld - hz < 0.04 || ld + hz > this.D - 0.04) return false;
    return !this.taken.some((t) => lx + hx + m > t.lx0 && lx - hx - m < t.lx1 && ld + hz + m > t.ld0 && ld - hz - m < t.ld1);
  }
}

// places one model; the footprint is checked against everything placed so far
function put(F, deco, id, lx, ld, face, o = {}) {
  const sz = deco.size(id, o.s ?? 1); if (!sz) return null;
  const ry = o.ry ?? F.ry(face) + (o.turn || 0), c = Math.abs(Math.cos(ry)), n = Math.abs(Math.sin(ry));
  // footprint in local (lateral, depth) axes: yaw multiples of 90 deg swap w and d
  const lat = F.dirIn > 0 ? 1 : 1, hxl = (c * sz.w + n * sz.d) / 2, hzl = (c * sz.d + n * sz.w) / 2;
  if (!o.force && !o.ghost && !F.free(lx, ld, hxl, hzl, o.margin ?? 0.1)) return null;
  const rec = deco.put(id, F.wx(lx), F.wz(ld), ry, { s: o.s, lift: o.lift, solid: o.ghost ? false : o.solid, tag: o.tag });
  if (!o.ghost && !(o.lift > 0.3)) F.taken.push({ lx0: lx - hxl, lx1: lx + hxl, ld0: ld - hzl, ld1: ld + hzl });
  return rec;
}
// box in the room's local frame (lx lateral from centre, ld depth from the back wall); y absolute offset above the floor
function pbox(F, deco, lx0, ld0, lx1, ld1, y0, y1, color, o = {}) {
  const xa = F.wx(lx0), xb = F.wx(lx1), za = F.wz(ld0), zb = F.wz(ld1), fl = deco.fl;
  const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), z0 = Math.min(za, zb), z1 = Math.max(za, zb);
  fl.B.ext(o.key || 'decor', x0, F.y + y0, z0, x1, F.y + y1, z1, color, o.em || 1);
  if (o.solid !== false) fl.cc(x0, z0, x1, z1, F.y + y0, F.y + y1, 'furniture');
  if (o.claim !== false && o.solid !== false) F.taken.push({ lx0: Math.min(lx0, lx1), lx1: Math.max(lx0, lx1), ld0: Math.min(ld0, ld1), ld1: Math.max(ld0, ld1) });
}
// fitted kitchen along the back wall + island: cabinets, worktop, sink, hob with hood, fridge, upper cabinets
function kitchenFixtures(F, deco, L) {
  const x0 = -F.W / 2 + 0.05, x1 = F.W / 2 - 0.05, cab = 0xe6e2da, top = 0x2b2e36, dep = 0.62;
  const fr = 0.78; // fridge column on the left end
  // fridge at the right end, where life.js puts the openable fridge anchor
  pbox(F, deco, x1 - fr, 0.04, x1, dep + 0.08, 0, 1.85, 0xc9ced6);
  pbox(F, deco, x1 - fr + 0.04, 0.04 + dep + 0.08 - 0.03, x1 - fr + 0.1, dep + 0.08 + 0.01, 0.95, 1.5, 0x8a909a, { solid: false });   // fridge handle
  const c0 = x0, cEnd = x1 - fr, mid = (c0 + cEnd) / 2;
  pbox(F, deco, c0, 0.04, cEnd, dep, 0, 0.86, cab);                                  // base cabinets
  pbox(F, deco, c0, 0.0, cEnd, dep + 0.03, 0.86, 0.92, top, { claim: false });        // worktop
  // sink bay (left of centre): dark basin + tap
  pbox(F, deco, mid - 1.05, 0.12, mid - 0.3, dep - 0.1, 0.9, 0.93, 0x14161c, { solid: false, claim: false });
  pbox(F, deco, mid - 0.7, 0.05, mid - 0.64, 0.11, 0.92, 1.18, 0xb8bec8, { solid: false, claim: false });
  // hob (right of centre) with glowing rings and a hood above
  pbox(F, deco, mid + 0.25, 0.1, mid + 0.95, dep - 0.04, 0.925, 0.945, 0x15171c, { solid: false, claim: false });
  for (const [bx, bz] of [[0.42, 0.22], [0.78, 0.22], [0.42, 0.45], [0.78, 0.45]]) pbox(F, deco, mid + bx - 0.07, bz - 0.07, mid + bx + 0.07, bz + 0.07, 0.945, 0.955, new THREE_C(1, 0.35, 0.12), { key: 'emit', em: 1.6, solid: false, claim: false });
  pbox(F, deco, mid + 0.2, 0.05, mid + 1.0, 0.5, 1.75, 2.2, 0x9aa0aa, { solid: false, claim: false });
  // wall cabinets
  pbox(F, deco, c0, 0.04, mid - 1.1, 0.38, 1.5, 2.2, cab, { solid: false, claim: false });
  pbox(F, deco, mid + 1.05, 0.04, cEnd, 0.38, 1.5, 2.2, cab, { solid: false, claim: false });
  // island with stools' worth of space around it
  if (F.D > 5.2) { pbox(F, deco, -0.9, 2.5, 0.9, 3.25, 0, 0.88, 0x3a3f4a); pbox(F, deco, -0.95, 2.45, 0.95, 3.3, 0.88, 0.93, 0xd8d4cc, { claim: false }); }
}
const wallSide = (F, side) => (side === 'l' ? -F.W / 2 : F.W / 2);

// fill the long walls of a zone: tall storage on partition walls, only low pieces under the windows of exterior walls
function fillWalls(F, deco, L) {
  const ext = { l: F.x0 - L.rect.x0 < 1.2, r: L.rect.x1 - F.x1 < 1.2 };
  const TALL = ['wooden_bookshelf_worn', 'drawer_cabinet', 'painted_wooden_cabinet', 'vintage_cabinet_01', 'painted_wooden_shelves', 'steel_frame_shelves_02', 'wooden_display_shelves_01'];
  const LOW = ['side_table_01', 'planter_box_01', 'potted_plant_02', 'ClassicNightstand_01', 'planter_box_02', 'CoffeeTable_01', 'potted_plant_04'];
  let n = 0;
  for (const side of ['l', 'r']) for (let ld = 1.1; ld < F.D - 0.9; ld += 2.0, n++) {
    const r = ((F.rm.x0 * 7.13 + ld * 3.77 + (side === 'l' ? 1 : 5) + F.rm.z0) % 1 + 1) % 1; if (r < 0.28) continue;
    const pool = ext[side] ? LOW : TALL, id = pool[Math.floor(r * 97) % pool.length], sz = deco.size(id); if (!sz) continue;
    const off = sz.d / 2 + 0.06, lx = side === 'l' ? -F.W / 2 + off : F.W / 2 - off;
    put(F, deco, id, lx, ld, side === 'l' ? 'r' : 'l');
  }
}

export function decorateRoom(F, deco, kind, L) {
  decorateRoomCore(F, deco, kind, L);
  fillWalls(F, deco, L);
}

function decorateRoomCore(F, deco, kind, L) {
  const ceil = L.h - 0.35;
  const pend = (id, lx, ld) => put(F, deco, id, lx, ld, 'in', { ghost: true, lift: ceil - (deco.size(id)?.h || 0.9) - 0.02 });
  const art = (id, side, ld, lift = 1.35) => put(F, deco, id, wallSide(F, side) + (side === 'l' ? 0.04 : -0.04), ld, side === 'l' ? 'r' : 'l', { ghost: true, lift });
  const plant = (lx, ld) => put(F, deco, 'potted_plant_02', lx, ld, 'in', { turn: Math.random() * 6 });
  if (kind === 'living') {
    put(F, deco, 'sofa_03', 0, 0.58, 'in');
    put(F, deco, 'modern_coffee_table_01', 0, 2.0, 'in', { turn: PI / 2, margin: 0.02 });
    const stand = put(F, deco, 'CoffeeTable_01', 0, 3.2, 'back', { margin: 0.02 });
    if (stand) put(F, deco, 'Television_01', 0, 3.2, 'back', { ghost: true, lift: 0.52 });
    put(F, deco, 'modern_arm_chair_01', -Math.min(2.4, F.W / 2 - 0.9), 1.9, 'in', { turn: -0.6 });
    put(F, deco, 'wooden_bookshelf_worn', wallSide(F, 'r') - 0.35, 2.5, 'l');
    put(F, deco, 'side_table_01', Math.min(2.2, F.W / 2 - 0.6), 0.5, 'in');
    put(F, deco, 'vintage_lighter', 0.12, 1.7, 'in', { ghost: true, lift: 0.39, s: 1.4, turn: Math.random() * 6 });
    put(F, deco, 'wine_bottles_01', 0, 3.2, 'back', { ghost: true, lift: 0.52, s: 0.8 });
    put(F, deco, 'carved_wooden_elephant', Math.min(2.2, F.W / 2 - 0.6), 0.5, 'in', { ghost: true, lift: 0.551, s: 1.8 });
    put(F, deco, 'lion_head', 0, 0.12, 'in', { ghost: true, lift: 1.7, s: 1.2 });
    plant(-F.W / 2 + 0.55, 0.55); plant(F.W / 2 - 0.5, F.D - 0.9);
    art('hanging_picture_frame_01', 'l', 2.0); art('hanging_picture_frame_02', 'r', 1.4, 1.5);
    pend('modern_ceiling_lamp_01', 0, 2.0);
  } else if (kind === 'bedroom') {
    const bw = F.W > 6.5 ? 'GothicBed_01' : 'old_bed_frame', b = deco.size(bw);
    put(F, deco, bw, 0, b.d / 2 + 0.05, 'in', { margin: 0.02 });
    for (const s of [-1, 1]) { const r = put(F, deco, 'painted_wooden_nightstand', s * (b.w / 2 + 0.38), 0.4, 'in'); if (r && s > 0) put(F, deco, 'desk_lamp_arm_01', s * (b.w / 2 + 0.38), 0.4, 'in', { ghost: true, lift: 0.62, s: 0.8 }); }
    put(F, deco, 'vintage_lighter', -(deco.size(bw).w / 2 + 0.38), 0.3, 'in', { ghost: true, lift: 0.616, s: 1.4, turn: 1 });
    put(F, deco, 'vintage_cabinet_01', -F.W / 2 + 0.45, 0.5, 'r', { turn: 0 });
    put(F, deco, 'drawer_cabinet', wallSide(F, 'r') - 0.3, 2.4, 'l');
    put(F, deco, 'ornate_mirror_01', 0, 0, 'in', { ghost: true, lift: 1.0, ry: F.ry('l') + PI / 2 });
    put(F, deco, 'side_table_01', F.W / 2 - 0.6, F.D - 1.6, 'in');
    plant(F.W / 2 - 0.6, F.D - 0.9);
    art('hanging_picture_frame_01', 'r', 2.8);
    pend('modern_ceiling_lamp_01', 0, 2.4);
  } else if (kind === 'kitchen') {
    kitchenFixtures(F, deco, L);
    const t = put(F, deco, 'round_wooden_table_01', -Math.min(1.4, F.W / 2 - 1.5), 2.8, 'in', { margin: 0.02 });
    if (t) for (const a of [0, 2.1, 4.2]) put(F, deco, 'dining_chair_02', -Math.min(1.4, F.W / 2 - 1.5) + Math.sin(a) * 0.95, 2.8 + Math.cos(a) * 0.95, 'in', { ry: a + PI, margin: -0.15 });
    put(F, deco, 'vintage_microwave', -1.4, 0.45, 'in', { ghost: true, lift: 0.93, s: 0.55 });
    put(F, deco, 'vintage_electric_kettle', 0.5, 0.45, 'in', { ghost: true, lift: 0.93 });
    if (t) put(F, deco, 'croissant', -Math.min(1.4, F.W / 2 - 1.5) + 0.1, 2.8, 'in', { ghost: true, lift: 1.004, s: 1.2, turn: 0.6 });
    put(F, deco, 'long_life_food', 1.2, 0.35, 'back', { ghost: true, lift: 0.93, s: 0.9 });
    put(F, deco, 'wine_bottles_01', -F.W / 2 + 1.0, 0.3, 'back', { ghost: true, lift: 0.93, s: 0.7 });
    put(F, deco, 'croissant', -0.4, 0.4, 'in', { ghost: true, lift: 0.93, s: 1.2, turn: 2 });
    put(F, deco, 'worn_metal_rack', wallSide(F, 'l') + 0.35, 2.4, 'r');
    plant(F.W / 2 - 0.5, F.D - 0.9);
    art('wall_clock', 'r', 1.8, 1.9);
    pend('hanging_industrial_lamp', -Math.min(1.4, F.W / 2 - 1.5), 2.8);
  } else if (kind === 'office') {
    let n = 0;
    for (let a = -F.W / 2 + 1.35; a < F.W / 2 - 0.7; a += 2.2, n++) for (const d of [1.2, 3.3]) {
      if (d > F.D - 1.9) continue;
      const desk = put(F, deco, 'metal_office_desk', a, d, 'back', { s: 0.75, margin: 0.02 });
      if (!desk) continue;
      put(F, deco, 'television_02', a, d - 0.05, 'in', { ghost: true, lift: 0.6, s: 0.78 });
      put(F, deco, 'stationery_supplies', a + 0.5, d + 0.05, 'back', { ghost: true, lift: 0.6 }); put(F, deco, 'binder_notebook', a - 0.5, d + 0.15, 'back', { ghost: true, lift: 0.6, s: 0.7 }); put(F, deco, 'clipboard', a + 0.2, d + 0.25, 'back', { ghost: true, lift: 0.6 });
      // cubicle panel beside each desk
      pbox(F, deco, a + 0.78, d - 0.5, a + 0.82, d + 0.55, 0, 1.2, 0x6a7088, { claim: false });
      put(F, deco, n % 2 ? 'modern_arm_chair_01' : 'painted_wooden_chair_01', a, d + 0.95, 'back', { turn: (Math.random() - 0.5) * 0.9, s: n % 2 ? 0.8 : 1 });
    }
    put(F, deco, 'steel_frame_shelves_01', wallSide(F, 'r') - 0.3, F.D / 2, 'l');
    put(F, deco, 'metal_trash_can', -F.W / 2 + 0.4, F.D - 0.5, 'in', { s: 0.38 }); put(F, deco, 'office_notepads', 0, 0.6, 'in', { ghost: true, lift: 0.01 });
    put(F, deco, 'worn_metal_rack', wallSide(F, 'l') + 0.35, F.D - 1.6, 'r');
    plant(F.W / 2 - 0.5, 0.6);
    put(F, deco, 'fire_alarm', wallSide(F, 'r') - 0.03, F.D - 1.0, 'l', { ghost: true, lift: 1.5 });
    put(F, deco, 'security_camera_01', -F.W / 2 + 0.3, 0.3, 'in', { ghost: true, lift: ceil - 0.3, s: 0.7 });
    put(F, deco, 'mounted_fluorescent_lights', 0, 1.6, 'in', { ghost: true, lift: ceil - 0.05 });
    put(F, deco, 'mounted_fluorescent_lights', 0, 3.6, 'in', { ghost: true, lift: ceil - 0.05 });
  } else if (kind === 'meeting') {
    const t = put(F, deco, 'painted_wooden_table', 0, F.D / 2 + 0.3, 'in', { margin: 0.02 });
    if (t) for (const s of [-1, 1]) for (const dx of [-0.75, 0, 0.75]) put(F, deco, 'dining_chair_02', dx, F.D / 2 + 0.3 + s * 0.95, s > 0 ? 'back' : 'in', { margin: -0.1 });
    put(F, deco, 'projector_screen', 0, 0.7, 'in');
    put(F, deco, 'standing_chalkboard_01', F.W / 2 - 0.7, 1.0, 'in');
    plant(-F.W / 2 + 0.5, F.D - 0.9);
    put(F, deco, 'wall_clock', wallSide(F, 'l') + 0.04, F.D / 2, 'r', { ghost: true, lift: 2.1 });
    pend('modern_ceiling_lamp_01', 0, F.D / 2 + 0.3);
  } else if (kind === 'server') {
    put(F, deco, 'worn_metal_rack', wallSide(F, 'l') + 0.35, F.D / 2, 'r');
    // two rows of server racks facing a central aisle, status LEDs on the faces, cable trays along the ceiling
    if (F.W >= 5.4) {
      for (const sd of [-1, 1]) {
        const lx = sd * 1.15, n = Math.max(1, Math.floor((F.D - 3.0) / 0.75));
        for (let i = 0; i < n; i++) {
          const ld = 1.3 + i * 0.75, a0 = lx - 0.32, a1 = lx + 0.32;
          pbox(F, deco, a0, ld - 0.34, a1, ld + 0.34, 0, 2.05, 0x181b22);
          const fx = lx - sd * 0.33, hue = [[0.2, 1, 0.5], [0.3, 0.8, 1], [1, 0.7, 0.2]][(i + (sd > 0 ? 1 : 0)) % 3];
          for (let u = 0; u < 7; u++) pbox(F, deco, fx - sd * 0.015, ld - 0.26, fx + sd * 0.015, ld + 0.26, 0.3 + u * 0.24, 0.34 + u * 0.24, new THREE.Color(...hue).multiplyScalar(((i + u) % 3 === 0) ? 0.25 : 0.9), { key: 'emit', em: 1.2, solid: false, claim: false });
        }
        pbox(F, deco, lx - 0.25, 0.9, lx + 0.25, 1.3 + n * 0.75, ceil - 0.32, ceil - 0.27, 0x3b414d, { solid: false, claim: false });
      }
    }
    put(F, deco, 'metal_stool_01', 0, F.D - 1.2, 'in');
    put(F, deco, 'security_camera_01', F.W / 2 - 0.3, F.D - 0.3, 'in', { ghost: true, lift: ceil - 0.3, s: 0.7 });
    put(F, deco, 'mounted_fluorescent_lights', 0, F.D / 2, 'in', { ghost: true, lift: ceil - 0.05 });
  }
}

export { Frame, FloorDecor, furnitureReady };
