import { clamp, rand } from './util.js';

// Vehicle <-> person physics on foot: bailing out of a moving car, and standing / riding on a car roof.
//  - leaving a moving vehicle (F) keeps the vehicle's speed: below 4 m/s you simply step out, 4..9 a stumble or a roll (hold Z),
//    above that a tumbling ragdoll with fall damage from the speed (8 m/s ~ nothing, 14 m/s ~ 18, 20 m/s ~ 72; a roll takes 65 % off)
//  - a stopped / slow car can be climbed onto; on the roof the person is carried with the car (position and turning), and a hard brake,
//    sharp swerve or flipped car throws them off (lie flat with Z to hold on)
const MOUNT_MAX = 6;          // m/s: fastest car you can still climb onto
const THROW_ACC = 10;         // m/s^2 that shakes a standing rider off
const THROW_ACC_LOW = 17;     // ... a rider lying flat
const ROOF_Y = 1.3;           // roof height above the road

export class CarRider {
  constructor(G) { this.G = G; this.roof = null; this.accS = 0; this.air = 0; }

  vehicleOf(collider) {
    const p = collider?.parent?.(); if (!p) return null;
    for (const v of this.G.vehicles) if (v.pv && v.pv.body.handle === p.handle) return v;
    return null;
  }

  // ------------------------------------------------------------------ leaving a moving vehicle
  bail(v, sp, outX, outZ, force = false) {
    const G = this.G, pl = G.player;
    if (sp < 3.5) return;
    const l = Math.hypot(outX, outZ) || 1, dx = outX / l, dz = outZ / l;
    const roll = G.input.keys.has('KeyZ');
    pl.vx = v.vx * 0.92 + dx * 2; pl.vz = v.vz * 0.92 + dz * 2; pl.momentum = true;
    let dmg = sp > 8 ? (sp - 8) * (sp - 8) * 0.5 : sp > 6 ? (sp - 6) * 1.2 : 0;
    if (roll) dmg *= 0.35;
    G.noise?.(pl.x, pl.z, 12);
    if (sp >= 9) {
      this.prepareBones(pl);
      const r = G.ragdolls.spawn(pl, { cause: 'bail', alive: true, vel: { x: pl.vx, y: 1.5, z: pl.vz } });
      if (r) { r.tone = roll ? 1.6 : 0.4; G.toast('차에서 뛰어내렸다', roll ? '구르며 충격을 줄였다' : `시속 ${(sp * 3.6) | 0} km`); }
      else if (pl.m.playOnce?.(roll ? 'U_Roll' : 'U_Jump_Land', false)) pl.reactT = 0.7;
      G.shake?.(0.4);
    } else {
      if (pl.m.playOnce?.(roll || sp > 6 ? 'U_Roll' : 'U_Jump_Land', false)) pl.reactT = roll ? 0.75 : 0.4;
      G.toast('차에서 내렸다', `시속 ${(sp * 3.6) | 0} km`);
    }
    G.audio.impact?.(clamp(sp / 16, 0.3, 1), 0);
    if (dmg > 0) G.hurtPlayer(dmg, null, 'bail');
  }
  // the avatar was hidden / seated while driving: stand it up where it is before a ragdoll is built from its bones
  prepareBones(pl) {
    const m = pl.m;
    for (const k in m.act) m.act[k].weight = 0; m.act.Idle.weight = 1; m.mixer.update(0);
    m.body.rotation.set(0, 0, 0); m.body.position.set(0, 0, 0);
    pl.group.position.set(pl.x, pl.y, pl.z); pl.group.rotation.set(0, pl.ry || 0, 0); pl.group.scale.setScalar(1);
    pl.group.updateMatrixWorld(true);
  }

