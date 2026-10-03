import RAPIER from '@dimforge/rapier3d-compat';
import { Physics, GR, grp } from '../src/physics.js';
import { Character } from '../src/character.js';
await RAPIER.init();
const R=RAPIER;
const P=new Physics(RAPIER); const w=P.world;
const g=grp(GR.OBJ,0xffff);
const body=w.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0,10,0));
const col=w.createCollider(R.ColliderDesc.cuboid(1.5,0.08,3).setTranslation(0,-0.08,0).setCollisionGroups(g),body);
const c=new Character(P,0,10.05,-2);
for(let i=0;i<10;i++){c.move(1/30,0,0);w.step();}
for(let i=0;i<8;i++){
  c.move(1/30,0,3);
  const n=c.ctrl.numComputedCollisions(); const info=[];
  for(let k=0;k<n;k++){const cl=c.ctrl.computedCollision(k); info.push((cl.collider.handle===col.handle?'floor':'other:'+cl.collider.handle)+' n('+cl.normal1.x.toFixed(2)+','+cl.normal1.y.toFixed(2)+','+cl.normal1.z.toFixed(2)+') toi'+cl.toi.toFixed(3)+' tr('+cl.translationDeltaApplied.z.toFixed(3)+')');}
  w.step();
  console.log(i,'z',c.z.toFixed(3),'y',c.y.toFixed(3),'mv',JSON.stringify(c.ctrl.computedMovement()),n,info.slice(0,3).join(' | '));
}
console.log('own col translation',c.col.translation(), 'floor', col.translation());
