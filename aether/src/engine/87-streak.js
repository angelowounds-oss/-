/* ===== STREAKLINES: massless particles released at the rake nozzles and advected by the solver's own MAC velocity field (RK2),
   drawn as thin screen-space ribbons, depth-tested over the composite. One particle per nozzle per frame; a ring of L particles per
   nozzle is the streakline. Display of the same computed flow as the volume smoke, not a second flow model. */
const STREAK={mode:(location.hash.match(/smoke=(vol|streak|both)/)||[])[1]||'both',L:192,NE:40,head:0,cur:0,key:'',gen:-1,t:null,prog:null,err:null,rows:0,width:1.9,gain:1,hot:+((location.hash.match(/shot=([\d.]+)/)||[])[1]??3.6),col:!/scol=0/.test(location.hash)};
MAC_FS.pstep=`uniform sampler2D uVel,uPrev,uSol;uniform int uHead,uEmN;uniform float uDt;uniform vec4 uEm[40];
void main(){ivec2 t=ivec2(gl_FragCoord.xy);if(t.y>=uEmN){o=vec4(0);return;}
 if(t.x==uHead){o=vec4(uEm[t.y].xyz,1.);return;}
 vec4 p=texelFetch(uPrev,t,0);if(p.w<.5){o=vec4(0);return;}
 vec3 P=(p.xyz-uMin)/uH;vec3 v1=VEL(uVel,P,uN,uTX);vec3 Pm=P+.5*uDt*v1/uH;vec3 v2=VEL(uVel,Pm,uN,uTX);vec3 Pn=P+uDt*v2/uH;
 if(any(lessThan(Pn,vec3(.5)))||any(greaterThan(Pn,vec3(uN)-.5))){o=vec4(0);return;}
 float sid;if(PHIT(uSol,Pn-.5,uN,uTX,sid)>.5){o=vec4(0);return;}
 o=vec4(uMin+Pn*uH,1.+clamp(length(v2)/max(uU,.1)*.5,0.,1.));}`;
