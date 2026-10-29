// CFD V3 P3 check 1: the WebGPU D3Q19 kernel (tools/solver2/gpu/lbm-webgpu.mjs, f32) reproduces the CPU reference (tools/solver2/refine.mjs, f64,
// one uniform level) on a sphere in a channel: inlet, outlet with absorbing layer, periodic y/z, Bouzidi body, regularized + Smagorinsky.
// Headless Chromium with SwiftShader's Vulkan adapter (correctness only; the speed here says nothing about a real GPU).
// Pass: after 60 steps max |f_gpu - f_cpu| < 2e-5 (populations are O(0.1)) and the drag force within 1e-4 relative.
// node tests/webgpu-lbm.mjs
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { CHROME } from './lib.mjs';
import { createRefined } from '../tools/solver2/refine.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const Nd = 4, U = .06, nx = 12 * Nd, ny = 6 * Nd, nz = ny, cxS = 3 * Nd, cyS = ny / 2, czS = nz / 2, R = Nd / 2, tau = .5 + 3 * U * Nd / 100, cs = .1, steps = 60;
const solidF = p => (p[0] - cxS) ** 2 + (p[1] - cyS) ** 2 + (p[2] - czS) ** 2 < R * R;
const frac = (p, c) => { const x = p[0] - cxS, y = p[1] - cyS, z = p[2] - czS, a = c[0] * c[0] + c[1] * c[1] + c[2] * c[2], b = 2 * (c[0] * x + c[1] * y + c[2] * z), cc = x * x + y * y + z * z - R * R; return (-b - Math.sqrt(Math.max(b * b - 4 * a * cc, 0))) / (2 * a); };
const Lo = Math.round(2.5 * Nd), sigma = .1, sponge = new Float32Array(nx); for (let i = nx - Lo; i < nx; i++) sponge[i] = sigma * ((i - (nx - Lo) + 1) / Lo) ** 2;
const S = createRefined({ lattice: 'D3Q19', E: [nx, ny, nz], inletOutlet: true, U, tau0: tau, model: 'reg', cs, sponge: { Lo, sigma }, body: { level: 0, solid: solidF, frac } });
const L = S.levels[0], f0 = Array.from(L.f), solid = Array.from(L.solid), links = Array.from(L.links);
const t0 = Date.now(); S.advance(steps); const cpuMs = Date.now() - t0, fCpu = L.f, forceCpu = S.force;
const page = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wlbm-')), 'p.html'); fs.writeFileSync(page, '<!doctype html><meta charset=utf-8><title>lbm</title>');
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--allow-file-access-from-files', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let res;
try {
  const p = await browser.newPage(); await p.goto('file://' + page);
  const src = fs.readFileSync(path.join(root, 'tools/solver2/gpu/lbm-webgpu.mjs'), 'utf8');
  await p.addScriptTag({ type: 'module', content: src + '\nwindow.__lbm = { createLbmGpu };' }); await p.waitForFunction(() => window.__lbm);
  res = await p.evaluate(async ({ nx, ny, nz, tau, cs, U, sponge, solid, links, f0, steps }) => {
    const a = await navigator.gpu.requestAdapter(), dev = await a.requestDevice({ requiredLimits: { maxStorageBufferBindingSize: a.limits.maxStorageBufferBindingSize } }), errs = [];
    dev.addEventListener('uncapturederror', e => errs.push(String(e.error.message)));
    const G = await window.__lbm.createLbmGpu(dev, { nx, ny, nz, tau, cs, U, sponge: Float32Array.from(sponge), solid: Uint8Array.from(solid), links: Int32Array.from(links) });
    G.upload(f0); const t = performance.now(); G.advance(steps); await G.finish(); const ms = performance.now() - t;
    const f = Array.from(await G.readF()), force = await G.force(); return { f, force, ms, errs, adapter: a.info && a.info.architecture };
  }, { nx, ny, nz, tau, cs, U, sponge: Array.from(sponge), solid, links, f0, steps });
} finally { await browser.close(); }
let maxDiff = 0, at = -1; const Nc = nx * ny * nz; for (let i = 0; i < fCpu.length; i++) { if (solid[i % Nc]) continue; const dd = Math.abs(res.f[i] - fCpu[i]); if (dd > maxDiff) { maxDiff = dd; at = i; } } // fluid cells only
const fRel = Math.abs(res.force[0] - forceCpu[0]) / Math.abs(forceCpu[0]);
const ok = maxDiff < 2e-5 && fRel < 1e-4 && res.errs.length === 0;
console.log(JSON.stringify({ grid: [nx, ny, nz], links: links.length / 4, steps, maxAbsPopulationDiff: +maxDiff.toExponential(3), atPopulation: at, forceCpu: forceCpu.map(v => +v.toExponential(6)), forceGpu: res.force.map(v => +v.toExponential(6)), forceRelDiff: +fRel.toExponential(3), cpuMs, gpuMs: Math.round(res.ms), adapter: res.adapter, deviceErrors: res.errs }));
console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
