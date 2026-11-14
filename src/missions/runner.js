import { Vehicle } from '../vehicle.js';
import { Human } from '../human.js';
import { HALF } from '../world.js';
import { hyp, rand, TAU } from '../util.js';
import { KIND_LABEL, PLACE_KINDS } from '../placeindex.js';
import { missionDef } from './defs.js';
import { keys as binds } from '../keys.js';

// The mission runner (EV-70): plays a mission of src/missions/defs.js step by step. A mission object keeps the shape Game.startMission,
// completeMission and updateMission always used ({ title, text, reward, start, update, cleanup, hud }), so the HUD, the save (missionIndex)
// and the beacon work as before. Places come from the EV-72 place index in the compiled regions (Jobs.placeTarget: a real shop, bank, hospital
// on the pavement in front of it) and from Game.pickSpot elsewhere (the capital's grid corners, a road side anywhere else), so every mission
// can be played anywhere in the country. A step whose start finds nothing to do there (no highway traffic for a chase, no tower for a roof)
// plays its `fallback` instead.

const inRange = (G, p, r) => hyp(G.player.x - p.x, G.player.z - p.z) < r;
const outside = (G) => Math.abs(G.player.x) > HALF + 40 || Math.abs(G.player.z) > HALF + 40;

// a place for a rule: a real place of the kinds when the index has one there, else a road side or grid corner min..max m from the rule's origin
export function resolvePlace(G, rule, vars) {
  if (rule.ref) return vars[rule.ref];
  const from = rule.from && rule.from !== 'player' ? vars[rule.from] || G.player : G.player;
  const label = rule.label || (rule.kinds ? KIND_LABEL[PLACE_KINDS.indexOf(rule.kinds[0])] : '표시된 장소');
  const p = rule.kinds && G.jobs?.placeTarget(from, new Set(rule.kinds), rule.min, rule.max);
  if (p) return { x: p.x, z: p.z, nx: p.nx, nz: p.nz, y: G.groundY(p.x, p.z), name: rule.label || p.name, real: true };
  const s = from === G.player ? G.pickSpot(rule.min, rule.max) : G.roadSpot(from, rule.min, rule.max) || G.pickSpot(rule.min, rule.max);
  return { x: s.x, z: s.z, nx: 0, nz: 0, y: s.y ?? G.groundY(s.x, s.z), name: label, real: false };
}

// gang members around a place (the old clear-gang and bounty missions' crowd), on the ground there
function spawnGang(G, at, n, hp, boss, detect = 45) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const big = boss && k === 0, a = (k / n) * TAU, r = rand(4, 11);
    const h = new Human(G, 'gang', { hp: big ? 150 : hp, weapon: k % 3 === 0 ? 2 : 1, look: { top: big ? 0x4a2a05 : 0x3a0c18, pants: 0x151015, trim: [1, 0.2, 0.25], hair: 0x111111, cap: k % 2 ? 0x201018 : null } });
    h.x = at.x + Math.cos(a) * r; h.z = at.z + Math.sin(a) * r; h.home = { x: at.x, z: at.z }; h.patrol = true; h.state = 'idle'; h.detect = detect; h.cash = Math.floor(rand(60, 220));
    const rr = G.world.colliders.resolve(h.x, h.z, 0.4, at.y || 0); h.x = rr.x; h.z = rr.z; h.y = h.floorY = G.groundY(h.x, h.z, (at.y || 0) + 1.5); h.ground = true;
    G.humans.push(h); G.scene.add(h.group); out.push(h);
  }
  return out;
}
// a person waiting at the kerb of a place (a fare, a VIP, an injured one, a mark)
function spawnWaiting(G, at, look) {
  const x = at.x + (at.nx || 0) * 1.5, z = at.z + (at.nz || 0) * 1.5, y = G.groundY(x, z, (at.y || 0) + 1.5);
  const L = look === 'vip' ? { top: 0x15151a, pants: 0x15151a, hair: 0x111111 } : look === 'injured' ? { top: 0x8a2020, pants: 0x30343c, hair: 0x2a1a10 } : { top: 0x3a5a8a, pants: 0x22252c, hair: 0x2a1a10 };
  const h = new Human(G, 'civ', { hp: 50, look: L });
  h.static = true; h.lookAtPlayer = true; h.x = x; h.z = z; h.y = h.floorY = y; h.ground = true; h.state = 'stand'; h.home = { x, z }; h.node = null; h.noVisit = true; h.mission = true;
  if (look === 'injured') h.crouching = true;
  G.humans.push(h); G.scene.add(h.group); return h;
}
// the player at a place in a car that has (nearly) stopped
const carStopped = (G, p, r = 9) => G.vehicle && G.vehicle.speed < 4 && inRange(G, p, r);

