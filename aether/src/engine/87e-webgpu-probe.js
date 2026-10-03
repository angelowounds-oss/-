/* ===== WEBGPU PROBE (diagnostic, not a solver): checks that WebGPU compute exists on this device and times a 7-point stencil sweep on the
   same cell counts as the WebGL2 solver tiers, so a port of the pressure solver can be judged on measured numbers. Runs only on request
   (settings panel button or #webgpu=1). Not executable in the headless test environment (navigator.gpu is absent there). */
const GPUPROBE={state:'idle',result:null};
window.__GPUPROBE=GPUPROBE;
const GPUPROBE_WGSL=`struct P{nx:u32,ny:u32,nz:u32,pad:u32};
@group(0) @binding(0) var<storage,read> a:array<f32>;
@group(0) @binding(1) var<storage,read_write> b:array<f32>;
@group(0) @binding(2) var<uniform> p:P;
@compute @workgroup_size(8,8,4)
fn main(@builtin(global_invocation_id) g:vec3<u32>){
 if(g.x>=p.nx||g.y>=p.ny||g.z>=p.nz){return;}
 let i=g.x+p.nx*(g.y+p.ny*g.z);let sy=p.nx;let sz=p.nx*p.ny;var s=0.0;var c=0.0;
 if(g.x>0u){s+=a[i-1u];c+=1.0;}if(g.x<p.nx-1u){s+=a[i+1u];c+=1.0;}
 if(g.y>0u){s+=a[i-sy];c+=1.0;}if(g.y<p.ny-1u){s+=a[i+sy];c+=1.0;}
 if(g.z>0u){s+=a[i-sz];c+=1.0;}if(g.z<p.nz-1u){s+=a[i+sz];c+=1.0;}
 b[i]=0.2*a[i]+0.8*s/max(c,1.0)+0.001;}`;
async function gpuProbeRun(){if(GPUPROBE.state==='running')return GPUPROBE.result;GPUPROBE.state='running';const R={supported:false,when:new Date().toISOString(),tiers:[]};GPUPROBE.result=R;
 try{if(!navigator.gpu){R.reason='navigator.gpu 없음 (이 브라우저/기기는 WebGPU 미지원)';GPUPROBE.state='done';return R}
  const ad=await navigator.gpu.requestAdapter({powerPreference:'high-performance'});if(!ad){R.reason='어댑터 없음';GPUPROBE.state='done';return R}
  R.supported=true;R.adapter=ad.info?{vendor:ad.info.vendor,architecture:ad.info.architecture,description:ad.info.description}:null;R.fallbackAdapter=!!ad.isFallbackAdapter;R.timestampQuery=ad.features.has('timestamp-query');
  const dev=await ad.requestDevice(),mod=dev.createShaderModule({code:GPUPROBE_WGSL}),info=await mod.getCompilationInfo();R.wgsl=info.messages.map(m=>m.type+': '+m.message).slice(0,5);
  if(info.messages.some(m=>m.type==='error')){R.reason='WGSL 컴파일 오류';GPUPROBE.state='done';return R}
  const pipe=dev.createComputePipeline({layout:'auto',compute:{module:mod,entryPoint:'main'}});
  for(const q of ['LITE','LOW','MID','HIGH','ULTRA']){const N=QUALITY.sim[q].grid,cells=N[0]*N[1]*N[2],bytes=cells*4;
   const A=dev.createBuffer({size:bytes,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST}),B=dev.createBuffer({size:bytes,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
   const U=dev.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});dev.queue.writeBuffer(U,0,new Uint32Array([N[0],N[1],N[2],0]));
   const bg=[[A,B],[B,A]].map(([x,y])=>dev.createBindGroup({layout:pipe.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:x}},{binding:1,resource:{buffer:y}},{binding:2,resource:{buffer:U}}]}));
   const sweep=(n)=>{const e=dev.createCommandEncoder(),pass=e.beginComputePass();pass.setPipeline(pipe);for(let i=0;i<n;i++){pass.setBindGroup(0,bg[i&1]);pass.dispatchWorkgroups(Math.ceil(N[0]/8),Math.ceil(N[1]/8),Math.ceil(N[2]/4))}pass.end();dev.queue.submit([e.finish()])};
   sweep(4);await dev.queue.onSubmittedWorkDone();const n=60,t0=performance.now();sweep(n);await dev.queue.onSubmittedWorkDone();const ms=(performance.now()-t0)/n;
   R.tiers.push({tier:q,cells,msPerSweep:+ms.toFixed(3),Mcells_s:+(cells/ms/1e3).toFixed(1),GBs:+(cells*4*2/ms/1e6).toFixed(1)});A.destroy();B.destroy();U.destroy()}
  R.note='7점 스텐실 1회 = 압력 평활 1회 분량. 실제 솔버는 레벨당 평활·잔차·제한·보간을 반복하므로 이 값은 상한 근사입니다.';dev.destroy()}
 catch(e){R.reason=String(e?.message||e)}
 GPUPROBE.state='done';return R}
GPUPROBE.run=gpuProbeRun;
if(/webgpu=1/.test(location.hash))setTimeout(()=>gpuProbeRun().then(r=>{console.info('AETHER WebGPU probe',JSON.stringify(r))}),20000);
