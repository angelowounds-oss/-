import * as THREE from 'three';
import { Builder } from './gfx.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLSL_NOISE, patchStandard, timeUniform, doorCamU, blackU, ZONE_GLSL, skyU, nightU, createGlareMaterial, createSky } from './shaders.js';
import { mulberry32, clamp, lerp, TAU } from './util.js';
import { facadeUniforms } from './facade.js';
import { MODEL_H, MODEL_W, MODEL_D, MODEL_PROM, MODEL_VARIANTS } from './modelinfo.js';
import asphA from '../assets/tex/asphalt_04_a.jpg';
import asphN from '../assets/tex/asphalt_04_n.jpg';
import paveA from '../assets/tex/concrete_pavers_a.jpg';
import paveN from '../assets/tex/concrete_pavers_n.jpg';
import causticUrl from '../assets/tex/water_caustic.jpg';

// ---------- City layout constants ----------
export const N = 9;          // blocks per side (inside the outer ring)
export const P = 84;         // road pitch
export const R = 20;         // road width
export const SW = 5;         // sidewalk width
export const HALF = (N * P) / 2;
export const LANE = 4.6;     // lane offset from road center
// Irregular block sizes: the road at index i sits at a cumulative offset of per-block multipliers (they sum to N, so the outer
// extent HALF is unchanged). Outside the 0..N range the roads keep the plain pitch P.
export const BLOCK_MULT = [1.12, 0.86, 1.26, 0.82, 1.04, 1.2, 0.9, 1.15, 0.65];
const CUMS = [0]; BLOCK_MULT.forEach((m) => CUMS.push(CUMS[CUMS.length - 1] + m * P));
export const roadC = (i) => (i < 0 ? -HALF + i * P : i > N ? HALF + (i - N) * P : -HALF + CUMS[i]);
export const blockLen = (i) => roadC(i + 1) - roadC(i);
export const roadIdx = (v) => { let b = 0, bd = 1e9; for (let i = 0; i <= N; i++) { const d = Math.abs(v - roadC(i)); if (d < bd) { bd = d; b = i; } } return b; };
export const nodePos = (i, j) => [roadC(i), roadC(j)];
// Road segments closed to traffic and turned into pedestrian streets. Each turns its two end nodes into T-junctions
// (no node loses more than one edge, so every junction keeps at least three ways and traffic never dead-ends).
// v: the road x = roadC(i) between nodes j and j+1; h: the road z = roadC(j) between nodes i and i+1.
export const STATION_NAMES = ['남포역', '중앙역', '자갈치역', '서면역', '해운대역', '광안역'];
export const CUTS = [{ v: true, i: 2, j: 4 }, { v: true, i: 6, j: 2 }, { v: true, i: 4, j: 7 }, { v: false, i: 3, j: 3 }, { v: false, i: 6, j: 5 }, { v: false, i: 1, j: 6 }];
const cutKey = (i, j, v) => i + ',' + j + ',' + (v ? 'v' : 'h'), CUT_SET = new Set(CUTS.map((c) => cutKey(c.i, c.j, c.v)));
// is the edge from node (i,j) one step in direction (di,dj) open to traffic?
export const hasEdge = (i, j, di, dj) => {
  const ti = i + di, tj = j + dj; if (ti < 0 || ti > N || tj < 0 || tj > N) return false;
  return di !== 0 ? !CUT_SET.has(cutKey(Math.min(i, ti), j, false)) : !CUT_SET.has(cutKey(i, Math.min(j, tj), true));
};
// rectangle of road surface covered by a cut (intersection squares stay road)
export const cutRect = (c) => (c.v ? [roadC(c.i) - R / 2, roadC(c.j) + R / 2, roadC(c.i) + R / 2, roadC(c.j + 1) - R / 2] : [roadC(c.i) + R / 2, roadC(c.j) - R / 2, roadC(c.i + 1) - R / 2, roadC(c.j) + R / 2]);
export const inCut = (x, z) => CUTS.some((c) => { const r = cutRect(c); return x > r[0] && x < r[2] && z > r[1] && z < r[3]; });

const ACCENTS = [
  [1.0, 0.18, 0.78], // magenta
  [0.15, 0.85, 1.0], // cyan
  [1.0, 0.55, 0.15], // orange
  [0.55, 0.35, 1.0], // violet
  [0.2, 1.0, 0.6],   // green
  [1.0, 0.22, 0.32], // red
];
export const accentColor = (i) => ACCENTS[((i % 6) + 6) % 6];

// ---------- Collision world ----------
export class Colliders {
  constructor() {
    this.boxes = [];
    this.circles = [];
    this.cell = 24;
    this.grid = new Map();
  }
  _key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }
  _add(item, x0, z0, x1, z1) {
    const c = this.cell;
    for (let cx = Math.floor(x0 / c); cx <= Math.floor(x1 / c); cx++)
      for (let cz = Math.floor(z0 / c); cz <= Math.floor(z1 / c); cz++) {
        const k = this._key(cx, cz);
        let a = this.grid.get(k);
        if (!a) this.grid.set(k, (a = []));
        a.push(item);
      }
  }
  addBox(x0, z0, x1, z1, h, tag, y0 = 0) {
    const b = { x0, z0, x1, z1, h, y0, tag, kind: 0 };
    this.boxes.push(b);
    this._add(b, x0, z0, x1, z1);
    if (this.sink) this.sink.addBox(b);
    return b;
  }
  removeBox(b) {
    const i = this.boxes.indexOf(b); if (i < 0) return;
    const last = this.boxes.pop(); if (last !== b) this.boxes[i] = last;
    const c = this.cell;
    for (let cx = Math.floor(b.x0 / c); cx <= Math.floor(b.x1 / c); cx++)
      for (let cz = Math.floor(b.z0 / c); cz <= Math.floor(b.z1 / c); cz++) {
        const a = this.grid.get(this._key(cx, cz)); if (!a) continue;
        const k = a.indexOf(b); if (k >= 0) a.splice(k, 1);
      }
    if (this.sink) this.sink.removeBox(b);
  }
  addCircle(x, z, r, h, tag) {
    const c = { x, z, r, h, tag, kind: 1 };
    this.circles.push(c);
    this._add(c, x - r, z - r, x + r, z + r);
    return c;
  }
  near(x, z, rad, out = []) {
    out.length = 0;
    const c = this.cell;
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    for (let cx = Math.floor((x - rad) / c); cx <= Math.floor((x + rad) / c); cx++)
      for (let cz = Math.floor((z - rad) / c); cz <= Math.floor((z + rad) / c); cz++) {
        const a = this.grid.get(this._key(cx, cz));
        if (!a) continue;
        for (const it of a) if (!seen.has(it)) { seen.add(it); out.push(it); }
      }
    return out;
  }
  // Push circle out of statics. Returns {x,z,nx,nz,hit,depth}
  resolve(x, z, r, y = 0, tmp = []) {
    let hit = false, nxs = 0, nzs = 0, depth = 0;
    const list = this.near(x, z, r + 2, tmp);
    for (const b of list) {
      if (y > b.h - 0.05 || y + 1.7 < b.y0) continue;
      if (b.kind === 0) {
        const cx = clamp(x, b.x0, b.x1), cz = clamp(z, b.z0, b.z1);
        let dx = x - cx, dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          dx /= d; dz /= d;
          const pen = r - d;
          x += dx * pen; z += dz * pen;
          nxs += dx; nzs += dz; depth = Math.max(depth, pen); hit = true;
        } else {
          // center inside box: push along smallest axis
          const l = x - b.x0, rr = b.x1 - x, t = z - b.z0, bt = b.z1 - z;
          const m = Math.min(l, rr, t, bt);
          if (m === l) { x = b.x0 - r; nxs -= 1; } else if (m === rr) { x = b.x1 + r; nxs += 1; }
          else if (m === t) { z = b.z0 - r; nzs -= 1; } else { z = b.z1 + r; nzs += 1; }
          hit = true; depth = Math.max(depth, r);
        }
      } else {
        let dx = x - b.x, dz = z - b.z;
        const rr = r + b.r, d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-4;
        dx /= d; dz /= d;
        const pen = rr - d;
        x += dx * pen; z += dz * pen;
        nxs += dx; nzs += dz; depth = Math.max(depth, pen); hit = true;
      }
    }
    const l = Math.hypot(nxs, nzs) || 1;
    return { x, z, nx: nxs / l, nz: nzs / l, hit, depth };
  }
  // 3D ray vs static world (boxes + circles as vertical cylinders). returns t or -1
  raycast(ox, oy, oz, dx, dy, dz, maxT, mask) {
    if (this.sink) { const h = this.sink.ray(ox, oy, oz, dx, dy, dz, maxT, mask); this.lastRef = h ? h.ref : null; this.lastHit = h; return h ? h.t : -1; }
    return this.raycastGrid(ox, oy, oz, dx, dy, dz, maxT);
  }
  raycastGrid(ox, oy, oz, dx, dy, dz, maxT) {
    let best = maxT + 1, found = false;
    // march through grid cells approximately: gather by bounding of segment
    const ex = ox + dx * maxT, ez = oz + dz * maxT;
    const minx = Math.min(ox, ex), maxx = Math.max(ox, ex), minz = Math.min(oz, ez), maxz = Math.max(oz, ez);
    const c = this.cell;
    const seen = new Set();
    for (let cx = Math.floor(minx / c); cx <= Math.floor(maxx / c); cx++)
      for (let cz = Math.floor(minz / c); cz <= Math.floor(maxz / c); cz++) {
        const a = this.grid.get(this._key(cx, cz));
        if (!a) continue;
        for (const b of a) {
          if (seen.has(b)) continue;
          seen.add(b);
          let t0 = 0, t1 = best;
          if (b.kind === 0) {
            const bounds = [[ox, dx, b.x0, b.x1], [oz, dz, b.z0, b.z1], [oy, dy, b.y0 || 0, b.h]];
            let ok = true;
            for (const [o, d, lo, hi] of bounds) {
              if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { ok = false; break; } continue; }
              let ta = (lo - o) / d, tb = (hi - o) / d;
              if (ta > tb) { const t = ta; ta = tb; tb = t; }
              t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
              if (t0 > t1) { ok = false; break; }
            }
            if (ok && t0 < best && t0 >= 0) { best = t0; found = true; }
          } else {
            const fx = ox - b.x, fz = oz - b.z;
            const A = dx * dx + dz * dz;
            if (A < 1e-9) continue;
            const B = 2 * (fx * dx + fz * dz), C = fx * fx + fz * fz - b.r * b.r;
            const disc = B * B - 4 * A * C;
            if (disc < 0) continue;
            const t = (-B - Math.sqrt(disc)) / (2 * A);
            if (t >= 0 && t < best) {
              const y = oy + dy * t;
              if (y >= 0 && y <= b.h) { best = t; found = true; }
            }
          }
        }
      }
    return found && best <= maxT ? best : -1;
  }
}

