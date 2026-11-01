// The buildings of Seoul (WLD-24b procedural boxes, WLD-24h real OSM outlines; src/realbuildings.js): around Gangnam the tiles load and build, the buildings are drawn (a mesh per tile,
// lit windows at night come from one shader that exists from the start), they are solid near the player (a ray from above lands on a roof, the walls
// block a ray from the side), the number of shader programs does not grow while playing, and they go again when the player moves far away.
// With OUT=<dir> it also writes a picture per place (street level, from above) for the contact sheet.
const { run, freeze, result } = require('../lib.cjs');
const fs = require('fs');
const path = require('path');
(async () => {
  const { project, CAPITAL } = await import(path.join(__dirname, '../../src/koreamap.js'));
  const at = (lon, lat) => { const p = project(lon, lat); return { x: Math.round(p.x - CAPITAL.x), z: Math.round(p.z - CAPITAL.z) }; };
  const places = { gangnam: at(127.0276, 37.4979), yeouido: at(126.9243, 37.5219), jamsil: at(127.1025, 37.5126), mapo: at(126.9515, 37.544) };
  const out = process.env.OUT; if (out) fs.mkdirSync(out, { recursive: true });
  run('realbuildings', { q: 1, width: 960, height: 540 }, async ({ page }) => {
    await freeze(page);
    const o = await page.evaluate(async ({ places, pics }) => {
      const g = window.__game, pl = g.player, L = window.__landfn, P = g.phys, RB = g.realbuildings, R = g.eng.renderer; g.hurtPlayer = () => {};
      if (!RB || !RB.have) return { error: 'no buildings in this world' };
      // chunks are read and inflated asynchronously, so the loop gives the page a moment every few frames, as real frames would
      const frames = async (n, draw) => { const r = g.eng.render; if (!draw) g.eng.render = () => {}; for (let i = 0; i < n; i++) { window.__upd(1 / 60); if (i % 10 === 9) await new Promise((f) => setTimeout(f, 15)); } g.eng.render = r; };
      const park = (p) => { const y = L.physHeight(p.x, p.z, 8) + 2; pl.body3.teleport(p.x, y, p.z); pl.x = p.x; pl.y = y; pl.z = p.z; pl.vx = pl.vz = pl.vy = 0; pl.dead = false; };
      const shot = () => { g.renderFrame(0, true); const cv = R.domElement, k = document.createElement('canvas'); k.width = cv.width; k.height = cv.height; k.getContext('2d').drawImage(cv, 0, 0); return k.toDataURL('image/jpeg', 0.85); };
      const res = { shots: {} }, programs0 = R.info.programs.length;
      g.clock.scale = 0; g.clock.t = Math.floor(g.clock.t / 1440) * 1440 + 13 * 60; g.state.weather = { type: 'clear', until: g.clock.t + 1e9 };
      park(places.gangnam); for (let k = 0; k < 40 && (RB.jobs.length || RB.stats.tiles < 4 || [...RB.tiles.values()].some((r) => r.state !== 'ready')); k++) await frames(30);
      await frames(60);
      res.tiles = RB.stats.tiles; res.buildings = RB.stats.buildings; res.solid = RB.stats.solid; res.meshes = [...RB.tiles.values()].filter((r) => r.mesh).length;
      // the roof of a building 30-80 m away is where a ray from above ends; a ray along the ground at the foot of its wall hits it
      let probe = null;
      for (const [id, rec] of RB.tiles) { if (rec.state !== 'ready') continue; const T = rec.chunk, cx = (rec.e.ti - 256) * 512 + 256, cz = (rec.e.tj - 256) * 512 + 256; for (let q = 0; q < T.n; q++) { const bx = cx + T.cx[q] / 10, bz = cz + T.cz[q] / 10, d = Math.hypot(bx - pl.x, bz - pl.z); if (d > 30 && d < 120 && T.fl[q] >= 4 && !T.notch[q]) { probe = { bx, bz, fl: T.fl[q], kind: T.kind[q], base: rec.base[q], w: T.w[q] / 10, d: T.d[q] / 10, rot: T.rot[q] / 65535 * Math.PI, q }; break; } } if (probe) break; }
      if (probe) {
        const hit = P.ray(probe.bx, probe.base + 400, probe.bz, 0, -1, 0, 800, 1 | 16);
        res.roofHit = hit ? +(probe.base + 400 - hit.t).toFixed(1) : null; res.roofTag = hit?.ref?.tag || null; res.roofExpect = +(probe.base + probe.fl * [2.9, 2.9, 3.6, 3.9, 2.9, 6, 3.9][probe.kind] + 0.4).toFixed(1);
        // a ray toward the wall from 2 m outside it, tried from each of the four sides (a neighbour may stand on one): the first ray that starts in the open must stop at the wall
        const ux = Math.cos(probe.rot), uz = Math.sin(probe.rot), vx = -uz, vz = ux; res.wallHit = null; res.wallExpect = 2;
        for (const [dx, dz, half] of [[ux, uz, probe.w / 2], [-ux, -uz, probe.w / 2], [vx, vz, probe.d / 2], [-vx, -vz, probe.d / 2]]) {
          const ox = probe.bx + dx * (half + 2), oz = probe.bz + dz * (half + 2), up = P.ray(ox, probe.base + 3, oz, 0, 1, 0, 0.5, 1 | 16);
          if (up && up.t < 0.01) continue;
          const side = P.ray(ox, probe.base + 3, oz, -dx, 0, -dz, 10, 1 | 16); res.wallHit = side ? +side.t.toFixed(2) : -1; break;
        }
      }
      // the same for a real building (an OSM outline, WLD-24h): a ray from above at the centre of a roof triangle ends at the roof, a ray toward the middle
      // of its longest wall from 2 m outside ends at the wall (the outward side from the ring's winding, as the renderer takes it)
      for (const [, rec] of RB.tiles) {
        if (rec.state !== 'ready' || !rec.chunk.pn || res.polyRoof !== undefined) continue;
        const T = rec.chunk, cx = (rec.e.ti - 256) * 512 + 256, cz = (rec.e.tj - 256) * 512 + 256;
        for (let q = 0; q < T.pn; q++) {
          const R0 = rec.roofs[q]; if (!R0 || !R0.faces.length || R0.y1 - R0.y0 < 8) continue;
          const ring = []; for (let v = T.ro[T.pr[q]]; v < T.ro[T.pr[q] + 1]; v++) ring.push([cx + T.px[v] / 10, cz + T.pz[v] / 10]);
          const f = R0.faces[0], a = R0.all[f[0]], b = R0.all[f[1]], c = R0.all[f[2]], tx = cx + (a[0] + b[0] + c[0]) / 3, tz = cz + (a[1] + b[1] + c[1]) / 3;
          if (Math.hypot(tx - pl.x, tz - pl.z) > 160) continue;
          const hit = P.ray(tx, R0.y1 + 50, tz, 0, -1, 0, 100, 1 | 16); res.polyRoof = hit ? +(R0.y1 + 50 - hit.t).toFixed(2) : null; res.polyRoofExpect = +R0.y1.toFixed(2);
          let a2 = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a2 += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
          let best = 0, mid = null; for (let i = 0; i < ring.length; i++) { const A = ring[i], B = ring[(i + 1) % ring.length], l = Math.hypot(B[0] - A[0], B[1] - A[1]); if (l > best) { best = l; mid = { x: (A[0] + B[0]) / 2, z: (A[1] + B[1]) / 2, nx: Math.sign(a2) * (B[1] - A[1]) / l, nz: -Math.sign(a2) * (B[0] - A[0]) / l }; } }
          const y = R0.y1 - 1.5, ox = mid.x + mid.nx * 2, oz = mid.z + mid.nz * 2, side = P.ray(ox, y, oz, -mid.nx, 0, -mid.nz, 10, 1 | 16);
          res.polyWall = side ? +side.t.toFixed(2) : -1; res.polyPid = T.pid[q];
          break;
        }
      }
      res.programsGrew = R.info.programs.length - programs0;
      if (pics) {
        for (const [name, p] of Object.entries(places)) {
          park(p); await frames(180);
          const dirs = [[0.7, 0.7], [-0.7, 0.7], [0, 1]];
          g.viewCam = { x: p.x - 18, y: L.physHeight(p.x, p.z, 8) + 2.2, z: p.z - 18, tx: p.x + 120, ty: L.physHeight(p.x, p.z, 8) + 25, tz: p.z + 120, fov: 62 }; await frames(20); res.shots[name + '-street'] = shot();
          g.viewCam = { x: p.x - 500, y: L.physHeight(p.x, p.z, 8) + 420, z: p.z - 500, tx: p.x + 60, ty: L.physHeight(p.x, p.z, 8), tz: p.z + 60, fov: 55 }; await frames(30); res.shots[name + '-above'] = shot();
          g.clock.t = Math.floor(g.clock.t / 1440) * 1440 + 21 * 60; await frames(20);
          g.viewCam = { x: p.x - 18, y: L.physHeight(p.x, p.z, 8) + 2.2, z: p.z - 18, tx: p.x + 120, ty: L.physHeight(p.x, p.z, 8) + 25, tz: p.z + 120, fov: 62 }; await frames(20); res.shots[name + '-night'] = shot();
          g.clock.t = Math.floor(g.clock.t / 1440) * 1440 + 13 * 60; void dirs;
        }
        g.viewCam = null;
      }
      // far away (the other end of the map) they are let go
      const far = { x: places.gangnam.x + 30000, z: places.gangnam.z + 30000 }; park(far); await frames(120);
      res.farTiles = RB.stats.tiles; res.farSolid = RB.stats.solid;
      return res;
    }, { places, pics: !!out }).catch((e) => ({ error: String(e) }));
    if (out && o.shots) for (const [k, v] of Object.entries(o.shots)) fs.writeFileSync(path.join(out, `bld-${k}.jpg`), Buffer.from(v.split(',')[1], 'base64'));
    delete o.shots;
    const ok = !o.error && o.tiles >= 4 && o.meshes >= 4 && o.buildings > 500 && o.solid > 20 && ((o.roofTag === 'building' && Math.abs(o.roofHit - o.roofExpect) < 1.5 && o.wallHit != null && Math.abs(o.wallHit - o.wallExpect) < 0.6) || o.roofHit === undefined)
      && o.polyRoof != null && Math.abs(o.polyRoof - o.polyRoofExpect) < 0.3 && o.polyWall != null && Math.abs(o.polyWall - 2) < 0.6 && o.programsGrew === 0 && o.farTiles === 0 && o.farSolid === 0;
    result('realbuildings', ok, o);
  });
})();
