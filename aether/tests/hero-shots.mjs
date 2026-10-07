/* global __CINE __WALK */
// Hero-shot set for visual before/after comparison. node tests/hero-shots.mjs <label>   env: HERO_Q (default LOW), HERO_STEPS (default 120), HERO_ONLY (comma list of shot names)
import path from 'node:path'; import fs from 'node:fs';
import { open, sleep } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const label = process.argv[2] || 'before', outDir = path.join(root, 'tests/out/visual', label); fs.mkdirSync(outDir, { recursive: true });
const { browser, page, log } = await open('file://' + path.join(root, 'dist/aether.html') + '#q=' + (process.env.HERO_Q || 'LOW'), { width: 1280, height: 720 });
const SHOTS = [
  ['hero_front34', [-5.2, 1.45, -3.7], [0.1, 0.62, 0], 40],
  ['rear34_low', [5.0, 0.85, -3.6], [0.0, 0.6, 0], 42],
  ['side_long', [0.3, 1.05, -5.6], [0.0, 0.72, 0], 28],
  ['front_low', [-4.6, 0.45, 0.9], [-0.2, 0.7, 0], 52],
  ['plenum_wide', [2.0, 2.3, 5.2], [-2.5, 1.0, -1.0], 62],
  ['display', [0.3, 1.9, 2.6], [0.0, 2.9, -5.6], 44],
  ['display_car', [4.5, 1.5, 3.8], [-.8, 1.9, -3.2], 55],
  ['ctrl_in', [0.0, 1.95, 11.4], [-.6, 1.5, 6.5], 70],
  ['ctrl_in2', [3.0, 1.9, 11.4], [-2.5, 1.3, 7.2], 75],
  ['ctrl_wall', [-0.8, 1.7, 8.6], [-0.8, 2.4, 12.0], 58],
  ['top', [0.2, 7.0, 0.01], [0.2, 0, 0], 55]
];
try {
  await page.waitForSelector('#scGo.rdy', { timeout: 300000 });
  await page.evaluate(() => { document.getElementById('scGo').click(); });
  await sleep(1500);
  await page.waitForFunction(() => window.__LIVE && __LIVE.ok && window.__PERF?.cal?.done, null, { timeout: 300000 });
  await page.evaluate(() => { const sp = document.getElementById('scSplash'); if (sp) sp.style.display = 'none'; __CINE.cancel('hero'); });
  await page.addStyleTag({ content: '.sc-cap,#lvStat,.hud,.sc-dock,.dock,.sc-bar,.wow-overlay,#scSkip,.fpv-help,.sc-vig{display:none!important}header.top{visibility:hidden!important}' });
  if (process.env.HERO_SET) await page.evaluate(s => { Object.assign(window.__PERF.set, JSON.parse(s)); }, process.env.HERO_SET);
  const steps = +(process.env.HERO_STEPS || 120);
  if (steps > 0) await page.evaluate(n => { __LIVE.api.run(n, 0.02); }, steps);
  await page.evaluate(() => { __LIVE.freeze = true; });
  const only = (process.env.HERO_ONLY || '').split(',').filter(Boolean);
  for (const [n, e, t, f] of SHOTS) {
    if (only.length && !only.includes(n)) continue;
    await page.evaluate(([e, t, f]) => { __WALK.fpv.enabled = false; const c = __AETHER_DEBUG.camera; c.preset = 'WOW'; c.eye = e; c.target = t; c.up = n_up(); c.fov = f; c.cutaway = false; function n_up() { return [0, 0, -1].every(() => false) ? [0, 0, -1] : (e[1] > 6 ? [0, 0, -1] : [0, 1, 0]); } }, [e, t, f]);
    await sleep(7000); await page.screenshot({ path: path.join(outDir, n + '.png'), timeout: 300000 }); console.log('shot', n);
  }
} catch (e) { console.log('ERR', String(e).slice(0, 400)); }
console.log(log.pageErrors.slice(0, 3));
await browser.close();
