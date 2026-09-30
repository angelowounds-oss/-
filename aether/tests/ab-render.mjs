// Pixel A/B of the lossless render optimisations: everything off (#opt=novao,nocull,nosplit behaviour) vs everything on, per view and tier.
// A frame = FX history reset + one draw, with performance.now frozen, so both configurations see identical inputs.
// Scenario "dyn": a second frame after the wheel / roller angles moved (exercises the static+dynamic shadow split).
// node tests/ab-render.mjs [file] [tiers=LOW,HIGH] [views=Hero,Side,Top,Fan]
import path from 'node:path'; import fs from 'node:fs';
import { open, sleep } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const file = process.argv[2] || path.join(root, 'dist/aether.html'), tiers = (process.argv[3] || 'LOW,HIGH').split(','), views = (process.argv[4] || 'Hero,Side,Top,Fan').split(',');
const out = path.join(root, 'tests/out/opt'); fs.mkdirSync(out, { recursive: true }); const res = [];
for (const tier of tiers) {
  const { browser, page, log } = await open('file://' + file + '#q=' + tier, { width: 640, height: 360 });
  try {
    await page.waitForSelector('#scGo.rdy', { timeout: 240000 });
    await page.evaluate(() => document.getElementById('scGo').click()); await sleep(1500);
    await page.evaluate(() => document.querySelector('.viewport').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    await page.waitForFunction(() => window.__LIVE && (window.__LIVE.ok || window.__LIVE.err) && window.__PERF?.cal?.done, null, { timeout: 240000 });
    await page.evaluate(() => { const sp = document.getElementById('scSplash'); if (sp) sp.style.display = 'none'; __LIVE.api.set({ freeze: true }); });
    for (const view of views) {
      await page.evaluate(v => __AETHER_DEBUG.setPreset(v), view); await sleep(3000);
      const r = await page.evaluate(() => {
        const D = __AETHER_DEBUG, g = [...document.querySelectorAll('canvas')].map(c => c.getContext('webgl2')).find(Boolean), O = window.__OPT, F = window.__AETHER_FX, HQ = D.hq, R = D.rolling;
        const T0 = performance.now(), realNow = performance.now.bind(performance); performance.now = () => T0;
        const shot = () => { const w = g.drawingBufferWidth, h = g.drawingBufferHeight, b = new Uint8Array(w * h * 4); g.bindFramebuffer(g.FRAMEBUFFER, null); g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, b); return b };
        const reset = () => { F.frame = 0; F.reset = true; F.hist = 0; F.shist = 0; HQ.csmFlat = null; HQ.csmDyn = null; HQ.csmDrawn = false; HQ.csmStaticOK = false; };
        const run = (cfg, dyn) => { Object.assign(O, cfg); reset(); D.renderOnce(); let a = shot();
          if (dyn) { const w0 = (R.wheelAngles || []).slice(), r0 = (R.rollerAngles || []).slice(); R.wheelAngles = w0.map(v => v + .7); R.rollerAngles = r0.map(v => v + .4); F.frame = 1; F.reset = true; D.renderOnce(); a = shot(); R.wheelAngles = w0; R.rollerAngles = r0 }
          return a };
        const off = { vao: false, cull: false, split: false }, on = { vao: true, cull: true, split: true };
        const cmp = (A, B) => { let n = 0, mx = 0; for (let i = 0; i < A.length; i++) { const d = Math.abs(A[i] - B[i]); if (d) { n++; if (d > mx) mx = d } } return { diffBytes: n, maxDiff: mx, total: A.length } };
        const res = {};
        const s0 = run(off, false), s1 = run(on, false); res.static = cmp(s0, s1); res.stats = { ...O.stats };
        const d0 = run(off, true), d1 = run(on, true); res.dyn = cmp(d0, d1);
        // individual switches on the static frame, to localise a difference
        res.each = {}; for (const k of ['vao', 'cull', 'split']) { const c = { ...off, [k]: true }; res.each[k] = cmp(s0, run(c, false)) }
        res.noise = cmp(s0, run(off, false)); /* control: identical configuration, later in the same session */
        const nz = a => { let n = 0; for (let i = 0; i < a.length; i += 4) if (a[i] + a[i + 1] + a[i + 2] > 30) n++; return n }; res.litPixels = nz(s0);
        Object.assign(O, on); performance.now = realNow; D.resume(); return res });
      res.push({ tier, view, ...r }); console.log(JSON.stringify({ tier, view, ...r }));
    }
  } catch (e) { console.log('ERR', tier, String(e).slice(0, 400)); }
  if (log.pageErrors.length) console.log('PAGEERR', log.pageErrors.slice(0, 3));
  await browser.close();
}
fs.writeFileSync(path.join(out, 'ab-render.json'), JSON.stringify(res, null, 1));
for (const r of res) if (r.noise?.diffBytes) console.log('note: control run of', r.tier + '/' + r.view, 'differs from its own baseline by', r.noise.diffBytes, 'bytes (max', r.noise.maxDiff + ') -> per-switch differences of that size are baseline drift, not the switch');
const bad = res.filter(r => r.static.diffBytes || r.dyn.diffBytes); console.log(bad.length ? 'DIFFERENCES in ' + bad.map(b => b.tier + '/' + b.view).join(', ') : 'ALL IDENTICAL (' + res.length + ' cases)');
