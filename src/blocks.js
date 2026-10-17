import * as THREE from 'three';
import blocksB64 from '../assets/blocks/blocks.bin';
import aoUrl from '../assets/blocks/ao.jpg';

// The apartment blocks of the villages (assets/blocks, docs/ASSETS.md): three real models of 5, 6 and 8 floors from one set, decoded once. The wall
// geometry shares its buffers between houses; a house only adds its own colour attribute and its own pick of lit panes.
let packed = null, aoTex = null;
const ROOF = [0.22, 0.22, 0.24];

function decode() {
  if (packed) return packed;
  const bin = Uint8Array.from(atob(blocksB64), (c) => c.charCodeAt(0)), dv = new DataView(bin.buffer), hl = dv.getUint32(0, true), head = JSON.parse(new TextDecoder().decode(bin.subarray(4, 4 + hl))), base = 4 + hl;
  const f32 = (o, n) => new Float32Array(bin.buffer.slice(base + o, base + o + n * 4)), u16 = (o, n) => new Uint16Array(bin.buffer.slice(base + o, base + o + n * 2)), i8 = (o, n) => new Int8Array(bin.buffer.slice(base + o, base + o + n));
  packed = head.models.map((m) => {
    const pos = new THREE.BufferAttribute(f32(m.pos, m.nv * 3), 3), uv = new THREE.BufferAttribute(f32(m.uv, m.nv * 2), 2), nrm = new THREE.BufferAttribute(i8(m.nrm, m.nv * 3), 3, true);
    const wall = u16(m.wall, m.nWall), glass = u16(m.glass, m.nGlass), roof = new Float32Array(m.nv);
    for (let i = 0; i < m.nv; i++) roof[i] = nrm.getY(i) > 0.8 ? 1 : 0;
    // footprint centre and size in the model frame; the model stands on y = 0 and its long side is z
    const cx = (m.min[0] + m.max[0]) / 2, cz = (m.min[2] + m.max[2]) / 2;
    return { pos, uv, nrm, wall, glass, roof, nv: m.nv, paneStart: m.paneStart, h: m.max[1], cx, cz, w: m.max[0] - m.min[0], d: m.max[2] - m.min[2] };
  });
  return packed;
}
export const BLOCK_COUNT = 3;
export const blockSize = (i) => { const m = decode()[i]; return { w: m.d, d: m.w, h: m.h }; };   // after the quarter turn the long side runs along the street

export function aoTexture() {
  if (aoTex) return aoTex;
  aoTex = new THREE.TextureLoader().load(aoUrl); aoTex.wrapS = aoTex.wrapT = THREE.RepeatWrapping; aoTex.anisotropy = 4; aoTex.colorSpace = THREE.NoColorSpace; return aoTex;
}

// geometries of one house: walls tinted with the wall colour, glass that is dark, glass that is lit (lit panes picked by seed and by the share lit)
export function blockGeometries(i, wallRgb, seed, lit = 0.4) {
  const m = decode()[i % BLOCK_COUNT], col = new Float32Array(m.nv * 3);
  for (let k = 0; k < m.nv; k++) { const r = m.roof[k], c = r ? ROOF : wallRgb; col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2]; }
  const shared = (g) => { g.setAttribute('position', m.pos); g.setAttribute('normal', m.nrm); g.setAttribute('uv', m.uv); return g; };
  const wall = shared(new THREE.BufferGeometry()); wall.setIndex(new THREE.BufferAttribute(m.wall, 1)); wall.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const dark = [], on = [];
  for (let p = 0; p < m.paneStart.length - 1; p++) { const h = Math.sin(seed * 12.9898 + p * 78.233) * 43758.5453, litP = h - Math.floor(h) < lit; for (let k = m.paneStart[p] * 3; k < m.paneStart[p + 1] * 3; k++) (litP ? on : dark).push(m.glass[k]); }
  const glass = (idx, rgb) => { const g = shared(new THREE.BufferGeometry()), c = new Float32Array(m.nv * 3); for (let k = 0; k < m.nv; k++) { c[k * 3] = rgb[0]; c[k * 3 + 1] = rgb[1]; c[k * 3 + 2] = rgb[2]; } g.setIndex(new THREE.BufferAttribute(new Uint16Array(idx), 1)); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; };
  return { wall, dark: dark.length ? glass(dark, [1, 1, 1]) : null, lit: on.length ? glass(on, [1.5, 1.05, 0.5]) : null, size: { w: m.d, d: m.w, h: m.h }, cx: m.cx, cz: m.cz };
}
