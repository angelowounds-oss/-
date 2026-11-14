import * as THREE from 'three';
import { landHeight } from './landfn.js';
import { regionRoads } from './region.js';
import { roadAt } from './roadnet.js';
import * as surf from './roadsurf.js';
import { nightU } from './shaders.js';
import { GR, grp } from './physics.js';
import { SignAtlas, PLATE } from './signatlas.js';
import { decodeTile, trims, radiusOf, signalGroups, signalState, crossingSpan, signalFoot, hasSignal, TILE, TILE_OFF as OFF } from './streetgeo.js';
import { localPoints } from './physorigin.js';
import { carriage } from './carriage.js';

// The street furniture of the capital region (WLD-24g): pavements with kerbs, rounded kerb corners at junctions, zebra crossings and stop lines, signal poles whose
// lamps follow a timed cycle, street lamps and trees. The baked chunk `str/<ti>_<tj>` (build/world/streets.mjs) says only where: junctions with their arms and
// pavement runs along road lines with the length trimmed off at each end; the shapes come from the compiled road samples (regionRoads) at run time, in the
// same way the road itself is drawn (highways.js artPiece: edge at `half`, never below the drawn ground), so that the pavement meets the asphalt. Like the
// buildings (realbuildings.js) a tile is built a little every frame and uses materials that already exist, so no program is compiled while playing (ARCHITECTURE.md
// section 3). Lamps and trees are placed by rule where the map is silent; bus stops, subway entrances, benches, bins, hydrants, vending machines and the
// crossings away from junctions are records (OpenStreetMap, Seoul open data), each judged by the bake before it stands (ADR-0042).
const KERB = 0.13;            // height of the kerb stone above the asphalt edge (Seoul: 12 - 15 cm)
const LIFT = 0.05;            // the drawn road is never lower than the ground + this (highways.js)
const DECK = 1.7;             // the depth of a bridge deck's fascia below its surface (highways.js)
const PAVE = [[0.30, 0.29, 0.27], [0.26, 0.255, 0.24]], KERBC = [0.42, 0.41, 0.39], ASPH = [0.050, 0.052, 0.058], WHITE = [0.78, 0.78, 0.74];
const BUS = [0.10, 0.30, 0.85];   // the blue of a bus-only lane line
const LANE_W = 3.75, TURN = { L: 1, S: 2, R: 4 };   // as build/world/streets.mjs
const POLE = [0.20, 0.21, 0.22], POLE_G = [0.30, 0.34, 0.31], HOUSING = [0.04, 0.045, 0.05], TRUNK = [0.16, 0.12, 0.09];
// the species of build/world/streetfurn.mjs SPECIES (same order): crown radius, crown height / radius, trunk height, colour. A ginkgo is slim and upright,
// a plane tree broad, a zelkova a wide vase, a cherry low and round.
const TREE = [{ r: 1.5, tall: 1.7, trunk: 2.6, col: [0.17, 0.25, 0.06] }, { r: 2.3, tall: 1.0, trunk: 3.0, col: [0.10, 0.20, 0.06] }, { r: 2.2, tall: 0.9, trunk: 3.2, col: [0.07, 0.16, 0.05] }, { r: 1.9, tall: 0.8, trunk: 2.2, col: [0.12, 0.19, 0.07] }];
const hash = (a, b) => { let h = Math.imul(a, 0x27d4eb2d) ^ Math.imul(b + 1, 0x165667b1); h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// the junctions and crossings of a tile as the traffic audit reads them (tests/e2e/traffic-audit, EV-20): signalled junctions with each arm's
// direction, signal group and stop line (the far edge of its crossing), the junction's signal phase, and every crossing as a rectangle
function auditOf(J, C) {
  const sig = [], xing = [];
  for (const j of J) {
    const gr = j.signal ? signalGroups(j.arms) : null;
    for (const a of j.arms) { if (!a.cross) continue; const { s0, len } = crossingSpan(a), dx = Math.cos(a.ang), dz = Math.sin(a.ang), m = s0 + len / 2; xing.push({ x: j.x + dx * m, z: j.z + dz * m, ax: dx, az: dz, hl: len / 2, hw: a.half }); }
    if (gr) sig.push({ x: j.x, z: j.z, R: radiusOf(j.arms), phase: hash(Math.round(j.x), Math.round(j.z)), arms: j.arms.map((a, k) => { const c = crossingSpan(a); return { ang: a.ang, g: gr[k], stop: c.s0 + c.len, s0: c.s0, len: c.len, cross: a.cross, half: a.half, flow: a.flow }; }) });   // s0, len, cross: where its crossing is (street walkers)
  }
  for (const c of C) xing.push({ x: c.x, z: c.z, ax: c.tx, az: c.tz, hl: c.wid / 2, hw: c.half, signal: c.signal });
  return { sig, xing };
}
const LAMP_H = [10, 9, 7.5, 6];   // mounting height by rank, as build/world/streetfurn.mjs LAMP_H
// the street's records (build/world/streetpoints.mjs PTYPE and its footprints): bus stop, subway entrance, bench, bin, hydrant, vending machine
const P = { bus: 2, subway: 3, bench: 4, bin: 5, hydrant: 6, vending: 7 }, SHELTER = { hl: 2.6, hw: 0.75, h: 2.6 }, ENTRANCE = { hl: 2.6, hw: 1.4, h: 2.7 };
const GLASS = [0.30, 0.36, 0.40], STEEL = [0.26, 0.27, 0.28], ROOF = [0.20, 0.22, 0.24], SEAT = [0.36, 0.25, 0.15], STOP_BLUE = [0.08, 0.26, 0.70], METRO = [0.05, 0.32, 0.55], DARK = [0.015, 0.015, 0.018];
const BIN = [0.20, 0.26, 0.24], HYDRANT = [0.62, 0.06, 0.05], VEND = [0.62, 0.10, 0.08];

// merged geometry in the frame of its tile (x and z relative to the tile centre, y absolute)
class Geo {
  constructor(ox, oz) { this.ox = ox; this.oz = oz; this.p = []; this.n = []; this.c = []; this.i = []; this.k = 0; }
  get empty() { return this.k === 0; }
  // a quad whose normal agrees with (nx, ny, nz); points are in world x, z
  quad(a, b, c, d, col, nx, ny, nz) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const flip = (uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz < 0, k = this.k;
    for (const q of [a, b, c, d]) { this.p.push(q[0] - this.ox, q[1], q[2] - this.oz); this.n.push(nx, ny, nz); this.c.push(col[0], col[1], col[2]); }
    if (flip) this.i.push(k, k + 2, k + 1, k, k + 3, k + 2); else this.i.push(k, k + 1, k + 2, k, k + 2, k + 3);
    this.k += 4;
  }
  tri(a, b, c, col, nx, ny, nz) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const flip = (uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz < 0, k = this.k;
    for (const q of [a, b, c]) { this.p.push(q[0] - this.ox, q[1], q[2] - this.oz); this.n.push(nx, ny, nz); this.c.push(col[0], col[1], col[2]); }
    if (flip) this.i.push(k, k + 2, k + 1); else this.i.push(k, k + 1, k + 2);
    this.k += 3;
  }
  // a box turned about the vertical axis: centre, long axis (ux, uz), half extents along it / across it / up; `bottom` also closes the underside
  box(cx, cy, cz, ux, uz, hl, hw, hh, col, bottom = false) {
    const vx = -uz, vz = ux, P = (a, b, c) => [cx + ux * hl * a + vx * hw * b, cy + hh * c, cz + uz * hl * a + vz * hw * b];
    this.quad(P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), col, 0, 1, 0);
    this.quad(P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1), col, -vx, 0, -vz);
    this.quad(P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1), col, ux, 0, uz);
    this.quad(P(1, 1, -1), P(-1, 1, -1), P(-1, 1, 1), P(1, 1, 1), col, vx, 0, vz);
    this.quad(P(-1, 1, -1), P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), col, -ux, 0, -uz);
    if (bottom) this.quad(P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), P(1, -1, -1), col, 0, -1, 0);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.c), 3)); g.setIndex(new THREE.BufferAttribute(new Uint32Array(this.i), 1));
    g.computeBoundingSphere(); g.computeBoundingBox(); return g;
  }
}

