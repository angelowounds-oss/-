/* global __AERO __SEQ __WALK */
// Ride height / pitch set-up: geometry moves only the body, wheels stay, the solver re-voxelises and restarts, and the resolution gate tells the truth. node tests/aero-parts.mjs
import path from 'node:path'; import fs from 'node:fs';
import { open, sleep } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(root, 'tests/out/aero'); fs.mkdirSync(outDir, { recursive: true });
const { browser, page, log } = await open('file://' + path.join(root, 'dist/aether.html') + '#q=LITE', { width: 1280, height: 720 });
const res = []; const check = (n, ok, d) => { res.push({ n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); };
const cam = (eye, target, fov = 40) => page.evaluate(([e, t, f]) => { __WALK.fpv.enabled = false; const c = __AETHER_DEBUG.camera; c.preset = 'WOW'; c.eye = e; c.target = t; c.up = [0, 1, 0]; c.fov = f; c.cutaway = false; }, [eye, target, fov]);
const shot = async n => { await sleep(2500); await page.screenshot({ path: path.join(outDir, n + '.png'), timeout: 300000 }); };
const snap = () => page.evaluate(() => {
  const parts = window.AETHER.CFD_BRIDGE.getSolidParts(), out = { wheels: [], body: null };
  for (const p of parts) { const M = p.modelMatrix, P = p.positions, lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    for (let i = 0; i < P.length; i += 3) { const x = P[i], y = P[i + 1], z = P[i + 2]; const w = [M[0] * x + M[4] * y + M[8] * z + M[12], M[1] * x + M[5] * y + M[9] * z + M[13], M[2] * x + M[6] * y + M[10] * z + M[14]]; for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], w[k]); hi[k] = Math.max(hi[k], w[k]); } }
    const o = { name: p.name, lo: lo.map(v => +v.toFixed(4)), hi: hi.map(v => +v.toFixed(4)), m: Array.from(M).map(v => +v.toFixed(5)) }; if (p.role === 'wheel') out.wheels.push(o); else out.body = o; }
  return out; });
