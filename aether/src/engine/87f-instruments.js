/* ===== VIRTUAL INSTRUMENTS: point probes (pitot / static tap), a vertical wake rake and a wake-survey plane, all read from the solver's own fields.
   Each sample = trilinear MAC velocity + cell-centred kinematic pressure + vorticity (central differences) + solid fraction, produced by one small
   fragment pass into an RGBA32F strip and read back asynchronously (PBO + fence). Coefficients are relative to the free-stream reference slot 0
   (the same point as the surface-pressure map): Cp = (p - p_r)/q_r, Cp0 = (p + |u|^2/2 - p0_r)/q_r with q_r = |u_r|^2/2, so Cp0 = 0 in the undisturbed jet
   and goes negative where total pressure is lost (wake). Qualitative, same accuracy limits as the solver (cells 7.5-24 cm, no boundary layer; L4, L26). */
const INSTR={probes:[],max:16,nextId:1,rake:{on:false,n:24,y0:.05,y1:2.0,z:0},plane:{on:false,mode:0,alpha:.8,ny:18,nz:30,y0:0,y1:1.8,z0:-1.5,z1:1.5},wakeX:3.3,
 ref:null,list:null,wake:null,est:null,t:null,tp:null,prog:null,gen:-1,err:null,job:null,lastKick:0,tick:0,pbo:null,pboBytes:0,pts:null,hist:[],reads:0,cap:{list:48,planeMax:1024}};
window.__INSTR=INSTR;
const INSTR_TAIL=`
 vec3 P=(pos-uMin)/uH;
 if((x&1)==0){vec3 v=VEL(uVel,P,uN,uTX);float p=TRI(uPr,P-.5,uN,uTX).x;o=vec4(v,p);}
 else{vec3 ex=vec3(1.,0.,0.),ey=vec3(0.,1.,0.),ez=vec3(0.,0.,1.);
  vec3 dx=VEL(uVel,P+ex,uN,uTX)-VEL(uVel,P-ex,uN,uTX),dy=VEL(uVel,P+ey,uN,uTX)-VEL(uVel,P-ey,uN,uTX),dz=VEL(uVel,P+ez,uN,uTX)-VEL(uVel,P-ez,uN,uTX);
  vec3 w=vec3(dy.z/uH.y-dz.y/uH.z,dz.x/uH.z-dx.z/uH.x,dx.y/uH.x-dy.x/uH.y)*.5;float id;float phi=PHIT(uSol,P-.5,uN,uTX,id);o=vec4(w,phi);}}`;
MAC_FS.pprobe=`uniform sampler2D uVel,uPr,uSol;uniform vec4 uPts[48];uniform int uNp;
void main(){int x=int(gl_FragCoord.x);int i=x>>1;if(i>=uNp){o=vec4(0.);return;}vec3 pos=uPts[i].xyz;`+INSTR_TAIL;
MAC_FS.pplane=`uniform sampler2D uVel,uPr,uSol;uniform vec4 uPl0,uPl1;
void main(){int x=int(gl_FragCoord.x);int i=x>>1;int ny=int(uPl1.z+.5),nz=int(uPl1.w+.5);if(i>=ny*nz){o=vec4(0.);return;}
 int iy=i%ny,iz=i/ny;vec3 pos=vec3(uPl0.x,mix(uPl0.y,uPl0.z,(float(iy)+.5)/float(ny)),mix(uPl1.x,uPl1.y,(float(iz)+.5)/float(nz)));`+INSTR_TAIL;
