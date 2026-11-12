// Renderer spike runner (EV-40): serves build/lab/renderer-spike/ with three from build/node_modules, opens each (renderer x scene x lights)
// in a fresh page and prints the numbers; writes tests/results/renderer-spike.json. On a machine with WebGPU the 'gpu' rows use it; where the
// browser has none (this container: SwiftShader, no navigator.gpu) WebGPURenderer falls back to WebGL2 and the row says so.
// Usage: node build/lab/renderer-spike.mjs [--headed]   (GPU_ARGS="--enable-unsafe-webgpu ..." to pass browser flags)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const req = createRequire(path.join(ROOT, 'tests/lib.cjs'));
const { pw } = req('./lib.cjs');
const PAGE = path.join(ROOT, 'build/lab/renderer-spike'), THREE = path.join(ROOT, 'build/node_modules/three');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript' };
// the page and three's files; nothing else
const server = http.createServer((q, s) => {
  const u = decodeURIComponent(new URL(q.url, 'http://x').pathname), f = u.startsWith('/three/') ? path.join(THREE, u.slice(7)) : path.join(PAGE, u === '/' ? 'index.html' : u);
  if (!f.startsWith(THREE) && !f.startsWith(PAGE)) { s.writeHead(403).end(); return; }
  fs.readFile(f, (e, b) => { if (e) { s.writeHead(404).end(); return; } s.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }).end(b); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--enable-unsafe-webgpu', ...(process.env.GPU_ARGS || '').split(' ').filter(Boolean)];
const browser = await pw.chromium.launch({ args: ARGS, headless: !process.argv.includes('--headed') });
const runs = [];
for (const scene of ['block', 'crowd', 'night']) for (const lights of scene === 'night' ? [8, 32, 128] : [0]) for (const r of ['gl', 'gpu-gl', 'gpu']) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } }), errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await page.goto(`http://127.0.0.1:${port}/?r=${r}&scene=${scene}&lights=${lights}&frames=90`);
  const o = await page.waitForFunction(() => window.__done, null, { timeout: 600000 }).then((h) => h.jsonValue()).catch((e) => ({ r, scene, lights, error: String(e).slice(0, 160) }));
  if (errs.length) o.errors = errs;
  runs.push(o); console.info(JSON.stringify(o));
  await page.close();
}
await browser.close(); server.close();
fs.mkdirSync(path.join(ROOT, 'tests/results'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tests/results/renderer-spike.json'), JSON.stringify(runs, null, 1));
