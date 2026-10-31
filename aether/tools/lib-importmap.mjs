// Import map for standalone pages: each ES module becomes a data: URL under 'aether/<file>', and its relative imports are rewritten to those names.
// Used by tools/build.mjs (the #solver=lbm modules of the app) and tools/build-ahmed-gpu.mjs.
import fs from 'node:fs'; import path from 'node:path';
export function importMap(root, files) {
  const imports = {};
  for (const m of files) {
    const src = fs.readFileSync(path.join(root, m), 'utf8').replace(/from '(?:\.\.?\/)+(?:[\w-]+\/)*([\w-]+\.mjs)'/g, "from 'aether/$1'");
    imports['aether/' + path.basename(m)] = 'data:text/javascript;base64,' + Buffer.from(src).toString('base64');
  }
  return `<script type="importmap">${JSON.stringify({ imports })}</script>`;
}
export const SOLVER_MODULES = ['tools/solver2/refine-kernel.mjs', 'tools/solver2/refine.mjs', 'tools/solver2/gpu/lbm-webgpu.mjs', 'tools/solver2/gpu/refine-webgpu.mjs'];
