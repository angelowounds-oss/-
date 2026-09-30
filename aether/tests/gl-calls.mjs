// Read-only audit: counts WebGL calls per rendered frame (CPU-side driver/command-buffer cost proxy; SwiftShader timing is NOT used).
// node tests/gl-calls.mjs [hash] [view]
import path from 'node:path';
import { open, sleep } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [hash = '#q=LOW', view = 'Hero'] = process.argv.slice(2);
const { browser, page, log } = await open('file://' + path.join(root, 'dist/aether.html') + hash, { width: 960, height: 540 });
try {
  await page.waitForSelector('#scGo.rdy', { timeout: 240000 });
  await page.evaluate(() => document.getElementById('scGo').click()); await sleep(1500);
  await page.evaluate(() => document.querySelector('.viewport').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await page.waitForFunction(() => window.__LIVE && (window.__LIVE.ok || window.__LIVE.err) && window.__PERF?.cal?.done, null, { timeout: 240000 });
  await page.evaluate(v => { const sp = document.getElementById('scSplash'); if (sp) sp.style.display = 'none'; __AETHER_DEBUG.setPreset(v); }, view);
  await sleep(4000);
  const r = await page.evaluate(async () => {
    const g = [...document.querySelectorAll('canvas')].map(c => c.getContext('webgl2')).find(Boolean), P = Object.getPrototypeOf(g), cnt = {}, orig = {};
    let draws = 0, prog = new Map(), curName = '?';
    for (const k of Object.getOwnPropertyNames(P)) { if (typeof g[k] !== 'function' || /^(get|is|check|create|delete)/.test(k)) continue; const f = g[k].bind(g); orig[k] = g[k]; g[k] = (...a) => { cnt[k] = (cnt[k] || 0) + 1; if (k === 'drawElements' || k === 'drawArrays' || k === 'drawElementsInstanced' || k === 'drawArraysInstanced') draws++; return f(...a); }; }
    /* PERF.frames is a ring of 600, so its length cannot be used; count rAF callbacks (one per rendered frame) */
    let frames = 0; const raf0 = window.requestAnimationFrame.bind(window); window.requestAnimationFrame = f => raf0(t => { frames++; return f(t); });
    const t0 = performance.now();
    while (frames < 3 && performance.now() - t0 < 180000) await new Promise(r => setTimeout(r, 200));
    window.requestAnimationFrame = raf0; frames = Math.max(1, frames);
    const perFrame = {}; let total = 0; for (const k in cnt) { perFrame[k] = Math.round(cnt[k] / frames); total += cnt[k]; }
    for (const k in orig) g[k] = orig[k];
    const top = Object.entries(perFrame).sort((a, b) => b[1] - a[1]).slice(0, 14);
    return { frames, totalPerFrame: Math.round(total / frames), drawsPerFrame: Math.round(draws / frames), top };
  });
  console.log(JSON.stringify(r));
} catch (e) { console.log('ERR', String(e).slice(0, 400)); }
console.log(log.pageErrors.slice(0, 3).join('\n'));
await browser.close();