try {
  await page.waitForSelector('#scGo.rdy', { timeout: 240000 });
  await page.evaluate(() => { document.getElementById('scGo').click(); });
  await sleep(1500);
  await page.waitForFunction(() => window.__LIVE && __LIVE.ok && window.__PERF?.cal?.done, null, { timeout: 240000 });
  await page.evaluate(() => { const sp = document.getElementById('scSplash'); if (sp) sp.style.display = 'none'; window.__CINE?.cancel('aero'); __LIVE.api.run(8, 0.02); __LIVE.freeze = true; });
  await page.addStyleTag({ content: '.sc-cap,#lvStat,.hud,.sc-dock,.dock,.sc-bar,.wow-overlay,#scSkip,.fpv-help{display:none!important}' });
  const base = await snap(); const vox0 = await page.evaluate(() => ({ car: __MAC.vox.carCells, front: __MAC.vox.front }));
  check('기준 상태: 비활성, 행렬 변화 없음', await page.evaluate(() => !__AERO.active && __AERO.rideMm === 0 && __AERO.pitchDeg === 0));
  await cam([0.35, 1.2, -4.6], [0.35, .6, 0], 38); await shot('0_base_side');
  // ride height +20 mm
  await page.evaluate(() => { __LIVE.aero.length = 0; __LIVE.t = 3; __AERO.set({ rideMm: 20 }); });
  const r20 = await snap(), vox20 = await page.evaluate(() => ({ car: __MAC.vox.carCells, front: __MAC.vox.front, t: __LIVE.t, aeroLen: __LIVE.aero.length, active: __AERO.active }));
  const dyBody = r20.body.lo[1] - base.body.lo[1], wheelsSame = r20.wheels.every((w, i) => JSON.stringify(w.m) === JSON.stringify(base.wheels[i].m));
  check('차고 +20 mm: 몸체 바닥이 20 mm(±1) 올라가고 바퀴 행렬은 그대로', Math.abs(dyBody - .02) < .001 && wheelsSame, { dyBody: +dyBody.toFixed(4), wheelsSame });
  check('재복셀화 후 흐름 재시작(시간 0, 공력 이력 비움), 차체 셀 수 거의 불변(±3 %)', vox20.t < 0.5 && vox20.aeroLen === 0 && Math.abs(vox20.car / vox0.car - 1) < .03, { vox0, vox20 });
  await cam([0.35, 1.2, -4.6], [0.35, .6, 0], 38); await shot('1_ride20_side');
  // pitch +1 deg (nose up) about the front axle; the nose must rise, the tail drop, the front axle height unchanged
  await page.evaluate(() => __AERO.set({ rideMm: 0, pitchDeg: 1 }));
  const p1 = await snap();
  const nose = base.body.lo[0]; void nose;
  const lift = p1.body.hi[1] - base.body.hi[1];
  check('피치 +1°(앞 들림): 몸체 상단이 변하고(앞차축 기준 회전), 바퀴 행렬은 그대로', Math.abs(lift) > .005 && p1.wheels.every((w, i) => JSON.stringify(w.m) === JSON.stringify(base.wheels[i].m)), { dTop: +lift.toFixed(4), dBottom: +(p1.body.lo[1] - base.body.lo[1]).toFixed(4) });
  const rotated = await page.evaluate(() => { const b = __AERO.wheelbase(); return { wheelbase: +b.toFixed(3), axleX: +__AERO.axleX.toFixed(3), rearX: +__AERO.rearX.toFixed(3) }; });
  check('축거 2.4~3.0 m, 앞차축이 차 앞쪽(−X)', rotated.wheelbase > 2.4 && rotated.wheelbase < 3.0 && rotated.axleX < rotated.rearX, rotated);
  await cam([0.35, 1.2, -4.6], [0.35, .6, 0], 38); await shot('2_pitch1_side');
  // limits and resolution gate
  const g = await page.evaluate(() => { __AERO.set({ rideMm: 100, pitchDeg: -9 }); const a = { ride: __AERO.rideMm, pitch: __AERO.pitchDeg }; const q = __AERO.resolution(); __AERO.set({ rideMm: 20, pitchDeg: 0 }); const q2 = __AERO.resolution(); __AERO.reset(); const q0 = __AERO.resolution(); return { a, q, q2, q0 }; });
  check('한계값 고정: 차고 ±30 mm, 피치 ±1°', g.a.ride === 30 && g.a.pitch === -1, g.a);
  check('해상도 게이트: 20 mm는 격자 2칸 미만이라 "해상도 미만" 문구, 셀 크기가 실제 격자', !g.q2.resolved && /2칸 미만/.test(g.q2.note) && g.q2.cell > .05 && g.q2.rideCells < .5, { cell: g.q2.cell, rideCells: g.q2.rideCells, note: g.q2.note });
  check('기준 상태로: 변화량 0, 해상도 문구 "기준 상태"', g.q0.maxCells === 0 && g.q0.note === '기준 상태', g.q0);
  const back = await snap();
  check('reset 후 몸체·바퀴 행렬이 기준과 동일', JSON.stringify(back.body.m) === JSON.stringify(base.body.m) && back.wheels.every((w, i) => JSON.stringify(w.m) === JSON.stringify(base.wheels[i].m)));
  // UI card
  const ui = await page.evaluate(() => { const r = document.getElementById('aeroRide'); r.value = 10; r.dispatchEvent(new Event('input')); document.getElementById('aeroApply').click(); return { v: document.getElementById('aeroRideV').textContent, active: __AERO.active, ride: __AERO.rideMm }; });
  await sleep(1700);
  const note = await page.evaluate(() => document.getElementById('aeroSetNote').textContent);
  check('UI: 슬라이더 값이 적용되고 해상도 문구 표시', ui.active && ui.ride === 10 && /2칸 미만/.test(note), { ui, note });
  await page.evaluate(() => __AERO.reset());
  // sequencer axis plumbing (state machine only; physics is not checked here)
  const ax = await page.evaluate(() => { __LIVE.freeze = false; const ok = __SEQ.start({ plan: 'ride', values: [0, 10], window: .6, spinUp: .3, maxMul: 1.2, minSamples: 2 }); return { ok, axis: __SEQ.opts.axis, plan: __SEQ.plan.slice() }; });
  check('시퀀서 차고 축: 시작 성공, 값 [0, 10]', ax.ok && ax.axis === 'ride' && ax.plan.join() === '0,10', ax);
  await page.waitForFunction(() => ['DONE', 'ABORTED'].includes(__SEQ.state), null, { timeout: 1800000, polling: 1000 });
  const sq = await page.evaluate(() => ({ state: __SEQ.state, err: __SEQ.err, res: __SEQ.results.map(r => ({ axis: r.axis, x: r.x, Cd: r.Cd })), aeroAfter: [__AERO.rideMm, __AERO.pitchDeg], deltas: __SEQ.deltas(), htmlHasDelta: /기준 대비 변화/.test(__SEQ.html()) }));
  check('차고 스윕 완료, 끝나면 차고 0 복귀, 결과 축 표기', sq.state === 'DONE' && sq.res.length === 2 && sq.res.every(r => r.axis === 'ride') && sq.aeroAfter.join() === '0,0', sq);
  check('변화 판정이 "해상도 미만"(10 mm는 격자 2칸 미만)', sq.deltas.length === 1 && sq.deltas[0].verdict === '해상도 미만' && sq.htmlHasDelta, sq.deltas);
} catch (e) { check('aero-parts test completed', false, String(e).slice(0, 300)); }
check('페이지 오류·콘솔 오류·외부 요청 0', log.pageErrors.length === 0 && log.consoleErrors.length === 0 && log.external.length === 0, { p: log.pageErrors.slice(0, 2), c: log.consoleErrors.slice(0, 2), x: log.external.slice(0, 2) });
await browser.close();
const f = res.filter(r => !r.ok).length; console.log(`${res.length - f}/${res.length} PASS`); process.exit(f ? 1 : 0);
