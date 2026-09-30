/* ===== M3/M4: staggered MAC solver (default when it initialises; the collocated solver in 85-live-cfd.js is the fallback).
   - velocity: faces. vel.x = u on the -x face of cell (i,j,k), vel.y = v on the -y face, vel.z = w on the -z face.
     The +x outlet face is not stored (zero-gradient predictor + Dirichlet p=0 ghost), +y/+z faces are walls.
   - partial-volume solids: cell solid fraction phi (static car/fan supersampled 2x2x2, analytic moving body),
     face open fraction theta = 1-(phi_a+phi_b)/2. Cut-cell divergence and theta-weighted Laplacian (compatible
     operators: after an exact solve the discrete divergence is exactly zero).
   - advection: MacCormack with min/max limiter (RK2 backtrace). LES: Smagorinsky eddy viscosity, explicit.
   - pressure: kinematic p (P/rho). Solvers: GMG (weighted Jacobi smoother), RBGS-MG, MGPCG. Chosen by measurement.
   - smoke: passive scalar on a grid 2x finer than velocity in every axis. ===== */
const MAC={forceModel:'discrete-v2',ibm:'vf',les:true,Cs:.16,nuMol:1.5e-5,eps:0,solver:'RBGS',pcgSmoother:'RB',levels:6,pre:2,post:2,coarse:0,omega:.8,sor:1.15,corr:1,prol:0,pcgIters:4,cycles:2,jacobiIters:32,tol:1e-3,
 lastSolve:null,stats:{},domain:null};
