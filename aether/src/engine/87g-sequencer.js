/* ===== AUTOMATIC TEST SEQUENCER: a yaw (and wind) sweep run the way a tunnel test engineer would: for every point set the turntable yaw, restart the flow,
   wait out a spin-up, then average Cd / Cl / Cs over a measurement window of simulated time and judge convergence (first-half vs second-half mean). Results go to a
   table, a polar chart, CSV / JSON and a one-page HTML report with the test conditions and an explicit reliability note. Nothing here changes the solver:
   it drives the existing public pieces (LIVE.api.setYaw, CONTROLS.windSet, the LIVE.aero force history) and never fakes a number. Every point is an independent run
   from rest (setYaw restarts the flow), so a sweep costs (spin-up + window) simulated seconds per point. */
const SEQ={state:'IDLE',opts:null,plan:[],idx:0,cur:null,results:[],err:null,msg:'',startWall:0,saved:null,phase:'',doneWall:0};
window.__SEQ=SEQ;
SEQ.presets={quick:{name:'빠른 스윕(5점)',yaws:[-6,-3,0,3,6],window:6},precise:{name:'정밀 스윕(9점)',yaws:[-12,-9,-6,-3,0,3,6,9,12],window:12},
 ride:{name:'차고 스윕(−20, 0, +20 mm)',axis:'ride',yaws:[-20,0,20],window:8},pitch:{name:'피치 스윕(−1, 0, +1°)',axis:'pitch',yaws:[-1,0,1],window:8}};
SEQ.axisInfo={yaw:{unit:'°',label:'요각'},ride:{unit:' mm',label:'차고'},pitch:{unit:'°',label:'피치'}};
SEQ.spinUpFor=U=>Math.max(4,25/Math.max(U,1)); /* about 5 car lengths of wake development: 5 s at 5 m/s, 8.3 s at 3 m/s */
/* simulated seconds the sweep needs at least (no convergence retries) */
SEQ.estimate=o=>{const U=o.U||LIVE.U||5,n=(o.values||o.yaws).length,per=(o.spinUp??SEQ.spinUpFor(U))+o.window;return {points:n,simPerPoint:per,simTotal:n*per}};
SEQ.start=(o={})=>{if(SEQ.state==='RUN'||SEQ.state==='SETUP')return false;if(!LIVE.ok||LIVE.impl!=='MAC'||!LIVE.init)return false;if(rollingState.emergencyStopped)return false;
 const P=SEQ.presets[o.plan||'quick']||SEQ.presets.quick,U=o.U||LIVE.U||5,axis=o.axis||P.axis||'yaw',lim=axis==='yaw'?[-12,12]:AERO.limits[axis]||[-1e9,1e9],yaws=(o.values||o.yaws||P.yaws).map(v=>Math.max(lim[0],Math.min(lim[1],+v))).filter(Number.isFinite);if(!yaws.length)return false;
 SEQ.opts={plan:o.plan||'quick',axis,yaws,U,window:o.window??P.window,spinUp:o.spinUp??SEQ.spinUpFor(U),maxMul:o.maxMul??2.5,minSamples:o.minSamples??8,tolAbs:o.tolAbs??.006,tolRel:o.tolRel??.02};
 SEQ.saved={yaw:YAW.deg||0,U:LIVE.U,freeze:LIVE.freeze,aero:{rideMm:AERO.rideMm,pitchDeg:AERO.pitchDeg}};SEQ.plan=yaws.slice();SEQ.idx=0;SEQ.results=[];SEQ.err=null;SEQ.cur=null;SEQ.startWall=performance.now();SEQ.doneWall=0;
 if(Math.abs(LIVE.U-U)>1e-6&&window.__CONTROLS&&!window.__CONTROLS.windSet(U)){SEQ.err='풍속 '+U+' m/s를 설정할 수 없습니다';SEQ.state='ABORTED';return false}
 SEQ.state='SETUP';SEQ.msg='시작';return true};
