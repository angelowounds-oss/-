/* AETHER LIVE CFD: real-time GPU incompressible flow (collocated grid, semi-Lagrangian advection,
   Jacobi pressure projection, vorticity confinement) + passive-scalar smoke with MacCormack transport. */
const LIVE={impl:(location.hash.match(/impl=(COLLOCATED|MAC)/)||[])[1]||'MAC',macErr:null,ok:false,err:null,enabled:true,init:false,gen:-1,q:null,N:null,step:0,t:0,U:5,mode:'RAKE_V',wand:false,colorMode:/color=1/.test(location.hash),
 vortEps:.35,jacobi:32,sub:2,bench:null,benchRes:null,rs:.5,rq:0,cs:.8,stepScale:.75,frame:0,solver:'MG',mgCycles:1,mgPre:2,mgPost:2,mgLevels:3,omega:.86,mgRN:1,mgRS:0,mgCorr:.75,coarseIters:40,diag:false,dens:6,speedAt:0,lastRead:0,lastT:0,emitters:[],stats:{}};
window.__LIVE=LIVE;window.__AETHER_DEBUG={get fpv(){return fpv},get camera(){return camera},get body(){return window.__BODY},get door(){return DOOR},
 sceneStats(){return {objects:scene.objects.length,vehicleParts:scene.vehicleParts.length,fanParts:scene.fanParts.length,roadParts:scene.roadParts.length,names:scene.objects.map(o=>o.name).filter(Boolean)}},setPreset(n){setPreset(n)},get bootStage(){return diagnostics.bootStage},get errors(){return diagnostics.errors.slice()}};
