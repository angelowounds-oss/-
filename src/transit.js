import * as THREE from 'three';
import { net } from './roadnet.js';
import { cities } from './worldmap.js';
import { Acc } from './citysites.js';
import { FarGround } from './farland.js';
import { buildCar } from './models.js';
import { buildAirliner } from './aviation.js';
import { el } from './util.js';

// Fast travel (ADR-0012 phase 5). Three ways to cross the world without driving, and a taxi for anywhere:
//   metro   — entrances in every city (the capital's own subway entrances too): a ride to another entrance of the same city
//   rail    — high-speed lines laid beside the highways, city to city; ambient trains run on them, and the player rides one (the central station of each city)
//   air     — Skyport's airliners: from the airport gate to any city
//   taxi    — from wherever the player stands to the map waypoint, along the real road route
// A ride is a camera that follows a vehicle along a path while the world streams past; sections under a city (the tunnels) are a black screen with a caption.
// The ride takes at most CAP seconds however long the path is (press F to skip): the vehicle goes faster than it would, but the whole world is drawn on the way.
const CAP = { metro: 14, rail: 42, air: 40, taxi: 34 }, NATURAL = { metro: 22, rail: 78, air: 210, taxi: 38 };
const FARE = { metro: () => 2, rail: (d) => Math.round(10 + d * 0.002), air: (d) => Math.round(30 + d * 0.003), taxi: (d) => Math.round(10 + d * 0.01) };
const KIND_NAME = ['지하철', '고속철도 중앙역', '공항 탑승구'], KIND_COL = [[0.2, 0.9, 1], [1, 0.55, 0.15], [1, 0.85, 0.2]];
const CSS = `
#transit{position:fixed;inset:0;z-index:18;display:none;align-items:center;justify-content:center;background:rgba(2,5,10,.78);color:#dff;font:13px/1.4 "Space Mono",monospace}
#transit.on{display:flex}
#trBox{width:min(560px,94vw);max-height:88vh;overflow:auto;padding:18px 20px;border-radius:18px;background:#08101c;border:1px solid rgba(120,200,255,.35)}
#trBox h2{margin:0 0 4px;font:400 22px Anton,sans-serif;letter-spacing:.08em;color:#7df}
#trBox h3{margin:14px 0 6px;font-size:12px;letter-spacing:.12em;opacity:.7;text-transform:uppercase}
.tr-row{display:flex;gap:8px;align-items:center;padding:9px 10px;border-radius:10px;background:rgba(255,255,255,.05);margin-bottom:5px}
.tr-row .n{flex:1}.tr-row small{display:block;opacity:.65;font-size:11px}
.tr-row button{border:1px solid rgba(120,200,255,.4);background:#0e1626;color:#fff;border-radius:8px;padding:6px 12px;font:inherit;cursor:pointer}
.tr-row button:disabled{opacity:.35;cursor:default}
#trClose{margin-top:12px;width:100%;padding:10px;border-radius:10px;border:1px solid rgba(120,200,255,.3);background:transparent;color:#cde;font:inherit;cursor:pointer}
#rideFade{position:fixed;inset:0;z-index:15;background:#000;opacity:0;pointer-events:none;transition:opacity .7s;display:flex;align-items:flex-end;justify-content:center;color:#9bd;font:14px "Space Mono",monospace;padding-bottom:12vh;text-align:center}
#rideCap{position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:16;color:#dff;font:15px "Space Mono",monospace;text-shadow:0 0 12px #000;display:none;text-align:center;pointer-events:none}
`;

// the rail lines: every highway, offset 27 m to the left of its direction of travel (the highway carries the median on its centre)
export function railLines() {
  const out = [];
  for (const r of net().roads) {
    if (r.kind !== 'highway') continue;
    const n = r.pts.length, pts = [];
    for (let i = 0; i < n; i++) {
      const a = r.pts[Math.max(0, i - 1)], b = r.pts[Math.min(n - 1, i + 1)], p = r.pts[i]; let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
      pts.push([p[0] + tz * 27, r.y[i] - 0.5, p[1] - tx * 27]);
    }
    let len = 0; const S = [0]; for (let i = 1; i < n; i++) { len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]); S.push(len); }
    out.push({ id: r.id, a: r.a, b: r.b, pts, S, len });
  }
  return out;
}
// the point at distance s along a polyline with cumulative lengths S: { x, y, z, h, p }
function along(pts, S, s) {
  let i = 1; while (i < S.length - 1 && S[i] < s) i++;
  const a = pts[i - 1], b = pts[i], u = Math.max(0, Math.min(1, (s - S[i - 1]) / ((S[i] - S[i - 1]) || 1)));
  return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, z: a[2] + (b[2] - a[2]) * u, h: Math.atan2(b[0] - a[0], b[2] - a[2]), p: Math.atan2(b[1] - a[1], Math.hypot(b[0] - a[0], b[2] - a[2])) };
}

