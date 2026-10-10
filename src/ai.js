import { clamp, rand, TAU } from './util.js';
import { navPath } from './nav.js';

// NPC brains (armed gang / guards / police, and civilian reactions). Human.update calls into here.
//
// Armed NPCs no longer know where the player is by magic:
//  - they SEE inside a ~150 degree cone (360 once alerted, and anything within 5 m), blocked by walls, shortened when the player crouches / lies,
//  - they HEAR gunshots / explosions / car crashes (G.noise -> hear()) and go to investigate the spot,
//  - they REMEMBER the last seen position (+ velocity) and search it when sight is lost, then give up and go home,
//  - they path around walls (navPath, budgeted) and unstick themselves when pressed against geometry,
//  - they TAKE COVER when hurt or low on health (a point whose line to the player is blocked), hide / reload, then peek out and fire,
//  - groups FLANK (alternating sides), warn each other (with the last known position), react to dead allies, and wounded ones may RETREAT.
// Civilians: fear spreads between people who see each other, scared people sometimes cower, passers-by gawk at bodies, and dodge cars.
const FOV_COS = Math.cos(75 * Math.PI / 180);
const ENGAGED = new Set(['idle', 'attack', 'cover', 'search', 'retreat', 'investigate']);
const budget = { frame: -1, nav: 0 };

export function spendNav(G) {
  if (budget.frame !== G.time) { budget.frame = G.time; budget.nav = 0; }
  return budget.nav++ < 1;
}

// ------------------------------------------------------------------ perception
function bearing(h, x, z) { return Math.atan2(x - h.x, z - h.z); }
function inCone(h, x, z) {
  const dx = x - h.x, dz = z - h.z, d = Math.hypot(dx, dz) || 1;
  return (dx * Math.sin(h.ry) + dz * Math.cos(h.ry)) / d > FOV_COS;
}
// cached ray to the player (every ~0.15 s)
function sight(h, dt) {
  const G = h.G, pl = G.player;
  h.losT = (h.losT || 0) - dt;
  if (h.losT <= 0) {
    h.losT = 0.12 + Math.random() * 0.06;
    const d = Math.hypot(pl.x - h.x, pl.z - h.z), alerted = h.state === 'attack' || h.state === 'cover' || h.state === 'search';
    const stealth = pl.prone ? 0.3 : pl.crouching ? 0.55 : 1, night = G.clock?.hour > 21 || G.clock?.hour < 5 ? 0.8 : 1;
    const range = (h.detect || 38) * stealth * night * (alerted ? 1.6 : 1);
    let seen = d < 90 && (d < range || (h.team === 'cop' && G.wanted > 0 && d < 70));
    if (seen && !alerted && d > 5 && !inCone(h, pl.x, pl.z)) seen = false;
    if (seen) seen = G.hasLOS(h.x, 1.5, h.z, pl.x, pl.y + (pl.prone ? 0.4 : pl.crouching ? 0.9 : 1.4), pl.z);
    h.sees = seen;
    if (seen) { h.mem = { x: pl.x, z: pl.z, vx: pl.vx || 0, vz: pl.vz || 0, t: G.time }; h.lostT = 0; }
  }
  if (!h.sees) h.lostT = (h.lostT || 0) + dt;
  return h.sees;
}

// somebody (player or ai) made a noise at x,z with radius r
export function hear(h, x, z, r, kind) {
  if (h.dead || h.rag || h.team === 'civ') return;
  if (h.team === 'gang' && !(h.detect > 0) && !h.guard) return;
  if (h.state === 'attack' || h.state === 'cover' || h.state === 'retreat') return;
  const d = Math.hypot(x - h.x, z - h.z); if (d > r) return;
  if (h.team === 'cop' && !h.G.wanted) { if (kind === 'shot' || kind === 'boom') { h.alert = 1; } else return; }
  // more noise from about the same place (a burst of fire) keeps the current walk there instead of re-planning the route every shot
  const same = h.state === 'investigate' && h.tgt && Math.hypot(h.tgt.x - x, h.tgt.z - z) < 6;
  h.state = 'investigate'; h.invT = rand(9, 14);
  if (same) return;
  h.invLook = 0;
  h.tgt = { x: x + rand(-3, 3), z: z + rand(-3, 3) };
  h.path = null;
}

