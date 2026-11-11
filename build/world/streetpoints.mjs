// The street things that the records place one by one (WLD-24g-3, ADR-0042): bus stops, subway entrances, benches, litter bins, fire hydrants and
// vending machines from OpenStreetMap, and the zebra crossings away from junctions (mid-block) from Seoul's own crossing polygons and the map's crossing
// nodes. Nothing here is placed by a rule: every object is a record, judged before it stands (streetfurn.mjs makeJudge), and refused with a reason when it
// does not fit (streets-stats.json `refused.point`). The rule only decides what a record leaves open: a bus stop without a `shelter` tag gets a shelter on
// an arterial (rank 2 or better) with room for it, and a pole elsewhere.
// Positions: a bus stop is mapped on the kerb, on the carriageway's centre line or on the platform; it is set on the kerb of its side (the side the point
// lies on), 0.4 m back from it, and turned to the road. A subway entrance, bench, bin, hydrant or vending machine is mapped where it stands and is kept
// there; only a point that falls on a carriageway is pushed onto the pavement (up to 4 m), and one that falls in a building or in the water is refused.
export const PTYPE = { bus: 2, subway: 3, bench: 4, bin: 5, hydrant: 6, vending: 7 };
const KIND = { bus: 'bus', subway: 'subway', bench: 'bench', waste_basket: 'bin', hydrant: 'hydrant', vending_machine: 'vending' };
// footprints (half along the road, half across it, height) of the solid ones, and the free distance a small one keeps from walls and carriageways
export const SHELTER = { hl: 2.6, hw: 0.75, h: 2.6, back: 0.4 }, ENTRANCE = { hl: 2.6, hw: 1.4, h: 2.7 }, SMALL = { bench: 0.9, bin: 0.3, hydrant: 0.2, vending: 0.6 };
const DUP = { bus: 12, subway: 4, bench: 1.0, bin: 0.6, hydrant: 1.0, vending: 1.0 };
const RANK = { trunk: 0, primary: 0, secondary: 1, tertiary: 2, residential: 3, living_street: 3, unclassified: 3 };
const rankOf = (hw) => (hw in RANK ? RANK[hw] : hw.endsWith('_link') ? 8 : 9);
const MID_FROM_JUNCTION = 45;   // a crossing record closer than this to a junction belongs to it (its arms draw the crossings there)

// the crossings away from junctions: { x, z, y, tx, tz, half, wid, src (1 Seoul, 2 OSM), signal, ri } on the centre line of their road
export function midCrossings(J, roads, junctions, crossPoints, used, why) {
  const no = (k) => { why[k] = (why[k] || 0) + 1; }, out = [];
  const jg = new Map(), JC = 64; for (const j of junctions) { const k = Math.floor(j.x / JC) * 100003 + Math.floor(j.z / JC); (jg.get(k) || jg.set(k, []).get(k)).push(j); }
  const nearJ = (x, z) => { for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) for (const j of jg.get((Math.floor(x / JC) + a) * 100003 + Math.floor(z / JC) + b) || []) if (Math.hypot(j.x - x, j.z - z) < MID_FROM_JUNCTION) return true; return false; };
  // Seoul's polygons first (they carry the true width), then the map's nodes where the city has none
  const list = [...crossPoints].sort((a, b) => (a.src === 'seoul' ? 0 : 1) - (b.src === 'seoul' ? 0 : 1) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const kept = new Map(), KC = 16, put = (c) => { const k = Math.floor(c.x / KC) * 100003 + Math.floor(c.z / KC); (kept.get(k) || kept.set(k, []).get(k)).push(c); };
  const dupOf = (x, z, ri) => { for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) for (const c of kept.get((Math.floor(x / KC) + a) * 100003 + Math.floor(z / KC) + b) || []) if (c.ri === ri && Math.hypot(c.x - x, c.z - z) < 8) return true; return false; };
  for (const p of list) {
    if (used.has(p)) { no('junction'); continue; }
    if (nearJ(p.x, p.z)) { no('junction'); continue; }
    const s = J.nearestRoad(p.x, p.z, 14, true);
    if (!s || s.gap > 0.5) { no('offroad'); continue; }   // over a driveway or a cycle path, not over a carriageway the network has
    const L = roads[s.ri]; if (rankOf(L.hw) > 3) { no('motorway'); continue; }
    if (L.cls[s.i] === 2 || L.cls[s.i + 1] === 2) { no('tunnel'); continue; }
    // the width along the road: Seoul's polygon measured along it, the map's node the width of a junction crossing (4 m on the big roads, 3 m else)
    let wid = rankOf(L.hw) <= 1 ? 4 : 3, cs = 0;
    if (p.ring) { let lo = Infinity, hi = -Infinity; for (const [x, z] of p.ring) { const u = (x - s.fx) * s.tx + (z - s.fz) * s.tz; lo = Math.min(lo, u); hi = Math.max(hi, u); } wid = Math.max(2.5, Math.min(8, hi - lo)); cs = (lo + hi) / 2; }
    const x = s.fx + s.tx * cs, z = s.fz + s.tz * cs;
    if (nearJ(x, z)) { no('junction'); continue; }   // set on its road it can come closer to a junction than the record was
    if (dupOf(x, z, s.ri)) { no('dup'); continue; }
    const c = { x, z, y: s.y, tx: s.tx, tz: s.tz, half: L.half, wid, src: p.src === 'seoul' ? 1 : 2, signal: !!p.signal, ri: s.ri, id: p.id };
    put(c); out.push(c); no('placed');
  }
  return out;
}

