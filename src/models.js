import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rand, TAU } from './util.js';
import { A, buildSoldier, buildFerrariModel, setFerrariWheels } from './assets.js';

const shapeGeo = (pts, depth, bevel = 0.06, curve = 6) => {
  const s = new THREE.Shape();
  pts.forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: Math.max(depth - bevel * 2, 0.01), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: curve });
  g.translate(0, 0, -(depth - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2); // length axis X -> +Z (forward)
  return g;
};
const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
const stripVertexColors = (g, c) => {
  const n = g.attributes.position.count; const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv'); return g;
};
const mergeSafe = (arr) => {
  arr.forEach((g) => { if (g.index) { /* keep */ } });
  const prepared = arr.map((g) => { const c = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'color'].includes(k)) c.deleteAttribute(k); return c; });
  return mergeGeometries(prepared, false);
};

// ---- Shared car materials ----
const darkMat = new THREE.MeshPhysicalMaterial({ color: 0x07090e, roughness: 0.12, metalness: 0.85, clearcoat: 1, clearcoatRoughness: 0.05 });
const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.95, 0.8).multiplyScalar(3.2), toneMapped: false });
const tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.06, 0.04).multiplyScalar(1.1) });
const brakeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.08, 0.06).multiplyScalar(3.4) });
const tireMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.85, metalness: 0.0 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xaab4c4, roughness: 0.25, metalness: 1.0 });
const lightBarRed = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.05, 0.05).multiplyScalar(4) });
const lightBarBlue = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.25, 1).multiplyScalar(4) });
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
export const glowSpriteMat = (color, scale = 1) => new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(color).multiplyScalar(scale), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: true });
const beamMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  uniforms: { uColor: { value: new THREE.Color(1, 0.9, 0.7) } },
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: 'varying vec2 vUv;uniform vec3 uColor;void main(){float f=1.-vUv.y;float side=1.-abs(vUv.x-.5)*2.;float a=pow(f,1.6)*smoothstep(0.,.5,side)*.38;gl_FragColor=vec4(uColor*a,a);}',
});
const underMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  uniforms: { uColor: { value: new THREE.Color(0.2, 0.9, 1) } },
  vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: 'varying vec2 vUv;uniform vec3 uColor;void main(){vec2 q=(vUv-.5)*2.;float d=length(q*vec2(.9,.75));float a=smoothstep(1.,.2,d)*.55;gl_FragColor=vec4(uColor*a*1.5,a);}',
});

const WHEEL_R = 0.35;
function wheelPair(track, y) {
  const parts = [];
  for (const s of [-1, 1]) {
    const t = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.26, 20); t.rotateZ(Math.PI / 2); t.translate(s * track, y, 0); parts.push(t);
  }
  const tires = mergeSafe(parts);
  const rp = [];
  for (const s of [-1, 1]) {
    const r = new THREE.CylinderGeometry(WHEEL_R * 0.66, WHEEL_R * 0.66, 0.28, 10); r.rotateZ(Math.PI / 2); r.translate(s * (track + 0.005), y, 0); rp.push(r);
    for (let k = 0; k < 5; k++) { const sp = new THREE.BoxGeometry(0.03, WHEEL_R * 1.3, 0.05); sp.rotateX((k / 5) * Math.PI); sp.translate(s * (track + 0.15 * s * 0.1 + 0.02 * s), y, 0); rp.push(sp); }
  }
  return { tires, rims: mergeSafe(rp) };
}

export const CAR_SPECS = {
  sedan: { L: 4.7, W: 1.88, belt: 0.95, roof: 1.46, wb: 1.4, cab: [-1.25, -0.8, 0.7, 1.15], hood: 0.82, mass: 1.0, maxSpeed: 46, accel: 17, grip: 7.5, hp: 100, track: 0.8 },
  sport: { L: 4.5, W: 1.95, belt: 0.78, roof: 1.2, wb: 1.38, cab: [-1.1, -0.55, 0.55, 1.1], hood: 0.62, mass: 0.9, maxSpeed: 62, accel: 26, grip: 9, hp: 85, track: 0.85 },
  suv: { L: 4.9, W: 2.0, belt: 1.12, roof: 1.78, wb: 1.5, cab: [-2.0, -1.8, 0.8, 1.35], hood: 1.02, mass: 1.35, maxSpeed: 40, accel: 14, grip: 6.5, hp: 140, track: 0.88 },
  truck: { L: 6.3, W: 2.2, belt: 1.2, roof: 2.9, wb: 2.0, cab: [-0.2, -0.1, 2.1, 2.45], hood: 1.0, mass: 2.4, maxSpeed: 31, accel: 9, grip: 5.2, hp: 220, track: 0.95, boxy: true },
};

