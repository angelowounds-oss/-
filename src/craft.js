import * as THREE from 'three';
import { glowSpriteMat } from './models.js';
import { GR, grp } from './physics.js';
import { clamp, lerp, damp, TAU, rand } from './util.js';
import { WORLD_HALF } from './worldmap.js';
import { CAPITAL } from './koreamap.js';
import { landHeight } from './farland.js';

// Motorcycle, boat and helicopter: procedural models + physics drive models (Vehicle subclass-free hooks)
export const CRAFT_SPECS = {
  moto: { L: 2.1, W: 0.8, wb: 0.85, mass: 0.2, maxSpeed: 60, accel: 25, grip: 8.5, hp: 55, track: 0.3, cy: 0.5, fuelRate: 0.9, custom: 'moto' },
  bus: { L: 11, W: 2.55, wb: 3.8, mass: 2.8, maxSpeed: 20, accel: 6, grip: 5, hp: 320, track: 0.95, custom: 'bus', fuelRate: 1 },
  boat: { L: 6.2, W: 2.4, mass: 0.9, maxSpeed: 26, accel: 11, grip: 3, hp: 120, cy: 0.5, fuelRate: 1.2, custom: 'boat', craft: 'boat' },
  heli: { L: 8.5, W: 2.6, mass: 0.9, maxSpeed: 48, accel: 16, grip: 3, hp: 130, cy: 0.9, fuelRate: 1.6, custom: 'heli', craft: 'heli' },
  // war machines (see warcraft.js): armoured, armed, flown / driven with the camera as the aim
  tank: { L: 7.6, W: 3.5, mass: 4.5, maxSpeed: 17, accel: 6.5, grip: 3, hp: 1800, cy: 1.05, fuelRate: 0.7, custom: 'tank', craft: 'tank', war: 'tank', armored: 0.5 },
  gunship: { L: 10.5, W: 3.4, mass: 1.3, maxSpeed: 60, accel: 20, grip: 3, hp: 800, cy: 0.9, fuelRate: 1.3, custom: 'gunship', craft: 'heli', war: 'gunship', armored: 0.3 },
  // Darkstar: a black hypersonic aircraft, Mach 10 (3,430 m/s) at full throttle; same flight model as the jet with a bigger engine
  darkstar: { L: 15, W: 7.2, mass: 1.2, maxSpeed: 3430, accel: 1500, grip: 3, hp: 600, cy: 1.0, fuelRate: 2.2, custom: 'darkstar', craft: 'jet', war: 'jet', armored: 0.35, hyper: true, title: '다크스타' },
  jet: { L: 13, W: 8.4, mass: 1.2, maxSpeed: 150, accel: 30, grip: 3, hp: 450, cy: 1.1, fuelRate: 1.8, custom: 'jet', craft: 'jet', war: 'jet', armored: 0.2 },
};

const std = (c, r = 0.5, m = 0.3, e) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, emissive: e || 0x000000, emissiveIntensity: e ? 1.6 : 0 });
const MAT = () => ({ dark: std(0x1b1e27, 0.4, 0.7), metal: std(0x8d94a2, 0.3, 0.9), glass: new THREE.MeshPhysicalMaterial({ color: 0x15283c, roughness: 0.05, transparent: true, opacity: 0.55, clearcoat: 1 }), rubber: std(0x0a0a0c, 0.9, 0) });
function base(type, color, opts) {
  const group = new THREE.Group(), ug = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), new THREE.MeshBasicMaterial({ visible: false }));
  ug.material.uniforms = { uColor: { value: new THREE.Color(...(opts.glow || [0.2, 0.9, 1])) } };
  const brake = new THREE.Group(); group.add(brake); brake.visible = false;
  return { group, ug, head: new THREE.Object3D(), tail: new THREE.Object3D(), beams: new THREE.Object3D(), brake, headSprites: [], tailSprites: [], siren: null, wheelR: 0.33, dark: new THREE.Object3D(), front: new THREE.Object3D(), fa: new THREE.Object3D(), ra: new THREE.Object3D(), syncWheels() {}, paint: null };
}
const box = (mat, w, h, d, x, y, z, parent) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = false; parent.add(m); return m; };
const cyl = (mat, r, h, x, y, z, parent, rot) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), mat); m.position.set(x, y, z); if (rot) m.rotation.set(...rot); parent.add(m); return m; };

