// Building audit, pass B/C (Q0-7): opens each building that has an inside, builds every floor and checks it. Not a test: it lists what it finds.
//   node tests/tools/building-audit.cjs                  # the capital's 560 buildings (NEON)
//   MODE=cities [CITY=harbor] [STEP=450] node ...        # buildings of the other cities, found by standing near them (they exist only close to the player)
//   LIMIT=40 PICK=NC-B04_06-2,NC-SKY OUT=tests/results/building-audit-inside.json FLOORS=all|4
// Per floor: the plan is contiguous, no collider or mesh is odd (NaN, outside the plate), the stairs and the lift have their holes in the slab,
// and a walk (0.3 m grid, a body 0.28 m wide, doors open) from the street door or the stair landing reaches every room. Per building: nothing is
// left behind after it is closed again (colliders, floors, the solid box). Needs the built neon_city_v9.html.
const { openGame, freeze } = require('../lib.cjs');
const fs = require('fs');

const AUDIT = () => {
  const g = window.__game, B = g.buildings, col = g.world.colliders, THREE = window.__THREE;
  const CS = 0.1, BODY = 0.36, BLOCK = new Set(['int', 'part', 'glass', 'furniture', 'building', 'decor']);
  const finite = (...a) => a.every(Number.isFinite);

  function floorCheck(bd, k, add) {
    const L = bd.levels[k], fl = bd.floors.get(k), R = L.rect, top = L.y, lot = bd.lot;
    const S = (code, info = {}) => add(code, { k, type: L.type, ...info });
    if (!fl) return S('floor-missing');
    const boxes = fl.boxes;
    // colliders: sane, and inside the plate (a wall is 0.5 thick; allow a metre for balconies and parapets)
    let bad = 0, outside = 0, ex = null;
    for (const b of boxes) {
      if (!finite(b.x0, b.z0, b.x1, b.z1, b.y0, b.h) || b.x1 < b.x0 || b.z1 < b.z0) { bad++; continue; }
      if (b.tag !== 'decor' && (b.x0 < lot.x0 - 1.1 || b.x1 > lot.x1 + 1.1 || b.z0 < lot.z0 - 1.1 || b.z1 > lot.z1 + 1.1)) { outside++; ex = ex || [b.tag, +b.x0.toFixed(1), +b.z0.toFixed(1), +b.x1.toFixed(1), +b.z1.toFixed(1), +(b.y0 - top).toFixed(1), +(b.h - top).toFixed(1)]; }
    }
    if (bad) S('collider-invalid', { n: bad });
    if (outside) S('collider-outside-plate', { n: outside, ex, rect: [R.x0, R.z0, R.x1, R.z1].map((v) => +v.toFixed(1)) });
    if (L.type !== 'roof' && boxes.length < 20) S('floor-empty', { boxes: boxes.length });
    // meshes: NaN / runaway coordinates, and geometry far from the plate
    let nan = 0, far = 0, mex = null;
    fl.group.traverse((o) => {
      const p = o.geometry && o.geometry.attributes && o.geometry.attributes.position; if (!p) return;
      const a = p.array, n = Math.min(a.length, p.count * 3); let wrong = false;
      for (let i = 0; i < n; i++) { const v = a[i]; if (v !== v || v > 1e5 || v < -1e5) { wrong = true; break; } }
      if (wrong) { nan++; return; }
      if (!o.isInstancedMesh && n > 0) { o.updateWorldMatrix(true, false); const bb = new THREE.Box3().setFromObject(o); if (bb.min.x < R.x0 - 6 || bb.max.x > R.x1 + 6 || bb.min.z < R.z0 - 6 || bb.max.z > R.z1 + 6 || bb.min.y < L.y - 3 || bb.max.y > L.y + L.h + 12) { far++; mex = mex || { name: o.name || o.material?.name || o.type, bb: [bb.min.x, bb.min.y - L.y, bb.min.z, bb.max.x, bb.max.y - L.y, bb.max.z].map((v) => +v.toFixed(1)), rect: [R.x0, R.z0, R.x1, R.z1].map((v) => +v.toFixed(1)), h: +L.h.toFixed(1) }; } }
    });
    if (nan) S('mesh-nan', { n: nan });
    if (far) S('mesh-outside', { n: far, ex: mex });
    // holes: from the first tower floor up, the slab has no cover over the stairs (they come up through it); the lift shaft likewise
    const slabAt = (x, z) => boxes.some((b) => b.tag === 'slab' && x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && b.h > top - 0.6 && b.h < top + 0.4);
    const sb = bd.stairB, sh = bd.shaft;
    if (k >= 1 && L.type !== 'roof-no-stairs') {
      if (sb && slabAt((sb.x0 + sb.x1) / 2, (sb.z0 + sb.z1) / 2)) S('stair-hole-missing');
      if (sh && bd.elev && slabAt((sh.x0 + sh.x1) / 2, (sh.z0 + sh.z1) / 2)) S('shaft-hole-missing');
    }
    if (k < bd.levels.length - 1 && !boxes.some((b) => b.tag === 'stair') && !(bd.levels[k + 1].tier === 'crown')) S('stair-missing');
    // walk: a grid over the plate (the ground floor also the street around it), free where a floor is and nothing stands 0.35..1.7 m above it
    const pad = k === 0 ? 4 : 0.4, gx0 = R.x0 - pad, gz0 = R.z0 - pad, W = Math.ceil((R.x1 - R.x0 + 2 * pad) / CS), D = Math.ceil((R.z1 - R.z0 + 2 * pad) / CS);
    if (W * D > 2500000) return S('walk-skipped', { cells: W * D });
    const free = new Uint8Array(W * D), at = (x, z) => ((Math.floor((z - gz0) / CS)) * W + Math.floor((x - gx0) / CS));
    const inside = (x, z) => x > R.x0 && x < R.x1 && z > R.z0 && z < R.z1;
    for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) { const x = gx0 + (i + 0.5) * CS, z = gz0 + (j + 0.5) * CS; free[j * W + i] = k === 0 && !inside(x, z) ? 1 : 0; }
    for (const b of boxes) if (b.tag === 'slab' && b.h > top - 0.6 && b.h < top + 0.4) for (let j = Math.max(0, Math.floor((b.z0 - gz0) / CS)); j <= Math.min(D - 1, Math.floor((b.z1 - gz0) / CS)); j++) for (let i = Math.max(0, Math.floor((b.x0 - gx0) / CS)); i <= Math.min(W - 1, Math.floor((b.x1 - gx0) / CS)); i++) free[j * W + i] = 1;
    if (k === 0) for (let j = 0; j < D; j++) for (let i = 0; i < W; i++) if (inside(gx0 + (i + 0.5) * CS, gz0 + (j + 0.5) * CS)) free[j * W + i] = 1;   // the ground floor may have no slab boxes of its own
    for (const b of boxes) {
      if (!BLOCK.has(b.tag) || !(b.y0 < top + 1.7 && b.h > top + 0.43)) continue;
      for (let j = Math.max(0, Math.floor((b.z0 - BODY - gz0) / CS)); j <= Math.min(D - 1, Math.floor((b.z1 + BODY - gz0) / CS)); j++) for (let i = Math.max(0, Math.floor((b.x0 - BODY - gx0) / CS)); i <= Math.min(W - 1, Math.floor((b.x1 + BODY - gx0) / CS)); i++) free[j * W + i] = 0;
    }
    const nearFree = (x, z, r) => { let best = -1, bd2 = 1e9; for (let dz = -r; dz <= r; dz += CS) for (let dx = -r; dx <= r; dx += CS) { const px = x + dx, pz = z + dz; if (px < gx0 || pz < gz0 || px >= gx0 + W * CS || pz >= gz0 + D * CS) continue; const c = at(px, pz); if (free[c] && dx * dx + dz * dz < bd2) { bd2 = dx * dx + dz * dz; best = c; } } return best; };
    const seeds = [];
    if (k === 0) { const d = bd.lot.door; if (d) { const s = nearFree(d.px + d.nx * 2.5, d.pz + d.nz * 2.5, 0.6); if (s < 0) S('door-blocked-outside'); else seeds.push(s); } }
    else if (sb) for (let z = sb.z0 - 1; z <= sb.z1 + 1; z += CS) for (let x = sb.x0 - 1; x <= sb.x1 + 1; x += CS) { const onHole = x > sb.x0 && x < sb.x1 && z > sb.z0 && z < sb.z1; if (!onHole && x >= gx0 && z >= gz0 && x < gx0 + W * CS && z < gz0 + D * CS) { const c = at(x, z); if (free[c]) seeds.push(c); } }
    if (!seeds.length) return k === 0 ? undefined : S('no-landing');
    const seen = new Uint8Array(W * D), q = new Int32Array(W * D); let qn = 0; for (const c of seeds) if (!seen[c]) { seen[c] = 1; q[qn++] = c; }
    for (let h = 0; h < qn; h++) { const c = q[h], i = c % W; if (i > 0 && free[c - 1] && !seen[c - 1]) { seen[c - 1] = 1; q[qn++] = c - 1; } if (i < W - 1 && free[c + 1] && !seen[c + 1]) { seen[c + 1] = 1; q[qn++] = c + 1; } if (c >= W && free[c - W] && !seen[c - W]) { seen[c - W] = 1; q[qn++] = c - W; } if (c + W < W * D && free[c + W] && !seen[c + W]) { seen[c + W] = 1; q[qn++] = c + W; } }
    let nFree = 0, nSeen = 0; for (let c = 0; c < W * D; c++) if (free[c]) { const i = c % W, j = (c - i) / W; if (inside(gx0 + (i + 0.5) * CS, gz0 + (j + 0.5) * CS)) { nFree++; if (seen[c]) nSeen++; } }
    for (const r of fl.rooms || []) {
      const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, c = nearFree(cx, cz, 1.8);
      if (c < 0) S('room-no-floor', { room: r.kind }); else if (!seen[c]) S('room-unreachable', { room: r.kind, x: +cx.toFixed(1), z: +cz.toFixed(1) });
    }
    if (k === 0 && sb) { const c = nearFree((sb.x0 + sb.x1) / 2, sb.z1 + 1.2, 1.5); if (c < 0 || !seen[c]) S('stair-unreachable-from-door'); }
    if (window.__auditDump && window.__auditDump.k === k && window.__auditDump.uid === bd.lot.uid) {   // debugging aid: the walk grid as text (. free, o reached, space no floor, # blocked, R room centre)
      const rows = []; for (let j = 0; j < D; j++) { let t = ''; for (let i = 0; i < W; i++) { const c = j * W + i; t += seen[c] ? 'o' : free[c] ? '.' : '#'; } rows.push(t); }
      for (const r of fl.rooms || []) { const c = nearFree((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2, 0.01); const x = Math.floor(((r.x0 + r.x1) / 2 - gx0) / CS), z = Math.floor(((r.z0 + r.z1) / 2 - gz0) / CS); rows[z] = rows[z].slice(0, x) + 'R' + rows[z].slice(x + 1); void c; }
      add('dump', { rows: rows.join('\n'), seeds: seeds.length, W, D });
    }
    const share = nSeen / Math.max(1, nFree); if (nFree > 40 && share < 0.5) S('floor-fragmented', { reached: +share.toFixed(2) });
    return { share };
  }

  return function auditOne(bd, floors) {
    const res = { uid: bd.lot.uid, name: bd.name, kind: bd.kind, items: [], floors: 0, ms: 0 }, t0 = performance.now(), nBoxes = col.boxes.length, hadSolid = !!bd.lot.solid;
    const add = (code, info) => res.items.push({ code, ...info });
    try {
      bd.activate(); bd.plan();
      const L = bd.levels; res.levels = L.length;
      for (let k = 1; k < L.length; k++) if (!(L[k].y > L[k - 1].y) || !finite(L[k].y, L[k].h)) add('levels-not-ascending', { k });
      const ks = floors === 'all' ? L.map((_, i) => i) : [...new Set([0, L.findIndex((l) => l.tier === 'tower'), Math.floor(L.length / 2), L.length - 2, L.length - 1])].filter((k) => k >= 0 && k < L.length);
      for (const k of ks) { bd.ensureRange(k, k, true); while (bd.job) bd.finishJob(); bd.buildFloor(k); floorCheck(bd, k, add); res.floors++; }
      if (bd.lot.door && bd.floors.has(0) === false) { bd.ensureRange(0, 0, true); bd.buildFloor(0); }
      if (bd.lot.door) { const f0 = bd.floors.get(0); if (f0 && !f0.entrance) add('no-entrance-doors'); }
    } catch (e) { add('exception', { msg: String(e && e.stack || e).slice(0, 300) }); }
    try { bd.deactivate(); } catch (e) { add('exception-close', { msg: String(e).slice(0, 200) }); }
    if (bd.floors.size) add('floors-left', { n: bd.floors.size });
    if (bd.group) add('group-left');
    if (col.boxes.length !== nBoxes) add('collider-leak', { before: nBoxes, after: col.boxes.length });
    if (hadSolid && !bd.lot.solid) add('solid-not-restored');
    res.ms = Math.round(performance.now() - t0);
    return res;
  };
};

