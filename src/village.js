import * as THREE from 'three';
import { settlements } from './settlements.js';
import { net } from './roadnet.js';
import { Acc } from './citysites.js';
import { Human } from './human.js';
import { SHOPS } from './life.js';
import { nightU } from './shaders.js';
import { cities } from './worldmap.js';
import { rand } from './util.js';

// Villages (ADR-0013): thirty places over the countryside, each with its own name, houses you can walk into, a general store (or diner, pharmacy,
// hardware shop) with a shopkeeper and stock, sometimes a filling station, a chapel and a water tower, and people with a day of their own: they sleep in
// their beds, go to the plaza, the shop, the fields or the chapel, and come home in the evening (their position is a function of the clock; they are
// made only while the player is near, a sleeper only when he is in the house). The buildings can be blown up (a house sinks into rubble, the people
// in it die, the ruin is rebuilt after two days). The plan is settlements.js; the pad under it is carved by roadnet.js. All frames are local to the village.
const BUILD = 900, DROP = 1500, COLL = 220, PEOPLE = 140, T = 0.28, H = 3.0, WALK = 1.5;
const hash = (a, b = 0) => { let h = Math.imul(Math.floor(a * 1000) | 0, 0x9e3779b1) ^ Math.imul(Math.floor(b * 1000) | 0, 0x85ebca6b); h = Math.imul(h ^ (h >>> 15), 0xc2b2ae35); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };
const col = (hex, k = 1) => [((hex >> 16) & 255) / 255 * k, ((hex >> 8) & 255) / 255 * k, (hex & 255) / 255 * k];
const STOCK = { gas: [['jerrycan', 16], ['soda', 3], ['coffee', 4], ['energy', 5], ['sandwich', 6], ['bandage', 9]] };
const LOOKS = [{ top: 0x4a6a9a, pants: 0x23262e }, { top: 0x9a4a4a, pants: 0x2a2320 }, { top: 0x4a9a6a, pants: 0x20262a }, { top: 0x8a7a3a, pants: 0x262320 }, { top: 0x6a4a8a, pants: 0x1c1c24 }, { top: 0x7a7a7a, pants: 0x2c2c30 }];