const INSTR_PLANE_VS=`#version 300 es
precision highp float;uniform mat4 uVP;uniform vec4 uBox;uniform float uX;out vec2 vT;
void main(){vec2 c=vec2(float(gl_VertexID&1),float((gl_VertexID>>1)&1));vT=c;gl_Position=uVP*vec4(uX,mix(uBox.x,uBox.y,c.x),mix(uBox.z,uBox.w,c.y),1.);}`;
const INSTR_PLANE_FS=`#version 300 es
precision highp float;precision highp sampler2D;
in vec2 vT;uniform sampler2D uS;uniform int uNy,uNz,uMode;uniform vec4 uRef;uniform float uA,uU;out vec4 o;
vec4 S(int iy,int iz,int k){iy=clamp(iy,0,uNy-1);iz=clamp(iz,0,uNz-1);return texelFetch(uS,ivec2(2*(iy+uNy*iz)+k,0),0);}
void main(){vec2 q=vec2(vT.x*float(uNy)-.5,vT.y*float(uNz)-.5);ivec2 i=ivec2(floor(q));vec2 f=q-vec2(i);
 vec4 a=mix(mix(S(i.x,i.y,0),S(i.x+1,i.y,0),f.x),mix(S(i.x,i.y+1,0),S(i.x+1,i.y+1,0),f.x),f.y);
 vec4 b=mix(mix(S(i.x,i.y,1),S(i.x+1,i.y,1),f.x),mix(S(i.x,i.y+1,1),S(i.x+1,i.y+1,1),f.x),f.y);
 if(b.w>.5)discard;
 float ur2=dot(uRef.xyz,uRef.xyz),qr=.5*max(ur2,.01);float cp0=(a.w-uRef.w+.5*(dot(a.xyz,a.xyz)-ur2))/qr;
 vec3 col;float al;
 if(uMode==0){float t=clamp(-cp0/.8,0.,1.);al=smoothstep(.04,.35,t);col=mix(mix(vec3(.1,.25,1.),vec3(.9,.1,.6),smoothstep(0.,.5,t)),vec3(1.,.9,.2),smoothstep(.5,1.,t));}
 else if(uMode==1){float t=clamp(b.x*.5/max(uU,.5),-1.,1.);al=smoothstep(.08,.5,abs(t));col=t<0.?vec3(.15,.45,1.):vec3(1.,.3,.15);}
 else{float r=length(a.xyz)/sqrt(max(ur2,.01));float t=clamp(r-1.,-1.,.4);al=smoothstep(.05,.4,abs(t));col=t<0.?mix(vec3(.2,.35,1.),vec3(.05,.1,.5),clamp(-t,0.,1.)):vec3(1.,.6,.1);}
 o=vec4(col*1.15,al*uA);}`;
const INSTR_PT_VS=`#version 300 es
precision highp float;uniform mat4 uVP;uniform vec4 uP[48];uniform float uPx;out vec4 vC;
void main(){vec4 p=uP[gl_VertexID];gl_Position=uVP*vec4(p.xyz,1.);gl_PointSize=uPx*(p.w<1.5?1.:.55);vC=p.w<1.5?vec4(.2,.9,1.,1.):vec4(1.,.85,.2,1.);}`;
const INSTR_PT_FS=`#version 300 es
precision highp float;in vec4 vC;out vec4 o;
void main(){vec2 d=gl_PointCoord-.5;float r=length(d)*2.;if(r>1.)discard;float ring=smoothstep(.55,.7,r)*(1.-smoothstep(.9,1.,r));o=vec4(vC.rgb*1.4,max(ring,.55*(1.-smoothstep(.3,.5,r))));}`;
function instrBox(){const b=AETHER.VEHICLE_TRANSFORM?.worldAABB;return b?{min:b.min.slice(),max:b.max.slice()}:{min:[-2.35,0,-.96],max:[2.35,1.3,.96]}}
/* presets are placed relative to the car's actual bounding box (follows yaw) */
INSTR.presets=()=>{const b=instrBox(),cx=(b.min[0]+b.max[0])/2,cz=(b.min[2]+b.max[2])/2,P=[['정체점(차 앞 0.3 m)',[b.min[0]-.3,.55,cz]],['지붕 위 0.3 m',[cx,b.max[1]+.3,cz]],['후류(후미 뒤 0.8 m)',[b.max[0]+.8,.7,cz]],['차 옆 0.4 m',[cx,.7,b.max[2]+.4]],['후류 상부(후미 뒤 1.5 m, 높이 1.3 m)',[b.max[0]+1.5,1.3,cz]]];
 if(TUNNEL_V2.active)P.push(['노즐 출구 중심',[TUNNEL_SPEC.nozzle.x1+.3,TUNNEL_SPEC.nozzle.outH/2,0]]);return P};
