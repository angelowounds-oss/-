import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { A } from './assets.js';
import { HALF, R, SW } from './world.js';
import { mulberry32 } from './util.js';
import { nightU } from './shaders.js';

// Outer skyline: the 10 residential towers (12.6 x 23.1 m footprint, 18-105 m) ringed around the city.
// Each side of the ring is baked into one merged mesh per material (2 draw calls) so frustum culling drops whole sides.
const EDGE = HALF + R / 2 + SW + 10, W = 12.6, D = 23.1;
const VARIANTS = [1, 1, 1, 1, 2, 2, 2, 3, 3, 4, 5, 6, 7, 8, 10]; // weighted toward the shorter blocks (triangle budget)

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
  if (!A.res) return null;
  const rnd = mulberry32(90210);
  const wall = wallMaterial(wallUrl);
  const glass = new THREE.MeshStandardMaterial({ color: 0x1a2c44, roughness: 0.08, metalness: 0.7, emissive: 0xffc27a, emissiveIntensity: 0, envMapIntensity: 1.2 });
  haze(glass);
  (world.nightEmit = world.nightEmit || []).push({ m: glass, k: 0.9 });
  const parts = {};
  for (const i of new Set(VARIANTS)) {
    const prim = [];
    A.res[i].traverse((o) => { if (o.isMesh) { const g = toFloat(o.geometry); g.applyMatrix4(o.matrixWorld); prim.push({ g, glass: /glass/i.test(o.material.name) }); } });
    parts[i] = prim;
  }
  // slots along the four sides: [x, z, rot] where rot 0 = long axis along x
  const sides = [];
  for (const [nx, nz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
    const list = [], span = HALF + R, lat = (nx === 0) ? 'x' : 'z';
    let t = -span;
    while (t < span) {
      const v = VARIANTS[Math.floor(rnd() * VARIANTS.length)], row = rnd() < 0.15 ? 1 : 0;
      const long = D, depth = W + (row ? 40 : 0);
      const c = t + long / 2, off = EDGE + depth / 2 + rnd() * 6 + (row ? 30 : 0);
      list.push({ v, a: c, off, rot: lat === 'x' ? 0 : Math.PI / 2 });
      t += long + 24 + rnd() * 46;
    }
    sides.push({ nx, nz, list, lat });
  }
  const group = new THREE.Group(); group.name = 'skyline';
  const chunks = [];
  const m4 = new THREE.Matrix4(), rq = new THREE.Quaternion(), ax = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), pv = new THREE.Vector3();
  for (const s of sides) {
    const wallG = [], glassG = [];
    const cx = s.nx * (EDGE + 50), cz = s.nz * (EDGE + 50);
    for (const b of s.list) {
      const x = s.lat === 'x' ? b.a : s.nx * b.off, z = s.lat === 'x' ? s.nz * b.off : b.a;
      rq.setFromAxisAngle(ax, b.rot); pv.set(x, 0, z); m4.compose(pv, rq, one);
      for (const p of parts[b.v]) (p.glass ? glassG : wallG).push(p.g.clone().applyMatrix4(m4));
      // footprint collider (AABB; rotation is a multiple of 90 degrees so it is exact)
      world.colliders.addBox(x - (b.rot ? W : D) / 2, z - (b.rot ? D : W) / 2, x + (b.rot ? W : D) / 2, z + (b.rot ? D : W) / 2, 40, 'skyline');
    }
    const add = (geos, mat) => {
      if (!geos.length) return;
      const g = mergeGeometries(geos.map((q) => (q.index ? q.toNonIndexed() : q)), false); if (!g) return;
      const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = true; mesh.receiveShadow = false; mesh.castShadow = false; group.add(mesh); g.computeBoundingSphere();
    };
    add(wallG, wall); add(glassG, glass);
    chunks.push({ s, cx, cz });
  }
  scene.add(group);
  return { group, count: sides.reduce((n, s) => n + s.list.length, 0) };
}
