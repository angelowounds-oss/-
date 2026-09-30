// A/B check of a CFD-side optimisation: same tunnel, same steps, checksums of velocity, dye and the render volume.
// node tests/ab-cfd.mjs <html file> [oldSolver=1]   (oldSolver=1 forces levels=4/coarse=24 so both builds run the identical multigrid)
import { open } from './lib.mjs';
const [file, oldSolver = '1'] = process.argv.slice(2);
const { browser, page, log } = await open('file://' + file + '#q=LOW', { width: 320, height: 180 });
try {
  await page.waitForFunction(() => window.__LIVE && (window.__LIVE.ok || window.__LIVE.err), null, { timeout: 240000 });
  const r = await page.evaluate(async old => {
    const A = __LIVE.api, M = __MAC, g = [...document.querySelectorAll('canvas')].map(c => c.getContext('webgl2')).find(Boolean);
    A.set({ freeze: true });
    if (old === '1') { M.levels = 4; M.coarse = 24; A.setTier('MID'); A.setTier('LOW'); }
    A.run(25, 0.02); g.bindVertexArray(__LIVE.vao); M.copyVolume(); g.bindVertexArray(null);
    const sum = a => { let s = 0, q = 0, n = 0; for (let i = 0; i < a.length; i++) { const v = a[i]; if (Number.isFinite(v)) { s += v; q += v * v; n++ } } return [s, q, n] };
    const V = (() => { const b = new Float32Array(M.G.W * M.G.H * 4); g.bindFramebuffer(g.FRAMEBUFFER, M.t.velA.f); g.readPixels(0, 0, M.G.W, M.G.H, g.RGBA, g.FLOAT, b); return sum(b) })();
    const D = (() => { const d = M.D, b = new Float32Array(d.W * d.H * 4); g.bindFramebuffer(g.FRAMEBUFFER, M.t.dyeA.f); g.readPixels(0, 0, d.W, d.H, g.RGBA, g.FLOAT, b); return sum(b) })();
    // render volume: read every 7th layer
    const Nd = M.D.N, fb = g.createFramebuffer(), vs = [];
    g.bindFramebuffer(g.FRAMEBUFFER, fb);
    for (let k = 0; k < Nd[2]; k += 7) { g.framebufferTextureLayer(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, M.vol, 0, k); const b = new Float32Array(Nd[0] * Nd[1] * 4); g.readBuffer(g.COLOR_ATTACHMENT0); g.readPixels(0, 0, Nd[0], Nd[1], g.RGBA, g.FLOAT, b); let h = 0; for (let i = 0; i < b.length; i++) h += b[i] * ((i % 13) + 1); vs.push(+h.toFixed(3)) }
    g.bindFramebuffer(g.FRAMEBUFFER, null);
    return { levels: M.lv.length, coarse: M.coarse, vel: V, dye: D, volHash: vs, res: A.poisson().rel, div: A.divStats().relRms };
  }, oldSolver);
  console.log(JSON.stringify(r));
} catch (e) { console.log('ERR', String(e).slice(0, 500)); }
if (log.pageErrors.length) console.log('PAGEERR', log.pageErrors.slice(0, 3));
await browser.close();