INSTR.inDomain=p=>!!MAC.min&&!!MAC.N&&p.every((v,i)=>Number.isFinite(v)&&v>MAC.min[i]+MAC.h[i]&&v<MAC.min[i]+MAC.N[i]*MAC.h[i]-MAC.h[i]);
INSTR.add=(pos,name)=>{if(INSTR.probes.length>=INSTR.max||!Array.isArray(pos)||pos.length!==3||!pos.every(Number.isFinite))return null;const pr={id:INSTR.nextId++,name:name||('P'+(INSTR.nextId-1)),pos:pos.slice(),h:[],val:null};INSTR.probes.push(pr);return pr};
INSTR.remove=id=>{const i=INSTR.probes.findIndex(p=>p.id===id);if(i>=0)INSTR.probes.splice(i,1);return i>=0};
INSTR.clear=()=>{INSTR.probes.length=0;INSTR.hist.length=0};
/* point under the view centre, 3 m ahead of the camera */
INSTR.addAtView=()=>{const e=camera.eye,t=camera.target,d=[t[0]-e[0],t[1]-e[1],t[2]-e[2]],l=Math.hypot(...d)||1;return INSTR.add([e[0]+3*d[0]/l,e[1]+3*d[1]/l,e[2]+3*d[2]/l],'시선 앞 3 m')};
INSTR.setRake=(on,x)=>{INSTR.rake.on=!!on;if(Number.isFinite(x))INSTR.wakeX=x;INSTR.wake=null};
INSTR.setPlane=(on,mode)=>{INSTR.plane.on=!!on;if(mode!==undefined)INSTR.plane.mode=Math.max(0,Math.min(2,mode|0))};
INSTR.setX=x=>{if(Number.isFinite(x))INSTR.wakeX=x;INSTR.wake=null;INSTR.est=null};
function instrRakePts(){const R=INSTR.rake,a=[];for(let i=0;i<R.n;i++)a.push([INSTR.wakeX,R.y0+(R.y1-R.y0)*i/(R.n-1),R.z]);return a}
function instrInit(){if(INSTR.gen===runtimeGeneration&&INSTR.t)return true;
 if(!MAC.prog?.pprobe||!MAC.t||LIVE.impl!=='MAC'||!MAC.lv)return false;
 INSTR.t=liveTarget(2048,1,gl.RGBA32F,gl.RGBA,gl.FLOAT);INSTR.tp=liveTarget(2048,1,gl.RGBA32F,gl.RGBA,gl.FLOAT);
 INSTR.dprog=liveCompile(INSTR_PLANE_FS,INSTR_PLANE_VS);INSTR.pprog=liveCompile(INSTR_PT_FS,INSTR_PT_VS);INSTR.gen=runtimeGeneration;INSTR.job=null;INSTR.pbo=null;INSTR.pboBytes=0;INSTR.ref=null;INSTR.wake=null;INSTR.est=null;return true}
function instrReadKick(target,np,kind){const bytes=np*2*16;if(!INSTR.pbo)INSTR.pbo=gl.createBuffer();gl.bindBuffer(gl.PIXEL_PACK_BUFFER,INSTR.pbo);if(INSTR.pboBytes<bytes){gl.bufferData(gl.PIXEL_PACK_BUFFER,bytes,gl.STREAM_READ);INSTR.pboBytes=bytes}
 gl.bindFramebuffer(gl.FRAMEBUFFER,target.f);gl.readPixels(0,0,np*2,1,gl.RGBA,gl.FLOAT,0);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 INSTR.job={fence:gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0),np,kind,gen:LIVE.gen,t:LIVE.t,U:MAC.U,x:INSTR.wakeX};gl.flush()}
/* decode one pair of texels into physical quantities against the reference sample */
function instrDerive(a,b,ref){const u=[a[0],a[1],a[2]],sp=Math.hypot(...u),o={u,speed:sp,p:a[3],w:[b[0],b[1],b[2]],vort:Math.hypot(b[0],b[1],b[2]),solid:b[3]>.5};
 if(ref){const qr=.5*(ref.u[0]**2+ref.u[1]**2+ref.u[2]**2);if(qr>.05){o.Cp=(a[3]-ref.p)/qr;o.Cp0=(a[3]-ref.p+.5*(sp*sp-2*qr))/qr}}return o}
