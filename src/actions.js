import * as THREE from 'three';
import { clamp, rand } from './util.js';
import { ITEMS } from './items.js';

// Game-level actions (mixed into Game.prototype)
export const actions = {
  openContainer(c) { this.panels.show('container', c); },
  openInventory() { if (!this.uiModal && this.playerOnFoot && !this.player.dead) this.panels.show('inv', {}); },
  hasItem(id) { return this.items.count(id) > 0; },

  async sleep(x, y, z, forced = false) {
    if (this.sleeping || this.player.dead) return;
    this.sleeping = true; this.uiModal = true;
    await this.fadeTo(1);
    const clk = this.clock, h = clk.hour;
    const hours = forced ? 6 : (h >= 19 || h < 6 ? ((7 - h + 24) % 24) : 4);
    const steps = 24, dt = hours * 60 / steps;
    for (let i = 0; i < steps; i++) { clk.t += dt; this.needs.update(dt * 60 / 60 * 0.0); await new Promise((r) => setTimeout(r, 20)); }
    const s = this.needs.s; s.energy = forced ? 55 : 100; s.food = Math.max(0, s.food - hours * 2); s.water = Math.max(0, s.water - hours * 3);
    this.player.hpv = Math.min(100, this.player.hpv + (forced ? 25 : 60));
    if (forced) { const loss = Math.floor(this.cash * 0.1); this.cash -= loss; this.toast('길에서 쓰러져 잠들었다', `지갑에서 $${loss}를 도둑맞았다`); }
    else this.toast('푹 잤다', `${clk.fmt()}`);
    this.sleeping = false; this.uiModal = false;
    this.save();
    await this.fadeTo(0);
  },
  hospitalVisit() { const cost = 120; if (this.cash < cost) return this.toast('돈이 부족합니다', `$${cost} 필요`); this.cash -= cost; this.player.hpv = 100; this.player.bleed = 0; this.needs.apply({ food: 15, water: 25, energy: 20 }); this.audio.cash(); this.toast('응급 치료', '모든 상처가 치료되었다'); },
  surrender() {
    const pl = this.player; if (this.wanted <= 0 || pl.dead) return;
    pl.surrenderT = 4; pl.weaponDrawn = false; pl.aimT = 0; this.lastShotT = -99; this.toast('항복!', '경찰이 다가와 체포합니다');
  },
  forcedSleep() { const p = this.player; this.sleep(p.x, p.y, p.z, true); },

  sitOn(pos, prop, lie) {
    const pl = this.player; if (pl.sitting || this.frozen()) return;
    const seatY = prop ? pos.y + (prop.def.h || 0.45) : pos.y;
    pl.sitting = { x: pos.x, y: seatY, z: pos.z, ry: pl.ry };
    pl.body3.teleport(pos.x, seatY, pos.z); pl.x = pos.x; pl.y = seatY; pl.z = pos.z; pl.vx = pl.vz = 0;
    pl.lying = !!lie; if (lie) pl.sitting.ry = pl.ry; pl.m.applySit?.(lie ? 0 : 1);
    this.toast(lie ? '누웠다' : '앉았다', 'Space/F로 일어서기');
  },
  standUp() {
    const pl = this.player; if (!pl.sitting) return;
    const s = pl.sitting; pl.sitting = null; pl.lying = false; pl.m.applySit?.(0);
    const fx = Math.sin(this.cam.yaw) * 0.7, fz = Math.cos(this.cam.yaw) * 0.7;
    pl.body3.teleport(s.x + fx, s.y + 0.15, s.z + fz); pl.x = s.x + fx; pl.y = s.y + 0.15; pl.z = s.z + fz;
  },

  talk(h, b) {
    const lines = ['어서 오세요. 무슨 일로 오셨나요?', `${b.name}은 24시간 운영합니다.`, '엘리베이터는 안쪽 코어에 있어요.', '옥상 헬리패드는 일반 출입 금지예요… 아마도.', '요즘 이 근방이 시끄럽더군요.'];
    this.toast(h.role === 'reception' ? '접수원' : '시민', lines[Math.floor(Math.random() * lines.length)]);
  },

  alarmBuilding(b, fl) {
    this.alarm = true; this.alarmB = b; this.alarmT = 90;
    for (const [, f] of b.floors) for (const h of f.npcs || []) if (h.guard && !h.dead) { h.state = 'attack'; h.alert = 1; }
    this.addHeat(32); this.audio.star?.(); this.toast('경보 작동!', '경비원이 출동한다');
  },

  equipMelee(id) {
    const d = ITEMS[id]; if (!d?.melee) return;
    this.items.inv.equipped = this.items.inv.equipped === id ? null : id;
    this.player.melee = this.items.inv.equipped ? d.melee : null; this.switchWeapon(9);
    this.toast(this.items.inv.equipped ? `${d.name} 장비` : '맨손', this.items.inv.equipped ? '근접: 좌클릭' : '');
  },
  toggleFlashlight() {
    if (!this.hasItem('flashlight')) { this.toast('손전등이 없습니다'); return; }
    this.flashlightOn = !this.flashlightOn;
    if (!this.flash) { this.flash = new THREE.SpotLight(0xdff4ff, 0, 38, 0.38, 0.5, 1.3); this.scene.add(this.flash, this.flash.target); }
  },
  updateFlashlight() {
    const f = this.flash; if (!f) return;
    f.intensity = this.flashlightOn ? 220 : 0;
    if (!this.flashlightOn) return;
    const c = this.camera, d = this.tmpV.set(0, 0, -1).applyQuaternion(c.quaternion);
    f.position.copy(c.position).addScaledVector(d, 0.6); f.position.y -= 0.15;
    f.target.position.copy(c.position).addScaledVector(d, 10);
  },
  updateNeedsHUD() {
    const n = this.needs.s;
    this.ui.nFood.style.width = n.food + '%'; this.ui.nWater.style.width = n.water + '%'; this.ui.nEnergy.style.width = n.energy + '%';
  },
};
