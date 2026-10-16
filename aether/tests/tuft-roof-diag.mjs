/* global __TUFT __STREAK __CINE */
// Diagnostic for the "roof tufts point downstream" criterion: where along the car are the roof tufts that point upstream? node tests/tuft-roof-diag.mjs
import path from 'node:path';
import { open, sleep } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { browser, page } = await open('file://' + path.join(root, 'dist/aether.html') + '#q=' + (process.env.TUFT_Q || 'LOW'), { width: 960, height: 540 });
try {
  await page.waitForSelector('#scGo.rdy', { timeout: 240000 }); await page.evaluate(() => { document.getElementById('scGo').click(); }); await sleep(1500);
  await page.waitForFunction(() => window.__LIVE && __LIVE.ok && window.__PERF?.cal?.done, null, { timeout: 240000 });
  await page.evaluate(() => { const sp = document.getElementById('scSplash'); if (sp) sp.style.display = 'none'; __CINE.cancel('tuft'); });
  await page.evaluate(n => { __LIVE.api.run(n, 0.02); __LIVE.freeze = true; __STREAK.mode = 'vol'; __TUFT.setMode('tuft'); }, +(process.env.TUFT_STEPS || 400));
  await page.waitForFunction(() => __TUFT.stats && __TUFT.stats.valid > 100 && __TUFT.stats.mode === 'tuft', null, { timeout: 600000, polling: 500 }); await sleep(6000);
  const R = await page.evaluate(() => {
    const T = __TUFT, S = T.snap, P = T.roots, N = T.nor, n = T.count, bins = {}; let roof = 0, up = 0; const ex = [];
    for (let i = 0; i < n; i++) { if (!S.valid[i] || N[i * 3 + 1] <= .7) continue; roof++; const x = P[i * 3], dx = S.dir[i * 3]; const b = (Math.round(x * 2) / 2).toFixed(1); (bins[b] ||= { n: 0, up: 0, spd: 0 }); bins[b].n++; bins[b].spd += S.spd[i]; if (dx <= 0) { up++; bins[b].up++; if (ex.length < 12) ex.push([+x.toFixed(2), +P[i * 3 + 1].toFixed(2), +P[i * 3 + 2].toFixed(2), +dx.toFixed(2), +S.spd[i].toFixed(2), +S.rev[i].toFixed(2)]); } }
    return { roof, up, frac: up / roof, bins: Object.fromEntries(Object.entries(bins).sort((a, b) => a[0] - b[0]).map(([k, v]) => [k, { n: v.n, up: v.up, meanSpd: +(v.spd / v.n).toFixed(2) }])), ex, steps: __LIVE.t };
  });
  console.log(JSON.stringify(R));
} catch (e) { console.log('ERR', String(e).slice(0, 300)); }
await browser.close();
