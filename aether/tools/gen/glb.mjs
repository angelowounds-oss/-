// Dependency-free mesh builder + GLB 2.0 writer (Node built-ins only; the build environment has no npm registry).
// Winding is made correct by construction: quads/lofts take a `toward` point or an explicit orientation and flip themselves.
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = a => Math.hypot(a[0], a[1], a[2]);
export const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

export class Mesh {
  constructor(name, material, extras = {}) { this.name = name; this.material = material; this.extras = extras; this.P = []; this.N = []; this.U = []; this.I = []; }
  get vertexCount() { return this.P.length / 3; }
  get triangleCount() { return this.I.length / 3; }
  vert(p, n, uv = [0, 0]) { this.P.push(p[0], p[1], p[2]); this.N.push(n[0], n[1], n[2]); this.U.push(uv[0], uv[1]); return this.P.length / 3 - 1; }
  // one flat triangle; orientation: normal points toward `toward` (point) or away from it when away=true; degenerate triangles are skipped
  tri(a, b, c, opt = {}) {
    let n = cross(sub(b, a), sub(c, a)); const l = len(n); if (l < 1e-12) return false; n = mul(n, 1 / l);
    if (opt.toward) { const m = mul(add(add(a, b), c), 1 / 3), s = dot(n, sub(opt.toward, m)); if ((s < 0) !== !!opt.away) { [b, c] = [c, b]; n = mul(n, -1); } }
    else if (opt.flip) { [b, c] = [c, b]; n = mul(n, -1); }
    const u = opt.uv || [[0, 0], [1, 0], [0, 1]], i = this.vert(a, n, u[0]), j = this.vert(b, n, u[1]), k = this.vert(c, n, u[2]); this.I.push(i, j, k); return true;
  }
  quad(a, b, c, d, opt = {}) { this.tri(a, b, c, opt); this.tri(a, c, d, opt); }
  // axis-aligned box; faces outward (or inward when inward=true)
  box(min, max, opt = {}) {
    const [x0, y0, z0] = min, [x1, y1, z1] = max, c = [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], o = { toward: c, away: !opt.inward };
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], o); this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], o);
    this.quad([x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], o); this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], o);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], o); this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], o);
  }
  // closed vertical cylinder (axis +Y), caps included
  cylinderY(cx, cz, r, y0, y1, seg = 16) {
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * 2 * Math.PI, a1 = (i + 1) / seg * 2 * Math.PI, p0 = [cx + r * Math.cos(a0), 0, cz + r * Math.sin(a0)], p1 = [cx + r * Math.cos(a1), 0, cz + r * Math.sin(a1)], ax = [cx, (y0 + y1) / 2, cz];
      this.quad([p0[0], y0, p0[2]], [p1[0], y0, p1[2]], [p1[0], y1, p1[2]], [p0[0], y1, p0[2]], { toward: ax, away: true });
      this.tri([cx, y1, cz], [p0[0], y1, p0[2]], [p1[0], y1, p1[2]], { toward: [cx, y1 + 1, cz] });
      this.tri([cx, y0, cz], [p0[0], y0, p0[2]], [p1[0], y0, p1[2]], { toward: [cx, y0 - 1, cz] });
    }
  }
  // smooth-shaded surface through a grid of points G[i][j] (i along the length, j around/across); closedJ wraps j.
  // side: 'out' normals point away from `centre(i)` (a point on the axis per row), 'in' toward it, 'up'/'down' fixed vertical sign for open sheets.
  grid(G, centre, side = 'out', closedJ = false) {
    const ni = G.length, nj = G[0].length, idx = [];
    const at = (i, j) => G[Math.min(ni - 1, Math.max(0, i))][closedJ ? (j + nj) % nj : Math.min(nj - 1, Math.max(0, j))];
    for (let i = 0; i < ni; i++) {
      idx.push([]);
      const cc = typeof centre === 'function' ? centre(i) : centre;
      for (let j = 0; j < nj; j++) {
        const tj = sub(at(i, j + 1), at(i, j - 1)), ti = sub(at(i + 1, j), at(i - 1, j)); let n = cross(tj, ti), l = len(n);
        const p = G[i][j], r = sub(p, cc);
        if (l < 1e-9) n = norm(r); else n = mul(n, 1 / l);
        const s = dot(n, r); if ((s < 0) === (side === 'out')) n = mul(n, -1);
        idx[i].push(this.vert(p, n, [j / (nj - 1), i / (ni - 1)]));
      }
    }
    const jm = closedJ ? nj : nj - 1;
    for (let i = 0; i < ni - 1; i++) for (let j = 0; j < jm; j++) {
      const a = idx[i][j], b = idx[i + 1][j], c = idx[i + 1][(j + 1) % nj], d = idx[i][(j + 1) % nj];
      const emit = (p, q, r) => { const n = cross(sub(pos(this, q), pos(this, p)), sub(pos(this, r), pos(this, p))); if (len(n) < 1e-14) return; const vn = [this.N[p * 3], this.N[p * 3 + 1], this.N[p * 3 + 2]]; if (dot(n, vn) < 0) this.I.push(p, r, q); else this.I.push(p, q, r); };
      emit(a, b, c); emit(a, c, d);
    }
  }
  bounds() { const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]; for (let i = 0; i < this.P.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], this.P[i + k]); hi[k] = Math.max(hi[k], this.P[i + k]); } return { min: lo, max: hi }; }
}
const pos = (m, i) => [m.P[i * 3], m.P[i * 3 + 1], m.P[i * 3 + 2]];