// ---- one tile built a slice at a time
class TileBuild {
  constructor(key, ti, tj, chunk, lines, atlas = null, nearRoad = null) {
    this.key = key; this.ti = ti; this.tj = tj; this.chunk = chunk; this.lines = lines; this.atlas = atlas; this.nearRoad = nearRoad;   // nearRoad(x, z, fn): fn(r, i) for each street sample near (hwtraffic samplesNear)
    this.T = { p: [], n: [], uv: [], i: [] }; this.names = [];   // the road name plates (textured from the shared atlas) and the names they hold
    this.ox = (ti - OFF) * TILE + TILE / 2; this.oz = (tj - OFF) * TILE + TILE / 2;
    this.S = new Geo(this.ox, this.oz); this.M = new Geo(this.ox, this.oz); this.G = new Geo(this.ox, this.oz);   // solid things, markings, glow
    this.top = { p: [], i: [] };    // the walkable pavement tops (the physics mesh)
    this.asph = [];                 // the junction corners' asphalt, triangles in world x, y, z (with the tops: what the land keeps under, roadsurf.js)
    this.heads = [];                // signal heads: x, y, z, facing x, z, group, junction phase, junction id
    this.obst = [];                 // poles and trunks (solid near the player): x, z, y0, h, radius
    this.recs = [];                 // the stops and entrances as placed (where the tests look for them)
    this.boxes = [];                // shelters, entrances, benches, vending machines (solid near the player): x, z, y0, h, half along, half across, yaw
    this.plateAt = [];              // the name plates: centre x, y, z and the direction they face (dx, dz) (the tests look at them)
    this.stats = { pave: 0, lamps: 0, trees: 0, signals: 0, crossings: 0, corners: 0, arrows: 0, diamonds: 0, bus: 0, stops: 0, shelters: 0, entrances: 0, small: 0, mid: 0, plates: 0, deepSkirt: 0 };
    this.seg = 0; this.g = this.run();
  }
  step(ms) {
    const t0 = performance.now();
    for (;;) { if (this.g.next().done) return true; if (performance.now() - t0 > ms) return false; }
  }
  *run() {
    const { J, R, F, C } = decodeTile(this.ti + '_' + this.tj, this.chunk);   // the key without its 'str/' prefix
    this.audit = auditOf(J, C);
    for (const j of J) { this.junction(j); yield; }
    for (let q = 0; q < R.length; q++) { this.strip(R[q], q); yield; }
    for (const c of C) this.midCross(c);
    // lamps, trees and the records stand where the bake judged they belong (build/world/streetfurn.mjs, streetpoints.mjs); nothing is added here by spacing
    for (let k = 0; k < F.length; k++) {
      const f = F[k];
      if (f.t === 0) this.lamp(f); else if (f.t === 1) this.tree(f); else if (f.t === P.bus) this.stop(f); else if (f.t === P.subway) this.entrance(f); else this.small(f);
      if (f.t === P.bus || f.t === P.subway) this.recs.push({ t: f.t, x: f.x, z: f.z, ix: f.ix, iz: f.iz, v: f.v });
      if ((k & 31) === 31) yield;
    }
  }
  // the height of the drawn road at (x, z) near a junction: the road's own height there, never under the ground (as highways.js draws it)
  roadY(x, z, fallback) { const r = roadAt(x, z, 14), g = landHeight(x, z, 16) + LIFT; return Math.max(r ? r.y : fallback, g); }
  // is (x, y, z) inside another road's driven width, at about its height? (a straight-armed corner fan or strip laid over a lane is a wall to cars)
  onLane(x, y, z, inset) { const r = roadAt(x, z, 20); return !!r && r.d < (r.road.half ?? 3) - inset && Math.abs(r.y - y) < 2; }
  // a pavement piece is dropped (drawn and physics) when its centre or any corner sits well inside a carriageway
  overLane(pts) {
    let cx = 0, cy = 0, cz = 0; for (const q of pts) { cx += q[0]; cy += q[1]; cz += q[2]; if (this.onLane(q[0], q[1], q[2], 1)) return true; }
    const n = pts.length; return this.onLane(cx / n, cy / n, cz / n, 0.3);
  }
  // a pavement top (kept for the physics mesh as well)
  topQuad(a, b, c, d, col) {
    if (this.overLane([a, b, c, d])) { this.stats.laneDrop = (this.stats.laneDrop | 0) + 1; return; }
    this.S.quad(a, b, c, d, col, 0, 1, 0);
    const T = this.top, k = T.p.length / 3; for (const q of [a, b, c, d]) T.p.push(q[0], q[1], q[2]); T.i.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  topTri(a, b, c, col) {
    if (this.overLane([a, b, c])) { this.stats.laneDrop = (this.stats.laneDrop | 0) + 1; return; }
    this.S.tri(a, b, c, col, 0, 1, 0);
    const T = this.top, k = T.p.length / 3; for (const q of [a, b, c]) T.p.push(q[0], q[1], q[2]); T.i.push(k, k + 1, k + 2);
  }

  // a pole's foot off every carriageway: an arm's axis can run beside its street's own centre line (a junction centre off the road's line), and the foot put
  // half a carriageway out from the axis then stood in a lane (AI cars ran into it at the stop line). Each street segment near the foot whose kerb +0.5 m it is
  // inside pushes it out to 0.9 m past that kerb, straight away from the centre line (along (fx, fz), the side the foot was put on, when it is on the line)
  offLane(x, z, fx, fz) {
    const near = this.nearRoad; if (!near) return [x, z];
    for (let pass = 0; pass < 4; pass++) {
      let worst = null;
      near(x, z, (r, i) => {
        for (const k of [i - 1, i]) {
          if (k < 0 || k + 1 >= r.x.length) continue;
          const ax = r.x[k], az = r.z[k], ex = r.x[k + 1] - ax, ez = r.z[k + 1] - az, l2 = ex * ex + ez * ez || 1, t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
          const px = ax + ex * t, pz = az + ez * t, d = Math.hypot(x - px, z - pz), half = carriage(r).half, need = half + 0.5 - d;
          if (need > 0 && (!worst || need > worst.need)) worst = { need, px, pz, d, half };
        }
      });
      if (!worst) break;
      let ux = x - worst.px, uz = z - worst.pz; if (worst.d < 0.05) { ux = fx; uz = fz; } const ul = Math.hypot(ux, uz) || 1;
      x = worst.px + (ux / ul) * (worst.half + 0.9); z = worst.pz + (uz / ul) * (worst.half + 0.9);
    }
    return [x, z];
  }

  // ---- a junction: rounded kerb corners (asphalt filling the corner, pavement outside the arc), crossings, stop lines, signals
  junction(j) {
    const arms = j.arms, n = arms.length, R = radiusOf(arms), { corners } = trims(arms, R), gr = j.signal ? signalGroups(arms) : null, phase = hash(Math.round(j.x), Math.round(j.z));
    const X = (p) => j.x + p[0], Z = (p) => j.z + p[1], V = (p, y) => [X(p), y(X(p), Z(p)), Z(p)], yAt = (x, z) => this.roadY(x, z, j.y);
    for (const { k, j: jj, c } of corners) {
      if (!c.arc) continue;
      this.stats.corners++;
      const arc = c.arcPts.map((p) => V(p, yAt)), P = V(c.P, yAt), tone = PAVE[(k + jj) & 1];
      // the asphalt between the sharp corner and the arc
      for (let m = 0; m + 1 < arc.length; m++) { this.S.tri(P, arc[m], arc[m + 1], ASPH, 0, 1, 0); this.asph.push(...P, ...arc[m], ...arc[m + 1]); }
      // the kerb stone along the arc, then the pavement: fan from the outer corner Q over O1 - arc - O2
      const up = (q) => [q[0], q[1] + KERB, q[2]];
      for (let m = 0; m + 1 < arc.length; m++) {
        const mx = (arc[m][0] + arc[m + 1][0]) / 2, mz = (arc[m][2] + arc[m + 1][2]) / 2, dx = P[0] - mx, dz = P[2] - mz, l = Math.hypot(dx, dz) || 1;
        this.S.quad(arc[m], arc[m + 1], up(arc[m + 1]), up(arc[m]), KERBC, dx / l, 0, dz / l);
      }
      const Q = V(c.Q, (x, z) => yAt(x, z) + KERB), O1 = V(c.O1, (x, z) => yAt(x, z) + KERB), O2 = V(c.O2, (x, z) => yAt(x, z) + KERB), seq = [O1, ...arc.map(up), O2];
      for (let m = 0; m + 1 < seq.length; m++) this.topTri(Q, seq[m], seq[m + 1], tone);
    }
    for (let k = 0; k < n; k++) {
      const a = arms[k]; if (!a.cross && !j.signal) continue;
      const dx = Math.cos(a.ang), dz = Math.sin(a.ang), nx = -dz, nz = dx;   // the arm's direction, and its left-hand number side (the driver's right when leaving)
      const { s0, len } = crossingSpan(a), half = a.half;
      const at = (s, lat) => { const x = j.x + dx * s + nx * lat, z = j.z + dz * s + nz * lat; return [x, this.roadY(x, z, j.y) + 0.03, z]; };
      if (a.cross) {
        // zebra stripes run along the arm, 0.5 m wide with 0.5 m gaps
        const cnt = Math.max(2, Math.floor(2 * half)), step = (2 * half - 0.5) / (cnt - 1);
        for (let q = 0; q < cnt; q++) {
          const lat = -half + 0.25 + q * step;
          this.M.quad(at(s0, lat - 0.25), at(s0, lat + 0.25), at(s0 + len, lat + 0.25), at(s0 + len, lat - 0.25), WHITE, 0, 1, 0);
        }
        this.stats.crossings++;
      }
      // the stop line across the lanes that arrive (the right-hand ones for traffic coming in, i.e. the -n side), on arms of signalled junctions and big roads
      if (a.flow !== 1 && (j.signal || a.rank <= 1)) {
        const ss = s0 + len + 0.5, lo = a.flow === 2 ? -half + 0.1 : -half + 0.1, hi = a.flow === 2 ? half - 0.1 : -0.2;
        this.M.quad(at(ss, lo), at(ss, hi), at(ss + 0.4, hi), at(ss + 0.4, lo), WHITE, 0, 1, 0);
      }
      // lane arrows and the crossing-ahead diamond, as the bake decided them (build/world/streets.mjs markings)
      if (a.mark) this.approach(j, a, s0 + len + 0.5);
      // a signal pole on the pavement at the arrival side, with an arm over the lanes and a head facing the traffic
      if (hasSignal(j, a)) {
        const sp = s0 + len * 0.5, foot = signalFoot(a), [px, pz] = this.offLane(j.x + foot[0], j.z + foot[1], dz, -dx), y0 = this.roadY(px, pz, j.y) + KERB;
        this.S.box(px, y0 + 3.1, pz, dx, dz, 0.07, 0.07, 3.2, POLE);
        const tipLat = -(half * 0.45), tx = j.x + dx * sp + nx * tipLat, tz = j.z + dz * sp + nz * tipLat, ax = (px + tx) / 2, az = (pz + tz) / 2, al = Math.hypot(tx - px, tz - pz) / 2, ux = (tx - px) / (2 * al || 1), uz = (tz - pz) / (2 * al || 1);
        this.S.box(ax, y0 + 5.9, az, ux, uz, al, 0.05, 0.05, POLE);
        // the housing hangs from the arm's tip; its three lamps face along the arm's outward direction (dx, dz)
        this.S.box(tx, y0 + 5.2, tz, dx, dz, 0.16, 0.17, 0.52, HOUSING, true);
        this.heads.push(tx + dx * 0.17, y0 + 5.2, tz + dz * 0.17, dx, dz, gr[k], phase);
        this.namePlate(j, k, gr, px, pz, tx, tz, y0, dx, dz);
        this.obst.push(px, pz, y0, 6.3, 0.1); this.stats.signals++;
      }
    }
  }

  // ---- the road name plate under a signal arm (WLD-24g-4): the name of the road the arriving driver crosses (an arm of the other signal group), facing them,
  // as Korea hangs them on the signal poles; only real names from the map (the line's OSM `name`), none where the map has none
  namePlate(j, k, gr, px, pz, tx, tz, y0, dx, dz) {
    if (!this.atlas) return;
    const own = this.lines[j.arms[k].line]?.name; let best = null;
    j.arms.forEach((b, m) => { const nm = this.lines[b.line]?.name; if (m === k || gr[m] === gr[k] || !nm || nm === own) return; if (!best || b.rank < best.rank) best = { rank: b.rank, nm }; });
    if (!best) return;
    const al = Math.hypot(tx - px, tz - pz), w = Math.min(PLATE.w, al - 0.6); if (w < 1) return;
    const uv = this.atlas.take(best.nm); if (!uv) return;
    this.names.push(best.nm);
    const ux = (tx - px) / al, uz = (tz - pz) / al, s0 = 0.25, y1 = y0 + 5.82, y2 = y1 - PLATE.h, f = 0.035;
    // the text runs to the right of a driver who looks against (dx, dz): their right is (dz, -dx)
    const flip = ux * dz - uz * dx < 0, A = [px + ux * s0 + dx * f, pz + uz * s0 + dz * f], B = [px + ux * (s0 + w) + dx * f, pz + uz * (s0 + w) + dz * f];
    const [L, R] = flip ? [B, A] : [A, B], T = this.T, q = T.p.length / 3;
    for (const [P, y] of [[L, y2], [R, y2], [R, y1], [L, y1]]) { T.p.push(P[0] - this.ox, y, P[1] - this.oz); T.n.push(dx, 0, dz); }
    T.uv.push(uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]);
    // L -> R runs to the viewer's right and y up, so (L, R, top) is counter-clockwise seen from the front: the face normal is (dx, dz)
    T.i.push(q, q + 1, q + 2, q, q + 2, q + 3);
    // the back of the plate and the clamp to the arm
    const cx = (A[0] + B[0]) / 2 - dx * 0.05, cz = (A[1] + B[1]) / 2 - dz * 0.05;
    this.S.box(cx, (y1 + y2) / 2, cz, ux, uz, w / 2, 0.025, PLATE.h / 2, STEEL); this.plateAt.push(cx + dx * 0.05, (y1 + y2) / 2, cz + dz * 0.05, dx, dz);
    this.stats.plates++;
  }
  // the centre of arriving lane k of an arm, as a lateral offset in the arm's frame (n = the driver's right when leaving): the lanes are counted from the
  // driver's left, 3.75 m each, as the asphalt texture paints them (highways.js asphaltTexture: from the yellow edge outward)
  laneLat(a, k, oneway) {
    if (oneway) return a.half - (k + 0.5) * LANE_W;
    return -(0.12 + (k + 0.5) * LANE_W * (a.half - 0.12) / a.half);
  }
  // ---- the markings of an arriving approach: one or two sets of lane arrows behind the stop line `ss` (metres from the centre), a diamond before an
  // unsignalled crossing. A painted shape is given in the driver's frame: u forward (toward the junction), w to the driver's right
  approach(j, a, ss) {
    const L = this.lines[a.line], oneway = !!L?.oneway, n = (a.mark >> 4) & 7, dx = Math.cos(a.ang), dz = Math.sin(a.ang), nx = -dz, nz = dx;
    const paint = (s, lat, poly, col) => {
      // s along the arm (from the centre), lat across it; the shape's u runs toward the centre (-d), its w to the driver's right (-n)
      const P = poly.map(([u, w]) => { const x = j.x + dx * (s - u) + nx * (lat - w), z = j.z + dz * (s - u) + nz * (lat - w); return [x, this.roadY(x, z, j.y) + 0.035, z]; });
      for (let q = 1; q + 1 < P.length; q++) this.M.tri(P[0], P[q], P[q + 1], col, 0, 1, 0);
    };
    const sets = []; if (a.mark & 1) sets.push(ss + 4); if (a.mark & 2) sets.push(ss + 34);
    for (const s of sets) for (let k = 0; k < n; k++) {
      const t = (a.arr >> (3 * k)) & 7; if (!t) continue;
      const lat = this.laneLat(a, k, oneway), col = WHITE, both = !!(t & TURN.S);
      // straight: a shaft and a head; a turn: a shaft up to the bend, a short arm to the side and a head pointing that way (lower when it shares the
      // lane with straight on, so the two read apart)
      if (t & TURN.S) { paint(s + 5, lat, [[0, -0.15], [3.4, -0.15], [3.4, 0.15], [0, 0.15]], col); paint(s + 5, lat, [[3.4, -0.6], [5, 0], [3.4, 0.6]], col); }
      for (const [bit, sg] of [[TURN.L, -1], [TURN.R, 1]]) {
        if (!(t & bit)) continue;
        const ub = both ? 1.7 : 2.6;
        if (!both) paint(s + 5, lat, [[0, -0.15], [ub, -0.15], [ub, 0.15], [0, 0.15]], col);
        paint(s + 5, lat, [[ub - 0.3, 0], [ub, 0], [ub, sg * 0.9], [ub - 0.3, sg * 0.9]].map(([u, w]) => [u, w]), col);
        paint(s + 5, lat, [[ub - 0.75, sg * 0.9], [ub - 0.15, sg * 1.55], [ub + 0.45, sg * 0.9]], col);
      }
      this.stats.arrows++;
    }
    // the diamond (crossing ahead) in each arriving lane, 30 m before the crossing: an outline 1.5 m wide and 6 m long
    if (a.mark & 4) for (let k = 0; k < n; k++) {
      const lat = this.laneLat(a, k, oneway), s = ss + 30, c = [[0, 0], [3, 0.75], [6, 0], [3, -0.75]];
      for (let q = 0; q < 4; q++) {
        const A = c[q], B = c[(q + 1) % 4], du = B[0] - A[0], dw = B[1] - A[1], l = Math.hypot(du, dw), ou = -dw / l * 0.1, ow = du / l * 0.1;
        paint(s + 6, lat, [[A[0] - ou, A[1] - ow], [B[0] - ou, B[1] - ow], [B[0] + ou, B[1] + ow], [A[0] + ou, A[1] + ow]], WHITE);
      }
      this.stats.diamonds++;
    }
  }