const LIVE_BENCH={D:.5,x:-1.5,z:.1,y:1.5,T:8,spin:2};
const LIVE_Q={LOW:QUALITY.sim.LOW.grid,MID:QUALITY.sim.MID.grid,MED:QUALITY.sim.MID.grid,HIGH:QUALITY.sim.HIGH.grid,ULTRA:QUALITY.sim.ULTRA.grid};
const LIVE_TIERS=QUALITY.tiers;
/* start tier: manual (#q / #sim) or the calibrated choice; before calibration the LOW grid is used to measure */
function liveStartTier(){const m=perfManualFromHash().sim;if(m)return {q:m,auto:false};return {q:LIVE.forceQ||'LOW',auto:true}}
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
float bodyR(float y){float r=(y<0.||y>1.78)?0.:(y<.85?.17:(y<1.5?.25:.12));return r>0.?max(r,uH.x):0.;}
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
void main(){ivec3 c=ivec3(ivec2(gl_FragCoord.xy),uLayer);int t=ST(c);vec3 u=F(uVel,c).xyz;o=vec4(t>0?0.:F(uDye,c).x,t==1?1.:(t==2?.6:0.),length(u)/max(uU,.1),1);}`};
const LIVE_SUM=`#version 300 es
precision highp float;precision highp sampler2D;uniform sampler2D uS;uniform ivec2 uSz;out vec4 o;
void main(){ivec2 b=ivec2(gl_FragCoord.xy)*8;vec4 s=vec4(0.);for(int j=0;j<8;j++)for(int i=0;i<8;i++){ivec2 q=b+ivec2(i,j);if(q.x<uSz.x&&q.y<uSz.y)s+=texelFetch(uS,q,0);}o=s;}`;
const LIVE_RAY=`#version 300 es
precision highp float;precision highp sampler3D;
uniform sampler3D uVol;uniform mat4 uInv;uniform vec3 uEye,uBMin,uBMax,uLD;uniform vec2 uRes;uniform float uDens,uCMode,uStepScale,uCal;uniform int uQ,uFrame;out vec4 o;
vec3 turbo(float t){t*=4.;vec3 a=vec3(.10,.18,1.),b=vec3(0.,.8,1.),c=vec3(.05,1.,.3),d=vec3(1.,.92,.05),e=vec3(1.,.12,.05);return t<1.?mix(a,b,t):t<2.?mix(b,c,t-1.):t<3.?mix(c,d,t-2.):mix(d,e,min(t-3.,1.));}
void main(){vec2 n=gl_FragCoord.xy/uRes*2.-1.;vec4 a=uInv*vec4(n,-1,1),b=uInv*vec4(n,1,1);vec3 ro=uEye,rd=normalize(b.xyz/b.w-a.xyz/a.w);
 vec3 iv=1./rd,t0=(uBMin-ro)*iv,t1=(uBMax-ro)*iv,mn=min(t0,t1),mx=max(t0,t1);float tn=max(max(mn.x,mn.y),max(mn.z,0.)),tf=min(min(mx.x,mx.y),mx.z);
 if(ro.z>3.84){if(rd.z>=0.)discard;float tw=(3.9-ro.z)/rd.z;vec3 q=ro+rd*tw;bool win=q.x>-3.5&&q.x<2.3&&q.y>.95&&q.y<3.05,door=q.x>2.3&&q.x<3.5&&q.y>.75&&q.y<2.95;if(!win&&!door)discard;tn=max(tn,(3.83-ro.z)/rd.z);}
 if(tf<=tn)discard;bool inside=all(greaterThan(ro,uBMin))&&all(lessThan(ro,uBMax));float dens=inside?uDens*.16:uDens;float L=tf-tn,stp=(uQ==0?.12:(uQ==1?.085:.065))/max(uStepScale,.25);int NS=int(clamp(L/stp,10.,220.));float dt=L/float(NS);
 float j=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233))+float(uFrame&255)*1.618)*43758.5453);
 vec3 ext=uBMax-uBMin,ld=uLD/ext;vec4 acc=vec4(0);float t=tn+j*dt,te=tn+L;float ph=1.+.35*pow(max(dot(rd,uLD),0.),3.);
 for(int i=0;i<260;i++){if(t>=te||acc.a>.985)break;vec3 uvw=(ro+rd*t-uBMin)/ext;
  vec4 c=textureLod(uVol,uvw,2.);if(uCal<.5&&c.g<.002&&c.r*dens<.0012){t+=dt*4.;continue;}
  vec4 s=textureLod(uVol,uvw,0.);if(s.g>.55)break;float d=uCal>.5?.004:s.r*dens;if(d<.003){t+=dt;continue;}
  float sh=textureLod(uVol,uvw+ld*.17,0.).r;if(uQ>0)sh+=.7*textureLod(uVol,uvw+ld*.4,0.).r;if(uQ>1)sh+=.5*textureLod(uVol,uvw+ld*.75,0.).r;
  float lit=.32+.68*exp(-sh*dens*.9);d*=smoothstep(.15,.7,t);
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
 const st=liveStartTier(),q=st.q==='MED'?'MID':st.q;LIVE.q=q;LIVE.mgCycles=q==='ULTRA'?2:1;const N=LIVE_Q[q];LIVE.N=N;
 const b=CFD_DOMAIN_CONTRACT.bounds,min=Array.from(b.min),max=Array.from(b.max),h=max.map((v,i)=>(v-min[i])/N[i]);LIVE.min=min;LIVE.max=max;LIVE.h=h;
 const maxTex=gl.getParameter(gl.MAX_TEXTURE_SIZE);let tx=Math.ceil(Math.sqrt(N[2]*N[1]/N[0]));tx=Math.min(tx,Math.floor(maxTex/N[0]));const ty=Math.ceil(N[2]/tx);LIVE.tx=tx;LIVE.W=N[0]*tx;LIVE.H=N[1]*ty;
 if(LIVE.impl==='MAC'){try{
   if(LIVE.progGen!==runtimeGeneration){LIVE.prog={};for(const k in LIVE_FS)LIVE.prog[k]=liveCompile(LIVE_H+LIVE_FS[k]);LIVE.prog.ray=liveCompile(LIVE_RAY);LIVE.prog.sum=liveCompile(LIVE_SUM);LIVE.prog.comp=liveCompile(LIVE_COMP);LIVE.progGen=runtimeGeneration;LIVE.vao=gl.createVertexArray()}
   LIVE.fanKey=JSON.stringify(AETHER.FAN_MODULE?.layout?.fanBounds||null);macInit();LIVE.vol=MAC.vol;LIVE.volFbo=null;LIVE.vox={car:Math.round(MAC.vox.carCells),fan:MAC.vox.fan,front:MAC.vox.front,ms:Math.round(MAC.vox.ms)};
   LIVE.ok=true;LIVE.err=null;LIVE.step=0;LIVE.t=0;return}
  catch(e){LIVE.macErr=String(e?.message||e);LIVE.impl='COLLOCATED';try{macRelease()}catch(_){}}}
 LIVE.bench=LIVE.bench||(location.hash.match(/bench=(cylinder)/)||[])[1]||null;if(LIVE.bench&&!LIVE.benchRec&&!LIVE.benchRes)LIVE.benchRec={t:[],v:[],vx:[]};const fanB=AETHER.FAN_MODULE?.layout?.fanBounds||null;LIVE.fanKey=JSON.stringify(fanB);const vox=liveVoxelize(N,min,h,fanB);LIVE.vox={car:vox.car,fan:vox.fan,front:vox.front,ms:Math.round(vox.ms)};
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
function liveForceReduce(){if(LIVE.impl==='MAC'){const T=MAC.t,cfg=MAC.cfg;gl.bindVertexArray(LIVE.vao);macPass('force',T.frc,{uVel:T.velA.t,uP:MAC.lv[0].T.pA.t,uSol:T.sol.t,uNu:T.nu.t},{uRho:cfg.rho??1.2,uNuMol:cfg.nu??MAC.nuMol,uId:1});return {src:liveReduceTo(T.frc,MAC.G.W,MAC.G.H,MAC.red),sw:1,sh:1}}const T=LIVE.tex;gl.bindVertexArray(LIVE.vao);livePass('force',T.frc,{uP:T.pA.t},{});let src=T.frc,sw=LIVE.W,sh=LIVE.H;const p=LIVE.prog.sum;gl.useProgram(p);
 for(const r of LIVE.red){gl.bindFramebuffer(gl.FRAMEBUFFER,r.t.f);gl.viewport(0,0,r.w,r.h);gl.activeTexture(gl.TEXTURE0+8);gl.bindTexture(gl.TEXTURE_2D,src.t);gl.uniform1i(liveU(p,'uS'),8);gl.uniform2i(liveU(p,'uSz'),sw,sh);gl.drawArrays(gl.TRIANGLES,0,3);src=r.t;sw=r.w;sh=r.h}
 return {src,sw,sh}}
function liveForceFinish(buf,n,dt){let fx=0,fy=0,fz=0;for(let i=0;i<n;i++){fx+=buf[i*4];fy+=buf[i*4+1];fz+=buf[i*4+2]}
 const rho=1.2,k=LIVE.impl==='MAC'?1:rho/dt,A=LIVE.vox?.front||0,q=.5*rho*LIVE.U*LIVE.U*A;
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
 const f=liveForceFinish(buf,J.n,J.dt);if(!Number.isFinite(f.Fx)||Math.abs(f.Cd)>200){LIVE.guardTrips=(LIVE.guardTrips||0)+1;LIVE.forces=null;if(LIVE.impl==='MAC'){if(MAC.solver!=='RBGS'){MAC.solver='RBGS';LIVE.api.reset()}else{LIVE.macErr='발산 감지: 기존 솔버로 전환';LIVE.impl='COLLOCATED';liveSetTier(LIVE.q,'fallback');LIVE.init=false}}else{LIVE.solver='JACOBI';LIVE.api.reset()}return}liveForceUpdate(f)}
function liveForceUpdate(f){if(!f||!Number.isFinite(f.Cd))return;const F=LIVE.forces;if(!F||F.U!==LIVE.U){LIVE.forces={U:LIVE.U,n:1,...f};return}
 const a=Math.max(.12,1/(F.n+1));for(const k of ['Fx','Fy','Fz','Cd','Cl','Cs'])F[k]+=(f[k]-F[k])*a;F.A=f.A;F.n++;
 /* time statistics over the last 8 s of simulated time (spec: mean and standard deviation) */
 const H=F.hist||(F.hist=[]);H.push([LIVE.t,f.Cd,f.Cl]);while(H.length&&H[0][0]<LIVE.t-8)H.shift();const m=i=>H.reduce((s,h)=>s+h[i],0)/H.length,sd=(i,mu)=>Math.sqrt(H.reduce((s,h)=>s+(h[i]-mu)**2,0)/H.length);
 F.CdMean=m(1);F.ClMean=m(2);F.CdStd=sd(1,F.CdMean);F.ClStd=sd(2,F.ClMean);F.window=H.length>1?H[H.length-1][0]-H[0][0]:0}/* Benchmark: vertical cylinder (D=0.5 m) spanning the tunnel height. Probe = lateral velocity 3D behind it, offset 0.5D. Strouhal St=f*D/U from the DFT peak. */
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
 return {ok:true,n,seconds:n*dt,f,St,StZeroCross:fz*D/U,ref,relErr:(St-ref)/ref,vRms:rms/(.5),U,D,cells:D/Math.min(...LIVE.h),peakQ:bm/(fl.reduce((a,q)=>a+q[1],0)/fl.length)}}function liveRelease(){if(LIVE.impl==='MAC'||MAC.t){try{macRelease()}catch(_){}}const del=t=>{if(t&&t.t){gl.deleteTexture(t.t);gl.deleteFramebuffer(t.f)}},T=LIVE.tex;if(T)for(const k in T)del(T[k]);for(const V of (LIVE.lv||[]).slice(1))for(const k in V.t)del(V.t[k]);(LIVE.red||[]).forEach(r=>del(r.t));
 if(LIVE.obs)gl.deleteTexture(LIVE.obs);if(LIVE.vol)gl.deleteTexture(LIVE.vol);if(LIVE.volFbo)gl.deleteFramebuffer(LIVE.volFbo);LIVE.tex=null;LIVE.lv=null;LIVE.red=null}