window.__MAC=MAC;
const MAC_H=`#version 300 es
precision highp float;precision highp int;precision highp sampler2D;
uniform ivec3 uN,uN2;uniform int uTX,uTX2;uniform vec3 uH,uH2,uMin;uniform float uU;
layout(location=0) out vec4 o;
ivec2 AT(ivec3 c,ivec3 n,int tx){return ivec2((c.z%tx)*n.x+c.x,(c.z/tx)*n.y+c.y);}
ivec2 A(ivec3 c){return AT(c,uN,uTX);}
ivec3 C(){ivec2 f=ivec2(gl_FragCoord.xy);int tx=f.x/uN.x,ty=f.y/uN.y;return ivec3(f.x-tx*uN.x,f.y-ty*uN.y,ty*uTX+tx);}
bool IN(ivec3 c){return all(greaterThanEqual(c,ivec3(0)))&&all(lessThan(c,uN));}
vec4 F(sampler2D s,ivec3 c){return texelFetch(s,A(clamp(c,ivec3(0),uN-1)),0);}
vec4 FT(sampler2D s,ivec3 c,ivec3 n,int tx){return texelFetch(s,AT(clamp(c,ivec3(0),n-1),n,tx),0);}
vec4 TRI(sampler2D s,vec3 q,ivec3 n,int tx){q=clamp(q,vec3(0.),vec3(n-1));ivec3 i=min(ivec3(floor(q)),n-1);vec3 f=q-vec3(i);ivec3 j=min(i+1,n-1);
 vec4 a=mix(FT(s,i,n,tx),FT(s,ivec3(j.x,i.y,i.z),n,tx),f.x),b=mix(FT(s,ivec3(i.x,j.y,i.z),n,tx),FT(s,ivec3(j.x,j.y,i.z),n,tx),f.x),
 c=mix(FT(s,ivec3(i.x,i.y,j.z),n,tx),FT(s,ivec3(j.x,i.y,j.z),n,tx),f.x),d=mix(FT(s,ivec3(i.x,j.y,j.z),n,tx),FT(s,j,n,tx),f.x);return mix(mix(a,b,f.y),mix(c,d,f.y),f.z);}
/* MAC velocity at a point P given in corner-origin index units of grid (n,tx) */
vec3 VEL(sampler2D s,vec3 P,ivec3 n,int tx){return vec3(TRI(s,P-vec3(0.,.5,.5),n,tx).x,TRI(s,P-vec3(.5,0.,.5),n,tx).y,TRI(s,P-vec3(.5,.5,0.),n,tx).z);}
/* sol texture: xyz solid velocity, w = id*2+phi (id 0 fluid,1 car,2 fan,3 body) */
float PHI(vec4 s){return s.w-2.*floor(s.w*.5+.001);}
float SID(vec4 s){return floor(s.w*.5+.001);}
/* trilinear solid fraction (the encoded w = id*2+phi cannot be filtered directly); id = id of the most solid tap */
float PHIT(sampler2D s,vec3 q,ivec3 n,int tx,out float id){q=clamp(q,vec3(0.),vec3(n-1));ivec3 i=min(ivec3(floor(q)),n-1);vec3 f=q-vec3(i);float r=0.,pm=0.;id=0.;
 for(int k=0;k<8;k++){ivec3 d=ivec3(k&1,(k>>1)&1,(k>>2)&1);vec4 v=FT(s,min(i+d,n-1),n,tx);float p=PHI(v),w=(d.x==1?f.x:1.-f.x)*(d.y==1?f.y:1.-f.y)*(d.z==1?f.z:1.-f.z);r+=w*p;if(p>pm){pm=p;id=SID(v);}}
 return r;}
`;
/* pressure operator helpers: level geometry texture uG (x,y,z = open fraction of the -x,-y,-z face, w = phi) */
const MAC_P=`uniform sampler2D uG;
float TL(ivec3 c,int ax){if(c[ax]==0)return 0.;return F(uG,c)[ax];}
float TR(ivec3 c,int ax){ivec3 e=ivec3(0);e[ax]=1;if(c[ax]==uN[ax]-1)return ax==0?1.-F(uG,c).w:0.;return F(uG,c+e)[ax];}
float LAP(sampler2D P,ivec3 c,out float dg){vec3 ih=1./(uH*uH);float pc=F(P,c).x,s=0.;dg=0.;
 for(int ax=0;ax<3;ax++){ivec3 e=ivec3(0);e[ax]=1;float tl=TL(c,ax),tr=TR(c,ax);
  float pr=(c[ax]==uN[ax]-1)?0.:F(P,c+e).x;s+=ih[ax]*(tl*(F(P,c-e).x-pc)+tr*(pr-pc));dg+=ih[ax]*(tl+tr);}
 return s;}
float NB(sampler2D P,ivec3 c,out float dg){vec3 ih=1./(uH*uH);float s=0.;dg=0.;
 for(int ax=0;ax<3;ax++){ivec3 e=ivec3(0);e[ax]=1;float tl=TL(c,ax),tr=TR(c,ax);float pr=(c[ax]==uN[ax]-1)?0.:F(P,c+e).x;s+=ih[ax]*(tl*F(P,c-e).x+tr*pr);dg+=ih[ax]*(tl+tr);}
 return s;}
`;
const MAC_FS={
/* ---- solids: static phi/id (uStatic RGBA8) + analytic moving body + rotating wheels ---- */
solid:`uniform sampler2D uStatic;uniform vec4 uBody;uniform vec3 uBodyV;uniform vec4 uWh[4];uniform float uWhW,uOm;
float bodyR(float y){return (y<0.||y>1.78)?0.:(y<.85?.17:(y<1.5?.25:.12));}
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}vec4 st=F(uStatic,c);float ps=st.r;float id=ps>0.?floor(st.g*255./50.+.5):0.;vec3 us=vec3(0.);
 vec3 w=uMin+(vec3(c)+.5)*uH;
 if(uBody.w>.5){float yr=w.y-uBody.z,r=bodyR(yr);if(r>0.){r=max(r,.5*uH.x);float d=length(w.xz-uBody.xy),pb=clamp(.5-(d-r)/uH.x,0.,1.);if(pb>ps){ps=pb;id=3.;}}}
 if(id==2.)us=vec3(uU,0.,0.);else if(id==3.)us=uBodyV;
 else if(id==1.){for(int k=0;k<4;k++){vec3 d=w-uWh[k].xyz;if(abs(d.z)<uWhW+uH.z&&length(d.xy)<uWh[k].w+uH.x)us=vec3(-uOm*d.y,uOm*d.x,0.);}}
 o=vec4(us,id*2.+min(ps,.999));}`,
geom:`uniform sampler2D uSol;
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}float pc=PHI(F(uSol,c));vec3 t;
 for(int ax=0;ax<3;ax++){ivec3 e=ivec3(0);e[ax]=1;float pn=c[ax]==0?(ax==0?0.:1.):PHI(F(uSol,c-e));float th=1.-.5*(pc+pn);t[ax]=th<.02?0.:th;}
 if(c.y==0)t.y=0.;if(c.z==0)t.z=0.;o=vec4(t,pc);}`,
/* coarse geometry: face fractions averaged over the fine faces of the coarse face, phi averaged over existing children.
   uR = coarsening ratio per axis (1 or 2): semi-coarsening keeps thin axes (e.g. a 4-cell quasi-2D span) unchanged */
cgeom:`uniform sampler2D uGF;uniform ivec3 uNF,uR;uniform int uTXF;
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}vec3 t=vec3(0.),n=vec3(0.);float ph=0.,m=0.;
 for(int k=0;k<8;k++){ivec3 d=ivec3(k&1,(k>>1)&1,(k>>2)&1);if(any(greaterThanEqual(d,uR)))continue;ivec3 f=c*uR+d;if(any(greaterThanEqual(f,uNF)))continue;vec4 g=FT(uGF,f,uNF,uTXF);ph+=g.w;m+=1.;
  if(d.x==0){t.x+=(f.x==0?0.:g.x);n.x+=1.;}if(d.y==0){t.y+=g.y;n.y+=1.;}if(d.z==0){t.z+=g.z;n.z+=1.;}}
 t=t/max(vec3(float(uR.y*uR.z),float(uR.x*uR.z),float(uR.x*uR.y)),n);o=vec4(t,m>0.?ph/m:1.);}`,
/* ---- advection (MacCormack pieces). uSrc = field to transport, uVel = transporting velocity (same grid) ---- */
adv:`uniform sampler2D uVel,uSrc;uniform float uDt;
vec3 back(vec3 P){vec3 v1=VEL(uVel,P,uN,uTX);vec3 Pm=P-.5*uDt*v1/uH;vec3 v2=VEL(uVel,Pm,uN,uTX);return clamp(P-uDt*v2/uH,vec3(0.),vec3(uN));}
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}vec3 b=vec3(c);
 vec3 Px=back(b+vec3(0.,.5,.5)),Py=back(b+vec3(.5,0.,.5)),Pz=back(b+vec3(.5,.5,0.));
 o=vec4(TRI(uSrc,Px-vec3(0.,.5,.5),uN,uTX).x,TRI(uSrc,Py-vec3(.5,0.,.5),uN,uTX).y,TRI(uSrc,Pz-vec3(.5,.5,0.),uN,uTX).z,0.);}`,
advc:`uniform sampler2D uVel,uHat,uBar,uSol,uG;uniform float uDt,uBelt;
vec3 back(vec3 P){vec3 v1=VEL(uVel,P,uN,uTX);vec3 Pm=P-.5*uDt*v1/uH;vec3 v2=VEL(uVel,Pm,uN,uTX);return clamp(P-uDt*v2/uH,vec3(0.),vec3(uN));}
vec2 mm(vec3 q,int ch){q=clamp(q,vec3(0.),vec3(uN-1));ivec3 i=min(ivec3(floor(q)),uN-1);float lo=1e9,hi=-1e9;for(int k=0;k<8;k++){float v=F(uVel,i+ivec3(k&1,(k>>1)&1,(k>>2)&1))[ch];lo=min(lo,v);hi=max(hi,v);}return vec2(lo,hi);}
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}vec3 b=vec3(c);
 vec3 u=F(uHat,c).xyz+.5*(F(uVel,c).xyz-F(uBar,c).xyz);
 vec2 rx=mm(back(b+vec3(0.,.5,.5))-vec3(0.,.5,.5),0),ry=mm(back(b+vec3(.5,0.,.5))-vec3(.5,0.,.5),1),rz=mm(back(b+vec3(.5,.5,0.))-vec3(.5,.5,0.),2);
 u=clamp(u,vec3(rx.x,ry.x,rz.x),vec3(rx.y,ry.y,rz.y));
 float lim=3.5*max(uU,.5);u=clamp(u,vec3(-lim),vec3(lim));o=vec4(u,0.);}`,
/* ---- eddy viscosity (Smagorinsky) at cell centres ---- */
sgs:`uniform sampler2D uVel,uSol;uniform float uCs,uNuMax;
vec3 CC(ivec3 c){c=clamp(c,ivec3(0),uN-1);vec3 a=F(uVel,c).xyz;vec3 b=vec3(c.x==uN.x-1?a.x:F(uVel,c+ivec3(1,0,0)).x,c.y==uN.y-1?0.:F(uVel,c+ivec3(0,1,0)).y,c.z==uN.z-1?0.:F(uVel,c+ivec3(0,0,1)).z);return .5*(a+b);}
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}if(PHI(F(uSol,c))>.5){o=vec4(0);return;}
 vec3 a=F(uVel,c).xyz,b=vec3(c.x==uN.x-1?a.x:F(uVel,c+ivec3(1,0,0)).x,c.y==uN.y-1?0.:F(uVel,c+ivec3(0,1,0)).y,c.z==uN.z-1?0.:F(uVel,c+ivec3(0,0,1)).z);
 vec3 dd=(b-a)/uH;vec3 gx=(CC(c+ivec3(1,0,0))-CC(c-ivec3(1,0,0)))/(2.*uH.x),gy=(CC(c+ivec3(0,1,0))-CC(c-ivec3(0,1,0)))/(2.*uH.y),gz=(CC(c+ivec3(0,0,1))-CC(c-ivec3(0,0,1)))/(2.*uH.z);
 float sxy=.5*(gy.x+gx.y),sxz=.5*(gz.x+gx.z),syz=.5*(gz.y+gy.z);float S2=2.*(dd.x*dd.x+dd.y*dd.y+dd.z*dd.z)+4.*(sxy*sxy+sxz*sxz+syz*syz);
 float D=pow(uH.x*uH.y*uH.z,1./3.);o=vec4(min(uCs*uCs*D*D*sqrt(S2),uNuMax),length(vec3(gy.z-gz.y,gz.x-gx.z,gx.y-gy.x)),0.,0.);}`,
/* ---- viscous + SGS diffusion, optional vorticity confinement, boundary/solid face velocities ---- */
diff:`uniform sampler2D uVel,uNu,uSol,uG;uniform float uDt,uNuMol,uEps,uBelt;uniform vec4 uBeltBox;
float ghostBelow(ivec3 c,float u0,int comp){vec3 w=uMin+(vec3(c)+.5)*uH;bool belt=uBelt>.5&&comp==0&&abs(w.x-uBeltBox.x)<uBeltBox.y&&abs(w.z-uBeltBox.z)<uBeltBox.w;return belt?2.*uU-u0:u0;}
vec3 us(ivec3 c,int ax){ivec3 e=ivec3(0);e[ax]=1;vec4 a=F(uSol,c),b=c[ax]==0?vec4(0.):F(uSol,c-e);float pa=PHI(a),pb=c[ax]==0?0.:PHI(b);return (pa*a.xyz+pb*b.xyz)/max(pa+pb,1e-6);}
vec3 vcf(ivec3 c){if(uEps<=0.)return vec3(0.);c=clamp(c,ivec3(0),uN-1);vec3 g=vec3(F(uNu,c+ivec3(1,0,0)).y-F(uNu,c-ivec3(1,0,0)).y,F(uNu,c+ivec3(0,1,0)).y-F(uNu,c-ivec3(0,1,0)).y,F(uNu,c+ivec3(0,0,1)).y-F(uNu,c-ivec3(0,0,1)).y);
 float l=length(g);if(l<1e-6)return vec3(0.);
 vec3 a=F(uVel,c).xyz;vec3 w;{ivec3 cc=c;vec3 up=F(uVel,cc+ivec3(0,1,0)).xyz,dn=F(uVel,cc-ivec3(0,1,0)).xyz,fp=F(uVel,cc+ivec3(0,0,1)).xyz,bk=F(uVel,cc-ivec3(0,0,1)).xyz,rt=F(uVel,cc+ivec3(1,0,0)).xyz,lf=F(uVel,cc-ivec3(1,0,0)).xyz;
 w=vec3((up.z-dn.z)/(2.*uH.y)-(fp.y-bk.y)/(2.*uH.z),(fp.x-bk.x)/(2.*uH.z)-(rt.z-lf.z)/(2.*uH.x),(rt.y-lf.y)/(2.*uH.x)-(up.x-dn.x)/(2.*uH.y));}
 return uEps*uH.x*cross(g/l,w);}
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}vec3 u=F(uVel,c).xyz;vec4 g=F(uG,c);vec3 un=u;vec3 ih=1./(uH*uH);
 for(int ax=0;ax<3;ax++){ivec3 e=ivec3(0);e[ax]=1;
  float nu=uNuMol+.5*(F(uNu,c).x+F(uNu,c-e).x);float lap=0.;
  for(int d=0;d<3;d++){ivec3 f=ivec3(0);f[d]=1;float up=c[d]==uN[d]-1?u[ax]:F(uVel,c+f)[ax];float dn;
   if(c[d]==0){dn=(d==1)?ghostBelow(c,u[ax],ax):(d==0?(ax==0?uU:u[ax]):u[ax]);}else dn=F(uVel,c-f)[ax];
   lap+=ih[d]*(up-2.*u[ax]+dn);}
  vec3 f2=.5*(vcf(c)+vcf(c-e));un[ax]=u[ax]+uDt*(nu*lap+f2[ax]);}
 /* boundary and solid faces */
 for(int ax=0;ax<3;ax++){if(g[ax]<=0.)un[ax]=us(c,ax)[ax];}
 if(c.x==0&&g.x>0.)un.x=uU;if(c.y==0)un.y=0.;if(c.z==0)un.z=0.;
 o=vec4(un,0.);}`,
/* ---- optional volume-fraction forcing (Kajishima et al. 2001): on partially solid faces u <- (1-chi) u + chi us,
   chi = 1-theta = face solid fraction. Makes tangential velocity feel the true surface instead of the fully solid staircase. ---- */
ibm:`uniform sampler2D uVel,uSol,uG;
vec3 us(ivec3 c,int ax){ivec3 e=ivec3(0);e[ax]=1;vec4 a=F(uSol,c),b=c[ax]==0?vec4(0.):F(uSol,c-e);float pa=PHI(a),pb=c[ax]==0?0.:PHI(b);return (pa*a.xyz+pb*b.xyz)/max(pa+pb,1e-6);}
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}vec3 u=F(uVel,c).xyz;vec4 g=F(uG,c);
 for(int ax=0;ax<3;ax++){if(g[ax]>0.&&g[ax]<1.)u[ax]=mix(u[ax],us(c,ax)[ax],1.-g[ax]);}o=vec4(u,0.);}`,
/* ---- cut-cell divergence of the predicted velocity (/dt for the Poisson right-hand side) ---- */
div:`uniform sampler2D uVel,uSol,uG;uniform float uScale,uPost;
vec3 us(ivec3 c,int ax){ivec3 e=ivec3(0);e[ax]=1;vec4 a=F(uSol,c),b=c[ax]==0?vec4(0.):F(uSol,c-e);float pa=PHI(a),pb=c[ax]==0?0.:PHI(b);return (pa*a.xyz+pb*b.xyz)/max(pa+pb,1e-6);}
float flux(ivec3 c,int ax){float th=F(uG,c)[ax];return th*F(uVel,c)[ax]+(1.-th)*us(c,ax)[ax];}
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}vec4 g=F(uG,c);float dg=0.;
 for(int ax=0;ax<3;ax++){ivec3 e=ivec3(0);e[ax]=1;dg+=g[ax]+(c[ax]==uN[ax]-1?(ax==0?1.-g.w:0.):F(uG,c+e)[ax]);}
 if(dg<1e-5){o=vec4(0);return;}
 float d=0.;for(int ax=0;ax<3;ax++){ivec3 e=ivec3(0);e[ax]=1;float fl=flux(c,ax);
  /* outlet (+x of the last column): predictor = zero-gradient; after projection the Dirichlet-ghost flux stored in .w by proj */
  float fr=c[ax]==uN[ax]-1?(ax==0?(uPost>.5?F(uVel,c).w:fl):0.):flux(c+e,ax);d+=(fr-fl)/uH[ax];}
 o=vec4(d*uScale,0,0,0);}`,
/* ---- pressure kernels (level-generic) ---- */
pjac:MAC_P+`uniform sampler2D uP,uB;uniform float uOm;
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}float dg;float s=NB(uP,c,dg);if(dg<1e-6){o=vec4(0);return;}float pc=F(uP,c).x;o=vec4(pc+uOm*((s-F(uB,c).x)/dg-pc),0,0,0);}`,
prb:MAC_P+`uniform sampler2D uP,uB;uniform int uColor;uniform float uOm;
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}float pc=F(uP,c).x;if(((c.x+c.y+c.z)&1)!=uColor){o=vec4(pc,0,0,0);return;}float dg;float s=NB(uP,c,dg);if(dg<1e-6){o=vec4(0);return;}o=vec4(pc+uOm*((s-F(uB,c).x)/dg-pc),0,0,0);}`,
pres:MAC_P+`uniform sampler2D uP,uB;
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}float dg;float l=LAP(uP,c,dg);o=vec4(dg<1e-6?0.:F(uB,c).x-l,0,0,0);}`,
papply:MAC_P+`uniform sampler2D uP;
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}float dg;float l=LAP(uP,c,dg);o=vec4(dg<1e-6?0.:l,0,0,0);}`,
prest:`uniform sampler2D uRF;uniform ivec3 uNF,uR;uniform int uTXF;
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}float s=0.,m=0.;for(int k=0;k<8;k++){ivec3 d=ivec3(k&1,(k>>1)&1,(k>>2)&1);if(any(greaterThanEqual(d,uR)))continue;ivec3 f=c*uR+d;if(any(greaterThanEqual(f,uNF)))continue;s+=FT(uRF,f,uNF,uTXF).x;m+=1.;}o=vec4(m>0.?s/m:0.,0,0,0);}`,
pprol:MAC_P+`uniform sampler2D uP,uPC,uGC;uniform ivec3 uNC,uR;uniform int uTXC;uniform float uCorr,uTri;
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}float dg;NB(uP,c,dg);float pc=F(uP,c).x;if(dg<1e-6){o=vec4(0);return;}float e;
 if(uTri<.5)e=FT(uPC,c/uR,uNC,uTXC).x;
 else{vec3 q=(vec3(c)+.5)/vec3(uR)-.5;ivec3 i0=ivec3(floor(q));vec3 f=q-vec3(i0);float acc=0.,wt=0.;
  for(int k=0;k<8;k++){ivec3 d=ivec3(k&1,(k>>1)&1,(k>>2)&1),j=clamp(i0+d,ivec3(0),uNC-1);float w=(d.x==1?f.x:1.-f.x)*(d.y==1?f.y:1.-f.y)*(d.z==1?f.z:1.-f.z);
   vec4 gc=FT(uGC,j,uNC,uTXC);if(gc.x+gc.y+gc.z<1e-6&&gc.w>.99)continue;acc+=w*FT(uPC,j,uNC,uTXC).x;wt+=w;}e=wt>1e-4?acc/wt:0.;}
 o=vec4(pc+uCorr*e,0,0,0);}`,
pdot:`uniform sampler2D uX,uY;
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}float a=F(uX,c).x,b=F(uY,c).x;o=vec4(a*b,a*a,b*b,0.);}`,
/* 1x1 scalar state: x=rz, y=alpha, z=beta, w=bb.  uMode 0 init (rz,bb), 1 alpha, 2 beta */
pscal:`uniform sampler2D uS,uD;uniform int uMode;uniform float uTol2;
/* state x=rz y=alpha z=beta w=bb ; uD = dot sums (x=a.b, y=a.a, z=b.b). modes: 0 set rz, 3 set bb, 1 alpha, 2 beta+convergence */
void main(){vec4 s=texelFetch(uS,ivec2(0),0),d=texelFetch(uD,ivec2(0),0);
 if(uMode==0){o=vec4(d.x,0.,0.,s.w);return;}
 if(uMode==3){o=vec4(s.xyz,d.x);return;}
 if(uMode==1){o=vec4(s.x,abs(d.x)>1e-30?s.x/d.x:0.,s.z,s.w);return;}
 if(d.y<=uTol2*s.w){o=vec4(0.,0.,0.,s.w);return;}
 o=vec4(d.x,s.y,abs(s.x)>1e-30?d.x/s.x:0.,s.w);}`,
paxpy:`uniform sampler2D uX,uY,uS;uniform int uSel;uniform float uSign;
/* sel 0: copy X ; sel 1: X + sign*alpha*Y ; sel 2: Y + beta*X */
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}vec4 s=texelFetch(uS,ivec2(0),0);float x=F(uX,c).x;
 o=vec4(uSel==0?x:(uSel==1?x+uSign*s.y*F(uY,c).x:F(uY,c).x+s.z*x),0,0,0);}`,
/* ---- projection ---- */
proj:`uniform sampler2D uVel,uP,uSol,uG;uniform float uDt;
vec3 us(ivec3 c,int ax){ivec3 e=ivec3(0);e[ax]=1;vec4 a=F(uSol,c),b=c[ax]==0?vec4(0.):F(uSol,c-e);float pa=PHI(a),pb=c[ax]==0?0.:PHI(b);return (pa*a.xyz+pb*b.xyz)/max(pa+pb,1e-6);}
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}vec3 u=F(uVel,c).xyz;vec4 g=F(uG,c);float pc=F(uP,c).x;
 /* outlet face flux of the last column: zero-gradient predictor + gradient to the p=0 ghost (the flux the Poisson operator assumes) */
 float fo=0.;if(c.x==uN.x-1){float th=g.x;fo=th*u.x+(1.-th)*us(c,0).x+uDt*(1.-g.w)*pc/uH.x;}
 for(int ax=0;ax<3;ax++){ivec3 e=ivec3(0);e[ax]=1;if(g[ax]>0.&&c[ax]>0)u[ax]-=uDt*(pc-F(uP,c-e).x)/uH[ax];else if(g[ax]<=0.)u[ax]=us(c,ax)[ax];}
 if(c.x==0&&g.x>0.)u.x=uU;if(c.y==0)u.y=0.;if(c.z==0)u.z=0.;o=vec4(u,fo);}`,
/* ---- forces on car (id 1) or validation obstacle ----
   pressure: jump of p across the phi ramps (surface integral of p n).
   viscous: exactly the momentum the diffusion pass exchanges with solid faces of this body. For every open face
   (component t) whose stencil neighbour in direction d is a solid face (theta=0) of body uId, the discrete
   Laplacian applies rho*nu*(us-u)*V/h_d^2 to the fluid; the body receives the opposite. This is consistent with
   the scheme (no assumed wall distance). */
force:`uniform sampler2D uVel,uP,uSol,uNu,uG,uStar;uniform float uRho,uNuMol,uId,uBudget,uVf,uDt;
vec3 us(ivec3 c,int ax){ivec3 e=ivec3(0);e[ax]=1;vec4 a=F(uSol,c),b=c[ax]==0?vec4(0.):F(uSol,c-e);float pa=PHI(a),pb=c[ax]==0?0.:PHI(b);return (pa*a.xyz+pb*b.xyz)/max(pa+pb,1e-6);}
bool isBody(ivec3 c,int t){ivec3 e=ivec3(0);e[t]=1;return SID(F(uSol,c))==uId||SID(F(uSol,c-e))==uId;}
bool bodyFace(ivec3 n,int t){if(!IN(n)||n[t]==0)return false;if(F(uG,n)[t]>0.)return false;return isBody(n,t);}
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}vec4 sc=F(uSol,c);vec3 Fo=vec3(0.);float Fpx=0.;vec3 A=vec3(uH.y*uH.z,uH.x*uH.z,uH.x*uH.y);
 vec4 g=F(uG,c);vec3 u=F(uVel,c).xyz;float V=uH.x*uH.y*uH.z;
 if(uBudget<.5){
  /* surface: jump of p across the phi ramps */
  for(int ax=0;ax<3;ax++){ivec3 e=ivec3(0);e[ax]=1;if(c[ax]==0)continue;vec4 sn=F(uSol,c-e);float pa=PHI(sc),pb=PHI(sn);
   if(!(SID(sc)==uId||SID(sn)==uId))continue;float dphi=pa-pb;if(abs(dphi)<1e-4)continue;
   ivec3 fc=pa<pb?c:c-e;float fp=uRho*F(uP,fc).x*dphi*A[ax];Fo[ax]+=fp;if(ax==0)Fpx+=fp;}
 }else{
  /* momentum budget: pressure on closed body faces (the part of grad p the projection never applies) + forcing of the ibm pass */
  for(int ax=0;ax<3;ax++){ivec3 e=ivec3(0);e[ax]=1;if(c[ax]==0||!isBody(c,ax))continue;
   if(g[ax]<=0.){float fp=uRho*(F(uP,c-e).x-F(uP,c).x)*A[ax];Fo[ax]+=fp;if(ax==0)Fpx+=fp;}
   else if(uVf>.5&&g[ax]<1.)Fo[ax]+=uRho*(1.-g[ax])*(F(uStar,c)[ax]-us(c,ax)[ax])*V/uDt;}
 }
 /* viscous: momentum the diffusion pass exchanges with closed faces of this body (rho nu (u-us) V/h_d^2 per stencil link) */
 for(int t=0;t<3;t++){if(g[t]<=0.||c[t]==0)continue;ivec3 et=ivec3(0);et[t]=1;float nu=uNuMol+.5*(F(uNu,c).x+F(uNu,c-et).x);
  for(int d=0;d<3;d++){ivec3 ed=ivec3(0);ed[d]=1;
   for(int s=-1;s<=1;s+=2){ivec3 n=c+s*ed;if(bodyFace(n,t))Fo[t]+=uRho*nu*(u[t]-us(n,t)[t])*V/(uH[d]*uH[d]);}}}
 o=vec4(Fo,Fpx);}`,
/* ---- smoke on the 2x grid (primary grid = dye grid, secondary grid 2 = velocity grid) ---- */
dadv:`uniform sampler2D uVel,uSrc;uniform float uDt;
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}vec3 w=uMin+(vec3(c)+.5)*uH;vec3 P=(w-uMin)/uH2;vec3 v=VEL(uVel,P,uN2,uTX2);
 vec3 Pm=P-.5*uDt*v/uH2;v=VEL(uVel,Pm,uN2,uTX2);vec3 q=(w-uDt*v-uMin)/uH-.5;o=vec4(TRI(uSrc,q,uN,uTX).x,0,0,0);}`,
dcorr:`uniform sampler2D uVel,uSrc,uHat,uBar,uSol;uniform float uDt,uDecay,uEmS;uniform vec4 uEm[16];uniform int uEmN;
void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}vec3 w=uMin+(vec3(c)+.5)*uH;vec3 P=(w-uMin)/uH2;
 float sid;if(PHIT(uSol,P-.5,uN2,uTX2,sid)>.5||c.x==0){o=vec4(0);return;}
 vec3 v=VEL(uVel,P,uN2,uTX2);vec3 Pm=P-.5*uDt*v/uH2;v=VEL(uVel,Pm,uN2,uTX2);vec3 q=clamp((w-uDt*v-uMin)/uH-.5,vec3(0.),vec3(uN-1));ivec3 i=min(ivec3(floor(q)),uN-1);
 float lo=1e9,hi=-1e9;for(int k=0;k<8;k++){float s=F(uSrc,i+ivec3(k&1,(k>>1)&1,(k>>2)&1)).x;lo=min(lo,s);hi=max(hi,s);}
 float r=clamp(F(uHat,c).x+.5*(F(uSrc,c).x-F(uBar,c).x),lo,hi)*uDecay;
 for(int e=0;e<16;e++){if(e>=uEmN)break;vec3 d=w-uEm[e].xyz;float rr=uEm[e].w;r=max(r,uEmS*exp(-dot(d,d)/(rr*rr)));}
 o=vec4(max(r,0.),0,0,0);}`,
/* volume texture for rendering (dye resolution): r dye, g solid (1 car/.6 fan), b speed/U */
vcopy:`uniform sampler2D uVel,uDye,uSol;uniform int uLayer;layout(location=1) out vec4 o1;layout(location=2) out vec4 o2;layout(location=3) out vec4 o3;
vec4 lay(int k){if(k>=uN.z)return vec4(0.);ivec3 c=ivec3(ivec2(gl_FragCoord.xy),k);vec3 w=uMin+(vec3(c)+.5)*uH;vec3 P=(w-uMin)/uH2;float id,ph=PHIT(uSol,P-.5,uN2,uTX2,id);
 float g=(ph>.5&&id==1.)?1.:((ph>.5&&id==2.)?.6:0.);return vec4(g>0.?0.:F(uDye,c).x,g,length(VEL(uVel,P,uN2,uTX2))/max(uU,.1),1.);}
void main(){o=lay(uLayer);o1=lay(uLayer+1);o2=lay(uLayer+2);o3=lay(uLayer+3);}`,
init:`void main(){ivec3 c=C();if(c.z>=uN.z){o=vec4(0);return;}o=vec4(uU,0.,0.,0.);}`,
clear:`void main(){o=vec4(0.);}`};

