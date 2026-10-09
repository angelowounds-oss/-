// gameplay/render: a building's glazed entrance may only open (show the lobby behind it) once the lobby floor exists. Walking (7 m/s)
// and driving (25 m/s) through the grid, no entrance within 58 m may be open in front of an unbuilt lobby in any frame.
const { run, freeze, result } = require('../lib.cjs');
run('entrance-holes', { q: 1, width: 640, height: 400 }, async ({ page }) => {
  await freeze(page);
  const res = await page.evaluate(async () => {
    const g = window.__game, B = g.buildings, pl = g.player; g.eng.render = () => {};
    const flag = (b) => { const r = (b.lot.doorRefs || [])[0]; return r ? r.attr.getW(r.start) : -1; };
    const holes = (px, pz) => B.list.filter((b) => Math.hypot(b.door.px - px, b.door.pz - pz) < 58 && flag(b) === 1 && !(b.open && b.floors.has(0)));
    const out = {};
    for (const [name, sp] of [['walk', 7], ['drive', 25]]) {
      let x = pl.x, z = pl.z, dir = 0, holeFrames = 0, example = null; const wp = [[0, 1], [1, 0], [0, -1], [-1, 0]];
      for (let i = 0; i < 1500; i++) {
        if (i % 300 === 0) dir = (dir + 1) % 4; x += wp[dir][0] * sp / 60; z += wp[dir][1] * sp / 60; pl.body3.teleport(x, pl.y, z); pl.x = x; pl.z = z; window.__upd(1 / 60);
        const h = holes(pl.x, pl.z); if (h.length) { holeFrames++; if (!example) example = { frame: i, building: h[0].name }; }
        if (i % 250 === 0) await new Promise((r) => setTimeout(r, 0));
      }
      out[name] = { holeFrames, example };
    }
    return out;
  });
  result('entrance-holes', res.walk.holeFrames === 0 && res.drive.holeFrames === 0, res);
});
