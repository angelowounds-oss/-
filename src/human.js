import * as THREE from 'three';
import { buildHuman, rifleLook } from './models.js';
import { N, R, SW, roadC, roadIdx } from './world.js';
import { clamp, lerp, damp, dampAngle, angDiff, rand, TAU } from './util.js';
import * as AI from './ai.js';
import { updateGesture, updateProc, gesture, procGesture, PROPS } from './gesture.js';

const STAFF = { cashier: ['typing', 'interact', 'fidget', 'nod'], reception: ['typing', 'listen', 'nod', 'phone'], nurse: ['listen', 'nod', 'fidget', 'wipe'] };
// small calm gestures that read well over a walk or stand
const AMBIENT = ['scratch', 'shrug', 'nod', 'phone', 'foldarms', 'fidget', 'lean'];

export const WEAPONS = [
  { name: '9MM PISTOL', scope: 'iron', zoom: 1.3, short: 'pistol', clip: 12, reserve: 96, damage: 34, head: 2.4, rate: 0.16, spread: 0.006, range: 160, reload: 1.2, recoil: 0.018, auto: false, tracer: [1, 0.85, 0.5], snd: 'pistol' },
  { name: 'CARBINE', scope: 'dot', zoom: 2.2, short: 'rifle', clip: 30, reserve: 180, damage: 21, head: 1.9, rate: 0.085, spread: 0.012, range: 200, reload: 1.7, recoil: 0.011, auto: true, tracer: [0.5, 0.95, 1], snd: 'rifle' },
  { name: 'SMG', scope: 'iron', zoom: 1.4, short: 'pistol', clip: 25, reserve: 0, damage: 13, head: 1.8, rate: 0.058, spread: 0.022, range: 110, reload: 1.4, recoil: 0.008, auto: true, tracer: [1, 0.7, 0.4], snd: 'smg' },
  { name: 'SHOTGUN', scope: 'iron', zoom: 1.25, short: 'rifle', clip: 6, reserve: 0, damage: 12, head: 1.5, rate: 0.85, spread: 0.055, range: 45, reload: 2.4, recoil: 0.04, auto: false, tracer: [1, 0.6, 0.3], snd: 'shotgun', pellets: 8 },
  { name: 'SNIPER', scope: 'sniper', zoom: 6, short: 'rifle', look: 'sniper', clip: 5, reserve: 0, damage: 125, head: 3, rate: 1.1, spread: 0.0008, range: 420, reload: 2.4, recoil: 0.05, auto: false, tracer: [0.8, 1, 1], snd: 'sniper' },
];
const SW_MID = R / 2 + SW / 2;
let uid = 0;

const _fq = new THREE.Quaternion(), _fe = new THREE.Euler();

// CHR-06a (ADR-0035): stand-set legs. Aimed and fighting actors face one way and move another, so the leg clip is picked by the way the body
// moves relative to where it faces (ahead, back steps, or a side step: the clip whose measured direction is nearest, ahead favoured and the
// current one kept within a margin), and the hips are turned by what is left over (Model.turnHips) so the feet step exactly that way. Ahead
// splits into Walk / Run / Sprint by speed. All of them play on one step phase (each at its left foot's stance), advanced so the mix carries
// the body exactly as far as it moved (distance matching on the step tables measured per body at load, assets.js measureGait): the planted
// foot stays put on the ground.
const CARD = ['Walk', 'U_Walk_Backwards', 'U_Strafe_left', 'U_Strafe_right'];
const GAIT_TS = { Walk: [0.5, 3], Run: [0.6, 1.6], U_Sprint: [0.7, 1.3], U_Walk_Backwards: [0.5, 3.4], U_Strafe_left: [0.5, 3.4], U_Strafe_right: [0.5, 3.4] };
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function stepGait(h, dt, sp, move, wt) {
  const G = h.m.gait;
  if (!G.Walk) { wt.Walk = move; h.m.act.Walk.timeScale = clamp(sp / 0.94, 0.5, 3); return; }
  const vf = h.vx * Math.sin(h.ry) + h.vz * Math.cos(h.ry), vl = h.vx * Math.cos(h.ry) - h.vz * Math.sin(h.ry);
  if (sp > 0.15) h.gaitDir = Math.atan2(vl, vf);
  const th = h.gaitDir || 0;
  let cur = h.gaitCard || 'Walk', best = cur, bs = 1e9;
  for (const n of CARD) { if (!G[n]) continue; const s = Math.abs(wrapA(th - G[n].dir)) - (n === 'Walk' ? 0.26 : 0) - (n === cur ? 0.12 : 0); if (s < bs) { bs = s; best = n; } }
  h.gaitCard = cur = best;
  // ahead: Walk -> Run from 3.4 m/s, Run -> Sprint from 6.5 m/s
  const r = G.Run ? clamp((sp - 3.4) / 2, 0, 1) : 0, s = G.U_Sprint ? clamp((sp - 6.5) / 1.5, 0, 1) : 0;
  const share = cur === 'Walk' ? { Walk: 1 - r, Run: r * (1 - s), U_Sprint: r * s } : { [cur]: 1 };
  // the phase moves on by what carries the body sp*dt at this point of the mix's step table; the cadence limits (each active clip's
  // playback range) scale the whole cycle, so a clip past its range slides evenly rather than in one part of the step
  const ph = h.gaitPh ?? Math.random();
  let stride = 0, slope = 0, lo = 0, hi = 1e9;
  for (const n in share) {
    const w = share[n]; if (w <= 0) continue; const g = G[n]; wt[n] = move * w;
    stride += w * g.stride; slope += w * g.step[(((ph + g.off) % 1) * g.step.length) | 0];
    if (w > 0.05) { lo = Math.max(lo, GAIT_TS[n][0] / g.dur); hi = Math.min(hi, GAIT_TS[n][1] / g.dur); }
  }
  h.gaitPh = (ph + dt * clamp(sp / stride, lo, Math.max(lo, hi)) * stride / slope) % 1;
}
// after the weights eased: puts the leg clips on the shared phase and returns the hip turn, each clip's leftover angle by the weight it plays at
// (so a change of clip turns the hips over as the clips cross-fade, and an actor at a standstill keeps them straight)
function syncGait(h) {
  const G = h.m.gait, a = h.m.act, th = h.gaitDir || 0, ph = h.gaitPh || 0; let warp = 0;   // no phase yet: never stood (sat, swam ... since spawn)
  for (const n in GAIT_TS) {
    const ac = a[n], g = G[n]; if (!ac || !g) continue;
    ac.timeScale = 0; ac.time = ((ph + g.off) % 1) * g.dur;
    if (ac.weight > 0.001 && h.speed > 0.15) warp += ac.weight * clamp(wrapA(th - g.dir), -1.2, 1.2);
  }
  return warp;
}

