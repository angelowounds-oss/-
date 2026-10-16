import * as THREE from 'three';
import { farHeight, surfaceColor, cities, SEA, WORLD_HALF } from './worldmap.js';
import { baseHeight, EXTENT } from './terrain.js';
import { carve } from './roadnet.js';
import { patchStandard } from './shaders.js';
import { GR, grp } from './physics.js';

// The land outside the city: a geometry clipmap of the whole 100 x 100 km world (worldmap.js), a sea, markers for the cities, and a small
// physics ground (a Rapier heightfield) that follows the player or the vehicle he drives, so the land can be driven on and landed on.
//
// Clipmap: LEVELS rings of N x N cells, cell size 16 m * 2^k (16 m ... 4 km), each ring centred on the camera snapped to twice its cell size
// (so the grids of neighbouring levels line up) with the next finer ring's area left out. A skirt around the outer edge hides the cracks
// where a fine and a coarse ring meet. Heights, colours and normals are computed on the CPU when a ring's centre moves to a new snap.
// Inside the city's own terrain (|x|, |z| < EXTENT) the fragment shader discards: the city keeps its ground, lakes and roads.
// ADR-0012; the baked heightmap textures of phase 3 will take over the CPU work.
export const LEVELS = 9, GRID = 64, CELL0 = 16;
const cellOf = (k) => CELL0 * 2 ** k;
const NEAR_BLEND0 = 1400, NEAR_BLEND1 = 9000;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// world height outside the city: the city's own hills near the origin, the world's landscape from ~9 km on
export function landHeight(x, z, cell = 0) {
  const r = Math.hypot(x, z), w = smooth(NEAR_BLEND0, NEAR_BLEND1, r), f = farHeight(x, z, cell);
  return carve(x, z, w >= 1 ? f : baseHeight(x, z) * (1 - w) + f * w, false);
}
// the same for physics: bridges and tunnels are filled so a vehicle has ground on the deck / the road in the tunnel
export function physHeight(x, z, cell = 0) {
  const r = Math.hypot(x, z), w = smooth(NEAR_BLEND0, NEAR_BLEND1, r), f = farHeight(x, z, cell);
  return carve(x, z, w >= 1 ? f : baseHeight(x, z) * (1 - w) + f * w, true);
}

function ringIndex(skipHole) {
  const N = GRID, idx = [];
  const lo = N / 4, hi = N - N / 4;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (skipHole && i >= lo && i < hi && j >= lo && j < hi) continue;
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // skirt: a wall below the outer boundary (vertices N+1)^2 .. appended in build()
  const base = (N + 1) * (N + 1); let s = 0;
  const edge = [];
  for (let i = 0; i <= N; i++) edge.push(i);                                 // top row
  for (let j = 1; j <= N; j++) edge.push(j * (N + 1) + N);                  // right column
  for (let i = N - 1; i >= 0; i--) edge.push(N * (N + 1) + i);              // bottom row
  for (let j = N - 1; j >= 1; j--) edge.push(j * (N + 1));                  // left column
  for (let e = 0; e < edge.length; e++) { const p = edge[e], q = edge[(e + 1) % edge.length]; idx.push(p, base + e, q, q, base + e, base + (e + 1) % edge.length); s++; }
  return { idx: new Uint32Array(idx), skirt: edge };
}

