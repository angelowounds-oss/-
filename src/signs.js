import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { A } from './assets.js';
import { mulberry32 } from './util.js';

// Shop signs from the supplied street_props.blend (street_signs.glb: signs stand upright, front faces +Z, origin = bottom centre).
// Every lot with a door gets a fascia sign beside the entrance, usually a two-sided blade sign sticking out of the wall and
// sometimes an A-frame board on the pavement. Geometry is baked per 250 m cell and material, so a cell costs three draw calls.
const CELL = 250, SHOW_R = 200;
const FASCIA = ['sign3', 'sign12', 'sign13', 'sign9', 'sign6'];
const BLADE = ['sign2', 'sign4', 'sign8', 'sign1', 'sign10', 'sign5', 'sign7', 'sign11'];

function nodeMap(root) {
  const nodes = {};
  root.updateMatrixWorld(true);
  root.traverse((o) => { if (/^sign\d+$/.test(o.name) && !nodes[o.name]) nodes[o.name] = o; });
  return nodes;
}

export function buildSigns(scene, world) {
  const root = A.props?.street_signs; if (!root) return null;
  const nodes = nodeMap(root);
  // emissive copies of the textured materials: the boards glow after dark (driven by daynight via world.nightEmit)
  const mats = new Map();
  const matFor = (m) => {
    if (!mats.has(m)) {
      const c = m.clone();
      if (c.map) { c.emissive = new THREE.Color(0xffffff); c.emissiveMap = c.map; c.emissiveIntensity = 0; (world.nightEmit = world.nightEmit || []).push({ m: c, k: 0.85 }); }
      mats.set(m, c);
    }
    return mats.get(m);
  };
  const cells = new Map(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), ax = new THREE.Vector3(0, 1, 0), pv = new THREE.Vector3(), sc = new THREE.Vector3();
  const bakeInto = (name, x, y, z, yaw, s) => {
    const nd = nodes[name]; if (!nd) return null;
    q.setFromAxisAngle(ax, yaw); pv.set(x, y, z); sc.setScalar(s); m4.compose(pv, q, sc);
    const key = Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
    let cell = cells.get(key); if (!cell) cells.set(key, (cell = { by: new Map(), cx: (Math.floor(x / CELL) + 0.5) * CELL, cz: (Math.floor(z / CELL) + 0.5) * CELL }));
    nd.traverse((o) => {
      if (!o.isMesh) return;
      const g = o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(m4, o.matrixWorld));
      const mat = matFor(o.material); if (!cell.by.has(mat)) cell.by.set(mat, []); cell.by.get(mat).push(g.index ? g.toNonIndexed() : g);
    });
    return nd;
  };
  const width = (name) => { const nd = nodes[name]; const b = new THREE.Box3().setFromObject(nd); return { w: b.max.x - b.min.x, d: b.max.z - b.min.z }; };
  let count = 0;
  for (const l of world.lots) {
    const d = l.door; if (!d) continue;
    const rr = mulberry32(Math.floor(l.seed * 1000) + 5), nx = d.nx, nz = d.nz, tx = -nz, tz = nx, yawN = Math.atan2(nx, nz);
    const side = rr() < 0.5 ? 1 : -1;
    // fascia: on the wall beside the canopy (canopy is ~6.2 m wide), facing outwards
    const fn = FASCIA[Math.floor(rr() * FASCIA.length)], fw = width(fn).w;
    const lat = side * (3.1 + 0.7 + fw / 2);
    bakeInto(fn, d.px + nx * 0.3 + tx * lat, 2.6, d.pz + nz * 0.3 + tz * lat, yawN, 1); count++;
    // blade sign: perpendicular to the wall on the other side of the door, readable from both directions
    if (rr() < 0.75) {
      const bn = BLADE[Math.floor(rr() * BLADE.length)], bw = width(bn).w, blat = -side * (4.6 + rr() * 2.5);
      const bx = d.px + tx * blat + nx * (0.12 + bw / 2), bz = d.pz + tz * blat + nz * (0.12 + bw / 2), by = 3.0 + rr() * 0.8;
      const yaw = Math.atan2(tx, tz);
      bakeInto(bn, bx, by, bz, yaw, 1); bakeInto(bn, bx - tx * 0.02, by, bz - tz * 0.02, yaw + Math.PI, 1); count++;
    }
    // A-frame board on the pavement
    if (rr() < 0.45) {
      const ax2 = d.px + nx * 2.6 + tx * side * 1.8, az2 = d.pz + nz * 2.6 + tz * side * 1.8;
      bakeInto('sign15', ax2, 0, az2, yawN + (rr() - 0.5) * 0.6, 1); world.colliders.addCircle(ax2, az2, 0.4, 1.1, 'prop'); count++;
    }
  }
  const group = new THREE.Group(); group.name = 'signs';
  const chunks = [];
  for (const cell of cells.values()) {
    const chunk = new THREE.Group(); chunk.userData.c = { x: cell.cx, z: cell.cz };
    for (const [mat, geos] of cell.by) {
      const g = mergeGeometries(geos, false); if (!g) continue;
      const mesh = new THREE.Mesh(g, mat); mesh.castShadow = false; mesh.receiveShadow = false; g.computeBoundingSphere(); chunk.add(mesh);
    }
    group.add(chunk); chunks.push(chunk);
  }
  scene.add(group);
  return {
    group, count,
    update(cam) { for (const c of chunks) c.visible = Math.hypot(c.userData.c.x - cam.x, c.userData.c.z - cam.z) < SHOW_R + CELL * 0.72; },
  };
}