export function buildCustom(type, color, opts = {}) {
  const M = MAT(), m = base(type, color, opts), g = m.group, glow = opts.glow || [0.2, 0.9, 1];
  const neon = new THREE.MeshBasicMaterial({ color: new THREE.Color(...glow).multiplyScalar(2.6), toneMapped: false });
  const paint = std(color, 0.25, 0.6); m.paint = paint;
  const spr = (x, y, z, col, s) => { const t = new THREE.Sprite(glowSpriteMat(col, 1.2)); t.position.set(x, y, z); t.scale.setScalar(s); g.add(t); return t; };
  if (type === 'bus') {
    const bodyM = std(0x1d6fa8, 0.4, 0.4); m.paint = bodyM; box(bodyM, 2.5, 2.5, 10.8, 0, 0.45, 0, g);
    box(M.glass, 2.52, 0.9, 9.6, 0, 1.55, -0.2, g); box(neon, 2.54, 0.07, 10.84, 0, 0.62, 0, g); box(M.dark, 2.4, 0.08, 10.6, 0, 2.97, 0, g);
    box(neon, 2.1, 0.3, 0.06, 0, 2.55, 5.43, g); box(M.rubber, 2.4, 0.3, 0.3, 0, 0.35, 5.5, g);
    for (const z of [-3.7, 3.7]) for (const x of [-1.2, 1.2]) cyl(M.rubber, 0.5, 0.35, x, 0.5, z, g, [0, 0, Math.PI / 2]);
    m.headSprites = [spr(-0.9, 0.95, 5.5, 0xfff0cc, 1.2), spr(0.9, 0.95, 5.5, 0xfff0cc, 1.2)]; m.tailSprites = [spr(-0.9, 1.0, -5.45, 0xff1a10, 0.7), spr(0.9, 1.0, -5.45, 0xff1a10, 0.7)]; m.wheelR = 0.5;
  } else if (type === 'moto') {
    const frame = new THREE.Group(); g.add(frame); m.frame = frame;
    box(M.dark, 0.26, 0.22, 1.05, 0, 0.62, 0.0, frame);
    const tank = cyl(paint, 0.17, 0.5, 0, 0.84, 0.24, frame, [Math.PI / 2, 0, 0]); tank.scale.set(1, 1, 0.8);
    box(M.rubber, 0.24, 0.1, 0.62, 0, 0.83, -0.38, frame);
    box(neon, 0.3, 0.03, 0.9, 0, 0.5, 0, frame);
    const fork = new THREE.Group(); fork.position.set(0, 0.55, 0.78); frame.add(fork); m.fork = fork;
    box(M.metal, 0.05, 0.7, 0.05, -0.1, -0.05, 0.0, fork).rotation.x = 0.35; box(M.metal, 0.05, 0.7, 0.05, 0.1, -0.05, 0, fork).rotation.x = 0.35;
    box(M.dark, 0.7, 0.05, 0.05, 0, 0.32, -0.12, fork); // bars
    m.wf = new THREE.Group(); m.wf.position.set(0, -0.22, 0.12); fork.add(m.wf); cyl(M.rubber, 0.33, 0.14, 0, 0, 0, m.wf, [0, 0, Math.PI / 2]); cyl(neon, 0.2, 0.15, 0, 0, 0, m.wf, [0, 0, Math.PI / 2]);
    m.wr = new THREE.Group(); m.wr.position.set(0, 0.33, -0.85); frame.add(m.wr); cyl(M.rubber, 0.34, 0.2, 0, 0, 0, m.wr, [0, 0, Math.PI / 2]); cyl(neon, 0.2, 0.21, 0, 0, 0, m.wr, [0, 0, Math.PI / 2]);
    m.headSprites = [spr(0, 0.9, 1.05, 0xfff0cc, 1.1)]; m.tailSprites = [spr(0, 0.8, -1.0, 0xff1a10, 0.5)];
    m.syncWheels = (spin, steer) => { m.wf.rotation.x = spin; m.wr.rotation.x = spin; fork.rotation.y = steer * 0.9; };
    m.wheelR = 0.33; m.craftVisual = (v, dt) => { frame.rotation.z = damp(frame.rotation.z, -clamp(v.steer * v.speed * 0.03, -0.55, 0.55), 6, dt); };
  } else if (type === 'boat') {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.7, 6.0), paint); hull.position.y = 0.35; g.add(hull);
    const bow = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 1.15, 1.6, 4, 1), paint); bow.rotation.set(Math.PI / 2, Math.PI / 4, 0); bow.scale.set(1, 1, 0.36); bow.position.set(0, 0.35, 3.7); g.add(bow);
    box(M.dark, 2.0, 0.08, 5.6, 0, 0.74, -0.1, g); box(neon, 2.34, 0.05, 6.04, 0, 0.55, 0, g);
    box(paint, 1.5, 0.7, 1.9, 0, 1.05, -0.5, g); box(M.glass, 1.4, 0.5, 0.06, 0, 1.22, 0.5, g).rotation.x = -0.35; box(M.dark, 1.5, 0.08, 2.0, 0, 1.45, -0.6, g);
    cyl(M.metal, 0.05, 0.9, 0.6, 1.3, 1.3, g); cyl(M.metal, 0.05, 0.9, -0.6, 1.3, 1.3, g);
    box(M.dark, 0.35, 0.5, 0.4, 0, 0.7, -3.1, g); // outboard
    m.headSprites = [spr(0, 0.95, 3.3, 0xffffff, 1.4)]; m.tailSprites = [spr(0, 1.0, -3.0, 0xff2010, 0.6)];
    m.craftVisual = (v, dt) => { g.rotation.z = Math.sin(v.G.time * 1.3 + v.id) * 0.03; };
  } else if (type === 'tank') {
    const olive = std(0x4a5236, 0.7, 0.3), dk = std(0x23271c, 0.8, 0.3); m.paint = olive;
    box(olive, 2.9, 0.9, 6.6, 0, 1.2, 0, g); box(olive, 2.5, 0.5, 1.6, 0, 1.5, 3.1, g).rotation.x = 0.35; box(dk, 3.5, 0.9, 7.2, 0, 0.55, 0, g);
    for (const sx of [-1, 1]) { box(dk, 0.7, 1.25, 7.6, sx * 1.4, 0.65, 0, g); for (let k = -3; k <= 3; k++) cyl(M.rubber, 0.42, 0.5, sx * 1.4, 0.45, k * 0.95, g, [0, 0, Math.PI / 2]); box(neon, 0.04, 0.05, 6.8, sx * 1.76, 1.0, 0, g); }
    const tur = new THREE.Group(); tur.position.set(0, 1.9, -0.3); g.add(tur);
    box(olive, 2.6, 0.95, 3.3, 0, 0.45, 0, tur); box(olive, 2.0, 0.4, 2.4, 0, 1.05, -0.3, tur);
    const gp = new THREE.Group(); gp.position.set(0, 0.5, 1.5); tur.add(gp);
    const barrel = cyl(dk, 0.14, 5.4, 0, 0, 2.7, gp, [Math.PI / 2, 0, 0]); barrel.scale.set(1, 1, 1);
    cyl(dk, 0.2, 0.7, 0, 0, 5.2, gp, [Math.PI / 2, 0, 0]);
    const mz = new THREE.Object3D(); mz.position.set(0, 0, 5.55); gp.add(mz);
    const mg = new THREE.Object3D(); mg.position.set(0.55, 0.15, 1.7); gp.add(mg); cyl(dk, 0.04, 1.0, 0.55, 0.15, 2.0, gp, [Math.PI / 2, 0, 0]);
    cyl(dk, 0.4, 0.2, -0.7, 1.15, -0.5, tur); box(dk, 0.12, 0.12, 0.9, 0.8, 1.3, -0.3, tur);
    m.headSprites = [spr(-0.8, 1.7, 3.5, 0xfff0cc, 1.0), spr(0.8, 1.7, 3.5, 0xfff0cc, 1.0)]; m.tailSprites = [spr(-0.9, 1.5, -3.5, 0xff1a10, 0.6), spr(0.9, 1.5, -3.5, 0xff1a10, 0.6)];
    m.turret = tur; m.gunPivot = gp; m.muzzle = mz; m.mgMuzzle = mg; m.wheelR = 0.45;
    m.craftVisual = (v, dt) => { tur.rotation.y = v.turYaw || 0; gp.rotation.x = -(v.turPitch || 0); };
  } else if (type === 'jet') {
    const grey = std(0x59606c, 0.35, 0.6), dk = std(0x1d2028, 0.5, 0.6); m.paint = grey;
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.5, 9.5, 14), grey); fus.rotation.x = Math.PI / 2; fus.position.set(0, 1.3, 0); fus.scale.set(1, 1, 0.9); g.add(fus);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.2, 14), grey); nose.rotation.x = Math.PI / 2; nose.position.set(0, 1.3, 6.3); g.add(nose);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 10), M.glass); canopy.scale.set(0.9, 0.8, 2.2); canopy.position.set(0, 1.85, 2.2); g.add(canopy);
    for (const sx of [-1, 1]) {
      const wing = box(grey, 3.9, 0.12, 4.2, sx * 2.5, 1.2, -1.0, g); wing.rotation.y = sx * 0.55; wing.geometry = wing.geometry.clone();
      box(dk, 0.7, 0.07, 1.6, sx * 1.1, 1.75, -4.6, g).rotation.y = sx * 0.25;
      const fin = box(grey, 0.1, 1.7, 1.8, sx * 0.8, 2.15, -4.4, g); fin.rotation.z = sx * -0.28;
      box(dk, 0.8, 0.8, 2.6, sx * 0.95, 0.95, 1.2, g);
      cyl(dk, 0.12, 2.0, sx * 3.0, 1.0, -0.3, g, [Math.PI / 2, 0, 0]);
    }
    const jetFx = spr(0, 1.3, -5.6, 0xff9a40, 3.0); jetFx.scale.set(2.2, 2.2, 1); m.jetFx = jetFx;
    const mz = new THREE.Object3D(); mz.position.set(0.5, 1.15, 5.8); g.add(mz);
    m.headSprites = [spr(0, 1.0, 6.2, 0xfff0cc, 1.0)]; m.tailSprites = [spr(-3.9, 1.2, -2.6, 0xff1a10, 0.6), spr(3.9, 1.2, -2.6, 0x30ff60, 0.6)];
    m.muzzle = mz; m.wheelR = 0.3;
    // landing gear: shown while slow and low
    const gear = new THREE.Group(); g.add(gear); m.gear = gear;
    for (const [gx, gz] of [[0, 3.6], [-1.1, -1.0], [1.1, -1.0]]) { box(M.metal, 0.08, 0.7, 0.08, gx, 0.45, gz, gear); cyl(M.rubber, 0.2, 0.18, gx, 0.2, gz, gear, [0, 0, Math.PI / 2]); }
    m.craftVisual = (v, dt) => {
      const thr = v.thrLvl || 0; jetFx.material.opacity = 0.4 + 0.6 * thr; jetFx.scale.setScalar(1.2 + thr * 3); gear.visible = (v.speed < 55) && (v.by < 14 || v.speed < 20);
      g.userData.bank = damp(g.userData.bank || 0, v.bank || 0, 5, dt);
    };
  } else if (type === 'darkstar') {
    const blk = std(0x0b0d12, 0.28, 0.85), edge = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.9, 1).multiplyScalar(2.2), toneMapped: false });
    m.paint = blk; m.hull = blk;
    const sh = new THREE.Shape(); sh.moveTo(0, 8); sh.lineTo(3.7, -3.2); sh.lineTo(1.4, -3.9); sh.lineTo(0, -2.7); sh.lineTo(-1.4, -3.9); sh.lineTo(-3.7, -3.2); sh.closePath();
    const wing = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.22, bevelEnabled: false }), blk); wing.rotation.x = Math.PI / 2; wing.position.y = 1.15; g.add(wing);
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.62, 12, 14), blk); fus.rotation.x = Math.PI / 2; fus.position.set(0, 1.25, 1.2); fus.scale.set(1, 1, 0.55); g.add(fus);
    for (const sx of [-1, 1]) {
      const fin = box(blk, 0.08, 1.5, 2.4, sx * 1.15, 1.9, -3.2, g); fin.rotation.z = sx * -0.35;
      box(edge, 0.05, 0.04, 8.4, sx * 1.9, 1.2, 0.1, g).rotation.y = sx * -0.42;
      box(blk, 0.55, 0.5, 3.2, sx * 0.7, 1.0, -2.2, g);
    }
    box(edge, 0.05, 0.04, 6.5, 0, 1.52, 2.6, g);
    const nozzle = spr(0, 1.25, -4.7, 0xaadfff, 3.4); nozzle.scale.set(2.4, 2.4, 1); m.jetFx = nozzle;
    const mz = new THREE.Object3D(); mz.position.set(0, 1.1, 7.3); g.add(mz); m.muzzle = mz;
    m.headSprites = []; m.tailSprites = [spr(0, 1.3, -4.2, 0x66ddff, 0.7)]; m.wheelR = 0.3;
    const gear = new THREE.Group(); g.add(gear); m.gear = gear;
    for (const [gx, gz] of [[0, 4.2], [-1.2, -1.6], [1.2, -1.6]]) { box(M.metal, 0.08, 0.6, 0.08, gx, 0.55, gz, gear); cyl(M.rubber, 0.18, 0.16, gx, 0.2, gz, gear, [0, 0, Math.PI / 2]); }
    m.craftVisual = (v, dt) => {
      const thr = v.thrLvl || 0, mach = v.speed / 343; nozzle.material.opacity = 0.35 + 0.65 * thr; nozzle.scale.setScalar(1.4 + thr * (2 + Math.min(3, mach * 0.4)));
      gear.visible = v.speed < 55 && (v.by < 14 || v.speed < 20);
      // aerodynamic heating: the hull glows dull red -> orange -> white-hot with Mach
      const h = clamp((mach - 1.5) / 7, 0, 1); blk.emissive.setRGB(h * 3.2, h * h * 1.6 + h * 0.2, h * h * h * 1.2); blk.emissiveIntensity = 1;
    };
  } else { // heli / gunship
    const gs = type === 'gunship';
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.3, 20, 14), gs ? std(0x3b4430, 0.6, 0.4) : paint);
    body.scale.set(1, 0.9, 1.7); body.position.y = 1.35; g.add(body); m.body = body;
    const glass = new THREE.Mesh(new THREE.SphereGeometry(1.0, 20, 14, 0, TAU, 0, Math.PI * 0.55), M.glass); glass.scale.set(1, 0.85, 1.25); glass.position.set(0, 1.55, 0.8); g.add(glass);
    box(paint, 0.35, 0.4, 4.2, 0, 1.55, -3.2, g); box(neon, 0.38, 0.05, 4.2, 0, 1.75, -3.2, g);
    box(paint, 0.12, 1.1, 0.9, 0, 2.05, -5.1, g);
    m.tailRotor = new THREE.Group(); m.tailRotor.position.set(0.25, 2.1, -5.15); g.add(m.tailRotor); box(M.dark, 0.04, 1.3, 0.1, 0, 0, 0, m.tailRotor); box(M.dark, 0.04, 0.1, 1.3, 0, 0, 0, m.tailRotor);
    cyl(M.metal, 0.12, 0.5, 0, 2.55, 0.1, g);
    m.rotor = new THREE.Group(); m.rotor.position.y = 2.85; g.add(m.rotor);
    for (let i = 0; i < 4; i++) { const b = box(M.dark, 0.25, 0.04, 4.6, 0, 0, 2.3, new THREE.Group()); const pv = new THREE.Group(); pv.rotation.y = i * Math.PI / 2; pv.add(b); m.rotor.add(pv); }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(4.7, 28), new THREE.MeshBasicMaterial({ color: 0x9aa4b8, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide })); disc.rotation.x = -Math.PI / 2; m.rotor.add(disc); m.disc = disc;
    for (const s of [-1, 1]) { cyl(M.metal, 0.06, 3.0, s * 1.05, 0.12, 0.3, g, [Math.PI / 2, 0, 0]); box(M.metal, 0.06, 0.8, 0.06, s * 1.0, 0.55, 0.9, g); box(M.metal, 0.06, 0.8, 0.06, s * 1.0, 0.55, -0.3, g); }
    if (gs) {
      const dk2 = std(0x20241a, 0.7, 0.4);
      for (const sx of [-1, 1]) { box(dk2, 2.1, 0.12, 1.1, sx * 1.9, 1.25, 0.2, g); const pod = box(dk2, 0.5, 0.5, 1.6, sx * 2.8, 1.05, 0.5, g); for (let r = 0; r < 4; r++) cyl(M.metal, 0.07, 0.3, sx * 2.8 + ((r % 2) - 0.5) * 0.22, 1.05 + (r < 2 ? 0.12 : -0.12), 1.35, g, [Math.PI / 2, 0, 0]); void pod; }
      cyl(dk2, 0.09, 1.4, 0, 0.55, 2.2, g, [Math.PI / 2, 0, 0]);   // chin gun
      const gm = new THREE.Object3D(); gm.position.set(0, 0.55, 2.95); g.add(gm); m.muzzle = gm;
      const rl = new THREE.Object3D(); rl.position.set(-2.8, 1.05, 1.5); g.add(rl); const rr2 = new THREE.Object3D(); rr2.position.set(2.8, 1.05, 1.5); g.add(rr2); m.rocketL = rl; m.rocketR = rr2;
    }
    m.headSprites = [spr(0, 1.1, 2.3, 0xfff2d0, 1.6)]; m.tailSprites = [spr(0, 1.8, -5.0, 0xff1010, 0.8), spr(0, 3.0, 0, 0x30ff60, 0.6)];
    m.beacon = m.tailSprites[0];
    m.craftVisual = (v, dt) => {
      const sp = v.spool || 0; m.rotor.rotation.y += dt * (sp * 38); m.tailRotor.rotation.x += dt * sp * 50; m.disc.material.opacity = sp * 0.12;
      m.beacon.visible = Math.floor(v.G.time * 1.4) % 2 === 0;
      const tgt = v.tiltFwd || 0, roll = v.tiltRoll || 0;
      body.rotation.x = damp(body.rotation.x, tgt, 4, dt); body.rotation.z = damp(body.rotation.z, roll, 4, dt);
    };
  }
  m.spec = CRAFT_SPECS[type];
  return m;
}