// CC0 Poly Haven asphalt_04 / concrete_pavers (512px): real grain, roughness and normal detail layered over the procedural ground
const groundTex = (url, srgb) => {
  const t = new THREE.TextureLoader().load(url); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; return t;
};
// ---------- Procedural wet-asphalt city ground ----------
function createGround(fakeLights) {
  const geo = new THREE.PlaneGeometry(2600, 2600, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.0 });
  const MAXL = 24;
  const uniforms = {
    uTime: timeUniform, uNight: nightU,
    uFL: { value: Array.from({ length: MAXL }, () => new THREE.Vector4(0, -999, 0, 1)) },
    uFC: { value: Array.from({ length: MAXL }, () => new THREE.Vector3()) },
    uWet: { value: 1.0 },
    uRC: { value: Array.from({ length: N + 1 }, (_, i) => roadC(i)) },
    uCut: { value: CUTS.map((c) => new THREE.Vector4(...cutRect(c))) },
    tAsph: { value: groundTex(asphA, true) }, tAsphN: { value: groundTex(asphN, false) },
    tPave: { value: groundTex(paveA, true) }, tPaveN: { value: groundTex(paveN, false) },
  };
  patchStandard(mat, 'ground-v9', {
    uniforms,
    vertexDecl: 'varying vec3 vWP;',
    vertexMain: 'vWP=(modelMatrix*vec4(transformed,1.)).xyz;',
    fragDecl: `${GLSL_NOISE}
      varying vec3 vWP;uniform float uTime,uWet,uNight;uniform vec4 uFL[${MAXL}];uniform vec3 uFC[${MAXL}];
      uniform sampler2D tAsph,tAsphN,tPave,tPaveN;
      float fRough,fMetal;vec3 fEmit;float fPud;vec2 fN=vec2(0.);
      const int NRC=${N};uniform float uRC[${N + 1}];uniform vec4 uCut[${CUTS.length}];
      const float PP=${P}.,RR=${R}.,HH=${HALF}.,SWW=${SW}.,PRO=${(HALF + P - R / 2 + 2 + MODEL_PROM + MODEL_W + 30).toFixed(1)};`,
    fragMain: `
      vec2 p=vWP.xz;
      float rdx=1e9,rdz=1e9,ix=0.,iz=0.;for(int k=0;k<=NRC;k++){float dx=abs(p.x-uRC[k]);if(dx<rdx){rdx=dx;ix=float(k);}float dz=abs(p.y-uRC[k]);if(dz<rdz){rdz=dz;iz=float(k);}}vec2 dr=vec2(rdx,rdz);
      bool inC=abs(p.x)<=HH+RR*.5&&abs(p.y)<=HH+RR*.5;
      bool rx=dr.x<RR*.5,rz=dr.y<RR*.5;
      bool plz=false;for(int k=0;k<${CUTS.length};k++){vec4 c=uCut[k];if(p.x>c.x&&p.x<c.z&&p.y>c.y&&p.y<c.w)plz=true;}
      bool road=inC&&(rx||rz)&&!plz;
      bool inter=inC&&rx&&rz;
      float sdist=plz?3.:min(dr.x-RR*.5,dr.y-RR*.5);
      bool walk=(!road&&sdist<SWW&&inC)||plz;
      vec3 alb;fRough=.5;fMetal=0.;fEmit=vec3(0.);
      float n1=fbm(p*.6),n2=fbm(p*3.1+9.);
      float pud=smoothstep(.52,.64,fbm(p*.05+3.7)+(fbm(p*.4)-.5)*.18)*uWet;
      if(!inC&&abs(p.x)<=PRO&&abs(p.y)<=PRO){
        // promenade around the city: paver tiles in front of the outer-ring towers
        vec2 t=floor(p/1.6);float tv=h21(t);vec2 f=fract(p/1.6);float seam=smoothstep(.0,.03,min(min(f.x,1.-f.x),min(f.y,1.-f.y)));
        alb=vec3(.12+tv*.05,.12+tv*.05,.13+tv*.05)*(.75+.5*n2)*mix(.35,1.,seam);fRough=mix(.55,.8,tv)-.1;
        vec2 u1=p*.55;vec3 tc=texture2D(tPave,u1).rgb;vec4 tn=texture2D(tPaveN,u1);alb*=clamp(dot(tc,vec3(.333))/.32,.5,1.6);fN=(tn.xy*2.-1.)*.55;pud*=.45;
      }
      else if(!inC){alb=vec3(.03,.032,.04)*(.7+n1);fRough=.8;pud*=.0;}
      else if(road){
        float g0=.03+n1*.03;alb=vec3(g0*.95,g0,g0*1.1);
        // worn lane tracks
        float lx=inter?0.:abs(rx?dr.x:dr.y);
        float tr=exp(-pow((lx-RR*.25)*.5,2.))*.5;
        alb*=1.-tr*.35*(.5+n2);
        fRough=mix(.42,.6,n2);
        {
          vec2 u1=p*.21,u2=p*.047+.37;
          vec3 ta=mix(texture2D(tAsph,u1).rgb,texture2D(tAsph,u2).rgb,.45);
          vec4 tn=mix(texture2D(tAsphN,u1),texture2D(tAsphN,u2),.45);
          alb*=clamp(dot(ta,vec3(.333))/.26,.45,1.7);
          fRough=mix(fRough,clamp(tn.z*.9+.1,.3,.95),.55);
          fN=(tn.xy*2.-1.)*.7;
        }
        float crack=smoothstep(.012,0.,abs(fbm(p*1.3)-.5));
        alb*=1.-crack*.5;
        // patches
        alb*=1.+(step(.82,vnoise(floor(p*.18)))*.5)*(vnoise(p*2.)-.4)*.5;
        // manhole
        vec2 mcell=floor(p/26.);vec2 mc=(mcell+.2+.6*h22(mcell))*26.;
        float md=length(p-mc);
        if(md<.65&&!inter){alb=vec3(.02);fMetal=.9;fRough=.35;}
        // markings
        vec3 paint=vec3(0.);float pm=0.;
        // along z roads: constant x (rx). along x roads: rz
        if(!inter){
          float ax=rx?dr.x:dr.y;float along=rx?p.y:p.x;
          bool major=mod(rx?ix:iz,3.)<.5;
          // center line
          float cw=major?.28:.12;
          if(major){ if(ax>.2&&ax<.2+.13||ax>.62&&ax<.62+.13){pm=1.;paint=vec3(.95,.72,.1);} }
          else if(ax<cw&&mod(along,8.)<4.){pm=1.;paint=vec3(.9);}
          // edge lines
          if(abs(ax-(RR*.5-.9))<.1){pm=1.;paint=vec3(.9);}
          // lane dashes
          if(abs(ax-RR*.25)<.08&&mod(along,10.)<4.5){pm=.8;paint=vec3(.85);}
          // crosswalk (adjacent to intersections)
          float oa=rx?dr.y:dr.x; // distance along other axis to nearest intersection center
          float perp=rx?p.x:p.y;
          if(oa>RR*.5&&oa<RR*.5+4.2){ if(mod(perp,1.5)<.8){pm=1.;paint=vec3(.9);} }
          if(oa>RR*.5+4.8&&oa<RR*.5+5.3&&ax<RR*.5-1.){pm=1.;paint=vec3(.9);}
        }
        float wear=smoothstep(.25,.7,vnoise(p*6.));
        alb=mix(alb,paint*.7,pm*wear);
        if(pm>0.){fRough=.55;}
      }
      else if(walk){
        vec2 t=floor(p/1.6);float tv=h21(t);
        vec2 f=fract(p/1.6);float seam=smoothstep(.0,.03,min(min(f.x,1.-f.x),min(f.y,1.-f.y)));
        alb=vec3(.12+tv*.05,.12+tv*.05,.13+tv*.05)*(.75+.5*n2)*mix(.35,1.,seam);
        {
          vec2 u1=p*.55;vec3 tc=texture2D(tPave,u1).rgb;vec4 tn=texture2D(tPaveN,u1);
          alb*=clamp(dot(tc,vec3(.333))/.32,.5,1.6);
          fN=(tn.xy*2.-1.)*.55;
        }
        fRough=mix(.55,.8,tv)-.1;
        float curb=smoothstep(.45,.2,sdist);
        alb=mix(alb,vec3(.3,.3,.33),curb*.9);
        // yellow tactile strip at curb
        if(sdist>0.35&&sdist<.95&&mod(p.x+p.y,.6)<.4&&vnoise(floor(p*1.7))>.5)alb=mix(alb,vec3(.5,.42,.1),.6);
        pud*=.45;
      }
      else{
        alb=vec3(.045,.05,.055)*(.6+n1*.9);
        vec2 t=floor(p/3.);alb*=.85+.3*h21(t);fRough=.7;pud*=.25;
      }
      fPud=pud;
      alb*=mix(1.,.5,pud);fRough=mix(fRough,.11,smoothstep(.0,1.,pud));
      diffuseColor.rgb=alb;
      // fake neon light pools (cheap local lights; real lights are reserved for gameplay)
      vec3 acc=vec3(0.);
      for(int i=0;i<${MAXL};i++){
        vec4 L=uFL[i];if(L.y<-900.)continue;
        vec2 d=p-L.xz;float dd=dot(d,d);float r=L.w;
        float at=1./(1.+dd/(r*r));at*=at;
        // stretch reflection streak toward viewer along view direction on wet surface
        vec3 vd=normalize(cameraPosition-vWP);
        vec2 sd=normalize(vd.xz+1e-4);
        float along=dot(d,sd);float perp=length(d-sd*along);
        float streak=exp(-perp*perp/(r*.18+.5))*exp(-max(-along,0.)*.08)*exp(-max(along,0.)*.35);
        float ill=at*(.35+.65*(1.-pud))*.9+streak*pud*1.4*(L.y*.02+.4);
        acc+=uFC[i]*ill;
      }
      fEmit=(acc*alb*1.1+acc*pud*.16)*uNight;
    `,
  });
  // wet ripples on puddles perturb normal
  const orig = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh) => {
    orig(sh);
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      {
        float rr=fPud;
        vec2 q=vWP.xz*1.9;vec2 id=floor(q);vec2 f=fract(q)-.5;
        float rn=h21(id);float t=fract(uTime*.8+rn);
        vec2 cc=(h22(id+3.)-.5)*.5;float dd=length(f-cc);
        float ring=sin((dd-t*.55)*18.)*smoothstep(.55,0.,dd)*(1.-t)*smoothstep(0.,.08,t);
        vec2 gr=(f-cc)/max(dd,.01)*ring*.06*rr*(1.-smoothstep(12.,40.,length(vViewPosition)));
        vec3 off=(viewMatrix*vec4(gr.x,0.,gr.y,0.)).xyz;
        normal=normalize(normal+off);
        // micro roughness bump on dry areas
        normal=normalize(normal+(viewMatrix*vec4(fN.x,0.,fN.y,0.)).xyz*(1.-rr*.85)*.55);
        float bn=(vnoise(vWP.xz*8.)-.5)*.05*(1.-rr);
        normal=normalize(normal+(viewMatrix*vec4(bn,0.,bn*.7,0.)).xyz);
      }`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.userData.uniforms = uniforms;
  return mesh;
}

// ---------- Facade material (windows, neon strips, shopfronts) ----------
function createFacadeMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.0 });
  const uniforms = { uDoorCam: doorCamU, uBlack: blackU, uTime: timeUniform, uNight: nightU, uBumpK: { value: 0.35 }, ...facadeUniforms() };
  patchStandard(mat, 'facade-v9', {
    uniforms,
    vertexDecl: 'attribute vec4 aInfo;attribute vec4 aDoor;varying vec4 vDoor;varying vec3 vWP;varying vec3 vWN;varying vec3 vLoc;varying vec3 vSz;varying vec4 vInfo;',
    vertexMain: `
      vec4 mw=vec4(transformed,1.);vec3 nn=objectNormal;
      #ifdef USE_INSTANCING
        mw=instanceMatrix*mw;nn=mat3(instanceMatrix)*nn;
        vSz=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
      #else
        vSz=vec3(1.);
      #endif
      vWP=(modelMatrix*mw).xyz;vWN=normalize(mat3(modelMatrix)*nn);vLoc=position;vInfo=aInfo;vDoor=aDoor;`,
    fragDecl: `${GLSL_NOISE}${ZONE_GLSL}
      varying vec4 vDoor;varying vec3 vWP;varying vec3 vWN;varying vec3 vLoc;varying vec3 vSz;varying vec4 vInfo;uniform vec3 uDoorCam;uniform float uBlack[5];uniform float uTime,uNight,uHasTex,uBumpK;uniform highp sampler2DArray tFC,tFE,tFN;
      float fRough,fMetal;vec3 fEmit;vec3 fBump=vec3(0.);
      vec3 accentOf(float k){
        k=mod(floor(k),6.);
        if(k<.5)return vec3(1.,.18,.78);if(k<1.5)return vec3(.15,.85,1.);if(k<2.5)return vec3(1.,.55,.15);
        if(k<3.5)return vec3(.55,.35,1.);if(k<4.5)return vec3(.2,1.,.6);return vec3(1.,.22,.32);
      }`,
    fragMain: `
      vec3 N=normalize(vWN);float seed=vInfo.x;float style=vInfo.y;vec3 acc=accentOf(vInfo.z);
      vec3 base=diffuseColor.rgb;vec3 alb=base;fRough=.85;fMetal=0.;fEmit=vec3(0.);
      float topY=vSz.y;
      if(N.y>.5){
        // rooftop: tar + seams
        vec2 q=vWP.xz;float s=smoothstep(.0,.04,min(fract(q.x/3.),fract(q.y/3.)));
        alb=vec3(.035,.037,.045)*(.7+.6*vnoise(q*.7))*mix(.6,1.,s);fRough=.9;
        // parapet glow
        vec2 e=abs(vLoc.xz)*2.;float edge=max(e.x*(1.-step(.5,0.))*0.+e.x,e.y);
        float dedge=(.5-max(abs(vLoc.x),abs(vLoc.z)))*min(vSz.x,vSz.z);
        if(dedge<.35&&style>.5)fEmit+=acc*1.2*step(.5,h11(seed*7.));
      } else if(N.y<-.5){alb*=.2;}
      else{
        float horiz=abs(N.x)>.5?vWP.z:vWP.x;float y=vWP.y;
        // entrance face of a podium: open the glazed ground-floor bays (between the 0.7 m pillars) so the lobby behind the glass doors is visible
        if(vDoor.w>.5&&y>.3&&y<3.1&&distance(vWP.xz,uDoorCam.xz)<58.){
          float code=N.x<-.5?0.:(N.x>.5?1.:(N.z<-.5?2.:3.));
          if(abs(code-vDoor.z)<.5){float f=fract((horiz-vDoor.x)/vDoor.y);float pw=.35/vDoor.y;if(f>pw&&f<1.-pw)discard;}
        }
        float sx=style>.5&&style<1.5?2.2:3.1;float sy=3.6;
        // shopfront / podium band
        bool shop=y<4.6&&vSz.y>0.&&mod(vInfo.w,2.)>.5;
        vec2 cell=vec2(floor(horiz/sx),floor(y/sy));vec2 f=vec2(fract(horiz/sx),fract(y/sy));
        float rnd=h21(cell+seed*37.1);float flr=h21(vec2(cell.y,seed*13.7));
        // wall weathering
        float grime=fbm(vec2(horiz*.35,y*.08)+seed*9.)*.6+.4;
        alb*=grime*(1.-smoothstep(0.,40.,y)*.0)*(.65+.55*smoothstep(0.,6.,y));
        float streak=vnoise(vec2(horiz*2.3,y*.03+seed));alb*=1.-smoothstep(.6,.95,streak)*.35;
        // wall panel lines
        float line=smoothstep(.0,.02,min(f.y,1.-f.y));
        alb*=mix(.7,1.,line);
        float wm=0.;
        if(style<.5){wm=step(.2,f.x)*step(f.x,.8)*step(.22,f.y)*step(f.y,.82);}
        else if(style<1.5){wm=step(.03,f.x)*step(f.x,.97)*step(.12,f.y)*step(f.y,.9);}
        else if(style<2.5){wm=step(.15,f.x)*step(f.x,.85)*step(.15,f.y)*step(f.y,.85);float arch=step(.5,f.y);}
        else {wm=step(.35,f.x)*step(f.x,.65)*step(.05,f.y)*step(f.y,.95);}
        // edge-of-building: no windows near corners
        float cornerD=abs(N.x)>.5?(.5-abs(vLoc.z))*vSz.z:(.5-abs(vLoc.x))*vSz.x;
        wm*=step(.9,cornerD);
        // top parapet
        float fromTop=topY*(1.-vLoc.y-0.);
        if(fromTop<1.2)wm=0.;
        if(y<.9)wm=0.;
        float dens=mix(.22,.6,fract(seed*3.7));
        float lit=step(rnd,dens);lit=max(lit,step(flr,.1)*step(.35,h21(cell+2.))) ;
        float tvf=step(.965,h21(cell+seed*5.))*(.5+.5*sin(uTime*(2.+rnd*6.)+rnd*40.));
        vec3 wc;float cr=h21(cell+11.7);
        if(cr<.5)wc=vec3(1.,.74,.42);else if(cr<.72)wc=vec3(.75,.9,1.);else if(cr<.86)wc=acc;else wc=vec3(1.,.88,.6);
        if(shop){
          // ground floor: lit shop windows with accent glow
          float sxm=fract(horiz/5.5);float sm=step(.07,sxm)*step(sxm,.93)*step(.55,y)*step(y,4.0);
          wm=sm*step(.9,cornerD);float sr=h21(vec2(floor(horiz/5.5),seed*17.));
          wc=(sr<.4?acc:(sr<.7?vec3(1.,.8,.55):vec3(.6,.85,1.)))*.55;
          lit=1.;
          float stripe=smoothstep(.0,.02,abs(y-4.35))*0.+step(abs(y-4.25),.12);
          fEmit+=acc*stripe*2.4*step(.9,cornerD);
          alb*=.8;
          // interior luminance gradient
          wm*=1.;
          wc*=.55+.6*smoothstep(0.,4.,y);
        }
        float fw=max(fwidth(horiz/sx),fwidth(y/sy));float farF=smoothstep(.1,.38,fw);
        if(uHasTex<.5&&wm>.5){
          if(lit>.5||tvf>.01){
            float k=lit>.5?1.:0.;vec3 em=wc*(.7+h21(cell+4.)*.8);
            em=mix(em,vec3(.35,.5,1.)*2.,tvf*(1.-k)*.0+tvf*.7);
            vec3 we=em*(shop?(.55+.45*vnoise(vec2(horiz*2.6,y*3.))):1.)*(lit>.5?1.:tvf);
            vec3 avg=vec3(1.,.8,.55)*dens*.55*(shop?.8:1.);
            fEmit+=mix(we,avg,farF);
            alb=wc*.03;fMetal=.2;fRough=.25;
          } else {alb=vec3(.012,.016,.028);fMetal=.92;fRough=mix(.1,.5,farF);
            fEmit+=vec3(1.,.8,.55)*dens*.55*farF*(shop?.8:1.);}
        }
        if(style>2.5){
          // LED vertical strips + horizontal bands
          float v=smoothstep(.0,.08,abs(fract(horiz/6.)-.5)*0.+abs(f.x-.5)-.46)*0.;
          float strip=step(abs(fract(horiz/14.)-.5),.03);
          fEmit+=acc*strip*(.9+.5*sin(uTime*1.3+horiz*.2+y*.15))*step(.45,h11(seed*5.3));
        }
        if(style>.5&&style<1.5){
          float band=step(abs(fract(y/18.)-.5),.012);
          fEmit+=acc*band*1.6;
        }
        // vertical corner light strip
        if(cornerD<.22&&style>.5&&h11(seed*3.1)>.4)fEmit+=acc*1.6;
        // crown glow
        if(fromTop<.55&&style>.5&&mod(vInfo.w,2.)<.5)fEmit+=acc*2.6;
        if(uHasTex>.5){
          // real facade texture sets: tile = (floors per tile + optional ground-floor shop slot) x 4 m so the window rows line up with the generated floors
          float setf=floor(vInfo.w*.5);bool pod=mod(vInfo.w,2.)>.5;
          float tw=setf<1.5?24.:(setf<2.5?8.:12.);
          float yy=vLoc.y*vSz.y; // height above the instance base (the box geometry stands on y=0)
          float fs=N.z>.5?1.:(N.z<-.5?-1.:(N.x>.5?-1.:1.)); // +1 when increasing horiz runs to the viewer's right
          float mir=(h11(seed*3.3)>.5?-1.:1.)*fs;float u=mir*horiz/tw+h11(seed*9.1);
          float vv;float vr=-yy*(setf<1.5?1./24.:1./tw); // continuous (branch-free) for the texture gradients
          if(setf<1.5){
            if(pod&&yy<4.){vv=1.-yy/4.*(1./6.);}
            else{float t=(pod?yy-4.:yy)/20.;vv=(1.-fract(t))*(5./6.);}
          }else{float t=yy/tw;vv=1.-fract(t);}
          vec2 gx=vec2(dFdx(u),dFdx(vr)),gy=vec2(dFdy(u),dFdy(vr));
          float eL=setf<1.5?setf:(setf<2.5?(h11(seed*7.7)>.5?4.:2.):(h11(seed*7.7)>.5?5.:3.));
          vec3 tc=textureGrad(tFC,vec3(u,vv,setf),gx,gy).rgb;
          vec3 te=textureGrad(tFE,vec3(u,vv,eL),gx,gy).rgb;
          vec4 tn=textureGrad(tFN,vec3(u,vv,setf),gx,gy);
          alb=tc*mix(vec3(1.),base*2.2,.2);fRough=mix(.85,tn.b,.85);fMetal=0.;
          fEmit+=te*1.7*(.75+.5*h11(seed*5.5));
          vec3 tw3=abs(N.x)>.5?vec3(0.,0.,1.):vec3(1.,0.,0.);
          fBump=tw3*((tn.r*2.-1.)*mir)+vec3(0.,1.,0.)*(tn.g*2.-1.);
        }
      }
      fEmit*=mix(.14,1.,uNight);
      float bk=uBlack[zoneOf(vWP.xz)];
      fEmit*=1.-bk*.96;
      diffuseColor.rgb=alb*(1.-bk*.72*uNight);
    `,
  });
  const origCompile = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh) => {
    origCompile(sh);
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      if(uHasTex>.5)normal=normalize(normal+(viewMatrix*vec4(fBump*uBumpK,0.)).xyz);`);
  };
  mat.userData.uniforms = uniforms;
  return mat;
}

