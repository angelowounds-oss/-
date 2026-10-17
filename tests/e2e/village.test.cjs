// gameplay (ADR-0013): the villages. One is built when the player comes near (houses with doors, a shop with a shopkeeper and verbs, walls that stop him),
// its people walk about by day and sleep in their beds at night (a sleeper is made only when he is in the house), the shop is closed at night with a
// barred door, a blast brings a house down (people inside die, colliders go, the ruin is remembered and rebuilt after two days), and it is dropped when
// he leaves.
const { run, freeze, result } = require('../lib.cjs');
run('village', { q: 1, width: 480, height: 270 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, pl = g.player, V = g.villages, o = {}; g.eng.render = () => {}; g.hurtPlayer = () => {};
    if (!V) return { has: false };
    const L = V.list.find((q) => q.v.houses.some((h) => h.kind === 'shop') && q.v.residents.length > 8) || V.list[0], v = L.v;
    const park = (x, z) => { const y = L.pad.y + 0.1; pl.body3.teleport(x, y, z); pl.x = x; pl.y = y; pl.z = z; pl.vx = pl.vz = pl.vy = 0; pl.dead = false; };
    const run = async (n) => { for (let i = 0; i < n; i++) { window.__upd(1 / 60); if (i % 10 === 0) await new Promise((r) => setTimeout(r, 4)); } };
    const setHour = (h) => { g.clock.t = Math.floor(g.clock.t / 1440) * 1440 + h * 60; };
    o.has = true; o.name = v.name; o.houses = v.houses.length; o.residents = v.residents.length;
    // by day, in the plaza
    setHour(12); park(v.x + 4, v.z + 12); await run(300);
    o.built = L.built; o.boxes = L.cb ? L.cb.length : 0; o.people = [...L.res.values()].filter((s) => s.h).length; o.hasShop = !!(L.ints && L.ints.length);
    const shop = L.houses.find((H) => H.h.kind === 'shop'); o.shopOpen = V.open(L, shop);
    // walls stop him: from the street walk into the back of the first house
    const H1 = L.houses.find((H) => H.h.kind === 'house'), h1 = H1.h, sg = h1.side, wx = h1.x - 3.2; // away from the door
    park(v.x + wx, v.z + sg * 6.5); const z0 = pl.z; for (let i = 0; i < 90; i++) { pl.vx = 0; pl.vz = sg * 3; window.__upd(1 / 60); } o.wallHolds = Math.abs(pl.z - (v.z + sg * 6.5)) < 2.2;
    // through the door he gets in
    park(v.x + h1.x, v.z + sg * 6.5); for (let i = 0; i < 120; i++) { pl.vx = 0; pl.vz = sg * 3; window.__upd(1 / 60); } o.doorOpen = Math.abs(pl.z - (v.z + sg * 6.5)) > 3.2;
    // the shopkeeper: a counter and verbs
    const cn = L.ints[0]; park(cn.x, cn.z); o.verbs = g.interact.query(pl) && g.interact.query(pl).verbs.map((q) => q.key).join('');
    // night: the shop is closed (barred door), sleepers appear when he is in a house
    setHour(2); park(v.x + 4, v.z + 12); await run(200); o.closed = !V.open(L, shop) && L.houses.some((H) => H.door); const awake = [...L.res.values()].filter((s) => s.h).length;
    park(v.x + H1.h.x, v.z + sg * 12); await run(200); const inBed = [...L.res.values()].filter((s) => s.h && s.h.sleeping).length; o.nightAwake = awake; o.sleepers = inBed;
    // a blast on a house brings it down
    setHour(12); park(v.x + 4, v.z + 12); await run(120); const before = H1.cb.length, hp0 = H1.hp;
    g.explosion(v.x + h1.x, L.pad.y + 1, v.z + h1.z, 14, 400, null); await run(30); g.explosion(v.x + h1.x, L.pad.y + 1, v.z + h1.z, 14, 400, null);
    o.fell = !H1.alive && H1.cb.length === 0 && before > 3 && hp0 > 0; o.remembered = g.state.places.ruins[H1.key] != null;
    // away: dropped
    park(0, 0); await run(60); o.dropped = !L.built;
    // back after two days: the ruin is gone
    g.clock.t += 3000; park(v.x + 4, v.z + 12); await run(240); const H2 = L.houses[H1.idx]; o.rebuilt = H2 && H2.alive;
    // an apartment block (assets/blocks) and the water tower / canopy fall too: a few seconds of collapse, then the ruin; the colliders go at once
    const LB = V.list.find((q) => q.v.houses.some((h) => h.kind === 'block') && (q.v.tower || q.v.gas)) || V.list.find((q) => q.v.houses.some((h) => h.kind === 'block'));
    park(LB.v.x + 4, LB.v.z + 12); await run(240); const B = LB.houses.find((H) => H.h.kind === 'block'), bh = B.h, X = LB.houses.find((H) => H.h.kind === 'tower' || H.h.kind === 'canopy');
    o.blockBoxes = B.cb.length; o.blockTall = B.cols[0][5] > 15; o.extraBoxes = X ? X.cb.length : -1; o.blockTris = B.group.children[0].children.length;
    g.explosion(LB.v.x + bh.x, LB.pad.y + 1, LB.v.z + bh.z, 30, 900, null); await run(20);
    if (X) { const xh = X.h; g.explosion(LB.v.x + xh.x, LB.pad.y + 1, LB.v.z + xh.z, 25, 900, null); await run(20); }
    o.blockFalling = !B.alive && B.cb.length === 0 && B.anim !== undefined && B.group.scale.y < 1; await run(400);
    o.blockRuin = B.anim === undefined && B.group.scale.y < 0.2 && LB.cb.length < 400; o.extraFell = X ? !X.alive && X.cb.length === 0 : true;
    return o;
  });
  const pass = o.has && o.built && o.boxes > 20 && o.people >= 2 && o.hasShop && o.shopOpen && o.wallHolds && o.doorOpen && /F/.test(o.verbs || '') && o.closed && o.sleepers >= 1 && o.fell && o.remembered && o.dropped && o.rebuilt && o.blockBoxes === 1 && o.blockTall && o.blockTris >= 2 && o.blockFalling && o.blockRuin && o.extraFell && o.extraBoxes !== 0;
  result('village', pass, o);
});
