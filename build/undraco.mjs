import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, quantize } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
for (const f of ['ferrari','Soldier']) {
  const doc = await io.read(`../assets/${f}.glb`);
  const used = doc.getRoot().listExtensionsUsed().map(e=>e.extensionName);
  console.log(f, used);
  for (const e of doc.getRoot().listExtensionsUsed()) if (e.extensionName==='KHR_draco_mesh_compression') e.dispose();
  await doc.transform(prune(), dedup());
  await io.write(`../assets/${f}.glb`, doc);
}
