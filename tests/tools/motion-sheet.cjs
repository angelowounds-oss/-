// Tool (not a test): the player's body moving in each way the CHR-06 motions cover, one row per case, eight frames 0.1 s apart (more where
// the row says), seen from the front-left at hip height. The moves are stepped alone; turning, landing, getting up, looking and the
// gestures run through the game loop. Before / after sheets: GAME_DIR=<old build>/game OUT=before.png node tests/tools/motion-sheet.cjs
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
    // through the game loop: [label, frame step (s), setup run once, then called every frame until it returns true to start the frames]
    const loopCases = [
      ['turn left 90 in place', 0.1, () => { g.cam.yaw = pl.ry; }, (f) => { if (f === 0) { const a0 = pl.ry; pl.turnTo = a0 + Math.PI / 2; } if (pl.turnTo != null) pl.ry += (pl.turnTo - pl.ry) * Math.min(1, 1 / 12); return true; }],
      ['drop 2.5 m', 0.1, () => { body3.teleport(pl.x, pl.y + 2.5, pl.z); pl.y = body3.y; }, (f) => f >= 36],
      ['knocked down, gets up (0.25 s)', 0.25, () => { const d = { x: Math.sin(pl.ry) * -1, z: Math.cos(pl.ry) * -1 }, R0 = g.ragdolls.spawn(pl, { cause: 'fall', alive: true, vel: { x: 0, y: 0, z: 0 } });
        if (R0) { R0.impulse('chest', { x: d.x * 30, y: 0, z: d.z * 30 }); for (const sg of ['shinL', 'shinR']) R0.impulse(sg, { x: -d.x * 10, y: 0, z: -d.z * 10 }); } }, () => !!pl.rag && pl.rag.state === 'GETUP'],
      ['camera 70 deg aside: head', 0.1, () => {}, (f) => { g.cam.yaw = pl.ry + (f >= 6 ? 1.22 : 0); g.cam.pitch = 0; return f >= 6; }],
      ['gesture: point (0.2 s)', 0.2, () => { g.gestures.play('point'); }, () => true],
      ['gesture: typing (0.4 s)', 0.4, () => { g.gestures.play('typing'); }, () => true],
    ];
    const cw = 200, ch = 260, cols = 8, lab = 18;
    const sheet = document.createElement('canvas'); sheet.width = cols * cw; sheet.height = (cases.length + loopCases.length) * (ch + lab);
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
    const home = { x: x0, y: pl.y, z: z0 }, keys = g.input.keys;
    loopCases.forEach(([name, step, setup, go], j) => {
      const row = cases.length + j;
      keys.clear(); pl.dead = false; pl.hpv = 100; pl.vx = pl.vz = 0; pl.stunT = 0; pl.turnTo = null; g.cam.yaw = pl.ry; g.cam.pitch = 0;
      body3.teleport(home.x, home.y, home.z); pl.x = home.x; pl.y = body3.y; pl.z = home.z;
      for (let i = 0; i < 180 && (i < 60 || !body3.grounded); i++) window.__upd(dt);
      setup();
      let f = 0, k = -1, n = 0;
      for (; f < 60 * 12 && k < cols; f++) {
        const on = go(f); window.__upd(dt); if (on && k < 0) { k = 0; n = 0; }
        if (k >= 0) {
          if (n % Math.round(step * 60) === 0) {
            const y = pl.y + 0.9; pl.group.updateMatrixWorld(true);
            cam.position.set(pl.x + 3.4, y + 0.3, pl.z + 4.2); cam.lookAt(pl.x, y, pl.z); g.scene.updateMatrixWorld(true); R.render(g.scene, cam);
            sx.drawImage(cv, k * cw, row * (ch + lab), cw, ch); k++;
          }
          n++;
        }
      }
      sx.fillStyle = '#fff'; sx.font = '13px monospace'; sx.fillText(name, 6, row * (ch + lab) + ch + 13);
      for (let i = 0; i < 240 && (pl.rag || pl.proc); i++) window.__upd(dt);
    });
    pl.turnTo = null;
    return sheet.toDataURL('image/png');
  });
  fs.writeFileSync(process.env.OUT || 'motion-sheet.png', Buffer.from(out.split(',')[1], 'base64'));
  if (errors.length) console.log('errors', errors);
  await browser.close();
})();
