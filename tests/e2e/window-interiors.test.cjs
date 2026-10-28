// render (Q0-9, ADR-0032): a floor's windows may only be cut open in the facade (world.setFloorOpen) while that floor exists, else the street
// would see straight through an empty shell. Walking and driving through the grid, then going up a tower and back down, in no frame may a
// stage instance carry a built-floor bit for a floor its building does not have. Also: the mask is set at all (some floor opened), and a
// dropped building leaves no bit behind.
const { run, freeze, result } = require('../lib.cjs');
run('window-interiors', { q: 1, width: 640, height: 400 }, async ({ page }) => {
  await freeze(page);
  const res = await page.evaluate(async () => {
    const g = window.__game, B = g.buildings, pl = g.player, W = g.world; g.eng.render = () => {};
    const meshOf = (lot) => (lot.fac ? lot.fac.mesh : lot.far ? null : W.facade);
    // every opened bit must name a floor the building has: stage floor index -> level k
    const wrong = () => {
      const bad = [];
      for (const b of B.list) {
        const m = meshOf(b.lot); if (!m || !b.levels) continue; const a = m.geometry.attributes.aBuilt;
        for (const s of new Set(b.levels.map((L) => L.rect))) {
          if (s.inst == null) continue; const fh = a.getX(s.inst), base = a.getY(s.inst), mask = a.getZ(s.inst); if (!fh) continue;
          for (let i = 0; i < 24; i++) if (Math.floor(mask / 2 ** i) % 2) {
            const fi = base + i, k = b.levels.findIndex((L) => L.rect === s && Math.round((L.y - (s.y0 || 0)) / L.h) === fi);
            if (k < 0 || !b.floors.has(k)) bad.push({ b: b.lot.uid, fi, k });
          }
        }
      }
      return bad;
    };
    const opened = () => B.list.reduce((n, b) => { const m = meshOf(b.lot); if (!m || !b.levels) return n; const a = m.geometry.attributes.aBuilt; return n + [...new Set(b.levels.map((L) => L.rect))].filter((s) => s.inst != null && a.getX(s.inst) > 0).length; }, 0);
    const out = { maxOpened: 0 };
    for (const [name, sp] of [['walk', 7], ['drive', 25]]) {
      let x = pl.x, z = pl.z, dir = 0, badFrames = 0, example = null; const wp = [[0, 1], [1, 0], [0, -1], [-1, 0]];
      for (let i = 0; i < 1500; i++) {
        if (i % 300 === 0) dir = (dir + 1) % 4; x += wp[dir][0] * sp / 60; z += wp[dir][1] * sp / 60; pl.body3.teleport(x, pl.y, z); pl.x = x; pl.z = z; window.__upd(1 / 60);
        if (i % 5 === 0) { const w = wrong(); if (w.length) { badFrames++; if (!example) example = { frame: i, ...w[0] }; } out.maxOpened = Math.max(out.maxOpened, opened()); }
        if (i % 250 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      out[name] = { badFrames, example };
    }
    // up a tower: stand on floors of the nearest open building, a few floors at a time, then leave it far behind
    const bd = B.list.filter((b) => !b.lot.far && !b.lot.model && b.lot.h > 40).sort((a, b) => Math.hypot(a.cx - pl.x, a.cz - pl.z) - Math.hypot(b.cx - pl.x, b.cz - pl.z))[0];
    const d = bd.lot.door; pl.body3.teleport(d.px + d.nx * 2, 0.5, d.pz + d.nz * 2); for (let i = 0; i < 120; i++) window.__upd(1 / 60);
    bd.plan(); let climbBad = 0, climbOpened = 0;
    for (let k = 1; k < Math.min(bd.levels.length - 1, 14); k += 3) {
      const L = bd.levels[k]; pl.body3.teleport((L.rect.x0 + L.rect.x1) / 2 + 2, L.y + 0.4, (L.rect.z0 + L.rect.z1) / 2 + 2);
      for (let i = 0; i < 90; i++) { window.__upd(1 / 60); if (i % 10 === 0) { if (wrong().length) climbBad++; climbOpened = Math.max(climbOpened, opened()); } }
      await new Promise((r) => setTimeout(r, 0));
    }
    pl.body3.teleport(pl.x + 400, 0.5, pl.z + 400); for (let i = 0; i < 240; i++) window.__upd(1 / 60);
    const m = meshOf(bd.lot), a = m.geometry.attributes.aBuilt, left = [...new Set(bd.levels.map((L) => L.rect))].filter((s) => s.inst != null && (a.getX(s.inst) > 0 || a.getZ(s.inst) > 0)).length;
    out.climb = { building: bd.lot.uid, climbBad, climbOpened, leftAfterLeaving: left, open: bd.open };
    return out;
  });
  const pass = res.walk.badFrames === 0 && res.drive.badFrames === 0 && res.climb.climbBad === 0 && res.climb.climbOpened > 0 && (res.climb.open || res.climb.leftAfterLeaving === 0);
  result('window-interiors', pass, res);
});
