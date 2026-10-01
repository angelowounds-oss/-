// Mobile mode check with iPhone-like emulation (390x844 CSS px, DPR 3, touch). Chromium only: layout/flow/limits, NOT Safari behaviour.
// node tests/mobile.mjs [hash] [outPrefix]
import path from 'node:path'; import fs from 'node:fs';
import { open, sleep } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [hash = '', pre = 'm'] = process.argv.slice(2), out = path.join(root, 'tests/out/mobile'); fs.mkdirSync(out, { recursive: true });
const { browser, page, log } = await open('file://' + path.join(root, 'dist/aether.html') + hash, { width: 390, height: 844, ctx: { deviceScaleFactor: 3, isMobile: true, hasTouch: true } });
const info = () => page.evaluate(() => ({ mobile: window.__MOBILE, bodyClass: document.body.className, impl: window.__LIVE?.impl, tier: window.__LIVE?.q, grid: window.__LIVE?.N, canvas: [document.getElementById('view').width, document.getElementById('view').height], css: [innerWidth, innerHeight], dpr: devicePixelRatio, calPick: window.__PERF?.cal?.result?.pick, scrollW: document.documentElement.scrollWidth, fatal: !!document.getElementById('fatalNotice') }));
try {
  await page.waitForSelector('#scGo.rdy', { timeout: 280000 });
  console.log('splash', JSON.stringify(await info()));
  await page.screenshot({ path: path.join(out, pre + '-splash.png'), timeout: 300000 });
  await page.evaluate(() => document.getElementById('scGo').click()); await sleep(2500);
  await page.waitForFunction(() => window.__PERF?.cal?.done, null, { timeout: 280000 });
  await page.evaluate(() => document.querySelector('.viewport').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))); await sleep(5000); /* stop the intro tour */
  console.log('running', JSON.stringify(await info()));
  await page.screenshot({ path: path.join(out, pre + '-portrait.png'), timeout: 300000 });
  await page.setViewportSize({ width: 844, height: 390 }); await sleep(4000);
  await page.screenshot({ path: path.join(out, pre + '-landscape.png'), timeout: 300000 });
  console.log('landscape', JSON.stringify(await info()));
} catch (e) { console.log('ERR', String(e).slice(0, 400)); }
console.log('errors', JSON.stringify({ page: log.pageErrors.slice(0, 3), console: log.consoleErrors.slice(0, 3), external: log.external.length }));
await browser.close();