// ---------- Sign atlas ----------
const SIGN_TEXTS = [
  ['NEON BAR', '#ff2fd0'], ['24H', '#2fe6ff'], ['RAMEN', '#ffa24a'], ['라멘', '#ff3d5a'],
  ['카지노', '#ffd34a'], ['MOTEL', '#ff2fd0'], ['노래방', '#35ff9a'], ['CYBER', '#2fe6ff'],
  ['BAR', '#9a6cff'], ['FOOD', '#ffa24a'], ['약국', '#35ff9a'], ['PIZZA', '#ff3d5a'],
  ['HOTEL', '#2fe6ff'], ['CLUB', '#ff2fd0'], ['ARCADE', '#ffd34a'], ['PC방', '#9a6cff'],
];
function createSignAtlas() {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 512;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 1024, 512);
  SIGN_TEXTS.forEach(([txt, col], i) => {
    const cx = (i % 4) * 256, cy = Math.floor(i / 4) * 128;
    g.save();
    g.translate(cx, cy);
    // dark backing plate
    g.fillStyle = 'rgba(4,4,10,0.82)';
    g.beginPath(); g.roundRect(6, 6, 244, 116, 14); g.fill();
    g.strokeStyle = col; g.lineWidth = 4; g.shadowColor = col; g.shadowBlur = 14;
    g.beginPath(); g.roundRect(10, 10, 236, 108, 12); g.stroke();
    g.font = '900 ' + (txt.length > 4 ? 46 : 60) + 'px "Pretendard","Noto Sans KR",Arial,sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffffff'; g.shadowBlur = 22;
    g.fillText(txt, 128, 66);
    g.shadowBlur = 0; g.globalAlpha = 0.6; g.fillStyle = col; g.fillText(txt, 128, 66);
    g.restore();
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ripples on the lake surfaces: 12 ring-buffer slots (x, z, birth time, amplitude), drawn by the water shader as expanding wave packets
export const ripU = { value: Array.from({ length: 12 }, () => new THREE.Vector4(0, 0, -100, 0)) };
let ripN = 0;
export function addRipple(x, z, amp = 1) { (window.__rip = window.__rip || { n: 0 }).n++; ripU.value[ripN++ % 12].set(x, z, timeUniform.value, amp); }

// UniformsUtils.merge copies {value} objects, which would freeze uTime/uNight at their initial values: re-link the shared ones
function liveUniforms(mat) {
  const u = mat.uniforms;
  if (u.uTime) u.uTime = timeUniform; if (u.uNight) u.uNight = nightU; if (u.uSun) u.uSun = skyU.uSun; if (u.uMoon) u.uMoon = skyU.uMoon; if (u.uRip) u.uRip = ripU;
  return mat;
}

function createSignMaterial(atlas) { return liveUniforms(createSignMaterial0(atlas)); }
function createSignMaterial0(atlas) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: atlas }, uTime: timeUniform, uNight: nightU }]),
    vertexShader: `attribute vec4 aCell;varying vec2 vUv;varying vec4 vCell;
      #include <fog_pars_vertex>
      void main(){vUv=(uv+aCell.xy)*vec2(.25,.25);vCell=aCell;
        vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D uMap;uniform float uTime,uNight;varying vec2 vUv;varying vec4 vCell;
      #include <fog_pars_fragment>
      void main(){vec4 t=texture2D(uMap,vUv);float s=vCell.z;
        float fl=1.;float ph=fract(s*7.31);
        if(ph>.8){fl=step(.08,fract(uTime*(.7+ph)+s*13.));fl=mix(.25,1.,fl);}
        vec3 c=pow(t.rgb,vec3(2.2))*(2.4*fl)*mix(.18,1.,uNight);
        gl_FragColor=vec4(c,t.a*(.55+.45*fl));
        #include <fog_fragment>
      }`,
  });
}

