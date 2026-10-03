// node tools/gen/validate.mjs : re-reads assets/tunnel-v2.glb with an independent parser and checks it against the spec
import fs from 'node:fs'; import path from 'node:path';
import { SPEC } from './tunnel.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const buf = fs.readFileSync(path.join(root, 'assets/tunnel-v2.glb'));
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
if (dv.getUint32(0, true) !== 0x46546c67 || dv.getUint32(4, true) !== 2 || dv.getUint32(8, true) !== buf.length) throw new Error('GLB header');
const jl = dv.getUint32(12, true), json = JSON.parse(buf.subarray(20, 20 + jl).toString()), bin = buf.subarray(20 + jl + 8);
const rd = (ai) => { const a = json.accessors[ai], v = json.bufferViews[a.bufferView], n = { SCALAR: 1, VEC2: 2, VEC3: 3 }[a.type], ctor = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array }[a.componentType];
  const o = bin.byteOffset + v.byteOffset; return new ctor(bin.buffer.slice(o, o + a.count * n * ctor.BYTES_PER_ELEMENT)); };
const rows = [], fails = []; const D = SPEC.derived;
const check = (n, ok, d) => { rows.push({ n, ok: !!ok, d }); if (!ok) fails.push(n); };
const parts = {};
for (const node of json.nodes) {
  const prim = json.meshes[node.mesh].primitives[0], P = rd(prim.attributes.POSITION), N = rd(prim.attributes.NORMAL), I = rd(prim.indices), V = P.length / 3;
  let finite = true, bad = 0, area = 0; const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9], edges = new Map();
  for (let i = 0; i < P.length; i++) { if (!Number.isFinite(P[i]) || !Number.isFinite(N[i])) finite = false; const k = i % 3; lo[k] = Math.min(lo[k], P[i]); hi[k] = Math.max(hi[k], P[i]); }
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2]; if (a >= V || b >= V || c >= V) { bad++; continue; }
    const e1 = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]], e2 = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], l = Math.hypot(...n); area += l / 2;
    if (l > 1e-12) { const vn = [N[a * 3], N[a * 3 + 1], N[a * 3 + 2]]; if ((n[0] * vn[0] + n[1] * vn[1] + n[2] * vn[2]) / l < 0.2) bad++; }
    for (const [u, w] of [[a, b], [b, c], [c, a]]) { const key = [P.slice(u * 3, u * 3 + 3).map(x => x.toFixed(4)).join(','), P.slice(w * 3, w * 3 + 3).map(x => x.toFixed(4)).join(',')].sort().join('|'); edges.set(key, (edges.get(key) || 0) + 1); }
  }
  let nonManifold = 0; for (const c of edges.values()) if (c > 2) nonManifold++;
  parts[node.name] = { V, T: I.length / 3, min: lo, max: hi, finite, bad, area, nonManifold, P, N };
}
const near = (a, b, tol = .001) => Math.abs(a - b) <= tol;
for (const [n, p] of Object.entries(parts)) { check(n + ': finite, indices valid, normals agree with winding', p.finite && p.bad === 0, { bad: p.bad }); check(n + ': no non-manifold edges (>2 faces)', p.nonManifold === 0, { nonManifold: p.nonManifold }); }
const nz = parts.AETHER_NOZZLE_INNER, no = parts.AETHER_NOZZLE_OUTER, S = SPEC;
check('nozzle outer: x range = spec', near(no.min[0], S.nozzle.x0) && near(no.max[0], S.nozzle.x1), [no.min[0], no.max[0]]);
const sec = (p, x, tol = 1e-5) => { const lo = [1e9, 1e9], hi = [-1e9, -1e9]; for (let i = 0; i < p.P.length; i += 3) if (Math.abs(p.P[i] - x) < tol) { lo[0] = Math.min(lo[0], p.P[i + 1]); hi[0] = Math.max(hi[0], p.P[i + 1]); lo[1] = Math.min(lo[1], p.P[i + 2]); hi[1] = Math.max(hi[1], p.P[i + 2]); } return { yMin: lo[0], yMax: hi[0], zMin: lo[1], zMax: hi[1] }; };
const ex = sec(no, S.nozzle.x1);
check('nozzle outer exit = flow dims + wall', near(ex.zMax - ex.zMin, S.nozzle.outW + 2 * S.nozzle.wall, .001) && near(ex.yMax, S.nozzle.outH + S.nozzle.wall, .001), ex);
const exI = sec(nz, S.nozzle.x1);
check('nozzle inner (flow) exit = spec 5.2 x 3.8 m', near(exI.zMax - exI.zMin, S.nozzle.outW, .001) && near(exI.yMax, S.nozzle.outH, .001), exI);
const th = sec(parts.AETHER_COLLECTOR_INNER, S.collector.throatX), dthr = { w: th.zMax - th.zMin, h: th.yMax };
check('collector throat inner (flow) = spec 6.4 x 4.6 m', near(dthr.w, S.collector.thW, .001) && near(dthr.h, S.collector.thH, .001), dthr);
// orientation of the shells: sign of normal . (axis point - vertex)
const faces = (p, f) => { let ok = 0, n = 0; for (let i = 0; i < p.P.length; i += 3) { n++; if (f([p.P[i], p.P[i + 1], p.P[i + 2]], [p.N[i], p.N[i + 1], p.N[i + 2]])) ok++; } return ok / n; };
const toAxis = (p, n, sign) => { const y = Math.max(0, Math.min(p[1], 1e9)); void y; return true; };
void toAxis;
check('nozzle inner normals point toward the flow axis', faces(nz, (p, n) => { const a = D.nozzleAt(p[0]); const c = [0, a.h / 2, 0]; return (n[1] * (c[1] - p[1]) + n[2] * (c[2] - p[2])) > -1e-6; }) > .99, null);
check('nozzle outer normals point away from the flow axis', faces(no, (p, n) => { const a = D.nozzleAt(p[0]); const c = [0, a.h / 2, 0]; return (n[1] * (p[1] - c[1]) + n[2] * (p[2] - c[2])) > -1e-6; }) > .99, null);
check('floor normals point up', faces(parts.AETHER_TUNNEL_FLOOR, (p, n) => n[1] > .99) === 1, null);
check('ceiling normals point down', faces(parts.AETHER_TUNNEL_CEILING, (p, n) => n[1] < -.99) === 1, null);
check('wall normals point into the plenum', faces(parts.AETHER_TUNNEL_WALLS, (p, n) => { const c = [(S.plenum.x0 + S.plenum.x1) / 2, 4, 0]; return (n[0] * (c[0] - p[0]) + n[1] * (c[1] - p[1]) + n[2] * (c[2] - p[2])) > 0; }) > .99, null);
check('nozzle outer inlet = flow width + wall', near(no.max[2], S.nozzle.inW / 2 + S.nozzle.wall, .001) && near(no.min[2], -S.nozzle.inW / 2 - S.nozzle.wall, .001), [no.min[2], no.max[2]]);
check('nozzle outer inlet height = flow height + wall', near(no.max[1], S.nozzle.inH + S.nozzle.wall, .001), no.max[1]);
const ci = parts.AETHER_COLLECTOR_INNER; check('collector inner: x range = spec', near(ci.min[0], S.collector.x0, .002) && near(ci.max[0], S.collector.xOut, .002), [ci.min[0], ci.max[0]]);
const tt = parts.AETHER_TURNTABLE_DISK; check('turntable radius = spec (3.75 m)', near(tt.max[0], S.turntable.r, .002) && near(tt.min[2], -S.turntable.r, .002), [tt.max[0], tt.min[2]]);
check('turntable top is flush with the floor (y=0)', near(tt.max[1], 0, 1e-6) && near(tt.min[1], 0, 1e-6), [tt.min[1], tt.max[1]]);
const fl = parts.AETHER_TUNNEL_FLOOR; check('floor covers the plenum footprint', near(fl.min[0], S.plenum.x0) && near(fl.max[0], S.plenum.x1) && near(fl.max[2], S.plenum.zh), [fl.min[0], fl.max[0], fl.max[2]]);
const wd = parts.AETHER_TUNNEL_WEDGES; check('wedges stay inside the plenum (depth 0.8 m)', wd.min[0] >= S.plenum.x0 - 1e-6 && wd.max[0] <= S.plenum.x1 + 1e-6 && wd.max[1] <= S.plenum.y1 + 1e-6 && Math.abs(wd.max[2]) <= S.plenum.zh + 1e-6, [wd.min, wd.max]);
const dm = D; check('derived: contraction ratio 3.5..6', dm.contractionRatio > 3.5 && dm.contractionRatio < 6, dm.contractionRatio.toFixed(2));
check('derived: nozzle area inside public range 18..25 m^2', dm.nozzleOutArea >= 18 && dm.nozzleOutArea <= 25, dm.nozzleOutArea.toFixed(2));
check('derived: test section about 3 hydraulic diameters (2.5..3.5)', dm.testSectionDh >= 2.5 && dm.testSectionDh <= 3.5, dm.testSectionDh.toFixed(2));
check('derived: plenum width / nozzle width >= 2.2 (drag under-prediction guard)', 2 * S.plenum.zh / S.nozzle.outW >= 2.2, (2 * S.plenum.zh / S.nozzle.outW).toFixed(2));
const tri = Object.values(parts).reduce((a, p) => a + p.T, 0), vert = Object.values(parts).reduce((a, p) => a + p.V, 0);
check('budget: triangles <= 400k, vertices <= 1.2M', tri <= 400000 && vert <= 1200000, { tri, vert });
for (const r of rows) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.n + (r.d !== undefined && r.d !== null ? '  ' + JSON.stringify(r.d) : ''));
console.log(`${rows.length - fails.length} PASS, ${fails.length} FAIL  (triangles ${tri}, vertices ${vert})`);
process.exit(fails.length ? 1 : 0);
