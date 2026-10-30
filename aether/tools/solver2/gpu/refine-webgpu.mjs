// CFD V3 P3: the nested-refinement lattice Boltzmann solver of tools/solver2/refine.mjs on WebGPU compute (D3Q19, f32), step for step.
// The geometry and every interface table (ring and coarse-inside cells, stencils, refluxing links, wall-face links, body links, wall-model cells) are
// built by refine.mjs (createRefined, o.topologyOnly in a browser) and uploaded once; the kernels below are the per-cell operations of refine.mjs and
// refine-kernel.mjs, issued in the same recursive order (one coarse step = two steps of the next level, and so on).
// Supported (else an error): model 'reg' (Smagorinsky o.cs, hybrid regularization o.hrr), method 'N1C' with the default interface options
// (restrict 2, interpSpace 1, interpTime 1, populations' non-equilibrium, mirror stencils at slip faces), inlet / outlet / outlet absorbing layer,
// wall faces, one body (Bouzidi + momentum exchange) with or without the wall model. Not ported: body force, recursive regularization, bulk
// viscosity, interface damping band, cgGrad, neq 'grad', TRT / BGK.
// Storage per level: f and post (19 x N f32, structure of arrays), flags (u32: mask | solid << 2), mac (4 x N, only with hrr); the parent level of an
// interface keeps the stencil moments of time t and t + 1 (10 f32 per stencil cell). Refluxing: every link of the three passes (coarse, fine
// sub-step 0 and 1) writes its packet to a list that one workgroup sums (Kahan); the mean goes back to the ring cells, as refluxApply in refine.mjs.
// createRefineGpu(device, S, o): S = createRefined(o) (full or topologyOnly), o = the same options. Returns { upload(), init(), advance(n), finish(),
//   readLevelF(l), force(), forceLinks(), wall(), extremes(), levels }.
import { C19 } from './lbm-webgpu.mjs';
const W19 = C19.map(c => { const s = Math.abs(c[0]) + Math.abs(c[1]) + Math.abs(c[2]); return s === 0 ? 1 / 3 : s === 1 ? 1 / 18 : 1 / 36; });
const OPP19 = C19.map(c => C19.findIndex(e => e[0] === -c[0] && e[1] === -c[1] && e[2] === -c[2]));
const arr = (name, type, v) => `const ${name} = array<${type}, ${v.length}>(${v.map(x => type === 'f32' ? x.toPrecision(9) : String(x)).join(', ')});`;
const QP = [0, 1, 2].map(a => C19.findIndex(c => c[a] === 1 && Math.abs(c[0]) + Math.abs(c[1]) + Math.abs(c[2]) === 1)), QM = QP.map(q => OPP19[q]);
// mirror sign of the 10 interface moments (rho, u, Pi xx yy zz xy xz yz) under reflection of axis a (as MSIGN in refine.mjs)
const MSIGN = []; for (let a = 0; a < 3; a++) for (let j = 0; j < 10; j++) MSIGN.push(j === 1 + a || (j === 7 && a !== 2) || (j === 8 && a !== 1) || (j === 9 && a !== 0) ? -1 : 1);

