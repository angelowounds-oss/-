import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, quantize } from '@gltf-transform/functions';
import sharp from 'sharp';
const dir = '/tmp/claude-0/-home-user--/25dfb026-1961-5d75-9962-f3775122370e/scratchpad/resout/';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
await sharp(dir + 'res_wall.jpg').resize(1536, 1536).jpeg({ quality: 74, mozjpeg: true }).toFile('assets/res/res_wall.jpg');
for (let i = 1; i <= 10; i++) {
  const doc = await io.read(dir + `res_${String(i).padStart(2, '0')}.glb`);
  for (const m of doc.getRoot().listMaterials()) m.setBaseColorTexture(null);
  await doc.transform(dedup(), prune({ keepAttributes: true }), quantize({ quantizePosition: 14, quantizeNormal: 10, quantizeTexcoord: 14 }));
  const p = `assets/res/res_${String(i).padStart(2, '0')}.glb`;
  await io.write(p, doc);
}
console.log('ok');
