// Every highway, ramp, ring and connector can be stood on: a person and a car placed on 6 samples of each road stay on its surface (no fall through, no
// sinking under the asphalt), and a sample of the compiled lines too.
// One evaluate per road: a single evaluate teleporting over the whole map grew the renderer until it was killed (the browser closed mid-run).
// HD_PART=k/P runs every P-th road starting at k, so tests/run.cjs splits the run into parts of a few minutes each (EV-91).
const { run, freeze, result } = require('../lib.cjs');
const [PK, PN] = (process.env.HD_PART || '0/1').split('/').map(Number);
const NAME = PN > 1 ? `highway-drive-${PK + 1}of${PN}` : 'highway-drive';
run(NAME, { q: 1, width: 640, height: 360 }, async ({ page }) => {
  await freeze(page);
  const n = await page.evaluate(([pk, pn]) => {
    const g = window.__game; g.hurtPlayer = () => {}; g.eng.render = () => {};
    const roads = g.highways.N.roads.filter((r) => r.kind !== 'arterial');
    const arts = g.highways.N.roads.filter((r) => r.kind === 'arterial' && (r.hw === 'motorway' || r.hw === 'trunk')).filter((_, i) => i % 6 === 0).slice(0, 12);
    window.__hd = { list: roads.concat(arts).filter((_, i) => i % pn === pk), o: { roads: 0, probes: 0, personFell: 0, carSunk: 0, worst: [] }, ticks: 0 };
    return window.__hd.list.length;
  }, [PK, PN]);
  for (let k = 0; k < n; k++) {
    await page.evaluate(async (ri) => {
      const g = window.__game, pl = g.player, H = window.__hd, o = H.o, r = H.list[ri], V = g.vehicles[0].constructor;
      const step = async (n) => { for (let i = 0; i < n; i++) { window.__upd(1 / 60); if (++H.ticks % 10 === 0) await new Promise((f) => setTimeout(f, 10)); } };   // yields every 10 steps: the page's memory is given back only between tasks
      o.roads++;
      for (let k = 1; k <= 6; k++) {
        const i = Math.min(r.x.length - 2, Math.floor(r.x.length * k / 7));
        const x = r.x[i], z = r.z[i], y = r.y[i]; o.probes++;
        pl.body3.teleport(x, y + 1.5, z); pl.x = x; pl.y = y + 1.5; pl.z = z; pl.vy = 0; await step(90);
        const py = pl.body3.body.translation().y; if (py < y - 1.2) { o.personFell++; if (o.worst.length < 8) o.worst.push([r.id, i, +(py - y).toFixed(1)]); }
        const v = new V(g, 'sport', 0x333333, 'parked', {}); v.x = x; v.z = z; v.h = 0; v.awake = true; g.addVehicle(v); v.pv.body.setTranslation({ x, y: y + 1, z }, true); v.pv.body.wakeUp(); await step(90);
        const vy = v.pv.body.translation().y; if (vy < y - 1.2) { o.carSunk++; if (o.worst.length < 8) o.worst.push([r.id, i, 'car', +(vy - y).toFixed(1)]); }
        g.removeVehicle?.(v);
      }
    }, k);
    if (process.env.HD_PROGRESS && k % (+process.env.HD_PROGRESS || 25) === 0) console.error(`highway-drive ${k}/${n}`, await page.evaluate(() => [Math.round(performance.memory.usedJSHeapSize / 1048576), window.__gcCount]));
  }
  const o = await page.evaluate(() => Object.assign(window.__hd.o, { gcs: window.__gcCount }));
  result(NAME, o.roads > 20 / PN && o.personFell === 0 && o.carSunk === 0, o);
});