SEQ.abort=(why)=>{if(SEQ.state==='IDLE'||SEQ.state==='DONE'||SEQ.state==='ABORTED')return;SEQ.state='ABORTED';SEQ.msg=why||'중단';seqRestore()};
function seqRestore(){const S=SEQ.saved;if(!S)return;try{if(S.aero)AERO.set(S.aero);if(Math.abs((YAW.deg||0)-S.yaw)>1e-9)LIVE.api.setYaw(S.yaw);if(Math.abs(LIVE.U-S.U)>1e-6)window.__CONTROLS?.windSet?.(S.U)}catch(e){SEQ.err=String(e?.message||e)}}
const seqStats=(S,k)=>{const n=S.length;if(!n)return {m:NaN,sd:NaN};const m=S.reduce((a,s)=>a+s[k],0)/n;return {m,sd:Math.sqrt(S.reduce((a,s)=>a+(s[k]-m)**2,0)/n)}};
function seqMeasure(c,tt){const O=SEQ.opts,t1=tt,t0=Math.max(O.spinUp,tt-O.window),S=LIVE.aero.filter(a=>a[0]>=t0&&a[0]<=t1);if(S.length<2)return null;
 const mid=(S[0][0]+S[S.length-1][0])/2,A=S.filter(a=>a[0]<mid),B=S.filter(a=>a[0]>=mid),cd=seqStats(S,1),cl=seqStats(S,2),cs=seqStats(S,3),d1=Math.abs(seqStats(A,1).m-seqStats(B,1).m),d3=Math.abs(seqStats(A,3).m-seqStats(B,3).m);
 const okCd=d1<=Math.max(O.tolAbs,O.tolRel*Math.abs(cd.m)),okCs=d3<=Math.max(2*O.tolAbs,.05*Math.abs(cs.m));
 return {n:S.length,span:S[S.length-1][0]-S[0][0],Cd:cd.m,CdStd:cd.sd,Cl:cl.m,ClStd:cl.sd,Cs:cs.m,CsStd:cs.sd,halfDiffCd:d1,halfDiffCs:d3,converged:okCd&&okCs}}
function seqRecord(c,tt,m,why){const h=Math.min(...LIVE.h);SEQ.results.push({axis:SEQ.opts.axis,x:c.yaw,yaw:SEQ.opts.axis==='yaw'?c.yaw:(YAW.deg||0),U:LIVE.U,n:m?.n??0,windowS:+(m?.span??0).toFixed(2),Cd:m?.Cd??null,CdStd:m?.CdStd??null,Cl:m?.Cl??null,ClStd:m?.ClStd??null,Cs:m?.Cs??null,CsStd:m?.CsStd??null,
  halfDiffCd:m?.halfDiffCd??null,converged:!!m?.converged,note:why,simEnd:+tt.toFixed(2),wallS:+((performance.now()-c.wall0)/1000).toFixed(1),tier:LIVE.q,cell:+h.toFixed(4)})}
/* once per frame from the render loop */
function seqTick(now){void now;const st=SEQ.state;if(st!=='SETUP'&&st!=='RUN')return;
 if(!LIVE.ok||!LIVE.init)return;if(rollingState.emergencyStopped){SEQ.abort('비상정지로 중단');return}if(LIVE.freeze){SEQ.phase='일시정지';return}
 const O=SEQ.opts;
 try{if(st==='SETUP'){const v=SEQ.plan[SEQ.idx],ax=O.axis;SEQ.cur={yaw:v,wall0:performance.now()};
   if(ax==='yaw'){const same=Math.abs((YAW.deg||0)-v)<1e-9;LIVE.api.setYaw(v);if(same)LIVE.api.reset()}
   else{AERO.set({rideMm:0,pitchDeg:0,[ax==='ride'?'rideMm':'pitchDeg']:v,force:true});LIVE.api.reset()}LIVE.aero.length=0;SEQ.state='RUN';SEQ.phase='예열';return}
  const c=SEQ.cur,tt=LIVE.t;if(tt<O.spinUp){SEQ.phase='예열 '+tt.toFixed(1)+'/'+O.spinUp.toFixed(1)+' s';SEQ.msg=SEQ.axisInfo[O.axis].label+' '+c.yaw+SEQ.axisInfo[O.axis].unit+' ('+(SEQ.idx+1)+'/'+SEQ.plan.length+')';return}
  const m=seqMeasure(c,tt);const end=O.spinUp+O.window*O.maxMul;SEQ.phase='측정 '+(m?m.span.toFixed(1):'0')+'/'+O.window+' s';SEQ.msg=SEQ.axisInfo[O.axis].label+' '+c.yaw+SEQ.axisInfo[O.axis].unit+' ('+(SEQ.idx+1)+'/'+SEQ.plan.length+')';
  if(m&&m.span>=O.window*.98&&m.n>=O.minSamples&&(m.converged||tt>=end)){seqRecord(c,tt,m,m.converged?'수렴':'시간 상한(미수렴)');seqNext()}
  else if(tt>=end){seqRecord(c,tt,m&&m.n>=2?m:null,'표본 부족');seqNext()}}
 catch(e){SEQ.err=String(e?.message||e);SEQ.state='ABORTED';SEQ.msg='오류';seqRestore()}}