const BUDGET_MS = 6;
export class Farland {
  constructor(scene, opts = {}) {
    this.scene = scene; this.group = new THREE.Group(); this.group.name = 'farland'; this.levels = []; this.levelCount = opts.levels || LEVELS;
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
    patchStandard(this.mat, 'farland-v1', {
      vertexDecl: 'varying vec2 vFW;', vertexMain: 'vFW=(modelMatrix*vec4(transformed,1.)).xz;',
      fragDecl: `varying vec2 vFW;float fRough=.96,fMetal=0.;vec3 fEmit=vec3(0.);`,
      fragMain: `if(abs(vFW.x)<${EXTENT.toFixed(1)}&&abs(vFW.y)<${EXTENT.toFixed(1)})discard;`,
    });
    const hole = ringIndex(true), full = ringIndex(false);
    for (let k = 0; k < this.levelCount; k++) {
      const N = GRID, nv = (N + 1) * (N + 1), sk = hole.skirt.length, total = nv + sk;
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setIndex(new THREE.BufferAttribute((k === 0 ? full : hole).idx, 1));
      const mesh = new THREE.Mesh(geo, this.mat); mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.renderOrder = -2 + k * 0.01; mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      this.levels.push({ k, cell: cellOf(k), geo, pos, nor, col, h: new Float32Array(nv), h2: new Float32Array(nv), cg: new Float32Array(nv * 3), cg2: new Float32Array(nv * 3), cx: NaN, cz: NaN, skirt: hole.skirt, nv, mesh });
    }
    // the sea: one big plane at sea level (the land rises out of it)
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x07253d, roughness: 0.22, metalness: 0.25 }));
    sea.rotation.x = -Math.PI / 2; sea.scale.set(500000, 500000, 1); sea.position.y = SEA; sea.renderOrder = -3; sea.frustumCulled = false; this.sea = sea; this.group.add(sea);
    this.markers = this.buildMarkers();
    scene.add(this.group);
    this.ground = new FarGround(opts.phys);
    this.stats = { regen: 0, ms: 0, last: 0, reused: 0, computed: 0 };
  }

  // a light pillar and a flat disc at each city: the cities themselves are the next phases, this shows where they will stand
  buildMarkers() {
    const g = new THREE.Group(), tall = new THREE.CylinderGeometry(20, 60, 1, 6, 1, true), mat = (c) => new THREE.MeshBasicMaterial({ color: new THREE.Color(...c).multiplyScalar(2.4), transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });
    for (const c of cities()) {
      if (c.fixed) continue;
      const col = c.type === 'port' ? [0.2, 0.7, 1] : c.type === 'airport' ? [1, 0.8, 0.2] : [1, 0.3, 0.8];
      const m = new THREE.Mesh(tall, mat(col)); m.scale.set(1, 2600, 1); m.position.set(c.x, c.y + 1300, c.z); m.frustumCulled = false; g.add(m);
      const d = new THREE.Mesh(new THREE.CircleGeometry(c.r, 40), new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.9 })); d.rotation.x = -Math.PI / 2; d.position.set(c.x, c.y + 0.4, c.z); g.add(d);
    }
    this.group.add(g); return g;
  }

  // ring `L` moves to the centre (ncx, ncz): vertices that stay in the ring are copied from where they were, only the new strip is computed
  regen(L, ncx, ncz) {
    const N = GRID, M = N + 1, cell = L.cell, x0 = ncx - (N / 2) * cell, z0 = ncz - (N / 2) * cell, { pos, nor, col } = L, tmp = [0, 0, 0];
    const first = Number.isNaN(L.cx), di = first ? 1e9 : Math.round((ncx - L.cx) / cell), dj = first ? 1e9 : Math.round((ncz - L.cz) / cell), reuse = Math.abs(di) <= N && Math.abs(dj) <= N;
    const h = L.h2, cg = L.cg2, oh = L.h, ocg = L.cg;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const k = j * M + i, oi = i + di, oj = j + dj;
      if (reuse && oi >= 0 && oi <= N && oj >= 0 && oj <= N) { const ok = oj * M + oi; h[k] = oh[ok]; cg[k * 3] = ocg[ok * 3]; cg[k * 3 + 1] = ocg[ok * 3 + 1]; cg[k * 3 + 2] = ocg[ok * 3 + 2]; this.stats.reused++; continue; }
      const x = x0 + i * cell, z = z0 + j * cell, y = landHeight(x, z, cell);
      h[k] = y; surfaceColor(x, z, y, tmp); cg[k * 3] = tmp[0]; cg[k * 3 + 1] = tmp[1]; cg[k * 3 + 2] = tmp[2]; this.stats.computed++;
    }
    L.h = h; L.h2 = oh; L.cg = cg; L.cg2 = ocg; L.cx = ncx; L.cz = ncz;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const k = j * M + i, y = h[k];
      pos[k * 3] = x0 + i * cell; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z0 + j * cell;
      const hl = h[j * M + Math.max(0, i - 1)], hr = h[j * M + Math.min(N, i + 1)], hu = h[Math.max(0, j - 1) * M + i], hd = h[Math.min(N, j + 1) * M + i];
      const nx = hl - hr, nz = hu - hd, ny = 2 * cell, l = Math.hypot(nx, ny, nz); nor[k * 3] = nx / l; nor[k * 3 + 1] = ny / l; nor[k * 3 + 2] = nz / l;
    }
    col.set(cg, 0);
    // skirt: the outer boundary again, dropped by a few cells
    const drop = Math.max(40, cell * 3);
    L.skirt.forEach((p, e) => { const o = (L.nv + e) * 3; pos[o] = pos[p * 3]; pos[o + 1] = pos[p * 3 + 1] - drop; pos[o + 2] = pos[p * 3 + 2]; nor[o] = nor[p * 3]; nor[o + 1] = nor[p * 3 + 1]; nor[o + 2] = nor[p * 3 + 2]; col[o] = col[p * 3]; col[o + 1] = col[p * 3 + 1]; col[o + 2] = col[p * 3 + 2]; });
    L.geo.attributes.position.needsUpdate = true; L.geo.attributes.normal.needsUpdate = true; L.geo.attributes.color.needsUpdate = true;
    L.mesh.updateMatrix(); this.stats.regen++;
  }

  update(camera, focus = camera.position) {
    const t0 = performance.now(), cx = camera.position.x, cz = camera.position.z;
    // hitch budget: after a jump (teleport, Mach 8) the levels catch up nearest first, a few ms per frame; the first fill is not budgeted
    for (const L of this.levels) {
      const s = 2 * L.cell, sx = Math.round(cx / s) * s, sz = Math.round(cz / s) * s;
      if (sx === L.cx && sz === L.cz) continue;
      if (!Number.isNaN(L.cx) && performance.now() - t0 > BUDGET_MS) break;
      this.regen(L, sx, sz);
    }
    this.sea.position.x = Math.round(cx / 5000) * 5000; this.sea.position.z = Math.round(cz / 5000) * 5000;
    this.ground.update(focus.x, focus.z, focus.by ?? focus.y ?? 0);   // physics follows what the player controls, not the (smoothed, late) camera
    this.stats.ms = performance.now() - t0; this.stats.last = this.stats.ms;
  }
  dispose() { this.scene.remove(this.group); this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); this.ground.dispose(); }
}

