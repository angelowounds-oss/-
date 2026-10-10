// render (RND-06): the facade relief (src/relief.js, ledges / piers / cornices / parapets as one instanced mesh) exists, every instance is a
// finite non-degenerate box (a zero-width box gave NaN pixels that bloom spread over the whole frame), a real frame is not black, the
// triangle count stays within budget, and a collapse hides a lot's relief and a rebuild restores it exactly.
const { run, freeze, result } = require('../lib.cjs');
run('facade-relief', { q: 1, width: 480, height: 270 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(() => {
    const g = window.__game, rel = g.world.relief, o = {}; const R = g.eng.render; g.eng.render = () => {};
    o.count = rel && rel.count; if (!rel) return o;
    const a = rel.mat0; let bad = 0, flat = 0;
    for (let i = 0; i < rel.count; i++) {
      for (let c = 0; c < 16; c++) if (!isFinite(a[i * 16 + c])) { bad++; break; }
      const sx = Math.hypot(a[i * 16], a[i * 16 + 1], a[i * 16 + 2]), sy = Math.hypot(a[i * 16 + 4], a[i * 16 + 5], a[i * 16 + 6]), sz = Math.hypot(a[i * 16 + 8], a[i * 16 + 9], a[i * 16 + 10]);
      if (sx < 0.009 || sy < 0.009 || sz < 0.009) flat++;
    }
    o.nonFinite = bad; o.degenerate = flat;
    for (let i = 0; i < 40; i++) window.__upd(1 / 60);
    g.eng.render = R; g.renderFrame(0, true);
    const c = g.eng.renderer.domElement, t = document.createElement('canvas'); t.width = c.width; t.height = c.height; const x = t.getContext('2d'); x.drawImage(c, 0, 0);
    const d = x.getImageData(0, 0, t.width, t.height).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; o.meanLum = Math.round(s / (d.length / 4) / 3);
    g.eng.render = () => {};
    // collapse hides / rebuild restores
    const B = g.blaze, lot = [...rel.ranges.keys()].find((l) => !B.ruins.has(l) && l.h > 40), r = rel.ranges.get(lot), p = rel.mesh.userData.packed, src = p.attrs[0].src;
    const sum = () => { let m = 0; for (let i = r[0]; i < r[1]; i++) for (let c = 0; c < 16; c++) m += Math.abs(src[i * 16 + c]); return m; };
    o.rangeSize = r[1] - r[0]; const before = sum();
    B.collapseNow(lot, null); for (let i = 0; i < 700; i++) window.__upd(1 / 60);
    o.hiddenSum = sum(); B.rebuild(lot); o.restored = Math.abs(sum() - before) < 1e-3;
    return o;
  });
  const pass = o.count > 4000 && o.count < 40000 && o.nonFinite === 0 && o.degenerate === 0 && o.meanLum > 20 && o.rangeSize > 10 && o.hiddenSum === 0 && o.restored;
  result('facade-relief', pass, o);
});