// the point records placed: items in the furniture format of streetfurn.mjs ({ t, x, z, y, ix, iz, v, bridge, ri, real }), v: bit 0 a shelter (bus) /
// bit 1 the shelter decision came from the record's tag / bit 5 a real record
export function placePoints(J, roads, points, why) {
  const no = (k) => { why[k] = (why[k] || 0) + 1; return null; }, items = [];
  const list = points.filter((p) => KIND[p.t]).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // the fixed, large things first (a bench does not push a shelter aside)
  const order = ['bus', 'subway', 'vending', 'bench', 'bin', 'hydrant'];
  for (const kind of order) for (const p of list) {
    if (KIND[p.t] !== kind) continue;
    const it = kind === 'bus' ? busStop(p) : kind === 'subway' ? entrance(p) : small(p, kind);
    if (!it) continue;
    it.t = PTYPE[kind]; it.real = true; it.v |= 32; it.kind = kind;
    J.add(it); items.push(it); why.placed = (why.placed || 0) + 1;
  }
  return items;

  // the free spot test for a footprint centred at (x, z): not in the water, clear of walls and of every carriageway at its level by `r` (a bridge or a
  // flyover above does not count, the road under it does)
  function clear(x, z, y, r) {
    if (J.water(x, z)) return 'water';
    if (J.bdist(x, z, 14).d < r) return 'building';
    if (J.roadsNear(x, z, -1, y, 0, 0).gap < r) return 'road';
    return true;
  }
  function busStop(p) {
    const s = J.nearestRoad(p.x, p.z, 30, true); if (!s) return no('far');
    const L = roads[s.ri], rk = rankOf(L.hw);
    // the side: where the point lies; a point on the centre line goes to the right of the line's direction (traffic keeps right)
    const lat = (p.x - s.fx) * s.tz - (p.z - s.fz) * s.tx, sd = Math.abs(lat) > 0.3 ? Math.sign(lat) : 1;
    const ox = s.tz * sd, oz = -s.tx * sd;   // outward from the centre line, on the point's side
    if (dupBus(s.fx + ox * L.half, s.fz + oz * L.half)) return no('dup');
    const tagged = p.shelter === true || p.shelter === false, want = tagged ? p.shelter : rk <= 2;
    // a shelter stands with its front 0.4 m back from the kerb; where its depth does not fit, the stop is a pole
    for (const shelter of want ? [true, false] : [false]) {
      const off = shelter ? SHELTER.back + SHELTER.hw : 0.5, x = s.fx + ox * (L.half + off), z = s.fz + oz * (L.half + off);
      const r = shelter ? SHELTER.hw : 0.15, ok = clear(x, z, s.y, r) === true && (!shelter || ([-1, 1].every((e) => clear(x + s.tx * e * SHELTER.hl, z + s.tz * e * SHELTER.hl, s.y, 0.2) === true)));
      if (!ok) continue;
      if (shelter !== want) why.noRoom = (why.noRoom || 0) + 1;
      // off a deck the stop stands on the ground beside the kerb: a road on an embankment or in a cutting there has no footway at its level (WLD-32)
      const deck = L.cls[s.i] === 1 || L.cls[s.i + 1] === 1;
      if (!deck && Math.abs(s.y - J.groundY(x, z)) > 1.5) return no('level');
      return { x, z, y: s.y, ix: -ox, iz: -oz, v: (shelter ? 1 : 0) | (tagged ? 2 : 0), bridge: deck ? 1 : 0, ri: s.ri };
    }
    const x = s.fx + ox * (L.half + 0.5), z = s.fz + oz * (L.half + 0.5), res = clear(x, z, s.y, 0.15); return no(res === true ? 'room' : res);
  }
  function dupBus(x, z) { for (const q of items) if (q.t === PTYPE.bus && Math.hypot(q.x - x, q.z - z) < DUP.bus) return true; return false; }
  // the height a record off the carriageway stands at (WLD-32): the ground, or the road's surface where that road is on the ground here (a kerb a little
  // above or below the terrain); a flyover or a ramp beside the spot is another level, its height would hang the record in the air
  function footAt(s, x, z) {
    const g = J.groundY(x, z); if (!s) return g;
    const L = roads[s.ri]; return !L.cls[s.i] && !L.cls[s.i + 1] && Math.abs(s.y - g) < 1.5 ? s.y : g;
  }
  function entrance(p) {
    const s = J.nearestRoad(p.x, p.z, 25, true), y = footAt(s, p.x, p.z);
    if (J.water(p.x, p.z)) return no('water');
    // an entrance inside a building's outline opens in its wall (no canopy of its own)
    if (J.bdist(p.x, p.z, 14).d < 0) return no('inBuilding');
    if (J.nearPlaced(p.x, p.z, DUP.subway, PTYPE.subway)) return no('dup');
    // the canopy runs along the pavement, open toward the road's direction of the nearer end; slid away from a carriageway it stands on (up to 2 m)
    const ux = s ? s.tx : 1, uz = s ? s.tz : 0, ox = s ? -s.nx : 0, oz = s ? -s.nz : 0;
    for (const slide of [0, 0.5, 1, 1.5, 2]) {
      const x = p.x + ox * slide, z = p.z + oz * slide;
      const corners = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([a, b]) => [x + ux * a * ENTRANCE.hl - uz * b * ENTRANCE.hw, z + uz * a * ENTRANCE.hl + ux * b * ENTRANCE.hw]);
      const onRoad = corners.some(([cx, cz]) => J.roadsNear(cx, cz, -1, y, 0, 0).gap < 0.1);
      if (onRoad) continue;
      if (J.bdist(x, z, 14).d < 0) break;
      return { x, z, y, ix: s ? s.nx : 1, iz: s ? s.nz : 0, v: 0, bridge: 0, ri: s ? s.ri : -1 };
    }
    return no('road');
  }
  function small(p, kind) {
    const s = J.nearestRoad(p.x, p.z, 20, true), r = SMALL[kind];
    let x = p.x, z = p.z;
    // a point on the carriageway goes onto the pavement beside it
    if (s && s.gap < r) { const push = r - s.gap + 0.3; if (push > 4) return no('road'); x -= s.nx * push; z -= s.nz * push; }
    const y = s && s.gap < 6 ? footAt(s, x, z) : J.groundY(x, z), res = clear(x, z, y, kind === 'bench' ? 0.3 : 0.15);
    if (res !== true) return no(res);
    if (J.nearPlaced(x, z, DUP[kind], PTYPE[kind])) return no('dup');
    if (J.onCrossing(x, z, 0.5)) return no('crossing');
    // a bench and a vending machine face the pavement (their back to the wall or the road, whichever is nearer); the rest only need a place
    return { x, z, y, ix: s ? s.nx : 1, iz: s ? s.nz : 0, v: 0, bridge: 0, ri: s ? s.ri : -1 };
  }
}
