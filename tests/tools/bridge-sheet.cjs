// Tool (not a test): pictures of the named sea bridges (WLD-22c, ADR-0037) at midday, for a before/after sheet: for each bridge of the table, one view
// from the side over the sea, one from above, and one from a car on the deck. The places come from the compiled roads (bridgeparts.js findDeck, in
// node), so a build without the towers (an older one) is pictured from the same places; the deck height for the car view is read in the page.
// Usage: [GAME_DIR=<build>/game] [OUT=dir] node tests/tools/bridge-sheet.cjs   → <OUT>/bridge-<id>-<view>.jpg
const { openGame, freeze, result } = require('../lib.cjs');
const fs = require('fs');
const path = require('path');
(async () => {
  const src = (f) => import(path.join(__dirname, '../../src', f));
  await import(path.join(__dirname, '../../build/jobs.mjs'));
  const [{ BRIDGES }, { findDeck }, { KOREA_SCALE }] = await Promise.all(['regions/index.js', 'bridgeparts.js', 'koreamap.js'].map(src));
  const spots = BRIDGES.map((b) => { const D = findDeck(b); return D && { id: b.id, x: D.x, z: D.z, tx: D.tx, tz: D.tz, rx: D.rx, rz: D.rz, span: b.span / KOREA_SCALE }; }).filter(Boolean);
  const out = process.env.OUT || process.cwd(); fs.mkdirSync(out, { recursive: true });
  const { browser, page, errors } = await openGame({ q: 1, width: 960, height: 540 });
  const shots = [];
  try {
    await freeze(page);
    for (const s of spots) {
      const views = await page.evaluate(async (s) => {
        const g = window.__game, pl = g.player, L = window.__landfn; g.hurtPlayer = () => {};
        const sky = () => { g.clock.scale = 0; g.clock.t = Math.floor(g.clock.t / 1440) * 1440 + ((13 - (g.rules?.local?.hourOffset || 0) + 24) % 24) * 60; g.state.weather = { type: 'clear', until: g.clock.t + 1e9 }; g.daynight.wet = 0; };
        // the deck under the bridge's centre: the nearest compiled motorway sample (this build's own heights)
        let deck = 0, bd = Infinity;
        for (const r of g.highways?.N?.roads || []) for (let i = 0; i < r.pts.length; i++) { const d = Math.hypot(r.pts[i][0] - s.x, r.pts[i][1] - s.z); if (d < bd) { bd = d; deck = r.y[i]; } }
        const park = (x, z) => { const y = deck + 1.5; pl.body3.teleport(x, y, z); pl.x = x; pl.y = y; pl.z = z; pl.vx = pl.vz = pl.vy = 0; pl.dead = false; };
        const realRender = g.eng.render, frames = (n) => { g.eng.render = () => {}; for (let i = 0; i < n; i++) { window.__upd(1 / 60); if (i % 60 === 0) sky(); } g.eng.render = realRender; };
        const shot = () => { g.renderFrame(0, true); const cv = g.eng.renderer.domElement, k = document.createElement('canvas'); k.width = cv.width; k.height = cv.height; k.getContext('2d').drawImage(cv, 0, 0); return k.toDataURL('image/jpeg', 0.85); };
        park(s.x, s.z); sky(); frames(240);
        const L0 = Math.max(s.span * 1.4, 260), v = {};
        // side: across the deck from the sea, a little above the deck, looking at the main span
        g.viewCam = { x: s.x + s.rx * L0, y: deck + 25, z: s.z + s.rz * L0, tx: s.x, ty: deck + 12, tz: s.z, fov: 55 }; frames(30); v.side = shot();
        // above: high and off to one side, the whole main span in view
        g.viewCam = { x: s.x + s.rx * L0 * 0.6 - s.tx * L0 * 0.5, y: deck + L0 * 0.9, z: s.z + s.rz * L0 * 0.6 - s.tz * L0 * 0.5, tx: s.x, ty: deck, tz: s.z, fov: 55 }; frames(30); v.above = shot();
        // a car's eye on the deck, a main span back, looking along the road at the towers
        const bx = s.x - s.tx * s.span, bz = s.z - s.tz * s.span; let cy = deck; bd = Infinity;
        for (const r of g.highways?.N?.roads || []) for (let i = 0; i < r.pts.length; i++) { const d = Math.hypot(r.pts[i][0] - bx, r.pts[i][1] - bz); if (d < bd) { bd = d; cy = r.y[i]; } }
        g.viewCam = { x: bx, y: cy + 1.6, z: bz, tx: s.x, ty: cy + 8, tz: s.z, fov: 65 }; frames(30); v.car = shot();
        g.viewCam = null;
        return { deck: +deck.toFixed(1), towers: !!g.bridges, v };
      }, s);
      for (const [k, img] of Object.entries(views.v)) { const f = path.join(out, `bridge-${s.id}-${k}.jpg`); fs.writeFileSync(f, Buffer.from(img.split(',')[1], 'base64')); shots.push(f); }
      s.deck = views.deck; s.towers = views.towers;
    }
  } finally { await browser.close(); }
  result('bridge-sheet', errors.length === 0, { bridges: spots.map((s) => ({ id: s.id, deck: s.deck, towers: s.towers })), errors: errors.slice(0, 5), shots });
})().catch((e) => { result('bridge-sheet', false, { error: String(e && e.stack || e).slice(0, 600) }); });
