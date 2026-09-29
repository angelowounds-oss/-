/* AETHER LIVE CFD: real-time GPU incompressible flow (collocated grid, semi-Lagrangian advection,
   Jacobi pressure projection, vorticity confinement) + passive-scalar smoke with MacCormack transport. */
const LIVE={ok:false,err:null,enabled:true,init:false,gen:-1,q:null,N:null,step:0,t:0,U:5,mode:'RAKE_V',wand:false,colorMode:true,
 vortEps:.35,jacobi:32,sub:2,dens:6,speedAt:0,lastRead:0,lastT:0,emitters:[],stats:{}};
window.__LIVE=LIVE;window.__AETHER_DEBUG={get fpv(){return fpv},get camera(){return camera},get body(){return window.__BODY}};
const LIVE_Q={LOW:[112,36,52],HIGH:[176,56,80]};
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
copy:`uniform sampler2D uVel,uDye;uniform int uLayer;
void main(){ivec3 c=ivec3(ivec2(gl_FragCoord.xy),uLayer);int t=ST(c);vec3 u=F(uVel,c).xyz;o=vec4(t>0?0.:F(uDye,c).x,(t==1||t==3)?1.:(t==2?.6:0.),length(u)/max(uU,.1),1);}`};
const LIVE_RAY=`#version 300 es
precision highp float;precision highp sampler3D;
uniform sampler3D uVol;uniform mat4 uInv;uniform vec3 uEye,uBMin,uBMax;uniform vec2 uRes;uniform float uDens,uCMode;out vec4 o;
vec3 turbo(float t){t*=4.;vec3 a=vec3(.10,.18,1.),b=vec3(0.,.8,1.),c=vec3(.05,1.,.3),d=vec3(1.,.92,.05),e=vec3(1.,.12,.05);return t<1.?mix(a,b,t):t<2.?mix(b,c,t-1.):t<3.?mix(c,d,t-2.):mix(d,e,min(t-3.,1.));}
void main(){vec2 n=gl_FragCoord.xy/uRes*2.-1.;vec4 a=uInv*vec4(n,-1,1),b=uInv*vec4(n,1,1);vec3 ro=uEye,rd=normalize(b.xyz/b.w-a.xyz/a.w);
 vec3 iv=1./rd,t0=(uBMin-ro)*iv,t1=(uBMax-ro)*iv,mn=min(t0,t1),mx=max(t0,t1);float tn=max(max(mn.x,mn.y),max(mn.z,0.)),tf=min(min(mx.x,mx.y),mx.z);
 if(ro.z>3.84){if(rd.z>=0.)discard;float tw=(3.9-ro.z)/rd.z;vec3 q=ro+rd*tw;bool win=q.x>-3.5&&q.x<2.3&&q.y>.95&&q.y<3.05,door=q.x>2.3&&q.x<3.5&&q.y>.75&&q.y<2.95;if(!win&&!door)discard;tn=max(tn,(3.83-ro.z)/rd.z);}
 if(tf<=tn)discard;float L=tf-tn;int NS=int(clamp(L/.07,12.,160.));float dt=L/float(NS),j=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453);
 vec3 ext=uBMax-uBMin;vec4 acc=vec4(0);
 for(int i=0;i<160;i++){if(i>=NS||acc.a>.985)break;vec3 p=ro+rd*(tn+(float(i)+j)*dt),uvw=(p-uBMin)/ext;vec4 s=texture(uVol,uvw);if(s.g>.55)break;float d=s.r*uDens;if(d<.003)continue;
  float sh=texture(uVol,uvw+vec3(0.,.16/ext.y,0.)).r;float lit=.5+.5*exp(-sh*uDens*.8);
  vec3 col=mix(vec3(.86,.92,1.),turbo(clamp(.5+(s.b-1.)*1.25,0.,1.)),uCMode)*lit;float al=1.-exp(-d*dt*8.);acc.rgb+=(1.-acc.a)*al*col;acc.a+=(1.-acc.a)*al;}
 if(acc.a<.004)discard;o=acc;}`;
