// Mobile engineer panel must be closable: open it via the dock button, then close it with the sheet's own close button (touch tap).
import path from 'node:path';
import { open, sleep } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { browser, page, log } = await open('file://' + path.join(root, 'dist/aether.html'), { width: 390, height: 844, ctx: { deviceScaleFactor: 3, isMobile: true, hasTouch: true } });
try {
  await page.waitForSelector('#scGo.rdy', { timeout: 280000 });
  await page.evaluate(() => document.getElementById('scGo').click()); await sleep(2500);
  await page.evaluate(() => document.querySelector('.viewport').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))); await sleep(2000);
  const st = () => page.evaluate(() => { const a = document.querySelector('aside'), r = a.getBoundingClientRect(), c = document.getElementById('engClose')?.getBoundingClientRect(), d = document.getElementById('scEng').getBoundingClientRect(); const top = document.elementFromPoint(d.x + d.width / 2, d.y + d.height / 2); return { eng: document.body.classList.contains('eng'), asideVisible: getComputedStyle(a).display !== 'none' && r.height > 50, asideTop: Math.round(r.top), closeBtnVisible: !!c && c.width > 0, toggleCoveredBy: top ? (top.id || top.tagName) : null } });
  console.log('before ', JSON.stringify(await st()));
  await page.evaluate(() => document.getElementById('scEng').click()); await sleep(800);
  console.log('opened ', JSON.stringify(await st()));
  await page.screenshot({ path: path.join(root, 'tests/out/mobile/panel-open.png'), timeout: 120000 });
  await page.tap('#engClose button'); await sleep(600);
  console.log('closed ', JSON.stringify(await st()));
  await page.setViewportSize({ width: 844, height: 390 }); await sleep(1500);
  await page.evaluate(() => document.getElementById('scEng').click()); await sleep(800);
  console.log('land open', JSON.stringify(await st()));
  await page.screenshot({ path: path.join(root, 'tests/out/mobile/panel-open-landscape.png'), timeout: 120000 });
  await page.tap('#engClose button'); await sleep(600);
  console.log('land closed', JSON.stringify(await st()));
} catch (e) { console.log('ERR', String(e).slice(0, 400)); }
console.log('errors', JSON.stringify({ page: log.pageErrors.slice(0, 2) }));
await browser.close();
