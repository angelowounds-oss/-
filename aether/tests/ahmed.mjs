// Ahmed body (25 deg slant) benchmark on the validation path of the MAC solver. node tests/ahmed.mjs [case ...]   cases: ahmed6 (h=0.20 m) ahmed8 (h=0.15 m)
// The body is the standard Ahmed geometry scaled x4 (L=4.176 W=1.556 H=1.152 m, nose radius 0.4 m, slant 0.888 m at 25 deg, clearance 0.2 m, no stilts),
// U = 5 m/s, nu = 1.5e-5 (Re_L = 1.39e6, the drag coefficient of this body is nearly Reynolds-independent above ~5e5), free-slip floor, LES on.
// Literature (Ahmed, Ramm & Faltin 1984; Lienhart & Becker 2003): Cd ~ 0.285 at 25 deg with stilts; the stilts add part of it, so ~0.25-0.30 is the expected band for this simplified body.
// The point is to quantify how far this solver is from a published bluff-body reference at the tunnel's cell sizes, not to pass. Results -> tests/out/ahmed/<case>.json
import fs from 'node:fs'; import path from 'node:path';
import { open } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'tests/out/ahmed'); fs.mkdirSync(out, { recursive: true });
const S = 4, B = { type: 'ahmed', L: 1.044 * S, W: .389 * S, H: .288 * S, R: .1 * S, ls: .222 * S, deg: 25, c: [0, .05 * S + .144 * S, 0] };
B.D = B.H; const A = B.W * B.H;
if (process.env.AHMED_SHAPE === 'sphere') { B.type = 'sphere'; B.D = 1.152; }
const inside = (x, y, z) => { const u = x - B.c[0], v = y - B.c[1], w = z - B.c[2], hl = B.L / 2, hh = B.H / 2, hw = B.W / 2; if (Math.abs(u) > hl || Math.abs(v) > hh || Math.abs(w) > hw) return false; const th = B.deg * Math.PI / 180, us = hl - B.ls * Math.cos(th); if (u > us && v > hh - (u - us) * Math.tan(th)) return false; const du = u + hl - B.R; if (du < 0) { const a = Math.max(Math.abs(v) - (hh - B.R), 0), b = Math.max(Math.abs(w) - (hw - B.R), 0); if (du * du + a * a + b * b > B.R * B.R) return false; } return true; };
let vol = 0; { const n = 140, hx = B.L / n, hy = B.H / 70, hz = B.W / 70; for (let i = 0; i < n; i++) for (let j = 0; j < 70; j++) for (let k = 0; k < 70; k++) if (inside(B.c[0] - B.L / 2 + (i + .5) * hx, B.c[1] - B.H / 2 + (j + .5) * hy, B.c[2] - B.W / 2 + (k + .5) * hz)) vol += hx * hy * hz; }
B.vol = vol;
/* Grids are divisible by 8 (4 multigrid levels) and the solver runs 8 cycles: with odd coarse sizes and the validation suite's default 5 cycles the pressure solve does not converge
   and the run diverges (found while building this benchmark, see KNOWN_LIMITATIONS L36). Floor at y = 0 (free slip), body clearance 0.2 m (the standard 0.05 m x 4). */