// CHR-06b (ADR-0035): turning in place. Standing, the legs keep their own heading (legYaw) while the body (ry) turns: the hips stay over
// the feet and the spine takes the twist. Past TURN_AT the legs step round with a turn clip (one that really turns that way, of the size
// nearest the twist it is heading for; measured in assets.js measureTurns), its turn spread over what is left so it ends square under the
// body. A twist below that relaxes slowly once the body holds still; on the move the legs come square at once and the gait warp steers them.
const TURNS = ['U_Turn_Left_90', 'U_Turn_Right_90', 'U_Turn_Left_180', 'U_Turn_Right_180'];
const TURN_AT = 0.87, TURN_MAX = 2, TURN_RATE = 1.8;
const yawAt = (t, arr, time) => { const u = clamp(time / t.dur, 0, 1) * (arr.length - 1), i = Math.min(arr.length - 2, u | 0); return arr[i] + (arr[i + 1] - arr[i]) * (u - i); };
function stepTurn(h, dt, still, wt) {
  const T = h.m.turn;
  if (h.legYaw === undefined) h.legYaw = h.ry;
  const dry = wrapA(h.ry - (h.ryPrev ?? h.ry)); h.ryPrev = h.ry;
  h.ryStill = Math.abs(dry) < 0.2 * dt ? (h.ryStill || 0) + dt : 0;
  let off = wrapA(h.legYaw - h.ry);
  if (!still) { h.turnClip = null; off *= Math.exp(-12 * dt); }
  else if (h.turnClip) {
    // the clip's own turn this frame, scaled so what is left of it covers what is left of the twist
    const t = T[h.turnClip], y0 = yawAt(t, t.yaw, h.turnT); h.turnT = Math.min(t.t1, h.turnT + dt * TURN_RATE);
    const rest = yawAt(t, t.yaw, t.t1) - y0, s = Math.abs(rest) > 0.05 ? clamp(-off / rest, 0.5, 1.6) : 1;
    off += s * (yawAt(t, t.yaw, h.turnT) - y0);
    if (h.turnT >= t.t1) h.turnClip = null;
  } else if (Math.abs(off) > TURN_AT) {
    // sized for where the twist is heading (the body's turn rate 0.12 s on), so a quick about-face steps the 180
    const want = dt > 0 ? off - (dry / dt) * 0.12 : off;
    let best = null, bs = 1e9;
    for (const n of TURNS) { const t = T[n]; if (!t || t.end * off >= 0) continue; const s = Math.abs(Math.log(Math.abs(want / t.end))); if (s < bs) { bs = s; best = n; } }
    if (best) { h.turnClip = h.turnLast = best; h.turnT = T[best].t0; }
  } else if (h.ryStill > 1) off *= Math.exp(-dt);
  off = clamp(off, -TURN_MAX, TURN_MAX);   // past that the body drags the legs round
  h.legYaw = h.ry + off; h.legOff = off;
  if (h.turnClip) { wt[h.turnClip] = wt.Idle; wt.Idle = 0; }
}
// after the weights eased: holds the turn clips on their set time and keeps how far they turn the pelvis and the chest by the weight they play at
function syncTurn(h) {
  const T = h.m.turn, a = h.m.act; let p = 0, c = 0;
  for (const n of TURNS) {
    const ac = a[n], t = T[n]; if (!ac || !t) continue;
    ac.timeScale = 0; if (n === h.turnLast) ac.time = h.turnT;
    // the mixer blends a turned pose with the others the short way round, so a 180 held past half a turn blends from the other side
    if (ac.weight > 0.001) { const y = yawAt(t, t.yaw, ac.time), w = wrapA(y); p += ac.weight * w; c += ac.weight * (w + yawAt(t, t.chest, ac.time) - y); }
  }
  h.turnYaw = p; h.turnChest = c;
}