// the steps: start(c, s) sets the step up (false: cannot be played here, use s.fallback); update(c, s, dt) returns true when it is done,
// a string when the mission fails (the reason), else nothing
export const STEPS = {
  goto: {
    start(c, s) { c.place = resolvePlace(c.G, s.at, c.vars); c.G.setBeacon(c.place.x, c.place.z); },
    update(c, s) { return inRange(c.G, c.place, s.r || 4.5); },
  },
  wait: {
    start(c, s) { c.place = resolvePlace(c.G, s.at, c.vars); c.G.setBeacon(c.place.x, c.place.z); c.t = 0; },
    update(c, s, dt) {
      const G = c.G, ok = inRange(G, c.place, s.r || 6) && (!s.foot || !G.vehicle);
      c.t = ok ? c.t + dt : Math.max(0, c.t - dt * 2); c.hud = `${s.label || '대기'} ${Math.min(100, (c.t / s.s) * 100) | 0}%`;
      return c.t >= s.s;
    },
  },
  stealCar: {
    start(c, s) {
      const G = c.G; c.place = resolvePlace(G, s.at, c.vars);
      const car = new Vehicle(G, s.car.type, s.car.color, 'parked', { glow: [1, 0.1, 0.3] }); car.x = c.place.x; car.z = c.place.z + 4; car.h = 0; car.awake = false; G.addVehicle(car);
      G.setBeacon(car.x, car.z, 0xff3050); c.obj = car;
    },
    update(c) { if (c.obj.dead) return '차량이 파괴되었다'; return c.G.vehicle === c.obj; },
    save: (c) => c.obj,
  },
  deliverCar: {
    start(c, s) { c.place = resolvePlace(c.G, s.at, c.vars); c.car = c.vars[s.car]; c.t = s.limit || 0; c.G.setBeacon(c.place.x, c.place.z); c.away = false; },
    update(c, s, dt) {
      const G = c.G, car = c.car; if (car.dead) return '차량이 파괴되었다';
      if (s.limit) { c.t -= dt; c.hud = `남은 시간 ${Math.max(0, c.t | 0)}s`; if (c.t <= 0) return '시간 초과'; }
      if (G.vehicle !== car) { if (!c.away) { c.away = true; G.setMissionText(c.m.title, '차량에 다시 탑승하라!'); G.setBeacon(car.x, car.z, 0xff3050); } return; }
      if (c.away) { c.away = false; G.setMissionText(c.m.title, c.text); G.setBeacon(c.place.x, c.place.z); }
      if (hyp(car.x - c.place.x, car.z - c.place.z) < 6 && car.speed < 12) { if (s.clearWanted) G.clearWanted(); return true; }
    },
  },
  gang: {
    start(c, s) { c.place = resolvePlace(c.G, s.at, c.vars); c.G.setBeacon(c.place.x, c.place.z, 0xff3050); c.gang = spawnGang(c.G, c.place, s.n, s.hp || 75, s.boss); c.m.spawned.push(...c.gang); },
    // an ambush (wait: false) only sets the crowd down; the mission goes on at once
    update(c, s) { if (s.wait === false) return true; const left = c.gang.filter((h) => !h.dead).length; c.hud = `남은 적 ${left}`; return left === 0; },
  },
  guards: {
    start(c, s) { const G = c.G; c.place = resolvePlace(G, s.at, c.vars); G.setBeacon(c.place.x, c.place.z, 0x9a7dff); c.gang = spawnGang(G, c.place, s.n, 80, false, 16); for (const h of c.gang) { h.x += (h.x - c.place.x) * 1.5; h.z += (h.z - c.place.z) * 1.5; h.home = { x: h.x, z: h.z }; } c.m.spawned.push(...c.gang); },
    update(c) {
      const G = c.G; if (c.gang.some((h) => !h.dead && (h.state === 'attack' || h.state === 'search' || h.state === 'cover'))) return '경비에게 들켰다';
      if (G.wanted > 0) return '경찰에 쫓기고 있다';
      c.hud = `목표까지 ${hyp(G.player.x - c.place.x, G.player.z - c.place.z) | 0} m · 들키지 마라`; return inRange(G, c.place, 3);
    },
  },
  heat: { start(c, s) { c.G.addHeat(s.add); if (s.toast) c.G.toast(s.toast[0], s.toast[1]); }, update: () => true },
  escape: {
    start(c) { c.t = 0; c.G.hideBeacon(); },
    update(c, s, dt) { const G = c.G; c.t += dt; c.hud = `수배 ${'★'.repeat(G.wanted) || '—'}`; return G.wanted === 0 && c.t > (s.after || 8); },
  },
  passenger: {
    start(c, s) { const G = c.G; c.place = resolvePlace(G, s.at, c.vars); c.obj = spawnWaiting(G, c.place, s.look); c.m.spawned.push(c.obj); G.setBeacon(c.obj.x, c.obj.z, 0xffc94d); },
    update(c) { const h = c.obj; if (h.dead) return '손님이 죽었다'; c.hud = c.G.vehicle ? '차를 세우고 태워라' : '차가 필요하다'; if (carStopped(c.G, h)) { h.hidden = true; h.group.visible = false; return true; } },
    save: (c) => Object.assign(c.obj, { name: c.place.name, nx: c.place.nx, nz: c.place.nz }),
  },
  dropoff: {
    start(c, s) { const G = c.G; c.place = resolvePlace(G, s.at, c.vars); c.obj = c.vars[s.npc]; G.setBeacon(c.place.x, c.place.z, 0xffc94d); },
    update(c) {
      const G = c.G; c.hud = `${c.place.name} ${hyp(G.player.x - c.place.x, G.player.z - c.place.z) | 0} m`;
      if (!G.vehicle) return '승객을 두고 내렸다';
      if (carStopped(G, c.place)) { const h = c.obj; h.x = c.place.x; h.z = c.place.z; h.remove = true; return true; }
    },
  },
  ignite: {
    start(c, s) { c.place = resolvePlace(c.G, s.at, c.vars); c.G.setBeacon(c.place.x, c.place.z, 0xff7a30); },
    update(c, s) {
      const G = c.G; if (!inRange(G, c.place, s.r || 5)) return;
      for (let k = 0; k < 4; k++) G.fire?.ignite(c.place.x + rand(-3, 3), c.place.z + rand(-3, 3), { y: (c.place.y || 0) + 0.15, fuel: rand(12, 25), r: rand(1.2, 2) });
      return true;
    },
  },
  checkpoints: {
    start(c, s) { c.k = 0; c.cp = resolvePlace(c.G, { min: s.gap[0], max: s.gap[1] }, c.vars); c.G.setBeacon(c.cp.x, c.cp.z, 0x40e0ff); },
    update(c, s) {
      const G = c.G; c.hud = `지점 ${c.k + 1}/${s.n}`;
      if (!G.vehicle || !inRange(G, c.cp, s.r || 14)) return;
      if (++c.k >= s.n) return true;
      G.audio.tone?.(900, 0.1, 'sine', 0.1); c.cp = resolvePlace(G, { min: s.gap[0], max: s.gap[1], from: '_cp' }, { ...c.vars, _cp: c.cp }); G.setBeacon(c.cp.x, c.cp.z, 0x40e0ff);
    },
  },
  // a car fleeing along the compiled streets (hwtraffic's lane planner, faster than the rest); stopped when wrecked, or stood still with the
  // player within 15 m for 2 s; lost when it gets 700 m away or the traffic recycles it
  chase: {
    start(c, s) {
      const G = c.G, H = G.hwtraffic, pl = G.player; if (!H) return false;
      const near = H.nearestSample(pl.x, pl.z, 300, true); if (!near || near.r.x.length < 12) return false;
      const r = near.r, n = r.x.length; let i = near.i, dir = 1;
      for (const d of [1, -1]) { let j = near.i; while (j + d > 2 && j + d < n - 3 && hyp(r.x[j] - pl.x, r.z[j] - pl.z) < 70) j += d; if (hyp(r.x[j] - pl.x, r.z[j] - pl.z) >= 40) { i = j; dir = d; break; } }
      if (hyp(r.x[i] - pl.x, r.z[i] - pl.z) < 40 || (r.oneway && dir < 0)) return false;
      const v = H.spawnCar(r, i, dir, 0); v.ai.speed = s.speed || 27; v.fleeing = true; c.obj = v; c.still = 0; c.m.spawned.push(v);
      G.setBeacon(v.x, v.z, 0xff3050);
    },
    update(c, s, dt) {
      const G = c.G, v = c.obj;
      if (v.dead) return true;
      if (!G.vehicles.includes(v) || v.hwDone) return '놓쳤다';
      const d = hyp(G.player.x - v.x, G.player.z - v.z); if (d > 700) return '놓쳤다';
      c.still = v.speed < 1.5 && d < 15 ? c.still + dt : 0; if (c.still > 2) return true;
      G.setBeacon(v.x, v.z, 0xff3050); c.hud = `거리 ${d | 0} m · 차를 세워라`;
    },
  },
  // the capital's towers with a lift: walk in and ride to the roof (the old rooftop mission); none away from the capital's grid
  roof: {
    start(c) {
      const G = c.G; if (outside(G) || !(G.world.enterables || []).length) return false;
      const cands = G.world.enterables.filter((e) => hyp(e.x - G.player.x, e.z - G.player.z) > 90).sort((p, q) => hyp(p.x - G.player.x, p.z - G.player.z) - hyp(q.x - G.player.x, q.z - G.player.z));
      const e = cands[Math.min(2, cands.length - 1)] || G.world.enterables[0], b = G.buildings.byLot.get(e.lot); if (!b) return false;
      b.plan(); c.b = b; c.place = { x: e.x, z: e.z, name: b.name }; G.setBeacon(e.x, e.z); G.setMissionText(c.m.title, `${b.name} 옥상에 올라가라. 정문으로 들어가 엘리베이터나 계단을 이용.`);
    },
    update(c) { const G = c.G, pl = G.player, at = G.buildings.at(pl.x, pl.z); c.hud = at === c.b ? `높이 ${Math.max(0, pl.y) | 0}m / ${c.b.roofY | 0}m` : null; return at === c.b && pl.y > c.b.roofY - 0.6; },
  },
};