// ---------- Holographic billboard ----------
function createHoloMaterial() { return liveUniforms(createHoloMaterial0()); }
function createHoloMaterial0() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: timeUniform, uNight: nightU }]),
    vertexShader: `attribute vec4 aHolo;varying vec2 vUv;varying vec4 vH;
      #include <fog_pars_vertex>
      void main(){vUv=uv;vH=aHolo;vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `${GLSL_NOISE}uniform float uTime,uNight;varying vec2 vUv;varying vec4 vH;
      #include <fog_pars_fragment>
      vec3 pal(float k){k=mod(k,3.);return k<1.?vec3(1.,.15,.8):(k<2.?vec3(.1,.85,1.):vec3(1.,.6,.15));}
      void main(){
        vec2 uv=vUv;float s=vH.x;vec3 c1=pal(s),c2=pal(s+1.);
        float scan=.75+.25*sin(uv.y*220.+uTime*6.);
        float glitch=step(.985,h11(floor(uTime*8.)+floor(uv.y*30.)))*.08;
        uv.x+=glitch;
        float shape=0.;
        // rotating radial / bars / waves
        float k=floor(s);
        if(mod(k,3.)<1.){
          vec2 q=uv-.5;float a=atan(q.y,q.x);float r=length(q);
          shape=smoothstep(.03,0.,abs(r-.32-.03*sin(uTime*2.)))+smoothstep(.02,0.,abs(r-.18))*.8+smoothstep(.02,0.,abs(sin(a*6.+uTime*1.5)*r-.0))*.6*step(r,.34);
        } else if(mod(k,3.)<2.){
          float b=floor(uv.x*28.);float hh=.2+.7*vnoise(vec2(b*.7,uTime*1.6));
          shape=step(abs(fract(uv.x*28.)-.5),.36)*step(uv.y,hh);
        } else {
          float w=.5+.25*sin(uv.x*14.+uTime*3.)+.12*sin(uv.x*31.-uTime*5.);
          shape=smoothstep(.03,0.,abs(uv.y-w))*1.2+smoothstep(.02,0.,abs(uv.y-w*.6))*.6;
        }
        float frame=smoothstep(.02,.0,min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y)));
        vec3 col=mix(c1,c2,uv.y)*(shape*1.7+frame*1.3+.12)*scan;
        float a=clamp(shape+frame+.18,0.,1.)*.95;
        gl_FragColor=vec4(col*2.,a*mix(.25,1.,uNight));
        #include <fog_fragment>
      }`,
  });
}

// ---------- World builder ----------
export function buildWorld(scene, quality) {
  const world = {
    colliders: new Colliders(), lots: [], signs: [], lamps: [], intersections: [], parks: [], waters: [],
    fakeLights: [], update: null, spawnPoints: [], districtName: () => '',
  };
  const rnd = mulberry32(90210);
  const R_ = (a = 0, b = 1) => a + (b - a) * rnd();
  const pickR = (arr) => arr[Math.floor(rnd() * arr.length)];

  const objStart = scene.children.length;
  const sky = createSky();
  scene.add(sky);
  world.sky = sky;

  const ground = createGround();
  scene.add(ground);
  world.ground = ground;

  const facadeMat = createFacadeMaterial();
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  boxGeo.translate(0, 0.5, 0);

  // Collect instances first
  const tiers = []; // {x,z,w,d,h,y,style,accent,seed,podium,color}
  const glares = []; // {x,y,z,r,g,b,size,blink,phase}
  const props = [];  // generic dark props (boxes) x,y,z,w,h,d,color
  const signInst = [];
  const holoInst = [];

  const addGlare = (x, y, z, c, size, blink = 0, phase = 0) => glares.push({ x, y, z, c, size, blink, phase });
  const addFake = (x, y, z, c, rad, k = 1) => world.fakeLights.push({ x, y, z, c: [c[0] * k, c[1] * k, c[2] * k], rad });

  const wallColors = [0x6c6f7d, 0x4a4f63, 0x7a6f6a, 0x57606f, 0x8b8f9c, 0x5b4a58, 0x3f4756, 0x70737c];

  function addLot(x0, z0, x1, z1, bi, bj, dcen, edges) {
    const w = x1 - x0, d = z1 - z0;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    let hMin, hMax;
    if (dcen <= 1) { hMin = 70; hMax = 175; } else if (dcen === 2) { hMin = 40; hMax = 110; } else { hMin = 20; hMax = 62; }
    const H = R_(hMin, hMax) * (0.7 + 0.5 * Math.min(w, d) / 30);
    const style = Math.floor(R_(0, 4));
    const accent = Math.floor(R_(0, 6));
    const seed = rnd() * 50;
    const col = new THREE.Color(pickR(wallColors));
    col.multiplyScalar(R_(0.7, 1.15));
    const tex = Math.floor(seed * 7.13) % 4;
    const podiumH = R_(6, 13);
    const tierIdx = tiers.length; // this lot's podium instance in the facade mesh (door aperture is written there later)
    // podium (full lot, shopfront band)
    tiers.push({ x: cx, z: cz, w, d, h: podiumH, style: style === 3 ? 2 : style, accent, seed, podium: 1, tex, color: col });
    // main tower
    const ins = Math.min(R_(1.5, 5), Math.min(w, d) * 0.18);
    const tw = w - ins * 2, td = d - ins * 2;
    const th = Math.max(H - podiumH, 6);
    tiers.push({ x: cx, z: cz, w: tw, d: td, h: th, y: podiumH, style, accent, seed: seed + 1, podium: 0, tex, color: col.clone().multiplyScalar(0.92) });
    const lotTiers = { podium: { x0, z0, x1, z1, y0: 0, y1: podiumH }, tower: { x0: cx - tw / 2, z0: cz - td / 2, x1: cx + tw / 2, z1: cz + td / 2, y0: podiumH, y1: podiumH + th }, crown: null };
    let topY = podiumH + th, topW = tw, topD = td;
    if (H > 55 && rnd() < 0.8) {
      const i2 = Math.min(R_(3, 7), Math.min(tw, td) * 0.22);
      const ch = R_(10, 32);
      const sx = R_(-1, 1) * i2 * 0.5, sz = R_(-1, 1) * i2 * 0.5;
      tiers.push({ x: cx + sx, z: cz + sz, w: tw - i2 * 2, d: td - i2 * 2, h: ch, y: topY, style: (style + 1) % 4, accent, seed: seed + 2, podium: 0, tex, color: col.clone().multiplyScalar(0.8) });
      lotTiers.crown = { x0: cx + sx - (tw - i2 * 2) / 2, z0: cz + sz - (td - i2 * 2) / 2, x1: cx + sx + (tw - i2 * 2) / 2, z1: cz + sz + (td - i2 * 2) / 2, y0: topY, y1: topY + ch };
      topY += ch; topW = tw - i2 * 2; topD = td - i2 * 2;
      if (rnd() < 0.5 && ch > 14) { // spire
        const sh = R_(14, 40);
        props.push({ x: cx + sx, y: topY, z: cz + sz, w: 0.5, h: sh, d: 0.5, color: 0x1a1c24 });
        addGlare(cx + sx, topY + sh, cz + sz, [1.4, 0.1, 0.12], 7, 2.1, R_(0, 6));
      }
    }
    // rooftop clutter
    const nProps = 2 + Math.floor(R_(0, 5));
    for (let k = 0; k < nProps; k++) {
      const pw = R_(2, 5), pd = R_(2, 5), ph = R_(1.2, 3.5);
      props.push({ x: cx + R_(-1, 1) * (topW / 2 - pw), y: topY, z: cz + R_(-1, 1) * (topD / 2 - pd), w: pw, h: ph, d: pd, color: pickR([0x2b2f3a, 0x353a46, 0x23262f]) });
    }
    if (H > 28 && rnd() < 0.6) {
      const ax = cx + R_(-1, 1) * topW * 0.3, az = cz + R_(-1, 1) * topD * 0.3, ah = R_(6, 18);
      props.push({ x: ax, y: topY, z: az, w: 0.35, h: ah, d: 0.35, color: 0x15171d });
      addGlare(ax, topY + ah, az, [1.5, 0.08, 0.1], 6, 1.6, R_(0, 6));
    }
    // billboard on tall buildings
    if (H > 60 && rnd() < 0.55 && topW > 14) {
      const face = rnd() < 0.5 ? 0 : 1;
      const bw = Math.min(topW * 0.8, R_(12, 22)), bh = bw * R_(0.45, 0.65);
      const by = topY + 4;
      holoInst.push({ x: face ? cx : cx + (rnd() < 0.5 ? 1 : -1) * (topW / 2 + 0.3), y: by + bh / 2, z: face ? cz + (rnd() < 0.5 ? 1 : -1) * (topD / 2 + 0.3) : cz, w: bw, h: bh, rotY: face ? 0 : Math.PI / 2, seed: Math.floor(R_(0, 3)) + R_(0, 0.5) });
      addFake(cx, 0, cz, accentColor(accent), 40, 0.6);
    }
    const solid = world.colliders.addBox(x0, z0, x1, z1, H + 5, 'building');
    world.lots.push({ x0, z0, x1, z1, h: H, accent, edges, podium: podiumH, style, ring: !!world._ring, seed, tiers: lotTiers, solid, topY, tierIdx });

    // signs on road-facing facades
    const ground = podiumH;
    const mk = (fx, fz, nx, nz, len) => {
      if (rnd() > 0.78) return;
      const n = 1 + (rnd() < 0.4 ? 1 : 0);
      for (let s = 0; s < n; s++) {
        const t = R_(-0.35, 0.35) * len;
        const px = fx + (nz !== 0 ? t : 0) + nx * 0.2;
        const pz = fz + (nx !== 0 ? t : 0) + nz * 0.2;
        const sh = 4.8 + R_(0, Math.min(ground - 2, 6)) ;
        const blade = rnd() < 0.45;
        const ci = Math.floor(R_(0, 16));
        const sc = R_(5, 7.5);
        if (blade) {
          // blade sign sticks out perpendicular to wall
          signInst.push({ x: px + nx * 1.2, y: sh + R_(1, 5), z: pz + nz * 1.2, sx: sc * 0.55, sy: sc * 0.55 * 0.5 * 2, rotY: nx !== 0 ? Math.PI / 2 : 0, rotZ: 0, cell: ci, seed: R_(0, 20), blade: true, nx, nz });
        } else {
          signInst.push({ x: px, y: sh, z: pz, sx: sc, sy: sc * 0.5, rotY: nx !== 0 ? Math.PI / 2 * Math.sign(nx) : (nz > 0 ? 0 : Math.PI), cell: ci, seed: R_(0, 20), nx, nz });
        }
        const col = [[1, .18, .8], [.2, .9, 1], [1, .6, .2], [.5, .35, 1], [.2, 1, .6], [1, .22, .35]][ci % 6];
        addFake(px + nx * 3, 0, pz + nz * 3, col, 9, 0.9);
        addGlare(px + nx * 0.6, sh + 1, pz + nz * 0.6, col.map((v) => v * 0.45), 9);
      }
    };
    if (edges.w) mk(x0, cz, -1, 0, d);
    if (edges.e) mk(x1, cz, 1, 0, d);
    if (edges.n) mk(cx, z0, 0, -1, w);
    if (edges.s) mk(cx, z1, 0, 1, w);
  }

  function splitLots(x0, z0, x1, z1, bi, bj, dcen, edgesIn, depth = 0) {
    const w = x1 - x0, d = z1 - z0;
    const gap = 3;
    const minS = 17;
    const canX = w > minS * 2 + gap, canZ = d > minS * 2 + gap;
    if (depth < 3 && (canX || canZ) && (rnd() < 0.75 || w > 40 || d > 40)) {
      const splitX = canX && (!canZ || w > d);
      if (splitX) {
        const m = x0 + R_(minS, w - minS - gap);
        splitLots(x0, z0, m, z1, bi, bj, dcen, { ...edgesIn, e: false }, depth + 1);
        splitLots(m + gap, z0, x1, z1, bi, bj, dcen, { ...edgesIn, w: false }, depth + 1);
      } else {
        const m = z0 + R_(minS, d - minS - gap);
        splitLots(x0, z0, x1, m, bi, bj, dcen, { ...edgesIn, s: false }, depth + 1);
        splitLots(x0, m + gap, x1, z1, bi, bj, dcen, { ...edgesIn, n: false }, depth + 1);
      }
      return;
    }
    addLot(x0, z0, x1, z1, bi, bj, dcen, edgesIn);
  }

  const c0 = Math.floor(N / 2);
  const parkBlocks = new Set(['5,6', '1,1']);
  const trees = [];
  const benches = [];
  // Inner blocks
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const xa = roadC(i) + R / 2 + SW + 0.5, xb = roadC(i + 1) - R / 2 - SW - 0.5;
      const za = roadC(j) + R / 2 + SW + 0.5, zb = roadC(j + 1) - R / 2 - SW - 0.5;
      const dcen = Math.max(Math.abs(i - c0), Math.abs(j - c0));
      if (i === c0 && j === c0) { world.plaza = { x0: xa, z0: za, x1: xb, z1: zb, cx: (xa + xb) / 2, cz: (za + zb) / 2 }; continue; }
      if (i === 6 && j === 2) {
        // lake block: swimming + boats
        const m = 3;
        world.parks.push({ x0: xa, z0: za, x1: xb, z1: zb, lake: true });
        world.waters.push({ x0: xa + m, z0: za + m, x1: xb - m, z1: zb - m, y: 0.06, floor: -2.0, slope: 4.5 });
        for (let t = 0; t < 10; t++) { const a = (t / 10) * TAU; benches.push({ x: (xa + xb) / 2 + Math.cos(a) * ((xb - xa) / 2 - 1.5), z: (za + zb) / 2 + Math.sin(a) * ((zb - za) / 2 - 1.5), ry: -a }); }
        continue;
      }
      if (i === 2 && j === 5) {
        world.parks.push({ x0: xa, z0: za, x1: xb, z1: zb, lake: true });
        world.waters.push({ x0: xa + 3, z0: za + 3, x1: xb - 3, z1: zb - 3, y: 0.06, floor: -2.4, slope: 4.5, harbor: true });
        for (let t = 0; t < 5; t++) benches.push({ x: xa + 6 + t * 12, z: za + 1.6, ry: 0 });
        continue;
      }
      if (parkBlocks.has(`${i},${j}`)) {
        world.parks.push({ x0: xa, z0: za, x1: xb, z1: zb });
        const cx = (xa + xb) / 2, cz = (za + zb) / 2;
        for (let t = 0; t < 26; t++) {
          const tx = R_(xa + 3, xb - 3), tz = R_(za + 3, zb - 3);
          if (Math.hypot(tx - cx, tz - cz) < 8) continue;
          trees.push({ x: tx, z: tz, s: R_(0.8, 1.5), hue: rnd() });
          world.colliders.addCircle(tx, tz, 0.55, 12, 'tree');
        }
        for (let t = 0; t < 8; t++) {
          const a = (t / 8) * TAU;
          benches.push({ x: cx + Math.cos(a) * 11, z: cz + Math.sin(a) * 11, ry: -a + Math.PI / 2 });
        }
        // park lamps
        for (let t = 0; t < 6; t++) {
          const a = (t / 6) * TAU + 0.3;
          world.lamps.push({ x: cx + Math.cos(a) * 15, z: cz + Math.sin(a) * 15, c: [0.45, 0.9, 1.0] });
        }
        continue;
      }
      splitLots(xa, za, xb, zb, i, j, dcen, { w: true, e: true, n: true, s: true });
    }
  }
  world._ring = true;
  // Outer ring: solid mega-blocks forming the city boundary
  const ringN = N + 2;
  for (let i = -1; i <= N; i++) {
    for (let j = -1; j <= N; j++) {
      if (i >= 0 && i < N && j >= 0 && j < N) continue;
      const xa = roadC(i) + R / 2 + (i === -1 ? 0 : SW + 0.5), xb = roadC(i + 1) - R / 2 - (i === N ? 0 : SW + 0.5);
      const za = roadC(j) + R / 2 + (j === -1 ? 0 : SW + 0.5), zb = roadC(j + 1) - R / 2 - (j === N ? 0 : SW + 0.5);
      // every ring block opens toward the road grid (corner blocks face two roads)
      const edges = { w: i === N, e: i === -1, n: j === N, s: j === -1 };
      // outer ring blocks: build as 1-2 tall towers
      const w = xb - xa, d = zb - za;
      if (i === -1 || i === N || j === -1 || j === N) {
        const lots = Math.max(1, Math.round(Math.max(w, d) / 60));
        for (let k = 0; k < lots; k++) {
          const horiz = w > d;
          const a0 = horiz ? xa + (w / lots) * k : za + (d / lots) * k;
          const a1 = horiz ? xa + (w / lots) * (k + 1) - (k < lots - 1 ? 3 : 0) : za + (d / lots) * (k + 1) - (k < lots - 1 ? 3 : 0);
          if (horiz) addLot(a0, za, a1, zb, i, j, 2, edges); else addLot(xa, a0, xb, a1, i, j, 2, edges);
        }
      }
    }
  }

  world._ring = false;
  // Outer ring: enterable towers whose exterior is the supplied residential model (skin drawn by skyline.js, interior by building.js).
  // They line a walkable promenade around the city; the boundary walls sit behind them.
  {
    const E0 = HALF + P - R / 2 + 2, FRONT = E0 + MODEL_PROM, rr = mulberry32(90210);
    world.promenade = { inner: E0, outer: FRONT + MODEL_W + 30 };
    for (const side of ['n', 's', 'w', 'e']) {
      const alongX = side === 'n' || side === 's', span = HALF + P;
      let t = -span;
      while (t < span) {
        const variant = MODEL_VARIANTS[Math.floor(rr() * MODEL_VARIANTS.length)], H = MODEL_H[variant - 1];
        const a = t + MODEL_D / 2;
        let x0, z0, x1, z1;
        if (side === 'n') { x0 = a - MODEL_D / 2; x1 = a + MODEL_D / 2; z1 = -FRONT; z0 = z1 - MODEL_W; }
        else if (side === 's') { x0 = a - MODEL_D / 2; x1 = a + MODEL_D / 2; z0 = FRONT; z1 = z0 + MODEL_W; }
        else if (side === 'w') { z0 = a - MODEL_D / 2; z1 = a + MODEL_D / 2; x1 = -FRONT; x0 = x1 - MODEL_W; }
        else { z0 = a - MODEL_D / 2; z1 = a + MODEL_D / 2; x0 = FRONT; x1 = x0 + MODEL_W; }
        const inward = { n: 's', s: 'n', w: 'e', e: 'w' }[side], podiumH = 4.0, seed = rr() * 50;
        const rect = { x0, z0, x1, z1 };
        const solid = world.colliders.addBox(x0, z0, x1, z1, H + 5, 'building');
        world.lots.push({
          x0, z0, x1, z1, h: H, accent: Math.floor(rr() * 6), edges: { [inward]: true }, podium: podiumH, style: 0, ring: false, seed, solid, topY: H - 0.1,
          tiers: { podium: { ...rect, y0: 0, y1: podiumH }, tower: { ...rect, y0: podiumH, y1: H - 0.1 }, crown: null },
          model: { variant, rot: alongX ? Math.PI / 2 : 0, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, side },
        });
        t += MODEL_D + 28 + rr() * 40;
      }
    }
  }

  // Far skyline: huge towers beyond the promenade. They are real, enterable lots (door facing the city), reached over open ground.
  const far = [], farInst = [];
  {
    const clear = world.promenade.outer + 18; // keep off the model ring and its back wall
    const fr = mulberry32(31337);
    for (let tries = 0; far.length < 120 && tries < 1500; tries++) {
      const a = fr() * TAU, dist = HALF + P * 2 + 30 + fr() * 420;
      const w = 30 + fr() * 60, d = 30 + fr() * 60, h = 80 + fr() * 250, x = Math.cos(a) * dist, z = Math.sin(a) * dist;
      if (Math.max(Math.abs(x) - w / 2, Math.abs(z) - d / 2) < clear) continue;
      if (far.some((f) => Math.abs(f.x - x) < (f.w + w) / 2 + 14 && Math.abs(f.z - z) < (f.d + d) / 2 + 14)) continue;
      far.push({ x, z, w, d, h, style: Math.floor(fr() * 4), accent: Math.floor(fr() * 6), seed: fr() * 50, tex: Math.floor(fr() * 4), color: new THREE.Color(pickR(wallColors)).multiplyScalar(0.8) });
    }
    for (const f of far) {
      const x0 = f.x - f.w / 2, x1 = f.x + f.w / 2, z0 = f.z - f.d / 2, z1 = f.z + f.d / 2, podiumH = 6;
      const inward = Math.abs(f.x) > Math.abs(f.z) ? (f.x > 0 ? 'w' : 'e') : (f.z > 0 ? 'n' : 's');
      const rect = { x0, z0, x1, z1 };
      f.lot = { x0, z0, x1, z1, h: f.h, accent: f.accent, edges: { [inward]: true }, podium: podiumH, style: f.style, ring: false, far: true, seed: f.seed, solid: world.colliders.addBox(x0, z0, x1, z1, f.h + 5, 'building'), topY: f.h - 0.1,
        tiers: { podium: { ...rect, y0: 0, y1: podiumH }, tower: { ...rect, y0: podiumH, y1: f.h - 0.1 }, crown: null } };
      world.lots.push(f.lot);
    }
    world.farCount = far.length;
    // facade instances: a 6 m podium (shop band + door aperture) and the tower above it
    for (const f of far) {
      f.lot.tierIdx = farInst.length;
      farInst.push({ ...f, h: 6, y: 0, podium: 1 });
      farInst.push({ ...f, h: f.h - 6, y: 6, podium: 0 });
    }
    const L = 1475, T = 12; // boundary of the playable world, behind the hill rim (see terrain.js)
    world.colliders.addBox(-L - T, L, L + T, L + T, 400, 'wall'); world.colliders.addBox(-L - T, -L - T, L + T, -L, 400, 'wall');
    world.colliders.addBox(L, -L - T, L + T, L + T, 400, 'wall'); world.colliders.addBox(-L - T, -L - T, -L, L + T, 400, 'wall');
  }

  // Plaza centerpiece
  if (world.plaza) {
    const pz = world.plaza;
    world.colliders.addCircle(pz.cx, pz.cz, 6.5, 20, 'fountain');
    for (let t = 0; t < 8; t++) {
      const a = (t / 8) * TAU;
      world.lamps.push({ x: pz.cx + Math.cos(a) * 24, z: pz.cz + Math.sin(a) * 24, c: [1.0, 0.3, 0.85] });
    }
    for (let t = 0; t < 16; t++) {
      const a = (t / 16) * TAU + 0.2;
      trees.push({ x: pz.cx + Math.cos(a) * 28, z: pz.cz + Math.sin(a) * 28, s: R_(0.9, 1.3), hue: 0.2 });
      world.colliders.addCircle(pz.cx + Math.cos(a) * 28, pz.cz + Math.sin(a) * 28, 0.5, 12, 'tree');
    }
  }

  // Pedestrian streets on the closed road segments: bollard rows at both ends, a double tree line, benches and lamps
  // (own random stream so the rest of the city generation is unchanged)
  {
    const pr = mulberry32(4242), bol = [];
    for (const c of CUTS) {
      const r = cutRect(c), a0 = c.v ? r[1] : r[0], a1 = c.v ? r[3] : r[2], w0 = c.v ? r[0] : r[1], w1 = c.v ? r[2] : r[3], mid = (w0 + w1) / 2;
      const at = (a, w) => (c.v ? { x: w, z: a } : { x: a, z: w });
      for (const a of [a0 + 0.8, a1 - 0.8]) for (let w = w0 + 1.0; w <= w1 - 0.9; w += 1.6) { const q = at(a, w); bol.push(q); world.colliders.addCircle(q.x, q.z, 0.17, 1.0, 'bollard'); }
      for (let a = a0 + 7; a < a1 - 6; a += 9) {
        for (const side of [-1, 1]) { const q = at(a, mid + side * 5.6); trees.push({ x: q.x, z: q.z, s: 0.8 + pr() * 0.4, hue: pr() }); world.colliders.addCircle(q.x, q.z, 0.5, 12, 'tree'); }
        if (a + 4.5 < a1 - 4) { const b = at(a + 4.5, mid + 2.2), b2 = at(a + 4.5, mid - 2.2); benches.push({ x: b.x, z: b.z, ry: c.v ? -Math.PI / 2 : Math.PI }, { x: b2.x, z: b2.z, ry: c.v ? Math.PI / 2 : 0 }); }
      }
      for (let a = a0 + 12; a < a1 - 8; a += 22) { const q = at(a, mid + 3.4); world.lamps.push({ x: q.x, z: q.z, c: [1.0, 0.72, 0.45] }); }
      // subway entrance in the middle of the street (between two tree pairs, clear of the benches)
      { const sa = a0 + 7 + 9 * Math.max(0, Math.round(((a0 + a1) / 2 - a0 - 7) / 9)), q = at(sa, mid);
        (world.metro = world.metro || []).push({ x: q.x, z: q.z, v: c.v, name: STATION_NAMES[world.metro.length % STATION_NAMES.length] });
        const hw = 1.5, hl = 2.6, r0 = c.v ? [q.x - hw, q.z - hl, q.x + hw, q.z + hl] : [q.x - hl, q.z - hw, q.x + hl, q.z + hw];
        world.colliders.addBox(r0[0], r0[1], r0[2], r0[3], 3.2, 'station'); }
      (world.plazaStreets = world.plazaStreets || []).push({ rect: r, v: c.v });
    }
    // bus stops: one pole per block side along the north-south roads (east sidewalk), thin enough not to block the pavement
    world.busStops = [];
    for (let i = 0; i <= N; i++) for (let j = 0; j < N; j++) {
      if (!hasEdge(i, j, 0, 1)) continue;
      const x = roadC(i) + R / 2 + 0.6, z = (roadC(j) + roadC(j + 1)) / 2 + 6;
      world.busStops.push({ x, z, name: `${String.fromCharCode(65 + i)}${j + 1} 정류장` }); world.colliders.addCircle(x, z, 0.12, 3, 'busstop');
      // and one on the east-west road through the same node (south sidewalk)
      if (hasEdge(j, i, 1, 0)) { const x2 = (roadC(j) + roadC(j + 1)) / 2 - 6, z2 = roadC(i) + R / 2 + 0.6; world.busStops.push({ x: x2, z: z2, name: `${j + 1}${String.fromCharCode(65 + i)} 정류장` }); world.colliders.addCircle(x2, z2, 0.12, 3, 'busstop'); }
    }
    {
      const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 6).translate(0, 1.4, 0), new THREE.MeshStandardMaterial({ color: 0x3a3f4a, metalness: 0.6, roughness: 0.4 }), world.busStops.length);
      const sign = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.5, 0.42).translate(0.05, 2.55, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.6, 1).multiplyScalar(1.8), toneMapped: false }), world.busStops.length);
      const m4 = new THREE.Matrix4(); world.busStops.forEach((b, k) => { m4.makeTranslation(b.x, 0, b.z); pole.setMatrixAt(k, m4); sign.setMatrixAt(k, m4); });
      pole.frustumCulled = sign.frustumCulled = false; scene.add(pole, sign);
    }
    // station canopies: glass roof on posts, a dark stair well and a glowing line sign
    if (world.metro?.length) {
      const B = new Builder();
      for (const st of world.metro) {
        const ry = st.v ? 0 : Math.PI / 2, cs = Math.cos(ry), sn = Math.sin(ry), W = (lx, lz) => [st.x + lx * cs + lz * sn, st.z - lx * sn + lz * cs];
        const bx = (lx, y, lz, w, h, d, col, key = 'decor') => { const [x, z] = W(lx, lz); B.box(key, x, y, z, w, h, d, col, ry); };
        bx(0, 0.0, 0, 3.0, 0.05, 5.2, 0x050608);                       // stair well
        for (const sx of [-1.45, 1.45]) bx(sx, 0, 0, 0.12, 1.05, 5.2, 0x2c313c, 'steel');  // side walls
        for (const [px, pz] of [[-1.4, -2.5], [1.4, -2.5], [-1.4, 2.5], [1.4, 2.5]]) bx(px, 0, pz, 0.1, 3.0, 0.1, 0x2c313c, 'steel');
        bx(0, 3.0, 0, 3.3, 0.08, 5.5, 0x6f8fa8, 'decor');               // roof
        bx(0, 2.55, -2.62, 2.6, 0.4, 0.06, new THREE.Color(0.25, 0.85, 0.45).multiplyScalar(2.4), 'emit'); // line sign
        bx(0, 2.55, 2.62, 2.6, 0.4, 0.06, new THREE.Color(0.25, 0.85, 0.45).multiplyScalar(2.4), 'emit');
        world.fakeLights.push({ x: st.x, y: 0, z: st.z, c: [0.3, 1.0, 0.55], rad: 9 });
      }
      B.finish(scene);
    }
    if (bol.length) {
      const g = mergeGeometries([new THREE.CylinderGeometry(0.13, 0.15, 0.95, 8).translate(0, 0.475, 0), new THREE.CylinderGeometry(0.15, 0.15, 0.06, 8).translate(0, 0.98, 0)].map((x) => x.toNonIndexed()));
      const bm = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0x2a2d36, roughness: 0.5, metalness: 0.6, emissive: 0xffb060, emissiveIntensity: 0.25 }), bol.length);
      const m4 = new THREE.Matrix4(); bol.forEach((q, k) => { m4.makeTranslation(q.x, 0, q.z); bm.setMatrixAt(k, m4); });
      bm.castShadow = false; bm.receiveShadow = true; scene.add(bm);
    }
  }

  // ---- power grid: one fenced substation per zone (park corner, else the end of a pedestrian street) ----
  world.zoneOf = (x, z) => (Math.hypot(x, z) < 90 ? 0 : Math.abs(x) > Math.abs(z) ? (x > 0 ? 2 : 3) : (z > 0 ? 1 : 4));
  world.zoneOff = [false, false, false, false, false];
  world.substations = [];
  {
    const spots = [];
    for (const pk of world.parks) if (!pk.lake) spots.push({ x: pk.x0 + 7, z: pk.z0 + 5, ry: 0 });
    for (const c of CUTS) { const r = cutRect(c); spots.push(c.v ? { x: (r[0] + r[2]) / 2 - 5, z: r[1] + 3.6, ry: 0 } : { x: r[0] + 3.6, z: (r[1] + r[3]) / 2 - 5, ry: Math.PI / 2 }); }
    if (world.plaza) spots.push({ x: world.plaza.x0 + 8, z: world.plaza.z0 + 6, ry: 0 });
    const B = new Builder();
    for (let zn = 0; zn < 5; zn++) {
      const sp = spots.filter((q) => world.zoneOf(q.x, q.z) === zn).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
      if (!sp) continue;
      const cs = Math.cos(sp.ry), sn = Math.sin(sp.ry), W = (lx, lz) => [sp.x + lx * cs + lz * sn, sp.z - lx * sn + lz * cs];
      const bx = (lx, y, lz, w, h, d, col, key = 'decor') => { const [x, z] = W(lx, lz); B.box(key, x, y, z, w, h, d, col, sp.ry); };
      bx(0, 0, 0, 7.2, 0.15, 4.2, 0x2a2c32);
      for (const [lx, lz, w, d] of [[0, -2.05, 7.2, 0.06], [0, 2.05, 7.2, 0.06], [-3.55, 0, 0.06, 4.2], [3.55, 0, 0.06, 4.2]]) bx(lx, 0.15, lz, w, 2.1, d, 0x6a7280, 'steel'); // fence
      for (const lx of [-1.6, 1.6]) { bx(lx, 0.15, 0, 2.0, 2.2, 1.8, 0x3a4048, 'steel'); for (let k = 0; k < 4; k++) bx(lx, 0.6 + k * 0.4, 0.92, 1.6, 0.05, 0.04, new THREE.Color(1, 0.6, 0.15).multiplyScalar(1.6), 'emit'); }
      bx(0, 1.2, -2.12, 1.2, 0.5, 0.04, new THREE.Color(1, 0.85, 0.1).multiplyScalar(2.0), 'emit');            // high-voltage sign
      const [x0, z0] = W(-3.6, -2.1), [x1, z1] = W(3.6, 2.1);
      const col = world.colliders.addBox(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), 2.3, 'substation');
      world.substations.push({ zone: zn, x: sp.x, z: sp.z, ry: sp.ry, col });
    }
    B.finish(scene);
  }
  // switch a zone's street lighting on/off (lamp heads, lamp glare sprites, fake ground lights; signals handled per frame)
  world.setZonePower = (zn, on) => {
    world.zoneOff[zn] = !on;
    const H = world.lampHeads, c = new THREE.Color();
    if (H) world.lamps.forEach((l, k) => { if (world.zoneOf(l.x, l.z) === zn) H.setColorAt(k, on ? c.setRGB(l.c[0] * 3, l.c[1] * 3, l.c[2] * 3) : c.setRGB(0.05, 0.05, 0.06)); });
    if (H && H.instanceColor) H.instanceColor.needsUpdate = true;
    const G2 = world.glare; if (G2) { const a = G2.colAttr; for (let i = 0; i < world.tlGlareStart; i++) { const d = G2.data[i]; if (world.zoneOf(d.x, d.z) === zn) a.setW(i, on ? d.size : 0); } a.needsUpdate = true; }
  };

  // ---- Build instanced facade mesh ----
  function makeFacadeMesh(list, fog = true) {
    const m = new THREE.InstancedMesh(boxGeo, facadeMat, list.length);
    const info = new Float32Array(list.length * 4);
    const mat4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3();
    list.forEach((t, k) => {
      pos.set(t.x, t.y || 0, t.z);
      s.set(t.w, t.h, t.d);
      mat4.compose(pos, q, s);
      m.setMatrixAt(k, mat4);
      m.setColorAt(k, t.color);
      info[k * 4] = t.seed; info[k * 4 + 1] = t.style; info[k * 4 + 2] = t.accent; info[k * 4 + 3] = (t.podium ? 1 : 0) + 2 * (t.tex | 0);
    });
    m.geometry = boxGeo.clone();
    m.geometry.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
    m.geometry.setAttribute('aDoor', new THREE.InstancedBufferAttribute(new Float32Array(list.length * 4), 4));
    m.castShadow = true; m.receiveShadow = true;
    m.frustumCulled = false;
    return m;
  }
  const facade = makeFacadeMesh(tiers);
  scene.add(facade);
  const farMesh = makeFacadeMesh(farInst);
  farMesh.castShadow = false; farMesh.receiveShadow = false;
  scene.add(farMesh);

  // Rooftop props (dark, flat)
  {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0.4 });
    const m = new THREE.InstancedMesh(boxGeo, mat, props.length);
    const mat4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3(), c = new THREE.Color();
    props.forEach((p, k) => {
      pos.set(p.x, p.y, p.z); s.set(p.w, p.h, p.d);
      mat4.compose(pos, q, s); m.setMatrixAt(k, mat4); m.setColorAt(k, c.set(p.color));
    });
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    scene.add(m);
  }

  // Signs
  const atlas = createSignAtlas();
  {
    const geo = new THREE.PlaneGeometry(1, 1);
    const cells = new Float32Array(signInst.length * 4);
    const m = new THREE.InstancedMesh(geo, createSignMaterial(atlas), signInst.length);
    const mat4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3(), e = new THREE.Euler();
    signInst.forEach((sg, k) => {
      pos.set(sg.x, sg.y, sg.z); s.set(sg.sx, sg.sy, 1); e.set(0, sg.rotY, 0); q.setFromEuler(e);
      mat4.compose(pos, q, s); m.setMatrixAt(k, mat4);
      cells[k * 4] = sg.cell % 4; cells[k * 4 + 1] = 3 - Math.floor(sg.cell / 4); cells[k * 4 + 2] = sg.seed;
    });
    geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 4));
    m.frustumCulled = false;
    m.renderOrder = 2;
    scene.add(m);
    world.signMesh = m;
  }

  // Holo billboards
  if (holoInst.length) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const attr = new Float32Array(holoInst.length * 4);
    const m = new THREE.InstancedMesh(geo, createHoloMaterial(), holoInst.length);
    const mat4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3(), e = new THREE.Euler();
    holoInst.forEach((h, k) => {
      pos.set(h.x, h.y, h.z); s.set(h.w, h.h, 1); e.set(0, h.rotY, 0); q.setFromEuler(e);
      mat4.compose(pos, q, s); m.setMatrixAt(k, mat4); attr[k * 4] = h.seed;
    });
    geo.setAttribute('aHolo', new THREE.InstancedBufferAttribute(attr, 4));
    m.frustumCulled = false; m.renderOrder = 3;
    scene.add(m);
  }

  // ---- Street lamps along sidewalks ----
  const lampCols = [[1.0, 0.62, 0.28], [0.55, 0.85, 1.0], [1.0, 0.3, 0.85]];
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j < N; j++) {
      // lamps along road i (constant x) between nodes j and j+1, and along road j between i,i+1
      for (let k = 0; k < 3; k++) {
        const t = 0.2 + k * 0.3;
        const col = lampCols[(i + j + k) % 3];
        const z = roadC(j) + R / 2 + (blockLen(j) - R) * t;
        const x = roadC(i);
        world.lamps.push({ x: x + (R / 2 + SW / 2) * (k % 2 ? 1 : -1), z, c: col });
        const z2 = roadC(i) + R / 2 + (blockLen(i) - R) * t;
        const x2 = roadC(j);
        world.lamps.push({ x: z2, z: x2 + (R / 2 + SW / 2) * (k % 2 ? -1 : 1), c: col });
      }
    }
  }
  {
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.16, 8.5, 6); poleGeo.translate(0, 4.25, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x1b1e26, roughness: 0.6, metalness: 0.7 });
    const poles = new THREE.InstancedMesh(poleGeo, mat, world.lamps.length);
    const headGeo = new THREE.BoxGeometry(1.5, 0.12, 0.45); headGeo.translate(0.7, 8.55, 0);
    const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), world.lamps.length);
    world.lampHeads = heads;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), c = new THREE.Color();
    world.lamps.forEach((l, k) => {
      // face arm toward road
      const rx0 = roadC(roadIdx(l.x)), rz0 = roadC(roadIdx(l.z)), ry = Math.abs(l.x - rx0) < R ? (l.x > rx0 ? Math.PI : 0) : (l.z > rz0 ? -Math.PI / 2 : Math.PI / 2);
      e.set(0, ry, 0); q.setFromEuler(e); p.set(l.x, 0, l.z);
      m4.compose(p, q, one); poles.setMatrixAt(k, m4); heads.setMatrixAt(k, m4);
      heads.setColorAt(k, c.setRGB(l.c[0] * 3, l.c[1] * 3, l.c[2] * 3));
      const hx = l.x + Math.cos(ry) * 0.7 * 2, hz = l.z - Math.sin(ry) * 0.7 * 2;
      l.hx = hx; l.hz = hz;
      addGlare(hx, 8.4, hz, l.c.map((v) => v * 0.5), 15);
      addFake(hx, 0, hz, l.c, 14, 1.0);
      world.colliders.addCircle(l.x, l.z, 0.25, 9, 'lamp');
    });
    poles.castShadow = true; poles.frustumCulled = false; heads.frustumCulled = false; (world.dayMats = world.dayMats || []).push(heads.material);
    scene.add(poles, heads);
  }

  // ---- Traffic lights at intersections ----
  const tlLamps = []; // glare indices to recolor: {idx, axis, slot}
  world.tlGlareStart = glares.length;
  for (let i = 0; i <= N; i++) {
    for (let j = 0; j <= N; j++) {
      const [x, z] = nodePos(i, j);
      world.intersections.push({ i, j, x, z });
      const corners = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
      corners.forEach(([sx, sz], k) => {
        const px = x + sx * (R / 2 + 1), pz = z + sz * (R / 2 + 1);
        props.length; // (no-op)
        world.colliders.addCircle(px, pz, 0.3, 7, 'tl');
        // each pole shows two heads: facing along x and along z
        tlLamps.push({ x: px, z: pz, sx, sz });
        addGlare(px, 6.0, pz, [0.2, 1.0, 0.3], 11);
        addGlare(px - sx * 0.0, 6.0, pz, [0.2, 1.0, 0.3], 11);
      });
    }
  }
  world.tlGlareEnd = glares.length;
  {
    const geo = new THREE.BoxGeometry(0.45, 1.3, 0.45); geo.translate(0, 6, 0);
    const pole = new THREE.CylinderGeometry(0.09, 0.12, 6.4, 6); pole.translate(0, 3.2, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.6, metalness: 0.6 });
    const a = new THREE.InstancedMesh(geo, mat, tlLamps.length), b = new THREE.InstancedMesh(pole, mat, tlLamps.length);
    const m4 = new THREE.Matrix4();
    tlLamps.forEach((t, k) => { m4.makeTranslation(t.x, 0, t.z); a.setMatrixAt(k, m4); b.setMatrixAt(k, m4); });
    a.frustumCulled = false; b.frustumCulled = false; b.castShadow = true;
    scene.add(a, b);
  }

  // ---- Trees ----
  if (trees.length) {
    const trunkG = new THREE.CylinderGeometry(0.18, 0.28, 3.4, 6); trunkG.translate(0, 1.7, 0);
    const leafG = new THREE.IcosahedronGeometry(2.1, 1); leafG.translate(0, 5, 0);
    const trunkM = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: 0x2a1f1b, roughness: 0.9 }), trees.length);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, flatShading: true });
    const leafM = new THREE.InstancedMesh(leafG, leafMat, trees.length);
    patchTreeSway(leafMat);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    trees.forEach((t, k) => {
      p.set(t.x, 0, t.z); s.set(t.s, t.s * R_(0.9, 1.2), t.s);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R_(0, TAU));
      m4.compose(p, q, s); trunkM.setMatrixAt(k, m4); leafM.setMatrixAt(k, m4);
      c.setHSL(0.36 + t.hue * 0.15, 0.55, 0.12 + t.hue * 0.07); leafM.setColorAt(k, c);
    });
    trunkM.castShadow = leafM.castShadow = true; trunkM.receiveShadow = leafM.receiveShadow = true;
    trunkM.frustumCulled = leafM.frustumCulled = false;
    scene.add(trunkM, leafM);
  }
  // benches
  if (benches.length) {
    const g = new THREE.BoxGeometry(2, 0.12, 0.55); g.translate(0, 0.55, 0);
    const bm = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0x3a2e28, roughness: 0.8 }), benches.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    benches.forEach((b, k) => { e.set(0, b.ry, 0); q.setFromEuler(e); p.set(b.x, 0, b.z); m4.compose(p, q, one); bm.setMatrixAt(k, m4); });
    bm.castShadow = true; scene.add(bm);
  }

  // ---- Plaza landmark: holographic tower ----
  const landmark = new THREE.Group();
  if (world.plaza) {
    const { cx, cz } = world.plaza;
    landmark.position.set(cx, 0, cz);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x0a0c14, roughness: 0.25, metalness: 0.9 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 8.5, 1.1, 48), baseMat); base.position.y = 0.55; base.castShadow = base.receiveShadow = true;
    landmark.add(base);
    const water = new THREE.Mesh(new THREE.CircleGeometry(6.8, 48), new THREE.MeshStandardMaterial({ color: 0x03060c, roughness: 0.02, metalness: 0.95 }));
    water.rotation.x = -Math.PI / 2; water.position.y = 1.12; landmark.add(water);
    const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.9, 1).multiplyScalar(3), toneMapped: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(7.6, 0.12, 8, 80), ringMat); ring.rotation.x = Math.PI / 2; ring.position.y = 1.15; landmark.add(ring);
    const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.2, 0.85).multiplyScalar(2.5) });
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.9, 38, 12), coreMat); core.position.y = 20; landmark.add(core);
    // rotating hologram rings
    const rings = [];
    for (let k = 0; k < 6; k++) {
      const m = new THREE.Mesh(new THREE.TorusGeometry(2.6 + k * 0.9, 0.09, 6, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(k % 2 ? [0.2, 0.9, 1] : [1, 0.25, 0.9]).multiplyScalar(2.2), transparent: true, opacity: 0.9 }));
      m.position.y = 8 + k * 5.2; m.rotation.x = Math.PI / 2; landmark.add(m); rings.push(m);
    }
    // light beam
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 4.5, 360, 24, 1, true), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      uniforms: { uTime: timeUniform },
      vertexShader: 'varying vec2 vUv;varying float vY;void main(){vUv=uv;vY=position.y;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'varying vec2 vUv;varying float vY;uniform float uTime;void main(){float a=(1.-vUv.y)*(0.5+.5*sin(vUv.y*80.-uTime*3.))*.25+ .06;gl_FragColor=vec4(vec3(.7,.25,1.)*a*2.2,a*.9);}',
    }));
    beam.position.y = 180; landmark.add(beam);
    scene.add(landmark);
    world.landmark = { group: landmark, rings, core };
    addGlare(cx, 22, cz, [1.0, 0.3, 0.9], 90);
    addGlare(cx, 4, cz, [0.3, 0.9, 1.0], 60);
    addFake(cx, 0, cz, [0.6, 0.35, 1.0], 38, 1.2);
    addFake(cx + 6, 0, cz, [0.2, 0.9, 1.0], 22, 1.0);
  }

  // ---- Street props (sidewalk): vending machines, bins, hydrants ----
  {
    const vm = [], bins = [];
    for (let i = 0; i <= N; i++) for (let j = 0; j < N; j++) {
      for (let k = 0; k < 3; k++) {
        const t = R_(0.08, 0.92), side = rnd() < 0.5 ? 1 : -1;
        const along = roadC(j) + R / 2 + (blockLen(j) - R) * t;
        const off = R / 2 + SW - 0.9;
        if (rnd() < 0.5) vm.push({ x: roadC(i) + side * off, z: along, ry: side > 0 ? Math.PI / 2 : -Math.PI / 2, ci: Math.floor(R_(0, 6)) });
        else bins.push({ x: roadC(i) + side * (off - 0.2), z: along });
      }
    }
    const vg = new THREE.BoxGeometry(0.9, 1.9, 0.8); vg.translate(0, 0.95, 0);
    const vmesh = new THREE.InstancedMesh(vg, new THREE.MeshBasicMaterial({ color: 0xffffff }), vm.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), c = new THREE.Color();
    vm.forEach((v, k) => { e.set(0, v.ry, 0); q.setFromEuler(e); p.set(v.x, 0, v.z); m4.compose(p, q, one); vmesh.setMatrixAt(k, m4); const a = accentColor(v.ci); vmesh.setColorAt(k, c.setRGB(a[0] * 0.38 + 0.03, a[1] * 0.38 + 0.03, a[2] * 0.38 + 0.03)); world.colliders.addCircle(v.x, v.z, 0.5, 2, 'vm'); addGlare(v.x, 1.2, v.z, a.map((x) => x * 0.35), 9); });
    vmesh.castShadow = true; vmesh.frustumCulled = false; scene.add(vmesh);
    const bg = new THREE.CylinderGeometry(0.32, 0.28, 0.9, 10); bg.translate(0, 0.45, 0);
    const bmesh = new THREE.InstancedMesh(bg, new THREE.MeshStandardMaterial({ color: 0x2c3340, roughness: 0.5, metalness: 0.6 }), bins.length);
    bins.forEach((b, k) => { p.set(b.x, 0, b.z); m4.compose(p, new THREE.Quaternion(), one); bmesh.setMatrixAt(k, m4); });
    world.bins = { mesh: bmesh, list: bins };
    bmesh.castShadow = true; bmesh.frustumCulled = false; scene.add(bmesh);
  }

  // ---- Glare points ----
  {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(glares.length * 3), col = new Float32Array(glares.length * 4), bl = new Float32Array(glares.length * 2);
    glares.forEach((g, k) => {
      pos.set([g.x, g.y, g.z], k * 3);
      col.set([g.c[0], g.c[1], g.c[2], g.size], k * 4);
      bl.set([g.blink, g.phase], k * 2);
    });
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aCol', new THREE.BufferAttribute(col, 4));
    geo.setAttribute('aBlink', new THREE.BufferAttribute(bl, 2));
    const pts = new THREE.Points(geo, createGlareMaterial());
    pts.frustumCulled = false; pts.renderOrder = 4;
    scene.add(pts);
    world.glare = { points: pts, colAttr: geo.getAttribute('aCol'), data: glares };
  }

  // Traffic light state: returns phase for axis. Cycle 16s: x-axis green 0-6, yellow 6-8 ; z-axis green 8-14, yellow 14-16
  world.lightState = (axis, t) => {
    const c = ((t % 16) + 16) % 16;
    if (axis === 'x') return c < 6 ? 'G' : c < 8 ? 'Y' : 'R';
    return c >= 8 && c < 14 ? 'G' : c >= 14 ? 'Y' : 'R';
  };

  // Spawn points for player
  world.spawn = { x: roadC(3) + R / 2 + SW / 2, z: roadC(5) + 30, ry: Math.PI };

  // ---- fake light selection (nearest to focus) ----
  const sorted = [];
  world.updateFakeLights = (fx, fz) => {
    const arr = world.fakeLights;
    sorted.length = 0;
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      if (world.zoneOff[world.zoneOf(a.x, a.z)]) continue;
      const dx = a.x - fx, dz = a.z - fz;
      sorted.push([dx * dx + dz * dz, a]);
    }
    sorted.sort((a, b) => a[0] - b[0]);
    const u = ground.userData.uniforms;
    for (let k = 0; k < 24; k++) {
      const s = sorted[k];
      if (!s || s[0] > 170 * 170) { u.uFL.value[k].set(0, -999, 0, 1); continue; }
      const a = s[1];
      u.uFL.value[k].set(a.x, a.y + 1, a.z, a.rad);
      u.uFC.value[k].set(a.c[0], a.c[1], a.c[2]);
    }
  };

  // ---- traffic-light bulb recoloring ----
  const tlStart = world.tlGlareStart;
  world.updateTrafficLights = (t) => {
    const col = world.glare.colAttr;
    let idx = tlStart;
    for (const it of world.intersections) {
      const dark = world.zoneOff[world.zoneOf(it.x, it.z)];
      for (let k = 0; k < 4; k++) {
        // 2 glares per corner: first shows x-axis state, second z-axis (offset in z/x)
        for (let a = 0; a < 2; a++) {
          const st = world.lightState(a === 0 ? 'x' : 'z', t);
          const c = st === 'G' ? [0.2, 1.0, 0.35] : st === 'Y' ? [1.0, 0.75, 0.1] : [1.0, 0.1, 0.1];
          if (dark) col.setXYZW(idx, 0, 0, 0, 0); else col.setXYZW(idx, c[0] * 1.2, c[1] * 1.2, c[2] * 1.2, 12);
          idx++;
        }
      }
    }
    col.needsUpdate = true;
  };

  world.animate = (dt, t, focus) => {
    timeUniform.value = t;
    if (world.landmark) {
      world.landmark.rings.forEach((r, k) => { r.rotation.z = t * (0.4 + k * 0.15) * (k % 2 ? -1 : 1); r.rotation.x = Math.PI / 2 + Math.sin(t * 0.5 + k) * 0.25; });
    }
    sky.position.copy(focus);
  };

  // road helpers
  world.isRoad = (x, z) => {
    if (Math.abs(x) > HALF + R / 2 || Math.abs(z) > HALF + R / 2) return false;
    if (inCut(x, z)) return false;
    return Math.abs(x - roadC(roadIdx(x))) < R / 2 || Math.abs(z - roadC(roadIdx(z))) < R / 2;
  };
  world.facade = facade;
  buildEntrances(world, scene);
  for (const l of world.lots) {
    if (!l.door || l.tierIdx == null) continue;
    const arr = (l.far ? farMesh : facade).geometry.attributes.aDoor, d = l.door, along = d.nx !== 0 ? l.z0 : l.x0;
    arr.setXYZW(l.tierIdx, along, d.bay, { w: 0, e: 1, n: 2, s: 3 }[d.side], 1); arr.needsUpdate = true;
  }
  buildWaters(world, scene);
  world.objects = scene.children.slice(objStart);
  return world;
}

function patchTreeSway(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = timeUniform;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {vec4 wp=instanceMatrix*vec4(transformed,1.);float sw=sin(uTime*1.3+instanceMatrix[3].x*.7+instanceMatrix[3].z*.5)*.08*max(transformed.y-3.,0.)*.4;transformed.x+=sw;transformed.z+=sw*.6;}`);
  };
  mat.customProgramCacheKey = () => 'tree-sway';
}