function liveCompile(fs,vs=LIVE_VS){const mk=(t,s)=>{const sh=gl.createShader(t);gl.shaderSource(sh,s);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error('LIVE_SHADER '+gl.getShaderInfoLog(sh));return sh};
 const p=gl.createProgram(),a=mk(gl.VERTEX_SHADER,vs),b=mk(gl.FRAGMENT_SHADER,fs);gl.attachShader(p,a);gl.attachShader(p,b);gl.linkProgram(p);gl.deleteShader(a);gl.deleteShader(b);
 if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error('LIVE_LINK '+gl.getProgramInfoLog(p));p._u={};return p}
function liveU(p,n){if(!(n in p._u))p._u[n]=gl.getUniformLocation(p,n);return p._u[n]}
function liveTarget(w,h,ifmt,fmt,type){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);
 gl.texImage2D(gl.TEXTURE_2D,0,ifmt,w,h,0,fmt,type,null);const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);
 if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('LIVE_FBO_INCOMPLETE');return {t,f}}
function liveVoxelize(N,min,h,fanB){const [nx,ny,nz]=N,tot=nx*ny*nz,shell=new Uint8Array(tot),idx=(i,j,k)=>i+nx*(j+ny*k),hm=Math.min(...h)*.45,t0=performance.now();
 for(const part of m12SolidParts()){const M=part.modelMatrix,P=part.positions,I=part.indices,V=new Float32Array(P.length);
  for(let i=0;i<P.length;i+=3){const q=m4point(M,[P[i],P[i+1],P[i+2]]);V[i]=q[0];V[i+1]=q[1];V[i+2]=q[2]}
  for(let t=0;t<I.length;t+=3){const a=I[t]*3,b=I[t+1]*3,c=I[t+2]*3,ax=V[a],ay=V[a+1],az=V[a+2],ex=V[b]-ax,ey=V[b+1]-ay,ez=V[b+2]-az,fx=V[c]-ax,fy=V[c+1]-ay,fz=V[c+2]-az;
   const n=Math.max(1,Math.ceil(Math.max(Math.hypot(ex,ey,ez),Math.hypot(fx,fy,fz),Math.hypot(fx-ex,fy-ey,fz-ez))/hm));
   for(let u=0;u<=n;u++)for(let v=0;v<=n-u;v++){const s=u/n,r=v/n,x=ax+ex*s+fx*r,y=ay+ey*s+fy*r,z=az+ez*s+fz*r,i=Math.floor((x-min[0])/h[0]),j=Math.floor((y-min[1])/h[1]),k=Math.floor((z-min[2])/h[2]);
    if(i>=0&&j>=0&&k>=0&&i<nx&&j<ny&&k<nz)shell[idx(i,j,k)]=1}}}
 const ext=new Uint8Array(tot),st=new Int32Array(tot);let sp=0;const push=q=>{if(!shell[q]&&!ext[q]){ext[q]=1;st[sp++]=q}};
 for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)if(i===0||j===0||k===0||i===nx-1||j===ny-1||k===nz-1)push(idx(i,j,k));
 while(sp){const q=st[--sp],i=q%nx,j=((q/nx)|0)%ny,k=(q/(nx*ny))|0;if(i>0)push(q-1);if(i<nx-1)push(q+1);if(j>0)push(q-nx);if(j<ny-1)push(q+nx);if(k>0)push(q-nx*ny);if(k<nz-1)push(q+nx*ny)}
 const type=new Uint8Array(tot);let car=0,fan=0;for(let q=0;q<tot;q++)if(!ext[q]){type[q]=1;car++}
 if(fanB)for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const x=min[0]+(i+.5)*h[0],y=min[1]+(j+.5)*h[1],z=min[2]+(k+.5)*h[2];
  if(x>=fanB.min[0]&&x<=fanB.max[0]&&y>=fanB.min[1]&&y<=fanB.max[1]&&z>=fanB.min[2]&&z<=fanB.max[2]){const q=idx(i,j,k);if(!type[q]){type[q]=2;fan++}}}
 return {type,car,fan,ms:performance.now()-t0}}
