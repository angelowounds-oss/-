/* ===== M7: lattice Boltzmann D3Q19 (TRT or regularized-BGK collision, pull streaming) — comparison candidate for HIGH/ULTRA.
   Storage modes: FP32 (RGBA32F), FP16 (RGBA16F, f stored directly), MIXED (RGBA16F, stores f - w_i, arithmetic in FP32).
   Boundaries: equilibrium inlet (x-), zero-gradient outlet (x+), specular slip walls (y), periodic z, halfway bounce-back on solids.
   Forces by momentum exchange. Used only by the validation harness; the real-time path stays on the MAC projection solver. ===== */
const LBM={ok:false,err:null,mode:'FP32',t:null,N:null};
window.__LBM=LBM;
const LBM_FS=`#version 300 es
precision highp float;precision highp int;precision highp sampler2D;
uniform ivec3 uN;uniform int uTX;uniform sampler2D uF0,uF1,uF2,uF3,uF4,uSolid;uniform float uUl,uTauP,uTauM,uShift,uCs,uReg;
layout(location=0) out vec4 o0;layout(location=1) out vec4 o1;layout(location=2) out vec4 o2;layout(location=3) out vec4 o3;layout(location=4) out vec4 o4;
const ivec3 E[19]=ivec3[19](ivec3(0),ivec3(1,0,0),ivec3(-1,0,0),ivec3(0,1,0),ivec3(0,-1,0),ivec3(0,0,1),ivec3(0,0,-1),ivec3(1,1,0),ivec3(-1,-1,0),ivec3(1,-1,0),ivec3(-1,1,0),
 ivec3(1,0,1),ivec3(-1,0,-1),ivec3(1,0,-1),ivec3(-1,0,1),ivec3(0,1,1),ivec3(0,-1,-1),ivec3(0,1,-1),ivec3(0,-1,1));
const int OPP[19]=int[19](0,2,1,4,3,6,5,8,7,10,9,12,11,14,13,16,15,18,17);
const int MY[19]=int[19](0,1,2,4,3,5,6,9,10,7,8,11,12,13,14,18,17,16,15);
const float W[19]=float[19](1./3.,1./18.,1./18.,1./18.,1./18.,1./18.,1./18.,1./36.,1./36.,1./36.,1./36.,1./36.,1./36.,1./36.,1./36.,1./36.,1./36.,1./36.,1./36.);
ivec2 A(ivec3 c){return ivec2((c.z%uTX)*uN.x+c.x,(c.z/uTX)*uN.y+c.y);}
ivec3 C(){ivec2 f=ivec2(gl_FragCoord.xy);int tx=f.x/uN.x,ty=f.y/uN.y;return ivec3(f.x-tx*uN.x,f.y-ty*uN.y,ty*uTX+tx);}
float FI(int i,ivec3 c){ivec2 a=A(c);int t=i>>2,ch=i&3;vec4 v=t==0?texelFetch(uF0,a,0):t==1?texelFetch(uF1,a,0):t==2?texelFetch(uF2,a,0):t==3?texelFetch(uF3,a,0):texelFetch(uF4,a,0);return v[ch]+uShift*W[i];}
bool SOL(ivec3 c){return texelFetch(uSolid,A(c),0).r>.5;}
float feq(int i,float r,vec3 u){float eu=dot(vec3(E[i]),u);return W[i]*r*(1.+3.*eu+4.5*eu*eu-1.5*dot(u,u));}
void MOM(ivec3 c,out float r,out vec3 u){r=0.;vec3 m=vec3(0.);for(int i=0;i<19;i++){float f=FI(i,c);r+=f;m+=f*vec3(E[i]);}u=m/r;}
void main(){ivec3 c=C();float f[19];if(c.z>=uN.z){o0=o1=o2=o3=o4=vec4(0);return;}
 if(SOL(c)){for(int i=0;i<19;i++)f[i]=W[i];}
 else{for(int i=0;i<19;i++){ivec3 s=c-E[i];s.z=(s.z+uN.z)%uN.z;
   /* inlet: velocity U, density extrapolated from the first interior cell; outlet: density 1, velocity extrapolated (pressure outlet) */
   if(s.x<0){float rn;vec3 un;MOM(ivec3(0,c.y,c.z),rn,un);f[i]=feq(i,rn,vec3(uUl,0.,0.));continue;}
   if(s.x>=uN.x){float rn;vec3 un;MOM(ivec3(uN.x-1,c.y,c.z),rn,un);f[i]=feq(i,1.,un);continue;}
   if(s.y<0||s.y>=uN.y){f[i]=FI(MY[i],ivec3(s.x,c.y,s.z));continue;}
   f[i]=SOL(s)?FI(OPP[i],c):FI(i,s);}
  float r=0.;vec3 m=vec3(0.);for(int i=0;i<19;i++){r+=f[i];m+=f[i]*vec3(E[i]);}vec3 u=m/r;
  float g[19];for(int i=0;i<19;i++)g[i]=f[i];
  /* Smagorinsky LES in LBM: eddy relaxation from the non-equilibrium momentum flux (Hou et al. 1996); TRT magic parameter 1/4 kept */
  /* sponges: outlet (vortex street leaves) and inlet (the velocity inlet reflects acoustic waves; uniform inflow has no gradients to damp) */
  float tp=uTauP,tm=uTauM;float xr=float(c.x)/float(uN.x),sp=smoothstep(.85,1.,xr)+1.-smoothstep(0.,.1,xr);tp+=sp*.6;tm=.25/(tp-.5)+.5;
  mat3 Q=mat3(0.);if(uCs>0.||uReg>.5){for(int i=0;i<19;i++){vec3 e=vec3(E[i]);Q+=outerProduct(e,e)*(g[i]-feq(i,r,u));}}
  if(uCs>0.){float q=sqrt(dot(Q[0],Q[0])+dot(Q[1],Q[1])+dot(Q[2],Q[2]));float t0=tp;tp=.5*(t0+sqrt(t0*t0+18.*1.41421356*uCs*uCs*q/r));tm=.25/(tp-.5)+.5;}
  /* regularized BGK (Latt & Chopard 2006): keep only the 2nd-order Hermite part of f_neq, f = feq + (1-1/tau) w_i/(2cs^4) Q_i:Pi_neq */
  if(uReg>.5){float tr=Q[0][0]+Q[1][1]+Q[2][2];for(int i=0;i<19;i++){vec3 e=vec3(E[i]);f[i]=feq(i,r,u)+(1.-1./tp)*W[i]*4.5*(dot(e,Q*e)-tr/3.);}}
  else for(int i=0;i<19;i++){int j=OPP[i];float fp=.5*(g[i]+g[j]),fm=.5*(g[i]-g[j]),ei=feq(i,r,u),ej=feq(j,r,u),ep=.5*(ei+ej),em=.5*(ei-ej);f[i]=g[i]-(fp-ep)/tp-(fm-em)/tm;}}
 for(int i=0;i<19;i++)f[i]-=uShift*W[i];
 o0=vec4(f[0],f[1],f[2],f[3]);o1=vec4(f[4],f[5],f[6],f[7]);o2=vec4(f[8],f[9],f[10],f[11]);o3=vec4(f[12],f[13],f[14],f[15]);o4=vec4(f[16],f[17],f[18],0.);}`;
