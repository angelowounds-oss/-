// perf/feel: physics runs at a fixed 60 Hz; bodies are drawn between steps (Physics.alpha). On a 144 Hz display every moving car must
// advance by about speed x dt each displayed frame (not stand still on half the frames and jump two steps on the others).
const { run, freeze, result } = require('../lib.cjs');
run('physics-interp', { q: 1, width: 320, height: 180 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, upd = window.__upd; g.eng.render = () => {};
    for (let i = 0; i < 120; i++) upd(1 / 60);
    const tr = new Map(), dt = 1 / 144;
    for (let i = 0; i < 600; i++) {
      upd(dt);
      for (const v of g.vehicles) { if (v.dead || !v.pv || v.speed < 4) continue; let e = tr.get(v); if (!e) tr.set(v, e = []); e.push({ i, sp: v.speed, gx: v.group.position.x, gz: v.group.position.z, px: v.x, pz: v.z }); }
    }
    const drawn = [], sim = [];
    for (const e of tr.values()) for (let k = 1; k < e.length; k++) {
      const a = e[k - 1], c = e[k]; if (c.i !== a.i + 1) continue; const want = (a.sp + c.sp) / 2 * dt; if (want < 0.02) continue;
      if (Math.hypot(c.px - a.px, c.pz - a.pz) > 8) continue;   // recycled / teleported traffic
      drawn.push(Math.hypot(c.gx - a.gx, c.gz - a.gz) / want); sim.push(Math.hypot(c.px - a.px, c.pz - a.pz) / want);
    }
    const still = (arr) => arr.filter((x) => x < 0.2).length, med = (arr) => { const s = arr.slice().sort((a, b) => a - b); return +s[s.length >> 1].toFixed(2); };
    return { samples: drawn.length, drawnStillFrames: still(drawn), drawnMedianStep: med(drawn), simulatedStillFrames: still(sim) };
  });
  result('physics-interp', o.samples > 1000 && o.drawnStillFrames <= o.samples * 0.005 && Math.abs(o.drawnMedianStep - 1) < 0.05, o);
});
