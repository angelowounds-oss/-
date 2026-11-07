// The ground over a tunnel (the compiled region): it is solid, as the hill or the street over a real tunnel is, and the tunnel under it stays open. At
// each place found (a tunnel with at least 10 m of drawn ground over its road) a ray down from above meets the drawn ground, a walker put down on it
// stays there, a ray along the tunnel at a car's height meets nothing, and the autopilot drives a car through underneath; and one car drives in
// through a portal from the open road.
// The physics ground was filled down to the tunnel floor along every tunnel, so whoever crossed the hill over one fell into it (GPL-18, 2026-11-06).
const { run, freeze, result } = require('../lib.cjs');
run('over-tunnel', { q: 1, width: 480, height: 360 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, pl = g.player, RG = window.__region, L = window.__landfn, o = { places: [] }; g.hurtPlayer = () => {};
    g.eng.render = () => {};
    let ticks = 0; const step = async (n) => { for (let i = 0; i < n; i++) { window.__upd(1 / 60); if (++ticks % 10 === 0) await new Promise((f) => setTimeout(f, 10)); } };   // yields every 10 steps across calls: the page's memory is given back only between tasks (it reached 7.8 GB and crashed)
    if (!RG || !RG.regionRoads().length) return { noRegion: true };
    const put = (x, y, z) => { pl.body3.teleport(x, y, z); pl.x = x; pl.y = y; pl.z = z; pl.vx = pl.vz = pl.vy = 0; pl.dead = false; };
    // tunnel samples deep under the drawn ground, well inside a tunnel (five samples each way), one per road, 500 m apart
    const found = [];
    for (const r of RG.regionRoads()) {
      if (found.length >= 3) break;
      for (let i = 6; i + 11 < r.x.length; i++) {
        if (r.cls.slice(i - 5, i + 6).some((c) => c !== 2) || RG.regionWeight(r.x[i], r.z[i]) < 1) continue;
        const land = L.landHeight(r.x[i], r.z[i], 8);
        if (land - r.y[i] < 10 || found.some((f) => Math.hypot(f.x - r.x[i], f.z - r.z[i]) < 500)) continue;
        found.push({ r, i, x: r.x[i], z: r.z[i], y: r.y[i], land }); break;
      }
    }
    o.found = found.length;
    const P = g.phys;
    for (const f of found) {
      const r = f.r, c = { road: r.id, name: r.name || '', at: [Math.round(f.x), Math.round(f.z)], cover: +(f.land - f.y).toFixed(1) };
      put(f.x, f.land + 3, f.z); g.highways.ensureNear(f.x, f.z); await step(60);
      // down from 30 m over the drawn ground: the first thing met is that ground
      const dn = P.ray(f.x, f.land + 30, f.z, 0, -1, 0, 80, 1);
      c.downTo = dn ? +(f.land + 30 - dn.t - f.land).toFixed(2) : null;
      // a walker put down on the ground over the tunnel is still on it three seconds later
      put(f.x, f.land + 2, f.z); await step(180); c.stand = +(pl.y - f.land).toFixed(2);
      // inside: along the road at 1.2 m over its own profile, two samples each way, static colliders only
      c.alongHit = null;
      for (let k = f.i - 2; k < f.i + 2 && c.alongHit === null; k++) {
        const dx = r.x[k + 1] - r.x[k], dy = r.y[k + 1] - r.y[k], dz = r.z[k + 1] - r.z[k], l = Math.hypot(dx, dy, dz) || 1, h = P.ray(r.x[k], r.y[k] + 1.2, r.z[k], dx / l, dy / l, dz / l, l, 1);
        if (h) c.alongHit = [k - f.i, +h.t.toFixed(1)];
      }
      // drive through underneath (to a goal far enough ahead: the autopilot stops 16 m short of it)
      const tx = r.x[f.i + 1] - r.x[f.i - 1], tz = r.z[f.i + 1] - r.z[f.i - 1], tl = Math.hypot(tx, tz), ux = tx / tl, uz = tz / tl;
      const a = f.i - 4, e = f.i + 9, x0 = r.x[a], z0 = r.z[a], hh = Math.atan2(r.x[a + 1] - x0, r.z[a + 1] - z0);
      put(x0, r.y[a] + 2, z0); await step(20);
      const V = g.vehicles[0].constructor, v = new V(g, 'sport', 0x333333, 'parked', {}); v.x = x0; v.z = z0; v.h = hh; v.spawnY = r.y[a]; v.awake = true; g.addVehicle(v); await step(30);
      g.enterVehicle(v); c.started = g.autonav.start(r.x[e], r.z[e]);
      let maxRise = -9, passed = false;
      for (let k = 0; k < 1800 && g.autonav.active; k++) {
        await step(1); const t = v.pv.body.translation(), s = (v.x - f.x) * ux + (v.z - f.z) * uz;
        if (Math.abs(s) < 15 && Math.hypot(v.x - f.x, v.z - f.z) < 20) maxRise = Math.max(maxRise, t.y - f.y);
        if (s > 25) { passed = true; break; }
      }
      c.passed = passed; c.maxRise = +maxRise.toFixed(2); c.alive = !v.dead;
      g.autonav.cancel && g.autonav.cancel(); g.exitVehicle(true); await step(20);
      o.places.push(c); console.log('## ' + JSON.stringify(c));
    }
    // in through a portal from the open road (the cover's seam there leaves the opening clear): a portal with a hill over the tunnel. Any portal will do:
    // the profiles had steps of 3-6 m at the portals (GPL-19) and the open road before one could lie under the physics ground (GPL-20)
    let pf = null;
    for (const r of RG.regionRoads()) {
      for (let i = 8; i + 12 < r.x.length && !pf; i++) {
        if (r.cls[i - 1] !== 0 || r.cls.slice(i - 8, i).some((c) => c !== 0) || r.cls.slice(i, i + 10).some((c) => c !== 2) || RG.regionWeight(r.x[i], r.z[i]) < 1) continue;
        if (L.landHeight(r.x[i + 5], r.z[i + 5], 8) - r.y[i + 5] > 8) pf = { r, i };
      }
      if (pf) break;
    }
    if (pf) {
      const r = pf.r, i = pf.i, c = { road: r.id, name: r.name || '', at: [Math.round(r.x[i]), Math.round(r.z[i])] }, a = i - 7, e = i + 10;
      const tx = r.x[i + 1] - r.x[i - 1], tz = r.z[i + 1] - r.z[i - 1], tl = Math.hypot(tx, tz), ux = tx / tl, uz = tz / tl;
      put(r.x[a], r.y[a] + 2, r.z[a]); g.highways.ensureNear(r.x[i], r.z[i]); await step(20);
      const V = g.vehicles[0].constructor, v = new V(g, 'sport', 0x333333, 'parked', {}); v.x = r.x[a]; v.z = r.z[a]; v.h = Math.atan2(r.x[a + 1] - r.x[a], r.z[a + 1] - r.z[a]); v.spawnY = r.y[a]; v.awake = true; g.addVehicle(v); await step(30);
      g.enterVehicle(v); c.started = g.autonav.start(r.x[e], r.z[e]);
      let passed = false;
      for (let k = 0; k < 1800 && g.autonav.active; k++) { await step(1); if ((v.x - r.x[i]) * ux + (v.z - r.z[i]) * uz > 30) { passed = true; break; } }
      c.passed = passed; c.alive = !v.dead; g.autonav.cancel && g.autonav.cancel(); g.exitVehicle(true); await step(20);
      o.portal = c; console.log('## portal ' + JSON.stringify(c));
    }
    o.covers = g.highways.stats.covers || 0; o.coverTris = g.highways.stats.coverTris || 0;
    return o;
  });
  if (o.noRegion) return result('over-tunnel', true, o, 'no compiled region in this build');
  const ok = (c) => c.downTo !== null && Math.abs(c.downTo) < 0.6 && Math.abs(c.stand) < 2 && c.alongHit === null && c.started && c.passed && c.alive && c.maxRise < 3;
  result('over-tunnel', o.found >= 2 && o.places.every(ok) && !!o.portal && o.portal.started && o.portal.passed && o.portal.alive, o);
});
