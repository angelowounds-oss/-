import * as THREE from 'three';
import { riverPolys } from './landfn.js';
import { patchStandard, timeUniform } from './shaders.js';

// The surface of the rivers (the channels are cut into the ground by landfn.js): one ribbon per river at the water level of landfn.riverAt, with a
// flow of streaks along it. Transparent, no shadows, a few hundred triangles in all; the same levels are what waterfn.farWater swims in.
export function buildRivers(scene) {
  const g = new THREE.Group(); g.name = 'rivers';
  const mat = new THREE.MeshStandardMaterial({ color: 0x0b3b52, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.86, depthWrite: false });
  patchStandard(mat, 'river-v1', {
    vertexDecl: 'varying vec2 vRV;', vertexMain: 'vRV=uv;',
    fragDecl: 'varying vec2 vRV;uniform float uTr;float fRough=.08,fMetal=0.;vec3 fEmit=vec3(0.);',
    fragMain: `float st=sin(vRV.y*.9-uTr*1.7+sin(vRV.x*5.+vRV.y*.13)*2.2)*.5+.5;diffuseColor.rgb+=vec3(.05,.13,.17)*smoothstep(.72,1.,st);diffuseColor.a*=smoothstep(1.,.78,abs(vRV.x));fEmit=vec3(.01,.03,.04)*st;`,
    uniforms: { uTr: timeUniform },
  });
  for (const R of riverPolys()) {
    const n = R.pts.length, pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), idx = []; let along = 0;
    for (let i = 0; i < n; i++) {
      const p = R.pts[i], a = R.pts[Math.max(0, i - 1)], b = R.pts[Math.min(n - 1, i + 1)], tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1, nx = -tz / l, nz = tx / l, hw = p[2] / 2 + 4;
      if (i) along += Math.hypot(p[0] - R.pts[i - 1][0], p[1] - R.pts[i - 1][1]);
      pos.set([p[0] + nx * hw, R.lv[i] + 0.03, p[1] + nz * hw, p[0] - nx * hw, R.lv[i] + 0.03, p[1] - nz * hw], i * 6); uv.set([-1, along / 6, 1, along / 6], i * 4);
      if (i + 1 < n) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const nr = geo.attributes.normal; for (let i = 0; i < nr.count; i++) nr.setXYZ(i, 0, 1, 0);
    const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = -1; m.receiveShadow = false; g.add(m);
  }
  scene.add(g); return g;
}