function buildFerrari(color, opts) {
  const sp = CAR_SPECS.sport, { L, W } = sp, hl = L / 2;
  const group = new THREE.Group();
  const fm = buildFerrariModel(color);
  group.add(fm.wrap);
  const dummy = () => new THREE.Object3D();
  const ug = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.7, L * 1.35), underMat.clone());
  ug.rotation.x = -Math.PI / 2; ug.position.y = 0.06; ug.material.uniforms.uColor.value = new THREE.Color(...(opts.glow || [0.2, 0.9, 1])); ug.renderOrder = 1; group.add(ug);
  const beams = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.35, 17), beamMat);
  beams.rotation.x = -Math.PI / 2; beams.position.set(0, 0.07, hl + 8.5); beams.renderOrder = 1; group.add(beams);
  const headSprMat = glowSpriteMat(0xfff0cc, 1.4), tailSprMat = glowSpriteMat(0xff1a10, 1.1);
  const sprites = []; const spr = (x, y, z, mat, s) => { const t = new THREE.Sprite(mat); t.position.set(x, y, z); t.scale.setScalar(s); group.add(t); return t; };
  const hs = [spr(-0.68, 0.62, hl - 0.05, headSprMat, 0.9), spr(0.68, 0.62, hl - 0.05, headSprMat, 0.9)];
  const ts = [spr(-0.7, 0.8, -hl + 0.05, tailSprMat, 0.5), spr(0.7, 0.8, -hl + 0.05, tailSprMat, 0.5)];
  const brake = new THREE.Group();
  for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.04), brakeMat); m.position.set(s * 0.62, 0.84, -hl + 0.04); brake.add(m); }
  brake.visible = false; group.add(brake);
  return {
    group, spec: sp, paint: fm.bodyMesh, dark: dummy(), head: dummy(), tail: dummy(), brake, front: dummy(), rear: dummy(), fa: dummy(), ra: dummy(), ug, beams,
    headSprites: hs, tailSprites: ts, siren: null, wheelR: 0.36, steerPivot: null,
    syncWheels(spin, steer) { setFerrariWheels(fm.wheels, spin, steer); },
  };
}

