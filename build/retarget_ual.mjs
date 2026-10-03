// Retargets the Quaternius Universal Animation Library (CC0) clips onto the Mixamo-rigged Soldier.
// World-space delta retarget: for every mapped bone   W_tgt(t) = [W_src(t) * W_src_ref^-1] * W_tgt_ref
// The reference pose is the source's A_TPose clip (frame 0) and the Soldier's rest pose (both arms out), so the A-pose/T-pose
// difference cancels. Hips translation is scaled by the leg-length ratio. Output clips are added to assets/Soldier.glb as "U_<name>".
// usage: node retarget_ual.mjs <UAL1_Standard.glb> [out=../assets/Soldier.glb]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import * as THREE from 'three';
import fs from 'fs';

const SRC = process.argv[2], OUT = process.argv[3] || '../assets/Soldier.glb';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const sdoc = await io.read(SRC), tdoc = await io.read('./Soldier_base.glb');
const CLIPS = ['Idle_Loop', 'Idle_Talking_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop', 'Crouch_Idle_Loop', 'Crouch_Fwd_Loop', 'Jump_Start', 'Jump_Loop', 'Jump_Land',
  'Roll', 'Swim_Idle_Loop', 'Swim_Fwd_Loop', 'Sitting_Enter', 'Sitting_Idle_Loop', 'Sitting_Exit', 'Driving_Loop', 'Push_Loop', 'PickUp_Table', 'Interact',
  'Pistol_Idle_Loop', 'Pistol_Aim_Up', 'Pistol_Aim_Neutral', 'Pistol_Aim_Down', 'Pistol_Shoot', 'Pistol_Reload', 'Punch_Jab', 'Punch_Cross', 'Hit_Chest', 'Hit_Head', 'Death01', 'Dance_Loop'];
const MAP = { pelvis: 'Hips', spine_01: 'Spine', spine_02: 'Spine1', spine_03: 'Spine2', neck_01: 'Neck', Head: 'Head',
  clavicle_l: 'LeftShoulder', upperarm_l: 'LeftArm', lowerarm_l: 'LeftForeArm', hand_l: 'LeftHand',
  clavicle_r: 'RightShoulder', upperarm_r: 'RightArm', lowerarm_r: 'RightForeArm', hand_r: 'RightHand',
  thigh_l: 'LeftUpLeg', calf_l: 'LeftLeg', foot_l: 'LeftFoot', ball_l: 'LeftToeBase',
  thigh_r: 'RightUpLeg', calf_r: 'RightLeg', foot_r: 'RightFoot', ball_r: 'RightToeBase' };
const UPPER = ['Pistol_Idle_Loop', 'Pistol_Aim_Up', 'Pistol_Aim_Neutral', 'Pistol_Aim_Down', 'Pistol_Shoot', 'Pistol_Reload']; // also written as UB_* (spine, head and arms only)
const UPPER_BONES = new Set(['Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand']);
const FPS = 30;
// the two rigs face opposite ways in model space (left arms point to +x vs -x): conjugate the world delta with a 180 deg turn about Y
const FLIP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI), FLIPI = FLIP.clone().invert();

const q = (a) => new THREE.Quaternion(a[0], a[1], a[2], a[3]);
const sRoot = sdoc.getRoot(), tRoot = tdoc.getRoot();
const sJoints = sRoot.listSkins()[0].listJoints(), tJoints = tRoot.listSkins()[0].listJoints();
const sByName = new Map(sJoints.map((j) => [j.getName(), j])), tByName = new Map(tJoints.map((j) => [j.getName().replace('mixamorig:', ''), j]));
for (const v of Object.values(MAP)) if (!tByName.has(v)) throw new Error('missing target bone ' + v);

