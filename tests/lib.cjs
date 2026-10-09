// Shared harness for the browser regression tests.
// Headless Chromium renders WebGL2 with SwiftShader (no GPU needed). Every test opens the built single-file game, starts it, drives it
// through window.__game, and ends with one `RESULT {...}` line that tests/run.cjs collects.
//
// Notes on the environment (see docs/TESTING.md):
//  - SwiftShader is a CPU rasterizer: pixel comparisons and counts are exact, GPU timings are not meaningful (it also stalls for seconds
//    when its JIT routine cache thrashes). Timing tests therefore stub rendering and measure the JavaScript side only.
//  - The game keeps running from requestAnimationFrame; tests that step it by hand replace game.update with a no-op first (freeze()).
const path = require('path');
let pw;
try { pw = require('playwright'); } catch { pw = require(process.env.PLAYWRIGHT || '/opt/node22/lib/node_modules/playwright'); }

const ROOT = path.resolve(__dirname, '..');
const GAME = process.env.GAME_HTML || path.join(ROOT, 'neon_city_v9.html');
const GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

// open the game at quality tier q, wait until it is ready, start it; returns { browser, page, errors }
async function openGame({ q = 1, width = 480, height = 360, url = GAME, extra = '' } = {}) {
  const browser = await pw.chromium.launch({ args: GL_ARGS });
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 300)));
  page.on('console', (m) => { const t = m.text(); if (/GLSL|shader error|ERROR/i.test(t)) errors.push('console: ' + t.slice(0, 300)); else if (t.startsWith('##')) console.log(t.slice(2)); });
  const href = (url.startsWith('file:') || url.startsWith('http') ? url : 'file://' + url) + '?q=' + q + extra;
  await page.goto(href);
  await page.waitForSelector('#go.rdy', { timeout: 240000 });
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

module.exports = { pw, ROOT, GAME, GL_ARGS, openGame, freeze, shot, pixelDiff, result, run };
