/* global __CINE */
// UX walkthrough: does every user-facing action the way a person would (real taps / clicks, no API shortcuts), screenshots each step
// and audits the visible UI (touch-target size, overlaps, clipped text, tiny text, text volume). Layout/flow only: SwiftShader, so
// nothing here says anything about smoothness or frame rate on a real device.
// node tests/ux-walk.mjs phone|desk [hash]
import path from 'node:path'; import fs from 'node:fs';
import { open, sleep } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [mode = 'phone', hash = ''] = process.argv.slice(2), phone = mode === 'phone';
const out = path.join(root, 'tests/out/ux', mode); fs.mkdirSync(out, { recursive: true });
const W = phone ? 390 : 1440, H = phone ? 844 : 900;
const t0 = Date.now(), T = () => ((Date.now() - t0) / 1000).toFixed(0) + 's';
const say = (...a) => console.log('[' + T() + ']', ...a);
const { browser, page, log } = await open('file://' + path.join(root, 'dist/aether.html') + hash, { width: W, height: H, ctx: phone ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {} });
let n = 0;
const shot = async name => { const f = String(++n).padStart(2, '0') + '-' + name + '.png'; await page.screenshot({ path: path.join(out, f), timeout: 600000 }); say('shot', f); };
/* a tap at the element's centre with a real touch / mouse event. Playwright's own tap waits for the element to be "stable", which
   never happens for the pulsing enter button, so visibility and occlusion are checked here instead (elementFromPoint at the centre). */
