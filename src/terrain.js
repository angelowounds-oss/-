import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GR, grp } from './physics.js';
import { mulberry32, TAU } from './util.js';

// Hill rim around the flat city (Busan-style hillside districts: a mountain road that winds along the slope at changing altitude).
// The city grid inside r < R0 is untouched. Outside it the ground rises into ridges; a winding "mountain road" loop and four
// access roads from the city edge are carved into the slope. Everything here is deterministic and shared by render + physics.
export const R0 = 1060, R_WALL = 1470, CELL = 10, EXTENT = 1500, INNER = 1000;
const ROAD_W = 11;

const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const vnoise = (x, y) => {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return (hash(ix, iy) * (1 - ux) + hash(ix + 1, iy) * ux) * (1 - uy) + (hash(ix, iy + 1) * (1 - ux) + hash(ix + 1, iy + 1) * ux) * uy;
};
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// terrain without roads
function baseHeight(x, z) {
  const r = Math.hypot(x, z);
  const s = smooth(R0, R0 + 190, r), hi = smooth(1180, 1460, r);
  const ridge = 0.55 + 0.9 * vnoise(x * 0.0042 + 3.1, z * 0.0042 - 1.7), detail = vnoise(x * 0.013, z * 0.013);
  return s * ((18 + 78 * hi) * ridge + 9 * detail);
}

// ---------- road network: closed mountain loop + 4 access roads, sampled every ~8 m ----------
const roads = [];
function buildRoads() {
  const loop = [], N = 900;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU, r = 1262 + 52 * Math.sin(3 * a + 0.7) + 28 * Math.sin(7 * a + 2.1) + 14 * Math.sin(13 * a);
    loop.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, a });
  }
  // altitude: follow the slope but smooth along the road so the grade stays drivable
  let y = loop.map((p) => 12 + 0.55 * baseHeight(p.x, p.z) + 4);
  for (let it = 0; it < 6; it++) y = y.map((_, i) => { let s = 0; for (let k = -10; k <= 10; k++) s += y[(i + k + N) % N]; return s / 21; });
  loop.forEach((p, i) => (p.y = y[i]));
  roads.push({ pts: loop, closed: true });
  // access roads from the flat city edge up to the loop, bending on the way
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2, pts = [], target = loop.reduce((b, p) => (Math.abs(((p.a - a + Math.PI * 3) % TAU) - Math.PI) < Math.abs(((b.a - a + Math.PI * 3) % TAU) - Math.PI) ? p : b), loop[0]);
    const tr = Math.hypot(target.x, target.z), tA = Math.atan2(target.z, target.x), n = 60;
    for (let i = 0; i <= n; i++) {
      const t = i / n, r = 1010 + (tr - 1010) * t, ang = a + (tA - a) * t + 0.09 * Math.sin(t * TAU * 1.5) * (1 - t * 0.3);
      pts.push({ x: Math.cos(ang) * r, z: Math.sin(ang) * r, y: target.y * smooth(0, 1, t) * smooth(0, 1, t * 1.25), a: ang });
    }
    roads.push({ pts, closed: false });
  }
  // spatial hash of dense road samples for fast nearest queries
  const dense = [];
  for (const rd of roads) {
    const P = rd.pts, n = P.length;
    for (let i = 0; i < (rd.closed ? n : n - 1); i++) {
      const A = P[i], B = P[(i + 1) % n], seg = Math.hypot(B.x - A.x, B.z - A.z), steps = Math.max(1, Math.ceil(seg / 6));
      for (let s = 0; s < steps; s++) { const t = s / steps; dense.push({ x: A.x + (B.x - A.x) * t, z: A.z + (B.z - A.z) * t, y: A.y + (B.y - A.y) * t }); }
    }
  }
  const G = new Map(), CS = 40;
  for (const p of dense) { const key = Math.floor(p.x / CS) + ',' + Math.floor(p.z / CS); (G.get(key) || G.set(key, []).get(key)).push(p); }
  return { dense, G, CS };
}
let RD = null;
function nearestRoad(x, z) {
  RD = RD || (RD = buildRoads());
  const { G, CS } = RD, cx = Math.floor(x / CS), cz = Math.floor(z / CS);
  let best = null, bd = 1e9;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const c = G.get(cx + i + ',' + (cz + j)); if (!c) continue;
    for (const p of c) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < bd) { bd = d; best = p; } }
  }
  return best ? { d: Math.sqrt(bd), y: best.y } : null;
}
export function roadsData() { RD = RD || (RD = buildRoads()); return roads; }

