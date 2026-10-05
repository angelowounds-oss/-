import * as THREE from 'three';
import { R, SW } from './world.js';
import { gpsRoute } from './phone.js';
import { Human } from './human.js';
import { mulberry32 } from './util.js';

// "Real citizens": a fixed register of residents. Every one has a name, a home (building / floor / room), a workplace and a daily
// plan built from the game clock. Where somebody is at a given minute is a pure function of that plan, so the whole city is
// "simulated" without per-frame cost; only the people near the player are materialised as walking humans, and residents
// appear in their own rooms / at their own desks when a floor is built. Deaths are permanent and leave a memorial.
const SUR = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '홍', '전', '고', '문', '양', '손'];
const GIV = ['민준', '서연', '도윤', '하은', '시우', '지우', '주원', '서윤', '예준', '하윤', '지호', '민서', '준우', '수아', '현우', '지안', '건우', '윤서', '우진', '채원',
  '선우', '다은', '연우', '은서', '유준', '소율', '정우', '예린', '승현', '가윤', '태윤', '나연', '동현', '수빈', '재원', '혜진', '상훈', '미경', '영호', '순자'];
const JOB = { office: ['회사원', '개발자', '디자이너', '회계사', '영업사원', '변호사'], hotel: ['호텔리어', '룸메이드', '프런트 직원'], retail: ['점원', '요리사', '바리스타', '약사'], none: ['학생', '무직', '프리랜서', '은퇴자'] };
const WALK = 1.5;            // m/s; 1 real second = 1 game minute, so a 150 m walk takes ~110 game minutes
const RIDE = 16;             // game minutes on the bus / subway between stops
const SIDE = R / 2 + SW / 2; // sidewalk offset from the road centre line
const DAY = 1440;

// offset a road-centre polyline onto the right-hand sidewalk
function sidewalk(pts) {
  if (pts.length < 2) return pts;
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[i], c = pts[Math.min(pts.length - 1, i + 1)];
    let n1x = 0, n1z = 0, n2x = 0, n2z = 0;
    if (i > 0) { const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1; n1x = -dz / l; n1z = dx / l; }
    if (i < pts.length - 1) { const dx = c[0] - b[0], dz = c[1] - b[1], l = Math.hypot(dx, dz) || 1; n2x = -dz / l; n2z = dx / l; }
    if (i === 0) { n1x = n2x; n1z = n2z; } if (i === pts.length - 1) { n2x = n1x; n2z = n1z; }
    let nx = n1x + n2x, nz = n1z + n2z; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    const cos = Math.max(0.5, nx * n1x + nz * n1z);
    out.push([b[0] + (nx * SIDE) / cos, b[1] + (nz * SIDE) / cos]);
  }
  return out;
}
function polyLen(p) { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; }
function along(p, d) {
  for (let i = 1; i < p.length; i++) {
    const l = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
    if (d <= l) { const t = l > 0 ? d / l : 0; return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t, Math.atan2(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])]; }
    d -= l;
  }
  const a = p[p.length - 2] || p[0], b = p[p.length - 1]; return [b[0], b[1], Math.atan2(b[0] - a[0], b[1] - a[1])];
}

