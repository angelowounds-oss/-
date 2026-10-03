/* ===== SURFACE PRESSURE: the solver's pressure field sampled just outside the car surface (1.5 cells along the normal) and drawn as a
   translucent diverging colour map over the composite. Cp = p / (U^2 / 2), p is the kinematic pressure of the projection step relative
   to the outlet. Qualitative (cells are 7.5-16 cm, the boundary layer is not resolved); same field the drag integral uses. */
const CPMAP={on:/cp=1/.test(location.hash),prog:null,gen:-1,alpha:.85,range:1.0,err:null};
window.__CPMAP=CPMAP;
const CP_VS=`#version 300 es
precision highp float;precision highp int;precision highp sampler2D;
layout(location=0) in vec3 aP;layout(location=1) in vec3 aN;
uniform mat4 uVP,uM;uniform sampler2D uPr;uniform ivec3 uN;uniform int uTX;uniform vec3 uMin,uH;uniform float uU,uOff,uRange;
out float vCp;
float PF(ivec3 c){c=clamp(c,ivec3(0),uN-1);return texelFetch(uPr,ivec2((c.z%uTX)*uN.x+c.x,(c.z/uTX)*uN.y+c.y),0).x;}
float PT(vec3 q){q=clamp(q,vec3(0.),vec3(uN-1));ivec3 i=min(ivec3(floor(q)),uN-1);vec3 f=q-vec3(i);
 float a=mix(PF(i),PF(i+ivec3(1,0,0)),f.x),b=mix(PF(i+ivec3(0,1,0)),PF(i+ivec3(1,1,0)),f.x),c=mix(PF(i+ivec3(0,0,1)),PF(i+ivec3(1,0,1)),f.x),d=mix(PF(i+ivec3(0,1,1)),PF(i+ivec3(1,1,1)),f.x);
 return mix(mix(a,b,f.y),mix(c,d,f.y),f.z);}
void main(){vec4 w=uM*vec4(aP,1.);vec3 n=normalize(mat3(uM)*aN);vec3 q=w.xyz+n*uOff;vec3 g=(q-uMin)/uH-.5;
 vCp=PT(g)/(.5*max(uU,.5)*max(uU,.5));gl_Position=uVP*w;}`;
const CP_FS=`#version 300 es
precision highp float;in float vCp;uniform float uA,uRange;out vec4 o;
vec3 ramp(float t){/* -1 suction (blue) .. 0 white .. +1 stagnation (red) */vec3 lo=vec3(.1,.28,.95),mid=vec3(1.),hi=vec3(.95,.12,.08);return t<0.?mix(mid,lo,-t):mix(mid,hi,t);}
void main(){float t=clamp(vCp/uRange,-1.,1.);float a=uA*smoothstep(.08,.45,abs(t));o=vec4(ramp(t)*1.1,a);}`;
function cpDraw(vp){if(!CPMAP.on||!MAC.lv||!MAC.t||LIVE.impl!=='MAC'||!LIVE.ok||CPMAP.err)return;
 try{if(CPMAP.gen!==runtimeGeneration||!CPMAP.prog){CPMAP.prog=liveCompile(CP_FS,CP_VS);CPMAP.gen=runtimeGeneration}
  const p=CPMAP.prog,G=MAC.G,N=MAC.N,pa=MAC.lv[0].T.pA.t,wp=wheelParts();gl.useProgram(p);
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(false);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(-2,-2);
  gl.activeTexture(gl.TEXTURE8);gl.bindTexture(gl.TEXTURE_2D,pa);gl.uniform1i(liveU(p,'uPr'),8);
  gl.uniformMatrix4fv(liveU(p,'uVP'),false,vp);gl.uniform3i(liveU(p,'uN'),N[0],N[1],N[2]);gl.uniform1i(liveU(p,'uTX'),G.tx);gl.uniform3f(liveU(p,'uMin'),...MAC.min);gl.uniform3f(liveU(p,'uH'),...MAC.h);
  gl.uniform1f(liveU(p,'uU'),MAC.U);gl.uniform1f(liveU(p,'uOff'),1.5*Math.min(...MAC.h));gl.uniform1f(liveU(p,'uA'),CPMAP.alpha);gl.uniform1f(liveU(p,'uRange'),CPMAP.range);
  for(const part of scene.vehicleParts){const m=part.gpu;if(!m)continue;const i=wp.indexOf(part);gl.uniformMatrix4fv(liveU(p,'uM'),false,i<0?vehicleModel():wheelModel(part,rollingState.wheelAngles[i]||0));
   gl.bindBuffer(gl.ARRAY_BUFFER,m.pb);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,m.nb);gl.enableVertexAttribArray(1);gl.vertexAttribPointer(1,3,gl.FLOAT,false,0,0);
   gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,m.ib);gl.drawElements(gl.TRIANGLES,m.count,m.type,0)}
  gl.disableVertexAttribArray(0);gl.disableVertexAttribArray(1);gl.disable(gl.POLYGON_OFFSET_FILL);gl.disable(gl.BLEND);gl.depthMask(true);gl.bindTexture(gl.TEXTURE_2D,null);gl.activeTexture(gl.TEXTURE0)}
 catch(e){CPMAP.err=String(e?.message||e);CPMAP.on=false}}
