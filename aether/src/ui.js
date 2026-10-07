/* AETHER UI: overlays, dock menus, cinematic bindings, live HUD, quality panel, mobile helpers.
   Markup lives in index.html; this file builds the overlays and binds behaviour. */
(()=>{
const $=id=>document.getElementById(id),L=()=>window.__LIVE,CN=window.__CINE;
document.body.classList.add('sc');
const vp=document.querySelector('.viewport');
vp.insertAdjacentHTML('beforeend','<div class="sc-vig"></div><div class="sc-bar t"></div><div class="sc-bar b"></div><i class="sc-prog" id="scProg"></i><button id="scSkip" type="button" aria-label="시네마틱 건너뛰기">건너뛰기 ›</button><div class="sc-cap" id="scCap" aria-live="polite"></div><div class="sc-leg" id="scLeg"><span>느림</span><i></i><span>빠름</span><small style="opacity:.75">(기준풍속 대비)</small></div><div id="lvStat" role="button" tabindex="0" aria-label="계산 상태 자세히 보기"></div><div id="bdHud"></div>');
document.body.insertAdjacentHTML('beforeend','<div class="sc-splash" id="scSplash"><h1>AETHER</h1><p>BMW M4 GT3 를 감싸는 공기의 흐름<br>수십만 개 격자에서 실시간으로 계산되는 연기를 눈앞에서 보세요</p><button id="scGo" type="button">입장하기</button><div class="sc-load" id="scLoad">엔진 준비 중</div></div>');
$('scLeg').style.display='none';

/* ---------- captions ---------- */
let capH=0;
const cap=(t,s)=>{const c=$('scCap');c.classList.remove('on');clearTimeout(capH);capH=setTimeout(()=>{c.innerHTML=t+(s?'<small>'+s+'</small>':'');c.classList.add('on')},450)};
const capOff=()=>{clearTimeout(capH);$('scCap').classList.remove('on')};
const capFor=(t,s,ms)=>{cap(t,s);setTimeout(capOff,ms||4500)};

/* ---------- dock menus ---------- */
const menus=[...document.querySelectorAll('.menu')];
const closeMenus=except=>{for(const m of menus)if(m!==except){m.classList.remove('open');m.querySelector('.menu-btn')?.setAttribute('aria-expanded','false')}};
for(const m of menus){const b=m.querySelector('.menu-btn');
 b.addEventListener('click',e=>{e.stopPropagation();const open=!m.classList.contains('open');closeMenus(m);m.classList.toggle('open',open);b.setAttribute('aria-expanded',String(open))});
 m.querySelector('.menu-pop').addEventListener('click',e=>{const it=e.target.closest('button');if(it&&!it.hasAttribute('data-keep')){m.classList.remove('open');b.setAttribute('aria-expanded','false')}})}
document.addEventListener('click',e=>{if(!e.target.closest('.menu'))closeMenus()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeMenus();if(document.body.classList.contains('eng'))setPanel(false)}});
for(const ev of ['pointerdown','wheel'])$('view').addEventListener(ev,()=>closeMenus(),{passive:true});
for(const id of ['capPhoto','capRec','capArm','scCol','lvRake','stkMode','cpMode','nzMode','lvWand','lvOn','cutaway','roadSection','swayMode','qualityMode','bdSnd'])$(id)?.setAttribute('data-keep','');

/* ---------- cinematic: one timeline; the director in the engine owns camera, captions and progress ---------- */
const stop=()=>CN.cancel('ui'),cine=()=>CN.start({source:'ui'});
CN.on(e=>{
 if(e.type==='caption'){if(e.title)cap(e.title,e.sub);else capOff()}
 else if(e.type==='progress'){const p=$('scProg');if(p)p.style.width=(e.t/e.dur*100).toFixed(1)+'%'}
 else if(e.type==='state'){
  if(e.state==='PREPARING'){const c=$('scCap');c.innerHTML='연기 흐름을 준비하고 있습니다';c.classList.add('on');closeMenus()}
  else if(e.state==='PLAYING')capOff();
  if(e.state!=='PLAYING'&&e.state!=='PREPARING'){const p=$('scProg');if(p)p.style.width='0'}}});
$('scSkip').onclick=()=>CN.skip();
$('scCine').onclick=cine;

/* ---------- splash: enter when the renderer, GPU measurement and first smoke are ready ---------- */
const go=$('scGo');let ready=false;
const pt0=performance.now(),WHY={renderer:'렌더러 준비',calibrating:'GPU 성능 측정',developing:'연기 흐름 형성',live:'엔진 시작'};
const poll=setInterval(()=>{if(!$('scLoad')){clearInterval(poll);return}const r=CN.readiness(),late=performance.now()-pt0>25000&&r.why!=='renderer';
 if((r.ready||late)&&!ready){ready=true;go.classList.add('rdy');$('scLoad').textContent='준비 완료'}
 else if(!ready)$('scLoad').textContent=(WHY[r.why]||'엔진 준비')+' '+Math.round(r.p*100)+'%'},300);
go.onclick=()=>{if(!ready)return;clearInterval(poll);$('scSplash').classList.add('off');setTimeout(()=>$('scSplash').remove(),1100);cine()};

/* ---------- walking, body and wind sound ---------- */
$('scDoor').onclick=()=>{stop();$('walkMode').click();setTimeout(()=>{try{window.__doorPlace()}catch(e){}},60);capFor('정면의 자동문으로 걸어가세요','W / 이동 스틱으로 전진',5000)};
$('bdOut').onclick=()=>{if(!(window.__bodyOutside&&window.__bodyOutside()))capFor('먼저 풍동 안으로 들어가세요','"걷기 → 풍동 안으로 걸어 들어가기"를 누르세요');else capFor('당신이 서 있던 자리','연기가 몸을 비켜 흐르고 뒤로 소용돌이가 남습니다')};
$('bdBack').onclick=()=>{if(window.__bodyReturn&&window.__bodyReturn())capFor('다시 1인칭','움직이면 연기가 따라 바뀝니다')};
{let ac=null,gain=null,bp=null,on=false;
 const audio=()=>{if(ac)return;const C=window.AudioContext||window.webkitAudioContext;if(!C)return;ac=new C();const n=ac.sampleRate*2,buf=ac.createBuffer(1,n,ac.sampleRate),d=buf.getChannelData(0);let l=0;for(let i=0;i<n;i++){l=(l+.02*(Math.random()*2-1))/1.02;d[i]=l*3.5}
  const src=ac.createBufferSource();src.buffer=buf;src.loop=true;bp=ac.createBiquadFilter();bp.type='bandpass';bp.Q.value=.7;bp.frequency.value=400;gain=ac.createGain();gain.gain.value=0;src.connect(bp);bp.connect(gain);gain.connect(ac.destination);src.start()};
 const label=()=>{$('bdSnd').textContent=on?'바람 소리 끄기':'바람 소리 켜기'};
 $('bdSnd').onclick=()=>{on=!on;try{audio();ac&&ac.resume()}catch(e){}label()};
 go.addEventListener('click',()=>{try{audio();ac&&ac.resume();on=true;label()}catch(e){}});
 setInterval(()=>{const B=window.__BODY,h=$('bdHud');if(!B||!h)return;const act=B.active&&B.inTunnel;h.style.display=act?'block':'none';
  if(act)h.textContent=(B.anchor?'남겨둔 몸 위치':'내 위치')+' · 풍속 '+B.speed.toFixed(2)+' m/s · 몸이 흐름을 가르는 중';
  if(ac&&gain){const tgt=on&&act?Math.min(.28,.05+B.speed*.09)*(B.anchor?.35:1):0;gain.gain.setTargetAtTime(tgt,ac.currentTime,.25);bp.frequency.setTargetAtTime(300+B.speed*260,ac.currentTime,.3)}},120)}

/* ---------- smoke menu: rake pattern, velocity colour, wand, live CFD on/off ---------- */
{const RK=[['RAKE_V','세로 레이크'],['RAKE_H','가로 레이크'],['BOTH','세로+가로'],['OFF','끄기']];
 const refresh=()=>{const l=L();if(!l)return;const r=RK.find(x=>x[0]===l.mode)||RK[0];$('lvRake').textContent='연기: '+r[1];$('scCol').textContent=l.colorMode?'유속 색 끄기':'유속 색 보기';$('scCol').classList.toggle('active',!!l.colorMode);$('lvWand').textContent=l.wand?'스모크 완드 끄기':'스모크 완드 켜기';$('lvWand').classList.toggle('active',!!l.wand);$('lvOn').textContent=l.enabled?'실시간 CFD 끄기':'실시간 CFD 켜기';$('scLeg').style.display=l.colorMode?'flex':'none'};
 const SM=[['both','입자선+볼륨'],['streak','입자선만'],['vol','볼륨만']],stk=()=>window.__STREAK;
 $('stkMode').onclick=()=>{const S=stk();if(!S)return;S.mode=SM[(SM.findIndex(m=>m[0]===S.mode)+1)%SM.length][0];$('stkMode').textContent='표현: '+SM.find(m=>m[0]===S.mode)[1]};
 {const S=stk();if(S)$('stkMode').textContent='표현: '+SM.find(m=>m[0]===S.mode)[1]}
 $('cpMode').onclick=()=>{const C=window.__CPMAP;if(!C)return;C.on=!C.on;C.err=null;$('cpMode').textContent='차체 압력: '+(C.on?'켬':'끔');$('cpLeg').hidden=!C.on};
 if(window.__CPMAP?.on){$('cpMode').textContent='차체 압력: 켬';$('cpLeg').hidden=false}
 $('nzMode').onclick=()=>{const l=L();if(!l)return;const on=l.api.setNozzle(!l.nozzleSolid);$('nzMode').textContent='노즐 계산 반영: '+(on?'켜짐':'꺼짐')+'(실험)';capFor(on?'노즐을 계산에 반영합니다':'노즐 계산 반영을 끕니다','흐름을 처음부터 다시 계산합니다')};
 if(L()?.nozzleSolid)$('nzMode').textContent='노즐 계산 반영: 켜짐(실험)';
 $('lvRake').onclick=()=>{const l=L();l.mode=RK[(RK.findIndex(r=>r[0]===l.mode)+1)%RK.length][0];refresh()};
 $('scCol').onclick=()=>{const l=L();l.colorMode=!l.colorMode;refresh()};
 $('lvWand').onclick=()=>{const l=L();l.wand=!l.wand;refresh();if(l.wand)capFor('손에 연기봉을 들었습니다','풍동 안에서 차 주변을 비춰 보세요')};
 $('lvOn').onclick=()=>{const l=L();l.setEnabled(!l.enabled);refresh()};
 refresh();setInterval(refresh,500)}

/* ---------- walking state class (shows the movement hint only while walking) ---------- */
setInterval(()=>{const d=window.__AETHER_DEBUG;document.body.classList.toggle('walking',!!(d&&d.fpv&&d.fpv.enabled))},250);

/* ---------- settings drawer ---------- */
function setPanel(on){document.body.classList.toggle('eng',on);$('scEng').setAttribute('aria-expanded',String(on))}
$('scEng').onclick=()=>setPanel(!document.body.classList.contains('eng'));
document.querySelector('#engClose button').onclick=()=>setPanel(false);

/* ---------- live CFD readout: two lines by default, tap for details ---------- */
{const hud=$('lvStat');const toggle=()=>hud.classList.toggle('open');hud.addEventListener('click',toggle);hud.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle()}});
 setInterval(()=>{const l=L();if(!l)return;document.body.classList.toggle('live-cfd',!!(l.ok&&l.enabled));
  const M=window.__MAC,mac=l.impl==='MAC'&&M,b=$('readyBadge');
  if(l.ok&&l.enabled){const N=l.N,F=l.forces,r=l.benchRes,cells=(N[0]*N[1]*N[2]/1e4).toFixed(1);
   if(b){const t='실시간 CFD · '+(mac?'MAC 격자':'collocated(대체)')+' · 등급 '+l.q;if(b.textContent!==t){b.textContent=t;b.className='badge live'}}
   let x='실시간 GPU CFD · '+(mac?'MAC 격자':'collocated(대체)')+' · 등급 '+l.q+' · '+cells+'만 셀\n풍속 '+l.U+' m/s · 모의 '+l.t.toFixed(1)+' s'+(F&&F.n>2?' · Cd '+(F.CdMean??F.Cd).toFixed(2)+' · Cl '+(F.ClMean??F.Cl).toFixed(2):'');
   x+='\n'+(mac?'MAC 엇갈린 격자 · LES(Smagorinsky) · 압력 '+(M.solver==='RBGS'?'RBGS-MG':M.solver):'collocated 대체 솔버(비점성)')+' · '+N.join('×')+' · '+l.step.toLocaleString()+' 스텝 · 연기원 '+l.emitters.length+'개';
   if(F&&F.n>2)x+='\nCd '+(F.CdMean??F.Cd).toFixed(2)+' ± '+(F.CdStd??0).toFixed(2)+' · Cl '+(F.ClMean??F.Cl).toFixed(2)+' ± '+(F.ClStd??0).toFixed(2)+' (최근 '+(F.window||0).toFixed(1)+' s 평균±표준편차 · '+(mac?(M.ibm==='vf'?'운동량 수지: 압력·점성·경계 강제':'압력+벽전단'):'압력항력만')+' · Cl은 차 밑 틈(약 7 cm)이 셀보다 작아 신뢰 낮음)';
   if(mac&&M.eps>0)x+='\n와도 보존력 보정 사용 중(LOW 전용 근사 보정, 물리 법칙 아님)';
   x+='\n계산값: 유동·연기·풍속·Cd/Cl  |  근사: 사람 형상(원기둥)·부분체적 경계·셀 크기 '+(l.h?Math.round(Math.min(...l.h)*100):'?')+' cm  |  연출: 팬 회전 속도·바람 소리·자막·연기 서서히 옅어짐(수명 3 s)·연기 표시 곡선';
   if(l.bench)x+='\n벤치마크(계산 형상은 원기둥, 화면의 차량은 계산에 포함되지 않음): 원기둥 D=0.5m '+(r&&r.ok?'스트라우할 수 St = '+r.St.toFixed(3)+' (문헌 약 0.2 · 격자 '+r.cells.toFixed(1)+'셀/지름)':'측정 중 '+Math.min(100,Math.round(100*l.t/8))+'%');
   if(/perf=1/.test(location.hash)&&window.__PERF)x+='\n'+window.__perfHudText();
   x+='\n정성적 시각화이며 공학 해석 도구가 아닙니다';hud.textContent=x}
  else if(l.err)hud.textContent='실시간 CFD 사용 불가: '+l.err;
  else hud.textContent=l.enabled?'실시간 CFD 준비 중':'실시간 CFD 꺼짐'},300)}

