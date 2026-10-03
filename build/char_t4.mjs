import RAPIER from '@dimforge/rapier3d-compat';
import { Physics, GR, grp } from '../src/physics.js';
import { Character } from '../src/character.js';
await RAPIER.init();
const P=new Physics(RAPIER); const R=RAPIER,w=P.world;
const variant=process.argv[2];
const body=w.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0,10,0));
const g=grp(GR.OBJ,0xffff);
w.createCollider(R.ColliderDesc.cuboid(1.22,+process.argv[3],1.22).setTranslation(0,-+process.argv[3],0).setCollisionGroups(g),body);
if(variant!=='nowalls'){
 w.createCollider(R.ColliderDesc.cuboid(0.06,1.35,1.22).setTranslation(-1.26,1.2,0).setCollisionGroups(g),body);
 w.createCollider(R.ColliderDesc.cuboid(0.06,1.35,1.22).setTranslation(1.26,1.2,0).setCollisionGroups(g),body);
 w.createCollider(R.ColliderDesc.cuboid(1.22,1.35,0.06).setTranslation(0,1.2,-1.26).setCollisionGroups(g),body);
 if(variant!=='noceil') w.createCollider(R.ColliderDesc.cuboid(1.22,0.08,1.22).setTranslation(0,2.75,0).setCollisionGroups(g),body);
}
const c=new Character(P,0,10.05,0);
for(let i=0;i<30;i++){c.move(1/30,0,0);w.step();}
const z0=c.z; for(let i=0;i<30;i++){c.move(1/30,0,5);w.step();}
console.log(variant,'y',c.y.toFixed(3),'dz',(c.z-z0).toFixed(2));
