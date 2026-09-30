/* ===== M6 high-quality lighting on top of the M10 probes/shadow:
   - GGX-prefiltered specular cubemaps (split-sum, analytic env-BRDF) from the two captured facility probes
   - diffuse irradiance as 3rd-order SH (9 coefficients per probe) projected on the CPU from the probe mip
   - cascaded shadow maps (3 cascades in one atlas) with rotated Poisson PCF, PCSS on HIGH+
   - clear-coat lobe for the vehicle body, Fresnel (IOR 1.5) glass
   LOW keeps the M10 single shadow map (static, low cost). ===== */
const HQ={ok:false,err:null,gen:-1,pref:[],sh:[],csm:null,csmSize:0,csmKey:'',lightDir:norm([-.2,1,.12])};
const HQ_PREFILTER=`#version 300 es
precision highp float;uniform samplerCube uSrc;uniform int uFace;uniform float uRough,uSize,uSrcSize;out vec4 o;
vec3 dirOf(vec2 st){vec2 c=st*2.-1.;if(uFace==0)return normalize(vec3(1.,-c.y,-c.x));if(uFace==1)return normalize(vec3(-1.,-c.y,c.x));if(uFace==2)return normalize(vec3(c.x,1.,c.y));if(uFace==3)return normalize(vec3(c.x,-1.,-c.y));if(uFace==4)return normalize(vec3(c.x,-c.y,1.));return normalize(vec3(-c.x,-c.y,-1.));}
float rad(uint b){b=(b<<16u)|(b>>16u);b=((b&0x55555555u)<<1u)|((b&0xAAAAAAAAu)>>1u);b=((b&0x33333333u)<<2u)|((b&0xCCCCCCCCu)>>2u);b=((b&0x0F0F0F0Fu)<<4u)|((b&0xF0F0F0F0u)>>4u);b=((b&0x00FF00FFu)<<8u)|((b&0xFF00FF00u)>>8u);return float(b)*2.3283064365386963e-10;}
void main(){vec3 N=dirOf(gl_FragCoord.xy/uSize);if(uRough<.01){o=vec4(textureLod(uSrc,N,0.).rgb,1.);return;}
 vec3 up=abs(N.y)<.999?vec3(0,1,0):vec3(1,0,0),T=normalize(cross(up,N)),B=cross(N,T);float a=uRough*uRough;vec3 acc=vec3(0.);float w=0.;
 for(uint i=0u;i<96u;i++){vec2 xi=vec2(float(i)/96.,rad(i));float ph=6.2831853*xi.x,ct=sqrt((1.-xi.y)/(1.+(a*a-1.)*xi.y)),st=sqrt(1.-ct*ct);vec3 H=normalize(T*cos(ph)*st+B*sin(ph)*st+N*ct);vec3 L=2.*dot(N,H)*H-N;float nl=dot(N,L);
  if(nl>0.){float d=(ct*ct*(a*a-1.)+1.),D=a*a/(3.14159*d*d),pdf=D*.25;float sa=1./(96.*pdf+1e-5),sp=4.*3.14159/(6.*uSrcSize*uSrcSize);float lod=max(.5*log2(sa/sp)+1.,0.);acc+=textureLod(uSrc,L,lod).rgb*nl;w+=nl;}}
 o=vec4(acc/max(w,1e-4),1.);}`;
function hqPrefilter(src,size){const levels=Math.floor(Math.log2(size))-1,t=gl.createTexture();gl.bindTexture(gl.TEXTURE_CUBE_MAP,t);gl.texStorage2D(gl.TEXTURE_CUBE_MAP,levels,gl.RGBA16F,size,size);
 gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_MAG_FILTER,gl.LINEAR);for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R])gl.texParameteri(gl.TEXTURE_CUBE_MAP,p,gl.CLAMP_TO_EDGE);
 const p=HQ.prefProg,f=gl.createFramebuffer();gl.useProgram(p);gl.bindVertexArray(LIVE.vao||(LIVE.vao=gl.createVertexArray()));gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.bindFramebuffer(gl.FRAMEBUFFER,f);
 gl.activeTexture(gl.TEXTURE8);gl.bindTexture(gl.TEXTURE_CUBE_MAP,src);gl.uniform1i(liveU(p,'uSrc'),8);gl.uniform1f(liveU(p,'uSrcSize'),size);
 for(let m=0;m<levels;m++){const s=size>>m;for(let fc=0;fc<6;fc++){gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_CUBE_MAP_POSITIVE_X+fc,t,m);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);gl.viewport(0,0,s,s);
  gl.uniform1i(liveU(p,'uFace'),fc);gl.uniform1f(liveU(p,'uRough'),m/(levels-1));gl.uniform1f(liveU(p,'uSize'),s);gl.drawArrays(gl.TRIANGLES,0,3)}}
 gl.deleteFramebuffer(f);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0);gl.enable(gl.DEPTH_TEST);HQ.prefLevels=levels;return t}
