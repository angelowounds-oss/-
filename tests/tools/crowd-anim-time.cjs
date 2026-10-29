// Tool (not a test): JS time of Human.animateSkinned for 120 people within 35 m of the camera (render off): 40 walking, 40 aimed and moving
// every way, 40 running, each going round a 4 m circle on the ground (the feet are held and put on it since CHR-06c); median of five 60-frame
// runs. Against an older build: GAME_DIR=<old build>/game node tests/tools/crowd-anim-time.cjs
const { run, freeze } = require('../lib.cjs');
run('perf-crowd', { q: 1, width: 320, height: 200 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(() => {
    const g = window.__game, pl = g.player, H = pl.constructor; g.eng.render = () => {};
    H.camX = pl.x; H.camZ = pl.z;
    const hs = [];
    for (let i = 0; i < 120; i++) {
      const h = new H(g, i < 40 ? 'civ' : 'gang', { hp: 60, weapon: i >= 40 && i < 80 ? 1 + (i % 2) : 0, look: { top: 0x335577 } });
      h.x = pl.x + (i % 12) * 2 - 12; h.z = pl.z + ((i / 12) | 0) * 2 - 10; h.ry = 0; h.y = pl.y; hs.push(h);
    }
    const dt = 1 / 60;
    let n = 0;
    const frame = () => { n++; for (let i = 0; i < hs.length; i++) { const h = hs[i], kind = i < 40 ? 0 : i < 80 ? 1 : 2;
      const sp = kind === 0 ? 1.5 : kind === 1 ? 2.6 : 5.2, dir = (kind === 1 ? i * 0.7 : i * 0.3) + (n * dt * sp) / 4;
      h.vx = Math.sin(dir) * sp; h.vz = Math.cos(dir) * sp; h.x += h.vx * dt; h.z += h.vz * dt; h.speed = sp; h.ry = kind === 1 ? i * 0.2 : dir; if (kind === 1) { h.aimT = 1; h.forceAim = true; }
      h.animateSkinned(dt); } };
    for (let f = 0; f < 60; f++) frame();
    const t = [];
    for (let r = 0; r < 5; r++) { const t0 = performance.now(); for (let f = 0; f < 60; f++) frame(); t.push((performance.now() - t0) / 60); }
    t.sort((a, b) => a - b);
    return { msPerFrame120: +t[2].toFixed(3), runs: t.map((v) => +v.toFixed(3)) };
  });
  console.log(JSON.stringify(o));
});
