#!/usr/bin/env node
/* global AETHER __CINE __VEHICLE __YAW */
// Offline grid-convergence runs of the live MAC solver in headless Chromium (SwiftShader, CPU only), tunnel conditions: 5 m/s, yaw 0, turntable car, free-stream tunnel domain.
//   node tools/offline/fine-run.mjs <car:bmw|agera> <tier:LITE|LOW|MID|HIGH|ULTRA> [endTime=14] [chunk=25]
// Writes data/reference/runs/<car>_<tier>.json after every chunk (so an interrupted run keeps its history). The summary is the solver's own force statistics over the last 8 s of simulated time
// (CdMean / CdStd / ClMean / ClStd, the same numbers the wall display shows), reported only once the run has covered at least `endTime` seconds.
import fs from 'node:fs'; import path from 'node:path';
import { open, sleep } from '../../tests/lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const [car, tier, endArg, chunkArg] = process.argv.slice(2); if (!car || !tier) { console.error('usage: fine-run.mjs <car> <tier> [endTime] [chunk]'); process.exit(1); }
const endTime = +(endArg || 14), chunk = +(chunkArg || 25), dt = 0.02;
const outDir = path.join(root, 'data/reference/runs'); fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${car}_${tier}.json`);
const { browser, page } = await open('file://' + path.join(root, 'dist/aether.html') + `#q=${tier}&car=${car}`, { width: 640, height: 360 });
const run = { schema: 'aether-offline-run-v1', car, tier, dt, endTime, started: new Date().toISOString(), machine: 'headless Chromium, SwiftShader (CPU), 4 cores', rec: [] };
try {
  await page.waitForSelector('#scGo.rdy', { timeout: 3600000 }); await page.evaluate(() => { document.getElementById('scGo').click(); }); await sleep(1500);
  await page.waitForFunction(() => window.__LIVE && __LIVE.ok && window.__PERF?.cal?.done, null, { timeout: 3600000 });
  const setup = await page.evaluate(() => { const sp = document.getElementById('scSplash'); if (sp) sp.style.display = 'none'; __CINE.cancel('off'); __LIVE.freeze = true; const L = __LIVE, d = AETHER.VEHICLE_TRANSFORM.dimensions; return { tierRunning: L.q, N: L.N, cellM: L.h.map(v => +v.toFixed(4)), U: L.U, yawDeg: window.__YAW?.deg || 0, car: window.__VEHICLE?.id, dims: d, voxCarCells: L.vox?.car, voxFrontM2: L.vox?.front, mgCycles: L.mgCycles }; });
  Object.assign(run, { setup }); console.log(JSON.stringify(setup));
  if (setup.tierRunning !== tier && !(tier === 'MID' && setup.tierRunning === 'MID')) throw Error('tier mismatch: asked ' + tier + ', running ' + setup.tierRunning);
  const t0 = Date.now();
  for (;;) {
    const r = await page.evaluate(([n, d]) => { __LIVE.api.run(n, d); const F = __LIVE.forces, f = v => (typeof v === 'number' && Number.isFinite(v)) ? +v.toFixed(4) : null; return { t: +__LIVE.t.toFixed(3), Cd: F && f(F.Cd), CdMean: F && f(F.CdMean), CdStd: F && f(F.CdStd), Cl: F && f(F.Cl), ClMean: F && f(F.ClMean), ClStd: F && f(F.ClStd), A: F && f(F.A), window: F && f(F.window), guard: __LIVE.guardTrips || 0 }; }, [chunk, dt]);
    r.wallS = Math.round((Date.now() - t0) / 1000); run.rec.push(r); run.last = r;
    fs.writeFileSync(outFile, JSON.stringify(run, null, 1)); console.log(JSON.stringify(r));
    if (r.guard > 0) { run.error = 'solver guard tripped'; break; }
    if (r.t >= endTime) { run.done = true; run.finished = new Date().toISOString(); run.summary = { simTimeS: r.t, windowS: r.window, Cd: r.CdMean, CdStd: r.CdStd, Cl: r.ClMean, ClStd: r.ClStd, A: r.A, cellM: setup.cellM[0], N: setup.N, wallHours: +(r.wallS / 3600).toFixed(2) }; break; }
  }
} catch (e) { run.error = String(e?.message || e).slice(0, 400); console.error('ERR', run.error); }
fs.writeFileSync(outFile, JSON.stringify(run, null, 1)); await browser.close(); process.exit(run.done ? 0 : 1);
