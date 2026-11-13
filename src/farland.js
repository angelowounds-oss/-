import * as THREE from 'three';
import { regionWeight, regionStream } from './region.js';
import { surfaceColor, cities, SEA, WORLD_HALF } from './worldmap.js';
import { EXTENT } from './terrain.js';
import { landHeight, physHeight } from './landfn.js';
import { stream, colorAt } from './heightmap.js';
import { REG_REACH } from './regtile.js';
import { VIEW, hyp, hyp3 } from './util.js';
import { patchStandard, timeUniform } from './shaders.js';
import { GR, grp } from './physics.js';
import { LEVELS as SURF_LEVELS, lowestAround, surfVersion, changesSince } from './roadsurf.js';

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

export { landHeight, physHeight };

function ringIndex(skipHole) {
  const N = GRID, idx = [];
  const lo = N / 4, hi = N - N / 4;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (skipHole && i >= lo && i < hi && j >= lo && j < hi) continue;
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // skirt: a wall below the outer boundary (vertices N+1)^2 .. appended in build()
  const base = (N + 1) * (N + 1);
  const edge = [];
  for (let i = 0; i <= N; i++) edge.push(i);                                 // top row
  for (let j = 1; j <= N; j++) edge.push(j * (N + 1) + N);                  // right column
  for (let i = N - 1; i >= 0; i--) edge.push(N * (N + 1) + i);              // bottom row
  for (let j = N - 1; j >= 1; j--) edge.push(j * (N + 1));                  // left column
  for (let e = 0; e < edge.length; e++) { const p = edge[e], q = edge[(e + 1) % edge.length]; idx.push(p, base + e, q, q, base + e, base + (e + 1) % edge.length); }
  return { idx: new Uint32Array(idx), skirt: edge };
}

