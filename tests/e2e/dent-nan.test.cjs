// A crash must not turn the screen black (user report 2026-11-10: the sandbox roadster rammed into a wall, the middle of the screen went black in blocks with stepped
// edges). Cause: Vehicle.dent crumpled the 51,000-vertex body 25 times, vertices went through each other, triangles got no area, their normals had length 0, and the
// shader's normalize gave NaN pixels that the bloom's blur spread over the screen. The crumple is bounded now (0.5 m from where a vertex was drawn) and the bloom's
// input drops NaN, infinite and negative pixels, so even a bad normal costs one pixel, not the picture.
const { run, freeze, result } = require('../lib.cjs');
run('dent-nan', { q: 1, width: 640, height: 360 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, pl = g.player, S = g.sandbox, E = g.eng, o = { bad: [] }, bad = (m) => o.bad.push(m);
    const upd = async (n) => { const r = E.render; E.render = () => {}; for (let i = 0; i < n; i++) { window.__upd(1 / 60); if (i % 8 === 7) await new Promise((f) => setTimeout(f, 6)); } E.render = r; };
    pl.body3.teleport(0, 2, 0); pl.x = 0; pl.y = 2; pl.z = 0; await upd(40);
    const orig = S.ahead.bind(S); S.ahead = () => ({ x: 8, y: 2, z: 0, yaw: Math.PI / 2, dx: 1, dz: 0, pl }); S.spawnRoadster(); S.ahead = orig;
    const v = g.vehicles.filter((x) => x.type === 'roadster').pop(); g.enterVehicle(v); g.cam.mode = 0; await upd(60);
    // the same crash 40 times, at the nose and round the car
    v.dentTotal = 0; const L = v.L;
    for (let k = 0; k < 40; k++) { v.dentTotal = 0; const a = k * 0.9, r = L * 0.5; v.dent(v.x + Math.sin(v.h + a) * r, v.z + Math.cos(v.h + a) * r, 0.55); }
    let nanPos = 0, zeroNor = 0, maxMove = 0, dented = 0, verts = 0;
    v.group.traverse((m) => {
      if (!m.isMesh || !m.userData.dentGeo) return; dented++;
      const pos = m.geometry.attributes.position, nor = m.geometry.attributes.normal, p0 = m.userData.dentPos; verts += pos.count;
      let mm = 0; for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i); if (!(x === x && y === y && z === z)) nanPos++; else mm = Math.max(mm, Math.hypot(x - p0[i * 3], y - p0[i * 3 + 1], z - p0[i * 3 + 2])); } maxMove = Math.max(maxMove, mm); (o.meshes = o.meshes || []).push([m.name || m.parent?.name || '', pos.count, +mm.toFixed(3), m.geometry.type]);
      if (nor) for (let i = 0; i < nor.count; i++) { const x = nor.getX(i), y = nor.getY(i), z = nor.getZ(i); if (!(x * x + y * y + z * z > 1e-6)) zeroNor++; }
    });
    o.dent = { dented, verts, nanPos, zeroNor, maxMove: +maxMove.toFixed(3) }; o.meshes = (o.meshes || []).sort((a, b) => b[2] - a[2]).slice(0, 5);
    if (!dented) bad('no mesh was dented'); if (nanPos) bad('NaN positions'); if (zeroNor) bad(`${zeroNor} normals of length 0`); if (maxMove > 0.5 + 1e-3) bad(`a vertex moved ${maxMove} m from where it was drawn`);
    // how much of the picture is left: the mean of the frame drawn small
    const alive = () => { g.renderFrame(0, true); const c = document.createElement('canvas'); c.width = 64; c.height = 36; const x = c.getContext('2d'); x.drawImage(E.renderer.domElement, 0, 0, 64, 36); const d = x.getImageData(0, 0, 64, 36).data; let s = 0, lit = 0; for (let i = 0; i < d.length; i += 4) { const l = d[i] + d[i + 1] + d[i + 2]; s += l; if (l > 30) lit++; } return { mean: +(s / (d.length / 4) / 3).toFixed(1), litShare: +(lit / (d.length / 4)).toFixed(2) }; };
    await upd(5); o.afterDents = alive(); if (o.afterDents.litShare < 0.1) bad(`the picture after the dents is black: ${JSON.stringify(o.afterDents)}`);
    // a bad normal on purpose: every normal of the body mesh set to zero (what the crash made); the picture must stay
    let body = null; v.group.traverse((m) => { if (m.isMesh && m.name === 'body') body = m; });
    if (!body) bad('no body mesh'); else {
      if (!body.userData.dentGeo) { body.geometry = body.geometry.clone(); body.userData.dentGeo = true; }
      const na = body.geometry.attributes.normal.array, keep = Float32Array.from(na); na.fill(0); body.geometry.attributes.normal.needsUpdate = true;
      await upd(3); o.zeroNormals = alive(); if (o.zeroNormals.litShare < 0.1) bad(`zero normals blacked the screen out: ${JSON.stringify(o.zeroNormals)}`);
      na.set(keep); body.geometry.attributes.normal.needsUpdate = true;
    }
    return o;
  });
  result('dent-nan', o.bad.length === 0, o);
});