const mk = (h, N, zh, T) => ({ cfg: { N, min: [-4, 0, -zh], max: [-4 + N[0] * h, N[1] * h, zh], U: +(process.env.AHMED_U || 5), nu: +(process.env.AHMED_NU || 1.5e-5), les: (process.env.AHMED_LES ?? '1') === '1', obstacle: B, Aref: A }, dt: +(process.env.AHMED_DTF || .6) * h / +(process.env.AHMED_U || 5), T: +(process.env.AHMED_T || T), every: 4, chunk: 40, win: +(process.env.AHMED_T || T) / 2, h });
const CASES = { ahmed6: mk(.2, [96, 24, 32], 3.2, 12), ahmed8: mk(.15, [128, 32, 48], 3.6, 12), ahmed10: mk(.12, [160, 40, 60], 3.6, 12) };
const stats = a => { const n = a.length, m = a.reduce((x, y) => x + y, 0) / n; return { mean: m, std: Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / n), n }; };
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['ahmed6', 'ahmed8'];
for (const name of names) {
  const C = CASES[name], res = { case: name, body: { ...B, c: undefined, cenY: B.c[1] }, cfg: { N: C.cfg.N, U: C.cfg.U, nu: C.cfg.nu, h: C.h }, dt: C.dt, T: C.T, time: new Date().toISOString(), ref: { Cd: .285, band: [.25, .30], src: 'Ahmed et al. 1984 / Lienhart & Becker 2003, 25 deg slant, Re 7.7e5, with stilts' } };
  const { browser, page, log } = await open('file://' + path.join(root, 'dist/aether.html') + '#q=LOW', { width: 160, height: 90 });
  try {
    await page.waitForFunction(() => window.__LIVE && (window.__LIVE.ok || window.__LIVE.err), null, { timeout: 240000 });
    res.setup = await page.evaluate(c => { Object.assign(__MAC, { solver: 'RBGS', cycles: 8 }); return __LIVE.api.validate(c); }, C.cfg);
    res.volumeRatio = res.setup.phiSum * res.setup.cellVol / res.setup.expectedVol;
    const h = C.cfg.N.map((n, d) => (C.cfg.max[d] - C.cfg.min[d]) / n), cell = (x, d) => Math.max(1, Math.min(C.cfg.N[d] - 1, Math.round((x - C.cfg.min[d]) / h[d])));
    const cv = { lo: [cell(-B.L / 2 - 1.5, 0), 1, cell(-2.6, 2)], hi: [cell(B.L / 2 + 4.5, 0), cell(B.c[1] + B.H / 2 + 1.5, 1), cell(2.6, 2)] }; res.cvBox = cv;
    const steps = Math.round(C.T / C.dt); res.rec = []; let ms = 0;
    for (let s = 0; s < steps; s += C.chunk) {
      const r = await page.evaluate(([n, dt, e, b]) => __LIVE.api.vrun(n, dt, e, null, b), [Math.min(C.chunk, steps - s), C.dt, C.every, cv]);
      res.rec.push(...r.rec); ms += r.ms; const last = r.rec[r.rec.length - 1];
      process.stdout.write(`${name} t=${r.time.toFixed(2)}/${C.T} Cd=${last?.Cd?.toFixed(3)} Cl=${last?.Cl?.toFixed(3)}\r`);
      if (r.rec.some(x => !Number.isFinite(x.Fx))) { res.nonFinite = true; break; }
      fs.writeFileSync(path.join(out, name + '.partial.json'), JSON.stringify(res));
    }
    res.msPerStep = ms / steps; res.div = await page.evaluate(() => __LIVE.api.divStats());
    for (let i = 1; i < res.rec.length - 1; i++) { const a = res.rec[i - 1], b = res.rec[i], c = res.rec[i + 1]; if (!b.cvS) continue; const dM = [0, 1].map(k => (c.cvM[k] - a.cvM[k]) / (c.t - a.t)); b.CdCV = (b.cvS[0] - dM[0]) / b.q; b.ClCV = (b.cvS[1] - dM[1]) / b.q; }
    const W = res.rec.filter(r => r.t >= C.win && r.CdCV !== undefined); res.window = { from: C.win, to: C.T, samples: W.length };
    if (W.length) { res.Cd = stats(W.map(r => r.Cd)); res.Cl = stats(W.map(r => r.Cl)); if (W[0].Cdp !== undefined) res.Cdp = stats(W.map(r => r.Cdp)); res.CdBudget = stats(W.map(r => r.CdB)); res.CdCV = stats(W.map(r => r.CdCV)); }
    res.relErr = res.CdCV ? { surface: (res.Cd.mean - .285) / .285, budget: (res.CdBudget.mean - .285) / .285, cv: (res.CdCV.mean - .285) / .285 } : null;
  } catch (e) { res.error = String(e).slice(0, 500); }
  res.pageErrors = log.pageErrors; await browser.close();
  fs.writeFileSync(path.join(out, name + '.json'), JSON.stringify(res, null, 1));
  console.log('\n' + JSON.stringify({ name, h: C.h, cells: C.cfg.N.join('x'), msPerStep: res.msPerStep && +res.msPerStep.toFixed(0), volRatio: res.volumeRatio && +res.volumeRatio.toFixed(3), Cd: res.Cd, CdBudget: res.CdBudget, CdCV: res.CdCV, relErr: res.relErr, div: res.div && [res.div.relRms, res.div.relMax], err: res.error }));
}
