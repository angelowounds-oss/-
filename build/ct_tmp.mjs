import RAPIER from '@dimforge/rapier3d-compat';
import { Physics } from '../src/physics.js';
import { Character } from '../src/character_t.js';
await RAPIER.init();
const P=new Physics(RAPIER);
// ramp from z=5..12 rising 0..3m (about 23deg), landing slab, plus a 0.3 step and a wall
const R=RAPIER, w=P.world;
const ang=Math.atan2(3,7); const len=Math.hypot(7,3);
w.createCollider(R.ColliderDesc.cuboid(2,0.1,len/2).setTranslation(0,1.5,8.5).setRotation({x:Math.sin(-ang/2),y:0,z:0,w:Math.cos(-ang/2)}));
w.createCollider(R.ColliderDesc.cuboid(4,0.15,4).setTranslation(0,2.95,16));
w.createCollider(R.ColliderDesc.cuboid(2,0.15,1).setTranslation(6,0.15,0)); // 0.3m step
const c=new Character(P,0,0,0);
let log=[];
for(let i=0;i<60*8;i++){c.move(1/60,0,5.2);P.world.step(); if(i%60==59)log.push(`t${(i+1)/60|0} y=${c.y.toFixed(2)} z=${c.z.toFixed(1)} g=${c.grounded}`)}
console.log(log.join('\n'));
const d=new Character(P,6,0,-3);for(let i=0;i<240;i++){d.move(1/60,0,3);P.world.step()}console.log('step test y',d.y.toFixed(2),'z',d.z.toFixed(1));
const e=new Character(P,-8,10,0);let imp=0;for(let i=0;i<120;i++){imp=Math.max(imp,e.move(1/60,0,0));P.world.step()}console.log('fall impact',imp.toFixed(1),'y',e.y.toFixed(2));
