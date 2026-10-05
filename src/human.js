import * as THREE from 'three';
import { buildHuman } from './models.js';
import { N, R, SW, roadC, roadIdx } from './world.js';
import { clamp, lerp, damp, dampAngle, angDiff, rand, TAU } from './util.js';

export const WEAPONS = [
  { name: '9MM PISTOL', scope: 'iron', zoom: 1.3, short: 'pistol', clip: 12, reserve: 96, damage: 34, head: 2.4, rate: 0.16, spread: 0.006, range: 160, reload: 1.2, recoil: 0.018, auto: false, tracer: [1, 0.85, 0.5], snd: 'pistol' },
  { name: 'CARBINE', scope: 'dot', zoom: 2.2, short: 'rifle', clip: 30, reserve: 180, damage: 21, head: 1.9, rate: 0.085, spread: 0.012, range: 200, reload: 1.7, recoil: 0.011, auto: true, tracer: [0.5, 0.95, 1], snd: 'rifle' },
  { name: 'SMG', scope: 'iron', zoom: 1.4, short: 'pistol', clip: 25, reserve: 0, damage: 13, head: 1.8, rate: 0.058, spread: 0.022, range: 110, reload: 1.4, recoil: 0.008, auto: true, tracer: [1, 0.7, 0.4], snd: 'rifle' },
  { name: 'SHOTGUN', scope: 'iron', zoom: 1.25, short: 'rifle', clip: 6, reserve: 0, damage: 12, head: 1.5, rate: 0.85, spread: 0.055, range: 45, reload: 2.4, recoil: 0.04, auto: false, tracer: [1, 0.6, 0.3], snd: 'rifle', pellets: 8 },
  { name: 'SNIPER', scope: 'sniper', zoom: 6, short: 'rifle', clip: 5, reserve: 0, damage: 125, head: 3, rate: 1.1, spread: 0.0008, range: 420, reload: 2.4, recoil: 0.05, auto: false, tracer: [0.8, 1, 1], snd: 'rifle' },
];
const SW_MID = R / 2 + SW / 2;
let uid = 0;

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
    this.m.rifle.visible = this.armed && this.weapon.short === 'rifle';
  }
  get alive() { return !this.dead; }
  setWeapon(i) {
    if (i >= 100 || !WEAPONS[i]) { this.m.pistol.visible = this.m.rifle.visible = false; this.armed = false; return; }
    this.weapon = WEAPONS[i]; this.armed = true;
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
    if (this.hp <= 0) { this.die(from, src); return true; }
    if (this.m.playOnce && !this.knock && this.speed < 4 && this.m.playOnce(headshot ? 'U_Hit_Head' : 'U_Hit_Chest', false)) this.reactT = 0.4;
    if (this.team === 'civ') { this.state = 'flee'; this.fleeT = rand(6, 10); G.audio.scream(0); }
    else if (this.team === 'gang') { this.alert = 1; this.state = 'attack'; }
    return false;
  }
  die(from, src) {
    this.dead = true; this.deadT = 0; this.state = 'dead'; this.speed = 0;
    this.G.onHumanKilled?.(this, src);
    this.fallDir = rand(-1, 1);
    this.m.pistol.visible = false; this.m.rifle.visible = false;
    this.clipDeath = !!(this.m.playOnce && this.m.playOnce('U_Death01'));
    if (this.clipDeath) { this.m.body.rotation.set(0, 0, 0); this.m.body.position.y = 0; }
  }
  ragdoll(vx, vz, up = 4) { this.knock = 1; this.vx = vx; this.vz = vz; this.vy = up; }

  update(dt) {
    const G = this.G;
    if (this.hitFlash > 0) this.hitFlash -= dt;
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
      } else if (this.state === 'visit') {
        const r = G.society.visitStep(this, dt); wantX = r.x; wantZ = r.z; spd = r.s;
      } else if (this.state === 'flee') {
        this.fleeT -= dt;
        const t = this.threat || G.player;
        let ax = this.x - t.x, az = this.z - t.z; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l;
        // follow sidewalk-ish: prefer fleeing along dominant axis
        wantX = ax; wantZ = az; spd = 5.2;
        if (this.fleeT <= 0) { this.state = 'walk'; this.snapToNode(); }
      } else {
        if (this.node) {
          const [tx, tz] = this.nodePos(this.node);
          const dx = tx + (this.node.sx ? this.offset * (this.node.along ? 0 : 0) : 0) - this.x, dz = tz - this.z;
          const d = Math.hypot(dx, dz);
          if (d < 1.4) this.chooseNext(); else { wantX = dx / d; wantZ = dz / d; spd = this.stateT > 0 ? 0 : 1.5; }
        }
        if (!this.static) G.society.maybeVisit(this, dt);
        // stop & stare
        if (this.stateT > 0) this.stateT -= dt;
        else if (Math.random() < dt * 0.04) this.stateT = rand(1.5, 4);
        // startled by nearby fast cars or player gun
        if (G.player.weaponDrawn && dp < 14 && G.playerOnFoot) { this.state = 'flee'; this.fleeT = 6; this.threat = G.player; }
      }
    } else if (this.team === 'gang' || this.team === 'cop') {
      this.updateCombat(dt, dp, dxp, dzp);
      wantX = this.cmdX || 0; wantZ = this.cmdZ || 0; spd = this.cmdSpeed || 0; face = this.faceAngle;
    }
    // movement integration
    const tvx = wantX * spd, tvz = wantZ * spd;
    this.vx = damp(this.vx, tvx, 9, dt); this.vz = damp(this.vz, tvz, 9, dt);
    let nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    const r = G.world.colliders.resolve(nx, nz, this.radius, this.y);
    this.x = r.x; this.z = r.z;
    // slide blocked sidewalk walkers: if blocked, pick another node
    if (r.hit && this.team === 'civ' && this.state !== 'flee') { if (Math.random() < 0.05) this.chooseNext(); }
    this.speed = Math.hypot(this.vx, this.vz);
    // vehicles block
    for (const v of G.vehicles) {
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
    this.vy -= 22 * dt;
    this.x += this.vx * dt; this.z += this.vz * dt; this.y += this.vy * dt;
    const r = this.G.world.colliders.resolve(this.x, this.z, this.radius, this.y); this.x = r.x; this.z = r.z;
    const fy = this.floorY || 0; if (this.y <= fy) { this.y = fy; if (Math.abs(this.vy) > 3) this.vy *= -0.3; else { this.vy = 0; this.vx *= Math.exp(-6 * dt); this.vz *= Math.exp(-6 * dt); if (Math.hypot(this.vx, this.vz) < 0.3) this.knock = 0; } }
    this.group.position.set(this.x, this.y, this.z);
    if (!this.dead) { this.m.body.rotation.x += dt * 9; this.group.rotation.y = this.ry; }
    else this.group.rotation.y = this.ry;
    if (!this.knock && !this.dead) { this.m.body.rotation.x = 0; this.state = 'flee'; this.fleeT = 5; }
  }

  // armed AI
  updateCombat(dt, dp, dxp, dzp) {
    const G = this.G;
    const pl = G.player;
    this.cmdSpeed = 0; this.faceAngle = null;
    const los = dp < 80 && G.hasLOS(this.x, 1.5, this.z, pl.x, 1.4, pl.z);
    if (this.guard && this.state !== 'attack') { if (los && dp < this.detect && (pl.weaponDrawn || G.alarm)) { this.state = 'attack'; this.fireCd = rand(0.8, 1.5); G.alertGang?.(this); } else { this.cmdSpeed = 0; this.faceAngle = null; return; } }
    if (this.team === 'cop') {
      const hunt = G.wanted > 0;
      if (!hunt) { this.cmdSpeed = 0; this.faceAngle = null; return; }
      this.alert = 1;
    } else {
      if (this.state !== 'attack') {
        if (los && dp < (this.detect || 38) * (G.player.prone ? 0.3 : G.player.crouching ? 0.55 : 1)) { this.state = 'attack'; this.alert = 1; this.fireCd = rand(0.7, 1.4); G.alertGang?.(this); }
        else { this.cmdSpeed = 0; if (this.patrol) this.doPatrol(dt); return; }
      }
    }
    // attack
    const toP = Math.atan2(dxp, dzp);
    if (this.team === 'cop' && !pl.weaponDrawn && !pl.dead && (G.wanted <= 3 || pl.surrenderT > 0) && G.time - (G.lastShotT || -9) > 2.5 && !G.vehicle) {
      // player is not resisting: move in to cuff
      this.faceAngle = toP; this.aimT = 0.5;
      if (dp > 1.6) { this.cmdX = dxp / dp; this.cmdZ = dzp / dp; this.cmdSpeed = dp > 12 ? 6.2 : 4.4; } else this.cmdSpeed = 0;
      return;
    }
    const ideal = this.team === 'cop' ? 11 : 13;
    this.faceAngle = toP; this.aimT = 1;
    let mx = 0, mz = 0;
    if (dp > ideal + 4 || !los) { mx = dxp / dp; mz = dzp / dp; this.cmdSpeed = dp > 30 ? 6.3 : 4.2; }
    else if (dp < ideal - 4) { mx = -dxp / dp; mz = -dzp / dp; this.cmdSpeed = 2.4; }
    else { // strafe
      this.strafeT = (this.strafeT || 0) - dt; if (this.strafeT <= 0) { this.strafeT = rand(1, 2.5); this.strafeDir = Math.random() < 0.5 ? -1 : 1; }
      mx = Math.cos(toP) * this.strafeDir; mz = -Math.sin(toP) * this.strafeDir; this.cmdSpeed = 2.2;
    }
    this.cmdX = mx; this.cmdZ = mz;
    // shoot
    this.fireCd -= dt;
    if (los && dp < 60 && this.fireCd <= 0 && !this.dead) {
      this.fireCd = this.burstLeft > 0 ? (this.weapon.short === 'rifle' ? 0.14 : 0.28) : rand(1.1, 2.2);
      if (this.burstLeft > 0) this.burstLeft--; else this.burstLeft = Math.floor(rand(1, 4));
      G.enemyShoot(this, pl);
    }
  }
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
    const idle = clamp(1 - sp / 0.6, 0, 1), run = clamp((sp - 3.4) / 2, 0, 1), walk = clamp(1 - idle - run, 0, 1);
    const k = 1 - Math.exp(-10 * dt);
    // stance sets: retargeted UAL crouch / swim clips replace the stand set (idle+walk+run) while active
    const swimC = this.swimming, crouchC = !swimC && !this.prone && !this.lying && this.crouching !== false && this.crouch > 0.3 && !m.sit;
    const sitC = (m.sit || 0) > 0.5, airC = !sitC && !swimC && !!this.body3 && !this.body3.grounded && !this.hang && !this.mantle && !this.ladder;
    const set = sitC ? ['U_Sitting_Idle', 'U_Sitting_Idle'] : airC ? ['U_Jump_Loop', 'U_Jump_Loop'] : swimC ? ['U_Swim_Idle', 'U_Swim_Fwd'] : crouchC ? ['U_Crouch_Idle', 'U_Crouch_Fwd'] : null;
    m.sitClip = sitC && !!m.clip('U_Sitting_Idle');
    this.stanceSet = set;
    const moving = clamp(sp / 1.5, 0, 1);
    const wt = { Idle: set ? 0 : idle, Walk: set ? 0 : walk, Run: set ? 0 : run, U_Swim_Idle: 0, U_Swim_Fwd: 0, U_Crouch_Idle: 0, U_Crouch_Fwd: 0, U_Sitting_Idle: 0, U_Jump_Loop: 0 };
    if (set) { if (set[0] === set[1]) wt[set[0]] = 1; else { wt[set[0]] = 1 - moving; wt[set[1]] = moving; } }
    for (const key in wt) { const act = a[key] || (wt[key] > 0 ? m.clip(key) : null); if (act) act.weight = lerp(act.weight, wt[key], k); }
    if (set && a[set[1]]) a[set[1]].timeScale = clamp(sp / 1.6, 0.6, 1.8);
    a.Walk.timeScale = clamp(sp / 1.55, 0.6, 2.2); a.Run.timeScale = clamp(sp / 5.2, 0.8, 1.7);
    const aiming = (this.aimT > 0 || this.forceAim) && this.armed;
    this.pose = damp(this.pose, aiming ? 1 : 0, 12, dt);
    // distance LOD: fog hides far actors anyway, so skip their skinning and animation
    const cd = Math.hypot(this.x - Human.camX, this.z - Human.camZ);
    m.body.visible = cd < 75;
    const sh = cd < 38; if (sh !== m.shadowOn) { m.shadowOn = sh; for (const o of m.skinMeshes) o.castShadow = sh; }
    if (cd > 75) return;
    if (cd > 35) { this.lodT = (this.lodT || 0) + dt; if ((this.lodF = !this.lodF)) return; dt = this.lodT; this.lodT = 0; }
    // pistol-class weapons use the retargeted UAL upper-body clips (idle / aim up-neutral-down / shoot / reload); the limbs below keep walking
    const pistolish = this.armed && this.weapon && this.weapon.short === 'pistol' && !m.sit && !this.swimming && !this.prone && !this.lying;
    if (this.recoil > (this._rc || 0) + 0.4) this.shootT = 0.38;
    this._rc = this.recoil;
    if (this.shootT > 0) this.shootT -= dt;
    {
      const pitch = this.aimPitch || 0, up = clamp(pitch / 0.5, 0, 1), dn = clamp(-pitch / 0.5, 0, 1), neu = 1 - Math.max(up, dn);
      const act = pistolish ? 1 : 0, shoot = this.shootT > 0 ? 1 : 0, rel = this.reloadT > 0 ? 1 : 0;
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
    m.mixer.update(dt);
    m.applyPose(pistolish ? 0 : this.pose, this.aimPitch || 0);
    if (this.recoil > 0) { this.recoil = Math.max(0, this.recoil - dt * 8); }
    m.body.position.y = -(this.stanceSet ? 0 : this.crouch * 0.3) - (m.sitClip ? 0 : (m.sit || 0) * 0.5) - (this.swimming ? 0 : 0) - (this.prone ? 0.62 : 0) - (this.lying ? 0.62 : 0);
    if (this.punchT > 0) this.punchT -= dt;
    m.body.rotation.x = damp(m.body.rotation.x, this.swimming ? 0 : this.prone ? 1.35 : this.lying ? -1.5 : (this.punchT > 0 ? 0.35 : 0), 14, dt);
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.ry;
    if (this.aimT > 0) this.aimT -= dt * 0.5;
  }
  animate(dt, desired) {
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
