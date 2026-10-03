// Parametric generator for the v2 tunnel parts. Everything is derived from src/engine/09-tunnel-spec.js (evaluated here as plain JS).
import fs from 'node:fs'; import path from 'node:path';
import { Mesh, sub, add, mul, dot, cross, norm, len } from './glb.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
export const SPEC = new Function(fs.readFileSync(path.join(root, 'src/engine/09-tunnel-spec.js'), 'utf8') + ';return TUNNEL_SPEC')();
const D = SPEC.derived;

// materials: engine surface names (src/engine/20-scene-assets.js materialLibrary, plus the v2 additions registered by the loader)
export const MATERIALS = [
  { name: 'PlenumPaint', base: [.62, .64, .66, 1], metallic: 0, roughness: .62 },
  { name: 'ConcreteFloor', base: [.30, .31, .32, 1], metallic: 0, roughness: .78 },
  { name: 'AbsorberFoam', base: [.055, .058, .062, 1], metallic: 0, roughness: .97 },
  { name: 'GalvanizedSteel', base: [.50, .53, .56, 1], metallic: .85, roughness: .42 },
  { name: 'NozzleOuter', base: [.74, .76, .78, 1], metallic: 0, roughness: .45 },
  { name: 'TurntableSteel', base: [.42, .44, .47, 1], metallic: .9, roughness: .38 },
  { name: 'BlackPowderCoat', base: [.07, .08, .09, 1], metallic: 0, roughness: .67 },
  { name: 'AcousticGlass', base: [.35, .45, .5, 1], metallic: 0, roughness: .08 },
  { name: 'PlenumLight', base: [.95, .96, 1, 1], metallic: 0, roughness: .2 },
  { name: 'SafetyYellow', base: [.9, .68, .08, 1], metallic: 0, roughness: .43 }
];

const smooth = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);

// rounded-rectangle loop in the (z,y) plane at a given x: bottom edge on the floor (y=0, square bottom corners), top corners rounded with radius r.
// M points, counter-clockwise seen from +X; same point count for every section so sections can be lofted.
function rrLoop(x, hw, h, r, K = 8, y0 = 0) {
  const pts = [], arc = (cz, cy, a0) => { for (let k = 0; k <= K; k++) { const a = a0 + (Math.PI / 2) * k / K; pts.push([x, cy + r * Math.sin(a), cz + r * Math.cos(a)]); } };
  // start bottom-right corner, go up the right side, round the top-right, across the top, round the top-left, down the left side
  pts.push([x, y0, hw]);                       // bottom right (square)
  arc(hw - r, h - r, 0);                        // top-right arc: angle 0 .. 90
  arc(-hw + r, h - r, Math.PI / 2);             // top-left arc: 90 .. 180
  pts.push([x, y0, -hw]);                       // bottom left (square)
  return pts;
}

