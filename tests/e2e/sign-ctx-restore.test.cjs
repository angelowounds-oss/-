// render: the entrance name boards live in one texture array uploaded by hand (uploadSigns in src/world.js). After a lost + restored
// WebGL context they must be re-uploaded: every layer and mip level read back after the restore equals the one read before the loss.
const { run, freeze, result } = require('../lib.cjs');
run('sign-ctx-restore', { q: 0 }, async ({ page }) => {
  await freeze(page);
  const read = () => page.evaluate(() => {
    const g = window.__game, R = g.eng.renderer, gl = R.getContext(), m = g.world.signMesh;
    if (!m || !m.userData.signTex) return null;
    const tex = R.properties.get(m.userData.signTex).__webglTexture; if (!tex) return null;
    const layers = m.userData.signs.length, fb = gl.createFramebuffer(), out = [];
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    for (const lvl of [0, 2, 4]) {
      const w = Math.max(1, 512 >> lvl), h = Math.max(1, 112 >> lvl); let sum = 0;
      for (let k = 0; k < layers; k++) { gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, tex, lvl, k); const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); let s = 0; for (let i = 0; i < px.length; i++) s = (s * 31 + px[i]) >>> 0; sum = (sum * 131 + s) >>> 0; }
      out.push(sum);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb);
    return { layers, hashes: out };
  });
  await page.evaluate(() => window.__game.renderFrame(0, true));
  const before = await read();
  const lost = await page.evaluate(async () => {
    const g = window.__game, ext = g.eng.renderer.getContext().getExtension('WEBGL_lose_context'); if (!ext) return false;
    ext.loseContext(); await new Promise((r) => setTimeout(r, 300)); ext.restoreContext(); await new Promise((r) => setTimeout(r, 600));
    for (let i = 0; i < 3; i++) { g.renderFrame(0, true); await new Promise((r) => requestAnimationFrame(r)); }
    await new Promise((r) => setTimeout(r, 300)); return true;
  });
  const after = await read();
  const pass = !!(lost && before && after && before.layers > 0 && JSON.stringify(before.hashes) === JSON.stringify(after.hashes));
  result('sign-ctx-restore', pass, { layers: before && before.layers, before: before && before.hashes, after: after && after.hashes, contextLost: lost });
});
