// The street furniture of Seoul (WLD-24g, src/streetscape.js): around Gangnam the tiles load and build; pavements, kerbs, crossings, signal poles, lamps and trees
// are drawn; the pavement near the player can be stood on (a ray from above ends at its top), poles are solid; the signal lamps change with time; the number
// of shader programs does not grow while playing; and everything is let go when the player is far away.
// With OUT=<dir> it also writes pictures (an approach to a signalled junction by day and night, and from above) for the contact sheet.
const { run, freeze, result } = require('../lib.cjs');
const fs = require('fs');
const path = require('path');
(async () => {
  const { project, CAPITAL } = await import(path.join(__dirname, '../../src/koreamap.js'));
  const at = (lon, lat) => { const p = project(lon, lat); return { x: Math.round(p.x - CAPITAL.x), z: Math.round(p.z - CAPITAL.z) }; };
  const places = { gangnam: at(127.0276, 37.4979), yeouido: at(126.9243, 37.5219), jamsil: at(127.1025, 37.5126), mapo: at(126.9515, 37.544) };
  const out = process.env.OUT; if (out) fs.mkdirSync(out, { recursive: true });
  run('streetscape', { q: 1, width: 960, height: 540 }, async ({ page }) => {
    await freeze(page);
    const o = await page.evaluate(async ({ places, pics }) => {
      const g = window.__game, pl = g.player, L = window.__landfn, P = g.phys, SS = g.streetscape, R = g.eng.renderer; g.hurtPlayer = () => {};
      if (!SS || !SS.have) return { error: 'no street data in this world' };
      const frames = async (n, draw) => { const r = g.eng.render; if (!draw) g.eng.render = () => {}; for (let i = 0; i < n; i++) { window.__upd(1 / 60); if (i % 10 === 9) await new Promise((f) => setTimeout(f, 15)); } g.eng.render = r; };
      const park = (p) => { const y = L.physHeight(p.x, p.z, 8) + 2; pl.body3.teleport(p.x, y, p.z); pl.x = p.x; pl.y = y; pl.z = p.z; pl.vx = pl.vz = pl.vy = 0; pl.dead = false; };
      const shot = () => { g.renderFrame(0, true); const cv = R.domElement, k = document.createElement('canvas'); k.width = cv.width; k.height = cv.height; k.getContext('2d').drawImage(cv, 0, 0); return k.toDataURL('image/jpeg', 0.85); };
      const settle = async () => { for (let k = 0; k < 60 && (SS.jobs.length || SS.stats.tiles < 3 || [...SS.tiles.values()].some((r) => r.state !== 'ready')); k++) await frames(30); await frames(40); };
      const res = { shots: {} }, programs0 = R.info.programs.length;
      g.clock.scale = 0; g.clock.t = Math.floor(g.clock.t / 1440) * 1440 + 13 * 60; g.state.weather = { type: 'clear', until: g.clock.t + 1e9 };
      park(places.gangnam); await settle();
      Object.assign(res, { tiles: SS.stats.tiles, pave: Math.round(SS.stats.pave), lamps: SS.stats.lamps, trees: SS.stats.trees, signals: SS.stats.signals, crossings: SS.stats.crossings, corners: SS.stats.corners, tris: SS.stats.tris });
      res.meshes = [...SS.tiles.values()].filter((r) => r.meshes && r.meshes.length).length;
      // the pavement collider: a triangle of a top within 25 - 80 m of the player; a ray from 30 m above its centre ends at its height
      let probe = null;
      for (const rec of SS.tiles.values()) {
        if (rec.state !== 'ready' || !rec.col) continue;
        const A = rec.topP, I = rec.topI;
        for (let q = 0; q < I.length && !probe; q += 3 * 7) { const a = I[q] * 3, b = I[q + 1] * 3, c = I[q + 2] * 3, x = (A[a] + A[b] + A[c]) / 3, y = (A[a + 1] + A[b + 1] + A[c + 1]) / 3, z = (A[a + 2] + A[b + 2] + A[c + 2]) / 3, d = Math.hypot(x - pl.x, z - pl.z); if (d > 15 && d < 80) probe = { x, y, z }; }
        if (probe) break;
      }
      // every number that places something must be finite (a bad tile origin once made all junction features NaN, unseen by the counts)
      { let bad = 0; for (const rec of SS.tiles.values()) { if (rec.state !== 'ready') continue; for (const A of [rec.heads, rec.obst, rec.topP]) for (let q = 0; q < A.length; q++) if (!Number.isFinite(A[q])) bad++; for (const m of rec.meshes) { const r = m.geometry.boundingSphere?.radius; if (!Number.isFinite(r) || r <= 0) bad++; } } res.nonFinite = bad; }
      res.walk = SS.stats.walk;
      if (probe) { const hit = P.ray(probe.x, probe.y + 30, probe.z, 0, -1, 0, 60, 1 | 16); res.padTop = hit ? +(probe.y + 30 - hit.t).toFixed(2) : null; res.padExpect = +probe.y.toFixed(2); }
      // a pole within reach is solid: a ray from 1.5 m away at chest height ends on it
      let pole = null;
      for (const rec of SS.tiles.values()) { if (rec.state !== 'ready' || !rec.solid.size) continue; const O = rec.obst; for (const k of rec.solid.keys()) { const q = k * 5; if (Math.hypot(O[q] - pl.x, O[q + 1] - pl.z) < 50) { pole = { x: O[q], z: O[q + 1], y: O[q + 2], h: O[q + 3], r: O[q + 4] }; break; } } if (pole) break; }
      res.solid = SS.stats.solid;
      if (pole) { const hit = P.ray(pole.x + 2, pole.y + 1.2, pole.z, -1, 0, 0, 4, 1 | 16); res.poleHit = hit ? +hit.t.toFixed(2) : null; res.poleExpect = +(2 - pole.r).toFixed(2); }
      // the signal lamps change: a head near the player shows one colour now and another a cycle fraction later
      const lit = () => SS.lamps.map((m) => m.count).join(',');
      const s0 = lit(); SS.t += 38; SS.signals(pl); const s1 = lit(); SS.t -= 38; SS.signals(pl); res.signalA = s0; res.signalB = s1;
      res.programsGrew = R.info.programs.length - programs0;
      if (pics) {
        for (const [name, p] of Object.entries(places)) {
          park(p); await settle();
          // the signalled junction nearest the place: a driver's view of it from 45 m away, then from above
          let best = null;
          for (const rec of SS.tiles.values()) { if (rec.state !== 'ready') continue; const H = rec.heads; for (let q = 0; q < H.length; q += 7) { const d = Math.hypot(H[q] - p.x, H[q + 2] - p.z); if (!best || d < best.d) best = { d, x: H[q], y: H[q + 1], z: H[q + 2], fx: H[q + 3], fz: H[q + 4] }; } }
          if (!best) { res.shots[name + '-none'] = null; continue; }
          const gy = L.physHeight(best.x, best.z, 8), cx = best.x + best.fx * 45, cz = best.z + best.fz * 45;
          const cam = (hgt, back) => ({ x: best.x + best.fx * back, y: L.physHeight(best.x + best.fx * back, best.z + best.fz * back, 8) + hgt, z: best.z + best.fz * back, tx: best.x, ty: gy + 3.5, tz: best.z, fov: 60 });
          void cx; void cz;
          park({ x: best.x, z: best.z }); await frames(120);
          g.viewCam = cam(2.0, 45); await frames(20); res.shots[name + '-approach'] = shot();
          g.viewCam = cam(1.7, 14); await frames(20); res.shots[name + '-close'] = shot();
          // from above the approach itself (a diagonal view from 90 m out was mostly roofs): the markings of the arm and the junction
          g.viewCam = { x: best.x + best.fx * 40, y: gy + 45, z: best.z + best.fz * 40, tx: best.x + best.fx * 8, ty: gy, tz: best.z + best.fz * 8, fov: 60 }; await frames(20); res.shots[name + '-above'] = shot();
          g.viewCam = { x: best.x + best.fx * 22.01, y: gy + 28, z: best.z + best.fz * 22, tx: best.x + best.fx * 22, ty: gy, tz: best.z + best.fz * 22, fov: 60 }; await frames(20); res.shots[name + '-arrows'] = shot();
          g.clock.t = Math.floor(g.clock.t / 1440) * 1440 + 21 * 60; await frames(20);
          g.viewCam = cam(2.0, 45); await frames(20); res.shots[name + '-night'] = shot();
          g.clock.t = Math.floor(g.clock.t / 1440) * 1440 + 13 * 60;
        }
        g.viewCam = null;
      }
      const far = { x: places.gangnam.x + 30000, z: places.gangnam.z + 30000 }; park(far); await frames(120);
      res.farTiles = SS.stats.tiles; res.farSolid = SS.stats.solid; res.farWalk = SS.stats.walk; res.farTris = Math.round(SS.stats.tris);
      return res;
    }, { places, pics: !!out }).catch((e) => ({ error: String(e) }));
    if (out && o.shots) for (const [k, v] of Object.entries(o.shots)) if (v) fs.writeFileSync(path.join(out, `str-${k}.jpg`), Buffer.from(v.split(',')[1], 'base64'));
    delete o.shots;
    const ok = !o.error && o.tiles >= 3 && o.meshes >= 3 && o.pave > 2000 && o.lamps > 20 && o.trees > 20 && o.signals > 0 && o.crossings > 0 && o.corners > 0 && o.walk > 0 && o.nonFinite === 0
      && o.padTop != null && Math.abs(o.padTop - o.padExpect) < 0.05 && o.solid > 0 && (o.poleHit == null || Math.abs(o.poleHit - o.poleExpect) < 0.6) && o.signalA !== o.signalB && o.programsGrew === 0 && o.farTiles === 0 && o.farSolid === 0 && o.farWalk === 0 && o.farTris === 0;
    result('streetscape', ok, o);
  });
})();