export class Human {
  constructor(G, team, o = {}) {
    this.G = G; this.team = team; this.id = ++uid;
    const look = o.look || {};
    this.m = buildHuman(look);
    this.group = this.m.group;
    this.x = 0; this.z = 0; this.y = 0; this.vy = 0; this.ry = rand(0, TAU);
    this.vx = 0; this.vz = 0;
    this.hp = o.hp ?? 60; this.maxHp = this.hp;
    this.dead = false; this.deadT = 0; this.hidden = false;
    this.state = 'walk'; this.stateT = 0; this.phase = Math.random() * 10;
    this.speed = 0; this.moveSpeed = 0;
    this.node = null; this.target = null;
    this.armed = !!o.weapon; this.weapon = o.weapon ? WEAPONS[o.weapon - 1] : null;
    this.fireCd = rand(0, 1); this.burst = 0;
    this.threat = null; this.fleeT = 0;
    this.offset = rand(-1.6, 1.6);
    this.cash = Math.floor(rand(8, 60));
    this.aimT = 0; this.alert = 0;
    this.radius = 0.35;
    this.crouch = 0;
    this.pose = 0;
    this.group.userData.human = this;
    this.inCar = null;
    this.m.pistol.visible = this.armed && this.weapon.short === 'pistol';
    this.m.rifle.visible = this.armed && this.weapon.short === 'rifle'; rifleLook(this.m.rifle, this.weapon?.look === 'sniper');
  }
  get alive() { return !this.dead; }
  setWeapon(i) {
    if (i >= 100 || !WEAPONS[i]) { this.m.pistol.visible = this.m.rifle.visible = false; this.armed = false; return; }
    this.weapon = WEAPONS[i]; this.armed = true; rifleLook(this.m.rifle, this.weapon.look === 'sniper');
    this.m.pistol.visible = this.weapon.short === 'pistol'; this.m.rifle.visible = this.weapon.short === 'rifle';
  }
  // ---- sidewalk graph for civilians ----
  placeOnSidewalk(i, j, sx, sz) { this.node = { i, j, sx, sz }; this.x = roadC(i) + sx * SW_MID + this.offset; this.z = roadC(j) + sz * SW_MID; this.chooseNext(); }
  nodePos(n) { return [roadC(n.i) + n.sx * SW_MID, roadC(n.j) + n.sz * SW_MID]; }
  chooseNext() {
    const n = this.node; if (!n) return;
    const opts = [];
    // along road j (east-west) heading +x / -x
    if (n.i < N) opts.push([{ i: n.i + 1, j: n.j, sx: -1, sz: n.sz }, 2]);
    if (n.i > 0) opts.push([{ i: n.i - 1, j: n.j, sx: 1, sz: n.sz }, 2]);
    if (n.j < N) opts.push([{ i: n.i, j: n.j + 1, sx: n.sx, sz: -1 }, 2]);
    if (n.j > 0) opts.push([{ i: n.i, j: n.j - 1, sx: n.sx, sz: 1 }, 2]);
    opts.push([{ i: n.i, j: n.j, sx: -n.sx, sz: n.sz }, 1.2], [{ i: n.i, j: n.j, sx: n.sx, sz: -n.sz }, 1.2]);
    // prefer continuing straight
    const prev = this.prevNode;
    let tot = 0; for (const o of opts) { o.w = o[1] * (prev && o[0].i === prev.i && o[0].j === prev.j && o[0].sx === prev.sx && o[0].sz === prev.sz ? 0.15 : 1); tot += o.w; }
    let t = Math.random() * tot, pick = opts[0][0];
    for (const o of opts) { t -= o.w; if (t <= 0) { pick = o[0]; break; } }
    this.prevNode = n; this.node = pick;
  }
  hurt(dmg, from, headshot, src) {
    if (this.dead) return;
    const G = this.G;
    this.hp -= dmg;
    this.hitFlash = 0.12;
    if (this.team === 'civ' || this.team === 'gang') { this.threat = from; }
    if (this.team !== 'civ') { this.hurtT = 1.6; if (from && from.x != null) this.mem = { x: from.x, z: from.z, vx: from.vx || 0, vz: from.vz || 0, t: G.time }; }
    if (this.hp <= 0) { this.die(from, src); return true; }
    if (this.m.playOnce && !this.knock && this.speed < 4 && this.m.playOnce(headshot ? 'U_Hit_Head' : 'U_Hit_Chest', false)) this.reactT = 0.4;
    if (this.team === 'civ') { this.state = 'flee'; this.fleeT = rand(6, 10); G.voiceAt?.(this, 'scream'); }
    else if (this.team === 'gang') { this.alert = 1; if (this.state !== 'cover' && this.state !== 'retreat') this.state = 'attack'; G.alertGang?.(this, 'hit'); }
    return false;
  }
  die(from, src) {
    const sp0 = this.speed;
    this.dead = true; this.deadT = 0; this.state = 'dead'; this.speed = 0;
    this.G.onHumanKilled?.(this, src);
    this.fallDir = rand(-1, 1);
    this.m.pistol.visible = false; this.m.rifle.visible = false;
    // physical ragdoll when there is room for one; otherwise the death clip
    const lh = this.lastHit && this.G.time - this.lastHit.t < 0.1 ? this.lastHit : null; this.speed = sp0;
    const rag = this.G.ragdolls?.spawn(this, { cause: lh ? 'bullet' : 'other', alive: false, hit: lh });
    this.speed = 0;
    if (rag) { this.clipDeath = false; return; }
    this.clipDeath = !!(this.m.playOnce && this.m.playOnce('U_Death01'));
    if (this.clipDeath) { this.m.body.rotation.set(0, 0, 0); this.m.body.position.y = 0; }
  }
  ragdoll(vx, vz, up = 4) {
    if (this.G.ragdolls?.knock(this, vx, vz, up)) return;
    this.knock = 1; this.vx = vx; this.vz = vz; this.vy = up;
  }

