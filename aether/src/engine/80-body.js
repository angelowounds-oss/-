if(!window.__BODY)window.__BODY={active:false,x:0,z:0,g:0,H:1.78,yaw:0,anchor:null,speed:0,t:0,parts:null,gen:-1,inTunnel:false};
const BODY_TMP=new Float64Array(3);
function bodyRadius(yRel){if(yRel<0||yRel>window.__BODY.H)return 0;return yRel<.85?.17:yRel<1.5?.25:.12}
function bodyInside(x,y,z){const B=window.__BODY;if(!B.active)return false;const R=bodyRadius(y-B.g);if(!R)return false;const dx=x-B.x,dz=z-B.z;return dx*dx+dz*dz<R*R}
function flowSample(frame,x,y,z,out){smokeSample(frame,x,y,z,out);const B=window.__BODY;if(!B.active)return true;const yr=y-B.g;if(yr<0||yr>B.H+.6)return true;
 const u=out[0],w=out[2],U=Math.hypot(u,w);if(U<1e-9)return true;const dx=x-B.x,dz=z-B.z,r2=dx*dx+dz*dz;if(r2>36)return true;
 const fy=yr<=B.H?1:1-(yr-B.H)/.6,Rl=Math.max(bodyRadius(Math.min(yr,B.H)),.12);
 if(r2<Rl*Rl*fy){out[0]=0;out[1]=0;out[2]=0;return true}
 const r=Math.sqrt(r2),nx=dx/r,nz=dz/r,Un=u*nx+w*nz,k=Rl*Rl/r2*fy;out[0]=u-k*(2*Un*nx-u);out[2]=w-k*(2*Un*nz-w);
 const ex=u/U,ez=w/U,s=dx*ex+dz*ez,l=-dx*ez+dz*ex;
 if(s>0){const wd=Rl*1.4+.2*s,env=Math.exp(-(l/wd)*(l/wd))*Math.exp(-s/3.2)*fy,ph=6.2832*(B.t/1.4-s/1.3),grow=1-Math.exp(-s/.35);
  const def=1-.5*env*grow;out[0]*=def;out[2]*=def;const vl=.8*U*env*grow*Math.sin(ph);out[0]+=-ez*vl;out[2]+=ex*vl;out[1]+=.22*U*env*grow*Math.sin(ph*1.3+1.1)}
 else if(r<1.2){const up=Math.exp(-(r-Rl)/.35)*Math.max(0,-s/r)*.25*U*Math.max(0,1-Math.abs(yr-B.H)/.4);out[1]+=up}
 return true}
function bodyKey(){const B=window.__BODY;return B.active?('B'+Math.round(B.x*25)+','+Math.round(B.z*25)+','+Math.round(B.g*20)+','+Math.floor(B.t*12)+'|'):''}
function bodyTick(){const B=window.__BODY;B.t=window.__RIB?.t||0;
 if(fpv.enabled){B.anchor=null;const inT=fpv.z<DOOR.landZ;B.inTunnel=inT;B.active=inT;if(inT){B.x=fpv.x;B.z=fpv.z;B.g=fpv.gy??doorGround(fpv.x,fpv.z);B.yaw=fpv.yaw}}
 else if(B.anchor){B.active=true;B.inTunnel=true;B.x=B.anchor.x;B.z=B.anchor.z;B.g=B.anchor.g;B.yaw=B.anchor.yaw}else{B.active=false;B.inTunnel=false}
 const f=m13FrameState.frame;B.speed=0;if(B.active&&f&&f.fields?.velocity?.data&&smokeInside(f,B.x,B.g+1.2,B.z)){smokeSample(f,B.x,B.g+1.2,B.z,BODY_TMP);B.speed=Math.hypot(BODY_TMP[0],BODY_TMP[1],BODY_TMP[2])}if(window.__LIVE&&window.__LIVE.ok&&window.__LIVE.enabled)B.speed=B.active?window.__LIVE.speedAt:0}
function bodyDraw(vp){const B=window.__BODY;if(!B.active||fpv.enabled)return;try{
 if(!B.parts||B.gen!==runtimeGeneration){const P=[[[-.1,.45,0],[.15,.9,.17]],[[.1,.45,0],[.15,.9,.17]],[[0,1.19,0],[.46,.62,.26]],[[-.31,1.16,0],[.1,.62,.12]],[[.31,1.16,0],[.1,.62,.12]],[[0,1.56,0],[.1,.08,.1]],[[0,1.7,0],[.2,.24,.22]]];
  B.parts=P.map(([c,s])=>{const o={type:'box',name:'body',center:c,size:s,bevel:.035,color:[.9,.93,.95]};bevelMesh(o);const m=o._mesh,uv=new Float32Array(m.positions.length/3*2);return bindMesh(m.positions,m.normals,uv,m.indices)});B.gen=runtimeGeneration}
 const a=-B.yaw,c=Math.cos(a),s=Math.sin(a),M=new Float64Array([c,0,-s,0,0,1,0,0,s,0,c,0,B.x,B.g,B.z,1]),mvp=matMul(vp,M),surf=(materialLibrary.PaintedSteelWhite||materialLibrary.PaintedSteelGray).surface;
 gl.useProgram(program);for(const gpu of B.parts){gl.uniformMatrix4fv(loc.model,false,M);gl.uniformMatrix4fv(loc.mvp,false,mvp);drawMesh(gpu,M,{color:[.92,.95,.98,1],surface:surf},1)}
}catch(e){B.drawError=String(e?.message||e)}}
window.__bodyOutside=()=>{const B=window.__BODY;if(!fpv.enabled||!B.active)return false;B.anchor={x:fpv.x,z:fpv.z,g:doorGround(fpv.x,fpv.z),yaw:fpv.yaw};setPreset('Side');camera.fov=55;const side=B.anchor.z>0?-1:1;camera.eye=[B.anchor.x-3.3,2.5,B.anchor.z+side*3.1];camera.target=[B.anchor.x+1.1,1.0,B.anchor.z];camera.up=[0,1,0];return true};
window.__bodyReturn=()=>{const B=window.__BODY;const a=B.anchor;startWalk();if(a){fpv.x=a.x;fpv.z=a.z;fpv.yaw=a.yaw;fpv.gy=undefined}return !!a};