  // ---- the pavements along one run of a road line, on the sides that the baked trims allow
  strip(r, q) {
    const L = this.lines[r.line]; if (!L) return;
    const n = r.i1 - r.i0 + 1; if (n < 2) return;
    const half = L.half, w = r.w;
    const sx = [], sz = [], sy = [], rx = [], rz = [], sc = [], sl = [0];
    for (let k = 0; k < n; k++) {
      const i = r.i0 + k, a = Math.max(0, i - 1), b = Math.min(L.x.length - 1, i + 1);
      let tx = L.x[b] - L.x[a], tz = L.z[b] - L.z[a]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      sx.push(L.x[i]); sz.push(L.z[i]); sy.push(L.y[i]); rx.push(tz); rz.push(-tx); sc.push(L.cls[i]);
      if (k) sl.push(sl[k - 1] + Math.hypot(sx[k] - sx[k - 1], sz[k] - sz[k - 1]));
    }
    const total = sl[n - 1];
    // the station at arc length s along the run
    const at = (s) => {
      let k = 0; while (k < n - 2 && sl[k + 1] < s) k++;
      const t = Math.max(0, Math.min(1, (s - sl[k]) / ((sl[k + 1] - sl[k]) || 1))), l = 1 - t;
      let ex = rx[k] * l + rx[k + 1] * t, ez = rz[k] * l + rz[k + 1] * t; const m = Math.hypot(ex, ez) || 1; ex /= m; ez /= m;
      return { x: sx[k] * l + sx[k + 1] * t, z: sz[k] * l + sz[k + 1] * t, y: sy[k] * l + sy[k + 1] * t, rx: ex, rz: ez, cls: t < 0.5 ? sc[k] : sc[k + 1] };
    };
    // a central bus lane: a solid blue line between the inner lane and the next on each carriageway, along the whole run
    if (r.bus && !L.oneway) this.busLines(r, at, total, half);
    for (const sd of [-1, 1]) {
      // the bake leaves a side bare where another carriageway lies under the strip (bit 0: the -right side, bit 1: the +right side)
      if (!(r.m & (sd < 0 ? 1 : 2))) continue;
      const s0 = r.ta[sd < 0 ? 0 : 1], s1 = total - r.tb[sd < 0 ? 0 : 1]; if (s1 - s0 < 1) continue;
      const cuts = [s0]; for (let k = 1; k < n - 1; k++) if (sl[k] > s0 + 0.3 && sl[k] < s1 - 0.3) cuts.push(sl[k]); cuts.push(s1);
      const prof = cuts.map((s) => {
        const st = at(s), ix = st.x + st.rx * sd * half, iz = st.z + st.rz * sd * half, ox = st.x + st.rx * sd * (half + w), oz = st.z + st.rz * sd * (half + w);
        const gi = landHeight(ix, iz, 16) + LIFT, go = landHeight(ox, oz, 16), yi = st.cls ? st.y : Math.max(st.y, gi), yt = yi + KERB, yo = st.cls ? yt : Math.max(yt, go + 0.03);
        return { st, i: [ix, yi, iz], it: [ix, yt, iz], o: [ox, yo, oz], go, deck: st.cls === 1 };
      });
      // a little tone change from run to run, and a paver pattern by segment
      const tone = 0.92 + 0.16 * hash(q * 2 + (sd > 0 ? 1 : 0), this.ti * 977 + this.tj);
      for (let k = 0; k + 1 < prof.length; k++) {
        const A = prof[k], B = prof[k + 1], base = PAVE[(this.seg++) & 1], col = [base[0] * tone, base[1] * tone, base[2] * tone];
        const mx = (A.st.rx + B.st.rx) / 2 * sd, mz = (A.st.rz + B.st.rz) / 2 * sd;
        this.S.quad(A.i, B.i, B.it, A.it, KERBC, -mx, 0, -mz);
        this.topQuad(A.it, A.o, B.o, B.it, col);
        // a face down beside the pavement where the ground is lower: on an embankment down to the ground, on a bridge only the deck's own fascia (as deep
        // as the road's, highways.js); a face to the ground there was a wall under the whole flyover (의사당대로 in Yeouido, seen as a pale wedge)
        if (A.o[1] - A.go > 0.05 || B.o[1] - B.go > 0.05) {
          const dn = (P, g, deck) => { const y = Math.min(g - 0.1, P[1] - 0.3); return [P[0], deck ? Math.max(y, P[1] - DECK) : y, P[2]]; };
          const a = dn(A.o, A.go, A.deck), b = dn(B.o, B.go, B.deck); if ((A.deck && A.o[1] - a[1] > DECK + 0.05) || (B.deck && B.o[1] - b[1] > DECK + 0.05)) this.stats.deepSkirt++;
          this.S.quad(A.o, a, b, B.o, KERBC, mx, 0, mz);
        }
        this.stats.pave += Math.hypot(B.st.x - A.st.x, B.st.z - A.st.z);
      }
    }
  }

