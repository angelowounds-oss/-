/* Wall LED display (visual, reads values the solver already produced; computes nothing new).
   The panel is the tunnel-GLB mesh AETHER_WALL_DISPLAY on the -Z wall facing the control room. A 2D canvas is drawn at 5 Hz and uploaded as its texture.
   Numbers: wind speed (set point), dynamic pressure q = 1/2 rho U^2 with the solver's rho = 1.2, Cd / Cl (smoothed solver forces, mean +- std over the last 8 s of simulated time),
   yaw / ride / pitch settings, and a Cd trace. They come from the LOW/MID/... CFD tier that is running (cells of 7.5 to 33 cm, boundary layer not resolved: KNOWN_LIMITATIONS L4, L26),
   so the panel says so itself. Off with #display=0. */
const DISP={on:!/display=0/.test(location.hash),w:2048,h:560,cv:null,cx:null,tex:null,obj:null,last:0,histT:0,hist:[],gen:-1,draws:0};
window.__DISP=DISP;
function dispInit(){const o=scene.objects.find(q=>q.name==='tv2.AETHER_WALL_DISPLAY');if(!o)return false;
 if(!DISP.cv){DISP.cv=document.createElement('canvas');DISP.cv.width=DISP.w;DISP.cv.height=DISP.h;DISP.cx=DISP.cv.getContext('2d',{alpha:false})}
 if(DISP.gen!==runtimeGeneration||!DISP.tex){DISP.tex=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,DISP.tex);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,DISP.w,DISP.h,0,gl.RGBA,gl.UNSIGNED_BYTE,null);DISP.gen=runtimeGeneration}
 DISP.obj=o;o.texture=DISP.tex;return true}
function dispVals(){const F=LIVE.forces,ok=!!(LIVE.ok&&F&&Number.isFinite(F.Cd)&&(LIVE.t||0)>=4),U=LIVE.U;/* the first seconds are the start-up transient: no coefficients shown until 4 s of simulated time */
 return {ok,U,q:.5*1.2*U*U,Cd:ok?(F.CdMean??F.Cd):null,CdStd:ok&&Number.isFinite(F.CdStd)?F.CdStd:null,Cl:ok&&Number.isFinite(F.ClMean??F.Cl)?(F.ClMean??F.Cl):null,ClStd:ok&&Number.isFinite(F.ClStd)?F.ClStd:null,yaw:window.__YAW?.deg||0,ride:AERO.rideMm,pitch:AERO.pitchDeg,tier:LIVE.q||'–',cell:LIVE.h?Math.min(...LIVE.h)*100:null,t:LIVE.t||0,
  state:AETHER.M14?.getSnapshot?.()?.control?.emergencyStopped?'E-STOP':(LIVE.freeze?'PAUSED':(LIVE.ok?'RUNNING':'WAITING'))}}
