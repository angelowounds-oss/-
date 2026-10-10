// render (RND-08): the LOW tier is the extreme low-end mode: 45 % render resolution, no post-processing (straight to the screen), simplified
// facades, no relief / skyline blocks, view distance 520 m, no dynamic scaling. A real frame is not black and still carries the neon look
// (lit windows, bright signs/lamps), and nothing compiles during play. MEDIUM is unchanged (full resolution, relief, far plane 2600).
const { run, freeze, result } = require('../lib.cjs');
run('low-tier', { q: 0, width: 640, height: 360 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(() => {
    const g = window.__game, eng = g.eng, r = eng.renderer, o = {}; const R = eng.render; eng.render = () => {};
    o.tier = eng.q.name; o.pixelRatio = +r.getPixelRatio().toFixed(2); o.canvasW = r.domElement.width; o.cssW = innerWidth;
    o.far = g.camera.far; o.reliefVisible = !!(g.world.relief && g.world.relief.mesh.visible); o.noScale = !!eng.q.noScale; o.post = eng.q.post;
    const lum = (label) => {
      g.sandbox.setHour(22); for (let i = 0; i < 40; i++) window.__upd(1 / 60);
      eng.render = R; g.renderFrame(0, true); eng.render = () => {};
      const c = r.domElement, t = document.createElement('canvas'); t.width = c.width; t.height = c.height; const x = t.getContext('2d'); x.drawImage(c, 0, 0);
      const d = x.getImageData(0, 0, t.width, t.height).data; let mean = 0, bright = 0, n = d.length / 4;
      for (let i = 0; i < d.length; i += 4) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3; mean += v; if (v > 200) bright++; }
      return { mean: Math.round(mean / n), brightPct: +(bright / n * 100).toFixed(2) };
    };
    Object.assign(o, lum());
    const p0 = r.info.programs.length; for (let i = 0; i < 600; i++) window.__upd(1 / 60); eng.render = R; g.renderFrame(0, true); eng.render = () => {};
    o.newPrograms = r.info.programs.length - p0;
    // the dynamic-resolution logic leaves LOW alone
    const before = eng.scale; g.aq = null; g.workMs = 100; for (let i = 0; i < 400; i++) g.autoQuality(1 / 10); o.scaleKept = eng.scale === before && eng.qIndex === 0;
    // switching to MEDIUM restores everything
    eng.setQuality(1); o.mediumFar = g.camera.far; o.mediumRelief = !!g.world.relief.mesh.visible; o.mediumPR = +r.getPixelRatio().toFixed(2);
    eng.setQuality(0); o.backToLow = g.camera.far === 520 && !g.world.relief.mesh.visible;
    return o;
  });
  const pass = o.tier === 'LOW' && o.pixelRatio <= 0.46 && o.canvasW < o.cssW * 0.5 && o.far === 520 && !o.reliefVisible && o.noScale && o.post === false
    && o.mean > 10 && o.brightPct > 0.05 && o.newPrograms === 0 && o.scaleKept && o.mediumFar === 2600 && o.mediumRelief && o.mediumPR === 1 && o.backToLow;
  result('low-tier', pass, o);
});
