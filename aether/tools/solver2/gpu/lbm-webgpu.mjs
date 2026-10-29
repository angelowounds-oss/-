// CFD V3 P3: D3Q19 lattice Boltzmann on WebGPU compute (uniform grid), the GPU counterpart of tools/solver2/refine.mjs on one level.
// Regularized collision + Smagorinsky, inlet (x = 0, moving-wall bounce-back), outlet (x = nx - 1, fixed density with non-equilibrium extrapolation),
// outlet absorbing layer (full relaxation to the free stream), y and z faces periodic or walls (free-slip, or moving no-slip such as a rolling road; the
// same rules as refine.mjs, including box edges where two faces meet), one body with Bouzidi interpolated bounce-back and momentum exchange.
// Storage: two f32 buffers (f, post) in structure-of-arrays order f[q * N + n]; one step = 4 dispatches (collide, stream, outlet, body links).
// The force per link is written to a buffer and summed on readback (WGSL has no float atomics).
// createLbmGpu(device, { nx, ny, nz, tau, cs, U, sponge: Float32Array(nx) | null, solid: Uint8Array(N), links: Int32Array [n, q, n2, q * 1e6],
//   faces: { yLo, yHi, zLo, zHi: 'slip' | { type: 'wall', u: [ux, uy, uz] } } (missing = periodic) })
export const C19 = [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 1, 0], [-1, -1, 0], [1, -1, 0], [-1, 1, 0], [1, 0, 1], [-1, 0, -1], [1, 0, -1], [-1, 0, 1], [0, 1, 1], [0, -1, -1], [0, 1, -1], [0, -1, 1]];
const W19 = C19.map(c => { const s = Math.abs(c[0]) + Math.abs(c[1]) + Math.abs(c[2]); return s === 0 ? 1 / 3 : s === 1 ? 1 / 18 : 1 / 36; });
const OPP19 = C19.map(c => C19.findIndex(e => e[0] === -c[0] && e[1] === -c[1] && e[2] === -c[2]));
// MIRROR[4 q + m]: direction q with its y (m & 1) and/or z (m & 2) component reversed
const MIRROR = C19.flatMap(c => [0, 1, 2, 3].map(m => C19.findIndex(e => e[0] === c[0] && e[1] === (m & 1 ? -c[1] : c[1]) && e[2] === (m & 2 ? -c[2] : c[2]))));
const arr = (name, type, v) => `const ${name} = array<${type}, 19>(${v.map(x => type === 'f32' ? x.toPrecision(9) : String(x)).join(', ')});`;
const WGSL = () => `
struct P { nx: u32, ny: u32, nz: u32, N: u32, tau: f32, les: f32, uin: f32, nLinks: u32, face: vec4u, uy0: vec4f, uy1: vec4f, uz0: vec4f, uz1: vec4f } // face: y0 y1 z0 z1, 0 periodic 1 slip 2 wall
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read_write> f: array<f32>;
@group(0) @binding(2) var<storage, read_write> post: array<f32>;
@group(0) @binding(3) var<storage, read> solid: array<u32>;
@group(0) @binding(4) var<storage, read> sponge: array<f32>;
@group(0) @binding(5) var<storage, read> links: array<i32>;
@group(0) @binding(6) var<storage, read_write> lforce: array<f32>;
${arr('CX', 'i32', C19.map(c => c[0]))}
${arr('CY', 'i32', C19.map(c => c[1]))}
${arr('CZ', 'i32', C19.map(c => c[2]))}
${arr('W', 'f32', W19)}
${arr('OPP', 'u32', OPP19)}
const MIRROR = array<u32, 76>(${MIRROR.join(', ')});
fn idx3(i: u32, j: u32, k: u32) -> u32 { return i + p.nx * (j + p.ny * k); }
// how direction q reaches cell (j, k) across the y/z faces: x = 0 inside or periodic, 1 slip (y = mirror mask), 2 wall (yzw = wall velocity)
fn faceCase(q: u32, j: i32, k: i32) -> vec4f {
  let ny = i32(p.ny); let nz = i32(p.nz); let sj = j - CY[q]; let sk = k - CZ[q];
  var oy = 0u; var oz = 0u;
  if (sj < 0 && p.face.x != 0u) { oy = 1u; } else if (sj >= ny && p.face.y != 0u) { oy = 2u; }
  if (sk < 0 && p.face.z != 0u) { oz = 1u; } else if (sk >= nz && p.face.w != 0u) { oz = 2u; }
  if (oy == 0u && oz == 0u) { return vec4f(0.0); }
  if (oy == 1u && p.face.x == 2u) { return vec4f(2.0, p.uy0.xyz); } if (oy == 2u && p.face.y == 2u) { return vec4f(2.0, p.uy1.xyz); }
  if (oz == 1u && p.face.z == 2u) { return vec4f(2.0, p.uz0.xyz); } if (oz == 2u && p.face.w == 2u) { return vec4f(2.0, p.uz1.xyz); }
  return vec4f(1.0, f32(select(0u, 1u, oy != 0u) | select(0u, 2u, oz != 0u)), 0.0, 0.0);
}
@compute @workgroup_size(64) fn collide(@builtin(global_invocation_id) g: vec3u, @builtin(num_workgroups) nw: vec3u) {
  let gi = g.x + g.y * nw.x * 64u;
  let n = gi; if (n >= p.N || solid[n] != 0u) { return; }
  var rho = 0.0; var jx = 0.0; var jy = 0.0; var jz = 0.0; var pxx = 0.0; var pyy = 0.0; var pzz = 0.0; var pxy = 0.0; var pxz = 0.0; var pyz = 0.0;
  var fv: array<f32, 19>;
  for (var q = 0u; q < 19u; q++) { let v = f[q * p.N + n]; fv[q] = v; let a = f32(CX[q]); let b = f32(CY[q]); let c = f32(CZ[q]);
    rho += v; jx += v * a; jy += v * b; jz += v * c; pxx += v * a * a; pyy += v * b * b; pzz += v * c * c; pxy += v * a * b; pxz += v * a * c; pyz += v * b * c; }
  let ux = jx / rho; let uy = jy / rho; let uz = jz / rho; let r3 = rho / 3.0;
  pxx -= r3 + rho * ux * ux; pyy -= r3 + rho * uy * uy; pzz -= r3 + rho * uz * uz; pxy -= rho * ux * uy; pxz -= rho * ux * uz; pyz -= rho * uy * uz;
  var t = p.tau;
  if (p.les > 0.0) { let pn = sqrt(pxx * pxx + pyy * pyy + pzz * pzz + 2.0 * (pxy * pxy + pxz * pxz + pyz * pyz)); t = 0.5 * (p.tau + sqrt(p.tau * p.tau + p.les * pn / rho)); }
  let k = 4.5 * (1.0 - 1.0 / t); let tr = (pxx + pyy + pzz) / 3.0; let uu = 1.5 * (ux * ux + uy * uy + uz * uz);
  let i = n % p.nx; let s = sponge[i];
  for (var q = 0u; q < 19u; q++) { let a = f32(CX[q]); let b = f32(CY[q]); let c = f32(CZ[q]); let cu = a * ux + b * uy + c * uz;
    var v = W[q] * rho * (1.0 + 3.0 * cu + 4.5 * cu * cu - uu) + k * W[q] * (a * a * pxx + b * b * pyy + c * c * pzz + 2.0 * (a * b * pxy + a * c * pxz + b * c * pyz) - tr);
    if (s > 0.0) { let ce = a * p.uin; let et = W[q] * (1.0 + 3.0 * ce + 4.5 * ce * ce - 1.5 * p.uin * p.uin); v += s * (et - v); }
    post[q * p.N + n] = v; }
}
@compute @workgroup_size(64) fn stream(@builtin(global_invocation_id) g: vec3u, @builtin(num_workgroups) nw: vec3u) {
  let gi = g.x + g.y * nw.x * 64u;
  let n = gi; if (n >= p.N) { return; }
  let i = i32(n % p.nx); let j = i32((n / p.nx) % p.ny); let k = i32(n / (p.nx * p.ny));
  let nx = i32(p.nx); let ny = i32(p.ny); let nz = i32(p.nz);
  for (var q = 0u; q < 19u; q++) {
    let si = i - CX[q]; let sj = (j - CY[q] + ny) % ny; let sk = (k - CZ[q] + nz) % nz; let fc = faceCase(q, j, k);
    if (fc.x == 2.0) { f[q * p.N + n] = post[OPP[q] * p.N + n] + 6.0 * W[q] * (f32(CX[q]) * fc.y + f32(CY[q]) * fc.z + f32(CZ[q]) * fc.w); } // wall face
    else if (si < 0) { f[q * p.N + n] = post[OPP[q] * p.N + n] + 6.0 * W[q] * f32(CX[q]) * p.uin; } // inlet: moving-wall bounce-back
    else if (si >= nx) { } // outlet, set by the outlet pass
    else if (fc.x == 1.0) { let m = u32(fc.y); f[q * p.N + n] = post[MIRROR[4u * q + m] * p.N + idx3(u32(si), select(u32(sj), u32(j), (m & 1u) != 0u), select(u32(sk), u32(k), (m & 2u) != 0u))]; } // slip
    else { f[q * p.N + n] = post[q * p.N + idx3(u32(si), u32(sj), u32(sk))]; }
  }
}
@compute @workgroup_size(64) fn outlet(@builtin(global_invocation_id) g: vec3u, @builtin(num_workgroups) nw: vec3u) {
  let gi = g.x + g.y * nw.x * 64u;
  let m = gi; if (m >= p.ny * p.nz) { return; }
  let j = m % p.ny; let k = m / p.ny; let n = idx3(p.nx - 1u, j, k); let pn = idx3(p.nx - 2u, j, k);
  if (solid[n] != 0u || solid[pn] != 0u) { return; }
  var rho = 0.0; var jx = 0.0; var jy = 0.0; var jz = 0.0;
  for (var q = 0u; q < 19u; q++) { let v = f[q * p.N + pn]; rho += v; jx += v * f32(CX[q]); jy += v * f32(CY[q]); jz += v * f32(CZ[q]); }
  let ux = jx / rho; let uy = jy / rho; let uz = jz / rho; let uu = 1.5 * (ux * ux + uy * uy + uz * uz);
  for (var q = 1u; q < 19u; q++) { if (CX[q] >= 0 || faceCase(q, i32(j), i32(k)).x == 2.0) { continue; } // wall-face bounce-back wins (as in refine.mjs)
    let cu = f32(CX[q]) * ux + f32(CY[q]) * uy + f32(CZ[q]) * uz; let e = cu * (3.0 + 4.5 * cu) - uu;
    f[q * p.N + n] = W[q] * (1.0 + e) + (f[q * p.N + pn] - W[q] * rho * (1.0 + e)); }
}
@compute @workgroup_size(64) fn body(@builtin(global_invocation_id) g: vec3u, @builtin(num_workgroups) nw: vec3u) {
  let gi = g.x + g.y * nw.x * 64u;
  let l = gi; if (l >= p.nLinks) { return; }
  let n = u32(links[4u * l]); let q = u32(links[4u * l + 1u]); let n2 = links[4u * l + 2u]; let qq = f32(links[4u * l + 3u]) * 1e-6; let oq = OPP[q];
  let pq = post[q * p.N + n]; var v = pq;
  if (qq < 0.5 && n2 >= 0) { v = 2.0 * qq * pq + (1.0 - 2.0 * qq) * post[q * p.N + u32(n2)]; }
  else if (qq >= 0.5) { v = pq / (2.0 * qq) + (2.0 * qq - 1.0) / (2.0 * qq) * post[oq * p.N + n]; }
  f[oq * p.N + n] = v; let m = pq + v;
  lforce[3u * l] = f32(CX[q]) * m; lforce[3u * l + 1u] = f32(CY[q]) * m; lforce[3u * l + 2u] = f32(CZ[q]) * m;
}`;

