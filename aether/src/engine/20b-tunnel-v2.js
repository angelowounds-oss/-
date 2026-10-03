/* ===== TUNNEL V2 scene: loads the procedurally generated GLB (tools/gen -> assets/tunnel-asset.js), removes the legacy box room and puts the
   plenum, nozzle, collector, turntable and window into scene.objects. Static parts are plain scene objects; 'rotating' parts are kept
   in TUNNEL_V2.rotating so the turntable yaw can spin them. The CFD side reads the same TUNNEL_SPEC (analytic solids), not this GLB. */
const TUNNEL_V2={active:false,objects:[],rotating:[],stats:null,error:null};
window.__TUNNEL_V2=TUNNEL_V2;
/* legacy facility categories that the v2 tunnel replaces; rolling-road, wheel-station, instrumentation and the user's console survive */
const TUNNEL_V2_REMOVE=new Set(['structure','floor seams','wall panels','ceiling','lighting recess','transitions','rails','measurement','service door','equipment mounts','maintenance hatch','control room blockout','observation opening','observation glass','m5 architecture','m5 ceiling','m8 equipment','door']);
function buildTunnelV2(){
 if(!TUNNEL_V2_ON)return;
 try{
  const A=window.__ASSETS?.TUNNEL_ASSET;if(!A)throw Error('TUNNEL_ASSET missing');
  const bytes=bytesFromBase64(A.base64);if(bytes.length!==A.bytes)throw Error('TUNNEL_GLB_LENGTH');
  const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(dv.getUint32(0,true)!==0x46546c67||dv.getUint32(4,true)!==2||dv.getUint32(8,true)!==bytes.length)throw Error('TUNNEL_GLB_HEADER');
  const jl=dv.getUint32(12,true),json=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+jl))),bin=bytes.subarray(20+jl+8);
  scene.objects=scene.objects.filter(o=>!TUNNEL_V2_REMOVE.has(o.category)&&!o.name.startsWith('m5.')&&!o.name.startsWith('m8.'));
  TUNNEL_V2.objects.length=0;TUNNEL_V2.rotating.length=0;let tri=0,vert=0;
  for(const node of json.nodes){
   const prim=json.meshes[node.mesh].primitives[0],mat=json.materials[prim.material],name=mat.name,lib=materialLibrary[name];
   if(!lib)throw Error('TUNNEL_MATERIAL_UNKNOWN '+name);
   const pa=readAccessor(json,bin,prim.attributes.POSITION),na=readAccessor(json,bin,prim.attributes.NORMAL),ua=readAccessor(json,bin,prim.attributes.TEXCOORD_0),ia=readAccessor(json,bin,prim.indices);
   const mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];for(let i=0;i<pa.data.length;i+=3)for(let k=0;k<3;k++){const v=pa.data[i+k];if(v<mn[k])mn[k]=v;if(v>mx[k])mx[k]=v}
   const ex=node.extras||{},o={type:'authored-mesh',name:'tv2.'+node.name,center:mn.map((v,k)=>(v+mx[k])/2),size:mn.map((v,k)=>Math.max(mx[k]-v,1e-3)),color:mat.pbrMetallicRoughness.baseColorFactor.slice(),colorLinear:true,material:ex.glass?'glass':'solid',visible:true,bevel:0,category:'tunnel v2 '+(ex.category||''),
    _mesh:{positions:new Float32Array(pa.data),normals:new Float32Array(na.data),uvs:new Float32Array(ua.data),indices:new Uint32Array(ia.data)},pbrMaterial:lib,tunnelRole:ex.role||'static'};
   if(ex.category==='lighting recess')o.category='lighting recess';
   scene.objects.push(o);TUNNEL_V2.objects.push(o);if(ex.role==='rotating')TUNNEL_V2.rotating.push(o);tri+=ia.data.length/3;vert+=pa.data.length/3;
  }
  TUNNEL_V2.stats={objects:TUNNEL_V2.objects.length,triangles:tri,vertices:vert,sha256:A.sha256};TUNNEL_V2.active=true;
 }catch(e){TUNNEL_V2.error=String(e?.message||e);TUNNEL_V2.active=false;diagnostics.warnings.push({time:now(),source:'tunnel-v2',message:TUNNEL_V2.error})}
}
buildTunnelV2();