// ------------------------------------------------------------------ movement helpers
// steer toward (tx,tz): straight when possible, along a nav path when sight is blocked, with a side-step when stuck
function goTo(h, dt, tx, tz, speed, nav = true) {
  const G = h.G, dx = tx - h.x, dz = tz - h.z, d = Math.hypot(dx, dz);
  if (d < 0.6) { h.cmdSpeed = 0; return true; }
  let wx = tx, wz = tz;
  if (nav && d > 4) {
    h.pathT = (h.pathT || 0) - dt;
    const blocked = !G.hasLOS(h.x, 0.6, h.z, tx, 0.6, tz);
    if (blocked && (!h.path || h.pathT <= 0 || h.pathGoalD > 3 && Math.hypot(h.pathGx - tx, h.pathGz - tz) > 3) && spendNav(G)) {
      h.path = navPath(G, h.floorY || 0, h.x, h.z, tx, tz, 50); h.pathT = 1.6; h.pathGx = tx; h.pathGz = tz; h.pathGoalD = d;
    }
    if (!blocked) h.path = null;
    if (h.path && h.path.length) {
      while (h.path.length > 1 && Math.hypot(h.path[0][0] - h.x, h.path[0][1] - h.z) < 0.9) h.path.shift();
      wx = h.path[0][0]; wz = h.path[0][1];
    }
  }
  let ax = wx - h.x, az = wz - h.z; const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
  // stuck: slide along the obstacle in a persistent direction for a moment
  if (h.blocked && h.speed < 0.6) h.stuckT = (h.stuckT || 0) + dt; else h.stuckT = Math.max(0, (h.stuckT || 0) - dt * 2);
  if (h.stuckT > 0.45) { h.sideT = 0.9; h.sideDir = h.sideDir || (Math.random() < 0.5 ? 1 : -1); h.stuckT = 0; }
  if (h.sideT > 0) {
    h.sideT -= dt; const a = Math.atan2(ax, az) + h.sideDir * 1.25; ax = Math.sin(a); az = Math.cos(a);
    if (h.sideT <= 0) h.sideDir = 0;
  }
  h.cmdX = ax; h.cmdZ = az; h.cmdSpeed = speed;
  return false;
}
// a point with no line of sight to (px,pz), reachable and not too far from the NPC / too close to the player
function findCover(h, px, pz) {
  const G = h.G;
  let best = null, bs = 1e9;
  for (let n = 0; n < 14; n++) {
    const a = (n / 14) * TAU + rand(-0.2, 0.2), r = rand(3, 9);
    const x = h.x + Math.sin(a) * r, z = h.z + Math.cos(a) * r;
    const rr = G.world.colliders.resolve(x, z, 0.4, h.floorY || 0); if (Math.hypot(rr.x - x, rr.z - z) > 0.3) continue;
    if (G.hasLOS(x, 1.3, z, px, 1.4, pz)) continue;                         // still visible from the player
    if (!G.hasLOS(h.x, 1.0, h.z, x, 1.0, z)) continue;                      // the way there is blocked
    const dPl = Math.hypot(x - px, z - pz); if (dPl < 5) continue;
    const s = r + Math.abs(dPl - 14) * 0.4 + Math.random();
    if (s < bs) { bs = s; best = { x, z }; }
  }
  return best;
}
function countAllies(h, r) {
  let n = 0;
  for (const o of h.G.humans) if (o !== h && !o.dead && o.team === h.team && (o.state === 'attack' || o.state === 'cover') && Math.hypot(o.x - h.x, o.z - h.z) < r) n++;
  return n;
}