const BUDGET_MS = 6;
// how far a terrain vertex stays under the lowest road top around it, per ring (the 32 m ring is seen from 0.5-1 km, where depth is coarser)
const DROP = [0.12, 0.4];
export class Farland {
  constructor(scene, opts = {}) {
    this.scene = scene; this.group = new THREE.Group(); this.group.name = 'farland'; this.levels = []; this.levelCount = opts.levels || LEVELS;
    this.mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
    // the land's patterns are drawn in metres from uFO, a 64 km grid point near the camera (EV-04): in world metres the noise inputs reach 3.3 million
    // at Jeju, where a 32-bit float has a step of 0.25 and the fine grain turns to blocks. A ring's own vertices are about its centre and its centre
    // is a whole metre, so the ring's place less uFO is exact in 32 bits (the capital, within 32 km of 0, keeps its pattern)
    this.FO = { value: new THREE.Vector2() };
    patchStandard(this.mat, 'farland-v3', {
      vertexDecl: 'varying vec2 vFW;varying float vFY;varying float vFS;uniform vec2 uFO;', vertexMain: 'vFW=(modelMatrix[3].xz-uFO)+transformed.xz;vFY=(modelMatrix*vec4(transformed,1.)).y;vFS=objectNormal.y;',
      fragDecl: `varying vec2 vFW;varying float vFY;varying float vFS;uniform float uTf;uniform vec2 uFO;float fRough=.96,fMetal=0.,fBump=0.;vec3 fEmit=vec3(0.);
        float fh(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
        float fn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*f*(f*(f*6.-15.)+10.);return mix(mix(fh(i),fh(i+vec2(1,0)),f.x),mix(fh(i+vec2(0,1)),fh(i+vec2(1,1)),f.x),f.y);}`,
      fragMain: `if(abs(vFW.x+uFO.x)<${EXTENT.toFixed(1)}&&abs(vFW.y+uFO.y)<${EXTENT.toFixed(1)})discard;
        float fe=${SEA.toFixed(1)};float fw=sin(vFW.x*.045+vFW.y*.031+uTf*1.3)*.5+sin(vFW.x*.021-vFW.y*.05-uTf*.9)*.5;
        float foam=smoothstep(fe+1.5+fw*.35,fe+.1,vFY)*smoothstep(fe-.6,fe-.05,vFY);   /* the wet strip along a shore: a band of foam that breathes with the waves */
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.78,.86,.9),foam*.7);fRough=mix(.96,.35,foam);
        /* ground detail: the vertex colours are one value per 16 m, so up close the land would be a flat wash. Three scales of noise break it into patches
           and grain, blades streak the grass, steep slopes turn to banded rock; every layer fades with distance so far land stays calm (no shimmer) */
        float fd=length(vViewPosition),fnear=1.-smoothstep(30.,200.,fd),ffine=1.-smoothstep(12.,90.,fd),fmid=1.-smoothstep(300.,1800.,fd),fland=1.-foam;
        float n1=fn(vFW*.045),n2=fn(vFW*.31+7.),n3=fn(vFW*1.9+3.),n4=fn(vFW*7.3+11.);
        vec3 gc=diffuseColor.rgb;float green=smoothstep(.0,.06,gc.g-max(gc.r,gc.b)*.92);
        float tone=(n1-.5)*.3*fmid+(n2-.5)*.2*fmid+(n3-.5)*.07*fnear+(n4-.5)*.03*ffine;
        vec3 pat=mix(vec3(1.),mix(vec3(.9,1.04,.8),vec3(1.06,1.0,.86),n1),.5*fmid);   /* lush / dry patches */
        float blade=fn(vec2(vFW.x*11.,vFW.y*1.3)+n2*3.)*fn(vec2(vFW.x*1.3,vFW.y*11.)+n3*3.);
        diffuseColor.rgb=gc*pat*(1.+tone)*(1.+green*(blade-.25)*.12*ffine);
        float rock=smoothstep(.86,.7,vFS)*fland,strata=fn(vec2(vFW.x*.02+vFW.y*.015,vFY*.55))*.6+fn(vec2(vFW.x*.2+vFW.y*.17,vFY*2.3))*.4;
        vec3 rc=mix(vec3(.30,.28,.26),vec3(.52,.47,.41),strata)*(.8+n3*.4);
        diffuseColor.rgb=mix(diffuseColor.rgb,rc,rock*.85);fRough=mix(fRough,.99,rock);
        fBump=(n2*.5*fnear+n3*.25*fnear+n4*.1*ffine)*(1.+rock*2.5)*fland;`,
      normalMain: `{vec3 q0=dFdx(-vViewPosition),q1=dFdy(-vViewPosition);float dx=dFdx(fBump),dy=dFdy(fBump);vec3 r1=cross(q1,normal),r2=cross(normal,q0);float det=dot(q0,r1);
        normal=normalize(abs(det)*normal-.55*sign(det)*(dx*r1+dy*r2));}`,
      uniforms: { uTf: timeUniform, uFO: this.FO },
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
    // the sea: one big plane at sea level (the land rises out of it), in 64 x 64 squares (8 km): as two 500 km triangles, the depth of the one clipped
    // at the camera went wrong where the camera stood near their shared diagonal, and the sea was drawn over the roads (Mapo, 2026-11-06)
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 64, 64), new THREE.MeshStandardMaterial({ color: 0x07253d, roughness: 0.22, metalness: 0.25 }));
    sea.rotation.x = -Math.PI / 2; sea.scale.set(Math.max(500000, 2.4 * WORLD_HALF), Math.max(500000, 2.4 * WORLD_HALF), 1); sea.position.y = SEA; sea.renderOrder = -3; sea.frustumCulled = false; this.sea = sea; this.group.add(sea);
    this.markers = opts.markers === false ? null : this.buildMarkers();
    scene.add(this.group);
    this.ground = new FarGround(opts.phys);
    this.stats = { regen: 0, ms: 0, last: 0, reused: 0, computed: 0, lowered: 0, surfMs: 0 }; this.surfV = 0;
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
    const N = GRID, M = N + 1, cell = L.cell, x0 = ncx - (N / 2) * cell, z0 = ncz - (N / 2) * cell, { col } = L, tmp = [0, 0, 0];
    const first = Number.isNaN(L.cx), di = first ? 1e9 : Math.round((ncx - L.cx) / cell), dj = first ? 1e9 : Math.round((ncz - L.cz) / cell), reuse = Math.abs(di) <= N && Math.abs(dj) <= N;
    const h = L.h2, cg = L.cg2, oh = L.h, ocg = L.cg;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const k = j * M + i, oi = i + di, oj = j + dj;
      if (reuse && oi >= 0 && oi <= N && oj >= 0 && oj <= N) { const ok = oj * M + oi; h[k] = oh[ok]; cg[k * 3] = ocg[ok * 3]; cg[k * 3 + 1] = ocg[ok * 3 + 1]; cg[k * 3 + 2] = ocg[ok * 3 + 2]; this.stats.reused++; continue; }
      const x = x0 + i * cell, z = z0 + j * cell, y = landHeight(x, z, cell);
      h[k] = y; if (!((cell <= 32 || regionWeight(x, z) > 0) && colorAt(x, z, tmp))) surfaceColor(x, z, y, tmp); cg[k * 3] = tmp[0]; cg[k * 3 + 1] = tmp[1]; cg[k * 3 + 2] = tmp[2]; this.stats.computed++;
    }
    L.h = h; L.h2 = oh; L.cg = cg; L.cg2 = ocg; L.cx = ncx; L.cz = ncz;
    col.set(cg, 0);
    this.shape(L, 0, 0, N, N);
    L.mesh.position.set(ncx, 0, ncz); L.mesh.updateMatrix(); this.stats.regen++;
  }
  // the drawn heights and normals of ring L's vertices i0..i1 x j0..j1 (and the skirt): the land's height, but in the finest rings never above a
  // drawn road around the vertex less DROP (roadsurf.js: with every vertex of a triangle under the lowest road top in it, no part of the triangle
  // rises through the asphalt). The raw heights in L.h stay as they are, so a road that is dropped lets the land come back.
  shape(L, i0, j0, i1, j1) {
    const N = GRID, M = N + 1, cell = L.cell, x0 = L.cx - (N / 2) * cell, z0 = L.cz - (N / 2) * cell, { pos, nor, col, h } = L, clamp = L.k < SURF_LEVELS;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * M + i, x = x0 + i * cell, z = z0 + j * cell; let y = h[k];
      if (clamp) { const t = lowestAround(L.k, x, z); if (t === t && t - DROP[L.k] < y) { y = t - DROP[L.k]; this.stats.lowered++; } }
      pos[k * 3] = x - L.cx; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z - L.cz;   // about the ring's centre (EV-04)
    }
    const Y = (i, j) => pos[(j * M + i) * 3 + 1];
    for (let j = Math.max(0, j0 - 1); j <= Math.min(N, j1 + 1); j++) for (let i = Math.max(0, i0 - 1); i <= Math.min(N, i1 + 1); i++) {
      const k = j * M + i, nx = Y(Math.max(0, i - 1), j) - Y(Math.min(N, i + 1), j), nz = Y(i, Math.max(0, j - 1)) - Y(i, Math.min(N, j + 1)), ny = 2 * cell, l = hyp3(nx, ny, nz);
      nor[k * 3] = nx / l; nor[k * 3 + 1] = ny / l; nor[k * 3 + 2] = nz / l;
    }
    // skirt: the outer boundary again, dropped by a few cells
    const drop = Math.max(40, cell * 3);
    L.skirt.forEach((p, e) => { const o = (L.nv + e) * 3; pos[o] = pos[p * 3]; pos[o + 1] = pos[p * 3 + 1] - drop; pos[o + 2] = pos[p * 3 + 2]; nor[o] = nor[p * 3]; nor[o + 1] = nor[p * 3 + 1]; nor[o + 2] = nor[p * 3 + 2]; col[o] = col[p * 3]; col[o + 1] = col[p * 3 + 1]; col[o + 2] = col[p * 3 + 2]; });
    L.geo.attributes.position.needsUpdate = true; L.geo.attributes.normal.needsUpdate = true; L.geo.attributes.color.needsUpdate = true;
  }
  // roads registered or dropped since the last look (roadsurf.js): the finest rings take the changed areas again, within the frame's budget
  roadsChanged(t0) {
    const v = surfVersion(); if (v === this.surfV) return;
    const ch = changesSince(this.surfV ?? 0);
    for (const L of this.levels) {
      if (L.k >= SURF_LEVELS || Number.isNaN(L.cx)) continue;
      const N = GRID, cell = L.cell, x0 = L.cx - (N / 2) * cell, z0 = L.cz - (N / 2) * cell;
      if (!ch) { this.shape(L, 0, 0, N, N); continue; }
      for (const c of ch) {
        const i0 = Math.max(0, Math.floor((c.x0 - x0) / cell)), i1 = Math.min(N, Math.ceil((c.x1 - x0) / cell) + 1), j0 = Math.max(0, Math.floor((c.z0 - z0) / cell)), j1 = Math.min(N, Math.ceil((c.z1 - z0) / cell) + 1);
        if (i0 <= i1 && j0 <= j1) this.shape(L, i0, j0, i1, j1);
      }
    }
    this.surfV = v; this.stats.surfMs = performance.now() - t0;
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
    this.roadsChanged(performance.now());
    this.FO.value.set(Math.round(cx / 65536) * 65536, Math.round(cz / 65536) * 65536);
    if (globalThis.__WORLD) stream(globalThis.__WORLD, focus.x, focus.z);   // high-detail ground tiles around what the player controls
    regionStream([focus, camera.position], REG_REACH * VIEW.b);   // the compiled regions' raster tiles around both (EV-01)
    this.sea.position.x = Math.round(cx / 5000) * 5000; this.sea.position.z = Math.round(cz / 5000) * 5000;
    this.ground.update(focus.x, focus.z, focus.by ?? focus.y ?? 0);   // physics follows what the player controls, not the (smoothed, late) camera
    this.stats.ms = performance.now() - t0; this.stats.last = this.stats.ms;
  }
  dispose() { this.scene.remove(this.group); this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); this.ground.dispose(); }
}

// Physics ground that follows the focus: a static Rapier heightfield (129 x 129 samples, 8 m) centred on the focus and rebuilt when it has moved
// 160 m. Under the city's own terrain the heights are -100 so it never competes with the city's colliders.
const HF = 128, HFC = 8, HFHALF = (HF * HFC) / 2;
if (typeof window !== 'undefined') window.__farHeights = { physHeight, landHeight };   // test hook
export class FarGround {
  constructor(phys) { this.phys = phys; this.col = null; this.cx = NaN; this.cz = NaN; this.heights = new Float32Array((HF + 1) * (HF + 1)); }
  update(x, z, y = 0) {
    const P = this.phys; if (!P) return;
    if (this.suspend) { this.clear(); return; }   // a ride (transit.js) moves faster than the tile can be rebuilt, and needs no ground
    const near = Math.abs(x) < EXTENT - HFHALF && Math.abs(z) < EXTENT - HFHALF;   // the whole patch would lie under the city's own ground
    if (near || y - physHeight(x, z, 64) > 250) { this.clear(); return; }   // high above the ground nothing needs it
    if (this.col && hyp(x - this.cx, z - this.cz) < 160) return;
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