const LBM_FORCE=`#version 300 es
precision highp float;precision highp int;precision highp sampler2D;
uniform ivec3 uN;uniform int uTX;uniform sampler2D uF0,uF1,uF2,uF3,uF4,uSolid;uniform float uShift;out vec4 o;
const ivec3 E[19]=ivec3[19](ivec3(0),ivec3(1,0,0),ivec3(-1,0,0),ivec3(0,1,0),ivec3(0,-1,0),ivec3(0,0,1),ivec3(0,0,-1),ivec3(1,1,0),ivec3(-1,-1,0),ivec3(1,-1,0),ivec3(-1,1,0),
 ivec3(1,0,1),ivec3(-1,0,-1),ivec3(1,0,-1),ivec3(-1,0,1),ivec3(0,1,1),ivec3(0,-1,-1),ivec3(0,1,-1),ivec3(0,-1,1));
const float W[19]=float[19](1./3.,1./18.,1./18.,1./18.,1./18.,1./18.,1./18.,1./36.,1./36.,1./36.,1./36.,1./36.,1./36.,1./36.,1./36.,1./36.,1./36.,1./36.,1./36.);
ivec2 A(ivec3 c){return ivec2((c.z%uTX)*uN.x+c.x,(c.z/uTX)*uN.y+c.y);}
ivec3 C(){ivec2 f=ivec2(gl_FragCoord.xy);int tx=f.x/uN.x,ty=f.y/uN.y;return ivec3(f.x-tx*uN.x,f.y-ty*uN.y,ty*uTX+tx);}
float FI(int i,ivec3 c){ivec2 a=A(c);int t=i>>2,ch=i&3;vec4 v=t==0?texelFetch(uF0,a,0):t==1?texelFetch(uF1,a,0):t==2?texelFetch(uF2,a,0):t==3?texelFetch(uF3,a,0):texelFetch(uF4,a,0);return v[ch]+uShift*W[i];}
void main(){ivec3 c=C();o=vec4(0.);if(c.z>=uN.z||texelFetch(uSolid,A(c),0).r>.5)return;vec3 F=vec3(0.);
 for(int i=1;i<19;i++){ivec3 n=c+E[i];n.z=(n.z+uN.z)%uN.z;if(n.x<0||n.x>=uN.x||n.y<0||n.y>=uN.y)continue;if(texelFetch(uSolid,A(n),0).r>.5)F+=2.*vec3(E[i])*FI(i,c);}
 o=vec4(F,0.);}`;
