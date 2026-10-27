// gameplay (ADR-0029): the asset pack's KTX2 textures. Without the pack the city ground samples its embedded 512 px scans; once the pack folder is
// connected and loaded, the same uniforms hold 2048 px compressed textures with a full mip chain, no shader is compiled for it, and nothing fails.
// Needs build/baked/pack/assets.pak (node build/assets/fetch.mjs --fetch && node build/assets/pack.mjs); skipped when it is not there.
const fs = require('node:fs');
const path = require('node:path');
const pw = require('playwright');
const { GAME } = require('../lib.cjs');
const dir = path.join(__dirname, '../../build/baked/pack');
(async () => {
  if (!fs.existsSync(path.join(dir, 'assets.pak'))) { console.log('RESULT ' + JSON.stringify({ test: 'hiassets', pass: true, metrics: { skipped: 'no asset pack' }, note: '' })); return; }
  const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.addInitScript(() => { delete window.showDirectoryPicker; });   // the fallback path: a file input
  await page.goto('file://' + GAME + '?q=1');
  await page.waitForSelector('#go.rdy', { timeout: 300000 });
  const ground = () => page.evaluate(() => { const u = window.__hi.slot('asphalt_04_a'); const t = u ? u.value : null; return t ? { w: t.image?.width, compressed: !!t.isCompressedTexture, mips: t.mipmaps?.length || 0 } : null; });
  const before = await ground();
  const chooser = page.waitForEvent('filechooser');
  const connecting = page.evaluate(() => window.__detail.connectPack());
  (await chooser).setFiles(fs.readdirSync(dir).map((f) => path.join(dir, f)));
  const ok = await connecting;
  const progs0 = await page.evaluate(() => window.__game.eng.renderer.info.programs.length);
  const n = await page.evaluate(() => window.__hi.load());
  const after = await ground(), progs1 = await page.evaluate(async () => { window.__game.eng.renderer.render(window.__game.scene, window.__game.camera); return window.__game.eng.renderer.info.programs.length; });
  const pass = ok === true && n >= 4 && after && after.compressed && after.w === 2048 && after.mips === 12 && progs1 === progs0 && errors.length === 0;
  console.log('RESULT ' + JSON.stringify({ test: 'hiassets', pass, metrics: { before, after, loaded: n, programs: [progs0, progs1], errors: errors.slice(0, 2) }, note: '' }));
  await browser.close();
  process.exitCode = pass ? 0 : 1;
})();