/* ---------------- CPU side ---------------- */
function macAtlas(n){const maxTex=gl.getParameter(gl.MAX_TEXTURE_SIZE);let tx=Math.ceil(Math.sqrt(n[2]*n[1]/n[0]));tx=Math.max(1,Math.min(tx,Math.floor(maxTex/n[0])));const ty=Math.ceil(n[2]/tx);
 if(n[1]*ty>maxTex)throw Error('MAC atlas exceeds MAX_TEXTURE_SIZE '+maxTex);return {N:n.slice(),tx,W:n[0]*tx,H:n[1]*ty}}
function macTarget(g,ifmt,fmt,type){return liveTarget(g.W,g.H,ifmt,fmt,type)}
/* static solids, partial volume: car supersampled 2x2x2 (shell + flood fill at 2N), fan box phi=1, validation shapes analytic 4x4x4 */
function macStaticSolids(N,min,h,cfg){const [nx,ny,nz]=N,tot=nx*ny*nz,phi=new Float32Array(tot),id=new Uint8Array(tot),t0=performance.now();
 if(cfg.car){const S=2,M=[nx*S,ny*S,nz*S],hs=h.map(v=>v/S),v=liveVoxelizeShell(M,min,hs);
  for(let k=0;k<M[2];k++)for(let j=0;j<M[1];j++)for(let i=0;i<M[0];i++)if(v[i+M[0]*(j+M[1]*k)]){const q=(i>>1)+nx*((j>>1)+ny*(k>>1));phi[q]+=1/8;id[q]=1}}
 if(cfg.obstacle){const O=cfg.obstacle,S=4;for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){let n=0;
  for(let a=0;a<S;a++)for(let b=0;b<S;b++)for(let c=0;c<S;c++){const x=min[0]+(i+(a+.5)/S)*h[0]-O.c[0],y=min[1]+(j+(b+.5)/S)*h[1]-O.c[1],z=min[2]+(k+(c+.5)/S)*h[2]-O.c[2];
   const r2=O.type==='sphere'?x*x+y*y+z*z:x*x+y*y;if(r2<=O.D*O.D/4)n++}
  if(n){const q=i+nx*(j+ny*k);phi[q]=n/(S*S*S);id[q]=1}}}
 const fb=cfg.fan;if(fb)for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){const x=min[0]+(i+.5)*h[0],y=min[1]+(j+.5)*h[1],z=min[2]+(k+.5)*h[2];
  if(x>=fb.min[0]&&x<=fb.max[0]&&y>=fb.min[1]&&y<=fb.max[1]&&z>=fb.min[2]&&z<=fb.max[2]){const q=i+nx*(j+ny*k);if(id[q]!==1){phi[q]=1;id[q]=2}}}
 let car=0,fan=0,front=0;for(let q=0;q<tot;q++){if(id[q]===1)car+=phi[q];if(id[q]===2)fan++}
 const col=new Float32Array(ny*nz);for(let k=0;k<nz;k++)for(let j=0;j<ny;j++){let m=0;for(let i=0;i<nx;i++){const q=i+nx*(j+ny*k);if(id[q]===1)m=Math.max(m,phi[q])}col[j+ny*k]=m}for(const m of col)front+=m;
 return {phi,id,carCells:car,fan,front:front*h[1]*h[2],ms:performance.now()-t0}}
