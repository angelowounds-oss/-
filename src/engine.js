import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { el, LIGHT_CAP } from './util.js';
import hdriPlaza from '../assets/env/hansaplatz.rgbe';
import hdriSuite from '../assets/env/interior_suite.rgbe';
import hdriDay from '../assets/env/day_street.rgbe';

export const QUALITY = [
  { name: 'LOW', shadowEvery: 1, lights: [2, 2], dpr: 0.85, shadow: 1024, bloom: 0.28, ao: false, smaa: true, traffic: 12, npc: 52, parked: 18, rain: 1800, far: 1 },
  { name: 'MEDIUM', shadowEvery: 1, lights: [3, 3], dpr: 1.0, shadow: 2048, bloom: 0.34, ao: false, smaa: true, traffic: 18, npc: 80, parked: 28, rain: 3000, far: 1 },
  { name: 'HIGH', shadowEvery: 1, lights: [4, 4], dpr: 1.4, shadow: 2048, bloom: 0.4, ao: false, smaa: true, traffic: 24, npc: 120, parked: 40, rain: 4500, far: 1 },
  { name: 'ULTRA', shadowEvery: 1, lights: [6, 6], dpr: 2.0, shadow: 4096, bloom: 0.45, ao: true, smaa: true, traffic: 30, npc: 160, parked: 52, rain: 6000, far: 1 },
];

// Final color grade: chromatic aberration, vignette, film grain, speed/radial blur, damage tint
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAber: { value: 0.0002 },
    uVig: { value: 0.42 },
    uGrain: { value: 0.006 },
    uSpeed: { value: 0 },
    uDamage: { value: 0 },
    uTint: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
  },
  vertexShader: /* glsl */ `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;uniform float uTime,uAber,uVig,uGrain,uSpeed,uDamage;uniform vec3 uTint;varying vec2 vUv;
    float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
    void main(){
      vec2 c=vUv-.5;float r2=dot(c,c);
      vec2 dir=normalize(c+1e-5);
      float ab=uAber*(1.+r2*1.5)+uDamage*.004;
      vec3 col;
      if(uSpeed>.02){
        // radial speed blur
        vec3 acc=vec3(0.);float tot=0.;
        for(int i=0;i<7;i++){float t=float(i)/6.;vec2 uv=.5+c*(1.-t*uSpeed*.09);
          acc.r+=texture2D(tDiffuse,uv+dir*ab).r;acc.g+=texture2D(tDiffuse,uv).g;acc.b+=texture2D(tDiffuse,uv-dir*ab).b;tot+=1.;}
        col=acc/tot;
      }else{
        col=vec3(texture2D(tDiffuse,vUv+dir*ab).r,texture2D(tDiffuse,vUv).g,texture2D(tDiffuse,vUv-dir*ab).b);
      }
      // subtle teal-magenta split tone
      float l=dot(col,vec3(.2126,.7152,.0722));
      col=mix(col,col*vec3(.92,1.0,1.1),smoothstep(.3,0.,l)*.6);
      col=mix(col,col*vec3(1.08,.97,.95),smoothstep(.4,1.5,l)*.4);
      col*=uTint;
      col*=1.-uVig*smoothstep(.12,.62,r2);
      col+=(h(floor(vUv*vec2(960.,540.))+floor(fract(uTime*.5)*6.)*17.)-.5)*uGrain;
      col=mix(col,col*vec3(1.6,.35,.4),uDamage*smoothstep(.05,.45,r2)*.7);
      gl_FragColor=vec4(max(col,0.),1.);
    }`,
};

