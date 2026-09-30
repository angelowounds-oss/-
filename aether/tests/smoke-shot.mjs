// Smoke look check: advance the live CFD by N steps, then screenshot a preset view.
// node tests/smoke-shot.mjs <hash> <outName> <view:Hero|Side|Top|Fan> <steps> [hideHud]
import path from 'node:path'; import fs from 'node:fs';
import { open, sleep } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [hash = '#q=LOW', name = 'smoke', view = 'Side', steps = '150', hide = '1'] = process.argv.slice(2);
const outDir = path.join(root, 'tests/out/shots'); fs.mkdirSync(outDir, { recursive: true });
const { browser, page, log } = await open('file://' + path.join(root, 'dist/aether.html') + hash, { width: 1280, height: 720 });
try {
  await page.waitForSelector('#scGo.rdy', { timeout: 240000 });
  await page.evaluate(() => { document.getElementById('scGo').click(); });
  await sleep(1500); await page.evaluate(() => document.querySelector('.viewport').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await page.waitForFunction(() => window.__LIVE && (window.__LIVE.ok || window.__LIVE.err) && window.__PERF?.cal?.done, null, { timeout: 240000 });
  await page.evaluate(v => { const sp = document.getElementById('scSplash'); if (sp) sp.style.display = 'none'; __AETHER_DEBUG.setPreset(v); }, view);
  const r = await page.evaluate(n => { const A = __LIVE.api, t0 = performance.now(); A.run(n, 0.02); return { ms: performance.now() - t0, step: __LIVE.step, t: __LIVE.t, rake: __LIVE.rakeErr || null, emitters: __LIVE.emitters.length }; }, +steps);
  if (hide === '1') await page.addStyleTag({ content: '.sc-cap,#lvStat,.live-stat,.hud,.sc-dock,.sc-bar{display:none!important}' });
  await sleep(8000);
  await page.screenshot({ path: path.join(outDir, name + '.png'), timeout: 300000 });
  console.log(JSON.stringify(r));
} catch (e) { console.log('ERR', String(e).slice(0, 300)); }
console.log(log.pageErrors.slice(0, 3).join('\n'));
await browser.close();
