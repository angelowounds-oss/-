/* ===== SURFACE FLOW VISUALISATION: tufts (short threads) and oil-streak hatching on the car body, driven by the solver's own velocity field.
   Roots: Poisson-disk samples on the body mesh (generated once in mesh-local space, moved with the car's model matrix, so yaw / ride height / pitch carry them along).
   Each frame one fragment pass reads the MAC velocity 1.5 cells outside the surface at every root, keeps its component tangent to the surface and smooths it over
   about 0.25 s (direction, normal-component ratio, reversed-flow flag v.x < -0.08 U, speed ratio). Threads are drawn as screen-space ribbons, depth-tested over the composite.
   This shows the OUTER flow's surface-tangent direction: the boundary layer is not resolved (cells 7.5-24 cm), a real tuft's flutter / lift-off is not modelled, and the
   oil style is directional hatching, not a pigment simulation (KNOWN_LIMITATIONS L37). Wheels are left out (rotating bodies). Default off: #tuft=1 or #tuft=oil. ===== */
const TUFT={mode:(location.hash.match(/tuft=(1|oil)/)||[])[1]==='oil'?'oil':(/tuft=1/.test(location.hash)?'tuft':'off'),len:null,W:1024,rowsMax:18,max:9000,
 spacing:{tuft:.075,oil:.045},defLen:{tuft:.07,oil:.14},local:{},n:0,key:'',roots:null,nor:null,count:0,gen:-1,t:null,cur:0,prog:null,err:null,last:0,lastDt:0,
 job:null,pbo:null,pboBytes:0,snap:null,stats:null,lastKick:0,sampleMs:0};
window.__TUFT=TUFT;
MAC_FS.tuft=`uniform sampler2D uVel,uSol,uRoot,uPrev;uniform int uCount;uniform float uOff,uK;
void main(){ivec2 f=ivec2(gl_FragCoord.xy);int b=f.y>>1,k=f.y&1,i=b*1024+f.x;if(i>=uCount){o=vec4(0.);return;}
 vec4 r0=texelFetch(uRoot,ivec2(f.x,2*b),0),r1=texelFetch(uRoot,ivec2(f.x,2*b+1),0),p0=texelFetch(uPrev,ivec2(f.x,2*b),0),p1=texelFetch(uPrev,ivec2(f.x,2*b+1),0);
 vec3 n=normalize(r1.xyz),q=r0.xyz+n*uOff,g=(q-uMin)/uH;
 bool inD=all(greaterThan(g,vec3(1.5)))&&all(lessThan(g,vec3(uN)-1.5));
 float id;float phi=inD?PHIT(uSol,g-.5,uN,uTX,id):1.;vec3 v=inD?VEL(uVel,g,uN,uTX):vec3(0.);
 float valid=(inD&&phi<.5)?1.:0.,ref=max(uU,.1),sp=length(v);vec3 vt=v-n*dot(v,n);float st=length(vt);
 vec3 dn=st>.02*ref?vt/st:(length(p0.xyz)>.5?p0.xyz:vec3(1.,0.,0.));vec3 dOld=length(p0.xyz)>.5?p0.xyz:dn;
 vec3 d=mix(dOld,dn,uK);d-=n*dot(d,n);d=length(d)>1e-4?normalize(d):dn;
 float bend=mix(p0.w,clamp(dot(v,n)/max(sp,.05*ref),-1.,1.),uK),rev=mix(p1.y,v.x<-.08*ref?1.:0.,uK),spd=mix(p1.x,sp/ref,uK);
 o=k==0?vec4(d,bend):vec4(spd,rev,valid,0.);}`;
