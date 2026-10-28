// Shared harness for the browser regression tests.
// Headless Chromium renders WebGL2 with SwiftShader (no GPU needed). Every test opens the built game folder (dist/NeonCity/game, or GAME_DIR)
// over a local http server like the launcher's, starts it, drives it through window.__game, and ends with one `RESULT {...}` line that
// tests/run.cjs collects.
//
// Notes on the environment (see docs/TESTING.md):
//  - SwiftShader is a CPU rasterizer: pixel comparisons and counts are exact, GPU timings are not meaningful (it also stalls for seconds
//    when its JIT routine cache thrashes). Timing tests therefore stub rendering and measure the JavaScript side only.
//  - The game keeps running from requestAnimationFrame; tests that step it by hand replace game.update with a no-op first (freeze()).
const path = require('path');
const fs = require('fs');
const http = require('http');
let pw;
try { pw = require('playwright'); } catch { pw = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright'); }

const ROOT = path.resolve(__dirname, '..');
const GAME = path.resolve(process.env.GAME_DIR || path.join(ROOT, 'dist', 'NeonCity', 'game'));

// Serves a game folder on 127.0.0.1 the way launcher/main.go does (fixed MIME types, Range requests answered with 206, nothing compressed), so the
// page reads its files and world packs exactly as in the delivered game. One server per folder per test process; resolves to its base URL.
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.png': 'image/png', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8' };
const servers = new Map();
function serve(dir = GAME) {
  dir = path.resolve(dir);
  if (!servers.has(dir)) servers.set(dir, new Promise((res, rej) => {
    const srv = http.createServer((req, rsp) => {
      let p; try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { p = '/'; }
      const f = path.join(dir, path.normalize(p === '/' ? '/index.html' : p));
      fs.stat(f, (err, st) => {
        if (err || !st.isFile() || !f.startsWith(dir + path.sep)) { rsp.writeHead(404); rsp.end(); return; }
        const h = { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
        const m = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || ''), a = m ? +m[1] : 0, b = m && m[2] ? Math.min(+m[2], st.size - 1) : st.size - 1;
        if (m && a > b) { rsp.writeHead(416, { 'Content-Range': `bytes */${st.size}` }); rsp.end(); return; }
        rsp.writeHead(m ? 206 : 200, { ...h, 'Content-Length': b - a + 1, ...(m ? { 'Content-Range': `bytes ${a}-${b}/${st.size}` } : {}) });
        if (req.method === 'HEAD' || st.size === 0) rsp.end(); else fs.createReadStream(f, { start: a, end: b }).pipe(rsp);
      });
    });
    srv.on('error', rej);
    srv.listen(0, '127.0.0.1', () => { srv.unref(); res(`http://127.0.0.1:${srv.address().port}/`); });
  }));
  return servers.get(dir);
}
// the page URL for a folder, an index.html inside one, or an http URL as given
async function gameUrl(where = GAME) {
  if (where.startsWith('http')) return where;
  const st = fs.existsSync(where) && fs.statSync(where);
  return st && st.isFile() ? (await serve(path.dirname(where))) + path.basename(where) : await serve(where);
}
const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

// open the game at quality tier q, wait until it is ready, start it; returns { browser, page, errors }
// `init`: a script run in the page before any of its own (e.g. a seeded Math.random)
async function openGame({ q = 1, width = 480, height = 360, url = GAME, extra = '', init = null } = {}) {
  const browser = await pw.chromium.launch({ args: GL_ARGS });
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  if (init) await page.addInitScript(init);
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 300)));
  page.on('console', (m) => { const t = m.text(); if (/GLSL|shader error|ERROR/i.test(t)) errors.push('console: ' + t.slice(0, 300)); else if (t.startsWith('##')) console.log(t.slice(2)); });
  const base = await gameUrl(url), href = base + (base.includes('?') ? '&' : '?') + 'q=' + q + extra;
  await page.goto(href);
  // a boot that threw never gets ready: fail at once with the error instead of after the timeout
  let failT = null;
  try { await Promise.race([page.waitForSelector('#go.rdy', { timeout: 240000 }), new Promise((_, rej) => { failT = setInterval(() => { if (errors.length) rej(new Error('boot failed: ' + errors[0])); }, 500); })]); } finally { clearInterval(failT); }
  await page.keyboard.press('KeyJ');
  await page.waitForFunction(() => window.__game && window.__game.running, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  return { browser, page, errors };
}

// inside the page: stop the rAF-driven loop and keep the real update as window.__upd
const FREEZE = `(() => { const g = window.__game; if (!window.__upd) { window.__upd = g.update.bind(g); g.update = () => {}; g.autoQuality = () => {}; } })()`;
async function freeze(page) { await page.evaluate(FREEZE); }

// read back the canvas as RGBA bytes after one frame was drawn by game.renderFrame
const SHOT = `(() => { const g = window.__game; g.renderFrame(0, true); const c = g.eng.renderer.domElement; const k = document.createElement('canvas'); k.width = c.width; k.height = c.height; const x = k.getContext('2d'); x.drawImage(c, 0, 0); return Array.from(x.getImageData(0, 0, c.width, c.height).data); })()`;
async function shot(page) { return page.evaluate(SHOT); }
function pixelDiff(a, b) { let n = 0, max = 0; for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d) { n++; if (d > max) max = d; } } return { diffBytes: n, maxDiff: max, total: a.length }; }

// one line the runner understands; also sets the exit code
function result(name, pass, metrics = {}, note = '') {
  console.log('RESULT ' + JSON.stringify({ test: name, pass: !!pass, metrics, note }));
  if (!pass) process.exitCode = 1;
}

// run a test body with an opened game and always close the browser; a thrown error is a failed result
async function run(name, opts, body) {
  let ctx = null;
  try {
    ctx = await openGame(opts);
    await body(ctx);
    if (ctx.errors.length) result(name + ':page-errors', false, { errors: ctx.errors.slice(0, 5) });
  } catch (e) {
    result(name, false, { error: String(e && e.stack || e).slice(0, 600), pageErrors: ctx ? ctx.errors.slice(0, 5) : [] });
  } finally {
    if (ctx) await ctx.browser.close();
  }
}

module.exports = { pw, ROOT, GAME, GL_ARGS, serve, gameUrl, openGame, freeze, shot, pixelDiff, result, run };