function liveInit(){LIVE.init=true;LIVE.ok=false;LIVE.gen=runtimeGeneration;try{
 const cbf=gl.getExtension('EXT_color_buffer_float');if(!cbf)throw Error('EXT_color_buffer_float 미지원 기기');
 const q=(location.hash.match(/q=(LOW|HIGH)/)||[])[1]||((window.matchMedia&&matchMedia('(pointer:coarse)').matches)?'LOW':'HIGH');LIVE.q=q;const N=LIVE_Q[q];LIVE.N=N;
 const b=CFD_DOMAIN_CONTRACT.bounds,min=Array.from(b.min),max=Array.from(b.max),h=max.map((v,i)=>(v-min[i])/N[i]);LIVE.min=min;LIVE.max=max;LIVE.h=h;
 const maxTex=gl.getParameter(gl.MAX_TEXTURE_SIZE);let tx=Math.ceil(Math.sqrt(N[2]*N[1]/N[0]));tx=Math.min(tx,Math.floor(maxTex/N[0]));const ty=Math.ceil(N[2]/tx);LIVE.tx=tx;LIVE.W=N[0]*tx;LIVE.H=N[1]*ty;
 const fanB=AETHER.FAN_MODULE?.layout?.fanBounds||null;LIVE.fanKey=JSON.stringify(fanB);const vox=liveVoxelize(N,min,h,fanB);LIVE.vox={car:vox.car,fan:vox.fan,ms:Math.round(vox.ms)};
 const obs=new Uint8Array(LIVE.W*LIVE.H*4);for(let k=0;k<N[2];k++)for(let j=0;j<N[1];j++)for(let i=0;i<N[0];i++){const t=vox.type[i+N[0]*(j+N[1]*k)];if(!t)continue;const ax=(k%tx)*N[0]+i,ay=Math.floor(k/tx)*N[1]+j,o=(ay*LIVE.W+ax)*4;obs[o+(t===1?0:1)]=255;obs[o+3]=255}
 LIVE.obs=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,LIVE.obs);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,LIVE.W,LIVE.H,0,gl.RGBA,gl.UNSIGNED_BYTE,obs);
 const W=LIVE.W,H=LIVE.H,V=()=>liveTarget(W,H,gl.RGBA32F,gl.RGBA,gl.FLOAT),R=()=>liveTarget(W,H,gl.R32F,gl.RED,gl.FLOAT);
 LIVE.tex={velA:V(),velB:V(),curl:V(),pA:R(),pB:R(),div:R(),dyeA:R(),dyeB:R(),hat:R(),bar:R(),flags:liveTarget(W,H,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE)};
 LIVE.vol=gl.createTexture();gl.bindTexture(gl.TEXTURE_3D,LIVE.vol);for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_R,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_3D,k,v);
 gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA16F,N[0],N[1],N[2],0,gl.RGBA,gl.HALF_FLOAT,null);LIVE.volFbo=gl.createFramebuffer();
 LIVE.prog={};for(const k in LIVE_FS)LIVE.prog[k]=liveCompile(LIVE_H+LIVE_FS[k]);LIVE.prog.ray=liveCompile(LIVE_RAY);LIVE.vao=gl.createVertexArray();
 LIVE.ok=true;LIVE.err=null;LIVE.step=0;LIVE.t=0;livePasses(0,true);
}catch(e){LIVE.ok=false;LIVE.err=String(e?.message||e)}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,glCanvas.width,glCanvas.height);gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0)}}
function livePass(name,out,tex,uni){const p=LIVE.prog[name],N=LIVE.N;gl.useProgram(p);gl.bindFramebuffer(gl.FRAMEBUFFER,out.f);gl.viewport(0,0,LIVE.W,LIVE.H);
 gl.uniform3i(liveU(p,'uN'),N[0],N[1],N[2]);gl.uniform1i(liveU(p,'uTX'),LIVE.tx);gl.uniform3f(liveU(p,'uMin'),...LIVE.min);gl.uniform3f(liveU(p,'uH'),...LIVE.h);gl.uniform1f(liveU(p,'uU'),LIVE.U);gl.uniform3f(liveU(p,'uBodyV'),...LIVE.bodyV);
 let unit=8;const bind=(n,t)=>{gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(liveU(p,n),unit);unit++};bind('uFlags',LIVE.tex.flags.t);for(const n in tex)bind(n,tex[n]);
 for(const n in uni){const v=uni[n],l=liveU(p,n);if(l===null)continue;if(Array.isArray(v)){if(v.length===4)gl.uniform4f(l,...v);else if(v.length===3)gl.uniform3f(l,...v)}else if(v&&v.int!==undefined)gl.uniform1i(l,v.int);else if(v instanceof Float32Array)gl.uniform4fv(l,v);else gl.uniform1f(l,v)}
 gl.drawArrays(gl.TRIANGLES,0,3)}
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
 livePass('div',T.div,{uVel:T.velA.t},{});for(let k=0;k<LIVE.jacobi;k++){livePass('jac',T.pB,{uP:T.pA.t,uDiv:T.div.t},{});liveSwap('pA','pB')}
 livePass('proj',T.velB,{uVel:T.velA.t,uP:T.pA.t},{});liveSwap('velA','velB');
 livePass('advd',T.hat,{uVel:T.velA.t,uSrc:T.dyeA.t},{uDt:dt});livePass('advd',T.bar,{uVel:T.velA.t,uSrc:T.hat.t},{uDt:-dt});
 livePass('corr',T.dyeB,{uVel:T.velA.t,uSrc:T.dyeA.t,uHat:T.hat.t,uBar:T.bar.t},{uDt:dt,uDecay:.9985,uEmS:1,uEm:em,uEmN:{int:LIVE.emitters.length}});liveSwap('dyeA','dyeB');
 LIVE.step++;LIVE.t+=dt}