/* shell rasterisation + exterior flood fill of the vehicle triangles at resolution M (returns solid mask) */
function liveVoxelizeShell(M,min,h){const [nx,ny,nz]=M,tot=nx*ny*nz,shell=new Uint8Array(tot),idx=(i,j,k)=>i+nx*(j+ny*k),hm=Math.min(...h)*.45;
 for(const part of m12SolidParts()){const Mx=part.modelMatrix,P=part.positions,I=part.indices,V=new Float32Array(P.length);
  for(let i=0;i<P.length;i+=3){const q=m4point(Mx,[P[i],P[i+1],P[i+2]]);V[i]=q[0];V[i+1]=q[1];V[i+2]=q[2]}
  for(let t=0;t<I.length;t+=3){const a=I[t]*3,b=I[t+1]*3,c=I[t+2]*3,ax=V[a],ay=V[a+1],az=V[a+2],ex=V[b]-ax,ey=V[b+1]-ay,ez=V[b+2]-az,fx=V[c]-ax,fy=V[c+1]-ay,fz=V[c+2]-az;
   const n=Math.max(1,Math.ceil(Math.max(Math.hypot(ex,ey,ez),Math.hypot(fx,fy,fz),Math.hypot(fx-ex,fy-ey,fz-ez))/hm));
   for(let u=0;u<=n;u++)for(let v=0;v<=n-u;v++){const s=u/n,r=v/n,i=Math.floor((ax+ex*s+fx*r-min[0])/h[0]),j=Math.floor((ay+ey*s+fy*r-min[1])/h[1]),k=Math.floor((az+ez*s+fz*r-min[2])/h[2]);
    if(i>=0&&j>=0&&k>=0&&i<nx&&j<ny&&k<nz)shell[idx(i,j,k)]=1}}}
 const ext=new Uint8Array(tot),st=new Int32Array(tot);let sp=0;const push=q=>{if(!shell[q]&&!ext[q]){ext[q]=1;st[sp++]=q}};
 for(let k=0;k<nz;k++)for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)if(i===0||j===0||k===0||i===nx-1||j===ny-1||k===nz-1)push(idx(i,j,k));
 while(sp){const q=st[--sp],i=q%nx,j=((q/nx)|0)%ny,k=(q/(nx*ny))|0;if(i>0)push(q-1);if(i<nx-1)push(q+1);if(j>0)push(q-nx);if(j<ny-1)push(q+nx);if(k>0)push(q-nx*ny);if(k<nz-1)push(q+nx*ny)}
 const out=new Uint8Array(tot);for(let q=0;q<tot;q++)out[q]=ext[q]?0:1;return out}