// ---- generic FK helpers over a joint list (parents outside the list contribute their own node rotation) ----
function parentWorld(node) { // world quaternion/position of the non-joint ancestors
  const chain = []; for (let p = node.getParentNode(); p && p.propertyType === 'Node'; p = p.getParentNode()) chain.unshift(p);
  const m = new THREE.Matrix4();
  for (const p of chain) m.multiply(new THREE.Matrix4().compose(new THREE.Vector3(...p.getTranslation()), q(p.getRotation()), new THREE.Vector3(...p.getScale())));
  return m;
}
function restWorld(joints) { // Map node -> Matrix4 in model space, from rest transforms
  const out = new Map();
  const get = (n) => {
    if (out.has(n)) return out.get(n);
    const par = n.getParentNode(), pm = par && joints.includes(par) ? get(par) : parentWorld(n).clone();
    const m = pm.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(...n.getTranslation()), q(n.getRotation()), new THREE.Vector3(...n.getScale())));
    out.set(n, m); return m;
  };
  joints.forEach(get); return out;
}
const sRest = restWorld(sJoints), tRest = restWorld(tJoints);
const wq = (m) => { const p = new THREE.Vector3(), r = new THREE.Quaternion(), s = new THREE.Vector3(); m.decompose(p, r, s); return r; };
const wp = (m) => new THREE.Vector3().setFromMatrixPosition(m);

// ---- sample a source clip ----
function sampleChannels(anim) {
  const rot = new Map(), pos = new Map();
  for (const ch of anim.listChannels()) {
    const n = ch.getTargetNode(), path = ch.getTargetPath(), s = ch.getSampler();
    const rec = { t: s.getInput().getArray(), v: s.getOutput().getArray(), step: s.getInterpolation() === 'STEP' };
    if (path === 'rotation') rot.set(n, rec); else if (path === 'translation') pos.set(n, rec);
  }
  return { rot, pos };
}
function evalRec(rec, t, size, out) {
  const T = rec.t; let i = 0; while (i < T.length - 2 && t > T[i + 1]) i++;
  const t0 = T[i], t1 = T[Math.min(i + 1, T.length - 1)], k = t1 > t0 ? Math.min(1, Math.max(0, (t - t0) / (t1 - t0))) : 0;
  const a = i * size, b = Math.min(i + 1, T.length - 1) * size;
  if (size === 4) { const qa = new THREE.Quaternion(rec.v[a], rec.v[a + 1], rec.v[a + 2], rec.v[a + 3]), qb = new THREE.Quaternion(rec.v[b], rec.v[b + 1], rec.v[b + 2], rec.v[b + 3]); return rec.step ? qa : qa.slerp(qb, k); }
  return new THREE.Vector3(rec.v[a] + (rec.v[b] - rec.v[a]) * k, rec.v[a + 1] + (rec.v[b + 1] - rec.v[a + 1]) * k, rec.v[a + 2] + (rec.v[b + 2] - rec.v[a + 2]) * k);
}
// world matrices of every source joint at time t
function srcPose(ch, t) {
  const out = new Map();
  const get = (n) => {
    if (out.has(n)) return out.get(n);
    const par = n.getParentNode(), pm = par && sJoints.includes(par) ? get(par) : parentWorld(n).clone();
    const r = ch.rot.has(n) ? evalRec(ch.rot.get(n), t, 4) : q(n.getRotation());
    const p = ch.pos.has(n) ? evalRec(ch.pos.get(n), t, 3) : new THREE.Vector3(...n.getTranslation());
    const m = pm.clone().multiply(new THREE.Matrix4().compose(p, r, new THREE.Vector3(...n.getScale())));
    out.set(n, m); return m;
  };
  sJoints.forEach(get); return out;
}

const anims = new Map(sRoot.listAnimations().map((a) => [a.getName(), a]));
const refAnim = sampleChannels(anims.get('A_TPose')), refPose = srcPose(refAnim, 0);
// target reference = Soldier rest; check both are T-like by reporting the arm directions
const dir = (map, a, b) => wp(map.get(b)).sub(wp(map.get(a))).normalize().toArray().map((x) => +x.toFixed(2)).join(',');
console.log('src ref arm dir (L)', dir(refPose, sByName.get('upperarm_l'), sByName.get('lowerarm_l')), '| src rest', dir(sRest, sByName.get('upperarm_l'), sByName.get('lowerarm_l')),
  '| tgt rest', dir(tRest, tByName.get('LeftArm'), tByName.get('LeftForeArm')));

// hip scale: leg length ratio
const leg = (map, a, b) => wp(map.get(a)).distanceTo(wp(map.get(b)));
const ratio = leg(tRest, tByName.get('LeftUpLeg'), tByName.get('LeftFoot')) / leg(refPose, sByName.get('thigh_l'), sByName.get('foot_l'));
console.log('hip scale', ratio.toFixed(3));

