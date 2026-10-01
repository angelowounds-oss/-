import path from 'node:path'; import fs from 'node:fs';
import { open } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { browser, page } = await open('file://' + path.join(root, 'dist/aether.html') + '#q=LOW', { width: 640, height: 360 });
await page.waitForSelector('#scGo.rdy', { timeout: 240000 });
const r = await page.evaluate(() => {
  const body = __AETHER_DEBUG.scene.vehicleParts.find(p => p.role === 'body'), P = body.positions;
  const vt = window.AETHER.VEHICLE_TRANSFORM; const W = []; for (let i = 0; i < P.length; i += 3) W.push(vt.localToWorld([P[i], P[i+1], P[i+2]]));
  const bins = {}; for (const w of W) { const k = Math.round(w[0] / 0.15) * 0.15; const b = bins[k] || (bins[k] = { ymax: -9, ymin: 9, zmax: -9, n: 0, ymaxZ: 0 }); if (w[1] > b.ymax) { b.ymax = w[1]; b.ymaxZ = w[2] } b.ymin = Math.min(b.ymin, w[1]); b.zmax = Math.max(b.zmax, Math.abs(w[2])); b.n++; }
  const prof = Object.keys(bins).map(Number).sort((a, b) => a - b).map(k => ({ x: +k.toFixed(2), ymax: +bins[k].ymax.toFixed(2), ymin: +bins[k].ymin.toFixed(2), zmax: +bins[k].zmax.toFixed(2), n: bins[k].n }));
  // wing candidate: rear 30% vertices above 1.0 m
  const wing = W.filter(w => w[0] > 1.6 && w[1] > 1.0); const lo = [9, 9, 9], hi = [-9, -9, -9]; for (const w of wing) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], w[k]); hi[k] = Math.max(hi[k], w[k]) }
  return { prof, wingN: wing.length, wing: [lo, hi], verts: W.length };
});
console.log(r.prof.map(p => `${p.x}\t${p.ymin}\t${p.ymax}\t${p.zmax}\t${p.n}`).join('\n')); console.log('wing', JSON.stringify(r.wing), r.wingN, r.verts);
await browser.close();