function macUploadStatic(G,vox){const N=G.N,buf=new Uint8Array(G.W*G.H*4);for(let k=0;k<N[2];k++)for(let j=0;j<N[1];j++)for(let i=0;i<N[0];i++){const q=i+N[0]*(j+N[1]*k);if(!vox.phi[q])continue;
  const ax=(k%G.tx)*N[0]+i,ay=Math.floor(k/G.tx)*N[1]+j,o=(ay*G.W+ax)*4;buf[o]=Math.round(Math.min(1,vox.phi[q])*255);buf[o+1]=vox.id[q]*50;buf[o+3]=255}
 if(!MAC.staticTex)MAC.staticTex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,MAC.staticTex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
 gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,G.W,G.H,0,gl.RGBA,gl.UNSIGNED_BYTE,buf)}
function macWheels(){try{const W=wheelParts(),out=[];for(let i=0;i<W.length;i++){const b=wheelWorldBoundsAt(0,i);out.push([(b.min[0]+b.max[0])/2,(b.min[1]+b.max[1])/2,(b.min[2]+b.max[2])/2,(b.max[1]-b.min[1])/2]);MAC.whW=(b.max[2]-b.min[2])/2}return out}catch(_){return []}}

/* domain config: tunnel (default) or validation {N,min,max,obstacle,U,nu} */
function macConfig(){const d=MAC.domain;if(d)return {...d,car:false,fan:null,belt:false,body:false};
 const b=CFD_DOMAIN_CONTRACT.bounds;return {min:Array.from(b.min),max:Array.from(b.max),N:LIVE.N,car:true,fan:AETHER.FAN_MODULE?.layout?.fanBounds||null,belt:true,body:true,nu:MAC.nuMol,U:null}}
function macInit(){const cfg=macConfig(),N=cfg.N,min=cfg.min,max=cfg.max,h=max.map((v,i)=>(v-min[i])/N[i]);
 if(!gl.getExtension('EXT_color_buffer_float'))throw Error('EXT_color_buffer_float 미지원');
 macRelease();MAC.cfg=cfg;MAC.N=N;MAC.min=min;MAC.max=max;MAC.h=h;
 const G=MAC.G=macAtlas(N),Nd=N.map(v=>v*2),D=MAC.D=macAtlas(Nd);MAC.hd=h.map(v=>v/2);
 const V=()=>macTarget(G,gl.RGBA32F,gl.RGBA,gl.FLOAT),R=()=>macTarget(G,gl.R32F,gl.RED,gl.FLOAT),R16=g=>macTarget(g,gl.R16F,gl.RED,gl.HALF_FLOAT),H4=g=>macTarget(g,gl.RGBA16F,gl.RGBA,gl.HALF_FLOAT);
 MAC.t={velA:V(),velB:V(),hat:V(),bar:V(),sol:H4(G),geom:H4(G),nu:macTarget(G,gl.RG32F,gl.RG,gl.FLOAT),b:R(),res:R(),frc:V(),dyeA:R16(D),dyeB:R16(D),dhat:R16(D),dbar:R16(D)};
 /* multigrid levels: level 0 uses MAC.t.geom/b; pressure vectors per level */
 MAC.lv=[];let n=N.slice(),r=[1,1,1];for(let l=0;l<MAC.levels;l++){if(l>0){
   /* semi-coarsening: halve an axis only if it has >= 4 cells and is not already coarser than the finest axis */
   const hc=max.map((v,i)=>(v-min[i])/n[i]),hm=Math.min(...hc.filter((_,i)=>n[i]>=4));r=n.map((v,i)=>v>=4&&hc[i]<=1.5*hm?2:1);if(r.every(x=>x===1))break;const m=n.map((v,i)=>Math.ceil(v/r[i]));/* levels below ~64 cells are numerically fragile (full-size sphere 4x2x2 diverged, 8x4x4 and 84-cell tunnel levels are fine) */if(m[0]*m[1]*m[2]<64)break;n=m}
  const g=macAtlas(n),hl=max.map((v,i)=>(v-min[i])/n[i]);const T={pA:macTarget(g,gl.R32F,gl.RED,gl.FLOAT),pB:macTarget(g,gl.R32F,gl.RED,gl.FLOAT),r:macTarget(g,gl.R32F,gl.RED,gl.FLOAT)};
  if(l>0){T.b=macTarget(g,gl.R32F,gl.RED,gl.FLOAT);T.geom=H4(g)}MAC.lv.push({...g,h:hl,T,r:r.slice()})}
 /* PCG vectors on level 0 */
 MAC.t.cgR=R();MAC.t.cgD=R();MAC.t.cgQ=R();MAC.t.cgS=R();MAC.Z={pA:R(),pB:R()};
 MAC.red=[];{let w=G.W,hh=G.H;while(w>1||hh>1){w=Math.ceil(w/8);hh=Math.ceil(hh/8);MAC.red.push({w,h:hh,t:liveTarget(w,hh,gl.RGBA32F,gl.RGBA,gl.FLOAT)})}}
 MAC.scal=[liveTarget(1,1,gl.RGBA32F,gl.RGBA,gl.FLOAT),liveTarget(1,1,gl.RGBA32F,gl.RGBA,gl.FLOAT)];
 /* volume texture at dye resolution */
 MAC.vol=gl.createTexture();gl.bindTexture(gl.TEXTURE_3D,MAC.vol);for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_NEAREST],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_R,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_3D,k,v);
 gl.texImage3D(gl.TEXTURE_3D,0,gl.RGBA16F,Nd[0],Nd[1],Nd[2],0,gl.RGBA,gl.HALF_FLOAT,null);MAC.volFbo=gl.createFramebuffer();
 if(MAC.progGen!==runtimeGeneration){MAC.prog={};for(const k in MAC_FS)MAC.prog[k]=k==='pscal'?liveCompile(`#version 300 es\nprecision highp float;precision highp sampler2D;\nout vec4 o;\n`+MAC_FS[k]):liveCompile(MAC_H+MAC_FS[k]);MAC.progGen=runtimeGeneration}
 const vox=MAC.vox=macStaticSolids(N,min,h,cfg);macUploadStatic(G,vox);MAC.wheels=cfg.car?macWheels():[];
 MAC.U=cfg.U??LIVE.U;MAC.step=0;MAC.t0=0;MAC.ok=true;macReset();return MAC}
function macRelease(){const del=t=>{if(t&&t.t){gl.deleteTexture(t.t);gl.deleteFramebuffer(t.f)}};if(MAC.t)for(const k in MAC.t)del(MAC.t[k]);if(MAC.Z){del(MAC.Z.pA);del(MAC.Z.pB)}for(const L of MAC.lv||[])for(const k in L.T)del(L.T[k]);(MAC.red||[]).forEach(r=>del(r.t));(MAC.scal||[]).forEach(del);
 if(MAC.vol)gl.deleteTexture(MAC.vol);if(MAC.volFbo)gl.deleteFramebuffer(MAC.volFbo);MAC.t=null;MAC.lv=null;MAC.red=null;MAC.scal=null;MAC.vol=null;MAC.ok=false}
/* one pass on grid g (primary). g2 = secondary grid (dye passes) */
/* Redundant-state elimination. Uniform values live in the program object, so the per-program caches (p._mg geometry block, p._uc floats,
   p._ui ints, p._us sampler units) are valid whenever only macPass sets these uniforms. Program / framebuffer / viewport / texture-unit
   caches are only valid while nothing else touches GL state, so they exist only inside macStep (MAC.cw, opened and closed there). */
function macPass(name,out,tex,uni,g,g2){const p=MAC.prog[name];g=g||MAC.G;g2=g2||g;const C=MAC.cw;
 if(!C||C.prog!==p){gl.useProgram(p);if(C)C.prog=p}
 if(!C||C.fb!==out.f){gl.bindFramebuffer(gl.FRAMEBUFFER,out.f);if(C)C.fb=out.f}
 const vw=out.w||g.W,vh=out.h||g.H;if(!C||C.vw!==vw||C.vh!==vh){gl.viewport(0,0,vw,vh);if(C){C.vw=vw;C.vh=vh}}
 const hh=g.h||MAC.h,h2=g2.h||MAC.h,G=p._mg||(p._mg={});
 if(G.gN!==g.N||G.gt!==g.tx||G.gh!==hh||G.g2N!==g2.N||G.g2t!==g2.tx||G.g2h!==h2||G.min!==MAC.min||G.U!==MAC.U){
  gl.uniform3i(liveU(p,'uN'),...g.N);gl.uniform1i(liveU(p,'uTX'),g.tx);gl.uniform3f(liveU(p,'uH'),...hh);gl.uniform3i(liveU(p,'uN2'),...g2.N);gl.uniform1i(liveU(p,'uTX2'),g2.tx);gl.uniform3f(liveU(p,'uH2'),...h2);
  gl.uniform3f(liveU(p,'uMin'),...MAC.min);gl.uniform1f(liveU(p,'uU'),MAC.U);G.gN=g.N;G.gt=g.tx;G.gh=hh;G.g2N=g2.N;G.g2t=g2.tx;G.g2h=h2;G.min=MAC.min;G.U=MAC.U}
 const uc=p._uc||(p._uc={}),ui=p._ui||(p._ui={}),us=p._us||(p._us={});let unit=8;
 for(const n in tex){const t=tex[n];if(!C||C.tb[unit]!==t){gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);if(C)C.tb[unit]=t}
  if(us[n]!==unit){gl.uniform1i(liveU(p,n),unit);us[n]=unit}unit++}
 for(const n in uni){const v=uni[n],l=liveU(p,n);if(l===null)continue;
  if(typeof v==='number'){if(uc[n]!==v){uc[n]=v;gl.uniform1f(l,v)}}
  else if(Array.isArray(v)){if(v.length===4)gl.uniform4f(l,...v);else if(v.length===3)gl.uniform3f(l,...v)}
  else if(v&&v.int!==undefined){if(ui[n]!==v.int){ui[n]=v.int;gl.uniform1i(l,v.int)}}
  else if(v&&v.i3)gl.uniform3i(l,...v.i3);else if(v instanceof Float32Array)gl.uniform4fv(l,v)}
 gl.drawArrays(gl.TRIANGLES,0,3)}