export function createEngine(parent, qIndex) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x05060f, 1);
  parent.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070816);
  scene.fog = new THREE.FogExp2(0x0b0c22, 0.0105);

  const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.12, 900);
  scene.add(camera);

  // Lights
  const hemi = new THREE.HemisphereLight(0x5a5cc8, 0x14202e, 0.22);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0x8ea4ff, 0.85);
  moon.castShadow = true;
  moon.shadow.bias = -0.0004;
  moon.shadow.normalBias = 0.06;
  const SH = 85;
  Object.assign(moon.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 420 });
  scene.add(moon, moon.target);

  // real night-plaza HDRI by default; ?env=0 falls back to the procedural neon sky
  const env = new URLSearchParams(location.search).get('env') === '0' ? buildEnvironment(renderer) : hdriEnv(renderer, hdriPlaza);
  scene.environment = env;
  scene.environmentIntensity = 0.45;
  // indoors the reflections and ambient fill come from a real hotel-suite HDRI instead of the night plaza
  const envIndoor = hdriEnv(renderer, hdriSuite);
  // daylight: a real daytime street HDRI (swapped in while the intensity is faded down, see Game.updateIndoor)
  const envDay = hdriEnv(renderer, hdriDay);

  // Post
  const composer = new EffectComposer(renderer);
  const rpass = new RenderPass(scene, camera);
  composer.addPass(rpass);
  let gtao = null;
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.4, 0.4, 1.15);
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  let smaa = null;

  const eng = {
    renderer, scene, camera, composer, moon, hemi, bloom, grade, env, envIndoor, envDay, q: QUALITY[qIndex], qIndex,
    time: 0, scale: 1, frame: 0,
    // dynamic resolution: only the render-target size changes, pipelines stay intact
    setScale(sc) {
      sc = Math.max(0.7, Math.min(1, sc));
      if (Math.abs(sc - eng.scale) < 0.01) return;
      eng.scale = sc;
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, eng.q.dpr) * sc);
      renderer.setSize(innerWidth, innerHeight);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(innerWidth, innerHeight);
      if (smaa) smaa.setSize(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());
    },
    setQuality(i) {
      i = Math.max(0, Math.min(QUALITY.length - 1, i));
      eng.qIndex = i;
      const q = (eng.q = QUALITY[i]);
      eng.scale = 1; [LIGHT_CAP.fx, LIGHT_CAP.bld] = q.lights;
      renderer.setPixelRatio(Math.min(devicePixelRatio || 1, q.dpr));
      renderer.setSize(innerWidth, innerHeight);
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(innerWidth, innerHeight);
      moon.shadow.mapSize.set(q.shadow, q.shadow);
      if (moon.shadow.map) { moon.shadow.map.dispose(); moon.shadow.map = null; }
      bloom.strength = q.bloom;
      if (gtao) { composer.removePass(gtao); gtao.dispose?.(); gtao = null; }
      if (q.ao) {
        try {
          gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
          gtao.output = GTAOPass.OUTPUT.Default;
          gtao.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.4, thickness: 2, scale: 1.1, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
          gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
          composer.insertPass(gtao, 1);
        } catch (e) { console.warn('GTAO unavailable', e); gtao = null; }
      }
      if (smaa) { composer.removePass(smaa); smaa.dispose?.(); smaa = null; }
      if (q.smaa) {
        smaa = new SMAAPass(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());
        composer.addPass(smaa);
      }
      eng.onQuality?.(q);
    },
    resize() {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
      composer.setSize(innerWidth, innerHeight);
      if (smaa) smaa.setSize(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());
    },
    render(dt) {
      eng.time += dt;
      grade.uniforms.uTime.value = eng.time;
      // shadow map is the biggest fixed cost on integrated GPUs: refresh it less often on low tiers
      renderer.shadowMap.autoUpdate = false;
      if (eng.frame++ % eng.q.shadowEvery === 0) renderer.shadowMap.needsUpdate = true;
      composer.render(dt);
    },
  };
  addEventListener('resize', () => eng.resize());
  eng.setQuality(qIndex);
  return eng;
}

// Procedural neon night "HDRI" used for PBR reflections (wet road, car paint, glass)
function buildEnvironment(renderer) {
  const s = new THREE.Scene();
  const skyGeo = new THREE.SphereGeometry(100, 48, 24);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vP;void main(){vP=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 vP;void main(){float y=vP.y;
      vec3 low=vec3(.30,.07,.34),mid=vec3(.03,.05,.16),hi=vec3(.01,.015,.05);
      vec3 c=mix(low,mid,smoothstep(-.1,.28,y));c=mix(c,hi,smoothstep(.2,.9,y));
      c+=vec3(.5,.18,.55)*exp(-pow((y-.02)*7.,2.))*.7;
      gl_FragColor=vec4(c,1.);}`,
  });
  s.add(new THREE.Mesh(skyGeo, skyMat));
  const cols = [0xff2fd0, 0x2fe6ff, 0xffa24a, 0x7a5cff, 0x35ff9a, 0xff3d5a];
  const box = new THREE.BoxGeometry(1, 1, 1);
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2, d = 55 + r() * 25;
    const m = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: new THREE.Color(cols[i % cols.length]).multiplyScalar(4 + r() * 8) }));
    const w = 1 + r() * 7, h = 4 + r() * 28;
    m.scale.set(w, h, 1 + r() * 2);
    m.position.set(Math.cos(a) * d, -8 + h * 0.5 + r() * 8, Math.sin(a) * d);
    m.lookAt(0, m.position.y, 0);
    s.add(m);
  }
  // moon glow + overhead softbox
  const moonM = new THREE.Mesh(new THREE.CircleGeometry(7, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9bb4ff).multiplyScalar(5) }));
  moonM.position.set(-40, 70, -60); moonM.lookAt(0, 0, 0); s.add(moonM);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.02, 0.1, 200);
  pm.dispose();
  skyGeo.dispose();
  return rt.texture;
}

// Poly Haven 'hansaplatz' night HDRI (CC0), stored as 512x256 flat RGBE and decoded to half-float for reflections
function hdriEnv(renderer, b64) {
  const bin = atob(b64), w = 512, h = 256, data = new Uint16Array(w * h * 4), one = THREE.DataUtils.toHalfFloat(1);
  for (let i = 0; i < w * h; i++) {
    const e = bin.charCodeAt(i * 4 + 3), f = e ? 2 ** (e - 136) : 0;
    for (let c = 0; c < 3; c++) data[i * 4 + c] = THREE.DataUtils.toHalfFloat(bin.charCodeAt(i * 4 + c) * f);
    data[i * 4 + 3] = one;
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping; tex.colorSpace = THREE.LinearSRGBColorSpace; tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
  const pm = new THREE.PMREMGenerator(renderer), rt = pm.fromEquirectangular(tex);
  pm.dispose(); tex.dispose();
  return rt.texture;
}
