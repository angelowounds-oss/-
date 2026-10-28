import * as THREE from 'three';
import { landHeight } from './landfn.js';
import roadsBinUrl from '../assets/roads/country.bin';
import { need, bytes } from './files.js';
const roadsBin = need(roadsBinUrl);   // decoded by synchronous code (files.js)

// Country roads (ADR-0013): two-lane asphalt and gravel tracks that join the villages, farms, industry and cities. The plan is packed by
// build/roads_pack.mjs (x, z points every 16 m); the heights are not stored: a road is laid on the ground that is drawn, a hand above it, with a low
// earth bank on both sides that closes the gap where the ground's 16 m triangles rise or fall under the ribbon. The road is cut into pieces of about
// 1.4 km that are built when the player comes within PIECE_ON and thrown away beyond PIECE_OFF; the materials are made at start (and one tiny mesh per
// material is in the scene) so the load-time warm-up compiles them and nothing compiles during play.
const STEP = 16, PIECE = 90, PIECE_ON = 6500, PIECE_OFF = 9000, LIFT = 0.09;
const WIDTH = [8.8, 5.8], HALF_CAR = [3.3, 2.3];   // ribbon width (carriageway + shoulders) and half carriageway, per class

let PLAN = null;
function plan() {
  if (PLAN) return PLAN;
  const bin = bytes(roadsBin), hl = new DataView(bin.buffer).getUint32(0, true), head = JSON.parse(new TextDecoder().decode(bin.subarray(4, 4 + hl))), base = 4 + hl;
  const roads = head.roads.map((r) => ({ ...r, pts: new Float32Array(bin.buffer.slice(base + r.off, base + r.off + r.n * 8)) }));
  const grid = new Map(), key = (i, j) => i * 100003 + j;   // 64 m cells -> [road, sample] pairs, for "is this spot on a road"
  roads.forEach((r, ri) => { for (let s = 0; s < r.n; s++) { const k = key(Math.floor(r.pts[s * 2] / 64), Math.floor(r.pts[s * 2 + 1] / 64)); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(ri, s); } });
  return (PLAN = { roads, grid, key });
}
// is (x, z) within `margin` metres of a road centre line? (the forest keeps its trees off the road)
export function onCountryRoad(x, z, margin = 7) {
  const P = plan(), ci = Math.floor(x / 64), cj = Math.floor(z / 64), m2 = (margin + STEP * 0.5) ** 2;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const a = P.grid.get(P.key(ci + i, cj + j)); if (!a) continue;
    for (let q = 0; q < a.length; q += 2) { const r = P.roads[a[q]], s = a[q + 1], dx = r.pts[s * 2] - x, dz = r.pts[s * 2 + 1] - z; if (dx * dx + dz * dz < m2) return true; }
  }
  return false;
}

