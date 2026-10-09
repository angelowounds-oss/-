// render: the light-loop patch in src/engine.js (skip RE_Direct where directLight.visible is false) must be bit-identical to three.js'
// own lights_fragment_begin chunk. Every material is recompiled with the original chunk text and the frames are compared, with the
// unused lights dark and with point / spot lights switched on around the camera.
const fs = require('fs');
const path = require('path');
const { ROOT, run, freeze, shot, pixelDiff, result } = require('../lib.cjs');
const src = fs.readFileSync(path.join(ROOT, 'build/node_modules/three/src/renderers/shaders/ShaderChunk/lights_fragment_begin.glsl.js'), 'utf8');
const ORIG = src.slice(src.indexOf('`') + 1, src.lastIndexOf('`'));
run('light-skip-identity', { q: 1 }, async ({ page }) => {
  await freeze(page);
  await page.evaluate((ORIG) => {
    const g = window.__game, mats = new Set();
    g.scene.traverse((o) => { const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : []; for (const m of ms) mats.add(m); });
    window.__orig = (on) => {
      for (const m of mats) {
        if (on) { if (m.__ob) continue; m.__ob = m.onBeforeCompile; m.__ck = m.customProgramCacheKey; const ob = m.__ob, ck = m.__ck;
          m.onBeforeCompile = function (sh, r) { ob.call(this, sh, r); sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>', ORIG); };
          m.customProgramCacheKey = function () { return ck.call(this) + '|origLights'; }; m.needsUpdate = true; }
        else if (m.__ob) { m.onBeforeCompile = m.__ob; m.customProgramCacheKey = m.__ck; delete m.__ob; delete m.__ck; m.needsUpdate = true; }
      }
    };
    for (let i = 0; i < 4; i++) window.__upd(1 / 60);
  }, ORIG);
  const metrics = {}; let pass = true;
  for (const label of ['lights-off', 'lights-on']) {
    if (label === 'lights-on') await page.evaluate(() => {
      const g = window.__game, c = g.camera.position;
      for (let k = 0; k < 5; k++) g.lights.flash(c.x + Math.cos(k) * 6, c.y + 0.5, c.z + Math.sin(k) * 6, 0xffc070, 40, 25, 99);
      g.lights.update(0);
      if (g.flash) { g.flash.intensity = 60; g.flash.position.copy(c); g.flash.target.position.set(c.x, 0, c.z - 10); g.flash.target.updateMatrixWorld(); }
    });
    const A = await shot(page); await page.evaluate(() => window.__orig(true)); const B = await shot(page); await page.evaluate(() => window.__orig(false)); await shot(page);
    const d = pixelDiff(A, B); metrics[label] = d.diffBytes; if (d.diffBytes) pass = false;
  }
  result('light-skip-identity', pass, { diffBytes: metrics });
});
