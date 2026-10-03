import RAPIER from '@dimforge/rapier3d-compat';
await RAPIER.init();
const R=RAPIER,w=new R.World({x:0,y:-22,z:0});
w.createCollider(R.ColliderDesc.cuboid(+process.argv[3],2,+process.argv[3]).setTranslation(0,-2,0));
const body=w.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(0,5,0));
const col=w.createCollider(R.ColliderDesc.capsule(0.53,0.36),body);
const c=w.createCharacterController(0.03);c.setUp({x:0,y:1,z:0});c.enableAutostep(0.4,0.18,false);
let y=5,vy=0;const mode=process.argv[2];
for(let i=0;i<120;i++){vy-=22/60; c.computeColliderMovement(col,{x:0,y:vy/60,z:0});const m=c.computedMovement();y+=m.y; if(c.computedGrounded())vy=-1;
 const t={x:0,y:y,z:0};
 if(mode==='next')body.setNextKinematicTranslation(t);else body.setTranslation(t,true);
 w.step(); if(i%20==0||i>110)console.log(i,y.toFixed(3),c.computedGrounded(), col.translation().y.toFixed(3))}
