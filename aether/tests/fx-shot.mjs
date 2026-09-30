// Screenshot helper for rendering checks: node tests/fx-shot.mjs <hash> <outName> [view:Hero|Side|Top|Fan|FPV] [waitMs]
import path from 'node:path'; import fs from 'node:fs';
import { open, sleep } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [hash = '#q=LOW', name = 'shot', view = 'Hero', wait = '30000'] = process.argv.slice(2);
const outDir = path.join(root, 'tests/out/shots'); fs.mkdirSync(outDir, { recursive: true });
const { browser, page, log } = await open('file://' + path.join(root, 'dist/aether.html') + hash, { width: 960, height: 540 });
try {
  await page.waitForSelector('#scGo.rdy', { timeout: 240000 });
  await page.evaluate(() => { document.getElementById('scGo').click(); });
  await sleep(1500); await page.evaluate(() => document.querySelector('.viewport').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await page.evaluate(v => { const sp = document.getElementById('scSplash'); if (sp) sp.style.display = 'none'; if (v === 'FPV') { document.getElementById('walkMode').click(); const F = __AETHER_DEBUG.fpv; F.x = -2; F.z = .4; F.yaw = Math.PI / 2; F.pitch = -.05; F.gy = undefined; } else __AETHER_DEBUG.setPreset(v); }, view);
  await sleep(+wait);
  await page.screenshot({ path: path.join(outDir, name + '.png'), timeout: 300000 });
  console.log(JSON.stringify(await page.evaluate(() => ({ fx: { on: __AETHER_FX.on, active: __AETHER_FX.active, err: __AETHER_FX.err, rw: __AETHER_FX.rw, rh: __AETHER_FX.rh, vw: __AETHER_FX.vw }, live: { impl: __LIVE.impl, err: __LIVE.err, macErr: __LIVE.macErr, step: __LIVE.step }, set: __PERF.set, errs: __AETHER_DEBUG.errors.slice(0, 2), shaders: window.__SHADERS.failed.slice(0, 2) }))));
} catch (e) { console.log('ERR', String(e).slice(0, 300)); }
console.log(log.pageErrors.slice(0, 3).join('\n'));
await browser.close();
