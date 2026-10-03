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
 G=Object.freeze({key,L,nose,rear,mid,cz,hw,top,floor,wing,fanX:lay.fanBounds.max[0],rakeX:lay.fanBounds.max[0]+1.4,collX:lay.collectorPlane.x,env:{x0:lay.fanBounds.max[0]+.45,x1:lay.collectorPlane.x-.8,y0:.5,y1:Math.min(dom.max[1],5.5)-.5,z0:dom.min[2]+R_CAM+.15,z1:wallZ},fanBox:{min:lay.fanBounds.min.slice(),max:lay.fanBounds.max.slice()}});geoKey=key;sets=null;obst=null;return G}

/* ---------- shot lists (car-relative; metres) ----------
   x: along the flow (+ downstream), z: lateral (+ toward the observation window), y: height above the floor.
   Every eye/target lies inside the tunnel envelope, so no wall is hidden and no cutaway is needed. */
function cineShots(g,tall){
 const m=g.mid,n=g.nose,r=g.rear,w=g.wing,c=g.cz,T=g.top;
 /* t: 0 low front quarter | 4 start of side tracking | 10 passing the cabin | 15 rear quarter on the spoiler | 17 hold | 24 wake | 30 reveal */
 const t=[0,.8,4,10,15,17,24,30];
 const eye=[[n-.45,.55,c+3.1],[n-.4,.56,c+3.1],[n-.05,.85,c+3.0],[m+1.75,1.35,c+3.3],[r+2.0,1.6,c+2.7],[r+2.3,1.62,c+2.65],[r+4.45,1.95,c+3.3],[r+4.5,3.3,c+3.3]];
 const tgt=tall?[[n+1.0,.6,c-.1],[n+1.05,.6,c-.1],[n+1.9,.78,c],[m+1.2,.9,c],[w.x-.1,w.y,c],[w.x+.1,w.y-.05,c],[r+.3,.85,c],[m-.3,1.3,c]]
  :[[n+1.05,.65,c-.3],[n+1.1,.65,c-.3],[n+1.9,.78,c-.1],[m+1.4,.9,c],[w.x-.1,w.y,c],[w.x+.1,w.y-.05,c],[r+1.25,.8,c],[m-.3,1.3,c]];
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
 if(dt>0&&fovOut>0){const mx=30*dt;fovOut+=Math.max(-mx,Math.min(mx,fw-fovOut))}else fovOut=fw}
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
function buildObstacles(g){if(obst)return obst;const B=[];for(const o of scene.objects){if(!o.center||!o.size||o.material==='glass'||o.visible===false)continue;if(['floor seams','measurement'].includes(o.category))continue;if(o.obstacleBoxes){for(const b of o.obstacleBoxes)B.push({n:o.name,c:o.category,min:b.min,max:b.max,big:false});continue}const h=[o.size[0]/2,o.size[1]/2,o.size[2]/2];if(o.center[1]+h[1]<.3)continue;B.push({n:o.name,c:o.category,min:[o.center[0]-h[0],o.center[1]-h[1],o.center[2]-h[2]],max:[o.center[0]+h[0],o.center[1]+h[1],o.center[2]+h[2]],big:Math.max(...o.size)>.6&&(o.size[0]>.3)+(o.size[1]>.3)+(o.size[2]>.3)>=2})}
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
