/* CFD V3 P4: optional nested-refinement lattice Boltzmann solver (WebGPU, tools/solver2/gpu/lbm-app.mjs) around the car, switched on with #solver=lbm.
   It runs beside the MAC solver: about ten times a second its velocity is sampled onto the MAC grid (cell centres) and the MAC face velocities are
   blended towards it inside the LBM box (weight ramps to 0 over 3 MAC cells at the box faces), after the projection and before the smoke step, so the
   smoke, streaks, tufts and probes all see the LBM flow near the car and the MAC flow elsewhere. The LBM usually runs slower than real time
   (LBM.api.timeScale = flow seconds per wall second). No WebGPU, an error or a lost device leaves the MAC flow unchanged (LBM.state, LBM.err).
   #lbmh=0.08: finest LBM cell (m) around the car. */
const LBM={want:/solver=lbm/.test(location.hash),state:'off',err:null,api:null,tex:null,pend:false,last:0,hf:Math.max(.02,+((location.hash.match(/lbmh=([\d.]+)/)||[])[1]||.08)),U:0,uploads:0};
window.__LBM=LBM;
function lbmCarBounds(){const mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];for(const part of m12SolidParts()){const M=part.modelMatrix,P=part.positions;for(let i=0;i<P.length;i+=3){const q=m4point(M,[P[i],P[i+1],P[i+2]]);for(let a=0;a<3;a++){mn[a]=Math.min(mn[a],q[a]);mx[a]=Math.max(mx[a],q[a])}}}return {min:mn,max:mx}}
async function lbmStart(){LBM.state='starting';
 try{
  if(!navigator.gpu)throw Error('WebGPU unavailable');
  const ad=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!ad)throw Error('no WebGPU adapter');
  const dev=await ad.requestDevice({requiredLimits:{maxStorageBufferBindingSize:ad.limits.maxStorageBufferBindingSize,maxBufferSize:ad.limits.maxBufferSize}});
  dev.lost.then(i=>{if(LBM.state!=='off'){LBM.state='lost';LBM.err=i.message}});
  const car=lbmCarBounds(),hf=LBM.hf,pad=2*hf,mn=car.min.map(v=>v-pad),M=[0,1,2].map(a=>Math.ceil((car.max[a]-car.min[a]+2*pad)/hf)),mask=liveVoxelizeShell(M,mn,[hf,hf,hf]);
  const solidAt=(x,y,z)=>{const i=Math.floor((x-mn[0])/hf),j=Math.floor((y-mn[1])/hf),k=Math.floor((z-mn[2])/hf);return i>=0&&j>=0&&k>=0&&i<M[0]&&j<M[1]&&k<M[2]&&mask[i+M[0]*(j+M[1]*k)]===1};
  const {createAppLbm}=await import('aether/lbm-app.mjs'),b=CFD_DOMAIN_CONTRACT.bounds;LBM.U=Math.max(LIVE.U,.5);
  LBM.api=await createAppLbm(dev,{car,domain:{min:Array.from(b.min),max:Array.from(b.max)},U:LBM.U,hf,solidAt});
  const G=MAC.G;LBM.tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,LBM.tex);for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,G.W,G.H,0,gl.RGBA,gl.FLOAT,null);LBM.texN=MAC.N.join();LBM.state='running';LBM.ready=false;
 }catch(e){LBM.state='error';LBM.err=String(e&&e.message||e)}}
/* sampled LBM velocity -> MAC atlas texture (cell centres, alpha = weight: 0 outside the LBM box, ramp over 3 cells at its faces except the floor) */
function lbmUpload(a){const G=MAC.G,N=MAC.N,h=MAC.h,mn=MAC.min,B=LBM.api.bounds,buf=new Float32Array(G.W*G.H*4);
 for(let k=0;k<N[2];k++)for(let j=0;j<N[1];j++)for(let i=0;i<N[0];i++){const s=4*(i+N[0]*(j+N[1]*k)),fl=a[s+3];if(!fl)continue;
  const x=mn[0]+(i+.5)*h[0],y=mn[1]+(j+.5)*h[1],z=mn[2]+(k+.5)*h[2],d=Math.min((x-B.min[0])/h[0],(B.max[0]-x)/h[0],(B.max[1]-y)/h[1],(z-B.min[2])/h[2],(B.max[2]-z)/h[2]);
  const w=Math.max(0,Math.min(1,d/3)),px=((k%G.tx)*N[0]+i+G.W*(Math.floor(k/G.tx)*N[1]+j))*4;
  if(fl===1){buf[px]=a[s];buf[px+1]=a[s+1];buf[px+2]=a[s+2]}buf[px+3]=w}
 gl.bindTexture(gl.TEXTURE_2D,LBM.tex);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,G.W,G.H,gl.RGBA,gl.FLOAT,buf);LBM.uploads++;LBM.ready=true}
function lbmBlendPass(T){if(!LBM.want)return;if(LBM.state==='off'){if(MAC.ok)lbmStart();return}
 if(LBM.state!=='running')return;if(LBM.texN!==MAC.N.join()){LBM.ready=false;return} /* the MAC grid changed (quality tier): wait for a restart */
 const A=LBM.api;A.pump();const now=performance.now();
 if(!LBM.pend&&now-LBM.last>100){LBM.pend=true;LBM.last=now;A.sample(MAC.min,MAC.h,MAC.N).then(a=>{LBM.pend=false;if(LBM.state==='running')lbmUpload(a)}).catch(e=>{LBM.pend=false;LBM.state='error';LBM.err=String(e&&e.message||e)})}
 if(LBM.ready){macPass('lbmBlend',T.velB,{uVel:T.velA.t,uLbm:LBM.tex},{});macSwap(T,'velA','velB')}}