function liveSetTier(q,why){if(!LIVE_Q[q]||q===LIVE.q&&LIVE.init)return;liveRelease();LIVE.forceQ=q;LIVE.init=false;LIVE.ok=false;LIVE.forces=null;PERF.ctl.log.push((why||'')+'→'+q)}
function liveSwap(a,b){const T=LIVE.tex,t=T[a];T[a]=T[b];T[b]=t}
function liveEmitters(){const E=[],B=window.__BODY,fb=AETHER.FAN_MODULE?.layout?.fanBounds,x=fb?fb.max[0]+.3:-4.2;if(LIVE.mode==='RAKE_V'||LIVE.mode==='BOTH')for(let i=0;i<7;i++)E.push([x,.15+.22*i,0,.085]);
 if(LIVE.mode==='RAKE_H'||LIVE.mode==='BOTH')for(let i=0;i<9;i++)E.push([x,.5,-1.3+.325*i,.085]);
 if(LIVE.wand&&fpv.enabled&&B?.inTunnel){const cp=Math.cos(fpv.pitch),f=[Math.sin(fpv.yaw)*cp,Math.sin(fpv.pitch),-Math.cos(fpv.yaw)*cp],e=camera.eye;E.push([e[0]+f[0]*.75,e[1]+f[1]*.75-.3,e[2]+f[2]*.75,.09])}
 LIVE.emitters=E.slice(0,16);const a=new Float32Array(64);LIVE.emitters.forEach((v,i)=>a.set(v,i*4));return a}
