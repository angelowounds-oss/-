/* ===== STREAKLINES: massless particles released at the rake nozzles and advected by the solver's own MAC velocity field (RK2),
   drawn as thin screen-space ribbons, depth-tested over the composite. One particle per nozzle per frame; a ring of L particles per
   nozzle is the streakline. Display of the same computed flow as the volume smoke, not a second flow model. */
const STREAK={mode:(location.hash.match(/smoke=(vol|streak|both)/)||[])[1]||'both',L:192,NE:40,head:0,cur:0,key:'',gen:-1,t:null,prog:null,err:null,rows:0,width:1.5,gain:1};
MAC_FS.pstep=`uniform sampler2D uVel,uPrev,uSol;uniform int uHead,uEmN;uniform float uDt;uniform vec4 uEm[40];
void main(){ivec2 t=ivec2(gl_FragCoord.xy);if(t.y>=uEmN){o=vec4(0);return;}
 if(t.x==uHead){o=vec4(uEm[t.y].xyz,1.);return;}
 vec4 p=texelFetch(uPrev,t,0);if(p.w<.5){o=vec4(0);return;}
 vec3 P=(p.xyz-uMin)/uH;vec3 v1=VEL(uVel,P,uN,uTX);vec3 Pm=P+.5*uDt*v1/uH;vec3 v2=VEL(uVel,Pm,uN,uTX);vec3 Pn=P+uDt*v2/uH;
 if(any(lessThan(Pn,vec3(.5)))||any(greaterThan(Pn,vec3(uN)-.5))){o=vec4(0);return;}
 float sid;if(PHIT(uSol,Pn-.5,uN,uTX,sid)>.5){o=vec4(0);return;}
 o=vec4(uMin+Pn*uH,1.+clamp(length(v2)/max(uU,.1)*.5,0.,1.));}`;
window.__STREAK=STREAK;
const STREAK_VS=`#version 300 es
precision highp float;precision highp int;precision highp sampler2D;
uniform sampler2D uP;uniform int uHead,uL;uniform mat4 uVP;uniform vec2 uPx;uniform float uPW;
out float vA;out float vV;out float vS;
vec4 PT(int a,int row){int col=(uHead-a+uL*4)%uL;return texelFetch(uP,ivec2(col,row),0);}
void main(){int seg=gl_VertexID>>1;float side=float(gl_VertexID&1)*2.-1.;int row=gl_InstanceID;
 vec4 p0=PT(seg,row),pn=PT(max(seg-1,0),row),po=PT(min(seg+1,uL-1),row);
 vec4 c0=uVP*vec4(p0.xyz,1.);
 if(p0.w<.5||seg>=uL-1||c0.w<.05){gl_Position=vec4(2.,2.,2.,1.);vA=0.;vV=0.;vS=0.;return;}
 vec3 pa=pn.w>.5?pn.xyz:p0.xyz,pb=po.w>.5?po.xyz:p0.xyz;
 vec4 ca=uVP*vec4(pa,1.),cb=uVP*vec4(pb,1.);
 vec2 d=(ca.xy/max(ca.w,.05)-cb.xy/max(cb.w,.05))*uPx;float l=length(d);d=l>1e-4?d/l:vec2(1.,0.);
 vec2 s0=c0.xy/c0.w+vec2(-d.y,d.x)*uPW/uPx*side;
 float t=float(seg)/float(uL-1);
 gl_Position=vec4(s0*c0.w,c0.z,c0.w);vV=side;vS=p0.w-1.;
 vA=smoothstep(0.,.025,t)*(1.-smoothstep(.55,1.,t));}`;
const STREAK_FS=`#version 300 es
precision highp float;
in float vA;in float vV;in float vS;uniform float uGain,uCol;out vec4 o;
void main(){float e=1.-abs(vV);float a=vA*smoothstep(0.,.6,e)*uGain;if(a<.004)discard;
 vec3 base=vec3(.94,.96,1.)*1.6;vec3 sp=mix(vec3(.15,.45,1.),vec3(1.,.55,.12),clamp(vS*1.4,0.,1.))*1.6;o=vec4(mix(base,sp,uCol),a);}`;
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
 gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(false);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
 gl.activeTexture(gl.TEXTURE8);gl.bindTexture(gl.TEXTURE_2D,STREAK.t[STREAK.cur].t);gl.uniform1i(liveU(p,'uP'),8);
 gl.uniform1i(liveU(p,'uHead'),STREAK.head);gl.uniform1i(liveU(p,'uL'),STREAK.L);gl.uniformMatrix4fv(liveU(p,'uVP'),false,vp);gl.uniform2f(liveU(p,'uPx'),rw,rh);
 gl.uniform1f(liveU(p,'uPW'),Math.max(1.2,rw/900)*STREAK.width);gl.uniform1f(liveU(p,'uGain'),STREAK.gain);gl.uniform1f(liveU(p,'uCol'),LIVE.colorMode?1:0);
 gl.drawArraysInstanced(gl.TRIANGLE_STRIP,0,2*STREAK.L,STREAK.rows);
 gl.disable(gl.BLEND);gl.depthMask(true);gl.bindTexture(gl.TEXTURE_2D,null);gl.activeTexture(gl.TEXTURE0)}