/* ---------- quality panel (any tier selectable on any device; warns above the measured recommendation) ---------- */
{const q=id=>$(id),P=()=>window.__PERF;
 const T=['LITE','LOW','MID','HIGH','ULTRA'],set=o=>{const p=P();if(p&&p.userSet){p.userSet(o);sync(true)}};
 const sync=force=>{const p=P();if(!p||!p.userState)return;const s=p.userState(),m=s.manual;
  if(force||document.activeElement?.closest?.('#qualityPanel')==null){q('qVol').value=m.vol;q('qRen').value=m.ren;q('qSim').value=m.sim;
   if(m.vol===m.ren&&m.ren===m.sim)q('qAll').value=m.sim;else q('qAll').selectedIndex=-1;
   q('qScale').value=s.scale?String(s.scale):'';q('qAdaptive').checked=s.adaptive}
  const pct=v=>Math.round((v||0)*100)+' %',t=s.tier||{},lines=[];
  lines.push('GPU: '+(s.renderer||'?').replace(/^ANGLE \((.*)\)$/,'$1').slice(0,90));lines.push(s.measured?'측정 추천: '+s.pick+' (시작 시 GPU 실측)':'GPU 측정 중… (끝나면 추천 등급 표시)');
  lines.push('현재: CFD '+(t.sim||'—')+(s.grid?' '+s.grid.join('×'):'')+' · 연기 '+(t.vol||'—')+' '+pct(s.volRes)+' · 그래픽 '+(t.ren||'—'));
  lines.push('화면 '+pct(s.renderScale)+' ('+s.canvas.join('×')+' 캔버스)'+(s.scale?' · 직접 지정':''));
  lines.push('프레임 '+(s.p95!=null?'p95 '+s.p95.toFixed(1)+' ms':'—')+(s.frameMs!=null?' · 비용 '+s.frameMs.toFixed(1)+' ms('+(s.frameSrc||'')+')':'')+' · 자동 조절 '+(s.adaptive?'켜짐':'꺼짐'));
  if(s.log.length)lines.push('최근 조정: '+s.log.join(', '));
  const el=q('qStatus');el.textContent=lines.join('\n');
  const hi=s.measured&&s.pick&&['sim','vol','ren'].some(a=>T.indexOf(m[a])>T.indexOf(s.pick))||(s.scale&&s.scale>1&&(s.pick==='LOW'||s.pick==='LITE'));
  if(hi){const w=document.createElement('span');w.className='warn';w.textContent='\n주의: 선택한 설정이 측정 추천('+s.pick+')보다 높아 느려질 수 있습니다.';el.appendChild(w)}};
 q('qAll').onchange=e=>{const v=e.target.value;set({sim:v,vol:v,ren:v,scale:null})};
 for(const [id,ax] of [['qVol','vol'],['qRen','ren'],['qSim','sim']])q(id).onchange=e=>set({[ax]:e.target.value});
 q('qScale').onchange=e=>set({scale:e.target.value?+e.target.value:null});
 q('qAdaptive').onchange=e=>set({adaptive:e.target.checked});
 sync(true);setInterval(()=>{if(document.body.classList.contains('eng'))sync(false)},500)}

