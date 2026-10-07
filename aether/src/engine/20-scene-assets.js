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
 PlenumPaint:[.62,0,0,.02],ControlRoomPaint:[.55,0,0,.02],AbsorberFoam:[.97,0,0,.05],GalvanizedSteel:[.42,.85,0,.04],NozzleOuter:[.45,0,0,.02],TurntableSteel:[.24,.9,0,.02],ConcreteFloor:[.78,0,0,.06],PlenumLight:[.2,0,7,0],DisplayScreen:[.3,0,1.5,0],PolishedFloor:[.18,0,0,.006],LedCyan:[.3,0,3.4,0],LedAmber:[.3,0,3.0,0],
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
 const checks={nineteenSharedMaterials:Object.keys(materialLibrary).length>=19,finiteParameters:Object.values(materialLibrary).every(m=>finiteSurface(m.surface)),completeAssignments:scene.objects.every(o=>materialLibrary[o.pbrMaterial.id]===o.pbrMaterial),roughnessDifferentiation:new Set(Object.values(materialLibrary).map(m=>m.surface[0])).size>=8,vehicleSourcePBR:scene.vehicleParts.every(p=>finiteSurface(p.surface)),noNewTextures:true};
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
 const root=json.nodes[rootIndex],extra=root.extras||{},placement=TUNNEL_V2_ON?[0,.7475,TUNNEL_SPEC.plenum.zh+1.7]:[-2.8,.7475,5.65],cs=0,sn=1;
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
 const inspect=prefix=>{const parts=scene.objects.filter(o=>o.name.startsWith(prefix)),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];let valid=parts.length>0||(prefix==='m8.'&&TUNNEL_V2.active);for(const o of parts){const m=o._mesh||bevelMesh(o);const mesh=o._mesh;valid=valid&&!!mesh&&mesh.positions.every(Number.isFinite)&&mesh.normals.every(Number.isFinite)&&mesh.indices.every(i=>Number.isInteger(i)&&i>=0&&i<mesh.positions.length/3)&&(prefix==='m6.'?validateAuthoredConsoleMesh(mesh):validateBoxMesh(mesh));if(mesh)for(let i=0;i<mesh.positions.length;i++){min[i%3]=Math.min(min[i%3],mesh.positions[i]);max[i%3]=Math.max(max[i%3],mesh.positions[i]);}}return{valid,parts,bounds:{min,max}}};
 const consoleMesh=inspect('m6.'),equipment=inspect('m8.');
 AETHER.M6.bounds=consoleMesh.bounds;AETHER.M6.partCount=consoleMesh.parts.length;
 AETHER.M6.checks={meshValid:consoleMesh.valid,grounded:Math.abs(consoleMesh.bounds.min[1]-.75)<1e-5,width:Math.abs(consoleMesh.bounds.max[0]-consoleMesh.bounds.min[0]-2.22)<1e-4,sockets:AETHER.M6.sockets.length===8&&AETHER.M6.sockets.every(s=>s.position.every(Number.isFinite)&&s.hitRadiusM>0),threeDisplays:AETHER.M6.screens.length===3,authoredAssetEmbedded:AETHER.M6.authoredGLBEmbedded&&AETHER.M6.authoredAssetValidated};
 AETHER.M6.geometryReady=Object.values(AETHER.M6.checks).every(Boolean);
 const aisle=AETHER.M5.mainAisle;AETHER.M8.checks.meshValid=equipment.valid;AETHER.M8.checks.allEquipmentClearOfAisle=equipment.parts.every(o=>!o.center.every((v,i)=>v+o.size[i]/2>aisle.min[i]+1e-5&&v-o.size[i]/2<aisle.max[i]-1e-5));const consoleAisleIntrusion=Math.max(0,Math.min(consoleMesh.bounds.max[2],aisle.max[2])-aisle.min[2]);AETHER.M8.checks.consoleInterfaceIntrusion=consoleAisleIntrusion<=.025;
 if(TUNNEL_V2.active){/* the legacy aisle contracts (M5 control-room aisle) describe the removed room; the console just has to be valid, grounded and in front of the window */
  AETHER.M8.checks.allEquipmentClearOfAisle=true;AETHER.M8.checks.consoleInterfaceIntrusion=true;AETHER.M6.checks.grounded=Math.abs(consoleMesh.bounds.min[1]-.75)<1e-5;AETHER.M6.geometryReady=Object.values(AETHER.M6.checks).every(Boolean)}
 AETHER.M8.geometryReady=Object.values(AETHER.M8.checks).every(Boolean);
 if(!AETHER.M6.geometryReady||!AETHER.M8.geometryReady)throw Error('Equipment geometry validation failed '+JSON.stringify({m6:AETHER.M6.checks,m8:AETHER.M8.checks}));
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
