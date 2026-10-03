import * as THREE from 'three';
import { Vehicle } from './vehicle.js';
import { roadC, N } from './world.js';
import { rand } from './util.js';

// Side jobs: delivery, taxi fare, building patrol, roadside repair, hacking contract
export class Jobs {
  constructor(G) { this.G = G; this.cur = null; G.interact.add(this.deliveryPoint()); }
  get active() { return this.cur; }
  deliveryPoint() {
    const J = this, G = this.G;
    return { get x() { return J.cur?.type === 'delivery' ? J.cur.e.x : 1e9; }, get z() { return J.cur?.type === 'delivery' ? J.cur.e.z : 1e9; }, cy: 1, r: 3.4, name: '배달 도착지', verbs: [{ key: 'F', label: () => '배달 완료', enabled: () => J.cur?.type === 'delivery' && G.items.count('parcel') > 0, run: () => J.finish(true) }] };
  }
  start(type) {
    const G = this.G, pl = G.player;
    if (this.cur) { G.toast('이미 진행 중인 일이 있습니다', this.cur.title); return; }
    const ents = G.world.enterables, far = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
    const pickE = (min, max, from = pl) => { const l = ents.filter((e) => { const d = far(e, from); return d > min && d < max; }); return l[Math.floor(Math.random() * l.length)] || ents[0]; };
    let job = null;
    if (type === 'delivery') {
      const e = pickE(120, 400); G.items.add('parcel');
      job = { type, title: '배달', text: `소포를 ${e.name}에 전달`, e, t: 420, reward: Math.floor(120 + far(e, pl) * 0.45) };
      G.setBeacon(e.x, e.z, 0x47ffa8);
    } else if (type === 'taxi') {
      const e = pickE(60, 200), npc = G.life.npc(null, { npcs: [], interact: [] }, e.x + e.nx * 2, 0, e.z + e.nz * 2, { role: 'passenger' });
      G.humans.includes(npc) || 0;
      job = { type, title: '택시 승객', text: '승객을 태우세요 (차량으로 접근)', e, npc, phase: 0, t: 600 };
      G.setBeacon(e.x + e.nx * 2, e.z + e.nz * 2, 0xffc94d);
    } else if (type === 'patrol') {
      const b = G.buildings.list[Math.floor(Math.random() * G.buildings.list.length)]; b.plan();
      const n = b.levels.length, ks = [1, Math.floor(n / 2), n - 2].map((k) => Math.max(1, Math.min(n - 2, k)));
      const pts = ks.map((k) => ({ k, x: b.core.x0 + 1.4, z: b.core.zc + 1.4, done: false }));
      job = { type, title: '경비 순찰', text: `${b.name} ${ks.map((k) => k + 1).join('·')}층 계단 앞 순찰`, b, pts, t: 300, reward: 420 };
      G.setBeacon(b.door.px, b.door.pz, 0x4de3ff);
    } else if (type === 'repair') {
      const e = pickE(60, 220), x = e.x + e.nx * 8, z = e.z + e.nz * 8;
      const v = new Vehicle(G, 'sedan', 0x4a4a52, 'parked'); v.x = x; v.z = z; v.h = Math.atan2(e.nx, e.nz) + 1.57; v.awake = false; G.addVehicle(v); v.hp = v.maxHp * 0.25; v.burn = 1;
      job = { type, title: '노상 수리', text: '고장 난 차를 수리하세요 (F 길게)', v, t: 420, reward: 220 };
      G.setBeacon(v.x, v.z, 0xffa040);
    } else if (type === 'hack') {
      const offs = G.buildings.list.filter((b) => b.kind === 'office'); const b = offs[Math.floor(Math.random() * offs.length)] || G.buildings.list[0];
      job = { type, title: '해킹 의뢰', text: `${b.name} 오피스 서버에서 데이터를 탈취`, b, t: 900, reward: 1200 };
      G.setBeacon(b.door.px, b.door.pz, 0xff3df0);
    }
    this.cur = job; G.toast(job.title, job.text); G.audio.star?.();
  }
  event(kind, b) { const j = this.cur; if (j && j.type === 'hack' && kind === 'server' && j.b === b) this.finish(true); }
  finish(ok) {
    const G = this.G, j = this.cur; if (!j) return;
    this.cur = null; G.hideBeacon(); if (j.o) G.interact.remove(j.o);
    if (j.type === 'delivery') G.items.take('parcel');
    if (j.npc) { j.npc.remove = true; j.npc.hidden = true; }
    if (ok) { G.cash += j.reward; G.audio.complete(); G.toast('일 완료', `+$${j.reward}`); } else G.toast('일 실패', j.title);
  }
  update(dt) {
    const G = this.G, j = this.cur; if (!j) return; const pl = G.player;
    j.t -= dt; if (j.t <= 0) { this.finish(false); return; }
    const d = (x, z) => Math.hypot(pl.x - x, pl.z - z);
    const v = G.vehicle;
    if (j.type === 'taxi') {
      if (j.phase === 0 && v && v.speed < 4 && d(j.e.x + j.e.nx * 2, j.e.z + j.e.nz * 2) < 9) {
        j.phase = 1; j.npc.hidden = true; j.npc.group.visible = false; const to = G.world.enterables[Math.floor(Math.random() * G.world.enterables.length)];
        j.dest = to; j.reward = Math.floor(25 + Math.hypot(to.x - pl.x, to.z - pl.z) * 0.14); j.t = 420; G.setBeacon(to.x + to.nx * 2, to.z + to.nz * 2, 0xffc94d); G.setMissionText?.('택시', '승객을 목적지로'); G.toast('승객 탑승', `${to.name}`);
      } else if (j.phase === 1 && v && v.speed < 4 && d(j.dest.x + j.dest.nx * 2, j.dest.z + j.dest.nz * 2) < 9) this.finish(true);
      j.hud = j.phase ? `남은 시간 ${Math.max(0, j.t | 0)}s · $${j.reward}` : '승객에게 접근';
    } else if (j.type === 'patrol') {
      const at = G.buildings.at(pl.x, pl.z);
      for (const p of j.pts) if (!p.done && at === j.b) { const L = j.b.levels[p.k]; if (L && Math.abs(pl.y - L.y) < 1.2 && d(p.x, p.z) < 3.2) { p.done = true; G.toast('체크포인트', `${p.k + 1}층`); G.audio.tone?.(900, 0.1, 'sine', 0.1); } }
      if (j.pts.every((p) => p.done)) this.finish(true);
      j.hud = `순찰 ${j.pts.filter((p) => p.done).length}/3 · ${Math.max(0, j.t | 0)}s`;
    } else if (j.type === 'repair') {
      if (j.v.hp >= j.v.maxHp) this.finish(true);
      else if (!j.vv) { j.vv = true; G.interact.add(j.o = { get x() { return j.v.x; }, get z() { return j.v.z; }, cy: 1, r: 3.6, name: '고장 난 차', verbs: [{ key: 'F', label: () => '수리 (8초)', enabled: () => j.v.hp < j.v.maxHp, run: () => G.beginTimed('수리 중…', 8, () => { j.v.hp = j.v.maxHp; j.v.burn = 0; j.v.dead = false; }, 4) }] }); }
      j.hud = `수리 · ${Math.max(0, j.t | 0)}s`;
    } else j.hud = `${Math.max(0, j.t | 0)}s`;
    if (j.type === 'delivery') j.hud = `배달 · ${Math.max(0, j.t | 0)}s · $${j.reward}`;
  }
}