/* ---------- screen mode (PC <-> mobile) ---------- */
{const box=$('screenModeBtns');
 if(box){const mk=(label,mob)=>{const b=document.createElement('button');b.type='button';b.className='btn';b.textContent=label;b.setAttribute('aria-pressed',String(!!window.__MOBILE===mob));b.onclick=()=>{if(!!window.__MOBILE!==mob)window.__setMobile(mob)};box.appendChild(b)};mk('PC 화면',false);mk('모바일 화면',true);
  const note=document.createElement('p');note.className='help';note.style.gridColumn='1/-1';note.textContent='터치 기기는 자동으로 모바일 화면이 선택됩니다. 선택은 이 브라우저에 저장됩니다.';box.appendChild(note)}
 if(window.__MOBILE){const h=$('fpvHelp');if(h)h.textContent='왼쪽 조이스틱: 이동 · 오른쪽 화면 드래그: 시점 · 두 손가락: 확대'}}

/* yaw (turntable) + aerodynamic coefficient chart */
{const sel=$('ctlYaw');if(sel)sel.addEventListener('change',e=>{const l=window.__LIVE;if(!l)return;const d=l.api.setYaw(+e.target.value);capFor('요각 '+(d>0?'+':'')+d+'°','차를 돌린 뒤 흐름을 다시 계산합니다')});
 const cv=$('aeroChart'),now=$('aeroNow');
 if(cv&&now){const g=cv.getContext('2d'),css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const draw=()=>{const l=window.__LIVE,A=l?.aero||[];const W=cv.width,H=cv.height;g.clearRect(0,0,W,H);
   if(A.length<3){now.textContent=l&&l.ok?'측정 중…':'CFD 꺼짐';return}
   const ser=[['Cd','#f2b84b',1],['Cl','#5bc0eb',2],['Cs','#b08cf2',3]];let lo=1e9,hi=-1e9;for(const a of A)for(const k of [1,2,3]){lo=Math.min(lo,a[k]);hi=Math.max(hi,a[k])}
   lo=Math.min(lo,0);hi=Math.max(hi,.1);const pad=(hi-lo)*.1||.1;lo-=pad;hi+=pad;const X=i=>10+i/(A.length-1)*(W-20),Y=v=>H-8-(v-lo)/(hi-lo)*(H-16);
   g.strokeStyle='rgba(160,180,200,.35)';g.lineWidth=1;g.beginPath();g.moveTo(10,Y(0));g.lineTo(W-10,Y(0));g.stroke();
   for(const [n,c,k] of ser){g.strokeStyle=c;g.lineWidth=1.6;g.beginPath();A.forEach((a,i)=>{const x=X(i),y=Y(a[k]);i?g.lineTo(x,y):g.moveTo(x,y)});g.stroke()}
   const z=A[A.length-1];now.textContent='Cd '+z[1].toFixed(3)+' · Cl '+z[2].toFixed(3)+' · Cs '+z[3].toFixed(3)+' (요각 '+(window.__YAW?.deg||0)+'°)';void css};
  setInterval(()=>{if(document.hidden||!$('panel')?.classList.contains('open')&&getComputedStyle($('panel')).display==='none')return;try{draw()}catch(e){void e}},500)}}

