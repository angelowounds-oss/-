// Quick MAC probe: node tests/mac-probe.mjs "<js expression run after LIVE ok (async allowed)>" [hash]
import path from 'node:path';
import { open } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const code = process.argv[2], hash = process.argv[3] || '#q=LOW';
const { browser, page, log } = await open('file://' + path.join(root, 'dist/aether.html') + hash, { width: 640, height: 360 });
try {
  await page.waitForFunction(() => window.__LIVE && (window.__LIVE.ok || window.__LIVE.err), null, { timeout: 240000 });
  await page.evaluate(() => { __LIVE.api.set({ freeze: true }); window.GL = [...document.querySelectorAll('canvas')].map(c => c.getContext('webgl2')).find(Boolean); });
  const r = await page.evaluate(code);
  console.log(JSON.stringify(r, null, 1));
} catch (e) { console.log('ERR', String(e).slice(0, 600)); }
const sh = await page.evaluate(() => window.__SHADERS).catch(() => null);
if (sh?.failed?.length) console.log('SHADER FAIL', JSON.stringify(sh.failed, null, 1).slice(0, 3000));
if (log.pageErrors.length) console.log('PAGEERR', log.pageErrors.slice(0, 3));
await browser.close();
