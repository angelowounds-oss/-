// gameplay (ADR-0019, KOREA-PLAN v2 M3b): the compiled capital region in the game. The ground there is the compiled raster (also in the baked tiles),
// a player stands on it, the Han swims, and the arterial lines near a motorway are built as the camera comes near; the drawn road never has ground
// above it (a road vertex is lifted to the drawn ground; how often that happens is measured).
const { run, freeze, result } = require('../lib.cjs');
run('region', { q: 1, width: 480, height: 270 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, pl = g.player, o = {}, RG = window.__region, LF = window.__landfn; g.eng.render = () => {};
    if (!RG || !RG.regionRoads().length) return { noRegion: true };
    const step = (n) => { for (let i = 0; i < n; i++) window.__upd(1 / 60); };
    const park = (x, y, z) => { pl.body3.teleport(x, y, z); pl.x = x; pl.y = y; pl.z = z; pl.vx = pl.vz = pl.vy = 0; pl.dead = false; pl.hpv = 100; };
    // 1. the ground: the drawn height (tiles) equals the compiled raster where the region decides alone
    let n = 0, off = 0;
    for (let k = 0; k < 600; k++) { const x = -7000 + (k * 7919 % 12000), z = -4000 + (k * 104729 % 9400); if (RG.regionWeight(x, z) < 1) continue; n++; if (Math.abs(LF.landHeight(x, z, 16) - RG.regionHeight(x, z)) > 0.15) off++; }
    o.groundSamples = n; o.groundOff = off;
    // 2. a player put down on dry compiled land west of the capital stands on it
    let land = null; for (let k = 0; k < 400 && !land; k++) { const x = -3000 - k * 16, z = 2600; const w = RG.regionWater(x, z); if (RG.regionWeight(x, z) >= 1 && w && !w.cls) land = [x, z]; }
    park(land[0], LF.physHeight(land[0], land[1], 8) + 1.5, land[1]); step(150);
    o.standGap = +(pl.y - LF.physHeight(pl.x, pl.z, 8)).toFixed(2); o.stands = Math.abs(o.standGap) < 1.2 && !pl.swimming;
    // 3. the Han: a deep cell of inland water swims
    let wet = null; for (const r of RG.regionRoads()) { if (wet) break; }
    for (let k = 0; k < 4000 && !wet; k++) { const x = -7000 + (k * 7919 % 12000), z = -4000 + (k * 104729 % 9400), w = RG.regionWater(x, z); if (RG.regionWeight(x, z) >= 1 && w && w.cls === 2 && w.level - LF.landHeight(x, z, 16) > 2.5) wet = [x, z, w.level]; }
    if (wet) { const wa = g.waterAt(wet[0], wet[1]); o.water = !!wa && wa.depth > 2; park(wet[0], wet[2] + 1, wet[1]); step(150); o.swims = pl.swimming; }
    // 4. the roads near a motorway are built, and how often a vertex had to be lifted to the drawn ground
    const mw = RG.regionRoads().find((r) => r.hw === 'motorway' && r.x.length > 200 && RG.regionWeight(r.x[100], r.z[100]) >= 1);
    park(mw.x[100] + 30, LF.physHeight(mw.x[100] + 30, mw.z[100], 8) + 1.5, mw.z[100]); g.eng.camera.position.set(mw.x[100], mw.y[100] + 40, mw.z[100]);
    const H = g.highways; for (let k = 0; k < 30; k++) { H.artAt = 0; H.update(g.eng.camera); }
    const st = H.stats; o.artPieces = st.artPieces; o.artLive = st.artLive; o.artVerts = st.artVerts; o.other = st.artOther; o.otherLifted = st.artOtherLifted; o.liftedShare = st.artVerts ? +(st.artLifted / st.artVerts * 100).toFixed(2) : null;
    return o;
  });
  if (o.noRegion) return result('region', true, o, 'no compiled region in this build');
  const pass = o.groundSamples > 200 && o.groundOff === 0 && o.stands && o.water && o.swims && o.artLive > 0;
  result('region', pass, o);
});