function raise(h, why) {
  const G = h.G, wasCalm = h.state !== 'attack' && h.state !== 'cover';
  h.state = 'attack'; h.alert = 1; h.fireCd = Math.max(h.fireCd || 0, rand(0.5, 1.1)); h.path = null; h.coverPhase = null;
  if (wasCalm) { if (h.team === 'gang') G.voiceAt?.(h, 'shout'); G.alertGang?.(h, why); }
}

// ------------------------------------------------------------------ armed brain
export function combat(h, dt) {
  const G = h.G, pl = G.player, W = h.weapon;
  const dxp = pl.x - h.x, dzp = pl.z - h.z, dp = Math.hypot(dxp, dzp) || 1;
  h.cmdSpeed = 0; h.faceAngle = null; h.crouching = false; h.crouch = 0;
  if (!ENGAGED.has(h.state)) h.state = 'idle';
  const sees = sight(h, dt);
  const isCop = h.team === 'cop', hunt = isCop ? G.wanted > 0 : true;
  if (isCop && !hunt) { h.state = 'idle'; h.crouch = 0; return; }
  if (isCop) { h.alert = 1; if (h.state === 'idle' || h.state === 'investigate') h.state = 'attack'; }
  // hurt (set by Human.hurt) always turns the head
  if (h.hurtT > 0) h.hurtT -= dt;
  // guards keep station until they notice a drawn weapon / alarm
  if (h.guard && h.state === 'idle') {
    if (sees && dp < h.detect && (pl.weaponDrawn || G.alarm)) raise(h, 'guard');
    else return;
  }
  // a dead ally in view raises suspicion
  if (h.state === 'idle' && !isCop && (h.deadSeenT = (h.deadSeenT || 0) - dt) <= 0) {
    h.deadSeenT = 1;
    for (const o of G.humans) if (o.dead && o.team === 'gang' && o.deadT < 40 && Math.hypot(o.x - h.x, o.z - h.z) < 14 && inCone(h, o.x, o.z) && G.hasLOS(h.x, 1.5, h.z, o.x, 1, o.z)) { h.state = 'investigate'; h.invT = 12; h.tgt = { x: pl.x + rand(-8, 8), z: pl.z + rand(-8, 8) }; h.invLook = 0; h.path = null; break; }
  }

  switch (h.state) {
    case 'idle': case 'walk': {
      if (h.detect > 0 && sees && (h.alert || pl.weaponDrawn || G.wanted > 0 || dp < 22 || h.team === 'cop')) { raise(h, 'sight'); break; }
      if (h.detect > 0 && sees) { h.suspT = (h.suspT || 0) + dt; h.faceAngle = bearing(h, pl.x, pl.z); if (h.suspT > 1.1) raise(h, 'sight'); return; }
      h.suspT = Math.max(0, (h.suspT || 0) - dt);
      h.cmdSpeed = 0; if (h.patrol) h.doPatrol(dt);
      return;
    }
    case 'investigate': {
      if (sees && h.detect > 0) { raise(h, 'sight'); break; }
      h.invT -= dt;
      const arrived = goTo(h, dt, h.tgt.x, h.tgt.z, 3.4);
      if (arrived) {   // look around the spot
        h.invLook += dt; h.cmdSpeed = 0; h.faceAngle = h.ry + Math.sin(h.invLook * 1.6) * 1.4; h.aimT = 0.5;
        if (h.invLook > 3.5) h.invT = 0;
      } else h.faceAngle = Math.atan2(h.cmdX, h.cmdZ);
      if (h.invT <= 0) { h.state = 'idle'; h.path = null; }
      return;
    }
    case 'search': {
      if (sees) { raise(h, 'sight'); break; }
      h.searchT -= dt;
      if (h.searchT <= 0 && !(isCop && G.wanted > 0)) { h.state = 'idle'; h.path = null; return; }
      const m = h.mem; if (!m) { h.state = 'idle'; h.path = null; return; }   // hurt by something with no position to search (a fall)
      const arrived = goTo(h, dt, m.x, m.z, 4.4);
      h.aimT = 0.6;
      if (arrived) {   // pick another place near it
        h.scanT = (h.scanT || 0) - dt;
        if (h.scanT <= 0) { h.scanT = rand(1.4, 2.4); h.mem = { x: m.x + rand(-7, 7), z: m.z + rand(-7, 7), t: m.t }; h.faceAngle = rand(0, TAU); }
        else h.faceAngle = h.ry + Math.sin(G.time * 2 + h.id) * 0.6;
      } else h.faceAngle = Math.atan2(h.cmdX, h.cmdZ);
      return;
    }
    case 'retreat': {
      h.retreatT -= dt;
      const fx = h.x - pl.x, fz = h.z - pl.z, l = Math.hypot(fx, fz) || 1;
      const hx = h.home ? h.home.x : h.x + fx / l * 30, hz = h.home ? h.home.z : h.z + fz / l * 30;
      goTo(h, dt, hx, hz, 5.8); h.aimT = 0;
      if (sees && dp < 18 && h.fireCd <= 0 && G.hasLOS(h.x, 1.4, h.z, pl.x, 1.4, pl.z)) { h.fireCd = rand(1.6, 2.6); G.enemyShoot(h, pl); }   // covering fire
      h.fireCd -= dt;
      if (h.retreatT <= 0) { h.state = 'attack'; h.hurtT = 0; }
      return;
    }
    default: break;   // attack / cover handled below
  }
  if (h.state !== 'attack' && h.state !== 'cover') return;

  // ---------------------------------------------------------------- engaged
  const lost = !sees;
  if (lost && h.lostT > 1.6 && h.mem && !isCop) {
    // lost them: go where they were last seen (a little ahead along their velocity), then search
    const m = h.mem; h.mem = { x: m.x + clamp(m.vx, -6, 6) * 0.8, z: m.z + clamp(m.vz, -6, 6) * 0.8, t: m.t };
    h.state = 'search'; h.searchT = rand(9, 14); h.path = null; h.coverPhase = null; return;
  }
  // cops know roughly where a wanted suspect is (radio / witnesses): they search around that spot
  if (lost && isCop) {
    h.radioT = (h.radioT || 0) - dt;
    if (!h.mem || h.radioT <= 0) { h.radioT = 3.5; h.mem = { x: pl.x + rand(-9, 9) * (G.wanted > 2 ? 0.5 : 1), z: pl.z + rand(-9, 9) * (G.wanted > 2 ? 0.5 : 1), vx: 0, vz: 0, t: G.time }; }
    if (h.lostT > 1.6) { h.state = 'search'; h.searchT = 10; h.path = null; return; }
  }
  if (isCop && cuffing(h, dt, dxp, dzp, dp)) return;

  // wounded: some run, the rest take cover
  const frac = h.hp / h.maxHp;
  if (h.team === 'gang' && frac < 0.3 && h.retreatDecided == null) {
    h.retreatDecided = Math.random() < 0.55;
    if (h.retreatDecided) { h.state = 'retreat'; h.retreatT = rand(5, 8); G.voiceAt?.(h, 'scream'); h.path = null; return; }
  }
  if (h.state === 'attack' && sees && (h.hurtT > 0 || frac < 0.55 || (countAllies(h, 25) >= 1 && Math.random() < dt * 0.05)) && !h.coverCd) {
    const c = findCover(h, pl.x, pl.z);
    if (c) { h.state = 'cover'; h.cover = c; h.coverPhase = 'move'; h.coverT = 0; h.path = null; } else h.coverCd = 2.5;
  }
  if (h.coverCd > 0) h.coverCd -= dt;

  const toP = Math.atan2(dxp, dzp);
  if (h.state === 'cover') {
    h.aimT = 0.4;
    if (h.coverPhase === 'move') {
      const arrived = goTo(h, dt, h.cover.x, h.cover.z, 6.2, false);
      h.faceAngle = arrived ? toP : Math.atan2(h.cmdX, h.cmdZ);
      if (arrived) { h.coverPhase = 'hide'; h.coverT = rand(1.6, 3.4); if (h.weapon && h.G.audio.reloadW) { /* reload while hidden */ } }
    } else if (h.coverPhase === 'hide') {
      h.cmdSpeed = 0; h.crouching = true; h.crouch = 1; h.faceAngle = toP; h.coverT -= dt;
      if (h.coverT <= 0) { h.coverPhase = 'peek'; h.coverT = rand(2.2, 3.8); h.peekDir = Math.random() < 0.5 ? -1 : 1; }
    } else {   // peek: lean out sideways until the player is visible, shoot a burst, then duck again
      h.faceAngle = toP; h.aimT = 1; h.coverT -= dt;
      if (!sees) { h.cmdX = Math.cos(toP) * h.peekDir; h.cmdZ = -Math.sin(toP) * h.peekDir; h.cmdSpeed = 1.8; }
      else shoot(h, dt, dp, true);
      if (h.coverT <= 0) { h.coverPhase = 'hide'; h.coverT = rand(1.4, 2.8); h.hurtT = 0; if (Math.random() < 0.35) { h.state = 'attack'; h.coverCd = 4; } }
    }
    return;
  }

  // open-ground fight: keep a distance, strafe, flank when there are friends
  const ideal = isCop ? 11 : 13;
  h.faceAngle = toP; h.aimT = 1;
  let mx = 0, mz = 0;
  if (dp > ideal + 4 || lost) {
    h.flankSide = h.flankSide ?? (countAllies(h, 25) >= 1 ? (h.id % 2 ? 1 : -1) : 0);
    let tx = pl.x, tz = pl.z;
    if (lost && h.mem) { tx = h.mem.x; tz = h.mem.z; }
    else if (h.flankSide && dp > ideal + 8) {   // swing around the target instead of walking straight at it
      const a = Math.atan2(-dxp, -dzp) + h.flankSide * 1.0; tx = pl.x + Math.sin(a) * ideal; tz = pl.z + Math.cos(a) * ideal;
    }
    goTo(h, dt, tx, tz, dp > 30 ? 6.3 : 4.2);
    if (lost) h.faceAngle = Math.atan2(h.cmdX, h.cmdZ);
    mx = h.cmdX; mz = h.cmdZ;
  } else if (dp < ideal - 4) { mx = -dxp / dp; mz = -dzp / dp; h.cmdSpeed = 2.4; }
  else {
    h.strafeT = (h.strafeT || 0) - dt; if (h.strafeT <= 0) { h.strafeT = rand(1, 2.5); h.strafeDir = Math.random() < 0.5 ? -1 : 1; }
    mx = Math.cos(toP) * h.strafeDir; mz = -Math.sin(toP) * h.strafeDir; h.cmdSpeed = 2.2;
  }
  h.cmdX = mx; h.cmdZ = mz;
  if (sees) shoot(h, dt, dp, false);
}

