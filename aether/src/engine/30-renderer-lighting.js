let gl,program,loc={},buffers=[],textures=[],whiteTexture=null,raf=0,runtimeGeneration=0;const cubeIdx=new Uint16Array([0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,3,2,6,3,6,7,1,5,6,1,6,2,0,3,7,0,7,4]);const vert=`#version 300 es
 in vec3 a_position;in vec3 a_normal;in vec2 a_uv;uniform mat4 u_mvp;uniform mat4 u_model;out vec3 v_normal;out vec2 v_uv;out vec3 v_world;void main(){v_normal=normalize(transpose(inverse(mat3(u_model)))*a_normal);v_uv=a_uv;v_world=(u_model*vec4(a_position,1.0)).xyz;gl_Position=u_mvp*vec4(a_position,1.0);}`;const frag=`#version 300 es
precision highp float;
uniform vec4 u_eye,u_surface,u_color;uniform float u_alpha,u_useTex,u_beltSurface,u_beltTravel,u_rollerSurface,u_colorLinear;uniform sampler2D u_tex;
in vec3 v_normal;in vec2 v_uv;in vec3 v_world;layout(location=0) out vec4 outColor;layout(location=1) out vec4 outAmb;
uniform samplerCube u_env0,u_env1;uniform highp sampler2D u_shadowMap;
uniform mat4 u_lightVP;uniform float u_capture,u_shadowEnabled,u_exposure,u_hdrOut;
uniform samplerCube u_pref0,u_pref1;uniform highp sampler2D u_csmMap;uniform mat4 u_csmVP[3];uniform vec3 u_csmSplit,u_csmTexel,u_camFwd,u_sh0[9],u_sh1[9];uniform vec2 u_pz;uniform float u_hq,u_csmOn,u_pcss,u_clearcoat,u_prefLod,u_ambK,u_vatlas,u_vdebug,u_paintR;uniform vec4 u_paint;
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
vec3 rimLight(vec3 L,vec3 col,vec3 n,vec3 v,float nv,vec3 albedo,float rough,float metal,vec3 F0){
 vec3 h=normalize(L+v);float nl=max(dot(n,L),0.),nh=max(dot(n,h),0.),vh=max(dot(v,h),0.);
 float a=rough*rough,a2=a*a,den=nh*nh*(a2-1.)+1.,D=a2/max(PI*den*den,.000001),k=(rough+1.)*(rough+1.)/8.;
 float G=(nv/(nv*(1.-k)+k))*(nl/max(nl*(1.-k)+k,.00001));vec3 F=F0+(1.-F0)*pow(1.-vh,5.);
 return ((1.-F)*(1.-metal)*albedo/PI+D*G*F/max(4.*nv*nl,.0001))*nl*col;}
vec3 boxDirection(vec3 ray,vec3 lo,vec3 hi,vec3 center){
 vec3 safeRay=mix(vec3(-1.),vec3(1.),step(vec3(0.),ray))*max(abs(ray),vec3(.0001));
 vec3 farHit=max((lo-v_world)/safeRay,(hi-v_world)/safeRay);float t=max(0.,min(farHit.x,min(farHit.y,farHit.z)));
 return v_world+ray*t-center;
}
vec3 roomReflection(vec3 ray,float rough){
 if(u_capture>.5)return vec3(0.);
 vec3 a=boxDirection(ray,vec3(-9.,0.,-4.),vec3(9.,5.5,4.),vec3(0.,2.,0.));
 vec3 b=boxDirection(ray,vec3(-4.1,.75,4.),vec3(4.1,4.,9.3),vec3(0.,2.4,7.));
 return mix(textureLod(u_env0,a,rough*7.).rgb,textureLod(u_env1,b,rough*7.).rgb,smoothstep(u_pz.x,u_pz.y,v_world.z))*8.;
}
float shadowVisibility(vec3 n,vec3 l);
vec3 prefReflection(vec3 ray,float rough){
 vec3 a=boxDirection(ray,vec3(-9.,0.,-4.),vec3(9.,5.5,4.),vec3(0.,2.,0.));vec3 b=boxDirection(ray,vec3(-4.1,.75,4.),vec3(4.1,4.,9.3),vec3(0.,2.4,7.));
 float lod=clamp(sqrt(rough)*u_prefLod,0.,u_prefLod);return mix(textureLod(u_pref0,a,lod).rgb,textureLod(u_pref1,b,lod).rgb,smoothstep(u_pz.x,u_pz.y,v_world.z))*8.;}
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
  if(u_vdebug<.5&&u_paint.r>=0.&&tl.x==4&&tl.y==0){albedo=linearize(u_paint.rgb)*(1.+.45*u_paint.a*fade*sin(v_world.x*770.+v_world.z*410.)*sin(v_world.y*690.+v_world.z*530.));metal=u_paint.a*.55;rough=u_paintR;ccW=u_paintR>.45?0.:1.;}
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
 if(u_hq>.5){vec3 irr=mix(shIrr(n,u_sh0),shIrr(n,u_sh1),smoothstep(u_pz.x,u_pz.y,v_world.z));ambD=albedo*(1.-metal)*max(irr,vec3(0.))*(u_ambK/3.14159265);}
 vec3 hdr=(diffuse+spec)*nl*3.0*visibility*white+ambD;
 vec3 envF=u_hq>.5?envBRDF(F0,rough,nv):F0+(max(vec3(1.-rough),F0)-F0)*pow(1.-nv,5.);
 vec3 ambS=(u_hq>.5?prefReflection(reflect(-v,n),rough):roomReflection(reflect(-v,n),rough))*envF;hdr+=ambS;
 if(ccW>.05&&u_hq>.5){float cr=.06,ca=cr*cr,ca2=ca*ca,cd=nh*nh*(ca2-1.)+1.,Dc=ca2/max(PI*cd*cd,1e-6),kc=(cr+1.)*(cr+1.)/8.,Gc=(nv/(nv*(1.-kc)+kc))*(nl/max(nl*(1.-kc)+kc,1e-5));
  float Fc=.04+.96*pow(1.-vh,5.),Fv=.04+.96*pow(1.-nv,5.);Fv*=ccW;Fc*=ccW;hdr=hdr*(1.-Fv)+Dc*Gc*Fc/max(4.*nv*nl,1e-4)*nl*3.*visibility*white+prefReflection(reflect(-v,n),cr)*Fv;}
 if(u_vatlas>.5&&u_hq>.5&&u_capture<.5){hdr+=rimLight(normalize(vec3(.55,.35,-.75)),vec3(.35,1.05,1.5)*2.4,n,v,nv,albedo,rough,metal,F0)+rimLight(normalize(vec3(-.6,.25,.6)),vec3(1.5,.82,.42)*1.7,n,v,nv,albedo,rough,metal,F0);}
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
 function depth(mesh,m){gl.uniformMatrix4fv(lighting.depthMVP,false,m===id?lighting.lightVP:matMul(lighting.lightVP,m));drawDepthMesh(mesh)}
 const id=identityMatrix();
 // Ceiling fixtures emit below the ceiling: roof/HVAC above fixtures do not occlude them.
 for(const o of scene.objects)if(o.visible&&o.gpu&&o.material!=='glass'&&(o.center[1]+o.size[1]/2<3.5||o.category==='tunnel v2 control room'))depth(o.gpu,id);
 for(const r of scene.roadParts)if(r.gpu)depth(r.gpu,rollerModel(r,rollingState.rollerAngles[scene.roadParts.indexOf(r)]||0));
 for(const p of scene.vehicleParts)if(p.gpu){const i=wheelParts().indexOf(p);depth(p.gpu,i<0?vehicleModel():wheelModel(p,rollingState.wheelAngles[i]||0));}
 lighting.shadowKey=key;lighting.shadowPasses++;if(AETHER.M10)AETHER.M10.shadowPasses=lighting.shadowPasses;
 gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,glCanvas.width,glCanvas.height);
}
function bindLighting(capture=false){
 if(loc.pz===undefined)loc.pz=gl.getUniformLocation(program,'u_pz');if(loc.pz)gl.uniform2f(loc.pz,TUNNEL_V2.active?6.2:3.8,TUNNEL_V2.active?6.8:4.5);/* where the control-room probe takes over: its wall in the v2 tunnel is z = 6.5 */
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
   for(const o of scene.objects)if(o.visible&&o.gpu&&o.material!=='glass')drawMesh(o.gpu,o.tunnelRole==='rotating'&&YAW.rad?yawMatrix():id,{color:lightingColor(o),surface:surfaceFor(o),belt:o.name==='belt',beltTravel:0});
   lighting.capturedFaces++;
  }
 }
 gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.activeTexture(gl.TEXTURE0);
 for(const t of lighting.probes){gl.bindTexture(gl.TEXTURE_CUBE_MAP,t);gl.generateMipmap(gl.TEXTURE_CUBE_MAP);}gl.bindTexture(gl.TEXTURE_CUBE_MAP,null);
}
function lightingColor(o){return o.category==='lighting recess'||o.name.startsWith('m5.light.')?[.95,.935,.91,1]:[...o.color,1]}
























