import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const tex = (a, b, seam, size = 256) => {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  g.fillStyle = a; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${b},${Math.random() * 0.12})`; g.fillRect(Math.random() * size, Math.random() * size, 2, 2); }
  g.strokeStyle = seam; g.lineWidth = 3; g.strokeRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
};
// Interior surfaces: the decor material keeps its per-box vertex colour as a tint and multiplies a procedural pattern chosen by
// a per-vertex surface id (0 plaster, 1 wood planks, 2 tile, 3 carpet, 4 concrete); ceilings (faces looking down) get a panel grid.
// Pattern coordinates are world metres, so nothing needs UVs or texture memory.
export const SURF = { plaster: 0, wood: 1, tile: 2, carpet: 3, concrete: 4 };
// breached wall openings (world-space boxes): interior surfaces inside one are not drawn. Filled by breach.js with the holes near the camera.
export const HOLES = 16;
export const holeCU = { value: Array.from({ length: HOLES }, () => new THREE.Vector4(0, -999, 0, 0)) };
export const holeHU = { value: Array.from({ length: HOLES }, () => new THREE.Vector4()) };
function surfaceMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.12, envMapIntensity: 1.1 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHoleC = holeCU; sh.uniforms.uHoleH = holeHU;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aSurf;attribute vec2 aSUv;varying float vSurf;varying vec2 vSUv;varying float vSNy;varying vec3 vHWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf=aSurf;vSUv=aSUv;vSNy=objectNormal.y;vHWP=(modelMatrix*vec4(transformed,1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying float vSurf;varying vec2 vSUv;varying float vSNy;varying vec3 vHWP;uniform vec4 uHoleC[16];uniform vec4 uHoleH[16];
      float sh1(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float sn2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(sh1(i),sh1(i+vec2(1,0)),f.x),mix(sh1(i+vec2(0,1)),sh1(i+vec2(1,1)),f.x),f.y);}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      for(int i=0;i<16;i++){vec4 c=uHoleC[i];if(c.w<.5)continue;vec3 d=abs(vHWP-c.xyz)-uHoleH[i].xyz;
        float jag=(sn2(vHWP.xy*5.+vHWP.zz*3.)-.5)*.22;                     // ragged, broken edge
        float dm=max(d.x,max(d.y,d.z));if(dm<jag)discard;
        if(dm<jag+.07)diffuseColor.rgb*=.3;}                                 // scorched rim
      {
        vec2 u=vSUv;float k=1.;
        if(vSNy<-.5){ // ceiling panels
          vec2 f=abs(fract(u/.6)-.5);float seam=smoothstep(.46,.5,max(f.x,f.y));k=.92-seam*.4+sh1(floor(u/.6))*.05;
        }else if(vSNy>.5){
          if(vSurf<.5){k=.9+sn2(u*9.)*.1;}
          else if(vSurf<1.5){ // wood planks .14 m wide, 1.2 m long, staggered
            float row=floor(u.y/.14);float off=sh1(vec2(row,3.))*1.2;float x=(u.x+off)/1.2;float cx=floor(x);
            float fy=fract(u.y/.14);float fx=fract(x);float gap=smoothstep(.0,.05,min(fy,1.-fy))*smoothstep(.0,.012,min(fx,1.-fx));
            float grain=sn2(vec2(u.x*3.5+row*7.,u.y*55.));k=(.78+sh1(vec2(row,cx))*.3)*(.85+grain*.22)*mix(.55,1.,gap);
          }else if(vSurf<2.5){ // tile .4 m with grout
            vec2 g=fract(u/.4);float gr=smoothstep(.0,.014,min(min(g.x,1.-g.x),min(g.y,1.-g.y)));float v=sh1(floor(u/.4));k=mix(.5,1.,gr)*(.9+v*.14);
          }else if(vSurf<3.5){k=.82+sh1(floor(u*70.))*.14+sn2(u*6.)*.08;}  // carpet
          else{k=.78+sn2(u*2.2)*.2+sn2(u*14.)*.06;}                        // concrete
        }else{k=.93+sn2(u*8.)*.07;}                                        // wall plaster
        diffuseColor.rgb*=k;
      }`);
  };
  m.customProgramCacheKey = () => 'interior-surfaces';
  return m;
}
let M = null;
export function mats() {
  if (M) return M;
  const tile = tex('#8a90a4', '60,65,80', 'rgba(30,34,48,.9)');
  const carpet = tex('#2b3048', '255,255,255', 'rgba(0,0,0,0)');
  const wood = tex('#5b3f2e', '20,10,5', 'rgba(20,10,6,.7)');
  const conc = tex('#555a66', '20,22,30', 'rgba(0,0,0,0)');
  const mk = (t, r, m) => new THREE.MeshStandardMaterial({ map: t, roughness: r, metalness: m, envMapIntensity: 0.9 });
  M = {
    tile: mk(tile, 0.14, 0.1), carpet: mk(carpet, 0.95, 0), wood: mk(wood, 0.4, 0.05), conc: mk(conc, 0.9, 0.02),
    decor: surfaceMaterial(),
    emit: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x9fb8d0, roughness: 0.04, transparent: true, opacity: 0.16, depthWrite: false, envMapIntensity: 2, side: THREE.DoubleSide }),
    steel: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.9, envMapIntensity: 1.6 }),
    ceiling: new THREE.MeshStandardMaterial({ color: 0x1b1d28, roughness: 0.9 }),
  };
  return M;
}


