import * as THREE from 'three';
import { timeUniform } from './shaders.js';
import { rand, TAU, LIGHT_CAP } from './util.js';

// ---------- Rain ----------
export function createRain(scene, count) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 6);
  const BOX = 46, H = 34;
  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * BOX * 2, y = Math.random() * H, z = (Math.random() - 0.5) * BOX * 2;
    pos.set([x, y, z, x, y, z], i * 6);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const ends = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) { ends[i * 2] = 0; ends[i * 2 + 1] = 1; }
  geo.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTime: timeUniform, uCam: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2(3, 1) }, uStreak: { value: 0.07 }, uAlpha: { value: 0.15 } },
    vertexShader: `attribute float aEnd;uniform float uTime;uniform vec3 uCam;uniform vec2 uWind;uniform float uStreak;varying float vA;
      void main(){
        vec3 p=position;float spd=24.+fract(p.x*7.13)*8.;
        p.y=mod(p.y-uTime*spd,${H}.);
        p.xz+=uWind*(p.y/${H}.)*.0;
        vec3 w=uCam;vec3 q=p;
        q.x=mod(q.x-w.x+${BOX}.,${BOX * 2}.)-${BOX}.+w.x;
        q.z=mod(q.z-w.z+${BOX}.,${BOX * 2}.)-${BOX}.+w.z;
        q.y+=max(w.y-8.,0.)*0.;
        vec3 dir=normalize(vec3(uWind.x*.12,-1.,uWind.y*.12));
        vec3 wp=q+dir*aEnd*-uStreak*spd;
        vec4 mv=viewMatrix*vec4(wp,1.);
        float dist=-mv.z;
        vA=aEnd<.5?.0:1.;vA*=smoothstep(${BOX}.,18.4,dist)*smoothstep(.5,3.,dist);
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader: 'uniform float uAlpha;varying float vA;void main(){gl_FragColor=vec4(vec3(.65,.78,1.)*vA*uAlpha*2.,vA*uAlpha);}',
  });
  const m = new THREE.LineSegments(geo, mat);
  m.frustumCulled = false; m.renderOrder = 6;
  scene.add(m);
  return m;
}

// ---------- Particle pool ----------
export class Particles {
  constructor(scene, max, additive) {
    this.max = max;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max); this.size = new Float32Array(max); this.grav = new Float32Array(max);
    this.col = new Float32Array(max * 4); this.drag = new Float32Array(max);
    this.n = 0; this.head = 0;
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr); geo.setAttribute('aCol', this.colAttr); geo.setAttribute('aSize', this.sizeAttr);
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false,
      uniforms: { uScale: { value: 700 } },
      vertexShader: `attribute vec4 aCol;attribute float aSize;uniform float uScale;varying vec4 vC;
        void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vC=aCol;gl_PointSize=clamp(aSize*uScale/max(-mv.z,.5),0.,200.);gl_Position=projectionMatrix*mv;}`,
      fragmentShader: `varying vec4 vC;void main(){float d=length(gl_PointCoord-.5)*2.;float a=smoothstep(1.,.0,d);
        ${additive ? 'gl_FragColor=vec4(vC.rgb*a*vC.a,a*vC.a);' : 'gl_FragColor=vec4(vC.rgb,a*a*vC.a);'}}`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false; this.points.renderOrder = 5;
    scene.add(this.points);
    this.additive = additive;
  }
  emit(x, y, z, vx, vy, vz, life, size, r, g, b, a = 1, grav = 0, drag = 0.5) {
    const i = this.head; this.head = (this.head + 1) % this.max;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size; this.grav[i] = grav; this.drag[i] = drag;
    const c = this.col; c[i * 4] = r; c[i * 4 + 1] = g; c[i * 4 + 2] = b; c[i * 4 + 3] = a;
    this.n = Math.min(this.n + 1, this.max);
    this.idle = false;
  }
  update(dt) {
    if (this.idle) return;   // nothing alive since the last frame that drew any: no loop over the pool, no buffer uploads
    const { p, v, life, maxLife, size, grav, col, drag } = this;
    const pa = this.posAttr.array, ca = this.colAttr.array, sa = this.sizeAttr.array;
    let live = 0;
    for (let i = 0; i < this.max; i++) {
      if (life[i] <= 0) { sa[i] = 0; ca[i * 4 + 3] = 0; continue; }
      life[i] -= dt;
      const k = Math.exp(-drag[i] * dt);
      v[i * 3] *= k; v[i * 3 + 1] = v[i * 3 + 1] * k + grav[i] * dt; v[i * 3 + 2] *= k;
      p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
      if (p[i * 3 + 1] < 0.03 && grav[i] < 0) { p[i * 3 + 1] = 0.03; v[i * 3 + 1] *= -0.35; v[i * 3] *= 0.7; v[i * 3 + 2] *= 0.7; }
      const t = Math.max(life[i], 0) / maxLife[i];
      pa[i * 3] = p[i * 3]; pa[i * 3 + 1] = p[i * 3 + 1]; pa[i * 3 + 2] = p[i * 3 + 2];
      ca[i * 4] = col[i * 4]; ca[i * 4 + 1] = col[i * 4 + 1]; ca[i * 4 + 2] = col[i * 4 + 2];
      ca[i * 4 + 3] = col[i * 4 + 3] * (this.additive ? t : Math.min(1, t * 2) * 0.8);
      sa[i] = size[i] * (this.additive ? (0.4 + 0.6 * t) : (1.6 - t * 0.9));
      live = i + 1;
    }
    // only the drawn range [0, live) goes to the GPU
    for (const [at, k] of [[this.posAttr, 3], [this.colAttr, 4], [this.sizeAttr, 1]]) { at.clearUpdateRanges(); if (live) { at.addUpdateRange(0, live * k); at.needsUpdate = true; } }
    this.points.geometry.setDrawRange(0, Math.max(live, 0));
    if (!live) this.idle = true;
  }
}

// ---------- Tracers ----------
export class Tracers {
  constructor(scene, max = 48) {
    this.max = max; this.list = [];
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(max * 6), 3).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.BufferAttribute(new Float32Array(max * 6), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pos); geo.setAttribute('color', this.col);
    this.mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 6;
    scene.add(this.mesh);
  }
  add(a, b, color = [1, 0.8, 0.4]) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, t: 0, life: 0.09, c: color });
  }
  update(dt) {
    if (!this.list.length && !this.drawn) return;   // nothing in flight and nothing left on screen
    const pa = this.pos.array, ca = this.col.array;
    this.list = this.list.filter((l) => (l.t += dt) < l.life);
    this.drawn = this.list.length;
    let i = 0;
    for (const l of this.list) {
      const k = 1 - l.t / l.life;
      // tracer head travels along path: draw a short bright segment
      const f0 = Math.min(1, l.t / l.life * 1.4), f1 = Math.max(0, f0 - 0.35);
      const ax = l.ax + (l.bx - l.ax) * f1, ay = l.ay + (l.by - l.ay) * f1, az = l.az + (l.bz - l.az) * f1;
      const bx = l.ax + (l.bx - l.ax) * f0, by = l.ay + (l.by - l.ay) * f0, bz = l.az + (l.bz - l.az) * f0;
      pa.set([ax, ay, az, bx, by, bz], i * 6);
      ca.set([l.c[0] * k * 0.2, l.c[1] * k * 0.2, l.c[2] * k * 0.2, l.c[0] * k * 2, l.c[1] * k * 2, l.c[2] * k * 2], i * 6);
      i++;
    }
    this.pos.needsUpdate = this.col.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, i * 2);
  }
}

// ---------- Dynamic light pool ----------
export class LightPool {
  constructor(scene, n = 6) {
    this.lights = []; this.items = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 30, 1.6);
      l.castShadow = false; l.visible = i < LIGHT_CAP.fx; scene.add(l); this.lights.push(l); this.items.push(null);   // final visibility now: shaders compile for this light count
    }
  }
  flash(x, y, z, color, intensity, dist, life) {
    // pick free or weakest
    let idx = this.items.findIndex((it) => !it);
    if (idx < 0) { let min = 1e9; this.items.forEach((it, i) => { const k = it.i * (it.life / it.max); if (k < min) { min = k; idx = i; } }); }
    this.items[idx] = { x, y, z, color, i: intensity, max: life, life, dist };
    const l = this.lights[idx]; l.position.set(x, y, z); l.color.set(color); l.distance = dist;
  }
  update(dt) {
    this.items.forEach((it, i) => {
      const l = this.lights[i]; l.visible = i < LIGHT_CAP.fx;
      if (!it) { l.intensity = 0; return; }
      it.life -= dt;
      if (it.life <= 0) { this.items[i] = null; l.intensity = 0; return; }
      l.intensity = it.i * (it.life / it.max);
    });
  }
}