const TUFT_VS=`#version 300 es
precision highp float;precision highp int;precision highp sampler2D;
uniform sampler2D uRoot,uState;uniform mat4 uVP;uniform vec2 uPx;uniform float uLen,uPW,uLift,uMode;uniform int uCount;
out float vA;out float vV;out vec3 vC;
vec3 TH(vec3 P,vec3 n,vec3 d,float bend,float len,float t){return P+d*(len*t)+n*(bend*len*.55*t*t+len*.10*t*(1.-t));}
void main(){int i=gl_InstanceID,seg=gl_VertexID>>1;float side=float(gl_VertexID&1)*2.-1.;int x=i&1023,b=i>>10;
 vec4 r0=texelFetch(uRoot,ivec2(x,2*b),0),r1=texelFetch(uRoot,ivec2(x,2*b+1),0),s0=texelFetch(uState,ivec2(x,2*b),0),s1=texelFetch(uState,ivec2(x,2*b+1),0);
 if(i>=uCount||s1.z<.5||length(s0.xyz)<.5){gl_Position=vec4(2.,2.,2.,1.);vA=0.;vV=0.;vC=vec3(0.);return;}
 vec3 n=normalize(r1.xyz),P=r0.xyz+n*uLift,d=s0.xyz;float bend=s0.w,len=uLen*clamp(s1.x*2.5,.35,1.),t=float(seg)/5.;
 vec3 p0=TH(P,n,d,bend,len,t),pa=TH(P,n,d,bend,len,max(t-.2,0.)),pb=TH(P,n,d,bend,len,min(t+.2,1.));
 vec4 c0=uVP*vec4(p0,1.),ca=uVP*vec4(pa,1.),cb=uVP*vec4(pb,1.);
 if(c0.w<.05){gl_Position=vec4(2.,2.,2.,1.);vA=0.;vV=0.;vC=vec3(0.);return;}
 vec2 dd=(cb.xy/max(cb.w,.05)-ca.xy/max(ca.w,.05))*uPx;float l=length(dd);dd=l>1e-4?dd/l:vec2(1.,0.);
 vec2 s=c0.xy/c0.w+vec2(-dd.y,dd.x)*uPW/uPx*side;
 float rev=smoothstep(.25,.6,s1.y),lim=smoothstep(.04,.22,s1.x);
 vec3 att=uMode<.5?vec3(1.,.93,.55):vec3(.72,.88,1.),bad=uMode<.5?vec3(1.,.36,.16):vec3(1.,.58,.4);
 vC=mix(att,bad,rev)*1.5;
 float ramp=uMode<.5?(.55+.45*(1.-t)):smoothstep(0.,.15,t)*(1.-smoothstep(.65,1.,t));
 vA=ramp*lim*(uMode<.5?.95:.6);vV=side;gl_Position=vec4(s*c0.w,c0.z,c0.w);}`;
