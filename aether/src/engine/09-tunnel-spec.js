/* ===== TUNNEL SPEC (single source of truth for the v2 tunnel; plain JS, no engine dependencies, so tools/gen can evaluate this file too).
   Representative 3/4 open-jet automotive wind tunnel assembled from public figures only (nozzle 18-25 m^2, test length about 3 hydraulic
   diameters, +-180 deg turntable, 5-belt moving ground, semi-anechoic plenum). It is NOT a copy of any real facility: the public sources give
   ranges, not drawings. World frame: +X downstream, +Y up, +Z lateral, floor at y=0, turntable centre at the origin. Units: metres. */
const TUNNEL_SPEC=(()=>{
 const S={
  version:2,
  /* CFD domain: from the settling-chamber inlet plane (uniform inflow) to just past the collector duct exit (pressure outlet) */
  domain:{x0:-14,x1:19.5,y0:0,y1:8,zh:6.5},
  settling:{x0:-14,x1:-12.5,W:10,H:8,honeycomb:{x:-13.75,depth:.12,cell:.05,t:.0015},screens:[{x:-13.2,pitch:.1,wire:.003},{x:-12.9,pitch:.1,wire:.003}]},
  nozzle:{x0:-12.5,x1:-6,inW:10,inH:8,outW:5.2,outH:3.8,corner:.35,wall:.06,lip:.08},
  plenum:{x0:-7,x1:18.5,y0:0,y1:8,zh:6.5,wedge:{depth:.8,pitch:.4}},
  collector:{x0:6.5,throatX:10,inW:8,inH:5.4,thW:6.4,thH:4.6,x1:18.5,xOut:19.5,lipR:.25,wall:.06},
  turntable:{r:3.75,thickness:.3,gap:.025,pit:{hx:3.2,hz:1.35},squareHalf:4.2},
  window:{x0:-3,x1:3,y0:1.1,y1:4.3,wallZ:1}, /* observation window in the +Z side wall */
  controlRoom:{depth:5.5,floorY:.75},
  /* personnel door in the +Z plenum wall beside the window, reached by a 4-step stair from the plenum floor to the control-room floor (sill = floorY) */
  door:{x0:3.55,x1:4.4,y0:.75,y1:2.85,steps:4,tread:.28,landing:.36,N:12},
  /* fan room behind the plenum back wall (visual only, outside the CFD domain x <= 19.5): diffuser -> fan wall -> contraction -> return duct leaving through the east wall.
     Two inspection hatches (glass) in the plenum back wall look into it. fanX is the fan asset's centre x. */
  fanRoom:{x0:18.5,x1:30,y1:7.2,zh:6.5,diffuser:{x0:19.5,x1:22.5,hw:3.6,h:4.95},fanX:23.6,ret:{x0:24.85,x1:27.85,hw:2.2,h:3.4,xEnd:30},hatch:{z0:4.1,z1:5.3,y0:1.0,y1:3.2}},
  car:{noseGap:3.65} /* nozzle exit plane to the nose of the 4.7 m car centred on the turntable */
 };
 /* quintic smoothstep: zero slope and curvature at both ends, monotone */
 const ss=t=>{t=Math.min(1,Math.max(0,t));return t*t*t*(t*(t*6-15)+10)};
 const d={};
 d.nozzleOutArea=S.nozzle.outW*S.nozzle.outH;d.nozzleInArea=S.nozzle.inW*S.nozzle.inH;d.contractionRatio=d.nozzleInArea/d.nozzleOutArea;
 d.hydraulicDiameter=4*d.nozzleOutArea/(2*(S.nozzle.outW+S.nozzle.outH));
 d.testSectionLength=S.collector.x0-S.nozzle.x1;d.testSectionDh=d.testSectionLength/d.hydraulicDiameter;
 d.collectorInArea=S.collector.inW*S.collector.inH;d.collectorAreaRatio=d.collectorInArea/d.nozzleOutArea;
 d.nozzleExitX=S.nozzle.x1;
 /* inlet velocity that carries U through the nozzle exit: U_in = U * A_exit / A_inlet */
 d.inletScale=d.nozzleOutArea/d.nozzleInArea;
 /* nozzle half-width, height and top-corner radius at x (x in [nozzle.x0, nozzle.x1]) */
 d.nozzleAt=x=>{const n=S.nozzle,s=ss((x-n.x0)/(n.x1-n.x0));return {hw:(n.inW+(n.outW-n.inW)*s)/2,h:n.inH+(n.outH-n.inH)*s,r:.05+(n.corner-.05)*s}};
 d.collectorAt=x=>{const c=S.collector;if(x>=c.throatX)return {hw:c.thW/2,h:c.thH};const s=ss((x-c.x0)/(c.throatX-c.x0));return {hw:(c.inW+(c.thW-c.inW)*s)/2,h:c.inH+(c.thH-c.inH)*s}};
 /* analytic solid test used by the solver (th = wall thickness to use, at least one grid cell). Solid: the housing around the settling
    chamber and the nozzle up to the plenum front wall, the thin shells of the protruding nozzle and of the collector inside the plenum,
    and the collector duct beyond the plenum back wall. Plenum air and the jet are fluid; domain faces at y=0, y=8 and z=+-6.5 are walls. */
 const thin=(a,y,z,t)=>{const dz=Math.abs(z)-a.hw,dy=y-a.h;return (dz>0&&dz<t&&y<=a.h+t)||(dy>0&&dy<t&&Math.abs(z)<=a.hw+t)};
 d.isSolid=(x,y,z,th=0)=>{const t=Math.max(th,.06);
  if(x<S.nozzle.x0){const s=S.settling;return Math.abs(z)>s.W/2||y>s.H}
  if(x<=S.nozzle.x1){const a=d.nozzleAt(x);if(x<S.plenum.x0)return Math.abs(z)>a.hw||y>a.h;return thin(a,y,z,t)}
  if(x>=S.collector.x0&&x<S.plenum.x1)return thin(d.collectorAt(x),y,z,t);
  if(x>=S.plenum.x1){const a=d.collectorAt(S.collector.throatX);return Math.abs(z)>a.hw||y>a.h}
  return false};
 d.plenumFrontX=S.plenum.x0;
 d.domainSize=[S.domain.x1-S.domain.x0,S.domain.y1-S.domain.y0,2*S.domain.zh];
 d.domainVolume=d.domainSize[0]*d.domainSize[1]*d.domainSize[2];
 d.smoothstep=ss;
 return Object.freeze({...S,derived:Object.freeze(d)});
})();
/* profile switch: the v2 tunnel is the default; #tunnel=legacy brings back the old 18 x 8 x 5.5 m room (kept for A/B comparison and the validation suites) */
const TUNNEL_V2_ON=typeof location==="undefined"||!/tunnel=legacy/.test(location.hash);