export class Transit {
  constructor(G) {
    this.G = G; this.ride = null; this.riding = false; this.stations = []; this.lines = railLines(); this.t0 = 0;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.collect(); this.buildRail(); this.buildKiosks(); this.buildTrains(); this.buildUI();
  }

  // ---- data
  collect() {
    const G = this.G, S = this.stations;
    // the capital: its own subway entrances; the first one is also its central rail station
    const metro = G.world.metro || [];
    metro.forEach((m, i) => S.push({ id: 'neon:' + i, city: 'neon', kind: 0, x: m.x, z: m.z, name: m.name }));
    if (metro.length) S.push({ id: 'neon:rail', city: 'neon', kind: 1, x: metro[0].x + (metro[0].v ? 0 : 10), z: metro[0].z + (metro[0].v ? 10 : 0), name: '네온 중앙역' });
    for (const C of G.citysites?.cities || []) {
      const names = ['중앙', '북', '동', '남', '서'], A = C.L.stations;
      let k = 0;
      for (let i = 0; i < A.length; i += 3) {
        const kind = A[i + 2], x = C.c.x + A[i], z = C.c.z + A[i + 1];
        const dir = Math.abs(A[i]) < 120 && Math.abs(A[i + 1]) < 120 ? '중앙' : Math.abs(A[i]) > Math.abs(A[i + 1]) ? (A[i] > 0 ? '동' : '서') : (A[i + 1] > 0 ? '남' : '북');
        S.push({ id: C.c.id + ':' + (kind === 0 ? k++ : kind === 1 ? 'rail' : 'air'), city: C.c.id, kind, x, z, name: kind === 1 ? `${C.c.name} 중앙역` : kind === 2 ? `${C.c.name} 공항 탑승구` : `${C.c.name} ${dir}역` });
      }
    }
    this.byCity = new Map(); for (const s of S) { if (!this.byCity.has(s.city)) this.byCity.set(s.city, []); this.byCity.get(s.city).push(s); }
    this.cityOf = new Map(cities().map((c) => [c.id, c]));
  }
  stationAt(x, z, r = 12) { let best = null, bd = r; for (const s of this.stations) { const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } } return best; }

  // ---- rail geometry: ballast, rails, embankment skirts and a portal at each end (the line goes under the city from there)
  buildRail() {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.1 }); this.railMat = mat;
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aK;varying float vK;').replace('#include <project_vertex>', '#include <project_vertex>\nvK=aK;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vK;uniform float uNight;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif(vK<-1.5)totalEmissiveRadiance+=diffuseColor.rgb*2.2;else if(vK<-.5)totalEmissiveRadiance+=diffuseColor.rgb*.3;');
      sh.uniforms.uNight = { value: 1 };
    };
    mat.customProgramCacheKey = () => 'transit-rail';
    this.railGroup = new THREE.Group(); this.railGroup.name = 'rail'; this.G.scene.add(this.railGroup);
    const CH = 100;
    for (const L of this.lines) {
      for (let c0 = 0; c0 < L.pts.length - 1; c0 += CH) {
        const A = new Acc();
        for (let i = c0; i < Math.min(c0 + CH, L.pts.length - 1); i++) {
          const a = L.pts[i], b = L.pts[i + 1], dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
          const q = (w, dy, col, kk, off = 0) => A.quad([a[0] + nx * (off - w), a[1] + dy, a[2] + nz * (off - w)], [a[0] + nx * (off + w), a[1] + dy, a[2] + nz * (off + w)], [b[0] + nx * (off + w), b[1] + dy, b[2] + nz * (off + w)], [b[0] + nx * (off - w), b[1] + dy, b[2] + nz * (off - w)], 0, 1, 0, col, kk);
          q(2.6, 0, [0.13, 0.13, 0.14], 0); q(0.09, 0.2, [0.6, 0.62, 0.66], -1, -0.75); q(0.09, 0.2, [0.6, 0.62, 0.66], -1, 0.75);
          for (const sd of [-1, 1]) A.quad([a[0] + nx * 2.6 * sd, a[1], a[2] + nz * 2.6 * sd], [a[0] + nx * 6.2 * sd, a[1] - 3.6, a[2] + nz * 6.2 * sd], [b[0] + nx * 6.2 * sd, b[1] - 3.6, b[2] + nz * 6.2 * sd], [b[0] + nx * 2.6 * sd, b[1], b[2] + nz * 2.6 * sd], 0, 0.7, 0.7 * sd, [0.1, 0.1, 0.11], 0);
        }
        if (!A.empty) { const m = A.mesh(mat); m.frustumCulled = true; this.railGroup.add(m); }
      }
      // portals: a dark mouth with an orange frame, square to the line, at both ends
      for (const end of [0, 1]) {
        const i = end ? L.pts.length - 1 : 0, j = end ? i - 1 : i + 1, p = L.pts[i], q = L.pts[j]; let dx = p[0] - q[0], dz = p[2] - q[2]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;   // pointing out of the line
        const A = new Acc(), nx = -dz, nz = dx, P = (u, v, y) => [p[0] + dx * u + nx * v, p[1] + y, p[2] + dz * u + nz * v];
        const face = (u0, v0, y0, u1, v1, y1, col, kk) => A.quad(P(u0, v0, y0), P(u1, v1, y0), P(u1, v1, y1), P(u0, v0, y1), -dz, 0, dx, col, kk);
        face(0, -8, 0, 0, 8, 9, [0.04, 0.04, 0.05], 0);
        for (const [v0, v1] of [[-8, -6.8], [6.8, 8]]) face(0.2, v0, 0, 0.2, v1, 9.4, [1, 0.55, 0.15], -2); face(0.2, -8, 8.4, 0.2, 8, 9.4, [1, 0.55, 0.15], -2);
        const m = A.mesh(this.railMat); m.frustumCulled = true; (m.material = this.railMat); this.railGroup.add(m);
      }
    }
  }

  // ---- kiosks: a small terminal at every transit point, a sign you can read from the street, and the interaction
  buildKiosks() {
    const G = this.G, A = new Acc(), signs = [];
    for (const s of this.stations) {
      const col = KIND_COL[s.kind], x = s.x, z = s.z, y = 0;
      A.box(x - 0.8, y, z - 0.45, x + 0.8, y + 3, z + 0.45, [0.06, 0.07, 0.1], 0);
      A.box(x - 0.65, y + 1.1, z - 0.5, x + 0.65, y + 2.1, z + 0.5, col.map((v) => v * 1.4), -2);   // the screen, lit on both faces
      A.box(x - 1.7, y + 3, z - 1.2, x + 1.7, y + 3.18, z + 1.2, [0.05, 0.06, 0.09], 0);
      A.box(x - 0.15, y + 3.18, z - 0.15, x + 0.15, y + 9, z + 0.15, col.map((v) => v * 1.6), -2);   // a thin light mast
      if (s.kind === 1) {   // the central station's hall: a roofed concourse open to the south, with benches and a lit ceiling, walkable
        const hx = 3, hz = 2.6, W = G.world.colliders, wall = [0.07, 0.08, 0.1];
        A.box(x - hx, 0, z - hz, x + hx, 0.12, z + hz, [0.12, 0.12, 0.14], -1);                       // floor
        A.box(x - hx, 0.12, z + hz - 0.3, x + hx, 4.4, z + hz, wall, 0);                              // back wall
        A.box(x - hx, 0.12, z - hz, x - hx + 0.3, 4.4, z + hz, wall, 0); A.box(x + hx - 0.3, 0.12, z - hz, x + hx, 4.4, z + hz, wall, 0);
        A.box(x - hx - 0.3, 4.4, z - hz - 0.3, x + hx + 0.3, 4.7, z + hz + 0.3, [0.05, 0.06, 0.08], 0);   // roof
        A.box(x - 2.4, 4.3, z - 1.9, x + 2.4, 4.4, z + 1.9, [1.6, 1.5, 1.3], -2);                       // ceiling light
        for (const sx of [-1.9, 1.9]) A.box(x + sx - 0.5, 0.12, z + 1.6, x + sx + 0.5, 0.55, z + 2.1, [0.3, 0.2, 0.1], -1);   // benches
        W.addBox(x - hx, z + hz - 0.3, x + hx, z + hz, 4.4, 'building'); W.addBox(x - hx, z - hz, x - hx + 0.3, z + hz, 4.4, 'building'); W.addBox(x + hx - 0.3, z - hz, x + hx, z + hz, 4.4, 'building');
        W.addBox(x - hx - 0.3, z - hz - 0.3, x + hx + 0.3, z + hz + 0.3, 4.7, 'building', 4.4);
      }
      signs.push({ x, y: 5.2, z, k: s.kind });
      G.interact.add({ x, z, cy: 1.2, r: 5.2, name: s.kind === 0 ? '지하철 입구 · ' + s.name : s.name, verbs: [{ key: 'F', label: () => '이용하기', run: () => this.open(s) }] });
    }
    const m = A.mesh(this.railMat); this.kioskMesh = m; G.scene.add(m);
    // the signboard atlas: three labels
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256; const g = cv.getContext('2d'); g.fillStyle = '#05070c'; g.fillRect(0, 0, 1024, 256);
    const labels = [['METRO', '지하철', '#27d9ff'], ['RAIL', '고속철도', '#ff8c26'], ['AIRPORT', '공항', '#ffd633']];
    labels.forEach(([en, ko, c], k) => {
      const cx = (k % 2) * 512, cy = Math.floor(k / 2) * 128; g.save(); g.strokeStyle = c; g.lineWidth = 6; g.strokeRect(cx + 8, cy + 8, 496, 112); g.fillStyle = c; g.shadowColor = c; g.shadowBlur = 16; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '700 50px "Space Mono", monospace'; g.fillText(en, cx + 170, cy + 66); g.font = '700 40px "Noto Sans KR", sans-serif'; g.fillText(ko, cx + 400, cy + 66); g.restore();
    });
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const geo = new THREE.PlaneGeometry(1, 0.25); geo.setAttribute('aUV', new THREE.InstancedBufferAttribute(new Float32Array(signs.length * 2 * 4), 4));
    const sm = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide });
    sm.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aUV;').replace('#include <project_vertex>', '#include <project_vertex>\nvMapUv = uv * aUV.zw + aUV.xy;'); sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb*=1.5;'); };
    sm.customProgramCacheKey = () => 'transit-sign';
    const im = new THREE.InstancedMesh(geo, sm, signs.length * 2), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), Sc = new THREE.Vector3(), Pp = new THREE.Vector3(), uv = geo.attributes.aUV;
    signs.forEach((sg, i) => { for (let f = 0; f < 2; f++) { Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), f * Math.PI / 2); Sc.set(5.6, 5.6, 1); Pp.set(sg.x, sg.y, sg.z); M4.compose(Pp, Q, Sc); im.setMatrixAt(i * 2 + f, M4); uv.setXYZW(i * 2 + f, (sg.k % 2) * 0.5, 1 - (Math.floor(sg.k / 2) + 1) * 0.5, 0.5, 0.5); } });
    im.frustumCulled = false; G.scene.add(im); this.signMesh = im;
  }

  // ---- ambient trains: six cars per train, two trains per line, shuttling between the portals
  buildTrains() {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const g = cv.getContext('2d');
    g.fillStyle = '#d7dce4'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#2b3a4f'; g.fillRect(0, 34, 256, 40); g.fillStyle = '#ffcf80'; for (let i = 0; i < 9; i++) g.fillRect(8 + i * 28, 38, 20, 32); g.fillStyle = '#ff8c26'; g.fillRect(0, 84, 256, 8);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const em = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = 256; c.height = 128; const h = c.getContext('2d'); h.fillStyle = '#000'; h.fillRect(0, 0, 256, 128); h.fillStyle = '#ffd9a0'; for (let i = 0; i < 9; i++) h.fillRect(8 + i * 28, 38, 20, 32); return c; })());
    em.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: em, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 1.3, roughness: 0.35, metalness: 0.4 });
    const geo = new THREE.BoxGeometry(3.1, 3.6, 24); geo.translate(0, 1.9, 0);
    this.CARS = 6; this.trains = [];
    for (const L of this.lines) for (let k = 0; k < 2; k++) this.trains.push({ L, off: k * 0.5 + (L.id.charCodeAt(3) % 7) * 0.07, base: this.trains.length * this.CARS });
    this.rideBase = this.trains.length * this.CARS;
    this.carMesh = new THREE.InstancedMesh(geo, mat, this.rideBase + this.CARS); this.carMesh.frustumCulled = false; this.carMesh.castShadow = false;
    const z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < this.carMesh.count; i++) this.carMesh.setMatrixAt(i, z);
    this.G.scene.add(this.carMesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(1, 1, 1); this._z = z;
  }
  setCar(i, p, back) {
    // a car `back` m behind point p on its line
    this._e.set(-p.p, p.h, 0, 'YXZ'); this._q.setFromEuler(this._e); this._p.set(p.x, p.y + 0.4, p.z); this._s.set(1, 1, 1); this._m.compose(this._p, this._q, this._s); this.carMesh.setMatrixAt(i, this._m); void back;
  }
  trainsUpdate(t) {
    const cam = this.G.camera.position, V = 70, dwell = 25;
    for (const T of this.trains) {
      const L = T.L, P = 2 * L.len / V + 2 * dwell, ph = ((t / P + T.off) % 1) * P, fw = L.len / V;
      let s = -1, dir = 1; if (ph < fw) { s = ph * V; dir = 1; } else if (ph >= fw + dwell && ph < 2 * fw + dwell) { s = L.len - (ph - fw - dwell) * V; dir = -1; }
      const head = s >= 0 ? along(L.pts, L.S, s) : null;
      const near = head && Math.hypot(head.x - cam.x, head.z - cam.z) < 22000;
      for (let c = 0; c < this.CARS; c++) {
        const i = T.base + c; if (!near) { this.carMesh.setMatrixAt(i, this._z); continue; }
        const sc = s - dir * c * 25.6; if (sc < 0 || sc > L.len) { this.carMesh.setMatrixAt(i, this._z); continue; }
        const p = along(L.pts, L.S, sc); if (dir < 0) { p.h += Math.PI; p.p = -p.p; } this.setCar(i, p);
      }
    }
    this.carMesh.instanceMatrix.needsUpdate = true;
  }

  // ---- UI
  buildUI() {
    const root = document.createElement('div'); root.id = 'transit'; root.innerHTML = '<div id="trBox"></div>'; document.body.appendChild(root); this.root = root; this.box = root.querySelector('#trBox');
    this.fade = document.createElement('div'); this.fade.id = 'rideFade'; document.body.appendChild(this.fade);
    this.cap = document.createElement('div'); this.cap.id = 'rideCap'; document.body.appendChild(this.cap);
    addEventListener('keydown', (e) => { if (e.code === 'Escape' && this.root.classList.contains('on')) { this.close(); e.stopImmediatePropagation(); e.preventDefault(); } if ((e.code === 'KeyF' || e.code === 'KeyE') && this.riding && !e.repeat) { this.skip(); e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  }
  // st = a station (from a kiosk), or a waypoint {x, z, name} (from the map: only the taxi is offered unless a station is near)
  open(st) {
    const G = this.G; if (this.riding || G.uiModal && !this.root.classList.contains('on')) return;
    const at = st.kind != null ? st : this.stationAt(G.focusPos().x, G.focusPos().z, 14), wp = G.waypoint || (st.kind == null ? st : null);
    this.station = at; const B = this.box; B.innerHTML = '';
    const h = document.createElement('h2'); h.textContent = at ? at.name : '빠른 이동'; B.appendChild(h);
    const sub = document.createElement('div'); sub.style.opacity = '.7'; sub.textContent = `보유 $${Math.floor(G.cash)}`; B.appendChild(sub);
    const row = (title, info, price, fn) => { const r = document.createElement('div'); r.className = 'tr-row'; r.innerHTML = `<div class="n">${title}<small>${info}</small></div>`; const b = document.createElement('button'); b.type = 'button'; b.textContent = price ? `$${price} 탑승` : '탑승'; b.disabled = price > G.cash; b.onclick = () => { this.close(); G.cash -= price; this.start(fn()); }; r.appendChild(b); B.appendChild(r); };
    const sect = (t) => { const e = document.createElement('h3'); e.textContent = t; B.appendChild(e); };
    const min = (m) => `${Math.max(1, Math.round(m))}분`;
    if (at) {
      if (at.kind === 0 || at.kind === 1) {
        sect('지하철 (같은 도시)');
        for (const o of this.byCity.get(at.city).filter((s) => s.kind !== 2 && s !== at)) { const d = Math.hypot(o.x - at.x, o.z - at.z); row(o.name, `${(d / 1000).toFixed(1)} km`, FARE.metro(d), () => this.planMetro(at, o)); }
      }
      if (at.kind === 1) {
        sect('고속철도 (도시 간)');
        for (const c of cities()) { if (c.id === at.city) continue; const to = this.byCity.get(c.id)?.find((s) => s.kind === 1); if (!to) continue; const plan = this.planRail(at, to); if (!plan) continue; row(to.name, `${(plan.len / 1000).toFixed(0)} km · 약 ${min(plan.len / 78 / 60 + 1)}`, FARE.rail(plan.len), () => plan); }
      }
      if (at.kind === 2) {
        sect('항공편');
        for (const c of cities()) { if (c.id === at.city) continue; const to = this.byCity.get(c.id)?.find((s) => s.kind === 1) || this.byCity.get(c.id)?.[0]; if (!to) continue; const plan = this.planAir(at, to); row(`${c.name} 행`, `${(plan.len / 1000).toFixed(0)} km · 약 ${min(plan.len / 210 / 60 + 4)}`, FARE.air(plan.len), () => plan); }
      }
    }
    sect('택시 (장거리)');
    if (wp) { const f = G.focusPos(), d = Math.hypot(wp.x - f.x, wp.z - f.z); if (d < 400) row('목적지가 가깝다', '걸어서 가세요', 0, () => null); else row(wp.name, `직선 ${(d / 1000).toFixed(1)} km`, FARE.taxi(d), () => this.planTaxi(wp)); }
    else { const e = document.createElement('div'); e.style.opacity = '.6'; e.textContent = '지도(J)에서 목적지를 지정하면 여기에 나타납니다'; B.appendChild(e); }
    const x = document.createElement('button'); x.id = 'trClose'; x.type = 'button'; x.textContent = '닫기'; x.onclick = () => this.close(); B.appendChild(x);
    this.root.classList.add('on'); G.uiModal = true; G.input.unlock();
  }
  close() { this.root.classList.remove('on'); this.G.uiModal = false; this.G.input.lock(); }

  // ---- plans: a list of path pieces [{ pts: [[x, y, z]], ug }]
  mk(kind, from, to, segs, extra = {}) {
    let len = 0; const out = []; for (const sg of segs) { const S = [0]; for (let i = 1; i < sg.pts.length; i++) S.push(S[i - 1] + Math.hypot(sg.pts[i][0] - sg.pts[i - 1][0], sg.pts[i][1] - sg.pts[i - 1][1], sg.pts[i][2] - sg.pts[i - 1][2])); out.push({ ...sg, S, s0: len, L: S[S.length - 1] }); len += S[S.length - 1]; }
    return { kind, from, to, segs: out, len, ...extra };
  }
  planMetro(a, b) { return this.mk('metro', a, b, [{ pts: [[a.x, -9, a.z], [b.x, -9, b.z]], ug: true, text: `다음 역: ${b.name}` }]); }
  // the city graph over the rail lines: Dijkstra by length; returns pieces: underground to the portal, the line, under the next city, ...
  planRail(a, b) {
    const dist = new Map([[a.city, 0]]), from = new Map(), q = [a.city];
    while (q.length) {
      q.sort((x, y) => dist.get(x) - dist.get(y)); const u = q.shift(); if (u === b.city) break;
      for (const L of this.lines) { const v = L.a === u ? L.b : L.b === u ? L.a : null; if (!v) continue; const d = dist.get(u) + L.len; if (d < (dist.get(v) ?? 1e18)) { dist.set(v, d); from.set(v, [u, L]); q.push(v); } }
    }
    if (!from.has(b.city)) return null;
    const chain = []; for (let c = b.city; c !== a.city;) { const [u, L] = from.get(c); chain.unshift({ L, fwd: L.a === u }); c = u; }
    const segs = []; let cur = [a.x, 0, a.z];
    for (const { L, fwd } of chain) {
      const pts = fwd ? L.pts : L.pts.slice().reverse(), head = pts[0];
      segs.push({ pts: [[cur[0], -9, cur[2]], [head[0], -9, head[2]]], ug: true, text: '터널 구간' }); segs.push({ pts: pts.map((p) => [p[0], p[1], p[2]]), ug: false });
      cur = pts[pts.length - 1];
    }
    segs.push({ pts: [[cur[0], -9, cur[2]], [b.x, -9, b.z]], ug: true, text: `곧 도착합니다: ${b.name}` });
    return this.mk('rail', a, b, segs);
  }
  planAir(a, b) {
    const C = this.cityOf.get(a.city), R = C.r, rw = { x: C.x - R * 0.9, z: C.z + R * 0.28 + 30 }, ex = rw.x + R * 1.8, dx = b.x - ex, dz = b.z - rw.z, d = Math.hypot(dx, dz), ux = dx / d, uz = dz / d, at = (t, y) => [ex + ux * t, y, rw.z + uz * t];
    const g = FarGround.at(rw.x, rw.z);
    const pts = [[rw.x, g + 0.5, rw.z], [rw.x + R * 1.2, g + 0.5, rw.z], [ex, g + 25, rw.z], at(3000, g + 520), at(9000, g + 1800), at(Math.max(12000, d * 0.5), g + 3000), at(Math.max(14000, d - 9000), g + 3000), at(Math.max(16000, d - 3500), g + 700), [b.x, g + 330, b.z]];
    return this.mk('air', a, b, [{ pts: [[a.x, g, a.z], [rw.x, g, rw.z]], ug: false, taxi: true }, { pts, ug: false }]);
  }
  planTaxi(wp) {
    const G = this.G, f = G.focusPos(), r = G.autonav.router.route(f.x, f.z, wp.x, wp.z), pts = r.pts.map((p) => [p[0], FarGround.at(p[0], p[1]) + 0.1, p[1]]);
    return this.mk('taxi', { name: '현재 위치' }, { x: wp.x, z: wp.z, name: wp.name }, [{ pts, ug: false }], { straight: r.straight });
  }

  // ---- the ride
  start(plan) {
    if (!plan) return; const G = this.G, pl = G.player;
    if (G.vehicle) G.exitVehicle?.(true);
    const mesh = plan.kind === 'air' ? buildAirliner({}) : plan.kind === 'taxi' ? buildCar('sedan', 0xe8b820, { taxi: true, glow: [1, 0.8, 0.3] }).group : null;
    if (mesh) { mesh.visible = false; G.scene.add(mesh); }
    this.ride = { plan, s: 0, t: 0, mesh, nat: NATURAL[plan.kind], cap: CAP[plan.kind], seg: 0, cam: new THREE.Vector3(), camSet: false, ug: false, sp: 0 };
    this.riding = true; G.riding = true; pl.group.visible = false; G.farland.ground.suspend = true; G.farland.ground.clear?.();
    this.fade.style.opacity = '1'; this.fade.textContent = ''; document.body.classList.remove('onfoot');
    this.cap.style.display = 'block'; this.cap.textContent = `${plan.to.name} 행 · F 건너뛰기`;
    pl.invuln = 1e9;
  }
  skip() { if (this.ride) this.ride.s = this.ride.plan.len; }
  pathAt(plan, s) { for (const sg of plan.segs) if (s <= sg.s0 + sg.L || sg === plan.segs[plan.segs.length - 1]) { const p = along(sg.pts, sg.S, Math.max(0, Math.min(sg.L, s - sg.s0))); p.ug = sg.ug; p.text = sg.text; p.taxi = sg.taxi; return p; } return null; }
  tickRide(dt) {
    const G = this.G, r = this.ride, pl = G.player, plan = r.plan; r.t += dt;
    const nat = r.nat * (plan.kind === 'rail' || plan.kind === 'metro' ? 1 : 1), speed = Math.max(nat, plan.len / r.cap), ease = Math.min(1, r.t / 2.2, (plan.len - r.s) / (speed * 1.8) + 0.08);
    r.sp = speed * Math.max(0.1, ease); r.s = Math.min(plan.len, r.s + r.sp * dt);
    const p = this.pathAt(plan, r.s); if (!p) return this.arrive();
    pl.x = p.x; pl.z = p.z; pl.y = Math.max(0, p.y); pl.vx = pl.vz = pl.vy = 0; pl.body3.teleport(p.x, Math.max(0, p.y) + 1, p.z);
    // fade through the tunnel sections
    if (p.ug !== r.ug) { r.ug = p.ug; this.fade.style.opacity = p.ug ? '1' : '0'; }
    this.fade.textContent = p.ug && p.text ? p.text : ''; if (!p.ug && r.t > 0.4) this.fade.style.opacity = '0';
    // the vehicle
    if (plan.kind === 'rail') {
      for (let c = 0; c < this.CARS; c++) { const q = p.ug ? null : this.pathAt(plan, r.s - c * 25.6); if (!q || q.ug) this.carMesh.setMatrixAt(this.rideBase + c, this._z); else this.setCar(this.rideBase + c, q); }
      this.carMesh.instanceMatrix.needsUpdate = true;
    } else if (r.mesh) { r.mesh.visible = !p.ug; r.mesh.position.set(p.x, p.y + (plan.kind === 'air' ? 3.2 : 0), p.z); r.mesh.rotation.set(plan.kind === 'air' ? -p.p : 0, p.h, 0, 'YXZ'); }
    r.pose = p;
    if (r.s >= plan.len) this.arrive();
  }
  // the camera follows the vehicle from behind and above
  camera(c, dt) {
    const r = this.ride; if (!r || !r.pose) return; const p = r.pose, kind = r.plan.kind;
    const back = kind === 'air' ? 95 : kind === 'rail' ? 34 : 9.5, up = kind === 'air' ? 30 : kind === 'rail' ? 11 : 3.8, side = kind === 'rail' ? 12 : 0;
    const fx = Math.sin(p.h), fz = Math.cos(p.h), tx = p.x - fx * back + fz * side, ty = p.y + up, tz = p.z - fz * back - fx * side;
    if (!r.camSet) { r.cam.set(tx, ty, tz); r.camSet = true; } else r.cam.lerp(this._p.set(tx, ty, tz), 1 - Math.exp(-4 * dt));
    c.position.copy(r.cam); c.lookAt(p.x + fx * 6, p.y + (kind === 'air' ? 6 : 2), p.z + fz * 6);
  }
  arrive() {
    const G = this.G, r = this.ride, pl = G.player, to = r.plan.to; if (!r) return;
    for (let c = 0; c < this.CARS; c++) this.carMesh.setMatrixAt(this.rideBase + c, this._z); this.carMesh.instanceMatrix.needsUpdate = true;
    if (r.mesh) { r.mesh.removeFromParent(); r.mesh = null; }
    const x = to.x + (to.kind != null ? 2.6 : 0), z = to.z + (to.kind != null ? 2.6 : 0), y = FarGround.at(x, z) + 0.6;
    G.farland.ground.suspend = false; pl.x = x; pl.z = z; pl.y = y; pl.vx = pl.vz = pl.vy = 0; pl.body3.teleport(x, y, z); G.farland.ground.update(x, z, y);
    for (let i = 0; i < 2; i++) G.citysites?.update(G.camera, pl, 0.02);   // the nearest tiles now; the rest stream in a tile a frame
    this.ride = null; this.riding = false; G.riding = false; pl.group.visible = true; pl.invuln = 0; document.body.classList.add('onfoot');
    this.cap.style.display = 'none'; this.fade.textContent = ''; this.fade.style.opacity = '0'; G.toast('도착', to.name); G.cam.yaw = G.cam.yaw || 0;
  }
  update(dt) {
    this.t0 += dt; this.cullAt = (this.cullAt || 0) - dt;
    if (this.cullAt <= 0) {   // the rail chunks and kiosks follow the same distance rule as the highways (fog hides them from the ground)
      this.cullAt = 0.3; const c = this.G.camera.position, lim = c.y > 450 ? 70000 : c.y > 120 ? 20000 : 11000;
      for (const m of this.railGroup.children) { const bs = m.geometry.boundingSphere; if (bs) m.visible = Math.hypot(bs.center.x - c.x, bs.center.z - c.z) - bs.radius < lim; }
    } if (this.G.time != null) this.trainsUpdate(this.G.time);
    if (this.ride) this.tickRide(dt);
  }
}