export class Citizens {
  constructor(G, count = 2000) {
    this.G = G; this.list = []; this.byId = new Map(); this.active = new Map(); this.t = 0;
    this.stats = { dead: 0, arrived: 0, removed: 0, lost: 0, far: 0, spawned: 0 };
    this.st = G.state.citizens || (G.state.citizens = { dead: {}, memorials: [] });
    const blds = G.buildings.list; blds.forEach((b) => b.plan());
    const doorOf = (b) => ({ x: b.door.px + b.door.nx * 2.2, z: b.door.pz + b.door.nz * 2.2 });
    const homes = blds.filter((b) => b.kind !== 'office' && !b.lot.far), offices = blds.filter((b) => b.kind === 'office'), hotels = blds.filter((b) => b.kind === 'hotel');
    // transit stops: subway entrances and bus stops; people walk to the nearest one and ride the rest
    const stations = [...(G.world.metro || []).map((s) => ({ ...s, kind: 'metro' })), ...(G.world.busStops || []).map((s) => ({ ...s, kind: 'bus' }))];
    const near = (p) => stations.reduce((a, s) => (Math.hypot(s.x - p.x, s.z - p.z) < Math.hypot(a.x - p.x, a.z - p.z) ? s : a), stations[0]);
    const rnd = mulberry32(20261005);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    for (let id = 0; id < count && homes.length; id++) {
      const hb = pick(homes), hk = 1 + Math.floor(rnd() * (hb.levels.length - 2)), hl = hb.levels[Math.min(hk, hb.levels.length - 2)];
      const kHome = hl.tier === 'tower' ? hk : hb.levels.findIndex((l) => l.tier === 'tower');
      const r = rnd(), kind = r < 0.5 ? 'office' : r < 0.62 ? 'hotel' : r < 0.8 ? 'retail' : 'none';
      const wb = kind === 'office' && offices.length ? pick(offices) : kind === 'hotel' && hotels.length ? pick(hotels) : kind === 'retail' ? pick(blds) : null;
      let wk = 0;
      if (wb) { const ks = wb.levels.map((l, k) => [l, k]).filter(([l]) => (kind === 'retail' ? l.type === 'retail' || l.type === 'lobby' : l.tier === 'tower')); wk = ks.length ? pick(ks)[1] : 0; }
      const female = rnd() < 0.5, age = kind === 'none' ? (rnd() < 0.5 ? 16 + Math.floor(rnd() * 8) : 62 + Math.floor(rnd() * 20)) : 24 + Math.floor(rnd() * 34);
      const c = {
        id, name: pick(SUR) + pick(GIV), age, female, job: pick(JOB[kind]), kind,
        home: { b: hb, k: kHome, ri: Math.floor(rnd() * 6) }, work: wb ? { b: wb, k: wk } : null,
        look: { top: new THREE.Color().setHSL(rnd(), 0.35 + rnd() * 0.3, 0.14 + rnd() * 0.16).getHex(), pants: new THREE.Color().setHSL(rnd(), 0.2, 0.08 + rnd() * 0.08).getHex(), hair: 0x111111 },
        leave: 6.5 * 60 + rnd() * 150, back: 17 * 60 + rnd() * 180, errand: 10 * 60 + rnd() * 300, seed: rnd(),
      };
      c.plan = this.makePlan(c, doorOf, near, rnd);
      this.list.push(c); this.byId.set(id, c);
    }
    // residents indexed by building for floor population
    this.byHome = new Map(); this.byWork = new Map();
    for (const c of this.list) {
      const kh = c.home.b.id + ':' + c.home.k; (this.byHome.get(kh) || this.byHome.set(kh, []).get(kh)).push(c);
      if (c.work) { const kw = c.work.b.id + ':' + c.work.k; (this.byWork.get(kw) || this.byWork.set(kw, []).get(kw)).push(c); }
    }
    this.memorials = new THREE.Group(); G.scene.add(this.memorials); this.rebuildMemorials();
    G.interact.providers.push((pl, out) => this.provide(pl, out));
  }
  // ---------- daily plan: list of segments {t0,t1,type:'home'|'walk'|'ride'|'work'|'out', path?} in minutes of the day ----------
  makePlan(c, doorOf, near, rnd) {
    const H = doorOf(c.home.b), segs = [];
    const trip = (from, to, t) => { // walk (+ subway when far) from -> to starting at t; returns arrival time
      const far = Math.hypot(to.x - from.x, to.z - from.z) > 110 && near;
      // short legs: step out to the pavement, then an L along the street (crossing where needed); long legs follow the road graph
      const leg = (a, b, t0) => {
        const direct = Math.hypot(b.x - a.x, b.z - a.z) < 140;
        const p = direct ? [[a.x, a.z], [a.x, b.z], [b.x, b.z]] : [[a.x, a.z], ...sidewalk(gpsRoute(a.x, a.z, b.x, b.z).slice(1, -1)), [b.x, b.z]];
        const d = polyLen(p); segs.push({ type: 'walk', t0, t1: t0 + d / WALK, path: p, len: d }); return t0 + d / WALK;
      };
      if (!far) return leg(from, to, t);
      const s1 = near(from), s2 = near(to);
      if (s1 === s2) return leg(from, to, t);
      let tt = leg(from, s1, t); segs.push({ type: 'ride', t0: tt, t1: tt + RIDE, from: s1, to: s2 }); tt += RIDE; return leg(s2, to, tt);
    };
    let t = 0;
    if (c.work) {
      const W = doorOf(c.work.b);
      segs.push({ type: 'home', t0: 0, t1: c.leave });
      const arrive = trip(H, W, c.leave);
      const back = Math.max(arrive + 240, c.back);
      segs.push({ type: 'work', t0: arrive, t1: back });
      t = trip(W, H, back);
    } else {
      const shop = this.G.buildings.list[Math.floor(c.seed * this.G.buildings.list.length)], S = doorOf(shop);
      segs.push({ type: 'home', t0: 0, t1: c.errand });
      const a = trip(H, S, c.errand); segs.push({ type: 'out', t0: a, t1: a + 50, b: shop });
      t = trip(S, H, a + 50);
    }
    segs.push({ type: 'home', t0: t, t1: DAY + 1 });
    // keep the day inside 24 h: anything that would run past midnight is cut (the person is simply home)
    for (const sg of segs) { sg.t0 = Math.min(sg.t0, DAY - 1); sg.t1 = Math.min(sg.t1, DAY + 1); }
    return segs;
  }
  segAt(c, min) { const m = ((min % DAY) + DAY) % DAY; for (const s of c.plan) if (m >= s.t0 && m < s.t1) return [s, m]; return [c.plan[c.plan.length - 1], m]; }
  // where is this person right now: { where: 'home'|'work'|'out'|'street'|'subway', x, z, ry, seg }
  locate(c, min = this.G.clock.t) {
    const [s, m] = this.segAt(c, min);
    if (s.type === 'walk') { const [x, z, ry] = along(s.path, (m - s.t0) * WALK); return { where: 'street', x, z, ry, seg: s }; }
    if (s.type === 'ride') return { where: 'subway', x: s.to.x, z: s.to.z, seg: s };
    const b = s.type === 'work' ? c.work.b : s.type === 'out' ? s.b : c.home.b;
    return { where: s.type, x: b.door.px, z: b.door.pz, b, seg: s };
  }
  status(c) {
    if (this.st.dead[c.id]) return '사망';
    const L = this.locate(c), h = this.G.clock.hour;
    return L.where === 'street' ? '이동 중' : L.where === 'subway' ? (L.seg.from.kind === 'metro' ? '지하철 탑승 중' : '버스 탑승 중') : L.where === 'work' ? `${c.work.b.name}에서 근무 중` : L.where === 'out' ? `${L.b.name} 방문 중` : (h >= 23 || h < 6 ? '집에서 자는 중' : '집에 있음');
  }
  addr(c) { return `${c.home.b.name} ${c.home.k + 1}층 ${c.home.ri + 1}호`; }

