// memory: floor geometry buffers come from a pool and go back when a floor is dropped (src/gfx.js takeF32 / poolOnDispose). After a long
// walk that builds and drops many floors, no ArrayBuffer may be shared by two live geometries - beyond the sharing that exists at start
// (glTF models whose meshes are views into one buffer). A reused buffer still in use would corrupt a floor.
const { run, freeze, result } = require('../lib.cjs');
run('pool-integrity', { q: 1, width: 320, height: 180 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, pl = g.player; g.eng.render = () => {};
    const shared = () => {
      const geos = new Set(); g.scene.traverse((q) => { if (q.geometry) geos.add(q.geometry); });
      const owner = new Map(); let dup = 0;
      for (const geo of geos) {
        const bufs = new Set(); for (const k in geo.attributes) { const a = geo.attributes[k], arr = a.array || (a.data && a.data.array); if (arr) bufs.add(arr.buffer); }
        if (geo.index) bufs.add(geo.index.array.buffer);
        for (const bf of bufs) { const ow = owner.get(bf); if (ow && ow !== geo) dup++; else owner.set(bf, geo); }
      }
      return dup;
    };
    const start = shared(); let x = pl.x, z = pl.z, dir = 0, worst = start, floorsBuilt = 0; const wp = [[0, 1], [1, 0], [0, -1], [-1, 0]];
    const seen = new Set();
    for (let i = 0; i < 4000; i++) {
      if (i % 400 === 0) dir = (dir + 1) % 4; x += wp[dir][0] * 9 / 60; z += wp[dir][1] * 9 / 60; pl.body3.teleport(x, pl.y, z); pl.x = x; pl.z = z; window.__upd(1 / 60);
      if (i % 500 === 499) { worst = Math.max(worst, shared()); for (const b of g.buildings.active) for (const [k] of b.floors) seen.add(b.id + ':' + k); }
      if (i % 250 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    floorsBuilt = seen.size;
    return { sharedAtStart: start, worstSharedDuringWalk: worst, distinctFloorsSeen: floorsBuilt };
  });
  result('pool-integrity', o.worstSharedDuringWalk === o.sharedAtStart && o.distinctFloorsSeen >= 8, o);
});
