let gl,program,loc={},buffers=[],textures=[],whiteTexture=null,raf=0,runtimeGeneration=0;const cubeIdx=new Uint16Array([0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,3,2,6,3,6,7,1,5,6,1,6,2,0,3,7,0,7,4]);const vert=`#version 300 es
 in vec3 a_position;in vec3 a_normal;in vec2 a_uv;uniform mat4 u_mvp;uniform mat4 u_model;out vec3 v_normal;out vec2 v_uv;out vec3 v_world;void main(){v_normal=normalize(transpose(inverse(mat3(u_model)))*a_normal);v_uv=a_uv;v_world=(u_model*vec4(a_position,1.0)).xyz;gl_Position=u_mvp*vec4(a_position,1.0);}`;const frag=`#version 300 es
precision highp float;
uniform vec4 u_eye,u_surface,u_color;uniform float u_alpha,u_useTex,u_beltSurface,u_beltTravel,u_rollerSurface,u_colorLinear;uniform sampler2D u_tex;
in vec3 v_normal;in vec2 v_uv;in vec3 v_world;layout(location=0) out vec4 outColor;layout(location=1) out vec4 outAmb;
uniform samplerCube u_env0,u_env1;uniform highp sampler2D u_shadowMap;
uniform mat4 u_lightVP;uniform float u_capture,u_shadowEnabled,u_exposure,u_hdrOut;
uniform samplerCube u_pref0,u_pref1;uniform highp sampler2D u_csmMap;uniform mat4 u_csmVP[3];uniform vec3 u_csmSplit,u_csmTexel,u_camFwd,u_sh0[9],u_sh1[9];uniform float u_hq,u_csmOn,u_pcss,u_clearcoat,u_prefLod,u_ambK,u_vatlas,u_vdebug;
/* vehicle texture atlas: 5x4 tiles of 512 px (row 0 = top of the source image). Per tile: roughness, metalness, clear coat, glass.
   Assigned by inspecting the atlas and verified on the model with #vtile=1 (body = tile (4,0) black paint, wing = carbon (4,3), rims = (2,0)). */
const vec4 VT[20]=vec4[20](
 vec4(.86,0.,0.,0.),vec4(.42,.25,1.,0.),vec4(.3,.92,0.,0.),vec4(.84,0.,0.,0.),vec4(.2,.05,1.,0.),
 vec4(.34,0.,1.,0.),vec4(.62,.35,0.,0.),vec4(.82,.1,0.,0.),vec4(.26,.35,1.,0.),vec4(.5,.35,.5,0.),
 vec4(.04,0.,1.,1.),vec4(.12,.55,1.,0.),vec4(.9,0.,0.,0.),vec4(.28,.45,1.,0.),vec4(.3,.45,1.,0.),
 vec4(.7,0.,0.,0.),vec4(.6,0.,0.,0.),vec4(.6,0.,0.,0.),vec4(.6,0.,0.,0.),vec4(.3,.15,1.,0.));
vec3 shIrr(vec3 n,vec3 L[9]){const float c1=.429043,c2=.511664,c3=.743125,c4=.886227,c5=.247708;
 return c1*L[8]*(n.x*n.x-n.y*n.y)+c3*L[6]*n.z*n.z+c4*L[0]-c5*L[6]+2.*c1*(L[4]*n.x*n.y+L[7]*n.x*n.z+L[5]*n.y*n.z)+2.*c2*(L[3]*n.x+L[1]*n.y+L[2]*n.z);}
vec3 envBRDF(vec3 F0,float r,float nv){const vec4 c0=vec4(-1.,-.0275,-.572,.022),c1=vec4(1.,.0425,1.04,-.04);vec4 q=r*c0+c1;float a=min(q.x*q.x,exp2(-9.28*nv))*q.x+q.y;vec2 AB=vec2(-1.04,1.04)*a+q.zw;return F0*AB.x+AB.y;}
const vec2 POIS[16]=vec2[16](vec2(-.94201624,-.39906216),vec2(.94558609,-.76890725),vec2(-.094184101,-.92938870),vec2(.34495938,.29387760),vec2(-.91588581,.45771432),vec2(-.81544232,-.87912464),vec2(-.38277543,.27676845),vec2(.97484398,.75648379),vec2(.44323325,-.97511554),vec2(.53742981,-.47373420),vec2(-.26496911,-.41893023),vec2(.79197514,.19090188),vec2(-.24188840,.99706507),vec2(-.81409955,.91437590),vec2(.19984126,.78641367),vec2(.14383161,-.14100790));
const float PI=3.14159265359;
vec3 linearize(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
vec3 encode(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0)),vec3(1./2.4))-.055,step(vec3(.0031308),c));}
vec3 tonemap(vec3 h){return encode(clamp((h*(2.51*h+.03))/(h*(2.43*h+.59)+.14),0.,1.));}
vec3 boxDirection(vec3 ray,vec3 lo,vec3 hi,vec3 center){
 vec3 safeRay=mix(vec3(-1.),vec3(1.),step(vec3(0.),ray))*max(abs(ray),vec3(.0001));
 vec3 farHit=max((lo-v_world)/safeRay,(hi-v_world)/safeRay);float t=max(0.,min(farHit.x,min(farHit.y,farHit.z)));
 return v_world+ray*t-center;
}
vec3 roomReflection(vec3 ray,float rough){
 if(u_capture>.5)return vec3(0.);
 vec3 a=boxDirection(ray,vec3(-9.,0.,-4.),vec3(9.,5.5,4.),vec3(0.,2.,0.));
 vec3 b=boxDirection(ray,vec3(-4.1,.75,4.),vec3(4.1,4.,9.3),vec3(0.,2.4,7.));
 return mix(textureLod(u_env0,a,rough*7.).rgb,textureLod(u_env1,b,rough*7.).rgb,smoothstep(3.8,4.5,v_world.z))*8.;
}
float shadowVisibility(vec3 n,vec3 l);
vec3 prefReflection(vec3 ray,float rough){
 vec3 a=boxDirection(ray,vec3(-9.,0.,-4.),vec3(9.,5.5,4.),vec3(0.,2.,0.));vec3 b=boxDirection(ray,vec3(-4.1,.75,4.),vec3(4.1,4.,9.3),vec3(0.,2.4,7.));
 float lod=clamp(sqrt(rough)*u_prefLod,0.,u_prefLod);return mix(textureLod(u_pref0,a,lod).rgb,textureLod(u_pref1,b,lod).rgb,smoothstep(3.8,4.5,v_world.z))*8.;}
float csmVis(vec3 n,vec3 l){float d=dot(v_world-u_eye.xyz,u_camFwd);int ci=d<u_csmSplit.x?0:(d<u_csmSplit.y?1:2);if(d>u_csmSplit.z)return shadowVisibility(n,l);
 float tw=ci==0?u_csmTexel.x:(ci==1?u_csmTexel.y:u_csmTexel.z);vec4 p=u_csmVP[ci]*vec4(v_world+n*tw*1.5,1.);vec3 q=p.xyz/p.w*.5+.5;
 if(any(lessThan(q.xy,vec2(0.)))||any(greaterThan(q.xy,vec2(1.)))||q.z>1.)return 1.;
 vec2 ts=1./vec2(textureSize(u_csmMap,0));float x0=float(ci)/3.,x1=float(ci+1)/3.;vec2 base=vec2(x0+q.x/3.,q.y);float bias=.00025+.0009*(1.-max(dot(n,l),0.));
 float ang=6.2831853*fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(.06711056,.00583715))));mat2 R=mat2(cos(ang),sin(ang),-sin(ang),cos(ang));float rad=1.6;
 if(u_pcss>.5){float bz=0.,bn=0.;for(int i=0;i<16;i++){vec2 uv=base+R*POIS[i]*7.*ts;uv.x=clamp(uv.x,x0+ts.x,x1-ts.x);float z=texture(u_csmMap,uv).r;if(z<q.z-bias){bz+=z;bn+=1.;}}
  if(bn<.5)return 1.;bz/=bn;float wWorld=(q.z-bz)*89.*.09;rad=clamp(wWorld/tw,1.,9.);}
 float s=0.;for(int i=0;i<16;i++){vec2 uv=base+R*POIS[i]*rad*ts;uv.x=clamp(uv.x,x0+ts.x,x1-ts.x);s+=step(q.z-bias,texture(u_csmMap,uv).r);}return s/16.;}
float shadowVisibility(vec3 n,vec3 l){
 if(u_shadowEnabled<.5)return 1.;vec4 p=u_lightVP*vec4(v_world,1.);vec3 q=p.xyz/p.w*.5+.5;
 if(any(lessThan(q,vec3(0.)))||any(greaterThan(q,vec3(1.))))return 1.;
 vec2 texel=1./vec2(textureSize(u_shadowMap,0));float bias=max(.00022,.0012*(1.-max(dot(n,l),0.))),sum=0.;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++)sum+=step(q.z-bias,texture(u_shadowMap,q.xy+vec2(x,y)*texel).r);
 return sum/9.;
}
void main(){
 vec3 n=normalize(v_normal),v=normalize(u_eye.xyz-v_world);float nv=max(abs(dot(n,v)),.001);
 if(u_alpha<.99){
  if(abs(n.z)<.99)discard;
  // Single optical surface preserves visibility; reflection comes only from facility captures.
  float f=.04+.96*pow(1.-nv,5.);
  vec3 reflected=roomReflection(reflect(-v,n),.08);outAmb=vec4(0.);if(u_hq>.5&&u_hdrOut>.5){float Fg=.04+.96*pow(1.-nv,5.);outColor=vec4(prefReflection(reflect(-v,n),.02)*u_exposure,clamp(Fg*.95+.03,.03,.9));return;}if(u_hdrOut>.5){outColor=vec4(mix(linearize(vec3(.65,.77,.73))*.35,reflected*u_exposure,.8),clamp(.045+f*.18,.045,.225));return;}outColor=vec4(mix(vec3(.65,.77,.73),tonemap(reflected*u_exposure),.8),clamp(.045+f*.18,.045,.225));return;
 }
 vec4 base=u_color;vec3 albedo=mix(linearize(max(base.rgb,vec3(0))),base.rgb,u_colorLinear);
 if(u_useTex>.5){vec4 t=texture(u_tex,v_uv);albedo*=linearize(t.rgb);base.a*=t.a;}
 if(u_beltSurface>.5&&n.y>.99){float q=fract((v_world.x-u_beltTravel)/.5);float aa=max(fwidth(v_world.x),.00025);float seam=1.-smoothstep(.003-aa,.003+aa,min(q,1.-q)*.5);albedo*=1.-seam*.35;}
 if(u_rollerSurface>.5){float mark=1.-smoothstep(0.,.02,min(v_uv.x,1.-v_uv.x));albedo=mix(albedo,linearize(vec3(.62,.68,.72)),mark*.35);}
 float footprint=length(fwidth(v_world));float fade=1.-smoothstep(.002,.02,footprint);
 float grain=sin(v_world.x*183.+sin(v_world.z*31.))*sin(v_world.y*137.+v_world.z*47.);
 float rough=clamp(u_surface.x+grain*u_surface.w*fade,.045,1.),metal=clamp(u_surface.y,0.,1.);float ccW=u_clearcoat,glassT=0.;
 if(u_vatlas>.5){vec2 tu=fract(v_uv);ivec2 tl=ivec2(min(floor(tu.x*5.),4.),3.-min(floor(tu.y*4.),3.));vec4 m=VT[tl.y*5+tl.x];rough=m.x;metal=m.y;ccW=m.z;glassT=m.w;
  if(u_vdebug>.5){albedo=vec3(float(tl.x)/4.,float(tl.y)/3.,fract(float(tl.y*5+tl.x)*.37));metal=0.;rough=.8;}
  if(glassT>.5)albedo*=.35;}
 vec3 l=normalize(vec3(-.2,1.,.12)),h=normalize(l+v);float nl=max(dot(n,l),0.),nh=max(dot(n,h),0.),vh=max(dot(v,h),0.);
 float a=rough*rough,a2=a*a,den=nh*nh*(a2-1.)+1.;float D=a2/max(PI*den*den,.000001);
 float k=(rough+1.)*(rough+1.)/8.;float G=(nv/(nv*(1.-k)+k))*(nl/max(nl*(1.-k)+k,.00001));
 vec3 F0=mix(vec3(.04),albedo,metal),F=F0+(1.-F0)*pow(1.-vh,5.);
 vec3 spec=D*G*F/max(4.*nv*nl,.0001);vec3 diffuse=(1.-F)*(1.-metal)*albedo/PI;
 float hemi=mix(.12,.40,n.y*.5+.5);
 float visibility=u_csmOn>.5?csmVis(n,l):shadowVisibility(n,l);
 vec3 white=vec3(1.,.956,.895);
 vec3 ambD=albedo*(1.-metal)*hemi*.85*white;
 if(u_hq>.5){vec3 irr=mix(shIrr(n,u_sh0),shIrr(n,u_sh1),smoothstep(3.8,4.5,v_world.z));ambD=albedo*(1.-metal)*max(irr,vec3(0.))*(u_ambK/3.14159265);}
 vec3 hdr=(diffuse+spec)*nl*3.0*visibility*white+ambD;
 vec3 envF=u_hq>.5?envBRDF(F0,rough,nv):F0+(max(vec3(1.-rough),F0)-F0)*pow(1.-nv,5.);
 vec3 ambS=(u_hq>.5?prefReflection(reflect(-v,n),rough):roomReflection(reflect(-v,n),rough))*envF;hdr+=ambS;
 if(ccW>.05&&u_hq>.5){float cr=.06,ca=cr*cr,ca2=ca*ca,cd=nh*nh*(ca2-1.)+1.,Dc=ca2/max(PI*cd*cd,1e-6),kc=(cr+1.)*(cr+1.)/8.,Gc=(nv/(nv*(1.-kc)+kc))*(nl/max(nl*(1.-kc)+kc,1e-5));
  float Fc=.04+.96*pow(1.-vh,5.),Fv=.04+.96*pow(1.-nv,5.);Fv*=ccW;Fc*=ccW;hdr=hdr*(1.-Fv)+Dc*Gc*Fc/max(4.*nv*nl,1e-4)*nl*3.*visibility*white+prefReflection(reflect(-v,n),cr)*Fv;}
 hdr+=albedo*u_surface.z;
 outAmb=vec4((ambD+ambS)*u_exposure,rough);
 outColor=u_capture>.5?vec4(clamp(hdr/8.,0.,1.),1.):(u_hdrOut>.5?vec4(hdr*u_exposure,base.a*u_alpha):vec4(tonemap(hdr*u_exposure),base.a*u_alpha));
}`;
function bevelMesh(o){
  const [hx,hy,hz]=o.size.map(v=>v/2),b=Math.min(o.bevel,Math.min(hx,hy,hz)*.8),c=o.center,positions=[],normals=[],indices=[];
  const pushVertex=(v,n)=>{positions.push(v[0],v[1],v[2]);normals.push(n[0],n[1],n[2]);return positions.length/3-1};
  const quad=(vs,n)=>{const q=vs.map(v=>pushVertex([c[0]+v[0],c[1]+v[1],c[2]+v[2]],n));indices.push(q[0],q[1],q[2],q[0],q[2],q[3])};
  const tri=(vs,n)=>{const q=vs.map(v=>pushVertex([c[0]+v[0],c[1]+v[1],c[2]+v[2]],n));indices.push(q[0],q[1],q[2])};
  const n3=v=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l)};
  for(const sx of[-1,1]){quad([[sx*hx,-hy+b,-hz+b],[sx*hx,hy-b,-hz+b],[sx*hx,hy-b,hz-b],[sx*hx,-hy+b,hz-b]],[sx,0,0])}
  for(const sy of[-1,1]){quad([[-hx+b,sy*hy,-hz+b],[hx-b,sy*hy,-hz+b],[hx-b,sy*hy,hz-b],[-hx+b,sy*hy,hz-b]],[0,sy,0])}
  for(const sz of[-1,1]){quad([[-hx+b,-hy+b,sz*hz],[hx-b,-hy+b,sz*hz],[hx-b,hy-b,sz*hz],[-hx+b,hy-b,sz*hz]],[0,0,sz])}
  for(const sx of[-1,1])for(const sy of[-1,1])quad([[sx*hx,sy*(hy-b),-hz+b],[sx*(hx-b),sy*hy,-hz+b],[sx*(hx-b),sy*hy,hz-b],[sx*hx,sy*(hy-b),hz-b]],n3([sx,sy,0]));
  for(const sx of[-1,1])for(const sz of[-1,1])quad([[sx*hx,-hy+b,sz*(hz-b)],[sx*(hx-b),-hy+b,sz*hz],[sx*(hx-b),hy-b,sz*hz],[sx*hx,hy-b,sz*(hz-b)]],n3([sx,0,sz]));
  for(const sy of[-1,1])for(const sz of[-1,1])quad([[-hx+b,sy*hy,sz*(hz-b)],[-hx+b,sy*(hy-b),sz*hz],[hx-b,sy*(hy-b),sz*hz],[hx-b,sy*hy,sz*(hz-b)]],n3([0,sy,sz]));
  for(const sx of[-1,1])for(const sy of[-1,1])for(const sz of[-1,1])tri([[sx*hx,sy*(hy-b),sz*(hz-b)],[sx*(hx-b),sy*hy,sz*(hz-b)],[sx*(hx-b),sy*(hy-b),sz*hz]],n3([sx,sy,sz]));
  for(let k=0;k<indices.length;k+=3){
    const a=indices[k]*3,bb=indices[k+1]*3,cc=indices[k+2]*3;
    const ab=[0,1,2].map(j=>positions[bb+j]-positions[a+j]),ac=[0,1,2].map(j=>positions[cc+j]-positions[a+j]);
    if(dot(cross(ab,ac),normals.slice(a,a+3))<0)[indices[k+1],indices[k+2]]=[indices[k+2],indices[k+1]];
  }
  o._mesh={positions:new Float32Array(positions),normals:new Float32Array(normals),indices:new Uint32Array(indices),topology:{closed:true,coreFaces:6,edgeQuads:12,cornerTriangles:8,faces:26,indexCount:indices.length}};return o._mesh;
}
// M10 owns only illumination resources; camera, geometry and physics remain authoritative.
const M10_SETTINGS=Object.freeze({exposure:1,shadowSize:2048,probeSize:128,probeRange:8,white:[1,.956,.895],probeCenters:[[0,2,0],[0,2.4,7]]});
let lighting=null;
const shadowVert=`#version 300 es
in vec3 a_position;uniform mat4 u_mvp;void main(){gl_Position=u_mvp*vec4(a_position,1.);}`;
const shadowFrag=`#version 300 es
precision highp float;void main(){}`;
function lightingProgram(vsSource,fsSource){
 const shaders=[];const p=gl.createProgram();
 try{for(const [type,src] of [[gl.VERTEX_SHADER,vsSource],[gl.FRAGMENT_SHADER,fsSource]]){const sh=gl.createShader(type);shaders.push(sh);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));gl.attachShader(p,sh);}gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;}
 catch(e){gl.deleteProgram(p);throw e}finally{shaders.forEach(s=>gl.deleteShader(s));}
}
function disposeLighting(lost=false){
 if(!lighting)return;
 if(!lost&&gl){for(const t of lighting.textures)gl.deleteTexture(t);for(const f of lighting.framebuffers)gl.deleteFramebuffer(f);for(const r of lighting.renderbuffers)gl.deleteRenderbuffer(r);if(lighting.depthProgram)gl.deleteProgram(lighting.depthProgram);}
 lighting=null;
}
function lightingFramebufferCheck(label){if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('M10 framebuffer incomplete: '+label)}
function ortho(l,r,b,t,n,f){return new Float32Array([2/(r-l),0,0,0,0,2/(t-b),0,0,0,0,-2/(f-n),0,-(r+l)/(r-l),-(t+b)/(t-b),-(f+n)/(f-n),1])}
function newLightingTexture(){const t=gl.createTexture();if(!t)throw Error('M10 texture allocation');lighting.textures.push(t);return t}
function newLightingFramebuffer(){const f=gl.createFramebuffer();if(!f)throw Error('M10 framebuffer allocation');lighting.framebuffers.push(f);return f}
function cubeTexture(size){
 const t=newLightingTexture();gl.bindTexture(gl.TEXTURE_CUBE_MAP,t);
 for(let f=0;f<6;f++)gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X+f,0,gl.RGBA8,size,size,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
 gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_CUBE_MAP,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
 for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T,gl.TEXTURE_WRAP_R])gl.texParameteri(gl.TEXTURE_CUBE_MAP,p,gl.CLAMP_TO_EDGE);
 gl.generateMipmap(gl.TEXTURE_CUBE_MAP);return t;
}
function initLighting(){
 disposeLighting();lighting={textures:[],framebuffers:[],renderbuffers:[],depthProgram:null,shadowKey:null,shadowPasses:0,capturedFaces:0};
 try{
  lighting.shadowSize=Math.min(M10_SETTINGS.shadowSize,gl.getParameter(gl.MAX_TEXTURE_SIZE));
  if(lighting.shadowSize<1024)throw Error('M10 requires shadow texture >= 1024');
  lighting.depthProgram=lightingProgram(shadowVert,shadowFrag);
  lighting.depthPos=gl.getAttribLocation(lighting.depthProgram,'a_position');lighting.depthMVP=gl.getUniformLocation(lighting.depthProgram,'u_mvp');
  const target=[0,0,2.5],direction=norm([-.2,1,.12]),eye=target.map((v,i)=>v+direction[i]*30);
  lighting.lightVP=matMul(ortho(-11,11,-9,9,1,50),lookAt(eye,target,[0,0,-1]));
  lighting.shadow=newLightingTexture();gl.bindTexture(gl.TEXTURE_2D,lighting.shadow);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,lighting.shadowSize,lighting.shadowSize,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);
  for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.NEAREST);
  for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);
  lighting.shadowFBO=newLightingFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,lighting.shadowFBO);
  gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,lighting.shadow,0);gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);lightingFramebufferCheck('shadow');
  lighting.dummy=cubeTexture(1);lighting.probes=M10_SETTINGS.probeCenters.map(()=>cubeTexture(M10_SETTINGS.probeSize));
  lighting.probeFBO=newLightingFramebuffer();lighting.probeDepth=gl.createRenderbuffer();lighting.renderbuffers.push(lighting.probeDepth);
  gl.bindRenderbuffer(gl.RENDERBUFFER,lighting.probeDepth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,M10_SETTINGS.probeSize,M10_SETTINGS.probeSize);
  gl.bindFramebuffer(gl.FRAMEBUFFER,lighting.probeFBO);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,lighting.probeDepth);
  for(const name of ['env0','env1','shadowMap','lightVP','capture','shadowEnabled','exposure','hdrOut'])loc[name]=gl.getUniformLocation(program,'u_'+name);
  /* fixed units for the M6 samplers so cube and 2D samplers never share a unit */gl.useProgram(program);gl.uniform1i(gl.getUniformLocation(program,'u_pref0'),4);gl.uniform1i(gl.getUniformLocation(program,'u_pref1'),5);gl.uniform1i(gl.getUniformLocation(program,'u_csmMap'),6);
  for(const u of [4,5]){gl.activeTexture(gl.TEXTURE0+u);gl.bindTexture(gl.TEXTURE_CUBE_MAP,lighting.dummy)}gl.activeTexture(gl.TEXTURE0);
  AETHER.M10={implementationReady:false,exposure:M10_SETTINGS.exposure,whiteBalance:'neutral warm industrial, approximately 4500K',reflection:'two scene-captured box-projected cubemaps',probeResolution:M10_SETTINGS.probeSize,shadowResolution:lighting.shadowSize,externalEnvironment:false,visualApproval:'PENDING',browserVerified:false,limitations:['Cubemap mip blur approximates rough reflections; not GGX-prefiltered IBL','Static facility captures exclude vehicle and transparent surfaces','Overhead directional shadow approximates distributed ceiling fixtures','Device performance and visual review pending']};
  renderLightingShadow(true);captureLightingProbes();hqInit();AETHER.M10.implementationReady=true;AETHER.M10.capturedFaces=lighting.capturedFaces;
  AETHER.M9.limitations=['M9/M10 device visual approval remains pending'];
  if(AETHER.M7)AETHER.M7.opticalModel='single optical surface, Fresnel tint and scene-captured indoor reflection';
 }catch(e){disposeLighting();throw e}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindRenderbuffer(gl.RENDERBUFFER,null);gl.viewport(0,0,glCanvas.width,glCanvas.height);gl.clearColor(.08,.11,.13,1);gl.activeTexture(gl.TEXTURE0);}
}
function lightingShadowKey(){return JSON.stringify([Array.from(vehicleModel()),rollingState.wheelAngles,rollingState.rollerAngles])}
function renderLightingShadow(force=false){
 if(!lighting)return;const key=lightingShadowKey();if(!force&&key===lighting.shadowKey)return;
 // Unbind sampled depth before it becomes a draw attachment.
 gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,null);gl.activeTexture(gl.TEXTURE0);
 gl.bindFramebuffer(gl.FRAMEBUFFER,lighting.shadowFBO);gl.viewport(0,0,lighting.shadowSize,lighting.shadowSize);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.clear(gl.DEPTH_BUFFER_BIT);gl.useProgram(lighting.depthProgram);
 function depth(mesh,m){gl.uniformMatrix4fv(lighting.depthMVP,false,matMul(lighting.lightVP,m));gl.bindBuffer(gl.ARRAY_BUFFER,mesh.pb);gl.enableVertexAttribArray(lighting.depthPos);gl.vertexAttribPointer(lighting.depthPos,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.ib);gl.drawElements(gl.TRIANGLES,mesh.count,mesh.type,0);}
 const id=identityMatrix();
 // Ceiling fixtures emit below the ceiling: roof/HVAC above fixtures do not occlude them.
 for(const o of scene.objects)if(o.visible&&o.gpu&&o.material!=='glass'&&o.center[1]+o.size[1]/2<3.5)depth(o.gpu,id);
 for(const r of scene.roadParts)if(r.gpu)depth(r.gpu,rollerModel(r,rollingState.rollerAngles[scene.roadParts.indexOf(r)]||0));
 for(const p of scene.vehicleParts)if(p.gpu){const i=wheelParts().indexOf(p);depth(p.gpu,i<0?vehicleModel():wheelModel(p,rollingState.wheelAngles[i]||0));}
 lighting.shadowKey=key;lighting.shadowPasses++;if(AETHER.M10)AETHER.M10.shadowPasses=lighting.shadowPasses;
 gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,glCanvas.width,glCanvas.height);
}
function bindLighting(capture=false){
 gl.uniform1f(loc.capture,capture?1:0);gl.uniform1f(loc.hdrOut,FX.active&&!capture?1:0);hqBind(capture);gl.uniform1f(loc.shadowEnabled,1);gl.uniform1f(loc.exposure,M10_SETTINGS.exposure);gl.uniformMatrix4fv(loc.lightVP,false,lighting.lightVP);
 gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_CUBE_MAP,capture?lighting.dummy:lighting.probes[0]);gl.uniform1i(loc.env0,1);
 gl.activeTexture(gl.TEXTURE2);gl.bindTexture(gl.TEXTURE_2D,lighting.shadow);gl.uniform1i(loc.shadowMap,2);
 gl.activeTexture(gl.TEXTURE3);gl.bindTexture(gl.TEXTURE_CUBE_MAP,capture?lighting.dummy:lighting.probes[1]);gl.uniform1i(loc.env1,3);gl.activeTexture(gl.TEXTURE0);
}
function captureLightingProbes(){
 const directions=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]],ups=[[0,-1,0],[0,-1,0],[0,0,1],[0,0,-1],[0,-1,0],[0,-1,0]],id=identityMatrix();
 gl.bindFramebuffer(gl.FRAMEBUFFER,lighting.probeFBO);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);gl.readBuffer(gl.COLOR_ATTACHMENT0);gl.viewport(0,0,M10_SETTINGS.probeSize,M10_SETTINGS.probeSize);gl.useProgram(program);bindLighting(true);gl.clearColor(0,0,0,1);
 for(let p=0;p<2;p++){
  const eye=M10_SETTINGS.probeCenters[p];gl.uniform4f(loc.eye,...eye,1);
  for(let f=0;f<6;f++){
   gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_CUBE_MAP_POSITIVE_X+f,lighting.probes[p],0);lightingFramebufferCheck('probe '+p+'/'+f);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
   const target=eye.map((v,i)=>v+directions[f][i]),vp=matMul(perspective(90,1,.05,100),lookAt(eye,target,ups[f]));gl.uniformMatrix4fv(loc.model,false,id);gl.uniformMatrix4fv(loc.mvp,false,vp);
   for(const o of scene.objects)if(o.visible&&o.gpu&&o.material!=='glass')drawMesh(o.gpu,id,{color:lightingColor(o),surface:surfaceFor(o),belt:o.name==='belt',beltTravel:0});
   lighting.capturedFaces++;
  }
 }
 gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.activeTexture(gl.TEXTURE0);
 for(const t of lighting.probes){gl.bindTexture(gl.TEXTURE_CUBE_MAP,t);gl.generateMipmap(gl.TEXTURE_CUBE_MAP);}gl.bindTexture(gl.TEXTURE_CUBE_MAP,null);
}
function lightingColor(o){return o.category==='lighting recess'||o.name.startsWith('m5.light.')?[.95,.935,.91,1]:[...o.color,1]}

