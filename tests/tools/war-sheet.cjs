// Tool (not a test): contact sheet of the army base and its three war machines. OUT=sheet.png node tests/tools/war-sheet.cjs
const { openGame, freeze } = require('../lib.cjs');
const fs = require('fs');
(async () => {
  const { browser, page, errors } = await openGame({ q: 1, width: 640, height: 480 });
  await freeze(page);
  const out = await page.evaluate(async () => {
    const g = window.__game, THREE = window.__THREE, W = g.war, pl = g.player, b = W.base;
    g.eng.render = () => {};
    g.clock.hour = 13; pl.body3.teleport(b.cx, 0, b.cz + 40); pl.x = b.cx; pl.z = b.cz + 40;
    for (let i = 0; i < 120; i++) window.__upd(1 / 60);
    const views = [];
    views.push({ name: 'base aerial', p: [b.cx + 30, 55, b.cz + 62], t: [b.cx, 0, b.cz] });
    views.push({ name: 'base west gate', p: [b.cx - 70, 6, b.cz + 4], t: [b.cx - 30, 3, b.cz] });
    for (const s of W.slots) { const v = s.v; const d = s.kind === 'jet' ? 15 : 11; views.push({ name: s.kind + ' front 3/4', p: [v.x + Math.sin(v.h + 0.7) * d, v.by + 4, v.z + Math.cos(v.h + 0.7) * d], t: [v.x, v.by + 0.5, v.z] }); views.push({ name: s.kind + ' rear 3/4', p: [v.x + Math.sin(v.h + 2.4) * d, v.by + 4.5, v.z + Math.cos(v.h + 2.4) * d], t: [v.x, v.by + 0.5, v.z] }); views.push({ name: s.kind + ' side', p: [v.x + Math.cos(v.h) * d, v.by + 2, v.z - Math.sin(v.h) * d], t: [v.x, v.by + 0.8, v.z] }); }
    const R = g.eng.renderer, cv = R.domElement, cell = 400, cols = 3, rowsN = Math.ceil(views.length / cols);
    const sheet = document.createElement('canvas'); sheet.width = cols * cell; sheet.height = rowsN * (cell * 0.75 + 16);
    const sx = sheet.getContext('2d'); sx.fillStyle = '#111'; sx.fillRect(0, 0, sheet.width, sheet.height);
    R.setPixelRatio(1); R.setSize(cell, cell * 0.75, false);
    const cam = new THREE.PerspectiveCamera(60, 4 / 3, 0.1, 600);
    views.forEach((vw, i) => {
      cam.position.set(...vw.p); cam.lookAt(...vw.t); g.scene.updateMatrixWorld(true); R.render(g.scene, cam);
      const x = (i % cols) * cell, y = Math.floor(i / cols) * (cell * 0.75 + 16); sx.drawImage(cv, x, y, cell, cell * 0.75); sx.fillStyle = '#fff'; sx.font = '12px monospace'; sx.fillText(vw.name, x + 4, y + cell * 0.75 + 12);
    });
    return sheet.toDataURL('image/png');
  });
  fs.writeFileSync(process.env.OUT || 'war-sheet.png', Buffer.from(out.split(',')[1], 'base64'));
  if (errors.length) console.log('errors', errors);
  await browser.close();
})();