  // ---------- materialisation of people walking near the player ----------
  update(dt) {
    this.t -= dt; if (this.t > 0) return; this.t = 0.5;
    const G = this.G, pl = G.player, now = G.clock.t, R2 = 120 * 120;
    for (const c of this.list) {
      if (c.indoor && (c.indoor.dead || !G.humans.includes(c.indoor))) c.indoor = null;
      if (this.st.dead[c.id] || this.active.has(c.id) || c.indoor) continue;
      const [s, m] = this.segAt(c, now); if (s.type !== 'walk') continue;
      const [x, z] = along(s.path, (m - s.t0) * WALK); if ((x - pl.x) ** 2 + (z - pl.z) ** 2 > R2) continue;
      if (this.active.size >= 28) break;
      const h = new Human(G, 'civ', { hp: 45, look: c.look });
      h.citizen = c; h.x = x; h.z = z; h.y = 0; h.state = 'route'; h.node = null; h.cash = 10 + Math.floor(c.seed * 120);
      G.humans.push(h); G.scene.add(h.group); this.active.set(c.id, h); this.stats.spawned++;
    }
    for (const [id, h] of this.active) {
      const gone = h.dead || h.remove || !G.humans.includes(h);
      const far = Math.hypot(h.x - pl.x, h.z - pl.z) > 170;
      if (gone || (far && h.state === 'route')) { if (!gone) { h.remove = true; } this.stats[gone ? (h.dead ? 'dead' : h.remove ? (h.state === 'gone' ? 'arrived' : 'removed') : 'lost') : 'far']++; this.active.delete(id); }
    }
  }
  // per-frame steering of a materialised citizen (called from Human.update while state === 'route')
  steer(h) {
    const c = h.citizen, [s, m] = this.segAt(c, this.G.clock.t);
    if (s.type !== 'walk') { this.arrive(h, s); return { x: 0, z: 0, s: 0 }; }
    const [x, z] = along(s.path, (m - s.t0) * WALK), dx = x - h.x, dz = z - h.z, d = Math.hypot(dx, dz);
    if (d > 25) { h.x = x; h.z = z; return { x: 0, z: 0, s: 0 }; }
    if (d < 0.05) return { x: 0, z: 0, s: 0 };
    return { x: dx / d, z: dz / d, s: Math.min(3.2, WALK * (d > 1.5 ? 1.8 : 1)) };
  }
  // the walk is over: go inside (taking the real elevator up to the right floor when the building is live) or down to the subway
  arrive(h, s) {
    const G = this.G, c = h.citizen;
    if (s.type === 'ride' || !(s.type === 'home' || s.type === 'work' || s.type === 'out')) { h.remove = true; h.state = 'gone'; return; }
    const b = s.type === 'work' ? c.work.b : s.type === 'out' ? s.b : c.home.b, k = s.type === 'work' ? c.work.k : s.type === 'home' ? c.home.k : 0;
    const e = G.world.enterables.find((q) => q.lot === b.lot);
    if (e && b.open && b.elev && k > 0 && Math.hypot(b.cx - G.player.x, b.cz - G.player.z) < 70) {
      G.society.enter(h, e);
      if (h.trip) { h.trip.fixedDest = k; h.trip.room = c.home.ri; h.state = 'trip'; c.indoor = h; return; }
    }
    h.remove = true; h.state = 'gone';
  }

