import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { A } from './assets.js';
import { N, P, R, SW, HALF, roadC } from './world.js';
import { mulberry32 } from './util.js';

// Street dressing from CC0 Poly Haven scans: hydrants, bins, utility boxes, bags, planters.
// Each prop type is baked into one geometry per material, then instanced per 4x4 city cell so frustum/distance culling can drop whole cells.
const CELLS = 4, CELL = (N * P + 2 * R) / CELLS, SHOW_R = 70;
const SPEC = {
  hydrant: { h: 0.85, r: 0.28, w: 0.1 },
  trash: { h: 1.0, r: 0.34, w: 0.34 },
  box: { h: 1.35, r: 0.5, w: 0.12 },
  bag: { h: 0.55, r: 0.3, w: 0.22 },
  plant: { h: 1.25, r: 0.4, w: 0.12 },
};
const KEY = { hydrant: 'fire_hydrant', trash: 'metal_trash_can', box: 'utility_box_01', bag: 'trashbag', plant: 'potted_plant_01' };

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
    const t = 0.2 + k * 0.3 + 0.13, a = roadC(j) + R / 2 + (P - R) * t, side = (R / 2 + SW / 2) * (k % 2 ? 1 : -1);
    slots.push({ x: roadC(i) + side, z: a, along: 'z' }, { x: roadC(j) + R / 2 + (P - R) * t, z: roadC(i) + side * -1, along: 'x' });
  }
  const pick = () => { const r = rnd(); return r < 0.16 ? 'hydrant' : r < 0.5 ? 'trash' : r < 0.64 ? 'box' : r < 0.86 ? 'bag' : 'plant'; };
  const cells = new Map(), place = [];
  for (const s of slots) {
    if (rnd() > 0.5) continue;
    const type = pick(), sp = SPEC[type], ry = rnd() * Math.PI * 2;
    const jx = (rnd() - 0.5) * 1.2, jz = (rnd() - 0.5) * 1.2;
    const x = s.x + (s.along === 'z' ? 0 : jx) + (s.along === 'z' ? jx * 0.2 : 0), z = s.z + jz * (s.along === 'z' ? 1 : 0.2);
    if (Math.abs(x) > HALF + R || Math.abs(z) > HALF + R) continue;
    place.push({ type, x, z, ry });
    world.colliders.addCircle(x, z, sp.r, sp.h, 'prop');
  }
  const group = new THREE.Group(); group.name = 'dressing';
  const baked = {};
  for (const type of Object.keys(SPEC)) baked[type] = A.props[KEY[type]] ? bake(A.props[KEY[type]], SPEC[type].h) : null;
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
        im.castShadow = type !== 'bag'; im.receiveShadow = true; im.computeBoundingSphere(); chunk.add(im);
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
