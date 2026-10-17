// Packs the supplied KSR-29 sniper rifle (docs/ASSETS.md): rifle and scope share one 4096 px texture set, shrunk to 1024 webp and kept as two nodes
// ("rifle", "scope") of assets/props/sniper_rifle.glb. usage: node build/sniper_pack.mjs <Sniper_Rifle.glb> <Sniper_Scope.glb>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, textureCompress, mergeDocuments } from '@gltf-transform/functions';
import sharp from 'sharp';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const [rifleP, scopeP] = process.argv.slice(2);
const doc = await io.read(rifleP), scope = await io.read(scopeP);
mergeDocuments(doc, scope);
const [b0, ...rest] = doc.getRoot().listBuffers(); for (const a of doc.getRoot().listAccessors()) a.setBuffer(b0); rest.forEach((b) => b.dispose());
const scene = doc.getRoot().listScenes()[0], nodes = doc.getRoot().listNodes().filter((n) => n.getMesh());
nodes[0].setName('rifle'); nodes[1].setName('scope');
// the model lies along +x (muzzle at +x, grip near the origin); the game wants the barrel on +z, 1.2 m long, and the scope sits on the top rail
nodes[1].setTranslation([2.0, 1.18, -0.07]);
const gun = doc.createNode('gun').setRotation([0, -Math.SQRT1_2, 0, Math.SQRT1_2]).setScale([0.12, 0.12, 0.12]).setTranslation([0, 0.05, 0]);
for (const n of nodes) { scene.removeChild(n); gun.addChild(n); } scene.addChild(gun);
await doc.transform(dedup(), prune(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }));
await io.write('assets/props/sniper_rifle.glb', doc);
console.log('sniper_rifle.glb written', nodes.map((n) => n.getName()));
