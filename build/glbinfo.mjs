import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(process.argv[2]);
const root = doc.getRoot();
let tris = 0;
for (const n of root.listNodes()) { const m = n.getMesh(); if (!m) continue; let t = 0; for (const p of m.listPrimitives()) t += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3; tris += t; console.log('node', n.getName(), 'tris', t | 0, 'prims', m.listPrimitives().length, 'scale', n.getScale().map((x) => +x.toFixed(3)).join(','), 'pos', n.getTranslation().map((x) => +x.toFixed(2)).join(',')); }
console.log('TOTAL tris', tris | 0, 'materials', root.listMaterials().map((m) => m.getName()).join('|'));
for (const t of root.listTextures()) console.log('tex', t.getName(), t.getMimeType(), t.getSize(), (t.getImage().byteLength / 1e6).toFixed(2) + 'MB');
console.log('anims', root.listAnimations().length, 'skins', root.listSkins().length, 'ext', doc.getRoot().listExtensionsUsed().map((e) => e.extensionName).join(','));