const WGSL = `
struct LP { n0: u32, n1: u32, n2: u32, N: u32, ox: i32, oy: i32, oz: i32, per: u32, tau: f32, les: f32, hrr: f32, uin: f32, sponge: u32, wm: u32, cnt: u32, nu: f32,
  filt: f32, pad0: u32, pad1: u32, pad2: u32 }
struct IP { pN: u32, cN: u32, cnt: u32, off: u32, tC: f32, tF: f32, kc: f32, kf: f32, wv: f32, nr: f32, k: u32, pad: u32 }
@group(0) @binding(0) var<uniform> lp: LP;
@group(0) @binding(1) var<storage, read_write> f: array<f32>;
@group(0) @binding(2) var<storage, read_write> post: array<f32>;
@group(0) @binding(3) var<storage, read> flags: array<u32>;
@group(0) @binding(4) var<storage, read_write> mac: array<f32>;
@group(0) @binding(5) var<storage, read> sponge: array<f32>;
@group(0) @binding(6) var<storage, read_write> tauEff: array<f32>;
@group(0) @binding(7) var<storage, read_write> tauMin: array<f32>;
@group(0) @binding(8) var<storage, read> faceL: array<i32>;
@group(0) @binding(9) var<storage, read> faceK: array<f32>;
@group(0) @binding(10) var<storage, read> wallPop: array<u32>;
@group(0) @binding(11) var<storage, read> links: array<i32>;
@group(0) @binding(12) var<storage, read_write> lfAcc: array<f32>;
@group(0) @binding(13) var<storage, read> bcCell: array<i32>;
@group(0) @binding(14) var<storage, read> bcGeo: array<f32>;
@group(0) @binding(15) var<storage, read_write> utF: array<f32>;
@group(0) @binding(16) var<storage, read_write> uw: array<f32>;
@group(0) @binding(17) var<storage, read_write> utauO: array<f32>;
@group(0) @binding(20) var<uniform> ip: IP;
@group(0) @binding(21) var<storage, read> fc: array<f32>;
@group(0) @binding(22) var<storage, read_write> pc: array<f32>;
@group(0) @binding(23) var<storage, read> cgT: array<i32>;
@group(0) @binding(24) var<storage, read_write> MF0: array<f32>;
@group(0) @binding(25) var<storage, read_write> MF1: array<f32>;
@group(0) @binding(26) var<storage, read> slots: array<i32>;
@group(0) @binding(27) var<storage, read> ghosts: array<i32>;
@group(0) @binding(28) var<storage, read> rsten: array<i32>;
@group(0) @binding(29) var<storage, read> rcl: array<i32>;
@group(0) @binding(30) var<storage, read> rfl: array<i32>;
@group(0) @binding(31) var<storage, read_write> rfE: array<f32>;
@group(0) @binding(32) var<storage, read_write> rfSum: array<f32>;
@group(0) @binding(33) var<storage, read> ringC: array<i32>;
${arr('CX', 'i32', C19.map(c => c[0]))}
${arr('CY', 'i32', C19.map(c => c[1]))}
${arr('CZ', 'i32', C19.map(c => c[2]))}
${arr('W', 'f32', W19)}
${arr('OPP', 'u32', OPP19)}
${arr('QP', 'u32', QP)}
${arr('QM', 'u32', QM)}
${arr('MSIGN', 'f32', MSIGN)}
fn gid(g: vec3u, nw: vec3u) -> u32 { return g.x + g.y * nw.x * 64u; }
// index of the cell at local coordinates (i, j, k) of this level, -1 outside (periodic axes wrap)
fn cell(i0: i32, j0: i32, k0: i32) -> i32 {
  var i = i0; var j = j0; var k = k0; let a = i32(lp.n0); let b = i32(lp.n1); let c = i32(lp.n2);
  if ((lp.per & 1u) != 0u) { i = (i % a + a) % a; } else if (i < 0 || i >= a) { return -1; }
  if ((lp.per & 2u) != 0u) { j = (j % b + b) % b; } else if (j < 0 || j >= b) { return -1; }
  if ((lp.per & 4u) != 0u) { k = (k % c + c) % c; } else if (k < 0 || k >= c) { return -1; }
  return i + a * (j + b * k);
}
fn loc(n: u32) -> vec3i { return vec3i(i32(n % lp.n0), i32((n / lp.n0) % lp.n1), i32(n / (lp.n0 * lp.n1))); }
fn feq(q: u32, rho: f32, u: vec3f) -> f32 { let cu = f32(CX[q]) * u.x + f32(CY[q]) * u.y + f32(CZ[q]) * u.z; return W[q] * rho * (1.0 + 3.0 * cu + 4.5 * cu * cu - 1.5 * dot(u, u)); }
// Hermite second-order non-equilibrium term of direction q for Pi = (xx, yy, zz, xy, xz, yz)
fn h2(q: u32, a: array<f32, 6>) -> f32 { let x = f32(CX[q]); let y = f32(CY[q]); let z = f32(CZ[q]);
  return 4.5 * W[q] * (x * x * a[0] + y * y * a[1] + z * z * a[2] + 2.0 * (x * y * a[3] + x * z * a[4] + y * z * a[5]) - (a[0] + a[1] + a[2]) / 3.0); }

@compute @workgroup_size(64) fn initEq(@builtin(global_invocation_id) g: vec3u, @builtin(num_workgroups) nw: vec3u) {
  let n = gid(g, nw); if (n >= lp.N) { return; }
  let s = (flags[n] >> 2u) != 0u; let u = select(vec3f(lp.uin, 0.0, 0.0), vec3f(0.0), s);
  for (var q = 0u; q < 19u; q++) { let v = feq(q, 1.0, u); f[q * lp.N + n] = v; post[q * lp.N + n] = v; }
}
@compute @workgroup_size(64) fn macroVel(@builtin(global_invocation_id) g: vec3u, @builtin(num_workgroups) nw: vec3u) {
  let n = gid(g, nw); if (n >= lp.N) { return; }
  if (flags[n] != 0u) { mac[4u * n] = 0.0; return; } // not interior, or solid
  var rho = 0.0; var j = vec3f(0.0);
  for (var q = 0u; q < 19u; q++) { let v = f[q * lp.N + n]; rho += v; j += v * vec3f(f32(CX[q]), f32(CY[q]), f32(CZ[q])); }
  mac[4u * n] = rho; mac[4u * n + 1u] = j.x / rho; mac[4u * n + 2u] = j.y / rho; mac[4u * n + 3u] = j.z / rho;
}
@compute @workgroup_size(64) fn collide(@builtin(global_invocation_id) g: vec3u, @builtin(num_workgroups) nw: vec3u) {
  let n = gid(g, nw); if (n >= lp.N) { return; }
  let fl = flags[n];
  if ((fl & 3u) == 2u) { for (var q = 0u; q < 19u; q++) { post[q * lp.N + n] = f[q * lp.N + n]; } return; } // ghost: transport only (overwritten by the interface)
  if (fl != 0u) { return; }
  var rho = 0.0; var j = vec3f(0.0); var P = array<f32, 6>(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
  for (var q = 0u; q < 19u; q++) { let v = f[q * lp.N + n]; let x = f32(CX[q]); let y = f32(CY[q]); let z = f32(CZ[q]);
    rho += v; j += v * vec3f(x, y, z); P[0] += v * x * x; P[1] += v * y * y; P[2] += v * z * z; P[3] += v * x * y; P[4] += v * x * z; P[5] += v * y * z; }
  let u = j / rho; let r3 = rho / 3.0;
  P[0] -= r3 + rho * u.x * u.x; P[1] -= r3 + rho * u.y * u.y; P[2] -= r3 + rho * u.z * u.z; P[3] -= rho * u.x * u.y; P[4] -= rho * u.x * u.z; P[5] -= rho * u.y * u.z;
  var t = lp.tau;
  if (lp.les > 0.0) { let pn = sqrt(P[0] * P[0] + P[1] * P[1] + P[2] * P[2] + 2.0 * (P[3] * P[3] + P[4] * P[4] + P[5] * P[5])); t = 0.5 * (lp.tau + sqrt(lp.tau * lp.tau + lp.les * pn / rho)); }
  if (lp.wm != 0u) { t = max(t, tauMin[n]); tauEff[n] = t; }
  if (lp.hrr < 1.0) { // finite-difference strain rate from the neighbours' velocities (central, one-sided next to a cell without one)
    let c = loc(n); var ok = true; var G = array<vec3f, 3>(vec3f(0.0), vec3f(0.0), vec3f(0.0));
    for (var a = 0u; a < 3u; a++) {
      let e = vec3i(select(0, 1, a == 0u), select(0, 1, a == 1u), select(0, 1, a == 2u)); let pp = cell(c.x + e.x, c.y + e.y, c.z + e.z); let mm = cell(c.x - e.x, c.y - e.y, c.z - e.z);
      let hp = pp >= 0 && mac[4u * u32(max(pp, 0))] > 0.0; let hm = mm >= 0 && mac[4u * u32(max(mm, 0))] > 0.0;
      if (!hp && !hm) { ok = false; break; }
      let up = select(u, vec3f(mac[4u * u32(max(pp, 0)) + 1u], mac[4u * u32(max(pp, 0)) + 2u], mac[4u * u32(max(pp, 0)) + 3u]), hp);
      let um = select(u, vec3f(mac[4u * u32(max(mm, 0)) + 1u], mac[4u * u32(max(mm, 0)) + 2u], mac[4u * u32(max(mm, 0)) + 3u]), hm);
      G[a] = (up - um) / select(1.0, 2.0, hp && hm); }
    if (ok) { let k0 = -2.0 / 3.0 * rho * t; let s = 1.0 - lp.hrr; let h = lp.hrr;
      P[0] = h * P[0] + s * k0 * G[0].x; P[1] = h * P[1] + s * k0 * G[1].y; P[2] = h * P[2] + s * k0 * G[2].z;
      P[3] = h * P[3] + s * k0 * 0.5 * (G[0].y + G[1].x); P[4] = h * P[4] + s * k0 * 0.5 * (G[0].z + G[2].x); P[5] = h * P[5] + s * k0 * 0.5 * (G[1].z + G[2].y); }
  }
  let kk = 1.0 - 1.0 / t; var sg = 0.0; if (lp.sponge != 0u) { sg = sponge[n % lp.n0]; }
  for (var q = 0u; q < 19u; q++) { var v = feq(q, rho, u) + kk * h2(q, P);
    if (sg > 0.0) { v += sg * (feq(q, 1.0, vec3f(lp.uin, 0.0, 0.0)) - v); }
    post[q * lp.N + n] = v; }
}
@compute @workgroup_size(64) fn pull(@builtin(global_invocation_id) g: vec3u, @builtin(num_workgroups) nw: vec3u) {
  let n = gid(g, nw); if (n >= lp.N || (flags[n] & 3u) == 1u) { return; }
  let c = loc(n);
  for (var q = 0u; q < 19u; q++) { let s = cell(c.x - CX[q], c.y - CY[q], c.z - CZ[q]); if (s >= 0) { f[q * lp.N + n] = post[q * lp.N + u32(s)]; } }
}
@compute @workgroup_size(64) fn faces(@builtin(global_invocation_id) g: vec3u, @builtin(num_workgroups) nw: vec3u) {
  let t = gid(g, nw); if (t >= lp.cnt) { return; }
  let n = u32(faceL[4u * t]); let q = u32(faceL[4u * t + 1u]); let s = u32(faceL[4u * t + 2u]); let qs = u32(faceL[4u * t + 3u]);
  f[q * lp.N + n] = post[qs * lp.N + s] + faceK[t];
}
// inlet (x = 0) and outlet (x = last) of level 0; wallPop: per plane cell, bit q set where a no-slip wall face owns that population
@compute @workgroup_size(64) fn inlet(@builtin(global_invocation_id) g: vec3u, @builtin(num_workgroups) nw: vec3u) {
  let m = gid(g, nw); if (m >= lp.n1 * lp.n2) { return; }
  let n = m * lp.n0; let wp = wallPop[m];
  for (var q = 1u; q < 19u; q++) { if (CX[q] <= 0 || ((wp >> q) & 1u) != 0u) { continue; } f[q * lp.N + n] = post[OPP[q] * lp.N + n] + 6.0 * W[q] * f32(CX[q]) * lp.uin; }
}
@compute @workgroup_size(64) fn outlet(@builtin(global_invocation_id) g: vec3u, @builtin(num_workgroups) nw: vec3u) {
  let m = gid(g, nw); if (m >= lp.n1 * lp.n2) { return; }
  let n = m * lp.n0 + lp.n0 - 1u; let p = n - 1u; let wp = wallPop[lp.n1 * lp.n2 + m];
  var rho = 0.0; var j = vec3f(0.0);
  for (var q = 0u; q < 19u; q++) { let v = f[q * lp.N + p]; rho += v; j += v * vec3f(f32(CX[q]), f32(CY[q]), f32(CZ[q])); }
  let u = j / rho; let uu = 1.5 * dot(u, u);
  for (var q = 1u; q < 19u; q++) { if (CX[q] >= 0 || ((wp >> q) & 1u) != 0u) { continue; }
    let cu = f32(CX[q]) * u.x + f32(CY[q]) * u.y + f32(CZ[q]) * u.z; let e = cu * (3.0 + 4.5 * cu) - uu;
    f[q * lp.N + n] = W[q] * (1.0 + e) + (f[q * lp.N + p] - W[q] * rho * (1.0 + e)); }
}
// wall model (refine.mjs stream): slip velocity of every wall-model cell from its post-collision state; bcGeo = normal (3) and wall distance
fn reich(yp: f32) -> f32 { return log(1.0 + 0.41 * yp) / 0.41 + 7.8 * (1.0 - exp(-yp / 11.0) - yp / 11.0 * exp(-yp / 3.0)); }
fn reichD(yp: f32) -> f32 { return 1.0 / (1.0 + 0.41 * yp) + 7.8 * (exp(-yp / 11.0) / 11.0 - exp(-yp / 3.0) / 11.0 + yp / 33.0 * exp(-yp / 3.0)); }
@compute @workgroup_size(64) fn wallModel(@builtin(global_invocation_id) g: vec3u, @builtin(num_workgroups) nw: vec3u) {
  let i = gid(g, nw); if (i >= lp.cnt) { return; }
  let n = u32(bcCell[i]); var rho = 0.0; var j = vec3f(0.0);
  for (var q = 0u; q < 19u; q++) { let v = post[q * lp.N + n]; rho += v; j += v * vec3f(f32(CX[q]), f32(CY[q]), f32(CZ[q])); }
  let u = j / rho; let nv = vec3f(bcGeo[4u * i], bcGeo[4u * i + 1u], bcGeo[4u * i + 2u]); let y = bcGeo[4u * i + 3u]; let tv = u - dot(u, nv) * nv;
  var uf = vec3f(utF[3u * i], utF[3u * i + 1u], utF[3u * i + 2u]);
  if (uf.x > 1e29) { uf = tv; } else { uf += lp.filt * (tv - uf); }
  utF[3u * i] = uf.x; utF[3u * i + 1u] = uf.y; utF[3u * i + 2u] = uf.z;
  let ut = length(uf); let nu = lp.nu; var ut2 = 0.0;
  if (ut > 0.0) { ut2 = sqrt(nu * ut / y);
    for (var it = 0; it < 30; it++) { let yp = y * ut2 / nu; let gg = ut2 * reich(yp) - ut; let dg = reich(yp) + yp * reichD(yp); let un = max(ut2 - gg / dg, 0.1 * ut2);
      if (abs(un - ut2) < 1e-7 * ut2) { ut2 = un; break; } ut2 = un; } }
  let nuT = max(0.0, 0.41 * ut2 * y - nu); let nuE = max(nu + nuT, (tauEff[n] - 0.5) / 3.0);
  tauMin[n] = 0.5 + 3.0 * (nu + nuT);
  var k = 0.0; if (ut > 0.0) { k = min(ut, max(0.0, ut - ut2 * ut2 * y / nuE)) / ut; }
  utauO[i] = ut2; uw[3u * i] = k * uf.x; uw[3u * i + 1u] = k * uf.y; uw[3u * i + 2u] = k * uf.z;
}
// Bouzidi interpolated bounce-back + momentum exchange, accumulated per link over the sub-steps of one coarse step; links: n, q, n2, q * 1e6, wall-model slot
@compute @workgroup_size(64) fn bouzidi(@builtin(global_invocation_id) g: vec3u, @builtin(num_workgroups) nw: vec3u) {
  let l = gid(g, nw); if (l >= lp.cnt) { return; }
  let n = u32(links[5u * l]); let q = u32(links[5u * l + 1u]); let n2 = links[5u * l + 2u]; let qq = f32(links[5u * l + 3u]) * 1e-6; let oq = OPP[q]; let bi = links[5u * l + 4u];
  let pq = post[q * lp.N + n]; var v = pq;
  if (qq < 0.5 && n2 >= 0) { v = 2.0 * qq * pq + (1.0 - 2.0 * qq) * post[q * lp.N + u32(n2)]; }
  else if (qq >= 0.5) { v = pq / (2.0 * qq) + (2.0 * qq - 1.0) / (2.0 * qq) * post[oq * lp.N + n]; }
  if (lp.wm != 0u && bi >= 0) { let b = u32(bi); let cw = f32(CX[oq]) * uw[3u * b] + f32(CY[oq]) * uw[3u * b + 1u] + f32(CZ[oq]) * uw[3u * b + 2u];
    v += select(1.0, 1.0 / (2.0 * qq), qq >= 0.5) * 6.0 * W[oq] * cw; }
  f[oq * lp.N + n] = v; let m = pq + v;
  lfAcc[3u * l] += f32(CX[q]) * m; lfAcc[3u * l + 1u] += f32(CY[q]) * m; lfAcc[3u * l + 2u] += f32(CZ[q]) * m;
}

// ---------- interface (this level = parent: f, post; child: fc, pc) ----------
fn moments(arr: ptr<function, array<f32, 19>>) -> array<f32, 10> {
  var rho = 0.0; var j = vec3f(0.0); var P = array<f32, 6>(0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
  for (var q = 0u; q < 19u; q++) { let v = (*arr)[q]; let x = f32(CX[q]); let y = f32(CY[q]); let z = f32(CZ[q]);
    rho += v; j += v * vec3f(x, y, z); P[0] += v * x * x; P[1] += v * y * y; P[2] += v * z * z; P[3] += v * x * y; P[4] += v * x * z; P[5] += v * y * z; }
  let u = j / rho; let r3 = rho / 3.0;
  return array<f32, 10>(rho, u.x, u.y, u.z, P[0] - r3 - rho * u.x * u.x, P[1] - r3 - rho * u.y * u.y, P[2] - r3 - rho * u.z * u.z, P[3] - rho * u.x * u.y, P[4] - rho * u.x * u.z, P[5] - rho * u.y * u.z);
}
// coarse cells inside the box <- mean moments of their 8 children (child f at time t), Pi rescaled to the coarse level; cgT: n, 8 children
@compute @workgroup_size(64) fn restrictCg(@builtin(global_invocation_id) g: vec3u, @builtin(num_workgroups) nw: vec3u) {
  let i = gid(g, nw); if (i >= ip.cnt) { return; }
  var acc = array<f32, 10>(0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
  for (var c = 0u; c < 8u; c++) { let s = u32(cgT[9u * i + 1u + c]); var fv: array<f32, 19>; for (var q = 0u; q < 19u; q++) { fv[q] = fc[q * ip.cN + s]; }
    let m = moments(&fv); for (var a = 0u; a < 10u; a++) { acc[a] += m[a] * 0.125; } }
  let n = u32(cgT[9u * i]); let P = array<f32, 6>(acc[4] * ip.kc, acc[5] * ip.kc, acc[6] * ip.kc, acc[7] * ip.kc, acc[8] * ip.kc, acc[9] * ip.kc); let u = vec3f(acc[1], acc[2], acc[3]);
  for (var q = 0u; q < 19u; q++) { post[q * ip.pN + n] = feq(q, acc[0], u) + h2(q, P); }
}
@compute @workgroup_size(64) fn fieldMoments0(@builtin(global_invocation_id) g: vec3u, @builtin(num_workgroups) nw: vec3u) {
  let i = gid(g, nw); if (i >= ip.cnt) { return; }
  let n = u32(slots[i]); var fv: array<f32, 19>; for (var q = 0u; q < 19u; q++) { fv[q] = f[q * ip.pN + n]; }
  let m = moments(&fv); for (var a = 0u; a < 10u; a++) { MF0[10u * i + a] = m[a]; }
}
@compute @workgroup_size(64) fn fieldMoments1(@builtin(global_invocation_id) g: vec3u, @builtin(num_workgroups) nw: vec3u) {
  let i = gid(g, nw); if (i >= ip.cnt) { return; }
  let n = u32(slots[i]); var fv: array<f32, 19>; for (var q = 0u; q < 19u; q++) { fv[q] = f[q * ip.pN + n]; }
  let m = moments(&fv); for (var a = 0u; a < 10u; a++) { MF1[10u * i + a] = m[a]; }
}
// Taylor reconstruction of ring cell r at offsets off from the stencil moments (rsten: pn slot, then kind, n1 slot, n2 slot per axis)
fn recon(useMF1: bool, r: u32, off: vec3f) -> array<f32, 10> {
  var out: array<f32, 10>; let pn = u32(rsten[10u * r]);
  for (var j = 0u; j < 10u; j++) { out[j] = select(MF0[10u * pn + j], MF1[10u * pn + j], useMF1); }
  for (var a = 0u; a < 3u; a++) { let kd = rsten[10u * r + 1u + 3u * a]; if (kd == 3) { continue; } let n1 = u32(rsten[10u * r + 2u + 3u * a]); let n2 = u32(rsten[10u * r + 3u + 3u * a]);
    for (var j = 0u; j < 10u; j++) {
      let v0 = select(MF0[10u * pn + j], MF1[10u * pn + j], useMF1); let v1 = select(MF0[10u * n1 + j], MF1[10u * n1 + j], useMF1); let v2 = select(MF0[10u * n2 + j], MF1[10u * n2 + j], useMF1);
      let vm = MSIGN[10u * a + j] * v0; var gr = 0.0;
      if (kd == 0) { gr = 0.5 * (v1 - v2); } else if (kd == 1) { gr = 1.5 * v0 - 2.0 * v1 + 0.5 * v2; } else if (kd == 2) { gr = -1.5 * v0 + 2.0 * v1 - 0.5 * v2; }
      else if (kd == 4) { gr = 0.5 * (v1 - vm); } else { gr = 0.5 * (vm - v1); }
      out[j] += off[a] * gr; } }
  return out;
}
// fine ghosts from the ring parent's moments at t + k/2; ghosts: child cell, ring index, offset bits (bit a: +1/4 else -1/4 coarse cells)
@compute @workgroup_size(64) fn fillGhosts(@builtin(global_invocation_id) g: vec3u, @builtin(num_workgroups) nw: vec3u) {
  let t = gid(g, nw); if (t >= ip.cnt) { return; }
  let s = u32(ghosts[3u * t]); let r = u32(ghosts[3u * t + 1u]); let b = u32(ghosts[3u * t + 2u]);
  let off = vec3f(select(-0.25, 0.25, (b & 1u) != 0u), select(-0.25, 0.25, (b & 2u) != 0u), select(-0.25, 0.25, (b & 4u) != 0u));
  var m = recon(false, r, off);
  if (ip.k == 1u) { let m1 = recon(true, r, off); for (var j = 0u; j < 10u; j++) { m[j] = 0.5 * (m[j] + m1[j]); } }
  let P = array<f32, 6>(m[4] * ip.kf, m[5] * ip.kf, m[6] * ip.kf, m[7] * ip.kf, m[8] * ip.kf, m[9] * ip.kf); let u = vec3f(m[1], m[2], m[3]);
  for (var q = 0u; q < 19u; q++) { pc[q * ip.cN + s] = feq(q, m[0], u) + h2(q, P); }
}
// refluxing packets (dm, j) of the coarse links of the ring cells after the coarse stream (rcl: ring cell, value q, sign, arrival q)
@compute @workgroup_size(64) fn refluxCoarse(@builtin(global_invocation_id) g: vec3u, @builtin(num_workgroups) nw: vec3u) {
  let t = gid(g, nw); if (t >= ip.cnt) { return; }
  let n = u32(ringC[rcl[4u * t]]); let q = u32(rcl[4u * t + 1u]); let qa = u32(rcl[4u * t + 3u]);
  let v = select(-f[q * ip.pN + n], post[q * ip.pN + n], rcl[4u * t + 2u] > 0);
  let o = 4u * (ip.off + t); rfE[o] = v; rfE[o + 1u] = v * f32(CX[qa]); rfE[o + 2u] = v * f32(CY[qa]); rfE[o + 3u] = v * f32(CZ[qa]);
}
// ... and of the fine links between ghost children and the box before each fine stream (rfl: ring, value q, from, sign, arrival q)
@compute @workgroup_size(64) fn refluxFine(@builtin(global_invocation_id) g: vec3u, @builtin(num_workgroups) nw: vec3u) {
  let t = gid(g, nw); if (t >= ip.cnt) { return; }
  let q = u32(rfl[5u * t + 1u]); let src0 = u32(rfl[5u * t + 2u]); let qa = u32(rfl[5u * t + 4u]);
  let v = -f32(rfl[5u * t + 3u]) * ip.wv * pc[q * ip.cN + src0];
  let o = 4u * (ip.off + t); rfE[o] = v; rfE[o + 1u] = v * f32(CX[qa]); rfE[o + 2u] = v * f32(CY[qa]); rfE[o + 3u] = v * f32(CZ[qa]);
}
var<workgroup> red: array<vec4f, 256>;
@compute @workgroup_size(256) fn refluxSum(@builtin(local_invocation_id) li: vec3u) {
  var s = vec4f(0.0); var c = vec4f(0.0);
  for (var t = li.x; t < ip.cnt; t += 256u) { let v = vec4f(rfE[4u * t], rfE[4u * t + 1u], rfE[4u * t + 2u], rfE[4u * t + 3u]) - c; let y = s + v; c = (y - s) - v; s = y; } // Kahan
  red[li.x] = s; workgroupBarrier();
  for (var w = 128u; w > 0u; w >>= 1u) { if (li.x < w) { red[li.x] += red[li.x + w]; } workgroupBarrier(); }
  if (li.x == 0u) { rfSum[0] = red[0].x / ip.nr; rfSum[1] = red[0].y / ip.nr; rfSum[2] = red[0].z / ip.nr; rfSum[3] = red[0].w / ip.nr; }
}
@compute @workgroup_size(64) fn refluxApply(@builtin(global_invocation_id) g: vec3u, @builtin(num_workgroups) nw: vec3u) {
  let i = gid(g, nw); if (i >= ip.cnt) { return; }
  let n = u32(ringC[i]); let dm = rfSum[0]; let jv = vec3f(rfSum[1], rfSum[2], rfSum[3]);
  for (var q = 0u; q < 19u; q++) { f[q * ip.pN + n] += W[q] * (dm + 3.0 * (f32(CX[q]) * jv.x + f32(CY[q]) * jv.y + f32(CZ[q]) * jv.z)); }
}
// per level: largest |rho - 1| and |u| over active fluid cells (one workgroup; extremes for the diagnostics)
@compute @workgroup_size(256) fn extremes(@builtin(local_invocation_id) li: vec3u) {
  var mx = vec4f(0.0);
  for (var n = li.x; n < lp.N; n += 256u) { if (flags[n] != 0u) { continue; } var rho = 0.0; var j = vec3f(0.0);
    for (var q = 0u; q < 19u; q++) { let v = f[q * lp.N + n]; rho += v; j += v * vec3f(f32(CX[q]), f32(CY[q]), f32(CZ[q])); }
    let dr = abs(rho - 1.0); let um = length(j) / rho; if (dr > mx.x) { mx.x = dr; mx.y = f32(n); } if (um > mx.z) { mx.z = um; mx.w = f32(n); } }
  red[li.x] = mx; workgroupBarrier();
  for (var w = 128u; w > 0u; w >>= 1u) { if (li.x < w) { let a = red[li.x]; let b = red[li.x + w]; red[li.x] = vec4f(select(a.xy, b.xy, b.x > a.x), select(a.zw, b.zw, b.z > a.z)); } workgroupBarrier(); }
  if (li.x == 0u) { rfSum[0] = red[0].x; rfSum[1] = red[0].y; rfSum[2] = red[0].z; rfSum[3] = red[0].w; }
}
`;