const LBM_INIT=`#version 300 es
precision highp float;uniform float uUl,uShift;layout(location=0) out vec4 o0;layout(location=1) out vec4 o1;layout(location=2) out vec4 o2;layout(location=3) out vec4 o3;layout(location=4) out vec4 o4;
const vec3 E[19]=vec3[19](vec3(0),vec3(1,0,0),vec3(-1,0,0),vec3(0,1,0),vec3(0,-1,0),vec3(0,0,1),vec3(0,0,-1),vec3(1,1,0),vec3(-1,-1,0),vec3(1,-1,0),vec3(-1,1,0),vec3(1,0,1),vec3(-1,0,-1),vec3(1,0,-1),vec3(-1,0,1),vec3(0,1,1),vec3(0,-1,-1),vec3(0,1,-1),vec3(0,-1,1));
const float W[19]=float[19](1./3.,1./18.,1./18.,1./18.,1./18.,1./18.,1./18.,1./36.,1./36.,1./36.,1./36.,1./36.,1./36.,1./36.,1./36.,1./36.,1./36.,1./36.,1./36.);
void main(){float f[19];vec3 u=vec3(uUl,0.,0.);for(int i=0;i<19;i++){float eu=dot(E[i],u);f[i]=W[i]*(1.+3.*eu+4.5*eu*eu-1.5*dot(u,u))-uShift*W[i];}
 o0=vec4(f[0],f[1],f[2],f[3]);o1=vec4(f[4],f[5],f[6],f[7]);o2=vec4(f[8],f[9],f[10],f[11]);o3=vec4(f[12],f[13],f[14],f[15]);o4=vec4(f[16],f[17],f[18],0.);}`;
