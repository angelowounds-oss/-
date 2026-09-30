// Detects readPixels calls a strict driver (ANGLE/D3D11 on real GPUs) rejects: RGBA+UNSIGNED_BYTE from a float colour attachment.
// The start-up GPU measurement used such a read as its fence; on the user's PC that gave GL_INVALID_OPERATION and a meaningless measurement.
// node tests/fence.mjs <html file>
import { open, sleep } from './lib.mjs';
const file = process.argv[2];
const init = () => {
  const P = WebGL2RenderingContext.prototype, rp = P.readPixels; window.__RP = { total: 0, bad: 0, badSizes: {}, glErrors: 0 };
  P.readPixels = function (x, y, w, h, fmt, type, ...rest) {
    window.__RP.total++;
    try {
      const fb = this.getParameter(this.FRAMEBUFFER_BINDING);
      const ct = fb ? this.getFramebufferAttachmentParameter(this.READ_FRAMEBUFFER, this.COLOR_ATTACHMENT0, this.FRAMEBUFFER_ATTACHMENT_COMPONENT_TYPE) : this.UNSIGNED_NORMALIZED;
      if (type === this.UNSIGNED_BYTE && ct === this.FLOAT) { window.__RP.bad++; const k = w + 'x' + h; window.__RP.badSizes[k] = (window.__RP.badSizes[k] || 0) + 1; }
    } catch (_) {}
    return rp.call(this, x, y, w, h, fmt, type, ...rest);
  };
};
const { browser, page, log } = await open('file://' + file, { width: 640, height: 360, init });
try {
  await page.waitForFunction(() => window.__PERF?.cal?.done, null, { timeout: 280000 });
  await sleep(1500);
  const r = await page.evaluate(() => { const g = [...document.querySelectorAll('canvas')].map(c => c.getContext('webgl2')).find(Boolean); let n = 0; while (g.getError() !== 0 && n < 50) n++; return { rp: window.__RP, pendingGlErrorsDrained: n, calResult: { pick: __PERF.cal.result?.pick, err: __PERF.cal.result?.error, samples: __PERF.cal.result?.samples } } });
  console.log(JSON.stringify(r));
} catch (e) { console.log('ERR', String(e).slice(0, 300)); }
if (log.pageErrors.length) console.log('PAGEERR', log.pageErrors.slice(0, 2));
await browser.close();
