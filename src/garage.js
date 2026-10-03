import * as THREE from 'three';
import { Builder } from './gfx.js';
import { Vehicle, CAR_COLORS } from './vehicle.js';
import { roadC, R, SW } from './world.js';
import { clamp, rand } from './util.js';

const STATION_NODES = [[1, 3], [3, 1], [5, 4], [7, 5], [3, 7], [6, 7], [2, 5]];
const PRICE_L = 1.4;

// Gas stations, workshop, trunks, taxi service, boats & helicopters (mixed into Game.prototype)
export const garage = {
  buildStations() {
    const G = this, B = new Builder(); G.stations = [];
    for (const [i, j] of STATION_NODES) {
      const x = roadC(i) + R / 2 + SW / 2 + 0.2, z = roadC(j) + R / 2 + SW / 2 + 0.2;
      const col = new THREE.Color(1, 0.75, 0.2);
      for (const dx of [-1.2, 1.2]) { B.ext('decor', x + dx - 0.3, 0, z - 0.25, x + dx + 0.3, 1.5, z + 0.25, 0x2a303c); B.ext('emit', x + dx - 0.2, 1.0, z + 0.26, x + dx + 0.2, 1.3, z + 0.28, col, 1.8); }
      B.ext('decor', x - 2.4, 3.3, z - 1.4, x + 2.4, 3.5, z + 1.4, 0x1a1d27); B.ext('emit', x - 2.4, 3.2, z + 1.4, x + 2.4, 3.3, z + 1.45, col, 2.4);
      for (const sx of [-2.2, 2.2]) B.ext('decor', x + sx - 0.1, 0, z - 1.3, x + sx + 0.1, 3.3, z - 1.1, 0x1a1d27);
      G.world.colliders.addBox(x - 1.5, z - 0.3, x + 1.5, z + 0.3, 1.5, 'pump');
      G.stations.push({ x, z });
      G.world.fakeLights.push({ x, y: 0, z, c: [1, 0.7, 0.2], rad: 14 });
      G.interact.add({
        x, z: z + 1.4, cy: 1, r: 3.2, name: '정비소 · 주유소', verbs: [
          { key: 'F', label: () => '정비소 이용', run: () => G.openGarage() },
          { key: 'G', label: () => '연료통 구매 $12', run: () => { if (G.cash >= 12) { G.cash -= 12; G.items.add('jerrycan'); G.audio.cash(); } else G.toast('돈이 부족합니다'); } },
        ],
      });
    }
    B.finish(G.scene);
  },
  nearStation(x, z, r = 8) { for (const s of this.stations || []) if (Math.hypot(s.x - x, s.z - z) < r) return s; return null; },
  refuel(v) {
    const need = 100 - v.fuel, cost = Math.ceil(need * PRICE_L * 0.5);
    if (need < 1) { this.toast('연료 가득'); return; }
    if (this.cash < cost) { const can = Math.floor(this.cash / (PRICE_L * 0.5)); if (can < 1) { this.toast('돈이 부족합니다'); return; } v.fuel += can; this.cash -= Math.ceil(can * PRICE_L * 0.5); this.toast('주유', `+${can}L`); return; }
    this.cash -= cost; v.fuel = 100; this.audio.cash(); this.toast('주유 완료', `-$${cost}`);
  },
  openGarage() {
    const v = this.lastVehicle && !this.lastVehicle.dead ? this.lastVehicle : null;
    if (!v || Math.hypot(v.x - this.player.x, v.z - this.player.z) > 16) { this.toast('정비할 차량이 근처에 없습니다', '차를 가까이 세우세요'); return; }
    const G = this, M = v.mods;
    const repairCost = Math.ceil((v.maxHp - v.hp) * 2.2);
    const opts = [
      { text: `수리 $${repairCost}`, fn: () => { if (v.hp >= v.maxHp) return G.toast('이미 멀쩡합니다'); if (G.cash >= repairCost) { G.cash -= repairCost; v.hp = v.maxHp; v.dead = false; v.burn = 0; G.audio.cash(); G.toast('수리 완료'); } else G.toast('돈이 부족합니다'); } },
      { text: `엔진 강화 Lv${M.engine} → ${M.engine + 1}  $${700 + M.engine * 500}`, fn: () => { const c = 700 + M.engine * 500; if (M.engine >= 3) return G.toast('최대'); if (G.cash < c) return G.toast('돈이 부족합니다'); G.cash -= c; M.engine++; v.spec.accel *= 1.12; v.spec.maxSpeed *= 1.06; G.audio.cash(); G.toast('엔진 강화'); } },
      { text: `타이어 강화 Lv${M.tires} → ${M.tires + 1}  $${450 + M.tires * 350}`, fn: () => { const c = 450 + M.tires * 350; if (M.tires >= 3) return G.toast('최대'); if (G.cash < c) return G.toast('돈이 부족합니다'); G.cash -= c; M.tires++; v.spec.grip *= 1.12; G.audio.cash(); G.toast('타이어 강화'); } },
      { text: `장갑 강화 Lv${M.armor} → ${M.armor + 1}  $${650 + M.armor * 400}`, fn: () => { const c = 650 + M.armor * 400; if (M.armor >= 3) return G.toast('최대'); if (G.cash < c) return G.toast('돈이 부족합니다'); G.cash -= c; M.armor++; v.maxHp = Math.round(v.maxHp * 1.25); v.hp = v.maxHp; G.audio.cash(); G.toast('장갑 강화'); } },
      { text: '도색 $150 (랜덤)', fn: () => { if (G.cash < 150) return G.toast('돈이 부족합니다'); G.cash -= 150; const c = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)]; { const pm = v.model.paint; const mt = pm && pm.isMesh ? pm.material : pm; mt?.color?.set(c); } G.audio.cash(); G.toast('도색 완료'); } },
    ];
    this.panels.show('talk', { name: '정비소 · ' + v.type.toUpperCase(), text: `HP ${Math.round(v.hp)}/${v.maxHp} · 연료 ${Math.round(v.fuel)}%`, options: opts });
  },
  openTrunk(v) {
    const st = this.state.containers, key = 'trunk:' + v.id;
    if (!st[key]) { const it = {}; if (Math.random() < 0.6) it[['water', 'bandage', 'crowbar', 'soda', 'flashlight', 'cashroll'][Math.floor(Math.random() * 6)]] = 1; st[key] = { name: '트렁크', items: it }; }
    this.openContainer({ key, ...st[key], ref: st[key] });
  },
  buildPier(w) {
    const G = this, B = new Builder(), x = (w.x0 + w.x1) / 2, z0 = w.z0 - 2.5, z1 = w.z0 + 20, hw = 1.6;
    B.ext('decor', x - hw, 0.12, z0, x + hw, 0.4, z1, 0x5a4330);
    for (let z = z0 + 1; z < z1; z += 2.5) for (const sx of [-hw, hw]) B.ext('decor', x + sx - 0.12, -1.8, z - 0.12, x + sx + 0.12, 0.9, z + 0.12, 0x2a2018);
    for (let z = z0 + 1; z < z1; z += 5) B.ext('emit', x - hw, 0.9, z, x - hw + 0.1, 1.0, z + 0.1, new THREE.Color(1, 0.75, 0.3), 2.5);
    G.world.colliders.addBox(x - hw, z0, x + hw, z1, 0.4, 'pier', 0.0);
    B.finish(G.scene); G.world.fakeLights.push({ x, y: 0, z: z0 + 8, c: [1, 0.7, 0.3], rad: 14 });
  },
  spawnCrafts() {
    const G = this;
    for (const w of G.world.waters) if (w.harbor) G.buildPier(w);
    // boats on the lake
    for (const w of G.world.waters) for (const [fx, fz, h] of [[0.25, 0.3, 0.6], [0.7, 0.65, 2.4]]) {
      const v = new Vehicle(G, 'boat', 0xdde4ee, 'parked'); v.x = w.x0 + (w.x1 - w.x0) * fx; v.z = w.z0 + (w.z1 - w.z0) * fz; v.h = h; v.startY = w.y + 0.12; v.awake = false; G.addVehicle(v);
      v.pv.body.wakeUp();
    }
    // helicopters on rooftops
    const tall = G.world.lots.filter((l) => l.name && !l.ring && !l.tiers.crown && l.tiers.tower.y1 > 60 && (l.tiers.tower.x1 - l.tiers.tower.x0) >= 17 && (l.tiers.tower.z1 - l.tiers.tower.z0) >= 17).slice(0, 40);
    const picks = [tall[0], tall[Math.floor(tall.length / 3)], tall[Math.floor(tall.length * 2 / 3)]].filter(Boolean);
    for (const l of picks) {
      const t = l.tiers.tower, v = new Vehicle(G, 'heli', 0x2a3550, 'parked', { glow: [1, 0.3, 0.8] });
      v.x = t.x1 - 5.5; v.z = t.z1 - 6.5; v.h = 0.8; v.startY = t.y1 + 1.0; v.awake = false; G.addVehicle(v);
      l.heli = v;
    }
    // a few motorbikes
    for (let k = 0; k < 6; k++) {
      const v = new Vehicle(G, 'moto', CAR_COLORS[k % CAR_COLORS.length], 'parked'); const pz = G.world.plaza;
      v.x = pz.cx + rand(-30, 30); v.z = pz.cz + 36 + rand(-2, 2); v.h = rand(0, 6.28); v.awake = false; G.addVehicle(v);
    }
  },
  // ---------- taxi ----------
  callTaxi() {
    if (this.taxi && !this.taxi.dead && this.taxi.driver === 'ai') { this.toast('택시가 오는 중입니다'); return; }
    const lane = (() => { for (let t = 0; t < 12; t++) { const l = this.randomLane(50, 110); if (l) return l; } return null; })();
    if (!lane) { this.toast('호출 실패', '근처에 택시가 없습니다'); return; }
    const v = new Vehicle(this, 'sedan', 0xe8b820, 'traffic', { taxi: true });
    v.kind = 'traffic'; v.driver = 'ai'; v.setRoute(lane.i, lane.j, lane.di, lane.dj, lane.frac); v.ai.speed = 20;
    v.dest = { x: this.player.x, z: this.player.z }; v.callTaxi = true; v.arrived = false; v.directDest = false;
    this.addVehicle(v); this.taxi = v; this.toast('택시 호출', '잠시 기다리세요');
  },
  boardTaxi(v, bus) {
    const pl = this.player; v.doorFx?.();
    this.cam.mode = 2; this.passenger = v; this.vehicle = v; this.playerOnFoot = false; pl.group.visible = false; v.callTaxi = false; v.arrived = false; v.directDest = false;
    document.body.classList.remove('onfoot'); document.body.classList.add('incar');
    if (bus) { v.fareStart = { x: pl.x, z: pl.z }; this.toast('버스 탑승', 'F로 정차 시 하차'); return; }
    const m = this.markerPos; v.dest = m ? { x: m.x, z: m.z } : { x: pl.x + rand(-250, 250), z: pl.z + rand(-250, 250) };
    v.fareStart = { x: pl.x, z: pl.z };
    this.toast('택시 출발', m ? '목적지: 표시된 장소' : '목적지: 임의 장소');
  },
  taxiTick() {
    const v = this.passenger; if (!v) return;
    if (v.dead) { this.endPassenger(true); return; }
    if (v.arrived && v.speed < 2.5) {
      const d = Math.hypot(v.x - v.fareStart.x, v.z - v.fareStart.z), fare = Math.min(Math.floor(5 + d * 0.06), this.cash + 5);
      this.cash -= fare; this.toast('도착', `요금 $${fare}`); this.audio.cash(); this.endPassenger(false);
    }
  },
  endPassenger(crashed) {
    const v = this.passenger, pl = this.player; if (!v) return;
    this.passenger = null; this.vehicle = null; this.playerOnFoot = true; pl.group.visible = true;
    const s = Math.sin(v.h), c = Math.cos(v.h);
    pl.body3.teleport(v.x + c * 3, v.y || 0, v.z - s * 3); pl.x = v.x + c * 3; pl.z = v.z - s * 3; pl.y = 0.06;
    document.body.classList.add('onfoot'); document.body.classList.remove('incar'); this.ui.speedo.classList.remove('on');
    v.dest = null; v.arrived = false; v.callTaxi = false; this.taxi = null;
  },
};
