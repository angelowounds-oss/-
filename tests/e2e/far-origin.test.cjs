// Far from the capital (EV-04): Jeju is 452 km out, Busan 325 km, where a 32-bit float has a step of 3 cm (2 cm at Busan). At each of them and at
// the capital, for reference:
//   render: every drawn object within 3 km of the camera, the largest coordinate the GPU sees for its vertices within 500 m of the camera (its
//           geometry about its own origin, and an instanced mesh's instance offsets on top): above 8 km a vertex is placed coarser than 1 mm. Three.js computes each object's
//           camera-relative matrix in doubles, so an object whose own coordinates are small is exact however far it is; one built in world
//           coordinates is not.
//   still:  the player standing 2 s: how far the camera moves (AC <= 1 mm)
//   drive:  a sedan full throttle with the wheel straight on a flat slab 1.2 km long: how far it strays sideways in 1 km (AC <= 1 cm)
const { run, freeze, result } = require('../lib.cjs');
const SITES = [['capital', 300, 300], ['busan', 188474, 264910], ['jeju', -45083, 451791]];
run('far-origin', { q: 1, width: 480, height: 300 }, async ({ page }) => {
  await freeze(page);
  await page.evaluate(() => {
    const g = window.__game; g.hurtPlayer = () => {}; g.clock.scale = 0; g.state.weather = { type: 'clear', until: 1e12 }; g.daynight.wet = 0;
    window.__fo = { step: async (n) => { const r = g.eng.render; g.eng.render = () => {}; for (let i = 0; i < n; i++) { window.__upd(1 / 60); if (i % 3 === 2) await new Promise((f) => setTimeout(f, 5)); } g.eng.render = r; } };
  });
  const o = { sites: {} };
  for (const [name, x, z] of SITES) {
    await page.evaluate(({ x, z }) => window.__region && window.__region.regionLoad ? window.__region.regionLoad(x, z, 4000) : null, { x, z });
    const s = await page.evaluate(async ({ x, z }) => {
      const g = window.__game, pl = g.player, L = window.__landfn, FO = window.__fo;
      const y = L.physHeight(x, z, 8) + 1.2; pl.body3.teleport(x, y, z); pl.x = x; pl.y = y; pl.z = z; pl.vx = pl.vy = pl.vz = 0; pl.dead = false;
      await FO.step(240); g.renderFrame(0, true);
      // the render precision
      const cam = g.eng.camera, cp = cam.getWorldPosition(new cam.position.constructor()), rows = [];
      let objects = 0;
      g.eng.scene.traverseVisible((ob) => {
        const geo = ob.geometry; if (!geo || !geo.attributes || !geo.attributes.position) return;
        if (!geo.boundingSphere) geo.computeBoundingSphere(); const bs = geo.boundingSphere; if (!bs || !isFinite(bs.radius)) return;
        // the camera in the object's own frame: the vertices drawn near it are about that far from the object's origin (a mesh spanning the country
        // is exact near the capital, its own origin), bounded by the object's own size; an instanced mesh counts only its instances within 500 m
        const inv = ob.matrixWorld.clone().invert(), cl = cp.clone().applyMatrix4(inv), sc = ob.matrixWorld.getMaxScaleOnAxis() || 1, R = 500 / sc;   // a millimetre matters for what is drawn within 500 m
        let mag;
        if (ob.isInstancedMesh) {
          const e = ob.instanceMatrix.array; let near = 0; mag = 0;
          for (let i = 0; i < ob.count; i++) { const tx = e[i * 16 + 12], ty = e[i * 16 + 13], tz = e[i * 16 + 14]; if (Math.hypot(tx - cl.x, ty - cl.y, tz - cl.z) > R + bs.radius) continue; near++; mag = Math.max(mag, Math.hypot(tx, ty, tz) + bs.radius); }
          if (!near) return;
        } else {
          const c = bs.center.clone().applyMatrix4(ob.matrixWorld), wr = bs.radius * sc; if (c.distanceTo(cp) - wr > 3000) return;
          mag = Math.min(bs.center.length() + bs.radius, cl.length() + R);
        }
        objects++;
        if (mag > 8192) { let n = ob, path = []; while (n && path.length < 4) { path.push(n.name || n.type); n = n.parent; } rows.push({ path: path.join('<'), mag: Math.round(mag), mm: +(Math.pow(2, Math.floor(Math.log2(mag)) - 23) * 1000).toFixed(1), verts: geo.attributes.position.count, inst: ob.isInstancedMesh ? ob.count : 0, mat: ob.material && (ob.material.name || ob.material.type), geo: geo.type }); }
      });
      rows.sort((a, b) => b.mag - a.mag);
      // the still camera
      const c0 = cam.getWorldPosition(new cam.position.constructor()); let still = 0;
      for (let i = 0; i < 120; i++) { await FO.step(1); g.renderFrame(1 / 60, false); still = Math.max(still, cam.getWorldPosition(new cam.position.constructor()).distanceTo(c0)); }
      return { objects, coarse: rows.length, worst: rows.slice(0, 6), stillMm: +(still * 1000).toFixed(2), feet: +(pl.y - L.physHeight(pl.x, pl.z, 8)).toFixed(2) };
    }, { x, z });
    // the straight drive on a slab 2 km up (clear of the buildings), stepped as the game steps a car, the origin following it as game.update does
    s.drive = await page.evaluate(async ({ x, z }) => {
      const g = window.__game, P = g.phys, R = P.R, pl = g.player, Y = 2000, G = ((1 << 16) | 0xffff) >>> 0, slabs = [];
      for (let i = 0; i < 3; i++) slabs.push(P.world.createCollider(R.ColliderDesc.cuboid(200, 1, 20).setTranslation(x + i * 400 + 150, Y - 1, z).setFriction(1).setCollisionGroups(G)));
      pl.body3.teleport(x, Y + 1, z + 10); pl.x = x; pl.y = Y + 1; pl.z = z + 10; pl.vx = pl.vy = pl.vz = 0;
      const V = g.vehicles[0].constructor, v = new V(g, 'sedan', 0x333333, 'parked', {});
      v.x = x; v.z = z; v.h = Math.PI / 2; v.spawnY = Y; v.awake = true; v.fuel = 1e9; g.addVehicle(v); await window.__fo.step(30);
      const gi = g.vehicles.indexOf(v); if (gi >= 0) g.vehicles.splice(gi, 1); v.driver = 'lab'; v.kind = 'lab';
      let side = 0, n = 0; const z0 = v.pv.body.translation().z, x0 = v.pv.body.translation().x;
      while (n < 60 * 60) {
        v.throttle = 1; v.brake = 0; v.steer = 0; v.hand = false; v.control(1 / 60); v.throttle = 1; v.brake = 0; v.steer = 0;
        if (P.followOrigin) P.followOrigin(v.x, v.z); P.step(1 / 60, () => v.applyDrive(), [v.pv]); v.post(1 / 60); n++;
        const t = v.pv.body.translation(); side = Math.max(side, Math.abs(t.z - z0));
        if (t.x - x0 >= 1000 || t.y < Y - 5) break;
        if (n % 200 === 0) await new Promise((f) => setTimeout(f, 0));
      }
      const t = v.pv.body.translation(), r = { dist: Math.round(t.x - x0), sideCm: +(side * 100).toFixed(2), secs: +(n / 60).toFixed(1), onSlab: t.y > Y - 5 };
      g.removeVehicle(v); for (const c of slabs) P.world.removeCollider(c, false);
      return r;
    }, { x, z });
    o.sites[name] = s;
  }
  const bad = [], S = o.sites;
  for (const [name] of SITES) {
    const s = S[name];
    if (s.coarse) bad.push(`${name}: ${s.coarse} drawn objects placed coarser than 1 mm (worst ${s.worst[0].path} ${s.worst[0].mag} m, ${s.worst[0].mm} mm)`);
    if (s.stillMm > 1) bad.push(`${name}: the still camera moves ${s.stillMm} mm`);
    if (!s.drive.onSlab || s.drive.dist < 1000) bad.push(`${name}: the drive ended at ${s.drive.dist} m`);
    else if (s.drive.sideCm > 1) bad.push(`${name}: the car strays ${s.drive.sideCm} cm sideways in 1 km`);
  }
  return result('far-origin', !bad.length, o, bad.join(' | '));
});
