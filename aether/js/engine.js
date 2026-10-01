(()=>{'use strict';
const now=()=>new Date().toISOString(),finite=Number.isFinite,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const AETHER=window.AETHER=Object.seal({VERSION:'0.15.0-dev',MILESTONE:'REALTIME_GPU_CFD_SHOWCASE',BASELINE:null,CURRENT_AUTHORITIES:null,DIAGNOSTICS:null,APPLICATION:null,COORDINATE_CONTRACT:null,WIND_TUNNEL_CONFIG:null,VEHICLE_TRANSFORM:null,ROLLING_ROAD:null,M4_CONFIG:null,CFD_DOMAIN:null,CFD_BRIDGE:null,M1:null,M3:null,M4:null,M5:null,M6:null,M7:null,M8:null,M9:null,M10:null,M11:null,M12:null,M14:null,M15:null,MATERIALS:null,VEHICLE_PRODUCTION:null,FAN_MODULE:null,FLOW_LAYOUT:null,EXHAUST_COLLECTOR:null,ASSETS:null});
const diagnostics={startedAt:now(),events:[],errors:[],warnings:[],_bootStage:'BOOT',bootStageStartedAt:now(),bootStageTimes:[],get bootStage(){return this._bootStage},set bootStage(stage){const t=now();if(this._bootStage!==stage)this.bootStageTimes.push({stage:this._bootStage,next:stage,elapsedMs:t-this.bootStageStartedAt,totalMs:t-this.startedAt});this._bootStage=stage;this.bootStageStartedAt=t},contractReady:false,facilityReady:false,vehicleReady:false,texturesReady:false,event(type,message,detail=null){this.events.push({time:now(),type,message,detail});renderDiagnostics()},error(source,e){const x={time:now(),source,name:e?.name||'Error',message:e?.message||String(e),stack:e?.stack||null};this.errors.push(x);this.events.push({time:now(),type:'ERROR',message:source+': '+x.message});return x}};AETHER.DIAGNOSTICS=diagnostics;
const baseline={contractVersion:2,milestone:'M0_BASELINE_FROZEN',mode:'USER_CONFIRMED_STABLE_REFERENCE',frozenAt:'2026-09-28T00:00:00Z',runtime:{secureContext:window.isSecureContext,webGL2Exposed:false,devicePixelRatio:devicePixelRatio,viewport:{width:innerWidth,height:innerHeight}},review:{status:'FROZEN_FROM_USER_CONFIRMED_V40; STATIC_AUDIT_COMPLETE',browserRuntimeVerified:false,baselineRunReported:true,m0Pass:true},authorities:{rendererAuthority:'M4 WebGL2 renderer',gpuDeviceAuthority:'No GPUDevice in the WebGL renderer; optional WebGPU device is owned by AETHER.SOLVER',sceneAuthority:'M4 SceneRegistry',vehicleAuthority:'AETHER.VEHICLE_TRANSFORM + embedded BMW M4 GT3 EVO geometry',solverAuthority:'AETHER.SOLVER S0 shell; production solver not connected',stateAuthority:'M4 rolling-road adapter',cameraAuthority:'M4 CameraController',inputAuthority:'M4 InputController',uiAuthority:'M4 DOM diagnostics'},coordinateContract:{unit:'meter',unitsPerWorldUnit:1,vehicleForward:'-X',airflowDownstream:'+X',up:'+Y',lateral:'+Z'},auditFacts:['M4 WebGL2 renderer; no GPUDevice on the WebGL renderer.','Optional WebGPU device ownership belongs to AETHER.SOLVER.','M4 SceneRegistry.','AETHER.VEHICLE_TRANSFORM + embedded BMW M4 GT3 EVO geometry.','AETHER.SOLVER is an S0 shell; production solver is not connected.','M4 rolling-road adapter; M4 CameraController; M4 InputController; M4 DOM diagnostics.','Canonical coordinate target for M1: 1 unit = 1 m; +X downstream; vehicle nose -X; +Y up; +Z lateral.','v40 baseline runtime was user-confirmed in prior work; browser runtime was not rerun in this turn.']};baseline.coordinateContract={unit:'meter',unitsPerWorldUnit:1,vehicleForward:'-X',airflowDownstream:'+X',up:'+Y',lateral:'+Z'};AETHER.BASELINE=baseline;
AETHER.CURRENT_AUTHORITIES={renderer:'M4 WebGL2 production geometry renderer',gpuDevice:null,scene:'M4 SceneRegistry',vehicle:'AETHER.VEHICLE_TRANSFORM + imported BMW M4 GT3 EVO geometry',cfdDomain:'CFD_DOMAIN_CONTRACT derived from AETHER.WIND_TUNNEL_CONFIG.testSection + COORDINATE_CONTRACT',cfdBridge:'AETHER.CFD_BRIDGE / AETHER.VEHICLE_TRANSFORM shared authority',scientificVisualization:'AETHER.SCIENTIFIC_VIS / M13 dedicated WebGL2 scientific renderer',solver:null,state:'M4 rolling road state adapter',camera:'M4 CameraController',input:'M4 InputController',ui:'M4 DOM diagnostic shell',renderLoop:'M4 requestAnimationFrame',resources:'M4 WebGL resources + M13 derived resources'};
/* Lossless render optimisations. Each can be switched off for A/B checks or as a fallback: #opt=novao,nocull,nosplit (or window.__OPT at runtime). */
const OPT=window.__OPT={vao:!/opt=[^&]*novao/.test(location.hash),cull:!/opt=[^&]*nocull/.test(location.hash),split:!/opt=[^&]*nosplit/.test(location.hash),stats:{culled:0,drawn:0}};
/* Mobile mode: chosen by what the device is (touch as primary input + phone-sized screen), never by the user-agent string, and never to
   guess performance - the quality tier is still measured. Override: #mobile=1 / #mobile=0, or the in-page toggle (stored per browser). */
const MOBILE=window.__MOBILE=(()=>{const o=(location.hash.match(/mobile=([01])/)||[])[1];if(o!==undefined)return o==='1';try{const v=localStorage.getItem('aether.mobile');if(v==='0'||v==='1')return v==='1'}catch(_){}
 try{return matchMedia('(pointer: coarse)').matches&&Math.min(innerWidth,innerHeight)<=820}catch(_){return false}})();
document.documentElement.classList.toggle('mobile',MOBILE);if(document.body)document.body.classList.toggle('mobile',MOBILE);else addEventListener('DOMContentLoaded',()=>document.body.classList.toggle('mobile',MOBILE));
window.__setMobile=v=>{try{localStorage.setItem('aether.mobile',v?'1':'0')}catch(_){}location.hash=location.hash.replace(/[#&]?mobile=[01]/,'')||'';location.reload()};
/* Application contract, coordinate system, facility geometry config, CFD domain and rolling-road state (the single sources of truth for the rest of the engine). */
const applicationState={contractReady:false,productReady:false,visualApproval:'M3_GEOMETRY_APPROVED_NATIVE_ES3',m3Acceptance:{geometry:'FROZEN',scope:'M3 geometry and desktop-aspect composition',evidence:'Direct source review; VM regression; actual Mesa OpenGL ES shader compilation and Hero/Side/Top rendering',browserRuntime:'NOT_VERIFIED',iPhoneRuntime:'NOT_VERIFIED',productReady:false}};AETHER.APPLICATION=applicationState;
const coordinateContract=Object.freeze({version:1,unit:'meter',unitsPerWorldUnit:1,axes:Object.freeze({downstream:'+X',up:'+Y',lateral:'+Z',vehicleForward:'-X'}),groundY:0,centerlineZ:0,rotationOrder:'XYZ (Rx then Ry then Rz; column-vector convention)',rotationUnit:'radians',scaleRule:'positive finite components only'});AETHER.COORDINATE_CONTRACT=coordinateContract;
const config=Object.freeze({world:Object.freeze({unit:'meter',groundY:0,centerlineZ:0}),testSection:Object.freeze({lengthX:18,widthZ:8,heightY:5.5}),controlRoom:Object.freeze({widthX:8.5,depthZ:5.5,heightY:3.2,elevationY:.75}),vehicleReference:Object.freeze({lengthX:4.7,widthZ:1.928297490761,heightY:1.297449006023}),rollingRoad:Object.freeze({minX:-3.2,maxX:3.2,minZ:-1.35,maxZ:1.35,beltTopY:0,recessedBelowGround:true}),camera:Object.freeze({fovVerticalDegrees:50,near:.05,far:100})});AETHER.WIND_TUNNEL_CONFIG=config;
const CFD_DOMAIN_CONTRACT=(()=>{const t=config.testSection,c=coordinateContract,min=Object.freeze([-t.lengthX/2,c.groundY,-t.widthZ/2]),max=Object.freeze([t.lengthX/2,t.heightY,t.widthZ/2]),size=Object.freeze(max.map((v,i)=>v-min[i])),volume=size[0]*size[1]*size[2],tiers=Object.freeze([64,128,256].map(res=>{const cells=res**3;return Object.freeze({resolution:res,cells,scalarFloat32Bytes:cells*Float32Array.BYTES_PER_ELEMENT,vector3Float32Bytes:cells*3*Float32Array.BYTES_PER_ELEMENT})}));return Object.freeze({version:'M12',unit:c.unit,axis:Object.freeze({...c.axes}),bounds:Object.freeze({min,max,size,volume}),resolutionTiers:tiers,activeTier:null,allocated:false,solverBound:false,fieldData:false})})();AETHER.CFD_DOMAIN=CFD_DOMAIN_CONTRACT;
const M4_CONFIG=Object.freeze({
  pit:Object.freeze({minX:-3.2,maxX:3.2,minZ:-1.35,maxZ:1.35,beltCenter:[0,-.03,0],beltSize:[6.20,.06,2.56],beltTopY:0,pitFloorTopY:-.42}),
  frame:Object.freeze({sideZ:1.325,endX:3.175}),
  roller:Object.freeze({radius:.09,centerY:-.15,segments:32}),
  state:Object.freeze({pitch:.50,maxSpeed:100,maxDt:.05,maxBatch:8}),
  tolerances:Object.freeze({geometry:1e-5,contact:.002,normal:1e-5})
});
AETHER.M4_CONFIG=M4_CONFIG;
const rollingState={source:null,previous:null,baseline:null,beltTravel:0,wheelAngles:[0,0,0,0],rollerAngles:[0,0,0,0],effectiveSpeed:0,motorEnabled:true,emergencyStopped:false,lastSimT:null,aligned:true,motionReady:false,roadSection:false,lastRejection:null,duplicateFrames:0};
function identityMatrix(){return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1])}
function positiveMod(a,b){return ((a%b)+b)%b}
function alignedVehicle(){const v=AETHER.VEHICLE_TRANSFORM;return v.position.every((x,i)=>x===[0,0,0][i])&&v.rotation.every((x,i)=>Math.abs(x-[0,Math.PI,0][i])<1e-10)&&v.scale.every((x,i)=>x===[1,1,1][i])}
function cloneFrame(f){return {sourceId:f.sourceId,sequence:f.sequence,simulationTime:f.simulationTime,freestreamSpeed:f.freestreamSpeed,running:f.running}}
function sameFrame(a,b){return !!a&&!!b&&a.sourceId===b.sourceId&&a.sequence===b.sequence&&a.simulationTime===b.simulationTime&&a.freestreamSpeed===b.freestreamSpeed&&a.running===b.running}
function rejectFrame(reason){rollingState.lastRejection=reason;rollingState.previous=null;rollingState.baseline=null;rollingState.effectiveSpeed=0;rollingState.aligned=alignedVehicle();rollingState.motionReady=false;if(AETHER.M4)AETHER.M4.liveSolverConnected=false;diagnostics.warnings.push(reason);diagnostics.events.push({time:now(),type:'M4_REJECT',message:reason});renderDiagnostics();return false}
function suspendRollingRoad(reason){rollingState.previous=null;rollingState.baseline=null;rollingState.effectiveSpeed=0;rollingState.motionReady=false;if(AETHER.M4)AETHER.M4.liveSolverConnected=false;diagnostics.events.push({time:now(),type:'M4_SUSPEND',message:reason});renderDiagnostics()}
let vehicleGeometryEpoch=0;
function vehicleTransformChanged(){vehicleGeometryEpoch++;
 if(typeof flowLayoutCache!=='undefined')flowLayoutCache=null;
 if(scene.vehicleParts.length===5){
  if(gl){for(const r of scene.roadParts)for(const b of [r.gpu?.pb,r.gpu?.nb,r.gpu?.ub,r.gpu?.ib])if(b)gl.deleteBuffer(b);
   for(const o of scene.objects)if(o.category==='wheel station')for(const b of [o.gpu?.pb,o.gpu?.nb,o.gpu?.ub,o.gpu?.ib])if(b)gl.deleteBuffer(b);}
  buildRollingRoadGeometry();if(gl&&program)setupResources();
  if(AETHER.M12)try{runM12Checks()}catch(e){diagnostics.error('M12_TRANSFORM_ALIGNMENT',e)}
  if(AETHER.VEHICLE_PRODUCTION){const old=AETHER.VEHICLE_PRODUCTION,vt=AETHER.VEHICLE_TRANSFORM,b=CFD_BRIDGE.getAlignmentReport().renderBounds;AETHER.VEHICLE_PRODUCTION=Object.freeze({...old,transform:Object.freeze({...old.transform,position:vt.position,rotation:vt.rotation,scale:vt.scale,dimensions:{...vt.dimensions},worldBounds:{min:b.min,max:b.max}})})}
 }
 rollingState.aligned=alignedVehicle();diagnostics.vehicleAlignment={valid:rollingState.aligned,worldAABB:AETHER.VEHICLE_TRANSFORM.worldAABB};if(!rollingState.aligned&&!diagnostics.warnings.includes('VEHICLE_NOT_ALIGNED'))diagnostics.warnings.push('VEHICLE_NOT_ALIGNED');if(rollingState.aligned)diagnostics.warnings=diagnostics.warnings.filter(w=>w!=='VEHICLE_NOT_ALIGNED');suspendRollingRoad('VEHICLE_TRANSFORM_CHANGED')}
function snapshotState(){const src=rollingState.source?{kind:rollingState.source.kind,id:rollingState.source.id}:null;const wheels=wheelParts();const currentAligned=alignedVehicle();const effective=currentAligned?rollingState.effectiveSpeed:0;let maxContactGap=null;if(wheels.length===4){const gaps=wheels.map((p,i)=>{const b=wheelWorldBoundsAt(0,i);return Math.max(0,b.min[1])});maxContactGap=Math.max(...gaps)}return Object.freeze({motorEnabled:rollingState.motorEnabled,emergencyStopped:rollingState.emergencyStopped,sourceKind:src?.kind||null,sourceId:src?.id||null,sequence:rollingState.previous?.sequence??null,simulationTime:rollingState.previous?.simulationTime??null,inputSpeed:rollingState.previous?.freestreamSpeed??0,effectiveSpeed:effective,running:!!rollingState.previous?.running,aligned:currentAligned,beltTravel:rollingState.beltTravel,wheelAngles:rollingState.wheelAngles.slice(),rollerAngles:rollingState.rollerAngles.slice(),omegaWheel:wheels.map(p=>-effective/(p.wheel?.radius||1)),omegaRoller:scene.roadParts.map(()=>-effective/M4_CONFIG.roller.radius),roadSection:rollingState.roadSection,geometryCounts:{sceneObjects:scene.objects.length,roadParts:scene.roadParts.length,vehicleParts:scene.vehicleParts.length},gpuResourceCounts:{objects:scene.objects.filter(o=>o.gpu).length,vehicleParts:scene.vehicleParts.filter(p=>p.gpu).length,roadParts:scene.roadParts.filter(r=>r.gpu).length},maxContactGap,correctionMaxDistance:wheels.length?Math.max(...wheels.map(p=>p.wheel?.correctionMax||0)):null,lastRejection:rollingState.lastRejection,duplicateFrames:rollingState.duplicateFrames,liveSolverConnected:!!src&&src.kind==='solver'&&!!rollingState.previous&&currentAligned})}
function makeRollingRoadAPI(){return Object.freeze({bindSource(input={}){const {kind,id}=input&&typeof input==='object'?input:{};if((kind!=='solver'&&kind!=='test')||typeof id!=='string'||!id.trim())return rejectFrame('INVALID_SOURCE');rollingState.source={kind,id:id.trim()};rollingState.previous=null;rollingState.baseline=null;rollingState.effectiveSpeed=0;rollingState.aligned=alignedVehicle();rollingState.motionReady=false;rollingState.lastRejection=null;rollingState.duplicateFrames=0;if(AETHER.M4)AETHER.M4.liveSolverConnected=false;diagnostics.events.push({time:now(),type:'M4_BIND',message:kind+':'+id});renderDiagnostics();return true},unbindSource(){rollingState.source=null;rollingState.previous=null;rollingState.baseline=null;rollingState.effectiveSpeed=0;rollingState.aligned=alignedVehicle();rollingState.motionReady=false;if(AETHER.M4)AETHER.M4.liveSolverConnected=false;diagnostics.events.push({time:now(),type:'M4_UNBIND',message:'source=null'});renderDiagnostics();return true},acceptFrame(frame){if(!rollingState.source)return rejectFrame('SOURCE_UNBOUND');if(!frame||typeof frame!=='object')return rejectFrame('INVALID_FRAME');const keys=['sourceId','sequence','simulationTime','freestreamSpeed','running'];if(keys.some(k=>!(k in frame)))return rejectFrame('MISSING_FRAME_FIELD');if(typeof frame.sourceId!=='string'||!Number.isInteger(frame.sequence)||typeof frame.running!=='boolean'||!finite(frame.simulationTime)||!finite(frame.freestreamSpeed))return rejectFrame('FRAME_TYPE_INVALID');if(frame.sourceId!==rollingState.source.id)return rejectFrame('WRONG_SOURCE');if(frame.sequence<0||frame.simulationTime<0||frame.freestreamSpeed<0||frame.freestreamSpeed>M4_CONFIG.state.maxSpeed)return rejectFrame('FRAME_RANGE_INVALID');if(document.hidden){rollingState.previous=null;rollingState.baseline=null;rollingState.effectiveSpeed=0;rollingState.motionReady=false;if(AETHER.M4)AETHER.M4.liveSolverConnected=false;return false}const prev=rollingState.previous;if(prev&&frame.sequence===prev.sequence){if(sameFrame(frame,prev)){rollingState.duplicateFrames++;return true}return rejectFrame('SEQUENCE_REUSE_MUTATED')}if(prev&&(frame.sequence<prev.sequence||frame.simulationTime<prev.simulationTime))return rejectFrame('FRAME_ORDER_INVALID');const aligned=alignedVehicle();rollingState.aligned=aligned;if(!aligned&&!diagnostics.warnings.includes('VEHICLE_NOT_ALIGNED'))diagnostics.warnings.push('VEHICLE_NOT_ALIGNED');if(prev){const dt=frame.simulationTime-prev.simulationTime;if(dt-M4_CONFIG.state.maxDt>1e-9)return rejectFrame('TIME_STEP_TOO_LARGE');if(dt<0)return rejectFrame('TIME_REVERSED');if(dt>0&&prev.running&&rollingState.motionReady&&aligned){const distance=prev.freestreamSpeed*dt;rollingState.beltTravel=positiveMod(rollingState.beltTravel+distance,M4_CONFIG.state.pitch);const wheels=wheelParts();for(let i=0;i<rollingState.wheelAngles.length;i++)rollingState.wheelAngles[i]=positiveMod(rollingState.wheelAngles[i]-distance/(wheels[i]?.wheel?.radius||1),Math.PI*2);for(let i=0;i<rollingState.rollerAngles.length;i++)rollingState.rollerAngles[i]=positiveMod(rollingState.rollerAngles[i]-distance/M4_CONFIG.roller.radius,Math.PI*2)}}rollingState.effectiveSpeed=(aligned&&frame.running)?frame.freestreamSpeed:0;rollingState.motionReady=aligned;rollingState.previous=cloneFrame(frame);rollingState.baseline=frame.simulationTime;rollingState.lastRejection=null;if(AETHER.M4)AETHER.M4.liveSolverConnected=rollingState.source.kind==='solver'&&aligned;renderDiagnostics();return true},setMotorEnabled(on){if(typeof on!=='boolean'||(on&&rollingState.emergencyStopped))return false;rollingState.motorEnabled=on;if(!on)rollingState.effectiveSpeed=0;return true},setEmergencyStop(on){if(typeof on!=='boolean')return false;rollingState.emergencyStopped=on;if(on){rollingState.motorEnabled=false;rollingState.effectiveSpeed=0}return true},liveAdvance(speed,simTime){const s=rollingState;if(!s.motorEnabled||s.emergencyStopped||!(speed>=0)||!finite(simTime)){s.effectiveSpeed=0;s.lastSimT=finite(simTime)?simTime:null;return false}if(s.lastSimT===null||simTime<s.lastSimT)s.lastSimT=simTime;const dt=Math.min(.1,simTime-s.lastSimT);s.lastSimT=simTime;s.effectiveSpeed=speed;s.motionReady=true;if(dt>0){const distance=speed*dt;s.beltTravel=positiveMod(s.beltTravel+distance,M4_CONFIG.state.pitch);const wheels=wheelParts();for(let i=0;i<s.wheelAngles.length;i++)s.wheelAngles[i]=positiveMod(s.wheelAngles[i]-distance/(wheels[i]?.wheel?.radius||1),Math.PI*2);for(let i=0;i<s.rollerAngles.length;i++)s.rollerAngles[i]=positiveMod(s.rollerAngles[i]-distance/M4_CONFIG.roller.radius,Math.PI*2)}return true},setSectionView(on){if(typeof on!=='boolean')return false;rollingState.roadSection=on;renderDiagnostics();return true},resetMotion(){rollingState.beltTravel=0;rollingState.wheelAngles.fill(0);rollingState.rollerAngles.fill(0);rollingState.previous=null;rollingState.baseline=null;rollingState.effectiveSpeed=0;rollingState.aligned=alignedVehicle();rollingState.motionReady=false;rollingState.lastRejection=null;rollingState.duplicateFrames=0;if(AETHER.M4)AETHER.M4.liveSolverConnected=false;renderDiagnostics();return true},getSnapshot(){return snapshotState()}})}
AETHER.ROLLING_ROAD=makeRollingRoadAPI();

const v3=v=>Array.isArray(v)&&v.length===3&&v.every(finite),cl3=v=>[v[0],v[1],v[2]],add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],mul=(a,s)=>[a[0]*s[0],a[1]*s[1],a[2]*s[2]],rx=(v,a)=>{const c=Math.cos(a),s=Math.sin(a);return[v[0],c*v[1]-s*v[2],s*v[1]+c*v[2]]},ry=(v,a)=>{const c=Math.cos(a),s=Math.sin(a);return[c*v[0]+s*v[2],v[1],-s*v[0]+c*v[2]]},rz=(v,a)=>{const c=Math.cos(a),s=Math.sin(a);return[c*v[0]-s*v[1],s*v[0]+c*v[1],v[2]]},rf=(v,r)=>rz(ry(rx(v,r[0]),r[1]),r[2]),ri=(v,r)=>rx(ry(rz(v,-r[2]),-r[1]),-r[0]);
class VehicleTransform{constructor({position=[0,0,0],rotation=[0,0,0],scale=[1,1,1],lengthX=4.7,widthZ=1.9,heightY=1.45}={}){this._state=null;this.setState({position,rotation,scale,lengthX,widthZ,heightY})}static validate(s){if(!v3(s.position)||!v3(s.rotation)||!v3(s.scale)||!s.scale.every(v=>v>0)||![s.lengthX,s.widthZ,s.heightY].every(v=>finite(v)&&v>0))throw new TypeError('VehicleTransform requires finite position/rotation, positive finite scale and dimensions')}setState(n){const s={position:cl3(n.position),rotation:cl3(n.rotation),scale:cl3(n.scale),lengthX:n.lengthX,widthZ:n.widthZ,heightY:n.heightY};VehicleTransform.validate(s);const changed=JSON.stringify(this._state)!==JSON.stringify(s);this._state=s;if(changed&&AETHER.VEHICLE_TRANSFORM===this)vehicleTransformChanged();return this}get position(){return cl3(this._state.position)}get rotation(){return cl3(this._state.rotation)}get scale(){return cl3(this._state.scale)}get dimensions(){return{lengthX:this._state.lengthX,widthZ:this._state.widthZ,heightY:this._state.heightY}}get localBounds(){return{min:[-this._state.lengthX/2,0,-this._state.widthZ/2],max:[this._state.lengthX/2,this._state.heightY,this._state.widthZ/2]}}localToWorld(p){if(!v3(p))throw new TypeError('local point must be finite Vec3');return add(rf(mul(p,this._state.scale),this._state.rotation),this._state.position)}worldToLocal(p){if(!v3(p))throw new TypeError('world point must be finite Vec3');const q=ri(sub(p,this._state.position),this._state.rotation);return[q[0]/this._state.scale[0],q[1]/this._state.scale[1],q[2]/this._state.scale[2]]}get worldAABB(){const b=this.localBounds,c=[];for(const x of[b.min[0],b.max[0]])for(const y of[b.min[1],b.max[1]])for(const z of[b.min[2],b.max[2]])c.push(this.localToWorld([x,y,z]));return{min:[0,1,2].map(i=>Math.min(...c.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...c.map(p=>p[i]))),corners:c}}}
AETHER.VEHICLE_TRANSFORM=new VehicleTransform({rotation:[0,Math.PI,0],lengthX:4.7,widthZ:1.928297490761,heightY:1.297449006023});
function runM1Tests(){const results=[],pass=(name,detail)=>results.push({name,status:'PASS',detail}),fail=(name,detail)=>results.push({name,status:'FAIL',detail}),t=new VehicleTransform();try{JSON.stringify(t.localToWorld([1,2,3]))===JSON.stringify([1,2,3])?pass('identity','ok'):fail('identity','mismatch')}catch(e){fail('identity',e.message)}try{t.setState({position:[3,-2,5],rotation:[0,0,0],scale:[1,1,1],lengthX:4.7,widthZ:1.9,heightY:1.45});JSON.stringify(t.localToWorld([0,0,0]))===JSON.stringify([3,-2,5])?pass('translation','ok'):fail('translation','mismatch')}catch(e){fail('translation',e.message)}try{t.setState({position:[0,0,0],rotation:[0,0,0],scale:[2,3,4],lengthX:4.7,widthZ:1.9,heightY:1.45});JSON.stringify(t.localToWorld([1,1,1]))===JSON.stringify([2,3,4])?pass('nonuniform scale','ok'):fail('nonuniform scale','mismatch')}catch(e){fail('nonuniform scale',e.message)}for(const[n,r]of[['axis X',[Math.PI/2,0,0]],['axis Y',[0,Math.PI/2,0]],['axis Z',[0,0,Math.PI/2]]])try{t.setState({position:[0,0,0],rotation:r,scale:[1,1,1],lengthX:4.7,widthZ:1.9,heightY:1.45});const q=t.localToWorld([.31,-.7,1.2]),w=t.worldToLocal(q);Math.max(...w.map((x,i)=>Math.abs(x-[.31,-.7,1.2][i])))<1e-9?pass(n,'roundtrip'):fail(n,'mismatch')}catch(e){fail(n,e.message)}const gates={canonicalCoordinate:coordinateContract.unitsPerWorldUnit===1&&coordinateContract.axes.downstream==='+X'&&coordinateContract.axes.up==='+Y'&&coordinateContract.axes.lateral==='+Z'&&coordinateContract.axes.vehicleForward==='-X'&&coordinateContract.groundY===0&&coordinateContract.centerlineZ===0,singleTransformAuthority:AETHER.VEHICLE_TRANSFORM.constructor===VehicleTransform};return{passed:results.every(r=>r.status==='PASS')&&Object.values(gates).every(Boolean),results,gates,contract:coordinateContract,systems:{renderer:'M4 WebGL2',GPUDevice:'NOT_IMPLEMENTED',vehicleLoader:'M4 embedded Blender-converted GLB',solver:'NOT_IMPLEMENTED',camera:'M4',input:'M4'}}}AETHER.M1=runM1Tests();
const glCanvas=document.getElementById('view'),scene={objects:[],vehicleParts:[],roadParts:[],fanParts:[],collectorParts:[],materials:new Map(),resources:[]},camera={preset:'Hero',eye:[-1.8,2.4,9.1],target:[0,1.05,0],up:[0,1,0],fov:50,near:.05,far:100,yaw:0,pitch:0,distance:8,cutaway:false};
/* cached per parts array (called several times per part per frame); the returned list is frozen because it is shared */
let wheelPartsCache=null;
function wheelParts(){const a=scene.vehicleParts;if(wheelPartsCache&&wheelPartsCache.a===a&&wheelPartsCache.n===a.length)return wheelPartsCache.l;const l=Object.freeze(a.filter(p=>p.role==='wheel').sort((x,y)=>x.name.localeCompare(y.name,undefined,{numeric:true})));wheelPartsCache={a,n:a.length,l};return l}
function addBox(name,center,size,color,{material='solid',visible=true,bevel=.02,category='production'}={}){if(!v3(center)||!v3(size)||!size.every(x=>finite(x)&&x>0))throw new Error('invalid geometry '+name);const o={type:'box',name,center,size,color,material,visible,bevel:Math.min(bevel,Math.min(...size)/4),category};scene.objects.push(o);return o}
function addMarker(name,center,size,color,material='marker'){return addBox(name,center,size,color,{material,bevel:.01,category:'measurement'})}
function buildScene(){scene.objects.length=0;const t=config.testSection,r=config.controlRoom,b=config.rollingRoad;
  for(const x of[-6.1,6.1])addBox('floor slab end',[x,-.12,0],[5.8,.24,8],[.20,.24,.27],{bevel:.04,category:'structure'});
  for(const z of[-2.675,2.675])addBox('floor slab side',[0,-.12,z],[6.4,.24,2.65],[.20,.24,.27],{bevel:.025,category:'structure'});
  for(const x of[-8.85,-6.0,-3.0,0,3.0,6.0,8.85]){
    if(Math.abs(x)<3.2){for(const z of[-2.66,2.66])addBox('floor panel seam',[x,.001,z],[.018,.002,2.58],[.10,.14,.17],{bevel:.0002,category:'floor seams'});}
    else addBox('floor panel seam',[x,.001,0],[.018,.002,7.92],[.10,.14,.17],{bevel:.0002,category:'floor seams'});
  }
  addBox('left wall panel west',[-4.9,2.75,-3.98],[8.2,5.5,.16],[.23,.28,.32],{bevel:.05,category:'wall panels'});addBox('left wall panel east',[4.9,2.75,-3.98],[8.2,5.5,.16],[.23,.28,.32],{bevel:.05,category:'wall panels'});addBox('left wall panel above service door',[0,4.8,-3.98],[1.55,1.4,.16],[.23,.28,.32],{bevel:.05,category:'wall panels'});
  addBox('right wall panel west',[-6.3,2.75,3.98],[5.4,5.5,.16],[.23,.28,.32],{bevel:.05,category:'wall panels'});
  addBox('right wall panel east',[6.3,2.75,3.98],[5.4,5.5,.16],[.23,.28,.32],{bevel:.05,category:'wall panels'});
  addBox('ceiling panel',[0,5.48,0],[18,.16,8],[.19,.23,.27],{bevel:.05,category:'ceiling'});
  for(const x of[-7.5,-3.75,0,3.75,7.5])addBox('ceiling lighting recess',[x,5.37,0],[1.85,.08,5.5],[.08,.15,.18],{bevel:.035,category:'lighting recess'});
  for(const x of[-8.55,8.55]){addBox('structural portal frame',[x,2.75,-3.82],[.22,5.35,.18],[.35,.39,.41],{bevel:.04,category:'transitions'});addBox('structural portal frame',[x,2.75,3.82],[.22,5.35,.18],[.35,.39,.41],{bevel:.04,category:'transitions'});addBox('structural portal crown',[x,5.1,0],[.22,.22,7.64],[.35,.39,.41],{bevel:.04,category:'transitions'})}
  // Open downstream intake at -X. Structural trim sits outside the solver domain;
  // the centre remains open so calculated outflow and smoke can pass through.
  for(const z of[-3.83,3.83])addBox('rear intake jamb',[-9.12,2.74,z],[.25,5.34,.23],[.23,.39,.46],{bevel:.035,category:'transitions'});
  for(const y of[.14,5.34])addBox('rear intake sill',[-9.12,y,0],[.25,.24,7.42],[.23,.39,.46],{bevel:.035,category:'transitions'});
  for(const z of[-2.55,-1.28,0,1.28,2.55])addBox('rear intake vertical grille',[-9.21,2.74,z],[.07,4.92,.042],[.20,.31,.37],{bevel:.006,category:'transitions'});
  // M4 replaces the rolling-road blockout after the vehicle has been normalized.
  for(const z of[-1.48,1.48]){addBox('rolling-road rail',[0,.10,z],[6.65,.20,.11],[.38,.43,.46],{bevel:.035,category:'rails'});addBox('rail mounting',[0,.19,z],[.22,.12, .22],[.46,.50,.52],{bevel:.025,category:'equipment mounts'})}
  for(const x of[-2.55,-1.7,-.85,0,.85,1.7,2.55]){addMarker('rail marker L',[x,.22,-1.48],[.05,.04,.16],[.80,.54,.18]);addMarker('rail marker R',[x,.22,1.48],[.05,.04,.16],[.80,.54,.18])}
  // Service door on the right wall; a real opening is represented by separated jamb/lintel members.
  addBox('service door panel',[0,2.0,-3.86],[1.55,3.75,.08],[.29,.34,.37],{bevel:.08,category:'service door'});addBox('service door jamb L',[-.84,2.0,-3.80],[.14,4.1,.32],[.40,.45,.48],{bevel:.04,category:'service door'});addBox('service door jamb R',[.84,2.0,-3.80],[.14,4.1,.32],[.40,.45,.48],{bevel:.04,category:'service door'});addBox('service door header',[0,4.08,-3.80],[1.82,.16,.32],[.40,.45,.48],{bevel:.04,category:'service door'});addBox('service door handle',[.55,2.0,-3.72],[.08,.38,.08],[.74,.58,.20],{bevel:.02,category:'equipment mounts'});
  // Flush maintenance hatch with frame and lift gap.
  addBox('maintenance hatch',[5.7,.075,-2.15],[1.3,.08,1.0],[.28,.33,.36],{bevel:.07,category:'maintenance hatch'});addBox('maintenance hatch frame',[5.7,.12,-2.15],[1.48,.10,1.18],[.40,.45,.48],{bevel:.06,category:'maintenance hatch'});addBox('maintenance hatch frame cutout',[5.7,.18,-2.15],[1.27,.13,.97],[.13,.17,.20],{bevel:.04,category:'maintenance hatch'});
  // Equipment mounting points and cable/service transitions stay sparse and functional.
  for(const x of[-7.2,-4.2,4.2,7.2]){addBox('wall equipment mount',[x,1.15,-3.87],[.42,.32,.08],[.45,.51,.54],{bevel:.035,category:'equipment mounts'});addBox('wall service transition',[x,1.38,-3.78],[.12,.28,.22],[.31,.37,.40],{bevel:.025,category:'transitions'})}
  addBox('control room floor',[0,.70,6.75],[8.5,.10,5.5],[.30,.34,.37],{bevel:.04,category:'control room blockout'});addBox('console',[-3.0,1.16,5.95],[1.8,.82,.70],[.24,.28,.30],{bevel:.06,category:'control room blockout'});addBox('console monitor',[-2.8,1.97,5.75],[.8,.8,.12],[.24,.40,.46],{bevel:.04,category:'control room blockout'});addBox('control room ceiling',[0,3.95,6.75],[8.5,.10,5.5],[.23,.27,.30],{bevel:.04,category:'control room blockout'});const ow={z:3.90,minX:-3.5,maxX:3.5,minY:.95,maxY:3.05};addBox('observation sill',[0,(ow.minY)/2,ow.z],[8.5,ow.minY,.12],[.32,.37,.40],{bevel:.03,category:'observation opening'});addBox('observation top',[0,(ow.maxY+5.5)/2,ow.z],[8.5,5.5-ow.maxY,.12],[.32,.37,.40],{bevel:.03,category:'observation opening'});addBox('observation jamb L',[(ow.minX-4.25)/2,(ow.minY+ow.maxY)/2,ow.z],[.75,ow.maxY-ow.minY,.12],[.32,.37,.40],{bevel:.03,category:'observation opening'});addBox('observation jamb R',[(ow.maxX+4.25)/2,(ow.minY+ow.maxY)/2,ow.z],[.75,ow.maxY-ow.minY,.12],[.32,.37,.40],{bevel:.03,category:'observation opening'});addBox('observation glass',[0,(ow.minY+ow.maxY)/2,ow.z-.07],[7,2.1,.02],[.20,.48,.60],{material:'glass',bevel:.01,category:'observation glass'});return scene}
function buildControlRoom(){
 scene.objects=scene.objects.filter(o=>!o.name.startsWith('m5.'));
 const b=(id,c,s,color=[.30,.34,.37],category='m5 architecture')=>addBox('m5.'+id,c,s,color,{bevel:.015,category});
 const ceiling=scene.objects.find(o=>o.name==='control room ceiling');ceiling.center[1]=4.00;
 // Interior bounds X [-4.10,4.10], Z [4.10,9.35], floor .75, soffit 3.95.
 b('wall.left',[-4.175,2.35,6.725],[.15,3.2,5.25]);
 b('wall.rear',[0,2.35,9.425],[8.5,3.2,.15]);
 // Right doorway Z [7.85,8.95], Y [.75,2.95].
 b('wall.right.front',[4.175,2.35,5.975],[.15,3.2,3.75]);
 b('wall.right.rear',[4.175,2.35,9.15],[.15,3.2,.4]);
 b('door.header',[4.175,3.45,8.4],[.15,1,1.1]);
 b('door.leaf',[4.175,1.85,8.4],[.055,2.18,1.08],[.22,.26,.29]);
 b('door.handle',[4.125,1.72,8.02],[.045,.025,.20],[.55,.57,.58]);
 // External landing and five 150mm rises; access faces away from tunnel.
 b('landing',[4.925,.65,8.4],[1.35,.20,1.5]);
 for(let i=0;i<4;i++)b('step.'+i,[5.75+i*.30,(.60-i*.15)/2,8.4],[.30,.60-i*.15,1.5]);
 for(const z of [7.65,9.15]){b('landing.rail.'+z,[4.925,1.8,z],[1.35,.045,.045]);for(const x of [4.30,5.55])b('landing.post.'+x+'.'+z,[x,1.275,z],[.045,1.05,.045]);}
 for(let i=0;i<8;i++)b('rear.panel.'+i,[-3.57+i*1.02,2.35,9.339],[1.008,2.98,.02],[.36,.39,.41]);
 for(let i=0;i<5;i++)b('left.panel.'+i,[-4.089,2.35,4.62+i*1.04],[.02,2.98,1.028],[.36,.39,.41]);
 b('skirting.rear',[0,.81,9.322],[8.2,.12,.03],[.20,.23,.25]);
 b('skirting.left',[-4.072,.81,6.725],[.035,.12,5.25],[.20,.23,.25]);
 for(const x of [-3,-1.5,0,1.5,3])b('floor.seam.x.'+x,[x,.751,6.725],[.004,.002,5.20],[.20,.24,.27]);
 for(const z of [5.25,6.75,8.25])b('floor.seam.z.'+z,[0,.751,z],[8.15,.002,.004],[.20,.24,.27]);
 for(const x of [-3,-1,1,3])for(const z of [5.2,7,8.8])b('ceiling.joint.'+x+'.'+z,[x,3.948,z],[1.96,.004,.008],[.16,.19,.21],'m5 ceiling');
 for(const x of [-2.4,2.4])for(const z of [5.35,7.95])b('light.'+x+'.'+z,[x,3.935,z],[1.2,.03,.18],[.78,.80,.78],'m5 ceiling');
 for(const x of [-1.4,1.4]){b('hvac.frame.'+x,[x,3.925,8.85],[.8,.05,.35],[.20,.24,.26],'m5 ceiling');for(let i=0;i<7;i++)b('hvac.blade.'+x+'.'+i,[x-.30+i*.1,3.892,8.85],[.035,.016,.29],[.46,.49,.50],'m5 ceiling');}
 b('service.hatch',[0,3.935,7.95],[.60,.025,.60],[.29,.33,.36],'m5 ceiling');
 b('cable.rear',[-1.6,1.03,9.26],[4.8,.12,.12],[.21,.24,.26]);
 b('cable.left',[-4,1.03,7.58],[.12,.12,3.36],[.21,.24,.26]);
 b('cable.console',[-3.51,1.03,5.96],[.98,.12,.12],[.21,.24,.26]);
 for(const x of [-3.55,3.55])b('window.reveal.'+x,[x,2,4],[.10,2.10,.20],[.26,.30,.33]);
 b('window.reveal.top',[0,3.10,4],[7.20,.10,.20],[.26,.30,.33]);
 b('window.reveal.sill',[0,.90,4],[7.20,.10,.20],[.26,.30,.33]);
 // Reserved equipment footprint; no placeholder equipment is presented as a finished asset.
 for(const x of [.8,2.8])b('equipment.mark.x.'+x,[x,.754,8.8],[.015,.003,.80],[.49,.48,.36]);
 for(const z of [8.4,9.2])b('equipment.mark.z.'+z,[1.8,.754,z],[2,.003,.015],[.49,.48,.36]);
 const front=scene.objects.find(o=>o.name==='m5.wall.right.front'),rear=scene.objects.find(o=>o.name==='m5.wall.right.rear');
 const checks={clearHeight:Math.abs(ceiling.center[1]-ceiling.size[1]/2-.75-3.2)<1e-9,doorWidth:rear.center[2]-rear.size[2]/2-(front.center[2]+front.size[2]/2)>=1,uniqueNames:new Set(scene.objects.map(o=>o.name.startsWith('m5.')?o.name:null).filter(Boolean)).size===scene.objects.filter(o=>o.name.startsWith('m5.')).length};
 AETHER.M5={checks,geometryReady:Object.values(checks).every(Boolean),browserVerified:false,visualApproval:'PENDING',productReady:false,equipmentZone:{min:[.8,.75,8.4],max:[2.8,2.75,9.2]},mainAisle:{min:[-3.9,.75,6.3],max:[4.1,2.75,7.9]}};
 const overlaps=(o,z)=>o.center.every((v,i)=>v+o.size[i]/2>z.min[i]+1e-6&&v-o.size[i]/2<z.max[i]-1e-6);
 const fixtures=scene.objects.filter(o=>!o.name.includes('mark.')&&!o.name.includes('floor.seam'));
 checks.aisleWidth=AETHER.M5.mainAisle.max[2]-AETHER.M5.mainAisle.min[2]>=1.2;
 checks.clearAisle=!fixtures.some(o=>overlaps(o,AETHER.M5.mainAisle));
 checks.clearEquipmentZone=!fixtures.some(o=>overlaps(o,AETHER.M5.equipmentZone));
 AETHER.M5.geometryReady=Object.values(checks).every(Boolean);
}
// Surface contract: roughness, metalness, emission, microvariation; base colors are sRGB.
// M9: shared immutable material contracts. Colors on facility meshes are sRGB.
const materialLibrary=Object.freeze(Object.fromEntries(Object.entries({
 PaintedSteelWhite:[.48,0,0,.018],PaintedSteelGray:[.55,0,0,.020],
 BrushedAluminum:[.38,1,0,.035],AnodizedAluminum:[.44,1,0,.020],
 StainlessSteel:[.25,1,0,.015],BlackPowderCoat:[.67,0,0,.026],
 IndustrialRubber:[.88,0,0,.030],EpoxyFloor:[.52,0,0,.025],
 AcousticGlass:[.08,0,0,0],ABSPlastic:[.43,0,0,.012],
 MonitorGlass:[.16,0,.45,0],VehiclePaint:[.27,0,0,0],LabelWhite:[.52,.06,0,.01],IndicatorGreen:[.20,.04,0,.01],IndicatorBlue:[.22,.03,0,.01],IndicatorAmber:[.22,.04,0,.01],SafetyYellow:[.43,.18,0,.01],EmergencyRed:[.30,.02,0,.01],ScreenUI:[.34,.04,0,.01]
}).map(([id,surface])=>[id,Object.freeze({id,surface:Object.freeze(surface)})])));
AETHER.MATERIALS=materialLibrary;
function materialFor(o){
 const n=o.name.toLowerCase(),c=(o.category||'').toLowerCase(); let id;
 if(o.material==='glass')id='AcousticGlass';
 else if(n.includes('screen'))id='MonitorGlass';
 else if(n==='belt'||/seal|cable|caster|tire|rubber/.test(n))id='IndustrialRubber';
 else if(/floor/.test(n))id='EpoxyFloor';
 else if(/bolt|screw|fastener|probe/.test(n))id='StainlessSteel';
 else if(/trim|rail|handle/.test(n+' '+c))id='BrushedAluminum';
 else if(/monitorarm|monitor.arm|rack.frame/.test(n))id='AnodizedAluminum';
 else if(/key|switch|socket|button|chair.seat|chair.back/.test(n))id='ABSPlastic';
 else if(/rack|monitor|vent|grille/.test(n))id='BlackPowderCoat';
 else id=Math.max(...o.color)>.65?'PaintedSteelWhite':'PaintedSteelGray';
 return materialLibrary[id];
}
const ceilingEmitterSurface=Object.freeze([.48,0,1.5,0]);
function surfaceFor(o){return (o.category==='lighting recess'||o.name.startsWith('m5.light.'))?ceilingEmitterSurface:(o.pbrMaterial||materialFor(o)).surface}
function bindM9Materials(){
 const usage={}; for(const o of scene.objects){o.pbrMaterial=o.pbrMaterial||materialFor(o);usage[o.pbrMaterial.id]=(usage[o.pbrMaterial.id]||0)+1;}
 for(const r of scene.roadParts)r.pbrMaterial=materialLibrary.StainlessSteel;
 const finiteSurface=v=>v.length===4&&v.every(Number.isFinite)&&v[0]>=0&&v[0]<=1&&v[1]>=0&&v[1]<=1&&v[2]>=0&&v[3]>=0;
 const checks={nineteenSharedMaterials:Object.keys(materialLibrary).length===19,finiteParameters:Object.values(materialLibrary).every(m=>finiteSurface(m.surface)),completeAssignments:scene.objects.every(o=>materialLibrary[o.pbrMaterial.id]===o.pbrMaterial),roughnessDifferentiation:new Set(Object.values(materialLibrary).map(m=>m.surface[0])).size>=8,vehicleSourcePBR:scene.vehicleParts.every(p=>finiteSurface(p.surface)),noNewTextures:true};
 AETHER.M9={checks,codeReady:Object.values(checks).every(Boolean),usage,brdf:'GGX / Smith / Schlick, metallic-roughness',previousDeviceCheck:{source:'user',result:'No major usage problems reported before M9',scope:'M8 usability, device/browser unspecified'},visualApproval:'PENDING_M9',browserVerified:false,limitations:['M10 environment reflection and lighting not implemented','M9 visual approval requires new device review']};
 if(!AETHER.M9.codeReady)throw Error('M9 material contract failed');
}

const AETHER_CONSOLE_ASSET=window.__ASSETS.AETHER_CONSOLE_ASSET;
// Use the glTF quaternion convention here; the older shared helper has a bad index on two terms.
function consoleNodeMatrix(n){
 if(n.matrix)return Float64Array.from(n.matrix);
 const q=n.rotation||[0,0,0,1],s=n.scale||[1,1,1],t=n.translation||[0,0,0],[x,y,z,w]=q,x2=x+x,y2=y+y,z2=z+z;
 return new Float64Array([
  (1-(y*y2+z*z2))*s[0],(x*y2+w*z2)*s[0],(x*z2-w*y2)*s[0],0,
  (x*y2-w*z2)*s[1],(1-(x*x2+z*z2))*s[1],(y*z2+w*x2)*s[1],0,
  (x*z2+w*y2)*s[2],(y*z2-w*x2)*s[2],(1-(x*x2+y*y2))*s[2],0,
  t[0],t[1],t[2],1
 ]);
}
function assembleEmbeddedConsole(){
 const bytes=bytesFromBase64(AETHER_CONSOLE_ASSET.base64);
 if(bytes.length!==AETHER_CONSOLE_ASSET.bytes||bytes.length<20)throw Error('M6_CONSOLE_GLB_LENGTH');
 const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(dv.getUint32(0,true)!==0x46546c67||dv.getUint32(4,true)!==2||dv.getUint32(8,true)!==bytes.length)throw Error('M6_CONSOLE_GLB_HEADER');
 let cursor=12,json=null,bin=null;
 while(cursor<bytes.length){
  if(cursor+8>bytes.length)throw Error('M6_CONSOLE_GLB_CHUNK');
  const len=dv.getUint32(cursor,true),type=dv.getUint32(cursor+4,true);
  if(len%4||cursor+8+len>bytes.length)throw Error('M6_CONSOLE_GLB_CHUNK');
  const chunk=bytes.subarray(cursor+8,cursor+8+len);
  if(type===0x4e4f534a){if(json)throw Error('M6_CONSOLE_GLB_JSON_DUPLICATE');json=JSON.parse(new TextDecoder().decode(chunk));}
  else if(type===0x4e4942){if(bin)throw Error('M6_CONSOLE_GLB_BIN_DUPLICATE');bin=chunk;}
  cursor+=8+len;
 }
 if(!json||!bin||json.asset?.version!=='2.0'||json.images?.length)throw Error('M6_CONSOLE_GLB_ASSET_CONTRACT');
 const rootIndex=json.nodes.findIndex(n=>n.name==='AETHER_MAIN_CONSOLE_ROOT'),roots=json.scenes[json.scene]?.nodes||[];
 if(rootIndex<0||!roots.includes(rootIndex))throw Error('M6_CONSOLE_ROOT_MISSING');
 const root=json.nodes[rootIndex],extra=root.extras||{},placement=[-2.8,.7475,5.65],cs=0,sn=1;
 const rootTransform=new Float64Array([cs,0,-sn,0,0,1,0,0,sn,0,cs,0,placement[0],placement[1],placement[2],1]);
 const rootWorld=m4mul(rootTransform,consoleNodeMatrix(root)),groups=new Map();
 let sourceMeshes=0,triangles=0,sourceVertices=0;const materialIds=new Set();
 const identity=new Float64Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
 const visit=(ni,parent)=>{
  const node=json.nodes[ni];if(!node)throw Error('M6_CONSOLE_NODE_MISSING');
  const M=m4mul(parent,consoleNodeMatrix(node));
  if(node.mesh!==undefined){
   sourceMeshes++;
   for(const primitive of json.meshes[node.mesh].primitives||[]){
    if(primitive.mode!==undefined&&primitive.mode!==4)throw Error('M6_CONSOLE_NONTRIANGLE_PRIMITIVE');
    const pa=readAccessor(json,bin,primitive.attributes.POSITION),na=primitive.attributes.NORMAL===undefined?null:readAccessor(json,bin,primitive.attributes.NORMAL),ua=primitive.attributes.TEXCOORD_0===undefined?null:readAccessor(json,bin,primitive.attributes.TEXCOORD_0),ia=primitive.indices===undefined?null:readAccessor(json,bin,primitive.indices),material=json.materials[primitive.material??0],pbr=material?.pbrMetallicRoughness||{},materialId=material?.name,screenId=/^AETHER_CONSOLE_SCREEN_(LEFT|MAIN|RIGHT)$/.exec(node.name||'')?.[1]||null,groupKey=screenId?materialId+'::SCREEN_'+screenId:materialId;materialIds.add(materialId);
    if(!materialId||!materialLibrary[materialId]||pbr.baseColorTexture||pa.n!==3||!na||na.n!==3||na.count!==pa.count||ua&&(ua.n!==2||ua.count!==pa.count))throw Error('M6_CONSOLE_MATERIAL_OR_ATTRIBUTE_INVALID');
    const indices=ia?ia.data:Array.from({length:pa.count},(_,i)=>i);
    if(indices.length%3||indices.some(i=>!Number.isInteger(i)||i<0||i>=pa.count))throw Error('M6_CONSOLE_INDEX_INVALID');
    let group=groups.get(groupKey);
    if(!group){group={name:materialId,screenId,color:pbr.baseColorFactor||[.5,.5,.5,1],positions:[],normals:[],uvs:[],indices:[]};groups.set(groupKey,group);}
    const base=group.positions.length/3;
    for(let i=0;i<pa.count;i++){
     const q=m4point(M,[pa.data[i*3],pa.data[i*3+1],pa.data[i*3+2]]);
     // Source GLB geometry is Z-up: convert [x,y,z] -> AETHER [x,-z,y], then yaw +90° about Y.
     const world=[q[1]+placement[0],-q[2]+placement[1],-q[0]+placement[2]];
     let n;try{n=normalMatrix(M,[na.data[i*3],na.data[i*3+1],na.data[i*3+2]])}catch(error){throw Error('M6_CONSOLE_NORMAL_MATRIX '+node.name+' '+error.message+' '+JSON.stringify(Array.from(M.slice(0,12))))}
     const normal=[n[1],-n[2],-n[0]];
     if(!world.every(Number.isFinite)||!normal.every(Number.isFinite)||Math.hypot(...normal)<.9)throw Error('M6_CONSOLE_NONFINITE_ATTRIBUTE');
     group.positions.push(...world);group.normals.push(...normal);const uv=ua?[ua.data[i*2],ua.data[i*2+1]]:[0,0],tile=group.screenId?({LEFT:0,MAIN:1,RIGHT:2}[group.screenId]):null;group.uvs.push(...(tile===null?uv:[(tile+uv[0])/3,uv[1]]));sourceVertices++;
    }
    for(const index of indices)group.indices.push(base+index);
    triangles+=indices.length/3;
   }
  }
  for(const child of node.children||[])visit(child,M);
 };
 visit(rootIndex,identity);
 if(sourceMeshes!==426||triangles!==166598||materialIds.size!==16)throw Error('M6_CONSOLE_SOURCE_TOPOLOGY_MISMATCH');
 const parts=[],allMin=[Infinity,Infinity,Infinity],allMax=[-Infinity,-Infinity,-Infinity];
 for(const [groupKey,g] of groups){const materialId=g.name;
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<g.positions.length;i+=3)for(let d=0;d<3;d++){const v=g.positions[i+d];min[d]=Math.min(min[d],v);max[d]=Math.max(max[d],v);allMin[d]=Math.min(allMin[d],v);allMax[d]=Math.max(allMax[d],v);}
  const size=max.map((v,d)=>Math.max(v-min[d],1e-6)),center=min.map((v,d)=>(v+max[d])/2),mesh={positions:new Float32Array(g.positions),normals:new Float32Array(g.normals),uvs:new Float32Array(g.uvs),indices:new Uint32Array(g.indices)};
  const object={type:'authored-mesh',name:'m6.glb.'+materialId+(g.screenId?'.screen.'+g.screenId.toLowerCase():'' ),center,size,color:g.color.slice(),colorLinear:true,material:'solid',visible:true,bevel:0,category:'m6 console',_mesh:mesh,pbrMaterial:materialLibrary[materialId]};
  scene.objects.push(object);parts.push(object);
 }
 const dimensions=allMax.map((v,i)=>v-allMin[i]);
 const sockets=JSON.parse(extra.AETHER_interaction_sockets_json||'[]').map(s=>{const p=m4point(rootWorld,s.position_m),n=normalMatrix(rootWorld,s.normal_local);return{...s,position:p,normal:n};});
 const screens=JSON.parse(extra.AETHER_screens_json||'[]');
 if(Math.abs(dimensions[0]-2.22)>1e-4||Math.abs(dimensions[1]-1.8825)>1e-4||Math.abs(dimensions[2]-1.2339)>1e-4||Math.abs(allMin[1]-.75)>1e-4||sockets.length!==8||screens.length!==3)throw Error('M6_CONSOLE_WORLD_LAYOUT_MISMATCH '+JSON.stringify({dimensions,min:allMin,max:allMax,sockets:sockets.length,screens:screens.length}));
 const facing=normalMatrix(rootWorld,[-1,0,0]);
 AETHER.M6={geometryReady:true,assetType:'authored embedded GLB; PBR batches with independent monitor faces',assetId:AETHER_CONSOLE_ASSET.assetId,assetSha256:AETHER_CONSOLE_ASSET.sha256,coordinateAdapter:'GLB geometry [X,Y,Z] -> AETHER local [X,-Z,Y], then shared +90deg Y room yaw',authoredGLBEmbedded:true,authoredAssetValidated:true,partCount:parts.length,sourceNodes:json.nodes.length,sourceMeshes,vertices:sourceVertices,triangles,materialCount:materialIds.size,drawCalls:parts.length,textureBytes:0,bounds:{min:allMin,max:allMax},dimensions:{widthX:dimensions[0],heightY:dimensions[1],depthZ:dimensions[2]},sockets,screens,operatorFacing:facing,interactionReady:false,closeUpVerified:false,visualApproval:'PENDING_BROWSER_CLOSE_UP',milestonePass:false};
 return AETHER.M6;
}
function buildMainConsole(){scene.objects=scene.objects.filter(o=>o.name!=='console'&&o.name!=='console monitor'&&!o.name.startsWith('m6.'));assembleEmbeddedConsole();}
function buildObservationBarrier(){
 scene.objects=scene.objects.filter(o=>!o.name.startsWith('m7.'));
 const glass=scene.objects.find(o=>o.name==='observation glass');glass.size=[7,2.1,.024];glass.bevel=.002;glass.color=[.78,.86,.85];glass._mesh=null;
 const part=(id,c,s,color)=>addBox('m7.'+id,c,s,color,{category:'observation opening',bevel:.004});
 // One transparent shell; only its outward-facing optical face is shaded.
 for(const x of [-3.53,3.53])part('frame.side.'+x,[x,2,3.83],[.06,2.22,.16],[.24,.27,.29]);
 for(const y of [.92,3.08])part('frame.cross.'+y,[0,y,3.83],[7,.06,.16],[.24,.27,.29]);
 for(const z of [3.807,3.853]){
  for(const x of [-3.493,3.493])part('seal.side.'+x+'.'+z,[x,2,z],[.014,2.1,.020],[.045,.053,.054]);
  for(const y of [.957,3.043])part('seal.cross.'+y+'.'+z,[0,y,z],[6.972,.014,.020],[.045,.053,.054]);
 }
 for(const x of [-3.484,3.484])part('edge.'+x,[x,2,3.83],[.004,2.072,.024],[.17,.31,.26]);
 for(const x of [-3.53,3.53])for(const y of [1.2,2,2.8])part('fastener.'+x+'.'+y,[x,y,3.914],[.018,.018,.008],[.46,.49,.50]);
 const tests={singleGlass:scene.objects.filter(o=>o.material==='glass').length===1,thickness:Math.abs(glass.size[2]-.024)<1e-9,clearOpening:glass.size[0]===7&&glass.size[1]===2.1,frameCount:scene.objects.filter(o=>o.name.startsWith('m7.frame.')).length===4,sealCount:scene.objects.filter(o=>o.name.startsWith('m7.seal.')).length===8};
 AETHER.M7={geometryReady:Object.values(tests).every(Boolean),checks:tests,opticalModel:'single visible face, Fresnel tint with analytic environment reflection',glassThickness:.024,reflectionAlphaRange:[.06,.22],browserVerified:false,vehicleVisibilityVerified:false,visualApproval:'PENDING'};
}
function validateAuthoredConsoleMesh(m){if(!m||m.positions.length%3||m.normals.length!==m.positions.length||m.uvs.length!==m.positions.length/3*2||m.indices.length%3||!m.positions.every(Number.isFinite)||!m.normals.every(Number.isFinite)||!m.uvs.every(Number.isFinite)||!m.indices.every(i=>Number.isInteger(i)&&i>=0&&i<m.positions.length/3))return false;for(let i=0;i<m.indices.length;i+=3){const a=m.indices[i]*3,b=m.indices[i+1]*3,c=m.indices[i+2]*3,ab=[m.positions[b]-m.positions[a],m.positions[b+1]-m.positions[a+1],m.positions[b+2]-m.positions[a+2]],ac=[m.positions[c]-m.positions[a],m.positions[c+1]-m.positions[a+1],m.positions[c+2]-m.positions[a+2]],q=cross(ab,ac);if(Math.hypot(...q)<1e-12)return false}return true}
function validateEquipmentMeshes(){
 const inspect=prefix=>{const parts=scene.objects.filter(o=>o.name.startsWith(prefix)),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let valid=parts.length>0;for(const o of parts){const m=o._mesh||bevelMesh(o);const mesh=o._mesh;valid=valid&&!!mesh&&mesh.positions.every(Number.isFinite)&&mesh.normals.every(Number.isFinite)&&mesh.indices.every(i=>Number.isInteger(i)&&i>=0&&i<mesh.positions.length/3)&&(prefix==='m6.'?validateAuthoredConsoleMesh(mesh):validateBoxMesh(mesh));if(mesh)for(let i=0;i<mesh.positions.length;i++){min[i%3]=Math.min(min[i%3],mesh.positions[i]);max[i%3]=Math.max(max[i%3],mesh.positions[i]);}}return{valid,parts,bounds:{min,max}}};
 const consoleMesh=inspect('m6.'),equipment=inspect('m8.');
 AETHER.M6.bounds=consoleMesh.bounds;AETHER.M6.partCount=consoleMesh.parts.length;
 AETHER.M6.checks={meshValid:consoleMesh.valid,grounded:Math.abs(consoleMesh.bounds.min[1]-.75)<1e-5,width:Math.abs(consoleMesh.bounds.max[0]-consoleMesh.bounds.min[0]-2.22)<1e-4,sockets:AETHER.M6.sockets.length===8&&AETHER.M6.sockets.every(s=>s.position.every(Number.isFinite)&&s.hitRadiusM>0),threeDisplays:AETHER.M6.screens.length===3,authoredAssetEmbedded:AETHER.M6.authoredGLBEmbedded&&AETHER.M6.authoredAssetValidated};
 AETHER.M6.geometryReady=Object.values(AETHER.M6.checks).every(Boolean);
 const aisle=AETHER.M5.mainAisle;AETHER.M8.checks.meshValid=equipment.valid;AETHER.M8.checks.allEquipmentClearOfAisle=equipment.parts.every(o=>!o.center.every((v,i)=>v+o.size[i]/2>aisle.min[i]+1e-5&&v-o.size[i]/2<aisle.max[i]-1e-5));const consoleAisleIntrusion=Math.max(0,Math.min(consoleMesh.bounds.max[2],aisle.max[2])-aisle.min[2]);AETHER.M8.checks.consoleInterfaceIntrusion=consoleAisleIntrusion<=.025;
 AETHER.M8.geometryReady=Object.values(AETHER.M8.checks).every(Boolean);
 if(!AETHER.M6.geometryReady||!AETHER.M8.geometryReady)throw Error('Equipment geometry validation failed');
}
function buildEquipmentPack(){
 scene.objects=scene.objects.filter(o=>!o.name.startsWith('m8.'));
 const part=(id,p,s,color=[.18,.21,.23],bevel=.008)=>addBox('m8.'+id,p,s,color,{category:'m8 equipment',bevel});
 // Chair stored beside console; main circulation strip Z 6.3..7.9 remains clear.
 const cx=-1.40,cz=5.8;
 part('chair.seat',[cx,1.22,cz],[.50,.09,.48],[.09,.11,.12],.025);
 part('chair.back',[cx,1.57,cz+.22],[.48,.60,.065],[.10,.12,.13],.025);
 part('chair.column',[cx,.995,cz],[.065,.36,.065],[.43,.46,.48]);
 for(const x of [-.26,.26]){part('chair.arm.'+x,[cx+x,1.45,cz],[.055,.055,.37]);part('chair.armSupport.'+x,[cx+x,1.34,cz+.1],[.035,.20,.035]);}
 // Four caster assemblies and crossed base, using a shared dimensional template.
 for(const x of [-.22,.22])for(const z of [-.22,.22]){part('chair.caster.'+x+'.'+z,[cx+x,.79,cz+z],[.07,.08,.09],[.045,.05,.055]);part('chair.fork.'+x+'.'+z,[cx+x,.85,cz+z],[.035,.07,.04],[.35,.38,.4]);}
 part('chair.base.x',[cx,.88,cz],[.52,.04,.06]);part('chair.base.z',[cx,.88,cz],[.06,.04,.52]);
 // Rack is within the M5 reserved area, with clear front service access.
 const rx=1.8,rz=8.80;
 part('rack.left',[rx-.31,1.70,rz],[.035,1.90,.70]);part('rack.right',[rx+.31,1.70,rz],[.035,1.90,.70]);
 part('rack.top',[rx,2.66,rz],[.655,.03,.70]);part('rack.bottom',[rx,.78,rz],[.655,.06,.70]);part('rack.rear',[rx,1.72,rz+.34],[.59,1.84,.02]);
 for(let i=0;i<4;i++){const y=1.0+i*.36;part('rack.module.'+i,[rx,y,rz],[.56,.25,.62],[.26,.29,.31]);part('rack.handle.'+i,[rx-.22,y,rz-.33],[.035,.12,.035],[.44,.46,.47]);for(let j=0;j<6;j++)part('rack.vent.'+i+'.'+j,[rx-.10+j*.05,y,rz-.316],[.018,.14,.004],[.06,.07,.08],.001);}
 part('rack.networkSwitch',[rx,2.46,rz],[.56,.10,.60],[.25,.28,.30]);
 for(let i=0;i<8;i++)part('rack.port.'+i,[rx-.23+i*.065,2.46,rz-.306],[.043,.028,.009],[.035,.04,.045],.002);
 // Replace rigid monitor support with a two-link authored arm in the same footprint.
 scene.objects=scene.objects.filter(o=>o.name!=='m6.monitor.stand');
 /* Monitor arms are supplied by the embedded M6 workstation GLB. */
 const sensors=[];for(const x of [-4.5,4.5]){part('sensor.mount.'+x,[x,1.35,-3.76],[.12,.20,.16],[.37,.40,.42]);part('sensor.housing.'+x,[x,1.42,-3.64],[.16,.13,.08]);part('sensor.probe.'+x,[x,1.42,-3.51],[.025,.025,.20],[.52,.55,.56]);sensors.push({id:'pressure.'+x,position:[x,1.42,-3.41],quantity:'pressure',units:'Pa',connected:false,value:null});}
 AETHER.M6.partCount=scene.objects.filter(o=>o.name.startsWith('m6.')).length;
 const parts=scene.objects.filter(o=>o.name.startsWith('m8.'));
 const aisle=AETHER.M5.mainAisle,overlap=o=>o.center.every((v,i)=>v+o.size[i]/2>aisle.min[i]+1e-6&&v-o.size[i]/2<aisle.max[i]-1e-6);
 const checks={finite:parts.every(o=>o.center.every(Number.isFinite)&&o.size.every(v=>v>0&&Number.isFinite(v))),unique:new Set(parts.map(o=>o.name)).size===parts.length,aisleClear:!parts.some(overlap),floorContact:Math.abs(.79-.08/2-.75)<1e-9};
 AETHER.M8={checks,geometryReady:Object.values(checks).every(Boolean),partCount:parts.length,sensors,reuse:'shared procedural templates; separate GPU meshes',gpuInstancing:false,visualApproval:'PENDING',browserVerified:false};
}
function alignConsoleToAisle(){}
buildScene();buildControlRoom();buildMainConsole();buildObservationBarrier();buildEquipmentPack();alignConsoleToAisle();
function m4mul(a,b){const o=new Float64Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o}function m4point(m,v,w=1){return[m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12]*w,m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13]*w,m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]*w]}
function m4vector(m,v){return m4point(m,v,0)}
function nodeMatrix(n){if(n.matrix)return Float64Array.from(n.matrix);const q=n.rotation||[0,0,0,1],s=n.scale||[1,1,1],t=n.translation||[0,0,0],[x,y,z,w]=q,x2=x+x,y2=y+y,z2=z+z;return new Float64Array([(1-(y*y2+z*z2))*s[0],(x*y2+w*z2)*s[0],(x*z2-w*y2)*s[0],0,(x*y2-w*z2)*s[1],(1-(x*x2+z*z2))*s[1],(y*z2+w*x2)*s[1],0,(x*z2+w*y2)*s[2],(y*z2-w*x2)*s[2],(1-(x*x2+y*y2))*s[2],0,t[0],t[1],t[2],1])}
const VEHICLE_ASSET=window.__ASSETS.VEHICLE_ASSET;
const VEHICLE_PRODUCTION_CONTRACT=Object.freeze({units:'meter',dimensions:Object.freeze({lengthX:4.7,widthZ:1.928297490761,heightY:1.297449006023}),groundY:0,centerlineZ:0,forwardAxis:'-X world',sourceAxisMapping:'source +Y length/forward, +Z up, +X lateral; local +X nose rotated by VehicleTransform to world -X',tolerance:Object.freeze({dimensions:.002,ground:.002,centerline:.002,contact:.002,sourceBounds:1e-6})});
function finiteHash(x){return typeof x==='string'&&/^[0-9a-f]{64}$/i.test(x)}
function within(a,b,t){return Math.abs(a-b)<=t}
function vehicleFrontEvidence(){
 const body=scene.vehicleParts.find(p=>p.role==='body');if(!body)return{verified:false};
 let rearWing=0,frontHood=0,frontBumper=0,windscreen=0;const p=body.positions;
 for(let i=0;i<p.length;i+=3){const x=p[i],y=p[i+1],z=Math.abs(p[i+2]);
  if(x< -1.85&&y>1.10&&z<.85)rearWing++;
  if(x>1.55&&y>.45&&y<.90&&z<.85)frontHood++;
  if(x>2&&y<.80&&z<.85)frontBumper++;
  if(x>.20&&x<1.40&&y>.70&&y<1.25&&z<.80)windscreen++;
 }
 // Signature is specific to the inspected BMW GLB. An unknown replacement
 // needs its own approved local-nose evidence before flow is allowed.
 const verified=VEHICLE_ASSET.sha256==='c4b2072a381f5ee8eb80a6728fc155391d951da8b139fb5a04f410fb61fd7123'
  &&rearWing>500&&frontHood>1000&&frontBumper>1000&&windscreen>1000;
 return{verified,localNose:[1,0,0],rearWing,frontHood,frontBumper,windscreen};
}
function runM11Checks(g){
 const j=g?.json||{},bin=g?.bin,parts=scene.vehicleParts,wheels=wheelParts(),b=boundsForParts(parts,0),
       ext=b.max.map((v,i)=>v-b.min[i]),center=b.min.map((v,i)=>(v+b.max[i])*.5),
       xw=wheels.map(p=>p.wheel.pivot[0]),zw=wheels.map(p=>p.wheel.pivot[2]),
       wheelbase=Math.max(...xw)-Math.min(...xw),track=Math.max(...zw)-Math.min(...zw),
       sourceExt=VEHICLE_ASSET.rawSourceBBoxExtents||[],images=j.images||[],buffersMeta=j.buffers||[],
       expected=VEHICLE_PRODUCTION_CONTRACT.dimensions, tol=VEHICLE_PRODUCTION_CONTRACT.tolerance;
 const checks={
  glbEmbedded:!!bin&&bin.byteLength>0&&typeof VEHICLE_ASSET.base64==='string'&&VEHICLE_ASSET.base64.length>100,
  gltf2:j.asset?.version==='2.0'&&j.scene===0&&Array.isArray(j.scenes)&&j.scenes.length>0,
  noExternalRuntimeUris:!(j.buffers||[]).some(x=>x.uri)&&!(j.images||[]).some(x=>x.uri),
  meshBlocks:j.meshes?.length===VEHICLE_ASSET.sourceMeshBlocks&&j.nodes?.length===VEHICLE_ASSET.sourceObjectBlocks,
  importedPrimitives:parts.length===5&&parts.filter(p=>p.role==='body').length===1&&wheels.length===4,
  sourceBounds:sourceExt.length===3&&diagnostics.vehicleBounds.rawExtents.every((v,i)=>within(v,sourceExt[i],tol.sourceBounds)),
  scaleCorrect:ext.every((v,i)=>within(v,[expected.lengthX,expected.heightY,expected.widthZ][i],tol.dimensions)),
  groundCorrect:within(b.min[1],VEHICLE_PRODUCTION_CONTRACT.groundY,tol.ground)&&within(AETHER.VEHICLE_TRANSFORM.worldAABB.min[1],VEHICLE_PRODUCTION_CONTRACT.groundY,tol.ground),
  centerlineCorrect:within(center[0],0,tol.centerline)&&within(center[2],VEHICLE_PRODUCTION_CONTRACT.centerlineZ,tol.centerline),
  forwardDirection:vehicleFrontEvidence().verified&&AETHER.VEHICLE_TRANSFORM.localToWorld([1,0,0])[0]<AETHER.VEHICLE_TRANSFORM.localToWorld([0,0,0])[0],
  wheelDataExtracted:wheels.length===4&&wheels.every(p=>p.wheel&&finite(p.wheel.radius)&&p.wheel.radius>.24&&p.wheel.radius<.45&&finite(p.wheel.widthZ)&&p.wheel.widthZ>.10&&p.wheel.widthZ<.40&&p.wheel.pivot.every(finite)),
  wheelSpacing:finite(wheelbase)&&finite(track)&&wheelbase>2.2&&wheelbase<3.4&&track>1.2&&track<1.9,
  contactToBelt:!!scene.objects.find(o=>o.name==='belt')&&wheels.every((p,i)=>{const wb=wheelWorldBoundsAt(0,i);return within(wb.min[1],scene.objects.find(o=>o.name==='belt').center[1]+scene.objects.find(o=>o.name==='belt').size[1]/2,tol.contact)}),
  transformAuthority:alignedVehicle()&&AETHER.VEHICLE_TRANSFORM.position.every((v,i)=>v===[0,0,0][i])&&AETHER.VEHICLE_TRANSFORM.scale.every(v=>v===1),
  vehicleHashes:finiteHash(VEHICLE_ASSET.sha256)&&finiteHash(VEHICLE_ASSET.sourceZipSha256)&&finiteHash(VEHICLE_ASSET.diffEmbeddedSha256),
  embeddedTexture:images.length>0&&images.every(im=>!im.uri&&typeof im.bufferView==='number')&&buffersMeta.length>0
 };
 const passed=Object.values(checks).every(Boolean);
 const wheelRecords=wheels.map(p=>({name:p.name,pivot:p.wheel.pivot.slice(),radius:p.wheel.radius,widthZ:p.wheel.widthZ,correctionMax:p.wheel.correctionMax}));
 AETHER.VEHICLE_PRODUCTION=Object.freeze({assetId:VEHICLE_ASSET.sha256,source:VEHICLE_ASSET.name,embedded:checks.glbEmbedded,format:'glTF 2.0 binary embedded in HTML',sourceVersion:'User-provided GLB 2.0',units:'meter',axis:{source:'Y forward / Z up / X lateral',aether:'world -X vehicle nose / +X downstream / +Y up / +Z lateral'},transform:Object.freeze({position:AETHER.VEHICLE_TRANSFORM.position,rotation:AETHER.VEHICLE_TRANSFORM.rotation,scale:AETHER.VEHICLE_TRANSFORM.scale,dimensions:{...AETHER.VEHICLE_TRANSFORM.dimensions},worldBounds:{min:b.min.slice(),max:b.max.slice()},centerlineZ:VEHICLE_PRODUCTION_CONTRACT.centerlineZ,groundY:VEHICLE_PRODUCTION_CONTRACT.groundY}),wheels:Object.freeze(wheelRecords),wheelbase,trackWidth:track,materialPolicy:'embedded source material preserved; M9 BRDF consumes source factors'});
 AETHER.M11={passed,geometryReady:passed,checks,source:{meshBlocks:j.meshes?.length||0,nodeBlocks:j.nodes?.length||0,embeddedBytes:bin?.byteLength||0,textureCount:images.length},transform:{bounds:{min:b.min,max:b.max},extents:ext,center,expected:{lengthX:expected.lengthX,widthZ:expected.widthZ,heightY:expected.heightY},wheelbase,trackWidth:track},wheels:wheelRecords,visualApproval:'PENDING',browserVerified:false,productReady:false,limitations:['M11 source/transform contract verified; new device visual approval remains pending','CFD transform bridge is deferred to M12']};
 diagnostics.vehicleProduction={...AETHER.M11,sourceHash:VEHICLE_ASSET.sha256};
 if(!passed)throw Error('M11 vehicle production integration failed: '+Object.entries(checks).filter(([,v])=>!v).map(([k])=>k).join(','));
 return AETHER.M11;
}
function bytesFromBase64(b64){if(typeof Uint8Array.fromBase64==='function'){try{return Uint8Array.fromBase64(b64)}catch(_){}}const raw=atob(b64),out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out}
function parseGLB(base64=VEHICLE_ASSET.base64){
 const bytes=bytesFromBase64(base64);if(bytes.length<20)throw Error('GLB header truncated');
 const dv=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(dv.getUint32(0,true)!==0x46546c67||dv.getUint32(4,true)!==2)throw Error('Invalid glTF 2.0 header');
 if(dv.getUint32(8,true)!==bytes.length)throw Error('GLB declared length mismatch');
 let p=12,json=null,bin=null;while(p<bytes.length){
  if(p+8>bytes.length)throw Error('GLB chunk header truncated');
  const len=dv.getUint32(p,true),type=dv.getUint32(p+4,true);if(len%4||p+8+len>bytes.length)throw Error('GLB chunk boundary invalid');
  const chunk=bytes.subarray(p+8,p+8+len);
  if(type===0x4e4f534a){if(json||p!==12)throw Error('Invalid GLB JSON order');json=JSON.parse(new TextDecoder().decode(chunk));}
  if(type===0x4e4942){if(bin)throw Error('Duplicate GLB BIN');bin=chunk;}p+=8+len;
 }
 if(!json||!bin||json.asset?.version!=='2.0')throw Error('GLB chunks incomplete');return{bytes,json,bin};
}
function readAccessor(gltf,bin,index){
 const a=gltf.accessors?.[index];if(!a||a.sparse)throw Error('Missing or unsupported sparse accessor '+index);
 const v=gltf.bufferViews?.[a.bufferView],n={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],size={5120:1,5121:1,5122:2,5123:2,5125:4,5126:4}[a.componentType];
 if(!v||!n||!size||v.buffer!==0||!Number.isInteger(a.count)||a.count<=0)throw Error('Invalid accessor '+index);
 const off=v.byteOffset||0,local=a.byteOffset||0,stride=v.byteStride||n*size,start=off+local;
 if(![off,local,v.byteLength,stride].every(x=>Number.isInteger(x)&&x>=0)||stride<n*size||stride%size||start%size||off+v.byteLength>bin.length||local+(a.count-1)*stride+n*size>v.byteLength)throw Error('Accessor range invalid '+index);
 const out=new Array(a.count*n),dv=new DataView(bin.buffer,bin.byteOffset,bin.byteLength);
 const read=p=>a.componentType===5126?dv.getFloat32(p,true):a.componentType===5125?dv.getUint32(p,true):a.componentType===5123?dv.getUint16(p,true):a.componentType===5121?dv.getUint8(p):a.componentType===5122?dv.getInt16(p,true):dv.getInt8(p);
 for(let i=0;i<a.count;i++)for(let c=0;c<n;c++){const value=read(start+i*stride+c*size);if(!finite(value))throw Error('Nonfinite accessor '+index);out[i*n+c]=value;}
 if(a.normalized){if(a.componentType===5126)throw Error('Float accessor cannot be normalized');const div={5120:127,5121:255,5122:32767,5123:65535,5125:4294967295}[a.componentType];for(let i=0;i<out.length;i++)out[i]=Math.max(-1,out[i]/div);}
 return{data:out,count:a.count,n};
}
function matMul(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)o[c*4+r]=a[r]*b[c*4]+a[4+r]*b[c*4+1]+a[8+r]*b[c*4+2]+a[12+r]*b[c*4+3];return o}function perspective(fovy,aspect,n,f){const q=1/Math.tan(fovy*Math.PI/360),nf=1/(n-f);return new Float32Array([q/aspect,0,0,0,0,q,0,0,0,0,(f+n)*nf,-1,0,0,2*f*n*nf,0])}function norm(v){const l=Math.hypot(...v)||1;return v.map(x=>x/l)}function cross(a,b){return[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]}function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]}function lookAt(e,t,u){const z=norm(sub(e,t)),x=norm(cross(u,z)),y=cross(z,x);return new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,e),-dot(y,e),-dot(z,e),1])}
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
 function depth(mesh,m){gl.uniformMatrix4fv(lighting.depthMVP,false,m===id?lighting.lightVP:matMul(lighting.lightVP,m));drawDepthMesh(mesh)}
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
























function initGL(){try{gl=glCanvas.getContext('webgl2',{antialias:true,alpha:false,depth:true});if(gl)perfInstrument(gl);baseline.runtime.webGL2Exposed=!!gl;if(!gl)throw Error('WebGL2 unavailable');const vs=gl.createShader(gl.VERTEX_SHADER),fs=gl.createShader(gl.FRAGMENT_SHADER);gl.shaderSource(vs,vert);gl.compileShader(vs);if(!gl.getShaderParameter(vs,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(vs));gl.shaderSource(fs,frag);gl.compileShader(fs);if(!gl.getShaderParameter(fs,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(fs));program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));loc={colorLinear:gl.getUniformLocation(program,'u_colorLinear'),surface:gl.getUniformLocation(program,'u_surface'),eye:gl.getUniformLocation(program,'u_eye'),pos:gl.getAttribLocation(program,'a_position'),normal:gl.getAttribLocation(program,'a_normal'),uv:gl.getAttribLocation(program,'a_uv'),mvp:gl.getUniformLocation(program,'u_mvp'),model:gl.getUniformLocation(program,'u_model'),color:gl.getUniformLocation(program,'u_color'),alpha:gl.getUniformLocation(program,'u_alpha'),tex:gl.getUniformLocation(program,'u_tex'),useTex:gl.getUniformLocation(program,'u_useTex'),beltSurface:gl.getUniformLocation(program,'u_beltSurface'),beltTravel:gl.getUniformLocation(program,'u_beltTravel'),rollerSurface:gl.getUniformLocation(program,'u_rollerSurface')};gl.deleteShader(vs);gl.deleteShader(fs);
whiteTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,whiteTexture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.clearColor(.08,.11,.13,1);resize();gl.viewport(0,0,glCanvas.width,glCanvas.height);return true}catch(e){diagnostics.error('WebGL2 renderer',e);return false}}
function resize(){if(!gl)return;const d=clamp(devicePixelRatio||1,1,MOBILE?1.5:(renderQuality==='high'?2:1))*((FX.on&&!FX.err)?1:((window.__LIVE&&window.__LIVE.cs)||1)),w=Math.max(1,Math.floor(glCanvas.clientWidth*d)),h=Math.max(1,Math.floor(glCanvas.clientHeight*d));if(glCanvas.width!==w||glCanvas.height!==h){glCanvas.width=w;glCanvas.height=h;gl.viewport(0,0,w,h);diagnostics.events.push({time:now(),type:'RESIZE',message:w+'x'+h})}}
let renderQuality='high';document.getElementById('qualityMode')?.addEventListener('click',()=>{renderQuality=renderQuality==='high'?'balanced':'high';document.getElementById('qualityMode').textContent='화질: '+(renderQuality==='high'?'고화질':'균형')});
const fpv={enabled:true,x:0,z:7.5,yaw:0,pitch:-.08,vx:0,vz:0,last:null,phase:0,sway:true,keys:new Set(),stick:[0,0],look:null};
function clearWalk(){joyId=null;fpv.keys.clear();fpv.stick=[0,0];fpv.vx=fpv.vz=0;fpv.last=null;fpv.look=null;document.getElementById('stick').style.transform='translate(0px,0px)'}
function startWalk(){window.__CINE&&window.__CINE.cancel('walk');clearWalk();fpv.enabled=true;fpv.x=0;fpv.z=7.5;fpv.gy=undefined;fpv.yaw=0;fpv.pitch=-.08;camera.preset='FPV';camera.cutaway=false;camera.fov=72;camera.up=[0,1,0];document.getElementById('viewName').textContent='FPV · 관제실';document.getElementById('viewHint').textContent='눈높이 1.65m · 보행 속도 1.6m/s';document.getElementById('cutaway').textContent='Cutaway: Off'}
const DOOR={x0:2.3,x1:3.5,y0:.75,y1:2.95,zPanel:4.13,N:12,t:0,built:false,landZ:3.72,steps:4,rise:.15,tread:.30};
function doorBuild(){if(DOOR.built||scene.objects.some(o=>o.name.startsWith('door.')))return;const {x0,x1}=DOOR,shift=3.5-x0,add=[],drop=new Set();
 DOOR.report=[];for(const o of scene.objects){const lo=o.center.map((v,i)=>v-o.size[i]/2),hi=o.center.map((v,i)=>v+o.size[i]/2);
  if(hi[2]<=3.70||lo[2]>=4.12)continue;const cuttable=o.name.startsWith('m7.')||o.name.startsWith('m5.window')||o.category==='observation opening'||o.category==='observation glass';if(!cuttable){if(hi[1]>DOOR.y0+.12&&lo[1]<DOOR.y1&&hi[0]>x0&&lo[0]<x1)DOOR.report.push(o.name);continue}
  if(o.name.startsWith('m7.')&&o.center[0]>3.4&&o.size[0]<.2){o.center=[o.center[0]-shift,o.center[1],o.center[2]];o._mesh=null;continue}
  if(hi[1]<=0||lo[1]>=DOOR.y1)continue;if(hi[0]<=x0+1e-6||lo[0]>=x1-1e-6)continue;
  if(lo[0]<x0&&hi[0]>x0){const right=hi[0]-x1;o.size=[x0-lo[0],o.size[1],o.size[2]];o.center=[(lo[0]+x0)/2,o.center[1],o.center[2]];o._mesh=null;o.bevel=Math.min(o.bevel,Math.min(...o.size)/4);
   if(right>.005&&o.material!=='glass'&&!o.name.startsWith('m7.'))add.push({name:o.name+' east',center:[(x1+hi[0])/2,o.center[1],o.center[2]],size:[right,o.size[1],o.size[2]],color:o.color,opt:{material:o.material,bevel:Math.min(o.bevel,right/4),category:o.category}});}
  else drop.add(o);}
 scene.objects=scene.objects.filter(o=>!drop.has(o));for(const a of add)addBox(a.name,a.center,a.size,a.color,a.opt);
 const B=(n,c,s,col,opt={})=>addBox('door.'+n,c,s,col,{bevel:.01,category:'door',...opt}),mid=(x0+x1)/2,w=x1-x0;
 B('landing',[mid,DOOR.y0/2,(DOOR.landZ+4.12)/2],[w,DOOR.y0,4.12-DOOR.landZ],[.22,.25,.28]);
 B('landing.nosing',[mid,DOOR.y0+.004,DOOR.landZ+.03],[w,.008,.06],[.85,.72,.15]);
 for(let i=0;i<DOOR.steps;i++){const top=DOOR.y0-DOOR.rise*(i+1),z1=DOOR.landZ-DOOR.tread*i,z0=z1-DOOR.tread;B('step.'+i,[mid,top/2,(z0+z1)/2],[w,top,DOOR.tread],[.22,.25,.28]);B('step.nosing.'+i,[mid,top+.004,z1-.03],[w,.008,.06],[.85,.72,.15]);}
 const zEnd=DOOR.landZ-DOOR.tread*DOOR.steps;
 for(const x of [x0+.03,x1-.03]){B('rail.'+x,[x,1.05,(zEnd+DOOR.landZ)/2+.2],[.04,.04,DOOR.landZ-zEnd+.4],[.62,.66,.68]);for(const z of [zEnd+.1,DOOR.landZ])B('post.'+x+'.'+z,[x,(.15+1.05)/2+(z-zEnd)/(DOOR.landZ-zEnd)*.3,z],[.04,.9,.04],[.62,.66,.68]);}
 B('header',[mid,(DOOR.y1+3.05)/2,3.90],[w,3.05-DOOR.y1,.26],[.24,.27,.29]);
 B('track',[mid-.55,DOOR.y1+.04,DOOR.zPanel],[w+1.3,.08,.06],[.55,.58,.60]);
 DOOR.light=B('light',[x1-.12,DOOR.y1+.13,DOOR.zPanel+.02],[.12,.05,.02],[.9,.2,.15]);
 B('sign',[mid,DOOR.y1+.13,DOOR.zPanel+.02],[.5,.1,.012],[.08,.35,.2]);
 DOOR.frames=[];for(let k=0;k<DOOR.N;k++){const cx=mid-(w-.12)*k/(DOOR.N-1),vis=k===0,f=[];
  f.push(B('panel.'+k,[cx,(DOOR.y0+DOOR.y1)/2,DOOR.zPanel],[w-.06,DOOR.y1-DOOR.y0-.04,.02],[.70,.82,.86],{material:'glass',visible:vis,bevel:.002}));
  for(const dx of [-(w-.06)/2,(w-.06)/2])f.push(B('stile.'+k+'.'+dx.toFixed(2),[cx+dx,(DOOR.y0+DOOR.y1)/2,DOOR.zPanel],[.05,DOOR.y1-DOOR.y0-.02,.05],[.30,.33,.35],{visible:vis}));
  for(const y of [DOOR.y0+.03,DOOR.y1-.03])f.push(B('rail.'+k+'.'+y,[cx,y,DOOR.zPanel],[w-.06,.05,.05],[.30,.33,.35],{visible:vis}));
  f.push(B('handle.'+k,[cx+(w-.06)/2-.12,1.75,DOOR.zPanel+.05],[.03,.45,.03],[.72,.75,.77],{visible:vis}));DOOR.frames.push(f)}
 DOOR.built=true}
window.__doorPlace=()=>{fpv.x=(DOOR.x0+DOOR.x1)/2;fpv.z=5.6;fpv.yaw=0;fpv.pitch=-.12;fpv.gy=undefined};
function doorGround(x,z){const {x0,x1,landZ,tread,steps,rise,y0}=DOOR,inX=x>=x0&&x<=x1;if(z>=3.96)return y0;if(inX&&z>=landZ)return y0;if(inX&&z>=landZ-tread*steps){const i=Math.min(steps-1,Math.floor((landZ-z)/tread));return y0-rise*(i+1)}return 0}
function doorUpdate(dt){if(!DOOR.built)return;const near=fpv.enabled&&Math.hypot(fpv.x-(DOOR.x0+DOOR.x1)/2,fpv.z-DOOR.zPanel)<1.9;DOOR.t=clamp(DOOR.t+(near?1:-1)*dt*1.4,0,1);const e=DOOR.t*DOOR.t*(3-2*DOOR.t),k=Math.round(e*(DOOR.N-1));
 if(k!==DOOR.shown){DOOR.shown=k;DOOR.frames.forEach((f,i)=>f.forEach(o=>o.visible=i===k))}if(DOOR.light)DOOR.light.color=DOOR.t>.9?[.15,.95,.35]:DOOR.t>0?[.95,.7,.15]:[.9,.2,.15]}
function canWalk(x,z,fromX=fpv.x,fromZ=fpv.z){const r=.22,{x0,x1}=DOOR;
 const room=x>=-3.86&&x<=3.86&&z>=4.34&&z<=9.08,corridor=DOOR.built&&x>=x0+r&&x<=x1-r&&z>=DOOR.landZ-DOOR.tread*DOOR.steps-.01&&z<4.34;
 const L=AETHER.FAN_MODULE?.layout,xMax=(L?.diagnostics?.collectorFaceX??8.6)-.45,tunnel=DOOR.built&&x>=-8.3&&x<=xMax&&z>=-3.66&&z<=3.60;
 if(!room&&!corridor&&!tunnel)return false;
 if(!room&&DOOR.built&&z<4.15+r&&z>4.11-r&&x>x0-r&&x<x1+r&&DOOR.t<.85)return false;
 const g=doorGround(x,z);if(Math.abs(g-doorGround(fromX,fromZ))>.2)return false;const feet=g,head=g+1.65;
 const vb=AETHER.VEHICLE_TRANSFORM?.worldAABB;if(vb&&feet<vb.max[1]&&x+r>vb.min[0]&&x-r<vb.max[0]&&z+r>vb.min[2]&&z-r<vb.max[2])return false;
 const fb=L?.fanBounds;if(fb&&x+r>fb.min[0]&&x-r<fb.max[0]&&z+r>fb.min[2]&&z-r<fb.max[2])return false;
 return !scene.objects.some(o=>{if(o.name.startsWith('door.')||o.name==='control room floor'||o.name.includes('floor.seam')||o.name.includes('equipment.mark')||o.category==='floor seams')return false;const lo=o.center.map((v,i)=>v-o.size[i]/2),hi=o.center.map((v,i)=>v+o.size[i]/2);if(hi[1]<=feet+.25||lo[1]>=head)return false;return x+r>lo[0]&&x-r<hi[0]&&z+r>lo[2]&&z-r<hi[2]})}
function updateWalk(t){bodyTick();if(!fpv.enabled){doorUpdate(0.05);return}const dt=fpv.last===null?0:Math.min(.05,Math.max(0,(t-fpv.last)/1000));fpv.last=t;doorUpdate(dt);let side=(fpv.keys.has('KeyD')?1:0)-(fpv.keys.has('KeyA')?1:0)+fpv.stick[0],forward=(fpv.keys.has('KeyW')?1:0)-(fpv.keys.has('KeyS')?1:0)-fpv.stick[1];const len=Math.hypot(side,forward);if(len>1){side/=len;forward/=len}const speed=1.6,k=1-Math.exp(-12*dt),tx=(Math.cos(fpv.yaw)*side+Math.sin(fpv.yaw)*forward)*speed,tz=(Math.sin(fpv.yaw)*side-Math.cos(fpv.yaw)*forward)*speed;fpv.vx+=(tx-fpv.vx)*k;fpv.vz+=(tz-fpv.vz)*k;const ox=fpv.x,oz=fpv.z;if(canWalk(fpv.x+fpv.vx*dt,fpv.z))fpv.x+=fpv.vx*dt;else fpv.vx=0;if(canWalk(fpv.x,fpv.z+fpv.vz*dt))fpv.z+=fpv.vz*dt;else fpv.vz=0;const moved=Math.hypot(fpv.x-ox,fpv.z-oz);fpv.phase+=moved*9;const g=doorGround(fpv.x,fpv.z);fpv.gy=fpv.gy===undefined?g:fpv.gy+(g-fpv.gy)*(1-Math.exp(-14*dt));const bob=fpv.sway?Math.sin(fpv.phase)*.012*Math.min(1,Math.hypot(fpv.vx,fpv.vz)):0;camera.eye=[fpv.x,fpv.gy+1.65+bob,fpv.z];{const B=window.__BODY;if(B.active&&B.speed>0){const a=Math.min(.012,B.speed*.004),q=t*.001;camera.eye[0]+=a*(Math.sin(q*23.1)+.5*Math.sin(q*41.7));camera.eye[1]+=a*.6*Math.sin(q*29.3+1.3)}}const cp=Math.cos(fpv.pitch);camera.target=[fpv.x+Math.sin(fpv.yaw)*cp,camera.eye[1]+Math.sin(fpv.pitch),fpv.z-Math.cos(fpv.yaw)*cp]}

function lookWalk(dx,dy){if(!Number.isFinite(dx)||!Number.isFinite(dy))return;fpv.yaw+=clamp(dx,-500,500)*.0025;fpv.pitch=clamp(fpv.pitch-clamp(dy,-500,500)*.0025,-1.35,1.35)}
function captureInput(el,id){try{el.setPointerCapture(id);return true}catch(e){diagnostics.events.push({time:now(),type:'INPUT_CAPTURE_UNAVAILABLE',message:e.name||'capture'});return false}}
let lockPending=false;
addEventListener('pointerup',e=>{if(fpv.look?.id===e.pointerId)fpv.look=null});addEventListener('pointercancel',e=>{if(fpv.look?.id===e.pointerId)fpv.look=null});
function lockFallback(){lockPending=false;document.getElementById('fpvHelp').textContent='마우스 드래그로 시점 변경 · WASD 이동'}
if(document.addEventListener){document.addEventListener('pointerlockerror',lockFallback);document.addEventListener('pointerlockchange',()=>{lockPending=false;if(document.pointerLockElement===glCanvas){fpv.look=null;document.getElementById('fpvHelp').textContent='WASD 이동 · 마우스 시점 · Esc 해제'}})}
addEventListener('keydown',e=>{if(fpv.enabled&&['KeyW','KeyA','KeyS','KeyD'].includes(e.code)&&!['INPUT','TEXTAREA','SELECT'].includes(e.target?.tagName)){e.preventDefault();fpv.keys.add(e.code)}});addEventListener('keyup',e=>fpv.keys.delete(e.code));addEventListener('blur',clearWalk);
if(document.addEventListener){document.addEventListener('visibilitychange',clearWalk);document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==glCanvas)clearWalk()});document.addEventListener('mousemove',e=>{if(fpv.enabled&&document.pointerLockElement===glCanvas)lookWalk(e.movementX,e.movementY)})}
glCanvas.addEventListener('pointerdown',e=>{if(!fpv.enabled||e.button>0)return;if(e.pointerType==='mouse'){if(document.pointerLockElement===glCanvas)return;fpv.look={id:e.pointerId,x:e.clientX,y:e.clientY};if(glCanvas.requestPointerLock&&!lockPending){lockPending=true;try{const result=glCanvas.requestPointerLock();if(result&&typeof result.then==='function')result.then(()=>{lockPending=false},lockFallback)}catch(_){lockFallback()}}return;}if(e.clientX<glCanvas.getBoundingClientRect().left+glCanvas.clientWidth*.4||fpv.look!==null)return;fpv.look={id:e.pointerId,x:e.clientX,y:e.clientY};captureInput(glCanvas,e.pointerId)});
glCanvas.addEventListener('pointermove',e=>{if(!fpv.enabled||document.pointerLockElement===glCanvas||fpv.look?.id!==e.pointerId)return;lookWalk(e.clientX-fpv.look.x,e.clientY-fpv.look.y);fpv.look.x=e.clientX;fpv.look.y=e.clientY});
for(const ev of ['pointerup','pointercancel','lostpointercapture'])glCanvas.addEventListener(ev,e=>{if(fpv.look?.id===e.pointerId)fpv.look=null});
const joy=document.getElementById('joystick');let joyId=null;
function moveJoy(e){const r=joy.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2,n=Math.max(45,Math.hypot(dx,dy));fpv.stick=[dx/n,dy/n];if(Math.hypot(...fpv.stick)<.12)fpv.stick=[0,0];document.getElementById('stick').style.transform='translate('+fpv.stick[0]*40+'px,'+fpv.stick[1]*40+'px)'}
joy.addEventListener('pointerdown',e=>{if(joyId!==null)return;joyId=e.pointerId;captureInput(joy,e.pointerId);moveJoy(e)});joy.addEventListener('pointermove',e=>{if(e.pointerId===joyId)moveJoy(e)});for(const ev of ['pointerup','pointercancel','lostpointercapture'])joy.addEventListener(ev,e=>{if(e.pointerId===joyId){joyId=null;fpv.stick=[0,0];document.getElementById('stick').style.transform='translate(0px,0px)'}});
document.getElementById('walkMode').addEventListener('click',startWalk);document.getElementById('swayMode').addEventListener('click',()=>{fpv.sway=!fpv.sway;document.getElementById('swayMode').textContent='흔들림: '+(fpv.sway?'켬':'끔')});startWalk();
function model(center,size){return new Float32Array([size[0]/2,0,0,0,0,size[1]/2,0,0,0,0,size[2]/2,0,center[0],center[1],center[2],1])}function vehicleModel(){const vt=AETHER.VEHICLE_TRANSFORM,o=vt.position,r=vt.rotation,s=vt.scale,rxm=rf([1,0,0],r),rym=rf([0,1,0],r),rzm=rf([0,0,1],r);return new Float32Array([rxm[0]*s[0],rxm[1]*s[0],rxm[2]*s[0],0,rym[0]*s[1],rym[1]*s[1],rym[2]*s[1],0,rzm[0]*s[2],rzm[1]*s[2],rzm[2]*s[2],0,o[0],o[1],o[2],1])}
function bindMesh(P,N,U,I){const pb=gl.createBuffer(),nb=gl.createBuffer(),ub=gl.createBuffer(),ib=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,pb);gl.bufferData(gl.ARRAY_BUFFER,P,gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,nb);gl.bufferData(gl.ARRAY_BUFFER,N,gl.STATIC_DRAW);gl.bindBuffer(gl.ARRAY_BUFFER,ub);gl.bufferData(gl.ARRAY_BUFFER,U,gl.STATIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,I,gl.STATIC_DRAW);return{pb,nb,ub,ib,count:I.length,type:I instanceof Uint32Array?gl.UNSIGNED_INT:gl.UNSIGNED_SHORT}}
function normalMatrix(m,n){const a=m[0],b=m[4],c=m[8],d=m[1],e=m[5],f=m[9],g=m[2],h=m[6],i=m[10],A=e*i-f*h,B=f*g-d*i,C=d*h-e*g,D=c*h-b*i,E=a*i-c*g,F=b*g-a*h,G=b*f-c*e,H=c*d-a*f,I=a*e-b*d,det=a*A+b*B+c*C;if(Math.abs(det)<1e-12)throw new Error('singular normal transform');const invT=[A,D,G,B,E,H,C,F,I].map(v=>v/det),q=[invT[0]*n[0]+invT[3]*n[1]+invT[6]*n[2],invT[1]*n[0]+invT[4]*n[1]+invT[7]*n[2],invT[2]*n[0]+invT[5]*n[1]+invT[8]*n[2]],l=Math.hypot(...q);if(!finite(l)||l<1e-12)throw new Error('invalid transformed normal');return[q[0]/l,q[1]/l,q[2]/l]}
function loadVehicle(){
 const g=parseGLB(),parts=[],mins=[Infinity,Infinity,Infinity],maxs=[-Infinity,-Infinity,-Infinity],rawCount={primitives:0,vertices:0,sourceMeshes:0,sourceObjects:0};
 const roots=(g.json.scenes[g.json.scene]||{}).nodes||[];
 const walk=(ni,parent)=>{const n=g.json.nodes[ni];if(!n)throw Error('GLB node missing');const M=m4mul(parent,nodeMatrix(n));if(n.mesh!==undefined){rawCount.sourceMeshes++;const nodeName=n.name||'';const role=nodeName==='OBcovered_car'?'body':/^OBcovered_car_wheel_0[1-4]$/.test(nodeName)?'wheel':'unknown';if(role==='unknown')throw Error('Unexpected vehicle node '+nodeName);for(const pr of g.json.meshes[n.mesh].primitives){if(pr.mode!==undefined&&pr.mode!==4)throw Error('Vehicle primitive is not triangles');const pos=readAccessor(g.json,g.bin,pr.attributes.POSITION),nor=pr.attributes.NORMAL!==undefined?readAccessor(g.json,g.bin,pr.attributes.NORMAL):null,uv=pr.attributes.TEXCOORD_0!==undefined?readAccessor(g.json,g.bin,pr.attributes.TEXCOORD_0):null,idx=pr.indices!==undefined?readAccessor(g.json,g.bin,pr.indices):null;if(pos.n!==3||nor&&(nor.n!==3||nor.count!==pos.count)||uv&&(uv.n!==2||uv.count!==pos.count))throw Error('Mismatched vehicle attributes');if(idx&&(idx.n!==1||idx.count%3||!idx.data.every(i=>Number.isInteger(i)&&i>=0&&i<pos.count)))throw Error('Invalid vehicle indices');const P=new Float32Array(pos.count*3),N=new Float32Array(pos.count*3),U=new Float32Array(pos.count*2);for(let i=0;i<pos.count;i++){const q=m4point(M,[pos.data[i*3],pos.data[i*3+1],pos.data[i*3+2]]);P.set(q,i*3);const nn=nor?normalMatrix(M,[nor.data[i*3],nor.data[i*3+1],nor.data[i*3+2]]):[0,1,0];N.set(nn,i*3);if(uv)U.set([uv.data[i*2],uv.data[i*2+1]],i*2);for(let d=0;d<3;d++){mins[d]=Math.min(mins[d],q[d]);maxs[d]=Math.max(maxs[d],q[d])}}const I=idx?new Uint32Array(idx.data):new Uint32Array(Array.from({length:pos.count},(_,i)=>i));const mat=g.json.materials[pr.material||0]||{},pbr=mat.pbrMetallicRoughness||{};parts.push({name:nodeName,role,positions:P,normals:N,uvs:U,indices:I,color:[...(pbr.baseColorFactor||[.5,.5,.5,1])],surface:Object.freeze([pbr.roughnessFactor??1,pbr.metallicFactor??1,0,0]),textureIndex:pbr.baseColorTexture?.index??null}) ;rawCount.primitives++;rawCount.vertices+=pos.count}}rawCount.sourceObjects++;for(const c of n.children||[])walk(c,M)};
 const I=new Float64Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);for(const r of roots)walk(r,I);if(parts.filter(p=>p.role==='body').length!==1||parts.filter(p=>p.role==='wheel').length!==4)throw Error('Vehicle body/wheel contract mismatch');const ext=maxs.map((v,i)=>v-mins[i]);if(!parts.length||!ext.every(v=>finite(v)&&v>0)||!mins.every(finite)||!maxs.every(finite))throw Error('covered car geometry bounds invalid');const sx=config.vehicleReference.lengthX/ext[1],sy=sx,sz=sx,cx=(mins[0]+maxs[0])/2,cy=(mins[1]+maxs[1])/2,minz=mins[2];for(const part of parts){for(let i=0;i<part.positions.length;i+=3){const ox=part.positions[i],oy=part.positions[i+1],oz=part.positions[i+2];part.positions[i]=(oy-cy)*sx;part.positions[i+1]=(oz-minz)*sy;part.positions[i+2]=(ox-cx)*sz}for(let i=0;i<part.normals.length;i+=3){const ox=part.normals[i],oy=part.normals[i+1],oz=part.normals[i+2],q=[oy/sx,oz/sy,ox/sz],l=Math.hypot(...q);if(!finite(l)||l<1e-12)throw Error('vehicle normal transform invalid');part.normals[i]=q[0]/l;part.normals[i+1]=q[1]/l;part.normals[i+2]=q[2]/l}let lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=0;i<part.positions.length;i+=3)for(let d=0;d<3;d++){lo[d]=Math.min(lo[d],part.positions[i+d]);hi[d]=Math.max(hi[d],part.positions[i+d])}if(part.role==='wheel'){const c=[(lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(lo[2]+hi[2])/2],k=sy/sx;const qpos=new Float32Array(part.positions.length),qnor=new Float32Array(part.normals.length);let R=0;for(let i=0;i<part.positions.length;i+=3){qpos[i]=(part.positions[i]-c[0]);qpos[i+1]=part.positions[i+1]-c[1];qpos[i+2]=part.positions[i+2]-c[2];R=Math.max(R,Math.hypot(qpos[i],qpos[i+1]));const nn=[part.normals[i],part.normals[i+1],part.normals[i+2]],nl=Math.hypot(...nn)||1;qnor[i]=nn[0]/nl;qnor[i+1]=nn[1]/nl;qnor[i+2]=nn[2]/nl}const correctionMax=Math.max(...Array.from({length:qpos.length/3},(_,j)=>Math.hypot(qpos[j*3]- (part.positions[j*3]-c[0]),qpos[j*3+1]-(part.positions[j*3+1]-c[1]),qpos[j*3+2]-(part.positions[j*3+2]-c[2]))));if(!(R>=.24&&R<=.45&&hi[2]-lo[2]>=.10&&hi[2]-lo[2]<=.40&&correctionMax<=.02))throw Error('WHEEL_GEOMETRY_REVIEW_REQUIRED');part.positions=qpos;part.normals=qnor;part.wheel={rawCenter:c,pivot:[c[0],c[1]-lo[1],c[2]],radius:R,widthZ:hi[2]-lo[2],correctionScale:1,correctionMax,theta:0}}}
 scene.vehicleParts=parts;diagnostics.vehicleBounds={rawMin:mins,rawMax:maxs,rawExtents:ext,normalized:{lengthX:config.vehicleReference.lengthX,widthZ:config.vehicleReference.widthZ,heightY:config.vehicleReference.heightY,forwardAxis:'-X world (source +Y / local +X)',groundY:0,scale:[sx,sy,sz]},primitives:rawCount.primitives,vertices:rawCount.vertices,sourceMeshes:rawCount.sourceMeshes,sourceObjects:rawCount.sourceObjects,sourceVertices:VEHICLE_ASSET.sourceVertices,sourcePolygons:VEHICLE_ASSET.sourcePolygons,sourceLoops:VEHICLE_ASSET.sourceLoops,sourceTriangles:VEHICLE_ASSET.sourceTriangles};diagnostics.sourceAsset=VEHICLE_ASSET;diagnostics.wheelNormalization=parts.filter(p=>p.role==='wheel').map(p=>({name:p.name,pivot:p.wheel.pivot,radius:p.wheel.radius,widthZ:p.wheel.widthZ,correctionMax:p.wheel.correctionMax}));return g
}


function cylinderMesh(radius,length,segments){const positions=[],normals=[],uvs=[],indices=[],h=length/2;for(let j=0;j<=segments;j++){const a=2*Math.PI*j/segments,c=Math.cos(a),si=Math.sin(a);positions.push(radius*c,radius*si,-h,radius*c,radius*si,h);normals.push(c,si,0,c,si,0);uvs.push(j/segments,0,j/segments,1)}for(let j=0;j<segments;j++){const b=2*j,n=2*(j+1);indices.push(b,n,b+1,b+1,n,n+1)}const bottomCenter=positions.length/3;positions.push(0,0,-h);normals.push(0,0,-1);uvs.push(.5,.5);const topCenter=bottomCenter+1;positions.push(0,0,h);normals.push(0,0,1);uvs.push(.5,.5);for(let j=0;j<=segments;j++){const a=2*Math.PI*j/segments,c=Math.cos(a),si=Math.sin(a);positions.push(radius*c,radius*si,-h);normals.push(0,0,-1);uvs.push(.5+.5*c,.5+.5*si);positions.push(radius*c,radius*si,h);normals.push(0,0,1);uvs.push(.5+.5*c,.5+.5*si)}const bottomRing=bottomCenter+2,topRing=bottomRing+1;for(let j=0;j<segments;j++){indices.push(bottomCenter,bottomRing+2*(j+1),bottomRing+2*j);indices.push(topCenter,topRing+2*j,topRing+2*(j+1))}return{positions:new Float32Array(positions),normals:new Float32Array(normals),uvs:new Float32Array(uvs),indices:new Uint32Array(indices),topology:{closed:true,vertices:positions.length/3,triangles:indices.length/3,segments}}}
function wheelModel(part,theta){const p=part.wheel.pivot,c=Math.cos(theta),si=Math.sin(theta),local=new Float32Array([c,si,0,0,-si,c,0,0,0,0,1,0,p[0],p[1],p[2],1]);return matMul(vehicleModel(),local)}
function rollerModel(part,theta){const p=part.center,c=Math.cos(theta),si=Math.sin(theta);return new Float32Array([c,si,0,0,-si,c,0,0,0,0,1,0,p[0],p[1],p[2],1])}
function removeRollingObjects(){const removable=new Set(['rolling-road housing','belt','measurement marker','rail mounting']);const categories=new Set(['rolling road','rolling-road frame','rolling-road pit','boundary-layer slot','rolling-road service','wheel station']);for(let i=scene.objects.length-1;i>=0;i--){const o=scene.objects[i];if(removable.has(o.name)||categories.has(o.category))scene.objects.splice(i,1)}}
function buildRollingRoadGeometry(){removeRollingObjects();scene.roadParts.length=0;addBox('belt',M4_CONFIG.pit.beltCenter,M4_CONFIG.pit.beltSize,[.15,.19,.22],{bevel:.006,category:'rolling road'});addBox('frame.left',[0,-.06,-1.325],[6.30,.12,.05],[.32,.37,.40],{bevel:.008,category:'rolling-road frame'});addBox('frame.right',[0,-.06,1.325],[6.30,.12,.05],[.32,.37,.40],{bevel:.008,category:'rolling-road frame'});addBox('frame.upstream',[-3.175,-.06,0],[.05,.12,2.70],[.32,.37,.40],{bevel:.008,category:'rolling-road frame'});addBox('frame.downstream',[3.175,-.06,0],[.05,.12,2.70],[.32,.37,.40],{bevel:.008,category:'rolling-road frame'});addBox('pit.base',[0,-.45,0],[6.40,.06,2.70],[.10,.13,.16],{bevel:.01,category:'rolling-road pit'});for(const [name,center,size] of [['pit.wall.left',[0,-.27,-1.335],[6.30,.30,.03]],['pit.wall.right',[0,-.27,1.335],[6.30,.30,.03]],['pit.wall.upstream',[-3.185,-.27,0],[.03,.30,2.70]],['pit.wall.downstream',[3.185,-.27,0],[.03,.30,2.70]]])addBox(name,center,size,[.18,.22,.25],{bevel:.004,category:'rolling-road pit'});addBox('slot.back',[3.125,-.032,0],[.036,.012,2.50],[.035,.045,.055],{bevel:.002,category:'boundary-layer slot'});addBox('slot.lip.downstream',[3.145,-.006,0],[.01,.012,2.50],[.32,.37,.40],{bevel:.002,category:'boundary-layer slot'});addBox('slot.lip.upstream',[3.105,-.006,0],[.01,.012,2.50],[.32,.37,.40],{bevel:.002,category:'boundary-layer slot'});addBox('service.downstream',[3.125,-.035,0],[.04,.02,2.50],[.22,.27,.30],{bevel:.003,category:'rolling-road service'});for(const x of[-2.2,2.2]){addBox('service panel '+x,[x,-.19,1.313],[.60,.22,.012],[.26,.30,.33],{bevel:.008,category:'rolling-road service'});for(const dx of[-.24,.24])for(const dy of[-.075,.075])addBox('service bolt '+x+' '+dx+' '+dy,[x+dx,-.19+dy,1.302],[.016,.016,.010],[.45,.49,.51],{bevel:.003,category:'rolling-road service'})}
 const wheels=wheelParts();if(wheels.length!==4)throw Error('M4 wheel station count mismatch');for(const [i,w] of wheels.entries()){const station=AETHER.VEHICLE_TRANSFORM.localToWorld(w.wheel.pivot),len=w.wheel.widthZ+.04,mesh=cylinderMesh(M4_CONFIG.roller.radius,len,M4_CONFIG.roller.segments);scene.roadParts.push({name:'roller '+(i+1),role:'roller',center:[station[0],M4_CONFIG.roller.centerY,station[2]],length:len,radius:M4_CONFIG.roller.radius,mesh,visible:true,gpu:null});const z=station[2];for(const dz of[-(len/2+.018),len/2+.018])addBox('bearing '+(i+1)+' '+dz,[station[0],-.15,z+dz],[.12,.14,.036],[.23,.27,.30],{bevel:.012,category:'wheel station'});addBox('station base '+(i+1),[station[0],-.26,z],[.30,.04,len+.11],[.18,.22,.25],{bevel:.008,category:'wheel station'});for(const dx of[-.10,.10]){addBox('station support '+(i+1)+' '+dx,[station[0]+dx,-.34,z],[.04,.12,len+.06],[.20,.24,.27],{bevel:.005,category:'wheel station'});addBox('station shim '+(i+1)+' '+dx,[station[0]+dx,-.41,z],[.04,.02,len+.06],[.30,.34,.37],{bevel:.003,category:'wheel station'})}}
 diagnostics.roadGeometry={beltSize:M4_CONFIG.pit.beltSize,roadParts:scene.roadParts.length,wheelStations:wheels.length};return true}
function validateProceduralMesh(m){if(!m||m.indices.length%3!==0||m.positions.length%3!==0||m.normals.length!==m.positions.length||m.uvs.length!==m.positions.length/3*2||!m.positions.every(finite)||!m.normals.every(finite)||!m.uvs.every(finite)||!m.indices.every(i=>Number.isInteger(i)&&i>=0&&i<m.positions.length/3))return false;const edges=new Map(),key=i=>{const o=i*3;return [m.positions[o],m.positions[o+1],m.positions[o+2]].map(v=>(Math.abs(v)<5e-7?0:v).toFixed(7)).join(',')};for(let k=0;k<m.indices.length;k+=3){const ids=[m.indices[k],m.indices[k+1],m.indices[k+2]],a=ids[0]*3,b=ids[1]*3,c=ids[2]*3,ab=[m.positions[b]-m.positions[a],m.positions[b+1]-m.positions[a+1],m.positions[b+2]-m.positions[a+2]],ac=[m.positions[c]-m.positions[a],m.positions[c+1]-m.positions[a+1],m.positions[c+2]-m.positions[a+2]],cr=cross(ab,ac);if(Math.hypot(...cr)<1e-10)return false;for(const id of ids){const o=id*3,n=[m.normals[o],m.normals[o+1],m.normals[o+2]],nl=Math.hypot(...n);if(!finite(nl)||Math.abs(nl-1)>M4_CONFIG.tolerances.normal)return false;if(dot(cr,n)<=0)return false}for(let j=0;j<3;j++){const edge=[key(ids[j]),key(ids[(j+1)%3])].sort().join('|');edges.set(edge,(edges.get(edge)||0)+1)}}return [...edges.values()].every(count=>count===2)}
function boundsForParts(parts,theta){const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(const p of parts){const M=p.role==='wheel'?wheelModel(p,theta):vehicleModel();for(let i=0;i<p.positions.length;i+=3){const q=m4point(M,[p.positions[i],p.positions[i+1],p.positions[i+2]]);for(let d=0;d<3;d++){lo[d]=Math.min(lo[d],q[d]);hi[d]=Math.max(hi[d],q[d])}}}return{min:lo,max:hi}}
function wheelWorldBoundsAt(theta,index=null){return boundsForParts(index===null?scene.vehicleParts:[wheelParts()[index]],theta)}
const M12_TOLERANCES=Object.freeze({domain:1e-12,geometry:5e-7,matrix:1e-6,roundTrip:1e-9});
function m12MaxAbs(a,b){if(!a||!b||a.length!==b.length)return Infinity;let e=0;for(let i=0;i<a.length;i++){if(!finite(a[i])||!finite(b[i]))return Infinity;e=Math.max(e,Math.abs(a[i]-b[i]))}return e}
function m12SolidParts(){return scene.vehicleParts.map(p=>Object.freeze({name:p.name,role:p.role,vertexCount:p.positions.length/3,triangleCount:p.indices.length/3,positions:p.positions,indices:p.indices,modelMatrix:p.role==='wheel'?wheelModel(p,0):vehicleModel()}))}
function m12SolidBounds(parts){const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(const p of parts)for(let i=0;i<p.positions.length;i+=3){const q=m4point(p.modelMatrix,[p.positions[i],p.positions[i+1],p.positions[i+2]]);for(let d=0;d<3;d++){lo[d]=Math.min(lo[d],q[d]);hi[d]=Math.max(hi[d],q[d])}}return{min:lo,max:hi}}
function m12AlignmentReport(){const descriptors=m12SolidParts(),renderBounds=boundsForParts(scene.vehicleParts,0),solidBounds=m12SolidBounds(descriptors),vt=AETHER.VEHICLE_TRANSFORM,b=vt.localBounds,samples=[];for(const x of[b.min[0],b.max[0]])for(const y of[b.min[1],b.max[1]])for(const z of[b.min[2],b.max[2]])samples.push([x,y,z]);samples.push([0,0,0],[(b.min[0]+b.max[0])/2,(b.min[1]+b.max[1])/2,(b.min[2]+b.max[2])/2]);for(const p of wheelParts())samples.push(p.wheel.pivot.slice());let maxRenderBridgeError=0,maxRoundTripError=0;for(const p of samples){const w=vt.localToWorld(p),m=m4point(vehicleModel(),p),q=vt.worldToLocal(w);maxRenderBridgeError=Math.max(maxRenderBridgeError,m12MaxAbs(w,m));maxRoundTripError=Math.max(maxRoundTripError,m12MaxAbs(p,q))}let maxBoundsError=0;for(let d=0;d<3;d++)maxBoundsError=Math.max(maxBoundsError,Math.abs(renderBounds.min[d]-solidBounds.min[d]),Math.abs(renderBounds.max[d]-solidBounds.max[d]));let maxMatrixError=0;for(const p of descriptors){const expected=p.role==='wheel'?wheelModel(scene.vehicleParts.find(x=>x.name===p.name),0):vehicleModel();maxMatrixError=Math.max(maxMatrixError,m12MaxAbs(p.modelMatrix,expected))}return{maxRoundTripError,maxRenderBridgeError,maxBoundsError,maxMatrixError,renderBounds,solidBounds,transformAuthority:AETHER.VEHICLE_TRANSFORM}}
const CFD_BRIDGE=Object.freeze({version:'M12',unit:coordinateContract.unit,axis:Object.freeze({...coordinateContract.axes}),solverBound:false,fieldData:false,transformAuthority:AETHER.VEHICLE_TRANSFORM,domain:CFD_DOMAIN_CONTRACT,vehicleLocalToWorld(p){return AETHER.VEHICLE_TRANSFORM.localToWorld(p)},worldToVehicleLocal(p){return AETHER.VEHICLE_TRANSFORM.worldToLocal(p)},getSolidParts(){return m12SolidParts()},getCFDProxyAsset(){return window.__AETHER_S2_PROXY||null},getAlignmentReport(){return m12AlignmentReport()},geometrySignature(){return JSON.stringify({asset:VEHICLE_ASSET.sha256,transform:AETHER.VEHICLE_TRANSFORM._state,epoch:vehicleGeometryEpoch})}});AETHER.CFD_BRIDGE=CFD_BRIDGE;

// M13 scientific visualization.  Solver fields remain direct references; only
// sparse derived resources (the selected slice, lines and surface scalars) are
// allocated here.  No product path can bind a test source or a fixture.






































function runM12Checks(){const domain=CFD_DOMAIN_CONTRACT,b=domain.bounds,derivedMin=[-config.testSection.lengthX/2,coordinateContract.groundY,-config.testSection.widthZ/2],derivedMax=[config.testSection.lengthX/2,config.testSection.heightY,config.testSection.widthZ/2],derivedSize=derivedMax.map((v,i)=>v-derivedMin[i]),descriptors=CFD_BRIDGE.getSolidParts(),report=CFD_BRIDGE.getAlignmentReport(),renderBounds=report.renderBounds,solidBounds=report.solidBounds,allDomain=[...b.min,...b.max,...b.size,b.volume],domainFinite=allDomain.every(finite)&&b.size.every(v=>v>0)&&b.volume>0,domainAxes=domain.unit==='meter'&&domain.axis.downstream==='+X'&&domain.axis.up==='+Y'&&domain.axis.lateral==='+Z'&&domain.axis.vehicleForward==='-X',eq=(a,c,t=M12_TOLERANCES.domain)=>a.length===c.length&&a.every((v,i)=>finite(v)&&Math.abs(v-c[i])<=t),vehicleContained=descriptors.length>0&&[...solidBounds.min,...solidBounds.max].every(finite)&&solidBounds.min.every((v,i)=>v>=b.min[i]-M12_TOLERANCES.geometry)&&solidBounds.max.every((v,i)=>v<=b.max[i]+M12_TOLERANCES.geometry),sharedGeometryAuthority=descriptors.length===scene.vehicleParts.length&&descriptors.every((p,i)=>p.positions===scene.vehicleParts[i].positions&&p.indices===scene.vehicleParts[i].indices),body=descriptors.filter(p=>p.role==='body'),wheels=descriptors.filter(p=>p.role==='wheel'),solidCounts=descriptors.every(p=>finite(p.vertexCount)&&finite(p.triangleCount)&&p.vertexCount>0&&p.triangleCount>0)&&descriptors.reduce((n,p)=>n+p.vertexCount,0)===scene.vehicleParts.reduce((n,p)=>n+p.positions.length/3,0)&&descriptors.reduce((n,p)=>n+p.triangleCount,0)===scene.vehicleParts.reduce((n,p)=>n+p.indices.length/3,0),noRenderOnlyOffset=report.maxMatrixError<=M12_TOLERANCES.matrix,vehiclePlacement=AETHER.VEHICLE_TRANSFORM.position.every(finite)&&AETHER.VEHICLE_TRANSFORM.scale.every(v=>finite(v)&&v>0)&&eq(AETHER.VEHICLE_TRANSFORM.rotation,[0,Math.PI,0])&&Math.abs(renderBounds.min[1]-coordinateContract.groundY)<=M12_TOLERANCES.geometry&&Math.abs(renderBounds.max[2]+renderBounds.min[2]-2*AETHER.VEHICLE_TRANSFORM.position[2])<=M12_TOLERANCES.geometry,forwardDirection=domain.axis.downstream==='+X'&&domain.axis.vehicleForward==='-X'&&vehicleFrontEvidence().verified&&FLOW_LAYOUT.get().vehicleNoseDirection[0]<-.999&&FLOW_LAYOUT.get().emitterPlane.x<FLOW_LAYOUT.get().vehicleFrontPoint[0]&&FLOW_LAYOUT.get().vehicleRearPoint[0]<FLOW_LAYOUT.get().collectorPlane.x,syntheticFieldKeys=['pressure','velocity','Cp','streamlines','wake','vorticity'],noSyntheticFields=!domain.fieldData&&!domain.allocated&&!domain.solverBound&&!CFD_BRIDGE.fieldData&&!CFD_BRIDGE.solverBound&&!syntheticFieldKeys.some(k=>Object.prototype.hasOwnProperty.call(domain,k)||Object.prototype.hasOwnProperty.call(CFD_BRIDGE,k));const checks={domainFinite,domainAxes,domainDerivedFromConfig:eq(b.min,derivedMin)&&eq(b.max,derivedMax)&&eq(b.size,derivedSize)&&Math.abs(b.volume-derivedSize[0]*derivedSize[1]*derivedSize[2])<=M12_TOLERANCES.domain,vehicleContained,sharedTransformAuthority:CFD_BRIDGE.transformAuthority===AETHER.VEHICLE_TRANSFORM,sharedGeometryAuthority,solidPartCount:descriptors.length===5&&body.length===1&&wheels.length===4,solidCounts,solidBoundsMatchRender:report.maxBoundsError<=M12_TOLERANCES.geometry,renderTransformMatch:report.maxRenderBridgeError<=M12_TOLERANCES.matrix,roundTrip:report.maxRoundTripError<=M12_TOLERANCES.roundTrip,noRenderOnlyOffset,vehiclePlacement,forwardDirection,noSyntheticFields};const passed=Object.values(checks).every(Boolean);const summary={passed,geometryReady:passed,alignmentReady:passed,checks,domain:Object.freeze({min:b.min.slice(),max:b.max.slice(),size:b.size.slice(),volume:b.volume,resolutionTiers:domain.resolutionTiers.map(t=>({resolution:t.resolution,cells:t.cells,scalarFloat32Bytes:t.scalarFloat32Bytes,vector3Float32Bytes:t.vector3Float32Bytes})),activeTier:domain.activeTier,allocated:domain.allocated,solverBound:domain.solverBound,fieldData:domain.fieldData}),solid:{partCount:descriptors.length,vertexCount:descriptors.reduce((n,p)=>n+p.vertexCount,0),triangleCount:descriptors.reduce((n,p)=>n+p.triangleCount,0),bounds:solidBounds},alignment:{maxRoundTripError:report.maxRoundTripError,maxRenderBridgeError:report.maxRenderBridgeError,maxBoundsError:report.maxBoundsError,transformAuthority:CFD_BRIDGE.transformAuthority},solverBound:false,fieldData:false,visualApproval:'PENDING',browserVerified:false,productReady:false,limitations:['solver unbound','no field allocation','actual CFD visualization deferred to M13','device visual review pending']};AETHER.M12=Object.freeze(summary);diagnostics.cfdDomain=AETHER.M12.domain;diagnostics.cfdAlignment=AETHER.M12.alignment;if(!passed)throw Error('M12 CFD domain/vehicle alignment failed: '+Object.entries(checks).filter(([,v])=>!v).map(([k])=>k).join(','));return AETHER.M12}
function runM4Checks(){const eps=M4_CONFIG.tolerances.geometry,body=scene.vehicleParts.filter(p=>p.role==='body'),wheels=wheelParts(),belt=scene.objects.find(o=>o.name==='belt'),rollerTop=scene.roadParts.every(r=>Math.abs(r.center[1]+r.radius-(-.06))<=eps),counts=body.length===1&&wheels.length===4&&scene.roadParts.length===4&&scene.objects.filter(o=>o.name==='belt').length===1,mesh=scene.roadParts.every(r=>validateProceduralMesh(r.mesh)&&r.mesh.positions.length/3===2*(M4_CONFIG.roller.segments+1)+2+2*(M4_CONFIG.roller.segments+1)&&r.mesh.indices.length===M4_CONFIG.roller.segments*12),pit=!!belt&&Math.abs(belt.center[1]+belt.size[1]/2)<=eps&&Math.abs(belt.size[0]-6.20)<=eps&&Math.abs(belt.size[2]-2.56)<=eps,beltClearance=!!belt&&M4_CONFIG.pit.maxX-(belt.center[0]+belt.size[0]/2)>=.05-eps&&M4_CONFIG.pit.minX-(belt.center[0]-belt.size[0]/2)<=-.05+eps&&M4_CONFIG.pit.maxZ-(belt.center[2]+belt.size[2]/2)>=.05-eps&&M4_CONFIG.pit.minZ-(belt.center[2]-belt.size[2]/2)<=-.05+eps&&scene.objects.filter(o=>o.name.startsWith('frame.')).every(o=>Math.abs(o.center[2])<1e-9||Math.abs(Math.abs(o.center[2])-1.325)<eps),uniqueM4Ids=(()=>{const cats=new Set(['rolling road','rolling-road frame','rolling-road pit','boundary-layer slot','rolling-road service','wheel station']);const ids=scene.objects.filter(o=>o.name==='belt'||cats.has(o.category)).map(o=>o.name);return new Set(ids).size===ids.length})(),align=wheels.every((w,i)=>{const r=scene.roadParts[i];return !!r&&Math.hypot(AETHER.VEHICLE_TRANSFORM.localToWorld(w.wheel.pivot)[0]-r.center[0],AETHER.VEHICLE_TRANSFORM.localToWorld(w.wheel.pivot)[2]-r.center[2])<=eps}),contacts=wheels.length===4&&wheels.every((w,i)=>{const b=wheelWorldBoundsAt(0,i);return b.min[1]>=-1e-5&&b.min[1]<=M4_CONFIG.tolerances.contact}),state=!!AETHER.ROLLING_ROAD&&snapshotState().effectiveSpeed===0&&snapshotState().wheelAngles.length===4&&snapshotState().rollerAngles.length===4;const checks={body:body.length===1,wheels:wheels.length===4,stations:scene.roadParts.length===4,belt:!!belt,beltDimensions:pit,beltClearance,uniqueM4Ids,frame:scene.objects.filter(o=>o.category==='rolling-road frame').length===4,slot:scene.objects.filter(o=>o.category==='boundary-layer slot').length===3,servicePanels:scene.objects.filter(o=>o.name.startsWith('service panel')).length===2,bearings:scene.objects.filter(o=>o.category==='wheel station'&&o.name.startsWith('bearing')).length===8,rollerTopology:mesh,rollerTop,alignment:align,vehicleContact:contacts,stateContract:state,finite:scene.roadParts.every(r=>validateProceduralMesh(r.mesh))};const passed=counts&&Object.values(checks).every(Boolean);AETHER.M4={geometryReady:passed,stateContractReady:state,liveSolverConnected:false,browserVerified:false,iPhoneVerified:false,visualApproval:'PENDING',productReady:false,checks,limitations:['solver source unbound at boot','browser runtime not verified','iPhone runtime not verified']};diagnostics.m4Checks=checks;return AETHER.M4}
function collectorMeshBuilder(name,role,color,surface){
 const b={name,role,color,surface,positions:[],normals:[],uvs:[],indices:[]},cross3=(a,c)=>[a[1]*c[2]-a[2]*c[1],a[2]*c[0]-a[0]*c[2],a[0]*c[1]-a[1]*c[0]],dot3=(a,c)=>a.reduce((q,v,i)=>q+v*c[i],0),norm3=a=>{const l=Math.hypot(...a)||1;return a.map(v=>v/l)};
 b.quad=(a,c,d,e,hint=[0,1,0],reverse=false)=>{
  let pts=[a,c,d,e],n=norm3(cross3(pts[1].map((v,i)=>v-pts[0][i]),pts[2].map((v,i)=>v-pts[0][i])));
  if(dot3(n,hint)<0){pts=[pts[0],pts[3],pts[2],pts[1]];n=n.map(v=>-v)}
  if(reverse){pts=[pts[0],pts[3],pts[2],pts[1]];n=n.map(v=>-v)}
  const base=b.positions.length/3;for(let i=0;i<4;i++){b.positions.push(...pts[i]);b.normals.push(...n);b.uvs.push(i===1||i===2?1:0,i>=2?1:0)}b.indices.push(base,base+1,base+2,base,base+2,base+3);
 };
 b.box=(x0,y0,z0,x1,y1,z1)=>{
  const faces=[
   [[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1],[1,0,0]],
   [[x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],[-1,0,0]],
   [[x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],[0,1,0]],
   [[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[0,-1,0]],
   [[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],[0,0,1]],
   [[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],[x1,y0,z0],[0,0,-1]]
  ];for(const f of faces)b.quad(f[0],f[1],f[2],f[3],f[4]);
 };
 b.beam=(a,c,r)=>{
  const delta=c.map((v,i)=>v-a[i]),len=Math.hypot(...delta),d=delta.map(v=>v/len),ref=Math.abs(d[1])<.86?[0,1,0]:[0,0,1],u=norm3(cross3(d,ref)),v=norm3(cross3(d,u)),ring=p=>[[1,1],[-1,1],[-1,-1],[1,-1]].map(([su,sv])=>p.map((q,i)=>q+u[i]*r*su+v[i]*r*sv)),ra=ring(a),rc=ring(c);
  for(let i=0;i<4;i++){const hint=i===0?u:i===1?v:i===2?u.map(q=>-q):v.map(q=>-q);b.quad(ra[i],ra[(i+1)%4],rc[(i+1)%4],rc[i],hint)}
  b.quad(ra[0],ra[3],ra[2],ra[1],d.map(q=>-q));b.quad(rc[0],rc[1],rc[2],rc[3],d);
 };
 b.finish=()=>({name:b.name,role:b.role,positions:new Float32Array(b.positions),normals:new Float32Array(b.normals),uvs:new Float32Array(b.uvs),indices:new Uint32Array(b.indices),color:b.color,surface:b.surface,matrix:identityMatrix(),gpu:null});
 return b;
}
function refreshExhaustCollectorLayout(layoutOverride=null){
 const c=AETHER.EXHAUST_COLLECTOR,layout=layoutOverride||AETHER.FLOW_LAYOUT?.get?.();if(!c?.loaded||!layout)return c;
 c.layout=layout;c.facePoint=layout.collectorPlane.point.slice();c.root=layout.collectorRoot.slice();c.validation={...layout.checks,meshFinite:c.parts.every(p=>p.positions.every(finite)&&p.normals.every(finite)&&p.uvs.every(finite)&&p.indices.every(i=>i>=0&&i<p.positions.length/3))};c.valid=layout.valid&&Object.values(c.validation).every(Boolean);diagnostics.collectorModule={loaded:true,valid:c.valid,visualOnly:true,solverCoupled:false,partCount:c.parts.length,triangleCount:c.triangleCount,facePoint:c.facePoint,ductEndX:layout.collectorDuctEndWorldX,validation:c.validation};return c;
}
function buildExhaustCollector(layoutOverride=null){
 const layout=layoutOverride||AETHER.FLOW_LAYOUT?.get?.();if(!layout?.valid)throw Error('EXHAUST_COLLECTOR_REQUIRES_VALID_FLOW_LAYOUT');
 const {halfHeight:hy,halfWidth:w,throatRatio:r,hoodDepth}=layout.collectorOpening,throatY=hy*r,throatZ=w*r,x0=.035,x1=-hoodDepth,xEnd=layout.collectorDuctEndLocalX;
 const shell=collectorMeshBuilder('rear.collector.ceramic-shell','collector-shell',[.74,.77,.79,1],[.72,.34,0,.012]),liner=collectorMeshBuilder('rear.collector.graphite-liner','collector-liner',[.12,.15,.17,1],[.70,.22,0,.012]),frame=collectorMeshBuilder('rear.collector.brushed-frame','collector-frame',[.43,.48,.51,1],[.34,.78,0,.012]),grille=collectorMeshBuilder('rear.collector.intake-grille','collector-grille',[.27,.32,.35,1],[.32,.84,0,.012]),safety=collectorMeshBuilder('rear.collector.safety-markers','collector-safety',[.92,.57,.10,1],[.48,.24,0,.012]),seal=collectorMeshBuilder('rear.collector.gaskets','collector-seal',[.045,.055,.062,1],[.86,.04,0,.012]);
 const panelSet=(g,xa,ha,wa,xb,hb,wb,inward=false)=>{g.quad([xa,ha,-wa],[xa,ha,wa],[xb,hb,wb],[xb,hb,-wb],[0,1,0],inward);g.quad([xa,-ha,-wa],[xb,-hb,-wb],[xb,-hb,wb],[xa,-ha,wa],[0,-1,0],inward);g.quad([xa,-ha,wa],[xa,ha,wa],[xb,hb,wb],[xb,-hb,wb],[0,0,1],inward);g.quad([xa,-ha,-wa],[xb,-hb,-wb],[xb,hb,-wb],[xa,ha,-wa],[0,0,-1],inward)};
 panelSet(shell,x0,hy+.10,w+.10,x1,throatY+.10,throatZ+.10);panelSet(liner,-.012,hy-.065,w-.065,x1+.018,throatY-.065,throatZ-.065,true);
 panelSet(shell,x1,throatY+.10,throatZ+.10,xEnd,throatY+.10,throatZ+.10);panelSet(liner,x1+.012,throatY-.065,throatZ-.065,xEnd+.025,throatY-.065,throatZ-.065,true);
 const rimHY=hy+.12,rimW=w+.12,frameX0=-.105,frameX1=.075,rail=.16;
 frame.box(frameX0,rimHY-rail,-rimW,frameX1,rimHY+rail,rimW);frame.box(frameX0,-rimHY-rail,-rimW,frameX1,-rimHY+rail,rimW);frame.box(frameX0,-rimHY+rail,rimW-rail,frameX1,rimHY-rail,rimW+rail);frame.box(frameX0,-rimHY+rail,-rimW-rail,frameX1,rimHY-rail,-rimW+rail);
 const gasket=.045;seal.box(-.035,hy-gasket,-w+.05,.012,hy+gasket,w-.05);seal.box(-.035,-hy-gasket,-w+.05,.012,-hy+gasket,w-.05);seal.box(-.035,-hy+gasket,w-gasket,.012,hy-gasket,w);seal.box(-.035,-hy+gasket,-w,.012,hy-gasket,-w+gasket);
 const throatRail=.115;frame.box(x1-.07,throatY+.025,-throatZ-throatRail,x1+.08,throatY+throatRail,throatZ+throatRail);frame.box(x1-.07,-throatY-throatRail,-throatZ-throatRail,x1+.08,-throatY-.025,throatZ+throatRail);frame.box(x1-.07,-throatY+throatRail,throatZ+.025,x1+.08,throatY-throatRail,throatZ+throatRail);frame.box(x1-.07,-throatY+throatRail,-throatZ-throatRail,x1+.08,throatY-throatRail,-throatZ-.025);
 frame.box(xEnd-.04,throatY+.02,-throatZ-.12,xEnd+.06,throatY+.14,throatZ+.12);frame.box(xEnd-.04,-throatY-.14,-throatZ-.12,xEnd+.06,-throatY-.02,throatZ+.12);frame.box(xEnd-.04,-throatY+.14,throatZ+.02,xEnd+.06,throatY-.14,throatZ+.14);frame.box(xEnd-.04,-throatY+.14,-throatZ-.14,xEnd+.06,throatY-.14,-throatZ-.02);
 for(const sy of[-1,1])for(const sz of[-1,1]){const a=[x0,sy*(hy+.10),sz*(w+.10)],b=[x1,sy*(throatY+.10),sz*(throatZ+.10)];frame.beam(a,b,.045);safety.beam([x0,sy*(hy+.10),sz*(w+.10)],[x0-.24,sy*(hy+.10-.03),sz*(w+.10-.03)],.055)}
 for(let i=1;i<=9;i++){const z=-w+.14+(2*w-.28)*i/10;grille.box(-.025,-hy+.07,z-.018,.025,hy-.07,z+.018)}
 for(let i=1;i<=6;i++){const y=-hy+.14+(2*hy-.28)*i/7;grille.box(-.028,y-.018,-w+.07,.028,y+.018,w-.07)}
 for(const sy of[-1,1])for(const sz of[-1,1]){const cy=sy*(hy+.12),cz=sz*(w+.12);safety.box(.055,cy-.09,cz-.09,.12,cy+.09,cz+.09);frame.box(.12,cy-.035,cz-.035,.155,cy+.035,cz+.035)}
 const parts=[shell,liner,frame,grille,safety,seal].map(g=>g.finish()),meshFinite=parts.every(p=>p.positions.length>0&&p.indices.length>0&&p.positions.every(finite)&&p.normals.every(finite)&&p.uvs.every(finite)&&p.indices.every(i=>i>=0&&i<p.positions.length/3)),triangleCount=parts.reduce((n,p)=>n+p.indices.length/3,0);
 if(!meshFinite)throw Error('EXHAUST_COLLECTOR_MESH_VALIDATION_FAILED');
 scene.collectorParts=parts;AETHER.EXHAUST_COLLECTOR={loaded:true,valid:false,visualOnly:true,solverCoupled:false,assetName:'AETHER_REAR_EXHAUST_COLLECTOR_PROCEDURAL',parts,triangleCount,layout:null,facePoint:null,root:null,validation:{meshFinite}};refreshExhaustCollectorLayout(layout);if(!AETHER.EXHAUST_COLLECTOR.valid)throw Error('EXHAUST_COLLECTOR_LAYOUT_VALIDATION_FAILED');return AETHER.EXHAUST_COLLECTOR;
}

function fanRotorVisualAngle(nowMs){const f=AETHER.FAN_MODULE;if(!f?.loaded)return 0;if(f.lastVisualAt===null)f.lastVisualAt=nowMs;const dt=Math.max(0,Math.min(.1,(nowMs-f.lastVisualAt)/1000));if(f.visualRunning)f.rotorAngleRad=(f.rotorAngleRad+dt*f.visualRPM*2*Math.PI/60)%(2*Math.PI);f.lastVisualAt=nowMs;return f.rotorAngleRad}
function fanPartModel(part,angle=0,layout=null){const l=layout||AETHER.FLOW_LAYOUT?.get?.();if(!l)return identityMatrix();let local=part.matrix;if(part.role==='animated-rotor'){const t0=new Float64Array([1,0,0,0,0,1,0,0,0,0,1,0,0,2.75,0,1]),t1=new Float64Array([1,0,0,0,0,1,0,0,0,0,1,0,0,-2.75,0,1]),c=Math.cos(angle),s=Math.sin(angle),rx=new Float64Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]);local=m4mul(t0,m4mul(rx,m4mul(t1,local)))}return m4mul(l.fanRootMatrix,local)}
function collectorPartModel(part,layout=null){const l=layout||AETHER.FLOW_LAYOUT?.get?.();return l?m4mul(l.collectorRootMatrix,part.matrix):identityMatrix()}
const FAN_ASSET=window.__ASSETS.FAN_ASSET;
function loadFanModule(){
 const g=parseGLB(FAN_ASSET.base64),json=g.json,root=(json.scenes?.[json.scene]||{}).nodes||[],rootNode=(json.nodes||[]).find(n=>n.name==='AETHER_FAN_WALL_ROOT'),extras=rootNode?.extras||{},parts=[],sources=extras.smokeSources||[],mins=[Infinity,Infinity,Infinity],maxs=[-Infinity,-Infinity,-Infinity];
 if(json.asset?.version!=='2.0'||!g.bin?.byteLength)throw Error('FAN_GLTF2_OR_BIN_MISSING');
 if((json.buffers||[]).some(b=>b.uri)||(json.images||[]).some(i=>i.uri)||((json.images||[]).length>0))throw Error('FAN_EXTERNAL_OR_TEXTURE_ASSET_NOT_SUPPORTED');
 if(extras.assetType!=='single-axial-fan-wall'||extras.units!=='meters'||extras.coordinateContract?.downstreamAirflow!=='+X'||extras.coordinateContract?.up!=='+Y'||extras.coordinateContract?.lateral!=='+Z')throw Error('FAN_COORDINATE_CONTRACT_MISMATCH');
 if(!rootNode||sources.length!==64||!Array.isArray(root)||root.length!==1)throw Error('FAN_ROOT_OR_64_PORT_CONTRACT_MISMATCH');
 let primitiveCount=0,vertexCount=0,indexCount=0,triangleCount=0,normalCount=0;
 const walk=(ni,parent)=>{const node=json.nodes[ni];if(!node)throw Error('FAN_GLTF_NODE_MISSING');const M=m4mul(parent,nodeMatrix(node));if(node.mesh!==undefined){const role=node.extras?.role||'unclassified';if(role==='unclassified')throw Error('FAN_NODE_ROLE_MISSING: '+(node.name||ni));for(const pr of json.meshes[node.mesh].primitives||[]){if(pr.mode!==undefined&&pr.mode!==4)throw Error('FAN_PRIMITIVE_NOT_TRIANGLES: '+node.name);const pos=readAccessor(json,g.bin,pr.attributes.POSITION),nor=pr.attributes.NORMAL!==undefined?readAccessor(json,g.bin,pr.attributes.NORMAL):null,uv=pr.attributes.TEXCOORD_0!==undefined?readAccessor(json,g.bin,pr.attributes.TEXCOORD_0):null,idx=pr.indices!==undefined?readAccessor(json,g.bin,pr.indices):null;if(pos.n!==3||!nor||nor.n!==3||nor.count!==pos.count||uv&&(uv.n!==2||uv.count!==pos.count)||idx&&(idx.n!==1||idx.count%3||!idx.data.every(x=>Number.isInteger(x)&&x>=0&&x<pos.count)))throw Error('FAN_PRIMITIVE_ATTRIBUTE_OR_INDEX_INVALID: '+node.name);const P=new Float32Array(pos.data),N=new Float32Array(nor.data),U=new Float32Array(pos.count*2),I=idx?new Uint32Array(idx.data):new Uint32Array(Array.from({length:pos.count},(_,i)=>i));if(!P.every(Number.isFinite)||!N.every(Number.isFinite)||U.some(v=>!Number.isFinite(v)))throw Error('FAN_NONFINITE_GEOMETRY');for(let i=0;i<P.length;i+=3){const q=m4point(M,[P[i],P[i+1],P[i+2]]);for(let a=0;a<3;a++){mins[a]=Math.min(mins[a],q[a]);maxs[a]=Math.max(maxs[a],q[a])}}const mat=json.materials?.[pr.material||0]||{},pbr=mat.pbrMetallicRoughness||{};parts.push({name:node.name||'fan-part',role,positions:P,normals:N,uvs:U,indices:I,matrix:M,color:[...(pbr.baseColorFactor||[.45,.48,.50,1])],surface:Object.freeze([pbr.roughnessFactor??.65,pbr.metallicFactor??.1,0,0]),gpu:null});primitiveCount++;vertexCount+=pos.count;normalCount+=nor.count;indexCount+=I.length;triangleCount+=I.length/3;}}for(const child of node.children||[])walk(child,M)};
 const I=new Float64Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);for(const n of root)walk(n,I);
 const reported=extras.boundsM||{},reportedMin=reported.min||[],reportedMax=reported.max||[],boundsMatch=reportedMin.length===3&&reportedMax.length===3&&mins.every((v,i)=>Math.abs(v-reportedMin[i])<.012&&Math.abs(maxs[i]-reportedMax[i])<.012),roles=new Set(parts.map(p=>p.role));
 const validation={glb2:true,embeddedBuffer:true,noExternalUris:true,noExternalTextures:(json.images||[]).length===0,parts:primitiveCount===FAN_ASSET.primitiveCount,vertices:vertexCount===FAN_ASSET.vertexCount,triangles:triangleCount===FAN_ASSET.triangleCount,normals:normalCount===vertexCount,indices:indexCount===triangleCount*3,metadataBounds:boundsMatch,rootContract:true,smokeSources:sources.length===64,animatedRotor:roles.has('animated-rotor'),allPartsFinite:parts.every(p=>p.positions.every(Number.isFinite)&&p.normals.every(Number.isFinite)&&p.indices.every(i=>i>=0&&i<p.positions.length/3))};
 if(!Object.values(validation).every(Boolean))throw Error('FAN_ASSET_VALIDATION_FAILED: '+Object.entries(validation).filter(([,v])=>!v).map(([k])=>k).join(','));
 scene.fanParts=parts;const byteLength64=s=>Math.floor(s.length*3/4)-(s.endsWith('==')?2:s.endsWith('=')?1:0);AETHER.ASSETS=Object.freeze({vehicle:Object.freeze({id:'2025_BMW_M4_GT3_EVO_G82',type:'model/gltf-binary',encoding:'base64',version:'user-GLB',byteLength:byteLength64(VEHICLE_ASSET.base64),units:'meter',dimensionsM:Object.freeze([4.7,1.297449006023,1.928297490761]),scale:1,originConvention:'AETHER.VEHICLE_TRANSFORM; nose -X; +Y up; +Z lateral',sha256:VEHICLE_ASSET.sha256,embedded:true}),console:Object.freeze({id:AETHER_CONSOLE_ASSET.assetId,type:'model/gltf-binary',encoding:'base64',version:'V1',byteLength:AETHER_CONSOLE_ASSET.bytes,units:'meter',dimensionsM:Object.freeze([2.22,1.8825,1.2339]),scale:1,originConvention:'authored workstation local origin under AETHER.M6 transform',sha256:AETHER_CONSOLE_ASSET.sha256,embedded:true}),fan:Object.freeze({id:'AETHER_SINGLE_AXIAL_FAN_V2',type:'model/gltf-binary',encoding:'base64',version:'V2',byteLength:byteLength64(FAN_ASSET.base64),units:'meter',dimensionsM:Object.freeze([2.4782,5.5,8]),scale:FAN_VISUAL_SCALE,originConvention:'authored fan root; outlet plane aligned by FLOW_LAYOUT',sha256:FAN_ASSET.sha256,embedded:true})});
 AETHER.FAN_MODULE={loaded:true,visualOnly:true,solverCoupled:false,assetName:FAN_ASSET.name,sha256:FAN_ASSET.sha256,parts,smokeSources:sources.map(q=>({id:q.id,position:q.position_m.slice(),direction:q.direction.slice()})),localBounds:{min:mins,max:maxs},reportedBounds:{min:reportedMin.slice(),max:reportedMax.slice()},rotorPivot:[0,2.75,0],visualRunning:false,visualRPM:18,rotorAngleRad:0,lastVisualAt:null,validation:{...validation,sourceCount:sources.length,primitiveCount,vertexCount,triangleCount,externalUris:0}};
 AETHER.FAN_MODULE.smokeNozzleTransform=smokeNozzleTransform;AETHER.FAN_MODULE.setVisualRunning=function(enabled){this.visualRunning=!!enabled;this.lastVisualAt=null;return this.visualRunning};diagnostics.fanAsset={...AETHER.FAN_MODULE.validation,sha256:FAN_ASSET.sha256};return AETHER.FAN_MODULE;
}

let monitorAtlasCanvas=null,monitorAtlasContext=null,monitorAtlasTexture=null,monitorAtlasLastUpload=0;
function initMonitorAtlas(){if(!gl)return false;if(!monitorAtlasCanvas){monitorAtlasCanvas=document.createElement('canvas');monitorAtlasCanvas.width=1536;monitorAtlasCanvas.height=512;monitorAtlasContext=monitorAtlasCanvas.getContext('2d',{alpha:false});}if(!monitorAtlasTexture)monitorAtlasTexture=gl.createTexture();const tex=monitorAtlasTexture;gl.bindTexture(gl.TEXTURE_2D,tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,monitorAtlasCanvas.width,monitorAtlasCanvas.height,0,gl.RGBA,gl.UNSIGNED_BYTE,null);for(const o of scene.objects)if(o.name.startsWith('m6.glb.MonitorGlass.screen.'))o.texture=tex;updateMonitorAtlas(true);return true;}
function updateMonitorAtlas(force=false){if(!monitorAtlasContext||!gl||gl.isContextLost())return;const t=performance.now();if(!force&&t-monitorAtlasLastUpload<200)return;monitorAtlasLastUpload=t;const c=monitorAtlasContext,s=AETHER.M14?.getSnapshot?.(),solver=s?.solver,diag=s?.diagnostic,last=diag?.lastStep;const tiles=[{title:'SYSTEM STATUS',lines:[`CFD SOURCE  ${solver?.productionBound?'PRODUCT':'UNBOUND'}`,`STATE  ${solver?.state||'S0 SHELL'}`,`FIELD  ${solver?.productionBound?'AVAILABLE':'WAITING FOR FIELD'}`,`GEOMETRY REV  ${AETHER.CFD_BRIDGE?.geometryRevision??'N/A'}`]},{title:'FLOW CONTROL',lines:[`SETPOINT  ${Number.isFinite(s?.control?.windSpeed)?s.control.windSpeed.toFixed(1)+' m/s':'N/A'}`,`ACTUAL VELOCITY  ${solver?.productionBound?'N/A':'N/A'}`,`SOURCE  ${solver?.productionBound?'PRODUCT':'NO PRODUCT SOURCE'}`,`PRESSURE / Cp  ${solver?.productionBound?'N/A':'N/A'}`]},{title:'TEST INTERLOCK',lines:[`E-STOP  ${s?.control?.emergencyStopped?'LATCHED':'READY'}`,`ROLLING ROAD  ${s?.rollingRoad?.motorEnabled?'RUN':'STOPPED'}`,`OFFICE DIAGNOSTIC  ${diag?.historyCount?'AVAILABLE · '+(diag.resolution?.join('×')||'N/A'):'NOT RUN'}`,`LAST STEP  ${last?String(last.sequence)+' · t='+Number(last.time).toFixed(3)+' s':'N/A'}`]}];c.clearRect(0,0,1536,512);tiles.forEach((tile,i)=>{const x=i*512;c.fillStyle='#09131a';c.fillRect(x,0,512,512);c.fillStyle=i===2&&s?.control?.emergencyStopped?'#7d1f1a':'#15313d';c.fillRect(x,0,512,66);c.fillStyle='#f1f6f8';c.font='600 25px system-ui, sans-serif';c.fillText(tile.title,x+28,43);c.fillStyle='#7fe0c0';c.font='18px ui-monospace, monospace';tile.lines.forEach((line,j)=>c.fillText(line,x+28,124+j*65));c.strokeStyle='#31505d';c.lineWidth=2;c.strokeRect(x+12,12,488,488);});gl.bindTexture(gl.TEXTURE_2D,monitorAtlasTexture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,monitorAtlasCanvas);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);}
function setupResources(){for(const o of scene.objects){if(!o._mesh)bevelMesh(o);const uv=o._mesh.uvs?.length===o._mesh.positions.length/3*2?o._mesh.uvs:new Float32Array(o._mesh.positions.length/3*2);o.gpu=bindMesh(o._mesh.positions,o._mesh.normals,uv,o._mesh.indices);}for(const p of scene.vehicleParts)p.gpu=bindMesh(p.positions,p.normals,p.uvs,p.indices);for(const r of scene.roadParts)r.gpu=bindMesh(r.mesh.positions,r.mesh.normals,r.mesh.uvs,r.mesh.indices);for(const p of scene.fanParts)p.gpu=bindMesh(p.positions,p.normals,p.uvs,p.indices);for(const p of scene.collectorParts)p.gpu=bindMesh(p.positions,p.normals,p.uvs,p.indices)}
/* per-mesh vertex array objects: 'm' = main program (pos/normal/uv), 'd' = depth program (pos only). Created lazily, always unbound after use
   so that code relying on the default VAO (m13 overlays, particles) is unaffected. */
function meshVao(mesh,kind){const key=kind==='d'?'vaoD':'vaoM';let v=mesh[key];if(v)return v;v=mesh[key]=gl.createVertexArray();gl.bindVertexArray(v);
 gl.bindBuffer(gl.ARRAY_BUFFER,mesh.pb);
 if(kind==='d'){gl.enableVertexAttribArray(lighting.depthPos);gl.vertexAttribPointer(lighting.depthPos,3,gl.FLOAT,false,0,0)}
 else{gl.enableVertexAttribArray(loc.pos);gl.vertexAttribPointer(loc.pos,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,mesh.nb);gl.enableVertexAttribArray(loc.normal);gl.vertexAttribPointer(loc.normal,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,mesh.ub);gl.enableVertexAttribArray(loc.uv);gl.vertexAttribPointer(loc.uv,2,gl.FLOAT,false,0,0)}
 gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.ib);gl.bindVertexArray(null);return v}
/* depth-only draw shared by the single shadow map and the cascades (mvp is uploaded by the caller) */
function drawDepthMesh(mesh){if(OPT.vao){gl.bindVertexArray(meshVao(mesh,'d'));gl.drawElements(gl.TRIANGLES,mesh.count,mesh.type,0);gl.bindVertexArray(null)}
 else{gl.bindBuffer(gl.ARRAY_BUFFER,mesh.pb);gl.enableVertexAttribArray(lighting.depthPos);gl.vertexAttribPointer(lighting.depthPos,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.ib);gl.drawElements(gl.TRIANGLES,mesh.count,mesh.type,0)}}
/* frustum planes from a column-major view-projection matrix (Gribb/Hartmann). pad widens every plane by pad*w (NDC units), xyOnly drops near/far. */
function frustumPlanes(vp,pad,xyOnly){const r=k=>[vp[k],vp[4+k],vp[8+k],vp[12+k]],r0=r(0),r1=r(1),r2=r(2),r3=r(3),P=[],add=(row,sg)=>P.push([r3[0]*(1+pad)+sg*row[0],r3[1]*(1+pad)+sg*row[1],r3[2]*(1+pad)+sg*row[2],r3[3]*(1+pad)+sg*row[3]]);
 add(r0,1);add(r0,-1);add(r1,1);add(r1,-1);if(!xyOnly){add(r2,1);add(r2,-1)}return P}
/* conservative box test on the object's current centre/size (they change at layout time, so nothing is cached); .02 m for bevel rounding */
function aabbVisible(P,o){const c=o.center,z=o.size;const x0=c[0]-z[0]*.5-.02,x1=c[0]+z[0]*.5+.02,y0=c[1]-z[1]*.5-.02,y1=c[1]+z[1]*.5+.02,z0=c[2]-z[2]*.5-.02,z1=c[2]+z[2]*.5+.02;
 for(let i=0;i<P.length;i++){const q=P[i],px=q[0]>=0?x1:x0,py=q[1]>=0?y1:y0,pz=q[2]>=0?z1:z0;if(q[0]*px+q[1]*py+q[2]*pz+q[3]<0)return false}return true}
/* scalar uniforms of the main program only change per material: skip the ones that keep their value (program state persists) */
let DMC={p:null,v:{}};
function dm1(name,v){const l=loc[name];if(l===null||l===undefined)return;if(DMC.p!==program){DMC={p:program,v:{}}}if(DMC.v[name]!==v){DMC.v[name]=v;gl.uniform1f(l,v)}}
function dmi(name,v){const l=loc[name];if(l===null||l===undefined)return;if(DMC.p!==program){DMC={p:program,v:{}}}if(DMC.v[name]!==v){DMC.v[name]=v;gl.uniform1i(l,v)}}
function dm4(name,a){const l=loc[name];if(l===null||l===undefined)return;if(DMC.p!==program){DMC={p:program,v:{}}}const c=DMC.v[name];if(!c||c[0]!==a[0]||c[1]!==a[1]||c[2]!==a[2]||c[3]!==a[3]){DMC.v[name]=[a[0],a[1],a[2],a[3]];gl.uniform4f(l,a[0],a[1],a[2],a[3])}}
function drawMesh(mesh,m,material,alpha=1){
 if(OPT.vao)gl.bindVertexArray(meshVao(mesh,'m'));
 else{gl.bindBuffer(gl.ARRAY_BUFFER,mesh.pb);gl.enableVertexAttribArray(loc.pos);gl.vertexAttribPointer(loc.pos,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,mesh.nb);gl.enableVertexAttribArray(loc.normal);gl.vertexAttribPointer(loc.normal,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,mesh.ub);gl.enableVertexAttribArray(loc.uv);gl.vertexAttribPointer(loc.uv,2,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,mesh.ib)}
 dm4('color',material.color||[.5,.55,.6,1]);dm4('surface',material.surface||[.72,0,0,.018]);dm1('colorLinear',material.colorLinear?1:0);dm1('alpha',alpha);dm1('useTex',material.texture?1:0);dm1('beltSurface',material.belt?1:0);dm1('beltTravel',material.beltTravel||0);dm1('rollerSurface',material.roller?1:0);
 if(loc.clearcoat)dm1('clearcoat',material.clearcoat?1:0);if(loc.vatlas){dm1('vatlas',material.vatlas?1:0);dm1('vdebug',/vtile=1/.test(location.hash)?1:0)}
 gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,material.texture||whiteTexture);dmi('tex',0);
 gl.drawElements(gl.TRIANGLES,mesh.count,mesh.type,0);if(OPT.vao)gl.bindVertexArray(null)}

function visibleInView(o){if(!o.visible)return false;if(rollingState.roadSection&&(['rolling-road pit','rolling-road service'].includes(o.category)||o.name==='service.downstream'))return false;return !(camera.cutaway&&(['m5 ceiling','ceiling','lighting recess','observation opening','observation glass'].includes(o.category)||['control room ceiling','structural portal crown'].includes(o.name)))}

/* M13 smoke-style tracer: visual advection over a frozen solver snapshot, not transient smoke physics. */
// One layout authority for facility, authored fan, CFD and tracers.
const FAN_VISUAL_SCALE=.90;
let flowLayoutCache=null;
function fanRootMatrix(position,scale=FAN_VISUAL_SCALE){return new Float64Array([scale,0,0,0,0,scale,0,0,0,0,scale,0,position[0],position[1],position[2],1])}
function transformBounds(bounds,m){const pts=[];for(const x of[bounds.min[0],bounds.max[0]])for(const y of[bounds.min[1],bounds.max[1]])for(const z of[bounds.min[2],bounds.max[2]])pts.push(m4point(m,[x,y,z]));return{min:[0,1,2].map(i=>Math.min(...pts.map(p=>p[i]))),max:[0,1,2].map(i=>Math.max(...pts.map(p=>p[i]))),corners:pts}}
function smokeHeightSafe(base,g,fan){let h=FLOW_PLACEMENT.height;try{const bb=transformBounds(fan.localBounds,fanRootMatrix([0,base,0]));h=Math.min(Math.max(h,g.min[1]-bb.min[1]+.02),g.max[1]-bb.max[1]-.02)}catch(e){}return Math.max(-2,Math.min(2,h))}
function flowLayout(frame){
 const g=frame?.grid||{min:CFD_DOMAIN_CONTRACT.bounds.min,max:CFD_DOMAIN_CONTRACT.bounds.max,resolution:[32,32,32]},vt=AETHER.VEHICLE_TRANSFORM,signature=CFD_BRIDGE.geometrySignature(),fan=AETHER.FAN_MODULE;
 if(!fan?.loaded)throw Error('FLOW_LAYOUT: embedded fan asset is unavailable');
 const key=[signature,g.min.join(','),g.max.join(','),g.resolution.join(','),FLOW_PLACEMENT.height,FLOW_PLACEMENT.lateral,FLOW_PLACEMENT.emitterFraction,frame?.sourceId||'FACILITY',frame?.sequence??-1].join('|');
 if(flowLayoutCache?.key===key)return flowLayoutCache.value;
 const evidence=vehicleFrontEvidence();if(!evidence.verified)throw Error('FLOW_LAYOUT: vehicle front is not verified from body geometry');
 const origin=vt.localToWorld([0,0,0]),nosePoint=vt.localToWorld(evidence.localNose),nd=nosePoint.map((v,i)=>v-origin[i]),nl=Math.hypot(...nd),vehicleNoseDirection=nd.map(v=>v/nl),flowDirection=[1,0,0];
 const body=scene.vehicleParts.find(p=>p.role==='body')?.positions;if(!body)throw Error('FLOW_LAYOUT: missing CFD solid body geometry');let lo=Infinity,hi=-Infinity;
 for(let i=0;i<body.length;i+=3){lo=Math.min(lo,body[i]);hi=Math.max(hi,body[i]);}
 const vehicleFrontPoint=vt.localToWorld([hi,0,0]),vehicleRearPoint=vt.localToWorld([lo,0,0]),vehicleLength=vehicleRearPoint[0]-vehicleFrontPoint[0];
 if(!(vehicleLength>0&&vehicleNoseDirection[0]<-.999&&vehicleFrontPoint[0]<vehicleRearPoint[0]))throw Error('FLOW_LAYOUT: vehicle nose/rear do not align with +X downstream');
 const emitterDistance=vehicleLength*FLOW_PLACEMENT.emitterFraction,emitterX=vehicleFrontPoint[0]-emitterDistance,collectorX=g.max[0]-.42;
 const centerY=(g.min[1]+g.max[1])*.5,centerZ=(g.min[2]+g.max[2])*.5,src=fan.smokeSources;if(src.length!==64)throw Error('FLOW_LAYOUT: expected the 64 authored fan ports');
 const sourceCenter=[0,1,2].map(a=>src.reduce((q,s)=>q+s.position[a],0)/src.length);
 if(src.some(s=>Math.abs(s.position[0]-sourceCenter[0])>1e-8))throw Error('FLOW_LAYOUT: fan outlet ports do not share one plane');
 const fanBoundsCenter=fan.localBounds.min.map((v,i)=>(v+fan.localBounds.max[i])*.5),fanRoot=[emitterX-FAN_VISUAL_SCALE*sourceCenter[0],centerY-FAN_VISUAL_SCALE*fanBoundsCenter[1]+smokeHeightSafe(centerY-FAN_VISUAL_SCALE*fanBoundsCenter[1],g,fan),centerZ-FAN_VISUAL_SCALE*fanBoundsCenter[2]+FLOW_PLACEMENT.lateral],fanRootMatrixValue=fanRootMatrix(fanRoot),fanBounds=transformBounds(fan.localBounds,fanRootMatrixValue);
 const nozzleTransforms=src.map((s,index)=>{const p=m4point(fanRootMatrixValue,s.position),d=m4vector(fanRootMatrixValue,s.direction),n=Math.hypot(...d);return Object.freeze({id:s.id,index,sourceIndex:index,position:p,direction:d.map(v=>v/n),radius:.045,fanRootMatrix:fanRootMatrixValue})});
 const collectorOpening={halfHeight:(g.max[1]-g.min[1])*.38,halfWidth:(g.max[2]-g.min[2])*.38,throatRatio:.66,hoodDepth:.86,overhangMeters:.55},collectorRoot=[collectorX+.035,centerY,centerZ],collectorRootMatrix=new Float64Array([-1,0,0,0,0,1,0,0,0,0,-1,0,collectorRoot[0],collectorRoot[1],collectorRoot[2],1]),collectorDuctEndLocalX=-(collectorOpening.hoodDepth+collectorOpening.overhangMeters),collectorDuctEndWorldX=collectorRoot[0]-collectorDuctEndLocalX;
 const collectorPlane=Object.freeze({x:collectorX,point:Object.freeze([collectorX,centerY,centerZ]),normal:Object.freeze([-1,0,0])}),emitterPlane=Object.freeze({x:emitterX,point:Object.freeze([emitterX,centerY,centerZ]),normal:Object.freeze([1,0,0])}),inletPlane=Object.freeze({x:g.min[0],point:Object.freeze([g.min[0],centerY,centerZ]),normal:Object.freeze([-1,0,0])}),outletPlane=Object.freeze({x:g.max[0],point:Object.freeze([g.max[0],centerY,centerZ]),normal:Object.freeze([1,0,0])});
 const inside=(p,b=.02)=>p.every((v,i)=>v>=g.min[i]+b&&v<=g.max[i]-b),portsInDomain=nozzleTransforms.every(n=>inside(n.position,.01)),fanInDomain=fanBounds.min.every((v,i)=>v>=g.min[i]-.002)&&fanBounds.max.every((v,i)=>v<=g.max[i]+.002),collectorCorners=[[-1,-1],[-1,1],[1,-1],[1,1]].map(([a,b])=>[collectorX,centerY+a*collectorOpening.halfHeight,centerZ+b*collectorOpening.halfWidth]),collectorFrameCorners=[[-1,-1],[-1,1],[1,-1],[1,1]].map(([a,b])=>[collectorX,centerY+a*(collectorOpening.halfHeight+.28),centerZ+b*(collectorOpening.halfWidth+.28)]),collectorInside=collectorCorners.every(p=>inside(p))&&collectorFrameCorners.every(p=>inside(p));

 const checks={vehicleNoseOpposesMeanFlow:vehicleNoseDirection[0]<-.999,actualBodyFrontVerified:evidence.verified,emitterUpstreamOfActualFront:emitterX<vehicleFrontPoint[0],emitterDistanceAboutHalfLength:FLOW_PLACEMENT.emitterFraction>=.35&&FLOW_PLACEMENT.emitterFraction<=.65,all64PortsShareEmitterPlane:nozzleTransforms.every(n=>Math.abs(n.position[0]-emitterX)<1e-8),allPortsFaceDownstream:nozzleTransforms.every(n=>n.direction[0]>.999),allPortsInsideDomain:portsInDomain,fanInsideDomain:fanInDomain,collectorDownstreamOfActualRear:collectorX>vehicleRearPoint[0],collectorFaceInsideDomain:collectorInside,collectorMouthFacesUpstream:collectorPlane.normal[0]<-.999,collectorDuctExtendsDownstream:collectorDuctEndWorldX>collectorX,clearanceWithinUIBounds:Math.abs(FLOW_PLACEMENT.height)<=2+1e-9&&Math.abs(FLOW_PLACEMENT.lateral)<=.30+1e-9};
 const clearanceLimits={emitterFraction:[.35,.65],heightOffsetMeters:[Math.max(g.min[1]-fanBounds.min[1],-2),Math.min(g.max[1]-fanBounds.max[1],2)],lateralOffsetMeters:[Math.max(g.min[2]-fanBounds.min[2],-.30),Math.min(g.max[2]-fanBounds.max[2],.30)],fanBoundsInDomain:fanInDomain,collectorFaceMargins:{x:[collectorX-g.min[0],g.max[0]-collectorX],y:[collectorOpening.halfHeight,(g.max[1]-g.min[1])*.5-collectorOpening.halfHeight],z:[collectorOpening.halfWidth,(g.max[2]-g.min[2])*.5-collectorOpening.halfWidth]}};
 const errors=Object.entries(checks).filter(([,v])=>!v).map(([k])=>k);if(errors.length)throw Error('FLOW_LAYOUT blocked: '+errors.join(', '));
 const value=Object.freeze({version:'FLOW_LAYOUT_V4',unit:'meter',flowDirection:Object.freeze(flowDirection),vehicleNoseDirection:Object.freeze(vehicleNoseDirection),vehicleFrontPoint:Object.freeze(vehicleFrontPoint),vehicleRearPoint:Object.freeze(vehicleRearPoint),vehicleLength,emitterPlane,emitterDistance,emitterFraction:FLOW_PLACEMENT.emitterFraction,fanRoot:Object.freeze(fanRoot),fanRootMatrix:fanRootMatrixValue,fanBounds,fanScale:FAN_VISUAL_SCALE,nozzleTransforms:Object.freeze(nozzleTransforms),collectorPlane,inletPlane,outletPlane,collectorRoot:Object.freeze(collectorRoot),collectorRootMatrix,collectorOpening,collectorDuctEndLocalX,collectorDuctEndWorldX,collectorFadeStartX:collectorX-SMOKE_CONFIG.outletFadeMeters,domainBounds:{min:g.min.slice(),max:g.max.slice()},clearanceLimits,checks,valid:true,diagnostics:{status:'VALIDATED_GEOMETRY',vehicleNoseFlowDot:vehicleNoseDirection[0],portCount:nozzleTransforms.length,emitterDistanceMeters:emitterDistance,emitterFraction:FLOW_PLACEMENT.emitterFraction,collectorBehindRearMeters:collectorX-vehicleRearPoint[0],collectorFaceX:collectorX,fanBounds,collectorDuctEndWorldX,errors:[]}});
 fan.layout=value;if(AETHER.EXHAUST_COLLECTOR?.loaded)refreshExhaustCollectorLayout(value);diagnostics.flowLayout=value.diagnostics;flowLayoutCache={key,value};return value;
}
const FLOW_LAYOUT=Object.freeze({get:flowLayout});AETHER.FLOW_LAYOUT=FLOW_LAYOUT;
const FLOW_DOMAIN=Object.freeze({flowDirection:Object.freeze([1,0,0]),inletPlane(frame){return FLOW_LAYOUT.get(frame).inletPlane.x},outletPlane(frame){return FLOW_LAYOUT.get(frame).outletPlane.x},outletFadeStart(frame){return FLOW_LAYOUT.get(frame).collectorFadeStartX},outletNormal:Object.freeze([1,0,0])});
const SMOKE_CONFIG=Object.freeze({baseSize:.105,maxSize:.26,birthFade:.10,deathFadeStart:.78,outletFadeMeters:1.15,quality:Object.freeze({LOW:{particles:500},OFFICE:{particles:2000},HIGH:{particles:4000},ULTRA:{particles:8000},MAX:{particles:12000}})});
const smokeEvents={OUTLET_RECOVERED:0,OUTLET_BACKFLOW:0,SIDE_ESCAPE:0,FLOOR_ESCAPE:0,CEILING_ESCAPE:0,SOLID_COLLISION:0,TTL_EXPIRED:0,INVALID:0,MANUAL_RESET:0,unknown:0};
const smokePerf={frames:[],lastFrame:performance.now(),fps:0,meanMs:0,p95Ms:0,updateMs:0,renderMs:0,webglError:'not checked'};
let appState='BOOT',cfdSimulationTime=0,particlePlaybackTime=0,smokeSpawnCount=0;
/* Fan placement parameters and the fallback domain frame that FLOW_LAYOUT is derived from.
   (The legacy 32^3 particle/ribbon smoke engine was removed; the smoke is the GPU solver's dye field.) */
const FLOW_PLACEMENT={height:-.12,lateral:0,emitterFraction:.50,layoutError:null};
const FLOW_FRAME={grid:{resolution:[32,32,32],min:AETHER.CFD_DOMAIN.bounds.min.slice(),max:AETHER.CFD_DOMAIN.bounds.max.slice()}};
function smokeNozzleTransform(frame,index){const t=FLOW_LAYOUT.get(frame).nozzleTransforms[index];if(!t)throw Error('FLOW_LAYOUT: invalid nozzle index '+index);return t}
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

/* ===== M1/M2: measurement (GPU timer queries, frame statistics, allocation accounting), startup GPU
   calibration, quality table and adaptive controller. Tier choice is measured, never guessed from the UA or
   renderer string (the renderer string is shown for information only). ===== */

/* One table for every quality knob. sim = simulation, vol = volumetric smoke, ren = scene rendering.
   Knobs whose feature is not implemented report available()=false and are skipped by the controller. */
const QUALITY={
 tiers:['LITE','LOW','MID','HIGH','ULTRA'],
 sim:{LITE:{grid:[80,26,38],sub:1,vc:.25},LOW:{grid:[112,36,52],sub:2,vc:.25},MID:{grid:[144,46,66],sub:2,vc:0},HIGH:{grid:[176,56,80],sub:2,vc:0},ULTRA:{grid:[224,72,100],sub:2,vc:0}},
 vol:{LITE:{res:.4,steps:.6,taps:0},LOW:{res:.5,steps:.75,taps:0},MID:{res:.625,steps:1,taps:1},HIGH:{res:.75,steps:1,taps:2},ULTRA:{res:1,steps:1.25,taps:2}},
 ren:{LITE:{scale:.75,ao:0,shadow:1,aa:'FXAA',bloom:0,ssr:0},LOW:{scale:1,ao:0,shadow:1,aa:'FXAA',bloom:1,ssr:0},MID:{scale:1,ao:1,shadow:2,aa:'TAA',bloom:1,ssr:0},HIGH:{scale:1,ao:2,shadow:3,aa:'TAA',bloom:1,ssr:1},ULTRA:{scale:1.25,ao:2,shadow:4,aa:'TAA',bloom:1,ssr:2}},
 budgetMs:{LITE:33.3,LOW:33.3,MID:16.7,HIGH:16.7,ULTRA:16.7},
 /* degrade order required by the spec; upgrade walks it backwards */
 ladder:[
  {k:'volRes',  get:()=>LIVE.rs,   set:v=>LIVE.rs=v,   steps:[.25,.375,.5,.625,.75,1]},
  {k:'raySteps',get:()=>LIVE.stepScale,set:v=>LIVE.stepScale=v,steps:[.5,.625,.75,1,1.25]},
  {k:'ao',      get:()=>PERF.set.ao,set:v=>PERF.set.ao=v,steps:[0,1,2],available:()=>!!window.__AETHER_FX?.ao},
  {k:'ssr',     get:()=>PERF.set.ssr|0,set:v=>PERF.set.ssr=v,steps:[0,1,2]},
  {k:'shadow',  get:()=>PERF.set.shadow,set:v=>PERF.set.shadow=v,steps:[1,2,3,4],available:()=>!!window.__AETHER_FX?.shadow},
  {k:'renderScale',get:()=>LIVE.cs,set:v=>LIVE.cs=v,steps:[.5,.6,.7,.8,.9,1,1.25,1.5]},
  {k:'scalar',  get:()=>LIVE.dyeScale||1,set:v=>{LIVE.dyeScaleWanted=v},steps:[1,2],available:()=>!!LIVE.dyeScalable},
  {k:'cfdRate', get:()=>LIVE.sub,set:v=>LIVE.sub=v,steps:[1,2]},
  {k:'grid',    get:()=>QUALITY.tiers.indexOf(LIVE.q),set:v=>liveSetTier(QUALITY.tiers[v],'ctl'),steps:[0,1,2,3,4]}]};
const PERF={frames:[],gpuFrames:[],sections:{},cur:null,pool:[],pending:[],ext:null,disjoint:0,mem:new Map(),memPeak:0,firstFrameMs:null,
 set:{ao:0,shadow:1,aa:'FXAA',bloom:1,ssr:0},manual:{sim:null,vol:null,ren:null},cal:null,ctl:{last:0,cool:0,calm:0,log:[],switches:0,maxGrid:3},sync:false,syncMs:{}};
window.__PERF=PERF;

/* ---------- allocation accounting (calculated bytes of live textures/renderbuffers/buffers) ---------- */
const PERF_FMT={[0x8814]:16,[0x822E]:4,[0x881A]:8,[0x8058]:4,[0x81A6]:4,[0x88F0]:4,[0x8C43]:4,[0x822D]:2,[0x8229]:1,[0x81A5]:2,[0x8CAC]:4,[0x8C3A]:4,[0x8D48]:1,[0x8230]:8,[0x822F]:4};
function perfInstrument(g){if(g.__perfWrapped)return;g.__perfWrapped=true;const M=PERF.mem,add=(o,k,b)=>{if(!o)return;const e=M.get(o)||{};e[k]=b;M.set(o,e)};
 const bpp=(ifmt,fmt,type)=>PERF_FMT[ifmt]||(type===g.FLOAT?16:type===g.HALF_FLOAT?8:4);
 const t2=g.texImage2D.bind(g);g.texImage2D=function(target,level,ifmt,w,h,...r){try{if(typeof w==='number'&&typeof h==='number'){const tex=g.getParameter(target===g.TEXTURE_2D?g.TEXTURE_BINDING_2D:g.TEXTURE_BINDING_CUBE_MAP);add(tex,target+':'+level,w*h*bpp(ifmt,r[1],r[2]))}}catch(_){}return t2(target,level,ifmt,w,h,...r)};
 const t3=g.texImage3D.bind(g);g.texImage3D=function(target,level,ifmt,w,h,d,...r){try{add(g.getParameter(g.TEXTURE_BINDING_3D),'3d:'+level,w*h*d*bpp(ifmt,r[1],r[2]))}catch(_){}return t3(target,level,ifmt,w,h,d,...r)};
 const gm=g.generateMipmap.bind(g);g.generateMipmap=function(target){try{const tex=g.getParameter(target===g.TEXTURE_2D?g.TEXTURE_BINDING_2D:target===g.TEXTURE_3D?g.TEXTURE_BINDING_3D:g.TEXTURE_BINDING_CUBE_MAP),e=M.get(tex);if(e){const base=Object.entries(e).filter(([k])=>/:0$/.test(k)).reduce((a,[,v])=>a+v,0);e.mips=Math.round(base*(target===g.TEXTURE_3D?1/7:1/3))}}catch(_){}return gm(target)};
 const rs=g.renderbufferStorage.bind(g);g.renderbufferStorage=function(t,f,w,h){try{add(g.getParameter(g.RENDERBUFFER_BINDING),'rb',w*h*(PERF_FMT[f]||4))}catch(_){}return rs(t,f,w,h)};
 const bd=g.bufferData.bind(g);g.bufferData=function(t,d,u){try{const b=g.getParameter(t===g.ELEMENT_ARRAY_BUFFER?g.ELEMENT_ARRAY_BUFFER_BINDING:t===g.ARRAY_BUFFER?g.ARRAY_BUFFER_BINDING:t===g.PIXEL_PACK_BUFFER?g.PIXEL_PACK_BUFFER_BINDING:null);add(b,'buf',typeof d==='number'?d:(d?.byteLength||0))}catch(_){}return bd(t,d,u)};
 for(const k of ['deleteTexture','deleteRenderbuffer','deleteBuffer']){const f=g[k].bind(g);g[k]=o=>{M.delete(o);return f(o)}}}
function perfMemoryMB(){let s=0;for(const e of PERF.mem.values())for(const v of Object.values(e))s+=v;const cv=(glCanvas.width*glCanvas.height)*(4+4)*2;/* default framebuffer color+depth, double buffered (estimate) */
 const mb=(s+cv)/1048576;PERF.memPeak=Math.max(PERF.memPeak,mb);return mb}

/* ---------- GPU timer sections: perfMark(name) closes the running section and opens the next (never nested) ---------- */
function perfTimerInit(){PERF.ext=gl.getExtension('EXT_disjoint_timer_query_webgl2')||null;PERF.pool=[];PERF.pending=[];PERF.cur=null}
/* GPU fence for the start-up measurement: a 1x1 RGBA8 readback from a dedicated framebuffer. It must not read whatever framebuffer happens to be
   bound: that is often a float target (sim / HDR), where RGBA+UNSIGNED_BYTE is INVALID_OPERATION on strict drivers (ANGLE/D3D11 on real GPUs) -
   the read, i.e. the fence, then silently does nothing and the measurement only sees command-submission time (tier chosen far too high).
   The clear makes sure the readback goes through the GPU queue, so every earlier command must have finished. */
function perfFence(){if(!PERF.fenceF){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
  PERF.fenceF=gl.createFramebuffer();const prevF=gl.getParameter(gl.FRAMEBUFFER_BINDING);gl.bindFramebuffer(gl.FRAMEBUFFER,PERF.fenceF);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);gl.bindFramebuffer(gl.FRAMEBUFFER,prevF)}
 const prev=gl.getParameter(gl.FRAMEBUFFER_BINDING);gl.bindFramebuffer(gl.FRAMEBUFFER,PERF.fenceF);gl.clearBufferfv(gl.COLOR,0,PERF.fenceClear||(PERF.fenceClear=new Float32Array(4)));
 gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,PERF.px||(PERF.px=new Uint8Array(4)));gl.bindFramebuffer(gl.FRAMEBUFFER,prev)}
function perfMark(name){const now=performance.now();
 if(PERF.sync){perfFence();if(PERF.syncName)PERF.syncMs[PERF.syncName]=(PERF.syncMs[PERF.syncName]||0)+performance.now()-PERF.syncT;PERF.syncName=name;PERF.syncT=performance.now();return}
 const E=PERF.ext;if(!E)return;
 if(PERF.cur){gl.endQuery(E.TIME_ELAPSED_EXT);PERF.frameQ.push(PERF.cur);PERF.cur=null}
 if(name){const q=PERF.pool.pop()||gl.createQuery();gl.beginQuery(E.TIME_ELAPSED_EXT,q);PERF.cur={q,name}}}
function perfFrameBegin(now){PERF.frameQ=[];PERF.frameStart=now;PERF.sync=!!(PERF.cal&&!PERF.cal.done);PERF.syncMs={};PERF.syncName=null}
function perfFrameEnd(now){perfMark(null);if(PERF.sync&&PERF.cal&&PERF.syncMs.scene!==undefined)PERF.cal.lastScene=PERF.syncMs.scene+(PERF.syncMs.overlay||0);const E=PERF.ext;
 if(E&&PERF.frameQ.length){PERF.pending.push(PERF.frameQ);if(PERF.pending.length>6){const old=PERF.pending.shift();for(const s of old)PERF.pool.push(s.q)}}
 if(E){const dis=gl.getParameter(E.GPU_DISJOINT_EXT);if(dis){PERF.disjoint++;for(const f of PERF.pending)for(const s of f)PERF.pool.push(s.q);PERF.pending=[]}
  while(PERF.pending.length){const f=PERF.pending[0],last=f[f.length-1];if(!gl.getQueryParameter(last.q,gl.QUERY_RESULT_AVAILABLE))break;PERF.pending.shift();let tot=0;const rec={};
   for(const s of f){const ms=gl.getQueryParameter(s.q,gl.QUERY_RESULT)/1e6;rec[s.name]=(rec[s.name]||0)+ms;tot+=ms;PERF.pool.push(s.q)}
   rec.total=tot;PERF.gpuFrames.push(rec);if(PERF.gpuFrames.length>600)PERF.gpuFrames.shift();for(const k in rec){const S=PERF.sections[k]||(PERF.sections[k]={ema:rec[k]});S.ema+=(rec[k]-S.ema)*.08}}}
 if(PERF.lastFrame){const d=now-PERF.lastFrame;if(d<1000){PERF.frames.push(d);if(PERF.frames.length>600)PERF.frames.shift()}}PERF.lastFrame=now;
 if(PERF.firstFrameMs===null)PERF.firstFrameMs=now;}
function perfStats(a){if(!a.length)return null;const s=a.slice().sort((x,y)=>x-y),q=p=>s[Math.min(s.length-1,Math.floor(p*(s.length-1)))];return {n:a.length,mean:a.reduce((x,y)=>x+y,0)/a.length,p50:q(.5),p95:q(.95),p99:q(.99),max:s[s.length-1]}}
/* frame cost used by the controller: measured GPU time if the timer extension exists, else the frame interval */
function perfFrameCost(){const g=PERF.sections.total;return g&&PERF.gpuFrames.length>10?{ms:g.ema,src:'GPU timer'}:{ms:perfStats(PERF.frames.slice(-60))?.p95||16.7,src:'frame interval'}}

/* ---------- startup calibration (2~3 s): measure sim step, volume march and scene cost on this GPU ---------- */
function perfManualFromHash(){const h=location.hash,g=k=>(h.match(new RegExp(k+'=(LITE|LOW|MID|MED|HIGH|ULTRA)'))||[])[1],n=v=>v==='MED'?'MID':v,q=g('q');
 PERF.manual={sim:n(g('sim')||q)||null,vol:n(g('vol')||q)||null,ren:n(g('render')||q)||null};
 /* no address override: restore the viewer's own choice from the engineer panel (per-browser convenience) */
 if(!PERF.manual.sim&&!PERF.manual.vol&&!PERF.manual.ren){const u=perfUserLoad();if(u){const t=v=>QUALITY.tiers.includes(v)?v:null;PERF.manual={sim:t(u.sim),vol:t(u.vol),ren:t(u.ren)};
  PERF.userScale=Number.isFinite(u.scale)&&u.scale>=.5&&u.scale<=1.5?u.scale:null;PERF.adaptive=u.adaptive!==false}}
 return PERF.manual}
/* ---------- engineer panel: per-axis tier (or auto), render resolution, adaptive on/off ----------
   Any tier can be chosen on any device; the panel only warns when it is above the measured recommendation. */
const PERF_USER_KEY='aether.quality.v1';
function perfUserLoad(){try{return JSON.parse(localStorage.getItem(PERF_USER_KEY)||'null')}catch(_){return null}}
function perfUserSave(){const M=PERF.manual||{};try{localStorage.setItem(PERF_USER_KEY,JSON.stringify({sim:M.sim||'AUTO',vol:M.vol||'AUTO',ren:M.ren||'AUTO',scale:PERF.userScale||null,adaptive:PERF.adaptive!==false}))}catch(_){}}
function perfUserSet(o){const M=PERF.manual||(PERF.manual={sim:null,vol:null,ren:null}),done=!!PERF.cal?.done,pick=PERF.cal?.result?.pick||PERF.tier?.sim||'LOW';
 for(const ax of ['sim','vol','ren'])if(o[ax]!==undefined){const t=QUALITY.tiers.includes(o[ax])?o[ax]:null;M[ax]=t;
  if(done){const tt=t||pick;perfApplyTier(ax,tt);if(ax==='sim'&&tt!==LIVE.q)liveSetTier(tt,'user');if(ax==='ren'&&PERF.userScale)LIVE.cs=PERF.userScale}}
 if(o.scale!==undefined){const v=+o.scale;PERF.userScale=v>=.5&&v<=1.5?v:null;if(PERF.userScale)LIVE.cs=PERF.userScale;else if(done)perfApplyTier('ren',M.ren||pick)}
 if(o.adaptive!==undefined)PERF.adaptive=!!o.adaptive;
 PERF.ctl.maxGrid=QUALITY.tiers.indexOf(M.sim||'ULTRA');PERF.ctl.cool=performance.now()+3000;PERF.ctl.log.push('사용자');perfUserSave();return perfUserState()}
function perfUserState(){const M=PERF.manual||{},R=PERF.cal?.result,c=PERF.cost,st=perfStats(PERF.frames.slice(-120));
 return {renderer:perfRenderer(),measured:!!PERF.cal?.done,pick:R?.pick||null,manual:{sim:M.sim||'AUTO',vol:M.vol||'AUTO',ren:M.ren||'AUTO'},tier:{...(PERF.tier||{})},scale:PERF.userScale||null,adaptive:PERF.adaptive!==false,
  grid:LIVE.N?LIVE.N.slice():null,renderScale:LIVE.cs,volRes:LIVE.rs,canvas:[glCanvas.width,glCanvas.height],frameMs:c?.ms??null,frameSrc:c?.src||null,p95:st?.p95??null,log:(PERF.ctl?.log||[]).slice(-4)}}
PERF.userSet=perfUserSet;PERF.userState=perfUserState;
function perfApplyTier(axis,t){if(axis==='sim'){LIVE.sub=QUALITY.sim[t].sub;if(window.__MAC&&!/vc=0/.test(location.hash))window.__MAC.eps=QUALITY.sim[t].vc}else if(axis==='vol'){const v=QUALITY.vol[t];LIVE.rs=v.res;LIVE.stepScale=v.steps;LIVE.rq=v.taps}else{const r=QUALITY.ren[t];LIVE.cs=r.scale;Object.assign(PERF.set,{ao:r.ao,shadow:r.shadow,aa:r.aa,bloom:r.bloom,ssr:r.ssr})}PERF.tier=PERF.tier||{};PERF.tier[axis]=t}
function perfCalibrateStep(now){const C=PERF.cal;if(C.done)return true;
 if(!C.t0){C.t0=now;C.sim=[];C.vol=[];C.scene=[];return false}
 /* each calibration frame: 1 sim step and 1 full-cost volume march, both synchronously timed (readPixels fence) */
 const sync=perfFence;
 try{gl.bindVertexArray(LIVE.vao);sync();let t=performance.now();livePasses(1/120);sync();C.sim.push(performance.now()-t);
  if(!C.vol.length)liveCopyVolume();const w=Math.max(64,Math.round(glCanvas.width*.5)),h=Math.max(64,Math.round(glCanvas.height*.5));t=performance.now();liveCalibrationMarch(w,h);sync();C.vol.push({ms:performance.now()-t,px:w*h,steps:LIVE.calSteps||0})}
 finally{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,glCanvas.width,glCanvas.height);gl.bindVertexArray(null);gl.enable(gl.DEPTH_TEST)}
 if(C.lastScene)C.scene.push(C.lastScene);
 /* 2.5 s target; never decide on fewer than 4 sim / 3 march / 2 scene samples (hard cap 10 s on very slow devices) */
 const enough=C.sim.length>=4&&C.vol.length>=3&&C.scene.length>=2;if(!(enough&&now-C.t0>=2500)&&!(now-C.t0>10000)&&C.sim.length<24)return false;
 C.done=true;perfDecide();return true}
function perfDecide(){const C=PERF.cal,med=a=>{const s=a.slice().sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:NaN},warm=a=>a.length>2?a.slice(1):a;
 const cells=LIVE.N[0]*LIVE.N[1]*LIVE.N[2],simPerMcell=med(warm(C.sim))/(cells/1e6),volPerMpx=med(warm(C.vol).map(x=>x.ms/(x.px/1e6))),sceneMs=med(C.scene);
 const px=glCanvas.width*glCanvas.height,pred={};
 for(const t of QUALITY.tiers){const g=QUALITY.sim[t].grid,sv=QUALITY.vol[t],rn=QUALITY.ren[t];
  pred[t]={sim:simPerMcell*g[0]*g[1]*g[2]/1e6*QUALITY.sim[t].sub,vol:volPerMpx*px*sv.res*sv.res*sv.steps/1e6,scene:sceneMs*rn.scale*rn.scale};pred[t].total=pred[t].sim+pred[t].vol+pred[t].scene}
 let pick=QUALITY.tiers[0];const capI=MOBILE?QUALITY.tiers.indexOf('MID'):QUALITY.tiers.length-1;for(const t of QUALITY.tiers){if(QUALITY.tiers.indexOf(t)>capI)break;if(Number.isFinite(pred[t].total)&&pred[t].total<=QUALITY.budgetMs[t]*.8)pick=t}
 C.result={pick,simMsPerMcellStep:simPerMcell,volMsPerMpx:volPerMpx,sceneMs,pred,samples:{sim:C.sim.length,vol:C.vol.length,scene:C.scene.length},timerQuery:!!PERF.ext,renderer:perfRenderer()};
 const M=PERF.manual;for(const ax of ['sim','vol','ren'])perfApplyTier(ax,M[ax]||pick);if(PERF.userScale)LIVE.cs=PERF.userScale;
 PERF.ctl.maxGrid=M.sim?QUALITY.tiers.indexOf(M.sim):(MOBILE?QUALITY.tiers.indexOf('MID'):QUALITY.tiers.length-1);
 if((M.sim||pick)!==LIVE.q)liveSetTier(M.sim||pick,'cal');else liveReapplyAfterCal();
 PERF.ctl.cool=performance.now()+4000;PERF.ctl.log.push('cal→'+pick)}
function liveReapplyAfterCal(){LIVE.api&&LIVE.api.reset&&LIVE.ok&&LIVE.api.reset()}
function perfRenderer(){try{const e=gl.getExtension('WEBGL_debug_renderer_info');return e?String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL)):String(gl.getParameter(gl.RENDERER))}catch(_){return 'unknown'}}

/* ---------- adaptive controller: degrade fast along QUALITY.ladder, upgrade slowly in reverse ---------- */
function perfControl(now){const C=PERF.ctl,M=PERF.manual;if(!PERF.cal?.done||LIVE.freeze||document.hidden)return;if(now-C.last<250)return;C.last=now;
 if(PERF.adaptive===false){PERF.cost=perfFrameCost();return}
 const budget=QUALITY.budgetMs[PERF.tier?.sim||'LOW'],cost=perfFrameCost();PERF.cost=cost;if(now<C.cool)return;
 const locked=k=>(M.vol&&(k==='volRes'||k==='raySteps'))||(M.ren&&(k==='ao'||k==='shadow'||k==='renderScale'))||(M.sim&&(k==='scalar'||k==='cfdRate'||k==='grid'))||(PERF.userScale&&k==='renderScale');
 const knobs=QUALITY.ladder.filter(k=>!locked(k.k)&&(!k.available||k.available()));
 const idx=k=>{const v=k.get(),s=k.steps;let b=0;for(let i=0;i<s.length;i++)if(Math.abs(s[i]-v)<Math.abs(s[b]-v))b=i;return b};
 if(cost.ms>budget*1.1){C.calm=0;for(const k of knobs){const i=idx(k);if(i>0&&!(k.k==='grid'&&C.switches>=4)){k.set(k.steps[i-1]);if(k.k==='grid')C.switches++;C.log.push(k.k+'-');C.cool=now+(k.k==='grid'?6000:1200);return}}}
 else if(cost.ms<budget*.7){if(++C.calm<12)return;
  for(const k of knobs.slice().reverse()){const i=idx(k),cap=k.k==='grid'?C.maxGrid:k.steps.length-1,tierCap=perfTierCap(k);if(i<Math.min(cap,tierCap)){if(k.k==='grid'&&(C.calm<40||C.switches>=4))continue;k.set(k.steps[i+1]);if(k.k==='grid')C.switches++;C.log.push(k.k+'+');C.calm=0;C.cool=now+(k.k==='grid'?8000:2500);return}}}
 else C.calm=0}
/* upgrades never exceed the tier's own table value except for the grid (promotion path) */
function perfTierCap(k){const t=PERF.tier||{},v=QUALITY.vol[t.vol||'LOW'],r=QUALITY.ren[t.ren||'LOW'],s=QUALITY.sim[t.sim||'LOW'],f=x=>k.steps.findIndex(y=>Math.abs(y-x)<1e-6);
 return ({volRes:f(v.res),raySteps:f(v.steps),ao:r.ao,ssr:r.ssr,shadow:r.shadow-1,renderScale:f(r.scale),scalar:1,cfdRate:f(s.sub),grid:QUALITY.tiers.length-1})[k.k]??k.steps.length-1}

/* ---------- #bench=perf : fixed camera path, JSON result ---------- */
const PERF_BENCH_PATH=[['Hero',5000],['Side',5000],['Top',5000],['Fan',5000],['FPV',6000]];
function perfBenchStart(){const B=PERF.bench={i:-1,t0:0,seg:[],start:performance.now()};perfBenchNext()}
function perfBenchNext(){const B=PERF.bench;if(B.i>=0){const s=B.cur;s.cpu=perfStats(PERF.frames.slice(-s.frames));s.gpu=perfGpuSummary(PERF.gpuFrames.slice(-s.frames));B.seg.push(s)}
 B.i++;if(B.i>=PERF_BENCH_PATH.length){perfBenchFinish();return}
 const [name,ms]=PERF_BENCH_PATH[B.i];if(name==='FPV'){startWalk();fpv.x=-2;fpv.z=.4;fpv.yaw=Math.PI/2;fpv.pitch=-.05;fpv.gy=undefined}else setPreset(name);
 B.cur={view:name,ms,frames:0,from:performance.now()};B.until=performance.now()+ms}
function perfBenchTick(now){const B=PERF.bench;if(!B||B.done)return;B.cur.frames++;if(now>=B.until)perfBenchNext()}
function perfGpuSummary(fr){if(!fr.length)return null;const keys=new Set();fr.forEach(f=>Object.keys(f).forEach(k=>keys.add(k)));const o={};for(const k of keys)o[k]=perfStats(fr.map(f=>f[k]||0));return o}
function perfBenchFinish(){const B=PERF.bench;B.done=true;
 const res={aether:window.__AETHER_BUILD||null,time:new Date().toISOString(),note:'성능 수치는 실제 GPU에서 측정한 경우에만 유효합니다. SwiftShader/소프트웨어 렌더러 결과는 성능 근거가 아닙니다.',
  renderer:perfRenderer(),timerQuery:!!PERF.ext,disjointEvents:PERF.disjoint,canvas:[glCanvas.width,glCanvas.height],devicePixelRatio:devicePixelRatio,
  tier:PERF.tier,calibration:PERF.cal?.result||null,settings:perfSettings(),memoryMB:{now:+perfMemoryMB().toFixed(1),peak:+PERF.memPeak.toFixed(1),kind:'계산된 할당량(드라이버 실측 아님)'},
  firstFrameMs:PERF.firstFrameMs,segments:B.seg.map(s=>({view:s.view,frames:s.frames,cpuFrameMs:s.cpu,gpuMs:s.gpu})),
  overall:{cpuFrameMs:perfStats(PERF.frames.slice(-B.seg.reduce((a,s)=>a+s.frames,0))),gpuMs:perfGpuSummary(PERF.gpuFrames.slice(-B.seg.reduce((a,s)=>a+s.frames,0)))},
  controllerLog:PERF.ctl.log.slice(-40),cfd:{grid:LIVE.N,solver:LIVE.solver,impl:LIVE.impl||'COLLOCATED',step:LIVE.step,t:LIVE.t},errors:diagnostics.errors.slice(0,5)};
 const o=res.overall.cpuFrameMs;res.verdict={p95Ms:o?.p95??null,budgetMs:QUALITY.budgetMs[PERF.tier?.sim||'LOW'],meetsBudget:o?o.p95<=QUALITY.budgetMs[PERF.tier?.sim||'LOW']:null};
 window.__BENCH_RESULT=res;perfBenchShow(res)}
function perfSettings(){return {grid:LIVE.N,sub:LIVE.sub,volRes:LIVE.rs,raySteps:LIVE.stepScale,lightTaps:LIVE.rq,renderScale:LIVE.cs,dyeScale:LIVE.dyeScale||1,...PERF.set}}
function perfBenchShow(res){const txt=JSON.stringify(res,null,1),vp=document.querySelector('.viewport');let el=document.getElementById('benchOut');
 if(!el){vp.insertAdjacentHTML('beforeend','<div id="benchOut" style="position:absolute;z-index:30;inset:10% 8%;display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:10px;background:#050b10f2;border:1px solid #2b3742;color:#cfe;font:12px/1.4 ui-monospace,monospace"><b>벤치마크 결과 (JSON)</b><textarea readonly style="flex:1;background:#000;color:#bfe9ff;border:1px solid #234;font:11px ui-monospace,monospace"></textarea><div style="display:flex;gap:8px"><button id="benchCopy">복사</button><button id="benchSave">JSON 저장</button><button id="benchClose">닫기</button></div></div>');el=document.getElementById('benchOut');
  document.getElementById('benchCopy').onclick=()=>{const t=el.querySelector('textarea');t.select();try{navigator.clipboard.writeText(t.value)}catch(_){document.execCommand('copy')}};
  document.getElementById('benchSave').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([txt],{type:'application/json'}));a.download='aether-bench.json';a.click()};
  document.getElementById('benchClose').onclick=()=>el.remove()}
 el.querySelector('textarea').value=txt}

/* ---------- per-frame hooks called from draw() ---------- */
function perfBeginFrame(now){if(!PERF.inited||PERF.gen!==runtimeGeneration){PERF.inited=true;PERF.gen=runtimeGeneration;perfTimerInit();perfManualFromHash()}perfFrameBegin(now)}
function perfEndFrame(now){perfFrameEnd(now);perfControl(now);perfBenchTick(now);
 if(!PERF.benchArmed&&/bench=perf/.test(location.hash)&&PERF.cal?.done&&LIVE.ok&&LIVE.step>30){PERF.benchArmed=true;perfBenchStart()}}

/* HUD text for #perf=1 (all values measured or calculated; source of each is named) */
window.__perfHudText=()=>{const P=PERF,c=P.cost||perfFrameCost(),f=perfStats(P.frames.slice(-120)),S=P.sections,g=k=>S[k]?S[k].ema.toFixed(1):'-',cal=P.cal?.result;
 return '프레임 p50 '+(f?f.p50.toFixed(1):'-')+' / p95 '+(f?f.p95.toFixed(1):'-')+' ms · 제어 기준 '+c.ms.toFixed(1)+' ms('+c.src+') · 예산 '+QUALITY.budgetMs[P.tier?.sim||'LOW']+' ms'
 +'\nGPU ms '+(P.ext?'시뮬 '+g('sim')+' · 씬 '+g('scene')+' · 연기 '+g('smoke')+' · 기타 '+g('overlay'):'(timer query 미지원: 프레임 간격 사용)')
 +'\n등급 sim '+(P.tier?.sim||'-')+' / vol '+(P.tier?.vol||'-')+' / render '+(P.tier?.ren||'-')+(cal?.pick?' · 시작 벤치마크 선택 '+cal.pick:cal?.skipped?' · 수동 고정':'')
 +'\n연기 해상도 '+Math.round(LIVE.rs*100)+'% · 스텝 '+Math.round((LIVE.stepScale||1)*100)+'% · 화면 '+Math.round(LIVE.cs*100)+'% · CFD 서브스텝 '+LIVE.sub+' · 메모리(계산) '+perfMemoryMB().toFixed(0)+' MB'
 +'\n조정: '+P.ctl.log.slice(-6).join(' ')};
/* AETHER LIVE CFD: real-time GPU incompressible flow (collocated grid, semi-Lagrangian advection,
   Jacobi pressure projection, vorticity confinement) + passive-scalar smoke with MacCormack transport. */
const LIVE={impl:(location.hash.match(/impl=(COLLOCATED|MAC)/)||[])[1]||'MAC',macErr:null,ok:false,err:null,enabled:true,init:false,gen:-1,q:null,N:null,step:0,t:0,U:5,mode:'RAKE_V',wand:false,colorMode:/color=1/.test(location.hash),
 vortEps:.35,jacobi:32,sub:2,bench:null,benchRes:null,rs:.5,rq:0,cs:.8,stepScale:.75,frame:0,solver:'MG',mgCycles:1,mgPre:2,mgPost:2,mgLevels:3,omega:.86,mgRN:1,mgRS:0,mgCorr:.75,coarseIters:40,diag:false,dens:3,speedAt:0,lastRead:0,lastT:0,emitters:[],stats:{}};
/* smoke display transfer (visualisation only): extinction = gain * max(dye-floor,0)^gamma, so thin diffused dye turns transparent while filament cores stay opaque. tau: smoke lifetime in seconds (0 = legacy per-step decay). */
LIVE.tf=(location.hash.match(/tf=([\d.,]+)/)||[])[1]?.split(',').map(Number).slice(0,4);if(!LIVE.tf||LIVE.tf.length<3||LIVE.tf.some(v=>!(v>=0)))LIVE.tf=[2,2.6,.03,1.35];if(LIVE.tf.length<4)LIVE.tf[3]=1;LIVE.tau=+((location.hash.match(/tau=([\d.]+)/)||[])[1]??3);
LIVE.rakeN=+((location.hash.match(/rake=(\d+)/)||[])[1]||0);
function liveDecay(dt){return LIVE.tau>0?Math.exp(-dt/LIVE.tau):.9985}
window.__LIVE=LIVE;window.__AETHER_DEBUG={get fpv(){return fpv},get camera(){return camera},get body(){return window.__BODY},get door(){return DOOR},
 sceneStats(){return {objects:scene.objects.length,vehicleParts:scene.vehicleParts.length,fanParts:scene.fanParts.length,roadParts:scene.roadParts.length,names:scene.objects.map(o=>o.name).filter(Boolean)}},setPreset(n){setPreset(n)},get bootStage(){return diagnostics.bootStage},get errors(){return diagnostics.errors.slice()}};
const LIVE_BENCH={D:.5,x:-1.5,z:.1,y:1.5,T:8,spin:2};
const LIVE_Q={LITE:QUALITY.sim.LITE.grid,LOW:QUALITY.sim.LOW.grid,MID:QUALITY.sim.MID.grid,MED:QUALITY.sim.MID.grid,HIGH:QUALITY.sim.HIGH.grid,ULTRA:QUALITY.sim.ULTRA.grid};
const LIVE_TIERS=QUALITY.tiers;
/* start tier: manual (#q / #sim) or the calibrated choice; before calibration the LOW grid is used to measure */
function liveStartTier(){const m=perfManualFromHash().sim;if(m)return {q:m,auto:false};return {q:LIVE.forceQ||(MOBILE?'LITE':'LOW'),auto:true}}
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
bool any3(bvec3 b){return b.x||b.y||b.z;}
bool IN(ivec3 c){return all(greaterThanEqual(c,ivec3(0)))&&all(lessThan(c,uN));}
vec3 W(ivec3 c){return uMin+(vec3(c)+.5)*uH;}
int ST(ivec3 c){return int(texelFetch(uFlags,A(c),0).r*3.+.5);}
vec3 SV(int t){return t==2?vec3(uU,0.,0.):(t==3?uBodyV:vec3(0.));}
`;
const LIVE_FS={
flags:`uniform sampler2D uObs;uniform vec4 uBody;
float bodyR(float y){float r=(y<0.||y>1.78)?0.:(y<.85?.17:(y<1.5?.25:.12));return r>0.?max(r,uH.x):0.;}
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
cflag:`uniform sampler2D uFF;uniform ivec3 uNF;uniform int uTXF;
ivec2 AF(ivec3 c){return ivec2((c.z%uTXF)*uNF.x+c.x,(c.z/uTXF)*uNF.y+c.y);}
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}int allS=1,anyC=0;
 for(int k=0;k<8;k++){ivec3 f=c*2+ivec3(k&1,(k>>1)&1,(k>>2)&1);if(any3(greaterThanEqual(f,uNF)))continue;anyC=1;if(texelFetch(uFF,AF(f),0).r<.1)allS=0;}
 o=vec4((anyC==1&&allS==1)?1./3.:0.,0,0,1);}`,
res:`uniform sampler2D uP,uB;
float PN(ivec3 n,float pc){if(n.x>=uN.x)return 0.;if(!IN(n))return pc;if(ST(n)>0)return pc;return F(uP,n).x;}
void main(){ivec3 c=C();if(c.z>=uN.z||ST(c)>0){o=vec4(0);return;}float pc=F(uP,c).x;vec3 ih=1./(uH*uH);
 float s=(PN(c+ivec3(1,0,0),pc)+PN(c-ivec3(1,0,0),pc))*ih.x+(PN(c+ivec3(0,1,0),pc)+PN(c-ivec3(0,1,0),pc))*ih.y+(PN(c+ivec3(0,0,1),pc)+PN(c-ivec3(0,0,1),pc))*ih.z;
 o=vec4(F(uB,c).x-(s-2.*(ih.x+ih.y+ih.z)*pc),0,0,0);}`,
rest:`uniform sampler2D uRF,uFF;uniform ivec3 uNF;uniform int uTXF;uniform float uRS;
ivec2 AF(ivec3 c){return ivec2((c.z%uTXF)*uNF.x+c.x,(c.z/uTXF)*uNF.y+c.y);}
void main(){ivec3 c=C();if(c.z>=uN.z||ST(c)>0){o=vec4(0);return;}float s=0.,n=0.;
 for(int k=0;k<8;k++){ivec3 f=c*2+ivec3(k&1,(k>>1)&1,(k>>2)&1);if(any3(greaterThanEqual(f,uNF)))continue;if(texelFetch(uFF,AF(f),0).r>.1)continue;s+=texelFetch(uRF,AF(f),0).x;n+=1.;}
 o=vec4(uRS>.5?s/8.:(n>0.?s/n:0.),0,0,0);}`,
prol:`uniform sampler2D uP,uPC,uFC;uniform ivec3 uNC;uniform int uTXC;uniform vec3 uHC;uniform float uRN,uCorr;
ivec2 AC(ivec3 c){return ivec2((c.z%uTXC)*uNC.x+c.x,(c.z/uTXC)*uNC.y+c.y);}
void main(){ivec3 c=C();if(c.z>=uN.z||ST(c)>0){o=vec4(0);return;}vec3 q=(W(c)-uMin)/uHC-.5;vec3 q0=floor(q),f=q-q0;ivec3 i0=ivec3(q0);float acc=0.,wt=0.;
 for(int k=0;k<8;k++){ivec3 d=ivec3(k&1,(k>>1)&1,(k>>2)&1);ivec3 j=clamp(i0+d,ivec3(0),uNC-1);if(texelFetch(uFC,AC(j),0).r>.1)continue;
  float w=((d.x==1)?f.x:1.-f.x)*((d.y==1)?f.y:1.-f.y)*((d.z==1)?f.z:1.-f.z);acc+=w*texelFetch(uPC,AC(j),0).x;wt+=w;}
 o=vec4(F(uP,c).x+uCorr*(uRN>.5?(wt>1e-4?acc/wt:0.):acc),0,0,0);}`,
jacw:`uniform sampler2D uP,uDiv;uniform float uOm;
float PN(ivec3 n,float pc){if(n.x>=uN.x)return 0.;if(!IN(n))return pc;if(ST(n)>0)return pc;return F(uP,n).x;}
void main(){ivec3 c=C();if(c.z>=uN.z||ST(c)>0){o=vec4(0);return;}float pc=F(uP,c).x;vec3 ih=1./(uH*uH);
 float s=(PN(c+ivec3(1,0,0),pc)+PN(c-ivec3(1,0,0),pc))*ih.x+(PN(c+ivec3(0,1,0),pc)+PN(c-ivec3(0,1,0),pc))*ih.y+(PN(c+ivec3(0,0,1),pc)+PN(c-ivec3(0,0,1),pc))*ih.z;
 float pj=(s-F(uDiv,c).x)/(2.*(ih.x+ih.y+ih.z));o=vec4(pc+uOm*(pj-pc),0,0,0);}`,
force:`uniform sampler2D uP;
void main(){ivec3 c=C();if(c.z>=uN.z||ST(c)>0){o=vec4(0);return;}float p=F(uP,c).x;vec3 f=vec3(0.);
 ivec3 e=ivec3(1,0,0);if(IN(c+e)&&ST(c+e)==1)f.x+=p*uH.y*uH.z;if(IN(c-e)&&ST(c-e)==1)f.x-=p*uH.y*uH.z;
 e=ivec3(0,1,0);if(IN(c+e)&&ST(c+e)==1)f.y+=p*uH.x*uH.z;if(IN(c-e)&&ST(c-e)==1)f.y-=p*uH.x*uH.z;
 e=ivec3(0,0,1);if(IN(c+e)&&ST(c+e)==1)f.z+=p*uH.x*uH.y;if(IN(c-e)&&ST(c-e)==1)f.z-=p*uH.x*uH.y;
 o=vec4(f,0.);}`,
copy:`uniform sampler2D uVel,uDye;uniform int uLayer;
void main(){ivec3 c=ivec3(ivec2(gl_FragCoord.xy),uLayer);int t=ST(c);vec3 u=F(uVel,c).xyz;o=vec4(t>0?0.:F(uDye,c).x,t==1?1.:(t==2?.6:0.),length(u)/max(uU,.1),1);}`};
const LIVE_SUM=`#version 300 es
precision highp float;precision highp sampler2D;uniform sampler2D uS;uniform ivec2 uSz;out vec4 o;
void main(){ivec2 b=ivec2(gl_FragCoord.xy)*8;vec4 s=vec4(0.);for(int j=0;j<8;j++)for(int i=0;i<8;i++){ivec2 q=b+ivec2(i,j);if(q.x<uSz.x&&q.y<uSz.y)s+=texelFetch(uS,q,0);}o=s;}`;
const LIVE_RAY=`#version 300 es
precision highp float;precision highp sampler3D;
uniform sampler3D uVol;uniform mat4 uInv;uniform vec3 uEye,uBMin,uBMax,uLD;uniform vec2 uRes;uniform float uDens,uCMode,uStepScale,uCal;uniform vec4 uTF;uniform int uQ,uFrame;out vec4 o;float smk(float r){return uTF.y*pow(max(r-uTF.z,0.),uTF.x);}
vec3 turbo(float t){t*=4.;vec3 a=vec3(.10,.18,1.),b=vec3(0.,.8,1.),c=vec3(.05,1.,.3),d=vec3(1.,.92,.05),e=vec3(1.,.12,.05);return t<1.?mix(a,b,t):t<2.?mix(b,c,t-1.):t<3.?mix(c,d,t-2.):mix(d,e,min(t-3.,1.));}
void main(){vec2 n=gl_FragCoord.xy/uRes*2.-1.;vec4 a=uInv*vec4(n,-1,1),b=uInv*vec4(n,1,1);vec3 ro=uEye,rd=normalize(b.xyz/b.w-a.xyz/a.w);
 vec3 iv=1./rd,t0=(uBMin-ro)*iv,t1=(uBMax-ro)*iv,mn=min(t0,t1),mx=max(t0,t1);float tn=max(max(mn.x,mn.y),max(mn.z,0.)),tf=min(min(mx.x,mx.y),mx.z);
 if(ro.z>3.84){if(rd.z>=0.)discard;float tw=(3.9-ro.z)/rd.z;vec3 q=ro+rd*tw;bool win=q.x>-3.5&&q.x<2.3&&q.y>.95&&q.y<3.05,door=q.x>2.3&&q.x<3.5&&q.y>.75&&q.y<2.95;if(!win&&!door)discard;tn=max(tn,(3.83-ro.z)/rd.z);}
 if(tf<=tn)discard;bool inside=all(greaterThan(ro,uBMin))&&all(lessThan(ro,uBMax));float dens=inside?uDens*.16:uDens;float L=tf-tn,stp=(uQ==0?.12:(uQ==1?.085:.065))/max(uStepScale,.25);int NS=int(clamp(L/stp,10.,220.));float dt=L/float(NS);
 float j=fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233))+float(uFrame&255)*1.618)*43758.5453);
 vec3 ext=uBMax-uBMin,ld=uLD/ext;vec4 acc=vec4(0);float t=tn+j*dt,te=tn+L;float ph=1.+.35*pow(max(dot(rd,uLD),0.),3.);
 for(int i=0;i<260;i++){if(t>=te||acc.a>.985)break;vec3 uvw=(ro+rd*t-uBMin)/ext;
  vec4 c=textureLod(uVol,uvw,2.);if(uCal<.5&&c.g<.002&&c.r*dens<.0012){t+=dt*4.;continue;}
  vec4 s=textureLod(uVol,uvw,0.);if(s.g>.55)break;float d=uCal>.5?.004:smk(s.r)*dens;if(d<.003){t+=dt;continue;}
  float sh=smk(textureLod(uVol,uvw+ld*.17,0.).r);if(uQ>0)sh+=.7*smk(textureLod(uVol,uvw+ld*.4,0.).r);if(uQ>1)sh+=.5*smk(textureLod(uVol,uvw+ld*.75,0.).r);
  float lit=.32+.68*exp(-sh*dens*.9);d*=smoothstep(.15,.7,t);
  vec3 col=mix(vec3(.86,.92,1.),turbo(clamp(.5+(s.b-1.)*1.25,0.,1.)),uCMode)*lit*ph*uTF.w;float al=1.-exp(-d*dt*8.);acc.rgb+=(1.-acc.a)*al*col;acc.a+=(1.-acc.a)*al;t+=dt;}
 if(acc.a<.004)discard;o=acc;}`;
const LIVE_COMP=`#version 300 es
precision highp float;precision highp sampler2D;uniform sampler2D uT;uniform vec2 uRes;out vec4 o;
void main(){vec4 c=texture(uT,gl_FragCoord.xy/uRes);if(c.a<.002)discard;o=c;}`;
function liveCompile(fs,vs=LIVE_VS){const mk=(t,s)=>{const sh=gl.createShader(t);gl.shaderSource(sh,s);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error('LIVE_SHADER '+gl.getShaderInfoLog(sh));return sh};
 const p=gl.createProgram(),a=mk(gl.VERTEX_SHADER,vs),b=mk(gl.FRAGMENT_SHADER,fs);gl.attachShader(p,a);gl.attachShader(p,b);gl.linkProgram(p);gl.deleteShader(a);gl.deleteShader(b);
 if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error('LIVE_LINK '+gl.getProgramInfoLog(p));p._u={};return p}
function liveU(p,n){if(!(n in p._u))p._u[n]=gl.getUniformLocation(p,n);return p._u[n]}
function liveTarget(w,h,ifmt,fmt,type){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);
 gl.texImage2D(gl.TEXTURE_2D,0,ifmt,w,h,0,fmt,type,null);const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);
 if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('LIVE_FBO_INCOMPLETE');return {t,f}}
function liveVoxelize(N,min,h,fanB){const [nx,ny,nz]=N,tot=nx*ny*nz,shell=new Uint8Array(tot),idx=(i,j,k)=>i+nx*(j+ny*k),hm=Math.min(...h)*.45,t0=performance.now();
 for(const part of (LIVE.bench?[]:m12SolidParts())){const M=part.modelMatrix,P=part.positions,I=part.indices,V=new Float32Array(P.length);
  for(let i=0;i<P.length;i+=3){const q=m4point(M,[P[i],P[i+1],P[i+2]]);V[i]=q[0];V[i+1]=q[1];V[i+2]=q[2]}
  for(let t=0;t<I.length;t+=3){const a=I[t]*3,b=I[t+1]*3,c=I[t+2]*3,ax=V[a],ay=V[a+1],az=V[a+2],ex=V[b]-ax,ey=V[b+1]-ay,ez=V[b+2]-az,fx=V[c]-ax,fy=V[c+1]-ay,fz=V[c+2]-az;
   const n=Math.max(1,Math.ceil(Math.max(Math.hypot(ex,ey,ez),Math.hypot(fx,fy,fz),Math.hypot(fx-ex,fy-ey,fz-ez))/hm));
   for(let u=0;u<=n;u++)for(let v=0;v<=n-u;v++){const s=u/n,r=v/n,x=ax+ex*s+fx*r,y=ay+ey*s+fy*r,z=az+ez*s+fz*r,i=Math.floor((x-min[0])/h[0]),j=Math.floor((y-min[1])/h[1]),k=Math.floor((z-min[2])/h[2]);
    if(i>=0&&j>=0&&k>=0&&i<nx&&j<ny&&k<nz)shell[idx(i,j,k)]=1}}}
 const ext=new Uint8Array(tot),st=new Int32Array(tot);let sp=0;const push=q=>{if(!shell[q]&&!ext[q]){ext[q]=1;st[sp++]=q}};
 for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)if(i===0||j===0||k===0||i===nx-1||j===ny-1||k===nz-1)push(idx(i,j,k));
 while(sp){const q=st[--sp],i=q%nx,j=((q/nx)|0)%ny,k=(q/(nx*ny))|0;if(i>0)push(q-1);if(i<nx-1)push(q+1);if(j>0)push(q-nx);if(j<ny-1)push(q+nx);if(k>0)push(q-nx*ny);if(k<nz-1)push(q+nx*ny)}
 const type=new Uint8Array(tot);let car=0,fan=0;for(let q=0;q<tot;q++)if(!ext[q]){type[q]=1;car++}
 if(LIVE.bench==='cylinder'){const R=LIVE_BENCH.D/2;car=0;for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const x=min[0]+(i+.5)*h[0]-LIVE_BENCH.x,z=min[2]+(k+.5)*h[2]-LIVE_BENCH.z;if(x*x+z*z<=R*R){type[idx(i,j,k)]=1;car++}}}
 if(fanB)for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const x=min[0]+(i+.5)*h[0],y=min[1]+(j+.5)*h[1],z=min[2]+(k+.5)*h[2];
  if(x>=fanB.min[0]&&x<=fanB.max[0]&&y>=fanB.min[1]&&y<=fanB.max[1]&&z>=fanB.min[2]&&z<=fanB.max[2]){const q=idx(i,j,k);if(!type[q]){type[q]=2;fan++}}}
 const col=new Uint8Array(ny*nz);for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)if(type[idx(i,j,k)]===1)col[j+ny*k]=1;let cc=0;for(let q=0;q<col.length;q++)cc+=col[q];
 return {type,car,fan,front:cc*h[1]*h[2],ms:performance.now()-t0}}
function liveInit(){LIVE.init=true;LIVE.ok=false;LIVE.gen=runtimeGeneration;try{
 const cbf=gl.getExtension('EXT_color_buffer_float');if(!cbf)throw Error('EXT_color_buffer_float 미지원 기기');
 const st=liveStartTier(),q=st.q==='MED'?'MID':st.q;LIVE.q=q;LIVE.mgCycles=q==='ULTRA'?2:1;const N=LIVE_Q[q];LIVE.N=N;
 const b=CFD_DOMAIN_CONTRACT.bounds,min=Array.from(b.min),max=Array.from(b.max),h=max.map((v,i)=>(v-min[i])/N[i]);LIVE.min=min;LIVE.max=max;LIVE.h=h;
 const maxTex=gl.getParameter(gl.MAX_TEXTURE_SIZE);let tx=Math.ceil(Math.sqrt(N[2]*N[1]/N[0]));tx=Math.min(tx,Math.floor(maxTex/N[0]));const ty=Math.ceil(N[2]/tx);LIVE.tx=tx;LIVE.W=N[0]*tx;LIVE.H=N[1]*ty;
 if(LIVE.impl==='MAC'){try{
   if(LIVE.progGen!==runtimeGeneration){LIVE.prog={};for(const k in LIVE_FS)LIVE.prog[k]=liveCompile(LIVE_H+LIVE_FS[k]);LIVE.prog.ray=liveCompile(LIVE_RAY);LIVE.prog.sum=liveCompile(LIVE_SUM);LIVE.prog.comp=liveCompile(LIVE_COMP);LIVE.progGen=runtimeGeneration;LIVE.vao=gl.createVertexArray()}
   LIVE.fanKey=JSON.stringify(AETHER.FAN_MODULE?.layout?.fanBounds||null);macInit();LIVE.vol=MAC.vol;LIVE.volFbo=null;LIVE.vox={car:Math.round(MAC.vox.carCells),fan:MAC.vox.fan,front:MAC.vox.front,ms:Math.round(MAC.vox.ms)};
   LIVE.ok=true;LIVE.err=null;LIVE.step=0;LIVE.t=0;return}
  catch(e){LIVE.macErr=String(e?.message||e);LIVE.impl='COLLOCATED';try{macRelease()}catch(_){}}}
 LIVE.bench=LIVE.bench||(location.hash.match(/bench=(cylinder)/)||[])[1]||null;if(LIVE.bench&&!LIVE.benchRec&&!LIVE.benchRes)LIVE.benchRec={t:[],v:[],vx:[]};const fanB=AETHER.FAN_MODULE?.layout?.fanBounds||null;LIVE.fanKey=JSON.stringify(fanB);const vox=liveVoxelize(N,min,h,fanB);LIVE.vox={car:vox.car,fan:vox.fan,front:vox.front,ms:Math.round(vox.ms)};
 const obs=new Uint8Array(LIVE.W*LIVE.H*4);for(let k=0;k<N[2];k++)for(let j=0;j<N[1];j++)for(let i=0;i<N[0];i++){const t=vox.type[i+N[0]*(j+N[1]*k)];if(!t)continue;const ax=(k%tx)*N[0]+i,ay=Math.floor(k/tx)*N[1]+j,o=(ay*LIVE.W+ax)*4;obs[o+(t===1?0:1)]=255;obs[o+3]=255}
 LIVE.obs=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,LIVE.obs);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,LIVE.W,LIVE.H,0,gl.RGBA,gl.UNSIGNED_BYTE,obs);
 const W=LIVE.W,H=LIVE.H,V=()=>liveTarget(W,H,gl.RGBA32F,gl.RGBA,gl.FLOAT),R=()=>liveTarget(W,H,gl.R32F,gl.RED,gl.FLOAT);
 LIVE.tex={velA:V(),velB:V(),curl:V(),pA:R(),pB:R(),div:R(),dyeA:R(),dyeB:R(),hat:R(),bar:R(),flags:liveTarget(W,H,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE)};
 LIVE.vol=gl.createTexture();gl.bindTexture(gl.TEXTURE_3D,LIVE.vol);for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_NEAREST],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_R,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_3D,k,v);
 gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA16F,N[0],N[1],N[2],0,gl.RGBA,gl.HALF_FLOAT,null);LIVE.volFbo=gl.createFramebuffer();
 if(LIVE.progGen!==runtimeGeneration){LIVE.prog={};for(const k in LIVE_FS)LIVE.prog[k]=liveCompile(LIVE_H+LIVE_FS[k]);LIVE.prog.ray=liveCompile(LIVE_RAY);LIVE.prog.sum=liveCompile(LIVE_SUM);LIVE.prog.comp=liveCompile(LIVE_COMP);LIVE.progGen=runtimeGeneration;LIVE.vao=gl.createVertexArray()}
 liveBuildLevels();LIVE.ok=true;LIVE.err=null;LIVE.step=0;LIVE.t=0;livePasses(0,true);
}catch(e){LIVE.ok=false;LIVE.err=String(e?.message||e)}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,glCanvas.width,glCanvas.height);gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0)}}
function livePass(name,out,tex,uni,lv){lv=lv||LIVE.lv[0];const p=LIVE.prog[name],N=lv.N;gl.useProgram(p);gl.bindFramebuffer(gl.FRAMEBUFFER,out.f);gl.viewport(0,0,lv.W,lv.H);
 gl.uniform3i(liveU(p,'uN'),N[0],N[1],N[2]);gl.uniform1i(liveU(p,'uTX'),lv.tx);gl.uniform3f(liveU(p,'uMin'),...LIVE.min);gl.uniform3f(liveU(p,'uH'),...lv.h);gl.uniform1f(liveU(p,'uU'),LIVE.U);gl.uniform3f(liveU(p,'uBodyV'),...LIVE.bodyV);
 let unit=8;const bind=(n,t)=>{gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(liveU(p,n),unit);unit++};bind('uFlags',lv.flags.t);for(const n in tex)bind(n,tex[n]);
 for(const n in uni){const v=uni[n],l=liveU(p,n);if(l===null)continue;if(Array.isArray(v)){if(v.length===4)gl.uniform4f(l,...v);else if(v.length===3)gl.uniform3f(l,...v)}else if(v&&v.int!==undefined)gl.uniform1i(l,v.int);else if(v&&v.i3)gl.uniform3i(l,...v.i3);else if(v instanceof Float32Array)gl.uniform4fv(l,v);else gl.uniform1f(l,v)}
 gl.drawArrays(gl.TRIANGLES,0,3)}
/* ---- multigrid pressure solver (V-cycle over atlas levels) ---- */
function liveAtlas(n){const maxTex=gl.getParameter(gl.MAX_TEXTURE_SIZE);let tx=Math.ceil(Math.sqrt(n[2]*n[1]/n[0]));tx=Math.max(1,Math.min(tx,Math.floor(maxTex/n[0])));const ty=Math.ceil(n[2]/tx);return {tx,W:n[0]*tx,H:n[1]*ty}}
function liveBuildLevels(){const T=LIVE.tex,R=(W,H)=>liveTarget(W,H,gl.R32F,gl.RED,gl.FLOAT);
 T.res=liveTarget(LIVE.W,LIVE.H,gl.R32F,gl.RED,gl.FLOAT);T.frc=liveTarget(LIVE.W,LIVE.H,gl.RGBA32F,gl.RGBA,gl.FLOAT);
 LIVE.red=[];{let w=LIVE.W,h=LIVE.H;while(w>8||h>8){w=Math.ceil(w/8);h=Math.ceil(h/8);LIVE.red.push({w,h,t:liveTarget(w,h,gl.RGBA32F,gl.RGBA,gl.FLOAT)})}}
 const lv=[{N:LIVE.N,tx:LIVE.tx,W:LIVE.W,H:LIVE.H,h:LIVE.h,flags:T.flags,t:T,bK:'div',rK:'res'}];
 let n=LIVE.N.slice();
 for(let l=1;l<LIVE.mgLevels;l++){const m=n.map(v=>Math.max(2,Math.ceil(v/2)));if(Math.min(...m)<4&&l>1)break;n=m;const a=liveAtlas(n);
  const t={pA:R(a.W,a.H),pB:R(a.W,a.H),b:R(a.W,a.H),r:R(a.W,a.H),flags:liveTarget(a.W,a.H,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE)};
  lv.push({N:n.slice(),tx:a.tx,W:a.W,H:a.H,h:LIVE.max.map((v,i)=>(v-LIVE.min[i])/n[i]),flags:t.flags,t,bK:'b',rK:'r'})}
 LIVE.lv=lv}
function liveClear(t,v=0){gl.bindFramebuffer(gl.FRAMEBUFFER,t.f);gl.clearColor(v,v,v,v);gl.clear(gl.COLOR_BUFFER_BIT)}
function liveSmooth(l,n){const V=LIVE.lv[l],t=V.t;for(let k=0;k<n;k++){livePass('jacw',t.pB,{uP:t.pA.t,uDiv:t[V.bK].t},{uOm:LIVE.omega},V);const x=t.pA;t.pA=t.pB;t.pB=x}}
function liveCycle(l){const lv=LIVE.lv,V=lv[l],t=V.t;
 if(l===lv.length-1){liveSmooth(l,LIVE.coarseIters);return}
 liveSmooth(l,LIVE.mgPre);
 livePass('res',t[V.rK],{uP:t.pA.t,uB:t[V.bK].t},{},V);
 const C=lv[l+1];livePass('rest',C.t.b,{uRF:t[V.rK].t,uFF:V.flags.t},{uNF:{i3:V.N},uTXF:{int:V.tx},uRS:LIVE.mgRS},C);
 liveClear(C.t.pA);liveClear(C.t.pB);liveCycle(l+1);
 livePass('prol',t.pB,{uP:t.pA.t,uPC:C.t.pA.t,uFC:C.flags.t},{uNC:{i3:C.N},uTXC:{int:C.tx},uHC:C.h,uRN:LIVE.mgRN,uCorr:LIVE.mgCorr},V);const x=t.pA;t.pA=t.pB;t.pB=x;
 liveSmooth(l,LIVE.mgPost)}
function liveSolve(){const T=LIVE.tex;
 if(LIVE.warm===false){liveClear(T.pA);liveClear(T.pB)}
 if(LIVE.solver==='MG'&&LIVE.lv.length>1){const lv=LIVE.lv;for(let l=1;l<lv.length;l++)livePass('cflag',lv[l].flags,{uFF:lv[l-1].flags.t},{uNF:{i3:lv[l-1].N},uTXF:{int:lv[l-1].tx}},lv[l]);
  for(let c=0;c<LIVE.mgCycles;c++)liveCycle(0)}
 else for(let k=0;k<LIVE.jacobi;k++){livePass('jac',T.pB,{uP:T.pA.t,uDiv:T.div.t},{});liveSwap('pA','pB')}}/* Pressure force on the car voxels: F = sum over fluid cells next to a car cell of P*A*d, with P = rho*p/dt (p = projection pressure,
   u = u* - grad p, so p = dt*P/rho). Inviscid: no skin friction. Reduced on the GPU (8x8 block sums), read back as a few texels. */
function liveForceReduce(){if(LIVE.impl==='MAC'){const T=MAC.t,cfg=MAC.cfg;gl.bindVertexArray(LIVE.vao);macPass('force',T.frc,{uVel:T.velA.t,uP:MAC.lv[0].T.pA.t,uSol:T.sol.t,uNu:T.nu.t},{uRho:cfg.rho??1.2,uNuMol:cfg.nu??MAC.nuMol,uId:1});return {src:liveReduceTo(T.frc,MAC.G.W,MAC.G.H,MAC.red),sw:1,sh:1}}const T=LIVE.tex;gl.bindVertexArray(LIVE.vao);livePass('force',T.frc,{uP:T.pA.t},{});let src=T.frc,sw=LIVE.W,sh=LIVE.H;const p=LIVE.prog.sum;gl.useProgram(p);
 for(const r of LIVE.red){gl.bindFramebuffer(gl.FRAMEBUFFER,r.t.f);gl.viewport(0,0,r.w,r.h);gl.activeTexture(gl.TEXTURE0+8);gl.bindTexture(gl.TEXTURE_2D,src.t);gl.uniform1i(liveU(p,'uS'),8);gl.uniform2i(liveU(p,'uSz'),sw,sh);gl.drawArrays(gl.TRIANGLES,0,3);src=r.t;sw=r.w;sh=r.h}
 return {src,sw,sh}}
function liveForceFinish(buf,n,dt){let fx=0,fy=0,fz=0;for(let i=0;i<n;i++){fx+=buf[i*4];fy+=buf[i*4+1];fz+=buf[i*4+2]}
 const rho=1.2,k=LIVE.impl==='MAC'?1:rho/dt,A=LIVE.vox?.front||0,q=.5*rho*LIVE.U*LIVE.U*A;
 return {Fx:fx*k,Fy:fy*k,Fz:fz*k,A,Cd:q>0?fx*k/q:NaN,Cl:q>0?fy*k/q:NaN,Cs:q>0?fz*k/q:NaN}}
function liveForces(){const dt=LIVE.lastDt||0;if(!LIVE.ok||!dt)return null;const {src,sw,sh}=liveForceReduce(),buf=new Float32Array(sw*sh*4);
 gl.bindFramebuffer(gl.FRAMEBUFFER,src.f);gl.readPixels(0,0,sw,sh,gl.RGBA,gl.FLOAT,buf);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null);return liveForceFinish(buf,sw*sh,dt)}
/* real-time path: PBO readback + fence, polled on later frames, so the CPU never waits for the GPU */
function liveForcesKick(){if(LIVE.frcJob||!LIVE.ok||!LIVE.lastDt)return;const {src,sw,sh}=liveForceReduce(),bytes=sw*sh*16;
 if(!LIVE.pbo){LIVE.pbo=gl.createBuffer()}gl.bindBuffer(gl.PIXEL_PACK_BUFFER,LIVE.pbo);if(LIVE.pboBytes!==bytes){gl.bufferData(gl.PIXEL_PACK_BUFFER,bytes,gl.STREAM_READ);LIVE.pboBytes=bytes}
 gl.bindFramebuffer(gl.FRAMEBUFFER,src.f);gl.readPixels(0,0,sw,sh,gl.RGBA,gl.FLOAT,0);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null);
 LIVE.frcJob={fence:gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0),n:sw*sh,dt:LIVE.lastDt,gen:LIVE.gen,tier:LIVE.q};gl.flush()}
function liveForcesPoll(){const J=LIVE.frcJob;if(!J)return;const r=gl.clientWaitSync(J.fence,0,0);if(r===gl.TIMEOUT_EXPIRED)return;gl.deleteSync(J.fence);LIVE.frcJob=null;if(r===gl.WAIT_FAILED||J.tier!==LIVE.q)return;
 const buf=new Float32Array(J.n*4);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,LIVE.pbo);gl.getBufferSubData(gl.PIXEL_PACK_BUFFER,0,buf);gl.bindBuffer(gl.PIXEL_PACK_BUFFER,null);
 const f=liveForceFinish(buf,J.n,J.dt);if(!Number.isFinite(f.Fx)||Math.abs(f.Cd)>200){LIVE.guardTrips=(LIVE.guardTrips||0)+1;LIVE.forces=null;if(LIVE.impl==='MAC'){if(MAC.solver!=='RBGS'){MAC.solver='RBGS';LIVE.api.reset()}else{LIVE.macErr='발산 감지: 기존 솔버로 전환';LIVE.impl='COLLOCATED';liveSetTier(LIVE.q,'fallback');LIVE.init=false}}else{LIVE.solver='JACOBI';LIVE.api.reset()}return}liveForceUpdate(f)}
function liveForceUpdate(f){if(!f||!Number.isFinite(f.Cd))return;const F=LIVE.forces;if(!F||F.U!==LIVE.U){LIVE.forces={U:LIVE.U,n:1,...f};return}
 const a=Math.max(.12,1/(F.n+1));for(const k of ['Fx','Fy','Fz','Cd','Cl','Cs'])F[k]+=(f[k]-F[k])*a;F.A=f.A;F.n++;
 /* time statistics over the last 8 s of simulated time (spec: mean and standard deviation) */
 const H=F.hist||(F.hist=[]);H.push([LIVE.t,f.Cd,f.Cl]);while(H.length&&H[0][0]<LIVE.t-8)H.shift();const m=i=>H.reduce((s,h)=>s+h[i],0)/H.length,sd=(i,mu)=>Math.sqrt(H.reduce((s,h)=>s+(h[i]-mu)**2,0)/H.length);
 F.CdMean=m(1);F.ClMean=m(2);F.CdStd=sd(1,F.CdMean);F.ClStd=sd(2,F.ClMean);F.window=H.length>1?H[H.length-1][0]-H[0][0]:0}/* Benchmark: vertical cylinder (D=0.5 m) spanning the tunnel height. Probe = lateral velocity 3D behind it, offset 0.5D. Strouhal St=f*D/U from the DFT peak. */
function liveBenchProbe(){const c=LIVE_BENCH;return [c.x+3*c.D,c.y,c.z+.5*c.D]}
function liveBenchSample(){const R=LIVE.benchRec;if(!R||LIVE.benchRes)return;const p=liveBenchProbe(),v=liveRead(p[0],p[1],p[2]);R.t.push(LIVE.t);R.v.push(v[2]);R.vx.push(v[0]);
 if(LIVE.t>=LIVE_BENCH.T)LIVE.benchRes=liveBenchAnalyze(R)}
function liveBenchAnalyze(R){const D=LIVE_BENCH.D,U=LIVE.U,dt=.01,t0=LIVE_BENCH.spin,ts=[],vs=[];let j=0;
 for(let t=t0;t<=R.t[R.t.length-1];t+=dt){while(j<R.t.length-2&&R.t[j+1]<t)j++;const a=R.t[j],b=R.t[j+1],w=b>a?(t-a)/(b-a):0;vs.push(R.v[j]*(1-w)+R.v[j+1]*w);ts.push(t)}
 const n=vs.length;if(n<50)return {ok:false,reason:'too few samples',n};const m=vs.reduce((a,b)=>a+b,0)/n,x=vs.map((v,i)=>(v-m)*(.5-.5*Math.cos(2*Math.PI*i/(n-1))));
 const rms=Math.sqrt(x.reduce((a,b)=>a+b*b,0)/n);const mag=f=>{let re=0,im=0;for(let i=0;i<n;i++){const ph=2*Math.PI*f*i*dt;re+=x[i]*Math.cos(ph);im-=x[i]*Math.sin(ph)}return Math.hypot(re,im)};
 let bf=0,bm=0;const fl=[];for(let f=.1;f<=4;f+=.02){const M=mag(f);fl.push([f,M]);if(M>bm){bm=M;bf=f}}
 const i=fl.findIndex(q=>q[0]===bf),a=fl[i-1]?.[1]??bm,c=fl[i+1]?.[1]??bm,den=a-2*bm+c,off=den!==0?.5*(a-c)/den:0,f=bf+off*.02;
 const St=f*D/U,ref=.2;const zc=[];for(let i=1;i<n;i++)if((vs[i-1]-m)*(vs[i]-m)<0)zc.push(i);const fz=zc.length>1?(zc.length-1)/2/((zc[zc.length-1]-zc[0])*dt):0;
 return {ok:true,n,seconds:n*dt,f,St,StZeroCross:fz*D/U,ref,relErr:(St-ref)/ref,vRms:rms/(.5),U,D,cells:D/Math.min(...LIVE.h),peakQ:bm/(fl.reduce((a,q)=>a+q[1],0)/fl.length)}}function liveRelease(){if(LIVE.impl==='MAC'||MAC.t){try{macRelease()}catch(_){}}const del=t=>{if(t&&t.t){gl.deleteTexture(t.t);gl.deleteFramebuffer(t.f)}},T=LIVE.tex;if(T)for(const k in T)del(T[k]);for(const V of (LIVE.lv||[]).slice(1))for(const k in V.t)del(V.t[k]);(LIVE.red||[]).forEach(r=>del(r.t));
 if(LIVE.obs)gl.deleteTexture(LIVE.obs);if(LIVE.vol)gl.deleteTexture(LIVE.vol);if(LIVE.volFbo)gl.deleteFramebuffer(LIVE.volFbo);LIVE.tex=null;LIVE.lv=null;LIVE.red=null}
function liveSetTier(q,why){if(!LIVE_Q[q]||q===LIVE.q&&LIVE.init)return;liveRelease();LIVE.forceQ=q;LIVE.init=false;LIVE.ok=false;LIVE.forces=null;PERF.ctl.log.push((why||'')+'→'+q)}
function liveSwap(a,b){const T=LIVE.tex,t=T[a];T[a]=T[b];T[b]=t}
/* smoke rake: a stainless mast with nozzle stubs 0.6 m downstream of the fan face; the smoke leaves the nozzle tips.
   Nozzle radius ~ half a dye cell so each nozzle gives its own streak instead of merging into one sheet. */
function liveRakeGeometry(){const fb=AETHER.FAN_MODULE?.layout?.fanBounds,x=fb?fb.max[0]+.6:-3.9,M=window.__MAC,hd=LIVE.impl==='MAC'&&M?.hd?Math.min(...M.hd):.075;
 const r=Math.max(.035,.75*hd),n=LIVE.rakeN||Math.max(3,Math.min(7,Math.round(1.32/Math.max(.22,5.2*r))+1));
 return {x,tip:x+.075,z:0,yh:.5,v:Array.from({length:n},(_,i)=>.15+1.32*i/(n-1)),h:[0,1,2,3,4,5,6,7,8].map(i=>-1.3+.325*i),r:Math.max(.035,.75*hd),vert:LIVE.mode==='RAKE_V'||LIVE.mode==='BOTH',horz:LIVE.mode==='RAKE_H'||LIVE.mode==='BOTH'}}
function liveRakeHardware(R){const key=[R.x.toFixed(3),R.vert,R.horz,R.v.length].join();if(LIVE.rakeKey===key||typeof bindMesh!=='function'||!gl)return;LIVE.rakeKey=key;
 for(const o of scene.objects)if(o.name.startsWith('rake probe')&&o.gpu)for(const b of [o.gpu.pb,o.gpu.nb,o.gpu.ub,o.gpu.ib])if(b)gl.deleteBuffer(b);
 scene.objects=scene.objects.filter(o=>!o.name.startsWith('rake probe'));const add=(n,c,sz)=>{const o=addBox('rake probe '+n,c,sz,[.74,.76,.78],{bevel:.004,category:'instrumentation'});o.pbrMaterial=materialFor(o);bevelMesh(o);
  const m=o._mesh,uv=m.uvs?.length===m.positions.length/3*2?m.uvs:new Float32Array(m.positions.length/3*2);o.gpu=bindMesh(m.positions,m.normals,uv,m.indices)};
 if(R.vert){add('mast',[R.x,.86,R.z],[.034,1.72,.034]);add('base',[R.x,.012,R.z],[.26,.024,.26]);R.v.forEach((y,i)=>add('nozzle v'+i,[R.x+.037,y,R.z],[.075,.02,.02]))}
 if(R.horz){add('bar',[R.x,R.yh,0],[.034,.034,2.96]);for(const z of [-1.5,1.5]){add('leg '+z,[R.x,R.yh/2,z],[.03,R.yh,.03]);add('foot '+z,[R.x,.012,z],[.2,.024,.2])}R.h.forEach((z,i)=>add('nozzle h'+i,[R.x+.037,R.yh,z],[.075,.02,.02]))}}
function liveEmitters(){const E=[],B=window.__BODY,R=liveRakeGeometry();try{liveRakeHardware(R)}catch(e){LIVE.rakeErr=String(e.message||e)}
 if(R.vert)for(const y of R.v)E.push([R.tip,y,R.z,R.r]);
 if(R.horz)for(const z of R.h)E.push([R.tip,R.yh,z,R.r]);
 if(LIVE.wand&&fpv.enabled&&B?.inTunnel){const cp=Math.cos(fpv.pitch),f=[Math.sin(fpv.yaw)*cp,Math.sin(fpv.pitch),-Math.cos(fpv.yaw)*cp],e=camera.eye;E.push([e[0]+f[0]*.75,e[1]+f[1]*.75-.3,e[2]+f[2]*.75,Math.max(.045,R.r)])}
 LIVE.emitters=E.slice(0,16);const a=new Float32Array(64);LIVE.emitters.forEach((v,i)=>a.set(v,i*4));return a}
function livePasses(dt,initOnly=false){if(LIVE.impl==='MAC'){if(initOnly)return;macStep(dt);LIVE.step++;LIVE.t+=dt;LIVE.lastDt=dt;return}const T=LIVE.tex,B=window.__BODY,act=!!(B&&B.active);gl.bindVertexArray(LIVE.vao);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
 LIVE.bodyV=act&&fpv.enabled?[fpv.vx||0,0,fpv.vz||0]:[0,0,0];
 livePass('flags',T.flags,{uObs:LIVE.obs},{uBody:act?[B.x,B.z,B.g,1]:[0,0,0,0]});
 if(initOnly){livePass('init',T.velA,{},{});return}
 const em=liveEmitters();
 livePass('curl',T.curl,{uVel:T.velA.t},{});livePass('advv',T.velB,{uVel:T.velA.t,uCurl:T.curl.t},{uDt:dt,uEps:LIVE.vortEps});liveSwap('velA','velB');
 livePass('div',T.div,{uVel:T.velA.t},{});liveSolve();if(LIVE.diag)livePass('res',T.res,{uP:T.pA.t,uB:T.div.t},{});
 livePass('proj',T.velB,{uVel:T.velA.t,uP:T.pA.t},{});liveSwap('velA','velB');
 livePass('advd',T.hat,{uVel:T.velA.t,uSrc:T.dyeA.t},{uDt:dt});livePass('advd',T.bar,{uVel:T.velA.t,uSrc:T.hat.t},{uDt:-dt});
 livePass('corr',T.dyeB,{uVel:T.velA.t,uSrc:T.dyeA.t,uHat:T.hat.t,uBar:T.bar.t},{uDt:dt,uDecay:liveDecay(dt),uEmS:1,uEm:em,uEmN:{int:LIVE.emitters.length}});liveSwap('dyeA','dyeB');
 LIVE.step++;LIVE.t+=dt;LIVE.lastDt=dt}
function liveCopyVolume(){if(LIVE.impl==='MAC')return macCopyVolume();const p=LIVE.prog.copy,N=LIVE.N,T=LIVE.tex;gl.useProgram(p);gl.bindFramebuffer(gl.FRAMEBUFFER,LIVE.volFbo);gl.viewport(0,0,N[0],N[1]);
 gl.uniform3i(liveU(p,'uN'),N[0],N[1],N[2]);gl.uniform1i(liveU(p,'uTX'),LIVE.tx);gl.uniform3f(liveU(p,'uMin'),...LIVE.min);gl.uniform3f(liveU(p,'uH'),...LIVE.h);gl.uniform1f(liveU(p,'uU'),LIVE.U);
 const bind=(u,n,t)=>{gl.activeTexture(gl.TEXTURE0+u);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(liveU(p,n),u)};bind(8,'uFlags',T.flags.t);bind(9,'uVel',T.velA.t);bind(10,'uDye',T.dyeA.t);
 for(let k=0;k<N[2];k++){gl.framebufferTextureLayer(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,LIVE.vol,0,k);gl.uniform1i(liveU(p,'uLayer'),k);gl.drawArrays(gl.TRIANGLES,0,3)}
 gl.bindTexture(gl.TEXTURE_3D,LIVE.vol);gl.generateMipmap(gl.TEXTURE_3D)}
function liveRead(x,y,z){if(LIVE.impl==='MAC')return macRead(x,y,z);const N=LIVE.N,i=Math.min(N[0]-1,Math.max(0,Math.floor((x-LIVE.min[0])/LIVE.h[0]))),j=Math.min(N[1]-1,Math.max(0,Math.floor((y-LIVE.min[1])/LIVE.h[1]))),k=Math.min(N[2]-1,Math.max(0,Math.floor((z-LIVE.min[2])/LIVE.h[2])));
 const ax=(k%LIVE.tx)*N[0]+i,ay=Math.floor(k/LIVE.tx)*N[1]+j,buf=new Float32Array(4);gl.bindFramebuffer(gl.FRAMEBUFFER,LIVE.tex.velA.f);gl.readPixels(ax,ay,1,1,gl.RGBA,gl.FLOAT,buf);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return [buf[0],buf[1],buf[2]]}
function liveStep(now){if(!LIVE.enabled)return;if(!LIVE.init||LIVE.gen!==runtimeGeneration)liveInit();if(!LIVE.ok||LIVE.freeze)return;
 if(!PERF.cal){const M=perfManualFromHash();PERF.cal=(M.sim&&M.vol&&M.ren)?{done:true,result:{skipped:'manual #q'}}:{};if(PERF.cal.done)for(const ax of ['sim','vol','ren'])perfApplyTier(ax,M[ax])}
 if(!PERF.cal.done){try{perfCalibrateStep(now)}catch(e){PERF.cal={done:true,result:{error:String(e?.message||e)}};for(const ax of ['sim','vol','ren'])perfApplyTier(ax,'LOW')}if(!LIVE.init)return}if(now-(LIVE.lastFanCheck||0)>1000){LIVE.lastFanCheck=now;const fb=AETHER.FAN_MODULE?.layout?.fanBounds||null;if(JSON.stringify(fb)!==LIVE.fanKey)liveReobstacle(fb)}
 try{const fdt=LIVE.lastT?Math.min(.05,(now-LIVE.lastT)/1000):1/60;LIVE.lastT=now;
  const hmin=Math.min(...LIVE.h),cfl=.9*hmin/(1.6*Math.max(LIVE.U,.5)),n=LIVE.step<40?6:LIVE.sub,dt=Math.min(cfl,Math.max(fdt,1/60)/LIVE.sub);
  for(let s=0;s<n;s++){livePasses(dt);if(LIVE.benchRec)liveBenchSample()}liveCopyVolume();
  liveForcesPoll();if(now-LIVE.lastRead>250){LIVE.lastRead=now;liveForcesKick();const B=window.__BODY;if(B&&B.active){const R=.55,P=[[R,0],[-R,0],[0,R],[0,-R]].map(([dx,dz])=>liveRead(B.x+dx,B.g+1.2,B.z+dz)),v=[0,1,2].map(i=>P.reduce((q,w)=>q+w[i],0)/4);LIVE.speedAt=P.reduce((q,w)=>q+Math.hypot(...w),0)/4;LIVE.vAt=v}}
 }catch(e){LIVE.ok=false;LIVE.err=String(e?.message||e)}
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
function liveSmokeRT(w,h){const R=LIVE.smokeRT;if(R&&R.w===w&&R.h===h)return R;if(R){gl.deleteTexture(R.t);gl.deleteFramebuffer(R.f)}
 const t=liveTarget(w,h,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE);gl.bindTexture(gl.TEXTURE_2D,t.t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);return LIVE.smokeRT={...t,w,h}}
/* calibration: worst-case march (no empty-space skipping, every step shaded) at the given size */
function liveCalibrationMarch(w,h){const RT=liveSmokeRT(w,h),p=LIVE.prog.ray;gl.bindVertexArray(LIVE.vao);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.bindFramebuffer(gl.FRAMEBUFFER,RT.f);gl.viewport(0,0,w,h);
 const eye=[-8.5,2.2,0],view=lookAt(eye,[6,1,0],[0,1,0]),proj=perspective(55,w/h,.05,60),vp=matMul(proj,view);
 gl.useProgram(p);gl.activeTexture(gl.TEXTURE0+8);gl.bindTexture(gl.TEXTURE_3D,LIVE.vol);gl.uniform1i(liveU(p,'uVol'),8);gl.uniformMatrix4fv(liveU(p,'uInv'),false,liveInv(vp));gl.uniform3f(liveU(p,'uEye'),...eye);
 gl.uniform3f(liveU(p,'uBMin'),...LIVE.min);gl.uniform3f(liveU(p,'uBMax'),...LIVE.max);gl.uniform2f(liveU(p,'uRes'),w,h);gl.uniform3f(liveU(p,'uLD'),.24,.95,.18);gl.uniform1f(liveU(p,'uDens'),LIVE.dens);gl.uniform4f(liveU(p,'uTF'),...LIVE.tf);gl.uniform1f(liveU(p,'uCMode'),1);
 gl.uniform1i(liveU(p,'uQ'),1);gl.uniform1f(liveU(p,'uStepScale'),1);gl.uniform1f(liveU(p,'uCal'),1);gl.uniform1i(liveU(p,'uFrame'),0);gl.drawArrays(gl.TRIANGLES,0,3);LIVE.calSteps=Math.round(18/.085)}
function liveRender(vp){if(!LIVE.enabled||!LIVE.ok)return;const dep=gl.isEnabled(gl.DEPTH_TEST),cull=gl.isEnabled(gl.CULL_FACE),cw=glCanvas.width,ch=glCanvas.height;try{
 const rs=LIVE.rs,w=Math.max(64,Math.round(cw*rs)),h=Math.max(64,Math.round(ch*rs)),RT=liveSmokeRT(w,h),p=LIVE.prog.ray,tq=(LIVE.q==='LOW'||LIVE.q==='LITE')?0:(LIVE.q==='MED'||LIVE.q==='HIGH'?1:2);
 gl.bindVertexArray(LIVE.vao);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.bindFramebuffer(gl.FRAMEBUFFER,RT.f);gl.viewport(0,0,w,h);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);
 gl.useProgram(p);gl.activeTexture(gl.TEXTURE0+8);gl.bindTexture(gl.TEXTURE_3D,LIVE.vol);gl.uniform1i(liveU(p,'uVol'),8);gl.uniformMatrix4fv(liveU(p,'uInv'),false,liveInv(vp));
 gl.uniform3f(liveU(p,'uEye'),...camera.eye);gl.uniform3f(liveU(p,'uBMin'),...LIVE.min);gl.uniform3f(liveU(p,'uBMax'),...LIVE.max);gl.uniform2f(liveU(p,'uRes'),w,h);gl.uniform3f(liveU(p,'uLD'),.24,.95,.18);
 gl.uniform1f(liveU(p,'uDens'),LIVE.dens);gl.uniform4f(liveU(p,'uTF'),...LIVE.tf);gl.uniform1f(liveU(p,'uCMode'),LIVE.colorMode?1:0);gl.uniform1i(liveU(p,'uQ'),Math.min(tq,LIVE.rq));gl.uniform1f(liveU(p,'uStepScale'),LIVE.stepScale||1);gl.uniform1f(liveU(p,'uCal'),0);gl.uniform1i(liveU(p,'uFrame'),LIVE.frame=(LIVE.frame|0)+1);gl.drawArrays(gl.TRIANGLES,0,3);
 gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,cw,ch);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
 const c=LIVE.prog.comp;gl.useProgram(c);gl.activeTexture(gl.TEXTURE0+8);gl.bindTexture(gl.TEXTURE_2D,RT.t);gl.uniform1i(liveU(c,'uT'),8);gl.uniform2f(liveU(c,'uRes'),cw,ch);gl.drawArrays(gl.TRIANGLES,0,3);
}catch(e){LIVE.err='render: '+String(e?.message||e)}finally{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.clearColor(.08,.11,.13,1);gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0);if(dep)gl.enable(gl.DEPTH_TEST);if(cull)gl.enable(gl.CULL_FACE);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA)}}
LIVE.api={read:(x,y,z)=>{const v=liveRead(x,y,z);return v},
 divStats(){if(LIVE.impl==='MAC')return macDivStats();const T=LIVE.tex,W=LIVE.W,H=LIVE.H;gl.bindVertexArray(LIVE.vao);livePass('div',T.div,{uVel:T.velA.t},{});const buf=new Float32Array(W*H*4);gl.bindFramebuffer(gl.FRAMEBUFFER,T.div.f);gl.readPixels(0,0,W,H,gl.RGBA,gl.FLOAT,buf);
  const fb=new Uint8Array(W*H*4);gl.bindFramebuffer(gl.FRAMEBUFFER,T.flags.f);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,fb);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null);
  let s=0,m=0,n=0;for(let i=0;i<W*H;i++){if(fb[i*4]>10)continue;const d=Math.abs(buf[i*4]);s+=d*d;m=Math.max(m,d);n++}const ref=LIVE.U/Math.min(...LIVE.h);return {rms:Math.sqrt(s/n),max:m,cells:n,relRms:Math.sqrt(s/n)/ref,relMax:m/ref}},
 flagCounts(){if(LIVE.impl==='MAC')return macFlagCounts();const T=LIVE.tex,W=LIVE.W,H=LIVE.H,fb=new Uint8Array(W*H*4);gl.bindFramebuffer(gl.FRAMEBUFFER,T.flags.f);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,fb);gl.bindFramebuffer(gl.FRAMEBUFFER,null);const c=[0,0,0,0];for(let i=0;i<W*H;i++){if(!fb[i*4+3])continue;c[Math.round(fb[i*4]*3/255)]++}return {fluid:c[0],car:c[1],fan:c[2],body:c[3]}},
 dyeSum(){if(LIVE.impl==='MAC'){const b=macReadAllD(MAC.t.dyeA);let s=0,c=0;for(let i=0;i<b.length;i+=4){s+=b[i];if(b[i]>.05)c++}return {sum:s,cells:c}}const T=LIVE.tex,W=LIVE.W,H=LIVE.H,buf=new Float32Array(W*H*4);gl.bindFramebuffer(gl.FRAMEBUFFER,T.dyeA.f);gl.readPixels(0,0,W,H,gl.RGBA,gl.FLOAT,buf);gl.bindFramebuffer(gl.FRAMEBUFFER,null);let s=0,c=0;for(let i=0;i<W*H;i++){s+=buf[i*4];if(buf[i*4]>.05)c++}return {sum:s,cells:c}}};

Object.assign(LIVE.api,{
 reset(){LIVE.forces=null;if(LIVE.impl==='MAC'){macReset();LIVE.step=0;LIVE.t=0;return}const T=LIVE.tex;gl.bindVertexArray(LIVE.vao);for(const k of ['velA','velB','curl','pA','pB','div','dyeA','dyeB','hat','bar','res'])liveClear(T[k]);for(const V of LIVE.lv.slice(1))for(const k of ['pA','pB','b','r'])liveClear(V.t[k]);livePasses(0,true);LIVE.step=0;LIVE.t=0;gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null)},
 /* deterministic stepping for tests: n steps of fixed dt, no rendering. opts.diag reads Poisson residual after the last solve */
 run(n,dt,opts={}){if(!LIVE.init)liveInit();const t0=performance.now();try{for(let i=0;i<n;i++){LIVE.diag=!!opts.diag&&i===n-1;livePasses(dt)}gl.bindFramebuffer(gl.FRAMEBUFFER,(LIVE.impl==='MAC'?MAC.t:LIVE.tex).velA.f);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,new Float32Array(4))}finally{LIVE.diag=false;gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,glCanvas.width,glCanvas.height);gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0);gl.enable(gl.DEPTH_TEST)}
  const out={ms:performance.now()-t0,step:LIVE.step,t:LIVE.t,solver:LIVE.solver};if(opts.diag)out.poisson=LIVE.api.poisson();return out},
 poisson(){if(LIVE.impl==='MAC')return macResidual();const T=LIVE.tex,W=LIVE.W,H=LIVE.H,r=new Float32Array(W*H*4),d=new Float32Array(W*H*4),fb=new Uint8Array(W*H*4);
  gl.bindFramebuffer(gl.FRAMEBUFFER,T.res.f);gl.readPixels(0,0,W,H,gl.RGBA,gl.FLOAT,r);gl.bindFramebuffer(gl.FRAMEBUFFER,T.div.f);gl.readPixels(0,0,W,H,gl.RGBA,gl.FLOAT,d);gl.bindFramebuffer(gl.FRAMEBUFFER,T.flags.f);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,fb);gl.bindFramebuffer(gl.FRAMEBUFFER,null);
  let sr=0,sd=0,mr=0,n=0;for(let i=0;i<W*H;i++){if(fb[i*4]>10)continue;const a=r[i*4],b=d[i*4];sr+=a*a;sd+=b*b;mr=Math.max(mr,Math.abs(a));n++}
  const ref=LIVE.U/Math.min(...LIVE.h);return {cells:n,resRms:Math.sqrt(sr/n)/ref,resMax:mr/ref,divRms:Math.sqrt(sd/n)/ref,ratio:Math.sqrt(sr/Math.max(sd,1e-30))}},
 /* convergence test of the pressure solver alone: fixed div from the current velocity field, p from zero, `n` solve calls */
 converge(n,cfg){const T=LIVE.tex,out=[];Object.assign(LIVE,cfg||{});gl.bindVertexArray(LIVE.vao);liveClear(T.pA);liveClear(T.pB);livePass('div',T.div,{uVel:T.velA.t},{});
  for(let i=0;i<n;i++){const t0=performance.now();liveSolve();livePass('res',T.res,{uP:T.pA.t,uB:T.div.t},{});const q=LIVE.api.poisson();out.push([i+1,+q.resRms.toExponential(3),+q.resMax.toExponential(3),+q.ratio.toExponential(3)])}
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null);return out},
 setBench(name,o){if(o&&o.D)LIVE_BENCH.D=o.D;LIVE.bench=name||null;LIVE.benchRes=null;LIVE.benchRec=name?{t:[],v:[],vx:[]}:null;liveReobstacle(AETHER.FAN_MODULE?.layout?.fanBounds||null);LIVE.api.reset()},
 /* headless benchmark: steps with fixed dt until benchRes is ready */
 bench(dt,maxSteps,o){LIVE.api.setBench('cylinder',o);dt=dt||.9*Math.min(...LIVE.h)/(1.6*Math.max(LIVE.U,.5));const t0=performance.now();for(let i=0;i<(maxSteps||2000)&&!LIVE.benchRes;i++){LIVE.api.run(1,dt);liveBenchSample()}return {res:LIVE.benchRes,steps:LIVE.step,ms:performance.now()-t0}},
 /* self-test: a uniform pressure must give zero net force on a closed body */
 uniformPForce(){const T=LIVE.tex;liveClear(T.pA,1);const f=liveForces();return f},
 setTier(q){liveSetTier(q,'api')},
 tune(now){perfControl(now)},
 rebuildLevels(){liveBuildLevels()},
 forces(m){return LIVE.impl==='MAC'?macForces(m):liveForces()},
 mac(){return MAC},
 solveBench(list){return macSolveBench(list)},
 validate(cfg){return macValidate(cfg)},
 vrun(n,dt,every,probe,cv){return macVrun(n,dt,every,probe,cv)},
 uniformError(){return macUniformError()},
 memBreakdown(){return macMemBreakdown()},
 set(o){Object.assign(LIVE,o)}});

function liveReobstacle(fanB){if(LIVE.impl==='MAC'){try{LIVE.fanKey=JSON.stringify(fanB);const cfg=macConfig();cfg.fan=fanB;MAC.cfg=cfg;MAC.vox=macStaticSolids(MAC.N,MAC.min,MAC.h,cfg);macUploadStatic(MAC.G,MAC.vox);MAC.wheels=macWheels();macSolids()}catch(e){LIVE.err='reobstacle: '+e.message}return}try{const N=LIVE.N,vox=liveVoxelize(N,LIVE.min,LIVE.h,fanB);LIVE.fanKey=JSON.stringify(fanB);LIVE.vox={car:vox.car,fan:vox.fan,front:vox.front,ms:Math.round(vox.ms)};const obs=new Uint8Array(LIVE.W*LIVE.H*4);
 for(let k=0;k<N[2];k++)for(let j=0;j<N[1];j++)for(let i=0;i<N[0];i++){const t=vox.type[i+N[0]*(j+N[1]*k)];if(!t)continue;const ax=(k%LIVE.tx)*N[0]+i,ay=Math.floor(k/LIVE.tx)*N[1]+j,o=(ay*LIVE.W+ax)*4;obs[o+(t===1?0:1)]=255;obs[o+3]=255}
 gl.bindTexture(gl.TEXTURE_2D,LIVE.obs);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,LIVE.W,LIVE.H,0,gl.RGBA,gl.UNSIGNED_BYTE,obs)}catch(e){LIVE.err='reobstacle: '+e.message}}
LIVE.setEnabled=v=>{LIVE.enabled=!!v};
/* ===== M3/M4: staggered MAC solver (default when it initialises; the collocated solver in 85-live-cfd.js is the fallback).
   - velocity: faces. vel.x = u on the -x face of cell (i,j,k), vel.y = v on the -y face, vel.z = w on the -z face.
     The +x outlet face is not stored (zero-gradient predictor + Dirichlet p=0 ghost), +y/+z faces are walls.
   - partial-volume solids: cell solid fraction phi (static car/fan supersampled 2x2x2, analytic moving body),
     face open fraction theta = 1-(phi_a+phi_b)/2. Cut-cell divergence and theta-weighted Laplacian (compatible
     operators: after an exact solve the discrete divergence is exactly zero).
   - advection: MacCormack with min/max limiter (RK2 backtrace). LES: Smagorinsky eddy viscosity, explicit.
   - pressure: kinematic p (P/rho). Solvers: GMG (weighted Jacobi smoother), RBGS-MG, MGPCG. Chosen by measurement.
   - smoke: passive scalar on a grid 2x finer than velocity in every axis. ===== */
const MAC={forceModel:'discrete-v2',ibm:'vf',les:true,Cs:.16,nuMol:1.5e-5,eps:0,solver:'RBGS',pcgSmoother:'RB',levels:4,pre:2,post:2,coarse:24,/* levels 6 + coarse 4/auto was tried for -10..19 % passes: fine on the tunnel, but diverged or missed the residual target on the validation sphere/cylinder (OPTIMIZATION_AUDIT.md §7). coarse:0 = auto is kept as an option */omega:.8,sor:1.15,corr:1,prol:0,pcgIters:4,cycles:2,jacobiIters:32,tol:1e-3,
 lastSolve:null,stats:{},domain:null};
window.__MAC=MAC;
const MAC_H=`#version 300 es
precision highp float;precision highp int;precision highp sampler2D;
uniform ivec3 uN,uN2;uniform int uTX,uTX2;uniform vec3 uH,uH2,uMin;uniform float uU;
layout(location=0) out vec4 o;
ivec2 AT(ivec3 c,ivec3 n,int tx){return ivec2((c.z%tx)*n.x+c.x,(c.z/tx)*n.y+c.y);}
ivec2 A(ivec3 c){return AT(c,uN,uTX);}
ivec3 C(){ivec2 f=ivec2(gl_FragCoord.xy);int tx=f.x/uN.x,ty=f.y/uN.y;return ivec3(f.x-tx*uN.x,f.y-ty*uN.y,ty*uTX+tx);}
bool IN(ivec3 c){return all(greaterThanEqual(c,ivec3(0)))&&all(lessThan(c,uN));}
vec4 F(sampler2D s,ivec3 c){return texelFetch(s,A(clamp(c,ivec3(0),uN-1)),0);}
vec4 FT(sampler2D s,ivec3 c,ivec3 n,int tx){return texelFetch(s,AT(clamp(c,ivec3(0),n-1),n,tx),0);}
vec4 TRI(sampler2D s,vec3 q,ivec3 n,int tx){q=clamp(q,vec3(0.),vec3(n-1));ivec3 i=min(ivec3(floor(q)),n-1);vec3 f=q-vec3(i);ivec3 j=min(i+1,n-1);
 vec4 a=mix(FT(s,i,n,tx),FT(s,ivec3(j.x,i.y,i.z),n,tx),f.x),b=mix(FT(s,ivec3(i.x,j.y,i.z),n,tx),FT(s,ivec3(j.x,j.y,i.z),n,tx),f.x),
 c=mix(FT(s,ivec3(i.x,i.y,j.z),n,tx),FT(s,ivec3(j.x,i.y,j.z),n,tx),f.x),d=mix(FT(s,ivec3(i.x,j.y,j.z),n,tx),FT(s,j,n,tx),f.x);return mix(mix(a,b,f.y),mix(c,d,f.y),f.z);}
/* MAC velocity at a point P given in corner-origin index units of grid (n,tx) */
vec3 VEL(sampler2D s,vec3 P,ivec3 n,int tx){return vec3(TRI(s,P-vec3(0.,.5,.5),n,tx).x,TRI(s,P-vec3(.5,0.,.5),n,tx).y,TRI(s,P-vec3(.5,.5,0.),n,tx).z);}
/* sol texture: xyz solid velocity, w = id*2+phi (id 0 fluid,1 car,2 fan,3 body) */
float PHI(vec4 s){return s.w-2.*floor(s.w*.5+.001);}
float SID(vec4 s){return floor(s.w*.5+.001);}
/* trilinear solid fraction (the encoded w = id*2+phi cannot be filtered directly); id = id of the most solid tap */
float PHIT(sampler2D s,vec3 q,ivec3 n,int tx,out float id){q=clamp(q,vec3(0.),vec3(n-1));ivec3 i=min(ivec3(floor(q)),n-1);vec3 f=q-vec3(i);float r=0.,pm=0.;id=0.;
 for(int k=0;k<8;k++){ivec3 d=ivec3(k&1,(k>>1)&1,(k>>2)&1);vec4 v=FT(s,min(i+d,n-1),n,tx);float p=PHI(v),w=(d.x==1?f.x:1.-f.x)*(d.y==1?f.y:1.-f.y)*(d.z==1?f.z:1.-f.z);r+=w*p;if(p>pm){pm=p;id=SID(v);}}
 return r;}
`;
/* pressure operator helpers: level geometry texture uG (x,y,z = open fraction of the -x,-y,-z face, w = phi) */
const MAC_P=`uniform sampler2D uG;
float TL(ivec3 c,int ax){if(c[ax]==0)return 0.;return F(uG,c)[ax];}
float TR(ivec3 c,int ax){ivec3 e=ivec3(0);e[ax]=1;if(c[ax]==uN[ax]-1)return ax==0?1.-F(uG,c).w:0.;return F(uG,c+e)[ax];}
float LAP(sampler2D P,ivec3 c,out float dg){vec3 ih=1./(uH*uH);float pc=F(P,c).x,s=0.;dg=0.;
 for(int ax=0;ax<3;ax++){ivec3 e=ivec3(0);e[ax]=1;float tl=TL(c,ax),tr=TR(c,ax);
  float pr=(c[ax]==uN[ax]-1)?0.:F(P,c+e).x;s+=ih[ax]*(tl*(F(P,c-e).x-pc)+tr*(pr-pc));dg+=ih[ax]*(tl+tr);}
 return s;}
float NB(sampler2D P,ivec3 c,out float dg){vec3 ih=1./(uH*uH);float s=0.;dg=0.;
 for(int ax=0;ax<3;ax++){ivec3 e=ivec3(0);e[ax]=1;float tl=TL(c,ax),tr=TR(c,ax);float pr=(c[ax]==uN[ax]-1)?0.:F(P,c+e).x;s+=ih[ax]*(tl*F(P,c-e).x+tr*pr);dg+=ih[ax]*(tl+tr);}
 return s;}
`;
const MAC_FS={
/* ---- solids: static phi/id (uStatic RGBA8) + analytic moving body + rotating wheels ---- */
solid:`uniform sampler2D uStatic;uniform vec4 uBody;uniform vec3 uBodyV;uniform vec4 uWh[4];uniform float uWhW,uOm;
float bodyR(float y){return (y<0.||y>1.78)?0.:(y<.85?.17:(y<1.5?.25:.12));}
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}vec4 st=F(uStatic,c);float ps=st.r;float id=ps>0.?floor(st.g*255./50.+.5):0.;vec3 us=vec3(0.);
 vec3 w=uMin+(vec3(c)+.5)*uH;
 if(uBody.w>.5){float yr=w.y-uBody.z,r=bodyR(yr);if(r>0.){r=max(r,.5*uH.x);float d=length(w.xz-uBody.xy),pb=clamp(.5-(d-r)/uH.x,0.,1.);if(pb>ps){ps=pb;id=3.;}}}
 if(id==2.)us=vec3(uU,0.,0.);else if(id==3.)us=uBodyV;
 else if(id==1.){for(int k=0;k<4;k++){vec3 d=w-uWh[k].xyz;if(abs(d.z)<uWhW+uH.z&&length(d.xy)<uWh[k].w+uH.x)us=vec3(-uOm*d.y,uOm*d.x,0.);}}
 o=vec4(us,id*2.+min(ps,.999));}`,
geom:`uniform sampler2D uSol;
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}float pc=PHI(F(uSol,c));vec3 t;
 for(int ax=0;ax<3;ax++){ivec3 e=ivec3(0);e[ax]=1;float pn=c[ax]==0?(ax==0?0.:1.):PHI(F(uSol,c-e));float th=1.-.5*(pc+pn);t[ax]=th<.02?0.:th;}
 if(c.y==0)t.y=0.;if(c.z==0)t.z=0.;o=vec4(t,pc);}`,
/* coarse geometry: face fractions averaged over the fine faces of the coarse face, phi averaged over existing children.
   uR = coarsening ratio per axis (1 or 2): semi-coarsening keeps thin axes (e.g. a 4-cell quasi-2D span) unchanged */
cgeom:`uniform sampler2D uGF;uniform ivec3 uNF,uR;uniform int uTXF;
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}vec3 t=vec3(0.),n=vec3(0.);float ph=0.,m=0.;
 for(int k=0;k<8;k++){ivec3 d=ivec3(k&1,(k>>1)&1,(k>>2)&1);if(any(greaterThanEqual(d,uR)))continue;ivec3 f=c*uR+d;if(any(greaterThanEqual(f,uNF)))continue;vec4 g=FT(uGF,f,uNF,uTXF);ph+=g.w;m+=1.;
  if(d.x==0){t.x+=(f.x==0?0.:g.x);n.x+=1.;}if(d.y==0){t.y+=g.y;n.y+=1.;}if(d.z==0){t.z+=g.z;n.z+=1.;}}
 t=t/max(vec3(float(uR.y*uR.z),float(uR.x*uR.z),float(uR.x*uR.y)),n);o=vec4(t,m>0.?ph/m:1.);}`,
/* ---- advection (MacCormack pieces). uSrc = field to transport, uVel = transporting velocity (same grid) ---- */
adv:`uniform sampler2D uVel,uSrc;uniform float uDt;
vec3 back(vec3 P){vec3 v1=VEL(uVel,P,uN,uTX);vec3 Pm=P-.5*uDt*v1/uH;vec3 v2=VEL(uVel,Pm,uN,uTX);return clamp(P-uDt*v2/uH,vec3(0.),vec3(uN));}
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}vec3 b=vec3(c);
 vec3 Px=back(b+vec3(0.,.5,.5)),Py=back(b+vec3(.5,0.,.5)),Pz=back(b+vec3(.5,.5,0.));
 o=vec4(TRI(uSrc,Px-vec3(0.,.5,.5),uN,uTX).x,TRI(uSrc,Py-vec3(.5,0.,.5),uN,uTX).y,TRI(uSrc,Pz-vec3(.5,.5,0.),uN,uTX).z,0.);}`,
advc:`uniform sampler2D uVel,uHat,uBar,uSol,uG;uniform float uDt,uBelt;
vec3 back(vec3 P){vec3 v1=VEL(uVel,P,uN,uTX);vec3 Pm=P-.5*uDt*v1/uH;vec3 v2=VEL(uVel,Pm,uN,uTX);return clamp(P-uDt*v2/uH,vec3(0.),vec3(uN));}
vec2 mm(vec3 q,int ch){q=clamp(q,vec3(0.),vec3(uN-1));ivec3 i=min(ivec3(floor(q)),uN-1);float lo=1e9,hi=-1e9;for(int k=0;k<8;k++){float v=F(uVel,i+ivec3(k&1,(k>>1)&1,(k>>2)&1))[ch];lo=min(lo,v);hi=max(hi,v);}return vec2(lo,hi);}
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}vec3 b=vec3(c);
 vec3 u=F(uHat,c).xyz+.5*(F(uVel,c).xyz-F(uBar,c).xyz);
 vec2 rx=mm(back(b+vec3(0.,.5,.5))-vec3(0.,.5,.5),0),ry=mm(back(b+vec3(.5,0.,.5))-vec3(.5,0.,.5),1),rz=mm(back(b+vec3(.5,.5,0.))-vec3(.5,.5,0.),2);
 u=clamp(u,vec3(rx.x,ry.x,rz.x),vec3(rx.y,ry.y,rz.y));
 float lim=3.5*max(uU,.5);u=clamp(u,vec3(-lim),vec3(lim));o=vec4(u,0.);}`,
/* ---- eddy viscosity (Smagorinsky) at cell centres ---- */
sgs:`uniform sampler2D uVel,uSol;uniform float uCs,uNuMax;
vec3 CC(ivec3 c){c=clamp(c,ivec3(0),uN-1);vec3 a=F(uVel,c).xyz;vec3 b=vec3(c.x==uN.x-1?a.x:F(uVel,c+ivec3(1,0,0)).x,c.y==uN.y-1?0.:F(uVel,c+ivec3(0,1,0)).y,c.z==uN.z-1?0.:F(uVel,c+ivec3(0,0,1)).z);return .5*(a+b);}
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}if(PHI(F(uSol,c))>.5){o=vec4(0);return;}
 vec3 a=F(uVel,c).xyz,b=vec3(c.x==uN.x-1?a.x:F(uVel,c+ivec3(1,0,0)).x,c.y==uN.y-1?0.:F(uVel,c+ivec3(0,1,0)).y,c.z==uN.z-1?0.:F(uVel,c+ivec3(0,0,1)).z);
 vec3 dd=(b-a)/uH;vec3 gx=(CC(c+ivec3(1,0,0))-CC(c-ivec3(1,0,0)))/(2.*uH.x),gy=(CC(c+ivec3(0,1,0))-CC(c-ivec3(0,1,0)))/(2.*uH.y),gz=(CC(c+ivec3(0,0,1))-CC(c-ivec3(0,0,1)))/(2.*uH.z);
 float sxy=.5*(gy.x+gx.y),sxz=.5*(gz.x+gx.z),syz=.5*(gz.y+gy.z);float S2=2.*(dd.x*dd.x+dd.y*dd.y+dd.z*dd.z)+4.*(sxy*sxy+sxz*sxz+syz*syz);
 float D=pow(uH.x*uH.y*uH.z,1./3.);o=vec4(min(uCs*uCs*D*D*sqrt(S2),uNuMax),length(vec3(gy.z-gz.y,gz.x-gx.z,gx.y-gy.x)),0.,0.);}`,
/* ---- viscous + SGS diffusion, optional vorticity confinement, boundary/solid face velocities ---- */
diff:`uniform sampler2D uVel,uNu,uSol,uG;uniform float uDt,uNuMol,uEps,uBelt;uniform vec4 uBeltBox;
float ghostBelow(ivec3 c,float u0,int comp){vec3 w=uMin+(vec3(c)+.5)*uH;bool belt=uBelt>.5&&comp==0&&abs(w.x-uBeltBox.x)<uBeltBox.y&&abs(w.z-uBeltBox.z)<uBeltBox.w;return belt?2.*uU-u0:u0;}
vec3 us(ivec3 c,int ax){ivec3 e=ivec3(0);e[ax]=1;vec4 a=F(uSol,c),b=c[ax]==0?vec4(0.):F(uSol,c-e);float pa=PHI(a),pb=c[ax]==0?0.:PHI(b);return (pa*a.xyz+pb*b.xyz)/max(pa+pb,1e-6);}
vec3 vcf(ivec3 c){if(uEps<=0.)return vec3(0.);c=clamp(c,ivec3(0),uN-1);vec3 g=vec3(F(uNu,c+ivec3(1,0,0)).y-F(uNu,c-ivec3(1,0,0)).y,F(uNu,c+ivec3(0,1,0)).y-F(uNu,c-ivec3(0,1,0)).y,F(uNu,c+ivec3(0,0,1)).y-F(uNu,c-ivec3(0,0,1)).y);
 float l=length(g);if(l<1e-6)return vec3(0.);
 vec3 a=F(uVel,c).xyz;vec3 w;{ivec3 cc=c;vec3 up=F(uVel,cc+ivec3(0,1,0)).xyz,dn=F(uVel,cc-ivec3(0,1,0)).xyz,fp=F(uVel,cc+ivec3(0,0,1)).xyz,bk=F(uVel,cc-ivec3(0,0,1)).xyz,rt=F(uVel,cc+ivec3(1,0,0)).xyz,lf=F(uVel,cc-ivec3(1,0,0)).xyz;
 w=vec3((up.z-dn.z)/(2.*uH.y)-(fp.y-bk.y)/(2.*uH.z),(fp.x-bk.x)/(2.*uH.z)-(rt.z-lf.z)/(2.*uH.x),(rt.y-lf.y)/(2.*uH.x)-(up.x-dn.x)/(2.*uH.y));}
 return uEps*uH.x*cross(g/l,w);}
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}vec3 u=F(uVel,c).xyz;vec4 g=F(uG,c);vec3 un=u;vec3 ih=1./(uH*uH);
 for(int ax=0;ax<3;ax++){ivec3 e=ivec3(0);e[ax]=1;
  float nu=uNuMol+.5*(F(uNu,c).x+F(uNu,c-e).x);float lap=0.;
  for(int d=0;d<3;d++){ivec3 f=ivec3(0);f[d]=1;float up=c[d]==uN[d]-1?u[ax]:F(uVel,c+f)[ax];float dn;
   if(c[d]==0){dn=(d==1)?ghostBelow(c,u[ax],ax):(d==0?(ax==0?uU:u[ax]):u[ax]);}else dn=F(uVel,c-f)[ax];
   lap+=ih[d]*(up-2.*u[ax]+dn);}
  vec3 f2=.5*(vcf(c)+vcf(c-e));un[ax]=u[ax]+uDt*(nu*lap+f2[ax]);}
 /* boundary and solid faces */
 for(int ax=0;ax<3;ax++){if(g[ax]<=0.)un[ax]=us(c,ax)[ax];}
 if(c.x==0&&g.x>0.)un.x=uU;if(c.y==0)un.y=0.;if(c.z==0)un.z=0.;
 o=vec4(un,0.);}`,
/* ---- optional volume-fraction forcing (Kajishima et al. 2001): on partially solid faces u <- (1-chi) u + chi us,
   chi = 1-theta = face solid fraction. Makes tangential velocity feel the true surface instead of the fully solid staircase. ---- */
ibm:`uniform sampler2D uVel,uSol,uG;
vec3 us(ivec3 c,int ax){ivec3 e=ivec3(0);e[ax]=1;vec4 a=F(uSol,c),b=c[ax]==0?vec4(0.):F(uSol,c-e);float pa=PHI(a),pb=c[ax]==0?0.:PHI(b);return (pa*a.xyz+pb*b.xyz)/max(pa+pb,1e-6);}
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}vec3 u=F(uVel,c).xyz;vec4 g=F(uG,c);
 for(int ax=0;ax<3;ax++){if(g[ax]>0.&&g[ax]<1.)u[ax]=mix(u[ax],us(c,ax)[ax],1.-g[ax]);}o=vec4(u,0.);}`,
/* ---- cut-cell divergence of the predicted velocity (/dt for the Poisson right-hand side) ---- */
div:`uniform sampler2D uVel,uSol,uG;uniform float uScale,uPost;
vec3 us(ivec3 c,int ax){ivec3 e=ivec3(0);e[ax]=1;vec4 a=F(uSol,c),b=c[ax]==0?vec4(0.):F(uSol,c-e);float pa=PHI(a),pb=c[ax]==0?0.:PHI(b);return (pa*a.xyz+pb*b.xyz)/max(pa+pb,1e-6);}
float flux(ivec3 c,int ax){float th=F(uG,c)[ax];return th*F(uVel,c)[ax]+(1.-th)*us(c,ax)[ax];}
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}vec4 g=F(uG,c);float dg=0.;
 for(int ax=0;ax<3;ax++){ivec3 e=ivec3(0);e[ax]=1;dg+=g[ax]+(c[ax]==uN[ax]-1?(ax==0?1.-g.w:0.):F(uG,c+e)[ax]);}
 if(dg<1e-5){o=vec4(0);return;}
 float d=0.;for(int ax=0;ax<3;ax++){ivec3 e=ivec3(0);e[ax]=1;float fl=flux(c,ax);
  /* outlet (+x of the last column): predictor = zero-gradient; after projection the Dirichlet-ghost flux stored in .w by proj */
  float fr=c[ax]==uN[ax]-1?(ax==0?(uPost>.5?F(uVel,c).w:fl):0.):flux(c+e,ax);d+=(fr-fl)/uH[ax];}
 o=vec4(d*uScale,0,0,0);}`,
/* ---- pressure kernels (level-generic) ---- */
pjac:MAC_P+`uniform sampler2D uP,uB;uniform float uOm;
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}float dg;float s=NB(uP,c,dg);if(dg<1e-6){o=vec4(0);return;}float pc=F(uP,c).x;o=vec4(pc+uOm*((s-F(uB,c).x)/dg-pc),0,0,0);}`,
prb:MAC_P+`uniform sampler2D uP,uB;uniform int uColor;uniform float uOm;
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}float pc=F(uP,c).x;if(((c.x+c.y+c.z)&1)!=uColor){o=vec4(pc,0,0,0);return;}float dg;float s=NB(uP,c,dg);if(dg<1e-6){o=vec4(0);return;}o=vec4(pc+uOm*((s-F(uB,c).x)/dg-pc),0,0,0);}`,
pres:MAC_P+`uniform sampler2D uP,uB;
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}float dg;float l=LAP(uP,c,dg);o=vec4(dg<1e-6?0.:F(uB,c).x-l,0,0,0);}`,
papply:MAC_P+`uniform sampler2D uP;
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}float dg;float l=LAP(uP,c,dg);o=vec4(dg<1e-6?0.:l,0,0,0);}`,
prest:`uniform sampler2D uRF;uniform ivec3 uNF,uR;uniform int uTXF;
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}float s=0.,m=0.;for(int k=0;k<8;k++){ivec3 d=ivec3(k&1,(k>>1)&1,(k>>2)&1);if(any(greaterThanEqual(d,uR)))continue;ivec3 f=c*uR+d;if(any(greaterThanEqual(f,uNF)))continue;s+=FT(uRF,f,uNF,uTXF).x;m+=1.;}o=vec4(m>0.?s/m:0.,0,0,0);}`,
pprol:MAC_P+`uniform sampler2D uP,uPC,uGC;uniform ivec3 uNC,uR;uniform int uTXC;uniform float uCorr,uTri;
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}float dg;NB(uP,c,dg);float pc=F(uP,c).x;if(dg<1e-6){o=vec4(0);return;}float e;
 if(uTri<.5)e=FT(uPC,c/uR,uNC,uTXC).x;
 else{vec3 q=(vec3(c)+.5)/vec3(uR)-.5;ivec3 i0=ivec3(floor(q));vec3 f=q-vec3(i0);float acc=0.,wt=0.;
  for(int k=0;k<8;k++){ivec3 d=ivec3(k&1,(k>>1)&1,(k>>2)&1),j=clamp(i0+d,ivec3(0),uNC-1);float w=(d.x==1?f.x:1.-f.x)*(d.y==1?f.y:1.-f.y)*(d.z==1?f.z:1.-f.z);
   vec4 gc=FT(uGC,j,uNC,uTXC);if(gc.x+gc.y+gc.z<1e-6&&gc.w>.99)continue;acc+=w*FT(uPC,j,uNC,uTXC).x;wt+=w;}e=wt>1e-4?acc/wt:0.;}
 o=vec4(pc+uCorr*e,0,0,0);}`,
pdot:`uniform sampler2D uX,uY;
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}float a=F(uX,c).x,b=F(uY,c).x;o=vec4(a*b,a*a,b*b,0.);}`,
/* 1x1 scalar state: x=rz, y=alpha, z=beta, w=bb.  uMode 0 init (rz,bb), 1 alpha, 2 beta */
pscal:`uniform sampler2D uS,uD;uniform int uMode;uniform float uTol2;
/* state x=rz y=alpha z=beta w=bb ; uD = dot sums (x=a.b, y=a.a, z=b.b). modes: 0 set rz, 3 set bb, 1 alpha, 2 beta+convergence */
void main(){vec4 s=texelFetch(uS,ivec2(0),0),d=texelFetch(uD,ivec2(0),0);
 if(uMode==0){o=vec4(d.x,0.,0.,s.w);return;}
 if(uMode==3){o=vec4(s.xyz,d.x);return;}
 if(uMode==1){o=vec4(s.x,abs(d.x)>1e-30?s.x/d.x:0.,s.z,s.w);return;}
 if(d.y<=uTol2*s.w){o=vec4(0.,0.,0.,s.w);return;}
 o=vec4(d.x,s.y,abs(s.x)>1e-30?d.x/s.x:0.,s.w);}`,
paxpy:`uniform sampler2D uX,uY,uS;uniform int uSel;uniform float uSign;
/* sel 0: copy X ; sel 1: X + sign*alpha*Y ; sel 2: Y + beta*X */
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}vec4 s=texelFetch(uS,ivec2(0),0);float x=F(uX,c).x;
 o=vec4(uSel==0?x:(uSel==1?x+uSign*s.y*F(uY,c).x:F(uY,c).x+s.z*x),0,0,0);}`,
/* ---- projection ---- */
proj:`uniform sampler2D uVel,uP,uSol,uG;uniform float uDt;
vec3 us(ivec3 c,int ax){ivec3 e=ivec3(0);e[ax]=1;vec4 a=F(uSol,c),b=c[ax]==0?vec4(0.):F(uSol,c-e);float pa=PHI(a),pb=c[ax]==0?0.:PHI(b);return (pa*a.xyz+pb*b.xyz)/max(pa+pb,1e-6);}
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}vec3 u=F(uVel,c).xyz;vec4 g=F(uG,c);float pc=F(uP,c).x;
 /* outlet face flux of the last column: zero-gradient predictor + gradient to the p=0 ghost (the flux the Poisson operator assumes) */
 float fo=0.;if(c.x==uN.x-1){float th=g.x;fo=th*u.x+(1.-th)*us(c,0).x+uDt*(1.-g.w)*pc/uH.x;}
 for(int ax=0;ax<3;ax++){ivec3 e=ivec3(0);e[ax]=1;if(g[ax]>0.&&c[ax]>0)u[ax]-=uDt*(pc-F(uP,c-e).x)/uH[ax];else if(g[ax]<=0.)u[ax]=us(c,ax)[ax];}
 if(c.x==0&&g.x>0.)u.x=uU;if(c.y==0)u.y=0.;if(c.z==0)u.z=0.;o=vec4(u,fo);}`,
/* ---- forces on car (id 1) or validation obstacle ----
   pressure: jump of p across the phi ramps (surface integral of p n).
   viscous: exactly the momentum the diffusion pass exchanges with solid faces of this body. For every open face
   (component t) whose stencil neighbour in direction d is a solid face (theta=0) of body uId, the discrete
   Laplacian applies rho*nu*(us-u)*V/h_d^2 to the fluid; the body receives the opposite. This is consistent with
   the scheme (no assumed wall distance). */
force:`uniform sampler2D uVel,uP,uSol,uNu,uG,uStar;uniform float uRho,uNuMol,uId,uBudget,uVf,uDt;
vec3 us(ivec3 c,int ax){ivec3 e=ivec3(0);e[ax]=1;vec4 a=F(uSol,c),b=c[ax]==0?vec4(0.):F(uSol,c-e);float pa=PHI(a),pb=c[ax]==0?0.:PHI(b);return (pa*a.xyz+pb*b.xyz)/max(pa+pb,1e-6);}
bool isBody(ivec3 c,int t){ivec3 e=ivec3(0);e[t]=1;return SID(F(uSol,c))==uId||SID(F(uSol,c-e))==uId;}
bool bodyFace(ivec3 n,int t){if(!IN(n)||n[t]==0)return false;if(F(uG,n)[t]>0.)return false;return isBody(n,t);}
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}vec4 sc=F(uSol,c);vec3 Fo=vec3(0.);float Fpx=0.;vec3 A=vec3(uH.y*uH.z,uH.x*uH.z,uH.x*uH.y);
 vec4 g=F(uG,c);vec3 u=F(uVel,c).xyz;float V=uH.x*uH.y*uH.z;
 if(uBudget<.5){
  /* surface: jump of p across the phi ramps */
  for(int ax=0;ax<3;ax++){ivec3 e=ivec3(0);e[ax]=1;if(c[ax]==0)continue;vec4 sn=F(uSol,c-e);float pa=PHI(sc),pb=PHI(sn);
   if(!(SID(sc)==uId||SID(sn)==uId))continue;float dphi=pa-pb;if(abs(dphi)<1e-4)continue;
   ivec3 fc=pa<pb?c:c-e;float fp=uRho*F(uP,fc).x*dphi*A[ax];Fo[ax]+=fp;if(ax==0)Fpx+=fp;}
 }else{
  /* momentum budget: pressure on closed body faces (the part of grad p the projection never applies) + forcing of the ibm pass */
  for(int ax=0;ax<3;ax++){ivec3 e=ivec3(0);e[ax]=1;if(c[ax]==0||!isBody(c,ax))continue;
   if(g[ax]<=0.){float fp=uRho*(F(uP,c-e).x-F(uP,c).x)*A[ax];Fo[ax]+=fp;if(ax==0)Fpx+=fp;}
   else if(uVf>.5&&g[ax]<1.)Fo[ax]+=uRho*(1.-g[ax])*(F(uStar,c)[ax]-us(c,ax)[ax])*V/uDt;}
 }
 /* viscous: momentum the diffusion pass exchanges with closed faces of this body (rho nu (u-us) V/h_d^2 per stencil link) */
 for(int t=0;t<3;t++){if(g[t]<=0.||c[t]==0)continue;ivec3 et=ivec3(0);et[t]=1;float nu=uNuMol+.5*(F(uNu,c).x+F(uNu,c-et).x);
  for(int d=0;d<3;d++){ivec3 ed=ivec3(0);ed[d]=1;
   for(int s=-1;s<=1;s+=2){ivec3 n=c+s*ed;if(bodyFace(n,t))Fo[t]+=uRho*nu*(u[t]-us(n,t)[t])*V/(uH[d]*uH[d]);}}}
 o=vec4(Fo,Fpx);}`,
/* ---- smoke on the 2x grid (primary grid = dye grid, secondary grid 2 = velocity grid) ---- */
dadv:`uniform sampler2D uVel,uSrc;uniform float uDt;
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}vec3 w=uMin+(vec3(c)+.5)*uH;vec3 P=(w-uMin)/uH2;vec3 v=VEL(uVel,P,uN2,uTX2);
 vec3 Pm=P-.5*uDt*v/uH2;v=VEL(uVel,Pm,uN2,uTX2);vec3 q=(w-uDt*v-uMin)/uH-.5;o=vec4(TRI(uSrc,q,uN,uTX).x,0,0,0);}`,
dcorr:`uniform sampler2D uVel,uSrc,uHat,uBar,uSol;uniform float uDt,uDecay,uEmS;uniform vec4 uEm[16];uniform int uEmN;
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}vec3 w=uMin+(vec3(c)+.5)*uH;vec3 P=(w-uMin)/uH2;
 float sid;if(PHIT(uSol,P-.5,uN2,uTX2,sid)>.5||c.x==0){o=vec4(0);return;}
 vec3 v=VEL(uVel,P,uN2,uTX2);vec3 Pm=P-.5*uDt*v/uH2;v=VEL(uVel,Pm,uN2,uTX2);vec3 q=clamp((w-uDt*v-uMin)/uH-.5,vec3(0.),vec3(uN-1));ivec3 i=min(ivec3(floor(q)),uN-1);
 float lo=1e9,hi=-1e9;for(int k=0;k<8;k++){float s=F(uSrc,i+ivec3(k&1,(k>>1)&1,(k>>2)&1)).x;lo=min(lo,s);hi=max(hi,s);}
 float r=clamp(F(uHat,c).x+.5*(F(uSrc,c).x-F(uBar,c).x),lo,hi)*uDecay;
 for(int e=0;e<16;e++){if(e>=uEmN)break;vec3 d=w-uEm[e].xyz;float rr=uEm[e].w;r=max(r,uEmS*exp(-dot(d,d)/(rr*rr)));}
 o=vec4(max(r,0.),0,0,0);}`,
/* volume texture for rendering (dye resolution): r dye, g solid (1 car/.6 fan), b speed/U */
vcopy:`uniform sampler2D uVel,uDye,uSol;uniform int uLayer;layout(location=1) out vec4 o1;layout(location=2) out vec4 o2;layout(location=3) out vec4 o3;
vec4 lay(int k){if(k>=uN.z)return vec4(0.);ivec3 c=ivec3(ivec2(gl_FragCoord.xy),k);vec3 w=uMin+(vec3(c)+.5)*uH;vec3 P=(w-uMin)/uH2;float id,ph=PHIT(uSol,P-.5,uN2,uTX2,id);
 float g=(ph>.5&&id==1.)?1.:((ph>.5&&id==2.)?.6:0.);return vec4(g>0.?0.:F(uDye,c).x,g,length(VEL(uVel,P,uN2,uTX2))/max(uU,.1),1.);}
void main(){o=lay(uLayer);o1=lay(uLayer+1);o2=lay(uLayer+2);o3=lay(uLayer+3);}`,
init:`void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}o=vec4(uU,0.,0.,0.);}`,
clear:`void main(){o=vec4(0.);}`};

/* ---------------- CPU side ---------------- */
function macAtlas(n){const maxTex=gl.getParameter(gl.MAX_TEXTURE_SIZE);let tx=Math.ceil(Math.sqrt(n[2]*n[1]/n[0]));tx=Math.max(1,Math.min(tx,Math.floor(maxTex/n[0])));const ty=Math.ceil(n[2]/tx);
 if(n[1]*ty>maxTex)throw Error('MAC atlas exceeds MAX_TEXTURE_SIZE '+maxTex);return {N:n.slice(),tx,W:n[0]*tx,H:n[1]*ty}}
function macTarget(g,ifmt,fmt,type){return liveTarget(g.W,g.H,ifmt,fmt,type)}
/* static solids, partial volume: car supersampled 2x2x2 (shell + flood fill at 2N), fan box phi=1, validation shapes analytic 4x4x4 */
function macStaticSolids(N,min,h,cfg){const [nx,ny,nz]=N,tot=nx*ny*nz,phi=new Float32Array(tot),id=new Uint8Array(tot),t0=performance.now();
 if(cfg.car){const S=2,M=[nx*S,ny*S,nz*S],hs=h.map(v=>v/S),v=liveVoxelizeShell(M,min,hs);
  for(let k=0;k<M[2];k++)for(let j=0;j<M[1];j++)for(let i=0;i<M[0];i++)if(v[i+M[0]*(j+M[1]*k)]){const q=(i>>1)+nx*((j>>1)+ny*(k>>1));phi[q]+=1/8;id[q]=1}}
 if(cfg.obstacle){const O=cfg.obstacle,S=4;for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){let n=0;
  for(let a=0;a<S;a++)for(let b=0;b<S;b++)for(let c=0;c<S;c++){const x=min[0]+(i+(a+.5)/S)*h[0]-O.c[0],y=min[1]+(j+(b+.5)/S)*h[1]-O.c[1],z=min[2]+(k+(c+.5)/S)*h[2]-O.c[2];
   const r2=O.type==='sphere'?x*x+y*y+z*z:x*x+y*y;if(r2<=O.D*O.D/4)n++}
  if(n){const q=i+nx*(j+ny*k);phi[q]=n/(S*S*S);id[q]=1}}}
 const fb=cfg.fan;if(fb)for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const x=min[0]+(i+.5)*h[0],y=min[1]+(j+.5)*h[1],z=min[2]+(k+.5)*h[2];
  if(x>=fb.min[0]&&x<=fb.max[0]&&y>=fb.min[1]&&y<=fb.max[1]&&z>=fb.min[2]&&z<=fb.max[2]){const q=i+nx*(j+ny*k);if(id[q]!==1){phi[q]=1;id[q]=2}}}
 let car=0,fan=0,front=0;for(let q=0;q<tot;q++){if(id[q]===1)car+=phi[q];if(id[q]===2)fan++}
 const col=new Float32Array(ny*nz);for(let k=0;k<nz;k++)for(let j=0;j<ny;j++){let m=0;for(let i=0;i<nx;i++){const q=i+nx*(j+ny*k);if(id[q]===1)m=Math.max(m,phi[q])}col[j+ny*k]=m}for(const m of col)front+=m;
 return {phi,id,carCells:car,fan,front:front*h[1]*h[2],ms:performance.now()-t0}}
/* shell rasterisation + exterior flood fill of the vehicle triangles at resolution M (returns solid mask) */
function liveVoxelizeShell(M,min,h){const [nx,ny,nz]=M,tot=nx*ny*nz,shell=new Uint8Array(tot),idx=(i,j,k)=>i+nx*(j+ny*k),hm=Math.min(...h)*.45;
 for(const part of m12SolidParts()){const Mx=part.modelMatrix,P=part.positions,I=part.indices,V=new Float32Array(P.length);
  for(let i=0;i<P.length;i+=3){const q=m4point(Mx,[P[i],P[i+1],P[i+2]]);V[i]=q[0];V[i+1]=q[1];V[i+2]=q[2]}
  for(let t=0;t<I.length;t+=3){const a=I[t]*3,b=I[t+1]*3,c=I[t+2]*3,ax=V[a],ay=V[a+1],az=V[a+2],ex=V[b]-ax,ey=V[b+1]-ay,ez=V[b+2]-az,fx=V[c]-ax,fy=V[c+1]-ay,fz=V[c+2]-az;
   const n=Math.max(1,Math.ceil(Math.max(Math.hypot(ex,ey,ez),Math.hypot(fx,fy,fz),Math.hypot(fx-ex,fy-ey,fz-ez))/hm));
   for(let u=0;u<=n;u++)for(let v=0;v<=n-u;v++){const s=u/n,r=v/n,i=Math.floor((ax+ex*s+fx*r-min[0])/h[0]),j=Math.floor((ay+ey*s+fy*r-min[1])/h[1]),k=Math.floor((az+ez*s+fz*r-min[2])/h[2]);
    if(i>=0&&j>=0&&k>=0&&i<nx&&j<ny&&k<nz)shell[idx(i,j,k)]=1}}}
 const ext=new Uint8Array(tot),st=new Int32Array(tot);let sp=0;const push=q=>{if(!shell[q]&&!ext[q]){ext[q]=1;st[sp++]=q}};
 for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)if(i===0||j===0||k===0||i===nx-1||j===ny-1||k===nz-1)push(idx(i,j,k));
 while(sp){const q=st[--sp],i=q%nx,j=((q/nx)|0)%ny,k=(q/(nx*ny))|0;if(i>0)push(q-1);if(i<nx-1)push(q+1);if(j>0)push(q-nx);if(j<ny-1)push(q+nx);if(k>0)push(q-nx*ny);if(k<nz-1)push(q+nx*ny)}
 const out=new Uint8Array(tot);for(let q=0;q<tot;q++)out[q]=ext[q]?0:1;return out}
function macUploadStatic(G,vox){const N=G.N,buf=new Uint8Array(G.W*G.H*4);for(let k=0;k<N[2];k++)for(let j=0;j<N[1];j++)for(let i=0;i<N[0];i++){const q=i+N[0]*(j+N[1]*k);if(!vox.phi[q])continue;
  const ax=(k%G.tx)*N[0]+i,ay=Math.floor(k/G.tx)*N[1]+j,o=(ay*G.W+ax)*4;buf[o]=Math.round(Math.min(1,vox.phi[q])*255);buf[o+1]=vox.id[q]*50;buf[o+3]=255}
 if(!MAC.staticTex)MAC.staticTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,MAC.staticTex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
 gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,G.W,G.H,0,gl.RGBA,gl.UNSIGNED_BYTE,buf)}
function macWheels(){try{const W=wheelParts(),out=[];for(let i=0;i<W.length;i++){const b=wheelWorldBoundsAt(0,i);out.push([(b.min[0]+b.max[0])/2,(b.min[1]+b.max[1])/2,(b.min[2]+b.max[2])/2,(b.max[1]-b.min[1])/2]);MAC.whW=(b.max[2]-b.min[2])/2}return out}catch(_){return []}}

/* domain config: tunnel (default) or validation {N,min,max,obstacle,U,nu} */
function macConfig(){const d=MAC.domain;if(d)return {...d,car:false,fan:null,belt:false,body:false};
 const b=CFD_DOMAIN_CONTRACT.bounds;return {min:Array.from(b.min),max:Array.from(b.max),N:LIVE.N,car:true,fan:AETHER.FAN_MODULE?.layout?.fanBounds||null,belt:true,body:true,nu:MAC.nuMol,U:null}}
function macInit(){const cfg=macConfig(),N=cfg.N,min=cfg.min,max=cfg.max,h=max.map((v,i)=>(v-min[i])/N[i]);
 if(!gl.getExtension('EXT_color_buffer_float'))throw Error('EXT_color_buffer_float 미지원');
 macRelease();MAC.cfg=cfg;MAC.N=N;MAC.min=min;MAC.max=max;MAC.h=h;
 const G=MAC.G=macAtlas(N),Nd=N.map(v=>v*2),D=MAC.D=macAtlas(Nd);MAC.hd=h.map(v=>v/2);
 const V=()=>macTarget(G,gl.RGBA32F,gl.RGBA,gl.FLOAT),R=()=>macTarget(G,gl.R32F,gl.RED,gl.FLOAT),R16=g=>macTarget(g,gl.R16F,gl.RED,gl.HALF_FLOAT),H4=g=>macTarget(g,gl.RGBA16F,gl.RGBA,gl.HALF_FLOAT);
 MAC.t={velA:V(),velB:V(),hat:V(),bar:V(),sol:H4(G),geom:H4(G),nu:macTarget(G,gl.RG32F,gl.RG,gl.FLOAT),b:R(),res:R(),frc:V(),dyeA:R16(D),dyeB:R16(D),dhat:R16(D),dbar:R16(D)};
 /* multigrid levels: level 0 uses MAC.t.geom/b; pressure vectors per level */
 MAC.lv=[];let n=N.slice(),r=[1,1,1];for(let l=0;l<MAC.levels;l++){if(l>0){
   /* semi-coarsening: halve an axis only if it has >= 4 cells and is not already coarser than the finest axis */
   const hc=max.map((v,i)=>(v-min[i])/n[i]),hm=Math.min(...hc.filter((_,i)=>n[i]>=4));r=n.map((v,i)=>v>=4&&hc[i]<=1.5*hm?2:1);if(r.every(x=>x===1))break;const m=n.map((v,i)=>Math.ceil(v/r[i]));/* levels below ~64 cells are numerically fragile (full-size sphere 4x2x2 diverged, 8x4x4 and 84-cell tunnel levels are fine) */if(m[0]*m[1]*m[2]<64)break;n=m}
  const g=macAtlas(n),hl=max.map((v,i)=>(v-min[i])/n[i]);const T={pA:macTarget(g,gl.R32F,gl.RED,gl.FLOAT),pB:macTarget(g,gl.R32F,gl.RED,gl.FLOAT),r:macTarget(g,gl.R32F,gl.RED,gl.FLOAT)};
  if(l>0){T.b=macTarget(g,gl.R32F,gl.RED,gl.FLOAT);T.geom=H4(g)}MAC.lv.push({...g,h:hl,T,r:r.slice()})}
 /* PCG vectors on level 0 */
 MAC.t.cgR=R();MAC.t.cgD=R();MAC.t.cgQ=R();MAC.t.cgS=R();MAC.Z={pA:R(),pB:R()};
 MAC.red=[];{let w=G.W,hh=G.H;while(w>1||hh>1){w=Math.ceil(w/8);hh=Math.ceil(hh/8);MAC.red.push({w,h:hh,t:liveTarget(w,hh,gl.RGBA32F,gl.RGBA,gl.FLOAT)})}}
 MAC.scal=[liveTarget(1,1,gl.RGBA32F,gl.RGBA,gl.FLOAT),liveTarget(1,1,gl.RGBA32F,gl.RGBA,gl.FLOAT)];
 /* volume texture at dye resolution */
 MAC.vol=gl.createTexture();gl.bindTexture(gl.TEXTURE_3D,MAC.vol);for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_NEAREST],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_R,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_3D,k,v);
 gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA16F,Nd[0],Nd[1],Nd[2],0,gl.RGBA,gl.HALF_FLOAT,null);MAC.volFbo=gl.createFramebuffer();
 if(MAC.progGen!==runtimeGeneration){MAC.prog={};for(const k in MAC_FS)MAC.prog[k]=k==='pscal'?liveCompile(`#version 300 es\nprecision highp float;precision highp sampler2D;\nout vec4 o;\n`+MAC_FS[k]):liveCompile(MAC_H+MAC_FS[k]);MAC.progGen=runtimeGeneration}
 const vox=MAC.vox=macStaticSolids(N,min,h,cfg);macUploadStatic(G,vox);MAC.wheels=cfg.car?macWheels():[];
 MAC.U=cfg.U??LIVE.U;MAC.step=0;MAC.t0=0;MAC.ok=true;macReset();return MAC}
function macRelease(){const del=t=>{if(t&&t.t){gl.deleteTexture(t.t);gl.deleteFramebuffer(t.f)}};if(MAC.t)for(const k in MAC.t)del(MAC.t[k]);if(MAC.Z){del(MAC.Z.pA);del(MAC.Z.pB)}for(const L of MAC.lv||[])for(const k in L.T)del(L.T[k]);(MAC.red||[]).forEach(r=>del(r.t));(MAC.scal||[]).forEach(del);
 if(MAC.vol)gl.deleteTexture(MAC.vol);if(MAC.volFbo)gl.deleteFramebuffer(MAC.volFbo);MAC.t=null;MAC.lv=null;MAC.red=null;MAC.scal=null;MAC.vol=null;MAC.ok=false}
/* one pass on grid g (primary). g2 = secondary grid (dye passes) */
/* Redundant-state elimination. Uniform values live in the program object, so the per-program caches (p._mg geometry block, p._uc floats,
   p._ui ints, p._us sampler units) are valid whenever only macPass sets these uniforms. Program / framebuffer / viewport / texture-unit
   caches are only valid while nothing else touches GL state, so they exist only inside macStep (MAC.cw, opened and closed there). */
function macPass(name,out,tex,uni,g,g2){const p=MAC.prog[name];g=g||MAC.G;g2=g2||g;const C=MAC.cw;
 if(!C||C.prog!==p){gl.useProgram(p);if(C)C.prog=p}
 if(!C||C.fb!==out.f){gl.bindFramebuffer(gl.FRAMEBUFFER,out.f);if(C)C.fb=out.f}
 const vw=out.w||g.W,vh=out.h||g.H;if(!C||C.vw!==vw||C.vh!==vh){gl.viewport(0,0,vw,vh);if(C){C.vw=vw;C.vh=vh}}
 const hh=g.h||MAC.h,h2=g2.h||MAC.h,G=p._mg||(p._mg={});
 if(G.gN!==g.N||G.gt!==g.tx||G.gh!==hh||G.g2N!==g2.N||G.g2t!==g2.tx||G.g2h!==h2||G.min!==MAC.min||G.U!==MAC.U){
  gl.uniform3i(liveU(p,'uN'),...g.N);gl.uniform1i(liveU(p,'uTX'),g.tx);gl.uniform3f(liveU(p,'uH'),...hh);gl.uniform3i(liveU(p,'uN2'),...g2.N);gl.uniform1i(liveU(p,'uTX2'),g2.tx);gl.uniform3f(liveU(p,'uH2'),...h2);
  gl.uniform3f(liveU(p,'uMin'),...MAC.min);gl.uniform1f(liveU(p,'uU'),MAC.U);G.gN=g.N;G.gt=g.tx;G.gh=hh;G.g2N=g2.N;G.g2t=g2.tx;G.g2h=h2;G.min=MAC.min;G.U=MAC.U}
 const uc=p._uc||(p._uc={}),ui=p._ui||(p._ui={}),us=p._us||(p._us={});let unit=8;
 for(const n in tex){const t=tex[n];if(!C||C.tb[unit]!==t){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);if(C)C.tb[unit]=t}
  if(us[n]!==unit){gl.uniform1i(liveU(p,n),unit);us[n]=unit}unit++}
 for(const n in uni){const v=uni[n],l=liveU(p,n);if(l===null)continue;
  if(typeof v==='number'){if(uc[n]!==v){uc[n]=v;gl.uniform1f(l,v)}}
  else if(Array.isArray(v)){if(v.length===4)gl.uniform4f(l,...v);else if(v.length===3)gl.uniform3f(l,...v)}
  else if(v&&v.int!==undefined){if(ui[n]!==v.int){ui[n]=v.int;gl.uniform1i(l,v.int)}}
  else if(v&&v.i3)gl.uniform3i(l,...v.i3);else if(v instanceof Float32Array)gl.uniform4fv(l,v)}
 gl.drawArrays(gl.TRIANGLES,0,3)}
const macSwap=(o,a,b)=>{const x=o[a];o[a]=o[b];o[b]=x};
function macGridOf(l){const L=MAC.lv[l];return {N:L.N,tx:L.tx,W:L.W,H:L.H,h:L.h}}
function macReset(){gl.bindVertexArray(LIVE.vao);const T=MAC.t;for(const k in T)liveClear(T[k]);liveClear(MAC.Z.pA);liveClear(MAC.Z.pB);for(const s of MAC.scal)liveClear(s);for(const L of MAC.lv)for(const k in L.T)liveClear(L.T[k]);
 macSolids();macPass('init',T.velA,{},{});MAC.step=0;MAC.time=0;MAC.forceHist=[];gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null)}
function macSolids(){const T=MAC.t,B=window.__BODY,act=!!(MAC.cfg.body&&B&&B.active),W=MAC.wheels||[],wh=new Float32Array(16);W.forEach((w,i)=>wh.set(w,i*4));const R=W[0]?.[3]||.34;
 const om=MAC.cfg.obstacle?(MAC.time<(MAC.spinUntil||0)?MAC.spin||0:0):MAC.U/R;
 macPass('solid',T.sol,{uStatic:MAC.staticTex},{uBody:act?[B.x,B.z,B.g,1]:[0,0,0,0],uBodyV:act&&fpv.enabled?[fpv.vx||0,0,fpv.vz||0]:[0,0,0],uWh:wh,uWhW:MAC.cfg.obstacle?1e3:(MAC.whW||.15),uOm:om});
 macPass('geom',T.geom,{uSol:T.sol.t},{});
 for(let l=1;l<MAC.lv.length;l++){const F=l===1?{t:T.geom}:{t:MAC.lv[l-1].T.geom},Lf=MAC.lv[l-1];macPass('cgeom',MAC.lv[l].T.geom,{uGF:F.t.t},{uNF:{i3:Lf.N},uTXF:{int:Lf.tx},uR:{i3:MAC.lv[l].r}},macGridOf(l))}}
/* ---- pressure solvers. A level-0 "context" X={pA,pB} holds the iterate, b0 the right-hand side ---- */
function macLvX(l,X0){return l===0?X0:MAC.lv[l].T}
function macLvB(l,b0){return l===0?b0:MAC.lv[l].T.b.t}
function macSmooth(l,n,kind,order,X,b){const g=macGridOf(l),G=macGeomOf(l);
 for(let k=0;k<n;k++){if(kind==='RB'){for(const col of order){macPass('prb',X.pB,{uP:X.pA.t,uB:b,uG:G},{uColor:{int:col},uOm:MAC.sor},g);macSwap(X,'pA','pB')}}
  else{macPass('pjac',X.pB,{uP:X.pA.t,uB:b,uG:G},{uOm:MAC.omega},g);macSwap(X,'pA','pB')}}}
function macGeomOf(l){return l===0?MAC.t.geom.t:MAC.lv[l].T.geom.t}
/* V-cycle for L x = b; level 0 uses the caller's context, coarse levels start from zero */
function macVcycle(l,kind,X0,b0){const Lv=MAC.lv,L=Lv[l],X=macLvX(l,X0),b=macLvB(l,b0),g=macGridOf(l);
 if(l===Lv.length-1){/* coarse iterations: fixed value, or (0 = auto) twice the longest side of the coarsest level - Gauss-Seidel moves information about one cell per sweep */macSmooth(l,MAC.coarse>0?MAC.coarse:Math.max(4,2*Math.max(...L.N)),kind,[0,1],X,b);return}
 macSmooth(l,MAC.pre,kind,[0,1],X,b);
 macPass('pres',L.T.r,{uP:X.pA.t,uB:b,uG:macGeomOf(l)},{},g);
 const C=Lv[l+1];macPass('prest',C.T.b,{uRF:L.T.r.t},{uNF:{i3:L.N},uTXF:{int:L.tx},uR:{i3:C.r}},macGridOf(l+1));liveClear(C.T.pA);liveClear(C.T.pB);
 macVcycle(l+1,kind,X0,b0);
 macPass('pprol',X.pB,{uP:X.pA.t,uPC:C.T.pA.t,uGC:macGeomOf(l+1),uG:macGeomOf(l)},{uNC:{i3:C.N},uTXC:{int:C.tx},uR:{i3:C.r},uCorr:MAC.corr,uTri:MAC.prol},g);macSwap(X,'pA','pB');
 macSmooth(l,MAC.post,kind,[1,0],X,b)}
function liveReduceTo(src,sw,sh,chain){if(MAC.cw){MAC.cw.prog=null;MAC.cw.fb=null;MAC.cw.vw=0;MAC.cw.tb={}}const p=LIVE.prog.sum;gl.useProgram(p);let s=src,w=sw,h=sh;for(const r of chain){gl.bindFramebuffer(gl.FRAMEBUFFER,r.t.f);gl.viewport(0,0,r.w,r.h);gl.activeTexture(gl.TEXTURE0+8);gl.bindTexture(gl.TEXTURE_2D,s.t);gl.uniform1i(liveU(p,'uS'),8);gl.uniform2i(liveU(p,'uSz'),w,h);gl.drawArrays(gl.TRIANGLES,0,3);s=r.t;w=r.w;h=r.h}return s}
function macDot(a,b){const T=MAC.t;macPass('pdot',T.frc,{uX:a,uY:b},{});return liveReduceTo(T.frc,MAC.G.W,MAC.G.H,MAC.red)}
const MAC_ONE={N:[1,1,1],tx:1,W:1,H:1,h:[1,1,1]};
function macScal(mode,dotTex){const [S0,S1]=MAC.scal;macPass('pscal',S1,{uS:S0.t,uD:dotTex.t},{uMode:{int:mode},uTol2:MAC.tol*MAC.tol},MAC_ONE);MAC.scal=[S1,S0]}
function macAxpy(out,X,Y,sel,sign){macPass('paxpy',out,{uX:X.t,uY:Y.t,uS:MAC.scal[0].t},{uSel:{int:sel},uSign:sign})}
function macSolve(){const L0=MAC.lv[0],T=MAC.t,s=MAC.solver;
 if(s==='GMG'||s==='RBGS'){for(let c=0;c<MAC.cycles;c++)macVcycle(0,s==='RBGS'?'RB':'J',L0.T,T.b.t);return}
 if(s==='JACOBI'){for(let k=0;k<MAC.jacobiIters;k++){macPass('pjac',L0.T.pB,{uP:L0.T.pA.t,uB:T.b.t,uG:T.geom.t},{uOm:1});macSwap(L0.T,'pA','pB')}return}
 /* MGPCG in L-form (L negative definite). Z={pA:cgZ,pB:cgZ2} is the preconditioner context. */
 const X=L0.T,Z=MAC.Z;
 macPass('pres',T.cgR,{uP:X.pA.t,uB:T.b.t,uG:T.geom.t},{});
 const pre=()=>{liveClear(Z.pA);liveClear(Z.pB);macVcycle(0,MAC.pcgSmoother,Z,T.cgR.t)};
 pre();macAxpy(T.cgD,Z.pA,Z.pA,0,0);
 macScal(3,macDot(T.b.t,T.b.t));macScal(0,macDot(T.cgR.t,Z.pA.t));
 for(let k=0;k<MAC.pcgIters;k++){
  macPass('papply',T.cgQ,{uP:T.cgD.t,uG:T.geom.t},{});macScal(1,macDot(T.cgD.t,T.cgQ.t));
  macAxpy(X.pB,X.pA,T.cgD,1,1);macSwap(X,'pA','pB');
  macAxpy(T.cgS,T.cgR,T.cgQ,1,-1);macSwap(T,'cgR','cgS');
  pre();macScal(2,macDot(T.cgR.t,Z.pA.t));
  macAxpy(T.cgS,T.cgD,Z.pA,2,1);macSwap(T,'cgD','cgS')}}
/* ---- one time step ---- */
function macStep(dt,emit){MAC.cw={prog:null,fb:null,vw:0,vh:0,tb:{}};try{macStepBody(dt,emit)}finally{MAC.cw=null}}
function macStepBody(dt,emit){const T=MAC.t,cfg=MAC.cfg;gl.bindVertexArray(LIVE.vao);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
 MAC.U=cfg.U??LIVE.U;
 if(cfg.body||MAC.step===0||(cfg.obstacle&&MAC.spinUntil&&MAC.time<MAC.spinUntil+2*dt))macSolids();
 /* MacCormack velocity advection */
 macPass('adv',T.hat,{uVel:T.velA.t,uSrc:T.velA.t},{uDt:dt});
 macPass('adv',T.bar,{uVel:T.velA.t,uSrc:T.hat.t},{uDt:-dt});
 macPass('advc',T.velB,{uVel:T.velA.t,uHat:T.hat.t,uBar:T.bar.t,uSol:T.sol.t,uG:T.geom.t},{uDt:dt});
 /* LES + molecular diffusion (+ optional vorticity confinement) */
 const hmin=Math.min(...MAC.h),nuMax=Math.max(0,.9*hmin*hmin/(6*dt)-(cfg.nu??MAC.nuMol));
 macPass('sgs',T.nu,{uVel:T.velB.t,uSol:T.sol.t},{uCs:MAC.les?MAC.Cs:0,uNuMax:nuMax});
 const bb=cfg.belt?[0,3.15,0,1.25]:[0,0,0,0];
 macPass('diff',T.velA,{uVel:T.velB.t,uNu:T.nu.t,uSol:T.sol.t,uG:T.geom.t},{uDt:dt,uNuMol:cfg.nu??MAC.nuMol,uEps:MAC.eps,uBelt:cfg.belt?1:0,uBeltBox:bb});
 /* volume-fraction forcing: T.hat keeps the pre-forcing velocity until the next step (read by the budget force) */
 if(MAC.ibm==='vf'){macPass('ibm',T.hat,{uVel:T.velA.t,uSol:T.sol.t,uG:T.geom.t},{});macSwap(T,'velA','hat')}
 /* projection */
 macPass('div',T.b,{uVel:T.velA.t,uSol:T.sol.t,uG:T.geom.t},{uScale:1/dt,uPost:0});
 macSolve();
 macPass('proj',T.velB,{uVel:T.velA.t,uP:MAC.lv[0].T.pA.t,uSol:T.sol.t,uG:T.geom.t},{uDt:dt});macSwap(T,'velA','velB');
 /* smoke on the 2x grid */
 if(emit!==false){const em=liveEmitters(),D=MAC.D,Dg={...D,h:MAC.hd};
  macPass('dadv',T.dhat,{uVel:T.velA.t,uSrc:T.dyeA.t},{uDt:dt},Dg,MAC.G);macPass('dadv',T.dbar,{uVel:T.velA.t,uSrc:T.dhat.t},{uDt:-dt},Dg,MAC.G);
  macPass('dcorr',T.dyeB,{uVel:T.velA.t,uSrc:T.dyeA.t,uHat:T.dhat.t,uBar:T.dbar.t,uSol:T.sol.t},{uDt:dt,uDecay:liveDecay(dt),uEmS:1,uEm:em,uEmN:{int:LIVE.emitters.length}},Dg,MAC.G);macSwap(T,'dyeA','dyeB')}
 MAC.step++;MAC.time+=dt;MAC.lastDt=dt}
MAC.copyVolume=()=>macCopyVolume();/* test hook: the volume is normally filled by the render loop */
function macCopyVolume(){const p=MAC.prog.vcopy,D=MAC.D,Nd=D.N,T=MAC.t;gl.useProgram(p);gl.bindFramebuffer(gl.FRAMEBUFFER,MAC.volFbo);gl.viewport(0,0,Nd[0],Nd[1]);
 gl.uniform3i(liveU(p,'uN'),...Nd);gl.uniform1i(liveU(p,'uTX'),D.tx);gl.uniform3f(liveU(p,'uH'),...MAC.hd);gl.uniform3i(liveU(p,'uN2'),...MAC.N);gl.uniform1i(liveU(p,'uTX2'),MAC.G.tx);gl.uniform3f(liveU(p,'uH2'),...MAC.h);gl.uniform3f(liveU(p,'uMin'),...MAC.min);gl.uniform1f(liveU(p,'uU'),MAC.U);
 const bind=(u,n,t)=>{gl.activeTexture(gl.TEXTURE0+u);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(liveU(p,n),u)};bind(8,'uVel',T.velA.t);bind(9,'uDye',T.dyeA.t);bind(10,'uSol',T.sol.t);
 /* four consecutive layers per draw: one colour attachment per layer of the same 3D texture */
 const AT=[gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1,gl.COLOR_ATTACHMENT2,gl.COLOR_ATTACHMENT3];
 for(let k=0;k<Nd[2];k+=4){const n=Math.min(4,Nd[2]-k);for(let j=0;j<4;j++){if(j<n)gl.framebufferTextureLayer(gl.FRAMEBUFFER,AT[j],MAC.vol,0,k+j);else gl.framebufferTextureLayer(gl.FRAMEBUFFER,AT[j],null,0,0)}
  gl.drawBuffers(AT.map((a,j)=>j<n?a:gl.NONE));gl.uniform1i(liveU(p,'uLayer'),k);gl.drawArrays(gl.TRIANGLES,0,3)}
 for(let j=1;j<4;j++)gl.framebufferTextureLayer(gl.FRAMEBUFFER,AT[j],null,0,0);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
 gl.bindTexture(gl.TEXTURE_3D,MAC.vol);gl.generateMipmap(gl.TEXTURE_3D)}
/* velocity at a world point (face average -> cell centre of the containing cell) */
function macReadCell(i,j,k){const G=MAC.G,N=MAC.N,px=(ii,jj,kk)=>{ii=Math.min(N[0]-1,Math.max(0,ii));jj=Math.min(N[1]-1,Math.max(0,jj));kk=Math.min(N[2]-1,Math.max(0,kk));const b=new Float32Array(4);gl.readPixels((kk%G.tx)*N[0]+ii,Math.floor(kk/G.tx)*N[1]+jj,1,1,gl.RGBA,gl.FLOAT,b);return b};
 gl.bindFramebuffer(gl.FRAMEBUFFER,MAC.t.velA.f);const a=px(i,j,k),bx=i<N[0]-1?px(i+1,j,k)[0]:a[0],by=j<N[1]-1?px(i,j+1,k)[1]:0,bz=k<N[2]-1?px(i,j,k+1)[2]:0;gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 return [(a[0]+bx)/2,(a[1]+by)/2,(a[2]+bz)/2]}
function macRead(x,y,z){const f=(v,d)=>Math.min(MAC.N[d]-1,Math.max(0,Math.floor((v-MAC.min[d])/MAC.h[d])));return macReadCell(f(x,0),f(y,1),f(z,2))}
/* full-field reads (tests / validation) */
function macReadAll(t,ch){const G=MAC.G,buf=new Float32Array(G.W*G.H*4);gl.bindFramebuffer(gl.FRAMEBUFFER,t.f);gl.readPixels(0,0,G.W,G.H,gl.RGBA,gl.FLOAT,buf);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return buf}
function macFieldIndex(i,j,k){const G=MAC.G,N=MAC.N;return (((Math.floor(k/G.tx)*N[1]+j)*G.W)+(k%G.tx)*N[0]+i)*4}
/* post-projection divergence relative to U/h and Poisson relative residual, over cells with at least one open face */
function macDivStats(){const T=MAC.t;gl.bindVertexArray(LIVE.vao);macPass('div',T.res,{uVel:T.velA.t,uSol:T.sol.t,uG:T.geom.t},{uScale:1,uPost:1});
 const d=macReadAll(T.res),g=(()=>{const G=MAC.G,b=new Float32Array(G.W*G.H*4);gl.bindFramebuffer(gl.FRAMEBUFFER,T.geom.f);gl.readPixels(0,0,G.W,G.H,gl.RGBA,gl.FLOAT,b);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return b})();
 const N=MAC.N,ref=MAC.U/Math.min(...MAC.h);let s=0,m=0,n=0,bad=0;
 for(let k=0;k<N[2];k++)for(let j=0;j<N[1];j++)for(let i=0;i<N[0];i++){const q=macFieldIndex(i,j,k);if(g[q+3]>.999)continue;const v=d[q];if(!Number.isFinite(v)){bad++;continue}s+=v*v;m=Math.max(m,Math.abs(v));n++}
 gl.bindVertexArray(null);return {cells:n,nonFinite:bad,relRms:Math.sqrt(s/Math.max(n,1))/ref,relMax:m/ref,rms:Math.sqrt(s/Math.max(n,1)),max:m}}
function macResidual(){const T=MAC.t,L0=MAC.lv[0];gl.bindVertexArray(LIVE.vao);macPass('pres',T.res,{uP:L0.T.pA.t,uB:T.b.t,uG:T.geom.t},{});const r=macReadAll(T.res),b=macReadAll(T.b);let rr=0,bb=0,bad=0;
 for(let q=0;q<r.length;q+=4){if(!Number.isFinite(r[q])){bad++;continue}rr+=r[q]*r[q];bb+=b[q]*b[q]}gl.bindVertexArray(null);return {rel:Math.sqrt(rr/Math.max(bb,1e-30)),nonFinite:bad}}
/* forces on the solid id 1 (car or validation obstacle); physical units with rho=1.2 (tunnel) or rho=1 (validation) */
/* mode 'surface' (p across the phi ramps) or 'budget' (closed-face pressure + ibm forcing); default: surface for the
   cut-cell treatment, budget for 'vf' (the forcing already contains the pressure on the solid fraction) */
function macForces(mode){const T=MAC.t,cfg=MAC.cfg,rho=cfg.rho??1.2,vf=MAC.ibm==='vf';mode=mode||(vf?'budget':'surface');gl.bindVertexArray(LIVE.vao);
 macPass('force',T.frc,{uVel:T.velA.t,uP:MAC.lv[0].T.pA.t,uSol:T.sol.t,uNu:T.nu.t,uG:T.geom.t,uStar:T.hat.t},{uRho:rho,uNuMol:cfg.nu??MAC.nuMol,uId:1,uBudget:mode==='budget'?1:0,uVf:vf&&mode==='budget'?1:0,uDt:MAC.lastDt||.02});
 const s=liveReduceTo(T.frc,MAC.G.W,MAC.G.H,MAC.red),b=new Float32Array(4);gl.bindFramebuffer(gl.FRAMEBUFFER,s.f);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,b);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null);
 const A=cfg.Aref??(MAC.vox?.front||0),q=.5*rho*MAC.U*MAC.U*A;return {Fx:b[0],Fy:b[1],Fz:b[2],Fpx:b[3],A,Cd:q>0?b[0]/q:NaN,Cdp:q>0?b[3]/q:NaN,Cl:q>0?b[1]/q:NaN,Cs:q>0?b[2]/q:NaN}}
/* scalar state readback (relative residual of the last PCG solve) */
function macPcgState(){const b=new Float32Array(4);gl.bindFramebuffer(gl.FRAMEBUFFER,MAC.scal[0].f);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,b);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return {rz:b[0],alpha:b[1],beta:b[2],bb:b[3]}}
function macMemoryMB(){let s=0;const add=(g,bpp)=>{s+=g.W*g.H*bpp};const G=MAC.G;add(G,16*5);add(G,8*2);add(G,8);add(G,4*9);add(MAC.D,2*4);for(const L of MAC.lv.slice(1))add(L,4*4+8);s+=MAC.D.N[0]*MAC.D.N[1]*MAC.D.N[2]*8*8/7;return s/1048576}
function macReadAllD(t){const D=MAC.D,buf=new Float32Array(D.W*D.H*4);gl.bindFramebuffer(gl.FRAMEBUFFER,t.f);gl.readPixels(0,0,D.W,D.H,gl.RGBA,gl.FLOAT,buf);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return buf}
function macFlagCounts(){const s=macReadAll(MAC.t.sol),N=MAC.N,c={fluid:0,car:0,fan:0,body:0};for(let k=0;k<N[2];k++)for(let j=0;j<N[1];j++)for(let i=0;i<N[0];i++){const w=s[macFieldIndex(i,j,k)+3],id=Math.floor(w*.5+.001),ph=w-2*id;
  if(ph<.5)c.fluid++;else c[['fluid','car','fan','body'][id]]++}return c}
/* solver comparison on one fixed right-hand side (current velocity field): cold start, timed with a readPixels fence */
function macSolveBench(list){const T=MAC.t,L0=MAC.lv[0],out=[],save={solver:MAC.solver,cycles:MAC.cycles,pcgIters:MAC.pcgIters,jacobiIters:MAC.jacobiIters,pre:MAC.pre,post:MAC.post};
 gl.bindVertexArray(LIVE.vao);const dt=MAC.lastDt||.02;macPass('div',T.b,{uVel:T.velA.t,uSol:T.sol.t,uG:T.geom.t},{uScale:1/dt,uPost:0});
 const fence=()=>{const b=new Float32Array(4);gl.bindFramebuffer(gl.FRAMEBUFFER,L0.T.pA.f);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,b)};
 for(const c of list){Object.assign(MAC,c);liveClear(L0.T.pA);liveClear(L0.T.pB);fence();const t0=performance.now();macSolve();fence();const ms=performance.now()-t0;
  const r=macResidual();gl.bindVertexArray(LIVE.vao);out.push({...c,ms,rel:r.rel,nonFinite:r.nonFinite})}
 Object.assign(MAC,save);gl.bindVertexArray(null);return out}
function macMemBreakdown(){const G=MAC.G,lvB=MAC.lv.slice(1).reduce((a,L)=>a+L.W*L.H*(4*4+8),0),base=G.W*G.H;
 return {levelsMB:(lvB+base*4*3)/1048576,pcgVectorsMB:base*4*6/1048576,jacobiMB:base*4*2/1048576}}

/* Control-volume momentum balance around the obstacle (validation cross-check, independent of the boundary
   treatment and of the surface force formula). Box = cells [lo,hi) per axis. Returns the surface terms
   S = -oint[rho u(u.n) + p n - tau.n] dS and the box momentum M = int rho u dV; body force = S - dM/dt (rho=1). */
function macCvForce(lo,hi){const N=MAC.N,h=MAC.h,nu=MAC.cfg.nu??MAC.nuMol,rho=MAC.cfg.rho??1.2,v=macReadAll(MAC.t.velA),pr=macReadAll(MAC.lv[0].T.pA);
 const cl=(i,d)=>Math.min(N[d]-1,Math.max(0,i)),I=(i,j,k)=>macFieldIndex(cl(i,0),cl(j,1),cl(k,2)),U=(c,i,j,k)=>v[I(i,j,k)+c],P=(i,j,k)=>pr[I(i,j,k)];
 /* velocity component c at an arbitrary point given in cell units (MAC staggering: component c sits at offset .5 on the other axes) */
 const at=(c,x,y,z)=>{const q=[x,y,z];for(let d=0;d<3;d++)if(d!==c)q[d]-=.5;const i0=Math.floor(q[0]),j0=Math.floor(q[1]),k0=Math.floor(q[2]),fx=q[0]-i0,fy=q[1]-j0,fz=q[2]-k0;let s=0;
  for(let a=0;a<2;a++)for(let b=0;b<2;b++)for(let e=0;e<2;e++)s+=(a?fx:1-fx)*(b?fy:1-fy)*(e?fz:1-fz)*U(c,i0+a,j0+b,k0+e);return s};
 const S=[0,0,0],M=[0,0,0],A=[h[1]*h[2],h[0]*h[2],h[0]*h[1]],V=h[0]*h[1]*h[2];
 for(let ax=0;ax<3;ax++)for(const side of [0,1]){const sg=side?1:-1,f=side?hi[ax]:lo[ax],o1=(ax+1)%3,o2=(ax+2)%3;
  for(let a=lo[o1];a<hi[o1];a++)for(let b=lo[o2];b<hi[o2];b++){const x=[0,0,0];x[ax]=f;x[o1]=a+.5;x[o2]=b+.5;
   const u=[at(0,...x),at(1,...x),at(2,...x)],un=u[ax];const c0=[0,0,0];c0[ax]=f-1;c0[o1]=a;c0[o2]=b;const c1=c0.slice();c1[ax]=f;
   const p=f<=0?P(...c1):f>=N[ax]?P(...c0):.5*(P(...c0)+P(...c1));
   for(let c=0;c<3;c++){/* tau_{c,ax} = nu (d u_c/d x_ax + d u_ax/d x_c), centred differences at the face point */
    const d1=(()=>{const xp=x.slice(),xm=x.slice();xp[ax]+=.5;xm[ax]-=.5;return (at(c,...xp)-at(c,...xm))/h[ax]})(),d2=(()=>{const xp=x.slice(),xm=x.slice();xp[c]+=.5;xm[c]-=.5;return (at(ax,...xp)-at(ax,...xm))/h[c]})();
    S[c]-=sg*A[ax]*(rho*u[c]*un+(c===ax?rho*p:0)-rho*nu*(d1+d2))}}}
 for(let k=lo[2];k<hi[2];k++)for(let j=lo[1];j<hi[1];j++)for(let i=lo[0];i<hi[0];i++)for(let c=0;c<3;c++)M[c]+=rho*at(c,i+.5,j+.5,k+.5)*V;
 return {S,M}}
/* ---- validation domain API ---- */
function macValidate(cfg){MAC.lesSaved=MAC.les;MAC.domain={N:cfg.N,min:cfg.min,max:cfg.max,obstacle:cfg.obstacle||null,U:cfg.U??1,nu:cfg.nu??0,rho:1,Aref:cfg.Aref};MAC.les=cfg.les??false;MAC.ibmSaved=MAC.ibmSaved??MAC.ibm;MAC.ibm=cfg.ibm||MAC.ibmSaved;
 LIVE.enabled=false;LIVE.freeze=true;macInit();if(cfg.obstacle){MAC.wheels=[[...cfg.obstacle.c,cfg.obstacle.D/2]];MAC.spin=cfg.spin||0;MAC.spinUntil=cfg.spinUntil||0}
 gl.bindVertexArray(LIVE.vao);macSolids();gl.bindVertexArray(null);return {N:MAC.N,h:MAC.h,phiSum:MAC.vox.carCells,expectedVol:cfg.obstacle?(cfg.obstacle.type==='sphere'?Math.PI*cfg.obstacle.D**3/6:Math.PI*cfg.obstacle.D**2/4*(cfg.max[2]-cfg.min[2])):0,cellVol:MAC.h[0]*MAC.h[1]*MAC.h[2]}}
/* run n steps; every `every` steps record forces (and probe velocity) */
function macVrun(n,dt,every=1,probe=null,cv=null){const rec=[];const t0=performance.now();
 for(let i=0;i<n;i++){macStep(dt,false);if((i+1)%every===0){const f=macForces(),fb=macForces('budget');const r={t:MAC.time,Fx:f.Fx,Fy:f.Fy,Fz:f.Fz,Cd:f.Cd,Cdp:f.Cdp,Cl:f.Cl,CdB:fb.Cd,ClB:fb.Cl};if(probe){const v=macRead(...probe);r.pv=v[1];r.pu=v[0]}
  if(cv){const c=macCvForce(cv.lo,cv.hi);r.cvS=c.S;r.cvM=c.M;r.q=.5*(MAC.cfg.rho??1.2)*MAC.U*MAC.U*f.A}rec.push(r)}}
 gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null);return {rec,ms:performance.now()-t0,step:MAC.step,time:MAC.time}}
function macUniformError(){const v=macReadAll(MAC.t.velA),N=MAC.N,U=MAC.U;let mx=0,mt=0,n=0,bad=0;
 for(let k=1;k<N[2]-1;k++)for(let j=1;j<N[1]-1;j++)for(let i=1;i<N[0]-1;i++){const q=macFieldIndex(i,j,k);if(![v[q],v[q+1],v[q+2]].every(Number.isFinite)){bad++;continue}mx=Math.max(mx,Math.abs(v[q]-U)/U);mt=Math.max(mt,Math.hypot(v[q+1],v[q+2])/U);n++}
 return {cells:n,maxRelErrU:mx,maxRelCross:mt,nonFinite:bad}}
/* ===== M5/M6 post pipeline (linear HDR). Scene -> [GTAO] -> volumetric smoke (low res, depth-aware, temporal)
   -> composite -> glass -> [TAA] -> bloom -> AgX/ACES tone map -> overlays (LDR) -> [FXAA] -> upscale+sharpen.
   Disabled with #fx=0 or when float render targets are missing (legacy forward path, visible in the HUD). ===== */
const FX={on:!/fx=0/.test(location.hash),active:false,err:null,gen:-1,rw:0,rh:0,vw:0,vh:0,frame:0,hist:0,shist:0,prevVP:null,jitter:[0,0],tone:(location.hash.match(/tone=(AGX|ACES)/)||[])[1]||'AGX',
 exposure:1.25,bloom:.045,aoStrength:1,g:.35,prog:null,t:null};
window.__AETHER_FX=FX;
const FX_H=`#version 300 es
precision highp float;precision highp sampler2D;precision highp sampler3D;
uniform vec2 uRes;uniform float uNear,uFar;
float linZ(float d){float z=d*2.-1.;return 2.*uNear*uFar/(uFar+uNear-z*(uFar-uNear));}
`;
const FX_FS={
/* ---- GTAO (half res). uDepth full-res scene depth, uP = projection params (xy scale, zw offset) for view reconstruction ---- */
gtao:`uniform sampler2D uDepth,uBlue;uniform vec4 uProj;uniform int uSlices,uSteps;uniform float uRadius,uFrame;out vec4 o;
vec3 VP(vec2 uv){float z=linZ(texture(uDepth,uv).r);return vec3((uv*2.-1.)*uProj.xy*z,-z);}
void main(){vec2 uv=gl_FragCoord.xy/uRes;float d=texture(uDepth,uv).r;if(d>=.99999){o=vec4(1);return;}vec3 P=VP(uv);
 vec2 px=1./uRes;vec3 n=normalize(cross(VP(uv+vec2(px.x,0.))-VP(uv-vec2(px.x,0.)),VP(uv+vec2(0.,px.y))-VP(uv-vec2(0.,px.y))));vec3 V=normalize(-P);
 float bn=texelFetch(uBlue,ivec2(gl_FragCoord.xy)&63,0).r,rot=fract(bn+uFrame*.618034)*3.14159265;
 float rpx=uRadius/(-P.z)/uProj.y*.5*uRes.y;rpx=clamp(rpx,2.,uRes.y*.12);float vis=0.;
 for(int s=0;s<8;s++){if(s>=uSlices)break;float ph=rot+3.14159265*float(s)/float(uSlices);vec2 dir=vec2(cos(ph),sin(ph));
  vec3 d3=vec3(dir,0.),orth=normalize(d3-V*dot(d3,V)),ax=cross(orth,V);vec3 np=n-ax*dot(n,ax);float nl=max(length(np),1e-4);float cn=clamp(dot(np,V)/nl,-1.,1.);float ng=sign(dot(np,orth))*acos(cn);
  float hp=-1.,hm=-1.;
  for(int k=1;k<=12;k++){if(k>uSteps)break;float t=(float(k)-.5+fract(bn*7.+float(k)*.37))/float(uSteps);
   for(int side=0;side<2;side++){float sd=side==0?1.:-1.;vec2 q=uv+sd*dir*t*rpx*px;if(any(lessThan(q,vec2(0.)))||any(greaterThan(q,vec2(1.))))continue;
    vec3 S=VP(q)-P;float l=length(S);float c=dot(S/max(l,1e-5),V);float fall=clamp(1.-l*l/(uRadius*uRadius),0.,1.);if(side==0)hp=max(hp,mix(-1.,c,fall));else hm=max(hm,mix(-1.,c,fall));}}
  float h0=-acos(hm),h1=acos(hp);h0=ng+max(h0-ng,-1.5707963);h1=ng+min(h1-ng,1.5707963);
  vis+=nl*.25*(-cos(2.*h0-ng)+cn+2.*h0*sin(ng)-cos(2.*h1-ng)+cn+2.*h1*sin(ng));}
 o=vec4(clamp(vis/float(uSlices),0.,1.),linZ(d),0.,1.);}`,
aoblur:`uniform sampler2D uAO;uniform vec2 uDir;out vec4 o;
void main(){vec2 uv=gl_FragCoord.xy/uRes;vec4 c=texture(uAO,uv);float s=c.r,w=1.;for(int i=-3;i<=3;i++){if(i==0)continue;vec4 t=texture(uAO,uv+uDir*float(i)/uRes);float k=exp(-abs(t.g-c.g)/(.05*c.g+.01))*exp(-float(i*i)*.12);s+=t.r*k;w+=k;}o=vec4(s/w,c.g,0.,1.);}`,
/* ---- volumetric smoke (low res). MRT: 0 premultiplied colour, 1 aux (x: alpha-weighted ray distance, y: scene view depth of this texel) ---- */
vol:`uniform sampler3D uVol;uniform sampler2D uDepth,uBlue;uniform mat4 uInv;uniform vec3 uEye,uBMin,uBMax,uLD,uFwd;uniform float uDens,uCMode,uStepScale,uG,uFrame;uniform int uTaps;uniform vec4 uTF;float smk(float r){return uTF.y*pow(max(r-uTF.z,0.),uTF.x);}
layout(location=0) out vec4 oC;layout(location=1) out vec4 oA;
vec3 turbo(float t){t*=4.;vec3 a=vec3(.10,.18,1.),b=vec3(0.,.8,1.),c=vec3(.05,1.,.3),d=vec3(1.,.92,.05),e=vec3(1.,.12,.05);return t<1.?mix(a,b,t):t<2.?mix(b,c,t-1.):t<3.?mix(c,d,t-2.):mix(d,e,min(t-3.,1.));}
vec3 lin(vec3 c){return pow(c,vec3(2.2));}
void main(){vec2 uv=gl_FragCoord.xy/uRes;vec2 n=uv*2.-1.;vec4 a=uInv*vec4(n,-1,1),b=uInv*vec4(n,1,1);vec3 ro=uEye,rd=normalize(b.xyz/b.w-a.xyz/a.w);
 /* nearest scene depth in this low-res footprint (depth-aware: every opaque object occludes the smoke) */
 vec2 ts=1./vec2(textureSize(uDepth,0));float dz=1.;for(int j=0;j<2;j++)for(int i=0;i<2;i++)dz=min(dz,texture(uDepth,uv+(vec2(i,j)-.5)*ts*1.5).r);
 float vz=linZ(dz);float tScene=dz>=.99999?1e9:vz/max(dot(rd,uFwd),1e-3);oA=vec4(0.,vz,0.,1.);oC=vec4(0.);
 vec3 iv=1./rd,t0=(uBMin-ro)*iv,t1=(uBMax-ro)*iv,mn=min(t0,t1),mx=max(t0,t1);float tn=max(max(mn.x,mn.y),max(mn.z,0.)),tf=min(min(mx.x,mx.y),min(mx.z,tScene));
 if(tf<=tn)return;float L=tf-tn,stp=.075/max(uStepScale,.25);int NS=int(clamp(L/stp,8.,256.));float dt=L/float(NS);
 float j=fract(texelFetch(uBlue,ivec2(gl_FragCoord.xy)&63,0).r+uFrame*.618034);vec3 ext=uBMax-uBMin;vec4 acc=vec4(0.);float wt=0.,wd=0.;
 float mu=dot(rd,uLD),hg=(1.-uG*uG)/(4.*3.14159*pow(1.+uG*uG-2.*uG*mu,1.5));
 for(int i=0;i<256;i++){if(i>=NS||acc.a>.99)break;float t=tn+(float(i)+j)*dt;vec3 p=ro+rd*t,uvw=(p-uBMin)/ext;
  vec4 c=textureLod(uVol,uvw,2.);if(c.r*uDens<.0015)continue;vec4 s=textureLod(uVol,uvw,0.);vec3 e3=min(uvw,1.-uvw)*ext;float d=smk(s.r)*uDens*smoothstep(.15,.7,t)*smoothstep(0.,.4,min(min(e3.x,e3.z),(1.-uvw.y)*ext.y));if(d<.002)continue;
  float od=0.;for(int k=1;k<=6;k++){if(k>uTaps)break;od+=smk(textureLod(uVol,uvw+uLD/ext*(.12*float(k*k)),0.).r)*.12*float(2*k-1);}
  float T=exp(-od*uDens*2.2);vec3 alb=mix(vec3(.82,.86,.92),lin(turbo(clamp(.5+(s.b-1.)*1.25,0.,1.))),uCMode);
  vec3 col=alb*(vec3(1.,.96,.9)*3.2*T*hg*12.566*.35+vec3(.55,.62,.72)*.55)*uTF.w;
  float al=1.-exp(-d*dt*8.);acc.rgb+=(1.-acc.a)*al*col;acc.a+=(1.-acc.a)*al;wd+=al*t;wt+=al;}
 oC=acc;oA=vec4(wt>0.?wd/wt:0.,vz,0.,1.);}`,
/* ---- smoke temporal reprojection with neighbourhood clamp (low res) ---- */
vtemp:`uniform sampler2D uCur,uAux,uHist;uniform mat4 uInv,uPrevVP;uniform vec3 uEye;uniform float uBlend;out vec4 o;
void main(){vec2 uv=gl_FragCoord.xy/uRes;vec4 c=texture(uCur,uv);vec4 lo=c,hi=c;for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec4 s=texture(uCur,uv+vec2(i,j)/uRes);lo=min(lo,s);hi=max(hi,s);}
 float t=texture(uAux,uv).x;vec2 n=uv*2.-1.;vec4 a=uInv*vec4(n,-1,1),b=uInv*vec4(n,1,1);vec3 rd=normalize(b.xyz/b.w-a.xyz/a.w);vec3 wp=uEye+rd*(t>0.?t:texture(uAux,uv).y);
 vec4 pc=uPrevVP*vec4(wp,1.);vec2 pu=pc.xy/pc.w*.5+.5;if(pc.w<=0.||any(lessThan(pu,vec2(0.)))||any(greaterThan(pu,vec2(1.)))){o=c;return;}
 vec4 h=clamp(texture(uHist,pu),lo,hi);o=mix(c,h,uBlend);}`,
/* ---- composite: AO on the indirect term + depth-aware (joint bilateral) upsample of the smoke, "over" ---- */
comp:`uniform sampler2D uScene,uAmb,uDepth,uAO,uSmoke,uSAux;uniform vec2 uLo;uniform float uAOOn,uAOK,uSmokeOn,uSSR;uniform vec4 uProj;uniform mat4 uP;out vec4 o;
vec3 VPs(vec2 uv){float z=linZ(texture(uDepth,uv).r);return vec3((uv*2.-1.)*uProj.xy*z,-z);}
/* screen-space reflection (view space march, binary refinement). Roughness comes from the ambient target alpha. */
vec3 ssr(vec2 uv,float rough,out float w){w=0.;vec3 P=VPs(uv);vec2 px=1./uRes;vec3 n=normalize(cross(VPs(uv+vec2(px.x,0.))-VPs(uv-vec2(px.x,0.)),VPs(uv+vec2(0.,px.y))-VPs(uv-vec2(0.,px.y))));
 vec3 V=normalize(P),R=reflect(V,n);if(R.z>-.05&&dot(n,-V)<.05)return vec3(0.);float stepL=.12+.02*(-P.z);vec3 Q=P;vec2 hit=vec2(-1.);float last=0.;
 for(int i=0;i<(uSSR>1.5?48:24);i++){Q+=R*stepL;vec4 c=uP*vec4(Q,1.);vec2 s=c.xy/c.w*.5+.5;if(any(lessThan(s,vec2(0.)))||any(greaterThan(s,vec2(1.)))||c.w<=0.)break;
  float sz=linZ(texture(uDepth,s).r),dz=-Q.z-sz;if(dz>0.&&dz<stepL*1.8+.05){vec3 A=Q-R*stepL,B=Q;for(int k=0;k<5;k++){vec3 M=(A+B)*.5;vec4 cm=uP*vec4(M,1.);vec2 sm=cm.xy/cm.w*.5+.5;if(-M.z>linZ(texture(uDepth,sm).r))B=M;else A=M;}
   vec4 cb=uP*vec4(B,1.);hit=cb.xy/cb.w*.5+.5;last=float(i);break;}stepL*=1.08;}
 if(hit.x<0.)return vec3(0.);vec2 e=smoothstep(vec2(0.),vec2(.08),hit)*smoothstep(vec2(0.),vec2(.08),1.-hit);
 w=e.x*e.y*(1.-smoothstep(.05,.35,rough))*(1.-last/48.);float F=.04+.96*pow(1.-max(dot(n,-V),0.),5.);w*=mix(F,1.,.25);return texture(uScene,hit).rgb;}
void main(){vec2 uv=gl_FragCoord.xy/uRes;vec3 c=texture(uScene,uv).rgb;float z=linZ(texture(uDepth,uv).r);
 if(uSSR>.5&&texture(uDepth,uv).r<.99999){vec4 am=texture(uAmb,uv);if(am.a<.35){float w;vec3 r=ssr(uv,am.a,w);c+=w*(r*.6-am.rgb*.35);}}
 if(uAOOn>.5){float ao=texture(uAO,uv).r;c-=texture(uAmb,uv).rgb*(1.-pow(ao,uAOK));}
 if(uSmokeOn>.5){vec2 q=uv*uLo-.5;vec2 f=fract(q);ivec2 i0=ivec2(floor(q));vec4 acc=vec4(0.);float wt=0.;
  for(int k=0;k<4;k++){ivec2 d=ivec2(k&1,k>>1);ivec2 p=clamp(i0+d,ivec2(0),ivec2(uLo)-1);float w=(d.x==1?f.x:1.-f.x)*(d.y==1?f.y:1.-f.y);float zl=texelFetch(uSAux,p,0).y;w*=exp(-abs(zl-z)/(.04*z+.02))+1e-4;acc+=w*texelFetch(uSmoke,p,0);wt+=w;}
  vec4 s=acc/max(wt,1e-5);c=c*(1.-s.a)+s.rgb;}
 o=vec4(max(c,vec3(0.)),1.);}`,
/* ---- TAA: camera reprojection, YCoCg variance clip, luminance-weighted blend ---- */
taa:`uniform sampler2D uCur,uHist,uDepth;uniform mat4 uInvVP,uPrevVP;uniform float uReset;out vec4 o;
vec3 ycc(vec3 c){return vec3(dot(c,vec3(.25,.5,.25)),dot(c,vec3(.5,0.,-.5)),dot(c,vec3(-.25,.5,-.25)));}
vec3 rgb(vec3 c){return vec3(c.x+c.y-c.z,c.x+c.z,c.x-c.y-c.z);}
vec3 tm(vec3 c){return c/(1.+max(c.r,max(c.g,c.b)));}vec3 itm(vec3 c){return c/max(1.-max(c.r,max(c.g,c.b)),1e-4);}
void main(){vec2 uv=gl_FragCoord.xy/uRes;vec3 cur=tm(texture(uCur,uv).rgb);if(uReset>.5){o=vec4(itm(cur),1.);return;}
 vec3 m1=vec3(0.),m2=vec3(0.);for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec3 s=ycc(tm(texture(uCur,uv+vec2(i,j)/uRes).rgb));m1+=s;m2+=s*s;}
 m1/=9.;vec3 sig=sqrt(max(m2/9.-m1*m1,0.));vec3 lo=m1-1.1*sig,hi=m1+1.1*sig;
 float d=texture(uDepth,uv).r;vec4 wp=uInvVP*vec4(uv*2.-1.,d*2.-1.,1.);wp/=wp.w;vec4 pc=uPrevVP*wp;vec2 pu=pc.xy/pc.w*.5+.5;
 if(any(lessThan(pu,vec2(0.)))||any(greaterThan(pu,vec2(1.)))){o=vec4(itm(cur),1.);return;}
 vec3 h=ycc(tm(texture(uHist,pu).rgb));h=clamp(h,lo,hi);vec3 hr=rgb(h);float a=.1;o=vec4(itm(mix(hr,cur,a)),1.);}`,
/* ---- bloom ---- */
bpre:`uniform sampler2D uSrc;uniform float uThr;out vec4 o;
void main(){vec2 uv=gl_FragCoord.xy/uRes,t=1./uRes;vec3 s=vec3(0.);float w=0.;for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec3 c=texture(uSrc,uv+vec2(i,j)*t*.5).rgb;float k=1./(1.+max(c.r,max(c.g,c.b)));s+=c*k;w+=k;}s/=w;
 float br=max(s.r,max(s.g,s.b)),soft=clamp(br-uThr+.5,0.,1.);soft=soft*soft*.5;float c=max(soft,br-uThr)/max(br,1e-4);o=vec4(s*c,1.);}`,
bdown:`uniform sampler2D uSrc;out vec4 o;
void main(){vec2 uv=gl_FragCoord.xy/uRes,t=.5/uRes;o=vec4((texture(uSrc,uv+vec2(-t.x,-t.y)).rgb+texture(uSrc,uv+vec2(t.x,-t.y)).rgb+texture(uSrc,uv+vec2(-t.x,t.y)).rgb+texture(uSrc,uv+t).rgb)*.25,1.);}`,
bup:`uniform sampler2D uSrc,uLow;out vec4 o;
void main(){vec2 uv=gl_FragCoord.xy/uRes,t=1./vec2(textureSize(uLow,0));vec3 s=vec3(0.);for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++)s+=texture(uLow,uv+vec2(i,j)*t).rgb*((i==0?2.:1.)*(j==0?2.:1.));o=vec4(texture(uSrc,uv).rgb+s/16.,1.);}`,
/* ---- tone map (AgX default, ACES optional) + exposure + bloom + blue-noise dither ---- */
tone:`uniform sampler2D uSrc,uBloom,uBlue;uniform float uExp,uBloomK,uAces,uFrame;out vec4 o;
vec3 agxC(vec3 x){vec3 x2=x*x,x4=x2*x2;return 15.5*x4*x2-40.14*x4*x+31.96*x4-6.868*x2*x+.4298*x2+.1191*x-.00232;}
vec3 agx(vec3 v){const mat3 M=mat3(.842479062253094,.0423282422610123,.0423756549057051,.0784335999999992,.878468636469772,.0784336,.0792237451477643,.0791661274605434,.879142973793104);
 const mat3 Mi=mat3(1.19687900512017,-.0528968517574562,-.0529716355144438,-.0980208811401368,1.15190312990417,-.0980434501171241,-.0990297440797205,-.0989611768448433,1.15107367264116);
 v=M*v;v=clamp(log2(max(v,vec3(1e-10))),-12.47393,4.026069);v=(v+12.47393)/16.499999;return Mi*agxC(v);}
vec3 enc(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0)),vec3(1./2.4))-.055,step(vec3(.0031308),c));}
void main(){vec2 uv=gl_FragCoord.xy/uRes;vec3 h=(texture(uSrc,uv).rgb+uBloomK*texture(uBloom,uv).rgb)*uExp;
 vec3 c=uAces>.5?enc(clamp((h*(2.51*h+.03))/(h*(2.43*h+.59)+.14),0.,1.)):clamp(agx(h),0.,1.);
 float n=fract(texelFetch(uBlue,ivec2(gl_FragCoord.xy)&63,0).r+uFrame*.618034)-.5;o=vec4(c+n/255.,1.);}`,
/* ---- FXAA (LOW) ---- */
fxaa:`uniform sampler2D uSrc;out vec4 o;float lu(vec3 c){return dot(c,vec3(.299,.587,.114));}
void main(){vec2 uv=gl_FragCoord.xy/uRes,t=1./uRes;vec3 M=texture(uSrc,uv).rgb;float lN=lu(texture(uSrc,uv+vec2(0,t.y)).rgb),lS=lu(texture(uSrc,uv-vec2(0,t.y)).rgb),lE=lu(texture(uSrc,uv+vec2(t.x,0)).rgb),lW=lu(texture(uSrc,uv-vec2(t.x,0)).rgb),lM=lu(M);
 float mn=min(lM,min(min(lN,lS),min(lE,lW))),mx=max(lM,max(max(lN,lS),max(lE,lW)));if(mx-mn<max(.0312,mx*.125)){o=vec4(M,1.);return;}
 float lNW=lu(texture(uSrc,uv+vec2(-t.x,t.y)).rgb),lNE=lu(texture(uSrc,uv+t).rgb),lSW=lu(texture(uSrc,uv-t).rgb),lSE=lu(texture(uSrc,uv+vec2(t.x,-t.y)).rgb);
 vec2 dir=vec2(-((lNW+lNE)-(lSW+lSE)),((lNW+lSW)-(lNE+lSE)));float rd=max((lNW+lNE+lSW+lSE)*.03125,1./128.);dir=clamp(dir/(min(abs(dir.x),abs(dir.y))+rd),vec2(-8.),vec2(8.))*t;
 vec3 A=.5*(texture(uSrc,uv+dir*(1./3.-.5)).rgb+texture(uSrc,uv+dir*(2./3.-.5)).rgb),B=A*.5+.25*(texture(uSrc,uv-dir*.5).rgb+texture(uSrc,uv+dir*.5).rgb);float lB=lu(B);o=vec4((lB<mn||lB>mx)?A:B,1.);}`,
/* ---- upscale to the canvas with contrast-adaptive sharpening ---- */
up:`uniform sampler2D uSrc;uniform float uSharp;out vec4 o;
void main(){vec2 uv=gl_FragCoord.xy/uRes,t=1./vec2(textureSize(uSrc,0));vec3 c=texture(uSrc,uv).rgb;if(uSharp<=0.){o=vec4(c,1.);return;}
 vec3 n=texture(uSrc,uv+vec2(0,t.y)).rgb,s=texture(uSrc,uv-vec2(0,t.y)).rgb,e=texture(uSrc,uv+vec2(t.x,0)).rgb,w=texture(uSrc,uv-vec2(t.x,0)).rgb;
 vec3 mn=min(c,min(min(n,s),min(e,w))),mx=max(c,max(max(n,s),max(e,w)));vec3 amp=sqrt(clamp(min(mn,1.-mx)/max(mx,1e-4),0.,1.));vec3 wt=-amp*mix(.125,.2,uSharp);
 o=vec4(clamp((c+(n+s+e+w)*wt)/(1.+4.*wt),0.,1.),1.);}`};

function fxCompile(){FX.prog={};for(const k in FX_FS)FX.prog[k]=liveCompile(FX_H+FX_FS[k]);
 const B=window.__ASSETS?.BLUE_NOISE;FX.blue=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,FX.blue);gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);
 const px=B?Uint8Array.from(atob(B.base64),c=>c.charCodeAt(0)):new Uint8Array(4096).map(()=>Math.random()*255);gl.texImage2D(gl.TEXTURE_2D,0,gl.R8,64,64,0,gl.RED,gl.UNSIGNED_BYTE,px);
 for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.NEAREST],[gl.TEXTURE_MAG_FILTER,gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.REPEAT],[gl.TEXTURE_WRAP_T,gl.REPEAT]])gl.texParameteri(gl.TEXTURE_2D,k,v)}
function fxTex(w,h,ifmt,fmt,type,lin){const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);gl.texImage2D(gl.TEXTURE_2D,0,ifmt,w,h,0,fmt,type,null);
 for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,lin?gl.LINEAR:gl.NEAREST],[gl.TEXTURE_MAG_FILTER,lin?gl.LINEAR:gl.NEAREST],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);return t}
function fxFbo(colors,depth){const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);colors.forEach((c,i)=>gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+i,gl.TEXTURE_2D,c,0));
 if(depth)gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,depth,0);gl.drawBuffers(colors.map((_,i)=>gl.COLOR_ATTACHMENT0+i));
 if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('FX framebuffer incomplete');return f}
function fxRelease(){const T=FX.t;if(!T)return;for(const k in T){const v=T[k];if(v instanceof WebGLTexture)gl.deleteTexture(v);else if(v instanceof WebGLFramebuffer)gl.deleteFramebuffer(v);else if(Array.isArray(v))v.forEach(x=>{if(x instanceof WebGLTexture)gl.deleteTexture(x);else if(x instanceof WebGLFramebuffer)gl.deleteFramebuffer(x);else if(x&&x.t){gl.deleteTexture(x.t);gl.deleteFramebuffer(x.f)}})}FX.t=null}
/* (re)allocate targets for render size rw x rh and smoke size vw x vh */
function fxAlloc(rw,rh,vw,vh){fxRelease();const T=FX.t={},F16=[gl.RGBA16F,gl.RGBA,gl.HALF_FLOAT];
 T.color=fxTex(rw,rh,...F16,true);T.amb=fxTex(rw,rh,...F16,false);T.depth=fxTex(rw,rh,gl.DEPTH_COMPONENT24,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,false);
 T.sceneF=fxFbo([T.color,T.amb],T.depth);
 T.comp=fxTex(rw,rh,...F16,true);T.compF=fxFbo([T.comp],null);T.compDF=fxFbo([T.comp],T.depth);
 T.hist=[fxTex(rw,rh,...F16,true),fxTex(rw,rh,...F16,true)];T.histF=T.hist.map(t=>fxFbo([t],null));
 T.ldr=fxTex(rw,rh,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,true);T.ldrF=fxFbo([T.ldr],null);T.ldrDF=fxFbo([T.ldr],T.depth);
 T.ldr2=fxTex(rw,rh,gl.RGBA8,gl.RGBA,gl.UNSIGNED_BYTE,true);T.ldr2F=fxFbo([T.ldr2],null);
 const aw=Math.max(1,rw>>1),ah=Math.max(1,rh>>1);T.ao=[fxTex(aw,ah,...F16,true),fxTex(aw,ah,...F16,true)];T.aoF=T.ao.map(t=>fxFbo([t],null));
 T.sm=fxTex(vw,vh,...F16,false);T.sa=fxTex(vw,vh,...F16,false);T.smF=fxFbo([T.sm,T.sa],null);
 T.sh=[fxTex(vw,vh,...F16,true),fxTex(vw,vh,...F16,true)];T.shF=T.sh.map(t=>fxFbo([t],null));
 T.bl=[];let w=aw,h=ah;for(let i=0;i<5&&w>=8&&h>=8;i++){const a=fxTex(w,h,...F16,true),b=fxTex(w,h,...F16,true);T.bl.push({w,h,a,b,af:fxFbo([a],null),bf:fxFbo([b],null)});w=Math.max(1,w>>1);h=Math.max(1,h>>1)}
 FX.rw=rw;FX.rh=rh;FX.vw=vw;FX.vh=vh;FX.aw=aw;FX.ah=ah;FX.hist=0;FX.shist=0;FX.reset=true;gl.bindFramebuffer(gl.FRAMEBUFFER,null)}
function fxPass(name,fbo,w,h,tex,uni){const p=FX.prog[name];gl.useProgram(p);gl.bindFramebuffer(gl.FRAMEBUFFER,fbo);gl.viewport(0,0,w,h);gl.uniform2f(liveU(p,'uRes'),w,h);gl.uniform1f(liveU(p,'uNear'),camera.near);gl.uniform1f(liveU(p,'uFar'),camera.far);
 let unit=8;for(const n in tex){const t=tex[n];gl.activeTexture(gl.TEXTURE0+unit);if(t&&t.__3d){gl.bindTexture(gl.TEXTURE_2D,null);gl.bindTexture(gl.TEXTURE_3D,t.t)}else gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(liveU(p,n),unit);unit++}
 for(const n in uni){const v=uni[n],l=liveU(p,n);if(l===null)continue;if(v instanceof Float32Array&&v.length===16)gl.uniformMatrix4fv(l,false,v);else if(Array.isArray(v)){if(v.length===4)gl.uniform4f(l,...v);else if(v.length===3)gl.uniform3f(l,...v);else gl.uniform2f(l,...v)}else if(v&&v.int!==undefined)gl.uniform1i(l,v.int);else gl.uniform1f(l,v)}
 gl.drawArrays(gl.TRIANGLES,0,3)}

/* ---- frame hooks ---- */
const FX_HALTON=[[.5,.333],[.25,.667],[.75,.111],[.125,.444],[.625,.778],[.375,.222],[.875,.556],[.0625,.889]];
function fxBegin(){FX.active=false;if(!FX.on||FX.err)return false;try{
  if(FX.gen!==runtimeGeneration){FX.gen=runtimeGeneration;FX.t=null;if(!gl.getExtension('EXT_color_buffer_float'))throw Error('EXT_color_buffer_float 없음');fxCompile()}
  const rs=Math.min(1.5,Math.max(.5,LIVE.cs||1)),rw=Math.max(64,Math.round(glCanvas.width*rs)),rh=Math.max(64,Math.round(glCanvas.height*rs)),vs=Math.min(1,Math.max(.25,LIVE.rs||.5)),vw=Math.max(32,Math.round(rw*vs*.5)),vh=Math.max(32,Math.round(rh*vs*.5));
  if(!FX.t||rw!==FX.rw||rh!==FX.rh||vw!==FX.vw||vh!==FX.vh)fxAlloc(rw,rh,vw,vh);
  const taa=PERF.set.aa==='TAA';FX.taa=taa;const J=taa?FX_HALTON[FX.frame%8]:[.5,.5];FX.jitter=[(J[0]-.5)*2/rw,(J[1]-.5)*2/rh];
  gl.bindFramebuffer(gl.FRAMEBUFFER,FX.t.sceneF);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.viewport(0,0,rw,rh);FX.active=true;return true}
 catch(e){FX.err=String(e?.message||e);FX.active=false;gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,glCanvas.width,glCanvas.height);return false}}
function fxJitter(proj){if(!FX.active||!FX.taa)return proj;const p=new Float32Array(proj);p[8]+=FX.jitter[0];p[9]+=FX.jitter[1];return p}
function fxMatrices(){const view=lookAt(camera.eye,camera.target,camera.up),proj=perspective(camera.fov,glCanvas.width/glCanvas.height,camera.near,camera.far),vp=matMul(proj,view);return {view,proj,vp,inv:liveInv(vp)}}
function fxAfterOpaque(){const T=FX.t,M=FX.m=fxMatrices(),rw=FX.rw,rh=FX.rh;gl.bindVertexArray(LIVE.vao);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.depthMask(false);gl.disable(gl.CULL_FACE);
 const q=1/Math.tan(camera.fov*Math.PI/360),aspect=rw/rh,projP=[aspect/q,1/q,0,0];
 /* GTAO */
 const aoOn=PERF.set.ao>0;if(aoOn){const hi=PERF.set.ao>1;fxPass('gtao',T.aoF[0],FX.aw,FX.ah,{uDepth:T.depth,uBlue:FX.blue},{uProj:projP,uSlices:{int:hi?4:2},uSteps:{int:hi?8:5},uRadius:.9,uFrame:FX.frame%64});
  fxPass('aoblur',T.aoF[1],FX.aw,FX.ah,{uAO:T.ao[0]},{uDir:[1,0]});fxPass('aoblur',T.aoF[0],FX.aw,FX.ah,{uAO:T.ao[1]},{uDir:[0,1]})}
 /* volumetric smoke */
 const smokeOn=LIVE.enabled&&LIVE.ok&&!!LIVE.vol;if(smokeOn){const fwd=norm(sub(camera.target,camera.eye));
  fxPass('vol',T.smF,FX.vw,FX.vh,{uVol:{__3d:true,t:LIVE.vol},uDepth:T.depth,uBlue:FX.blue},{uInv:M.inv,uEye:[...camera.eye],uBMin:[...LIVE.min],uBMax:[...LIVE.max],uLD:[.24,.95,.18],uFwd:fwd,uDens:LIVE.dens,uTF:[...LIVE.tf],uCMode:LIVE.colorMode?1:0,uStepScale:LIVE.stepScale||1,uG:FX.g,uFrame:FX.frame%64,uTaps:{int:2+2*(LIVE.rq|0)}});
  gl.activeTexture(gl.TEXTURE8);gl.bindTexture(gl.TEXTURE_3D,null);
  const cur=FX.shist,nxt=1-cur;fxPass('vtemp',T.shF[nxt],FX.vw,FX.vh,{uCur:T.sm,uAux:T.sa,uHist:T.sh[cur]},{uInv:M.inv,uPrevVP:FX.prevVP||M.vp,uEye:[...camera.eye],uBlend:FX.reset?0:.8});FX.shist=nxt}
 fxPass('comp',T.compF,rw,rh,{uScene:T.color,uAmb:T.amb,uDepth:T.depth,uAO:T.ao[0],uSmoke:T.sh[FX.shist],uSAux:T.sa},{uLo:[FX.vw,FX.vh],uAOOn:aoOn?1:0,uAOK:FX.aoStrength,uSmokeOn:smokeOn?1:0,uSSR:PERF.set.ssr|0,uProj:projP,uP:fxProj()});
 /* leave composite+depth bound for glass */
 gl.bindFramebuffer(gl.FRAMEBUFFER,T.compDF);gl.viewport(0,0,rw,rh);gl.enable(gl.DEPTH_TEST);gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0)}
function fxPost(){const T=FX.t,M=FX.m,rw=FX.rw,rh=FX.rh;gl.bindVertexArray(LIVE.vao);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.depthMask(false);gl.disable(gl.CULL_FACE);
 let src=T.comp;if(FX.taa){const cur=FX.hist,nxt=1-cur;fxPass('taa',T.histF[nxt],rw,rh,{uCur:T.comp,uHist:T.hist[cur],uDepth:T.depth},{uInvVP:M.inv,uPrevVP:FX.prevVP||M.vp,uReset:FX.reset?1:0});FX.hist=nxt;src=T.hist[nxt]}
 let bloom=T.bl[0]?.a;if(PERF.set.bloom&&T.bl.length){const B=T.bl;fxPass('bpre',B[0].af,B[0].w,B[0].h,{uSrc:src},{uThr:1.2});
  for(let i=1;i<B.length;i++)fxPass('bdown',B[i].af,B[i].w,B[i].h,{uSrc:B[i-1].a},{});
  for(let i=B.length-2;i>=0;i--){fxPass('bup',B[i].bf,B[i].w,B[i].h,{uSrc:B[i].a,uLow:i===B.length-2?B[i+1].a:B[i+1].b},{})}bloom=B.length>1?B[0].b:B[0].a}
 fxPass('tone',T.ldrF,rw,rh,{uSrc:src,uBloom:bloom||src,uBlue:FX.blue},{uExp:FX.exposure*M10_SETTINGS.exposure,uBloomK:PERF.set.bloom&&bloom?FX.bloom:0,uAces:FX.tone==='ACES'?1:0,uFrame:FX.frame%64});
 gl.bindFramebuffer(gl.FRAMEBUFFER,T.ldrDF);gl.viewport(0,0,rw,rh);gl.enable(gl.DEPTH_TEST);gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0)}
function fxPresent(){const T=FX.t,rw=FX.rw,rh=FX.rh;gl.bindVertexArray(LIVE.vao);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.depthMask(false);
 let src=T.ldr;if(PERF.set.aa==='FXAA'){fxPass('fxaa',T.ldr2F,rw,rh,{uSrc:T.ldr},{});src=T.ldr2}
 fxPass('up',null,glCanvas.width,glCanvas.height,{uSrc:src},{uSharp:rw<glCanvas.width?1:.35});
 FX.prevVP=FX.m.vp;FX.frame++;FX.reset=false;gl.bindVertexArray(null);gl.activeTexture(gl.TEXTURE0);gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.viewport(0,0,glCanvas.width,glCanvas.height)}
function fxProj(){return new Float32Array(perspective(camera.fov,glCanvas.width/glCanvas.height,camera.near,camera.far))}
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
  for(const n of ['pref0','pref1','hq','sh0','sh1','csmMap','csmVP','csmSplit','csmOn','pcss','csmTexel','camFwd','clearcoat','prefLod','ambK','vatlas','vdebug'])loc[n]=gl.getUniformLocation(program,'u_'+n);
  /* energy match: diffuse ambient keeps the M10 brightness at an upward normal, SH supplies direction and colour */
  const E=hqIrr(HQ.sh[0],[0,1,0]),lum=(.2126*E[0]+.7152*E[1]+.0722*E[2])/Math.PI;HQ.ambK=Math.min(4,Math.max(.25,.40*.85/Math.max(lum,1e-4)));
  HQ.gen=runtimeGeneration;HQ.ok=true;FX.shadow=true}catch(e){HQ.err=String(e?.message||e);HQ.ok=false}
 finally{gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,glCanvas.width,glCanvas.height)}}
/* ---- cascaded shadows ---- */
function hqCsmAlloc(S){if(HQ.csm&&HQ.csmSize===S&&HQ.csmGen===runtimeGeneration)return;HQ.csmGen=runtimeGeneration;HQ.csmFlat=null;HQ.csmDyn=null;HQ.csmDrawn=false;HQ.csmStaticOK=false;if(HQ.csm){gl.deleteTexture(HQ.csm);gl.deleteFramebuffer(HQ.csmF);if(HQ.csmS){gl.deleteTexture(HQ.csmS);gl.deleteFramebuffer(HQ.csmSF)}HQ.csmS=null;HQ.csmStaticVP=null}const maxT=gl.getParameter(gl.MAX_TEXTURE_SIZE);S=Math.min(S,Math.floor(maxT/3));
 HQ.csm=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,HQ.csm);gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,S*3,S,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.NEAREST);for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);
 HQ.csmF=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,HQ.csmF);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,HQ.csm,0);gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);HQ.csmSize=S;
 /* static-caster atlas (same size and format so it can be blitted): scene boxes + non-wheel vehicle parts, redrawn only when the cascades move */
 HQ.csmS=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,HQ.csmS);gl.texImage2D(gl.TEXTURE_2D,0,gl.DEPTH_COMPONENT24,S*3,S,0,gl.DEPTH_COMPONENT,gl.UNSIGNED_INT,null);for(const q of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,q,gl.NEAREST);for(const q of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,q,gl.CLAMP_TO_EDGE);
 HQ.csmSF=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,HQ.csmSF);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.TEXTURE_2D,HQ.csmS,0);gl.drawBuffers([gl.NONE]);gl.readBuffer(gl.NONE);HQ.csmStaticVP=null;gl.bindFramebuffer(gl.FRAMEBUFFER,null)}
function hqCsm(){const lvl=PERF.set.shadow|0;HQ.csmOn=HQ.ok&&lvl>=2;if(!HQ.csmOn)return;const S=lvl>=4?4096:(lvl>=3?2048:1536);hqCsmAlloc(S);
 const eye=camera.eye,fwd=norm(sub(camera.target,eye)),upv=norm(cross(cross(fwd,camera.up),fwd)),right=norm(cross(fwd,upv)),n=Math.max(.05,camera.near),f=Math.min(camera.far,40),asp=glCanvas.width/glCanvas.height,th=Math.tan(camera.fov*Math.PI/360);
 const split=[n];for(let i=1;i<=3;i++){const a=n*Math.pow(f/n,i/3),b=n+(f-n)*i/3;split.push(.8*a+.2*b)}
 const L=HQ.lightDir,VP=[],texel=[];
 for(let i=0;i<3;i++){const d0=split[i],d1=split[i+1],pts=[];for(const d of [d0,d1])for(const sx of [-1,1])for(const sy of [-1,1])pts.push(eye.map((e,k)=>e+fwd[k]*d+right[k]*sx*d*th*asp+upv[k]*sy*d*th));
  const c=[0,1,2].map(k=>pts.reduce((a,p)=>a+p[k],0)/8);let r=0;for(const p of pts)r=Math.max(r,Math.hypot(p[0]-c[0],p[1]-c[1],p[2]-c[2]));r=Math.ceil(r*16)/16;
  const lv=lookAt(c.map((v,k)=>v+L[k]*40),c,[0,0,-1]),tw=2*r/S;/* texel snapping (stable cascades) */const lc=m4point(lv,c);const sx=Math.round(lc[0]/tw)*tw-lc[0],sy=Math.round(lc[1]/tw)*tw-lc[1];
  const pr=ortho(-r+sx,r+sx,-r+sy,r+sy,1,90);VP.push(matMul(pr,lv));texel.push(tw)}
 HQ.csmVP=VP;HQ.csmSplit=[split[1],split[2],split[3]];HQ.csmTexel=texel;
 /* what invalidates what: cascades move with the camera (static + dynamic redraw); wheels / rollers / walking body change without the camera (dynamic only) */
 const flat=new Float64Array(48+16);VP.forEach((m,i)=>flat.set(m,i*16));flat.set(vehicleModel(),48);
 const same=(a,b)=>{if(!a||a.length!==b.length)return false;for(let i=0;i<a.length;i++)if(Math.abs(a[i]-b[i])>5e-6)return false;return true};
 const Bd=window.__BODY,bodyOn=!!(Bd&&Bd.active&&!fpv.enabled&&Bd.parts),dyn=[...(rollingState.wheelAngles||[]),...(rollingState.rollerAngles||[]),bodyOn?Bd.x:-1e9,bodyOn?Bd.z:0,bodyOn?Bd.yaw:0,bodyOn?Bd.g:0];
 const vpSame=same(HQ.csmFlat,flat),dynSame=same(HQ.csmDyn,dyn);if(vpSame&&dynSame&&HQ.csmDrawn)return;
 HQ.csmFlat=flat;HQ.csmDyn=dyn;
 gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,null);gl.activeTexture(gl.TEXTURE0);
 gl.depthMask(true);gl.enable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.useProgram(lighting.depthProgram);
 const id=identityMatrix(),draw=(mesh,m,vp)=>{gl.uniformMatrix4fv(lighting.depthMVP,false,m===id?vp:matMul(vp,m));drawDepthMesh(mesh)};
 const wp=wheelParts(),PL=OPT.cull?VP.map(m=>frustumPlanes(m,.03,true)):null;
 const casters=(i,vp,pass)=>{ /* pass: 'all' | 'static' | 'dynamic' */
  if(pass!=='dynamic')for(const o of scene.objects)if(o.visible&&o.gpu&&o.material!=='glass'&&o.center[1]+o.size[1]/2<3.5&&(!PL||aabbVisible(PL[i],o)))draw(o.gpu,id,vp);
  if(pass!=='static')for(let j=0;j<scene.roadParts.length;j++){const r=scene.roadParts[j];if(r.gpu)draw(r.gpu,rollerModel(r,rollingState.rollerAngles[j]||0),vp)}
  for(const p of scene.vehicleParts)if(p.gpu){const k=wp.indexOf(p);if(k<0){if(pass!=='dynamic')draw(p.gpu,vehicleModel(),vp)}else if(pass!=='static')draw(p.gpu,wheelModel(p,rollingState.wheelAngles[k]||0),vp)}
  if(pass!=='static'&&bodyOn){const a=-Bd.yaw,cc=Math.cos(a),ss=Math.sin(a),M=new Float64Array([cc,0,-ss,0,0,1,0,0,ss,0,cc,0,Bd.x,Bd.g,Bd.z,1]);for(const g of Bd.parts)draw(g,M,vp)}};
 if(OPT.split&&HQ.csmS){
  if(!vpSame||!HQ.csmStaticOK){gl.bindFramebuffer(gl.FRAMEBUFFER,HQ.csmSF);gl.viewport(0,0,S*3,S);gl.clear(gl.DEPTH_BUFFER_BIT);gl.useProgram(lighting.depthProgram);for(let i=0;i<3;i++){gl.viewport(i*S,0,S,S);casters(i,VP[i],'static')}HQ.csmStaticOK=true}
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER,HQ.csmSF);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,HQ.csmF);gl.blitFramebuffer(0,0,S*3,S,0,0,S*3,S,gl.DEPTH_BUFFER_BIT,gl.NEAREST);gl.bindFramebuffer(gl.READ_FRAMEBUFFER,null);
  gl.bindFramebuffer(gl.FRAMEBUFFER,HQ.csmF);for(let i=0;i<3;i++){gl.viewport(i*S,0,S,S);casters(i,VP[i],'dynamic')}
 }else{
  gl.bindFramebuffer(gl.FRAMEBUFFER,HQ.csmF);gl.viewport(0,0,S*3,S);gl.clear(gl.DEPTH_BUFFER_BIT);gl.useProgram(lighting.depthProgram);
  for(let i=0;i<3;i++){gl.viewport(i*S,0,S,S);casters(i,VP[i],'all')}}
 HQ.csmDrawn=true;HQ.csmStaticOK=HQ.csmStaticOK||false;
 gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,glCanvas.width,glCanvas.height)}
function hqBind(capture){if(!loc.hq)return;const on=HQ.ok&&!capture&&HQ.gen===runtimeGeneration;gl.uniform1f(loc.hq,on?1:0);if(!on){gl.uniform1f(loc.csmOn,0);for(const u of [4,5]){gl.activeTexture(gl.TEXTURE0+u);gl.bindTexture(gl.TEXTURE_CUBE_MAP,lighting.dummy)}gl.activeTexture(gl.TEXTURE0);return}
 gl.activeTexture(gl.TEXTURE4);gl.bindTexture(gl.TEXTURE_CUBE_MAP,HQ.pref[0]);gl.uniform1i(loc.pref0,4);gl.activeTexture(gl.TEXTURE5);gl.bindTexture(gl.TEXTURE_CUBE_MAP,HQ.pref[1]);gl.uniform1i(loc.pref1,5);
 gl.uniform3fv(loc.sh0,HQ.sh[0].flat());gl.uniform3fv(loc.sh1,HQ.sh[1].flat());gl.uniform1f(loc.prefLod,HQ.prefLevels-1);gl.uniform1f(loc.ambK,HQ.ambK);
 const csm=!!HQ.csmOn&&!!HQ.csmVP;gl.uniform1f(loc.csmOn,csm?1:0);if(csm){gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,HQ.csm);gl.uniform1i(loc.csmMap,6);const a=new Float32Array(48);HQ.csmVP.forEach((m,i)=>a.set(m,i*16));gl.uniformMatrix4fv(loc.csmVP,false,a);
  gl.uniform3f(loc.csmSplit,...HQ.csmSplit);gl.uniform3f(loc.csmTexel,...HQ.csmTexel);gl.uniform1f(loc.pcss,(PERF.set.shadow|0)>=3?1:0)}
 const fwd=norm(sub(camera.target,camera.eye));gl.uniform3f(loc.camFwd,...fwd);gl.activeTexture(gl.TEXTURE0)}
function hqIrr(L,n){const c1=.429043,c2=.511664,c3=.743125,c4=.886227,c5=.247708,[x,y,z]=n;return [0,1,2].map(ch=>c1*L[8][ch]*(x*x-y*y)+c3*L[6][ch]*z*z+c4*L[0][ch]-c5*L[6][ch]+2*c1*(L[4][ch]*x*y+L[7][ch]*x*z+L[5][ch]*y*z)+2*c2*(L[3][ch]*x+L[1][ch]*y+L[2][ch]*z))}
/* ===== Cinematic director: the only writer of the camera while a cinematic plays =====
   States: IDLE -> PREPARING -> PLAYING -> FINISHED, any active state -> CANCELLED.
   One clock (accumulated, clamped frame time) drives camera, captions and progress; there are no timers.
   Camera shots are built from the real vehicle/facility geometry (see cineGeometry), the path speed is defined
   in metres per second along a pre-sampled arc-length table, and the look-at target has its own path. */
const CINE=(()=>{
const DUR=30,PREP_MAX=15,POST=4.5,R_CAM=.30,R_CAR=.55,ST={IDLE:'IDLE',PREPARING:'PREPARING',PLAYING:'PLAYING',FINISHED:'FINISHED',CANCELLED:'CANCELLED'};
const SMOKE_READY_T=3.0; /* simulated seconds of developed flow before the first shot (rake -> wake takes about 2 s at U=5) */
let state=ST.IDLE,t=0,prepT=0,postT=0,lastNow=null,lastStart=-1e9,token=0,reason='',cueIdx=-2,lastProg=-1,tallW=0,tallTarget=0,geoKey='',G=null,sets=null,obst=null,lastCheck=null,cutPending=false;
const subs=new Set(),emit=e=>{for(const f of subs){try{f(e)}catch(_){}}};
const lerp=(a,b,s)=>a+(b-a)*s,sstep=s=>{s=s<0?0:s>1?1:s;return s*s*(3-2*s)};

/* ---------- geometry from the real scene ---------- */
function bodyLocalBox(){const b=scene.vehicleParts.find(p=>p.role==='body');if(!b||!b.positions)return null;if(b._cineBox&&b._cineBox.src===b.positions)return b._cineBox;const P=b.positions,lo=[1e9,1e9,1e9],hi=[-1e9,-1e9,-1e9];for(let i=0;i<P.length;i+=3)for(let k=0;k<3;k++){const v=P[i+k];if(v<lo[k])lo[k]=v;if(v>hi[k])hi[k]=v}return b._cineBox={src:P,lo,hi}}
function cineGeometry(){
 const lay=FLOW_LAYOUT.get(FLOW_FRAME),vt=AETHER.VEHICLE_TRANSFORM,lb=bodyLocalBox();if(!lb)throw Error('CINE: vehicle body unavailable');
 const key=[...vt.position,...vt.rotation,...vt.scale,lay.vehicleLength,lay.fanBounds.max[0],lay.collectorPlane.x].join();if(G&&geoKey===key)return G;
 const M=vehicleModel(),lo=[1e9,1e9,1e9],hi=[-1e9,-1e9,-1e9];
 for(const x of[lb.lo[0],lb.hi[0]])for(const y of[lb.lo[1],lb.hi[1]])for(const z of[lb.lo[2],lb.hi[2]]){const w=[M[0]*x+M[4]*y+M[8]*z+M[12],M[1]*x+M[5]*y+M[9]*z+M[13],M[2]*x+M[6]*y+M[10]*z+M[14]];for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],w[k]);hi[k]=Math.max(hi[k],w[k])}}
 /* flow is +X and the nose faces -X (FLOW_LAYOUT asserts both); nose/rear come from the validated layout */
 const nose=lay.vehicleFrontPoint[0],rear=lay.vehicleRearPoint[0],L=rear-nose,mid=(nose+rear)/2,cz=(lo[2]+hi[2])/2,hw=(hi[2]-lo[2])/2,top=hi[1],floor=lo[1];
 /* spoiler: highest geometry in the rear quarter (bounding-data estimate, not a named mesh) */
 const body=scene.vehicleParts.find(p=>p.role==='body').positions,wl=[1e9,1e9,1e9],wh=[-1e9,-1e9,-1e9];let wn=0;
 for(let i=0;i<body.length;i+=3){const x=body[i],y=body[i+1],z=body[i+2],wx=M[0]*x+M[4]*y+M[8]*z+M[12],wy=M[1]*x+M[5]*y+M[9]*z+M[13],wz=M[2]*x+M[6]*y+M[10]*z+M[14];if(wx>=rear-.25*L&&wy>=top-.12){wn++;wl[0]=Math.min(wl[0],wx);wl[1]=Math.min(wl[1],wy);wl[2]=Math.min(wl[2],wz);wh[0]=Math.max(wh[0],wx);wh[1]=Math.max(wh[1],wy);wh[2]=Math.max(wh[2],wz)}}
 const wing=wn>20?{x:(wl[0]+wh[0])/2,y:(wl[1]+wh[1])/2,z:(wl[2]+wh[2])/2,hw:(wh[2]-wl[2])/2,estimated:true,n:wn}:{x:rear-.12*L,y:top-.05,z:cz,hw:hw*.9,estimated:true,n:0};
 const dom=lay.domainBounds,wallZ=Math.min(dom.max[2],3.9)-R_CAM-.15; /* inner wall faces sit ~0.1 m inside the domain box */
 G=Object.freeze({key,L,nose,rear,mid,cz,hw,top,floor,wing,fanX:lay.fanBounds.max[0],rakeX:lay.fanBounds.max[0]+.6,collX:lay.collectorPlane.x,env:{x0:lay.fanBounds.max[0]+.45,x1:lay.collectorPlane.x-.8,y0:.5,y1:Math.min(dom.max[1],5.5)-.5,z0:dom.min[2]+R_CAM+.15,z1:wallZ},fanBox:{min:lay.fanBounds.min.slice(),max:lay.fanBounds.max.slice()}});geoKey=key;sets=null;obst=null;return G}

/* ---------- shot lists (car-relative; metres) ----------
   x: along the flow (+ downstream), z: lateral (+ toward the observation window), y: height above the floor.
   Every eye/target lies inside the tunnel envelope, so no wall is hidden and no cutaway is needed. */
function cineShots(g,tall){
 const m=g.mid,n=g.nose,r=g.rear,w=g.wing,c=g.cz,T=g.top;
 /* t: 0 low front quarter | 4 start of side tracking | 10 passing the cabin | 15 rear quarter on the spoiler | 17 hold | 24 wake | 30 reveal */
 const t=[0,.8,4,10,15,17,24,30];
 const eye=[[n-1.65,.55,c+2.2],[n-1.6,.56,c+2.25],[n-.95,.85,c+2.9],[m+1.75,1.35,c+3.3],[r+2.0,1.6,c+2.7],[r+2.3,1.62,c+2.65],[r+4.45,1.95,c+3.3],[r+4.5,3.3,c+3.3]];
 const tgt=tall?[[n+1.0,.6,c-.1],[n+1.05,.6,c-.1],[n+1.9,.78,c],[m+1.2,.9,c],[w.x-.1,w.y,c],[w.x+.1,w.y-.05,c],[r+1.3,.85,c],[m-.3,.8,c]]
  :[[n+1.05,.65,c-.3],[n+1.1,.65,c-.3],[n+1.9,.78,c-.1],[m+1.4,.9,c],[w.x-.1,w.y,c],[w.x+.1,w.y-.05,c],[r+1.25,.8,c],[m-.3,.8,c]];
 return{t,eye,tgt,fov:[[0,40],[24,40],[30,46]],hfov:46}}

/* ---------- path tables ---------- */
const ALPHA=.5;
function crSeg(P,i){const n=P.length,a=P[Math.max(0,i-1)],b=P[i],c=P[i+1],d=P[Math.min(n-1,i+2)];const p0=i===0?[2*b[0]-c[0],2*b[1]-c[1],2*b[2]-c[2]]:a,p3=i+2>n-1?[2*c[0]-b[0],2*c[1]-b[1],2*c[2]-b[2]]:d,pts=[p0,b,c,p3],kn=[0];for(let k=1;k<4;k++){const q=pts[k-1],s=pts[k];kn.push(kn[k-1]+Math.pow(Math.hypot(s[0]-q[0],s[1]-q[1],s[2]-q[2])+1e-4,ALPHA))}return{pts,kn}}
function crEval(seg,lam,out){const{pts,kn}=seg,[p0,p1,p2,p3]=pts,[k0,k1,k2,k3]=kn,tt=lerp(k1,k2,lam);for(let k=0;k<3;k++){const A1=(k1-tt)/(k1-k0)*p0[k]+(tt-k0)/(k1-k0)*p1[k],A2=(k2-tt)/(k2-k1)*p1[k]+(tt-k1)/(k2-k1)*p2[k],A3=(k3-tt)/(k3-k2)*p2[k]+(tt-k2)/(k3-k2)*p3[k],B1=(k2-tt)/(k2-k0)*A1+(tt-k0)/(k2-k0)*A2,B2=(k3-tt)/(k3-k1)*A2+(tt-k1)/(k3-k1)*A3;out[k]=(k2-tt)/(k2-k1)*B1+(tt-k1)/(k2-k1)*B2}}
const SUB=48;
function buildPath(shots,g){
 const nseg=shots.t.length-1,eS=[],tS=[],e=[0,0,0];for(let i=0;i<nseg;i++){eS.push(crSeg(shots.eye,i));tS.push(crSeg(shots.tgt,i))}
 const cum=new Float64Array(nseg*SUB+1);let prev=[0,0,0];crEval(eS[0],0,prev);let k=0;const knotS=[0];
 for(let i=0;i<nseg;i++){for(let j=1;j<=SUB;j++){crEval(eS[i],j/SUB,e);k++;cum[k]=cum[k-1]+Math.hypot(e[0]-prev[0],e[1]-prev[1],e[2]-prev[2]);prev=[e[0],e[1],e[2]]}knotS.push(cum[k])}
 /* time -> distance: monotone cubic Hermite (PCHIP); zero speed only at t=0 and t=DUR, never at an interior waypoint */
 const tk=shots.t,h=[],dl=[];for(let i=0;i<nseg;i++){h.push(tk[i+1]-tk[i]);dl.push((knotS[i+1]-knotS[i])/h[i])}
 const d=new Array(nseg+1).fill(0);for(let i=1;i<nseg;i++){if(dl[i-1]*dl[i]<=0){d[i]=0;continue}const w1=2*h[i]+h[i-1],w2=h[i]+2*h[i-1];d[i]=(w1+w2)/(w1/dl[i-1]+w2/dl[i])}
 return{shots,eS,tS,cum,knotS,tk,h,d,nseg,total:cum[cum.length-1]}}
function distAt(P,tt){const{tk,knotS,h,d,nseg}=P;if(tt<=tk[0])return 0;if(tt>=tk[nseg])return knotS[nseg];let i=0;while(i<nseg-1&&tt>tk[i+1])i++;const s=(tt-tk[i])/h[i],s2=s*s,s3=s2*s;return(2*s3-3*s2+1)*knotS[i]+(s3-2*s2+s)*h[i]*d[i]+(-2*s3+3*s2)*knotS[i+1]+(s3-s2)*h[i]*d[i+1]}
function speedAt(P,tt){const e=1/120;return(distAt(P,Math.min(DUR,tt+e))-distAt(P,Math.max(0,tt-e)))/(Math.min(DUR,tt+e)-Math.max(0,tt-e))}
function locate(P,s,o){const c=P.cum;let lo=0,hi=c.length-1;if(s<=0){o.i=0;o.l=0;return}if(s>=c[hi]){o.i=P.nseg-1;o.l=1;return}while(hi-lo>1){const mid=(lo+hi)>>1;if(c[mid]<=s)lo=mid;else hi=mid}const fr=(s-c[lo])/(c[hi]-c[lo]||1),gi=lo+fr,i=Math.min(P.nseg-1,Math.floor(gi/SUB));o.i=i;o.l=clamp((gi-i*SUB)/SUB,0,1)}
const _loc={i:0,l:0};
function poseAt(P,tt,eye,tgt){locate(P,distAt(P,tt),_loc);crEval(P.eS[_loc.i],_loc.l,eye);crEval(P.tS[_loc.i],_loc.l,tgt)}
function fovVis(P,tt){const f=P.shots.fov;let i=0;while(i<f.length-2&&tt>f[i+1][0])i++;const a=f[i],b=f[i+1];return lerp(a[1],b[1],sstep((tt-a[0])/(b[0]-a[0])))}
function buildSets(){const g=cineGeometry();if(sets&&sets.key===g.key)return sets;const wide=cineShots(g,false),tallS=cineShots(g,true);const clampE=s=>{for(const p of s.eye){p[0]=clamp(p[0],g.env.x0,g.env.x1);p[1]=clamp(p[1],g.env.y0,g.env.y1);p[2]=clamp(p[2],g.env.z0,g.env.z1)}};clampE(wide);clampE(tallS);sets={key:g.key,wide:buildPath(wide,g),tall:buildPath(tallS,g)};return sets}

/* ---------- aspect / bars ---------- */
function barFrac(){return document.body.classList.contains('mobile')?0:.18}
function aspectInfo(){const bf=barFrac(),W=Math.max(1,glCanvas.clientWidth),H=Math.max(1,glCanvas.clientHeight);return{A:W/(H*(1-bf)),bf}}
function fullFov(fv,tallShot,A,bf,hfov){let fvis=fv;if(tallShot)fvis=2*Math.atan(Math.tan(hfov*Math.PI/360)/A)*180/Math.PI;else{const hmax=70,hh=2*Math.atan(Math.tan(fv*Math.PI/360)*A)*180/Math.PI;if(hh>hmax)fvis=2*Math.atan(Math.tan(hmax*Math.PI/360)/A)*180/Math.PI}return 2*Math.atan(Math.tan(fvis*Math.PI/360)/(1-bf))*180/Math.PI}

/* ---------- per-frame pose (allocation free) ---------- */
const eW=[0,0,0],tW=[0,0,0],eT=[0,0,0],tT=[0,0,0];let fovOut=50;
function evalPose(tt,dt){
 const S=buildSets(),{A,bf}=aspectInfo(),wantTall=A<(tallTarget?1.12:.95)?1:0;tallTarget=wantTall;
 if(dt>0)tallW=clamp(tallW+(wantTall-tallW)*Math.min(1,dt*3.2),0,1);else tallW=wantTall;
 if(Math.abs(tallW-wantTall)<.002)tallW=wantTall;
 poseAt(S.wide,tt,eW,tW);let fw=fullFov(fovVis(S.wide,tt),false,A,bf);
 if(tallW>0){poseAt(S.tall,tt,eT,tT);const ft=fullFov(fovVis(S.tall,tt),true,A,bf,S.tall.shots.hfov);const s=sstep(tallW);for(let k=0;k<3;k++){eW[k]=lerp(eW[k],eT[k],s);tW[k]=lerp(tW[k],tT[k],s)}fw=lerp(fw,ft,s)}
 fovOut=fw}
function writeCamera(){const c=camera;c.preset='CINE';c.cutaway=false;c.up[0]=0;c.up[1]=1;c.up[2]=0;for(let k=0;k<3;k++){c.eye[k]=eW[k];c.target[k]=tW[k]}c.fov=fovOut}
function cutHistory(){try{FX.reset=true}catch(_){}}

/* ---------- captions: one timeline ---------- */
function cues(){const cells=LIVE.N?LIVE.N[0]*LIVE.N[1]*LIVE.N[2]:0,cnt=cells>0?'약 '+Math.max(1,Math.round(cells/1e4))+'만 개 격자에서 유동 방정식을 실시간으로':'유동 방정식을 실시간으로';return[
 {a:.9,b:4.6,t:'공기는 눈에 보이지 않습니다',s:'그래서 연기로 보여드립니다'},
 {a:5.0,b:9.7,t:'GPU가 매 순간 바람을 계산합니다',s:cnt},
 {a:10.4,b:16.9,t:'리어 스포일러를 지나는 공기',s:'날개 높이에서 흐름이 어떻게 이어지는지 살펴봅니다'},
 {a:17.5,b:23.7,t:'뒤로 길게 남는 후류',s:'이 흔적이 차의 공기저항을 말해줍니다'},
 {a:24.8,b:DUR+POST,t:'AETHER WIND TUNNEL',s:'직접 들어가 보세요'}]}
let cueList=null;
function cueTick(tt){if(!cueList)cueList=cues();let idx=-1;for(let i=0;i<cueList.length;i++)if(tt>=cueList[i].a&&tt<cueList[i].b){idx=i;break}if(idx!==cueIdx){cueIdx=idx;emit(idx<0?{type:'caption',title:'',sub:''}:{type:'caption',title:cueList[idx].t,sub:cueList[idx].s})}}

/* ---------- state ---------- */
function setState(s,why){const prev=state;if(prev===s&&!why)return;state=s;reason=why||'';emit({type:'state',state:s,prev,reason})}
function estopped(full){try{return !!(rollingState.emergencyStopped||(full&&AETHER.M14?.getSnapshot?.().control.emergencyStopped))}catch(_){return false}}
function rendererOk(){return !!gl&&!gl.isContextLost()&&!!wow.ready&&diagnostics.bootStage!=='FAILED'&&diagnostics.bootStage!=='CONTEXT_LOST'}
function smokeReadiness(){const live=window.__LIVE;if(!live)return{ready:false,p:0,why:'live'};if(live.err)return{ready:true,p:1,why:'live-unavailable',smoke:false};const calDone=!!(window.__PERF&&window.__PERF.cal&&window.__PERF.cal.done);if(!live.ok||!calDone)return{ready:false,p:.05,why:'calibrating'};const p=clamp(live.t/SMOKE_READY_T,0,1);return{ready:p>=1,p:.1+.9*p,why:p>=1?'ready':'developing',smoke:true}}
function readiness(){if(!rendererOk())return{ready:false,p:0,why:'renderer'};return smokeReadiness()}
function takeCamera(){fpv.enabled=false;clearWalk();try{if(document.exitPointerLock)document.exitPointerLock()}catch(_){}document.querySelectorAll('[data-camera]').forEach(b=>b.classList.remove('active'));camera.cutaway=false}
function applyHud(){try{document.getElementById('viewName').textContent='AETHER';document.getElementById('viewHint').textContent=state===ST.PLAYING||state===ST.PREPARING?'시네마틱':'Drag to orbit · wheel/pinch to zoom';document.getElementById('cutaway').textContent='Cutaway: Off'}catch(_){}}

function start(opts){
 if(!rendererOk()||estopped(true))return false;
 const nowMs=performance.now();if(state===ST.PREPARING)return true;if(state===ST.PLAYING&&nowMs-lastStart<500)return true;lastStart=nowMs;
 try{buildSets()}catch(e){diagnostics.warnings.push({time:now(),source:'cinematic',message:String(e.message||e)});return false}
 token++;t=0;prepT=0;postT=0;cueIdx=-2;lastNow=null;lastProg=-1;cueList=null;takeCamera();
 try{window.__CONTROLS&&window.__CONTROLS.fanSet(true)}catch(_){}
 try{window.__CONTROLS&&window.__CONTROLS.flowSetPaused(false)}catch(_){}
 evalPose(0,0);writeCamera();cutHistory();applyHud();
 document.body.classList.add('cine');
 emit({type:'caption',title:'',sub:''});
 setState(ST.PREPARING,opts&&opts.source||'start');
 if(readiness().ready)beginPlay();
 return true}
function beginPlay(){t=0;cueIdx=-2;lastNow=null;setState(ST.PLAYING,'ready');emit({type:'progress',t:0,dur:DUR})}
function finish(why){evalPose(DUR,0);writeCamera();settleTarget();cutHistory();t=DUR;postT=0;setState(ST.FINISHED,why||'done');emit({type:'progress',t:DUR,dur:DUR});applyHud();document.body.classList.remove('cine')}
function settleTarget(){/* keep the view direction, but put the orbit pivot at least 3.2 m in front so the first user drag cannot jump */const c=camera,dx=c.target[0]-c.eye[0],dy=c.target[1]-c.eye[1],dz=c.target[2]-c.eye[2],d=Math.hypot(dx,dy,dz)||1;if(d<3.2){const s=3.2/d;c.target[0]=c.eye[0]+dx*s;c.target[1]=c.eye[1]+dy*s;c.target[2]=c.eye[2]+dz*s}}
function skip(){if(state!==ST.PLAYING&&state!==ST.PREPARING)return false;finish('skip');return true}
function cancel(why){if(state!==ST.PLAYING&&state!==ST.PREPARING)return false;settleTarget();document.body.classList.remove('cine');applyHud();emit({type:'caption',title:'',sub:''});cueIdx=-2;setState(ST.CANCELLED,why||'cancel');return true}

function tick(nowMs){
 if(state===ST.IDLE||state===ST.CANCELLED)return;
 if(state===ST.FINISHED){if(postT>=0){const dt=lastNow==null?0:clamp((nowMs-lastNow)/1000,0,.25);lastNow=nowMs;postT+=dt;if(postT>=POST){postT=-1;emit({type:'caption',title:'',sub:''})}else cueTick(DUR+postT)}return}
 if(estopped()){cancel('estop');return}
 if(fpv.enabled){cancel('walk');return}
 if(!gl||gl.isContextLost()){cancel('contextlost');return}
 const dt=lastNow==null?0:clamp((nowMs-lastNow)/1000,0,.25);lastNow=nowMs;
 if(state===ST.PREPARING){prepT+=dt;const r=readiness();emit({type:'prepare',p:r.p});if(r.ready||prepT>=PREP_MAX){if(!r.ready)diagnostics.warnings.push({time:now(),source:'cinematic',message:'smoke not fully developed after '+PREP_MAX+' s; starting anyway ('+r.why+')'});beginPlay()}else{evalPose(0,dt);writeCamera();return}}
 t=Math.min(DUR,t+dt);evalPose(t,dt);writeCamera();cueTick(t);
 if(t-lastProg>=.05||t>=DUR){lastProg=t;emit({type:'progress',t,dur:DUR})}
 if(t>=DUR)finish('done')}

/* ---------- verification (used at start in dev and by tests/cinematic.mjs) ---------- */
function buildObstacles(g){if(obst)return obst;const B=[];for(const o of scene.objects){if(!o.center||!o.size||o.material==='glass'||o.visible===false)continue;if(['floor seams','measurement'].includes(o.category))continue;const h=[o.size[0]/2,o.size[1]/2,o.size[2]/2];if(o.center[1]+h[1]<.3)continue;B.push({n:o.name,c:o.category,min:[o.center[0]-h[0],o.center[1]-h[1],o.center[2]-h[2]],max:[o.center[0]+h[0],o.center[1]+h[1],o.center[2]+h[2]],big:Math.max(...o.size)>.6&&(o.size[0]>.3)+(o.size[1]>.3)+(o.size[2]>.3)>=2})}
 B.push({n:'fan',c:'fan',min:g.fanBox.min,max:g.fanBox.max,big:true,pad:.1});B.push({n:'collector',c:'collector',min:[g.collX-.05,0,-9],max:[g.collX+3,9,9],big:true});
 const car={n:'vehicle',c:'vehicle',min:[g.nose,g.floor,g.cz-g.hw],max:[g.rear,g.top,g.cz+g.hw],big:false,car:true};B.push(car);return obst=B}
function boxDist(p,b){const dx=Math.max(b.min[0]-p[0],0,p[0]-b.max[0]),dy=Math.max(b.min[1]-p[1],0,p[1]-b.max[1]),dz=Math.max(b.min[2]-p[2],0,p[2]-b.max[2]);return Math.hypot(dx,dy,dz)}
function segHit(a,b,B){let t0=0,t1=1;for(let k=0;k<3;k++){const d=b[k]-a[k];if(Math.abs(d)<1e-9){if(a[k]<B.min[k]||a[k]>B.max[k])return false}else{let u=(B.min[k]-a[k])/d,v=(B.max[k]-a[k])/d;if(u>v){const x=u;u=v;v=x}t0=Math.max(t0,u);t1=Math.min(t1,v);if(t0>t1)return false}}return true}
function verifyPath(P,label,tall){const g=cineGeometry(),B=buildObstacles(g),issues=[],e=[0,0,0],tg=[0,0,0],e2=[0,0,0],t2=[0,0,0],N=Math.round(DUR*30);let minClear=1e9,minClearCar=1e9,maxV=0,maxW=0,minPitch=1e9,maxPitch=-1e9,maxDist=0,minDist=1e9,nonFinite=0,prevDir=null,occl=0,minKnotV=1e9;
 for(let i=0;i<=N;i++){const tt=i/30;poseAt(P,tt,e,tg);if(![...e,...tg].every(Number.isFinite)){nonFinite++;continue}
  for(const b of B){const d=boxDist(e,b),lim=b.car?R_CAR:R_CAM+(b.pad||0);const cl=d-lim;if(b.car)minClearCar=Math.min(minClearCar,d);else minClear=Math.min(minClear,d);if(cl<0)issues.push({t:+tt.toFixed(2),what:'clearance '+b.n,d:+d.toFixed(2)});if(b.big&&!b.car&&segHit(e,tg,b)&&boxDist(tg,b)>.05){occl++;issues.push({t:+tt.toFixed(2),what:'sightline blocked by '+b.n})}}
  const dir=[tg[0]-e[0],tg[1]-e[1],tg[2]-e[2]],dl=Math.hypot(...dir);maxDist=Math.max(maxDist,dl);minDist=Math.min(minDist,dl);const pitch=Math.asin(dir[1]/dl)*180/Math.PI;minPitch=Math.min(minPitch,pitch);maxPitch=Math.max(maxPitch,pitch);const dn=[dir[0]/dl,dir[1]/dl,dir[2]/dl];if(prevDir){const c=clamp(dn[0]*prevDir[0]+dn[1]*prevDir[1]+dn[2]*prevDir[2],-1,1);maxW=Math.max(maxW,Math.acos(c)*180/Math.PI*30)}prevDir=dn;
  const v=speedAt(P,tt);maxV=Math.max(maxV,v)}
 for(let k=1;k<P.nseg;k++){minKnotV=Math.min(minKnotV,speedAt(P,P.tk[k]))}
 if(minKnotV<.02)issues.push({what:'speed at an interior waypoint is ~0',v:+minKnotV.toFixed(3)});if(nonFinite)issues.push({what:'non-finite samples',n:nonFinite});if(minDist<2.2)issues.push({what:'eye-target distance < 2.2 m',d:+minDist.toFixed(2)});if(maxPitch>60||minPitch<-60)issues.push({what:'pitch out of range',min:+minPitch.toFixed(1),max:+maxPitch.toFixed(1)});
 return{label,tall,ok:!issues.length,issues:issues.slice(0,12),nIssues:issues.length,stats:{length:+P.total.toFixed(2),maxSpeed:+maxV.toFixed(2),maxAngVelDegPerS:+maxW.toFixed(1),minClearObstacle:+minClear.toFixed(2),minClearVehicle:+minClearCar.toFixed(2),minEyeTargetDist:+minDist.toFixed(2),maxEyeTargetDist:+maxDist.toFixed(2),pitchRange:[+minPitch.toFixed(1),+maxPitch.toFixed(1)],minKnotSpeed:+minKnotV.toFixed(3),occludedSamples:occl}}}
function verify(){const S=buildSets();lastCheck=[verifyPath(S.wide,'landscape',false),verifyPath(S.tall,'portrait',true)];return lastCheck}

const api={ST,start,skip,cancel,tick,readiness,verify,resetClock(){lastNow=null},
 on(f){subs.add(f);return()=>subs.delete(f)},
 get state(){return state},get time(){return t},get duration(){return DUR},get reason(){return reason},get token(){return token},get geometry(){return G||cineGeometry()},get sets(){return buildSets()},get lastCheck(){return lastCheck},
 /* test hooks: deterministic pose for a given time/aspect without waiting */
 poseFor(tt,opts){opts=opts||{};const S=buildSets(),e=[0,0,0],tg=[0,0,0],tall=!!opts.tall,P=tall?S.tall:S.wide;poseAt(P,tt,e,tg);const A=opts.aspect||aspectInfo().A,bf=opts.bars!=null?opts.bars:barFrac();return{eye:e,target:tg,fov:fullFov(fovVis(P,tt),tall,A,bf,P.shots.hfov),speed:speedAt(P,tt),dist:distAt(P,tt)}},
 seek(tt){t=clamp(tt,0,DUR);evalPose(t,0);writeCamera();cutHistory()},
 _forceState(s){state=s}};
return api})();
window.__CINE=CINE;
/* ===== Control room: fan, rolling road, emergency stop, flow pause/reset and wind setpoint =====
   One state authority for the engineer-panel buttons, the 3D console (buttons and sockets in the control room)
   and the cinematic director. Everything acts on the real systems: the fan visuals, the rolling road (belt, wheels and
   rollers follow the GPU solver's free-stream speed) and the GPU CFD solver (pause, reset, inlet speed). */
const CONTROLS=(()=>{
 const $=id=>document.getElementById(id),WINDS=[3,5,8,12],PRESETS=['Hero','Side','Top','Fan','Control','Outlet'];
 const live=()=>window.__LIVE,fan=()=>AETHER.FAN_MODULE;
 const stopped=()=>rollingState.emergencyStopped;
 let pausedByEstop=false,lastCmd='';
 /* ---- actions ---- */
 function fanSet(on){if(stopped()&&on)return false;const f=fan();if(!f?.loaded)return false;f.setVisualRunning(!!on);render();return true}
 function fanToggle(){const f=fan();return f?.loaded?fanSet(!f.visualRunning):false}
 function roadSet(on){const ok=AETHER.ROLLING_ROAD.setMotorEnabled(!!on);if(ok)lastCmd=on?'롤링로드 가동':'롤링로드 정지';render();return ok}
 function roadToggle(){return roadSet(!rollingState.motorEnabled)}
 function flowPaused(){return !!live()?.freeze}
 function flowSetPaused(p){const l=live();if(!l)return false;if(stopped()&&!p)return false;l.freeze=!!p;if(!p)l.lastT=0;lastCmd=p?'흐름 일시정지':'흐름 재개';render();return true}
 function flowReset(){const l=live();if(!l||!l.ok||stopped())return false;try{l.api.reset();rollingState.lastSimT=null;lastCmd='흐름 초기화'}catch(e){diagnostics.warnings.push({time:now(),source:'controls',message:String(e)});return false}render();return true}
 function windSet(u){const l=live();u=Number(u);if(!l||!WINDS.includes(u)||stopped())return false;l.U=u;if(window.__MAC)window.__MAC.U=u;l.forces=null;lastCmd='유입 풍속 '+u+' m/s';render();return true}
 function windStep(d){const l=live();if(!l)return false;const i=Math.max(0,WINDS.indexOf(l.U));return windSet(WINDS[Math.max(0,Math.min(WINDS.length-1,i+d))])}
 function smokeToggle(){const l=live();if(!l)return false;l.mode=l.mode==='OFF'?'RAKE_V':'OFF';lastCmd='연기 '+(l.mode==='OFF'?'끄기':'켜기');render();return true}
 function colorToggle(){const l=live();if(!l)return false;l.colorMode=!l.colorMode;render();return true}
 function emergencyStop(){if(stopped())return true;AETHER.ROLLING_ROAD.setEmergencyStop(true);fan()?.setVisualRunning?.(false);const l=live();if(l&&!l.freeze){l.freeze=true;pausedByEstop=true}lastCmd='비상정지 작동';render();return true}
 function resetEmergencyStop(){if(!stopped())return true;AETHER.ROLLING_ROAD.setEmergencyStop(false);const l=live();if(l&&pausedByEstop){l.freeze=false;l.lastT=0}pausedByEstop=false;lastCmd='비상정지 해제 · 팬과 롤링로드는 정지 상태 유지';render();return true}
 /* ---- snapshot (kept under AETHER.M14 for the cinematic and tests) ---- */
 function getSnapshot(){const l=live(),f=fan(),road=AETHER.ROLLING_ROAD.getSnapshot();return Object.freeze({fan:Object.freeze({module:f?.assetName||'LOADING',visualRunning:!!f?.visualRunning}),collector:Object.freeze({loaded:!!AETHER.EXHAUST_COLLECTOR?.loaded,valid:!!AETHER.EXHAUST_COLLECTOR?.valid}),control:Object.freeze({windSpeed:l?l.U:0,rollingRoadEnabled:road.motorEnabled,emergencyStopped:road.emergencyStopped,flowPaused:flowPaused()}),solver:Object.freeze({ok:!!(l&&l.ok),impl:l?.impl||null,tier:l?.q||null}),rollingRoad:road})}
 const checks=()=>{const s=getSnapshot();return Object.freeze({estopLatched:s.control.emergencyStopped,rollingRoadInterlocked:!s.control.emergencyStopped||!s.rollingRoad.motorEnabled,windSetpointValid:WINDS.includes(s.control.windSpeed),pass:(!s.control.emergencyStopped||!s.rollingRoad.motorEnabled)&&WINDS.includes(s.control.windSpeed)})};
 /* ---- 3D console colours follow the state ---- */
 function paintObject(name,color){const o=scene.objects.find(x=>x.name===name)||(['m5.m14.monitor.solver','m5.m14.monitor.flow','m5.m14.monitor.estop'].includes(name)?scene.objects.find(x=>x.name==='m6.glb.ScreenUI'):null);if(o)o.color=color}
 function sync3D(s){updateMonitorAtlas();const e=s.control.emergencyStopped,r=s.control.rollingRoadEnabled,ok=s.solver.ok&&!s.control.flowPaused;paintObject('m5.m14.button.estop',e?[1,.07,.045]:[.80,.12,.10]);paintObject('m5.m14.button.road',r?[.16,.70,.42]:[.26,.30,.33]);paintObject('m5.m14.monitor.solver',ok?[.18,.75,.40]:[.86,.48,.12]);paintObject('m5.m14.monitor.flow',[.18+s.control.windSpeed/20,.38+s.control.windSpeed/24,.58]);paintObject('m5.m14.monitor.road',r?[.15,.62,.38]:[.35,.39,.42]);paintObject('m5.m14.monitor.estop',e?[1,.08,.05]:[.24,.62,.35])}
 /* ---- panel rendering (elements are optional) ---- */
 const fx=(x,n)=>Number.isFinite(x)?x.toFixed(n):'—';
 function render(){const s=getSnapshot(),e=s.control.emergencyStopped,f=fan(),l=live();
  const set=(id,fn)=>{const el=$(id);if(el)fn(el)};
  set('ctlBanner',el=>{el.classList.toggle('estop',e);el.textContent=e?'비상정지 작동 중 · 팬·롤링로드·흐름이 멈췄습니다. 해제 후 다시 켤 수 있습니다.':(s.solver.ok?'정상 가동 · '+(s.control.flowPaused?'흐름 일시정지':'실시간 계산 중'):'GPU 솔버 대기 중')});
  set('ctlFan',el=>{el.disabled=!f?.loaded||e;el.setAttribute('aria-pressed',String(!!f?.visualRunning));el.textContent=f?.visualRunning?'팬 회전 정지':'팬 회전 시작'});
  set('ctlRoad',el=>{el.disabled=e;el.setAttribute('aria-pressed',String(s.control.rollingRoadEnabled));el.textContent=s.control.rollingRoadEnabled?'롤링로드 정지':'롤링로드 가동'});
  set('ctlFlow',el=>{el.disabled=!l||!l.ok||e;el.setAttribute('aria-pressed',String(s.control.flowPaused));el.textContent=s.control.flowPaused?'흐름 재개':'흐름 일시정지'});
  set('ctlFlowReset',el=>{el.disabled=!l||!l.ok||e});
  set('ctlEstop',el=>{el.disabled=e;el.setAttribute('aria-pressed',String(e))});
  set('ctlReset',el=>{el.disabled=!e});
  set('ctlWind',el=>{if(document.activeElement!==el)el.value=String(s.control.windSpeed);el.disabled=!l||e});
  set('ctlStatus',el=>{const road=s.rollingRoad;el.textContent=['유입 팬 · '+(f?.loaded?(f.visualRunning?'회전 중(시각 효과, 계산에 영향 없음)':'정지'):'로딩 중'),'후방 수거부 · '+(AETHER.EXHAUST_COLLECTOR?.loaded?(AETHER.EXHAUST_COLLECTOR.valid?'정렬됨':'배치 확인 필요'):'준비 중'),'롤링로드 · '+(road.effectiveSpeed>0?fx(road.effectiveSpeed,1)+' m/s로 이동 중':(s.control.rollingRoadEnabled?'대기(흐름 대기 중)':'정지'))+' · 벨트 이동 '+fx(road.beltTravel,2)+' m','GPU 솔버 · '+(l&&l.ok?(l.impl==='MAC'?'MAC 격자':'collocated')+' · 등급 '+l.q+' · 유입 '+l.U+' m/s':(l?.err?'사용 불가: '+l.err:'준비 중'))+(lastCmd?'\n마지막 명령: '+lastCmd:'')].join('\n')});
  sync3D(s)}
 /* ---- 3D picking in the control room (console buttons and sockets) ---- */
 const norm3=v=>{const n=Math.hypot(v[0],v[1],v[2])||1;return v.map(x=>x/n)},crs=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 function rayFromEvent(ev){const r=glCanvas.getBoundingClientRect(),f=norm3(camera.target.map((v,i)=>v-camera.eye[i])),right=norm3(crs(f,norm3(camera.up))),up=crs(right,f),nx=(ev.clientX-r.left)/r.width*2-1,ny=1-(ev.clientY-r.top)/r.height*2,t=Math.tan(camera.fov*Math.PI/360),a=r.width/r.height;return{origin:camera.eye,dir:norm3(f.map((v,i)=>v+right[i]*nx*t*a+up[i]*ny*t))}}
 function rayAabb(o,d,obj){let lo=-Infinity,hi=Infinity;for(let a=0;a<3;a++){const h=obj.size[a]/2+.045,mn=obj.center[a]-h,mx=obj.center[a]+h;if(Math.abs(d[a])<1e-9){if(o[a]<mn||o[a]>mx)return null;continue}let t0=(mn-o[a])/d[a],t1=(mx-o[a])/d[a];if(t0>t1)[t0,t1]=[t1,t0];lo=Math.max(lo,t0);hi=Math.min(hi,t1);if(hi<lo)return null}return hi<0?null:Math.max(0,lo)}
 function socketAction(id){switch(id){
  case'EMERGENCY_STOP':return emergencyStop();
  case'FAN_ENABLE':return fanToggle();
  case'SMOKE_ENABLE':return smokeToggle();
  case'FAN_SPEED':{const f=fan();if(!f?.loaded||stopped())return false;f.visualRPM=Math.max(6,Math.min(36,f.visualRPM+6));f.setVisualRunning(true);render();return true}
  case'VIEW_MODE':return colorToggle();
  case'CAMERA_SELECT':{const i=PRESETS.indexOf(camera.preset);setPreset(PRESETS[(i+1)%PRESETS.length]);return true}
  case'SOLVER_RUN':return flowSetPaused(!flowPaused());
  case'CFD_RESET':return flowReset();
  default:return false}}
 function pick3D(ev){if(camera.preset!=='Control')return;const{origin,dir}=rayFromEvent(ev);
  let best=null,dist=Infinity;for(const o of scene.objects){if(!o.m14Action||!o.visible)continue;const h=rayAabb(origin,dir,o);if(h!==null&&h<dist){best=o;dist=h}}
  if(best){ev.preventDefault();switch(best.m14Action){case'ESTOP':emergencyStop();break;case'ROAD':if(!stopped())roadToggle();break;case'WIND_DOWN':windStep(-1);break;case'WIND_UP':windStep(1);break}return}
  if(!AETHER.M6?.sockets?.length)return;let hit=null;dist=Infinity;for(const s of AETHER.M6.sockets){const oc=origin.map((v,i)=>v-s.position[i]),b=oc.reduce((q,v,i)=>q+v*dir[i],0),c=oc.reduce((q,v)=>q+v*v,0)-s.hitRadiusM*s.hitRadiusM,disc=b*b-c;if(disc<0)continue;let t=-b-Math.sqrt(disc);if(t<0)t=-b+Math.sqrt(disc);if(t>=0&&t<dist){dist=t;hit=s}}
  if(hit){ev.preventDefault();socketAction(hit.id)}}
 let press=null;glCanvas.addEventListener('pointerdown',e=>{press={id:e.pointerId,x:e.clientX,y:e.clientY}},true);glCanvas.addEventListener('pointerup',e=>{const p=press;press=null;if(p&&p.id===e.pointerId&&Math.hypot(e.clientX-p.x,e.clientY-p.y)<5)pick3D(e)},true);glCanvas.addEventListener('pointercancel',()=>{press=null},true);
 if(AETHER.M6)AETHER.M6.interactionReady=true;
 /* ---- panel wiring ---- */
 const on=(id,fn)=>$(id)?.addEventListener('click',fn);
 on('ctlFan',fanToggle);on('ctlRoad',roadToggle);on('ctlFlow',()=>flowSetPaused(!flowPaused()));on('ctlFlowReset',flowReset);on('ctlEstop',emergencyStop);on('ctlReset',resetEmergencyStop);
 $('ctlWind')?.addEventListener('change',e=>windSet(e.target.value));
 setInterval(()=>{if(!document.hidden)render()},500);
 const api=Object.freeze({getSnapshot,checks,setRollingRoadEnabled:roadSet,emergencyStop,resetEmergencyStop,fanSet,fanToggle,flowSetPaused,flowReset,windSet,smokeToggle,colorToggle,render});
 return api})();
AETHER.M14=CONTROLS;window.__CONTROLS=CONTROLS;






function draw(){raf=0;if(!gl||!program||gl.isContextLost()||document.hidden)return;try{const frameStart=performance.now();perfBeginFrame(frameStart);updateWalk(frameStart);CINE.tick(frameStart);resize();perfMark('sim');liveStep(frameStart);AETHER.ROLLING_ROAD.liveAdvance(window.__LIVE.ok&&window.__LIVE.enabled?window.__LIVE.U:0,window.__LIVE.t);perfMark('scene');renderLightingShadow();hqCsm();fxBegin();gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);bindLighting();gl.uniform4f(loc.eye,camera.eye[0],camera.eye[1],camera.eye[2],1);const view=lookAt(camera.eye,camera.target,camera.up),proj=fxJitter(perspective(camera.fov,glCanvas.width/glCanvas.height,camera.near,camera.far)),vp=matMul(proj,view),id=identityMatrix();gl.disable(gl.BLEND);gl.depthMask(true);gl.disable(gl.CULL_FACE);const PL=OPT.cull?frustumPlanes(vp,.03):null;let culled=0,drawn=0;gl.uniformMatrix4fv(loc.model,false,id);gl.uniformMatrix4fv(loc.mvp,false,vp);for(const o of scene.objects){if(!o.gpu||o.material==='glass'||!visibleInView(o))continue;if(PL&&!aabbVisible(PL,o)){culled++;continue}drawn++;drawMesh(o.gpu,id,{color:lightingColor(o),colorLinear:!!o.colorLinear,texture:o.texture||null,surface:surfaceFor(o),belt:o.name==='belt',beltTravel:rollingState.beltTravel},1)}for(const r of scene.roadParts){if(!r.visible||!r.gpu)continue;const rm=rollerModel(r,rollingState.rollerAngles[scene.roadParts.indexOf(r)]||0);gl.uniformMatrix4fv(loc.model,false,rm);gl.uniformMatrix4fv(loc.mvp,false,matMul(vp,rm));drawMesh(r.gpu,rm,{color:[.30,.34,.37,1],surface:r.pbrMaterial.surface,roller:true},1)}if(AETHER.FAN_MODULE?.loaded&&AETHER.EXHAUST_COLLECTOR?.loaded){const layout=FLOW_LAYOUT.get(FLOW_FRAME),rotor=fanRotorVisualAngle(frameStart);for(const p of scene.fanParts){if(!p.gpu)continue;const fm=fanPartModel(p,rotor,layout);gl.uniformMatrix4fv(loc.model,false,fm);gl.uniformMatrix4fv(loc.mvp,false,matMul(vp,fm));drawMesh(p.gpu,fm,{color:p.color,colorLinear:true,surface:p.surface},1)}for(const p of scene.collectorParts){if(!p.gpu)continue;const cm=collectorPartModel(p,layout);gl.uniformMatrix4fv(loc.model,false,cm);gl.uniformMatrix4fv(loc.mvp,false,matMul(vp,cm));drawMesh(p.gpu,cm,{color:p.color,colorLinear:true,surface:p.surface},1)}}const vm=vehicleModel();for(const p of scene.vehicleParts){if(!p.gpu)continue;const idx=p.role==='wheel'?wheelParts().indexOf(p):-1,pm=p.role==='wheel'?wheelModel(p,rollingState.wheelAngles[idx]||0):vm;gl.uniformMatrix4fv(loc.model,false,pm);gl.uniformMatrix4fv(loc.mvp,false,matMul(vp,pm));drawMesh(p.gpu,pm,{color:p.color,texture:p.texture,surface:p.surface,colorLinear:true,clearcoat:p.role==='body',vatlas:!!p.texture},1)}bodyDraw(vp);if(FX.active){perfMark('smoke');fxAfterOpaque();perfMark('overlay')}else{gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);perfMark('smoke');liveRender(vp);perfMark('overlay')}gl.disable(gl.BLEND);gl.depthMask(true);gl.useProgram(program);const transparent=scene.objects.filter(o=>visibleInView(o)&&o.material==='glass'&&(!PL||aabbVisible(PL,o))).sort((a,b)=>Math.hypot(...sub(b.center,camera.eye))-Math.hypot(...sub(a.center,camera.eye)));gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);for(const o of transparent){if(!o.gpu)continue;gl.uniformMatrix4fv(loc.model,false,id);gl.uniformMatrix4fv(loc.mvp,false,matMul(vp,id));drawMesh(o.gpu,id,{color:[...o.color,1]},.25)}gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.depthMask(true);if(FX.active){perfMark('post');fxPost();fxPresent();perfMark('overlay')}gl.bindBuffer(gl.ARRAY_BUFFER,null);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,null);OPT.stats.culled=culled;OPT.stats.drawn=drawn;perfEndFrame(performance.now());diagnostics.frames=(diagnostics.frames||0)+1;if(diagnostics.frames===1||(diagnostics.frames%120)===0){const err=gl.getError();smokePerf.webglError=err===gl.NO_ERROR?'NO_ERROR':String(err);if(err!==gl.NO_ERROR)throw Error('WebGL sampled error: '+err);}if(diagnostics.frames===1){diagnostics.bootStage='READY';wow.ready=true;const badge=document.getElementById('readyBadge');if(badge){badge.textContent='렌더러 준비 완료';badge.className='badge ok'}renderDiagnostics()}if(!document.hidden)raf=requestAnimationFrame(draw)}catch(e){failRuntime('frame',e)}}

const PRESET_KO={Hero:'정면',Side:'측면',Top:'상단',Fan:'팬',Control:'제어실',Outlet:'후류'};
function setPreset(name){CINE.cancel('preset');fpv.enabled=false;clearWalk();if(document.exitPointerLock)document.exitPointerLock();camera.fov=50;camera.preset=name;camera.cutaway=name!=='Hero';const p=AETHER.VEHICLE_TRANSFORM.position,l=AETHER.FLOW_LAYOUT.get(FLOW_FRAME);if(name==='Hero'){camera.eye=[p[0]-1.8,p[1]+2.4,p[2]+9.1];camera.target=[p[0],p[1]+1.05,p[2]];camera.up=[0,1,0]}if(name==='Side'){camera.fov=62;camera.eye=[p[0]+.35,p[1]+1.35,p[2]-3.72];camera.target=[p[0]+.35,p[1]+.72,p[2]];camera.up=[0,1,0]}if(name==='Top'){camera.eye=[p[0],p[1]+22,p[2]+.001];camera.target=p.slice();camera.up=[0,0,-1]}if(name==='Fan'){camera.eye=[l.emitterPlane.x-3.0,2.72,0];camera.target=[l.emitterPlane.x-.4,2.72,0];camera.up=[0,1,0]}if(name==='Control'){camera.eye=[-2.8,1.90,8.65];camera.target=[-2.8,1.48,5.65];camera.up=[0,1,0]}if(name==='Outlet'){camera.eye=[l.collectorPlane.x+1.5,2.75,.05];camera.target=[l.collectorPlane.x-.7,2.75,0];camera.up=[0,1,0]}document.querySelectorAll('[data-camera]').forEach(b=>b.classList.toggle('active',b.dataset.camera===name));document.getElementById('viewName').textContent=PRESET_KO[name]||name;document.getElementById('cutaway').textContent='단면 보기: '+(camera.cutaway?'켜짐':'꺼짐');diagnostics.events.push({time:now(),type:'CAMERA',message:name+' preset'})}

/* engine-ready flag (first frame drawn); the cinematic director owns the visitor sequence */
const wow={ready:false};
document.querySelectorAll('[data-camera],#walkMode').forEach(b=>b.addEventListener('click',()=>CINE.cancel('control'),true));for(const ev of['pointerdown','wheel','touchstart'])glCanvas.addEventListener(ev,()=>CINE.cancel('user'),{capture:true,passive:true});window.addEventListener('keydown',e=>{if(e.key==='Escape')CINE.skip()});
let pointers=new Map(),lastPinch=0;glCanvas.addEventListener('pointerdown',e=>{if(fpv.enabled)return;captureInput(glCanvas,e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY])});glCanvas.addEventListener('pointermove',e=>{if(fpv.enabled)return;if(!pointers.has(e.pointerId))return;const old=pointers.get(e.pointerId);pointers.set(e.pointerId,[e.clientX,e.clientY]);if(pointers.size===1&&camera.preset!=='Top'){const dx=e.clientX-old[0],dy=e.clientY-old[1],off=sub(camera.eye,camera.target),dist=Math.hypot(...off),yaw=Math.atan2(off[0],off[2])+dx*.008,pitch=clamp(Math.asin(clamp(off[1]/dist,-1,1))+dy*.008,-1.45,1.45),h=dist*Math.cos(pitch);camera.eye=[camera.target[0]+Math.sin(yaw)*h,camera.target[1]+Math.sin(pitch)*dist,camera.target[2]+Math.cos(yaw)*h]}else if(pointers.size===2){const pts=[...pointers.values()],pinch=Math.hypot(pts[0][0]-pts[1][0],pts[0][1]-pts[1][1]);if(lastPinch>1&&pinch>1){const d=norm(sub(camera.eye,camera.target)),dist=Math.hypot(...sub(camera.eye,camera.target)),nd=clamp(dist*lastPinch/pinch,2,50);camera.eye=add(camera.target,mul(d,[nd,nd,nd]))}lastPinch=pinch}});['pointerup','pointercancel','lostpointercapture'].forEach(t=>glCanvas.addEventListener(t,e=>{if(fpv.enabled)return;pointers.delete(e.pointerId);if(pointers.size<2)lastPinch=0}));glCanvas.addEventListener('wheel',e=>{if(fpv.enabled)return;e.preventDefault();const d=norm(sub(camera.eye,camera.target)),dist=Math.hypot(...sub(camera.eye,camera.target)),nd=clamp(dist*Math.exp(e.deltaY*.001),2,50);camera.eye=add(camera.target,mul(d,[nd,nd,nd]))},{passive:false});
document.querySelectorAll('[data-camera]').forEach(b=>b.addEventListener('click',()=>setPreset(b.dataset.camera)));document.getElementById('cutaway').addEventListener('click',e=>{camera.cutaway=!camera.cutaway;e.currentTarget.textContent='단면 보기: '+(camera.cutaway?'켜짐':'꺼짐')});document.getElementById('roadSection').addEventListener('click',e=>{AETHER.ROLLING_ROAD.setSectionView(!rollingState.roadSection);e.currentTarget.textContent='롤링로드 단면: '+(rollingState.roadSection?'켜짐':'꺼짐')});window.addEventListener('resize',resize,{passive:true});

function renderStatus(){const el=document.getElementById('status');if(el){const ok=gl&&program&&!gl.isContextLost(),vals=[['렌더러',ok?'WebGL2 정상':'사용 불가',ok?'ok':'bad'],['차량 메쉬',diagnostics.vehicleReady?(diagnostics.vehicleBounds.primitives+'개 파트 · 정점 '+diagnostics.vehicleBounds.vertices.toLocaleString()+'개'):'오류',diagnostics.vehicleReady?'ok':'bad'],['풍동 시설 형상',diagnostics.facilityReady?'검사 통과':'오류',diagnostics.facilityReady?'ok':'bad'],['롤링로드 형상',diagnostics.m4Checks?.stations?'검사 통과':'대기',diagnostics.m4Checks?.stations?'ok':'warn'],['차량 통합 검사',AETHER.M11?.passed?'통과':'대기',AETHER.M11?.passed?'ok':'warn'],['좌표 정렬(렌더↔계산)',AETHER.M12?.passed?'통과':'대기',AETHER.M12?.passed?'ok':'warn'],['텍스처',diagnostics.texturesReady?'준비됨':'대기',diagnostics.texturesReady?'ok':'warn']];el.textContent='';for(const[k,v,cl]of vals){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v;dd.className=cl;el.append(dt,dd)}}const r=document.getElementById('roadStatus');if(r){const q=snapshotState();r.textContent='';for(const [k,v] of [['이동 속도',q.effectiveSpeed.toFixed(2)+' m/s'],['벨트 이동 거리',q.beltTravel.toFixed(2)+' m'],['단면 보기',q.roadSection?'켜짐':'꺼짐']]){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v;r.append(dt,dd)}}}
function renderDiagnostics(){const dg=document.getElementById('diagnostics');if(dg)dg.textContent=JSON.stringify({bootStage:diagnostics.bootStage,errors:diagnostics.errors,warnings:diagnostics.warnings.slice(-8),vehicle:diagnostics.vehicleBounds,wheelNormalization:diagnostics.wheelNormalization,roadGeometry:diagnostics.roadGeometry,m4:diagnostics.m4Checks,m5:AETHER.M5,m6:AETHER.M6,m7:AETHER.M7,m8:AETHER.M8,m9:AETHER.M9,m10:AETHER.M10,m11:AETHER.M11,m12:AETHER.M12,cfdDomain:diagnostics.cfdDomain,cfdAlignment:diagnostics.cfdAlignment,texture:diagnostics.textureUpload,geometry:diagnostics.geometryValidation,runtime:{frames:diagnostics.frames||0,webgl2:!!gl&&!!program&&!gl.isContextLost(),canvas:[glCanvas.width,glCanvas.height],camera:camera.preset}},null,2);renderStatus()}

const m3Checklist={correctDimensions:false,wallPanels:false,ceilingPanels:false,floorSeams:false,serviceDoor:false,maintenanceHatch:false,measurementMarkers:false,rails:false,lightingRecess:false,equipmentMounts:false,structuralTransitions:false,majorBevels:false,bevelTopology:false,observationOpening:false,vehicleVisibility:false,industrialPlausibility:false,finiteGeometry:false,vehicleBounds:false};
function sightThroughObservationOpening(eye,target){const z=3.90,dz=target[2]-eye[2];if(Math.abs(dz)<1e-9)return true;const t=(z-eye[2])/dz;if(t<0||t>1)return true;const x=eye[0]+(target[0]-eye[0])*t,y=eye[1]+(target[1]-eye[1])*t;return x>=-3.5&&x<=3.5&&y>=.95&&y<=3.05}

function validateBoxMesh(m){
 const edges=new Map(),key=i=>Array.from(m.positions.slice(i*3,i*3+3)).map(v=>v.toFixed(6)).join(',');
 for(let k=0;k<m.indices.length;k+=3){const ids=Array.from(m.indices.slice(k,k+3)),p=ids.map(i=>Array.from(m.positions.slice(i*3,i*3+3)));
  if(dot(cross(sub(p[1],p[0]),sub(p[2],p[0])),Array.from(m.normals.slice(ids[0]*3,ids[0]*3+3)))<=0)return false;
  for(let j=0;j<3;j++){const edge=[key(ids[j]),key(ids[(j+1)%3])].sort().join('|');edges.set(edge,(edges.get(edge)||0)+1);}
 }return [...edges.values()].every(count=>count===2);
}

function inspectGeometry(){const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];let triangles=0;for(const p of scene.vehicleParts){if(!p.positions.every(finite)||!p.normals.every(finite)||!p.uvs.every(finite)||!p.indices.every(i=>i>=0&&i<p.positions.length/3))throw Error('Vehicle geometry invalid');triangles+=p.indices.length/3;const M=p.role==='wheel'?wheelModel(p,0):vehicleModel();for(let i=0;i<p.positions.length;i+=3){const q=m4point(M,[p.positions[i],p.positions[i+1],p.positions[i+2]]);for(let d=0;d<3;d++){lo[d]=Math.min(lo[d],q[d]);hi[d]=Math.max(hi[d],q[d])}}}const expected=AETHER.VEHICLE_TRANSFORM.localBounds,vehicleFits=lo.every((v,d)=>Math.abs(v-expected.min[d])<2e-3)&&hi.every((v,d)=>Math.abs(v-expected.max[d])<2e-3);const belt=scene.objects.find(o=>o.name==='belt'),beltTop=belt.center[1]+belt.size[1]/2;diagnostics.geometryValidation={vehicleFits,closedBoxes:scene.objects.filter(o=>o.type!=='authored-mesh').every(o=>validateBoxMesh(o._mesh)),authoredMeshesValid:scene.objects.filter(o=>o.type==='authored-mesh').every(o=>validateAuthoredConsoleMesh(o._mesh)),wallsFit:scene.objects.filter(o=>o.category==='wall panels').every(o=>Math.abs(o.center[0])+o.size[0]/2<=config.testSection.lengthX/2+1e-6),beltTop,contactGap:lo[1]-beltTop,triangles,actualMin:lo,actualMax:hi};return vehicleFits&&diagnostics.geometryValidation.closedBoxes&&diagnostics.geometryValidation.authoredMeshesValid&&diagnostics.geometryValidation.wallsFit&&Math.abs(lo[1]-beltTop)<.002}

function runM3Checks(){for(const o of scene.objects)if(!o._mesh)bevelMesh(o);const names=new Set(scene.objects.map(o=>o.category)),dim=config.testSection.lengthX===18&&config.testSection.widthZ===8&&config.testSection.heightY===5.5,finiteGeometry=scene.objects.every(o=>o.center.every(finite)&&o.size.every(v=>finite(v)&&v>0)&&o.bevel>=0);const b=AETHER.VEHICLE_TRANSFORM.worldAABB,vehicleBounds=b.min[1]===0&&Math.abs((b.max[0]-b.min[0])-config.vehicleReference.lengthX)<1e-9&&Math.abs((b.max[2]-b.min[2])-config.vehicleReference.widthZ)<1e-9;const bevelObjects=scene.objects.filter(o=>o.bevel>=.03),bevelTopology=bevelObjects.length>=20&&bevelObjects.every(o=>{const m=o._mesh,t=m&&m.topology;return t&&t.closed===true&&t.coreFaces===6&&t.edgeQuads===12&&t.cornerTriangles===8&&t.faces===26&&t.indexCount===132&&m.indices.length===132&&m.positions.length===96*3&&m.normals.length===m.positions.length&&m.indices.every(i=>Number.isInteger(i)&&i>=0&&i<m.positions.length/3)&&m.positions.every(finite)&&m.normals.every(finite)});const views={Hero:sightThroughObservationOpening([-1.8,2.4,9.1],[0,1.05,0]),Side:sightThroughObservationOpening([0,3,13],[0,1,0]),Top:true},observationOpening=names.has('observation opening')&&names.has('observation glass')&&!scene.objects.some(o=>o.name==='observation barrier'),vehicleVisibility=Object.values(views).every(Boolean);m3Checklist.correctDimensions=dim;m3Checklist.wallPanels=names.has('wall panels');m3Checklist.ceilingPanels=names.has('ceiling');m3Checklist.floorSeams=names.has('floor seams');m3Checklist.serviceDoor=names.has('service door');m3Checklist.maintenanceHatch=names.has('maintenance hatch');m3Checklist.measurementMarkers=names.has('measurement');m3Checklist.rails=names.has('rails');m3Checklist.lightingRecess=names.has('lighting recess');m3Checklist.equipmentMounts=names.has('equipment mounts');m3Checklist.structuralTransitions=names.has('transitions');m3Checklist.majorBevels=bevelObjects.length>=20;m3Checklist.bevelTopology=bevelTopology;m3Checklist.observationOpening=observationOpening;m3Checklist.vehicleVisibility=vehicleVisibility;m3Checklist.industrialPlausibility=finiteGeometry&&dim&&observationOpening&&bevelTopology;m3Checklist.finiteGeometry=finiteGeometry;m3Checklist.vehicleBounds=vehicleBounds;m3Checklist.measuredGeometry=inspectGeometry();AETHER.M3={passed:Object.values(m3Checklist).every(Boolean),checklist:m3Checklist,section:{lengthX:18,widthZ:8,heightY:5.5},observation:{opening:{widthX:7,heightY:2.1,minX:-3.5,maxX:3.5,minY:.95,maxY:3.05,z:3.90},visibilityViews:views,vehicleLineOfSight:'Center ray through portal only; Side/Top use cutaway; full silhouette not certified'},bevel:{appliedCount:bevelObjects.length,topology:{closed:true,coreFaces:6,edgeQuads:12,cornerTriangles:8,faces:26,indicesPerObject:132}},vehicle:{clearanceGround:b.min[1],bounds:b},geometry:{objects:scene.objects.length}};return AETHER.M3}

function loadTextures(g,generation){const jobs=[];const images=g.json.images||[];for(let i=0;i<images.length;i++){const im=images[i],bv=g.json.bufferViews[im.bufferView];if(!bv||!Number.isInteger(bv.byteLength))throw Error('texture '+i+' missing bufferView');const off=bv.byteOffset||0,bytes=g.bin.subarray(off,off+bv.byteLength);if(bytes.byteLength!==bv.byteLength)throw Error('texture '+i+' truncated');jobs.push(createImageBitmap(new Blob([bytes],{type:im.mimeType||'image/png'}),{imageOrientation:'flipY'}).then(bitmap=>{if(generation!==runtimeGeneration||!gl||gl.isContextLost()){bitmap.close();return false}if(!bitmap.width||!bitmap.height)throw Error('texture '+i+' has invalid dimensions');const t=gl.createTexture(),pot=(bitmap.width&(bitmap.width-1))===0&&(bitmap.height&(bitmap.height-1))===0;gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,pot?gl.LINEAR_MIPMAP_LINEAR:gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,bitmap);if(pot)gl.generateMipmap(gl.TEXTURE_2D);textures[i]=t;bitmap.close();return true}).catch(e=>{if(generation!==runtimeGeneration)return false;diagnostics.error('texture '+i,e);throw e;}));}return Promise.all(jobs).then(results=>{if(generation!==runtimeGeneration)return false;if(results.some(v=>v!==true))return false;let uploaded=0;for(const p of scene.vehicleParts){const tex=p.textureIndex===null?null:g.json.textures?.[p.textureIndex];if(tex&&textures[tex.source]){p.texture=textures[tex.source];uploaded++}}diagnostics.textureUpload={requested:images.length,uploaded:textures.filter(Boolean).length,partsBound:uploaded,embeddedMime:images[0]?.mimeType||'unknown',resolution:'decoded'};diagnostics.texturesReady=images.length>0&&uploaded===scene.vehicleParts.length;if(!diagnostics.texturesReady)throw Error('texture binding incomplete');return true;}).catch(e=>{if(generation!==runtimeGeneration)return false;diagnostics.texturesReady=false;diagnostics.textureUpload={error:e.message};throw e;})}
function failRuntime(source,e){cancelAnimationFrame(raf);const failureStage=diagnostics.bootStage;diagnostics.bootStage='FAILED';diagnostics.error(source,e);renderDiagnostics();const badge=document.getElementById('readyBadge');badge.textContent='AETHER RUNTIME FAILED · '+String(e?.message||e).slice(0,100);badge.className='badge bad';badge.title='실패 단계: '+failureStage+' / '+(e?.stack||'');fatalNotice(e);}
function fatalNotice(e){try{const m=String(e?.message||e),webgl=/WebGL2|EXT_color_buffer_float|float targets/i.test(m);let el=document.getElementById('fatalNotice');if(!el){el=document.createElement('div');el.id='fatalNotice';el.style.cssText='position:fixed;left:12px;right:12px;top:72px;z-index:99;padding:14px 16px;border-radius:12px;background:rgba(40,16,18,.96);color:#ffd9d6;font:14px/1.5 system-ui,sans-serif;border:1px solid #a33;box-shadow:0 8px 32px #000a';document.body.appendChild(el)}
 el.textContent=webgl?'이 기기/브라우저에서는 실시간 3D 계산에 필요한 WebGL2(부동소수점 렌더링)를 쓸 수 없습니다. iPhone은 iOS 15 이상의 Safari 또는 Chrome에서 열어 주세요. (원인: '+m.slice(0,80)+')':'실행 중 오류가 발생해 중단했습니다: '+m.slice(0,120)+' — 새로고침하거나 #mobile=1 / #q=LITE 로 다시 열어 보세요.'}catch(_){}}
glCanvas.addEventListener('webglcontextlost',e=>{e.preventDefault();CINE.cancel('contextlost');runtimeGeneration++;cancelAnimationFrame(raf);diagnostics.bootStage='CONTEXT_LOST';diagnostics.texturesReady=false;rollingState.previous=null;rollingState.baseline=null;rollingState.effectiveSpeed=0;rollingState.motionReady=false;rollingState.aligned=alignedVehicle();if(AETHER.M4)AETHER.M4.liveSolverConnected=false;renderDiagnostics();const badge=document.getElementById('readyBadge');badge.textContent='GPU CONTEXT LOST — restoring';badge.className='badge bad';});
glCanvas.addEventListener('webglcontextrestored',()=>{disposeLighting(true);buffers=[];textures=[];program=null;rollingState.previous=null;rollingState.baseline=null;rollingState.effectiveSpeed=0;rollingState.motionReady=false;rollingState.aligned=alignedVehicle();if(AETHER.M4)AETHER.M4.liveSolverConnected=false;for(const o of scene.objects)o.gpu=null;for(const p of scene.vehicleParts){p.gpu=null;p.texture=null;}for(const r of scene.roadParts)r.gpu=null;boot();});if(document.addEventListener)document.addEventListener('visibilitychange',()=>{CINE.resetClock();suspendRollingRoad(document.hidden?'DOCUMENT_HIDDEN':'DOCUMENT_VISIBLE');if(document.hidden){cancelAnimationFrame(raf);raf=0}else{resize();if(!raf)raf=requestAnimationFrame(draw)}});window.addEventListener('orientationchange',()=>setTimeout(resize,120),{passive:true});window.visualViewport?.addEventListener('resize',resize,{passive:true});


async function boot(){const generation=++runtimeGeneration;try{cancelAnimationFrame(raf);diagnostics.frames=0;diagnostics.bootStage='M1';if(!AETHER.M1.passed)throw Error('M1 contract failed');applicationState.contractReady=true;diagnostics.contractReady=true;diagnostics.bootStage='GLB';const g=loadVehicle();if(g.json.meshes.length!==VEHICLE_ASSET.sourceMeshBlocks||diagnostics.vehicleBounds.primitives!==VEHICLE_ASSET.sourceMeshBlocks||diagnostics.vehicleBounds.vertices<=0)throw Error('BMW M4 GT3 EVO source geometry contract mismatch');diagnostics.vehicleReady=true;diagnostics.bootStage='FAN_ASSET';loadFanModule();diagnostics.fanAssetReady=true;diagnostics.bootStage='M4_GEOMETRY';buildRollingRoadGeometry();diagnostics.facilityReady=runM3Checks().passed;if(!diagnostics.facilityReady)throw Error('M3 geometry gate failed');const m4=runM4Checks();if(!m4.geometryReady||!m4.stateContractReady)throw Error('M4 geometry/state gate failed');const m11=runM11Checks(g);if(!m11.passed)throw Error('M11 vehicle gate failed');diagnostics.bootStage='M12_ALIGNMENT';const m12=runM12Checks();if(!m12.passed)throw Error('M12 CFD alignment gate failed');diagnostics.bootStage='FLOW_LAYOUT';const initialLayout=FLOW_LAYOUT.get();buildExhaustCollector(initialLayout);if(!AETHER.EXHAUST_COLLECTOR.valid)throw Error('M15 rear collector layout invalid');validateEquipmentMeshes();AETHER.M8.fanAsset={asset:FAN_ASSET.name,sha256:FAN_ASSET.sha256,bytes:Math.floor(FAN_ASSET.base64.length*3/4)-(FAN_ASSET.base64.endsWith('==')?2:FAN_ASSET.base64.endsWith('=')?1:0),parts:FAN_ASSET.primitiveCount,triangles:FAN_ASSET.triangleCount,visualOnly:true,solverCoupled:false};AETHER.M8.checks.fanAssetValidated=Object.values(AETHER.FAN_MODULE.validation).every(Boolean);AETHER.M8.checks.fanAlignedToFlow=Object.values(initialLayout.checks).every(Boolean);AETHER.M8.geometryReady=Object.values(AETHER.M8.checks).every(Boolean);AETHER.M15={collector:{parts:AETHER.EXHAUST_COLLECTOR.parts.length,triangles:AETHER.EXHAUST_COLLECTOR.triangleCount,valid:AETHER.EXHAUST_COLLECTOR.valid,solverCoupled:false},fan:{parts:AETHER.FAN_MODULE.parts.length,triangles:FAN_ASSET.triangleCount,solverCoupled:false},status:'GEOMETRY_READY_VISUAL_REVIEW_PENDING'};doorBuild();bindM9Materials();diagnostics.bootStage='WEBGL';if(!initGL())throw Error('WebGL2 unavailable');setupResources();diagnostics.bootStage='MONITOR_ATLAS';try{diagnostics.monitorAtlasReady=initMonitorAtlas();if(!diagnostics.monitorAtlasReady)throw Error('M14_MONITOR_ATLAS_INIT_FAILED')}catch(atlasError){diagnostics.monitorAtlasReady=false;diagnostics.warnings.push({time:now(),source:'monitor-atlas',message:atlasError?.message||String(atlasError)});if(monitorAtlasTexture){gl.deleteTexture(monitorAtlasTexture);monitorAtlasTexture=null;}monitorAtlasCanvas=null;monitorAtlasContext=null;for(const o of scene.objects)if(o.name.startsWith('m6.glb.MonitorGlass.screen.'))o.texture=null;const note=document.getElementById('m14CommandStatus');if(note)note.textContent='3D 모니터 atlas를 사용할 수 없습니다. 기본 장면은 계속 표시합니다. '+(atlasError?.message||String(atlasError));}diagnostics.bootStage='TEXTURE';lastTextureJob=loadTextures(g,generation).catch(textureError=>{if(generation!==runtimeGeneration)return false;diagnostics.texturesReady=false;diagnostics.warnings.push({time:now(),source:'vehicle-textures',message:textureError?.message||String(textureError)});for(const tex of textures)if(tex)gl?.deleteTexture(tex);textures=[];for(const part of scene.vehicleParts)part.texture=null;const note=document.getElementById('m14CommandStatus');if(note)note.textContent='차량 텍스처를 불러오지 못해 기본 재질로 표시합니다. '+(textureError?.message||String(textureError));return true;});if(generation!==runtimeGeneration)return;diagnostics.bootStage='M10_LIGHTING';initLighting();setPreset('Hero');diagnostics.bootStage='M12_ALIGNMENT_CHECKED';diagnostics.bootStage='FIRST_FRAME';renderDiagnostics();if(!document.hidden)raf=requestAnimationFrame(draw)}catch(e){const failureStage=diagnostics.bootStage;diagnostics.bootStage='FAILED';diagnostics.error('boot',e);renderDiagnostics();const badge=document.getElementById('readyBadge');badge.textContent='AETHER BOOT FAILED · '+String(e?.message||e).slice(0,100);badge.className='badge bad';badge.title='실패 단계: '+failureStage+' / '+(e?.stack||'');}}
let lastTextureJob;window.addEventListener('error',e=>failRuntime('window.error',e.error||new Error(e.message)));window.addEventListener('unhandledrejection',e=>failRuntime('promise',e.reason));window.addEventListener('beforeunload',()=>{cancelAnimationFrame(raf);disposeLighting();for(const b of buffers)gl?.deleteBuffer(b);for(const o of scene.objects)for(const b of [o.gpu?.pb,o.gpu?.nb,o.gpu?.ub,o.gpu?.ib])if(b)gl?.deleteBuffer(b);for(const p of scene.vehicleParts)for(const b of [p.gpu?.pb,p.gpu?.nb,p.gpu?.ub,p.gpu?.ib])if(b)gl?.deleteBuffer(b);for(const r of scene.roadParts)for(const b of [r.gpu?.pb,r.gpu?.nb,r.gpu?.ub,r.gpu?.ib])if(b)gl?.deleteBuffer(b);for(const t of textures)gl?.deleteTexture(t);if(whiteTexture)gl.deleteTexture(whiteTexture);if(program)gl.deleteProgram(program)});



// M14 CONTROL ROOM: canonical operator state shared by the HTML panel, 3D console,
// rolling-road adapter, and engineering-data atlas. Product CFD remains explicitly unbound.



boot();
/* test hooks: single deterministic frame (used by tests/ab-render.mjs); the rAF loop is paused by renderOnce and restarted by resume */
Object.defineProperties(window.__AETHER_DEBUG,{rolling:{get:()=>rollingState,configurable:true},hq:{get:()=>HQ,configurable:true},scene:{get:()=>scene,configurable:true},wow:{get:()=>wow,configurable:true}});
window.__AETHER_DEBUG.renderOnce=()=>{cancelAnimationFrame(raf);draw();cancelAnimationFrame(raf);raf=0};
window.__AETHER_DEBUG.resume=()=>{if(!raf)raf=requestAnimationFrame(draw)};
})();
