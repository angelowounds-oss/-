// Builds dist/AETHER_CFD_GPU_BENCH.html: a standalone page that measures the WebGPU throughput of the CFD V3 kernel on the user's device
// (tests/webgpu-lbm-bench.html with tools/solver2/gpu/lbm-webgpu.mjs inlined). node tools/build-gpu-bench.mjs
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = fs.readFileSync(path.join(root, 'tools/solver2/gpu/lbm-webgpu.mjs'), 'utf8').replace(/^export (async function|const)/gm, '$1').replace(/^export const WGSL_SOURCE.*$/m, '');
const page = fs.readFileSync(path.join(root, 'tests/webgpu-lbm-bench.html'), 'utf8').replace('/*__LBM__*/', () => src);
fs.writeFileSync(path.join(root, 'dist/AETHER_CFD_GPU_BENCH.html'), page);
console.log('built dist/AETHER_CFD_GPU_BENCH.html', page.length, 'bytes');
