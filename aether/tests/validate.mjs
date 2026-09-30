// M4 validation suite (MAC solver). node tests/validate.mjs [case ...]   cases: uniform cyl6 cyl8 cyl12 cyl8wide sphere (engine default boundary: vf)
// comparison cases: cyl8cut sphere8 (cut-cell only) sphere8vf
// Results -> tests/out/m4/<case>.json. SwiftShader runs are functional/numerical evidence only (not performance).
import fs from 'node:fs'; import path from 'node:path';
import { open } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'tests/out/m4'); fs.mkdirSync(out, { recursive: true });
const cyl = r => { const h = 1 / r, dt = 0.8 * h; return { cfg: { N: [16 * r, 10 * r, 4], min: [-4, -5, 0], max: [12, 5, 4 * h], U: 1, nu: 1 / 200, obstacle: { type: 'cylinder', c: [0, 0, 0], D: 1 }, Aref: 1 * 4 * h, spin: 0.6, spinUntil: 3 }, dt, T: 70, every: Math.max(1, Math.round(0.1 / dt)), probe: [3, 0.5, 2 * h], ref: { St: 0.197, Cd: 1.34, src: '2D Re=200: St 0.19-0.20 (Williamson 1996 / 2D DNS), Cd 1.31-1.40 (Henderson 1995, Braza 1986)' } }; };
const CASES = {
  uniform: { cfg: { N: [64, 16, 16], min: [0, 0, 0], max: [4, 1, 1], U: 1, nu: 1e-4 }, dt: 0.02, T: 3, every: 50 },
  cyl6: cyl(6), cyl8: cyl(8), cyl12: cyl(12), cyl16: cyl(16),
  /* improvement attempt 1: no blockage effect (H = 16D instead of 10D) */
  cyl8wide: (() => { const c = cyl(8); c.cfg = { ...c.cfg, N: [128, 128, 4], min: [-4, -8, 0], max: [12, 8, c.cfg.max[2]] }; return c; })(),
  /* boundary-treatment comparison (cut-cell only vs + volume-fraction forcing) on smaller grids, with the CV momentum balance */
  cyl8cut: (() => { const c = cyl(8); c.cfg = { ...c.cfg, ibm: 'cut' }; return c; })(),
  sphere8: { cfg: { N: [80, 40, 40], min: [-3, -2.5, -2.5], max: [7, 2.5, 2.5], U: 1, nu: 1 / 100, obstacle: { type: 'sphere', c: [0, 0, 0], D: 1 }, Aref: Math.PI / 4, ibm: 'cut' }, dt: 0.1, T: 16, every: 4, chunk: 20, win: 12, ref: { Cd: 1.09, src: 'Re=100 sphere: Cd≈1.09' } },
  sphere8vf: { cfg: { N: [80, 40, 40], min: [-3, -2.5, -2.5], max: [7, 2.5, 2.5], U: 1, nu: 1 / 100, obstacle: { type: 'sphere', c: [0, 0, 0], D: 1 }, Aref: Math.PI / 4, ibm: 'vf' }, dt: 0.1, T: 16, every: 4, chunk: 20, win: 12, ref: { Cd: 1.09, src: 'Re=100 sphere: Cd≈1.09' } },
  sphere: { cfg: { N: [120, 60, 60], min: [-3, -3, -3], max: [9, 3, 3], U: 1, nu: 1 / 100, obstacle: { type: 'sphere', c: [0, 0, 0], D: 1 }, Aref: Math.PI / 4 }, dt: 0.08, T: 20, every: 5, chunk: 10, ref: { Cd: 1.09, src: 'Re=100 sphere: Cd≈1.09 (Clift, Grace & Weber 1978 correlation; Johnson & Patel 1999 1.087)' } }
};
/* period from upward zero crossings of y - mean (linear interpolation): resolution ~ record interval / number of cycles,
   far finer than a DFT over a 30-time-unit window (1/30 = 0.033) */
