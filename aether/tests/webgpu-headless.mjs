// CFD V3 P0-1: can this environment run WebGPU compute at all (headless Chromium, CPU Vulkan via SwiftShader)?
// Tries several flag sets; for the first that yields an adapter it runs two correctness checks (speed here means nothing):
//   1. pack2x16float / unpack2x16float round trip vs the JS binary16 rounding used by the CPU reference (tools/solver2/core3d-kernel.mjs f16r)
//   2. D3Q19 pull streaming on a periodic 16^3 lattice (storage buffers, workgroups, readback) vs a JS reference, bit exact
// node tests/webgpu-headless.mjs
import path from 'node:path'; import fs from 'node:fs'; import os from 'node:os';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { CHROME } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { f16r } = await import(path.join(root, 'tools/solver2/core3d-kernel.mjs'));
const page = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wgpu-')), 'p.html'); fs.writeFileSync(page, '<!doctype html><meta charset=utf-8><title>wgpu</title>');
const base = ['--no-sandbox', '--allow-file-access-from-files', '--disable-background-networking', '--no-first-run'];
const sets = {
  'vulkan-swiftshader': ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-vulkan=swiftshader', '--use-webgpu-adapter=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  'unsafe-webgpu-only': ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  'vulkan-fallback-adapter': ['--enable-unsafe-webgpu', '--enable-features=Vulkan,WebGPUService', '--use-vulkan=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-vulkan-surface']
};
const probe = async () => {
  if (!navigator.gpu) return { gpu: false, secure: isSecureContext };
  const out = { gpu: true, secure: isSecureContext, adapters: {} };
  for (const opt of [{}, { forceFallbackAdapter: true }, { powerPreference: 'high-performance' }]) {
    try { const a = await navigator.gpu.requestAdapter(opt); out.adapters[JSON.stringify(opt)] = a ? { info: a.info ? { vendor: a.info.vendor, architecture: a.info.architecture, description: a.info.description, isFallbackAdapter: a.info.isFallbackAdapter } : null, features: [...a.features], maxStorageBufferBindingSize: a.limits.maxStorageBufferBindingSize, maxBufferSize: a.limits.maxBufferSize, maxComputeInvocationsPerWorkgroup: a.limits.maxComputeInvocationsPerWorkgroup } : null; }
    catch (e) { out.adapters[JSON.stringify(opt)] = 'error: ' + e.message; }
  }
  return out;
};
const run = async () => {
  const a = await navigator.gpu.requestAdapter() || await navigator.gpu.requestAdapter({ forceFallbackAdapter: true }); const d = await a.requestDevice();
  const errs = []; d.addEventListener('uncapturederror', e => errs.push(String(e.error && e.error.message)));
  const buf = (data, usage) => { const b = d.createBuffer({ size: data.byteLength, usage, mappedAtCreation: true }); new data.constructor(b.getMappedRange()).set(data); b.unmap(); return b; };
  const read = async (src, bytes) => { const r = d.createBuffer({ size: bytes, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }); const e = d.createCommandEncoder(); e.copyBufferToBuffer(src, 0, r, 0, bytes); d.queue.submit([e.finish()]); await r.mapAsync(GPUMapMode.READ); const o = r.getMappedRange().slice(0); r.unmap(); return o; };
  const go = async (code, bindings, groups) => { const m = d.createShaderModule({ code }); const info = await m.getCompilationInfo(); const msgs = info.messages.filter(x => x.type === 'error').map(x => x.message); if (msgs.length) return msgs; const p = d.createComputePipeline({ layout: 'auto', compute: { module: m, entryPoint: 'main' } }); const bg = d.createBindGroup({ layout: p.getBindGroupLayout(0), entries: bindings.map((b, i) => ({ binding: i, resource: { buffer: b } })) }); const e = d.createCommandEncoder(), c = e.beginComputePass(); c.setPipeline(p); c.setBindGroup(0, bg); c.dispatchWorkgroups(groups); c.end(); d.queue.submit([e.finish()]); await d.queue.onSubmittedWorkDone(); return null; };
  const res = {};
  // 1. pack2x16float round trip
  const n = 1 << 16, x = new Float32Array(2 * n); let s = 7; const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < x.length; i++) x[i] = (rnd() < .5 ? -1 : 1) * 2 ** (rnd() * 40 - 28) * (1 + rnd());
  const bIn = buf(x, GPUBufferUsage.STORAGE), bOut = d.createBuffer({ size: x.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
  res.packCompile = await go(`@group(0) @binding(0) var<storage, read> a: array<vec2f>; @group(0) @binding(1) var<storage, read_write> b: array<vec2f>;
    @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) g: vec3u) { let i = g.x; if (i < arrayLength(&a)) { b[i] = unpack2x16float(pack2x16float(a[i])); } }`, [bIn, bOut], n / 64);
  res.packOut = Array.from(new Float32Array(await read(bOut, x.byteLength))); res.packIn = Array.from(x);
  // 2. D3Q19 pull streaming, periodic 16^3, SoA layout f[q * N + n]
  const L = 16, N = L * L * L, Q = 19, C = [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 1, 0], [-1, -1, 0], [1, -1, 0], [-1, 1, 0], [1, 0, 1], [-1, 0, -1], [1, 0, -1], [-1, 0, 1], [0, 1, 1], [0, -1, -1], [0, 1, -1], [0, -1, 1]];
  const f = new Float32Array(Q * N); for (let i = 0; i < f.length; i++) f[i] = rnd();
  const fIn = buf(f, GPUBufferUsage.STORAGE), fOut = d.createBuffer({ size: f.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC }), cBuf = buf(new Int32Array(C.flat().concat([0])), GPUBufferUsage.STORAGE);
  res.streamCompile = await go(`@group(0) @binding(0) var<storage, read> f: array<f32>; @group(0) @binding(1) var<storage, read_write> g: array<f32>; @group(0) @binding(2) var<storage, read> c: array<i32>;
    const L = 16; const N = 4096u;
    @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id: vec3u) { let n = id.x; if (n >= N) { return; }
      let i = i32(n % 16u); let j = i32((n / 16u) % 16u); let k = i32(n / 256u);
      for (var q = 0u; q < 19u; q++) { let si = (i - c[3u * q] + L) % L; let sj = (j - c[3u * q + 1u] + L) % L; let sk = (k - c[3u * q + 2u] + L) % L;
        g[q * N + n] = f[q * N + u32(si + L * (sj + L * sk))]; } }`, [fIn, fOut, cBuf], N / 64);
  const g = new Float32Array(await read(fOut, f.byteLength)); let bad = 0;
  for (let k = 0; k < L; k++) for (let j = 0; j < L; j++) for (let i = 0; i < L; i++) for (let q = 0; q < Q; q++) { const n2 = i + L * (j + L * k), si = (i - C[q][0] + L) % L, sj = (j - C[q][1] + L) % L, sk = (k - C[q][2] + L) % L; if (g[q * N + n2] !== f[q * N + si + L * (sj + L * sk)]) bad++; }
  res.streamMismatches = bad; res.streamValues = Q * N; res.deviceErrors = errs;
  return res;
};
const report = { flagSets: {} };
for (const [name, flags] of Object.entries(sets)) {
  let browser;
  try {
    browser = await chromium.launch({ executablePath: CHROME, args: [...base, ...flags] });
    const p = await browser.newPage(); await p.goto('file://' + page);
    const pr = await p.evaluate(probe); report.flagSets[name] = pr;
    const ok = pr.gpu && Object.values(pr.adapters).some(a => a && typeof a === 'object');
    if (ok && !report.checks) {
      const r = await p.evaluate(run); let packBad = 0; const ex = [];
      for (let i = 0; i < r.packIn.length; i++) { const want = f16r(r.packIn[i]), got = r.packOut[i]; if (!(got === want || (got === 0 && want === 0))) { packBad++; if (ex.length < 5) ex.push({ x: r.packIn[i], got, want }); } }
      report.checks = { flagSet: name, packCompileErrors: r.packCompile, packValues: r.packIn.length, packMismatchesVsF16r: packBad, packExamples: ex, streamCompileErrors: r.streamCompile, streamValues: r.streamValues, streamMismatches: r.streamMismatches, deviceErrors: r.deviceErrors };
    }
  } catch (e) { report.flagSets[name] = { error: String(e).slice(0, 300) }; }
  finally { if (browser) await browser.close(); }
}
console.log(JSON.stringify(report, null, 1));
process.exit(report.checks && report.checks.packMismatchesVsF16r === 0 && report.checks.streamMismatches === 0 ? 0 : 1);