export function buildCar(type, color, opts = {}) {
  // the 190k-triangle glTF is reserved for the player's own car; ambient traffic uses the procedural model
  if (type === 'sport' && A.ok && !opts.police && opts.hero) return buildFerrari(color, opts);
  const sp = CAR_SPECS[type];
  const { L, W, belt, roof, hood } = sp;
  const hl = L / 2;
  const group = new THREE.Group();
  const paintGeo = [], darkGeo = [], lightGeo = [], brakeGeo = [];
  // lower body silhouette
  let lower, cabin;
  if (sp.boxy) {
    // truck: cab at front, cargo box behind
    lower = [[-hl, 0.32], [-hl, 0.95], [hl - 1.9, 0.98], [hl - 1.9, 1.15], [hl - 0.5, 1.05], [hl - 0.12, 0.85], [hl, 0.62], [hl, 0.32]];
    paintGeo.push(shapeGeo(lower, W * 0.96, 0.07));
    // cab
    const cab = [[hl - 2.5, 1.1], [hl - 2.5, 2.4], [hl - 2.15, 2.62], [hl - 0.95, 2.62], [hl - 0.25, 1.4], [hl - 0.25, 1.1]];
    paintGeo.push(shapeGeo(cab, W * 0.94, 0.07));
    const glass = [[hl - 2.0, 1.75], [hl - 1.8, 2.4], [hl - 1.05, 2.4], [hl - 0.5, 1.75]];
    darkGeo.push(shapeGeo(glass, W * 0.97, 0.01));
    // cargo box
    const bx = box(W * 0.98, 2.2, 3.5, 0, 2.05, -hl + 1.85); paintGeo.push(bx);
    darkGeo.push(box(W * 0.99, 0.12, 3.52, 0, 0.98, -hl + 1.85));
  } else {
    lower = [[-hl, 0.32], [-hl, belt - 0.25], [-hl + 0.25, belt], [hl * 0.35, belt + 0.02], [hl - 0.85, hood + 0.1], [hl - 0.12, hood - 0.08], [hl, hood - 0.3], [hl, 0.32]];
    if (type === 'suv') lower = [[-hl, 0.35], [-hl, belt - 0.1], [-hl + 0.15, belt + 0.05], [hl * 0.4, belt + 0.05], [hl - 0.9, hood + 0.08], [hl - 0.1, hood - 0.05], [hl, hood - 0.4], [hl, 0.35]];
    paintGeo.push(shapeGeo(lower, W, 0.08));
    const [c0, c1, c2, c3] = sp.cab;
    cabin = type === 'suv'
      ? [[-hl + 0.12, belt + 0.02], [-hl + 0.3, roof], [c2 + 0.1, roof], [c3, belt + 0.02]]
      : [[c0, belt + 0.02], [c1, roof], [c2, roof], [c3, belt + 0.02]];
    darkGeo.push(shapeGeo(cabin, W * 0.9, 0.012));
    // roof slab and pillars (paint)
    const rx0 = type === 'suv' ? -hl + 0.3 : c1, rx1 = type === 'suv' ? c2 + 0.1 : c2;
    paintGeo.push(box(W * 0.9, 0.07, rx1 - rx0 + 0.08, 0, roof + 0.02, (rx0 + rx1) / 2));
    for (const s of [-1, 1]) {
      const g1 = box(0.07, roof - belt, 0.09, s * W * 0.45, (roof + belt) / 2, (type === 'suv' ? -hl + 0.3 : c1)); g1.rotateX(0); paintGeo.push(g1);
      const g2 = box(0.07, roof - belt, 0.09, s * W * 0.45, (roof + belt) / 2, c2 + 0.05); paintGeo.push(g2);
      paintGeo.push(box(0.07, roof - belt, 0.08, s * W * 0.45, (roof + belt) / 2, (rx0 + c2) / 2 + 0.1));
    }
  }
  // bumpers / grille / splitter / mirrors / skirts
  darkGeo.push(box(W * 0.96, 0.22, 0.2, 0, 0.42, hl - 0.02));
  darkGeo.push(box(W * 0.96, 0.22, 0.2, 0, 0.42, -hl + 0.02));
  darkGeo.push(box(W * 0.5, 0.12, 0.06, 0, hood - 0.36, hl + 0.01));
  darkGeo.push(box(W * 0.98, 0.1, L * 0.55, 0, 0.3, 0));
  for (const s of [-1, 1]) darkGeo.push(box(0.12, 0.1, 0.18, s * (W / 2 + 0.04), belt + 0.12, sp.boxy ? hl - 2.4 : sp.cab[2] * 0.5 + 0.2));
  // lights
  const hy = type === 'truck' ? 0.78 : hood - 0.28;
  for (const s of [-1, 1]) {
    lightGeo.push(box(0.38, 0.1, 0.05, s * (W / 2 - 0.34), hy, hl + 0.01));
    brakeGeo.push(box(0.4, 0.1, 0.05, s * (W / 2 - 0.3), belt - 0.18, -hl - 0.005));
  }
  brakeGeo.push(box(W * 0.55, 0.04, 0.04, 0, belt - 0.18, -hl - 0.005));
  const paintMat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, metalness: 0.65, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.6 });
  const paint = new THREE.Mesh(mergeSafe(paintGeo), paintMat);
  const dark = new THREE.Mesh(mergeSafe(darkGeo), darkMat);
  const head = new THREE.Mesh(mergeSafe(lightGeo), headMat);
  const tail = new THREE.Mesh(mergeSafe(brakeGeo), tailMat);
  const brake = new THREE.Mesh(mergeSafe(brakeGeo), brakeMat); brake.visible = false;
  for (const m of [paint, dark]) { m.castShadow = true; m.receiveShadow = false; }
  group.add(paint, dark, head, tail, brake);

  // wheels
  const wr = WHEEL_R;
  const front = new THREE.Group(), rear = new THREE.Group();
  const wp = wheelPair(W / 2 - 0.1, 0);
  const mkAxle = () => { const g = new THREE.Group(); const t = new THREE.Mesh(wp.tires, tireMat), r = new THREE.Mesh(wp.rims, rimMat); t.castShadow = true; g.add(t, r); return g; };
  const fa = mkAxle(), ra = mkAxle();
  front.add(fa); rear.add(ra);
  front.position.set(0, wr, sp.wb * (sp.boxy ? 1.55 : 1.0) * (sp.boxy ? 1 : 1)); rear.position.set(0, wr, -sp.wb * (sp.boxy ? 1.0 : 1.0));
  if (sp.boxy) { front.position.z = hl - 1.1; rear.position.z = -hl + 1.4; }
  group.add(front, rear);

  // underglow + beams + sprites
  const ug = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.7, L * 1.35), underMat.clone());
  ug.rotation.x = -Math.PI / 2; ug.position.y = 0.06; ug.material.uniforms.uColor.value = new THREE.Color(...(opts.glow || [0.2, 0.9, 1]));
  ug.renderOrder = 1; group.add(ug);
  const beams = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.35, 17), beamMat);
  beams.rotation.x = -Math.PI / 2; beams.position.set(0, 0.07, hl + 8.5); beams.renderOrder = 1; group.add(beams);
  const sprites = [];
  const spr = (x, y, z, mat, s) => { const sp2 = new THREE.Sprite(mat); sp2.position.set(x, y, z); sp2.scale.setScalar(s); group.add(sp2); sprites.push(sp2); return sp2; };
  const headSprMat = glowSpriteMat(0xfff0cc, 1.4), tailSprMat = glowSpriteMat(0xff1a10, 1.1);
  const hs = [spr(-(W / 2 - 0.34), hy, hl + 0.2, headSprMat, 0.9), spr(W / 2 - 0.34, hy, hl + 0.2, headSprMat, 0.9)];
  const ts = [spr(-(W / 2 - 0.3), belt - 0.18, -hl - 0.2, tailSprMat, 0.5), spr(W / 2 - 0.3, belt - 0.18, -hl - 0.2, tailSprMat, 0.5)];

  // siren bar
  let siren = null;
  if (opts.police) {
    const bar = new THREE.Group();
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.28), lightBarRed), b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.28), lightBarBlue);
    r.position.x = -0.35; b.position.x = 0.35; bar.add(r, b); bar.position.set(0, roof + 0.12, 0.1);
    const rs = new THREE.Sprite(glowSpriteMat(0xff2020, 3)), bs = new THREE.Sprite(glowSpriteMat(0x2060ff, 3));
    rs.position.set(-0.4, roof + 0.3, 0.1); bs.position.set(0.4, roof + 0.3, 0.1); rs.scale.setScalar(3); bs.scale.setScalar(3);
    group.add(bar, rs, bs);
    siren = { r, b, rs, bs };
  }
  if (opts.taxi) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.28), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.85, 0.3).multiplyScalar(2.2) }));
    t.position.set(0, roof + 0.16, 0.1); group.add(t);
  }
  return {
    group, spec: sp, paint, dark, head, tail, brake, front, rear, fa, ra, ug, beams, headSprites: hs, tailSprites: ts, siren,
    wheelR: wr, steerPivot: front,
  };
}