function instrPoll(){const J=INSTR.job;if(!J)return;const r=gl.clientWaitSync(J.fence,0,0);if(r===gl.TIMEOUT_EXPIRED)return;gl.deleteSync(J.fence);INSTR.job=null;if(r===gl.WAIT_FAILED||J.gen!==LIVE.gen)return;
 const buf=new Float32Array(J.np*8);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,INSTR.pbo);gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,0,buf);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);INSTR.reads++;
 const at=i=>[buf.subarray(i*8,i*8+4),buf.subarray(i*8+4,i*8+8)];
 if(J.kind==='list'){const [ra,rb]=at(0);const ref=instrDerive(ra,rb,null);ref.valid=ref.speed>.3&&Number.isFinite(ref.p);INSTR.ref=ref;const n=INSTR.probes.length;
  INSTR.probes.forEach((pr,k)=>{const [a,b]=at(1+k),d=instrDerive(a,b,ref.valid?ref:null);pr.val=d;pr.h.push([J.t,d.speed,d.Cp??null]);while(pr.h.length>60)pr.h.shift()});
  if(INSTR.rake.on&&J.x===INSTR.wakeX){const m=INSTR.rake.n,prof=[];for(let i=0;i<m;i++){const [a,b]=at(1+n+i),d=instrDerive(a,b,ref.valid?ref:null),y=INSTR.rake.y0+(INSTR.rake.y1-INSTR.rake.y0)*i/(m-1);prof.push({y,Cp0:d.Cp0??null,speed:d.speed,solid:d.solid})}INSTR.wake={x:J.x,prof,t:J.t}}
  INSTR.list={t:J.t,U:J.U}}
 else{/* plane survey: total-pressure-deficit integral, Cd_wake = sum(max(-Cp0,0) dA)/A_ref over fluid samples (the Betz form without the static-pressure and cross-flow terms). The box is the car's wake only (|z| <= 1.5 m, y <= 1.8 m): outside it the jet's own shear layer would be counted. Close behind the car the static pressure has not recovered, so this over-estimates the drag there (see KNOWN_LIMITATIONS L35). */
  const ref=INSTR.ref;if(!ref?.valid||J.x!==INSTR.wakeX)return;/* a read issued before the slider moved belongs to the old plane: drop it */const P=INSTR.plane,ny=P.ny,nz=P.nz,dA=(P.y1-P.y0)/ny*((P.z1-P.z0)/nz);let s=0,cnt=0,solid=0;const grid=new Float32Array(ny*nz),spd=new Float32Array(ny*nz);
  for(let i=0;i<ny*nz;i++){const [a,b]=at(i),d=instrDerive(a,b,ref);spd[i]=d.speed;if(d.solid){solid++;grid[i]=NaN;continue}if(d.Cp0!==undefined&&d.Cp0<0){s+=-d.Cp0*dA;grid[i]=-d.Cp0}cnt++}INSTR.planeGrid={ny,nz,loss:grid,speed:spd,x:J.x};
  const A=LIVE.forces?.A||0;INSTR.est={x:J.x,lossArea:s,A,CdWake:A>0?s/A:null,CdBalance:LIVE.forces?.CdMean??LIVE.forces?.Cd??null,fluid:cnt,solid,t:J.t}}}
/* once per frame (render loop): schedule a read every 250 ms, alternating the point list and the survey plane; the plane texture itself refreshes every 3rd frame */
function instrStep(now){if(!LIVE.ok||LIVE.impl!=='MAC'||!MAC.t||!MAC.lv)return;const need=INSTR.probes.length||INSTR.rake.on||INSTR.plane.on;if(!need&&!INSTR.job)return;
 try{if(!instrInit())return;instrPoll();const G=MAC.G,vel=MAC.t.velA.t,pr=MAC.lv[0].T.pA.t,sol=MAC.t.sol.t;gl.bindVertexArray(LIVE.vao);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
  INSTR.tick++;const P=INSTR.plane;
  if(P.on&&INSTR.tick%3===0){const o={f:INSTR.tp.f,t:INSTR.tp.t,w:2048,h:1};macPass('pplane',o,{uVel:vel,uPr:pr,uSol:sol},{uPl0:[INSTR.wakeX,P.y0,P.y1,0],uPl1:[P.z0,P.z1,P.ny,P.nz]},G,G)}
  if(!INSTR.job&&now-INSTR.lastKick>250){INSTR.lastKick=now;const planeTurn=P.on&&INSTR.ref?.valid&&(INSTR.reads%2===1);
   if(planeTurn){const o={f:INSTR.tp.f,t:INSTR.tp.t,w:2048,h:1};macPass('pplane',o,{uVel:vel,uPr:pr,uSol:sol},{uPl0:[INSTR.wakeX,P.y0,P.y1,0],uPl1:[P.z0,P.z1,P.ny,P.nz]},G,G);instrReadKick(INSTR.tp,P.ny*P.nz,'plane')}
   else{const list=[CPMAP.ref(),...INSTR.probes.map(p=>p.pos),...(INSTR.rake.on?instrRakePts():[])].slice(0,INSTR.cap.list),arr=new Float32Array(48*4);list.forEach((p,i)=>{arr[i*4]=p[0];arr[i*4+1]=p[1];arr[i*4+2]=p[2]});
    const o={f:INSTR.t.f,t:INSTR.t.t,w:2048,h:1};macPass('pprobe',o,{uVel:vel,uPr:pr,uSol:sol},{uPts:arr,uNp:{int:list.length}},G,G);instrReadKick(INSTR.t,list.length,'list')}}
  INSTR.err=null}
 catch(e){INSTR.err=String(e?.message||e);INSTR.probes.length=0;INSTR.rake.on=false;INSTR.plane.on=false}
 finally{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null);gl.enable(gl.DEPTH_TEST)}}