/* cfg: {N:[nx,ny,nz], Dl (cells per diameter), c:[i,j] cylinder centre in cells, Re, Ul, mode} */
function lbmSetup(cfg){LBM.ok=false;try{if(gl.getParameter(gl.MAX_DRAW_BUFFERS)<5)throw Error('MAX_DRAW_BUFFERS < 5');
  lbmRelease();const N=cfg.N,g=macAtlas(N),f16=cfg.mode!=='FP32',fmt=f16?[gl.RGBA16F,gl.RGBA,gl.HALF_FLOAT]:[gl.RGBA32F,gl.RGBA,gl.FLOAT];
  const mk=()=>{const tex=[0,1,2,3,4].map(()=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,fmt[0],g.W,g.H,0,fmt[1],fmt[2],null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);return t});
   const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);tex.forEach((t,i)=>gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+i,gl.TEXTURE_2D,t,0));gl.drawBuffers([0,1,2,3,4].map(i=>gl.COLOR_ATTACHMENT0+i));
   if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('LBM fbo incomplete');return {tex,f}};
  LBM.t=[mk(),mk()];LBM.cur=0;LBM.g=g;LBM.N=N;LBM.cfg=cfg;LBM.mode=cfg.mode;LBM.shift=cfg.mode==='MIXED'?1:0;
  const nu=cfg.Ul*cfg.Dl/cfg.Re,tp=3*nu+.5,tm=.25/(tp-.5)+.5;LBM.tauP=tp;LBM.tauM=tm;LBM.nu=nu;
  const buf=new Uint8Array(g.W*g.H*4);let solid=0;for(let k=0;k<N[2];k++)for(let j=0;j<N[1];j++)for(let i=0;i<N[0];i++){const dx=i+.5-cfg.c[0],dy=j+.5-cfg.c[1];if(dx*dx+dy*dy<=cfg.Dl*cfg.Dl/4){const ax=(k%g.tx)*N[0]+i,ay=Math.floor(k/g.tx)*N[1]+j;buf[(ay*g.W+ax)*4]=255;solid++}}
  LBM.solid=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,LBM.solid);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,g.W,g.H,0,gl.RGBA,gl.UNSIGNED_BYTE,buf);
  if(!LBM.prog){LBM.prog={step:liveCompile(LBM_FS),force:liveCompile(LBM_FORCE),init:liveCompile(LBM_INIT)}}
  LBM.frc=liveTarget(g.W,g.H,gl.RGBA32F,gl.RGBA,gl.FLOAT);LBM.red=[];{let w=g.W,h=g.H;while(w>1||h>1){w=Math.ceil(w/8);h=Math.ceil(h/8);LBM.red.push({w,h,t:liveTarget(w,h,gl.RGBA32F,gl.RGBA,gl.FLOAT)})}}
  gl.bindVertexArray(LIVE.vao);for(const T of LBM.t){gl.useProgram(LBM.prog.init);gl.bindFramebuffer(gl.FRAMEBUFFER,T.f);gl.viewport(0,0,g.W,g.H);gl.uniform1f(liveU(LBM.prog.init,'uUl'),0);gl.uniform1f(liveU(LBM.prog.init,'uShift'),LBM.shift);gl.drawArrays(gl.TRIANGLES,0,3)}
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null);LBM.step=0;LBM.ok=true;LIVE.enabled=false;LIVE.freeze=true;
  return {ok:true,coll:cfg.coll||'TRT',tauP:tp,tauM:tm,nu,solidCells:solid,bytesPerCell:2*5*(f16?8:16),memMB:2*5*g.W*g.H*(f16?8:16)/1048576}}
 catch(e){LBM.err=String(e?.message||e);return {ok:false,err:LBM.err}}}
function lbmRelease(){if(!LBM.t)return;for(const T of LBM.t){T.tex.forEach(t=>gl.deleteTexture(t));gl.deleteFramebuffer(T.f)}if(LBM.solid)gl.deleteTexture(LBM.solid);if(LBM.frc){gl.deleteTexture(LBM.frc.t);gl.deleteFramebuffer(LBM.frc.f)}(LBM.red||[]).forEach(r=>{gl.deleteTexture(r.t.t);gl.deleteFramebuffer(r.t.f)});LBM.t=null}
function lbmBind(p,T){const g=LBM.g;gl.uniform3i(liveU(p,'uN'),...LBM.N);gl.uniform1i(liveU(p,'uTX'),g.tx);gl.uniform1f(liveU(p,'uShift'),LBM.shift);
 T.tex.forEach((t,i)=>{gl.activeTexture(gl.TEXTURE8+i);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(liveU(p,'uF'+i),8+i)});gl.activeTexture(gl.TEXTURE13);gl.bindTexture(gl.TEXTURE_2D,LBM.solid);gl.uniform1i(liveU(p,'uSolid'),13)}
