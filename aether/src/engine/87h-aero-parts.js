/* ===== ADJUSTABLE AERO SET-UP: ride height and pitch (rake) of the car body (a rear-wing flap angle is not offered: the GLB is one merged body mesh and the wing chord is below the grid resolution, see KNOWN_LIMITATIONS L35). The wheels stay on the belt (the body moves relative to them,
   a few mm to 3 cm of suspension travel); the body is re-voxelised and the flow restarts, exactly like a yaw change. The state lives in AERO (40-gl-walk-door.js) so
   vehicleModel() can include it. A resolution gate states plainly whether the geometric change is larger than the grid can represent (L4: under-car gap about 7 cm,
   cells 7.5-24 cm): at the tunnel's grids a +-30 mm ride-height change is far below one cell and its effect on Cd is expected to be indistinguishable from noise. ===== */
window.__AERO=AERO;
/* body-only transform, world frame, applied before the yaw: lift by dy, pitch about the lateral axis through the front axle (positive pitch = nose up; the car's nose points to -X) */
function aeroAxleX(){if(AERO.axleX!==null)return AERO.axleX;const b=vehicleBase0(),xs=wheelParts().map(p=>{const q=p.wheel.pivot;return b[0]*q[0]+b[4]*q[1]+b[8]*q[2]+b[12]}).sort((a,c)=>a-c);AERO.axleX=xs.length>=4?(xs[0]+xs[1])/2:(b[12]-1.5);AERO.rearX=xs.length>=4?(xs[2]+xs[3])/2:b[12]+1.2;return AERO.axleX}
function aeroBodyMatrix(){const dy=AERO.rideMm/1000,th=-AERO.pitchDeg*Math.PI/180,c=Math.cos(th),s=Math.sin(th),ax=aeroAxleX();return new Float32Array([c,s,0,0,-s,c,0,0,0,0,1,0,ax-c*ax,-s*ax+dy,0,1])}
AERO.wheelbase=()=>{aeroAxleX();return Math.abs(AERO.rearX-AERO.axleX)};
AERO.set=(o={})=>{const L=AERO.limits,cl=(v,r)=>Math.max(r[0],Math.min(r[1],+v)),n={rideMm:o.rideMm!==undefined?cl(o.rideMm,L.ride):AERO.rideMm,pitchDeg:o.pitchDeg!==undefined?cl(o.pitchDeg,L.pitch):AERO.pitchDeg};
 if(![n.rideMm,n.pitchDeg].every(Number.isFinite))return false;const same=n.rideMm===AERO.rideMm&&n.pitchDeg===AERO.pitchDeg;
 AERO.rideMm=n.rideMm;AERO.pitchDeg=n.pitchDeg;AERO.active=!!(n.rideMm||n.pitchDeg);if(same&&!o.force)return true;
 vehicleGeometryEpoch++;if(typeof flowLayoutCache!=='undefined')flowLayoutCache=null;LIVE.forces=null;LIVE.aero.length=0;
 if(LIVE.init&&LIVE.ok)try{liveReobstacle(AETHER.FAN_MODULE?.layout?.fanBounds||null);LIVE.api.reset()}catch(e){LIVE.err='aero: '+e.message}return true};
AERO.reset=()=>AERO.set({rideMm:0,pitchDeg:0});
/* is the change representable on the current grid? cells = displacement / cell size; < 2 cells means "below resolution" (see KNOWN_LIMITATIONS L35) */
AERO.resolution=(v)=>{v=v||{rideMm:AERO.rideMm,pitchDeg:AERO.pitchDeg};const cell=Math.min(...(LIVE.h||[.24])),wb=AERO.wheelbase(),
 ride=Math.abs(v.rideMm||0)/1000/cell,pitch=Math.abs(Math.tan((v.pitchDeg||0)*Math.PI/180))*wb/cell,max=Math.max(ride,pitch);
 return {cell,rideCells:ride,pitchCells:pitch,maxCells:max,resolved:max>=2,note:max===0?'기준 상태':max>=2?'격자로 표현 가능한 변화':'변화량이 격자 2칸 미만 — 계산 결과의 차이는 노이즈 수준일 가능성이 큼'}};