// ---------- physics ----------
export function createCraftBody(phys, spec, x, y, z, heading) {
  const R = phys.R, w = phys.world, mass = 1300 * spec.mass;
  const q = { x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) };
  let desc = R.RigidBodyDesc.dynamic().setGravityScale(22 / 9.81).setTranslation(x, y, z).setRotation(q).setLinearDamping(spec.craft === 'heli' ? 0.5 : 0.05).setAngularDamping(spec.craft === 'heli' ? 3 : 2.5).setCanSleep(spec.craft !== 'boat').setCcdEnabled(true);
  if (spec.craft === 'heli' || spec.craft === 'tank') desc = desc.enabledRotations(false, true, false);
  if (spec.craft === 'jet') desc = desc.enabledRotations(false, false, false);
  const body = w.createRigidBody(desc);
  const hx = spec.craft === 'jet' ? spec.W * 0.34 : spec.W / 2 * (spec.craft === 'tank' ? 0.97 : 1), hz = spec.L / 2, hy = spec.craft === 'heli' ? 0.9 : spec.craft === 'tank' ? 1.0 : spec.craft === 'jet' ? 0.7 : 0.4;
  const col = w.createCollider(R.ColliderDesc.cuboid(hx, hy, spec.craft === 'heli' ? 3.2 : hz).setTranslation(0, spec.craft === 'heli' ? 0.3 : 0.0, 0).setMass(mass).setFriction(spec.craft === 'tank' || spec.craft === 'jet' ? 0 : 0.3).setFrictionCombineRule(spec.craft === 'tank' || spec.craft === 'jet' ? R.CoefficientCombineRule.Min : R.CoefficientCombineRule.Average).setRestitution(spec.craft === 'tank' ? 0 : 0.12).setCollisionGroups(grp(GR.VEH, GR.STATIC | GR.VEH | GR.PROP | GR.OBJ | GR.GLASS | GR.RAG | GR.RAGL)), body);
  const v = { body, col, ctrl: null, mass, spec };
  (phys.vehicles || (phys.vehicles = [])).push(v); phys.bodies.set(body.handle, v);
  return v;
}