function lbmStep(n){const g=LBM.g,p=LBM.prog.step;gl.bindVertexArray(LIVE.vao);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.useProgram(p);gl.viewport(0,0,g.W,g.H);
 gl.uniform1f(liveU(p,'uUl'),LBM.cfg.Ul);gl.uniform1f(liveU(p,'uTauP'),LBM.tauP);gl.uniform1f(liveU(p,'uTauM'),LBM.tauM);gl.uniform1f(liveU(p,'uCs'),LBM.cfg.Cs||0);gl.uniform1f(liveU(p,'uReg'),LBM.cfg.coll==='REG'?1:0);
 /* impulsive starts launch pressure waves that the velocity inlet reflects: ramp U over t* = 0..10 */
 const ramp=10*LBM.cfg.Dl/LBM.cfg.Ul;
 for(let s=0;s<n;s++){const src=LBM.t[LBM.cur],dst=LBM.t[1-LBM.cur],x=Math.min(1,LBM.step/ramp);gl.uniform1f(liveU(p,'uUl'),LBM.cfg.Ul*x*x*(3-2*x));gl.bindFramebuffer(gl.FRAMEBUFFER,dst.f);lbmBind(p,src);gl.drawArrays(gl.TRIANGLES,0,3);LBM.cur=1-LBM.cur;LBM.step++}
 gl.bindVertexArray(null)}
function lbmForce(){const g=LBM.g,p=LBM.prog.force;gl.bindVertexArray(LIVE.vao);gl.useProgram(p);gl.bindFramebuffer(gl.FRAMEBUFFER,LBM.frc.f);gl.viewport(0,0,g.W,g.H);lbmBind(p,LBM.t[LBM.cur]);gl.drawArrays(gl.TRIANGLES,0,3);
 const s=liveReduceTo(LBM.frc,g.W,g.H,LBM.red),b=new Float32Array(4);gl.bindFramebuffer(gl.FRAMEBUFFER,s.f);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,b);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null);
 const c=LBM.cfg,q=.5*c.Ul*c.Ul*c.Dl*LBM.N[2];return {Fx:b[0],Fy:b[1],Cd:b[0]/q,Cl:b[1]/q,tStar:LBM.step*c.Ul/c.Dl}}
/* run `total` steps recording forces every `every` steps */
function lbmRun(total,every){const rec=[],t0=performance.now();for(let s=0;s<total;s+=every){lbmStep(Math.min(every,total-s));rec.push(lbmForce())}return {rec,ms:performance.now()-t0,steps:LBM.step}}
/* debug: macroscopic values at a cell (reads the 5 attachments of the current state) */
function lbmProbe(i,j,k){const g=LBM.g,N=LBM.N,T=LBM.t[LBM.cur],x=(k%g.tx)*N[0]+i,y=Math.floor(k/g.tx)*N[1]+j,f=[];gl.bindFramebuffer(gl.FRAMEBUFFER,T.f);
 for(let a=0;a<5;a++){gl.readBuffer(gl.COLOR_ATTACHMENT0+a);const b=new Float32Array(4);gl.readPixels(x,y,1,1,gl.RGBA,gl.FLOAT,b);f.push(...b)}gl.readBuffer(gl.COLOR_ATTACHMENT0);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 const E=[[0,0,0],[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1],[1,1,0],[-1,-1,0],[1,-1,0],[-1,1,0],[1,0,1],[-1,0,-1],[1,0,-1],[-1,0,1],[0,1,1],[0,-1,-1],[0,1,-1],[0,-1,1]],W=[1/3,...Array(6).fill(1/18),...Array(12).fill(1/36)];
 let r=0;const m=[0,0,0];for(let q=0;q<19;q++){const v=f[q]+LBM.shift*W[q];r+=v;for(let d=0;d<3;d++)m[d]+=v*E[q][d]}return {rho:r,u:m.map(v=>v/r)}}
