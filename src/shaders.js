import * as THREE from 'three';

export const GLSL_NOISE = /* glsl */ `
float h11(float p){p=fract(p*.1031);p*=p+33.33;p*=p+p;return fract(p);}
float h21(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
vec2 h22(vec2 p){vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));p3+=dot(p3,p3.yzx+33.33);return fract((p3.xx+p3.yz)*p3.zy);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*vnoise(p);p=p*2.03+17.1;a*=.5;}return s;}
`;


// Fog exemption for one landmark (the 1000 m tower): FogExp2 hides everything beyond ~300 m, and the top of a 1000 m tower is always
// 1000 m away. Fragments whose world position lies inside the tower's footprint column get their fog depth scaled by k. The box is baked
// into the fog chunks as constants, so this must run before the first program compiles (the world is built before the first frame).
const FOG0 = { pv: THREE.ShaderChunk.fog_pars_vertex, v: THREE.ShaderChunk.fog_vertex, pf: THREE.ShaderChunk.fog_pars_fragment, f: THREE.ShaderChunk.fog_fragment };
export function setTowerFog(x0, z0, x1, z1, k) {
  const C = THREE.ShaderChunk, f = (n) => n.toFixed(3);
  C.fog_pars_vertex = FOG0.pv.replace('varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying vec2 vFogW;');
  C.fog_vertex = FOG0.v.replace('vFogDepth = - mvPosition.z;', 'vFogDepth = - mvPosition.z;\n\tvFogW = cameraPosition.xz + vec2(dot(mat3(viewMatrix)[0], mvPosition.xyz), dot(mat3(viewMatrix)[2], mvPosition.xyz));');
  C.fog_pars_fragment = FOG0.pf.replace('varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying vec2 vFogW;');
  const box = `vFogW.x > ${f(x0)} && vFogW.x < ${f(x1)} && vFogW.y > ${f(z0)} && vFogW.y < ${f(z1)}`;
  C.fog_fragment = FOG0.f.replace('#ifdef FOG_EXP2', `float fogD = vFogDepth * ((${box}) ? ${f(k)} : 1.0);\n\t#ifdef FOG_EXP2`)
    .replace('fogDensity * fogDensity * vFogDepth * vFogDepth', 'fogDensity * fogDensity * fogD * fogD').replace('smoothstep( fogNear, fogFar, vFogDepth )', 'smoothstep( fogNear, fogFar, fogD )');
}

export const timeUniform = { value: 0 };
// player position: entrance apertures only open where building.js has a lobby to look into
export const doorCamU = { value: new THREE.Vector3() };
// per-zone blackout (0 powered .. 1 dark), zones as in society.zoneAt: 0 centre, 1 north(+z), 2 east(+x), 3 west, 4 south
export const blackU = { value: [0, 0, 0, 0, 0] };
// The room behind a window, for facades that draw their windows (world.js) and for the skyline glass (skyline.js); see fakeRoom below.
export const FAKE_ROOM_GLSL = /* glsl */ `
float frH(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
// The room behind a window (interior mapping): a 3.6 m deep box seen through the glass. p = point in the room's window cell (metres,
// x along the wall, y up), rs = the cell's size, d = view direction (x along the wall, y up, z into the building), rid = the room's hash,
// lit / lc = its lamp and colour, day = daylight. Returns the light leaving the window. Walls, floor and ceiling take the room's colours,
// a low block and a picture stand on the back wall, and a curtain or blind is drawn part way across some windows.
vec3 fakeRoom(vec2 p,vec2 rs,vec3 d,float rid,float lit,vec3 lc,float day){
  const float DEP=3.6;
  d.x=abs(d.x)<1e-4?1e-4:d.x;d.y=abs(d.y)<1e-4?1e-4:d.y;d.z=max(d.z,.05);
  vec3 tq=vec3((d.x>0.?rs.x-p.x:-p.x)/d.x,(d.y>0.?rs.y-p.y:-p.y)/d.y,DEP/d.z);
  float t=min(tq.x,min(tq.y,tq.z));vec3 h=vec3(p,0.)+d*t;
  float a=frH(vec2(rid,3.1)),b=frH(vec2(rid,7.7)),c=frH(vec2(rid,1.3)),cu=frH(vec2(rid,9.4));
  vec3 wall=mix(vec3(.66,.62,.55),mix(vec3(.52,.58,.64),vec3(.7,.58,.48),b),a);
  vec3 col;
  if(tq.z<=min(tq.x,tq.y)){
    col=wall*.92;
    float fx=step(.16*rs.x,h.x)*step(h.x,(.5+.3*c)*rs.x)*step(h.y,.8);
    col=mix(col,mix(vec3(.16,.14,.13),vec3(.36,.27,.2),b),fx);
    float pic=step(.62*rs.x,h.x)*step(h.x,.86*rs.x)*step(1.3,h.y)*step(h.y,1.95)*step(.45,c);
    col=mix(col,vec3(.25,.33,.42)*(.6+a),pic);
  } else if(tq.y<tq.x){col=d.y<0.?mix(vec3(.34,.24,.16),vec3(.3,.31,.34),step(.5,b)):vec3(.86,.84,.8);}
  else col=wall*.8;
  float k=h.z/DEP;
  vec3 L=lit>.5?lc*(1.25-.5*k)*(1.+.5*step(rs.y-.06,h.y)):vec3(.66,.68,.72)*day*(1.-.6*k)+vec3(.03,.032,.04);   // unlit: daylight from the window, at night only the city's glow
  // drawn curtains (a third of the rooms) or a blind lowered from the top (a sixth)
  float cw=cu<.33?.18+.25*a:0.,bl=cu>.83?.25+.45*b:0.;
  if(p.x<cw*rs.x||p.x>rs.x*(1.-cw)||p.y>rs.y*(1.-bl)){col=mix(vec3(.55,.42,.36),vec3(.4,.45,.52),c);k=0.;L=lit>.5?lc*.9:vec3(.7)*day+vec3(.03);}
  return col*L;
}
`;
export const ZONE_GLSL = 'int zoneOf(vec2 p){if(length(p)<90.)return 0;if(abs(p.x)>abs(p.y))return p.x>0.?2:3;return p.y>0.?1:4;}';
export const flashUniform = { value: 0 };
export const nightU = { value: 1 };
export const skyU = { uDay: { value: 0 }, uSun: { value: new THREE.Vector3(0.5, -0.5, -0.3) }, uMoon: { value: new THREE.Vector3(-0.45, 0.62, -0.65) }, uTwi: { value: 0 } };

