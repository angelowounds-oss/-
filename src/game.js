import * as THREE from 'three';
import { buildWorld, N, P, R, SW, LANE, HALF, roadC, nodePos } from './world.js';
import { createRain, Particles, Tracers, LightPool } from './fx.js';
import { Vehicle, CAR_COLORS } from './vehicle.js';
import { Human, WEAPONS } from './human.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { glowSpriteMat } from './models.js';
import { timeUniform, flashUniform, nightU, doorCamU } from './shaders.js';
import { clamp, lerp, damp, dampAngle, angDiff, rand, el, TAU, smooth } from './util.js';
import { QUALITY } from './engine.js';
import { loadAssets } from './assets.js';
import { buildDressing } from './dressing.js';
import { buildSkyline } from './skyline.js';
import { buildSigns } from './signs.js';
import { buildTerrain, addTerrainPhysics, heightAt } from './terrain.js';
import resWall from '../assets/res/res_wall.jpg';
import { Physics } from './physics.js';
import { Buildings } from './building.js';
import { Interact } from './interact.js';
import { ItemWorld } from './items.js';
import { Panels } from './panels.js';
import { Life } from './life.js';
import { Clock, Needs } from './needs.js';
import { actions } from './actions.js';
import { garage } from './garage.js';
import { Jobs } from './jobs.js';
import { Phone, gpsRoute } from './phone.js';
import { DayNight } from './daynight.js';
import { Society, ZONES } from './society.js';
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
    this.state.homes = this.state.homes || {}; this.state.bank = this.state.bank ?? 0;
    this.clock = new Clock(this); this.needs = new Needs(this); this.daynight = new DayNight(this);
  }

  slotKey() { return SAVE_KEY + '_' + (localStorage.getItem('neon_slot') || 1); }
  load() { try { return JSON.parse(localStorage.getItem(this.slotKey())) || JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; } }
  saveSlot(n) { try { localStorage.setItem(`${SAVE_KEY}_${n}`, JSON.stringify(this.snapshot())); localStorage.setItem('neon_slot', n); } catch { /* ignore */ } }
  snapshot() { return { cash: this.cash, mission: this.missionIndex, kills: this.stats.kills, world: this.state }; }
  save() { try { localStorage.setItem(this.slotKey(), JSON.stringify(this.snapshot())); } catch { /* ignore */ } }

  // ====================================================================
  async init(progress) {
    const { eng } = this;
    progress(0.05, '에셋 로딩 중…');
    await loadAssets();
    progress(0.1, '도시 생성 중…');
    await new Promise((r) => setTimeout(r, 30));
    this.world = buildWorld(this.scene, eng.q);
    this.dressing = buildDressing(this.scene, this.world);
    this.skyline = buildSkyline(this.scene, this.world, resWall);
    this.signs = buildSigns(this.scene, this.world);
    this.phys = new Physics(this.RAPIER); this.phys.initGround(this.world.waters); this.phys.addStatic(this.world.colliders); addTerrainPhysics(this.phys); this.terrain = buildTerrain(this.scene); this.heightAt = heightAt;
    this.buildings = new Buildings(this);
    this.phys.onGlassHit = (box, sp, body) => { if (sp > 5.5 && box.pane) box.pane.b.breakPane(box, this.phys.bodies.get(body.handle)?.owner?.driver === 'player' ? this.player : null); };
    this.interact.providers.push((pl, out) => this.vehicleProvider(pl, out));
    { const sp = this.world.spawn; this.hospital = (this.world.enterables || []).slice().sort((a, b) => Math.hypot(a.x - sp.x, a.z - sp.z) - Math.hypot(b.x - sp.x, b.z - sp.z))[4]; if (this.hospital) this.hospital.lot.hospital = true; }
    this.items = new ItemWorld(this); this.life = new Life(this); this.society = new Society(this); this.buildStations();
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
    this.panels = new Panels(this); this.jobs = new Jobs(this); this.phone = new Phone(this);
    if (!Object.keys(this.items.inv.items).length && !this.state.started) { this.state.started = true; for (const [id, n] of [['water', 1], ['burger', 1], ['bandage', 2], ['flashlight', 1]]) this.items.add(id, n); }
    this.populate(); this.spawnCrafts();
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
    pl.ammo = [{ clip: 12, reserve: 96 }, { clip: 30, reserve: 150 }, { clip: 25, reserve: 0 }, { clip: 6, reserve: 0 }, { clip: 5, reserve: 0 }]; pl.owned = [true, true, false, false, false];
    pl.cur = 0; pl.reloadT = 0; pl.fireCd = 0; pl.weaponDrawn = false; pl.spread = 0; pl.dead = false;
    pl.m.pistol.visible = true;
    pl.body3 = new Character(this.phys, pl.x, 0, pl.z); if (this.state.outfit) pl.m.setTop?.(this.state.outfit);
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
    const type = Math.random() < 0.07 ? 'bus' : CAR_TYPES[Math.floor(Math.random() * CAR_TYPES.length)];
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
    this.ui = { hp: g('hpFill'), ar: g('arFill'), cash: g('cash'), stars: g('stars'), mText: g('mText'), mTitle: g('mTitle'), mDist: g('mDist'), wName: g('wName'), ammo: g('ammo'), speedo: g('speedo'), spd: g('spd'), carHp: g('carHpFill'), hint: g('hint'), toast: g('toast'), cross: g('cross'), dmg: g('dmg'), dir: g('dir'), feed: g('feed'), flash: g('flash'), hud: g('hud'), mini: g('minimap'), weapon: g('weapon'), fps: g('fps'), lt: g('letterT'), lb: g('letterB'), nFood: g('nFood'), nWater: g('nWater'), nEnergy: g('nEnergy') };
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
    u('reset').onclick = () => { try { localStorage.removeItem(this.slotKey()); } catch { /* ignore */ } location.reload(); };
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
    this.theftT = (this.theftT || 0) - sdt; if (this.theftT <= 0) { this.theftT = 0.5; this.life.checkTheft(this.player); }
    this.clock.update(sdt); this.needs.update(sdt); this.society.update(sdt); this.items.update(sdt); this.updateFlashlight();
    if (this.input.edge('inv')) this.openInventory();
    if (this.input.edge('sur') && this.playerOnFoot) this.surrender();
    if (this.input.edge('phone') && !this.uiModal && !this.player.dead) this.phone.show();
    this.jobs.update(sdt); this.updateGPS(sdt);
    this.autosave = (this.autosave || 0) + sdt; if (this.autosave > 30) { this.autosave = 0; this.save(); }
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
    Human.camX = camera.position.x; Human.camZ = camera.position.z;
    this.world.animate(dt, this.time, camera.position);
    if (!still) {
      this.fakeT = (this.fakeT || 0) - dt;
      if (this.fakeT <= 0) { this.fakeT = 0.12; this.world.updateFakeLights(focus.x, focus.z); }
      this.tlT = (this.tlT || 0) - dt;
      const ph = Math.floor(this.time * 2);
      if (ph !== this.lastPh) { this.lastPh = ph; this.world.updateTrafficLights(this.time); }
    }
    this.daynight.update(dt, focus);
    if ((this.vlodT = (this.vlodT || 0) - dt) <= 0) { this.vlodT = 0.25; this.vehicleLOD(camera.position); this.dressing?.update(camera.position); this.signs?.update(camera.position); }
    this.rain.material.uniforms.uCam.value.copy(camera.position);
    doorCamU.value.set(this.player.x, this.player.y, this.player.z);
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
    if (this.input.edge('cam')) { cam.fp = !cam.fp; this.toast(cam.fp ? '1인칭 시점' : '3인칭 시점'); }
    // camera look
    const wz = pl.aiming && pl.cur !== 9 && WEAPONS[pl.cur] ? WEAPONS[pl.cur].zoom || 1 : 1;
    const k = 0.0022 * (pl.aiming ? 0.6 : 1) / Math.pow(wz, 0.85);
    cam.yaw -= inp.lookX * k; cam.pitch = clamp(cam.pitch - inp.lookY * k, -1.2, 1.05);
    if (inp.lookX || inp.lookY) cam.offsetT = 2.2;
    { const order = [...pl.owned.map((o, i) => (o ? i : -1)).filter((i) => i >= 0), 9]; const ci = Math.max(0, order.indexOf(pl.cur));
      if (this.input.edge('swap')) this.switchWeapon(order[(ci + 1) % order.length]);
      if (inp.wheel) this.switchWeapon(order[(ci + (inp.wheel > 0 ? 1 : order.length - 1)) % order.length]);
      for (const [k, i] of [['w1', 0], ['w2', 1], ['w3', 2], ['w4', 3], ['w5', 4], ['w6', 9]]) if (this.input.edge(k) && (i === 9 || pl.owned[i])) this.switchWeapon(i); }
    this.input.edge('lights');
    if (this.playerOnFoot) this.footControl(dt, inp);
    else this.driveControl(dt, inp);
    this.regen = (this.regen || 0) + dt;
  }

  switchWeapon(i) {
    const pl = this.player; if (i === pl.cur || !this.playerOnFoot) return;
    pl.cur = i; pl.setWeapon(i === 9 ? 100 : i); pl.reloadT = 0; pl.fireCd = 0.25;
    this.audio.tone?.(500, 0.05, 'square', 0.06);
  }

  footControl(dt, inp) {
    const pl = this.player, cam = this.cam, melee = pl.cur === 9, w = melee ? null : WEAPONS[pl.cur], ammo = melee ? null : pl.ammo[pl.cur];
    pl.group.visible = true;
    if (pl.sitting) { pl.vx = pl.vz = 0; pl.speed = 0; pl.aiming = false; this.nearInteract = this.findInteract(pl); pl.animate(dt, 0); if (this.input.edge('jump') || this.input.edge('use')) this.standUp(); return; }
    if (this.input.edge('crouch')) pl.stance = pl.stance === 1 ? 0 : 1;
    if (this.input.edge('prone')) pl.stance = pl.stance === 2 ? 0 : 2;
    pl.crouching = pl.stance >= 1; pl.prone = pl.stance === 2;
    pl.crouch = damp(pl.crouch || 0, pl.stance === 1 ? 0.65 : pl.prone ? 0.2 : 0, 10, dt);
    const carry = this.items.carry;
    if (carry && inp.fire && !pl.fireHeld) { this.items.release(true); pl.fireHeld = true; inp = { ...inp, fire: false }; }
    else if (carry) inp = { ...inp, fire: false };
    const aim = inp.aim; pl.aiming = aim;
    const sprint = inp.sprint && !aim && !inp.fire && inp.my > 0.3 && !pl.crouching && (!this.needs.on || this.needs.canSprint !== false);
    const fwdX = Math.sin(cam.yaw), fwdZ = Math.cos(cam.yaw), rX = -Math.cos(cam.yaw), rZ = Math.sin(cam.yaw);
    let mx = inp.mx, my = inp.my; const mag = Math.min(1, Math.hypot(mx, my));
    let dx = fwdX * my + rX * mx, dz = fwdZ * my + rZ * mx;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const base = (aim ? 2.6 : sprint ? 8.4 : 5.2) * (pl.prone ? 0.25 : pl.crouching ? 0.5 : 1) * this.needs.speedMul() * (carry ? 0.85 : 1);
    const spd = base * (mag < 0.15 ? 0 : clamp(mag * 1.1, 0.5, 1));
    pl.vx = damp(pl.vx, dx * spd, 10, dt); pl.vz = damp(pl.vz, dz * spd, 10, dt);
    const c3 = pl.body3;
    const riding = this.buildings.ridingElevator(pl);
    if (pl.hang) { this.stepHang(dt, inp); return; }
    if (pl.mantle) { this.stepMantle(dt); return; }
    if (this.input.edges.jump > 0 && !pl.crouching && !pl.swimming && this.tryMantle(inp)) { this.input.edge('jump'); return; }
    const wat = this.waterAt(pl.x, pl.z);
    const swim = wat && wat.y - pl.y > 0.95;
    pl.swimming = !!swim;
    let impact = 0;
    if (swim) { const k = 0.55; c3.swim(dt, pl.vx * k, pl.vz * k, wat.y - 1.25 + Math.sin(this.time * 2) * 0.04); pl.sprintFx = 0; }
    else if (!riding) impact = c3.move(dt, pl.vx, pl.vz, this.input.edge('jump') && !pl.crouching ? 7.2 : 0);
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
    if (melee) { if (inp.fire && pl.fireCd <= 0) this.meleeAttack(); }
    else {
    if (pl.reloadT > 0) { pl.reloadT -= dt; if (pl.reloadT <= 0) { const need = w.clip - ammo.clip, take = Math.min(need, ammo.reserve); ammo.clip += take; ammo.reserve -= take; } }
    if ((this.input.edge('reload') || (ammo.clip === 0 && inp.fire && ammo.reserve > 0)) && pl.reloadT <= 0 && ammo.clip < w.clip && ammo.reserve > 0) { pl.reloadT = w.reload; this.audio.reload(); }
    if (inp.fire && pl.reloadT <= 0 && pl.fireCd <= 0) {
      if (ammo.clip > 0) {
        if (w.auto || !pl.fireHeld) this.playerShoot(w, ammo);
      } else if (!pl.fireHeld) { this.audio.empty(); pl.fireCd = 0.3; }
    }
    }
    if (this.input.edge('nade') && this.items.take('grenade')) this.throwGrenade();
    if (pl.bleed) { pl.bleedT = (pl.bleedT || 0) + dt; if (pl.bleedT > 1) { pl.bleedT = 0; this.hurtPlayer(1.2, null, 'bleed'); } }
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
    for (const v of this.vehicles) { if (!v.group.visible || v.dead) continue; const d = this.distToVehicle(pl.x, pl.z, v) - (v.spec.craft === 'heli' ? 1.5 : 0); if (d < bd && Math.abs((v.by || 0) - (pl.y || 0)) < 5) { bd = d; best = v; } }
    if (!best) return;
    const v = best, verbs = [];
    if (v.type === 'bus') verbs.push({ key: 'F', label: () => '버스 탑승 $2', run: () => { if (this.cash < 2) return this.toast('돈이 부족합니다'); this.cash -= 2; this.boardTaxi(v, true); } });
    else if (v.callTaxi && v.arrived) verbs.push({ key: 'F', label: () => '택시 탑승', run: () => this.boardTaxi(v) });
    else verbs.push({ key: 'F', label: () => (v.driver === 'ai' ? '차량 강탈' : v.spec.craft === 'heli' ? '헬기 탑승' : v.spec.craft === 'boat' ? '보트 탑승' : v.type === 'moto' ? '오토바이 탑승' : '차량 탑승'), run: () => this.enterVehicle(v) });
    if (v.driver !== 'ai' && !v.spec.craft && v.type !== 'bus') verbs.push({ key: 'T', label: () => '트렁크', run: () => this.openTrunk(v) });
    out.push({ x: v.x, z: v.z, r: Math.max(v.L, v.W) / 2 + 3.7, name: v.type === 'moto' ? '오토바이' : v.spec.craft === 'heli' ? '헬리콥터' : v.spec.craft === 'boat' ? '보트' : '차량', verbs });
  }
  // ledge climb / vault: probe forward at knee & chest height, find the top surface, glide over it
  tryMantle(inp) {
    const pl = this.player, ph = this.phys, yaw = (inp.mx || inp.my) ? Math.atan2(pl.vx || Math.sin(this.cam.yaw), pl.vz || Math.cos(this.cam.yaw)) : pl.ry;
    const dx = Math.sin(yaw), dz = Math.cos(yaw), M = 1 | 16 | 8 | 32;
    const probe = (h) => ph.ray(pl.x, pl.y + h, pl.z, dx, 0, dz, 1.1, 1 | 16 | 32);
    const lo = probe(0.55), hi = probe(1.15);
    if (!lo && !hi) return false;
    const hit = hi || lo, t = hit.t;
    // find the top surface just beyond the wall face
    const px = pl.x + dx * (t + 0.45), pz = pl.z + dz * (t + 0.45);
    const top = ph.ray(px, pl.y + 2.9, pz, 0, -1, 0, 3.4, 1 | 16 | 32);
    if (!top) return false;
    const ty = pl.y + 2.9 - top.t, h = ty - pl.y;
    if (h < 0.45 || h > 3.7) return false;
    if (ph.ray(px, ty + 0.1, pz, 0, 1, 0, 1.75, 1 | 16 | 32)) return false; // no headroom
    if (h > 2.45) { // too high to vault: jump up and hang from the ledge
      const hx = pl.x + dx * (t - 0.32), hz = pl.z + dz * (t - 0.32), hy = ty - 1.85;
      pl.hang = { x: hx, y: Math.max(hy, pl.y), z: hz, ty, px, pz, ry: yaw, t: 0 }; pl.vx = pl.vz = 0; this.audio.tone?.(220, 0.08, 'sine', 0.06, 120); this.toast('매달렸다', 'W/Space: 올라가기 · S/C: 놓기');
      return true;
    }
    pl.mantle = { t: 0, dur: 0.35 + h * 0.2, from: [pl.x, pl.y, pl.z], to: [px, ty + 0.05, pz], h };
    pl.vx = pl.vz = 0; pl.mantleFx = true; this.audio.tone?.(180, 0.1, 'sine', 0.06, 90);
    return true;
  }
  climbTo(x0, y0, z0, x1, y1, z1, speed) {
    const pl = this.player; if (pl.mantle || this.frozen()) return;
    pl.mantle = { t: 0, dur: Math.abs(y1 - y0) / speed + 0.5, from: [x0, y0, z0], to: [x1, y1, z1], h: Math.abs(y1 - y0), ladder: true };
    pl.body3.teleport(x0, y0, z0); pl.x = x0; pl.z = z0; pl.y = y0 + 0.06; this.audio.tone?.(300, 0.05, 'square', 0.04);
  }
  stepHang(dt, inp) {
    const pl = this.player, hg = pl.hang; hg.t += dt;
    const k = Math.min(1, hg.t / 0.3), y = pl.y + (hg.y - pl.y) * Math.min(1, dt * 12);
    pl.body3.teleport(hg.x, y - 0.06, hg.z); pl.x = hg.x; pl.z = hg.z; pl.y = y; pl.ry = hg.ry; pl.speed = 0; pl.animate(dt, 0);
    if (this.input.edge('jump') || inp.my > 0.4) { pl.hang = null; pl.mantle = { t: 0, dur: 1.0, from: [hg.x, y, hg.z], to: [hg.px, hg.ty + 0.05, hg.pz], h: 3 }; }
    else if (this.input.edge('crouch') || inp.my < -0.4) { pl.hang = null; pl.body3.vy = 0; }
  }
  stepMantle(dt) {
    const pl = this.player, m = pl.mantle; m.t += dt; const k = Math.min(1, m.t / m.dur);
    const L = m.ladder, up = L ? k : Math.min(1, k * 1.7), fw = L ? Math.max(0, (k - 0.85) / 0.15) : Math.max(0, (k - 0.35) / 0.65);
    const x = m.from[0] + (m.to[0] - m.from[0]) * fw, z = m.from[2] + (m.to[2] - m.from[2]) * fw, y = m.from[1] + (m.to[1] - m.from[1]) * (up * up * (3 - 2 * up));
    pl.body3.teleport(x, y - 0.06, z); pl.x = x; pl.y = y; pl.z = z; pl.ry = Math.atan2(m.to[0] - m.from[0], m.to[2] - m.from[2]); pl.speed = 2;
    pl.animate(dt, 2);
    if (k >= 1) { pl.mantle = null; }
  }
  setWaypoint(x, z) { this.setBeacon(x, z, 0xffc94d); this.gpsT = 0; this.gpsPath = gpsRoute(this.player.x, this.player.z, x, z); this.toast('목적지 설정', `${Math.hypot(x - this.player.x, z - this.player.z) | 0}m`); }
  updateGPS(dt) {
    this.gpsT = (this.gpsT || 0) - dt; if (this.gpsT > 0) return; this.gpsT = 1;
    const j = this.jobs.cur; const el2 = this.ui.job || (this.ui.job = el('job'));
    if (j) { el2.classList.add('on'); el2.innerHTML = `<b>${j.title}</b> · ${j.hud || j.text}`; } else el2.classList.remove('on');
    if (!this.markerPos) { this.gpsPath = null; return; }
    const pl = this.vehicle || this.player; this.gpsPath = gpsRoute(pl.x, pl.z, this.markerPos.x, this.markerPos.z);
  }
  waterAt(x, z) { for (const w of this.world.waters) if (x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1) return w; return null; }
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
    if (inside !== this.indoor) { this.indoor = inside; this.audio.setIndoor?.(inside); }
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
  noteCrime(pl, kind, heat) { return this.society.crime(kind, heat); }
  enterVehicle(v) {
    const pl = this.player; this.lastVehicle = v;
    // carjack AI driver
    if (v.driver === 'ai') {
      const d = this.spawnCivilian(false);
      if (d) { d.x = v.x + Math.cos(v.h) * (v.W / 2 + 1); d.z = v.z - Math.sin(v.h) * (v.W / 2 + 1); d.state = 'flee'; d.fleeT = 8; d.threat = pl; d.group.visible = true; }
      this.society.crime('carjack', 12); this.feed('차량 강탈', '#ff8a5c');
    }
    v.doorFx?.(); this.vehicle = v; v.driver = 'player'; v.kind = v.kind === 'police' ? 'police' : 'player'; v.awake = true; v.pv.body.wakeUp();
    v.setLights(true);
    this.playerOnFoot = false; pl.group.visible = false;
    this.setFirstPerson(false);
    if (v.type === 'moto' && v.model.frame) {
      // rider stays visible, seated on the bike and leaning with the frame
      v.model.frame.add(pl.group); pl.group.position.set(0, 0.42, -0.4); pl.group.rotation.set(0, 0, 0); pl.group.scale.setScalar(0.92);
      pl.group.visible = true; pl.m.applySit(1); pl.m.pistol.visible = pl.m.rifle.visible = false; this.rider = v;
    }
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
    if (this.rider) { this.scene.add(pl.group); pl.group.scale.setScalar(1); pl.group.rotation.set(0, 0, 0); pl.m.applySit(0); this.rider = null; pl.m.pistol.visible = pl.armed && pl.weapon.short === 'pistol'; pl.m.rifle.visible = pl.armed && pl.weapon.short === 'rifle'; }
    v.doorFx?.(); this.vehicle = null; this.playerOnFoot = true; pl.group.visible = true; { const gy = heightAt(pl.x, pl.z); pl.y = gy; pl.vx = pl.vz = 0; pl.body3.teleport(pl.x, gy, pl.z); }
    pl.hpv = Math.max(pl.hpv, 1);
    document.body.classList.add('onfoot'); document.body.classList.remove('incar');
    this.ui.speedo.classList.remove('on');
    this.cam.yaw = v.h; this.audio.door();
  }
  driveControl(dt, inp) {
    if (this.rider) { const m = this.player.m; m.mixer.update(dt); m.applyPose(0, 0); m.body.position.y = -0.5; }
    const v = this.vehicle, pl = this.player;
    if (this.passenger) { this.taxiTick(); pl.x = v.x; pl.z = v.z; pl.body3.teleport(pl.x, 0, pl.z); if (this.input.edge('use') && v.speed < 3) this.endPassenger(false); if (this.input.edge('cam')) this.cam.mode = (this.cam.mode + 1) % 3; return; }
    v.throttle = inp.gas; v.brake = inp.brake; v.steer = inp.steer; v.hand = inp.hand; v.down = inp.sprint;
    if (v.spec.craft === 'heli') { v.throttle = inp.gas; v.hand = this.input.keys.has('Space'); }
    if (this.input.edge('verb3') && v.speed < 4 && this.nearStation(v.x, v.z)) this.refuel(v);
    // gamepad/keys give both throttle & brake semantic via my; if reversing handled by physics
    if (this.input.edge('use') && !this.player.dead) this.exitVehicle();
    if (this.input.edge('horn')) { this.audio.horn(); this.alertCivs(v.x, v.z, 25); }
    if (this.input.edge('cam')) this.cam.mode = (this.cam.mode + 1) % 3;
    if (this.input.edge('lights')) v.setLights(!v.lightsOn);
    pl.x = v.x; pl.z = v.z; pl.y = v.spec.craft === 'heli' ? v.by : 0; pl.body3.teleport(pl.x, pl.y, pl.z);
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
    ammo.clip--; pl.fireCd = w.rate; pl.recoil = 1; this.lastShotT = this.time;
    const dir0 = this.tmpV.set(0, 0, -1).applyQuaternion(cam.quaternion).clone();
    const pel = w.pellets || 1;
    for (let pi = 1; pi < pel; pi++) { const d2 = dir0.clone(); d2.x += rand(-w.spread, w.spread); d2.y += rand(-w.spread, w.spread); d2.z += rand(-w.spread, w.spread); d2.normalize(); this.hitscan(cam.position.x, cam.position.y, cam.position.z, d2.x, d2.y, d2.z, w.range, pl, w.damage, w.head); }
    const dir = this.tmpV.copy(dir0);
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
  meleeAttack() {
    const pl = this.player, m = pl.melee || { dmg: 9, rate: 0.45, name: '맨손' };
    pl.fireCd = m.rate; pl.punchT = 0.22; if (pl.m.playOnce && pl.m.playOnce(Math.random() < 0.5 ? 'U_Punch_Jab' : 'U_Punch_Cross', false)) pl.reactT = 0.42; this.audio.tone?.(160, 0.07, 'sine', 0.08, 80); this.lastShotT = this.time - 1;
    const fx = Math.sin(pl.ry), fz = Math.cos(pl.ry);
    let best = null, bd = 2.2;
    for (const h of this.humans) {
      if (h.dead || h.hidden || h.inside) continue;
      const dx = h.x - pl.x, dz = h.z - pl.z, d = Math.hypot(dx, dz); if (d > bd || Math.abs((h.y || 0) - pl.y) > 1.6) continue;
      if ((dx * fx + dz * fz) / (d + 1e-3) < 0.35) continue; bd = d; best = h;
    }
    if (best) {
      const unaware = best.state !== 'attack' && best.state !== 'flee', behind = Math.cos(best.ry - pl.ry) > 0.2;
      const silent = unaware && behind && pl.crouching, dmg = m.dmg * (silent ? 5 : 1);
      best.hurt(dmg, pl, false, pl); const dx = best.x - pl.x, dz = best.z - pl.z, l = Math.hypot(dx, dz) || 1;
      if (!best.dead) best.ragdoll(dx / l * 3.5, dz / l * 3.5, 1.5);
      this.markHit(false); this.audio.impact(0.7, 0); this.fx.sparks(best.x, 1.2, best.z, 3, [1, 0.3, 0.3], 4);
      if (best.team === 'civ') this.society.crime('assault', silent ? 8 : 10, best.x, best.z);
      this.noise(pl.x, pl.z, silent ? 6 : 14);
      if (silent && best.dead) this.toast('암살', '소리 없이 제압');
      return;
    }
    const cam = this.camera, d = this.tmpV.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const h = this.phys.ray(pl.x, pl.y + 1.3, pl.z, fx, 0, fz, 1.8, 1 | 8 | 16 | 32);
    if (h && h.ref) {
      if (h.ref.tag === 'glass' && h.ref.pane) { h.ref.pane.b.breakPane(h.ref, pl); }
      else if (h.ref.isProp) h.ref.hit(fx, 0.2, fz, m.dmg * 2);
      else if (h.ref.isDoor && h.ref.locked && m.name !== '맨손') h.ref.kick(pl);
    }
  }
  throwGrenade() {
    const pl = this.player, cam = this.camera, dir = this.tmpV.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const p = this.items.drop('grenade', pl.x + dir.x * 0.6, pl.y + 1.5, pl.z + dir.z * 0.6, { x: dir.x * 16, y: dir.y * 16 + 4, z: dir.z * 16 });
    if (p) { p.fuse = 2.3; p.body.setAngularDamping(1); this.audio.tone?.(300, 0.1, 'sine', 0.06, 160); }
    this.lastShotT = this.time; this.noise(pl.x, pl.z, 20);
  }
  blastWorld(x, y, z, r) {
    for (const b of this.buildings.active) for (const [, fl] of b.floors) for (const gb of [...fl.glass]) { const e = gb.pane.ex; if (Math.hypot((e[0] + e[3]) / 2 - x, (e[2] + e[5]) / 2 - z, (e[1] + e[4]) / 2 - y) < r * 1.4) b.breakPane(gb, this.player); }
    for (const p of this.items.props.values()) { const t = p.body.translation(), dx = t.x - x, dz = t.z - z, dy = t.y - y, d = Math.hypot(dx, dy, dz); if (d < r * 1.6) { const k = (1 - d / (r * 1.6)) * p.def.mass * 9; p.body.applyImpulse({ x: dx / (d || 1) * k, y: k * 0.8, z: dz / (d || 1) * k }, true); p.body.wakeUp(); } }
    for (const d of this.buildings.active) for (const dr of d.doors) { if (Math.hypot(dr.x - x, dr.z - z) < r * 0.9 && !dr.broken) { dr.locked = false; dr.swing = 1; dr.target = 1.5; dr.vel = 8; } }
  }
  muzzleWorld(h) { const v = this.tmpV2; h.m.muzzle.getWorldPosition(v); return new V3().copy(v); }
  markHit(head) { this.hitMarker = 0.18; this.ui.cross.classList.add('hit'); setTimeout(() => this.ui.cross.classList.remove('hit'), 120); this.audio.hitMarker(); }

  // Ray vs world/humans/vehicles
  hitscan(ox, oy, oz, dx, dy, dz, range, owner, damage, headMul = 2) {
    const G = this, res = this.hit;
    let best = range, kind = 'none', obj = null, head = false;
    let tw = -1, acc = 0, hitRef = null;
    for (let n = 0; n < 5; n++) {
      const t = this.world.colliders.raycast(ox + dx * acc, oy + dy * acc, oz + dz * acc, dx, dy, dz, best - acc);
      if (t < 0) break;
      const ref = this.world.colliders.lastRef;
      if (ref && ref.tag === 'glass' && ref.pane) { ref.pane.b.breakPane(ref, owner === this.player ? this.player : null); acc += t + 0.04; continue; }
      tw = acc + t; hitRef = ref; break;
    }
    if (tw >= 0) { best = tw; kind = 'world'; if (hitRef && hitRef.isProp) { hitRef.hit?.(dx, dy, dz, damage); } else if (hitRef && hitRef.onShot) hitRef.onShot(); }
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
    const cover = !this.hasLOS(from.x, from.y, from.z, tx, (this.playerOnFoot ? pl.y + (pl.prone ? 0.35 : pl.crouching ? 0.75 : 1.25) : 1.1), tz);
    const hit = !cover && Math.random() < hitChance;
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
    if (kind === 'bullet' && dmg >= 6 && Math.random() < 0.35 && !pl.bleed) { pl.bleed = 1; this.toast('출혈!', '붕대나 구급상자가 필요합니다'); }
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
    const hp = this.hospital; pl.x = hp ? hp.x : this.world.spawn.x; pl.z = hp ? hp.z : this.world.spawn.z; pl.y = 0; pl.vx = pl.vz = 0; pl.knock = 0; pl.bleed = 0; pl.body3.teleport(pl.x, 0, pl.z);
    pl.setWeapon(pl.cur === 9 ? 100 : pl.cur);
    this.clearWanted();
    this.ui.lt.classList.remove('on'); this.ui.lb.classList.remove('on');
    this.toast('병원에서 깨어났다', `치료비 $${cost}`);
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
    if (h.team === 'civ') { if (src === this.player) { this.society.crime('murder', 14, h.x, h.z); this.feed('시민 사망', '#ff8a5c'); } }
    else if (h.team === 'cop') { if (src === this.player) { this.addHeat(40); this.feed('경찰 사살', '#ff4560'); } this.makePickup('cash', [0.3, 1, 0.5], h.x, h.z, this.pickupGeo, 100); }
    else if (h.team === 'gang') { if (src === this.player) { this.society.addRep(h.zone ?? this.society.zoneAt(h.x, h.z), -6); } if (src === this.player) this.feed('갱단 처치 +$' + h.cash, '#47ffa8'); this.makePickup('cash', [0.3, 1, 0.5], h.x, h.z, this.pickupGeo, h.cash); this.missionKill?.(h); }
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
    this.lights.flash(x, y + 2, z, 0xff8a30, 160, 60, 0.9); this.blastWorld(x, y, z, radius);
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
      if (v.kind === 'traffic' && !v.dead && v.driver === 'ai' && v !== this.vehicle && !v.callTaxi && v !== this.passenger) {
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
      this.popT = 0.3;
      const tc = list.filter((v) => v.kind === 'traffic' && v.driver === 'ai').length;
      const pf = this.society.popFactor();
      if (tc < Math.round(this.eng.q.traffic * (0.4 + 0.6 * pf))) this.spawnTraffic(false);
      const civs = this.humans.filter((h) => h.team === 'civ' && !h.dead && !h.static && !h.inside);
      const want = Math.round(this.eng.q.npc * pf);
      if (civs.length < want) { const n = want - civs.length > 8 ? 3 : 1; for (let i = 0; i < n; i++) this.spawnCivilian(false); }
      else if (civs.length > want + 2) { const far = civs.find((h) => Math.hypot(h.x - pl.x, h.z - pl.z) > 50); if (far) far.remove = true; }
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
      if (h.inside && !h.trip) { if (this.time >= h.inside.until) this.society.leave(h); continue; }
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
    if (this.nextLightning <= 0) { const wt = this.weatherType; this.nextLightning = wt === 'storm' ? rand(5, 12) : rand(16, 40); if (wt !== 'clear') { this.bolt = 0.5; this.thunderT = rand(0.6, 3); } }
    if (this.bolt > 0) {
      this.bolt -= dt; const f = Math.max(0, Math.sin(this.bolt * 38) * 0.5 + 0.5) * Math.min(1, this.bolt * 3);
      flashUniform.value = f * 2.2 * (1 - (this.dayK || 0) * 0.7); this.boltAdd = f;
      if (this.bolt <= 0) { flashUniform.value = 0; this.boltAdd = 0; }
    }
    if (this.thunderT > 0 && (this.thunderT -= dt) <= 0) this.audio.explosion?.call(this.audio, 0.35, 0);
  }

  // ====================================================================
  // Camera
  shake(a) { this.shakeAmt = Math.min(1.6, this.shakeAmt + a); }
  // first person: camera at the eye, body hidden, current weapon drawn as a view model fixed to the camera
  setScope(k) {
    if (this._scope === k) return; this._scope = k;
    const e = document.getElementById('scope'); if (e) e.className = k || ''; document.getElementById('hud')?.classList.toggle('scoped', k === 'sniper');
    this.ui.cross.classList.toggle('hide', !!k);
  }
  setFirstPerson(on) {
    const pl = this.player; if (this._fp === on) return; this._fp = on;
    for (const o of pl.m.skinMeshes) o.visible = !on;
    if (!on && this.vm) this.vm.visible = false;
  }
  firstPersonCam(dt, aim) {
    const cam = this.cam, c = this.camera, pl = this.player;
    this.setFirstPerson(true);
    const cp = Math.cos(cam.pitch), L = this.tmpV.set(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
    const eye = pl.y + (pl.prone ? 0.55 : pl.crouching ? 1.25 : 1.68) + (pl.speed > 0.5 ? Math.sin(performance.now() * 0.011) * 0.012 * Math.min(1, pl.speed / 5) : 0);
    const w = aim && pl.cur !== 9 ? WEAPONS[pl.cur] : null, zoom = w ? w.zoom || 1 : 1;
    cam.fov = damp(cam.fov, aim ? 2 * Math.atan(Math.tan(36 * Math.PI / 180) / zoom) * 180 / Math.PI : (pl.speed > 6 ? 78 : 72), 10, dt);
    if (w && w.scope === 'sniper') { const t = performance.now() * 0.001; cam.yaw += Math.sin(t * 1.3) * 0.00022; cam.pitch += Math.cos(t * 1.7) * 0.00018; }
    c.position.set(pl.x + L.x * 0.12, eye, pl.z + L.z * 0.12);
    c.lookAt(pl.x + L.x * 20, eye + L.y * 20, pl.z + L.z * 20);
    if (!this.vm) { this.vm = new THREE.Group(); c.add(this.vm); this.vmGun = {}; }
    const kind = pl.armed ? pl.weapon.short : null;
    for (const k of ['pistol', 'rifle']) {
      if (!this.vmGun[k]) { const m = pl.m[k].clone(true); m.position.set(0, 0, 0); m.rotation.set(0, 0, 0); m.scale.setScalar(0.8); m.traverse((o) => { o.frustumCulled = false; o.castShadow = false; }); m.rotation.y = Math.PI; this.vmGun[k] = m; this.vm.add(m); }
      this.vmGun[k].visible = kind === k;
    }
    const kick = Math.min(0.08, (pl.recoil || 0) * 0.02);
    this.vm.visible = !!kind && !(aim && kind && WEAPONS[pl.cur]?.scope === 'sniper') && !(aim && WEAPONS[pl.cur]?.scope === 'iron' && false);
    this.vm.position.set(aim ? 0 : 0.17, aim ? -0.12 : -0.2, -0.45 + kick);
    this.vm.rotation.set(-kick * 2, 0, 0);
  }
  updateCamera(dt, inp) {
    const cam = this.cam, c = this.camera, pl = this.player, G = this;
    let ax, ay, az;
    const adsW = pl.aiming && pl.cur !== 9 && WEAPONS[pl.cur] && !pl.sitting && !pl.prone ? WEAPONS[pl.cur] : null;
    const fpOn = (!!cam.fp || !!adsW) && !pl.dead && this.playerOnFoot;
    this.setScope(fpOn && adsW ? adsW.scope : '');
    if (fpOn) this.firstPersonCam(dt, pl.aiming);
    else this.setFirstPerson(false);
    if (fpOn) { /* camera already placed */ }
    else if (this.playerOnFoot || pl.dead) {
      if (pl.dead) cam.yaw += dt * 0.15;
      const aim = pl.aiming && !pl.dead;
      cam.dist = damp(cam.dist, aim ? 1.9 : 3.9, 9, dt); cam.shoulder = damp(cam.shoulder, aim ? 0.62 : 0.4, 9, dt);
      cam.fov = damp(cam.fov, aim ? 52 : (pl.speed > 6 ? 72 : 66), 6, dt);
      ax = pl.x; ay = pl.y + 1.55 - (pl.dead ? 0.8 : 0) - (pl.prone ? 1.0 : pl.crouching ? 0.35 : 0); az = pl.z;
      const cp = Math.cos(cam.pitch), L = this.tmpV.set(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
      const rX = -Math.cos(cam.yaw), rZ = Math.sin(cam.yaw);
      let tx = ax - L.x * cam.dist + rX * cam.shoulder, ty = ay - L.y * cam.dist + 0.25, tz = az - L.z * cam.dist + rZ * cam.shoulder;
      // collision
      const dx = tx - ax, dy = ty - ay, dz = tz - az, d = Math.hypot(dx, dy, dz);
      const cab = this.buildings.cabOf(pl);
      const hit = cab ? -1 : this.world.colliders.raycast(ax, ay, az, dx / d, dy / d, dz / d, d);
      let k = 1; if (hit >= 0) k = Math.max(0.12, (hit - 0.4) / d);
      if (ty - (ay - ay) < 0.3) { /* ground clamp below */ }
      tx = ax + dx * k; ty = ay + dy * k; tz = az + dz * k;
      // inside the lift cab the camera stays inside the box (static tower boxes would pull it onto the head)
      if (cab) { const m = 1.0; tx = clamp(tx, cab.cx - m, cab.cx + m); tz = clamp(tz, cab.cz - m, cab.cz + 0.95); ty = clamp(ty, cab.y + 0.5, cab.y + 2.45); }
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
      const big = v.spec.craft ? (v.spec.craft === 'heli' ? 15 : 10) : 0;
      const dist = (cam.mode === 0 ? 6.4 + big : cam.mode === 1 ? 9.5 + big : 0.1) + sp * 0.03;
      cam.fov = damp(cam.fov, 66 + clamp(sp * 0.55, 0, 22), 4, dt);
      ax = v.x; ay = 1.5 + (cam.mode === 2 ? 0.1 : 0); az = v.z;
      const cp = Math.cos(cam.pitch), L = this.tmpV.set(Math.sin(cam.yaw) * cp, Math.sin(cam.pitch), Math.cos(cam.yaw) * cp);
      let tx, ty, tz;
      if (cam.mode === 2) { // hood cam
        const s = Math.sin(v.h), cc = Math.cos(v.h), lat = this.passenger ? 0.5 : 0; tx = v.x + s * 0.7 + cc * lat; ty = 1.35; tz = v.z + cc * 0.7 - s * lat;
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
    const w = WEAPONS[pl.cur] || { name: pl.melee ? pl.melee.name.toUpperCase() : 'FISTS' }, am = pl.ammo[pl.cur] || { clip: 1, reserve: 0 };
    this.setText('wn', ui.wName, w.name);
    this.setHTML('am', ui.ammo, pl.cur === 9 ? '—' : pl.reloadT > 0 ? 'RELOAD' : `${am.clip}<small> / ${am.reserve}</small>` + (this.items.count('grenade') ? `<small> · 💣${this.items.count('grenade')}</small>` : ''));
    ui.ammo.classList.toggle('empty', am.clip === 0 && pl.cur !== 9);
    ui.weapon.style.display = this.playerOnFoot ? '' : 'none';
    ui.cross.classList.toggle('hide', !this.playerOnFoot || pl.dead || !!this._scope);
    if (v) { this.setText('spd', ui.spd, String(Math.round(v.speed * 3.6))); ui.carHp.style.width = clamp(v.hp / v.maxHp * 100, 0, 100) + '%'; el('fuelFill').style.width = clamp(v.fuel, 0, 100) + '%'; }
    // hint
    let hint = '';
    if (this.playerOnFoot && this.nearInteract && !pl.dead && !this.frozen()) hint = this.nearInteract.verbs.map((v) => `<kbd>${v.key}</kbd>${typeof v.label === 'function' ? v.label() : v.label}`).join('　') + '';
    else if (v && !this.passenger && this.nearStation(v.x, v.z) && v.speed < 4) hint = `<kbd>T</kbd>주유 · 연료 ${Math.round(v.fuel)}%`;
    else if (v && v.fuel < 12 && this.time % 2 < 1) hint = '연료 부족!';
    this.setHTML('hint', ui.hint, hint); ui.hint.classList.toggle('on', !!hint);
    // direction
    const bearing = ((Math.PI - this.cam.yaw) * 180 / Math.PI % 360 + 360) % 360;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']; this.setText('dir', ui.dir, dirs[Math.round(bearing / 45) % 8] + ' · ' + (bearing | 0) + '°');
    this.drawMinimap(); this.updateNeedsHUD();
    if (this.ui.fps.style.display !== 'none') { this.fpsAcc = (this.fpsAcc || 0) + dt; this.fpsN = (this.fpsN || 0) + 1; if (this.fpsAcc > 0.5) { ui.fps.textContent = `${Math.round(this.fpsN / this.fpsAcc)} fps · ${this.eng.q.name} ×${this.eng.scale.toFixed(1)}`; this.fpsAcc = this.fpsN = 0; } }
    this.autoQuality(dt);
    if (this.input.touch) this.input.audioUnlock = true;
  }
  // glow sprites, beams and underglow are invisible by day or far away: skip their draw calls
  vehicleLOD(cp) {
    const night = nightU.value;
    for (const v of this.vehicles) {
      const m = v.model; if (!v.group.visible || !m || v.dead) continue;
      const d = Math.hypot(v.x - cp.x, v.z - cp.z), lit = night > 0.1, near = d < 80;
      m.beams.visible = v.lightsOn && d < 45 && night > 0.2;
      m.ug.visible = v.lightsOn && v.kind !== 'parked' && d < 45 && lit;
      for (const sp of m.headSprites) sp.visible = v.lightsOn && near && lit;
      for (const sp of m.tailSprites) sp.visible = (v.lightsOn || m.brake.visible) && near && lit;
    }
  }
  autoQuality(dt) {
    // frame-time driven dynamic resolution; tier drop only when already at minimum scale
    const a = this.aq = this.aq || { ema: 1 / 60, cool: 4, slow: 0, fast: 0, last: performance.now() };
    const now = performance.now(); dt = Math.min((now - a.last) / 1000, 1); a.last = now;
    a.cool -= dt; a.ema += (dt - a.ema) * 0.08;
    if (a.cool > 0) return;
    const eng = this.eng, target = 1 / 58;
    if (a.ema > target * 1.08) { a.slow += dt; a.fast = 0; } else if (a.ema < target * 0.8) { a.fast += dt; a.slow = 0; } else a.slow = a.fast = 0;
    if (a.slow > 0.6) {
      a.slow = 0; a.cool = 1.2;
      if (eng.scale > 0.7) eng.setScale(eng.scale - 0.1);
      else if (eng.qIndex > 0) { eng.setQuality(eng.qIndex - 1); a.cool = 6; el('qSel').value = String(eng.qIndex); }
    } else if (a.fast > 6 && eng.scale < 1) { a.fast = 0; a.cool = 3; eng.setScale(eng.scale + 0.1); }
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
    for (const p of this.world.parks) { g.fillStyle = p.lake ? '#0c3a5a' : '#123324'; g.fillRect(tx(p.x0), tz(p.z0), (p.x1 - p.x0) * S, (p.z1 - p.z0) * S); }
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
    this.setText('clk', this.ui.clock || (this.ui.clock = el('clock')), this.where ? `${this.where.b.name} · ${this.where.k + 1}F · ${this.clock.fmt()}` : `${ZONES[this.zone ?? 0].name} · ${this.clock.fmt()} · ${{ clear: '맑음', rain: '비', storm: '폭풍우' }[this.weatherType || 'rain']}`);
    const p = this.vehicle || pl; const zoom = this.vehicle ? 1.1 : 1.5;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, W); g.fillStyle = '#05080f'; g.fillRect(0, 0, W, W);
    g.save(); g.translate(W / 2, W / 2); g.rotate(this.cam.yaw + Math.PI); g.scale(zoom, zoom); g.translate(-p.x, -p.z);
    // map drawImage: map pixel (tx(x), tz(z)) -> world via S
    g.drawImage(this.mapCanvas, -this.mapSize / S / 2, -this.mapSize / S / 2, this.mapSize / S, this.mapSize / S);
    const dot = (x, z, r, col, ring) => { g.fillStyle = col; g.beginPath(); g.arc(x, z, r / zoom, 0, TAU); g.fill(); if (ring) { g.strokeStyle = '#fff'; g.lineWidth = 1 / zoom; g.stroke(); } };
    for (const h of this.humans) { if (h.dead) continue; if (h.team === 'gang') dot(h.x, h.z, 3.2, '#ff3050'); else if (h.team === 'cop') dot(h.x, h.z, 3.2, Math.floor(this.time * 4) % 2 ? '#ff2040' : '#3060ff'); }
    for (const v of this.vehicles) if (v.police && !v.dead) dot(v.x, v.z, 4, Math.floor(this.time * 4) % 2 ? '#ff2040' : '#3060ff', true);
    if (this.gpsPath) { g.strokeStyle = '#4de3ff'; g.lineWidth = 3 / zoom; g.beginPath(); this.gpsPath.forEach((q, i) => (i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.stroke(); }
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
Object.assign(Game.prototype, actions);
Object.assign(Game.prototype, garage);
