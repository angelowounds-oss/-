import * as THREE from 'three';

export const GLSL_NOISE = /* glsl */ `
float h11(float p){p=fract(p*.1031);p*=p+33.33;p*=p+p;return fract(p);}
float h21(vec2 p){vec3 p3=fract(vec3(p.xyx)*.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
vec2 h22(vec2 p){vec3 p3=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973));p3+=dot(p3,p3.yzx+33.33);return fract((p3.xx+p3.yz)*p3.zy);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*vnoise(p);p=p*2.03+17.1;a*=.5;}return s;}
`;

export const timeUniform = { value: 0 };
// player position: entrance apertures only open where building.js has a lobby to look into
export const doorCamU = { value: new THREE.Vector3() };
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
export function patchStandard(mat, key, { vertexDecl = '', vertexMain = '', fragDecl = '', fragMain = '', uniforms = {} }) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + vertexDecl)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + vertexMain);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + fragDecl)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + fragMain)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = fRough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = fMetal;')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance += fEmit;');
  };
  mat.customProgramCacheKey = () => key;
}
