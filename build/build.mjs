import { build } from 'esbuild';
import fs from 'node:fs';
const r = await build({
  entryPoints: ['src/main.js'], bundle: true, minify: !process.env.DEV, format: 'iife',
  write: false, loader: { '.glb': 'base64' }, target: 'es2020', legalComments: 'none',
  nodePaths: ['build/node_modules'], logLevel: 'warning',
});
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const tpl = fs.readFileSync('src/template.html', 'utf8');
fs.writeFileSync('neon_city_v9.html', tpl.replace('/*__BUNDLE__*/', () => js));
console.log('built', (fs.statSync('neon_city_v9.html').size/1024|0)+' KB');