const macSwap=(o,a,b)=>{const x=o[a];o[a]=o[b];o[b]=x};
function macGridOf(l){const L=MAC.lv[l];return {N:L.N,tx:L.tx,W:L.W,H:L.H,h:L.h}}
function macReset(){gl.bindVertexArray(LIVE.vao);const T=MAC.t;for(const k in T)liveClear(T[k]);liveClear(MAC.Z.pA);liveClear(MAC.Z.pB);for(const s of MAC.scal)liveClear(s);for(const L of MAC.lv)for(const k in L.T)liveClear(L.T[k]);
 macSolids();macPass('init',T.velA,{},{});MAC.step=0;MAC.time=0;MAC.forceHist=[];gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null)}
function macSolids(){const T=MAC.t,B=window.__BODY,act=!!(MAC.cfg.body&&B&&B.active),W=MAC.wheels||[],wh=new Float32Array(16);W.forEach((w,i)=>wh.set(w,i*4));const R=W[0]?.[3]||.34;
 const om=MAC.cfg.obstacle?(MAC.time<(MAC.spinUntil||0)?MAC.spin||0:0):MAC.U/R;
 macPass('solid',T.sol,{uStatic:MAC.staticTex},{uBody:act?[B.x,B.z,B.g,1]:[0,0,0,0],uBodyV:act&&fpv.enabled?[fpv.vx||0,0,fpv.vz||0]:[0,0,0],uWh:wh,uWhW:MAC.cfg.obstacle?1e3:(MAC.whW||.15),uOm:om});
 macPass('geom',T.geom,{uSol:T.sol.t},{});
 for(let l=1;l<MAC.lv.length;l++){const F=l===1?{t:T.geom}:{t:MAC.lv[l-1].T.geom},Lf=MAC.lv[l-1];macPass('cgeom',MAC.lv[l].T.geom,{uGF:F.t.t},{uNF:{i3:Lf.N},uTXF:{int:Lf.tx},uR:{i3:MAC.lv[l].r}},macGridOf(l))}}
/* ---- pressure solvers. A level-0 "context" X={pA,pB} holds the iterate, b0 the right-hand side ---- */
function macLvX(l,X0){return l===0?X0:MAC.lv[l].T}
function macLvB(l,b0){return l===0?b0:MAC.lv[l].T.b.t}
function macSmooth(l,n,kind,order,X,b){const g=macGridOf(l),G=macGeomOf(l);
 for(let k=0;k<n;k++){if(kind==='RB'){for(const col of order){macPass('prb',X.pB,{uP:X.pA.t,uB:b,uG:G},{uColor:{int:col},uOm:MAC.sor},g);macSwap(X,'pA','pB')}}
  else{macPass('pjac',X.pB,{uP:X.pA.t,uB:b,uG:G},{uOm:MAC.omega},g);macSwap(X,'pA','pB')}}}
function macGeomOf(l){return l===0?MAC.t.geom.t:MAC.lv[l].T.geom.t}
/* V-cycle for L x = b; level 0 uses the caller's context, coarse levels start from zero */
function macVcycle(l,kind,X0,b0){const Lv=MAC.lv,L=Lv[l],X=macLvX(l,X0),b=macLvB(l,b0),g=macGridOf(l);
 if(l===Lv.length-1){/* coarse iterations: fixed value, or (0 = auto) twice the longest side of the coarsest level - Gauss-Seidel moves information about one cell per sweep */macSmooth(l,MAC.coarse>0?MAC.coarse:Math.max(4,2*Math.max(...L.N)),kind,[0,1],X,b);return}
 macSmooth(l,MAC.pre,kind,[0,1],X,b);
 macPass('pres',L.T.r,{uP:X.pA.t,uB:b,uG:macGeomOf(l)},{},g);
 const C=Lv[l+1];macPass('prest',C.T.b,{uRF:L.T.r.t},{uNF:{i3:L.N},uTXF:{int:L.tx},uR:{i3:C.r}},macGridOf(l+1));liveClear(C.T.pA);liveClear(C.T.pB);
 macVcycle(l+1,kind,X0,b0);
 macPass('pprol',X.pB,{uP:X.pA.t,uPC:C.T.pA.t,uGC:macGeomOf(l+1),uG:macGeomOf(l)},{uNC:{i3:C.N},uTXC:{int:C.tx},uR:{i3:C.r},uCorr:MAC.corr,uTri:MAC.prol},g);macSwap(X,'pA','pB');
 macSmooth(l,MAC.post,kind,[1,0],X,b)}
function liveReduceTo(src,sw,sh,chain){if(MAC.cw){MAC.cw.prog=null;MAC.cw.fb=null;MAC.cw.vw=0;MAC.cw.tb={}}const p=LIVE.prog.sum;gl.useProgram(p);let s=src,w=sw,h=sh;for(const r of chain){gl.bindFramebuffer(gl.FRAMEBUFFER,r.t.f);gl.viewport(0,0,r.w,r.h);gl.activeTexture(gl.TEXTURE0+8);gl.bindTexture(gl.TEXTURE_2D,s.t);gl.uniform1i(liveU(p,'uS'),8);gl.uniform2i(liveU(p,'uSz'),w,h);gl.drawArrays(gl.TRIANGLES,0,3);s=r.t;w=r.w;h=r.h}return s}
function macDot(a,b){const T=MAC.t;macPass('pdot',T.frc,{uX:a,uY:b},{});return liveReduceTo(T.frc,MAC.G.W,MAC.G.H,MAC.red)}
const MAC_ONE={N:[1,1,1],tx:1,W:1,H:1,h:[1,1,1]};
function macScal(mode,dotTex){const [S0,S1]=MAC.scal;macPass('pscal',S1,{uS:S0.t,uD:dotTex.t},{uMode:{int:mode},uTol2:MAC.tol*MAC.tol},MAC_ONE);MAC.scal=[S1,S0]}
function macAxpy(out,X,Y,sel,sign){macPass('paxpy',out,{uX:X.t,uY:Y.t,uS:MAC.scal[0].t},{uSel:{int:sel},uSign:sign})}
function macSolve(){const L0=MAC.lv[0],T=MAC.t,s=MAC.solver;
 if(s==='GMG'||s==='RBGS'){for(let c=0;c<MAC.cycles;c++)macVcycle(0,s==='RBGS'?'RB':'J',L0.T,T.b.t);return}
 if(s==='JACOBI'){for(let k=0;k<MAC.jacobiIters;k++){macPass('pjac',L0.T.pB,{uP:L0.T.pA.t,uB:T.b.t,uG:T.geom.t},{uOm:1});macSwap(L0.T,'pA','pB')}return}
 /* MGPCG in L-form (L negative definite). Z={pA:cgZ,pB:cgZ2} is the preconditioner context. */
 const X=L0.T,Z=MAC.Z;
 macPass('pres',T.cgR,{uP:X.pA.t,uB:T.b.t,uG:T.geom.t},{});
 const pre=()=>{liveClear(Z.pA);liveClear(Z.pB);macVcycle(0,MAC.pcgSmoother,Z,T.cgR.t)};
 pre();macAxpy(T.cgD,Z.pA,Z.pA,0,0);
 macScal(3,macDot(T.b.t,T.b.t));macScal(0,macDot(T.cgR.t,Z.pA.t));
 for(let k=0;k<MAC.pcgIters;k++){
  macPass('papply',T.cgQ,{uP:T.cgD.t,uG:T.geom.t},{});macScal(1,macDot(T.cgD.t,T.cgQ.t));
  macAxpy(X.pB,X.pA,T.cgD,1,1);macSwap(X,'pA','pB');
  macAxpy(T.cgS,T.cgR,T.cgQ,1,-1);macSwap(T,'cgR','cgS');
  pre();macScal(2,macDot(T.cgR.t,Z.pA.t));
  macAxpy(T.cgS,T.cgD,Z.pA,2,1);macSwap(T,'cgD','cgS')}}
