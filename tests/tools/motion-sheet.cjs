// Tool (not a test): the player's body moving in each way the CHR-06 motions cover, one row per case, eight frames 0.1 s apart, seen from
// the front-left at hip height. Before / after sheets: GAME_DIR=<old build>/game OUT=before.png node tests/tools/motion-sheet.cjs
const { openGame, freeze } = require('../lib.cjs');
const fs = require('fs');
(async () => {
  const { browser, page, errors } = await openGame({ q: 1, width: 480, height: 360 });
  await freeze(page);
  const out = await page.evaluate(async () => {
    const g = window.__game, THREE = window.__THREE, pl = g.player, R = g.eng.renderer, cv = R.domElement;
    g.eng.render = () => {}; g.clock.hour = 13; for (let i = 0; i < 30; i++) window.__upd(1 / 60);
    pl.dead = false; pl.reactT = 0; pl.crouch = 0; pl.crouching = false; pl.prone = false; pl.swimming = false; pl.gestUB = null; pl.proc = null;
    const body3 = pl.body3; pl.body3 = null;
    const cases = [
      ['walk 1.4', { speed: 1.4 }], ['aim forward 2.6', { speed: 2.6, aim: true }], ['aim right 2.6', { speed: 2.6, dir: -Math.PI / 2, aim: true }],
      ['aim left 2.6', { speed: 2.6, dir: Math.PI / 2, aim: true }], ['aim back 2.6', { speed: 2.6, dir: Math.PI, aim: true }],
      ['aim forward-right 2.6', { speed: 2.6, dir: -Math.PI / 4, aim: true }], ['run 5.2', { speed: 5.2 }], ['sprint 8.4', { speed: 8.4 }],
    ];
    const cw = 200, ch = 260, cols = 8, lab = 18;
    const sheet = document.createElement('canvas'); sheet.width = cols * cw; sheet.height = cases.length * (ch + lab);
    const sx = sheet.getContext('2d'); sx.fillStyle = '#111'; sx.fillRect(0, 0, sheet.width, sheet.height);
    R.setPixelRatio(1); R.setSize(cw, ch, false);
    const cam = new THREE.PerspectiveCamera(32, cw / ch, 0.1, 400), x0 = pl.x, z0 = pl.z, dt = 1 / 60;
    cases.forEach(([name, c], row) => {
      pl.x = x0; pl.z = z0; pl.armed = !!c.aim; pl.forceAim = !!c.aim; pl.aimT = c.aim ? 1 : 0; pl.aimPitch = 0;
      const dir = c.dir || 0, vx = Math.sin(dir) * c.speed, vz = Math.cos(dir) * c.speed;
      for (let i = 0; i < 90 + cols * 6; i++) {
        pl.x += vx * dt; pl.z += vz * dt; pl.vx = vx; pl.vz = vz; pl.speed = c.speed; pl.ry = 0; if (c.aim) pl.aimT = 1;
        pl.constructor.camX = pl.x; pl.constructor.camZ = pl.z; pl.animateSkinned(dt);   // distance LOD measured from the body itself
        if (i >= 90 && (i - 90) % 6 === 0) {
          const k = (i - 90) / 6, y = pl.y + 0.9;
          cam.position.set(pl.x + 3.4, y + 0.3, pl.z + 4.2); cam.lookAt(pl.x, y, pl.z); g.scene.updateMatrixWorld(true); R.render(g.scene, cam);
          sx.drawImage(cv, k * cw, row * (ch + lab), cw, ch);
        }
      }
      sx.fillStyle = '#fff'; sx.font = '13px monospace'; sx.fillText(name, 6, row * (ch + lab) + ch + 13);
    });
    pl.body3 = body3; pl.armed = false; pl.aimT = 0; pl.forceAim = false; pl.speed = 0; pl.vx = pl.vz = 0;
    return sheet.toDataURL('image/png');
  });
  fs.writeFileSync(process.env.OUT || 'motion-sheet.png', Buffer.from(out.split(',')[1], 'base64'));
  if (errors.length) console.log('errors', errors);
  await browser.close();
})();