  // the foot of a baked object: on a bridge deck the deck, elsewhere the drawn road edge (never under the ground), plus the kerb
  footY(f) { return (f.bridge ? f.y : Math.max(f.y, landHeight(f.x, f.z, 16) + LIFT)) + KERB; }
  busLines(r, at, total, half) {
    for (const sd of [-1, 1]) {
      const lat = sd * (0.12 + LANE_W * (half - 0.12) / half);
      for (let s = 0; s + 0.5 < total; s += 6) {
        const A = at(s), B = at(Math.min(total, s + 6)), y = (P) => (P.cls ? P.y : Math.max(P.y, landHeight(P.x, P.z, 16) + LIFT)) + 0.035, w = 0.09;
        const a0 = [A.x + A.rx * (lat - w), y(A), A.z + A.rz * (lat - w)], a1 = [A.x + A.rx * (lat + w), y(A), A.z + A.rz * (lat + w)];
        const b0 = [B.x + B.rx * (lat - w), y(B), B.z + B.rz * (lat - w)], b1 = [B.x + B.rx * (lat + w), y(B), B.z + B.rz * (lat + w)];
        this.M.quad(a0, b0, b1, a1, BUS, 0, 1, 0);
      }
    }
    this.stats.bus++;
  }
  // ---- a zebra crossing away from junctions (a Seoul polygon or a map node, build/world/streetpoints.mjs): stripes along the road over its carriageway
  midCross(c) {
    const nx = -c.tz, nz = c.tx, half = c.half, w2 = c.wid / 2;
    const at = (s, lat) => { const x = c.x + c.tx * s + nx * lat, z = c.z + c.tz * s + nz * lat; return [x, this.roadY(x, z, c.y) + 0.03, z]; };
    const cnt = Math.max(2, Math.floor(2 * half)), step = (2 * half - 0.5) / (cnt - 1);
    for (let q = 0; q < cnt; q++) { const lat = -half + 0.25 + q * step; this.M.quad(at(-w2, lat - 0.25), at(-w2, lat + 0.25), at(w2, lat + 0.25), at(w2, lat - 0.25), WHITE, 0, 1, 0); }
    this.stats.mid++;
  }
  // a solid footprint for the physics near the player: centre, foot, height, half extents along (ux, uz) and across
  solidBox(x, z, y0, h, ux, uz, hl, hw) { this.boxes.push(x, z, y0, h, hl, hw, Math.atan2(-uz, ux)); }
  // ---- a bus stop: a shelter (roof, glass back and sides, a bench) with its sign at the end, or only the sign on a pole; (ix, iz) points to the road
  stop(f) {
    const { x, z, ix, iz } = f, y0 = this.footY(f), ux = -iz, uz = ix, S = this.S;
    const sign = (px, pz) => { S.box(px, y0 + 1.4, pz, ux, uz, 0.05, 0.05, 1.4, POLE); S.box(px, y0 + 2.45, pz, ux, uz, 0.02, 0.32, 0.32, STOP_BLUE); };
    if (f.v & 1) {
      const { hl, hw, h } = SHELTER, bx = -ix * (hw - 0.05), bz = -iz * (hw - 0.05);
      S.box(x, y0 + h - 0.05, z, ux, uz, hl + 0.1, hw + 0.1, 0.05, ROOF, true);
      S.box(x + bx, y0 + 1.3, z + bz, ux, uz, hl, 0.03, 1.1, GLASS);
      for (const e of [-1, 1]) {
        S.box(x + ux * e * (hl - 0.03) - ix * 0.1, y0 + 1.3, z + uz * e * (hl - 0.03) - iz * 0.1, ux, uz, 0.03, hw - 0.2, 1.1, GLASS);
        for (const g of [-1, 1]) S.box(x + ux * e * hl + ix * g * hw, y0 + (h - 0.1) / 2, z + uz * e * hl + iz * g * hw, ux, uz, 0.05, 0.05, (h - 0.1) / 2, STEEL);
      }
      S.box(x - ix * 0.35, y0 + 0.45, z - iz * 0.35, ux, uz, hl * 0.6, 0.2, 0.04, SEAT);
      sign(x + ux * (hl + 0.6) + ix * 0.5, z + uz * (hl + 0.6) + iz * 0.5);
      this.solidBox(x, z, y0, h, ux, uz, hl, hw); this.stats.shelters++;
    } else { sign(x, z); this.obst.push(x, z, y0, 2.8, 0.08); }
    this.stats.stops++;
  }
  // ---- a subway entrance: the canopy over the stairs (low walls with glass above, a roof, the far end closed), open at one end, with the sign there
  entrance(f) {
    const { x, z, ix, iz } = f, y0 = this.footY(f), ux = -iz, uz = ix, vx = -uz, vz = ux, S = this.S, { hl, hw, h } = ENTRANCE;
    for (const e of [-1, 1]) { const cx = x + vx * e * (hw - 0.08), cz = z + vz * e * (hw - 0.08); S.box(cx, y0 + 0.5, cz, ux, uz, hl, 0.08, 0.5, STEEL); S.box(cx, y0 + 1.75, cz, ux, uz, hl, 0.03, 0.75, GLASS); }
    S.box(x - ux * (hl - 0.03), y0 + h / 2, z - uz * (hl - 0.03), ux, uz, 0.03, hw, h / 2, GLASS);
    S.box(x, y0 + h, z, ux, uz, hl + 0.15, hw + 0.15, 0.06, ROOF, true);
    // the stairwell reads as a dark opening in the pavement
    const q = (a, b) => [x + ux * a + vx * b, y0 + 0.02, z + uz * a + vz * b], a = hl - 0.2, b = hw - 0.2;
    this.M.quad(q(-a, -b), q(a, -b), q(a, b), q(-a, b), DARK, 0, 1, 0);
    const px = x + ux * (hl + 0.7) + vx * (hw + 0.3), pz = z + uz * (hl + 0.7) + vz * (hw + 0.3);
    S.box(px, y0 + 1.5, pz, ux, uz, 0.06, 0.06, 1.5, POLE); S.box(px, y0 + 2.75, pz, ux, uz, 0.3, 0.3, 0.3, METRO);
    this.solidBox(x, z, y0, h, ux, uz, hl, hw); this.obst.push(px, pz, y0, 3, 0.08); this.stats.entrances++;
  }
  // ---- a bench (facing the pavement), a litter bin, a fire hydrant, a vending machine
  small(f) {
    const { x, z, ix, iz } = f, y0 = this.footY(f), ux = -iz, uz = ix, S = this.S;
    if (f.t === P.bench) {
      S.box(x, y0 + 0.43, z, ux, uz, 0.9, 0.22, 0.03, SEAT); S.box(x + ix * 0.22, y0 + 0.72, z + iz * 0.22, ux, uz, 0.9, 0.02, 0.2, SEAT);
      for (const e of [-1, 1]) S.box(x + ux * e * 0.75, y0 + 0.2, z + uz * e * 0.75, ux, uz, 0.03, 0.2, 0.2, STEEL);
      this.solidBox(x, z, y0, 0.5, ux, uz, 0.9, 0.25);
    } else if (f.t === P.bin) { S.box(x, y0 + 0.45, z, ux, uz, 0.22, 0.22, 0.45, BIN); this.obst.push(x, z, y0, 0.9, 0.22); }
    else if (f.t === P.hydrant) { S.box(x, y0 + 0.35, z, ux, uz, 0.11, 0.11, 0.35, HYDRANT); S.box(x, y0 + 0.75, z, ux, uz, 0.08, 0.08, 0.05, HYDRANT); this.obst.push(x, z, y0, 0.8, 0.12); }
    else {
      // its back to the road: the front with the lit panel faces the pavement, away from (ix, iz)
      S.box(x, y0 + 0.92, z, ux, uz, 0.5, 0.38, 0.92, VEND);
      const fx = x - ix * 0.39, fz = z - iz * 0.39, c = (a, b) => [fx + ux * a, y0 + b, fz + uz * a];
      this.G.quad(c(-0.4, 0.9), c(0.4, 0.9), c(0.4, 1.7), c(-0.4, 1.7), [1.6, 1.6, 1.5], -ix, 0, -iz);
      this.solidBox(x, z, y0, 1.85, ux, uz, 0.5, 0.38);
    }
    this.stats.small++;
  }
  // ---- a cobra-head street lamp: pole, arm over the kerb lane, housing, and the glowing lens under it
  lamp(f) {
    const { x, z, ix, iz } = f, rank = f.v & 3, y0 = this.footY(f), H = LAMP_H[rank];
    this.S.box(x, y0 + H / 2, z, ix, iz, 0.07, 0.07, H / 2, POLE_G);
    const arm = rank === 3 ? 1.2 : 1.9 + (rank === 0 ? 0.6 : 0), hx = x + ix * arm, hz = z + iz * arm;
    this.S.box(x + ix * arm * 0.5, y0 + H - 0.12, z + iz * arm * 0.5, ix, iz, arm * 0.5, 0.045, 0.045, POLE_G);
    this.S.box(hx, y0 + H - 0.2, hz, ix, iz, 0.55, 0.17, 0.09, POLE_G, true);
    this.G.quad([hx - ix * 0.45 - iz * 0.13, y0 + H - 0.3, hz - iz * 0.45 + ix * 0.13], [hx + ix * 0.45 - iz * 0.13, y0 + H - 0.3, hz + iz * 0.45 + ix * 0.13], [hx + ix * 0.45 + iz * 0.13, y0 + H - 0.3, hz + iz * 0.45 - ix * 0.13], [hx - ix * 0.45 + iz * 0.13, y0 + H - 0.3, hz - iz * 0.45 - ix * 0.13], [3.2, 2.7, 1.9], 0, -1, 0);
    this.obst.push(x, z, y0, H, 0.1); this.stats.lamps++;
  }
  tree(f) {
    // street trees of 6-11 m: a slim trunk and a crown of two or three rounded blobs (a pole, two rings and a pole each), lit from above by the face normal.
    // The species is the road's (one species per street, as Seoul plants them); the size varies a little from tree to tree.
    const { x, z } = f, y0 = this.footY(f), sp = f.v & 3, id = ((f.v >> 2) & 7) / 8, SP = TREE[sp], th = SP.trunk + id * 0.6, rr = SP.r * (0.85 + id * 0.3), rh = rr * SP.tall, col = SP.col;
    const j = 0.85 + 0.3 * hash(Math.round(x), Math.round(z) + 5);
    this.S.box(x, y0 + th / 2, z, 1, 0, 0.1, 0.1, th / 2, TRUNK);
    const N = 7, blob = (cx, cy, cz, r, ry, rot) => {
      const ring = (h, f) => { const o = []; for (let k = 0; k < N; k++) { const a = rot + k * Math.PI * 2 / N; o.push([cx + Math.cos(a) * r * f, cy + h * ry, cz + Math.sin(a) * r * f]); } return o; };
      const T = [cx, cy + ry, cz], B = [cx, cy - 0.8 * ry, cz], A = ring(0.5, 0.86), M = ring(-0.3, 1), D = ring(-0.7, 0.6);
      const shade = (f, k) => { const g = f * j * (0.88 + 0.24 * ((k * 5 + Math.round(cx * 7)) & 3) / 3); return [col[0] * g, col[1] * g, col[2] * g]; };
      const nrm = (P) => { const dx = P[0] - cx, dz = P[2] - cz, l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
      for (let k = 0; k < N; k++) {
        const k2 = (k + 1) % N, [nx, nz] = nrm(M[k]);
        this.S.tri(T, A[k], A[k2], shade(1.25, k), nx * 0.5, 0.85, nz * 0.5);
        this.S.tri(A[k], M[k], M[k2], shade(1.0, k), nx, 0.3, nz); this.S.tri(A[k], M[k2], A[k2], shade(1.0, k + 1), nx, 0.3, nz);
        this.S.tri(M[k], D[k], D[k2], shade(0.7, k), nx, -0.3, nz); this.S.tri(M[k], D[k2], M[k2], shade(0.7, k + 1), nx, -0.3, nz);
        this.S.tri(B, D[k2], D[k], shade(0.5, k), nx * 0.4, -0.9, nz * 0.4);
      }
    };
    blob(x, y0 + th + rh * 0.55, z, rr, rh, id * 6);
    blob(x + rr * 0.45, y0 + th + rh * 0.1, z - rr * 0.3, rr * 0.7, rh * 0.7, id * 3 + 1);
    if (sp !== 0 && id > 0.3) blob(x - rr * 0.4, y0 + th + rh * 0.2, z + rr * 0.35, rr * 0.65, rh * 0.65, id * 5 + 2);
    this.obst.push(x, z, y0, th, 0.18); this.stats.trees++;
  }
}


export class Streetscape {
  constructor(scene, phys, G, wd = globalThis.__WORLD) {
    this.scene = scene; this.phys = phys; this.G = G; this.wd = wd; this.tiles = new Map(); this.index = new Map(); this.jobs = []; this.t = 0; this.last = -9; this.lastCol = -9;
    this.lines = regionRoads();
    this.nearRoad = (x, z, fn) => G?.hwtraffic?.samplesNear(x, z, 30, fn);   // street samples around a pole's foot (TileBuild.offLane; the traffic is made after this)
    const high = globalThis.__DETAIL === 'high', simple = !!G?.eng?.q?.simple;
    this.R = simple ? 400 : high ? 1000 : 700;   // how far tiles are drawn (a lamp or a kerb beyond this is only a speck in the fog)
    this.RC = 70;                                  // how close poles, trunks and the pavement are solid
    this.stats = { tiles: 0, solid: 0, pave: 0, lamps: 0, trees: 0, signals: 0, crossings: 0, corners: 0, arrows: 0, diamonds: 0, bus: 0, stops: 0, shelters: 0, entrances: 0, small: 0, mid: 0, plates: 0, deepSkirt: 0, walk: 0, tris: 0 };
    for (const k of wd?.keys('str/') || []) { const [ti, tj] = k.slice(4).split('_').map(Number); this.index.set(ti * 4096 + tj, { key: k, ti, tj }); }
    const hw = G?.highways?.mats;
    // the same programs as the road structures (vertex-coloured standard) and the lights (basic): nothing new to compile
    this.mat = hw?.struct || new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.05 });
    this.markMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    // the road name plates: one atlas texture and one material for all of them (signatlas.js)
    this.atlas = new SignAtlas(); this.signMat = new THREE.MeshStandardMaterial({ map: this.atlas.tex, roughness: 0.55, metalness: 0 });
    this.group = new THREE.Group(); this.group.name = 'streetscape'; scene.add(this.group);
    // signal lamps: a box each, in three colours, placed every half second for the heads near the focus
    const lampG = new THREE.BoxGeometry(0.2, 0.2, 0.06);
    this.lamps = [[1.0, 0.12, 0.08], [1.0, 0.65, 0.05], [0.12, 1.0, 0.35]].map((c) => {
      const m = new THREE.InstancedMesh(lampG, new THREE.MeshBasicMaterial({ color: new THREE.Color(c[0], c[1], c[2]).multiplyScalar(3), toneMapped: false }), 600);
      m.count = 0; m.frustumCulled = false; m.name = 'signal lamps'; this.group.add(m); return m;
    });
    // placeholders with the attributes of the tile meshes: the loading warm-up compiles each material once, for every tile after it
    const ph = () => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9), 3)); return g; };
    const phUV = () => { const g = ph(); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(6), 2)); return g; };
    { const w = new THREE.Mesh(phUV(), this.signMat); w.frustumCulled = false; w.position.set(0, -400, 0); w.receiveShadow = true; this.group.add(w); }
    for (const m of [this.mat, this.markMat, this.glowMat]) { const w = new THREE.Mesh(ph(), m); w.frustumCulled = false; w.position.set(0, -400, 0); w.castShadow = m !== this.glowMat; w.receiveShadow = m !== this.glowMat; this.group.add(w); }
    this.m4 = new THREE.Matrix4(); this.sigAt = -9;
  }
  get have() { return this.index.size > 0; }
  wanted(fx, fz) {
    const out = [], R = this.R, i0 = Math.floor((fx - R) / TILE) + OFF, i1 = Math.floor((fx + R) / TILE) + OFF, j0 = Math.floor((fz - R) / TILE) + OFF, j1 = Math.floor((fz + R) / TILE) + OFF;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const e = this.index.get(i * 4096 + j); if (!e) continue;
      const cx = (i - OFF) * TILE + TILE / 2, cz = (j - OFF) * TILE + TILE / 2, dx = Math.max(Math.abs(fx - cx) - TILE / 2, 0), dz = Math.max(Math.abs(fz - cz) - TILE / 2, 0);
      if (dx * dx + dz * dz <= R * R) out.push({ e, d: dx * dx + dz * dz });
    }
    return out.sort((a, b) => a.d - b.d);
  }
  update(dt, cam, focus) {
    if (!this.have) return;
    this.t += dt;
    this.glowMat.color.setScalar(0.03 + 0.97 * Math.min(1, nightU.value));
    if (this.jobs.length) { const j = this.jobs[0]; if (j.step(3)) { this.jobs.shift(); this.finish(j); } }
    if (this.t - this.last >= 0.4) {
      this.last = this.t;
      const want = this.wanted(focus.x, focus.z), keep = new Set();
      for (const { e } of want) {
        const id = e.ti * 4096 + e.tj; keep.add(id); if (this.tiles.has(id)) continue;
        const rec = { e, state: 'loading', meshes: null, col: null, solid: new Map() }; this.tiles.set(id, rec);
        this.wd.get(e.key).then((chunk) => { if (this.tiles.get(id) !== rec) return; rec.chunk = chunk; rec.state = 'building'; const b = new TileBuild(e.key, e.ti, e.tj, chunk, this.lines, this.atlas, this.nearRoad); rec.build = b; this.jobs.push(b); }, (err) => { rec.state = 'failed'; console.warn('streetscape', e.key, err); });
      }
      for (const [id, rec] of this.tiles) {
        const cx = (rec.e.ti - OFF) * TILE + TILE / 2, cz = (rec.e.tj - OFF) * TILE + TILE / 2, d = Math.hypot(focus.x - cx, focus.z - cz);
        if (!keep.has(id) && d > this.R + 450) this.drop(id, rec);
      }
      this.stats.tiles = this.tiles.size; this.atlas.flush();
    }
    if (this.t - this.lastCol >= 0.25) { this.lastCol = this.t; this.solid(focus); }
    if (this.t - this.sigAt >= 0.5) { this.sigAt = this.t; this.signals(focus); }
  }
  finish(b) {
    const id = b.ti * 4096 + b.tj, rec = this.tiles.get(id); if (!rec || rec.build !== b) { for (const n of b.names) this.atlas.give(n); return; }
    const meshes = [];
    for (const [geo, mat] of [[b.S, this.mat], [b.M, this.markMat], [b.G, this.glowMat]]) {
      if (geo.empty) continue;
      const m = new THREE.Mesh(geo.geometry(), mat); m.position.set(b.ox, 0, b.oz); m.matrixAutoUpdate = false; m.updateMatrix(); m.receiveShadow = mat !== this.glowMat; m.castShadow = false; m.name = 'str ' + b.key; this.group.add(m); meshes.push(m);
      this.stats.tris += geo.i.length / 3;
    }
    if (b.T.i.length) {
      const g = new THREE.BufferGeometry(), T = b.T;
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(T.p), 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(T.n), 3)); g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(T.uv), 2)); g.setIndex(T.i); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, this.signMat); m.position.set(b.ox, 0, b.oz); m.matrixAutoUpdate = false; m.updateMatrix(); m.receiveShadow = true; m.name = 'str plates ' + b.key; this.group.add(m); meshes.push(m);
      this.stats.tris += T.i.length / 3;
    }
    rec.names = b.names;
    { const Pp = b.top.p.concat(b.asph), I = b.top.i.slice(); for (let k = b.top.p.length / 3; k < Pp.length / 3; k++) I.push(k); surf.add('str:' + id, Pp, I); }
    rec.meshes = meshes; rec.state = 'ready'; rec.heads = new Float32Array(b.heads); rec.obst = new Float32Array(b.obst); rec.boxes = new Float32Array(b.boxes); rec.recs = b.recs; rec.plateAt = b.plateAt; rec.topP = new Float32Array(b.top.p); rec.topI = new Uint32Array(b.top.i); rec.tris = b.S.i.length / 3 + b.M.i.length / 3 + b.G.i.length / 3 + b.T.i.length / 3;
    rec.build = null; rec.tile = { ox: b.ox, oz: b.oz, audit: b.audit }; for (const k of ['pave', 'lamps', 'trees', 'signals', 'crossings', 'corners', 'arrows', 'diamonds', 'bus', 'stops', 'shelters', 'entrances', 'small', 'mid', 'plates', 'deepSkirt']) { this.stats[k] += b.stats[k]; } rec.counts = b.stats;
  }
  drop(id, rec) {
    if (rec.meshes) { for (const m of rec.meshes) { this.group.remove(m); m.geometry.dispose(); } this.stats.tris -= rec.tris || 0; for (const k of ['pave', 'lamps', 'trees', 'signals', 'crossings', 'corners', 'arrows', 'diamonds', 'bus', 'stops', 'shelters', 'entrances', 'small', 'mid', 'plates', 'deepSkirt']) this.stats[k] -= rec.counts[k]; }
    if (rec.build) { const i = this.jobs.indexOf(rec.build); if (i >= 0) this.jobs.splice(i, 1); for (const n of rec.build.names) this.atlas.give(n); }
    for (const n of rec.names || []) this.atlas.give(n);
    this.release(rec);
    this.tiles.delete(id); this.wd.drop(rec.e.key); surf.remove('str:' + id);
  }
  release(rec) {
    for (const parts of rec.solid.values()) this.phys.removeBox(parts);
    rec.solid.clear();
    if (rec.col) { this.phys.world.removeCollider(rec.col, false); rec.col = null; }
  }
  // the pavement of the tiles close to the focus can be walked on and driven over (a trimesh), and the poles and trunks within a short walk are solid
  solid(focus) {
    const fx = focus.x, fz = focus.z, near = this.RC + 40; let made = 0, solid = 0, walk = 0;
    for (const rec of this.tiles.values()) {
      if (rec.state !== 'ready') continue;
      const cx = rec.tile.ox, cz = rec.tile.oz, d = Math.max(Math.abs(fx - cx), Math.abs(fz - cz)) - TILE / 2;
      if (d < 90 && !rec.col && rec.topI.length && made < 1) { made++; rec.col = this.mesh(rec); }
      else if (d > 190 && rec.col) { this.phys.world.removeCollider(rec.col, false); rec.col = null; }
      if (rec.col) walk++;
      const O = rec.obst;
      if (d > near) { if (rec.solid.size) { for (const b of rec.solid.values()) this.phys.removeBox(b); rec.solid.clear(); } continue; }
      let k = 0;
      // the footprints (shelters, entrances, benches, vending machines) after the poles, keyed on from the poles' count
      const X = rec.boxes;
      for (let q = 0, kb = O.length / 5; q < X.length; q += 7, kb++) {
        const dd = Math.hypot(X[q] - fx, X[q + 1] - fz), has = rec.solid.get(kb), r = Math.max(X[q + 4], X[q + 5]);
        if (dd < this.RC && !has) rec.solid.set(kb, this.phys.addYawBox(X[q], X[q + 2] + X[q + 3] / 2, X[q + 1], X[q + 4], X[q + 3] / 2, X[q + 5], X[q + 6], { tag: 'prop', kind: 0, x0: X[q] - r, x1: X[q] + r, z0: X[q + 1] - r, z1: X[q + 1] + r, y0: X[q + 2], h: X[q + 2] + X[q + 3] }));
        else if (dd > this.RC + 30 && has) { this.phys.removeBox(has); rec.solid.delete(kb); }
      }
      for (let q = 0; q < O.length; q += 5, k++) {
        const dd = Math.hypot(O[q] - fx, O[q + 1] - fz), has = rec.solid.get(k);
        if (dd < this.RC && !has) { rec.solid.set(k, this.phys.addYawBox(O[q], O[q + 2] + O[q + 3] / 2, O[q + 1], O[q + 4], O[q + 3] / 2, O[q + 4], 0, { tag: 'prop', kind: 0, x0: O[q] - O[q + 4], x1: O[q] + O[q + 4], z0: O[q + 1] - O[q + 4], z1: O[q + 1] + O[q + 4], y0: O[q + 2], h: O[q + 2] + O[q + 3] })); }
        else if (dd > this.RC + 30 && has) { this.phys.removeBox(has); rec.solid.delete(k); }
      }
      solid += rec.solid.size;
    }
    this.stats.solid = solid; this.stats.walk = walk;
  }
  mesh(rec) {
    const R = this.phys.R, L = localPoints(rec.topP);   // the pavement tops are kept in world coordinates; the collider holds them about their own centre (EV-04)
    return this.phys.world.createCollider(R.ColliderDesc.trimesh(L.P, rec.topI).setTranslation(L.x, 0, L.z).setFriction(1).setCollisionGroups(grp(GR.STATIC, 0xffff)));
  }
  // the lamps of the signal heads near the focus: the colour that the group shows now
  signals(focus) {
    const t = this.t;   // real seconds: the cycle is a walking-pace thing, not scaled with the world clock
    const cnt = [0, 0, 0], M = this.m4, lim = 600;
    // the lamps about a point near the focus, the meshes placed there (EV-04): world metres as 32-bit floats are 3 cm apart at Jeju
    const ax = Math.round(focus.x / 256) * 256, az = Math.round(focus.z / 256) * 256;
    for (const rec of this.tiles.values()) {
      if (rec.state !== 'ready' || !rec.heads.length) continue;
      if (Math.max(Math.abs(focus.x - rec.tile.ox), Math.abs(focus.z - rec.tile.oz)) - TILE / 2 > 260) continue;
      const H = rec.heads;
      for (let q = 0; q < H.length; q += 7) {
        const dx = H[q] - focus.x, dz = H[q + 2] - focus.z; if (dx * dx + dz * dz > 260 * 260) continue;
        const s = signalState(H[q + 5], t, H[q + 6]), m = this.lamps[s]; if (cnt[s] >= lim) continue;
        // lamp order top to bottom: red, yellow, green
        const hx = H[q + 3], hz = H[q + 4], y = H[q + 1] + (s === 0 ? 0.3 : s === 1 ? 0 : -0.3), ang = Math.atan2(hx, hz);
        M.makeRotationY(ang); M.setPosition(H[q] - ax, y, H[q + 2] - az); m.setMatrixAt(cnt[s]++, M);
      }
    }
    this.lamps.forEach((m, s) => { m.count = cnt[s]; m.position.set(ax, 0, az); m.instanceMatrix.needsUpdate = true; });
  }
}