window.__STREAK=STREAK;
/* flow-visualisation extras (display of the same solver field, not a second flow model): wake vortex glow (Q criterion). Off with #vortex=0 and on the lowest tier. */
const VIZ={vortex:!/[#&]vortex=0/.test(location.hash),k:1,q0:.55,q1:2.2};
window.__VIZ=VIZ;
/* diagnostics (tests/viz-stats.mjs): statistics of the Q field stored in the volume alpha */
VIZ.stats=()=>{try{const D=MAC.D,N=D.N,f=gl.createFramebuffer(),buf=new Float32Array(N[0]*N[1]*4);gl.bindFramebuffer(gl.FRAMEBUFFER,f);let mx=0,over=0,tot=0,sol=0,sum=0;
 for(let k=0;k<N[2];k+=2){gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,LIVE.vol,0,k);gl.readPixels(0,0,N[0],N[1],gl.RGBA,gl.FLOAT,buf);for(let i=0;i<N[0]*N[1];i++){const a=buf[i*4+3],g=buf[i*4+1];tot++;if(g>.5)sol++;if(a>mx)mx=a;if(a>VIZ.q0)over++;sum+=a}}
 gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.deleteFramebuffer(f);return {N,max:mx,mean:sum/tot,overQ0:over,solidVoxels:sol,voxels:tot,on:vizVortexOn(),q0:VIZ.q0,q1:VIZ.q1}}catch(e){return {err:String(e)}}};
function vizVortexOn(){return VIZ.vortex&&!!PERF.set.bloom&&LIVE.impl==='MAC'}
const STREAK_SUB=4;
const STREAK_VS=`#version 300 es
precision highp float;precision highp int;precision highp sampler2D;
uniform sampler2D uP;uniform int uHead,uL;uniform mat4 uVP;uniform vec2 uPx;uniform float uPW,uMaxSeg;
const int SUB=${STREAK_SUB};
out float vA;out float vV;out float vS;out float vT;
vec4 PT(int a,int row){int col=(uHead-a+uL*4)%uL;return texelFetch(uP,ivec2(col,row),0);}
void main(){int vid=gl_VertexID>>1;float side=float(gl_VertexID&1)*2.-1.;int row=gl_InstanceID;int seg=vid/SUB;float u=float(vid-seg*SUB)/float(SUB);
 vec4 p0=PT(seg,row),p1=PT(seg+1,row);
 if(seg>=uL-1||p0.w<.5||p1.w<.5||distance(p0.xyz,p1.xyz)>uMaxSeg){gl_Position=vec4(2.,2.,2.,1.);vA=0.;vV=0.;vS=0.;vT=0.;return;}
 /* Catmull-Rom through four consecutive history points (A newer than B, D older than C): the coarse one-particle-per-frame samples become smooth curves */
 vec4 pa=PT(max(seg-1,0),row),pd=PT(min(seg+2,uL-1),row);
 vec3 B=p0.xyz,C=p1.xyz,A=(pa.w>.5&&distance(pa.xyz,B)<=uMaxSeg)?pa.xyz:B*2.-C,D=(pd.w>.5&&distance(pd.xyz,C)<=uMaxSeg)?pd.xyz:C*2.-B;
 float u2=u*u,u3=u2*u;
 vec3 P=.5*(2.*B+(C-A)*u+(2.*A-5.*B+4.*C-D)*u2+(3.*B-A-3.*C+D)*u3);
 vec3 T=.5*((C-A)+2.*(2.*A-5.*B+4.*C-D)*u+3.*(3.*B-A-3.*C+D)*u2);
 vec4 c0=uVP*vec4(P,1.);
 if(c0.w<.05){gl_Position=vec4(2.,2.,2.,1.);vA=0.;vV=0.;vS=0.;vT=0.;return;}
 vec4 c1=uVP*vec4(P+normalize(T+vec3(1e-5))*.06,1.);
 vec2 d=(c1.xy/max(c1.w,.05)-c0.xy/c0.w)*uPx;float l=length(d);d=l>1e-4?d/l:vec2(1.,0.);
 float t=(float(seg)+u)/float(uL-1);
 float w=uPW*mix(1.3,.5,smoothstep(0.,.85,t));
 vec2 s0=c0.xy/c0.w+vec2(-d.y,d.x)*w/uPx*side;
 gl_Position=vec4(s0*c0.w,c0.z,c0.w);vV=side;vS=mix(p0.w,p1.w,u)-1.;vT=t;
 vA=smoothstep(0.,.025,t)*(1.-smoothstep(.55,1.,t));}`;
const STREAK_FS=`#version 300 es
precision highp float;
in float vA;in float vV;in float vS;in float vT;uniform float uGain,uCol,uHot;out vec4 o;
vec3 pal(float r){vec3 c=mix(vec3(.12,.16,.85),vec3(.05,.72,1.),smoothstep(.25,.7,r));c=mix(c,vec3(.86,.97,1.),smoothstep(.7,1.,r));
 c=mix(c,vec3(1.,.66,.1),smoothstep(1.,1.3,r));return mix(c,vec3(1.,.14,.42),smoothstep(1.3,1.75,r));}
void main(){float e=1.-abs(vV);float core=smoothstep(.45,1.,e),halo=smoothstep(0.,.8,e);float a=vA*uGain*mix(halo,halo*.5+core*.75,uCol);if(a<.004)discard;
 vec3 base=vec3(.94,.96,1.)*1.6;vec3 sp=pal(clamp(vS*1.7,0.,2.));sp=mix(sp,vec3(1.),core*.3)*(1.1+uHot*core);float hd=pow(max(1.-vT*2.2,0.),2.);sp+=vec3(1.,.93,.82)*hd*core*uHot*.35;o=vec4(mix(base,sp,uCol),a);}`;
function streakInit(){if(STREAK.gen===runtimeGeneration&&STREAK.t)return true;
 if(!MAC.prog||!MAC.t||LIVE.impl!=='MAC')return false;
 const mk=()=>liveTarget(STREAK.L,STREAK.NE,gl.RGBA32F,gl.RGBA,gl.FLOAT);
 STREAK.t=[mk(),mk()];STREAK.prog=liveCompile(STREAK_FS,STREAK_VS);STREAK.cur=0;STREAK.head=0;STREAK.key='';STREAK.gen=runtimeGeneration;
 for(const t of STREAK.t){gl.bindFramebuffer(gl.FRAMEBUFFER,t.f);gl.clearBufferfv(gl.COLOR,0,[0,0,0,0])}gl.bindFramebuffer(gl.FRAMEBUFFER,null);return true}
function streakClear(){for(const t of STREAK.t){gl.bindFramebuffer(gl.FRAMEBUFFER,t.f);gl.clearBufferfv(gl.COLOR,0,[0,0,0,0])}gl.bindFramebuffer(gl.FRAMEBUFFER,null)}
/* advance all streaklines by dt (seconds of simulated time); called once per frame after the solver substeps */
function streakStep(dt){if(STREAK.mode==='vol'||!LIVE.ok||LIVE.impl!=='MAC'||!LIVE.emArr||!LIVE.emitters.length)return;
 try{if(!streakInit())return;
  const key=LIVE.emitters.length+'|'+LIVE.tipX.toFixed(3)+'|'+LIVE.emitters[0].join(',');if(key!==STREAK.key){STREAK.key=key;streakClear()}
  STREAK.head=(STREAK.head+1)%STREAK.L;const prev=STREAK.t[STREAK.cur],next=STREAK.t[1-STREAK.cur],G=MAC.G;
  gl.bindVertexArray(LIVE.vao);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
  macPass('pstep',{f:next.f,t:next.t,w:STREAK.L,h:STREAK.NE},{uVel:MAC.t.velA.t,uPrev:prev.t,uSol:MAC.t.sol.t},{uDt:Math.min(.06,dt),uEm:LIVE.emArr,uHead:{int:STREAK.head},uEmN:{int:LIVE.emitters.length}},G,G);
  STREAK.cur=1-STREAK.cur;STREAK.rows=LIVE.emitters.length;STREAK.err=null}
 catch(e){STREAK.err=String(e?.message||e);STREAK.mode='vol'}}
/* ribbons over the composite; vp is the same jittered view-projection as the scene pass */
function streakDraw(vp,rw,rh){if(STREAK.mode==='vol'||!STREAK.t||!STREAK.rows||STREAK.err)return;
 const p=STREAK.prog;gl.useProgram(p);gl.bindVertexArray(null);
 gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(false);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE,gl.ONE,gl.ONE);
 gl.activeTexture(gl.TEXTURE8);gl.bindTexture(gl.TEXTURE_2D,STREAK.t[STREAK.cur].t);gl.uniform1i(liveU(p,'uP'),8);
 gl.uniform1i(liveU(p,'uHead'),STREAK.head);gl.uniform1i(liveU(p,'uL'),STREAK.L);gl.uniformMatrix4fv(liveU(p,'uVP'),false,vp);gl.uniform2f(liveU(p,'uPx'),rw,rh);
 gl.uniform1f(liveU(p,'uMaxSeg'),Math.max(.7,.14*(MAC.U||5)));gl.uniform1f(liveU(p,'uPW'),Math.max(1.2,rw/900)*STREAK.width*(STREAK.col?1.7:1));gl.uniform1f(liveU(p,'uGain'),STREAK.gain);gl.uniform1f(liveU(p,'uCol'),STREAK.col?1:0);gl.uniform1f(liveU(p,'uHot'),STREAK.hot);
 gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,2*STREAK.L*STREAK_SUB,STREAK.rows);
 gl.disable(gl.BLEND);gl.depthMask(true);gl.bindTexture(gl.TEXTURE_2D,null);gl.activeTexture(gl.TEXTURE0)}
