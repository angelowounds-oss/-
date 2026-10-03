import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('../assets/ferrari.glb');
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { const i=p.getIndices(); const pos=p.getAttribute('POSITION'); console.log(m.getName(), 'mode',p.getMode(),'idx',i?.getCount(),'verts',pos.getCount(), pos.getComponentType(), p.listSemantics().join(',')); }
