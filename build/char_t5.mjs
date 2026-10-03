import RAPIER from '@dimforge/rapier3d-compat';
import { Physics, GR, grp } from '../src/physics.js';
import { Character } from '../src/character.js';
await RAPIER.init();
const R=RAPIER;
for (const v of ['fixed','kin','kinvel','kin-noimp','kin-noauto']) {
  const P=new Physics(RAPIER); const w=P.world;
  const g=grp(GR.OBJ,0xffff);
  let col;
  if(v==='fixed') col=w.createCollider(R.ColliderDesc.cuboid(1.5,0.08,3).setTranslation(0,9.92,0).setCollisionGroups(g));
  else { const body=w.createRigidBody((v==='kinvel'?R.RigidBodyDesc.kinematicVelocityBased():R.RigidBodyDesc.kinematicPositionBased()).setTranslation(0,10,0)); col=w.createCollider(R.ColliderDesc.cuboid(1.5,0.08,3).setTranslation(0,-0.08,0).setCollisionGroups(g),body); }
  const c=new Character(P,0,10.05,-2);
  if(v==='kin-noimp') c.ctrl.setApplyImpulsesToDynamicBodies(false);
  if(v==='kin-noauto') c.ctrl.disableAutostep();
  for(let i=0;i<30;i++){c.move(1/30,0,0);w.step();}
  const z0=c.z; for(let i=0;i<30;i++){c.move(1/30,0,3);w.step();}
  console.log(v,'y',c.y.toFixed(3),'dz',(c.z-z0).toFixed(2));
}