// ---- Character ----
const skinTones = [0xf1c9a5, 0xd9a47c, 0xb67b55, 0x8a5a3c, 0x6a4430, 0xeabf9a];
const matCache = new Map();
const stdMat = (color, rough = 0.7, metal = 0.0, emissive = 0, ei = 0) => {
  const k = `${color}|${rough}|${metal}|${emissive}|${ei}`;
  let m = matCache.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, emissive, emissiveIntensity: ei }); matCache.set(k, m); }
  return m;
};
const capsuleGeo = new THREE.CapsuleGeometry(0.1, 0.5, 4, 8);
const headGeo = new THREE.SphereGeometry(0.13, 14, 12);
const torsoGeo = new THREE.CapsuleGeometry(0.19, 0.38, 4, 10);
const gunBody = new THREE.BoxGeometry(0.05, 0.1, 0.22), gunBarrel = new THREE.BoxGeometry(0.035, 0.035, 0.12);
const rifleBody = new THREE.BoxGeometry(0.06, 0.1, 0.55), rifleBarrel = new THREE.BoxGeometry(0.03, 0.03, 0.3), rifleStock = new THREE.BoxGeometry(0.05, 0.13, 0.2), rifleMag = new THREE.BoxGeometry(0.04, 0.16, 0.07);

