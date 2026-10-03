import { clamp } from './util.js';

// Game clock: 1 real second = 1 game minute (a day lasts 24 real minutes).
export class Clock {
  constructor(G, startMin = 22 * 60 + 10) { this.G = G; this.t = G.state.clock ?? startMin; this.scale = 1; }
  get hour() { return (this.t / 60) % 24; }
  get day() { return Math.floor(this.t / 1440); }
  update(dt) { this.t += dt * this.scale; this.G.state.clock = this.t; }
  fmt() { const h = Math.floor(this.hour), m = Math.floor(this.t % 60); const ap = h >= 12 ? 'PM' : 'AM'; return `${String(((h + 11) % 12) + 1).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ap}`; }
  skipTo(hour) { let d = hour * 60 - (this.t % 1440); if (d <= 0) d += 1440; this.t += d; }
  get isNight() { const h = this.hour; return h >= 19.5 || h < 5.5; }
}

// Survival needs (optional "realism" mode)
export class Needs {
  constructor(G) {
    this.G = G;
    const s = G.state.needs || (G.state.needs = { food: 80, water: 80, energy: 90, on: true });
    this.s = s;
  }
  get on() { return this.s.on; }
  apply(e) {
    const s = this.s;
    if (e.food) s.food = clamp(s.food + e.food, 0, 100);
    if (e.water) s.water = clamp(s.water + e.water, 0, 100);
    if (e.energy) s.energy = clamp(s.energy + e.energy, 0, 100);
  }
  update(dt) {
    const s = this.s, G = this.G, pl = G.player;
    if (!s.on || pl.dead) return;
    const sc = G.clock.scale * dt / 60; // game minutes -> hours? we decay per game hour below
    const act = G.vehicle ? 0.6 : (pl.speed > 6 ? 2.2 : pl.speed > 0.5 ? 1.2 : 0.7);
    s.food = clamp(s.food - sc * 1.3 * act, 0, 100);
    s.water = clamp(s.water - sc * 2.0 * act, 0, 100);
    s.energy = clamp(s.energy - sc * 1.1 * (G.sleeping ? -8 : act), 0, 100);
    this.warnT = (this.warnT || 0) - dt;
    if (this.warnT <= 0) {
      this.warnT = 25;
      if (s.food < 15) G.toast('배가 고픕니다'); else if (s.water < 15) G.toast('목이 마릅니다'); else if (s.energy < 15) G.toast('너무 졸립니다');
    }
    if (s.food <= 0 || s.water <= 0) { this.starveT = (this.starveT || 0) + dt; if (this.starveT > 4) { this.starveT = 0; G.hurtPlayer(2, null, 'starve'); } }
    if (s.energy <= 0 && !G.sleeping) { this.collapseT = (this.collapseT || 0) + dt; if (this.collapseT > 6) { this.collapseT = 0; G.forcedSleep?.(); } }
    // exhaustion: sprinting drains faster and eventually blocked
    this.canSprint = s.energy > 8 && s.water > 4;
  }
  speedMul() { return this.s.on ? (this.s.energy < 12 ? 0.75 : 1) : 1; }
}
