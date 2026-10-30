// gameplay (ADR-0029): the asset pack's KTX2 textures. Without the pack the city ground samples its own 512 px scans; once the pack is mounted
// and loaded, the same uniforms hold 2048 px compressed textures with a full mip chain, no shader is compiled for it, and nothing fails.
// Needs assets.pak in the built folder (node build/assets/fetch.mjs --fetch && node build/assets/pack.mjs, then build); skipped without it.
const fs = require('node:fs');
const path = require('node:path');
const { pw, GL_ARGS, GAME, gameUrl } = require('../lib.cjs');
const dir = path.join(GAME, 'world', 'high');
(async () => {
  if (!fs.existsSync(path.join(dir, 'assets.pak'))) { console.log('RESULT ' + JSON.stringify({ test: 'hiassets', pass: true, metrics: { skipped: 'no asset pack' }, note: '' })); return; }
  const browser = await pw.chromium.launch({ args: GL_ARGS });
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.addInitScript(() => { try { localStorage.setItem('neon_detail', 'laptop'); } catch (e) { /* ignore */ } });   // start without the pack
  await page.goto((await gameUrl()) + '?q=1');
  await page.waitForSelector('#go.rdy', { timeout: 300000 });
  const ground = () => page.evaluate(() => { const u = window.__hi.slot('asphalt_04_a'); const t = u ? u.value : null; return t ? { w: t.image?.width, compressed: !!t.isCompressedTexture, mips: t.mipmaps?.length || 0 } : null; });
  const before = await ground();
  const ok = await page.evaluate(() => window.__detail.mount());   // what the boot does when the high detail is chosen
  // a frame drawn the game's way (eng.render: through the composer at q=1) before and after the swap; drawing the scene straight to the screen
  // would compile the screen-target variants the game never uses at this level, and count them against the pack
  const frame = () => page.evaluate(() => { window.__game.eng.render(0); return window.__game.eng.renderer.info.programs.length; });
  const progs0 = await frame();
  const n = await page.evaluate(() => window.__hi.load());
  const after = await ground(), progs1 = await frame();
  const pass = ok === true && n >= 4 && after && after.compressed && after.w === 2048 && after.mips === 12 && progs1 === progs0 && errors.length === 0;
  console.log('RESULT ' + JSON.stringify({ test: 'hiassets', pass, metrics: { before, after, loaded: n, programs: [progs0, progs1], errors: errors.slice(0, 2) }, note: '' }));
  await browser.close();
  process.exitCode = pass ? 0 : 1;
})();
