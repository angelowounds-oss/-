// Device performance overlay (EV-92): F3 shows it, frames fill it, it reports frame time, CPU per stage, GPU per pass (when the browser has
// timer queries; in this container the software GPU may not), draw calls and memory; Shift+F3's snapshot is valid JSON with the machine in it.
// F3 again hides it and the renderer counts per call again (autoReset back on).
const { run, freeze, result } = require('../lib.cjs');
run('perf-overlay', { q: 1, width: 640, height: 360 }, async ({ page }) => {
  await freeze(page);
  // measured on a highway out of the dense centre: the spawn's streaming over the capital stalls the software-GPU container (docs/backlog/EV.md, EV-91)
  await page.evaluate(() => { const r = window.__game.highways.N.roads.find((q) => q.kind !== 'arterial' && q.x.length > 40), i = r.x.length >> 1; window.__test.teleport(r.x[i], r.z[i], r.y[i] + 1.5); });
  await page.keyboard.press('F3');
  const o = await page.evaluate(async () => {
    const T = window.__test, el = document.getElementById('perfov');
    for (let i = 0; i < 150; i++) { window.__upd(1 / 60); if (i % 2) await new Promise((f) => setTimeout(f, 0)); }
    const p = T.perf(), shown = el && getComputedStyle(el).display !== 'none';
    window.__game.perfOv.toggle(false);
    return { shown, text: p.text, snap: p.snapshot, offAuto: window.__game.eng.renderer.info.autoReset, offShown: getComputedStyle(el).display !== 'none' };
  });
  const s = o.snap.stats, bad = [];
  if (!o.shown) bad.push('F3 did not show the overlay');
  if (!o.text.includes('fps')) bad.push('no report text after 150 frames');
  if (!(s.frames > 0 && s.frameMs.avg > 0)) bad.push('no frame times');
  for (const k of ['플레이어', '차량', '사람', '렌더']) if (!(k in s.cpuMs)) bad.push('no CPU time for stage ' + k);
  if (!(s.drawCalls > 0 && s.triangles > 0)) bad.push(`draw calls ${s.drawCalls} triangles ${s.triangles}`);
  if (s.gpuMs && !(s.gpuTotalMs > 0)) bad.push('GPU timer present but no time');
  if (!o.snap.device || !o.snap.device.gpu) bad.push('snapshot has no device');
  try { JSON.parse(JSON.stringify(o.snap)); } catch (e) { bad.push('snapshot not JSON'); }
  if (o.offShown || !o.offAuto) bad.push('turning it off left it shown or the renderer summing');
  result('perf-overlay', bad.length === 0, { stats: s, gpu: o.snap.device.gpu, text: o.text }, bad.join(' | '));
});