function shoot(h, dt, dp, fromCover) {
  const G = h.G, pl = G.player;
  h.fireCd -= dt;
  if (dp < 60 && h.fireCd <= 0 && !h.dead && G.hasLOS(h.x, 1.4, h.z, pl.x, 1.3, pl.z)) {
    h.fireCd = h.burstLeft > 0 ? (h.weapon.short === 'rifle' ? 0.14 : 0.28) : rand(fromCover ? 0.8 : 1.1, fromCover ? 1.6 : 2.2);
    if (h.burstLeft > 0) h.burstLeft--; else h.burstLeft = Math.floor(rand(1, 4));
    G.enemyShoot(h, pl);
  }
}
// police: low stars and a player who is not resisting -> walk up and arrest
function cuffing(h, dt, dxp, dzp, dp) {
  const G = h.G, pl = G.player;
  if (h.team === 'cop' && !pl.weaponDrawn && !pl.dead && (G.wanted <= 3 || pl.surrenderT > 0) && G.time - (G.lastShotT || -9) > 2.5 && !G.vehicle) {
    h.faceAngle = Math.atan2(dxp, dzp); h.aimT = 0.5;
    if (dp > 1.6) { goTo(h, dt, pl.x, pl.z, dp > 12 ? 6.2 : 4.4); } else h.cmdSpeed = 0;
    return true;
  }
  return false;
}

