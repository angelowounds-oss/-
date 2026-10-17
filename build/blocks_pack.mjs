// Packs the "Residential Buildings Set" OBJs (docs/ASSETS.md) into assets/blocks/blocks.bin for the villages (src/blocks.js).
// usage: node build/blocks_pack.mjs <dir with the OBJs> [first=1 last=3]; the AO atlas is made once with PIL:
//   Image.open('Hotel_Hous_AO.png').convert('L').resize((1024, 1024), Image.LANCZOS).convert('RGB').save('assets/blocks/ao.jpg', quality=82)
// Layout: u32 json length, json header, then per model: wall + glass vertex data (f32 pos, f32 uv, i8 nrm, u16 idx) at the offsets the header names.
import fs from 'node:fs';

const [dir, a = '1', b = '3'] = process.argv.slice(2);
if (!dir) { console.error('usage: node build/blocks_pack.mjs <obj dir> [first last]'); process.exit(1); }
const chunks = [], header = { models: [] }; let off = 0;
const put = (ta) => { const buf = Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength), pad = (4 - (buf.length & 3)) & 3; chunks.push(buf, Buffer.alloc(pad)); const o = off; off += buf.length + pad; return o; };

for (let i = +a; i <= +b; i++) {
  const t = fs.readFileSync(`${dir}/Residential Buildings ${String(i).padStart(3, '0')}.obj`, 'utf8').split('\n');
  const V = [], VT = [], VN = [], F = { ground: [], hotel_glas: [] }; let m = 'ground';
  for (const l of t) {
    if (l.startsWith('v ')) V.push(l.split(' ').slice(1).map(Number)); else if (l.startsWith('vt ')) VT.push(l.split(' ').slice(1, 3).map(Number)); else if (l.startsWith('vn ')) VN.push(l.split(' ').slice(1).map(Number));
    else if (l.startsWith('usemtl')) m = l.slice(7).trim(); else if (l.startsWith('f ')) F[m].push(l.trim().split(/\s+/).slice(1).map((s) => s.split('/').map((x) => (x ? +x - 1 : -1))));
  }
  const pos = [], uv = [], nrm = [], map = new Map();
  const vert = ([v, vt, vn]) => { const k = v + '/' + vt + '/' + vn; let r = map.get(k); if (r === undefined) { r = pos.length / 3; map.set(k, r); pos.push(...V[v]); uv.push(...(vt >= 0 ? VT[vt] : [0, 0])); nrm.push(...(vn >= 0 ? VN[vn] : [0, 1, 0]).map((x) => Math.round(x * 127))); } return r; };
  const tris = (faces) => { const o = []; for (const f of faces) for (let k = 1; k < f.length - 1; k++) o.push(vert(f[0]), vert(f[k]), vert(f[k + 1])); return o; };
  const wall = tris(F.ground);
  // glass: one pane per connected set of faces, so a pane can be lit or dark as a whole
  const gf = F.hotel_glas, par = new Map(), find = (x) => { while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
  for (const f of gf) for (const c of f) if (!par.has(c[0])) par.set(c[0], c[0]);
  for (const f of gf) for (let k = 1; k < f.length; k++) par.set(find(f[k][0]), find(f[0][0]));
  const panes = new Map(); for (const f of gf) { const r = find(f[0][0]); (panes.get(r) || panes.set(r, []).get(r)).push(f); }
  const glass = [], paneStart = []; for (const fs2 of panes.values()) { paneStart.push(glass.length / 3); glass.push(...tris(fs2)); } paneStart.push(glass.length / 3);
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let k = 0; k < pos.length; k++) { mn[k % 3] = Math.min(mn[k % 3], pos[k]); mx[k % 3] = Math.max(mx[k % 3], pos[k]); }
  header.models.push({ name: i, nv: pos.length / 3, nWall: wall.length, nGlass: glass.length, paneStart, min: mn, max: mx, pos: put(new Float32Array(pos)), uv: put(new Float32Array(uv)), nrm: put(new Int8Array(nrm)), wall: put(new Uint16Array(wall)), glass: put(new Uint16Array(glass)) });
}
const js = Buffer.from(JSON.stringify(header)), jp = Buffer.alloc((4 - (js.length & 3)) & 3, 0x20), len = Buffer.alloc(4); len.writeUInt32LE(js.length + jp.length);
fs.writeFileSync('assets/blocks/blocks.bin', Buffer.concat([len, js, jp, ...chunks]));
console.log('blocks.bin', fs.statSync('assets/blocks/blocks.bin').size, 'bytes', header.models.map((m) => `${m.name}: ${m.nv} v, ${m.nWall / 3} wall tris, ${m.paneStart.length - 1} panes`).join(' | '));