// materials: [{name, base:[r,g,b,a] (linear), metallic, roughness}] ; meshes: Mesh[]. Returns a Buffer (GLB 2.0, one buffer, KHR-free).
export function writeGLB(meshes, materials, asset = {}) {
  const matIndex = new Map(materials.map((m, i) => [m.name, i]));
  const chunks = [], views = [], accessors = [], jsonMeshes = [], nodes = [];
  let offset = 0;
  const pad = n => (4 - n % 4) % 4;
  const push = (buf, target) => { const pre = pad(offset); if (pre) { chunks.push(Buffer.alloc(pre)); offset += pre; } views.push({ buffer: 0, byteOffset: offset, byteLength: buf.length, target }); chunks.push(buf); offset += buf.length; return views.length - 1; };
  for (const m of meshes) {
    if (!matIndex.has(m.material)) throw new Error('unknown material ' + m.material + ' on ' + m.name);
    if (!m.triangleCount) throw new Error('empty mesh ' + m.name);
    const P = Float32Array.from(m.P), N = Float32Array.from(m.N), U = Float32Array.from(m.U), I = m.vertexCount > 65535 ? Uint32Array.from(m.I) : Uint16Array.from(m.I);
    const b = m.bounds(), pv = push(Buffer.from(P.buffer), 34962), nv = push(Buffer.from(N.buffer), 34962), uv = push(Buffer.from(U.buffer), 34962), iv = push(Buffer.from(I.buffer), 34963), a0 = accessors.length;
    accessors.push({ bufferView: pv, componentType: 5126, count: P.length / 3, type: 'VEC3', min: b.min, max: b.max }, { bufferView: nv, componentType: 5126, count: N.length / 3, type: 'VEC3' }, { bufferView: uv, componentType: 5126, count: U.length / 2, type: 'VEC2' }, { bufferView: iv, componentType: I instanceof Uint32Array ? 5125 : 5123, count: I.length, type: 'SCALAR' });
    jsonMeshes.push({ name: m.name, primitives: [{ attributes: { POSITION: a0, NORMAL: a0 + 1, TEXCOORD_0: a0 + 2 }, indices: a0 + 3, material: matIndex.get(m.material), mode: 4 }] });
    nodes.push({ name: m.name, mesh: jsonMeshes.length - 1, extras: m.extras });
  }
  const tail = pad(offset); if (tail) { chunks.push(Buffer.alloc(tail)); offset += tail; }
  const json = {
    asset: { version: '2.0', generator: 'AETHER tunnel generator (tools/gen)', extras: asset }, scene: 0, scenes: [{ name: 'AETHER_TUNNEL_V2', nodes: nodes.map((_, i) => i) }], nodes, meshes: jsonMeshes,
    materials: materials.map(m => ({ name: m.name, pbrMetallicRoughness: { baseColorFactor: m.base, metallicFactor: m.metallic, roughnessFactor: m.roughness }, doubleSided: false })),
    accessors, bufferViews: views, buffers: [{ byteLength: offset }]
  };
  let js = Buffer.from(JSON.stringify(json)); const jp = pad(js.length); if (jp) js = Buffer.concat([js, Buffer.alloc(jp, 0x20)]);
  const bin = Buffer.concat(chunks), total = 12 + 8 + js.length + 8 + bin.length, head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(js.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([head, jh, js, bh, bin]);
}
