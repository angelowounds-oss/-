/* ===== M5/M6 post pipeline (linear HDR). Scene -> [GTAO] -> volumetric smoke (low res, depth-aware, temporal)
   -> composite -> glass -> [TAA] -> bloom -> AgX/ACES tone map -> overlays (LDR) -> [FXAA] -> upscale+sharpen.
   Disabled with #fx=0 or when float render targets are missing (legacy forward path, visible in the HUD). ===== */
const FX={on:!/fx=0/.test(location.hash),active:false,err:null,gen:-1,rw:0,rh:0,vw:0,vh:0,frame:0,hist:0,shist:0,prevVP:null,jitter:[0,0],tone:(location.hash.match(/tone=(AGX|ACES)/)||[])[1]||'AGX',
 exposure:1.25,bloom:.045,aoStrength:1,g:.35,prog:null,t:null};
window.__AETHER_FX=FX;
const FX_H=`#version 300 es
precision highp float;precision highp sampler2D;precision highp sampler3D;
uniform vec2 uRes;uniform float uNear,uFar;
float linZ(float d){float z=d*2.-1.;return 2.*uNear*uFar/(uFar+uNear-z*(uFar-uNear));}
`;
const FX_FS={
/* ---- GTAO (half res). uDepth full-res scene depth, uP = projection params (xy scale, zw offset) for view reconstruction ---- */
gtao:`uniform sampler2D uDepth,uBlue;uniform vec4 uProj;uniform int uSlices,uSteps;uniform float uRadius,uFrame;out vec4 o;
vec3 VP(vec2 uv){float z=linZ(texture(uDepth,uv).r);return vec3((uv*2.-1.)*uProj.xy*z,-z);}
void main(){vec2 uv=gl_FragCoord.xy/uRes;float d=texture(uDepth,uv).r;if(d>=.99999){o=vec4(1);return;}vec3 P=VP(uv);
 vec2 px=1./uRes;vec3 n=normalize(cross(VP(uv+vec2(px.x,0.))-VP(uv-vec2(px.x,0.)),VP(uv+vec2(0.,px.y))-VP(uv-vec2(0.,px.y))));vec3 V=normalize(-P);
 float bn=texelFetch(uBlue,ivec2(gl_FragCoord.xy)&63,0).r,rot=fract(bn+uFrame*.618034)*3.14159265;
 float rpx=uRadius/(-P.z)/uProj.y*.5*uRes.y;rpx=clamp(rpx,2.,uRes.y*.12);float vis=0.;
 for(int s=0;s<8;s++){if(s>=uSlices)break;float ph=rot+3.14159265*float(s)/float(uSlices);vec2 dir=vec2(cos(ph),sin(ph));
  vec3 d3=vec3(dir,0.),orth=normalize(d3-V*dot(d3,V)),ax=cross(orth,V);vec3 np=n-ax*dot(n,ax);float nl=max(length(np),1e-4);float cn=clamp(dot(np,V)/nl,-1.,1.);float ng=sign(dot(np,orth))*acos(cn);
  float hp=-1.,hm=-1.;
  for(int k=1;k<=12;k++){if(k>uSteps)break;float t=(float(k)-.5+fract(bn*7.+float(k)*.37))/float(uSteps);
   for(int side=0;side<2;side++){float sd=side==0?1.:-1.;vec2 q=uv+sd*dir*t*rpx*px;if(any(lessThan(q,vec2(0.)))||any(greaterThan(q,vec2(1.))))continue;
    vec3 S=VP(q)-P;float l=length(S);float c=dot(S/max(l,1e-5),V);float fall=clamp(1.-l*l/(uRadius*uRadius),0.,1.);if(side==0)hp=max(hp,mix(-1.,c,fall));else hm=max(hm,mix(-1.,c,fall));}}
  float h0=-acos(hm),h1=acos(hp);h0=ng+max(h0-ng,-1.5707963);h1=ng+min(h1-ng,1.5707963);
  vis+=nl*.25*(-cos(2.*h0-ng)+cn+2.*h0*sin(ng)-cos(2.*h1-ng)+cn+2.*h1*sin(ng));}
 o=vec4(clamp(vis/float(uSlices),0.,1.),linZ(d),0.,1.);}`,
aoblur:`uniform sampler2D uAO;uniform vec2 uDir;out vec4 o;
void main(){vec2 uv=gl_FragCoord.xy/uRes;vec4 c=texture(uAO,uv);float s=c.r,w=1.;for(int i=-3;i<=3;i++){if(i==0)continue;vec4 t=texture(uAO,uv+uDir*float(i)/uRes);float k=exp(-abs(t.g-c.g)/(.05*c.g+.01))*exp(-float(i*i)*.12);s+=t.r*k;w+=k;}o=vec4(s/w,c.g,0.,1.);}`,
/* ---- volumetric smoke (low res). MRT: 0 premultiplied colour, 1 aux (x: alpha-weighted ray distance, y: scene view depth of this texel) ---- */
vol:`uniform sampler3D uVol;uniform sampler2D uDepth,uBlue;uniform mat4 uInv;uniform vec3 uEye,uBMin,uBMax,uLD,uFwd;uniform float uDens,uCMode,uStepScale,uG,uFrame;uniform int uTaps;
layout(location=0) out vec4 oC;layout(location=1) out vec4 oA;
vec3 turbo(float t){t*=4.;vec3 a=vec3(.10,.18,1.),b=vec3(0.,.8,1.),c=vec3(.05,1.,.3),d=vec3(1.,.92,.05),e=vec3(1.,.12,.05);return t<1.?mix(a,b,t):t<2.?mix(b,c,t-1.):t<3.?mix(c,d,t-2.):mix(d,e,min(t-3.,1.));}
vec3 lin(vec3 c){return pow(c,vec3(2.2));}
void main(){vec2 uv=gl_FragCoord.xy/uRes;vec2 n=uv*2.-1.;vec4 a=uInv*vec4(n,-1,1),b=uInv*vec4(n,1,1);vec3 ro=uEye,rd=normalize(b.xyz/b.w-a.xyz/a.w);
 /* nearest scene depth in this low-res footprint (depth-aware: every opaque object occludes the smoke) */
 vec2 ts=1./vec2(textureSize(uDepth,0));float dz=1.;for(int j=0;j<2;j++)for(int i=0;i<2;i++)dz=min(dz,texture(uDepth,uv+(vec2(i,j)-.5)*ts*1.5).r);
 float vz=linZ(dz);float tScene=dz>=.99999?1e9:vz/max(dot(rd,uFwd),1e-3);oA=vec4(0.,vz,0.,1.);oC=vec4(0.);
 vec3 iv=1./rd,t0=(uBMin-ro)*iv,t1=(uBMax-ro)*iv,mn=min(t0,t1),mx=max(t0,t1);float tn=max(max(mn.x,mn.y),max(mn.z,0.)),tf=min(min(mx.x,mx.y),min(mx.z,tScene));
 if(tf<=tn)return;float L=tf-tn,stp=.075/max(uStepScale,.25);int NS=int(clamp(L/stp,8.,256.));float dt=L/float(NS);
 float j=fract(texelFetch(uBlue,ivec2(gl_FragCoord.xy)&63,0).r+uFrame*.618034);vec3 ext=uBMax-uBMin;vec4 acc=vec4(0.);float wt=0.,wd=0.;
 float mu=dot(rd,uLD),hg=(1.-uG*uG)/(4.*3.14159*pow(1.+uG*uG-2.*uG*mu,1.5));
 for(int i=0;i<256;i++){if(i>=NS||acc.a>.99)break;float t=tn+(float(i)+j)*dt;vec3 p=ro+rd*t,uvw=(p-uBMin)/ext;
  vec4 c=textureLod(uVol,uvw,2.);if(c.r*uDens<.0015)continue;vec4 s=textureLod(uVol,uvw,0.);float d=s.r*uDens*smoothstep(.15,.7,t);if(d<.002)continue;
  float od=0.;for(int k=1;k<=6;k++){if(k>uTaps)break;od+=textureLod(uVol,uvw+uLD/ext*(.12*float(k*k)),0.).r*.12*float(2*k-1);}
  float T=exp(-od*uDens*2.2);vec3 alb=mix(vec3(.82,.86,.92),lin(turbo(clamp(.5+(s.b-1.)*1.25,0.,1.))),uCMode);
  vec3 col=alb*(vec3(1.,.96,.9)*3.2*T*hg*12.566*.35+vec3(.55,.62,.72)*.55);
  float al=1.-exp(-d*dt*8.);acc.rgb+=(1.-acc.a)*al*col;acc.a+=(1.-acc.a)*al;wd+=al*t;wt+=al;}
 oC=acc;oA=vec4(wt>0.?wd/wt:0.,vz,0.,1.);}`,
/* ---- smoke temporal reprojection with neighbourhood clamp (low res) ---- */
vtemp:`uniform sampler2D uCur,uAux,uHist;uniform mat4 uInv,uPrevVP;uniform vec3 uEye;uniform float uBlend;out vec4 o;
void main(){vec2 uv=gl_FragCoord.xy/uRes;vec4 c=texture(uCur,uv);vec4 lo=c,hi=c;for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec4 s=texture(uCur,uv+vec2(i,j)/uRes);lo=min(lo,s);hi=max(hi,s);}
 float t=texture(uAux,uv).x;vec2 n=uv*2.-1.;vec4 a=uInv*vec4(n,-1,1),b=uInv*vec4(n,1,1);vec3 rd=normalize(b.xyz/b.w-a.xyz/a.w);vec3 wp=uEye+rd*(t>0.?t:texture(uAux,uv).y);
 vec4 pc=uPrevVP*vec4(wp,1.);vec2 pu=pc.xy/pc.w*.5+.5;if(pc.w<=0.||any(lessThan(pu,vec2(0.)))||any(greaterThan(pu,vec2(1.)))){o=c;return;}
 vec4 h=clamp(texture(uHist,pu),lo,hi);o=mix(c,h,uBlend);}`,
/* ---- composite: AO on the indirect term + depth-aware (joint bilateral) upsample of the smoke, "over" ---- */
comp:`uniform sampler2D uScene,uAmb,uDepth,uAO,uSmoke,uSAux;uniform vec2 uLo;uniform float uAOOn,uAOK,uSmokeOn;out vec4 o;
void main(){vec2 uv=gl_FragCoord.xy/uRes;vec3 c=texture(uScene,uv).rgb;float z=linZ(texture(uDepth,uv).r);
 if(uAOOn>.5){float ao=texture(uAO,uv).r;c-=texture(uAmb,uv).rgb*(1.-pow(ao,uAOK));}
 if(uSmokeOn>.5){vec2 q=uv*uLo-.5;vec2 f=fract(q);ivec2 i0=ivec2(floor(q));vec4 acc=vec4(0.);float wt=0.;
  for(int k=0;k<4;k++){ivec2 d=ivec2(k&1,k>>1);ivec2 p=clamp(i0+d,ivec2(0),ivec2(uLo)-1);float w=(d.x==1?f.x:1.-f.x)*(d.y==1?f.y:1.-f.y);float zl=texelFetch(uSAux,p,0).y;w*=exp(-abs(zl-z)/(.04*z+.02))+1e-4;acc+=w*texelFetch(uSmoke,p,0);wt+=w;}
  vec4 s=acc/max(wt,1e-5);c=c*(1.-s.a)+s.rgb;}
 o=vec4(max(c,vec3(0.)),1.);}`,
/* ---- TAA: camera reprojection, YCoCg variance clip, luminance-weighted blend ---- */
taa:`uniform sampler2D uCur,uHist,uDepth;uniform mat4 uInvVP,uPrevVP;uniform float uReset;out vec4 o;
vec3 ycc(vec3 c){return vec3(dot(c,vec3(.25,.5,.25)),dot(c,vec3(.5,0.,-.5)),dot(c,vec3(-.25,.5,-.25)));}
vec3 rgb(vec3 c){return vec3(c.x+c.y-c.z,c.x+c.z,c.x-c.y-c.z);}
vec3 tm(vec3 c){return c/(1.+max(c.r,max(c.g,c.b)));}vec3 itm(vec3 c){return c/max(1.-max(c.r,max(c.g,c.b)),1e-4);}
void main(){vec2 uv=gl_FragCoord.xy/uRes;vec3 cur=tm(texture(uCur,uv).rgb);if(uReset>.5){o=vec4(itm(cur),1.);return;}
 vec3 m1=vec3(0.),m2=vec3(0.);for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec3 s=ycc(tm(texture(uCur,uv+vec2(i,j)/uRes).rgb));m1+=s;m2+=s*s;}
 m1/=9.;vec3 sig=sqrt(max(m2/9.-m1*m1,0.));vec3 lo=m1-1.1*sig,hi=m1+1.1*sig;
 float d=texture(uDepth,uv).r;vec4 wp=uInvVP*vec4(uv*2.-1.,d*2.-1.,1.);wp/=wp.w;vec4 pc=uPrevVP*wp;vec2 pu=pc.xy/pc.w*.5+.5;
 if(any(lessThan(pu,vec2(0.)))||any(greaterThan(pu,vec2(1.)))){o=vec4(itm(cur),1.);return;}
 vec3 h=ycc(tm(texture(uHist,pu).rgb));h=clamp(h,lo,hi);vec3 hr=rgb(h);float a=.1;o=vec4(itm(mix(hr,cur,a)),1.);}`,
/* ---- bloom ---- */
bpre:`uniform sampler2D uSrc;uniform float uThr;out vec4 o;
void main(){vec2 uv=gl_FragCoord.xy/uRes,t=1./uRes;vec3 s=vec3(0.);float w=0.;for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec3 c=texture(uSrc,uv+vec2(i,j)*t*.5).rgb;float k=1./(1.+max(c.r,max(c.g,c.b)));s+=c*k;w+=k;}s/=w;
 float br=max(s.r,max(s.g,s.b)),soft=clamp(br-uThr+.5,0.,1.);soft=soft*soft*.5;float c=max(soft,br-uThr)/max(br,1e-4);o=vec4(s*c,1.);}`,
bdown:`uniform sampler2D uSrc;out vec4 o;
void main(){vec2 uv=gl_FragCoord.xy/uRes,t=.5/uRes;o=vec4((texture(uSrc,uv+vec2(-t.x,-t.y)).rgb+texture(uSrc,uv+vec2(t.x,-t.y)).rgb+texture(uSrc,uv+vec2(-t.x,t.y)).rgb+texture(uSrc,uv+t).rgb)*.25,1.);}`,
bup:`uniform sampler2D uSrc,uLow;out vec4 o;
void main(){vec2 uv=gl_FragCoord.xy/uRes,t=1./vec2(textureSize(uLow,0));vec3 s=vec3(0.);for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++)s+=texture(uLow,uv+vec2(i,j)*t).rgb*((i==0?2.:1.)*(j==0?2.:1.));o=vec4(texture(uSrc,uv).rgb+s/16.,1.);}`,
/* ---- tone map (AgX default, ACES optional) + exposure + bloom + blue-noise dither ---- */
tone:`uniform sampler2D uSrc,uBloom,uBlue;uniform float uExp,uBloomK,uAces,uFrame;out vec4 o;
vec3 agxC(vec3 x){vec3 x2=x*x,x4=x2*x2;return 15.5*x4*x2-40.14*x4*x+31.96*x4-6.868*x2*x+.4298*x2+.1191*x-.00232;}
vec3 agx(vec3 v){const mat3 M=mat3(.842479062253094,.0423282422610123,.0423756549057051,.0784335999999992,.878468636469772,.0784336,.0792237451477643,.0791661274605434,.879142973793104);
 const mat3 Mi=mat3(1.19687900512017,-.0528968517574562,-.0529716355144438,-.0980208811401368,1.15190312990417,-.0980434501171241,-.0990297440797205,-.0989611768448433,1.15107367264116);
 v=M*v;v=clamp(log2(max(v,vec3(1e-10))),-12.47393,4.026069);v=(v+12.47393)/16.499999;return Mi*agxC(v);}
vec3 enc(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0)),vec3(1./2.4))-.055,step(vec3(.0031308),c));}
void main(){vec2 uv=gl_FragCoord.xy/uRes;vec3 h=(texture(uSrc,uv).rgb+uBloomK*texture(uBloom,uv).rgb)*uExp;
 vec3 c=uAces>.5?enc(clamp((h*(2.51*h+.03))/(h*(2.43*h+.59)+.14),0.,1.)):clamp(agx(h),0.,1.);
 float n=fract(texelFetch(uBlue,ivec2(gl_FragCoord.xy)&63,0).r+uFrame*.618034)-.5;o=vec4(c+n/255.,1.);}`,
/* ---- FXAA (LOW) ---- */
fxaa:`uniform sampler2D uSrc;out vec4 o;float lu(vec3 c){return dot(c,vec3(.299,.587,.114));}
void main(){vec2 uv=gl_FragCoord.xy/uRes,t=1./uRes;vec3 M=texture(uSrc,uv).rgb;float lN=lu(texture(uSrc,uv+vec2(0,t.y)).rgb),lS=lu(texture(uSrc,uv-vec2(0,t.y)).rgb),lE=lu(texture(uSrc,uv+vec2(t.x,0)).rgb),lW=lu(texture(uSrc,uv-vec2(t.x,0)).rgb),lM=lu(M);
 float mn=min(lM,min(min(lN,lS),min(lE,lW))),mx=max(lM,max(max(lN,lS),max(lE,lW)));if(mx-mn<max(.0312,mx*.125)){o=vec4(M,1.);return;}
 float lNW=lu(texture(uSrc,uv+vec2(-t.x,t.y)).rgb),lNE=lu(texture(uSrc,uv+t).rgb),lSW=lu(texture(uSrc,uv-t).rgb),lSE=lu(texture(uSrc,uv+vec2(t.x,-t.y)).rgb);
 vec2 dir=vec2(-((lNW+lNE)-(lSW+lSE)),((lNW+lSW)-(lNE+lSE)));float rd=max((lNW+lNE+lSW+lSE)*.03125,1./128.);dir=clamp(dir/(min(abs(dir.x),abs(dir.y))+rd),vec2(-8.),vec2(8.))*t;
 vec3 A=.5*(texture(uSrc,uv+dir*(1./3.-.5)).rgb+texture(uSrc,uv+dir*(2./3.-.5)).rgb),B=A*.5+.25*(texture(uSrc,uv-dir*.5).rgb+texture(uSrc,uv+dir*.5).rgb);float lB=lu(B);o=vec4((lB<mn||lB>mx)?A:B,1.);}`,
/* ---- upscale to the canvas with contrast-adaptive sharpening ---- */
up:`uniform sampler2D uSrc;uniform float uSharp;out vec4 o;
void main(){vec2 uv=gl_FragCoord.xy/uRes,t=1./vec2(textureSize(uSrc,0));vec3 c=texture(uSrc,uv).rgb;if(uSharp<=0.){o=vec4(c,1.);return;}
 vec3 n=texture(uSrc,uv+vec2(0,t.y)).rgb,s=texture(uSrc,uv-vec2(0,t.y)).rgb,e=texture(uSrc,uv+vec2(t.x,0)).rgb,w=texture(uSrc,uv-vec2(t.x,0)).rgb;
 vec3 mn=min(c,min(min(n,s),min(e,w))),mx=max(c,max(max(n,s),max(e,w)));vec3 amp=sqrt(clamp(min(mn,1.-mx)/max(mx,1e-4),0.,1.));vec3 wt=-amp*mix(.125,.2,uSharp);
 o=vec4(clamp((c+(n+s+e+w)*wt)/(1.+4.*wt),0.,1.),1.);}`};

