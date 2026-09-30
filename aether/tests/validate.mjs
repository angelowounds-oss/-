// M4 validation suite (MAC solver). node tests/validate.mjs [case ...]   cases: uniform cyl8 cyl12 cyl16 sphere
// Results -> tests/out/m4/<case>.json. SwiftShader runs are functional/numerical evidence only (not performance).
import fs from 'node:fs'; import path from 'node:path';
import { open } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'tests/out/m4'); fs.mkdirSync(out, { recursive: true });
const cyl = r => { const h = 1 / r, dt = 0.8 * h; return { cfg: { N: [16 * r, 10 * r, 4], min: [-4, -5, 0], max: [12, 5, 4 * h], U: 1, nu: 1 / 200, obstacle: { type: 'cylinder', c: [0, 0, 0], D: 1 }, Aref: 1 * 4 * h, spin: 0.6, spinUntil: 3 }, dt, T: 70, every: Math.max(1, Math.round(0.1 / dt)), probe: [3, 0.5, 2 * h], ref: { St: 0.197, Cd: 1.34, src: '2D Re=200: St 0.19-0.20 (Williamson 1996 / 2D DNS), Cd 1.31-1.40 (Henderson 1995, Braza 1986)' } }; };
const CASES = {
  uniform: { cfg: { N: [64, 16, 16], min: [0, 0, 0], max: [4, 1, 1], U: 1, nu: 1e-4 }, dt: 0.02, T: 3, every: 50 },
  cyl8: cyl(8), cyl12: cyl(12), cyl16: cyl(16),
  sphere: { cfg: { N: [120, 60, 60], min: [-3, -3, -3], max: [9, 3, 3], U: 1, nu: 1 / 100, obstacle: { type: 'sphere', c: [0, 0, 0], D: 1 }, Aref: Math.PI / 4 }, dt: 0.08, T: 20, every: 5, ref: { Cd: 1.09, src: 'Re=100 sphere: Cd≈1.09 (Clift, Grace & Weber 1978 correlation; Johnson & Patel 1999 1.087)' } }
};
function dft(t, y, fmin, fmax) { const n = y.length, m = y.reduce((a, b) => a + b, 0) / n, dtm = (t[n - 1] - t[0]) / (n - 1); let best = [0, 0]; const spec = [];
  for (let f = fmin; f <= fmax; f += 0.0025) { let re = 0, im = 0; for (let i = 0; i < n; i++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)), a = 2 * Math.PI * f * i * dtm; re += (y[i] - m) * w * Math.cos(a); im -= (y[i] - m) * w * Math.sin(a); } const A = Math.hypot(re, im); spec.push([f, A]); if (A > best[1]) best = [f, A]; }
  const mean = spec.reduce((a, s) => a + s[1], 0) / spec.length; return { f: best[0], peakToMean: best[1] / mean }; }
const stats = a => { const n = a.length, m = a.reduce((x, y) => x + y, 0) / n; return { mean: m, std: Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / n), n }; };
const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CASES);
for (const name of names) {
  const C = CASES[name], res = { case: name, cfg: C.cfg, dt: C.dt, T: C.T, time: new Date().toISOString() };
  const { browser, page, log } = await open('file://' + path.join(root, 'dist/aether.html') + '#q=LOW', { width: 160, height: 90 });
  try {
    await page.waitForFunction(() => window.__LIVE && (window.__LIVE.ok || window.__LIVE.err), null, { timeout: 240000 });
    res.impl = await page.evaluate(() => __LIVE.impl);
    res.setup = await page.evaluate(c => { Object.assign(__MAC, { solver: 'RBGS', cycles: 3 }); return __LIVE.api.validate(c); }, C.cfg);
    res.solver = 'RBGS-MG x3';
    const steps = Math.round(C.T / C.dt), chunk = Math.max(C.every, Math.round(40 / C.every) * C.every);
    res.rec = []; let ms = 0;
    for (let s = 0; s < steps; s += chunk) {
      const r = await page.evaluate(([n, dt, e, p]) => __LIVE.api.vrun(n, dt, e, p), [Math.min(chunk, steps - s), C.dt, C.every, C.probe || null]);
      res.rec.push(...r.rec); ms += r.ms;
      const last = r.rec[r.rec.length - 1]; process.stdout.write(`${name} t=${r.time.toFixed(2)} Cd=${last?.Cd?.toFixed(3)} Cl=${last?.Cl?.toFixed(3)}\r`);
      if (r.rec.some(x => !Number.isFinite(x.Fx))) { res.nonFinite = true; break; }
    }
    res.msPerStep = ms / steps;
    res.div = await page.evaluate(() => __LIVE.api.divStats());
    res.residual = await page.evaluate(() => __LIVE.api.poisson());
    if (name === 'uniform') res.uniform = await page.evaluate(() => __LIVE.api.uniformError());
    if (C.cfg.obstacle) {
      const t = res.rec.map(r => r.t), tw = name === 'sphere' ? 0.75 * C.T : 40, W = res.rec.filter(r => r.t >= tw);
      res.window = { from: tw, to: C.T, samples: W.length };
      res.Cd = stats(W.map(r => r.Cd)); res.Cl = stats(W.map(r => r.Cl));
      if (name.startsWith('cyl')) { const d = dft(W.map(r => r.t), W.map(r => r.Cl), 0.05, 0.6); res.St = { value: d.f * 1 / 1, peakToMean: d.peakToMean, from: 'Cl(t) DFT' };
        const dp = dft(W.map(r => r.t), W.map(r => r.pv), 0.05, 0.6); res.StProbe = { value: dp.f, peakToMean: dp.peakToMean, from: 'probe v(t) at x=3D,y=0.5D' }; }
      res.ref = C.ref; void t;
    }
  } catch (e) { res.error = String(e).slice(0, 500); }
  res.pageErrors = log.pageErrors; await browser.close();
  fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(res, null, 1));
  console.log('\n' + JSON.stringify({ name, msPerStep: res.msPerStep, div: res.div && [res.div.relRms, res.div.relMax], resid: res.residual?.rel, uniform: res.uniform, Cd: res.Cd, Cl: res.Cl, St: res.St, StProbe: res.StProbe, err: res.error, nonFinite: res.nonFinite }));
}
