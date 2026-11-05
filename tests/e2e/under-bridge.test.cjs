// Roads that pass under a bridge (the compiled region): the space under the deck is open, as it is in the city. At each crossing found (an at-grade
// road under another road's bridge, at least 5.5 m between them) a ray along the lower road at a car's height meets nothing for 30 m each side,
// a ray down from just under the deck meets the lower road, and the autopilot drives a car through underneath without climbing onto the bridge;
// the nearest pier is solid (a ray at a car's height stops at its face).
// The physics ground used to be filled up to every deck, so every bridge was a solid bank no car could pass (2026-11-05).
const { run, freeze, result } = require('../lib.cjs');
run('under-bridge', { q: 1, width: 480, height: 360 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, pl = g.player, RG = window.__region, o = { crossings: [] }; g.hurtPlayer = () => {};
    g.eng.render = () => {};
    const step = async (n) => { for (let i = 0; i < n; i++) { window.__upd(1 / 60); if (i % 10 === 9) await new Promise((f) => setTimeout(f, 10)); } };
    if (!RG || !RG.regionRoads().length) return { noRegion: true };
    const roads = RG.regionRoads(), BIG = { primary: 1, secondary: 1, tertiary: 1, trunk: 1 };
    // bridge segments in a 64 m grid, then lower roads crossing one
    const grid = new Map(), K = (x, z) => Math.floor(x / 64) * 100003 + Math.floor(z / 64);
    for (const r of roads) for (let i = 0; i + 1 < r.x.length; i++) if (r.cls[i] === 1 && r.cls[i + 1] === 1) { const k = K(r.x[i], r.z[i]); let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(r, i); }
    const found = []; console.log('## scanning');
    for (const r of roads) {
      if (!BIG[r.hw] || found.length >= 3) continue;
      const n0 = found.length;   // one crossing per road, so that the three are three different places
      for (let i = 12; i + 12 < r.x.length && found.length < 3 && found.length === n0; i++) {
        if (r.cls.slice(i - 10, i + 11).some((c) => c !== 0) || RG.regionWeight(r.x[i], r.z[i]) < 1) continue;
        const l = grid.get(K(r.x[i], r.z[i])); if (!l) continue;
        for (let q = 0; q < l.length; q += 2) {
          const b = l[q], j = l[q + 1]; if (b === r) continue;
          const ax = b.x[j], az = b.z[j], dx = b.x[j + 1] - ax, dz = b.z[j + 1] - az, l2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((r.x[i] - ax) * dx + (r.z[i] - az) * dz) / l2));
          const d = Math.hypot(r.x[i] - ax - dx * t, r.z[i] - az - dz * t), yb = b.y[j] + (b.y[j + 1] - b.y[j]) * t;
          if (d < 2 && yb - r.y[i] > 5.5 && !found.some((f) => Math.hypot(f.x - r.x[i], f.z - r.z[i]) < 500)) { found.push({ r, i, b, x: r.x[i], z: r.z[i], y: r.y[i], yb }); break; }
        }
      }
    }
    o.found = found.length;
    console.log('## found ' + found.length);
    for (const f of found) {
      const r = f.r, c = { road: r.id, name: r.name || '', over: f.b.name || f.b.id, at: [Math.round(f.x), Math.round(f.z)], gap: +(f.yb - f.y).toFixed(1) };
      pl.body3.teleport(f.x, f.yb + 3, f.z); pl.x = f.x; pl.y = f.yb + 3; pl.z = f.z; pl.vy = 0;
      g.highways.ensureNear(f.x, f.z); await step(120);
      const P = window.__game.phys, tx = r.x[f.i + 1] - r.x[f.i - 1], tz = r.z[f.i + 1] - r.z[f.i - 1], tl = Math.hypot(tx, tz), ux = tx / tl, uz = tz / tl;
      // along the lower road at 1.2 m over its own profile, four samples (about 30 m) each side, static colliders only
      c.alongHit = null;
      for (let k = f.i - 4; k < f.i + 4 && c.alongHit === null; k++) {
        const dx = r.x[k + 1] - r.x[k], dy = r.y[k + 1] - r.y[k], dz = r.z[k + 1] - r.z[k], l = Math.hypot(dx, dy, dz) || 1, h = P.ray(r.x[k], r.y[k] + 1.2, r.z[k], dx / l, dy / l, dz / l, l, 1);
        if (h) c.alongHit = [k - f.i, +h.t.toFixed(1)];
      }
      // down from 1 m under the deck: the lower road (its ground) is the first thing met
      const dn = P.ray(f.x, f.yb - 1.5, f.z, 0, -1, 0, 30);
      c.downTo = dn ? +(f.yb - 1.5 - dn.t - f.y).toFixed(2) : null;
      // drive through
      const a = f.i - 6, e = f.i + 7, x0 = r.x[a], z0 = r.z[a], hh = Math.atan2(r.x[a + 1] - x0, r.z[a + 1] - z0);
      const V = g.vehicles[0].constructor, v = new V(g, 'sport', 0x333333, 'parked', {}); v.x = x0; v.z = z0; v.h = hh; v.spawnY = r.y[a]; v.awake = true; g.addVehicle(v); await step(30);
      g.enterVehicle(v); c.started = g.autonav.start(r.x[e], r.z[e]);
      let maxRise = -9, passed = false;
      for (let k = 0; k < 1800 && g.autonav.active; k++) {
        await step(1); const t = v.pv.body.translation(), s = (v.x - f.x) * ux + (v.z - f.z) * uz;
        if (Math.abs(s) < 15 && Math.hypot(v.x - f.x, v.z - f.z) < 20) maxRise = Math.max(maxRise, t.y - f.y);
        if (s > 25) passed = true;
      }
      c.passed = passed; c.maxRise = +maxRise.toFixed(2); c.alive = !v.dead;
      g.autonav.cancel && g.autonav.cancel(); g.exitVehicle(true); await step(20);
      // the piers of the bridge overhead are solid: a ray at a car's height toward the nearest one stops at its face
      let best = null; for (const p of g.highways.art || []) for (const k of p.pcol || []) { const t = k.translation(), dd = Math.hypot(t.x - f.x, t.z - f.z); if (!best || dd < best.dd) best = { k, t, dd }; }
      if (best) { const t = best.t, foot = t.y - best.k.halfExtents().y, ox = t.x + 12, hit = P.ray(ox, foot + 1.0, t.z, -1, 0, 0, 24, 1); c.pier = { dist: Math.round(best.dd), hit: hit ? +hit.t.toFixed(1) : null }; }
      o.crossings.push(c); console.log('## ' + JSON.stringify(c));
    }
    o.pierCols = g.highways.stats.pierCols || 0;
    return o;
  });
  if (o.noRegion) return result('under-bridge', true, o, 'no compiled region in this build');
  const ok = (c) => c.alongHit === null && c.downTo !== null && Math.abs(c.downTo) < 1.2 && c.started && c.passed && c.alive && c.maxRise < 3;
  const piers = o.crossings.filter((c) => c.pier); o.pierCols = o.pierCols || 0;
  result('under-bridge', o.found >= 2 && o.crossings.every(ok) && piers.length >= 1 && piers.every((c) => c.pier.hit !== null && c.pier.hit < 12), o);
});