function fxCompile(){FX.prog={};for(const k in FX_FS)FX.prog[k]=liveCompile(FX_H+FX_FS[k]);
 const B=window.__ASSETS?.BLUE_NOISE;FX.blue=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,FX.blue);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
 const px=B?Uint8Array.from(atob(B.base64),c=>c.charCodeAt(0)):new Uint8Array(4096).map(()=>Math.random()*255);gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,64,64,0,gl.RED,gl.UNSIGNED_BYTE,px);
 for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.REPEAT],[gl.TEXTURE_WRAP_T,gl.REPEAT]])gl.texParameteri(gl.TEXTURE_2D,k,v)}
function fxTex(w,h,ifmt,fmt,type,lin){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,ifmt,w,h,0,fmt,type,null);
 for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,lin?gl.LINEAR:gl.NEAREST],[gl.TEXTURE_MAG_FILTER,lin?gl.LINEAR:gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);return t}
function fxFbo(colors,depth){const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);colors.forEach((c,i)=>gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+i,gl.TEXTURE_2D,c,0));
 if(depth)gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,depth,0);gl.drawBuffers(colors.map((_,i)=>gl.COLOR_ATTACHMENT0+i));
 if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('FX framebuffer incomplete');return f}
function fxRelease(){const T=FX.t;if(!T)return;for(const k in T){const v=T[k];if(v instanceof WebGLTexture)gl.deleteTexture(v);else if(v instanceof WebGLFramebuffer)gl.deleteFramebuffer(v);else if(Array.isArray(v))v.forEach(x=>{if(x instanceof WebGLTexture)gl.deleteTexture(x);else if(x instanceof WebGLFramebuffer)gl.deleteFramebuffer(x);else if(x&&x.t){gl.deleteTexture(x.t);gl.deleteFramebuffer(x.f)}})}FX.t=null}
/* (re)allocate targets for render size rw x rh and smoke size vw x vh */
function fxAlloc(rw,rh,vw,vh){fxRelease();const T=FX.t={},F16=[gl.RGBA16F,gl.RGBA,gl.HALF_FLOAT];
 T.color=fxTex(rw,rh,...F16,true);T.amb=fxTex(rw,rh,...F16,false);T.depth=fxTex(rw,rh,gl.DEPTH_COMPONENT24,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,false);
 T.sceneF=fxFbo([T.color,T.amb],T.depth);
 T.comp=fxTex(rw,rh,...F16,true);T.compF=fxFbo([T.comp],null);T.compDF=fxFbo([T.comp],T.depth);
 T.hist=[fxTex(rw,rh,...F16,true),fxTex(rw,rh,...F16,true)];T.histF=T.hist.map(t=>fxFbo([t],null));
 T.ldr=fxTex(rw,rh,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,true);T.ldrF=fxFbo([T.ldr],null);T.ldrDF=fxFbo([T.ldr],T.depth);
 T.ldr2=fxTex(rw,rh,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,true);T.ldr2F=fxFbo([T.ldr2],null);
 const aw=Math.max(1,rw>>1),ah=Math.max(1,rh>>1);T.ao=[fxTex(aw,ah,...F16,true),fxTex(aw,ah,...F16,true)];T.aoF=T.ao.map(t=>fxFbo([t],null));
 T.sm=fxTex(vw,vh,...F16,false);T.sa=fxTex(vw,vh,...F16,false);T.smF=fxFbo([T.sm,T.sa],null);
 T.sh=[fxTex(vw,vh,...F16,true),fxTex(vw,vh,...F16,true)];T.shF=T.sh.map(t=>fxFbo([t],null));
 T.bl=[];let w=aw,h=ah;for(let i=0;i<5&&w>=8&&h>=8;i++){const a=fxTex(w,h,...F16,true),b=fxTex(w,h,...F16,true);T.bl.push({w,h,a,b,af:fxFbo([a],null),bf:fxFbo([b],null)});w=Math.max(1,w>>1);h=Math.max(1,h>>1)}
 FX.rw=rw;FX.rh=rh;FX.vw=vw;FX.vh=vh;FX.aw=aw;FX.ah=ah;FX.hist=0;FX.shist=0;FX.reset=true;gl.bindFramebuffer(gl.FRAMEBUFFER,null)}