  // ------------------------------------------------------------------ roof riding
  // The character controller does not collide with vehicles (cars are solid to people through the OBB push-out in game.js), so the roof is a
  // virtual floor here: standing / falling onto the car's footprint at roof height mounts it, then the person is carried with the car.
  roofTop(v) { return v.pv.body.translation().y + 0.54; }               // collider centre +0.12, half height 0.42
  inFoot(v, x, z, m = 0) {
    const s = Math.sin(v.h), c = Math.cos(v.h), dx = x - v.x, dz = z - v.z, lx = dx * c - dz * s, lz = dx * s + dz * c;
    return Math.abs(lx) < v.W / 2 * 0.98 + m && Math.abs(lz) < v.L / 2 * 0.98 + m;
  }
  before(dt) {
    const G = this.G, pl = G.player, c3 = pl.body3, r = this.roof;
    if (!r) return;
    const v = r.v;
    if (!v.pv || v.dead || pl.swimming || pl.rag) { this.leave(); return; }
    // carry: same place in the car's frame, standing on the roof
    const s = Math.sin(v.h), c = Math.cos(v.h);
    const tx = v.x + c * r.lx + s * r.lz, tz = v.z - s * r.lx + c * r.lz, top = this.roofTop(v);
    c3.shift(tx - pl.x, top - pl.y, tz - pl.z);
    pl.x = c3.x; pl.z = c3.z; pl.y = c3.y; c3.grounded = true; c3.vy = -2;
    // shaken off?
    const dvx = v.vx - r.pvx, dvz = v.vz - r.pvz; r.pvx = v.vx; r.pvz = v.vz;
    this.accS += (Math.hypot(dvx, dvz) / Math.max(dt, 1e-3) - this.accS) * Math.min(1, dt * 8);
    const up = v.pv.body.rotation(), upY = 1 - 2 * (up.x * up.x + up.z * up.z);
    const limit = pl.prone ? THROW_ACC_LOW : THROW_ACC;
    if (this.accS > limit || upY < 0.55) this.throwOff(v);
  }
  // after the character has moved
  after(dt) {
    const G = this.G, pl = G.player, c3 = pl.body3;
    if (G.vehicle || pl.dead || pl.rag) { this.roof = null; return; }
    const r = this.roof;
    if (r) {
      const v = r.v, s = Math.sin(v.h), c = Math.cos(v.h), top = this.roofTop(v), dx = pl.x - v.x, dz = pl.z - v.z;
      if (c3.vy > 1 || pl.hang || pl.mantle) { this.leave(); return; }      // jumped off / grabbed something
      r.lx = dx * c - dz * s; r.lz = dx * s + dz * c;
      if (!this.inFoot(v, pl.x, pl.z, 0.1)) { this.leave(); return; }      // walked off the edge
      c3.shift(0, top - pl.y, 0); pl.y = c3.y; c3.grounded = true; c3.vy = -2;   // stay on the roof surface
      return;
    }
    // mounting: feet at roof height over the footprint of a car that is not racing past
    if (pl.mantle || pl.hang || pl.swimming) return;
    for (const v of G.vehicles) {
      if (!v.pv || v.dead || v.spec.craft || Math.abs(v.x - pl.x) > 4 || Math.abs(v.z - pl.z) > 4) continue;
      const top = this.roofTop(v);
      if (pl.y < top - 0.45 || pl.y > top + 0.2 || c3.vy > 1.5 || !this.inFoot(v, pl.x, pl.z)) continue;
      if (v.speed > MOUNT_MAX * 1.8) continue;
      const s = Math.sin(v.h), c = Math.cos(v.h), dx = pl.x - v.x, dz = pl.z - v.z;
      this.roof = { v, lx: dx * c - dz * s, lz: dx * s + dz * c, pvx: v.vx, pvz: v.vz }; this.accS = 0;
      c3.shift(0, top - pl.y, 0); pl.y = c3.y; c3.grounded = true; c3.vy = -2; pl.vx = pl.vz = 0;
      if (!this._hint) { this._hint = true; G.toast('차 지붕 위', '급제동·급회전하면 떨어진다 · <kbd>Z</kbd> 엎드려 버티기'); }
      break;
    }
  }
  leave() {
    const G = this.G, pl = G.player, r = this.roof; if (!r) return;
    this.roof = null; pl.body3.rideHandle = null;
    pl.vx += r.v.vx; pl.vz += r.v.vz; pl.momentum = true;           // keeps the car's speed when stepping / jumping off
    const sp = Math.hypot(r.v.vx, r.v.vz);
    if (sp > 6 && !pl.body3.grounded) this.landing = true;
  }
  throwOff(v) {
    const G = this.G, pl = G.player; this.roof = null; pl.body3.rideHandle = null;
    const sp = Math.hypot(v.vx, v.vz);
    pl.vx = v.vx; pl.vz = v.vz; pl.momentum = true;
    G.toast('지붕에서 떨어졌다');
    this.prepareBones(pl);
    const side = rand(-1, 1) > 0 ? 1 : -1, c = Math.cos(v.h), s = Math.sin(v.h);
    const r = G.ragdolls.spawn(pl, { cause: 'bail', alive: true, vel: { x: v.vx * 0.85 + c * side * 2, y: 1.2, z: v.vz * 0.85 - s * side * 2 } });
    G.hurtPlayer((sp > 8 ? (sp - 8) * (sp - 8) * 0.5 : 0) + 4, null, 'bail');
    if (!r) { pl.body3.vy = 3; pl.body3.grounded = false; }
  }
}
export { ROOF_Y, MOUNT_MAX };
