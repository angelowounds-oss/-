import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { A } from './assets.js';

// Exterior skin of the outer-ring towers (supplied residential models). Interiors come from building.js; this is the one-sided shell.

// quantized (KHR_mesh_quantization) attributes are integers: expand to float before any matrix is baked in
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

let wallTex = null;
function wallMaterial(url) {
  if (wallTex) return wallTex;
  const t = new THREE.TextureLoader().load(url); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.flipY = false;
  const m = new THREE.MeshStandardMaterial({ map: t, color: 0x9db0d4, roughness: 0.9, metalness: 0.0, envMapIntensity: 0.5 });
  haze(m);
  return (wallTex = m);
}
// Fog is far too dense for a skyline (everything past ~200 m is flat colour), so these materials use a much thinner haze.
function haze(m) {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', `#ifdef USE_FOG
      float ff = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth * 0.04);
      gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, ff);
    #endif`);
  };
  m.customProgramCacheKey = () => 'skyline-haze';
}

export function buildSkyline(scene, world, wallUrl) {
  const lots = world.lots.filter((l) => l.model);
  if (!A.res || !lots.length) return null;
  const wall = wallMaterial(wallUrl);
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a2c44, roughness: 0.08, metalness: 0.7, emissive: 0xffc27a, emissiveIntensity: 0, envMapIntensity: 1.2 });
  haze(glass);
  (world.nightEmit = world.nightEmit || []).push({ m: glass, k: 0.9 });
  const parts = {};
  for (const i of new Set(lots.map((l) => l.model.variant))) {
    const prim = [];
    A.res[i].traverse((o) => { if (o.isMesh) { const g = toFloat(o.geometry); g.applyMatrix4(o.matrixWorld); prim.push({ g, glass: /glass/i.test(o.material.name) }); } });
    parts[i] = prim;
  }
  // One merged wall mesh and one merged glass mesh per side of the ring, so frustum culling drops whole sides.
  const group = new THREE.Group(); group.name = 'skyline';
  const m4 = new THREE.Matrix4(), rq = new THREE.Quaternion(), ax = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
  for (const side of ['n', 's', 'w', 'e']) {
    const wallG = [], glassG = [];
    for (const l of lots) {
      if (l.model.side !== side) continue;
      rq.setFromAxisAngle(ax, l.model.rot); pv.set(l.model.cx, 0, l.model.cz); m4.compose(pv, rq, one);
      for (const p of parts[l.model.variant]) (p.glass ? glassG : wallG).push(p.g.clone().applyMatrix4(m4));
    }
    const add = (geos, mat) => {
      if (!geos.length) return;
      const g = mergeGeometries(geos.map((q) => (q.index ? q.toNonIndexed() : q)), false); if (!g) return;
      const mesh = new THREE.Mesh(g, mat); mesh.receiveShadow = false; mesh.castShadow = false; g.computeBoundingSphere(); group.add(mesh);
    };
    add(wallG, wall); add(glassG, glass);
  }
  scene.add(group);
  return { group, count: lots.length };
}
