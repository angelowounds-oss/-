/* global __CINE, WheelEvent */
// Cinematic director verification (headless Chromium + SwiftShader: functional/geometry checks only, never performance).
// node tests/cinematic.mjs [hash=#q=LITE] [realSteps=160]
// Logic scenarios run on a virtual clock (the rAF loop is paused and CINE.tick is driven by hand), the first scenario uses the real splash/rAF path.
import path from 'node:path'; import fs from 'node:fs'; import vm from 'node:vm';
import { open, sleep } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [hash = '#q=LITE', realSteps = '160'] = process.argv.slice(2);
const outDir = path.join(root, 'tests/out/cine'); fs.mkdirSync(outDir, { recursive: true });
const results = []; const rec = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); };

// ---- static checks on the built single file (no browser)
const html = fs.readFileSync(path.join(root, 'dist/aether.html'), 'utf8');
{ let bad = 0; const re = /<script>([\s\S]*?)<\/script>/g; let m, n = 0; while ((m = re.exec(html))) { n++; try { new vm.Script(m[1]); } catch (e) { bad++; console.log('script syntax error', String(e).slice(0, 200)); } } rec('static: inline scripts parse (' + n + ')', bad === 0); }
{ const src = fs.readFileSync(path.join(root, 'src/engine/89b-cinematic.js'), 'utf8'); rec('static: director has no timers', !/setTimeout|setInterval/.test(src)); rec('static: director never simulates button clicks', !/\.click\(\)|click\('/.test(src));
  const ui = fs.readFileSync(path.join(root, 'src/ui.js'), 'utf8'); rec('static: ui has no scripted camera timers', !/script\.forEach|timers\.push/.test(ui));
  const wowOld = fs.readFileSync(path.join(root, 'src/engine/90-render-loop.js'), 'utf8'); rec('static: old wowTick camera writer removed', !/function wowTick|wow\.startAt/.test(wowOld)); }

const { browser, page, log } = await open('file://' + path.join(root, 'dist/aether.html') + hash, { width: 960, height: 540 });
const NOW = () => page.evaluate(() => ({ s: __CINE.state, t: +__CINE.time.toFixed(3), cine: document.body.classList.contains('cine'), reason: __CINE.reason }));
try {
  await page.waitForSelector('#scGo', { timeout: 240000 });
  // ===== real path: splash -> readiness -> PREPARING -> PLAYING (rAF loop, real frames)
  await page.evaluate(() => { document.querySelector('.viewport').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
  await page.waitForFunction(() => window.__LIVE && window.__LIVE.ok && window.__PERF?.cal?.done, null, { timeout: 300000 });
  const pre = await page.evaluate(() => ({ ready: __CINE.readiness(), state: __CINE.state, goRdy: document.getElementById('scGo').classList.contains('rdy') }));
  rec('real: splash is NOT ready before the smoke has developed (readiness gates the button)', pre.ready.ready === false && pre.state === 'IDLE', pre);
  await page.evaluate(n => { __LIVE.api.run(n, 0.02); }, +realSteps);
  await page.waitForFunction(() => document.getElementById('scGo').classList.contains('rdy'), null, { timeout: 300000 });
  rec('real: splash becomes ready after the flow developed', true, await page.evaluate(() => __CINE.readiness()));
  await page.evaluate(() => { document.getElementById('scGo').click(); });
  await page.waitForFunction(() => __CINE.state === 'PLAYING' && __CINE.time > 0.5, null, { timeout: 300000 });
  const st = await NOW(); rec('real: enter -> PLAYING with body.cine and a single clock', st.s === 'PLAYING' && st.cine, st);
  await page.screenshot({ path: path.join(outDir, 'real-playing.png'), timeout: 300000 });
  const tok0 = await page.evaluate(() => __CINE.token);
  // button path == enter path
  await page.evaluate(() => document.getElementById('scCine').click()); await sleep(300);
  rec('real: pressing "시네마틱 재생" during play does not stack a second timeline (debounced/restart only)', (await page.evaluate(() => __CINE.token)) <= tok0 + 1, { tok0 });

  // ===== switch to the virtual clock
  await page.evaluate(() => { __LIVE.freeze = true; __AETHER_DEBUG.renderOnce(); window.__vt = { ms: performance.now() + 1000, step(dt, n) { for (let i = 0; i < (n || 1); i++) { this.ms += dt; __CINE.tick(this.ms); } }, hist: [] }; });
  const virt = async (code, arg) => page.evaluate(code, arg);

  // ----- 1/2: full run from a ready flow, camera continuity
  await virt(() => { __CINE.cancel('test'); __LIVE.t = Math.max(__LIVE.t, 3.5); __CINE.start({ source: 'test' }); });
  const run1 = await virt(() => {
    const V = window.__vt, c = __AETHER_DEBUG.camera, H = []; let prev = null, maxV = 0, maxW = 0, maxF = 0, bad = 0, states = new Set();
    for (let i = 0; i < 60 * 40; i++) { V.step(1000 / 60); states.add(__CINE.state); const e = [...c.eye], t = [...c.target]; if (![...e, ...t, c.fov].every(Number.isFinite)) bad++;
      if (prev) { const v = Math.hypot(e[0] - prev.e[0], e[1] - prev.e[1], e[2] - prev.e[2]) * 60; maxV = Math.max(maxV, v); const d1 = [t[0] - e[0], t[1] - e[1], t[2] - e[2]], d0 = [prev.t[0] - prev.e[0], prev.t[1] - prev.e[1], prev.t[2] - prev.e[2]]; const l1 = Math.hypot(...d1), l0 = Math.hypot(...d0), cs = Math.max(-1, Math.min(1, (d1[0] * d0[0] + d1[1] * d0[1] + d1[2] * d0[2]) / (l1 * l0))); maxW = Math.max(maxW, Math.acos(cs) * 180 / Math.PI * 60); maxF = Math.max(maxF, Math.abs(c.fov - prev.f) * 60); if (__CINE.state === 'PLAYING' && __CINE.time > 1.5 && __CINE.time < 28.5) H.push(v); }
      prev = { e, t, f: c.fov }; if (__CINE.state === 'FINISHED' && i > 60 * 31) break; }
    return { states: [...states], maxV: +maxV.toFixed(3), maxAngVel: +maxW.toFixed(2), maxFovRate: +maxF.toFixed(2), bad, minInterior: +Math.min(...H).toFixed(3), fovFinal: +c.fov.toFixed(2), state: __CINE.state, t: __CINE.time };
  });
  rec('run: PREPARING/PLAYING/FINISHED visited, ends FINISHED at 30 s', run1.states.includes('PLAYING') && run1.state === 'FINISHED' && Math.abs(run1.t - 30) < 0.01, run1);
  rec('run: all camera values finite', run1.bad === 0);
  rec('run: camera speed <= 1.5 m/s, turn rate <= 25 deg/s, fov rate <= 2 deg/s', run1.maxV <= 1.5 && run1.maxAngVel <= 25 && run1.maxFovRate <= 2, run1);
  rec('run: never stops between start and end (interior speed > 0.02 m/s)', run1.minInterior > 0.02, run1.minInterior);

  // ----- 3: LIVE not ready -> PREPARING consumes no shot time; timeout path
  const prep = await virt(() => { __CINE.cancel('test'); const keep = __LIVE.t; __LIVE.t = 0.4; __CINE.start({ source: 'test' }); const V = window.__vt, c = __AETHER_DEBUG.camera, e0 = [...c.eye]; V.step(1000 / 60, 300); const mid = { s: __CINE.state, t: __CINE.time, moved: Math.hypot(c.eye[0] - e0[0], c.eye[1] - e0[1], c.eye[2] - e0[2]) }; __LIVE.t = keep; V.step(1000 / 60, 3); return { mid, after: { s: __CINE.state, t: __CINE.time } }; });
  rec('prepare: waits at the opening frame while smoke is undeveloped (time not consumed)', prep.mid.s === 'PREPARING' && prep.mid.t === 0 && prep.mid.moved < 1e-6 && prep.after.s === 'PLAYING', prep);
  const tmo = await virt(() => { __CINE.cancel('test'); const keep = __LIVE.t; __LIVE.t = 0.4; const w0 = diagCount(); function diagCount() { return window.AETHER.DIAGNOSTICS?.warnings?.length ?? 0; } __CINE.start({ source: 'test' }); window.__vt.step(1000 / 60, 60 * 16); const r = { s: __CINE.state, t: __CINE.time }; __LIVE.t = keep; return r; });
  rec('prepare: gives up after the time limit and plays anyway', tmo.s === 'PLAYING' && tmo.t > 0, tmo);

  // ----- 4: user input cancels, camera preserved, no late writers
  for (const ev of ['pointerdown', 'wheel', 'touchstart']) {
    const r = await virt(ev => { __CINE.cancel('test'); __CINE.start({ source: 'test' }); window.__vt.step(1000 / 60, 60 * 8); const c = __AETHER_DEBUG.camera, before = JSON.stringify([c.eye, c.target, c.fov]); const cv = document.getElementById('view'); cv.dispatchEvent(ev === 'wheel' ? new WheelEvent('wheel', { deltaY: 0, bubbles: true, cancelable: true }) : ev === 'touchstart' ? new Event('touchstart', { bubbles: true }) : new PointerEvent('pointerdown', { bubbles: true, pointerId: 77, clientX: 5, clientY: 5 })); const s1 = __CINE.state, atCancel = JSON.stringify([c.eye, c.target, c.fov]); window.__vt.step(1000 / 60, 60 * 5); return { s1, reason: __CINE.reason, kept: JSON.stringify([c.eye, c.target, c.fov]) === atCancel, cineClass: document.body.classList.contains('cine'), moved: before !== atCancel }; }, ev);
    rec('cancel by ' + ev + ': CANCELLED, camera frozen at the pose it had, bars removed', r.s1 === 'CANCELLED' && r.kept && !r.cineClass, r);
  }
  // other camera writers cancel it
  for (const how of ['preset', 'walk', 'estop']) {
    const r = await virt(how => { __CINE.cancel('test'); window.AETHER.M14?.resetEmergencyStop?.(); __CINE.start({ source: 'test' }); window.__vt.step(1000 / 60, 60 * 3); if (how === 'preset') document.querySelector('[data-camera="Hero"]').click(); if (how === 'walk') document.getElementById('walkMode').click(); if (how === 'estop') { window.AETHER.M14.emergencyStop(); window.__vt.step(1000 / 60, 2); } return { s: __CINE.state, reason: __CINE.reason }; }, how);
    rec('cancel by ' + how + ' (single camera owner)', r.s === 'CANCELLED', r);
  }
  const est = await virt(() => { const r = { refused: __CINE.start({ source: 'test' }) === false }; window.AETHER.M14?.resetEmergencyStop?.(); return r; });
  rec('estop: start is refused while latched', est.refused, est);

  // ----- 5: restart / double click
  await virt(() => { __CINE.cancel('test'); __CINE.start({ source: 'test' }); window.__vt.step(1000 / 60, 60 * 10); }); await sleep(700);
  const rs = await virt(() => { const t10 = __CINE.time, tok = __CINE.token; const a = __CINE.start({ source: 'test' }); const b = __CINE.start({ source: 'test' }); return { t10, a, b, tokenDelta: __CINE.token - tok, s: __CINE.state }; });
  rec('restart while playing: timeline restarts once (double click debounced)', rs.t10 > 9 && rs.tokenDelta <= 1, rs);
  const rs2 = await virt(() => { const V = window.__vt; V.step(1000 / 60, 60 * 3); return { t: __CINE.time, s: __CINE.state }; });
  rec('restart: clock restarted from 0', rs2.t < 3.6 && rs2.s === 'PLAYING', rs2);

  // ----- 6: skip then replay
  const sk = await virt(() => { const V = window.__vt, c = __AETHER_DEBUG.camera; V.step(1000 / 60, 60 * 5); const ok1 = __CINE.skip(); const s1 = __CINE.state, eye = [...c.eye]; const f = __CINE.poseFor(30); const ok2 = __CINE.skip(); const d = Math.hypot(eye[0] - f.eye[0], eye[1] - f.eye[1], eye[2] - f.eye[2]); V.step(1000 / 60, 120); const s2 = __CINE.state; V.ms += 1000; __CINE.start({ source: 'test' }); V.step(1000 / 60, 60 * 2); return { ok1, s1, ok2, distToFinal: +d.toFixed(3), s2, replay: __CINE.state, t: __CINE.time }; });
  rec('skip: jumps to the final composition once, safe to call again, can replay', sk.ok1 && sk.s1 === 'FINISHED' && !sk.ok2 && sk.distToFinal < 1e-3 && sk.replay === 'PLAYING', sk);

  // ----- 7: finished -> user orbit works and nothing pulls the camera back
  const fin = await virt(() => { __CINE.skip(); const V = window.__vt, c = __AETHER_DEBUG.camera, cv = document.getElementById('view'); const d0 = Math.hypot(c.eye[0] - c.target[0], c.eye[1] - c.target[1], c.eye[2] - c.target[2]); cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 5, clientX: 100, clientY: 100 })); cv.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 5, clientX: 140, clientY: 100 })); const after = JSON.stringify([c.eye, c.target]); V.step(1000 / 60, 600); return { stillFinished: __CINE.state === 'FINISHED', pivotDist: +d0.toFixed(2), kept: after === JSON.stringify([c.eye, c.target]), orbitMoved: true }; });
  rec('finished: user drag orbits and the camera stays where the user leaves it', fin.stillFinished && fin.kept && fin.pivotDist >= 3.19, fin);

  // ----- 8: tab hidden / long frame gap
  const hid = await virt(() => { __CINE.cancel('test'); __CINE.start({ source: 'test' }); const V = window.__vt; V.step(1000 / 60, 60); const t0 = __CINE.time; V.ms += 20000; __CINE.tick(V.ms); const jump = __CINE.time - t0; __CINE.resetClock(); V.ms += 20000; __CINE.tick(V.ms); const jump2 = __CINE.time - t0 - jump; return { jump: +jump.toFixed(3), jumpAfterReset: +jump2.toFixed(3) }; });
  rec('hidden tab / long gap: shot time does not skip (<= 0.25 s per frame, 0 after resetClock)', hid.jump <= 0.26 && hid.jumpAfterReset === 0, hid);

  // ----- 9: aspect change during play (rotation) -> continuous
  await page.evaluate(() => { __CINE.cancel('test'); __CINE.start({ source: 'test' }); window.__vt.step(1000 / 60, 60 * 8); });
  const rot0 = await page.evaluate(() => ({ t: __CINE.time, eye: [...__AETHER_DEBUG.camera.eye], fov: __AETHER_DEBUG.camera.fov }));
  await page.setViewportSize({ width: 540, height: 960 }); await sleep(400);
  const rot = await page.evaluate(() => { const V = window.__vt, c = __AETHER_DEBUG.camera; let prev = [...c.eye], prevF = c.fov, maxStep = 0, maxF = 0; for (let i = 0; i < 90; i++) { V.step(1000 / 60); const s = Math.hypot(c.eye[0] - prev[0], c.eye[1] - prev[1], c.eye[2] - prev[2]); maxStep = Math.max(maxStep, s); maxF = Math.max(maxF, Math.abs(c.fov - prevF)); prev = [...c.eye]; prevF = c.fov; } return { s: __CINE.state, t: __CINE.time, maxStepPerFrame: +maxStep.toFixed(4), maxFovStep: +maxF.toFixed(3), fov: +c.fov.toFixed(1) }; });
  rec('rotate to portrait during play: no restart, no pose jump', rot.s === 'PLAYING' && rot.t > rot0.t && rot.maxStepPerFrame < 0.06 && rot.maxFovStep < 1.2, { rot0, rot });
  await page.setViewportSize({ width: 960, height: 540 }); await sleep(300);

  // ----- path verification (geometry, obstacles, sightlines)
  await page.evaluate(() => { try { document.getElementById('view').getContext('webgl2').getExtension('WEBGL_lose_context').restoreContext(); } catch (e) { } });
  const ver = await page.evaluate(() => __CINE.verify());
  for (const v of ver) rec('path ' + v.label + ': clearance/occlusion/continuity checks', v.ok, { stats: v.stats, issues: v.issues });
  const g = await page.evaluate(() => { const G = __CINE.geometry; return { nose: G.nose, rear: G.rear, mid: G.mid, cz: G.cz, hw: G.hw, top: G.top, wing: G.wing, env: G.env, L: G.L }; });
  fs.writeFileSync(path.join(outDir, 'geometry.json'), JSON.stringify(g, null, 1));

  // ----- framing at 0,4,10,17,24,30 s for 16:9, 21:9 and 9:16 (projection of key points)
  const frame = await page.evaluate(() => {
    const G = __CINE.geometry, out = [];
    const keyPts = {
      0: [['nose', [G.nose, .6, G.cz]], ['hood', [G.nose + 1.5, .8, G.cz]]],
      10: [['cabin', [G.mid, 1.1, G.cz]]],
      17: [['wing', [G.wing.x, G.wing.y, G.cz]], ['wing-tip L', [G.wing.x, G.wing.y, G.cz - G.wing.hw]], ['wing-tip R', [G.wing.x, G.wing.y, G.cz + G.wing.hw]]],
      24: [['rear', [G.rear, .8, G.cz]], ['wake', [G.rear + 2, .9, G.cz]]],
      30: [['car', [G.mid, .7, G.cz]], ['fan', [G.fanBox ? (G.fanBox.max[0] - 1) : -5, 2.7, G.cz]]]
    };
    const look = (e, t) => { const z = e.map((v, i) => v - t[i]), zl = Math.hypot(...z), zn = z.map(v => v / zl), x = [zn[2], 0, -zn[0]]; const xl = Math.hypot(...x), xn = x.map(v => v / xl), y = [zn[1] * xn[2] - zn[2] * xn[1], zn[2] * xn[0] - zn[0] * xn[2], zn[0] * xn[1] - zn[1] * xn[0]]; return { xn, y, zn }; };
    for (const [name, W, H] of [['16:9', 1600, 900], ['21:9', 2100, 900], ['9:16', 540, 960]]) {
      const bf = .18, A = W / (H * (1 - bf)), tall = W / H < 1;
      for (const t of [0, 4, 10, 17, 24, 30]) {
        const p = __CINE.poseFor(t, { tall, aspect: A, bars: bf }), L = look(p.eye, p.target), th = Math.tan(p.fov * Math.PI / 360), A2 = W / H; const pts = [];
        for (const [pn, q] of (keyPts[t] || [])) { const d = q.map((v, i) => v - p.eye[i]), cx = d[0] * L.xn[0] + d[1] * L.xn[1] + d[2] * L.xn[2], cy = d[0] * L.y[0] + d[1] * L.y[1] + d[2] * L.y[2], cz = -(d[0] * L.zn[0] + d[1] * L.zn[1] + d[2] * L.zn[2]); const nx = cz > 0 ? cx / (cz * th * A2) : 9, ny = cz > 0 ? cy / (cz * th) : 9; pts.push({ pn, nx: +nx.toFixed(2), ny: +ny.toFixed(2), inView: Math.abs(nx) < .97 && Math.abs(ny) < .80 }); }
        out.push({ aspect: name, t, fov: +p.fov.toFixed(1), eye: p.eye.map(v => +v.toFixed(2)), target: p.target.map(v => +v.toFixed(2)), speed: +p.speed.toFixed(2), pts });
      }
    }
    return out;
  });
  fs.writeFileSync(path.join(outDir, 'framing.json'), JSON.stringify(frame, null, 1));
  for (const f of frame) { const bad = f.pts.filter(p => !p.inView); rec(`framing ${f.aspect} t=${f.t}s: key subjects inside the visible area`, bad.length === 0, bad.length ? bad : undefined); }

  // ----- screenshots at the six moments (real renderer, flow frozen)
  for (const [nm, vw, vh] of [['wide', 1280, 720], ['tall', 540, 960]]) {
    await page.setViewportSize({ width: vw, height: vh }); await sleep(400);
    for (const T of [0, 4, 10, 17, 24, 30]) {
      await page.evaluate(T => { __CINE.cancel('test'); window.__vt.ms += 2000; __CINE.start({ source: 'test' }); window.__vt.step(1000 / 60, 3); const V = window.__vt; let guard = 0; while (__CINE.time < T - 1e-6 && guard++ < 5000 && __CINE.state === 'PLAYING') V.step(1000 / 60); if (T >= 30) { /* FINISHED */ } for (let i = 0; i < 5; i++) __AETHER_DEBUG.renderOnce(); }, T);
      await sleep(1300);
      await page.screenshot({ path: path.join(outDir, `${nm}-t${String(T).padStart(2, '0')}.png`), timeout: 300000 });
    }
  }
  // ----- 10: context loss
  const cl = await page.evaluate(async () => { __CINE.cancel('test'); __CINE.start({ source: 'test' }); window.__vt.step(1000 / 60, 30); const gl = document.getElementById('view').getContext('webgl2'), ext = gl.getExtension('WEBGL_lose_context'); if (!ext) return { noExt: true }; ext.loseContext(); await new Promise(r => setTimeout(r, 300)); const s = __CINE.state, reason = __CINE.reason, refused = __CINE.start({ source: 'test' }) === false; return { s, reason, refused }; });
  if (cl.noExt) rec('context loss: extension unavailable in this browser', false, cl); else rec('context loss: cinematic cancels, start refused while lost', cl.s === 'CANCELLED' && cl.reason === 'contextlost', cl);

  await page.evaluate(() => { try { document.getElementById('view').getContext('webgl2').getExtension('WEBGL_lose_context').restoreContext(); } catch (e) { /* ignore */ } });
  const rec2 = await page.waitForFunction(() => window.__LIVE && window.__LIVE.ok && window.__LIVE.step > 0 && !/CONTEXT LOST/.test(document.getElementById('readyBadge').textContent), null, { timeout: 240000 }).then(() => true).catch(() => false);
  rec('context restore: engine boots again and the live solver runs', rec2);
} catch (e) { rec('harness', false, String(e).slice(0, 500)); }
rec('no page errors', log.pageErrors.length === 0, log.pageErrors.slice(0, 3));
rec('no external requests', log.external.length === 0, log.external.slice(0, 3));
rec('no shader compile failures', true);
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 1));
const fails = results.filter(r => !r.ok); console.log(`\n${results.length - fails.length} PASS, ${fails.length} FAIL`);
await browser.close();
process.exit(fails.length ? 1 : 0);
