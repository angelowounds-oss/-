import * as THREE from 'three';
import { riverPolys } from './landfn.js';
import { patchStandard, timeUniform } from './shaders.js';
import { region, regionWeight } from './region.js';

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
  // a compiled region's inland water (the Han with its banks, lakes, reservoirs, streams): one mesh per 64 x 64 cells, a flat quad per water cell at
  // its level; the streaks run across the cells (uv.x = 0 keeps the ribbon's edge fade off)
  const R = region();
  if (R) for (let cj = 0; cj < R.nz; cj += 64) for (let ci = 0; ci < R.nx; ci += 64) {
    const pos = [], uv = [], idx = [], hg = R.g / 2;
    for (let j = cj; j < Math.min(R.nz, cj + 64); j++) for (let i = ci; i < Math.min(R.nx, ci + 64); i++) {
      const k = j * R.nx + i; if (R.water[k] !== 2) continue;
      const x = R.x0 + i * R.g, z = R.z0 + j * R.g; if (regionWeight(x, z) < 0.5) continue;
      const y = R.level[k] / 10 + 0.03, b = pos.length / 3;
      pos.push(x - hg, y, z - hg, x + hg, y, z - hg, x - hg, y, z + hg, x + hg, y, z + hg);
      for (const [dx, dz] of [[-hg, -hg], [hg, -hg], [-hg, hg], [hg, hg]]) uv.push(0, (x + dx + z + dz) / 6);
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
    if (!idx.length) continue;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, q) => (q % 3 === 1 ? 1 : 0)), 3)); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat); m.renderOrder = -1; m.receiveShadow = false; m.name = 'region-water'; g.add(m);
  }
  scene.add(g); return g;
}