function makeGuns() {
  const gunMat = stdMat(0x15171d, 0.35, 0.9), accent = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.9, 1).multiplyScalar(2.5), toneMapped: false });
  const pistol = new THREE.Group(); { const b = new THREE.Mesh(gunBody, gunMat); b.position.z = 0.1; const br = new THREE.Mesh(gunBarrel, gunMat); br.position.set(0, 0.03, 0.22); const st = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.02, 0.2), accent); st.position.set(0, 0.052, 0.1); pistol.add(b, br, st); }
  const rifle = new THREE.Group(); { const b = new THREE.Mesh(rifleBody, gunMat); b.position.z = 0.22; const br = new THREE.Mesh(rifleBarrel, gunMat); br.position.set(0, 0.02, 0.62); const sk = new THREE.Mesh(rifleStock, gunMat); sk.position.set(0, -0.01, -0.1); const mg = new THREE.Mesh(rifleMag, gunMat); mg.position.set(0, -0.12, 0.25); const st = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.015, 0.4), accent); st.position.set(0, 0.058, 0.25); rifle.add(b, br, sk, mg, st); }
  rifle.visible = false;
  return { pistol, rifle };
}

export function buildHuman(o = {}) {
  if (A.ok) return buildSoldier(o, makeGuns);
  const skin = o.skin ?? skinTones[Math.floor(Math.random() * skinTones.length)];
  const top = o.top ?? new THREE.Color().setHSL(Math.random(), 0.45, 0.22).getHex();
  const pants = o.pants ?? new THREE.Color().setHSL(Math.random(), 0.2, 0.12).getHex();
  const trim = o.trim ?? null;
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const topM = stdMat(top, 0.6, 0.05), pantM = stdMat(pants, 0.8), skinM = stdMat(skin, 0.55);
  const torso = new THREE.Mesh(torsoGeo, topM); torso.position.y = 1.18; torso.scale.set(1, 1, 0.78); body.add(torso);
  const head = new THREE.Mesh(headGeo, skinM); head.position.y = 1.67; body.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.138, 12, 8, 0, TAU, 0, Math.PI * 0.55), stdMat(o.hair ?? 0x15110f, 0.5)); hair.position.y = 1.68; hair.rotation.x = -0.15; body.add(hair);
  if (o.cap) { const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.15, 0.09, 12), stdMat(o.cap, 0.6)); cap.position.y = 1.78; body.add(cap); const brim = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.14), stdMat(o.cap, 0.6)); brim.position.set(0, 1.74, 0.13); body.add(brim); }
  if (o.visor) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.045, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(...o.visor).multiplyScalar(3), toneMapped: false })); v.position.set(0, 1.69, 0.115); body.add(v); }
  if (trim) {
    const tm = new THREE.MeshBasicMaterial({ color: new THREE.Color(...trim).multiplyScalar(2.6), toneMapped: false });
    const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.55, 0.02), tm); s1.position.set(0, 1.18, -0.16); body.add(s1);
    const s2 = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.025, 0.02), tm); s2.position.set(0, 1.3, -0.16); body.add(s2);
  }
  const mkLimb = (x, y, mat, len = 1) => { const j = new THREE.Group(); j.position.set(x, y, 0); const m = new THREE.Mesh(capsuleGeo, mat); m.position.y = -0.3 * len; m.scale.y = len; j.add(m); body.add(j); return j; };
  const armL = mkLimb(-0.27, 1.42, topM, 0.9), armR = mkLimb(0.27, 1.42, topM, 0.9);
  const legL = mkLimb(-0.1, 0.9, pantM, 1.2), legR = mkLimb(0.1, 0.9, pantM, 1.2);
  armL.children[0].scale.x = armL.children[0].scale.z = 0.85; armR.children[0].scale.x = armR.children[0].scale.z = 0.85;
  for (const l of [legL, legR]) { const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.24), stdMat(0x0a0a0c, 0.4)); shoe.position.set(0, -0.72, 0.05); l.add(shoe); }
  // hand slot with weapon
  const hand = new THREE.Group(); hand.position.set(0, -0.55, 0); armR.add(hand);
  const { pistol, rifle } = makeGuns();
  hand.add(pistol, rifle);
  hand.rotation.x = Math.PI / 2; // gun points forward when arm raised
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.03, 0.3); hand.add(muzzle);
  g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
  return { group: g, body, torso, head, armL, armR, legL, legR, hand, pistol, rifle, muzzle, skin };
}