function asphaltTexture(track) {
  const W = 128, H = 256, cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d');
  const wTotal = WIDTH[track ? 1 : 0], px = (m) => (m / wTotal) * W, rnd = (() => { let s = track ? 7 : 3; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  if (!track) {
    g.fillStyle = '#42444a'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) { const v = 52 + rnd() * 30; g.fillStyle = `rgb(${v},${v},${v + 4})`; g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2); }
    g.fillStyle = 'rgba(15,15,18,.2)'; for (const c of [-1.15, 1.15]) g.fillRect(px(wTotal / 2 + c - 0.45), 0, px(0.9), H);   // the dark wheel tracks of each lane
    g.strokeStyle = 'rgba(15,15,18,.5)'; g.lineWidth = 1; for (let i = 0; i < 9; i++) { g.beginPath(); let x = rnd() * W, y = rnd() * H; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 14; y += rnd() * 16; g.lineTo(x, y); } g.stroke(); }   // cracks
    g.fillStyle = 'rgba(30,30,34,.35)'; for (let i = 0; i < 3; i++) g.fillRect(px(rnd() * 6 + 1), rnd() * H, px(1.2 + rnd() * 1.6), 10 + rnd() * 28);   // repair patches
    // shoulders: gravel and dust beyond the edge lines
    for (const side of [0, 1]) { const x0 = side ? px(wTotal / 2 + HALF_CAR[0]) : 0, x1 = side ? W : px(wTotal / 2 - HALF_CAR[0]); g.fillStyle = '#6a6355'; g.fillRect(x0, 0, x1 - x0, H); for (let i = 0; i < 700; i++) { const v = 80 + rnd() * 60; g.fillStyle = `rgb(${v},${v - 6},${v - 18})`; g.fillRect(x0 + rnd() * (x1 - x0), rnd() * H, 1 + rnd() * 2, 1 + rnd() * 2); } }
    g.fillStyle = '#e9e9e0'; g.fillRect(px(wTotal / 2 - HALF_CAR[0]) - 1, 0, 3, H); g.fillRect(px(wTotal / 2 + HALF_CAR[0]) - 2, 0, 3, H);   // edge lines
    g.fillRect(px(wTotal / 2) - 1.5, 20, 3, 90);                                                                                                      // dashed centre line (one dash per 12 m tile... 4 m long, 8 m gap)
  } else {
    g.fillStyle = '#6b5a40'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 4200; i++) { const v = 90 + rnd() * 50; g.fillStyle = `rgb(${v + 12},${v},${v - 28})`; g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 3, 1 + rnd() * 3); }
    g.fillStyle = 'rgba(40,30,18,.4)'; for (const c of [-0.85, 0.85]) g.fillRect(px(wTotal / 2 + c - 0.28), 0, px(0.56), H);   // two ruts
    g.fillStyle = 'rgba(70,95,40,.55)'; g.fillRect(px(wTotal / 2 - 0.45), 0, px(0.9), H);   // grass down the middle
    for (const side of [0, 1]) { const x0 = side ? px(wTotal / 2 + HALF_CAR[1]) : 0, x1 = side ? W : px(wTotal / 2 - HALF_CAR[1]); g.fillStyle = 'rgba(60,85,35,.7)'; g.fillRect(x0, 0, x1 - x0, H); }
  }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