// ---------- plenum shell: floor with a circular turntable hole, walls with openings, ceiling ----------
function floorMesh() {
  const S = SPEC, p = S.plenum, t = S.turntable, m = new Mesh('AETHER_TUNNEL_FLOOR', 'ConcreteFloor', { category: 'tunnel floor', role: 'static', solid: false });
  const up = [0, 10, 0], N = 96, R = t.r + t.gap, H = t.squareHalf;
  // circle -> square ring (radial correspondence), so the round turntable sits in a square floor module
  const circ = [], sq = [];
  for (let i = 0; i <= N; i++) {
    const a = i / N * 2 * Math.PI, c = Math.cos(a), s = Math.sin(a), k = Math.max(Math.abs(c), Math.abs(s));
    circ.push([R * c, 0, R * s]); sq.push([H * c / k, 0, H * s / k]);
  }
  for (let i = 0; i < N; i++) m.quad(circ[i], circ[i + 1], sq[i + 1], sq[i], { toward: up });
  // the rest of the floor: four rectangles around the square module
  const x0 = p.x0, x1 = p.x1, z0 = -p.zh, z1 = p.zh;
  m.quad([x0, 0, z0], [-H, 0, z0], [-H, 0, z1], [x0, 0, z1], { toward: up });
  m.quad([H, 0, z0], [x1, 0, z0], [x1, 0, z1], [H, 0, z1], { toward: up });
  m.quad([-H, 0, z0], [H, 0, z0], [H, 0, -H], [-H, 0, -H], { toward: up });
  m.quad([-H, 0, H], [H, 0, H], [H, 0, z1], [-H, 0, z1], { toward: up });
  // expansion-joint seams as thin dark strips (visual cue for scale)
  const seams = new Mesh('AETHER_TUNNEL_FLOOR_SEAMS', 'BlackPowderCoat', { category: 'floor seams', role: 'static' });
  for (let x = Math.ceil(x0 / 3) * 3; x < x1; x += 3) { if (Math.abs(x) < H + .3) continue; seams.box([x - .01, 0, z0], [x + .01, .004, z1]); }
  for (const z of [-4.5, -3, 3, 4.5]) { seams.box([x0, 0, z - .01], [-H - .02, .004, z + .01]); seams.box([H + .02, 0, z - .01], [x1, .004, z + .01]); }
  return [m, seams];
}

// wall made of 4 rectangular strips around a rectangular hole, in a plane given by map(u,v)->[x,y,z]; returns strips
function wallWithHole(mesh, map, u0, u1, v0, v1, h, toward) {
  const [a0, a1, b0, b1] = h, q = (ua, va, ub, vb) => { if (ub - ua > 1e-9 && vb - va > 1e-9) mesh.quad(map(ua, va), map(ub, va), map(ub, vb), map(ua, vb), { toward }); };
  q(u0, v0, u1, b0); q(u0, b1, u1, v1); q(u0, b0, a0, b1); q(a1, b0, u1, b1);
}