/* SH9 radiance projection from a probe cubemap level (RGBA8, values are capture radiance/8) */
function hqSH(cube,size){const lvl=Math.max(0,Math.round(Math.log2(size/16))),s=size>>lvl,f=gl.createFramebuffer(),px=new Uint8Array(s*s*4),L=Array.from({length:9},()=>[0,0,0]);let wsum=0;
 gl.bindFramebuffer(gl.FRAMEBUFFER,f);
 for(let fc=0;fc<6;fc++){gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_CUBE_MAP_POSITIVE_X+fc,cube,lvl);gl.readPixels(0,0,s,s,gl.RGBA,gl.UNSIGNED_BYTE,px);
  for(let y=0;y<s;y++)for(let x=0;x<s;x++){const u=2*(x+.5)/s-1,v=2*(y+.5)/s-1;let d=[[1,-v,-u],[-1,-v,u],[u,1,v],[u,-1,-v],[u,-v,1],[-u,-v,-1]][fc];const l=Math.hypot(...d);d=d.map(c=>c/l);
   const w=4/((1+u*u+v*v)**1.5),[X,Y,Z]=d,Yb=[.282095,.488603*Y,.488603*Z,.488603*X,1.092548*X*Y,1.092548*Y*Z,.315392*(3*Z*Z-1),1.092548*X*Z,.546274*(X*X-Y*Y)],o=(y*s+x)*4,c=[px[o]/255*8,px[o+1]/255*8,px[o+2]/255*8];
   for(let k=0;k<9;k++)for(let ch=0;ch<3;ch++)L[k][ch]+=c[ch]*Yb[k]*w;wsum+=w}}
 gl.deleteFramebuffer(f);gl.bindFramebuffer(gl.FRAMEBUFFER,null);const norm4=4*Math.PI/wsum;return L.map(c=>c.map(v=>v*norm4))}
function hqInit(){HQ.ok=false;try{if(!lighting||!lighting.probes)throw Error('M10 probes missing');
  if(!gl.getExtension('EXT_color_buffer_float'))throw Error('float targets missing');
  HQ.prefProg=liveCompile(HQ_PREFILTER);const size=M10_SETTINGS.probeSize;
  HQ.pref.forEach(t=>gl.deleteTexture(t));HQ.pref=lighting.probes.map(p=>hqPrefilter(p,size));HQ.sh=lighting.probes.map(p=>hqSH(p,size));
  for(const n of ['pref0','pref1','hq','sh0','sh1','csmMap','csmVP','csmSplit','csmOn','pcss','csmTexel','camFwd','clearcoat','prefLod','ambK'])loc[n]=gl.getUniformLocation(program,'u_'+n);
  /* energy match: diffuse ambient keeps the M10 brightness at an upward normal, SH supplies direction and colour */
  const E=hqIrr(HQ.sh[0],[0,1,0]),lum=(.2126*E[0]+.7152*E[1]+.0722*E[2])/Math.PI;HQ.ambK=Math.min(4,Math.max(.25,.40*.85/Math.max(lum,1e-4)));
  HQ.gen=runtimeGeneration;HQ.ok=true;FX.shadow=true}catch(e){HQ.err=String(e?.message||e);HQ.ok=false}
 finally{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,glCanvas.width,glCanvas.height)}}
/* ---- cascaded shadows ---- */
function hqCsmAlloc(S){if(HQ.csm&&HQ.csmSize===S)return;if(HQ.csm){gl.deleteTexture(HQ.csm);gl.deleteFramebuffer(HQ.csmF)}const maxT=gl.getParameter(gl.MAX_TEXTURE_SIZE);S=Math.min(S,Math.floor(maxT/3));
 HQ.csm=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,HQ.csm);gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,S*3,S,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.NEAREST);for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);
 HQ.csmF=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,HQ.csmF);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,HQ.csm,0);gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);HQ.csmSize=S;gl.bindFramebuffer(gl.FRAMEBUFFER,null)}
