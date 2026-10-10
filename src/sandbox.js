import * as THREE from 'three';
import { WEAPONS } from './human.js';
import { Vehicle, CAR_COLORS } from './vehicle.js';
import { ATT } from './attachments.js';
import { el } from './util.js';

// Sandbox / test mode (pause menu or F9): unlimited health, ammo, gear, no police, no hunger, indestructible cars,
// plus quick tools to give everything, spawn people and cars, set the time and weather, blow things up and knock people down.
const DEF = { on: false, god: true, ammo: true, gear: true, cops: true, needs: true, car: true, speed: 1, jump: 1 };
const KEY = 'neon_sandbox';

export class Sandbox {
  constructor(G) {
    this.G = G;
    let cfg = {}; try { cfg = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* ignore */ }
    Object.assign(this, DEF, cfg);
    this.badge = document.createElement('div');
    this.badge.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:12;padding:3px 12px;border-radius:99px;background:rgba(255,196,60,.16);border:1px solid rgba(255,196,60,.6);color:#ffd36a;font:700 11px/1.4 system-ui;letter-spacing:.2em;pointer-events:none;display:none';
    this.badge.textContent = 'SANDBOX'; document.body.appendChild(this.badge);
    this.buildUI();
    addEventListener('keydown', (e) => { if (e.code === 'F9' && G.running) { e.preventDefault(); this.setOn(!this.on); G.toast(this.on ? '샌드박스 모드 켬' : '샌드박스 모드 끔', 'F9'); } });
    this.show();
  }
  save() { try { const { on, god, ammo, gear, cops, needs, car, speed, jump } = this; localStorage.setItem(KEY, JSON.stringify({ on, god, ammo, gear, cops, needs, car, speed, jump })); } catch { /* ignore */ } }
  setOn(v) { this.on = !!v; this.save(); this.show(); const m = el('sbxOn'); if (m) m.checked = this.on; }
  show() { this.badge.style.display = this.on ? 'block' : 'none'; const b = el('sbxBody'); if (b) b.style.opacity = this.on ? 1 : 0.45; }
  // ---------------------------------------------------------------- pause-menu section
  buildUI() {
    const pc = document.getElementById('pc'), anchor = document.getElementById('resume'); if (!pc || !anchor) return;
    const box = document.createElement('div');
    box.innerHTML = `
      <div class="set" style="margin-top:14px;border-top:1px solid var(--line);padding-top:12px"><span style="color:#ffd36a;font-weight:700;letter-spacing:.12em">샌드박스 모드 <small style="color:var(--muted);font-weight:400">(F9)</small></span><input id="sbxOn" type="checkbox"></div>
      <div id="sbxBody">
        <div id="sbxTog" style="display:grid;grid-template-columns:1fr 1fr;gap:2px 10px;font-size:12px"></div>
        <div class="set"><span>이동 속도</span><select id="sbxSpeed"><option value="1">×1</option><option value="2">×2</option><option value="3">×3</option></select></div>
        <div class="set"><span>점프 높이</span><select id="sbxJump"><option value="1">×1</option><option value="1.6">×1.6</option><option value="2.4">×2.4</option></select></div>
        <div id="sbxBtn" style="display:grid;grid-template-columns:1fr 1fr;gap:6px"></div>
      </div>`;
    pc.insertBefore(box, anchor);
    const tog = el('sbxTog');
    for (const [k, label] of [['god', '체력 무제한'], ['ammo', '탄약 무제한'], ['gear', '장비 무제한'], ['cops', '수배 무시'], ['needs', '허기·피로 없음'], ['car', '차량 무적·연료']]) {
      const l = document.createElement('label'); l.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 0;cursor:pointer';
      const c = document.createElement('input'); c.type = 'checkbox'; c.checked = this[k]; c.onchange = () => { this[k] = c.checked; this.save(); };
      l.append(c, label); tog.appendChild(l);
    }
    el('sbxOn').checked = this.on; el('sbxOn').onchange = (e) => this.setOn(e.target.checked);
    el('sbxSpeed').value = String(this.speed); el('sbxSpeed').onchange = (e) => { this.speed = +e.target.value; this.save(); };
    el('sbxJump').value = String(this.jump); el('sbxJump').onchange = (e) => { this.jump = +e.target.value; this.save(); };
    const btn = el('sbxBtn'), G = this.G;
    const add = (label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'pbtn'; b.style.cssText = 'margin:0;padding:8px 6px;font-size:12px'; b.textContent = label; b.onclick = () => { if (!this.on) this.setOn(true); fn(); }; btn.appendChild(b); };
    add('모든 무기·부품 지급', () => this.giveAll());
    add('돈 +$100,000', () => { G.cash += 100000; G.toast('+$100,000'); });
    add('낮 12시', () => this.setHour(12)); add('밤 0시', () => this.setHour(0));
    add('맑음', () => this.setWeather('clear')); add('비', () => this.setWeather('rain'));
    add('전방 폭발', () => this.blast()); add('1000 m 타워 앞으로', () => this.toSkyTower()); add('가까운 건물에 불', () => this.burnNearest(false)); add('가까운 건물 붕괴', () => this.burnNearest(true)); add('무너진 건물 복구', () => { this.G.blaze.rebuildAll(); this.G.toast('건물 복구'); });
    add('전방 화재', () => { const a = this.ahead(10); this.G.fire.ignite(a.x, a.z, { fuel: 25, r: 2, src: this.G.player }); }); add('NPC 6명 소환', () => this.spawnPeople(6));
    add('주변 NPC 사살(랙돌)', () => this.dropPeople(true)); add('주변 NPC 넘어뜨리기', () => this.dropPeople(false));
    add('차량 소환', () => this.spawnCar()); add('체력·상태 회복', () => this.heal());
  }
  // ---------------------------------------------------------------- per frame
  update(dt) {
    if (!this.on) return;
    const G = this.G, pl = G.player;
    if (this.god && !pl.dead) { pl.hpv = 100; pl.bleed = 0; if (pl.armor < 50) pl.armor = 50; }
    if (this.ammo) for (let i = 0; i < pl.ammo.length; i++) { const w = G.pw(i); pl.ammo[i].clip = w.clip; pl.ammo[i].reserve = 999; }
    if (this.gear) { const inv = G.items.inv.items; for (const id of ['grapple', 'parachute', 'breach']) if ((inv[id] || 0) < 9) inv[id] = 99; }
    if (this.cops && (G.heat > 0 || G.wanted > 0)) G.clearWanted();
    if (this.needs && G.needs?.s) { const n = G.needs.s; n.food = n.water = n.energy = 100; }
    if (this.car) for (const v of G.vehicles) if (v === G.vehicle || v === G.lastVehicle) { if (!v.dead) { v.hp = v.maxHp; v.burn = 0; } v.fuel = 100; }
  }
  // ---------------------------------------------------------------- tools
  ahead(d) {
    const G = this.G, cam = G.camera, dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const h = G.phys.ray(cam.position.x, cam.position.y, cam.position.z, dir.x, dir.y, dir.z, d, 1 | 16 | 8);
    const t = h ? Math.max(1, h.t - 0.5) : d, pl = G.player, yaw = Math.atan2(dir.x, dir.z);
    return { x: cam.position.x + dir.x * t, y: cam.position.y + dir.y * t, z: cam.position.z + dir.z * t, yaw, dx: Math.sin(yaw), dz: Math.cos(yaw), pl };
  }
  giveAll() {
    const G = this.G, pl = G.player;
    pl.owned = pl.owned.map(() => true); pl.ammo.forEach((a) => { a.reserve = 999; });
    for (const id of Object.keys(ATT)) if (!G.items.count(id)) G.items.add(id);
    for (const id of ['grapple', 'parachute', 'breach', 'medkit', 'grenade', 'crowbar', 'lockpick']) if (G.items.count(id) < 9) G.items.add(id, 9 - G.items.count(id));
    pl.armor = 100; G.onItemChange?.(); G.toast('전부 지급', `무기 ${WEAPONS.length}종 · 부착물 · 장비`);
  }
  heal() { const G = this.G, pl = G.player; pl.hpv = 100; pl.armor = 100; pl.bleed = 0; if (G.needs?.s) { const n = G.needs.s; n.food = n.water = n.energy = 100; } G.toast('회복'); }
  setHour(h) { this.G.clock.t = h * 60; this.G.toast(h === 12 ? '낮 12시' : '밤 0시'); }
  setWeather(type) { const G = this.G; G.state.weather = { type, until: G.clock.t + 6000 }; G.toast(type === 'clear' ? '맑음' : '비'); }
  toSkyTower() {
    const G = this.G, l = G.world.skyTower, pl = G.player; if (!l) return G.toast('초고층 타워가 없다');
    const d = l.door, x = d.px + d.nx * 6, z = d.pz + d.nz * 6;
    pl.body3.teleport(x, 0.1, z); pl.x = x; pl.y = 0.1; pl.z = z; pl.vx = pl.vz = 0; G.toast(l.name, '입구 앞');
  }
  // nearest standing building to the player (the one in front preferred): set it alight at street level, or bring it down now
  burnNearest(now) {
    const G = this.G, pl = G.player, B = G.blaze; let best = null, bd = 1e9;
    for (const l of B.lots) { if (B.ruins.has(l)) continue; const d = Math.max(l.x0 - pl.x, pl.x - l.x1, 0) + Math.max(l.z0 - pl.z, pl.z - l.z1, 0); if (d < bd) { bd = d; best = l; } }
    if (!best || bd > 60) return G.toast('근처에 건물이 없다');
    if (now) B.collapseNow(best, pl); else B.igniteLot(best, pl);
  }
  blast() { const a = this.ahead(14); this.G.explosion(a.x, Math.max(0.5, a.y - 0.6), a.z, 9, 60, this.G.player); }
  spawnPeople(n) {
    const G = this.G, a = this.ahead(10);
    for (let i = 0; i < n; i++) {
      const h = G.spawnCivilian(true); if (!h) continue;
      const ox = (i % 3 - 1) * 1.6, oz = Math.floor(i / 3) * 1.8 - 0.9;
      h.x = a.x + a.dz * ox + a.dx * oz; h.z = a.z - a.dx * ox + a.dz * oz; h.y = G.player.y; h.floorY = G.player.y; h.state = 'stand'; h.static = true; h.lookAtPlayer = false;
      h.group.position.set(h.x, h.y, h.z);
    }
    G.toast(`NPC ${n}명 소환`);
  }
  dropPeople(kill) {
    const G = this.G, pl = G.player; let n = 0;
    for (const h of G.humans) {
      if (h.dead || h.team === 'cop' && false) continue;
      const dx = h.x - pl.x, dz = h.z - pl.z, d = Math.hypot(dx, dz); if (d > 25 || d < 0.5) continue;
      if (kill) { h.lastHit = { t: G.time, seg: 'chest', dir: { x: dx / d, y: 0.1, z: dz / d }, point: { x: h.x, y: h.y + 1.3, z: h.z }, j: 45 }; h.hurt(999, pl, false, pl); }
      else h.ragdoll(dx / d * 5, dz / d * 5, 4);
      n++;
    }
    G.toast(kill ? `${n}명 사살` : `${n}명 넘어뜨림`);
  }
  spawnCar() {
    const G = this.G, a = this.ahead(10);
    const v = new Vehicle(G, ['sedan', 'sport', 'suv', 'truck'][Math.floor(Math.random() * 4)], CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)], 'parked');
    v.x = a.x; v.z = a.z; v.h = a.yaw + Math.PI / 2; v.awake = true; G.addVehicle(v); G.toast('차량 소환');
  }
}