function shellMeshes() {
  const S = SPEC, p = S.plenum, n = S.nozzle, c = S.collector, w = S.window;
  const inside = [(p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, 0];
  const walls = new Mesh('AETHER_TUNNEL_WALLS', 'PlenumPaint', { category: 'tunnel walls', role: 'static' });
  const ceil = new Mesh('AETHER_TUNNEL_CEILING', 'PlenumPaint', { category: 'tunnel ceiling', role: 'static' });
  // front wall (x=x0) with the nozzle opening, back wall (x=x1) with the collector duct opening
  const nz = D.nozzleAt(p.x0), fh = [-nz.hw - .18, nz.hw + .18, 0, nz.h + .18];
  wallWithHole(walls, (u, v) => [p.x0, v, u], -p.zh, p.zh, 0, p.y1, [fh[0], fh[1], fh[2], fh[3]], inside);
  const ch = D.collectorAt(c.throatX), bh = [-ch.hw - .12, ch.hw + .12, 0, ch.h + .12];
  wallWithHole(walls, (u, v) => [p.x1, v, u], -p.zh, p.zh, 0, p.y1, bh, inside);
  // side walls: -Z solid, +Z with the observation window opening
  walls.quad([p.x0, 0, -p.zh], [p.x1, 0, -p.zh], [p.x1, p.y1, -p.zh], [p.x0, p.y1, -p.zh], { toward: inside });
  wallWithHole(walls, (u, v) => [u, v, p.zh], p.x0, p.x1, 0, p.y1, [w.x0 - .1, w.x1 + .1, w.y0 - .1, w.y1 + .1], inside);
  ceil.quad([p.x0, p.y1, -p.zh], [p.x1, p.y1, -p.zh], [p.x1, p.y1, p.zh], [p.x0, p.y1, p.zh], { toward: inside });
  return { walls, ceil, fh, bh };
}

// anechoic wedges: 0.4 m pitch, 0.8 m deep, ridge direction alternating 90 degrees (checkerboard), skipping openings
function wedges(openings) {
  const S = SPEC, p = S.plenum, W = S.plenum.wedge, m = new Mesh('AETHER_TUNNEL_WEDGES', 'AbsorberFoam', { category: 'absorber wedges', role: 'static' });
  const pitch = W.pitch, depth = W.depth;
  // plane: origin o, in-plane axes u,v, inward normal nrm
  const field = (o, ua, va, nu, nv, nrm, skip) => {
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const cu = (i + .5) * pitch, cv = (j + .5) * pitch, c = add(o, add(mul(ua, cu), mul(va, cv)));
      if (skip && skip(c)) continue;
      const alongU = (i + j) % 2 === 0, hp = pitch / 2, ridge = hp * .98, tip = [alongU ? 1 : 0, alongU ? 0 : 1];
      const e1 = alongU ? ua : va, e2 = alongU ? va : ua; // e1: ridge direction, e2: across the ridge
      const base = [add(add(c, mul(e1, -hp)), mul(e2, -hp)), add(add(c, mul(e1, hp)), mul(e2, -hp)), add(add(c, mul(e1, hp)), mul(e2, hp)), add(add(c, mul(e1, -hp)), mul(e2, hp))];
      const t0 = add(add(c, mul(e1, -ridge)), mul(nrm, depth)), t1 = add(add(c, mul(e1, ridge)), mul(nrm, depth)), cc = add(c, mul(nrm, depth * .4));
      const o2 = { toward: cc, away: true };
      m.quad(base[0], base[1], t1, t0, o2); m.quad(base[3], base[2], t1, t0, o2);
      m.tri(base[0], base[3], t0, o2); m.tri(base[1], base[2], t1, o2);
      void tip;
    }
  };
  const inRect = (pt, r) => pt[0] > r[0] && pt[0] < r[1] && pt[1] > r[2] && pt[1] < r[3];
  const nx = Math.floor((p.x1 - p.x0) / pitch), ny = Math.floor((p.y1 - p.y0) / pitch), nzc = Math.floor((2 * p.zh) / pitch);
  const [fh, bh, win] = openings;
  // side wall -Z (inward +Z): u along x, v along y
  field([p.x0, p.y0, -p.zh], [1, 0, 0], [0, 1, 0], nx, ny, [0, 0, 1], null);
  // side wall +Z (inward -Z) with the window cut out
  field([p.x0, p.y0, p.zh], [1, 0, 0], [0, 1, 0], nx, ny, [0, 0, -1], c => inRect([c[0], c[1]], [win[0] - .3, win[1] + .3, win[2] - .3, win[3] + .3]));
  // ceiling (inward -Y): u along x, v along z
  field([p.x0, p.y1, -p.zh], [1, 0, 0], [0, 0, 1], nx, nzc, [0, -1, 0], null);
  // front wall (inward +X): u along z, v along y, skip the nozzle opening
  field([p.x0, p.y0, -p.zh], [0, 0, 1], [0, 1, 0], nzc, ny, [1, 0, 0], c => inRect([c[2], c[1]], [fh[0] - .4, fh[1] + .4, fh[2] - .4, fh[3] + .4]));
  // back wall (inward -X): skip the collector opening
  field([p.x1, p.y0, -p.zh], [0, 0, 1], [0, 1, 0], nzc, ny, [-1, 0, 0], c => inRect([c[2], c[1]], [bh[0] - .4, bh[1] + .4, bh[2] - .4, bh[3] + .4]));
  return m;
}