function fxPass(name,fbo,w,h,tex,uni){const p=FX.prog[name];gl.useProgram(p);gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.viewport(0,0,w,h);gl.uniform2f(liveU(p,'uRes'),w,h);gl.uniform1f(liveU(p,'uNear'),camera.near);gl.uniform1f(liveU(p,'uFar'),camera.far);
 let unit=8;for(const n in tex){const t=tex[n];gl.activeTexture(gl.TEXTURE0+unit);if(t&&t.__3d){gl.bindTexture(gl.TEXTURE_2D,null);gl.bindTexture(gl.TEXTURE_3D,t.t)}else gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(liveU(p,n),unit);unit++}
 for(const n in uni){const v=uni[n],l=liveU(p,n);if(l===null)continue;if(v instanceof Float32Array&&v.length===16)gl.uniformMatrix4fv(l,false,v);else if(Array.isArray(v)){if(v.length===4)gl.uniform4f(l,...v);else if(v.length===3)gl.uniform3f(l,...v);else gl.uniform2f(l,...v)}else if(v&&v.int!==undefined)gl.uniform1i(l,v.int);else gl.uniform1f(l,v)}
 gl.drawArrays(gl.TRIANGLES,0,3)}

/* ---- frame hooks ---- */
const FX_HALTON=[[.5,.333],[.25,.667],[.75,.111],[.125,.444],[.625,.778],[.375,.222],[.875,.556],[.0625,.889]];
function fxBegin(){FX.active=false;if(!FX.on||FX.err)return false;try{
  if(FX.gen!==runtimeGeneration){FX.gen=runtimeGeneration;FX.t=null;if(!gl.getExtension('EXT_color_buffer_float'))throw Error('EXT_color_buffer_float 없음');fxCompile()}
  const rs=Math.min(1,Math.max(.5,LIVE.cs||1)),rw=Math.max(64,Math.round(glCanvas.width*rs)),rh=Math.max(64,Math.round(glCanvas.height*rs)),vs=Math.min(1,Math.max(.25,LIVE.rs||.5)),vw=Math.max(32,Math.round(rw*vs*.5)),vh=Math.max(32,Math.round(rh*vs*.5));
  if(!FX.t||rw!==FX.rw||rh!==FX.rh||vw!==FX.vw||vh!==FX.vh)fxAlloc(rw,rh,vw,vh);
  const taa=PERF.set.aa==='TAA';FX.taa=taa;const J=taa?FX_HALTON[FX.frame%8]:[.5,.5];FX.jitter=[(J[0]-.5)*2/rw,(J[1]-.5)*2/rh];
  gl.bindFramebuffer(gl.FRAMEBUFFER,FX.t.sceneF);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.viewport(0,0,rw,rh);FX.active=true;return true}
 catch(e){FX.err=String(e?.message||e);FX.active=false;gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,glCanvas.width,glCanvas.height);return false}}
