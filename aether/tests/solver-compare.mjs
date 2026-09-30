// M3B: pressure solver comparison on the tunnel (LOW grid, car+fan) with identical right-hand sides,
// plus a 60-step stability run per solver. Times are SwiftShader wall-clock: RELATIVE ONLY, not performance evidence.
import fs from 'node:fs'; import path from 'node:path';
import { open, table } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'tests/out/m3'); fs.mkdirSync(out, { recursive: true });
const { browser, page, log } = await open('file://' + path.join(root, 'dist/aether.html') + '#q=LOW', { width: 480, height: 270 });
const R = {};
try {
  await page.waitForFunction(() => window.__LIVE && (window.__LIVE.ok || window.__LIVE.err), null, { timeout: 240000 });
  R.impl = await page.evaluate(() => { __LIVE.api.set({ freeze: true }); return { impl: __LIVE.impl, macErr: __LIVE.macErr }; });
  // develop the flow with MGPCG
  await page.evaluate(() => { __MAC.solver = 'MGPCG'; __LIVE.api.reset(); __LIVE.api.run(40, 0.02); });
  const list = [
    { solver: 'JACOBI', jacobiIters: 32 }, { solver: 'JACOBI', jacobiIters: 128 },
    { solver: 'GMG', cycles: 1 }, { solver: 'GMG', cycles: 2 }, { solver: 'GMG', cycles: 4 },
    { solver: 'RBGS', cycles: 1 }, { solver: 'RBGS', cycles: 2 }, { solver: 'RBGS', cycles: 4 },
    { solver: 'MGPCG', pcgIters: 1 }, { solver: 'MGPCG', pcgIters: 2 }, { solver: 'MGPCG', pcgIters: 4 }, { solver: 'MGPCG', pcgIters: 8 }];
  R.cold = await page.evaluate(l => __LIVE.api.solveBench(l), list);
  R.mem = await page.evaluate(() => __LIVE.api.memBreakdown());
  // stability: 60 steps from rest per solver config (warm start each step), divergence + residual at end
  R.stability = [];
  for (const c of [{ solver: 'GMG', cycles: 2 }, { solver: 'RBGS', cycles: 2 }, { solver: 'MGPCG', pcgIters: 4 }, { solver: 'MGPCG', pcgIters: 2 }]) {
    const r = await page.evaluate(c2 => { Object.assign(__MAC, c2); __LIVE.api.reset(); const t0 = performance.now(); __LIVE.api.run(60, 0.02); const ms = (performance.now() - t0) / 60; const d = __LIVE.api.divStats(), p = __LIVE.api.poisson(), w = __LIVE.api.read(3, .6, 0), u = __LIVE.api.read(-3.5, 2.8, 2.8); return { ...c2, msPerStep: ms, divRelRms: d.relRms, divRelMax: d.relMax, nonFinite: d.nonFinite + p.nonFinite, resRel: p.rel, upstream: u[0], wakeX: w[0] }; }, c);
    R.stability.push(r); console.log(JSON.stringify(r));
  }
} catch (e) { R.error = String(e).slice(0, 500); }
R.pageErrors = log.pageErrors; await browser.close();
fs.writeFileSync(path.join(out, 'solver-compare.json'), JSON.stringify(R, null, 1));
const f = x => (typeof x === 'number' ? (Math.abs(x) < 1e-2 || Math.abs(x) >= 1e4 ? x.toExponential(2) : x.toFixed(3)) : x);
if (R.cold) fs.writeFileSync(path.join(out, 'solver-compare.md'), '### 같은 RHS, 0에서 시작 (1회 solve)\n\n' + table(R.cold.map(c => ({ solver: c.solver, param: c.jacobiIters ?? c.cycles ?? c.pcgIters, 'ms(SwiftShader 상대)': f(c.ms), '상대잔차': f(c.rel), 'NaN': c.nonFinite }))) +
  '\n\n### 60스텝 안정성 (웜스타트)\n\n' + table((R.stability || []).map(c => ({ solver: c.solver, param: c.cycles ?? c.pcgIters, 'ms/step': f(c.msPerStep), 'div RMS': f(c.divRelRms), 'div max': f(c.divRelMax), '잔차': f(c.resRel), 'NaN': c.nonFinite, '상류 u': f(c.upstream) }))) + '\n\n메모리(계산): ' + JSON.stringify(R.mem) + '\n');
console.log(fs.readFileSync(path.join(out, 'solver-compare.md'), 'utf8'));
