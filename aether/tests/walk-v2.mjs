/* global __WALK AETHER */
// Walking checks for the v2 tunnel: control room, door, stair, plenum, collisions + screenshots. node tests/walk-v2.mjs
import path from 'node:path'; import fs from 'node:fs';
import { open, sleep } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(root, 'tests/out/walk'); fs.mkdirSync(outDir, { recursive: true });
const { browser, page, log } = await open('file://' + path.join(root, 'dist/aether.html') + '#q=LITE', { width: 1280, height: 720 });
const res = []; const check = (n, ok, d) => { res.push({ n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); };
try {
  await page.waitForSelector('#scGo.rdy', { timeout: 240000 });
  await page.evaluate(() => { document.getElementById('scGo').click(); });
  await sleep(1500);
  await page.waitForFunction(() => window.__WALK && window.__LIVE && __LIVE.ok, null, { timeout: 240000 });
  await page.evaluate(() => { const sp = document.getElementById('scSplash'); if (sp) sp.style.display = 'none'; window.__CINE?.cancel('walk'); });
  await page.addStyleTag({ content: '.sc-cap,#lvStat,.hud,.sc-dock,.dock,.sc-bar,.wow-overlay,#scSkip,.fpv-help{display:none!important}' });
  const R = await page.evaluate(() => {
    const W = __WALK;
    const zh = 6.5, door = W.DOOR, out = {};
    out.built = door.built && door.v2 === true;
    out.spawnGround = W.ground(W.fpv.x, W.fpv.z);
    out.spawnFree = W.canWalk(W.fpv.x, W.fpv.z, W.fpv.x, W.fpv.z);
    // closed door blocks the doorway, an open door lets the walker through
    door.t = 0; out.closedBlocks = !W.canWalk(3.95, zh + .02, 3.95, zh + .3) && !W.canWalk(3.95, zh - .05, 3.95, zh + .3);
    door.t = 1; out.openPasses = W.canWalk(3.95, zh + .02, 3.95, zh + .3);
    // full route control room -> door -> stair -> plenum -> near the car; every step must be accepted and the ground may change by < 0.2 m per step
    const route = [[0, 9.6], [3.95, 9.6], [3.95, 5.0], [3.95, 3.0]], path = []; let ok = true, maxStep = 0, x = 0, z = 9.6, gMin = 9, gMax = -9;
    for (let i = 0; i < route.length - 1; i++) {
      const [ax, az] = route[i], [bx, bz] = route[i + 1], n = Math.ceil(Math.hypot(bx - ax, bz - az) / .05);
      for (let k = 1; k <= n; k++) { const nx = ax + (bx - ax) * k / n, nz = az + (bz - az) * k / n; if (!W.canWalk(nx, nz, x, z)) { ok = false; path.push([+nx.toFixed(2), +nz.toFixed(2)]); break; } maxStep = Math.max(maxStep, Math.abs(W.ground(nx, nz) - W.ground(x, z))); x = nx; z = nz; gMin = Math.min(gMin, W.ground(x, z)); gMax = Math.max(gMax, W.ground(x, z)); }
      if (!ok) break;
    }
    out.route = { ok, maxStep: +maxStep.toFixed(4), blockedAt: path[0] || null, end: [+x.toFixed(2), +z.toFixed(2)], gMin, gMax };
    // walls: the window wall and the plenum wall stay solid away from the door; room edges hold
    out.windowWallSolid = !W.canWalk(0, 6.45, 0, 6.0) && !W.canWalk(0, 6.9, 0, 7.2);
    out.roomEdge = !W.canWalk(-4.6, 8, -4.2, 8) && !W.canWalk(0, 12.1, 0, 11.6);
    out.stairGround = [W.ground(3.95, 6.4), W.ground(3.95, 6.0), W.ground(3.95, 5.7), W.ground(3.95, 5.4), W.ground(3.95, 5.0)].map(v => +v.toFixed(4));
    // console collision: the console (user GLB) is an obstacle
    const cb = AETHER.M6.bounds; out.consoleSolid = !W.canWalk((cb.min[0] + cb.max[0]) / 2, (cb.min[2] + cb.max[2]) / 2, (cb.min[0] + cb.max[0]) / 2, cb.max[2] + .6);
    // control-room furniture (SPEC.controlRoom.furniture): desks, chairs and the rack block; the aisle in front of the desks and between them stays open
    out.furniture = { desk1: !W.canWalk(-2.6, 11.1, -2.6, 10.5), desk2: !W.canWalk(.4, 11.1, .4, 10.5), chair: !W.canWalk(-2.6, 10.25, -2.6, 9.7), rack: !W.canWalk(-4.2, 8.5, -3.4, 8.5), aisleOpen: W.canWalk(-2.6, 9.4, -2.6, 9.2) && W.canWalk(-1.1, 11.1, -1.1, 10.7), } ;
    // plenum: still free around the nozzle exit, car and turntable remain obstacles
    out.plenumFree = W.canWalk(-4, 3.2, -4, 3.0); out.carSolid = !W.canWalk(0, 0, 0, 2);
    // aisle beside the collector up to the fan-room inspection hatches (back wall x=18.5, hatches z 4.1..5.3)
    let aisleOk = true; x = 3.95; z = 5.0; for (const [bx, bz] of [[5.0, 5.0], [17.4, 5.0]]) { const n = Math.ceil(Math.hypot(bx - x, bz - z) / .05); const ax = x, az = z; for (let k = 1; k <= n; k++) { const nx = ax + (bx - ax) * k / n, nz = az + (bz - az) * k / n; if (!W.canWalk(nx, nz, x, z)) { aisleOk = false; break; } x = nx; z = nz; } }
    out.aisle = { ok: aisleOk, end: [+x.toFixed(2), +z.toFixed(2)], funnelSolid: !W.canWalk(12, 3.5, 12, 4.4) && !W.canWalk(8, 3.9, 8, 5.0), backWallSolid: !W.canWalk(18.0, 5.0, 17.6, 5.0) };
    return out;
  });
  check('제어실 가구: 책상 2·의자·장비 랙은 통과 불가, 책상 앞 통로와 책상 사이는 열려 있음', Object.values(R.furniture).every(Boolean), R.furniture);
  check('복도: 수집부 옆을 따라 점검 개구부 앞(x 17.4)까지 걸어감, 깔때기·뒷벽은 통과 불가', R.aisle.ok && R.aisle.funnelSolid && R.aisle.backWallSolid, R.aisle);
  check('v2 문 장면 객체 생성(슬라이딩 12프레임)', R.built);
  check('제어실 시작 위치: 지면 0.75 m, 이동 가능', R.spawnGround === 0.75 && R.spawnFree, R.spawnGround);
  check('닫힌 문은 통과 불가, 열린 문은 통과 가능', R.closedBlocks && R.openPasses, { closed: R.closedBlocks, open: R.openPasses });
  check('경로 제어실→문→계단→플레넘: 막힘 없음, 한 걸음 높이 변화 < 0.2 m', R.route.ok && R.route.maxStep < .2 && R.route.gMin === 0 && R.route.gMax === 0.75, R.route);
  check('계단 높이 4단(0.75 → 0.5625 → 0.375 → 0.1875 → 0)', JSON.stringify(R.stairGround) === JSON.stringify([0.75, 0.5625, 0.375, 0.1875, 0]), R.stairGround);
  check('창이 있는 벽과 제어실 가장자리는 통과 불가', R.windowWallSolid && R.roomEdge);
  check('콘솔·차량은 장애물, 플레넘 노즐 앞은 이동 가능', R.consoleSolid && R.carSolid && R.plenumFree, R);
  // door animation: opens when the walker is near, closes when away
  const A = await page.evaluate(() => { const W = __WALK; W.fpv.enabled = true; W.fpv.x = 3.95; W.fpv.z = 5.6; W.DOOR.t = 0; for (let i = 0; i < 40; i++) W.update(.05); const open = W.DOOR.t; W.fpv.x = -3; W.fpv.z = 2; for (let i = 0; i < 60; i++) W.update(.05); return { open, closed: W.DOOR.t }; });
  check('문 자동 개폐: 가까우면 열림(≥0.99), 멀어지면 닫힘(0)', A.open >= .99 && A.closed === 0, A);
  const view = async (n, x, z, yaw, pitch, t = 0) => { await page.evaluate(([x, z, yaw, pitch, t]) => { const W = __WALK; W.fpv.enabled = true; W.fpv.x = x; W.fpv.z = z; W.fpv.yaw = yaw; W.fpv.pitch = pitch; W.fpv.gy = undefined; W.DOOR.t = t; W.update(0); }, [x, z, yaw, pitch, t]); await sleep(2500); await page.screenshot({ path: path.join(outDir, n + '.png'), timeout: 300000 }); };
  await view('1_room_to_window', 0, 9.6, 0, -.05);
  await view('2_room_to_door', 1.2, 8.6, Math.PI / 2 - .55, -.12, 1);
  await view('3_stair_closed', 3.95, 4.7, Math.PI, -.12, 0);
  await view('4_stair_open', 3.95, 5.0, Math.PI, -.2, 1);
  await view('5_plenum_to_door', 1.0, 2.0, Math.PI - .5, -.02, 0);
  await view('6_doorway_from_inside', 3.95, 7.4, Math.PI, 0, 1);
  await view('7_hatch_view', 17.2, 5.2, 1.1, -.02);
  await view('8_hatch_close', 17.4, 4.9, 1.45, 0);
  await page.evaluate(() => { const c = __AETHER_DEBUG.camera; c.preset = 'Fan'; document.querySelector('[data-camera="Fan"]')?.click(); }); await sleep(2500); await page.screenshot({ path: path.join(outDir, '9_fan_preset.png'), timeout: 300000 });
} catch (e) { check('walk test completed', false, String(e).slice(0, 300)); }
check('페이지 오류·콘솔 오류·외부 요청 0', log.pageErrors.length === 0 && log.consoleErrors.length === 0 && log.external.length === 0, { p: log.pageErrors.slice(0, 2), c: log.consoleErrors.slice(0, 2), x: log.external.slice(0, 2) });
await browser.close();
const f = res.filter(r => !r.ok).length; console.log(`${res.length - f}/${res.length} PASS`); process.exit(f ? 1 : 0);