function fxJitter(proj){if(!FX.active||!FX.taa)return proj;const p=new Float32Array(proj);p[8]+=FX.jitter[0];p[9]+=FX.jitter[1];return p}
function fxMatrices(){const view=lookAt(camera.eye,camera.target,camera.up),proj=perspective(camera.fov,glCanvas.width/glCanvas.height,camera.near,camera.far),vp=matMul(proj,view);return {view,proj,vp,inv:liveInv(vp)}}
function fxAfterOpaque(){const T=FX.t,M=FX.m=fxMatrices(),rw=FX.rw,rh=FX.rh;gl.bindVertexArray(LIVE.vao);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.depthMask(false);gl.disable(gl.CULL_FACE);
 const q=1/Math.tan(camera.fov*Math.PI/360),aspect=rw/rh,projP=[aspect/q,1/q,0,0];
 /* GTAO */
 const aoOn=PERF.set.ao>0;if(aoOn){const hi=PERF.set.ao>1;fxPass('gtao',T.aoF[0],FX.aw,FX.ah,{uDepth:T.depth,uBlue:FX.blue},{uProj:projP,uSlices:{int:hi?4:2},uSteps:{int:hi?8:5},uRadius:.9,uFrame:FX.frame%64});
  fxPass('aoblur',T.aoF[1],FX.aw,FX.ah,{uAO:T.ao[0]},{uDir:[1,0]});fxPass('aoblur',T.aoF[0],FX.aw,FX.ah,{uAO:T.ao[1]},{uDir:[0,1]})}
 /* volumetric smoke */
 const smokeOn=LIVE.enabled&&LIVE.ok&&!!LIVE.vol;if(smokeOn){const fwd=norm(sub(camera.target,camera.eye));
  fxPass('vol',T.smF,FX.vw,FX.vh,{uVol:{__3d:true,t:LIVE.vol},uDepth:T.depth,uBlue:FX.blue},{uInv:M.inv,uEye:[...camera.eye],uBMin:[...LIVE.min],uBMax:[...LIVE.max],uLD:[.24,.95,.18],uFwd:fwd,uDens:LIVE.dens,uCMode:LIVE.colorMode?1:0,uStepScale:LIVE.stepScale||1,uG:FX.g,uFrame:FX.frame%64,uTaps:{int:2+2*(LIVE.rq|0)}});
  gl.activeTexture(gl.TEXTURE8);gl.bindTexture(gl.TEXTURE_3D,null);
  const cur=FX.shist,nxt=1-cur;fxPass('vtemp',T.shF[nxt],FX.vw,FX.vh,{uCur:T.sm,uAux:T.sa,uHist:T.sh[cur]},{uInv:M.inv,uPrevVP:FX.prevVP||M.vp,uEye:[...camera.eye],uBlend:FX.reset?0:.8});FX.shist=nxt}
 fxPass('comp',T.compF,rw,rh,{uScene:T.color,uAmb:T.amb,uDepth:T.depth,uAO:T.ao[0],uSmoke:T.sh[FX.shist],uSAux:T.sa},{uLo:[FX.vw,FX.vh],uAOOn:aoOn?1:0,uAOK:FX.aoStrength,uSmokeOn:smokeOn?1:0});
 /* leave composite+depth bound for glass */
 gl.bindFramebuffer(gl.FRAMEBUFFER,T.compDF);gl.viewport(0,0,rw,rh);gl.enable(gl.DEPTH_TEST);gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0)}
