import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const tex = (a, b, seam, size = 256) => {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  g.fillStyle = a; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${b},${Math.random() * 0.12})`; g.fillRect(Math.random() * size, Math.random() * size, 2, 2); }
  g.strokeStyle = seam; g.lineWidth = 3; g.strokeRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
};
let M = null;
export function mats() {
  if (M) return M;
  const tile = tex('#8a90a4', '60,65,80', 'rgba(30,34,48,.9)');
  const carpet = tex('#2b3048', '255,255,255', 'rgba(0,0,0,0)');
  const wood = tex('#5b3f2e', '20,10,5', 'rgba(20,10,6,.7)');
  const conc = tex('#555a66', '20,22,30', 'rgba(0,0,0,0)');
  const mk = (t, r, m) => new THREE.MeshStandardMaterial({ map: t, roughness: r, metalness: m, envMapIntensity: 0.9 });
  M = {
    tile: mk(tile, 0.14, 0.1), carpet: mk(carpet, 0.95, 0), wood: mk(wood, 0.4, 0.05), conc: mk(conc, 0.9, 0.02),
    decor: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.12, envMapIntensity: 1.1 }),
    emit: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x9fb8d0, roughness: 0.04, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 2, side: THREE.DoubleSide }),
    steel: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.9, envMapIntensity: 1.6 }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0x1b1d28, roughness: 0.9 }),
  };
  return M;
}

export class Builder {
  constructor() { this.parts = { decor: [], emit: [], glass: [], steel: [] }; }
  _push(key, g, col, em = 1) {
    const n = g.attributes.position.count, a = new Float32Array(n * 3), c = new THREE.Color(col);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r * em; a[i * 3 + 1] = c.g * em; a[i * 3 + 2] = c.b * em; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    this.parts[key].push(g.index ? g.toNonIndexed() : g);
  }
  // center-based box in world coords (x,z center; y base)
  box(key, x, y, z, w, h, d, col, ry = 0, em = 1, rx = 0) {
    const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0);
    if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); g.translate(x, y, z); this._push(key, g, col, em);
  }
  // min/max extents box
  ext(key, x0, y0, z0, x1, y1, z1, col, em = 1) { this.box(key, (x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, col, 0, em); }
  cyl(key, x, y, z, r, h, col, seg = 14, em = 1) { const g = new THREE.CylinderGeometry(r, r, h, seg); g.translate(x, y + h / 2, z); this._push(key, g, col, em); }
  ico(key, x, y, z, r, col, sy = 1) { const g = new THREE.IcosahedronGeometry(r, 1); g.scale(1, sy, 1); g.translate(x, y, z); this._push(key, g, col); }
  finish(parent) {
    const m = mats(), out = [];
    for (const [k, arr] of Object.entries(this.parts)) {
      if (!arr.length) continue;
      const geo = mergeGeometries(arr, false); if (!geo) continue;
      const mesh = new THREE.Mesh(geo, k === 'decor' ? m.decor : k === 'emit' ? m.emit : k === 'glass' ? m.glass : m.steel);
      mesh.frustumCulled = false; mesh.receiveShadow = k !== 'emit'; if (k === 'glass') mesh.renderOrder = 3;
      parent.add(mesh); out.push(mesh);
    }
    return out;
  }
}
export function disposeGroup(g) {
  g.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
  g.parent?.remove(g);
}

// quantized (KHR_mesh_quantization) attributes are integers: expand position/normal/uv to float before any matrix is baked in
export function toFloatGeo(src) {
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