function seqNext(){SEQ.idx++;if(SEQ.idx>=SEQ.plan.length){SEQ.state='DONE';SEQ.msg='완료';SEQ.doneWall=performance.now();seqRestore();return}SEQ.state='SETUP'}
/* symmetry self-check: for each +/-theta pair Cs should flip sign and Cd stay close (the car geometry is not exactly symmetric, so a non-zero value is information, not an error) */
SEQ.symmetry=()=>{const R=SEQ.results,out=[];if(SEQ.opts?.axis!=='yaw')return out;for(const r of R){if(r.yaw<=0)continue;const q=R.find(x=>Math.abs(x.yaw+r.yaw)<1e-9);if(q&&r.Cd!==null&&q.Cd!==null)out.push({yaw:r.yaw,dCd:Math.abs(r.Cd-q.Cd),sumCs:r.Cs+q.Cs,CsMean:(Math.abs(r.Cs)+Math.abs(q.Cs))/2})}return out};
/* change relative to the baseline point (x = 0, else the first point), with an honest verdict: below grid resolution / noise level / significant.
   noise: time-series sd of the larger of the two points divided by sqrt(n_eff), n_eff = window / 1 s correlation time (a stated assumption, not a measurement) */
SEQ.deltas=()=>{const R=SEQ.results.filter(r=>r.Cd!==null);if(R.length<2)return [];const base=R.find(r=>r.x===0)||R[0],ax=SEQ.opts?.axis||'yaw',out=[];
 for(const r of R){if(r===base)continue;const neff=Math.max(1,Math.min(r.windowS,base.windowS)/1),sd=Math.max(r.CdStd,base.CdStd),noise=sd/Math.sqrt(neff),dCd=r.Cd-base.Cd,dCs=r.Cs-base.Cs;
  const res=ax==='yaw'?null:AERO.resolution({rideMm:ax==='ride'?r.x:0,pitchDeg:ax==='pitch'?r.x:0});
  const verdict=res&&!res.resolved?'해상도 미만':Math.abs(dCd)<2*noise?'노이즈 수준':'유의(참고)';out.push({x:r.x,dCd,dCs,noise,verdict,cells:res?res.maxCells:null})}return out};