export async function createLbmGpu(device, o) {
  const { nx, ny, nz } = o, N = nx * ny * nz, nL = o.links.length / 4;
  const mod = device.createShaderModule({ code: WGSL() }), info = await mod.getCompilationInfo(), errs = info.messages.filter(m => m.type === 'error');
  if (errs.length) throw Error('WGSL: ' + errs.map(e => e.lineNum + ': ' + e.message).join('; '));
  const S = GPUBufferUsage.STORAGE, buf = (size, usage) => device.createBuffer({ size: Math.max(16, size), usage });
  const fB = buf(4 * 19 * N, S | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST), pB = buf(4 * 19 * N, S | GPUBufferUsage.COPY_DST);
  const solidB = buf(4 * N, S | GPUBufferUsage.COPY_DST), spB = buf(4 * nx, S | GPUBufferUsage.COPY_DST), lkB = buf(4 * 4 * nL, S | GPUBufferUsage.COPY_DST), lfB = buf(4 * 3 * nL, S | GPUBufferUsage.COPY_SRC);
  const uB = buf(112, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  device.queue.writeBuffer(solidB, 0, Uint32Array.from(o.solid)); device.queue.writeBuffer(spB, 0, o.sponge || new Float32Array(nx)); if (nL) device.queue.writeBuffer(lkB, 0, Int32Array.from(o.links));
  const les = (o.cs || 0) ** 2 * 18 * Math.SQRT2, ub = new ArrayBuffer(112), uv = new DataView(ub), fc = o.faces || {};
  [nx, ny, nz, N].forEach((v, i) => uv.setUint32(4 * i, v, true)); uv.setFloat32(16, o.tau, true); uv.setFloat32(20, les, true); uv.setFloat32(24, o.U || 0, true); uv.setUint32(28, nL, true);
  ['yLo', 'yHi', 'zLo', 'zHi'].forEach((k, i) => { const sp = fc[k]; uv.setUint32(32 + 4 * i, !sp ? 0 : sp === 'slip' ? 1 : 2, true); const u = sp && sp !== 'slip' ? sp.u || [0, 0, 0] : [0, 0, 0]; u.forEach((v, d) => uv.setFloat32(48 + 16 * i + 4 * d, v, true)); });
  device.queue.writeBuffer(uB, 0, ub);
  const layout = device.createBindGroupLayout({ entries: [0, 1, 2, 3, 4, 5, 6].map(b => ({ binding: b, visibility: GPUShaderStage.COMPUTE, buffer: { type: b === 0 ? 'uniform' : [3, 4, 5].includes(b) ? 'read-only-storage' : 'storage' } })) });
  const bg = device.createBindGroup({ layout, entries: [uB, fB, pB, solidB, spB, lkB, lfB].map((b, i) => ({ binding: i, resource: { buffer: b } })) });
  const pl = device.createPipelineLayout({ bindGroupLayouts: [layout] }), pipe = e => device.createComputePipeline({ layout: pl, compute: { module: mod, entryPoint: e } });
  const P = { collide: pipe('collide'), stream: pipe('stream'), outlet: pipe('outlet'), body: pipe('body') };
  // 2D dispatch: at most 65535 workgroups per dimension, the kernels rebuild the linear index from (x, y)
  const dispatch = (c, n) => { const w = Math.ceil(n / 64), x = Math.min(w, 65535); c.dispatchWorkgroups(x, Math.ceil(w / x)); };
  const st = { N, nL, step: 0 };
  st.upload = f64 => { const a = Float32Array.from(f64); device.queue.writeBuffer(fB, 0, a); device.queue.writeBuffer(pB, 0, a); }; // post too: solid cells never collide
  st.advance = n => { const e = device.createCommandEncoder();
    for (let s = 0; s < n; s++) { const c = e.beginComputePass(); c.setBindGroup(0, bg);
      c.setPipeline(P.collide); dispatch(c, N); c.setPipeline(P.stream); dispatch(c, N);
      c.setPipeline(P.outlet); dispatch(c, ny * nz); if (nL) { c.setPipeline(P.body); dispatch(c, nL); } c.end(); }
    device.queue.submit([e.finish()]); st.step += n; };
  const read = async (src, bytes) => { const r = device.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }), e = device.createCommandEncoder(); e.copyBufferToBuffer(src, 0, r, 0, bytes); device.queue.submit([e.finish()]); await r.mapAsync(GPUMapMode.READ); const out = new Float32Array(r.getMappedRange().slice(0)); r.unmap(); r.destroy(); return out; };
  st.readF = () => read(fB, 4 * 19 * N);
  st.force = async () => { if (!nL) return [0, 0, 0]; const a = await read(lfB, 4 * 3 * nL), s = [0, 0, 0]; for (let l = 0; l < nL; l++) for (let d = 0; d < 3; d++) s[d] += a[3 * l + d]; return s; };
  st.finish = () => device.queue.onSubmittedWorkDone();
  return st;
}
export const WGSL_SOURCE = WGSL();