// ---------- nozzle: settling-chamber exit to the nozzle lip, inner (flow) and outer skins ----------
function nozzleMeshes() {
  const n = SPEC.nozzle, N = 56, M = 8 * 2 + 2, out = new Mesh('AETHER_NOZZLE_OUTER', 'NozzleOuter', { category: 'nozzle', role: 'static', solid: true });
  const inn = new Mesh('AETHER_NOZZLE_INNER', 'GalvanizedSteel', { category: 'nozzle inner', role: 'static', solid: true });
  const t = n.wall, xs = smooth(n.x0, n.x1, N), G = xs.map(x => { const a = D.nozzleAt(x); return rrLoop(x, a.hw + t, a.h + t, a.r + t, 8, 0); });
  const cen = i => [xs[i], D.nozzleAt(xs[i]).h / 2, 0];
  out.grid(G, cen, 'out', false);
  // inner skin = the flow path exactly as in the spec (the solver uses the same contour)
  const Gi = xs.map(x => { const a = D.nozzleAt(x); return rrLoop(x, a.hw, a.h, a.r, 8, 0); });
  inn.grid(Gi, cen, 'in', false);
  // exit lip: a torus-like rim strip around the exit, as a short wider loft
  const lip = new Mesh('AETHER_NOZZLE_LIP', 'BlackPowderCoat', { category: 'nozzle lip', role: 'static', solid: true });
  const a1 = D.nozzleAt(n.x1), Gl = [-.0, .03, .06, n.lip].map((dx, i) => { const grow = [0, .012, .03, 0][i] + .0; return rrLoop(n.x1 - n.lip + dx, a1.hw + t + grow, a1.h + t + grow, a1.r + t + grow, 8, 0); });
  lip.grid(Gl, i => [n.x1, a1.h / 2, 0], 'out', false);
  // flanges at the settling joint and at the plenum front wall (a visible bolted ring)
  const fl = new Mesh('AETHER_NOZZLE_FLANGES', 'GalvanizedSteel', { category: 'nozzle flange', role: 'static', solid: true });
  for (const x of [SPEC.plenum.x0 - .02, n.x0 + .02]) {
    const a = D.nozzleAt(x), loopA = rrLoop(x, a.hw + .02, a.h + .02, a.r + .02), loopB = rrLoop(x, a.hw + .22, a.h + .22, a.r + .22), cc = [x, a.h / 2, 0];
    for (let j = 0; j < loopA.length - 1; j++) fl.quad(loopA[j], loopA[j + 1], loopB[j + 1], loopB[j], { toward: [x + 5, cc[1], 0] });
    for (let j = 0; j < loopA.length - 1; j += 2) { const q = mul(add(loopA[j], loopB[j]), .5); fl.box([q[0] - .02, q[1] - .03, q[2] - .03], [q[0] + .06, q[1] + .03, q[2] + .03]); }
  }
  return [out, inn, lip, fl];
}

