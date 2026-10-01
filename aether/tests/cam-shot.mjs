// Renders candidate camera poses after advancing the live CFD. node tests/cam-shot.mjs shots.json [hash] [steps] [w] [h]
// shots.json: [{name, eye:[x,y,z], target:[x,y,z], fov, cutaway?}]
import path from 'node:path'; import fs from 'node:fs';
import { open, sleep } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [file, hash = '#q=LOW', steps = '200', W = '1280', H = '720'] = process.argv.slice(2);
const shots = JSON.parse(fs.readFileSync(file, 'utf8'));
const outDir = path.join(root, 'tests/out/cam'); fs.mkdirSync(outDir, { recursive: true });
const { browser, page, log } = await open('file://' + path.join(root, 'dist/aether.html') + hash, { width: +W, height: +H });
try {
  await page.waitForSelector('#scGo.rdy', { timeout: 240000 });
  await page.evaluate(() => { document.getElementById('scGo').click(); });
  await sleep(1500); await page.evaluate(() => document.querySelector('.viewport').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await page.waitForFunction(() => window.__LIVE && (window.__LIVE.ok || window.__LIVE.err) && window.__PERF?.cal?.done, null, { timeout: 240000 });
  await page.evaluate(() => { const sp = document.getElementById('scSplash'); if (sp) sp.style.display = 'none'; });
  await page.addStyleTag({ content: '.sc-cap,#lvStat,.live-stat,.hud,.sc-dock,.sc-bar,.wow-overlay,.sc-vig{display:none!important}' });
  const r = await page.evaluate(n => { const A = __LIVE.api, t0 = performance.now(); A.run(n, 0.02); return { ms: performance.now() - t0, step: __LIVE.step, ok: __LIVE.ok }; }, +steps);
  console.log(JSON.stringify(r));if(process.env.FREEZE!=="0")await page.evaluate(()=>{__LIVE.freeze=true});
  for (const s of shots) {
    await page.evaluate(s => { const c = __AETHER_DEBUG.camera; c.preset = 'WOW'; c.eye = s.eye; c.target = s.target; c.up = [0, 1, 0]; c.fov = s.fov || 50; c.cutaway = !!s.cutaway; }, s);
    await sleep(+(s.wait || (process.env.FREEZE!=="0"?2500:5000)));
    await page.screenshot({ path: path.join(outDir, s.name + '.png'), timeout: 300000 });
    console.log('shot', s.name);
  }
} catch (e) { console.log('ERR', String(e).slice(0, 400)); }
console.log(log.pageErrors.slice(0, 3).join('\n'));
await browser.close();