export function heightAt(x, z) {
  if (Math.abs(x) < INNER && Math.abs(z) < INNER) return 0;
  let h = baseHeight(x, z);
  if (Math.hypot(x, z) < R0 - 60) return 0;
  const rd = nearestRoad(x, z);
  if (rd) { const w = 1 - smooth(8, 26, rd.d); h = h * (1 - w) + rd.y * w; }
  return Math.max(0, h);
}

// ---------- geometry: four strips around the inner square, shared by render and physics ----------
function stripGeo(x0, z0, x1, z1) {
  const nx = Math.round((x1 - x0) / CELL), nz = Math.round((z1 - z0) / CELL), pos = new Float32Array((nx + 1) * (nz + 1) * 3), col = new Float32Array((nx + 1) * (nz + 1) * 3);
  const idx = new Uint32Array(nx * nz * 6);
  const H = new Float32Array((nx + 1) * (nz + 1));
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) { const x = x0 + i * CELL, z = z0 + j * CELL, k = j * (nx + 1) + i; H[k] = heightAt(x, z); pos.set([x, H[k], z], k * 3); }
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const k = j * (nx + 1) + i, hx = H[j * (nx + 1) + Math.min(nx, i + 1)] - H[j * (nx + 1) + Math.max(0, i - 1)], hz = H[Math.min(nz, j + 1) * (nx + 1) + i] - H[Math.max(0, j - 1) * (nx + 1) + i];
    const slope = Math.min(1, Math.hypot(hx, hz) / (2 * CELL) * 1.6), h = H[k], x = pos[k * 3], z = pos[k * 3 + 2], n = vnoise(x * 0.05, z * 0.05);
    const low = [0.03, 0.032, 0.04], grass = [0.025 + n * 0.02, 0.06 + n * 0.035, 0.035], rock = [0.09 + n * 0.03, 0.082 + n * 0.03, 0.075];
    const g = Math.min(1, h / 6), r = Math.min(1, slope * 1.3 + Math.max(0, (h - 55) / 40));
    for (let c = 0; c < 3; c++) col[k * 3 + c] = (low[c] * (1 - g) + grass[c] * g) * (1 - r) + rock[c] * r;
  }
  let t = 0;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
    idx.set([a, c, b, b, c, d], t); t += 6;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}
const STRIPS = [[-EXTENT, -EXTENT, EXTENT, -INNER], [-EXTENT, INNER, EXTENT, EXTENT], [-EXTENT, -INNER, -INNER, INNER], [INNER, -INNER, EXTENT, INNER]];

export function addTerrainPhysics(phys) {
  const R = phys.R, w = phys.world;
  for (const s of STRIPS) {
    const g = stripGeo(...s);
    w.createCollider(R.ColliderDesc.trimesh(new Float32Array(g.attributes.position.array), new Uint32Array(g.index.array)).setFriction(1).setCollisionGroups(grp(GR.STATIC, 0xffff)));
    g.dispose();
  }
}