function hqCsm(){const lvl=PERF.set.shadow|0;HQ.csmOn=HQ.ok&&lvl>=2;if(!HQ.csmOn)return;const S=lvl>=3?2048:1536;hqCsmAlloc(S);
 const eye=camera.eye,fwd=norm(sub(camera.target,eye)),upv=norm(cross(cross(fwd,camera.up),fwd)),right=norm(cross(fwd,upv)),n=Math.max(.05,camera.near),f=Math.min(camera.far,40),asp=glCanvas.width/glCanvas.height,th=Math.tan(camera.fov*Math.PI/360);
 const split=[n];for(let i=1;i<=3;i++){const a=n*Math.pow(f/n,i/3),b=n+(f-n)*i/3;split.push(.8*a+.2*b)}
 const L=HQ.lightDir,VP=[],texel=[];
 for(let i=0;i<3;i++){const d0=split[i],d1=split[i+1],pts=[];for(const d of [d0,d1])for(const sx of [-1,1])for(const sy of [-1,1])pts.push(eye.map((e,k)=>e+fwd[k]*d+right[k]*sx*d*th*asp+upv[k]*sy*d*th));
  const c=[0,1,2].map(k=>pts.reduce((a,p)=>a+p[k],0)/8);let r=0;for(const p of pts)r=Math.max(r,Math.hypot(p[0]-c[0],p[1]-c[1],p[2]-c[2]));r=Math.ceil(r*16)/16;
  const lv=lookAt(c.map((v,k)=>v+L[k]*40),c,[0,0,-1]),tw=2*r/S;/* texel snapping (stable cascades) */const lc=m4point(lv,c);const sx=Math.round(lc[0]/tw)*tw-lc[0],sy=Math.round(lc[1]/tw)*tw-lc[1];
  const pr=ortho(-r+sx,r+sx,-r+sy,r+sy,1,90);VP.push(matMul(pr,lv));texel.push(tw)}
 const key=JSON.stringify([VP.map(m=>Array.from(m).map(v=>+v.toFixed(5))),rollingState.wheelAngles]);HQ.csmVP=VP;HQ.csmSplit=[split[1],split[2],split[3]];HQ.csmTexel=texel;
 if(key===HQ.csmKey)return;HQ.csmKey=key;
 gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,null);gl.activeTexture(gl.TEXTURE0);
 gl.bindFramebuffer(gl.FRAMEBUFFER,HQ.csmF);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.viewport(0,0,S*3,S);gl.clear(gl.DEPTH_BUFFER_BIT);gl.useProgram(lighting.depthProgram);
 const id=identityMatrix(),draw=(mesh,m,vp)=>{gl.uniformMatrix4fv(lighting.depthMVP,false,matMul(vp,m));gl.bindBuffer(gl.ARRAY_BUFFER,mesh.pb);gl.enableVertexAttribArray(lighting.depthPos);gl.vertexAttribPointer(lighting.depthPos,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.ib);gl.drawElements(gl.TRIANGLES,mesh.count,mesh.type,0)};
 for(let i=0;i<3;i++){gl.viewport(i*S,0,S,S);const vp=VP[i];
  for(const o of scene.objects)if(o.visible&&o.gpu&&o.material!=='glass'&&o.center[1]+o.size[1]/2<3.5)draw(o.gpu,id,vp);
  for(const r of scene.roadParts)if(r.gpu)draw(r.gpu,rollerModel(r,rollingState.rollerAngles[scene.roadParts.indexOf(r)]||0),vp);
  for(const p of scene.vehicleParts)if(p.gpu){const k=wheelParts().indexOf(p);draw(p.gpu,k<0?vehicleModel():wheelModel(p,rollingState.wheelAngles[k]||0),vp)}
  const B=window.__BODY;if(B&&B.active&&!fpv.enabled&&B.parts){const a=-B.yaw,cc=Math.cos(a),ss=Math.sin(a),M=new Float64Array([cc,0,-ss,0,0,1,0,0,ss,0,cc,0,B.x,B.g,B.z,1]);for(const g of B.parts)draw(g,M,vp)}}
 gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,glCanvas.width,glCanvas.height)}
function hqBind(capture){if(!loc.hq)return;const on=HQ.ok&&!capture&&HQ.gen===runtimeGeneration;gl.uniform1f(loc.hq,on?1:0);if(!on){gl.uniform1f(loc.csmOn,0);for(const u of [4,5]){gl.activeTexture(gl.TEXTURE0+u);gl.bindTexture(gl.TEXTURE_CUBE_MAP,lighting.dummy)}gl.activeTexture(gl.TEXTURE0);return}
 gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_CUBE_MAP,HQ.pref[0]);gl.uniform1i(loc.pref0,4);gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_CUBE_MAP,HQ.pref[1]);gl.uniform1i(loc.pref1,5);
 gl.uniform3fv(loc.sh0,HQ.sh[0].flat());gl.uniform3fv(loc.sh1,HQ.sh[1].flat());gl.uniform1f(loc.prefLod,HQ.prefLevels-1);gl.uniform1f(loc.ambK,HQ.ambK);
 const csm=!!HQ.csmOn&&!!HQ.csmVP;gl.uniform1f(loc.csmOn,csm?1:0);if(csm){gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,HQ.csm);gl.uniform1i(loc.csmMap,6);const a=new Float32Array(48);HQ.csmVP.forEach((m,i)=>a.set(m,i*16));gl.uniformMatrix4fv(loc.csmVP,false,a);
  gl.uniform3f(loc.csmSplit,...HQ.csmSplit);gl.uniform3f(loc.csmTexel,...HQ.csmTexel);gl.uniform1f(loc.pcss,(PERF.set.shadow|0)>=3?1:0)}
 const fwd=norm(sub(camera.target,camera.eye));gl.uniform3f(loc.camFwd,...fwd);gl.activeTexture(gl.TEXTURE0)}
function hqIrr(L,n){const c1=.429043,c2=.511664,c3=.743125,c4=.886227,c5=.247708,[x,y,z]=n;return [0,1,2].map(ch=>c1*L[8][ch]*(x*x-y*y)+c3*L[6][ch]*z*z+c4*L[0][ch]-c5*L[6][ch]+2*c1*(L[4][ch]*x*y+L[7][ch]*x*z+L[5][ch]*y*z)+2*c2*(L[3][ch]*x+L[1][ch]*y+L[2][ch]*z))}
