// CFD V3 P3 check: the WebGPU nested-refinement solver (tools/solver2/gpu/refine-webgpu.mjs, f32) reproduces the CPU reference (tools/solver2/refine.mjs, f64).
// The page builds the topology itself (createRefined with topologyOnly, the browser path), starts from the free stream on the GPU and runs the
// same number of coarse steps as the CPU run in Node (tests/lib-refine-cases.mjs: one level; three levels with slip faces, hybrid regularization and
// the wall model; three levels with a moving floor and slip side walls). Headless Chromium, SwiftShader Vulkan adapter (correctness only).
// Pass (each case, plan P3): relative L2 of the populations over active fluid cells of every level < 1e-3, drag within 1e-3 relative, total mass
// of the GPU state within 1e-6 of the CPU state (inlet and outlet make the system open, so both change), no device errors.
// node tests/webgpu-refine.mjs [case ...]   env: STEPS (coarse steps, 20)
import fs from 'node:fs'; import http from 'node:http'; import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { CHROME } from './lib.mjs';
import { createRefined } from '../tools/solver2/refine.mjs';
import { CASES } from './lib-refine-cases.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'), steps = +(process.env.STEPS || 20), names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(CASES);
const server = http.createServer((req, res) => { const f = path.join(root, decodeURIComponent(req.url.split('?')[0])); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': f.endsWith('.mjs') || f.endsWith('.js') ? 'text/javascript' : 'text/html' }); fs.createReadStream(f).pipe(res); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let allOk = true; const results = {};
try {
  const page = await browser.newPage(); const logs = []; page.on('console', m => logs.push(m.text())); page.on('pageerror', e => logs.push('pageerror ' + e.message));
  await page.goto(base + '/tests/lib.mjs'); // any same-origin document
  for (const name of names) {
    const o = CASES[name](), t0 = Date.now(), S = createRefined({ ...o, threads: 1 }), m0 = S.mass(); S.advance(steps); const cpuMs = Date.now() - t0;
    const res = await page.evaluate(async ({ name, steps }) => {
      const { createRefined } = await import('/tools/solver2/refine.mjs'), { createRefineGpu } = await import('/tools/solver2/gpu/refine-webgpu.mjs'), { CASES } = await import('/tests/lib-refine-cases.mjs');
      const a = await navigator.gpu.requestAdapter(), dev = await a.requestDevice({ requiredLimits: { maxStorageBufferBindingSize: a.limits.maxStorageBufferBindingSize, maxStorageBuffersPerShaderStage: Math.min(10, a.limits.maxStorageBuffersPerShaderStage) } }), errs = [];
      dev.addEventListener('uncapturederror', e => errs.push(String(e.error.message)));
      const o = CASES[name](), T = createRefined({ ...o, topologyOnly: true }), G = await createRefineGpu(dev, T, o);
      G.init(); const t = performance.now(); G.advance(steps); await G.finish(); const ms = performance.now() - t;
      const lv = []; for (let l = 0; l < T.levels.length; l++) lv.push(Array.from(await G.readLevelF(l)));
      return { lv, force: await G.force(), wall: await G.wall(), ms, errs };
    }, { name, steps });
    // compare populations over active fluid cells, per level; mass of the GPU state before / after (the initial GPU state is the CPU initial state)
    let e2 = 0, a2 = 0, maxD = 0, mG = 0; const perLevel = [];
    S.levels.forEach((L, l) => { let le = 0, la = 0; const g = res.lv[l];
      for (let n = 0; n < L.N; n++) { if (L.mask[n] !== 0 || L.solid[n]) continue; let r = 0;
        for (let q = 0; q < 19; q++) { const c = L.f[q * L.N + n], d = g[q * L.N + n] - c; le += d * d; la += c * c; maxD = Math.max(maxD, Math.abs(d)); r += g[q * L.N + n]; } mG += r * L.vol; }
      e2 += le; a2 += la; perLevel.push(+Math.sqrt(le / la).toExponential(2)); });
    const relL2 = Math.sqrt(e2 / a2), F = S.force, fRel = Math.abs(res.force[0] - F[0]) / Math.abs(F[0]), mC = S.mass(), mRel = Math.abs(mG / mC - 1);
    const ok = relL2 < 1e-3 && fRel < 1e-3 && mRel < 1e-6 && res.errs.length === 0; allOk = allOk && ok;
    results[name] = { ok, levels: S.levels.length, cells: S.cells(), relL2: +relL2.toExponential(3), perLevel, maxAbsDiff: +maxD.toExponential(2), dragCpu: +F[0].toExponential(5), dragGpu: +res.force[0].toExponential(5),
      dragRelDiff: +fRel.toExponential(2), massGpuVsCpu: +mRel.toExponential(2), cpuMassChange: +Math.abs(mC / m0 - 1).toExponential(2), wallCpu: S.wall(), wallGpu: res.wall, cpuMs, gpuMs: Math.round(res.ms), deviceErrors: res.errs };
    console.log(name, JSON.stringify(results[name]));
    await S.close();
  }
  const shown = logs.filter(l => !/favicon|404/.test(l)); if (shown.length) console.log('page log:', shown.slice(0, 10).join(' | '));
} finally { await browser.close(); server.close(); }
console.log(allOk ? 'PASS' : 'FAIL'); process.exit(allOk ? 0 : 1);
