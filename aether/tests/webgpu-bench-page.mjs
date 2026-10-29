// Plumbing check of dist/AETHER_CFD_GPU_BENCH.html in headless WebGPU (SwiftShader): the button runs every size, prints MLUPS lines, no errors.
// The numbers are a CPU emulation and mean nothing about a real GPU. node tests/webgpu-bench-page.mjs
import path from 'node:path';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { CHROME } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--allow-file-access-from-files', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await browser.newPage({ viewport: { width: 390, height: 844 } }), errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto('file://' + path.join(root, 'dist/AETHER_CFD_GPU_BENCH.html')); await p.click('#go');
await p.waitForFunction(() => /측정 끝|WebGPU를 쓸 수 없|어댑터 없음/.test(document.getElementById('out').textContent), null, { timeout: 900000 });
const txt = await p.$eval('#out', e => e.textContent), lines = txt.split('\n').filter(l => /MLUPS/.test(l)), copyShown = await p.$eval('#cp', b => !b.hidden);
await browser.close();
const ok = lines.length >= 3 && copyShown && errs.length === 0;
console.log(txt); console.log(JSON.stringify({ sizes: lines.length, copyShown, errors: errs.slice(0, 3) })); console.log(ok ? 'PASS' : 'FAIL'); process.exit(ok ? 0 : 1);