function livePasses(dt,initOnly=false){if(LIVE.impl==='MAC'){if(initOnly)return;macStep(dt);LIVE.step++;LIVE.t+=dt;LIVE.lastDt=dt;return}const T=LIVE.tex,B=window.__BODY,act=!!(B&&B.active);gl.bindVertexArray(LIVE.vao);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
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
function liveCopyVolume(){if(LIVE.impl==='MAC')return macCopyVolume();const p=LIVE.prog.copy,N=LIVE.N,T=LIVE.tex;gl.useProgram(p);gl.bindFramebuffer(gl.FRAMEBUFFER,LIVE.volFbo);gl.viewport(0,0,N[0],N[1]);
 gl.uniform3i(liveU(p,'uN'),N[0],N[1],N[2]);gl.uniform1i(liveU(p,'uTX'),LIVE.tx);gl.uniform3f(liveU(p,'uMin'),...LIVE.min);gl.uniform3f(liveU(p,'uH'),...LIVE.h);gl.uniform1f(liveU(p,'uU'),LIVE.U);
 const bind=(u,n,t)=>{gl.activeTexture(gl.TEXTURE0+u);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(liveU(p,n),u)};bind(8,'uFlags',T.flags.t);bind(9,'uVel',T.velA.t);bind(10,'uDye',T.dyeA.t);
 for(let k=0;k<N[2];k++){gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,LIVE.vol,0,k);gl.uniform1i(liveU(p,'uLayer'),k);gl.drawArrays(gl.TRIANGLES,0,3)}
 gl.bindTexture(gl.TEXTURE_3D,LIVE.vol);gl.generateMipmap(gl.TEXTURE_3D)}
