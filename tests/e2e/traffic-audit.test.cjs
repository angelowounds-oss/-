// Traffic audit (EV-20): the autopilot drives AUDIT_KM (default 10) km through the capital in legs: a motorway or trunk leg, then arterial
// and city legs. Every 6th step the AI cars within 150 m of the player are measured. Phase 0 records the values in
// tests/results/traffic-audit.json and passes once the drive covered most of the distance. The rules come with EV-21/22.
// Measured values:
//  - signals: entries into a signalled junction and how many were on red or yellow (the light of the arm the car came in on, as the signal
//    heads show it, streetgeo.signalState);
//  - stop-line overshoot: a car standing on red past its arm's stop line;
//  - impacts (onImpact at >= 2.2 m/s) with another vehicle or with something static;
//  - time headway to the car ahead in the same lane;
//  - speed against the posted limit of the road class;
//  - wrong-way driving: moving against the lane's direction;
//  - pedestrians on the carriageway, inside or outside a crossing.
const fs = require('fs');
const path = require('path');
const { run, freeze, result } = require('../lib.cjs');
const KM = +(process.env.AUDIT_KM || 10), WALL_MIN = +(process.env.AUDIT_MIN || 30);
run('traffic-audit', { q: 1, width: 480, height: 270 }, async ({ page }) => {
  await freeze(page);
  const t0 = Date.now();
  await page.evaluate(async (KM) => {
    const g = window.__game, RG = window.__region; g.hurtPlayer = () => {}; g.eng.render = () => {};
    // the player's car is only the probe that carries the audit: no heat (a bump into a car made a wanted level, the police then wrecked the car and
    // every later leg ended at once), and its own knocks are counted, not suffered
    g.addHeat = () => {}; g.wanted = 0;
    const LIMIT = { motorway: 100, trunk: 80, primary: 60, secondary: 60, tertiary: 50, residential: 30, unclassified: 50, motorway_link: 60, trunk_link: 50, primary_link: 50, secondary_link: 40, tertiary_link: 40 };
    // leg targets: road samples well inside the capital, by class, in a fixed order (a seeded pick: the same course every run)
    let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    // the capital only: with provinces in the build the pool also held Gyeonggi and Jeju (a leg of 451 km in a straight line to the island)
    const C = RG.regions()[0], inCap = (x, z) => x >= C.x0 && z >= C.z0 && x <= C.x0 + C.g * (C.nx - 1) && z <= C.z0 + C.g * (C.nz - 1);
    const pool = {}; for (const r of RG.regionRoads()) { if (!LIMIT[r.hw]) continue; for (let i = 10; i < r.x.length - 10; i += 25) if (inCap(r.x[i], r.z[i]) && RG.regionWeight(r.x[i], r.z[i]) >= 1) (pool[r.hw] = pool[r.hw] || []).push([r.x[i], r.z[i], r.y[i], r.x[i + 1] - r.x[i], r.z[i + 1] - r.z[i]]); }
    const A = { legs: [], km: 0, steps: 0, sig: { entries: 0, red: 0, yellow: 0, junctions: 0 }, overshoot: { n: 0, max: 0, sum: 0 }, impacts: { vehicle: 0, static: 0, samples: [] }, probeImpacts: 0, respawns: 0, headway: { lt05: 0, lt1: 0, lt2: 0, lt3: 0, ge3: 0 }, speed: { n: 0, ratioSum: 0, over10: 0, over30: 0, byHw: {} }, wrongWay: 0, aiSamples: 0, ped: { onRoad: 0, inCrossing: 0, samples: 0 }, pool: Object.fromEntries(Object.entries(pool).map(([k, v]) => [k, v.length])) };
    const V = g.vehicles[0].constructor, P0 = V.prototype.onImpact;
    V.prototype.onImpact = function (sp, x, z, other) {
      if (this === g.vehicle && sp >= 2.2) A.probeImpacts++;
      if (this.driver === 'ai' && sp >= 2.2 && !(this.impactCd > 0) && g.vehicle && Math.hypot(this.x - g.vehicle.x, this.z - g.vehicle.z) < 150) {
        const veh = !!(other && (other.pv || other instanceof V)); A.impacts[veh ? 'vehicle' : 'static']++;
        if (A.impacts.samples.length < 12) A.impacts.samples.push({ t: this.type, sp: +sp.toFixed(1), x: Math.round(this.x), z: Math.round(this.z), hw: this.hw && this.hw.r.hw, veh });
      }
      return P0.call(this, sp, x, z, other);
    };
    // the game's messages (autopilot start/stop reasons) go into the record of the leg they belong to
    A.toasts = []; const T0 = g.toast.bind(g); g.toast = (a, b) => { if (A.toasts.length < 60) A.toasts.push({ leg: A.legs.length - 1, a, b }); return T0(a, b); };
    window.__A = { A, LIMIT, pool, rnd, inside: new Map(), streets: { sig: [], xing: [] }, leg: 0, last: null };
  }, KM);
  // one leg: a target 1.5-3 km away of the next class in the cycle, the autopilot to it, the measurements on the way
  const CYCLE = ['motorway', 'trunk', 'primary', 'secondary', 'primary', 'tertiary', 'trunk', 'secondary'];
  for (let leg = 0; leg < 30; leg++) {
    if ((Date.now() - t0) / 60000 > WALL_MIN) break;
    const st = await page.evaluate(async (hw) => {
      const g = window.__game, T = window.__test, S = window.__A, A = S.A;
      const here = g.vehicle ? { x: g.vehicle.x, z: g.vehicle.z } : null;
      const list = S.pool[hw] || S.pool.primary; let pick = null;
      for (let k = 0; k < 400 && !pick; k++) { const p = list[Math.floor(S.rnd() * list.length)]; const d = here ? Math.hypot(p[0] - here.x, p[1] - here.z) : 2000; if (d > 1500 && d < 3000) pick = p; }
      if (!pick) pick = list[Math.floor(S.rnd() * list.length)];
      if (g.vehicle && g.vehicle.dead) { g.exitVehicle(true); A.respawns++; }   // a wrecked probe is replaced (it should not be: its damage is off)
      if (!g.vehicle) {   // the first leg starts on a road of the cycle's first class
        const p = (S.pool.motorway || list)[Math.floor(S.rnd() * (S.pool.motorway || list).length)], h = Math.atan2(p[3], p[4]);
        T.teleport(p[0], p[1], p[2] + 1); T.step(120);
        const v = T.spawn('sport', p[0], p[1], h, 'drive', 0x333333, p[2]); T.step(30); v.damage = () => {}; g.enterVehicle(v); S.last = { x: v.x, z: v.z };
      }
      const ok = g.autonav.start(pick[0], pick[1]); A.legs.push({ hw, to: [Math.round(pick[0]), Math.round(pick[1])], ok, km0: +A.km.toFixed(2) });
      return { ok, km: A.km };
    }, CYCLE[leg % CYCLE.length]);
    if (!st.ok) continue;
    // drive the leg in page-sized chunks (at most 4 min of game time per leg)
    for (let c = 0; c < 80; c++) {
      const r = await page.evaluate(async () => {
        const g = window.__game, T = window.__test, S = window.__A, A = S.A, v = g.vehicle, sur = window.__surf;
        for (let s = 0; s < 180 && g.autonav.active && v && !v.dead; s++) {
          T.step(1); A.steps++; if (s % 2) await new Promise((f) => setTimeout(f, 0));
          A.km += Math.hypot(v.x - S.last.x, v.z - S.last.z) / 1000; S.last = { x: v.x, z: v.z };
          if (A.steps % 300 === 1) { S.streets = T.streets(v.x, v.z, 260); A.sig.junctions = Math.max(A.sig.junctions, S.streets.sig.length); }
          if (A.steps % 6) continue;
          const near = g.vehicles.filter((q) => q.driver === 'ai' && q !== v && !q.dead && Math.hypot(q.x - v.x, q.z - v.z) < 150);
          A.aiSamples += near.length;
          // lanes: same road, direction and lane, sorted along the road; the follower's time gap to its leader
          const lanes = new Map();
          for (const q of near) {
            const hw = q.hw; if (!hw || !hw.r) continue; const r = hw.r, i = Math.min(Math.max(hw.i | 0, 0), r.x.length - 2);
            const lim = S.LIMIT[r.hw]; if (lim && q.speed > 2) { const ratio = q.speed * 3.6 / lim; A.speed.n++; A.speed.ratioSum += ratio; if (ratio > 1.1) A.speed.over10++; if (ratio > 1.3) A.speed.over30++; const b = A.speed.byHw[r.hw] || (A.speed.byHw[r.hw] = { n: 0, kmh: 0, max: 0, lim }); b.n++; b.kmh += q.speed * 3.6; b.max = Math.max(b.max, Math.round(q.speed * 3.6)); }
            const tx = (r.x[i + 1] - r.x[i]) * hw.dir, tz = (r.z[i + 1] - r.z[i]) * hw.dir; if (q.speed > 3 && q.vx * tx + q.vz * tz < 0) A.wrongWay++;
            const key = r.id + '|' + hw.dir + '|' + hw.lane; (lanes.get(key) || lanes.set(key, []).get(key)).push(q);
          }
          for (const L of lanes.values()) {
            if (L.length < 2) continue; L.sort((a, b) => (a.hw.i - b.hw.i) * a.hw.dir);
            for (let k = 0; k + 1 < L.length; k++) { const f = L[k], l = L[k + 1], gap = Math.max(0, Math.hypot(l.x - f.x, l.z - f.z) - 4.6); if (f.speed < 3 || gap > 150) continue; const h = gap / f.speed; A.headway[h < 0.5 ? 'lt05' : h < 1 ? 'lt1' : h < 2 ? 'lt2' : h < 3 ? 'lt3' : 'ge3']++; }
          }
          // signals: a car crossing into a junction's radius, the light of the arm it arrived on; a car standing on red past its stop line
          for (const j of S.streets.sig) {
            if (Math.hypot(j.x - v.x, j.z - v.z) > 170) continue;
            for (const q of near) {
              const dx = q.x - j.x, dz = q.z - j.z, d = Math.hypot(dx, dz); if (d > 70) continue;
              const key = q.uid ?? (q.uid = Math.random()); const id = key + '@' + j.x + ',' + j.z, was = S.inside.get(id);
              let arm = 0, best = 9; const a0 = Math.atan2(dz, dx); j.arms.forEach((a, k) => { let e = Math.abs(a0 - a.ang) % (2 * Math.PI); if (e > Math.PI) e = 2 * Math.PI - e; if (e < best) { best = e; arm = k; } });
              const along = dx * Math.cos(j.arms[arm].ang) + dz * Math.sin(j.arms[arm].ang), light = T.signal(j, arm);
              if (d < j.R && was && was.out) { A.sig.entries++; const lt = T.signal(j, was.arm); if (lt === 0) A.sig.red++; else if (lt === 1) A.sig.yellow++; }
              if (q.speed < 0.5 && light === 0 && along < j.arms[arm].stop && along > j.R * 0.5 && d < 40) { const o = j.arms[arm].stop - along; A.overshoot.n++; A.overshoot.sum += o; A.overshoot.max = Math.max(A.overshoot.max, +o.toFixed(1)); }
              S.inside.set(id, { out: d > j.R + 3, arm: d > j.R + 3 ? arm : was ? was.arm : arm });
            }
          }
          if (S.inside.size > 20000) S.inside.clear();
          // people on the carriageway: inside a crossing or not
          if (A.steps % 30 === 0 && sur) for (const h of g.humans) {
            if (h.dead || h.inVehicle || Math.hypot(h.x - v.x, h.z - v.z) > 150) continue; A.ped.samples++;
            if (!sur.onRoad(h.x, h.z)) continue; A.ped.onRoad++;
            if (S.streets.xing.some((c) => { const dx = h.x - c.x, dz = h.z - c.z, al = dx * c.ax + dz * c.az, ac = -dx * c.az + dz * c.ax; return Math.abs(al) <= c.hl + 0.5 && Math.abs(ac) <= c.hw + 0.5; })) A.ped.inCrossing++;
          }
        }
        return { active: g.autonav.active, dead: !v || v.dead, km: A.km };
      });
      if (!r.active || r.dead) { await page.evaluate((d) => { const L = window.__A.A.legs; L[L.length - 1].end = d; }, { active: r.active, dead: r.dead, km: +r.km.toFixed(2) }); break; }
    }
    const km = await page.evaluate(() => window.__A.A.km);
    if (km >= KM) break;
  }
  const A = await page.evaluate(() => { const A = window.__A.A; for (const b of Object.values(A.speed.byHw)) { b.kmh = Math.round(b.kmh / b.n); } return A; });
  const H = A.headway, hn = H.lt05 + H.lt1 + H.lt2 + H.lt3 + H.ge3 || 1;
  const out = {
    km: +A.km.toFixed(2), toasts: A.toasts, minutes: +((Date.now() - t0) / 60000).toFixed(1), steps: A.steps, legs: A.legs, aiSamples: A.aiSamples,
    signals: { ...A.sig, redShare: A.sig.entries ? +(A.sig.red / A.sig.entries).toFixed(3) : null },
    overshoot: { n: A.overshoot.n, maxM: A.overshoot.max, meanM: A.overshoot.n ? +(A.overshoot.sum / A.overshoot.n).toFixed(2) : null },
    probeImpacts: A.probeImpacts, respawns: A.respawns, impacts: { ...A.impacts, per10km: A.km ? +((A.impacts.vehicle + A.impacts.static) / A.km * 10).toFixed(2) : null },
    headwayShare: Object.fromEntries(Object.entries(H).map(([k, n]) => [k, +(n / hn).toFixed(3)])), headwayN: hn,
    speed: { meanOfLimit: A.speed.n ? +(A.speed.ratioSum / A.speed.n).toFixed(2) : null, over10Share: A.speed.n ? +(A.speed.over10 / A.speed.n).toFixed(3) : null, over30Share: A.speed.n ? +(A.speed.over30 / A.speed.n).toFixed(3) : null, byHw: A.speed.byHw },
    wrongWayShare: A.aiSamples ? +(A.wrongWay / A.aiSamples).toFixed(4) : null,
    pedestrians: { ...A.ped, outsideCrossingShare: A.ped.onRoad ? +((A.ped.onRoad - A.ped.inCrossing) / A.ped.onRoad).toFixed(3) : null },
  };
  fs.mkdirSync(path.join(__dirname, '..', 'results'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'results', 'traffic-audit.json'), JSON.stringify(out, null, 1));
  result('traffic-audit', out.km >= KM * 0.8, out, out.km >= KM * 0.8 ? '' : `drove ${out.km} of ${KM} km`);
});
