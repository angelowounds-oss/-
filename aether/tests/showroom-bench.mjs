/* global __SHOW __VIZ */
// Plumbing check of the on-device cost probe (SwiftShader is far too slow for the numbers to mean anything): the probe returns the four looks and restores the look. node tests/showroom-bench.mjs
import path from 'node:path';
import { open, sleep } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { browser, page, log } = await open('file://' + path.join(root, 'dist/aether.html') + '#q=LOW', { width: 960, height: 540 });
const res = []; const check = (n, ok, d) => { res.push(!!ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); };
try {
  await page.waitForSelector('#scGo.rdy', { timeout: 300000 }); await page.evaluate(() => { document.getElementById('scGo').click(); }); await sleep(1500);
  await page.waitForFunction(() => window.__LIVE && __LIVE.ok && window.__PERF?.cal?.done, null, { timeout: 300000 });
  const before = await page.evaluate(() => ({ amt: __SHOW.amt, haze: __SHOW.haze, vortex: __VIZ.vortex }));
  const out = await page.evaluate(() => __SHOW.bench(1, 0));
  const after = await page.evaluate(() => ({ amt: __SHOW.amt, haze: __SHOW.haze, vortex: __VIZ.vortex }));
  check('성능 측정: 네 구성 결과(이름·fps·ms/프레임·프레임 수)', out.length === 4 && out.every(r => r.name && r.fps >= 0 && r.msPerFrame > 0 && r.frames >= 1), out);
  check('측정 뒤 조명·헤이즈·소용돌이 상태가 원래대로 복원', JSON.stringify(before) === JSON.stringify(after), { before, after });
  const ui = await page.evaluate(() => ({ btn: !!document.getElementById('lookBench'), out: !!document.getElementById('lookBenchOut'), copy: !!document.getElementById('lookBenchCopy') }));
  check('UI: 성능 측정 버튼·결과 영역·복사 버튼 존재', ui.btn && ui.out && ui.copy, ui);
  // the real button: click, wait for the table with the device header, then the copy button
  await page.evaluate(() => document.getElementById('lookBench').click());
  await page.waitForFunction(() => /기기:/.test(document.getElementById('lookBenchOut').textContent), null, { timeout: 600000, polling: 1000 });
  const tab = await page.evaluate(() => document.getElementById('lookBenchOut').textContent);
  check('버튼 결과: 기기 정보 헤더와 네 구성 행', /기기:/.test(tab) && /화면:/.test(tab) && ['연구소', '쇼룸', '빛줄기', '소용돌이'].every(k => tab.includes(k)), tab.split('\n').slice(0, 2));
  await page.evaluate(() => document.getElementById('lookBenchCopy').click()); await sleep(1500);
  const cp = await page.evaluate(() => ({ shown: !document.getElementById('lookBenchCopy').hidden, text: document.getElementById('lookBenchCopy').textContent }));
  check('복사 버튼 표시 및 동작(복사됨 또는 직접 복사 안내)', cp.shown && /복사됨|복사 실패/.test(cp.text), cp);
  check('페이지 오류·콘솔 오류·외부 요청 0', !log.pageErrors.length && !log.consoleErrors.length && !log.external.length, { p: log.pageErrors, c: log.consoleErrors, x: log.external });
} catch (e) { check('시험 실행', false, String(e).slice(0, 300)); }
await browser.close();
console.log(res.filter(Boolean).length + '/' + res.length + ' PASS'); process.exit(res.every(Boolean) ? 0 : 1);