function liveRead(x,y,z){if(LIVE.impl==='MAC')return macRead(x,y,z);const N=LIVE.N,i=Math.min(N[0]-1,Math.max(0,Math.floor((x-LIVE.min[0])/LIVE.h[0]))),j=Math.min(N[1]-1,Math.max(0,Math.floor((y-LIVE.min[1])/LIVE.h[1]))),k=Math.min(N[2]-1,Math.max(0,Math.floor((z-LIVE.min[2])/LIVE.h[2])));
 const ax=(k%LIVE.tx)*N[0]+i,ay=Math.floor(k/LIVE.tx)*N[1]+j,buf=new Float32Array(4);gl.bindFramebuffer(gl.FRAMEBUFFER,LIVE.tex.velA.f);gl.readPixels(ax,ay,1,1,gl.RGBA,gl.FLOAT,buf);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return [buf[0],buf[1],buf[2]]}
function liveStep(now){if(!LIVE.enabled)return;if(!LIVE.init||LIVE.gen!==runtimeGeneration)liveInit();if(!LIVE.ok||LIVE.freeze)return;
 if(!PERF.cal){const M=perfManualFromHash();PERF.cal=(M.sim&&M.vol&&M.ren)?{done:true,result:{skipped:'manual #q'}}:{};if(PERF.cal.done)for(const ax of ['sim','vol','ren'])perfApplyTier(ax,M[ax])}
 if(!PERF.cal.done){try{smokeState.enabled=false;perfCalibrateStep(now)}catch(e){PERF.cal={done:true,result:{error:String(e?.message||e)}};for(const ax of ['sim','vol','ren'])perfApplyTier(ax,'LOW')}if(!LIVE.init)return}if(now-(LIVE.lastFanCheck||0)>1000){LIVE.lastFanCheck=now;const fb=AETHER.FAN_MODULE?.layout?.fanBounds||null;if(JSON.stringify(fb)!==LIVE.fanKey)liveReobstacle(fb)}
 try{smokeState.enabled=false;const fdt=LIVE.lastT?Math.min(.05,(now-LIVE.lastT)/1000):1/60;LIVE.lastT=now;
  const hmin=Math.min(...LIVE.h),cfl=.9*hmin/(1.6*Math.max(LIVE.U,.5)),n=LIVE.step<40?6:LIVE.sub,dt=Math.min(cfl,Math.max(fdt,1/60)/LIVE.sub);
  for(let s=0;s<n;s++){livePasses(dt);if(LIVE.benchRec)liveBenchSample()}liveCopyVolume();
  liveForcesPoll();if(now-LIVE.lastRead>250){LIVE.lastRead=now;liveForcesKick();const B=window.__BODY;if(B&&B.active){const R=.55,P=[[R,0],[-R,0],[0,R],[0,-R]].map(([dx,dz])=>liveRead(B.x+dx,B.g+1.2,B.z+dz)),v=[0,1,2].map(i=>P.reduce((q,w)=>q+w[i],0)/4);LIVE.speedAt=P.reduce((q,w)=>q+Math.hypot(...w),0)/4;LIVE.vAt=v}}
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
/* calibration: worst-case march (no empty-space skipping, every step shaded) at the given size */
function liveCalibrationMarch(w,h){const RT=liveSmokeRT(w,h),p=LIVE.prog.ray;gl.bindVertexArray(LIVE.vao);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.bindFramebuffer(gl.FRAMEBUFFER,RT.f);gl.viewport(0,0,w,h);
 const eye=[-8.5,2.2,0],view=lookAt(eye,[6,1,0],[0,1,0]),proj=perspective(55,w/h,.05,60),vp=matMul(proj,view);
 gl.useProgram(p);gl.activeTexture(gl.TEXTURE0+8);gl.bindTexture(gl.TEXTURE_3D,LIVE.vol);gl.uniform1i(liveU(p,'uVol'),8);gl.uniformMatrix4fv(liveU(p,'uInv'),false,liveInv(vp));gl.uniform3f(liveU(p,'uEye'),...eye);
 gl.uniform3f(liveU(p,'uBMin'),...LIVE.min);gl.uniform3f(liveU(p,'uBMax'),...LIVE.max);gl.uniform2f(liveU(p,'uRes'),w,h);gl.uniform3f(liveU(p,'uLD'),.24,.95,.18);gl.uniform1f(liveU(p,'uDens'),LIVE.dens);gl.uniform1f(liveU(p,'uCMode'),1);
 gl.uniform1i(liveU(p,'uQ'),1);gl.uniform1f(liveU(p,'uStepScale'),1);gl.uniform1f(liveU(p,'uCal'),1);gl.uniform1i(liveU(p,'uFrame'),0);gl.drawArrays(gl.TRIANGLES,0,3);LIVE.calSteps=Math.round(18/.085)}
function liveRender(vp){if(!LIVE.enabled||!LIVE.ok)return;const dep=gl.isEnabled(gl.DEPTH_TEST),cull=gl.isEnabled(gl.CULL_FACE),cw=glCanvas.width,ch=glCanvas.height;try{
 const rs=LIVE.rs,w=Math.max(64,Math.round(cw*rs)),h=Math.max(64,Math.round(ch*rs)),RT=liveSmokeRT(w,h),p=LIVE.prog.ray,tq=LIVE.q==='LOW'?0:(LIVE.q==='MED'||LIVE.q==='HIGH'?1:2);
 gl.bindVertexArray(LIVE.vao);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.bindFramebuffer(gl.FRAMEBUFFER,RT.f);gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
 gl.useProgram(p);gl.activeTexture(gl.TEXTURE0+8);gl.bindTexture(gl.TEXTURE_3D,LIVE.vol);gl.uniform1i(liveU(p,'uVol'),8);gl.uniformMatrix4fv(liveU(p,'uInv'),false,liveInv(vp));
 gl.uniform3f(liveU(p,'uEye'),...camera.eye);gl.uniform3f(liveU(p,'uBMin'),...LIVE.min);gl.uniform3f(liveU(p,'uBMax'),...LIVE.max);gl.uniform2f(liveU(p,'uRes'),w,h);gl.uniform3f(liveU(p,'uLD'),.24,.95,.18);
 gl.uniform1f(liveU(p,'uDens'),LIVE.dens);gl.uniform1f(liveU(p,'uCMode'),LIVE.colorMode?1:0);gl.uniform1i(liveU(p,'uQ'),Math.min(tq,LIVE.rq));gl.uniform1f(liveU(p,'uStepScale'),LIVE.stepScale||1);gl.uniform1f(liveU(p,'uCal'),0);gl.uniform1i(liveU(p,'uFrame'),LIVE.frame=(LIVE.frame|0)+1);gl.drawArrays(gl.TRIANGLES,0,3);
 gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,cw,ch);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
 const c=LIVE.prog.comp;gl.useProgram(c);gl.activeTexture(gl.TEXTURE0+8);gl.bindTexture(gl.TEXTURE_2D,RT.t);gl.uniform1i(liveU(c,'uT'),8);gl.uniform2f(liveU(c,'uRes'),cw,ch);gl.drawArrays(gl.TRIANGLES,0,3);
}catch(e){LIVE.err='render: '+String(e?.message||e)}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.clearColor(.08,.11,.13,1);gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0);if(dep)gl.enable(gl.DEPTH_TEST);if(cull)gl.enable(gl.CULL_FACE);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA)}}
LIVE.api={read:(x,y,z)=>{const v=liveRead(x,y,z);return v},
 divStats(){if(LIVE.impl==='MAC')return macDivStats();const T=LIVE.tex,W=LIVE.W,H=LIVE.H;gl.bindVertexArray(LIVE.vao);livePass('div',T.div,{uVel:T.velA.t},{});const buf=new Float32Array(W*H*4);gl.bindFramebuffer(gl.FRAMEBUFFER,T.div.f);gl.readPixels(0,0,W,H,gl.RGBA,gl.FLOAT,buf);
  const fb=new Uint8Array(W*H*4);gl.bindFramebuffer(gl.FRAMEBUFFER,T.flags.f);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,fb);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null);
  let s=0,m=0,n=0;for(let i=0;i<W*H;i++){if(fb[i*4]>10)continue;const d=Math.abs(buf[i*4]);s+=d*d;m=Math.max(m,d);n++}const ref=LIVE.U/Math.min(...LIVE.h);return {rms:Math.sqrt(s/n),max:m,cells:n,relRms:Math.sqrt(s/n)/ref,relMax:m/ref}},
 flagCounts(){if(LIVE.impl==='MAC')return macFlagCounts();const T=LIVE.tex,W=LIVE.W,H=LIVE.H,fb=new Uint8Array(W*H*4);gl.bindFramebuffer(gl.FRAMEBUFFER,T.flags.f);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,fb);gl.bindFramebuffer(gl.FRAMEBUFFER,null);const c=[0,0,0,0];for(let i=0;i<W*H;i++){if(!fb[i*4+3])continue;c[Math.round(fb[i*4]*3/255)]++}return {fluid:c[0],car:c[1],fan:c[2],body:c[3]}},
 dyeSum(){if(LIVE.impl==='MAC'){const b=macReadAllD(MAC.t.dyeA);let s=0,c=0;for(let i=0;i<b.length;i+=4){s+=b[i];if(b[i]>.05)c++}return {sum:s,cells:c}}const T=LIVE.tex,W=LIVE.W,H=LIVE.H,buf=new Float32Array(W*H*4);gl.bindFramebuffer(gl.FRAMEBUFFER,T.dyeA.f);gl.readPixels(0,0,W,H,gl.RGBA,gl.FLOAT,buf);gl.bindFramebuffer(gl.FRAMEBUFFER,null);let s=0,c=0;for(let i=0;i<W*H;i++){s+=buf[i*4];if(buf[i*4]>.05)c++}return {sum:s,cells:c}}};

