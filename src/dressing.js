import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { A } from './assets.js';
import { N, P, R, SW, HALF, roadC, blockLen } from './world.js';
import { mulberry32 } from './util.js';

// Street dressing: CC0 Poly Haven scans (hydrants, bins, utility boxes, bags, planters) plus the supplied street_props.blend set
// (vending machines, garbage containers, garbage bags, cardboard boxes).
// Each prop type is baked into one geometry per material, then instanced per 4x4 city cell so frustum/distance culling can drop whole cells.
const CELLS = 4, CELL = (N * P + 2 * R) / CELLS, SHOW_R = 70;
const SPEC = {
  hydrant: { h: 0.85, r: 0.28, w: 0.1 },
  trash: { h: 1.0, r: 0.34, w: 0.34 },
  box: { h: 1.35, r: 0.5, w: 0.12 },
  bag: { h: 0.55, r: 0.3, w: 0.22 },
  plant: { h: 1.25, r: 0.4, w: 0.12 },
  // supplied street_props.blend (nodes of street_props.glb; native metre sizes)
  vend1: { h: 1.88, r: 0.55, w: 0.03, node: 'vend_blue', face: 1 },
  vend2: { h: 2.11, r: 0.6, w: 0.03, node: 'vend_dark', face: 1 },
  cont: { h: 1.26, r: 0.62, w: 0.05, node: 'container' },
  sbag1: { h: 0.44, r: 0.28, w: 0.03, node: 'bag1' }, sbag2: { h: 0.44, r: 0.28, w: 0.03, node: 'bag2' }, sbag3: { h: 0.65, r: 0.4, w: 0.03, node: 'bag3' },
  sbag4: { h: 0.4, r: 0.3, w: 0.03, node: 'bag4' }, sbag5: { h: 0.64, r: 0.4, w: 0.03, node: 'bag5' },
  card1: { h: 0.6, r: 0.5, w: 0.03, node: 'box1' }, card2: { h: 0.75, r: 0.5, w: 0.03, node: 'box2' }, card3: { h: 0.93, r: 0.4, w: 0.03, node: 'box3' },
};
const KEY = { hydrant: 'fire_hydrant', trash: 'metal_trash_can', box: 'utility_box_01', bag: 'trashbag', plant: 'potted_plant_01' };
const WEIGHT = Object.fromEntries(Object.entries(SPEC).map(([k, v]) => [k, v.w]));
const WSUM = Object.values(WEIGHT).reduce((a, b) => a + b, 0);

// one named node out of a multi-node glb (Blender copies carry ".001" style suffixes)
function node(root, name) {
  let hit = null;
  root.traverse((o) => { if (!hit && (o.name === name || o.name === name)) hit = o; });
  return hit;
}
function sceneFor(type) {
  const sp = SPEC[type];
  if (sp.node) { const r = A.props?.street_props; return r ? node(r, sp.node) : null; }
  return A.props?.[KEY[type]] || null;
}

// geometry per material for one prop, normalised to its real-world height with feet on the ground
function bake(scene, height) {
  const root = scene.clone(true); root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root), k = height / (box.max.y - box.min.y);
  const pre = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2));
  const by = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(pre, o.matrixWorld));
    for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const m = o.material; if (!by.has(m)) by.set(m, []); by.get(m).push(g.index ? g.toNonIndexed() : g);
  });
  return [...by].map(([mat, gs]) => ({ mat, geo: mergeGeometries(gs, false) }));
}

export function buildDressing(scene, world) {
  if (!A.props) return null;
  const rnd = mulberry32(4711), slots = [];
  // sidewalk centre line, offset along the road from the lamp positions so nothing overlaps a pole
  for (let i = 0; i <= N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < 3; k++) {
    const t = 0.2 + k * 0.3 + 0.13, a = roadC(j) + R / 2 + (blockLen(j) - R) * t, side = (R / 2 + SW / 2) * (k % 2 ? 1 : -1);
    // fx,fz: unit vector from the sidewalk towards the road (vending machines face it)
    slots.push({ x: roadC(i) + side, z: a, along: 'z', fx: -Math.sign(side), fz: 0 }, { x: roadC(j) + R / 2 + (blockLen(j) - R) * t, z: roadC(i) + side * -1, along: 'x', fx: 0, fz: Math.sign(side) });
  }
  const pick = () => { let r = rnd() * WSUM; for (const k of Object.keys(WEIGHT)) { r -= WEIGHT[k]; if (r <= 0) return k; } return 'trash'; };
  const cells = new Map(), place = [];
  for (const s of slots) {
    if (rnd() > 0.5) continue;
    const type = pick(), sp = SPEC[type], ry = sp.face ? Math.atan2(s.fx, s.fz) : rnd() * Math.PI * 2;
    const jx = (rnd() - 0.5) * 1.2, jz = (rnd() - 0.5) * 1.2;
    const x = s.x + (s.along === 'z' ? 0 : jx) + (s.along === 'z' ? jx * 0.2 : 0), z = s.z + jz * (s.along === 'z' ? 1 : 0.2);
    if (Math.abs(x) > HALF + R || Math.abs(z) > HALF + R) continue;
    place.push({ type, x, z, ry });
    world.colliders.addCircle(x, z, sp.r, sp.h, 'prop');
  }
  const group = new THREE.Group(); group.name = 'dressing';
  const baked = {};
  for (const type of Object.keys(SPEC)) { const sc = sceneFor(type); baked[type] = sc ? bake(sc, SPEC[type].h) : null; }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3(), ax = new THREE.Vector3(0, 1, 0);
  const chunks = [];
  for (let cx = 0; cx < CELLS; cx++) for (let cz = 0; cz < CELLS; cz++) {
    const mine = place.filter((p) => Math.min(CELLS - 1, Math.max(0, Math.floor((p.x + HALF + R) / CELL))) === cx && Math.min(CELLS - 1, Math.max(0, Math.floor((p.z + HALF + R) / CELL))) === cz);
    if (!mine.length) continue;
    const chunk = new THREE.Group(); chunk.userData.c = new THREE.Vector3(-HALF - R + (cx + 0.5) * CELL, 0, -HALF - R + (cz + 0.5) * CELL);
    for (const type of Object.keys(SPEC)) {
      const list = mine.filter((p) => p.type === type), parts = baked[type];
      if (!list.length || !parts) continue;
      for (const { mat, geo } of parts) {
        const im = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach((p, n) => { q.setFromAxisAngle(ax, p.ry); pv.set(p.x, 0, p.z); m4.compose(pv, q, one); im.setMatrixAt(n, m4); });
        im.castShadow = type !== 'bag' && !type.startsWith('sbag'); im.receiveShadow = true; im.computeBoundingSphere(); chunk.add(im);
      }
    }
    group.add(chunk); chunks.push(chunk);
  }
  scene.add(group);
  return {
    group, count: place.length,
    update(cam) { for (const c of chunks) c.visible = Math.hypot(c.userData.c.x - cam.x, c.userData.c.z - cam.z) < SHOW_R + CELL * 0.72; },
  };
}