// order target joints parents-first
const order = []; const seen = new Set();
const visit = (n) => { if (seen.has(n)) return; const p = n.getParentNode(); if (p && tJoints.includes(p)) visit(p); seen.add(n); order.push(n); };
tJoints.forEach(visit);
const srcOf = new Map(Object.entries(MAP).map(([s, t]) => [tByName.get(t), sByName.get(s)]));
const tgtHips = tByName.get('Hips'), hipsRestPos = wp(tRest.get(tgtHips)), srcHip = sByName.get('pelvis'), srcHipRef = wp(refPose.get(srcHip));
const tgtHipsParentInv = parentWorld(tgtHips).clone().invert();

const buffer = tRoot.listBuffers()[0] || tdoc.createBuffer();
let added = 0;
for (const [name, upperOnly] of [...CLIPS.map((n) => [n, false]), ...UPPER.map((n) => [n, true])]) {
  const sa = anims.get(name); if (!sa) { console.log('skip (missing)', name); continue; }
  const ch = sampleChannels(sa), dur = Math.max(...sa.listChannels().map((c) => c.getSampler().getInput().getMax([])[0]));
  const nF = Math.max(2, Math.round(dur * FPS) + 1), times = new Float32Array(nF);
  const rots = new Map(order.filter((n) => srcOf.has(n) && (!upperOnly || UPPER_BONES.has(n.getName().replace('mixamorig:', '')))).map((n) => [n, new Float32Array(nF * 4)])), hipsP = new Float32Array(nF * 3);
  for (let f = 0; f < nF; f++) {
    const t = Math.min(dur, f / FPS); times[f] = t;
    const sp = srcPose(ch, t), cur = new Map();
    for (const n of order) {
      const par = n.getParentNode(), pm = par && tJoints.includes(par) ? cur.get(par) : parentWorld(n);
      let local;
      const s = srcOf.get(n);
      if (s) {
        const delta = FLIP.clone().multiply(wq(sp.get(s)).multiply(wq(refPose.get(s)).invert())).multiply(FLIPI);
        const W = delta.multiply(wq(tRest.get(n)));
        local = wq(pm).invert().multiply(W);
        if (rots.has(n)) rots.get(n).set([local.x, local.y, local.z, local.w], f * 4);
      } else local = q(n.getRotation());
      let pos = new THREE.Vector3(...n.getTranslation());
      if (n === tgtHips) {
        const d = wp(sp.get(srcHip)).sub(srcHipRef).multiplyScalar(ratio); d.x = -d.x; d.z = -d.z; const target = hipsRestPos.clone().add(d);
        pos = target.applyMatrix4(tgtHipsParentInv); hipsP.set([pos.x, pos.y, pos.z], f * 3);
      }
      cur.set(n, pm.clone().multiply(new THREE.Matrix4().compose(pos, local, new THREE.Vector3(...n.getScale()))));
    }
  }
  const anim = tdoc.createAnimation((upperOnly ? 'UB_' : 'U_') + name.replace(/_Loop$/, ''));
  const tin = tdoc.createAccessor().setType('SCALAR').setArray(times).setBuffer(buffer);
  for (const [n, arr] of rots) {
    const smp = tdoc.createAnimationSampler().setInput(tin).setOutput(tdoc.createAccessor().setType('VEC4').setArray(arr).setBuffer(buffer)).setInterpolation('LINEAR');
    anim.addSampler(smp).addChannel(tdoc.createAnimationChannel().setTargetNode(n).setTargetPath('rotation').setSampler(smp));
  }
  if (!upperOnly) {
  const smp = tdoc.createAnimationSampler().setInput(tin).setOutput(tdoc.createAccessor().setType('VEC3').setArray(hipsP).setBuffer(buffer)).setInterpolation('LINEAR');
  anim.addSampler(smp).addChannel(tdoc.createAnimationChannel().setTargetNode(tgtHips).setTargetPath('translation').setSampler(smp));
  }
  added++;
}
// drop previous U_ clips on re-run
for (const a of tRoot.listAnimations()) if (a.getName().startsWith('U_') && tRoot.listAnimations().filter((x) => x.getName() === a.getName()).length > 1) { /* duplicates only occur if re-run on an already retargeted file */ }
await io.write(OUT, tdoc);
console.log('clips added', added, 'out MB', (fs.statSync(OUT).size / 1e6).toFixed(2));
