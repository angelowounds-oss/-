import { blackU } from './shaders.js';
import { ZONES } from './society.js';

// City power grid: each zone is fed by one substation. Hack it (quiet, 4 game hours) or wreck it with gunfire / explosives
// (8 game hours) and the zone goes dark: building windows, street lamps, traffic signals, interior lights and elevators stop,
// witnesses see less in the dark. A repair crew restores power when the time is up. State is saved with the game.
const HACK_MIN = 240, WRECK_MIN = 480, SUB_HP = 40;

export class Power {
  constructor(G) {
    this.G = G; this.w = G.world;
    this.st = G.state.power || (G.state.power = { off: {}, hp: {} });
    this.subs = this.w.substations || [];
    for (const s of this.subs) {
      s.hp = this.st.hp[s.zone] ?? SUB_HP;
      s.col.onShot = () => this.damage(s, 1);       // bullets hitting the yard
    }
    this.level = [0, 0, 0, 0, 0]; this.flick = 0;
    G.interact.providers.push((pl, out) => this.provide(pl, out));
    for (const z of Object.keys(this.st.off)) this.w.setZonePower(+z, false);
  }
  isOff(zone) { return !!this.st.off[zone]; }
  offAt(x, z) { return this.isOff(this.w.zoneOf(x, z)); }
  provide(pl, out) {
    for (const s of this.subs) {
      if (Math.hypot(s.x - pl.x, s.z - pl.z) > 5.5 || Math.abs(pl.y || 0) > 2) continue;
      const off = this.isOff(s.zone);
      out.push({ x: s.x, z: s.z, r: 5.5, cy: 1.0, name: `${ZONES[s.zone].name} 변전소${off ? ' (정전 중)' : ''}`, verbs: [
        { key: 'F', label: () => (off ? '정전 상태' : '제어반 해킹'), enabled: () => !this.isOff(s.zone), run: () => this.G.beginTimed('변전소 제어반 해킹 중…', 6, () => this.cut(s, 'hack')) },
      ] });
    }
  }
  damage(s, d) {
    if (this.isOff(s.zone) && this.st.off[s.zone].cause === 'wreck') return;
    s.hp -= d; this.st.hp[s.zone] = s.hp;
    this.G.fx.sparks(s.x, 1.4, s.z, 4, [1, 0.8, 0.3], 6);
    if (s.hp <= 0) { this.G.explosion(s.x, 1.2, s.z, 6, 30, this.G.player); this.cut(s, 'wreck'); }
  }
  blast(x, z, r) { for (const s of this.subs) if (Math.hypot(s.x - x, s.z - z) < r + 3) this.damage(s, SUB_HP); }
  cut(s, cause) {
    const G = this.G, now = G.clock.t;
    this.st.off[s.zone] = { until: now + (cause === 'hack' ? HACK_MIN : WRECK_MIN), cause, t: now };
    this.w.setZonePower(s.zone, false); this.flick = 1.2;
    G.audio.tone?.(70, 0.6, 'sawtooth', 0.12, 40);
    G.toast(`⚡ ${ZONES[s.zone].name} 정전`, cause === 'hack' ? '제어반을 내렸다 · 4시간 뒤 복구' : '변전소가 파괴됐다 · 복구반 도착까지 8시간');
    G.memory?.log('blackout', s.x, s.z, { cause });
    if (cause === 'wreck' || G.society.witnessesOf(s.x, s.z).length) G.addHeat(cause === 'wreck' ? 20 : 6);
  }
  restore(zone) {
    const G = this.G; delete this.st.off[zone]; this.st.hp[zone] = SUB_HP; for (const s of this.subs) if (s.zone === zone) s.hp = SUB_HP;
    this.w.setZonePower(zone, true);
    const s = this.subs.find((q) => q.zone === zone); if (s) G.memory?.log('restored', s.x, s.z);
    if (Math.hypot(G.player.x, G.player.z) < 2000) G.toast(`💡 ${ZONES[zone].name} 전력 복구`, '복구반이 작업을 마쳤다');
  }
  update(dt) {
    const G = this.G, now = G.clock.t;
    for (const z of Object.keys(this.st.off)) {
      const o = this.st.off[z];
      if (now >= o.until) this.restore(+z);
      else if (!o.crew && now > o.until - 60) { o.crew = true; if (Math.hypot(G.player.x, G.player.z) < 2000) G.toast('🔧 한전 복구반 출동', `${ZONES[+z].name} 변전소로 이동 중`); }
    }
    // fade the windows in/out, with a short flicker when the power drops
    if (this.flick > 0) this.flick -= dt;
    for (let z = 0; z < 5; z++) {
      const target = this.isOff(z) ? 1 : 0;
      this.level[z] += (target - this.level[z]) * Math.min(1, dt * (target ? 3 : 0.8));
      blackU.value[z] = this.flick > 0 && target ? (Math.random() < 0.5 ? 1 : 0.2) : this.level[z];
    }
  }
}
