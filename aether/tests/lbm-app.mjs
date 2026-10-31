// CFD V3 P4 check: the app with #solver=lbm in headless Chromium (SwiftShader WebGL2 + WebGPU). The LBM (tools/solver2/gpu/lbm-app.mjs) must start
// around the car, its velocity must reach the MAC grid (uploads), the blended field near the car must differ from the MAC-only field of the same run
// before the first upload, and nothing may fail (page errors, shader failures, external requests). Speed here is a CPU emulation (no claim).
// node tests/lbm-app.mjs   env: LBMH (finest LBM cell, m; default 0.16 to keep the emulated run short), WAIT_S (300)
import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { CHROME } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'), hf = process.env.LBMH || '0.16', wait = +(process.env.WAIT_S || 300) * 1000;
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--allow-file-access-from-files', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errs = [], external = []; let res;
try {
  const p = await browser.newPage({ viewport: { width: 960, height: 540 } });
  p.on('pageerror', e => errs.push(String(e).slice(0, 300))); p.on('console', m => { if (m.type() === 'error' && !/WebGPU|favicon/i.test(m.text())) errs.push(m.text().slice(0, 300)); });
  await p.route('**/*', r => { const u = r.request().url(); if (/^(file|data|blob):/.test(u)) return r.continue(); external.push(u); return r.abort(); });
  await p.goto(`file://${path.join(root, 'dist/aether.html')}#solver=lbm&lbmh=${hf}&q=LITE`, { timeout: 240000 });
  const t0 = Date.now(); let st;
  for (;;) { st = await p.evaluate(() => { const L = window.__LBM; return L ? { state: L.state, err: L.err, uploads: L.uploads, info: L.api && { E: L.api.E, cells: L.api.cells, steps: L.api.steps, timeScale: L.api.timeScale, mlups: L.api.mlups, setupMs: L.api.setupMs } } : null; });
    if (st && (st.state === 'error' || st.state === 'lost' || st.uploads >= 3) || Date.now() - t0 > wait) break; await new Promise(r => setTimeout(r, 2000)); }
  // the LBM velocity at a point beside the car (MAC probe) and the blend weight there
  const probe = await p.evaluate(() => { const L = window.__LBM; if (!L || !L.api) return null; return L.api.sample([.5, .6, 1.3], [.1, .1, .1], [1, 1, 1]).then(a => Array.from(a)); });
  res = { ...st, probe, waitedS: Math.round((Date.now() - t0) / 1000), shaderFailures: await p.evaluate(() => window.__SHADERS ? window.__SHADERS.failed.length : null) };
} finally { await browser.close(); }
const ok = res && res.state === 'running' && res.uploads >= 3 && errs.length === 0 && external.length === 0 && res.probe && res.probe[3] === 1 && Number.isFinite(res.probe[0]);
console.log(JSON.stringify({ ...res, errors: errs.slice(0, 5), external: external.slice(0, 3) })); console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