// ---------- settling chamber: housing, honeycomb, two screens ----------
function settlingMeshes() {
  const s = SPEC.settling, h = new Mesh('AETHER_SETTLING_HOUSING', 'GalvanizedSteel', { category: 'settling chamber', role: 'static', solid: true }),
    hc = new Mesh('AETHER_HONEYCOMB', 'BlackPowderCoat', { category: 'honeycomb', role: 'static', solid: true }), sc = new Mesh('AETHER_SCREENS', 'BlackPowderCoat', { category: 'screens', role: 'static', solid: true });
  const ctr = [(s.x0 + s.x1) / 2, s.H / 2, 0];
  h.quad([s.x0, 0, -s.W / 2], [s.x1, 0, -s.W / 2], [s.x1, 0, s.W / 2], [s.x0, 0, s.W / 2], { toward: ctr });
  h.quad([s.x0, s.H, -s.W / 2], [s.x1, s.H, -s.W / 2], [s.x1, s.H, s.W / 2], [s.x0, s.H, s.W / 2], { toward: ctr });
  h.quad([s.x0, 0, -s.W / 2], [s.x1, 0, -s.W / 2], [s.x1, s.H, -s.W / 2], [s.x0, s.H, -s.W / 2], { toward: ctr });
  h.quad([s.x0, 0, s.W / 2], [s.x1, 0, s.W / 2], [s.x1, s.H, s.W / 2], [s.x0, s.H, s.W / 2], { toward: ctr });
  const H = s.honeycomb, nz = Math.round(s.W / (H.cell * 4)), ny = Math.round(s.H / (H.cell * 4)); // cells every 0.2 m of slat (visual density; the real cell size is documented in the spec)
  for (let i = 0; i <= nz; i++) { const z = -s.W / 2 + s.W * i / nz; hc.box([H.x, 0, z - H.t * 2], [H.x + H.depth, s.H, z + H.t * 2]); }
  for (let j = 0; j <= ny; j++) { const y = s.H * j / ny; hc.box([H.x, Math.max(0, y - H.t * 2), -s.W / 2], [H.x + H.depth, Math.min(s.H, y + H.t * 2), s.W / 2]); }
  for (const sr of s.screens) {
    const nzz = Math.round(s.W / (sr.pitch * 2)), nyy = Math.round(s.H / (sr.pitch * 2));
    for (let i = 0; i <= nzz; i++) { const z = -s.W / 2 + s.W * i / nzz; sc.box([sr.x, 0, z - sr.wire], [sr.x + sr.wire * 2, s.H, z + sr.wire]); }
    for (let j = 0; j <= nyy; j++) { const y = s.H * j / nyy; sc.box([sr.x, Math.max(0, y - sr.wire), -s.W / 2], [sr.x + sr.wire * 2, Math.min(s.H, y + sr.wire), s.W / 2]); }
  }
  return [h, hc, sc];
}

// ---------- collector: bell-mouth lip, funnel, throat duct through the back wall ----------
function collectorMeshes() {
  const c = SPEC.collector, N = 40, out = new Mesh('AETHER_COLLECTOR_OUTER', 'NozzleOuter', { category: 'collector', role: 'static', solid: true }),
    inn = new Mesh('AETHER_COLLECTOR_INNER', 'GalvanizedSteel', { category: 'collector inner', role: 'static', solid: true });
  const funnel = smooth(c.x0, c.throatX, N), duct = smooth(c.throatX, c.xOut, 6), xs = [...funnel, ...duct.slice(1)];
  const loop = (x, dt) => { const a = D.collectorAt(x); return rrLoop(x, a.hw + dt, a.h + dt, .2 + dt, 8, 0); };
  const cen = i => [xs[i], D.collectorAt(xs[i]).h / 2, 0];
  out.grid(xs.map(x => loop(x, c.wall)), cen, 'out', false);
  inn.grid(xs.map(x => loop(x, 0)), cen, 'in', false);
  // bell-mouth lip: quarter-round rim flaring outward at the inlet
  const lipM = new Mesh('AETHER_COLLECTOR_LIP', 'BlackPowderCoat', { category: 'collector lip', role: 'static', solid: true });
  const L = 10, rows = [];
  for (let k = 0; k <= L; k++) { const th = (k / L) * Math.PI / 2, x = c.x0 + c.lipR * Math.sin(th), fl = c.lipR * (1 - Math.cos(th)); rows.push(rrLoop(x, c.inW / 2 + c.wall + (c.lipR - fl) * .9, c.inH + c.wall + (c.lipR - fl) * .9, .2 + c.wall + (c.lipR - fl) * .9, 8, 0)); }
  lipM.grid(rows, i => [c.x0, c.inH / 2, 0], 'out', false);
  return [out, inn, lipM];
}