/* wake plane + probe markers drawn over the composite with the same jittered view-projection as the scene pass */
function instrDraw(vp,rw){if(INSTR.err||!INSTR.t||!LIVE.ok||LIVE.impl!=='MAC')return;const P=INSTR.plane;
 gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(false);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
 if(P.on&&INSTR.ref?.valid){const p=INSTR.dprog;gl.useProgram(p);gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE8);gl.bindTexture(gl.TEXTURE_2D,INSTR.tp.t);gl.uniform1i(liveU(p,'uS'),8);
  gl.uniformMatrix4fv(liveU(p,'uVP'),false,vp);gl.uniform4f(liveU(p,'uBox'),P.y0,P.y1,P.z0,P.z1);gl.uniform1f(liveU(p,'uX'),INSTR.wakeX);gl.uniform1i(liveU(p,'uNy'),P.ny);gl.uniform1i(liveU(p,'uNz'),P.nz);gl.uniform1i(liveU(p,'uMode'),P.mode);
  const r=INSTR.ref;gl.uniform4f(liveU(p,'uRef'),r.u[0],r.u[1],r.u[2],r.p);gl.uniform1f(liveU(p,'uA'),P.alpha);gl.uniform1f(liveU(p,'uU'),MAC.U||5);gl.drawArrays(gl.TRIANGLE_STRIP,0,4)}
 const pts=[...INSTR.probes.map(p=>[...p.pos,1]),...(INSTR.rake.on?instrRakePts().map(p=>[...p,2]):[])].slice(0,48);
 if(pts.length){const p=INSTR.pprog,arr=new Float32Array(48*4);pts.forEach((q,i)=>arr.set(q,i*4));gl.useProgram(p);gl.bindVertexArray(null);gl.uniformMatrix4fv(liveU(p,'uVP'),false,vp);gl.uniform4fv(liveU(p,'uP'),arr);gl.uniform1f(liveU(p,'uPx'),Math.max(10,rw/70));gl.drawArrays(gl.POINTS,0,pts.length)}
 gl.disable(gl.BLEND);gl.depthMask(true);gl.bindTexture(gl.TEXTURE_2D,null);gl.activeTexture(gl.TEXTURE0)}
/* history export for the UI (CSV text) */
INSTR.csv=()=>{const rows=['kind,id,name,x,y,z,t_s,speed_ms,Cp,Cp0,vort_1s'];for(const p of INSTR.probes)for(const h of p.h)rows.push(['probe',p.id,p.name,...p.pos.map(v=>v.toFixed(3)),h[0].toFixed(3),h[1].toFixed(3),h[2]===null?'':h[2].toFixed(4),'',''].join(','));
 if(INSTR.wake)for(const q of INSTR.wake.prof)rows.push(['rake','','x='+INSTR.wake.x.toFixed(2),INSTR.wake.x.toFixed(3),q.y.toFixed(3),INSTR.rake.z.toFixed(3),INSTR.wake.t.toFixed(3),q.speed.toFixed(3),'',q.Cp0===null?'':q.Cp0.toFixed(4),''].join(','));return rows.join('\n')};
