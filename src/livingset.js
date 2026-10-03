import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { A } from './assets.js';

// Living-room furniture from the supplied InteriorTest.blend (see build/bake_livingroom.py).
// All pieces are baked into ONE fixed layout in a room-local frame (x lateral, z depth from the back wall, y up) and merged per
// material, so every living room on a floor costs a handful of instanced draw calls in total.
// piece, x, y, z, rotY, scale
const LAYOUT = [
  ['rug', 0, 0.012, 2.2, 0, 0.75],
  ['table', 0, 0, 2.0, 0, 1],
  ['tv', 0, 0.4, 3.4, Math.PI, 1],
  ['piano', -2.45, 0, 2.4, 0, 1],
  ['pot', -2.0, 0, 0.55, 0, 1],
];
const RUG = new THREE.Color(0x232a38);
let cache;

function toFloat(src) {
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = src.attributes[name]; if (!a) continue;
    const f = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) { f[i * a.itemSize] = a.getX(i); f[i * a.itemSize + 1] = a.getY(i); if (a.itemSize > 2) f[i * a.itemSize + 2] = a.getZ(i); }
    g.setAttribute(name, new THREE.BufferAttribute(f, a.itemSize));
  }
  if (src.index) g.setIndex(Array.from(src.index.array));
  return g;
}

// returns [{ geo, mat }] (local frame), or null when the asset is missing
export function livingSet() {
  if (cache !== undefined) return cache;
  const src = A.props?.living_set; if (!src) return (cache = null);
  // each baked piece is a top-level node named after the piece (one mesh child per material)
  const named = {}; src.children.forEach((c) => { named[c.name] = c; });
  const textured = new Map(), flat = [], glass = [];
  const flatMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25, envMapIntensity: 0.8 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xbfe0ea, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.28, depthWrite: false, envMapIntensity: 1.5 });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), ax = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  for (const [piece, x, y, z, ry, s] of LAYOUT) {
    const node = named[piece]; if (!node) continue;
    node.updateWorldMatrix(true, true);
    q.setFromAxisAngle(ax, ry); ps.set(x, y, z); sc.setScalar(s); m4.compose(ps, q, sc);
    node.traverse((o) => {
      if (!o.isMesh) return;
      const g = toFloat(o.geometry); g.applyMatrix4(o.matrixWorld); g.applyMatrix4(m4);
      const mat = o.material, name = mat.name;
      if (mat.map && name !== 'rug') { if (!textured.has(mat)) textured.set(mat, []); textured.get(mat).push(g.index ? g.toNonIndexed() : g); return; }
      const n = g.index ? g.toNonIndexed() : g, c = name === 'rug' ? RUG : mat.color, col = new Float32Array(n.attributes.position.count * 3);
      for (let i = 0; i < col.length; i += 3) { col[i] = c.r; col[i + 1] = c.g; col[i + 2] = c.b; }
      n.setAttribute('color', new THREE.BufferAttribute(col, 3));
      (name === 'glass' ? glass : flat).push(n);
    });
  }
  const out = [];
  for (const [mat, gs] of textured) out.push({ geo: mergeGeometries(gs, false), mat });
  if (flat.length) out.push({ geo: mergeGeometries(flat.map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); return g; }), false), mat: flatMat });
  if (glass.length) out.push({ geo: mergeGeometries(glass.map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k); return g; }), false), mat: glassMat });
  for (const p of out) p.geo.userData.shared = true;
  return (cache = out);
}

// footprint colliders in the room-local frame: [x0, z0, x1, z1, height]
export const LIVING_COLLIDERS = [[-2.8, 1.65, -2.1, 3.15, 1.2], [-0.72, 1.5, 0.72, 2.5, 0.45]];
