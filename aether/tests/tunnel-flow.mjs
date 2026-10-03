// Velocity profile / mass balance of the v2 tunnel at one tier. node tests/tunnel-flow.mjs '#q=LOW&tunnel=v2' [steps]
import path from 'node:path';
import { open } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const hash = process.argv[2] || '#q=LOW&tunnel=v2', steps = +(process.argv[3] || 600);
const { browser, page, log } = await open('file://' + path.join(root, 'dist/aether.html') + hash, { width: 640, height: 360 });
try {
  await page.waitForSelector('#scGo.rdy', { timeout: 240000 });
  await page.evaluate(() => { document.getElementById('scGo').click(); });
  await page.waitForFunction(() => window.__LIVE && __LIVE.ok && window.__PERF?.cal?.done, null, { timeout: 240000 });
  const r = await page.evaluate(n => {
    const A = __LIVE.api, M = window.__MAC; A.reset(); const t0 = performance.now(); A.run(n, 0.02);
    const sp = window.__TUNNEL_SPEC_DBG; void sp;
    const rd = (x, y, z) => A.read(x, y, z)[0];
    const flux = (x, y0, y1, hw) => { let q = 0, c = 0; const dy = (y1 - y0) / 16, dz = 2 * hw / 24; for (let j = 0; j < 16; j++) for (let k = 0; k < 24; k++) { q += rd(x, y0 + (j + .5) * dy, -hw + (k + .5) * dz) * dy * dz; c++; } return +q.toFixed(1); };
    const prof = { zExit: [], yExit: [], xAxis: [] };
    for (let z = -2.4; z <= 2.41; z += 0.4) prof.zExit.push([+z.toFixed(1), +rd(-5.2, 1.2, z).toFixed(2)]);
    for (let y = 0.2; y <= 3.7; y += 0.4) prof.yExit.push([+y.toFixed(1), +rd(-5.2, y, 0).toFixed(2)]);
    for (let x = -13.5; x <= 18.5; x += 2) prof.xAxis.push([x, +rd(x, 1.3, 0).toFixed(2)]);
    return { ms: Math.round(performance.now() - t0), N: M.N, U: __LIVE.U, inK: +M.inK.toFixed(3), inK0: +M.inK0.toFixed(3), ref: M.refSpeed && +M.refSpeed.toFixed(2), flags: A.flagCounts(), div: A.divStats(),
      flux: { 'inlet x=-13.5 (A=80)': flux(-13.5, .1, 7.9, 4.9), 'nozzle x=-9 ': flux(-9, .1, 5.8, 3.7), 'exit x=-6.2 (A=19.8)': flux(-6.2, .1, 3.7, 2.55), 'plenum x=5 (jet+recirc)': flux(5, .1, 7.9, 6.4), 'collector x=12': flux(12, .1, 4.5, 3.1) }, prof };
  }, steps);
  console.log(JSON.stringify(r));
} catch (e) { console.log('ERR', String(e).slice(0, 400)); }
console.log('pageErrors', JSON.stringify(log.pageErrors.slice(0, 3)));
await browser.close();
