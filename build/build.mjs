import { build } from 'esbuild';
import fs from 'node:fs';
import { bake } from './bake.mjs';
const r = await build({
  entryPoints: ['src/main.js'], bundle: true, minify: !process.env.DEV, format: 'iife',
  write: false, loader: { '.glb': 'base64', '.jpg': 'dataurl', '.bin': 'base64', '.rgbe': 'base64' }, target: 'es2020', legalComments: 'none',
  nodePaths: ['build/node_modules'], logLevel: 'warning',
});
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
// the loading screen's fonts (Anton, Space Mono; both SIL OFL) are embedded as data URIs: the game is one file and must look the same offline
const font = (file, family, weight) => `@font-face{font-family:'${family}';font-weight:${weight};font-style:normal;font-display:swap;src:url(data:font/woff2;base64,${fs.readFileSync('assets/fonts/' + file).toString('base64')}) format('woff2')}`;
const fonts = [font('Anton-400.woff2', 'Anton', 400), font('SpaceMono-400.woff2', 'Space Mono', 400), font('SpaceMono-700.woff2', 'Space Mono', 700)].join('\n');
const tpl = fs.readFileSync('src/template.html', 'utf8').replace('/*__FONTS__*/', () => fonts);
// WORLD=small skips the bake: the page generates the world itself (slower to start, no big data; for quick tests and development)
const baked = process.env.WORLD === 'small' ? '' : `<script type="application/octet-stream" id="baked">${Buffer.from((await bake()).embedded).toString('base64')}</script>`;
fs.writeFileSync(process.env.OUT || 'neon_city_v9.html', tpl.replace('/*__BAKED__*/', () => baked).replace('/*__BUNDLE__*/', () => js));
console.log('built', (fs.statSync(process.env.OUT || 'neon_city_v9.html').size/1024|0)+' KB');
