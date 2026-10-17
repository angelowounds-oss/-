// gameplay (ADR-0013): the high-detail pack. Without a pack the page runs on the embedded (laptop) world; connecting the pack folder (here through the file
// chooser: the fallback of the folder picker) puts its chunks in front: 8 m ground tiles stream in around the player and are used for the height, the
// denser city detail replaces the embedded chunk under the same key. Needs build/baked/pack (node build/bake.mjs --pack); skipped when it is not there.
const fs = require('node:fs');
const path = require('node:path');
const pw = require('playwright');
const { GAME } = require('../lib.cjs');
const dir = path.join(__dirname, '../../build/baked/pack');
(async () => {
  if (!fs.existsSync(path.join(dir, 'index.json'))) { console.log('RESULT ' + JSON.stringify({ test: 'pack', pass: true, metrics: { skipped: 'no pack baked' }, note: '' })); return; }
  const browser = await pw.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } }), errors = [];
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
  await page.addInitScript(() => { delete window.showDirectoryPicker; });   // the fallback path: a file input
  await page.goto('file://' + GAME + '?q=1');
  await page.waitForSelector('#go.rdy', { timeout: 300000 });
  const before = await page.evaluate(() => ({ tier: window.__detail.detail.tier, state: window.__detail.detail.state, hasPackChunk: window.__WORLD.has('t8/12_12') }));
  const chooser = page.waitForEvent('filechooser');
  const connecting = page.evaluate(() => window.__detail.connectPack());
  (await chooser).setFiles(fs.readdirSync(dir).map((f) => path.join(dir, f)));
  const ok = await connecting;
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