// ------------------------------------------------------------------ civilians
// Called every frame for walking / idle civilians. Returns true if it took over this frame.
export function civ(h, dt) {
  const G = h.G;
  h.aiT = (h.aiT || 0) - dt;
  if (h.aiT > 0) return false;
  h.aiT = 0.25 + Math.random() * 0.1;
  // fear spreads: a person who sees someone running away from something starts to run too
  for (const o of G.humans) {
    if (o === h || o.dead || o.team !== 'civ' || o.state !== 'flee' || !o.threat) continue;
    const d = Math.hypot(o.x - h.x, o.z - h.z); if (d > 14) continue;
    if (!G.hasLOS(h.x, 1.4, h.z, o.x, 1.4, o.z)) continue;
    h.state = 'flee'; h.fleeT = rand(4, 8); h.threat = o.threat; h.cower = Math.random() < 0.35; G.voiceAt?.(h, 'scream');
    return true;
  }
  // fast car coming straight at us: jump aside
  for (const v of G.vehicles) {
    if (!v.group.visible || v.speed < 7) continue;
    const dx = h.x - v.x, dz = h.z - v.z, d = Math.hypot(dx, dz); if (d > 11 || d < 0.5) continue;
    const ahead = (dx * Math.sin(v.h) + dz * Math.cos(v.h)) / d;           // person in front of the car
    if (ahead < 0.7) continue;
    const side = (dx * Math.cos(v.h) - dz * Math.sin(v.h)) >= 0 ? 1 : -1;
    h.dodge = { x: Math.cos(v.h) * side, z: -Math.sin(v.h) * side, t: 0.6 };
    G.voiceAt?.(h, 'gasp');
    return true;
  }
  // a body on the pavement: stop and look (a few step back)
  if (!h.gawk && !h.static && h.state === 'walk') {
    for (const o of G.humans) {
      if (!o.dead || o.deadT > 60 || o.team === 'cop') continue;
      const d = Math.hypot(o.x - h.x, o.z - h.z); if (d > 9 || !G.hasLOS(h.x, 1.5, h.z, o.x, 0.4, o.z)) continue;
      if (Math.random() < 0.5) { h.gawk = { x: o.x, z: o.z, t: rand(3, 7) }; return true; }
      h.gawkSeen = G.time;
    }
  }
  return false;
}
// movement override for civilians (dodge / gawk / cower); returns {x,z,s,face} or null
export function civMove(h, dt) {
  if (h.dodge) {
    h.dodge.t -= dt;
    if (h.dodge.t <= 0) h.dodge = null; else return { x: h.dodge.x, z: h.dodge.z, s: 7, face: null };
  }
  if (h.gawk) {
    h.gawk.t -= dt;
    if (h.gawk.t <= 0 || h.G.player.weaponDrawn && Math.hypot(h.G.player.x - h.x, h.G.player.z - h.z) < 10) { h.gawk = null; return null; }
    return { x: 0, z: 0, s: 0, face: Math.atan2(h.gawk.x - h.x, h.gawk.z - h.z) };
  }
  return null;
}
// fleeing civilians: run away for a while, then (sometimes) crouch and cower until the danger has passed
export function flee(h, dt, threatX, threatZ) {
  const G = h.G;
  if (h.cower && h.fleeT < 4) {
    h.crouching = true; h.crouch = 1;
    if (Math.hypot(threatX - h.x, threatZ - h.z) < 6) { h.cower = false; h.crouch = 0; h.crouching = false; }
    else return { x: 0, z: 0, s: 0 };
  } else { h.crouching = false; h.crouch = 0; }
  let ax = h.x - threatX, az = h.z - threatZ; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l;
  // blocked by a wall: slide along it
  if (h.blocked) { const t = ax; ax = -az * (h.id % 2 ? 1 : -1); az = t * (h.id % 2 ? 1 : -1); }
  return { x: ax, z: az, s: 5.2 };
}