Object.assign(LIVE.api,{
 reset(){LIVE.forces=null;if(LIVE.impl==='MAC'){macReset();LIVE.step=0;LIVE.t=0;return}const T=LIVE.tex;gl.bindVertexArray(LIVE.vao);for(const k of ['velA','velB','curl','pA','pB','div','dyeA','dyeB','hat','bar','res'])liveClear(T[k]);for(const V of LIVE.lv.slice(1))for(const k of ['pA','pB','b','r'])liveClear(V.t[k]);livePasses(0,true);LIVE.step=0;LIVE.t=0;gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null)},
 /* deterministic stepping for tests: n steps of fixed dt, no rendering. opts.diag reads Poisson residual after the last solve */
 run(n,dt,opts={}){if(!LIVE.init)liveInit();const t0=performance.now();try{for(let i=0;i<n;i++){LIVE.diag=!!opts.diag&&i===n-1;livePasses(dt)}gl.bindFramebuffer(gl.FRAMEBUFFER,(LIVE.impl==='MAC'?MAC.t:LIVE.tex).velA.f);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,new Float32Array(4))}finally{LIVE.diag=false;gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,glCanvas.width,glCanvas.height);gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0);gl.enable(gl.DEPTH_TEST)}
  const out={ms:performance.now()-t0,step:LIVE.step,t:LIVE.t,solver:LIVE.solver};if(opts.diag)out.poisson=LIVE.api.poisson();return out},
 poisson(){if(LIVE.impl==='MAC')return macResidual();const T=LIVE.tex,W=LIVE.W,H=LIVE.H,r=new Float32Array(W*H*4),d=new Float32Array(W*H*4),fb=new Uint8Array(W*H*4);
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
 tune(now){perfControl(now)},
 rebuildLevels(){liveBuildLevels()},
 forces(){return LIVE.impl==='MAC'?macForces():liveForces()},
 mac(){return MAC},
 solveBench(list){return macSolveBench(list)},
 validate(cfg){return macValidate(cfg)},
 lbmSetup(cfg){return lbmSetup(cfg)},
 lbmRun(total,every){return lbmRun(total,every)},
 lbmProbe(i,j,k){return lbmProbe(i,j,k)},
 lbmStep(n){lbmStep(n)},
 lbmForce(){return lbmForce()},
 vrun(n,dt,every,probe,cv){return macVrun(n,dt,every,probe,cv)},
 uniformError(){return macUniformError()},
 memBreakdown(){return macMemBreakdown()},
 set(o){Object.assign(LIVE,o)}});