export function driveCraft(veh, dt) {
  const { pv } = veh, b = pv.body, spec = pv.spec, G = veh.G, m = pv.mass;
  const hasDriver = veh.driver && !veh.dead;
  const t = b.translation(), lv = b.linvel(), q = b.rotation();
  const h = veh.h, fx = Math.sin(h), fz = Math.cos(h);
  const thr = hasDriver && veh.fuel > 0 ? veh.throttle : 0, brk = hasDriver ? veh.brake : 0, st = hasDriver ? veh.steer : 0;
  if (spec.craft === 'boat') {
    const wt = G.waterAt(t.x, t.z), wy = wt ? wt.y : -99;
    const inWater = wt && t.y < wy + 0.8;
    if (inWater) {
      const target = wy + 0.1, a = clamp((target - t.y) * 38 - lv.y * 7, -30, 40);
      const nvy = lv.y + (22 + a) * dt;
      const vf = lv.x * fx + lv.z * fz, vl = lv.x * fz - lv.z * fx;
      const acc = thr * spec.accel * (1 - Math.max(0, vf) / spec.maxSpeed) - brk * (vf > 0.5 ? 14 : spec.accel * 0.4 * Math.max(0, 1 + vf / 8));
      let nvx = lv.x + (fx * acc - fz * vl * 3.2) * dt, nvz = lv.z + (fz * acc + fx * vl * 3.2) * dt;
      nvx -= lv.x * 0.25 * dt; nvz -= lv.z * 0.25 * dt;
      b.setLinvel({ x: nvx, y: nvy, z: nvz }, true);
      const w = b.angvel(); b.setAngvel({ x: w.x * 0.5, y: lerp(w.y, -st * 1.15 * clamp(Math.abs(vf) / 4, 0, 1), 1 - Math.exp(-3 * dt)), z: w.z * 0.5 }, true);
      if (Math.abs(vf) > 4 && Math.random() < dt * 30) G.fx.tireSmoke(t.x - fx * 3 + rand(-0.8, 0.8), t.z - fz * 3 + rand(-0.8, 0.8));
    } else b.setLinvel({ x: lv.x * (1 - 2.5 * dt), y: lv.y, z: lv.z * (1 - 2.5 * dt) }, true);
    uprightAssist(b, 0.2);
  } else if (spec.craft === 'heli') {
    veh.spool = clamp((veh.spool || 0) + (hasDriver && veh.fuel > 0 ? 0.45 : -0.2) * dt, 0, 1);
    const sp = veh.spool, up = hasDriver ? (veh.hand ? 1 : 0) - (veh.down ? 1 : 0) : 0;
    const alt = t.y;
    // lift: hover at spool 1, collective changes climb rate
    const hover = sp > 0.85 ? 22 : sp * 18;
    let ay = hover + (sp > 0.85 ? up * 12 : 0);
    if (sp > 0.85 && !up) ay += clamp(-lv.y * 6, -12, 12);
    b.applyImpulse({ x: 0, y: m * ay * dt, z: 0 }, true);
    const f = thr - brk;
    const hv = Math.hypot(lv.x, lv.z), vf = lv.x * fx + lv.z * fz, vl = lv.x * fz - lv.z * fx;
    if (sp > 0.85) {
      const acc = f * spec.accel * (1 - clamp(vf / spec.maxSpeed, -1, 1) * Math.sign(f || 1));
      b.applyImpulse({ x: m * (fx * acc - lv.x * 0.15) * dt, y: 0, z: m * (fz * acc - lv.z * 0.15) * dt }, true);
    }
    const w = b.angvel(); b.setAngvel({ x: 0, y: lerp(w.y, -st * 1.5 * (sp > 0.85 ? 1 : 0.2), 1 - Math.exp(-4 * dt)), z: 0 }, true);
    veh.tiltFwd = damp(veh.tiltFwd || 0, f * 0.2, 3, dt); veh.tiltRoll = damp(veh.tiltRoll || 0, -st * 0.15, 3, dt);
  } else if (spec.craft === 'tank') {
    // tracked: speed follows the throttle, the hull pivots on the spot, sideways speed is killed (no drifting)
    const vf = lv.x * fx + lv.z * fz, run = hasDriver && veh.fuel > 0;
    const target = run ? (thr > 0 ? thr * spec.maxSpeed : brk > 0 ? -brk * spec.maxSpeed * 0.4 : 0) : 0;
    const a = Math.abs(target) < Math.abs(vf) || target * vf < 0 ? spec.accel * 2.2 : spec.accel;
    const nvf = vf + clamp(target - vf, -a * dt, a * dt);
    b.setLinvel({ x: fx * nvf, y: lv.y, z: fz * nvf }, true);
    const w = b.angvel(); b.setAngvel({ x: 0, y: lerp(w.y, run ? -st * (0.95 - Math.abs(nvf) / spec.maxSpeed * 0.35) : 0, 1 - Math.exp(-6 * dt)), z: 0 }, true);
    veh.trackSpeed = nvf;
  } else if (spec.craft === 'jet') {
    stepJet(veh, b, t, lv, hasDriver, thr, brk, st, dt);
  }
}
const _E = new THREE.Euler(0, 0, 0, 'YXZ'), _Q = new THREE.Quaternion();
// Two helps for a pilot who covers 100 km in half a minute. Altitude hold (key U): the aircraft keeps an altitude above sea level, the mouse pitch moves the
// target up and down instead of tilting the nose, and the terrain ahead (the real heights of the far land, looked at for the next few seconds) lifts the
// target over mountains. Low-altitude assist (always on above 120 m/s unless landing with VTOL or diving on purpose with the descend key): when the path
// ahead would come within 70 m of the ground (terrain, or a building in the ray ahead) the nose is pulled up, harder the closer it is, and PULL UP is shown.
function terrainAhead(t, h, s, secs) {
  const n = 18, reach = Math.min(s * secs, 24000), fx = Math.sin(h), fz = Math.cos(h); let m = -1e9, worst = 1e9;
  for (let i = 1; i <= n; i++) { const d = reach * i / n, g = landHeight(t.x + fx * d, t.z + fz * d, 64); if (g > m) m = g; worst = Math.min(worst, d); }
  return m;
}
function flightAssist(veh, t, s, pilot, pt, lim, dt, agl) {
  const G = veh.G, spec = veh.spec; veh.pullUp = false;
  if (!pilot || veh.dead || s < 120) { if (s < 120 && veh.altHold) { veh.altHold = null; } return pt; }
  const heading = veh.h, ahead = terrainAhead(t, heading, s, spec.hyper ? 5 : 8);
  if (veh.altHold != null) {
    // the mouse moves the target (climb rate up to ~220 m/s for the hypersonic one, 80 for the others)
    veh.altHold += clamp(veh.aimPitch ?? 0, -0.6, 0.6) * (spec.hyper ? 220 : 80) * dt;
    const want = Math.max(veh.altHold, ahead + 140), far = Math.max(500, s * 2.5);
    pt = clamp(Math.atan2(want - t.y, far), -0.5, 0.55);
  }
  // low altitude: the path ahead against the ground
  if (!veh.hand && !veh.down) {
    let risk = 0;
    const hz = Math.min(s * 4, 6000), sinP = Math.sin(veh.pitchA || 0), rise = t.y + sinP * hz;   // where the nose is heading, 4 s out
    const gAhead = terrainAhead(t, heading, s, 4);
    risk = Math.max(risk, 1 - clamp((Math.min(t.y, rise) - 70 - gAhead) / 260, 0, 1));
    if (s < 900 && Math.abs(t.x) < 1500 && Math.abs(t.z) < 1500 && t.y < 260) {   // over the city: a building in the ray ahead
      const hit = G.phys.ray(t.x, t.y, t.z, Math.sin(heading) * Math.cos(veh.pitchA || 0), Math.sin(veh.pitchA || 0), Math.cos(heading) * Math.cos(veh.pitchA || 0), s * 3.5, 1 | 16);
      if (hit) risk = Math.max(risk, 1 - clamp((hit.t - 60) / (s * 3), 0, 1));
    }
    if (risk > 0.05) { pt = Math.max(pt, clamp(0.12 + risk * 0.6, 0, lim)); veh.pullUp = risk > 0.35; }
  }
  return pt;
}
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// Fighter with VTOL: the nose follows the camera (mouse aim), speed follows the throttle level; below stall speed it sinks unless
// Space (vertical thrust) holds it up, which also lets it take off and land on a pad. No input = it keeps flying straight.
function stepJet(veh, b, t, lv, hasDriver, thr, brk, st, dt) {
  const spec = veh.spec, G = veh.G, pilot = hasDriver && veh.fuel > 0;
  b.setGravityScale(pilot ? 0 : 22 / 9.81, true);
  if (!pilot) { veh.thrLvl = Math.max(0, (veh.thrLvl || 0) - 0.3 * dt); veh.cmdV = null; if (veh.fast) { veh.pv.col.setSensor(false); veh.fast = false; const h = veh.hv || lv, k = Math.min(1, 300 / (Math.hypot(h.x, h.y, h.z) || 1)); b.setLinvel({ x: h.x * k, y: h.y * k, z: h.z * k }, true); veh.hv = null; } veh.jetS = Math.hypot(lv.x, lv.y, lv.z); return; }
  veh.thrLvl = clamp((veh.thrLvl ?? 0) + (thr - brk) * 0.55 * dt, 0, 1);
  const hit = G.phys.ray(t.x, t.y, t.z, 0, -1, 0, 40, 1 | 16), agl = hit ? hit.t - spec.cy : 99;
  const onGround = agl < 0.5;
  let s = veh.jetS ?? 0;
  // the hypersonic one crosses the world in half a minute: near the edge of the map it slows down and turns back by itself
  // the map's edge is measured in map coordinates (ADR-0017)
  if (spec.hyper) { const r = Math.max(Math.abs(t.x + CAPITAL.x), Math.abs(t.z + CAPITAL.z)), lim = WORLD_HALF - 3500; veh.returning = r > lim ? true : r < lim - 8000 ? false : !!veh.returning; }
  const target = Math.min(veh.thrLvl * spec.maxSpeed, veh.returning ? 700 : 1e9);
  s += clamp(target - s, -spec.accel * 1.6 * dt, spec.accel * dt);
  if (onGround && brk > 0.1 && s > 0) s = Math.max(0, s - 28 * dt);
  veh.jetS = s;
  let yaw = veh.h, pitch = veh.pitchA || 0, bank = veh.bank || 0;
  const vtol = veh.hand, down = veh.down;
  let vy = 0;
  const hover = clamp(1 - (s - 30) / 14, 0, 1);   // below ~30 m/s the thrust vectoring carries it, above ~44 the wings do
  if (onGround) {
    yaw += -st * 0.9 * clamp(s / 12, 0, 1) * dt; pitch = damp(pitch, 0, 6, dt); bank = damp(bank, 0, 6, dt);
    const lift = s > 46 && (veh.aimPitch || 0) > 0.05 || vtol;
    if (lift) vy = vtol ? 9 : 6;
    veh.airborne = !!lift;
  } else {
    veh.airborne = true;
    const dy = wrapPi((veh.returning ? Math.atan2(-t.x, -t.z) : (veh.aimYaw ?? yaw)) - yaw), turn = (veh.returning ? 1.8 : 1.25) * clamp(s / 55, 0.5, 1);
    yaw += clamp(dy, -turn * dt, turn * dt);
    const lim = 0.95 - hover * 0.6; let pt = clamp(veh.aimPitch ?? 0, -lim, lim);
    pt = flightAssist(veh, t, s, pilot, pt, lim, dt, agl);
    pitch = pitch + clamp(pt - pitch, -1.2 * dt, 1.2 * dt);
    bank = damp(bank, clamp(-dy * 1.3, -1.0, 1.0), 4, dt);
    vy = (vtol ? 9 : down ? -9 : -2.5) * hover;
  }
  const cp = Math.cos(pitch), vx = Math.sin(yaw) * cp * s, vz = Math.cos(yaw) * cp * s, vyy = Math.sin(pitch) * s * (1 - hover) + vy;
  const prevVy = lv.y;
  const cy = onGround && !veh.airborne ? Math.min(0, lv.y) : vyy;
  _E.set(-pitch, yaw, bank); _Q.setFromEuler(_E);
  if (spec.hyper && s > 300 && veh.airborne) {
    // Rapier caps body speed at 400 m/s: above that the body is moved by hand, as a sensor, and the path is swept with a ray so it still hits
    // buildings and the ground (the impact destroys it)
    if (!veh.fast) { veh.pv.col.setSensor(true); veh.fast = true; }
    const len = s * dt, dx = vx / s, dy = cy / s, dz = vz / s, hit = G.phys.ray(t.x, t.y, t.z, dx, dy, dz, len + 4, 1 | 16);
    let nx = t.x + vx * dt, ny = t.y + cy * dt, nz = t.z + vz * dt, crash = false;
    if (hit && hit.t < len + 4) { const d = Math.max(0, hit.t - 3); nx = t.x + dx * d; ny = t.y + dy * d; nz = t.z + dz * d; crash = true; }
    if (!crash && (Math.abs(nx) > 1400 || Math.abs(nz) > 1400 || Math.abs(t.x) > 1400 || Math.abs(t.z) > 1400)) {   // outside the city: the hills and mountains of the far land (no physics body that far)
      for (let u = 1 / 3; u <= 1.001; u += 1 / 3) { const sx = t.x + (nx - t.x) * u, sy = t.y + (ny - t.y) * u, sz = t.z + (nz - t.z) * u; if (sy - spec.cy < landHeight(sx, sz, 32) + 0.5) { nx = sx; ny = Math.max(sy, landHeight(sx, sz, 32) + spec.cy); nz = sz; crash = true; break; } }
    }
    b.setTranslation({ x: nx, y: ny, z: nz }, true); b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setRotation({ x: _Q.x, y: _Q.y, z: _Q.z, w: _Q.w }, true);
    veh.hv = { x: vx, y: cy, z: vz }; veh.cmdV = null; veh.pitchA = pitch; veh.bank = bank;
    if (crash) { const sp0 = s; veh.jetS = 0; veh.thrLvl = 0; veh.onImpact(sp0, nx, nz, null); veh.damage(1e6, null); }
    return;
  }
  if (veh.fast) { veh.pv.col.setSensor(false); veh.fast = false; veh.hv = null; }
  b.setLinvel({ x: vx, y: cy, z: vz }, true); veh.cmdV = { x: vx, y: cy, z: vz };   // what the flight model asked for: an impact is the part of it the world took away
  b.setRotation({ x: _Q.x, y: _Q.y, z: _Q.z, w: _Q.w }, true);
  veh.pitchA = pitch; veh.bank = bank;
  if (onGround && prevVy < -10 && !veh.landed) { veh.damage((-prevVy - 10) * 45, null); veh.landed = true; } else if (!onGround) veh.landed = false;
}
function uprightAssist(b, k) {
  const q = b.rotation(); const sy = 2 * Math.atan2(q.y, q.w);
  const qq = { x: 0, y: Math.sin(sy / 2), z: 0, w: Math.cos(sy / 2) };
  const l = (a, c) => a + (c - a) * k;
  const nq = { x: l(q.x, qq.x), y: l(q.y, qq.y), z: l(q.z, qq.z), w: l(q.w, qq.w) }; const n = Math.hypot(nq.x, nq.y, nq.z, nq.w) || 1;
  b.setRotation({ x: nq.x / n, y: nq.y / n, z: nq.z / n, w: nq.w / n }, true);
}
export function motoAssist(b) { uprightAssist(b, 0.12); const w = b.angvel(); b.setAngvel({ x: w.x * 0.3, y: w.y, z: w.z * 0.3 }, true); }
