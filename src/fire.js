import { rand } from './util.js';

// Fire (GPL-08): ground fires, burning vehicles and props, fuel pools. Fire spreads to vehicles, flammable props and people near it,
// people on fire run and carry it on, witnesses of the player's arson are reported like any other crime. Everything draws with the
// existing fire / smoke particles (no new materials, no lights: ADR-0002), so a fire costs nothing in the renderer.
const MAX_NODES = 24, MAX_POOLS = 8, MERGE = 1.4, TICK = 0.6, ALERT_R = 24;
const FLAMMABLE = new Set(['chair', 'stool', 'crate', 'box', 'trash', 'newspaper', 'houseplant', 'cigarette']);

export class Fire {
  constructor(G) { this.G = G; this.nodes = []; this.pools = []; this.t = 0; this.started = 0; }

  // start or feed a fire at (x, z); src is the player when it was them (arson is a crime), kind: ground | vehicle | prop | human
  ignite(x, z, { y = 0.15, fuel = 10, r = 1.6, src = null, kind = 'ground', ref = null } = {}) {
    for (const n of this.nodes) if (Math.hypot(n.x - x, n.z - z) < MERGE) { n.life = Math.max(n.life, fuel); n.r = Math.max(n.r, r); if (ref && !n.ref) n.ref = ref; return n; }
    if (this.nodes.length >= MAX_NODES) { let k = 0; for (let i = 1; i < this.nodes.length; i++) if (this.nodes[i].life < this.nodes[k].life) k = i; this.nodes.splice(k, 1); }
    const n = { x, y, z, r, life: fuel, kind, ref, src, acc: 0, tick: this.t + Math.random() * TICK, alerted: false };
    this.nodes.push(n); this.started++;
    const G = this.G;
    if (src && src === G.player && kind !== 'human') { G.society.crime('arson', 18, x, z); G.memory?.log('arson', x, z); }
    return n;
  }
  // fuel poured on the ground: harmless until a flame reaches it, then it flares up over its whole area
  pour(x, z, src) {
    if (this.pools.length >= MAX_POOLS) this.pools.shift();
    const p = { x, z, r: 2.2, t: 120, src }; this.pools.push(p); return p;
  }
  // a bottle breaking: a splash of small fires around the impact
  splash(x, y, z, src) {
    const G = this.G;
    for (let i = 0; i < 5; i++) { const a = Math.random() * 6.28, d = i ? rand(0.6, 1.8) : 0; this.ignite(x + Math.cos(a) * d, z + Math.sin(a) * d, { y, fuel: rand(7, 12), r: 1.1, src }); }
    G.audio.glass?.(Math.hypot(x - G.camera.position.x, z - G.camera.position.z));
    G.noise?.(x, z, 22);
  }

  update(dt) {
    const G = this.G, nodes = this.nodes; this.t += dt;
    if (!nodes.length && !this.pools.length) return;
    const cam = G.camera.position, wet = G.weatherType === 'rain' || G.weatherType === 'storm';
    // burning vehicles are fires of their own (also vehicles that caught fire by damage): they set their neighbours alight
    if (nodes.length || this.pools.length) for (const v of G.vehicles) if (v.burn > 0.2 && !v.fireNode) v.fireNode = this.ignite(v.x, v.z, { y: 0.9, fuel: 20, r: 2, kind: 'vehicle', ref: v });
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (n.kind === 'vehicle') {
        const v = n.ref; if (!v || !G.vehicles.includes(v)) n.life = 0; else { n.x = v.x; n.z = v.z; if (v.burn > 0.2) n.life = Math.max(n.life, 6); }
      }
      n.life -= dt * (wet ? 2.5 : 1) * (G.waterAt(n.x, n.z) ? 20 : 1);
      if (n.life <= 0) { this.out(i); continue; }
      const dc = Math.hypot(n.x - cam.x, n.z - cam.z);
      if (dc < 90) {
        n.acc += dt * (5 + n.r * 6) * (dc > 45 ? 0.5 : 1);
        while (n.acc >= 1) { n.acc -= 1; G.fx.fire(n.x + rand(-n.r, n.r) * 0.5, n.y + rand(0, 0.4), n.z + rand(-n.r, n.r) * 0.5); }
      }
      if (!n.alerted) { n.alerted = true; this.alert(n); }
      if (this.t >= n.tick) { n.tick = this.t + TICK; this.spread(n); }
    }
    // fuel pools catch when a flame is close
    for (let i = this.pools.length - 1; i >= 0; i--) {
      const p = this.pools[i]; p.t -= dt;
      if (p.t <= 0) { this.pools.splice(i, 1); continue; }
      for (const n of nodes) if (Math.hypot(n.x - p.x, n.z - p.z) < p.r + n.r * 0.6) { this.ignite(p.x, p.z, { fuel: 16, r: p.r, src: p.src || n.src }); this.pools.splice(i, 1); break; }
    }
  }
  out(i) {
    const G = this.G, n = this.nodes[i]; this.nodes.splice(i, 1);
    if (n.kind === 'vehicle' && n.ref) n.ref.fireNode = null;
    if (n.kind === 'prop' && n.ref && !n.ref.gone) G.items.remove(n.ref, true);
    if (n.kind !== 'human' && n.r > 1) G.memory?.addScorch(n.x, n.z, Math.min(3, n.r * 0.8));
  }
  // people nearby run from a new fire
  alert(n) {
    const G = this.G;
    for (const h of G.humans) {
      if (h.dead || h.team !== 'civ' || h.hidden) continue;
      if (Math.hypot(h.x - n.x, h.z - n.z) < ALERT_R && h.state !== 'flee') { h.state = 'flee'; h.fleeT = rand(6, 10); h.threat = { x: n.x, z: n.z }; }
    }
  }
  // damage and spreading around one fire, every TICK seconds
  spread(n) {
    const G = this.G, reach = n.r + 0.8, pl = G.player;
    for (const v of G.vehicles) {
      if (v === n.ref) continue;
      const d = Math.hypot(v.x - n.x, v.z - n.z);
      if (d < n.r + 2.4 && !v.dead) v.damage(11 * TICK, n.src);
    }
    for (const h of G.humans) {
      if (h.dead) continue;
      const d = Math.hypot(h.x - n.x, h.z - n.z);
      if (d < reach) {
        h.burnT = 3.5; h.hurt(8 * TICK, null, false, n.src);
        if (!h.dead && h.team === 'civ') { h.state = 'flee'; h.fleeT = 6; h.threat = { x: n.x, z: n.z }; }
      } else if (h.burnT > 0 && d < 1.2) h.burnT = 3.5;
      if (h.burnT > 0) { h.burnT -= TICK; if (!h.dead) { h.hurt(5 * TICK, null, false, n.src); this.ignite(h.x, h.z, { y: 0.1, fuel: 2.5, r: 0.8, kind: 'human', src: n.src }); } }
    }
    if (!pl.dead && !G.vehicle && Math.hypot(pl.x - n.x, pl.z - n.z) < reach && Math.abs(pl.y - n.y) < 2.5) G.hurtPlayer(7 * TICK, null, 'fire');
    for (const p of G.items.props.values()) {
      if (!FLAMMABLE.has(p.id) || p.burning) continue;
      const t = p.body.translation();
      if (Math.hypot(t.x - n.x, t.z - n.z) < n.r + 1.2 && Math.abs(t.y - n.y) < 2) { p.burning = true; this.ignite(t.x, t.z, { y: t.y, fuel: 7, r: 1, kind: 'prop', ref: p, src: n.src }); }
    }
  }
}