// ---------- Building entrances (visual markers; physical doors live in building.js) ----------
export const BAY = 3.2;
export function doorSpec(l) {
  const sides = [['w', l.x0, 0, -1, 0], ['e', l.x1, 0, 1, 0], ['n', 0, l.z0, 0, -1], ['s', 0, l.z1, 0, 1]].filter((e) => l.edges[e[0]]);
  if (!sides.length) return null;
  const [side, ex, ez, nx, nz] = sides[Math.floor((l.seed * 7) % sides.length)];
  const alongZ = nx !== 0, len = alongZ ? l.z1 - l.z0 : l.x1 - l.x0, start = alongZ ? l.z0 : l.x0;
  const nb = Math.max(3, Math.round(len / BAY)), bay = len / nb, mid = Math.floor(nb / 2);
  const c = start + (mid + 0.5) * bay;
  return { side, nx, nz, bayIndex: mid, bays: nb, bay, px: alongZ ? ex : c, pz: alongZ ? c : ez };
}
const NAME_A = ['NEXUS', 'ORCHID', 'HELIX', 'KAIROS', 'AURORA', 'VERTEX', 'NOVA', 'SYNAPSE', 'ONYX', 'LOTUS', 'ARCADIA', 'ZENITH', 'CRIMSON', 'ECHO', 'PRISM', 'ATLAS', 'VORTEX', 'HALCYON'];
const NAME_B = ['TOWER', 'HOTEL', 'CORP', 'PLAZA', 'SUITES', 'LABS', 'RESIDENCE', 'FINANCIAL', 'CENTER', 'APARTMENTS'];
function nameTexture(name, color) {
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 112;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgba(3,4,10,.92)'; g.fillRect(0, 0, 512, 112);
  const c = `rgb(${color.map((v) => Math.round(Math.min(1, v) * 255)).join(',')})`;
  g.strokeStyle = c; g.lineWidth = 5; g.shadowColor = c; g.shadowBlur = 14; g.strokeRect(8, 8, 496, 96);
  g.font = '900 46px "Pretendard","Noto Sans KR",Arial,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#fff'; g.shadowBlur = 16; g.fillText(name, 256, 60);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function buildEntrances(world, scene) {
  const lots = world.lots.filter((l) => l.model || l.far || l.ring || (Math.min(l.x1 - l.x0, l.z1 - l.z0) >= 17 && l.h >= 20));
  world.enterables = [];
  const B = new Builder();
  const signs = new Map();
  lots.forEach((l, id) => {
    const d = doorSpec(l); if (!d) return;
    const accent = accentColor(l.accent), th = Math.atan2(d.nx, d.nz), cs = Math.cos(th), sn = Math.sin(th);
    const W = (lx, lz) => [d.px + lx * cs + lz * sn, d.pz - lx * sn + lz * cs];
    const name = NAME_A[(id * 5 + Math.floor(l.seed)) % NAME_A.length] + ' ' + NAME_B[(id * 3 + Math.floor(l.seed * 3)) % NAME_B.length];
    l.name = name; l.id = id; l.door = d;
    const em = new THREE.Color(...accent).multiplyScalar(2.8);
    const bx = (lx, y, lz, w, h, dd, col, key = 'emit') => { const [wx, wz] = W(lx, lz); B.box(key, wx, y, wz, w, h, dd, col, th); };
    bx(-1.3, 0, 0.1, 0.14, 3.1, 0.22, em); bx(1.3, 0, 0.1, 0.14, 3.1, 0.22, em); bx(0, 3.1, 0.1, 2.74, 0.14, 0.22, em);
    bx(0, 0.02, 0.9, 3.4, 0.02, 1.8, new THREE.Color(1, 0.75, 0.5).multiplyScalar(0.55));
    bx(0, 3.55, 1.35, 6.2, 0.18, 2.8, new THREE.Color(0.04, 0.05, 0.08), 'decor'); bx(0, 3.44, 2.7, 5.8, 0.06, 0.06, em);
    // lit approach path from the pavement, bollards and a warm canopy light so the entrance reads from across the street
    bx(0, 0.025, 5.4, 2.0, 0.02, 7.2, new THREE.Color(...accent).multiplyScalar(0.7));
    for (const sx of [-1.4, 1.4]) for (const lz of [3.0, 6.5]) { bx(sx, 0, lz, 0.14, 0.9, 0.14, new THREE.Color(0.05, 0.06, 0.09), 'decor'); bx(sx, 0.9, lz, 0.18, 0.1, 0.18, em); }
    bx(0, 3.35, 1.5, 3.2, 0.04, 2.0, new THREE.Color(1, 0.86, 0.62).multiplyScalar(2.2));
    const sc = new THREE.Color(...accent);
    let sg = signs.get(name); if (!sg) { sg = { tex: nameTexture(name, accent), list: [] }; signs.set(name, sg); }
    const [sx, sz] = W(0, 0.14); sg.list.push({ x: sx, y: 5.0, z: sz, th });
    world.fakeLights.push({ x: d.px + d.nx * 2.5, y: 0, z: d.pz + d.nz * 2.5, c: accent.map((v) => v * 1.2), rad: 12 });
    world.enterables.push({ id, name, x: d.px + d.nx * 2.2, z: d.pz + d.nz * 2.2, nx: d.nx, nz: d.nz, lot: l, accent, door: d });
  });
  B.finish(scene);
  for (const sg of signs.values()) {
    const geos = sg.list.map((p) => { const g = new THREE.PlaneGeometry(6.2, 1.35); g.rotateY(p.th); g.translate(p.x, p.y, p.z); return g; });
    const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshBasicMaterial({ map: sg.tex, toneMapped: false, transparent: true }));
    m.frustumCulled = false; scene.add(m);
  }
}

