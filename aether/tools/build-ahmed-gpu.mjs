// Builds dist/AETHER_CFD_AHMED_GPU.html: one standalone page that runs the Ahmed validation case on the user's GPU (tests/webgpu-ahmed-page.html with
// the solver modules embedded as data: URLs behind an import map; relative imports are rewritten to 'aether/<file>'). node tools/build-ahmed-gpu.mjs
import fs from 'node:fs'; import path from 'node:path';
import { importMap, SOLVER_MODULES } from './lib-importmap.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const map = importMap(root, [...SOLVER_MODULES, 'tools/solver2/bench/ahmed-case.mjs', 'tools/solver2/gpu/ahmed-gpu.mjs']);
const page = fs.readFileSync(path.join(root, 'tests/webgpu-ahmed-page.html'), 'utf8').replace('<!--__IMPORTMAP__-->', () => map);
fs.writeFileSync(path.join(root, 'dist/AETHER_CFD_AHMED_GPU.html'), page);
console.log('built dist/AETHER_CFD_AHMED_GPU.html', page.length, 'bytes');