(async () => {
  const mode = process.env.MODE || 'neon', floors = process.env.FLOORS || 'all', limit = +(process.env.LIMIT || 1e9), pick = process.env.PICK ? process.env.PICK.split(',') : null;
  const { browser, page, errors } = await openGame({ q: 0, width: 320, height: 180, init: () => { let s = 1; Math.random = () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; } });
  await freeze(page);
  if (process.env.DUMP) { const [u, k] = process.env.DUMP.split(':'); await page.evaluate(({ u, k }) => { window.__auditDump = { uid: u, k: +k }; }, { u, k }); }
  await page.evaluate(`window.__auditOne = (${AUDIT.toString()})(); window.__game.eng.render = () => {};`);
  const results = [], t0 = Date.now();
  const report = (r) => { results.push(r); if (r.items.length || results.length % 50 === 0) process.stdout.write(`${results.length} ${r.uid} ${r.ms}ms ${r.items.map((i) => i.code).join(',')}\n`); };
  if (mode === 'neon') {
    const uids = await page.evaluate(() => window.__game.world.lots.filter((l) => window.__game.buildings.byLot.has(l)).map((l) => l.uid));
    for (const uid of (pick || uids).slice(0, limit)) report(await page.evaluate(({ uid, floors }) => { const g = window.__game, lot = g.world.lots.find((l) => l.uid === uid || l.alias === uid); return window.__auditOne(g.buildings.byLot.get(lot), floors); }, { uid, floors }));
  } else {
    const info = await page.evaluate(() => window.__game.citysites && window.__game.citysites.cities ? window.__game.citysites.cities.map((c) => ({ id: c.c.id, x: c.c.x, y: c.c.y, z: c.c.z, r: c.c.r })) : null);
    console.log('cities mode: ' + JSON.stringify(info));
  }
  const by = {}; for (const r of results) for (const i of r.items) (by[i.code] ||= []).push(r.uid);
  console.log(`\nbuildings ${results.length}, floors built ${results.reduce((a, r) => a + r.floors, 0)}, ${Math.round((Date.now() - t0) / 1000)} s, page errors ${errors.length}`);
  for (const [c, l] of Object.entries(by).sort((a, b) => b[1].length - a[1].length)) console.log(`  ${c.padEnd(26)} ${String(new Set(l).size).padStart(4)} buildings   e.g. ${[...new Set(l)].slice(0, 5).join(' ')}`);
  if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify({ at: new Date().toISOString(), mode, results, errors: errors.slice(0, 10) }, null, 1));
  await browser.close();
})().catch((e) => { console.error(e.message.slice(0, 800)); process.exit(1); });
