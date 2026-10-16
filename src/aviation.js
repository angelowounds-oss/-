import * as THREE from 'three';
import { cities } from './worldmap.js';
import { buildCustom } from './craft.js';

// Aircraft that are part of the world (ADR-0012 phase 5): airliners and cargo planes flying out of Skyport on timetables, helicopters circling the
// capital. They are not physics objects: the position of each is a function of the clock (so the sky is the same wherever and whenever you look),
// they are drawn only within VIS m of the camera, and a few meshes are made at start-up and reused (so nothing compiles during play).
// `buildAirliner` is also what the player rides in on a flight (transit.js).
const VIS = 28000;
const lerp = (a, b, t) => a + (b - a) * t;

export function buildAirliner(opts = {}) {
  const g = new THREE.Group(), body = opts.cargo ? 0xcfa46a : 0xeef1f5, accent = opts.accent ?? 0x2e7dff;
  const paint = new THREE.MeshStandardMaterial({ color: body, roughness: 0.4, metalness: 0.3 }), dark = new THREE.MeshStandardMaterial({ color: 0x1b1f27, roughness: 0.6, metalness: 0.4 });
  const stripe = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5, metalness: 0.2 });
  const win = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.85, 0.55).multiplyScalar(2), toneMapped: false });
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = false; g.add(m); return m; };
  const fus = new THREE.CylinderGeometry(3.1, 3.1, 50, 18, 1); fus.rotateX(Math.PI / 2); add(fus, paint, 0, 0, 0);
  const nose = new THREE.SphereGeometry(3.1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2); nose.rotateX(Math.PI / 2); nose.scale(1, 1, 1.5); add(nose, paint, 0, 0, 25);
  const tail = new THREE.ConeGeometry(3.1, 16, 18); tail.rotateX(-Math.PI / 2); add(tail, paint, 0, 0.6, -33).scale.set(1, 0.7, 1);
  add(new THREE.BoxGeometry(6.4, 0.18, 51), stripe, 0, -0.9, 0).scale.set(1.005, 1, 1);
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.06, 0.5, 40), win, sx * 3.1, 0.7, 2);
  // wings (swept) with engines, winglets
  for (const sx of [-1, 1]) {
    const w = add(new THREE.BoxGeometry(17, 0.55, 9), paint, sx * 11, -1.1, -2, 0, sx * 0.5, sx * -0.05); w.geometry.translate(0, 0, 0);
    add(new THREE.CylinderGeometry(1.45, 1.25, 5.4, 14), dark, sx * 8.6, -2.6, 3.5, Math.PI / 2, 0, 0);
    add(new THREE.BoxGeometry(0.3, 2.2, 2.4), stripe, sx * 19.3, 0.3, -9, 0, 0, sx * 0.2);
    add(new THREE.BoxGeometry(8.5, 0.3, 4.2), paint, sx * 5.6, 0.7, -31, 0, sx * 0.4, 0);   // tailplane
  }
  add(new THREE.BoxGeometry(0.5, 9, 8), stripe, 0, 6.2, -31, 0, 0, 0);   // fin
  // lights: red left, green right, white strobe on the fin; they blink in update()
  const lamp = (c, x, y, z, s) => { const m = add(new THREE.SphereGeometry(s, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(3), toneMapped: false, fog: false }), x, y, z); return m; };
  g.userData.nav = [lamp(0xff2020, -19.8, 0.1, -9.5, 0.45), lamp(0x20ff40, 19.8, 0.1, -9.5, 0.45)]; g.userData.strobe = [lamp(0xffffff, 0, 10.8, -33, 0.5), lamp(0xffffff, 0, -3.2, 0, 0.5)];
  g.userData.paint = paint;
  return g;
}

// the flight path of a timetable aircraft: [x, y, z, speed] waypoints out of and back to Skyport's runway
function flightPlan(air, dest) {
  const rw = { x: air.x - air.r * 0.9, z: air.z + air.r * 0.28 + 30 }, ex = rw.x + air.r * 1.8;   // west end of the runway to its east end: take off to the east
  const dx = dest.x - ex, dz = dest.z - rw.z, d = Math.hypot(dx, dz), ux = dx / d, uz = dz / d;
  const P = [], at = (t, y, sp) => P.push([ex + ux * t, y, rw.z + uz * t, sp]);
  P.push([rw.x, 0, rw.z, 12], [rw.x + air.r * 1.2, 0, rw.z, 75], [ex, 20, rw.z, 85]);
  at(3000, 500, 120); at(9000, 1800, 190); at(Math.max(12000, d * 0.5), 3000, 230); at(Math.max(14000, d - 9000), 3000, 230); at(Math.max(16000, d - 4000), 900, 160);
  // over the destination, turn round and come back the same way (the world has one airport)
  P.push([dest.x + ux * 1500, 700, dest.z + uz * 1500, 120], [dest.x + ux * 3500 + uz * 2500, 800, dest.z + uz * 3500 - ux * 2500, 120]);
  const back = P.slice(3, P.length - 2).reverse().map((p) => [p[0] + uz * 1400, p[1], p[2] - ux * 1400, p[3]]);
  P.push(...back, [rw.x + air.r * 0.3, 60, rw.z, 80], [rw.x + air.r * 0.9, 0, rw.z, 60], [rw.x + air.r * 1.8, 0, rw.z, 8]);
  return P;
}
function polyLen(P) { const s = [0]; for (let i = 1; i < P.length; i++) s.push(s[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1], P[i][2] - P[i - 1][2])); return s; }
// position at path distance s: { x, y, z, h (heading), p (pitch) }
export function pathAt(P, S, s) {
  let i = 1; while (i < S.length - 1 && S[i] < s) i++;
  const t = (s - S[i - 1]) / ((S[i] - S[i - 1]) || 1), a = P[i - 1], b = P[i], u = Math.max(0, Math.min(1, t));
  return { x: lerp(a[0], b[0], u), y: lerp(a[1], b[1], u), z: lerp(a[2], b[2], u), h: Math.atan2(b[0] - a[0], b[2] - a[2]), p: Math.atan2(b[1] - a[1], Math.hypot(b[0] - a[0], b[2] - a[2])), sp: lerp(a[3], b[3], u) };
}

