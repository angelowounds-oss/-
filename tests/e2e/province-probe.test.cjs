// The compiled provinces (ADR-0044, WLD-25c): in each compiled province of the built world, at its biggest real settlements, the ground under the
// player is the province's raster, the player stands on it, its real buildings load; then the autopilot drives 2 km along one of its motorways or
// trunk roads without leaving the road or falling through. PROVSHOTS=1 writes a picture of each place to tests/results/.
// Not in tests/run.cjs yet: with a province loaded whole into the core chunk the renderer spikes past this container's 13 GB (ADR-0044); it
// goes in with the raster streaming. The page is driven in short evaluates (a few hundred updates each): one long evaluate over a province grew the renderer until it was killed.
const fs = require('node:fs'), path = require('node:path');
const { run, freeze, result, ROOT } = require('../lib.cjs');
run('province-probe', { q: 1, width: +(process.env.W || 480), height: +(process.env.H || 300) }, async ({ page }) => {
  await freeze(page);
  // page helpers: stepping without drawing, the province owning a cell
  const setup = await page.evaluate(() => {
    const g = window.__game, RG = window.__region; g.hurtPlayer = () => {};
    if (!RG || !RG.regions) return { error: 'no region hook' };
    const provs = RG.regions().slice(1); if (!provs.length) return { noProvince: true };
    window.__pp = {
      provs,
      step: async (n) => { const r = g.eng.render; g.eng.render = () => {}; for (let i = 0; i < n; i++) { window.__upd(1 / 60); if (i % 3 === 2) await new Promise((f) => setTimeout(f, 5)); } g.eng.render = r; },
      owner: (x, z) => provs.find((P) => { const i = Math.round((x - P.x0) / P.g), j = Math.round((z - P.z0) / P.g); return i >= 0 && j >= 0 && i < P.nx && j < P.nz && P.own[j * P.nx + i] === 255; }),
    };
    g.clock.scale = 0; g.clock.t = Math.floor(g.clock.t / 1440) * 1440 + 13 * 60; g.state.weather = { type: 'clear', until: g.clock.t + 1e9 };
    const RANK = { city: 4, town: 3, suburb: 2, village: 1 };
    return { provinces: provs.map((P) => ({ name: P.name, places: P.places.filter((q) => window.__pp.owner(q.x, q.z) === P).sort((a, b) => (RANK[b.kind] || 0) - (RANK[a.kind] || 0) || (b.pop || 0) - (a.pop || 0)).slice(0, 3) })) };
  });
  const o = { ...setup, places: [], drives: [] }, pics = {};
  for (const P of setup.provinces || []) {
    for (const q of P.places) {
      await page.evaluate((q) => { const g = window.__game, pl = g.player, L = window.__landfn, y = L.physHeight(q.x, q.z, 8) + 2; pl.body3.teleport(q.x, y, q.z); pl.x = q.x; pl.y = y; pl.z = q.z; pl.vx = pl.vy = pl.vz = 0; pl.dead = false; }, q);
      for (let k = 0; k < 12; k++) {
          const busy = await page.evaluate(async () => { await window.__pp.step(30); const RB = window.__game.realbuildings; return !!RB && (RB.jobs.length > 0 || [...RB.tiles.values()].some((r) => r.state !== 'ready')); });
        if (!busy && k >= 3) break;
      }
      const rec = await page.evaluate(async ({ q, name }) => {
        const g = window.__game, pl = g.player, L = window.__landfn, RG = window.__region, RB = g.realbuildings; await window.__pp.step(60);
        const phys = L.physHeight(pl.x, pl.z, 8), reg = RG.regionHeight(pl.x, pl.z);
        return { region: name, name: q.name, kind: q.kind, x: Math.round(q.x), z: Math.round(q.z), weight: +RG.regionWeight(q.x, q.z).toFixed(2), regionH: +reg.toFixed(1), physH: +phys.toFixed(1),
          feetOverGround: +(pl.y - phys).toFixed(2), drift: Math.round(Math.hypot(pl.x - q.x, pl.z - q.z)), bldTiles: RB ? [...RB.tiles.values()].filter((r) => r.state === 'ready').length : 0, buildings: RB ? RB.stats.buildings : 0 };
      }, { q, name: P.name });
      o.places.push(rec);
      if (process.env.PROVSHOTS) pics[`${P.name}-${q.name}`] = await page.evaluate(() => { const g = window.__game, R = g.eng.renderer; g.renderFrame(0, true); const cv = R.domElement, k = document.createElement('canvas'); k.width = cv.width; k.height = cv.height; k.getContext('2d').drawImage(cv, 0, 0); return k.toDataURL('image/jpeg', 0.8); });
    }
    // a motorway or trunk line of the province with 2 km of its own cells after the start; the car is put on it and the autopilot drives to the end
    const d = await page.evaluate(async (name) => {
      const g = window.__game, pl = g.player, RG = window.__region, PP = window.__pp, P = PP.provs.find((r) => r.name === name), roads = RG.regionRoads(), want = Math.ceil(2000 / 8);
      let line = null, i0 = 0;
      for (const r of roads) { if (!String(r.id).startsWith(name + ':') || (r.hw !== 'motorway' && r.hw !== 'trunk') || r.x.length < want + 40) continue;
        for (let i = 20; i + want < r.x.length; i += 40) if (PP.owner(r.x[i], r.z[i]) === P && PP.owner(r.x[i + want], r.z[i + want]) === P) { line = r; i0 = i; break; } if (line) break; }
      if (!line) return { region: name, noLine: true };
      const x0 = line.x[i0], z0 = line.z[i0], tx = line.x[i0 + 1] - x0, tz = line.z[i0 + 1] - z0, yl = line.y[i0];
      pl.body3.teleport(x0, yl + 1, z0); pl.x = x0; pl.y = yl + 1; pl.z = z0; pl.vy = 0; await PP.step(120);
      const V = g.vehicles[0].constructor, v = new V(g, 'sport', 0x333333, 'parked', {}); v.x = x0; v.z = z0; v.h = Math.atan2(tx, tz); v.spawnY = yl; v.awake = true; v.fuel = 1e9;
      g.addVehicle(v); await PP.step(30); g.enterVehicle(v);
      const ex = line.x[i0 + want], ez = line.z[i0 + want];
      PP.drive = { v, line, j: i0, ex, ez, x1: v.x, z1: v.z, top: 0, minAbove: 9, maxAbove: -9, offLine: 0 };
      return { region: name, line: line.id, hw: line.hw, started: g.autonav.start(ex, ez) };
    }, P.name);
    if (!d.noLine) {
      for (let k = 0; k < 30; k++) {
        const on = await page.evaluate(async () => {
          const g = window.__game, L = window.__landfn, D = window.__pp.drive, v = D.v, line = D.line;
          for (let s = 0; s < 150 && g.autonav.active; s++) {
            await window.__pp.step(1); D.top = Math.max(D.top, v.speed); const tr = v.pv.body.translation(), gy = L.physHeight(v.x, v.z, 8);
            let bd = Infinity; for (let q = Math.max(0, D.j - 20); q < Math.min(line.x.length, D.j + 40); q++) { const dd = Math.hypot(line.x[q] - v.x, line.z[q] - v.z); if (dd < bd) { bd = dd; D.j = q; } }
            D.minAbove = Math.min(D.minAbove, tr.y - gy); if (bd < 15) D.maxAbove = Math.max(D.maxAbove, tr.y - line.y[D.j]); D.offLine = Math.max(D.offLine, bd);
          }
          return g.autonav.active;
        });
        if (!on) break;
      }
      Object.assign(d, await page.evaluate(async () => {
        const g = window.__game, D = window.__pp.drive, v = D.v, r = { driven: Math.round(Math.hypot(v.x - D.x1, v.z - D.z1)), left: Math.round(Math.hypot(D.ex - v.x, D.ez - v.z)), topKmh: Math.round(D.top * 3.6), alive: !v.dead,
          minAbove: +D.minAbove.toFixed(2), maxAbove: +D.maxAbove.toFixed(2), offLine: Math.round(D.offLine) };
        g.autonav.cancel && g.autonav.cancel(); g.exitVehicle(true); await window.__pp.step(30); return r;
      }));
    }
    o.drives.push(d);
  }
  if (Object.keys(pics).length) { const dir = path.join(ROOT, 'tests/results'); fs.mkdirSync(dir, { recursive: true }); for (const [k, u] of Object.entries(pics)) fs.writeFileSync(path.join(dir, `province-${k}.jpg`), Buffer.from(u.split(',')[1], 'base64')); }
  const bad = [];
  if (o.error) bad.push(o.error);
  for (const p of o.places) {
    if (Math.abs(p.physH - p.regionH) > 3) bad.push(`${p.name}: ground ${p.physH} is not the province's ${p.regionH}`);
    if (p.feetOverGround < -0.5 || p.feetOverGround > 3) bad.push(`${p.name}: player ${p.feetOverGround} m over the ground`);
    if (p.weight < 0.99) bad.push(`${p.name}: weight ${p.weight}`);
  }
  if (o.places.length && !o.places.some((p) => p.buildings > 0)) bad.push('no province buildings loaded');
  for (const d of o.drives) if (!d.noLine && (!d.alive || d.minAbove < -0.5 || d.offLine > 25 || d.left > 200)) bad.push('drive ' + JSON.stringify(d));
  delete o.provinces;
  result('province-probe', bad.length === 0 && !o.noProvince, o, bad.join('; ') || (o.noProvince ? 'no compiled province in this build' : ''));
});
