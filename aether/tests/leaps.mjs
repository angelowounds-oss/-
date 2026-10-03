/* global __CAP __CPMAP __STREAK __YAW __GPUPROBE __CINE */
// Functional checks for streaklines, surface pressure, yaw, aero chart, capture, WebGPU probe. node tests/leaps.mjs
import path from 'node:path'; import fs from 'node:fs';
import { open, sleep } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(root, 'tests/out/leaps'); fs.mkdirSync(outDir, { recursive: true });
const { browser, page, log } = await open('file://' + path.join(root, 'dist/aether.html') + '#q=LOW', { width: 1280, height: 720 });
const res = []; const check = (n, ok, d) => { res.push({ n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); };
const downloads = []; page.on('download', d => downloads.push(d.suggestedFilename()));
const cam = (eye, target, fov = 55) => page.evaluate(([e, t, f]) => { const c = __AETHER_DEBUG.camera; c.preset = 'WOW'; c.eye = e; c.target = t; c.up = [0, 1, 0]; c.fov = f; c.cutaway = false; }, [eye, target, fov]);
const shot = async n => { await sleep(2500); await page.screenshot({ path: path.join(outDir, n + '.png'), timeout: 300000 }); };
try {
  await page.waitForSelector('#scGo.rdy', { timeout: 240000 });
  await page.evaluate(() => { document.getElementById('scGo').click(); });
  await sleep(1500);
  await page.waitForFunction(() => window.__LIVE && __LIVE.ok && window.__PERF?.cal?.done, null, { timeout: 240000 });
  await page.evaluate(() => { const sp = document.getElementById('scSplash'); if (sp) sp.style.display = 'none'; __CINE.cancel('leaps'); });
  await page.addStyleTag({ content: '.sc-cap,#lvStat,.hud,.sc-dock,.dock,.sc-bar,.wow-overlay,#scSkip,.fpv-help{display:none!important}' });
  await page.evaluate(() => { __LIVE.api.run(220, 0.02); __LIVE.freeze = true; });
  // 1 streaklines (run advanced them through api.run)
  const st = await page.evaluate(() => ({ mode: __STREAK.mode, rows: __STREAK.rows, err: __STREAK.err }));
  check('입자 유적선: 모드·행 수·오류 없음', st.mode === 'both' && st.rows >= 15 && !st.err, st);
  await cam([-0.5, 1.6, 4.2], [-2.0, 0.9, 0]); await shot('1_both');
  await page.evaluate(() => { __STREAK.mode = 'streak'; }); await shot('1_streak_only');
  await page.evaluate(() => { __STREAK.mode = 'vol'; }); await shot('1_vol_only');
  await page.evaluate(() => { __STREAK.mode = 'both'; });
  // 3 surface pressure
  await page.evaluate(() => { __CPMAP.on = true; });
  await cam([-0.5, 1.6, 4.2], [-0.5, 0.7, 0]); await shot('3_cp_side');
  await cam([-4.5, 1.6, 2.2], [0, 0.7, 0], 60); await shot('3_cp_front34');
  check('차체 압력: 오류 없음', await page.evaluate(() => !__CPMAP.err), await page.evaluate(() => __CPMAP.err));
  await page.evaluate(() => { __CPMAP.on = false; });
  // 4 yaw + aero
  const before = await page.evaluate(() => ({ car: __LIVE.api.flagCounts().car, aero: __LIVE.aero.length }));
  await page.evaluate(() => { __LIVE.freeze = false; __LIVE.api.setYaw(8); });
  await sleep(500);
  const after = await page.evaluate(() => { __LIVE.api.run(200, 0.02); __LIVE.freeze = true; return { car: __LIVE.api.flagCounts().car, deg: __YAW.deg, err: __LIVE.err, ok: __LIVE.ok }; });
  check('요각 적용: 차 셀 재구성, 오류 없음', after.deg === 8 && after.ok && !after.err && after.car > 0, { before, after });
  await cam([-2.5, 5.2, 0.2], [-1.5, 0, 0], 60); await shot('4_yaw8_top');
  await page.evaluate(() => { __LIVE.api.setYaw(0); __LIVE.api.run(60, 0.02); });
  // aero history is filled by real-time stepping
  await page.evaluate(() => { __LIVE.freeze = false; }); await sleep(8000);
  check('공력 계수 시계열 기록', await page.evaluate(() => __LIVE.aero.length), await page.evaluate(() => __LIVE.aero.slice(-1)[0]));
  // 5 capture
  const nb = downloads.length;
  await page.evaluate(() => __CAP.photo()); await sleep(4000);
  check('사진 저장(다운로드 발생)', downloads.length > nb && /\.png$/.test(downloads[downloads.length - 1] || ''), downloads.slice(-1));
  const sup = await page.evaluate(() => __CAP.supported());
  if (sup) { const nv = downloads.length; await page.evaluate(() => __CAP.start()); await sleep(2500); await page.evaluate(() => __CAP.stop()); await sleep(2500);
    check('녹화 저장(다운로드 발생)', downloads.length > nv && /\.(webm|mp4)$/.test(downloads[downloads.length - 1] || ''), { files: downloads.slice(-1), bytes: await page.evaluate(() => __CAP.last?.size) }); }
  else console.log('SKIP 녹화: MediaRecorder/captureStream 미지원');
  // 6 webgpu probe
  const gp = await page.evaluate(async () => { const r = await __GPUPROBE.run(); return { supported: r.supported, reason: r.reason }; });
  check('WebGPU 진단: 미지원 환경에서 정상 보고(예외 없음)', gp.supported === false && !!gp.reason, gp);
  // ui buttons
  const ui = await page.evaluate(() => { const ids = ['stkMode', 'cpMode', 'capPhoto', 'capRec', 'capArm', 'ctlYaw', 'aeroChart', 'gpRun']; return ids.filter(i => !document.getElementById(i)); });
  check('UI 요소 존재', ui.length === 0, ui);
  const sb = await page.evaluate(() => { document.getElementById('stkMode').click(); return document.getElementById('stkMode').textContent; });
  check('표현 버튼 순환', /입자선만/.test(sb), sb);
} catch (e) { console.log('ERR', String(e).slice(0, 500)); }
console.log('pageErrors', JSON.stringify(log.pageErrors.slice(0, 5)), 'external', JSON.stringify(log.external.slice(0, 3)));
console.log(res.filter(r => r.ok).length + ' PASS, ' + res.filter(r => !r.ok).length + ' FAIL');
await browser.close();