// ---------- turntable: flush round table with ring seams and bolt heads (rotates with the car yaw) ----------
function turntableMeshes() {
  const t = SPEC.turntable, N = 96, top = new Mesh('AETHER_TURNTABLE_DISK', 'TurntableSteel', { category: 'turntable', role: 'rotating', pivot: [0, 0, 0] }),
    side = new Mesh('AETHER_TURNTABLE_RIM', 'BlackPowderCoat', { category: 'turntable rim', role: 'static' }), bolts = new Mesh('AETHER_TURNTABLE_BOLTS', 'GalvanizedSteel', { category: 'turntable bolts', role: 'rotating', pivot: [0, 0, 0] });
  const up = [0, 10, 0], R = t.r, pit = t.pit;
  // disk top between the rolling-road pit rectangle and the outer circle (radial correspondence)
  const rect = [], circ = [];
  for (let i = 0; i <= N; i++) { const a = i / N * 2 * Math.PI, c = Math.cos(a), s = Math.sin(a), k = Math.max(Math.abs(c) / pit.hx, Math.abs(s) / pit.hz); rect.push([c / k, 0, s / k]); circ.push([R * c, 0, R * s]); }
  for (let i = 0; i < N; i++) top.quad(rect[i], rect[i + 1], circ[i + 1], circ[i], { toward: up });
  // concentric ring seams (thin dark grooves) at r = 1.95, 2.9
  const grooves = new Mesh('AETHER_TURNTABLE_GROOVES', 'BlackPowderCoat', { category: 'turntable groove', role: 'rotating', pivot: [0, 0, 0] });
  for (const r of [1.95, 2.9, R - .04]) for (let i = 0; i < N; i++) {
    const a0 = i / N * 2 * Math.PI, a1 = (i + 1) / N * 2 * Math.PI, r0 = r - .006, r1 = r + .006, p = (rr, a) => [rr * Math.cos(a), .0015, rr * Math.sin(a)];
    const q = [p(r0, a0), p(r1, a0), p(r1, a1), p(r0, a1)]; // keep out of the pit
    if (q.every(pp => Math.abs(pp[0]) < pit.hx + .02 && Math.abs(pp[2]) < pit.hz + .02)) continue;
    grooves.quad(q[0], q[1], q[2], q[3], { toward: up });
  }
  // outer gap ring + vertical rim down to -0.3 m
  for (let i = 0; i < N; i++) {
    const a0 = i / N * 2 * Math.PI, a1 = (i + 1) / N * 2 * Math.PI, p = (r, a, y) => [r * Math.cos(a), y, r * Math.sin(a)], r1 = R + t.gap;
    side.quad(p(R, a0, 0), p(R, a1, 0), p(R, a1, -t.thickness), p(R, a0, -t.thickness), { toward: [0, 0, 0] });
    side.quad(p(r1, a0, 0), p(r1, a1, 0), p(r1, a1, -t.thickness), p(r1, a0, -t.thickness), { toward: [0, 0, 0], away: true });
    side.quad(p(R, a0, -t.thickness), p(R, a1, -t.thickness), p(r1, a1, -t.thickness), p(r1, a0, -t.thickness), { toward: [0, 10, 0] });
  }
  // 36 bolt heads on r = 3.45
  for (let i = 0; i < 36; i++) { const a = i / 36 * 2 * Math.PI; bolts.cylinderY(3.45 * Math.cos(a), 3.45 * Math.sin(a), .035, 0, .012, 10); }
  return [top, grooves, side, bolts];
}

