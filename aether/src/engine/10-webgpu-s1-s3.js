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
window.__AETHER_S2_PROXY=S2_CFD_PROXY_ASSET;
/* S2 mesh audits (were referenced but missing in the source build). Vertices are welded by position (1e-6 m). */
function s2WeldedTriangles(part){const P=part.positions,I=part.indices,key=new Map(),id=new Int32Array(P.length/3);
 for(let v=0;v<id.length;v++){const k=Math.round(P[v*3]*1e6)+','+Math.round(P[v*3+1]*1e6)+','+Math.round(P[v*3+2]*1e6);let q=key.get(k);if(q===undefined){q=key.size;key.set(k,q)}id[v]=q}
 const T=new Int32Array(I.length);for(let i=0;i<I.length;i++)T[i]=id[I[i]];return {T,vertices:key.size}}
function S2_TOPOLOGY(parts){return {parts:parts.map(part=>{const {T,vertices}=s2WeldedTriangles(part),E=new Map();let degenerate=0;
  for(let t=0;t<T.length;t+=3){const a=T[t],b=T[t+1],c=T[t+2];if(a===b||b===c||a===c){degenerate++;continue}for(const [u,v] of [[a,b],[b,c],[c,a]]){const k=u<v?u+'_'+v:v+'_'+u,e=E.get(k)||{n:0,fwd:0};e.n++;if(u<v)e.fwd++;E.set(k,e)}}
  let boundaryEdges=0,nonManifoldEdges=0,orientationErrors=0;for(const e of E.values()){if(e.n===1)boundaryEdges++;else if(e.n>2)nonManifoldEdges++;else if(e.fwd!==1)orientationErrors++}
  return {name:part.name,triangles:T.length/3,vertices,edges:E.size,degenerate,boundaryEdges,nonManifoldEdges,orientationErrors,closed:boundaryEdges===0&&nonManifoldEdges===0}})}}
function S2_BOUNDARY_COMPONENTS(parts){return parts.map(part=>{const {T}=s2WeldedTriangles(part),n=T.length/3,par=new Int32Array(n).map((_,i)=>i),find=x=>{while(par[x]!==x){par[x]=par[par[x]];x=par[x]}return x},E=new Map();
  for(let t=0;t<n;t++)for(let j=0;j<3;j++){const u=T[t*3+j],v=T[t*3+(j+1)%3],k=u<v?u+'_'+v:v+'_'+u,o=E.get(k);if(o===undefined)E.set(k,t);else{const a=find(o),b=find(t);if(a!==b)par[a]=b}}
  const roots=new Set();for(let t=0;t<n;t++)roots.add(find(t));return {name:part.name,components:roots.size,triangles:n}})}
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
