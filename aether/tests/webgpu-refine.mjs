// CFD V3 P3 check: the WebGPU nested-refinement solver (tools/solver2/gpu/refine-webgpu.mjs, f32) reproduces the CPU reference (tools/solver2/refine.mjs, f64).
// The page builds the topology itself (createRefined with topologyOnly, the browser path), starts from the free stream on the GPU and runs the
// same number of coarse steps as the CPU run in Node (tests/lib-refine-cases.mjs: one level; three levels with slip faces, hybrid regularization and
// the wall model; three levels with a moving floor and slip side walls). Headless Chromium, SwiftShader Vulkan adapter (correctness only).
// Pass (each case, plan P3): relative L2 of the populations over active fluid cells of every level < 1e-3, drag within 1e-3 relative, total mass
// of the GPU state within 1e-6 of the CPU state (inlet and outlet make the system open, so both change), no device errors.
// node tests/webgpu-refine.mjs [case ...]   env: STEPS (coarse steps, 20), BUDGET (invocations per GPU submission; small values check that cutting
// the work into many submissions changes nothing)
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
    const res = await page.evaluate(async ({ name, steps, budget }) => {
      const { createRefined } = await import('/tools/solver2/refine.mjs'), { createRefineGpu } = await import('/tools/solver2/gpu/refine-webgpu.mjs'), { CASES } = await import('/tests/lib-refine-cases.mjs');
      const a = await navigator.gpu.requestAdapter(), dev = await a.requestDevice({ requiredLimits: { maxStorageBufferBindingSize: a.limits.maxStorageBufferBindingSize, maxStorageBuffersPerShaderStage: Math.min(10, a.limits.maxStorageBuffersPerShaderStage) } }), errs = [];
      dev.addEventListener('uncapturederror', e => errs.push(String(e.error.message)));
      const o = CASES[name](), T = createRefined({ ...o, topologyOnly: true }), G = await createRefineGpu(dev, T, o);
      if (budget) G.budget = budget; G.init(); const t = performance.now(); G.advance(steps); await G.finish(); const ms = performance.now() - t;
      const lv = []; for (let l = 0; l < T.levels.length; l++) lv.push(Array.from(await G.readLevelF(l)));
      // uniform sampling (P4 visualisation path) on a grid offset by a quarter cell from the level-0 centres, so every point interpolates
      const smp = T.levels[0].mac !== undefined && o.hrr < 1 ? Array.from(await G.sample([.25, .25, .25], .5, T.levels[0].n.map(v => 2 * v - 1))) : null;
      return { lv, smp, force: await G.force(), wall: await G.wall(), ms, errs };
    }, { name, steps, budget: +(process.env.BUDGET || 0) });
    // compare populations over active fluid cells, per level; mass of the GPU state before / after (the initial GPU state is the CPU initial state)
    let e2 = 0, a2 = 0, maxD = 0, mG = 0; const perLevel = [];
    S.levels.forEach((L, l) => { let le = 0, la = 0; const g = res.lv[l];
      for (let n = 0; n < L.N; n++) { if (L.mask[n] !== 0 || L.solid[n]) continue; let r = 0;
        for (let q = 0; q < 19; q++) { const c = L.f[q * L.N + n], d = g[q * L.N + n] - c; le += d * d; la += c * c; maxD = Math.max(maxD, Math.abs(d)); r += g[q * L.N + n]; } mG += r * L.vol; }
      e2 += le; a2 += la; perLevel.push(+Math.sqrt(le / la).toExponential(2)); });
    // CPU counterpart of the sampler: finest level whose nearest cell is interior; trilinear over its fluid cells; 0 in solids
    let smpErr = null; if (res.smp) { const dims = S.levels[0].n.map(v => 2 * v - 1), mac = S.levels.map(L => { const m = new Float64Array(4 * L.N); for (let n = 0; n < L.N; n++) { if (L.mask[n] !== 0 || L.solid[n]) continue; let r = 0, jx = 0, jy = 0, jz = 0; for (let q = 0; q < 19; q++) { const v = L.f[q * L.N + n]; r += v; jx += v * S.lat.C[q][0]; jy += v * S.lat.C[q][1]; jz += v * S.lat.C[q][2]; } m.set([r, jx / r, jy / r, jz / r], 4 * n); } return m; });
      const cellOf = (L, c) => { let k = 0, m = 1; for (let a = 0; a < 3; a++) { let v = c[a]; if (L.per[a]) v = ((v % L.n[a]) + L.n[a]) % L.n[a]; else if (v < 0 || v >= L.n[a]) return -1; k += v * m; m *= L.n[a]; } return k; };
      let e = 0, a = 0; for (let i = 0; i < dims[0] * dims[1] * dims[2]; i++) { const P = [i % dims[0], Math.floor(i / dims[0]) % dims[1], Math.floor(i / (dims[0] * dims[1]))].map(x => .25 + (x + .5) * .5); let got = null;
        for (let l = S.levels.length - 1; l >= 0 && !got; l--) { const L = S.levels[l], p = P.map((x, k) => x * 2 ** l - (L.lo[k] - L.gLo[k]) - .5), cn = cellOf(L, p.map(x => Math.floor(x + .5))); if (cn < 0 || L.mask[cn] !== 0) continue;
          if (L.solid[cn]) { got = [0, 0, 0]; break; } const b = p.map(Math.floor), t = p.map((x, k) => x - b[k]); let acc = [0, 0, 0], ws = 0;
          for (let k = 0; k < 8; k++) { const o = [k & 1, (k >> 1) & 1, (k >> 2) & 1], m = cellOf(L, b.map((x, j) => x + o[j])); if (m < 0 || !(mac[l][4 * m] > 0)) continue; const w = o.reduce((s2, v, j) => s2 * (v ? t[j] : 1 - t[j]), 1); for (let j = 0; j < 3; j++) acc[j] += w * mac[l][4 * m + 1 + j]; ws += w; }
          if (ws > 1e-6) got = acc.map(v => v / ws); }
        if (!got) continue; for (let j = 0; j < 3; j++) { e += (res.smp[4 * i + j] - got[j]) ** 2; a += got[j] ** 2; } }
      smpErr = Math.sqrt(e / a); }
    const relL2 = Math.sqrt(e2 / a2), F = S.force, fRel = Math.abs(res.force[0] - F[0]) / Math.abs(F[0]), mC = S.mass(), mRel = Math.abs(mG / mC - 1);
    const ok = relL2 < 1e-3 && fRel < 1e-3 && mRel < 1e-6 && res.errs.length === 0 && (smpErr === null || smpErr < 1e-4); allOk = allOk && ok;
    results[name] = { ok, sampleRelL2: smpErr && +smpErr.toExponential(2), levels: S.levels.length, cells: S.cells(), relL2: +relL2.toExponential(3), perLevel, maxAbsDiff: +maxD.toExponential(2), dragCpu: +F[0].toExponential(5), dragGpu: +res.force[0].toExponential(5),
      dragRelDiff: +fRel.toExponential(2), massGpuVsCpu: +mRel.toExponential(2), cpuMassChange: +Math.abs(mC / m0 - 1).toExponential(2), wallCpu: S.wall(), wallGpu: res.wall, cpuMs, gpuMs: Math.round(res.ms), deviceErrors: res.errs };
    console.log(name, JSON.stringify(results[name]));
    await S.close();
  }
  const shown = logs.filter(l => !/favicon|404/.test(l)); if (shown.length) console.log('page log:', shown.slice(0, 10).join(' | '));
} finally { await browser.close(); server.close(); }
console.log(allOk ? 'PASS' : 'FAIL'); process.exit(allOk ? 0 : 1);