  update(dt) {
    const G = this.G;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.rag) {   // physical ragdoll owns the body: skeleton is driven by the physics
      if (this.dead) { this.deadT += dt; if (this.deadT > 22) this.group.scale.setScalar(Math.max(0.001, 1 - (this.deadT - 22) * 0.8)); return; }
      if (this.rag.getUpTick(dt)) return;
      return;
    }
    if (this.dead) {
      this.deadT += dt;
      const k = Math.min(1, this.deadT * 3);
      if (this.clipDeath) {
        const cd = Math.hypot(this.x - Human.camX, this.z - Human.camZ);
        if (cd < 75) { this.m.mixer.update(dt); this.m.applyPose(0, 0); }
        if (this.knock) { this.stepKnock(dt); }
        if (this.deadT > 22) this.group.scale.setScalar(Math.max(0.001, 1 - (this.deadT - 22) * 0.8));
        return;
      }
      this.m.body.rotation.x = lerp(this.m.body.rotation.x, -1.5, 1 - Math.exp(-10 * dt));
      this.m.body.rotation.z = lerp(this.m.body.rotation.z, this.fallDir * 0.4, 1 - Math.exp(-8 * dt));
      this.m.body.position.y = lerp(this.m.body.position.y, 0.17, 1 - Math.exp(-10 * dt));
      this.m.legL.rotation.x = this.m.legR.rotation.x = 0.2;
      if (this.knock) { this.stepKnock(dt); }
      if (this.deadT > 22) this.group.scale.setScalar(Math.max(0.001, 1 - (this.deadT - 22) * 0.8));
      return;
    }
    if (this.knock) { this.stepKnock(dt); if (this.knock) return; }
    const px = G.player.x, pz = G.player.z;
    const dxp = px - this.x, dzp = pz - this.z, dp = Math.hypot(dxp, dzp);
    let wantX = 0, wantZ = 0, spd = 0, face = null;
    if (this.team === 'civ' && this.static && this.state !== 'flee') {
      face = this.lookAtPlayer && dp < 9 ? Math.atan2(dxp, dzp) : null;
    } else if (this.team === 'civ') {
      if (this.report && this.state !== 'flee') {
        this.report.t -= dt; face = Math.atan2(dxp, dzp);
        if (this.report.t <= 0) { G.addHeat(this.report.heat); G.toast('신고가 접수되었다', '경찰이 출동한다'); this.report = null; this.state = 'walk'; }
      } else if (this.trip) {
        const r = G.society.tripStep(this, dt); wantX = r.x; wantZ = r.z; spd = r.s;
      } else if (this.state === 'route' && this.citizen && G.citizens) {
        const r = G.citizens.steer(this); wantX = r.x; wantZ = r.z; spd = r.s;
      } else if (this.state === 'gone') {
        spd = 0;
      } else if (this.state === 'visit') {
        const r = G.society.visitStep(this, dt); wantX = r.x; wantZ = r.z; spd = r.s;
      } else if (this.state === 'flee') {
        this.fleeT -= dt;
        const t = this.threat || G.player;
        const f = AI.flee(this, dt, t.x, t.z); wantX = f.x; wantZ = f.z; spd = f.s;
        if (this.fleeT <= 0) { if (this.citizen && !this.static) this.state = 'route'; else { this.state = 'walk'; this.snapToNode(); } }
      } else {
        const cm = AI.civMove(this, dt);
        if (cm) { wantX = cm.x; wantZ = cm.z; spd = cm.s; face = cm.face; }
        else if (this.node) {
          const [tx, tz] = this.nodePos(this.node);
          const dx = tx + (this.node.sx ? this.offset * (this.node.along ? 0 : 0) : 0) - this.x, dz = tz - this.z;
          const d = Math.hypot(dx, dz);
          if (d < 1.4) this.chooseNext(); else { wantX = dx / d; wantZ = dz / d; spd = this.stateT > 0 ? 0 : 1.5; }
        }
        if (!this.static) G.society.maybeVisit(this, dt);
        if (!cm) AI.civ(this, dt);
        // stop & stare
        if (this.stateT > 0) this.stateT -= dt;
        else if (Math.random() < dt * 0.04) this.stateT = rand(1.5, 4);
        // startled by nearby fast cars or player gun
        if (G.player.weaponDrawn && dp < 14 && G.playerOnFoot) { this.state = 'flee'; this.fleeT = 6; this.threat = G.player; }
      }
    } else if (this.team === 'gang' || this.team === 'cop') {
      this.updateCombat(dt);
      wantX = this.cmdX || 0; wantZ = this.cmdZ || 0; spd = this.cmdSpeed || 0; face = this.faceAngle;
    }
    // movement integration
    const tvx = wantX * spd, tvz = wantZ * spd;
    this.vx = damp(this.vx, tvx, 9, dt); this.vz = damp(this.vz, tvz, 9, dt);
    let nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    const r = G.world.colliders.resolve(nx, nz, this.radius, this.y);
    this.x = r.x; this.z = r.z; this.blocked = !!r.hit;
    // slide blocked sidewalk walkers: if blocked, pick another node
    if (r.hit && this.team === 'civ' && this.state !== 'flee') { if (Math.random() < 0.05) this.chooseNext(); }
    this.speed = Math.hypot(this.vx, this.vz);
    // vehicles block
    const vls = G.vehicles;
    for (let vi = 0; vi < vls.length; vi++) {
      const v = vls[vi];
      if (!v.group.visible) continue;
      const dx = this.x - v.x, dz = this.z - v.z;
      if (Math.abs(dx) > 4 || Math.abs(dz) > 4) continue;
      const s = Math.sin(v.h), c = Math.cos(v.h);
      const lf = dx * s + dz * c, ll = dx * c - dz * s;
      const hl = v.L / 2 + this.radius, hw = v.W / 2 + this.radius;
      if (Math.abs(lf) < hl && Math.abs(ll) < hw) {
        // push out nearest side
        if (hl - Math.abs(lf) < hw - Math.abs(ll)) { const k = Math.sign(lf) * hl; this.x += s * (k - lf); this.z += c * (k - lf); }
        else { const k = Math.sign(ll) * hw; this.x += c * (k - ll); this.z -= s * (k - ll); }
      }
    }
    // facing
    if (face != null) this.ry = dampAngle(this.ry, face, 12, dt);
    else if (this.speed > 0.4) this.ry = dampAngle(this.ry, Math.atan2(this.vx, this.vz), 9, dt);
    this.animate(dt, spd);
  }
  snapToNode() {
    // pick nearest sidewalk corner as new node
    const G = this.G;
    let best = null, bd = 1e9;
    const i0 = roadIdx(this.x), j0 = roadIdx(this.z);
    for (let i = Math.max(0, i0 - 1); i <= Math.min(N, i0 + 1); i++) for (let j = Math.max(0, j0 - 1); j <= Math.min(N, j0 + 1); j++) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const n = { i, j, sx, sz }; const [x, z] = this.nodePos(n); const d = Math.hypot(x - this.x, z - this.z); if (d < bd) { bd = d; best = n; }
    }
    this.node = best; this.prevNode = null;
  }
  stepKnock(dt) {
    this.vy -= 9.81 * dt; this.vy -= Math.sign(this.vy) * this.vy * this.vy * (9.81 / 3025) * dt;
    this.x += this.vx * dt; this.z += this.vz * dt; this.y += this.vy * dt;
    const r = this.G.world.colliders.resolve(this.x, this.z, this.radius, this.y); this.x = r.x; this.z = r.z;
    const fy = this.floorY || 0; if (this.y <= fy) { this.y = fy; if (this.vy < -9 && !this.dead) this.hurt((-this.vy - 9) * (-this.vy - 9) * 1.5, null, false, null); if (Math.abs(this.vy) > 3) this.vy *= -0.3; else { this.vy = 0; this.vx *= Math.exp(-6 * dt); this.vz *= Math.exp(-6 * dt); if (Math.hypot(this.vx, this.vz) < 0.3) this.knock = 0; } }
    this.group.position.set(this.x, this.y, this.z);
    if (!this.dead) { this.m.body.rotation.x += dt * 9; this.group.rotation.y = this.ry; }
    else this.group.rotation.y = this.ry;
    if (!this.knock && !this.dead) { this.m.body.rotation.x = 0; this.state = 'flee'; this.fleeT = 5; }
  }

  // armed AI
  updateCombat(dt) { AI.combat(this, dt); }
  doPatrol(dt) {
    this.patrolT = (this.patrolT || 0) - dt;
    if (this.patrolT <= 0) { this.patrolT = rand(2, 5); const a = rand(0, TAU); this.pdx = Math.sin(a); this.pdz = Math.cos(a); this.pmove = Math.random() < 0.6; }
    if (this.pmove) { this.cmdX = this.pdx; this.cmdZ = this.pdz; this.cmdSpeed = 1.2; this.faceAngle = Math.atan2(this.pdx, this.pdz); }
    // keep near home
    if (this.home) { const dx = this.home.x - this.x, dz = this.home.z - this.z, d = Math.hypot(dx, dz); if (d > 12) { this.cmdX = dx / d; this.cmdZ = dz / d; this.cmdSpeed = 1.6; } }
  }

  animateSkinned(dt) {
    const m = this.m, a = m.act, sp = this.speed;
    if (this.reactT > 0) {
      this.reactT -= dt;
      if (this.reactT <= 0) { m.stopOnce(); a.Idle.weight = 1; }
      else { m.mixer.update(dt); m.applyPose(0, 0); this.group.position.set(this.x, this.y, this.z); this.group.rotation.y = this.ry; return; }
    }
    if (m.onceName && !this.dead) m.stopOnce();
    const idle = clamp(1 - sp / 0.6, 0, 1);
    const k = 1 - Math.exp(-10 * dt);
    // stance sets: retargeted UAL crouch / swim clips replace the stand set (idle+walk+run) while active
    const swimC = this.swimming, crouchC = !swimC && !this.prone && !this.lying && this.crouching !== false && this.crouch > 0.3 && !m.sit;
    const sitC = (m.sit || 0) > 0.5, airC = !sitC && !swimC && !!this.body3 && !this.body3.grounded && !this.hang && !this.mantle && !this.ladder;
    const crawlC = !swimC && !sitC && this.prone && !!m.clip('U_Crawl');
    this.crawling = crawlC;
    const hangC = !!this.hang && !!m.clip('U_Ledge_Hang'), ladC = !hangC && !!(this.mantle && this.mantle.ladder) && !!m.clip('U_Climb_Ladder');
    const set = hangC ? ['U_Ledge_Hang', 'U_Ledge_Hang'] : ladC ? ['U_Ladder_Idle', 'U_Climb_Ladder'] : sitC ? ['U_Sitting_Idle', 'U_Sitting_Idle'] : airC ? ['U_Jump', 'U_Jump'] : swimC ? ['U_Swim_Idle', 'U_Swim_Fwd'] : crawlC ? ['U_Crawl', 'U_Crawl'] : crouchC ? ['U_Crouch_Idle', 'U_Crouch_Fwd'] : null;
    m.sitClip = sitC && !!m.clip('U_Sitting_Idle');
    this.stanceSet = set;
    const moving = ladC ? 1 : clamp(sp / 1.5, 0, 1);
    const wt = { Idle: set ? 0 : idle, Walk: 0, Run: 0, U_Sprint: 0, U_Walk_Backwards: 0, U_Strafe_left: 0, U_Strafe_right: 0, U_Turn_Left_90: 0, U_Turn_Right_90: 0, U_Turn_Left_180: 0, U_Turn_Right_180: 0, U_Swim_Idle: 0, U_Swim_Fwd: 0, U_Crouch_Idle: 0, U_Crouch_Fwd: 0, U_Sitting_Idle: 0, U_Jump: 0, U_Crawl: 0, U_Ledge_Hang: 0, U_Ladder_Idle: 0, U_Climb_Ladder: 0 };
    if (set) { if (set[0] === set[1]) wt[set[0]] = 1; else { wt[set[0]] = 1 - moving; wt[set[1]] = moving; } }
    else stepGait(this, dt, sp, 1 - idle, wt);
    stepTurn(this, dt, !set && sp < 0.15 && !m.rideOn && !this.dead, wt);
    // CHR-06b: the push on the ground that curves or changes the pace, in the body's frame (smoothed: the player's velocity comes from physics steps)
    if (dt > 0) {
      const ax = (this.vx - (this._pvx ?? this.vx)) / dt, az = (this.vz - (this._pvz ?? this.vz)) / dt, s = Math.sin(this.ry), c = Math.cos(this.ry);
      this.accF = damp(this.accF || 0, ax * s + az * c, 6, dt); this.accL = damp(this.accL || 0, ax * c - az * s, 6, dt);
    }
    this._pvx = this.vx; this._pvz = this.vz;
    for (const key in wt) { const act = a[key] || (wt[key] > 0 ? m.clip(key) : null); if (act) act.weight = lerp(act.weight, wt[key], k); }
    if (set && a[set[1]]) a[set[1]].timeScale = crawlC ? clamp(sp / 0.8, 0, 1.6) : set[1] === 'U_Crouch_Fwd' ? clamp(sp / 0.66, 0.6, 3) : clamp(sp / 1.6, 0.6, 1.8);
    // pelvis to where the steps go (gait warp) or where the feet stand (turn in place), net of what a turn clip turns it itself; chest to ry
    syncTurn(this);
    const hipTurn = (this.hipTurn = syncGait(this) + this.legOff - this.turnYaw), backTurn = hipTurn + this.turnChest;
    const aiming = (this.aimT > 0 || this.forceAim) && this.armed;
    this.pose = damp(this.pose, aiming ? 1 : 0, 12, dt);
    // distance LOD: fog hides far actors anyway, so skip their skinning and animation
    const cd = Math.hypot(this.x - Human.camX, this.z - Human.camZ);
    m.body.visible = cd < 75;
    const sh = cd < 38; if (sh !== m.shadowOn) { m.shadowOn = sh; for (const o of m.skinMeshes) o.castShadow = sh; }
    if (cd > 75) return;
    if (cd > 35) { this.lodT = (this.lodT || 0) + dt; if ((this.lodF = !this.lodF)) return; dt = this.lodT; this.lodT = 0; }
    // pistol-class weapons use the retargeted UAL upper-body clips (idle / aim up-neutral-down / shoot / reload); the limbs below keep walking
    const freeStance = !m.sit && !this.swimming && !this.prone && !this.lying && !m.rideOn;
    // a gesture or procedural arm motion takes the arms from the held-weapon pose until the weapon is raised again
    const busy = !!this.proc || (!!this.gestUB && !aiming);
    const pistolish = this.armed && this.weapon && this.weapon.short === 'pistol' && freeStance && !busy;
    const riflish = this.armed && this.weapon && this.weapon.short === 'rifle' && freeStance && !!m.setRifleMode && !busy;
    if (m.setRifleMode) m.setRifleMode(riflish);
    if (this.recoil > (this._rc || 0) + 0.4) {
      this.shootT = 0.38;
      if (riflish && this.weapon.pellets) this.pumpT = 0.55;           // shotgun: rack the pump
      if (riflish && this.weapon.name === 'SNIPER') this.boltT = 0.8;  // sniper: work the bolt
    }
    if (this.pumpT > 0) this.pumpT -= dt; if (this.boltT > 0) this.boltT -= dt;
    this._rc = this.recoil;
    if (this.shootT > 0) this.shootT -= dt;
    {
      const pitch = this.aimPitch || 0, up = clamp(pitch / 0.5, 0, 1), dn = clamp(-pitch / 0.5, 0, 1), neu = 1 - Math.max(up, dn);
      const act = pistolish || riflish ? 1 : 0, shoot = this.shootT > 0 ? 1 : 0, rel = this.reloadT > 0 ? 1 : 0;
      const base = act * (rel ? 0 : 1) * (shoot ? 0 : 1), aimK = aiming ? 1 : 0;
      const tw = { UB_Pistol_Idle: base * (1 - aimK), UB_Pistol_Aim_Up: base * aimK * up, UB_Pistol_Aim_Neutral: base * aimK * neu, UB_Pistol_Aim_Down: base * aimK * dn, UB_Pistol_Shoot: act * shoot, UB_Pistol_Reload: act * rel * (1 - shoot) };
      for (const key in tw) {
        let ac = m.act[key]; if (!ac && tw[key] > 0) ac = m.clip(key); if (!ac) continue;
        if (key === 'UB_Pistol_Shoot' && shoot && this.shootT > 0.36) { ac.reset(); ac.play(); }
        if (key === 'UB_Pistol_Reload' && rel && !this._rl) { ac.reset(); ac.play(); }
        ac.weight = lerp(ac.weight, tw[key] * 40, 1 - Math.exp(-14 * dt)); if (ac.weight < 0.4 && tw[key] === 0) ac.weight = 0;
      }
      this._rl = rel;
    }
    // ambient gestures for calm citizens near the player so crowds do not move in lockstep; counter staff use work motions
    const idleStaff = this.static && this.state === 'stand' && !this.scared && !this.sleeping && !this.lying && !this.guard;
    if ((this.citizen || idleStaff) && !this.gestUB && !this.proc && !this.armed && !this.fleeT && (this.state === 'route' || idleStaff) && !this.dead) {
      this._ambT = (this._ambT === undefined ? 4 + Math.random() * 14 : this._ambT) - dt;
      if (this._ambT <= 0) {
        this._ambT = 12 + Math.random() * 25;
        const G = this.G, pl = G && G.player;
        if (pl && Math.hypot(this.x - pl.x, this.z - pl.z) < 45) {
          const list = STAFF[this.role] || AMBIENT, pick = list[(Math.random() * list.length) | 0];
          if (!(idleStaff && procGesture(this, pick))) gesture(this, pick, { upper: true, moving: idleStaff });
        }
      }
    }
    if (this.gestUB) updateGesture(this, dt, aiming);
    if (!this.gestUB && !(this.reactT > 0)) this.gestName = null;
    if (m.setProp) m.setProp((this.gestUB || this.reactT > 0) && !this.dead ? PROPS[this.gestName] || null : null);
    if (m.setMelee) m.setMelee(this.melee && this.cur === 9 ? this.melee.name : null);
    if (m.unturnHips) m.unturnHips();
    m.mixer.update(dt);
    if ((Math.abs(hipTurn) > 0.01 || Math.abs(backTurn) > 0.01) && m.turnHips) m.turnHips(hipTurn, backTurn);
    m.applyPose(pistolish || riflish ? 0 : this.pose, this.aimPitch || 0);
    if (this.proc) updateProc(this, dt);
    if (riflish) {
      const ph = (t, len, delay) => (t > 0 ? Math.max(0, Math.min(1, (len - t - delay) / (len - delay))) : 0);
      m.rifleIK(this.pose, this.aimPitch || 0, { recoil: this.recoil || 0, pump: this.pumpT > 0 ? Math.sin(ph(this.pumpT, 0.55, 0.12) * Math.PI) : 0, bolt: ph(this.boltT, 0.8, 0.15), reload: this.reloadT > 0 && this.weapon.reload ? 1 - this.reloadT / this.weapon.reload : 0 });
    }
    { const sl = m.pistol.userData.slide; if (sl) sl.node.position.x = sl.x0 - Math.min(1, this.recoil || 0) * 0.028; }
    if (this.recoil > 0) { this.recoil = Math.max(0, this.recoil - dt * 8); }
    m.body.position.y = -(this.stanceSet ? 0 : this.crouch * 0.3) - (m.sitClip ? 0 : (m.sit || 0) * 0.5) - (this.swimming ? 0 : 0) - (this.prone && !this.crawling ? 0.62 : 0) - (this.lying ? 0.62 : 0);
    if (this.punchT > 0) this.punchT -= dt;
    const freefall = !!this.body3 && !this.body3.grounded && !this.swimming && !this.hang && (this.vy || 0) < -9;
    // CHR-06b: lean as far as that push tips a body (atan(a/g)), pivoting at the feet: into a curve from a walk up (12 deg at most), and
    // forward or back with a change of pace by about a third of it (7 deg at most), less from a standstill
    const lean = !this.stanceSet && !m.rideOn && !this.dead && !this.prone && !this.lying && !this.swimming ? 1 : 0;
    const leanZ = -lean * clamp(Math.atan(this.accL / 9.81) * clamp((sp - 1) / 3, 0, 1), -0.21, 0.21);
    const leanX = lean * clamp(Math.atan(this.accF / 9.81) * 0.35, -0.12, 0.12) * clamp(0.3 + sp / 3, 0.3, 1);
    m.body.rotation.z = damp(m.body.rotation.z, leanZ, 10, dt);
    m.body.rotation.x = damp(m.body.rotation.x, this.swimming ? 0 : this.prone && !this.crawling ? 1.35 : this.lying ? -1.5 : freefall ? 0.45 : (this.punchT > 0 ? 0.35 : 0) + leanX, freefall ? 3 : 14, dt);
    // freefall: arms and legs flail against the wind
    if (freefall && m.bones) { const t = performance.now() * 0.001, B = m.bones, a = 0.55 + clamp((-this.vy - 9) / 20, 0, 1) * 0.5;
      const sw = (b, x, y, z) => { if (b) { _fq.setFromEuler(_fe.set(x, y, z)); b.quaternion.multiply(_fq); } };
      sw(B.LeftArm, 0, 0, Math.sin(t * 9) * a - 0.6); sw(B.RightArm, 0, 0, -Math.sin(t * 9 + 1) * a + 0.6);
      sw(B.LeftForeArm, 0, 0, Math.sin(t * 7) * 0.4); sw(B.RightForeArm, 0, 0, -Math.sin(t * 7 + 2) * 0.4);
      sw(B.LeftUpLeg, Math.sin(t * 6) * a * 0.6, 0, 0); sw(B.RightUpLeg, -Math.sin(t * 6) * a * 0.6, 0, 0); }
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.ry;
    if (this.aimT > 0) this.aimT -= dt * 0.5;
  }
  animate(dt, desired) {
    if (this.rag && this.rag.state !== 'GETUP') return;   // the ragdoll drives the skeleton
    if (this.m.skinned) return this.animateSkinned(dt);
    const m = this.m;
    this.phase += this.speed * dt * 2.1;
    const sw = Math.sin(this.phase), amp = clamp(this.speed / 3.2, 0, 1.25);
    m.legL.rotation.x = sw * 0.75 * amp; m.legR.rotation.x = -sw * 0.75 * amp;
    const aiming = this.aimT > 0 || this.forceAim;
    if (aiming && this.armed) {
      this.pose = damp(this.pose, 1, 14, dt);
    } else this.pose = damp(this.pose, 0, 10, dt);
    const swingA = -sw * 0.6 * amp * (1 - this.pose);
    m.armL.rotation.x = lerp(-swingA, -1.35, this.pose * 0.9); m.armL.rotation.z = lerp(0, 0.35, this.pose);
    m.armR.rotation.x = lerp(swingA, -1.5 - (this.recoil || 0) * 1.5, this.pose); m.armR.rotation.z = lerp(0, -0.05, this.pose);
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 8);
    m.body.rotation.x = lerp(0, 0.12 * clamp(this.speed / 5, 0, 1), 1) + (this.pitchLean || 0);
    m.body.rotation.z = 0;
    m.body.position.y = Math.abs(Math.cos(this.phase)) * 0.04 * amp - this.crouch * 0.3;
    m.torso.rotation.y = this.pose * 0.25;
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.ry;
    if (this.aimT > 0) this.aimT -= dt * 0.5;
  }
}
Human.camX = 0; Human.camZ = 0;