/* virtual instruments: probes, wake rake, wake plane */
{const I=window.__INSTR,sel=$('instPreset');if(I&&sel){
 const fill=()=>{const keep=sel.value;sel.innerHTML='';I.presets().forEach(([n],i)=>{const o=document.createElement('option');o.value=i;o.textContent=n;sel.appendChild(o)});if(keep)sel.value=keep};fill();sel.addEventListener('focus',fill);
 const f=(v,d=2)=>v===undefined||v===null||!Number.isFinite(v)?'–':v.toFixed(d);
 $('instAdd').onclick=()=>{const p=I.presets()[+sel.value];if(!p)return;const r=I.add(p[1],p[0]);if(!r)capFor('프로브를 더 추가할 수 없습니다','최대 '+I.max+'개')};
 $('instView').onclick=()=>{if(!I.addAtView())capFor('프로브를 더 추가할 수 없습니다','최대 '+I.max+'개')};
 $('instClear').onclick=()=>I.clear();
 const x=$('instX');x.oninput=()=>{I.setX(+x.value);$('instXv').textContent=(+x.value).toFixed(1)+' m'};
 const tog=(id,label,get,set)=>{const b=$(id);b.onclick=()=>{set(!get());b.textContent=label+': '+(get()?'켜짐':'꺼짐');b.setAttribute('aria-pressed',String(get()))}};
 tog('instRake','후류 레이크',()=>I.rake.on,v=>I.setRake(v));tog('instPlane','후류 평면',()=>I.plane.on,v=>I.setPlane(v));
 $('instMode').onchange=e=>I.setPlane(I.plane.on,+e.target.value);
 $('instCsv').onclick=()=>{const b=new Blob([I.csv()],{type:'text/csv'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='aether-probes.csv';document.body.appendChild(a);a.click();setTimeout(()=>{a.remove();URL.revokeObjectURL(a.href)},1000)};
 const spark=(h)=>{if(!h.length)return '';const v=h.map(q=>q[1]),lo=Math.min(...v),hi=Math.max(...v)||1,bars='▁▂▃▄▅▆▇█';return v.slice(-24).map(q=>bars[Math.min(7,Math.max(0,Math.floor((q-lo)/((hi-lo)||1)*7.99)))]).join('')};
 const list=$('instList'),cv=$('instRakeChart'),wk=$('instWake');
 const draw=()=>{if(!I.probes.length)list.textContent=I.err?('계측 오류: '+I.err):'프로브가 없습니다. 위치를 고르고 추가하세요.';else{list.textContent='';I.probes.forEach(p=>{const d=document.createElement('div');d.className='row';const v=p.val;
   d.textContent=p.name+' ['+p.pos.map(q=>q.toFixed(1)).join(', ')+']  '+(v?(v.solid?'차체 내부':('|U| '+f(v.speed)+' m/s · Cp '+f(v.Cp)+' · Cp0 '+f(v.Cp0)+' · ω '+f(v.vort,1)+'/s  '+spark(p.h))):'측정 중…');
   const b=document.createElement('button');b.type='button';b.className='btn';b.textContent='✕';b.setAttribute('aria-label',p.name+' 제거');b.onclick=()=>I.remove(p.id);d.appendChild(b);list.appendChild(d)})}
  const g=cv.getContext('2d'),W=cv.width,H=cv.height;g.clearRect(0,0,W,H);const w=I.wake;
  if(I.rake.on&&w){const L=w.prof.map(q=>q.Cp0===null?0:Math.max(0,-q.Cp0)),mx=Math.max(.5,...L);g.strokeStyle='rgba(160,180,200,.35)';g.beginPath();g.moveTo(40,6);g.lineTo(40,H-6);g.stroke();
   g.fillStyle='#f2b84b';w.prof.forEach((q,i)=>{const y=H-8-(q.y-I.rake.y0)/(I.rake.y1-I.rake.y0)*(H-16);g.fillRect(40,y-2,L[i]/mx*(W-50),4)});g.fillStyle='rgba(200,210,220,.8)';g.font='10px sans-serif';g.fillText('y '+I.rake.y0.toFixed(1),2,H-8);g.fillText(I.rake.y1.toFixed(1)+' m',2,12);g.fillText('전압 손실 −Cp0 (최대 '+mx.toFixed(2)+')',48,12)}
  const e=I.est;wk.textContent=I.plane.on?(e&&e.CdWake!==null?('후류 평면 x='+e.x.toFixed(1)+' m: 전압 결손 적분 '+f(e.CdWake,3)+' (Cd 환산, 근후류에서는 과대) · 힘 적분 Cd '+f(e.CdBalance,3)+' · 유체 표본 '+e.fluid):'후류 평면 적분 계산 중… (흐름이 발달해야 합니다)'):(I.rake.on?'후류 레이크 x='+I.wakeX.toFixed(1)+' m, 높이 '+I.rake.y0+'~'+I.rake.y1+' m':'후류 계측을 켜면 표시됩니다.')};
 setInterval(()=>{if(document.hidden)return;try{draw()}catch(e){void e}},400)}}

/* vehicle choice (reloads with the other profile) */
{const Vh=window.__VEHICLE,sel=$('carSel');if(Vh&&sel){Vh.list.forEach(q=>{const o=document.createElement('option');o.value=q.id;o.textContent=q.label;sel.appendChild(o)});sel.value=Vh.id;sel.onchange=()=>Vh.set(sel.value)}}

/* body paint */
{const P=window.__PAINT,sel=$('paintSel');if(P&&sel){P.set.forEach((q,i)=>{const o=document.createElement('option');o.value=i;o.textContent=q[0];sel.appendChild(o)});sel.value=P.idx;sel.onchange=()=>P.select(+sel.value)}}

/* surface flow: tufts / oil streaks */
{const T=window.__TUFT,sel=$('tufMode');if(T&&sel){const len=$('tufLen'),lv=$('tufLenV'),stat=$('tufStat'),sb=$('tufStreak');
 sel.value=T.mode;const showLen=()=>{lv.textContent=Math.round(T.length()*100)+' cm'};len.value=Math.round(T.length()*100);showLen();
 sel.onchange=()=>{T.len=null;T.setMode(sel.value);len.value=Math.round(T.length()*100);showLen()};
 len.oninput=()=>{T.len=(+len.value)/100;lv.textContent=len.value+' cm'};
 sb.onclick=()=>{const S=window.__STREAK;if(!S)return;S.mode=S.mode==='vol'?'both':'vol';sb.textContent='연기 유적선: '+(S.mode==='vol'?'꺼짐':'켜짐');sb.setAttribute('aria-pressed',String(S.mode!=='vol'))};
 const pct=v=>v===null||v===undefined?'–':Math.round(v*100)+' %';
 setInterval(()=>{if(document.hidden)return;try{if(T.mode==='off'){stat.textContent=T.err?('오류: '+T.err):'꺼져 있습니다.';return}const s=T.stats;if(!s){stat.textContent='흐름을 읽는 중…';return}const z=s.zones;
  stat.textContent=(T.mode==='oil'?'오일 줄무늬 ':'터프트 ')+s.valid+'/'+s.count+'개 표시 · 역류(박리 추정) 앞 '+pct(z.front.reversed)+' · 지붕 '+pct(z.roof.reversed)+' · 옆 '+pct(z.side.reversed)+' · 뒤 '+pct(z.rear.reversed)+' · 밑 '+pct(z.under.reversed)}catch(e){void e}},600)}}

/* aero set-up: ride height and pitch */
{const A=window.__AERO;if(A&&$('aeroRide')){const r=$('aeroRide'),pt=$('aeroPitch'),note=$('aeroSetNote'),show=()=>{$('aeroRideV').textContent=(+r.value)+' mm';$('aeroPitchV').textContent=(+pt.value)+'°'};
 r.oninput=pt.oninput=show;show();
 const upd=()=>{const q=A.resolution();note.textContent=(A.active?'적용됨: 차고 '+A.rideMm+' mm · 피치 '+A.pitchDeg+'° — ':'')+'격자 셀 '+(q.cell*100).toFixed(1)+' cm · 변화량 '+q.maxCells.toFixed(2)+' 칸 · '+q.note};
 $('aeroApply').onclick=()=>{A.set({rideMm:+r.value,pitchDeg:+pt.value});upd();capFor('공력 세팅 적용','차체를 옮기고 흐름을 다시 계산합니다')};
 $('aeroReset').onclick=()=>{r.value=0;pt.value=0;show();A.reset();upd()};
 upd();setInterval(()=>{if(!document.hidden)try{upd()}catch(e){void e}},1500)}}

/* automatic test sequencer */
{const Q=window.__SEQ;if(Q){const dl=(text,type,name)=>{const b=new Blob([text],{type}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{a.remove();URL.revokeObjectURL(a.href)},1000)};
 const stamp=()=>new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
 const est=()=>{const p=Q.presets[$('seqPlan').value],U=+$('seqWind').value,e=Q.estimate({yaws:p.yaws,window:p.window,U});return p.yaws.length+'점 × (예열 '+Q.spinUpFor(U).toFixed(1)+' s + 측정 '+p.window+' s) = 최소 '+Math.round(e.simTotal)+' s 시뮬레이션 시간 (실제 소요는 기기 속도에 따름)'};
 const stat=$('seqStat');stat.textContent='대기 중 — '+est();
 for(const id of ['seqPlan','seqWind'])$(id).onchange=()=>{if(Q.state==='IDLE'||Q.state==='DONE'||Q.state==='ABORTED')stat.textContent='대기 중 — '+est()};
 $('seqStart').onclick=()=>{const l=L();if(!l||!l.ok){capFor('CFD가 꺼져 있어 시험할 수 없습니다','');return}if(l.freeze)l.freeze=false;const ok=Q.start({plan:$('seqPlan').value,U:+$('seqWind').value});if(!ok)capFor('시험을 시작할 수 없습니다',Q.err||'비상정지 해제 후 다시 시도하세요')};
 $('seqStop').onclick=()=>Q.abort('사용자가 중단');
 $('seqCsv').onclick=()=>dl(Q.csv(),'text/csv','aether-sweep-'+stamp()+'.csv');$('seqJson').onclick=()=>dl(Q.json(),'application/json','aether-sweep-'+stamp()+'.json');$('seqHtml').onclick=()=>dl(Q.html(),'text/html','aether-report-'+stamp()+'.html');
 const f=(v,d=3)=>v===null||v===undefined?'–':(+v).toFixed(d);let lastN=-1,lastState='';
 setInterval(()=>{if(document.hidden)return;const run=Q.state==='RUN'||Q.state==='SETUP';$('seqStart').disabled=run;$('seqStop').disabled=!run;const has=Q.results.length>0;for(const id of ['seqCsv','seqJson','seqHtml'])$(id).disabled=!has;
  if(run)stat.textContent=Q.msg+' · '+Q.phase+' · 진행 '+Math.round(Q.progress()*100)+' %';else if(Q.state==='DONE')stat.textContent='완료 — 점 '+Q.results.length+'개, 미수렴 '+Q.results.filter(r=>!r.converged).length+'개';else if(Q.state==='ABORTED')stat.textContent='중단: '+(Q.err||Q.msg);
  if(Q.results.length!==lastN||Q.state!==lastState){lastN=Q.results.length;lastState=Q.state;$('seqChart').innerHTML=Q.svg();$('seqTable').textContent=Q.results.map(r=>('요각 '+r.yaw+'°').padEnd(9)+' Cd '+f(r.Cd)+'±'+f(r.CdStd)+'  Cs '+f(r.Cs)+'±'+f(r.CsStd)+'  Cl '+f(r.Cl)+'  '+(r.converged?'수렴':'미수렴')).join('\n')}},500)}}

/* capture: photo, manual recording, auto-record the cinematic */
{const C=window.__CAP;if(C){const sup=C.supported();
 $('capPhoto').onclick=()=>{if(C.photo())capFor('사진을 저장합니다','잠시 후 다운로드됩니다')};
 const recLabel=()=>{$('capRec').textContent=C.recording()?'녹화 중지 · 저장':'화면 녹화 시작'};
 if(!sup){$('capRec').disabled=true;$('capArm').disabled=true;$('capRec').textContent='이 브라우저는 녹화를 지원하지 않습니다'}
 $('capRec').onclick=()=>{if(C.recording())C.stop();else if(!C.start())capFor('녹화를 시작할 수 없습니다',C.err||'');recLabel()};
 $('capArm').onclick=()=>{C.armed=!C.armed;$('capArm').textContent='시네마틱 자동 녹화: '+(C.armed?'켜짐':'꺼짐')};
 CN.on(e=>{if(e.type!=='state'||!C.armed)return;if(e.state==='PLAYING'&&!C.recording())C.start();else if((e.state==='FINISHED'||e.state==='CANCELLED')&&C.recording())setTimeout(()=>{C.stop();recLabel()},e.state==='FINISHED'?1500:0)});
 window.addEventListener('aether-capture',ev=>{recLabel();capFor(ev.detail.kind==='photo'?'사진 저장 완료':'녹화 저장 완료',(ev.detail.bytes/1048576).toFixed(1)+' MB')})}}

/* WebGPU probe */
{const b=$('gpRun'),o=$('gpOut');if(b&&o)b.onclick=async()=>{const G=window.__GPUPROBE;if(!G)return;b.disabled=true;o.textContent='측정 중…';
 const r=await G.run();b.disabled=false;
 if(!r.supported){o.textContent='WebGPU 사용 불가: '+(r.reason||'알 수 없음');return}
 o.textContent=(r.adapter?(r.adapter.vendor||'')+' '+(r.adapter.architecture||'')+' '+(r.adapter.description||''):'어댑터 정보 없음')+(r.fallbackAdapter?' (소프트웨어 대체)':'')+'\n'+(r.reason?('오류: '+r.reason+'\n'):'')+r.tiers.map(t=>t.tier+' '+t.cells+'셀: '+t.msPerSweep+' ms/회 · '+t.Mcells_s+' Mcell/s').join('\n')}}
})();