export function zeroCross(t, y) { const n = y.length, m = y.reduce((a, b) => a + b, 0) / n, z = [];
  for (let i = 1; i < n; i++) { const a = y[i - 1] - m, b = y[i] - m; if (a < 0 && b >= 0) z.push(t[i - 1] + (t[i] - t[i - 1]) * (-a) / (b - a)); }
  if (z.length < 3) return { f: NaN, cycles: 0 }; const per = []; for (let i = 1; i < z.length; i++) per.push(z[i] - z[i - 1]);
  const P = (z[z.length - 1] - z[0]) / (z.length - 1), sd = Math.sqrt(per.reduce((a, p) => a + (p - P) ** 2, 0) / per.length);
  return { f: 1 / P, cycles: z.length - 1, periodStd: sd }; }
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
    res.impl = await page.evaluate(() => __LIVE.impl); res.forceModel = await page.evaluate(() => __MAC.forceModel || 'h/2-v1');
    res.setup = await page.evaluate(c => { Object.assign(__MAC, { solver: 'RBGS', cycles: 5 }); return __LIVE.api.validate(c); }, C.cfg);
    res.solver = 'RBGS-MG x5'; res.ibm = await page.evaluate(() => __MAC.ibm); /* the engine's actual boundary mode (cfg.ibm or the engine default) */
    let cv = null;
    if (C.cfg.obstacle) { const h = C.cfg.N.map((n, d) => (C.cfg.max[d] - C.cfg.min[d]) / n), o = C.cfg.obstacle.c, D = C.cfg.obstacle.D, cell = (x, d) => Math.max(1, Math.min(C.cfg.N[d] - 1, Math.round((x - C.cfg.min[d]) / h[d])));
      const lo = [cell(o[0] - 1.5 * D, 0), cell(o[1] - 1.5 * D, 1), C.cfg.obstacle.type === 'sphere' ? cell(o[2] - 1.5 * D, 2) : 0], hi = [cell(o[0] + 3 * D, 0), cell(o[1] + 1.5 * D, 1), C.cfg.obstacle.type === 'sphere' ? cell(o[2] + 1.5 * D, 2) : C.cfg.N[2]];
      cv = { lo, hi }; res.cvBox = cv; }
    const steps = Math.round(C.T / C.dt), chunk = Math.max(C.every, Math.round((C.chunk || 40) / C.every) * C.every);
    res.rec = []; let ms = 0;
    for (let s = 0; s < steps; s += chunk) {
      const r = await page.evaluate(([n, dt, e, p, b]) => __LIVE.api.vrun(n, dt, e, p, b), [Math.min(chunk, steps - s), C.dt, C.every, C.probe || null, cv]);
      res.rec.push(...r.rec); ms += r.ms;
      const last = r.rec[r.rec.length - 1]; process.stdout.write(`${name} t=${r.time.toFixed(2)} Cd=${last?.Cd?.toFixed(3)} Cl=${last?.Cl?.toFixed(3)}\r`);
      if (r.rec.some(x => !Number.isFinite(x.Fx))) { res.nonFinite = true; break; }
      fs.writeFileSync(path.join(out, name + '.partial.json'), JSON.stringify(res));
    }
    res.msPerStep = ms / steps;
    res.div = await page.evaluate(() => __LIVE.api.divStats());
    res.residual = await page.evaluate(() => __LIVE.api.poisson());
    if (name === 'uniform') res.uniform = await page.evaluate(() => __LIVE.api.uniformError());
    if (C.cfg.obstacle) {
      /* CV body force: F = S - dM/dt (central difference of the box momentum between neighbouring records) */
      for (let i = 1; i < res.rec.length - 1; i++) { const a = res.rec[i - 1], b = res.rec[i], c = res.rec[i + 1]; if (!b.cvS) continue;
        const dM = [0, 1].map(k => (c.cvM[k] - a.cvM[k]) / (c.t - a.t)); b.CdCV = (b.cvS[0] - dM[0]) / b.q; b.ClCV = (b.cvS[1] - dM[1]) / b.q; }
      const t = res.rec.map(r => r.t), tw = C.win ?? (name === 'sphere' ? 0.75 * C.T : 40), W = res.rec.filter(r => r.t >= tw && r.CdCV !== undefined);
      res.window = { from: tw, to: C.T, samples: W.length };
      res.Cd = stats(W.map(r => r.Cd)); res.Cl = stats(W.map(r => r.Cl)); if (W[0] && W[0].Cdp !== undefined) res.Cdp = stats(W.map(r => r.Cdp)); if (W[0] && W[0].CdB !== undefined) res.CdBudget = stats(W.map(r => r.CdB)); if (W[0] && W[0].CdCV !== undefined) res.CdCV = stats(W.map(r => r.CdCV));
      if (name.startsWith('cyl')) { const d = dft(W.map(r => r.t), W.map(r => r.Cl), 0.05, 0.6); const zc = zeroCross(W.map(r => r.t), W.map(r => r.Cl)); res.St = { value: zc.f, cycles: zc.cycles, periodStd: zc.periodStd, from: 'Cl(t) zero crossings' }; res.StDft = { value: d.f, peakToMean: d.peakToMean, from: 'Cl(t) DFT' };
        const dp = dft(W.map(r => r.t), W.map(r => r.pv), 0.05, 0.6); res.StProbe = { value: dp.f, peakToMean: dp.peakToMean, from: 'probe v(t) at x=3D,y=0.5D' }; }
      res.ref = C.ref; void t;
    }
  } catch (e) { res.error = String(e).slice(0, 500); }
  res.pageErrors = log.pageErrors; await browser.close();
  fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(res, null, 1));
  console.log('\n' + JSON.stringify({ name, msPerStep: res.msPerStep, div: res.div && [res.div.relRms, res.div.relMax], resid: res.residual?.rel, uniform: res.uniform, Cd: res.Cd, CdBudget: res.CdBudget, CdCV: res.CdCV, Cl: res.Cl, St: res.St, StProbe: res.StProbe, err: res.error, nonFinite: res.nonFinite }));
}
