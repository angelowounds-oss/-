/* global __VIZ */
// Flow-visualisation diagnostics: Q-criterion statistics of the wake volume after a short run. node tests/viz-stats.mjs [steps = 200]
import path from 'node:path';
import { open, sleep } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..'), steps = +(process.argv[2] || 200);
const { browser, page, log } = await open('file://' + path.join(root, 'dist/aether.html') + '#q=LOW', { width: 1280, height: 720 });
try {
  await page.waitForSelector('#scGo.rdy', { timeout: 300000 }); await page.evaluate(() => { document.getElementById('scGo').click(); }); await sleep(1500);
  await page.waitForFunction(() => window.__LIVE && __LIVE.ok && window.__PERF?.cal?.done, null, { timeout: 300000 });
  await page.evaluate(n => { __LIVE.api.run(n, 0.02); }, steps);
  console.log(JSON.stringify(await page.evaluate(() => __VIZ.stats())));
} catch (e) { console.log('ERR', String(e).slice(0, 300)); }
console.log(log.pageErrors.slice(0, 3)); await browser.close();
