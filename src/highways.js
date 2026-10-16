import * as THREE from 'three';
import { net, groundH, HALF_W } from './roadnet.js';
import { cities } from './worldmap.js';

// The highway network drawn (roadnet.js has the data): asphalt ribbons with lane markings, median barrier and guard rails, bridges with pillars,
// tunnels with lights, ramps, sign gantries, toll plazas and service areas; street lamps are an instanced pool that follows the camera.
// Static geometry is built once, in chunks of CHUNK samples (3 km) so frustum culling works, three meshes per chunk (asphalt / structure with
// vertex colours / emissive). Materials are created here so the load-time warm-up compiles them.
const CHUNK = 100, LANE = 3.75, MED = 3.2, SHOULDER = 2.4;
const lerp = (a, b, t) => a + (b - a) * t;

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
  const cv = document.createElement('canvas'), W = lanes === 1 ? 64 : 256, H = 128; cv.width = W; cv.height = H; const g = cv.getContext('2d');
  g.fillStyle = '#3a3c42'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 1800; i++) { const v = 44 + Math.random() * 26; g.fillStyle = `rgb(${v},${v},${v + 4})`; g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1 + Math.random() * 2); }
  const wTotal = lanes === 1 ? 9.2 : lanes * LANE + SHOULDER, px = (m) => (m / wTotal) * W;
  g.fillStyle = '#e9e9e2';
  if (lanes === 1) { g.fillRect(px(0.35), 0, 3, H); g.fillRect(px(8.85) - 3, 0, 3, H); }
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
    this.scene = scene; this.group = new THREE.Group(); this.group.name = 'highways'; this.N = net();
    const t3 = asphaltTexture(3), t1 = asphaltTexture(1); t3.repeat.set(1, 1); t1.repeat.set(1, 1);
    this.mats = {
      asphalt: new THREE.MeshStandardMaterial({ map: t3, roughness: 0.82, metalness: 0, envMapIntensity: 0.3 }),
      ramp: new THREE.MeshStandardMaterial({ map: t1, roughness: 0.82, metalness: 0, envMapIntensity: 0.3 }),
      struct: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.05 }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    };
    this.stats = { chunks: 0, tris: 0 };
    for (const r of this.N.roads) this.buildRoad(r);
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
    const n = r.pts.length, ramp = r.kind === 'ramp', m = r.closed ? n : n - 1;
    const half = ramp ? 4.6 : MED / 2 + 3 * LANE + SHOULDER, medH = MED / 2;
    let dist = 0; const CONC = [0.46, 0.47, 0.5], RAIL = [0.55, 0.57, 0.6], DARK = [0.19, 0.2, 0.22], PIL = [0.4, 0.41, 0.44], LIGHT = [3.2, 2.9, 2.2];
    for (let c0 = 0; c0 < m; c0 += CHUNK) {
      const A = new Acc(), S = new Acc(), E = new Acc(), c1 = Math.min(m, c0 + CHUNK);
      for (let i = c0; i < c1; i++) {
        const f0 = this.frame(r, i), f1 = this.frame(r, (i + 1) % n), seg = Math.hypot(f1.x - f0.x, f1.z - f0.z), v0 = dist / 12, v1 = (dist + seg) / 12; dist += seg;
        const at = (f, off, dy = 0) => [f.x + f.rx * off, f.y + dy, f.z + f.rz * off];
        const bridge = f0.cls === 1 || f1.cls === 1, tunnel = f0.cls === 2 || f1.cls === 2;
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
        if (bridge) {   // fascia and underside; pillars every fourth sample
          for (const s of [-1, 1]) { const o = s * (half + 0.5); S.quad(at(f0, o, 0), at(f1, o, 0), at(f1, o, -1.7), at(f0, o, -1.7), PIL); }
          S.quad(at(f0, -half - 0.5, -1.7), at(f1, -half - 0.5, -1.7), at(f1, half + 0.5, -1.7), at(f0, half + 0.5, -1.7), PIL);
          if (i % 4 === 0) { const gy = groundH(f0.x, f0.z, 30), h = f0.y - 1.7 - gy; if (h > 0.6) box(S, [f0.x, f0.z], f0.tx, f0.tz, ramp ? 3 : 6, h, 2.6, gy, PIL); }
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
      for (const [acc, mat] of [[A, ramp ? this.mats.ramp : this.mats.asphalt], [S, this.mats.struct], [E, this.mats.glow]]) if (!acc.empty) { const mesh = acc.mesh(mat); this.group.add(mesh); this.stats.tris += acc.i.length / 3; }
      this.stats.chunks++;
    }
  }

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
  update(camera) {
    const L = this.lamps, x = camera.position.x, z = camera.position.z;
    if (Math.hypot(x - L.cx, z - L.cz) < 300) return;
    L.cx = x; L.cz = z; const N = this.N, CS = N.CS, seen = new Set(); let k = 0;
    const R = 2300, c0 = Math.floor((x - R) / CS), c1 = Math.floor((x + R) / CS), d0 = Math.floor((z - R) / CS), d1 = Math.floor((z + R) / CS);
    outer: for (let cx = c0; cx <= c1; cx++) for (let cz = d0; cz <= d1; cz++) {
      const cell = N.grid.get(cx * 100003 + cz); if (!cell) continue;
      for (let q = 0; q < cell.length; q += 2) {
        const ri = cell[q], i = cell[q + 1], r = N.roads[ri]; if (r.kind === 'ramp' || i % 2) continue; const key = ri * 1000003 + i; if (seen.has(key)) continue; seen.add(key);
        const px = r.pts[i][0], pz = r.pts[i][1]; if ((px - x) ** 2 + (pz - z) ** 2 > R * R || r.cls[i] === 2) continue;
        const f = this.frame(r, i); L.pos.set(f.x, f.y, f.z); L.q.setFromAxisAngle(L.up, Math.atan2(f.rx, f.rz)); L.mat.compose(L.pos, L.q, L.one);
        L.poleMesh.setMatrixAt(k, L.mat); L.headMesh.setMatrixAt(k, L.mat); if (++k >= L.MAX) break outer;
      }
    }
    L.poleMesh.count = L.headMesh.count = k; L.poleMesh.instanceMatrix.needsUpdate = true; L.headMesh.instanceMatrix.needsUpdate = true;
  }
  dispose() { this.scene.remove(this.group); this.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
}
function mergeBoxes(list) {
  const pos = [], nor = [], idx = []; let off = 0;
  for (const g of list) { const p = g.attributes.position, n = g.attributes.normal; for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); } const ix = g.index; for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + off); off += p.count; }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); m.setIndex(idx); return m;
}
export { cities, HALF_W };
