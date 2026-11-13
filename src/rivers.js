import * as THREE from 'three';
import { riverPolys } from './landfn.js';
import { patchStandard, timeUniform } from './shaders.js';
import { region, regionWeight } from './region.js';

// The surface of the rivers (the channels are cut into the ground by landfn.js): one ribbon per river at the water level of landfn.riverAt, with a
// flow of streaks along it. Transparent, no shadows, a few hundred triangles in all; the same levels are what waterfn.farWater swims in.
// the capital's inland water cells (R.inland) by block of 64 x 64 cells, a counting sort that keeps the raster's order inside each block: the
// cells of block b are order[start[b] .. start[b + 1]) (indices into R.inland)
function inlandByBlock(R) {
  const W = R.inland, n = W.k.length, bx = Math.ceil(R.nx / 64), nb = bx * Math.ceil(R.nz / 64), start = new Int32Array(nb + 1), blk = new Int32Array(n);
  for (let q = 0; q < n; q++) { const k = W.k[q], i = k % R.nx, j = (k - i) / R.nx; blk[q] = (j >> 6) * bx + (i >> 6); start[blk[q] + 1]++; }
  for (let b = 0; b < nb; b++) start[b + 1] += start[b];
  const order = new Int32Array(n), fill = start.slice(0, nb);
  for (let q = 0; q < n; q++) order[fill[blk[q]]++] = q;
  return { start, order, bx };
}
export function buildRivers(scene) {
  const g = new THREE.Group(); g.name = 'rivers';
  const mat = new THREE.MeshStandardMaterial({ color: 0x0b3b52, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.86, depthWrite: false });
  patchStandard(mat, 'river-v1', {
    vertexDecl: 'varying vec2 vRV;', vertexMain: 'vRV=uv;',
    fragDecl: 'varying vec2 vRV;uniform float uTr;float fRough=.08,fMetal=0.;vec3 fEmit=vec3(0.);',
    fragMain: `float st=sin(vRV.y*.9-uTr*1.7+sin(vRV.x*5.+vRV.y*.13)*2.2)*.5+.5;diffuseColor.rgb+=vec3(.05,.13,.17)*smoothstep(.72,1.,st);diffuseColor.a*=smoothstep(1.,.78,abs(vRV.x));fEmit=vec3(.01,.03,.04)*st;`,
    uniforms: { uTr: timeUniform },
  });
  // a ribbon per stretch of a river, each about its first point (EV-04): a river runs hundreds of km, and its vertices near the camera as 32-bit
  // floats about one far point were 4-16 mm coarse (3 cm in world coordinates at Jeju)
  for (const R of riverPolys()) {
    const n = R.pts.length, CH = 6, alongAt = new Float64Array(n);
    for (let i = 1; i < n; i++) alongAt[i] = alongAt[i - 1] + Math.hypot(R.pts[i][0] - R.pts[i - 1][0], R.pts[i][1] - R.pts[i - 1][1]);
    for (let c0 = 0; c0 < n - 1; c0 += CH) {
      const c1 = Math.min(n - 1, c0 + CH), m = c1 - c0 + 1, pos = new Float32Array(m * 6), uv = new Float32Array(m * 4), nor = new Float32Array(m * 6), idx = [], ox = Math.round(R.pts[c0][0]), oz = Math.round(R.pts[c0][1]);
      for (let i = c0; i <= c1; i++) {
        const p = R.pts[i], a = R.pts[Math.max(0, i - 1)], b = R.pts[Math.min(n - 1, i + 1)], tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1, nx = -tz / l, nz = tx / l, hw = p[2] / 2 + 4, q = i - c0;
        pos.set([p[0] - ox + nx * hw, R.lv[i] + 0.03, p[1] - oz + nz * hw, p[0] - ox - nx * hw, R.lv[i] + 0.03, p[1] - oz - nz * hw], q * 6); uv.set([-1, alongAt[i] / 6, 1, alongAt[i] / 6], q * 4); nor[q * 6 + 1] = nor[q * 6 + 4] = 1;
        if (i < c1) { const k = q * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = -1; mesh.receiveShadow = false; mesh.position.set(ox, 0, oz); g.add(mesh);
    }
  }
  // a compiled region's inland water (the Han with its banks, lakes, reservoirs, streams): one mesh per 64 x 64 cells, a flat quad per water cell at
  // its level; the streaks run across the cells (uv.x = 0 keeps the ribbon's edge fade off)
  // a streamed region (EV-01) has no raster here: its water cells come as a list (R.inland, build/regtiles.mjs), in the raster's order
  const R = region(), B = R && !R.water ? inlandByBlock(R) : null;
  if (R) for (let cj = 0; cj < R.nz; cj += 64) for (let ci = 0; ci < R.nx; ci += 64) {
    // about the block's corner (EV-04), as the ribbons are; the streaks keep world coordinates (uv), which are exact in doubles here
    const pos = [], uv = [], idx = [], hg = R.g / 2, ox = Math.round(R.x0 + ci * R.g), oz = Math.round(R.z0 + cj * R.g);
    const quad = (k, lv) => {
      const i = k % R.nx, j = (k - i) / R.nx, x = R.x0 + i * R.g, z = R.z0 + j * R.g; if (regionWeight(x, z) < 0.5) return;
      const y = lv / 10 + 0.03, b = pos.length / 3;
      const lx = x - ox, lz = z - oz; pos.push(lx - hg, y, lz - hg, lx + hg, y, lz - hg, lx - hg, y, lz + hg, lx + hg, y, lz + hg);
      for (const [dx, dz] of [[-hg, -hg], [hg, -hg], [-hg, hg], [hg, hg]]) uv.push(0, (x + dx + z + dz) / 6);
      idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    };
    if (B) { const b = (cj >> 6) * B.bx + (ci >> 6); for (let p = B.start[b]; p < B.start[b + 1]; p++) { const q = B.order[p]; quad(R.inland.k[q], R.inland.level[q]); } }
    else for (let j = cj; j < Math.min(R.nz, cj + 64); j++) for (let i = ci; i < Math.min(R.nx, ci + 64); i++) { const k = j * R.nx + i; if (R.water[k] === 2) quad(k, R.level[k]); }
    if (!idx.length) continue;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, q) => (q % 3 === 1 ? 1 : 0)), 3)); geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat); m.renderOrder = -1; m.receiveShadow = false; m.name = 'region-water'; m.position.set(ox, 0, oz); g.add(m);
  }
  scene.add(g); return g;
}
