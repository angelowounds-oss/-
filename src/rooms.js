import { FloorDecor, furnitureReady } from './furnish.js';

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
const wallSide = (F, side) => (side === 'l' ? -F.W / 2 : F.W / 2);

export function decorateRoom(F, deco, kind, L) {
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
    plant(-F.W / 2 + 0.55, 0.55); plant(F.W / 2 - 0.5, F.D - 0.9);
    art('hanging_picture_frame_01', 'l', 2.0); art('hanging_picture_frame_02', 'r', 1.4, 1.5);
    pend('modern_ceiling_lamp_01', 0, 2.0);
  } else if (kind === 'bedroom') {
    const bw = F.W > 6.5 ? 'GothicBed_01' : 'old_bed_frame', b = deco.size(bw);
    put(F, deco, bw, 0, b.d / 2 + 0.05, 'in', { margin: 0.02 });
    for (const s of [-1, 1]) { const r = put(F, deco, 'painted_wooden_nightstand', s * (b.w / 2 + 0.38), 0.4, 'in'); if (r && s > 0) put(F, deco, 'desk_lamp_arm_01', s * (b.w / 2 + 0.38), 0.4, 'in', { ghost: true, lift: 0.62, s: 0.8 }); }
    put(F, deco, 'vintage_cabinet_01', -F.W / 2 + 0.45, 0.5, 'r', { turn: 0 });
    put(F, deco, 'drawer_cabinet', wallSide(F, 'r') - 0.3, 2.4, 'l');
    put(F, deco, 'ornate_mirror_01', 0, 0, 'in', { ghost: true, lift: 1.0, ry: F.ry('l') + PI / 2 });
    put(F, deco, 'side_table_01', F.W / 2 - 0.6, F.D - 1.6, 'in');
    plant(F.W / 2 - 0.6, F.D - 0.9);
    art('hanging_picture_frame_01', 'r', 2.8);
    pend('modern_ceiling_lamp_01', 0, 2.4);
  } else if (kind === 'kitchen') {
    const t = put(F, deco, 'round_wooden_table_01', -Math.min(1.4, F.W / 2 - 1.5), 2.8, 'in', { margin: 0.02 });
    if (t) for (const a of [0, 2.1, 4.2]) put(F, deco, 'dining_chair_02', -Math.min(1.4, F.W / 2 - 1.5) + Math.sin(a) * 0.95, 2.8 + Math.cos(a) * 0.95, 'in', { ry: a + PI, margin: -0.15 });
    put(F, deco, 'vintage_microwave', -1.4, 0.45, 'in', { ghost: true, lift: 0.93, s: 0.55 });
    put(F, deco, 'vintage_electric_kettle', 0.5, 0.45, 'in', { ghost: true, lift: 0.93 });
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
      put(F, deco, n % 2 ? 'modern_arm_chair_01' : 'painted_wooden_chair_01', a, d + 0.95, 'back', { turn: (Math.random() - 0.5) * 0.9, s: n % 2 ? 0.8 : 1 });
    }
    put(F, deco, 'steel_frame_shelves_01', wallSide(F, 'r') - 0.3, F.D / 2, 'l');
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
    put(F, deco, 'metal_stool_01', 0, F.D - 1.2, 'in');
    put(F, deco, 'security_camera_01', F.W / 2 - 0.3, F.D - 0.3, 'in', { ghost: true, lift: ceil - 0.3, s: 0.7 });
    put(F, deco, 'mounted_fluorescent_lights', 0, F.D / 2, 'in', { ghost: true, lift: ceil - 0.05 });
  }
}

export { Frame, FloorDecor, furnitureReady };
