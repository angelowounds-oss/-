// Interior tool (not a test): contact sheet of the rooms of one floor of a building of a given kind, seen from a corner of each room.
//   OUT=sheet.png KIND=apartment|hotel|office FLOOR=2 [CORR=1] node tests/tools/room-sheet.cjs     (FLOOR: tower floor index, 0 = lobby, -1 = first retail)
const { openGame, freeze } = require('../lib.cjs');
const fs = require('fs');
(async () => {
  const { browser, page, errors } = await openGame({ q: 1, width: 640, height: 480 });
  await freeze(page);
  const out = await page.evaluate(async ({ KIND, FLOOR, MAXR, CORR, BATH, HIDE }) =>
    { const process_hide = HIDE;  {
    const g = window.__game, THREE = window.__THREE, pl = g.player, B = g.buildings;
    g.eng.render = () => {};
    const bd = B.list.filter((x) => x.kind === KIND && !x.lot.far && !x.lot.model && x.lot.h > 50).sort((a, b) => Math.hypot(a.cx - pl.x, a.cz - pl.z) - Math.hypot(b.cx - pl.x, b.cz - pl.z))[0];
    const d = bd.lot.door;
    pl.body3.teleport(d.px + d.nx * 3, 0, d.pz + d.nz * 3); pl.x = d.px + d.nx * 3; pl.z = d.pz + d.nz * 3;
    for (let i = 0; i < 300 && !bd.open; i++) window.__upd(1 / 60);
    bd.plan();
    const k = FLOOR === -1 ? bd.levels.findIndex((l) => l.type === 'retail') : FLOOR === 0 ? 0 : bd.levels.findIndex((l) => l.tier === 'tower') + FLOOR;
    bd.ensureRange(k, k, true); while (bd.job) bd.finishJob(); bd.buildFloor(k);
    const fl = bd.floors.get(k), L = bd.levels[k];
    let rooms = (fl.rooms || []).slice(0, MAXR);
    if (BATH) rooms = (fl.rooms || []).filter((r) => r.reserved && r.reserved.length).slice(0, MAXR).map((rm) => { const r = rm.reserved[0], n = rm.wall === 'n'; return { x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, kind: 'bath', cam: [r.x0 + 0.9, n ? r.z0 + 0.75 : r.z1 - 0.75], look: [r.x1 - 0.2, n ? r.z1 : r.z0] }; });
    // lobby / retail / corridors have no room list: six viewpoints around the floor plate, looking at its centre
    if (!rooms.length || CORR) { const r = L.rect, c = bd.core; const pts = CORR ? [[c.x0 + 1, c.zc + 2.5], [c.x0 + 9, c.zc + 2.5], [c.x0 + 17, c.zc + 2.5], [(r.x0 + r.x1) / 2, c.zc + 1.5], [r.x1 - 3, c.zc + 2.5], [c.x0 + 5, c.zc + 6]] : [[r.x0 + 3, r.z0 + 3], [r.x1 - 3, r.z0 + 3], [r.x0 + 3, r.z1 - 3], [r.x1 - 3, r.z1 - 3], [(r.x0 + r.x1) / 2, r.z0 + 3], [(r.x0 + r.x1) / 2, r.z1 - 3]];
      rooms = pts.map(([px, pz], i) => ({ x0: px - 0.5, x1: px + 0.5, z0: pz - 0.5, z1: pz + 0.5, kind: (CORR ? 'corridor' : L.type) + i, look: [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2] })); }
    const R = g.eng.renderer, cv = R.domElement, cell = 400, cols = 3, rowsN = Math.max(1, Math.ceil(Math.max(1, rooms.length) / cols));
    const sheet = document.createElement('canvas'); sheet.width = cols * cell; sheet.height = rowsN * (cell * 0.75 + 16);
    const sx = sheet.getContext('2d'); sx.fillStyle = '#111'; sx.fillRect(0, 0, sheet.width, sheet.height);
    R.setPixelRatio(1); R.setSize(cell, cell * 0.75, false);
    const cam = new THREE.PerspectiveCamera(70, 4 / 3, 0.05, 200);
    const info = { building: bd.name, kind: bd.kind, floor: k, type: L.type, rooms: rooms.map((r) => r.kind) };
    rooms.forEach((rm, i) => {
      const cx = (rm.x0 + rm.x1) / 2, cz = (rm.z0 + rm.z1) / 2;
      pl.body3.teleport(cx, L.y + 0.2, cz); pl.x = cx; pl.z = cz; pl.y = L.y;
      for (let u = 0; u < 20; u++) window.__upd(1 / 60);
      const ex = rm.x0 + 0.5 + (i % 2) * (rm.x1 - rm.x0 - 1), ez = rm.z0 + 0.5 + ((i >> 1) % 2) * (rm.z1 - rm.z0 - 1);
      if (rm.cam) { cam.position.set(rm.cam[0], L.y + 1.5, rm.cam[1]); cam.lookAt(rm.look[0], L.y + 0.9, rm.look[1]); } else if (rm.look) { cam.position.set(cx, L.y + 1.55, cz); cam.lookAt(rm.look[0], L.y + 1.2, rm.look[1]); } else { cam.position.set(ex, L.y + 1.55, ez); cam.lookAt(cx, L.y + 0.9, cz); }
      for (const c of g.scene.children) c.visible = process_hide ? (c.isLight || c === bd.group || c.userData.keep === true || c.name === 'keep') : true; g.scene.updateMatrixWorld(true); R.render(g.scene, cam);
      const x = (i % cols) * cell, y = Math.floor(i / cols) * (cell * 0.75 + 16);
      sx.drawImage(cv, x, y, cell, cell * 0.75); sx.fillStyle = '#fff'; sx.font = '12px monospace'; sx.fillText(`${rm.kind} ${(rm.x1 - rm.x0).toFixed(1)}x${(rm.z1 - rm.z0).toFixed(1)}`, x + 4, y + cell * 0.75 + 12);
    });
    info.url = sheet.toDataURL('image/png');
    return info; }
  }, { KIND: process.env.KIND || 'apartment', FLOOR: +(process.env.FLOOR ?? 2), MAXR: +(process.env.MAXR || 9), CORR: !!process.env.CORR, BATH: !!process.env.BATH, HIDE: !process.env.PEOPLE });
  fs.writeFileSync(process.env.OUT, Buffer.from(out.url.split(',')[1], 'base64'));
  delete out.url; console.log(JSON.stringify(out), errors.slice(0, 2));
  await browser.close();
})().catch((e) => { console.error(e.message.slice(0, 500)); process.exit(1); });