function dispDraw(){const c=DISP.cx,W=DISP.w,H=DISP.h,v=dispVals(),cy='#52e3ff',am='#ffb347',dim='#7d97a8',fg='#eaf6ff';
 c.fillStyle='#04090f';c.fillRect(0,0,W,H);
 const g=c.createLinearGradient(0,0,0,H);g.addColorStop(0,'#0a1a26');g.addColorStop(1,'#04090f');c.fillStyle=g;c.fillRect(0,0,W,H);
 c.strokeStyle='rgba(82,227,255,.07)';c.lineWidth=1;for(let x=0;x<W;x+=64){c.beginPath();c.moveTo(x,0);c.lineTo(x,H);c.stroke()}for(let y=0;y<H;y+=64){c.beginPath();c.moveTo(0,y);c.lineTo(W,y);c.stroke()}
 c.fillStyle=cy;c.fillRect(0,0,W,6);c.fillRect(0,H-6,W,6);
 const T=(txt,x,y,size,col,w='600',al='left',fam='system-ui, sans-serif')=>{c.font=w+' '+size+'px '+fam;c.fillStyle=col;c.textAlign=al;c.fillText(txt,x,y)};
 T('AETHER',48,84,64,fg,'800');T('WIND TUNNEL · LIVE',48,128,28,cy,'600');
 T(v.state,W-48,84,56,v.state==='RUNNING'?'#5dffa4':(v.state==='E-STOP'?'#ff5a4a':am),'800','right');T('t = '+v.t.toFixed(1)+' s · '+v.tier+(v.cell?' · cell '+v.cell.toFixed(1)+' cm':'')+(v.Cd!==null&&v.CdStd!==null?(v.CdStd/Math.max(Math.abs(v.Cd),1e-6)>.05?' · Cd SETTLING':' · Cd STEADY'):''),W-48,128,28,dim,'500','right','ui-monospace, monospace');
 c.strokeStyle='rgba(234,246,255,.18)';c.lineWidth=2;c.beginPath();c.moveTo(48,156);c.lineTo(W-48,156);c.stroke();
 const cell=(i,label,val,unit,col)=>{const x=48+(i&1)*640,ly=206+(i>>1)*186,vy=ly+98;T(label,x,ly,28,dim,'600');T(val,x,vy,112,col,'700','left','ui-monospace, monospace');c.font='700 112px ui-monospace, monospace';const w=c.measureText(val).width;T(unit,x+w+16,vy,28,dim,'500')};
 cell(0,'WIND SPEED',v.U.toFixed(1),'m/s',fg);cell(1,'DYNAMIC PRESSURE q',v.q.toFixed(0),'Pa',fg);
 cell(2,'DRAG Cd',v.Cd===null?'–':v.Cd.toFixed(3),v.CdStd===null?'':'± '+v.CdStd.toFixed(3),cy);cell(3,'LIFT Cl (unreliable on coarse grid)',v.Cl===null?'–':v.Cl.toFixed(3),v.ClStd===null?'':'± '+v.ClStd.toFixed(3),am);
 const cx0=1336,cy0=206,cw=624,ch=170;c.strokeStyle='rgba(234,246,255,.25)';c.lineWidth=2;c.strokeRect(cx0,cy0,cw,ch);T('Cd, last 40 s',cx0,cy0-14,26,dim,'600');T('YAW '+v.yaw.toFixed(1)+'°   RIDE '+(v.ride>0?'+':'')+v.ride+' mm',cx0,432,32,fg,'600','left','ui-monospace, monospace');T('PITCH '+v.pitch.toFixed(2)+'°   ρ = 1.2 kg/m³',cx0,478,32,fg,'600','left','ui-monospace, monospace');
 const h=DISP.hist;if(h.length>2){const mu=h.reduce((a,b)=>a+b,0)/h.length,lo=Math.min(...h),hi=Math.max(...h),span=Math.max(hi-lo,.08),mid=(hi+lo)/2;
  c.strokeStyle=cy;c.lineWidth=4;c.beginPath();h.forEach((y,i)=>{const px=cx0+cw*i/79,py=cy0+ch/2-(y-mid)/span*(ch-30);i?c.lineTo(px,py):c.moveTo(px,py)});c.stroke();
  T(hi.toFixed(2),cx0+cw+10,cy0+22,22,dim,'500');T(lo.toFixed(2),cx0+cw+10,cy0+ch,22,dim,'500');void mu}
 else T(LIVE.ok?'settling (first 4 s)…':'waiting for flow…',cx0+24,cy0+ch/2,28,dim,'500');
 T('QUALITATIVE · coarse-grid CFD, boundary layer not resolved · ± = std over last 8 s · not a measurement',W/2,H-24,24,dim,'500','center')}
function dispStep(now){if(!DISP.on||DISP.err||!gl||gl.isContextLost())return;try{dispStep2(now)}catch(e){DISP.err=String(e?.message||e);DISP.obj&&(DISP.obj.texture=null)}}
function dispStep2(now){if(!DISP.obj||DISP.gen!==runtimeGeneration){if(!dispInit())return}
 if(now-DISP.histT>500){DISP.histT=now;const F=LIVE.forces;if(LIVE.ok&&F&&Number.isFinite(F.Cd)&&!LIVE.freeze){DISP.hist.push(F.CdMean??F.Cd);if(DISP.hist.length>80)DISP.hist.shift()}else if(!F)DISP.hist.length=0}
 if(now-DISP.last<200)return;DISP.last=now;dispDraw();
 gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,DISP.tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,gl.RGBA,gl.UNSIGNED_BYTE,DISP.cv);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.generateMipmap(gl.TEXTURE_2D);DISP.draws++}