function liveCopyVolume(){const p=LIVE.prog.copy,N=LIVE.N,T=LIVE.tex;gl.useProgram(p);gl.bindFramebuffer(gl.FRAMEBUFFER,LIVE.volFbo);gl.viewport(0,0,N[0],N[1]);
 gl.uniform3i(liveU(p,'uN'),N[0],N[1],N[2]);gl.uniform1i(liveU(p,'uTX'),LIVE.tx);gl.uniform3f(liveU(p,'uMin'),...LIVE.min);gl.uniform3f(liveU(p,'uH'),...LIVE.h);gl.uniform1f(liveU(p,'uU'),LIVE.U);
 const bind=(u,n,t)=>{gl.activeTexture(gl.TEXTURE0+u);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(liveU(p,n),u)};bind(8,'uFlags',T.flags.t);bind(9,'uVel',T.velA.t);bind(10,'uDye',T.dyeA.t);
 for(let k=0;k<N[2];k++){gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,LIVE.vol,0,k);gl.uniform1i(liveU(p,'uLayer'),k);gl.drawArrays(gl.TRIANGLES,0,3)}}
function liveRead(x,y,z){const N=LIVE.N,i=Math.min(N[0]-1,Math.max(0,Math.floor((x-LIVE.min[0])/LIVE.h[0]))),j=Math.min(N[1]-1,Math.max(0,Math.floor((y-LIVE.min[1])/LIVE.h[1]))),k=Math.min(N[2]-1,Math.max(0,Math.floor((z-LIVE.min[2])/LIVE.h[2])));
 const ax=(k%LIVE.tx)*N[0]+i,ay=Math.floor(k/LIVE.tx)*N[1]+j,buf=new Float32Array(4);gl.bindFramebuffer(gl.FRAMEBUFFER,LIVE.tex.velA.f);gl.readPixels(ax,ay,1,1,gl.RGBA,gl.FLOAT,buf);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return [buf[0],buf[1],buf[2]]}
