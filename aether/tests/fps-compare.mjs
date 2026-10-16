// Frame cadence of a build in headless SwiftShader (a RELATIVE indicator between builds on the same machine, not a GPU performance claim).
// node tests/fps-compare.mjs <path to aether.html> [seconds = 15] [hash = #q=LOW]
import { open, sleep } from './lib.mjs';
const file = process.argv[2], secs = +(process.argv[3] || 15), hash = process.argv[4] || '#q=LOW';
const { browser, page, log } = await open('file://' + file + hash, { width: 960, height: 540 });
try {
  await page.waitForSelector('#scGo.rdy', { timeout: 300000 }); await page.evaluate(() => { document.getElementById('scGo').click(); }); await sleep(1500);
  await page.waitForFunction(() => window.__LIVE && __LIVE.ok && window.__PERF?.cal?.done, null, { timeout: 300000 });
  await page.evaluate(() => { const sp = document.getElementById('scSplash'); if (sp) sp.style.display = 'none'; });
  await sleep(4000);
  const n = await page.evaluate(s => new Promise(res => { let c = 0; const t0 = performance.now(); (function f() { c++; if (performance.now() - t0 < s * 1000) requestAnimationFrame(f); else res({ frames: c, sec: (performance.now() - t0) / 1000 }); })(); }), secs);
  console.log(JSON.stringify({ file: file.replace(/.*\/(wt-base|-)\//, ''), hash, ...n, fps: +(n.frames / n.sec).toFixed(2), pageErrors: log.pageErrors.length }));
} catch (e) { console.log('ERR', String(e).slice(0, 300)); }
await browser.close();