// 36 non-indexed box vertices in BoxGeometry(2,2,2) order: sign of each coordinate and the face normal
let _bt = null; const _m4 = new THREE.Matrix4(), _m3 = new THREE.Matrix3();
function boxTemplate() {
  if (_bt) return _bt;
  const g = new THREE.BoxGeometry(2, 2, 2).toNonIndexed(), p = g.attributes.position, nr = g.attributes.normal, n = p.count;
  _bt = { sx: new Float64Array(n), sy: new Float64Array(n), sz: new Float64Array(n), nx: new Float32Array(n), ny: new Float32Array(n), nz: new Float32Array(n) };
  for (let i = 0; i < n; i++) { _bt.sx[i] = Math.sign(p.getX(i)); _bt.sy[i] = Math.sign(p.getY(i)); _bt.sz[i] = Math.sign(p.getZ(i)); _bt.nx[i] = nr.getX(i); _bt.ny[i] = nr.getY(i); _bt.nz[i] = nr.getZ(i); }
  return _bt;
}
// BufferAttribute.applyMatrix4 / applyNormalMatrix on raw arrays (position keeps float32 rounding per pass)
function rotAttr(pos, nor, m4) {
  const e = m4.elements, f = Math.fround, ne = _m3.getNormalMatrix(m4).elements;
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2], w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
    pos[i] = f((e[0] * x + e[4] * y + e[8] * z + e[12]) * w); pos[i + 1] = f((e[1] * x + e[5] * y + e[9] * z + e[13]) * w); pos[i + 2] = f((e[2] * x + e[6] * y + e[10] * z + e[14]) * w);
    const nx = nor[i], ny = nor[i + 1], nz = nor[i + 2];
    const ax = ne[0] * nx + ne[3] * ny + ne[6] * nz, ay = ne[1] * nx + ne[4] * ny + ne[7] * nz, az = ne[2] * nx + ne[5] * ny + ne[8] * nz, l = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
    const il = 1 / l; nor[i] = f(ax * il); nor[i + 1] = f(ay * il); nor[i + 2] = f(az * il);
  }
}

