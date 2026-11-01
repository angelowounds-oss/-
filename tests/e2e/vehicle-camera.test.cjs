// Boarding a car away from the hand-made city (user report 2026-11-01): the chase camera sat at a fixed height of 1.5 m, so on the capital region's ground (tens of
// metres above sea level) it was under the terrain, and stepping out put the player at the old procedural terrain's height, below the real floor, from where he
// fell for ever until the game brought him back to Neon City. The camera must stay above the ground in all three views, start at the car when boarding even if it
// was driven somewhere else before, and the player must stand on the floor after getting out. Spots: raised places on compiled roads, drawn from a fixed sequence.
const { run, freeze, result } = require('../lib.cjs');
run('vehicle-camera', { q: 1, width: 480, height: 270 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, pl = g.player, L = window.__landfn, S = g.sandbox, R = window.__region.regionRoads(); g.hurtPlayer = () => {};
    const frames = async (n) => { const r = g.eng.render; g.eng.render = () => {}; for (let i = 0; i < n; i++) { window.__upd(1 / 60); if (i % 10 === 9) await new Promise((f) => setTimeout(f, 10)); } g.eng.render = r; };
    let seed = 7; const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    const picks = [];
    for (let t = 0; t < 80000 && picks.length < 6; t++) {
      const r = R[Math.floor(rnd() * R.length)]; if (r.x.length < 8 || r.hw === 'motorway' || r.hw === 'trunk' || r.cls[3]) continue;
      const i = 3 + Math.floor(rnd() * (r.x.length - 6)), x = r.x[i], z = r.z[i]; if (Math.max(Math.abs(x), Math.abs(z)) < 2400) continue;
      const h = L.physHeight(x, z, 8); if (h < 25 + picks.length * 10) continue;   // well above sea level, and higher each time
      const tx = r.x[i + 1] - r.x[i - 1], tz = r.z[i + 1] - r.z[i - 1], tl = Math.hypot(tx, tz) || 1;
      picks.push({ x, z, y: r.y[i], tx: tx / tl, tz: tz / tl, h: +h.toFixed(1) });
    }
    const out = { picks: picks.length, trials: [], bad: 0 };
    const groundAt = (x, z) => { const d = g.highways ? g.highways.deckY(x, z) : NaN; return d === d ? d : L.physHeight(x, z, 8); };
    // first a ride in the hand-made city, so that the smoothed camera is left far from every spot
    pl.body3.teleport(0, 2, 0); pl.x = 0; pl.y = 2; pl.z = 0; await frames(30);
    { const orig = S.ahead.bind(S); S.ahead = () => ({ x: 6, y: 3, z: 0, yaw: 0, dx: 0, dz: 1, pl }); S.spawnCar(); S.ahead = orig; const v = g.vehicles[g.vehicles.length - 1]; g.enterVehicle(v); await frames(60); g.exitVehicle(true); await frames(30); g.removeVehicle(v); }
    for (const p of picks) {
      if (g.vehicle) { g.vehicle = null; g.playerOnFoot = true; pl.group.visible = true; }
      pl.body3.teleport(p.x, p.y + 1.5, p.z); pl.x = p.x; pl.y = p.y + 1.5; pl.z = p.z; pl.vx = pl.vz = pl.vy = 0; pl.dead = false;
      await frames(90);
      const orig = S.ahead.bind(S), yaw = Math.atan2(p.tx, p.tz); S.ahead = () => ({ x: pl.x + p.tx * 8, y: pl.y + 1, z: pl.z + p.tz * 8, yaw, dx: p.tx, dz: p.tz, pl }); const n = g.vehicles.length; S.spawnCar(); const v = g.vehicles[n]; S.ahead = orig;
      if (!v) { out.trials.push({ err: 'no car' }); out.bad++; continue; }
      g.enterVehicle(v);
      const t = { h: p.h, cams: [] }; let worst = 1e9;
      for (const mode of [0, 1, 2]) {
        g.cam.mode = mode; await frames(mode === 0 ? 3 : 40);
        if (mode === 0) { const c = g.camera.position, v0 = v.rby ?? v.by; t.firstFrameDy = +(c.y - v0).toFixed(1); t.firstFrameDist = +Math.hypot(c.x - v.x, c.z - v.z).toFixed(1); await frames(37); }
        const c = g.camera.position, gr = groundAt(c.x, c.z), above = c.y - gr; worst = Math.min(worst, above); t.cams.push(+above.toFixed(2));
      }
      g.cam.mode = 0; t.worst = +worst.toFixed(2);
      const vy = v.pv.body.translation().y; t.carAbove = +(vy - groundAt(v.x, v.z)).toFixed(2);
      g.exitVehicle(true); const x0 = pl.x, z0 = pl.z; await frames(240);
      const gr = groundAt(pl.x, pl.z); t.exitAbove = +(pl.y - gr).toFixed(2); t.moved = +Math.hypot(pl.x - x0, pl.z - z0).toFixed(1);
      t.bad = !(t.worst > 0.05) || !(t.firstFrameDist < 15) || !(t.exitAbove > -0.5 && t.exitAbove < 3) || t.moved > 20 || !(t.carAbove > -1.5);
      if (t.bad) out.bad++; out.trials.push(t); g.removeVehicle(v);
    }
    return out;
  }).catch((e) => ({ error: String(e) }));
  result('vehicle-camera', !o.error && o.picks >= 4 && o.bad === 0, o);
});
