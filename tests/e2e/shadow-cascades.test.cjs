// render (EV-41): cascaded sun / moon shadows. At HIGH there are four cascades whose far edges grow 25 -> 80 -> 250 -> 800 m; a point 15 m
// ahead of the camera falls in cascade 0 and one 600 m ahead in cascade 3; the far cascades are redrawn every 2nd / 4th frame; changing
// the cascade count or the reach in the settings compiles no shader; and with the shadows on, the far part of a midday street view
// (beyond the old single 85 m box) is darker than with them off - i.e. distant buildings really throw shadows now.
const { run, freeze, result } = require('../lib.cjs');
run('shadow-cascades', { q: 2, width: 480, height: 270 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, e = g.eng, R = e.renderer, csm = e.csm, upd = window.__upd, V = window.__views;
    const step = async (n) => { for (let i = 0; i < n; i++) { upd(1 / 60); if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0)); } };
    // the reference street with people (src/views.js) at 15:00, looking down a long road between towers
    const vi = V.VIEWS.findIndex((v) => v.id === 'crowd-day');
    await V.applyView(g, vi, step); g.clock.t = 15 * 60; await step(120);
    const progs0 = R.info.programs.length;
    const rad = Array.from(csm.radius).map((r) => +r.toFixed(1)), splits = [0, 1, 2, 3].map((i) => csm.split(i));
    // which cascade holds a point d metres ahead of the camera on the ground (the finest whose box holds it)
    const cam = g.camera, el = cam.matrixWorld.elements, fl = Math.hypot(el[8], el[10]) || 1, P = new (cam.position.constructor)();
    const holds = (d) => { P.set(cam.position.x - el[8] / fl * d, cam.position.y - 10, cam.position.z - el[10] / fl * d); for (let i = 0; i < csm.n; i++) { const v = P.clone().applyMatrix4(csm.lights[i].shadow.matrix); if (v.x > 0.02 && v.x < 0.98 && v.y > 0.02 && v.y < 0.98 && v.z >= 0 && v.z <= 1) return i; } return -1; };
    const at = { 15: holds(15), 60: holds(60), 200: holds(200), 600: holds(600) };
    // redraw rates over 40 drawn frames
    const u0 = Array.from(csm.updates); await step(40); const rate = Array.from(csm.updates).map((u, i) => u - u0[i]);
    // the far half of the picture with the shadows on and off (shadow intensity 0 is a uniform: no recompile)
    const grab = () => { g.renderFrame(0, true);   // read right after the draw, in the same task (the drawing buffer is not kept)
      const gl = R.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); return { px, w, h }; };
    for (const l of csm.lights) l.shadow.needsUpdate = true; csm.due = true;
    const on = grab(); for (const l of csm.lights) l.shadow.intensity = 0; const off = grab(); for (const l of csm.lights) l.shadow.intensity = 1;
    // share of pixels the shadows darken, in bands from the bottom of the picture (near ground) to the horizon (far)
    const band = (f0, f1) => { let d = 0, n = 0; for (let y = Math.floor(on.h * f0); y < Math.floor(on.h * f1); y++) for (let x = 0; x < on.w; x++) { const i = (y * on.w + x) * 4, a = on.px[i] + on.px[i + 1] + on.px[i + 2], b = off.px[i] + off.px[i + 1] + off.px[i + 2]; n++; if (a < b - 12) d++; } return +(d / Math.max(1, n)).toFixed(3); };
    const darker = { bottom: band(0, 0.25), mid: band(0.25, 0.45), far: band(0.45, 0.62), top: band(0.62, 1) };   // readPixels rows start at the bottom
    // the settings: two cascades at a short reach, then back to the default; no new shader program
    e.ov.shadowDist = 60; e.applyOv(); await step(10); const n2 = csm.n; e.ov.shadowDist = 85; e.applyOv(); await step(10);
    const progs1 = R.info.programs.length;
    // CPU time of the shadow pass for one frame with every cascade due (the GPU time needs a real GPU; see docs)
    for (const l of csm.lights) l.shadow.needsUpdate = true; const sm = R.shadowMap, real = sm.render.bind(sm); let ms = 0; sm.render = (...a) => { const t = performance.now(); real(...a); ms += performance.now() - t; }; sm.needsUpdate = true; g.renderFrame(0, true); sm.render = real;
    return { view: vi, cascades: csm.n, splits, radius: rad, cascadeAt: at, redraws40: rate, darker, cascadesAt60m: n2, newPrograms: progs1 - progs0, shadowPassCpuMs: +ms.toFixed(1) };
  });
  const pass = o.cascades === 4 && o.radius.every((r, i) => i === 0 || r > o.radius[i - 1]) && o.cascadeAt[15] === 0 && o.cascadeAt[600] === 3
    && o.redraws40[0] >= 38 && o.redraws40[2] <= 22 && o.redraws40[3] <= 12 && o.cascadesAt60m === 2 && o.newPrograms === 0 && o.darker.far > 0.02;
  result('shadow-cascades', pass, o);
});
