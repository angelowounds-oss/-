// Reference views (AAA-PLAN Q0-3, src/views.js): the twelve fixed scenes rendered into one contact sheet, for before/after pictures of a change.
//   [OUT=tests/results/golden-views.png] [Q=2] [PICK=1,5] [TWICE=1] node tests/tools/golden-views.cjs
// Math.random is seeded before the page starts, the game is stepped by hand, and each view waits until the ground tiles and the city tiles around it
// have streamed in. TWICE=1 renders every view a second time (after applying it again) and prints how many bytes differ.
const fs = require('fs');
const path = require('path');
const { openGame, freeze, ROOT } = require('../lib.cjs');
const OUT = process.env.OUT || path.join(ROOT, 'tests/results/golden-views.png');
const SEED = `(() => { let a = 1; Math.random = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })()`;
(async () => {
  const W = 480, H = 270;
  const ctx = await openGame({ q: +(process.env.Q ?? 2), width: W, height: H, init: SEED });
  const { page, browser, errors } = ctx;
  await freeze(page);
  const pick = process.env.PICK ? process.env.PICK.split(',').map((s) => +s - 1) : null, twice = !!process.env.TWICE;
  const out = await page.evaluate(async ({ pick, twice, W, H }) => {
    const g = window.__game, V = window.__views, R = g.eng.renderer, cv = R.domElement, list = pick || V.VIEWS.map((_, i) => i);
    const realRender = g.eng.render; g.eng.render = () => {};
    const step = async (n) => { for (let i = 0; i < n; i++) window.__upd(1 / 60); await new Promise((r) => setTimeout(r, 0)); };
    // settled: no ground tile and no near city tile still on its way (at most 600 frames)
    const busy = () => (window.__hm?.levels || []).some((L) => L.loading && L.loading.size) || (g.citysites?.detQueue?.length || 0) > 0;
    const settle = async () => { let n = 0; await step(60); n += 60; while (busy() && n < 600) { await step(20); n += 20; } return n; };
    const grab = () => { g.eng.render = realRender; g.renderFrame(0, true); g.eng.render = () => {}; const k = document.createElement('canvas'); k.width = cv.width; k.height = cv.height; const x = k.getContext('2d'); x.drawImage(cv, 0, 0); return k; };
    const bytes = (k) => k.getContext('2d').getImageData(0, 0, k.width, k.height).data;
    const cols = 4, rows = Math.ceil(list.length / cols), LH = 16, sheet = document.createElement('canvas'); sheet.width = cols * W; sheet.height = rows * (H + LH);
    const sx = sheet.getContext('2d'); sx.fillStyle = '#111'; sx.fillRect(0, 0, sheet.width, sheet.height);
    const info = [];
    for (const [slot, n] of list.entries()) {
      const r = await V.applyView(g, n, step), frames = await settle(), a = grab(), o = { n: n + 1, ...r, frames, programs: R.info.programs.length };
      if (twice && !r.skipped) { await V.applyView(g, n, step); await settle(); const b = grab(), A = bytes(a), B = bytes(b); let d = 0; for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) d++; o.diffBytes = d; o.diffShare = +(d / A.length).toFixed(5); }
      const x = (slot % cols) * W, y = Math.floor(slot / cols) * (H + LH);
      if (!r.skipped) sx.drawImage(a, x, y, W, H); sx.fillStyle = '#fff'; sx.font = '12px monospace'; sx.fillText(`${n + 1}. ${r.name || r.id}${r.skipped ? ' (없음)' : ''}`, x + 4, y + H + 12);
      info.push(o);
    }
    return { info, url: sheet.toDataURL('image/png') };
  }, { pick, twice, W, H });
  fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, Buffer.from(out.url.split(',')[1], 'base64'));
  for (const o of out.info) console.log(JSON.stringify(o));
  console.log('sheet', OUT, 'page errors', errors.length, errors.slice(0, 2));
  await browser.close();
})().catch((e) => { console.error(String(e.stack || e).slice(0, 800)); process.exit(1); });
