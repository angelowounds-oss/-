// Shared headless harness: SwiftShader WebGL2 (functional checks only, never performance claims).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
export const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
export async function open(url, { width = 960, height = 540, init, ctx } = {}) {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--allow-file-access-from-files', '--disable-background-networking', '--disable-component-update', '--no-first-run', '--disable-sync'] });
  const page = ctx ? await (await browser.newContext({ viewport: { width, height }, ...ctx })).newPage() : await browser.newPage({ viewport: { width, height } });
  const log = { pageErrors: [], consoleErrors: [], external: [], shaderFailures: [] };
  page.on('pageerror', e => log.pageErrors.push((String(e) + ' @ ' + String(e.stack || '').split('\n').slice(1, 3).join(' | ')).slice(0, 500)));
  page.on('console', m => { if (m.type() === 'error' && !/WebGPU/i.test(m.text())) log.consoleErrors.push(m.text().slice(0, 400)); });
  await page.route('**/*', r => { const u = r.request().url(); if (/^(file|data|blob):/.test(u)) return r.continue(); log.external.push(u); return r.abort(); });
  // record every WebGL shader compile (ANGLE compiles GLSL ES 3.00 for real)
  await page.addInitScript(() => {
    const P = WebGL2RenderingContext.prototype, cs = P.compileShader, src = P.shaderSource;
    window.__SHADERS = { compiled: 0, failed: [] };
    P.shaderSource = function (sh, s) { sh.__src = s; return src.call(this, sh, s); };
    P.compileShader = function (sh) { cs.call(this, sh); window.__SHADERS.compiled++; if (!this.getShaderParameter(sh, this.COMPILE_STATUS)) window.__SHADERS.failed.push({ log: String(this.getShaderInfoLog(sh)).slice(0, 300), head: String(sh.__src || '').slice(0, 120) }); };
  });
  if (init) await page.addInitScript(init);
  await page.goto(url + (process.env.AETHER_HASH || ''), { timeout: +(process.env.AETHER_GOTO_TIMEOUT || 240000) });
  return { browser, page, log };
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export function table(rows) { const k = Object.keys(rows[0]); return ['| ' + k.join(' | ') + ' |', '|' + k.map(() => '---').join('|') + '|', ...rows.map(r => '| ' + k.map(x => r[x]).join(' | ') + ' |')].join('\n'); }
