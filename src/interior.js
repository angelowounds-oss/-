import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLSL_NOISE, timeUniform } from './shaders.js';
import { accentColor } from './world.js';
import { rand, clamp, lerp, damp, TAU, mulberry32 } from './util.js';

// ====================================================================
// Enterable building interiors: generated cells (lobby / office / apartment / penthouse)
// joined by working elevators. Cells live far from the city so they never collide with it.
// ====================================================================
const W = 44, D = 30, H = 3.6, HW = W / 2, HD = D / 2;
const OX0 = 6000;

// ---- shared resources ----
let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  const tile = (a, b, seam, size = 256) => {
    const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
    g.fillStyle = a; g.fillRect(0, 0, size, size);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${b},${Math.random() * 0.12})`; g.fillRect(Math.random() * size, Math.random() * size, 2, 2); }
    g.strokeStyle = seam; g.lineWidth = 3; g.strokeRect(0, 0, size, size);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  };
  const marble = tile('#8a90a4', '60,65,80', 'rgba(30,34,48,.9)');
  const carpet = tile('#2b3048', '255,255,255', 'rgba(0,0,0,0)');
  const wood = tile('#5b3f2e', '20,10,5', 'rgba(20,10,6,.7)');
  const mats = {
    marble: new THREE.MeshStandardMaterial({ map: marble, roughness: 0.14, metalness: 0.1, envMapIntensity: 0.9 }),
    carpet: new THREE.MeshStandardMaterial({ map: carpet, roughness: 0.95, metalness: 0 }),
    wood: new THREE.MeshStandardMaterial({ map: wood, roughness: 0.4, metalness: 0.05, envMapIntensity: 1.4 }),
    decor: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.12, envMapIntensity: 1.2 }),
    emit: new THREE.MeshBasicMaterial({ vertexColors: true }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x9fb8d0, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.14, depthWrite: false, envMapIntensity: 2, side: THREE.DoubleSide }),
    steel: new THREE.MeshStandardMaterial({ color: 0xaab0bc, roughness: 0.28, metalness: 0.95, envMapIntensity: 1.8 }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0x1b1d28, roughness: 0.9 }),
  };
  for (const k of ['marble', 'carpet', 'wood']) mats[k].map.repeat.set(1, 1);
  const backdrop = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, fog: false,
    uniforms: { uTime: timeUniform, uCam: { value: new THREE.Vector3() }, uAlt: { value: 0.5 } },
    vertexShader: 'varying vec2 vUv;varying vec3 vW;void main(){vUv=uv;vW=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vW,1.);}',
    fragmentShader: `${GLSL_NOISE}uniform float uTime,uAlt;uniform vec3 uCam;varying vec2 vUv;varying vec3 vW;
      void main(){
        vec2 uv=vUv;float px=(vW.x*.0+ (uCam.x+uCam.z)*.012);
        vec3 col=mix(vec3(.30,.08,.34),vec3(.015,.02,.07),smoothstep(.0,.75,uv.y+uAlt*.18));
        col+=vec3(.5,.18,.55)*exp(-pow((uv.y-.12)*6.,2.))*.5;
        for(int L=0;L<4;L++){
          float fl=float(L);float sc=10.+fl*9.;float par=px*(.5+fl*.9);
          float x=(uv.x*sc+par);float id=floor(x);float f=fract(x);
          float hh=.18+.5*h21(vec2(id,fl*7.3))*(1.-fl*.12)+uAlt*.12*(3.-fl);
          float roof=hh-(.0);
          if(uv.y<hh){
            vec3 b=vec3(.02,.025,.045)*(1.+fl*.7);
            vec2 wc=vec2(f*6.,uv.y*(60.+fl*20.));vec2 wi=floor(wc);vec2 wf=fract(wc);
            float lit=step(.62-fl*.04,h21(wi+id*13.1+fl*5.));float win=step(.2,wf.x)*step(wf.x,.8)*step(.25,wf.y)*step(wf.y,.8);
            vec3 wcol=mix(vec3(1.,.75,.4),mix(vec3(.3,.8,1.),vec3(1.,.2,.8),h21(wi+id)),step(.55,h21(wi*3.+id)));
            b+=wcol*lit*win*(1.4-fl*.25)*smoothstep(.0,.04,hh-uv.y);
            if(h21(vec2(id,fl+30.))>.8&&uv.y>hh-.012)b+=vec3(1.,.15,.3)*2.;
            col=mix(col,b,1.);
          }
        }
        // rain on glass
        float rs=vnoise(vec2(uv.x*140.,uv.y*6.-uTime*(1.4+h21(vec2(floor(uv.x*140.),1.))*1.2)));
        col+=vec3(.35,.45,.7)*smoothstep(.82,1.,rs)*.25*step(.5,h21(vec2(floor(uv.x*140.),3.)));
        // bokeh
        vec2 q=uv*vec2(22.,8.);vec2 id2=floor(q);float r=h21(id2);float d=length(fract(q)-.5-(h22(id2)-.5)*.5);
        col+=mix(vec3(1.,.4,.8),vec3(.3,.8,1.),r)*smoothstep(.16,.04,d)*step(.8,r)*.35;
        gl_FragColor=vec4(col,1.);
      }`,
  });
  SHARED = { mats, backdrop };
  return SHARED;
}

// ---- geometry builder with per-material merging ----
class Builder {
  constructor() { this.parts = { decor: [], emit: [], glass: [], steel: [] }; }
  _push(key, g, col, emitMul = 1) {
    const n = g.attributes.position.count, a = new Float32Array(n * 3);
    const c = new THREE.Color(col);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r * emitMul; a[i * 3 + 1] = c.g * emitMul; a[i * 3 + 2] = c.b * emitMul; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    this.parts[key].push(g.index ? g.toNonIndexed() : g);
  }
  box(key, x, y, z, w, h, d, col, ry = 0, em = 1) {
    const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0);
    if (ry) g.rotateY(ry); g.translate(x, y, z); this._push(key, g, col, em);
  }
  cyl(key, x, y, z, r, h, col, seg = 14, em = 1) { const g = new THREE.CylinderGeometry(r, r, h, seg); g.translate(x, y + h / 2, z); this._push(key, g, col, em); }
  ico(key, x, y, z, r, col, sy = 1) { const g = new THREE.IcosahedronGeometry(r, 1); g.scale(1, sy, 1); g.translate(x, y, z); this._push(key, g, col); }
  finish(parent, mats, shadow = true) {
    for (const [k, arr] of Object.entries(this.parts)) {
      if (!arr.length) continue;
      const geo = mergeGeometries(arr, false); if (!geo) continue;
      const mat = k === 'decor' ? mats.decor : k === 'emit' ? mats.emit : k === 'glass' ? mats.glass : mats.steel;
      const m = new THREE.Mesh(geo, k === 'steel' ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.9, envMapIntensity: 1.8 }) : mat);
      m.castShadow = false; m.receiveShadow = false; m.frustumCulled = false;
      if (k === 'glass') m.renderOrder = 3;
      parent.add(m);
    }
  }
}

const hex = (r, g, b) => new THREE.Color(r, g, b);

// ====================================================================
export class Interiors {
  constructor(G) {
    this.G = G; this.root = new THREE.Group(); G.scene.add(this.root);
    this.cells = new Map(); this.current = null; this.cell = null; this.riding = null;
    this.floorLights = Array.from({ length: 4 }, () => { const l = new THREE.PointLight(0xffe2b0, 0, 14, 1.7); G.scene.add(l); return l; });
    this.lightT = 0; this.fade = 0; this.busy = false; this.hacked = new Set();
    this.hackState = null;
  }
  get inside() { return !!this.cell; }
  // ---- building / floor model ----
  floorList(b) {
    if (b.floorList) return b.floorList;
    const n = b.floors, list = [{ f: 1, type: 'lobby' }];
    const picks = [];
    const want = Math.min(8, n - 2);
    for (let i = 1; i <= want; i++) picks.push(Math.round(1 + ((n - 2) * i) / (want + 0.001)) + 1);
    [...new Set(picks)].filter((f) => f > 1 && f < n).forEach((f, i) => list.push({ f, type: b.kind === 'office' ? (i % 3 === 2 ? 'apartment' : 'office') : (i % 3 === 2 ? 'office' : 'apartment') }));
    list.push({ f: n, type: 'penthouse' });
    b.floorList = list; return list;
  }
  cellFor(b, idx) {
    const key = b.id + ':' + idx;
    let c = this.cells.get(key);
    if (!c) { c = this.buildCell(b, idx); this.cells.set(key, c); }
    return c;
  }

  // ---- transitions ----
  async enter(b) {
    if (this.busy) return; this.busy = true;
    const G = this.G;
    await G.fadeTo(1);
    this.applyIndoor(true);
    this.b = b; this.show(this.cellFor(b, 0));
    const c = this.cell, pl = G.player;
    pl.x = c.spawn.x; pl.z = c.spawn.z; pl.vx = pl.vz = 0; pl.ry = Math.PI; G.cam.yaw = Math.PI; G.cam.pitch = -0.1;
    G.audio.door?.(); G.audio.setIndoor?.(true);
    G.onEnterBuilding?.(b);
    await G.fadeTo(0); this.busy = false;
  }
  async exit() {
    if (this.busy || !this.cell) return; this.busy = true;
    const G = this.G, b = this.b;
    await G.fadeTo(1);
    this.show(null); this.applyIndoor(false);
    const pl = G.player;
    pl.x = b.x + b.nx * 1.4; pl.z = b.z + b.nz * 1.4; pl.vx = pl.vz = 0; pl.ry = Math.atan2(b.nx, b.nz); G.cam.yaw = pl.ry;
    G.audio.door?.(); G.audio.setIndoor?.(false);
    G.onExitBuilding?.(b);
    this.b = null;
    await G.fadeTo(0); this.busy = false;
  }
  applyIndoor(on) {
    const G = this.G, e = G.eng;
    for (const o of G.world.objects) o.visible = !on;
    G.rain.visible = !on;
    e.scene.fog.density = on ? 0.0025 : 0.0105; e.scene.environmentIntensity = on ? 0.32 : 0.45;
    e.hemi.intensity = on ? 0.42 : 0.22; e.moon.intensity = on ? 0 : 0.85;
    G.indoor = on;
  }
  show(cell) {
    if (this.cell) this.cell.group.visible = false;
    this.cell = cell;
    if (cell) { cell.group.visible = true; }
  }

  // ---- elevator ----
  async ride(toIdx) {
    const G = this.G, c = this.cell, b = this.b;
    if (!c || this.riding || this.busy) return;
    const list = this.floorList(b);
    if (toIdx === c.idx) { G.toast('이미 이 층입니다'); return; }
    const cab = c.cab;
    this.riding = { to: toIdx, t: 0 };
    c.elevOpen = false; // close doors
    const from = list[c.idx].f, to = list[toIdx].f;
    const dur = clamp(1.6 + Math.abs(to - from) * 0.06, 2, 5);
    G.audio.elevator?.(dur);
    // wait for doors to shut
    await new Promise((r) => setTimeout(r, 750));
    const start = performance.now();
    this.display = from;
    await new Promise((res) => {
      const tick = () => {
        const k = Math.min(1, (performance.now() - start) / (dur * 1000));
        this.display = Math.round(lerp(from, to, k));
        G.shake(0.04);
        G.setElevDisplay?.(this.display, to > from ? '▲' : '▼');
        if (k >= 1) res(); else setTimeout(tick, 60);
      };
      tick();
    });
    const nc = this.cellFor(b, toIdx);
    this.show(nc);
    const pl = G.player; pl.x = nc.cab.x; pl.z = nc.cab.z; pl.vx = pl.vz = 0; pl.ry = 0;
    G.cam.yaw = 0; G.audio.ding?.();
    nc.elevOpen = true; nc.forceClosed = false;
    this.riding = null;
    G.setElevDisplay?.(to, '');
    G.onFloor?.(b, toIdx, nc);
  }

  // ---- per-frame ----
  update(dt) {
    const G = this.G;
    // backdrop parallax camera
    const sh = shared(); sh.backdrop.uniforms.uCam.value.copy(G.camera.position);
    if (!this.cell) return;
    const c = this.cell, pl = G.player;
    // sliding elevator doors
    for (const d of c.doors) {
      const near = Math.hypot(pl.x - d.x, pl.z - (d.z + 1.6)) < 3.8 || Math.hypot(pl.x - d.x, pl.z - (d.z - 1.5)) < 1.9;
      const want = c.elevOpen !== false && !this.riding && (near || d.keepOpen) ? 1 : 0;
      d.open = damp(d.open, want, 7, dt);
      d.L.position.x = d.x - 0.45 - d.open * 0.95; d.R.position.x = d.x + 0.45 + d.open * 0.95;
      const h = d.open > 0.55 ? -1 : 3.6;
      d.bL.h = h; d.bR.h = h;
    }
    // nearest 4 fixtures light the room
    this.lightT -= dt;
    if (this.lightT <= 0) {
      this.lightT = 0.2;
      const f = c.fixtures, src = f.map((p) => [Math.hypot(p[0] - pl.x, p[1] - pl.z), p]).sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < 4; i++) {
        const l = this.floorLights[i], s = src[i];
        if (!s) { l.intensity = 0; continue; }
        l.position.set(s[1][0], H - 0.5, s[1][1]); l.color.setRGB(...(s[1][2] || [1, 0.88, 0.7])); l.intensity = 15 * (s[1][3] || 1); l.distance = 15;
      }
    }
    // animated props
    for (const a of c.anim) a(dt, G.time);
    // hack progress
    const hs = this.hackState;
    if (hs) {
      const d = Math.hypot(pl.x - hs.t.x, pl.z - hs.t.z);
      if (d > 2.4 || G.player.dead) { this.hackState = null; G.setProgress?.(null); G.toast('해킹 중단'); }
      else { hs.p += dt / hs.dur; G.setProgress?.(hs.p, '해킹 중…'); if (hs.p >= 1) { this.hackState = null; G.setProgress?.(null); hs.t.done = true; this.hacked.add(hs.t.id); hs.onDone(); } }
    }
  }
  // list of interactables around the player (current cell only)
  interactables() { return this.cell ? this.cell.interact : []; }
  hack(t) {
    if (t.done || this.hackState) return;
    this.hackState = { t, p: 0, dur: t.dur || 4, onDone: t.onDone };
    this.G.audio.tone?.(900, 0.1, 'square', 0.08);
    this.G.onHackStart?.(t, this.cell);
  }
  forceOut() { this.show(null); this.applyIndoor(false); this.G.audio.setIndoor?.(false); this.riding = null; this.busy = false; this.hackState = null; this.G.setProgress?.(null); this.G.uiModal = false; document.getElementById('elev')?.classList.remove('on'); this.G.fadeTo(0); this.b = null; }

  // ====================================================================
  // Cell construction
  // ====================================================================
  buildCell(b, idx) {
    const G = this.G, { mats, backdrop } = shared();
    const list = this.floorList(b), info = list[idx];
    const ox = OX0 + b.id * 100, oz = idx * 70;
    const rnd = mulberry32(b.id * 977 + idx * 131 + 7);
    const R = (a, c) => a + (c - a) * rnd();
    const accent = b.accent, acc = new THREE.Color(...accent);
    const group = new THREE.Group(); group.position.set(0, 0, 0); this.root.add(group);
    const cell = { b, idx, type: info.type, floor: info.f, ox, oz, group, boxes: [], doors: [], fixtures: [], interact: [], anim: [], npcs: [], cab: null, spawn: null, elevOpen: true };
    const B = new Builder();
    const colliders = G.world.colliders;
    const col = (x0, z0, x1, z1, h = H) => { const bx = colliders.addBox(ox + x0, oz + z0, ox + x1, oz + z1, h, 'int'); cell.boxes.push(bx); return bx; };
    // box + collider helper (local coordinates; y is base)
    const solid = (key, x, y, z, w, h, d, color, em = 1) => { B.box(key, ox + x, y, oz + z, w, h, d, color, 0, em); col(x - w / 2, z - d / 2, x + w / 2, z + d / 2, y + h); };
    const deco = (key, x, y, z, w, h, d, color, ry = 0, em = 1) => B.box(key, ox + x, y, oz + z, w, h, d, color, ry, em);
    const light = (x, z, c = [1, 0.88, 0.7], k = 1) => cell.fixtures.push([ox + x, oz + z, c, k]);
    const wallCol = info.type === 'apartment' ? 0x6a5f6e : info.type === 'penthouse' ? 0x16131f : info.type === 'lobby' ? 0xb7bac6 : 0x8d93a6;

    // ---- floor & ceiling ----
    const floorMat = info.type === 'lobby' ? mats.marble : info.type === 'penthouse' ? mats.wood : mats.carpet;
    const fm = floorMat.clone(); fm.map = floorMat.map.clone(); fm.map.needsUpdate = true; fm.map.repeat.set(W / 4, D / 4);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), fm); floor.rotation.x = -Math.PI / 2; floor.position.set(ox, 0.02, oz); floor.receiveShadow = false; group.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mats.ceiling); ceil.rotation.x = Math.PI / 2; ceil.position.set(ox, H, oz); group.add(ceil);
    // ceiling light strips
    const stripCol = info.type === 'penthouse' ? acc.clone().multiplyScalar(1.8) : new THREE.Color(1, 0.86, 0.66).multiplyScalar(1.25);
    for (let x = -18; x <= 18; x += 9) { deco('emit', x, H - 0.06, -2, 0.35, 0.05, 20, stripCol); }
    for (let x = -18; x <= 18; x += 9) for (const z of [-8, 2, 10]) light(x, z, info.type === 'penthouse' ? accent : [1, 0.86, 0.7], info.type === 'penthouse' ? 0.8 : 1);

    // ---- outer walls ----
    const T = 0.5;
    const wall = (x0, z0, x1, z1, color = wallCol, h = H) => { B.box('decor', ox + (x0 + x1) / 2, 0, oz + (z0 + z1) / 2, x1 - x0, h, z1 - z0, color); col(x0, z0, x1, z1, h); };
    // north (elevator bank): segments with two openings
    const cabX = [-3.2, 3.2];
    wall(-HW - T, -HD - T, -4.1, -HD); wall(-2.3, -HD - T, 2.3, -HD); wall(4.1, -HD - T, HW + T, -HD);
    for (const cx of cabX) deco('decor', cx, 2.75, -HD - T / 2, 1.9, 0.85, T, wallCol);
    wall(-HW - T, -HD, -HW, HD); wall(HW, -HD, HW + T, HD);
    // window helper (south / long walls): parapet + glass + mullions + backdrop
    const windowWall = (side) => {
      // side: 's' (z=+HD) | 'w' | 'e'
      if (side === 's') {
        B.box('decor', ox, 0, oz + HD + T / 2, W + T * 2, 0.9, T, wallCol); col(-HW - T, HD, HW + T, HD + T, H);
        B.box('decor', ox, 3.0, oz + HD + T / 2, W + T * 2, 0.6, T, wallCol);
        for (let x = -HW; x <= HW + 0.01; x += 4.4) B.box('steel', ox + x, 0.9, oz + HD, 0.14, 2.1, 0.3, 0x404552);
        B.box('glass', ox, 0.9, oz + HD, W, 2.1, 0.04, 0x9fb8d0);
        const bd = new THREE.Mesh(new THREE.PlaneGeometry(120, 36), backdrop); bd.position.set(ox, 8, oz + HD + 22); bd.rotation.y = Math.PI; group.add(bd);
        bd.onBeforeRender = () => { backdrop.uniforms.uAlt.value = clamp(info.f / (b.floors || 20), 0.1, 1); };
      }
    };
    if (info.type === 'lobby') {
      // south wall with a doorway centered at x=0 (exit)
      B.box('decor', ox - 12.3, 0, oz + HD + T / 2, 19.4 + 0.0, H, T, wallCol); col(-HW - T, HD, -2.6, HD + T, H);
      B.box('decor', ox + 12.3, 0, oz + HD + T / 2, 19.4, H, T, wallCol); col(2.6, HD, HW + T, HD + T, H);
      // glass walls either side + door frame
      B.box('glass', ox - 6.2, 0.1, oz + HD, 7.6, 3.2, 0.04, 0x9fb8d0); B.box('glass', ox + 6.2, 0.1, oz + HD, 7.6, 3.2, 0.04, 0x9fb8d0);
      B.box('decor', ox, 2.8, oz + HD + T / 2, 5.2, 0.8, T, wallCol);
      deco('emit', 0, 2.7, HD - 0.02, 5.2, 0.07, 0.07, acc.clone().multiplyScalar(2.5));
      const bd = new THREE.Mesh(new THREE.PlaneGeometry(120, 36), backdrop); bd.position.set(ox, 8, oz + HD + 22); bd.rotation.y = Math.PI; group.add(bd);
    } else windowWall('s');
    if (info.type !== 'lobby') {
      // east/west glass for brighter, airier floors
    }

    // ---- elevator bank ----
    const cabZ = -HD - 1.6; // cab center z (local)
    cabX.forEach((cx, k) => {
      // cab interior
      B.box('steel', ox + cx, 0.02, oz - HD - 3.1, 2.8, 2.9, 0.12, 0x707684);                   // back
      B.box('steel', ox + cx - 1.4, 0.02, oz + cabZ, 0.12, 2.9, 3.0, 0x707684);                  // left
      B.box('steel', ox + cx + 1.4, 0.02, oz + cabZ, 0.12, 2.9, 3.0, 0x707684);                  // right
      B.box('decor', ox + cx, 0.02, oz + cabZ, 2.6, 0.04, 2.9, 0x2a2d3a);                         // floor mat
      B.box('emit', ox + cx, 2.82, oz + cabZ, 2.0, 0.05, 2.0, new THREE.Color(1, 0.95, 0.85).multiplyScalar(2.6)); // ceiling light
      B.box('decor', ox + cx, 2.88, oz + cabZ, 2.8, 0.1, 3.0, 0x15171f);
      B.box('emit', ox + cx + 1.32, 1.0, oz + cabZ - 0.2, 0.05, 0.9, 0.38, new THREE.Color(0.2, 0.9, 1).multiplyScalar(1.6)); // panel glow
      B.box('steel', ox + cx - 1.32, 0.9, oz + cabZ, 0.06, 0.06, 2.4, 0xb8bec8);              // handrail
      col(cx - 1.46, -HD - 3.3, cx - 1.34, -HD, 2.9); col(cx + 1.34, -HD - 3.3, cx + 1.46, -HD, 2.9); col(cx - 1.4, -HD - 3.3, cx + 1.4, -HD - 3.1, 2.9);
      // doors (animated panels in wall pocket)
      const mk = (x) => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.7, 0.1), mats.steel); m.position.set(ox + x, 1.35, oz - HD - 0.15); m.castShadow = false; group.add(m); return m; };
      const L = mk(cx - 0.45), Rr = mk(cx + 0.45);
      const bL = col(cx - 0.9, -HD - 0.2, cx, -HD - 0.1, 3.6), bR = col(cx, -HD - 0.2, cx + 0.9, -HD - 0.1, 3.6);
      L.userData.cx = cx;
      cell.doors.push({ x: ox + cx, z: oz - HD, L, R: Rr, bL, bR, open: 0 });
      // call panel + indicator
      B.box('emit', ox + cx + 1.55, 1.1, oz - HD + 0.05, 0.12, 0.22, 0.03, new THREE.Color(1, 0.7, 0.2).multiplyScalar(2));
      B.box('emit', ox + cx, 2.95, oz - HD + 0.05, 0.9, 0.2, 0.03, new THREE.Color(0.2, 1, 0.5).multiplyScalar(2));
      light(cx, -HD + 2.4, [1, 0.95, 0.85], 0.9);
    });
    cell.cab = { x: ox + cabX[0], z: oz + cabZ };
    cell.cabs = cabX.map((cx) => ({ x: ox + cx, z: oz + cabZ }));
    // floor buttons panel interaction (inside either cab)
    cabX.forEach((cx) => cell.interact.push({ x: ox + cx + 0.9, z: oz + cabZ, r: 1.7, label: '층 선택', icon: '엘리베이터', use: () => G.openElevatorUI(), id: 'cab' }));
    cell.cabX = cabX;
    cell.elevHint = { x: ox, z: oz - HD + 3, r: 8 };

    // ---- type-specific content ----
    const npcs = [];
    const npc = (team, x, z, o = {}) => cell.npcs.push({ team, x: ox + x, z: oz + z, ...o });
    const plant = (x, z) => { B.cyl('decor', ox + x, 0, oz + z, 0.42, 0.55, 0x2a2430); B.ico('decor', ox + x, 1.3, oz + z, 0.7, 0x1f6b44, 1.3); B.ico('decor', ox + x + 0.2, 1.8, oz + z, 0.5, 0x2a8a56, 1.2); col(x - 0.45, z - 0.45, x + 0.45, z + 0.45, 1.5); };
    const sofa = (x, z, ry = 0, color = 0x40324f, w = 2.6) => { B.box('decor', ox + x, 0, oz + z, w, 0.5, 0.95, color, ry); B.box('decor', ox + x - (Math.sin(ry) * -0.4), 0.5, oz + z + (Math.cos(ry) * -0.4), w, 0.55, 0.28, color, ry); const e = Math.abs(Math.cos(ry)) > 0.7; col(x - (e ? w / 2 : 0.5), z - (e ? 0.5 : w / 2), x + (e ? w / 2 : 0.5), z + (e ? 0.5 : w / 2), 0.8); };
    const desk = (x, z, ry = 0, monitor = true) => {
      const e = Math.abs(Math.cos(ry)) > 0.7;
      B.box('decor', ox + x, 0.72, oz + z, 1.6, 0.06, 0.8, 0x7a6b5a, ry); B.box('decor', ox + x, 0, oz + z, 1.5, 0.72, 0.06, 0x3a3f4d, ry);
      B.box('decor', ox + x - 0.7, 0, oz + z, 0.05, 0.72, 0.7, 0x3a3f4d, ry); B.box('decor', ox + x + 0.7, 0, oz + z, 0.05, 0.72, 0.7, 0x3a3f4d, ry);
      if (monitor) B.box('emit', ox + x, 0.8, oz + z - 0.05, 0.62, 0.38, 0.04, new THREE.Color(0.25, 0.6, 1).multiplyScalar(R(1.1, 2.2)), ry);
      B.box('decor', ox + x, 0, oz + z + 0.75, 0.5, 0.45, 0.5, 0x22252f, ry); B.box('decor', ox + x, 0.45, oz + z + 0.95, 0.5, 0.55, 0.08, 0x22252f, ry);
      col(x - (e ? 0.8 : 0.4), z - (e ? 0.4 : 0.8), x + (e ? 0.8 : 0.4), z + (e ? 0.4 : 0.8), 0.9);
    };
    const sign = (text, x, y, z, ry, w = 6, c = accent) => {
      const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 256; const g = cv.getContext('2d');
      const css = `rgb(${c.map((v) => Math.round(Math.min(1, v) * 255)).join(',')})`;
      g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, 1024, 256); g.font = '900 150px "Pretendard","Noto Sans KR",Arial,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = css; g.shadowBlur = 40; g.fillStyle = '#fff'; g.fillText(text, 512, 134); g.shadowBlur = 0; g.globalAlpha = 0.6; g.fillStyle = css; g.fillText(text, 512, 134);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false }));
      m.position.set(ox + x, y, oz + z); m.rotation.y = ry; group.add(m); return m;
    };

    if (info.type === 'lobby') {
      cell.label = b.name + ' · LOBBY';
      cell.spawn = { x: ox, z: oz + HD - 3 };
      // reception desk (L)
      solid('decor', -12, 0, 2, 7, 1.15, 1.3, 0x1b1d28); deco('emit', -12, 1.15, 1.3, 7, 0.05, 0.05, acc.clone().multiplyScalar(2.6)); deco('decor', -12, 1.15, 2, 7.2, 0.08, 1.5, 0x2c3040);
      solid('decor', -15.6, 0, 5.5, 1.3, 1.15, 6.2, 0x1b1d28); deco('emit', -14.95, 1.15, 5.5, 0.05, 0.05, 6.2, acc.clone().multiplyScalar(2.6));
      // logo wall west
      B.box('decor', ox - HW + 0.3, 0, oz + 0.0, 0.5, H, 12, 0x15161f); sign(b.name, -HW + 0.58, 2.1, 0, Math.PI / 2, 9);
      // pillars with LED
      for (const [px, pz] of [[-9, -6], [9, -6], [-9, 7], [9, 7]]) { solid('decor', px, 0, pz, 1.0, H, 1.0, 0x2a2d3a); deco('emit', px, 0, pz + 0.52, 0.12, H, 0.04, acc.clone().multiplyScalar(2)); deco('emit', px, 0, pz - 0.52, 0.12, H, 0.04, acc.clone().multiplyScalar(2)); }
      // inlaid neon ring in the floor
      for (let a = 0; a < 48; a++) { const t = (a / 48) * TAU; deco('emit', Math.cos(t) * 5, 0.025, Math.sin(t) * 5, 0.6, 0.01, 0.12, acc.clone().multiplyScalar(2), -t); }
      sofa(11, 5, Math.PI / 2, 0x3a2f55, 3.2); sofa(11, -2, Math.PI / 2, 0x3a2f55, 3.2); solid('decor', 13.4, 0, 1.5, 1.2, 0.4, 2.0, 0x1c1c25);
      sofa(-6, 10.5, Math.PI, 0x22304a, 3.0);
      plant(-19.5, -12); plant(19.5, -12); plant(-19.5, 12.5); plant(19.5, 12.5); plant(-3.5, -12.8); plant(3.5, -12.8);
      // directory board
      B.box('emit', ox + 8, 1.4, oz - HD + 0.06, 3.2, 1.2, 0.04, new THREE.Color(0.15, 0.4, 0.8).multiplyScalar(1.3));
      light(-12, 2, accent, 0.9); light(12, 3, accent, 0.9);
      // people: receptionist + two guards
      npc('civ', -13.5, 3.6, { look: { top: 0x233248, trim: accent }, role: 'reception', ry: Math.PI });
      npc('guard', 6, -9, { weapon: 1, ry: 0 }); npc('guard', -6, 9, { weapon: 1, ry: Math.PI });
      cell.interact.push({ x: ox - 12, z: oz + 4.4, r: 2.2, label: '접수원과 대화', use: () => G.talkReceptionist(b), id: 'reception' });
      cell.interact.push({ x: ox, z: oz + HD - 1.2, r: 2.8, label: '건물 밖으로 나가기', use: () => this.exit(), id: 'exit' });
      B.box('emit', ox, 0.03, oz + HD - 0.6, 5, 0.01, 0.4, new THREE.Color(1, 0.8, 0.5).multiplyScalar(1.2));
    } else if (info.type === 'office') {
      cell.label = `${b.name} · ${info.f}F OFFICE`;
      cell.spawn = { x: ox, z: oz - 8 };
      // open plan desks (two blocks)
      for (let cx = -17; cx <= -3; cx += 4.2) for (const cz of [-2, 4]) { desk(cx, cz, 0); desk(cx + 1.7, cz + 1.8 * (cz > 0 ? 0 : 0), 0, true); }
      for (let cx = 8; cx <= 17; cx += 4.2) for (const cz of [0, 6]) desk(cx, cz, Math.PI);
      // meeting room (glass) NE
      B.box('glass', ox + 14, 0, oz - 11, 10, 3.0, 0.04, 0x9fb8d0); B.box('glass', ox + 9, 0, oz - 7.5, 0.04, 3.0, 7, 0x9fb8d0); col(8.9, -14.9, 9.1, -10.2, 3.2); col(9, -9, 9.1, -4.2, 3.2);
      solid('decor', 14.5, 0, -7.2, 4.2, 0.75, 1.6, 0x4a3d33); for (let i = -1; i <= 1; i++) { B.box('decor', ox + 14.5 + i * 1.3, 0, oz - 5.8, 0.5, 0.5, 0.5, 0x22252f); B.box('decor', ox + 14.5 + i * 1.3, 0, oz - 8.6, 0.5, 0.5, 0.5, 0x22252f); }
      B.box('emit', ox + HW - 0.3, 1.0, oz - 7, 0.05, 1.5, 4.2, new THREE.Color(0.9, 0.3, 0.6).multiplyScalar(1.4));
      // server room west (walled, doorway toward east)
      const sx0 = -22, sx1 = -12, sz0 = -13, sz1 = -2;
      B.box('decor', ox + (sx0 + sx1 - 3) / 2, 0, oz + sz1, sx1 - 3 - sx0, H, 0.4, 0x23252f); B.box('decor', ox + (sx1 - 1.2 + sx1) / 2, 0, oz + sz1, 1.2, H, 0.4, 0x23252f); col(sx0, sz1 - 0.2, sx1 - 3, sz1 + 0.2, H); col(sx1 - 1.2, sz1 - 0.2, sx1, sz1 + 0.2, H);
      B.box('decor', ox + sx1, 0, oz + (sz0 + sz1) / 2, 0.4, H, sz1 - sz0, 0x23252f); col(sx1 - 0.2, sz0, sx1 + 0.2, sz1, H);
      for (let i = 0; i < 4; i++) {
        const rx = -20.5 + i * 2.2; solid('decor', rx, 0, -11.5, 1.1, 2.4, 1.0, 0x14161d);
        for (let y = 0; y < 14; y++) for (let k = 0; k < 4; k++) { const cc = rnd() < 0.2 ? [1, 0.2, 0.2] : rnd() < 0.5 ? [0.2, 1, 0.5] : [0.2, 0.6, 1]; deco('emit', rx - 0.35 + k * 0.23, 0.15 + y * 0.16, -11.0, 0.08, 0.05, 0.02, new THREE.Color(...cc).multiplyScalar(2.5)); }
      }
      light(-17, -8, [0.4, 0.7, 1], 0.9);
      // hackable terminal
      solid('decor', -14, 0, -9.5, 1.2, 1.0, 0.8, 0x1a1c25); deco('emit', -14, 1.0, -9.95, 1.0, 0.7, 0.04, new THREE.Color(0.1, 1, 0.6).multiplyScalar(2));
      const term = { x: ox - 14, z: oz - 8.7, id: b.id + ':' + idx + ':srv', kind: 'server', dur: 4.5, done: this.hacked.has(b.id + ':' + idx + ':srv'), onDone: () => G.onServerHacked(b, idx, cell) };
      cell.terminal = term;
      cell.interact.push({ x: term.x, z: term.z, r: 1.9, label: '서버 해킹', enabled: () => !term.done, use: () => this.hack(term), id: 'term' });
      // coffee / plants / cabinets
      plant(-19.5, 12.5); plant(19.5, 12.5); plant(5.5, -12.8);
      solid('decor', 19.4, 0, 0, 1.2, 1.9, 2.4, 0x2a2d3a); deco('emit', 18.78, 1.2, 0, 0.03, 0.5, 0.9, new THREE.Color(1, 0.7, 0.3).multiplyScalar(1.6));
      // workers & guards
      for (let i = 0; i < 4; i++) npc('civ', R(-16, -4), R(-1, 6), { look: { top: rnd() * 0xffffff, trim: null }, ry: Math.PI });
      npc('civ', 15, 1, { ry: 0 });
      if (rnd() < 0.8) { npc('guard', -8, -10, { weapon: 1, ry: 0 }); npc('guard', 0, 8, { weapon: 1, ry: Math.PI }); }
      // loot
      cell.loot = [[19, 12], [-20, 6]];
    } else if (info.type === 'apartment') {
      cell.label = `${b.name} · ${info.f}F RESIDENCE`;
      cell.spawn = { x: ox, z: oz - 8 };
      // corridor carpet runner + wall sconces
      deco('decor', 0, 0.025, -9.5, 40, 0.01, 3.2, 0x3a1f2f);
      for (let x = -18; x <= 18; x += 6) { deco('emit', x, 1.9, -12.9, 0.4, 0.5, 0.08, acc.clone().multiplyScalar(1.8)); }
      for (let x = -16; x <= 16; x += 8) light(x, -9.5, [1, 0.8, 0.6], 1.1);
      // apartment dividing wall with doorways at each unit
      const unitX = [-14.7, 0, 14.7];
      const wz = -6;
      let prev = -HW;
      unitX.forEach((cx, i) => {
        const w0 = cx - 1.0, w1 = cx + 1.0;
        wall(prev, wz, w0, wz + 0.3, 0x5b4f62); deco('emit', w0 + 0.05, 2.45, wz - 0.08, 2.0, 0.05, 0.05, acc.clone().multiplyScalar(2.4)); prev = w1;
        // unit walls
        if (i < 2) wall(cx + 7.3, wz, cx + 7.6, HD, 0x5b4f62);
        // furniture
        solid('decor', cx - 4.0, 0, 12.6, 2.2, 0.5, 2.0, 0xd8d0d8); deco('decor', cx - 4.0, 0.5, 13.7, 2.2, 0.2, 0.4, 0xc8c0c8); // bed
        deco('emit', cx - 4.0, 1.8, 14.7, 2.4, 0.9, 0.04, new THREE.Color(...accent).multiplyScalar(0.8)); // neon headboard
        sofa(cx + 2.2, 2.5, 0, 0x2f3b5a, 2.8); solid('decor', cx + 2.2, 0, -1.8, 2.4, 0.5, 0.5, 0x1b1d26);
        deco('emit', cx + 2.2, 1.0, -2.3, 1.5, 0.9, 0.05, new THREE.Color(0.3, 0.5, 1).multiplyScalar(R(1.2, 2.0)));// TV
        solid('decor', cx + 5.6, 0, 6, 1.0, 0.95, 4.2, 0x2a2d3a); deco('decor', cx + 5.6, 0.95, 6, 1.1, 0.06, 4.4, 0xb7b9c4); // kitchen
        plant(cx - 5.4, 0.2);
        light(cx, 4, [1, 0.78, 0.55], 0.9);
        cell.interact.push({ x: ox + cx + 2.2, z: oz + 0.7, r: 1.8, label: 'TV 채널 변경', use: () => { G.toast('📺 ' + ['뉴스: 네온시티 폭우 경보', '드라마 재방송', '사이버 격투기 중계', '광고: NEXUS 신형 임플란트'][Math.floor(Math.random() * 4)]); }, id: 'tv' + i });
        const safeId = b.id + ':' + idx + ':safe' + i;
        solid('decor', cx - 6, 0, 8, 0.8, 0.9, 0.8, 0x23262e); deco('emit', cx - 5.58, 0.6, 8, 0.02, 0.18, 0.18, new THREE.Color(1, 0.3, 0.3).multiplyScalar(2));
        const safe = { x: ox + cx - 6, z: oz + 8, id: safeId, kind: 'safe', dur: 3, done: this.hacked.has(safeId), onDone: () => G.onSafeOpened(cell, safe) };
        cell.interact.push({ x: safe.x + 0.9, z: safe.z, r: 1.7, label: '금고 따기', enabled: () => !safe.done, use: () => this.hack(safe), id: 'safe' + i });
      });
      wall(prev, wz, HW, wz + 0.3, 0x5b4f62);
      B.box('decor', ox, 0, oz - 6 + 0.15, 0.01, 0.01, 0.01, 0x000000);
      plant(-19.5, -12.5); plant(19.5, -12.5);
      for (let i = 0; i < 3; i++) npc('civ', R(-16, 16), R(-12, -8), { look: { top: rnd() * 0xffffff, trim: accent }, ry: R(0, TAU) });
      if (rnd() < 0.5) npc('guard', R(-10, 10), -10, { weapon: 1, ry: 0 });
    } else { // penthouse club
      cell.label = `${b.name} · ${info.f}F SKY LOUNGE`;
      cell.spawn = { x: ox, z: oz - 8 };
      // glowing dance floor grid
      for (let i = -5; i <= 5; i++) for (let j = -4; j <= 4; j++) {
        const c = new THREE.Color().setHSL(((i + j + 20) * 0.07) % 1, 0.9, 0.5).multiplyScalar(1.1);
        deco('emit', i * 1.7 + 4, 0.03, j * 1.7 + 3, 1.55, 0.01, 1.55, c);
      }
      // DJ booth + bar
      solid('decor', 4, 0, -10.5, 6, 1.2, 1.4, 0x14121c); deco('emit', 4, 1.2, -9.8, 6, 0.05, 0.05, acc.clone().multiplyScalar(3));
      deco('emit', 4, 1.3, -10.5, 1.4, 0.04, 0.9, new THREE.Color(0.2, 0.9, 1).multiplyScalar(2.4));
      solid('decor', -14, 0, 4, 1.2, 1.1, 14, 0x15121c); deco('decor', -14, 1.1, 4, 1.5, 0.08, 14.4, 0x2d2a38); deco('emit', -13.35, 0.4, 4, 0.04, 0.05, 14, acc.clone().multiplyScalar(2.6));
      for (let i = 0; i < 18; i++) { const c = new THREE.Color().setHSL(rnd(), 0.8, 0.55).multiplyScalar(2); B.cyl('emit', ox - 14.8 + R(-0.2, 0.2), 1.9 + (i % 3) * 0.45, oz - 2.5 + (i % 6) * 2.1, 0.07, 0.35, c, 8); }
      deco('emit', -20.9, 1.6, 4, 0.05, 2.4, 13, acc.clone().multiplyScalar(1.1));
      for (let i = 0; i < 6; i++) { B.cyl('decor', ox - 11.8, 0, oz - 1.5 + i * 2.3, 0.28, 0.75, 0x23202c); B.cyl('decor', ox - 11.8, 0.75, oz - 1.5 + i * 2.3, 0.3, 0.08, 0x3a3548); }
      sofa(15, 10, Math.PI, 0x4a2a5a, 3.4); sofa(9, 12, Math.PI, 0x2a3a5a, 3.0); solid('decor', 12, 0, 8.4, 2, 0.4, 1.2, 0x1c1c25);
      sofa(19, 0, -Math.PI / 2, 0x4a2a5a, 3.4); sofa(19, -5, -Math.PI / 2, 0x2a3a5a, 3.4);
      plant(-19.5, 12.5); plant(19.5, -12.5);
      sign(b.name.split(' ')[0] + ' SKY', 4, 2.85, -14.9, 0, 8);
      light(4, 3, accent, 1.6); light(-10, 4, accent, 1.2); light(14, 8, [1, 0.3, 0.8], 1.2);
      const safeId = b.id + ':' + idx + ':vault';
      solid('decor', 20.3, 0, -12, 1.2, 1.4, 1.2, 0x23262e); deco('emit', 19.68, 0.9, -12, 0.02, 0.3, 0.3, new THREE.Color(1, 0.8, 0.2).multiplyScalar(2.4));
      const vault = { x: ox + 19, z: oz - 12, id: safeId, kind: 'vault', dur: 5, done: this.hacked.has(safeId), onDone: () => G.onSafeOpened(cell, vault, 2500) };
      cell.interact.push({ x: vault.x, z: vault.z + 1, r: 1.8, label: '금고 해제', enabled: () => !vault.done, use: () => this.hack(vault), id: 'vault' });
      for (let i = 0; i < 7; i++) npc('civ', R(-8, 14), R(-3, 9), { look: { top: new THREE.Color().setHSL(rnd(), 0.7, 0.35).getHex(), trim: [accent, [0.2, 0.9, 1], [1, 0.3, 0.8]][i % 3] }, ry: R(0, TAU), dance: true });
      npc('guard', -8, -9, { weapon: 2, ry: 0 }); npc('guard', 17, -9, { weapon: 2, ry: Math.PI });
      cell.anim.push((dt, t) => { /* dance floor shimmer is baked */ });
    }
    B.finish(group, mats);
    // spawn NPCs
    for (const n of cell.npcs) G.spawnInteriorHuman(n, cell);
    group.visible = false;
    return cell;
  }
}
