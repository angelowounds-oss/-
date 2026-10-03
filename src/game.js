import * as THREE from 'three';
import { buildWorld, N, P, R, SW, LANE, HALF, roadC, nodePos } from './world.js';
import { createRain, Particles, Tracers, LightPool } from './fx.js';
import { Vehicle, CAR_COLORS } from './vehicle.js';
import { Human, WEAPONS } from './human.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { glowSpriteMat } from './models.js';
import { timeUniform, flashUniform } from './shaders.js';
import { clamp, lerp, damp, dampAngle, angDiff, rand, el, TAU, smooth } from './util.js';
import { QUALITY } from './engine.js';
import { loadAssets } from './assets.js';
import { Physics } from './physics.js';
import { Buildings } from './building.js';
import { Interact } from './interact.js';
import { Character } from './character.js';

const V3 = THREE.Vector3;
const SAVE_KEY = 'neon_city_v9';
const CAR_TYPES = ['sedan', 'sedan', 'sedan', 'sport', 'suv', 'suv', 'truck'];

export class Game {
  constructor(eng) {
    this.eng = eng; this.scene = eng.scene; this.camera = eng.camera;
    this.time = 0; this.dt = 1 / 60; this.running = false; this.paused = false;
    this.vehicles = []; this.humans = []; this.pickups = [];
    this.audio = new Audio(); this.input = new Input();
    this.wanted = 0; this.heat = 0; this.evade = 0; this.copTimer = 0;
    this.shakeAmt = 0; this.flashT = 0; this.nextLightning = rand(8, 18);
    this.tmpV = new V3(); this.tmpV2 = new V3(); this.hit = { t: 0 };
    this.recoilKick = 0; this.hitMarker = 0; this.killFeed = [];
    this.cam = { yaw: Math.PI, pitch: -0.15, dist: 4.2, shoulder: 0.45, fov: 65, mode: 0, offsetT: 0, pos: new V3(), smoothPos: new V3(), speedFx: 0 };
    this.stats = { kills: 0, missions: 0 };
    this.saveData = this.load();
    this.state = this.saveData.world || { doors: {}, glass: {}, taken: {}, moved: {} };
    this.interact = new Interact(this);
    this.indoor = false;
  }

