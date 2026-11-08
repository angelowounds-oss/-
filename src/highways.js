import * as THREE from 'three';
import { net, groundH, HALF_W, CARVE_FADE, BROKEN, breakSegment, roadAt } from './roadnet.js';
import { cities } from './worldmap.js';
import { rand } from './util.js';
import { landHeight, physHeight } from './landfn.js';
import { regionWeight, TUNNEL_FILL, carve } from './region.js';
import { Deck, oldDeck, oldHalf } from './roaddeck.js';
import { GR, grp } from './physics.js';
import * as surf from './roadsurf.js';
import { pullFar } from './shaders.js';

// The highway network drawn (roadnet.js has the data): asphalt ribbons with lane markings, median barrier and guard rails, bridges with pillars,
// tunnels with lights, ramps, sign gantries, toll plazas and service areas; street lamps are an instanced pool that follows the camera.
// Static geometry is built once, in chunks of CHUNK samples (3 km) so frustum culling works, three meshes per chunk (asphalt / structure with
// vertex colours / emissive). Materials are created here so the load-time warm-up compiles them.
const CHUNK = 100, LANE = 3.75, MED = 3.2, SHOULDER = 2.4;
// compiled arterial lines (roadnet kind 'arterial', ADR-0019): pieces of ART samples built near the camera and dropped beyond; the big roads are seen
// from further away
const LOCAL_LAMPS = { secondary: 1, secondary_link: 1, tertiary: 1, tertiary_link: 1, residential: 1 };   // no lamp poles along the smaller roads
const ART = 60, ART_ON = { motorway: 8000, trunk: 8000, primary: 3000, secondary: 2200, motorway_link: 3000, trunk_link: 3000, primary_link: 2200, secondary_link: 1600, tertiary: 1600, tertiary_link: 1200, residential: 700 }, ART_OFF = 1.4, ART_BUDGET = 4, NEAR_NOW = 160;   // pieces within NEAR_NOW of the camera are built at once, over the time budget
const lerp = (a, b, t) => a + (b - a) * t;
// the ground over a tunnel (GPL-18): the physics ground along a tunnel is filled down to its road (so the cars inside have a floor and the old checks
// "is this car under the ground" stay right), and a height field can have no hole; a mesh at the drawn ground over the whole filled corridor is the
// ground walked and driven on, and over the tunnel it is never lower than COVER_ROOF over the drawn lining's roof (where the lining stands out of a
// shallow hill, its top). Built within COVER_ON of the camera or the player, dropped beyond COVER_OFF
const COVER_ROOF = 0.05, COVER_ON = 700, COVER_OFF = 1000;

class Acc {
  constructor() { this.p = []; this.n = []; this.c = []; this.u = []; this.i = []; this.k = 0; }
  // flat-shaded quad a-b-c-d (counter-clockwise seen from the side the normal points to)
  quad(a, b, c, d, col, ua, ub, uc, ud) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const q of [a, b, c, d]) { this.p.push(q[0], q[1], q[2]); this.n.push(nx, ny, nz); this.c.push(col[0], col[1], col[2]); }
    if (ua) this.u.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1], ud[0], ud[1]); else this.u.push(0, 0, 0, 0, 0, 0, 0, 0);
    const k = this.k; this.i.push(k, k + 1, k + 2, k, k + 2, k + 3); this.k += 4;
  }
  get empty() { return this.k === 0; }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2)); g.setIndex(this.i);
    g.computeBoundingSphere(); const m = new THREE.Mesh(g, mat); m.castShadow = false; m.receiveShadow = false; return m;
  }
}
// an axis-aligned box in a road's local frame is awkward; boxes here are built from the frame (centre, tangent, right) directly
function box(acc, c, tx, tz, w, h, d, y0, col) {   // centre c = [x, z], tangent (tx, tz), width w across, depth d along, from y0 up h
  const rx = tz, rz = -tx, hw = w / 2, hd = d / 2;
  const P = (sx, sy, sz) => [c[0] + rx * hw * sx + tx * hd * sz, y0 + (sy > 0 ? h : 0), c[1] + rz * hw * sx + tz * hd * sz];
  const a = P(-1, 0, -1), b = P(1, 0, -1), cc = P(1, 0, 1), dd = P(-1, 0, 1), e = P(-1, 1, -1), f = P(1, 1, -1), g = P(1, 1, 1), hh = P(-1, 1, 1);
  acc.quad(e, hh, g, f, col); acc.quad(a, e, f, b, col); acc.quad(b, f, g, cc, col); acc.quad(cc, g, hh, dd, col); acc.quad(dd, hh, e, a, col);
}