function fxPost(){const T=FX.t,M=FX.m,rw=FX.rw,rh=FX.rh;gl.bindVertexArray(LIVE.vao);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.depthMask(false);gl.disable(gl.CULL_FACE);
 let src=T.comp;if(FX.taa){const cur=FX.hist,nxt=1-cur;fxPass('taa',T.histF[nxt],rw,rh,{uCur:T.comp,uHist:T.hist[cur],uDepth:T.depth},{uInvVP:M.inv,uPrevVP:FX.prevVP||M.vp,uReset:FX.reset?1:0});FX.hist=nxt;src=T.hist[nxt]}
 let bloom=T.bl[0]?.a;if(PERF.set.bloom&&T.bl.length){const B=T.bl;fxPass('bpre',B[0].af,B[0].w,B[0].h,{uSrc:src},{uThr:1.2});
  for(let i=1;i<B.length;i++)fxPass('bdown',B[i].af,B[i].w,B[i].h,{uSrc:B[i-1].a},{});
  for(let i=B.length-2;i>=0;i--){fxPass('bup',B[i].bf,B[i].w,B[i].h,{uSrc:B[i].a,uLow:i===B.length-2?B[i+1].a:B[i+1].b},{})}bloom=B.length>1?B[0].b:B[0].a}
 fxPass('tone',T.ldrF,rw,rh,{uSrc:src,uBloom:bloom||src,uBlue:FX.blue},{uExp:FX.exposure*M10_SETTINGS.exposure,uBloomK:PERF.set.bloom&&bloom?FX.bloom:0,uAces:FX.tone==='ACES'?1:0,uFrame:FX.frame%64});
 gl.bindFramebuffer(gl.FRAMEBUFFER,T.ldrDF);gl.viewport(0,0,rw,rh);gl.enable(gl.DEPTH_TEST);gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0)}
function fxPresent(){const T=FX.t,rw=FX.rw,rh=FX.rh;gl.bindVertexArray(LIVE.vao);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.depthMask(false);
 let src=T.ldr;if(PERF.set.aa==='FXAA'){fxPass('fxaa',T.ldr2F,rw,rh,{uSrc:T.ldr},{});src=T.ldr2}
 fxPass('up',null,glCanvas.width,glCanvas.height,{uSrc:src},{uSharp:rw<glCanvas.width?1:.35});
 FX.prevVP=FX.m.vp;FX.frame++;FX.reset=false;gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.viewport(0,0,glCanvas.width,glCanvas.height)}
