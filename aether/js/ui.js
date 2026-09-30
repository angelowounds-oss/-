(()=>{const $=id=>document.getElementById(id),q=(s,f)=>{try{f()}catch(e){}};
document.body.classList.add('sc');
const vp=document.querySelector('.viewport');
vp.insertAdjacentHTML('beforeend','<div class="sc-vig"></div><div class="sc-bar t"></div><div class="sc-bar b"></div><div class="sc-cap" id="scCap"></div><div class="sc-dock" id="scDock"><button id="scCine">시네마틱 재생</button><button id="scHero">정면 시점</button><button id="scOut">후류 시점</button><button id="scMore">필라멘트 굵게</button><button id="scMode">필라멘트/입자 전환</button><button id="scFlow">흐름 강조 켜기/끄기</button><button id="scCol">유속 색 켜기/끄기</button><button id="scDoor">풍동 안으로 걸어 들어가기</button><button id="scEng">엔지니어 패널</button></div>');
document.body.insertAdjacentHTML('beforeend','<div class="sc-splash" id="scSplash"><h1>AETHER</h1><p>BMW M4 GT3 를 감싸는 공기의 흐름<br>64개의 분사구가 만드는 연기를 눈앞에서 보세요</p><button id="scGo">입장하기</button><div class="sc-load" id="scLoad">엔진 준비 중</div></div>');
const click=id=>q(0,()=>{const e=$(id);if(e&&!e.disabled)e.click()});
const playing=()=>$('smokePlayback')?.getAttribute('aria-pressed')!=='true';
const ensurePlay=()=>{if(!playing())click('smokePlayback')};
const cap=(t,s)=>{const c=$('scCap');c.classList.remove('on');setTimeout(()=>{c.innerHTML=t+(s?'<small>'+s+'</small>':'');c.classList.add('on')},500)};
let timers=[];
const script=[[0,'공기는 눈에 보이지 않습니다','그래서 연기로 보여드립니다','scHero'],[7000,'GPU가 매 순간 바람을 계산합니다','수십만 개 격자의 유동 방정식을 실시간으로','scHero'],[15000,'차체를 타고 흐르는 바람','지붕과 옆면을 스치며 갈라집니다',null],[23000,'뒤로 길게 남는 후류','이 흔적이 차의 공기저항을 말해줍니다','scOut'],[31000,'AETHER WIND TUNNEL','직접 들어가 보세요',null]];
function stop(){timers.forEach(clearTimeout);timers=[];document.body.classList.remove('cine');$('scCap').classList.remove('on')}
function cine(){stop();document.body.classList.add('cine');ensurePlay();if(!(window.__LIVE&&window.__LIVE.ok))click('wowStart');
 script.forEach(([t,a,b,v])=>timers.push(setTimeout(()=>{cap(a,b);if(v)click(v)},t)));timers.push(setTimeout(stop,37000))}
$('scCine').onclick=cine;$('scHero').onclick=()=>{ensurePlay();click('smokeHeroView')};$('scOut').onclick=()=>{ensurePlay();click('smokeOutletView')};
$('scMore').onclick=()=>{const R=window.__RIB;R.gain=R.gain>1?1:1.7;R.width=R.gain>1?.07:.05;ensurePlay()};$('scMode').onclick=()=>{const R=window.__RIB;R.on=!R.on;if(R.on){target=500;setCount(500)}else{target=8000;setCount(3000)}};
vp.insertAdjacentHTML('beforeend','<div class="sc-leg"><span>느림</span><i></i><span>빠름</span></div>');$('scFlow').onclick=()=>{const R=window.__RIB;R.flow=R.flow>0?0:1};$('scCol').onclick=()=>{const R=window.__RIB;R.cmode=R.cmode>0?0:1;document.querySelector('.sc-leg').style.display=R.cmode?'flex':'none'};$('scDoor').onclick=()=>{stop();click('walkMode');setTimeout(()=>{try{window.__doorPlace()}catch(e){}},60);cap('정면의 자동문으로 걸어가세요','W / 이동 스틱으로 전진');setTimeout(()=>$('scCap').classList.remove('on'),5000)};$('scEng').onclick=()=>document.body.classList.toggle('eng');
vp.addEventListener('pointerdown',()=>{if(document.body.classList.contains('cine'))stop()});
let target=500,cur=0,good=0,fr=0,t0=performance.now();
const setCount=n=>q(0,()=>{const d=$('smokeDensity');n=Math.max(1000,Math.min(12000,Math.round(n/250)*250));cur=n;d.value=n;d.dispatchEvent(new Event('input',{bubbles:true}))});
const tk=()=>{fr++;requestAnimationFrame(tk)};requestAnimationFrame(tk);
setInterval(()=>{const t=performance.now(),f=fr*1000/(t-t0);fr=0;t0=t;if(!cur||document.hidden)return;if(f<26){good=0;if(cur>1000)setCount(cur*.75)}else if(f>52){if(++good>=2&&cur<target){good=0;setCount(cur+1000)}}else good=0},2500);
const go=$('scGo');let ready=false;
const poll=setInterval(()=>{const w=$('wowStart');if(w&&!w.disabled&&!ready){ready=true;go.classList.add('rdy');$('scLoad').textContent='준비 완료'}else if(!ready){$('scLoad').textContent='엔진 준비 중  '+(($('readyBadge')?.textContent||'').slice(0,30))}},400);
go.onclick=()=>{if(!ready)return;clearInterval(poll);setCount(500);$('scSplash').classList.add('off');setTimeout(()=>$('scSplash').remove(),1100);cine()};
})();
;
(()=>{const $=id=>document.getElementById(id),vp=document.querySelector('.viewport');if(!vp)return;
vp.insertAdjacentHTML('beforeend','<div id="bdHud" style="position:absolute;z-index:7;left:50%;top:14px;transform:translateX(-50%);display:none;padding:8px 14px;border-radius:999px;background:#021018cc;border:1px solid #6fd4ff66;color:#e8f8ff;font:700 13px Inter,system-ui,sans-serif;letter-spacing:.02em;backdrop-filter:blur(6px);pointer-events:none;white-space:nowrap"></div>');
const dock=$('scDock');if(dock)dock.insertAdjacentHTML('beforeend','<button id="bdOut">밖에서 나 보기</button><button id="bdBack">다시 내 몸으로</button><button id="bdSnd">바람 소리 켜기</button>');
const cap=(t,s)=>{const c=$('scCap');if(!c)return;c.innerHTML=t+(s?'<small>'+s+'</small>':'');c.classList.add('on');clearTimeout(cap.h);cap.h=setTimeout(()=>c.classList.remove('on'),4500)};
$('bdOut').onclick=()=>{if(!(window.__bodyOutside&&window.__bodyOutside()))cap('먼저 풍동 안으로 들어가세요','"풍동 안으로 걸어 들어가기"를 누르세요');else cap('당신이 서 있던 자리','연기가 몸을 비켜 흐르고 뒤로 소용돌이가 남습니다')};
$('bdBack').onclick=()=>{if(window.__bodyReturn&&window.__bodyReturn())cap('다시 1인칭','움직이면 연기가 따라 바뀝니다')};
let ac=null,gain=null,bp=null,on=false;
function audio(){if(ac)return;const C=window.AudioContext||window.webkitAudioContext;if(!C)return;ac=new C();const n=ac.sampleRate*2,buf=ac.createBuffer(1,n,ac.sampleRate),d=buf.getChannelData(0);let l=0;for(let i=0;i<n;i++){l=(l+.02*(Math.random()*2-1))/1.02;d[i]=l*3.5}
 const src=ac.createBufferSource();src.buffer=buf;src.loop=true;bp=ac.createBiquadFilter();bp.type='bandpass';bp.Q.value=.7;bp.frequency.value=400;gain=ac.createGain();gain.gain.value=0;src.connect(bp);bp.connect(gain);gain.connect(ac.destination);src.start()}
$('bdSnd').onclick=()=>{on=!on;try{audio();ac&&ac.resume()}catch(e){}$('bdSnd').textContent=on?'바람 소리 끄기':'바람 소리 켜기'};
const go=$('scGo');if(go)go.addEventListener('click',()=>{try{audio();ac&&ac.resume();on=true;$('bdSnd').textContent='바람 소리 끄기'}catch(e){}});
setInterval(()=>{const B=window.__BODY,h=$('bdHud');if(!B||!h)return;const act=B.active&&B.inTunnel;h.style.display=act?'block':'none';
 if(act)h.textContent=(B.anchor?'남겨둔 몸 위치':'내 위치')+' 풍속 '+B.speed.toFixed(2)+' m/s  ·  몸이 흐름을 가르는 중';
 if(ac&&gain){const tgt=on&&act?Math.min(.28,.05+B.speed*.09)*(B.anchor?.35:1):0;gain.gain.setTargetAtTime(tgt,ac.currentTime,.25);bp.frequency.setTargetAtTime(300+B.speed*260,ac.currentTime,.3)}},120);
})();
;
(()=>{const $=id=>document.getElementById(id),vp=document.querySelector('.viewport'),L=()=>window.__LIVE;if(!vp)return;
vp.insertAdjacentHTML('beforeend','<div id="lvStat" style="position:absolute;z-index:7;left:12px;top:52px;max-width:calc(100% - 24px);padding:6px 10px;border-radius:8px;background:#000a;color:#bfe9ff;font:600 11px/1.45 ui-monospace,Menlo,monospace;pointer-events:none;white-space:pre-wrap"></div>');
const dock=$('scDock');if(dock)dock.insertAdjacentHTML('afterbegin','<button id="lvRake">연기: 세로 레이크</button><button id="lvWand">스모크 완드 켜기</button><button id="lvU">풍속 5 m/s</button><button id="lvOn">실시간 CFD 끄기</button>');
const cap=(t,s)=>{const c=$('scCap');if(!c)return;c.innerHTML=t+(s?'<small>'+s+'</small>':'');c.classList.add('on');clearTimeout(cap.h);cap.h=setTimeout(()=>c.classList.remove('on'),4500)};
const RK=[['RAKE_V','세로 레이크'],['RAKE_H','가로 레이크'],['BOTH','세로+가로'],['OFF','끄기']];
$('lvRake').onclick=()=>{const l=L();const i=(RK.findIndex(r=>r[0]===l.mode)+1)%RK.length;l.mode=RK[i][0];$('lvRake').textContent='연기: '+RK[i][1]};
$('lvWand').onclick=()=>{const l=L();l.wand=!l.wand;$('lvWand').textContent=l.wand?'스모크 완드 끄기':'스모크 완드 켜기';if(l.wand)cap('손에 연기봉을 들었습니다','풍동 안에서 차 주변을 비춰 보세요')};
const US=[3,5,8,12];$('lvU').onclick=()=>{const l=L();const i=(US.indexOf(l.U)+1)%US.length;l.U=US[i];$('lvU').textContent='풍속 '+US[i]+' m/s'};
$('lvOn').onclick=()=>{const l=L();l.setEnabled(!l.enabled);$('lvOn').textContent=l.enabled?'실시간 CFD 끄기':'실시간 CFD 켜기'};
{const l0=L(),g0=document.querySelector('.sc-leg');if(l0&&g0&&!l0.colorMode){g0.style.display='none';if(window.__RIB)window.__RIB.cmode=0}}
const col=$('scCol');if(col)col.onclick=()=>{const l=L();l.colorMode=!l.colorMode;if(window.__RIB)window.__RIB.cmode=l.colorMode?1:0;const g=document.querySelector('.sc-leg');if(g)g.style.display=l.colorMode?'flex':'none'};
const leg=document.querySelector('.sc-leg');if(leg)leg.innerHTML='<span>느림</span><i></i><span>빠름</span><small style="opacity:.75;margin-left:4px">(기준풍속 대비)</small>';
setInterval(()=>{const l=L(),s=$('lvStat');if(!l||!s)return;document.body.classList.toggle('live-cfd',!!(l.ok&&l.enabled));{const b=$('readyBadge');if(b&&l.ok&&l.enabled){const t='실시간 CFD · '+(l.impl==='MAC'?'MAC 격자':'collocated(대체)')+' · '+(window.__MAC&&l.impl==="MAC"?window.__MAC.solver:l.solver);if(b.textContent!==t){b.textContent=t;b.className='badge live'}}}
 if(l.ok&&l.enabled){const N=l.N,F=l.forces,r=l.benchRes;const M=window.__MAC,mac=l.impl==='MAC'&&M;let x='실시간 GPU CFD · '+(mac?'MAC 엇갈린 격자 · LES(Smagorinsky) · 압력 '+(M.solver==='RBGS'?'RBGS-MG':M.solver):'collocated 대체 솔버(비점성)')+' · '+N.join('×')+' ('+(N[0]*N[1]*N[2]/1e4).toFixed(1)+'만 셀) · 등급 '+l.q+'\n풍속 '+l.U+' m/s · 모의시간 '+l.t.toFixed(2)+' s · '+l.step.toLocaleString()+' 스텝 · 연기원 '+l.emitters.length+'개';
  if(F&&F.n>2)x+='\nCd '+(F.CdMean??F.Cd).toFixed(2)+' ± '+(F.CdStd??0).toFixed(2)+' · Cl '+(F.ClMean??F.Cl).toFixed(2)+' ± '+(F.ClStd??0).toFixed(2)+' (최근 '+(F.window||0).toFixed(1)+' s 평균±표준편차 · '+(mac?'압력+벽전단':'압력항력만')+' · 차량은 참고값)';
  if(mac&&M.eps>0)x+='\n와도 보존력 보정 사용 중(LOW 전용 근사 보정, 물리 법칙 아님)';
  x+='\n계산값: 유동·연기·풍속·Cd/Cl  |  근사: 사람 형상(원기둥)·셀 크기 '+(l.h?Math.round(Math.min(...l.h)*100):'?')+' cm  |  연출: 팬 회전 속도·바람 소리·자막·연기 서서히 옅어짐(스텝당 0.15%)';
  if(l.bench){x+='\n벤치마크(계산 형상은 원기둥, 화면의 차량은 계산에 포함되지 않음): 원기둥 D=0.5m '+(r&&r.ok?'스트라우할 수 St = '+r.St.toFixed(3)+' (문헌 약 0.2 · 격자 '+r.cells.toFixed(1)+'셀/지름)':'측정 중 '+Math.min(100,Math.round(100*l.t/8))+'%')}
  if(/perf=1/.test(location.hash)&&window.__PERF)x+='\n'+window.__perfHudText();
  x+='\n정성적 시각화이며 공학 해석 도구가 아닙니다';s.textContent=x;
  for(const id of ['scMore','scMode','scFlow']){const e=$(id);if(e)e.style.display='none'}}
 else if(l.err){s.textContent='실시간 CFD 사용 불가: '+l.err+'\n기존 필라멘트 방식으로 표시합니다';for(const id of ['scMore','scMode','scFlow']){const e=$(id);if(e)e.style.display=''}}
 else s.textContent=l.enabled?'실시간 CFD 준비 중':'실시간 CFD 꺼짐 · 기존 필라멘트 방식';},300);
})();
