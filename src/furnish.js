import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { A } from './assets.js';
import { toFloatGeo, holeCU, holeHU } from './gfx.js';
import defs from '../assets/interior/defs.json';

// Furniture from the packed Poly Haven set (build/interior_pack.mjs): every model is one mesh on a shared 2048px atlas, so a whole
// floor of furniture merges into a single draw call. Model space after loading: metres, origin at the footprint centre on the floor,
// the front of the object faces +Z.
const FIX = { // models whose source scale/orientation needs a correction: target height in metres
  steel_frame_shelves_01: { h: 2.0 },
};
let cache = null, material = null;

function load() {
  if (cache) return cache;
  cache = new Map();
  const root = A.props?.furniture; if (!root) return cache;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh) return;
    material = material || o.material;
    const id = o.parent && o.parent !== root ? o.parent.name : o.name, name = defs[id] ? id : o.name;
    if (!defs[name]) return;
    const g = toFloatGeo(o.geometry); g.applyMatrix4(o.matrixWorld);
    const d = defs[name], fx = FIX[name], k = fx ? fx.h / d.h : 1;
    if (k !== 1) g.scale(k, k, k);
    g.computeBoundingBox();
    cache.set(name, { geo: g.index ? g.toNonIndexed() : g, w: d.w * k, h: d.h * k, d: d.d * k });
  });
  if (material) {
    material = material.clone(); material.roughness = 0.72; material.metalness = 0.05; material.envMapIntensity = 0.7;
    // furniture caught in a breach is blown away: not drawn inside the hole widened by ~1 m on both sides of the wall
    material.onBeforeCompile = (sh) => {
      sh.uniforms.uHoleC = holeCU; sh.uniforms.uHoleH = holeHU;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHWP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvHWP=(modelMatrix*vec4(transformed,1.)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vHWP;uniform vec4 uHoleC[16];uniform vec4 uHoleH[16];')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        for(int i=0;i<16;i++){vec4 c=uHoleC[i];if(c.w<.5)continue;vec3 hh=uHoleH[i].xyz;if(hh.x<hh.z)hh.x+=1.1;else hh.z+=1.1;hh.y+=.3;
          vec3 d=abs(vHWP-c.xyz)-hh;if(max(d.x,max(d.y,d.z))<0.)discard;}`);
    };
    material.customProgramCacheKey = () => 'furniture-holes';
  }
  return cache;
}
export const furnitureReady = () => load().size > 0;
export const furnitureInfo = (id) => load().get(id) || null;
export const furnitureIds = () => [...load().keys()];
export const furnitureMaterial = () => { load(); return material; };

// Collects the furniture of one floor, merges it into one mesh and registers collision boxes.
export class FloorDecor {
  constructor(fl, y0) { this.fl = fl; this.y0 = y0; this.geos = []; this.count = 0; this.boxes = []; }
  has(id) { return !!furnitureInfo(id); }
  // x,z centre; ry yaw; opts: s uniform scale, lift height above the floor, solid (default true for floor pieces), tag
  put(id, x, z, ry = 0, o = {}) {
    const m = furnitureInfo(id); if (!m) return null;
    const s = o.s ?? 1, lift = o.lift ?? 0;
    const g = m.geo.clone(); const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, this.y0 + lift, z), q, new THREE.Vector3(s, s, s)));
    this.geos.push(g); this.count++;
    const c = Math.abs(Math.cos(ry)), n = Math.abs(Math.sin(ry)), hx = (c * m.w + n * m.d) * s / 2, hz = (c * m.d + n * m.w) * s / 2;
    const rec = { x, z, hx, hz, h: m.h * s, id };
    if (o.solid ?? (lift < 0.2 && m.h * s > 0.3)) { rec.box = this.fl.cc(x - hx, z - hz, x + hx, z + hz, this.y0 + lift, this.y0 + lift + m.h * s, o.tag || 'furniture'); }
    this.boxes.push(rec);
    return rec;
  }
  size(id, s = 1) { const m = furnitureInfo(id); return m ? { w: m.w * s, h: m.h * s, d: m.d * s } : null; }
  finish(group) {
    if (!this.geos.length || !material) return null;
    const merged = mergeGeometries(this.geos, false); if (!merged) return null;
    const mesh = new THREE.Mesh(merged, material); mesh.castShadow = false; mesh.receiveShadow = true; mesh.frustumCulled = true;
    group.add(mesh); this.mesh = mesh; return mesh;
  }
}
