// The graphics and screen settings window (settings.js): every option reaches the thing it stands for, a preset sets its values and a reset gives them back,
// the choice is saved and read back, and the window works with the pointer. The view distance reaches the fog (and through it what is streamed).
const fs = require('node:fs');
const { run, freeze, result } = require('../lib.cjs');
run('settings', { q: 1, width: 960, height: 540 }, async ({ page }) => {
  await freeze(page);
  await page.exposeFunction('__zshot', (name, url) => fs.writeFileSync(`tests/results/${name}.png`, Buffer.from(url.split(',')[1], 'base64')));
  const o = await page.evaluate(async () => {
    const g = window.__game, S = g.settings, E = g.eng, o = { opt: {}, ui: {}, preset: {}, bad: [] }, bad = (m) => o.bad.push(m);
    const upd = async (n) => { const r = E.render; E.render = () => {}; for (let i = 0; i < n; i++) { window.__upd(1 / 60); if (i % 10 === 9) await new Promise((f) => setTimeout(f, 8)); } E.render = r; };
    try { localStorage.removeItem('neon_gfx'); } catch { /* ignore */ }
    S.reset(); await upd(30);
    const tier0 = E.qIndex, fog0 = g.scene.fog.density, px0 = E.renderer.getPixelRatio(), passes0 = E.composer.passes.length;
    o.base = { tier: tier0, fog: +fog0.toFixed(5), px: px0, passes: passes0, far: E.camera.far, shadow: E.moon.shadow.mapSize.x, bloom: E.bloom.strength, ao: E.q.ao, smaa: E.q.smaa };
    if (S.preset !== 'auto' || Object.keys(S.u).length) bad('the start is not the automatic preset with nothing of its own');
    // --- the view distance and the fog: the fog density is divided by the view and multiplied by the fog share
    const fogAt = async () => { await upd(3); return g.scene.fog.density; };
    S.set('view', 8); const f8 = await fogAt(); S.set('view', 0.6); const f06 = await fogAt(); S.set('view', 1); S.set('fog', 0); const f0 = await fogAt(); S.set('fog', 1.5); const f15 = await fogAt(); S.set('fog', 1);
    o.opt.fog = { view8: +(f8 / fog0).toFixed(3), view06: +(f06 / fog0).toFixed(3), fog0: f0, fog15: +(f15 / fog0).toFixed(3) };
    if (!(Math.abs(f8 / fog0 - 1 / 8) < 0.02)) bad(`view 8 should divide the fog by 8: ${f8 / fog0}`);
    if (!(f06 / fog0 > 1.5 && f06 / fog0 < 1.8)) bad(`view 0.6 should raise the fog by 1/0.6: ${f06 / fog0}`);
    if (f0 !== 0) bad(`fog 0 should clear the air: ${f0}`);
    if (!(Math.abs(f15 / fog0 - 1.5) < 0.03)) bad(`fog 150 %: ${f15 / fog0}`);
    o.opt.vis = { v1: S.visText(), v8: (S.set('view', 8), S.visText()) }; S.set('view', 1);
    // --- engine values
    S.set('res', 0.5); await upd(2); o.opt.res = +E.renderer.getPixelRatio().toFixed(3); if (!(Math.abs(E.renderer.getPixelRatio() - (devicePixelRatio || 1) * 0.5 * E.scale) < 0.02)) bad(`res 50 %: ${E.renderer.getPixelRatio()}`);
    S.set('res', null); await upd(2); if (Math.abs(E.renderer.getPixelRatio() - px0) > 0.02) bad(`res back to the tier's: ${E.renderer.getPixelRatio()} vs ${px0}`);
    S.set('shadow', 512); o.opt.shadow512 = E.moon.shadow.mapSize.x; if (E.moon.shadow.mapSize.x !== 512) bad('shadow 512');
    S.set('shadow', 0); o.opt.shadowOff = E.moon.castShadow; if (E.moon.castShadow !== false) bad('shadows off');
    S.set('shadow', null); if (!E.moon.castShadow || E.moon.shadow.mapSize.x !== E.q.shadow) bad('shadow back to the tier');
    S.set('shadowDist', 150); o.opt.shadowDist = E.moon.shadow.camera.right; if (E.moon.shadow.camera.right !== 150) bad('shadow reach'); S.set('shadowDist', 85);
    S.set('shadowEvery', 3); o.opt.shadowEvery = E.ov.shadowEvery; S.set('shadowEvery', null);
    const withAO = (S.set('ao', true), E.composer.passes.length), noAO = (S.set('ao', false), E.composer.passes.length); o.opt.passes = { withAO, noAO }; if (!(withAO > noAO)) bad(`AO pass: ${withAO} / ${noAO}`); S.set('ao', null);
    const noAA = (S.set('aa', false), E.composer.passes.length), withAA = (S.set('aa', true), E.composer.passes.length); o.opt.aa = { noAA, withAA }; if (!(withAA > noAA)) bad(`AA pass: ${withAA} / ${noAA}`); S.set('aa', null);
    if (E.composer.passes.length !== passes0) bad(`the passes after putting them back: ${E.composer.passes.length} vs ${passes0}`);
    S.set('bloom', 0); o.opt.bloomOff = E.bloom.enabled; if (E.bloom.enabled) bad('bloom 0 must skip the pass'); S.set('bloom', 2); await upd(3); o.opt.bloom2 = +E.bloom.strength.toFixed(2); { const b1 = E.bloom.strength; S.set('bloom', 1); await upd(3); if (!(Math.abs(b1 / E.bloom.strength - 2) < 0.01)) bad(`bloom 200 %: ${b1} against ${E.bloom.strength}`); }
    S.set('aber', 2); S.set('vig', 0); S.set('grain', 3); const u = E.grade.uniforms; o.opt.film = [+u.uAber.value.toFixed(5), u.uVig.value, +u.uGrain.value.toFixed(4)];
    if (!(Math.abs(u.uAber.value - 0.0004) < 1e-6 && u.uVig.value === 0 && Math.abs(u.uGrain.value - 0.018) < 1e-6)) bad(`film effects: ${o.opt.film}`);
    S.set('aber', 1); S.set('vig', 1); S.set('grain', 1);
    S.set('post', false); o.opt.postOff = E.ov.post; S.set('post', null);
    S.set('bright', 0.6); await upd(2); o.opt.exposure = +E.renderer.toneMappingExposure.toFixed(3); const e6 = E.renderer.toneMappingExposure; S.set('bright', 1); await upd(2); if (!(Math.abs(e6 / E.renderer.toneMappingExposure - 0.6) < 0.01)) bad(`brightness: ${e6} vs ${E.renderer.toneMappingExposure}`);
    // --- the game's own
    S.set('particles', 0); const n0 = g.fireP.n; g.fireP.emit(0, 5, 0, 0, 1, 0, 1, 1, 1, 1, 1); o.opt.emitOff = g.fireP.n === n0; if (g.fireP.n !== n0) bad('particles 0 must make none'); S.set('particles', 1); g.fireP.emit(0, 5, 0, 0, 1, 0, 1, 1, 1, 1, 1); if (g.fireP.n !== n0 + 1) bad('particles 100 %');
    S.set('rain', 0.5); const rg = g.rain.geometry, rn = rg.attributes.aEnd.count; o.opt.rainRange = [rg.drawRange.count, rn]; if (Math.abs(rg.drawRange.count - rn / 2) > 2) bad('rain half'); S.set('rain', 1);
    if (g.forest) { const f1 = g.forest.f; S.set('trees', 0.5); o.opt.trees = [f1, g.forest.f]; if (!(Math.abs(g.forest.f - f1 * 0.5) < 1e-6)) bad('trees half'); S.set('trees', 1); }
    let simple = null; const ss = g.world.setSimple; g.world.setSimple = (b) => { simple = b; return ss?.call(g.world, b); }; S.set('detail', 'simple'); const d1 = simple; S.set('detail', 'full'); const d2 = simple; S.set('detail', null); g.world.setSimple = ss; o.opt.detail = [d1, d2]; if (d1 !== true || d2 !== false) bad('detail');
    S.set('traffic', 0.5); S.set('npc', 0.25); S.set('parked', 0); o.opt.pop = [g.opt.traffic, g.opt.npc, g.opt.parked]; S.set('traffic', 1); S.set('npc', 1); S.set('parked', 1);
    const fov0 = g.camera.fov; await upd(60); const fovA = g.camera.fov; S.set('fov', 20); await upd(60); const fovB = g.camera.fov; S.set('fov', 0); o.opt.fov = [+fovA.toFixed(1), +fovB.toFixed(1)]; if (!(Math.abs(fovB - fovA - 20) < 1)) bad(`fov +20: ${fovA} -> ${fovB}`); void fov0;
    S.set('shake', 0); g.shakeAmt = 0; g.shake(1); o.opt.shake0 = g.shakeAmt; if (g.shakeAmt !== 0) bad('shake 0'); S.set('shake', 0.5); g.shakeAmt = 0; g.shake(1); if (Math.abs(g.shakeAmt - 0.5) > 1e-6) bad('shake 50 %'); S.set('shake', 1);
    S.set('dynRes', false); o.opt.dynRes = g.opt.dynRes; if (g.opt.dynRes !== false) bad('dynRes'); S.set('dynRes', true);
    // the frame cap: the loop (main.js) skips the frames that come early
    { const real = g.update.bind(g); let n = 0; g.update = (dt) => { n++; return real(dt); }; const r = E.render; E.render = () => {};
      const count = async (cap) => { S.set('fpsCap', cap); n = 0; await new Promise((f) => setTimeout(f, 2000)); return n; };
      const free = await count(0), c30 = await count(30); S.set('fpsCap', 0); g.update = real; E.render = r; o.opt.fpsCap = { free, c30 }; if (!(c30 <= 66 && c30 < free * 0.8)) bad(`the 30 fps cap: ${c30} frames in 2 s against ${free}`); }
    // --- presets
    S.setPreset('extreme'); await upd(3); o.preset.extreme = { tier: E.qIndex, view: S.val('view'), shadow: E.moon.shadow.mapSize.x, vis: S.visText(), fogRatio: +(g.scene.fog.density / fog0).toFixed(3) };
    if (E.qIndex !== 3 || E.moon.shadow.mapSize.x !== 4096) bad(`the extreme preset: ${JSON.stringify(o.preset.extreme)}`);
    S.set('view', 2); o.preset.custom = { u: Object.keys(S.u), saved: JSON.parse(localStorage.getItem('neon_gfx') || '{}') };
    const S2 = new (S.constructor)(g); o.preset.reread = { preset: S2.preset, view: S2.val('view') }; if (S2.preset !== 'extreme' || S2.val('view') !== 2) bad(`the saved choice read back: ${JSON.stringify(o.preset.reread)}`);
    S.setPreset('lowest'); await upd(3); o.preset.lowest = { tier: E.qIndex, far: E.camera.far, px: +E.renderer.getPixelRatio().toFixed(2) };
    if (E.qIndex !== 0) bad('the lowest preset');
    S.reset(); await upd(3); o.preset.back = { tier: E.qIndex, fog: +(g.scene.fog.density / fog0).toFixed(3), px: E.renderer.getPixelRatio(), passes: E.composer.passes.length };
    if (E.qIndex !== tier0 || Math.abs(g.scene.fog.density / fog0 - 1) > 0.02 || E.composer.passes.length !== passes0) bad(`reset gives the start back: ${JSON.stringify(o.preset.back)}`);
    // --- the window: open it from the pause menu, change things with the controls, reset
    const click = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    g.setPaused(true); const btn = document.getElementById('gfxBtn'); o.ui.button = !!btn; click(btn);
    const sc = document.getElementById('sc'); o.ui.open = sc.classList.contains('on'); o.ui.pcHidden = document.getElementById('pc').style.display === 'none'; o.ui.tabs = [...sc.querySelectorAll('#scTabs button')].map((b) => b.textContent);
    o.ui.rows = {}; for (let ti = 0; ti < o.ui.tabs.length; ti++) { click(sc.querySelectorAll('#scTabs button')[ti]); o.ui.rows[o.ui.tabs[ti]] = sc.querySelectorAll('.srow').length; }
    if (o.ui.rows['그래픽'] !== 9 || o.ui.rows['시야·환경'] !== 5) bad(`rows per tab: ${JSON.stringify(o.ui.rows)}`);
    click(sc.querySelector('#scTabs button')); const viewRow = sc.querySelector('.srow[data-id="view"]'), sel = viewRow.querySelector('select'); o.ui.viewOptions = sel.options.length; o.ui.visText = sc.querySelector('#scVis').textContent;
    sel.value = String([...sel.options].findIndex((x) => x.textContent === '극한')); sel.dispatchEvent(new Event('change', { bubbles: true })); await upd(3); o.ui.viewAfter = { val: S.val('view'), fogRatio: +(g.scene.fog.density / fog0).toFixed(3), vis: sc.querySelector('#scVis').textContent, preset: sc.querySelector('#scPreset').value };
    if (S.val('view') !== 8 || o.ui.viewAfter.preset !== 'custom') bad(`the view row: ${JSON.stringify(o.ui.viewAfter)}`);
    click(sc.querySelector('#scReset')); await upd(3); o.ui.afterReset = { view: S.val('view'), preset: sc.querySelector('#scPreset').value };
    if (S.val('view') !== 1) bad('the reset button');
    // a range row moves its value text and the engine
    click([...sc.querySelectorAll('#scTabs button')].find((b) => b.textContent === '그래픽')); const br = sc.querySelector('.srow[data-id="bloom"] input'); br.value = '0'; br.dispatchEvent(new Event('input', { bubbles: true })); o.ui.bloomText = sc.querySelector('.srow[data-id="bloom"] .sval').textContent; if (E.bloom.enabled) bad('the bloom slider'); S.reset();
    click(sc.querySelector('#scBack')); o.ui.closed = !sc.classList.contains('on') && document.getElementById('pc').style.display !== 'none'; if (!o.ui.closed) bad('the back button'); g.setPaused(false);
    for (const k of ['button', 'open', 'pcHidden']) if (!o.ui[k]) bad('ui ' + k);
    if (o.ui.tabs.length !== 6) bad('the tabs');
    return o;
  });
  // the pictures: the same street at the ground with the view distance at its normal and at its farthest
  const shots = await page.evaluate(async () => {
    const g = window.__game, S = g.settings, E = g.eng, pl = g.player, res = {};
    const upd = async (n) => { const r = E.render; E.render = () => {}; for (let i = 0; i < n; i++) { window.__upd(1 / 60); if (i % 10 === 9) await new Promise((f) => setTimeout(f, 8)); } E.render = r; };
    pl.body3.teleport(0, 2, 0); pl.x = 0; pl.y = 2; pl.z = 0; await upd(60); g.cam.yaw = Math.PI / 2; await upd(30);
    for (const [name, view] of [['near', 1], ['far', 8]]) { S.set('view', view); await upd(120); E.render = E.render; g.renderFrame(0, true); await window.__zshot('settings-' + name, E.renderer.domElement.toDataURL('image/png')); res[name] = { fog: +g.scene.fog.density.toFixed(5) }; }
    S.reset(); return res;
  });
  o.shots = shots; const bad = o.bad;
  result('settings', bad.length === 0, o);
});
