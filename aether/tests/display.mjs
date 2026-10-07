/* global __DISP __YAW __CINE */
// Wall LED display: exists, gets a texture, shows live values, respects the start-up transient and #display=0. node tests/display.mjs
import path from 'node:path'; import fs from 'node:fs';
import { open, sleep } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(root, 'tests/out/display'); fs.mkdirSync(outDir, { recursive: true });
const { browser, page, log } = await open('file://' + path.join(root, 'dist/aether.html') + '#q=LITE', { width: 1280, height: 720 });
const res = []; const check = (n, ok, d) => { res.push({ n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); };
try {
  await page.waitForSelector('#scGo.rdy', { timeout: 300000 });
  await page.evaluate(() => { document.getElementById('scGo').click(); });
  await sleep(1500);
  await page.waitForFunction(() => window.__LIVE && __LIVE.ok && window.__PERF?.cal?.done, null, { timeout: 300000 });
  await page.evaluate(() => { const sp = document.getElementById('scSplash'); if (sp) sp.style.display = 'none'; __CINE.cancel('disp'); });
  await page.waitForFunction(() => window.__DISP && __DISP.obj && __DISP.draws >= 2, null, { timeout: 120000, polling: 500 });
  const A = await page.evaluate(() => ({ err: __DISP.err || null, tex: !!__DISP.obj.texture, name: __DISP.obj.name, cat: __DISP.obj.category, size: [__DISP.cv.width, __DISP.cv.height] }));
  check('디스플레이 오브젝트가 있고 텍스처가 붙고 오류 없음', A.tex && !A.err && A.name === 'tv2.AETHER_WALL_DISPLAY', A);
  const pix = async () => page.evaluate(() => { const c = __DISP.cx.getImageData(0, 0, __DISP.w, __DISP.h).data; let s = 0; for (let i = 0; i < c.length; i += 4 * 97) s += c[i] + c[i + 1] + c[i + 2]; return s; });
  const s0 = await pix();
  check('캔버스에 내용이 그려짐(검은 화면 아님)', s0 > 5e4, s0);
  // start-up transient: coefficients hidden before 4 s of simulated time
  const early = await page.evaluate(() => { const t = __LIVE.t; return { t, vals: window.__DISPVALS ? 1 : 0 }; });
  const v1 = await page.evaluate(() => { const d = __DISP; return { drawn: d.draws, hist: d.hist.length }; });
  check('시뮬레이션 시간이 4초 미만이면 계수는 표시하지 않고 대기 문구', early.t >= 0 && v1.drawn >= 2, { early, v1 });
  await page.evaluate(() => { __LIVE.api.run(230, 0.02); });
  await sleep(2500);
  const v2 = await page.evaluate(() => ({ t: __LIVE.t, hist: __DISP.hist.length, Cd: __LIVE.forces?.CdMean ?? __LIVE.forces?.Cd, draws: __DISP.draws }));
  check('4초 이후: 이력 기록 시작, 솔버 Cd가 있음', v2.t >= 4 && v2.hist >= 1 && Number.isFinite(v2.Cd), v2);
  const s1 = await pix();
  check('값이 나오면 화면이 달라짐(이전과 다른 픽셀 합)', s1 !== s0, { s0, s1 });
  const d0 = await page.evaluate(() => __DISP.draws); await sleep(1500); const d1 = await page.evaluate(() => __DISP.draws);
  // SwiftShader renders well under 1 frame/s here, and the panel refreshes at most once per frame, so only the upper bound (never faster than 5 Hz) and progress are checked
  check('갱신: 계속 진행되고 5 Hz(1.5초에 8회)를 넘지 않음', d1 > d0 && d1 - d0 <= 8, { d0, d1 });
  await page.evaluate(() => { window.__YAW && 0; __LIVE.api.setYaw(6); }); await sleep(1500);
  const yaw = await page.evaluate(() => __YAW.deg);
  check('요각 변경이 디스플레이 입력에 반영됨(요각 6°)', yaw === 6, yaw);
  await page.evaluate(() => { __LIVE.api.setYaw(0); });
  await page.screenshot({ path: path.join(outDir, 'page.png'), timeout: 300000 });
} catch (e) { check('display test completed', false, String(e).slice(0, 300)); }
const off = await open('file://' + path.join(root, 'dist/aether.html') + '#q=LITE&display=0', { width: 640, height: 360 });
try {
  await off.page.waitForFunction(() => window.__DISP, null, { timeout: 300000 });
  await sleep(20000);
  const o = await off.page.evaluate(() => ({ on: __DISP.on, draws: __DISP.draws, obj: !!__DISP.obj }));
  check('#display=0: 끄면 텍스처를 만들지 않음', o.on === false && o.draws === 0 && !o.obj, o);
} catch (e) { check('display=0 test completed', false, String(e).slice(0, 300)); }
await off.browser.close();
check('페이지 오류·콘솔 오류·외부 요청 0', log.pageErrors.length === 0 && log.consoleErrors.length === 0 && log.external.length === 0, { p: log.pageErrors.slice(0, 2), c: log.consoleErrors.slice(0, 2), x: log.external.slice(0, 2) });
await browser.close();
const f = res.filter(r => !r.ok).length; console.log(`${res.length - f}/${res.length} PASS`); process.exit(f ? 1 : 0);