  load() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; } }
  save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ cash: this.cash, mission: this.missionIndex, kills: this.stats.kills, world: this.state })); } catch { /* ignore */ } }

  // ====================================================================
  async init(progress) {
    const { eng } = this;
    progress(0.05, '에셋 로딩 중…');
    await loadAssets();
    progress(0.1, '도시 생성 중…');
    await new Promise((r) => setTimeout(r, 30));
    this.world = buildWorld(this.scene, eng.q);
    this.phys = new Physics(this.RAPIER); this.phys.addStatic(this.world.colliders);
    this.buildings = new Buildings(this);
    this.interact.providers.push((pl, out) => this.vehicleProvider(pl, out));
    if (this.world.bins) this.phys.addProps(this.world.bins.mesh, this.world.bins.list);
    progress(0.5, '효과 · 시스템 준비…');
    await new Promise((r) => setTimeout(r, 30));
    const q = eng.q;
    this.rain = createRain(this.scene, q.rain);
    this.sparksP = new Particles(this.scene, 900, true);
    this.smokeP = new Particles(this.scene, 700, false);
    this.fireP = new Particles(this.scene, 500, true);
    this.tracers = new Tracers(this.scene, 48);
    this.lights = new LightPool(this.scene, 5);
    this.head = new THREE.SpotLight(0xfff0d0, 0, 80, 0.5, 0.6, 1.6); this.scene.add(this.head, this.head.target);
    this.fx = this.makeFX();
    this.setupPlayer();
    this.buildMinimap();
    this.buildBeacon();
    progress(0.75, '시민과 교통 배치 중…');
    await new Promise((r) => setTimeout(r, 30));
    this.cash = this.saveData.cash ?? 500;
    this.missionIndex = this.saveData.mission ?? 0;
    this.cacheUI();
    this.bindUI();
    this.populate();
    this.spawnPickups();
    this.startMission(this.missionIndex);
    progress(1, '준비 완료');
  }

  makeFX() {
    const G = this;
    return {
      sparks(x, y, z, power = 8, c = [1, 0.7, 0.3], n = 8) {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * TAU, s = rand(0.3, 1) * power;
          G.sparksP.emit(x, y, z, Math.cos(a) * s, rand(0.5, 1) * power * 0.7, Math.sin(a) * s, rand(0.25, 0.6), rand(0.08, 0.16), c[0] * 3, c[1] * 3, c[2] * 3, 1, -18, 0.8);
        }
      },
      smoke(x, y, z, big = 1) { G.smokeP.emit(x + rand(-0.2, 0.2), y, z + rand(-0.2, 0.2), rand(-0.6, 0.6), rand(1.5, 3), rand(-0.6, 0.6), rand(1.2, 2.2), rand(0.8, 1.6) * big, 0.07, 0.07, 0.09, 0.8, 0.2, 0.4); },
      fire(x, y, z) { G.fireP.emit(x, y, z, rand(-0.4, 0.4), rand(2, 4.5), rand(-0.4, 0.4), rand(0.4, 0.9), rand(0.7, 1.5), 3.2, rand(0.7, 1.4), 0.2, 1, 0, 0.6); if (Math.random() < 0.25) G.smokeP.emit(x, y + 1, z, rand(-1, 1), rand(2, 4), rand(-1, 1), rand(1.5, 2.8), rand(1.2, 2.4), 0.05, 0.05, 0.06, 0.8, 0.3, 0.3); },
      tireSmoke(x, z) { G.smokeP.emit(x, 0.2, z, rand(-1, 1), rand(0.3, 1), rand(-1, 1), rand(0.6, 1.1), rand(0.7, 1.2), 0.3, 0.3, 0.33, 0.45, 0.3, 0.6); },
      muzzle(p, dir) {
        for (let i = 0; i < 3; i++) G.sparksP.emit(p.x + dir.x * 0.1, p.y + dir.y * 0.1, p.z + dir.z * 0.1, dir.x * rand(3, 9) + rand(-1, 1), dir.y * rand(3, 9) + rand(-1, 1), dir.z * rand(3, 9) + rand(-1, 1), rand(0.04, 0.09), rand(0.25, 0.5), 4, 2.6, 1, 1, 0, 1);
        G.lights.flash(p.x, p.y, p.z, 0xffc070, 7, 16, 0.07);
      },
    };
  }

  // ====================================================================
  setupPlayer() {
    const pl = new Human(this, 'player', { hp: 100, weapon: 1, look: { top: 0x2a3f55, pants: 0x1a2230, trim: [0.2, 0.9, 1], visor: [0.2, 0.95, 1], hair: 0x0b0b10, skin: 0xd9a47c } });
    pl.group.visible = true;
    this.scene.add(pl.group);
    const pz0 = this.world.plaza; pl.x = pz0.cx + 22; pl.z = pz0.cz + 22; pl.ry = Math.PI;
    pl.hpv = 100; pl.armor = 0;
    pl.ammo = [{ clip: 12, reserve: 96 }, { clip: 30, reserve: 150 }];
    pl.cur = 0; pl.reloadT = 0; pl.fireCd = 0; pl.weaponDrawn = false; pl.spread = 0; pl.dead = false;
    pl.m.pistol.visible = true;
    pl.body3 = new Character(this.phys, pl.x, 0, pl.z);
    this.player = pl;
    this.playerOnFoot = true; this.vehicle = null; this.deadT = 0;
    this.cam.yaw = Math.PI;
  }

  populate() {
    const q = this.eng.q, w = this.world;
    // parked cars along curbs
    let tries = 0;
    while (this.vehicles.filter((v) => v.kind === 'parked').length < q.parked && tries++ < 400) {
      const i = Math.floor(rand(0, N + 1)), j = Math.floor(rand(0, N)), side = Math.random() < 0.5 ? 1 : -1, ns = Math.random() < 0.5;
      const t = rand(0.18, 0.82), along = roadC(j) + R / 2 + (P - R) * t;
      const off = (R / 2 - 1.55) * side;
      const type = CAR_TYPES[Math.floor(Math.random() * CAR_TYPES.length)];
      const v = new Vehicle(this, type, CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)], 'parked');
      let x, z, h;
      if (ns) { x = roadC(i) + off; z = along; h = side > 0 ? Math.PI : 0; } else { x = along; z = roadC(i) + off; h = side > 0 ? -Math.PI / 2 : Math.PI / 2; }
      if (this.vehicles.some((o) => Math.hypot(o.x - x, o.z - z) < 7)) continue;
      v.x = x; v.z = z; v.h = h; v.awake = false;
      this.addVehicle(v);
    }
    // traffic
    for (let k = 0; k < q.traffic; k++) this.spawnTraffic(true);
    // pedestrians
    for (let k = 0; k < q.npc; k++) this.spawnCivilian(true);
  }
  addVehicle(v) { this.vehicles.push(v); this.scene.add(v.group); v.group.visible = true; v.attachPhysics(this.phys); if (v.kind === 'parked') v.pv.body.sleep(); v.syncMesh(); return v; }
  removeVehicle(v) { const i = this.vehicles.indexOf(v); if (i >= 0) this.vehicles.splice(i, 1); v.detachPhysics(); this.scene.remove(v.group); }

  randomLane(minD, maxD) {
    const pl = this.focusPos();
    for (let tr = 0; tr < 14; tr++) {
      const i = Math.floor(rand(0, N + 1)), j = Math.floor(rand(0, N + 1));
      const horiz = Math.random() < 0.5;
      const di = horiz ? (Math.random() < 0.5 ? 1 : -1) : 0, dj = horiz ? 0 : (Math.random() < 0.5 ? 1 : -1);
      if (i - di < 0 || i - di > N || j - dj < 0 || j - dj > N) continue;
      if (i + di < 0 || i + di > N || j + dj < 0 || j + dj > N) continue;
      // car on edge from (i-di..) to (i,j)->(i+di,...)
      const frac = rand(0.25, 0.7);
      const x = lerp(roadC(i), roadC(i + di), frac) + -dj * LANE, z = lerp(roadC(j), roadC(j + dj), frac) + di * LANE;
      const d = Math.hypot(x - pl.x, z - pl.z);
      if (d < minD || d > maxD) continue;
      if (this.inView(x, z) && d < 170) continue;
      if (this.vehicles.some((o) => Math.hypot(o.x - x, o.z - z) < 11)) continue;
      return { i, j, di, dj, frac };
    }
    return null;
  }
  inView(x, z) {
    const c = this.camera; const f = this.tmpV.set(0, 0, -1).applyQuaternion(c.quaternion);
    const dx = x - c.position.x, dz = z - c.position.z; const d = Math.hypot(dx, dz) || 1;
    return (dx * f.x + dz * f.z) / (d * Math.hypot(f.x, f.z) + 1e-5) > 0.35;
  }
  spawnTraffic(initial = false, existing = null) {
    const lane = this.randomLane(initial ? 40 : 90, initial ? 260 : 210);
    if (!lane) return null;
    const type = CAR_TYPES[Math.floor(Math.random() * CAR_TYPES.length)];
    const v = existing || new Vehicle(this, type, CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)], 'traffic', { taxi: Math.random() < 0.12 && type === 'sedan' });
    v.kind = 'traffic'; v.driver = 'ai';
    v.setRoute(lane.i, lane.j, lane.di, lane.dj, lane.frac);
    // route(i,j,di,dj,frac): car between node (i,j) and (i+di,j+dj)... set properly
    if (!existing) this.addVehicle(v);
    return v;
  }
  spawnCivilian(initial = false, existing = null) {
    const pl = this.focusPos();
    for (let tr = 0; tr < 12; tr++) {
      const i = Math.floor(rand(0, N + 1)), j = Math.floor(rand(0, N + 1)), sx = Math.random() < 0.5 ? 1 : -1, sz = Math.random() < 0.5 ? 1 : -1;
      const x = roadC(i) + sx * (R / 2 + SW / 2), z = roadC(j) + sz * (R / 2 + SW / 2);
      const d = Math.hypot(x - pl.x, z - pl.z);
      if (d < (initial ? 12 : 60) || d > (initial ? 220 : 160)) continue;
      const h = existing || new Human(this, 'civ', { hp: 40, look: { top: new THREE.Color().setHSL(Math.random(), 0.5, 0.2).getHex(), pants: new THREE.Color().setHSL(Math.random(), 0.2, 0.1).getHex(), trim: Math.random() < 0.35 ? [[1, 0.2, 0.8], [0.2, 0.9, 1], [1, 0.6, 0.2]][Math.floor(Math.random() * 3)] : null, cap: Math.random() < 0.2 ? 0x1b1d26 : null } });
      h.state = 'walk'; h.dead = false; h.hp = 40; h.knock = 0;
      h.placeOnSidewalk(i, j, sx, sz);
      if (!existing) { this.humans.push(h); this.scene.add(h.group); }
      return h;
    }
    return null;
  }

  // ====================================================================
  // Pickups
  spawnPickups() {
    const geo = new THREE.OctahedronGeometry(0.35, 0);
    const defs = [{ type: 'health', c: [0.2, 1, 0.5] }, { type: 'armor', c: [0.2, 0.7, 1] }, { type: 'ammo', c: [1, 0.8, 0.2] }];
    for (let k = 0; k < 18; k++) {
      const d = defs[k % 3];
      const i = Math.floor(rand(0, N + 1)), j = Math.floor(rand(0, N + 1));
      this.makePickup(d.type, d.c, roadC(i) + (Math.random() < 0.5 ? 1 : -1) * 12.5, roadC(j) + (Math.random() < 0.5 ? 1 : -1) * 12.5, geo);
    }
    this.pickupGeo = geo;
  }
  makePickup(type, c, x, z, geo = this.pickupGeo, value = 0) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(c[0], c[1], c[2]).multiplyScalar(2.6), toneMapped: false }));
    m.position.set(x, 1, z);
    const sp = new THREE.Sprite(glowSpriteMat(new THREE.Color(c[0], c[1], c[2]), 1.6)); sp.scale.setScalar(2.2); m.add(sp);
    this.scene.add(m);
    const p = { type, mesh: m, x, z, respawn: 0, value, active: true, ph: Math.random() * 6 };
    this.pickups.push(p); return p;
  }

  // ====================================================================
  cacheUI() {
    const g = el;
    this.ui = { hp: g('hpFill'), ar: g('arFill'), cash: g('cash'), stars: g('stars'), mText: g('mText'), mTitle: g('mTitle'), mDist: g('mDist'), wName: g('wName'), ammo: g('ammo'), speedo: g('speedo'), spd: g('spd'), carHp: g('carHpFill'), hint: g('hint'), toast: g('toast'), cross: g('cross'), dmg: g('dmg'), dir: g('dir'), feed: g('feed'), flash: g('flash'), hud: g('hud'), mini: g('minimap'), weapon: g('weapon'), fps: g('fps'), lt: g('letterT'), lb: g('letterB') };
    this.minictx = this.ui.mini.getContext('2d');
    this._ui = {};
  }
  setText(key, node, v) { if (this._ui[key] !== v) { this._ui[key] = v; node.textContent = v; } }
  setHTML(key, node, v) { if (this._ui[key] !== v) { this._ui[key] = v; node.innerHTML = v; } }
  toast(text, sub = '') { const t = this.ui.toast; t.innerHTML = text + (sub ? `<small>${sub}</small>` : ''); t.classList.add('on'); clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('on'), 2600); }
  feed(text, color = '#fff') { const d = document.createElement('div'); d.style.color = color; d.textContent = text; this.ui.feed.appendChild(d); while (this.ui.feed.children.length > 5) this.ui.feed.firstChild.remove(); setTimeout(() => d.remove(), 5000); }

  bindUI() {
    const u = el;
    u('pause').addEventListener('pointerdown', (e) => e.stopPropagation());
    u('resume').onclick = () => this.setPaused(false);
    u('reset').onclick = () => { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } location.reload(); };
    u('qSel').value = String(this.eng.qIndex);
    u('qSel').onchange = (e) => { this.eng.setQuality(+e.target.value); this.eng.onQuality?.(); };
    u('vol').oninput = (e) => this.audio.setVolume(+e.target.value);
    u('musicOn').onchange = (e) => this.audio.setMusic(e.target.checked);
    u('sens').oninput = (e) => (this.input.sens = +e.target.value);
    u('fpsOn').onchange = (e) => (this.ui.fps.style.display = e.target.checked ? 'block' : 'none');
    this.ui.fps.style.display = 'none';
    this.input.onLockChange = (locked) => { if (!locked && this.running && !this.paused && !this.input.touch && !this.uiModal) this.setPaused(true); };
  }
  setPaused(p) {
    this.paused = p; el('pause').classList.toggle('on', p);
    if (p) this.input.unlock(); else this.input.lock();
  }
  attract(dt) {
    this.time += dt; timeUniform.value = this.time;
    const pz = this.world.plaza, c = this.camera;
    this.attractA = (this.attractA || 0) + dt * 0.07;
    const a = this.attractA, r = 85;
    c.position.set(pz.cx + Math.cos(a) * r, 26 + Math.sin(a * 1.7) * 6, pz.cz + Math.sin(a) * r);
    c.lookAt(pz.cx, 22, pz.cz);
    this.cam.yaw = Math.PI - a;
    this.updateVehicles(dt); this.updateHumans(dt); this.fxUpdate(dt);
    this.renderFrame(dt, false);
  }
  start() {
    this.audio.init();
    const pl = this.player, sp = this.world.spawn;
    pl.x = sp.x; pl.z = sp.z; pl.ry = sp.ry; this.cam.yaw = sp.ry; pl.group.visible = true;
    for (const v of this.vehicles) if (v.kind === 'traffic') this.recycleTraffic(v);
    for (const h of this.humans) if (h.team === 'civ') { this.spawnCivilian(false, h); }
    this.running = true;
    this.ui.hud.classList.add('on');
    this.input.lock();
    document.body.classList.add('onfoot');
    this.ui.lt.classList.add('on'); this.ui.lb.classList.add('on');
    setTimeout(() => { this.ui.lt.classList.remove('on'); this.ui.lb.classList.remove('on'); }, 1800);
    this.toast('NEON CITY', 'WELCOME BACK, RUNNER');
  }

  // ====================================================================
  // Main update
  update(rawDt) {
    const input = this.input;
    if (input.edge('pause') && this.running) this.setPaused(!this.paused);
    const dt = Math.min(rawDt, 0.05);
    this.frameDt = dt;
    if (!this.running || this.paused) { input.read(dt); this.renderFrame(dt, true); return; }
    this.time += dt; timeUniform.value = this.time;
    const inp = input.read(dt);
    this.inp = inp;
    const slow = this.player.dead ? 0.35 : 1;
    const sdt = dt * slow;
    this.updatePlayer(sdt, inp);
    this.updateVehicles(sdt);
    this.updateHumans(sdt);
    this.updatePolice(sdt);
    this.updateMission(sdt);
    this.updateTimed(sdt);
    { const f = this.vehicle || this.player; this.buildings.update(sdt, f.x, f.z, f.y || 0); this.updateIndoor(); }
    this.updatePickups(sdt);
    this.updateAmbient(sdt);
    this.updateCamera(dt, inp);
    this.fxUpdate(sdt);
    this.updateHUD(dt);
    this.audioUpdate(dt);
    this.renderFrame(dt, false);
  }

  renderFrame(dt, still) {
    const { eng, camera } = this;
    const pl = this.player;
    const focus = this.vehicle ? this.vehicle : pl;
    this.world.animate(dt, this.time, camera.position);
    if (!still) {
      this.fakeT = (this.fakeT || 0) - dt;
      if (this.fakeT <= 0) { this.fakeT = 0.12; this.world.updateFakeLights(focus.x, focus.z); }
      this.tlT = (this.tlT || 0) - dt;
      const ph = Math.floor(this.time * 2);
      if (ph !== this.lastPh) { this.lastPh = ph; this.world.updateTrafficLights(this.time); }
    }
    // moon follows focus (snapped to texel grid to avoid shimmer)
    const moon = eng.moon, snap = 4;
    const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
    moon.target.position.set(fx, 0, fz);
    moon.position.set(fx - 55, 120, fz - 70);
    this.rain.material.uniforms.uCam.value.copy(camera.position);
    const g = eng.grade.uniforms;
    g.uSpeed.value = damp(g.uSpeed.value, this.vehicle ? clamp((this.vehicle.speed - 28) / 30, 0, 1) : 0, 3, dt);
    g.uDamage.value = damp(g.uDamage.value, 0, 2.2, dt);
    if (this.dmgPulse) { g.uDamage.value = Math.max(g.uDamage.value, this.dmgPulse); this.dmgPulse = 0; }
    eng.render(dt);
  }

  // ====================================================================
  // PLAYER
  updatePlayer(dt, inp) {
    const pl = this.player, cam = this.cam, G = this;
    if (pl.dead) {
      this.deadT += dt / 0.35;
      if (this.deadT > 4.2) this.respawn();
      pl.group.visible = true;
      pl.update(dt);
      return;
    }
    if (this.frozen()) { for (const e of ['use', 'jump', 'reload', 'swap', 'cam']) this.input.edge(e); pl.animate(dt, 0); return; }
    // camera look
    const k = 0.0022 * (pl.aiming ? 0.6 : 1);
    cam.yaw -= inp.lookX * k; cam.pitch = clamp(cam.pitch - inp.lookY * k, -1.2, 1.05);
    if (inp.lookX || inp.lookY) cam.offsetT = 2.2;
    if (this.input.edge('swap')) this.switchWeapon(pl.cur ^ 1);
    if (this.input.edge('w1')) this.switchWeapon(0);
    if (this.input.edge('w2')) this.switchWeapon(1);
    if (inp.wheel) this.switchWeapon(clamp(pl.cur + inp.wheel, 0, 1));
    this.input.edge('lights');
    if (this.playerOnFoot) this.footControl(dt, inp);
    else this.driveControl(dt, inp);
    this.regen = (this.regen || 0) + dt;
  }

  switchWeapon(i) {
    const pl = this.player; if (i === pl.cur || !this.playerOnFoot) return;
    pl.cur = i; pl.setWeapon(i); pl.reloadT = 0; pl.fireCd = 0.25;
    this.audio.tone?.(500, 0.05, 'square', 0.06);
  }

  footControl(dt, inp) {
    const pl = this.player, cam = this.cam, w = WEAPONS[pl.cur], ammo = pl.ammo[pl.cur];
    pl.group.visible = true;
    const aim = inp.aim; pl.aiming = aim;
    const sprint = inp.sprint && !aim && !inp.fire && inp.my > 0.3;
    const fwdX = Math.sin(cam.yaw), fwdZ = Math.cos(cam.yaw), rX = -Math.cos(cam.yaw), rZ = Math.sin(cam.yaw);
    let mx = inp.mx, my = inp.my; const mag = Math.min(1, Math.hypot(mx, my));
    let dx = fwdX * my + rX * mx, dz = fwdZ * my + rZ * mx;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const base = aim ? 2.6 : sprint ? 8.4 : 5.2;
    const spd = base * (mag < 0.15 ? 0 : clamp(mag * 1.1, 0.5, 1));
    pl.vx = damp(pl.vx, dx * spd, 10, dt); pl.vz = damp(pl.vz, dz * spd, 10, dt);
    const c3 = pl.body3;
    const impact = c3.move(dt, pl.vx, pl.vz, this.input.edge('jump') ? 7.2 : 0);
    pl.x = c3.x; pl.y = c3.y; pl.z = c3.z; pl.vy = c3.vy;
    if (impact > 12) { this.hurtPlayer((impact - 12) * 5, null, 'fall'); this.shake(0.4); this.audio.impact(0.8, 0); }
    if (c3.y < -30) c3.teleport(this.world.spawn.x, 0, this.world.spawn.z);
    // vehicles block player
    { const ox = pl.x, oz = pl.z; this.pushOutOfVehicles(pl, 0.38); if (pl.x !== ox || pl.z !== oz) c3.shift(pl.x - ox, 0, pl.z - oz); }
    pl.speed = Math.hypot(pl.vx, pl.vz);
    // facing
    const shooting = inp.fire || aim;
    if (shooting || pl.aimT > 0) pl.ry = dampAngle(pl.ry, cam.yaw, 16, dt);
    else if (pl.speed > 0.5) pl.ry = dampAngle(pl.ry, Math.atan2(pl.vx, pl.vz), 11, dt);
    pl.forceAim = shooting || pl.fireT > 0; pl.aimPitch = cam.pitch;
    if (shooting) pl.aimT = 1.2;
    pl.weaponDrawn = shooting || pl.aimT > 0;
    // reload / fire
    pl.fireCd -= dt; pl.spread = Math.max(0, pl.spread - dt * 0.05);
    if (pl.reloadT > 0) { pl.reloadT -= dt; if (pl.reloadT <= 0) { const need = w.clip - ammo.clip, take = Math.min(need, ammo.reserve); ammo.clip += take; ammo.reserve -= take; } }
    if ((this.input.edge('reload') || (ammo.clip === 0 && inp.fire && ammo.reserve > 0)) && pl.reloadT <= 0 && ammo.clip < w.clip && ammo.reserve > 0) { pl.reloadT = w.reload; this.audio.reload(); }
    if (inp.fire && pl.reloadT <= 0 && pl.fireCd <= 0) {
      if (ammo.clip > 0) {
        if (w.auto || !pl.fireHeld) this.playerShoot(w, ammo);
      } else if (!pl.fireHeld) { this.audio.empty(); pl.fireCd = 0.3; }
    }
    pl.fireHeld = inp.fire;
    // interactions: vehicles, building doors, interior objects
    this.nearInteract = this.findInteract(pl);
    { const e1 = this.input.edge('use'), e2 = this.input.edge('horn'), e3 = this.input.edge('verb3');
      if (!this.frozen() && this.nearInteract) { if (e1) this.interact.run(this.nearInteract, 'F', pl); else if (e2) this.interact.run(this.nearInteract, 'G', pl); else if (e3) this.interact.run(this.nearInteract, 'T', pl); } }
    pl.animate(dt, spd);
    pl.m.body.rotation.x += 0; // keep
    // hp regen outside of combat
    if (pl.hpv < 100 && this.time - (this.lastHurt || -99) > 8) pl.hpv = Math.min(100, pl.hpv + dt * 2);
  }
  distToVehicle(x, z, v) {
    const dx = x - v.x, dz = z - v.z, s = Math.sin(v.h), c = Math.cos(v.h);
    const lf = Math.abs(dx * s + dz * c) - v.L / 2, ll = Math.abs(dx * c - dz * s) - v.W / 2;
    return Math.hypot(Math.max(lf, 0), Math.max(ll, 0));
  }
  pushOutOfVehicles(h, r) {
    for (const v of this.vehicles) {
      if (!v.group.visible) continue;
      const dx = h.x - v.x, dz = h.z - v.z;
      if (Math.abs(dx) > 5 || Math.abs(dz) > 5) continue;
      const s = Math.sin(v.h), c = Math.cos(v.h);
      const lf = dx * s + dz * c, ll = dx * c - dz * s;
      const hl = v.L / 2 + r, hw = v.W / 2 + r;
      if (Math.abs(lf) < hl && Math.abs(ll) < hw) {
        if (hl - Math.abs(lf) < hw - Math.abs(ll)) { const k = Math.sign(lf || 1) * hl; h.x += s * (k - lf); h.z += c * (k - lf); }
        else { const k = Math.sign(ll || 1) * hw; h.x += c * (k - ll); h.z -= s * (k - ll); }
      }
    }
  }

  frozen() { return this.uiModal || !!this.timed; }
  findInteract(pl) {
    const sel = this.interact.query(pl);
    return sel;
  }
  vehicleProvider(pl, out) {
    let best = null, bd = 3.6;
    for (const v of this.vehicles) { if (!v.group.visible || v.dead) continue; const d = this.distToVehicle(pl.x, pl.z, v); if (d < bd) { bd = d; best = v; } }
    if (!best) return;
    const v = best;
    out.push({ x: v.x, z: v.z, r: Math.max(v.L, v.W) / 2 + 3.7, name: '차량', verbs: [{ key: 'F', label: () => (v.driver === 'ai' ? '차량 강탈' : '차량 탑승'), run: () => this.enterVehicle(v) }] });
  }
  focusPos() { return this.vehicle || this.player; }
  // timed action with progress bar (lockpick, hacking, eating...)
  beginTimed(label, secs, done, cancelDist = 3) {
    if (this.timed) return;
    this.timed = { label, t: 0, secs, done, x: this.player.x, z: this.player.z, cd: cancelDist };
    this.setProgress(0, label);
  }
  updateTimed(dt) {
    const T = this.timed; if (!T) return;
    const pl = this.player;
    if (pl.dead || Math.hypot(pl.x - T.x, pl.z - T.z) > T.cd || this.input.edge('pause')) { this.timed = null; this.setProgress(null); this.toast('중단'); return; }
    T.t += dt; this.setProgress(T.t / T.secs, T.label);
    if (T.t >= T.secs) { this.timed = null; this.setProgress(null); T.done(); }
  }
  setProgress(p, label) { const b = el('prog'); if (p == null) { b.classList.remove('on'); return; } b.classList.add('on'); el('progLbl').textContent = label || ''; el('progFill').style.width = Math.min(100, p * 100) + '%'; }
  fadeTo(v) { const f = el('fade'); f.style.opacity = v; return new Promise((r) => setTimeout(r, 380)); }
  // is the player under a roof (hides rain, muffles audio)?
  updateIndoor() {
    const pl = this.player, B = this.buildings;
    const b = B.at(pl.x, pl.z); let inside = false, info = null;
    if (b && b.open && !this.vehicle) {
      const k = b.levelAt(pl.y + 0.3), L = b.levels[k];
      const r = L.rect;
      inside = L.tier !== 'roof' && pl.y < b.roofY - 0.3 && pl.x > r.x0 && pl.x < r.x1 && pl.z > r.z0 && pl.z < r.z1 && b.floors.has(k);
      info = { b, k, L };
    }
    if (inside !== this.indoor) { this.indoor = inside; this.audio.setIndoor?.(inside); this.rain.visible = !inside; this.eng.hemi.intensity = inside ? 0.5 : 0.22; }
    this.where = inside ? info : null;
  }
  openElevatorUI(b) {
    const list = b.levels, cur = b.elev.level;
    const box = el('elevBtns'); box.innerHTML = '';
    const names = { lobby: '로비', retail: '상점가', apartment: '레지던스', office: '오피스', hotel: '호텔', roof: '옥상' };
    for (let k = list.length - 1; k >= 0; k--) {
      const f = list[k];
      const bt = document.createElement('button'); bt.type = 'button'; bt.className = 'eb' + (k === cur ? ' cur' : '');
      bt.innerHTML = `<b>${f.tier === 'roof' ? 'R' : k + 1}</b><small>${names[f.type]}</small>`;
      bt.onclick = () => { this.closeElevatorUI(); b.elev.send(k); };
      box.appendChild(bt);
    }
    el('elevTitle').textContent = b.name;
    el('elev').classList.add('on'); this.uiModal = true; this.input.unlock();
    this._elevKey = (e) => { if (e.code === 'Escape') { e.stopImmediatePropagation(); this.closeElevatorUI(); } };
    addEventListener('keydown', this._elevKey, true);
  }
  closeElevatorUI() { el('elev').classList.remove('on'); this.uiModal = false; removeEventListener('keydown', this._elevKey, true); this.input.lock(); }
  noteCrime(pl, kind, heat) { if (this.wanted > 0 || Math.random() < 0.6) this.addHeat(heat); }
  enterVehicle(v) {
    const pl = this.player;
    // carjack AI driver
    if (v.driver === 'ai') {
      const d = this.spawnCivilian(false);
      if (d) { d.x = v.x + Math.cos(v.h) * (v.W / 2 + 1); d.z = v.z - Math.sin(v.h) * (v.W / 2 + 1); d.state = 'flee'; d.fleeT = 8; d.threat = pl; d.group.visible = true; }
      this.addHeat(12); this.feed('차량 강탈', '#ff8a5c');
    }
    this.vehicle = v; v.driver = 'player'; v.kind = v.kind === 'police' ? 'police' : 'player'; v.awake = true; v.pv.body.wakeUp();
    v.setLights(true);
    this.playerOnFoot = false; pl.group.visible = false;
    document.body.classList.remove('onfoot'); document.body.classList.add('incar');
    this.ui.speedo.classList.add('on');
    this.audio.door();
    this.cam.mode = 0; this.cam.yaw = v.h; this.cam.pitch = -0.12;
    this.onEnterVehicle?.(v);
  }
  exitVehicle(force = false) {
    const v = this.vehicle, pl = this.player; if (!v) return;
    const s = Math.sin(v.h), c = Math.cos(v.h);
    // choose free side
    let placed = false;
    for (const side of [1, -1]) {
      const px = v.x + c * (v.W / 2 + 0.9) * side * -1, pz = v.z - s * (v.W / 2 + 0.9) * side * -1;
      const r = this.world.colliders.resolve(px, pz, 0.4, 0);
      if (!r.hit) { pl.x = px; pl.z = pz; placed = true; break; }
    }
    if (!placed) { pl.x = v.x + c * (v.W / 2 + 1); pl.z = v.z - s * (v.W / 2 + 1); }
    v.driver = null; v.throttle = 0; v.brake = 0.5; v.steer = 0; v.hand = false;
    if (v.kind === 'player') v.kind = 'parked';
    this.vehicle = null; this.playerOnFoot = true; pl.group.visible = true; pl.y = 0; pl.vx = pl.vz = 0; pl.body3.teleport(pl.x, 0, pl.z);
    pl.hpv = Math.max(pl.hpv, 1);
    document.body.classList.add('onfoot'); document.body.classList.remove('incar');
    this.ui.speedo.classList.remove('on');
    this.cam.yaw = v.h; this.audio.door();
  }
  driveControl(dt, inp) {
    const v = this.vehicle, pl = this.player;
    v.throttle = inp.gas; v.brake = inp.brake; v.steer = inp.steer; v.hand = inp.hand;
    // gamepad/keys give both throttle & brake semantic via my; if reversing handled by physics
    if (this.input.edge('use') && !this.player.dead) this.exitVehicle();
    if (this.input.edge('horn')) { this.audio.horn(); this.alertCivs(v.x, v.z, 25); }
    if (this.input.edge('cam')) this.cam.mode = (this.cam.mode + 1) % 3;
    if (this.input.edge('lights')) v.setLights(!v.lightsOn);
    pl.x = v.x; pl.z = v.z; pl.y = 0; pl.body3.teleport(pl.x, 0, pl.z);
    if (v.dead && !this.vehicleDeathHandled) { /* handled by explosion */ }
  }
  playerVehicleExploded(v) {
    // eject & damage player
    this.exitVehicle(true);
    this.hurtPlayer(60, null, 'explosion');
    const pl = this.player; pl.vy = 6; pl.vx = rand(-4, 4); pl.vz = rand(-4, 4);
  }
  onPlayerCrash(speed) {
    if (!this.vehicle) return;
    const dmg = Math.max(0, speed - 12) * 0.6;
    if (dmg > 0) { this.hurtPlayer(dmg * 0.5, null, 'crash'); }
  }

  // ---- weapons ----
  playerShoot(w, ammo) {
    const pl = this.player, cam = this.camera;
    ammo.clip--; pl.fireCd = w.rate; pl.recoil = 1;
    const dir = this.tmpV.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const sp = w.spread + pl.spread + (pl.speed > 1 ? 0.01 : 0) + (pl.aiming ? -w.spread * 0.6 : 0);
    dir.x += rand(-sp, sp); dir.y += rand(-sp, sp); dir.z += rand(-sp, sp); dir.normalize();
    pl.spread = Math.min(0.03, pl.spread + w.spread * 0.4);
    const ox = cam.position.x, oy = cam.position.y, oz = cam.position.z;
    // avoid hitting self / things behind player: start ray ahead of player along ray
    const r = this.hitscan(ox, oy, oz, dir.x, dir.y, dir.z, w.range, pl, w.damage, w.head);
    pl.muzzle = this.muzzleWorld(pl);
    const end = this.tmpV2.set(ox + dir.x * r.t, oy + dir.y * r.t, oz + dir.z * r.t);
    this.tracers.add(pl.muzzle, end, w.tracer);
    this.fx.muzzle(pl.muzzle, dir);
    this.audio.gun(w.snd, 1, 0);
    this.cam.pitch += w.recoil * (pl.aiming ? 0.7 : 1); this.cam.yaw += rand(-0.002, 0.002);
    this.shake(0.08);
    this.noise(pl.x, pl.z, 55);
    this.addHeatIfWitnessed(0.5);
    if (r.kind === 'human') this.markHit(r.head);
    if (ammo.clip === 0 && ammo.reserve > 0) pl.reloadT = w.reload, this.audio.reload();
  }
  muzzleWorld(h) { const v = this.tmpV2; h.m.muzzle.getWorldPosition(v); return new V3().copy(v); }
  markHit(head) { this.hitMarker = 0.18; this.ui.cross.classList.add('hit'); setTimeout(() => this.ui.cross.classList.remove('hit'), 120); this.audio.hitMarker(); }

  // Ray vs world/humans/vehicles
  hitscan(ox, oy, oz, dx, dy, dz, range, owner, damage, headMul = 2) {
    const G = this, res = this.hit;
    let best = range, kind = 'none', obj = null, head = false;
    const tw = this.world.colliders.raycast(ox, oy, oz, dx, dy, dz, best);
    if (tw >= 0) { best = tw; kind = 'world'; }
    if (dy < -1e-4) { const tg = -oy / dy; if (tg > 0 && tg < best) { best = tg; kind = 'ground'; } }
    // humans
    for (const h of this.humans) {
      if (h === owner || h.dead || h.hidden || !h.group.visible) continue;
      const rx = h.x - ox, rz = h.z - oz;
      if (rx * rx + rz * rz > (best + 2) * (best + 2)) continue;
      const A = dx * dx + dz * dz; if (A < 1e-8) continue;
      const tc = (rx * dx + rz * dz) / A;
      if (tc < 0 || tc > best) continue;
      const cxp = ox + dx * tc - h.x, czp = oz + dz * tc - h.z;
      const dd = Math.hypot(cxp, czp);
      if (dd > 0.5) continue;
      const t = tc - Math.sqrt(Math.max(0, 0.25 - dd * dd) / A);
      const y = oy + dy * t - h.y;
      if (y < 0 || y > 1.85 || t < 0) continue;
      best = t; kind = 'human'; obj = h; head = y > 1.5;
    }
    // vehicles (oriented boxes)
    for (const v of this.vehicles) {
      if (!v.group.visible) continue;
      if (this.vehicle === v && owner === this.player) continue;
      const rx = ox - v.x, rz = oz - v.z;
      if (Math.abs(rx) > best + 6 && Math.abs(rz) > best + 6) continue;
      const s = Math.sin(v.h), c = Math.cos(v.h);
      const lo = [rx * c - rz * s, oy, rx * s + rz * c], ld = [dx * c - dz * s, dy, dx * s + dz * c];
      const bx = [v.W / 2, 1.5, v.L / 2];
      let t0 = 0, t1 = best, ok = true;
      for (let a = 0; a < 3; a++) {
        const lo2 = a === 1 ? 0.3 : -bx[a], hi2 = a === 1 ? bx[a] : bx[a];
        if (Math.abs(ld[a]) < 1e-8) { if (lo[a] < lo2 || lo[a] > hi2) { ok = false; break; } continue; }
        let ta = (lo2 - lo[a]) / ld[a], tb = (hi2 - lo[a]) / ld[a];
        if (ta > tb) { const tt = ta; ta = tb; tb = tt; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb); if (t0 > t1) { ok = false; break; }
      }
      if (ok && t0 < best) { best = t0; kind = 'vehicle'; obj = v; }
    }
    const px = ox + dx * best, py = oy + dy * best, pz = oz + dz * best;
    if (kind === 'human') {
      obj.hurt(damage * (head ? headMul : 1), owner, head, owner);
      this.fx.sparks(px, py, pz, 3, [1, 0.2, 0.3], 5);
      if (owner === this.player) { this.noise(px, pz, 25); this.alertCivs(px, pz, 22); }
    } else if (kind === 'vehicle') {
      obj.damage(damage * 0.28, owner); obj.awake = true; obj.pv.body.wakeUp();
      this.fx.sparks(px, py, pz, 6, [1, 0.8, 0.4], 6);
      this.audio.impact(0.7, 0);
      if (obj.kind === 'traffic' && owner === this.player) { obj.ai.speed = 24; this.addHeat(2); }
    } else if (kind !== 'none') {
      this.fx.sparks(px, py, pz, kind === 'ground' ? 3 : 7, [1, 0.8, 0.5], kind === 'ground' ? 3 : 6);
      if (kind === 'ground' && Math.random() < 0.5) this.fx.smoke(px, 0.1, pz, 0.4);
    }
    res.t = best; res.kind = kind; res.obj = obj; res.head = head;
    return res;
  }
  hasLOS(x1, y1, z1, x2, y2, z2) {
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1, d = Math.hypot(dx, dy, dz) || 1;
    return this.world.colliders.raycast(x1, y1, z1, dx / d, dy / d, dz / d, d) < 0;
  }
  noise(x, z, r) { for (const h of this.humans) { if (h.dead) continue; if (h.team === 'civ' && Math.hypot(h.x - x, h.z - z) < r * 0.6 && h.state !== 'flee') { h.state = 'flee'; h.fleeT = rand(5, 9); h.threat = { x, z }; } } }
  alertCivs(x, z, r) { this.noise(x, z, r * 1.6); }
  enemyShoot(h, target) {
    const w = h.weapon, pl = this.player;
    const from = this.muzzleWorld(h); h.recoil = 1;
    const tx = pl.x, ty = (this.playerOnFoot ? 1.2 : 1.1), tz = pl.z;
    const dist = Math.hypot(tx - h.x, tz - h.z);
    const moving = this.playerOnFoot ? pl.speed : (this.vehicle ? this.vehicle.speed : 0);
    const hitChance = clamp(0.62 - dist * 0.012 - moving * 0.025 - (this.playerOnFoot && pl.aiming ? 0.05 : 0), 0.08, 0.6) * (h.team === 'cop' ? 0.7 : 0.8);
    const hit = Math.random() < hitChance;
    const end = new V3(tx + (hit ? 0 : rand(-1.6, 1.6)), ty + (hit ? 0 : rand(-0.6, 0.8)), tz + (hit ? 0 : rand(-1.6, 1.6)));
    this.tracers.add(from, end, h.team === 'cop' ? [0.4, 0.5, 1] : [1, 0.35, 0.3]);
    this.fx.muzzle(from, new V3().subVectors(end, from).normalize());
    this.audio.gun(w.snd, 0.7 * clamp(1 - dist / 90, 0.2, 1), clamp((tx - this.camera.position.x) * 0.01, -1, 1));
    if (hit) {
      const dmg = (h.team === 'cop' ? 3 : 4.5) + Math.random() * 2;
      if (this.vehicle) { this.vehicle.damage(dmg * 0.5, h); this.fx.sparks(end.x, end.y, end.z, 5, [1, 0.8, 0.4], 4); this.audio.impact(0.5, 0); }
      this.hurtPlayer(dmg, h, 'bullet');
    } else if (dist < 30) { this.audio.impact(0.25, rand(-0.5, 0.5)); this.fx.sparks(end.x, 0.1, end.z, 3, [1, 0.8, 0.5], 3); }
  }
  hurtPlayer(dmg, src, kind) {
    const pl = this.player; if (pl.dead) return;
    this.lastHurt = this.time;
    if (pl.armor > 0) { const a = Math.min(pl.armor, dmg * 0.7); pl.armor -= a; dmg -= a; }
    pl.hpv -= dmg;
    this.dmgPulse = clamp(dmg / 25, 0.15, 1); this.ui.dmg.style.opacity = clamp(dmg / 14, 0.25, 1);
    clearTimeout(this._dm); this._dm = setTimeout(() => (this.ui.dmg.style.opacity = 0), 160);
    if (dmg > 3) { this.audio.hurt(); this.shake(0.25); this.input.vibrate?.(); try { navigator.vibrate?.(30); } catch { /* ignore */ } }
    if (pl.hpv <= 0) this.playerDie(kind);
  }
  playerDie(kind) {
    const pl = this.player;
    pl.dead = true; pl.state = 'dead'; this.deadT = 0; pl.hpv = 0;
    pl.fallDir = rand(-1, 1);
    if (this.vehicle) this.exitVehicle(true);
    pl.group.visible = true; pl.m.pistol.visible = pl.m.rifle.visible = false;
    this.toast('<span style="color:#ff4560">WASTED</span>', '사망했습니다');
    this.ui.lt.classList.add('on'); this.ui.lb.classList.add('on');
  }
  respawn() {
    const pl = this.player;
    pl.dead = false; pl.state = 'walk'; pl.hpv = 100; pl.armor = 0; pl.m.body.rotation.set(0, 0, 0); pl.m.body.position.y = 0; pl.group.scale.setScalar(1);
    const cost = Math.floor(this.cash * 0.1); this.cash -= cost;
    pl.x = this.world.spawn.x; pl.z = this.world.spawn.z; pl.y = 0; pl.vx = pl.vz = 0; pl.knock = 0; pl.body3.teleport(pl.x, 0, pl.z);
    pl.setWeapon(pl.cur);
    this.clearWanted();
    this.ui.lt.classList.remove('on'); this.ui.lb.classList.remove('on');
    this.toast('RESPAWNED', `치료비 $${cost}`);
    this.cam.yaw = Math.PI; this.save();
  }

  // ====================================================================
  // Wanted / police
  addHeat(v) {
    this.heat = Math.min(220, this.heat + v); this.evade = 0;
    this.recalcStars();
  }
  addHeatIfWitnessed(v) { if (this.wanted > 0) this.heat += v; }
  recalcStars() {
    const th = [8, 30, 65, 110, 160];
    let s = 0; for (const t of th) if (this.heat >= t) s++;
    if (s > this.wanted) { this.audio.star(); this.toast('<span style="color:#ffc94d">WANTED ' + '★'.repeat(s) + '</span>', '경찰이 추적 중'); this.ui.stars.classList.add('flash'); setTimeout(() => this.ui.stars.classList.remove('flash'), 2500); }
    this.wanted = s;
  }
  clearWanted() { this.heat = 0; this.wanted = 0; this.evade = 0; for (const v of this.vehicles) if (v.police) { v.chaseTarget = null; v.direct = false; } }
  onHumanKilled(h, src) {
    this.stats.kills += src === this.player ? 1 : 0;
    if (h.team === 'civ') { if (src === this.player) { this.addHeat(14); this.feed('시민 사망', '#ff8a5c'); } }
    else if (h.team === 'cop') { if (src === this.player) { this.addHeat(40); this.feed('경찰 사살', '#ff4560'); } this.makePickup('cash', [0.3, 1, 0.5], h.x, h.z, this.pickupGeo, 100); }
    else if (h.team === 'gang') { if (src === this.player) this.feed('갱단 처치 +$' + h.cash, '#47ffa8'); this.makePickup('cash', [0.3, 1, 0.5], h.x, h.z, this.pickupGeo, h.cash); this.missionKill?.(h); }
    if (h.team === 'civ' && src === this.player && Math.random() < 0.7) this.makePickup('cash', [0.3, 1, 0.5], h.x, h.z, this.pickupGeo, h.cash);
    if (h.team === 'civ') this.audio.scream(0);
  }
  onVehicleDestroyed(v, src) {
    if (src === this.player || (v.driver === 'player')) this.addHeat(v.police ? 35 : 8);
  }
  explosion(x, y, z, radius, dmg, src) {
    const G = this;
    this.audio.explosion(1, clamp((x - this.camera.position.x) * 0.01, -1, 1));
    for (let i = 0; i < 40; i++) { const a = Math.random() * TAU, s = rand(2, 14); this.fireP.emit(x, y + rand(0, 1), z, Math.cos(a) * s, rand(1, 9), Math.sin(a) * s, rand(0.5, 1.3), rand(1.2, 3), 3.5, rand(0.8, 1.6), 0.25, 1, -3, 1.2); }
    for (let i = 0; i < 18; i++) this.smokeP.emit(x + rand(-1, 1), y + rand(0, 2), z + rand(-1, 1), rand(-3, 3), rand(2, 6), rand(-3, 3), rand(2, 4), rand(2, 4), 0.05, 0.05, 0.06, 0.9, 0.2, 0.4);
    this.fx.sparks(x, y, z, 18, [1, 0.6, 0.2], 24);
    this.lights.flash(x, y + 2, z, 0xff8a30, 160, 60, 0.9);
    const d = Math.hypot(x - this.camera.position.x, z - this.camera.position.z);
    this.shake(clamp(1.4 - d / 50, 0, 1.5));
    this.flashT = 0.15;
    for (const h of this.humans) {
      if (h.dead) continue; const dd = Math.hypot(h.x - x, h.z - z); if (dd > radius * 1.4) continue;
      const k = 1 - dd / (radius * 1.4); h.hurt(dmg * k * 1.2, src, false, src);
      const nx = (h.x - x) / (dd || 1), nz = (h.z - z) / (dd || 1); h.ragdoll(nx * 10 * k, nz * 10 * k, 7 * k);
    }
    const pl = this.player; const dp = Math.hypot(pl.x - x, pl.z - z);
    if (dp < radius * 1.3 && !pl.dead) { this.hurtPlayer(dmg * (1 - dp / (radius * 1.3)) * 0.6, null, 'explosion'); }
    for (const v of this.vehicles) {
      if (v === src) continue; const dd = Math.hypot(v.x - x, v.z - z); if (dd > radius * 1.5) continue;
      const k = 1 - dd / (radius * 1.5); v.damage(dmg * k * 1.2, src); v.awake = true; v.pv.body.wakeUp();
      const nx = (v.x - x) / (dd || 1), nz = (v.z - z) / (dd || 1); v.addImpulse(nx * 14 * k, 5 * k, nz * 14 * k);
    }
    this.addHeat(6);
  }

  updatePolice(dt) {
    const pl = this.player;
    this.copTimer -= dt;
    const real = this.vehicle || pl;
    const target = real;
    const cars = this.vehicles.filter((v) => v.police && !v.dead);
    // heat decay when not being seen
    if (this.wanted > 0) {
      let seen = false;
      for (const c of cars) { const d = Math.hypot(c.x - real.x, c.z - real.z); if (d < 55 && this.hasLOS(c.x, 1.5, c.z, real.x, 1.5, real.z)) { seen = true; break; } }
      for (const h of this.humans) if (h.team === 'cop' && !h.dead && Math.hypot(h.x - pl.x, h.z - pl.z) < 45) { seen = true; break; }
      if (seen) this.evade = 0; else this.evade += dt;
      if (this.evade > 8) { this.heat = Math.max(0, this.heat - dt * (1.5 + (this.evade - 8) * 0.25)); const prev = this.wanted; this.recalcStars(); if (prev > 0 && this.wanted === 0) { this.toast('<span style="color:#47ffa8">WANTED LEVEL LOST</span>', '추적에서 벗어났습니다'); this.clearWanted(); } }
    }
    const desired = this.wanted === 0 ? 0 : [0, 1, 2, 3, 4, 5][this.wanted] + (this.wanted >= 4 ? 1 : 0);
    if (this.copTimer <= 0) {
      this.copTimer = this.wanted >= 3 ? 2.5 : 4;
      if (cars.length < desired && cars.length < 7) this.spawnPoliceCar();
    }
    for (const c of cars) {
      c.chaseTarget = this.wanted > 0 ? target : null;
      const d = Math.hypot(c.x - target.x, c.z - target.z);
      c.direct = this.wanted > 0 && d < 40 && this.hasLOS(c.x, 1.2, c.z, target.x, 1.2, target.z);
      c.siren = true;
      if (this.wanted === 0) { c.ai.speed = 12; c.chaseTarget = null; if (d > 90) c.despawn = true; }
      // deploy officers
      if (this.wanted > 0 && d < 20 && c.speed < 7 && !c.deployed) {
        c.deployed = true; const n = this.wanted >= 3 ? 2 : 1;
        for (let k = 0; k < n; k++) this.spawnCop(c.x + Math.cos(c.h) * (c.W / 2 + 1.2) * (k ? -1 : 1), c.z - Math.sin(c.h) * (c.W / 2 + 1.2) * (k ? -1 : 1));
      }
      if (c.despawn) { this.removeVehicle(c); }
    }
    // remove cop officers when no wanted & far
    for (const h of this.humans) if (h.team === 'cop' && this.wanted === 0 && !h.dead && Math.hypot(h.x - pl.x, h.z - pl.z) > 50) h.hidden = h.remove = true;
    // police siren loudness
    let nearest = 999; for (const c of cars) nearest = Math.min(nearest, Math.hypot(c.x - this.camera.position.x, c.z - this.camera.position.z));
    this.sirenLevel = this.wanted > 0 ? clamp(1 - nearest / 120, 0, 1) : 0;
    // flashing police lights
    if (cars.length) {
      const ph = Math.floor(this.time * 6) % 2;
      const c = cars.reduce((a, b) => (Math.hypot(a.x - this.camera.position.x, a.z - this.camera.position.z) < Math.hypot(b.x - this.camera.position.x, b.z - this.camera.position.z) ? a : b));
      this.lights.flash(c.x, 3, c.z, ph ? 0xff2020 : 0x2050ff, 14, 28, 0.2);
    }
  }
  spawnPoliceCar() {
    const target = this.vehicle || this.player;
    const lane = (() => { for (let t = 0; t < 10; t++) { const l = this.randomLane(110, 200); if (l) return l; } return null; })();
    if (!lane) return;
    const v = new Vehicle(this, 'sedan', 0x0c1220, 'police', { glow: [0.2, 0.4, 1] });
    v.driver = 'ai'; v.police = true; v.ai.speed = 22; v.maxHp = v.hp = 130;
    v.setRoute(lane.i, lane.j, lane.di, lane.dj, lane.frac);
    v.chaseTarget = target; v.siren = true;
    this.addVehicle(v);
  }
  spawnCop(x, z) {
    if (this.humans.filter((h) => h.team === 'cop' && !h.dead).length > 8) return;
    const h = new Human(this, 'cop', { hp: 70, weapon: this.wanted >= 3 ? 2 : 1, look: { top: 0x101a38, pants: 0x0b1020, cap: 0x0b1020, trim: [0.3, 0.45, 1], hair: 0x111111 } });
    h.x = x; h.z = z; h.state = 'attack'; this.humans.push(h); this.scene.add(h.group);
  }

  // ====================================================================
  updateVehicles(dt) {
    const list = this.vehicles, cam = this.camera.position, pl = this.focusPos();
    const focus = pl;
    const active = [];
    for (let i = list.length - 1; i >= 0; i--) {
      const v = list[i];
      const d = Math.hypot(v.x - cam.x, v.z - cam.z);
      const vis = d < (v.kind === 'parked' ? 170 : 230);
      v.group.visible = vis;
      if (v.kind === 'traffic' && !v.dead && v.driver === 'ai' && v !== this.vehicle) {
        const dd = Math.hypot(v.x - focus.x, v.z - focus.z);
        if (dd > 260) { this.recycleTraffic(v); }
      }
      if (v.dead && v.age > 45 && d > 60 && v !== this.vehicle) { this.removeVehicle(v); continue; }
      const asleep = v.pv.body.isSleeping();
      if (asleep && !v.driver && !v.dead && !(v.burn > 0)) continue;
      active.push(v);
    }
    for (const v of active) v.control(dt);
    this.phys.step(dt, () => { for (const v of active) v.applyDrive(); }, active.map((v) => v.pv));
    for (const v of active) v.post(dt);
    this.phys.syncProps(THREE);
    this.vehicleVsHumans();
    // keep traffic population
    this.popT = (this.popT || 0) - dt;
    if (this.popT <= 0) {
      this.popT = 0.8;
      const tc = list.filter((v) => v.kind === 'traffic' && v.driver === 'ai').length;
      if (tc < this.eng.q.traffic) this.spawnTraffic(false);
      const nc = this.humans.filter((h) => h.team === 'civ' && !h.dead).length;
      if (nc < this.eng.q.npc) this.spawnCivilian(false);
      for (let i = this.humans.length - 1; i >= 0; i--) {
        const h = this.humans[i]; const d = Math.hypot(h.x - pl.x, h.z - pl.z);
        if ((h.dead && h.deadT > 24) || h.remove || (h.team === 'civ' && d > 240)) { this.scene.remove(h.group); this.humans.splice(i, 1); }
      }
    }
  }
  recycleTraffic(v) {
    const lane = this.randomLane(90, 210);
    if (!lane) return;
    v.hp = v.maxHp; v.dead = false; v.age = 0; v.stuck = 0; v.stuckT = 0; v.ai.wp = [];
    v.setRoute(lane.i, lane.j, lane.di, lane.dj, lane.frac);
  }
  vehicleVsHumans() {
    const all = [...this.humans];
    for (const v of this.vehicles) {
      if (!v.group.visible || v.speed < 3) continue;
      const s = Math.sin(v.h), c = Math.cos(v.h), spd = v.speed;
      for (const h of all) {
        if (h.dead && h.knock === 0 && h.deadT > 1) continue;
        const dx = h.x - v.x, dz = h.z - v.z; if (Math.abs(dx) > 4 || Math.abs(dz) > 4) continue;
        const lf = dx * s + dz * c, ll = dx * c - dz * s;
        if (Math.abs(lf) < v.L / 2 + 0.4 && Math.abs(ll) < v.W / 2 + 0.3 && !h.knock && !(h.dead)) {
          const dmg = spd * 5;
          const was = h.dead;
          h.hurt(dmg, v.driver === 'player' ? this.player : v, false, v.driver === 'player' ? this.player : null);
          h.ragdoll(v.vx * 0.8 + rand(-1, 1), v.vz * 0.8 + rand(-1, 1), 4 + spd * 0.15);
          this.audio.impact(1, 0); this.audio.crash(0.3, 0);
          v.setVel(v.vx * 0.97, v.vz * 0.97);
          if (v.driver === 'player') { this.addHeat(h.team === 'civ' ? 6 : 12); this.shake(0.3); }
          if (v.driver === 'player' && h.team === 'gang') this.feed('갱단 치임!', '#ffc94d');
        }
      }
      // player on foot hit by cars
      if (this.playerOnFoot && !this.player.dead && v.driver) {
        const pl = this.player; const dx = pl.x - v.x, dz = pl.z - v.z; const lf = dx * s + dz * c, ll = dx * c - dz * s;
        if (Math.abs(lf) < v.L / 2 + 0.4 && Math.abs(ll) < v.W / 2 + 0.3 && this.time - (this.lastRunOver || -9) > 0.6) {
          this.lastRunOver = this.time; this.hurtPlayer(spd * 2.2, null, 'car'); pl.vx = v.vx; pl.vz = v.vz; pl.vy = 4;
        }
      }
    }
  }

  // ====================================================================
  updateHumans(dt) {
    const cam = this.camera.position;
    for (const h of this.humans) {
      const d = Math.hypot(h.x - cam.x, h.z - cam.z);
      const vis = d < 130; h.group.visible = vis && !h.hidden;
      if (!vis && h.team === 'civ' && !h.dead) { // cheap
        if (h.node && !h.knock) { const [tx, tz] = h.nodePos(h.node); const dx = tx - h.x, dz = tz - h.z, dd = Math.hypot(dx, dz); if (dd < 1.4) h.chooseNext(); else { h.x += dx / dd * 1.5 * dt; h.z += dz / dd * 1.5 * dt; } }
        continue;
      }
      h.update(dt);
    }
  }
  alertGang(h) { for (const o of this.humans) if (o.team === 'gang' && !o.dead && o.state !== 'attack' && Math.hypot(o.x - h.x, o.z - h.z) < 30) { o.state = 'attack'; } }

  updatePickups(dt) {
    const pl = this.player, t = this.time;
    for (const p of this.pickups) {
      if (!p.active) { p.respawn -= dt; if (p.respawn <= 0 && p.type !== 'cash') { p.active = true; p.mesh.visible = true; } continue; }
      p.mesh.rotation.y = t * 2 + p.ph; p.mesh.position.y = 1 + Math.sin(t * 2.4 + p.ph) * 0.15;
      const d = Math.hypot(p.x - pl.x, p.z - pl.z);
      if (d < 1.6 && !pl.dead) {
        if (p.type === 'health' && pl.hpv >= 100) continue;
        p.active = false; p.mesh.visible = false; p.respawn = 60;
        if (p.type === 'health') { pl.hpv = Math.min(100, pl.hpv + 50); this.toast('+HEALTH'); }
        else if (p.type === 'armor') { pl.armor = Math.min(100, pl.armor + 60); this.toast('+ARMOR'); }
        else if (p.type === 'ammo') { pl.ammo[0].reserve += 36; pl.ammo[1].reserve += 60; this.toast('+AMMO'); }
        else if (p.type === 'cash') { this.cash += p.value; this.audio.cash(); this.feed('+$' + p.value, '#47ffa8'); p.respawn = 1e9; this.scene.remove(p.mesh); p.dead = true; }
        if (p.type !== 'cash') this.audio.cash();
      }
    }
    this.pickups = this.pickups.filter((p) => !p.dead);
  }

  // ====================================================================
  // Missions
  buildBeacon() {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 120, 20, 1, true), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { uTime: timeUniform, uColor: { value: new THREE.Color(1, 0.78, 0.25) } },
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'varying vec2 vUv;uniform vec3 uColor;uniform float uTime;void main(){float a=(1.-vUv.y)*.55*(.7+.3*sin(vUv.y*40.-uTime*4.));gl_FragColor=vec4(uColor*a*2.,a);}',
    }));
    beam.position.y = 60;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.07, 6, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.8, 0.25).multiplyScalar(3), toneMapped: false }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.15;
    const ring2 = ring.clone(); ring2.scale.setScalar(0.55);
    g.add(beam, ring, ring2);
    const light = new THREE.Sprite(glowSpriteMat(0xffc84a, 2)); light.scale.setScalar(6); light.position.y = 1.5; g.add(light);
    g.visible = false; this.scene.add(g);
    this.beacon = { g, ring, ring2, beam };
  }
  setBeacon(x, z, color) { this.beacon.g.position.set(x, 0, z); this.beacon.g.visible = true; if (color) this.beacon.beam.material.uniforms.uColor.value.set(color); this.markerPos = { x, z }; }
  hideBeacon() { this.beacon.g.visible = false; this.markerPos = null; }

  pickSpot(minD, maxD, near = null) {
    const pl = this.player;
    for (let t = 0; t < 40; t++) {
      const i = Math.floor(rand(1, N)), j = Math.floor(rand(1, N));
      const x = roadC(i) + (Math.random() < 0.5 ? 1 : -1) * 12.5, z = roadC(j) + (Math.random() < 0.5 ? 1 : -1) * 12.5;
      const d = Math.hypot(x - pl.x, z - pl.z);
      if (d > minD && d < maxD) return { x, z, i, j };
    }
    return { x: roadC(5) + 12.5, z: roadC(3) + 12.5, i: 5, j: 3 };
  }

  startMission(idx) {
    this.missionIndex = idx;
    const defs = this.missionDefs();
    const m = (this.mission = defs[idx % defs.length](idx));
    this.mission.started = this.time;
    this.setMissionText(m.title, m.text);
    this.toast(m.title, 'NEW MISSION');
    m.start?.call(m);
    this.save();
  }
  setMissionText(title, text) { this.setText('mT', this.ui.mTitle, 'MISSION · ' + title); this.setText('mX', this.ui.mText, text); }
  completeMission() {
    const m = this.mission; if (!m || m.done) return;
    m.done = true; this.cash += m.reward; this.stats.missions++;
    this.audio.complete(); this.toast('MISSION COMPLETE', `+$${m.reward}`);
    this.hideBeacon();
    m.cleanup?.call(m);
    setTimeout(() => this.startMission(this.missionIndex + 1), 3500);
    this.mission = { idle: true, title: '완료', text: '다음 임무 준비 중…', update() {} };
    this.save();
  }
  failMission(reason) {
    const m = this.mission; if (!m || m.done) return;
    m.done = true; this.toast('<span style="color:#ff4560">MISSION FAILED</span>', reason);
    this.hideBeacon(); m.cleanup?.call(m);
    const idx = this.missionIndex;
    setTimeout(() => this.startMission(idx), 3500);
    this.mission = { idle: true, title: '실패', text: reason, update() {} };
  }
  missionDefs() {
    const G = this;
    return [
      // 1. tutorial: go to marker
      (i) => { const spot = G.pickSpot(120, 260); return { title: '첫 만남', text: '의뢰인이 기다리고 있다. 표시된 장소로 이동하라. (차량 탑승: F)', reward: 300, goal: spot, start() { G.setBeacon(spot.x, spot.z); }, update() { if (Math.hypot(G.player.x - spot.x, G.player.z - spot.z) < 4) G.completeMission(); } }; },
      // 2. steal car
      (i) => {
        const spot = G.pickSpot(140, 260), dest = G.pickSpot(260, 420);
        let car = null, phase = 0, timer = 0;
        return {
          title: '차량 탈취', text: '붉은 스포츠카를 찾아 탈취하라.', reward: 800,
          start() { car = new Vehicle(G, 'sport', 0xd01030, 'parked', { glow: [1, 0.1, 0.3] }); const dx = spot.x < 0 ? 1 : -1; car.x = spot.x + 0; car.z = spot.z + 4; car.h = 0; car.awake = false; G.addVehicle(car); G.setBeacon(car.x, car.z, 0xff3050); this.car = car; },
          update(dt) {
            if (phase === 0 && G.vehicle === car) { phase = 1; timer = 150; G.setBeacon(dest.x, dest.z); G.setMissionText('차량 탈취', '차를 목적지 차고로 가져가라. 경찰을 조심!'); G.addHeat(12); }
            if (phase === 1) {
              timer -= dt; this.hud = `남은 시간 ${Math.max(0, timer | 0)}s`;
              if (G.vehicle !== car) { G.setMissionText('차량 탈취', '차량에 다시 탑승하라!'); G.setBeacon(car.x, car.z, 0xff3050); phase = 2; }
              else if (Math.hypot(car.x - dest.x, car.z - dest.z) < 6 && car.speed < 12) { G.clearWanted(); G.completeMission(); }
              else if (timer <= 0 || car.dead) G.failMission(car.dead ? '차량이 파괴되었다' : '시간 초과');
            } else if (phase === 2) { if (G.vehicle === car) { phase = 1; G.setBeacon(dest.x, dest.z); G.setMissionText('차량 탈취', '차를 목적지 차고로 가져가라.'); } else if (car.dead) G.failMission('차량이 파괴되었다'); }
          },
          cleanup() { },
        };
      },
      // 3. clear gang
      (i) => {
        const spot = G.pickSpot(140, 260); let gang = []; let spawned = false;
        return {
          title: '갱단 소탕', text: '표시된 구역의 갱단원을 모두 제거하라.', reward: 1200,
          start() {
            G.setBeacon(spot.x, spot.z, 0xff3050);
            const n = 7;
            for (let k = 0; k < n; k++) {
              const a = (k / n) * TAU, r = rand(4, 11);
              const h = new Human(G, 'gang', { hp: 75, weapon: k % 3 === 0 ? 2 : 1, look: { top: 0x3a0c18, pants: 0x151015, trim: [1, 0.2, 0.25], hair: 0x111111, cap: k % 2 ? 0x201018 : null } });
              h.x = spot.x + Math.cos(a) * r; h.z = spot.z + Math.sin(a) * r; h.home = { x: spot.x, z: spot.z }; h.patrol = true; h.state = 'idle'; h.detect = 45; h.cash = Math.floor(rand(60, 180));
              const rr = G.world.colliders.resolve(h.x, h.z, 0.4, 0); h.x = rr.x; h.z = rr.z;
              G.humans.push(h); G.scene.add(h.group); gang.push(h);
            }
            G.missionKill = () => { };
          },
          update() {
            const left = gang.filter((h) => !h.dead).length; this.hud = `남은 적 ${left}`;
            if (left === 0) G.completeMission();
          },
          cleanup() { G.missionKill = null; },
        };
      },
      // 4. heist
      (i) => {
        const spot = G.pickSpot(150, 280); let phase = 0; let pick = null;
        return {
          title: '현금 가방', text: '가방을 회수하라. 경찰이 곧 출동한다!', reward: 2000,
          start() { G.setBeacon(spot.x, spot.z); },
          update() {
            if (phase === 0 && Math.hypot(G.player.x - spot.x, G.player.z - spot.z) < 3.5) {
              phase = 1; G.hideBeacon(); G.addHeat(75); G.setMissionText('현금 가방', '경찰을 따돌려라! (시야에서 벗어나 숨어라)'); G.toast('가방 확보', '경찰 출동!');
            }
            if (phase === 1) { this.hud = `수배 ${'★'.repeat(G.wanted) || '—'}`; if (G.wanted === 0 && G.time - (this.started) > 8) G.completeMission(); }
          },
        };
      },
      // 5. rooftop: walk into a tower, ride its elevator to the roof
      (i) => {
        const cands = (G.world.enterables || []).filter((e) => Math.hypot(e.x - G.player.x, e.z - G.player.z) > 90).sort((p, q) => Math.hypot(p.x - G.player.x, p.z - G.player.z) - Math.hypot(q.x - G.player.x, q.z - G.player.z));
        const e = cands[Math.min(2, cands.length - 1)] || G.world.enterables[0];
        const b = G.buildings.byLot.get(e.lot); b.plan();
        return {
          title: '옥상으로', text: `${b.name} 옥상에 올라가라. 정문으로 들어가 엘리베이터나 계단을 이용.`, reward: 1800,
          start() { G.setBeacon(e.x, e.z); },
          update() {
            const pl = G.player, at = G.buildings.at(pl.x, pl.z);
            this.hud = at === b ? `높이 ${Math.max(0, pl.y) | 0}m / ${b.roofY | 0}m` : null;
            if (at === b && pl.y > b.roofY - 0.6) G.completeMission();
          },
        };
      },
      // procedural contracts
      (i) => { const spot = G.pickSpot(120, 300); const reward = 400 + (i % 5) * 150; return { title: '배달 계약', text: '물건을 목적지까지 배달하라.', reward, start() { G.setBeacon(spot.x, spot.z); }, update() { if (Math.hypot(G.player.x - spot.x, G.player.z - spot.z) < 4.5) G.completeMission(); } }; },
      (i) => {
        const spot = G.pickSpot(140, 300); let gang = [];
        return {
          title: '현상금 사냥', text: '갱단 두목과 부하들을 제거하라.', reward: 1000 + (i % 4) * 250,
          start() {
            G.setBeacon(spot.x, spot.z, 0xff3050);
            const n = 5 + (i % 3);
            for (let k = 0; k < n; k++) {
              const h = new Human(G, 'gang', { hp: k === 0 ? 150 : 80, weapon: k % 2 ? 2 : 1, look: { top: k === 0 ? 0x4a2a05 : 0x2a0f2a, pants: 0x111111, trim: [1, 0.3, 0.9], hair: 0x111111 } });
              const a = (k / n) * TAU; h.x = spot.x + Math.cos(a) * rand(3, 9); h.z = spot.z + Math.sin(a) * rand(3, 9); h.home = { x: spot.x, z: spot.z }; h.patrol = true; h.state = 'idle'; h.detect = 48; h.cash = Math.floor(rand(80, 250));
              const rr = G.world.colliders.resolve(h.x, h.z, 0.4, 0); h.x = rr.x; h.z = rr.z; G.humans.push(h); G.scene.add(h.group); gang.push(h);
            }
          },
          update() { const left = gang.filter((h) => !h.dead).length; this.hud = `남은 적 ${left}`; if (left === 0) G.completeMission(); },
        };
      },
    ];
  }
  updateMission(dt) {
    const m = this.mission; if (!m) return;
    m.update?.call(m, dt);
    if (this.markerPos && this.beacon.g.visible) {
      const b = this.beacon, t = this.time;
      b.ring.rotation.z = t; b.ring2.rotation.z = -t * 1.4; b.ring.scale.setScalar(1 + Math.sin(t * 3) * 0.06);
    }
    const d = this.markerPos ? Math.hypot(this.player.x - this.markerPos.x, this.player.z - this.markerPos.z) : 0;
    this.setText('mD', this.ui.mDist, m.hud != null ? m.hud : (this.markerPos && !this.indoor ? `거리 ${d | 0} m` : ''));
  }

  // ====================================================================
  // Ambient (lightning etc.)
  updateAmbient(dt) {
    this.nextLightning -= dt;
    if (this.nextLightning <= 0) { this.nextLightning = rand(14, 32); this.bolt = 0.5; this.thunderT = rand(0.6, 3); }
    if (this.bolt > 0) {
      this.bolt -= dt; const f = Math.max(0, Math.sin(this.bolt * 38) * 0.5 + 0.5) * Math.min(1, this.bolt * 3);
      flashUniform.value = f * 2.2; this.eng.moon.intensity = 0.85 + f * 2.6; this.eng.hemi.intensity = 0.22 + f * 0.8;
      if (this.bolt <= 0) { flashUniform.value = 0; this.eng.moon.intensity = 0.85; this.eng.hemi.intensity = 0.22; }
    }
    if (this.thunderT > 0 && (this.thunderT -= dt) <= 0) this.audio.explosion?.call(this.audio, 0.35, 0);
  }

  // ====================================================================
  // Camera
  shake(a) { this.shakeAmt = Math.min(1.6, this.shakeAmt + a); }
  updateCamera(dt, inp) {
    const cam = this.cam, c = this.camera, pl = this.player, G = this;
    let ax, ay, az;
    if (this.playerOnFoot || pl.dead) {
      if (pl.dead) cam.yaw += dt * 0.15;
      const aim = pl.aiming && !pl.dead;
      cam.dist = damp(cam.dist, aim ? 1.9 : 3.9, 9, dt); cam.shoulder = damp(cam.shoulder, aim ? 0.62 : 0.4, 9, dt);
      cam.fov = damp(cam.fov, aim ? 52 : (pl.speed > 6 ? 72 : 66), 6, dt);
      ax = pl.x; ay = pl.y + 1.55 - (pl.dead ? 0.8 : 0); az = pl.z;
      const cp = Math.cos(cam.pitch), L = this.tmpV.set(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
      const rX = -Math.cos(cam.yaw), rZ = Math.sin(cam.yaw);
      let tx = ax - L.x * cam.dist + rX * cam.shoulder, ty = ay - L.y * cam.dist + 0.25, tz = az - L.z * cam.dist + rZ * cam.shoulder;
      // collision
      const dx = tx - ax, dy = ty - ay, dz = tz - az, d = Math.hypot(dx, dy, dz);
      const hit = this.world.colliders.raycast(ax, ay, az, dx / d, dy / d, dz / d, d);
      let k = 1; if (hit >= 0) k = Math.max(0.12, (hit - 0.4) / d);
      if (ty - (ay - ay) < 0.3) { /* ground clamp below */ }
      tx = ax + dx * k; ty = ay + dy * k; tz = az + dz * k;
      if (ty < 0.25) ty = 0.25;
      c.position.set(tx, ty, tz);
      const lx = ax + L.x * 18 + rX * cam.shoulder * 0.5, ly = ay + L.y * 18, lz = az + L.z * 18 + rZ * cam.shoulder * 0.5;
      c.lookAt(lx, ly, lz);
    } else {
      const v = this.vehicle; const sp = v.speed;
      // yaw follows velocity direction
      if (cam.offsetT > 0) cam.offsetT -= dt;
      else { const target = sp > 3 ? Math.atan2(v.vx, v.vz) * (v.fwdSpeed < -1 ? 0 : 1) + (v.fwdSpeed < -1 ? v.h : 0) : v.h; const targetH = v.fwdSpeed >= -1 ? (sp > 3 ? Math.atan2(v.vx, v.vz) : v.h) : v.h; cam.yaw = dampAngle(cam.yaw, v.fwdSpeed < -2 ? v.h + Math.PI : targetH, sp > 3 ? 2.6 : 1.2, dt); }
      cam.pitch = damp(cam.pitch, -0.14 - clamp(sp / 140, 0, 0.1), 3, dt);
      const dist = (cam.mode === 0 ? 6.4 : cam.mode === 1 ? 9.5 : 0.1) + sp * 0.03;
      cam.fov = damp(cam.fov, 66 + clamp(sp * 0.55, 0, 22), 4, dt);
      ax = v.x; ay = 1.5 + (cam.mode === 2 ? 0.1 : 0); az = v.z;
      const cp = Math.cos(cam.pitch), L = this.tmpV.set(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
      let tx, ty, tz;
      if (cam.mode === 2) { // hood cam
        const s = Math.sin(v.h), cc = Math.cos(v.h); tx = v.x + s * 0.9; ty = 1.35; tz = v.z + cc * 0.9;
        c.position.set(tx, ty, tz); c.lookAt(tx + Math.sin(cam.yaw) * 10, 1.1 + Math.sin(cam.pitch) * 10, tz + Math.cos(cam.yaw) * 10);
      } else {
        tx = ax - L.x * dist; ty = ay - L.y * dist + 1.0; tz = az - L.z * dist;
        const dx = tx - ax, dy = ty - ay, dz = tz - az, d = Math.hypot(dx, dy, dz);
        const hit = this.world.colliders.raycast(ax, ay, az, dx / d, dy / d, dz / d, d);
        let k = 1; if (hit >= 0) k = Math.max(0.2, (hit - 0.5) / d);
        tx = ax + dx * k; ty = Math.max(0.5, ay + dy * k); tz = az + dz * k;
        cam.smoothPos.lerp(this.tmpV2.set(tx, ty, tz), 1 - Math.exp(-14 * dt));
        if (cam.smoothPos.lengthSq() < 1) cam.smoothPos.set(tx, ty, tz);
        c.position.copy(cam.smoothPos);
        c.lookAt(ax + L.x * 6, ay + 0.2 + L.y * 6, az + L.z * 6);
      }
    }
    // shake
    if (this.shakeAmt > 0.001) {
      const s = this.shakeAmt * 0.12; c.position.x += rand(-s, s); c.position.y += rand(-s, s) * 0.7; c.position.z += rand(-s, s);
      c.rotation.z += rand(-s, s) * 0.12;
      this.shakeAmt *= Math.exp(-6 * dt);
    }
    if (c.fov !== cam.fov) { c.fov = cam.fov; c.updateProjectionMatrix(); }
    this.cam.pos.copy(c.position);
    // glare scale
    this.world.glare.points.material.uniforms.uScale.value = innerHeight * 0.85;
    this.sparksP.points.material.uniforms.uScale.value = innerHeight * 0.9;
    this.smokeP.points.material.uniforms.uScale.value = innerHeight * 0.9;
    this.fireP.points.material.uniforms.uScale.value = innerHeight * 0.9;
  }

  fxUpdate(dt) {
    this.sparksP.update(dt); this.smokeP.update(dt); this.fireP.update(dt);
    this.tracers.update(dt); this.lights.update(dt);
    // headlights of player car as real spot lights
    if (this.vehicle && this.vehicle.lightsOn) { this.updateHeadlight(); } else if (this.head) this.head.intensity = 0;
    if (this.hitMarker > 0) this.hitMarker -= dt;
  }
  updateHeadlight() {
    if (!this.head) { this.head = new THREE.SpotLight(0xfff0d0, 0, 80, 0.5, 0.6, 1.6); this.scene.add(this.head, this.head.target); }
    const v = this.vehicle, s = Math.sin(v.h), c = Math.cos(v.h);
    this.head.position.set(v.x + s * v.L * 0.4, 0.9, v.z + c * v.L * 0.4);
    this.head.target.position.set(v.x + s * 30, 0, v.z + c * 30);
    this.head.intensity = 520; this.head.angle = 0.5; this.head.penumbra = 0.7;
  }

  // ====================================================================
  updateHUD(dt) {
    const pl = this.player, ui = this.ui, v = this.vehicle;
    this.ui.hp.style.width = clamp(pl.hpv, 0, 100) + '%';
    this.ui.ar.style.width = clamp(pl.armor, 0, 100) + '%';
    this.ui.hp.classList.toggle('low', pl.hpv < 30);
    this.setText('cash', ui.cash, '$' + (this.cash | 0).toLocaleString());
    this.setHTML('stars', ui.stars, Array.from({ length: 5 }, (_, i) => (i < this.wanted ? '<b>★</b>' : '★')).join(''));
    const w = WEAPONS[pl.cur], am = pl.ammo[pl.cur];
    this.setText('wn', ui.wName, w.name);
    this.setHTML('am', ui.ammo, pl.reloadT > 0 ? 'RELOAD' : `${am.clip}<small> / ${am.reserve}</small>`);
    ui.ammo.classList.toggle('empty', am.clip === 0);
    ui.weapon.style.display = this.playerOnFoot ? '' : 'none';
    ui.cross.classList.toggle('hide', !this.playerOnFoot || pl.dead);
    if (v) { this.setText('spd', ui.spd, String(Math.round(v.speed * 3.6))); ui.carHp.style.width = clamp(v.hp / v.maxHp * 100, 0, 100) + '%'; }
    // hint
    let hint = '';
    if (this.playerOnFoot && this.nearInteract && !pl.dead && !this.frozen()) hint = this.nearInteract.verbs.map((v) => `<kbd>${v.key}</kbd>${typeof v.label === 'function' ? v.label() : v.label}`).join('　') + '';
    else if (v) hint = '';
    this.setHTML('hint', ui.hint, hint); ui.hint.classList.toggle('on', !!hint);
    // direction
    const bearing = ((Math.PI - this.cam.yaw) * 180 / Math.PI % 360 + 360) % 360;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']; this.setText('dir', ui.dir, dirs[Math.round(bearing / 45) % 8] + ' · ' + (bearing | 0) + '°');
    this.drawMinimap();
    if (this.ui.fps.style.display !== 'none') { this.fpsAcc = (this.fpsAcc || 0) + dt; this.fpsN = (this.fpsN || 0) + 1; if (this.fpsAcc > 0.5) { ui.fps.textContent = `${Math.round(this.fpsN / this.fpsAcc)} fps · ${this.eng.q.name}`; this.fpsAcc = this.fpsN = 0; } }
    this.autoQuality(dt);
    if (this.input.touch) this.input.audioUnlock = true;
  }
  autoQuality(dt) {
    this.aq = this.aq || { t: 0, n: 0, cool: 6 };
    const a = this.aq; a.t += dt; a.n++; a.cool -= dt;
    if (a.t > 3) {
      const fps = a.n / a.t; a.t = 0; a.n = 0;
      if (a.cool <= 0 && fps < 26 && this.eng.qIndex > 0) { this.eng.setQuality(this.eng.qIndex - 1); a.cool = 8; el('qSel').value = String(this.eng.qIndex); }
    }
  }
  audioUpdate(dt) {
    const v = this.vehicle;
    const rpm = v ? clamp(Math.abs(v.fwdSpeed) / v.spec.maxSpeed * 1.4 + v.throttle * 0.15, 0, 1) : 0;
    this.audio.intensity = clamp(this.wanted / 4 + (this.nearCombat ? 0.3 : 0), 0, 1);
    this.audio.update(dt, { inCar: !!v, rpm, throttle: v ? v.throttle : 0, slip: v ? v.slip : 0, siren: this.sirenLevel || 0 });
  }

  // ---- minimap ----
  buildMinimap() {
    const S = 1.2, size = Math.ceil((N * P + P * 3) * S), c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'); this.mapScale = S; this.mapSize = size;
    const tx = (x) => (x + size / S / 2) * S, tz = (z) => (z + size / S / 2) * S;
    g.fillStyle = '#080c16'; g.fillRect(0, 0, size, size);
    // lots
    g.fillStyle = '#18213a';
    for (const l of this.world.lots) g.fillRect(tx(l.x0), tz(l.z0), (l.x1 - l.x0) * S, (l.z1 - l.z0) * S);
    g.fillStyle = '#123324'; for (const p of this.world.parks) g.fillRect(tx(p.x0), tz(p.z0), (p.x1 - p.x0) * S, (p.z1 - p.z0) * S);
    if (this.world.plaza) { const pz = this.world.plaza; g.fillStyle = '#2b1640'; g.fillRect(tx(pz.x0), tz(pz.z0), (pz.x1 - pz.x0) * S, (pz.z1 - pz.z0) * S); }
    // roads
    g.strokeStyle = '#3c4b73'; g.lineWidth = R * S; g.lineCap = 'butt';
    for (let i = 0; i <= N; i++) { const p = roadC(i); g.beginPath(); g.moveTo(tx(p), tz(-HALF - R / 2)); g.lineTo(tx(p), tz(HALF + R / 2)); g.stroke(); g.beginPath(); g.moveTo(tx(-HALF - R / 2), tz(p)); g.lineTo(tx(HALF + R / 2), tz(p)); g.stroke(); }
    g.strokeStyle = '#59a6ff22'; g.lineWidth = 1;
    for (let i = 0; i <= N; i++) { const p = roadC(i); g.beginPath(); g.moveTo(tx(p), tz(-HALF)); g.lineTo(tx(p), tz(HALF)); g.stroke(); g.beginPath(); g.moveTo(tx(-HALF), tz(p)); g.lineTo(tx(HALF), tz(p)); g.stroke(); }
    this.mapCanvas = c; this.mapTx = tx; this.mapTz = tz;
  }
  drawMinimap() {
    const g = this.minictx, W = 340, S = this.mapScale, pl = this.player;
    this.setText('clk', this.ui.clock || (this.ui.clock = el('clock')), this.where ? `${this.where.b.name} · ${this.where.k + 1}F` : 'NEON CITY · 02:47 AM · 비');
    const p = this.vehicle || pl; const zoom = this.vehicle ? 1.1 : 1.5;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, W); g.fillStyle = '#05080f'; g.fillRect(0, 0, W, W);
    g.save(); g.translate(W / 2, W / 2); g.rotate(this.cam.yaw + Math.PI); g.scale(zoom, zoom); g.translate(-p.x, -p.z);
    // map drawImage: map pixel (tx(x), tz(z)) -> world via S
    g.drawImage(this.mapCanvas, -this.mapSize / S / 2, -this.mapSize / S / 2, this.mapSize / S, this.mapSize / S);
    const dot = (x, z, r, col, ring) => { g.fillStyle = col; g.beginPath(); g.arc(x, z, r / zoom, 0, TAU); g.fill(); if (ring) { g.strokeStyle = '#fff'; g.lineWidth = 1 / zoom; g.stroke(); } };
    for (const h of this.humans) { if (h.dead) continue; if (h.team === 'gang') dot(h.x, h.z, 3.2, '#ff3050'); else if (h.team === 'cop') dot(h.x, h.z, 3.2, Math.floor(this.time * 4) % 2 ? '#ff2040' : '#3060ff'); }
    for (const v of this.vehicles) if (v.police && !v.dead) dot(v.x, v.z, 4, Math.floor(this.time * 4) % 2 ? '#ff2040' : '#3060ff', true);
    for (const pk of this.pickups) if (pk.active && pk.type !== 'cash') dot(pk.x, pk.z, 2.2, pk.type === 'health' ? '#47ffa8' : pk.type === 'armor' ? '#4de3ff' : '#ffc94d');
    if (this.markerPos) {
      let mx = this.markerPos.x, mz = this.markerPos.z; const dx = mx - p.x, dz = mz - p.z, d = Math.hypot(dx, dz), lim = (W / 2 - 14) / zoom;
      if (d > lim) { mx = p.x + dx / d * lim; mz = p.z + dz / d * lim; }
      dot(mx, mz, 5.2, '#ffc94d', true);
    }
    g.restore();
    // player arrow
    g.save(); g.translate(W / 2, W / 2); g.rotate(0); g.fillStyle = '#4de3ff'; g.strokeStyle = '#001'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -11); g.lineTo(8, 9); g.lineTo(0, 5); g.lineTo(-8, 9); g.closePath(); g.fill(); g.stroke(); g.restore();
    // vignette ring
    const gr = g.createRadialGradient(W / 2, W / 2, W * 0.36, W / 2, W / 2, W / 2); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.55)');
    g.fillStyle = gr; g.fillRect(0, 0, W, W);
  }
}
