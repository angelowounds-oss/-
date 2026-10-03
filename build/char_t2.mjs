import RAPIER from '@dimforge/rapier3d-compat';
import { Physics } from '../src/physics.js';
import { Character } from '../src/character.js';
await RAPIER.init();
const P=new Physics(RAPIER);
Character.noSnap=process.argv[2]==='1';
const c=new Character(P,0,5,0);
for(let i=0;i<240;i++){const imp=c.move(1/60,0,i>120?5:0); P.world.step(); if(i%30==0||imp)console.log(i,c.y.toFixed(3),c.grounded,imp.toFixed(1))}
