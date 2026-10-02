/* global AETHER */
// Clicks the 3D control-room console (buttons and sockets) with real pointer events at their projected screen position.
import path from 'node:path';
import { open } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { browser, page, log } = await open('file://' + path.join(root, 'dist/aether.html') + '#q=LITE', { width: 1280, height: 720 });
const out = [];
try {
  await page.waitForSelector('#scGo', { timeout: 240000 });
  await page.evaluate(() => document.getElementById('view').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await page.waitForFunction(() => window.__LIVE && window.__LIVE.ok && window.__PERF?.cal?.done, null, { timeout: 300000 });
  await page.evaluate(() => { __LIVE.api.run(20, 0.02); document.getElementById('scSplash').remove(); __AETHER_DEBUG.setPreset('Control'); __AETHER_DEBUG.renderOnce(); });
  const res = await page.evaluate(() => {
    const cam = __AETHER_DEBUG.camera, cv = document.getElementById('view'), r = cv.getBoundingClientRect(), C = window.__CONTROLS;
    const sub = (a, b) => a.map((v, i) => v - b[i]), nrm = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); }, cr = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dt = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const f = nrm(sub(cam.target, cam.eye)), right = nrm(cr(f, nrm(cam.up))), up = cr(right, f), th = Math.tan(cam.fov * Math.PI / 360), asp = r.width / r.height;
    const toScreen = p => { const d = sub(p, cam.eye), z = dt(d, f); if (z <= 0) return null; const nx = dt(d, right) / (z * th * asp), ny = dt(d, up) / (z * th); return { x: r.left + (nx + 1) / 2 * r.width, y: r.top + (1 - ny) / 2 * r.height, vis: Math.abs(nx) < 1 && Math.abs(ny) < 1 }; };
    const click = pt => { const o = { bubbles: true, cancelable: true, pointerId: 9, clientX: pt.x, clientY: pt.y }; cv.dispatchEvent(new PointerEvent('pointerdown', o)); cv.dispatchEvent(new PointerEvent('pointerup', o)); };
    const objs = __AETHER_DEBUG.scene.objects.filter(o => o.m14Action), socks = AETHER.M6?.sockets || [];
    const rep = { actions: objs.map(o => o.m14Action), sockets: socks.map(s => s.id), results: {} };
    const snap = () => ({ e: C.getSnapshot().control.emergencyStopped, road: C.getSnapshot().control.rollingRoadEnabled, w: __LIVE.U, fan: AETHER.FAN_MODULE.visualRunning, paused: !!__LIVE.freeze, mode: __LIVE.mode, color: __LIVE.colorMode, preset: __AETHER_DEBUG.camera.preset });
    const tryOne = (name, p) => { const sc = toScreen(p); if (!sc || !sc.vis) { rep.results[name] = 'not on screen'; return; } const b = JSON.stringify(snap()); click(sc); const a = JSON.stringify(snap()); rep.results[name] = b !== a ? 'changed' : 'no change'; };
    for (const o of objs) { if (o.m14Action === 'ESTOP') continue; tryOne('btn ' + o.m14Action, o.center); }
    for (const s of socks) { if (s.id === 'EMERGENCY_STOP') continue; tryOne('socket ' + s.id, s.position); __AETHER_DEBUG.setPreset('Control'); }
    for (const o of objs) if (o.m14Action === 'ESTOP') tryOne('btn ESTOP', o.center);
    rep.estopLatched = C.getSnapshot().control.emergencyStopped;
    return rep;
  });
  out.push(res); console.log(JSON.stringify(res, null, 1));
} catch (e) { console.log('ERR', String(e).slice(0, 400)); }
console.log('pageErrors', JSON.stringify(log.pageErrors.slice(0, 3)));
await browser.close();
