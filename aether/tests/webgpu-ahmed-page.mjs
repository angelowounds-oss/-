// CFD V3 P3 check of dist/AETHER_CFD_AHMED_GPU.html in headless WebGPU (SwiftShader): the built page (modules behind an import map) runs the Ahmed case
// at H/12 for a fraction of L/U and its drag history matches the CPU reference (refine.mjs with the same bench/ahmed-case.mjs options).
// Speed here is a CPU emulation and means nothing about a real GPU. Pass: drag and lift of every sample within 1e-3 of the largest |Cd| of the run
// (a per-sample ratio is ill-conditioned where the start-up drag crosses zero; f32 against f64 in an LES drifts apart with time, so the run is short),
// page finished without errors, the copy button shown, the region breakdown sums to the mean drag within 1e-3.
// node tests/webgpu-ahmed-page.mjs   env: T (L/U, 0.4)
import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { CHROME } from './lib.mjs';
import { createRefined } from '../tools/solver2/refine.mjs';
import { ahmedCase } from '../tools/solver2/bench/ahmed-case.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'), nH = 12, T = +(process.env.T || .4);
// CPU reference with the page's defaults (Smagorinsky 0.15, hybrid regularization 0.9, wall model with a 400-step filter)
const c = ahmedCase(nH, { cs: .15, hrr: .9, wallModel: { filter: 400 } }), S = createRefined({ ...c.o, threads: 4 }), every = Math.max(1, Math.round(c.stepsPerLU / 8)), maxSteps = Math.round(T * c.stepsPerLU), cpu = [];
const t0 = Date.now(); while (S.step < maxSteps) { S.advance(Math.min(every, maxSteps - S.step)); const F = S.force; cpu.push({ Cd: 2 * F[0] / (c.Ul * c.Ul * c.A), Cl: 2 * F[1] / (c.Ul * c.Ul * c.A) }); } const cpuS = (Date.now() - t0) / 1000; await S.close();
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--allow-file-access-from-files', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let res, txt, copyShown, errs = [];
try {
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } }); p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`file://${path.join(root, 'dist/AETHER_CFD_AHMED_GPU.html')}#nH=${nH}&T=${T}`); await p.waitForFunction(() => !document.getElementById('go').disabled, null, { timeout: 60000 }); await p.click('#go');
  await p.waitForFunction(() => window.__ahmed.result || /오류/.test(document.getElementById('st').textContent), null, { timeout: 1800000 });
  res = await p.evaluate(() => window.__ahmed.result); txt = await p.$eval('#st', e => e.textContent); copyShown = await p.$eval('#cp', b => !b.hidden);
} finally { await browser.close(); }
let maxRel = Infinity; if (res) { maxRel = 0; const s = Math.max(...cpu.map(r => Math.abs(r.Cd))); res.hist.forEach((h, i) => { const r = cpu[i]; maxRel = Math.max(maxRel, Math.abs(h.Cd - r.Cd) / s, Math.abs(h.Cl - r.Cl) / s); }); }
const regSum = res && res.CdBreakdown ? Object.values(res.CdBreakdown).reduce((a, b) => a + b, 0) : NaN;
const ok = !!res && res.hist.length === cpu.length && maxRel < 1e-3 && copyShown && errs.length === 0 && Math.abs(regSum - res.CdMean) < 1e-3 && !!res.wall;
console.log(JSON.stringify({ status: txt, samples: res && res.hist.length, cpuSamples: cpu.length, maxRelDiff: +maxRel.toExponential(2), gpu: res && res.hist.map(h => h.Cd), cpu: cpu.map(h => +h.Cd.toFixed(5)),
  CdMean: res && res.CdMean, breakdownSum: +regSum.toFixed(4), breakdown: res && res.CdBreakdown, cells: res && res.cells, gpuMB: res && +(res.gpuBytes / 2 ** 20).toFixed(1), setupS: res && res.setupS, gpuRunS: res && res.runS, cpuS, wall: res && res.wall, copyShown, errors: errs.slice(0, 3) }));
console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
