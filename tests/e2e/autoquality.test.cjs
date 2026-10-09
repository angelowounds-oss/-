// logic: dynamic resolution (Game.autoQuality) with a scripted clock. A bad moment at 30 fps lowers the scale; light frames at a vsync-capped
// 60 Hz must bring it back to 1.0; when the GPU cannot hold the higher scale, each failed step up doubles the wait (up to 60 s).
const { run, freeze, result } = require('../lib.cjs');
run('autoquality', { q: 2, width: 320, height: 180 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(() => {
    const g = window.__game, eng = g.eng, AQ = Object.getPrototypeOf(g).autoQuality;
    let T = performance.now(); const realNow = performance.now.bind(performance); performance.now = () => T;
    const setScale = eng.setScale; eng.setScale = (s) => { eng.scale = Math.max(0.7, Math.min(1, s)); };
    try {
      g.aq = null; AQ.call(g, 0);
      const feed = (sec, interval, workMs) => { for (let t = 0; t < sec; t += interval) { T += interval * 1000; g.workMs = workMs; AQ.call(g, interval); } };
      feed(5, 1 / 60, 6); feed(2, 1 / 30, 10);
      const afterBadMoment = eng.scale;
      feed(40, 1 / 60, 6);
      const recovered = eng.scale;
      eng.scale = 0.8; g.aq.wait = 6; let ups = 0;
      for (let t = 0; t < 150; t += 1 / 60) { const iv = eng.scale > 0.85 ? 1 / 30 : 1 / 60; const s0 = eng.scale; T += iv * 1000; g.workMs = 6; AQ.call(g, iv); if (eng.scale > s0) ups++; }
      return { afterBadMoment, recovered, gpuBoundTriesIn150s: ups, finalWait: g.aq.wait };
    } finally { performance.now = realNow; eng.setScale = setScale; }
  });
  result('autoquality', o.afterBadMoment < 1 && o.recovered === 1 && o.finalWait >= 48 && o.gpuBoundTriesIn150s <= 6, o);
});
