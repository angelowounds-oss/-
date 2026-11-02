// Shared harness for the browser regression tests.
// Headless Chromium renders WebGL2 with SwiftShader (no GPU needed). Every test opens the built game folder (dist/Korea/game, or GAME_DIR)
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
const GAME = path.resolve(process.env.GAME_DIR || path.join(ROOT, 'dist', 'Korea', 'game'));

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
// the software GPU takes over half a minute for the first frame of a full street view (every program compiled at once): the GPU watchdog killed it,
// and the page with it ("Target crashed"), so the watchdog is off
// --expose-gc: a frame of the 1:1 city takes seconds on the software GPU, so the page never idles and Blink's garbage collector falls behind (its heap
// grew from 0.2 to 3.4 GB of collectable garbage in a few frames over Gangnam and the renderer was killed for memory); the stepped loop below collects
// every GC_EVERY updates and shot() before each frame, which a real GPU's idle time does by itself
const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-watchdog', '--js-flags=--expose-gc'];

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

// inside the page: stop the rAF-driven loop and keep the real update as window.__upd (with a full collection every GC_EVERY steps, see GL_ARGS)
const GC_EVERY = 5;
const FREEZE = `(() => { const g = window.__game; if (!window.__upd) { const up = g.update.bind(g); let n = 0; window.__upd = (...a) => { up(...a); if (++n % ${GC_EVERY} === 0 && window.gc) window.gc(); }; g.update = () => {}; g.autoQuality = () => {}; } })()`;
async function freeze(page) { await page.evaluate(FREEZE); }

// read back the frame game.renderFrame drew, as RGBA bytes top row first (the bytes a 2D canvas drawImage/getImageData readback gives, checked
// equal). The copy goes into a pixel-pack buffer in the same task (the drawing buffer is gone once the page composites) and the page then
// waits for the GPU on a fence across event-loop turns: a synchronous readback blocked the renderer's main thread for the 30 s a 1:1 city frame
// takes on the software GPU, and the renderer grew by gigabytes of anonymous memory meanwhile until the container killed it.
const SHOT = `(async () => {
  const g = window.__game; if (window.gc) window.gc(); g.renderFrame(0, true);
  const gl = g.eng.renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const rf = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING), pb = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING), buf = gl.createBuffer();
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf); gl.bufferData(gl.PIXEL_PACK_BUFFER, w * h * 4, gl.STREAM_READ);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, rf); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pb);
  const s = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush();
  while (gl.clientWaitSync(s, 0, 0) === gl.TIMEOUT_EXPIRED) await new Promise((r) => setTimeout(r, 20));
  gl.deleteSync(s);
  const raw = new Uint8Array(w * h * 4), out = new Array(w * h * 4), row = w * 4;
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buf); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, raw); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pb); gl.deleteBuffer(buf);
  for (let y = 0; y < h; y++) for (let i = 0; i < row; i++) out[y * row + i] = raw[(h - 1 - y) * row + i];
  return out;
})()`;
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
