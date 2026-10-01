if(!window.__BODY)window.__BODY={active:false,x:0,z:0,g:0,H:1.78,yaw:0,anchor:null,speed:0,t:0,parts:null,gen:-1,inTunnel:false};




function bodyTick(){const B=window.__BODY;B.t=0;
 if(fpv.enabled){B.anchor=null;const inT=fpv.z<DOOR.landZ;B.inTunnel=inT;B.active=inT;if(inT){B.x=fpv.x;B.z=fpv.z;B.g=fpv.gy??doorGround(fpv.x,fpv.z);B.yaw=fpv.yaw}}
 else if(B.anchor){B.active=true;B.inTunnel=true;B.x=B.anchor.x;B.z=B.anchor.z;B.g=B.anchor.g;B.yaw=B.anchor.yaw}else{B.active=false;B.inTunnel=false}
 B.speed=(window.__LIVE&&window.__LIVE.ok&&window.__LIVE.enabled&&B.active)?window.__LIVE.speedAt:0}
function bodyDraw(vp){const B=window.__BODY;if(!B.active||fpv.enabled)return;try{
 if(!B.parts||B.gen!==runtimeGeneration){const P=[[[-.1,.45,0],[.15,.9,.17]],[[.1,.45,0],[.15,.9,.17]],[[0,1.19,0],[.46,.62,.26]],[[-.31,1.16,0],[.1,.62,.12]],[[.31,1.16,0],[.1,.62,.12]],[[0,1.56,0],[.1,.08,.1]],[[0,1.7,0],[.2,.24,.22]]];
  B.parts=P.map(([c,s])=>{const o={type:'box',name:'body',center:c,size:s,bevel:.035,color:[.9,.93,.95]};bevelMesh(o);const m=o._mesh,uv=new Float32Array(m.positions.length/3*2);return bindMesh(m.positions,m.normals,uv,m.indices)});B.gen=runtimeGeneration}
 const a=-B.yaw,c=Math.cos(a),s=Math.sin(a),M=new Float64Array([c,0,-s,0,0,1,0,0,s,0,c,0,B.x,B.g,B.z,1]),mvp=matMul(vp,M),surf=(materialLibrary.PaintedSteelWhite||materialLibrary.PaintedSteelGray).surface;
 gl.useProgram(program);for(const gpu of B.parts){gl.uniformMatrix4fv(loc.model,false,M);gl.uniformMatrix4fv(loc.mvp,false,mvp);drawMesh(gpu,M,{color:[.92,.95,.98,1],surface:surf},1)}
}catch(e){B.drawError=String(e?.message||e)}}
window.__bodyOutside=()=>{const B=window.__BODY;if(!fpv.enabled||!B.active)return false;B.anchor={x:fpv.x,z:fpv.z,g:doorGround(fpv.x,fpv.z),yaw:fpv.yaw};setPreset('Side');camera.fov=55;const side=B.anchor.z>0?-1:1;camera.eye=[B.anchor.x-3.3,2.5,B.anchor.z+side*3.1];camera.target=[B.anchor.x+1.1,1.0,B.anchor.z];camera.up=[0,1,0];return true};
window.__bodyReturn=()=>{const B=window.__BODY;const a=B.anchor;startWalk();if(a){fpv.x=a.x;fpv.z=a.z;fpv.yaw=a.yaw;fpv.gy=undefined}return !!a};

