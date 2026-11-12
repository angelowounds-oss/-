// Every highway, ramp, ring and connector can be stood on: a person and a car placed on 6 samples of each road stay on its surface (no fall through, no
// sinking under the asphalt), and a sample of the compiled lines too.
// One evaluate per road: a single evaluate teleporting over the whole map grew the renderer until it was killed (the browser closed mid-run).
const { run, freeze, result } = require('../lib.cjs');
run('highway-drive', { q: 1, width: 640, height: 360 }, async ({ page }) => {
  await freeze(page);
  const n = await page.evaluate(() => {
    const g = window.__game; g.hurtPlayer = () => {}; g.eng.render = () => {};
    const roads = g.highways.N.roads.filter((r) => r.kind !== 'arterial');
    const arts = g.highways.N.roads.filter((r) => r.kind === 'arterial' && (r.hw === 'motorway' || r.hw === 'trunk')).filter((_, i) => i % 6 === 0).slice(0, 12);
    window.__hd = { list: roads.concat(arts), o: { roads: 0, probes: 0, personFell: 0, carSunk: 0, worst: [] }, ticks: 0 };
    return window.__hd.list.length;
  });
  for (let k = 0; k < n; k++) {
    await page.evaluate(async (ri) => {
      const g = window.__game, pl = g.player, H = window.__hd, o = H.o, r = H.list[ri], V = g.vehicles[0].constructor;
      const step = async (n) => { for (let i = 0; i < n; i++) { window.__upd(1 / 60); if (++H.ticks % 10 === 0) await new Promise((f) => setTimeout(f, 10)); } };   // yields every 10 steps: the page's memory is given back only between tasks
      o.roads++;
      for (let k = 1; k <= 6; k++) {
        const i = Math.min(r.pts.length - 2, Math.floor(r.pts.length * k / 7));
        const x = r.pts[i][0], z = r.pts[i][1], y = r.y[i]; o.probes++;
        pl.body3.teleport(x, y + 1.5, z); pl.x = x; pl.y = y + 1.5; pl.z = z; pl.vy = 0; await step(90);
        const py = pl.body3.body.translation().y; if (py < y - 1.2) { o.personFell++; if (o.worst.length < 8) o.worst.push([r.id, i, +(py - y).toFixed(1)]); }
        const v = new V(g, 'sport', 0x333333, 'parked', {}); v.x = x; v.z = z; v.h = 0; v.awake = true; g.addVehicle(v); v.pv.body.setTranslation({ x, y: y + 1, z }, true); v.pv.body.wakeUp(); await step(90);
        const vy = v.pv.body.translation().y; if (vy < y - 1.2) { o.carSunk++; if (o.worst.length < 8) o.worst.push([r.id, i, 'car', +(vy - y).toFixed(1)]); }
        g.removeVehicle?.(v);
      }
    }, k);
    if (process.env.HD_PROGRESS && k % 25 === 0) console.error(`highway-drive ${k}/${n}`);
  }
  const o = await page.evaluate(() => window.__hd.o);
  result('highway-drive', o.roads > 20 && o.personFell === 0 && o.carSunk === 0, o);
});