function asphaltTexture(lanes) {
  const cv = document.createElement('canvas'), W = lanes < 2 ? 64 : 256, H = 128; cv.width = W; cv.height = H; const g = cv.getContext('2d');
  g.fillStyle = '#3a3c42'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 1800; i++) { const v = 44 + Math.random() * 26; g.fillStyle = `rgb(${v},${v},${v + 4})`; g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1 + Math.random() * 2); }
  const wTotal = lanes === 1 ? 9.2 : Math.max(1, Math.round(lanes)) * LANE + SHOULDER, px = (m) => (m / wTotal) * W;   // lanes 1: the ramp ribbon; -n: n lanes of a carriageway
  g.fillStyle = '#e9e9e2';
  if (lanes === 1) { g.fillRect(px(0.35), 0, 3, H); g.fillRect(px(8.85) - 3, 0, 3, H); }
  else if (lanes < 2) { g.fillStyle = '#e8c640'; g.fillRect(px(0.15), 0, 4, H); g.fillStyle = '#ecece4'; g.fillRect(px(LANE) - 2, 0, 4, H); }   // a single lane: edge lines only
  else {
    g.fillStyle = '#e8c640'; g.fillRect(px(0.15), 0, 4, H);                        // yellow edge at the median
    g.fillStyle = '#ecece4';
    for (let l = 1; l < lanes; l++) for (let d = 0; d < 2; d++) g.fillRect(px(l * LANE) - 2, d * 64 + 6, 4, 34);   // dashed lane lines
    g.fillRect(px(lanes * LANE) - 2, 0, 4, H);                                      // solid line at the shoulder
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function signTexture(to, km) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const g = cv.getContext('2d');
  g.fillStyle = '#0c6b3a'; g.fillRect(0, 0, 512, 128); g.strokeStyle = '#f2f2ea'; g.lineWidth = 6; g.strokeRect(5, 5, 502, 118);
  g.fillStyle = '#f2f2ea'; g.font = '700 46px "Anton", "Space Mono", sans-serif'; g.textBaseline = 'middle'; g.fillText(to, 22, 48);
  g.font = '700 38px "Space Mono", monospace'; g.fillText(km + ' km', 22, 100); g.font = '700 70px sans-serif'; g.fillText('→', 400, 66);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

export class Highways {
  constructor(scene) {
    this.scene = scene; this.group = new THREE.Group(); this.group.name = 'highways'; this.N = net(); this.urban = cities();
    const t3 = asphaltTexture(3), t1 = asphaltTexture(1); t3.repeat.set(1, 1); t1.repeat.set(1, 1);
    this.mats = {
      asphalt: new THREE.MeshStandardMaterial({ map: t3, roughness: 0.82, metalness: 0, envMapIntensity: 0.3 }),
      ramp: new THREE.MeshStandardMaterial({ map: t1, roughness: 0.82, metalness: 0, envMapIntensity: 0.3 }),
      struct: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.05 }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    };
    // one carriageway of 1..4 lanes: the same shader as the highway asphalt, only its texture differs (no new program at run time)
    this.mats.lanes = [1, 2, 3, 4].map((n) => { const t = asphaltTexture(n === 1 ? 1.0001 : n); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.82, metalness: 0, envMapIntensity: 0.3 }); });
    for (const m of [this.mats.asphalt, this.mats.ramp, ...this.mats.lanes]) pullFar(m);
    this.stats = { chunks: 0, tris: 0, artPieces: 0, artLive: 0, artVerts: 0, artLifted: 0 }; this.cm = new Map(); this.decks = new Map(); this.piers = new Map(); this.pcols = new Map();
    for (const r of this.N.roads) if (r.kind !== 'arterial') this.buildRoad(r);
    this.art = []; for (const r of this.N.roads) if (r.kind === 'arterial') for (let a = 0; a < r.pts.length - 1; a += ART) {
      const b = Math.min(r.pts.length - 1, a + ART); let cx = 0, cz = 0, rad = 0; for (let i = a; i <= b; i++) { cx += r.pts[i][0]; cz += r.pts[i][1]; } cx /= b - a + 1; cz /= b - a + 1;
      for (let i = a; i <= b; i++) rad = Math.max(rad, Math.hypot(r.pts[i][0] - cx, r.pts[i][1] - cz));
      this.art.push({ r, a, b, cx, cz, rad, on: ART_ON[r.hw] || 2200, meshes: null });
    }
    this.stats.artPieces = this.art.length;
    // the tunnel runs of every road (in pieces of at most ART segments), for the ground over them
    this.covers = []; this.tgrid = new Map(); this.stats.covers = 0; this.stats.coverTris = 0;
    for (const r of this.N.roads) {
      const n = r.pts.length, m = r.closed ? n : n - 1; let a = -1;
      for (let i = 0; i <= m; i++) {
        const tun = i < m && (r.cls[i] === 2 || r.cls[(i + 1) % n] === 2);
        if (tun) this.gridTunnel(r, i);
        if (tun && a < 0) a = i;
        if (a >= 0 && (!tun || i - a >= ART)) { this.covers.push(this.coverRun(r, a, i)); a = tun ? i : -1; }
      }
    }
    this.buildGantries(); this.buildTolls(); this.buildServices();
    this.lamps = this.buildLamps();
    scene.add(this.group);
  }

  frame(r, i) {   // centre, tangent, right of sample i
    const P = r.pts, n = P.length, a = P[r.closed ? (i + n - 1) % n : Math.max(0, i - 1)], b = P[r.closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    return { x: P[i][0], z: P[i][1], y: r.y[i], tx, tz, rx: tz, rz: -tx, cls: r.cls[i] };
  }

  buildRoad(r) {
    const n = r.pts.length, m = r.closed ? n : n - 1; let dist = 0; r.st = [];
    for (let c0 = 0; c0 < m; c0 += CHUNK) { r.st.push(dist); dist = this.chunk(r, c0, dist); }
  }
  // one 3 km chunk of a road (also rebuilt when a bridge in it is blown up): returns the distance along the road at its end
  chunk(r, c0, dist) {
    const n = r.pts.length, ramp = r.kind === 'ramp', m = r.closed ? n : n - 1;
    const half = ramp ? 4.6 : MED / 2 + 3 * LANE + SHOULDER, medH = MED / 2;
    const BARR = [0.3, 0.36, 0.38], CONC = [0.46, 0.47, 0.5], RAIL = [0.55, 0.57, 0.6], DARK = [0.19, 0.2, 0.22], PIL = [0.4, 0.41, 0.44], LIGHT = [3.2, 2.9, 2.2];
    {
      const A = new Acc(), S = new Acc(), E = new Acc(), c1 = Math.min(m, c0 + CHUNK), top = [], piers = [];
      for (let i = c0; i < c1; i++) {
        const f0 = this.frame(r, i), f1 = this.frame(r, (i + 1) % n), seg = Math.hypot(f1.x - f0.x, f1.z - f0.z), v0 = dist / 12, v1 = (dist + seg) / 12; dist += seg;
        const at = (f, off, dy = 0) => [f.x + f.rx * off, f.y + dy, f.z + f.rz * off];
        const bridge = f0.cls === 1 || f1.cls === 1, tunnel = f0.cls === 2 || f1.cls === 2;
        if (BROKEN.has(r.id + ':' + i)) continue;   // a blown-up span: no deck, rails or pillars
        const k0 = A.i.length / 3;
        if (ramp) {
          A.quad(at(f0, -half), at(f0, half), at(f1, half), at(f1, -half), [1, 1, 1], [0, v0], [1, v0], [1, v1], [0, v1]);
          for (const s of [-1, 1]) { const o = s * (half + 0.15); S.quad(at(f0, o, 0.8), at(f1, o, 0.8), at(f1, o, 0), at(f0, o, 0), RAIL); S.quad(at(f0, o - s * 0.12, 0.8), at(f1, o - s * 0.12, 0.8), at(f1, o + s * 0.12, 0.8), at(f0, o + s * 0.12, 0.8), RAIL); }
        } else {
          // two carriageways, texture across 0..1 from the median edge to the shoulder edge
          for (const s of [-1, 1]) {
            const a0 = medH, a1 = half;
            if (s > 0) A.quad(at(f0, a0), at(f1, a0), at(f1, a1), at(f0, a1), [1, 1, 1], [0, v0], [0, v1], [1, v1], [1, v0]);
            else A.quad(at(f0, -a1), at(f1, -a1), at(f1, -a0), at(f0, -a0), [1, 1, 1], [1, v0], [1, v1], [0, v1], [0, v0]);
          }
          // median: a concrete barrier, 1.1 m wide, 0.85 m high; the rest of the median is dark paving
          S.quad(at(f0, -medH, 0.02), at(f1, -medH, 0.02), at(f1, medH, 0.02), at(f0, medH, 0.02), DARK);
          S.quad(at(f0, -0.55, 0.85), at(f1, -0.55, 0.85), at(f1, 0.55, 0.85), at(f0, 0.55, 0.85), CONC);
          S.quad(at(f0, -0.55, 0), at(f1, -0.55, 0), at(f1, -0.55, 0.85), at(f0, -0.55, 0.85), CONC); S.quad(at(f0, 0.55, 0.85), at(f1, 0.55, 0.85), at(f1, 0.55, 0), at(f0, 0.55, 0), CONC);
          // guard rails at both outer edges
          for (const s of [-1, 1]) { const o = s * (half + 0.3); S.quad(at(f0, o - s * 0.15, 0.78), at(f1, o - s * 0.15, 0.78), at(f1, o + s * 0.15, 0.78), at(f0, o + s * 0.15, 0.78), RAIL); S.quad(at(f0, o - s * 0.15, 0.78), at(f0, o - s * 0.15, 0.35), at(f1, o - s * 0.15, 0.35), at(f1, o - s * 0.15, 0.78), RAIL); }
        }
        for (let t = k0; t < A.i.length / 3; t++) top[t] = !tunnel;   // the drawn top (roadsurf.js), not a tunnel's floor
        if (!ramp && !tunnel) {   // furniture of the open road: sound barriers beside the towns, delineator posts, a kilometre post every kilometre
          const urban = this.urban.some((u) => Math.hypot(f0.x - u.x, f0.z - u.z) < u.r * 2.1);
          if (urban && !bridge) for (const s of [-1, 1]) { const o = s * (half + 1.5), p0 = at(f0, o, 0), p1 = at(f1, o, 0), up = (q, h) => [q[0], q[1] + h, q[2]]; S.quad(p0, p1, up(p1, 3.6), up(p0, 3.6), BARR); S.quad(up(p0, 3.6), up(p1, 3.6), p1, p0, BARR); S.quad(up(p0, 3.6), up(p1, 3.6), [p1[0] + f1.rx * s * 0.05, p1[1] + 3.75, p1[2] + f1.rz * s * 0.05], [p0[0] + f0.rx * s * 0.05, p0[1] + 3.75, p0[2] + f0.rz * s * 0.05], [0.2, 0.2, 0.22]); }
          for (const s of [-1, 1]) if (i % 2 === 0) box(S, [f0.x + f0.rx * s * (half + 0.9), f0.z + f0.rz * s * (half + 0.9)], f0.tx, f0.tz, 0.14, 1.1, 0.14, f0.y, [0.85, 0.85, 0.8]);
          if (i % 33 === 0 && !bridge) box(S, [f0.x + f0.rx * (half + 3), f0.z + f0.rz * (half + 3)], f0.tx, f0.tz, 0.2, 1.4, 0.9, f0.y, [0.05, 0.3, 0.12]);
        }
        if (bridge) {   // fascia and underside; pillars every fourth sample
          for (const s of [-1, 1]) { const o = s * (half + 0.5); S.quad(at(f0, o, 0), at(f1, o, 0), at(f1, o, -1.7), at(f0, o, -1.7), PIL); }
          S.quad(at(f0, -half - 0.5, -1.7), at(f1, -half - 0.5, -1.7), at(f1, half + 0.5, -1.7), at(f0, half + 0.5, -1.7), PIL);
          if (i % 4 === 0) { const gy = groundH(f0.x, f0.z, 30), h = f0.y - 1.7 - gy, w = ramp ? 3 : 6; if (h > 0.6 && ![-0.5, 0, 0.5].some((u) => this.roadNear(f0.x + f0.rx * w * u, f0.z + f0.rz * w * u, r, 1.5, 1))) { box(S, [f0.x, f0.z], f0.tx, f0.tz, w, h, 2.6, gy, PIL); piers.push([f0.x, f0.z, f0.tx, f0.tz, w, h, 2.6, gy]); } }   // not on a road beneath
        }
        if (tunnel) {   // lining: walls and ceiling seen from inside, a light strip along the ceiling
          const w = half + 1.4, hgt = 7.0, wall = [0.34, 0.35, 0.38];
          for (const s of [-1, 1]) { const o = s * w; if (s > 0) S.quad(at(f0, o, hgt), at(f1, o, hgt), at(f1, o, 0), at(f0, o, 0), wall); else S.quad(at(f0, o, 0), at(f1, o, 0), at(f1, o, hgt), at(f0, o, hgt), wall); }
          S.quad(at(f0, w, hgt), at(f0, -w, hgt), at(f1, -w, hgt), at(f1, w, hgt), [0.28, 0.29, 0.31]);
          E.quad(at(f0, -0.7, hgt - 0.05), at(f0, 0.7, hgt - 0.05), at(f1, 0.7, hgt - 0.05), at(f1, -0.7, hgt - 0.05), LIGHT);
          for (const s of [-1, 1]) E.quad(at(f0, s * (w - 0.05), 1.2), at(f1, s * (w - 0.05), 1.2), at(f1, s * (w - 0.05), 1.35), at(f0, s * (w - 0.05), 1.35), [0.5, 1.4, 2.2]);
        }
        // portal frames where the class changes
        if (i > c0 || c0 === 0) {
          const prev = i > 0 ? r.cls[i - 1] : 0;
          if ((f0.cls === 2) !== (prev === 2) && i > 0) { const w = half + 1.4; box(S, [f0.x + f0.rx * (w + 0.8), f0.z + f0.rz * (w + 0.8)], f0.tx, f0.tz, 1.6, 9, 3, f0.y, CONC); box(S, [f0.x - f0.rx * (w + 0.8), f0.z - f0.rz * (w + 0.8)], f0.tx, f0.tz, 1.6, 9, 3, f0.y, CONC); box(S, [f0.x, f0.z], f0.tx, f0.tz, 2 * w + 3.2, 2, 3, f0.y + 7.0, CONC); }
        }
      }
      const made = []; for (const [acc, mat] of [[A, ramp ? this.mats.ramp : this.mats.asphalt], [S, this.mats.struct], [E, this.mats.glow]]) if (!acc.empty) { const mesh = acc.mesh(mat); this.group.add(mesh); made.push(mesh); this.stats.tris += acc.i.length / 3; }
      this.cm.set(r.id + ':' + c0, made); this.piers.set(r.id + ':' + c0, piers); this.stats.chunks++; surf.add('hw:' + r.id + ':' + c0, A.p, A.i, (t) => top[t]);
    }
    return dist;
  }
  // bridges can be blown up: a span of two 30 m samples loses its deck (colliders: the physics ground there is the valley again), the rest of the
  // chunk is drawn anew without it, cars stop coming; spans are remembered in the save and stand again after five days
  attach(G) {
    this.G = G; this.phys = G.phys; for (const r of this.N.roads) if (r.kind !== 'arterial') for (let c0 = 0; c0 < r.pts.length; c0 += CHUNK) this.deckChunk(r, c0); const P = (G.state.places = G.state.places || { dead: {}, ruins: {} }); P.bridges = P.bridges || {}; this.hp = new Map(); this.byId = new Map(this.N.roads.map((r) => [r.id, r]));
    for (const [k, v] of Object.entries(P.bridges)) { if (G.clock.t - v.t > 7200) { delete P.bridges[k]; continue; } this.breakSpan(this.byId.get(v.road), v.span, true); }
  }
  // ---- physics decks: where the ground below a road is not at its surface (a viaduct, a stacked interchange, a tunnel, a road laid at another height than
  // the ground there) the drawn asphalt also gets a thin triangle mesh to stand on; a chunk or piece that is dropped takes its deck with it
  makeDeck(D) {
    if (!D.P.length || !this.phys) return null;
    const R = this.phys.R; return this.phys.world.createCollider(R.ColliderDesc.trimesh(new Float32Array(D.P), new Uint32Array(D.I)).setFriction(1).setCollisionGroups(grp(GR.STATIC, 0xffff)));
  }
  dropDeck(c) { if (c && this.phys) this.phys.world.removeCollider(c, true); }
  deckChunk(r, c0) {
    const key = r.id + ':' + c0; this.dropDeck(this.decks.get(key)); this.decks.delete(key);
    const D = oldDeck(r, c0, CHUNK, BROKEN);
    const c = this.makeDeck(D); if (c) this.decks.set(key, c);
    this.dropPiers(this.pcols.get(key)); this.pcols.set(key, this.makePiers(this.piers.get(key)));
  }
  // a solid box for each drawn pier (x, z, tangent, width across, height, depth along, foot y): a car that leaves the road beneath stops against it
  makePiers(L) {
    if (!L || !L.length || !this.phys) return null;
    const R = this.phys.R, out = [];
    for (const [x, z, tx, tz, w, h, d, y0] of L) { const a = Math.atan2(tx, tz); out.push(this.phys.world.createCollider(R.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, y0 + h / 2, z).setRotation({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) }).setFriction(0.6).setCollisionGroups(grp(GR.STATIC, 0xffff)))); }
    this.stats.pierCols = (this.stats.pierCols || 0) + out.length; return out;
  }
  dropPiers(L) { if (L && this.phys) { for (const c of L) this.phys.world.removeCollider(c, true); this.stats.pierCols -= L.length; } }
  blast(x, y, z, radius, dmg) {
    if (!this.G) return;
    for (const r of this.N.roads) for (let i = 0; i < r.pts.length - 1; i++) {
      // compiled lines keep their bridges (no span bookkeeping yet)
      if (r.cls[i] !== 1 || r.kind === 'arterial') continue;
      const p = r.pts[i], dx = p[0] - x, dz = p[1] - z; if (Math.abs(dx) > radius + 16 || Math.abs(dz) > radius + 16) continue;
      const d = Math.hypot(dx, dz); if (d > radius + 16 || Math.abs(r.y[i] - y) > radius + 30) continue;
      const span = i >> 1, key = r.id + ':' + span; if (BROKEN.has(r.id + ':' + span * 2)) continue;
      const hp = (this.hp.get(key) ?? 480) - dmg * (1 - d / (radius + 16)) * 1.4; this.hp.set(key, hp); if (hp <= 0) this.breakSpan(r, span, false);
    }
  }
  breakSpan(r, span, silent) {
    if (!r) return; for (const i of [span * 2, span * 2 + 1]) if (i < r.pts.length - 1) breakSegment(r, i);
    this.rebuild(r, span * 2); const G = this.G, p = r.pts[Math.min(r.pts.length - 1, span * 2 + 1)];
    if (silent) return;
    G.state.places.bridges[r.id + ':' + span] = { road: r.id, span, t: G.clock.t }; G.farland?.ground?.clear?.();
    for (let k = 0; k < 30; k++) G.smokeP.emit(p[0] + rand(-12, 12), r.y[span * 2] + rand(-2, 3), p[1] + rand(-12, 12), rand(-3, 3), rand(-1, 5), rand(-3, 3), rand(4, 8), rand(5, 9), 0.12, 0.11, 0.1, 0.8, 0.2, 0.5);
    G.audio.explosion?.(1.6, 0); G.memory?.log('collapse', p[0], p[1], { city: '', text: '고속도로 교량 붕괴' }); G.addHeat?.(15);
  }
  // blown-up spans: the chunk is made again without them
  rebuild(r, i) { const c0 = Math.floor(i / CHUNK) * CHUNK, key = r.id + ':' + c0; for (const o of this.cm.get(key) || []) { this.group.remove(o); o.geometry.dispose(); this.stats.tris -= (o.geometry.index ? o.geometry.index.count : 0) / 3; this.stats.chunks--; } this.chunk(r, c0, r.st[c0 / CHUNK]); this.deckChunk(r, c0); }

  // ---- sign gantries
  buildGantries() {
    const S = new Acc(), steel = [0.5, 0.52, 0.56]; const signs = [];
    for (const g of this.N.gantries) {
      const r = this.N.roads.find((q) => q.id === g.road), f = this.frame(r, g.idx), half = MED / 2 + 3 * LANE + SHOULDER + 1.2;
      for (const s of [-1, 1]) box(S, [f.x + f.rx * s * half, f.z + f.rz * s * half], f.tx, f.tz, 0.7, 8.2, 0.7, f.y, steel);
      box(S, [f.x, f.z], f.tx, f.tz, 2 * half, 0.6, 0.7, f.y + 7.6, steel);
      for (const s of [-1, 1]) {   // one panel over each carriageway; the one for traffic in the other direction faces the other way
        const cx = f.x + f.rx * s * (MED / 2 + 5.5), cz = f.z + f.rz * s * (MED / 2 + 5.5);
        signs.push({ x: cx, y: f.y + 5.4, z: cz, tx: f.tx, tz: f.tz, s, to: g.to, km: g.km });
      }
    }
    if (!S.empty) { this.group.add(S.mesh(this.mats.struct)); }
    const geo = new THREE.PlaneGeometry(8.4, 2.1);
    for (const sg of signs) {
      const mat = new THREE.MeshStandardMaterial({ map: signTexture(sg.to, sg.km), emissive: 0xffffff, emissiveMap: null, roughness: 0.6, metalness: 0 });
      mat.emissiveMap = mat.map; mat.emissiveIntensity = 0.55;
      const m = new THREE.Mesh(geo, mat); m.position.set(sg.x - sg.tx * 0.4 * sg.s, sg.y, sg.z - sg.tz * 0.4 * sg.s); m.rotation.y = Math.atan2(-sg.tx * sg.s, -sg.tz * sg.s) + 0; m.frustumCulled = true; this.group.add(m);
    }
  }

  // ---- toll plazas: a canopy across the road with a booth island per lane group
  buildTolls() {
    const S = new Acc(), E = new Acc(), steel = [0.5, 0.52, 0.56], booth = [0.78, 0.78, 0.72], STRIP = [2.4, 1.5, 0.4];
    for (const t of this.N.tolls) {
      const r = this.N.roads.find((q) => q.id === t.road), f = this.frame(r, Math.max(1, Math.min(r.pts.length - 2, t.idx))), half = MED / 2 + 3 * LANE + SHOULDER + 1.5;
      box(S, [f.x, f.z], f.tx, f.tz, 2 * half + 6, 0.9, 16, f.y + 6.2, [0.62, 0.64, 0.68]);
      E.quad([f.x - f.rx * half + f.tx * 8, f.y + 6.15, f.z - f.rz * half + f.tz * 8], [f.x + f.rx * half + f.tx * 8, f.y + 6.15, f.z + f.rz * half + f.tz * 8], [f.x + f.rx * half - f.tx * 8, f.y + 6.15, f.z + f.rz * half - f.tz * 8], [f.x - f.rx * half - f.tx * 8, f.y + 6.15, f.z - f.rz * half - f.tz * 8], [2.2, 2.0, 1.6]);
      for (const off of [-half - 1.2, -MED / 2 - 3 * LANE - 0.3, -MED / 2 - 1.5 * LANE, -MED / 2, MED / 2, MED / 2 + 1.5 * LANE, MED / 2 + 3 * LANE + 0.3, half + 1.2]) {
        const w = Math.abs(off) > half ? 1.4 : 1.7; box(S, [f.x + f.rx * off, f.z + f.rz * off], f.tx, f.tz, w, 3.1, 7, f.y, Math.abs(off) > half ? steel : booth);
        if (Math.abs(off) <= half) E.quad([f.x + f.rx * off - f.rx * 0.9, f.y + 2.4, f.z + f.rz * off - f.rz * 0.9], [f.x + f.rx * off + f.rx * 0.9, f.y + 2.4, f.z + f.rz * off + f.rz * 0.9], [f.x + f.rx * off + f.rx * 0.9, f.y + 2.9, f.z + f.rz * off + f.rz * 0.9], [f.x + f.rx * off - f.rx * 0.9, f.y + 2.9, f.z + f.rz * off - f.rz * 0.9], STRIP);
      }
    }
    if (!S.empty) this.group.add(S.mesh(this.mats.struct)); if (!E.empty) this.group.add(E.mesh(this.mats.glow));
  }

  // ---- service areas: a slab, a shop, a fuel canopy and a lit sign on the carved pad beside the road
  buildServices() {
    const S = new Acc(), E = new Acc(); const slab = [0.3, 0.31, 0.33], wall = [0.74, 0.72, 0.66], roof = [0.28, 0.3, 0.34];
    for (const sv of this.N.services) {
      const tx = Math.sin(sv.heading), tz = Math.cos(sv.heading), rx = tz, rz = -tx, y = sv.y;   // the road lies toward -side from the pad's centre: the shop stands on the far side, the pumps and the sign near the road
      const at = (a, b) => [sv.x + rx * a + tx * b, sv.z + rz * a + tz * b];
      box(S, at(0, 0), tx, tz, 70, 0.3, 80, y, slab);
      box(S, at(sv.side * 14, -6), tx, tz, 30, 5.6, 12, y + 0.3, wall); box(S, at(sv.side * 14, -6), tx, tz, 32, 0.7, 14, y + 5.9, roof);
      // fuel canopy over four pumps
      const cx = -sv.side * 14;
      for (const [a, b] of [[-8, 16], [8, 16], [-8, 28], [8, 28]]) box(S, at(cx + a * 0.9, b), tx, tz, 0.8, 5.4, 0.8, y + 0.3, [0.5, 0.52, 0.56]);
      box(S, at(cx, 22), tx, tz, 22, 0.7, 16, y + 5.7, roof);
      const g = (a, b, h) => [at(a, b)[0], y + h, at(a, b)[1]];
      E.quad(g(cx - 10.5, 14, 5.65), g(cx + 10.5, 14, 5.65), g(cx + 10.5, 30, 5.65), g(cx - 10.5, 30, 5.65), [2.6, 2.4, 1.9]);
      for (const a of [-4, 4]) box(S, at(cx + a, 22), tx, tz, 0.9, 1.3, 0.9, y + 0.3, [0.85, 0.2, 0.15]);
      // the sign: a tall pylon with a lit panel, facing the road
      box(S, at(-sv.side * 30, 4), tx, tz, 1.2, 14, 1.2, y + 0.3, [0.5, 0.52, 0.56]);
      const px = at(-sv.side * 30, 4); E.quad([px[0] - rx * 3 - tx * 0.7, y + 12.8, px[1] - rz * 3 - tz * 0.7], [px[0] + rx * 3 - tx * 0.7, y + 12.8, px[1] + rz * 3 - tz * 0.7], [px[0] + rx * 3 - tx * 0.7, y + 17, px[1] + rz * 3 - tz * 0.7], [px[0] - rx * 3 - tx * 0.7, y + 17, px[1] - rz * 3 - tz * 0.7], [0.4, 2.2, 1.2]);
    }
    if (!S.empty) this.group.add(S.mesh(this.mats.struct)); if (!E.empty) this.group.add(E.mesh(this.mats.glow));
  }

  // ---- street lamps: median posts with a double arm every 60 m, an instanced pool refilled when the camera has moved 300 m
  buildLamps() {
    const MAX = 900, pole = new THREE.BoxGeometry(0.28, 9.5, 0.28); pole.translate(0, 4.75, 0);
    const arm = new THREE.BoxGeometry(11.5, 0.2, 0.2); arm.translate(0, 9.4, 0);
    const poleMesh = new THREE.InstancedMesh(mergeBoxes([pole, arm]), new THREE.MeshStandardMaterial({ color: 0x5a5e66, roughness: 0.7, metalness: 0.3 }), MAX);
    const head = new THREE.BoxGeometry(1.1, 0.18, 0.5); const heads = new THREE.BufferGeometry();
    const hp = [], h2 = head.clone().translate(-5.2, 9.25, 0), h3 = head.clone().translate(5.2, 9.25, 0);
    const mg = mergeBoxes([h2, h3]);
    const headMesh = new THREE.InstancedMesh(mg, new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.86, 0.55).multiplyScalar(3), toneMapped: false }), MAX); void heads; void hp;
    for (const m of [poleMesh, headMesh]) { m.frustumCulled = false; m.count = 0; this.group.add(m); }
    return { poleMesh, headMesh, MAX, cx: NaN, cz: NaN, mat: new THREE.Matrix4(), q: new THREE.Quaternion(), pos: new THREE.Vector3(), one: new THREE.Vector3(1, 1, 1), up: new THREE.Vector3(0, 1, 0) };
  }
  // distance cull of the road chunks: in the fog nothing beyond ~11 km can be seen from the ground, so a camera near the ground draws only those (the
  // air is thin above 450 m and sees the whole network); every 0.3 s
  cull(camera) {
    const now = performance.now(); if (now - (this.cullAt || 0) < 300) return; this.cullAt = now;
    const x = camera.position.x, z = camera.position.z, cy = camera.position.y, lim = cy > 450 ? 70000 : cy > 120 ? 20000 : 11000;
    for (const m of this.group.children) { if (m.isInstancedMesh) continue; const bs = m.geometry.boundingSphere; if (bs) m.visible = Math.hypot(bs.center.x - x, bs.center.z - z) - bs.radius < lim; }
  }
  update(camera, focus) {
    this.cull(camera); this.arterials(camera, false, focus);
    const L = this.lamps, x = camera.position.x, z = camera.position.z;
    if (Math.hypot(x - L.cx, z - L.cz) < 300) return;
    L.cx = x; L.cz = z; const N = this.N, CS = N.CS, seen = new Set(); let k = 0;
    const R = 2300, c0 = Math.floor((x - R) / CS), c1 = Math.floor((x + R) / CS), d0 = Math.floor((z - R) / CS), d1 = Math.floor((z + R) / CS);
    outer: for (let cx = c0; cx <= c1; cx++) for (let cz = d0; cz <= d1; cz++) {
      const cell = N.grid.get(cx * 100003 + cz); if (!cell) continue;
      for (let q = 0; q < cell.length; q += 2) {
        const ri = cell[q], i = cell[q + 1], r = N.roads[ri]; if (r.kind === 'ramp' || (r.kind === 'arterial' ? LOCAL_LAMPS[r.hw] || i % 5 : i % 2)) continue; const key = ri * 1000003 + i; if (seen.has(key)) continue; seen.add(key);
        const px = r.pts[i][0], pz = r.pts[i][1]; if ((px - x) ** 2 + (pz - z) ** 2 > R * R || r.cls[i] === 2) continue;
        const f = this.frame(r, i), side = r.kind === 'arterial' ? this.artWidth(r).half + 0.8 : 0; L.pos.set(f.x + f.rx * side, f.y, f.z + f.rz * side); L.q.setFromAxisAngle(L.up, Math.atan2(f.rx, f.rz)); L.mat.compose(L.pos, L.q, L.one);
        L.poleMesh.setMatrixAt(k, L.mat); L.headMesh.setMatrixAt(k, L.mat); if (++k >= L.MAX) break outer;
      }
    }
    L.poleMesh.count = L.headMesh.count = k; L.poleMesh.instanceMatrix.needsUpdate = true; L.headMesh.instanceMatrix.needsUpdate = true;
  }
  // ---- compiled arterial lines: one carriageway (or a two-way road without median) per line, its own width and lanes
  artWidth(r) {
    const n = Math.max(1, Math.min(4, r.oneway ? r.lanes : Math.ceil(r.lanes / 2)));
    return r.oneway ? { n, half: (n * LANE + SHOULDER) / 2, two: false } : { n, half: n * LANE + SHOULDER, two: true };
  }
  // `all`: build every piece in reach now, with no time budget (after a jump: a reference view, views.js). Pieces are built nearest first, and those within
  // NEAR_NOW at once: a piece owns the physics deck of its viaduct or tunnel, and a car or walker put down on it must not wait for seconds on a deck that
  // is not there (below a raised road the only ground is the terrain far under it). A jump skips the 300 ms pause. `focus` (the player or the vehicle
  // driven) counts like the camera: right after a teleport the camera still hangs where it was, and must not drop the decks built under the player.
  arterials(camera, all = false, focus = null) {
    const now = performance.now(), cx = camera.position.x, cz = camera.position.z, fx = focus ? focus.x : cx, fz = focus ? focus.z : cz;
    const jumped = Math.hypot(cx - (this.artX ?? cx), cz - (this.artZ ?? cz)) > 80 || Math.hypot(fx - (this.artFX ?? fx), fz - (this.artFZ ?? fz)) > 80;
    if (!all && !jumped && now - (this.artAt || 0) < 300) return; this.artAt = now; this.artX = cx; this.artZ = cz; this.artFX = fx; this.artFZ = fz;
    const t0 = performance.now(), want = [];
    for (const p of this.art) {
      const d = Math.min(Math.hypot(p.cx - cx, p.cz - cz), Math.hypot(p.cx - fx, p.cz - fz)) - p.rad;
      if (!p.meshes) { if (d < p.on) want.push({ p, d }); }
      else if (d > p.on * ART_OFF) { for (const m of p.meshes) { this.group.remove(m); m.geometry.dispose(); } p.meshes = null; surf.remove(p); this.stats.artLive--; this.dropDeck(p.col); p.col = null; this.dropPiers(p.pcol); p.pcol = null; }
    }
    want.sort((a, b) => a.d - b.d);
    for (const { p, d } of want) { if (!all && d > NEAR_NOW && performance.now() - t0 >= ART_BUDGET) break; p.meshes = this.artPiece(p); this.stats.artLive++; }
    for (const c of this.covers) {   // the ground over the tunnels nearby (COVER_ON)
      const d = Math.min(Math.hypot(c.cx - cx, c.cz - cz), Math.hypot(c.cx - fx, c.cz - fz)) - c.rad;
      if (!c.built && d < COVER_ON && this.phys) this.buildCover(c); else if (c.built && d > COVER_OFF) this.dropCover(c);
    }
  }
  // every piece within `r` of (x, z) now (a spawn, a boarding, a teleport): their decks are in the physics world when the next step runs
  ensureNear(x, z, r = NEAR_NOW + 60) {
    let n = 0; for (const p of this.art) if (!p.meshes && Math.hypot(p.cx - x, p.cz - z) - p.rad < r) { p.meshes = this.artPiece(p); this.stats.artLive++; n++; }
    if (this.phys) for (const c of this.covers) if (!c.built && Math.hypot(c.cx - x, c.cz - z) - c.rad < COVER_ON) this.buildCover(c);
    return n;
  }
  // a run of tunnel segments a .. b-1 of road r, with its centre and radius
  coverRun(r, a, b) {
    const n = r.pts.length; let cx = 0, cz = 0, rad = 0;
    for (let i = a; i <= b; i++) { cx += r.pts[i % n][0]; cz += r.pts[i % n][1]; } cx /= b - a + 1; cz /= b - a + 1;
    for (let i = a; i <= b; i++) rad = Math.max(rad, Math.hypot(r.pts[i % n][0] - cx, r.pts[i % n][1] - cz));
    return { r, a, b, cx, cz, rad, built: false, col: null };
  }
  // the ground over a run (see COVER_ROOF): cross-sections every 8 m or less along the road, each 4 m across, at the drawn ground; over the tunnel
  // itself (and one step past its walls, so that no slope dips into it) never under the drawn lining's roof
  coverMesh(c) {
    const r = c.r, n = r.pts.length, art = r.kind === 'arterial', half = this.tunHalf(r);
    const inner = half + 1.4, outer = art ? half + TUNNEL_FILL + 12 : HALF_W + CARVE_FADE + 12;   // past the filled corridor and the 8 m cells of the height field sloping into it
    const NA = Math.ceil((2 * outer) / 4), P = [], I = [];
    // on along the open road past each end as far as the fill reaches round the last tunnel sample (and a height field cell), at the ground only; a road
    // that ends inside a tunnel (the next way is another road) goes on straight
    const ext = (art ? half + TUNNEL_FILL : HALF_W + CARVE_FADE) + 8, step = (i, d) => (r.closed ? (i + d + n) % n : Math.max(0, Math.min(n - 1, i + d)));
    const gap = (i, j) => Math.hypot(r.pts[i][0] - r.pts[j][0], r.pts[i][1] - r.pts[j][1]);
    let a = c.a, b = c.b, La = 0, Lb = 0;
    for (; La < ext && a !== step(a, -1) && !(r.closed && step(a, -1) === c.b); a = step(a, -1)) La += gap(a, step(a, -1));
    for (; Lb < ext && b !== step(b, 1) && !(r.closed && step(b, 1) === c.a); b = step(b, 1)) Lb += gap(b, step(b, 1));
    const S = [], sec = (x, z, y, rx, rz, roof) => S.push({ x, z, y, rx, rz, roof });
    const fa = this.frame(r, a), fb = this.frame(r, b);
    for (let d = ext - La; d > 0; d -= 8) sec(fa.x - fa.tx * d, fa.z - fa.tz * d, fa.y, fa.rx, fa.rz, -Infinity);
    const cnt = r.closed ? (b - a + n) % n : b - a;
    for (let u = 0; u < cnt; u++) {
      const i = (a + u) % n, j = (i + 1) % n, tun = r.cls[i] === 2 || r.cls[j] === 2;
      const f0 = this.frame(r, i), f1 = this.frame(r, j), ns = Math.max(1, Math.ceil(Math.hypot(f1.x - f0.x, f1.z - f0.z) / 8));
      for (let s = u === 0 ? 0 : 1; s <= ns; s++) {
        const t = s / ns, y = lerp(f0.y, f1.y, t);
        let rx = lerp(f0.rx, f1.rx, t), rz = lerp(f0.rz, f1.rz, t); const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
        sec(lerp(f0.x, f1.x, t), lerp(f0.z, f1.z, t), y, rx, rz, tun ? y + lerp(this.tunCeil(r, f0), this.tunCeil(r, f1), t) + COVER_ROOF : -Infinity);
      }
    }
    for (let d = Math.min(8, ext - Lb); d > 0 && d <= ext - Lb; d += 8) sec(fb.x + fb.tx * d, fb.z + fb.tz * d, fb.y, fb.rx, fb.rz, -Infinity);
    // at a portal the roof and the ground beside it meet at one cross-section with no slope between them (it would hang in the opening): a copy of the
    // roofed section at the ground, and nothing between the two
    for (let k = S.length - 1; k > 0; k--) if ((S[k].roof === -Infinity) !== (S[k - 1].roof === -Infinity)) {
      const q = S[k].roof === -Infinity ? S[k - 1] : S[k]; S.splice(k, 0, { ...q, roof: -Infinity, seam: true });
    }
    const oth = [], mouth = [], gone = [];
    for (let m = 0; m < S.length; m++) {
      const q = S[m], v0 = P.length / 3;
      for (let k = 0; k <= NA; k++) {
        // the ground is the physics ground's (region.js carve): a road dipping to a portal lies under the 16 m raster, and the drawn ground over it
        // would close the approach (GPL-20)
        const o = -outer + (2 * outer * k) / NA, px = q.x + q.rx * o, pz = q.z + q.rz * o, l8 = landHeight(px, pz, 8), g = (art && regionWeight(px, pz) >= 1 ? carve(px, pz, l8) : l8) - 0.03, own = Math.max(g, Math.abs(o) <= inner + 4 ? q.roof : -Infinity);
        const R = this.roofNear(px, pz, r); let v = Math.max(own, R.top), drop = false;   // and over any other tunnel it crosses
        // never in another road's open stretch, nor a vertex's step beside it: the ground is drawn under the road tops (roadsurf.js) and a buried road
        // keeps its space
        const top = this.openTop(px, pz, r);
        if (v > top - 0.1) {   // a street over a shallow underpass: the street keeps its height, the underpass a car's height under it, or the cover gives way
          const floor = R.top > own ? R.floor : q.y; if (v > g && top - 0.1 - floor < 2.6) drop = true; else v = top - 0.1;
        }
        P.push(px, v, pz); oth.push(R.top > own); mouth.push(R.mouth); gone.push(drop);
      }
      // quads that would slope down in front of another road's portal are left out (that road's own cover has the seam there)
      if (m > 0 && Math.hypot(S[m].x - S[m - 1].x, S[m].z - S[m - 1].z) > 0.01) {   // not between a seam's two copies
        const p0 = v0 - NA - 1;
        for (let k = 0; k < NA; k++) {
          const a = p0 + k, b = p0 + k + 1, d = v0 + k, e = v0 + k + 1, V = [a, b, d, e];
          if (V.some((v) => gone[v]) || (V.some((v) => oth[v]) && V.some((v) => mouth[v] && !oth[v]))) continue;
          // nor over the opening: from the portal's ground copy back to the open road, within the lining and its 4 m step, the ground would slope
          // down across the road into the approach (a ramp the car drove into)
          if ((S[m].seam || S[m - 1].seam) && S[m].roof === -Infinity && S[m - 1].roof === -Infinity && Math.min(Math.abs(-outer + (2 * outer * k) / NA), Math.abs(-outer + (2 * outer * (k + 1)) / NA)) <= inner + 4) continue;
          I.push(a, e, b, a, d, e);   // facing up
        }
      }
    }
    return { P, I };
  }
  // tunnel segment i of road r in the 64 m cells it reaches (with its lining and the cover's 4 m step past it)
  gridTunnel(r, i) {
    const n = r.pts.length, A = r.pts[i], B = r.pts[(i + 1) % n], pad = this.tunHalf(r) + 5.4;
    for (let a = Math.floor((Math.min(A[0], B[0]) - pad) / 64); a <= Math.floor((Math.max(A[0], B[0]) + pad) / 64); a++)
      for (let b = Math.floor((Math.min(A[1], B[1]) - pad) / 64); b <= Math.floor((Math.max(A[1], B[1]) + pad) / 64); b++) { const k = a * 100003 + b; let l = this.tgrid.get(k); if (!l) this.tgrid.set(k, (l = [])); l.push(r, i); }
  }
  // the highest drawn lining roof (plus COVER_ROOF) of another road's tunnel within its lining and 4 m past its walls at (x, z) (top, or -Infinity),
  // with that tunnel's road height (floor), and whether (x, z) lies in front of one of its portals (mouth: in line with its lining but past its last tunnel sample)
  roofNear(x, z, self) {
    const l = this.tgrid.get(Math.floor(x / 64) * 100003 + Math.floor(z / 64)), out = { top: -Infinity, floor: -Infinity, mouth: false }; if (!l) return out;
    for (let q = 0; q < l.length; q += 2) {
      const r = l[q], i = l[q + 1]; if (r === self) continue;
      const n = r.pts.length, j = (i + 1) % n, A = r.pts[i], B = r.pts[j], dx = B[0] - A[0], dz = B[1] - A[1], tr = ((x - A[0]) * dx + (z - A[1]) * dz) / (dx * dx + dz * dz || 1), t = Math.max(0, Math.min(1, tr));
      if (Math.hypot(x - A[0] - dx * t, z - A[1] - dz * t) > this.tunHalf(r) + 5.4) continue;
      // past an end of the segment: on only where the tunnel goes on there (a joint inside it), not past a portal or a road's end
      const e = tr < 0 ? i : tr > 1 ? j : -1, inside = (k) => r.cls[k] === 2 && (r.closed || (k > 0 && k < n - 1));
      if (e >= 0 && !inside(e)) { out.mouth = true; continue; }
      const y = lerp(r.y[i], r.y[j], t), h = y + lerp(this.tunCeil(r, this.frame(r, i)), this.tunCeil(r, this.frame(r, j)), t) + COVER_ROOF; if (h > out.top) { out.top = h; out.floor = y; }
    }
    return out;
  }
  // the lowest surface of the open (not tunnel) road segments, other than road self's, within their half width and 5 m at (x, z), or Infinity
  openTop(x, z, self) {
    const N = this.N, cell = N.grid.get(Math.floor(x / N.CS) * 100003 + Math.floor(z / N.CS)); let top = Infinity; if (!cell) return top;
    for (let q = 0; q < cell.length; q += 2) {
      const r = N.roads[cell[q]], i = cell[q + 1], n = r.pts.length, j = (i + 1) % n; if (r === self || r.cls[i] === 2 || r.cls[j] === 2) continue;
      const A = r.pts[i], B = r.pts[j], dx = B[0] - A[0], dz = B[1] - A[1], t = Math.max(0, Math.min(1, ((x - A[0]) * dx + (z - A[1]) * dz) / (dx * dx + dz * dz || 1)));
      if (Math.hypot(x - A[0] - dx * t, z - A[1] - dz * t) <= this.tunHalf(r) + 5) top = Math.min(top, lerp(r.y[i], r.y[j], t));
    }
    return top;
  }
  tunHalf(r) { return r.kind === 'arterial' ? this.artWidth(r).half : oldHalf(r); }   // the half width of a road's tunnel lining, less its 1.4 m
  // the drawn lining's ceiling over sample frame f (artPiece: it follows the ground, 4.7 to 7 m; the old highways' chunks: 7 m)
  tunCeil(r, f) {
    if (r.kind !== 'arterial') return 7;
    const w = this.artWidth(r).half + 1.4;
    return Math.max(4.7, Math.min(7, Math.min(landHeight(f.x + f.rx * w, f.z + f.rz * w, 16), landHeight(f.x - f.rx * w, f.z - f.rz * w, 16), landHeight(f.x, f.z, 16)) - f.y - 0.6));
  }
  buildCover(c) {
    c.built = true; if (!this.phys) return;
    const { P, I } = this.coverMesh(c); if (!I.length) return;
    const R = this.phys.R; c.col = this.phys.world.createCollider(R.ColliderDesc.trimesh(new Float32Array(P), new Uint32Array(I)).setFriction(1).setCollisionGroups(grp(GR.STATIC, 0xffff)));
    c.tris = I.length / 3; this.stats.covers++; this.stats.coverTris += c.tris;
  }
  dropCover(c) {
    if (c.col && this.phys) { this.phys.world.removeCollider(c.col, true); this.stats.covers--; this.stats.coverTris -= c.tris; }
    c.col = null; c.built = false;
  }
  // the height of the drawn surface of a compiled road at (x, z), or NaN off the road; a ray only sees a deck after the next physics step, this does not wait
  deckY(x, z) {
    const r = roadAt(x, z, 14); if (!r || r.road.kind !== 'arterial' || r.d > this.artWidth(r.road).half) return NaN;
    return r.cls || regionWeight(x, z) >= 1 ? r.y : Math.max(r.y, landHeight(x, z, 16) + 0.05);   // drawn as artPiece draws it
  }
  // a piece of a compiled line: asphalt across its width, laid on its own heights (in the blend band at the region's edge never under the drawn ground: a
  // vertex is lifted to it), with an earth bank down to the ground where the road stands above it; rails on the big roads, bridge fascia and piers,
  // tunnel lining
  artPiece(p) {
    const r = p.r, { n, half, two } = this.artWidth(r), mat = this.mats.lanes[n - 1], A = new Acc(), S = new Acc(), E = new Acc(), big = r.hw === 'motorway' || r.hw === 'trunk';
    const CONC = [0.46, 0.47, 0.5], RAIL = [0.55, 0.57, 0.6], PIL = [0.4, 0.41, 0.44], EARTH = [0.24, 0.21, 0.16], LIGHT = [3.2, 2.9, 2.2];
    let dist = 0; const D = new Deck(), top = [], piers = [];
    for (let i = p.a; i < p.b; i++) {
      const f0 = this.frame(r, i), f1 = this.frame(r, i + 1), seg = Math.hypot(f1.x - f0.x, f1.z - f0.z), v0 = dist / 12, v1 = (dist + seg) / 12; dist += seg;
      const bridge = f0.cls === 1 || f1.cls === 1, tunnel = f0.cls === 2 || f1.cls === 2;
      const at = (f, off, dy = 0) => {
        const x = f.x + f.rx * off, z = f.z + f.rz * off; let y = f.y;
        // inside the region the road is drawn at its own height, also where the 16 m ground is over it: the drawn ground is lowered under it (farland.js,
        // roadsurf.js) and so is the physics ground (region.js carve). Lifted to the ground, a road in a cutting ran on at the ground's height to a portal
        // whose tunnel floor lay metres lower (GPL-20); artLifted now counts the vertices under the 16 m ground, which no longer move
        if (!f.cls) { const g = landHeight(x, z, 16) + 0.05; if (dy === 0 && Math.abs(off) <= half) { if (regionWeight(x, z) < 1) { this.stats.artBand = (this.stats.artBand || 0) + 1; if (g - y > 0.3) this.stats.artBandLifted = (this.stats.artBandLifted || 0) + 1; return [x, Math.max(y, g) + dy, z]; } this.stats.artVerts++; if (g - y > 0.3) this.stats.artLifted++; return [x, y + dy, z]; } else if (dy !== 0 || Math.abs(off) > half) { this.stats.artOther = (this.stats.artOther || 0) + 1; if (g - y > 0.3) this.stats.artOtherLifted = (this.stats.artOtherLifted || 0) + 1; if (regionWeight(x, z) >= 1) return [x, y + dy, z]; } if (g > y) y = g; }
        return [x, y + dy, z];
      };
      D.quadIfOff(at(f0, -half), at(f1, -half), at(f1, half), at(f0, half));
      const k0 = A.i.length / 3;
      if (two) {   // a two-way road: a carriageway each side of a centre line (the texture's yellow edge meets in the middle)
        A.quad(at(f0, 0.12), at(f1, 0.12), at(f1, half), at(f0, half), [1, 1, 1], [0, v0], [0, v1], [1, v1], [1, v0]);
        A.quad(at(f0, -half), at(f1, -half), at(f1, -0.12), at(f0, -0.12), [1, 1, 1], [1, v0], [1, v1], [0, v1], [0, v0]);
      } else A.quad(at(f0, -half), at(f1, -half), at(f1, half), at(f0, half), [1, 1, 1], [1, v0], [1, v1], [0, v1], [0, v0]);   // the inner (yellow) edge on +right: traffic keeps right
      for (let t = k0; t < A.i.length / 3; t++) top[t] = !tunnel;   // the drawn top the land keeps under (roadsurf.js); a tunnel's floor is under it on purpose
      // a concrete barrier along each edge of a motorway or trunk carriageway (0.45 m wide, 0.85 m high, both faces and the top), solid on a bridge: a
      // flat strip 0.78 m up was all there was, and between the two decks of a viaduct a walker or a car went off the edge into the gap. Left open
      // where another road's surface reaches the edge (a ramp leaving or joining, a junction), so the way onto it stays free
      if (big && !tunnel) for (const s of [-1, 1]) {
        const o = s * (half + 0.25), w = 0.225; if (this.barrierGap(r, f0, f1, o)) continue;
        const i0 = at(f0, o - s * w), i1 = at(f1, o - s * w), x0 = at(f0, o + s * w), x1 = at(f1, o + s * w), up = (q) => [q[0], q[1] + 0.85, q[2]];
        // front faces only (as the bridge fascias below): the top up, each side facing away from the barrier's middle
        if (s > 0) { S.quad(up(i0), up(i1), up(x1), up(x0), RAIL); S.quad(up(i1), up(i0), i0, i1, CONC); S.quad(up(x0), up(x1), x1, x0, CONC); }
        else { S.quad(up(x0), up(x1), up(i1), up(i0), RAIL); S.quad(up(i0), up(i1), i1, i0, CONC); S.quad(up(x1), up(x0), x0, x1, CONC); }
        if (bridge) D.wall(i0, i1, up(i1), up(i0));
      }
      if (!bridge && !tunnel) for (const s of [-1, 1]) {   // earth banks from the edge down to the ground beside the road, where the road stands above it
        const e0 = at(f0, s * half), e1 = at(f1, s * half), g0 = landHeight(f0.x + f0.rx * s * (half + 2.5), f0.z + f0.rz * s * (half + 2.5), 16) - 0.05, g1 = landHeight(f1.x + f1.rx * s * (half + 2.5), f1.z + f1.rz * s * (half + 2.5), 16) - 0.05;
        if (e0[1] - g0 < 0.15 && e1[1] - g1 < 0.15) continue;
        if (this.onOther(p, r, f0, f1, s, half)) { this.stats.bankSkip = (this.stats.bankSkip || 0) + 1; continue; }   // it would lie over another road
        const o0 = [f0.x + f0.rx * s * (half + 2.5), Math.min(g0, e0[1]), f0.z + f0.rz * s * (half + 2.5)], o1 = [f1.x + f1.rx * s * (half + 2.5), Math.min(g1, e1[1]), f1.z + f1.rz * s * (half + 2.5)];
        if (s > 0) S.quad(e0, e1, o1, o0, EARTH); else S.quad(e1, e0, o0, o1, EARTH);
      }
      if (bridge) {
        // the fascias face outward and the soffit faces down (the material draws front faces only: seen from below, a bridge must not lose its deck)
        for (const s of [-1, 1]) { const o = s * (half + 0.5); if (s > 0) S.quad(at(f0, o, 0), at(f1, o, 0), at(f1, o, -1.7), at(f0, o, -1.7), PIL); else S.quad(at(f1, o, 0), at(f0, o, 0), at(f0, o, -1.7), at(f1, o, -1.7), PIL); }
        S.quad(at(f0, half + 0.5, -1.7), at(f1, half + 0.5, -1.7), at(f1, -half - 0.5, -1.7), at(f0, -half - 0.5, -1.7), PIL);
        if (i % 4 === 0) {   // a pier every 32 m, but never standing on a road that passes beneath (the bridge spans it, as a real one does)
          const gy = landHeight(f0.x, f0.z, 16), h = f0.y - 1.7 - gy, w = Math.min(6, half);
          if (h > 0.6 && [-0.5, 0, 0.5].some((u) => this.roadNear(f0.x + f0.rx * w * u, f0.z + f0.rz * w * u, r, 1.5, 1))) this.stats.pierSkip = (this.stats.pierSkip || 0) + 1;
          else if (h > 0.6) { box(S, [f0.x, f0.z], f0.tx, f0.tz, w, h, 2.2, gy, PIL); piers.push([f0.x, f0.z, f0.tx, f0.tz, w, h, 2.2, gy]); }
        }
      }
      if (tunnel) {
        // the ceiling follows the cover (build/world/grade.mjs fills the ground to 8 m over a tunnel where it can): 7 m under a hill, down to the 4.7 m of an
        // underpass right under a street, always 0.6 m under the drawn ground so that the lining never shows through it
        const w = half + 1.4, wall = [0.34, 0.35, 0.38], ceil = (f) => this.tunCeil(r, f);
        const h0 = ceil(f0), h1 = ceil(f1);
        for (const s of [-1, 1]) D.wall(at(f0, s * w, 0), at(f1, s * w, 0), at(f1, s * w, h1), at(f0, s * w, h0));   // solid walls (roaddeck.js)
        for (const s of [-1, 1]) { const o = s * w; if (s > 0) S.quad(at(f0, o, h0), at(f1, o, h1), at(f1, o, 0), at(f0, o, 0), wall); else S.quad(at(f0, o, 0), at(f1, o, 0), at(f1, o, h1), at(f0, o, h0), wall); }
        S.quad(at(f0, w, h0), at(f0, -w, h0), at(f1, -w, h1), at(f1, w, h1), [0.28, 0.29, 0.31]);
        E.quad(at(f0, -0.5, h0 - 0.05), at(f0, 0.5, h0 - 0.05), at(f1, 0.5, h1 - 0.05), at(f1, -0.5, h1 - 0.05), LIGHT);
        if ((r.cls[i - 1] ?? 2) !== 2 && f0.cls === 2) for (const s of [-1, 1]) box(S, [f0.x + f0.rx * s * (w + 0.8), f0.z + f0.rz * s * (w + 0.8)], f0.tx, f0.tz, 1.6, 9, 3, f0.y, CONC);   // portal
      }
    }
    const made = []; for (const [acc, m] of [[A, mat], [S, this.mats.struct], [E, this.mats.glow]]) if (!acc.empty) { const mesh = acc.mesh(m); this.group.add(mesh); made.push(mesh); }
    p.col = this.makeDeck(D); p.pcol = this.makePiers(piers); surf.add(p, A.p, A.i, (t) => top[t]);
    return made;
  }
  // would the earth bank on side s of the segment f0-f1 lie over another road? Its middle and outer edge at both ends are tested against the roads'
  // centre lines (pieces not built yet) and the drawn tops (pavements, junction corners)
  onOther(p, r, f0, f1, s, half) {
    for (const f of [f0, f1]) for (const o of [half + 1.25, half + 2.5]) {
      const x = f.x + f.rx * s * o, z = f.z + f.rz * s * o;
      if (surf.topAt(x, z, p) === surf.topAt(x, z, p) || this.roadNear(x, z, r, 0.5, -1)) return true;
    }
    return false;
  }
  // is (x, z) on another road than r (within its half width plus `pad`), leaving out roads of class `skip` (2: under the ground, 1: up on a bridge)?
  // is the barrier at offset o on segment f0-f1 of r to be left out? Another road's surface reaches its line at either end or the middle (the other
  // carriageway of the same motorway does not count: the barrier stands between the two)
  barrierGap(r, f0, f1, o) {
    const N = this.N, CS = N.CS;
    for (const u of [0, 0.5, 1]) {
      const x = f0.x + (f1.x - f0.x) * u + (f0.rx + (f1.rx - f0.rx) * u) * o, z = f0.z + (f1.z - f0.z) * u + (f0.rz + (f1.rz - f0.rz) * u) * o, y = f0.y + (f1.y - f0.y) * u;
      const cell = N.grid.get(Math.floor(x / CS) * 100003 + Math.floor(z / CS)); if (!cell) continue;
      for (let q = 0; q < cell.length; q += 2) {
        const o2 = N.roads[cell[q]], i = cell[q + 1]; if (o2 === r || o2.cls[i] === 2 || (o2.ref && o2.ref === r.ref && o2.hw === r.hw)) continue;
        const n = o2.pts.length, A = o2.pts[i], B = o2.pts[(i + 1) % n], dx = B[0] - A[0], dz = B[1] - A[1], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - A[0]) * dx + (z - A[1]) * dz) / l2));
        const w = o2.kind === 'arterial' ? this.artWidth(o2).half : o2.kind === 'ramp' ? 4.6 : HALF_W, yo = o2.y[i] + (o2.y[(i + 1) % n] - o2.y[i]) * t;
        if (Math.abs(yo - y) < 3 && Math.hypot(x - A[0] - dx * t, z - A[1] - dz * t) < w + 0.6) return true;   // at about the same height: a road over or under it is no way off
      }
    }
    return false;
  }
  roadNear(x, z, r, pad, skip) {
    const N = this.N, CS = N.CS, cell = N.grid.get(Math.floor(x / CS) * 100003 + Math.floor(z / CS)); if (!cell) return false;
    for (let q = 0; q < cell.length; q += 2) {
      const o2 = N.roads[cell[q]], i = cell[q + 1]; if (o2 === r || o2.cls[i] === 2 || o2.cls[i] === skip) continue;
      const n = o2.pts.length, A = o2.pts[i], B = o2.pts[(i + 1) % n], dx = B[0] - A[0], dz = B[1] - A[1], l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((x - A[0]) * dx + (z - A[1]) * dz) / l2));
      const w = o2.kind === 'arterial' ? this.artWidth(o2).half : HALF_W;
      if (Math.hypot(x - A[0] - dx * t, z - A[1] - dz * t) < w + pad) return true;
    }
    return false;
  }
  dispose() { this.scene.remove(this.group); this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
}
function mergeBoxes(list) {
  const pos = [], nor = [], idx = []; let off = 0;
  for (const g of list) { const p = g.attributes.position, n = g.attributes.normal; for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); } const ix = g.index; for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + off); off += p.count; }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); m.setIndex(idx); return m;
}
export { cities, HALF_W, Acc };
