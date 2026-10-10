import * as THREE from 'three';
import { Particles } from './fx.js';
import { instCull } from './instcull.js';
import { clamp, rand } from './util.js';

// Building fires and collapse (GPL-08c). Any city building can burn: its height is split into 3.6 m bands with heat and fuel. Fire reaching
// a wall (a burning car, a molotov against the facade, an explosion, a fire lit inside) heats the band it touches; a band above IGNITE
// burns, passes the fire up quickly and down slowly, spends its fuel and chars. Burning eats the structure: when the integrity is gone
// the building comes down (facade instances sink into a dust cloud, people and cars under it are crushed) and a rubble pile with a low
// collider is left. Ruins are saved and rebuilt after REBUILD_MIN game minutes.
// Drawing: the facade shader reads a per-instance aBurn (fire band, heat, char height); flames, smoke and dust are three point-particle
// systems made at start-up with the same shader as the existing ones, and the rubble is one instanced mesh that is in the scene from the
// start - nothing new compiles during play (ADR-0002).
const BAND = 3.6, TICK = 0.5, IGNITE = 0.35;
const GROW = 0.09;           // heat gained per second by a burning band
const BURN_S = 70;           // seconds of fuel per band at full heat
const UP_S = 7, DOWN_S = 45; // seconds for a fully burning band to set the band above / below alight
const STRUCT = 0.5;          // the building fails after burning through this share of its total fuel
const COLLAPSE_T = 8;
const REBUILD_MIN = 2880;    // two game days
const RUBBLE_CAP = 480, RUBBLE_PER = 40;
const ZERO16 = new Float32Array(16);
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), P = new THREE.Vector3(), S = new THREE.Vector3();

