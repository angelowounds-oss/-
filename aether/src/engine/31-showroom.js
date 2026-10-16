/* ===== Showroom look (V21). Pure lighting / presentation: the aerodynamics, the solver and every measurement are untouched.
   - a lit pool around the turntable: key light and ambient fall off towards the walls, so the car stands out of a dark tunnel (LED lines, displays and ceiling emitters stay bright)
   - five analytic tube lights (long soft highlights along the body, no shadow maps) plus the visible suspended fixtures that carry them
   - #look=0 (or lab) restores the bright lab look; SHOW.set(false) does the same at run time.
   Tube strengths are chosen by eye against the renders in tests/out/visual (units: irradiance at 1 m before 1/(d^2+0.6)). ===== */
const SHOW=(()=>{
 const off=/[#&]look=(0|lab|classic)/.test(location.hash);
 const warm=[1,.95,.88],cool=[.82,.92,1],mul=(c,k)=>c.map(v=>v*k);
 const S={on:!off,amt:off?0:1,target:off?0:1,
  pool:{c:[0,1.1,0],r0:2.6,r1:5.6,floor:.07},
  tubes:[ /* a, b: segment ends; r: source radius; col: radiance colour x strength; box: fixture [centre, half sizes] */
   {a:[-4.5,6.5,0],b:[4.5,6.5,0],r:.3,col:mul(warm,85),fix:{c:[0,6.5,0],h:[4.5,.035,.4]}},
   {a:[-4,6.5,2.2],b:[4,6.5,2.2],r:.14,col:mul(cool,60),fix:{c:[0,6.5,2.2],h:[4,.03,.16]}},
   {a:[-4,6.5,-2.2],b:[4,6.5,-2.2],r:.14,col:mul(cool,60),fix:{c:[0,6.5,-2.2],h:[4,.03,.16]}},
   {a:[-3.4,3.1,3.6],b:[3.4,3.1,3.6],r:.1,col:mul(cool,28),fix:null},
   {a:[-3.4,3.1,-3.6],b:[3.4,3.1,-3.6],r:.1,col:mul(cool,28),fix:null}],
  rig:null,rigGen:-1,loc:null};
 S.set=on=>{S.target=on?1:0;S.on=!!on};
 return S})();
window.__SHOW=SHOW;
/* run-time blend (the mode switch fades over about half a second) */
function showStep(dt){if(Math.abs(SHOW.amt-SHOW.target)<.002){SHOW.amt=SHOW.target;return}SHOW.amt+=(SHOW.target-SHOW.amt)*Math.min(1,dt/.18)}
function showBind(){
 if(!SHOW.loc){const L={};for(const n of ['look','pool','pool2','nT','tA','tB','tC','tR','car','carR'])L[n]=gl.getUniformLocation(program,'u_'+n);SHOW.loc=L;SHOW.locProg=program}
 const L=SHOW.loc,P=SHOW.pool,T=SHOW.tubes,d=VP.dims;
 gl.uniform1f(L.look,SHOW.amt);if(!(SHOW.amt>0))return;
 gl.uniform4f(L.pool,P.c[0],P.c[1],P.c[2],P.r0);gl.uniform2f(L.pool2,P.r1,P.floor);
 const A=new Float32Array(18),B=new Float32Array(18),C=new Float32Array(18),R=new Float32Array(6);
 T.forEach((t,i)=>{A.set(t.a,i*3);B.set(t.b,i*3);C.set(t.col,i*3);R[i]=t.r});
 gl.uniform1i(L.nT,T.length);gl.uniform3fv(L.tA,A);gl.uniform3fv(L.tB,B);gl.uniform3fv(L.tC,C);gl.uniform1fv(L.tR,R);
 gl.uniform3f(L.car,0,d.heightY*.5,0);gl.uniform3f(L.carR,d.lengthX*.54,d.heightY*.58,d.widthZ*.54);
}
/* ---- visible fixtures: black housings + emissive faces + hanging cables, built once per GL generation ---- */
function showBox(c,h){
 const P=[],N=[],U=[],I=[];
 const faces=[[[1,0,0],[0,1,0],[0,0,1]],[[-1,0,0],[0,0,1],[0,1,0]],[[0,1,0],[0,0,1],[1,0,0]],[[0,-1,0],[1,0,0],[0,0,1]],[[0,0,1],[1,0,0],[0,1,0]],[[0,0,-1],[0,1,0],[1,0,0]]];
 for(const [n,u,v] of faces){const b=P.length/3;for(const [s,t] of [[-1,-1],[1,-1],[1,1],[-1,1]]){for(let k=0;k<3;k++)P.push(c[k]+(n[k]+u[k]*s+v[k]*t)*h[k]);N.push(...n);U.push(0,0)}I.push(b,b+1,b+2,b,b+2,b+3)}
 return bindMesh(new Float32Array(P),new Float32Array(N),new Float32Array(U),new Uint16Array(I));
}
function showRigBuild(){
 SHOW.rig=[];
 for(const t of SHOW.tubes){if(!t.fix)continue;const c=t.fix.c,h=t.fix.h;
  SHOW.rig.push({m:showBox([c[0],c[1]+h[1]+.09,c[2]],[h[0]+.06,.09,h[2]+.05]),mat:{color:[.03,.032,.036,1],colorLinear:true,surface:[.5,.6,0,0]}});
  const e=t.col,mx=Math.max(e[0],e[1],e[2]);
  SHOW.rig.push({m:showBox([c[0],c[1]-.01,c[2]],[h[0],.012,h[2]]),mat:{color:[e[0]/mx,e[1]/mx,e[2]/mx,1],colorLinear:true,surface:[.9,0,9,0]}});
  for(const sx of [-.82,.82])SHOW.rig.push({m:showBox([c[0]+h[0]*sx,(c[1]+h[1]+.2+8)/2,c[2]],[.012,(8-c[1]-h[1]-.2)/2,.012]),mat:{color:[.03,.032,.036,1],colorLinear:true,surface:[.6,.5,0,0]}});
 }
 SHOW.rigGen=runtimeGeneration;
}
function showDrawRig(){
 if(SHOW.amt<.5||!gl)return;if(SHOW.rigGen!==runtimeGeneration)showRigBuild();
 for(const r of SHOW.rig)drawMesh(r.m,identityMatrix(),r.mat,1);
}