function liveReobstacle(fanB){if(LIVE.impl==='MAC'){try{LIVE.fanKey=JSON.stringify(fanB);const cfg=macConfig();cfg.fan=fanB;MAC.cfg=cfg;MAC.vox=macStaticSolids(MAC.N,MAC.min,MAC.h,cfg);macUploadStatic(MAC.G,MAC.vox);MAC.wheels=macWheels();macSolids()}catch(e){LIVE.err='reobstacle: '+e.message}return}try{const N=LIVE.N,vox=liveVoxelize(N,LIVE.min,LIVE.h,fanB);LIVE.fanKey=JSON.stringify(fanB);LIVE.vox={car:vox.car,fan:vox.fan,front:vox.front,ms:Math.round(vox.ms)};const obs=new Uint8Array(LIVE.W*LIVE.H*4);
 for(let k=0;k<N[2];k++)for(let j=0;j<N[1];j++)for(let i=0;i<N[0];i++){const t=vox.type[i+N[0]*(j+N[1]*k)];if(!t)continue;const ax=(k%LIVE.tx)*N[0]+i,ay=Math.floor(k/LIVE.tx)*N[1]+j,o=(ay*LIVE.W+ax)*4;obs[o+(t===1?0:1)]=255;obs[o+3]=255}
 gl.bindTexture(gl.TEXTURE_2D,LIVE.obs);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,LIVE.W,LIVE.H,0,gl.RGBA,gl.UNSIGNED_BYTE,obs)}catch(e){LIVE.err='reobstacle: '+e.message}}
LIVE.setEnabled=v=>{LIVE.enabled=!!v;smokeState.enabled=!(LIVE.enabled&&LIVE.ok)};