export class Blaze {
  constructor(G) {
    this.G = G; const w = G.world; this.w = w;
    this.fac = w.facade; this.burn = this.fac.geometry.attributes.aBurn; this.door = this.fac.geometry.attributes.aDoor;
    this.mat0 = this.fac.instanceMatrix.array.slice();
    this.lots = w.lots.filter((l) => l.tierIdx != null && !l.far && !l.model);
    this.grid = new Map();
    for (const l of this.lots) for (let cx = Math.floor((l.x0 - 2) / 48); cx <= Math.floor((l.x1 + 2) / 48); cx++) for (let cz = Math.floor((l.z0 - 2) / 48); cz <= Math.floor((l.z1 + 2) / 48); cz++) {
      const k = cx * 7919 + cz; let a = this.grid.get(k); if (!a) this.grid.set(k, (a = [])); a.push(l);
    }
    this.fires = new Map(); this.ruins = new Map(); this.t = 0; this.rebuildT = 0;
    this.flameP = new Particles(G.scene, 1600, true);
    this.smokeP = new Particles(G.scene, 1400, false);
    const geo = new THREE.DodecahedronGeometry(1, 0);
    this.rubble = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0x7a746c, roughness: 0.95, flatShading: true }), RUBBLE_CAP);
    const C = new THREE.Color();
    for (let i = 0; i < RUBBLE_CAP; i++) { this.rubble.setMatrixAt(i, M.makeScale(0, 0, 0)); const k = Math.random(); this.rubble.setColorAt(i, k < 0.45 ? C.setRGB(0.18, 0.17, 0.16) : C.setRGB(0.55 + k * 0.3, 0.53 + k * 0.3, 0.5 + k * 0.3)); }   // charred and grey concrete (colour buffer exists from the start: no recompile later)
    this.rubble.castShadow = true; this.rubble.receiveShadow = true; this.rubble.frustumCulled = false; this.rubbleHead = 0;
    G.scene.add(this.rubble);
    this.smoke = 0;   // 0..1 smoke around the player inside a burning building (thickens the fog)
    const st = G.state.ruins || (G.state.ruins = {});
    for (const k of Object.keys(st)) { const lot = w.lots[+k]; if (lot && this.lots.includes(lot)) this.ruin(lot, true); else delete st[k]; }
  }

  lotAt(x, z, m = 0) {
    const a = this.grid.get(Math.floor(x / 48) * 7919 + Math.floor(z / 48)); if (!a) return null;
    for (const l of a) if (x > l.x0 - m && x < l.x1 + m && z > l.z0 - m && z < l.z1 + m) return l;
    return null;
  }
  // the tiers of a lot in the facade mesh: podium, tower, crown
  tiers(lot) { return lot.tiers.crown ? [lot.tierIdx, lot.tierIdx + 1, lot.tierIdx + 2] : [lot.tierIdx, lot.tierIdx + 1]; }
  state(lot) {
    let s = this.fires.get(lot);
    if (!s) {
      if (this.ruins.has(lot)) return null;
      const nb = Math.max(2, Math.ceil(lot.topY / BAND));
      s = { lot, nb, heat: new Float32Array(nb), fuel: new Float32Array(nb).fill(1), integ: 1, src: null, tick: 0, phase: 'burn', ct: 0, lo: 0, hi: 0, peak: 0, char: 0, nbrs: null, inFires: 0, creak: 0, b: this.G.buildings.byLot.get(lot) || null, announced: false };
      s.nbrs = this.lots.filter((o) => o !== lot && Math.max(o.x0 - lot.x1, lot.x0 - o.x1, o.z0 - lot.z1, lot.z0 - o.z1) < 6);
      this.fires.set(lot, s);
    }
    return s;
  }
  // heat a building at height y (a flame against or inside it)
  heat(lot, y, amount, src) {
    const s = this.state(lot); if (!s || s.phase !== 'burn') return;
    const i = clamp(Math.floor(Math.max(0, y) / BAND), 0, s.nb - 1);
    if (s.fuel[i] <= 0) return;
    const was = s.heat[i] >= IGNITE;
    s.heat[i] = Math.min(1, s.heat[i] + amount);
    if (src && !s.src) s.src = src;
    if (!was && s.heat[i] >= IGNITE && !s.announced) this.announce(s);
  }
  announce(s) {
    const G = this.G, l = s.lot, cx = (l.x0 + l.x1) / 2, cz = (l.z0 + l.z1) / 2; s.announced = true;
    if (s.src === G.player) { G.society.crime('arson', 30, cx, cz); G.addHeat(20); }
    G.memory?.log('blaze', cx, cz);
    if (Math.hypot(cx - G.player.x, cz - G.player.z) < 160) G.toast('건물 화재!', s.b ? s.b.name : '불길이 번지고 있다');
    for (const h of G.humans) if (!h.dead && h.team === 'civ' && !h.hidden && Math.hypot(h.x - cx, h.z - cz) < 40) { h.state = 'flee'; h.fleeT = rand(8, 14); h.threat = { x: cx, z: cz }; }
  }
  // a fire node (fire.js) touching a wall or burning inside
  exposure(n) {
    const lot = this.lotAt(n.x, n.z, 1.2); if (!lot || n.y > lot.topY) return;
    this.heat(lot, n.y + 0.5, 0.045 * n.r, n.src);
  }
  blast(x, y, z, r, src) {
    const lot = this.lotAt(x, z, r * 0.35); if (!lot || y > lot.topY + 2) return;
    this.heat(lot, y, 0.25, src);   // one blast alone scorches; a fire left burning against the wall is what sets it alight
  }
  // sandbox / tests: set a building alight at street level, or bring it down now
  igniteLot(lot, src) { const s = this.state(lot); if (!s) return null; s.heat[0] = s.heat[1] = 1; if (src) s.src = src; this.announce(s); return s; }
  collapseNow(lot, src) { const s = this.state(lot); if (!s || s.phase !== 'burn') return null; if (src) s.src = src; this.startCollapse(s); return s; }

  update(dt) {
    this.t += dt;
    const G = this.G;
    let smoke = 0;
    for (const s of this.fires.values()) {
      if (s.phase === 'collapse') { this.animate(s, dt); continue; }
      s.tick -= dt; if (s.tick <= 0) { s.tick = TICK; this.sim(s, TICK); }
      if (s.phase === 'burn' && s.peak > 0) { this.emit(s, dt); smoke = Math.max(smoke, this.smokeAt(s)); }
    }
    for (const [lot, s] of this.fires) if (s.done) this.fires.delete(lot);
    this.smoke += (smoke - this.smoke) * Math.min(1, dt * 1.5);
    if (this.ruins.size) { this.rebuildT -= dt; if (this.rebuildT <= 0) { this.rebuildT = 5; for (const lot of [...this.ruins.keys()]) { const t0 = G.state.ruins[this.w.lots.indexOf(lot)]; if (t0 != null && G.clock.t - t0 > REBUILD_MIN) this.rebuild(lot); } } }
    if (this.flameP.n || this.fires.size) this.flameP.update(dt);
    if (this.smokeP.n || this.fires.size) this.smokeP.update(dt);
  }
  // after the day/night pass set the fog: smoke inside a burning building closes in
  lateUpdate() {
    const fog = this.G.scene.fog; if (!fog) return;
    if (this.smoke > 0.01) fog.density *= 1 + this.smoke * 7;
    // high above the city (tall roofs, a helicopter, the sky tower) the haze is thin: the fog hugs the streets
    const cy = this.G.camera.position.y; if (cy > 80) { const k = Math.min(1, (cy - 80) / 370); fog.density *= 1 - 0.85 * k * k * (3 - 2 * k); }
  }

  smokeAt(s) {
    const pl = this.G.player, l = s.lot;
    if (pl.x < l.x0 || pl.x > l.x1 || pl.z < l.z0 || pl.z > l.z1) return 0;
    const i = clamp(Math.floor((pl.y + 1) / BAND), 0, s.nb - 1);
    return Math.min(1, s.heat[i] + 0.5 * (s.heat[i + 1] || 0));
  }

  sim(s, d) {
    const G = this.G, H = s.heat, F = s.fuel, wet = G.weatherType === 'rain' || G.weatherType === 'storm' ? 0.6 : 1;
    let burning = 0, lo = 1e9, hi = -1, peak = 0, spent = 0, charTop = 0;
    for (let i = 0; i < s.nb; i++) {
      const h = H[i];
      if (F[i] <= 0) { H[i] = Math.max(0, h - d / 8); spent++; charTop = (i + 1) * BAND; continue; }
      if (h >= IGNITE) {
        burning++; lo = Math.min(lo, i); hi = Math.max(hi, i); peak = Math.max(peak, h);
        H[i] = Math.min(1, h + d * GROW * wet);
        const used = d / BURN_S * h; F[i] = Math.max(0, F[i] - used); s.integ -= used / (s.nb * STRUCT);
        if (i + 1 < s.nb && F[i + 1] > 0) H[i + 1] = Math.min(1, H[i + 1] + d / UP_S * h * wet);
        if (i > 0 && F[i - 1] > 0) H[i - 1] = Math.min(1, H[i - 1] + d / DOWN_S * h * wet);
        if (h > 0.8) for (const o of s.nbrs) if (!this.ruins.has(o) && i * BAND < o.topY) this.heat(o, i * BAND + 1, d * 0.006, s.src);
        if (F[i] < 0.5) charTop = Math.max(charTop, i * BAND);
      } else if (h > 0) H[i] = Math.max(0, h - d * 0.03);
    }
    s.lo = burning ? lo * BAND : 0; s.hi = burning ? (hi + 1) * BAND : 0; s.peak = peak; s.char = charTop;
    this.writeBurn(s.lot, s.lo, s.hi, peak, charTop);
    if (s.integ <= 0) { this.startCollapse(s); return; }
    if (burning) this.interior(s, d);
    // the last stage: groans, falling pieces
    if (s.integ < 0.3 && burning && Math.random() < d * 0.5) { const l = s.lot, cx = (l.x0 + l.x1) / 2, cz = (l.z0 + l.z1) / 2, dc = Math.hypot(cx - G.player.x, cz - G.player.z); if (dc < 120) { G.shake(0.25 * (1 - dc / 120)); G.audio.impact?.(0.5, 0); } }
    if (!burning && s.peak === 0 && !H.some((h) => h > 0.01)) {
      s.done = true;   // burnt out without coming down: the charring stays on the facade
      if (spent && s.src === G.player) G.memory?.log('blaze', (s.lot.x0 + s.lot.x1) / 2, (s.lot.z0 + s.lot.z1) / 2);
    }
  }
  writeBurn(lot, lo, hi, heat, charTop) {
    const a = this.burn.array;
    for (const i of this.tiers(lot)) { a[i * 4] = lo; a[i * 4 + 1] = hi; a[i * 4 + 2] = heat; a[i * 4 + 3] = charTop; }
    this.burn.needsUpdate = true;
  }

  // a building that is open (interior floors built) burns inside too: fires on the floors near the player, the people there run
  interior(s, d) {
    const G = this.G, b = s.b; if (!b || !b.open) return;
    const pl = G.player, near = Math.hypot(b.cx - pl.x, b.cz - pl.z) < 60;
    for (const [k, fl] of b.floors) {
      const L = b.levels[k], i = clamp(Math.floor((L.y + 1) / BAND), 0, s.nb - 1), h = s.heat[i];
      if (h < 0.45 || s.fuel[i] <= 0) continue;
      for (const p of fl.npcs || []) if (!p.dead && p.team === 'civ' && p.state !== 'flee') { p.state = 'flee'; p.fleeT = 10; p.threat = { x: b.cx, z: b.cz }; }
      if (!near) continue;
      const r = L.rect; let n = 0; for (const f of G.fire.nodes) if (f.kind === 'ground' && Math.abs(f.y - L.y) < 1.5 && f.x > r.x0 && f.x < r.x1 && f.z > r.z0 && f.z < r.z1) n++;
      if (n < 2 + Math.round(h * 3) && Math.random() < d * (0.6 + h)) G.fire.ignite(rand(r.x0 + 1.5, r.x1 - 1.5), rand(r.z0 + 1.5, r.z1 - 1.5), { y: L.y + 0.12, fuel: rand(10, 20), r: rand(1.2, 2), src: s.src });
    }
  }

  // flames out of the windows of the burning bands, smoke rising off the fire and over the roof
  emit(s, dt) {
    const G = this.G, l = s.lot, cam = G.camera.position, cx = (l.x0 + l.x1) / 2, cz = (l.z0 + l.z1) / 2;
    const dc = Math.hypot(cx - cam.x, cz - cam.z); if (dc > 900) return;
    const span = Math.max(1, (s.hi - s.lo) / BAND), k = dc < 200 ? 1 : dc < 450 ? 0.45 : 0.2;
    s.fAcc = (s.fAcc || 0) + dt * Math.min(70, 10 + span * 7) * s.peak * k;
    s.sAcc = (s.sAcc || 0) + dt * Math.min(36, 6 + span * 2.5) * s.peak * k;
    const wind = 0.8;
    while (s.fAcc >= 1) {
      s.fAcc -= 1;
      const y = rand(s.lo, s.hi), p = this.wallPoint(l, y);
      this.flameP.emit(p.x, y + rand(0.8, 2.6), p.z, p.nx * rand(0.5, 2) + rand(-0.4, 0.4), rand(2.5, 5), p.nz * rand(0.5, 2) + rand(-0.4, 0.4), rand(0.5, 1.1), rand(2.2, 4.2), 3.2, rand(0.8, 1.3), 0.22, 1, -2, 0.7);
    }
    while (s.sAcc >= 1) {
      s.sAcc -= 1;
      const top = Math.random() < 0.4, y = top ? s.hi + rand(0, 3) : rand(s.lo, s.hi) + 2.5, p = top ? { x: rand(l.x0, l.x1), z: rand(l.z0, l.z1), nx: 0, nz: 0 } : this.wallPoint(l, y), g = rand(0.04, 0.08);
      this.smokeP.emit(p.x + p.nx, y, p.z + p.nz, p.nx * 1.5 + wind + rand(-0.5, 0.5), rand(3, 7), p.nz * 1.5 + rand(-0.5, 0.5), rand(5, 9), rand(6, 14) * (top ? 1.4 : 1), g, g * 0.95, g * 0.9, 0.8, -0.35, 0.15);
    }
  }
  // a point on the outside of the building at height y (on the tier that is there), with its outward normal
  wallPoint(l, y) {
    const t = l.tiers, r = t.crown && y >= t.crown.y0 ? t.crown : y >= t.tower.y0 ? t.tower : t.podium;
    const side = Math.floor(Math.random() * 4), u = Math.random();
    if (side === 0) return { x: r.x0 - 0.3, z: r.z0 + u * (r.z1 - r.z0), nx: -1, nz: 0 };
    if (side === 1) return { x: r.x1 + 0.3, z: r.z0 + u * (r.z1 - r.z0), nx: 1, nz: 0 };
    if (side === 2) return { x: r.x0 + u * (r.x1 - r.x0), z: r.z0 - 0.3, nx: 0, nz: -1 };
    return { x: r.x0 + u * (r.x1 - r.x0), z: r.z1 + 0.3, nx: 0, nz: 1 };
  }

  // ---------- collapse ----------
  startCollapse(s) {
    const G = this.G, l = s.lot, cx = (l.x0 + l.x1) / 2, cz = (l.z0 + l.z1) / 2;
    s.phase = 'collapse'; s.ct = 0; s.hit = false; s.rumble = 0; s.tilt = [rand(-1, 1), rand(-1, 1)];
    const b = s.b;
    if (b) { b.ruined = true; if (b.open) { G.buildings.active.delete(b); b.deactivate(); } }
    s.decor = this.hideDecor(l);
    G.memory?.log('collapse', cx, cz);
    const dc = Math.hypot(cx - G.player.x, cz - G.player.z);
    if (dc < 300) G.toast('<span style="color:#ff8a30">건물 붕괴!</span>', b ? b.name : '');
    if (s.src === G.player) G.addHeat(60);
    G.audio.explosion?.(Math.max(0.2, 1 - dc / 400), clamp((cx - G.camera.position.x) * 0.01, -1, 1));
  }
  animate(s, dt) {
    const G = this.G, l = s.lot, cx = (l.x0 + l.x1) / 2, cz = (l.z0 + l.z1) / 2, ids = this.tiers(l), a = this.fac.instanceMatrix.array;
    s.ct += dt; const e = clamp(s.ct / COLLAPSE_T, 0, 1), e2 = e * e, rubH = this.rubbleH(l);
    for (let j = 0; j < ids.length; j++) {
      const i = ids[j]; M.fromArray(this.mat0, i * 16); M.decompose(P, Q, S);
      const y0 = P.y, h0 = S.y;
      if (j === 0) { S.y = h0 + (rubH - h0) * e2; }
      else { P.y = y0 + (rubH * 0.6 - y0) * e2; S.y = Math.max(0.001, h0 * (1 - e2)); }
      const jit = (1 - e) * 0.18;
      P.x += rand(-jit, jit); P.z += rand(-jit, jit);
      E.set(s.tilt[0] * 0.07 * e * (j ? 1 : 0.2), 0, s.tilt[1] * 0.07 * e * (j ? 1 : 0.2)); Q.setFromEuler(E);
      M.compose(P, Q, S); M.toArray(a, i * 16);
    }
    this.fac.instanceMatrix.needsUpdate = true;
    this.w.relief?.sink(l, e2, rubH * 0.6);   // ledges, piers and cornices sink with the facade
    // the top of what is still standing sheds dust; the base throws a dust wall outwards
    const topNow = l.topY * (1 - e2) + rubH * e2, perim = (l.x1 - l.x0 + l.z1 - l.z0) * 2;
    const dcam = Math.hypot(cx - G.camera.position.x, cz - G.camera.position.z), k = dcam < 250 ? 1 : 0.4;
    s.dAcc = (s.dAcc || 0) + dt * (e < 1 ? 60 + perim * 0.25 : 0) * k;
    while (s.dAcc >= 1) {
      s.dAcc -= 1;
      const base = Math.random() < 0.6, p = this.wallPoint(l, base ? 1 : topNow), g = rand(0.2, 0.3), sp = base ? rand(5, 16) : rand(1, 4);
      this.smokeP.emit(p.x, base ? rand(0.5, 4) : topNow + rand(-4, 2), p.z, p.nx * sp + rand(-1.5, 1.5), base ? rand(0.5, 3) : rand(-6, -1), p.nz * sp + rand(-1.5, 1.5), rand(5, 10), rand(8, 18), g, g * 0.95, g * 0.88, 0.85, base ? -0.15 : 3, base ? 0.55 : 0.3);
    }
    if (e < 0.9 && Math.random() < dt * 30) { const p = this.wallPoint(l, topNow * Math.random()); this.flameP.emit(p.x, p.y || topNow * 0.5, p.z, p.nx * 2, rand(-2, 2), p.nz * 2, rand(0.4, 0.8), rand(1.5, 3), 3, 1, 0.25, 1, 2, 0.3); }
    s.rumble -= dt; if (s.rumble <= 0 && e < 1) { s.rumble = 0.6; G.audio.explosion?.(clamp(0.9 - dcam / 500, 0.1, 0.8), clamp((cx - G.camera.position.x) * 0.01, -1, 1)); }
    G.shake(dt * 3 * clamp(1.4 - dcam / 220, 0, 1.4));
    if (!s.hit && s.ct > 1.2) { s.hit = true; this.crush(l); }
    if (e >= 1) { s.done = true; this.ruin(l, false, s.decor); for (let i = 0; i < 6; i++) G.fire.ignite(rand(l.x0, l.x1), rand(l.z0, l.z1), { y: rubH, fuel: rand(20, 45), r: rand(1.5, 2.5), src: null, kind: 'prop' }); }
  }
  // everyone and everything under it or right next to it
  crush(l) {
    const G = this.G, m = 2.5, near = 10;
    const at = { x: (l.x0 + l.x1) / 2, z: (l.z0 + l.z1) / 2 };
    const inside = (x, z, mm) => x > l.x0 - mm && x < l.x1 + mm && z > l.z0 - mm && z < l.z1 + mm;
    for (const h of G.humans) {
      if (h.dead || h.hidden) continue;
      if (inside(h.x, h.z, m)) { h.hurt(999, at, false, null); }
      else if (inside(h.x, h.z, near)) { h.hurt(25, at, false, null); if (!h.dead) h.ragdoll?.(rand(-3, 3), rand(-3, 3), 2); }
    }
    for (const v of G.vehicles) { if (inside(v.x, v.z, m)) v.damage(9999, null); else if (inside(v.x, v.z, near)) v.damage(70, null); }
    const pl = G.player, f = G.vehicle || pl;
    if (!pl.dead) { if (inside(f.x, f.z, 0.5)) G.hurtPlayer(999, null, 'collapse'); else if (inside(f.x, f.z, near)) G.hurtPlayer(30, null, 'collapse'); }
  }
  rubbleH(l) { return Math.min(7, Math.max(3, l.h * 0.06)); }

  // the lot as a ruin: low charred podium as the rubble base, chunks on and around it, a low collider; signs and roof clutter gone
  ruin(lot, instant, decor) {
    const G = this.G, b = G.buildings.byLot.get(lot), col = this.w.colliders, rubH = this.rubbleH(lot);
    if (b) { b.ruined = true; if (b.open) { G.buildings.active.delete(b); b.deactivate(); } }
    const ids = this.tiers(lot), a = this.fac.instanceMatrix.array;
    M.fromArray(this.mat0, ids[0] * 16); M.decompose(P, Q, S); S.y = rubH; S.x *= 0.98; S.z *= 0.98; M.compose(P, Q, S); M.toArray(a, ids[0] * 16);
    for (let j = 1; j < ids.length; j++) a.set(ZERO16, ids[j] * 16);
    this.fac.instanceMatrix.needsUpdate = true;
    this.w.relief?.hide(lot);
    this.door.array[ids[0] * 4 + 3] = 0; this.door.needsUpdate = true;
    this.writeBurn(lot, 0, 0, 0, 1e4);
    if (lot.solid) col.removeBox(lot.solid);
    lot.solid = col.addBox(lot.x0, lot.z0, lot.x1, lot.z1, rubH, 'building');
    const R = this.rnd || (this.rnd = Math.random), chunks = [];
    for (let i = 0; i < RUBBLE_PER; i++) {
      const out = i > RUBBLE_PER * 0.7, sz = out ? rand(0.5, 1.4) : rand(1.2, 3.5);
      const x = out ? rand(lot.x0 - 3, lot.x1 + 3) : rand(lot.x0 + 1, lot.x1 - 1), z = out ? rand(lot.z0 - 3, lot.z1 + 3) : rand(lot.z0 + 1, lot.z1 - 1);
      const inLot = x > lot.x0 && x < lot.x1 && z > lot.z0 && z < lot.z1;
      P.set(x, (inLot ? rubH : 0) + sz * 0.3, z); E.set(R() * 6, R() * 6, R() * 6); Q.setFromEuler(E); S.set(sz * rand(0.8, 1.6), sz * rand(0.5, 1), sz * rand(0.8, 1.6));
      M.compose(P, Q, S); const slot = this.rubbleHead; this.rubbleHead = (this.rubbleHead + 1) % RUBBLE_CAP;
      this.rubble.setMatrixAt(slot, M); chunks.push(slot);
    }
    this.rubble.instanceMatrix.needsUpdate = true;
    this.ruins.set(lot, { decor: decor || this.hideDecor(lot), chunks });
    const idx = this.w.lots.indexOf(lot); if (G.state.ruins[idx] == null) G.state.ruins[idx] = G.clock.t;
    if (!instant) this.fires.delete(lot);
  }
  rebuild(lot) {
    const G = this.G, r = this.ruins.get(lot); if (!r) return;
    const ids = this.tiers(lot), a = this.fac.instanceMatrix.array;
    for (const i of ids) for (let c = 0; c < 16; c++) a[i * 16 + c] = this.mat0[i * 16 + c];
    this.fac.instanceMatrix.needsUpdate = true;
    this.w.relief?.show(lot);
    this.writeBurn(lot, 0, 0, 0, 0);
    this.showDecor(r.decor);
    for (const slot of r.chunks) this.rubble.setMatrixAt(slot, M.makeScale(0, 0, 0));
    this.rubble.instanceMatrix.needsUpdate = true;
    const col = this.w.colliders; if (lot.solid) col.removeBox(lot.solid); lot.solid = col.addBox(lot.x0, lot.z0, lot.x1, lot.z1, lot.h + 5, 'building');
    const b = G.buildings.byLot.get(lot); if (b) b.ruined = false;
    this.ruins.delete(lot); delete G.state.ruins[this.w.lots.indexOf(lot)];
    this.fires.delete(lot);
  }
  rebuildAll() { for (const lot of [...this.ruins.keys()]) this.rebuild(lot); for (const s of this.fires.values()) { this.writeBurn(s.lot, 0, 0, 0, 0); } this.fires.clear(); }

  decorMeshes() {
    if (!this._decor) {
      const w = this.w, list = [...(w.entranceMeshes || [])]; if (w.signMesh) list.push(w.signMesh);
      this.G.signs?.group?.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) list.push(o); });
      this._decor = list;
    }
    return this._decor;
  }
  // signs, holograms, roof props and glare dots standing on / against the lot
  hideDecor(lot) {
    const m = 1.6, out = { inst: [], glare: [] };
    const inBox = (x, z) => x > lot.x0 - m && x < lot.x1 + m && z > lot.z0 - m && z < lot.z1 + m;
    for (const p of instCull.list) {
      if (!p.ready) p.prepare();
      const pos = p.pos, src = p.attrs[0].src;
      for (let i = 0; i < p.n; i++) if (pos[i * 4 + 1] > 0.8 && inBox(pos[i * 4], pos[i * 4 + 2])) { out.inst.push([p, i, src.slice(i * 16, i * 16 + 16)]); p.setMatrix(i, ZERO16); }
    }
    // merged city-wide meshes (entrance canopies and paths, name boards, shop signs): their vertices on the lot or in front of its door sink
    // below the ground; the original heights are kept for the rebuild
    const d = lot.door, inFront = (x, z) => { if (!d) return false; const ax = x - d.px, az = z - d.pz, out = ax * d.nx + az * d.nz, lat = Math.abs(ax * d.nz - az * d.nx); return out > -1 && out < 10.5 && lat < 4; };
    out.verts = [];
    for (const mesh of this.decorMeshes()) {
      const pa = mesh.geometry.attributes.position, a = pa.array, idx = [];
      for (let i = 0; i < pa.count; i++) { const x = a[i * 3], z = a[i * 3 + 2]; if (inBox(x, z) || inFront(x, z)) { idx.push(i, a[i * 3 + 1]); a[i * 3 + 1] = -500; } }
      if (idx.length) { pa.needsUpdate = true; out.verts.push([pa, idx]); }
    }
    const gl = this.w.glare; if (gl) {
      const pa = gl.points.geometry.attributes.position, a = pa.array;
      for (let i = 0; i < pa.count; i++) if (a[i * 3 + 1] > 2 && inBox(a[i * 3], a[i * 3 + 2])) { out.glare.push([i, a[i * 3 + 1]]); a[i * 3 + 1] = -1e4; }
      if (out.glare.length) pa.needsUpdate = true;
    }
    return out;
  }
  showDecor(d) {
    if (!d) return;
    for (const [p, i, m16] of d.inst) p.setMatrix(i, m16);
    for (const [pa, idx] of d.verts || []) { for (let k = 0; k < idx.length; k += 2) pa.array[idx[k] * 3 + 1] = idx[k + 1]; pa.needsUpdate = true; }
    const gl = this.w.glare; if (gl && d.glare.length) { const pa = gl.points.geometry.attributes.position; for (const [i, y] of d.glare) pa.array[i * 3 + 1] = y; pa.needsUpdate = true; }
  }
}
