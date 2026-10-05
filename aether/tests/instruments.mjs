/* global __INSTR __CINE */
// Functional + plausibility checks for the virtual instruments (probes, wake rake, wake plane). node tests/instruments.mjs
import path from 'node:path'; import fs from 'node:fs';
import { open, sleep } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(root, 'tests/out/instruments'); fs.mkdirSync(outDir, { recursive: true });
const { browser, page, log } = await open('file://' + path.join(root, 'dist/aether.html') + '#q=' + (process.env.INSTR_Q || 'LITE'), { width: 1280, height: 720 });
const res = []; const check = (n, ok, d) => { res.push({ n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); };
const cam = (eye, target, fov = 55) => page.evaluate(([e, t, f]) => { const c = __AETHER_DEBUG.camera; c.preset = 'WOW'; c.eye = e; c.target = t; c.up = [0, 1, 0]; c.fov = f; c.cutaway = false; }, [eye, target, fov]);
const shot = async n => { await sleep(2500); await page.screenshot({ path: path.join(outDir, n + '.png'), timeout: 300000 }); };
try {
  await page.waitForSelector('#scGo.rdy', { timeout: 240000 });
  await page.evaluate(() => { document.getElementById('scGo').click(); });
  await sleep(1500);
  await page.waitForFunction(() => window.__LIVE && __LIVE.ok && window.__PERF?.cal?.done, null, { timeout: 240000 });
  await page.evaluate(() => { const sp = document.getElementById('scSplash'); if (sp) sp.style.display = 'none'; __CINE.cancel('instr'); });
  await page.addStyleTag({ content: '.sc-cap,#lvStat,.hud,.sc-dock,.dock,.sc-bar,.wow-overlay,#scSkip,.fpv-help{display:none!important}' });
  const steps = +(process.env.INSTR_STEPS || 330);
  const t0 = Date.now();
  await page.evaluate(n => { __LIVE.api.run(n, 0.02); __LIVE.freeze = true; }, steps);
  console.log('advanced', steps, 'steps in', ((Date.now() - t0) / 1000).toFixed(0), 's; sim t =', await page.evaluate(() => +__LIVE.t.toFixed(2)));
  // probes: nozzle exit centre, stagnation point, wake, above the roof, under the car
  const ids = await page.evaluate(() => { const P = __INSTR.presets(); const pick = n => P.find(p => p[0].startsWith(n)); return ['노즐', '정체점', '후류(후미', '지붕', '후류 상부'].map(n => { const q = pick(n); const r = __INSTR.add(q[1], q[0]); return { id: r?.id, name: q[0], pos: q[1] }; }); });
  check('프로브 5개 추가', ids.every(i => i.id), ids.map(i => i.name));
  await page.evaluate(() => { __INSTR.setX(3.3); __INSTR.setRake(true); __INSTR.setPlane(true, 0); });
  await page.waitForFunction(() => __INSTR.ref?.valid && __INSTR.probes.every(p => p.val) && __INSTR.wake && __INSTR.est, null, { timeout: 600000, polling: 1000 });
  await sleep(4000); // a few more reads so the means are over several samples
  const R = await page.evaluate(() => {
    const U = __LIVE.U, fm = x => (x === null || x === undefined) ? null : +x.toFixed(3);
    const pr = __INSTR.probes.map(p => ({ name: p.name, speed: fm(p.val.speed), Cp: fm(p.val.Cp), Cp0: fm(p.val.Cp0), vort: fm(p.val.vort), solid: p.val.solid, reads: p.h.length }));
    const w = __INSTR.wake, est = __INSTR.est;
    return { U, ref: { speed: fm(__INSTR.ref.speed), p: fm(__INSTR.ref.p) }, pr, wake: w.prof.map(q => ({ y: fm(q.y), loss: q.Cp0 === null ? null : fm(-q.Cp0), sp: fm(q.speed), solid: q.solid })), est: { CdWake: fm(est.CdWake), CdBalance: fm(est.CdBalance), fluid: est.fluid, solid: est.solid, A: fm(est.A) }, err: __INSTR.err, reads: __INSTR.reads };
  });
  console.log(JSON.stringify(R.pr)); console.log('ref', R.ref, 'U', R.U, 'est', R.est);
  const G = await page.evaluate(() => { const g = __INSTR.planeGrid; const rows = []; for (let iy = g.ny - 1; iy >= 0; iy -= 2) { let r = ''; for (let iz = 0; iz < g.nz; iz += 2) { const v = g.loss[iy + g.ny * iz]; r += Number.isNaN(v) ? 'X' : ' .:-=+*%#@'[Math.min(9, Math.floor(Math.max(0, v) * 9.99))]; } rows.push(r); } return rows; });
  console.log('plane -Cp0 map (rows: y top->bottom, cols: z -1.5..+1.5; X solid, @ >=0.9):\n' + G.join('\n'));
  console.log('rake loss(y):', R.wake.map(q => q.y + ':' + q.loss).join(' '));
  check('계측 오류 없음, 읽기 여러 번 성공(프로브마다 ≥ 2회)', !R.err && R.reads >= 3 && R.pr.every(p => p.reads >= 2), { err: R.err, reads: R.reads });
  check('기준점(자유류) 속도가 풍속 근처(±35 %)', Math.abs(R.ref.speed - R.U) / R.U < .35, { ref: R.ref.speed, U: R.U });
  const by = n => R.pr.find(p => p.name.startsWith(n));
  const nz = by('노즐'), st = by('정체점'), wk = by('후류(후미'), rf = by('지붕'), up = by('후류 상부');
  check('노즐 출구 중심: |U| ≈ 풍속(±25 %), |Cp| < 0.3', Math.abs(nz.speed - R.U) / R.U < .25 && Math.abs(nz.Cp) < .3, nz);
  check('정체점(차 앞): 속도가 풍속보다 크게 낮고 Cp > 0.2', st.speed < .75 * R.U && st.Cp > .2, st);
  check('후류(후미 뒤): 전압 손실 −Cp0 > 0.15 (전압 결손)', wk.Cp0 < -.15, wk);
  check('지붕 위: 가속(|U| > 풍속) 또는 Cp < 0', rf.speed > R.U || rf.Cp < 0, rf);
  check('모든 프로브가 유체 안(차체 내부 아님)', R.pr.every(p => !p.solid), R.pr.map(p => p.solid));
  check('후류 상부 프로브: 후류 중심보다 손실이 작음', up.Cp0 > wk.Cp0, { up: up.Cp0, wk: wk.Cp0 });
  const lossMax = Math.max(...R.wake.map(q => q.loss ?? 0)), lossTop = R.wake.slice(-3).reduce((a, q) => a + (q.loss ?? 0), 0) / 3;
  check('후류 레이크: 낮은 높이에서 손실이 크고(> 0.15), 윗부분은 작음(< 절반)', lossMax > .15 && lossTop < .5 * lossMax, { lossMax, lossTop });
  // wake plane: report honestly. Close behind the car the static pressure has not recovered, so the total-pressure-deficit integral over-estimates the drag (Betz form needs the far wake).
  const farX = [3.3, 4.4, 5.5], table = [{ x: 3.3, wake: R.est.CdWake, force: R.est.CdBalance }];
  for (const x of farX.slice(1)) { await page.evaluate(x => __INSTR.setX(x), x); await page.waitForFunction(x => __INSTR.est && Math.abs(__INSTR.est.x - x) < 1e-6, x, { timeout: 600000, polling: 1000 }); await sleep(1500); table.push(await page.evaluate(() => ({ x: __INSTR.est.x, wake: __INSTR.est.CdWake, force: __INSTR.est.CdBalance }))); }
  console.log('plane integral vs force Cd:', JSON.stringify(table.map(r => ({ x: r.x, wakeDeficitCd: +r.wake.toFixed(3), forceCd: +r.force.toFixed(3), ratio: +(r.wake / r.force).toFixed(1) }))));
  // The values are NOT monotonic in x (LITE 1.39 / 1.14 / 1.71, LOW 2.28 / 2.28 / 1.75): near x = 5.5 the collector's suction (bell mouth at x = 6.5) changes the static pressure. An earlier version of this
  // check assumed the deficit integral shrinks with distance; that was an untested assumption, not a physical requirement, and it failed on the first complete run, so it was removed.
  check('후류 평면 적분: 세 위치 모두 유한한 양수이고 서로 다른 평면에서 읽힘(값이 완전히 같지 않음); 비단조는 정상(수집부 흡입)', table.every(r => r.wake > 0 && Number.isFinite(r.wake)) && new Set(table.map(r => r.wake)).size === 3, table);
  await page.evaluate(() => __INSTR.setX(3.3)); await sleep(2000);
  await cam([5.6, 1.3, 0.0], [3.3, 0.9, 0.0], 85); await shot('1_plane_loss');
  await page.evaluate(() => __INSTR.setPlane(true, 1)); await shot('2_plane_vort');
  await page.evaluate(() => __INSTR.setPlane(true, 2)); await shot('3_plane_speed');
  await page.evaluate(() => __INSTR.setPlane(false)); await cam([-1.0, 1.7, 4.6], [-1.2, .9, 0], 60); await shot('4_probes');
  // UI card renders values
  const ui = await page.evaluate(() => ({ list: document.getElementById('instList').textContent.slice(0, 200), wake: document.getElementById('instWake').textContent }));
  check('UI 카드에 프로브 값이 표시됨', /\|U\|/.test(ui.list), ui);
  const csv = await page.evaluate(() => __INSTR.csv());
  check('CSV: 머리글 + 프로브/레이크 행', csv.split('\n').length > 10 && /^kind,id,name/.test(csv), csv.split('\n').length);
} catch (e) { check('instruments test completed', false, String(e).slice(0, 300)); }
check('페이지 오류·콘솔 오류·외부 요청 0', log.pageErrors.length === 0 && log.consoleErrors.length === 0 && log.external.length === 0, { p: log.pageErrors.slice(0, 2), c: log.consoleErrors.slice(0, 2), x: log.external.slice(0, 2) });
await browser.close();
const f = res.filter(r => !r.ok).length; console.log(`${res.length - f}/${res.length} PASS`); process.exit(f ? 1 : 0);