export function buildTerrain(scene) {
  const group = new THREE.Group(); group.name = 'terrain';
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0, envMapIntensity: 0.35 });
  for (const s of STRIPS) { const m = new THREE.Mesh(stripGeo(...s), mat); m.receiveShadow = false; m.castShadow = false; m.geometry.computeBoundingSphere(); group.add(m); }
  // road ribbons (asphalt with a dashed centre line and edge lines), slightly above the terrain
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128; const g2 = cv.getContext('2d');
  g2.fillStyle = '#17181d'; g2.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 700; i++) { g2.fillStyle = `rgba(${40 + Math.random() * 30},${40 + Math.random() * 30},${44 + Math.random() * 30},${Math.random() * 0.25})`; g2.fillRect(Math.random() * 64, Math.random() * 128, 2, 2); }
  g2.fillStyle = '#d8b32a'; g2.fillRect(31, 0, 2, 64); g2.fillStyle = '#c9c9c9'; g2.fillRect(3, 0, 2, 128); g2.fillRect(59, 0, 2, 128);
  const tex = new THREE.CanvasTexture(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const rmat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const geos = [];
  for (const rd of roadsData()) {
    const P = rd.pts, n = P.length, pos = [], uv = [], ind = []; let dist = 0;
    for (let i = 0; i < (rd.closed ? n + 1 : n); i++) {
      const A = P[i % n], B = P[(i + 1) % n], Z = P[(i - 1 + n) % n];
      let dx = (rd.closed || i < n - 1 ? B.x : A.x) - (rd.closed || i > 0 ? Z.x : A.x), dz = (rd.closed || i < n - 1 ? B.z : A.z) - (rd.closed || i > 0 ? Z.z : A.z); const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const nx = -dz * ROAD_W / 2, nz = dx * ROAD_W / 2;
      if (i > 0) dist += Math.hypot(A.x - P[(i - 1) % n].x, A.z - P[(i - 1) % n].z);
      pos.push(A.x + nx, A.y + 0.05, A.z + nz, A.x - nx, A.y + 0.05, A.z - nz); uv.push(0, dist / 8, 1, dist / 8);
      if (i > 0) { const k = (i - 1) * 2; ind.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ind); g.computeVertexNormals();
    // normals must point up regardless of winding
    const nrm = g.attributes.normal; for (let i = 0; i < nrm.count; i++) if (nrm.getY(i) < 0) { nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i)); }
    geos.push(g);
  }
  const road = new THREE.Mesh(mergeGeometries(geos), rmat); road.frustumCulled = false; road.receiveShadow = true; group.add(road);
  // trees on the slopes (one instanced mesh)
  const tg = mergeGeometries([new THREE.CylinderGeometry(0.25, 0.35, 2.2, 5).translate(0, 1.1, 0), new THREE.ConeGeometry(2.2, 6, 6).translate(0, 5, 0), new THREE.ConeGeometry(1.6, 4.5, 6).translate(0, 8, 0)].map((g) => g.toNonIndexed()));
  const tm = new THREE.MeshStandardMaterial({ color: 0x1c4a30, roughness: 0.9, emissive: 0x06150c, emissiveIntensity: 0.5 });
  const rr = mulberry32(777), spots = [];
  for (let tries = 0; spots.length < 2400 && tries < 20000; tries++) {
    const a = rr() * TAU, r = R0 + 20 + rr() * 400, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) > EXTENT - 20 || Math.abs(z) > EXTENT - 20) continue;
    const rd = nearestRoad(x, z); if (rd && rd.d < 16) continue;
    const h = heightAt(x, z); if (h < 2) continue;
    spots.push([x, h, z, 0.8 + rr() * 1.1]);
  }
  const im = new THREE.InstancedMesh(tg, tm, spots.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  spots.forEach((s, i) => { sc.set(s[3], s[3] * (0.9 + rr() * 0.4), s[3]); m4.compose(new THREE.Vector3(s[0], s[1] - 0.2, s[2]), q, sc); im.setMatrixAt(i, m4); });
  im.castShadow = false; im.frustumCulled = false; group.add(im);
  scene.add(group);
  return { group, trees: spots.length };
}