export class Builder {
  constructor() { this.parts = { decor: [], emit: [], glass: [], steel: [] }; this.surf = 0; }
  _push(key, g, col, em = 1) {
    const n = g.attributes.position.count, a = new Float32Array(n * 3), c = new THREE.Color(col);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r * em; a[i * 3 + 1] = c.g * em; a[i * 3 + 2] = c.b * em; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
    if (key === 'decor') { // world-metre pattern coordinates, projected along the dominant normal axis
      const p = g.attributes.position, nr = g.attributes.normal, uv = new Float32Array(n * 2), sf = new Float32Array(n).fill(this.surf);
      for (let i = 0; i < n; i++) {
        const nx = Math.abs(nr.getX(i)), ny = Math.abs(nr.getY(i)), nz = Math.abs(nr.getZ(i));
        if (ny >= nx && ny >= nz) { uv[i * 2] = p.getX(i); uv[i * 2 + 1] = p.getZ(i); }
        else if (nx >= nz) { uv[i * 2] = p.getZ(i); uv[i * 2 + 1] = p.getY(i); }
        else { uv[i * 2] = p.getX(i); uv[i * 2 + 1] = p.getY(i); }
      }
      g.setAttribute('aSUv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('aSurf', new THREE.BufferAttribute(sf, 1));
    }
    this.parts[key].push(g.index ? g.toNonIndexed() : g);
  }
  // center-based box in world coords (x,z center; y base).
  // Built straight into typed arrays, repeating the float32 steps of the old BoxGeometry -> translate -> rotateX -> rotateY -> translate -> toNonIndexed
  // chain (same vertices, same normals, same triangle order), without the temporary geometry and the four passes over its attributes.
  box(key, x, y, z, w, h, d, col, ry = 0, em = 1, rx = 0) {
    const T = boxTemplate(), n = 36, pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), hw = w / 2, hh = h / 2, hd = d / 2, f = Math.fround;
    for (let i = 0; i < n; i++) {
      pos[i * 3] = T.sx[i] * hw; pos[i * 3 + 1] = T.sy[i] * hh; pos[i * 3 + 2] = T.sz[i] * hd;      // float32 of +-half extent, as BoxGeometry stored it
      nor[i * 3] = T.nx[i]; nor[i * 3 + 1] = T.ny[i]; nor[i * 3 + 2] = T.nz[i];
    }
    for (let i = 0; i < n; i++) pos[i * 3 + 1] = f(pos[i * 3 + 1] + h / 2);                          // translate(0, h/2, 0)
    if (rx) rotAttr(pos, nor, _m4.makeRotationX(rx));
    if (ry) rotAttr(pos, nor, _m4.makeRotationY(ry));
    if (rx || ry) for (let i = 0; i < nor.length; i += 3) { const l = Math.sqrt(nor[i] * nor[i] + nor[i + 1] * nor[i + 1] + nor[i + 2] * nor[i + 2]) || 1, il = 1 / l; nor[i] = f(nor[i] * il); nor[i + 1] = f(nor[i + 1] * il); nor[i + 2] = f(nor[i + 2] * il); }   // the final translate() normalised again
    for (let i = 0; i < n; i++) { pos[i * 3] = f(pos[i * 3] + x); pos[i * 3 + 1] = f(pos[i * 3 + 1] + y); pos[i * 3 + 2] = f(pos[i * 3 + 2] + z); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    this._push(key, g, col, em);
  }
  // min/max extents box
  ext(key, x0, y0, z0, x1, y1, z1, col, em = 1) { this.box(key, (x0 + x1) / 2, y0, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, col, 0, em); }
  cyl(key, x, y, z, r, h, col, seg = 14, em = 1) { const g = new THREE.CylinderGeometry(r, r, h, seg); g.translate(x, y + h / 2, z); this._push(key, g, col, em); }
  ico(key, x, y, z, r, col, sy = 1) { const g = new THREE.IcosahedronGeometry(r, 1); g.scale(1, sy, 1); g.translate(x, y, z); this._push(key, g, col); }
  finish(parent) {
    const m = mats(), out = [];
    for (const [k, arr] of Object.entries(this.parts)) {
      if (!arr.length) continue;
      const geo = mergeGeometries(arr, false); if (!geo) continue;
      const mesh = new THREE.Mesh(geo, k === 'decor' ? m.decor : k === 'emit' ? m.emit : k === 'glass' ? m.glass : m.steel);
      mesh.frustumCulled = true; mesh.receiveShadow = k !== 'emit'; if (k === 'glass') mesh.renderOrder = 3;
      parent.add(mesh); out.push(mesh);
    }
    return out;
  }
}
export function disposeGroup(g) {
  g.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); });
  g.parent?.remove(g);
}

// quantized (KHR_mesh_quantization) attributes are integers: expand position/normal/uv to float before any matrix is baked in
export function toFloatGeo(src) {
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = src.attributes[name]; if (!a) continue;
    const f = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) { f[i * a.itemSize] = a.getX(i); f[i * a.itemSize + 1] = a.getY(i); if (a.itemSize > 2) f[i * a.itemSize + 2] = a.getZ(i); }
    g.setAttribute(name, new THREE.BufferAttribute(f, a.itemSize));
  }
  if (src.index) g.setIndex(Array.from(src.index.array));
  return g;
}