export class Villages {
  constructor(G) {
    this.G = G; this.group = new THREE.Group(); this.group.name = 'villages'; G.scene.add(this.group);
    const S = settlements(), N = net();
    this.list = [...S.villages, ...S.farms].map((v) => ({ v, pad: N.pads.find((p) => p.id === v.id), built: false, houses: [], objs: [], res: new Map(), coll: false }));
    this.struct = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
    this.glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, side: THREE.DoubleSide });
    this.rubble = new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 1 });
    // two small meshes with the village materials, so the load-time compile covers their programs
    for (const m of [this.struct, this.glow, this.rubble]) { const w = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3)).setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3)).setAttribute('color', new THREE.BufferAttribute(new Float32Array(9).fill(1), 3)), m); w.frustumCulled = false; this.group.add(w); }
    this.P = G.state.places = G.state.places || { dead: {}, ruins: {} };
    G.interact.providers.push((pl, out) => this.provide(pl, out));
    this.active = null; this.hour = 12; this.stats = { built: 0, people: 0, boxes: 0 };
  }
  localHour() { const G = this.G, L = G.rules?.local; return (((G.clock.hour + (L?.hourOffset || 0)) % 24) + 24) % 24; }
  near(L, p, r) { return Math.hypot(p.x - L.v.x, p.z - L.v.z) < r; }

  update(dt, focus) {
    this.hour = this.localHour(); this.glow.color.setScalar(0.04 + 0.96 * Math.min(1, nightU.value)); let built = 0, people = 0, boxes = 0;
    for (const L of this.list) {
      const d = Math.hypot(focus.x - L.v.x, focus.z - L.v.z);
      if (d < BUILD && !L.built) this.build(L); else if (d > DROP && L.built) this.dispose(L);
      if (!L.built) continue; built++;
      if (d < L.v.r + COLL) { if (!L.coll) this.addColliders(L); this.shopDoor(L); this.rebuildCheck(L); } else if (L.coll) this.removeColliders(L);
      if (d < PEOPLE + L.v.r * 0.4) this.people(L, dt); else this.clearPeople(L);
      for (const r of L.res.values()) if (r.h) people++; boxes += L.coll ? L.cb.length : 0;
    }
    this.stats.built = built; this.stats.people = people; this.stats.boxes = boxes;
  }

  // ---------------------------------------------------------------- building the village
  build(L) {
    const { v, pad } = L, G = this.G; L.built = true; L.root = new THREE.Group(); L.root.position.set(v.x, pad.y, v.z); this.group.add(L.root);
    const S = new Acc(), E = new Acc();   // the street, the plaza and the lamps: one mesh each
    if (v.farm) { S.flat(-v.Lh - 14, -3, v.Lh + 14, 3, 0.07, [0.2, 0.17, 0.12]); for (let k = 0; k < 3; k++) S.box(30 + k * 0.1, 0, 14 - k * 0.1, 34, 14 + 2 * k, 18, [0.6, 0.62, 0.64], 0); S.prism(29.6, 13.6, 34.4, 18.4, 14, 3, 1, [0.35, 0.37, 0.4]); S.box(-8, 0, 10, 4, 3.6, 17, [0.55, 0.5, 0.2], 0); }
    else {
    S.flat(-v.Lh - 14, -4.6, v.Lh + 14, 4.6, 0.07, [0.07, 0.07, 0.08]); for (let x = -v.Lh; x < v.Lh; x += 9) S.flat(x, -0.12, x + 4, 0.12, 0.08, [0.55, 0.5, 0.2]);
    S.flat(-18, -30, 18, 30, 0.06, [0.17, 0.16, 0.14]); S.flat(-3.2, -3.2, 3.2, 3.2, 0.1, [0.28, 0.27, 0.25]);
    S.box(-0.5, 0.1, -0.5, 0.5, 1.2, 0.5, [0.3, 0.3, 0.32], 0); S.box(-1.2, 0.1, -1.2, 1.2, 0.6, 1.2, [0.22, 0.22, 0.24], 0);   // the well in the plaza
    for (let x = -v.Lh + 6; x < v.Lh; x += 26) for (const s of [-1, 1]) { S.box(x - 0.1, 0, s * 5.2 - 0.1, x + 0.1, 5.2, s * 5.2 + 0.1, [0.06, 0.06, 0.07], 0); E.box(x - 0.35, 5.2, s * 5.2 - 0.35, x + 0.35, 5.6, s * 5.2 + 0.35, [3, 2.2, 1.2], 0); }
    }
    // hedges along the street fronts with a gap at every door, a tree or two in each yard, benches and a notice board in the plaza
    let k = 0; if (!v.farm) {
    const doors = v.houses.map((h) => h.x);
    for (const s of [-1, 1]) { let a = -v.Lh; const gaps = doors.filter((x) => v.houses.some((h) => h.x === x && h.side === s)).sort((p, q) => p - q); for (const g of [...gaps, v.Lh + 14]) { if (g - 2 > a + 1) S.box(a, 0, s * 6.4 - 0.3, g - 2, 0.95, s * 6.4 + 0.3, [0.05, 0.16, 0.06], 0); a = g + 2; } }
    for (const h of v.houses) { const n = h.kind === 'house' ? 1 + Math.floor(hash(h.x, 5) * 2) : 0; for (let q = 0; q < n; q++) { const tx = h.x + (q ? 1 : -1) * (h.w / 2 + 3.2), tz = h.side * (h.side < 0 ? -h.r[3] : h.r[1]) , hh = 4.2 + hash(tx, k++) * 2.6; void tz; const z = h.side * (6.8 + hash(tx, 9) * 2.5); S.box(tx - 0.22, 0, z - 0.22, tx + 0.22, hh * 0.5, z + 0.22, [0.1, 0.07, 0.04], 0); S.box(tx - 1.8, hh * 0.4, z - 1.8, tx + 1.8, hh, z + 1.8, [0.05 + hash(tx, 2) * 0.05, 0.17 + hash(tx, 3) * 0.08, 0.05], 0); S.box(tx - 1.0, hh, z - 1.0, tx + 1.0, hh + 1.2, z + 1.0, [0.06, 0.2, 0.06], 0); } }
    for (const [bx, bz] of [[-9, 10], [9, -10], [-9, -10], [9, 10]]) { S.box(bx - 0.9, 0.45, bz - 0.25, bx + 0.9, 0.55, bz + 0.25, [0.3, 0.2, 0.1], 0); S.box(bx - 0.9, 0.1, bz - 0.2, bx - 0.8, 0.45, bz + 0.2, [0.2, 0.2, 0.22], 0); S.box(bx + 0.8, 0.1, bz - 0.2, bx + 0.9, 0.45, bz + 0.2, [0.2, 0.2, 0.22], 0); }
    S.box(-12.2, 0, -26.2, -11.8, 2.2, -25.8, [0.2, 0.15, 0.1], 0); S.box(-12.2, 2.2, -26.2, -9.8, 2.9, -25.8, [0.3, 0.22, 0.12], 0); S.box(-12.0, 0, -26.1, -11.9, 2.2, -25.9, [0.2, 0.15, 0.1], 0);
    }
    for (const [A, mat] of [[S, this.struct], [E, this.glow]]) { const m = A.mesh(mat); m.frustumCulled = true; L.root.add(m); L.objs.push(m); }
    L.houses = v.houses.map((h, i) => this.house(L, h, i));
    if (v.tower) this.waterTower(L); if (v.gas) this.canopy(L);
    L.signs = []; for (const H2 of L.houses) if (H2.h.name) this.sign(L, H2);
    // the shopkeeper's counter and the verbs of the shop
    for (const H2 of L.houses) if (H2.h.kind === 'shop' || H2.h.kind === 'gas') this.counter(L, H2);
    this.stats.built++; void G;
  }
  dispose(L) {
    this.removeColliders(L); this.clearPeople(L);
    for (const o of L.objs) { o.parent?.remove(o); o.geometry?.dispose?.(); o.material?.map?.dispose?.(); }
    for (const H2 of L.houses) { H2.group.parent?.remove(H2.group); H2.group.traverse((o) => { o.geometry?.dispose?.(); }); }
    for (const o of L.ints || []) this.G.interact.remove(o);
    L.root.parent?.remove(L.root); L.built = false; L.objs = []; L.houses = []; L.ints = []; L.res.clear();
  }

  // one building: four walls with a door in the one facing the street, a floor, a ceiling, a roof, windows that glow at night, a lamp and furniture
  house(L, h, idx) {
    const { v } = L, S = new Acc(), E = new Acc(), [x0, z0, x1, z1] = h.r, side = h.side, church = h.kind === 'church', barn = h.kind === 'barn', Hh = church ? 5.2 : barn ? 4.8 : H, wc = col(h.color), dx = h.x, dw = barn ? 1.6 : 0.9;
    const wall = (a, b, c, d, y0 = 0, y1 = Hh) => S.box(a, y0, b, c, y1, d, wc, 0), cols = [];
    const addC = (a, b, c, d, y0 = 0, y1 = Hh) => cols.push([a, b, c, d, y0, y1]);
    const dz0 = side < 0 ? z1 - T : z0, dz1 = side < 0 ? z1 : z0 + T, d0 = dx - dw, d1 = dx + dw;
    wall(x0, side < 0 ? z0 : z1 - T, x1, side < 0 ? z0 + T : z1); addC(x0, side < 0 ? z0 : z1 - T, x1, side < 0 ? z0 + T : z1);   // back wall
    wall(x0, z0, x0 + T, z1); addC(x0, z0, x0 + T, z1); wall(x1 - T, z0, x1, z1); addC(x1 - T, z0, x1, z1);   // side walls
    wall(x0 + T, dz0, d0, dz1); addC(x0 + T, dz0, d0, dz1); wall(d1, dz0, x1 - T, dz1); addC(d1, dz0, x1 - T, dz1);   // the street wall, either side of the door
    wall(d0, dz0, d1, dz1, 2.4, Hh); addC(d0, dz0, d1, dz1, 2.4, Hh);   // the lintel
    S.flat(x0, z0, x1, z1, 0.07, church ? [0.2, 0.19, 0.18] : [0.22, 0.15, 0.09]);
    S.quad([x0, Hh, z0], [x1, Hh, z0], [x1, Hh, z1], [x0, Hh, z1], 0, -1, 0, [0.62, 0.6, 0.54], 0);   // the ceiling, seen from below
    const rc = col(h.roof), w = x1 - x0, d = z1 - z0;
    if (church) { S.prism(x0 - 0.6, z0 - 0.6, x1 + 0.6, z1 + 0.6, Hh, 4.2, 0, rc); const sx = dx, sz = side < 0 ? z0 + 3 : z1 - 3; S.box(sx - 1.6, Hh, sz - 1.6, sx + 1.6, Hh + 7.5, sz + 1.6, wc, 0); S.prism(sx - 1.9, sz - 1.9, sx + 1.9, sz + 1.9, Hh + 7.5, 4, 1, rc); E.box(sx - 0.1, Hh + 11.5, sz - 0.1, sx + 0.1, Hh + 13, sz + 0.1, [2.5, 2.2, 1.6], 0); E.box(sx - 0.6, Hh + 12.2, sz - 0.1, sx + 0.6, Hh + 12.4, sz + 0.1, [2.5, 2.2, 1.6], 0);
      for (let r = 0; r < 4; r++) for (const s2 of [-1, 1]) S.box(dx + s2 * 1.6 - 0.9, 0.07, (z0 + z1) / 2 + (r - 1) * 2.4 - 0.4, dx + s2 * 1.6 + 0.9, 0.9, (z0 + z1) / 2 + (r - 1) * 2.4 + 0.4, [0.22, 0.14, 0.08], 0); }
    else if (v.pitched || h.kind === 'gas' || barn) S.prism(x0 - 0.5, z0 - 0.5, x1 + 0.5, z1 + 0.5, Hh, Math.min(w, d) * 0.32, w >= d ? 1 : 0, rc);
    else S.box(x0 - 0.4, Hh, z0 - 0.4, x1 + 0.4, Hh + 0.3, z1 + 0.4, rc, 0);
    // windows: panes on the outside of the side and back walls, glowing at night; the door gets a dark panel frame above
    const gl = [1.5, 1.05, 0.5];
    for (const wx of [x0 + w * 0.28, x1 - w * 0.28]) { const zb = side < 0 ? z0 - 0.02 : z1 + 0.02; E.quad([wx - 0.6, 1.0, zb], [wx + 0.6, 1.0, zb], [wx + 0.6, 2.1, zb], [wx - 0.6, 2.1, zb], 0, 0, side < 0 ? -1 : 1, gl, 0); }
    for (const sx of [x0 - 0.02, x1 + 0.02]) E.quad([sx, 1.0, (z0 + z1) / 2 - 0.6], [sx, 1.0, (z0 + z1) / 2 + 0.6], [sx, 2.1, (z0 + z1) / 2 + 0.6], [sx, 2.1, (z0 + z1) / 2 - 0.6], sx < x0 + 1 ? -1 : 1, 0, 0, gl, 0);
    for (const wx of [x0 + w * 0.28, x1 - w * 0.28]) if (Math.abs(wx - dx) > 1.6) { const zs = side < 0 ? z1 + 0.02 : z0 - 0.02; E.quad([wx - 0.6, 1.0, zs], [wx + 0.6, 1.0, zs], [wx + 0.6, 2.1, zs], [wx - 0.6, 2.1, zs], 0, 0, side < 0 ? 1 : -1, gl, 0); }
    // trim: window frames with a cross bar and a sill, a stone plinth, door jambs with a step and a little porch roof, a chimney
    const fc = [0.82, 0.8, 0.74], frameZ = (c, u, hw, y0, y1, out) => { const o = out * 0.04; S.box(u - hw - 0.07, y0 - 0.06, c + o - 0.04, u + hw + 0.07, y0, c + o + 0.12 * Math.abs(out) + 0.04, fc, 0); S.box(u - hw - 0.07, y0, c + o - 0.03, u - hw, y1, c + o + 0.05, fc, 0); S.box(u + hw, y0, c + o - 0.03, u + hw + 0.07, y1, c + o + 0.05, fc, 0); S.box(u - hw, y1, c + o - 0.03, u + hw, y1 + 0.07, c + o + 0.05, fc, 0); S.box(u - 0.03, y0, c + o - 0.03, u + 0.03, y1, c + o + 0.05, fc, 0); },
      frameX = (c, u, hw, y0, y1, out) => { const o = out * 0.04; S.box(c + o - 0.03, y0, u - hw - 0.07, c + o + 0.05, y1, u - hw, fc, 0); S.box(c + o - 0.03, y0, u + hw, c + o + 0.05, y1, u + hw + 0.07, fc, 0); S.box(c + o - 0.03, y1, u - hw, c + o + 0.05, y1 + 0.07, u + hw, fc, 0); S.box(c + o - 0.03, y0 - 0.06, u - hw - 0.07, c + o + 0.1, y0, u + hw + 0.07, fc, 0); };
    { const zb = side < 0 ? z0 : z1, zs = side < 0 ? z1 : z0; for (const wx of [x0 + w * 0.28, x1 - w * 0.28]) { frameZ(zb, wx, 0.6, 1.0, 2.1, side < 0 ? -1 : 1); if (Math.abs(wx - dx) > 1.9) frameZ(zs, wx, 0.6, 1.0, 2.1, side < 0 ? 1 : -1); } for (const sx of [x0, x1]) frameX(sx, (z0 + z1) / 2, 0.6, 1.0, 2.1, sx === x0 ? -1 : 1); }
    for (const [a, b, c2, d2] of [[x0 - 0.06, z0 - 0.06, x1 + 0.06, z0 + 0.1], [x0 - 0.06, z1 - 0.1, x1 + 0.06, z1 + 0.06], [x0 - 0.06, z0, x0 + 0.1, z1], [x1 - 0.1, z0, x1 + 0.06, z1]]) S.box(a, 0, b, c2, 0.42, d2, [0.3, 0.29, 0.28], 0);
    { const zf = side < 0 ? z1 : z0, o = side < 0 ? 1 : -1; S.box(d0 - 0.12, 0, Math.min(zf, zf + o * 0.12) - 0.02, d0, 2.4, Math.max(zf, zf + o * 0.12) + 0.02, [0.4, 0.28, 0.18], 0); S.box(d1, 0, Math.min(zf, zf + o * 0.12) - 0.02, d1 + 0.12, 2.4, Math.max(zf, zf + o * 0.12) + 0.02, [0.4, 0.28, 0.18], 0);
      if (h.kind === 'house' || h.kind === 'shop') { const za = zf + o * 0.1, zb2 = zf + o * 1.5; S.box(d0 - 0.4, 0, Math.min(za, zb2), d1 + 0.4, 0.14, Math.max(za, zb2), [0.36, 0.35, 0.34], 0); const zc2 = zf + o * 1.45; for (const px of [d0 - 0.3, d1 + 0.3]) S.box(px - 0.06, 0, zc2 - 0.06, px + 0.06, 2.6, zc2 + 0.06, fc, 0); S.box(d0 - 0.55, 2.6, Math.min(zf + o * 0.05, zf + o * 1.7), d1 + 0.55, 2.74, Math.max(zf + o * 0.05, zf + o * 1.7), rc, 0); } }
    if ((v.pitched || h.kind === 'shop') && h.kind !== 'gas' && !church && !barn) { const cx = x1 - 1.4, cz = (z0 + z1) / 2 + (w >= d ? 0 : 0); S.box(cx - 0.4, Hh + 0.2, cz - 0.4, cx + 0.4, Hh + Math.min(w, d) * 0.3 + 1.1, cz + 0.4, [0.35, 0.2, 0.15], 0); S.box(cx - 0.5, Hh + Math.min(w, d) * 0.3 + 1.1, cz - 0.5, cx + 0.5, Hh + Math.min(w, d) * 0.3 + 1.3, cz + 0.5, [0.2, 0.2, 0.21], 0); }
    E.quad([dx - 0.4, Hh - 0.04, (z0 + z1) / 2 - 0.4], [dx + 0.4, Hh - 0.04, (z0 + z1) / 2 - 0.4], [dx + 0.4, Hh - 0.04, (z0 + z1) / 2 + 0.4], [dx - 0.4, Hh - 0.04, (z0 + z1) / 2 + 0.4], 0, -1, 0, [2.2, 1.7, 1.0], 0);   // the lamp
    if (barn) for (let k = 0; k < 7; k++) { const bx = x0 + T + 1.5 + (k % 4) * 2.6, bz = (side < 0 ? z0 + T + 1 : z1 - T - 1) + (k >> 2) * (side < 0 ? 1.6 : -1.6); S.box(bx - 0.9, 0.07, bz - 0.5, bx + 0.9, 0.9, bz + 0.5, [0.55, 0.45, 0.15], 0); }
    // furniture
    const back = side < 0 ? z0 + T : z1 - T, sg = side < 0 ? 1 : -1;
    if (h.kind === 'house') {
      const bx = x0 + T + 1.2, bz = back + sg * 1.1; h.bed = { x: bx + 0.2, z: bz + sg * 0.1, ry: 0 };
      S.box(bx - 0.9, 0.07, bz - 0.9 * sg - (sg > 0 ? 0 : 1.2), bx + 0.9, 0.55, bz + 0.9 * sg + (sg > 0 ? 1.2 : 0), [0.28, 0.2, 0.14], 0); S.box(bx - 0.9, 0.55, bz - 0.4, bx + 0.9, 0.7, bz + 0.4, [0.55, 0.15, 0.15], 0);
      const tx = x1 - T - 1.6, tz = (z0 + z1) / 2; S.box(tx - 0.6, 0.7, tz - 0.4, tx + 0.6, 0.78, tz + 0.4, [0.3, 0.2, 0.1], 0); for (const a of [-1, 1]) for (const b of [-1, 1]) S.box(tx + a * 0.5 - 0.04, 0.07, tz + b * 0.3 - 0.04, tx + a * 0.5 + 0.04, 0.7, tz + b * 0.3 + 0.04, [0.25, 0.17, 0.09], 0);
      S.box(x1 - T - 0.6, 0.07, back + sg * 0.4 - 0.3, x1 - T - 0.05, 1.9, back + sg * 0.4 + 0.9, [0.26, 0.19, 0.12], 0);
    }
    const group = new THREE.Group(); group.name = 'house:' + h.kind;
    for (const [A, mat] of [[S, this.struct], [E, this.glow]]) { const m = A.mesh(mat); m.frustumCulled = true; group.add(m); }
    L.root.add(group);
    const key = L.v.id + ':' + idx, ruin = this.P.ruins[key], st = { h, idx, key, group, cols, hp: church ? 260 : 160, max: church ? 260 : 160, alive: true, cb: [], rect: [x0, z0, x1, z1] };
    if (ruin != null && this.G.clock.t - ruin < 2880) this.ruinLook(st, true);
    else delete this.P.ruins[key];
    return st;
  }
  waterTower(L) {
    const { v } = L, S = new Acc(), x = -26, z = -34; for (const a of [-1, 1]) for (const b of [-1, 1]) S.box(x + a * 2.4 - 0.18, 0, z + b * 2.4 - 0.18, x + a * 2.4 + 0.18, 9, z + b * 2.4 + 0.18, [0.3, 0.31, 0.34], 0);
    S.box(x - 3.2, 9, z - 3.2, x + 3.2, 13, z + 3.2, [0.3, 0.2, 0.14], 0); S.prism(x - 3.4, z - 3.4, x + 3.4, z + 3.4, 13, 2.2, 1, [0.2, 0.2, 0.22]);
    const m = S.mesh(this.struct); L.root.add(m); L.objs.push(m); void v;
  }
  canopy(L) {
    const S = new Acc(), E = new Acc(), x = -48, z = 22; for (const a of [-1, 1]) for (const b of [-1, 1]) S.box(x + a * 7 - 0.2, 0, z + b * 4 - 0.2, x + a * 7 + 0.2, 4.8, z + b * 4 + 0.2, [0.7, 0.7, 0.72], 0);
    S.box(x - 8.5, 4.8, z - 5.5, x + 8.5, 5.5, z + 5.5, [0.75, 0.2, 0.15], 0); E.quad([x - 8.5, 4.78, z - 5.5], [x + 8.5, 4.78, z - 5.5], [x + 8.5, 4.78, z + 5.5], [x - 8.5, 4.78, z + 5.5], 0, -1, 0, [1.6, 1.5, 1.3], 0);
    for (const a of [-3, 3]) { S.box(x + a - 0.4, 0, z - 0.4, x + a + 0.4, 1.5, z + 0.4, [0.8, 0.8, 0.82], 0); E.box(x + a - 0.3, 1.1, z - 0.42, x + a + 0.3, 1.4, z - 0.4, [1.2, 2.2, 1.2], 0); }
    for (const [A, mat] of [[S, this.struct], [E, this.glow]]) { const m = A.mesh(mat); L.root.add(m); L.objs.push(m); }
  }
  // the name board of a shop or chapel: a small canvas on a plane above the door
  sign(L, H2) {
    const { h } = H2, cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const g = cv.getContext('2d');
    g.fillStyle = '#10141c'; g.fillRect(0, 0, 256, 64); g.strokeStyle = '#ffb347'; g.lineWidth = 4; g.strokeRect(3, 3, 250, 58); g.fillStyle = '#ffd27a'; g.font = '700 26px "Space Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(h.name.toUpperCase(), 128, 34, 236);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.05), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide })); const zf = h.side < 0 ? h.r[3] + 0.06 : h.r[1] - 0.06;
    m.position.set(h.x, 3.45, zf); if (h.side > 0) m.rotation.y = Math.PI; L.root.add(m); L.objs.push(m);
  }
  counter(L, H2) {
    const { h } = H2, { v, pad } = L, G = this.G, sg = h.side < 0 ? 1 : -1, back = h.side < 0 ? h.r[1] + T : h.r[3] - T, S = new Acc();
    const cx = h.x, cz = back + sg * (h.kind === 'gas' ? 1.8 : 2.6);   // the counter stands in front of the back wall, the keeper behind it
    S.box(cx - 2.2, 0.07, cz - 0.4, cx + 2.2, 1.05, cz + 0.4, [0.3, 0.2, 0.12], 0);
    for (let k = 0; k < 4; k++) { const sx = h.r[0] + T + 0.5 + k * 1.8; if (sx + 0.4 > h.r[2] - T - 0.3) break; S.box(sx - 0.4, 0.07, h.r[1] + T + 0.1, sx + 0.4, 1.9, h.r[1] + T + 0.6, [0.35, 0.3, 0.25], 0); for (let r = 0; r < 4; r++) S.box(sx - 0.38, 0.3 + r * 0.45, h.r[1] + T + 0.15, sx + 0.38, 0.5 + r * 0.45, h.r[1] + T + 0.55, [0.2 + hash(k, r) * 0.7, 0.2 + hash(r, k + 3) * 0.6, 0.15 + hash(k + r) * 0.5], 0); }
    const m = S.mesh(this.struct); m.frustumCulled = true; H2.group.add(m);
    H2.counter = { x: v.x + cx, z: v.z + cz + sg * 0.9, y: pad.y, lx: cx, lz: cz };
    const def = h.kind === 'gas' ? { name: '주유소 매점', stock: STOCK.gas } : SHOPS[h.stock] || SHOPS.convenience, name = `${v.name} ${h.kind === 'gas' ? '주유소' : def.name}`;
    const o = { x: H2.counter.x, z: H2.counter.z - sg * 1.0, cy: pad.y + 1, r: 3.2, name, verbs: [
      { key: 'F', label: () => (this.open(L, H2) ? '인사' : '문 닫은 가게'), run: () => this.talkShop(L, H2, def, name) },
      { key: 'G', label: () => '상점 이용', enabled: () => this.open(L, H2) && !(def.clothes), run: () => G.panels.show('shop', { name, stock: def.stock.map(([id, p]) => [id, Math.round(p * 1.35)]), mult: 1 }) },
      { key: 'T', label: () => '물건 팔기', enabled: () => this.open(L, H2) && !!(def.buys || def.stock.length), run: () => G.panels.show('sell', { name, rate: def.buys || 0.35 }) },
    ] };
    (L.ints || (L.ints = [])).push(G.interact.add(o));
  }
  open(L, H2) { return H2.alive && this.hour >= 7 && this.hour < 21; }
  talkShop(L, H2, def, name) {
    const G = this.G, { v } = L, o = this.nearestCity(v), opts = [
      { text: '길을 묻는다', fn: () => { G.setWaypoint?.(o.c.x, o.c.z); G.toast(o.c.name, `${(o.d / 1000).toFixed(0)} km · ${this.dir(v, o.c)} · 지도에 표시했다`); } },
      { text: '소문을 듣는다', fn: () => G.toast(v.name, this.rumor()) },
      { text: '배달 일을 받는다', fn: () => this.deliveryJob(L, false) },
      { text: '"조용한" 운송을 맡는다', fn: () => this.deliveryJob(L, true) },
    ];
    if (!this.open(L, H2)) return G.toast(name, '가게 문이 닫혀 있다 (7시~21시)');
    G.panels.show('talk', { name, text: `${v.name}에 어서 오세요. 필요한 게 있으신가요?`, options: opts });
  }
  nearestCity(v) { let b = null; for (const c of cities()) { const d = Math.hypot(c.x - v.x, c.z - v.z); if (!b || d < b.d) b = { c, d }; } return b; }
  dir(a, b) { const ang = Math.atan2(b.x - a.x, -(b.z - a.z)) * 180 / Math.PI, n = ['북', '북동', '동', '남동', '남', '남서', '서', '북서']; return n[Math.round(((ang + 360) % 360) / 45) % 8] + '쪽'; }
  rumor() { const G = this.G, e = G.memory?.events?.slice?.(-1)?.[0]; return e?.text || ['북쪽 산에서 이상한 불빛을 봤대요.', '고속도로 휴게소가 요즘 장사가 잘 된대요.', '항구 쪽은 밤마다 시끄럽다더군요.', '도시로 가는 길엔 검문이 늘었어요.'][Math.floor(Math.random() * 4)]; }
  deliveryJob(L, smuggle) {
    const G = this.G, { v } = L, others = this.list.filter((q) => q !== L && q.v.houses.some((h) => h.kind === 'shop'));
    others.sort((a, b) => Math.hypot(a.v.x - v.x, a.v.z - v.z) - Math.hypot(b.v.x - v.x, b.v.z - v.z)); const to = others[1 + Math.floor(Math.random() * Math.min(3, others.length - 1))] || others[0]; if (!to) return;
    const shop = to.v.houses.find((h) => h.kind === 'shop'), ex = to.v.x + shop.door.x, ez = to.v.z + shop.door.z * 1.0, d = Math.hypot(ex - v.x, ez - v.z);
    if (!G.jobs.begin({ type: 'courier', title: smuggle ? '조용한 운송' : '마을 배달', text: `${to.v.name} 가게까지 상자를 (${(d / 1000).toFixed(1)} km)${smuggle ? ' · 경찰이 싫어하는 물건' : ''}`, e: { x: ex, z: ez, name: `${to.v.name} 가게` }, t: 900 + d / 10, reward: Math.floor((smuggle ? 2.2 : 1) * (200 + d * 0.05)) })) return;
    G.items.add('parcel'); G.wmap?.setWaypoint?.(ex, ez, `${to.v.name} 가게`); G.setBeacon(ex, ez, smuggle ? 0xff5a5a : 0x47ffa8); if (smuggle) G.addHeat(30);
  }

  // ---------------------------------------------------------------- colliders, shop doors, ruins
  addColliders(L) {
    const col = this.G.world.colliders, { v, pad } = L; L.coll = true; L.cb = [];
    for (const H2 of L.houses) { H2.cb = []; if (!H2.alive) continue; for (const [a, b, c, d, y0, y1] of H2.cols) { const bx = col.addBox(v.x + a, v.z + b, v.x + c, v.z + d, pad.y + y1, 'building', pad.y + y0); H2.cb.push(bx); L.cb.push(bx); } }
  }
  removeColliders(L) { const col = this.G.world.colliders; for (const b of L.cb || []) col.removeBox(b); L.cb = []; L.coll = false; for (const H2 of L.houses) { H2.cb = []; H2.door = null; } }
  shopDoor(L) {   // a closed shop has a barred door
    const col = this.G.world.colliders;
    for (const H2 of L.houses) if (H2.h.kind === 'shop' || H2.h.kind === 'gas') {
      const want = !this.open(L, H2) && H2.alive;
      if (want && !H2.door) { const h = H2.h, z = h.side < 0 ? h.r[3] : h.r[1]; H2.door = col.addBox(L.v.x + h.x - 0.9, L.v.z + Math.min(z, z + (h.side < 0 ? -T : T)), L.v.x + h.x + 0.9, L.v.z + Math.max(z, z + (h.side < 0 ? -T : T)), L.pad.y + 2.4, 'building', L.pad.y); L.cb.push(H2.door); }
      else if (!want && H2.door) { col.removeBox(H2.door); L.cb = L.cb.filter((b) => b !== H2.door); H2.door = null; }
    }
  }
  rebuildCheck(L) { const t = this.G.clock.t; for (const H2 of L.houses) if (!H2.alive && this.P.ruins[H2.key] != null && t - this.P.ruins[H2.key] > 2880) { delete this.P.ruins[H2.key]; this.ruinLook(H2, false); if (L.coll) { this.removeColliders(L); this.addColliders(L); } } }
  ruinLook(st, ruined) {
    st.alive = !ruined; st.group.scale.set(1, ruined ? 0.22 : 1, 1); st.group.traverse((o) => { if (o.isMesh && o.userData.keep === undefined) { o.userData.keep = o.material; } if (o.isMesh) o.material = ruined ? this.rubble : o.userData.keep; });
    if (!ruined) st.hp = st.max;
  }

  // explosions: houses within reach take damage; at zero the house sinks into rubble, the people inside die, the colliders go
  blast(x, y, z, radius, dmg, src) {
    const G = this.G;
    for (const L of this.list) {
      if (!L.built || Math.hypot(x - L.v.x, z - L.v.z) > L.v.r + radius) continue;
      for (const H2 of L.houses) {
        if (!H2.alive) continue; const cx = L.v.x + H2.h.x, cz = L.v.z + H2.h.z, d = Math.hypot(x - cx, z - cz) - Math.max(H2.h.w, H2.h.d) / 2; if (d > radius) continue;
        H2.hp -= dmg * (1 - Math.max(0, d) / radius) * 1.3; if (H2.hp > 0) continue;
        this.ruinLook(H2, true); this.P.ruins[H2.key] = G.clock.t;
        if (L.coll) { for (const b of H2.cb || []) { G.world.colliders.removeBox(b); L.cb = L.cb.filter((q) => q !== b); } H2.cb = []; }
        for (const r of L.res.values()) if (r.h && !r.h.dead && Math.hypot(r.h.x - cx, r.h.z - cz) < Math.max(H2.h.w, H2.h.d) / 2 + 1) r.h.hurt(999, src, false, src);
        for (let k = 0; k < 24; k++) G.smokeP.emit(cx + rand(-3, 3), L.pad.y + rand(0, 3), cz + rand(-3, 3), rand(-2, 2), rand(1, 5), rand(-2, 2), rand(3, 6), rand(3, 6), 0.1, 0.09, 0.08, 0.9, 0.2, 0.4);
        G.memory?.log('collapse', cx, cz, { city: L.v.name, text: `${L.v.name} ${H2.h.kind === 'church' ? '교회' : '건물'} 붕괴` }); G.addHeat?.(10); G.audio.explosion?.(1.4, 0);
      }
    }
  }

  // ---------------------------------------------------------------- the people
  // a resident's route in village coordinates: the bed, the inside of the door, the doorstep, the yard, the street, then the work place
  route(L, r) {
    const { v } = L, h = v.houses[r.home], sg = h.side, zWall = sg < 0 ? h.r[3] : h.r[1], pts = [];
    const bed = h.bed || { x: h.x, z: h.z }; pts.push([bed.x, bed.z], [h.x, zWall - sg * 1.4], [h.x, zWall + sg * 0.3], [h.x, sg * 5.4]); const home = pts.length;
    pts.push([h.x, 0]);
    const w = r.work;
    if (w === 'plaza') { const px = (hash(r.seed, 1) - 0.5) * 22, pz = (hash(r.seed, 2) < 0.5 ? -1 : 1) * (7 + hash(r.seed, 3) * 14); pts.push([px, 0], [px, pz]); }
    else if (w === 'shop') { const s = v.houses.find((q) => q.kind === 'shop'), sz = s.side < 0 ? s.r[3] : s.r[1]; pts.push([s.x, 0], [s.x, s.side * 5.4], [s.x, sz + s.side * 0.3], [s.x - 2.5 + hash(r.seed, 4) * 2, sz - s.side * 2.4]); }
    else if (w === 'church') { const c = v.houses.find((q) => q.kind === 'church'), cz = c.side < 0 ? c.r[3] : c.r[1]; pts.push([c.x, 0], [c.x, c.side * 5.4], [c.x, cz + c.side * 0.3], [c.x, cz - c.side * 3.2]); }
    else { const sx = (hash(r.seed, 5) < 0.5 ? -1 : 1) * (v.Lh + 42 + hash(r.seed, 6) * 20); pts.push([sx, 0], [sx, (hash(r.seed, 7) - 0.5) * 50]); }
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return { pts, cum, len: cum[cum.length - 1], dDoor: cum[home - 1] };
  }
  at(rt, d) { const { pts, cum } = rt; d = Math.max(0, Math.min(rt.len, d)); let i = 1; while (i < cum.length - 1 && cum[i] < d) i++; const t = (d - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]; }
  // distance along the route at a time of day: asleep at 0, to work, at work, back to the doorstep, evening, to bed
  dist(r, rt, hour) {
    const a = 6 + hash(r.seed, 8) * 1.5, tw = rt.len / WALK / 3600, b = a + tw, c = 16 + hash(r.seed, 9) * 2, dBack = (rt.len - rt.dDoor) / WALK / 3600, e = c + dBack, f = 21.2 + hash(r.seed, 10) * 0.6, g = f + rt.dDoor / WALK / 3600;
    if (hour < a || hour >= g) return 0;
    if (hour < b) return (hour - a) / tw * rt.len; if (hour < c) return rt.len;
    if (hour < e) return rt.len - (hour - c) / dBack * (rt.len - rt.dDoor); if (hour < f) return rt.dDoor;
    return rt.dDoor * (1 - (hour - f) / (g - f));
  }
  people(L, dt) {
    const G = this.G, pl = G.player, now = G.clock.t;
    if (!L.rt) { L.rt = new Map(); for (const r of L.v.residents) L.rt.set(r.id, this.route(L, r)); L.look = new Map(); }
    for (const r of L.v.residents) {
      let s = L.res.get(r.id); if (!s) L.res.set(r.id, (s = { r, h: null }));
      const dead = this.P.dead[r.id]; if (dead != null && now - dead < 4320) { if (s.h) { s.h.remove = true; s.h = null; } continue; }
      const rt = L.rt.get(r.id), d = this.dist(r, rt, this.hour), home = L.v.houses[r.home], hx = L.v.x + home.x, hz = L.v.z + home.z;
      const asleep = d <= 0.01, inside = Math.hypot(pl.x - hx, pl.z - hz) < 22;
      const want = asleep ? inside && home.bed : true;
      if (s.h && (s.h.dead || s.h.remove)) { if (s.h.dead && this.P.dead[r.id] == null) this.P.dead[r.id] = now; s.h = null; continue; }
      if (!want) { if (s.h) { s.h.remove = true; s.h = null; } continue; }
      if (!s.h) s.h = this.spawn(L, r, asleep, rt);
      const h = s.h; if (!h) continue;
      if (asleep) { if (!h.sleeping && !h.threat) { h.sleeping = true; h.lying = true; h.static = true; h.x = L.v.x + home.bed.x; h.z = L.v.z + home.bed.z; h.y = h.floorY = L.pad.y + 0.62; h.ry = home.side < 0 ? 0 : Math.PI; } continue; }
      if (h.sleeping) continue;   // woken (talk): it runs its own way for a while
      h.static = false; h.lying = false; h.target = this.at(rt, d);
    }
    void dt;
  }
  spawn(L, r, asleep, rt) {
    const G = this.G, look = { ...LOOKS[Math.floor(hash(r.seed, 11) * LOOKS.length)], hair: 0x1a1410 }, h = new Human(G, 'civ', { hp: 40, look });
    const [lx, lz] = asleep ? [L.v.houses[r.home].bed?.x ?? 0, L.v.houses[r.home].bed?.z ?? 0] : this.at(rt, this.dist(r, rt, this.hour));
    h.x = L.v.x + lx; h.z = L.v.z + lz; h.y = h.floorY = L.pad.y + (asleep ? 0.62 : 0.02); h.ry = hash(r.seed, 12) * 6.28; h.cash = 20 + Math.floor(hash(r.seed, 13) * 60); h.noVisit = true; h.villager = r; h.state = 'walk'; h.lookAtPlayer = false; h.home = { x: h.x, z: h.z };
    h.target = [lx, lz];
    h.steerFn = (hh) => { if (hh.sleeping || !hh.target) return null; const tx = L.v.x + hh.target[0], tz = L.v.z + hh.target[1], dx = tx - hh.x, dz = tz - hh.z, dd = Math.hypot(dx, dz); if (dd > 25) { hh.x = tx; hh.z = tz; return null; } return dd < 0.35 ? { x: 0, z: 0, s: 0, face: null } : { x: dx / dd, z: dz / dd, s: Math.min(1.7, 0.4 + dd * 1.2), face: null }; };
    G.humans.push(h); G.scene.add(h.group); return h;
  }
  clearPeople(L) { for (const s of L.res.values()) if (s.h) { s.h.remove = true; s.h = null; } }

  // talk to a villager: what he says depends on the hour, the weather and who he is
  provide(pl, out) {
    for (const L of this.list) {
      if (!L.built) continue;
      for (const s of L.res.values()) { const h = s.h; if (!h || h.dead || Math.hypot(h.x - pl.x, h.z - pl.z) > 3.4 || Math.abs((h.y || 0) - (pl.y || 0)) > 2) continue; out.push({ x: h.x, z: h.z, r: 3.4, cy: (h.y || 0) + 1, name: `${s.r.name} · ${L.v.name}`, verbs: [{ key: 'F', label: () => (h.sleeping ? '깨우기' : '대화'), run: () => this.talk(L, s) }] }); }
    }
  }
  talk(L, s) {
    const G = this.G, h = s.h, v = L.v, o = this.nearestCity(v), hr = this.hour;
    if (h.sleeping) { h.sleeping = false; h.lying = false; h.y = h.floorY = L.pad.y + 0.02; h.state = 'flee'; h.fleeT = 6; h.threat = G.player; G.toast(s.r.name, '…누구세요? 나가세요!'); G.society?.crime?.('trespass', 6, h.x, h.z); return; }
    const lines = [`${v.name}은 조용한 마을이에요. ${o.c.name}까지 ${(o.d / 1000).toFixed(0)} km, ${this.dir(v, o.c)}이죠.`, hr < 9 ? '아침부터 부지런하시네요.' : hr > 19 ? '밤길은 조심하세요. 도시 쪽은 위험하대요.' : '가게에 들러 보세요. 없는 게 없어요.', G.state.weather?.type === 'rain' ? '비가 오니 밭일이 쉬어 가네요.' : '날씨 한번 좋네요.', this.rumor()];
    G.toast(`${s.r.name} (${v.name})`, lines[Math.floor(Math.random() * lines.length)]);
  }
}
