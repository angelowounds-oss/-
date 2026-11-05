// The drawn land never shows through a drawn road (2026-11-05: grass and earth showed on the asphalt of Yeouido, Gangnam and Mapo). At each place,
// once the streets around are built, every registered road top (roadsurf.js: lanes, junction corners, pavements, country roads; tunnel floors are
// not registered) within 450 m is sampled every ~1.5 m and compared with the finest ring of the land (farland.js, its 16 m triangles as drawn):
// fewer than 0.1% of the points may have the land more than 2 cm above the road. No grass tuft or near tree stands on a road, and no program is
// compiled. With OUT=<dir> it writes a view from above and one along a road at each place.
const fs = require('fs');
const path = require('path');
const { run, freeze, result } = require('../lib.cjs');
(async () => {
  const { project, CAPITAL } = await import(path.join(__dirname, '../../src/koreamap.js'));
  const at = (lon, lat) => { const p = project(lon, lat); return { x: Math.round(p.x - CAPITAL.x), z: Math.round(p.z - CAPITAL.z) }; };
  const places = { yeouido: at(126.9243, 37.5219), gangnam: at(127.0276, 37.4979), mapo: at(126.9515, 37.544), guwol: at(126.7052, 37.4563) };
  const out = process.env.OUT; if (out) fs.mkdirSync(out, { recursive: true });
  run('ground-under-roads', { q: 1, width: 800, height: 450 }, async ({ page }) => {
    await freeze(page);
    const o = await page.evaluate(async ({ places, pics }) => {
      const g = window.__game, pl = g.player, L = window.__landfn, S = window.__surf, SS = g.streetscape, R = g.eng.renderer, F = g.farland; g.hurtPlayer = () => {};
      if (!S) return { error: 'no roadsurf hook' };
      const frames = async (n, draw) => { const r = g.eng.render; if (!draw) g.eng.render = () => {}; for (let i = 0; i < n; i++) { window.__upd(1 / 60); if (i % 10 === 9) await new Promise((f) => setTimeout(f, 15)); } g.eng.render = r; };
      const park = (p) => { const y = L.physHeight(p.x, p.z, 8) + 2; pl.body3.teleport(p.x, y, p.z); pl.x = p.x; pl.y = y; pl.z = p.z; pl.vx = pl.vz = pl.vy = 0; pl.dead = false; };
      const settle = async () => { await frames(60); for (let k = 0; k < 60 && SS && (SS.jobs.length || [...SS.tiles.values()].some((r) => r.state !== 'ready')); k++) await frames(30); await frames(60); };
      const shot = async () => { if (window.gc) window.gc(); g.renderFrame(0, true); const f = await window.__readFrame(), k = document.createElement('canvas'); k.width = f.w; k.height = f.h; k.getContext('2d').putImageData(new ImageData(f.data, f.w, f.h), 0, 0); return k.toDataURL('image/jpeg', 0.85); };
      // the drawn land of the finest ring at (x, z): its triangles (a, c, b) and (b, c, d) split along b - c
      const land0 = (x, z) => {
        const Lv = F.levels[0], P = Lv.pos, M = 65, X0 = P[0], Z0 = P[2], c = Lv.cell, fi = (x - X0) / c, fj = (z - Z0) / c, i = Math.floor(fi), j = Math.floor(fj);
        if (i < 0 || j < 0 || i >= 64 || j >= 64) return NaN;
        const u = fi - i, v = fj - j, Y = (a, b) => P[((j + b) * M + i + a) * 3 + 1];
        return u + v <= 1 ? Y(0, 0) + u * (Y(1, 0) - Y(0, 0)) + v * (Y(0, 1) - Y(0, 0)) : Y(1, 1) + (1 - u) * (Y(0, 1) - Y(1, 1)) + (1 - v) * (Y(1, 0) - Y(1, 1));
      };
      const res = { places: {}, shots: {} }, programs0 = R.info.programs.length;
      g.clock.scale = 0; g.clock.t = Math.floor(g.clock.t / 1440) * 1440 + 13 * 60; g.state.weather = { type: 'clear', until: g.clock.t + 1e9 };
      for (const [name, p] of Object.entries(places)) {
        park(p); await settle(); await frames(30);
        const m = { pts: 0, above: 0, above10: 0, worst: 0, worstAt: null, pieces: 0, tris: 0 };
        for (const [id, rec] of S.surfIds()) {
          const T = rec.T; let near = false;
          for (let o2 = 0; o2 < T.length; o2 += 9) {
            const ax = T[o2], ay = T[o2 + 1], az = T[o2 + 2], bx = T[o2 + 3], by = T[o2 + 4], bz = T[o2 + 5], cx = T[o2 + 6], cy = T[o2 + 7], cz = T[o2 + 8];
            if (Math.hypot((ax + bx + cx) / 3 - p.x, (az + bz + cz) / 3 - p.z) > 450) continue; near = true; m.tris++;
            const n = Math.max(1, Math.ceil(Math.max(Math.hypot(bx - ax, bz - az), Math.hypot(cx - ax, cz - az), Math.hypot(cx - bx, cz - bz)) / 1.5));
            for (let a = 0; a <= n; a++) for (let b = 0; a + b <= n; b++) {
              const u = a / n, v = b / n, w = 1 - u - v, x = ax * w + bx * u + cx * v, z = az * w + bz * u + cz * v, y = ay * w + by * u + cy * v;
              if (Math.abs(x) < 1500 && Math.abs(z) < 1500) continue;   // the city's own terrain: the far land is not drawn there
              const t = land0(x, z); if (t !== t) continue;
              m.pts++; const d = t - y; if (d > 0.02) m.above++; if (d > 0.1) m.above10++; if (d > m.worst) { m.worst = +d.toFixed(2); m.worstAt = [Math.round(x), Math.round(z), typeof id === 'string' ? id.split(':')[0] : 'piece'] }
            }
          }
          if (near) m.pieces++;
        }
        m.share = m.pts ? +(m.above / m.pts).toFixed(5) : 0;
        // nothing grows on a road: the grass tufts and the near trees drawn now
        const Fo = g.forest; let onRoad = 0, plants = 0;
        if (Fo) for (const mesh of Object.values(Fo.meshes)) { const A = mesh.instanceMatrix.array; for (let k = 0; k < mesh.count; k++) { const x = A[k * 16 + 12], z = A[k * 16 + 14]; plants++; if (S.topAt(x, z) === S.topAt(x, z)) onRoad++; } }
        m.plants = plants; m.plantsOnRoad = onRoad; m.offRoad = Fo ? Fo.stats.offRoad : 0;
        m.lowered = F.stats.lowered; m.bankSkip = g.highways.stats.bankSkip || 0; m.pierSkip = g.highways.stats.pierSkip || 0; m.surf = S.surfStats();
        res.places[name] = m;
      }
      res.programsGrew = R.info.programs.length - programs0;   // in play: before the pictures, whose views are the test's own
      if (pics) for (const [name, p] of Object.entries(places)) {
        park(p); await settle();
        const gy = L.physHeight(p.x, p.z, 8);
        g.viewCam = { x: p.x + 60, y: gy + 70, z: p.z + 60, tx: p.x, ty: gy, tz: p.z, fov: 60 }; await frames(20); res.shots[name + '-above'] = await shot();
        // along the nearest compiled road from 2 m over it: the land beside and far down the road
        let best = null;
        for (const q of g.highways.art) { if (!q.meshes) continue; const d = Math.hypot(q.cx - p.x, q.cz - p.z); if (!best || d < best.d) best = { d, q }; }
        if (best) {
          const r = best.q.r, i = Math.floor((best.q.a + best.q.b) / 2), j = Math.min(r.pts.length - 1, i + 12), y = g.highways.deckY(r.pts[i][0], r.pts[i][1]);
          g.viewCam = { x: r.pts[i][0], y: (y === y ? y : gy) + 2, z: r.pts[i][1], tx: r.pts[j][0], ty: (y === y ? y : gy) + 1, tz: r.pts[j][1], fov: 60 }; await frames(20); res.shots[name + '-road'] = await shot();
        }
        g.viewCam = null;
      }
      return res;
    }, { places, pics: !!out });
    if (out && o.shots) for (const [k, v] of Object.entries(o.shots)) if (v) fs.writeFileSync(path.join(out, 'gur-' + k + '.jpg'), Buffer.from(v.split(',')[1], 'base64'));
    if (o.shots) delete o.shots;
    const P = o.places || {}, ok = Object.values(P).length === 4 && Object.values(P).every((m) => m.pts > 5000 && m.share < 0.001 && m.plantsOnRoad === 0);
    result('ground-under-roads', !o.error && ok && o.programsGrew === 0, o);
  });
})();