function liveStep(now){if(!LIVE.enabled)return;if(!LIVE.init||LIVE.gen!==runtimeGeneration)liveInit();if(!LIVE.ok)return;if(now-(LIVE.lastFanCheck||0)>1000){LIVE.lastFanCheck=now;const fb=AETHER.FAN_MODULE?.layout?.fanBounds||null;if(JSON.stringify(fb)!==LIVE.fanKey)liveReobstacle(fb)}
 try{smokeState.enabled=false;const fdt=LIVE.lastT?Math.min(.05,(now-LIVE.lastT)/1000):1/60;LIVE.lastT=now;
  const hmin=Math.min(...LIVE.h),cfl=.9*hmin/(1.6*Math.max(LIVE.U,.5)),n=LIVE.step<40?6:LIVE.sub,dt=Math.min(cfl,Math.max(fdt,1/60)/LIVE.sub);
  for(let s=0;s<n;s++)livePasses(dt);liveCopyVolume();
  if(now-LIVE.lastRead>250){LIVE.lastRead=now;const B=window.__BODY;if(B&&B.active){const v=liveRead(B.x,B.g+1.2,B.z);LIVE.speedAt=Math.hypot(...v);LIVE.vAt=v}}
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
function liveRender(vp){if(!LIVE.enabled||!LIVE.ok)return;const p=LIVE.prog.ray,dep=gl.isEnabled(gl.DEPTH_TEST),cull=gl.isEnabled(gl.CULL_FACE);try{
 gl.useProgram(p);gl.bindVertexArray(LIVE.vao);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
 gl.activeTexture(gl.TEXTURE0+8);gl.bindTexture(gl.TEXTURE_3D,LIVE.vol);gl.uniform1i(liveU(p,'uVol'),8);gl.uniformMatrix4fv(liveU(p,'uInv'),false,liveInv(vp));
 gl.uniform3f(liveU(p,'uEye'),...camera.eye);gl.uniform3f(liveU(p,'uBMin'),...LIVE.min);gl.uniform3f(liveU(p,'uBMax'),...LIVE.max);gl.uniform2f(liveU(p,'uRes'),glCanvas.width,glCanvas.height);
 gl.uniform1f(liveU(p,'uDens'),LIVE.dens);gl.uniform1f(liveU(p,'uCMode'),LIVE.colorMode?1:0);gl.drawArrays(gl.TRIANGLES,0,3);
}catch(e){LIVE.err='render: '+String(e?.message||e)}finally{gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0);if(dep)gl.enable(gl.DEPTH_TEST);if(cull)gl.enable(gl.CULL_FACE);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA)}}
LIVE.api={read:(x,y,z)=>{const v=liveRead(x,y,z);return v},
 divStats(){const T=LIVE.tex,W=LIVE.W,H=LIVE.H;gl.bindVertexArray(LIVE.vao);livePass('div',T.div,{uVel:T.velA.t},{});const buf=new Float32Array(W*H*4);gl.bindFramebuffer(gl.FRAMEBUFFER,T.div.f);gl.readPixels(0,0,W,H,gl.RGBA,gl.FLOAT,buf);
  const fb=new Uint8Array(W*H*4);gl.bindFramebuffer(gl.FRAMEBUFFER,T.flags.f);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,fb);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null);
  let s=0,m=0,n=0;for(let i=0;i<W*H;i++){if(fb[i*4]>10)continue;const d=Math.abs(buf[i*4]);s+=d*d;m=Math.max(m,d);n++}const ref=LIVE.U/Math.min(...LIVE.h);return {rms:Math.sqrt(s/n),max:m,cells:n,relRms:Math.sqrt(s/n)/ref,relMax:m/ref}},
 dyeSum(){const T=LIVE.tex,W=LIVE.W,H=LIVE.H,buf=new Float32Array(W*H*4);gl.bindFramebuffer(gl.FRAMEBUFFER,T.dyeA.f);gl.readPixels(0,0,W,H,gl.RGBA,gl.FLOAT,buf);gl.bindFramebuffer(gl.FRAMEBUFFER,null);let s=0,c=0;for(let i=0;i<W*H;i++){s+=buf[i*4];if(buf[i*4]>.05)c++}return {sum:s,cells:c}}};

function liveReobstacle(fanB){try{const N=LIVE.N,vox=liveVoxelize(N,LIVE.min,LIVE.h,fanB);LIVE.fanKey=JSON.stringify(fanB);LIVE.vox={car:vox.car,fan:vox.fan,ms:Math.round(vox.ms)};const obs=new Uint8Array(LIVE.W*LIVE.H*4);
 for(let k=0;k<N[2];k++)for(let j=0;j<N[1];j++)for(let i=0;i<N[0];i++){const t=vox.type[i+N[0]*(j+N[1]*k)];if(!t)continue;const ax=(k%LIVE.tx)*N[0]+i,ay=Math.floor(k/LIVE.tx)*N[1]+j,o=(ay*LIVE.W+ax)*4;obs[o+(t===1?0:1)]=255;obs[o+3]=255}
 gl.bindTexture(gl.TEXTURE_2D,LIVE.obs);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,LIVE.W,LIVE.H,0,gl.RGBA,gl.UNSIGNED_BYTE,obs)}catch(e){LIVE.err='reobstacle: '+e.message}}
LIVE.setEnabled=v=>{LIVE.enabled=!!v;smokeState.enabled=!(LIVE.enabled&&LIVE.ok)};