const TUFT_FS=`#version 300 es
precision highp float;in float vA;in float vV;in vec3 vC;out vec4 o;
void main(){float e=1.-abs(vV);float a=vA*smoothstep(0.,.6,e);if(a<.01)discard;o=vec4(vC,a);}`;
const tuftRng=s=>()=>{s=(s+0x6D2B79F5)|0;let t=Math.imul(s^(s>>>15),1|s);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296};
/* Poisson-disk (random sequential adsorption) samples on the body mesh in mesh-local space: area-weighted triangle choice, uniform barycentric point, minimum distance `sp` */
function tuftBuildLocal(sp){const body=scene.vehicleParts.find(p=>p.role==='body');if(!body)return null;const t0=performance.now(),P=body.positions,Nn=body.normals,I=body.indices,T=I.length/3,cum=new Float64Array(T);let tot=0;
 for(let t=0;t<T;t++){const a=I[3*t]*3,b=I[3*t+1]*3,c=I[3*t+2]*3,ux=P[b]-P[a],uy=P[b+1]-P[a+1],uz=P[b+2]-P[a+2],vx=P[c]-P[a],vy=P[c+1]-P[a+1],vz=P[c+2]-P[a+2];tot+=.5*Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx);cum[t]=tot}
 const rnd=tuftRng(20251005),grid=new Map(),pos=[],nor=[],inv=1/sp,key=(x,y,z)=>(x+1024)*4194304+(y+1024)*2048+(z+1024),tries=Math.min(450000,Math.ceil(tot/(sp*sp)*70));
 for(let it=0;it<tries&&pos.length<TUFT.max*3;it++){const r=rnd()*tot;let lo=0,hi=T-1;while(lo<hi){const m=(lo+hi)>>1;if(cum[m]<r)lo=m+1;else hi=m}
  const a=I[3*lo]*3,b=I[3*lo+1]*3,c=I[3*lo+2]*3;let s=rnd(),u=rnd();if(s+u>1){s=1-s;u=1-u}const w=1-s-u;
  const x=w*P[a]+s*P[b]+u*P[c],y=w*P[a+1]+s*P[b+1]+u*P[c+1],z=w*P[a+2]+s*P[b+2]+u*P[c+2],ix=Math.floor(x*inv),iy=Math.floor(y*inv),iz=Math.floor(z*inv);let ok=true;
  for(let dx=-1;dx<2&&ok;dx++)for(let dy=-1;dy<2&&ok;dy++)for(let dz=-1;dz<2&&ok;dz++){const L=grid.get(key(ix+dx,iy+dy,iz+dz));if(L)for(const q of L){const ex=pos[q*3]-x,ey=pos[q*3+1]-y,ez=pos[q*3+2]-z;if(ex*ex+ey*ey+ez*ez<sp*sp){ok=false;break}}}
  if(!ok)continue;let nx=w*Nn[a]+s*Nn[b]+u*Nn[c],ny=w*Nn[a+1]+s*Nn[b+1]+u*Nn[c+1],nz=w*Nn[a+2]+s*Nn[b+2]+u*Nn[c+2],nl=Math.hypot(nx,ny,nz);
  if(nl<1e-6){const ux2=P[b]-P[a],uy2=P[b+1]-P[a+1],uz2=P[b+2]-P[a+2],vx=P[c]-P[a],vy=P[c+1]-P[a+1],vz=P[c+2]-P[a+2];nx=uy2*vz-uz2*vy;ny=uz2*vx-ux2*vz;nz=ux2*vy-uy2*vx;nl=Math.hypot(nx,ny,nz)||1}
  const id=pos.length/3;pos.push(x,y,z);nor.push(nx/nl,ny/nl,nz/nl);const k=key(ix,iy,iz);(grid.get(k)||grid.set(k,[]).get(k)).push(id)}
 TUFT.sampleMs=performance.now()-t0;return {pos:new Float32Array(pos),nor:new Float32Array(nor),n:pos.length/3,area:tot,spacing:sp}}
/* world-space roots for the current car model (yaw, ride height and pitch included) -> static root texture */
function tuftUploadRoots(L,M){const n=L.n,rows=2*Math.ceil(n/TUFT.W),data=new Float32Array(TUFT.W*TUFT.rowsMax*4),wp=new Float32Array(n*3),wn=new Float32Array(n*3);
 for(let i=0;i<n;i++){const x=L.pos[i*3],y=L.pos[i*3+1],z=L.pos[i*3+2],px=M[0]*x+M[4]*y+M[8]*z+M[12],py=M[1]*x+M[5]*y+M[9]*z+M[13],pz=M[2]*x+M[6]*y+M[10]*z+M[14],q=normalMatrix(M,[L.nor[i*3],L.nor[i*3+1],L.nor[i*3+2]]);
  wp.set([px,py,pz],i*3);wn.set(q,i*3);const col=i%TUFT.W,blk=Math.floor(i/TUFT.W);data.set([px,py,pz,1],((2*blk)*TUFT.W+col)*4);data.set([q[0],q[1],q[2],0],((2*blk+1)*TUFT.W+col)*4)}
 gl.bindTexture(gl.TEXTURE_2D,TUFT.rootT.t);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,TUFT.W,TUFT.rowsMax,gl.RGBA,gl.FLOAT,data);gl.bindTexture(gl.TEXTURE_2D,null);
 TUFT.roots=wp;TUFT.nor=wn;TUFT.count=n;TUFT.rows=rows}
