import * as THREE from 'three';
import { ZONES } from './society.js';
import { buildCar } from './models.js';

// "The city remembers": what the player does leaves marks and stories.
//  - bullet holes and blast scorches stay where they hit (saved), wrecks stay where cars burned out
//  - every witnessed crime goes into an event log that turns into Korean news headlines (car radio with speech, apartment TV, phone)
//  - witnesses tell neighbours and colleagues; residents who know the player's face react when they see them
const MAX_HOLES = 700, MAX_SCORCH = 60, MAX_WRECKS = 12, MAX_EVENTS = 200;

export class Memory {
  constructor(G) {
    this.G = G;
    const st = (this.st = G.state.memory || (G.state.memory = { holes: [], scorch: [], wrecks: [], events: [], said: 0, knowers: {} }));
    st.knowers = st.knowers || {};
    // bullet holes: one instanced mesh of small dark discs, oriented on the surface
    const hg = new THREE.CircleGeometry(0.06, 7);
    this.holes = new THREE.InstancedMesh(hg, new THREE.MeshBasicMaterial({ color: 0x050505, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), MAX_HOLES);
    this.holes.count = 0; this.holes.frustumCulled = false; G.scene.add(this.holes);
    const sg = new THREE.CircleGeometry(1, 20); sg.rotateX(-Math.PI / 2);
    const sc = document.createElement('canvas'); sc.width = sc.height = 128; const x = sc.getContext('2d'), gr = x.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(0,0,0,0.92)'); gr.addColorStop(0.55, 'rgba(10,8,6,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    this.scorch = new THREE.InstancedMesh(sg, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), MAX_SCORCH);
    this.scorch.count = 0; this.scorch.frustumCulled = false; this.scorch.renderOrder = 1; G.scene.add(this.scorch);
    this.wreckGroup = new THREE.Group(); G.scene.add(this.wreckGroup); this.wreckCols = [];
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.n = new THREE.Vector3(); this.one = new THREE.Vector3(1, 1, 1);
    this.rebuild();
    this.newsT = 40; this.rumorT = 0; this.seenT = 0;
  }
  zone(x, z) { return ZONES[this.G.society.zoneAt(x, z)]?.name || '도심'; }

  // ---------- marks ----------
  addHole(x, y, z, nx, ny, nz) {
    const h = this.st.holes; h.push([+x.toFixed(2), +y.toFixed(2), +z.toFixed(2), nx, ny, nz]); if (h.length > MAX_HOLES) h.shift();
    this.placeHole(h.length - 1 < MAX_HOLES ? h.length - 1 : MAX_HOLES - 1, h[h.length - 1]); this.holes.count = Math.min(MAX_HOLES, h.length);
    if (h.length >= MAX_HOLES) this.rebuildHoles();
  }
  placeHole(i, r) {
    this.n.set(r[3], r[4], r[5]); this.q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), this.n);
    this.v.set(r[0] + r[3] * 0.01, r[1] + r[4] * 0.01, r[2] + r[5] * 0.01); const s = 0.7 + ((i * 0.618) % 1) * 0.6;
    this.m4.compose(this.v, this.q, new THREE.Vector3(s, s, s)); this.holes.setMatrixAt(i, this.m4); this.holes.instanceMatrix.needsUpdate = true;
  }
  rebuildHoles() { this.st.holes.forEach((r, i) => this.placeHole(i, r)); this.holes.count = this.st.holes.length; }
  // a world hit: find the face of the box that was struck so the hole lies on it
  // a hit on the world with the surface normal from the physics ray
  markHit(x, y, z, n) {
    if (Math.hypot(x - this.G.player.x, z - this.G.player.z) > 140) return;
    if (!n) { this.addHole(x, 0.012, z, 0, 1, 0); return; }
    const l = Math.hypot(n.nx, n.ny, n.nz) || 1; this.addHole(x, y, z, +(n.nx / l).toFixed(3), +(n.ny / l).toFixed(3), +(n.nz / l).toFixed(3));
  }
  worldHit(x, y, z, ref, ground) {
    if (Math.hypot(x - this.G.player.x, z - this.G.player.z) > 140) return;
    if (ground || !ref) { this.addHole(x, 0.012, z, 0, 1, 0); return; }
    const c = [[Math.abs(x - ref.x0), -1, 0, 0], [Math.abs(x - ref.x1), 1, 0, 0], [Math.abs(z - ref.z0), 0, 0, -1], [Math.abs(z - ref.z1), 0, 0, 1], [Math.abs(y - (ref.h ?? 99)), 0, 1, 0]];
    if (ref.r != null) { const dx = x - ref.x, dz = z - ref.z, l = Math.hypot(dx, dz) || 1; this.addHole(x, y, z, dx / l, 0, dz / l); return; }
    c.sort((a, b) => a[0] - b[0]); this.addHole(x, y, z, c[0][1], c[0][2], c[0][3]);
  }
  addScorch(x, z, r) {
    const s = this.st.scorch; s.push([+x.toFixed(1), +z.toFixed(1), +r.toFixed(1)]); if (s.length > MAX_SCORCH) s.shift(); this.rebuildScorch();
  }
  rebuildScorch() {
    this.st.scorch.forEach((r, i) => { this.m4.makeScale(r[2], 1, r[2]); this.m4.setPosition(r[0], 0.02 + i * 0.0004, r[1]); this.scorch.setMatrixAt(i, this.m4); });
    this.scorch.count = this.st.scorch.length; this.scorch.instanceMatrix.needsUpdate = true;
  }
  // a car that burned out leaves a wreck where it stood (also after reloading)
  addWreck(v) {
    const w = this.st.wrecks; w.push({ x: +v.x.toFixed(1), z: +v.z.toFixed(1), h: +v.h.toFixed(2), type: v.spec.craft ? 'sedan' : v.type in { sedan: 1, sport: 1, suv: 1, truck: 1 } ? v.type : 'sedan' }); if (w.length > MAX_WRECKS) w.shift();
  }
  rebuildWrecks() {
    const G = this.G; for (const o of [...this.wreckGroup.children]) this.wreckGroup.remove(o);
    for (const b of this.wreckCols) G.world.colliders.removeBox(b); this.wreckCols = [];
    for (const w of this.st.wrecks) {
      const m = buildCar(w.type, 0x15110e, {}); m.group.position.set(w.x, 0, w.z); m.group.rotation.y = w.h; m.group.position.y = -0.12; m.group.rotation.z = 0.05;
      m.group.traverse((o) => { if (o.isMesh && o.material && o !== m.paint) { o.material = o.material.clone(); o.material.color?.multiplyScalar?.(0.35); if (o.material.emissive) o.material.emissive.setHex(0); } });
      if (m.head) m.head.visible = false; if (m.tail) m.tail.visible = false;
      this.wreckGroup.add(m.group);
      const hl = m.spec.L / 2, hw = m.spec.W / 2, c = Math.abs(Math.cos(w.h)), s = Math.abs(Math.sin(w.h)), ex = hw * c + hl * s, ez = hw * s + hl * c;
      this.wreckCols.push(G.world.colliders.addBox(w.x - ex, w.z - ez, w.x + ex, w.z + ez, 1.3, 'wreck'));
    }
  }
  rebuild() { this.rebuildHoles(); this.rebuildScorch(); this.rebuildWrecks(); }

  // ---------- events & news ----------
  log(type, x, z, extra = {}) {
    const e = { type, t: Math.round(this.G.clock.t), zone: this.zone(x, z), ...extra }; this.st.events.push(e); if (this.st.events.length > MAX_EVENTS) this.st.events.shift();
    return e;
  }
  headline(e) {
    const Z = e.zone, day = (t) => this.st.events.filter((q) => q.type === t && q.zone === Z && this.G.clock.t - q.t < 1440).length;
    switch (e.type) {
      case 'murder': { const n = day('murder'); return n >= 3 ? `[속보] ${Z} 연쇄 총격… 하루 새 ${n}명 숨져, 경찰 비상` : `[속보] ${Z}에서 ${e.name || '시민'}${e.age ? `(${e.age})` : ''} 씨 피살… 경찰 "용의자 추적 중"`; }
      case 'carjack': return day('carjack') >= 2 ? `${Z}서 차량 강탈 잇따라… 운전자들 "밤길 무섭다"` : `${Z}에서 무장 차량 강탈 사건 발생`;
      case 'explosion': return `${Z} 도심 차량 폭발… 인근 상가 유리창 파손`;
      case 'assault': return `${Z} 길거리 폭행 신고 접수… 목격자 "순식간이었다"`;
      case 'theft': return `${Z} 상점가 절도 기승… 상인회 대책 호소`;
      case 'shots': return `${Z}에서 총성 수십 발… 주민들 대피`;
      case 'blackout': return e.cause === 'wreck' ? `[속보] ${Z} 변전소 폭파… 일대 대규모 정전, 신호등·엘리베이터 마비` : `${Z} 원인 불명 정전… 한전 "외부 침입 흔적 조사 중"`;
      case 'restored': return `${Z} 전력 복구 완료… 주민들 "밤새 불안했다"`;
      case 'wanted': return `경찰, ${Z} 일대 검문 강화… 수배자 인상착의 공개`;
      default: return `${Z} 소식`;
    }
  }
  latest(n = 10) { return this.st.events.slice(-n).reverse().map((e) => ({ e, text: this.headline(e), time: this.fmt(e.t) })); }
  fmt(t) { const d = Math.floor(t / 1440), h = Math.floor((t % 1440) / 60), m = Math.floor(t % 60); return `${d + 1}일차 ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; }
  // car radio: an anchor reads the newest unread story (speech where the browser has a Korean voice; always captioned)
  radio() {
    const G = this.G, fresh = this.st.events.filter((e) => e.t > (this.st.said || 0) && e.type !== 'shots');
    if (!fresh.length) return;
    const e = fresh[fresh.length - 1]; this.st.said = e.t;
    const text = this.headline(e);
    G.toast('📻 NEON FM 뉴스', text);
    try {
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(text.replace(/\[속보\]/, '속보입니다.')); u.lang = 'ko-KR'; u.rate = 1.05; u.pitch = 0.95; u.volume = 0.75;
        const ko = speechSynthesis.getVoices().find((v) => /ko/i.test(v.lang)); if (ko) u.voice = ko;
        speechSynthesis.cancel(); speechSynthesis.speak(u);
      }
    } catch (err) { /* captions only */ }
  }

  // ---------- rumours: witnesses tell neighbours and colleagues ----------
  witnessed(humans, kind) {
    const now = this.G.clock.t;
    for (const h of humans) if (h.citizen) this.st.knowers[h.citizen.id] = { t: now, k: kind, src: 'saw' };
  }
  spreadRumours() {
    const C = this.G.citizens; if (!C) return;
    const now = this.G.clock.t, kn = this.st.knowers, ids = Object.keys(kn);
    for (const id of ids) {
      const r = kn[id]; if (now - r.t > 3 * 1440) { delete kn[id]; continue; }   // forgotten after three days
      if (r.src === 'heard' && Math.random() < 0.5) continue;
      const c = C.byId.get(+id); if (!c) continue;
      const circle = [...(C.byHome.get(c.home.b.id + ':' + c.home.k) || []), ...(c.work ? C.byWork.get(c.work.b.id + ':' + c.work.k) || [] : [])];
      for (let k = 0; k < 2 && circle.length; k++) { const o = circle[Math.floor(Math.random() * circle.length)]; if (!kn[o.id]) kn[o.id] = { t: now, k: r.k, src: 'heard' }; }
    }
  }
  knownCount() { return Object.keys(this.st.knowers).length; }
  // a resident who knows the player's face and sees them reacts
  watch(dt) {
    const G = this.G, pl = G.player; if (pl.dead || !G.playerOnFoot) return;
    this.seenT -= dt; if (this.seenT > 0) return; this.seenT = 1.0;
    for (const h of G.humans) {
      const c = h.citizen; if (!c || h.dead || h.static || h.state === 'flee' || !this.st.knowers[c.id]) continue;
      if (Math.hypot(h.x - pl.x, h.z - pl.z) > 12 || Math.abs((h.y || 0) - (pl.y || 0)) > 3) continue;
      const r = this.st.knowers[c.id];
      h.state = 'flee'; h.fleeT = 7; h.threat = pl;
      if (Math.random() < 0.5) { h.report = { t: 3, heat: 4, kind: 'recognized' }; }
      if (!this.recogT || G.time - this.recogT > 20) { this.recogT = G.time; G.toast(`${c.name}이(가) 당신을 알아봤다`, r.src === 'saw' ? '그때 현장에 있던 사람이다' : '소문으로 당신 얼굴을 들었다'); }
      break;
    }
  }

  update(dt) {
    const G = this.G;
    // news on the car radio every ~2 game hours while driving
    if (G.vehicle && !G.vehicle.spec.craft) { this.newsT -= dt; if (this.newsT <= 0) { this.newsT = 120; this.radio(); } }
    this.rumorT -= dt; if (this.rumorT <= 0) { this.rumorT = 60; this.spreadRumours(); }
    this.watch(dt);
  }
}
