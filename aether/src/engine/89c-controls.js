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
