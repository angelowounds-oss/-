/* global __CINE */
// A/B: cost of the smoke emitter loop (SwiftShader = CPU proxy, relative numbers only). node tests/emit-cost.mjs
import path from 'node:path';
import { open } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { browser, page } = await open('file://' + path.join(root, 'dist/aether.html') + '#q=LOW', { width: 640, height: 360 });
try {
  await page.waitForSelector('#scGo.rdy', { timeout: 240000 });
  await page.evaluate(() => { document.getElementById('scGo').click(); });
  await page.waitForFunction(() => window.__LIVE && __LIVE.ok && window.__PERF?.cal?.done, null, { timeout: 240000 });
  await page.evaluate(() => { window.__CINE && __CINE.cancel('bench'); __LIVE.freeze = true; });
  const run = async (mode, cols) => page.evaluate(([m, c]) => { __LIVE.mode = m; if (c) __LIVE.cols = c; __LIVE.api.run(2, 0.02); const gl = document.getElementById('view').getContext('webgl2'); gl.finish(); const t0 = performance.now(); __LIVE.api.run(12, 0.02); gl.finish(); return { mode: m, cols: __LIVE.cols, emitters: __LIVE.emitters.length, msPerStep: +((performance.now() - t0) / 12).toFixed(1) }; }, [mode, cols]);
  const out = [];
  for (const [m, c] of [['OFF', 5], ['RAKE_V', 1], ['RAKE_V', 5], ['OFF', 5], ['RAKE_V', 5]]) out.push(await run(m, c));
  console.log(JSON.stringify(out));
} catch (e) { console.log('ERR', String(e).slice(0, 300)); }
await browser.close();
