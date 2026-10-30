// Builds dist/AETHER_CFD_AHMED_GPU.html: one standalone page that runs the Ahmed validation case on the user's GPU (tests/webgpu-ahmed-page.html with
// the solver modules embedded as data: URLs behind an import map; relative imports are rewritten to 'aether/<file>'). node tools/build-ahmed-gpu.mjs
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MODS = ['tools/solver2/refine-kernel.mjs', 'tools/solver2/refine.mjs', 'tools/solver2/gpu/lbm-webgpu.mjs', 'tools/solver2/gpu/refine-webgpu.mjs', 'tools/solver2/bench/ahmed-case.mjs', 'tools/solver2/gpu/ahmed-gpu.mjs'];
const imports = {};
for (const m of MODS) {
  const src = fs.readFileSync(path.join(root, m), 'utf8').replace(/from '(?:\.\.?\/)+(?:[\w-]+\/)*([\w-]+\.mjs)'/g, "from 'aether/$1'");
  imports['aether/' + path.basename(m)] = 'data:text/javascript;base64,' + Buffer.from(src).toString('base64');
}
const page = fs.readFileSync(path.join(root, 'tests/webgpu-ahmed-page.html'), 'utf8').replace('<!--__IMPORTMAP__-->', () => `<script type="importmap">${JSON.stringify({ imports })}</script>`);
fs.writeFileSync(path.join(root, 'dist/AETHER_CFD_AHMED_GPU.html'), page);
console.log('built dist/AETHER_CFD_AHMED_GPU.html', page.length, 'bytes');
