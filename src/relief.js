import * as THREE from 'three';
import { mulberry32 } from './util.js';

// Facade relief (RND-06): real geometry on the outside of every city building, so a wall is no longer a flat painted box. Every piece is a
// box instance of ONE InstancedMesh (one draw call, packed by distance like the other static instances, instCull), shaded by the normal
// lighting and shadow pass - the ledges throw shadows onto the wall below them, which is most of what makes the facade read as a volume:
//   plinth        a dark stone base band around the ground floor
//   slab ledges   one projecting edge per floor (podium and tower)
//   corner piers  full-height columns on the tower corners, standing proud of both walls
//   mid piers     pilasters on every second bay of wide faces of some styles
//   cornice       a heavy crown moulding at the top of tower and crown, with a parapet wall above it
//   podium roof   parapet around the roof of the podium where the tower is set back
// Floor lines use the same floor heights as building.js (FH 4 m) so the ledges sit where the real floors are. Nothing here is solid
// (bullets and people pass through the 0.3 m projections).
const FH = 4.0;
const REACH = 190;   // metres: beyond this the facade texture and its shader shading carry the look
const CAP = 22000;   // upper bound on instances for the city; per-floor ledges thin out to every 2nd/3rd floor beyond it

export function buildRelief(world, scene, instCull, tiers) {
  const lots = world.lots.filter((l) => l.tierIdx != null && !l.far && !l.model && l.tiers);
  const rnd = mulberry32(5150);
  const M = [], C = [], ranges = new Map();
  const col = new THREE.Color(), tmp = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
  let total = 0;
  // estimate the per-floor ledge count to pick the step (1 = every floor)
  let est = 0;
  for (const l of lots) { const t = l.tiers; est += 4 * (Math.max(1, Math.round(t.podium.y1 / FH)) + Math.max(2, Math.floor((t.tower.y1 - t.tower.y0) / FH))); }
  const step = est > CAP * 0.8 ? 2 : 1;
  const push = (x0, y0, z0, x1, y1, z1, c, k = 1) => {
    if (!(x1 - x0 > 0.01 && y1 - y0 > 0.01 && z1 - z0 > 0.01)) return;   // no degenerate boxes
    sc.set(x1 - x0, y1 - y0, z1 - z0); ps.set((x0 + x1) / 2, y0, (z0 + z1) / 2);   // the unit box stands on y = 0
    tmp.compose(ps, q, sc); M.push(tmp.toArray()); col.copy(c).multiplyScalar(k); C.push(col.r, col.g, col.b); total++;
  };
  const base = new THREE.Color();
  for (const l of lots) {
    const t = l.tiers, ti = tiers[l.tierIdx], tcol = ti ? ti.color : base.set(0x808080);
    const start = M.length;
    const stone = new THREE.Color().copy(tcol).multiplyScalar(0.55).lerp(base.set(0x55524f), 0.45);
    const trim = new THREE.Color().copy(tcol).multiplyScalar(0.92).lerp(base.set(0xb8b2a8), 0.35);
    const style = l.style | 0, wide = (r) => Math.max(r.x1 - r.x0, r.z1 - r.z0);
    const d = l.door, doorSide = d ? d.side : '';
    // a ring of boxes around a rectangle at height y (projection p, thickness h); skip the door side where asked
    const ring = (r, y, h, p, c, skipSide = '') => {
      if (skipSide !== 'w') push(r.x0 - p, y, r.z0 - p, r.x0, y + h, r.z1 + p, c);
      if (skipSide !== 'e') push(r.x1, y, r.z0 - p, r.x1 + p, y + h, r.z1 + p, c);
      if (skipSide !== 'n') push(r.x0, y, r.z0 - p, r.x1, y + h, r.z0, c);
      if (skipSide !== 's') push(r.x0, y, r.z1, r.x1, y + h, r.z1 + p, c);
    };
    // a parapet wall: thickness t standing just inside the edge of the rectangle (a ring with zero projection would be a zero-width box:
    // a singular normal matrix gives NaN pixels that the bloom spreads over the whole frame)
    const wall = (r, y, h, tk, c) => {
      push(r.x0, y, r.z0, r.x0 + tk, y + h, r.z1, c); push(r.x1 - tk, y, r.z0, r.x1, y + h, r.z1, c);
      push(r.x0 + tk, y, r.z0, r.x1 - tk, y + h, r.z0 + tk, c); push(r.x0 + tk, y, r.z1 - tk, r.x1 - tk, y + h, r.z1, c);
    };
    const pod = t.podium, tow = t.tower, cr = t.crown;
    // plinth (door side open, the entrance stands there)
    ring(pod, 0, 0.9, 0.22, stone, doorSide);
    // podium ledges
    const np = Math.max(1, Math.round(pod.y1 / FH)), fhp = pod.y1 / np;
    for (let k = 1; k < np; k += step) { ring(pod, k * fhp - 0.34, 0.34, 0.46, trim, k === 1 ? doorSide : ''); }
    // podium top: heavy cornice + parapet
    ring(pod, pod.y1 - 0.55, 0.55, 0.55, trim); wall(pod, pod.y1, 1.0, 0.3, stone);
    // tower
    const nt = Math.max(2, Math.floor((tow.y1 - tow.y0) / FH)), fht = (tow.y1 - tow.y0) / nt;
    for (let k = 1; k < nt; k += step) { { ring(tow, tow.y0 + k * fht - 0.32, 0.32, 0.42, trim); } }
    // corner piers: full height, standing proud of both walls
    const ph = tow.y1 - tow.y0, pw = style === 3 ? 0.45 : 0.8, pp = 0.32;
    for (const [cx, cz] of [[tow.x0, tow.z0], [tow.x1, tow.z0], [tow.x0, tow.z1], [tow.x1, tow.z1]]) {
      const sx = cx === tow.x0 ? -1 : 1, sz = cz === tow.z0 ? -1 : 1, inn = pw - pp;
      push(sx < 0 ? cx - pp : cx - inn, tow.y0, sz < 0 ? cz - pp : cz - inn, sx < 0 ? cx + inn : cx + pp, tow.y1, sz < 0 ? cz + inn : cz + pp, stone, 0.95);
    }
    // pilasters on some styles' wide faces
    if (style === 0 || style === 2) {
      const bay = 7.5;
      for (const side of ['n', 's', 'w', 'e']) {
        const alongX = side === 'n' || side === 's', len = alongX ? tow.x1 - tow.x0 : tow.z1 - tow.z0, n = Math.floor(len / bay);
        if (n < 3) continue;
        for (let i = 1; i < n; i++) {
          const u = (alongX ? tow.x0 : tow.z0) + (i / n) * len, w = 0.4;
          if (alongX) { const z = side === 'n' ? tow.z0 : tow.z1, o = side === 'n' ? -0.22 : 0.22; push(u - w / 2, tow.y0, Math.min(z, z + o), u + w / 2, tow.y1 - 0.4, Math.max(z, z + o), trim, 0.95); }
          else { const x = side === 'w' ? tow.x0 : tow.x1, o = side === 'w' ? -0.22 : 0.22; push(Math.min(x, x + o), tow.y0, u - w / 2, Math.max(x, x + o), tow.y1 - 0.4, u + w / 2, trim, 0.95); }
        }
      }
    }
    // the set-back between podium and tower: a thin ledge at the foot of the tower and the cornice + parapet at the top
    ring(tow, tow.y0, 0.35, 0.22, stone);
    ring(tow, tow.y1 - 0.8, 0.8, 0.7, trim); wall(tow, tow.y1, 1.1, 0.3, stone);
    // crown block
    if (cr) {
      const nc = Math.max(1, Math.round((cr.y1 - cr.y0) / FH)), fhc = (cr.y1 - cr.y0) / nc;
      for (let k = 1; k < nc; k += step) { ring(cr, cr.y0 + k * fhc - 0.3, 0.3, 0.38, trim); }
      ring(cr, cr.y1 - 0.7, 0.7, 0.55, trim); wall(cr, cr.y1, 0.9, 0.3, stone);
    }
    ranges.set(l, [start, M.length]);
    void rnd;
  }
  const n = M.length;
  if (!n) return null;
  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0.02 });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const mat0 = new Float32Array(n * 16), cols = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { mat0.set(M[i], i * 16); mesh.setMatrixAt(i, tmp.fromArray(M[i])); }
  cols.set(C);
  for (let i = 0; i < n; i++) mesh.setColorAt(i, col.setRGB(cols[i * 3], cols[i * 3 + 1], cols[i * 3 + 2]));
  mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
  // no shadow casting: a second draw of every ledge in the shadow pass doubled the cost, and the soft occlusion under each floor line is
  // painted by the facade shader (vFl) anyway
  mesh.castShadow = false; mesh.receiveShadow = true; mesh.frustumCulled = false;
  scene.add(mesh); instCull.add(mesh);
  if (mesh.userData.packed) mesh.userData.packed.maxCut = REACH;
  const rel = { mesh, ranges, mat0, count: n, step };
  // blaze.js: hide a lot's relief (collapse) / put it back (rebuild) / sink it during the collapse
  rel.packed = () => mesh.userData.packed;
  rel.set = (lot, fn) => {
    const r = ranges.get(lot), p = rel.packed(); if (!r || !p) return;
    for (let i = r[0]; i < r[1]; i++) fn(i, p);
  };
  rel.hide = (lot) => rel.set(lot, (i, p) => p.setMatrix(i, ZERO));
  rel.show = (lot) => rel.set(lot, (i, p) => p.setMatrix(i, mat0.subarray(i * 16, i * 16 + 16)));
  const A = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), out = new Float32Array(16);
  // e2: 0..1 collapse progress (eased); the pieces sink with the facade and shrink to nothing
  rel.sink = (lot, e2, floorY) => rel.set(lot, (i, p) => {
    A.fromArray(mat0, i * 16).decompose(P, Q, S);
    P.y += (floorY - P.y) * e2; const k = Math.max(0.001, 1 - e2); S.set(S.x * (0.4 + 0.6 * k), S.y * k, S.z * (0.4 + 0.6 * k));
    A.compose(P, Q, S).toArray(out); p.setMatrix(i, out);
  });
  world.relief = rel;
  return rel;
}
const ZERO = new Float32Array(16);