const m13SliceVert=`#version 300 es
in vec3 a_position;in vec2 a_uv;uniform mat4 u_mvp;out vec2 v_uv;void main(){v_uv=a_uv;gl_Position=u_mvp*vec4(a_position,1.);}`;
const m13SliceFrag=`#version 300 es
precision highp float;uniform sampler2D u_field;uniform float u_alpha;in vec2 v_uv;out vec4 outColor;void main(){vec4 c=texture(u_field,v_uv);outColor=vec4(c.rgb,c.a*u_alpha);}`;
const m13LineVert=`#version 300 es
in vec3 a_position;in vec4 a_color;in float a_flow;uniform mat4 u_mvp;out vec4 v_color;out float v_flow;void main(){v_color=a_color;v_flow=a_flow;gl_Position=u_mvp*vec4(a_position,1.);}`;
const m13LineFrag=`#version 300 es
precision highp float;in vec4 v_color;in float v_flow;uniform float u_flowTime;uniform float u_flowEnabled;out vec4 outColor;void main(){float phase=mod(v_flow-u_flowTime,1.25);float pulse=(1.0-smoothstep(.06,.20,abs(phase-.10)))*u_flowEnabled;vec3 color=mix(v_color.rgb,vec3(1.0,.96,.72),pulse*.95);outColor=vec4(color,max(v_color.a,pulse*.95));}`;const m13CpVert=`#version 300 es
in vec3 a_position;in float a_cp;uniform mat4 u_mvp;out float v_cp;void main(){v_cp=a_cp;gl_Position=u_mvp*vec4(a_position,1.);}`;const m13CpFrag=`#version 300 es
precision highp float;in float v_cp;uniform float u_cpMin;uniform float u_cpMax;out vec4 outColor;void main(){float q=clamp((v_cp-u_cpMin)/max(u_cpMax-u_cpMin,1e-6),0.0,1.0);outColor=vec4(q,1.0-abs(q-0.5)*2.0,1.0-q,1.0);}`;
function m13Program(vsSource,fsSource){const shaders=[],p=gl.createProgram();try{for(const [type,src] of [[gl.VERTEX_SHADER,vsSource],[gl.FRAGMENT_SHADER,fsSource]]){const sh=gl.createShader(type);shaders.push(sh);gl.shaderSource(sh,src);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));gl.attachShader(p,sh)}gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p}catch(e){gl.deleteProgram(p);throw e}finally{shaders.forEach(s=>gl.deleteShader(s))}}
function m13ReleaseResources(lost=false){const r=m13FrameState.resources;if(!r.initialized)return;if(!lost&&gl){let deleted=0;for(const b of [r.slicePositionBuffer,r.sliceUvBuffer,r.linePositionBuffer,r.lineColorBuffer,r.lineFlowBuffer,...r.cpBuffers])if(b){gl.deleteBuffer(b);deleted++}if(r.sliceTexture)gl.deleteTexture(r.sliceTexture);if(r.sliceProgram)gl.deleteProgram(r.sliceProgram);if(r.lineProgram)gl.deleteProgram(r.lineProgram);if(r.cpProgram)gl.deleteProgram(r.cpProgram);r.deleteCount=(r.deleteCount||0)+deleted}m13FrameState.resources={...r,initialized:false,sliceProgram:null,lineProgram:null,cpProgram:null,sliceTexture:null,slicePositionBuffer:null,sliceUvBuffer:null,cpBuffers:[],createCount:r.createCount,deleteCount:r.deleteCount,scientificDrawCalls:0,derivedReady:{VECTORS:false,STREAMLINES:false,WAKE:false},linePositionBuffer:null,lineColorBuffer:null,lineFlowBuffer:null,lineCount:0}}
function m13InitResources(){m13ReleaseResources(false);const r=m13FrameState.resources;r.sliceProgram=m13Program(m13SliceVert,m13SliceFrag);r.lineProgram=m13Program(m13LineVert,m13LineFrag);r.cpProgram=m13Program(m13CpVert,m13CpFrag);r.sliceTexture=gl.createTexture();r.createCount++;gl.bindTexture(gl.TEXTURE_2D,r.sliceTexture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([0,0,0,0]));r.initialized=true;r.initCount=(r.initCount||0)+1;m13Sync()}
function m13Color(value,min,max){const q=clamp((value-min)/Math.max(max-min,1e-12),0,1);return[q,Math.min(1,Math.max(0,1.5-Math.abs(q-.5)*3)),1-q,1]}
function m13SliceGeometry(frame){const g=frame.grid,a=m13FrameState.slice.axis,ix='XYZ'.indexOf(a),u=(ix+1)%3,v=(ix+2)%3,pos=m13FrameState.slice.position,lo=[...g.min],hi=[...g.max];lo[ix]=hi[ix]=pos;const p=[lo.slice(),[hi[0],lo[1],lo[2]],[hi[0],hi[1],hi[2]],[lo[0],hi[1],hi[2]]];if(a==='X'){p[0]=[pos,g.min[1],g.min[2]];p[1]=[pos,g.max[1],g.min[2]];p[2]=[pos,g.max[1],g.max[2]];p[3]=[pos,g.min[1],g.max[2]]}else if(a==='Y'){p[0]=[g.min[0],pos,g.min[2]];p[1]=[g.max[0],pos,g.min[2]];p[2]=[g.max[0],pos,g.max[2]];p[3]=[g.min[0],pos,g.max[2]]}else{p[0]=[g.min[0],g.min[1],pos];p[1]=[g.max[0],g.min[1],pos];p[2]=[g.max[0],g.max[1],pos];p[3]=[g.min[0],g.max[1],pos]}return{positions:new Float32Array([...p[0],...p[1],...p[2],...p[0],...p[2],...p[3]]),uvs:new Float32Array([0,0,1,0,1,1,0,0,1,1,0,1])}}
function m13SlicePixels(frame){const g=frame.grid,a=m13FrameState.slice.axis,ix='XYZ'.indexOf(a),u=(ix+1)%3,v=(ix+2)%3,nU=g.resolution[u],nV=g.resolution[v],pixels=new Uint8Array(nU*nV*4),legend=m13FrameState.legend[m13FrameState.slice.quantity==='VELOCITY'?'VELOCITY':m13FrameState.slice.quantity];for(let j=0;j<nV;j++)for(let i=0;i<nU;i++){const q=[0,0,0];q[ix]=m13FrameState.slice.position;q[u]=g.min[u]+(g.max[u]-g.min[u])*(i/Math.max(1,nU-1));q[v]=g.min[v]+(g.max[v]-g.min[v])*(j/Math.max(1,nV-1));let sample=null;if(m13FrameState.slice.quantity==='PRESSURE')sample=m13ScalarSample(frame,frame.fields.pressure,q);else if(m13FrameState.slice.quantity==='VELOCITY')sample=m13VectorSample(frame,frame.fields.velocity,q),sample=sample.available?{available:true,value:m13Magnitude(sample.value)}:sample;else if(m13FrameState.slice.quantity==='VORTICITY'&&frame.fields.vorticity){sample=frame.fields.vorticity.components===1?m13ScalarSample(frame,frame.fields.vorticity,q):m13VectorSample(frame,frame.fields.vorticity,q),sample=sample.available&&frame.fields.vorticity.components===3?{available:true,value:m13Magnitude(sample.value)}:sample}if(sample?.available){const c=m13Color(sample.value,legend.min,legend.max),o=(j*nU+i)*4;pixels[o]=c[0]*255;pixels[o+1]=c[1]*255;pixels[o+2]=c[2]*255;pixels[o+3]=220}}return{pixels,nU,nV}}
function m13BuildSlice(frame){const r=m13FrameState.resources;if(!r.initialized||!r.sliceTexture)return;const q=m13SlicePixels(frame),geo=m13SliceGeometry(frame);if(!r.slicePositionBuffer){r.slicePositionBuffer=gl.createBuffer();r.sliceUvBuffer=gl.createBuffer();r.createCount+=2}gl.bindBuffer(gl.ARRAY_BUFFER,r.slicePositionBuffer);gl.bufferData(gl.ARRAY_BUFFER,geo.positions,gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,r.sliceUvBuffer);gl.bufferData(gl.ARRAY_BUFFER,geo.uvs,gl.STATIC_DRAW);gl.bindTexture(gl.TEXTURE_2D,r.sliceTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,q.nU,q.nV,0,gl.RGBA,gl.UNSIGNED_BYTE,q.pixels);r.slicePixels=q.pixels;r.sliceSize=[q.nU,q.nV];m13Sync()}
function m13UploadLines(pos,col,flow=[]){const r=m13FrameState.resources;r.linePositions=new Float32Array(pos);r.lineColors=new Float32Array(col);r.lineFlow=new Float32Array(flow.length===pos.length/3?flow:new Array(pos.length/3).fill(0));r.lineCount=pos.length/3;if(pos.length){if(!r.linePositionBuffer){r.linePositionBuffer=gl.createBuffer();r.lineColorBuffer=gl.createBuffer();r.lineFlowBuffer=gl.createBuffer();r.createCount+=3}gl.bindBuffer(gl.ARRAY_BUFFER,r.linePositionBuffer);gl.bufferData(gl.ARRAY_BUFFER,r.linePositions,gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,r.lineColorBuffer);gl.bufferData(gl.ARRAY_BUFFER,r.lineColors,gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,r.lineFlowBuffer);gl.bufferData(gl.ARRAY_BUFFER,r.lineFlow,gl.STATIC_DRAW)}}
function m13SolidVoxel(frame,i,j,k){const mask=frame.solidMask?.data,g=frame.grid;if(!mask||mask.length!==g.resolution[0]*g.resolution[1]*g.resolution[2])return false;const [nx,ny,nz]=g.resolution;if(i<0||j<0||k<0||i>=nx||j>=ny||k>=nz)return false;return mask[i+nx*(j+ny*k)]!==0}
function m13SegmentHitsSolid(frame,a,b){const g=frame.grid,mask=frame.solidMask?.data,[nx,ny,nz]=g.resolution,dims=[nx,ny,nz],h=g.max.map((v,i)=>(v-g.min[i])/dims[i]);if(!mask||mask.length!==nx*ny*nz){const bounds=CFD_BRIDGE.getAlignmentReport().solidBounds,lo=a.map((v,i)=>Math.min(v,b[i])),hi=a.map((v,i)=>Math.max(v,b[i]));return lo.every((v,i)=>hi[i]>=bounds.min[i]&&v<=bounds.max[i])}const qa=a.map((v,i)=>(v-g.min[i])/h[i]),qb=b.map((v,i)=>(v-g.min[i])/h[i]),delta=qb.map((v,i)=>v-qa[i]),cell=q=>q.map((v,i)=>Math.max(0,Math.min(dims[i]-1,Math.floor(v))));let c=cell(qa);const solid=q=>m13SolidVoxel(frame,q[0],q[1],q[2]);if(solid(c))return true;const step=delta.map(v=>v>0?1:v<0?-1:0),tMax=[0,1,2].map(i=>step[i]===0?Infinity:(((step[i]>0?c[i]+1:c[i])-qa[i])/delta[i])),tDelta=[0,1,2].map(i=>step[i]===0?Infinity:Math.abs(1/delta[i]));for(let count=0;count<nx+ny+nz+3;count++){const t=Math.min(...tMax);if(t>1||!Number.isFinite(t))break;const axes=[0,1,2].filter(i=>Math.abs(tMax[i]-t)<1e-10);for(let bits=1;bits<(1<<axes.length);bits++){const q=c.slice();for(let n=0;n<axes.length;n++)if(bits&(1<<n))q[axes[n]]+=step[axes[n]];if(solid(q))return true}for(const i of axes){c[i]+=step[i];tMax[i]+=tDelta[i]}if(c.some((v,i)=>v<0||v>=dims[i]))break;}return false}
function m13Streamline(frame,seed){const out=[seed.slice()],h=Math.min(...frame.grid.max.map((v,i)=>(v-frame.grid.min[i])/frame.grid.resolution[i]))*.55,maxSteps=256;let p=seed.slice(),reason='MAX_STEPS';for(let i=0;i<maxSteps;i++){const a=m13VectorSample(frame,frame.fields.velocity,p),ma=a.available?m13Magnitude(a.value):0;if(!a.available){reason='DOMAIN_EXIT';break}if(ma<1e-8){reason='NEAR_ZERO';break}const d1=a.value.map(x=>x/ma),mid=p.map((x,j)=>x+d1[j]*h*.5),b=m13VectorSample(frame,frame.fields.velocity,mid),mb=b.available?m13Magnitude(b.value):0;if(!b.available){reason='DOMAIN_EXIT';break}if(mb<1e-8){reason='NEAR_ZERO';break}const d2=b.value.map(x=>x/mb),n=p.map((x,j)=>x+d2[j]*h);if(!m13SampleCoordinate(frame,n)){reason='DOMAIN_EXIT';break}if(m13SegmentHitsSolid(frame,p,n)){reason='SOLID_VOXEL_HIT';break}out.push(n);p=n}m13Streamline.lastReason=reason;return out.length>=2?out:[]}
function m13BuildVectors(frame){const g=frame.grid,stride=m13FrameState.quality==='high'?Math.max(1,Math.floor(Math.min(...g.resolution)/18)):Math.max(1,Math.floor(Math.min(...g.resolution)/12)),pos=[],col=[];for(let z=0;z<g.resolution[2];z+=stride)for(let y=0;y<g.resolution[1];y+=stride)for(let x=0;x<g.resolution[0];x+=stride){const p=[g.min[0]+(g.max[0]-g.min[0])*x/Math.max(1,g.resolution[0]-1),g.min[1]+(g.max[1]-g.min[1])*y/Math.max(1,g.resolution[1]-1),g.min[2]+(g.max[2]-g.min[2])*z/Math.max(1,g.resolution[2]-1)],s=m13VectorSample(frame,frame.fields.velocity,p),m=s.available?m13Magnitude(s.value):0;if(!s.available||m<1e-8)continue;const len=Math.min(.45,.08+m*.01),q=p.map((v,i)=>v+s.value[i]/m*len),c=m13Color(m,m13FrameState.legend.VELOCITY.min,m13FrameState.legend.VELOCITY.max);pos.push(...p,...q);col.push(...c,...c)}m13UploadLines(pos,col);m13FrameState.resources.derivedReady.VECTORS=pos.length>0;m13FrameState.resources.vectorStats={segments:pos.length/6,samplingStride:stride};m13Sync()}
function m13BuildStreamlines(frame){const b=CFD_BRIDGE.getAlignmentReport().solidBounds,g=frame.grid,n=m13FrameState.streamlineDensity||64,mid=(b.min[1]+b.max[1])*.5,weights={front:12,roof:12,side:16,wheel:8,underbody:8,wake:8},names=Object.keys(weights),alloc=Object.fromEntries(names.map(k=>[k,Math.floor(n*weights[k]/64)]));let remain=n-Object.values(alloc).reduce((a,x)=>a+x,0);for(const k of names)if(remain-->0)alloc[k]++;const lerpSeeds=(count,make)=>Array.from({length:count},(_,i)=>make((i+.5)/Math.max(1,count),i)),wheelSeeds=wheelParts().slice(0,4).flatMap(w=>{const q=w.wheel.pivot,side=Math.sign(q[2]||1);return [[q[0]-.8,q[1]+w.wheel.radius+.35,q[2]+side*.3],[q[0]-.8,q[1]+w.wheel.radius+.35,q[2]+side*.55]]});const groups={front:lerpSeeds(alloc.front,(t)=>[g.min[0]+.15,mid,b.min[2]+(b.max[2]-b.min[2])*t]),roof:lerpSeeds(alloc.roof,(t)=>[b.min[0]+(b.max[0]-b.min[0])*t,b.max[1]+.12,-.65*b.max[2]+1.3*b.max[2]*((t*7)%1)]),side:Array.from({length:alloc.side},(_,i)=>{const half=Math.ceil(alloc.side/2),side=i<half?1:-1,j=i%half,t=(j+.5)/half;return[b.min[0]+(b.max[0]-b.min[0])*t,mid,side*(b.max[2]+.10)]}),wheel:Array.from({length:alloc.wheel},(_,i)=>wheelSeeds[i%wheelSeeds.length]),underbody:lerpSeeds(alloc.underbody,(t)=>[g.min[0]+.15,b.min[1]+.15,-.65*b.max[2]+1.3*b.max[2]*((t*7)%1)]),wake:lerpSeeds(alloc.wake,(t)=>[Math.min(g.max[0]-.15,b.max[0]+.5),g.min[1]+.45+(g.max[1]-g.min[1]-.9)*t,-.8*g.max[2]+1.6*g.max[2]*((t*5)%1)])},pos=[],col=[],flow=[],counts={},visible={};for(const [name,seeds] of Object.entries(groups)){counts[name]=seeds.length;visible[name]=0;for(const seed of seeds){const line=m13Streamline(frame,seed);if(line.length>1)visible[name]++;let distance=0;for(let i=1;i<line.length;i++){distance+=Math.hypot(...line[i].map((v,j)=>v-line[i-1][j]));const sm=m13VectorSample(frame,frame.fields.velocity,line[i]),c=m13Color(sm.available?m13Magnitude(sm.value):0,m13FrameState.legend.VELOCITY.min,m13FrameState.legend.VELOCITY.max);pos.push(...line[i-1],...line[i]);col.push(...c,...c);flow.push(distance-Math.hypot(...line[i].map((v,j)=>v-line[i-1][j])),distance)}}}m13UploadLines(pos,col,flow);m13FrameState.resources.derivedReady.STREAMLINES=pos.length>0;m13FrameState.resources.streamlineStats={seedGroups:6,seedCount:n,groups:counts,groupVisible:visible,segments:pos.length/6,maxSegmentsPerLine:256,solidCollision:frame.solidMask?'GRID_VOXEL_TRAVERSAL':'MASK_UNAVAILABLE'};m13Sync();}
function m13BuildWake(frame){const g=frame.grid,planes=m13WakePlanes(frame),pos=[],col=[],stats=[],minDef={v:Infinity},maxDef={v:-Infinity},sy=Math.max(1,Math.floor(g.resolution[1]/12)),sz=Math.max(1,Math.floor(g.resolution[2]/12)),speed=m13Magnitude(frame.freestream.velocity);for(const plane of planes){if(plane.status!=='AVAILABLE'){stats.push({...plane,samples:0,meanDeficit:null});continue}const rows=[];let sum=0,count=0;for(let y=0;y<g.resolution[1];y+=sy){rows[y]=[];for(let z=0;z<g.resolution[2];z+=sz){const p=[plane.x,g.min[1]+(g.max[1]-g.min[1])*y/Math.max(1,g.resolution[1]-1),g.min[2]+(g.max[2]-g.min[2])*z/Math.max(1,g.resolution[2]-1)],sm=m13VectorSample(frame,frame.fields.velocity,p),d=sm.available?Math.max(0,speed-m13Magnitude(sm.value)):null;rows[y][z]={p,d};if(d!==null){sum+=d;count++;minDef.v=Math.min(minDef.v,d);maxDef.v=Math.max(maxDef.v,d)}}}for(let y=0;y<g.resolution[1];y+=sy)for(let z=0;z<g.resolution[2];z+=sz){const q=rows[y]?.[z];if(!q||q.d===null)continue;const c=m13Color(q.d,0,Math.max(1,speed));if(z+sz<g.resolution[2]&&rows[y]?.[z+sz]?.d!==null){pos.push(...q.p,...rows[y][z+sz].p);col.push(...c,...c)}if(y+sy<g.resolution[1]&&rows[y+sy]?.[z]?.d!==null){pos.push(...q.p,...rows[y+sy][z].p);col.push(...c,...c)}}stats.push({...plane,samples:count,meanDeficit:count?sum/count:null,gridStep:[sy,sz]})}const wakeReady=pos.length>0&&stats.some(p=>p.status==='AVAILABLE')&&finite(minDef.v)&&finite(maxDef.v);if(wakeReady)m13LegendSet('WAKE',minDef.v,maxDef.v,frame.sourceId);m13UploadLines(pos,col);m13FrameState.resources.derivedReady.WAKE=wakeReady;m13FrameState.resources.wakeStats={planes:stats,quantity:'velocity deficit',pressure:true,vorticity:!!frame.fields.vorticity};m13FrameState.resources.lineCount=pos.length/3;m13Sync();}
function m13BuildLines(frame){if(m13FrameState.mode==='VECTORS')m13BuildVectors(frame);else if(m13FrameState.mode==='STREAMLINES')m13BuildStreamlines(frame);else if(m13FrameState.mode==='WAKE')m13BuildWake(frame)}
function m13PrepareDerived(){const f=m13FrameState.frame;if(!f||!m13FrameState.resources.initialized)return;if(['PRESSURE','VELOCITY','VORTICITY','SLICE'].includes(m13FrameState.mode))m13BuildSlice(f);if(['VECTORS','STREAMLINES','WAKE'].includes(m13FrameState.mode))m13BuildLines(f)}
function m13PrepareCp(){const f=m13FrameState.frame;if(!f||!m13CpReady(f)||!m13FrameState.resources.initialized)return;const r=m13FrameState.resources;const parts=CFD_BRIDGE.getSolidParts();while(r.cpBuffers.length<parts.length){r.cpBuffers.push(gl.createBuffer());r.createCount++}for(let i=0;i<parts.length;i++){gl.bindBuffer(gl.ARRAY_BUFFER,r.cpBuffers[i]);gl.bufferData(gl.ARRAY_BUFFER,m13FrameState.cp.parts[i],gl.STATIC_DRAW)}}function m13DrawCp(vp){const r=m13FrameState.resources;if(!r.cpProgram||!r.cpBuffers.length)return;gl.useProgram(r.cpProgram);const ap=gl.getAttribLocation(r.cpProgram,'a_position'),ac=gl.getAttribLocation(r.cpProgram,'a_cp'),um=gl.getUniformLocation(r.cpProgram,'u_mvp'),umin=gl.getUniformLocation(r.cpProgram,'u_cpMin'),umax=gl.getUniformLocation(r.cpProgram,'u_cpMax');const cpLegend=m13FrameState.legend.CP;const parts=CFD_BRIDGE.getSolidParts();for(let i=0;i<scene.vehicleParts.length;i++){const p=scene.vehicleParts[i],d=parts[i],idx=p.role==='wheel'?wheelParts().indexOf(p):-1,pm=p.role==='wheel'?wheelModel(p,rollingState.wheelAngles[idx]||0):vehicleModel();if(!p.gpu)continue;gl.bindBuffer(gl.ARRAY_BUFFER,p.gpu.pb);gl.enableVertexAttribArray(ap);gl.vertexAttribPointer(ap,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,r.cpBuffers[i]);gl.enableVertexAttribArray(ac);gl.vertexAttribPointer(ac,1,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,p.gpu.ib);gl.uniform1f(umin,cpLegend.min);gl.uniform1f(umax,cpLegend.max);gl.uniformMatrix4fv(um,false,matMul(vp,pm));gl.drawElements(gl.TRIANGLES,p.gpu.count,p.gpu.type,0);r.scientificDrawCalls++}}
function m13FlowElapsed(){return m13FrameState.flowOffset+(m13FrameState.flowPlaying?(performance.now()-m13FrameState.flowEpoch)/1000*m13FrameState.flowSpeed:0)}
function m13DrawOverlay(vp){const r=m13FrameState.resources,f=m13FrameState.frame;if(!r.initialized||!f||!m13FrameState.visible||m13FrameState.mode==='NONE')return;if(['PRESSURE','VELOCITY','VORTICITY','SLICE'].includes(m13FrameState.mode)){if(!r.slicePositionBuffer||!r.sliceUvBuffer||!r.slicePixels)return;gl.useProgram(r.sliceProgram);gl.bindBuffer(gl.ARRAY_BUFFER,r.slicePositionBuffer);const ap=gl.getAttribLocation(r.sliceProgram,'a_position'),au=gl.getAttribLocation(r.sliceProgram,'a_uv');gl.enableVertexAttribArray(ap);gl.vertexAttribPointer(ap,3,gl.FLOAT,false,0,0);gl.enableVertexAttribArray(au);gl.bindBuffer(gl.ARRAY_BUFFER,r.sliceUvBuffer);gl.vertexAttribPointer(au,2,gl.FLOAT,false,0,0);gl.uniformMatrix4fv(gl.getUniformLocation(r.sliceProgram,'u_mvp'),false,vp);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,r.sliceTexture);gl.uniform1i(gl.getUniformLocation(r.sliceProgram,'u_field'),0);gl.uniform1f(gl.getUniformLocation(r.sliceProgram,'u_alpha'),.55);gl.drawArrays(gl.TRIANGLES,0,6);r.scientificDrawCalls++}else if(['VECTORS','STREAMLINES','WAKE'].includes(m13FrameState.mode)){if(!r.linePositionBuffer)return;gl.useProgram(r.lineProgram);gl.bindBuffer(gl.ARRAY_BUFFER,r.linePositionBuffer);const ap=gl.getAttribLocation(r.lineProgram,'a_position');gl.enableVertexAttribArray(ap);gl.vertexAttribPointer(ap,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,r.lineColorBuffer);const ac=gl.getAttribLocation(r.lineProgram,'a_color');gl.enableVertexAttribArray(ac);gl.vertexAttribPointer(ac,4,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,r.lineFlowBuffer);const af=gl.getAttribLocation(r.lineProgram,'a_flow');gl.enableVertexAttribArray(af);gl.vertexAttribPointer(af,1,gl.FLOAT,false,0,0);gl.uniformMatrix4fv(gl.getUniformLocation(r.lineProgram,'u_mvp'),false,vp);gl.uniform1f(gl.getUniformLocation(r.lineProgram,'u_flowTime'),m13FlowElapsed());gl.uniform1f(gl.getUniformLocation(r.lineProgram,'u_flowEnabled'),m13FrameState.mode==='STREAMLINES'?1:0);gl.drawArrays(gl.LINES,0,r.lineCount);r.scientificDrawCalls++} }