SEQ.progress=()=>{const O=SEQ.opts;if(!O)return 0;const n=SEQ.plan.length;const part=SEQ.state==='RUN'&&SEQ.cur?Math.min(1,LIVE.t/(O.spinUp+O.window)):0;return SEQ.state==='DONE'?1:Math.min(1,(SEQ.idx+part)/n)};
SEQ.conditions=()=>{const O=SEQ.opts||{},h=Math.min(...(LIVE.h||[0])),b=window.__BUILD||{};return {axis:O.axis||'yaw',aero:{rideMm:AERO.rideMm,pitchDeg:AERO.pitchDeg},yawDeg:YAW.deg||0,date:new Date().toISOString(),tunnel:TUNNEL_V2.active?'v2 3/4 open-jet':'legacy',tier:LIVE.q,cellM:+h.toFixed(4),grid:LIVE.N?LIVE.N.join('x'):'',U:O.U,spinUpS:+((O.spinUp)||0).toFixed(1),windowS:O.window,version:AETHER.VERSION,build:b.hash||'',stepOfAxis:SEQ.plan.length>1?Math.abs(SEQ.plan[1]-SEQ.plan[0]):0}};
/* reliability statement stays in the data: Cl is not trustworthy (L4), Cd is a reference value, Cs qualitative */
SEQ.reliability=()=>({tier:LIVE.q==='LITE'?'LITE 등급은 연기 표시용 격자(셀 약 33 cm)라 항력 계수가 격자 의존으로 매우 낮게 나옵니다(같은 조건에서 LOW 약 0.7 대비 LITE 약 0.1~0.2). 시험에는 LOW 이상을 쓰세요.':'',Cd:'참고값(압력 항력만, 점성 마찰·경계층 미해상)',Cl:'신뢰 불가(차 밑 틈 미해상, KNOWN_LIMITATIONS L4)',Cs:'정성(요각에 대한 방향·크기 경향)',note:'격자 7.5~24 cm, LES Smagorinsky, 균일 격자. 실측 풍동 결과와 직접 비교 금지.'});
SEQ.json=()=>JSON.stringify({conditions:SEQ.conditions(),reliability:SEQ.reliability(),results:SEQ.results,symmetry:SEQ.symmetry(),deltas:SEQ.deltas(),state:SEQ.state},null,1);
SEQ.csv=()=>{const rows=['axis,x,U_ms,Cd,Cd_std,Cl,Cl_std,Cs,Cs_std,n_samples,window_s,half_diff_Cd,converged,note,sim_end_s,wall_s,tier,cell_m'];for(const r of SEQ.results){const f=v=>v===null||v===undefined?'':(+v).toFixed(4);rows.push([r.axis,r.x,r.U,f(r.Cd),f(r.CdStd),f(r.Cl),f(r.ClStd),f(r.Cs),f(r.CsStd),r.n,r.windowS,f(r.halfDiffCd),r.converged,r.note,r.simEnd,r.wallS,r.tier,r.cell].join(','))}return rows.join('\n')};
/* inline-SVG polar chart (series vs yaw with +/-1 sd bars); used by the page and by the HTML report */
SEQ.svg=(w=520,h=260)=>{const R=SEQ.results.filter(r=>r.Cd!==null).map(r=>({...r,yaw:r.x})),AU=SEQ.axisInfo[SEQ.opts?.axis||'yaw'];if(R.length<2)return '';const ser=[['Cd','#d98a00','Cd','CdStd'],['Cs','#7a4fd1','Cs','CsStd'],['Cl','#1f8fc2','Cl','ClStd']],xs=R.map(r=>r.yaw),x0=Math.min(...xs),x1=Math.max(...xs);let lo=1e9,hi=-1e9;
 for(const r of R)for(const [,,k,s] of ser){lo=Math.min(lo,r[k]-r[s]);hi=Math.max(hi,r[k]+r[s])}lo=Math.min(lo,0);hi=Math.max(hi,.1);const pd=(hi-lo)*.08;lo-=pd;hi+=pd;
 const X=v=>48+(x1>x0?(v-x0)/(x1-x0):.5)*(w-64),Y=v=>h-30-(v-lo)/(hi-lo)*(h-46);let g=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="요각에 따른 Cd Cs Cl"><rect width="${w}" height="${h}" fill="none"/>`;
 g+=`<line x1="48" y1="${Y(0)}" x2="${w-16}" y2="${Y(0)}" stroke="#8892a0" stroke-width="1" stroke-dasharray="3 3"/>`;
 for(const v of xs)g+=`<text x="${X(v)}" y="${h-10}" font-size="10" text-anchor="middle" fill="#8892a0">${v}${AU.unit.trim()}</text><line x1="${X(v)}" y1="${h-30}" x2="${X(v)}" y2="${h-26}" stroke="#8892a0"/>`;
 for(let k=0;k<=4;k++){const v=lo+(hi-lo)*k/4;g+=`<text x="44" y="${Y(v)+3}" font-size="10" text-anchor="end" fill="#8892a0">${v.toFixed(2)}</text>`}
 for(const [n,c,k,s] of ser){g+=`<polyline fill="none" stroke="${c}" stroke-width="2" points="${R.map(r=>X(r.yaw)+','+Y(r[k])).join(' ')}"/>`;for(const r of R)g+=`<line x1="${X(r.yaw)}" y1="${Y(r[k]-r[s])}" x2="${X(r.yaw)}" y2="${Y(r[k]+r[s])}" stroke="${c}" stroke-width="1.5"/><circle cx="${X(r.yaw)}" cy="${Y(r[k])}" r="3.5" fill="${c}"/>`;
  g+=`<text x="${w-12}" y="${Y(R[R.length-1][k])-6}" font-size="11" text-anchor="end" fill="${c}">${n}</text>`}
 return g+'</svg>'};
SEQ.html=()=>{const C=SEQ.conditions(),Rl=SEQ.reliability(),AU=SEQ.axisInfo[SEQ.opts?.axis||'yaw'],f=(v,d=3)=>v===null||v===undefined?'–':(+v).toFixed(d),sym=SEQ.symmetry(),dl=SEQ.deltas();
 const rows=SEQ.results.map(r=>`<tr><td>${r.x}${AU.unit}</td><td>${f(r.Cd)} ± ${f(r.CdStd)}</td><td>${f(r.Cs)} ± ${f(r.CsStd)}</td><td>${f(r.Cl)} ± ${f(r.ClStd)}</td><td>${r.n}</td><td>${r.windowS} s</td><td>${r.converged?'수렴':'<b>미수렴</b>'}</td><td>${r.note}</td></tr>`).join('');
 const sr=sym.map(s=>`<tr><td>±${s.yaw}°</td><td>${f(s.dCd)}</td><td>${f(s.sumCs)}</td><td>${f(s.CsMean)}</td></tr>`).join('');
 return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AETHER 시험 보고서</title><style>body{font:14px/1.5 system-ui,sans-serif;margin:16px auto;max-width:860px;padding:0 16px;color:#1b2430}h1{font-size:20px}table{border-collapse:collapse;width:100%;margin:8px 0}td,th{border:1px solid #c9d1db;padding:4px 8px;text-align:right}th{background:#eef2f7}td:last-child,th:last-child{text-align:left}.warn{background:#fff6e0;border:1px solid #e3b341;padding:8px 12px;border-radius:8px}@media(prefers-color-scheme:dark){body{background:#10151c;color:#dbe3ec}th{background:#1c2430}td,th{border-color:#34404f}.warn{background:#2a2412}}</style></head><body>
<h1>AETHER ${AU.label} 스윕 시험 보고서</h1><p>${C.date} · ${C.tunnel} · 등급 ${C.tier} · 격자 ${C.grid}(셀 ${(C.cellM*100).toFixed(1)} cm) · 풍속 ${C.U} m/s · 예열 ${C.spinUpS} s · 측정 창 ${C.windowS} s · 버전 ${C.version}</p>
${SEQ.svg()}<table><tr><th>${AU.label}</th><th>Cd ± σ</th><th>Cs ± σ</th><th>Cl ± σ</th><th>표본</th><th>창</th><th>수렴</th><th>비고</th></tr>${rows}</table>
${dl.length?`<h2>기준 대비 변화</h2><table><tr><th>${AU.label}</th><th>ΔCd</th><th>ΔCs</th><th>잡음(1σ 추정)</th><th>격자 칸 수</th><th>판정</th></tr>${dl.map(d=>`<tr><td>${d.x}${AU.unit}</td><td>${f(d.dCd)}</td><td>${f(d.dCs)}</td><td>${f(d.noise)}</td><td>${d.cells===null?'–':d.cells.toFixed(2)}</td><td>${d.verdict}</td></tr>`).join('')}</table><p>판정: 변화량이 격자 2칸 미만이면 '해상도 미만', |ΔCd|가 잡음의 2배 미만이면 '노이즈 수준'. 잡음은 상관 시간 1 s를 가정한 추정입니다.</p>`:''}${sr?`<h2>대칭성 점검</h2><table><tr><th>쌍</th><th>|Cd(+)−Cd(−)|</th><th>Cs(+)+Cs(−)</th><th>평균 |Cs|</th></tr>${sr}</table><p>차체가 정확한 좌우대칭이 아니고 격자가 균일해 0이 되지 않는 것이 정상입니다. 값이 평균 |Cs| 대비 크면 해석 오차를 의심하세요.</p>`:''}
<div class="warn"><b>신뢰도</b><br>Cd: ${Rl.Cd}<br>Cl: ${Rl.Cl}<br>Cs: ${Rl.Cs}<br>${Rl.note}${Rl.tier?`<br><b>${Rl.tier}</b>`:''}</div></body></html>`};