// the mission line of a step: its own text with {name} replaced by the saved places' names
const fill = (t, vars) => t.replace(/\{(\w+)\}/g, (_, k) => vars[k]?.name || '목적지');

// the mission object for the mission at save index i
export function missionFor(G, i) {
  const def = missionDef(i), reward = def.reward + (i >= 5 ? (i % 5) * (def.rewardStep || 0) : 0);
  const m = {
    def, id: def.id, title: def.title, text: def.text.replace(/\{key:(\w+)\}/g, (_, k) => binds.label(k)), reward, hud: null, spawned: [], k: -1, c: null, t: def.limit || 0,
    // begin step k (or its fallback), saving the previous step's result
    begin(k) {
      if (k >= def.steps.length) { G.completeMission(); return; }
      let s = def.steps[k]; const c = { G, m, vars: m.vars, hud: null };
      if (STEPS[s.do].start(c, s) === false) { s = s.fallback; if (!s || STEPS[s.do].start(c, s) === false) { G.failMission('여기서는 할 수 없는 임무'); return; } }
      c.text = s.text ? fill(s.text, m.vars) : m.c?.text || m.text; m.k = k; m.s = s; m.c = c; m.goal = c.place || null;
      if (s.text) G.setMissionText(def.title, c.text);
    },
    start() { m.vars = {}; m.begin(0); },
    update(dt) {
      if (m.done || !m.s) return;
      if (def.limit) { m.t -= dt; if (m.t <= 0) { G.failMission('시간 초과'); return; } }
      const s = m.s, c = m.c, r = STEPS[s.do].update(c, s, dt);
      m.hud = c.hud != null ? (def.limit ? `${c.hud} · ${Math.max(0, m.t | 0)}s` : c.hud) : def.limit ? `남은 시간 ${Math.max(0, m.t | 0)}s` : null;
      if (typeof r === 'string') { G.failMission(r); return; }
      if (r) { const st = def.steps[m.k]; if (st.save) m.vars[st.save] = STEPS[s.do].save ? STEPS[s.do].save(c) : c.place; m.begin(m.k + 1); }
    },
    // what the mission set down leaves with it: people (not the bodies of the dead) and a fleeing car still driving
    cleanup() { for (const o of m.spawned) { if (o instanceof Vehicle) { if (!o.dead && o !== G.vehicle) o.broken = true; } else if (!o.dead && (o.mission || o.team === 'gang')) o.remove = true; } },
  };
  return m;
}