function tuftInit(){if(TUFT.gen===runtimeGeneration&&TUFT.t)return true;if(!MAC.prog?.tuft||!MAC.t||LIVE.impl!=='MAC')return false;
 const mk=()=>liveTarget(TUFT.W,TUFT.rowsMax,gl.RGBA32F,gl.RGBA,gl.FLOAT);TUFT.rootT=mk();TUFT.t=[mk(),mk()];TUFT.cur=0;TUFT.prog=liveCompile(TUFT_FS,TUFT_VS);TUFT.gen=runtimeGeneration;TUFT.key='';TUFT.job=null;TUFT.pbo=null;TUFT.pboBytes=0;TUFT.local={};
 for(const t of TUFT.t){gl.bindFramebuffer(gl.FRAMEBUFFER,t.f);gl.clearBufferfv(gl.COLOR,0,[0,0,0,0])}gl.bindFramebuffer(gl.FRAMEBUFFER,null);return true}
TUFT.setMode=m=>{m=m==='oil'?'oil':m==='tuft'||m==='1'||m===true?'tuft':'off';if(m===TUFT.mode)return m;TUFT.mode=m;TUFT.key='';TUFT.stats=null;TUFT.snap=null;if(TUFT.t)for(const t of TUFT.t){gl.bindFramebuffer(gl.FRAMEBUFFER,t.f);gl.clearBufferfv(gl.COLOR,0,[0,0,0,0])}gl.bindFramebuffer(gl.FRAMEBUFFER,null);return m};
TUFT.length=()=>TUFT.len??TUFT.defLen[TUFT.mode==='oil'?'oil':'tuft'];
function tuftReadKick(){const bytes=TUFT.W*TUFT.rows*16;if(!TUFT.pbo)TUFT.pbo=gl.createBuffer();gl.bindBuffer(gl.PIXEL_PACK_BUFFER,TUFT.pbo);if(TUFT.pboBytes<bytes){gl.bufferData(gl.PIXEL_PACK_BUFFER,bytes,gl.STREAM_READ);TUFT.pboBytes=bytes}
 gl.bindFramebuffer(gl.FRAMEBUFFER,TUFT.t[TUFT.cur].f);gl.readPixels(0,0,TUFT.W,TUFT.rows,gl.RGBA,gl.FLOAT,0);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 TUFT.job={fence:gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0),rows:TUFT.rows,n:TUFT.count,gen:LIVE.gen,t:LIVE.t,mode:TUFT.mode};gl.flush()}
/* zones by outward normal (the car's nose points to -X): front, roof, side, rear, underside; reversed = smoothed outer flow with a component against the free stream (v.x < -0.08 U; on rear-facing faces the tangential part has almost no x component, so the full velocity is used) */
function tuftPoll(){const J=TUFT.job;if(!J)return;const r=gl.clientWaitSync(J.fence,0,0);if(r===gl.TIMEOUT_EXPIRED)return;gl.deleteSync(J.fence);TUFT.job=null;if(r===gl.WAIT_FAILED||J.mode!==TUFT.mode||J.n!==TUFT.count)return;
 const buf=new Float32Array(TUFT.W*J.rows*4);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,TUFT.pbo);gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,0,buf);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
 const Z={front:[0,0,0],roof:[0,0,0],side:[0,0,0],rear:[0,0,0],under:[0,0,0],all:[0,0,0]},N=TUFT.nor,dir=new Float32Array(J.n*3),rev=new Float32Array(J.n),spd=new Float32Array(J.n),valid=new Uint8Array(J.n);
 for(let i=0;i<J.n;i++){const col=i%TUFT.W,blk=Math.floor(i/TUFT.W),a=((2*blk)*TUFT.W+col)*4,b=((2*blk+1)*TUFT.W+col)*4;dir[i*3]=buf[a];dir[i*3+1]=buf[a+1];dir[i*3+2]=buf[a+2];spd[i]=buf[b];rev[i]=buf[b+1];valid[i]=buf[b+2]>.5?1:0;if(!valid[i])continue;
  const nx=N[i*3],ny=N[i*3+1],nz=N[i*3+2],zs=['all'];if(nx<-.7)zs.push('front');if(ny>.7)zs.push('roof');if(Math.abs(nz)>.7)zs.push('side');if(nx>.7)zs.push('rear');if(ny<-.5)zs.push('under');
  for(const z of zs){const q=Z[z];q[0]++;if(rev[i]>.5)q[1]++;if(buf[a]>0)q[2]++}}
 const out={};for(const k in Z){const q=Z[k];out[k]={n:q[0],reversed:q[0]?q[1]/q[0]:null,downstream:q[0]?q[2]/q[0]:null}}
 TUFT.snap={dir,rev,spd,valid,n:J.n};TUFT.stats={t:J.t,mode:J.mode,count:J.n,valid:out.all.n,zones:out,spacing:TUFT.local[TUFT.mode==='oil'?'oil':'tuft']?.spacing}}
