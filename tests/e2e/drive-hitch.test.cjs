// Drive hitch gate (EV-93, the measure of EV-05): 10 minutes of game time on the autopilot across the capital (legs 1.5-3 km to road samples of
// a fixed seeded cycle of classes, as traffic-audit), rendering stubbed (SwiftShader frame times say nothing about a real GPU), and the CPU time
// of every update: its distribution, the frames over 16.7 / 50 / 100 ms, and the worst frames with the stage that took them and where the car
// was (a first entry into a city's tiles, a burst of building or collider work). The harness's collections (tests/lib.cjs, every 30 steps) are
// taken out of each frame's time and counted apart. Limits start at today's values and are lowered with EV-05 (P99_MS / MAX_MS / OVER50 override;
// EV-05's AC: no frame over 16 ms from tile generation). MIN sets the game minutes (default 10).
const fs = require('fs');
const path = require('path');
const { run, freeze, result } = require('../lib.cjs');
const MIN = +(process.env.MIN || 10), P99_MS = +(process.env.P99_MS || 120), MAX_MS = +(process.env.MAX_MS || 3000), OVER50 = +(process.env.OVER50 || 2000);
run('drive-hitch', { q: 1, width: 320, height: 180 }, async ({ page }) => {
  await freeze(page);
  const t0 = Date.now();
  await page.evaluate(() => {
    const g = window.__game, RG = window.__region; g.hurtPlayer = () => {}; g.eng.render = () => {}; g.addHeat = () => {}; g.wanted = 0;
    // the capital's roads by class (a seeded pick: the same course every run)
    let seed = 11; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    const C = RG.regions()[0], inCap = (x, z) => x >= C.x0 && z >= C.z0 && x <= C.x0 + C.g * (C.nx - 1) && z <= C.z0 + C.g * (C.nz - 1);
    const pool = {}; for (const r of RG.regionRoads()) { if (!/^(motorway|trunk|primary|secondary|tertiary)$/.test(r.hw)) continue; for (let i = 10; i < r.x.length - 10; i += 25) if (inCap(r.x[i], r.z[i]) && RG.regionWeight(r.x[i], r.z[i]) >= 1) (pool[r.hw] = pool[r.hw] || []).push([r.x[i], r.z[i], r.y[i], r.x[i + 1] - r.x[i], r.z[i + 1] - r.z[i]]); }
    // each frame's own time: the harness's collections and the stages (Game.stage) timed apart
    const gc0 = window.gc; let gcMs = 0; window.gc = () => { const t = performance.now(); gc0(); gcMs += performance.now() - t; };
    const cur = {}, S0 = g.stage.bind(g); g.stage = (name, f, a, b) => { const t = performance.now(); S0(name, f, a, b); cur[name] = performance.now() - t; };
    window.__H = { pool, rnd, fr: [], worst: [], gcMs: () => gcMs, cur, km: 0, legs: [], last: null, steps: 0 };
  });
  const CYCLE = ['trunk', 'primary', 'motorway', 'secondary', 'primary', 'tertiary'];
  const STEPS = Math.round(MIN * 3600);
  for (let leg = 0; leg < 200; leg++) {
    const st = await page.evaluate((hw) => {
      const g = window.__game, T = window.__test, H = window.__H, list = H.pool[hw] || H.pool.primary;
      const here = g.vehicle ? { x: g.vehicle.x, z: g.vehicle.z } : null; let pick = null;
      for (let k = 0; k < 400 && !pick; k++) { const p = list[Math.floor(H.rnd() * list.length)]; const d = here ? Math.hypot(p[0] - here.x, p[1] - here.z) : 2000; if (d > 1500 && d < 3000) pick = p; }
      if (!pick) pick = list[Math.floor(H.rnd() * list.length)];
      if (g.vehicle && g.vehicle.dead) g.exitVehicle(true);
      if (!g.vehicle) {
        const L = H.pool.trunk || list, p = L[Math.floor(H.rnd() * L.length)], h = Math.atan2(p[3], p[4]);
        T.teleport(p[0], p[1], p[2] + 1); T.step(120);
        const v = T.spawn('sport', p[0], p[1], h, 'drive', 0x333333, p[2]); T.step(30); v.damage = () => {}; g.enterVehicle(v); H.last = { x: v.x, z: v.z };
      }
      const ok = g.autonav.start(pick[0], pick[1]); H.legs.push({ hw, ok }); return { ok, steps: H.steps };
    }, CYCLE[leg % CYCLE.length]);
    if (!st.ok) continue;
    let r;
    do {
      r = await page.evaluate(async (STEPS) => {
        const g = window.__game, H = window.__H, v = g.vehicle;
        for (let s = 0; s < 240 && g.autonav.active && v && !v.dead && H.steps < STEPS; s++) {
          for (const k in H.cur) H.cur[k] = 0;
          const gc = H.gcMs(), t = performance.now(); window.__upd(1 / 60); const ms = performance.now() - t - (H.gcMs() - gc);
          H.fr.push(ms); H.steps++;
          if (ms > 50) { let top = '', tm = 0; for (const k in H.cur) if (H.cur[k] > tm) { tm = H.cur[k]; top = k; } H.worst.push({ ms: +ms.toFixed(0), stage: top, stageMs: +tm.toFixed(0), x: Math.round(v.x), z: Math.round(v.z), step: H.steps }); }
          if (H.last) { H.km += Math.hypot(v.x - H.last.x, v.z - H.last.z) / 1000; H.last = { x: v.x, z: v.z }; }
          if (s % 2) await new Promise((f) => setTimeout(f, 0));
        }
        return { active: g.autonav.active, dead: !v || v.dead, steps: H.steps };
      }, STEPS);
    } while (r.active && !r.dead && r.steps < STEPS);
    if (r.steps >= STEPS) break;
  }
  const o = await page.evaluate(() => {
    const H = window.__H, s = H.fr.slice().sort((a, b) => a - b), n = s.length, q = (p) => +s[Math.min(n - 1, Math.floor(n * p))].toFixed(1);
    const stages = {}; for (const w of H.worst) stages[w.stage] = (stages[w.stage] || 0) + 1;
    return { frames: n, km: +H.km.toFixed(2), legs: H.legs.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: n ? +s[n - 1].toFixed(0) : null, over16: s.filter((x) => x > 16.7).length, over50: s.filter((x) => x > 50).length, over100: s.filter((x) => x > 100).length, hitchStages: stages, worst: H.worst.sort((a, b) => b.ms - a.ms).slice(0, 12), harnessGcMs: Math.round(H.gcMs()) };
  });
  o.wallMin = +((Date.now() - t0) / 60000).toFixed(1);
  fs.mkdirSync(path.join(__dirname, '..', 'results'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'results', 'drive-hitch.json'), JSON.stringify(o, null, 1));
  const bad = [];
  if (o.frames < MIN * 3600 * 0.9) bad.push(`drove ${o.frames} frames of ${MIN * 3600}`);
  if (o.p99 > P99_MS) bad.push(`p99 ${o.p99} ms > ${P99_MS}`);
  if (o.max > MAX_MS) bad.push(`max ${o.max} ms > ${MAX_MS}`);
  if (o.over50 > OVER50) bad.push(`${o.over50} frames over 50 ms > ${OVER50}`);
  result('drive-hitch', bad.length === 0, { ...o, limits: { P99_MS, MAX_MS, OVER50, MIN } }, bad.join(' | '));
});
