// gameplay (WLD-13): the one 1000 m building. It stands (tiers to a 975 m roof + 25 m spire, collider all the way up, physics ray from
// above hits it), its lift is the express one (42 m/s): a ride from the lobby to the roof takes 25-50 s of game time, the cab never falls
// through the unbuilt volume (rider stays in the cab), floors are not streamed while passing, the roof floor exists at arrival and the
// doors open there. And the player at the foot of it sees its top, not fog: a render looking up differs from a pure-fog frame.
const { run, freeze, result } = require('../lib.cjs');
run('sky-tower', { q: 1, width: 480, height: 270 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(() => {
    const g = window.__game, W = g.world, l = W.skyTower, pl = g.player, o = {}; const R = g.eng.render; g.eng.render = () => {};
    o.exists = !!l; if (!l) return o;
    o.h = l.h; o.roof = l.tiers.tower.y1; o.name = l.name; o.far = g.camera.far;
    const bd = g.buildings.byLot.get(l); o.hasBuilding = !!bd;
    // collider reaches the top: a physics ray from above the roof straight down onto it
    const cx = (l.x0 + l.x1) / 2, cz = (l.z0 + l.z1) / 2; g.phys.world.step();
    const hit = g.phys.ray(cx + 3, 1040, cz + 3, 0, -1, 0, 1100, 1 | 16); o.rayFromAbove = hit ? +(1040 - hit.t).toFixed(1) : null;
    // go to the door, open the building, ride the lift to the roof
    g.sandbox.toSkyTower();
    for (let i = 0; i < 900 && !bd.open; i++) window.__upd(1 / 60);
    for (let i = 0; i < 400; i++) window.__upd(1 / 60);
    o.open = bd.open; o.levels = bd.levels.length; o.express = !!(bd.elev && bd.elev.express);
    const E = bd.elev; const roofK = bd.levels.length - 1;
    // stand in the cab (it waits at the lobby with the doors open) and send it to the roof
    pl.body3.teleport(E.cx, E.y + 0.1, E.cz); pl.x = E.cx; pl.y = E.y + 0.1; pl.z = E.cz; for (let i = 0; i < 20; i++) window.__upd(1 / 60);
    o.riding0 = E.riding(pl);
    E.send(roofK); let t = 0, vmax = 0, floorsMid = 0, maxOff = 0, minY = 1e9;
    const builtBefore = bd.floors.size;
    while (t < 90 && !(E.state === 'idle' && E.level === roofK && E.doorOpen > 0.9)) {
      window.__upd(1 / 60); t += 1 / 60; vmax = Math.max(vmax, E.speed || 0);
      if (E.state === 'moving') { maxOff = Math.max(maxOff, Math.abs(pl.y - E.y)); if (E.y > 200 && E.y < 700) floorsMid = Math.max(floorsMid, bd.floors.size); }
    }
    o.rideSeconds = +t.toFixed(1); o.vmax = +vmax.toFixed(1); o.maxOffCab = +maxOff.toFixed(2); o.floorsDuringMid = floorsMid; o.builtBefore = builtBefore;
    o.arrivedLevel = E.level === roofK; o.roofBuilt = bd.floors.has(roofK); o.doorsOpen = E.doorOpen > 0.9; o.riderY = +pl.y.toFixed(1); o.cabY = +E.y.toFixed(1);
    o.solids = bd.solidTower ? bd.solidTower.length : 0;
    // fog: looking up at the tower top from 250 m away is not a flat fog-coloured frame
    pl.body3.teleport(cx + 250, 0.1, cz); pl.x = cx + 250; pl.y = 0.1; pl.z = cz; pl.group.visible = false;
    for (let i = 0; i < 60; i++) window.__upd(1 / 60);
    g.sandbox.setHour(15);
    const cam = g.camera; g.updateCamera = () => { cam.position.set(cx + 250, 6, cz); cam.lookAt(cx, 700, cz); };
    g.updateCamera(); g.eng.render = R; g.renderFrame(0, true);
    const c = g.eng.renderer.domElement, tc = document.createElement('canvas'); tc.width = c.width; tc.height = c.height; const x = tc.getContext('2d'); x.drawImage(c, 0, 0);
    const d = x.getImageData(0, 0, tc.width, tc.height).data; let mean = 0, n = d.length / 4; for (let i = 0; i < d.length; i += 4) mean += d[i] + d[i + 1] + d[i + 2]; mean /= n * 3;
    let varc = 0; for (let i = 0; i < d.length; i += 4) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3 - mean; varc += v * v; } o.lumStd = +Math.sqrt(varc / n).toFixed(1);
    return o;
  });
  const pass = o.exists && o.h === 1000 && o.roof === 975 && o.far >= 2000 && o.rayFromAbove > 990 && o.open && o.express && o.levels > 200 && o.riding0
    && o.rideSeconds > 25 && o.rideSeconds < 50 && o.vmax > 38 && o.maxOffCab < 0.6 && o.arrivedLevel && o.roofBuilt && o.doorsOpen && o.floorsDuringMid <= o.builtBefore + 1 && o.lumStd > 12;
  result('sky-tower', pass, o);
});
