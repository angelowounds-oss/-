import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of process.argv.slice(2)) {
  const doc = await io.read(f), root = doc.getRoot();
  const sk = root.listSkins()[0];
  const j = sk.listJoints();
  console.log(f.split('/').pop(), 'joints', j.length, 'anims', root.listAnimations().map(a=>a.getName()+':'+a.listChannels().length).slice(0,60).join(' '));
  const show=(n,d)=>{ if(d>6)return; console.log(' '.repeat(d)+n.getName(), n.getTranslation().map(x=>+x.toFixed(3)).join(','), n.getRotation().map(x=>+x.toFixed(2)).join(','), n.getScale().map(x=>+x.toFixed(2)).join(',')); for(const c of n.listChildren()) if(j.includes(c))show(c,d+1)};
  const rootJ=j.find(n=>!j.includes(n.getParentNode()));
  show(rootJ,0);
  let p=rootJ; const chain=[]; while((p=p.getParentNode())&&p.propertyType==='Node')chain.push(p.getName()+' s='+p.getScale().map(x=>+x.toFixed(3)).join(',')+' r='+p.getRotation().map(x=>+x.toFixed(2)).join(','));
  console.log('parents',chain.join(' | '));
}
