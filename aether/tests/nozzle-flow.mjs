// Velocity probes with and without the solid nozzle. node tests/nozzle-flow.mjs [hash]
import path from 'node:path';
import { open } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const hash = process.argv[2] || '#q=LOW';
const { browser, page, log } = await open('file://' + path.join(root, 'dist/aether.html') + hash, { width: 640, height: 360 });
try {
  await page.waitForSelector('#scGo.rdy', { timeout: 240000 });
  await page.evaluate(() => { document.getElementById('scGo').click(); });
  await page.waitForFunction(() => window.__LIVE && __LIVE.ok && window.__PERF?.cal?.done, null, { timeout: 240000 });
  const r = await page.evaluate(() => {
    const A = __LIVE.api; A.reset(); A.run(600, 0.02);
    const pts = { 'inlet(-8,1,0)': [-8, 1, 0], 'fan front(-7.2,2.5,0)': [-7.2, 2.5, 0], 'fan gap(-4.4,2.5,0)': [-4.4, 2.5, 0], 'nozzle mid(-3.9,1.6,0)': [-3.9, 1.6, 0], 'exit(-3.2,1.0,0)': [-3.2, 1, 0], 'exit edge(-3.2,1.0,1.8)': [-3.2, 1, 1.8], 'outside jet(-3.0,1.0,3.0)': [-3, 1, 3], 'ahead of car(-2.7,0.8,0)': [-2.7, .8, 0], 'above car(0,2.0,0)': [0, 2, 0], 'wake(4,0.8,0)': [4, .8, 0], 'room side(0,1,3.4)': [0, 1, 3.4] };
    const out = {}; for (const k in pts) { const v = A.read(...pts[k]); out[k] = v.map(x => +x.toFixed(2)); }
    const prof = { z: [], y: [], xc: [] };
    for (let z = -2.0; z <= 2.01; z += 0.4) prof.z.push([+z.toFixed(1), +A.read(-3.2, 1.0, z)[0].toFixed(2)]);
    for (let y = 0.15; y <= 3.2; y += 0.4) prof.y.push([+y.toFixed(2), +A.read(-3.2, y, 0)[0].toFixed(2)]);
    for (let x = -6.2; x <= -2.0; x += 0.4) prof.xc.push([+x.toFixed(1), +A.read(x, 1.5, 0)[0].toFixed(2)]);
    return { prof, U: __LIVE.U, flags: A.flagCounts?.(), div: A.divStats?.(), v: out, cd: __LIVE.forces && { Cd: __LIVE.forces.Cd, Cl: __LIVE.forces.Cl } };
  });
  console.log(JSON.stringify(r, null, 1));
} catch (e) { console.log('ERR', String(e).slice(0, 300)); }
console.log(log.pageErrors.slice(0, 3).join('\n'));
await browser.close();