/* ---- one time step ---- */
function macStep(dt,emit){MAC.cw={prog:null,fb:null,vw:0,vh:0,tb:{}};try{macStepBody(dt,emit)}finally{MAC.cw=null}}
function macStepBody(dt,emit){const T=MAC.t,cfg=MAC.cfg;gl.bindVertexArray(LIVE.vao);gl.disable(gl.DEPTH_TEST);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);
 MAC.U=cfg.U??LIVE.U;
 if(cfg.body||MAC.step===0||(cfg.obstacle&&MAC.spinUntil&&MAC.time<MAC.spinUntil+2*dt))macSolids();
 /* MacCormack velocity advection */
 macPass('adv',T.hat,{uVel:T.velA.t,uSrc:T.velA.t},{uDt:dt});
 macPass('adv',T.bar,{uVel:T.velA.t,uSrc:T.hat.t},{uDt:-dt});
 macPass('advc',T.velB,{uVel:T.velA.t,uHat:T.hat.t,uBar:T.bar.t,uSol:T.sol.t,uG:T.geom.t},{uDt:dt});
 /* LES + molecular diffusion (+ optional vorticity confinement) */
 const hmin=Math.min(...MAC.h),nuMax=Math.max(0,.9*hmin*hmin/(6*dt)-(cfg.nu??MAC.nuMol));
 macPass('sgs',T.nu,{uVel:T.velB.t,uSol:T.sol.t},{uCs:MAC.les?MAC.Cs:0,uNuMax:nuMax});
 const bb=cfg.belt?[0,3.15,0,1.25]:[0,0,0,0];
 macPass('diff',T.velA,{uVel:T.velB.t,uNu:T.nu.t,uSol:T.sol.t,uG:T.geom.t},{uDt:dt,uNuMol:cfg.nu??MAC.nuMol,uEps:MAC.eps,uBelt:cfg.belt?1:0,uBeltBox:bb});
 /* volume-fraction forcing: T.hat keeps the pre-forcing velocity until the next step (read by the budget force) */
 if(MAC.ibm==='vf'){macPass('ibm',T.hat,{uVel:T.velA.t,uSol:T.sol.t,uG:T.geom.t},{});macSwap(T,'velA','hat')}
 /* projection */
 macPass('div',T.b,{uVel:T.velA.t,uSol:T.sol.t,uG:T.geom.t},{uScale:1/dt,uPost:0});
 macSolve();
 macPass('proj',T.velB,{uVel:T.velA.t,uP:MAC.lv[0].T.pA.t,uSol:T.sol.t,uG:T.geom.t},{uDt:dt});macSwap(T,'velA','velB');
 /* smoke on the 2x grid */
 if(emit!==false){const em=liveEmitters(),D=MAC.D,Dg={...D,h:MAC.hd};
  macPass('dadv',T.dhat,{uVel:T.velA.t,uSrc:T.dyeA.t},{uDt:dt},Dg,MAC.G);macPass('dadv',T.dbar,{uVel:T.velA.t,uSrc:T.dhat.t},{uDt:-dt},Dg,MAC.G);
  macPass('dcorr',T.dyeB,{uVel:T.velA.t,uSrc:T.dyeA.t,uHat:T.dhat.t,uBar:T.dbar.t,uSol:T.sol.t},{uDt:dt,uDecay:.9985,uEmS:1,uEm:em,uEmN:{int:LIVE.emitters.length}},Dg,MAC.G);macSwap(T,'dyeA','dyeB')}
 MAC.step++;MAC.time+=dt;MAC.lastDt=dt}
MAC.copyVolume=()=>macCopyVolume();/* test hook: the volume is normally filled by the render loop */
function macCopyVolume(){const p=MAC.prog.vcopy,D=MAC.D,Nd=D.N,T=MAC.t;gl.useProgram(p);gl.bindFramebuffer(gl.FRAMEBUFFER,MAC.volFbo);gl.viewport(0,0,Nd[0],Nd[1]);
 gl.uniform3i(liveU(p,'uN'),...Nd);gl.uniform1i(liveU(p,'uTX'),D.tx);gl.uniform3f(liveU(p,'uH'),...MAC.hd);gl.uniform3i(liveU(p,'uN2'),...MAC.N);gl.uniform1i(liveU(p,'uTX2'),MAC.G.tx);gl.uniform3f(liveU(p,'uH2'),...MAC.h);gl.uniform3f(liveU(p,'uMin'),...MAC.min);gl.uniform1f(liveU(p,'uU'),MAC.U);
 const bind=(u,n,t)=>{gl.activeTexture(gl.TEXTURE0+u);gl.bindTexture(gl.TEXTURE_2D,t);gl.uniform1i(liveU(p,n),u)};bind(8,'uVel',T.velA.t);bind(9,'uDye',T.dyeA.t);bind(10,'uSol',T.sol.t);
 /* four consecutive layers per draw: one colour attachment per layer of the same 3D texture */
 const AT=[gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1,gl.COLOR_ATTACHMENT2,gl.COLOR_ATTACHMENT3];
 for(let k=0;k<Nd[2];k+=4){const n=Math.min(4,Nd[2]-k);for(let j=0;j<4;j++){if(j<n)gl.framebufferTextureLayer(gl.FRAMEBUFFER,AT[j],MAC.vol,0,k+j);else gl.framebufferTextureLayer(gl.FRAMEBUFFER,AT[j],null,0,0)}
  gl.drawBuffers(AT.map((a,j)=>j<n?a:gl.NONE));gl.uniform1i(liveU(p,'uLayer'),k);gl.drawArrays(gl.TRIANGLES,0,3)}
 for(let j=1;j<4;j++)gl.framebufferTextureLayer(gl.FRAMEBUFFER,AT[j],null,0,0);gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
 gl.bindTexture(gl.TEXTURE_3D,MAC.vol);gl.generateMipmap(gl.TEXTURE_3D)}
/* velocity at a world point (face average -> cell centre of the containing cell) */
function macReadCell(i,j,k){const G=MAC.G,N=MAC.N,px=(ii,jj,kk)=>{ii=Math.min(N[0]-1,Math.max(0,ii));jj=Math.min(N[1]-1,Math.max(0,jj));kk=Math.min(N[2]-1,Math.max(0,kk));const b=new Float32Array(4);gl.readPixels((kk%G.tx)*N[0]+ii,Math.floor(kk/G.tx)*N[1]+jj,1,1,gl.RGBA,gl.FLOAT,b);return b};
 gl.bindFramebuffer(gl.FRAMEBUFFER,MAC.t.velA.f);const a=px(i,j,k),bx=i<N[0]-1?px(i+1,j,k)[0]:a[0],by=j<N[1]-1?px(i,j+1,k)[1]:0,bz=k<N[2]-1?px(i,j,k+1)[2]:0;gl.bindFramebuffer(gl.FRAMEBUFFER,null);
 return [(a[0]+bx)/2,(a[1]+by)/2,(a[2]+bz)/2]}
function macRead(x,y,z){const f=(v,d)=>Math.min(MAC.N[d]-1,Math.max(0,Math.floor((v-MAC.min[d])/MAC.h[d])));return macReadCell(f(x,0),f(y,1),f(z,2))}
/* full-field reads (tests / validation) */
function macReadAll(t,ch){const G=MAC.G,buf=new Float32Array(G.W*G.H*4);gl.bindFramebuffer(gl.FRAMEBUFFER,t.f);gl.readPixels(0,0,G.W,G.H,gl.RGBA,gl.FLOAT,buf);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return buf}
function macFieldIndex(i,j,k){const G=MAC.G,N=MAC.N;return (((Math.floor(k/G.tx)*N[1]+j)*G.W)+(k%G.tx)*N[0]+i)*4}
/* post-projection divergence relative to U/h and Poisson relative residual, over cells with at least one open face */
function macDivStats(){const T=MAC.t;gl.bindVertexArray(LIVE.vao);macPass('div',T.res,{uVel:T.velA.t,uSol:T.sol.t,uG:T.geom.t},{uScale:1,uPost:1});
 const d=macReadAll(T.res),g=(()=>{const G=MAC.G,b=new Float32Array(G.W*G.H*4);gl.bindFramebuffer(gl.FRAMEBUFFER,T.geom.f);gl.readPixels(0,0,G.W,G.H,gl.RGBA,gl.FLOAT,b);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return b})();
 const N=MAC.N,ref=MAC.U/Math.min(...MAC.h);let s=0,m=0,n=0,bad=0;
 for(let k=0;k<N[2];k++)for(let j=0;j<N[1];j++)for(let i=0;i<N[0];i++){const q=macFieldIndex(i,j,k);if(g[q+3]>.999)continue;const v=d[q];if(!Number.isFinite(v)){bad++;continue}s+=v*v;m=Math.max(m,Math.abs(v));n++}
 gl.bindVertexArray(null);return {cells:n,nonFinite:bad,relRms:Math.sqrt(s/Math.max(n,1))/ref,relMax:m/ref,rms:Math.sqrt(s/Math.max(n,1)),max:m}}
function macResidual(){const T=MAC.t,L0=MAC.lv[0];gl.bindVertexArray(LIVE.vao);macPass('pres',T.res,{uP:L0.T.pA.t,uB:T.b.t,uG:T.geom.t},{});const r=macReadAll(T.res),b=macReadAll(T.b);let rr=0,bb=0,bad=0;
 for(let q=0;q<r.length;q+=4){if(!Number.isFinite(r[q])){bad++;continue}rr+=r[q]*r[q];bb+=b[q]*b[q]}gl.bindVertexArray(null);return {rel:Math.sqrt(rr/Math.max(bb,1e-30)),nonFinite:bad}}
/* forces on the solid id 1 (car or validation obstacle); physical units with rho=1.2 (tunnel) or rho=1 (validation) */
/* mode 'surface' (p across the phi ramps) or 'budget' (closed-face pressure + ibm forcing); default: surface for the
   cut-cell treatment, budget for 'vf' (the forcing already contains the pressure on the solid fraction) */
function macForces(mode){const T=MAC.t,cfg=MAC.cfg,rho=cfg.rho??1.2,vf=MAC.ibm==='vf';mode=mode||(vf?'budget':'surface');gl.bindVertexArray(LIVE.vao);
 macPass('force',T.frc,{uVel:T.velA.t,uP:MAC.lv[0].T.pA.t,uSol:T.sol.t,uNu:T.nu.t,uG:T.geom.t,uStar:T.hat.t},{uRho:rho,uNuMol:cfg.nu??MAC.nuMol,uId:1,uBudget:mode==='budget'?1:0,uVf:vf&&mode==='budget'?1:0,uDt:MAC.lastDt||.02});
 const s=liveReduceTo(T.frc,MAC.G.W,MAC.G.H,MAC.red),b=new Float32Array(4);gl.bindFramebuffer(gl.FRAMEBUFFER,s.f);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,b);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null);
 const A=cfg.Aref??(MAC.vox?.front||0),q=.5*rho*MAC.U*MAC.U*A;return {Fx:b[0],Fy:b[1],Fz:b[2],Fpx:b[3],A,Cd:q>0?b[0]/q:NaN,Cdp:q>0?b[3]/q:NaN,Cl:q>0?b[1]/q:NaN,Cs:q>0?b[2]/q:NaN}}
