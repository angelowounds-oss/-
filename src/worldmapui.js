import * as THREE from 'three';
import { cities, farHeight, surfaceColor, SEA, WORLD_HALF } from './worldmap.js';
import { net } from './roadnet.js';
import { N as GN, HALF, R as GR_, roadC } from './world.js';
import { el } from './util.js';

// The world map (ADR-0012 phase 5): a full-screen overlay on key J (and the phone's "세계" tab shows the same). Four zoom levels (the whole 100 km,
// a 26 km region, a 6.5 km district, a 1.6 km street view), terrain painted from the world data, highways, rings, city names, facilities, the
// player, the waypoint and the planned route. Click sets the waypoint; the buttons start the autopilot, call fast travel, or clear. The waypoint
// is also drawn in the world as a light pillar and on the HUD as a distance + direction readout.
const SPAN = [112000, 28000, 7000, 1700];   // metres across the shorter screen side at each level
const CSS = `
#wmap{position:fixed;inset:0;z-index:18;display:none;background:#04070d;color:#dff;font:13px/1.35 "Space Mono",monospace;user-select:none}
#wmap.on{display:block}
#wmap canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair}
#wmTop{position:absolute;left:14px;top:12px;right:14px;display:flex;gap:10px;align-items:center;pointer-events:none}
#wmTop b{font-family:Anton,sans-serif;letter-spacing:.08em;font-size:18px;font-weight:400;color:#7df}
#wmTop span{opacity:.75}
#wmBar{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);display:flex;gap:8px;flex-wrap:wrap;justify-content:center;max-width:96vw}
#wmBar button{padding:10px 14px;border-radius:12px;border:1px solid rgba(120,200,255,.35);background:rgba(8,14,26,.86);color:#dff;font:inherit;cursor:pointer}
#wmBar button:hover{background:rgba(20,40,70,.95)}
#wmBar button.on{border-color:#7df;color:#7df}
#wmInfo{position:absolute;right:14px;top:44px;min-width:220px;max-width:min(320px,80vw);padding:10px 12px;border-radius:12px;background:rgba(8,14,26,.86);border:1px solid rgba(120,200,255,.3);display:none}
#wmInfo.on{display:block}
#wmInfo small{opacity:.7;display:block}
#wpHud{position:absolute;left:50%;top:max(14px,env(safe-area-inset-top));transform:translateX(-50%);padding:5px 12px;border-radius:12px;font-size:12px;display:none;pointer-events:none;border:1px solid rgba(120,220,255,.35)}
#wpHud.on{display:block}
`;
const KIND_COL = { highway: '#ffd24a', ring: '#ff9a3a', connector: '#ffb86a' };