// Physics ground that follows the focus: a static Rapier heightfield (129 x 129 samples, 8 m) centred on the focus and rebuilt when it has moved
// 160 m. Under the city's own terrain the heights are -100 so it never competes with the city's colliders.
const HF = 128, HFC = 8, HFHALF = (HF * HFC) / 2;
export class FarGround {
  constructor(phys) { this.phys = phys; this.col = null; this.cx = NaN; this.cz = NaN; this.heights = new Float32Array((HF + 1) * (HF + 1)); }
  update(x, z, y = 0) {
    const P = this.phys; if (!P) return;
    const near = Math.abs(x) < EXTENT - HFHALF && Math.abs(z) < EXTENT - HFHALF;   // the whole patch would lie under the city's own ground
    if (near || y - physHeight(x, z, 64) > 250) { this.clear(); return; }   // high above the ground nothing needs it
    if (this.col && Math.hypot(x - this.cx, z - this.cz) < 160) return;
    this.clear();
    const cx = Math.round(x / HFC) * HFC, cz = Math.round(z / HFC) * HFC, R = P.R, hs = this.heights;
    // Rapier heightfield: nrows x ncols samples, column-major along z then x; scale = full extent
    for (let j = 0; j <= HF; j++) for (let i = 0; i <= HF; i++) {
      const wx = cx - HFHALF + i * HFC, wz = cz - HFHALF + j * HFC;
      hs[i * (HF + 1) + j] = (Math.abs(wx) < EXTENT + 8 && Math.abs(wz) < EXTENT + 8) ? -100 : physHeight(wx, wz, HFC);
    }
    const desc = R.ColliderDesc.heightfield(HF, HF, hs, { x: HF * HFC, y: 1, z: HF * HFC }).setTranslation(cx, 0, cz).setFriction(1.0).setRestitution(0).setCollisionGroups(grp(GR.STATIC, 0xffff));
    this.col = P.world.createCollider(desc); this.cx = cx; this.cz = cz;
  }
  clear() { if (this.col) { this.phys.world.removeCollider(this.col, false); this.col = null; this.cx = this.cz = NaN; } }
  dispose() { this.clear(); }
  // the ground height under (x, z) outside the city, for things that do not use the physics world (aircraft that crash into hills)
  static at(x, z) { return physHeight(x, z, 8); }
}
export { WORLD_HALF };
