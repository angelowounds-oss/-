/* global __CINE, NodeFilter */
// UX layout regression (docs/UX-AUDIT.md U2, U5, U6, U7, U8, U9, U12): phone 390x844 (touch) and desktop 1440x900, after the splash and the cinematic.
// Checks: dock fully on screen; touch targets >= 44 px on the phone; every dock menu opens inside the viewport; no English UI strings in visible text;
// the collapsed status card shows exactly its two summary lines; header badge not clipped; splash/header name the selected car. Layout only (SwiftShader).
// node tests/ux-layout.mjs [phone|desk|both]
import { open, sleep } from './lib.mjs';
const which = process.argv[2] || 'both', results = []; let fails = 0;
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); if (!ok) fails++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? ' ' + JSON.stringify(info) : '')); };
for (const mode of which === 'both' ? ['phone', 'desk'] : [which]) {
  const phone = mode === 'phone', W = phone ? 390 : 1440, H = phone ? 844 : 900;
  const { browser, page, log } = await open('file://' + new URL('../dist/aether.html', import.meta.url).pathname + '#q=LITE', { width: W, height: H, ctx: phone ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {} });
  try {
    await page.waitForSelector('#scGo.rdy', { timeout: 600000 });
    const splash = await page.evaluate(() => ({ p: document.querySelector('#scSplash p').textContent, car: window.__VEHICLE.label, sub: document.querySelector('.brand small').textContent, wb: getComputedStyle(document.querySelector('#scSplash p')).wordBreak }));
    check(mode + ': splash names the selected car', splash.p.includes(splash.car) && splash.sub.includes(splash.car), splash);
    check(mode + ': Korean word breaking (keep-all)', splash.wb === 'keep-all', splash.wb);
    await page.evaluate(() => document.getElementById('scGo').click());
    await page.waitForFunction(() => window.__PERF?.cal?.done && window.__LIVE?.ok, null, { timeout: 600000 });
    await page.evaluate(() => { __CINE.cancel('test'); const s = document.getElementById('scSplash'); if (s) s.remove(); });
    await sleep(3000);
    const a = await page.evaluate(phone => {
      const vis = el => { const s = getComputedStyle(el), b = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && b.width > 0 && b.height > 0 ? b : null; };
      const dock = document.getElementById('scDock').getBoundingClientRect(), btns = [...document.querySelectorAll('#scDock > .btn, #scDock .menu-btn')].map(b => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim(), l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) }; });
      const eng = document.getElementById('scEng').getBoundingClientRect();
      const st = document.getElementById('lvStat'), lh = parseFloat(getComputedStyle(st).lineHeight), pad = parseFloat(getComputedStyle(st).paddingTop) + parseFloat(getComputedStyle(st).paddingBottom);
      const badge = document.getElementById('readyBadge');
      // visible text (not inside the closed settings drawer)
      let txt = ''; const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let t;
      while ((t = tw.nextNode())) { const el = t.parentElement; if (!el || el.closest('#panel') || el.closest('.menu-pop') || el.closest('script') || !vis(el)) continue; let o = 1, p = el; while (p) { o *= +getComputedStyle(p).opacity; p = p.parentElement; } if (o > .05) txt += ' ' + t.textContent; }
      return { vw: innerWidth, dock: { l: Math.round(dock.left), r: Math.round(dock.right) }, btns, eng: { w: Math.round(eng.width), h: Math.round(eng.height) }, statH: st.getBoundingClientRect().height, statLines: (st.getBoundingClientRect().height - pad - 2) / lh, sum: st.querySelector('.sum')?.textContent, badge: { text: badge.textContent, clipped: badge.scrollWidth > badge.clientWidth + 1 }, txt };
    }, phone);
    check(mode + ': dock inside the viewport', a.dock.l >= 0 && a.dock.r <= a.vw && a.btns.every(b => b.l >= 0 && b.r <= a.vw), { dock: a.dock, vw: a.vw, btns: a.btns.map(b => b.t + ' ' + b.l + '-' + b.r) });
    if (phone) check('phone: touch targets >= 44 px', a.btns.every(b => b.h >= 44) && a.eng.w >= 44 && a.eng.h >= 44, { btns: a.btns.map(b => b.t + ' ' + b.w + 'x' + b.h), settings: a.eng });
    check(mode + ': status card collapsed to its two summary lines', Math.round(a.statLines) === 2 && a.sum && a.sum.split('\n').length === 2, { lines: +a.statLines.toFixed(2), sum: a.sum });
    check(mode + ': header badge not clipped', !a.badge.clipped, a.badge);
    const eng = a.txt.match(/\b(Drag|orbit|wheel|pinch|zoom|Cutaway|Off|On)\b/g);
    check(mode + ': no English UI words in visible text', !eng, eng);
    // every dock menu opens fully inside the viewport, and its items are reachable (not covered at their centre)
    for (const m of ['menuView', 'menuSmoke', 'menuSave', 'menuWalk']) {
      await page.evaluate(id => document.querySelector('#' + id + ' .menu-btn').click(), m); await sleep(700);
      const r = await page.evaluate(id => { const p = document.querySelector('#' + id + ' .menu-pop').getBoundingClientRect(), items = [...document.querySelectorAll('#' + id + ' .menu-pop button')];
        const covered = items.filter(b => { const q = b.getBoundingClientRect(), x = q.left + q.width / 2, y = q.top + q.height / 2, e = document.elementFromPoint(x, y); return !(e && (e === b || b.contains(e))); }).map(b => b.textContent);
        const small = items.filter(b => b.getBoundingClientRect().height < 44).length;
        const label = items.map(b => b.textContent).join(' | ');
        return { l: Math.round(p.left), r: Math.round(p.right), t: Math.round(p.top), b: Math.round(p.bottom), vw: innerWidth, vh: innerHeight, covered, small, label }; }, m);
      check(mode + ': ' + m + ' opens inside the viewport', r.l >= 0 && r.r <= r.vw && r.t >= 0 && r.b <= r.vh && r.covered.length === 0, r);
      if (phone) check('phone: ' + m + ' items >= 44 px', r.small === 0, r.small);
      check(mode + ': ' + m + ' labels have no English', !/\b(Cutaway|Off|On)\b/.test(r.label), r.label);
      await page.evaluate(id => document.querySelector('#' + id + ' .menu-btn').click(), m); await sleep(400);
    }
  } catch (e) { check(mode + ': run', false, String(e).slice(0, 300)); }
  check(mode + ': no page errors', log.pageErrors.length === 0 && log.consoleErrors.length === 0, { page: log.pageErrors.slice(0, 2), console: log.consoleErrors.slice(0, 2) });
  await browser.close();
}
console.log(JSON.stringify({ passed: results.filter(r => r.ok).length, total: results.length }));
process.exit(fails ? 1 : 0);