const tap = async (sel, label) => {
  const s0 = Date.now();
  try {
    const hit = await page.evaluate(s => { const el = document.querySelector(s); if (!el) return { err: 'not in DOM' }; const b = el.getBoundingClientRect(), cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || b.width < 1) return { err: 'hidden' };
      const x = b.left + b.width / 2, y = b.top + b.height / 2; if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return { err: 'off screen ' + Math.round(x) + ',' + Math.round(y) };
      const top = document.elementFromPoint(x, y); const ok = top && (top === el || el.contains(top) || top.contains(el) && false); return { x, y, ok, top: top ? (top.id ? '#' + top.id : top.tagName.toLowerCase() + '.' + top.className) : null }; }, sel);
    if (hit.err) { say('TAP FAIL', label || sel, hit.err); return false; }
    if (!hit.ok) { say('TAP FAIL', label || sel, 'covered by ' + hit.top); return false; }
    if (phone) await page.touchscreen.tap(hit.x, hit.y); else await page.mouse.click(hit.x, hit.y);
    say('TAP ok', label || sel, (Date.now() - s0) + 'ms'); return true;
  } catch (e) { say('TAP FAIL', label || sel, String(e).split('\n').slice(0, 3).join(' | ').slice(0, 300)); return false; }
};
const audit = async tag => {
  const r = await page.evaluate(() => {
    const vis = el => { const s = getComputedStyle(el), b = el.getBoundingClientRect(); if (s.display === 'none' || s.visibility === 'hidden' || b.width < 1 || b.height < 1) return null; let o = 1, p = el; while (p && p !== document) { const st = getComputedStyle(p); o *= +st.opacity; if (st.pointerEvents === 'none' && p === el) { /* still visible */ } p = p.parentElement; } if (o < .05) return null; if (b.right < 0 || b.bottom < 0 || b.left > innerWidth || b.top > innerHeight) return null; return b; };
    const name = el => (el.id ? '#' + el.id : el.tagName.toLowerCase()) + ' "' + (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 28) + '"';
    const inter = [...document.querySelectorAll('button,select,input,[role=button],summary,label.btn')].map(el => ({ el, b: vis(el) })).filter(x => x.b && getComputedStyle(x.el).pointerEvents !== 'none');
    const small = inter.filter(x => x.b.width < 44 || x.b.height < 44).map(x => name(x.el) + ' ' + Math.round(x.b.width) + 'x' + Math.round(x.b.height));
    const ov = []; for (let i = 0; i < inter.length; i++) for (let j = i + 1; j < inter.length; j++) { const a = inter[i].b, c = inter[j].b; if (inter[i].el.contains(inter[j].el) || inter[j].el.contains(inter[i].el)) continue; const w = Math.min(a.right, c.right) - Math.max(a.left, c.left), h = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top); if (w > 2 && h > 2) ov.push(name(inter[i].el) + ' x ' + name(inter[j].el)); }
    const clip = [...document.querySelectorAll('body *')].filter(el => { const b = vis(el); return b && el.children.length === 0 && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible'; }).map(name).slice(0, 12);
    let chars = 0, tiny = new Set(); const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let t;
    while ((t = tw.nextNode())) { const el = t.parentElement, s = t.textContent.trim(); if (!s || !el || !vis(el)) continue; chars += s.length; const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 12) tiny.add(Math.round(fs * 10) / 10 + 'px ' + name(el)); }
    const scr = { w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight };
    return { interactive: inter.length, small, overlaps: ov.slice(0, 12), clipped: clip, visibleChars: chars, tinyText: [...tiny].slice(0, 14), tinyCount: tiny.size, scroll: scr, view: [innerWidth, innerHeight] };
  });
  say('AUDIT', tag, JSON.stringify(r));
  return r;
};
const st = () => page.evaluate(() => ({ cine: window.__CINE?.state, body: document.body.className, badge: document.getElementById('readyBadge')?.textContent, cap: document.getElementById('scCap')?.textContent, load: document.getElementById('scLoad')?.textContent, q: window.__LIVE?.q, live: window.__LIVE?.ok }));
try {
  // 1. first paint and loading
  await page.waitForSelector('#scSplash', { timeout: 300000 }); say('splash in DOM');
  await shot('splash-first'); say('state', JSON.stringify(await st()));
  const loads = new Set(); const tl = Date.now();
  while (Date.now() - tl < 900000) { const s = await st(); loads.add(s.load); if (await page.$('#scGo.rdy')) break; await sleep(3000); }
  say('loading texts', JSON.stringify([...loads])); say('ready after', T());
  await shot('splash-ready'); await audit('splash');
  // 2. enter -> cinematic
  await tap('#scGo', '입장하기'); await sleep(3000); say('state', JSON.stringify(await st())); await shot('enter+3s');
  for (let k = 0; k < 3; k++) { await sleep(20000); say('state', JSON.stringify(await st())); await shot('cine-' + k); }
  await audit('cinematic');
  // 3. skip
  if (await page.$('#scSkip')) await tap('#scSkip', '건너뛰기'); await sleep(4000); say('state', JSON.stringify(await st()));
  await shot('main'); await audit('main');
  // 4. live HUD expand/collapse
  await tap('#lvStat', 'HUD 자세히'); await sleep(1500); await shot('hud-open'); await audit('hud-open'); await tap('#lvStat', 'HUD 접기'); await sleep(800);
  // 5. each dock menu: open, screenshot, audit, close
  for (const m of ['menuView', 'menuSmoke', 'menuSave', 'menuWalk']) {
    await tap('#' + m + ' .menu-btn', m); await sleep(1200); await shot(m); await audit(m);
    const items = await page.$$eval('#' + m + ' .menu-pop button', bs => bs.map(b => b.textContent.trim())); say('items', m, JSON.stringify(items));
    await tap('#' + m + ' .menu-btn', m + ' close'); await sleep(800);
  }
  // 6. camera presets via menu
  for (const c of ['Side', 'Top', 'Hero']) { await tap('#menuView .menu-btn', 'view menu'); await sleep(700); await tap('#menuView [data-camera=' + c + ']', 'camera ' + c); await sleep(4000); await shot('cam-' + c); }
  // 7. smoke toggles: each item, read label before/after
  for (const id of ['lvRake', 'stkMode', 'cpMode', 'scCol']) {
    await tap('#menuSmoke .menu-btn', 'smoke menu'); await sleep(700);
    const before = await page.$eval('#' + id, b => b.textContent); await tap('#' + id, id); await sleep(2500);
    const after = await page.$eval('#' + id, b => b.textContent); say('toggle', id, JSON.stringify(before), '->', JSON.stringify(after), 'menuOpen', await page.$eval('#menuSmoke', m => m.classList.contains('open')));
  }
  await page.mouse.click(5, H / 2); await sleep(1000); await shot('after-smoke-toggles'); await audit('after-smoke');
  // 8. walking
  await tap('#menuWalk .menu-btn', 'walk menu'); await sleep(700); await tap('#scDoor', '걸어 들어가기'); await sleep(5000); say('state', JSON.stringify(await st())); await shot('walk'); await audit('walk');
  await tap('#menuView .menu-btn', 'view menu'); await sleep(700); await tap('#menuView [data-camera=Hero]', 'back to Hero'); await sleep(4000); await shot('back-hero'); say('state', JSON.stringify(await st()));
  // 9. settings panel: open, scroll through every card
  await tap('#scEng', '설정'); await sleep(1500); await shot('panel-top'); await audit('panel');
  const cards = await page.$$eval('#panel > .card, #panel > details', cs => cs.map(c => ({ title: (c.querySelector('h2,summary')?.textContent || '').trim(), h: Math.round(c.getBoundingClientRect().height), helpChars: [...c.querySelectorAll('.help')].reduce((s, p) => s + p.textContent.length, 0), controls: c.querySelectorAll('button,select,input').length })));
  say('CARDS', JSON.stringify(cards)); say('panel scroll', JSON.stringify(await page.$eval('#panel', p => ({ sh: p.scrollHeight, ch: p.clientHeight }))));
  for (let k = 1; k <= 6; k++) { await page.$eval('#panel', (p, k) => { p.scrollTop = p.clientHeight * 0.9 * k; }, k); await sleep(600); await shot('panel-scroll' + k); }
  await page.$eval('#panel', p => { p.scrollTop = 0; });
  // 10. control room: estop and release
  await tap('#ctlEstop', '비상정지'); await sleep(2500); say('estop', JSON.stringify(await page.evaluate(() => ({ banner: document.getElementById('ctlBanner').textContent, reset: document.getElementById('ctlReset').disabled }))));
  await shot('estop'); await tap('#ctlReset', '비상정지 해제'); await sleep(2500); say('estop released', JSON.stringify(await page.evaluate(() => document.getElementById('ctlBanner').textContent)));
  // 11. close panel
  await tap('#engClose button', '닫기'); await sleep(1500); await shot('panel-closed');
  if (phone) { await page.setViewportSize({ width: 844, height: 390 }); await sleep(5000); await shot('landscape'); await audit('landscape'); await tap('#scEng', '설정 (가로)'); await sleep(1500); await shot('landscape-panel'); }
} catch (e) { say('ERR', String(e).slice(0, 500)); try { await shot('error'); } catch (e2) { void e2; } }
say('errors', JSON.stringify({ page: log.pageErrors.slice(0, 5), console: log.consoleErrors.slice(0, 5), external: log.external.length, shaderFail: log.shaderFailures.length }));
await browser.close();
