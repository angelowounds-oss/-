/* global AETHER __VEHICLE __PAINT __CINE */
// Second vehicle (Koenigsegg Agera): boots under its own contract, flows, can be repainted, and the UI switch reloads with the other car. node tests/vehicles.mjs
import path from 'node:path'; import fs from 'node:fs';
import { open, sleep } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(root, 'tests/out/vehicles'); fs.mkdirSync(outDir, { recursive: true });
const url = 'file://' + path.join(root, 'dist/aether.html');
const res = []; const check = (n, ok, d) => { res.push({ n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); };
const { browser, page, log } = await open(url + '#q=LITE&car=agera', { width: 1280, height: 720 });
try {
  await page.waitForSelector('#scGo.rdy', { timeout: 400000 });
  await page.evaluate(() => { document.getElementById('scGo').click(); });
  await sleep(1500);
  await page.waitForFunction(() => window.__LIVE && __LIVE.ok && window.__PERF?.cal?.done, null, { timeout: 400000 });
  const A = await page.evaluate(() => { const b = AETHER.VEHICLE_TRANSFORM.worldAABB, d = AETHER.VEHICLE_TRANSFORM.dimensions, m = AETHER.M11; return { id: __VEHICLE.id, label: __VEHICLE.label, list: __VEHICLE.list.map(x => x.id), m11: m.passed, failed: Object.entries(m.checks).filter(([, v]) => !v).map(([k]) => k), dims: d, aabb: [b.min.map(v => +v.toFixed(3)), b.max.map(v => +v.toFixed(3))], wheels: m.wheels.map(w => [+w.radius.toFixed(3), +w.widthZ.toFixed(3)]), wheelbase: +m.transform.wheelbase.toFixed(3), track: +m.transform.trackWidth.toFixed(3), assetId: AETHER.ASSETS.vehicle.id, sel: document.getElementById('carSel')?.value, selOpts: [...(document.getElementById('carSel')?.options || [])].map(o => o.value) }; });
  console.log(JSON.stringify(A));
  check('Agera 프로필로 부팅(#car=agera), 차량 목록에 bmw·agera', A.id === 'agera' && A.list.includes('bmw') && A.list.includes('agera'), { id: A.id, list: A.list });
  check('M11 차량 계약 점검 통과(전방 방향·휠·지면 접촉·치수·중심선 포함)', A.m11 === true && A.failed.length === 0, A.failed);
  check('치수: 길이 4.293 m, 폭 2.0~2.2 m, 높이 1.1~1.2 m', Math.abs(A.dims.lengthX - 4.293) < 1e-9 && A.dims.widthZ > 2 && A.dims.widthZ < 2.2 && A.dims.heightY > 1.1 && A.dims.heightY < 1.2, A.dims);
  check('바퀴 4개: 반지름 0.28~0.36 m, 축거 2.4~2.8 m, 윤거 1.5~1.8 m', A.wheels.length === 4 && A.wheels.every(([r]) => r > .28 && r < .36) && A.wheelbase > 2.4 && A.wheelbase < 2.8 && A.track > 1.5 && A.track < 1.8, { w: A.wheels, wb: A.wheelbase, tr: A.track });
  check('UI: 차량 선택 상자가 agera를 가리키고 선택지 2개', A.sel === 'agera' && A.selOpts.length === 2, { sel: A.sel, opts: A.selOpts });
  await page.evaluate(() => { const sp = document.getElementById('scSplash'); if (sp) sp.style.display = 'none'; __CINE.cancel('veh'); __LIVE.api.run(200, 0.02); });
  const F = await page.evaluate(() => ({ Cd: __LIVE.forces?.Cd, A: __LIVE.forces?.A, t: __LIVE.t, solid: __LIVE.api.divStats ? true : null }));
  check('유동 계산이 돌고 힘이 유한함(Cd 0.05~3, 기준면적 0.8~2.6 m²)', Number.isFinite(F.Cd) && F.Cd > .05 && F.Cd < 3 && F.A > .8 && F.A < 2.6, F);
  const P = await page.evaluate(() => { __PAINT.select(2); const a = __PAINT.idx; __PAINT.select(0); return a; });
  check('도장 프리셋 선택이 Agera에서도 동작', P === 2, P);
  await page.screenshot({ path: path.join(outDir, 'agera.png'), timeout: 300000 });
  // switching from the UI: reloads with the BMW profile
  const nav = page.waitForNavigation({ timeout: 120000 }).catch(() => null);
  const sw = await page.evaluate(() => { setTimeout(() => __VEHICLE.set('bmw'), 50); return true; }); // set() reloads the page, so it must not be awaited inside evaluate
  await nav; await sleep(1000);
  const hash = await page.evaluate(() => location.hash);
  check('차량 바꾸기(bmw): 다시 불러오며 해시에 car=bmw', sw === true && /car=bmw/.test(hash) && !/car=agera/.test(hash) && /q=LITE/.test(hash), { sw, hash });
  await page.waitForFunction(() => window.__VEHICLE, null, { timeout: 200000 });
  const id2 = await page.evaluate(() => __VEHICLE.id);
  check('다시 불러온 뒤 BMW 프로필', id2 === 'bmw', id2);
} catch (e) { check('vehicles test completed', false, String(e).slice(0, 300)); }
check('페이지 오류·콘솔 오류·외부 요청 0', log.pageErrors.length === 0 && log.consoleErrors.length === 0 && log.external.length === 0, { p: log.pageErrors.slice(0, 2), c: log.consoleErrors.slice(0, 2), x: log.external.slice(0, 2) });
await browser.close();
const f = res.filter(r => !r.ok).length; console.log(`${res.length - f}/${res.length} PASS`); process.exit(f ? 1 : 0);