export class Aviation {
  constructor(G) {
    this.G = G; this.flights = []; this.helis = []; this.t0 = 0; this.group = new THREE.Group(); this.group.name = 'aviation'; G.scene.add(this.group);
    const cs = cities(), air = cs.find((c) => c.type === 'airport'); if (!air) return;
    const others = cs.filter((c) => c.id !== air.id);
    // two airliners and one cargo plane on staggered timetables to different cities
    const specs = [{ dest: others.find((c) => c.id === 'neon'), cargo: false, off: 0 }, { dest: others.find((c) => c.id === 'harbor'), cargo: false, off: 0.5 }, { dest: others.find((c) => c.id === 'mid2'), cargo: true, off: 0.27 }];
    for (const sp of specs) {
      if (!sp.dest) continue;
      const P = flightPlan(air, sp.dest), S = polyLen(P), mesh = buildAirliner({ cargo: sp.cargo, accent: sp.cargo ? 0xd24a1a : 0x2e7dff });
      let T = 0; for (let i = 1; i < P.length; i++) T += (S[i] - S[i - 1]) / (0.5 * (P[i][3] + P[i - 1][3]));
      mesh.visible = false; this.group.add(mesh); this.flights.push({ P, S, T: T + 90, off: sp.off, mesh, cargo: sp.cargo, len: S[S.length - 1] });
    }
    // helicopters on a slow circle over the capital's towers (visual only)
    for (let k = 0; k < 2; k++) {
      const m = buildCustom('heli', k ? 0x1f2b44 : 0x3a2a4a, { glow: [1, 0.3, 0.8] }); m.group.visible = false; this.group.add(m.group); this.helis.push({ m, R: 520 + k * 330, y: 190 + k * 60, ph: k * 3.1, w: 0.07 - k * 0.012 });
    }
  }
  // distance along a flight at clock time t (s): the speed profile makes a ride of the plan's real length take T seconds
  flightPos(f, t) {
    const T = f.T, ph = ((t / T + f.off) % 1) * T;   // seconds into the cycle; the first 90 s are the gate (not visible)
    const run = ph - 45; if (run < 0 || run > T - 90) return null;
    // integrate speed: find the distance covered after `run` seconds along the plan (piecewise, speed linear between waypoints)
    let tt = 0;
    for (let i = 1; i < f.P.length; i++) {
      const d = f.S[i] - f.S[i - 1], v = 0.5 * (f.P[i][3] + f.P[i - 1][3]), dt = d / v;
      if (tt + dt >= run) { const u = (run - tt) / dt; return pathAt(f.P, f.S, f.S[i - 1] + d * u); }
      tt += dt;
    }
    return null;
  }
  update(dt) {
    const G = this.G, cam = G.camera.position, t = G.time; this.t0 += dt;
    for (const f of this.flights) {
      const p = this.flightPos(f, t);
      if (!p || Math.hypot(p.x - cam.x, p.z - cam.z) > VIS) { f.mesh.visible = false; continue; }
      f.mesh.visible = true; f.mesh.position.set(p.x, p.y + 3.2, p.z); f.mesh.rotation.set(-p.p, p.h, 0, 'YXZ');
      const bl = (Math.sin(this.t0 * 5) > 0.2 ? 1 : 0), st = (Math.sin(this.t0 * 9) > 0.85 ? 1 : 0);
      for (const n of f.mesh.userData.nav) n.visible = !!bl; for (const s of f.mesh.userData.strobe) s.visible = !!st;
    }
    for (const h of this.helis) {
      const a = h.ph + this.t0 * h.w, x = Math.cos(a) * h.R, z = Math.sin(a) * h.R, g = h.m.group;
      if (Math.hypot(x - cam.x, z - cam.z) > 5000) { g.visible = false; continue; }
      g.visible = true; g.position.set(x, h.y + Math.sin(this.t0 * 0.6 + h.ph) * 4, z); g.rotation.set(0, -a, 0); g.rotation.z = -0.08;
      h.m.rotor.rotation.y += dt * 38; if (h.m.tailRotor) h.m.tailRotor.rotation.x += dt * 50;
    }
  }
}