export async function createRefineGpu(device, S, o) {
  const unsupported = [['model', (o.model || 'reg') !== 'reg'], ['method', (o.method || 'V0') !== 'N1C'], ['force', !!o.force], ['recursive', !!o.recursive], ['tauBulk', !!o.tauBulk],
    ['iface', !!o.iface], ['cgGrad', !!o.cgGrad], ['neq', o.neq === 'grad'], ['restrict', (o.restrict || 2) !== 2], ['interpSpace', (o.interpSpace || 1) !== 1], ['interpTime', (o.interpTime || 1) !== 1],
    ['lattice', o.lattice !== 'D3Q19'], ['mirror', o.mirror === false]].filter(x => x[1]).map(x => x[0]);
  if (unsupported.length) throw Error('refine-webgpu: not ported: ' + unsupported.join(', '));
  const mod = device.createShaderModule({ code: WGSL }), info = await mod.getCompilationInfo(), errs = info.messages.filter(m => m.type === 'error');
  if (errs.length) throw Error('WGSL: ' + errs.map(e => e.lineNum + ': ' + e.message).join('; '));
  const SU = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC;
  const mk = (data, usage = SU) => { const b = device.createBuffer({ size: Math.max(16, Math.ceil(data.byteLength / 4) * 4), usage }); if (data.byteLength) device.queue.writeBuffer(b, 0, data); return b; };
  const zeros = (n, C = Float32Array) => mk(new C(Math.max(4, n)));
  const uni = ab => mk(ab, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  const pipes = {}; for (const e of ['initEq', 'macroVel', 'collide', 'pull', 'faces', 'inlet', 'outlet', 'wallModel', 'bouzidi', 'restrictCg', 'fieldMoments0', 'fieldMoments1', 'fillGhosts', 'refluxCoarse', 'refluxFine', 'refluxSum', 'refluxApply', 'extremes'])
    pipes[e] = device.createComputePipeline({ layout: 'auto', compute: { module: mod, entryPoint: e } });
  const bind = (e, map) => device.createBindGroup({ layout: pipes[e].getBindGroupLayout(0), entries: Object.entries(map).map(([b, buf]) => ({ binding: +b, resource: { buffer: buf } })) });
  const hrr = o.hrr < 1 ? o.hrr : 1, les = (o.cs || 0) ** 2 * 18 * Math.SQRT2, U = o.U || 0, io = !!o.inletOutlet, Bl = o.body ? o.body.level : -1, wmOn = !!(o.body && o.body.wallModel);
  const dummy = () => zeros(4), levels = S.levels; // a fresh one per binding: one buffer may not back two writable bindings of a dispatch
  // ---------- per level ----------
  const G = levels.map(L => {
    const isB = L.l === Bl, N = L.N, flagsA = new Uint32Array(N); for (let n = 0; n < N; n++) flagsA[n] = L.mask[n] | (L.solid[n] << 2);
    const g = { L, N, f: zeros(19 * N), post: zeros(19 * N), flags: mk(flagsA), mac: hrr < 1 ? zeros(4 * N) : dummy() };
    g.nFace = L.faceLinks.length / 4; g.faceL = mk(Int32Array.from(L.faceLinks)); g.faceK = mk(Float32Array.from(L.faceK));
    if (L.l === 0 && o.sponge && o.sponge.Lo > 0) { const nx = L.n[0], Lo = o.sponge.Lo, sg = new Float32Array(nx); for (let i = nx - Lo; i < nx; i++) sg[i] = o.sponge.sigma * ((i - (nx - Lo) + 1) / Lo) ** 2; g.sponge = mk(sg); g.hasSponge = true; } else g.sponge = dummy();
    if (L.l === 0 && io) { const nyz = L.n[1] * L.n[2], wp = new Uint32Array(2 * nyz);
      if (L.wallPop) for (let m = 0; m < nyz; m++) for (let q = 1; q < 19; q++) { if (L.wallPop[q * N + m * L.n[0]]) wp[m] |= 1 << q; if (L.wallPop[q * N + m * L.n[0] + L.n[0] - 1]) wp[nyz + m] |= 1 << q; }
      g.wallPop = mk(wp); } else g.wallPop = dummy();
    g.tauEff = isB && wmOn ? mk(new Float32Array(N).fill(L.tau)) : dummy(); g.tauMin = isB && wmOn ? zeros(N) : dummy();
    if (isB) { const nL = L.nL, lk = new Int32Array(5 * nL); for (let l = 0; l < nL; l++) { for (let k = 0; k < 4; k++) lk[5 * l + k] = L.links[4 * l + k]; lk[5 * l + 4] = wmOn ? L.bcIndex[L.links[4 * l]] : -1; }
      g.nL = nL; g.links = mk(lk); g.lfAcc = zeros(3 * nL);
      if (wmOn) { const nb = L.bc.length, geo = new Float32Array(4 * nb); for (let i = 0; i < nb; i++) { geo.set([L.bcN[3 * i], L.bcN[3 * i + 1], L.bcN[3 * i + 2], L.bcY[i]], 4 * i); }
        g.nb = nb; g.bcCell = mk(Int32Array.from(L.bc)); g.bcGeo = mk(geo); g.utF = mk(new Float32Array(3 * nb).fill(1e30)); g.uw = zeros(3 * nb); g.utau = zeros(nb); } }
    const lpB = (cnt, extra = {}) => { const ab = new ArrayBuffer(80), v = new DataView(ab);
      [L.n[0], L.n[1], L.n[2], N].forEach((x, i) => v.setUint32(4 * i, x, true)); [0, 1, 2].forEach(a => v.setInt32(16 + 4 * a, L.lo[a] - L.gLo[a], true));
      v.setUint32(28, (L.per[0] ? 1 : 0) | (L.per[1] ? 2 : 0) | (L.per[2] ? 4 : 0), true); v.setFloat32(32, L.tau, true); v.setFloat32(36, les, true); v.setFloat32(40, hrr, true); v.setFloat32(44, U, true);
      v.setUint32(48, g.hasSponge ? 1 : 0, true); v.setUint32(52, isB && wmOn ? 1 : 0, true); v.setUint32(56, cnt, true); v.setFloat32(60, (L.tau - .5) / 3, true); v.setFloat32(64, isB && wmOn ? 1 / L.wmFilter : 1, true);
      return uni(ab); };
    g.lp = lpB(0); g.lpFace = lpB(g.nFace); if (isB) { g.lpLinks = lpB(g.nL); if (wmOn) g.lpBc = lpB(g.nb); }
    g.bg = {
      initEq: bind('initEq', { 0: g.lp, 1: g.f, 2: g.post, 3: g.flags }), macro: hrr < 1 ? bind('macroVel', { 0: g.lp, 1: g.f, 3: g.flags, 4: g.mac }) : null,
      collide: bind('collide', { 0: g.lp, 1: g.f, 2: g.post, 3: g.flags, 4: g.mac, 5: g.sponge, 6: g.tauEff, 7: g.tauMin }), // unused ones are small dummies (the layout lists every static use)
      pull: bind('pull', { 0: g.lp, 1: g.f, 2: g.post, 3: g.flags }), faces: g.nFace ? bind('faces', { 0: g.lpFace, 1: g.f, 2: g.post, 8: g.faceL, 9: g.faceK }) : null,
      inlet: L.l === 0 && io ? bind('inlet', { 0: g.lp, 1: g.f, 2: g.post, 10: g.wallPop }) : null, outlet: L.l === 0 && io ? bind('outlet', { 0: g.lp, 1: g.f, 10: g.wallPop }) : null,
      wallModel: isB && wmOn ? bind('wallModel', { 0: g.lpBc, 2: g.post, 6: g.tauEff, 7: g.tauMin, 13: g.bcCell, 14: g.bcGeo, 15: g.utF, 16: g.uw, 17: g.utau }) : null,
      bouzidi: isB ? bind('bouzidi', { 0: g.lpLinks, 1: g.f, 2: g.post, 11: g.links, 12: g.lfAcc, 16: wmOn ? g.uw : dummy() }) : null,
      extremes: null };
    g.ext = zeros(4); g.bg.extremes = bind('extremes', { 0: g.lp, 1: g.f, 3: g.flags, 32: g.ext });
    return g;
  });
  // ---------- per interface (parent P with child level) ----------
  for (const g of G) {
    const P = g.L, ch = P.child; if (!ch) continue; const gc = G[ch.l];
    const slotOf = new Map(Array.from(P.stenCells, (n, k) => [n, k])), nr = P.ring.length, rs = new Int32Array(10 * nr);
    for (let i = 0; i < nr; i++) { rs[10 * i] = slotOf.get(P.ring[i]); for (let a = 0; a < 3; a++) { const kd = P.sten[9 * i + 3 * a]; rs[10 * i + 1 + 3 * a] = kd;
      rs[10 * i + 2 + 3 * a] = kd === 3 ? 0 : slotOf.get(P.sten[9 * i + 3 * a + 1]); rs[10 * i + 3 + 3 * a] = kd === 3 ? 0 : slotOf.get(P.sten[9 * i + 3 * a + 2]); } }
    const gh = []; for (let s = 0; s < ch.N; s++) { const i = ch.ghostRing[s]; if (i < 0) continue; const pn = ch.ghostParent[s]; let bits = 0;
      for (let a = 0; a < 3; a++) if (ch.coord[3 * s + a] - 2 * P.coord[3 * pn + a] === 1) bits |= 1 << a; gh.push(s, i, bits); }
    const cgT = new Int32Array(9 * P.cg.length); P.cg.forEach((n, i) => { cgT[9 * i] = n; P.cgKids[i].forEach((s, c) => { cgT[9 * i + 1 + c] = s; }); });
    const nrcl = P.rcl.length / 4, nrfl = P.rfl.length / 5, ns = P.stenCells.length;
    const I = { nr, ncg: P.cg.length, ns, ngh: gh.length / 3, nrcl, nrfl, rsten: mk(rs), ghosts: mk(Int32Array.from(gh)), cgT: mk(cgT), slots: mk(Int32Array.from(P.stenCells)),
      MF0: zeros(10 * ns), MF1: zeros(10 * ns), rcl: mk(Int32Array.from(P.rcl)), rfl: mk(Int32Array.from(P.rfl)), ringC: mk(Int32Array.from(P.ring)), rfE: zeros(4 * (nrcl + 2 * nrfl)), rfSum: zeros(4) };
    const tC = P.tau, tF = ch.tau, ipB = (cnt, off, k) => { const ab = new ArrayBuffer(48), v = new DataView(ab);
      v.setUint32(0, P.N, true); v.setUint32(4, ch.N, true); v.setUint32(8, cnt, true); v.setUint32(12, off, true); v.setFloat32(16, tC, true); v.setFloat32(20, tF, true);
      v.setFloat32(24, (1 - 1 / tC) * 2 * tC / tF, true); v.setFloat32(28, (1 - 1 / tF) * tF / (2 * tC), true); v.setFloat32(32, 2 ** -3, true); v.setFloat32(36, nr, true); v.setUint32(40, k, true); return uni(ab); };
    I.bg = {
      restrict: bind('restrictCg', { 20: ipB(I.ncg, 0, 0), 2: g.post, 21: gc.f, 23: I.cgT }),
      fm0: bind('fieldMoments0', { 20: ipB(ns, 0, 0), 1: g.f, 24: I.MF0, 26: I.slots }), fm1: bind('fieldMoments1', { 20: ipB(ns, 0, 0), 1: g.f, 25: I.MF1, 26: I.slots }),
      fill: [0, 1].map(k => bind('fillGhosts', { 20: ipB(I.ngh, 0, k), 22: gc.post, 24: I.MF0, 25: I.MF1, 27: I.ghosts, 28: I.rsten })),
      rc: bind('refluxCoarse', { 20: ipB(nrcl, 0, 0), 1: g.f, 2: g.post, 29: I.rcl, 31: I.rfE, 33: I.ringC }),
      rf: [0, 1].map(k => bind('refluxFine', { 20: ipB(nrfl, nrcl + k * nrfl, k), 22: gc.post, 30: I.rfl, 31: I.rfE })),
      sum: bind('refluxSum', { 20: ipB(nrcl + 2 * nrfl, 0, 0), 31: I.rfE, 32: I.rfSum }), apply: bind('refluxApply', { 20: ipB(nr, 0, 0), 1: g.f, 32: I.rfSum, 33: I.ringC }) };
    g.I = I;
  }
  // ---------- stepping ----------
  const disp = (c, e, bg, n) => { if (!n || !bg) return; c.setPipeline(pipes[e]); c.setBindGroup(0, bg); const w = Math.ceil(n / 64), x = Math.min(w, 65535); c.dispatchWorkgroups(x, Math.ceil(w / x)); };
  const one = (c, e, bg) => { c.setPipeline(pipes[e]); c.setBindGroup(0, bg); c.dispatchWorkgroups(1); };
  function adv(c, g, k) {
    const L = g.L, I = g.I;
    if (I) { disp(c, 'restrictCg', I.bg.restrict, I.ncg); disp(c, 'fieldMoments0', I.bg.fm0, I.ns); }
    if (hrr < 1) disp(c, 'macroVel', g.bg.macro, g.N);
    disp(c, 'collide', g.bg.collide, g.N);
    if (L.parent) { const pI = G[L.parent.l].I; disp(c, 'fillGhosts', pI.bg.fill[k], pI.ngh); disp(c, 'refluxFine', pI.bg.rf[k], pI.nrfl); }
    disp(c, 'pull', g.bg.pull, g.N); disp(c, 'faces', g.bg.faces, g.nFace);
    if (L.l === 0 && io) { const nyz = L.n[1] * L.n[2]; disp(c, 'inlet', g.bg.inlet, nyz); disp(c, 'outlet', g.bg.outlet, nyz); }
    if (L.l === Bl) { if (wmOn) disp(c, 'wallModel', g.bg.wallModel, g.nb); disp(c, 'bouzidi', g.bg.bouzidi, g.nL); }
    if (I) { disp(c, 'fieldMoments1', I.bg.fm1, I.ns); disp(c, 'refluxCoarse', I.bg.rc, I.nrcl); const gc = G[L.child.l]; adv(c, gc, 0); adv(c, gc, 1); one(c, 'refluxSum', I.bg.sum); disp(c, 'refluxApply', I.bg.apply, I.nr); }
  }
  const st = { levels: G, step: 0, subSteps: Bl >= 0 ? 2 ** Bl : 0 };
  // initial state: the CPU instance's populations (tests), or uniform free stream (o.topologyOnly)
  st.upload = () => { for (const g of G) { device.queue.writeBuffer(g.f, 0, Float32Array.from(g.L.f)); device.queue.writeBuffer(g.post, 0, Float32Array.from(g.L.post)); } };
  st.init = () => { const e = device.createCommandEncoder(), c = e.beginComputePass(); for (const g of G) disp(c, 'initEq', g.bg.initEq, g.N); c.end(); device.queue.submit([e.finish()]); };
  // n coarse steps; the momentum exchange is summed over the body level's sub-steps of the last coarse step (as st.force in refine.mjs)
  st.advance = (n = 1) => { const e = device.createCommandEncoder(); const gB = Bl >= 0 ? G[Bl] : null;
    for (let s = 0; s < n; s++) { if (gB) e.clearBuffer(gB.lfAcc); const c = e.beginComputePass(); adv(c, G[0], 0); c.end(); }
    device.queue.submit([e.finish()]); st.step += n; };
  st.finish = () => device.queue.onSubmittedWorkDone();
  const read = async (src, bytes, C = Float32Array) => { const r = device.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }), e = device.createCommandEncoder();
    e.copyBufferToBuffer(src, 0, r, 0, bytes); device.queue.submit([e.finish()]); await r.mapAsync(GPUMapMode.READ); const out = new C(r.getMappedRange().slice(0)); r.unmap(); r.destroy(); return out; };
  st.readLevelF = l => read(G[l].f, 4 * 19 * G[l].N);
  st.forceLinks = async () => { const g = G[Bl], a = await read(g.lfAcc, 4 * 3 * g.nL); for (let i = 0; i < a.length; i++) a[i] /= st.subSteps; return a; };
  st.force = async () => { if (Bl < 0) return [0, 0, 0]; const a = await st.forceLinks(), s = [0, 0, 0]; for (let l = 0; l < a.length / 3; l++) for (let d = 0; d < 3; d++) s[d] += a[3 * l + d]; return s; };
  st.wall = async () => { if (!wmOn) return null; const g = G[Bl], u = await read(g.utau, 4 * g.nb); let m = 0; for (const v of u) m += v; return { cells: g.nb, utauMean: m / g.nb }; };
  st.extremes = async () => { const out = []; for (const g of G) { const e = device.createCommandEncoder(), c = e.beginComputePass(); c.setPipeline(pipes.extremes); c.setBindGroup(0, g.bg.extremes); c.dispatchWorkgroups(1); c.end(); device.queue.submit([e.finish()]);
    const r = await read(g.ext, 16); out.push({ level: g.L.l, drhoMax: r[0], rhoCell: r[1], umax: r[2], uCell: r[3] }); } return out; };
  return st;
}
export const REFINE_WGSL = WGSL;
