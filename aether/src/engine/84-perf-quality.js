/* ===== M1/M2: measurement (GPU timer queries, frame statistics, allocation accounting), startup GPU
   calibration, quality table and adaptive controller. Tier choice is measured, never guessed from the UA or
   renderer string (the renderer string is shown for information only). ===== */

/* One table for every quality knob. sim = simulation, vol = volumetric smoke, ren = scene rendering.
   Knobs whose feature is not implemented report available()=false and are skipped by the controller. */
/* v2 tunnel: grid counts follow the (much larger) domain at a target cell size per tier; legacy room keeps the hand-tuned counts */
const SIM_V2_H={LITE:.34,LOW:.24,MID:.185,HIGH:.145,ULTRA:.11};
const simGridFor=(tier,legacy)=>{if(!TUNNEL_V2_ON)return legacy;const d=TUNNEL_SPEC.derived.domainSize,h=SIM_V2_H[tier];return d.map(v=>Math.max(8,Math.round(v/h)))};
const QUALITY={
 tiers:['LITE','LOW','MID','HIGH','ULTRA'],
 sim:{LITE:{grid:simGridFor('LITE',[80,26,38]),sub:1,vc:.25},LOW:{grid:simGridFor('LOW',[112,36,52]),sub:2,vc:.25},MID:{grid:simGridFor('MID',[144,46,66]),sub:2,vc:0},HIGH:{grid:simGridFor('HIGH',[176,56,80]),sub:2,vc:0},ULTRA:{grid:simGridFor('ULTRA',[224,72,100]),sub:2,vc:0}},
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
