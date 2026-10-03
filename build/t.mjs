import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptSimplifier } from 'meshoptimizer';
await MeshoptSimplifier.ready;
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('../assets/ferrari.glb');
const m = doc.getRoot().listMeshes().find(x=>x.getName()==='body'); const p=m.listPrimitives()[0];
const pos=p.getAttribute('POSITION'); const arr=pos.getArray(); const idx=p.getIndices().getArray();
console.log(arr.constructor.name, arr.length, idx.constructor.name, idx.length);
for (const err of [0.001,0.01,0.05,0.2]) { const [out,e]=MeshoptSimplifier.simplify(new Uint32Array(idx),new Float32Array(arr),3,Math.floor(idx.length*0.2/3)*3,err,[]); console.log(err,'->',out.length/3,'tris, err',e); }
let mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];for(let i=0;i<arr.length;i++){const k=i%3;mn[k]=Math.min(mn[k],arr[i]);mx[k]=Math.max(mx[k],arr[i]);}console.log(mn,mx);
const set=new Set();for(let i=0;i<arr.length;i+=3)set.add(arr[i].toFixed(5)+','+arr[i+1].toFixed(5)+','+arr[i+2].toFixed(5));console.log('unique pos',set.size,'of',arr.length/3);
const [o2,e2]=MeshoptSimplifier.simplify(new Uint32Array(idx),new Float32Array(arr),3,3000,0.5,['Prune']);console.log('prune/target3000 ->',o2.length/3,e2);
