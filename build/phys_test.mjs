import RAPIER from '@dimforge/rapier3d-compat';
import { Physics, driveVehicle, PHYS } from '../src/physics.js';
await RAPIER.init();
const SPEC = { sedan:{ L:4.7,W:1.88,wb:1.4,mass:1.0,maxSpeed:46,accel:17,grip:7.5 }, sport:{L:4.5,W:1.95,wb:1.38,mass:.9,maxSpeed:62,accel:26,grip:9}, truck:{L:6.3,W:2.2,wb:2.0,mass:2.4,maxSpeed:31,accel:9,grip:5.2} };
function state(v){const t=v.body.translation(),q=v.body.rotation(),lv=v.body.linvel();const h=2*Math.atan2(q.y,q.w);const fx=Math.sin(h),fz=Math.cos(h);
 // roll/pitch via up vector
 const ux=2*(q.x*q.y-q.w*q.z), uy=1-2*(q.x*q.x+q.z*q.z), uz=2*(q.y*q.z+q.w*q.x);
 return {x:t.x,y:t.y,z:t.z,h,vf:lv.x*fx+lv.z*fz,vl:lv.x*-fz+lv.z*fx, up:uy, sp:Math.hypot(lv.x,lv.z)}}
function run(type, name, inputs, T){
  const P=new Physics(RAPIER); const v=P.createVehicle(SPEC[type],0,0,0);
  let log=[];
  for(let i=0;i<T*60;i++){
    const t=i/60; const inp=inputs(t,state(v));
    P.step(1/60,()=>{driveVehicle(v,{throttle:inp.th||0,brake:inp.br||0,steer:inp.st||0,hand:!!inp.hd,speedFwd:state(v).vf,maxSteer:inp.ms??0.35});});
    if(i%60===59){const s=state(v);log.push(`t=${(t+1/60).toFixed(0)} y=${s.y.toFixed(2)} vf=${s.vf.toFixed(1)} vl=${s.vl.toFixed(1)} up=${s.up.toFixed(2)} h=${(s.h*57.3).toFixed(0)}`);}
  }
  console.log('== '+type+' '+name+'\n'+log.join('\n'));
}
run('sedan','accel',(t)=>({th:t>1?1:0}),9);
run('sedan','brake',(t,s)=>t<6?{th:1}:{br:1},9);
run('sedan','turn@25',(t,s)=>({th:s.vf<20?1:0.35,st:t>5?1:0, ms:.12}),9);
run('sport','drift',(t,s)=>({th:1,st:t>5?1:0,hd:t>6,ms:.15}),9);
run('truck','accel',(t)=>({th:1}),8);
run('sedan','drift',(t,s)=>({th:s.vf<22?1:0.3,st:t>5?1:0,hd:t>6,ms:.2}),10);
run('sedan','crash',(t,s)=>({th:1}),6);