  // ---------- residents and workers placed in their rooms when a floor is built ----------
  populateFloor(b, fl, L, rooms) {
    if (!rooms || !rooms.length) return;
    const G = this.G, life = G.life, now = G.clock.t, hour = G.clock.hour, y = L.y;
    const put = (c, rm, sleeping) => {
      if (this.st.dead[c.id] || c.indoor) return;
      const cx = (rm.x0 + rm.x1) / 2, cz = (rm.z0 + rm.z1) / 2, dirIn = rm.wall === 'n' ? 1 : -1, back = rm.wall === 'n' ? rm.z1 - 0.4 : rm.z0 + 0.4;
      const bed = rm.kind === 'bedroom' && sleeping;
      const x = bed ? cx : cx + (c.seed - 0.5) * 2, z = bed ? back - dirIn * 1.2 : cz + (c.seed * 7 % 1 - 0.5) * 1.5;
      const h = life.npc(b, fl, x, bed ? y + 0.55 : y, z, { look: c.look, ry: bed ? (dirIn > 0 ? 0 : Math.PI) : c.seed * 6.28 });
      h.citizen = c; h.lookAtPlayer = !bed; if (bed) { h.lying = true; h.sleeping = true; }
      c.indoor = h; h.onDrop = () => { if (c.indoor === h) c.indoor = null; };
      (fl.citizens || (fl.citizens = [])).push(c);
    };
    for (const c of this.byHome.get(b.id + ':' + fl.k) || []) {
      const L2 = this.locate(c, now); if (L2.where !== 'home') continue;
      put(c, rooms[c.home.ri % rooms.length], hour >= 23 || hour < 6.2);
    }
    for (const c of this.byWork.get(b.id + ':' + fl.k) || []) {
      const L2 = this.locate(c, now); if (L2.where !== 'work') continue;
      put(c, rooms[(c.id * 7) % rooms.length], false);
    }
  }
  floorDropped(fl) { for (const c of fl.citizens || []) c.indoor = null; }

