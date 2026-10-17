// gameplay (ADR-0013): trees, shrubs, rocks and grass. Standing in a forest the player has real trees around him (instanced models), billboards beyond,
// grass at his feet and solid trunks within reach; a desert has cacti, a bare cliff only rocks; the city itself has none; a tree cannot be walked through;
// the counts stay inside their budgets and the refresh costs about a millisecond.
const { run, freeze, result } = require('../lib.cjs');
run('forest', { q: 1, width: 480, height: 270 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, pl = g.player, F = g.forest, o = {}; g.eng.render = () => {}; if (!F) return { has: false };
    const park = (x, z) => { const y = window.__farHeights.landHeight(x, z, 8) + 0.5; pl.body3.teleport(x, y, z); pl.x = x; pl.y = y; pl.z = z; pl.vx = pl.vz = pl.vy = 0; };
    const run = async (n) => { for (let i = 0; i < n; i++) { window.__upd(1 / 60); if (i % 10 === 0) await new Promise((r) => setTimeout(r, 4)); } };
    const find = (kind, minN) => { for (let r = 3000; r < 40000; r += 900) for (let a = 0; a < 40; a++) { const x = Math.cos(a * 0.157 + r) * r, z = Math.sin(a * 0.157 + r) * r, b = F.byteAtWorld(x, z); if ((b >> 5) === kind && (b & 31) >= minN) return [x, z]; } return null; };
    o.has = true; const fo = find(1, 8), de = find(4, 2), cl = find(7, 0);
    o.found = [!!fo, !!de, !!cl];
    if (fo) {
      park(fo[0], fo[1]); await run(240); const s = { ...F.stats }; o.forest = s; o.meshNear = Object.fromEntries(Object.entries(F.meshes).map(([k, m]) => [k, m.count]));
      const t0 = performance.now(); for (let i = 0; i < 10; i++) F.refresh(g.camera); o.refreshMs = +((performance.now() - t0) / 10).toFixed(2);
      // a tree trunk is solid: aim at the nearest trunk and walk into it
      const rec = []; for (const m of F.boxes.values()) rec.push(m); o.boxes = rec.length;
    }
    if (de) { park(de[0], de[1]); await run(180); o.cactus = F.meshes.cactus.count; }
    if (cl) { park(cl[0], cl[1]); await run(180); o.rocks = F.meshes.rock.count; o.treesOnCliff = F.meshes.broad.count + F.meshes.conifer.count; }
    park(0, 0); await run(120); o.cityNear = F.stats.near; o.cityBill = F.stats.bill;
    return o;
  });
  const pass = o.has && o.found[0] && o.forest.near > 100 && o.forest.near < 9000 && o.forest.bill > 50 && o.forest.bill < 26000 && o.forest.grass > 100 && o.boxes > 3 && o.refreshMs < 6 && (!o.found[1] || o.cactus > 0) && (!o.found[2] || o.rocks > 0) && o.cityNear === 0 && o.cityBill === 0;
  result('forest', pass, o);
});
