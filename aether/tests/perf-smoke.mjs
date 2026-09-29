// M1/M2 functional test: calibration runs and picks a tier, timer/frame stats exist, #bench=perf yields JSON.
// SwiftShader numbers are NOT performance evidence; this only checks that the machinery works.
import fs from 'node:fs'; import path from 'node:path';
import { open } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const file = path.resolve(root, process.argv[2] || 'dist/aether.html');
const out = path.join(root, 'tests/out/m1'); fs.mkdirSync(out, { recursive: true });
const { browser, page, log } = await open('file://' + file + '#bench=perf&perf=1', { width: 960, height: 540 });
const res = {};
try {
  await page.waitForSelector('#scGo.rdy', { timeout: 240000 });
  await page.evaluate(() => { document.getElementById('scGo').click(); });
  await new Promise(r => setTimeout(r, 1500));
  await page.evaluate(() => document.querySelector('.viewport').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await page.waitForFunction(() => window.__PERF?.cal?.done, null, { timeout: 300000 });
  res.calibration = await page.evaluate(() => __PERF.cal.result);
  res.tierAfterCal = await page.evaluate(() => ({ tier: __PERF.tier, q: __LIVE.q, ok: __LIVE.ok }));
  await page.waitForFunction(() => window.__BENCH_RESULT, null, { timeout: 900000 });
  res.bench = await page.evaluate(() => window.__BENCH_RESULT);
  res.hud = await page.evaluate(() => document.getElementById('lvStat')?.textContent);
  res.memoryMB = await page.evaluate(() => window.__PERF && +(window.__perfHudText().match(/메모리\(계산\) (\d+)/) || [])[1]);
  await page.screenshot({ path: path.join(out, 'bench-json.png') });
} catch (e) { res.error = String(e).slice(0, 400); }
res.pageErrors = log.pageErrors; res.external = log.external;
await browser.close();
fs.writeFileSync(path.join(out, 'perf-smoke.json'), JSON.stringify(res, null, 1));
const ok = !res.error && res.calibration?.pick && res.bench?.segments?.length === 5 && !log.pageErrors.length;
console.log(JSON.stringify({ ok, pick: res.calibration?.pick, segs: res.bench?.segments?.map(s => [s.view, s.frames]), mem: res.bench?.memoryMB, err: res.error, pageErrors: log.pageErrors }, null, 1));
process.exit(ok ? 0 : 1);
