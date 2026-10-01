// Dumps real scene geometry (vehicle, facility, layout) for camera design. node tests/geom-dump.mjs
import path from 'node:path'; import fs from 'node:fs';
import { open, sleep } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { browser, page, log } = await open('file://' + path.join(root, 'dist/aether.html') + '#q=LOW', { width: 960, height: 540 });
try {
  await page.waitForSelector('#scGo.rdy', { timeout: 240000 });
  const r = await page.evaluate(() => {
    const D = __AETHER_DEBUG, S = D.scene, vt = AETHER.VEHICLE_TRANSFORM, l = AETHER.FLOW_LAYOUT.get(null);
    const bb = a => { const lo = [1e9,1e9,1e9], hi = [-1e9,-1e9,-1e9]; for (let i = 0; i < a.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], a[i+k]); hi[k] = Math.max(hi[k], a[i+k]); } return [lo, hi]; };
    const objs = S.objects.map(o => ({ n: o.name, c: o.category, m: o.material, vis: o.visible, ctr: o.center && [...o.center].map(v => +v.toFixed(2)), sz: o.size && [...o.size].map(v => +v.toFixed(2)) }));
    const vp = S.vehicleParts.map(p => ({ role: p.role, name: p.name, bb: p.positions && bb(p.positions).map(a => a.map(v => +v.toFixed(2))) }));
    const mats = vt.state || vt._state;
    return { vt: { pos: [...vt.position], rot: [...vt.rotation], scale: [...vt.scale], state: mats }, layout: { front: l.vehicleFrontPoint, rear: l.vehicleRearPoint, len: l.vehicleLength, emitX: l.emitterPlane.x, collX: l.collectorPlane.x, inlet: l.inletPlane.x, outlet: l.outletPlane.x, dom: l.domainBounds, fanB: l.fanBounds && { min: l.fanBounds.min, max: l.fanBounds.max }, collOpen: l.collectorOpening }, cam: { ...D.camera }, vehicleParts: vp, objs, fanParts: S.fanParts.length, collParts: S.collectorParts.length };
  });
  fs.writeFileSync(path.join(root, 'tests/out/geom.json'), JSON.stringify(r, null, 1));
  console.log(JSON.stringify({ vt: r.vt, layout: r.layout, cam: r.cam, nObjs: r.objs.length }, null, 1));
} catch (e) { console.log('ERR', String(e).slice(0, 500)); }
console.log(log.pageErrors.slice(0, 3).join('\n'));
await browser.close();