// Water: layered noise-bump surface, Fresnel sky reflection (glass IOR 1.3), teal absorption/emission body, shoreline foam and
// scrolling caustics. Ported from the node setup of the supplied "Water Shader Addon Free" (chuck cg, GPL-2.0-or-later).
let causticTex = null;
function buildWaters(world, scene) {
  if (!causticTex) causticTex = groundTex(causticUrl, false);
  for (const w of world.waters) {
    const W = w.x1 - w.x0, D = w.z1 - w.z0;
    const mat = new THREE.ShaderMaterial({
      fog: true, transparent: true, depthWrite: false,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: timeUniform, uNight: nightU, uRect: { value: new THREE.Vector4(w.x0, w.z0, w.x1, w.z1) }, tCaus: { value: causticTex }, uSun: skyU.uSun, uMoon: skyU.uMoon, uRip: { value: ripU.value } }]),
      vertexShader: 'varying vec3 vP;\n#include <fog_pars_vertex>\nvoid main(){vP=(modelMatrix*vec4(position,1.)).xyz;vec4 mvPosition=viewMatrix*vec4(vP,1.);gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}',
      fragmentShader: `${GLSL_NOISE}uniform float uTime,uNight;uniform vec4 uRect;uniform sampler2D tCaus;uniform vec3 uSun,uMoon;varying vec3 vP;
        #include <fog_pars_fragment>
        // wave height: two drifting noise layers (the add-on animates a 4D noise; the W axis becomes this slow drift)
        uniform vec4 uRip[12];
        // moving swimmers / boats: each slot is an expanding ring packet that fades out (spreads at ~2 m/s, ~3 s life)
        float rip(vec2 p){float s=0.;for(int i=0;i<12;i++){vec4 q=uRip[i];float age=uTime-q.z;if(age<0.||age>3.2)continue;float r=length(p-q.xy),f=age*2.1,d=r-f;
          s+=q.w*sin(d*8.5)*exp(-d*d*1.1)*exp(-age*.9)/(1.+r*0.0+ (f*.55));}return s*.1;}
        float hgt(vec2 p){float t=uTime*.05;return fbm(p*.42+vec2(t*5.,t*2.))*.6+fbm(p*.95-vec2(t*3.,-t*4.))*.4+rip(p);}
        void main(){
          vec2 p=vP.xz;float t=uTime*.05;
          float e=.1,h=hgt(p),hx=hgt(p+vec2(e,0.)),hz=hgt(p+vec2(0.,e));
          float flat=smoothstep(8.,60.,length(cameraPosition-vP));   // far water: calmer normals so the sky reflection does not shimmer into speckle
          vec3 N=normalize(vec3(-(hx-h)/e*mix(.7,.2,flat),1.,-(hz-h)/e*mix(.7,.2,flat)));
          vec3 V=normalize(cameraPosition-vP);float ndv=max(dot(N,V),0.);
          float F=.017+.983*pow(1.-ndv,5.);                       // Fresnel for IOR 1.3
          vec3 R=reflect(-V,N);float ry=clamp(R.y,0.,1.);
          vec3 sky=mix(mix(vec3(.60,.72,.84),vec3(.18,.36,.66),ry),
                       mix(vec3(.14,.07,.24),vec3(.02,.03,.09),ry)+vec3(.9,.25,.8)*smoothstep(0.,.2,R.y)*(1.-smoothstep(.2,.45,R.y))*.12+vec3(.2,.7,1.)*smoothstep(.1,.35,R.y)*(1.-smoothstep(.35,.6,R.y))*.16,uNight);
          float glint=pow(max(dot(R,normalize(uSun)),0.),160.)*(1.-uNight)*3.5+pow(max(dot(R,normalize(uMoon)),0.),120.)*uNight*1.6;
          // body: absorption colour (.28,.74,.74) and a faint teal emission (.21,.36,.32 x .12), darker at night
          float depthN=.5+.5*h;
          vec3 body=mix(vec3(.05,.13,.15),vec3(.12,.30,.30),depthN)*mix(1.,.28,uNight)+vec3(.21,.36,.32)*.12;
          // caustics: two scrolled copies of the texture, ramp 0.018 -> 1, tinted like the add-on's caustics colour
          float c1=texture2D(tCaus,p*.06+vec2(t*1.9,t*.7)).r,c2=texture2D(tCaus,p*.045-vec2(t*1.2,-t*1.6)+1.3).r;
          float caus=smoothstep(.018,1.,min(c1,c2)*1.7);
          body+=caus*vec3(1.09,1.78,2.0)*.07*mix(1.,.55,uNight);
          vec3 c=mix(body,sky,F)+glint;
          // foam along the shore: proximity to the rectangle's edge drives a noise ramp (0.214 -> 0.718), gamma-shaped
          float dEdge=min(min(p.x-uRect.x,uRect.z-p.x),min(p.y-uRect.y,uRect.w-p.y));
          float prox=1.-smoothstep(.2,3.4,dEdge);
          float nz=fbm(p*1.15+vec2(t*4.,t*2.))*.7+fbm(p*3.1-vec2(t*6.,0.))*.3;
          float foam=pow(smoothstep(.214,.718,nz+prox*.45-.15),1.6)*prox;
          c=mix(c,vec3(.92,.96,1.)*mix(1.,.5,uNight),clamp(foam,0.,1.)*.9);
          float a=clamp(.62+.33*F+foam*.5+glint*.3,0.,1.);
          gl_FragColor=vec4(c,a);
          #include <fog_fragment>
        }`,
    });
    // basin floor under the transparent surface: shallow teal at the shore, deep dark in the middle, lit by caustics
    const floorMat = new THREE.ShaderMaterial({
      fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: timeUniform, uNight: nightU, uRect: { value: new THREE.Vector4(w.x0, w.z0, w.x1, w.z1) }, tCaus: { value: causticTex } }]),
      vertexShader: 'varying vec3 vP;\n#include <fog_pars_vertex>\nvoid main(){vP=(modelMatrix*vec4(position,1.)).xyz;vec4 mvPosition=viewMatrix*vec4(vP,1.);gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}',
      fragmentShader: `${GLSL_NOISE}uniform float uTime,uNight;uniform vec4 uRect;uniform sampler2D tCaus;varying vec3 vP;
        #include <fog_pars_fragment>
        void main(){
          vec2 p=vP.xz;float t=uTime*.05;
          float dE=min(min(p.x-uRect.x,uRect.z-p.x),min(p.y-uRect.y,uRect.w-p.y));
          float depth=smoothstep(0.,14.,dE);
          vec3 shallow=vec3(.12,.30,.30),deep=vec3(.01,.05,.08);
          vec3 c=mix(shallow,deep,depth)*(.8+.4*fbm(p*.5));
          float c1=texture2D(tCaus,p*.06+vec2(t*1.9,t*.7)).r,c2=texture2D(tCaus,p*.045-vec2(t*1.2,-t*1.6)+1.3).r;
          c+=smoothstep(.018,1.,min(c1,c2)*1.7)*vec3(1.09,1.78,2.0)*.22*(1.-.6*depth);
          c*=mix(1.,.3,uNight);
          gl_FragColor=vec4(c,1.);
          #include <fog_fragment>
        }`,
    });
    liveUniforms(mat); liveUniforms(floorMat);
    const fm = new THREE.Mesh(new THREE.PlaneGeometry(W, D, 1, 1).rotateX(-Math.PI / 2), floorMat);
    fm.position.set((w.x0 + w.x1) / 2, w.y - 0.02, (w.z0 + w.z1) / 2); fm.renderOrder = 0; scene.add(fm);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, D, 1, 1).rotateX(-Math.PI / 2), mat);
    m.position.set((w.x0 + w.x1) / 2, w.y, (w.z0 + w.z1) / 2); m.renderOrder = 1; scene.add(m); w.mesh = m;
  }
}
