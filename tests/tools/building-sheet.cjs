// WLD-12 tool (not a test): contact sheet of stepped buildings, one cell each, seen from the +x+z side where the set-backs face.
//   OUT=sheet.png PICK=6 node tests/tools/building-sheet.cjs
const { openGame, freeze } = require('../lib.cjs');
const fs = require('fs');
(async () => {
  const { browser, page, errors } = await openGame({ q: 1, width: 640, height: 480 });
  await freeze(page);
  const url = await page.evaluate(({ PICK }) => {
    const g = window.__game, THREE = window.__THREE, w = g.world;
    g.eng.render = () => {};
    const R = g.eng.renderer, cv = R.domElement;
    const lots = w.lots.filter((l) => !l.far && !l.model && l.stages && l.stages.filter((s) => s.kind === 'tower').length > 1 && l.h > 60);
    const picks = lots.filter((l, i) => i % Math.max(1, Math.floor(lots.length / PICK)) === 0).slice(0, PICK);
    const cell = 400, cols = 3, rows = Math.ceil(picks.length / cols);
    const sheet = document.createElement('canvas'); sheet.width = cols * cell; sheet.height = rows * cell;
    const sx = sheet.getContext('2d'); sx.fillStyle = '#111'; sx.fillRect(0, 0, sheet.width, sheet.height);
    R.setPixelRatio(1); R.setSize(cell, cell, false);
    const cam = new THREE.PerspectiveCamera(40, 1, 1, 3000);
    let i = 0;
    for (const l of picks) {
      const cx = (l.x0 + l.x1) / 2, cz = (l.z0 + l.z1) / 2, dist = l.h * 1.6 + 60, ty = l.h * 0.75;
      for (const sgn of [1]) {
        cam.position.set(cx + sgn * dist * 0.75, l.h * 0.9 + 20, cz + sgn * dist * 0.75); cam.lookAt(cx, l.h * 0.5, cz);
        g.scene.updateMatrixWorld(true); R.render(g.scene, cam);
        sx.drawImage(cv, (i % cols) * cell, Math.floor(i / cols) * cell, cell, cell);
        sx.fillStyle = '#fff'; sx.font = '12px monospace'; sx.fillText(`${l.stages.filter((s) => s.kind === 'tower').length}T ${l.stages.filter((s) => s.kind === 'crown').length}C h=${Math.round(l.h)} ${sgn > 0 ? '+x+z' : '-x-z'}`, (i % cols) * cell + 4, Math.floor(i / cols) * cell + 14);
        i++;
      }
    }
    return sheet.toDataURL('image/png');
  }, { PICK: +(process.env.PICK || 6) });
  fs.writeFileSync(process.env.OUT, Buffer.from(url.split(',')[1], 'base64'));
  console.log('errors', errors.slice(0, 2));
  await browser.close();
})().catch((e) => { console.error(e.message.slice(0, 400)); process.exit(1); });
