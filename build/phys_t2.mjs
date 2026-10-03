import RAPIER from '@dimforge/rapier3d-compat';
import { Physics, driveVehicle, PHYS } from '../src/physics.js';
await RAPIER.init();
const S={ L:4.7,W:1.88,wb:1.4,mass:1.0,maxSpeed:46,accel:17,grip:7.5 };
for (const k of [0.5,1,2,4]){ PHYS.brakeK=k;
  const P=new Physics(RAPIER); const v=P.createVehicle(S,0,0,0); let out=[];
  for(let i=0;i<8*60;i++){const lv=v.body.linvel();const vf=lv.z; const t=i/60;
    P.step(1/60,()=>driveVehicle(v,{throttle:t<4&&t>0.5?1:0,brake:t>=4?1:0,steer:0,hand:false,speedFwd:vf,maxSteer:.3}));
    if(i%30===0&&t>=3.9&&t<7)out.push(vf.toFixed(1));}
  console.log('brakeK',k,out.join(' '));}
