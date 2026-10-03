import RAPIER from '@dimforge/rapier3d-compat';
import { Physics, GR, grp } from '../src/physics.js';
await RAPIER.init();
const R=RAPIER;
function mk(P,x,y,z,off,bias,auto){const w=P.world;const body=w.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(x,y+0.89,z));
 const col=w.createCollider(R.ColliderDesc.capsule(0.53,0.36).setCollisionGroups(grp(GR.CHAR,GR.STATIC|GR.OBJ)),body);
 const c=w.createCharacterController(off);c.setUp({x:0,y:1,z:0});c.setSlideEnabled(true);if(auto)c.enableAutostep(0.42,0.18,true);c.setMaxSlopeClimbAngle(52*Math.PI/180);c.setMinSlopeSlideAngle(62*Math.PI/180);
 const o={x,y,z,vy:0,grounded:true,move(dt,vx,vz){ if(!this.grounded)this.vy-=22*dt;else this.vy=-bias; c.computeColliderMovement(col,{x:vx*dt,y:this.vy*dt,z:vz*dt},undefined,grp(GR.CHAR,GR.STATIC|GR.OBJ));const m=c.computedMovement();this.x+=m.x;this.y+=m.y;this.z+=m.z;this.grounded=c.computedGrounded();if(this.grounded)this.vy=-bias;body.setTranslation({x:this.x,y:this.y+0.89,z:this.z},true);}};return o;}
for (const off of [0.03]) for (const bias of [1]) for (const kind of ['fixed','fixedbody','fixedbody-nooffset','kin','kin-nooffset','dyn']) {
  const P=new Physics(RAPIER),w=P.world; const g=grp(GR.OBJ,0xffff);
  if(kind==='fixed') w.createCollider(R.ColliderDesc.cuboid(1.5,0.08,6).setTranslation(0,9.92,0).setCollisionGroups(g));
  else if(kind==='fixedbody'){const body=w.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0,10,0)); w.createCollider(R.ColliderDesc.cuboid(1.5,0.08,6).setTranslation(0,-0.08,0).setCollisionGroups(g),body);}
  else if(kind==='fixedbody-nooffset'){const body=w.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0,9.92,0)); w.createCollider(R.ColliderDesc.cuboid(1.5,0.08,6).setCollisionGroups(g),body);}
  else if(kind==='kin-nooffset'){const body=w.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0,9.92,0)); w.createCollider(R.ColliderDesc.cuboid(1.5,0.08,6).setCollisionGroups(g),body);}
  else if(kind==='dyn'){const body=w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0,9.92,0).setGravityScale(0).lockTranslations().lockRotations()); w.createCollider(R.ColliderDesc.cuboid(1.5,0.08,6).setCollisionGroups(g),body);}
  else {const body=w.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0,10,0)); w.createCollider(R.ColliderDesc.cuboid(1.5,0.08,6).setTranslation(0,-0.08,0).setCollisionGroups(g),body);}
  const c=mk(P,0,10.1,-4,off,bias,true);
  for(let i=0;i<20;i++){c.move(1/30,0,0);w.step();}
  const z0=c.z;for(let i=0;i<30;i++){c.move(1/30,0,3);w.step();}
  console.log('off',off,'bias',bias,kind,'dz',(c.z-z0).toFixed(2),'y',c.y.toFixed(3));
}