// Large-scale moving cloud sky dome lit from below by city glow
export function createSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: timeUniform, uFlash: flashUniform, ...skyU },
    vertexShader: 'varying vec3 vD;void main(){vD=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p.xyww;}',
    fragmentShader: `${GLSL_NOISE}
      uniform float uTime,uFlash,uDay,uTwi;uniform vec3 uSun,uMoon;varying vec3 vD;
      void main(){
        vec3 d=normalize(vD);float y=d.y;
        vec3 top=mix(vec3(.012,.016,.05),vec3(.30,.38,.50),uDay),hor=mix(vec3(.20,.06,.26),vec3(.62,.67,.74),uDay);
        hor=mix(hor,vec3(.95,.5,.3),uTwi*.55);
        vec3 c=mix(hor,top,smoothstep(0.,.65,y));
        // clouds projected on a plane
        vec2 uv=d.xz/(max(y,.03)+.35)*1.6;
        float cl=fbm(uv*.9+vec2(uTime*.012,uTime*.006));
        float cl2=fbm(uv*2.1-vec2(uTime*.02,0.)+4.);
        float dens=smoothstep(.38,.8,cl*.7+cl2*.4);
        vec3 cloudCol=mix(mix(vec3(.05,.045,.11),vec3(.42,.16,.46),smoothstep(.6,0.,y)*.8),mix(vec3(.50,.53,.58),vec3(.86,.78,.72),uTwi*.5),uDay);
        c=mix(c,cloudCol,dens*smoothstep(-.02,.15,y)*.9);
        // moon through clouds
        vec3 md=normalize(uMoon);float mm=max(dot(d,md),0.);float nt=1.-uDay;
        c+=vec3(.55,.65,1.)*pow(mm,900.)*(1.-dens*.85)*3.*nt;
        c+=vec3(.3,.38,.8)*pow(mm,24.)*.35*nt;
        float sm=max(dot(d,normalize(uSun)),0.);
        c+=vec3(1.,.82,.6)*(pow(sm,600.)*1.8*(1.-dens*.9)+pow(sm,10.)*.22)*uDay;
        c+=vec3(.55,.62,.95)*uFlash*(.35+dens*.9)*smoothstep(-.1,.4,y);
        c+=vec3(.5,.15,.55)*exp(-pow(y*5.,2.))*.35*(1.-uDay);
        gl_FragColor=vec4(c,1.);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(700, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

// Soft additive glare sprites (street lamps, neon, traffic lights, beacons)
export function createGlareMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: timeUniform, uScale: { value: 600 }, uFogD: { value: 0.0105 }, uNight: nightU },
    vertexShader: `attribute vec4 aCol;attribute vec2 aBlink;uniform float uTime,uScale,uFogD,uNight;varying vec3 vC;
      void main(){
        vec4 mv=modelViewMatrix*vec4(position,1.);
        float b=1.;
        if(aBlink.x>0.){b=smoothstep(.45,.55,sin(uTime*aBlink.x+aBlink.y)*.5+.5);}
        float dist=-mv.z;
        float fog=exp(-uFogD*uFogD*dist*dist*.25);
        vC=aCol.rgb*b*fog*(.03+.97*uNight);
        gl_PointSize=clamp(aCol.a*uScale/max(dist,1.),0.,128.);
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader: `varying vec3 vC;void main(){
        float d=length(gl_PointCoord-.5)*2.;
        float g=(exp(-d*d*6.)*.7+exp(-d*d*30.)*1.1);
        gl_FragColor=vec4(vC*g*(1.-smoothstep(.8,1.,d)),1.);}`,
  });
}

// Install a shader patch into a MeshStandardMaterial
export function patchStandard(mat, key, { vertexDecl = '', vertexMain = '', fragDecl = '', fragMain = '', normalMain = '', uniforms = {} }) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + vertexDecl)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + vertexMain);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + fragDecl)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + fragMain)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + normalMain)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = fRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = fMetal;')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += fEmit;');
  };
  mat.customProgramCacheKey = () => key;
}
