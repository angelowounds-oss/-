/* global __SEQ __CONTROLS __YAW */
// Mechanics of the automatic test sequencer on a short, cheap sweep (LITE grid, tiny windows). The numbers are NOT physics checks (the flow has no
// time to develop); this verifies the state machine, restoring of yaw/wind, abort paths and the CSV/JSON/HTML/SVG outputs. node tests/sequencer.mjs
import path from 'node:path'; import fs from 'node:fs';
import { open, sleep } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(root, 'tests/out/sequencer'); fs.mkdirSync(outDir, { recursive: true });
const { browser, page, log } = await open('file://' + path.join(root, 'dist/aether.html') + '#q=LITE', { width: 1280, height: 720 });
const res = []; const check = (n, ok, d) => { res.push({ n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); };
const waitState = (st, timeout) => page.waitForFunction(s => s.includes(__SEQ.state), st, { timeout, polling: 1000 });
try {
  await page.waitForSelector('#scGo.rdy', { timeout: 240000 });
  await page.evaluate(() => { document.getElementById('scGo').click(); });
  await sleep(1500);
  await page.waitForFunction(() => window.__LIVE && __LIVE.ok && window.__PERF?.cal?.done, null, { timeout: 240000 });
  await page.evaluate(() => { const sp = document.getElementById('scSplash'); if (sp) sp.style.display = 'none'; window.__CINE?.cancel('seq'); __LIVE.freeze = false; });
  const est = await page.evaluate(() => __SEQ.estimate({ yaws: __SEQ.presets.quick.yaws, window: __SEQ.presets.quick.window, U: 5 }));
  check('예상 시간 공식: 5점 × (예열 5 s + 측정 6 s) = 55 s', est.points === 5 && Math.abs(est.simTotal - 55) < 1e-9, est);
  const started = await page.evaluate(() => __SEQ.start({ yaws: [-4, 0, 4], window: 1.2, spinUp: .5, maxMul: 1.3, minSamples: 3 }));
  check('시작 성공, 상태 SETUP/RUN', started && await page.evaluate(() => ['SETUP', 'RUN'].includes(__SEQ.state)));
  const t0 = Date.now();
  await waitState(['DONE', 'ABORTED'], 2400000);
  const R = await page.evaluate(() => ({ state: __SEQ.state, err: __SEQ.err, results: __SEQ.results, yawAfter: window.__YAW?.deg, U: __LIVE.U, csv: __SEQ.csv(), json: JSON.parse(__SEQ.json()), html: __SEQ.html(), svg: __SEQ.svg(), prog: __SEQ.progress() }));
  console.log('sweep wall', ((Date.now() - t0) / 1000).toFixed(0), 's;', JSON.stringify(R.results.map(r => ({ yaw: r.yaw, Cd: r.Cd && +r.Cd.toFixed(3), Cs: r.Cs && +r.Cs.toFixed(3), n: r.n, win: r.windowS, conv: r.converged, note: r.note, simEnd: r.simEnd }))));
  check('스윕 완료(DONE), 오류 없음', R.state === 'DONE' && !R.err, { state: R.state, err: R.err });
  check('결과 3점, 요각 순서 −4, 0, 4', R.results.length === 3 && R.results.map(r => r.yaw).join() === '-4,0,4', R.results.map(r => r.yaw));
  check('각 점: Cd·Cs·Cl이 유한한 수, 표본 ≥ 2, 측정 창 > 0', R.results.every(r => [r.Cd, r.Cs, r.Cl, r.CdStd].every(Number.isFinite) && r.n >= 2 && r.windowS > 0), R.results.map(r => [r.n, r.windowS]));
  check('끝난 뒤 원래 요각·풍속으로 복귀', R.yawAfter === 0 && R.U === 5, { yaw: R.yawAfter, U: R.U });
  check('진행률 1.0', R.prog === 1, R.prog);
  const lines = R.csv.split('\n');
  check('CSV: 머리글 + 3행, 열 18개', lines.length === 4 && lines.every(l => l.split(',').length === 18), lines.length);
  check('JSON: 조건·신뢰도·결과·대칭성 필드, Cl 신뢰 불가 문구', R.json.conditions && R.json.reliability?.Cl.includes('신뢰 불가') && R.json.results.length === 3 && Array.isArray(R.json.symmetry), Object.keys(R.json));
  check('JSON 조건: 등급·셀 크기·풍속·예열·창', R.json.conditions.tier === 'LITE' && R.json.conditions.cellM > 0 && R.json.conditions.U === 5 && R.json.conditions.windowS === 1.2, R.json.conditions);
  check('대칭성 점검: ±4° 한 쌍', R.json.symmetry.length === 1 && R.json.symmetry[0].yaw === 4, R.json.symmetry);
  check('SVG 그래프에 3개 계열', R.svg.startsWith('<svg') && (R.svg.match(/<polyline/g) || []).length === 3, R.svg.length);
  fs.writeFileSync(path.join(outDir, 'report.html'), R.html); fs.writeFileSync(path.join(outDir, 'sweep.csv'), R.csv); fs.writeFileSync(path.join(outDir, 'sweep.json'), JSON.stringify(R.json, null, 1));
  const rp = await browser.newPage({ viewport: { width: 900, height: 900 } }); await rp.setContent(R.html); await rp.screenshot({ path: path.join(outDir, 'report.png'), fullPage: true, timeout: 300000 }); await rp.close();
  // abort paths
  await page.evaluate(() => { __SEQ.start({ yaws: [3, 6], window: 5, spinUp: 5 }); });
  await sleep(4000);
  const a1 = await page.evaluate(() => { const yawDuring = window.__YAW.deg; __SEQ.abort('test'); return { yawDuring, state: __SEQ.state, yaw: window.__YAW.deg }; });
  check('중단: ABORTED 상태, 요각 원복', a1.state === 'ABORTED' && a1.yaw === 0 && a1.yawDuring === 3, a1);
  await page.evaluate(() => { __SEQ.start({ yaws: [3], window: 5, spinUp: 5 }); });
  await sleep(3000);
  const a2 = await page.evaluate(() => { __CONTROLS.emergencyStop(); return true; });
  await sleep(3000);
  const a3 = await page.evaluate(() => ({ state: __SEQ.state, msg: __SEQ.msg, yaw: window.__YAW.deg }));
  check('비상정지: 시험이 중단되고 요각 복귀', a2 && a3.state === 'ABORTED' && /비상정지/.test(a3.msg) && a3.yaw === 0, a3);
  await page.evaluate(() => __CONTROLS.resetEmergencyStop());
  const again = await page.evaluate(() => __SEQ.start({ yaws: [] }));
  check('빈 요각 목록은 시작 거부', again === false);
} catch (e) { check('sequencer test completed', false, String(e).slice(0, 300)); }
check('페이지 오류·콘솔 오류·외부 요청 0', log.pageErrors.length === 0 && log.consoleErrors.length === 0 && log.external.length === 0, { p: log.pageErrors.slice(0, 2), c: log.consoleErrors.slice(0, 2), x: log.external.slice(0, 2) });
await browser.close();
const f = res.filter(r => !r.ok).length; console.log(`${res.length - f}/${res.length} PASS`); process.exit(f ? 1 : 0);