/* scalar state readback (relative residual of the last PCG solve) */
function macPcgState(){const b=new Float32Array(4);gl.bindFramebuffer(gl.FRAMEBUFFER,MAC.scal[0].f);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,b);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return {rz:b[0],alpha:b[1],beta:b[2],bb:b[3]}}
function macMemoryMB(){let s=0;const add=(g,bpp)=>{s+=g.W*g.H*bpp};const G=MAC.G;add(G,16*5);add(G,8*2);add(G,8);add(G,4*9);add(MAC.D,2*4);for(const L of MAC.lv.slice(1))add(L,4*4+8);s+=MAC.D.N[0]*MAC.D.N[1]*MAC.D.N[2]*8*8/7;return s/1048576}
function macReadAllD(t){const D=MAC.D,buf=new Float32Array(D.W*D.H*4);gl.bindFramebuffer(gl.FRAMEBUFFER,t.f);gl.readPixels(0,0,D.W,D.H,gl.RGBA,gl.FLOAT,buf);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return buf}
function macFlagCounts(){const s=macReadAll(MAC.t.sol),N=MAC.N,c={fluid:0,car:0,fan:0,body:0};for(let k=0;k<N[2];k++)for(let j=0;j<N[1];j++)for(let i=0;i<N[0];i++){const w=s[macFieldIndex(i,j,k)+3],id=Math.floor(w*.5+.001),ph=w-2*id;
  if(ph<.5)c.fluid++;else c[['fluid','car','fan','body'][id]]++}return c}
/* solver comparison on one fixed right-hand side (current velocity field): cold start, timed with a readPixels fence */
function macSolveBench(list){const T=MAC.t,L0=MAC.lv[0],out=[],save={solver:MAC.solver,cycles:MAC.cycles,pcgIters:MAC.pcgIters,jacobiIters:MAC.jacobiIters,pre:MAC.pre,post:MAC.post};
 gl.bindVertexArray(LIVE.vao);const dt=MAC.lastDt||.02;macPass('div',T.b,{uVel:T.velA.t,uSol:T.sol.t,uG:T.geom.t},{uScale:1/dt,uPost:0});
 const fence=()=>{const b=new Float32Array(4);gl.bindFramebuffer(gl.FRAMEBUFFER,L0.T.pA.f);gl.readPixels(0,0,1,1,gl.RGBA,gl.FLOAT,b)};
 for(const c of list){Object.assign(MAC,c);liveClear(L0.T.pA);liveClear(L0.T.pB);fence();const t0=performance.now();macSolve();fence();const ms=performance.now()-t0;
  const r=macResidual();gl.bindVertexArray(LIVE.vao);out.push({...c,ms,rel:r.rel,nonFinite:r.nonFinite})}
 Object.assign(MAC,save);gl.bindVertexArray(null);return out}
function macMemBreakdown(){const G=MAC.G,lvB=MAC.lv.slice(1).reduce((a,L)=>a+L.W*L.H*(4*4+8),0),base=G.W*G.H;
 return {levelsMB:(lvB+base*4*3)/1048576,pcgVectorsMB:base*4*6/1048576,jacobiMB:base*4*2/1048576}}

/* Control-volume momentum balance around the obstacle (validation cross-check, independent of the boundary
   treatment and of the surface force formula). Box = cells [lo,hi) per axis. Returns the surface terms
   S = -oint[rho u(u.n) + p n - tau.n] dS and the box momentum M = int rho u dV; body force = S - dM/dt (rho=1). */
function macCvForce(lo,hi){const N=MAC.N,h=MAC.h,nu=MAC.cfg.nu??MAC.nuMol,rho=MAC.cfg.rho??1.2,v=macReadAll(MAC.t.velA),pr=macReadAll(MAC.lv[0].T.pA);
 const cl=(i,d)=>Math.min(N[d]-1,Math.max(0,i)),I=(i,j,k)=>macFieldIndex(cl(i,0),cl(j,1),cl(k,2)),U=(c,i,j,k)=>v[I(i,j,k)+c],P=(i,j,k)=>pr[I(i,j,k)];
 /* velocity component c at an arbitrary point given in cell units (MAC staggering: component c sits at offset .5 on the other axes) */
 const at=(c,x,y,z)=>{const q=[x,y,z];for(let d=0;d<3;d++)if(d!==c)q[d]-=.5;const i0=Math.floor(q[0]),j0=Math.floor(q[1]),k0=Math.floor(q[2]),fx=q[0]-i0,fy=q[1]-j0,fz=q[2]-k0;let s=0;
  for(let a=0;a<2;a++)for(let b=0;b<2;b++)for(let e=0;e<2;e++)s+=(a?fx:1-fx)*(b?fy:1-fy)*(e?fz:1-fz)*U(c,i0+a,j0+b,k0+e);return s};
 const S=[0,0,0],M=[0,0,0],A=[h[1]*h[2],h[0]*h[2],h[0]*h[1]],V=h[0]*h[1]*h[2];
 for(let ax=0;ax<3;ax++)for(const side of [0,1]){const sg=side?1:-1,f=side?hi[ax]:lo[ax],o1=(ax+1)%3,o2=(ax+2)%3;
  for(let a=lo[o1];a<hi[o1];a++)for(let b=lo[o2];b<hi[o2];b++){const x=[0,0,0];x[ax]=f;x[o1]=a+.5;x[o2]=b+.5;
   const u=[at(0,...x),at(1,...x),at(2,...x)],un=u[ax];const c0=[0,0,0];c0[ax]=f-1;c0[o1]=a;c0[o2]=b;const c1=c0.slice();c1[ax]=f;
   const p=f<=0?P(...c1):f>=N[ax]?P(...c0):.5*(P(...c0)+P(...c1));
   for(let c=0;c<3;c++){/* tau_{c,ax} = nu (d u_c/d x_ax + d u_ax/d x_c), centred differences at the face point */
    const d1=(()=>{const xp=x.slice(),xm=x.slice();xp[ax]+=.5;xm[ax]-=.5;return (at(c,...xp)-at(c,...xm))/h[ax]})(),d2=(()=>{const xp=x.slice(),xm=x.slice();xp[c]+=.5;xm[c]-=.5;return (at(ax,...xp)-at(ax,...xm))/h[c]})();
    S[c]-=sg*A[ax]*(rho*u[c]*un+(c===ax?rho*p:0)-rho*nu*(d1+d2))}}}
 for(let k=lo[2];k<hi[2];k++)for(let j=lo[1];j<hi[1];j++)for(let i=lo[0];i<hi[0];i++)for(let c=0;c<3;c++)M[c]+=rho*at(c,i+.5,j+.5,k+.5)*V;
 return {S,M}}
/* ---- validation domain API ---- */
function macValidate(cfg){MAC.lesSaved=MAC.les;MAC.domain={N:cfg.N,min:cfg.min,max:cfg.max,obstacle:cfg.obstacle||null,U:cfg.U??1,nu:cfg.nu??0,rho:1,Aref:cfg.Aref};MAC.les=cfg.les??false;MAC.ibmSaved=MAC.ibmSaved??MAC.ibm;MAC.ibm=cfg.ibm||MAC.ibmSaved;
 LIVE.enabled=false;LIVE.freeze=true;macInit();if(cfg.obstacle){MAC.wheels=[[...cfg.obstacle.c,cfg.obstacle.D/2]];MAC.spin=cfg.spin||0;MAC.spinUntil=cfg.spinUntil||0}
 gl.bindVertexArray(LIVE.vao);macSolids();gl.bindVertexArray(null);return {N:MAC.N,h:MAC.h,phiSum:MAC.vox.carCells,expectedVol:cfg.obstacle?(cfg.obstacle.type==='sphere'?Math.PI*cfg.obstacle.D**3/6:Math.PI*cfg.obstacle.D**2/4*(cfg.max[2]-cfg.min[2])):0,cellVol:MAC.h[0]*MAC.h[1]*MAC.h[2]}}
/* run n steps; every `every` steps record forces (and probe velocity) */
function macVrun(n,dt,every=1,probe=null,cv=null){const rec=[];const t0=performance.now();
 for(let i=0;i<n;i++){macStep(dt,false);if((i+1)%every===0){const f=macForces(),fb=macForces('budget');const r={t:MAC.time,Fx:f.Fx,Fy:f.Fy,Fz:f.Fz,Cd:f.Cd,Cdp:f.Cdp,Cl:f.Cl,CdB:fb.Cd,ClB:fb.Cl};if(probe){const v=macRead(...probe);r.pv=v[1];r.pu=v[0]}
  if(cv){const c=macCvForce(cv.lo,cv.hi);r.cvS=c.S;r.cvM=c.M;r.q=.5*(MAC.cfg.rho??1.2)*MAC.U*MAC.U*f.A}rec.push(r)}}
 gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindVertexArray(null);return {rec,ms:performance.now()-t0,step:MAC.step,time:MAC.time}}
function macUniformError(){const v=macReadAll(MAC.t.velA),N=MAC.N,U=MAC.U;let mx=0,mt=0,n=0,bad=0;
 for(let k=1;k<N[2]-1;k++)for(let j=1;j<N[1]-1;j++)for(let i=1;i<N[0]-1;i++){const q=macFieldIndex(i,j,k);if(![v[q],v[q+1],v[q+2]].every(Number.isFinite)){bad++;continue}mx=Math.max(mx,Math.abs(v[q]-U)/U);mt=Math.max(mt,Math.hypot(v[q+1],v[q+2])/U);n++}
 return {cells:n,maxRelErrU:mx,maxRelCross:mt,nonFinite:bad}}
