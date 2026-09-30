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
  await sleep(1500); await ev(() => document.querySelector('.viewport').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  check('시네마틱 투어 시작·중지', await ev(() => !document.body.classList.contains('cine')), '');
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
  for (const m of ['RAKE_V', 'RAKE_H', 'BOTH']) { await ev(m2 => { __LIVE.mode = m2; }, m); await page.waitForFunction(n => __LIVE.emitters.length === n, { RAKE_V: 7, RAKE_H: 9, BOTH: 16 }[m], { timeout: 60000 }).catch(() => {}); rake[m] = await ev(() => __LIVE.emitters.length); }
  await ev(() => { __LIVE.mode = 'RAKE_V'; });
  check('스모크 레이크 세로7/가로9', rake.RAKE_V === 7 && rake.RAKE_H === 9 && rake.BOTH === 16, rake);
  // walk into the tunnel (teleport past the door), body solid + wand
  await ev(() => { const sp = document.getElementById('scSplash'); if (sp) sp.style.display = 'none'; document.getElementById('walkMode').click(); const F = __AETHER_DEBUG.fpv; F.x = -2.0; F.z = 0.4; F.yaw = Math.PI / 2; F.pitch = -0.05; F.gy = undefined; __LIVE.wand = true; });
  await page.waitForFunction(() => __BODY.active && __BODY.inTunnel && __LIVE.emitters.length === 8, null, { timeout: 120000 }).catch(() => {});
  const walk = await ev(() => ({ fpv: __AETHER_DEBUG.fpv.enabled, active: __BODY.active, inTunnel: __BODY.inTunnel, emitters: __LIVE.emitters.length }));
  check('1인칭 보행·풍동 진입', walk.fpv && walk.active && walk.inTunnel, walk);
  check('스모크 완드', walk.emitters === 8, { emitters: walk.emitters });
  await sleep(4000);
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
