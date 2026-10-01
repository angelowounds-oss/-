/* global __CINE */
// Loads the build, reports page errors, screenshots the splash and the main UI.  node tests/ui-smoke.mjs [hash] [w] [h] [tag]
import path from 'node:path'; import fs from 'node:fs';
import { open, sleep } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [hash = '#q=LITE', W = '1280', H = '720', tag = 'desk'] = process.argv.slice(2);
const outDir = path.join(root, 'tests/out/ui'); fs.mkdirSync(outDir, { recursive: true });
const { browser, page, log } = await open('file://' + path.join(root, 'dist/aether.html') + hash, { width: +W, height: +H, ctx: { reducedMotion: 'reduce', ...(tag.startsWith('m') ? { viewport: { width: +W, height: +H }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) } });
try {
  await page.waitForSelector('#scGo', { timeout: 240000 });
  await sleep(1500); await page.screenshot({ path: path.join(outDir, tag + '-splash.png'), timeout: 300000 });
  console.log('splash ok; pageErrors', JSON.stringify(log.pageErrors.slice(0, 5)));
  await page.evaluate(() => document.querySelector('.viewport').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await page.waitForFunction(() => window.__LIVE && (window.__LIVE.ok || window.__LIVE.err) && window.__PERF?.cal?.done, null, { timeout: 300000 });
  await page.evaluate(() => { __LIVE.api.run(30, 0.02); __CINE.cancel('ui'); document.getElementById('scSplash').remove(); __CINE.seek(0); });
  await sleep(4000);
  await page.screenshot({ path: path.join(outDir, tag + '-main.png'), timeout: 300000 });
  await page.evaluate(() => document.querySelector('#menuView .menu-btn').click()); await sleep(600);
  await page.screenshot({ path: path.join(outDir, tag + '-menu-view.png'), timeout: 300000 });
  await page.evaluate(() => { document.body.click(); document.getElementById('scEng').click(); }); await sleep(900);
  await page.screenshot({ path: path.join(outDir, tag + '-panel.png'), timeout: 300000 });
  console.log('state', JSON.stringify(await page.evaluate(() => ({ cine: __CINE.state, live: window.__LIVE.ok, hud: document.getElementById('lvStat').textContent.slice(0, 120) }))));
} catch (e) { console.log('ERR', String(e).slice(0, 400)); }
console.log('pageErrors', JSON.stringify(log.pageErrors.slice(0, 6))); console.log('consoleErrors', JSON.stringify(log.consoleErrors.slice(0, 4)));
await browser.close();
