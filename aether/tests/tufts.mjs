/* global __TUFT __AERO __STREAK __YAW __CINE __WALK */
// Surface tufts / oil streaks: sampling quality, tangency, physical plausibility (roof flow goes downstream, the wake side reverses), the roots follow yaw and ride height,
// mode switching, screenshots. TUFT_Q (default LOW) and TUFT_STEPS (default 400) set the grid and the flow development time. node tests/tufts.mjs
import path from 'node:path'; import fs from 'node:fs';
import { open, sleep } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(root, 'tests/out/tufts'); fs.mkdirSync(outDir, { recursive: true });
const { browser, page, log } = await open('file://' + path.join(root, 'dist/aether.html') + '#q=' + (process.env.TUFT_Q || 'LOW'), { width: 1280, height: 720 });
const res = []; const check = (n, ok, d) => { res.push({ n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); };
const cam = (eye, target, fov = 45) => page.evaluate(([e, t, f]) => { __WALK.fpv.enabled = false; const c = __AETHER_DEBUG.camera; c.preset = 'WOW'; c.eye = e; c.target = t; c.up = [0, 1, 0]; c.fov = f; c.cutaway = false; }, [eye, target, fov]);
const shot = async n => { await sleep(3000); await page.screenshot({ path: path.join(outDir, n + '.png'), timeout: 300000 }); };
const waitStats = (minValid = 100, mode) => page.waitForFunction(([mv, m]) => __TUFT.stats && __TUFT.stats.valid > mv && (!m || __TUFT.stats.mode === m), [minValid, mode], { timeout: 600000, polling: 1000 });
try {
  await page.waitForSelector('#scGo.rdy', { timeout: 240000 });
  await page.evaluate(() => { document.getElementById('scGo').click(); });
  await sleep(1500);
  await page.waitForFunction(() => window.__LIVE && __LIVE.ok && window.__PERF?.cal?.done, null, { timeout: 240000 });
  await page.evaluate(() => { const sp = document.getElementById('scSplash'); if (sp) sp.style.display = 'none'; __CINE.cancel('tuft'); });
  await page.addStyleTag({ content: '.sc-cap,#lvStat,.hud,.sc-dock,.dock,.sc-bar,.wow-overlay,#scSkip,.fpv-help{display:none!important}' });
  const steps = +(process.env.TUFT_STEPS || 400), t0 = Date.now();
  await page.evaluate(n => { __LIVE.api.run(n, 0.02); __LIVE.freeze = true; __STREAK.mode = 'vol'; __TUFT.setMode('tuft'); }, steps);
  console.log('advanced', steps, 'steps in', ((Date.now() - t0) / 1000).toFixed(0), 's, sim t =', await page.evaluate(() => +__LIVE.t.toFixed(2)));
  await waitStats(100, 'tuft'); await sleep(6000); // a few more state updates so the smoothing has settled
  const R = await page.evaluate(() => {
    const T = __TUFT, st = T.stats, n = T.count, P = T.roots, N = T.nor, S = T.snap, vb = window.AETHER.VEHICLE_TRANSFORM.worldAABB, pad = .06;
    let outside = 0; for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) if (P[i * 3 + k] < vb.min[k] - pad || P[i * 3 + k] > vb.max[k] + pad) { outside++; break; }
    // minimum pairwise distance (hash grid)
    const sp = T.local.tuft.spacing, inv = 1 / sp, g = new Map(); let minD = 1e9;
    for (let i = 0; i < n; i++) { const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], ix = Math.floor(x * inv), iy = Math.floor(y * inv), iz = Math.floor(z * inv);
      for (let a = -1; a < 2; a++) for (let b = -1; b < 2; b++) for (let c = -1; c < 2; c++) { const L = g.get(((ix + a) * 73856093) ^ ((iy + b) * 19349663) ^ ((iz + c) * 83492791)); if (L) for (const j of L) { const d = Math.hypot(P[j * 3] - x, P[j * 3 + 1] - y, P[j * 3 + 2] - z); if (d < minD) minD = d; } }
      const k = ((ix) * 73856093) ^ ((iy) * 19349663) ^ ((iz) * 83492791); (g.get(k) || g.set(k, []).get(k)).push(i); }
    let tanMax = 0, lenErr = 0, nv = 0; for (let i = 0; i < n; i++) { if (!S.valid[i]) continue; nv++; const d = [S.dir[i * 3], S.dir[i * 3 + 1], S.dir[i * 3 + 2]], l = Math.hypot(...d); tanMax = Math.max(tanMax, Math.abs(d[0] * N[i * 3] + d[1] * N[i * 3 + 1] + d[2] * N[i * 3 + 2])); lenErr = Math.max(lenErr, Math.abs(l - 1)); }
    const nl = Math.max(...Array.from({ length: n }, (_, i) => Math.abs(Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) - 1)));
    return { n, area: T.local.tuft.area, sampleMs: Math.round(T.sampleMs), outside, minD, sp, tanMax, lenErr, nv, nl, stats: st, err: T.err };
  });
  const z = R.stats.zones, f = v => v === null ? null : +v.toFixed(3);
  console.log('zones:', JSON.stringify(Object.fromEntries(Object.entries(z).map(([k, v]) => [k, { n: v.n, reversed: f(v.reversed), downstream: f(v.downstream) }]))));
  console.log('count', R.n, 'valid', R.nv, 'mesh area m2', +R.area.toFixed(1), 'sampling ms', R.sampleMs, 'minD', +R.minD.toFixed(4));
  check('터프트 뿌리 3,000개 이상, 오류 없음', R.n >= 3000 && !R.err, { n: R.n, err: R.err });
  check('뿌리가 모두 차체 경계상자 근방(±6 cm)', R.outside === 0, R.outside);
  check('뿌리 간 최소 간격이 목표 간격의 0.99배 이상(푸아송)', R.minD >= R.sp * .99, { minD: R.minD, sp: R.sp });
  check('법선은 단위 길이, 방향 벡터는 표면 접선(|d·n| < 1e-3)·단위 길이', R.nl < 1e-4 && R.tanMax < 1e-3 && R.lenErr < 1e-3, { nl: R.nl, tanMax: R.tanMax, lenErr: R.lenErr });
  check('유효한(차체 밖으로 읽힌) 터프트가 충분히 있음(≥ 800)과 부위별 표본이 모두 있음', R.nv >= 800 && ['front', 'roof', 'side', 'rear'].every(k => z[k].n >= 20), Object.fromEntries(Object.entries(z).map(([k, v]) => [k, v.n])));
  check('지붕 터프트의 90 % 이상이 하류 방향(d.x > 0)', z.roof.downstream >= .9, { roof: f(z.roof.downstream) });
  check('후미 면의 역류(v.x < −0.08 U) 비율이 지붕보다 0.1 이상 큼(후류 쪽 역류)', z.rear.reversed - z.roof.reversed >= .1, { rear: f(z.rear.reversed), roof: f(z.roof.reversed) });
  await cam([0.35, 1.1, -4.3], [0.35, .65, 0], 40); await shot('1_side_tufts');
  await cam([4.8, 1.7, -3.3], [1.4, .8, 0], 45); await shot('2_rear_tufts');
  await cam([-3.6, 1.0, -2.0], [-1.6, .6, 0], 50); await shot('3_nose_tufts');
  // oil style
  await page.evaluate(() => __TUFT.setMode('oil')); await waitStats(300, 'oil'); await sleep(5000);
  const O = await page.evaluate(() => ({ n: __TUFT.count, err: __TUFT.err, mode: __TUFT.mode, valid: __TUFT.stats.valid }));
  check('오일 줄무늬 모드: 뿌리 6,000개 이상, 오류 없음', O.mode === 'oil' && O.n >= 6000 && !O.err, O);
  await cam([0.35, 1.1, -4.3], [0.35, .65, 0], 40); await shot('4_side_oil');
  await cam([4.8, 1.7, -3.3], [1.4, .8, 0], 45); await shot('5_rear_oil');
  // roots follow the car: yaw rotates them rigidly, ride height lifts them
  await page.evaluate(() => __TUFT.setMode('tuft')); await waitStats(100, 'tuft');
  const before = await page.evaluate(() => { const P = __TUFT.roots, n = __TUFT.count; let bi = 0, bj = 0, bd = 0; for (let i = 0; i < n; i += 7) for (let j = i + 1; j < n; j += 101) { const d = Math.hypot(P[i * 3] - P[j * 3], P[i * 3 + 2] - P[j * 3 + 2]); if (d > bd) { bd = d; bi = i; bj = j; } } return { bi, bj, key: __TUFT.key, a: [P[bi * 3], P[bi * 3 + 1], P[bi * 3 + 2]], b: [P[bj * 3], P[bj * 3 + 1], P[bj * 3 + 2]], n }; });
  await page.evaluate(() => { __LIVE.api.setYaw(8); });
  await page.waitForFunction(k => __TUFT.key !== k, before.key, { timeout: 300000, polling: 500 });
  await sleep(2500);
  const afterYaw = await page.evaluate(b => { const P = __TUFT.roots; return { a: [P[b.bi * 3], P[b.bi * 3 + 1], P[b.bi * 3 + 2]], b: [P[b.bj * 3], P[b.bj * 3 + 1], P[b.bj * 3 + 2]], n: __TUFT.count, yaw: window.__YAW.deg }; }, before);
  const ang = (a, b) => Math.atan2(b[2] - a[2], b[0] - a[0]) * 180 / Math.PI, dAng = ang(afterYaw.a, afterYaw.b) - ang(before.a, before.b), distB = Math.hypot(before.b[0] - before.a[0], before.b[2] - before.a[2]), distA = Math.hypot(afterYaw.b[0] - afterYaw.a[0], afterYaw.b[2] - afterYaw.a[2]);
  check('요각 +8°: 같은 두 뿌리 사이 벡터가 8°(±0.05°) 회전하고 거리·개수·높이 유지', Math.abs(Math.abs(dAng) - 8) < .05 && Math.abs(distA - distB) < 1e-3 && afterYaw.n === before.n && Math.abs(afterYaw.a[1] - before.a[1]) < 1e-4, { dAng: +dAng.toFixed(3), distB: +distB.toFixed(3), distA: +distA.toFixed(3), n: afterYaw.n });
  const k1 = await page.evaluate(() => { __LIVE.api.setYaw(0); return __TUFT.key; });
  await page.waitForFunction(k => __TUFT.key !== k, k1, { timeout: 300000, polling: 500 });
  const y0 = await page.evaluate(b => __TUFT.roots[b.bi * 3 + 1], before);
  const k2 = await page.evaluate(() => { __AERO.set({ rideMm: 20 }); return __TUFT.key; });
  await page.waitForFunction(k => __TUFT.key !== k, k2, { timeout: 300000, polling: 500 });
  const y1 = await page.evaluate(b => __TUFT.roots[b.bi * 3 + 1], before);
  check('차고 +20 mm: 뿌리가 20 mm(±1) 올라감', Math.abs(y1 - y0 - .02) < .001, { dy: +(y1 - y0).toFixed(4) });
  // UI card: mode select, length slider, statistics text, streakline toggle
  await page.evaluate(() => { __AERO.reset(); __TUFT.setMode('off'); });
  await page.selectOption('#tufMode', 'tuft'); await waitStats(100, 'tuft'); await sleep(2500);
  const ui = await page.evaluate(() => { const l = document.getElementById('tufLen'); l.value = 12; l.dispatchEvent(new Event('input')); const s0 = __STREAK.mode; document.getElementById('tufStreak').click(); return { mode: __TUFT.mode, len: __TUFT.len, text: document.getElementById('tufStat').textContent, lenV: document.getElementById('tufLenV').textContent, streak0: s0, streak1: __STREAK.mode }; });
  check('UI 카드: 모드 선택·길이 슬라이더(12 cm)·통계 문구·유적선 토글 동작', ui.mode === 'tuft' && Math.abs(ui.len - .12) < 1e-9 && /역류/.test(ui.text) && /\//.test(ui.text) && ui.lenV === '12 cm' && ui.streak0 !== ui.streak1, ui);
  await page.evaluate(() => { __TUFT.setMode('off'); });
  await sleep(1500);
  const off = await page.evaluate(() => ({ mode: __TUFT.mode, err: __TUFT.err }));
  check('끄기: 모드 off, 오류 없음', off.mode === 'off' && !off.err, off);
} catch (e) { check('tufts test completed', false, String(e).slice(0, 400)); }
check('페이지 오류·콘솔 오류·외부 요청 0', log.pageErrors.length === 0 && log.consoleErrors.length === 0 && log.external.length === 0, { p: log.pageErrors.slice(0, 2), c: log.consoleErrors.slice(0, 2), x: log.external.slice(0, 2) });
await browser.close();
const fl = res.filter(r => !r.ok).length; console.log(`${res.length - fl}/${res.length} PASS`); process.exit(fl ? 1 : 0);
