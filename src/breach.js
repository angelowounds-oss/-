import * as THREE from 'three';
import { holeCU, holeHU, HOLES } from './gfx.js';
import { rand } from './util.js';

// Breaching charges: stick one on an interior wall (G), it blows a doorway-sized hole after a short fuse.
// The hole is real: the wall's colliders are split around it, the wall surface is not drawn inside it (shader, gfx.js),
// and it is saved, so it is cut again whenever that floor is rebuilt.
const FUSE = 3.0, HW = 0.72, HH = 1.06, HT = 0.36;   // hole half width / half height / half thickness

export class Breach {
  constructor(G) {
    this.G = G; this.charges = [];
    this.holes = G.state.holes || (G.state.holes = []);
    this.uT = 0;
    G.interact.providers.push((pl, out) => this.provide(pl, out));
    this.mat = new THREE.MeshStandardMaterial({ color: 0x3c3c30, roughness: 0.7 });
    this.ledMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.1, 0.1).multiplyScalar(3), toneMapped: false });
    this.updateUniforms();
  }
  // the wall in front of the player, if it can be breached
  wallAhead(pl) {
    const G = this.G, yaw = G.cam.yaw, dx = Math.sin(yaw), dz = Math.cos(yaw);
    const hit = G.phys.ray(pl.x, pl.y + 1.1, pl.z, dx, 0, dz, 1.7, 1);
    if (!hit || !hit.ref || hit.ref.tag !== 'part' || Math.abs(hit.ny) > 0.3) return null;
    return { x: pl.x + dx * hit.t, y: pl.y + 1.1, z: pl.z + dz * hit.t, nx: hit.nx, nz: hit.nz, box: hit.ref };
  }
  provide(pl, out) {
    const G = this.G;
    if (!G.items.count('breach') || G.vehicle || pl.dead) return;
    const w = this.wallAhead(pl); if (!w) return;
    out.push({ x: w.x, z: w.z, r: 2.2, cy: pl.y + 1, name: '벽', verbs: [{ key: 'G', label: () => '폭파 장약 설치', run: () => this.plant(w) }] });
  }
  plant(w) {
    const G = this.G;
    if (!G.items.take('breach')) return;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.07), this.mat), led = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), this.ledMat);
    led.position.set(0.07, 0.04, 0.04); g.add(body, led);
    g.position.set(w.x + w.nx * 0.04, w.y, w.z + w.nz * 0.04); g.rotation.y = Math.atan2(w.nx, w.nz);
    G.scene.add(g);
    this.charges.push({ ...w, t: 0, beep: 0, mesh: g, led });
    G.audio.tone?.(1500, 0.06, 'square', 0.08);
    G.toast('폭파 장약 설치', `${FUSE | 0}초 뒤 폭발 · 물러나라`);
    G.onItemChange?.();
  }
  update(dt) {
    for (let i = this.charges.length - 1; i >= 0; i--) {
      const c = this.charges[i]; c.t += dt; c.beep -= dt;
      const rate = c.t > FUSE - 1 ? 0.12 : 0.5;
      if (c.beep <= 0) { c.beep = rate; this.G.audio.tone?.(2100, 0.05, 'square', 0.05); c.led.visible = true; } else if (c.beep < rate * 0.5) c.led.visible = false;
      if (c.t >= FUSE) { this.charges.splice(i, 1); this.detonate(c); }
    }
    this.uT -= dt; if (this.uT <= 0) this.updateUniforms();
  }
  detonate(c) {
    const G = this.G;
    G.scene.remove(c.mesh); c.mesh.traverse((o) => o.geometry?.dispose());
    // which building / floor is this wall on
    let found = null;
    for (const b of G.buildings.active) for (const [k, fl] of b.floors) if (fl.boxes.includes(c.box)) { found = { b, k, fl }; break; }
    G.explosion(c.x + c.nx * 0.3, c.y, c.z + c.nz * 0.3, 3.4, 40, G.player);
    if (!found) return;
    const L = found.b.levels[found.k], along = Math.abs(c.nx) > Math.abs(c.nz) ? 'z' : 'x';   // wall runs along this axis
    const cx = c.x, cz = c.z, y0 = L.y + 0.02, y1 = L.y + 0.02 + HH * 2;
    const h = along === 'z' ? { x0: cx - HT, x1: cx + HT, z0: cz - HW, z1: cz + HW } : { x0: cx - HW, x1: cx + HW, z0: cz - HT, z1: cz + HT };
    const hole = { b: found.b.id, k: found.k, ...h, y0, y1 };
    this.holes.push(hole);
    this.cut(found.fl, hole);
    this.updateUniforms();
    // dust and rubble
    for (let n = 0; n < 24; n++) G.smokeP.emit(cx + rand(-0.6, 0.6), y0 + rand(0.2, 2), cz + rand(-0.6, 0.6), rand(-1.5, 1.5), rand(0.2, 1.2), rand(-1.5, 1.5), rand(2, 4), rand(1.2, 2.4), 0.16, 0.15, 0.14, 0.7, 0.3, 0.5);
    for (let n = 0; n < 3; n++) for (const s of [-1, 1]) G.items.drop('brick', cx + c.nx * s * 0.5 + rand(-0.4, 0.4), y0 + rand(0.3, 1.6), cz + c.nz * s * 0.5 + rand(-0.4, 0.4), { x: c.nx * s * rand(1, 4), y: rand(0.5, 3), z: c.nz * s * rand(1, 4) });
    G.memory?.log?.('explosion', cx, cz);
    G.noise?.(cx, cz, 70);
    G.noteCrime?.(G.player, 'vandal', 6);
  }
  // split every partition collider that crosses the hole into the parts left, right, above and below it
  cut(fl, h) {
    const col = this.G.world.colliders, hit = [];
    // furniture in the blast path (the hole widened by 1.1 m each side, as drawn by the furniture shader) is gone
    const thinX = (h.x1 - h.x0) < (h.z1 - h.z0), px0 = thinX ? h.x0 - 1.1 : h.x0, px1 = thinX ? h.x1 + 1.1 : h.x1, pz0 = thinX ? h.z0 : h.z0 - 1.1, pz1 = thinX ? h.z1 : h.z1 + 1.1;
    for (const b of [...fl.boxes]) {
      if (b.tag !== 'furniture') continue;
      if (b.x1 <= px0 || b.x0 >= px1 || b.z1 <= pz0 || b.z0 >= pz1 || b.h <= h.y0 || (b.y0 || 0) >= h.y1 + 0.3) continue;
      col.removeBox(b); fl.boxes.splice(fl.boxes.indexOf(b), 1);
    }
    for (const b of fl.boxes) {
      if (b.tag !== 'part') continue;
      if (b.x1 <= h.x0 || b.x0 >= h.x1 || b.z1 <= h.z0 || b.z0 >= h.z1 || b.h <= h.y0 || (b.y0 || 0) >= h.y1) continue;
      hit.push(b);
    }
    for (const b of hit) {
      col.removeBox(b); const i = fl.boxes.indexOf(b); if (i >= 0) fl.boxes.splice(i, 1);
      const by0 = b.y0 || 0, alongX = (b.x1 - b.x0) >= (b.z1 - b.z0);
      const a0 = alongX ? b.x0 : b.z0, a1 = alongX ? b.x1 : b.z1, c0 = alongX ? b.z0 : b.x0, c1 = alongX ? b.z1 : b.x1;
      const ha0 = alongX ? h.x0 : h.z0, ha1 = alongX ? h.x1 : h.z1;
      const add = (u0, u1, ya, yb) => {
        if (u1 - u0 < 0.02 || yb - ya < 0.02) return;
        if (alongX) fl.cc(u0, c0, u1, c1, ya, yb, 'part'); else fl.cc(c0, u0, c1, u1, ya, yb, 'part');
      };
      add(a0, Math.min(a1, ha0), by0, b.h);
      add(Math.max(a0, ha1), a1, by0, b.h);
      const m0 = Math.max(a0, ha0), m1 = Math.min(a1, ha1);
      add(m0, m1, Math.max(by0, h.y1), b.h);
      add(m0, m1, by0, Math.min(b.h, h.y0));
    }
  }
  // a floor was (re)built: cut its saved holes again
  applyFloor(b, fl, k) { for (const h of this.holes) if (h.b === b.id && h.k === k) this.cut(fl, h); }
  // the shader draws the holes nearest to the camera
  updateUniforms() {
    this.uT = 1;
    const cam = this.G.camera?.position, list = cam ? [...this.holes].sort((a, b) => Math.hypot((a.x0 + a.x1) / 2 - cam.x, (a.z0 + a.z1) / 2 - cam.z) - Math.hypot((b.x0 + b.x1) / 2 - cam.x, (b.z0 + b.z1) / 2 - cam.z)) : this.holes;
    for (let i = 0; i < HOLES; i++) {
      const h = list[i];
      if (!h) { holeCU.value[i].set(0, -999, 0, 0); continue; }
      holeCU.value[i].set((h.x0 + h.x1) / 2, (h.y0 + h.y1) / 2, (h.z0 + h.z1) / 2, 1);
      holeHU.value[i].set((h.x1 - h.x0) / 2, (h.y1 - h.y0) / 2, (h.z1 - h.z0) / 2, 0);
    }
  }
}