  // ---------- name tags / talk ----------
  provide(pl, out) {
    for (const h of this.G.humans) {
      const c = h.citizen; if (!c || h.dead || h.hidden || !h.group.visible) continue;
      if (Math.abs((h.y || 0) - (pl.y || 0)) > 2 || Math.hypot(h.x - pl.x, h.z - pl.z) > 2.6) continue;
      out.push({ x: h.x, z: h.z, r: 2.6, cy: (h.y || 0) + 1.0, name: `${c.name} · ${c.age}세 · ${c.job}`, verbs: [
        { key: 'F', label: () => (h.sleeping ? '깨우기' : '대화'), run: () => this.talk(h) },
      ] });
    }
  }
  talk(h) {
    const c = h.citizen, G = this.G;
    if (h.sleeping) { h.sleeping = false; h.lying = false; h.y = h.floorY = (h.y || 0) - 0.55; G.toast(c.name, '…누구세요? 나가세요!'); h.state = 'flee'; h.fleeT = 6; h.threat = G.player; G.society.crime('trespass', 6, h.x, h.z); return; }
    const lines = [`${c.home.b.name}에 살아요. ${c.home.k + 1}층이요.`, c.work ? `${c.work.b.name}에서 ${c.job}로 일해요.` : `요즘은 ${c.job}예요.`, '요즘 밤에 총소리가 너무 많아요.', '지하철 타려면 저 보행자 거리로 가세요.'];
    G.toast(`${c.name} (${c.age})`, lines[Math.floor(Math.random() * lines.length)]);
  }

  // ---------- death is permanent ----------
  killed(h) {
    const c = h.citizen; if (!c || this.st.dead[c.id]) return;
    this.st.dead[c.id] = { t: this.G.clock.t, x: h.x, z: h.z, y: h.y || 0 };
    if ((h.y || 0) < 0.5) { this.st.memorials.push({ x: h.x, z: h.z, name: c.name, age: c.age, t: this.G.clock.t }); if (this.st.memorials.length > 40) this.st.memorials.shift(); this.rebuildMemorials(); }
    this.G.feed?.(`${c.name}(${c.age}) 사망 — ${c.job}`, '#ff8a5c');
    c.indoor = null;
  }
  // candles, flowers and a name card where a resident died on the street
  rebuildMemorials() {
    const g = this.memorials; for (const o of [...g.children]) { g.remove(o); o.geometry?.dispose(); }
    const ms = this.st.memorials; if (!ms.length) return;
    const candle = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 6).translate(0, 0.07, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.75, 0.4).multiplyScalar(2.2), toneMapped: false }), ms.length * 5);
    const flower = new THREE.InstancedMesh(new THREE.ConeGeometry(0.12, 0.3, 6).rotateX(Math.PI).translate(0, 0.15, 0), new THREE.MeshStandardMaterial({ color: 0xf2f2f6, roughness: 0.8 }), ms.length * 3);
    const m4 = new THREE.Matrix4(); let ci = 0, fi = 0;
    for (const mm of ms) {
      const r = mulberry32(Math.floor(mm.t * 13) + mm.name.length);
      for (let k = 0; k < 5; k++) { m4.makeTranslation(mm.x + Math.cos(k * 1.26) * 0.45 + (r() - 0.5) * 0.1, 0, mm.z + Math.sin(k * 1.26) * 0.45); candle.setMatrixAt(ci++, m4); }
      for (let k = 0; k < 3; k++) { m4.makeTranslation(mm.x + (r() - 0.5) * 0.4, 0, mm.z + (r() - 0.5) * 0.4); flower.setMatrixAt(fi++, m4); }
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96; const x = cv.getContext('2d');
      x.fillStyle = '#0b0b0d'; x.fillRect(0, 0, 256, 96); x.strokeStyle = '#d8d8d8'; x.strokeRect(4, 4, 248, 88);
      x.fillStyle = '#eee'; x.font = '28px sans-serif'; x.textAlign = 'center'; x.fillText(`故 ${mm.name}`, 128, 44); x.font = '18px sans-serif'; x.fillStyle = '#aaa'; x.fillText(`향년 ${mm.age}세`, 128, 74);
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
      const card = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.19), new THREE.MeshBasicMaterial({ map: tex })); card.position.set(mm.x, 0.32, mm.z); card.rotation.x = -0.9; g.add(card);
    }
    g.add(candle, flower);
  }
}