export class CountryRoads {
  constructor(scene) {
    this.scene = scene; this.group = new THREE.Group(); this.group.name = 'countryroads'; this.P = plan(); this.t = 0; this.pieces = []; this.live = new Set();
    const off = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
    this.mats = [new THREE.MeshStandardMaterial({ map: asphaltTexture(false), roughness: 0.86, metalness: 0, envMapIntensity: 0.25, ...off }), new THREE.MeshStandardMaterial({ map: asphaltTexture(true), roughness: 0.97, metalness: 0, ...off })];
    this.verge = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, ...off });
    // one tiny mesh per material so the warm-up compiles them (same attributes as the real pieces)
    for (const m of [...this.mats, this.verge]) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, -500, 0, 0.1, -500, 0, 0, -500, 0.1]), 3)); g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]), 3)); if (m === this.verge) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(9).fill(0.3), 3)); else g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(6), 2)); const d = new THREE.Mesh(g, m); d.frustumCulled = false; this.group.add(d); }
    // pieces: [road, first sample, last sample (inclusive)], with a bounding circle for the distance test
    this.P.roads.forEach((r, ri) => { for (let a = 0; a < r.n - 1; a += PIECE) { const b = Math.min(r.n - 1, a + PIECE); let cx = 0, cz = 0; for (let s = a; s <= b; s++) { cx += r.pts[s * 2]; cz += r.pts[s * 2 + 1]; } cx /= b - a + 1; cz /= b - a + 1; this.pieces.push({ ri, a, b, cx, cz, rad: (b - a) * STEP * 0.5 + 30, meshes: null }); } });
    scene.add(this.group); this.stats = { pieces: this.pieces.length, live: 0, built: 0 };
  }
  build(pc) {
    const r = this.P.roads[pc.ri], cls = r.cls, hw = WIDTH[cls] / 2, hc = HALF_CAR[cls], pts = r.pts;
    // sample points: the stored ones and the middle of each step (8 m), with the frame (tangent, right) at each
    const S = []; for (let s = pc.a; s <= pc.b; s++) { S.push([pts[s * 2], pts[s * 2 + 1]]); if (s < pc.b) S.push([(pts[s * 2] + pts[s * 2 + 2]) / 2, (pts[s * 2 + 1] + pts[s * 2 + 3]) / 2]); }
    const n = S.length, pos = new Float32Array(n * 2 * 3), nor = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2), idx = [];
    const vp = new Float32Array(n * 4 * 3), vn = new Float32Array(n * 4 * 3), vc = new Float32Array(n * 4 * 3), vidx = [];
    let run = 0;
    for (let i = 0; i < n; i++) {
      const p = S[i], a = S[Math.max(0, i - 1)], b = S[Math.min(n - 1, i + 1)]; let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      const rx = tz, rz = -tx; if (i) run += Math.hypot(p[0] - S[i - 1][0], p[1] - S[i - 1][1]);
      const x0 = p[0] - rx * hw, z0 = p[1] - rz * hw, x1 = p[0] + rx * hw, z1 = p[1] + rz * hw, y0 = landHeight(x0, z0, 16) + LIFT, y1 = landHeight(x1, z1, 16) + LIFT;
      pos.set([x0, y0, z0, x1, y1, z1], i * 6); nor.set([0, 1, 0, 0, 1, 0], i * 6); uv.set([0, run / 12, 1, run / 12], i * 4);
      // banks: from each road edge out 2.4 m and down to the ground there
      const bo = 2.4, ox0 = p[0] - rx * (hw + bo), oz0 = p[1] - rz * (hw + bo), ox1 = p[0] + rx * (hw + bo), oz1 = p[1] + rz * (hw + bo), oy0 = landHeight(ox0, oz0, 16) - 0.04, oy1 = landHeight(ox1, oz1, 16) - 0.04;
      vp.set([ox0, oy0, oz0, x0, y0 - 0.01, z0, x1, y1 - 0.01, z1, ox1, oy1, oz1], i * 12); vn.set([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], i * 12);
      const dirt = cls ? [0.2, 0.2, 0.1] : [0.26, 0.23, 0.17], gr = [0.16, 0.24, 0.1]; vc.set([...gr, ...dirt, ...dirt, ...gr], i * 12);
      if (i < n - 1) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); const q = i * 4; vidx.push(q, q + 4, q + 1, q + 1, q + 4, q + 5, q + 2, q + 6, q + 3, q + 3, q + 6, q + 7); }
    }
    void hc;
    const g1 = new THREE.BufferGeometry(); g1.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g1.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g1.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g1.setIndex(idx); g1.computeBoundingSphere();
    const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.BufferAttribute(vp, 3)); g2.setAttribute('normal', new THREE.BufferAttribute(vn, 3)); g2.setAttribute('color', new THREE.BufferAttribute(vc, 3)); g2.setIndex(vidx); g2.computeBoundingSphere();
    const m1 = new THREE.Mesh(g1, this.mats[cls]), m2 = new THREE.Mesh(g2, this.verge); for (const m of [m1, m2]) { m.receiveShadow = true; m.matrixAutoUpdate = false; this.group.add(m); }
    pc.meshes = [m1, m2]; this.live.add(pc); this.stats.built++;
  }
  drop(pc) { for (const m of pc.meshes) { this.group.remove(m); m.geometry.dispose(); } pc.meshes = null; this.live.delete(pc); }
  update(dt, focus) {
    if ((this.t -= dt) > 0) return; this.t = 0.4; let built = 0;
    for (const pc of this.pieces) {
      const d = Math.hypot(pc.cx - focus.x, pc.cz - focus.z) - pc.rad;
      if (!pc.meshes) { if (d < PIECE_ON && built < 3) { this.build(pc); built++; } } else if (d > PIECE_OFF) this.drop(pc);
    }
    this.stats.live = this.live.size;
  }
  dispose() { for (const pc of [...this.live]) this.drop(pc); this.scene.remove(this.group); }
}