export class WorldMapUI {
  constructor(G) {
    this.G = G; this.level = 0; this.cx = 0; this.cz = 0; this.open = false; this.tiles = new Map(); this.base = null; this.drag = null; this.sel = null;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const root = document.createElement('div'); root.id = 'wmap';
    root.innerHTML = '<canvas></canvas><div id="wmTop"><b>WORLD MAP</b><span id="wmLvl"></span><span id="wmPos"></span></div><div id="wmInfo"></div><div id="wmBar"></div>';
    document.body.appendChild(root); this.root = root; this.cv = root.querySelector('canvas'); this.g = this.cv.getContext('2d'); this.info = root.querySelector('#wmInfo');
    const bar = root.querySelector('#wmBar');
    const btn = (id, label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.id = id; b.textContent = label; b.onclick = fn; bar.appendChild(b); return b; };
    btn('wmZoomIn', '＋ 확대', () => this.zoom(1)); btn('wmZoomOut', '－ 축소', () => this.zoom(-1)); btn('wmHere', '내 위치', () => this.centerOnPlayer());
    btn('wmAuto', '자동 주행', () => this.auto()); btn('wmFast', '빠른 이동', () => this.fast()); btn('wmClear', '목적지 해제', () => this.clear()); btn('wmClose', '닫기 (J)', () => this.toggle(false));
    this.hud = document.createElement('div'); this.hud.id = 'wpHud'; this.hud.className = 'glass'; el('hud').appendChild(this.hud);
    const cv = this.cv;
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.zoom(e.deltaY < 0 ? 1 : -1, e.offsetX, e.offsetY); }, { passive: false });
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); this.drag = { x: e.clientX, y: e.clientY, cx: this.cx, cz: this.cz, moved: false }; });
    cv.addEventListener('pointermove', (e) => {
      const rect = cv.getBoundingClientRect(); this.mouse = this.toWorld(e.clientX - rect.left, e.clientY - rect.top);
      if (!this.drag) return; const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y; if (Math.abs(dx) + Math.abs(dy) > 5) this.drag.moved = true;
      if (this.drag.moved) { const s = this.scale(); this.cx = this.drag.cx - dx / s; this.cz = this.drag.cz - dy / s; this.clampView(); }
    });
    cv.addEventListener('pointerup', (e) => {
      const d = this.drag; this.drag = null; if (!d || d.moved) return;
      const rect = cv.getBoundingClientRect(), p = this.toWorld(e.clientX - rect.left, e.clientY - rect.top); this.pick(p.x, p.z);
    });
    addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.open) { this.toggle(false); e.stopImmediatePropagation(); e.preventDefault(); return; }
      if (e.code === 'KeyJ' && !e.repeat && !e.metaKey && !e.ctrlKey && G.running && (this.open || !G.uiModal)) { this.toggle(!this.open); e.preventDefault(); }
    }, true);
    // the pillar that marks the waypoint in the world (made now so the load-time warm-up compiles it)
    this.pillar = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 3000, 10, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.9, 1).multiplyScalar(2), transparent: true, opacity: 0.35, depthWrite: false, fog: false, toneMapped: false, side: THREE.DoubleSide }));
    this.pillar.visible = false; this.pillar.frustumCulled = false; G.scene.add(this.pillar);
    this.hudT = 0;
  }

  // ---- view
  scale() { return Math.min(this.cv.width, this.cv.height) / SPAN[this.level]; }
  toScreen(x, z) { const s = this.scale(); return [this.cv.width / 2 + (x - this.cx) * s, this.cv.height / 2 + (z - this.cz) * s]; }
  toWorld(px, pz) { const s = this.scale(), k = this.cv.width / this.cv.clientWidth; return { x: this.cx + (px * k - this.cv.width / 2) / s, z: this.cz + (pz * k - this.cv.height / 2) / s }; }
  clampView() { const m = WORLD_HALF + 4000; this.cx = Math.max(-m, Math.min(m, this.cx)); this.cz = Math.max(-m, Math.min(m, this.cz)); }
  zoom(d, px, pz) {
    const nl = Math.max(0, Math.min(SPAN.length - 1, this.level + d)); if (nl === this.level) return;
    if (px != null) { const w = this.toWorld(px, pz); this.level = nl; const w2 = this.toWorld(px, pz); this.cx += w.x - w2.x; this.cz += w.z - w2.z; } else this.level = nl;
    this.clampView();
  }
  centerOnPlayer() { const f = this.G.focusPos(); this.cx = f.x; this.cz = f.z; if (this.level === 0) this.level = 1; }
  toggle(on) {
    const G = this.G; if (on === this.open) return; this.open = on; this.root.classList.toggle('on', on);
    if (on) {
      const f = G.focusPos(); this.cx = f.x; this.cz = f.z; this.level = 1; G.uiModal = true; G.input.unlock(); this.resize(); this.loop();
    } else { G.uiModal = false; G.input.lock(); }
  }
  resize() { const r = this.root.getBoundingClientRect(), k = Math.min(2, devicePixelRatio || 1); this.cv.width = Math.max(300, Math.floor(r.width * k)); this.cv.height = Math.max(300, Math.floor(r.height * k)); }
  loop() { if (!this.open) return; this.draw(); requestAnimationFrame(() => this.loop()); }

  // ---- actions
  pick(x, z) {
    // clicking a city name / facility picks that place, else the point itself
    let best = null, bd = 1e18; const s = this.scale();
    for (const c of cities()) { const d = Math.hypot(c.x - x, c.z - z); if (d < Math.max(c.r * 0.6, 40 / s) && d < bd) { bd = d; best = { x: c.x, z: c.z, name: c.name }; } }
    this.sel = best || { x, z, name: '지정한 지점' };
    this.setWaypoint(this.sel.x, this.sel.z, this.sel.name);
  }
  setWaypoint(x, z, name = '목적지') {
    const G = this.G; G.waypoint = { x, z, name }; this.pillar.position.set(x, 1500, z); this.pillar.visible = true; this.updateInfo(); this.updateHud(0, true);
  }
  clear() { const G = this.G; G.waypoint = null; this.pillar.visible = false; this.info.classList.remove('on'); this.hud.classList.remove('on'); G.autonav?.stop(); }
  updateInfo() {
    const G = this.G, w = G.waypoint; if (!w) { this.info.classList.remove('on'); return; }
    const f = G.focusPos(), d = Math.hypot(w.x - f.x, w.z - f.z), h = (d / 1000).toFixed(1);
    this.info.classList.add('on'); this.info.innerHTML = `<b>${w.name}</b><small>직선 ${h} km · 도로 약 ${(d * 1.25 / 1000).toFixed(1)} km</small><small>자동 주행: 자동차에 탄 채로 · 빠른 이동: 역·공항·택시</small>`;
  }
  auto() {
    const G = this.G; if (!G.waypoint) { G.toast('목적지를 먼저 지정'); return; }
    if (G.autonav?.active) { G.autonav.stop('자동 주행 해제'); return; }
    if (!G.vehicle) { G.toast('자동 주행', '자동차에 탄 뒤 다시 누르세요'); return; }
    if (G.autonav?.start(G.waypoint.x, G.waypoint.z)) this.toggle(false);
  }
  fast() { const G = this.G; if (!G.waypoint) { G.toast('목적지를 먼저 지정'); return; } this.toggle(false); G.transit?.open(G.waypoint); }

  // ---- HUD readout (distance and direction to the waypoint) every 0.25 s
  updateHud(dt, force) {
    this.hudT -= dt; if (this.hudT > 0 && !force) return; this.hudT = 0.25;
    const G = this.G, w = G.waypoint; if (!w) { this.hud.classList.remove('on'); return; }
    const f = G.focusPos(), dx = w.x - f.x, dz = w.z - f.z, d = Math.hypot(dx, dz);
    if (d < 25 && !G.autonav?.active) { G.toast('목적지 도착', w.name); this.clear(); return; }
    const yaw = G.cam.yaw, brg = Math.atan2(dx, dz), rel = Math.atan2(Math.sin(brg - yaw), Math.cos(brg - yaw)), arrows = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'], a = arrows[(Math.round(rel / (Math.PI / 4)) + 8) % 8];
    this.hud.classList.add('on'); this.hud.textContent = `${a}  ${w.name}  ${d > 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m'}${G.autonav?.active ? ' · 자동 주행' : ''}`;
  }

  // ---- drawing
  terrain() {
    const L = this.level, s = this.scale(); this.g;
    if (L === 0) { if (!this.base) this.base = this.paint(0, 0, WORLD_HALF * 2.1, 320, 700); return [this.base, 0, 0, WORLD_HALF * 2.1]; }
    // finer levels: a 192 x 192 patch of the view (a bit larger than the screen), cached by level and the centre snapped to a quarter of the span
    const span = SPAN[L] * Math.max(1.3, this.cv.width / this.cv.height * 1.15), snap = SPAN[L] / 4, cx = Math.round(this.cx / snap) * snap, cz = Math.round(this.cz / snap) * snap, key = `${L}:${cx}:${cz}`;
    let t = this.tiles.get(key); if (!t) { t = this.paint(cx, cz, span, 192, 24); this.tiles.set(key, t); if (this.tiles.size > 24) this.tiles.delete(this.tiles.keys().next().value); }
    void s; return [t, cx, cz, span];
  }
  paint(cx, cz, span, n, cell) {
    const c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'), img = g.createImageData(n, n), tmp = [0, 0, 0], d = span / n;
    const hs = new Float32Array((n + 2) * (n + 2));
    for (let j = -1; j <= n; j++) for (let i = -1; i <= n; i++) hs[(j + 1) * (n + 2) + i + 1] = farHeight(cx - span / 2 + (i + 0.5) * d, cz - span / 2 + (j + 0.5) * d, Math.max(cell, d));
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = cx - span / 2 + (i + 0.5) * d, z = cz - span / 2 + (j + 0.5) * d, h = hs[(j + 1) * (n + 2) + i + 1], k = (j * n + i) * 4;
      if (h < SEA) { const t = Math.min(1, (SEA - h) / 90); img.data[k] = 10 + 8 * (1 - t); img.data[k + 1] = 44 + 40 * (1 - t); img.data[k + 2] = 78 + 52 * (1 - t); img.data[k + 3] = 255; continue; }
      surfaceColor(x, z, h, tmp);
      const sh = 1 + (hs[(j + 1) * (n + 2) + i] - hs[(j + 1) * (n + 2) + i + 2] + hs[(j + 2) * (n + 2) + i + 1] - hs[j * (n + 2) + i + 1]) / (d * 2.2) * 0.9;   // hillshade from the north-west
      const lift = 1.9, k2 = Math.max(0.55, Math.min(1.5, sh)) * lift;
      img.data[k] = Math.min(255, tmp[0] * 255 * k2); img.data[k + 1] = Math.min(255, tmp[1] * 255 * k2); img.data[k + 2] = Math.min(255, tmp[2] * 255 * k2); img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0); return c;
  }
  draw() {
    const g = this.g, W = this.cv.width, H = this.cv.height, G = this.G, L = this.level, s = this.scale();
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#04070d'; g.fillRect(0, 0, W, H);
    const [t, cx, cz, span] = this.terrain(); const [sx, sy] = this.toScreen(cx - span / 2, cz - span / 2);
    g.imageSmoothingEnabled = true; g.drawImage(t, sx, sy, span * s, span * s);
    // world border
    g.strokeStyle = 'rgba(255,80,80,.5)'; g.lineWidth = 2; const [bx, by] = this.toScreen(-WORLD_HALF, -WORLD_HALF); g.strokeRect(bx, by, WORLD_HALF * 2 * s, WORLD_HALF * 2 * s);
    // roads
    const N = net(); g.lineJoin = 'round'; g.lineCap = 'round';
    const vis = (x, z) => { const [px, py] = this.toScreen(x, z); return px > -60 && px < W + 60 && py > -60 && py < H + 60; };
    for (const r of N.roads) {
      if (r.kind === 'ramp' && L < 2) continue;
      g.strokeStyle = r.kind === 'ramp' ? '#caa' : KIND_COL[r.kind] || '#ffd24a'; g.lineWidth = Math.max(1.2, (r.kind === 'ramp' ? 5 : 14) * s * (L > 1 ? 1 : 1)) * (L === 0 ? 1.6 : 1);
      if (L >= 2) g.lineWidth = Math.max(2, (r.kind === 'ramp' ? 7 : 18) * s);
      g.beginPath(); let on = false;
      for (let i = 0; i < r.pts.length; i += L === 0 ? 4 : 1) { const p = r.pts[i]; if (!vis(p[0], p[1])) { on = false; continue; } const [px, py] = this.toScreen(p[0], p[1]); if (!on) { g.moveTo(px, py); on = true; } else g.lineTo(px, py); }
      g.stroke();
    }
    // city streets at the closest level
    if (L >= 2) this.drawStreets(g, s);
    // cities
    for (const c of cities()) {
      const [px, py] = this.toScreen(c.x, c.z);
      if (px < -300 || px > W + 300 || py < -300 || py > H + 300) continue;
      const r = c.r * s; g.fillStyle = 'rgba(255,120,220,.10)'; g.strokeStyle = 'rgba(255,140,230,.55)'; g.lineWidth = 1.5; g.beginPath(); g.arc(px, py, Math.max(r, 5), 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.font = `${L === 0 ? 15 : 17}px "Space Mono",monospace`; g.textAlign = 'center'; g.fillText(c.name, px, py - Math.max(r, 5) - 6);
      g.font = '12px "Space Mono",monospace'; g.fillStyle = '#9ce'; g.fillText({ metropolis: '수도', port: '항만 ⚓', airport: '공항 ✈', town: '' }[c.type] || '', px, py + Math.max(r, 5) + 16);
    }
    // route and waypoint
    const route = G.autonav?.route; if (route && G.autonav.active) {
      g.strokeStyle = '#4df'; g.lineWidth = 4; g.setLineDash([10, 8]); g.beginPath(); let on = false;
      for (let i = G.autonav.i; i < route.pts.length; i += 2) { const p = route.pts[i]; const [px, py] = this.toScreen(p[0], p[1]); if (!on) { g.moveTo(px, py); on = true; } else g.lineTo(px, py); } g.stroke(); g.setLineDash([]);
    }
    const w = G.waypoint; if (w) { const [px, py] = this.toScreen(w.x, w.z); g.fillStyle = '#4df'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(px, py); g.lineTo(px - 9, py - 24); g.lineTo(px + 9, py - 24); g.closePath(); g.fill(); g.stroke(); g.beginPath(); g.arc(px, py - 28, 7, 0, 7); g.fill(); g.stroke(); }
    // the player
    { const f = G.focusPos(), [px, py] = this.toScreen(f.x, f.z), a = G.cam.yaw; g.save(); g.translate(px, py); g.rotate(-a + Math.PI); g.fillStyle = '#7f7'; g.strokeStyle = '#041'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -12); g.lineTo(8, 9); g.lineTo(0, 5); g.lineTo(-8, 9); g.closePath(); g.fill(); g.stroke(); g.restore(); }
    // readout
    const m = this.mouse; this.root.querySelector('#wmLvl').textContent = ['월드 전체', '지역', '구역', '거리'][L] + ` · 격자 ${L === 0 ? '10 km' : L === 1 ? '2 km' : L === 2 ? '500 m' : '100 m'}`;
    this.root.querySelector('#wmPos').textContent = m ? `x ${Math.round(m.x)} · z ${Math.round(m.z)}` : '';
    this.root.querySelector('#wmAuto').classList.toggle('on', !!G.autonav?.active); this.updateInfo();
  }
  drawStreets(g, s) {
    const G = this.G, f = this.cx, z0 = this.cz; void f; void z0;
    for (const C of G.citysites?.cities || []) {
      const [px, py] = this.toScreen(C.c.x, C.c.z); if (Math.hypot(px - this.cv.width / 2, py - this.cv.height / 2) > Math.max(this.cv.width, this.cv.height) + C.c.r * s) continue;
      const R = C.L.roads; g.strokeStyle = 'rgba(210,225,255,.55)';
      for (let i = 0; i < R.length; i += 5) { g.lineWidth = Math.max(1, R[i + 4] * s * 0.9); g.beginPath(); const a = this.toScreen(C.c.x + R[i], C.c.z + R[i + 1]), b = this.toScreen(C.c.x + R[i + 2], C.c.z + R[i + 3]); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
      const A = C.L.areas; for (let i = 0; i < A.length; i += 6) {
        const k = A[i], a = this.toScreen(C.c.x + A[i + 1], C.c.z + A[i + 2]), b = this.toScreen(C.c.x + A[i + 3], C.c.z + A[i + 4]);
        g.fillStyle = k === 1 ? 'rgba(60,200,90,.55)' : k === 2 ? 'rgba(80,220,110,.7)' : k === 10 || k === 11 ? 'rgba(255,255,255,.6)' : k === 12 ? 'rgba(180,190,210,.5)' : k === 13 ? 'rgba(220,150,60,.6)' : 'rgba(0,0,0,0)'; g.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
      }
    }
    // the capital's own grid
    { const [px, py] = this.toScreen(0, 0); if (Math.hypot(px - this.cv.width / 2, py - this.cv.height / 2) < Math.max(this.cv.width, this.cv.height) + 4400 * s) {
      g.strokeStyle = 'rgba(210,225,255,.55)'; g.lineWidth = Math.max(1, GR_ * s);
      for (let i = 0; i <= GN; i++) { const c = roadC(i); let a = this.toScreen(c, -HALF), b = this.toScreen(c, HALF); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); a = this.toScreen(-HALF, c); b = this.toScreen(HALF, c); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
    } }
  }
}
