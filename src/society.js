import * as THREE from 'three';
import { Human } from './human.js';
import { clamp, rand, TAU } from './util.js';
import { roadC, N } from './world.js';
import { navPath } from './nav.js';

export const ZONES = [
  { name: '중앙 광장', gang: null, c: '#4de3ff' },
  { name: '네온 구역', gang: '네온 하운즈', c: '#ff3df0' },
  { name: '차이나 블록', gang: '용문파', c: '#ff4560' },
  { name: '산업 지구', gang: '강철 형제단', c: '#ffc94d' },
  { name: '금융 지구', gang: null, c: '#47ffa8' },
];

// Social layer: citizen routines, witnesses & law, arrests, dialogue, gang zones & reputation
export class Society {
  constructor(G) {
    this.G = G; this.t = 0; this.doorGrid = new Map(); this.arrestT = 0; this.reports = 0;
    G.state.rep = G.state.rep || {};
    for (const e of G.world.enterables || []) {
      const k = this.cell(e.x, e.z); let a = this.doorGrid.get(k); if (!a) this.doorGrid.set(k, (a = [])); a.push(e);
    }
    G.interact.providers.push((pl, out) => this.npcProvider(pl, out));
    this.gangs = [];
  }
  cell(x, z) { return Math.floor(x / 40) * 100003 + Math.floor(z / 40); }
  doorsNear(x, z, r) {
    const out = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = this.doorGrid.get(this.cell(x + i * 40, z + j * 40)); if (a) for (const e of a) if (Math.hypot(e.x - x, e.z - z) < r) out.push(e); }
    return out;
  }
  zoneAt(x, z) {
    const G = this.G; const d = Math.hypot(x, z);
    if (d < 90) return 0;
    if (Math.abs(x) > Math.abs(z)) return x > 0 ? 2 : 3;
    return z > 0 ? 1 : 4;
  }
  rep(zone) { return this.G.state.rep[zone] ?? (ZONES[zone].gang ? -25 : 0); }
  addRep(zone, v) { this.G.state.rep[zone] = clamp(this.rep(zone) + v, -100, 100); }
  popFactor() { const h = this.G.clock.hour; return 0.3 + 0.7 * Math.pow(Math.max(0, Math.sin((h - 5) / 24 * TAU * 0.5 + 0.2)), 0.6) * (h > 5 && h < 24 ? 1 : 0.45); }

  // ---------- citizen routines ----------
  maybeVisit(h, dt) {
    h.visitT = (h.visitT ?? rand(8, 40)) - dt;
    if (h.visitT > 0) return;
    h.visitT = rand(18, 60);
    const doors = this.doorsNear(h.x, h.z, 14);
    if (!doors.length) return;
    const e = doors[Math.floor(Math.random() * doors.length)];
    h.state = 'visit'; h.target = e; h.visitSince = this.G.time;
  }
  visitStep(h, dt) {
    const e = h.target; if (!e) { h.state = 'walk'; return { x: 0, z: 0, s: 0 }; }
    const dx = e.x - h.x, dz = e.z - h.z, d = Math.hypot(dx, dz);
    if (d < 1.4 || this.G.time - h.visitSince > 30) {
      if (d < 2.4) this.enter(h, e); else { h.state = 'walk'; h.snapToNode(); }
      return { x: 0, z: 0, s: 0 };
    }
    return { x: dx / d, z: dz / d, s: 1.7 };
  }
  enter(h, e) {
    const G = this.G, b = G.buildings.byLot.get(e.lot);
    e.lot.occupants = (e.lot.occupants || 0) + 1;
    if (b && b.open && b.floors.has(0) && b.elev && Math.hypot(b.cx - G.player.x, b.cz - G.player.z) < 70) {
      h.inside = { e, until: Infinity, trip: true }; h.trip = { b, e, phase: 0, t: 0, path: null, k: 0, wait: 0 }; h.state = 'trip';
      h.x = e.x - e.nx * 2.4; h.z = e.z - e.nz * 2.4; h.y = 0; h.floorY = 0;
      return;
    }
    h.inside = { e, until: this.G.time + rand(25, 100) };
    h.hidden = true; h.group.visible = false; h.state = 'walk';
  }
  endTrip(h) { const tr = h.trip; h.trip = null; h.floorY = 0; h.y = 0; if (h.inside) { h.inside.until = 0; h.inside.trip = false; } if (tr) h.hidden = true; }
  // building-interior routine: lobby -> elevator -> upper floor room -> wander -> back down -> street
  tripStep(h, dt) {
    const G = this.G, tr = h.trip, b = tr.b, el = b.elev; tr.t += dt;
    const stop = { x: 0, z: 0, s: 0 };
    if (!b.open || !el || tr.t > 260) { this.endTrip(h); return stop; }
    if (h.state === 'flee') { h.trip = null; h.inside = null; h.floorY = h.y; return stop; }
    const sh = b.shaft, ex = (sh.x0 + sh.x1) / 2, front = { x: ex, z: b.core.zc + 1.3 };
    const follow = (dest) => {
      if (!tr.path) { tr.path = navPath(G, h.floorY, h.x, h.z, dest.x, dest.z) || [[dest.x, dest.z]]; }
      const p = tr.path[0]; if (!p) { tr.path = null; return true; }
      const dx = p[0] - h.x, dz = p[1] - h.z, d = Math.hypot(dx, dz);
      if (d < 0.45) { tr.path.shift(); if (!tr.path.length) { tr.path = null; return true; } return false; }
      stop.x = dx / d; stop.z = dz / d; stop.s = 1.5; return false;
    };
    const lvlY = (k) => b.levels[k].y;
    if (stop.s === 0 && [0, 5, 6, 9].includes(tr.phase)) {
      const mv = Math.hypot(h.x - (tr.lx ?? h.x), h.z - (tr.lz ?? h.z)); tr.lx = h.x; tr.lz = h.z;
      if (mv < 0.01 * dt * 60 && tr.path !== null) tr.stuck = (tr.stuck || 0) + dt; else tr.stuck = 0;
      if (tr.stuck > 4) { tr.stuck = 0; tr.path = null; if (tr.phase === 5) { tr.target = null; tr.stay = 0; tr.phase = 6; } else if (tr.phase === 9) { this.leave(h); return stop; } }
    }
    switch (tr.phase) {
      case 0: if (follow(front)) { el.call(tr.k, true); tr.phase = 1; tr.wait = 0; } break;
      case 1: tr.wait += dt; if (el.state === 'idle' && el.level === tr.k && el.doorOpen > 0.85 && !el.riding(G.player)) { tr.phase = 2; } else if (tr.wait > 20) { el.call(tr.k, true); tr.wait = 0; } break;
      case 2: { const dx = ex - h.x, dz = el.cz - h.z, d = Math.hypot(dx, dz); if (d < 0.5) {
        const cands = [...b.floors.keys()].filter((k) => k !== tr.k && b.levels[k].type !== 'roof' && b.levels[k].tier !== 'podium');
        tr.dest = cands.length ? cands[Math.floor(Math.random() * cands.length)] : (tr.k === 0 ? 1 : 0);
        if (el.queue.length === 0 && el.state === 'idle') { el.send(tr.dest); tr.phase = 3; } else tr.phase = 1;
      } else { stop.x = dx / d; stop.z = dz / d; stop.s = 1.4; } break; }
      case 3: h.x = ex; h.z = el.cz; h.y = el.y; h.floorY = el.y; if (el.state === 'idle' && el.level === tr.dest && el.doorOpen > 0.85) { tr.k = tr.dest; tr.phase = 4; tr.path = null; h.y = lvlY(tr.k); h.floorY = h.y; } break;
      case 4: { const fl = b.floors.get(tr.k); const rm = fl && fl.rooms && fl.rooms[Math.floor(Math.random() * fl.rooms.length)];
        tr.target = rm ? { x: (rm.x0 + rm.x1) / 2, z: (rm.z0 + rm.z1) / 2 } : { x: front.x + 4, z: front.z }; tr.phase = 5; tr.path = null; tr.idle = 0; break; }
      case 5: if (tr.target) { if (follow(tr.target)) { tr.idle += 1; tr.target = null; tr.stay = 6 + Math.random() * 14; } } else { tr.stay -= dt; if (tr.stay <= 0) { tr.phase = 6; tr.path = null; } } break;
      case 6: if (tr.k === 0) { tr.phase = 9; break; } if (follow(front)) { el.call(tr.k, true); tr.phase = 7; tr.wait = 0; } break;
      case 7: tr.wait += dt; if (el.state === 'idle' && el.level === tr.k && el.doorOpen > 0.85 && !el.riding(G.player)) tr.phase = 8; else if (tr.wait > 25) { el.call(tr.k, true); tr.wait = 0; } break;
      case 8: { const dx = ex - h.x, dz = el.cz - h.z, d = Math.hypot(dx, dz); if (d < 0.5) { if (el.queue.length === 0 && el.state === 'idle') { tr.dest = 0; el.send(0); tr.phase = 3; tr.leaving = true; } else tr.phase = 7; } else { stop.x = dx / d; stop.z = dz / d; stop.s = 1.4; } break; }
      case 9: { const d = b.door, target = { x: d.px + d.nx * 1.2, z: d.pz + d.nz * 1.2 };
        if (follow(target)) { this.leave(h); } break; }
    }
    if (tr.phase === 3 && tr.leaving && el.level === 0 && el.state === 'idle' && el.doorOpen > 0.85) { tr.k = 0; tr.phase = 9; tr.leaving = false; tr.path = null; h.y = 0; h.floorY = 0; }
    return stop;
  }
  leave(h) {
    const e = h.inside.e; h.inside = null; h.trip = null; h.hidden = false; h.floorY = 0;
    h.x = e.x + e.nx * 0.5; h.z = e.z + e.nz * 0.5; h.y = 0; h.state = 'walk'; h.snapToNode();
    e.lot.occupants = Math.max(0, (e.lot.occupants || 1) - 1);
  }

  // ---------- witnesses & crime ----------
  witnessesOf(x, z) {
    const G = this.G, out = [];
    for (const h of G.humans) {
      if (h.dead || h.hidden || (h.inside && !h.trip) || (h.team !== 'civ' && h.team !== 'cop') || h.guard) continue;
      const d = Math.hypot(h.x - x, h.z - z); if (d > (h.team === 'cop' ? 50 : 28) || Math.abs((h.y || 0) - (G.player.y || 0)) > 3.5) continue;
      if (G.hasLOS(h.x, (h.y || 0) + 1.5, h.z, x, (G.player.y || 0) + 1.4, z)) out.push(h);
    }
    return out;
  }
  // a crime committed by the player: only witnessed crimes become wanted heat
  crime(kind, heat, x, z) {
    const G = this.G, pl = G.player;
    x ??= pl.x; z ??= pl.z;
    const w = this.witnessesOf(x, z);
    if (!w.length) { return false; }
    let any = false;
    for (const h of w) {
      if (h.team === 'cop') { G.addHeat(heat); any = true; continue; }
      if (h.report) continue;
      h.report = { t: 2.2 + Math.random() * 2, heat, kind }; any = true;
      if (h.state !== 'flee') h.state = 'call';
    }
    if (any && !this._warn) { this._warn = true; G.toast('목격자가 있다!', '신고하기 전에 처리하세요'); setTimeout(() => (this._warn = false), 6000); }
    return any;
  }

  // ---------- arrests ----------
  updateLaw(dt) {
    const G = this.G, pl = G.player;
    if (G.wanted <= 0 || pl.dead || G.sleeping || this.busted) { this.arrestT = 0; return; }
    let cop = null;
    for (const h of G.humans) if (h.team === 'cop' && !h.dead && Math.hypot(h.x - pl.x, h.z - pl.z) < 2.4) { cop = h; break; }
    if (!cop && G.vehicle && G.vehicle.speed < 2.5) for (const v of G.vehicles) if (v.police && !v.dead && Math.hypot(v.x - pl.x, v.z - pl.z) < 7) { cop = v; break; }
    if (pl.surrenderT > 0) { pl.surrenderT -= dt; pl.weaponDrawn = false; }
    const quiet = G.time - (G.lastShotT || -9) > 1.8 && !pl.weaponDrawn;
    if (!cop && pl.surrenderT > 0) for (const h of G.humans) if (h.team === 'cop' && !h.dead && Math.hypot(h.x - pl.x, h.z - pl.z) < 4.5) { cop = h; break; }
    if (cop && quiet) { this.arrestT += dt * (pl.surrenderT > 0 ? 2 : 1); if (this.arrestT > 1.6 && !this.hint) { this.hint = true; G.toast('체포 중…', '총을 쏘면 저항'); } if (this.arrestT > 3.2) this.arrest(); }
    else { this.arrestT = Math.max(0, this.arrestT - dt); this.hint = false; }
  }
  async arrest() {
    const G = this.G, pl = G.player;
    this.busted = true; this.arrestT = 0; G.uiModal = true;
    G.toast('<span style="color:#ff4560">BUSTED</span>', '체포되었습니다');
    await G.fadeTo(1);
    if (G.vehicle) G.exitVehicle(true);
    const fine = Math.min(Math.floor(G.cash), 120 * G.wanted + 150);
    G.cash -= fine;
    const inv = G.items.inv.items; let seized = 0;
    for (const id of ['lockpick', 'crowbar', 'grenade', 'mag_pistol', 'mag_rifle', 'knife', 'cashroll', 'watch', 'laptop', 'gold', 'docs']) if (inv[id]) { seized += inv[id]; delete inv[id]; }
    for (const a of pl.ammo) a.reserve = Math.min(a.reserve, 30);
    G.clearWanted(); G.clock.t += 120;
    for (const h of G.humans) if (h.team === 'cop') { h.hidden = h.remove = true; }
    const sp = G.world.spawn; pl.body3.teleport(sp.x, 0, sp.z); pl.x = sp.x; pl.z = sp.z; pl.y = 0.06;
    G.toast('석방', `벌금 $${fine}${seized ? ` · 압수 ${seized}점` : ''}`);
    this.busted = false; G.uiModal = false; G.save();
    await G.fadeTo(0);
  }

  // ---------- NPC interaction ----------
  npcProvider(pl, out) {
    const G = this.G; if (G.items.carry) return;
    let best = null, bd = 2.6;
    const fx = Math.sin(G.cam.yaw), fz = Math.cos(G.cam.yaw);
    for (const h of G.humans) {
      if (h.team !== 'civ' || h.dead || h.hidden || (h.inside && !h.trip) || h.role === 'reception' || h.role === 'cashier' || h.state === 'flee') continue;
      const dx = h.x - pl.x, dz = h.z - pl.z, d = Math.hypot(dx, dz);
      if (d > bd || Math.abs((h.y || 0) - (pl.y || 0)) > 2.2) continue;
      const facing = (dx * fx + dz * fz) / (d + 1e-3); if (facing < 0.2 && d > 1.2) continue;
      bd = d; best = h;
    }
    if (!best) return;
    const h = best;
    out.push({ x: h.x, z: h.z, cy: (h.y || 0) + 1, r: 3, name: '시민', verbs: [
      { key: 'F', label: () => '말 걸기', run: () => this.dialog(h) },
      { key: 'G', label: () => '소매치기', run: () => this.pickpocket(h) },
      { key: 'T', label: () => (G.player.weaponDrawn ? '강탈' : '밀치기'), run: () => (G.player.weaponDrawn ? this.mug(h) : this.shove(h)) },
    ] });
  }
  pickpocket(h) {
    const G = this.G, pl = G.player;
    const behind = Math.cos(h.ry - pl.ry) > 0.2;
    const ok = Math.random() < (behind ? 0.75 : 0.3) * (pl.crouching ? 1.3 : 1);
    if (ok) { const v = h.cash; h.cash = 0; G.cash += v; G.audio.cash(); G.toast('소매치기 성공', `+$${v}`); this.crime('theft', 5); }
    else { G.toast('들켰다!'); h.state = 'flee'; h.fleeT = 8; h.threat = pl; this.crime('theft', 8); }
  }
  mug(h) {
    const G = this.G; const v = h.cash + Math.floor(rand(10, 60)); h.cash = 0; G.cash += v; G.audio.cash();
    G.toast('강탈', `+$${v}`); h.state = 'flee'; h.fleeT = 10; h.threat = G.player; this.crime('robbery', 18);
  }
  shove(h) {
    const G = this.G, pl = G.player, dx = h.x - pl.x, dz = h.z - pl.z, l = Math.hypot(dx, dz) || 1;
    h.ragdoll(dx / l * 5, dz / l * 5, 2); h.hurt(4, pl, false, pl); G.audio.impact?.(0.5, 0); this.crime('assault', 6);
  }
  dialog(h) {
    const G = this.G, z = this.zoneAt(h.x, h.z), Z = ZONES[z];
    const rumor = [`${Z.name}은 밤이 되면 분위기가 달라져요.`, '꼭대기 층 라운지에 가면 비싼 금고가 있다던데.', '경찰은 목격자가 신고해야 움직여요. 조용히 하면 돼요.', '전당포에선 훔친 시계도 받아줘요.', '철물점에서 락픽을 팔아요.'][Math.floor(Math.random() * 5)];
    const find = (label, test) => ({ text: label, fn: () => {
      const list = (G.world.enterables || []).slice().sort((a, b) => Math.hypot(a.x - h.x, a.z - h.z) - Math.hypot(b.x - h.x, b.z - h.z));
      const e = list[Math.floor(Math.random() * Math.min(6, list.length))];
      G.setBeacon(e.x, e.z); G.toast('길 안내', `${e.name} (${Math.hypot(e.x - G.player.x, e.z - G.player.z) | 0}m)`); G.panels.close();
    } });
    G.panels.show('talk', { name: '시민', text: '무슨 일이죠?', options: [
      { text: '이 근처 건물 위치 묻기', fn: find().fn },
      { text: '소문 듣기', fn: () => { G.toast('시민', rumor); } },
      { text: '위협하기 (총 필요)', fn: () => { const pl = G.player; if (pl.cur === 9) { G.toast('시민', '웃기지 마세요…'); } else { pl.weaponDrawn = true; pl.aimT = 2; G.panels.close(); this.mug(h); } } },
      { text: '구걸하기 (+$2~15)', fn: () => { if (Math.random() < 0.5) { const v = 2 + Math.floor(Math.random() * 14); G.cash += v; G.toast(`+$${v}`); G.audio.cash(); } else G.toast('시민', '미안해요, 지금은…'); } },
    ] });
  }
  cctvCheck() {
    const G = this.G, pl = G.player;
    if (!(pl.weaponDrawn || G.alarm) || G.time - (this.cctvT || -99) < 30) return;
    for (const b of G.buildings.active) for (const [, fl] of b.floors) for (const c of fl.cctv || []) {
      if (!c.alive || Math.hypot(c.x - pl.x, c.z - pl.z) > 26 || Math.abs(c.y - pl.y - 1.5) > 6) continue;
      if (G.hasLOS(c.x, c.y, c.z, pl.x, pl.y + 1.3, pl.z)) { this.cctvT = G.time; G.addHeat(16); G.toast('CCTV에 포착됨', '카메라를 쏴서 파괴할 수 있다'); return; }
    }
  }
  // ---------- gang presence ----------
  update(dt) {
    const G = this.G, pl = G.player; this.t -= dt;
    this.updateLaw(dt);
    if (this.t > 0) return; this.t = 2;
    this.cctvCheck();
    const z = this.zoneAt(pl.x, pl.z); G.zone = z;
    // ambient gang patrols in gang zones
    this.gangs = this.gangs.filter((h) => !h.dead && !h.remove);
    const Z = ZONES[z];
    if (Z.gang && !G.vehicle && this.gangs.length < 5 && G.time - (this.lastGang || 0) > 14 && !G.interiorsOnly) {
      const a = rand(0, TAU), r = rand(45, 85), x = pl.x + Math.cos(a) * r, zz = pl.z + Math.sin(a) * r;
      if (this.zoneAt(x, zz) === z) {
        const g = new Human(G, 'gang', { hp: 75, weapon: Math.random() < 0.3 ? 2 : 1, look: { top: new THREE.Color(Z.c).multiplyScalar(0.25).getHex(), pants: 0x15101a, trim: [1, 0.3, 0.6], hair: 0x111111 } });
        const rr = G.world.colliders.resolve(x, zz, 0.4, 0); g.x = rr.x; g.z = rr.z; g.home = { x: g.x, z: g.z }; g.patrol = true; g.state = 'idle'; g.detect = this.rep(z) > 25 ? 0 : 36; g.zone = z; g.cash = Math.floor(rand(30, 120));
        G.humans.push(g); G.scene.add(g.group); this.gangs.push(g); this.lastGang = G.time;
      }
    }
    for (const g of this.gangs) { if (Math.hypot(g.x - pl.x, g.z - pl.z) > 190) { g.remove = true; } else g.detect = this.rep(g.zone) > 25 ? 0 : 36; }
  }
}
