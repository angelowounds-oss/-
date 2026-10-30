// CFD V3 P3: the Ahmed run (bench/ahmed-case.mjs) on the WebGPU solver, for the on-device page dist/AETHER_CFD_AHMED_GPU.html and its headless check.
// Builds the topology in the page (createRefined, topologyOnly), checks the buffer sizes against the adapter's limits, starts from the free stream and
// samples drag and lift 8 times per L/U; the drag breakdown and the averages are taken over t >= T / 2 (as bench/ahmed-refined.mjs).
// runAhmedGpu(device, { nH, T = 12, cs = 0.15, hrr = 0.9, wm = true, wmf = 400, onProgress(info), shouldStop() }) -> result (JSON-safe)
// hrr 0.9: in tests/pulse-faces.mjs 0.95 lets a box spanning a periodic axis regrow after 3500 coarse steps, 0.9 stays stable through 6000;
// H/48 needs about 5200 coarse steps for 12 L/U
import { createRefined } from '../refine.mjs';
import { createRefineGpu } from './refine-webgpu.mjs';
import { ahmedCase, AHMED } from '../bench/ahmed-case.mjs';
// expected cells with ghosts at nH (measured at nH = 12 and 48, cells scale with nH^3): for the size check before anything is built
export const ahmedEstimate = nH => { const total = 7663128 * (nH / 48) ** 3, finest = 3436992 * (nH / 48) ** 3; return { cells: Math.round(total), bytes: Math.round(total * 176), finestBuffer: Math.round(76 * finest) }; };
export async function runAhmedGpu(device, { nH, T = 12, cs = .15, hrr = .9, wm = true, wmf = 400, onProgress = () => {}, shouldStop = () => false } = {}) {
  const t0 = performance.now(), say = (stage, extra = {}) => onProgress({ stage, s: (performance.now() - t0) / 1000, ...extra });
  const c = ahmedCase(nH, { cs, hrr, wallModel: wm ? { filter: wmf } : false });
  say('topology');
  const S = createRefined({ ...c.o, topologyOnly: true }), cells = S.levels.map(L => L.N), lim = device.limits, biggest = 4 * 19 * Math.max(...cells);
  if (biggest > lim.maxStorageBufferBindingSize || biggest > lim.maxBufferSize) throw Error(`this device allows ${(Math.min(lim.maxStorageBufferBindingSize, lim.maxBufferSize) / 2 ** 20).toFixed(0)} MiB per buffer, H/${nH} needs ${(biggest / 2 ** 20).toFixed(0)} MiB`);
  say('upload', { cells });
  device.pushErrorScope('out-of-memory'); device.pushErrorScope('validation');
  const G = await createRefineGpu(device, S, c.o); G.init(); await G.finish(); // the free-stream fill touches every level's buffers
  const ve = await device.popErrorScope(), oe = await device.popErrorScope();
  if (ve || oe) throw Error('GPU could not allocate or run H/' + nH + ': ' + (ve || oe).message.slice(0, 200));
  const { Ul, A, stepsPerLU, REGIONS } = c, every = Math.max(1, Math.round(stepsPerLU / 8)), maxSteps = Math.round(T * stepsPerLU), hist = [], reg = REGIONS.map(() => 0); let regN = 0;
  const work = S.levels.reduce((a, L) => a + L.N * 2 ** L.l, 0); // cell updates per coarse step (finest-time-step equivalent weights)
  const tRun = performance.now(); let extremes = null;
  while (G.step < maxSteps && !shouldStop()) {
    G.advance(Math.min(every, maxSteps - G.step)); const F = await G.force(), Cd = 2 * F[0] / (Ul * Ul * A), Cl = 2 * F[1] / (Ul * Ul * A), tLU = G.step / stepsPerLU;
    hist.push({ tLU: +tLU.toFixed(3), Cd: +Cd.toFixed(5), Cl: +Cl.toFixed(5) });
    if (tLU >= T / 2) { (await G.forceRegions()).forEach((r, i) => { reg[i] += 2 * (r.pressure[0] + r.friction[0]) / (Ul * Ul * A); }); regN++; }
    if (!Number.isFinite(Cd)) break;
    if (hist.length % 16 === 0) extremes = (await G.extremes()).map(e => ({ level: e.level, drhoMax: +e.drhoMax.toExponential(2), umaxOverU: +(e.umax / Ul).toFixed(2) }));
    const el = (performance.now() - tRun) / 1000; say('run', { tLU, T, Cd, Cl, eta: el / G.step * (maxSteps - G.step), mlups: work * G.step / el / 1e6 });
  }
  const tail = hist.filter(h => h.tLU >= T / 2), mean = k => tail.length ? tail.reduce((a, h) => a + h[k], 0) / tail.length : null, m = mean('Cd');
  const sd = tail.length ? Math.sqrt(tail.reduce((a, h) => a + (h.Cd - m) ** 2, 0) / tail.length) : null, runS = (performance.now() - tRun) / 1000;
  return { case: 'Ahmed 25 deg', nH, T, tLU: +(G.step / stepsPerLU).toFixed(2), complete: G.step >= maxSteps, cs, hrr, wallModel: wm ? { filter: wmf } : false, cells, gpuBytes: G.bytes,
    CdMean: m && +m.toFixed(4), CdStd: sd && +sd.toFixed(4), ClMean: mean('Cl') && +mean('Cl').toFixed(4), window: `t >= ${T / 2} L/U`,
    CdBreakdown: regN ? Object.fromEntries(REGIONS.map((r, i) => [r, +(reg[i] / regN).toFixed(4)])) : null, ref: { Cd: AHMED.CdRef, band: [+(AHMED.CdRef * .85).toFixed(4), +(AHMED.CdRef * 1.15).toFixed(4)] },
    wall: await G.wall(), extremes, runS: +runS.toFixed(1), setupS: +((tRun - t0) / 1000).toFixed(1), mlups: +(work * G.step / runS / 1e6).toFixed(1), hist };
}
