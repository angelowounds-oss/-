(()=>{'use strict';
const now=()=>new Date().toISOString(),finite=Number.isFinite,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const AETHER=window.AETHER=Object.seal({VERSION:'0.13.5-M19-IMPLEMENTATION',MILESTONE:'M13_CFD_SCIENTIFIC_VISUALIZATION',BASELINE:null,CURRENT_AUTHORITIES:null,DIAGNOSTICS:null,APPLICATION:null,COORDINATE_CONTRACT:null,WIND_TUNNEL_CONFIG:null,VEHICLE_TRANSFORM:null,ROLLING_ROAD:null,M4_CONFIG:null,CFD_DOMAIN:null,CFD_BRIDGE:null,SCIENTIFIC_VIS:null,M1:null,M3:null,M4:null,M5:null,M6:null,M7:null,M8:null,M9:null,M10:null,M11:null,M12:null,M13:null,M14:null,M15:null,S3:null,S3_OFFICE:null,S2:null,S1:null,SOLVER:null,MATERIALS:null,VEHICLE_PRODUCTION:null,FAN_MODULE:null,FLOW_LAYOUT:null,EXHAUST_COLLECTOR:null,ASSETS:null});
const diagnostics={startedAt:now(),events:[],errors:[],warnings:[],_bootStage:'BOOT',bootStageStartedAt:now(),bootStageTimes:[],get bootStage(){return this._bootStage},set bootStage(stage){const t=now();if(this._bootStage!==stage)this.bootStageTimes.push({stage:this._bootStage,next:stage,elapsedMs:t-this.bootStageStartedAt,totalMs:t-this.startedAt});this._bootStage=stage;this.bootStageStartedAt=t},contractReady:false,facilityReady:false,vehicleReady:false,texturesReady:false,event(type,message,detail=null){this.events.push({time:now(),type,message,detail});renderDiagnostics()},error(source,e){const x={time:now(),source,name:e?.name||'Error',message:e?.message||String(e),stack:e?.stack||null};this.errors.push(x);this.events.push({time:now(),type:'ERROR',message:source+': '+x.message});return x}};AETHER.DIAGNOSTICS=diagnostics;
const baseline={contractVersion:2,milestone:'M0_BASELINE_FROZEN',mode:'USER_CONFIRMED_STABLE_REFERENCE',frozenAt:'2026-09-28T00:00:00Z',runtime:{secureContext:window.isSecureContext,webGL2Exposed:false,devicePixelRatio:devicePixelRatio,viewport:{width:innerWidth,height:innerHeight}},review:{status:'FROZEN_FROM_USER_CONFIRMED_V40; STATIC_AUDIT_COMPLETE',browserRuntimeVerified:false,baselineRunReported:true,m0Pass:true},authorities:{rendererAuthority:'M4 WebGL2 renderer',gpuDeviceAuthority:'No GPUDevice in the WebGL renderer; optional WebGPU device is owned by AETHER.SOLVER',sceneAuthority:'M4 SceneRegistry',vehicleAuthority:'AETHER.VEHICLE_TRANSFORM + embedded BMW M4 GT3 EVO geometry',solverAuthority:'AETHER.SOLVER S0 shell; production solver not connected',stateAuthority:'M4 rolling-road adapter',cameraAuthority:'M4 CameraController',inputAuthority:'M4 InputController',uiAuthority:'M4 DOM diagnostics'},coordinateContract:{unit:'meter',unitsPerWorldUnit:1,vehicleForward:'-X',airflowDownstream:'+X',up:'+Y',lateral:'+Z'},auditFacts:['M4 WebGL2 renderer; no GPUDevice on the WebGL renderer.','Optional WebGPU device ownership belongs to AETHER.SOLVER.','M4 SceneRegistry.','AETHER.VEHICLE_TRANSFORM + embedded BMW M4 GT3 EVO geometry.','AETHER.SOLVER is an S0 shell; production solver is not connected.','M4 rolling-road adapter; M4 CameraController; M4 InputController; M4 DOM diagnostics.','Canonical coordinate target for M1: 1 unit = 1 m; +X downstream; vehicle nose -X; +Y up; +Z lateral.','v40 baseline runtime was user-confirmed in prior work; browser runtime was not rerun in this turn.']};baseline.coordinateContract={unit:'meter',unitsPerWorldUnit:1,vehicleForward:'-X',airflowDownstream:'+X',up:'+Y',lateral:'+Z'};AETHER.BASELINE=baseline;
AETHER.CURRENT_AUTHORITIES={renderer:'M4 WebGL2 production geometry renderer',gpuDevice:null,scene:'M4 SceneRegistry',vehicle:'AETHER.VEHICLE_TRANSFORM + imported BMW M4 GT3 EVO geometry',cfdDomain:'CFD_DOMAIN_CONTRACT derived from AETHER.WIND_TUNNEL_CONFIG.testSection + COORDINATE_CONTRACT',cfdBridge:'AETHER.CFD_BRIDGE / AETHER.VEHICLE_TRANSFORM shared authority',scientificVisualization:'AETHER.SCIENTIFIC_VIS / M13 dedicated WebGL2 scientific renderer',solver:null,state:'M4 rolling road state adapter',camera:'M4 CameraController',input:'M4 InputController',ui:'M4 DOM diagnostic shell',renderLoop:'M4 requestAnimationFrame',resources:'M4 WebGL resources + M13 derived resources'};

/* BEGIN S1 MODULES */
/* Shared WebGPU 1D/2D/3D dispatch plan and X-fastest linear index contract. */
const AETHER_TILED_DISPATCH=(()=>{
 'use strict';
 function plan(elementCount,workgroupSize,maxGroupsPerDimension=65535){
  if(!Number.isSafeInteger(elementCount)||elementCount<0)return {ok:false,code:'INVALID_ELEMENT_COUNT'};
  if(!Number.isSafeInteger(workgroupSize)||workgroupSize<1)return {ok:false,code:'INVALID_WORKGROUP_SIZE'};
  if(!Number.isSafeInteger(maxGroupsPerDimension)||maxGroupsPerDimension<1)return {ok:false,code:'INVALID_DISPATCH_LIMIT'};
  const requiredWorkgroups=Math.ceil(elementCount/workgroupSize);
  if(requiredWorkgroups===0)return {ok:true,code:'EMPTY_DISPATCH',elementCount,workgroupSize,requiredWorkgroups,dispatch:[0,0,0],dispatchedWorkgroups:0,overdispatchWorkgroups:0,mode:'EMPTY'};
  if(requiredWorkgroups>0xffffffff)return {ok:false,code:'LINEAR_GROUP_INDEX_OVERFLOW',elementCount,workgroupSize,requiredWorkgroups};
  const limit=maxGroupsPerDimension;let x,y,z,mode;
  if(requiredWorkgroups<=limit){x=requiredWorkgroups;y=1;z=1;mode='1D';}
  else if(requiredWorkgroups<=limit*limit){x=Math.min(limit,Math.ceil(Math.sqrt(requiredWorkgroups)));y=Math.ceil(requiredWorkgroups/x);z=1;mode='2D';}
  else if(requiredWorkgroups<=limit*limit*limit){x=Math.min(limit,Math.ceil(Math.cbrt(requiredWorkgroups)));y=Math.min(limit,Math.ceil(Math.sqrt(requiredWorkgroups/x)));z=Math.ceil(requiredWorkgroups/(x*y));mode='3D';}
  else return {ok:false,code:'DISPATCH_VOLUME_EXCEEDS_DEVICE_LIMIT',elementCount,workgroupSize,requiredWorkgroups,limit};
  const dispatchedWorkgroups=x*y*z;
  if(![x,y,z].every(v=>Number.isSafeInteger(v)&&v>=1&&v<=limit)||dispatchedWorkgroups<requiredWorkgroups||dispatchedWorkgroups>0xffffffff)
   return {ok:false,code:'DISPATCH_PLAN_INVALID',elementCount,workgroupSize,requiredWorkgroups,limit,dispatch:[x,y,z],dispatchedWorkgroups};
  return {ok:true,code:'TILED_DISPATCH_READY',elementCount,workgroupSize,requiredWorkgroups,dispatch:[x,y,z],dispatchedWorkgroups,overdispatchWorkgroups:dispatchedWorkgroups-requiredWorkgroups,mode,limit,
   indexFormula:'wg.x + wg.y * dispatch.x + wg.z * dispatch.x * dispatch.y',requiresElementBoundsGuard:true};
 }
 function linearWorkgroupIndex(x,y,z,dispatch){
  if(!Array.isArray(dispatch)||dispatch.length!==3||![x,y,z,...dispatch].every(Number.isSafeInteger))throw new TypeError('INVALID_WORKGROUP_COORDINATE');
  const [dx,dy,dz]=dispatch;if(x<0||y<0||z<0||x>=dx||y>=dy||z>=dz)throw new RangeError('WORKGROUP_OUT_OF_RANGE');
  const index=x+y*dx+z*dx*dy;if(index>0xffffffff)throw new RangeError('LINEAR_GROUP_INDEX_OVERFLOW');return index;
 }
 function wgsl(length,workgroupSize,maxGroupsPerDimension=65535){
  const p=plan(length,workgroupSize,maxGroupsPerDimension);if(!p.ok)throw Error(p.code);
  const [x,y,z]=p.dispatch;
  return `const DISPATCH_X:u32=${x}u;const DISPATCH_Y:u32=${y}u;const DISPATCH_Z:u32=${z}u;\n`+
   `fn linearWorkgroupIndex(wg:vec3<u32>)->u32{return wg.x+wg.y*DISPATCH_X+wg.z*DISPATCH_X*DISPATCH_Y;}\n`+
   `fn linearInvocationIndex(wg:vec3<u32>,local:u32)->u32{return linearWorkgroupIndex(wg)*${workgroupSize}u+local;}\n`;
 }
 return Object.freeze({plan,linearWorkgroupIndex,wgsl});
})();
/* S1 REFERENCE: independent CPU MAC operators and PCG oracle */
const S1_REFERENCE=(()=>{
  'use strict';
  const fields={p:[0,0,0],u:[1,0,0],v:[0,1,0],w:[0,0,1]};
  const freeze=x=>Object.freeze(x);
  function finite(x,n,name){
    const tag=Object.prototype.toString.call(x); if((tag!=='[object Float32Array]'&&tag!=='[object Float64Array]')||x.length!==n) throw new TypeError(name+' must be an exact Float32Array or Float64Array');
    for(let i=0;i<n;i++) if(!Number.isFinite(x[i])) throw new TypeError(name+' contains non-finite value');
    return x;
  }
  function layout(o,{gpuOnly=false}={}){
    const maxResolution=gpuOnly?384:64;
    if(!o||!Number.isInteger(o.nx)||!Number.isInteger(o.ny)||!Number.isInteger(o.nz)||o.nx<2||o.nx>maxResolution||o.ny<2||o.ny>maxResolution||o.nz<2||o.nz>maxResolution) throw new RangeError(`dimensions must be integers in [2,${maxResolution}]`);
    if(!Array.isArray(o.min)||!Array.isArray(o.max)||o.min.length!==3||o.max.length!==3||o.min.some(x=>!Number.isFinite(x))||o.max.some(x=>!Number.isFinite(x))) throw new TypeError('bounds must be finite 3-vectors');
    const nx=o.nx,ny=o.ny,nz=o.nz,min=o.min.slice(),max=o.max.slice(),h=max.map((x,q)=>(x-min[q])/([nx,ny,nz][q]));
    if(h.some(x=>!(x>0)||!Number.isFinite(x))) throw new RangeError('bounds must have positive finite extent');
    const dims={p:[nx,ny,nz],u:[nx+1,ny,nz],v:[nx,ny+1,nz],w:[nx,ny,nz+1]};
    const count={p:nx*ny*nz,u:(nx+1)*ny*nz,v:nx*(ny+1)*nz,w:nx*ny*(nz+1)};
    if(Object.values(count).some(x=>!Number.isSafeInteger(x)||x>0xffffffff)) throw new RangeError('grid element count exceeds the WGSL u32 index range');
    const idx=(f,i,j,k)=>{if(!Object.prototype.hasOwnProperty.call(dims,f)||![i,j,k].every(Number.isInteger)||i<0||j<0||k<0||i>=dims[f][0]||j>=dims[f][1]||k>=dims[f][2])throw new RangeError('invalid index');return i+dims[f][0]*(j+dims[f][1]*k)};
    const coords=(f,index)=>{if(!Object.prototype.hasOwnProperty.call(dims,f)||!Number.isInteger(index)||index<0||index>=count[f])throw new RangeError('invalid index');const sx=dims[f][0],sy=dims[f][1],i=index%sx,t=Math.floor(index/sx),j=t%sy,k=Math.floor(t/sy);return [i,j,k]};
    const position=(f,i,j,k)=>{idx(f,i,j,k);const off={p:[.5,.5,.5],u:[0,.5,.5],v:[.5,0,.5],w:[.5,.5,0]}[f];return [min[0]+(i+off[0])*h[0],min[1]+(j+off[1])*h[1],min[2]+(k+off[2])*h[2]]};
    return freeze({nx,ny,nz,min:freeze(min),max:freeze(max),h:freeze(h),dims:freeze(Object.fromEntries(Object.keys(dims).map(k=>[k,freeze(dims[k].slice())]))),counts:freeze(count),gpuOnly:gpuOnly===true,idx,coords,position});
  }
  function vec(L,a,n,name){if(L.gpuOnly)throw new Error('CPU_ORACLE_DISABLED_FOR_GPU_LAYOUT');return finite(a,n,name)}
  function divergence(L,V){const u=vec(L,V.u,L.counts.u,'u'),v=vec(L,V.v,L.counts.v,'v'),w=vec(L,V.w,L.counts.w,'w'),out=new Float64Array(L.counts.p),[dx,dy,dz]=L.h;for(let k=0;k<L.nz;k++)for(let j=0;j<L.ny;j++)for(let i=0;i<L.nx;i++){const c=L.idx('p',i,j,k);out[c]=(u[L.idx('u',i+1,j,k)]-u[L.idx('u',i,j,k)])/dx+(v[L.idx('v',i,j+1,k)]-v[L.idx('v',i,j,k)])/dy+(w[L.idx('w',i,j,k+1)]-w[L.idx('w',i,j,k)])/dz}return out}
  function gradient(L,p){p=vec(L,p,L.counts.p,'p');const [dx,dy,dz]=L.h,u=new Float64Array(L.counts.u),v=new Float64Array(L.counts.v),w=new Float64Array(L.counts.w);for(let k=0;k<L.nz;k++)for(let j=0;j<L.ny;j++)for(let i=0;i<=L.nx;i++){const q=L.idx('u',i,j,k);u[q]=i===0?0:i===L.nx?-2*p[L.idx('p',L.nx-1,j,k)]/dx:(p[L.idx('p',i,j,k)]-p[L.idx('p',i-1,j,k)])/dx}for(let k=0;k<L.nz;k++)for(let j=0;j<=L.ny;j++)for(let i=0;i<L.nx;i++)if(j>0&&j<L.ny)v[L.idx('v',i,j,k)]=(p[L.idx('p',i,j,k)]-p[L.idx('p',i,j-1,k)])/dy;for(let k=0;k<=L.nz;k++)for(let j=0;j<L.ny;j++)for(let i=0;i<L.nx;i++)if(k>0&&k<L.nz)w[L.idx('w',i,j,k)]=(p[L.idx('p',i,j,k)]-p[L.idx('p',i,j,k-1)])/dz;return {u,v,w}}
  function applyA(L,p){p=vec(L,p,L.counts.p,'p');const out=new Float64Array(p.length),[dx,dy,dz]=L.h,hs=[1/(dx*dx),1/(dy*dy),1/(dz*dz)];for(let k=0;k<L.nz;k++)for(let j=0;j<L.ny;j++)for(let i=0;i<L.nx;i++){const c=L.idx('p',i,j,k),pc=p[c];if(i>0)out[c]+=(pc-p[L.idx('p',i-1,j,k)])*hs[0];if(i<L.nx-1)out[c]+=(pc-p[L.idx('p',i+1,j,k)])*hs[0];else out[c]+=2*pc*hs[0];if(j>0)out[c]+=(pc-p[L.idx('p',i,j-1,k)])*hs[1];if(j<L.ny-1)out[c]+=(pc-p[L.idx('p',i,j+1,k)])*hs[1];if(k>0)out[c]+=(pc-p[L.idx('p',i,j,k-1)])*hs[2];if(k<L.nz-1)out[c]+=(pc-p[L.idx('p',i,j,k+1)])*hs[2]}return out}
  function diagonal(L){const [dx,dy,dz]=L.h,hs=[1/(dx*dx),1/(dy*dy),1/(dz*dz)],out=new Float64Array(L.counts.p);for(let k=0;k<L.nz;k++)for(let j=0;j<L.ny;j++)for(let i=0;i<L.nx;i++){let x=(i>0)+(i<L.nx-1);x*=hs[0];x+=((j>0)+(j<L.ny-1))*hs[1];x+=((k>0)+(k<L.nz-1))*hs[2];if(i===L.nx-1)x+=2*hs[0];out[L.idx('p',i,j,k)]=x}return out}
  const dot=(a,b)=>{let s=0;for(let i=0;i<a.length;i++)s+=a[i]*b[i];return s};
  function solve(L,b,o={}){const n=L.counts.p;b=vec(L,b,n,'b');const rho=o.rho===undefined?1.225:o.rho,dt=o.dt===undefined?1/120:o.dt,tol=o.tolerance===undefined?1e-4:o.tolerance,max=o.maxIterations===undefined?400:o.maxIterations;if(!(Number.isFinite(rho)&&rho>0&&Number.isFinite(dt)&&dt>0)||!(Number.isFinite(tol)&&tol>=1e-6&&tol<=1e-3)||!Number.isInteger(max)||max<1||max>400)throw new RangeError('invalid solver options');let p=o.initialPressure===undefined?new Float64Array(n):new Float64Array(vec(L,o.initialPressure,n,'initialPressure'));const b2=dot(b,b),br=Math.sqrt(b2/n),threshold=Math.max(tol*br,(rho/dt)*1e-6);let code='';if(!Number.isFinite(b2)||!Number.isFinite(br)||!Number.isFinite(threshold))code='NONFINITE';const A=code?null:applyA(L,p),r=new Float64Array(n);if(!code)for(let i=0;i<n;i++)r[i]=b[i]-A[i];const diag=diagonal(L),z=new Float64Array(n),d=new Float64Array(n);if(!code)for(let i=0;i<n;i++){z[i]=r[i]/diag[i];d[i]=z[i]}let rz=dot(r,z),rr=dot(r,r),iter=0;if(!code&&(!Number.isFinite(rz)||!Number.isFinite(rr)))code='NONFINITE';if(!code&&Math.sqrt(rr/n)<=threshold)code='CONVERGED';while(!code){if(iter>=max){code='ITERATION_LIMIT';break}const q=applyA(L,d),dq=dot(d,q);if(!(Number.isFinite(dq)&&dq>0)||!(Number.isFinite(rz)&&rz>0)){code='BREAKDOWN';break}const alpha=rz/dq;if(!Number.isFinite(alpha)){code='NONFINITE';break}for(let i=0;i<n;i++){p[i]+=alpha*d[i];r[i]-=alpha*q[i];if(!Number.isFinite(p[i])||!Number.isFinite(r[i])){code='NONFINITE';break}}if(code)break;const old=rz;rr=dot(r,r);if(!Number.isFinite(rr)){code='NONFINITE';break}if(Math.sqrt(rr/n)<=threshold){iter++;code='CONVERGED';break}for(let i=0;i<n;i++)z[i]=r[i]/diag[i];rz=dot(r,z);if(!(Number.isFinite(rz)&&rz>0)){code='BREAKDOWN';break}const beta=rz/old;if(!Number.isFinite(beta)){code='NONFINITE';break}for(let i=0;i<n;i++)d[i]=z[i]+beta*d[i];iter++}let residual=Infinity;if(code!=='NONFINITE'){const trueR=applyA(L,p);let tr=0;for(let i=0;i<n;i++){const x=b[i]-trueR[i];tr+=x*x}residual=Math.sqrt(tr/n);if(!Number.isFinite(residual))code='NONFINITE'}const ok=code==='CONVERGED'&&residual<=threshold;if(code==='CONVERGED'&&!ok)code='TRUE_RESIDUAL_FAILED';return {ok,code,pressure:p,iterations:iter,residualRms:residual,relativeResidual:br?residual/br:0,thresholdRms:threshold}}
  function project(L,V,o={}){const rho=o.rho===undefined?1.225:o.rho,dt=o.dt===undefined?1/120:o.dt;const db=divergence(L,V),b=new Float64Array(db.length);for(let i=0;i<b.length;i++)b[i]=-rho/dt*db[i];const s=solve(L,b,o);if(!s.ok)return s;const g=gradient(L,s.pressure),u=new Float64Array(vec(L,V.u,L.counts.u,'u')),v=new Float64Array(vec(L,V.v,L.counts.v,'v')),w=new Float64Array(vec(L,V.w,L.counts.w,'w'));for(let i=0;i<u.length;i++)u[i]-=dt/rho*g.u[i];for(let i=0;i<v.length;i++)v[i]-=dt/rho*g.v[i];for(let i=0;i<w.length;i++)w[i]-=dt/rho*g.w[i];return Object.assign({},s,{velocity:{u,v,w}})}
  function metrics(L,V){const d=divergence(L,V);let ss=0,m=0;for(const x of d){ss+=x*x;m=Math.max(m,Math.abs(x))}const [dx,dy,dz]=L.h;let inlet=0,net=0;for(let k=0;k<L.nz;k++)for(let j=0;j<L.ny;j++){const a=V.u[L.idx('u',0,j,k)]*dy*dz,b=V.u[L.idx('u',L.nx,j,k)]*dy*dz;inlet+=a;net+=b-a}for(let k=0;k<L.nz;k++)for(let i=0;i<L.nx;i++){net+=V.v[L.idx('v',i,L.ny,k)]*dx*dz-V.v[L.idx('v',i,0,k)]*dx*dz}for(let j=0;j<L.ny;j++)for(let i=0;i<L.nx;i++){net+=V.w[L.idx('w',i,j,L.nz)]*dx*dy-V.w[L.idx('w',i,j,0)]*dx*dy}return {divergenceRms:Math.sqrt(ss/d.length),divergenceMax:m,netFlux:net,inletFlux:inlet}}
  return freeze({layout,divergence,gradient,applyA,diagonal,solve,project,metrics});
})();
/* END S1 REFERENCE */
/* BEGIN S1 GPU — WebGPU pressure projection; no CPU fallback. */
const S1_GPU=(()=>{
 'use strict';
 const finite=Number.isFinite,fail=(code,message)=>({ok:false,code,message,backend:'WEBGPU'});
 function floats(a,n,name){if(!(a instanceof Float32Array||a instanceof Float64Array)||a.length!==n)throw Error('INVALID_INPUT: '+name);const out=new Float32Array(a);for(let i=0;i<n;i++)if(!finite(a[i])||!finite(out[i]))throw Error('NONFINITE_INPUT: '+name);return out;}
 function settings(o={}){const rho=o.rho??1.225,dt=o.dt??(1/120),tolerance=o.tolerance??1e-4,maxIterations=o.maxIterations??400;if(!finite(rho)||rho<=0||!finite(dt)||dt<=0||!finite(tolerance)||tolerance<1e-6||tolerance>1e-3||!Number.isInteger(maxIterations)||maxIterations<1||maxIterations>400)throw Error('INVALID_CONFIG');const rate=Math.fround(rho/dt),floor=Math.fround(Math.fround(rate*1e-6)**2);if(!finite(rate)||rate<=0||!finite(floor)||floor<=0)throw Error('INVALID_CONFIG: f32 scale');return {rho,dt,tolerance,maxIterations,rate};}
 function shaderSources(L,maxGroupsPerDimension=65535,reductionInputLengths=[]){
  const {nx,ny,nz}=L,n=L.counts.p;
  const head=`const NX:u32=${nx}u;const NY:u32=${ny}u;const NZ:u32=${nz}u;const N:u32=${n}u;
const HX:f32=${L.h[0]}f;const HY:f32=${L.h[1]}f;const HZ:f32=${L.h[2]}f;
fn good(x:f32)->bool{return (bitcast<u32>(x)&0x7f800000u)!=0x7f800000u;}
fn cell(i:u32,j:u32,k:u32)->u32{return i+NX*(j+NY*k);}\n`;
  const bind=(i,name,write=false,type='array<f32>')=>`@group(0) @binding(${i}) var<storage,${write?'read_write':'read'}> ${name}:${type};\n`;
  const kernel=(bindings,body,size=64,length=n)=>head+AETHER_TILED_DISPATCH.wgsl(length,size,maxGroupsPerDimension)+bindings+`@compute @workgroup_size(${size}) fn main(@builtin(workgroup_id) wid:vec3<u32>,@builtin(local_invocation_index) lid:u32){${body}}`;
  const coord='let t=linearInvocationIndex(wid,lid);if(t>=N){return;}let i=t%NX;let j=(t/NX)%NY;let k=t/(NX*NY);';
  const stencil=`fn apply(t:u32)->f32{let i=t%NX;let j=(t/NX)%NY;let k=t/(NX*NY);let px=x[t];var a=0.0;
if(i>0u){a+=(px-x[t-1u])/(HX*HX);}if(i+1u<NX){a+=(px-x[t+1u])/(HX*HX);}else{a+=2.0*px/(HX*HX);}
if(j>0u){a+=(px-x[t-NX])/(HY*HY);}if(j+1u<NY){a+=(px-x[t+NX])/(HY*HY);}
if(k>0u){a+=(px-x[t-NX*NY])/(HZ*HZ);}if(k+1u<NZ){a+=(px-x[t+NX*NY])/(HZ*HZ);}return a;}\n`;
  const s={};
  s.diagonal=kernel(bind(0,'out',true),coord+`var d=0.0;if(i>0u){d+=1.0/(HX*HX);}if(i+1u<NX){d+=1.0/(HX*HX);}else{d+=2.0/(HX*HX);}if(j>0u){d+=1.0/(HY*HY);}if(j+1u<NY){d+=1.0/(HY*HY);}if(k>0u){d+=1.0/(HZ*HZ);}if(k+1u<NZ){d+=1.0/(HZ*HZ);}out[t]=d;`);
  for(const raw of [false,true])s[raw?'applyRaw':'apply']=head+AETHER_TILED_DISPATCH.wgsl(n,64,maxGroupsPerDimension)+bind(0,'x')+bind(1,'out',true)+(raw?'':bind(2,'c'))+stencil+`@compute @workgroup_size(64) fn main(@builtin(workgroup_id) wid:vec3<u32>,@builtin(local_invocation_index) lid:u32){let t=linearInvocationIndex(wid,lid);if(t>=N){return;}${raw?'':'if(c[0]!=0.0){return;}'}out[t]=apply(t);}`;
  s.init=kernel(bind(0,'b')+bind(1,'ap')+bind(2,'diag')+bind(3,'r',true)+bind(4,'z',true)+bind(5,'d',true),'let t=linearInvocationIndex(wid,lid);if(t>=N){return;}let rr=b[t]-ap[t];r[t]=rr;z[t]=rr/diag[t];d[t]=z[t];');
  s.residual=kernel(bind(0,'b')+bind(1,'ap')+bind(2,'r',true),'let t=linearInvocationIndex(wid,lid);if(t<N){r[t]=b[t]-ap[t];}');
  s.update=kernel(bind(0,'p',true)+bind(1,'r',true)+bind(2,'z',true)+bind(3,'d')+bind(4,'ap')+bind(5,'diag')+bind(6,'c'),'let t=linearInvocationIndex(wid,lid);if(t>=N||c[0]!=0.0){return;}p[t]+=c[2]*d[t];r[t]-=c[2]*ap[t];z[t]=r[t]/diag[t];');
  s.direction=kernel(bind(0,'z')+bind(1,'d',true)+bind(2,'c'),'let t=linearInvocationIndex(wid,lid);if(t<N&&c[0]==0.0){d[t]=z[t]+c[3]*d[t];}');
  const reduceHead=head+'var<workgroup> tmp:array<vec2<f32>,64>;\n';
  const tree='tmp[lid]=v;workgroupBarrier();var stride=32u;loop{if(lid<stride){tmp[lid]+=tmp[lid+stride];}workgroupBarrier();if(stride==1u){break;}stride/=2u;}if(lid==0u){let group=linearWorkgroupIndex(wid);if(group<arrayLength(&out)){out[group]=tmp[0];}}';
  const entry='@compute @workgroup_size(64) fn main(@builtin(workgroup_id) wid:vec3<u32>,@builtin(local_invocation_index) lid:u32)';
  s.dot=reduceHead+AETHER_TILED_DISPATCH.wgsl(n,64,maxGroupsPerDimension)+bind(0,'a')+bind(1,'b')+bind(2,'out',true,'array<vec2<f32>>')+entry+`{let t=linearInvocationIndex(wid,lid);var v=vec2<f32>(0.0);if(t<arrayLength(&a)){let x=a[t];let y=b[t];if(!good(x)||!good(y)){v.y=1.0;}else{let p=x*y;if(good(p)){v.x=p;}else{v.y=1.0;}}}${tree}}`;
  for(let i=0;i<reductionInputLengths.length;i++){
   const inputLength=reductionInputLengths[i];
   s['reduce'+i]=reduceHead+AETHER_TILED_DISPATCH.wgsl(inputLength,64,maxGroupsPerDimension)+bind(0,'a',false,'array<vec2<f32>>')+bind(1,'out',true,'array<vec2<f32>>')+entry+`{let t=linearInvocationIndex(wid,lid);var v=vec2<f32>(0.0);if(t<arrayLength(&a)){v=a[t];}${tree}}`;
  }
  // Control: status,iter,alpha,beta,rz,rr,b2,dq,thresholdRMS²,rho/dt,tol,maxIter,newRz.
  for(const slot of [4,5,6,7,12])s['sink'+slot]=kernel(bind(0,'pair',false,'array<vec2<f32>>')+bind(1,'c',true),`if(c[0]!=0.0){return;}let v=pair[0];if(v.y!=0.0||!good(v.x)){c[0]=2.0;}else{c[${slot}]=v.x;}`,1,1);
  s.controlInit=kernel(bind(0,'c',true),'if(c[0]!=0.0){return;}let f=c[9]*1e-6;c[8]=max(c[10]*c[10]*c[6]/f32(N),f*f);if(!good(c[8])){c[0]=2.0;}else if(c[5]/f32(N)<=c[8]*c[13]){c[0]=1.0;}else if(c[4]<=0.0){c[0]=3.0;}',1,1);
  s.alpha=kernel(bind(0,'c',true),'if(c[0]!=0.0){return;}if(c[7]<=0.0||c[4]<=0.0){c[0]=3.0;return;}c[2]=c[4]/c[7];if(!good(c[2])){c[0]=2.0;}',1,1);
  s.beta=kernel(bind(0,'c',true),'if(c[0]!=0.0){return;}c[1]+=1.0;if(c[5]/f32(N)<=c[8]*c[13]){c[0]=1.0;return;}if(c[1]>=c[11]){c[0]=4.0;return;}if(c[12]<=0.0||c[4]<=0.0){c[0]=3.0;return;}c[3]=c[12]/c[4];c[4]=c[12];if(!good(c[3])){c[0]=2.0;}',1,1);
  const div=coord+'let a=i+(NX+1u)*(j+NY*k);let b=i+NX*(j+(NY+1u)*k);let d=i+NX*(j+NY*k);let val=(u[a+1u]-u[a])/HX+(v[b+NX]-v[b])/HY+(w[d+NX*NY]-w[d])/HZ;';
  s.divergence=kernel(bind(0,'u')+bind(1,'v')+bind(2,'w')+bind(3,'out',true),div+'out[t]=val;');
  s.rhs=kernel(bind(0,'u')+bind(1,'v')+bind(2,'w')+bind(3,'out',true)+bind(4,'c'),div+'out[t]=-c[9]*val;');
  for(const axis of ['u','v','w']){
   const count=L.counts[axis];
   const g=axis==='u'?'let i=t%(NX+1u);let j=(t/(NX+1u))%NY;let k=t/((NX+1u)*NY);if(i==NX){g=-2.0*p[cell(NX-1u,j,k)]/HX;}else if(i>0u){g=(p[cell(i,j,k)]-p[cell(i-1u,j,k)])/HX;}':axis==='v'?'let i=t%NX;let j=(t/NX)%(NY+1u);let k=t/(NX*(NY+1u));if(j>0u&&j<NY){g=(p[cell(i,j,k)]-p[cell(i,j-1u,k)])/HY;}':'let i=t%NX;let j=(t/NX)%NY;let k=t/(NX*NY);if(k>0u&&k<NZ){g=(p[cell(i,j,k)]-p[cell(i,j,k-1u)])/HZ;}';
   s['gradient'+axis]=kernel(bind(0,'p')+bind(1,'out',true),`let t=linearInvocationIndex(wid,lid);if(t>=${count}u){return;}var g=0.0;${g}out[t]=g;`,64,count);
   s['project'+axis]=kernel(bind(0,'p')+bind(1,'input')+bind(2,'out',true)+bind(3,'c'),`let t=linearInvocationIndex(wid,lid);if(t>=${count}u){return;}var g=0.0;${g}out[t]=input[t]-g/c[9];`,64,count);
  }
  return Object.freeze(s);
 }
 async function create(device,layout,options={}){
  const L=S1_REFERENCE.layout({nx:layout.nx,ny:layout.ny,nz:layout.nz,min:Array.from(layout.min),max:Array.from(layout.max)},{gpuOnly:true}),n=L.counts.p;
  const solidInput=options.solid??null;
  if(solidInput!==null&&(Object.prototype.toString.call(solidInput)!=='[object Uint32Array]'||solidInput.length!==n))throw Error('INVALID_MASK');
  if(solidInput&&n>64**3)throw Error('384_MASK_TOPOLOGY_REVIEW_REQUIRED');
  if(solidInput!==null&&solidInput.some(x=>x>1))throw Error('INVALID_MASK');
  const solid=solidInput===null?null:new Uint32Array(solidInput);
  const preconditioner=options.preconditioner??'jacobi';
  if(!['jacobi','jacobi4'].includes(preconditioner)||(preconditioner==='jacobi4'&&!solid))throw Error('INVALID_PRECONDITIONER');
  const fourSweep=preconditioner==='jacobi4';
  const fluidCount=solid?S2_REFERENCE.create(L,solid,{topologyOnly:true}).fluidCount:n;
  const largest=Math.max(...Object.values(L.counts))*4,lim=device.limits||{},maxGroups=lim.maxComputeWorkgroupsPerDimension;
  const needs={maxComputeWorkgroupSizeX:64,maxComputeInvocationsPerWorkgroup:64,maxComputeWorkgroupStorageSize:512,maxStorageBuffersPerShaderStage:solid?8:7,maxBufferSize:Math.max(64,largest),maxStorageBufferBindingSize:Math.max(64,largest),maxComputeWorkgroupsPerDimension:1};
  for(const [k,v]of Object.entries(needs))if(!finite(lim[k])||lim[k]<v)throw Error('S1_LIMITS: '+k);
  const levelCounts=[];for(let count=Math.ceil(n/64);;count=Math.ceil(count/64)){levelCounts.push(count);if(count===1)break;}
  const reductionInputLengths=levelCounts.slice(0,-1);
  const baseSources=shaderSources(L,maxGroups,reductionInputLengths);
  const sources=options.s3?(solid&&typeof S3_WGSL==='function'?{...S2_WGSL(L,baseSources,fluidCount,maxGroups),...S3_WGSL(L,maxGroups)}:null):solid?S2_WGSL(L,baseSources,fluidCount,maxGroups):baseSources;
  if(!sources)throw Error('S3_MASK_REQUIRED');
  const s3Boundary=options.s3?S3_CONTROL(L,solid):null;let backflowStreak=0;
  const maskedNames=new Set(['diagonal','applyRaw','apply','init','residual','update','direction','dot','divergence','rhs','pcstep',...['u','v','w'].flatMap(a=>['gradient'+a,'project'+a,'enforce'+a])]);
  const buffers=[],pipes={},groups=new Map(),current=options.isCurrent||(()=>true);let disposed=false,busy=false,allocated=0,peak=0;
  const check=()=>{if(disposed)throw Error('DISPOSED');if(!current())throw Error('STALE');};
  const alloc=(name,size,usage=140)=>{check();const b=device.createBuffer({label:'S1 '+name,size,usage});buffers.push(b);allocated+=size;peak=Math.max(peak,allocated);return b;};
  const dispose=()=>{if(disposed)return;disposed=true;for(const b of buffers)b.destroy();allocated=0;groups.clear();};
  const stats=()=>({backend:'WEBGPU',preconditioner,disposed,allocatedBytes:allocated,allocatedPeakBytes:peak,bufferCount:disposed?0:buffers.length,createdBuffers:buffers.length,grid:[L.nx,L.ny,L.nz],fluidCells:fluidCount,solidCells:n-fluidCount});
  let scope=false;
  try{
   check();if(device.pushErrorScope){device.pushErrorScope('validation');scope=true;}
   const B={};for(const name of ['p','r','z','d','ap','b','diag'])B[name]=alloc(name,n*4);
   if(solid){B.mask=alloc('solid',n*4);device.queue.writeBuffer(B.mask,0,solid);}
   if(fourSweep)B.zt=alloc('preconditioner temp',n*4);
   for(const a of ['u','v','w']){B[a]=alloc(a,L.counts[a]*4);B['g'+a]=alloc('g'+a,L.counts[a]*4);}
   if(options.s3){for(const a of ['u','v','w']){B['q'+a]=alloc('accepted '+a,L.counts[a]*4);B['a'+a]=alloc('advected '+a,L.counts[a]*4);}B.qp=alloc('accepted pressure',n*4);B.sp=alloc('S3 parameters',48);}
   B.c=alloc('control',64);B.read=alloc('readback',Math.max(64,largest),9);
   const levels=levelCounts.map((count,i)=>({count,buffer:alloc('reduction'+i,count*8)}));
   for(const [name,code]of Object.entries(sources)){
    check();const module=device.createShaderModule({label:'S1 '+name,code});
    if(module.getCompilationInfo){const info=await module.getCompilationInfo();check();const errors=info.messages.filter(x=>x.type==='error');if(errors.length)throw Error(name+': '+errors.map(x=>x.message).join('; '));}
    pipes[name]=await device.createComputePipelineAsync({label:'S1 '+name,layout:'auto',compute:{module,entryPoint:'main'}});check();
   }
   levels.forEach((v,i)=>B['l'+i]=v.buffer);
   const scalarNames=new Set(['sink4','sink5','sink6','sink7','sink12','controlInit','alpha','beta','restart']);
   const op=(name,names,length=n)=>{if(solid&&maskedNames.has(name))names=[...names,'mask'];const key=name+':'+names.join(',');let bg=groups.get(key);if(!bg){bg=device.createBindGroup({layout:pipes[name].getBindGroupLayout(0),entries:names.map((name,binding)=>({binding,resource:{buffer:B[name]}}))});groups.set(key,bg);}const size=scalarNames.has(name)?1:64,plan=AETHER_TILED_DISPATCH.plan(length,size,maxGroups);if(!plan.ok)throw Error('S1_DISPATCH: '+name+': '+plan.code);return {name,bg,dispatch:plan.dispatch};};
   const scalar=name=>op(name,['c'],1);
   const dot=(a,b,slot)=>{const ops=[op('dot',[a,b,'l0'])];for(let i=1;i<levels.length;i++)ops.push(op('reduce'+(i-1),['l'+(i-1),'l'+i],levels[i-1].count));if(slot!==undefined)ops.push(op('sink'+slot,['l'+(levels.length-1),'c'],1));return ops;};
   const encode=(e,ops)=>{for(const o of ops){const p=e.beginComputePass();p.setPipeline(pipes[o.name]);p.setBindGroup(0,o.bg);p.dispatchWorkgroups(...o.dispatch);p.end();}};
   const submit=ops=>{check();const e=device.createCommandEncoder();encode(e,ops);device.queue.submit([e.finish()]);};
   const read=async(buffer,size,ops=[])=>{check();const e=device.createCommandEncoder();encode(e,ops);e.copyBufferToBuffer(buffer,0,B.read,0,size);device.queue.submit([e.finish()]);let mapped=false;try{await B.read.mapAsync(1,0,size);mapped=true;check();return B.read.getMappedRange(0,size).slice(0);}finally{if(mapped&&!disposed)B.read.unmap();}};
   const write=(name,a)=>{check();device.queue.writeBuffer(B[name],0,a);};
   const copyBuffer=(source,target,length)=>{check();const e=device.createCommandEncoder();e.copyBufferToBuffer(B[source],0,B[target],0,length);device.queue.submit([e.finish()]);};
   submit([op('diagonal',['diag'])]);
   if(options.s3){for(const a of ['u','v','w'])write('q'+a,new Float32Array(L.counts[a]));write('qp',new Float32Array(n));}
   if(scope){scope=false;const e=await device.popErrorScope();check();if(e)throw Error(e.message);}
   const precondition=()=>fourSweep?[op('pczero',['z']),op('pcstep',['z','zt','r','diag']),op('pcstep',['zt','z','r','diag']),op('pcstep',['z','zt','r','diag']),op('pcstep',['zt','z','r','diag'])]:[];
   const initOps=[op('applyRaw',['p','ap']),op('init',['b','ap','diag','r','z','d']),...precondition(),...(fourSweep?[op('direction',['z','d','c'])]:[]),...dot('b','b',6),...dot('r','r',5),...dot('r','z',4),scalar('controlInit')];
   const iteration=[op('apply',['d','ap','c']),...dot('d','ap',7),scalar('alpha'),op('update',['p','r','z','d','ap','diag','c']),...precondition(),...dot('r','r',5),...dot('r','z',12),scalar('beta'),op('direction',['z','d','c'])];
   async function core(rhs,o,V){
    const s=settings(o),devicePressure=o.initialPressure==='DEVICE',deviceVelocity=V==='DEVICE';
    if((devicePressure||deviceVelocity)&&!options.s3)throw Error('S3_NOT_ENABLED');
    const p=devicePressure?null:o.initialPressure===undefined?new Float32Array(n):floats(o.initialPressure,n,'initialPressure');
    if(solid&&p&&p.some((x,t)=>solid[t]&&x!==0))throw Error('SOLID_FIELD_NONZERO');
    const inlet=o.inletSpeed??0;if(solid&&(!finite(inlet)||inlet<0||!finite(Math.fround(inlet))))throw Error('INVALID_INLET');
    // Projection uses a 100x tighter recursive RMS target to leave flux headroom.
    // The requested true-residual acceptance bound is unchanged.
    const c=new Float32Array(16);c[9]=s.rate;c[10]=s.tolerance;c[11]=s.maxIterations;c[13]=V?1e-4:1e-2;c[14]=inlet;write('c',c);if(devicePressure)copyBuffer('qp','p',n*4);else write('p',p);
    if(V){if(!deviceVelocity)for(const a of ['u','v','w'])write(a,floats(V[a],L.counts[a],a));if(solid)submit(['u','v','w'].map(a=>op('enforce'+a,[a,'c'],L.counts[a])));submit([op('rhs',['u','v','w','b','c'])]);}else{const b=floats(rhs,n,'rhs');if(solid&&b.some((x,t)=>solid[t]&&x!==0))throw Error('SOLID_FIELD_NONZERO');write('b',b);}
    let ctl=new Float32Array(await read(B.c,64,initOps)),restarts=0,residualRms=Infinity,thresholdRms=Infinity;
    for(;;){
    while(ctl[0]===0&&ctl[1]<s.maxIterations){const batch=Math.min(8,s.maxIterations-ctl[1]),ops=[];for(let i=0;i<batch;i++)ops.push(...iteration);ctl=new Float32Array(await read(B.c,64,ops));}
    check();const codes={0:'ITERATION_LIMIT',1:'CONVERGED',2:'NONFINITE',3:'BREAKDOWN',4:'ITERATION_LIMIT'};
    if(ctl[0]!==1){
     const diagnostic={iterations:ctl[1],recursiveResidualRms:Math.sqrt(ctl[5]/fluidCount),thresholdRms:Math.sqrt(ctl[8]),internalTargetRms:Math.sqrt(ctl[8]*ctl[13])};
     if(ctl[0]===4){const pair=new Float32Array(await read(levels.at(-1).buffer,8,[op('applyRaw',['p','ap']),op('residual',['b','ap','r']),...dot('r','r')]));diagnostic.trueResidualRms=pair[1]===0?Math.sqrt(pair[0]/fluidCount):null;}
     return {...fail(codes[ctl[0]]||'INVALID_GPU_STATUS'),...diagnostic,restarts};
    }
    const pair=new Float32Array(await read(levels.at(-1).buffer,8,[op('applyRaw',['p','ap']),op('residual',['b','ap','r']),...dot('r','r')]));
    residualRms=Math.sqrt(pair[0]/fluidCount);thresholdRms=Math.sqrt(ctl[8]);
    if(pair[1]!==0||!finite(residualRms)||!finite(thresholdRms))return fail('NONFINITE');
    if(residualRms>thresholdRms){
     // f32 recurrence drift: recompute r=b-Ap and restart the same PCG.
     // Keep pressure, RHS, tolerance and the cumulative 400-iteration budget.
     if(fourSweep&&ctl[1]<s.maxIterations){restarts++;ctl=new Float32Array(await read(B.c,64,[scalar('restart'),...initOps]));continue;}
     return {...fail('TRUE_RESIDUAL_FAILED'),residualRms,thresholdRms,iterations:ctl[1],restarts};
    }
    break;
    }
    const pressure=new Float32Array(await read(B.p,n*4));check();if(!pressure.every(finite))return fail('NONFINITE');
    return {ok:true,code:'CONVERGED',backend:'WEBGPU',preconditioner,restarts,pressure,iterations:ctl[1],residualRms,relativeResidual:ctl[6]>0?residualRms/Math.sqrt(ctl[6]/fluidCount):0,thresholdRms};
   }
   async function locked(task){
    if(disposed)return fail('DISPOSED');if(!current())return fail('STALE');if(busy)return fail('BUSY');busy=true;let es=false;
    try{if(device.pushErrorScope){device.pushErrorScope('validation');es=true;}const result=await task();check();if(es){es=false;const e=await device.popErrorScope();check();if(e)return fail('GPU_ERROR',e.message);}return result;}
    catch(e){return fail(e.message.split(':')[0],e.message);}finally{if(es)try{await device.popErrorScope();}catch(_){}busy=false;}
   }
   const solve=(rhs,o={})=>locked(()=>core(rhs,o));
   const project=(V,o={})=>locked(async()=>{const r=await core(null,o,V);if(!r.ok)return r;submit(['u','v','w'].map(a=>op('project'+a,['p',a,'g'+a,'c'],L.counts[a])));const velocity={};for(const a of ['u','v','w']){velocity[a]=new Float32Array(await read(B['g'+a],L.counts[a]*4));if(!velocity[a].every(finite))return fail('NONFINITE');}check();return {...r,velocity};});
   const stepGPU=o=>locked(async()=>{
    if(!options.s3)return fail('S3_NOT_ENABLED');
    const dt=o.dt,nu=o.viscosity??1.5e-5,inletBefore=o.inletBefore??0,inletAfter=o.inletAfter??0,ground=o.groundSpeed??0,belt=o.belt;
    if(![dt,nu,inletBefore,inletAfter,ground].every(finite)||!(dt>0)||nu<0||inletBefore<0||inletAfter<0||ground<0||
      !belt||!Array.isArray(belt.min)||!Array.isArray(belt.max)||belt.min.length!==2||belt.max.length!==2||
      ![...belt.min,...belt.max].every(finite))return fail('INVALID_S3_STEP');
    const param=new Float32Array(12);param.set([dt,inletBefore,inletAfter,nu,ground,belt.min[0],belt.max[0],belt.min[1],belt.max[1]]);write('sp',param);
    submit(['u','v','w'].map(a=>op('advect'+a,['qu','qv','qw','mask','sp','a'+a],L.counts[a])));
    submit(['u','v','w'].map(a=>op('viscous'+a,['a'+a,'mask','sp',a],L.counts[a])));
    const r=await core(null,{rho:o.rho??1.225,dt,tolerance:o.tolerance??1e-4,maxIterations:o.maxIterations??400,inletSpeed:inletAfter,initialPressure:'DEVICE'},'DEVICE');
    if(!r.ok)return r;
    submit(['u','v','w'].map(a=>op('project'+a,['p',a,'g'+a,'c'],L.counts[a])));
    const velocity={};for(const a of ['u','v','w']){velocity[a]=new Float32Array(await read(B['g'+a],L.counts[a]*4));if(!velocity[a].every(finite))return fail('NONFINITE');}
    const cpu=S2_REFERENCE.create(L,solid),metrics=cpu.metrics(velocity),uref=Math.max(o.targetInletSpeed??inletAfter,1),length=o.referenceLength??4.7;
    const backflow=s3Boundary.inspectBackflow(velocity,{targetInletSpeed:o.targetInletSpeed??inletAfter,priorConsecutive:backflowStreak});
    if(backflow.tripped)return {...fail('OUTLET_BACKFLOW'),backflow};
    if(metrics.divergenceRms*length/uref>1e-4||metrics.divergenceMax*length/uref>1e-2||metrics.relativeFluxError>1e-3||metrics.blockedNormalMax>1e-6*uref)return {...fail('NUMERICAL_GATE_FAILED'),metrics};
    check();for(const a of ['u','v','w'])copyBuffer('g'+a,'q'+a,L.counts[a]*4);copyBuffer('p','qp',n*4);
    backflowStreak=backflow.consecutive;
    return {...r,velocity,metrics,backflow,committed:true,stage:'S3_GPU_DIAGNOSTIC'};
   });
   const inspectOperators=(p,V)=>locked(async()=>{write('p',floats(p,n,'pressure'));for(const a of ['u','v','w'])write(a,floats(V[a],L.counts[a],a));submit([op('applyRaw',['p','ap']),op('divergence',['u','v','w','b']),...['u','v','w'].map(a=>op('gradient'+a,['p','g'+a],L.counts[a]))]);const A=new Float32Array(await read(B.ap,n*4)),divergence=new Float32Array(await read(B.b,n*4)),gradient={};for(const a of ['u','v','w'])gradient[a]=new Float32Array(await read(B['g'+a],L.counts[a]*4));return {ok:true,A,divergence,gradient};});
   return Object.freeze({solve,project,stepGPU,inspectOperators,dispose,getStats:stats});
  }catch(e){if(scope)try{await device.popErrorScope();}catch(_){}dispose();throw e;}
 }
 return Object.freeze({create,shaderSources});
})();
/* END S1 GPU */
/* END S1 MODULES */
/* BEGIN S2 MODULES */
/* S2 MAC reference. Geometry and boundary state are owned snapshots. */
const S2_REFERENCE=(()=>{
 'use strict';
 function create(L,input,options={}){
  const {nx,ny,nz}=L,N=nx*ny*nz,h=L.h;
  if(Object.prototype.toString.call(input)!=='[object Uint32Array]'||input.length!==N||input.some(x=>x>1))throw Error('INVALID_MASK');
  const mask=new Uint32Array(input),fluidCount=N-mask.reduce((a,b)=>a+b,0),idx=(i,j,k)=>i+nx*(j+ny*k);
  if(!fluidCount)throw Error('NO_FLUID_CELLS');
  const seen=new Uint8Array(N),queue=new Int32Array(N);let head=0,tail=0;
  const push=t=>{if(!mask[t]&&!seen[t]){seen[t]=1;queue[tail++]=t;}};
  for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)push(idx(nx-1,j,k));
  while(head<tail){const t=queue[head++],i=t%nx,j=Math.floor(t/nx)%ny,k=Math.floor(t/nx/ny);if(i)push(t-1);if(i+1<nx)push(t+1);if(j)push(t-nx);if(j+1<ny)push(t+nx);if(k)push(t-nx*ny);if(k+1<nz)push(t+nx*ny);}
  if(tail!==fluidCount)throw Error('OUTLET_DISCONNECTED');
  if(options.topologyOnly)return Object.freeze({fluidCount});
  const validate=(a,n)=>{if(!a||a.length!==n||!Array.from(a).every(Number.isFinite))throw Error('INVALID_FIELD');};
  const faces={};
  // 0 solid/wall, 1 fluid-fluid, 2 inlet, 3 outlet. Independent face enumeration.
  for(const [axis,f]of ['u','v','w'].entries()){
   const dims=L.dims[f],type=new Uint8Array(L.counts[f]),left=new Int32Array(type.length).fill(-1),right=new Int32Array(type.length).fill(-1);
   for(let k=0;k<dims[2];k++)for(let j=0;j<dims[1];j++)for(let i=0;i<dims[0];i++){
    const t=i+dims[0]*(j+dims[1]*k),p=[i,j,k],a=p.slice();a[axis]--;
    const inside=q=>q[0]>=0&&q[0]<nx&&q[1]>=0&&q[1]<ny&&q[2]>=0&&q[2]<nz;
    const l=inside(a)?idx(...a):-1,r=inside(p)?idx(...p):-1;left[t]=l;right[t]=r;
    if((l>=0&&mask[l])||(r>=0&&mask[r]))continue;
    type[t]=l>=0&&r>=0?1:axis===0?(l<0?2:3):0;
   }faces[f]={type,left,right,h:h[axis]};
  }
  function gradient(p){validate(p,N);const V={};for(const f of ['u','v','w']){const {type,left,right,h}=faces[f],a=V[f]=new Float64Array(type.length);for(let t=0;t<a.length;t++)a[t]=type[t]===1?(p[right[t]]-p[left[t]])/h:type[t]===3?-2*p[left[t]]/h:0;}return V;}
  function divergence(V){const d=new Float64Array(N);for(const f of ['u','v','w']){const {type,left,right,h}=faces[f];validate(V[f],type.length);for(let t=0;t<type.length;t++){if(type[t]===0)continue;const v=V[f][t]/h;if(left[t]>=0)d[left[t]]+=v;if(right[t]>=0)d[right[t]]-=v;}}return d;}
  function applyA(p){const d=divergence(gradient(p));for(let t=0;t<N;t++)d[t]=-d[t];return d;}
  function diagonal(){const d=new Float64Array(N);for(const f of ['u','v','w']){const {type,left,right,h}=faces[f];for(let t=0;t<type.length;t++){if(type[t]===1){d[left[t]]+=1/h**2;d[right[t]]+=1/h**2;}else if(type[t]===3)d[left[t]]+=2/h**2;}}return d;}
  function enforce(V,inletSpeed){if(!Number.isFinite(inletSpeed)||inletSpeed<0)throw Error('INVALID_INLET');const out={};for(const f of ['u','v','w']){const {type}=faces[f];validate(V[f],type.length);const a=out[f]=new Float64Array(V[f]);for(let t=0;t<a.length;t++){if(type[t]===0)a[t]=0;else if(type[t]===2)a[t]=inletSpeed;}}return out;}
  function metrics(V){const d=divergence(V);let sum=0,max=0,inlet=0,outlet=0,blockedMax=0;for(let t=0;t<N;t++)if(!mask[t]){sum+=d[t]**2;max=Math.max(max,Math.abs(d[t]));}for(const f of ['u','v','w']){const {type}=faces[f];for(let t=0;t<type.length;t++){if(type[t]===0)blockedMax=Math.max(blockedMax,Math.abs(V[f][t]));if(type[t]===2)inlet+=V[f][t]*h[1]*h[2];if(type[t]===3)outlet+=V[f][t]*h[1]*h[2];}}return {divergenceRms:Math.sqrt(sum/fluidCount),divergenceMax:max,inletFlux:inlet,outletFlux:outlet,netFlux:outlet-inlet,relativeFluxError:Math.abs(outlet-inlet)/Math.max(Math.abs(inlet),1e-9),blockedNormalMax:blockedMax};}
  return Object.freeze({fluidCount,gradient,divergence,applyA,diagonal,enforce,metrics});
 }
 return Object.freeze({create});
})();

/* S2 operator overrides; S1 PCG orchestration/reduction stays shared. */
const S2_WGSL=(L,base,fluidCount,maxGroupsPerDimension=65535)=>{
 const {nx,ny,nz}=L,N=L.counts.p;
 const head=`const NX:u32=${nx}u;const NY:u32=${ny}u;const NZ:u32=${nz}u;const N:u32=${N}u;
const HX:f32=${L.h[0]}f;const HY:f32=${L.h[1]}f;const HZ:f32=${L.h[2]}f;
fn cell(i:u32,j:u32,k:u32)->u32{return i+NX*(j+NY*k);}
fn fluid(t:u32)->bool{return solid[t]==0u;}
`;
 const bind=(i,name,write=false,type='array<f32>')=>`@group(0) @binding(${i}) var<storage,${write?'read_write':'read'}> ${name}:${type};\n`;
 const mask=i=>bind(i,'solid',false,'array<u32>');
 const kernel=(bindings,body,length=N,size=64)=>head+AETHER_TILED_DISPATCH.wgsl(length,size,maxGroupsPerDimension)+bindings+`@compute @workgroup_size(${size}) fn main(@builtin(workgroup_id) wid:vec3<u32>,@builtin(local_invocation_index) lid:u32){${body}}`;
 const coord='let t=linearInvocationIndex(wid,lid);if(t>=N){return;}let i=t%NX;let j=(t/NX)%NY;let k=t/(NX*NY);';
 const links=[['i>0u','t-1u','HX'],['i+1u<NX','t+1u','HX'],['j>0u','t-NX','HY'],['j+1u<NY','t+NX','HY'],['k>0u','t-NX*NY','HZ'],['k+1u<NZ','t+NX*NY','HZ']];
 const stencil=diag=>links.map(([cond,t,h])=>`if(${cond}){if(fluid(${t})){a+=${diag?'1.0':`(x[t]-x[${t}])`}/(${h}*${h});}}`).join('')+`if(i+1u==NX){a+=2.0*${diag?'1.0':'x[t]'}/(HX*HX);}`;
 const s={...base};
 s.restart=bind(0,'c',true)+'@compute @workgroup_size(1) fn main(){c[0]=0.0;c[2]=0.0;c[3]=0.0;}';
 s.pczero=AETHER_TILED_DISPATCH.wgsl(N,64,maxGroupsPerDimension)+bind(0,'out',true)+`@compute @workgroup_size(64) fn main(@builtin(workgroup_id) wid:vec3<u32>,@builtin(local_invocation_index) lid:u32){let t=linearInvocationIndex(wid,lid);if(t<${N}u){out[t]=0.0;}}`;
 // Four fixed damped Jacobi sweeps from zero define a symmetric positive
 // polynomial preconditioner. No tolerance-dependent inner iteration.
 s.pcstep=kernel(bind(0,'x')+bind(1,'out',true)+bind(2,'r')+bind(3,'diag')+mask(4),coord+'out[t]=0.0;if(!fluid(t)){return;}var a=0.0;'+stencil(false)+'out[t]=x[t]+(2.0/3.0)*(r[t]-a)/diag[t];');
 s.diagonal=kernel(bind(0,'out',true)+mask(1),coord+'out[t]=0.0;if(!fluid(t)){return;}var a=0.0;'+stencil(true)+'out[t]=a;');
 for(const raw of [false,true])s[raw?'applyRaw':'apply']=kernel(bind(0,'x')+bind(1,'out',true)+(raw?'':bind(2,'c'))+mask(raw?2:3),coord+(raw?'':'if(c[0]!=0.0){return;}')+'out[t]=0.0;if(!fluid(t)){return;}var a=0.0;'+stencil(false)+'out[t]=a;');
 s.init=kernel(bind(0,'b')+bind(1,'ap')+bind(2,'diag')+bind(3,'r',true)+bind(4,'z',true)+bind(5,'d',true)+mask(6),'let t=linearInvocationIndex(wid,lid);if(t>=N){return;}r[t]=0.0;z[t]=0.0;d[t]=0.0;if(!fluid(t)){return;}r[t]=b[t]-ap[t];z[t]=r[t]/diag[t];d[t]=z[t];');
 s.residual=kernel(bind(0,'b')+bind(1,'ap')+bind(2,'r',true)+mask(3),'let t=linearInvocationIndex(wid,lid);if(t>=N){return;}r[t]=0.0;if(fluid(t)){r[t]=b[t]-ap[t];}');
 s.update=kernel(bind(0,'p',true)+bind(1,'r',true)+bind(2,'z',true)+bind(3,'d')+bind(4,'ap')+bind(5,'diag')+bind(6,'c')+mask(7),'let t=linearInvocationIndex(wid,lid);if(t>=N||c[0]!=0.0){return;}if(!fluid(t)){p[t]=0.0;r[t]=0.0;z[t]=0.0;return;}p[t]+=c[2]*d[t];r[t]-=c[2]*ap[t];z[t]=r[t]/diag[t];');
 // Preserve the original direction vector while updating. Solids remain zero.
 s.direction=kernel(bind(0,'z')+bind(1,'d',true)+bind(2,'c')+mask(3),'let t=linearInvocationIndex(wid,lid);if(t<N&&c[0]==0.0){if(fluid(t)){d[t]=z[t]+c[3]*d[t];}else{d[t]=0.0;}}');
 s.dot=base.dot.replace('@compute',mask(3)+'@compute').replace('if(t<arrayLength(&a))','if(t<arrayLength(&a)&&solid[t]==0u)');
 for(const name of ['controlInit','beta'])s[name]=base[name].replaceAll('f32(N)',`f32(${fluidCount}u)`);
 const div=coord+`out[t]=0.0;if(!fluid(t)){return;}let a=i+(NX+1u)*(j+NY*k);let b=i+NX*(j+(NY+1u)*k);let d=i+NX*(j+NY*k);var val=0.0;
if(i==0u){val-=u[a]/HX;}else if(fluid(t-1u)){val-=u[a]/HX;}
if(i+1u==NX){val+=u[a+1u]/HX;}else if(fluid(t+1u)){val+=u[a+1u]/HX;}
if(j>0u){if(fluid(t-NX)){val-=v[b]/HY;}}if(j+1u<NY){if(fluid(t+NX)){val+=v[b+NX]/HY;}}
if(k>0u){if(fluid(t-NX*NY)){val-=w[d]/HZ;}}if(k+1u<NZ){if(fluid(t+NX*NY)){val+=w[d+NX*NY]/HZ;}}`;
 s.divergence=kernel(bind(0,'u')+bind(1,'v')+bind(2,'w')+bind(3,'out',true)+mask(4),div+'out[t]=val;');
 s.rhs=kernel(bind(0,'u')+bind(1,'v')+bind(2,'w')+bind(3,'out',true)+bind(4,'c')+mask(5),div+'out[t]=-c[9]*val;');
 for(const axis of ['u','v','w']){
  const coord=axis==='u'?'let i=t%(NX+1u);let j=(t/(NX+1u))%NY;let k=t/((NX+1u)*NY);':axis==='v'?'let i=t%NX;let j=(t/NX)%(NY+1u);let k=t/(NX*(NY+1u));':'let i=t%NX;let j=(t/NX)%NY;let k=t/(NX*NY);';
  const a={u:'i',v:'j',w:'k'}[axis],lim={u:'NX',v:'NY',w:'NZ'}[axis],h={u:'HX',v:'HY',w:'HZ'}[axis],left={u:'cell(i-1u,j,k)',v:'cell(i,j-1u,k)',w:'cell(i,j,k-1u)'}[axis];
  const blocked=`var blocked=false;if(${a}>0u){if(!fluid(${left})){blocked=true;}}if(${a}<${lim}){if(!fluid(cell(i,j,k))){blocked=true;}}`;
  const outer=axis==='u'?'':`if(${a}==0u||${a}==${lim}){blocked=true;}`;
  const gradient=`var g=0.0;if(!blocked){if(${a}>0u&&${a}<${lim}){g=(p[cell(i,j,k)]-p[${left}])/${h};}${axis==='u'?'else if(i==NX){g=-2.0*p[cell(NX-1u,j,k)]/HX;}':''}}`;
  const prefix=`let t=linearInvocationIndex(wid,lid);if(t>=${L.counts[axis]}u){return;}`+coord+blocked+outer;
  s['gradient'+axis]=kernel(bind(0,'p')+bind(1,'out',true)+mask(2),prefix+gradient+'out[t]=g;',L.counts[axis]);
  s['project'+axis]=kernel(bind(0,'p')+bind(1,'input')+bind(2,'out',true)+bind(3,'c')+mask(4),prefix+gradient+'out[t]=0.0;if(!blocked){out[t]=input[t]-g/c[9];}',L.counts[axis]);
  s['enforce'+axis]=kernel(bind(0,'input',true)+bind(1,'c')+mask(2),prefix+`if(c[14]<0.0){return;}if(blocked){input[t]=0.0;}${axis==='u'?'else if(i==0u){input[t]=c[14];}':''}`,L.counts[axis]);
 }
 return Object.freeze(s);
};
/* END S2 MODULES */
/* BEGIN S3 MODULES */
/* S3 experimental GPU MAC advection and viscosity kernels. */
const S3_WGSL=(L,maxGroupsPerDimension=65535)=>{
 const n=[L.nx,L.ny,L.nz],h=L.h,mi=L.min,ma=L.max,fs=['u','v','w'];
 const scalar=x=>Number(x).toString()+'f';
 const head=`const NX:u32=${n[0]}u;const NY:u32=${n[1]}u;const NZ:u32=${n[2]}u;
const LO=vec3<f32>(${mi.map(scalar).join(',')});const HI=vec3<f32>(${ma.map(scalar).join(',')});
const H=vec3<f32>(${h.map(scalar).join(',')});
fn cell(i:u32,j:u32,k:u32)->u32{return i+NX*(j+NY*k);}
`;
 const bind=(id,name,write=false,type='array<f32>')=>`@group(0) @binding(${id}) var<storage,${write?'read_write':'read'}> ${name}:${type};\n`;
 const dims={u:['NX+1u','NY','NZ'],v:['NX','NY+1u','NZ'],w:['NX','NY','NZ+1u']};
 const offs={u:['0.0','0.5','0.5'],v:['0.5','0.0','0.5'],w:['0.5','0.5','0.0']};
 const face=(f,p)=>{const a=fs.indexOf(f),l=p.slice(),r=p.slice();l[a]=`(${p[a]}-1u)`;
  const lower=`${p[a]}>0u && solid[cell(${l.join(',')})]!=0u`,upper=`${p[a]}<${n[a]}u && solid[cell(${r.join(',')})]!=0u`;
  return `(${lower})||(${upper})`;
 };
 const faceFunc=f=>`fn blocked_${f}(i:u32,j:u32,k:u32)->bool{return ${face(f,['i','j','k'])};}\n`;
 const samplers=fs.map(f=>{
  const [sx,sy,sz]=dims[f],offset=offs[f].join(','),idx=`i+(${sx})*(j+(${sy})*k)`,at=f==='u'?'if(i==0u){return prm[1];}':'';
  return faceFunc(f)+`fn fetch_${f}(i:u32,j:u32,k:u32)->f32{if(blocked_${f}(i,j,k)){return 0.0;}${at}return ${f}[${idx}];}
fn sample_${f}(p:vec3<f32>)->f32{let q=(clamp(p,LO,HI)-LO)/H-vec3<f32>(${offset});
let lo=vec3<i32>(floor(q));let w=q-vec3<f32>(lo);var total=0.0;
for(var z=0u;z<2u;z++){for(var y=0u;y<2u;y++){for(var x=0u;x<2u;x++){
let i=u32(clamp(lo.x+i32(x),0,i32(${sx})-1));let j=u32(clamp(lo.y+i32(y),0,i32(${sy})-1));let k=u32(clamp(lo.z+i32(z),0,i32(${sz})-1));
let weight=select(1.0-w.x,w.x,x==1u)*select(1.0-w.y,w.y,y==1u)*select(1.0-w.z,w.z,z==1u);
total+=weight*fetch_${f}(i,j,k);
}}}return total;}
`;
 }).join('');
 const steps={};
 for(const f of fs){
  const a=fs.indexOf(f),[sx,sy,sz]=dims[f],offset=offs[f].join(',');
  const coord=`let i=t%(${sx});let j=(t/(${sx}))%(${sy});let k=t/((${sx})*(${sy}));`;
  const idx=`i+(${sx})*(j+(${sy})*k)`;
  const sampleBindings=bind(0,'u')+bind(1,'v')+bind(2,'w')+bind(3,'solid',false,'array<u32>')+bind(4,'prm');
  steps['advect'+f]=head+AETHER_TILED_DISPATCH.wgsl(L.counts[f],64,maxGroupsPerDimension)+sampleBindings+bind(5,'out',true)+samplers+
    `fn vel(p:vec3<f32>)->vec3<f32>{return vec3<f32>(sample_u(p),sample_v(p),sample_w(p));}
@compute @workgroup_size(64) fn main(@builtin(workgroup_id) wid:vec3<u32>,@builtin(local_invocation_index) lid:u32){let t=linearInvocationIndex(wid,lid);if(t>=${L.counts[f]}u){return;}${coord}
out[t]=0.0;if(blocked_${f}(i,j,k)){return;}
let pos=LO+(vec3<f32>(f32(i),f32(j),f32(k))+vec3<f32>(${offset}))*H;
let v0=vel(pos);let mid=clamp(pos-0.5*prm[0]*v0,LO,HI);let v1=vel(mid);
let dep=clamp(pos-prm[0]*v1,LO,HI);out[t]=sample_${f}(dep);}
`;
  const arr=['i','j','k'];
  const sampleNeighbor=(direction,sign)=>{let q=arr.map(x=>`i32(${x})`);q[direction]=`i32(${arr[direction]})${sign>0?'+':'-'}1`;const checks=q.map((x,z)=>`${x}<0||${x}>=i32(${dims[f][z]})`).join('||');const qindex=q.map(x=>`u32(${x})`);const speed=direction===1&&sign<0&&a===0?
   `let xx=LO.x+f32(i)*H.x;let zz=LO.z+(f32(k)+0.5)*H.z;
    if(xx>=prm[5]&&xx<=prm[6]&&zz>=prm[7]&&zz<=prm[8]){wall=prm[4];}`:'';
   const boundary=direction===0&&sign>0?'return self;':direction===0&&sign<0&&a!==0?'return -self;':
     `var wall=0.0;${speed}return 2.0*wall-self;`;
   return `if(${checks}){${boundary}}if(blocked_${f}(${qindex.join(',')})){return ${direction===a?'0.0':'-self'};}
   return input[${qindex[0]}+(${sx})*(${qindex[1]}+(${sy})*${qindex[2]})];`;
  };
  const neigh=Array.from({length:3},(_,d)=>[-1,1].map(s=>`fn neighbor_${d}_${s<0?'m':'p'}(i:u32,j:u32,k:u32,self:f32)->f32{${sampleNeighbor(d,s)}}`).join('\n')).join('\n');
  const lap=Array.from({length:3},(_,d)=>`lap+=(neighbor_${d}_m(i,j,k,self)+neighbor_${d}_p(i,j,k,self)-2.0*self)/(H[${d}]*H[${d}]);`).join('');
  steps['viscous'+f]=head+AETHER_TILED_DISPATCH.wgsl(L.counts[f],64,maxGroupsPerDimension)+bind(0,'input')+bind(1,'solid',false,'array<u32>')+bind(2,'prm')+bind(3,'out',true)+faceFunc(f)+neigh+
  `@compute @workgroup_size(64) fn main(@builtin(workgroup_id) wid:vec3<u32>,@builtin(local_invocation_index) lid:u32){let t=linearInvocationIndex(wid,lid);if(t>=${L.counts[f]}u){return;}${coord}
  out[t]=0.0;if(blocked_${f}(i,j,k)){return;}
  ${f==='u'?'if(i==0u){out[t]=prm[2];return;}':''}
  ${f==='v'?'if(j==0u||j==NY){return;}':''}
  ${f==='w'?'if(k==0u||k==NZ){return;}':''}
  let self=input[${idx}];var lap=0.0;${lap}out[t]=self+prm[0]*prm[3]*lap;}
`;
 }
 return Object.freeze(steps);
};
const S3_CONTROL=(()=>{const module={exports:{}};
'use strict';

// S3 pre-step controls shared by the CPU oracle and the later GPU stepper.
// This module does not advance velocity or produce scientific fields.
module.exports = function createS3Control(L, inputMask) {
  const fields = ['u', 'v', 'w'];
  const names = ['SOLID', 'FLUID', 'INLET', 'OUTLET', 'WALL'];
  const T = Object.freeze({ SOLID: 0, FLUID: 1, INLET: 2, OUTLET: 3, WALL: 4 });
  if (!L || !Number.isInteger(L.nx) || !Number.isInteger(L.ny) || !Number.isInteger(L.nz) ||
      !Array.isArray(L.h) || L.h.length !== 3 || L.h.some(x => !Number.isFinite(x) || x <= 0) ||
      !L.counts || !L.dims) throw Error('INVALID_LAYOUT');
  const { nx, ny, nz } = L, cellCount = nx * ny * nz;
  if (Object.prototype.toString.call(inputMask) !== '[object Uint32Array]' ||
      inputMask.length !== cellCount || inputMask.some(x => x > 1)) throw Error('INVALID_MASK');
  const mask = new Uint32Array(inputMask);
  const cell = (i, j, k) => i + nx * (j + ny * k);
  const types = {};
  for (let axis = 0; axis < 3; axis++) {
    const f = fields[axis], dims = L.dims[f], a = new Uint8Array(L.counts[f]);
    for (let k = 0; k < dims[2]; k++) for (let j = 0; j < dims[1]; j++) for (let i = 0; i < dims[0]; i++) {
      const p = [i, j, k], left = p.slice(); left[axis]--;
      const inside = q => q[0] >= 0 && q[0] < nx && q[1] >= 0 && q[1] < ny && q[2] >= 0 && q[2] < nz;
      const li = inside(left) ? cell(...left) : -1, ri = inside(p) ? cell(...p) : -1;
      const idx = i + dims[0] * (j + dims[1] * k);
      if ((li >= 0 && mask[li]) || (ri >= 0 && mask[ri])) a[idx] = T.SOLID;
      else if (li >= 0 && ri >= 0) a[idx] = T.FLUID;
      else if (axis === 0 && li < 0) a[idx] = T.INLET;
      else if (axis === 0 && ri < 0) a[idx] = T.OUTLET;
      else a[idx] = T.WALL;
    }
    types[f] = a;
  }

  const finiteField = (a, n, name) => {
    if (!(a instanceof Float32Array || a instanceof Float64Array) || a.length !== n) throw Error('INVALID_FIELD:' + name);
    for (let i = 0; i < n; i++) if (!Number.isFinite(a[i]) || !Number.isFinite(Math.fround(a[i]))) throw Error('NONFINITE_FIELD:' + name);
  };
  const velocity = V => {
    if (!V || typeof V !== 'object') throw Error('INVALID_VELOCITY');
    for (const f of fields) finiteField(V[f], L.counts[f], f);
  };
  const ramp = (time, seconds) => {
    if (!Number.isFinite(time) || time < 0 || !Number.isFinite(seconds) || seconds <= 0) throw Error('INVALID_RAMP');
    const x = Math.max(0, Math.min(1, time / seconds));
    return x * x * (3 - 2 * x);
  };
  function enforce(V, options = {}) {
    velocity(V);
    const speed = options.targetInletSpeed ?? 0, time = options.simulationTime ?? 0, seconds = options.rampSeconds ?? 1;
    if (!Number.isFinite(speed) || speed < 0 || !Number.isFinite(Math.fround(speed)) || (speed > 0 && Math.fround(speed) === 0)) throw Error('INVALID_INLET_SPEED');
    const inlet = Math.fround(speed * ramp(time, seconds)), out = {};
    for (const f of fields) {
      const Type = V[f].constructor, a = out[f] = new Type(V[f]);
      for (let i = 0; i < a.length; i++) {
        if (types[f][i] === T.SOLID || types[f][i] === T.WALL) a[i] = 0;
        else if (types[f][i] === T.INLET) a[i] = inlet;
      }
    }
    return Object.freeze({ velocity: out, inletSpeed: inlet, ramp: ramp(time, seconds) });
  }
  // Reference stencil for a nonperiodic MAC grid. Values at a solid-normal
  // face are prescribed at the face itself; tangential velocities use the
  // reflected ghost 2*u_wall-u_fluid. No interpolation through a solid cell.
  function wallConfig(options) {
    const belt = options.groundBelt;
    if (belt === undefined) return null;
    if (!L.min || !L.max || !Array.isArray(belt.min) || !Array.isArray(belt.max) ||
        belt.min.length !== 2 || belt.max.length !== 2 ||
        ![...belt.min, ...belt.max, belt.groundSpeed].every(Number.isFinite) ||
        belt.groundSpeed < 0 || !Number.isFinite(Math.fround(belt.groundSpeed)) ||
        (belt.groundSpeed > 0 && Math.fround(belt.groundSpeed) === 0) ||
        belt.min.some((x, i) => x >= belt.max[i] || x < L.min[i === 0 ? 0 : 2]) ||
        belt.max.some((x, i) => x > L.max[i === 0 ? 0 : 2])) throw Error('INVALID_GROUND_BELT');
    return belt;
  }
  function neighborValue(V, field, index, direction, sign, options = {}) {
    velocity(V);
    const belt = wallConfig(options);
    if (!fields.includes(field) || !Number.isInteger(index) || index < 0 || index >= L.counts[field] ||
        !Number.isInteger(direction) || direction < 0 || direction > 2 || ![-1, 1].includes(sign) ||
        types[field][index] !== T.FLUID) throw Error('INVALID_FLUID_FACE');
    const speed = options.targetInletSpeed ?? 0;
    if (!Number.isFinite(speed) || speed < 0) throw Error('INVALID_INLET_SPEED');
    return rawNeighbor(V, field, index, direction, sign, belt,
      Math.fround(speed * ramp(options.simulationTime ?? 0, options.rampSeconds ?? 1)));
  }
  function rawNeighbor(V, field, index, direction, sign, belt, inlet) {
    const axis = fields.indexOf(field), dims = L.dims[field], p = L.coords(field, index), q = p.slice();
    q[direction] += sign;
    const current = V[field][index];
    if (q[direction] < 0 || q[direction] >= dims[direction]) {
      if (direction === 0 && sign === 1) return current; // outlet tangential zero gradient
      if (direction === 0 && sign === -1) return axis === 0 ? current : -current; // inlet transverse no slip
      let wallSpeed = 0;
      if (direction === 1 && sign === -1 && axis === 0 && belt) {
        const x = L.min[0] + p[0] * L.h[0], z = L.min[2] + (p[2] + .5) * L.h[2];
        if (x >= belt.min[0] && x <= belt.max[0] && z >= belt.min[1] && z <= belt.max[1]) wallSpeed = belt.groundSpeed;
      }
      return 2 * wallSpeed - current;
    }
    const face = q[0] + dims[0] * (q[1] + dims[1] * q[2]), kind = types[field][face];
    if (kind === T.SOLID) return direction === axis ? 0 : -current;
    if (kind === T.WALL) return direction === axis ? 0 : -current;
    if (kind === T.INLET) return direction === axis ? inlet : -current;
    return V[field][face];
  }
  function viscous(V, dt, options = {}) {
    velocity(V);
    const belt = wallConfig(options), nu = options.viscosity ?? 1.5e-5;
    if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(Math.fround(dt)) || Math.fround(dt) === 0 ||
        !Number.isFinite(nu) || nu < 0 || !Number.isFinite(Math.fround(nu)) ||
        (nu > 0 && Math.fround(nu) === 0)) throw Error('INVALID_VISCOSITY_INPUT');
    const rate = nu * L.h.reduce((s, h) => s + 1 / (h * h), 0);
    if (!Number.isFinite(rate) || dt * rate > .45 * (1 + 1e-12)) throw Error('DIFFUSION_CFL_EXCEEDED');
    const bc = enforce(V, options), input = bc.velocity, out = {};
    for (const f of fields) {
      const a = out[f] = new Float32Array(L.counts[f]);
      for (let i = 0; i < a.length; i++) {
        if (types[f][i] !== T.FLUID && types[f][i] !== T.OUTLET) { a[i] = input[f][i]; continue; }
        let lap = 0;
        for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
          lap += (rawNeighbor(input, f, i, axis, sign, belt, bc.inletSpeed) - input[f][i]) / (L.h[axis] * L.h[axis]);
        }
        a[i] = Math.fround(input[f][i] + dt * nu * lap);
        if (!Number.isFinite(a[i])) throw Error('NONFINITE_VISCOSITY');
      }
    }
    return enforce(out, options).velocity;
  }
  function nextDownF32(x) {
    let y = Math.fround(x);
    if (!Number.isFinite(y) || y <= 0) throw Error('CFL_DT_UNREPRESENTABLE');
    if (y > x) {
      const b = new ArrayBuffer(4), d = new DataView(b);
      d.setFloat32(0, y, false);
      d.setUint32(0, d.getUint32(0, false) - 1, false);
      y = d.getFloat32(0, false);
    }
    if (!(y > 0) || y > x) throw Error('CFL_DT_UNREPRESENTABLE');
    return y;
  }
  function timestep(V, options = {}) {
    velocity(V);
    const nu = options.viscosity ?? 1.5e-5, maxDt = options.maxDt ?? 1 / 120;
    const cfl = options.cfl ?? 0.5, diffusionCfl = options.diffusionCfl ?? 0.45;
    const speed = options.targetInletSpeed ?? 0, time = options.simulationTime ?? 0, seconds = options.rampSeconds ?? 1;
    if (!Number.isFinite(nu) || nu < 0 || !Number.isFinite(Math.fround(nu)) || (nu > 0 && Math.fround(nu) === 0) ||
        !Number.isFinite(maxDt) || maxDt <= 0 || !Number.isFinite(Math.fround(maxDt)) || Math.fround(maxDt) === 0 ||
        !Number.isFinite(cfl) || cfl <= 0 || cfl > 1 ||
        !Number.isFinite(diffusionCfl) || diffusionCfl <= 0 || diffusionCfl > 0.5 ||
        !Number.isFinite(speed) || speed < 0 || !Number.isFinite(Math.fround(speed)) || (speed > 0 && Math.fround(speed) === 0)) throw Error('INVALID_CFL_CONFIG');
    const maxima = [0, 0, 0], inlet = Math.fround(speed * ramp(time, seconds));
    for (let axis = 0; axis < 3; axis++) {
      const f = fields[axis], a = V[f], t = types[f];
      for (let i = 0; i < a.length; i++) {
        if (t[i] === T.SOLID || t[i] === T.WALL) continue;
        const value = t[i] === T.INLET ? inlet : Math.abs(Math.fround(a[i]));
        maxima[axis] = Math.max(maxima[axis], value);
      }
    }
    const advectiveRate = maxima.reduce((s, v, a) => s + v / L.h[a], 0);
    const viscousRate = nu * L.h.reduce((s, h) => s + 1 / (h * h), 0);
    if (!Number.isFinite(advectiveRate) || !Number.isFinite(viscousRate)) throw Error('CFL_RATE_NONFINITE');
    const advectiveLimit = advectiveRate > 0 ? cfl / advectiveRate : Infinity;
    const viscousLimit = viscousRate > 0 ? diffusionCfl / viscousRate : Infinity;
    const selected = Math.min(maxDt, advectiveLimit, viscousLimit);
    const dt = nextDownF32(selected);
    const now32 = Math.fround(options.simulationTime ?? 0), next32 = Math.fround(now32 + dt);
    if (!(next32 > now32)) throw Error('CFL_DT_NO_F32_PROGRESS');
    return Object.freeze({ dt, advectiveRate, viscousRate, advectiveLimit, viscousLimit, maxDt,
      maxima:Object.freeze(maxima), inletSpeed:inlet, simulationTimeF32:now32, nextSimulationTimeF32:next32,
      constraint: selected === maxDt ? 'MAX_STEP' : selected === advectiveLimit ? 'ADVECTION_CFL' : 'VISCOSITY_CFL' });
  }
  function inspectBackflow(V, options = {}) {
    velocity(V);
    const speed = options.targetInletSpeed ?? 0, thresholdFraction = options.thresholdFraction ?? 0.01;
    const maxAreaFraction = options.maxAreaFraction ?? 0.01, requiredSteps = options.requiredSteps ?? 5;
    const prior = options.priorConsecutive ?? 0;
    if (!Number.isFinite(speed) || speed < 0 || !Number.isFinite(thresholdFraction) || thresholdFraction < 0 ||
        !Number.isFinite(maxAreaFraction) || maxAreaFraction < 0 || maxAreaFraction > 1 ||
        !Number.isInteger(requiredSteps) || requiredSteps < 1 || !Number.isInteger(prior) || prior < 0) throw Error('INVALID_BACKFLOW_CONFIG');
    const a = V.u, t = types.u, cutoff = -thresholdFraction * Math.max(speed, 0.1);
    let area = 0, reverseArea = 0, reverseFlux = 0;
    const faceArea = L.h[1] * L.h[2];
    for (let i = 0; i < a.length; i++) if (t[i] === T.OUTLET) {
      area += faceArea;
      if (a[i] < cutoff) { reverseArea += faceArea; reverseFlux += -a[i] * faceArea; }
    }
    if (!(area > 0)) throw Error('NO_OPEN_OUTLET');
    const fraction = reverseArea / area, exceeding = fraction > maxAreaFraction;
    const consecutive = exceeding ? prior + 1 : 0;
    return Object.freeze({ cutoff, outletArea:area, reverseArea, reverseFlux, reverseAreaFraction:fraction,
      consecutive, requiredSteps, tripped:consecutive >= requiredSteps });
  }
  function getFaceType(field, index) {
    if (!fields.includes(field) || !Number.isInteger(index) || index < 0 || index >= types[field].length) throw Error('INVALID_FACE');
    return names[types[field][index]];
  }
  const counts = Object.freeze(Object.fromEntries(fields.map(f => [f, Object.freeze({
    solid:Array.from(types[f]).filter(x => x === T.SOLID).length,
    fluid:Array.from(types[f]).filter(x => x === T.FLUID).length,
    inlet:Array.from(types[f]).filter(x => x === T.INLET).length,
    outlet:Array.from(types[f]).filter(x => x === T.OUTLET).length,
    wall:Array.from(types[f]).filter(x => x === T.WALL).length
  })])));
  return Object.freeze({ enforce, timestep, inspectBackflow, getFaceType, neighborValue, viscous, counts,
    snapshot:() => Object.freeze({ grid:Object.freeze([nx, ny, nz]), cellCount, counts }) });
};

return module.exports;})();
/* END S3 MODULES */
/* S0 SOLVER: WebGPU capability/preflight shell only. No compute, fields, or renderer ownership. */
const S0_SOLVER=(()=>{
  const TIERS=[64,128,256], BYTES=4, WORKGROUP=4;
  let state='UNINITIALIZED', reason=null, resolution=64, generation=0, ownedDevice=null, initFlight=null, listener=null;
  const clone=v=>JSON.parse(JSON.stringify(v));
  const result=(ok,code,extra={})=>Object.assign({ok,code},extra);
  const configOf=input=>input===undefined?{resolution:64}:input;
  function validConfig(input){
    const c=configOf(input);
    if(!c||typeof c!=='object'||Array.isArray(c)||Object.keys(c).some(k=>k!=='resolution'))return result(false,'INVALID_CONFIG');
    if(!Number.isInteger(c.resolution))return result(false,'INVALID_CONFIG');
    if(!TIERS.includes(c.resolution))return result(false,'INVALID_CONFIG');
    if(c.resolution!==64)return result(false,'TIER_NOT_VALIDATED');
    return result(true,'OK',{resolution:c.resolution});
  }
  function plan(n){
    const C=n**3,F=3*n*n*(n+1), scalar=(name,storage=true)=>({name,bytes:C*BYTES,storage});
    const buffers=[];
    for(const bank of ['committed','advected','candidate'])for(const axis of ['u','v','w'])buffers.push({name:bank+'_'+axis,bytes:(F/3)*BYTES,storage:true});
    for(const name of ['pressureAccepted','pressureWorking','rhs','r','z','d','Ad','diag'])buffers.push(scalar(name,true));
    buffers.push(scalar('mask',true));
    for(const name of ['exportPressure','exportU','exportV','exportW','exportVorticity'])buffers.push(scalar(name,true));
    for(const name of ['stagingPressure','stagingU','stagingV','stagingW','stagingVorticity'])buffers.push(scalar(name,false));
    return {resolution:n,cells:C,faces:F,gpuBytes:12*F+76*C,cpuSnapshotBytes:40*C,bufferPlan:buffers,memoryPlan:{gpuBytes:12*F+76*C,cpuSnapshotBytes:40*C,estimated:true,excluded:['geometry','reductions','alignment padding','driver','render memory']}};
  }
  function limitsOf(source){const l=source&&source.limits;if(!l||typeof l!=='object')return null;const names=['maxBufferSize','maxStorageBufferBindingSize','maxComputeWorkgroupSizeX','maxComputeWorkgroupSizeY','maxComputeWorkgroupSizeZ','maxComputeInvocationsPerWorkgroup','maxComputeWorkgroupsPerDimension','maxStorageBuffersPerShaderStage'];const out={};for(const k of names){const v=l[k];if(typeof v!=='number'||!Number.isFinite(v)||v<=0||!Number.isInteger(v))return null;out[k]=v}return out}
  function checkLimits(adapter,device,n){
    const a=limitsOf(adapter),d=limitsOf(device);if(!a||!d)return result(false,'LIMITS_UNAVAILABLE');const p=plan(n),all=p.bufferPlan,checks=[];
    for(const b of all){for(const [label,l] of [['adapter',a],['device',d]])if(b.bytes>l.maxBufferSize)checks.push(label+'.maxBufferSize:'+b.name);if(b.storage)for(const [label,l] of [['adapter',a],['device',d]])if(b.bytes>l.maxStorageBufferBindingSize)checks.push(label+'.maxStorageBufferBindingSize:'+b.name)}
    for(const l of [a,d]){if(l.maxComputeWorkgroupSizeX<WORKGROUP||l.maxComputeWorkgroupSizeY<WORKGROUP||l.maxComputeWorkgroupSizeZ<WORKGROUP||l.maxComputeInvocationsPerWorkgroup<64||l.maxComputeWorkgroupsPerDimension<Math.ceil(n/WORKGROUP)||l.maxStorageBuffersPerShaderStage<8)checks.push('compute-limits')}
    return checks.length?result(false,'LIMITS_INSUFFICIENT',{details:checks}):result(true,'OK',{plan:p});
  }
  function statusText(){return state==='READY'?'CFD: DEVICE_READY_ONLY':state==='UNAVAILABLE'?'CFD: UNAVAILABLE '+(reason||'UNKNOWN'):state==='FAILED'?'CFD: FAILED '+(reason||'UNKNOWN'):'CFD: '+state}
  function renderState(){s2Refresh();s3Refresh();const el=typeof document!=='undefined'&&document.getElementById('s0Status');if(el)el.textContent=statusText();if(typeof renderDiagnostics==='function'&&diagnostics.bootStage!=='BOOT')renderDiagnostics()}
  function snapshot(){const p=plan(resolution),tiers=TIERS.map(n=>{const q=plan(n);return {resolution:n,gpuBytes:q.gpuBytes,cpuSnapshotBytes:q.cpuSnapshotBytes,cells:q.cells,faces:q.faces}});return clone({state,reason,resolution,generation,memoryPlan:Object.assign({},p.memoryPlan,{tiers}),bufferPlan:p.bufferPlan,physicsReady:false,runtimeVerified:false,allocatedBytes:0,deviceReady:state==='READY',diagnostic:reason});}
  function clearDevice(device){if(device&&typeof device.destroy==='function')try{device.destroy()}catch(e){} }
  function cleanupDevice(){s3Invalidate();if(listener&&ownedDevice?.removeEventListener)try{ownedDevice.removeEventListener('uncapturederror',listener)}catch(e){}listener=null;ownedDevice=null;AETHER.CURRENT_AUTHORITIES.gpuDevice=null}
  function attach(device,g){ownedDevice=device;listener=e=>{if(g!==generation||device!==ownedDevice)return;reason='UNCAUGHT_GPU_ERROR';state='FAILED';clearDevice(device);cleanupDevice();renderState()};if(device.addEventListener)device.addEventListener('uncapturederror',listener);if(device.lost&&typeof device.lost.then==='function')device.lost.then(info=>{if(g!==generation||device!==ownedDevice)return;reason='DEVICE_LOST';state='FAILED';cleanupDevice();renderState()}).catch(()=>{});AETHER.CURRENT_AUTHORITIES.gpuDevice='AETHER.SOLVER_OWNED_DEVICE'}
  function initialize(input){const v=validConfig(input);if(!v.ok)return Promise.resolve(v);if(state==='DISPOSED'){state='UNINITIALIZED';reason=null}if(initFlight&&initFlight.resolution===v.resolution)return initFlight.promise;if(state==='READY'&&resolution===v.resolution)return Promise.resolve(result(true,'READY',{snapshot:snapshot()}));resolution=v.resolution;const g=++generation;state='INITIALIZING';reason=null;renderState();let promise;promise=Promise.resolve().then(async()=>{let adapter=null,device=null;try{if(typeof isSecureContext==='undefined'||isSecureContext!==true)throw Object.assign(Error('SECURE_CONTEXT_REQUIRED'),{code:'SECURE_CONTEXT_REQUIRED'});if(typeof navigator==='undefined'||!navigator.gpu||typeof navigator.gpu.requestAdapter!=='function')throw Object.assign(Error('WEBGPU_UNAVAILABLE'),{code:'WEBGPU_UNAVAILABLE'});adapter=await navigator.gpu.requestAdapter().catch(()=>{throw Object.assign(Error('ADAPTER_REQUEST_FAILED'),{code:'ADAPTER_REQUEST_FAILED'})});if(g!==generation) return result(false,'STALE_INITIALIZATION');if(!adapter)throw Object.assign(Error('ADAPTER_UNAVAILABLE'),{code:'ADAPTER_UNAVAILABLE'});device=await adapter.requestDevice().catch(()=>{throw Object.assign(Error('DEVICE_REQUEST_FAILED'),{code:'DEVICE_REQUEST_FAILED'})});if(g!==generation){clearDevice(device);return result(false,'STALE_INITIALIZATION')}if(!device)throw Object.assign(Error('DEVICE_UNAVAILABLE'),{code:'DEVICE_UNAVAILABLE'});const lim=checkLimits(adapter,device,resolution);if(!lim.ok){clearDevice(device);if(g===generation){state='UNAVAILABLE';reason=lim.code;renderState()}return lim}attach(device,g);await Promise.resolve();if(g!==generation)return result(false,'STALE_INITIALIZATION');if(state==='FAILED')return result(false,reason||'DEVICE_LOST',{snapshot:snapshot()});state='READY';reason='DEVICE_READY_ONLY';renderState();return result(true,'READY',{snapshot:snapshot()})}catch(e){if(device&&g!==generation)clearDevice(device);if(g!==generation)return result(false,'STALE_INITIALIZATION');if(device)clearDevice(device);cleanupDevice();reason=e.code||'WEBGPU_UNAVAILABLE';state=['SECURE_CONTEXT_REQUIRED','WEBGPU_UNAVAILABLE','ADAPTER_UNAVAILABLE','DEVICE_UNAVAILABLE','LIMITS_INSUFFICIENT','LIMITS_UNAVAILABLE'].includes(reason)?'UNAVAILABLE':'FAILED';renderState();return result(false,reason,{snapshot:snapshot()})}finally{if(initFlight?.promise===promise)initFlight=null}});initFlight={resolution:v.resolution,promise};return promise}
  function pause(){return result(false,'NO_COMPUTE_ACTIVE',{snapshot:snapshot()})}
  function blocked(){return result(false,'COMPUTE_NOT_IMPLEMENTED',{snapshot:snapshot()})}
  function reset(){if(AETHER.M14?.getSnapshot?.()?.control?.emergencyStopped){setStatus('E-STOP 래치 중 · 기존 진단 결과를 보존합니다');return false;}generation++;if(initFlight)initFlight=null;clearDevice(ownedDevice);cleanupDevice();state='UNINITIALIZED';reason=null;renderState();return result(true,'UNINITIALIZED',{snapshot:snapshot()})}
  function setNumerics(c){if(!c||typeof c!=='object'||Array.isArray(c))return result(false,'INVALID_CONFIG');const keys=Object.keys(c);if(keys.some(k=>!['resolution','density','viscosity','residualTolerance','maxIterations'].includes(k)))return result(false,'INVALID_CONFIG');if('resolution' in c&&(!Number.isInteger(c.resolution)||c.resolution!==resolution))return result(false,'INITIALIZATION_REQUIRED');if(keys.some(k=>k!=='resolution'))return result(false,'COMPUTE_NOT_IMPLEMENTED');return result(true,'OK',{snapshot:snapshot()})}
  function setBoundaryConditions(){return result(false,'COMPUTE_NOT_IMPLEMENTED',{snapshot:snapshot()})}
  function dispose(){if(state==='DISPOSED')return result(true,'DISPOSED',{snapshot:snapshot()});generation++;if(initFlight)initFlight=null;clearDevice(ownedDevice);cleanupDevice();state='DISPOSED';reason='DISPOSED';renderState();return result(true,'DISPOSED',{snapshot:snapshot()})}

/* BEGIN S1 API — embedded inside the S0 device-owner closure. */
let s1Busy=false,s1Last=null,s1Peak=0,s1Active=null;
function s1Snapshot(){
 const valid=s1Last?.generation===generation&&state==='READY';
 return JSON.parse(JSON.stringify({stage:'S1',implementationReady:true,physicsReady:false,verificationScope:'SMALL_EMPTY_DOMAIN_ONLY',runtimeVerified:!!(valid&&s1Last.ok),status:s1Busy?'BUSY':state!=='READY'?'DEVICE_NOT_READY':valid?s1Last.code:'NOT_VERIFIED',lastReport:valid?s1Last:null,allocatedBytes:s1Active?s1Active.getStats().allocatedBytes:s1Busy?null:0,allocatedPeakBytes:s1Peak}));
}
function s1Refresh(){
 const text=document.getElementById('s1Status'),button=document.getElementById('s1Verify');
 if(text)text.textContent='S1: '+s1Snapshot().status+' · numerical test only';
 if(button)button.disabled=s1Busy;
}
async function s1Verify(){
 if(s1Busy||(typeof s2Busy!=='undefined'&&s2Busy))return {ok:false,code:'BUSY'};
 if(state!=='READY'||!ownedDevice){s1Refresh();return {ok:false,code:'DEVICE_NOT_READY'};}
 const g=generation,device=ownedDevice,isCurrent=()=>g===generation&&device===ownedDevice&&state==='READY';
 s1Busy=true;s1Refresh();let workspace=null,report;
 try{
  const bounds=AETHER.CFD_DOMAIN.bounds;
  const L=S1_REFERENCE.layout({nx:8,ny:6,nz:4,min:Array.from(bounds.min),max:Array.from(bounds.max)});
  workspace=await S1_GPU.create(device,L,{isCurrent});s1Active=workspace;
  if(!isCurrent())throw Error('STALE');
  s1Peak=workspace.getStats().allocatedPeakBytes;
  const p=Float64Array.from({length:L.counts.p},(_,t)=>{const [i,j,k]=L.coords('p',t);return .1*Math.cos((i+.5)*Math.PI/(2*L.nx))+.01*Math.cos(j*.7)*Math.sin(k*.8);});
  const rhs=S1_REFERENCE.applyA(L,p),V=S1_REFERENCE.gradient(L,p),options={rho:1,dt:1,tolerance:1e-6};
  const solved=await workspace.solve(rhs,options);
  if(!isCurrent())throw Error('STALE');if(!solved.ok)throw Error(solved.code);
  let error=0,norm=0;for(let i=0;i<p.length;i++){error+=(solved.pressure[i]-p[i])**2;norm+=p[i]**2;}
  const pressureRelativeError=Math.sqrt(error/norm),projection=await workspace.project(V,options);
  if(!isCurrent())throw Error('STALE');if(!projection.ok)throw Error(projection.code);
  const metrics=S1_REFERENCE.metrics(L,projection.velocity);
  const ok=pressureRelativeError<=1e-3&&solved.residualRms<=solved.thresholdRms&&metrics.divergenceRms*4.7<=1e-4&&metrics.divergenceMax*4.7<=1e-2&&Math.abs(metrics.netFlux)<=1e-6;
  report={ok,code:ok?'PASS':'NUMERICAL_GATE_FAILED',generation:g,backend:'WEBGPU',scope:'EMPTY_DOMAIN_MANUFACTURED_TEST',grid:[8,6,4],pressureRelativeError,residualRms:solved.residualRms,thresholdRms:solved.thresholdRms,iterations:solved.iterations,projection:metrics,allocatedPeakBytes:s1Peak,physicsReady:false};
 }catch(e){report={ok:false,code:isCurrent()?'VERIFY_FAILED':'STALE',message:e.message,generation:g,physicsReady:false};}
 finally{if(workspace){workspace.dispose();if(report)report.allocatedBytesAfter=workspace.getStats().allocatedBytes;}s1Active=null;s1Busy=false;}
 if(isCurrent())s1Last=report;
 s1Refresh();return report;
}
AETHER.S1=Object.freeze({verify:s1Verify,getSnapshot:s1Snapshot});
document.getElementById('s1Verify')?.addEventListener('click',event=>{event.stopPropagation();void s1Verify();});
/* END S1 API */
/* BEGIN S2 immutable CFD-only proxy asset. Render mesh remains unchanged. */
const S2_CFD_PROXY_ASSET=Object.freeze({format:'BMW_PROXY_NOT_BUILT',sourceGeometryFingerprint:'INVALIDATED_ON_BMW_REPLACEMENT',sourceTriangles:-1,surface:Object.freeze({})});
const S2_PROXY_VOXEL=(()=>{
 const decoded=new WeakMap();
 function bytesFor(asset){
  if(!asset||asset.format!=='AETHER_S2_VOXEL_PROXY_V1')throw Error('PROXY_FORMAT_MISMATCH');
  let bytes=decoded.get(asset);
  if(!bytes){
   if(asset.bytes&&ArrayBuffer.isView(asset.bytes))bytes=new Uint8Array(asset.bytes.buffer,asset.bytes.byteOffset,asset.bytes.byteLength);
   else if(typeof asset.base64==='string'){
    if(typeof atob!=='function')throw Error('BASE64_UNAVAILABLE');
    const raw=atob(asset.base64);bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
   }else throw Error('PROXY_BYTES_MISSING');
   if(bytes.length!==asset.byteLength)throw Error('PROXY_BYTE_LENGTH_MISMATCH');
   let hash=0x811c9dc5;for(let i=0;i<bytes.length;i++)hash=Math.imul(hash^bytes[i],0x01000193)>>>0;
   if(hash.toString(16).padStart(8,'0')!==asset.checksumFNV1a32)throw Error('PROXY_CHECKSUM_MISMATCH');
   decoded.set(asset,bytes);
  }
  return bytes;
 }
 function voxelize(asset,n,bounds,transform){
  if(!Number.isInteger(n)||n<8||n>128)throw Error('INVALID_INPUT');
  if(!bounds||!Array.isArray(bounds.min)||!Array.isArray(bounds.max)||bounds.min.length!==3||bounds.max.length!==3||![...bounds.min,...bounds.max].every(Number.isFinite)||bounds.min.some((v,a)=>v>=bounds.max[a]))throw Error('INVALID_DOMAIN');
  if(!transform||typeof transform.worldToLocal!=='function')throw Error('INVALID_TRANSFORM_AUTHORITY');
  const {origin,spacing,dimensions}=asset;
  if(!Array.isArray(origin)||!Array.isArray(spacing)||!Array.isArray(dimensions)||origin.length!==3||spacing.length!==3||dimensions.length!==3||![...origin,...spacing].every(Number.isFinite)||!dimensions.every(x=>Number.isInteger(x)&&x>0))throw Error('INVALID_PROXY_METADATA');
  const bytes=bytesFor(asset),[nx,ny,nz]=dimensions;
  if(bytes.length!==nx*ny*nz||asset.sourceGridResolution!==384||asset.solidCells!==487067)throw Error('PROXY_GEOMETRY_CONTRACT_MISMATCH');
  const pos=transform.position,rot=transform.rotation,scale=transform.scale;
  const identity=Array.isArray(pos)&&Array.isArray(rot)&&Array.isArray(scale)&&pos.every(x=>Math.abs(x)<1e-12)&&rot.every(x=>Math.abs(x)<1e-12)&&scale.every(x=>Math.abs(x-1)<1e-12);
  const h=bounds.max.map((v,a)=>(v-bounds.min[a])/n),total=n*n*n,classification=new Uint8Array(total),solid=new Uint32Array(total),idx=(x,y,z)=>x+n*(y+n*z);let offsets=[1/6,.5,5/6];
  if(identity&&asset.sourceGridResolution%n===0){const ratio=asset.sourceGridResolution/n;offsets=[0,1,2].map(k=>(Math.floor((k+.5)*ratio/3)+.5)/ratio);}
  let solidCells=0,outsideSamples=0;
  for(let z=0;z<n;z++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){
   let occupied=0;
   for(const oz of offsets)for(const oy of offsets)for(const ox of offsets){
    const wx=bounds.min[0]+(x+ox)*h[0],wy=bounds.min[1]+(y+oy)*h[1],wz=bounds.min[2]+(z+oz)*h[2],p=identity?null:transform.worldToLocal([wx,wy,wz]);
    const i=Math.floor(((p?p[0]:wx)-origin[0])/spacing[0]),j=Math.floor(((p?p[1]:wy)-origin[1])/spacing[1]),k=Math.floor(((p?p[2]:wz)-origin[2])/spacing[2]);
    if(i<0||j<0||k<0||i>=nx||j>=ny||k>=nz){outsideSamples++;continue;}
    occupied+=bytes[i+nx*(j+ny*k)];
   }
   const id=idx(x,y,z),isSolid=occupied>=15;classification[id]=isSolid?1:2;solid[id]=isSolid?1:0;if(isSolid)solidCells++;
  }
  const cellVolume=h[0]*h[1]*h[2];
  return{solid,classification,report:{resolution:n,bounds:{min:bounds.min.slice(),max:bounds.max.slice()},spacing:h,triangles:asset.sourceTriangles,solidVoxels:solidCells,fluidVoxels:total-solidCells,solidVolume:solidCells*cellVolume,sealingApplied:false,proxyApplied:true,physicsReady:false,proxy:{format:asset.format,sourceGridResolution:asset.sourceGridResolution,assetSha256:asset.sha256,checksumFNV1a32:asset.checksumFNV1a32,sourceHtmlSha256:asset.sourceHtmlSha256,assetDimensions:dimensions.slice(),assetSpacing:spacing.slice(),assetOrigin:origin.slice(),closedManifold:asset.surface.closedManifold,boundaryEdges:asset.surface.boundaryEdges,nonManifoldEdges:asset.surface.nonManifoldEdges,sourceToProxyP95m:asset.surface.sourceToProxyP95m,proxyToSourceP95m:asset.surface.proxyToSourceP95m,resampling:'3x3x3 cell samples; >=15/27 solid',worldToLocal:identity?'identity fast path':'VehicleTransform.worldToLocal'},solidCells,fluidCells:total-solidCells,assetBytes:bytes.length}};
 }
 return voxelize;
})();
/* END S2 immutable CFD-only proxy asset. */
/* BEGIN S2 API — diagnostic only; no transient production field is published. */
let s2Busy=false,s2Epoch=0,s2Last=null,s2Active=null;
const S2_SELF_INTERSECTION_AUDIT=Object.freeze({status:'NOT_REASSESSED_BMW',selfIntersectionFree:false,closed:false,physicsReady:false,parts:[]});
const S2_SELF_INTERSECTION_FINGERPRINT=S2_CFD_PROXY_ASSET.sourceGeometryFingerprint;
const s2GeometryFingerprint=parts=>{let h=2166136261;const feed=value=>{const s=String(value);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}h^=255;h=Math.imul(h,16777619);};for(const part of parts){feed(part.name);feed(part.positions.length);for(const v of part.positions)feed(v);feed(part.indices.length);for(const i of part.indices)feed(i);}return 'fnv1a32:'+(h>>>0).toString(16).padStart(8,'0');};
const s2SceneStamp=()=>JSON.stringify({runtime:runtimeGeneration,bounds:AETHER.CFD_DOMAIN.bounds,matrices:AETHER.CFD_BRIDGE.getSolidParts().map(p=>Array.from(p.modelMatrix))});
function s2DomainAudit(parts,bounds){
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity],min=bounds.min,max=bounds.max;let outsideVertices=0,vertices=0;
 for(const part of parts){const p=part.positions,M=part.modelMatrix;if(!p||p.length%3||!M||M.length!==16)throw Error('INVALID_GEOMETRY');for(let i=0;i<p.length;i+=3){const q=[M[0]*p[i]+M[4]*p[i+1]+M[8]*p[i+2]+M[12],M[1]*p[i]+M[5]*p[i+1]+M[9]*p[i+2]+M[13],M[2]*p[i]+M[6]*p[i+1]+M[10]*p[i+2]+M[14]];if(!q.every(Number.isFinite))throw Error('NONFINITE_GEOMETRY');vertices++;for(let a=0;a<3;a++){lo[a]=Math.min(lo[a],q[a]);hi[a]=Math.max(hi[a],q[a]);if(q[a]<min[a]-1e-6||q[a]>max[a]+1e-6)outsideVertices++;}}}
 return{withinDomain:outsideVertices===0,outsideVertices,vertices,bounds:{min:lo,max:hi},domain:{min:min.slice(),max:max.slice()},toleranceMetres:1e-6};
}
function s2Snapshot(){
 const valid=s2Last&&s2Last.epoch===s2Epoch&&s2Last.generation===generation&&s2Last.sceneStamp===s2SceneStamp()&&(!s2Last.numerics||state==='READY');
 return JSON.parse(JSON.stringify({stage:'S2',stagePassed:!!(valid&&s2Last.stagePassed),physicsReady:false,geometryApproved:!!(valid&&s2Last.geometryApproved),status:s2Busy?'BUSY':valid?s2Last.code:'NOT_VERIFIED',numericalPassed:!!(valid&&s2Last.numericalPassed),lastReport:valid?s2Last:null,allocatedBytes:s2Active?s2Active.getStats().allocatedBytes:0}));
}
function s2Refresh(){const snap=s2Snapshot(),el=document.getElementById('s2Status');if(el)el.textContent='S2: '+snap.status+' · '+(snap.geometryApproved?'CFD proxy admitted':'geometry not admitted')+' · transient CFD unavailable';const report=document.getElementById('s2Report');if(report)report.textContent=snap.lastReport?JSON.stringify(snap.lastReport,null,2):'S2 검사 결과가 없습니다.';for(const id of ['s2Inspect','s2Verify']){const button=document.getElementById(id);if(button)button.disabled=s2Busy;}}
function s2Invalidate(){s2Epoch++;s2Last=null;if(s2Active)s2Active.dispose();s2Refresh();}
async function s2Run(numerical){
 if(s2Busy||s1Busy)return{ok:false,code:'BUSY'};
 if(diagnostics.bootStage!=='READY')return{ok:false,code:'SCENE_NOT_READY'};
 if(numerical&&(state!=='READY'||!ownedDevice))return{ok:false,code:'DEVICE_NOT_READY'};
 const epoch=s2Epoch,g=generation,sceneStamp=s2SceneStamp(),device=ownedDevice;
 const isCurrent=()=>epoch===s2Epoch&&g===generation&&sceneStamp===s2SceneStamp()&&(!numerical||(state==='READY'&&device===ownedDevice));
 s2Busy=true;s2Refresh();let report,workspace;
 try{
  await new Promise(resolve=>setTimeout(resolve,0));if(!isCurrent())throw Error('STALE');
  const bounds=AETHER.CFD_DOMAIN.bounds,parts=AETHER.CFD_BRIDGE.getSolidParts(),mesh=S2_TOPOLOGY(parts);mesh.boundaryComponentAudit=S2_BOUNDARY_COMPONENTS(parts);
  const sourceGeometryFingerprint=s2GeometryFingerprint(parts);if(sourceGeometryFingerprint!==S2_CFD_PROXY_ASSET.sourceGeometryFingerprint)throw Error('PROXY_SOURCE_MISMATCH');
  const domainAudit=s2DomainAudit(parts,bounds);if(!domainAudit.withinDomain)throw Error('GEOMETRY_OUTSIDE_DOMAIN');
  const sourceTriangles=parts.reduce((n,p)=>n+p.indices.length/3,0);if(sourceTriangles!==S2_CFD_PROXY_ASSET.sourceTriangles)throw Error('PROXY_TRIANGLE_COUNT_MISMATCH');
  const voxel=S2_PROXY_VOXEL(S2_CFD_PROXY_ASSET,64,{min:Array.from(bounds.min),max:Array.from(bounds.max)},AETHER.VEHICLE_TRANSFORM);
  const R=S2_REFERENCE.create(S1_REFERENCE.layout({nx:64,ny:64,nz:64,min:Array.from(bounds.min),max:Array.from(bounds.max)}),voxel.solid);
  const intersectionAuditMatches=sourceGeometryFingerprint===S2_SELF_INTERSECTION_FINGERPRINT;
  mesh.intersectionCheck=intersectionAuditMatches?'PRECOMPUTED_SOURCE_ASSET_AUDIT':'SOURCE_MISMATCH';
  const proxyAudit=voxel.report.proxy,geometryApproved=intersectionAuditMatches&&domainAudit.withinDomain&&proxyAudit.closedManifold===true&&proxyAudit.boundaryEdges===0&&proxyAudit.nonManifoldEdges===0&&voxel.report.solidCells>0&&R.fluidCount===voxel.report.fluidCells;
  if(!geometryApproved)throw Error('PROXY_ADMISSION_FAILED');
  report={ok:true,code:'MASK_READY_PROXY_ADMITTED',stagePassed:false,numericalPassed:false,epoch,generation:g,sceneStamp,geometryApproved:true,physicsReady:false,proxy:{sourceGeometryFingerprint,sourceTriangles,sourceDomain:domainAudit,sourceRenderMeshAdmitted:false,sourceRenderMeshTopology:mesh.parts.map(p=>({name:p.name,closed:p.closed,boundaryEdges:p.boundaryEdges,nonManifoldEdges:p.nonManifoldEdges,orientationErrors:p.orientationErrors})),offlineSurfaceAudit:{closedManifold:proxyAudit.closedManifold,boundaryEdges:proxyAudit.boundaryEdges,nonManifoldEdges:proxyAudit.nonManifoldEdges,sourceToProxyP95m:proxyAudit.sourceToProxyP95m,sourceToProxyMaxm:S2_CFD_PROXY_ASSET.surface.sourceToProxyMaxm,proxyToSourceP95m:proxyAudit.proxyToSourceP95m,proxyToSourceMaxm:S2_CFD_PROXY_ASSET.surface.proxyToSourceMaxm},gridConvergenceEvidence:{policy:'same 3x3x3 sample points per active cell; >=15/27 solid; fluid six-connectivity to outlet required',solidVolume64m3:6.571197509765625,solidVolume96m3:6.68701171875,solidVolume128m3:6.785327911376953,relativeVolumeDelta64to128:0.031557856069460676,trappedFluidCellsAt64:0,trappedFluidCellsAt96:0,trappedFluidCellsAt128:0},activeMaskResolution:64},mask:voxel.report,mesh,selfIntersectionAudit:intersectionAuditMatches?{...S2_SELF_INTERSECTION_AUDIT,sourceFingerprint:S2_SELF_INTERSECTION_FINGERPRINT}:{status:'SOURCE_MISMATCH',selfIntersectionFree:false,closed:false,physicsReady:false},fluidCells:R.fluidCount,trappedFluidCells:0,limitations:['The render mesh remains open and has unresolved self-intersection review flags; it is not admitted as the CFD boundary.','The separately hashed 384^3 occupancy asset is an approximation derived from the render source; measured surface deviation and grid sensitivity are retained in this report.','The active 64^3 staircase mask uses 3x3x3 subcell samples with a >=15/27 solid rule; 64^3-to-128^3 solid-volume delta is about 3.16%.','Only normal-flux pressure projection is tested; tangential no-slip and moving-ground evolution are not implemented.','No transient time integration or scientific frame publication is implemented.']};
  if(numerical){
   workspace=await S1_GPU.create(device,S1_REFERENCE.layout({nx:64,ny:64,nz:64,min:Array.from(bounds.min),max:Array.from(bounds.max)}),{solid:voxel.solid,isCurrent,preconditioner:'jacobi4'});s2Active=workspace;if(!isCurrent())throw Error('STALE');
   const V={u:new Float32Array(workspace.layout?.counts?.u||65*64*64).fill(1),v:new Float32Array(64*65*64),w:new Float32Array(64*64*65)};
   const result=await workspace.project(V,{rho:1.225,dt:1/120,tolerance:1e-4,inletSpeed:1});if(!isCurrent())throw Error('STALE');
   const{pressure,velocity,...detail}=result;report.numerics=detail;
   if(result.ok){const m=R.metrics(velocity);report.metrics=m;report.numericalPassed=m.divergenceRms*4.7<=1e-4&&m.divergenceMax*4.7<=1e-2&&m.relativeFluxError<=1e-3&&m.blockedNormalMax<=1e-6;}
   report.stagePassed=report.geometryApproved&&report.numericalPassed&&report.trappedFluidCells===0;report.ok=report.stagePassed;report.code=report.stagePassed?'S2_PROXY_NUMERICAL_PASS':result.ok?'NUMERICAL_GATE_FAILED':result.code;
  }
 }catch(e){report={ok:false,code:isCurrent()?e.message:'STALE',epoch,generation:g,sceneStamp,geometryApproved:false,physicsReady:false,numericalPassed:false,stagePassed:false};}
 finally{if(workspace){workspace.dispose();if(report)report.allocatedBytesAfter=workspace.getStats().allocatedBytes;}s2Active=null;s2Busy=false;}
 if(isCurrent())s2Last=report;s2Refresh();return report;
}
AETHER.S2=Object.freeze({inspect:()=>s2Run(false),verify:()=>s2Run(true),getSnapshot:s2Snapshot,invalidate:s2Invalidate});
for(const[id,fn]of[['s2Inspect',()=>s2Run(false)],['s2Verify',()=>s2Run(true)]])document.getElementById(id)?.addEventListener('click',event=>{event.stopPropagation();void fn();});
/* END S2 API */
/* S3 384^3 backend foundation: tiled dispatch and explicit GPU-resident state. */
const S3_TARGET_N=384;
const S3_TARGET_CELLS=S3_TARGET_N**3;
const S3_TARGET_FACE_AXIS=S3_TARGET_N*S3_TARGET_N*(S3_TARGET_N+1);
const S3_TARGET_FACES=3*S3_TARGET_FACE_AXIS;
const S3_TARGET_MAX_FLOAT_BUFFER=S3_TARGET_FACE_AXIS*4;
const S3_TARGET_PLAN=Object.freeze({
 resolution:[S3_TARGET_N,S3_TARGET_N,S3_TARGET_N],
 cells:S3_TARGET_CELLS,
 faces:S3_TARGET_FACES,
 faceElementsPerAxis:S3_TARGET_FACE_AXIS,
 spacingMeters:[18/S3_TARGET_N,5.5/S3_TARGET_N,8/S3_TARGET_N],
 estimatedGpuBytes:12*S3_TARGET_FACES+76*S3_TARGET_CELLS,
 estimatedCpuSnapshotBytes:40*S3_TARGET_CELLS,
 largestFloat32BufferBytes:S3_TARGET_MAX_FLOAT_BUFFER,
 workgroupSize:64,
 currentOneDimensionalWorkgroups:Math.ceil(S3_TARGET_FACE_AXIS/64),
 oneDimensionalDispatchLimit:65535,
 geometryApproved:false,
 physicsReady:false,
 solverBackendReady:false,
 kernelSourcesImplemented:true,
 kernelCompilationVerified:false
});

/* Flattened 1D work is mapped to a legal 1D/2D/3D dispatch rectangle. */
function s3PlanTiledDispatch(elementCount,workgroupSize,maxGroupsPerDimension){
 if(!Number.isSafeInteger(elementCount)||elementCount<0)return {ok:false,code:'INVALID_ELEMENT_COUNT'};
 if(!Number.isSafeInteger(workgroupSize)||workgroupSize<1)return {ok:false,code:'INVALID_WORKGROUP_SIZE'};
 if(!Number.isSafeInteger(maxGroupsPerDimension)||maxGroupsPerDimension<1)return {ok:false,code:'INVALID_DISPATCH_LIMIT'};
 const requiredWorkgroups=Math.ceil(elementCount/workgroupSize);
 if(requiredWorkgroups===0)return {ok:true,code:'EMPTY_DISPATCH',elementCount,workgroupSize,requiredWorkgroups,dispatch:[0,0,0],dispatchedWorkgroups:0,overdispatchWorkgroups:0,mode:'EMPTY'};
 if(requiredWorkgroups>0xffffffff)return {ok:false,code:'LINEAR_GROUP_INDEX_OVERFLOW',elementCount,workgroupSize,requiredWorkgroups};
 const limit=maxGroupsPerDimension;
 let x,y,z,mode;
 if(requiredWorkgroups<=limit){x=requiredWorkgroups;y=1;z=1;mode='1D';}
 else if(requiredWorkgroups<=limit*limit){x=Math.min(limit,Math.ceil(Math.sqrt(requiredWorkgroups)));y=Math.ceil(requiredWorkgroups/x);z=1;mode='2D';}
 else if(requiredWorkgroups<=limit*limit*limit){x=Math.min(limit,Math.ceil(Math.cbrt(requiredWorkgroups)));y=Math.min(limit,Math.ceil(Math.sqrt(requiredWorkgroups/x)));z=Math.ceil(requiredWorkgroups/(x*y));mode='3D';}
 else return {ok:false,code:'DISPATCH_VOLUME_EXCEEDS_DEVICE_LIMIT',elementCount,workgroupSize,requiredWorkgroups,limit};
 const dispatchedWorkgroups=x*y*z;
 if(![x,y,z].every(v=>Number.isSafeInteger(v)&&v>=1&&v<=limit)||dispatchedWorkgroups<requiredWorkgroups||dispatchedWorkgroups>0xffffffff)
  return {ok:false,code:'DISPATCH_PLAN_INVALID',elementCount,workgroupSize,requiredWorkgroups,limit,dispatch:[x,y,z],dispatchedWorkgroups};
 return {ok:true,code:'TILED_DISPATCH_READY',elementCount,workgroupSize,requiredWorkgroups,dispatch:[x,y,z],dispatchedWorkgroups,overdispatchWorkgroups:dispatchedWorkgroups-requiredWorkgroups,mode,limit,
  indexFormula:'wg.x + wg.y * dispatch.x + wg.z * dispatch.x * dispatch.y',requiresElementBoundsGuard:true};
}

function s3LinearWorkgroupIndex(x,y,z,dispatch){
 if(!Array.isArray(dispatch)||dispatch.length!==3||![x,y,z,...dispatch].every(Number.isSafeInteger))throw new TypeError('INVALID_WORKGROUP_COORDINATE');
 const [dx,dy,dz]=dispatch;if(x<0||y<0||z<0||x>=dx||y>=dy||z>=dz)throw new RangeError('WORKGROUP_OUT_OF_RANGE');
 const index=x+y*dx+z*dx*dy;if(index>0xffffffff)throw new RangeError('LINEAR_GROUP_INDEX_OVERFLOW');return index;
}

function s3Build384ResourcePlan(n=384){
 if(!Number.isSafeInteger(n)||n<2)throw new RangeError('INVALID_GRID_RESOLUTION');
 const cells=n*n*n,face=(n+1)*n*n,bytesPerFloat=4;
 const specs=[];
 const add=(name,elements,kind='storage-f32')=>specs.push({name,elements,bytes:elements*bytesPerFloat,kind});
 for(const bank of ['accepted','advected','candidate'])for(const axis of ['u','v','w'])add(`mac.${bank}.${axis}`,face);
 for(const name of ['pressure.accepted','pressure.working','rhs','residual','preconditionedResidual','searchDirection','operatorDirection','diagonal'])add(`scalar.${name}`,cells);
 add('geometry.solidMask',cells,'storage-u32');
 for(const name of ['pressure','velocityX','velocityY','velocityZ','vorticityMagnitude'])add(`export.${name}`,cells);
 for(const name of ['pressure','velocityX','velocityY','velocityZ','vorticityMagnitude'])add(`staging.${name}`,cells,'staging-f32');
 const gpuBytes=specs.reduce((sum,r)=>sum+r.bytes,0);
 const snapshotFields=5,snapshotSlots=2,cpuSnapshotBytes=snapshotFields*cells*bytesPerFloat*snapshotSlots;
 return Object.freeze({resolution:[n,n,n],cells,faceElementsPerAxis:face,faces:3*face,bufferCount:specs.length,
  largestBufferBytes:Math.max(...specs.map(r=>r.bytes)),estimatedGpuBytes:gpuBytes,estimatedCpuSnapshotBytes:cpuSnapshotBytes,
  estimatedGpuGiB:+(gpuBytes/1024**3).toFixed(6),estimatedCpuSnapshotGiB:+(cpuSnapshotBytes/1024**3).toFixed(6),buffers:Object.freeze(specs.map(Object.freeze)),
  allocationPolicy:'EXPLICIT_ONLY',stepReadback:'NONE',cpuSnapshotSlots:snapshotSlots,geometryApproved:false,physicsReady:false,solverBackendReady:false});
}

function s3Validate384DeviceLimits(limits,resourcePlan=s3Build384ResourcePlan(384)){
 if(!limits)return {ok:false,code:'ADAPTER_LIMITS_UNAVAILABLE'};
 const need=['maxBufferSize','maxStorageBufferBindingSize','maxComputeWorkgroupsPerDimension','maxComputeWorkgroupSizeX','maxComputeInvocationsPerWorkgroup','maxStorageBuffersPerShaderStage'];
 if(need.some(k=>!Number.isSafeInteger(limits[k])||limits[k]<1))return {ok:false,code:'ADAPTER_LIMITS_UNAVAILABLE'};
 if(limits.maxBufferSize<resourcePlan.largestBufferBytes)return {ok:false,code:'384_MAX_BUFFER_TOO_SMALL',required:resourcePlan.largestBufferBytes,available:limits.maxBufferSize};
 if(limits.maxStorageBufferBindingSize<resourcePlan.largestBufferBytes)return {ok:false,code:'384_STORAGE_BINDING_TOO_SMALL',required:resourcePlan.largestBufferBytes,available:limits.maxStorageBufferBindingSize};
 if(limits.maxComputeWorkgroupSizeX<64||limits.maxComputeInvocationsPerWorkgroup<64)return {ok:false,code:'384_WORKGROUP_SIZE_TOO_SMALL'};
 if(limits.maxStorageBuffersPerShaderStage<8)return {ok:false,code:'384_STORAGE_BINDING_COUNT_TOO_SMALL',required:8,available:limits.maxStorageBuffersPerShaderStage};
 const dispatch=s3PlanTiledDispatch(resourcePlan.faceElementsPerAxis,64,limits.maxComputeWorkgroupsPerDimension);
 if(!dispatch.ok)return {ok:false,code:'384_DISPATCH_LIMIT_TOO_SMALL',dispatch};
 return {ok:true,code:'384_DEVICE_LIMITS_COMPATIBLE',dispatch,resourcePlan:{bufferCount:resourcePlan.bufferCount,estimatedGpuBytes:resourcePlan.estimatedGpuBytes,estimatedCpuSnapshotBytes:resourcePlan.estimatedCpuSnapshotBytes,largestBufferBytes:resourcePlan.largestBufferBytes},allocationStarted:false,solverStarted:false};
}

/* Allocation is deliberately separate from preflight; never call it on page boot. */
async function s3AllocateGpuResidentState(device,gridN,usage){
 if(!device||typeof device.createBuffer!=='function'||!usage||!Number.isSafeInteger(usage.STORAGE)||!Number.isSafeInteger(usage.COPY_DST)||!Number.isSafeInteger(usage.COPY_SRC)||!Number.isSafeInteger(usage.MAP_READ))throw new TypeError('GPU_DEVICE_OR_USAGE_UNAVAILABLE');
 const plan=s3Build384ResourcePlan(gridN),limits=device.limits||{};
 if(!Number.isSafeInteger(limits.maxBufferSize)||limits.maxBufferSize<plan.largestBufferBytes)throw new Error('384_MAX_BUFFER_TOO_SMALL');
 if(!Number.isSafeInteger(limits.maxStorageBufferBindingSize)||limits.maxStorageBufferBindingSize<plan.largestBufferBytes)throw new Error('384_STORAGE_BINDING_TOO_SMALL');
 const created=Object.create(null),allocated=[];let oomScopePushed=false,validationScopePushed=false,validationScopePopped=false,oomScopePopped=false;
 try{
  if(typeof device.pushErrorScope==='function'){device.pushErrorScope('out-of-memory');oomScopePushed=true;device.pushErrorScope('validation');validationScopePushed=true;}
  for(const spec of plan.buffers){
   const staging=spec.kind==='staging-f32',flags=staging?(usage.MAP_READ|usage.COPY_DST):(usage.STORAGE|usage.COPY_DST|usage.COPY_SRC);
   const buffer=device.createBuffer({label:`AETHER S3 ${spec.name}`,size:spec.bytes,usage:flags});
   if(!buffer||typeof buffer.destroy!=='function')throw new Error('GPU_BUFFER_ALLOCATION_FAILED:'+spec.name);
   created[spec.name]=buffer;allocated.push(buffer);
  }
  if(validationScopePushed&&typeof device.popErrorScope==='function'){const error=await device.popErrorScope();validationScopePopped=true;if(error)throw new Error(`GPU_BUFFER_VALIDATION:${error.message||error}`);}
  if(oomScopePushed&&typeof device.popErrorScope==='function'){const error=await device.popErrorScope();oomScopePopped=true;if(error)throw new Error(`GPU_BUFFER_OUT_OF_MEMORY:${error.message||error}`);}
  let disposed=false;
  return Object.freeze({plan,buffers:Object.freeze(created),get disposed(){return disposed;},dispose(){if(disposed)return;disposed=true;for(const b of allocated)b.destroy();}});
 }catch(error){for(const b of allocated)try{b.destroy()}catch{};if(typeof device.popErrorScope==='function'){if(validationScopePushed&&!validationScopePopped)try{await device.popErrorScope()}catch{};if(oomScopePushed&&!oomScopePopped)try{await device.popErrorScope()}catch{}}throw error;}
}

/* Compile every generated 384^3 solver shader through the current browser's real WebGPU device.
 * Compilation creates shader modules/pipelines only: it allocates no CFD buffers and submits no work. */
let s3CompileBusy=false,s3CompileReport=null;
function s3GetShaderCompileReport(){return s3CompileReport;}
async function s3Compile384Shaders(){
 if(s3CompileBusy)return s3CompileReport||{ok:false,code:'384_WGSL_COMPILE_BUSY'};
 if(s3PreflightBusy)return {ok:false,code:'384_PREFLIGHT_BUSY'};
 s3CompileBusy=true;
 const started=performance.now();let device=null;
 const finish=report=>{s3CompileReport=report;s3CompileBusy=false;s3Refresh();return report;};
 s3CompileReport={ok:false,code:'384_WGSL_COMPILING',targetGrid:S3_TARGET_PLAN.resolution.slice(),completedKernels:0,totalKernels:null,pipelinesCompiled:0,failures:[],warnings:[],allocationStarted:false,solverStarted:false};
 s3Refresh();await new Promise(resolve=>setTimeout(resolve,0));
 try{
  if(typeof isSecureContext==='undefined'||isSecureContext!==true)return finish({ok:false,code:'SECURE_CONTEXT_REQUIRED',targetGrid:S3_TARGET_PLAN.resolution.slice(),allocationStarted:false,solverStarted:false});
  if(typeof navigator==='undefined'||!navigator.gpu||typeof navigator.gpu.requestAdapter!=='function')return finish({ok:false,code:'WEBGPU_UNAVAILABLE',targetGrid:S3_TARGET_PLAN.resolution.slice(),allocationStarted:false,solverStarted:false});
  const adapter=await navigator.gpu.requestAdapter();if(!adapter)return finish({ok:false,code:'ADAPTER_UNAVAILABLE',targetGrid:S3_TARGET_PLAN.resolution.slice(),allocationStarted:false,solverStarted:false});
  device=await adapter.requestDevice();
  const maxGroups=device.limits?.maxComputeWorkgroupsPerDimension;
  if(!Number.isSafeInteger(maxGroups)||maxGroups<1)throw Error('WEBGPU_DISPATCH_LIMIT_UNAVAILABLE');
  const L=S1_REFERENCE.layout({nx:384,ny:384,nz:384,min:[-9,0,-4],max:[9,5.5,4]},{gpuOnly:true});
  const levels=[];for(let count=Math.ceil(L.counts.p/64);;count=Math.ceil(count/64)){levels.push(count);if(count===1)break;}
  const base=S1_GPU.shaderSources(L,maxGroups,levels.slice(0,-1));
  const masked=S2_WGSL(L,base,L.counts.p,maxGroups);
  const sources={...base,...masked,...S3_WGSL(L,maxGroups)};
  const entries=Object.entries(sources),failures=[],warnings=[];let compiled=0,completed=0;
  s3CompileReport={ok:false,code:'384_WGSL_COMPILING',targetGrid:S3_TARGET_PLAN.resolution.slice(),completedKernels:0,totalKernels:entries.length,pipelinesCompiled:0,failures:[],warnings:[],allocationStarted:false,solverStarted:false};s3Refresh();
  for(const [name,code] of entries){
   let failure=null,scopePushed=false;
   try{
    if(typeof device.pushErrorScope==='function'){device.pushErrorScope('validation');scopePushed=true;}
    const module=device.createShaderModule({label:'AETHER 384 WGSL '+name,code});
    let messages=[];if(typeof module.getCompilationInfo==='function'){const info=await module.getCompilationInfo();messages=info?.messages||[];}
    const compileErrors=messages.filter(m=>m.type==='error');
    for(const m of messages.filter(m=>m.type==='warning'))if(warnings.length<80)warnings.push({kernel:name,message:m.message,lineNum:m.lineNum,linePos:m.linePos});
    if(compileErrors.length){failure={kernel:name,stage:'WGSL',messages:compileErrors.slice(0,12).map(m=>({message:m.message,lineNum:m.lineNum,linePos:m.linePos}))};}
    else{await device.createComputePipelineAsync({label:'AETHER 384 pipeline '+name,layout:'auto',compute:{module,entryPoint:'main'}});compiled++;}
   }catch(error){failure={kernel:name,stage:'PIPELINE',message:error?.message||String(error)};}
   finally{
    if(scopePushed){try{const scoped=await device.popErrorScope();if(scoped&&!failure)failure={kernel:name,stage:'VALIDATION',message:scoped.message||String(scoped)};}catch(error){if(!failure)failure={kernel:name,stage:'ERROR_SCOPE',message:error?.message||String(error)};}}
   }
   if(failure)failures.push(failure);completed++;
   s3CompileReport={ok:false,code:'384_WGSL_COMPILING',targetGrid:S3_TARGET_PLAN.resolution.slice(),completedKernels:completed,totalKernels:entries.length,pipelinesCompiled:compiled,failures:failures.slice(0,20),warnings:warnings.slice(0,20),allocationStarted:false,solverStarted:false};s3Refresh();
   if(completed%4===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  return finish({ok:failures.length===0,code:failures.length===0?'384_WGSL_COMPILE_PASS':'384_WGSL_COMPILE_FAILED',targetGrid:S3_TARGET_PLAN.resolution.slice(),totalKernels:entries.length,shaderModulesChecked:entries.length,pipelinesCompiled:compiled,failedKernelCount:failures.length,failures:failures.slice(0,20),warnings:warnings.slice(0,80),warningCount:warnings.length,sourceCharacters:entries.reduce((n,[,code])=>n+code.length,0),durationMs:+(performance.now()-started).toFixed(1),adapterLimits:{maxComputeWorkgroupsPerDimension:maxGroups,maxComputeWorkgroupSizeX:device.limits.maxComputeWorkgroupSizeX,maxComputeInvocationsPerWorkgroup:device.limits.maxComputeInvocationsPerWorkgroup,maxStorageBuffersPerShaderStage:device.limits.maxStorageBuffersPerShaderStage},allocationStarted:false,solverStarted:false,dispatchesSubmitted:0,geometryApproved:false,physicsReady:false,limitation:'WGSL and compute-pipeline compilation only; no 384^3 field allocation or CFD dispatch.'});
 }catch(error){return finish({ok:false,code:'384_WGSL_COMPILE_RUNTIME_ERROR',targetGrid:S3_TARGET_PLAN.resolution.slice(),message:error?.message||String(error),allocationStarted:false,solverStarted:false,dispatchesSubmitted:0});}
 finally{try{device?.destroy?.();}catch{}}
}

let s3PreflightBusy=false,s3PreflightReport=null;
const s3ByteMiB=n=>Number.isFinite(n)?+(n/1024**2).toFixed(2):null;
function s3ReadAdapterLimits(adapter){
 const l=adapter?.limits;if(!l)return null;
 const keys=['maxBufferSize','maxStorageBufferBindingSize','maxComputeWorkgroupsPerDimension','maxStorageBuffersPerShaderStage','maxComputeWorkgroupSizeX','maxComputeInvocationsPerWorkgroup'];
 const out={};for(const k of keys)out[k]=Number.isSafeInteger(l[k])?l[k]:null;return out;
}
function s3Classify384Adapter(limits){return s3Validate384DeviceLimits(limits).code;}
function s3FormatPlan(report){
 const el=document.getElementById('s3Plan');if(!el)return;
 const p=S3_TARGET_PLAN,resource=s3Build384ResourcePlan(384),lim=report?.adapterLimits||null;
 el.textContent=JSON.stringify({resolution:p.resolution,cells:p.cells,faces:p.faces,spacingMeters:p.spacingMeters,
  estimatedGpuGiB:resource.estimatedGpuGiB,estimatedCpuSnapshotGiB:resource.estimatedCpuSnapshotGiB,bufferCount:resource.bufferCount,
  largestBufferMiB:s3ByteMiB(resource.largestBufferBytes),dispatch:report?.limitCheck?.dispatch||null,adapterLimits:lim,
  preflightCode:report?.code||'NOT_RUN',kernelSourcesImplemented:S3_TARGET_PLAN.kernelSourcesImplemented,kernelCompilationVerified:s3CompileReport?.ok===true,shaderCompilation:s3CompileReport?{code:s3CompileReport.code,pipelinesCompiled:s3CompileReport.pipelinesCompiled,totalKernels:s3CompileReport.totalKernels}:null,
  solverBackendReady:S3_TARGET_PLAN.solverBackendReady,allocationStarted:false,solverStarted:false,geometryApproved:false,physicsReady:false},null,2);
}
function s3Snapshot(){return {stage:'S3_384_TILED_SOLVER_KERNEL_SOURCE',targetGrid:S3_TARGET_PLAN.resolution.slice(),geometryApproved:false,physicsReady:false,productReady:false,sequence:0,simulationTime:0,running:false,
 deviceReady:false,status:s3PreflightBusy?'CHECKING_384_LIMITS':s3CompileBusy?'COMPILING_384_WGSL':s3PreflightReport?.code||s3CompileReport?.code||'384_PREFLIGHT_NOT_RUN',lastReport:s3PreflightReport,allocatedBytes:0,
 kernelSourcesImplemented:S3_TARGET_PLAN.kernelSourcesImplemented,kernelCompilationVerified:s3CompileReport?.ok===true,shaderCompilation:s3CompileReport,solverBackendReady:S3_TARGET_PLAN.solverBackendReady,
 memoryPlan:{estimatedGpuBytes:S3_TARGET_PLAN.estimatedGpuBytes,estimatedCpuSnapshotBytes:S3_TARGET_PLAN.estimatedCpuSnapshotBytes,allocationStarted:false}};}
function s3Refresh(){
 const el=document.getElementById('s3Status');if(el){const s=s3Snapshot();el.textContent=`384³ CFD: ${s.status} · WGSL ${s.kernelCompilationVerified?'컴파일 PASS':s3CompileBusy?'컴파일 중':'미검증'} · 격자 자동 축소 없음`;}
 const compile=document.getElementById('s3Compile');if(compile){compile.disabled=s3CompileBusy||s3PreflightBusy;compile.textContent=s3CompileBusy?'컴파일 중…':'384³ WGSL 컴파일';}
 const summary=document.getElementById('s3CompileSummary');if(summary){const c=s3CompileReport;summary.textContent=s3CompileBusy?`WGSL: 컴파일 중 ${c?.completedKernels||0}/${c?.totalKernels||'…'}`:c?.ok?`WGSL: PASS ${c.pipelinesCompiled}/${c.totalKernels}`:c?`WGSL: ${c.code}`:'WGSL: 컴파일 전';summary.className='m13-status '+(s3CompileBusy?'warn':c?.ok?'ok':c?'bad':'warn');}
 const log=document.getElementById('s3CompileLog');if(log)log.textContent=s3CompileReport?JSON.stringify(s3CompileReport,null,2):'Chrome secure context에서 시작하면 WebGPU 컴파일 진단이 표시됩니다. CFD 배열 할당이나 계산은 수행하지 않습니다.';
 const init=document.getElementById('s3Init');if(init){init.disabled=s3PreflightBusy||s3CompileBusy;init.textContent=s3PreflightBusy?'384³ 장치 확인 중':'384³ GPU 사전검사';}
 for(const id of ['s3Step','s3Run']){const e=document.getElementById(id);if(e){e.disabled=true;e.title='384³ CFD remains disabled until the WGSL compiles on WebGPU, a vehicle mask is accepted, and GPU-resident steps pass real-device numerical tests';}}
 const reset=document.getElementById('s3Reset');if(reset)reset.disabled=s3PreflightBusy||s3CompileBusy;s3FormatPlan(s3PreflightReport);
}
async function s3Init(){
 if(s3CompileBusy)return {ok:false,code:'384_WGSL_COMPILATION_BUSY'};if(s3PreflightBusy)return {ok:false,code:'BUSY'};s3PreflightBusy=true;s3Refresh();let code='ADAPTER_LIMITS_UNAVAILABLE',limits=null,limitCheck=null;
 try{
  if(typeof isSecureContext==='undefined'||isSecureContext!==true)code='SECURE_CONTEXT_REQUIRED';
  else if(typeof navigator==='undefined'||!navigator.gpu||typeof navigator.gpu.requestAdapter!=='function')code='WEBGPU_UNAVAILABLE';
  else{const adapter=await navigator.gpu.requestAdapter();if(!adapter)code='ADAPTER_UNAVAILABLE';else{limits=s3ReadAdapterLimits(adapter);limitCheck=s3Validate384DeviceLimits(limits);code=limitCheck.code;}}
 }catch(e){code=e?.name==='NotAllowedError'?'ADAPTER_DENIED':'ADAPTER_REQUEST_FAILED';}
 const resource=s3Build384ResourcePlan(384);
 s3PreflightReport={ok:false,code,targetGrid:S3_TARGET_PLAN.resolution.slice(),adapterLimits:limits,limitCheck,
  memoryPlan:{estimatedGpuBytes:resource.estimatedGpuBytes,estimatedGpuGiB:resource.estimatedGpuGiB,estimatedCpuSnapshotBytes:resource.estimatedCpuSnapshotBytes,estimatedCpuSnapshotGiB:resource.estimatedCpuSnapshotGiB,
   largestBufferBytes:resource.largestBufferBytes,largestBufferMiB:s3ByteMiB(resource.largestBufferBytes),bufferCount:resource.bufferCount},
  kernelSourcesImplemented:S3_TARGET_PLAN.kernelSourcesImplemented,kernelCompilationVerified:s3CompileReport?.ok===true,
  solverBackendReady:false,allocationStarted:false,solverStarted:false,gridAutomaticFallback:false,geometryApproved:false,physicsReady:false,
  kernelSourcesImplemented:true,kernelCompilationVerified:s3CompileReport?.ok===true,solverBackendReady:false,
  nextRequirements:[...(s3CompileReport?.ok?[]:['compile every generated 384^3 WGSL pipeline on the target browser']),'run the manufactured pressure/projection oracle on real WebGPU','review and resolve the 270-cell wheel-area connectivity pockets without changing the 384 grid','replace diagnostic full-field readback in the step path with a bounded GPU-resident commit and GPU-side acceptance reductions','perform a real WebGPU allocation and short accepted 384^3 sequence; record residual, divergence, flux, blocked-face velocity, memory, and step time']};
 s3PreflightBusy=false;s3Refresh();return s3PreflightReport;
}
function s3BlockedAction(){return Promise.resolve({ok:false,code:'384_SOLVER_RUNTIME_UNVERIFIED',targetGrid:S3_TARGET_PLAN.resolution.slice(),solverStarted:false,kernelSourcesImplemented:true,kernelCompilationVerified:s3CompileReport?.ok===true,geometryApproved:false,physicsReady:false});}
function s3Reset(){s3PreflightReport=null;s3Refresh();return {ok:true,code:'384_PREFLIGHT_RESET'};}
if(window.__AETHER_S3_PRIVATE_TEST_MODE__===true)Object.defineProperty(window,'__AETHER_S3_PRIVATE_TEST__',{value:Object.freeze({plan384:S3_TARGET_PLAN,classify384Adapter:s3Classify384Adapter,readAdapterLimits:s3ReadAdapterLimits,planTiledDispatch:s3PlanTiledDispatch,linearWorkgroupIndex:s3LinearWorkgroupIndex,build384ResourcePlan:s3Build384ResourcePlan,validate384DeviceLimits:s3Validate384DeviceLimits,allocateGpuResidentState:s3AllocateGpuResidentState}),configurable:false});
function s3Invalidate(){return s3Reset();}
AETHER.S3=Object.freeze({initialize:s3Init,compileShaders:s3Compile384Shaders,getShaderCompileReport:s3GetShaderCompileReport,stepOnce:s3BlockedAction,start:s3BlockedAction,pause:()=>({ok:true,code:'NOT_RUNNING'}),reset:s3Reset,getSnapshot:s3Snapshot,getMemoryPlan:()=>s3Build384ResourcePlan(384),invalidate:s3Reset});
for(const [id,fn] of [['s3Compile',s3Compile384Shaders],['s3Init',s3Init],['s3Step',s3BlockedAction],['s3Run',s3BlockedAction],['s3Reset',s3Reset]])document.getElementById(id)?.addEventListener('click',e=>{e.stopPropagation();void fn();});
s3Refresh();
/* END S3 API */


const api=Object.freeze({initialize,start:blocked,pause,stepOnce:blocked,reset,setNumerics,setBoundaryConditions,getSnapshot:snapshot,dispose});AETHER.SOLVER=api;AETHER.CURRENT_AUTHORITIES.solver='AETHER.SOLVER S0 shell';return api;
})();
/* END S0 SOLVER */

const applicationState={contractReady:false,productReady:false,visualApproval:'M3_GEOMETRY_APPROVED_NATIVE_ES3',m3Acceptance:{geometry:'FROZEN',scope:'M3 geometry and desktop-aspect composition',evidence:'Direct source review; VM regression; actual Mesa OpenGL ES shader compilation and Hero/Side/Top rendering',browserRuntime:'NOT_VERIFIED',iPhoneRuntime:'NOT_VERIFIED',productReady:false}};AETHER.APPLICATION=applicationState;
const coordinateContract=Object.freeze({version:1,unit:'meter',unitsPerWorldUnit:1,axes:Object.freeze({downstream:'+X',up:'+Y',lateral:'+Z',vehicleForward:'-X'}),groundY:0,centerlineZ:0,rotationOrder:'XYZ (Rx then Ry then Rz; column-vector convention)',rotationUnit:'radians',scaleRule:'positive finite components only'});AETHER.COORDINATE_CONTRACT=coordinateContract;
const config=Object.freeze({world:Object.freeze({unit:'meter',groundY:0,centerlineZ:0}),testSection:Object.freeze({lengthX:18,widthZ:8,heightY:5.5}),controlRoom:Object.freeze({widthX:8.5,depthZ:5.5,heightY:3.2,elevationY:.75}),vehicleReference:Object.freeze({lengthX:4.7,widthZ:1.928297490761,heightY:1.297449006023}),rollingRoad:Object.freeze({minX:-3.2,maxX:3.2,minZ:-1.35,maxZ:1.35,beltTopY:0,recessedBelowGround:true}),camera:Object.freeze({fovVerticalDegrees:50,near:.05,far:100})});AETHER.WIND_TUNNEL_CONFIG=config;
const CFD_DOMAIN_CONTRACT=(()=>{const t=config.testSection,c=coordinateContract,min=Object.freeze([-t.lengthX/2,c.groundY,-t.widthZ/2]),max=Object.freeze([t.lengthX/2,t.heightY,t.widthZ/2]),size=Object.freeze(max.map((v,i)=>v-min[i])),volume=size[0]*size[1]*size[2],tiers=Object.freeze([64,128,256].map(res=>{const cells=res**3;return Object.freeze({resolution:res,cells,scalarFloat32Bytes:cells*Float32Array.BYTES_PER_ELEMENT,vector3Float32Bytes:cells*3*Float32Array.BYTES_PER_ELEMENT})}));return Object.freeze({version:'M12',unit:c.unit,axis:Object.freeze({...c.axes}),bounds:Object.freeze({min,max,size,volume}),resolutionTiers:tiers,activeTier:null,allocated:false,solverBound:false,fieldData:false})})();AETHER.CFD_DOMAIN=CFD_DOMAIN_CONTRACT;
const M4_CONFIG=Object.freeze({
  pit:Object.freeze({minX:-3.2,maxX:3.2,minZ:-1.35,maxZ:1.35,beltCenter:[0,-.03,0],beltSize:[6.20,.06,2.56],beltTopY:0,pitFloorTopY:-.42}),
  frame:Object.freeze({sideZ:1.325,endX:3.175}),
  roller:Object.freeze({radius:.09,centerY:-.15,segments:32}),
  state:Object.freeze({pitch:.50,maxSpeed:100,maxDt:.05,maxBatch:8}),
  tolerances:Object.freeze({geometry:1e-5,contact:.002,normal:1e-5})
});
AETHER.M4_CONFIG=M4_CONFIG;
const rollingState={source:null,previous:null,baseline:null,beltTravel:0,wheelAngles:[0,0,0,0],rollerAngles:[0,0,0,0],effectiveSpeed:0,aligned:true,motionReady:false,roadSection:false,lastRejection:null,duplicateFrames:0};
function identityMatrix(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])}
function positiveMod(a,b){return ((a%b)+b)%b}
function alignedVehicle(){const v=AETHER.VEHICLE_TRANSFORM;return v.position.every((x,i)=>x===[0,0,0][i])&&v.rotation.every((x,i)=>Math.abs(x-[0,Math.PI,0][i])<1e-10)&&v.scale.every((x,i)=>x===[1,1,1][i])}
function cloneFrame(f){return {sourceId:f.sourceId,sequence:f.sequence,simulationTime:f.simulationTime,freestreamSpeed:f.freestreamSpeed,running:f.running}}
function sameFrame(a,b){return !!a&&!!b&&a.sourceId===b.sourceId&&a.sequence===b.sequence&&a.simulationTime===b.simulationTime&&a.freestreamSpeed===b.freestreamSpeed&&a.running===b.running}
function rejectFrame(reason){rollingState.lastRejection=reason;rollingState.previous=null;rollingState.baseline=null;rollingState.effectiveSpeed=0;rollingState.aligned=alignedVehicle();rollingState.motionReady=false;if(AETHER.M4)AETHER.M4.liveSolverConnected=false;diagnostics.warnings.push(reason);diagnostics.events.push({time:now(),type:'M4_REJECT',message:reason});renderDiagnostics();return false}
function suspendRollingRoad(reason){rollingState.previous=null;rollingState.baseline=null;rollingState.effectiveSpeed=0;rollingState.motionReady=false;if(AETHER.M4)AETHER.M4.liveSolverConnected=false;diagnostics.events.push({time:now(),type:'M4_SUSPEND',message:reason});renderDiagnostics()}
let vehicleGeometryEpoch=0;
function vehicleTransformChanged(){vehicleGeometryEpoch++;AETHER.S3?.invalidate();AETHER.S2?.invalidate();
 if(AETHER.S3_OFFICE)AETHER.S3_OFFICE.reset();
 if(typeof m13UnbindSolver==='function')m13UnbindSolver();
 if(typeof smokeState!=='undefined'){smokeState.frameKey=null;smokeState.frameId=null;smokeState.paths=null;smokeState.solidBounds=null;smokeState.activeCount=0;smokeState.resetRequested=true;}
 if(typeof flowLayoutCache!=='undefined')flowLayoutCache=null;
 if(scene.vehicleParts.length===5){
  if(gl){for(const r of scene.roadParts)for(const b of [r.gpu?.pb,r.gpu?.nb,r.gpu?.ub,r.gpu?.ib])if(b)gl.deleteBuffer(b);
   for(const o of scene.objects)if(o.category==='wheel station')for(const b of [o.gpu?.pb,o.gpu?.nb,o.gpu?.ub,o.gpu?.ib])if(b)gl.deleteBuffer(b);}
  buildRollingRoadGeometry();if(gl&&program)setupResources();
  if(AETHER.M12)try{runM12Checks()}catch(e){diagnostics.error('M12_TRANSFORM_ALIGNMENT',e)}
  if(AETHER.VEHICLE_PRODUCTION){const old=AETHER.VEHICLE_PRODUCTION,vt=AETHER.VEHICLE_TRANSFORM,b=CFD_BRIDGE.getAlignmentReport().renderBounds;AETHER.VEHICLE_PRODUCTION=Object.freeze({...old,transform:Object.freeze({...old.transform,position:vt.position,rotation:vt.rotation,scale:vt.scale,dimensions:{...vt.dimensions},worldBounds:{min:b.min,max:b.max}})})}
 }
 rollingState.aligned=alignedVehicle();diagnostics.vehicleAlignment={valid:rollingState.aligned,worldAABB:AETHER.VEHICLE_TRANSFORM.worldAABB};if(!rollingState.aligned&&!diagnostics.warnings.includes('VEHICLE_NOT_ALIGNED'))diagnostics.warnings.push('VEHICLE_NOT_ALIGNED');if(rollingState.aligned)diagnostics.warnings=diagnostics.warnings.filter(w=>w!=='VEHICLE_NOT_ALIGNED');suspendRollingRoad('VEHICLE_TRANSFORM_CHANGED')}
function snapshotState(){const src=rollingState.source?{kind:rollingState.source.kind,id:rollingState.source.id}:null;const wheels=wheelParts();const currentAligned=alignedVehicle();const effective=currentAligned?rollingState.effectiveSpeed:0;let maxContactGap=null;if(wheels.length===4){const gaps=wheels.map((p,i)=>{const b=wheelWorldBoundsAt(0,i);return Math.max(0,b.min[1])});maxContactGap=Math.max(...gaps)}return Object.freeze({sourceKind:src?.kind||null,sourceId:src?.id||null,sequence:rollingState.previous?.sequence??null,simulationTime:rollingState.previous?.simulationTime??null,inputSpeed:rollingState.previous?.freestreamSpeed??0,effectiveSpeed:effective,running:!!rollingState.previous?.running,aligned:currentAligned,beltTravel:rollingState.beltTravel,wheelAngles:rollingState.wheelAngles.slice(),rollerAngles:rollingState.rollerAngles.slice(),omegaWheel:wheels.map(p=>-effective/(p.wheel?.radius||1)),omegaRoller:scene.roadParts.map(()=>-effective/M4_CONFIG.roller.radius),roadSection:rollingState.roadSection,geometryCounts:{sceneObjects:scene.objects.length,roadParts:scene.roadParts.length,vehicleParts:scene.vehicleParts.length},gpuResourceCounts:{objects:scene.objects.filter(o=>o.gpu).length,vehicleParts:scene.vehicleParts.filter(p=>p.gpu).length,roadParts:scene.roadParts.filter(r=>r.gpu).length},maxContactGap,correctionMaxDistance:wheels.length?Math.max(...wheels.map(p=>p.wheel?.correctionMax||0)):null,lastRejection:rollingState.lastRejection,duplicateFrames:rollingState.duplicateFrames,liveSolverConnected:!!src&&src.kind==='solver'&&!!rollingState.previous&&currentAligned})}
function makeRollingRoadAPI(){return Object.freeze({bindSource(input={}){const {kind,id}=input&&typeof input==='object'?input:{};if((kind!=='solver'&&kind!=='test')||typeof id!=='string'||!id.trim())return rejectFrame('INVALID_SOURCE');rollingState.source={kind,id:id.trim()};rollingState.previous=null;rollingState.baseline=null;rollingState.effectiveSpeed=0;rollingState.aligned=alignedVehicle();rollingState.motionReady=false;rollingState.lastRejection=null;rollingState.duplicateFrames=0;if(AETHER.M4)AETHER.M4.liveSolverConnected=false;diagnostics.events.push({time:now(),type:'M4_BIND',message:kind+':'+id});renderDiagnostics();return true},unbindSource(){rollingState.source=null;rollingState.previous=null;rollingState.baseline=null;rollingState.effectiveSpeed=0;rollingState.aligned=alignedVehicle();rollingState.motionReady=false;if(AETHER.M4)AETHER.M4.liveSolverConnected=false;diagnostics.events.push({time:now(),type:'M4_UNBIND',message:'source=null'});renderDiagnostics();return true},acceptFrame(frame){if(!rollingState.source)return rejectFrame('SOURCE_UNBOUND');if(!frame||typeof frame!=='object')return rejectFrame('INVALID_FRAME');const keys=['sourceId','sequence','simulationTime','freestreamSpeed','running'];if(keys.some(k=>!(k in frame)))return rejectFrame('MISSING_FRAME_FIELD');if(typeof frame.sourceId!=='string'||!Number.isInteger(frame.sequence)||typeof frame.running!=='boolean'||!finite(frame.simulationTime)||!finite(frame.freestreamSpeed))return rejectFrame('FRAME_TYPE_INVALID');if(frame.sourceId!==rollingState.source.id)return rejectFrame('WRONG_SOURCE');if(frame.sequence<0||frame.simulationTime<0||frame.freestreamSpeed<0||frame.freestreamSpeed>M4_CONFIG.state.maxSpeed)return rejectFrame('FRAME_RANGE_INVALID');if(document.hidden){rollingState.previous=null;rollingState.baseline=null;rollingState.effectiveSpeed=0;rollingState.motionReady=false;if(AETHER.M4)AETHER.M4.liveSolverConnected=false;return false}const prev=rollingState.previous;if(prev&&frame.sequence===prev.sequence){if(sameFrame(frame,prev)){rollingState.duplicateFrames++;return true}return rejectFrame('SEQUENCE_REUSE_MUTATED')}if(prev&&(frame.sequence<prev.sequence||frame.simulationTime<prev.simulationTime))return rejectFrame('FRAME_ORDER_INVALID');const aligned=alignedVehicle();rollingState.aligned=aligned;if(!aligned&&!diagnostics.warnings.includes('VEHICLE_NOT_ALIGNED'))diagnostics.warnings.push('VEHICLE_NOT_ALIGNED');if(prev){const dt=frame.simulationTime-prev.simulationTime;if(dt-M4_CONFIG.state.maxDt>1e-9)return rejectFrame('TIME_STEP_TOO_LARGE');if(dt<0)return rejectFrame('TIME_REVERSED');if(dt>0&&prev.running&&rollingState.motionReady&&aligned){const distance=prev.freestreamSpeed*dt;rollingState.beltTravel=positiveMod(rollingState.beltTravel+distance,M4_CONFIG.state.pitch);const wheels=wheelParts();for(let i=0;i<rollingState.wheelAngles.length;i++)rollingState.wheelAngles[i]=positiveMod(rollingState.wheelAngles[i]-distance/(wheels[i]?.wheel?.radius||1),Math.PI*2);for(let i=0;i<rollingState.rollerAngles.length;i++)rollingState.rollerAngles[i]=positiveMod(rollingState.rollerAngles[i]-distance/M4_CONFIG.roller.radius,Math.PI*2)}}rollingState.effectiveSpeed=(aligned&&frame.running)?frame.freestreamSpeed:0;rollingState.motionReady=aligned;rollingState.previous=cloneFrame(frame);rollingState.baseline=frame.simulationTime;rollingState.lastRejection=null;if(AETHER.M4)AETHER.M4.liveSolverConnected=rollingState.source.kind==='solver'&&aligned;renderDiagnostics();return true},setSectionView(on){if(typeof on!=='boolean')return false;rollingState.roadSection=on;renderDiagnostics();return true},resetMotion(){rollingState.beltTravel=0;rollingState.wheelAngles.fill(0);rollingState.rollerAngles.fill(0);rollingState.previous=null;rollingState.baseline=null;rollingState.effectiveSpeed=0;rollingState.aligned=alignedVehicle();rollingState.motionReady=false;rollingState.lastRejection=null;rollingState.duplicateFrames=0;if(AETHER.M4)AETHER.M4.liveSolverConnected=false;renderDiagnostics();return true},getSnapshot(){return snapshotState()}})}
AETHER.ROLLING_ROAD=makeRollingRoadAPI();

const v3=v=>Array.isArray(v)&&v.length===3&&v.every(finite),cl3=v=>[v[0],v[1],v[2]],add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],mul=(a,s)=>[a[0]*s[0],a[1]*s[1],a[2]*s[2]],rx=(v,a)=>{const c=Math.cos(a),s=Math.sin(a);return[v[0],c*v[1]-s*v[2],s*v[1]+c*v[2]]},ry=(v,a)=>{const c=Math.cos(a),s=Math.sin(a);return[c*v[0]+s*v[2],v[1],-s*v[0]+c*v[2]]},rz=(v,a)=>{const c=Math.cos(a),s=Math.sin(a);return[c*v[0]-s*v[1],s*v[0]+c*v[1],v[2]]},rf=(v,r)=>rz(ry(rx(v,r[0]),r[1]),r[2]),ri=(v,r)=>rx(ry(rz(v,-r[2]),-r[1]),-r[0]);
class VehicleTransform{constructor({position=[0,0,0],rotation=[0,0,0],scale=[1,1,1],lengthX=4.7,widthZ=1.9,heightY=1.45}={}){this._state=null;this.setState({position,rotation,scale,lengthX,widthZ,heightY})}static validate(s){if(!v3(s.position)||!v3(s.rotation)||!v3(s.scale)||!s.scale.every(v=>v>0)||![s.lengthX,s.widthZ,s.heightY].every(v=>finite(v)&&v>0))throw new TypeError('VehicleTransform requires finite position/rotation, positive finite scale and dimensions')}setState(n){const s={position:cl3(n.position),rotation:cl3(n.rotation),scale:cl3(n.scale),lengthX:n.lengthX,widthZ:n.widthZ,heightY:n.heightY};VehicleTransform.validate(s);const changed=JSON.stringify(this._state)!==JSON.stringify(s);this._state=s;if(changed&&AETHER.VEHICLE_TRANSFORM===this)vehicleTransformChanged();return this}get position(){return cl3(this._state.position)}get rotation(){return cl3(this._state.rotation)}get scale(){return cl3(this._state.scale)}get dimensions(){return{lengthX:this._state.lengthX,widthZ:this._state.widthZ,heightY:this._state.heightY}}get localBounds(){return{min:[-this._state.lengthX/2,0,-this._state.widthZ/2],max:[this._state.lengthX/2,this._state.heightY,this._state.widthZ/2]}}localToWorld(p){if(!v3(p))throw new TypeError('local point must be finite Vec3');return add(rf(mul(p,this._state.scale),this._state.rotation),this._state.position)}worldToLocal(p){if(!v3(p))throw new TypeError('world point must be finite Vec3');const q=ri(sub(p,this._state.position),this._state.rotation);return[q[0]/this._state.scale[0],q[1]/this._state.scale[1],q[2]/this._state.scale[2]]}get worldAABB(){const b=this.localBounds,c=[];for(const x of[b.min[0],b.max[0]])for(const y of[b.min[1],b.max[1]])for(const z of[b.min[2],b.max[2]])c.push(this.localToWorld([x,y,z]));return{min:[0,1,2].map(i=>Math.min(...c.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...c.map(p=>p[i]))),corners:c}}}
AETHER.VEHICLE_TRANSFORM=new VehicleTransform({rotation:[0,Math.PI,0],lengthX:4.7,widthZ:1.928297490761,heightY:1.297449006023});
function runM1Tests(){const results=[],pass=(name,detail)=>results.push({name,status:'PASS',detail}),fail=(name,detail)=>results.push({name,status:'FAIL',detail}),t=new VehicleTransform();try{JSON.stringify(t.localToWorld([1,2,3]))===JSON.stringify([1,2,3])?pass('identity','ok'):fail('identity','mismatch')}catch(e){fail('identity',e.message)}try{t.setState({position:[3,-2,5],rotation:[0,0,0],scale:[1,1,1],lengthX:4.7,widthZ:1.9,heightY:1.45});JSON.stringify(t.localToWorld([0,0,0]))===JSON.stringify([3,-2,5])?pass('translation','ok'):fail('translation','mismatch')}catch(e){fail('translation',e.message)}try{t.setState({position:[0,0,0],rotation:[0,0,0],scale:[2,3,4],lengthX:4.7,widthZ:1.9,heightY:1.45});JSON.stringify(t.localToWorld([1,1,1]))===JSON.stringify([2,3,4])?pass('nonuniform scale','ok'):fail('nonuniform scale','mismatch')}catch(e){fail('nonuniform scale',e.message)}for(const[n,r]of[['axis X',[Math.PI/2,0,0]],['axis Y',[0,Math.PI/2,0]],['axis Z',[0,0,Math.PI/2]]])try{t.setState({position:[0,0,0],rotation:r,scale:[1,1,1],lengthX:4.7,widthZ:1.9,heightY:1.45});const q=t.localToWorld([.31,-.7,1.2]),w=t.worldToLocal(q);Math.max(...w.map((x,i)=>Math.abs(x-[.31,-.7,1.2][i])))<1e-9?pass(n,'roundtrip'):fail(n,'mismatch')}catch(e){fail(n,e.message)}const gates={canonicalCoordinate:coordinateContract.unitsPerWorldUnit===1&&coordinateContract.axes.downstream==='+X'&&coordinateContract.axes.up==='+Y'&&coordinateContract.axes.lateral==='+Z'&&coordinateContract.axes.vehicleForward==='-X'&&coordinateContract.groundY===0&&coordinateContract.centerlineZ===0,singleTransformAuthority:AETHER.VEHICLE_TRANSFORM.constructor===VehicleTransform};return{passed:results.every(r=>r.status==='PASS')&&Object.values(gates).every(Boolean),results,gates,contract:coordinateContract,systems:{renderer:'M4 WebGL2',GPUDevice:'NOT_IMPLEMENTED',vehicleLoader:'M4 embedded Blender-converted GLB',solver:'NOT_IMPLEMENTED',camera:'M4',input:'M4'}}}AETHER.M1=runM1Tests();
const glCanvas=document.getElementById('view'),scene={objects:[],vehicleParts:[],roadParts:[],fanParts:[],collectorParts:[],materials:new Map(),resources:[]},camera={preset:'Hero',eye:[-1.8,2.4,9.1],target:[0,1.05,0],up:[0,1,0],fov:50,near:.05,far:100,yaw:0,pitch:0,distance:8,cutaway:false};
function wheelParts(){return scene.vehicleParts.filter(p=>p.role==='wheel').slice().sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true}));}
function addBox(name,center,size,color,{material='solid',visible=true,bevel=.02,category='production'}={}){if(!v3(center)||!v3(size)||!size.every(x=>finite(x)&&x>0))throw new Error('invalid geometry '+name);const o={type:'box',name,center,size,color,material,visible,bevel:Math.min(bevel,Math.min(...size)/4),category};scene.objects.push(o);return o}
function addMarker(name,center,size,color,material='marker'){return addBox(name,center,size,color,{material,bevel:.01,category:'measurement'})}
function buildScene(){scene.objects.length=0;const t=config.testSection,r=config.controlRoom,b=config.rollingRoad;
  for(const x of[-6.1,6.1])addBox('floor slab end',[x,-.12,0],[5.8,.24,8],[.20,.24,.27],{bevel:.04,category:'structure'});
  for(const z of[-2.675,2.675])addBox('floor slab side',[0,-.12,z],[6.4,.24,2.65],[.20,.24,.27],{bevel:.025,category:'structure'});
  for(const x of[-8.85,-6.0,-3.0,0,3.0,6.0,8.85]){
    if(Math.abs(x)<3.2){for(const z of[-2.66,2.66])addBox('floor panel seam',[x,.001,z],[.018,.002,2.58],[.10,.14,.17],{bevel:.0002,category:'floor seams'});}
    else addBox('floor panel seam',[x,.001,0],[.018,.002,7.92],[.10,.14,.17],{bevel:.0002,category:'floor seams'});
  }
  addBox('left wall panel west',[-4.9,2.75,-3.98],[8.2,5.5,.16],[.23,.28,.32],{bevel:.05,category:'wall panels'});addBox('left wall panel east',[4.9,2.75,-3.98],[8.2,5.5,.16],[.23,.28,.32],{bevel:.05,category:'wall panels'});addBox('left wall panel above service door',[0,4.8,-3.98],[1.55,1.4,.16],[.23,.28,.32],{bevel:.05,category:'wall panels'});
  addBox('right wall panel west',[-6.3,2.75,3.98],[5.4,5.5,.16],[.23,.28,.32],{bevel:.05,category:'wall panels'});
  addBox('right wall panel east',[6.3,2.75,3.98],[5.4,5.5,.16],[.23,.28,.32],{bevel:.05,category:'wall panels'});
  addBox('ceiling panel',[0,5.48,0],[18,.16,8],[.19,.23,.27],{bevel:.05,category:'ceiling'});
  for(const x of[-7.5,-3.75,0,3.75,7.5])addBox('ceiling lighting recess',[x,5.37,0],[1.85,.08,5.5],[.08,.15,.18],{bevel:.035,category:'lighting recess'});
  for(const x of[-8.55,8.55]){addBox('structural portal frame',[x,2.75,-3.82],[.22,5.35,.18],[.35,.39,.41],{bevel:.04,category:'transitions'});addBox('structural portal frame',[x,2.75,3.82],[.22,5.35,.18],[.35,.39,.41],{bevel:.04,category:'transitions'});addBox('structural portal crown',[x,5.1,0],[.22,.22,7.64],[.35,.39,.41],{bevel:.04,category:'transitions'})}
  // Open downstream intake at -X. Structural trim sits outside the solver domain;
  // the centre remains open so calculated outflow and smoke can pass through.
  for(const z of[-3.83,3.83])addBox('rear intake jamb',[-9.12,2.74,z],[.25,5.34,.23],[.23,.39,.46],{bevel:.035,category:'transitions'});
  for(const y of[.14,5.34])addBox('rear intake sill',[-9.12,y,0],[.25,.24,7.42],[.23,.39,.46],{bevel:.035,category:'transitions'});
  for(const z of[-2.55,-1.28,0,1.28,2.55])addBox('rear intake vertical grille',[-9.21,2.74,z],[.07,4.92,.042],[.20,.31,.37],{bevel:.006,category:'transitions'});
  // M4 replaces the rolling-road blockout after the vehicle has been normalized.
  for(const z of[-1.48,1.48]){addBox('rolling-road rail',[0,.10,z],[6.65,.20,.11],[.38,.43,.46],{bevel:.035,category:'rails'});addBox('rail mounting',[0,.19,z],[.22,.12, .22],[.46,.50,.52],{bevel:.025,category:'equipment mounts'})}
  for(const x of[-2.55,-1.7,-.85,0,.85,1.7,2.55]){addMarker('rail marker L',[x,.22,-1.48],[.05,.04,.16],[.80,.54,.18]);addMarker('rail marker R',[x,.22,1.48],[.05,.04,.16],[.80,.54,.18])}
  // Service door on the right wall; a real opening is represented by separated jamb/lintel members.
  addBox('service door panel',[0,2.0,-3.86],[1.55,3.75,.08],[.29,.34,.37],{bevel:.08,category:'service door'});addBox('service door jamb L',[-.84,2.0,-3.80],[.14,4.1,.32],[.40,.45,.48],{bevel:.04,category:'service door'});addBox('service door jamb R',[.84,2.0,-3.80],[.14,4.1,.32],[.40,.45,.48],{bevel:.04,category:'service door'});addBox('service door header',[0,4.08,-3.80],[1.82,.16,.32],[.40,.45,.48],{bevel:.04,category:'service door'});addBox('service door handle',[.55,2.0,-3.72],[.08,.38,.08],[.74,.58,.20],{bevel:.02,category:'equipment mounts'});
  // Flush maintenance hatch with frame and lift gap.
  addBox('maintenance hatch',[5.7,.075,-2.15],[1.3,.08,1.0],[.28,.33,.36],{bevel:.07,category:'maintenance hatch'});addBox('maintenance hatch frame',[5.7,.12,-2.15],[1.48,.10,1.18],[.40,.45,.48],{bevel:.06,category:'maintenance hatch'});addBox('maintenance hatch frame cutout',[5.7,.18,-2.15],[1.27,.13,.97],[.13,.17,.20],{bevel:.04,category:'maintenance hatch'});
  // Equipment mounting points and cable/service transitions stay sparse and functional.
  for(const x of[-7.2,-4.2,4.2,7.2]){addBox('wall equipment mount',[x,1.15,-3.87],[.42,.32,.08],[.45,.51,.54],{bevel:.035,category:'equipment mounts'});addBox('wall service transition',[x,1.38,-3.78],[.12,.28,.22],[.31,.37,.40],{bevel:.025,category:'transitions'})}
  addBox('control room floor',[0,.70,6.75],[8.5,.10,5.5],[.30,.34,.37],{bevel:.04,category:'control room blockout'});addBox('console',[-3.0,1.16,5.95],[1.8,.82,.70],[.24,.28,.30],{bevel:.06,category:'control room blockout'});addBox('console monitor',[-2.8,1.97,5.75],[.8,.8,.12],[.24,.40,.46],{bevel:.04,category:'control room blockout'});addBox('control room ceiling',[0,3.95,6.75],[8.5,.10,5.5],[.23,.27,.30],{bevel:.04,category:'control room blockout'});const ow={z:3.90,minX:-3.5,maxX:3.5,minY:.95,maxY:3.05};addBox('observation sill',[0,(ow.minY)/2,ow.z],[8.5,ow.minY,.12],[.32,.37,.40],{bevel:.03,category:'observation opening'});addBox('observation top',[0,(ow.maxY+5.5)/2,ow.z],[8.5,5.5-ow.maxY,.12],[.32,.37,.40],{bevel:.03,category:'observation opening'});addBox('observation jamb L',[(ow.minX-4.25)/2,(ow.minY+ow.maxY)/2,ow.z],[.75,ow.maxY-ow.minY,.12],[.32,.37,.40],{bevel:.03,category:'observation opening'});addBox('observation jamb R',[(ow.maxX+4.25)/2,(ow.minY+ow.maxY)/2,ow.z],[.75,ow.maxY-ow.minY,.12],[.32,.37,.40],{bevel:.03,category:'observation opening'});addBox('observation glass',[0,(ow.minY+ow.maxY)/2,ow.z-.07],[7,2.1,.02],[.20,.48,.60],{material:'glass',bevel:.01,category:'observation glass'});return scene}
function buildControlRoom(){
 scene.objects=scene.objects.filter(o=>!o.name.startsWith('m5.'));
 const b=(id,c,s,color=[.30,.34,.37],category='m5 architecture')=>addBox('m5.'+id,c,s,color,{bevel:.015,category});
 const ceiling=scene.objects.find(o=>o.name==='control room ceiling');ceiling.center[1]=4.00;
 // Interior bounds X [-4.10,4.10], Z [4.10,9.35], floor .75, soffit 3.95.
 b('wall.left',[-4.175,2.35,6.725],[.15,3.2,5.25]);
 b('wall.rear',[0,2.35,9.425],[8.5,3.2,.15]);
 // Right doorway Z [7.85,8.95], Y [.75,2.95].
 b('wall.right.front',[4.175,2.35,5.975],[.15,3.2,3.75]);
 b('wall.right.rear',[4.175,2.35,9.15],[.15,3.2,.4]);
 b('door.header',[4.175,3.45,8.4],[.15,1,1.1]);
 b('door.leaf',[4.175,1.85,8.4],[.055,2.18,1.08],[.22,.26,.29]);
 b('door.handle',[4.125,1.72,8.02],[.045,.025,.20],[.55,.57,.58]);
 // External landing and five 150mm rises; access faces away from tunnel.
 b('landing',[4.925,.65,8.4],[1.35,.20,1.5]);
 for(let i=0;i<4;i++)b('step.'+i,[5.75+i*.30,(.60-i*.15)/2,8.4],[.30,.60-i*.15,1.5]);
 for(const z of [7.65,9.15]){b('landing.rail.'+z,[4.925,1.8,z],[1.35,.045,.045]);for(const x of [4.30,5.55])b('landing.post.'+x+'.'+z,[x,1.275,z],[.045,1.05,.045]);}
 for(let i=0;i<8;i++)b('rear.panel.'+i,[-3.57+i*1.02,2.35,9.339],[1.008,2.98,.02],[.36,.39,.41]);
 for(let i=0;i<5;i++)b('left.panel.'+i,[-4.089,2.35,4.62+i*1.04],[.02,2.98,1.028],[.36,.39,.41]);
 b('skirting.rear',[0,.81,9.322],[8.2,.12,.03],[.20,.23,.25]);
 b('skirting.left',[-4.072,.81,6.725],[.035,.12,5.25],[.20,.23,.25]);
 for(const x of [-3,-1.5,0,1.5,3])b('floor.seam.x.'+x,[x,.751,6.725],[.004,.002,5.20],[.20,.24,.27]);
 for(const z of [5.25,6.75,8.25])b('floor.seam.z.'+z,[0,.751,z],[8.15,.002,.004],[.20,.24,.27]);
 for(const x of [-3,-1,1,3])for(const z of [5.2,7,8.8])b('ceiling.joint.'+x+'.'+z,[x,3.948,z],[1.96,.004,.008],[.16,.19,.21],'m5 ceiling');
 for(const x of [-2.4,2.4])for(const z of [5.35,7.95])b('light.'+x+'.'+z,[x,3.935,z],[1.2,.03,.18],[.78,.80,.78],'m5 ceiling');
 for(const x of [-1.4,1.4]){b('hvac.frame.'+x,[x,3.925,8.85],[.8,.05,.35],[.20,.24,.26],'m5 ceiling');for(let i=0;i<7;i++)b('hvac.blade.'+x+'.'+i,[x-.30+i*.1,3.892,8.85],[.035,.016,.29],[.46,.49,.50],'m5 ceiling');}
 b('service.hatch',[0,3.935,7.95],[.60,.025,.60],[.29,.33,.36],'m5 ceiling');
 b('cable.rear',[-1.6,1.03,9.26],[4.8,.12,.12],[.21,.24,.26]);
 b('cable.left',[-4,1.03,7.58],[.12,.12,3.36],[.21,.24,.26]);
 b('cable.console',[-3.51,1.03,5.96],[.98,.12,.12],[.21,.24,.26]);
 for(const x of [-3.55,3.55])b('window.reveal.'+x,[x,2,4],[.10,2.10,.20],[.26,.30,.33]);
 b('window.reveal.top',[0,3.10,4],[7.20,.10,.20],[.26,.30,.33]);
 b('window.reveal.sill',[0,.90,4],[7.20,.10,.20],[.26,.30,.33]);
 // Reserved equipment footprint; no placeholder equipment is presented as a finished asset.
 for(const x of [.8,2.8])b('equipment.mark.x.'+x,[x,.754,8.8],[.015,.003,.80],[.49,.48,.36]);
 for(const z of [8.4,9.2])b('equipment.mark.z.'+z,[1.8,.754,z],[2,.003,.015],[.49,.48,.36]);
 const front=scene.objects.find(o=>o.name==='m5.wall.right.front'),rear=scene.objects.find(o=>o.name==='m5.wall.right.rear');
 const checks={clearHeight:Math.abs(ceiling.center[1]-ceiling.size[1]/2-.75-3.2)<1e-9,doorWidth:rear.center[2]-rear.size[2]/2-(front.center[2]+front.size[2]/2)>=1,uniqueNames:new Set(scene.objects.map(o=>o.name.startsWith('m5.')?o.name:null).filter(Boolean)).size===scene.objects.filter(o=>o.name.startsWith('m5.')).length};
 AETHER.M5={checks,geometryReady:Object.values(checks).every(Boolean),browserVerified:false,visualApproval:'PENDING',productReady:false,equipmentZone:{min:[.8,.75,8.4],max:[2.8,2.75,9.2]},mainAisle:{min:[-3.9,.75,6.3],max:[4.1,2.75,7.9]}};
 const overlaps=(o,z)=>o.center.every((v,i)=>v+o.size[i]/2>z.min[i]+1e-6&&v-o.size[i]/2<z.max[i]-1e-6);
 const fixtures=scene.objects.filter(o=>!o.name.includes('mark.')&&!o.name.includes('floor.seam'));
 checks.aisleWidth=AETHER.M5.mainAisle.max[2]-AETHER.M5.mainAisle.min[2]>=1.2;
 checks.clearAisle=!fixtures.some(o=>overlaps(o,AETHER.M5.mainAisle));
 checks.clearEquipmentZone=!fixtures.some(o=>overlaps(o,AETHER.M5.equipmentZone));
 AETHER.M5.geometryReady=Object.values(checks).every(Boolean);
}
// Surface contract: roughness, metalness, emission, microvariation; base colors are sRGB.
// M9: shared immutable material contracts. Colors on facility meshes are sRGB.
const materialLibrary=Object.freeze(Object.fromEntries(Object.entries({
 PaintedSteelWhite:[.48,0,0,.018],PaintedSteelGray:[.55,0,0,.020],
 BrushedAluminum:[.38,1,0,.035],AnodizedAluminum:[.44,1,0,.020],
 StainlessSteel:[.25,1,0,.015],BlackPowderCoat:[.67,0,0,.026],
 IndustrialRubber:[.88,0,0,.030],EpoxyFloor:[.52,0,0,.025],
 AcousticGlass:[.08,0,0,0],ABSPlastic:[.43,0,0,.012],
 MonitorGlass:[.16,0,.45,0],VehiclePaint:[.27,0,0,0],LabelWhite:[.52,.06,0,.01],IndicatorGreen:[.20,.04,0,.01],IndicatorBlue:[.22,.03,0,.01],IndicatorAmber:[.22,.04,0,.01],SafetyYellow:[.43,.18,0,.01],EmergencyRed:[.30,.02,0,.01],ScreenUI:[.34,.04,0,.01]
}).map(([id,surface])=>[id,Object.freeze({id,surface:Object.freeze(surface)})])));
AETHER.MATERIALS=materialLibrary;
function materialFor(o){
 const n=o.name.toLowerCase(),c=(o.category||'').toLowerCase(); let id;
 if(o.material==='glass')id='AcousticGlass';
 else if(n.includes('screen'))id='MonitorGlass';
 else if(n==='belt'||/seal|cable|caster|tire|rubber/.test(n))id='IndustrialRubber';
 else if(/floor/.test(n))id='EpoxyFloor';
 else if(/bolt|screw|fastener|probe/.test(n))id='StainlessSteel';
 else if(/trim|rail|handle/.test(n+' '+c))id='BrushedAluminum';
 else if(/monitorarm|monitor.arm|rack.frame/.test(n))id='AnodizedAluminum';
 else if(/key|switch|socket|button|chair.seat|chair.back/.test(n))id='ABSPlastic';
 else if(/rack|monitor|vent|grille/.test(n))id='BlackPowderCoat';
 else id=Math.max(...o.color)>.65?'PaintedSteelWhite':'PaintedSteelGray';
 return materialLibrary[id];
}
const ceilingEmitterSurface=Object.freeze([.48,0,1.5,0]);
function surfaceFor(o){return (o.category==='lighting recess'||o.name.startsWith('m5.light.'))?ceilingEmitterSurface:(o.pbrMaterial||materialFor(o)).surface}
function bindM9Materials(){
 const usage={}; for(const o of scene.objects){o.pbrMaterial=o.pbrMaterial||materialFor(o);usage[o.pbrMaterial.id]=(usage[o.pbrMaterial.id]||0)+1;}
 for(const r of scene.roadParts)r.pbrMaterial=materialLibrary.StainlessSteel;
 const finiteSurface=v=>v.length===4&&v.every(Number.isFinite)&&v[0]>=0&&v[0]<=1&&v[1]>=0&&v[1]<=1&&v[2]>=0&&v[3]>=0;
 const checks={nineteenSharedMaterials:Object.keys(materialLibrary).length===19,finiteParameters:Object.values(materialLibrary).every(m=>finiteSurface(m.surface)),completeAssignments:scene.objects.every(o=>materialLibrary[o.pbrMaterial.id]===o.pbrMaterial),roughnessDifferentiation:new Set(Object.values(materialLibrary).map(m=>m.surface[0])).size>=8,vehicleSourcePBR:scene.vehicleParts.every(p=>finiteSurface(p.surface)),noNewTextures:true};
 AETHER.M9={checks,codeReady:Object.values(checks).every(Boolean),usage,brdf:'GGX / Smith / Schlick, metallic-roughness',previousDeviceCheck:{source:'user',result:'No major usage problems reported before M9',scope:'M8 usability, device/browser unspecified'},visualApproval:'PENDING_M9',browserVerified:false,limitations:['M10 environment reflection and lighting not implemented','M9 visual approval requires new device review']};
 if(!AETHER.M9.codeReady)throw Error('M9 material contract failed');
}

const AETHER_CONSOLE_ASSET=window.__ASSETS.AETHER_CONSOLE_ASSET;
// Use the glTF quaternion convention here; the older shared helper has a bad index on two terms.
function consoleNodeMatrix(n){
 if(n.matrix)return Float64Array.from(n.matrix);
 const q=n.rotation||[0,0,0,1],s=n.scale||[1,1,1],t=n.translation||[0,0,0],[x,y,z,w]=q,x2=x+x,y2=y+y,z2=z+z;
 return new Float64Array([
  (1-(y*y2+z*z2))*s[0],(x*y2+w*z2)*s[0],(x*z2-w*y2)*s[0],0,
  (x*y2-w*z2)*s[1],(1-(x*x2+z*z2))*s[1],(y*z2+w*x2)*s[1],0,
  (x*z2+w*y2)*s[2],(y*z2-w*x2)*s[2],(1-(x*x2+y*y2))*s[2],0,
  t[0],t[1],t[2],1
 ]);
}
function assembleEmbeddedConsole(){
 const bytes=bytesFromBase64(AETHER_CONSOLE_ASSET.base64);
 if(bytes.length!==AETHER_CONSOLE_ASSET.bytes||bytes.length<20)throw Error('M6_CONSOLE_GLB_LENGTH');
 const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(dv.getUint32(0,true)!==0x46546c67||dv.getUint32(4,true)!==2||dv.getUint32(8,true)!==bytes.length)throw Error('M6_CONSOLE_GLB_HEADER');
 let cursor=12,json=null,bin=null;
 while(cursor<bytes.length){
  if(cursor+8>bytes.length)throw Error('M6_CONSOLE_GLB_CHUNK');
  const len=dv.getUint32(cursor,true),type=dv.getUint32(cursor+4,true);
  if(len%4||cursor+8+len>bytes.length)throw Error('M6_CONSOLE_GLB_CHUNK');
  const chunk=bytes.subarray(cursor+8,cursor+8+len);
  if(type===0x4e4f534a){if(json)throw Error('M6_CONSOLE_GLB_JSON_DUPLICATE');json=JSON.parse(new TextDecoder().decode(chunk));}
  else if(type===0x4e4942){if(bin)throw Error('M6_CONSOLE_GLB_BIN_DUPLICATE');bin=chunk;}
  cursor+=8+len;
 }
 if(!json||!bin||json.asset?.version!=='2.0'||json.images?.length)throw Error('M6_CONSOLE_GLB_ASSET_CONTRACT');
 const rootIndex=json.nodes.findIndex(n=>n.name==='AETHER_MAIN_CONSOLE_ROOT'),roots=json.scenes[json.scene]?.nodes||[];
 if(rootIndex<0||!roots.includes(rootIndex))throw Error('M6_CONSOLE_ROOT_MISSING');
 const root=json.nodes[rootIndex],extra=root.extras||{},placement=[-2.8,.7475,5.65],cs=0,sn=1;
 const rootTransform=new Float64Array([cs,0,-sn,0,0,1,0,0,sn,0,cs,0,placement[0],placement[1],placement[2],1]);
 const rootWorld=m4mul(rootTransform,consoleNodeMatrix(root)),groups=new Map();
 let sourceMeshes=0,triangles=0,sourceVertices=0;const materialIds=new Set();
 const identity=new Float64Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
 const visit=(ni,parent)=>{
  const node=json.nodes[ni];if(!node)throw Error('M6_CONSOLE_NODE_MISSING');
  const M=m4mul(parent,consoleNodeMatrix(node));
  if(node.mesh!==undefined){
   sourceMeshes++;
   for(const primitive of json.meshes[node.mesh].primitives||[]){
    if(primitive.mode!==undefined&&primitive.mode!==4)throw Error('M6_CONSOLE_NONTRIANGLE_PRIMITIVE');
    const pa=readAccessor(json,bin,primitive.attributes.POSITION),na=primitive.attributes.NORMAL===undefined?null:readAccessor(json,bin,primitive.attributes.NORMAL),ua=primitive.attributes.TEXCOORD_0===undefined?null:readAccessor(json,bin,primitive.attributes.TEXCOORD_0),ia=primitive.indices===undefined?null:readAccessor(json,bin,primitive.indices),material=json.materials[primitive.material??0],pbr=material?.pbrMetallicRoughness||{},materialId=material?.name,screenId=/^AETHER_CONSOLE_SCREEN_(LEFT|MAIN|RIGHT)$/.exec(node.name||'')?.[1]||null,groupKey=screenId?materialId+'::SCREEN_'+screenId:materialId;materialIds.add(materialId);
    if(!materialId||!materialLibrary[materialId]||pbr.baseColorTexture||pa.n!==3||!na||na.n!==3||na.count!==pa.count||ua&&(ua.n!==2||ua.count!==pa.count))throw Error('M6_CONSOLE_MATERIAL_OR_ATTRIBUTE_INVALID');
    const indices=ia?ia.data:Array.from({length:pa.count},(_,i)=>i);
    if(indices.length%3||indices.some(i=>!Number.isInteger(i)||i<0||i>=pa.count))throw Error('M6_CONSOLE_INDEX_INVALID');
    let group=groups.get(groupKey);
    if(!group){group={name:materialId,screenId,color:pbr.baseColorFactor||[.5,.5,.5,1],positions:[],normals:[],uvs:[],indices:[]};groups.set(groupKey,group);}
    const base=group.positions.length/3;
    for(let i=0;i<pa.count;i++){
     const q=m4point(M,[pa.data[i*3],pa.data[i*3+1],pa.data[i*3+2]]);
     // Source GLB geometry is Z-up: convert [x,y,z] -> AETHER [x,-z,y], then yaw +90° about Y.
     const world=[q[1]+placement[0],-q[2]+placement[1],-q[0]+placement[2]];
     let n;try{n=normalMatrix(M,[na.data[i*3],na.data[i*3+1],na.data[i*3+2]])}catch(error){throw Error('M6_CONSOLE_NORMAL_MATRIX '+node.name+' '+error.message+' '+JSON.stringify(Array.from(M.slice(0,12))))}
     const normal=[n[1],-n[2],-n[0]];
     if(!world.every(Number.isFinite)||!normal.every(Number.isFinite)||Math.hypot(...normal)<.9)throw Error('M6_CONSOLE_NONFINITE_ATTRIBUTE');
     group.positions.push(...world);group.normals.push(...normal);const uv=ua?[ua.data[i*2],ua.data[i*2+1]]:[0,0],tile=group.screenId?({LEFT:0,MAIN:1,RIGHT:2}[group.screenId]):null;group.uvs.push(...(tile===null?uv:[(tile+uv[0])/3,uv[1]]));sourceVertices++;
    }
    for(const index of indices)group.indices.push(base+index);
    triangles+=indices.length/3;
   }
  }
  for(const child of node.children||[])visit(child,M);
 };
 visit(rootIndex,identity);
 if(sourceMeshes!==426||triangles!==166598||materialIds.size!==16)throw Error('M6_CONSOLE_SOURCE_TOPOLOGY_MISMATCH');
 const parts=[],allMin=[Infinity,Infinity,Infinity],allMax=[-Infinity,-Infinity,-Infinity];
 for(const [groupKey,g] of groups){const materialId=g.name;
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<g.positions.length;i+=3)for(let d=0;d<3;d++){const v=g.positions[i+d];min[d]=Math.min(min[d],v);max[d]=Math.max(max[d],v);allMin[d]=Math.min(allMin[d],v);allMax[d]=Math.max(allMax[d],v);}
  const size=max.map((v,d)=>Math.max(v-min[d],1e-6)),center=min.map((v,d)=>(v+max[d])/2),mesh={positions:new Float32Array(g.positions),normals:new Float32Array(g.normals),uvs:new Float32Array(g.uvs),indices:new Uint32Array(g.indices)};
  const object={type:'authored-mesh',name:'m6.glb.'+materialId+(g.screenId?'.screen.'+g.screenId.toLowerCase():'' ),center,size,color:g.color.slice(),colorLinear:true,material:'solid',visible:true,bevel:0,category:'m6 console',_mesh:mesh,pbrMaterial:materialLibrary[materialId]};
  scene.objects.push(object);parts.push(object);
 }
 const dimensions=allMax.map((v,i)=>v-allMin[i]);
 const sockets=JSON.parse(extra.AETHER_interaction_sockets_json||'[]').map(s=>{const p=m4point(rootWorld,s.position_m),n=normalMatrix(rootWorld,s.normal_local);return{...s,position:p,normal:n};});
 const screens=JSON.parse(extra.AETHER_screens_json||'[]');
 if(Math.abs(dimensions[0]-2.22)>1e-4||Math.abs(dimensions[1]-1.8825)>1e-4||Math.abs(dimensions[2]-1.2339)>1e-4||Math.abs(allMin[1]-.75)>1e-4||sockets.length!==8||screens.length!==3)throw Error('M6_CONSOLE_WORLD_LAYOUT_MISMATCH '+JSON.stringify({dimensions,min:allMin,max:allMax,sockets:sockets.length,screens:screens.length}));
 const facing=normalMatrix(rootWorld,[-1,0,0]);
 AETHER.M6={geometryReady:true,assetType:'authored embedded GLB; PBR batches with independent monitor faces',assetId:AETHER_CONSOLE_ASSET.assetId,assetSha256:AETHER_CONSOLE_ASSET.sha256,coordinateAdapter:'GLB geometry [X,Y,Z] -> AETHER local [X,-Z,Y], then shared +90deg Y room yaw',authoredGLBEmbedded:true,authoredAssetValidated:true,partCount:parts.length,sourceNodes:json.nodes.length,sourceMeshes,vertices:sourceVertices,triangles,materialCount:materialIds.size,drawCalls:parts.length,textureBytes:0,bounds:{min:allMin,max:allMax},dimensions:{widthX:dimensions[0],heightY:dimensions[1],depthZ:dimensions[2]},sockets,screens,operatorFacing:facing,interactionReady:false,closeUpVerified:false,visualApproval:'PENDING_BROWSER_CLOSE_UP',milestonePass:false};
 return AETHER.M6;
}
function buildMainConsole(){scene.objects=scene.objects.filter(o=>o.name!=='console'&&o.name!=='console monitor'&&!o.name.startsWith('m6.'));assembleEmbeddedConsole();}
function buildObservationBarrier(){
 scene.objects=scene.objects.filter(o=>!o.name.startsWith('m7.'));
 const glass=scene.objects.find(o=>o.name==='observation glass');glass.size=[7,2.1,.024];glass.bevel=.002;glass.color=[.78,.86,.85];glass._mesh=null;
 const part=(id,c,s,color)=>addBox('m7.'+id,c,s,color,{category:'observation opening',bevel:.004});
 // One transparent shell; only its outward-facing optical face is shaded.
 for(const x of [-3.53,3.53])part('frame.side.'+x,[x,2,3.83],[.06,2.22,.16],[.24,.27,.29]);
 for(const y of [.92,3.08])part('frame.cross.'+y,[0,y,3.83],[7,.06,.16],[.24,.27,.29]);
 for(const z of [3.807,3.853]){
  for(const x of [-3.493,3.493])part('seal.side.'+x+'.'+z,[x,2,z],[.014,2.1,.020],[.045,.053,.054]);
  for(const y of [.957,3.043])part('seal.cross.'+y+'.'+z,[0,y,z],[6.972,.014,.020],[.045,.053,.054]);
 }
 for(const x of [-3.484,3.484])part('edge.'+x,[x,2,3.83],[.004,2.072,.024],[.17,.31,.26]);
 for(const x of [-3.53,3.53])for(const y of [1.2,2,2.8])part('fastener.'+x+'.'+y,[x,y,3.914],[.018,.018,.008],[.46,.49,.50]);
 const tests={singleGlass:scene.objects.filter(o=>o.material==='glass').length===1,thickness:Math.abs(glass.size[2]-.024)<1e-9,clearOpening:glass.size[0]===7&&glass.size[1]===2.1,frameCount:scene.objects.filter(o=>o.name.startsWith('m7.frame.')).length===4,sealCount:scene.objects.filter(o=>o.name.startsWith('m7.seal.')).length===8};
 AETHER.M7={geometryReady:Object.values(tests).every(Boolean),checks:tests,opticalModel:'single visible face, Fresnel tint with analytic environment reflection',glassThickness:.024,reflectionAlphaRange:[.06,.22],browserVerified:false,vehicleVisibilityVerified:false,visualApproval:'PENDING'};
}
function validateAuthoredConsoleMesh(m){if(!m||m.positions.length%3||m.normals.length!==m.positions.length||m.uvs.length!==m.positions.length/3*2||m.indices.length%3||!m.positions.every(Number.isFinite)||!m.normals.every(Number.isFinite)||!m.uvs.every(Number.isFinite)||!m.indices.every(i=>Number.isInteger(i)&&i>=0&&i<m.positions.length/3))return false;for(let i=0;i<m.indices.length;i+=3){const a=m.indices[i]*3,b=m.indices[i+1]*3,c=m.indices[i+2]*3,ab=[m.positions[b]-m.positions[a],m.positions[b+1]-m.positions[a+1],m.positions[b+2]-m.positions[a+2]],ac=[m.positions[c]-m.positions[a],m.positions[c+1]-m.positions[a+1],m.positions[c+2]-m.positions[a+2]],q=cross(ab,ac);if(Math.hypot(...q)<1e-12)return false}return true}
function validateEquipmentMeshes(){
 const inspect=prefix=>{const parts=scene.objects.filter(o=>o.name.startsWith(prefix)),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let valid=parts.length>0;for(const o of parts){const m=o._mesh||bevelMesh(o);const mesh=o._mesh;valid=valid&&!!mesh&&mesh.positions.every(Number.isFinite)&&mesh.normals.every(Number.isFinite)&&mesh.indices.every(i=>Number.isInteger(i)&&i>=0&&i<mesh.positions.length/3)&&(prefix==='m6.'?validateAuthoredConsoleMesh(mesh):validateBoxMesh(mesh));if(mesh)for(let i=0;i<mesh.positions.length;i++){min[i%3]=Math.min(min[i%3],mesh.positions[i]);max[i%3]=Math.max(max[i%3],mesh.positions[i]);}}return{valid,parts,bounds:{min,max}}};
 const consoleMesh=inspect('m6.'),equipment=inspect('m8.');
 AETHER.M6.bounds=consoleMesh.bounds;AETHER.M6.partCount=consoleMesh.parts.length;
 AETHER.M6.checks={meshValid:consoleMesh.valid,grounded:Math.abs(consoleMesh.bounds.min[1]-.75)<1e-5,width:Math.abs(consoleMesh.bounds.max[0]-consoleMesh.bounds.min[0]-2.22)<1e-4,sockets:AETHER.M6.sockets.length===8&&AETHER.M6.sockets.every(s=>s.position.every(Number.isFinite)&&s.hitRadiusM>0),threeDisplays:AETHER.M6.screens.length===3,authoredAssetEmbedded:AETHER.M6.authoredGLBEmbedded&&AETHER.M6.authoredAssetValidated};
 AETHER.M6.geometryReady=Object.values(AETHER.M6.checks).every(Boolean);
 const aisle=AETHER.M5.mainAisle;AETHER.M8.checks.meshValid=equipment.valid;AETHER.M8.checks.allEquipmentClearOfAisle=equipment.parts.every(o=>!o.center.every((v,i)=>v+o.size[i]/2>aisle.min[i]+1e-5&&v-o.size[i]/2<aisle.max[i]-1e-5));const consoleAisleIntrusion=Math.max(0,Math.min(consoleMesh.bounds.max[2],aisle.max[2])-aisle.min[2]);AETHER.M8.checks.consoleInterfaceIntrusion=consoleAisleIntrusion<=.025;
 AETHER.M8.geometryReady=Object.values(AETHER.M8.checks).every(Boolean);
 if(!AETHER.M6.geometryReady||!AETHER.M8.geometryReady)throw Error('Equipment geometry validation failed');
}
function buildEquipmentPack(){
 scene.objects=scene.objects.filter(o=>!o.name.startsWith('m8.'));
 const part=(id,p,s,color=[.18,.21,.23],bevel=.008)=>addBox('m8.'+id,p,s,color,{category:'m8 equipment',bevel});
 // Chair stored beside console; main circulation strip Z 6.3..7.9 remains clear.
 const cx=-1.40,cz=5.8;
 part('chair.seat',[cx,1.22,cz],[.50,.09,.48],[.09,.11,.12],.025);
 part('chair.back',[cx,1.57,cz+.22],[.48,.60,.065],[.10,.12,.13],.025);
 part('chair.column',[cx,.995,cz],[.065,.36,.065],[.43,.46,.48]);
 for(const x of [-.26,.26]){part('chair.arm.'+x,[cx+x,1.45,cz],[.055,.055,.37]);part('chair.armSupport.'+x,[cx+x,1.34,cz+.1],[.035,.20,.035]);}
 // Four caster assemblies and crossed base, using a shared dimensional template.
 for(const x of [-.22,.22])for(const z of [-.22,.22]){part('chair.caster.'+x+'.'+z,[cx+x,.79,cz+z],[.07,.08,.09],[.045,.05,.055]);part('chair.fork.'+x+'.'+z,[cx+x,.85,cz+z],[.035,.07,.04],[.35,.38,.4]);}
 part('chair.base.x',[cx,.88,cz],[.52,.04,.06]);part('chair.base.z',[cx,.88,cz],[.06,.04,.52]);
 // Rack is within the M5 reserved area, with clear front service access.
 const rx=1.8,rz=8.80;
 part('rack.left',[rx-.31,1.70,rz],[.035,1.90,.70]);part('rack.right',[rx+.31,1.70,rz],[.035,1.90,.70]);
 part('rack.top',[rx,2.66,rz],[.655,.03,.70]);part('rack.bottom',[rx,.78,rz],[.655,.06,.70]);part('rack.rear',[rx,1.72,rz+.34],[.59,1.84,.02]);
 for(let i=0;i<4;i++){const y=1.0+i*.36;part('rack.module.'+i,[rx,y,rz],[.56,.25,.62],[.26,.29,.31]);part('rack.handle.'+i,[rx-.22,y,rz-.33],[.035,.12,.035],[.44,.46,.47]);for(let j=0;j<6;j++)part('rack.vent.'+i+'.'+j,[rx-.10+j*.05,y,rz-.316],[.018,.14,.004],[.06,.07,.08],.001);}
 part('rack.networkSwitch',[rx,2.46,rz],[.56,.10,.60],[.25,.28,.30]);
 for(let i=0;i<8;i++)part('rack.port.'+i,[rx-.23+i*.065,2.46,rz-.306],[.043,.028,.009],[.035,.04,.045],.002);
 // Replace rigid monitor support with a two-link authored arm in the same footprint.
 scene.objects=scene.objects.filter(o=>o.name!=='m6.monitor.stand');
 /* Monitor arms are supplied by the embedded M6 workstation GLB. */
 const sensors=[];for(const x of [-4.5,4.5]){part('sensor.mount.'+x,[x,1.35,-3.76],[.12,.20,.16],[.37,.40,.42]);part('sensor.housing.'+x,[x,1.42,-3.64],[.16,.13,.08]);part('sensor.probe.'+x,[x,1.42,-3.51],[.025,.025,.20],[.52,.55,.56]);sensors.push({id:'pressure.'+x,position:[x,1.42,-3.41],quantity:'pressure',units:'Pa',connected:false,value:null});}
 AETHER.M6.partCount=scene.objects.filter(o=>o.name.startsWith('m6.')).length;
 const parts=scene.objects.filter(o=>o.name.startsWith('m8.'));
 const aisle=AETHER.M5.mainAisle,overlap=o=>o.center.every((v,i)=>v+o.size[i]/2>aisle.min[i]+1e-6&&v-o.size[i]/2<aisle.max[i]-1e-6);
 const checks={finite:parts.every(o=>o.center.every(Number.isFinite)&&o.size.every(v=>v>0&&Number.isFinite(v))),unique:new Set(parts.map(o=>o.name)).size===parts.length,aisleClear:!parts.some(overlap),floorContact:Math.abs(.79-.08/2-.75)<1e-9};
 AETHER.M8={checks,geometryReady:Object.values(checks).every(Boolean),partCount:parts.length,sensors,reuse:'shared procedural templates; separate GPU meshes',gpuInstancing:false,visualApproval:'PENDING',browserVerified:false};
}
function alignConsoleToAisle(){}
buildScene();buildControlRoom();buildMainConsole();buildObservationBarrier();buildEquipmentPack();alignConsoleToAisle();
function m4mul(a,b){const o=new Float64Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o}function m4point(m,v,w=1){return[m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12]*w,m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13]*w,m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]*w]}
function m4vector(m,v){return m4point(m,v,0)}
function nodeMatrix(n){if(n.matrix)return Float64Array.from(n.matrix);const q=n.rotation||[0,0,0,1],s=n.scale||[1,1,1],t=n.translation||[0,0,0],[x,y,z,w]=q,x2=x+x,y2=y+y,z2=z+z;return new Float64Array([(1-(y*y2+z*z2))*s[0],(x*y2+w*z2)*s[0],(x*z2-w*y2)*s[0],0,(x*y2-w*z2)*s[1],(1-(x*x2+z*z2))*s[1],(y*z2+w*x2)*s[1],0,(x*z2+w*y2)*s[2],(y*z2-w*x2)*s[2],(1-(x*x2+y*y2))*s[2],0,t[0],t[1],t[2],1])}
const VEHICLE_ASSET=window.__ASSETS.VEHICLE_ASSET;
const VEHICLE_PRODUCTION_CONTRACT=Object.freeze({units:'meter',dimensions:Object.freeze({lengthX:4.7,widthZ:1.928297490761,heightY:1.297449006023}),groundY:0,centerlineZ:0,forwardAxis:'-X world',sourceAxisMapping:'source +Y length/forward, +Z up, +X lateral; local +X nose rotated by VehicleTransform to world -X',tolerance:Object.freeze({dimensions:.002,ground:.002,centerline:.002,contact:.002,sourceBounds:1e-6})});
function finiteHash(x){return typeof x==='string'&&/^[0-9a-f]{64}$/i.test(x)}
function within(a,b,t){return Math.abs(a-b)<=t}
function vehicleFrontEvidence(){
 const body=scene.vehicleParts.find(p=>p.role==='body');if(!body)return{verified:false};
 let rearWing=0,frontHood=0,frontBumper=0,windscreen=0;const p=body.positions;
 for(let i=0;i<p.length;i+=3){const x=p[i],y=p[i+1],z=Math.abs(p[i+2]);
  if(x< -1.85&&y>1.10&&z<.85)rearWing++;
  if(x>1.55&&y>.45&&y<.90&&z<.85)frontHood++;
  if(x>2&&y<.80&&z<.85)frontBumper++;
  if(x>.20&&x<1.40&&y>.70&&y<1.25&&z<.80)windscreen++;
 }
 // Signature is specific to the inspected BMW GLB. An unknown replacement
 // needs its own approved local-nose evidence before flow is allowed.
 const verified=VEHICLE_ASSET.sha256==='c4b2072a381f5ee8eb80a6728fc155391d951da8b139fb5a04f410fb61fd7123'
  &&rearWing>500&&frontHood>1000&&frontBumper>1000&&windscreen>1000;
 return{verified,localNose:[1,0,0],rearWing,frontHood,frontBumper,windscreen};
}
function runM11Checks(g){
 const j=g?.json||{},bin=g?.bin,parts=scene.vehicleParts,wheels=wheelParts(),b=boundsForParts(parts,0),
       ext=b.max.map((v,i)=>v-b.min[i]),center=b.min.map((v,i)=>(v+b.max[i])*.5),
       xw=wheels.map(p=>p.wheel.pivot[0]),zw=wheels.map(p=>p.wheel.pivot[2]),
       wheelbase=Math.max(...xw)-Math.min(...xw),track=Math.max(...zw)-Math.min(...zw),
       sourceExt=VEHICLE_ASSET.rawSourceBBoxExtents||[],images=j.images||[],buffersMeta=j.buffers||[],
       expected=VEHICLE_PRODUCTION_CONTRACT.dimensions, tol=VEHICLE_PRODUCTION_CONTRACT.tolerance;
 const checks={
  glbEmbedded:!!bin&&bin.byteLength>0&&typeof VEHICLE_ASSET.base64==='string'&&VEHICLE_ASSET.base64.length>100,
  gltf2:j.asset?.version==='2.0'&&j.scene===0&&Array.isArray(j.scenes)&&j.scenes.length>0,
  noExternalRuntimeUris:!(j.buffers||[]).some(x=>x.uri)&&!(j.images||[]).some(x=>x.uri),
  meshBlocks:j.meshes?.length===VEHICLE_ASSET.sourceMeshBlocks&&j.nodes?.length===VEHICLE_ASSET.sourceObjectBlocks,
  importedPrimitives:parts.length===5&&parts.filter(p=>p.role==='body').length===1&&wheels.length===4,
  sourceBounds:sourceExt.length===3&&diagnostics.vehicleBounds.rawExtents.every((v,i)=>within(v,sourceExt[i],tol.sourceBounds)),
  scaleCorrect:ext.every((v,i)=>within(v,[expected.lengthX,expected.heightY,expected.widthZ][i],tol.dimensions)),
  groundCorrect:within(b.min[1],VEHICLE_PRODUCTION_CONTRACT.groundY,tol.ground)&&within(AETHER.VEHICLE_TRANSFORM.worldAABB.min[1],VEHICLE_PRODUCTION_CONTRACT.groundY,tol.ground),
  centerlineCorrect:within(center[0],0,tol.centerline)&&within(center[2],VEHICLE_PRODUCTION_CONTRACT.centerlineZ,tol.centerline),
  forwardDirection:vehicleFrontEvidence().verified&&AETHER.VEHICLE_TRANSFORM.localToWorld([1,0,0])[0]<AETHER.VEHICLE_TRANSFORM.localToWorld([0,0,0])[0],
  wheelDataExtracted:wheels.length===4&&wheels.every(p=>p.wheel&&finite(p.wheel.radius)&&p.wheel.radius>.24&&p.wheel.radius<.45&&finite(p.wheel.widthZ)&&p.wheel.widthZ>.10&&p.wheel.widthZ<.40&&p.wheel.pivot.every(finite)),
  wheelSpacing:finite(wheelbase)&&finite(track)&&wheelbase>2.2&&wheelbase<3.4&&track>1.2&&track<1.9,
  contactToBelt:!!scene.objects.find(o=>o.name==='belt')&&wheels.every((p,i)=>{const wb=wheelWorldBoundsAt(0,i);return within(wb.min[1],scene.objects.find(o=>o.name==='belt').center[1]+scene.objects.find(o=>o.name==='belt').size[1]/2,tol.contact)}),
  transformAuthority:alignedVehicle()&&AETHER.VEHICLE_TRANSFORM.position.every((v,i)=>v===[0,0,0][i])&&AETHER.VEHICLE_TRANSFORM.scale.every(v=>v===1),
  vehicleHashes:finiteHash(VEHICLE_ASSET.sha256)&&finiteHash(VEHICLE_ASSET.sourceZipSha256)&&finiteHash(VEHICLE_ASSET.diffEmbeddedSha256),
  embeddedTexture:images.length>0&&images.every(im=>!im.uri&&typeof im.bufferView==='number')&&buffersMeta.length>0
 };
 const passed=Object.values(checks).every(Boolean);
 const wheelRecords=wheels.map(p=>({name:p.name,pivot:p.wheel.pivot.slice(),radius:p.wheel.radius,widthZ:p.wheel.widthZ,correctionMax:p.wheel.correctionMax}));
 AETHER.VEHICLE_PRODUCTION=Object.freeze({assetId:VEHICLE_ASSET.sha256,source:VEHICLE_ASSET.name,embedded:checks.glbEmbedded,format:'glTF 2.0 binary embedded in HTML',sourceVersion:'User-provided GLB 2.0',units:'meter',axis:{source:'Y forward / Z up / X lateral',aether:'world -X vehicle nose / +X downstream / +Y up / +Z lateral'},transform:Object.freeze({position:AETHER.VEHICLE_TRANSFORM.position,rotation:AETHER.VEHICLE_TRANSFORM.rotation,scale:AETHER.VEHICLE_TRANSFORM.scale,dimensions:{...AETHER.VEHICLE_TRANSFORM.dimensions},worldBounds:{min:b.min.slice(),max:b.max.slice()},centerlineZ:VEHICLE_PRODUCTION_CONTRACT.centerlineZ,groundY:VEHICLE_PRODUCTION_CONTRACT.groundY}),wheels:Object.freeze(wheelRecords),wheelbase,trackWidth:track,materialPolicy:'embedded source material preserved; M9 BRDF consumes source factors'});
 AETHER.M11={passed,geometryReady:passed,checks,source:{meshBlocks:j.meshes?.length||0,nodeBlocks:j.nodes?.length||0,embeddedBytes:bin?.byteLength||0,textureCount:images.length},transform:{bounds:{min:b.min,max:b.max},extents:ext,center,expected:{lengthX:expected.lengthX,widthZ:expected.widthZ,heightY:expected.heightY},wheelbase,trackWidth:track},wheels:wheelRecords,visualApproval:'PENDING',browserVerified:false,productReady:false,limitations:['M11 source/transform contract verified; new device visual approval remains pending','CFD transform bridge is deferred to M12']};
 diagnostics.vehicleProduction={...AETHER.M11,sourceHash:VEHICLE_ASSET.sha256};
 if(!passed)throw Error('M11 vehicle production integration failed: '+Object.entries(checks).filter(([,v])=>!v).map(([k])=>k).join(','));
 return AETHER.M11;
}
function bytesFromBase64(b64){const raw=atob(b64),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}
function parseGLB(base64=VEHICLE_ASSET.base64){
 const bytes=bytesFromBase64(base64);if(bytes.length<20)throw Error('GLB header truncated');
 const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(dv.getUint32(0,true)!==0x46546c67||dv.getUint32(4,true)!==2)throw Error('Invalid glTF 2.0 header');
 if(dv.getUint32(8,true)!==bytes.length)throw Error('GLB declared length mismatch');
 let p=12,json=null,bin=null;while(p<bytes.length){
  if(p+8>bytes.length)throw Error('GLB chunk header truncated');
  const len=dv.getUint32(p,true),type=dv.getUint32(p+4,true);if(len%4||p+8+len>bytes.length)throw Error('GLB chunk boundary invalid');
  const chunk=bytes.subarray(p+8,p+8+len);
  if(type===0x4e4f534a){if(json||p!==12)throw Error('Invalid GLB JSON order');json=JSON.parse(new TextDecoder().decode(chunk));}
  if(type===0x4e4942){if(bin)throw Error('Duplicate GLB BIN');bin=chunk;}p+=8+len;
 }
 if(!json||!bin||json.asset?.version!=='2.0')throw Error('GLB chunks incomplete');return{bytes,json,bin};
}
function readAccessor(gltf,bin,index){
 const a=gltf.accessors?.[index];if(!a||a.sparse)throw Error('Missing or unsupported sparse accessor '+index);
 const v=gltf.bufferViews?.[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],size={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}[a.componentType];
 if(!v||!n||!size||v.buffer!==0||!Number.isInteger(a.count)||a.count<=0)throw Error('Invalid accessor '+index);
 const off=v.byteOffset||0,local=a.byteOffset||0,stride=v.byteStride||n*size,start=off+local;
 if(![off,local,v.byteLength,stride].every(x=>Number.isInteger(x)&&x>=0)||stride<n*size||stride%size||start%size||off+v.byteLength>bin.length||local+(a.count-1)*stride+n*size>v.byteLength)throw Error('Accessor range invalid '+index);
 const out=new Array(a.count*n),dv=new DataView(bin.buffer,bin.byteOffset,bin.byteLength);
 const read=p=>a.componentType===5126?dv.getFloat32(p,true):a.componentType===5125?dv.getUint32(p,true):a.componentType===5123?dv.getUint16(p,true):a.componentType===5121?dv.getUint8(p):a.componentType===5122?dv.getInt16(p,true):dv.getInt8(p);
 for(let i=0;i<a.count;i++)for(let c=0;c<n;c++){const value=read(start+i*stride+c*size);if(!finite(value))throw Error('Nonfinite accessor '+index);out[i*n+c]=value;}
 if(a.normalized){if(a.componentType===5126)throw Error('Float accessor cannot be normalized');const div={5120:127,5121:255,5122:32767,5123:65535,5125:4294967295}[a.componentType];for(let i=0;i<out.length;i++)out[i]=Math.max(-1,out[i]/div);}
 return{data:out,count:a.count,n};
}
function matMul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o}function perspective(fovy,aspect,n,f){const q=1/Math.tan(fovy*Math.PI/360),nf=1/(n-f);return new Float32Array([q/aspect,0,0,0,0,q,0,0,0,0,(f+n)*nf,-1,0,0,2*f*n*nf,0])}function norm(v){const l=Math.hypot(...v)||1;return v.map(x=>x/l)}function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]}function lookAt(e,t,u){const z=norm(sub(e,t)),x=norm(cross(u,z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,e),-dot(y,e),-dot(z,e),1])}
let gl,program,loc={},buffers=[],textures=[],whiteTexture=null,raf=0,runtimeGeneration=0;const cubeIdx=new Uint16Array([0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,3,2,6,3,6,7,1,5,6,1,6,2,0,3,7,0,7,4]);const vert=`#version 300 es
 in vec3 a_position;in vec3 a_normal;in vec2 a_uv;uniform mat4 u_mvp;uniform mat4 u_model;out vec3 v_normal;out vec2 v_uv;out vec3 v_world;void main(){v_normal=normalize(transpose(inverse(mat3(u_model)))*a_normal);v_uv=a_uv;v_world=(u_model*vec4(a_position,1.0)).xyz;gl_Position=u_mvp*vec4(a_position,1.0);}`;const frag=`#version 300 es
precision highp float;
uniform vec4 u_eye,u_surface,u_color;uniform float u_alpha,u_useTex,u_beltSurface,u_beltTravel,u_rollerSurface,u_colorLinear;uniform sampler2D u_tex;
in vec3 v_normal;in vec2 v_uv;in vec3 v_world;out vec4 outColor;
uniform samplerCube u_env0,u_env1;uniform highp sampler2D u_shadowMap;
uniform mat4 u_lightVP;uniform float u_capture,u_shadowEnabled,u_exposure;
const float PI=3.14159265359;
vec3 linearize(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
vec3 encode(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0)),vec3(1./2.4))-.055,step(vec3(.0031308),c));}
vec3 tonemap(vec3 h){return encode(clamp((h*(2.51*h+.03))/(h*(2.43*h+.59)+.14),0.,1.));}
vec3 boxDirection(vec3 ray,vec3 lo,vec3 hi,vec3 center){
 vec3 safeRay=mix(vec3(-1.),vec3(1.),step(vec3(0.),ray))*max(abs(ray),vec3(.0001));
 vec3 farHit=max((lo-v_world)/safeRay,(hi-v_world)/safeRay);float t=max(0.,min(farHit.x,min(farHit.y,farHit.z)));
 return v_world+ray*t-center;
}
vec3 roomReflection(vec3 ray,float rough){
 if(u_capture>.5)return vec3(0.);
 vec3 a=boxDirection(ray,vec3(-9.,0.,-4.),vec3(9.,5.5,4.),vec3(0.,2.,0.));
 vec3 b=boxDirection(ray,vec3(-4.1,.75,4.),vec3(4.1,4.,9.3),vec3(0.,2.4,7.));
 return mix(textureLod(u_env0,a,rough*7.).rgb,textureLod(u_env1,b,rough*7.).rgb,smoothstep(3.8,4.5,v_world.z))*8.;
}
float shadowVisibility(vec3 n,vec3 l){
 if(u_shadowEnabled<.5)return 1.;vec4 p=u_lightVP*vec4(v_world,1.);vec3 q=p.xyz/p.w*.5+.5;
 if(any(lessThan(q,vec3(0.)))||any(greaterThan(q,vec3(1.))))return 1.;
 vec2 texel=1./vec2(textureSize(u_shadowMap,0));float bias=max(.00022,.0012*(1.-max(dot(n,l),0.))),sum=0.;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++)sum+=step(q.z-bias,texture(u_shadowMap,q.xy+vec2(x,y)*texel).r);
 return sum/9.;
}
void main(){
 vec3 n=normalize(v_normal),v=normalize(u_eye.xyz-v_world);float nv=max(abs(dot(n,v)),.001);
 if(u_alpha<.99){
  if(abs(n.z)<.99)discard;
  // Single optical surface preserves visibility; reflection comes only from facility captures.
  float f=.04+.96*pow(1.-nv,5.);
  vec3 reflected=roomReflection(reflect(-v,n),.08);outColor=vec4(mix(vec3(.65,.77,.73),tonemap(reflected*u_exposure),.8),clamp(.045+f*.18,.045,.225));return;
 }
 vec4 base=u_color;vec3 albedo=mix(linearize(max(base.rgb,vec3(0))),base.rgb,u_colorLinear);
 if(u_useTex>.5){vec4 t=texture(u_tex,v_uv);albedo*=linearize(t.rgb);base.a*=t.a;}
 if(u_beltSurface>.5&&n.y>.99){float q=fract((v_world.x-u_beltTravel)/.5);float aa=max(fwidth(v_world.x),.00025);float seam=1.-smoothstep(.003-aa,.003+aa,min(q,1.-q)*.5);albedo*=1.-seam*.35;}
 if(u_rollerSurface>.5){float mark=1.-smoothstep(0.,.02,min(v_uv.x,1.-v_uv.x));albedo=mix(albedo,linearize(vec3(.62,.68,.72)),mark*.35);}
 float footprint=length(fwidth(v_world));float fade=1.-smoothstep(.002,.02,footprint);
 float grain=sin(v_world.x*183.+sin(v_world.z*31.))*sin(v_world.y*137.+v_world.z*47.);
 float rough=clamp(u_surface.x+grain*u_surface.w*fade,.045,1.),metal=clamp(u_surface.y,0.,1.);
 vec3 l=normalize(vec3(-.2,1.,.12)),h=normalize(l+v);float nl=max(dot(n,l),0.),nh=max(dot(n,h),0.),vh=max(dot(v,h),0.);
 float a=rough*rough,a2=a*a,den=nh*nh*(a2-1.)+1.;float D=a2/max(PI*den*den,.000001);
 float k=(rough+1.)*(rough+1.)/8.;float G=(nv/(nv*(1.-k)+k))*(nl/max(nl*(1.-k)+k,.00001));
 vec3 F0=mix(vec3(.04),albedo,metal),F=F0+(1.-F0)*pow(1.-vh,5.);
 vec3 spec=D*G*F/max(4.*nv*nl,.0001);vec3 diffuse=(1.-F)*(1.-metal)*albedo/PI;
 float hemi=mix(.12,.40,n.y*.5+.5);
 float visibility=shadowVisibility(n,l);
 vec3 white=vec3(1.,.956,.895);
 vec3 hdr=(diffuse+spec)*nl*3.0*visibility*white+albedo*(1.-metal)*hemi*.85*white;
 vec3 envF=F0+(max(vec3(1.-rough),F0)-F0)*pow(1.-nv,5.);
 hdr+=roomReflection(reflect(-v,n),rough)*envF;
 hdr+=albedo*u_surface.z;
 outColor=u_capture>.5?vec4(clamp(hdr/8.,0.,1.),1.):vec4(tonemap(hdr*u_exposure),base.a*u_alpha);
}`;
function bevelMesh(o){
  const [hx,hy,hz]=o.size.map(v=>v/2),b=Math.min(o.bevel,Math.min(hx,hy,hz)*.8),c=o.center,positions=[],normals=[],indices=[];
  const pushVertex=(v,n)=>{positions.push(v[0],v[1],v[2]);normals.push(n[0],n[1],n[2]);return positions.length/3-1};
  const quad=(vs,n)=>{const q=vs.map(v=>pushVertex([c[0]+v[0],c[1]+v[1],c[2]+v[2]],n));indices.push(q[0],q[1],q[2],q[0],q[2],q[3])};
  const tri=(vs,n)=>{const q=vs.map(v=>pushVertex([c[0]+v[0],c[1]+v[1],c[2]+v[2]],n));indices.push(q[0],q[1],q[2])};
  const n3=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l)};
  for(const sx of[-1,1]){quad([[sx*hx,-hy+b,-hz+b],[sx*hx,hy-b,-hz+b],[sx*hx,hy-b,hz-b],[sx*hx,-hy+b,hz-b]],[sx,0,0])}
  for(const sy of[-1,1]){quad([[-hx+b,sy*hy,-hz+b],[hx-b,sy*hy,-hz+b],[hx-b,sy*hy,hz-b],[-hx+b,sy*hy,hz-b]],[0,sy,0])}
  for(const sz of[-1,1]){quad([[-hx+b,-hy+b,sz*hz],[hx-b,-hy+b,sz*hz],[hx-b,hy-b,sz*hz],[-hx+b,hy-b,sz*hz]],[0,0,sz])}
  for(const sx of[-1,1])for(const sy of[-1,1])quad([[sx*hx,sy*(hy-b),-hz+b],[sx*(hx-b),sy*hy,-hz+b],[sx*(hx-b),sy*hy,hz-b],[sx*hx,sy*(hy-b),hz-b]],n3([sx,sy,0]));
  for(const sx of[-1,1])for(const sz of[-1,1])quad([[sx*hx,-hy+b,sz*(hz-b)],[sx*(hx-b),-hy+b,sz*hz],[sx*(hx-b),hy-b,sz*hz],[sx*hx,hy-b,sz*(hz-b)]],n3([sx,0,sz]));
  for(const sy of[-1,1])for(const sz of[-1,1])quad([[-hx+b,sy*hy,sz*(hz-b)],[-hx+b,sy*(hy-b),sz*hz],[hx-b,sy*(hy-b),sz*hz],[hx-b,sy*hy,sz*(hz-b)]],n3([0,sy,sz]));
  for(const sx of[-1,1])for(const sy of[-1,1])for(const sz of[-1,1])tri([[sx*hx,sy*(hy-b),sz*(hz-b)],[sx*(hx-b),sy*hy,sz*(hz-b)],[sx*(hx-b),sy*(hy-b),sz*hz]],n3([sx,sy,sz]));
  for(let k=0;k<indices.length;k+=3){
    const a=indices[k]*3,bb=indices[k+1]*3,cc=indices[k+2]*3;
    const ab=[0,1,2].map(j=>positions[bb+j]-positions[a+j]),ac=[0,1,2].map(j=>positions[cc+j]-positions[a+j]);
    if(dot(cross(ab,ac),normals.slice(a,a+3))<0)[indices[k+1],indices[k+2]]=[indices[k+2],indices[k+1]];
  }
  o._mesh={positions:new Float32Array(positions),normals:new Float32Array(normals),indices:new Uint32Array(indices),topology:{closed:true,coreFaces:6,edgeQuads:12,cornerTriangles:8,faces:26,indexCount:indices.length}};return o._mesh;
}
// M10 owns only illumination resources; camera, geometry and physics remain authoritative.
const M10_SETTINGS=Object.freeze({exposure:1,shadowSize:2048,probeSize:128,probeRange:8,white:[1,.956,.895],probeCenters:[[0,2,0],[0,2.4,7]]});
let lighting=null;
const shadowVert=`#version 300 es
in vec3 a_position;uniform mat4 u_mvp;void main(){gl_Position=u_mvp*vec4(a_position,1.);}`;
const shadowFrag=`#version 300 es
precision highp float;void main(){}`;
function lightingProgram(vsSource,fsSource){
 const shaders=[];const p=gl.createProgram();
 try{for(const [type,src] of [[gl.VERTEX_SHADER,vsSource],[gl.FRAGMENT_SHADER,fsSource]]){const sh=gl.createShader(type);shaders.push(sh);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));gl.attachShader(p,sh);}gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;}
 catch(e){gl.deleteProgram(p);throw e}finally{shaders.forEach(s=>gl.deleteShader(s));}
}
function disposeLighting(lost=false){
 if(!lighting)return;
 if(!lost&&gl){for(const t of lighting.textures)gl.deleteTexture(t);for(const f of lighting.framebuffers)gl.deleteFramebuffer(f);for(const r of lighting.renderbuffers)gl.deleteRenderbuffer(r);if(lighting.depthProgram)gl.deleteProgram(lighting.depthProgram);}
 lighting=null;
}
function lightingFramebufferCheck(label){if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('M10 framebuffer incomplete: '+label)}
function ortho(l,r,b,t,n,f){return new Float32Array([2/(r-l),0,0,0,0,2/(t-b),0,0,0,0,-2/(f-n),0,-(r+l)/(r-l),-(t+b)/(t-b),-(f+n)/(f-n),1])}
function newLightingTexture(){const t=gl.createTexture();if(!t)throw Error('M10 texture allocation');lighting.textures.push(t);return t}
function newLightingFramebuffer(){const f=gl.createFramebuffer();if(!f)throw Error('M10 framebuffer allocation');lighting.framebuffers.push(f);return f}
function cubeTexture(size){
 const t=newLightingTexture();gl.bindTexture(gl.TEXTURE_CUBE_MAP,t);
 for(let f=0;f<6;f++)gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X+f,0,gl.RGBA8,size,size,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
 gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
 for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R])gl.texParameteri(gl.TEXTURE_CUBE_MAP,p,gl.CLAMP_TO_EDGE);
 gl.generateMipmap(gl.TEXTURE_CUBE_MAP);return t;
}
function initLighting(){
 disposeLighting();lighting={textures:[],framebuffers:[],renderbuffers:[],depthProgram:null,shadowKey:null,shadowPasses:0,capturedFaces:0};
 try{
  lighting.shadowSize=Math.min(M10_SETTINGS.shadowSize,gl.getParameter(gl.MAX_TEXTURE_SIZE));
  if(lighting.shadowSize<1024)throw Error('M10 requires shadow texture >= 1024');
  lighting.depthProgram=lightingProgram(shadowVert,shadowFrag);
  lighting.depthPos=gl.getAttribLocation(lighting.depthProgram,'a_position');lighting.depthMVP=gl.getUniformLocation(lighting.depthProgram,'u_mvp');
  const target=[0,0,2.5],direction=norm([-.2,1,.12]),eye=target.map((v,i)=>v+direction[i]*30);
  lighting.lightVP=matMul(ortho(-11,11,-9,9,1,50),lookAt(eye,target,[0,0,-1]));
  lighting.shadow=newLightingTexture();gl.bindTexture(gl.TEXTURE_2D,lighting.shadow);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,lighting.shadowSize,lighting.shadowSize,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
  for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.NEAREST);
  for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);
  lighting.shadowFBO=newLightingFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,lighting.shadowFBO);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,lighting.shadow,0);gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);lightingFramebufferCheck('shadow');
  lighting.dummy=cubeTexture(1);lighting.probes=M10_SETTINGS.probeCenters.map(()=>cubeTexture(M10_SETTINGS.probeSize));
  lighting.probeFBO=newLightingFramebuffer();lighting.probeDepth=gl.createRenderbuffer();lighting.renderbuffers.push(lighting.probeDepth);
  gl.bindRenderbuffer(gl.RENDERBUFFER,lighting.probeDepth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,M10_SETTINGS.probeSize,M10_SETTINGS.probeSize);
  gl.bindFramebuffer(gl.FRAMEBUFFER,lighting.probeFBO);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,lighting.probeDepth);
  for(const name of ['env0','env1','shadowMap','lightVP','capture','shadowEnabled','exposure'])loc[name]=gl.getUniformLocation(program,'u_'+name);
  AETHER.M10={implementationReady:false,exposure:M10_SETTINGS.exposure,whiteBalance:'neutral warm industrial, approximately 4500K',reflection:'two scene-captured box-projected cubemaps',probeResolution:M10_SETTINGS.probeSize,shadowResolution:lighting.shadowSize,externalEnvironment:false,visualApproval:'PENDING',browserVerified:false,limitations:['Cubemap mip blur approximates rough reflections; not GGX-prefiltered IBL','Static facility captures exclude vehicle and transparent surfaces','Overhead directional shadow approximates distributed ceiling fixtures','Device performance and visual review pending']};
  renderLightingShadow(true);captureLightingProbes();AETHER.M10.implementationReady=true;AETHER.M10.capturedFaces=lighting.capturedFaces;
  AETHER.M9.limitations=['M9/M10 device visual approval remains pending'];
  if(AETHER.M7)AETHER.M7.opticalModel='single optical surface, Fresnel tint and scene-captured indoor reflection';
 }catch(e){disposeLighting();throw e}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindRenderbuffer(gl.RENDERBUFFER,null);gl.viewport(0,0,glCanvas.width,glCanvas.height);gl.clearColor(.08,.11,.13,1);gl.activeTexture(gl.TEXTURE0);}
}
function lightingShadowKey(){return JSON.stringify([Array.from(vehicleModel()),rollingState.wheelAngles,rollingState.rollerAngles])}
function renderLightingShadow(force=false){
 if(!lighting)return;const key=lightingShadowKey();if(!force&&key===lighting.shadowKey)return;
 // Unbind sampled depth before it becomes a draw attachment.
 gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,null);gl.activeTexture(gl.TEXTURE0);
 gl.bindFramebuffer(gl.FRAMEBUFFER,lighting.shadowFBO);gl.viewport(0,0,lighting.shadowSize,lighting.shadowSize);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.clear(gl.DEPTH_BUFFER_BIT);gl.useProgram(lighting.depthProgram);
 function depth(mesh,m){gl.uniformMatrix4fv(lighting.depthMVP,false,matMul(lighting.lightVP,m));gl.bindBuffer(gl.ARRAY_BUFFER,mesh.pb);gl.enableVertexAttribArray(lighting.depthPos);gl.vertexAttribPointer(lighting.depthPos,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.ib);gl.drawElements(gl.TRIANGLES,mesh.count,mesh.type,0);}
 const id=identityMatrix();
 // Ceiling fixtures emit below the ceiling: roof/HVAC above fixtures do not occlude them.
 for(const o of scene.objects)if(o.visible&&o.gpu&&o.material!=='glass'&&o.center[1]+o.size[1]/2<3.5)depth(o.gpu,id);
 for(const r of scene.roadParts)if(r.gpu)depth(r.gpu,rollerModel(r,rollingState.rollerAngles[scene.roadParts.indexOf(r)]||0));
 for(const p of scene.vehicleParts)if(p.gpu){const i=wheelParts().indexOf(p);depth(p.gpu,i<0?vehicleModel():wheelModel(p,rollingState.wheelAngles[i]||0));}
 lighting.shadowKey=key;lighting.shadowPasses++;if(AETHER.M10)AETHER.M10.shadowPasses=lighting.shadowPasses;
 gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,glCanvas.width,glCanvas.height);
}
function bindLighting(capture=false){
 gl.uniform1f(loc.capture,capture?1:0);gl.uniform1f(loc.shadowEnabled,1);gl.uniform1f(loc.exposure,M10_SETTINGS.exposure);gl.uniformMatrix4fv(loc.lightVP,false,lighting.lightVP);
 gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_CUBE_MAP,capture?lighting.dummy:lighting.probes[0]);gl.uniform1i(loc.env0,1);
 gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,lighting.shadow);gl.uniform1i(loc.shadowMap,2);
 gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_CUBE_MAP,capture?lighting.dummy:lighting.probes[1]);gl.uniform1i(loc.env1,3);gl.activeTexture(gl.TEXTURE0);
}
function captureLightingProbes(){
 const directions=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],ups=[[0,-1,0],[0,-1,0],[0,0,1],[0,0,-1],[0,-1,0],[0,-1,0]],id=identityMatrix();
 gl.bindFramebuffer(gl.FRAMEBUFFER,lighting.probeFBO);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);gl.readBuffer(gl.COLOR_ATTACHMENT0);gl.viewport(0,0,M10_SETTINGS.probeSize,M10_SETTINGS.probeSize);gl.useProgram(program);bindLighting(true);gl.clearColor(0,0,0,1);
 for(let p=0;p<2;p++){
  const eye=M10_SETTINGS.probeCenters[p];gl.uniform4f(loc.eye,...eye,1);
  for(let f=0;f<6;f++){
   gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_CUBE_MAP_POSITIVE_X+f,lighting.probes[p],0);lightingFramebufferCheck('probe '+p+'/'+f);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
   const target=eye.map((v,i)=>v+directions[f][i]),vp=matMul(perspective(90,1,.05,100),lookAt(eye,target,ups[f]));gl.uniformMatrix4fv(loc.model,false,id);gl.uniformMatrix4fv(loc.mvp,false,vp);
   for(const o of scene.objects)if(o.visible&&o.gpu&&o.material!=='glass')drawMesh(o.gpu,id,{color:lightingColor(o),surface:surfaceFor(o),belt:o.name==='belt',beltTravel:0});
   lighting.capturedFaces++;
  }
 }
 gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.activeTexture(gl.TEXTURE0);
 for(const t of lighting.probes){gl.bindTexture(gl.TEXTURE_CUBE_MAP,t);gl.generateMipmap(gl.TEXTURE_CUBE_MAP);}gl.bindTexture(gl.TEXTURE_CUBE_MAP,null);
}
function lightingColor(o){return o.category==='lighting recess'||o.name.startsWith('m5.light.')?[.95,.935,.91,1]:[...o.color,1]}

const m13SliceVert=`#version 300 es
in vec3 a_position;in vec2 a_uv;uniform mat4 u_mvp;out vec2 v_uv;void main(){v_uv=a_uv;gl_Position=u_mvp*vec4(a_position,1.);}`;
const m13SliceFrag=`#version 300 es
precision highp float;uniform sampler2D u_field;uniform float u_alpha;in vec2 v_uv;out vec4 outColor;void main(){vec4 c=texture(u_field,v_uv);outColor=vec4(c.rgb,c.a*u_alpha);}`;
const m13LineVert=`#version 300 es
in vec3 a_position;in vec4 a_color;in float a_flow;uniform mat4 u_mvp;out vec4 v_color;out float v_flow;void main(){v_color=a_color;v_flow=a_flow;gl_Position=u_mvp*vec4(a_position,1.);}`;
const m13LineFrag=`#version 300 es
precision highp float;in vec4 v_color;in float v_flow;uniform float u_flowTime;uniform float u_flowEnabled;out vec4 outColor;void main(){float phase=mod(v_flow-u_flowTime,1.25);float pulse=(1.0-smoothstep(.06,.20,abs(phase-.10)))*u_flowEnabled;vec3 color=mix(v_color.rgb,vec3(1.0,.96,.72),pulse*.95);outColor=vec4(color,max(v_color.a,pulse*.95));}`;const m13CpVert=`#version 300 es
in vec3 a_position;in float a_cp;uniform mat4 u_mvp;out float v_cp;void main(){v_cp=a_cp;gl_Position=u_mvp*vec4(a_position,1.);}`;const m13CpFrag=`#version 300 es
precision highp float;in float v_cp;uniform float u_cpMin;uniform float u_cpMax;out vec4 outColor;void main(){float q=clamp((v_cp-u_cpMin)/max(u_cpMax-u_cpMin,1e-6),0.0,1.0);outColor=vec4(q,1.0-abs(q-0.5)*2.0,1.0-q,1.0);}`;
function m13Program(vsSource,fsSource){const shaders=[],p=gl.createProgram();try{for(const [type,src] of [[gl.VERTEX_SHADER,vsSource],[gl.FRAGMENT_SHADER,fsSource]]){const sh=gl.createShader(type);shaders.push(sh);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));gl.attachShader(p,sh)}gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p}catch(e){gl.deleteProgram(p);throw e}finally{shaders.forEach(s=>gl.deleteShader(s))}}
function m13ReleaseResources(lost=false){const r=m13FrameState.resources;if(!r.initialized)return;if(!lost&&gl){let deleted=0;for(const b of [r.slicePositionBuffer,r.sliceUvBuffer,r.linePositionBuffer,r.lineColorBuffer,r.lineFlowBuffer,...r.cpBuffers])if(b){gl.deleteBuffer(b);deleted++}if(r.sliceTexture)gl.deleteTexture(r.sliceTexture);if(r.sliceProgram)gl.deleteProgram(r.sliceProgram);if(r.lineProgram)gl.deleteProgram(r.lineProgram);if(r.cpProgram)gl.deleteProgram(r.cpProgram);r.deleteCount=(r.deleteCount||0)+deleted}m13FrameState.resources={...r,initialized:false,sliceProgram:null,lineProgram:null,cpProgram:null,sliceTexture:null,slicePositionBuffer:null,sliceUvBuffer:null,cpBuffers:[],createCount:r.createCount,deleteCount:r.deleteCount,scientificDrawCalls:0,derivedReady:{VECTORS:false,STREAMLINES:false,WAKE:false},linePositionBuffer:null,lineColorBuffer:null,lineFlowBuffer:null,lineCount:0}}
function m13InitResources(){m13ReleaseResources(false);const r=m13FrameState.resources;r.sliceProgram=m13Program(m13SliceVert,m13SliceFrag);r.lineProgram=m13Program(m13LineVert,m13LineFrag);r.cpProgram=m13Program(m13CpVert,m13CpFrag);r.sliceTexture=gl.createTexture();r.createCount++;gl.bindTexture(gl.TEXTURE_2D,r.sliceTexture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,0]));r.initialized=true;r.initCount=(r.initCount||0)+1;m13Sync()}
function m13Color(value,min,max){const q=clamp((value-min)/Math.max(max-min,1e-12),0,1);return[q,Math.min(1,Math.max(0,1.5-Math.abs(q-.5)*3)),1-q,1]}
function m13SliceGeometry(frame){const g=frame.grid,a=m13FrameState.slice.axis,ix='XYZ'.indexOf(a),u=(ix+1)%3,v=(ix+2)%3,pos=m13FrameState.slice.position,lo=[...g.min],hi=[...g.max];lo[ix]=hi[ix]=pos;const p=[lo.slice(),[hi[0],lo[1],lo[2]],[hi[0],hi[1],hi[2]],[lo[0],hi[1],hi[2]]];if(a==='X'){p[0]=[pos,g.min[1],g.min[2]];p[1]=[pos,g.max[1],g.min[2]];p[2]=[pos,g.max[1],g.max[2]];p[3]=[pos,g.min[1],g.max[2]]}else if(a==='Y'){p[0]=[g.min[0],pos,g.min[2]];p[1]=[g.max[0],pos,g.min[2]];p[2]=[g.max[0],pos,g.max[2]];p[3]=[g.min[0],pos,g.max[2]]}else{p[0]=[g.min[0],g.min[1],pos];p[1]=[g.max[0],g.min[1],pos];p[2]=[g.max[0],g.max[1],pos];p[3]=[g.min[0],g.max[1],pos]}return{positions:new Float32Array([...p[0],...p[1],...p[2],...p[0],...p[2],...p[3]]),uvs:new Float32Array([0,0,1,0,1,1,0,0,1,1,0,1])}}
function m13SlicePixels(frame){const g=frame.grid,a=m13FrameState.slice.axis,ix='XYZ'.indexOf(a),u=(ix+1)%3,v=(ix+2)%3,nU=g.resolution[u],nV=g.resolution[v],pixels=new Uint8Array(nU*nV*4),legend=m13FrameState.legend[m13FrameState.slice.quantity==='VELOCITY'?'VELOCITY':m13FrameState.slice.quantity];for(let j=0;j<nV;j++)for(let i=0;i<nU;i++){const q=[0,0,0];q[ix]=m13FrameState.slice.position;q[u]=g.min[u]+(g.max[u]-g.min[u])*(i/Math.max(1,nU-1));q[v]=g.min[v]+(g.max[v]-g.min[v])*(j/Math.max(1,nV-1));let sample=null;if(m13FrameState.slice.quantity==='PRESSURE')sample=m13ScalarSample(frame,frame.fields.pressure,q);else if(m13FrameState.slice.quantity==='VELOCITY')sample=m13VectorSample(frame,frame.fields.velocity,q),sample=sample.available?{available:true,value:m13Magnitude(sample.value)}:sample;else if(m13FrameState.slice.quantity==='VORTICITY'&&frame.fields.vorticity){sample=frame.fields.vorticity.components===1?m13ScalarSample(frame,frame.fields.vorticity,q):m13VectorSample(frame,frame.fields.vorticity,q),sample=sample.available&&frame.fields.vorticity.components===3?{available:true,value:m13Magnitude(sample.value)}:sample}if(sample?.available){const c=m13Color(sample.value,legend.min,legend.max),o=(j*nU+i)*4;pixels[o]=c[0]*255;pixels[o+1]=c[1]*255;pixels[o+2]=c[2]*255;pixels[o+3]=220}}return{pixels,nU,nV}}
function m13BuildSlice(frame){const r=m13FrameState.resources;if(!r.initialized||!r.sliceTexture)return;const q=m13SlicePixels(frame),geo=m13SliceGeometry(frame);if(!r.slicePositionBuffer){r.slicePositionBuffer=gl.createBuffer();r.sliceUvBuffer=gl.createBuffer();r.createCount+=2}gl.bindBuffer(gl.ARRAY_BUFFER,r.slicePositionBuffer);gl.bufferData(gl.ARRAY_BUFFER,geo.positions,gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,r.sliceUvBuffer);gl.bufferData(gl.ARRAY_BUFFER,geo.uvs,gl.STATIC_DRAW);gl.bindTexture(gl.TEXTURE_2D,r.sliceTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,q.nU,q.nV,0,gl.RGBA,gl.UNSIGNED_BYTE,q.pixels);r.slicePixels=q.pixels;r.sliceSize=[q.nU,q.nV];m13Sync()}
function m13UploadLines(pos,col,flow=[]){const r=m13FrameState.resources;r.linePositions=new Float32Array(pos);r.lineColors=new Float32Array(col);r.lineFlow=new Float32Array(flow.length===pos.length/3?flow:new Array(pos.length/3).fill(0));r.lineCount=pos.length/3;if(pos.length){if(!r.linePositionBuffer){r.linePositionBuffer=gl.createBuffer();r.lineColorBuffer=gl.createBuffer();r.lineFlowBuffer=gl.createBuffer();r.createCount+=3}gl.bindBuffer(gl.ARRAY_BUFFER,r.linePositionBuffer);gl.bufferData(gl.ARRAY_BUFFER,r.linePositions,gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,r.lineColorBuffer);gl.bufferData(gl.ARRAY_BUFFER,r.lineColors,gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,r.lineFlowBuffer);gl.bufferData(gl.ARRAY_BUFFER,r.lineFlow,gl.STATIC_DRAW)}}
function m13SolidVoxel(frame,i,j,k){const mask=frame.solidMask?.data,g=frame.grid;if(!mask||mask.length!==g.resolution[0]*g.resolution[1]*g.resolution[2])return false;const [nx,ny,nz]=g.resolution;if(i<0||j<0||k<0||i>=nx||j>=ny||k>=nz)return false;return mask[i+nx*(j+ny*k)]!==0}
function m13SegmentHitsSolid(frame,a,b){const g=frame.grid,mask=frame.solidMask?.data,[nx,ny,nz]=g.resolution,dims=[nx,ny,nz],h=g.max.map((v,i)=>(v-g.min[i])/dims[i]);if(!mask||mask.length!==nx*ny*nz){const bounds=CFD_BRIDGE.getAlignmentReport().solidBounds,lo=a.map((v,i)=>Math.min(v,b[i])),hi=a.map((v,i)=>Math.max(v,b[i]));return lo.every((v,i)=>hi[i]>=bounds.min[i]&&v<=bounds.max[i])}const qa=a.map((v,i)=>(v-g.min[i])/h[i]),qb=b.map((v,i)=>(v-g.min[i])/h[i]),delta=qb.map((v,i)=>v-qa[i]),cell=q=>q.map((v,i)=>Math.max(0,Math.min(dims[i]-1,Math.floor(v))));let c=cell(qa);const solid=q=>m13SolidVoxel(frame,q[0],q[1],q[2]);if(solid(c))return true;const step=delta.map(v=>v>0?1:v<0?-1:0),tMax=[0,1,2].map(i=>step[i]===0?Infinity:(((step[i]>0?c[i]+1:c[i])-qa[i])/delta[i])),tDelta=[0,1,2].map(i=>step[i]===0?Infinity:Math.abs(1/delta[i]));for(let count=0;count<nx+ny+nz+3;count++){const t=Math.min(...tMax);if(t>1||!Number.isFinite(t))break;const axes=[0,1,2].filter(i=>Math.abs(tMax[i]-t)<1e-10);for(let bits=1;bits<(1<<axes.length);bits++){const q=c.slice();for(let n=0;n<axes.length;n++)if(bits&(1<<n))q[axes[n]]+=step[axes[n]];if(solid(q))return true}for(const i of axes){c[i]+=step[i];tMax[i]+=tDelta[i]}if(c.some((v,i)=>v<0||v>=dims[i]))break;}return false}
function m13Streamline(frame,seed){const out=[seed.slice()],h=Math.min(...frame.grid.max.map((v,i)=>(v-frame.grid.min[i])/frame.grid.resolution[i]))*.55,maxSteps=256;let p=seed.slice(),reason='MAX_STEPS';for(let i=0;i<maxSteps;i++){const a=m13VectorSample(frame,frame.fields.velocity,p),ma=a.available?m13Magnitude(a.value):0;if(!a.available){reason='DOMAIN_EXIT';break}if(ma<1e-8){reason='NEAR_ZERO';break}const d1=a.value.map(x=>x/ma),mid=p.map((x,j)=>x+d1[j]*h*.5),b=m13VectorSample(frame,frame.fields.velocity,mid),mb=b.available?m13Magnitude(b.value):0;if(!b.available){reason='DOMAIN_EXIT';break}if(mb<1e-8){reason='NEAR_ZERO';break}const d2=b.value.map(x=>x/mb),n=p.map((x,j)=>x+d2[j]*h);if(!m13SampleCoordinate(frame,n)){reason='DOMAIN_EXIT';break}if(m13SegmentHitsSolid(frame,p,n)){reason='SOLID_VOXEL_HIT';break}out.push(n);p=n}m13Streamline.lastReason=reason;return out.length>=2?out:[]}
function m13BuildVectors(frame){const g=frame.grid,stride=m13FrameState.quality==='high'?Math.max(1,Math.floor(Math.min(...g.resolution)/18)):Math.max(1,Math.floor(Math.min(...g.resolution)/12)),pos=[],col=[];for(let z=0;z<g.resolution[2];z+=stride)for(let y=0;y<g.resolution[1];y+=stride)for(let x=0;x<g.resolution[0];x+=stride){const p=[g.min[0]+(g.max[0]-g.min[0])*x/Math.max(1,g.resolution[0]-1),g.min[1]+(g.max[1]-g.min[1])*y/Math.max(1,g.resolution[1]-1),g.min[2]+(g.max[2]-g.min[2])*z/Math.max(1,g.resolution[2]-1)],s=m13VectorSample(frame,frame.fields.velocity,p),m=s.available?m13Magnitude(s.value):0;if(!s.available||m<1e-8)continue;const len=Math.min(.45,.08+m*.01),q=p.map((v,i)=>v+s.value[i]/m*len),c=m13Color(m,m13FrameState.legend.VELOCITY.min,m13FrameState.legend.VELOCITY.max);pos.push(...p,...q);col.push(...c,...c)}m13UploadLines(pos,col);m13FrameState.resources.derivedReady.VECTORS=pos.length>0;m13FrameState.resources.vectorStats={segments:pos.length/6,samplingStride:stride};m13Sync()}
function m13BuildStreamlines(frame){const b=CFD_BRIDGE.getAlignmentReport().solidBounds,g=frame.grid,n=m13FrameState.streamlineDensity||64,mid=(b.min[1]+b.max[1])*.5,weights={front:12,roof:12,side:16,wheel:8,underbody:8,wake:8},names=Object.keys(weights),alloc=Object.fromEntries(names.map(k=>[k,Math.floor(n*weights[k]/64)]));let remain=n-Object.values(alloc).reduce((a,x)=>a+x,0);for(const k of names)if(remain-->0)alloc[k]++;const lerpSeeds=(count,make)=>Array.from({length:count},(_,i)=>make((i+.5)/Math.max(1,count),i)),wheelSeeds=wheelParts().slice(0,4).flatMap(w=>{const q=w.wheel.pivot,side=Math.sign(q[2]||1);return [[q[0]-.8,q[1]+w.wheel.radius+.35,q[2]+side*.3],[q[0]-.8,q[1]+w.wheel.radius+.35,q[2]+side*.55]]});const groups={front:lerpSeeds(alloc.front,(t)=>[g.min[0]+.15,mid,b.min[2]+(b.max[2]-b.min[2])*t]),roof:lerpSeeds(alloc.roof,(t)=>[b.min[0]+(b.max[0]-b.min[0])*t,b.max[1]+.12,-.65*b.max[2]+1.3*b.max[2]*((t*7)%1)]),side:Array.from({length:alloc.side},(_,i)=>{const half=Math.ceil(alloc.side/2),side=i<half?1:-1,j=i%half,t=(j+.5)/half;return[b.min[0]+(b.max[0]-b.min[0])*t,mid,side*(b.max[2]+.10)]}),wheel:Array.from({length:alloc.wheel},(_,i)=>wheelSeeds[i%wheelSeeds.length]),underbody:lerpSeeds(alloc.underbody,(t)=>[g.min[0]+.15,b.min[1]+.15,-.65*b.max[2]+1.3*b.max[2]*((t*7)%1)]),wake:lerpSeeds(alloc.wake,(t)=>[Math.min(g.max[0]-.15,b.max[0]+.5),g.min[1]+.45+(g.max[1]-g.min[1]-.9)*t,-.8*g.max[2]+1.6*g.max[2]*((t*5)%1)])},pos=[],col=[],flow=[],counts={},visible={};for(const [name,seeds] of Object.entries(groups)){counts[name]=seeds.length;visible[name]=0;for(const seed of seeds){const line=m13Streamline(frame,seed);if(line.length>1)visible[name]++;let distance=0;for(let i=1;i<line.length;i++){distance+=Math.hypot(...line[i].map((v,j)=>v-line[i-1][j]));const sm=m13VectorSample(frame,frame.fields.velocity,line[i]),c=m13Color(sm.available?m13Magnitude(sm.value):0,m13FrameState.legend.VELOCITY.min,m13FrameState.legend.VELOCITY.max);pos.push(...line[i-1],...line[i]);col.push(...c,...c);flow.push(distance-Math.hypot(...line[i].map((v,j)=>v-line[i-1][j])),distance)}}}m13UploadLines(pos,col,flow);m13FrameState.resources.derivedReady.STREAMLINES=pos.length>0;m13FrameState.resources.streamlineStats={seedGroups:6,seedCount:n,groups:counts,groupVisible:visible,segments:pos.length/6,maxSegmentsPerLine:256,solidCollision:frame.solidMask?'GRID_VOXEL_TRAVERSAL':'MASK_UNAVAILABLE'};m13Sync();}
function m13BuildWake(frame){const g=frame.grid,planes=m13WakePlanes(frame),pos=[],col=[],stats=[],minDef={v:Infinity},maxDef={v:-Infinity},sy=Math.max(1,Math.floor(g.resolution[1]/12)),sz=Math.max(1,Math.floor(g.resolution[2]/12)),speed=m13Magnitude(frame.freestream.velocity);for(const plane of planes){if(plane.status!=='AVAILABLE'){stats.push({...plane,samples:0,meanDeficit:null});continue}const rows=[];let sum=0,count=0;for(let y=0;y<g.resolution[1];y+=sy){rows[y]=[];for(let z=0;z<g.resolution[2];z+=sz){const p=[plane.x,g.min[1]+(g.max[1]-g.min[1])*y/Math.max(1,g.resolution[1]-1),g.min[2]+(g.max[2]-g.min[2])*z/Math.max(1,g.resolution[2]-1)],sm=m13VectorSample(frame,frame.fields.velocity,p),d=sm.available?Math.max(0,speed-m13Magnitude(sm.value)):null;rows[y][z]={p,d};if(d!==null){sum+=d;count++;minDef.v=Math.min(minDef.v,d);maxDef.v=Math.max(maxDef.v,d)}}}for(let y=0;y<g.resolution[1];y+=sy)for(let z=0;z<g.resolution[2];z+=sz){const q=rows[y]?.[z];if(!q||q.d===null)continue;const c=m13Color(q.d,0,Math.max(1,speed));if(z+sz<g.resolution[2]&&rows[y]?.[z+sz]?.d!==null){pos.push(...q.p,...rows[y][z+sz].p);col.push(...c,...c)}if(y+sy<g.resolution[1]&&rows[y+sy]?.[z]?.d!==null){pos.push(...q.p,...rows[y+sy][z].p);col.push(...c,...c)}}stats.push({...plane,samples:count,meanDeficit:count?sum/count:null,gridStep:[sy,sz]})}const wakeReady=pos.length>0&&stats.some(p=>p.status==='AVAILABLE')&&finite(minDef.v)&&finite(maxDef.v);if(wakeReady)m13LegendSet('WAKE',minDef.v,maxDef.v,frame.sourceId);m13UploadLines(pos,col);m13FrameState.resources.derivedReady.WAKE=wakeReady;m13FrameState.resources.wakeStats={planes:stats,quantity:'velocity deficit',pressure:true,vorticity:!!frame.fields.vorticity};m13FrameState.resources.lineCount=pos.length/3;m13Sync();}
function m13BuildLines(frame){if(m13FrameState.mode==='VECTORS')m13BuildVectors(frame);else if(m13FrameState.mode==='STREAMLINES')m13BuildStreamlines(frame);else if(m13FrameState.mode==='WAKE')m13BuildWake(frame)}
function m13PrepareDerived(){const f=m13FrameState.frame;if(!f||!m13FrameState.resources.initialized)return;if(['PRESSURE','VELOCITY','VORTICITY','SLICE'].includes(m13FrameState.mode))m13BuildSlice(f);if(['VECTORS','STREAMLINES','WAKE'].includes(m13FrameState.mode))m13BuildLines(f)}
function m13PrepareCp(){const f=m13FrameState.frame;if(!f||!m13CpReady(f)||!m13FrameState.resources.initialized)return;const r=m13FrameState.resources;const parts=CFD_BRIDGE.getSolidParts();while(r.cpBuffers.length<parts.length){r.cpBuffers.push(gl.createBuffer());r.createCount++}for(let i=0;i<parts.length;i++){gl.bindBuffer(gl.ARRAY_BUFFER,r.cpBuffers[i]);gl.bufferData(gl.ARRAY_BUFFER,m13FrameState.cp.parts[i],gl.STATIC_DRAW)}}function m13DrawCp(vp){const r=m13FrameState.resources;if(!r.cpProgram||!r.cpBuffers.length)return;gl.useProgram(r.cpProgram);const ap=gl.getAttribLocation(r.cpProgram,'a_position'),ac=gl.getAttribLocation(r.cpProgram,'a_cp'),um=gl.getUniformLocation(r.cpProgram,'u_mvp'),umin=gl.getUniformLocation(r.cpProgram,'u_cpMin'),umax=gl.getUniformLocation(r.cpProgram,'u_cpMax');const cpLegend=m13FrameState.legend.CP;const parts=CFD_BRIDGE.getSolidParts();for(let i=0;i<scene.vehicleParts.length;i++){const p=scene.vehicleParts[i],d=parts[i],idx=p.role==='wheel'?wheelParts().indexOf(p):-1,pm=p.role==='wheel'?wheelModel(p,rollingState.wheelAngles[idx]||0):vehicleModel();if(!p.gpu)continue;gl.bindBuffer(gl.ARRAY_BUFFER,p.gpu.pb);gl.enableVertexAttribArray(ap);gl.vertexAttribPointer(ap,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,r.cpBuffers[i]);gl.enableVertexAttribArray(ac);gl.vertexAttribPointer(ac,1,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,p.gpu.ib);gl.uniform1f(umin,cpLegend.min);gl.uniform1f(umax,cpLegend.max);gl.uniformMatrix4fv(um,false,matMul(vp,pm));gl.drawElements(gl.TRIANGLES,p.gpu.count,p.gpu.type,0);r.scientificDrawCalls++}}
function m13FlowElapsed(){return m13FrameState.flowOffset+(m13FrameState.flowPlaying?(performance.now()-m13FrameState.flowEpoch)/1000*m13FrameState.flowSpeed:0)}
function m13DrawOverlay(vp){const r=m13FrameState.resources,f=m13FrameState.frame;if(!r.initialized||!f||!m13FrameState.visible||m13FrameState.mode==='NONE')return;if(['PRESSURE','VELOCITY','VORTICITY','SLICE'].includes(m13FrameState.mode)){if(!r.slicePositionBuffer||!r.sliceUvBuffer||!r.slicePixels)return;gl.useProgram(r.sliceProgram);gl.bindBuffer(gl.ARRAY_BUFFER,r.slicePositionBuffer);const ap=gl.getAttribLocation(r.sliceProgram,'a_position'),au=gl.getAttribLocation(r.sliceProgram,'a_uv');gl.enableVertexAttribArray(ap);gl.vertexAttribPointer(ap,3,gl.FLOAT,false,0,0);gl.enableVertexAttribArray(au);gl.bindBuffer(gl.ARRAY_BUFFER,r.sliceUvBuffer);gl.vertexAttribPointer(au,2,gl.FLOAT,false,0,0);gl.uniformMatrix4fv(gl.getUniformLocation(r.sliceProgram,'u_mvp'),false,vp);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,r.sliceTexture);gl.uniform1i(gl.getUniformLocation(r.sliceProgram,'u_field'),0);gl.uniform1f(gl.getUniformLocation(r.sliceProgram,'u_alpha'),.55);gl.drawArrays(gl.TRIANGLES,0,6);r.scientificDrawCalls++}else if(['VECTORS','STREAMLINES','WAKE'].includes(m13FrameState.mode)){if(!r.linePositionBuffer)return;gl.useProgram(r.lineProgram);gl.bindBuffer(gl.ARRAY_BUFFER,r.linePositionBuffer);const ap=gl.getAttribLocation(r.lineProgram,'a_position');gl.enableVertexAttribArray(ap);gl.vertexAttribPointer(ap,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,r.lineColorBuffer);const ac=gl.getAttribLocation(r.lineProgram,'a_color');gl.enableVertexAttribArray(ac);gl.vertexAttribPointer(ac,4,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,r.lineFlowBuffer);const af=gl.getAttribLocation(r.lineProgram,'a_flow');gl.enableVertexAttribArray(af);gl.vertexAttribPointer(af,1,gl.FLOAT,false,0,0);gl.uniformMatrix4fv(gl.getUniformLocation(r.lineProgram,'u_mvp'),false,vp);gl.uniform1f(gl.getUniformLocation(r.lineProgram,'u_flowTime'),m13FlowElapsed());gl.uniform1f(gl.getUniformLocation(r.lineProgram,'u_flowEnabled'),m13FrameState.mode==='STREAMLINES'?1:0);gl.drawArrays(gl.LINES,0,r.lineCount);r.scientificDrawCalls++} }
function initGL(){try{gl=glCanvas.getContext('webgl2',{antialias:true,alpha:false,depth:true});baseline.runtime.webGL2Exposed=!!gl;if(!gl)throw Error('WebGL2 unavailable');const vs=gl.createShader(gl.VERTEX_SHADER),fs=gl.createShader(gl.FRAGMENT_SHADER);gl.shaderSource(vs,vert);gl.compileShader(vs);if(!gl.getShaderParameter(vs,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(vs));gl.shaderSource(fs,frag);gl.compileShader(fs);if(!gl.getShaderParameter(fs,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(fs));program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));loc={colorLinear:gl.getUniformLocation(program,'u_colorLinear'),surface:gl.getUniformLocation(program,'u_surface'),eye:gl.getUniformLocation(program,'u_eye'),pos:gl.getAttribLocation(program,'a_position'),normal:gl.getAttribLocation(program,'a_normal'),uv:gl.getAttribLocation(program,'a_uv'),mvp:gl.getUniformLocation(program,'u_mvp'),model:gl.getUniformLocation(program,'u_model'),color:gl.getUniformLocation(program,'u_color'),alpha:gl.getUniformLocation(program,'u_alpha'),tex:gl.getUniformLocation(program,'u_tex'),useTex:gl.getUniformLocation(program,'u_useTex'),beltSurface:gl.getUniformLocation(program,'u_beltSurface'),beltTravel:gl.getUniformLocation(program,'u_beltTravel'),rollerSurface:gl.getUniformLocation(program,'u_rollerSurface')};gl.deleteShader(vs);gl.deleteShader(fs);
whiteTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,whiteTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);m13InitResources();gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.clearColor(.08,.11,.13,1);resize();gl.viewport(0,0,glCanvas.width,glCanvas.height);return true}catch(e){diagnostics.error('WebGL2 renderer',e);return false}}
function resize(){if(!gl)return;const d=clamp(devicePixelRatio||1,1,renderQuality==='high'?2:1)*((window.__LIVE&&window.__LIVE.cs)||1),w=Math.max(1,Math.floor(glCanvas.clientWidth*d)),h=Math.max(1,Math.floor(glCanvas.clientHeight*d));if(glCanvas.width!==w||glCanvas.height!==h){glCanvas.width=w;glCanvas.height=h;gl.viewport(0,0,w,h);diagnostics.events.push({time:now(),type:'RESIZE',message:w+'x'+h})}}
let renderQuality='high';document.getElementById('qualityMode').addEventListener('click',()=>{renderQuality=renderQuality==='high'?'balanced':'high';m13FrameState.quality=renderQuality;document.getElementById('qualityMode').textContent='화질: '+(renderQuality==='high'?'고화질':'균형')});const scientificModeEl=document.getElementById('scientificMode');if(scientificModeEl)scientificModeEl.addEventListener('change',e=>{m13PublicApi.setMode(e.target.value);});const streamDensityEl=document.getElementById('streamDensity'),streamDensityValue=document.getElementById('streamDensityValue'),streamSpeedEl=document.getElementById('streamSpeed'),streamSpeedValue=document.getElementById('streamSpeedValue'),streamPlaybackEl=document.getElementById('streamPlayback');if(streamDensityEl)streamDensityEl.addEventListener('input',e=>{m13FrameState.streamlineDensity=Number(e.target.value);if(streamDensityValue)streamDensityValue.textContent=String(m13FrameState.streamlineDensity);if(m13FrameState.mode==='STREAMLINES')m13PrepareDerived()});if(streamSpeedEl)streamSpeedEl.addEventListener('input',e=>{m13FrameState.flowOffset=m13FlowElapsed();m13FrameState.flowEpoch=performance.now();m13FrameState.flowSpeed=Number(e.target.value);if(streamSpeedValue)streamSpeedValue.textContent=m13FrameState.flowSpeed.toFixed(2)+'×';m13Sync()});if(streamPlaybackEl)streamPlaybackEl.addEventListener('click',()=>{if(m13FrameState.flowPlaying)m13FrameState.flowOffset=m13FlowElapsed();m13FrameState.flowEpoch=performance.now();m13FrameState.flowPlaying=!m13FrameState.flowPlaying;streamPlaybackEl.textContent=m13FrameState.flowPlaying?'표식 애니메이션 일시정지':'표식 애니메이션 재개';streamPlaybackEl.setAttribute?.('aria-pressed',String(m13FrameState.flowPlaying));m13Sync()});
const fpv={enabled:true,x:0,z:7.5,yaw:0,pitch:-.08,vx:0,vz:0,last:null,phase:0,sway:true,keys:new Set(),stick:[0,0],look:null};
function clearWalk(){joyId=null;fpv.keys.clear();fpv.stick=[0,0];fpv.vx=fpv.vz=0;fpv.last=null;fpv.look=null;document.getElementById('stick').style.transform='translate(0px,0px)'}
function startWalk(){clearWalk();fpv.enabled=true;fpv.x=0;fpv.z=7.5;fpv.gy=undefined;fpv.yaw=0;fpv.pitch=-.08;camera.preset='FPV';camera.cutaway=false;camera.fov=72;camera.up=[0,1,0];document.getElementById('viewName').textContent='FPV · 관제실';document.getElementById('viewHint').textContent='눈높이 1.65m · 보행 속도 1.6m/s';document.getElementById('cutaway').textContent='Cutaway: Off'}
const DOOR={x0:2.3,x1:3.5,y0:.75,y1:2.95,zPanel:4.13,N:12,t:0,built:false,landZ:3.72,steps:4,rise:.15,tread:.30};
function doorBuild(){if(DOOR.built||scene.objects.some(o=>o.name.startsWith('door.')))return;const {x0,x1}=DOOR,shift=3.5-x0,add=[],drop=new Set();
 DOOR.report=[];for(const o of scene.objects){const lo=o.center.map((v,i)=>v-o.size[i]/2),hi=o.center.map((v,i)=>v+o.size[i]/2);
  if(hi[2]<=3.70||lo[2]>=4.12)continue;const cuttable=o.name.startsWith('m7.')||o.name.startsWith('m5.window')||o.category==='observation opening'||o.category==='observation glass';if(!cuttable){if(hi[1]>DOOR.y0+.12&&lo[1]<DOOR.y1&&hi[0]>x0&&lo[0]<x1)DOOR.report.push(o.name);continue}
  if(o.name.startsWith('m7.')&&o.center[0]>3.4&&o.size[0]<.2){o.center=[o.center[0]-shift,o.center[1],o.center[2]];o._mesh=null;continue}
  if(hi[1]<=0||lo[1]>=DOOR.y1)continue;if(hi[0]<=x0+1e-6||lo[0]>=x1-1e-6)continue;
  if(lo[0]<x0&&hi[0]>x0){const right=hi[0]-x1;o.size=[x0-lo[0],o.size[1],o.size[2]];o.center=[(lo[0]+x0)/2,o.center[1],o.center[2]];o._mesh=null;o.bevel=Math.min(o.bevel,Math.min(...o.size)/4);
   if(right>.005&&o.material!=='glass'&&!o.name.startsWith('m7.'))add.push({name:o.name+' east',center:[(x1+hi[0])/2,o.center[1],o.center[2]],size:[right,o.size[1],o.size[2]],color:o.color,opt:{material:o.material,bevel:Math.min(o.bevel,right/4),category:o.category}});}
  else drop.add(o);}
 scene.objects=scene.objects.filter(o=>!drop.has(o));for(const a of add)addBox(a.name,a.center,a.size,a.color,a.opt);
 const B=(n,c,s,col,opt={})=>addBox('door.'+n,c,s,col,{bevel:.01,category:'door',...opt}),mid=(x0+x1)/2,w=x1-x0;
 B('landing',[mid,DOOR.y0/2,(DOOR.landZ+4.12)/2],[w,DOOR.y0,4.12-DOOR.landZ],[.22,.25,.28]);
 B('landing.nosing',[mid,DOOR.y0+.004,DOOR.landZ+.03],[w,.008,.06],[.85,.72,.15]);
 for(let i=0;i<DOOR.steps;i++){const top=DOOR.y0-DOOR.rise*(i+1),z1=DOOR.landZ-DOOR.tread*i,z0=z1-DOOR.tread;B('step.'+i,[mid,top/2,(z0+z1)/2],[w,top,DOOR.tread],[.22,.25,.28]);B('step.nosing.'+i,[mid,top+.004,z1-.03],[w,.008,.06],[.85,.72,.15]);}
 const zEnd=DOOR.landZ-DOOR.tread*DOOR.steps;
 for(const x of [x0+.03,x1-.03]){B('rail.'+x,[x,1.05,(zEnd+DOOR.landZ)/2+.2],[.04,.04,DOOR.landZ-zEnd+.4],[.62,.66,.68]);for(const z of [zEnd+.1,DOOR.landZ])B('post.'+x+'.'+z,[x,(.15+1.05)/2+(z-zEnd)/(DOOR.landZ-zEnd)*.3,z],[.04,.9,.04],[.62,.66,.68]);}
 B('header',[mid,(DOOR.y1+3.05)/2,3.90],[w,3.05-DOOR.y1,.26],[.24,.27,.29]);
 B('track',[mid-.55,DOOR.y1+.04,DOOR.zPanel],[w+1.3,.08,.06],[.55,.58,.60]);
 DOOR.light=B('light',[x1-.12,DOOR.y1+.13,DOOR.zPanel+.02],[.12,.05,.02],[.9,.2,.15]);
 B('sign',[mid,DOOR.y1+.13,DOOR.zPanel+.02],[.5,.1,.012],[.08,.35,.2]);
 DOOR.frames=[];for(let k=0;k<DOOR.N;k++){const cx=mid-(w-.12)*k/(DOOR.N-1),vis=k===0,f=[];
  f.push(B('panel.'+k,[cx,(DOOR.y0+DOOR.y1)/2,DOOR.zPanel],[w-.06,DOOR.y1-DOOR.y0-.04,.02],[.70,.82,.86],{material:'glass',visible:vis,bevel:.002}));
  for(const dx of [-(w-.06)/2,(w-.06)/2])f.push(B('stile.'+k+'.'+dx.toFixed(2),[cx+dx,(DOOR.y0+DOOR.y1)/2,DOOR.zPanel],[.05,DOOR.y1-DOOR.y0-.02,.05],[.30,.33,.35],{visible:vis}));
  for(const y of [DOOR.y0+.03,DOOR.y1-.03])f.push(B('rail.'+k+'.'+y,[cx,y,DOOR.zPanel],[w-.06,.05,.05],[.30,.33,.35],{visible:vis}));
  f.push(B('handle.'+k,[cx+(w-.06)/2-.12,1.75,DOOR.zPanel+.05],[.03,.45,.03],[.72,.75,.77],{visible:vis}));DOOR.frames.push(f)}
 DOOR.built=true}
window.__doorPlace=()=>{fpv.x=(DOOR.x0+DOOR.x1)/2;fpv.z=5.6;fpv.yaw=0;fpv.pitch=-.12;fpv.gy=undefined};
function doorGround(x,z){const {x0,x1,landZ,tread,steps,rise,y0}=DOOR,inX=x>=x0&&x<=x1;if(z>=3.96)return y0;if(inX&&z>=landZ)return y0;if(inX&&z>=landZ-tread*steps){const i=Math.min(steps-1,Math.floor((landZ-z)/tread));return y0-rise*(i+1)}return 0}
function doorUpdate(dt){if(!DOOR.built)return;const near=fpv.enabled&&Math.hypot(fpv.x-(DOOR.x0+DOOR.x1)/2,fpv.z-DOOR.zPanel)<1.9;DOOR.t=clamp(DOOR.t+(near?1:-1)*dt*1.4,0,1);const e=DOOR.t*DOOR.t*(3-2*DOOR.t),k=Math.round(e*(DOOR.N-1));
 if(k!==DOOR.shown){DOOR.shown=k;DOOR.frames.forEach((f,i)=>f.forEach(o=>o.visible=i===k))}if(DOOR.light)DOOR.light.color=DOOR.t>.9?[.15,.95,.35]:DOOR.t>0?[.95,.7,.15]:[.9,.2,.15]}
function canWalk(x,z,fromX=fpv.x,fromZ=fpv.z){const r=.22,{x0,x1}=DOOR;
 const room=x>=-3.86&&x<=3.86&&z>=4.34&&z<=9.08,corridor=DOOR.built&&x>=x0+r&&x<=x1-r&&z>=DOOR.landZ-DOOR.tread*DOOR.steps-.01&&z<4.34;
 const L=AETHER.FAN_MODULE?.layout,xMax=(L?.diagnostics?.collectorFaceX??8.6)-.45,tunnel=DOOR.built&&x>=-8.3&&x<=xMax&&z>=-3.66&&z<=3.60;
 if(!room&&!corridor&&!tunnel)return false;
 if(!room&&DOOR.built&&z<4.15+r&&z>4.11-r&&x>x0-r&&x<x1+r&&DOOR.t<.85)return false;
 const g=doorGround(x,z);if(Math.abs(g-doorGround(fromX,fromZ))>.2)return false;const feet=g,head=g+1.65;
 const vb=AETHER.VEHICLE_TRANSFORM?.worldAABB;if(vb&&feet<vb.max[1]&&x+r>vb.min[0]&&x-r<vb.max[0]&&z+r>vb.min[2]&&z-r<vb.max[2])return false;
 const fb=L?.fanBounds;if(fb&&x+r>fb.min[0]&&x-r<fb.max[0]&&z+r>fb.min[2]&&z-r<fb.max[2])return false;
 return !scene.objects.some(o=>{if(o.name.startsWith('door.')||o.name==='control room floor'||o.name.includes('floor.seam')||o.name.includes('equipment.mark')||o.category==='floor seams')return false;const lo=o.center.map((v,i)=>v-o.size[i]/2),hi=o.center.map((v,i)=>v+o.size[i]/2);if(hi[1]<=feet+.25||lo[1]>=head)return false;return x+r>lo[0]&&x-r<hi[0]&&z+r>lo[2]&&z-r<hi[2]})}
function updateWalk(t){bodyTick();if(!fpv.enabled){doorUpdate(0.05);return}const dt=fpv.last===null?0:Math.min(.05,Math.max(0,(t-fpv.last)/1000));fpv.last=t;doorUpdate(dt);let side=(fpv.keys.has('KeyD')?1:0)-(fpv.keys.has('KeyA')?1:0)+fpv.stick[0],forward=(fpv.keys.has('KeyW')?1:0)-(fpv.keys.has('KeyS')?1:0)-fpv.stick[1];const len=Math.hypot(side,forward);if(len>1){side/=len;forward/=len}const speed=1.6,k=1-Math.exp(-12*dt),tx=(Math.cos(fpv.yaw)*side+Math.sin(fpv.yaw)*forward)*speed,tz=(Math.sin(fpv.yaw)*side-Math.cos(fpv.yaw)*forward)*speed;fpv.vx+=(tx-fpv.vx)*k;fpv.vz+=(tz-fpv.vz)*k;const ox=fpv.x,oz=fpv.z;if(canWalk(fpv.x+fpv.vx*dt,fpv.z))fpv.x+=fpv.vx*dt;else fpv.vx=0;if(canWalk(fpv.x,fpv.z+fpv.vz*dt))fpv.z+=fpv.vz*dt;else fpv.vz=0;const moved=Math.hypot(fpv.x-ox,fpv.z-oz);fpv.phase+=moved*9;const g=doorGround(fpv.x,fpv.z);fpv.gy=fpv.gy===undefined?g:fpv.gy+(g-fpv.gy)*(1-Math.exp(-14*dt));const bob=fpv.sway?Math.sin(fpv.phase)*.012*Math.min(1,Math.hypot(fpv.vx,fpv.vz)):0;camera.eye=[fpv.x,fpv.gy+1.65+bob,fpv.z];{const B=window.__BODY;if(B.active&&B.speed>0){const a=Math.min(.012,B.speed*.004),q=t*.001;camera.eye[0]+=a*(Math.sin(q*23.1)+.5*Math.sin(q*41.7));camera.eye[1]+=a*.6*Math.sin(q*29.3+1.3)}}const cp=Math.cos(fpv.pitch);camera.target=[fpv.x+Math.sin(fpv.yaw)*cp,camera.eye[1]+Math.sin(fpv.pitch),fpv.z-Math.cos(fpv.yaw)*cp]}

function lookWalk(dx,dy){if(!Number.isFinite(dx)||!Number.isFinite(dy))return;fpv.yaw+=clamp(dx,-500,500)*.0025;fpv.pitch=clamp(fpv.pitch-clamp(dy,-500,500)*.0025,-1.35,1.35)}
function captureInput(el,id){try{el.setPointerCapture(id);return true}catch(e){diagnostics.events.push({time:now(),type:'INPUT_CAPTURE_UNAVAILABLE',message:e.name||'capture'});return false}}
let lockPending=false;
addEventListener('pointerup',e=>{if(fpv.look?.id===e.pointerId)fpv.look=null});addEventListener('pointercancel',e=>{if(fpv.look?.id===e.pointerId)fpv.look=null});
function lockFallback(){lockPending=false;document.getElementById('fpvHelp').textContent='마우스 드래그로 시점 변경 · WASD 이동'}
if(document.addEventListener){document.addEventListener('pointerlockerror',lockFallback);document.addEventListener('pointerlockchange',()=>{lockPending=false;if(document.pointerLockElement===glCanvas){fpv.look=null;document.getElementById('fpvHelp').textContent='WASD 이동 · 마우스 시점 · Esc 해제'}})}
addEventListener('keydown',e=>{if(fpv.enabled&&['KeyW','KeyA','KeyS','KeyD'].includes(e.code)&&!['INPUT','TEXTAREA','SELECT'].includes(e.target?.tagName)){e.preventDefault();fpv.keys.add(e.code)}});addEventListener('keyup',e=>fpv.keys.delete(e.code));addEventListener('blur',clearWalk);
if(document.addEventListener){document.addEventListener('visibilitychange',clearWalk);document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==glCanvas)clearWalk()});document.addEventListener('mousemove',e=>{if(fpv.enabled&&document.pointerLockElement===glCanvas)lookWalk(e.movementX,e.movementY)})}
glCanvas.addEventListener('pointerdown',e=>{if(!fpv.enabled||e.button>0)return;if(e.pointerType==='mouse'){if(document.pointerLockElement===glCanvas)return;fpv.look={id:e.pointerId,x:e.clientX,y:e.clientY};if(glCanvas.requestPointerLock&&!lockPending){lockPending=true;try{const result=glCanvas.requestPointerLock();if(result&&typeof result.then==='function')result.then(()=>{lockPending=false},lockFallback)}catch(_){lockFallback()}}return;}if(e.clientX<glCanvas.getBoundingClientRect().left+glCanvas.clientWidth*.4||fpv.look!==null)return;fpv.look={id:e.pointerId,x:e.clientX,y:e.clientY};captureInput(glCanvas,e.pointerId)});
glCanvas.addEventListener('pointermove',e=>{if(!fpv.enabled||document.pointerLockElement===glCanvas||fpv.look?.id!==e.pointerId)return;lookWalk(e.clientX-fpv.look.x,e.clientY-fpv.look.y);fpv.look.x=e.clientX;fpv.look.y=e.clientY});
for(const ev of ['pointerup','pointercancel','lostpointercapture'])glCanvas.addEventListener(ev,e=>{if(fpv.look?.id===e.pointerId)fpv.look=null});
const joy=document.getElementById('joystick');let joyId=null;
function moveJoy(e){const r=joy.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,n=Math.max(45,Math.hypot(dx,dy));fpv.stick=[dx/n,dy/n];if(Math.hypot(...fpv.stick)<.12)fpv.stick=[0,0];document.getElementById('stick').style.transform='translate('+fpv.stick[0]*40+'px,'+fpv.stick[1]*40+'px)'}
joy.addEventListener('pointerdown',e=>{if(joyId!==null)return;joyId=e.pointerId;captureInput(joy,e.pointerId);moveJoy(e)});joy.addEventListener('pointermove',e=>{if(e.pointerId===joyId)moveJoy(e)});for(const ev of ['pointerup','pointercancel','lostpointercapture'])joy.addEventListener(ev,e=>{if(e.pointerId===joyId){joyId=null;fpv.stick=[0,0];document.getElementById('stick').style.transform='translate(0px,0px)'}});
document.getElementById('walkMode').addEventListener('click',startWalk);document.getElementById('swayMode').addEventListener('click',()=>{fpv.sway=!fpv.sway;document.getElementById('swayMode').textContent='흔들림: '+(fpv.sway?'켬':'끔')});startWalk();
function model(center,size){return new Float32Array([size[0]/2,0,0,0,0,size[1]/2,0,0,0,0,size[2]/2,0,center[0],center[1],center[2],1])}function vehicleModel(){const vt=AETHER.VEHICLE_TRANSFORM,o=vt.position,r=vt.rotation,s=vt.scale,rxm=rf([1,0,0],r),rym=rf([0,1,0],r),rzm=rf([0,0,1],r);return new Float32Array([rxm[0]*s[0],rxm[1]*s[0],rxm[2]*s[0],0,rym[0]*s[1],rym[1]*s[1],rym[2]*s[1],0,rzm[0]*s[2],rzm[1]*s[2],rzm[2]*s[2],0,o[0],o[1],o[2],1])}
function bindMesh(P,N,U,I){const pb=gl.createBuffer(),nb=gl.createBuffer(),ub=gl.createBuffer(),ib=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,pb);gl.bufferData(gl.ARRAY_BUFFER,P,gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,nb);gl.bufferData(gl.ARRAY_BUFFER,N,gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,ub);gl.bufferData(gl.ARRAY_BUFFER,U,gl.STATIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,I,gl.STATIC_DRAW);return{pb,nb,ub,ib,count:I.length,type:I instanceof Uint32Array?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT}}
function normalMatrix(m,n){const a=m[0],b=m[4],c=m[8],d=m[1],e=m[5],f=m[9],g=m[2],h=m[6],i=m[10],A=e*i-f*h,B=f*g-d*i,C=d*h-e*g,D=c*h-b*i,E=a*i-c*g,F=b*g-a*h,G=b*f-c*e,H=c*d-a*f,I=a*e-b*d,det=a*A+b*B+c*C;if(Math.abs(det)<1e-12)throw new Error('singular normal transform');const invT=[A,D,G,B,E,H,C,F,I].map(v=>v/det),q=[invT[0]*n[0]+invT[3]*n[1]+invT[6]*n[2],invT[1]*n[0]+invT[4]*n[1]+invT[7]*n[2],invT[2]*n[0]+invT[5]*n[1]+invT[8]*n[2]],l=Math.hypot(...q);if(!finite(l)||l<1e-12)throw new Error('invalid transformed normal');return[q[0]/l,q[1]/l,q[2]/l]}
function loadVehicle(){
 const g=parseGLB(),parts=[],mins=[Infinity,Infinity,Infinity],maxs=[-Infinity,-Infinity,-Infinity],rawCount={primitives:0,vertices:0,sourceMeshes:0,sourceObjects:0};
 const roots=(g.json.scenes[g.json.scene]||{}).nodes||[];
 const walk=(ni,parent)=>{const n=g.json.nodes[ni];if(!n)throw Error('GLB node missing');const M=m4mul(parent,nodeMatrix(n));if(n.mesh!==undefined){rawCount.sourceMeshes++;const nodeName=n.name||'';const role=nodeName==='OBcovered_car'?'body':/^OBcovered_car_wheel_0[1-4]$/.test(nodeName)?'wheel':'unknown';if(role==='unknown')throw Error('Unexpected vehicle node '+nodeName);for(const pr of g.json.meshes[n.mesh].primitives){if(pr.mode!==undefined&&pr.mode!==4)throw Error('Vehicle primitive is not triangles');const pos=readAccessor(g.json,g.bin,pr.attributes.POSITION),nor=pr.attributes.NORMAL!==undefined?readAccessor(g.json,g.bin,pr.attributes.NORMAL):null,uv=pr.attributes.TEXCOORD_0!==undefined?readAccessor(g.json,g.bin,pr.attributes.TEXCOORD_0):null,idx=pr.indices!==undefined?readAccessor(g.json,g.bin,pr.indices):null;if(pos.n!==3||nor&&(nor.n!==3||nor.count!==pos.count)||uv&&(uv.n!==2||uv.count!==pos.count))throw Error('Mismatched vehicle attributes');if(idx&&(idx.n!==1||idx.count%3||!idx.data.every(i=>Number.isInteger(i)&&i>=0&&i<pos.count)))throw Error('Invalid vehicle indices');const P=new Float32Array(pos.count*3),N=new Float32Array(pos.count*3),U=new Float32Array(pos.count*2);for(let i=0;i<pos.count;i++){const q=m4point(M,[pos.data[i*3],pos.data[i*3+1],pos.data[i*3+2]]);P.set(q,i*3);const nn=nor?normalMatrix(M,[nor.data[i*3],nor.data[i*3+1],nor.data[i*3+2]]):[0,1,0];N.set(nn,i*3);if(uv)U.set([uv.data[i*2],uv.data[i*2+1]],i*2);for(let d=0;d<3;d++){mins[d]=Math.min(mins[d],q[d]);maxs[d]=Math.max(maxs[d],q[d])}}const I=idx?new Uint32Array(idx.data):new Uint32Array(Array.from({length:pos.count},(_,i)=>i));const mat=g.json.materials[pr.material||0]||{},pbr=mat.pbrMetallicRoughness||{};parts.push({name:nodeName,role,positions:P,normals:N,uvs:U,indices:I,color:[...(pbr.baseColorFactor||[.5,.5,.5,1])],surface:Object.freeze([pbr.roughnessFactor??1,pbr.metallicFactor??1,0,0]),textureIndex:pbr.baseColorTexture?.index??null}) ;rawCount.primitives++;rawCount.vertices+=pos.count}}rawCount.sourceObjects++;for(const c of n.children||[])walk(c,M)};
 const I=new Float64Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);for(const r of roots)walk(r,I);if(parts.filter(p=>p.role==='body').length!==1||parts.filter(p=>p.role==='wheel').length!==4)throw Error('Vehicle body/wheel contract mismatch');const ext=maxs.map((v,i)=>v-mins[i]);if(!parts.length||!ext.every(v=>finite(v)&&v>0)||!mins.every(finite)||!maxs.every(finite))throw Error('covered car geometry bounds invalid');const sx=config.vehicleReference.lengthX/ext[1],sy=sx,sz=sx,cx=(mins[0]+maxs[0])/2,cy=(mins[1]+maxs[1])/2,minz=mins[2];for(const part of parts){for(let i=0;i<part.positions.length;i+=3){const ox=part.positions[i],oy=part.positions[i+1],oz=part.positions[i+2];part.positions[i]=(oy-cy)*sx;part.positions[i+1]=(oz-minz)*sy;part.positions[i+2]=(ox-cx)*sz}for(let i=0;i<part.normals.length;i+=3){const ox=part.normals[i],oy=part.normals[i+1],oz=part.normals[i+2],q=[oy/sx,oz/sy,ox/sz],l=Math.hypot(...q);if(!finite(l)||l<1e-12)throw Error('vehicle normal transform invalid');part.normals[i]=q[0]/l;part.normals[i+1]=q[1]/l;part.normals[i+2]=q[2]/l}let lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=0;i<part.positions.length;i+=3)for(let d=0;d<3;d++){lo[d]=Math.min(lo[d],part.positions[i+d]);hi[d]=Math.max(hi[d],part.positions[i+d])}if(part.role==='wheel'){const c=[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(lo[2]+hi[2])/2],k=sy/sx;const qpos=new Float32Array(part.positions.length),qnor=new Float32Array(part.normals.length);let R=0;for(let i=0;i<part.positions.length;i+=3){qpos[i]=(part.positions[i]-c[0]);qpos[i+1]=part.positions[i+1]-c[1];qpos[i+2]=part.positions[i+2]-c[2];R=Math.max(R,Math.hypot(qpos[i],qpos[i+1]));const nn=[part.normals[i],part.normals[i+1],part.normals[i+2]],nl=Math.hypot(...nn)||1;qnor[i]=nn[0]/nl;qnor[i+1]=nn[1]/nl;qnor[i+2]=nn[2]/nl}const correctionMax=Math.max(...Array.from({length:qpos.length/3},(_,j)=>Math.hypot(qpos[j*3]- (part.positions[j*3]-c[0]),qpos[j*3+1]-(part.positions[j*3+1]-c[1]),qpos[j*3+2]-(part.positions[j*3+2]-c[2]))));if(!(R>=.24&&R<=.45&&hi[2]-lo[2]>=.10&&hi[2]-lo[2]<=.40&&correctionMax<=.02))throw Error('WHEEL_GEOMETRY_REVIEW_REQUIRED');part.positions=qpos;part.normals=qnor;part.wheel={rawCenter:c,pivot:[c[0],c[1]-lo[1],c[2]],radius:R,widthZ:hi[2]-lo[2],correctionScale:1,correctionMax,theta:0}}}
 scene.vehicleParts=parts;diagnostics.vehicleBounds={rawMin:mins,rawMax:maxs,rawExtents:ext,normalized:{lengthX:config.vehicleReference.lengthX,widthZ:config.vehicleReference.widthZ,heightY:config.vehicleReference.heightY,forwardAxis:'-X world (source +Y / local +X)',groundY:0,scale:[sx,sy,sz]},primitives:rawCount.primitives,vertices:rawCount.vertices,sourceMeshes:rawCount.sourceMeshes,sourceObjects:rawCount.sourceObjects,sourceVertices:VEHICLE_ASSET.sourceVertices,sourcePolygons:VEHICLE_ASSET.sourcePolygons,sourceLoops:VEHICLE_ASSET.sourceLoops,sourceTriangles:VEHICLE_ASSET.sourceTriangles};diagnostics.sourceAsset=VEHICLE_ASSET;diagnostics.wheelNormalization=parts.filter(p=>p.role==='wheel').map(p=>({name:p.name,pivot:p.wheel.pivot,radius:p.wheel.radius,widthZ:p.wheel.widthZ,correctionMax:p.wheel.correctionMax}));return g
}


function cylinderMesh(radius,length,segments){const positions=[],normals=[],uvs=[],indices=[],h=length/2;for(let j=0;j<=segments;j++){const a=2*Math.PI*j/segments,c=Math.cos(a),si=Math.sin(a);positions.push(radius*c,radius*si,-h,radius*c,radius*si,h);normals.push(c,si,0,c,si,0);uvs.push(j/segments,0,j/segments,1)}for(let j=0;j<segments;j++){const b=2*j,n=2*(j+1);indices.push(b,n,b+1,b+1,n,n+1)}const bottomCenter=positions.length/3;positions.push(0,0,-h);normals.push(0,0,-1);uvs.push(.5,.5);const topCenter=bottomCenter+1;positions.push(0,0,h);normals.push(0,0,1);uvs.push(.5,.5);for(let j=0;j<=segments;j++){const a=2*Math.PI*j/segments,c=Math.cos(a),si=Math.sin(a);positions.push(radius*c,radius*si,-h);normals.push(0,0,-1);uvs.push(.5+.5*c,.5+.5*si);positions.push(radius*c,radius*si,h);normals.push(0,0,1);uvs.push(.5+.5*c,.5+.5*si)}const bottomRing=bottomCenter+2,topRing=bottomRing+1;for(let j=0;j<segments;j++){indices.push(bottomCenter,bottomRing+2*(j+1),bottomRing+2*j);indices.push(topCenter,topRing+2*j,topRing+2*(j+1))}return{positions:new Float32Array(positions),normals:new Float32Array(normals),uvs:new Float32Array(uvs),indices:new Uint32Array(indices),topology:{closed:true,vertices:positions.length/3,triangles:indices.length/3,segments}}}
function wheelModel(part,theta){const p=part.wheel.pivot,c=Math.cos(theta),si=Math.sin(theta),local=new Float32Array([c,si,0,0,-si,c,0,0,0,0,1,0,p[0],p[1],p[2],1]);return matMul(vehicleModel(),local)}
function rollerModel(part,theta){const p=part.center,c=Math.cos(theta),si=Math.sin(theta);return new Float32Array([c,si,0,0,-si,c,0,0,0,0,1,0,p[0],p[1],p[2],1])}
function removeRollingObjects(){const removable=new Set(['rolling-road housing','belt','measurement marker','rail mounting']);const categories=new Set(['rolling road','rolling-road frame','rolling-road pit','boundary-layer slot','rolling-road service','wheel station']);for(let i=scene.objects.length-1;i>=0;i--){const o=scene.objects[i];if(removable.has(o.name)||categories.has(o.category))scene.objects.splice(i,1)}}
function buildRollingRoadGeometry(){removeRollingObjects();scene.roadParts.length=0;addBox('belt',M4_CONFIG.pit.beltCenter,M4_CONFIG.pit.beltSize,[.15,.19,.22],{bevel:.006,category:'rolling road'});addBox('frame.left',[0,-.06,-1.325],[6.30,.12,.05],[.32,.37,.40],{bevel:.008,category:'rolling-road frame'});addBox('frame.right',[0,-.06,1.325],[6.30,.12,.05],[.32,.37,.40],{bevel:.008,category:'rolling-road frame'});addBox('frame.upstream',[-3.175,-.06,0],[.05,.12,2.70],[.32,.37,.40],{bevel:.008,category:'rolling-road frame'});addBox('frame.downstream',[3.175,-.06,0],[.05,.12,2.70],[.32,.37,.40],{bevel:.008,category:'rolling-road frame'});addBox('pit.base',[0,-.45,0],[6.40,.06,2.70],[.10,.13,.16],{bevel:.01,category:'rolling-road pit'});for(const [name,center,size] of [['pit.wall.left',[0,-.27,-1.335],[6.30,.30,.03]],['pit.wall.right',[0,-.27,1.335],[6.30,.30,.03]],['pit.wall.upstream',[-3.185,-.27,0],[.03,.30,2.70]],['pit.wall.downstream',[3.185,-.27,0],[.03,.30,2.70]]])addBox(name,center,size,[.18,.22,.25],{bevel:.004,category:'rolling-road pit'});addBox('slot.back',[3.125,-.032,0],[.036,.012,2.50],[.035,.045,.055],{bevel:.002,category:'boundary-layer slot'});addBox('slot.lip.downstream',[3.145,-.006,0],[.01,.012,2.50],[.32,.37,.40],{bevel:.002,category:'boundary-layer slot'});addBox('slot.lip.upstream',[3.105,-.006,0],[.01,.012,2.50],[.32,.37,.40],{bevel:.002,category:'boundary-layer slot'});addBox('service.downstream',[3.125,-.035,0],[.04,.02,2.50],[.22,.27,.30],{bevel:.003,category:'rolling-road service'});for(const x of[-2.2,2.2]){addBox('service panel '+x,[x,-.19,1.313],[.60,.22,.012],[.26,.30,.33],{bevel:.008,category:'rolling-road service'});for(const dx of[-.24,.24])for(const dy of[-.075,.075])addBox('service bolt '+x+' '+dx+' '+dy,[x+dx,-.19+dy,1.302],[.016,.016,.010],[.45,.49,.51],{bevel:.003,category:'rolling-road service'})}
 const wheels=wheelParts();if(wheels.length!==4)throw Error('M4 wheel station count mismatch');for(const [i,w] of wheels.entries()){const station=AETHER.VEHICLE_TRANSFORM.localToWorld(w.wheel.pivot),len=w.wheel.widthZ+.04,mesh=cylinderMesh(M4_CONFIG.roller.radius,len,M4_CONFIG.roller.segments);scene.roadParts.push({name:'roller '+(i+1),role:'roller',center:[station[0],M4_CONFIG.roller.centerY,station[2]],length:len,radius:M4_CONFIG.roller.radius,mesh,visible:true,gpu:null});const z=station[2];for(const dz of[-(len/2+.018),len/2+.018])addBox('bearing '+(i+1)+' '+dz,[station[0],-.15,z+dz],[.12,.14,.036],[.23,.27,.30],{bevel:.012,category:'wheel station'});addBox('station base '+(i+1),[station[0],-.26,z],[.30,.04,len+.11],[.18,.22,.25],{bevel:.008,category:'wheel station'});for(const dx of[-.10,.10]){addBox('station support '+(i+1)+' '+dx,[station[0]+dx,-.34,z],[.04,.12,len+.06],[.20,.24,.27],{bevel:.005,category:'wheel station'});addBox('station shim '+(i+1)+' '+dx,[station[0]+dx,-.41,z],[.04,.02,len+.06],[.30,.34,.37],{bevel:.003,category:'wheel station'})}}
 diagnostics.roadGeometry={beltSize:M4_CONFIG.pit.beltSize,roadParts:scene.roadParts.length,wheelStations:wheels.length};return true}
function validateProceduralMesh(m){if(!m||m.indices.length%3!==0||m.positions.length%3!==0||m.normals.length!==m.positions.length||m.uvs.length!==m.positions.length/3*2||!m.positions.every(finite)||!m.normals.every(finite)||!m.uvs.every(finite)||!m.indices.every(i=>Number.isInteger(i)&&i>=0&&i<m.positions.length/3))return false;const edges=new Map(),key=i=>{const o=i*3;return [m.positions[o],m.positions[o+1],m.positions[o+2]].map(v=>(Math.abs(v)<5e-7?0:v).toFixed(7)).join(',')};for(let k=0;k<m.indices.length;k+=3){const ids=[m.indices[k],m.indices[k+1],m.indices[k+2]],a=ids[0]*3,b=ids[1]*3,c=ids[2]*3,ab=[m.positions[b]-m.positions[a],m.positions[b+1]-m.positions[a+1],m.positions[b+2]-m.positions[a+2]],ac=[m.positions[c]-m.positions[a],m.positions[c+1]-m.positions[a+1],m.positions[c+2]-m.positions[a+2]],cr=cross(ab,ac);if(Math.hypot(...cr)<1e-10)return false;for(const id of ids){const o=id*3,n=[m.normals[o],m.normals[o+1],m.normals[o+2]],nl=Math.hypot(...n);if(!finite(nl)||Math.abs(nl-1)>M4_CONFIG.tolerances.normal)return false;if(dot(cr,n)<=0)return false}for(let j=0;j<3;j++){const edge=[key(ids[j]),key(ids[(j+1)%3])].sort().join('|');edges.set(edge,(edges.get(edge)||0)+1)}}return [...edges.values()].every(count=>count===2)}
function boundsForParts(parts,theta){const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(const p of parts){const M=p.role==='wheel'?wheelModel(p,theta):vehicleModel();for(let i=0;i<p.positions.length;i+=3){const q=m4point(M,[p.positions[i],p.positions[i+1],p.positions[i+2]]);for(let d=0;d<3;d++){lo[d]=Math.min(lo[d],q[d]);hi[d]=Math.max(hi[d],q[d])}}}return{min:lo,max:hi}}
function wheelWorldBoundsAt(theta,index=null){return boundsForParts(index===null?scene.vehicleParts:[wheelParts()[index]],theta)}
const M12_TOLERANCES=Object.freeze({domain:1e-12,geometry:5e-7,matrix:1e-6,roundTrip:1e-9});
function m12MaxAbs(a,b){if(!a||!b||a.length!==b.length)return Infinity;let e=0;for(let i=0;i<a.length;i++){if(!finite(a[i])||!finite(b[i]))return Infinity;e=Math.max(e,Math.abs(a[i]-b[i]))}return e}
function m12SolidParts(){return scene.vehicleParts.map(p=>Object.freeze({name:p.name,role:p.role,vertexCount:p.positions.length/3,triangleCount:p.indices.length/3,positions:p.positions,indices:p.indices,modelMatrix:p.role==='wheel'?wheelModel(p,0):vehicleModel()}))}
function m12SolidBounds(parts){const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(const p of parts)for(let i=0;i<p.positions.length;i+=3){const q=m4point(p.modelMatrix,[p.positions[i],p.positions[i+1],p.positions[i+2]]);for(let d=0;d<3;d++){lo[d]=Math.min(lo[d],q[d]);hi[d]=Math.max(hi[d],q[d])}}return{min:lo,max:hi}}
function m12AlignmentReport(){const descriptors=m12SolidParts(),renderBounds=boundsForParts(scene.vehicleParts,0),solidBounds=m12SolidBounds(descriptors),vt=AETHER.VEHICLE_TRANSFORM,b=vt.localBounds,samples=[];for(const x of[b.min[0],b.max[0]])for(const y of[b.min[1],b.max[1]])for(const z of[b.min[2],b.max[2]])samples.push([x,y,z]);samples.push([0,0,0],[(b.min[0]+b.max[0])/2,(b.min[1]+b.max[1])/2,(b.min[2]+b.max[2])/2]);for(const p of wheelParts())samples.push(p.wheel.pivot.slice());let maxRenderBridgeError=0,maxRoundTripError=0;for(const p of samples){const w=vt.localToWorld(p),m=m4point(vehicleModel(),p),q=vt.worldToLocal(w);maxRenderBridgeError=Math.max(maxRenderBridgeError,m12MaxAbs(w,m));maxRoundTripError=Math.max(maxRoundTripError,m12MaxAbs(p,q))}let maxBoundsError=0;for(let d=0;d<3;d++)maxBoundsError=Math.max(maxBoundsError,Math.abs(renderBounds.min[d]-solidBounds.min[d]),Math.abs(renderBounds.max[d]-solidBounds.max[d]));let maxMatrixError=0;for(const p of descriptors){const expected=p.role==='wheel'?wheelModel(scene.vehicleParts.find(x=>x.name===p.name),0):vehicleModel();maxMatrixError=Math.max(maxMatrixError,m12MaxAbs(p.modelMatrix,expected))}return{maxRoundTripError,maxRenderBridgeError,maxBoundsError,maxMatrixError,renderBounds,solidBounds,transformAuthority:AETHER.VEHICLE_TRANSFORM}}
const CFD_BRIDGE=Object.freeze({version:'M12',unit:coordinateContract.unit,axis:Object.freeze({...coordinateContract.axes}),solverBound:false,fieldData:false,transformAuthority:AETHER.VEHICLE_TRANSFORM,domain:CFD_DOMAIN_CONTRACT,vehicleLocalToWorld(p){return AETHER.VEHICLE_TRANSFORM.localToWorld(p)},worldToVehicleLocal(p){return AETHER.VEHICLE_TRANSFORM.worldToLocal(p)},getSolidParts(){return m12SolidParts()},getCFDProxyAsset(){return S2_CFD_PROXY_ASSET},getAlignmentReport(){return m12AlignmentReport()},geometrySignature(){return JSON.stringify({asset:VEHICLE_ASSET.sha256,transform:AETHER.VEHICLE_TRANSFORM._state,epoch:vehicleGeometryEpoch})}});AETHER.CFD_BRIDGE=CFD_BRIDGE;

// M13 scientific visualization.  Solver fields remain direct references; only
// sparse derived resources (the selected slice, lines and surface scalars) are
// allocated here.  No product path can bind a test source or a fixture.
const M13_MODES=Object.freeze(['NONE','PRESSURE','VELOCITY','CP','SLICE','VECTORS','STREAMLINES','WAKE','VORTICITY']);
const M13_SLICE_QUANTITIES=Object.freeze(['PRESSURE','VELOCITY','CP','VORTICITY']);
const M13_LEGEND_DEFAULTS=Object.freeze({PRESSURE:{unit:'Pa',dimensionless:false},VELOCITY:{unit:'m/s',dimensionless:false},CP:{unit:'1',dimensionless:true},VORTICITY:{unit:'1/s',dimensionless:false},WAKE:{unit:'m/s',dimensionless:false}});
const m13FrameState={solver:null,frame:null,previous:null,sequenceLedger:new Map(),mode:'NONE',slice:{axis:'X',position:0,quantity:'PRESSURE'},visible:false,streamlineDensity:64,flowPlaying:true,flowSpeed:1,flowEpoch:performance.now(),flowOffset:0,lastRejection:null,quality:'high',cp:{parts:null,source:'NONE'},resources:{initialized:false,initCount:0,sliceProgram:null,lineProgram:null,cpProgram:null,sliceTexture:null,slicePositionBuffer:null,sliceUvBuffer:null,cpBuffers:[],linePositionBuffer:null,lineColorBuffer:null,lineFlowBuffer:null,lineCount:0,lineFlow:null,slicePixels:null,sliceSize:[0,0],linePositions:null,lineColors:null,createCount:0,deleteCount:0,scientificDrawCalls:0,derivedReady:{VECTORS:false,STREAMLINES:false,WAKE:false}},legend:Object.fromEntries(Object.entries(M13_LEGEND_DEFAULTS).map(([quantity,d])=>[quantity,{quantity,unit:d.unit,dimensionless:d.dimensionless,min:null,max:null,locked:false,sourceId:null}]))};
function m13FiniteArray(a){return ArrayBuffer.isView(a)&&a instanceof Float32Array&&a.every(finite)}
function m13Vec3(a){return Array.isArray(a)&&a.length===3&&a.every(finite)}
function m13Freeze(v){if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.freeze(v);for(const x of Object.values(v))m13Freeze(x)}return v}
function m13MetaFrame(f){if(!f)return null;return{sourceId:f.sourceId,sequence:f.sequence,simulationTime:f.simulationTime,grid:{resolution:f.grid.resolution.slice(),min:f.grid.min.slice(),max:f.grid.max.slice(),layout:f.grid.layout,axes:{...f.grid.axes},unit:f.grid.unit,tier:f.grid.tier||'PRODUCT',sampleLocation:f.grid.sampleLocation||'GRID_NODE'},freestream:{velocity:f.freestream.velocity.slice(),pressure:f.freestream.pressure,density:f.freestream.density},fields:{pressureLength:f.fields.pressure.data.length,velocityLength:f.fields.velocity.data.length,vorticity:f.fields.vorticity?{length:f.fields.vorticity.data.length,components:f.fields.vorticity.components}:null},surfaceCp:f.surfaceCp?{assetId:f.surfaceCp.assetId,parts:f.surfaceCp.parts.map(p=>({name:p.name,count:p.data.length}))}:null}}
function m13Availability(reason){return{status:'N/A',reason}}
function m13BootAvailability(){return{NONE:{status:'AVAILABLE',reason:null},PRESSURE:m13Availability('SOLVER_UNBOUND'),VELOCITY:m13Availability('SOLVER_UNBOUND'),CP:m13Availability('SOLVER_UNBOUND'),SLICE:m13Availability('SOLVER_UNBOUND'),VECTORS:m13Availability('SOLVER_UNBOUND'),STREAMLINES:m13Availability('SOLVER_UNBOUND'),WAKE:m13Availability('SOLVER_UNBOUND'),VORTICITY:m13Availability('SOLVER_UNBOUND')}}
function m13SampleCoordinate(frame,p){const g=frame.grid;if(!m13Vec3(p)||p.some((v,i)=>v<g.min[i]-1e-9||v>g.max[i]+1e-9))return null;const t=[0,1,2].map(i=>{if(g.sampleLocation==='CELL_CENTER'){const h=(g.max[i]-g.min[i])/g.resolution[i];return Math.max(0,Math.min(g.resolution[i]-1,(p[i]-g.min[i])/h-.5))}return(p[i]-g.min[i])/(g.max[i]-g.min[i])*(g.resolution[i]-1)});return t}
function m13CellIndex(g,x,y,z){return x+g.resolution[0]*(y+g.resolution[1]*z)}
function m13ScalarSample(frame,field,p){const t=m13SampleCoordinate(frame,p);if(!t)return{available:false,value:null};const g=frame.grid,d0=Math.floor(t[0]),d1=Math.floor(t[1]),d2=Math.floor(t[2]),x0=Math.min(d0,g.resolution[0]-1),y0=Math.min(d1,g.resolution[1]-1),z0=Math.min(d2,g.resolution[2]-1),x1=Math.min(x0+1,g.resolution[0]-1),y1=Math.min(y0+1,g.resolution[1]-1),z1=Math.min(z0+1,g.resolution[2]-1),fx=t[0]-x0,fy=t[1]-y0,fz=t[2]-z0;const v=(x,y,z)=>field.data[m13CellIndex(g,x,y,z)];const c00=v(x0,y0,z0)*(1-fx)+v(x1,y0,z0)*fx,c01=v(x0,y0,z1)*(1-fx)+v(x1,y0,z1)*fx,c10=v(x0,y1,z0)*(1-fx)+v(x1,y1,z0)*fx,c11=v(x0,y1,z1)*(1-fx)+v(x1,y1,z1)*fx;return{available:true,value:(c00*(1-fy)+c10*fy)*(1-fz)+(c01*(1-fy)+c11*fy)*fz}}
function m13VectorSample(frame,field,p){const t=m13SampleCoordinate(frame,p);if(!t)return{available:false,value:null};const g=frame.grid,d0=Math.floor(t[0]),d1=Math.floor(t[1]),d2=Math.floor(t[2]),x0=Math.min(d0,g.resolution[0]-1),y0=Math.min(d1,g.resolution[1]-1),z0=Math.min(d2,g.resolution[2]-1),x1=Math.min(x0+1,g.resolution[0]-1),y1=Math.min(y0+1,g.resolution[1]-1),z1=Math.min(z0+1,g.resolution[2]-1),fx=t[0]-x0,fy=t[1]-y0,fz=t[2]-z0,v=(x,y,z)=>{const o=m13CellIndex(g,x,y,z)*3;return[field.data[o],field.data[o+1],field.data[o+2]]},mix=(a,b,q)=>[a[0]*(1-q)+b[0]*q,a[1]*(1-q)+b[1]*q,a[2]*(1-q)+b[2]*q],a=mix(v(x0,y0,z0),v(x1,y0,z0),fx),b=mix(v(x0,y1,z0),v(x1,y1,z0),fx),c=mix(v(x0,y0,z1),v(x1,y0,z1),fx),d=mix(v(x0,y1,z1),v(x1,y1,z1),fx);return{available:true,value:mix(mix(a,b,fy),mix(c,d,fy),fz)}}
function m13Magnitude(v){return Math.hypot(v[0],v[1],v[2])}
function m13FiniteField(field,count){return !!field&&m13FiniteArray(field.data)&&field.data.length===count*field.components}
function m13DomainContains(frame){const b=CFD_BRIDGE.getAlignmentReport().solidBounds,g=frame.grid;return [0,1,2].every(i=>b.min[i]>=g.min[i]-1e-9&&b.max[i]<=g.max[i]+1e-9)}
function m13ValidateFrame(frame,{allowTestGrid=false}={}){const fail=reason=>({ok:false,reason});if(!m13FrameState.solver)return fail('SOLVER_UNBOUND');if(!frame||typeof frame!=='object')return fail('INVALID_FRAME');if(frame.sourceId!==m13FrameState.solver.id)return fail('WRONG_SOURCE');if(typeof frame.sourceId!=='string'||!Number.isInteger(frame.sequence)||frame.sequence<0||!finite(frame.simulationTime)||frame.simulationTime<0)return fail('FRAME_HEADER_INVALID');if(vehicleGeometryEpoch>0&&frame.vehicleTransformSignature!==CFD_BRIDGE.geometrySignature())return fail('STALE_VEHICLE_GEOMETRY');const g=frame.grid,officeDiagnostic=frame.sourceId==='AETHER_S3_OFFICE_CPU'&&!!g&&Array.isArray(g.resolution)&&g.resolution.length===3&&g.resolution.every(v=>v===32||v===64)&&g.tier==='OFFICE_DIAGNOSTIC'&&g.sampleLocation==='CELL_CENTER';if(!g||!Array.isArray(g.resolution)||g.resolution.length!==3||!g.resolution.every(v=>Number.isInteger(v)&&v>0)||(!allowTestGrid&&![[64,64,64],[128,128,128],[256,256,256]].some(t=>t.every((v,i)=>g.resolution[i]===v))&&!officeDiagnostic))return fail('UNSUPPORTED_RESOLUTION');if(!m13Vec3(g.min)||!m13Vec3(g.max)||g.max.some((v,i)=>v<=g.min[i]))return fail('INVALID_GRID_BOUNDS');if(g.layout!=='X_FASTEST'||g.unit!=='meter'||g.axes?.downstream!=='+X'||g.axes?.up!=='+Y'||g.axes?.lateral!=='+Z'||g.sampleLocation!==undefined&&!['GRID_NODE','CELL_CENTER'].includes(g.sampleLocation))return fail('GRID_CONTRACT_INVALID');if(!m13DomainContains(frame))return fail('DOMAIN_DOES_NOT_CONTAIN_VEHICLE');const n=g.resolution[0]*g.resolution[1]*g.resolution[2];if(frame.solidMask!==undefined){const mask=frame.solidMask?.data;if(!(mask instanceof Uint8Array)||mask.length!==n)return fail('SOLID_MASK_INVALID');for(let i=0;i<n;i++)if(mask[i]!==0&&mask[i]!==1)return fail('SOLID_MASK_INVALID')}const fs=frame.fields,fr=frame.freestream;if(!fs||!m13FiniteField(fs.pressure,n)||fs.pressure.components!==1||fs.pressure.unit!=='Pa')return fail('PRESSURE_FIELD_INVALID');if(!m13FiniteField(fs.velocity,n)||fs.velocity.components!==3||fs.velocity.unit!=='m/s')return fail('VELOCITY_FIELD_INVALID');if(fs.vorticity!==undefined&&(!m13FiniteField(fs.vorticity,n)||(fs.vorticity.components!==1&&fs.vorticity.components!==3)||fs.vorticity.unit!=='1/s'))return fail('VORTICITY_FIELD_INVALID');if(!fr||!m13Vec3(fr.velocity)||!finite(fr.pressure)||!finite(fr.density)||fr.density<=0)return fail('FREESTREAM_INVALID');if(frame.surfaceCp!==undefined){const parts=CFD_BRIDGE.getSolidParts();if(!frame.surfaceCp||frame.surfaceCp.assetId!==AETHER.VEHICLE_PRODUCTION?.assetId||frame.surfaceCp.unit!=='1'||!Array.isArray(frame.surfaceCp.parts)||frame.surfaceCp.parts.length!==parts.length)return fail('SURFACE_CP_METADATA_INVALID');for(let i=0;i<parts.length;i++){const q=frame.surfaceCp.parts[i];if(!q||q.name!==parts[i].name||!m13FiniteArray(q.data)||q.data.length!==parts[i].vertexCount)return fail('SURFACE_CP_PART_INVALID')}}if(m13FrameState.previous&&(frame.sequence<m13FrameState.previous.sequence||frame.simulationTime<m13FrameState.previous.simulationTime))return fail('FRAME_ORDER_INVALID');const prior=m13FrameState.sequenceLedger.get(frame.sequence);const equivalent=prior&&prior.sourceId===frame.sourceId&&prior.simulationTime===frame.simulationTime&&prior.frame.grid===frame.grid&&prior.frame.fields.pressure.data===frame.fields.pressure.data&&prior.frame.fields.velocity.data===frame.fields.velocity.data&&prior.frame.fields.vorticity?.data===frame.fields.vorticity?.data&&prior.frame.solidMask?.data===frame.solidMask?.data;if(prior&&!equivalent)return fail('SEQUENCE_REUSE_MUTATED');return{ok:true,n}}
function m13LegendSet(quantity,min,max,sourceId){const l=m13FrameState.legend[quantity];if(!l||l.locked||!finite(min)||!finite(max))return;if(min===max){const e=Math.max(Math.abs(min)*1e-6,1e-6);min-=e;max+=e}l.min=min;l.max=max;l.locked=true;l.sourceId=sourceId}
function m13WakeLegend(frame){const g=frame.grid,planes=m13WakePlanes(frame),sy=Math.max(1,Math.floor(g.resolution[1]/12)),sz=Math.max(1,Math.floor(g.resolution[2]/12)),speed=m13Magnitude(frame.freestream.velocity);let lo=Infinity,hi=-Infinity;for(const plane of planes){if(plane.status!=='AVAILABLE')continue;for(let y=0;y<g.resolution[1];y+=sy)for(let z=0;z<g.resolution[2];z+=sz){const p=[plane.x,g.min[1]+(g.max[1]-g.min[1])*y/Math.max(1,g.resolution[1]-1),g.min[2]+(g.max[2]-g.min[2])*z/Math.max(1,g.resolution[2]-1)],sm=m13VectorSample(frame,frame.fields.velocity,p);if(sm.available){const d=Math.max(0,speed-m13Magnitude(sm.value));lo=Math.min(lo,d);hi=Math.max(hi,d)}}}return finite(lo)&&finite(hi)?[lo,hi]:null}
function m13LegendScan(frame,quantity){const g=frame.grid,n=g.resolution[0]*g.resolution[1]*g.resolution[2],p=frame.fields.pressure.data,v=frame.fields.velocity.data,lo={value:Infinity},hi={value:-Infinity};if(quantity==='PRESSURE'){for(let i=0;i<n;i++){lo.value=Math.min(lo.value,p[i]);hi.value=Math.max(hi.value,p[i])}}else if(quantity==='VELOCITY'){for(let i=0;i<n;i++){const o=i*3,s=Math.hypot(v[o],v[o+1],v[o+2]);lo.value=Math.min(lo.value,s);hi.value=Math.max(hi.value,s)}}else if(quantity==='CP'&&m13FrameState.cp.parts){for(const a of m13FrameState.cp.parts)for(const x of a){lo.value=Math.min(lo.value,x);hi.value=Math.max(hi.value,x)}}else if(quantity==='VORTICITY'&&frame.fields.vorticity){const q=frame.fields.vorticity;if(q.components===1)for(const x of q.data){lo.value=Math.min(lo.value,x);hi.value=Math.max(hi.value,x)}else for(let i=0;i<n;i++){const o=i*3,s=Math.hypot(q.data[o],q.data[o+1],q.data[o+2]);lo.value=Math.min(lo.value,s);hi.value=Math.max(hi.value,s)}}return finite(lo.value)&&finite(hi.value)?[lo.value,hi.value]:null}
function m13CpBuffers(frame){const q=.5*frame.freestream.density*m13Magnitude(frame.freestream.velocity)**2;if(!finite(q)||q<=1e-12)return null;if(frame.surfaceCp)return frame.surfaceCp.parts.map(p=>p.data);const out=[];for(const p of CFD_BRIDGE.getSolidParts()){const a=new Float32Array(p.vertexCount);for(let i=0;i<p.vertexCount;i++){const o=i*3,w=m4point(p.modelMatrix,[p.positions[o],p.positions[o+1],p.positions[o+2]]),s=m13ScalarSample(frame,frame.fields.pressure,w);if(!s.available)return null;a[i]=(s.value-frame.freestream.pressure)/q;if(!finite(a[i]))return null}out.push(a)}return out}
function m13CpReady(frame){if(m13FrameState.cp.parts)return true;const parts=m13CpBuffers(frame);if(!parts)return false;m13FrameState.cp={parts,source:frame.surfaceCp?'SOLVER':'PRESSURE_DERIVED'};let lo=Infinity,hi=-Infinity;for(const a of parts)for(const x of a){lo=Math.min(lo,x);hi=Math.max(hi,x)}m13LegendSet('CP',lo,hi,frame.sourceId);return true}
function m13WakePlanes(frame){const L=AETHER.VEHICLE_TRANSFORM.dimensions.lengthX,downstream=CFD_BRIDGE.getAlignmentReport().solidBounds.min[0],out=[];for(const factor of[.5,1,2]){const x=downstream-factor*L;out.push({x,status:x>=frame.grid.min[0]&&x<=frame.grid.max[0]?'AVAILABLE':'N/A_OUTSIDE_DOMAIN'})}return out}
function m13UpdateAvailability(){const a=m13BootAvailability(),f=m13FrameState.frame;if(f){a.PRESSURE={status:'AVAILABLE',reason:null};a.VELOCITY={status:'AVAILABLE',reason:null};a.VECTORS={status:'AVAILABLE',reason:null};a.STREAMLINES={status:'AVAILABLE',reason:null};a.CP=m13CpReady(f)?{status:'AVAILABLE',reason:null}:m13Availability('CP_UNAVAILABLE');a.SLICE=m13FrameState.slice.quantity==='CP'?m13Availability('VOLUME_CP_NOT_PROVIDED'):(m13FrameState.slice.quantity==='VORTICITY'&&!f.fields.vorticity?m13Availability('N/A_SOURCE_NOT_PROVIDED'):{status:'AVAILABLE',reason:null});a.WAKE=m13WakePlanes(f).some(p=>p.status==='AVAILABLE')?{status:'AVAILABLE',reason:null}:m13Availability('N/A_OUTSIDE_DOMAIN');a.VORTICITY=f.fields.vorticity?{status:'AVAILABLE',reason:null}:m13Availability('N/A_SOURCE_NOT_PROVIDED')}m13FrameState.availability=a}
function m13Sync(){m13UpdateAvailability();const f=m13FrameState.frame,legend=Object.fromEntries(Object.entries(m13FrameState.legend).map(([k,v])=>[k,{...v}])),finiteLegend=(q,u,d)=>!!legend[q]&&legend[q].unit===u&&legend[q].dimensionless===d&&finite(legend[q].min)&&finite(legend[q].max)&&legend[q].locked;const alignment=!!f&&m13DomainContains(f),officeDiagnostic=!!f&&f.grid.tier==='OFFICE_DIAGNOSTIC';const checks={publicApi:true,frameContract:true,finiteValidation:true,pressureDataReady:!!f&&finiteLegend('PRESSURE','Pa',false),velocityDataReady:!!f&&finiteLegend('VELOCITY','m/s',false),cpDataReady:!!f&&m13CpReady(f)&&finiteLegend('CP','1',true),sliceDataReady:!!f&&!!m13FrameState.resources.slicePositionBuffer&&!!m13FrameState.resources.sliceUvBuffer&&!!m13FrameState.resources.slicePixels,vectorsDataReady:!!f&&m13FrameState.resources.derivedReady.VECTORS===true,streamlinesDataReady:!!f&&m13FrameState.resources.derivedReady.STREAMLINES===true,wakeDataReady:!!f&&m13FrameState.resources.derivedReady.WAKE===true&&m13WakePlanes(f).some(p=>p.status==='AVAILABLE'),vorticityDataReady:!!f&&(!!f.fields.vorticity||m13FrameState.availability.VORTICITY?.reason==='N/A_SOURCE_NOT_PROVIDED'),productionResolutionReady:!!f&&!officeDiagnostic,legendsValid:!!f&&finiteLegend('PRESSURE','Pa',false)&&finiteLegend('VELOCITY','m/s',false)&&finiteLegend('CP','1',true)&&finiteLegend('WAKE','m/s',false)&&(!f.fields.vorticity||finiteLegend('VORTICITY','1/s',false)),exactAlignment:alignment,noSyntheticField:true,noRenderOnlyTransform:alignment,solverSourceOnly:true};const phase=window.__AETHER_M13_PRIVATE_TEST_MODE__!==true&&Object.values(checks).every(Boolean)&&!!m13FrameState.solver&&!!f;AETHER.M13={codeReady:true,passed:phase,gateStatus:phase?'READY':(officeDiagnostic?'BLOCKED_OFFICE_DIAGNOSTIC_ONLY':(m13FrameState.solver?'BLOCKED_FRAME_NOT_READY':'BLOCKED_SOLVER_UNBOUND')),solverBound:!!m13FrameState.solver,dataReady:!!f,checks,source:m13FrameState.solver?{kind:'solver',id:m13FrameState.solver.id}:null,frame:m13MetaFrame(f),mode:m13FrameState.mode,modeAvailability:m13FrameState.availability,legend,resources:{initialized:m13FrameState.resources.initialized,initCount:m13FrameState.resources.initCount,slicePositionBuffer:!!m13FrameState.resources.slicePositionBuffer,sliceUvBuffer:!!m13FrameState.resources.sliceUvBuffer,lineBuffers:!!m13FrameState.resources.linePositionBuffer,lineCount:m13FrameState.resources.lineCount,cpBuffers:m13FrameState.resources.cpBuffers.length,createCount:m13FrameState.resources.createCount,deleteCount:m13FrameState.resources.deleteCount,scientificDrawCalls:m13FrameState.resources.scientificDrawCalls,derivedReady:{...m13FrameState.resources.derivedReady}},limitations:officeDiagnostic?['32³ office CPU preview only','geometry and physics are not approved','browser visual review pending']:['solver source unbound at boot','actual CFD data required before phase gate can pass','browser visual review pending'],browserVerified:false,productReady:false};const st=document.getElementById('m13Status'),lg=document.getElementById('m13Legend');if(st)st.textContent=officeDiagnostic?'OFFICE PREVIEW · 32³ · #'+f.sequence:(f?'SOURCE '+f.sourceId+' · SEQ '+f.sequence:'SOLVER UNBOUND');const streamControls=document.getElementById('streamControls');if(streamControls)streamControls.hidden=m13FrameState.mode!=='STREAMLINES';if(lg){const mode=m13FrameState.mode,previewLabel=officeDiagnostic?'32³ OFFICE PREVIEW · ':'',q=mode==='SLICE'?m13FrameState.slice.quantity:(mode==='VECTORS'||mode==='STREAMLINES'?'VELOCITY':mode),l=legend[q],av=m13FrameState.availability[mode];if(!f)lg.textContent='M13 VIS READY · SOLVER UNBOUND';else if(mode==='NONE')lg.textContent=previewLabel+f.sourceId+' · #'+f.sequence+' · t='+f.simulationTime.toFixed(3)+'s\nDATA READY · MODE NONE';else if(av?.status!=='AVAILABLE')lg.textContent=f.sourceId+' · #'+f.sequence+' · t='+f.simulationTime.toFixed(3)+'s\n'+mode+' · '+(av?.reason||'N/A');else lg.textContent=previewLabel+f.sourceId+' · #'+f.sequence+' · t='+f.simulationTime.toFixed(3)+'s\n'+q+' · '+(finite(l?.min)&&finite(l?.max)?l.min.toFixed(5)+' … '+l.max.toFixed(5):'N/A')+' '+(l?.unit||'N/A')+(mode==='STREAMLINES'?' · snapshot frozen · markers '+(m13FrameState.flowPlaying?'playing':'paused')+' '+m13FrameState.flowSpeed.toFixed(2)+'×':'')};if(typeof renderDiagnostics==='function'&&diagnostics?.bootStage!=='BOOT')renderDiagnostics()}function m13Reject(reason){m13FrameState.lastRejection=reason;diagnostics.warnings.push('M13_'+reason);m13Sync();return false}
function m13InvalidateDerived(){const r=m13FrameState.resources;r.derivedReady={VECTORS:false,STREAMLINES:false,WAKE:false};r.lineCount=0;r.linePositions=null;r.lineColors=null;r.vectorStats=null;r.streamlineStats=null;r.wakeStats=null;r.slicePixels=null;r.sliceSize=[0,0];}
function m13BindSolver(input={}){const kind=input&&input.kind,id=input&&input.id;if(kind!=='solver'||typeof id!=='string'||!id.trim())return m13Reject('INVALID_SOLVER_SOURCE');m13FrameState.solver={kind:'solver',id:id.trim()};m13FrameState.frame=null;m13FrameState.previous=null;m13FrameState.sequenceLedger.clear();m13FrameState.visible=false;m13InvalidateDerived();m13FrameState.cp={parts:null,source:'NONE'};for(const l of Object.values(m13FrameState.legend)){l.min=null;l.max=null;l.locked=false;l.sourceId=null}m13FrameState.lastRejection=null;m13Sync();return true}
function m13UnbindSolver(){m13FrameState.solver=null;m13FrameState.frame=null;m13FrameState.previous=null;m13FrameState.sequenceLedger.clear();m13FrameState.visible=false;m13InvalidateDerived();m13FrameState.cp={parts:null,source:'NONE'};for(const l of Object.values(m13FrameState.legend)){l.min=null;l.max=null;l.locked=false;l.sourceId=null}m13Sync();return true}
function m13AcceptFrame(frame){const check=m13ValidateFrame(frame);if(!check.ok)return m13Reject(check.reason);m13FrameState.previous=frame;m13FrameState.frame=frame;m13FrameState.sequenceLedger.clear();m13FrameState.sequenceLedger.set(frame.sequence,{sourceId:frame.sourceId,simulationTime:frame.simulationTime,frame});m13FrameState.visible=true;m13InvalidateDerived();m13FrameState.cp={parts:null,source:'NONE'};for(const [q,key] of [['PRESSURE','PRESSURE'],['VELOCITY','VELOCITY'],['VORTICITY','VORTICITY']]){const r=m13LegendScan(frame,key);if(r)m13LegendSet(q,r[0],r[1],frame.sourceId)}m13Sync();m13PrepareDerived();m13PrepareCp();return true}
function m13SetMode(mode){if(!M13_MODES.includes(mode))return false;m13UpdateAvailability();if(mode!=='NONE'&&m13FrameState.availability[mode]?.status!=='AVAILABLE'){m13FrameState.lastRejection=m13FrameState.availability[mode]?.reason||'DATA_UNAVAILABLE';m13Sync();return false}m13FrameState.mode=mode;if(['PRESSURE','VELOCITY','VORTICITY'].includes(mode))m13FrameState.slice={axis:'X',position:0,quantity:mode};m13FrameState.visible=mode!=='NONE'&&!!m13FrameState.frame;m13Sync();m13PrepareDerived();return true}
function m13SetSlice(input={}){const axis=input.axis,position=input.position,quantity=input.quantity;if(!['X','Y','Z'].includes(axis)||!finite(position)||!M13_SLICE_QUANTITIES.includes(quantity)||!m13FrameState.frame)return false;const g=m13FrameState.frame.grid,i='XYZ'.indexOf(axis);if(position<g.min[i]||position>g.max[i])return false;m13FrameState.slice={axis,position,quantity};m13FrameState.visible=false;m13UpdateAvailability();if(m13FrameState.mode==='SLICE'&&m13FrameState.availability.SLICE.status==='AVAILABLE')m13FrameState.visible=true;m13Sync();m13PrepareDerived();return true}
function m13ResetLegend(quantity){const keys=quantity?[quantity]:Object.keys(m13FrameState.legend);if(quantity&&!m13FrameState.legend[quantity])return false;for(const k of keys){const l=m13FrameState.legend[k];l.min=null;l.max=null;l.locked=false;l.sourceId=null}if(m13FrameState.frame){for(const q of keys){const r=q==='WAKE'?m13WakeLegend(m13FrameState.frame):m13LegendScan(m13FrameState.frame,q);if(r)m13LegendSet(q,r[0],r[1],m13FrameState.frame.sourceId)}}m13Sync();return true}
function m13Snapshot(){return m13Freeze(JSON.parse(JSON.stringify({solverBound:!!m13FrameState.solver,dataReady:!!m13FrameState.frame,source:m13FrameState.solver?{kind:'solver',id:m13FrameState.solver.id}:null,frame:m13MetaFrame(m13FrameState.frame),mode:m13FrameState.mode,modeAvailability:m13FrameState.availability,legend:m13FrameState.legend,lastRejection:m13FrameState.lastRejection}))) }
const m13PublicApi=Object.freeze({bindSolver:m13BindSolver,unbindSolver:m13UnbindSolver,acceptFrame:m13AcceptFrame,setMode:m13SetMode,setSlice:m13SetSlice,resetLegend:m13ResetLegend,getSnapshot:m13Snapshot});AETHER.SCIENTIFIC_VIS=m13PublicApi;
const m13PrivateHelpers=Object.freeze({scalarTrilinear:m13ScalarSample,vectorTrilinear:m13VectorSample,magnitude:m13Magnitude,finiteField:m13FiniteField,domainContains:m13DomainContains,wakePlanes:m13WakePlanes,streamline:m13Streamline,segmentHitsSolid:m13SegmentHitsSolid,flowElapsed:m13FlowElapsed,cpBuffers:m13CpBuffers});
m13Sync();
if(window.__AETHER_M13_PRIVATE_TEST_MODE__===true)Object.defineProperty(window,'__AETHER_M13_PRIVATE_TEST__',{value:m13PrivateHelpers,configurable:false});
function runM12Checks(){const domain=CFD_DOMAIN_CONTRACT,b=domain.bounds,derivedMin=[-config.testSection.lengthX/2,coordinateContract.groundY,-config.testSection.widthZ/2],derivedMax=[config.testSection.lengthX/2,config.testSection.heightY,config.testSection.widthZ/2],derivedSize=derivedMax.map((v,i)=>v-derivedMin[i]),descriptors=CFD_BRIDGE.getSolidParts(),report=CFD_BRIDGE.getAlignmentReport(),renderBounds=report.renderBounds,solidBounds=report.solidBounds,allDomain=[...b.min,...b.max,...b.size,b.volume],domainFinite=allDomain.every(finite)&&b.size.every(v=>v>0)&&b.volume>0,domainAxes=domain.unit==='meter'&&domain.axis.downstream==='+X'&&domain.axis.up==='+Y'&&domain.axis.lateral==='+Z'&&domain.axis.vehicleForward==='-X',eq=(a,c,t=M12_TOLERANCES.domain)=>a.length===c.length&&a.every((v,i)=>finite(v)&&Math.abs(v-c[i])<=t),vehicleContained=descriptors.length>0&&[...solidBounds.min,...solidBounds.max].every(finite)&&solidBounds.min.every((v,i)=>v>=b.min[i]-M12_TOLERANCES.geometry)&&solidBounds.max.every((v,i)=>v<=b.max[i]+M12_TOLERANCES.geometry),sharedGeometryAuthority=descriptors.length===scene.vehicleParts.length&&descriptors.every((p,i)=>p.positions===scene.vehicleParts[i].positions&&p.indices===scene.vehicleParts[i].indices),body=descriptors.filter(p=>p.role==='body'),wheels=descriptors.filter(p=>p.role==='wheel'),solidCounts=descriptors.every(p=>finite(p.vertexCount)&&finite(p.triangleCount)&&p.vertexCount>0&&p.triangleCount>0)&&descriptors.reduce((n,p)=>n+p.vertexCount,0)===scene.vehicleParts.reduce((n,p)=>n+p.positions.length/3,0)&&descriptors.reduce((n,p)=>n+p.triangleCount,0)===scene.vehicleParts.reduce((n,p)=>n+p.indices.length/3,0),noRenderOnlyOffset=report.maxMatrixError<=M12_TOLERANCES.matrix,vehiclePlacement=AETHER.VEHICLE_TRANSFORM.position.every(finite)&&AETHER.VEHICLE_TRANSFORM.scale.every(v=>finite(v)&&v>0)&&eq(AETHER.VEHICLE_TRANSFORM.rotation,[0,Math.PI,0])&&Math.abs(renderBounds.min[1]-coordinateContract.groundY)<=M12_TOLERANCES.geometry&&Math.abs(renderBounds.max[2]+renderBounds.min[2]-2*AETHER.VEHICLE_TRANSFORM.position[2])<=M12_TOLERANCES.geometry,forwardDirection=domain.axis.downstream==='+X'&&domain.axis.vehicleForward==='-X'&&vehicleFrontEvidence().verified&&FLOW_LAYOUT.get().vehicleNoseDirection[0]<-.999&&FLOW_LAYOUT.get().emitterPlane.x<FLOW_LAYOUT.get().vehicleFrontPoint[0]&&FLOW_LAYOUT.get().vehicleRearPoint[0]<FLOW_LAYOUT.get().collectorPlane.x,syntheticFieldKeys=['pressure','velocity','Cp','streamlines','wake','vorticity'],noSyntheticFields=!domain.fieldData&&!domain.allocated&&!domain.solverBound&&!CFD_BRIDGE.fieldData&&!CFD_BRIDGE.solverBound&&!syntheticFieldKeys.some(k=>Object.prototype.hasOwnProperty.call(domain,k)||Object.prototype.hasOwnProperty.call(CFD_BRIDGE,k));const checks={domainFinite,domainAxes,domainDerivedFromConfig:eq(b.min,derivedMin)&&eq(b.max,derivedMax)&&eq(b.size,derivedSize)&&Math.abs(b.volume-derivedSize[0]*derivedSize[1]*derivedSize[2])<=M12_TOLERANCES.domain,vehicleContained,sharedTransformAuthority:CFD_BRIDGE.transformAuthority===AETHER.VEHICLE_TRANSFORM,sharedGeometryAuthority,solidPartCount:descriptors.length===5&&body.length===1&&wheels.length===4,solidCounts,solidBoundsMatchRender:report.maxBoundsError<=M12_TOLERANCES.geometry,renderTransformMatch:report.maxRenderBridgeError<=M12_TOLERANCES.matrix,roundTrip:report.maxRoundTripError<=M12_TOLERANCES.roundTrip,noRenderOnlyOffset,vehiclePlacement,forwardDirection,noSyntheticFields};const passed=Object.values(checks).every(Boolean);const summary={passed,geometryReady:passed,alignmentReady:passed,checks,domain:Object.freeze({min:b.min.slice(),max:b.max.slice(),size:b.size.slice(),volume:b.volume,resolutionTiers:domain.resolutionTiers.map(t=>({resolution:t.resolution,cells:t.cells,scalarFloat32Bytes:t.scalarFloat32Bytes,vector3Float32Bytes:t.vector3Float32Bytes})),activeTier:domain.activeTier,allocated:domain.allocated,solverBound:domain.solverBound,fieldData:domain.fieldData}),solid:{partCount:descriptors.length,vertexCount:descriptors.reduce((n,p)=>n+p.vertexCount,0),triangleCount:descriptors.reduce((n,p)=>n+p.triangleCount,0),bounds:solidBounds},alignment:{maxRoundTripError:report.maxRoundTripError,maxRenderBridgeError:report.maxRenderBridgeError,maxBoundsError:report.maxBoundsError,transformAuthority:CFD_BRIDGE.transformAuthority},solverBound:false,fieldData:false,visualApproval:'PENDING',browserVerified:false,productReady:false,limitations:['solver unbound','no field allocation','actual CFD visualization deferred to M13','device visual review pending']};AETHER.M12=Object.freeze(summary);diagnostics.cfdDomain=AETHER.M12.domain;diagnostics.cfdAlignment=AETHER.M12.alignment;if(!passed)throw Error('M12 CFD domain/vehicle alignment failed: '+Object.entries(checks).filter(([,v])=>!v).map(([k])=>k).join(','));return AETHER.M12}
function runM4Checks(){const eps=M4_CONFIG.tolerances.geometry,body=scene.vehicleParts.filter(p=>p.role==='body'),wheels=wheelParts(),belt=scene.objects.find(o=>o.name==='belt'),rollerTop=scene.roadParts.every(r=>Math.abs(r.center[1]+r.radius-(-.06))<=eps),counts=body.length===1&&wheels.length===4&&scene.roadParts.length===4&&scene.objects.filter(o=>o.name==='belt').length===1,mesh=scene.roadParts.every(r=>validateProceduralMesh(r.mesh)&&r.mesh.positions.length/3===2*(M4_CONFIG.roller.segments+1)+2+2*(M4_CONFIG.roller.segments+1)&&r.mesh.indices.length===M4_CONFIG.roller.segments*12),pit=!!belt&&Math.abs(belt.center[1]+belt.size[1]/2)<=eps&&Math.abs(belt.size[0]-6.20)<=eps&&Math.abs(belt.size[2]-2.56)<=eps,beltClearance=!!belt&&M4_CONFIG.pit.maxX-(belt.center[0]+belt.size[0]/2)>=.05-eps&&M4_CONFIG.pit.minX-(belt.center[0]-belt.size[0]/2)<=-.05+eps&&M4_CONFIG.pit.maxZ-(belt.center[2]+belt.size[2]/2)>=.05-eps&&M4_CONFIG.pit.minZ-(belt.center[2]-belt.size[2]/2)<=-.05+eps&&scene.objects.filter(o=>o.name.startsWith('frame.')).every(o=>Math.abs(o.center[2])<1e-9||Math.abs(Math.abs(o.center[2])-1.325)<eps),uniqueM4Ids=(()=>{const cats=new Set(['rolling road','rolling-road frame','rolling-road pit','boundary-layer slot','rolling-road service','wheel station']);const ids=scene.objects.filter(o=>o.name==='belt'||cats.has(o.category)).map(o=>o.name);return new Set(ids).size===ids.length})(),align=wheels.every((w,i)=>{const r=scene.roadParts[i];return !!r&&Math.hypot(AETHER.VEHICLE_TRANSFORM.localToWorld(w.wheel.pivot)[0]-r.center[0],AETHER.VEHICLE_TRANSFORM.localToWorld(w.wheel.pivot)[2]-r.center[2])<=eps}),contacts=wheels.length===4&&wheels.every((w,i)=>{const b=wheelWorldBoundsAt(0,i);return b.min[1]>=-1e-5&&b.min[1]<=M4_CONFIG.tolerances.contact}),state=!!AETHER.ROLLING_ROAD&&snapshotState().effectiveSpeed===0&&snapshotState().wheelAngles.length===4&&snapshotState().rollerAngles.length===4;const checks={body:body.length===1,wheels:wheels.length===4,stations:scene.roadParts.length===4,belt:!!belt,beltDimensions:pit,beltClearance,uniqueM4Ids,frame:scene.objects.filter(o=>o.category==='rolling-road frame').length===4,slot:scene.objects.filter(o=>o.category==='boundary-layer slot').length===3,servicePanels:scene.objects.filter(o=>o.name.startsWith('service panel')).length===2,bearings:scene.objects.filter(o=>o.category==='wheel station'&&o.name.startsWith('bearing')).length===8,rollerTopology:mesh,rollerTop,alignment:align,vehicleContact:contacts,stateContract:state,finite:scene.roadParts.every(r=>validateProceduralMesh(r.mesh))};const passed=counts&&Object.values(checks).every(Boolean);AETHER.M4={geometryReady:passed,stateContractReady:state,liveSolverConnected:false,browserVerified:false,iPhoneVerified:false,visualApproval:'PENDING',productReady:false,checks,limitations:['solver source unbound at boot','browser runtime not verified','iPhone runtime not verified']};diagnostics.m4Checks=checks;return AETHER.M4}
function collectorMeshBuilder(name,role,color,surface){
 const b={name,role,color,surface,positions:[],normals:[],uvs:[],indices:[]},cross3=(a,c)=>[a[1]*c[2]-a[2]*c[1],a[2]*c[0]-a[0]*c[2],a[0]*c[1]-a[1]*c[0]],dot3=(a,c)=>a.reduce((q,v,i)=>q+v*c[i],0),norm3=a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l)};
 b.quad=(a,c,d,e,hint=[0,1,0],reverse=false)=>{
  let pts=[a,c,d,e],n=norm3(cross3(pts[1].map((v,i)=>v-pts[0][i]),pts[2].map((v,i)=>v-pts[0][i])));
  if(dot3(n,hint)<0){pts=[pts[0],pts[3],pts[2],pts[1]];n=n.map(v=>-v)}
  if(reverse){pts=[pts[0],pts[3],pts[2],pts[1]];n=n.map(v=>-v)}
  const base=b.positions.length/3;for(let i=0;i<4;i++){b.positions.push(...pts[i]);b.normals.push(...n);b.uvs.push(i===1||i===2?1:0,i>=2?1:0)}b.indices.push(base,base+1,base+2,base,base+2,base+3);
 };
 b.box=(x0,y0,z0,x1,y1,z1)=>{
  const faces=[
   [[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1],[1,0,0]],
   [[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],[-1,0,0]],
   [[x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[0,1,0]],
   [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[0,-1,0]],
   [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[0,0,1]],
   [[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[x1,y0,z0],[0,0,-1]]
  ];for(const f of faces)b.quad(f[0],f[1],f[2],f[3],f[4]);
 };
 b.beam=(a,c,r)=>{
  const delta=c.map((v,i)=>v-a[i]),len=Math.hypot(...delta),d=delta.map(v=>v/len),ref=Math.abs(d[1])<.86?[0,1,0]:[0,0,1],u=norm3(cross3(d,ref)),v=norm3(cross3(d,u)),ring=p=>[[1,1],[-1,1],[-1,-1],[1,-1]].map(([su,sv])=>p.map((q,i)=>q+u[i]*r*su+v[i]*r*sv)),ra=ring(a),rc=ring(c);
  for(let i=0;i<4;i++){const hint=i===0?u:i===1?v:i===2?u.map(q=>-q):v.map(q=>-q);b.quad(ra[i],ra[(i+1)%4],rc[(i+1)%4],rc[i],hint)}
  b.quad(ra[0],ra[3],ra[2],ra[1],d.map(q=>-q));b.quad(rc[0],rc[1],rc[2],rc[3],d);
 };
 b.finish=()=>({name:b.name,role:b.role,positions:new Float32Array(b.positions),normals:new Float32Array(b.normals),uvs:new Float32Array(b.uvs),indices:new Uint32Array(b.indices),color:b.color,surface:b.surface,matrix:identityMatrix(),gpu:null});
 return b;
}
function refreshExhaustCollectorLayout(layoutOverride=null){
 const c=AETHER.EXHAUST_COLLECTOR,layout=layoutOverride||AETHER.FLOW_LAYOUT?.get?.();if(!c?.loaded||!layout)return c;
 c.layout=layout;c.facePoint=layout.collectorPlane.point.slice();c.root=layout.collectorRoot.slice();c.validation={...layout.checks,meshFinite:c.parts.every(p=>p.positions.every(finite)&&p.normals.every(finite)&&p.uvs.every(finite)&&p.indices.every(i=>i>=0&&i<p.positions.length/3))};c.valid=layout.valid&&Object.values(c.validation).every(Boolean);diagnostics.collectorModule={loaded:true,valid:c.valid,visualOnly:true,solverCoupled:false,partCount:c.parts.length,triangleCount:c.triangleCount,facePoint:c.facePoint,ductEndX:layout.collectorDuctEndWorldX,validation:c.validation};return c;
}
function buildExhaustCollector(layoutOverride=null){
 const layout=layoutOverride||AETHER.FLOW_LAYOUT?.get?.();if(!layout?.valid)throw Error('EXHAUST_COLLECTOR_REQUIRES_VALID_FLOW_LAYOUT');
 const {halfHeight:hy,halfWidth:w,throatRatio:r,hoodDepth}=layout.collectorOpening,throatY=hy*r,throatZ=w*r,x0=.035,x1=-hoodDepth,xEnd=layout.collectorDuctEndLocalX;
 const shell=collectorMeshBuilder('rear.collector.ceramic-shell','collector-shell',[.74,.77,.79,1],[.72,.34,0,.012]),liner=collectorMeshBuilder('rear.collector.graphite-liner','collector-liner',[.12,.15,.17,1],[.70,.22,0,.012]),frame=collectorMeshBuilder('rear.collector.brushed-frame','collector-frame',[.43,.48,.51,1],[.34,.78,0,.012]),grille=collectorMeshBuilder('rear.collector.intake-grille','collector-grille',[.27,.32,.35,1],[.32,.84,0,.012]),safety=collectorMeshBuilder('rear.collector.safety-markers','collector-safety',[.92,.57,.10,1],[.48,.24,0,.012]),seal=collectorMeshBuilder('rear.collector.gaskets','collector-seal',[.045,.055,.062,1],[.86,.04,0,.012]);
 const panelSet=(g,xa,ha,wa,xb,hb,wb,inward=false)=>{g.quad([xa,ha,-wa],[xa,ha,wa],[xb,hb,wb],[xb,hb,-wb],[0,1,0],inward);g.quad([xa,-ha,-wa],[xb,-hb,-wb],[xb,-hb,wb],[xa,-ha,wa],[0,-1,0],inward);g.quad([xa,-ha,wa],[xa,ha,wa],[xb,hb,wb],[xb,-hb,wb],[0,0,1],inward);g.quad([xa,-ha,-wa],[xb,-hb,-wb],[xb,hb,-wb],[xa,ha,-wa],[0,0,-1],inward)};
 panelSet(shell,x0,hy+.10,w+.10,x1,throatY+.10,throatZ+.10);panelSet(liner,-.012,hy-.065,w-.065,x1+.018,throatY-.065,throatZ-.065,true);
 panelSet(shell,x1,throatY+.10,throatZ+.10,xEnd,throatY+.10,throatZ+.10);panelSet(liner,x1+.012,throatY-.065,throatZ-.065,xEnd+.025,throatY-.065,throatZ-.065,true);
 const rimHY=hy+.12,rimW=w+.12,frameX0=-.105,frameX1=.075,rail=.16;
 frame.box(frameX0,rimHY-rail,-rimW,frameX1,rimHY+rail,rimW);frame.box(frameX0,-rimHY-rail,-rimW,frameX1,-rimHY+rail,rimW);frame.box(frameX0,-rimHY+rail,rimW-rail,frameX1,rimHY-rail,rimW+rail);frame.box(frameX0,-rimHY+rail,-rimW-rail,frameX1,rimHY-rail,-rimW+rail);
 const gasket=.045;seal.box(-.035,hy-gasket,-w+.05,.012,hy+gasket,w-.05);seal.box(-.035,-hy-gasket,-w+.05,.012,-hy+gasket,w-.05);seal.box(-.035,-hy+gasket,w-gasket,.012,hy-gasket,w);seal.box(-.035,-hy+gasket,-w,.012,hy-gasket,-w+gasket);
 const throatRail=.115;frame.box(x1-.07,throatY+.025,-throatZ-throatRail,x1+.08,throatY+throatRail,throatZ+throatRail);frame.box(x1-.07,-throatY-throatRail,-throatZ-throatRail,x1+.08,-throatY-.025,throatZ+throatRail);frame.box(x1-.07,-throatY+throatRail,throatZ+.025,x1+.08,throatY-throatRail,throatZ+throatRail);frame.box(x1-.07,-throatY+throatRail,-throatZ-throatRail,x1+.08,throatY-throatRail,-throatZ-.025);
 frame.box(xEnd-.04,throatY+.02,-throatZ-.12,xEnd+.06,throatY+.14,throatZ+.12);frame.box(xEnd-.04,-throatY-.14,-throatZ-.12,xEnd+.06,-throatY-.02,throatZ+.12);frame.box(xEnd-.04,-throatY+.14,throatZ+.02,xEnd+.06,throatY-.14,throatZ+.14);frame.box(xEnd-.04,-throatY+.14,-throatZ-.14,xEnd+.06,throatY-.14,-throatZ-.02);
 for(const sy of[-1,1])for(const sz of[-1,1]){const a=[x0,sy*(hy+.10),sz*(w+.10)],b=[x1,sy*(throatY+.10),sz*(throatZ+.10)];frame.beam(a,b,.045);safety.beam([x0,sy*(hy+.10),sz*(w+.10)],[x0-.24,sy*(hy+.10-.03),sz*(w+.10-.03)],.055)}
 for(let i=1;i<=9;i++){const z=-w+.14+(2*w-.28)*i/10;grille.box(-.025,-hy+.07,z-.018,.025,hy-.07,z+.018)}
 for(let i=1;i<=6;i++){const y=-hy+.14+(2*hy-.28)*i/7;grille.box(-.028,y-.018,-w+.07,.028,y+.018,w-.07)}
 for(const sy of[-1,1])for(const sz of[-1,1]){const cy=sy*(hy+.12),cz=sz*(w+.12);safety.box(.055,cy-.09,cz-.09,.12,cy+.09,cz+.09);frame.box(.12,cy-.035,cz-.035,.155,cy+.035,cz+.035)}
 const parts=[shell,liner,frame,grille,safety,seal].map(g=>g.finish()),meshFinite=parts.every(p=>p.positions.length>0&&p.indices.length>0&&p.positions.every(finite)&&p.normals.every(finite)&&p.uvs.every(finite)&&p.indices.every(i=>i>=0&&i<p.positions.length/3)),triangleCount=parts.reduce((n,p)=>n+p.indices.length/3,0);
 if(!meshFinite)throw Error('EXHAUST_COLLECTOR_MESH_VALIDATION_FAILED');
 scene.collectorParts=parts;AETHER.EXHAUST_COLLECTOR={loaded:true,valid:false,visualOnly:true,solverCoupled:false,assetName:'AETHER_REAR_EXHAUST_COLLECTOR_PROCEDURAL',parts,triangleCount,layout:null,facePoint:null,root:null,validation:{meshFinite}};refreshExhaustCollectorLayout(layout);if(!AETHER.EXHAUST_COLLECTOR.valid)throw Error('EXHAUST_COLLECTOR_LAYOUT_VALIDATION_FAILED');return AETHER.EXHAUST_COLLECTOR;
}

function fanRotorVisualAngle(nowMs){const f=AETHER.FAN_MODULE;if(!f?.loaded)return 0;if(f.lastVisualAt===null)f.lastVisualAt=nowMs;const dt=Math.max(0,Math.min(.1,(nowMs-f.lastVisualAt)/1000));if(f.visualRunning)f.rotorAngleRad=(f.rotorAngleRad+dt*f.visualRPM*2*Math.PI/60)%(2*Math.PI);f.lastVisualAt=nowMs;return f.rotorAngleRad}
function fanPartModel(part,angle=0,layout=null){const l=layout||AETHER.FLOW_LAYOUT?.get?.();if(!l)return identityMatrix();let local=part.matrix;if(part.role==='animated-rotor'){const t0=new Float64Array([1,0,0,0,0,1,0,0,0,0,1,0,0,2.75,0,1]),t1=new Float64Array([1,0,0,0,0,1,0,0,0,0,1,0,0,-2.75,0,1]),c=Math.cos(angle),s=Math.sin(angle),rx=new Float64Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]);local=m4mul(t0,m4mul(rx,m4mul(t1,local)))}return m4mul(l.fanRootMatrix,local)}
function collectorPartModel(part,layout=null){const l=layout||AETHER.FLOW_LAYOUT?.get?.();return l?m4mul(l.collectorRootMatrix,part.matrix):identityMatrix()}
const FAN_ASSET=window.__ASSETS.FAN_ASSET;
function loadFanModule(){
 const g=parseGLB(FAN_ASSET.base64),json=g.json,root=(json.scenes?.[json.scene]||{}).nodes||[],rootNode=(json.nodes||[]).find(n=>n.name==='AETHER_FAN_WALL_ROOT'),extras=rootNode?.extras||{},parts=[],sources=extras.smokeSources||[],mins=[Infinity,Infinity,Infinity],maxs=[-Infinity,-Infinity,-Infinity];
 if(json.asset?.version!=='2.0'||!g.bin?.byteLength)throw Error('FAN_GLTF2_OR_BIN_MISSING');
 if((json.buffers||[]).some(b=>b.uri)||(json.images||[]).some(i=>i.uri)||((json.images||[]).length>0))throw Error('FAN_EXTERNAL_OR_TEXTURE_ASSET_NOT_SUPPORTED');
 if(extras.assetType!=='single-axial-fan-wall'||extras.units!=='meters'||extras.coordinateContract?.downstreamAirflow!=='+X'||extras.coordinateContract?.up!=='+Y'||extras.coordinateContract?.lateral!=='+Z')throw Error('FAN_COORDINATE_CONTRACT_MISMATCH');
 if(!rootNode||sources.length!==64||!Array.isArray(root)||root.length!==1)throw Error('FAN_ROOT_OR_64_PORT_CONTRACT_MISMATCH');
 let primitiveCount=0,vertexCount=0,indexCount=0,triangleCount=0,normalCount=0;
 const walk=(ni,parent)=>{const node=json.nodes[ni];if(!node)throw Error('FAN_GLTF_NODE_MISSING');const M=m4mul(parent,nodeMatrix(node));if(node.mesh!==undefined){const role=node.extras?.role||'unclassified';if(role==='unclassified')throw Error('FAN_NODE_ROLE_MISSING: '+(node.name||ni));for(const pr of json.meshes[node.mesh].primitives||[]){if(pr.mode!==undefined&&pr.mode!==4)throw Error('FAN_PRIMITIVE_NOT_TRIANGLES: '+node.name);const pos=readAccessor(json,g.bin,pr.attributes.POSITION),nor=pr.attributes.NORMAL!==undefined?readAccessor(json,g.bin,pr.attributes.NORMAL):null,uv=pr.attributes.TEXCOORD_0!==undefined?readAccessor(json,g.bin,pr.attributes.TEXCOORD_0):null,idx=pr.indices!==undefined?readAccessor(json,g.bin,pr.indices):null;if(pos.n!==3||!nor||nor.n!==3||nor.count!==pos.count||uv&&(uv.n!==2||uv.count!==pos.count)||idx&&(idx.n!==1||idx.count%3||!idx.data.every(x=>Number.isInteger(x)&&x>=0&&x<pos.count)))throw Error('FAN_PRIMITIVE_ATTRIBUTE_OR_INDEX_INVALID: '+node.name);const P=new Float32Array(pos.data),N=new Float32Array(nor.data),U=new Float32Array(pos.count*2),I=idx?new Uint32Array(idx.data):new Uint32Array(Array.from({length:pos.count},(_,i)=>i));if(!P.every(Number.isFinite)||!N.every(Number.isFinite)||U.some(v=>!Number.isFinite(v)))throw Error('FAN_NONFINITE_GEOMETRY');for(let i=0;i<P.length;i+=3){const q=m4point(M,[P[i],P[i+1],P[i+2]]);for(let a=0;a<3;a++){mins[a]=Math.min(mins[a],q[a]);maxs[a]=Math.max(maxs[a],q[a])}}const mat=json.materials?.[pr.material||0]||{},pbr=mat.pbrMetallicRoughness||{};parts.push({name:node.name||'fan-part',role,positions:P,normals:N,uvs:U,indices:I,matrix:M,color:[...(pbr.baseColorFactor||[.45,.48,.50,1])],surface:Object.freeze([pbr.roughnessFactor??.65,pbr.metallicFactor??.1,0,0]),gpu:null});primitiveCount++;vertexCount+=pos.count;normalCount+=nor.count;indexCount+=I.length;triangleCount+=I.length/3;}}for(const child of node.children||[])walk(child,M)};
 const I=new Float64Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);for(const n of root)walk(n,I);
 const reported=extras.boundsM||{},reportedMin=reported.min||[],reportedMax=reported.max||[],boundsMatch=reportedMin.length===3&&reportedMax.length===3&&mins.every((v,i)=>Math.abs(v-reportedMin[i])<.012&&Math.abs(maxs[i]-reportedMax[i])<.012),roles=new Set(parts.map(p=>p.role));
 const validation={glb2:true,embeddedBuffer:true,noExternalUris:true,noExternalTextures:(json.images||[]).length===0,parts:primitiveCount===FAN_ASSET.primitiveCount,vertices:vertexCount===FAN_ASSET.vertexCount,triangles:triangleCount===FAN_ASSET.triangleCount,normals:normalCount===vertexCount,indices:indexCount===triangleCount*3,metadataBounds:boundsMatch,rootContract:true,smokeSources:sources.length===64,animatedRotor:roles.has('animated-rotor'),allPartsFinite:parts.every(p=>p.positions.every(Number.isFinite)&&p.normals.every(Number.isFinite)&&p.indices.every(i=>i>=0&&i<p.positions.length/3))};
 if(!Object.values(validation).every(Boolean))throw Error('FAN_ASSET_VALIDATION_FAILED: '+Object.entries(validation).filter(([,v])=>!v).map(([k])=>k).join(','));
 scene.fanParts=parts;const byteLength64=s=>Math.floor(s.length*3/4)-(s.endsWith('==')?2:s.endsWith('=')?1:0);AETHER.ASSETS=Object.freeze({vehicle:Object.freeze({id:'2025_BMW_M4_GT3_EVO_G82',type:'model/gltf-binary',encoding:'base64',version:'user-GLB',byteLength:byteLength64(VEHICLE_ASSET.base64),units:'meter',dimensionsM:Object.freeze([4.7,1.297449006023,1.928297490761]),scale:1,originConvention:'AETHER.VEHICLE_TRANSFORM; nose -X; +Y up; +Z lateral',sha256:VEHICLE_ASSET.sha256,embedded:true}),console:Object.freeze({id:AETHER_CONSOLE_ASSET.assetId,type:'model/gltf-binary',encoding:'base64',version:'V1',byteLength:AETHER_CONSOLE_ASSET.bytes,units:'meter',dimensionsM:Object.freeze([2.22,1.8825,1.2339]),scale:1,originConvention:'authored workstation local origin under AETHER.M6 transform',sha256:AETHER_CONSOLE_ASSET.sha256,embedded:true}),fan:Object.freeze({id:'AETHER_SINGLE_AXIAL_FAN_V2',type:'model/gltf-binary',encoding:'base64',version:'V2',byteLength:byteLength64(FAN_ASSET.base64),units:'meter',dimensionsM:Object.freeze([2.4782,5.5,8]),scale:FAN_VISUAL_SCALE,originConvention:'authored fan root; outlet plane aligned by FLOW_LAYOUT',sha256:FAN_ASSET.sha256,embedded:true})});
 AETHER.FAN_MODULE={loaded:true,visualOnly:true,solverCoupled:false,assetName:FAN_ASSET.name,sha256:FAN_ASSET.sha256,parts,smokeSources:sources.map(q=>({id:q.id,position:q.position_m.slice(),direction:q.direction.slice()})),localBounds:{min:mins,max:maxs},reportedBounds:{min:reportedMin.slice(),max:reportedMax.slice()},rotorPivot:[0,2.75,0],visualRunning:false,visualRPM:18,rotorAngleRad:0,lastVisualAt:null,validation:{...validation,sourceCount:sources.length,primitiveCount,vertexCount,triangleCount,externalUris:0}};
 AETHER.FAN_MODULE.smokeNozzleTransform=smokeNozzleTransform;AETHER.FAN_MODULE.setVisualRunning=function(enabled){this.visualRunning=!!enabled;this.lastVisualAt=null;return this.visualRunning};diagnostics.fanAsset={...AETHER.FAN_MODULE.validation,sha256:FAN_ASSET.sha256};return AETHER.FAN_MODULE;
}

let monitorAtlasCanvas=null,monitorAtlasContext=null,monitorAtlasTexture=null,monitorAtlasLastUpload=0;
function initMonitorAtlas(){if(!gl)return false;if(!monitorAtlasCanvas){monitorAtlasCanvas=document.createElement('canvas');monitorAtlasCanvas.width=1536;monitorAtlasCanvas.height=512;monitorAtlasContext=monitorAtlasCanvas.getContext('2d',{alpha:false});}if(!monitorAtlasTexture)monitorAtlasTexture=gl.createTexture();const tex=monitorAtlasTexture;gl.bindTexture(gl.TEXTURE_2D,tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,monitorAtlasCanvas.width,monitorAtlasCanvas.height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);for(const o of scene.objects)if(o.name.startsWith('m6.glb.MonitorGlass.screen.'))o.texture=tex;updateMonitorAtlas(true);return true;}
function updateMonitorAtlas(force=false){if(!monitorAtlasContext||!gl||gl.isContextLost())return;const t=performance.now();if(!force&&t-monitorAtlasLastUpload<200)return;monitorAtlasLastUpload=t;const c=monitorAtlasContext,s=AETHER.M14?.getSnapshot?.(),solver=s?.solver,diag=s?.diagnostic,last=diag?.lastStep;const tiles=[{title:'SYSTEM STATUS',lines:[`CFD SOURCE  ${solver?.productionBound?'PRODUCT':'UNBOUND'}`,`STATE  ${solver?.state||'S0 SHELL'}`,`FIELD  ${solver?.productionBound?'AVAILABLE':'WAITING FOR FIELD'}`,`GEOMETRY REV  ${AETHER.CFD_BRIDGE?.geometryRevision??'N/A'}`]},{title:'FLOW CONTROL',lines:[`SETPOINT  ${Number.isFinite(s?.control?.windSpeed)?s.control.windSpeed.toFixed(1)+' m/s':'N/A'}`,`ACTUAL VELOCITY  ${solver?.productionBound?'N/A':'N/A'}`,`SOURCE  ${solver?.productionBound?'PRODUCT':'NO PRODUCT SOURCE'}`,`PRESSURE / Cp  ${solver?.productionBound?'N/A':'N/A'}`]},{title:'TEST INTERLOCK',lines:[`E-STOP  ${s?.control?.emergencyStopped?'LATCHED':'READY'}`,`ROLLING ROAD  ${s?.rollingRoad?.motorEnabled?'RUN':'STOPPED'}`,`OFFICE DIAGNOSTIC  ${diag?.historyCount?'AVAILABLE · '+(diag.resolution?.join('×')||'N/A'):'NOT RUN'}`,`LAST STEP  ${last?String(last.sequence)+' · t='+Number(last.time).toFixed(3)+' s':'N/A'}`]}];c.clearRect(0,0,1536,512);tiles.forEach((tile,i)=>{const x=i*512;c.fillStyle='#09131a';c.fillRect(x,0,512,512);c.fillStyle=i===2&&s?.control?.emergencyStopped?'#7d1f1a':'#15313d';c.fillRect(x,0,512,66);c.fillStyle='#f1f6f8';c.font='600 25px system-ui, sans-serif';c.fillText(tile.title,x+28,43);c.fillStyle='#7fe0c0';c.font='18px ui-monospace, monospace';tile.lines.forEach((line,j)=>c.fillText(line,x+28,124+j*65));c.strokeStyle='#31505d';c.lineWidth=2;c.strokeRect(x+12,12,488,488);});gl.bindTexture(gl.TEXTURE_2D,monitorAtlasTexture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,monitorAtlasCanvas);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);}
function setupResources(){for(const o of scene.objects){if(!o._mesh)bevelMesh(o);const uv=o._mesh.uvs?.length===o._mesh.positions.length/3*2?o._mesh.uvs:new Float32Array(o._mesh.positions.length/3*2);o.gpu=bindMesh(o._mesh.positions,o._mesh.normals,uv,o._mesh.indices);}for(const p of scene.vehicleParts)p.gpu=bindMesh(p.positions,p.normals,p.uvs,p.indices);for(const r of scene.roadParts)r.gpu=bindMesh(r.mesh.positions,r.mesh.normals,r.mesh.uvs,r.mesh.indices);for(const p of scene.fanParts)p.gpu=bindMesh(p.positions,p.normals,p.uvs,p.indices);for(const p of scene.collectorParts)p.gpu=bindMesh(p.positions,p.normals,p.uvs,p.indices)}
function drawMesh(mesh,m,material,alpha=1){gl.bindBuffer(gl.ARRAY_BUFFER,mesh.pb);gl.enableVertexAttribArray(loc.pos);gl.vertexAttribPointer(loc.pos,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,mesh.nb);gl.enableVertexAttribArray(loc.normal);gl.vertexAttribPointer(loc.normal,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,mesh.ub);gl.enableVertexAttribArray(loc.uv);gl.vertexAttribPointer(loc.uv,2,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.ib);gl.uniform4f(loc.color,...(material.color||[.5,.55,.6,1]));gl.uniform4f(loc.surface,...(material.surface||[.72,0,0,.018]));gl.uniform1f(loc.colorLinear,material.colorLinear?1:0);gl.uniform1f(loc.alpha,alpha);gl.uniform1f(loc.useTex,material.texture?1:0);gl.uniform1f(loc.beltSurface,material.belt?1:0);gl.uniform1f(loc.beltTravel,material.beltTravel||0);gl.uniform1f(loc.rollerSurface,material.roller?1:0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,material.texture||whiteTexture);gl.uniform1i(loc.tex,0);gl.drawElements(gl.TRIANGLES,mesh.count,mesh.type,0)}

function visibleInView(o){if(!o.visible)return false;if(rollingState.roadSection&&(['rolling-road pit','rolling-road service'].includes(o.category)||o.name==='service.downstream'))return false;return !(camera.cutaway&&(['m5 ceiling','ceiling','lighting recess','observation opening','observation glass'].includes(o.category)||['control room ceiling','structural portal crown'].includes(o.name)))}

/* M13 smoke-style tracer: visual advection over a frozen solver snapshot, not transient smoke physics. */
// One layout authority for facility, authored fan, CFD and tracers.
const FAN_VISUAL_SCALE=.90;
let flowLayoutCache=null;
function fanRootMatrix(position,scale=FAN_VISUAL_SCALE){return new Float64Array([scale,0,0,0,0,scale,0,0,0,0,scale,0,position[0],position[1],position[2],1])}
function transformBounds(bounds,m){const pts=[];for(const x of[bounds.min[0],bounds.max[0]])for(const y of[bounds.min[1],bounds.max[1]])for(const z of[bounds.min[2],bounds.max[2]])pts.push(m4point(m,[x,y,z]));return{min:[0,1,2].map(i=>Math.min(...pts.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...pts.map(p=>p[i]))),corners:pts}}
function smokeHeightSafe(base,g,fan){let h=smokeState.height;try{const bb=transformBounds(fan.localBounds,fanRootMatrix([0,base,0]));h=Math.min(Math.max(h,g.min[1]-bb.min[1]+.02),g.max[1]-bb.max[1]-.02)}catch(e){}return Math.max(-2,Math.min(2,h))}
function flowLayout(frame){
 const g=frame?.grid||{min:CFD_DOMAIN_CONTRACT.bounds.min,max:CFD_DOMAIN_CONTRACT.bounds.max,resolution:[32,32,32]},vt=AETHER.VEHICLE_TRANSFORM,signature=CFD_BRIDGE.geometrySignature(),fan=AETHER.FAN_MODULE;
 if(!fan?.loaded)throw Error('FLOW_LAYOUT: embedded fan asset is unavailable');
 const key=[signature,g.min.join(','),g.max.join(','),g.resolution.join(','),smokeState.height,smokeState.lateral,smokeState.emitterFraction,frame?.sourceId||'FACILITY',frame?.sequence??-1].join('|');
 if(flowLayoutCache?.key===key)return flowLayoutCache.value;
 const evidence=vehicleFrontEvidence();if(!evidence.verified)throw Error('FLOW_LAYOUT: vehicle front is not verified from body geometry');
 const origin=vt.localToWorld([0,0,0]),nosePoint=vt.localToWorld(evidence.localNose),nd=nosePoint.map((v,i)=>v-origin[i]),nl=Math.hypot(...nd),vehicleNoseDirection=nd.map(v=>v/nl),flowDirection=[1,0,0];
 const body=scene.vehicleParts.find(p=>p.role==='body')?.positions;if(!body)throw Error('FLOW_LAYOUT: missing CFD solid body geometry');let lo=Infinity,hi=-Infinity;
 for(let i=0;i<body.length;i+=3){lo=Math.min(lo,body[i]);hi=Math.max(hi,body[i]);}
 const vehicleFrontPoint=vt.localToWorld([hi,0,0]),vehicleRearPoint=vt.localToWorld([lo,0,0]),vehicleLength=vehicleRearPoint[0]-vehicleFrontPoint[0];
 if(!(vehicleLength>0&&vehicleNoseDirection[0]<-.999&&vehicleFrontPoint[0]<vehicleRearPoint[0]))throw Error('FLOW_LAYOUT: vehicle nose/rear do not align with +X downstream');
 const emitterDistance=vehicleLength*smokeState.emitterFraction,emitterX=vehicleFrontPoint[0]-emitterDistance,collectorX=g.max[0]-.42;
 const centerY=(g.min[1]+g.max[1])*.5,centerZ=(g.min[2]+g.max[2])*.5,src=fan.smokeSources;if(src.length!==64)throw Error('FLOW_LAYOUT: expected the 64 authored fan ports');
 const sourceCenter=[0,1,2].map(a=>src.reduce((q,s)=>q+s.position[a],0)/src.length);
 if(src.some(s=>Math.abs(s.position[0]-sourceCenter[0])>1e-8))throw Error('FLOW_LAYOUT: fan outlet ports do not share one plane');
 const fanBoundsCenter=fan.localBounds.min.map((v,i)=>(v+fan.localBounds.max[i])*.5),fanRoot=[emitterX-FAN_VISUAL_SCALE*sourceCenter[0],centerY-FAN_VISUAL_SCALE*fanBoundsCenter[1]+smokeHeightSafe(centerY-FAN_VISUAL_SCALE*fanBoundsCenter[1],g,fan),centerZ-FAN_VISUAL_SCALE*fanBoundsCenter[2]+smokeState.lateral],fanRootMatrixValue=fanRootMatrix(fanRoot),fanBounds=transformBounds(fan.localBounds,fanRootMatrixValue);
 const nozzleTransforms=src.map((s,index)=>{const p=m4point(fanRootMatrixValue,s.position),d=m4vector(fanRootMatrixValue,s.direction),n=Math.hypot(...d);return Object.freeze({id:s.id,index,sourceIndex:index,position:p,direction:d.map(v=>v/n),radius:.045,fanRootMatrix:fanRootMatrixValue})});
 const collectorOpening={halfHeight:(g.max[1]-g.min[1])*.38,halfWidth:(g.max[2]-g.min[2])*.38,throatRatio:.66,hoodDepth:.86,overhangMeters:.55},collectorRoot=[collectorX+.035,centerY,centerZ],collectorRootMatrix=new Float64Array([-1,0,0,0,0,1,0,0,0,0,-1,0,collectorRoot[0],collectorRoot[1],collectorRoot[2],1]),collectorDuctEndLocalX=-(collectorOpening.hoodDepth+collectorOpening.overhangMeters),collectorDuctEndWorldX=collectorRoot[0]-collectorDuctEndLocalX;
 const collectorPlane=Object.freeze({x:collectorX,point:Object.freeze([collectorX,centerY,centerZ]),normal:Object.freeze([-1,0,0])}),emitterPlane=Object.freeze({x:emitterX,point:Object.freeze([emitterX,centerY,centerZ]),normal:Object.freeze([1,0,0])}),inletPlane=Object.freeze({x:g.min[0],point:Object.freeze([g.min[0],centerY,centerZ]),normal:Object.freeze([-1,0,0])}),outletPlane=Object.freeze({x:g.max[0],point:Object.freeze([g.max[0],centerY,centerZ]),normal:Object.freeze([1,0,0])});
 const inside=(p,b=.02)=>p.every((v,i)=>v>=g.min[i]+b&&v<=g.max[i]-b),portsInDomain=nozzleTransforms.every(n=>inside(n.position,.01)),fanInDomain=fanBounds.min.every((v,i)=>v>=g.min[i]-.002)&&fanBounds.max.every((v,i)=>v<=g.max[i]+.002),collectorCorners=[[-1,-1],[-1,1],[1,-1],[1,1]].map(([a,b])=>[collectorX,centerY+a*collectorOpening.halfHeight,centerZ+b*collectorOpening.halfWidth]),collectorFrameCorners=[[-1,-1],[-1,1],[1,-1],[1,1]].map(([a,b])=>[collectorX,centerY+a*(collectorOpening.halfHeight+.28),centerZ+b*(collectorOpening.halfWidth+.28)]),collectorInside=collectorCorners.every(p=>inside(p))&&collectorFrameCorners.every(p=>inside(p));
 if(frame?.solidMask?.data){for(const n of nozzleTransforms){const c=n.position.map((v,i)=>Math.floor((v-g.min[i])/(g.max[i]-g.min[i])*g.resolution[i]));if(m13SolidVoxel(frame,...c))throw Error('FLOW_LAYOUT: authored nozzle '+n.index+' intersects a CFD solid voxel');}}
 const checks={vehicleNoseOpposesMeanFlow:vehicleNoseDirection[0]<-.999,actualBodyFrontVerified:evidence.verified,emitterUpstreamOfActualFront:emitterX<vehicleFrontPoint[0],emitterDistanceAboutHalfLength:smokeState.emitterFraction>=.35&&smokeState.emitterFraction<=.65,all64PortsShareEmitterPlane:nozzleTransforms.every(n=>Math.abs(n.position[0]-emitterX)<1e-8),allPortsFaceDownstream:nozzleTransforms.every(n=>n.direction[0]>.999),allPortsInsideDomain:portsInDomain,fanInsideDomain:fanInDomain,collectorDownstreamOfActualRear:collectorX>vehicleRearPoint[0],collectorFaceInsideDomain:collectorInside,collectorMouthFacesUpstream:collectorPlane.normal[0]<-.999,collectorDuctExtendsDownstream:collectorDuctEndWorldX>collectorX,clearanceWithinUIBounds:Math.abs(smokeState.height)<=2+1e-9&&Math.abs(smokeState.lateral)<=.30+1e-9};
 const clearanceLimits={emitterFraction:[.35,.65],heightOffsetMeters:[Math.max(g.min[1]-fanBounds.min[1],-2),Math.min(g.max[1]-fanBounds.max[1],2)],lateralOffsetMeters:[Math.max(g.min[2]-fanBounds.min[2],-.30),Math.min(g.max[2]-fanBounds.max[2],.30)],fanBoundsInDomain:fanInDomain,collectorFaceMargins:{x:[collectorX-g.min[0],g.max[0]-collectorX],y:[collectorOpening.halfHeight,(g.max[1]-g.min[1])*.5-collectorOpening.halfHeight],z:[collectorOpening.halfWidth,(g.max[2]-g.min[2])*.5-collectorOpening.halfWidth]}};
 const errors=Object.entries(checks).filter(([,v])=>!v).map(([k])=>k);if(errors.length)throw Error('FLOW_LAYOUT blocked: '+errors.join(', '));
 const value=Object.freeze({version:'FLOW_LAYOUT_V4',unit:'meter',flowDirection:Object.freeze(flowDirection),vehicleNoseDirection:Object.freeze(vehicleNoseDirection),vehicleFrontPoint:Object.freeze(vehicleFrontPoint),vehicleRearPoint:Object.freeze(vehicleRearPoint),vehicleLength,emitterPlane,emitterDistance,emitterFraction:smokeState.emitterFraction,fanRoot:Object.freeze(fanRoot),fanRootMatrix:fanRootMatrixValue,fanBounds,fanScale:FAN_VISUAL_SCALE,nozzleTransforms:Object.freeze(nozzleTransforms),collectorPlane,inletPlane,outletPlane,collectorRoot:Object.freeze(collectorRoot),collectorRootMatrix,collectorOpening,collectorDuctEndLocalX,collectorDuctEndWorldX,collectorFadeStartX:collectorX-SMOKE_CONFIG.outletFadeMeters,domainBounds:{min:g.min.slice(),max:g.max.slice()},clearanceLimits,checks,valid:true,diagnostics:{status:'VALIDATED_GEOMETRY',vehicleNoseFlowDot:vehicleNoseDirection[0],portCount:nozzleTransforms.length,emitterDistanceMeters:emitterDistance,emitterFraction:smokeState.emitterFraction,collectorBehindRearMeters:collectorX-vehicleRearPoint[0],collectorFaceX:collectorX,fanBounds,collectorDuctEndWorldX,errors:[]}});
 fan.layout=value;if(AETHER.EXHAUST_COLLECTOR?.loaded)refreshExhaustCollectorLayout(value);diagnostics.flowLayout=value.diagnostics;flowLayoutCache={key,value};return value;
}
const FLOW_LAYOUT=Object.freeze({get:flowLayout});AETHER.FLOW_LAYOUT=FLOW_LAYOUT;
const FLOW_DOMAIN=Object.freeze({flowDirection:Object.freeze([1,0,0]),inletPlane(frame){return FLOW_LAYOUT.get(frame).inletPlane.x},outletPlane(frame){return FLOW_LAYOUT.get(frame).outletPlane.x},outletFadeStart(frame){return FLOW_LAYOUT.get(frame).collectorFadeStartX},outletNormal:Object.freeze([1,0,0])});
const SMOKE_CONFIG=Object.freeze({baseSize:.105,maxSize:.26,birthFade:.10,deathFadeStart:.78,outletFadeMeters:1.15,quality:Object.freeze({LOW:{particles:500},OFFICE:{particles:2000},HIGH:{particles:4000},ULTRA:{particles:8000},MAX:{particles:12000}})});
const smokeEvents={OUTLET_RECOVERED:0,OUTLET_BACKFLOW:0,SIDE_ESCAPE:0,FLOOR_ESCAPE:0,CEILING_ESCAPE:0,SOLID_COLLISION:0,TTL_EXPIRED:0,INVALID:0,MANUAL_RESET:0,unknown:0};
const smokePerf={frames:[],lastFrame:performance.now(),fps:0,meanMs:0,p95Ms:0,updateMs:0,renderMs:0,webglError:'not checked'};
let appState='BOOT',cfdSimulationTime=0,particlePlaybackTime=0,smokeSpawnCount=0;
function smokeSetState(next){appState=next;const s=document.getElementById('smokeAppState');if(s)s.textContent=next;}
function smokeRecordFrame(now){const dt=Math.max(0,now-smokePerf.lastFrame);smokePerf.lastFrame=now;if(dt>0&&dt<1000){smokePerf.frames.push(dt);if(smokePerf.frames.length>120)smokePerf.frames.shift();const a=smokePerf.frames.slice().sort((x,y)=>x-y);smokePerf.meanMs=smokePerf.frames.reduce((x,y)=>x+y,0)/smokePerf.frames.length;smokePerf.p95Ms=a[Math.min(a.length-1,Math.floor(a.length*.95))]||0;smokePerf.fps=1000/Math.max(.1,smokePerf.meanMs)}}
function smokeDiagnosticsSnapshot(){const f=m13FrameState.frame;return{appState,cfd:{grid:f?.grid?.resolution||[32,32,32],step:f?.sequence??0,timeSeconds:f?.simulationTime??cfdSimulationTime,status:f?'LATEST_ACCEPTED_SNAPSHOT':'WAITING'},particlePlayback:{timeSeconds:smokeState.playbackTime,displayScale:smokeState.speedMultiplier,count:smokeState.count,active:smokeState.activeCount,spawnCount:smokeSpawnCount},recycle:{...smokeEvents},performance:{fps:smokePerf.fps,meanFrameMs:smokePerf.meanMs,p95FrameMs:smokePerf.p95Ms,particleUpdateMs:smokePerf.updateMs,renderMs:smokePerf.renderMs},velocityClamp:{active:Number.isFinite(smokeState.localStepSpeedCap),maxStepMps:smokeState.localStepSpeedCap},fieldStatus:f?'Latest accepted diagnostic CFD snapshot':'CFD unavailable',smokeStatus:!f?'WAITING':!smokeState.enabled?'OFF':smokeState.playing?'PLAYING':'PAUSED',webglError:smokePerf.webglError,flowDriver:'CFD VELOCITY FIELD · FLOW +X',fan:'VISUALIZATION ONLY',flowDirection:'VEHICLE NOSE -X; FREESTREAM +X'}}
function smokeParticleEvent(frame,index,reason,context={}){if(reason==='SPAWN'){smokeState.lastRecycle={index,reason,context,time:smokeState.playbackTime};smokeRespawn(frame,index,!!context.initial);smokeSpawnCount++;return reason}if(!(reason in smokeEvents)){smokeEvents.unknown++;reason='INVALID'}smokeEvents[reason]++;if(reason==='OUTLET_RECOVERED')smokeState.captured++;smokeState.lastRecycle={index,reason,context,time:smokeState.playbackTime};smokeRespawn(frame,index,!!context.initial);smokeSpawnCount++;return reason}
function smokeRecycleParticle(frame,index,reason,context={}){return smokeParticleEvent(frame,index,reason,context)}
const smokeState={enabled:true,playing:true,count:2000,capacity:12000,positions:null,sizes:null,ages:null,lifetimes:null,alphas:null,sizeVariation:null,random:null,program:null,posBuffer:null,sizeBuffer:null,alphaBuffer:null,frameId:null,lastTime:null,accumulator:0,sequence:-1,frameKey:null,activeCount:0,resetRequested:false,paths:null,solidBounds:null,height:-.12,lateral:0,emitterFraction:.50,seed:0x51a7e,drawCalls:0,resourceCreates:0,resourceDeletes:0,warmStartMs:0,playbackTime:0,speedMultiplier:5000,effectiveMultiplier:5000,maxFieldSpeed:0,localStepSpeedCap:Infinity,captured:0,lastStatusAt:0,lastRecycle:null,layoutError:null,prefill:false,selectedNozzle:-1,nozzleOffsets:Array.from({length:64},()=>[0,0])};
function smokeRand(){smokeState.seed=(Math.imul(smokeState.seed,1664525)+1013904223)>>>0;return smokeState.seed/4294967296}
function smokeCompile(type,source){const sh=gl.createShader(type);gl.shaderSource(sh,source);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)){const why=gl.getShaderInfoLog(sh);gl.deleteShader(sh);throw Error('SMOKE_SHADER_COMPILE '+why)}return sh}
function smokeRelease(){if(window.__RIB){window.__RIB.prog=null;window.__RIB.vao=null;window.__RIB.key=''}smokeState.frameKey=null;smokeState.activeCount=0;smokeState.lastTime=null;smokeHardwareRelease();if(!gl)return;for(const k of ['posBuffer','sizeBuffer','alphaBuffer'])if(smokeState[k]){gl.deleteBuffer(smokeState[k]);smokeState[k]=null;smokeState.resourceDeletes++}if(smokeState.program){gl.deleteProgram(smokeState.program);smokeState.program=null;smokeState.resourceDeletes++}}
function smokeEnsureResources(){if(smokeState.program&&smokeState.posBuffer&&smokeState.sizeBuffer&&smokeState.alphaBuffer)return;const vs=smokeCompile(gl.VERTEX_SHADER,`#version 300 es
precision highp float;in vec3 a_position;in float a_size;in float a_alpha;uniform mat4 u_mvp;uniform float u_viewScale;out float v_alpha;out float v_life;out float v_seed;void main(){vec4 p=u_mvp*vec4(a_position,1.0);gl_Position=p;gl_PointSize=clamp(a_size*1.25*u_viewScale/max(.35,p.w),4.0,64.0);v_alpha=a_alpha;v_life=clamp((a_size-.105)/.155,0.0,1.0);v_seed=fract(sin(float(gl_VertexID)*12.9898)*43758.5453);}`),fs=smokeCompile(gl.FRAGMENT_SHADER,`#version 300 es
precision highp float;in float v_alpha;in float v_life;in float v_seed;out vec4 outColor;
float hs(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(hs(i),hs(i+vec2(1.0,0.0)),f.x),mix(hs(i+vec2(0.0,1.0)),hs(i+vec2(1.0,1.0)),f.x),f.y);}
void main(){vec2 q=gl_PointCoord*2.0-1.0;float r2=dot(q,q);if(r2>1.0)discard;float ang=v_seed*6.2831;vec2 w=vec2(cos(ang)*q.x-sin(ang)*q.y,sin(ang)*q.x+cos(ang)*q.y);
float nz=vn(w*2.6+v_seed*40.0)*0.6+vn(w*5.3+v_seed*17.0)*0.4;
float edge=1.0-smoothstep(0.12,1.0,r2+(nz-0.5)*0.6);float core=exp(-3.4*r2);
float dens=clamp(edge*0.72+core*0.5,0.0,1.0)*(0.7+0.6*nz);
float lit=clamp(0.5+0.45*(-q.y)+0.2*q.x*-1.0+0.25*(nz-0.5),0.0,1.0);
vec3 shade=mix(vec3(0.30,0.46,0.60),vec3(1.0,1.0,1.0),lit);
vec3 col=mix(vec3(0.58,0.90,1.0)*shade+0.08,shade*vec3(0.86,0.93,1.0),v_life*0.8);
col+=vec3(0.35,0.7,1.0)*pow(1.0-r2,3.0)*0.12*(1.0-v_life);
float a=dens*v_alpha*0.95;if(a<0.004)discard;outColor=vec4(col*a,a*0.62);}`),program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(program,gl.LINK_STATUS)){gl.deleteProgram(program);throw Error('SMOKE_PROGRAM_LINK '+gl.getProgramInfoLog(program))}smokeState.program=program;smokeState.posBuffer=gl.createBuffer();smokeState.sizeBuffer=gl.createBuffer();smokeState.alphaBuffer=gl.createBuffer();smokeState.resourceCreates+=4;smokeState.positions=new Float32Array(smokeState.capacity*3);smokeState.sizes=new Float32Array(smokeState.capacity);smokeState.ages=new Float32Array(smokeState.capacity);smokeState.lifetimes=new Float32Array(smokeState.capacity);smokeState.alphas=new Float32Array(smokeState.capacity);smokeState.sizeVariation=new Float32Array(smokeState.capacity);smokeState.seed=0x51a7e;for(let i=0;i<smokeState.capacity;i++){smokeState.sizes[i]=.19+smokeRand()*.21;smokeState.sizeVariation[i]=.9+smokeRand()*.2;smokeState.lifetimes[i]=(8+smokeRand()*5)*(.9+smokeRand()*.2);smokeState.ages[i]=0}gl.bindBuffer(gl.ARRAY_BUFFER,smokeState.posBuffer);gl.bufferData(gl.ARRAY_BUFFER,smokeState.positions.byteLength,gl.DYNAMIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,smokeState.sizeBuffer);gl.bufferData(gl.ARRAY_BUFFER,smokeState.sizes.byteLength,gl.DYNAMIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,smokeState.alphaBuffer);gl.bufferData(gl.ARRAY_BUFFER,smokeState.alphas.byteLength,gl.DYNAMIC_DRAW);smokeState.frameId=null;smokeState.lastTime=null;smokeState.accumulator=0;smokeState.resourceCreates+=3}
function smokeNozzleTransform(frame,index){const t=FLOW_LAYOUT.get(frame).nozzleTransforms[index];if(!t)throw Error('FLOW_LAYOUT: invalid nozzle index '+index);return t}
function smokeNozzle(frame,index,out){const t=smokeNozzleTransform(frame,index);out[0]=t.position[0];out[1]=t.position[1];out[2]=t.position[2];return t}

function smokeRespawn(frame,i,initial=false){const o=i*3,total=FLOW_LAYOUT.get(frame).nozzleTransforms.length,n=smokeState.selectedNozzle>=0?smokeState.selectedNozzle:i%total,p=smokeState.positions,origin=[0,0,0];smokeNozzle(frame,n,origin);const spreadY=(smokeRand()-.5)*.075,spreadZ=(smokeRand()-.5)*.18;p[o]=origin[0];p[o+1]=origin[1]+spreadY;p[o+2]=origin[2]+spreadZ;if(!smokeInside(frame,p[o],p[o+1],p[o+2]))throw Error('SMOKE_SPAWN_OUTSIDE_DOMAIN');const g=frame.grid,cell=[p[o],p[o+1],p[o+2]].map((v,k)=>Math.floor((v-g.min[k])/(g.max[k]-g.min[k])*g.resolution[k]));if(m13SolidVoxel(frame,...cell))throw Error('SMOKE_SPAWN_INSIDE_SOLID_VOXEL');smokeState.ages[i]=initial&&smokeState.playing&&!smokeState.prefill?-(i/smokeState.count)*3:0;smokeState.lifetimes[i]=(8+smokeRand()*5)*(.9+smokeRand()*.2);if(smokeState.alphas)smokeState.alphas[i]=0;}
function smokeSample(frame,x,y,z,out){const g=frame.grid,v=frame.fields.velocity.data,nx=g.resolution[0],ny=g.resolution[1],nz=g.resolution[2],hx=(g.max[0]-g.min[0])/nx,hy=(g.max[1]-g.min[1])/ny,hz=(g.max[2]-g.min[2])/nz,tx=clamp((x-g.min[0])/hx-.5,0,nx-1),ty=clamp((y-g.min[1])/hy-.5,0,ny-1),tz=clamp((z-g.min[2])/hz-.5,0,nz-1),x0=Math.floor(tx),y0=Math.floor(ty),z0=Math.floor(tz),x1=Math.min(x0+1,nx-1),y1=Math.min(y0+1,ny-1),z1=Math.min(z0+1,nz-1),fx=tx-x0,fy=ty-y0,fz=tz-z0;for(let c=0;c<3;c++){const a=v[(x0+nx*(y0+ny*z0))*3+c]*(1-fx)+v[(x1+nx*(y0+ny*z0))*3+c]*fx,b=v[(x0+nx*(y1+ny*z0))*3+c]*(1-fx)+v[(x1+nx*(y1+ny*z0))*3+c]*fx,d=v[(x0+nx*(y0+ny*z1))*3+c]*(1-fx)+v[(x1+nx*(y0+ny*z1))*3+c]*fx,e=v[(x0+nx*(y1+ny*z1))*3+c]*(1-fx)+v[(x1+nx*(y1+ny*z1))*3+c]*fx;out[c]=(a*(1-fy)+b*fy)*(1-fz)+(d*(1-fy)+e*fy)*fz}return true}
function smokeAdvectionSample(frame,x,y,z,out){flowSample(frame,x,y,z,out);let speed=Math.hypot(out[0],out[1],out[2]);if(speed<1e-9)return false;out[0]*=smokeState.speedMultiplier;out[1]*=smokeState.speedMultiplier;out[2]*=smokeState.speedMultiplier;speed*=smokeState.speedMultiplier;if(speed>smokeState.localStepSpeedCap){const q=smokeState.localStepSpeedCap/speed;out[0]*=q;out[1]*=q;out[2]*=q}return true}
function smokeMeasureMaxSpeed(frame){const v=frame.fields.velocity.data,m=frame.solidMask.data,n=m.length;let hi=0;for(let i=0;i<n;i++)if(!m[i]){const o=i*3,q=Math.hypot(v[o],v[o+1],v[o+2]);if(q>hi)hi=q}smokeState.maxFieldSpeed=hi}

function smokeInside(frame,x,y,z){const g=frame.grid;return x>=g.min[0]&&x<=g.max[0]&&y>=g.min[1]&&y<=g.max[1]&&z>=g.min[2]&&z<=g.max[2]}
function smokeMayHitSolid(frame,x0,y0,z0,x1,y1,z1){const g=frame.grid,m=frame.solidMask.data,[nx,ny,nz]=g.resolution,b=smokeState.solidBounds||(smokeState.solidBounds=CFD_BRIDGE.getAlignmentReport().solidBounds),hx=(g.max[0]-g.min[0])/nx,hy=(g.max[1]-g.min[1])/ny,hz=(g.max[2]-g.min[2])/nz,pad=Math.max(hx,hy,hz);if(Math.max(x0,x1)<b.min[0]-pad||Math.min(x0,x1)>b.max[0]+pad||Math.max(y0,y1)<b.min[1]-pad||Math.min(y0,y1)>b.max[1]+pad||Math.max(z0,z1)<b.min[2]-pad||Math.min(z0,z1)>b.max[2]+pad)return false;const ix0=Math.max(0,Math.floor((Math.min(x0,x1)-g.min[0])/hx)-1),ix1=Math.min(nx-1,Math.floor((Math.max(x0,x1)-g.min[0])/hx)+1),iy0=Math.max(0,Math.floor((Math.min(y0,y1)-g.min[1])/hy)-1),iy1=Math.min(ny-1,Math.floor((Math.max(y0,y1)-g.min[1])/hy)+1),iz0=Math.max(0,Math.floor((Math.min(z0,z1)-g.min[2])/hz)-1),iz1=Math.min(nz-1,Math.floor((Math.max(z0,z1)-g.min[2])/hz)+1);for(let k=iz0;k<=iz1;k++)for(let j=iy0;j<=iy1;j++)for(let i=ix0;i<=ix1;i++)if(m[i+nx*(j+ny*k)])return true;return false}
function smokeBoundaryHit(frame,p0,p1){const g=frame?.grid;if(!g||!Array.isArray(p0)||!Array.isArray(p1)||p0.length!==3||p1.length!==3||!p0.every(Number.isFinite)||!p1.every(Number.isFinite))return null;const d=p1.map((v,i)=>v-p0[i]),hits=[];const add=(axis,value,reason,normal)=>{if(!Number.isFinite(value)||!Number.isFinite(d[axis])||Math.abs(d[axis])<1e-12)return;const t=(value-p0[axis])/d[axis];if(!Number.isFinite(t)||t<0||t>1)return;const q=p0.map((v,i)=>v+d[i]*t);if(q.every((v,i)=>Number.isFinite(v)&&v>=g.min[i]-1e-6&&v<=g.max[i]+1e-6))hits.push({t,point:q,reason,normal})};add(0,FLOW_DOMAIN.outletPlane(frame),'OUTLET',FLOW_DOMAIN.outletNormal);add(0,FLOW_DOMAIN.inletPlane(frame),'INLET',[-1,0,0]);add(2,g.min[2],'SIDE_ESCAPE',[0,0,-1]);add(2,g.max[2],'SIDE_ESCAPE',[0,0,1]);add(1,g.min[1],'FLOOR_ESCAPE',[0,-1,0]);add(1,g.max[1],'CEILING_ESCAPE',[0,1,0]);hits.sort((a,b)=>a.t-b.t);return hits[0]||null}
function smokeClassifyBoundary(frame,hit,velocity){if(!hit||!velocity||!velocity.every(Number.isFinite))return 'INVALID';const dot=velocity[0]*hit.normal[0]+velocity[1]*hit.normal[1]+velocity[2]*hit.normal[2];if(hit.reason==='OUTLET')return dot>0?'OUTLET_RECOVERED':'OUTLET_BACKFLOW';if(hit.reason==='INLET')return dot>0?'OUTLET_BACKFLOW':'INVALID';return hit.reason}
function smokeWobble(v,P,i,fr){const g=fr.grid,x=Math.max(0,Math.min(1,(P[0]-g.min[0])/(g.max[0]-g.min[0]))),s=Math.hypot(v[0],v[1],v[2])*.07*(.25+.75*x),t=smokeState.playbackTime*2.2,k=i*.618;v[1]+=s*Math.sin(P[0]*9+t+k)*Math.cos(P[2]*7-t*.7);v[2]+=s*Math.sin(P[1]*8-t*1.1+k*1.7)}
function smokeAdvanceOne(frame,i,dt,checkLifetime=true){const a=smokeTmpA,b=smokeTmpB,p=smokeState.positions,o=i*3;if(smokeState.ages[i]<0){smokeState.ages[i]=Math.min(0,smokeState.ages[i]+dt);return true}const P0=[p[o],p[o+1],p[o+2]];if(!P0.every(Number.isFinite)){smokeRecycleParticle(frame,i,'INVALID',{phase:'old-position'});return false}if(checkLifetime&&smokeState.ages[i]>=smokeState.lifetimes[i]){smokeRecycleParticle(frame,i,'TTL_EXPIRED',{age:smokeState.ages[i]});return false}if(!smokeAdvectionSample(frame,...P0,a)){smokeRecycleParticle(frame,i,'INVALID',{phase:'velocity-at-old'});return false}const mid=P0.map((v,k)=>v+a[k]*dt*.5);if(!mid.every(Number.isFinite)){smokeRecycleParticle(frame,i,'INVALID',{phase:'midpoint'});return false}const validMid=smokeInside(frame,...mid);if(validMid&&!smokeAdvectionSample(frame,...mid,b)){smokeRecycleParticle(frame,i,'INVALID',{phase:'velocity-at-midpoint'});return false}if(!validMid)b.set(a);smokeWobble(b,P0,i,frame);const P1=P0.map((v,k)=>v+b[k]*dt);if(!P1.every(Number.isFinite)){smokeRecycleParticle(frame,i,'INVALID',{phase:'new-position'});return false}smokeState.ages[i]+=dt;if(bodyInside(P1[0],P1[1],P1[2])){smokeRecycleParticle(frame,i,'SOLID_COLLISION',{body:true});return false}const solid=smokeMayHitSolid(frame,...P0,...P1)&&m13SegmentHitsSolid(frame,P0,P1);if(solid){smokeRecycleParticle(frame,i,'SOLID_COLLISION',{from:P0,to:P1});return false}const hit=smokeBoundaryHit(frame,P0,P1);if(hit){let reason;if(hit.reason==='OUTLET'){const crossVelocity=smokeTmpB;smokeSample(frame,...hit.point,crossVelocity);reason=smokeClassifyBoundary(frame,hit,Array.from(crossVelocity))}else if(hit.reason==='INLET')reason=smokeClassifyBoundary(frame,hit,Array.from(smokeTmpB));else reason=hit.reason;smokeRecycleParticle(frame,i,reason,{point:hit.point,t:hit.t});return false}if(!smokeInside(frame,...P1)){const reason=P1[0]>frame.grid.max[0]?'OUTLET_BACKFLOW':Math.abs(P1[2]-frame.grid.min[2])<1e-5||Math.abs(P1[2]-frame.grid.max[2])<1e-5?'SIDE_ESCAPE':P1[1]<frame.grid.min[1]?'FLOOR_ESCAPE':'CEILING_ESCAPE';smokeRecycleParticle(frame,i,reason,{fallback:true,to:P1});return false}p[o]=P1[0];p[o+1]=P1[1];p[o+2]=P1[2];return true}

function smokeBuildRoute(frame,seed){const points=[seed.slice()],times=[0],dt=.05,maxSteps=240;let p=seed.slice(),time=0;for(let n=0;n<maxSteps;n++){const a=smokeTmpA,b=smokeTmpB;if(!smokeAdvectionSample(frame,p[0],p[1],p[2],a))break;const mid=[p[0]+a[0]*dt*.5,p[1]+a[1]*dt*.5,p[2]+a[2]*dt*.5];if(!smokeInside(frame,mid[0],mid[1],mid[2]))break;if(!smokeAdvectionSample(frame,mid[0],mid[1],mid[2],b))break;const q=[p[0]+b[0]*dt,p[1]+b[1]*dt,p[2]+b[2]*dt];if(!smokeInside(frame,q[0],q[1],q[2])||smokeBoundaryHit(frame,p,q)||(smokeMayHitSolid(frame,p[0],p[1],p[2],q[0],q[1],q[2])&&m13SegmentHitsSolid(frame,p,q)))break;points.push(q);time+=dt;times.push(time);p=q}return{points,times,duration:time,endX:p[0]}}
function smokeWarmStart(frame,from=0,to=smokeState.count){const started=Date.now(),paths=[];smokeState.effectiveMultiplier=smokeState.speedMultiplier;const minCell=Math.min(...frame.grid.max.map((v,i)=>(v-frame.grid.min[i])/frame.grid.resolution[i]));smokeState.localStepSpeedCap=minCell*.45/.05;for(let n=0;n<8;n++){const seed=[0,0,0];smokeNozzle(frame,n,seed);paths.push(smokeBuildRoute(frame,seed))}smokeState.paths=paths;for(let i=from;i<to;i++){const route=paths[i&7],maxAge=Math.min(smokeState.lifetimes[i],route.duration),age=smokeRand()*maxAge;let lo=0,hi=route.times.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(route.times[mid]<age)lo=mid+1;else hi=mid}const k=Math.max(1,lo),t0=route.times[k-1]||0,t1=route.times[k]||0,f=t1>t0?clamp((age-t0)/(t1-t0),0,1):0,a=route.points[k-1]||route.points[0],b=route.points[k]||a,o=i*3;smokeState.positions[o]=a[0]+(b[0]-a[0])*f;smokeState.positions[o+1]=a[1]+(b[1]-a[1])*f+(smokeRand()-.5)*.035;smokeState.positions[o+2]=a[2]+(b[2]-a[2])*f+(smokeRand()-.5)*.08;smokeState.ages[i]=age}smokeState.warmStartMs=Date.now()-started;smokeState.effectiveMultiplier=smokeState.speedMultiplier}

function smokeAdvance(frame,dt){if(!frame||!frame.fields?.velocity?.data||!frame.solidMask?.data)return false;const total=clamp(dt,0,.1),minCell=Math.min(...frame.grid.max.map((v,i)=>(v-frame.grid.min[i])/frame.grid.resolution[i])),stepLen=minCell*.45,demand=smokeState.maxFieldSpeed*smokeState.speedMultiplier*total/stepLen,steps=Math.max(1,Math.min(16,Math.ceil(demand))),h=total/steps;smokeState.effectiveMultiplier=smokeState.speedMultiplier;smokeState.localStepSpeedCap=stepLen/h;for(let s=0;s<steps;s++)for(let i=0;i<smokeState.count;i++)smokeAdvanceOne(frame,i,h);smokeState.playbackTime+=total;particlePlaybackTime=smokeState.playbackTime;return true}
const smokeTmpA=new Float32Array(3),smokeTmpB=new Float32Array(3);
function smokeOutletOpacity(frame,x){const start=FLOW_DOMAIN.outletFadeStart(frame),end=FLOW_DOMAIN.outletPlane(frame);return 1-clamp((x-start)/Math.max(.01,end-start),0,1)}
function smokeUpdate(frame,now){const begun=performance.now();smokeSetState(smokeState.playing?'SMOKE_PLAYING':'PAUSED');smokeEnsureResources();const g=frame.grid,key=CFD_BRIDGE.geometrySignature()+'|'+frame.sourceId+'|'+g.resolution.join('x')+'|'+g.min.join(',')+'|'+g.max.join(','),newField=smokeState.sequence!==frame.sequence;if(newField){smokeMeasureMaxSpeed(frame);cfdSimulationTime=frame.simulationTime}if(key!==smokeState.frameKey||smokeState.resetRequested){const manualReset=smokeState.resetRequested&&key===smokeState.frameKey;smokeState.frameKey=key;smokeState.solidBounds=null;smokeState.frameId=frame;smokeState.sequence=frame.sequence;smokeState.resetRequested=false;smokeState.captured=0;for(let i=0;i<smokeState.count;i++)smokeParticleEvent(frame,i,manualReset?'MANUAL_RESET':'SPAWN',{initial:true});smokeState.activeCount=smokeState.count;smokeState.paths=null;if(smokeState.prefill)smokeWarmStart(frame);smokeState.lastTime=now;smokeState.accumulator=0}else{smokeState.frameId=frame;smokeState.sequence=frame.sequence;if(smokeState.count>smokeState.activeCount)for(let i=smokeState.activeCount;i<smokeState.count;i++){smokeParticleEvent(frame,i,'SPAWN',{initial:true})}smokeState.activeCount=smokeState.count}if(smokeState.lastTime===null)smokeState.lastTime=now;if(smokeState.playing){const elapsed=clamp((now-smokeState.lastTime)/1000,0,.1);smokeState.accumulator+=elapsed;let steps=0;while(smokeState.accumulator>=1/60&&steps<2){smokeAdvance(frame,1/60);smokeState.accumulator-=1/60;steps++}if(steps===2)smokeState.accumulator=0}smokeState.lastTime=now;particlePlaybackTime=smokeState.playbackTime;for(let i=0;i<smokeState.count;i++){const o=i*3,x=smokeState.positions[o],life=clamp(smokeState.ages[i]/Math.max(.001,smokeState.lifetimes[i]),0,1),birth=clamp(life/SMOKE_CONFIG.birthFade,0,1),death=1-clamp((life-SMOKE_CONFIG.deathFadeStart)/(1-SMOKE_CONFIG.deathFadeStart),0,1),outlet=smokeOutletOpacity(frame,x),smooth=q=>q*q*(3-2*q),variation=.92+(i%17)/100;smokeState.alphas[i]=smokeState.ages[i]<0?0:.38*Math.min(1,Math.pow(2000/smokeState.count,.6))*smooth(birth)*smooth(death)*smooth(outlet)*variation;smokeState.sizes[i]=clamp(SMOKE_CONFIG.baseSize+(SMOKE_CONFIG.maxSize-SMOKE_CONFIG.baseSize)*smooth(life)*smokeState.sizeVariation[i],SMOKE_CONFIG.baseSize,SMOKE_CONFIG.maxSize)}for(const [key,data,len] of [['posBuffer',smokeState.positions,smokeState.count*3],['sizeBuffer',smokeState.sizes,smokeState.count],['alphaBuffer',smokeState.alphas,smokeState.count]]){gl.bindBuffer(gl.ARRAY_BUFFER,smokeState[key]);gl.bufferSubData(gl.ARRAY_BUFFER,0,data,0,len)}smokePerf.updateMs=performance.now()-begun}

/* Scene fixtures mark the vehicle-front tracer release and the downstream -X collector.
   The animated fan is a visual cue; only the worker's field drives particles. */
const smokeHardware={program:null,buffer:null,storage:new Float32Array(18000*3),created:0,draws:0,triangleCount:0};
function smokeHardwareRelease(){if(!gl)return;if(smokeHardware.buffer)gl.deleteBuffer(smokeHardware.buffer);if(smokeHardware.program)gl.deleteProgram(smokeHardware.program);smokeHardware.buffer=null;smokeHardware.program=null}
function smokeHardwareEnsure(){if(smokeHardware.program&&smokeHardware.buffer)return;const vs=smokeCompile(gl.VERTEX_SHADER,`#version 300 es\nprecision highp float;in vec3 a_position;uniform mat4 u_mvp;void main(){gl_Position=u_mvp*vec4(a_position,1.0);}`),fs=smokeCompile(gl.FRAGMENT_SHADER,`#version 300 es\nprecision highp float;uniform vec4 u_color;out vec4 outColor;void main(){outColor=u_color;}`),p=gl.createProgram();gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(p,gl.LINK_STATUS)){gl.deleteProgram(p);throw Error('SMOKE_HARDWARE_SHADER '+gl.getProgramInfoLog(p))}smokeHardware.program=p;smokeHardware.buffer=gl.createBuffer();smokeHardware.created+=2;gl.bindBuffer(gl.ARRAY_BUFFER,smokeHardware.buffer);gl.bufferData(gl.ARRAY_BUFFER,smokeHardware.storage.byteLength,gl.DYNAMIC_DRAW)}
function smokeHardwareGeometry(frame,seconds){const v=smokeHardware.storage;let n=0;const nozzleSources=[];const tri=(a,b,c)=>{if(n+3>v.length/3)throw Error('SMOKE_HARDWARE_BUFFER_LIMIT');v.set(a,n++*3);v.set(b,n++*3);v.set(c,n++*3)},quad=(a,b,c,d)=>{tri(a,b,c);tri(a,c,d)},box=(x0,y0,z0,x1,y1,z1)=>{quad([x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0]);quad([x0,y0,z1],[x0,y1,z1],[x1,y1,z1],[x1,y0,z1]);quad([x0,y0,z0],[x0,y1,z0],[x0,y1,z1],[x0,y0,z1]);quad([x1,y0,z0],[x1,y0,z1],[x1,y1,z1],[x1,y1,z0]);quad([x0,y0,z0],[x0,y0,z1],[x1,y0,z1],[x1,y0,z0]);quad([x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1])},cylX=(x0,x1,y,z,ry,rz,segs=10)=>{for(let i=0;i<segs;i++){const a=i*2*Math.PI/segs,b=(i+1)*2*Math.PI/segs,pa=[y+Math.sin(a)*ry,z+Math.cos(a)*rz],pb=[y+Math.sin(b)*ry,z+Math.cos(b)*rz];quad([x0,...pa],[x0,...pb],[x1,...pb],[x1,...pa]);tri([x0,y,z],[x0,...pb],[x0,...pa]);tri([x1,y,z],[x1,...pa],[x1,...pb])}},cylY=(x,y0,y1,z,r,segs=8)=>{for(let i=0;i<segs;i++){const a=i*2*Math.PI/segs,b=(i+1)*2*Math.PI/segs,p0=[x+Math.cos(a)*r,y0,z+Math.sin(a)*r],p1=[x+Math.cos(b)*r,y0,z+Math.sin(b)*r],q0=[p0[0],y1,p0[2]],q1=[p1[0],y1,p1[2]];quad(p0,p1,q1,q0)}};
for(let i=0;i<8;i++){const p=[0,0,0];smokeNozzle(frame,i,p);const x=p[0],y=p[1],z=p[2];nozzleSources.push(smokeNozzleTransform(frame,i));cylY(x-.24,y-.20,y+.20,z,.045,8);cylX(x-.19,x-.04,y,z,.065,.065,10);cylX(x-.04,x,y,z,.027,.027,10);box(x-.34,y-.035,z-.035,x-.20,y+.035,z+.035)}
const first=[0,0,0],last=[0,0,0];smokeNozzle(frame,0,first);smokeNozzle(frame,7,last);const minY=frame.grid.min[1]+.11,beamY=(first[1]+last[1])/2,zMin=Math.min(...nozzleSources.map(t=>t.position[2])),zMax=Math.max(...nozzleSources.map(t=>t.position[2]));box(first[0]-.30,beamY-.055,zMin-.18,first[0]-.22,beamY+.055,zMax+.18);box(first[0]-.30,minY,zMin-.12,first[0]-.22,beamY,zMin-.04);box(first[0]-.30,minY,zMax+.04,first[0]-.22,beamY,zMax+.12);const sourceCount=n,layout=FLOW_LAYOUT.get(frame),g=frame.grid,x=layout.collectorPlane.x;
const cy=(g.min[1]+g.max[1])/2,cz=(g.min[2]+g.max[2])/2,H=(g.max[1]-g.min[1])*.35,W=(g.max[2]-g.min[2])*.33;
const plenum=layout.emitterPlane.x-2.22,grill=plenum+.20,fan=plenum+.53,honey=plenum+1.15,contraction=plenum+1.40,throat=layout.emitterPlane.x-.53;
const ring=(ax,hh,ww,t=.07)=>{box(ax-t,cy-hh-t,cz-ww-t,ax+t,cy-hh+t,cz+ww+t);box(ax-t,cy+hh-t,cz-ww-t,ax+t,cy+hh+t,cz+ww+t);box(ax-t,cy-hh,cz-ww-t,ax+t,cy+hh,cz-ww+t);box(ax-t,cy-hh,cz+ww-t,ax+t,cy+hh,cz+ww+t)};
ring(plenum,H,W,.10);ring(grill,H,W);ring(honey,H,W);ring(contraction,H,W);ring(throat,H*.75,W*.73);
for(const sign of [-1,1]){const yEdge=cy+sign*H,zEdge=cz+sign*W;
 box(plenum,yEdge-.035,cz-W,contraction,yEdge+.035,cz+W);
 box(plenum,cy-H,zEdge-.035,contraction,cy+H,zEdge+.035);
 quad([contraction,yEdge,cz-W],[contraction,yEdge,cz+W],[throat,cy+sign*H*.75,cz+W*.73],[throat,cy+sign*H*.75,cz-W*.73]);
 quad([contraction,cy-H,zEdge],[contraction,cy+H,zEdge],[throat,cy+H*.75,cz+sign*W*.73],[throat,cy-H*.75,cz+sign*W*.73]);}
// Intake safety grill and downstream flow straightener are visual fixtures.
for(let k=-6;k<=6;k++){const u=k/7;
 box(grill-.016,cy-H,cz+u*W-.012,grill+.016,cy+H,cz+u*W+.012);
 box(grill-.016,cy+u*H-.012,cz-W,grill+.016,cy+u*H+.012,cz+W);
 box(honey-.015,cy-H,cz+u*W-.008,honey+.015,cy+H,cz+u*W+.008);
 box(honey-.015,cy+u*H-.008,cz-W,honey+.015,cy+u*H+.008,cz+W);}
cylX(fan-.10,fan+.10,cy,cz,.18,.18,12);
for(let i=0;i<8;i++){const a=seconds*1.4+i*Math.PI/4,r0=.16,r1=Math.min(H,W)*.73;
 const p0=[fan,cy+Math.sin(a)*r0,cz+Math.cos(a)*r0],p1=[fan,cy+Math.sin(a+.25)*r0,cz+Math.cos(a+.25)*r0],p2=[fan,cy+Math.sin(a+.5)*r1,cz+Math.cos(a+.5)*r1],p3=[fan,cy+Math.sin(a+.8)*r1,cz+Math.cos(a+.8)*r1];quad(p0,p1,p3,p2)}
// A separate collector ring and duct remain behind the vehicle.
ring(x,H*.96,W*.96,.12);ring(x+.24,H*.96,W*.96,.08);
for(const sign of [-1,1]){
 box(x,cy+sign*H*.96-.04,cz-W*.96,x+.28,cy+sign*H*.96+.04,cz+W*.96);
 box(x,cy-H*.96,cz+sign*W*.96-.04,x+.28,cy+H*.96,cz+sign*W*.96+.04);}
const housingCount=n-sourceCount;smokeHardware.triangleCount=n/3;return{total:n,sourceCount,housingCount,pulseStart:n,outletX:x,triangles:n/3,nozzleSources}}
function smokeDrawHardware(vp,frame){smokeHardwareEnsure();const g=smokeHardwareGeometry(frame,smokeState.playbackTime),p=smokeHardware.program;gl.useProgram(p);gl.bindBuffer(gl.ARRAY_BUFFER,smokeHardware.buffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,smokeHardware.storage,0,g.total*3);const attr=gl.getAttribLocation(p,'a_position');gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,3,gl.FLOAT,false,0,0);gl.uniformMatrix4fv(gl.getUniformLocation(p,'u_mvp'),false,vp);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(true);const tint=gl.getUniformLocation(p,'u_color');gl.uniform4f(tint,.22,.39,.48,1);gl.drawArrays(gl.TRIANGLES,0,g.total);smokeHardware.draws++;gl.disableVertexAttribArray(attr)}
const smokeHardwarePreviewFrame={grid:{resolution:[32,32,32],min:AETHER.CFD_DOMAIN.bounds.min.slice(),max:AETHER.CFD_DOMAIN.bounds.max.slice()}};
if(!window.__RIB)window.__RIB={on:true,gain:1,width:.05,prog:null,flow:1,cmode:1,t:0,last:0};
const RIB_VS=`#version 300 es
precision highp float;in vec3 a_pos;in vec3 a_tan;in vec4 a_info;in vec2 a_tau;uniform mat4 u_mvp;uniform vec3 u_eye;uniform float u_time;uniform float u_width;uniform float u_view;out vec2 v_uv;out float v_arc;out float v_seed;out float v_t;out float v_tau;out float v_ratio;
void main(){float arc=a_info.y,seed=a_info.z;vec3 P=a_pos;float g=smoothstep(2.0,9.0,arc);
P+=vec3(0.0,sin(arc*3.1+u_time*1.7+seed*20.0),cos(arc*2.3-u_time*1.3+seed*11.0))*0.018*g;
vec3 view=normalize(u_eye-P);vec3 sd=normalize(cross(a_tan,view));vec4 c0=u_mvp*vec4(P,1.0);
float minW=3.0*c0.w/u_view;float w=max(u_width*(0.5+1.0*smoothstep(0.0,10.0,arc)),minW);
P+=sd*a_info.x*w;gl_Position=u_mvp*vec4(P,1.0);v_uv=vec2(a_info.x,arc);v_arc=arc;v_seed=seed;v_t=a_info.w;v_tau=a_tau.x;v_ratio=a_tau.y;}`;
const RIB_FS=`#version 300 es
precision highp float;in vec2 v_uv;in float v_arc;in float v_seed;in float v_t;in float v_tau;in float v_ratio;uniform float u_time;uniform float u_gain;uniform float u_flow;uniform float u_cmode;out vec4 outColor;
void main(){float x=v_uv.x;float core=exp(-x*x*9.0);float halo=exp(-x*x*2.2)*0.35;
float lam=0.85+0.3*fract(v_seed*7.0);float d=mod(u_time*1.4+v_seed*lam*5.0-v_tau,lam);
float packet=smoothstep(0.0,0.03,d)*exp(-d/(0.3*lam));float mag=mix(1.0,0.16+0.84*packet*1.4,u_flow);
float fin=smoothstep(0.0,0.35,v_arc);float fout=1.0-smoothstep(0.85,1.0,v_t);float soft=smoothstep(3.0,10.0,v_arc);
float prof=mix(core+halo,exp(-x*x*3.0)*0.8,soft);float a=prof*mag*fin*fout*u_gain;
vec3 bc=mix(vec3(0.72,0.92,1.0),vec3(1.0),core);bc=mix(bc,vec3(0.6,0.8,1.0),soft*0.6);
float tt=clamp(0.5+(v_ratio-1.0)*1.25,0.0,1.0)*4.0;vec3 cs=tt<1.0?mix(vec3(0.10,0.18,1.0),vec3(0.0,0.80,1.0),tt):tt<2.0?mix(vec3(0.0,0.80,1.0),vec3(0.05,1.0,0.30),tt-1.0):tt<3.0?mix(vec3(0.05,1.0,0.30),vec3(1.0,0.92,0.05),tt-2.0):mix(vec3(1.0,0.92,0.05),vec3(1.0,0.12,0.05),min(tt-3.0,1.0));
cs*=1.0+0.35*core;float am=mix(a*0.5,a*0.95,u_cmode);if(u_cmode>0.5)a=max(a,prof*fin*fout*u_gain*0.30);
vec3 col=mix(bc,cs,u_cmode);am=mix(a*0.5,a*0.95,u_cmode);if(a<0.003)discard;outColor=vec4(col*a,am);}`;
function ribBuild(frame){const R=window.__RIB,g=frame.grid,h=Math.min(...g.max.map((v,i)=>(v-g.min[i])/g.resolution[i]))*.5,K=3,M=260,total=FLOW_LAYOUT.get(frame).nozzleTransforms.length,list=smokeState.selectedNozzle>=0?[smokeState.selectedNozzle]:Array.from({length:total},(_,i)=>i);
if(!R.vb){R.vb=new Float32Array(64*K*M*24);R.ix=new Uint32Array(64*K*M*6)}
const vb=R.vb,ix=R.ix,o=[0,0,0],v=[0,0,0],v2=[0,0,0],bad=(a,c)=>bodyInside(c[0],c[1],c[2])||smokeMayHitSolid(frame,...a,...c)&&m13SegmentHitsSolid(frame,a,c);let vc=0,ic=0;
for(const n of list)for(let k=0;k<K;k++){smokeNozzle(frame,n,o);const P=[o[0],o[1]+(k-1)*.03,o[2]+(k-1)*.025];if(!smokeInside(frame,...P))continue;
const cl=P.map((x,a)=>Math.floor((x-g.min[a])/(g.max[a]-g.min[a])*g.resolution[a]));if(m13SolidVoxel(frame,...cl)||bodyInside(...P))continue;
const pts=[P.slice()],arcs=[0],spd=[];let p=P.slice(),arc=0;
for(let s=0;s<M-1;s++){flowSample(frame,p[0],p[1],p[2],v);const sp=Math.hypot(v[0],v[1],v[2]);if(sp<1e-6)break;spd[pts.length-1]=sp;let d=[v[0]/sp,v[1]/sp,v[2]/sp];
const mid=[p[0]+d[0]*h*.5,p[1]+d[1]*h*.5,p[2]+d[2]*h*.5];if(smokeInside(frame,...mid)){flowSample(frame,mid[0],mid[1],mid[2],v2);const s2=Math.hypot(v2[0],v2[1],v2[2]);if(s2>1e-6)d=[v2[0]/s2,v2[1]/s2,v2[2]/s2]}
let st=h,q=[p[0]+d[0]*st,p[1]+d[1]*st,p[2]+d[2]*st];if(!smokeInside(frame,...q))break;
if(bad(p,q)){st=h*.4;q=[p[0]+d[0]*st,p[1]+d[1]*st,p[2]+d[2]*st];if(bad(p,q))break}
arc+=st;pts.push(q);arcs.push(arc);p=q}
const L=pts.length;if(L<2)continue;const base=vc/12,seed=((n*7+k*3)%17)/17;while(spd.length<L)spd.push(spd[spd.length-1]||1e-6);let ref=0;const rc=Math.min(5,L);for(let i=0;i<rc;i++)ref+=spd[i];ref=Math.max(ref/rc,1e-9);const tau=[0];for(let i=1;i<L;i++){const sm=Math.max((spd[i]+spd[i-1])*.5,ref*.05);tau.push(tau[i-1]+(arcs[i]-arcs[i-1])*ref/sm)}
for(let i=0;i<L;i++){const a=pts[Math.max(0,i-1)],c=pts[Math.min(L-1,i+1)];let tx=c[0]-a[0],ty=c[1]-a[1],tz=c[2]-a[2];const tl=Math.hypot(tx,ty,tz)||1;tx/=tl;ty/=tl;tz/=tl;
for(const sd of [-1,1]){vb.set([pts[i][0],pts[i][1],pts[i][2],tx,ty,tz,sd,arcs[i],seed,i/(L-1),tau[i],Math.min(3,spd[i]/ref)],vc);vc+=12}}
for(let i=0;i<L-1;i++){const a=base+2*i;ix.set([a,a+1,a+2,a+1,a+3,a+2],ic);ic+=6}}
R.indexCount=ic;gl.bindVertexArray(R.vao);gl.bindBuffer(gl.ARRAY_BUFFER,R.vbo);gl.bufferData(gl.ARRAY_BUFFER,vb.subarray(0,vc),gl.DYNAMIC_DRAW);
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,R.ibo);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,ix.subarray(0,ic),gl.DYNAMIC_DRAW);gl.bindVertexArray(null)}
function RIB_DRAW(vp,frame){const R=window.__RIB;try{
if(!R.prog){const vs=smokeCompile(gl.VERTEX_SHADER,RIB_VS),fs=smokeCompile(gl.FRAGMENT_SHADER,RIB_FS),pr=gl.createProgram();gl.attachShader(pr,vs);gl.attachShader(pr,fs);gl.linkProgram(pr);gl.deleteShader(vs);gl.deleteShader(fs);
if(!gl.getProgramParameter(pr,gl.LINK_STATUS))throw Error('RIB_LINK '+gl.getProgramInfoLog(pr));R.prog=pr;const U=n=>gl.getUniformLocation(pr,n);R.loc={mvp:U('u_mvp'),eye:U('u_eye'),time:U('u_time'),width:U('u_width'),view:U('u_view'),gain:U('u_gain'),flow:U('u_flow'),cmode:U('u_cmode')};
R.vao=gl.createVertexArray();R.vbo=gl.createBuffer();R.ibo=gl.createBuffer();gl.bindVertexArray(R.vao);gl.bindBuffer(gl.ARRAY_BUFFER,R.vbo);
for(const [nm,sz,off] of [['a_pos',3,0],['a_tan',3,12],['a_info',4,24],['a_tau',2,40]]){const l=gl.getAttribLocation(pr,nm);gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,sz,gl.FLOAT,false,48,off)}gl.bindVertexArray(null);R.key=''}
const o1=[0,0,0],o2=[0,0,0],tot=FLOW_LAYOUT.get(frame).nozzleTransforms.length;smokeNozzle(frame,0,o1);smokeNozzle(frame,tot-1,o2);
const key=bodyKey()+frame.sequence+'|'+smokeState.selectedNozzle+'|'+frame.sourceId+'|'+o1.map(x=>x.toFixed(3))+'|'+o2.map(x=>x.toFixed(3));
if(key!==R.key){R.key=key;ribBuild(frame)}if(!R.indexCount)return false;
gl.useProgram(R.prog);gl.uniformMatrix4fv(R.loc.mvp,false,vp);gl.uniform3f(R.loc.eye,camera.eye[0],camera.eye[1],camera.eye[2]);{const nw=performance.now();R.t+=R.last?Math.min(.1,(nw-R.last)/1000)*(smokeState.playing?1:0):0;R.last=nw}gl.uniform1f(R.loc.time,R.t%1000);gl.uniform1f(R.loc.width,R.width);gl.uniform1f(R.loc.view,glCanvas.height*.95);gl.uniform1f(R.loc.gain,R.gain);gl.uniform1f(R.loc.flow,R.flow);gl.uniform1f(R.loc.cmode,R.cmode);
gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.bindVertexArray(R.vao);gl.drawElements(gl.TRIANGLES,R.indexCount,gl.UNSIGNED_INT,0);gl.bindVertexArray(null);return true
}catch(e){R.on=false;R.error=String(e&&e.message||e);try{gl.bindVertexArray(null)}catch(_){}return false}}
if(!window.__BODY)window.__BODY={active:false,x:0,z:0,g:0,H:1.78,yaw:0,anchor:null,speed:0,t:0,parts:null,gen:-1,inTunnel:false};
const BODY_TMP=new Float64Array(3);
function bodyRadius(yRel){if(yRel<0||yRel>window.__BODY.H)return 0;return yRel<.85?.17:yRel<1.5?.25:.12}
function bodyInside(x,y,z){const B=window.__BODY;if(!B.active)return false;const R=bodyRadius(y-B.g);if(!R)return false;const dx=x-B.x,dz=z-B.z;return dx*dx+dz*dz<R*R}
function flowSample(frame,x,y,z,out){smokeSample(frame,x,y,z,out);const B=window.__BODY;if(!B.active)return true;const yr=y-B.g;if(yr<0||yr>B.H+.6)return true;
 const u=out[0],w=out[2],U=Math.hypot(u,w);if(U<1e-9)return true;const dx=x-B.x,dz=z-B.z,r2=dx*dx+dz*dz;if(r2>36)return true;
 const fy=yr<=B.H?1:1-(yr-B.H)/.6,Rl=Math.max(bodyRadius(Math.min(yr,B.H)),.12);
 if(r2<Rl*Rl*fy){out[0]=0;out[1]=0;out[2]=0;return true}
 const r=Math.sqrt(r2),nx=dx/r,nz=dz/r,Un=u*nx+w*nz,k=Rl*Rl/r2*fy;out[0]=u-k*(2*Un*nx-u);out[2]=w-k*(2*Un*nz-w);
 const ex=u/U,ez=w/U,s=dx*ex+dz*ez,l=-dx*ez+dz*ex;
 if(s>0){const wd=Rl*1.4+.2*s,env=Math.exp(-(l/wd)*(l/wd))*Math.exp(-s/3.2)*fy,ph=6.2832*(B.t/1.4-s/1.3),grow=1-Math.exp(-s/.35);
  const def=1-.5*env*grow;out[0]*=def;out[2]*=def;const vl=.8*U*env*grow*Math.sin(ph);out[0]+=-ez*vl;out[2]+=ex*vl;out[1]+=.22*U*env*grow*Math.sin(ph*1.3+1.1)}
 else if(r<1.2){const up=Math.exp(-(r-Rl)/.35)*Math.max(0,-s/r)*.25*U*Math.max(0,1-Math.abs(yr-B.H)/.4);out[1]+=up}
 return true}
function bodyKey(){const B=window.__BODY;return B.active?('B'+Math.round(B.x*25)+','+Math.round(B.z*25)+','+Math.round(B.g*20)+','+Math.floor(B.t*12)+'|'):''}
function bodyTick(){const B=window.__BODY;B.t=window.__RIB?.t||0;
 if(fpv.enabled){B.anchor=null;const inT=fpv.z<DOOR.landZ;B.inTunnel=inT;B.active=inT;if(inT){B.x=fpv.x;B.z=fpv.z;B.g=fpv.gy??doorGround(fpv.x,fpv.z);B.yaw=fpv.yaw}}
 else if(B.anchor){B.active=true;B.inTunnel=true;B.x=B.anchor.x;B.z=B.anchor.z;B.g=B.anchor.g;B.yaw=B.anchor.yaw}else{B.active=false;B.inTunnel=false}
 const f=m13FrameState.frame;B.speed=0;if(B.active&&f&&f.fields?.velocity?.data&&smokeInside(f,B.x,B.g+1.2,B.z)){smokeSample(f,B.x,B.g+1.2,B.z,BODY_TMP);B.speed=Math.hypot(BODY_TMP[0],BODY_TMP[1],BODY_TMP[2])}if(window.__LIVE&&window.__LIVE.ok&&window.__LIVE.enabled)B.speed=B.active?window.__LIVE.speedAt:0}
function bodyDraw(vp){const B=window.__BODY;if(!B.active||fpv.enabled)return;try{
 if(!B.parts||B.gen!==runtimeGeneration){const P=[[[-.1,.45,0],[.15,.9,.17]],[[.1,.45,0],[.15,.9,.17]],[[0,1.19,0],[.46,.62,.26]],[[-.31,1.16,0],[.1,.62,.12]],[[.31,1.16,0],[.1,.62,.12]],[[0,1.56,0],[.1,.08,.1]],[[0,1.7,0],[.2,.24,.22]]];
  B.parts=P.map(([c,s])=>{const o={type:'box',name:'body',center:c,size:s,bevel:.035,color:[.9,.93,.95]};bevelMesh(o);const m=o._mesh,uv=new Float32Array(m.positions.length/3*2);return bindMesh(m.positions,m.normals,uv,m.indices)});B.gen=runtimeGeneration}
 const a=-B.yaw,c=Math.cos(a),s=Math.sin(a),M=new Float64Array([c,0,-s,0,0,1,0,0,s,0,c,0,B.x,B.g,B.z,1]),mvp=matMul(vp,M),surf=(materialLibrary.PaintedSteelWhite||materialLibrary.PaintedSteelGray).surface;
 gl.useProgram(program);for(const gpu of B.parts){gl.uniformMatrix4fv(loc.model,false,M);gl.uniformMatrix4fv(loc.mvp,false,mvp);drawMesh(gpu,M,{color:[.92,.95,.98,1],surface:surf},1)}
}catch(e){B.drawError=String(e?.message||e)}}
window.__bodyOutside=()=>{const B=window.__BODY;if(!fpv.enabled||!B.active)return false;B.anchor={x:fpv.x,z:fpv.z,g:doorGround(fpv.x,fpv.z),yaw:fpv.yaw};setPreset('Side');camera.fov=55;const side=B.anchor.z>0?-1:1;camera.eye=[B.anchor.x-3.3,2.5,B.anchor.z+side*3.1];camera.target=[B.anchor.x+1.1,1.0,B.anchor.z];camera.up=[0,1,0];return true};
window.__bodyReturn=()=>{const B=window.__BODY;const a=B.anchor;startWalk();if(a){fpv.x=a.x;fpv.z=a.z;fpv.yaw=a.yaw;fpv.gy=undefined}return !!a};

/* AETHER LIVE CFD: real-time GPU incompressible flow (collocated grid, semi-Lagrangian advection,
   Jacobi pressure projection, vorticity confinement) + passive-scalar smoke with MacCormack transport. */
const LIVE={ok:false,err:null,enabled:true,init:false,gen:-1,q:null,N:null,step:0,t:0,U:5,mode:'RAKE_V',wand:false,colorMode:true,
 vortEps:.35,jacobi:32,sub:2,bench:null,benchRes:null,rs:.75,rq:2,cs:1,frame:0,perf:{auto:true,ema:16.7,last:0,cool:0,target:40,switches:0,log:[]},solver:'MG',mgCycles:1,mgPre:2,mgPost:2,mgLevels:3,omega:.86,mgRN:1,mgRS:0,mgCorr:.75,coarseIters:40,diag:false,dens:6,speedAt:0,lastRead:0,lastT:0,emitters:[],stats:{}};
window.__LIVE=LIVE;window.__AETHER_DEBUG={get fpv(){return fpv},get camera(){return camera},get body(){return window.__BODY}};
const LIVE_BENCH={D:.5,x:-1.5,z:.1,y:1.5,T:8,spin:2};
const LIVE_Q={LOW:[112,36,52],MED:[144,46,66],HIGH:[176,56,80],ULTRA:[224,72,100]};
const LIVE_TIERS=['LOW','MED','HIGH','ULTRA'];
/* GPU class from the WebGL renderer string. Only a heuristic: integrated GPUs start on LOW and are promoted by the frame-time controller. */
function liveGpuClass(){let r='';try{const e=gl.getExtension('WEBGL_debug_renderer_info');r=e?String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL)):''}catch(_){}
 LIVE.gpu=r;if(/SwiftShader|llvmpipe|Software|Microsoft Basic/i.test(r))return 'SOFT';if(/Apple (M\d|GPU)|Apple, ANGLE Metal/i.test(r))return 'APPLE';
 if(/RTX|GTX|Radeon RX|Radeon Pro|Quadro|Arc\s*[AB]\d|NVIDIA/i.test(r))return 'DGPU';if(/Intel|UHD|Iris|HD Graphics|Mali|Adreno|PowerVR|Radeon(\(TM\))?\s*(Vega\s*\d+\s*)?Graphics|Radeon 6\d\dM|Vega/i.test(r))return 'IGPU';return r?'DGPU':'UNKNOWN'}
function liveStartTier(){const c=LIVE.gpuClass=LIVE.gpuClass||liveGpuClass(),m=location.hash.match(/q=(LOW|MED|HIGH|ULTRA)/);if(m)return {q:m[1],auto:false};if(LIVE.forceQ)return {q:LIVE.forceQ,auto:LIVE.perf.auto};
 const coarse=window.matchMedia&&matchMedia('(pointer:coarse)').matches;
 return {q:coarse?'LOW':({SOFT:'LOW',IGPU:'LOW',APPLE:'MED',DGPU:'HIGH',UNKNOWN:'MED'})[c],auto:true}}
const LIVE_VS=`#version 300 es
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));gl_Position=vec4(p*2.-1.,0.,1.);}`;
const LIVE_H=`#version 300 es
precision highp float;precision highp int;precision highp sampler2D;
uniform ivec3 uN;uniform int uTX;uniform vec3 uMin;uniform vec3 uH;uniform sampler2D uFlags;uniform float uU;uniform vec3 uBodyV;
out vec4 o;
ivec2 A(ivec3 c){return ivec2((c.z%uTX)*uN.x+c.x,(c.z/uTX)*uN.y+c.y);}
ivec3 C(){ivec2 f=ivec2(gl_FragCoord.xy);int tx=f.x/uN.x,ty=f.y/uN.y;return ivec3(f.x-tx*uN.x,f.y-ty*uN.y,ty*uTX+tx);}
vec4 F(sampler2D s,ivec3 c){return texelFetch(s,A(clamp(c,ivec3(0),uN-1)),0);}
vec4 S(sampler2D s,vec3 p){p=clamp(p,vec3(0.),vec3(uN-1));ivec3 i=ivec3(floor(p));vec3 f=p-vec3(i);ivec3 j=min(i+1,uN-1);
 vec4 a=mix(F(s,i),F(s,ivec3(j.x,i.y,i.z)),f.x),b=mix(F(s,ivec3(i.x,j.y,i.z)),F(s,ivec3(j.x,j.y,i.z)),f.x),
 c=mix(F(s,ivec3(i.x,i.y,j.z)),F(s,ivec3(j.x,i.y,j.z)),f.x),d=mix(F(s,ivec3(i.x,j.y,j.z)),F(s,j),f.x);return mix(mix(a,b,f.y),mix(c,d,f.y),f.z);}
bool any3(bvec3 b){return b.x||b.y||b.z;}
bool IN(ivec3 c){return all(greaterThanEqual(c,ivec3(0)))&&all(lessThan(c,uN));}
vec3 W(ivec3 c){return uMin+(vec3(c)+.5)*uH;}
int ST(ivec3 c){return int(texelFetch(uFlags,A(c),0).r*3.+.5);}
vec3 SV(int t){return t==2?vec3(uU,0.,0.):(t==3?uBodyV:vec3(0.));}
`;
const LIVE_FS={
flags:`uniform sampler2D uObs;uniform vec4 uBody;
float bodyR(float y){return (y<0.||y>1.78)?0.:(y<.85?.17:(y<1.5?.25:.12));}
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}vec4 ob=texelFetch(uObs,A(c),0);int t=ob.r>.5?1:(ob.g>.5?2:0);
 if(t==0&&uBody.w>.5){vec3 w=W(c);float r=bodyR(w.y-uBody.z);vec2 d=w.xz-uBody.xy;if(r>0.&&dot(d,d)<r*r)t=3;}o=vec4(float(t)/3.,0,0,1);}`,
init:`void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}int t=ST(c);o=vec4(t>0?SV(t):vec3(uU,0,0),0);}`,
curl:`uniform sampler2D uVel;
vec3 VN(ivec3 n,vec3 vc){if(n.x<0)return vec3(uU,0,0);if(n.x>=uN.x)return vc;if(n.y<0||n.y>=uN.y)return vec3(vc.x,-vc.y,vc.z);if(n.z<0||n.z>=uN.z)return vec3(vc.x,vc.y,-vc.z);int t=ST(n);return t>0?SV(t):F(uVel,n).xyz;}
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}vec3 vc=F(uVel,c).xyz;
 vec3 xp=VN(c+ivec3(1,0,0),vc),xm=VN(c-ivec3(1,0,0),vc),yp=VN(c+ivec3(0,1,0),vc),ym=VN(c-ivec3(0,1,0),vc),zp=VN(c+ivec3(0,0,1),vc),zm=VN(c-ivec3(0,0,1),vc);
 vec3 h2=2.*uH;vec3 w=vec3((yp.z-ym.z)/h2.y-(zp.y-zm.y)/h2.z,(zp.x-zm.x)/h2.z-(xp.z-xm.z)/h2.x,(xp.y-xm.y)/h2.x-(yp.x-ym.x)/h2.y);o=vec4(w,length(w));}`,
advv:`uniform sampler2D uVel,uCurl;uniform float uDt,uEps;
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}int t=ST(c);if(t>0){o=vec4(SV(t),0);return;}
 vec3 u=F(uVel,c).xyz;vec3 p=vec3(c)-uDt*u/uH;vec3 un=S(uVel,p).xyz;
 if(uEps>0.){vec3 w=F(uCurl,c).xyz;vec3 g=vec3(F(uCurl,c+ivec3(1,0,0)).w-F(uCurl,c-ivec3(1,0,0)).w,F(uCurl,c+ivec3(0,1,0)).w-F(uCurl,c-ivec3(0,1,0)).w,F(uCurl,c+ivec3(0,0,1)).w-F(uCurl,c-ivec3(0,0,1)).w)/(2.*uH);
  float gl=length(g);if(gl>1e-5)un+=uDt*uEps*uH.x*cross(g/gl,w);}
 if(c.x==0)un=vec3(uU,0,0);if(c.y==0){un.x=uU;un.y=0.;}if(c.y==uN.y-1)un.y=min(un.y,0.);if(c.z==0)un.z=max(un.z,0.);if(c.z==uN.z-1)un.z=min(un.z,0.);
 float m=length(un),lim=3.5*max(uU,.5);if(m>lim)un*=lim/m;o=vec4(un,0);}`,
div:`uniform sampler2D uVel;
vec3 VN(ivec3 n,vec3 vc){if(n.x<0)return vec3(uU,0,0);if(n.x>=uN.x)return vc;if(n.y<0||n.y>=uN.y)return vec3(vc.x,-vc.y,vc.z);if(n.z<0||n.z>=uN.z)return vec3(vc.x,vc.y,-vc.z);int t=ST(n);return t>0?SV(t):F(uVel,n).xyz;}
void main(){ivec3 c=C();if(c.z>=uN.z||ST(c)>0){o=vec4(0);return;}vec3 vc=F(uVel,c).xyz;
 float d=(VN(c+ivec3(1,0,0),vc).x-VN(c-ivec3(1,0,0),vc).x)/(2.*uH.x)+(VN(c+ivec3(0,1,0),vc).y-VN(c-ivec3(0,1,0),vc).y)/(2.*uH.y)+(VN(c+ivec3(0,0,1),vc).z-VN(c-ivec3(0,0,1),vc).z)/(2.*uH.z);o=vec4(d,0,0,0);}`,
jac:`uniform sampler2D uP,uDiv;
float PN(ivec3 n,float pc){if(n.x>=uN.x)return 0.;if(!IN(n))return pc;if(ST(n)>0)return pc;return F(uP,n).x;}
void main(){ivec3 c=C();if(c.z>=uN.z||ST(c)>0){o=vec4(0);return;}float pc=F(uP,c).x;vec3 ih=1./(uH*uH);
 float s=(PN(c+ivec3(1,0,0),pc)+PN(c-ivec3(1,0,0),pc))*ih.x+(PN(c+ivec3(0,1,0),pc)+PN(c-ivec3(0,1,0),pc))*ih.y+(PN(c+ivec3(0,0,1),pc)+PN(c-ivec3(0,0,1),pc))*ih.z;
 o=vec4((s-F(uDiv,c).x)/(2.*(ih.x+ih.y+ih.z)),0,0,0);}`,
proj:`uniform sampler2D uVel,uP;
float PN(ivec3 n,float pc){if(n.x>=uN.x)return 0.;if(!IN(n))return pc;if(ST(n)>0)return pc;return F(uP,n).x;}
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}int t=ST(c);if(t>0){o=vec4(SV(t),0);return;}float pc=F(uP,c).x;
 vec3 g=vec3(PN(c+ivec3(1,0,0),pc)-PN(c-ivec3(1,0,0),pc),PN(c+ivec3(0,1,0),pc)-PN(c-ivec3(0,1,0),pc),PN(c+ivec3(0,0,1),pc)-PN(c-ivec3(0,0,1),pc))/(2.*uH);
 vec3 u=F(uVel,c).xyz-g;if(c.x==0)u=vec3(uU,0,0);if(c.y==0){u.x=uU;u.y=0.;}o=vec4(u,0);}`,
advd:`uniform sampler2D uVel,uSrc;uniform float uDt;
void main(){ivec3 c=C();if(c.z>=uN.z||ST(c)>0){o=vec4(0);return;}vec3 u=F(uVel,c).xyz;o=vec4(S(uSrc,vec3(c)-uDt*u/uH).x,0,0,0);}`,
corr:`uniform sampler2D uVel,uSrc,uHat,uBar;uniform float uDt,uDecay,uEmS;uniform vec4 uEm[16];uniform int uEmN;
void main(){ivec3 c=C();if(c.z>=uN.z||ST(c)>0||c.x==0){o=vec4(0);return;}vec3 u=F(uVel,c).xyz;vec3 p=clamp(vec3(c)-uDt*u/uH,vec3(0.),vec3(uN-1));ivec3 i=ivec3(floor(p));
 float lo=1e9,hi=-1e9;for(int k=0;k<8;k++){float v=F(uSrc,i+ivec3(k&1,(k>>1)&1,(k>>2)&1)).x;lo=min(lo,v);hi=max(hi,v);}
 float r=clamp(F(uHat,c).x+.5*(F(uSrc,c).x-F(uBar,c).x),lo,hi)*uDecay;vec3 w=W(c);
 for(int e=0;e<16;e++){if(e>=uEmN)break;vec3 d=w-uEm[e].xyz;float rr=uEm[e].w;r=max(r,uEmS*exp(-dot(d,d)/(rr*rr)));}
 o=vec4(max(r,0.),0,0,0);}`,
cflag:`uniform sampler2D uFF;uniform ivec3 uNF;uniform int uTXF;
ivec2 AF(ivec3 c){return ivec2((c.z%uTXF)*uNF.x+c.x,(c.z/uTXF)*uNF.y+c.y);}
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}int allS=1,anyC=0;
 for(int k=0;k<8;k++){ivec3 f=c*2+ivec3(k&1,(k>>1)&1,(k>>2)&1);if(any3(greaterThanEqual(f,uNF)))continue;anyC=1;if(texelFetch(uFF,AF(f),0).r<.1)allS=0;}
 o=vec4((anyC==1&&allS==1)?1./3.:0.,0,0,1);}`,
res:`uniform sampler2D uP,uB;
float PN(ivec3 n,float pc){if(n.x>=uN.x)return 0.;if(!IN(n))return pc;if(ST(n)>0)return pc;return F(uP,n).x;}
void main(){ivec3 c=C();if(c.z>=uN.z||ST(c)>0){o=vec4(0);return;}float pc=F(uP,c).x;vec3 ih=1./(uH*uH);
 float s=(PN(c+ivec3(1,0,0),pc)+PN(c-ivec3(1,0,0),pc))*ih.x+(PN(c+ivec3(0,1,0),pc)+PN(c-ivec3(0,1,0),pc))*ih.y+(PN(c+ivec3(0,0,1),pc)+PN(c-ivec3(0,0,1),pc))*ih.z;
 o=vec4(F(uB,c).x-(s-2.*(ih.x+ih.y+ih.z)*pc),0,0,0);}`,
rest:`uniform sampler2D uRF,uFF;uniform ivec3 uNF;uniform int uTXF;uniform float uRS;
ivec2 AF(ivec3 c){return ivec2((c.z%uTXF)*uNF.x+c.x,(c.z/uTXF)*uNF.y+c.y);}
void main(){ivec3 c=C();if(c.z>=uN.z||ST(c)>0){o=vec4(0);return;}float s=0.,n=0.;
 for(int k=0;k<8;k++){ivec3 f=c*2+ivec3(k&1,(k>>1)&1,(k>>2)&1);if(any3(greaterThanEqual(f,uNF)))continue;if(texelFetch(uFF,AF(f),0).r>.1)continue;s+=texelFetch(uRF,AF(f),0).x;n+=1.;}
 o=vec4(uRS>.5?s/8.:(n>0.?s/n:0.),0,0,0);}`,
prol:`uniform sampler2D uP,uPC,uFC;uniform ivec3 uNC;uniform int uTXC;uniform vec3 uHC;uniform float uRN,uCorr;
ivec2 AC(ivec3 c){return ivec2((c.z%uTXC)*uNC.x+c.x,(c.z/uTXC)*uNC.y+c.y);}
void main(){ivec3 c=C();if(c.z>=uN.z||ST(c)>0){o=vec4(0);return;}vec3 q=(W(c)-uMin)/uHC-.5;vec3 q0=floor(q),f=q-q0;ivec3 i0=ivec3(q0);float acc=0.,wt=0.;
 for(int k=0;k<8;k++){ivec3 d=ivec3(k&1,(k>>1)&1,(k>>2)&1);ivec3 j=clamp(i0+d,ivec3(0),uNC-1);if(texelFetch(uFC,AC(j),0).r>.1)continue;
  float w=((d.x==1)?f.x:1.-f.x)*((d.y==1)?f.y:1.-f.y)*((d.z==1)?f.z:1.-f.z);acc+=w*texelFetch(uPC,AC(j),0).x;wt+=w;}
 o=vec4(F(uP,c).x+uCorr*(uRN>.5?(wt>1e-4?acc/wt:0.):acc),0,0,0);}`,
jacw:`uniform sampler2D uP,uDiv;uniform float uOm;
float PN(ivec3 n,float pc){if(n.x>=uN.x)return 0.;if(!IN(n))return pc;if(ST(n)>0)return pc;return F(uP,n).x;}
void main(){ivec3 c=C();if(c.z>=uN.z||ST(c)>0){o=vec4(0);return;}float pc=F(uP,c).x;vec3 ih=1./(uH*uH);
 float s=(PN(c+ivec3(1,0,0),pc)+PN(c-ivec3(1,0,0),pc))*ih.x+(PN(c+ivec3(0,1,0),pc)+PN(c-ivec3(0,1,0),pc))*ih.y+(PN(c+ivec3(0,0,1),pc)+PN(c-ivec3(0,0,1),pc))*ih.z;
 float pj=(s-F(uDiv,c).x)/(2.*(ih.x+ih.y+ih.z));o=vec4(pc+uOm*(pj-pc),0,0,0);}`,
force:`uniform sampler2D uP;
void main(){ivec3 c=C();if(c.z>=uN.z||ST(c)>0){o=vec4(0);return;}float p=F(uP,c).x;vec3 f=vec3(0.);
 ivec3 e=ivec3(1,0,0);if(IN(c+e)&&ST(c+e)==1)f.x+=p*uH.y*uH.z;if(IN(c-e)&&ST(c-e)==1)f.x-=p*uH.y*uH.z;
 e=ivec3(0,1,0);if(IN(c+e)&&ST(c+e)==1)f.y+=p*uH.x*uH.z;if(IN(c-e)&&ST(c-e)==1)f.y-=p*uH.x*uH.z;
 e=ivec3(0,0,1);if(IN(c+e)&&ST(c+e)==1)f.z+=p*uH.x*uH.y;if(IN(c-e)&&ST(c-e)==1)f.z-=p*uH.x*uH.y;
 o=vec4(f,0.);}`,
copy:`uniform sampler2D uVel,uDye;uniform int uLayer;
void main(){ivec3 c=ivec3(ivec2(gl_FragCoord.xy),uLayer);int t=ST(c);vec3 u=F(uVel,c).xyz;o=vec4(t>0?0.:F(uDye,c).x,(t==1||t==3)?1.:(t==2?.6:0.),length(u)/max(uU,.1),1);}`};
const LIVE_SUM=`#version 300 es
precision highp float;precision highp sampler2D;uniform sampler2D uS;uniform ivec2 uSz;out vec4 o;
void main(){ivec2 b=ivec2(gl_FragCoord.xy)*8;vec4 s=vec4(0.);for(int j=0;j<8;j++)for(int i=0;i<8;i++){ivec2 q=b+ivec2(i,j);if(q.x<uSz.x&&q.y<uSz.y)s+=texelFetch(uS,q,0);}o=s;}`;
const LIVE_RAY=`#version 300 es
precision highp float;precision highp sampler3D;
uniform sampler3D uVol;uniform mat4 uInv;uniform vec3 uEye,uBMin,uBMax,uLD;uniform vec2 uRes;uniform float uDens,uCMode;uniform int uQ,uFrame;out vec4 o;
vec3 turbo(float t){t*=4.;vec3 a=vec3(.10,.18,1.),b=vec3(0.,.8,1.),c=vec3(.05,1.,.3),d=vec3(1.,.92,.05),e=vec3(1.,.12,.05);return t<1.?mix(a,b,t):t<2.?mix(b,c,t-1.):t<3.?mix(c,d,t-2.):mix(d,e,min(t-3.,1.));}
void main(){vec2 n=gl_FragCoord.xy/uRes*2.-1.;vec4 a=uInv*vec4(n,-1,1),b=uInv*vec4(n,1,1);vec3 ro=uEye,rd=normalize(b.xyz/b.w-a.xyz/a.w);
 vec3 iv=1./rd,t0=(uBMin-ro)*iv,t1=(uBMax-ro)*iv,mn=min(t0,t1),mx=max(t0,t1);float tn=max(max(mn.x,mn.y),max(mn.z,0.)),tf=min(min(mx.x,mx.y),mx.z);
 if(ro.z>3.84){if(rd.z>=0.)discard;float tw=(3.9-ro.z)/rd.z;vec3 q=ro+rd*tw;bool win=q.x>-3.5&&q.x<2.3&&q.y>.95&&q.y<3.05,door=q.x>2.3&&q.x<3.5&&q.y>.75&&q.y<2.95;if(!win&&!door)discard;tn=max(tn,(3.83-ro.z)/rd.z);}
 if(tf<=tn)discard;float L=tf-tn,stp=uQ==0?.12:(uQ==1?.085:.065);int NS=int(clamp(L/stp,10.,180.));float dt=L/float(NS);
 float j=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233))+float(uFrame&255)*1.618)*43758.5453);
 vec3 ext=uBMax-uBMin,ld=uLD/ext;vec4 acc=vec4(0);float t=tn+j*dt,te=tn+L;float ph=1.+.35*pow(max(dot(rd,uLD),0.),3.);
 for(int i=0;i<200;i++){if(t>=te||acc.a>.985)break;vec3 uvw=(ro+rd*t-uBMin)/ext;
  vec4 c=textureLod(uVol,uvw,2.);if(c.g<.002&&c.r*uDens<.0012){t+=dt*4.;continue;}
  vec4 s=textureLod(uVol,uvw,0.);if(s.g>.55)break;float d=s.r*uDens;if(d<.003){t+=dt;continue;}
  float sh=textureLod(uVol,uvw+ld*.17,0.).r;if(uQ>0)sh+=.7*textureLod(uVol,uvw+ld*.4,0.).r;if(uQ>1)sh+=.5*textureLod(uVol,uvw+ld*.75,0.).r;
  float lit=.32+.68*exp(-sh*uDens*.9);
  vec3 col=mix(vec3(.86,.92,1.),turbo(clamp(.5+(s.b-1.)*1.25,0.,1.)),uCMode)*lit*ph;float al=1.-exp(-d*dt*8.);acc.rgb+=(1.-acc.a)*al*col;acc.a+=(1.-acc.a)*al;t+=dt;}
 if(acc.a<.004)discard;o=acc;}`;
const LIVE_COMP=`#version 300 es
precision highp float;precision highp sampler2D;uniform sampler2D uT;uniform vec2 uRes;out vec4 o;
void main(){vec4 c=texture(uT,gl_FragCoord.xy/uRes);if(c.a<.002)discard;o=c;}`;
function liveCompile(fs,vs=LIVE_VS){const mk=(t,s)=>{const sh=gl.createShader(t);gl.shaderSource(sh,s);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error('LIVE_SHADER '+gl.getShaderInfoLog(sh));return sh};
 const p=gl.createProgram(),a=mk(gl.VERTEX_SHADER,vs),b=mk(gl.FRAGMENT_SHADER,fs);gl.attachShader(p,a);gl.attachShader(p,b);gl.linkProgram(p);gl.deleteShader(a);gl.deleteShader(b);
 if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error('LIVE_LINK '+gl.getProgramInfoLog(p));p._u={};return p}
function liveU(p,n){if(!(n in p._u))p._u[n]=gl.getUniformLocation(p,n);return p._u[n]}
function liveTarget(w,h,ifmt,fmt,type){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);
 gl.texImage2D(gl.TEXTURE_2D,0,ifmt,w,h,0,fmt,type,null);const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);
 if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('LIVE_FBO_INCOMPLETE');return {t,f}}
function liveVoxelize(N,min,h,fanB){const [nx,ny,nz]=N,tot=nx*ny*nz,shell=new Uint8Array(tot),idx=(i,j,k)=>i+nx*(j+ny*k),hm=Math.min(...h)*.45,t0=performance.now();
 for(const part of (LIVE.bench?[]:m12SolidParts())){const M=part.modelMatrix,P=part.positions,I=part.indices,V=new Float32Array(P.length);
  for(let i=0;i<P.length;i+=3){const q=m4point(M,[P[i],P[i+1],P[i+2]]);V[i]=q[0];V[i+1]=q[1];V[i+2]=q[2]}
  for(let t=0;t<I.length;t+=3){const a=I[t]*3,b=I[t+1]*3,c=I[t+2]*3,ax=V[a],ay=V[a+1],az=V[a+2],ex=V[b]-ax,ey=V[b+1]-ay,ez=V[b+2]-az,fx=V[c]-ax,fy=V[c+1]-ay,fz=V[c+2]-az;
   const n=Math.max(1,Math.ceil(Math.max(Math.hypot(ex,ey,ez),Math.hypot(fx,fy,fz),Math.hypot(fx-ex,fy-ey,fz-ez))/hm));
   for(let u=0;u<=n;u++)for(let v=0;v<=n-u;v++){const s=u/n,r=v/n,x=ax+ex*s+fx*r,y=ay+ey*s+fy*r,z=az+ez*s+fz*r,i=Math.floor((x-min[0])/h[0]),j=Math.floor((y-min[1])/h[1]),k=Math.floor((z-min[2])/h[2]);
    if(i>=0&&j>=0&&k>=0&&i<nx&&j<ny&&k<nz)shell[idx(i,j,k)]=1}}}
 const ext=new Uint8Array(tot),st=new Int32Array(tot);let sp=0;const push=q=>{if(!shell[q]&&!ext[q]){ext[q]=1;st[sp++]=q}};
 for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)if(i===0||j===0||k===0||i===nx-1||j===ny-1||k===nz-1)push(idx(i,j,k));
 while(sp){const q=st[--sp],i=q%nx,j=((q/nx)|0)%ny,k=(q/(nx*ny))|0;if(i>0)push(q-1);if(i<nx-1)push(q+1);if(j>0)push(q-nx);if(j<ny-1)push(q+nx);if(k>0)push(q-nx*ny);if(k<nz-1)push(q+nx*ny)}
 const type=new Uint8Array(tot);let car=0,fan=0;for(let q=0;q<tot;q++)if(!ext[q]){type[q]=1;car++}
 if(LIVE.bench==='cylinder'){const R=LIVE_BENCH.D/2;car=0;for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const x=min[0]+(i+.5)*h[0]-LIVE_BENCH.x,z=min[2]+(k+.5)*h[2]-LIVE_BENCH.z;if(x*x+z*z<=R*R){type[idx(i,j,k)]=1;car++}}}
 if(fanB)for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const x=min[0]+(i+.5)*h[0],y=min[1]+(j+.5)*h[1],z=min[2]+(k+.5)*h[2];
  if(x>=fanB.min[0]&&x<=fanB.max[0]&&y>=fanB.min[1]&&y<=fanB.max[1]&&z>=fanB.min[2]&&z<=fanB.max[2]){const q=idx(i,j,k);if(!type[q]){type[q]=2;fan++}}}
 const col=new Uint8Array(ny*nz);for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)if(type[idx(i,j,k)]===1)col[j+ny*k]=1;let cc=0;for(let q=0;q<col.length;q++)cc+=col[q];
 return {type,car,fan,front:cc*h[1]*h[2],ms:performance.now()-t0}}
function liveInit(){LIVE.init=true;LIVE.ok=false;LIVE.gen=runtimeGeneration;try{
 const cbf=gl.getExtension('EXT_color_buffer_float');if(!cbf)throw Error('EXT_color_buffer_float 미지원 기기');
 const st=liveStartTier(),q=st.q;LIVE.q=q;LIVE.perf.auto=st.auto;LIVE.mgCycles=q==='ULTRA'?2:1;const N=LIVE_Q[q];LIVE.N=N;
 const b=CFD_DOMAIN_CONTRACT.bounds,min=Array.from(b.min),max=Array.from(b.max),h=max.map((v,i)=>(v-min[i])/N[i]);LIVE.min=min;LIVE.max=max;LIVE.h=h;
 const maxTex=gl.getParameter(gl.MAX_TEXTURE_SIZE);let tx=Math.ceil(Math.sqrt(N[2]*N[1]/N[0]));tx=Math.min(tx,Math.floor(maxTex/N[0]));const ty=Math.ceil(N[2]/tx);LIVE.tx=tx;LIVE.W=N[0]*tx;LIVE.H=N[1]*ty;
 LIVE.bench=LIVE.bench||(location.hash.match(/bench=(cylinder)/)||[])[1]||null;const fanB=AETHER.FAN_MODULE?.layout?.fanBounds||null;LIVE.fanKey=JSON.stringify(fanB);const vox=liveVoxelize(N,min,h,fanB);LIVE.vox={car:vox.car,fan:vox.fan,front:vox.front,ms:Math.round(vox.ms)};
 const obs=new Uint8Array(LIVE.W*LIVE.H*4);for(let k=0;k<N[2];k++)for(let j=0;j<N[1];j++)for(let i=0;i<N[0];i++){const t=vox.type[i+N[0]*(j+N[1]*k)];if(!t)continue;const ax=(k%tx)*N[0]+i,ay=Math.floor(k/tx)*N[1]+j,o=(ay*LIVE.W+ax)*4;obs[o+(t===1?0:1)]=255;obs[o+3]=255}
 LIVE.obs=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,LIVE.obs);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,LIVE.W,LIVE.H,0,gl.RGBA,gl.UNSIGNED_BYTE,obs);
 const W=LIVE.W,H=LIVE.H,V=()=>liveTarget(W,H,gl.RGBA32F,gl.RGBA,gl.FLOAT),R=()=>liveTarget(W,H,gl.R32F,gl.RED,gl.FLOAT);
 LIVE.tex={velA:V(),velB:V(),curl:V(),pA:R(),pB:R(),div:R(),dyeA:R(),dyeB:R(),hat:R(),bar:R(),flags:liveTarget(W,H,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE)};
 LIVE.vol=gl.createTexture();gl.bindTexture(gl.TEXTURE_3D,LIVE.vol);for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_NEAREST],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_R,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_3D,k,v);
 gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA16F,N[0],N[1],N[2],0,gl.RGBA,gl.HALF_FLOAT,null);LIVE.volFbo=gl.createFramebuffer();
 if(LIVE.progGen!==runtimeGeneration){LIVE.prog={};for(const k in LIVE_FS)LIVE.prog[k]=liveCompile(LIVE_H+LIVE_FS[k]);LIVE.prog.ray=liveCompile(LIVE_RAY);LIVE.prog.sum=liveCompile(LIVE_SUM);LIVE.prog.comp=liveCompile(LIVE_COMP);LIVE.progGen=runtimeGeneration;LIVE.vao=gl.createVertexArray()}
 liveBuildLevels();LIVE.ok=true;LIVE.err=null;LIVE.step=0;LIVE.t=0;livePasses(0,true);
}catch(e){LIVE.ok=false;LIVE.err=String(e?.message||e)}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,glCanvas.width,glCanvas.height);gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0)}}
function livePass(name,out,tex,uni,lv){lv=lv||LIVE.lv[0];const p=LIVE.prog[name],N=lv.N;gl.useProgram(p);gl.bindFramebuffer(gl.FRAMEBUFFER,out.f);gl.viewport(0,0,lv.W,lv.H);
 gl.uniform3i(liveU(p,'uN'),N[0],N[1],N[2]);gl.uniform1i(liveU(p,'uTX'),lv.tx);gl.uniform3f(liveU(p,'uMin'),...LIVE.min);gl.uniform3f(liveU(p,'uH'),...lv.h);gl.uniform1f(liveU(p,'uU'),LIVE.U);gl.uniform3f(liveU(p,'uBodyV'),...LIVE.bodyV);
 let unit=8;const bind=(n,t)=>{gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(liveU(p,n),unit);unit++};bind('uFlags',lv.flags.t);for(const n in tex)bind(n,tex[n]);
 for(const n in uni){const v=uni[n],l=liveU(p,n);if(l===null)continue;if(Array.isArray(v)){if(v.length===4)gl.uniform4f(l,...v);else if(v.length===3)gl.uniform3f(l,...v)}else if(v&&v.int!==undefined)gl.uniform1i(l,v.int);else if(v&&v.i3)gl.uniform3i(l,...v.i3);else if(v instanceof Float32Array)gl.uniform4fv(l,v);else gl.uniform1f(l,v)}
 gl.drawArrays(gl.TRIANGLES,0,3)}
/* ---- multigrid pressure solver (V-cycle over atlas levels) ---- */
function liveAtlas(n){const maxTex=gl.getParameter(gl.MAX_TEXTURE_SIZE);let tx=Math.ceil(Math.sqrt(n[2]*n[1]/n[0]));tx=Math.max(1,Math.min(tx,Math.floor(maxTex/n[0])));const ty=Math.ceil(n[2]/tx);return {tx,W:n[0]*tx,H:n[1]*ty}}
function liveBuildLevels(){const T=LIVE.tex,R=(W,H)=>liveTarget(W,H,gl.R32F,gl.RED,gl.FLOAT);
 T.res=liveTarget(LIVE.W,LIVE.H,gl.R32F,gl.RED,gl.FLOAT);T.frc=liveTarget(LIVE.W,LIVE.H,gl.RGBA32F,gl.RGBA,gl.FLOAT);
 LIVE.red=[];{let w=LIVE.W,h=LIVE.H;while(w>8||h>8){w=Math.ceil(w/8);h=Math.ceil(h/8);LIVE.red.push({w,h,t:liveTarget(w,h,gl.RGBA32F,gl.RGBA,gl.FLOAT)})}}
 const lv=[{N:LIVE.N,tx:LIVE.tx,W:LIVE.W,H:LIVE.H,h:LIVE.h,flags:T.flags,t:T,bK:'div',rK:'res'}];
 let n=LIVE.N.slice();
 for(let l=1;l<LIVE.mgLevels;l++){const m=n.map(v=>Math.max(2,Math.ceil(v/2)));if(Math.min(...m)<4&&l>1)break;n=m;const a=liveAtlas(n);
  const t={pA:R(a.W,a.H),pB:R(a.W,a.H),b:R(a.W,a.H),r:R(a.W,a.H),flags:liveTarget(a.W,a.H,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE)};
  lv.push({N:n.slice(),tx:a.tx,W:a.W,H:a.H,h:LIVE.max.map((v,i)=>(v-LIVE.min[i])/n[i]),flags:t.flags,t,bK:'b',rK:'r'})}
 LIVE.lv=lv}
function liveClear(t,v=0){gl.bindFramebuffer(gl.FRAMEBUFFER,t.f);gl.clearColor(v,v,v,v);gl.clear(gl.COLOR_BUFFER_BIT)}
function liveSmooth(l,n){const V=LIVE.lv[l],t=V.t;for(let k=0;k<n;k++){livePass('jacw',t.pB,{uP:t.pA.t,uDiv:t[V.bK].t},{uOm:LIVE.omega},V);const x=t.pA;t.pA=t.pB;t.pB=x}}
function liveCycle(l){const lv=LIVE.lv,V=lv[l],t=V.t;
 if(l===lv.length-1){liveSmooth(l,LIVE.coarseIters);return}
 liveSmooth(l,LIVE.mgPre);
 livePass('res',t[V.rK],{uP:t.pA.t,uB:t[V.bK].t},{},V);
 const C=lv[l+1];livePass('rest',C.t.b,{uRF:t[V.rK].t,uFF:V.flags.t},{uNF:{i3:V.N},uTXF:{int:V.tx},uRS:LIVE.mgRS},C);
 liveClear(C.t.pA);liveClear(C.t.pB);liveCycle(l+1);
 livePass('prol',t.pB,{uP:t.pA.t,uPC:C.t.pA.t,uFC:C.flags.t},{uNC:{i3:C.N},uTXC:{int:C.tx},uHC:C.h,uRN:LIVE.mgRN,uCorr:LIVE.mgCorr},V);const x=t.pA;t.pA=t.pB;t.pB=x;
 liveSmooth(l,LIVE.mgPost)}
function liveSolve(){const T=LIVE.tex;
 if(LIVE.warm===false){liveClear(T.pA);liveClear(T.pB)}
 if(LIVE.solver==='MG'&&LIVE.lv.length>1){const lv=LIVE.lv;for(let l=1;l<lv.length;l++)livePass('cflag',lv[l].flags,{uFF:lv[l-1].flags.t},{uNF:{i3:lv[l-1].N},uTXF:{int:lv[l-1].tx}},lv[l]);
  for(let c=0;c<LIVE.mgCycles;c++)liveCycle(0)}
 else for(let k=0;k<LIVE.jacobi;k++){livePass('jac',T.pB,{uP:T.pA.t,uDiv:T.div.t},{});liveSwap('pA','pB')}}/* Pressure force on the car voxels: F = sum over fluid cells next to a car cell of P*A*d, with P = rho*p/dt (p = projection pressure,
   u = u* - grad p, so p = dt*P/rho). Inviscid: no skin friction. Reduced on the GPU (8x8 block sums), read back as a few texels. */
function liveForceReduce(){const T=LIVE.tex;gl.bindVertexArray(LIVE.vao);livePass('force',T.frc,{uP:T.pA.t},{});let src=T.frc,sw=LIVE.W,sh=LIVE.H;const p=LIVE.prog.sum;gl.useProgram(p);
 for(const r of LIVE.red){gl.bindFramebuffer(gl.FRAMEBUFFER,r.t.f);gl.viewport(0,0,r.w,r.h);gl.activeTexture(gl.TEXTURE0+8);gl.bindTexture(gl.TEXTURE_2D,src.t);gl.uniform1i(liveU(p,'uS'),8);gl.uniform2i(liveU(p,'uSz'),sw,sh);gl.drawArrays(gl.TRIANGLES,0,3);src=r.t;sw=r.w;sh=r.h}
 return {src,sw,sh}}
function liveForceFinish(buf,n,dt){let fx=0,fy=0,fz=0;for(let i=0;i<n;i++){fx+=buf[i*4];fy+=buf[i*4+1];fz+=buf[i*4+2]}
 const rho=1.2,k=rho/dt,A=LIVE.vox?.front||0,q=.5*rho*LIVE.U*LIVE.U*A;
 return {Fx:fx*k,Fy:fy*k,Fz:fz*k,A,Cd:q>0?fx*k/q:NaN,Cl:q>0?fy*k/q:NaN,Cs:q>0?fz*k/q:NaN}}
function liveForces(){const dt=LIVE.lastDt||0;if(!LIVE.ok||!dt)return null;const {src,sw,sh}=liveForceReduce(),buf=new Float32Array(sw*sh*4);
 gl.bindFramebuffer(gl.FRAMEBUFFER,src.f);gl.readPixels(0,0,sw,sh,gl.RGBA,gl.FLOAT,buf);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null);return liveForceFinish(buf,sw*sh,dt)}
/* real-time path: PBO readback + fence, polled on later frames, so the CPU never waits for the GPU */
function liveForcesKick(){if(LIVE.frcJob||!LIVE.ok||!LIVE.lastDt)return;const {src,sw,sh}=liveForceReduce(),bytes=sw*sh*16;
 if(!LIVE.pbo){LIVE.pbo=gl.createBuffer()}gl.bindBuffer(gl.PIXEL_PACK_BUFFER,LIVE.pbo);if(LIVE.pboBytes!==bytes){gl.bufferData(gl.PIXEL_PACK_BUFFER,bytes,gl.STREAM_READ);LIVE.pboBytes=bytes}
 gl.bindFramebuffer(gl.FRAMEBUFFER,src.f);gl.readPixels(0,0,sw,sh,gl.RGBA,gl.FLOAT,0);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null);
 LIVE.frcJob={fence:gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0),n:sw*sh,dt:LIVE.lastDt,gen:LIVE.gen,tier:LIVE.q};gl.flush()}
function liveForcesPoll(){const J=LIVE.frcJob;if(!J)return;const r=gl.clientWaitSync(J.fence,0,0);if(r===gl.TIMEOUT_EXPIRED)return;gl.deleteSync(J.fence);LIVE.frcJob=null;if(r===gl.WAIT_FAILED||J.tier!==LIVE.q)return;
 const buf=new Float32Array(J.n*4);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,LIVE.pbo);gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,0,buf);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
 const f=liveForceFinish(buf,J.n,J.dt);if(!Number.isFinite(f.Fx)||Math.abs(f.Cd)>200){LIVE.guardTrips=(LIVE.guardTrips||0)+1;LIVE.solver='JACOBI';LIVE.forces=null;LIVE.api.reset();return}liveForceUpdate(f)}
function liveForceUpdate(f){if(!f||!Number.isFinite(f.Cd))return;const F=LIVE.forces;if(!F||F.U!==LIVE.U){LIVE.forces={U:LIVE.U,n:1,...f};return}
 const a=Math.max(.12,1/(F.n+1));for(const k of ['Fx','Fy','Fz','Cd','Cl','Cs'])F[k]+=(f[k]-F[k])*a;F.A=f.A;F.n++}/* Benchmark: vertical cylinder (D=0.5 m) spanning the tunnel height. Probe = lateral velocity 3D behind it, offset 0.5D. Strouhal St=f*D/U from the DFT peak. */
function liveBenchProbe(){const c=LIVE_BENCH;return [c.x+3*c.D,c.y,c.z+.5*c.D]}
function liveBenchSample(){const R=LIVE.benchRec;if(!R||LIVE.benchRes)return;const p=liveBenchProbe(),v=liveRead(p[0],p[1],p[2]);R.t.push(LIVE.t);R.v.push(v[2]);R.vx.push(v[0]);
 if(LIVE.t>=LIVE_BENCH.T)LIVE.benchRes=liveBenchAnalyze(R)}
function liveBenchAnalyze(R){const D=LIVE_BENCH.D,U=LIVE.U,dt=.01,t0=LIVE_BENCH.spin,ts=[],vs=[];let j=0;
 for(let t=t0;t<=R.t[R.t.length-1];t+=dt){while(j<R.t.length-2&&R.t[j+1]<t)j++;const a=R.t[j],b=R.t[j+1],w=b>a?(t-a)/(b-a):0;vs.push(R.v[j]*(1-w)+R.v[j+1]*w);ts.push(t)}
 const n=vs.length;if(n<50)return {ok:false,reason:'too few samples',n};const m=vs.reduce((a,b)=>a+b,0)/n,x=vs.map((v,i)=>(v-m)*(.5-.5*Math.cos(2*Math.PI*i/(n-1))));
 const rms=Math.sqrt(x.reduce((a,b)=>a+b*b,0)/n);const mag=f=>{let re=0,im=0;for(let i=0;i<n;i++){const ph=2*Math.PI*f*i*dt;re+=x[i]*Math.cos(ph);im-=x[i]*Math.sin(ph)}return Math.hypot(re,im)};
 let bf=0,bm=0;const fl=[];for(let f=.1;f<=4;f+=.02){const M=mag(f);fl.push([f,M]);if(M>bm){bm=M;bf=f}}
 const i=fl.findIndex(q=>q[0]===bf),a=fl[i-1]?.[1]??bm,c=fl[i+1]?.[1]??bm,den=a-2*bm+c,off=den!==0?.5*(a-c)/den:0,f=bf+off*.02;
 const St=f*D/U,ref=.2;const zc=[];for(let i=1;i<n;i++)if((vs[i-1]-m)*(vs[i]-m)<0)zc.push(i);const fz=zc.length>1?(zc.length-1)/2/((zc[zc.length-1]-zc[0])*dt):0;
 return {ok:true,n,seconds:n*dt,f,St,StZeroCross:fz*D/U,ref,relErr:(St-ref)/ref,vRms:rms/(.5),U,D,cells:D/Math.min(...LIVE.h),peakQ:bm/(fl.reduce((a,q)=>a+q[1],0)/fl.length)}}/* ---- frame-time controller: degrade quickly, promote slowly. Order down: smoke res -> canvas scale -> sub-steps -> lighting taps -> grid tier. ---- */
const LIVE_MAX_TIER={SOFT:'LOW',IGPU:'MED',APPLE:'HIGH',DGPU:'HIGH',UNKNOWN:'MED'};
function liveRelease(){const del=t=>{if(t&&t.t){gl.deleteTexture(t.t);gl.deleteFramebuffer(t.f)}},T=LIVE.tex;if(T)for(const k in T)del(T[k]);for(const V of (LIVE.lv||[]).slice(1))for(const k in V.t)del(V.t[k]);(LIVE.red||[]).forEach(r=>del(r.t));
 if(LIVE.obs)gl.deleteTexture(LIVE.obs);if(LIVE.vol)gl.deleteTexture(LIVE.vol);if(LIVE.volFbo)gl.deleteFramebuffer(LIVE.volFbo);LIVE.tex=null;LIVE.lv=null;LIVE.red=null}
function liveSetTier(q,why){if(!LIVE_Q[q]||q===LIVE.q&&LIVE.init)return;liveRelease();LIVE.forceQ=q;LIVE.init=false;LIVE.ok=false;LIVE.perf.switches++;LIVE.forces=null;LIVE.perf.cool=performance.now()+6000;LIVE.perf.last=0;LIVE.perf.ema=1000/LIVE.perf.target;LIVE.perf.log.push((why||'')+'→'+q)}
function liveInitTuning(){const P=LIVE.perf;if(P.tuned)return;P.tuned=true;const c=LIVE.gpuClass||'UNKNOWN',dpr=clamp(devicePixelRatio||1,1,2);P.cool=performance.now()+5000;
 P.maxTier=(window.matchMedia&&matchMedia('(pointer:coarse)').matches)?'LOW':(LIVE_MAX_TIER[c]||'MED');
 const init={SOFT:[.5,.6],IGPU:[.625,Math.min(1,1.25/dpr)],APPLE:[.875,Math.min(1,1.5/dpr)],DGPU:[1,1],UNKNOWN:[.75,1]}[c]||[.75,1];LIVE.rs=init[0];LIVE.cs=init[1];P.rsMax=Math.max(.75,init[0]);P.csMax=c==='DGPU'?1:Math.max(init[1],Math.min(1,1.5/dpr))}
function liveTune(now){const P=LIVE.perf;if(!P.last){P.last=now;return}const d=Math.min(250,now-P.last);P.last=now;P.ema+=(d-P.ema)*.05;
 if(!P.auto||now<P.cool||LIVE.freeze||document.hidden)return;const tg=1000/P.target,ti=LIVE_TIERS.indexOf(LIVE.q);let act=null;
 if(P.ema>tg*1.25){P.calm=0;
  if(LIVE.rs>.5001){LIVE.rs=Math.max(.5,LIVE.rs-.125);act='rs-'}else if(LIVE.cs>.6001){LIVE.cs=Math.max(.6,LIVE.cs-.1);act='cs-'}else if(LIVE.sub>1){LIVE.sub=1;act='sub-'}
  else if(LIVE.rq>0){LIVE.rq--;act='rq-'}else if(ti>0&&P.switches<5){if(P.promotedAt&&now-P.promotedAt<30000)P.maxTier=LIVE_TIERS[ti-1];liveSetTier(LIVE_TIERS[ti-1],'slow');return}
  if(act){P.cool=now+1500;P.log.push(act)}}
 else if(P.ema<tg*.72){P.calm=(P.calm||0)+1;if(P.calm<30)return;
  if(LIVE.sub<2){LIVE.sub=2;act='sub+'}else if(LIVE.rq<2){LIVE.rq++;act='rq+'}else if(LIVE.cs<P.csMax-.001){LIVE.cs=Math.min(P.csMax,LIVE.cs+.1);act='cs+'}else if(LIVE.rs<P.rsMax-.001){LIVE.rs=Math.min(P.rsMax,LIVE.rs+.125);act='rs+'}
  else if(ti<LIVE_TIERS.indexOf(P.maxTier||'LOW')&&P.switches<5&&P.calm>240){P.promotedAt=now;LIVE.rs=.625;liveSetTier(LIVE_TIERS[ti+1],'fast');return}
  if(act){P.cool=now+2500;P.calm=0;P.log.push(act)}}
 else P.calm=0}
function liveSwap(a,b){const T=LIVE.tex,t=T[a];T[a]=T[b];T[b]=t}
function liveEmitters(){const E=[],B=window.__BODY,fb=AETHER.FAN_MODULE?.layout?.fanBounds,x=fb?fb.max[0]+.3:-4.2;if(LIVE.mode==='RAKE_V'||LIVE.mode==='BOTH')for(let i=0;i<7;i++)E.push([x,.15+.22*i,0,.085]);
 if(LIVE.mode==='RAKE_H'||LIVE.mode==='BOTH')for(let i=0;i<9;i++)E.push([x,.5,-1.3+.325*i,.085]);
 if(LIVE.wand&&fpv.enabled&&B?.inTunnel){const cp=Math.cos(fpv.pitch),f=[Math.sin(fpv.yaw)*cp,Math.sin(fpv.pitch),-Math.cos(fpv.yaw)*cp],e=camera.eye;E.push([e[0]+f[0]*.75,e[1]+f[1]*.75-.3,e[2]+f[2]*.75,.09])}
 LIVE.emitters=E.slice(0,16);const a=new Float32Array(64);LIVE.emitters.forEach((v,i)=>a.set(v,i*4));return a}
function livePasses(dt,initOnly=false){const T=LIVE.tex,B=window.__BODY,act=!!(B&&B.active);gl.bindVertexArray(LIVE.vao);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
 LIVE.bodyV=act&&fpv.enabled?[fpv.vx||0,0,fpv.vz||0]:[0,0,0];
 livePass('flags',T.flags,{uObs:LIVE.obs},{uBody:act?[B.x,B.z,B.g,1]:[0,0,0,0]});
 if(initOnly){livePass('init',T.velA,{},{});return}
 const em=liveEmitters();
 livePass('curl',T.curl,{uVel:T.velA.t},{});livePass('advv',T.velB,{uVel:T.velA.t,uCurl:T.curl.t},{uDt:dt,uEps:LIVE.vortEps});liveSwap('velA','velB');
 livePass('div',T.div,{uVel:T.velA.t},{});liveSolve();if(LIVE.diag)livePass('res',T.res,{uP:T.pA.t,uB:T.div.t},{});
 livePass('proj',T.velB,{uVel:T.velA.t,uP:T.pA.t},{});liveSwap('velA','velB');
 livePass('advd',T.hat,{uVel:T.velA.t,uSrc:T.dyeA.t},{uDt:dt});livePass('advd',T.bar,{uVel:T.velA.t,uSrc:T.hat.t},{uDt:-dt});
 livePass('corr',T.dyeB,{uVel:T.velA.t,uSrc:T.dyeA.t,uHat:T.hat.t,uBar:T.bar.t},{uDt:dt,uDecay:.9985,uEmS:1,uEm:em,uEmN:{int:LIVE.emitters.length}});liveSwap('dyeA','dyeB');
 LIVE.step++;LIVE.t+=dt;LIVE.lastDt=dt}
function liveCopyVolume(){const p=LIVE.prog.copy,N=LIVE.N,T=LIVE.tex;gl.useProgram(p);gl.bindFramebuffer(gl.FRAMEBUFFER,LIVE.volFbo);gl.viewport(0,0,N[0],N[1]);
 gl.uniform3i(liveU(p,'uN'),N[0],N[1],N[2]);gl.uniform1i(liveU(p,'uTX'),LIVE.tx);gl.uniform3f(liveU(p,'uMin'),...LIVE.min);gl.uniform3f(liveU(p,'uH'),...LIVE.h);gl.uniform1f(liveU(p,'uU'),LIVE.U);
 const bind=(u,n,t)=>{gl.activeTexture(gl.TEXTURE0+u);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(liveU(p,n),u)};bind(8,'uFlags',T.flags.t);bind(9,'uVel',T.velA.t);bind(10,'uDye',T.dyeA.t);
 for(let k=0;k<N[2];k++){gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,LIVE.vol,0,k);gl.uniform1i(liveU(p,'uLayer'),k);gl.drawArrays(gl.TRIANGLES,0,3)}
 gl.bindTexture(gl.TEXTURE_3D,LIVE.vol);gl.generateMipmap(gl.TEXTURE_3D)}
function liveRead(x,y,z){const N=LIVE.N,i=Math.min(N[0]-1,Math.max(0,Math.floor((x-LIVE.min[0])/LIVE.h[0]))),j=Math.min(N[1]-1,Math.max(0,Math.floor((y-LIVE.min[1])/LIVE.h[1]))),k=Math.min(N[2]-1,Math.max(0,Math.floor((z-LIVE.min[2])/LIVE.h[2])));
 const ax=(k%LIVE.tx)*N[0]+i,ay=Math.floor(k/LIVE.tx)*N[1]+j,buf=new Float32Array(4);gl.bindFramebuffer(gl.FRAMEBUFFER,LIVE.tex.velA.f);gl.readPixels(ax,ay,1,1,gl.RGBA,gl.FLOAT,buf);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return [buf[0],buf[1],buf[2]]}
function liveStep(now){if(!LIVE.enabled)return;if(!LIVE.init||LIVE.gen!==runtimeGeneration){liveInit();liveInitTuning()}if(!LIVE.ok||LIVE.freeze)return;liveTune(now);if(!LIVE.init)return;if(now-(LIVE.lastFanCheck||0)>1000){LIVE.lastFanCheck=now;const fb=AETHER.FAN_MODULE?.layout?.fanBounds||null;if(JSON.stringify(fb)!==LIVE.fanKey)liveReobstacle(fb)}
 try{smokeState.enabled=false;const fdt=LIVE.lastT?Math.min(.05,(now-LIVE.lastT)/1000):1/60;LIVE.lastT=now;
  const hmin=Math.min(...LIVE.h),cfl=.9*hmin/(1.6*Math.max(LIVE.U,.5)),n=LIVE.step<40?6:LIVE.sub,dt=Math.min(cfl,Math.max(fdt,1/60)/LIVE.sub);
  for(let s=0;s<n;s++){livePasses(dt);if(LIVE.benchRec)liveBenchSample()}liveCopyVolume();
  liveForcesPoll();if(now-LIVE.lastRead>250){LIVE.lastRead=now;liveForcesKick();const B=window.__BODY;if(B&&B.active){const v=liveRead(B.x,B.g+1.2,B.z);LIVE.speedAt=Math.hypot(...v);LIVE.vAt=v}}
 }catch(e){LIVE.ok=false;LIVE.err=String(e?.message||e);smokeState.enabled=true}
 finally{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,glCanvas.width,glCanvas.height);gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0);gl.enable(gl.DEPTH_TEST)}}
function liveInv(m){const a=Array.from(m),inv=new Float32Array(16);
 inv[0]=a[5]*a[10]*a[15]-a[5]*a[11]*a[14]-a[9]*a[6]*a[15]+a[9]*a[7]*a[14]+a[13]*a[6]*a[11]-a[13]*a[7]*a[10];inv[4]=-a[4]*a[10]*a[15]+a[4]*a[11]*a[14]+a[8]*a[6]*a[15]-a[8]*a[7]*a[14]-a[12]*a[6]*a[11]+a[12]*a[7]*a[10];
 inv[8]=a[4]*a[9]*a[15]-a[4]*a[11]*a[13]-a[8]*a[5]*a[15]+a[8]*a[7]*a[13]+a[12]*a[5]*a[11]-a[12]*a[7]*a[9];inv[12]=-a[4]*a[9]*a[14]+a[4]*a[10]*a[13]+a[8]*a[5]*a[14]-a[8]*a[6]*a[13]-a[12]*a[5]*a[10]+a[12]*a[6]*a[9];
 inv[1]=-a[1]*a[10]*a[15]+a[1]*a[11]*a[14]+a[9]*a[2]*a[15]-a[9]*a[3]*a[14]-a[13]*a[2]*a[11]+a[13]*a[3]*a[10];inv[5]=a[0]*a[10]*a[15]-a[0]*a[11]*a[14]-a[8]*a[2]*a[15]+a[8]*a[3]*a[14]+a[12]*a[2]*a[11]-a[12]*a[3]*a[10];
 inv[9]=-a[0]*a[9]*a[15]+a[0]*a[11]*a[13]+a[8]*a[1]*a[15]-a[8]*a[3]*a[13]-a[12]*a[1]*a[11]+a[12]*a[3]*a[9];inv[13]=a[0]*a[9]*a[14]-a[0]*a[10]*a[13]-a[8]*a[1]*a[14]+a[8]*a[2]*a[13]+a[12]*a[1]*a[10]-a[12]*a[2]*a[9];
 inv[2]=a[1]*a[6]*a[15]-a[1]*a[7]*a[14]-a[5]*a[2]*a[15]+a[5]*a[3]*a[14]+a[13]*a[2]*a[7]-a[13]*a[3]*a[6];inv[6]=-a[0]*a[6]*a[15]+a[0]*a[7]*a[14]+a[4]*a[2]*a[15]-a[4]*a[3]*a[14]-a[12]*a[2]*a[7]+a[12]*a[3]*a[6];
 inv[10]=a[0]*a[5]*a[15]-a[0]*a[7]*a[13]-a[4]*a[1]*a[15]+a[4]*a[3]*a[13]+a[12]*a[1]*a[7]-a[12]*a[3]*a[5];inv[14]=-a[0]*a[5]*a[14]+a[0]*a[6]*a[13]+a[4]*a[1]*a[14]-a[4]*a[2]*a[13]-a[12]*a[1]*a[6]+a[12]*a[2]*a[5];
 inv[3]=-a[1]*a[6]*a[11]+a[1]*a[7]*a[10]+a[5]*a[2]*a[11]-a[5]*a[3]*a[10]-a[9]*a[2]*a[7]+a[9]*a[3]*a[6];inv[7]=a[0]*a[6]*a[11]-a[0]*a[7]*a[10]-a[4]*a[2]*a[11]+a[4]*a[3]*a[10]+a[8]*a[2]*a[7]-a[8]*a[3]*a[6];
 inv[11]=-a[0]*a[5]*a[11]+a[0]*a[7]*a[9]+a[4]*a[1]*a[11]-a[4]*a[3]*a[9]-a[8]*a[1]*a[7]+a[8]*a[3]*a[5];inv[15]=a[0]*a[5]*a[10]-a[0]*a[6]*a[9]-a[4]*a[1]*a[10]+a[4]*a[2]*a[9]+a[8]*a[1]*a[6]-a[8]*a[2]*a[5];
 const det=a[0]*inv[0]+a[1]*inv[4]+a[2]*inv[8]+a[3]*inv[12];for(let i=0;i<16;i++)inv[i]/=det;return inv}
function liveSmokeRT(w,h){const R=LIVE.smokeRT;if(R&&R.w===w&&R.h===h)return R;if(R){gl.deleteTexture(R.t);gl.deleteFramebuffer(R.f)}
 const t=liveTarget(w,h,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE);gl.bindTexture(gl.TEXTURE_2D,t.t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);return LIVE.smokeRT={...t,w,h}}
function liveRender(vp){if(!LIVE.enabled||!LIVE.ok)return;const dep=gl.isEnabled(gl.DEPTH_TEST),cull=gl.isEnabled(gl.CULL_FACE),cw=glCanvas.width,ch=glCanvas.height;try{
 const rs=LIVE.rs,w=Math.max(64,Math.round(cw*rs)),h=Math.max(64,Math.round(ch*rs)),RT=liveSmokeRT(w,h),p=LIVE.prog.ray,tq=LIVE.q==='LOW'?0:(LIVE.q==='MED'||LIVE.q==='HIGH'?1:2);
 gl.bindVertexArray(LIVE.vao);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.bindFramebuffer(gl.FRAMEBUFFER,RT.f);gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
 gl.useProgram(p);gl.activeTexture(gl.TEXTURE0+8);gl.bindTexture(gl.TEXTURE_3D,LIVE.vol);gl.uniform1i(liveU(p,'uVol'),8);gl.uniformMatrix4fv(liveU(p,'uInv'),false,liveInv(vp));
 gl.uniform3f(liveU(p,'uEye'),...camera.eye);gl.uniform3f(liveU(p,'uBMin'),...LIVE.min);gl.uniform3f(liveU(p,'uBMax'),...LIVE.max);gl.uniform2f(liveU(p,'uRes'),w,h);gl.uniform3f(liveU(p,'uLD'),.24,.95,.18);
 gl.uniform1f(liveU(p,'uDens'),LIVE.dens);gl.uniform1f(liveU(p,'uCMode'),LIVE.colorMode?1:0);gl.uniform1i(liveU(p,'uQ'),Math.min(tq,LIVE.rq));gl.uniform1i(liveU(p,'uFrame'),LIVE.frame=(LIVE.frame|0)+1);gl.drawArrays(gl.TRIANGLES,0,3);
 gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,cw,ch);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
 const c=LIVE.prog.comp;gl.useProgram(c);gl.activeTexture(gl.TEXTURE0+8);gl.bindTexture(gl.TEXTURE_2D,RT.t);gl.uniform1i(liveU(c,'uT'),8);gl.uniform2f(liveU(c,'uRes'),cw,ch);gl.drawArrays(gl.TRIANGLES,0,3);
}catch(e){LIVE.err='render: '+String(e?.message||e)}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.clearColor(.08,.11,.13,1);gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0);if(dep)gl.enable(gl.DEPTH_TEST);if(cull)gl.enable(gl.CULL_FACE);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA)}}
LIVE.api={read:(x,y,z)=>{const v=liveRead(x,y,z);return v},
 divStats(){const T=LIVE.tex,W=LIVE.W,H=LIVE.H;gl.bindVertexArray(LIVE.vao);livePass('div',T.div,{uVel:T.velA.t},{});const buf=new Float32Array(W*H*4);gl.bindFramebuffer(gl.FRAMEBUFFER,T.div.f);gl.readPixels(0,0,W,H,gl.RGBA,gl.FLOAT,buf);
  const fb=new Uint8Array(W*H*4);gl.bindFramebuffer(gl.FRAMEBUFFER,T.flags.f);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,fb);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null);
  let s=0,m=0,n=0;for(let i=0;i<W*H;i++){if(fb[i*4]>10)continue;const d=Math.abs(buf[i*4]);s+=d*d;m=Math.max(m,d);n++}const ref=LIVE.U/Math.min(...LIVE.h);return {rms:Math.sqrt(s/n),max:m,cells:n,relRms:Math.sqrt(s/n)/ref,relMax:m/ref}},
 dyeSum(){const T=LIVE.tex,W=LIVE.W,H=LIVE.H,buf=new Float32Array(W*H*4);gl.bindFramebuffer(gl.FRAMEBUFFER,T.dyeA.f);gl.readPixels(0,0,W,H,gl.RGBA,gl.FLOAT,buf);gl.bindFramebuffer(gl.FRAMEBUFFER,null);let s=0,c=0;for(let i=0;i<W*H;i++){s+=buf[i*4];if(buf[i*4]>.05)c++}return {sum:s,cells:c}}};

Object.assign(LIVE.api,{
 reset(){const T=LIVE.tex;LIVE.forces=null;gl.bindVertexArray(LIVE.vao);for(const k of ['velA','velB','curl','pA','pB','div','dyeA','dyeB','hat','bar','res'])liveClear(T[k]);for(const V of LIVE.lv.slice(1))for(const k of ['pA','pB','b','r'])liveClear(V.t[k]);livePasses(0,true);LIVE.step=0;LIVE.t=0;gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null)},
 /* deterministic stepping for tests: n steps of fixed dt, no rendering. opts.diag reads Poisson residual after the last solve */
 run(n,dt,opts={}){if(!LIVE.init)liveInit();const t0=performance.now();try{for(let i=0;i<n;i++){LIVE.diag=!!opts.diag&&i===n-1;livePasses(dt)}gl.bindFramebuffer(gl.FRAMEBUFFER,LIVE.tex.velA.f);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,new Float32Array(4))}finally{LIVE.diag=false;gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,glCanvas.width,glCanvas.height);gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0);gl.enable(gl.DEPTH_TEST)}
  const out={ms:performance.now()-t0,step:LIVE.step,t:LIVE.t,solver:LIVE.solver};if(opts.diag)out.poisson=LIVE.api.poisson();return out},
 poisson(){const T=LIVE.tex,W=LIVE.W,H=LIVE.H,r=new Float32Array(W*H*4),d=new Float32Array(W*H*4),fb=new Uint8Array(W*H*4);
  gl.bindFramebuffer(gl.FRAMEBUFFER,T.res.f);gl.readPixels(0,0,W,H,gl.RGBA,gl.FLOAT,r);gl.bindFramebuffer(gl.FRAMEBUFFER,T.div.f);gl.readPixels(0,0,W,H,gl.RGBA,gl.FLOAT,d);gl.bindFramebuffer(gl.FRAMEBUFFER,T.flags.f);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,fb);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  let sr=0,sd=0,mr=0,n=0;for(let i=0;i<W*H;i++){if(fb[i*4]>10)continue;const a=r[i*4],b=d[i*4];sr+=a*a;sd+=b*b;mr=Math.max(mr,Math.abs(a));n++}
  const ref=LIVE.U/Math.min(...LIVE.h);return {cells:n,resRms:Math.sqrt(sr/n)/ref,resMax:mr/ref,divRms:Math.sqrt(sd/n)/ref,ratio:Math.sqrt(sr/Math.max(sd,1e-30))}},
 /* convergence test of the pressure solver alone: fixed div from the current velocity field, p from zero, `n` solve calls */
 converge(n,cfg){const T=LIVE.tex,out=[];Object.assign(LIVE,cfg||{});gl.bindVertexArray(LIVE.vao);liveClear(T.pA);liveClear(T.pB);livePass('div',T.div,{uVel:T.velA.t},{});
  for(let i=0;i<n;i++){const t0=performance.now();liveSolve();livePass('res',T.res,{uP:T.pA.t,uB:T.div.t},{});const q=LIVE.api.poisson();out.push([i+1,+q.resRms.toExponential(3),+q.resMax.toExponential(3),+q.ratio.toExponential(3)])}
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null);return out},
 setBench(name,o){if(o&&o.D)LIVE_BENCH.D=o.D;LIVE.bench=name||null;LIVE.benchRes=null;LIVE.benchRec=name?{t:[],v:[],vx:[]}:null;liveReobstacle(AETHER.FAN_MODULE?.layout?.fanBounds||null);LIVE.api.reset()},
 /* headless benchmark: steps with fixed dt until benchRes is ready */
 bench(dt,maxSteps,o){LIVE.api.setBench('cylinder',o);dt=dt||.9*Math.min(...LIVE.h)/(1.6*Math.max(LIVE.U,.5));const t0=performance.now();for(let i=0;i<(maxSteps||2000)&&!LIVE.benchRes;i++){LIVE.api.run(1,dt);liveBenchSample()}return {res:LIVE.benchRes,steps:LIVE.step,ms:performance.now()-t0}},
 /* self-test: a uniform pressure must give zero net force on a closed body */
 uniformPForce(){const T=LIVE.tex;liveClear(T.pA,1);const f=liveForces();return f},
 setTier(q){liveSetTier(q,'api')},
 tune(now){liveTune(now)},
 rebuildLevels(){liveBuildLevels()},
 forces(){return liveForces()},
 set(o){Object.assign(LIVE,o)}});

function liveReobstacle(fanB){try{const N=LIVE.N,vox=liveVoxelize(N,LIVE.min,LIVE.h,fanB);LIVE.fanKey=JSON.stringify(fanB);LIVE.vox={car:vox.car,fan:vox.fan,front:vox.front,ms:Math.round(vox.ms)};const obs=new Uint8Array(LIVE.W*LIVE.H*4);
 for(let k=0;k<N[2];k++)for(let j=0;j<N[1];j++)for(let i=0;i<N[0];i++){const t=vox.type[i+N[0]*(j+N[1]*k)];if(!t)continue;const ax=(k%LIVE.tx)*N[0]+i,ay=Math.floor(k/LIVE.tx)*N[1]+j,o=(ay*LIVE.W+ax)*4;obs[o+(t===1?0:1)]=255;obs[o+3]=255}
 gl.bindTexture(gl.TEXTURE_2D,LIVE.obs);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,LIVE.W,LIVE.H,0,gl.RGBA,gl.UNSIGNED_BYTE,obs)}catch(e){LIVE.err='reobstacle: '+e.message}}
LIVE.setEnabled=v=>{LIVE.enabled=!!v;smokeState.enabled=!(LIVE.enabled&&LIVE.ok)};

function smokeDraw(vp){const f=m13FrameState.frame,fieldReady=!!(f&&f.fields?.velocity?.data&&f.solidMask?.data);const renderStart=performance.now();try{if(fieldReady&&smokeState.enabled)smokeUpdate(f,performance.now());smokeState.layoutError=null}catch(error){smokeState.layoutError=String(error?.message||error);smokeControlStatus();smokePerf.renderMs=performance.now()-renderStart;return}if(!fieldReady||!smokeState.enabled){smokePerf.renderMs=performance.now()-renderStart;return}const p=smokeState.program;gl.useProgram(p);gl.bindBuffer(gl.ARRAY_BUFFER,smokeState.posBuffer);const ap=gl.getAttribLocation(p,'a_position');gl.enableVertexAttribArray(ap);gl.vertexAttribPointer(ap,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,smokeState.sizeBuffer);const as=gl.getAttribLocation(p,'a_size');gl.enableVertexAttribArray(as);gl.vertexAttribPointer(as,1,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,smokeState.alphaBuffer);const aa=gl.getAttribLocation(p,'a_alpha');gl.enableVertexAttribArray(aa);gl.vertexAttribPointer(aa,1,gl.FLOAT,false,0,0);gl.uniformMatrix4fv(gl.getUniformLocation(p,'u_mvp'),false,vp);gl.uniform1f(gl.getUniformLocation(p,'u_viewScale'),glCanvas.height*.95);gl.enable(gl.DEPTH_TEST);gl.depthMask(false);gl.enable(gl.BLEND);if(!(window.__RIB&&window.__RIB.on&&RIB_DRAW(vp,f))){gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.drawArrays(gl.POINTS,0,smokeState.count)};smokeState.drawCalls++;const clock=performance.now();if(clock-smokeState.lastStatusAt>950){smokeState.lastStatusAt=clock;smokeControlStatus()}for(const a of [ap,as,aa])gl.disableVertexAttribArray(a);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(true);smokePerf.renderMs=performance.now()-renderStart}
function smokeControlStatus(){const el=document.getElementById('smokeStatus'),quick=document.getElementById('smokeQuickStatus'),f=m13FrameState.frame,office=!!f&&f.sourceId==='AETHER_S3_OFFICE_CPU',ready=!!(f?.fields?.velocity?.data&&f?.solidMask?.data),source=office?'32³ OFFICE CPU 진단 스냅샷':ready?'제품 solver 속도장 스냅샷':'사용 가능한 CFD 속도장 없음';if(quick)quick.textContent=ready?(smokeState.enabled?(smokeState.playing?' · '+source+' 입자 재생':' · 연기 일시정지'):' · 연기 표시 꺼짐'):' · '+source;if(el)el.textContent=smokeState.layoutError?'FLOW LAYOUT ERROR · '+smokeState.layoutError:f?source+' · CFD t='+f.simulationTime.toFixed(5)+'s · 입자 재생 t='+smokeState.playbackTime.toFixed(2)+'s · 정지장 재생 배속 ×'+smokeState.speedMultiplier+' · '+(smokeState.playing?'PLAYING':'PAUSED')+' · 수거 '+smokeState.captured:'CFD 속도장 대기 · 제품 solver 미연결 / 32³ OFFICE는 별도 CPU 진단';const d=document.getElementById('smokeDiagnostics');if(d&&!d.hidden)d.textContent=JSON.stringify(smokeDiagnosticsSnapshot(),null,2)}
function smokeSetupControls(){
 const byId=id=>document.getElementById(id),enabled=byId('smokeEnabled'),density=byId('smokeDensity'),play=byId('smokePlayback'),height=byId('smokeHeight'),lateral=byId('smokeLateral'),distance=byId('smokeDistance'),quality=byId('smokeQuality'),nozzle=byId('smokeNozzleSelect'),prefill=byId('smokePrefill');
 const update=()=>{flowLayoutCache=null;smokeState.resetRequested=true;try{const l=FLOW_LAYOUT.get(m13FrameState.frame||smokeHardwarePreviewFrame);diagnostics.flowLayout=l.diagnostics;const h=byId('smokeHeightValue'),z=byId('smokeLateralValue'),d=byId('smokeDistanceValue');if(h)h.textContent=(smokeState.height>=0?'+':'')+smokeState.height.toFixed(2)+' m';if(z)z.textContent=(smokeState.lateral>=0?'+':'')+smokeState.lateral.toFixed(2)+' m';if(d)d.textContent=l.emitterDistance.toFixed(2)+' m · '+l.emitterFraction.toFixed(2)+'L';}catch(e){smokeState.layoutError=String(e?.message||e)}smokeControlStatus()};
 enabled?.addEventListener('change',()=>{smokeState.enabled=enabled.checked;smokeSetState(!enabled.checked?'READY':smokeState.playing?'SMOKE_PLAYING':'PAUSED');smokeControlStatus()});
 density?.addEventListener('input',()=>{smokeState.count=clamp(Math.round(Number(density.value)/250)*250,500,12000);byId('smokeDensityValue').textContent=String(smokeState.count);smokeControlStatus()});
 play?.addEventListener('click',()=>{if(AETHER.M14?.getSnapshot?.()?.control?.emergencyStopped){return}smokeState.playing=!smokeState.playing;smokeSetState(smokeState.playing?'SMOKE_PLAYING':'PAUSED');play.textContent=smokeState.playing?'연기 일시정지':'연기 재생';play.setAttribute('aria-pressed',String(!smokeState.playing));smokeState.lastTime=performance.now();smokeControlStatus()});
 byId('smokeSpeed')?.addEventListener('input',e=>{smokeState.speedMultiplier=clamp(Number(e.target.value),1,5000);byId('smokeSpeedValue').textContent=smokeState.speedMultiplier+'×';smokeControlStatus()});
 nozzle?.addEventListener('change',()=>{smokeState.selectedNozzle=Number(nozzle.value);smokeState.resetRequested=true;smokeControlStatus()});prefill?.addEventListener('change',()=>{smokeState.prefill=prefill.checked;smokeState.resetRequested=true});
 height?.addEventListener('input',()=>{smokeState.height=clamp(Number(height.value)/100,-2,2);update()});lateral?.addEventListener('input',()=>{smokeState.lateral=clamp(Number(lateral.value)/100,-.30,.30);update()});distance?.addEventListener('input',()=>{smokeState.emitterFraction=clamp(Number(distance.value)/100,.35,.65);update()});
 quality?.addEventListener('change',()=>{const q=SMOKE_CONFIG.quality[quality.value]||SMOKE_CONFIG.quality.OFFICE;smokeState.count=q.particles;density.value=String(q.particles);byId('smokeDensityValue').textContent=String(q.particles);smokeControlStatus()});
 byId('smokeOutletView')?.addEventListener('click',()=>setPreset('Outlet'));byId('smokeHeroView')?.addEventListener('click',()=>setPreset('Hero'));const toggle=byId('smokeDiagnosticsToggle');toggle?.addEventListener('click',()=>{const d=byId('smokeDiagnostics');d.hidden=!d.hidden;toggle.setAttribute('aria-expanded',String(!d.hidden));toggle.textContent=d.hidden?'증기 진단 보기':'증기 진단 숨기기';smokeControlStatus()});if(prefill)prefill.checked=smokeState.prefill;update();
}
smokeSetupControls();

function draw(){raf=0;if(!gl||!program||gl.isContextLost()||document.hidden)return;try{const frameStart=performance.now();smokeRecordFrame(frameStart);updateWalk(frameStart);wowTick(frameStart);resize();liveStep(frameStart);renderLightingShadow();gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);bindLighting();gl.uniform4f(loc.eye,camera.eye[0],camera.eye[1],camera.eye[2],1);const view=lookAt(camera.eye,camera.target,camera.up),proj=perspective(camera.fov,glCanvas.width/glCanvas.height,camera.near,camera.far),vp=matMul(proj,view),id=identityMatrix();gl.disable(gl.BLEND);gl.depthMask(true);gl.disable(gl.CULL_FACE);const opaque=scene.objects.filter(o=>visibleInView(o)&&o.material!=='glass');for(const o of opaque){if(!o.gpu)continue;gl.uniformMatrix4fv(loc.model,false,id);gl.uniformMatrix4fv(loc.mvp,false,matMul(vp,id));drawMesh(o.gpu,id,{color:lightingColor(o),colorLinear:!!o.colorLinear,texture:o.texture||null,surface:surfaceFor(o),belt:o.name==='belt',beltTravel:rollingState.beltTravel},1)}for(const r of scene.roadParts){if(!r.visible||!r.gpu)continue;const rm=rollerModel(r,rollingState.rollerAngles[scene.roadParts.indexOf(r)]||0);gl.uniformMatrix4fv(loc.model,false,rm);gl.uniformMatrix4fv(loc.mvp,false,matMul(vp,rm));drawMesh(r.gpu,rm,{color:[.30,.34,.37,1],surface:r.pbrMaterial.surface,roller:true},1)}if(AETHER.FAN_MODULE?.loaded&&AETHER.EXHAUST_COLLECTOR?.loaded){const layout=FLOW_LAYOUT.get(m13FrameState.frame||smokeHardwarePreviewFrame),rotor=fanRotorVisualAngle(frameStart);for(const p of scene.fanParts){if(!p.gpu)continue;const fm=fanPartModel(p,rotor,layout);gl.uniformMatrix4fv(loc.model,false,fm);gl.uniformMatrix4fv(loc.mvp,false,matMul(vp,fm));drawMesh(p.gpu,fm,{color:p.color,colorLinear:true,surface:p.surface},1)}for(const p of scene.collectorParts){if(!p.gpu)continue;const cm=collectorPartModel(p,layout);gl.uniformMatrix4fv(loc.model,false,cm);gl.uniformMatrix4fv(loc.mvp,false,matMul(vp,cm));drawMesh(p.gpu,cm,{color:p.color,colorLinear:true,surface:p.surface},1)}}const cpVisible=m13FrameState.mode==='CP'&&m13FrameState.availability?.CP?.status==='AVAILABLE';const vm=vehicleModel();if(cpVisible)m13DrawCp(vp);else for(const p of scene.vehicleParts){if(!p.gpu)continue;const idx=p.role==='wheel'?wheelParts().indexOf(p):-1,pm=p.role==='wheel'?wheelModel(p,rollingState.wheelAngles[idx]||0):vm;gl.uniformMatrix4fv(loc.model,false,pm);gl.uniformMatrix4fv(loc.mvp,false,matMul(vp,pm));drawMesh(p.gpu,pm,{color:p.color,texture:p.texture,surface:p.surface,colorLinear:true},1)}bodyDraw(vp);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);m13DrawOverlay(vp);smokeDraw(vp);liveRender(vp);gl.disable(gl.BLEND);gl.depthMask(true);gl.useProgram(program);const transparent=scene.objects.filter(o=>visibleInView(o)&&o.material==='glass').sort((a,b)=>Math.hypot(...sub(b.center,camera.eye))-Math.hypot(...sub(a.center,camera.eye)));gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);for(const o of transparent){if(!o.gpu)continue;gl.uniformMatrix4fv(loc.model,false,id);gl.uniformMatrix4fv(loc.mvp,false,matMul(vp,id));drawMesh(o.gpu,id,{color:[...o.color,1]},.25)}gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.depthMask(true);gl.bindBuffer(gl.ARRAY_BUFFER,null);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,null);diagnostics.frames=(diagnostics.frames||0)+1;if(diagnostics.frames===1||(diagnostics.frames%120)===0){const err=gl.getError();smokePerf.webglError=err===gl.NO_ERROR?'NO_ERROR':String(err);if(err!==gl.NO_ERROR)throw Error('WebGL sampled error: '+err);}if(diagnostics.frames===1){diagnostics.bootStage='READY';wow.ready=true;wowUI.start.disabled=false;wowUI.start.textContent='풍동 가동 · 30초 체험';smokeSetState(m13FrameState.frame?(smokeState.playing?'SMOKE_PLAYING':'PAUSED'):'READY');const badge=document.getElementById('readyBadge');badge.textContent='M13 VIS READY · PRODUCT SOLVER UNBOUND';badge.className='badge warn';renderDiagnostics()}if(!document.hidden)raf=requestAnimationFrame(draw)}catch(e){smokeSetState('ERROR');failRuntime('frame',e)}}

function setPreset(name){fpv.enabled=false;clearWalk();if(document.exitPointerLock)document.exitPointerLock();camera.fov=50;camera.preset=name;camera.cutaway=name!=='Hero';const p=AETHER.VEHICLE_TRANSFORM.position,l=AETHER.FLOW_LAYOUT.get(m13FrameState.frame||smokeHardwarePreviewFrame);if(name==='Hero'){camera.eye=[p[0]-1.8,p[1]+2.4,p[2]+9.1];camera.target=[p[0],p[1]+1.05,p[2]];camera.up=[0,1,0]}if(name==='Side'){camera.eye=[p[0],p[1]+3,p[2]+13];camera.target=[p[0],p[1]+1,p[2]];camera.up=[0,1,0]}if(name==='Top'){camera.eye=[p[0],p[1]+22,p[2]+.001];camera.target=p.slice();camera.up=[0,0,-1]}if(name==='Fan'){camera.eye=[l.emitterPlane.x-3.0,2.72,0];camera.target=[l.emitterPlane.x-.4,2.72,0];camera.up=[0,1,0]}if(name==='Control'){camera.eye=[-2.8,1.90,8.65];camera.target=[-2.8,1.48,5.65];camera.up=[0,1,0]}if(name==='Outlet'){camera.eye=[l.collectorPlane.x+1.5,2.75,.05];camera.target=[l.collectorPlane.x-.7,2.75,0];camera.up=[0,1,0]}document.querySelectorAll('[data-camera]').forEach(b=>b.classList.toggle('active',b.dataset.camera===name));document.getElementById('viewName').textContent=name.toUpperCase();document.getElementById('cutaway').textContent='Cutaway: '+(camera.cutaway?'On':'Off');diagnostics.events.push({time:now(),type:'CAMERA',message:name+' preset'})}

// M20 visitor sequence: camera choreography, not synthetic CFD.
const wow={active:false,startAt:0,elapsed:0,pausedAt:0,ready:false};
const wowUI={overlay:document.getElementById('wowOverlay'),start:document.getElementById('wowStart'),skip:document.getElementById('wowSkip'),title:document.getElementById('wowTitle'),description:document.getElementById('wowDescription'),kicker:document.getElementById('wowKicker'),source:document.getElementById('wowSource'),progress:document.getElementById('wowProgress')};
function wowSourceLabel(){const f=m13FrameState.frame,office=AETHER.S3_OFFICE?.getSnapshot?.();if(office?.error)return '연기 데이터 없음 · 32³ 진단 실패: '+String(office.error).slice(0,100);if(f?.sourceId==='AETHER_S3_OFFICE_CPU')return '32³ OFFICE CPU 진단 · 제품 CFD 미연결';if(f)return '필드 출처: '+String(f.sourceId||'UNKNOWN');const status=document.getElementById('officeStatus')?.textContent||'';return status.includes('계산')||status.includes('매핑')?'32³ OFFICE CPU 계산 중 · 연기 준비 중':'제품 CFD 미연결 · 풍동 가동을 누르면 32³ 진단 시작';}
function wowStop(complete=false){wow.active=false;wow.elapsed=0;wowUI.overlay.classList.remove('playing');wowUI.skip.style.display='none';wowUI.start.disabled=!wow.ready;wowUI.start.textContent=complete?'30초 다시 보기':'풍동 가동 · 30초 체험';wowUI.kicker.textContent=complete?'AETHER · EXPERIENCE COMPLETE':'AETHER · WIND TUNNEL';wowUI.title.textContent=complete?'이제 직접 둘러보십시오.':'자동차 풍동, 눈앞에서 가동하십시오.';wowUI.description.textContent=complete?'카메라를 이동하고 단면·진단 데이터를 살펴보실 수 있습니다.':'팬 월부터 BMW M4 GT3 EVO의 후류까지 이어지는 30초 관람입니다.';wowUI.source.textContent=wowSourceLabel();wowUI.progress.style.width=complete?'100%':'0%';}
function wowStart(){if(!wow.ready||diagnostics.bootStage==='FAILED'||AETHER.M14?.getSnapshot?.().control.emergencyStopped)return;setPreset('Hero');AETHER.FAN_MODULE?.setVisualRunning(true);document.getElementById('m14FanToggle')?.setAttribute('aria-pressed','true');AETHER.M14?.setWindSpeed(1);if(!AETHER.S3_OFFICE?.getSnapshot?.().history.length){try{Promise.resolve(AETHER.S3_OFFICE.start(2)).catch(e=>diagnostics.warnings.push({time:now(),source:'wow-diagnostic',message:String(e)}))}catch(e){diagnostics.warnings.push({time:now(),source:'wow-diagnostic',message:String(e)})}}smokeState.enabled=true;document.getElementById('smokeEnabled').checked=true;smokeControlStatus();wow.active=true;wow.startAt=performance.now();wow.elapsed=0;wow.pausedAt=0;wowUI.overlay.classList.add('playing');wowUI.skip.style.display='block';wowUI.start.disabled=true;wowUI.start.textContent='관람 진행 중';wowUI.kicker.textContent='AETHER · LIVE FACILITY TOUR';}
function wowTick(nowMs){if(!wow.active)return;if(AETHER.M14?.getSnapshot?.().control.emergencyStopped){wowStop();return}const t=clamp((nowMs-wow.startAt)/1000,0,30);wow.elapsed=t;const p=AETHER.VEHICLE_TRANSFORM.position,l=FLOW_LAYOUT.get(m13FrameState.frame||smokeHardwarePreviewFrame),x=p[0],y=p[1],z=p[2];const keyframes=[
 {t:0,eye:[x-1.8,y+2.4,z+9.1],target:[x,y+1.05,z],fov:50},
 {t:5,eye:[x-2.2,y+2.1,z+6.4],target:[x,y+1.12,z],fov:46},
 {t:11,eye:[l.emitterPlane.x-2.8,3.15,3.0],target:[l.emitterPlane.x+.5,2.6,0],fov:55},
 {t:17,eye:[x-3.4,y+2.25,z+3.8],target:[x-.8,y+1.12,z],fov:51},
 {t:24,eye:[x+3.1,y+2.15,z+3.8],target:[x+1.75,y+1.45,z],fov:47},
 {t:30,eye:[x+2.4,y+2.7,z+6.1],target:[x+.5,y+1.1,z],fov:50}];
 let i=0;while(i<keyframes.length-2&&t>keyframes[i+1].t)i++;const a=keyframes[i],b=keyframes[i+1],v=clamp((t-a.t)/(b.t-a.t),0,1),s=v*v*(3-2*v),mix=(u,w)=>u+(w-u)*s;camera.preset='WOW';camera.cutaway=t>=10;camera.up=[0,1,0];camera.eye=a.eye.map((q,j)=>mix(q,b.eye[j]));camera.target=a.target.map((q,j)=>mix(q,b.target[j]));camera.fov=mix(a.fov,b.fov);
 const phases=[{end:5,title:'실물 크기 풍동',description:'설비와 차량의 규모를 먼저 확인합니다.'},{end:11,title:'팬 월 가동',description:'로터 회전은 실제 장면의 시각 상태입니다.'},{end:17,title:'연기의 이동',description:'계산된 진단 필드가 준비되면 그 속도장을 따라 표시합니다.'},{end:24,title:'차량을 지나는 흐름',description:'표시 중인 연기의 출처와 시간을 구분해 확인합니다.'},{end:31,title:'리어 스포일러와 후류',description:'차량 뒤쪽까지 따라가며 흐름을 살펴봅니다.'}];const phase=phases.find(q=>t<q.end)||phases[4];wowUI.title.textContent=phase.title;wowUI.description.textContent=phase.description;wowUI.source.textContent=wowSourceLabel();wowUI.progress.style.width=(t/30*100).toFixed(1)+'%';document.getElementById('viewName').textContent='AETHER · '+phase.title;document.getElementById('viewHint').textContent='30초 가이드 · '+wowSourceLabel();if(t>=30){wowStop(true);camera.preset='Hero';document.getElementById('viewName').textContent='HERO';document.getElementById('viewHint').textContent='Drag to orbit · wheel/pinch to zoom';}
}
wowUI.start.addEventListener('click',wowStart);wowUI.skip.addEventListener('click',()=>wowStop());
document.querySelectorAll('[data-camera],#reset,#walkMode').forEach(b=>b.addEventListener('click',()=>{if(wow.active)wowStop()}));glCanvas.addEventListener('pointerdown',()=>{if(wow.active)wowStop()},{passive:true});
let pointers=new Map(),lastPinch=0;glCanvas.addEventListener('pointerdown',e=>{if(fpv.enabled)return;captureInput(glCanvas,e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY])});glCanvas.addEventListener('pointermove',e=>{if(fpv.enabled)return;if(!pointers.has(e.pointerId))return;const old=pointers.get(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);if(pointers.size===1&&camera.preset!=='Top'){const dx=e.clientX-old[0],dy=e.clientY-old[1],off=sub(camera.eye,camera.target),dist=Math.hypot(...off),yaw=Math.atan2(off[0],off[2])+dx*.008,pitch=clamp(Math.asin(clamp(off[1]/dist,-1,1))+dy*.008,-1.45,1.45),h=dist*Math.cos(pitch);camera.eye=[camera.target[0]+Math.sin(yaw)*h,camera.target[1]+Math.sin(pitch)*dist,camera.target[2]+Math.cos(yaw)*h]}else if(pointers.size===2){const pts=[...pointers.values()],pinch=Math.hypot(pts[0][0]-pts[1][0],pts[0][1]-pts[1][1]);if(lastPinch>1&&pinch>1){const d=norm(sub(camera.eye,camera.target)),dist=Math.hypot(...sub(camera.eye,camera.target)),nd=clamp(dist*lastPinch/pinch,2,50);camera.eye=add(camera.target,mul(d,[nd,nd,nd]))}lastPinch=pinch}});['pointerup','pointercancel','lostpointercapture'].forEach(t=>glCanvas.addEventListener(t,e=>{if(fpv.enabled)return;pointers.delete(e.pointerId);if(pointers.size<2)lastPinch=0}));glCanvas.addEventListener('wheel',e=>{if(fpv.enabled)return;e.preventDefault();const d=norm(sub(camera.eye,camera.target)),dist=Math.hypot(...sub(camera.eye,camera.target)),nd=clamp(dist*Math.exp(e.deltaY*.001),2,50);camera.eye=add(camera.target,mul(d,[nd,nd,nd]))},{passive:false});
document.querySelectorAll('[data-camera]').forEach(b=>b.addEventListener('click',()=>setPreset(b.dataset.camera)));document.getElementById('reset').addEventListener('click',()=>setPreset('Hero'));document.getElementById('cutaway').addEventListener('click',e=>{camera.cutaway=!camera.cutaway;e.currentTarget.textContent='Cutaway: '+(camera.cutaway?'On':'Off')});document.getElementById('roadSection').addEventListener('click',e=>{AETHER.ROLLING_ROAD.setSectionView(!rollingState.roadSection);e.currentTarget.textContent='Road section: '+(rollingState.roadSection?'On':'Off')});window.addEventListener('resize',resize,{passive:true});

function renderStatus(){const el=document.getElementById('status'),vals=[['Renderer',gl&&program&&!gl.isContextLost()?'WebGL2 M12':'UNAVAILABLE',gl&&program&&!gl.isContextLost()?'ok':'bad'],['Vehicle',diagnostics.vehicleReady?(diagnostics.vehicleBounds.primitives+' primitives / '+diagnostics.vehicleBounds.vertices+' vertices'):'FAIL',diagnostics.vehicleReady?'ok':'bad'],['M3 facility',diagnostics.facilityReady?'GEOMETRY CHECKED':'FAIL',diagnostics.facilityReady?'ok':'bad'],['M4 road',diagnostics.m4Checks?.stations?'GEOMETRY CHECKED':'PENDING',diagnostics.m4Checks?.stations?'ok':'warn'],['M11 vehicle',AETHER.M11?.passed?'INTEGRATION CHECKED':'PENDING',AETHER.M11?.passed?'ok':'warn'],['M12 CFD bridge',AETHER.M12?.passed?'ALIGNMENT CHECKED':'PENDING',AETHER.M12?.passed?'ok':'warn'],['State',rollingState.source?rollingState.source.kind.toUpperCase():'UNBOUND',rollingState.source?'warn':'ok'],['Live solver',rollingState.source?.kind==='solver'&&!!rollingState.previous?'CONNECTED':'false','warn'],['Product ready','false','warn'],['Visual approval',applicationState.visualApproval,'warn'],['Textures',diagnostics.texturesReady?'READY':'PENDING',diagnostics.texturesReady?'ok':'warn']];el.textContent='';for(const[k,v,c]of vals){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v;dd.className=c;el.append(dt,dd)}const r=document.getElementById('roadStatus');if(r){const q=snapshotState();r.textContent='';for(const [k,v] of [['Source',q.sourceKind||'UNBOUND'],['Speed',q.effectiveSpeed.toFixed(3)+' m/s'],['Belt',q.beltTravel.toFixed(3)+' m'],['Section',q.roadSection?'ON':'OFF']]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v;r.append(dt,dd)}}}
function renderDiagnostics(){document.getElementById('diagnostics').textContent=JSON.stringify({bootStage:diagnostics.bootStage,errors:diagnostics.errors,warnings:diagnostics.warnings.slice(-8),vehicle:diagnostics.vehicleBounds,wheelNormalization:diagnostics.wheelNormalization,roadGeometry:diagnostics.roadGeometry,m4:diagnostics.m4Checks,m5:AETHER.M5,m6:AETHER.M6,m7:AETHER.M7,m8:AETHER.M8,m9:AETHER.M9,m10:AETHER.M10,m11:AETHER.M11,m12:AETHER.M12,cfdDomain:diagnostics.cfdDomain,cfdAlignment:diagnostics.cfdAlignment,texture:diagnostics.textureUpload,geometry:diagnostics.geometryValidation,runtime:{frames:diagnostics.frames||0,webgl2:!!gl&&!!program&&!gl.isContextLost(),canvas:[glCanvas.width,glCanvas.height],camera:camera.preset}},null,2);const m4=document.getElementById('m4View');if(m4)m4.textContent=JSON.stringify(snapshotState(),null,2);renderStatus()}

const m3Checklist={correctDimensions:false,wallPanels:false,ceilingPanels:false,floorSeams:false,serviceDoor:false,maintenanceHatch:false,measurementMarkers:false,rails:false,lightingRecess:false,equipmentMounts:false,structuralTransitions:false,majorBevels:false,bevelTopology:false,observationOpening:false,vehicleVisibility:false,industrialPlausibility:false,finiteGeometry:false,vehicleBounds:false};
function sightThroughObservationOpening(eye,target){const z=3.90,dz=target[2]-eye[2];if(Math.abs(dz)<1e-9)return true;const t=(z-eye[2])/dz;if(t<0||t>1)return true;const x=eye[0]+(target[0]-eye[0])*t,y=eye[1]+(target[1]-eye[1])*t;return x>=-3.5&&x<=3.5&&y>=.95&&y<=3.05}

function validateBoxMesh(m){
 const edges=new Map(),key=i=>Array.from(m.positions.slice(i*3,i*3+3)).map(v=>v.toFixed(6)).join(',');
 for(let k=0;k<m.indices.length;k+=3){const ids=Array.from(m.indices.slice(k,k+3)),p=ids.map(i=>Array.from(m.positions.slice(i*3,i*3+3)));
  if(dot(cross(sub(p[1],p[0]),sub(p[2],p[0])),Array.from(m.normals.slice(ids[0]*3,ids[0]*3+3)))<=0)return false;
  for(let j=0;j<3;j++){const edge=[key(ids[j]),key(ids[(j+1)%3])].sort().join('|');edges.set(edge,(edges.get(edge)||0)+1);}
 }return [...edges.values()].every(count=>count===2);
}

function inspectGeometry(){const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];let triangles=0;for(const p of scene.vehicleParts){if(!p.positions.every(finite)||!p.normals.every(finite)||!p.uvs.every(finite)||!p.indices.every(i=>i>=0&&i<p.positions.length/3))throw Error('Vehicle geometry invalid');triangles+=p.indices.length/3;const M=p.role==='wheel'?wheelModel(p,0):vehicleModel();for(let i=0;i<p.positions.length;i+=3){const q=m4point(M,[p.positions[i],p.positions[i+1],p.positions[i+2]]);for(let d=0;d<3;d++){lo[d]=Math.min(lo[d],q[d]);hi[d]=Math.max(hi[d],q[d])}}}const expected=AETHER.VEHICLE_TRANSFORM.localBounds,vehicleFits=lo.every((v,d)=>Math.abs(v-expected.min[d])<2e-3)&&hi.every((v,d)=>Math.abs(v-expected.max[d])<2e-3);const belt=scene.objects.find(o=>o.name==='belt'),beltTop=belt.center[1]+belt.size[1]/2;diagnostics.geometryValidation={vehicleFits,closedBoxes:scene.objects.filter(o=>o.type!=='authored-mesh').every(o=>validateBoxMesh(o._mesh)),authoredMeshesValid:scene.objects.filter(o=>o.type==='authored-mesh').every(o=>validateAuthoredConsoleMesh(o._mesh)),wallsFit:scene.objects.filter(o=>o.category==='wall panels').every(o=>Math.abs(o.center[0])+o.size[0]/2<=config.testSection.lengthX/2+1e-6),beltTop,contactGap:lo[1]-beltTop,triangles,actualMin:lo,actualMax:hi};return vehicleFits&&diagnostics.geometryValidation.closedBoxes&&diagnostics.geometryValidation.authoredMeshesValid&&diagnostics.geometryValidation.wallsFit&&Math.abs(lo[1]-beltTop)<.002}

function runM3Checks(){for(const o of scene.objects)if(!o._mesh)bevelMesh(o);const names=new Set(scene.objects.map(o=>o.category)),dim=config.testSection.lengthX===18&&config.testSection.widthZ===8&&config.testSection.heightY===5.5,finiteGeometry=scene.objects.every(o=>o.center.every(finite)&&o.size.every(v=>finite(v)&&v>0)&&o.bevel>=0);const b=AETHER.VEHICLE_TRANSFORM.worldAABB,vehicleBounds=b.min[1]===0&&Math.abs((b.max[0]-b.min[0])-config.vehicleReference.lengthX)<1e-9&&Math.abs((b.max[2]-b.min[2])-config.vehicleReference.widthZ)<1e-9;const bevelObjects=scene.objects.filter(o=>o.bevel>=.03),bevelTopology=bevelObjects.length>=20&&bevelObjects.every(o=>{const m=o._mesh,t=m&&m.topology;return t&&t.closed===true&&t.coreFaces===6&&t.edgeQuads===12&&t.cornerTriangles===8&&t.faces===26&&t.indexCount===132&&m.indices.length===132&&m.positions.length===96*3&&m.normals.length===m.positions.length&&m.indices.every(i=>Number.isInteger(i)&&i>=0&&i<m.positions.length/3)&&m.positions.every(finite)&&m.normals.every(finite)});const views={Hero:sightThroughObservationOpening([-1.8,2.4,9.1],[0,1.05,0]),Side:sightThroughObservationOpening([0,3,13],[0,1,0]),Top:true},observationOpening=names.has('observation opening')&&names.has('observation glass')&&!scene.objects.some(o=>o.name==='observation barrier'),vehicleVisibility=Object.values(views).every(Boolean);m3Checklist.correctDimensions=dim;m3Checklist.wallPanels=names.has('wall panels');m3Checklist.ceilingPanels=names.has('ceiling');m3Checklist.floorSeams=names.has('floor seams');m3Checklist.serviceDoor=names.has('service door');m3Checklist.maintenanceHatch=names.has('maintenance hatch');m3Checklist.measurementMarkers=names.has('measurement');m3Checklist.rails=names.has('rails');m3Checklist.lightingRecess=names.has('lighting recess');m3Checklist.equipmentMounts=names.has('equipment mounts');m3Checklist.structuralTransitions=names.has('transitions');m3Checklist.majorBevels=bevelObjects.length>=20;m3Checklist.bevelTopology=bevelTopology;m3Checklist.observationOpening=observationOpening;m3Checklist.vehicleVisibility=vehicleVisibility;m3Checklist.industrialPlausibility=finiteGeometry&&dim&&observationOpening&&bevelTopology;m3Checklist.finiteGeometry=finiteGeometry;m3Checklist.vehicleBounds=vehicleBounds;m3Checklist.measuredGeometry=inspectGeometry();AETHER.M3={passed:Object.values(m3Checklist).every(Boolean),checklist:m3Checklist,section:{lengthX:18,widthZ:8,heightY:5.5},observation:{opening:{widthX:7,heightY:2.1,minX:-3.5,maxX:3.5,minY:.95,maxY:3.05,z:3.90},visibilityViews:views,vehicleLineOfSight:'Center ray through portal only; Side/Top use cutaway; full silhouette not certified'},bevel:{appliedCount:bevelObjects.length,topology:{closed:true,coreFaces:6,edgeQuads:12,cornerTriangles:8,faces:26,indicesPerObject:132}},vehicle:{clearanceGround:b.min[1],bounds:b},geometry:{objects:scene.objects.length}};document.getElementById('m3View').textContent=JSON.stringify(AETHER.M3,null,2);return AETHER.M3}

function loadTextures(g,generation){const jobs=[];const images=g.json.images||[];for(let i=0;i<images.length;i++){const im=images[i],bv=g.json.bufferViews[im.bufferView];if(!bv||!Number.isInteger(bv.byteLength))throw Error('texture '+i+' missing bufferView');const off=bv.byteOffset||0,bytes=g.bin.subarray(off,off+bv.byteLength);if(bytes.byteLength!==bv.byteLength)throw Error('texture '+i+' truncated');jobs.push(createImageBitmap(new Blob([bytes],{type:im.mimeType||'image/png'}),{imageOrientation:'flipY'}).then(bitmap=>{if(generation!==runtimeGeneration||!gl||gl.isContextLost()){bitmap.close();return false}if(!bitmap.width||!bitmap.height)throw Error('texture '+i+' has invalid dimensions');const t=gl.createTexture(),pot=(bitmap.width&(bitmap.width-1))===0&&(bitmap.height&(bitmap.height-1))===0;gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,pot?gl.LINEAR_MIPMAP_LINEAR:gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,bitmap);if(pot)gl.generateMipmap(gl.TEXTURE_2D);textures[i]=t;bitmap.close();return true}).catch(e=>{if(generation!==runtimeGeneration)return false;diagnostics.error('texture '+i,e);throw e;}));}return Promise.all(jobs).then(results=>{if(generation!==runtimeGeneration)return false;if(results.some(v=>v!==true))return false;let uploaded=0;for(const p of scene.vehicleParts){const tex=p.textureIndex===null?null:g.json.textures?.[p.textureIndex];if(tex&&textures[tex.source]){p.texture=textures[tex.source];uploaded++}}diagnostics.textureUpload={requested:images.length,uploaded:textures.filter(Boolean).length,partsBound:uploaded,embeddedMime:images[0]?.mimeType||'unknown',resolution:'decoded'};diagnostics.texturesReady=images.length>0&&uploaded===scene.vehicleParts.length;if(!diagnostics.texturesReady)throw Error('texture binding incomplete');return true;}).catch(e=>{if(generation!==runtimeGeneration)return false;diagnostics.texturesReady=false;diagnostics.textureUpload={error:e.message};throw e;})}
function failRuntime(source,e){cancelAnimationFrame(raf);const failureStage=diagnostics.bootStage;diagnostics.bootStage='FAILED';diagnostics.error(source,e);renderDiagnostics();const badge=document.getElementById('readyBadge');badge.textContent='AETHER RUNTIME FAILED · '+String(e?.message||e).slice(0,100);badge.className='badge bad';badge.title='실패 단계: '+failureStage+' / '+(e?.stack||'');}
glCanvas.addEventListener('webglcontextlost',e=>{e.preventDefault();smokeRelease();m13ReleaseResources(true);runtimeGeneration++;cancelAnimationFrame(raf);diagnostics.bootStage='CONTEXT_LOST';diagnostics.texturesReady=false;rollingState.previous=null;rollingState.baseline=null;rollingState.effectiveSpeed=0;rollingState.motionReady=false;rollingState.aligned=alignedVehicle();if(AETHER.M4)AETHER.M4.liveSolverConnected=false;renderDiagnostics();const badge=document.getElementById('readyBadge');badge.textContent='GPU CONTEXT LOST — restoring';badge.className='badge bad';});
glCanvas.addEventListener('webglcontextrestored',()=>{smokeRelease();disposeLighting(true);m13ReleaseResources(true);buffers=[];textures=[];program=null;rollingState.previous=null;rollingState.baseline=null;rollingState.effectiveSpeed=0;rollingState.motionReady=false;rollingState.aligned=alignedVehicle();if(AETHER.M4)AETHER.M4.liveSolverConnected=false;for(const o of scene.objects)o.gpu=null;for(const p of scene.vehicleParts){p.gpu=null;p.texture=null;}for(const r of scene.roadParts)r.gpu=null;boot();});if(document.addEventListener)document.addEventListener('visibilitychange',()=>{suspendRollingRoad(document.hidden?'DOCUMENT_HIDDEN':'DOCUMENT_VISIBLE');if(document.hidden){cancelAnimationFrame(raf);raf=0}else{resize();smokeState.lastTime=performance.now();if(!raf)raf=requestAnimationFrame(draw)}});window.addEventListener('orientationchange',()=>setTimeout(resize,120),{passive:true});window.visualViewport?.addEventListener('resize',resize,{passive:true});


async function boot(){const generation=++runtimeGeneration;try{cancelAnimationFrame(raf);diagnostics.frames=0;diagnostics.bootStage='M1';if(!AETHER.M1.passed)throw Error('M1 contract failed');applicationState.contractReady=true;diagnostics.contractReady=true;diagnostics.bootStage='GLB';const g=loadVehicle();if(g.json.meshes.length!==VEHICLE_ASSET.sourceMeshBlocks||diagnostics.vehicleBounds.primitives!==VEHICLE_ASSET.sourceMeshBlocks||diagnostics.vehicleBounds.vertices<=0)throw Error('BMW M4 GT3 EVO source geometry contract mismatch');diagnostics.vehicleReady=true;diagnostics.bootStage='FAN_ASSET';loadFanModule();diagnostics.fanAssetReady=true;diagnostics.bootStage='M4_GEOMETRY';buildRollingRoadGeometry();diagnostics.facilityReady=runM3Checks().passed;if(!diagnostics.facilityReady)throw Error('M3 geometry gate failed');const m4=runM4Checks();if(!m4.geometryReady||!m4.stateContractReady)throw Error('M4 geometry/state gate failed');const m11=runM11Checks(g);if(!m11.passed)throw Error('M11 vehicle gate failed');diagnostics.bootStage='M12_ALIGNMENT';const m12=runM12Checks();if(!m12.passed)throw Error('M12 CFD alignment gate failed');diagnostics.bootStage='FLOW_LAYOUT';const initialLayout=FLOW_LAYOUT.get();buildExhaustCollector(initialLayout);if(!AETHER.EXHAUST_COLLECTOR.valid)throw Error('M15 rear collector layout invalid');validateEquipmentMeshes();AETHER.M8.fanAsset={asset:FAN_ASSET.name,sha256:FAN_ASSET.sha256,bytes:Math.floor(FAN_ASSET.base64.length*3/4)-(FAN_ASSET.base64.endsWith('==')?2:FAN_ASSET.base64.endsWith('=')?1:0),parts:FAN_ASSET.primitiveCount,triangles:FAN_ASSET.triangleCount,visualOnly:true,solverCoupled:false};AETHER.M8.checks.fanAssetValidated=Object.values(AETHER.FAN_MODULE.validation).every(Boolean);AETHER.M8.checks.fanAlignedToFlow=Object.values(initialLayout.checks).every(Boolean);AETHER.M8.geometryReady=Object.values(AETHER.M8.checks).every(Boolean);AETHER.M15={collector:{parts:AETHER.EXHAUST_COLLECTOR.parts.length,triangles:AETHER.EXHAUST_COLLECTOR.triangleCount,valid:AETHER.EXHAUST_COLLECTOR.valid,solverCoupled:false},fan:{parts:AETHER.FAN_MODULE.parts.length,triangles:FAN_ASSET.triangleCount,solverCoupled:false},status:'GEOMETRY_READY_VISUAL_REVIEW_PENDING'};doorBuild();bindM9Materials();diagnostics.bootStage='WEBGL';if(!initGL())throw Error('WebGL2 unavailable');setupResources();diagnostics.bootStage='MONITOR_ATLAS';try{diagnostics.monitorAtlasReady=initMonitorAtlas();if(!diagnostics.monitorAtlasReady)throw Error('M14_MONITOR_ATLAS_INIT_FAILED')}catch(atlasError){diagnostics.monitorAtlasReady=false;diagnostics.warnings.push({time:now(),source:'monitor-atlas',message:atlasError?.message||String(atlasError)});if(monitorAtlasTexture){gl.deleteTexture(monitorAtlasTexture);monitorAtlasTexture=null;}monitorAtlasCanvas=null;monitorAtlasContext=null;for(const o of scene.objects)if(o.name.startsWith('m6.glb.MonitorGlass.screen.'))o.texture=null;const note=document.getElementById('m14CommandStatus');if(note)note.textContent='3D 모니터 atlas를 사용할 수 없습니다. 기본 장면은 계속 표시합니다. '+(atlasError?.message||String(atlasError));}diagnostics.bootStage='TEXTURE';lastTextureJob=loadTextures(g,generation).catch(textureError=>{if(generation!==runtimeGeneration)return false;diagnostics.texturesReady=false;diagnostics.warnings.push({time:now(),source:'vehicle-textures',message:textureError?.message||String(textureError)});for(const tex of textures)if(tex)gl?.deleteTexture(tex);textures=[];for(const part of scene.vehicleParts)part.texture=null;const note=document.getElementById('m14CommandStatus');if(note)note.textContent='차량 텍스처를 불러오지 못해 기본 재질로 표시합니다. '+(textureError?.message||String(textureError));return true;});if(generation!==runtimeGeneration)return;diagnostics.bootStage='M10_LIGHTING';initLighting();setPreset('Hero');diagnostics.bootStage='M12_ALIGNMENT_CHECKED';diagnostics.bootStage='FIRST_FRAME';renderDiagnostics();if(!document.hidden)raf=requestAnimationFrame(draw)}catch(e){const failureStage=diagnostics.bootStage;diagnostics.bootStage='FAILED';diagnostics.error('boot',e);renderDiagnostics();const badge=document.getElementById('readyBadge');badge.textContent='AETHER BOOT FAILED · '+String(e?.message||e).slice(0,100);badge.className='badge bad';badge.title='실패 단계: '+failureStage+' / '+(e?.stack||'');}}
let lastTextureJob;document.getElementById('m1View').textContent=JSON.stringify(AETHER.M1,null,2);document.getElementById('configView').textContent=JSON.stringify({...config,m4:M4_CONFIG},null,2);window.addEventListener('error',e=>failRuntime('window.error',e.error||new Error(e.message)));window.addEventListener('unhandledrejection',e=>failRuntime('promise',e.reason));window.addEventListener('beforeunload',()=>{cancelAnimationFrame(raf);m13ReleaseResources(false);disposeLighting();for(const b of buffers)gl?.deleteBuffer(b);for(const o of scene.objects)for(const b of [o.gpu?.pb,o.gpu?.nb,o.gpu?.ub,o.gpu?.ib])if(b)gl?.deleteBuffer(b);for(const p of scene.vehicleParts)for(const b of [p.gpu?.pb,p.gpu?.nb,p.gpu?.ub,p.gpu?.ib])if(b)gl?.deleteBuffer(b);for(const r of scene.roadParts)for(const b of [r.gpu?.pb,r.gpu?.nb,r.gpu?.ub,r.gpu?.ib])if(b)gl?.deleteBuffer(b);for(const t of textures)gl?.deleteTexture(t);if(whiteTexture)gl.deleteTexture(whiteTexture);if(program)gl.deleteProgram(program)});
const S3_OFFICE_WORKER_SOURCE=window.__ASSETS.S3_OFFICE_WORKER_SOURCE;
(()=>{
 'use strict';
 const ui={resolution:document.getElementById('officeResolution'),speed:document.getElementById('officeSpeed'),steps:document.getElementById('officeSteps'),run:document.getElementById('officeRun'),live:document.getElementById('officeLive'),step:document.getElementById('officeStep'),stop:document.getElementById('officeStop'),reset:document.getElementById('officeReset'),download:document.getElementById('officeDownload'),status:document.getElementById('officeStatus'),report:document.getElementById('officeReport'),canvas:document.getElementById('officeSlice'),legend:document.getElementById('officeLegend')};
 const state={worker:null,url:null,signature:null,ready:false,busy:false,live:false,liveStartMs:0,pendingStep:false,stepTimer:null,remaining:0,history:[],historyTruncated:0,mask:null,startedAt:null,initMs:null,sliceHeightMeters:null,resolution:32,speed:1,lastError:null,m13Status:'SOLVER_UNBOUND',m13Frame:null};
 const setStatus=s=>{ui.status.textContent=s;smokeControlStatus()};
 function render(){
  const n=state.resolution,c=ui.canvas.getContext('2d');if(!c||!state.lastSpeed)return;
  ui.canvas.width=n;ui.canvas.height=n;const max=Math.max(.01,...state.lastSpeed),img=c.createImageData(n,n);
  for(let i=0;i<n*n;i++){const q=i*4,v=Math.max(0,Math.min(1,state.lastSpeed[i]/max));
   if(state.lastSolid?.[i]){img.data[q]=20;img.data[q+1]=25;img.data[q+2]=35;}
   else{img.data[q]=Math.round(20+235*v);img.data[q+1]=Math.round(70+150*Math.sqrt(v));img.data[q+2]=Math.round(180-145*v);}
   img.data[q+3]=255;
  }c.putImageData(img,0,0);ui.legend.textContent=`차량 중심 높이 y=${state.sliceHeightMeters?.toFixed(3)||'—'}m · 속도 0–${max.toFixed(3)}m/s · 어두운 칸은 고체`;
 }
 function report(){
  const value={status:state.lastError?'NUMERICAL_DIAGNOSTIC_BLOCKED':state.history.length?'NUMERICAL_DIAGNOSTIC_PASS_GEOMETRY_HOLD':'NOT_RUN',backend:'CPU_WORKER_REFERENCE',grid:[state.resolution,state.resolution,state.resolution],cells:state.resolution**3,cellSpacingMeters:[18/state.resolution,5.5/state.resolution,8/state.resolution],sliceHeightMeters:state.sliceHeightMeters,initializationMs:state.initMs,history:state.history,historyTruncated:state.historyTruncated,liveDiagnostic:{active:state.busy&&state.live,remainingSteps:state.remaining,maxSteps:6,timeBudgetMs:20000,elapsedMs:state.liveStartMs?Math.max(0,Date.now()-state.liveStartMs):0,stepIntervalMs:350},mask:state.mask,geometryApproved:false,physicsReady:false,M13:state.m13Status,m13Frame:state.m13Frame,error:state.lastError,scope:'32-cubed CPU solver preview only; geometry and physics are not approved and no force-coefficient result is produced'};
  ui.report.textContent=JSON.stringify(value,null,2);ui.download.disabled=!state.history.length;return value;
 }
 const OFFICE_SOLVER_ID='AETHER_S3_OFFICE_CPU';
 function releaseOfficeM13(){const api=AETHER.SCIENTIFIC_VIS,snap=api?.getSnapshot?.();if(snap?.source?.id===OFFICE_SOLVER_ID){api.unbindSolver();state.m13Status='SOLVER_UNBOUND';state.m13Frame=null;}}
 function publishOfficeM13(m){cfdSimulationTime=m.time;smokeSetState(smokeState.playing?'SMOKE_PLAYING':'FLOW_READY');const api=AETHER.SCIENTIFIC_VIS,snap=api?.getSnapshot?.();if(!api||!snap){state.m13Status='M13_API_UNAVAILABLE';return false;}if(snap.solverBound&&snap.source?.id!==OFFICE_SOLVER_ID){state.m13Status='OTHER_SOLVER_BOUND';return false;}if(!snap.solverBound&&!api.bindSolver({kind:'solver',id:OFFICE_SOLVER_ID})){state.m13Status='SOLVER_BIND_FAILED';return false;}const b=AETHER.CFD_DOMAIN.bounds,frame={vehicleTransformSignature:AETHER.CFD_BRIDGE.geometrySignature(),sourceId:OFFICE_SOLVER_ID,sequence:m.sequence,simulationTime:m.time,grid:{resolution:[state.resolution,state.resolution,state.resolution],min:b.min.slice(),max:b.max.slice(),layout:'X_FASTEST',unit:'meter',axes:{downstream:'+X',vehicleForward:'-X',up:'+Y',lateral:'+Z'},tier:'OFFICE_DIAGNOSTIC',sampleLocation:'CELL_CENTER'},freestream:{velocity:[state.speed,0,0],pressure:101325,density:1.225},fields:{pressure:{data:m.pressureField,components:1,unit:'Pa'},velocity:{data:m.velocityField,components:3,unit:'m/s'}},solidMask:{data:m.solidField}};if(!api.acceptFrame(frame)){state.m13Status='FRAME_REJECTED · '+(api.getSnapshot().lastRejection||'UNKNOWN');return false;}state.m13Status='OFFICE_PREVIEW_READY';smokeControlStatus();state.m13Frame={sourceId:OFFICE_SOLVER_ID,sequence:m.sequence,simulationTime:m.time,resolution:frame.grid.resolution.slice(),tier:'OFFICE_DIAGNOSTIC',sampleLocation:'CELL_CENTER'};const select=document.getElementById('scientificMode');if(select&&select.value==='NONE'){select.value='STREAMLINES';api.setMode('STREAMLINES');}return true;}
 function updateButtons(){ui.run.disabled=state.busy;ui.live.disabled=state.busy;ui.step.disabled=state.busy;ui.stop.disabled=!state.busy;ui.reset.disabled=state.busy;}
 function closeWorker(){if(state.stepTimer!==null){clearTimeout(state.stepTimer);state.stepTimer=null}state.pendingStep=false;releaseOfficeM13();if(state.worker){state.worker.terminate();state.worker=null;}if(state.url){URL.revokeObjectURL(state.url);state.url=null;}state.ready=false;state.signature=null;}
 function fail(message){smokeSetState('ERROR');state.lastError=String(message||'UNKNOWN_ERROR');closeWorker();state.busy=false;state.live=false;state.remaining=0;setStatus(`계산 중단: ${state.lastError}`);report();updateButtons();}
 function createWorker(){
  smokeSetState('CFD_COMPUTING');closeWorker();
  if(typeof Worker==='undefined'||typeof Blob==='undefined'||!URL.createObjectURL)throw Error('WEB_WORKER_UNAVAILABLE');
  state.url=URL.createObjectURL(new Blob([S3_OFFICE_WORKER_SOURCE],{type:'text/javascript'}));state.worker=new Worker(state.url);state.signature=`${state.resolution}:${state.speed}`;
  const activeWorker=state.worker;state.worker.onmessage=event=>{if(state.worker!==activeWorker)return;const m=event.data||{};
   if(m.type==='STATUS'){setStatus('차량 메시를 '+m.resolution+'³ 격자에 매핑하는 중…');return;}
   if(m.type==='READY'){state.ready=true;state.mask=m.mask;state.initMs=m.initializationMs;if(!state.busy){setStatus('초기화 완료 · 계산 중지');report();updateButtons();return}setStatus(`초기화 완료 · 고체 ${m.mask.shellVoxels+m.mask.interiorVoxels}셀 · 이제 시간 단계 계산`);report();next();return;}
   if(m.type==='ERROR'){fail(`${m.phase} / ${m.code}`);return;}
   if(m.type==='STEP_RESULT'){if(!state.pendingStep)return;state.pendingStep=false;if(!m.step?.ok){fail('NUMERICAL_STEP_REJECTED');return}if(!publishOfficeM13(m)){fail('FRAME_NOT_ACCEPTED / '+state.m13Status);return}state.history.push({sequence:m.sequence,time:m.time,stepMs:m.stepMs,dt:m.step.dt,pressureIterations:m.step.pressureIterations,residualRms:m.step.residualRms,metrics:m.step.metrics,backflow:m.step.backflow,accepted:true});if(state.history.length>64){state.history.shift();state.historyTruncated++}state.lastSpeed=m.speedSlice;state.lastSolid=m.solidSlice;state.sliceHeightMeters=m.sliceHeightMeters;render();report();state.remaining=Math.max(0,state.remaining-1);if(state.live&&Date.now()-state.liveStartMs>=20000)state.remaining=0;
    if(state.remaining>0){if(state.live){state.stepTimer=setTimeout(()=>{state.stepTimer=null;next()},350)}else next();return;}state.busy=false;state.live=false;setStatus(`완료 · ${m.sequence}단계 · 모의 시간 ${m.time.toFixed(4)}s · 계산된 CPU 단계 ${m.stepMs.toFixed(1)}ms`);updateButtons();return;
   }
  };
  state.worker.onerror=event=>{if(state.worker===activeWorker)fail(event.message||'WORKER_RUNTIME_ERROR')};
  const parts=AETHER.CFD_BRIDGE?.getSolidParts?.();if(!parts?.length)throw Error('VEHICLE_MESH_NOT_READY');
  const road=AETHER.M4_CONFIG.pit,belt={min:[road.beltCenter[0]-road.beltSize[0]/2,road.beltCenter[2]-road.beltSize[2]/2],max:[road.beltCenter[0]+road.beltSize[0]/2,road.beltCenter[2]+road.beltSize[2]/2],groundSpeed:state.speed};
  state.worker.postMessage({type:'INIT',resolution:state.resolution,parts,bounds:JSON.parse(JSON.stringify(AETHER.CFD_DOMAIN.bounds)),speed:state.speed,groundBelt:belt});
  state.startedAt=new Date().toISOString();
 }
 function next(){if(!state.busy||!state.worker||!state.ready||state.pendingStep)return;if(state.remaining<=0||(state.live&&state.liveStartMs&&Date.now()-state.liveStartMs>=20000)){state.busy=false;state.live=false;setStatus('연속 진단 종료 · 최신 승인 결과 유지');report();updateButtons();return;}if(state.live&&!state.liveStartMs)state.liveStartMs=Date.now();state.pendingStep=true;setStatus(`CPU 32³ 진단 계산 중 · 남은 단계 ${state.remaining}`);state.worker.postMessage({type:'STEP'});}
 function start(count,live=false){if(AETHER.M14?.getSnapshot?.()?.control?.emergencyStopped){setStatus('E-STOP 래치 중 · 계산 시작 명령 거부');return false;}if(state.busy||!Number.isInteger(count)||count<1||count>12)return false;const n=Number(ui.resolution.value),speed=Number(ui.speed.value);if(n!==32&&n!==64){fail('unsupported resolution');return false;}if(!Number.isFinite(speed)||speed<0||speed>5){fail('유입 속도는 0–5 m/s 범위여야 합니다.');return false;}
  const signature=`${n}:${speed}`;if(state.worker&&state.signature!==signature){closeWorker();state.history=[];state.historyTruncated=0;state.mask=null;state.lastSpeed=null;state.lastSolid=null;state.initMs=null;state.sliceHeightMeters=null;}
  state.resolution=n;state.speed=speed;state.remaining=count;state.busy=true;state.live=!!live;state.liveStartMs=0;state.pendingStep=false;state.lastError=null;updateButtons();setStatus('CPU 32³ 작업자 초기화 중…');
  try{const sig=`${n}:${speed}`;if(!state.worker||state.signature!==sig)createWorker();if(state.ready)next();return true;}catch(e){fail(e.message);return false;}
 }
 function pause(){if(!state.busy)return false;state.remaining=0;state.live=false;if(state.stepTimer!==null){clearTimeout(state.stepTimer);state.stepTimer=null}if(!state.pendingStep){state.busy=false;setStatus('중지됨 · 마지막 승인된 CFD 결과 유지');report();updateButtons();return true}setStatus('현재 계산 단계가 끝나면 중지합니다.');return true;}
 function reset(){closeWorker();state.busy=false;state.live=false;state.liveStartMs=0;state.remaining=0;state.history=[];state.historyTruncated=0;state.mask=null;state.lastSpeed=null;state.lastSolid=null;state.initMs=null;state.sliceHeightMeters=null;state.lastError=null;state.startedAt=null;ui.canvas.width=32;ui.canvas.height=32;ui.canvas.getContext('2d')?.clearRect(0,0,32,32);ui.legend.textContent='중앙 단면 속도: 아직 계산되지 않았습니다.';ui.report.textContent='실제 계산 뒤 결과가 표시됩니다.';setStatus('초기화됨 · 32³ CPU 진단 대기');updateButtons();return true;}
 function download(){const data=report(),blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='AETHER_S3_OFFICE_CPU_DIAGNOSTIC.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 ui.run.addEventListener('click',()=>start(Number(ui.steps.value)));ui.live.addEventListener('click',()=>start(6,true));ui.step.addEventListener('click',()=>start(1));ui.stop.addEventListener('click',pause);ui.reset.addEventListener('click',reset);ui.download.addEventListener('click',download);
 AETHER.S3_OFFICE=Object.freeze({start,startLive:()=>start(6,true),pause,reset,getSnapshot:report});updateButtons();
})();

// M14 CONTROL ROOM: canonical operator state shared by the HTML panel, 3D console,
// rolling-road adapter, and engineering-data atlas. Product CFD remains explicitly unbound.
(()=>{
 const el={speed:document.getElementById('m14WindSpeed'),speedValue:document.getElementById('m14WindSpeedValue'),officeSpeed:document.getElementById('officeSpeed'),road:document.getElementById('m14RoadToggle'),estop:document.getElementById('m14Estop'),reset:document.getElementById('m14ResetEstop'),banner:document.getElementById('m14StateBanner'),command:document.getElementById('m14CommandStatus'),product:document.getElementById('m14ProductStatus'),diagnostic:document.getElementById('m14DiagnosticStatus'),time:document.getElementById('m14TimeStatus'),residual:document.getElementById('m14ResidualStatus'),roadStatus:document.getElementById('m14RoadStatus')};
 const state={windSpeed:Number(el.officeSpeed?.value||1),rollingRoadEnabled:rollingState.motorEnabled,emergencyStopped:rollingState.emergencyStopped,lastCommand:'INITIALIZED',lastSolverCommand:'SETPOINT_ONLY_UNBOUND'};
 const controlsBlocked=['officeRun','officeLive','officeStep','smokePlayback','m14FanToggle'];
 const fixed=(x,n=3)=>Number.isFinite(x)?x.toFixed(n):'—';
 function safeSolverSnapshot(){try{return AETHER.SOLVER?.getSnapshot?.()||null}catch(_){return null}}
 function productSolverReady(s=safeSolverSnapshot()){return !!s&&(s.productionBound===true||s.productionSolverBound===true)&&s.boundaryControlReady===true;}
 function rejectWhileStopped(action){if(!state.emergencyStopped)return false;state.lastCommand='REJECTED_ESTOP_'+action;el.command.textContent='E-STOP 래치 중 허용되지 않는 변경 명령을 거부했습니다. 해제 후 필요한 작업을 별도로 실행하세요.';render();return true;}
 function officeSnapshot(){try{return AETHER.S3_OFFICE?.getSnapshot?.()||null}catch(_){return null}}
 function getSnapshot(){const road=AETHER.ROLLING_ROAD?.getSnapshot?.()||{motorEnabled:false,emergencyStopped:false,effectiveSpeed:0,liveSolverConnected:false},office=officeSnapshot(),last=office?.history?.length?office.history[office.history.length-1]:null,solver=safeSolverSnapshot();return Object.freeze({milestone:'M14_CONTROL_ROOM_FUNCTIONAL_INTEGRATION',fan:Object.freeze({module:AETHER.FAN_MODULE?.assetName||'LOADING',visualRunning:!!AETHER.FAN_MODULE?.visualRunning,solverCoupled:false}),collector:Object.freeze({loaded:!!AETHER.EXHAUST_COLLECTOR?.loaded,valid:!!AETHER.EXHAUST_COLLECTOR?.valid,visualOnly:true,solverCoupled:false}),integrationStatus:'FOUNDATION_ONLY_M13_PRODUCT_SOLVER_UNBOUND',integrationReady:productSolverReady(solver),control:Object.freeze({windSpeed:state.windSpeed,windSetpointMode:solver?.boundaryControlReady===true?'LIVE_SOLVER_BOUNDARY':'32^3_CPU_DIAGNOSTIC_NEXT_RUN_ONLY',rollingRoadEnabled:road.motorEnabled,emergencyStopped:road.emergencyStopped}),solver:Object.freeze({productionBound:productSolverReady(solver),boundaryControlReady:solver?.boundaryControlReady===true,state:solver?.state||'S0_SHELL'}),rollingRoad:road,diagnostic:Object.freeze({status:office?.status||'NOT_RUN',resolution:office?.grid||[32,32,32],lastStep:last||null,historyCount:office?.history?.length||0,M13:office?.M13||'WAITING_FOR_FIELD'})})}
 function paintObject(name,color){const o=scene.objects.find(x=>x.name===name)||(['m5.m14.monitor.solver','m5.m14.monitor.flow','m5.m14.monitor.estop'].includes(name)?scene.objects.find(x=>x.name==='m6.glb.ScreenUI'):null);if(o)o.color=color}
 function sync3D(snap){updateMonitorAtlas();const stopped=snap.control.emergencyStopped,enabled=snap.control.rollingRoadEnabled;paintObject('m5.m14.button.estop',stopped?[1,.07,.045]:[.80,.12,.10]);paintObject('m5.m14.button.road',enabled?[.16,.70,.42]:[.26,.30,.33]);paintObject('m5.m14.monitor.solver',snap.solver.productionBound?[.18,.75,.40]:[.86,.48,.12]);paintObject('m5.m14.monitor.flow',[.18+snap.control.windSpeed/10,.38+snap.control.windSpeed/12,.58]);paintObject('m5.m14.monitor.road',enabled?[.15,.62,.38]:[.35,.39,.42]);paintObject('m5.m14.monitor.estop',stopped?[1,.08,.05]:[.24,.62,.35]);}
 function render(){const fan=AETHER.FAN_MODULE,collector=AETHER.EXHAUST_COLLECTOR,fanStatus=document.getElementById('m14FanStatus'),collectorStatus=document.getElementById('m14CollectorStatus'),fanButton=document.getElementById('m14FanToggle');if(fanStatus)fanStatus.textContent=fan?.loaded?(fan.visualRunning?'시각 회전 중 · CFD 영향 없음':'시각 정지 · CFD 영향 없음'):'AETHER FAN V2 로딩 중';if(collectorStatus)collectorStatus.textContent=collector?.loaded?(collector.valid?'정렬됨 · CFD 출구 미연결':'배치 검토 필요 · FLOW_LAYOUT 진단 확인'):'후방 수거부 준비 중';if(fanButton){fanButton.disabled=!fan?.loaded;fanButton.setAttribute('aria-pressed',String(!!fan?.visualRunning));fanButton.textContent=fan?.visualRunning?'팬 시각 회전 정지':'팬 시각 회전 시작'}const s=getSnapshot(),last=s.diagnostic.lastStep,solverText=s.solver.productionBound?'BOUND':'UNBOUND · WAITING_FOR_FIELD';el.speed.value=String(state.windSpeed);el.speedValue.textContent=fixed(state.windSpeed,1)+' m/s';el.officeSpeed.value=String(state.windSpeed);el.road.setAttribute('aria-pressed',String(s.control.rollingRoadEnabled));el.road.textContent=s.control.rollingRoadEnabled?'롤링로드 정지':'롤링로드 준비';el.road.disabled=s.control.emergencyStopped;el.estop.setAttribute('aria-pressed',String(s.control.emergencyStopped));el.reset.disabled=!s.control.emergencyStopped;el.banner.classList.toggle('estop',s.control.emergencyStopped);el.banner.textContent=s.control.emergencyStopped?'E-STOP LATCHED · solver pause 요청 · smoke/롤링로드 정지':`제어 연결됨 · 제품 CFD ${solverText}`;el.product.textContent=solverText;el.diagnostic.textContent=s.diagnostic.historyCount?`32³ OFFICE CPU · ${s.diagnostic.status}`:`32³ OFFICE CPU · ${s.diagnostic.status}`;el.time.textContent=last?`t=${fixed(last.time,4)} s · step ${last.sequence}`:'—';el.residual.textContent=last?`${fixed(last.residualRms,5)} · ${last.pressureIterations} iter`:'—';const r=s.rollingRoad;el.roadStatus.textContent=`${r.motorEnabled?'명령 ON':'정지'} · ${r.liveSolverConnected?'solver source':'source 미연결'} · ${fixed(r.effectiveSpeed,2)} m/s`;el.command.textContent=s.solver.productionBound?'제품 solver 제어 연결됨':(s.control.emergencyStopped?'중지됨 · 재개에는 E-STOP 해제가 필요합니다':`Setpoint ${fixed(s.control.windSpeed,1)} m/s · OFFICE 다음 진단에 적용 · 제품 solver 미연결`);sync3D(s);}
 function setWindSpeed(value,source='panel'){const n=Number(value);if(!Number.isFinite(n)||n<0||n>5||Math.abs(n*2-Math.round(n*2))>1e-8){state.lastCommand='REJECTED_WIND_SETPOINT';el.command.textContent='풍속은 0–5 m/s, 0.5 m/s 간격으로 입력해야 합니다.';return false;}if(state.emergencyStopped&&n!==0){state.lastCommand='REJECTED_ESTOP_WIND_SETPOINT';el.command.textContent='E-STOP 해제 전 풍속 목표 변경은 거부됩니다.';return false;}state.windSpeed=n;state.lastCommand='WIND_SETPOINT_UPDATED';state.lastSolverCommand='SETPOINT_ONLY_UNBOUND';if(AETHER.SOLVER?.getSnapshot?.()?.boundaryControlReady===true&&typeof AETHER.SOLVER.setBoundaryConditions==='function'){try{const result=AETHER.SOLVER.setBoundaryConditions({freestreamSpeed:n});state.lastSolverCommand=result?.ok?'BOUNDARY_ACCEPTED':(result?.code||'BOUNDARY_REJECTED');}catch(_){state.lastSolverCommand='BOUNDARY_REJECTED';}}render();if(source==='panel'&&officeSnapshot()?.busy)el.command.textContent=`목표 ${fixed(n,1)} m/s 저장 · 현재 CPU 단계에는 미적용, 다음 진단 실행부터 적용`;return true;}
 function setRoadEnabled(enabled){if(state.emergencyStopped&&enabled)return false;const ok=AETHER.ROLLING_ROAD.setMotorEnabled(enabled);if(!ok)return false;state.rollingRoadEnabled=enabled;state.lastCommand=enabled?'ROLLING_ROAD_ARMED':'ROLLING_ROAD_STOPPED';render();return true;}
 function emergencyStop(){if(state.emergencyStopped)return true;state.emergencyStopped=true;state.windSpeed=0;AETHER.FAN_MODULE?.setVisualRunning(false);state.lastCommand='E_STOP_LATCHED';state.rollingRoadEnabled=false;AETHER.ROLLING_ROAD.setEmergencyStop(true);try{const ss=safeSolverSnapshot();if(productSolverReady(ss)&&typeof AETHER.SOLVER.setBoundaryConditions==='function'){const ack=AETHER.SOLVER.setBoundaryConditions({freestreamSpeed:0});state.lastSolverCommand=ack?.ok?'ESTOP_ZERO_BOUNDARY_ACCEPTED':(ack?.code||'ESTOP_ZERO_BOUNDARY_REJECTED');}}catch(_){state.lastSolverCommand='ESTOP_ZERO_BOUNDARY_REJECTED';}try{AETHER.S3_OFFICE?.pause?.()}catch(_){}try{AETHER.SOLVER?.pause?.()}catch(_){}if(smokeState){smokeState.playing=false;smokeState.lastTime=performance.now();smokeSetState('PAUSED');const b=document.getElementById('smokePlayback');if(b){b.textContent='연기 재생';b.setAttribute('aria-pressed','false')}smokeControlStatus()}render();return true;}
 function resetEmergencyStop(){if(!state.emergencyStopped)return true;AETHER.ROLLING_ROAD.setEmergencyStop(false);state.emergencyStopped=false;state.rollingRoadEnabled=false;state.lastCommand='E_STOP_RESET_ROAD_REMAINS_STOPPED';render();return true;}
 el.speed.addEventListener('input',()=>setWindSpeed(el.speed.value));el.officeSpeed.addEventListener('input',()=>{if(!setWindSpeed(el.officeSpeed.value,'office'))el.officeSpeed.value=String(state.windSpeed)});el.road.addEventListener('click',()=>setRoadEnabled(!state.rollingRoadEnabled));el.estop.addEventListener('click',emergencyStop);el.reset.addEventListener('click',resetEmergencyStop);document.getElementById('m14FanToggle')?.addEventListener('click',()=>{if(rejectWhileStopped('FAN_ENABLE'))return;const fan=AETHER.FAN_MODULE;if(!fan?.loaded)return;fan.setVisualRunning(!fan.visualRunning);render()});
 document.addEventListener('click',event=>{const button=event.target?.closest?.('button');if(state.emergencyStopped&&button&&controlsBlocked.includes(button.id)){event.preventDefault();event.stopImmediatePropagation();}},true);
 function rayAabb(origin,dir,obj){let lo=-Infinity,hi=Infinity;for(let a=0;a<3;a++){const half=obj.size[a]/2+.045,min=obj.center[a]-half,max=obj.center[a]+half;if(Math.abs(dir[a])<1e-9){if(origin[a]<min||origin[a]>max)return null;continue;}let t0=(min-origin[a])/dir[a],t1=(max-origin[a])/dir[a];if(t0>t1)[t0,t1]=[t1,t0];lo=Math.max(lo,t0);hi=Math.min(hi,t1);if(hi<lo)return null;}return hi<0?null:Math.max(0,lo);}
 function pick3DControl(event){if(camera.preset!=='Control')return;const rect=glCanvas.getBoundingClientRect(),f=normalize3(camera.target.map((v,i)=>v-camera.eye[i])),u=normalize3(camera.up),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],right=normalize3(cross(f,u)),up=cross(right,f),nx=(event.clientX-rect.left)/rect.width*2-1,ny=1-(event.clientY-rect.top)/rect.height*2,tan=Math.tan(camera.fov*Math.PI/360),aspect=rect.width/rect.height,dir=normalize3(f.map((v,i)=>v+right[i]*nx*tan*aspect+up[i]*ny*tan)),origin=camera.eye;let best=null,distance=Infinity;for(const o of scene.objects){if(!o.m14Action||!o.visible)continue;const hit=rayAabb(origin,dir,o);if(hit!==null&&hit<distance){best=o;distance=hit;}}if(!best)return;event.preventDefault();switch(best.m14Action){case'ESTOP':emergencyStop();break;case'ROAD':if(!state.emergencyStopped)setRoadEnabled(!state.rollingRoadEnabled);break;case'WIND_DOWN':setWindSpeed(state.windSpeed-.5,'3d');break;case'WIND_UP':setWindSpeed(state.windSpeed+.5,'3d');break;}}
 function normalize3(v){const n=Math.hypot(v[0],v[1],v[2])||1;return v.map(x=>x/n)}
 let press=null;glCanvas.addEventListener('pointerdown',e=>{press={id:e.pointerId,x:e.clientX,y:e.clientY};},true);glCanvas.addEventListener('pointerup',e=>{const p=press;press=null;if(p&&p.id===e.pointerId&&Math.hypot(e.clientX-p.x,e.clientY-p.y)<5)pick3DControl(e);},true);glCanvas.addEventListener('pointercancel',()=>{press=null},true);

 function socketAction(id){switch(id){
  case'EMERGENCY_STOP':return emergencyStop();
  case'FAN_ENABLE':{if(rejectWhileStopped('FAN_ENABLE'))return false;const f=AETHER.FAN_MODULE;if(f?.loaded)f.setVisualRunning(!f.visualRunning);render();return true}
  case'SMOKE_ENABLE':{smokeState.enabled=!smokeState.enabled;const e=document.getElementById('smokeEnabled');if(e)e.checked=smokeState.enabled;smokeControlStatus();render();return true}
  case'FAN_SPEED':{if(rejectWhileStopped('FAN_SPEED'))return false;const f=AETHER.FAN_MODULE;if(!f?.loaded)return false;f.visualRPM=Math.max(6,Math.min(36,f.visualRPM+6));f.setVisualRunning(true);render();return true}
  case'VIEW_MODE':{const e=document.getElementById('scientificMode');if(!e)return false;e.selectedIndex=(e.selectedIndex+1)%e.options.length;e.dispatchEvent(new Event('change',{bubbles:true}));return true}
  case'CAMERA_SELECT':{const names=['Hero','Side','Top','Fan','Control','Outlet'],i=names.indexOf(camera.preset);setPreset(names[(i+1)%names.length]);return true}
  case'SOLVER_RUN':{if(rejectWhileStopped('SOLVER_RUN'))return false;const s=safeSolverSnapshot();if(productSolverReady(s)&&typeof AETHER.SOLVER.start==='function'){AETHER.SOLVER.start();return true}el.command.textContent='제품 solver가 연결되지 않아 실행 요청을 거부했습니다. OFFICE CPU 진단은 별도 제어입니다.';return false}
  case'CFD_RESET':{if(rejectWhileStopped('CFD_RESET'))return false;const s=safeSolverSnapshot();if(productSolverReady(s)&&typeof AETHER.SOLVER.reset==='function')AETHER.SOLVER.reset();else AETHER.S3_OFFICE?.reset?.();smokeState.resetRequested=true;el.command.textContent=s?.productionBound?'연결된 solver 초기화 요청 전송':'제품 solver 미연결 · OFFICE 진단만 초기화';render();return true}
  default:return false;
 }}
 function pickM6Socket(event){if(camera.preset!=='Control'||!AETHER.M6?.sockets?.length)return;const rect=glCanvas.getBoundingClientRect(),f=normalize3(camera.target.map((v,i)=>v-camera.eye[i])),u=normalize3(camera.up),right=normalize3([f[1]*u[2]-f[2]*u[1],f[2]*u[0]-f[0]*u[2],f[0]*u[1]-f[1]*u[0]]),up=[right[1]*f[2]-right[2]*f[1],right[2]*f[0]-right[0]*f[2],right[0]*f[1]-right[1]*f[0]],nx=(event.clientX-rect.left)/rect.width*2-1,ny=1-(event.clientY-rect.top)/rect.height*2,tan=Math.tan(camera.fov*Math.PI/360),aspect=rect.width/rect.height,dir=normalize3(f.map((v,i)=>v+right[i]*nx*tan*aspect+up[i]*ny*tan)),origin=camera.eye;let hit=null,best=Infinity;for(const socket of AETHER.M6.sockets){const oc=origin.map((v,i)=>v-socket.position[i]),b=oc.reduce((q,v,i)=>q+v*dir[i],0),c=oc.reduce((q,v)=>q+v*v,0)-socket.hitRadiusM*socket.hitRadiusM,disc=b*b-c;if(disc<0)continue;let t=-b-Math.sqrt(disc);if(t<0)t=-b+Math.sqrt(disc);if(t>=0&&t<best){best=t;hit=socket}}if(hit){event.preventDefault();socketAction(hit.id);}}
 let socketPress=null;glCanvas.addEventListener('pointerdown',e=>{socketPress={id:e.pointerId,x:e.clientX,y:e.clientY}},true);glCanvas.addEventListener('pointerup',e=>{const p=socketPress;socketPress=null;if(p&&p.id===e.pointerId&&Math.hypot(e.clientX-p.x,e.clientY-p.y)<5)pickM6Socket(e)},true);glCanvas.addEventListener('pointercancel',()=>{socketPress=null},true);if(AETHER.M6)AETHER.M6.interactionReady=true;

 const checks=()=>{const s=getSnapshot(),controlLayerPass=s.control.windSpeed>=0&&s.control.windSpeed<=5&&s.rollingRoad.emergencyStopped===s.control.emergencyStopped&&(!s.rollingRoad.emergencyStopped||!s.rollingRoad.motorEnabled),fullPass=controlLayerPass&&s.solver.productionBound&&s.solver.boundaryControlReady&&s.rollingRoad.liveSolverConnected&&s.diagnostic.historyCount>0;return Object.freeze({controlLayerPass,fullMilestonePass:fullPass,estopLatched:s.control.emergencyStopped,rollingRoadInterlocked:s.rollingRoad.emergencyStopped&&!s.rollingRoad.motorEnabled,windSetpointInRange:s.control.windSpeed>=0&&s.control.windSpeed<=5,productSolverTruthful:!s.solver.productionBound||s.solver.boundaryControlReady,liveDataDiagnosticOnly:s.diagnostic.historyCount===0||(s.diagnostic.resolution[0]===32||s.diagnostic.resolution[0]===64),pass:fullPass});};
 AETHER.M14=Object.freeze({getSnapshot,checks,setWindSpeed,setRollingRoadEnabled:setRoadEnabled,emergencyStop,resetEmergencyStop});
 render();setInterval(()=>{if(!document.hidden)render()},500);
})();

Promise.resolve().then(()=>AETHER.SOLVER.initialize()).catch(e=>{diagnostics.error('S0 initialize',e)});
boot();
})();
