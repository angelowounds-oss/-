// gameplay (ADR-0013, ADR-0034): the high-detail pack. With the laptop detail the page runs on the base world; mounting the pack (game/world/, read
// over http a chunk at a time) puts its chunks in front: 8 m ground tiles stream in around the player and are used for the height, the denser city
// detail replaces the base chunk under the same key. Needs the pack in the built folder (node build/bake.mjs --pack, then build); skipped without it.
const fs = require('node:fs');
const path = require('node:path');
const { pw, GL_ARGS, GAME, gameUrl } = require('../lib.cjs');
const dir = path.join(GAME, 'world');
(async () => {
  if (!fs.existsSync(path.join(dir, 'index.json'))) { console.log('RESULT ' + JSON.stringify({ test: 'pack', pass: true, metrics: { skipped: 'no pack in the build' }, note: '' })); return; }
  const browser = await pw.chromium.launch({ args: GL_ARGS });
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.addInitScript(() => { try { localStorage.setItem('neon_detail', 'laptop'); } catch (e) { /* ignore */ } });   // start without the pack
  await page.goto((await gameUrl()) + '?q=1');
  await page.waitForSelector('#go.rdy', { timeout: 300000 });
  const before = await page.evaluate(() => ({ tier: window.__detail.detail.tier, state: window.__detail.detail.state, hasPackChunk: window.__WORLD.has('t8/12_12') }));
  const ok = await page.evaluate(() => window.__detail.mount());   // what the boot does when the high detail is chosen
  await page.evaluate(() => window.__detail.setPref('high'));
  await page.evaluate(() => { document.getElementById('go').click(); });
  await page.waitForFunction(() => window.__game && window.__game.running, null, { timeout: 60000 });
  const o = await page.evaluate(async () => {
    const g = window.__game, pl = g.player, D = window.__detail.detail, out = {}, W = window.__WORLD, L = g.villages.list[0], v = L.v;
    out.tier = D.tier; out.state = D.state; out.files = D.files; out.mb = Math.round(D.bytes / 1048576);
    out.hasT8 = W.has('t8/12_12'); out.packFirst = W.find('t8/12_12')?.name; out.cityFromPack = (W.find('city/mid1/3_3') || {}).name;
    // stand in a village (outside the capital) and let the 8 m tiles stream in
    pl.body3.teleport(v.x, L.pad.y + 0.3, v.z); pl.x = v.x; pl.z = v.z; pl.y = L.pad.y + 0.3;
    const L8 = window.__hm.levels[0]; for (let i = 0; i < 400 && L8.tiles.size < 1; i++) await new Promise((r) => setTimeout(r, 150));
    out.t8Tiles = L8.tiles.size; const gx = v.x + 37.3, gz = v.z - 21.1, h8 = window.__hm.sample(gx, gz); L8.tiles.clear(); const h16 = window.__hm.sample(gx, gz); out.finer = Number.isFinite(h8) && Number.isFinite(h16); out.diff = +Math.abs(h8 - h16).toFixed(2);
    return out;
  }).catch((e) => ({ error: String(e).slice(0, 300) }));
  const pass = ok === true && before.tier === 'laptop' && !before.hasPackChunk && o.tier === 'high' && o.state === 'ready' && o.hasT8 && /^pack:/.test(o.packFirst || '') && /^pack:/.test(o.cityFromPack || 'pack:') && o.t8Tiles >= 1 && o.finer && errors.length === 0;
  console.log('RESULT ' + JSON.stringify({ test: 'pack', pass, metrics: { before, ...o, errors: errors.slice(0, 2) }, note: '' }));
  await browser.close();
  process.exitCode = pass ? 0 : 1;
})();
