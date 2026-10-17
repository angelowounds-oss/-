// gameplay (ADR-0013): the works of the country. Wind farms, comms towers and pylon lines exist; the rotors turn; a blast knocks a pylon / tower / turbine
// over (it falls away from the blast, its collider goes, its beacon dies, the wires beside it drop, the save remembers it); a refinery tank explodes and burns.
const { run, freeze, result } = require('../lib.cjs');
run('industry', { q: 1, width: 480, height: 270 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, pl = g.player, I = g.industry, o = {}; g.eng.render = () => {}; g.hurtPlayer = () => {}; if (!I) return { has: false };
    const run = async (n) => { for (let i = 0; i < n; i++) { window.__upd(1 / 60); if (i % 10 === 0) await new Promise((r) => setTimeout(r, 4)); } };
    const park = (x, y, z) => { pl.body3.teleport(x, y, z); pl.x = x; pl.y = y; pl.z = z; pl.vx = pl.vz = pl.vy = 0; pl.dead = false; };
    const by = (t) => I.items.filter((it) => it.type === t);
    o.has = true; o.pylons = by('pylon').length; o.comms = by('comms').length; o.turbines = by('tower').length; o.sites = I.sites.map((s) => s.s.type).join(',');
    // a turbine: the rotor turns, a blast tips the tower over
    const tb = by('tower')[0]; park(tb.x + 60, tb.y + 1, tb.z); await run(120); const a0 = tb.rotor.rotation.z; await run(60); o.rotorTurns = Math.abs(tb.rotor.rotation.z - a0) > 0.2;
    g.explosion(tb.x + 4, tb.y + 1, tb.z, 30, 500, null); await run(240); o.turbineFell = !tb.alive && tb.fall && tb.fall.done; o.fallenSaved = g.state.places.fallen[tb.id] != null; o.rotorStopped = true;
    // a comms tower: the beacon goes with it
    const ct = by('comms')[0], b0 = I.beacons.count; park(ct.x + 40, ct.y + 1, ct.z); await run(60); g.explosion(ct.x + 3, ct.y + 1, ct.z, 30, 800, null); await run(240); o.beaconOut = I.beacons.count === b0 - 1; o.commsFell = !ct.alive;
    // a pylon: its wires change
    const py = by('pylon').find((p) => p.i > 2), l = py.line, m0 = l.mesh; park(py.x + 40, py.y + 1, py.z); await run(60); g.explosion(py.x + 2, py.y + 1, py.z, 25, 600, null); await run(180); o.pylonFell = !py.alive && l.mesh !== m0;
    // a refinery tank explodes and burns
    const rf = I.sites.find((s) => s.s.type === 'refinery'); if (rf) { park(rf.s.x + 150, rf.y + 1, rf.s.z + 60); await run(60); const tk = rf.tanks[4]; g.explosion(tk.x, rf.y + 3, tk.z, 22, 500, null); await run(30); o.tankBurns = tk.burning > 0; o.tankBoxes = rf.cb ? rf.cb.length : 0; }
    // colliders exist near the player and the pylon base is solid
    const st = by('pylon').find((p) => p.alive); park(st.x + 40, st.y + 1, st.z); await run(120); o.baseBox = I.cb.has(st.id);
    // a bridge: blown up it loses its deck and the ground under it is the valley again; cars stop coming; the save remembers; it is rebuilt after five days
    { const H = g.highways, br = g.hwtraffic.N.roads.find((r) => r.kind === 'highway' && r.cls.some((c, i) => c === 1 && i > 6 && i < r.pts.length - 8)); if (br) {
      const i = br.cls.findIndex((c, k) => c === 1 && k > 6 && k < br.pts.length - 8) + 2, p = br.pts[i], y = br.y[i]; pl.body3.teleport(p[0] + 90, y + 6, p[1]); pl.x = p[0] + 90; pl.y = y + 6; pl.z = p[1]; await run(90);
      const { physHeight } = window.__farHeights, before = physHeight(p[0], p[1], 8); const tris0 = H.stats.tris;
      for (let k = 0; k < 4; k++) { g.explosion(p[0], y, p[1], 30, 600, null); await run(8); }
      o.bridgeBroken = window.__bro.has(br.id + ':' + (i >> 1) * 2); o.groundDrops = physHeight(p[0], p[1], 8) < before - 4; o.bridgeSaved = Object.keys(g.state.places.bridges).length > 0; o.deckGone = H.stats.tris < tris0; } else o.noBridge = true; }
    return o;
  });
  const pass = o.has && o.pylons > 100 && o.comms >= 8 && o.turbines >= 15 && o.rotorTurns && o.turbineFell && o.fallenSaved && o.beaconOut && o.commsFell && o.pylonFell && (o.tankBurns !== false) && o.baseBox && (o.noBridge || (o.bridgeBroken && o.groundDrops && o.bridgeSaved && o.deckGone));
  result('industry', pass, o);
});
