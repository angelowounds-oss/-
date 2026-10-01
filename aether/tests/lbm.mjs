// M7: LBM D3Q19 (TRT) cylinder Re=200, same domain as the MAC validation (16D x 10D, cylinder at x=4D, y=5D).
// needs a build with the optional LBM module:  node tools/build.mjs --with=lbm --out=dist/aether-lbm.html
// node tests/lbm.mjs [Dl] [modes...]   e.g. node tests/lbm.mjs 8 FP32 FP16 MIXED
import fs from 'node:fs'; import path from 'node:path';
import { open } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'tests/out/m7'); fs.mkdirSync(out, { recursive: true });
const Cs = +(process.env.CS || 0), coll = process.env.COLL || 'REG', Dl = +(process.argv[2] || 8), modes = process.argv.slice(3).length ? process.argv.slice(3) : ['FP32', 'FP16', 'MIXED'];
const Ul = 0.06, T = 70, every = Math.max(1, Math.round(0.1 * Dl / Ul)), total = Math.round(T * Dl / Ul);
function dft(t, y, fmin, fmax) { const n = y.length, m = y.reduce((a, b) => a + b, 0) / n, dtm = (t[n - 1] - t[0]) / (n - 1); let best = [0, 0]; const sp = [];
  for (let f = fmin; f <= fmax; f += 0.0025) { let re = 0, im = 0; for (let i = 0; i < n; i++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)), a = 2 * Math.PI * f * i * dtm; re += (y[i] - m) * w * Math.cos(a); im -= (y[i] - m) * w * Math.sin(a); } const A = Math.hypot(re, im); sp.push(A); if (A > best[1]) best = [f, A]; }
  return { f: best[0], peakToMean: best[1] / (sp.reduce((a, b) => a + b, 0) / sp.length) }; }
const stats = a => { const n = a.length, m = a.reduce((x, y) => x + y, 0) / n; return { mean: m, std: Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / n), n }; };
for (const mode of modes) {
  const res = { mode, coll, Dl, Ul, Cs, Re: 200, T, total, every, time: new Date().toISOString() };
  const { browser, page, log } = await open('file://' + path.join(root, 'dist/aether-lbm.html') + '#q=LOW', { width: 160, height: 90 });
  try {
    await page.waitForFunction(() => window.__LIVE && (window.__LIVE.ok || window.__LIVE.err), null, { timeout: 240000 });
    res.setup = await page.evaluate(c => __LIVE.api.lbmSetup(c), { N: [16 * Dl, 10 * Dl, 4], Dl, c: [4 * Dl, 5 * Dl], Re: 200, Ul, mode, Cs, coll });
    if (!res.setup.ok) throw Error(res.setup.err);
    res.rec = []; let ms = 0; const chunk = every * 40;
    for (let s = 0; s < total; s += chunk) { const r = await page.evaluate(([n, e]) => __LIVE.api.lbmRun(n, e), [Math.min(chunk, total - s), every]); res.rec.push(...r.rec); ms += r.ms;
      const l = r.rec[r.rec.length - 1]; process.stdout.write(`${mode} t*=${l.tStar.toFixed(1)} Cd=${l.Cd.toFixed(3)} Cl=${l.Cl.toFixed(3)}\r`); if (!Number.isFinite(l.Cd)) { res.nonFinite = true; break; } }
    res.msPerStep = ms / total;
    const W = res.rec.filter(r => r.tStar >= 40 && Number.isFinite(r.Cd));
    if (W.length > 20) { res.Cd = stats(W.map(r => r.Cd)); res.Cl = stats(W.map(r => r.Cl)); res.St = dft(W.map(r => r.tStar), W.map(r => r.Cl), 0.05, 0.6); }
  } catch (e) { res.error = String(e).slice(0, 400); }
  res.pageErrors = log.pageErrors; await browser.close();
  fs.writeFileSync(path.join(out, `lbm-D${Dl}-${mode}${coll === 'TRT' ? '-trt' : ''}${Cs ? '-les' : ''}.json`), JSON.stringify(res, null, 1));
  console.log('\n' + JSON.stringify({ mode, msPerStep: res.msPerStep, setup: res.setup, Cd: res.Cd, Cl: res.Cl, St: res.St, err: res.error, nonFinite: res.nonFinite }));
}