// ---------- observation window (+Z wall) with frame and glass, and a simple control-room shell behind it ----------
function windowMeshes() {
  const S = SPEC, p = S.plenum, w = S.window, z = p.zh, frame = new Mesh('AETHER_WINDOW_FRAME', 'BlackPowderCoat', { category: 'window frame', role: 'static' }),
    glass = new Mesh('AETHER_WINDOW_GLASS', 'AcousticGlass', { category: 'window glass', role: 'static', glass: true });
  const t = .12;
  frame.box([w.x0 - .12, w.y0 - .12, z - t], [w.x1 + .12, w.y0, z + t]); frame.box([w.x0 - .12, w.y1, z - t], [w.x1 + .12, w.y1 + .12, z + t]);
  frame.box([w.x0 - .12, w.y0 + .002, z - t], [w.x0, w.y1 - .002, z + t]); frame.box([w.x1, w.y0 + .002, z - t], [w.x1 + .12, w.y1 - .002, z + t]);
  for (let k = 1; k < 3; k++) { const x = w.x0 + (w.x1 - w.x0) * k / 3; frame.box([x - .03, w.y0 + .002, z - .04], [x + .03, w.y1 - .002, z + .04]); }
  glass.quad([w.x0, w.y0, z], [w.x1, w.y0, z], [w.x1, w.y1, z], [w.x0, w.y1, z], { toward: [0, 2, 0] });
  const cr = S.controlRoom, room = new Mesh('AETHER_CONTROL_ROOM_SHELL', 'PlenumPaint', { category: 'control room', role: 'static' });
  const rx0 = w.x0 - 1.5, rx1 = w.x1 + 1.5, rz1 = z + cr.depth, ry0 = cr.floorY, ry1 = 3.8, ctr = [(rx0 + rx1) / 2, 2, z + cr.depth / 2];
  room.quad([rx0, ry0, z], [rx1, ry0, z], [rx1, ry0, rz1], [rx0, ry0, rz1], { toward: ctr });
  room.quad([rx0, ry1, z], [rx1, ry1, z], [rx1, ry1, rz1], [rx0, ry1, rz1], { toward: ctr });
  room.quad([rx0, ry0, rz1], [rx1, ry0, rz1], [rx1, ry1, rz1], [rx0, ry1, rz1], { toward: ctr });
  room.quad([rx0, ry0, z], [rx0, ry1, z], [rx0, ry1, rz1], [rx0, ry0, rz1], { toward: ctr });
  room.quad([rx1, ry0, z], [rx1, ry1, z], [rx1, ry1, rz1], [rx1, ry0, rz1], { toward: ctr });
  // front (plenum-side) wall of the control room, with the window cut out
  wallWithHole(room, (u, v) => [u, v, z], rx0, rx1, ry0, ry1, [w.x0 - .1, w.x1 + .1, w.y0 - .1, w.y1 + .1], ctr);
  return [frame, glass, room];
}

// ---------- ceiling light troffers (emissive panels between the wedge field) and a service catwalk ----------
function lightMeshes() {
  const p = SPEC.plenum, lights = new Mesh('AETHER_PLENUM_LIGHTS', 'PlenumLight', { category: 'lighting recess', role: 'static', emissive: true });
  const y = p.y1 - SPEC.plenum.wedge.depth - .05;
  for (let i = 0; i < 6; i++) for (const z of [-3.6, 0, 3.6]) { const x = p.x0 + 2.5 + i * 4.2; lights.box([x - 1.0, y - .06, z - .25], [x + 1.0, y, z + .25]); }
  const mark = new Mesh('AETHER_FLOOR_MARKS', 'SafetyYellow', { category: 'floor marks', role: 'static' });
  const t = SPEC.turntable.r + SPEC.turntable.gap + .08;
  for (let i = 0; i < 128; i++) { const a0 = i / 128 * 2 * Math.PI, a1 = (i + 1) / 128 * 2 * Math.PI; if (i % 4 === 3) continue; const q = (r, a) => [r * Math.cos(a), .003, r * Math.sin(a)]; mark.quad(q(t, a0), q(t + .06, a0), q(t + .06, a1), q(t, a1), { toward: [0, 10, 0] }); }
  return [lights, mark];
}

export function buildTunnel() {
  const parts = [];
  const { walls, ceil, fh, bh } = shellMeshes();
  const w = SPEC.window, win = [w.x0, w.x1, w.y0, w.y1];
  parts.push(...floorMesh(), walls, ceil, wedges([fh, bh, win]), ...nozzleMeshes(), ...settlingMeshes(), ...collectorMeshes(), ...turntableMeshes(), ...windowMeshes(), ...lightMeshes());
  return parts;
}
export { rrLoop, D };
