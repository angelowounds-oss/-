/* global __CINE, AETHER */
// Regression suite for existing features + boot health. Usage: node tests/regression.mjs [file.html] [tag]
// Writes tests/out/<tag>/regression.json, regression.md and five fixed-camera screenshots.
import fs from 'node:fs';
import path from 'node:path';
import { open, sleep, table } from './lib.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const file = path.resolve(root, process.argv[2] || 'dist/aether.html');
const tag = process.argv[3] || 'latest';
const outDir = path.join(root, 'tests/out', tag);
fs.mkdirSync(outDir, { recursive: true });
const t0 = Date.now();
const { browser, page, log } = await open('file://' + file + '#q=LOW', { width: 960, height: 540 });
const checks = [];
const check = (name, ok, detail) => { checks.push({ name, ok: ok ? 'PASS' : 'FAIL', detail: typeof detail === 'string' ? detail : JSON.stringify(detail) }); };
const ev = (f, a) => page.evaluate(f, a);

try {
  await page.waitForSelector('#scGo.rdy', { timeout: 240000 });
  const bootMs = Date.now() - t0;
  const intro = await ev(() => ({ splash: !!document.getElementById('scSplash'), title: document.querySelector('#scSplash h1')?.textContent }));
  check('인트로 스플래시', intro.splash && /AETHER/.test(intro.title || ''), intro);
  await ev(() => document.getElementById('scGo').click());
  // stop the 37 s cinematic tour (it moves the camera); a viewport pointerdown is the user's own way to stop it
  await sleep(1500); await ev(() => document.getElementById('view').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  check('시네마틱 시작·사용자 조작으로 중지', await ev(() => !document.body.classList.contains('cine') && ['CANCELLED', 'IDLE'].includes(__CINE.state)), await ev(() => __CINE.state));
  await page.waitForFunction(() => window.__LIVE && (window.__LIVE.err || (window.__LIVE.ok && window.__LIVE.step > 8)), null, { timeout: 300000 });
  const live = await ev(() => ({ ok: __LIVE.ok, err: __LIVE.err, q: __LIVE.q, N: __LIVE.N, solver: __LIVE.solver }));
  check('실시간 CFD 부팅', live.ok && !live.err, live);
  const sc = await ev(() => { const s = __AETHER_DEBUG.sceneStats(); return { objects: s.objects, vehicleParts: s.vehicleParts, fanParts: s.fanParts, roadParts: s.roadParts, consoleLike: s.names.filter(n => /console|desk|monitor|chair|control|office/i.test(n)).length, stage: __AETHER_DEBUG.bootStage }; });
  check('PBR 풍동 씬', sc.objects > 20 && sc.vehicleParts > 0 && sc.fanParts > 0 && sc.roadParts > 0, sc);
  check('관제실 장비', sc.consoleLike > 0, { consoleLike: sc.consoleLike });
  const door = await ev(() => ({ built: __AETHER_DEBUG.door.built, steps: __AETHER_DEBUG.door.steps, landZ: __AETHER_DEBUG.door.landZ }));
  check('자동문·계단', door.built === true && door.steps > 0, door);
  const hud = await ev(() => document.getElementById('lvStat')?.textContent || '');
  check('HUD·상시 고지', /실시간 GPU CFD/.test(hud) && /정성적 시각화이며 공학 해석 도구가 아닙니다/.test(hud), hud.slice(0, 160));
  const hangul = await ev(() => (document.body.innerText.match(/[가-힣]/g) || []).length);
  check('한국어 UI', hangul > 100, { hangulChars: hangul });
  check('시네마틱 버튼', await ev(() => !!document.getElementById('scCine')), '');
  // rakes
  const rake = {};
  for (const m of ['RAKE_V', 'RAKE_H', 'BOTH']) { await ev(m2 => { __LIVE.mode = m2; }, m); await page.waitForFunction(m2 => { const n = __LIVE.emitters.length; return m2 === 'RAKE_V' ? n >= 15 && n <= 39 && n % 5 === 0 : m2 === 'RAKE_H' ? n === 9 : n >= 24; }, m, { timeout: 60000 }).catch(() => {}); rake[m] = await ev(() => __LIVE.emitters.length); }
  await ev(() => { __LIVE.mode = 'RAKE_V'; });
  check('스모크 레이크 세로(5열 × 해상도별 3~7줄)/가로9/둘 다', rake.RAKE_V >= 15 && rake.RAKE_V <= 39 && rake.RAKE_V % 5 === 0 && rake.RAKE_H === 9 && rake.BOTH === Math.min(40, rake.RAKE_V + 9), rake);
  // walk into the tunnel (teleport past the door), body solid + wand
  await ev(() => { const sp = document.getElementById('scSplash'); if (sp) sp.style.display = 'none'; document.getElementById('walkMode').click(); const F = __AETHER_DEBUG.fpv; F.x = -2.0; F.z = 0.4; F.yaw = Math.PI / 2; F.pitch = -0.05; F.gy = undefined; __LIVE.wand = true; });
  await page.waitForFunction(n => __BODY.active && __BODY.inTunnel && __LIVE.emitters.length === n, rake.RAKE_V + 1, { timeout: 120000 }).catch(() => {});
  const walk = await ev(() => ({ fpv: __AETHER_DEBUG.fpv.enabled, active: __BODY.active, inTunnel: __BODY.inTunnel, emitters: __LIVE.emitters.length }));
  check('1인칭 보행·풍동 진입', walk.fpv && walk.active && walk.inTunnel, walk);
  check('스모크 완드(레이크 + 1)', walk.emitters === rake.RAKE_V + 1, { emitters: walk.emitters, rake: rake.RAKE_V });
  await sleep(4000);
  await page.waitForFunction(() => __LIVE.speedAt > 0.3, null, { timeout: 120000 }).catch(() => {});
  const body = await ev(() => ({ flags: __LIVE.api.flagCounts(), speedAt: __LIVE.speedAt, hud: document.getElementById('bdHud')?.textContent }));
  check('이동 사람 고체(유동 경계)', body.flags.body > 0 && Number.isFinite(body.speedAt) && body.speedAt > 0.3, body);
  await ev(() => { __AETHER_DEBUG.fpv.yaw = Math.PI / 2; });
  await sleep(5000);
  await page.screenshot({ path: path.join(outDir, 'cam5-fpv-inside.png'), timeout: 600000 });
  const man = await ev(() => { const ok = window.__bodyOutside(); return { ok, anchor: !!__BODY.anchor }; });
  await sleep(5000);
  const manErr = await ev(() => __BODY.drawError || null);
  check('외부 시점 마네킹', man.ok && man.anchor && !manErr, { ...man, drawError: manErr });
  await ev(() => window.__bodyReturn());
  await ev(() => { __LIVE.wand = false; });
  // fixed cameras
  let i = 1;
  for (const c of ['Hero', 'Side', 'Top', 'Fan']) { await ev(n => __AETHER_DEBUG.setPreset(n), c); await sleep(6000); await page.screenshot({ path: path.join(outDir, `cam${i++}-${c.toLowerCase()}.png`), timeout: 600000 }); }
  // control room: rolling road follows the GPU solver, e-stop, flow pause/reset, wind setpoint
  const rr0 = await ev(() => { const r = AETHER.ROLLING_ROAD.getSnapshot(); return { belt: r.beltTravel, speed: r.effectiveSpeed, w: r.wheelAngles[0] }; });
  const simT0 = await ev(() => __LIVE.t); await page.waitForFunction(t => __LIVE.t > t + 0.1, simT0, { timeout: 300000 });
  const rr1 = await ev(() => { const r = AETHER.ROLLING_ROAD.getSnapshot(); return { belt: r.beltTravel, speed: r.effectiveSpeed, w: r.wheelAngles[0], U: __LIVE.U }; });
  check('롤링로드·바퀴가 GPU 솔버 풍속으로 구동', rr1.speed > 0 && Math.abs(rr1.speed - rr1.U) < 1e-6 && (rr1.belt !== rr0.belt || rr1.w !== rr0.w), { rr0, rr1 });
  const es = await ev(() => { const C = window.__CONTROLS; C.emergencyStop(); const a = { stopped: C.getSnapshot().control.emergencyStopped, frozen: __LIVE.freeze, road: AETHER.ROLLING_ROAD.getSnapshot().motorEnabled, fan: AETHER.FAN_MODULE.visualRunning, refusedWind: C.windSet(8) === false }; C.resetEmergencyStop(); a.released = !C.getSnapshot().control.emergencyStopped; a.unfrozen = !__LIVE.freeze; return a; });
  check('비상정지: 팬·롤링로드·흐름 정지, 해제 후 흐름 재개', es.stopped && es.frozen && !es.road && !es.fan && es.refusedWind && es.released && es.unfrozen, es);
  const ctl = await ev(() => { const C = window.__CONTROLS; const a = { pause: C.flowSetPaused(true) && __LIVE.freeze === true }; C.flowSetPaused(false); a.resume = __LIVE.freeze === false; a.wind = C.windSet(8) && __LIVE.U === 8 && __MAC.U === 8; C.windSet(5); a.back = __LIVE.U === 5 && __MAC.U === 5; a.legacyGone = !AETHER.SOLVER && !AETHER.S3_OFFICE && !document.querySelector('.toolbar,.m13-panel,#s3OfficePanel'); a.menus = document.querySelectorAll('#scDock .menu').length; a.drawer = !!document.querySelector('aside#panel #controlPanel') && !!document.querySelector('aside#panel #qualityPanel'); return a; });
  check('제어실: 일시정지·재개·풍속 변경, 제거된 기능 없음, UI 구성', ctl.pause && ctl.resume && ctl.wind && ctl.back && ctl.legacyGone && ctl.menus === 4 && ctl.drawer, ctl);
  const shaders = await ev(() => window.__SHADERS);
  check('셰이더 컴파일(ANGLE)', shaders.failed.length === 0 && shaders.compiled > 10, { compiled: shaders.compiled, failed: shaders.failed });
  const fatal = await ev(() => __AETHER_DEBUG.errors);
  check('치명적 오류 없음', log.pageErrors.length === 0 && fatal.length === 0 && !(await ev(() => __LIVE.err)), { pageErrors: log.pageErrors, engineErrors: fatal.slice(0, 3), consoleErrors: log.consoleErrors.slice(0, 5) });
  check('외부 네트워크 요청 0건', log.external.length === 0, { external: log.external.slice(0, 5) });
  checks.push({ name: '부팅 시간(SwiftShader, 참고)', ok: 'INFO', detail: bootMs + ' ms' });
} catch (e) {
  check('테스트 실행', false, String(e).slice(0, 300));
} finally {
  await browser.close();
}
const failed = checks.filter(c => c.ok === 'FAIL').length;
fs.writeFileSync(path.join(outDir, 'regression.json'), JSON.stringify({ file: path.relative(root, file), tag, time: new Date().toISOString(), failed, checks }, null, 1));
fs.writeFileSync(path.join(outDir, 'regression.md'), table(checks.map(c => ({ 항목: c.name, 결과: c.ok, 상세: c.detail.replace(/\|/g, '/').slice(0, 140) }))) + '\n');
console.log(table(checks.map(c => ({ item: c.name, r: c.ok, d: c.detail.slice(0, 100) }))));
process.exit(failed ? 1 : 0);