/* once per frame (render loop): (re)build roots when the car model or the mode changed, advance the state pass, read statistics every 500 ms */
function tuftStep(now){if(TUFT.mode==='off'||!LIVE.ok||LIVE.impl!=='MAC'||!MAC.t)return;
 try{if(!tuftInit())return;const m=TUFT.mode==='oil'?'oil':'tuft',M=vehicleModel(),key=m+'|'+Array.from(M,v=>v.toFixed(5)).join(',');
  if(key!==TUFT.key){if(!TUFT.local[m]){const L=tuftBuildLocal(TUFT.spacing[m]);if(!L){TUFT.err='no body mesh';TUFT.mode='off';return}TUFT.local[m]=L}tuftUploadRoots(TUFT.local[m],M);TUFT.key=key;TUFT.stats=null}
  const dt=Math.min(.2,Math.max(.001,TUFT.last?(now-TUFT.last)/1000:.016));TUFT.last=now;TUFT.lastDt=dt;const K=1-Math.exp(-dt/.25),G=MAC.G,prev=TUFT.t[TUFT.cur],next=TUFT.t[1-TUFT.cur];
  gl.bindVertexArray(LIVE.vao);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
  macPass('tuft',{f:next.f,t:next.t,w:TUFT.W,h:TUFT.rows},{uVel:MAC.t.velA.t,uSol:MAC.t.sol.t,uRoot:TUFT.rootT.t,uPrev:prev.t},{uCount:{int:TUFT.count},uOff:1.5*Math.min(...MAC.h),uK:K},G,G);
  TUFT.cur=1-TUFT.cur;tuftPoll();if(!TUFT.job&&now-TUFT.lastKick>500){TUFT.lastKick=now;tuftReadKick()}TUFT.err=null}
 catch(e){TUFT.err=String(e?.message||e);TUFT.mode='off'}
 finally{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null);gl.enable(gl.DEPTH_TEST)}}
function tuftDraw(vp,rw,rh){if(TUFT.mode==='off'||!TUFT.t||!TUFT.count||TUFT.err||!LIVE.ok||LIVE.impl!=='MAC'||!TUFT.key)return;const p=TUFT.prog,oil=TUFT.mode==='oil';
 gl.useProgram(p);gl.bindVertexArray(null);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(false);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
 gl.activeTexture(gl.TEXTURE8);gl.bindTexture(gl.TEXTURE_2D,TUFT.rootT.t);gl.uniform1i(liveU(p,'uRoot'),8);gl.activeTexture(gl.TEXTURE9);gl.bindTexture(gl.TEXTURE_2D,TUFT.t[TUFT.cur].t);gl.uniform1i(liveU(p,'uState'),9);
 gl.uniformMatrix4fv(liveU(p,'uVP'),false,vp);gl.uniform2f(liveU(p,'uPx'),rw,rh);gl.uniform1f(liveU(p,'uLen'),TUFT.length());gl.uniform1f(liveU(p,'uPW'),Math.max(oil?.9:1.6,rw/(oil?1300:760)));
 gl.uniform1f(liveU(p,'uLift'),.012);gl.uniform1f(liveU(p,'uMode'),oil?1:0);gl.uniform1i(liveU(p,'uCount'),TUFT.count);
 gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,12,TUFT.count);
 gl.disable(gl.BLEND);gl.depthMask(true);gl.bindTexture(gl.TEXTURE_2D,null);gl.activeTexture(gl.TEXTURE8);gl.bindTexture(gl.TEXTURE_2D,null);gl.activeTexture(gl.TEXTURE0)}
