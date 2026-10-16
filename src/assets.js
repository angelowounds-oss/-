import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import characterB64 from '../assets/character_game.glb';
import ferrariB64 from '../assets/ferrari.glb';
import hydrantB64 from '../assets/props/fire_hydrant.glb';
import trashB64 from '../assets/props/metal_trash_can.glb';
import boxB64 from '../assets/props/utility_box_01.glb';
import bagB64 from '../assets/props/trashbag.glb';
import plantB64 from '../assets/props/potted_plant_01.glb';
import sniperMagB64 from '../assets/props/sniper_mag.glb';
import livingB64 from '../assets/props/living_set.glb';
import streetPropsB64 from '../assets/props/street_props.glb';
import streetSignsB64 from '../assets/props/street_signs.glb';
import pistolB64 from '../assets/props/pistol.glb';
import furnitureB64 from '../assets/interior/furniture.glb';
import res01B64 from '../assets/res/res_01.glb';
import res02B64 from '../assets/res/res_02.glb';
import res03B64 from '../assets/res/res_03.glb';
import res04B64 from '../assets/res/res_04.glb';
import res05B64 from '../assets/res/res_05.glb';
import res06B64 from '../assets/res/res_06.glb';
import res07B64 from '../assets/res/res_07.glb';
import res08B64 from '../assets/res/res_08.glb';
import res09B64 from '../assets/res/res_09.glb';
import res10B64 from '../assets/res/res_10.glb';

// Embedded CC assets: the player character (assets/Character.glb, rig adapted below) and Ferrari 458 (CC-BY 4.0, vicent091036).
// assets/Soldier.glb (three.js examples, Mixamo rig) is kept in the repo but is no longer embedded.

// Character rig: source bone name -> the Mixamo-style name the game code uses (the 'mixamorig' prefix is stripped at lookup).
const RIG = {
  root: 'Root', pelvis: 'Hips', spine_01: 'Spine', spine_02: 'Spine1', spine_03: 'Spine2', neck_01: 'Neck', head: 'Head',
  clavicle_l: 'LeftShoulder', upperarm_l: 'LeftArm', lowerarm_l: 'LeftForeArm', hand_l: 'LeftHand',
  clavicle_r: 'RightShoulder', upperarm_r: 'RightArm', lowerarm_r: 'RightForeArm', hand_r: 'RightHand',
  thigh_l: 'LeftUpLeg', calf_l: 'LeftLeg', foot_l: 'LeftFoot', ball_l: 'LeftToeBase',
  thigh_r: 'RightUpLeg', calf_r: 'RightLeg', foot_r: 'RightFoot', ball_r: 'RightToeBase',
};
// Game clip name -> clip in the character file (the UAL-style names the game plays)
const CLIPS = {
  Idle: 'Idle_A', Walk: 'Walk', Run: 'Jog', TPose: 'Rest_Pose',
  U_Idle: 'Idle_A', U_Idle_Talking: 'Idle_Talking', U_Walk: 'Walk', U_Jog_Fwd: 'Jog', U_Sprint: 'Sprint', U_Dance: 'Dance_Simple',
  U_Crouch_Idle: 'Crouch_Idle', U_Crouch_Fwd: 'Crouch_Walk', U_Jump_Start: 'Jump_Start', U_Jump: 'Jump_air', U_Jump_Land: 'Jump_Land', U_Roll: 'Roll',
  U_Swim_Idle: 'Swim_Idle', U_Swim_Fwd: 'Swim_Fwd', U_Sitting_Enter: 'Sitting_Enter', U_Sitting_Idle: 'Sitting_Idle', U_Sitting_Exit: 'Sitting_Exit',
  U_Driving: 'Driving', U_Push: 'Push', U_PickUp_Table: 'PickUp_Table', U_Interact: 'Interact',
  U_Pistol_Idle: 'Pistol_Idle', U_Pistol_Aim_Up: 'Pistol_Aim_Up', U_Pistol_Aim_Neutral: 'Pistol_Aim_Neutral', U_Pistol_Aim_Down: 'Pistol_Aim_Down',
  U_Pistol_Shoot: 'Pistol_Shoot', U_Pistol_Reload: 'Pistol_Reload', U_Punch_Jab: 'Punch_Jab', U_Punch_Cross: 'Punch_Cross',
  U_Hit_Chest: 'Hit_Chest', U_Hit_Head: 'Hit_Head', U_Death01: 'Death_A',
};
// upper-body masks: the pistol UB_* clips are the U_* aim/shoot/reload clips without the legs and root
const LOWER = /^(root|pelvis|thigh_|calf_|foot_|ball_)/;

// Soldier.glb rest-pose world rotations (x, y, z, w) of the bones the game code uses. The character file's bones point their
// local axes elsewhere (150-180 deg apart at rest), so every bone frame is re-expressed to these before the game code touches it.
const SOLDIER_REST = {
  Hips: [0, 1, 0, 0], Spine: [0, 1, 0, 0], Spine1: [0, 1, 0, 0], Spine2: [0, 1, 0, 0], Neck: [0, 1, 0, 0], Head: [0, 1, 0, 0],
  LeftShoulder: [0, 0, -0.707107, -0.707107], LeftArm: [0, 0, -0.707107, -0.707107], LeftForeArm: [0, 0, -0.707107, -0.707107], LeftHand: [0, 0, -0.707107, -0.707107],
  RightShoulder: [0.707107, 0.707107, 0, 0], RightArm: [0.707107, 0.707107, 0, 0], RightForeArm: [0.707107, 0.707107, 0, 0], RightHand: [0.707107, 0.707107, 0, 0],
  LeftUpLeg: [0, 0, -1, 0], LeftLeg: [0, 0, -1, 0], LeftFoot: [0, 0.707107, -0.707107, 0], LeftToeBase: [0, 0.707107, -0.707107, 0],
  RightUpLeg: [0, 0, -1, 0], RightLeg: [0, 0, -1, 0], RightFoot: [0, 0.707107, -0.707107, 0], RightToeBase: [0, 0.707107, -0.707107, 0],
};
const IDENT = new THREE.Quaternion();
// The Soldier file faces -Z and the game turns it by PI to face +Z; the character file already faces +Z, so it needs no turn. Its bone
// frames must therefore equal the Soldier's frames as they stand in the game, i.e. SOLDIER_REST turned by PI about Y.
export const CHARACTER_YAW = 0;
const CHARACTER_SHIFT_Z = 0.09;   // the character's feet centre sits ~0.09 m behind the Soldier's, which the sit / drive / crouch offsets were tuned for
const FACE = new THREE.Quaternion(0, 1, 0, 0);

// Renames the rig to RIG, re-expresses its bone frames to SOLDIER_REST (positions unchanged, so the skin is unchanged too), rewrites
// the clips to match, and keeps only the clips above under their game names (UB_* made as upper-body masks of the U_* clips).
function adaptCharacter(gltf) {
  const scene = gltf.scene; scene.updateMatrixWorld(true);
  const K = new Map(), parentOf = new Map(), w = new THREE.Quaternion();
  scene.traverse((o) => {
    if (o === scene) return;
    if (o.parent && o.parent !== scene) parentOf.set(o.name, o.parent.name);
    const want = RIG[o.name] && SOLDIER_REST[RIG[o.name]];
    if (!want) return;
    o.getWorldQuaternion(w);
    K.set(o.name, w.clone().invert().multiply(FACE.clone().multiply(new THREE.Quaternion().fromArray(want))));
  });
  const kOf = (n) => K.get(n) || IDENT, kParent = (n) => (parentOf.has(n) ? kOf(parentOf.get(n)) : IDENT);
  scene.traverse((o) => {
    if (o === scene) return;
    const kn = kOf(o.name), kp = kParent(o.name).clone().invert();
    o.quaternion.premultiply(kp).multiply(kn);
    o.position.applyQuaternion(kp);
  });
  // the bind matrices keep their world positions and only change frame: inverse' = R(K)^-1 * inverse, so the skin is unchanged
  scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    o.skeleton.bones.forEach((b, i) => { if (K.has(b.name)) o.skeleton.boneInverses[i].premultiply(new THREE.Matrix4().makeRotationFromQuaternion(K.get(b.name).clone().invert())); });
  });
  scene.traverse((o) => { if (RIG[o.name]) o.name = RIG[o.name]; });
  const byName = new Map(gltf.animations.map((c) => [c.name, c]));
  const make = (name, src, upper) => {
    const tracks = [];
    for (const t of src.tracks) {
      const k = t.name.lastIndexOf('.'), node = t.name.slice(0, k), prop = t.name.slice(k + 1);
      if (upper && LOWER.test(node)) continue;
      const nt = t.clone(), kp = kParent(node).clone().invert(), kn = kOf(node), v = nt.values;
      if (prop === 'quaternion') { for (let i = 0; i < v.length; i += 4) { w.fromArray(v, i).premultiply(kp).multiply(kn).toArray(v, i); } }
      else if (prop === 'position') { for (let i = 0; i < v.length; i += 3) { const p = new THREE.Vector3().fromArray(v, i).applyQuaternion(kp); p.toArray(v, i); } }
      nt.name = (RIG[node] || node) + '.' + prop; tracks.push(nt);
    }
    return new THREE.AnimationClip(name, src.duration, tracks);
  };
  const out = [];
  for (const [game, file] of Object.entries(CLIPS)) { const c = byName.get(file); if (c) out.push(make(game, c, false)); }
  for (const game of Object.keys(CLIPS)) if (game.startsWith('U_Pistol_')) { const c = byName.get(CLIPS[game]); if (c) out.push(make('UB_' + game.slice(2), c, true)); }
  gltf.animations = out;
  return gltf;
}

const b64ToBuf = (s) => { const bin = atob(s), n = bin.length, u = new Uint8Array(n); for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
export const A = { soldier: null, ferrari: null, props: null, res: null, ok: false };

export async function loadAssets() {
  const loader = new GLTFLoader();
  try {
    const [s, f] = await Promise.all([loader.parseAsync(b64ToBuf(characterB64), ''), loader.parseAsync(b64ToBuf(ferrariB64), '')]);
    A.soldier = adaptCharacter(s); A.ferrari = f;
    // CC0 Poly Haven street props (decimated, 256px textures); a failure here must not take the characters down with it
    try {
      const src = { fire_hydrant: hydrantB64, metal_trash_can: trashB64, utility_box_01: boxB64, trashbag: bagB64, potted_plant_01: plantB64, sniper_mag: sniperMagB64, living_set: livingB64, street_props: streetPropsB64, street_signs: streetSignsB64, furniture: furnitureB64, pistol: pistolB64 };
      const out = {};
      await Promise.all(Object.entries(src).map(async ([k, b]) => { out[k] = (await loader.parseAsync(b64ToBuf(b), '')).scene; }));
      A.props = out;
    } catch (e) { console.warn('prop load failed', e); }
    try {
      const rs = [res01B64, res02B64, res03B64, res04B64, res05B64, res06B64, res07B64, res08B64, res09B64, res10B64], out = {};
      await Promise.all(rs.map(async (b, k) => { out[k + 1] = (await loader.parseAsync(b64ToBuf(b), '')).scene; }));
      A.res = out;
    } catch (e) { console.warn('skyline load failed', e); }
    const box = new THREE.Box3().setFromObject(A.soldier.scene);
    A.soldierScale = 1.82 / (box.max.y - box.min.y);
    A.ok = true;
  } catch (e) { console.warn('asset load failed, procedural fallback', e); }
  return A.ok;
}

const q = new THREE.Quaternion(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

export function buildSoldier(look = {}, gunParts) {
  const root = skClone(A.soldier.scene);
  const wrap = new THREE.Group(), body = new THREE.Group();
  root.scale.multiplyScalar(A.soldierScale);
  root.rotation.y = CHARACTER_YAW; root.position.z = CHARACTER_SHIFT_Z;
  body.add(root); wrap.add(body);
  const tint = new THREE.Color(look.top ?? 0x445566);
  const skinMats = [];
  const topMats = [];
  const bones = {}, skinMeshes = [];
  root.traverse((o) => {
    if (o.isBone) bones[o.name.replace(/^mixamorig:?/, '')] = o;
    if (o.isMesh) {
      o.castShadow = true; o.frustumCulled = false; skinMeshes.push(o);
      o.material = o.material.clone();
      const m = o.material;
      if (/visor/i.test(o.name)) {
        m.color.set(0x050608); m.emissive = new THREE.Color(...(look.visor || [0.2, 0.9, 1])); m.emissiveIntensity = 2.2; m.roughness = 0.2; m.metalness = 0.8;
      } else {
        m.color.copy(tint).multiplyScalar(3.2); m.roughness = 0.62; m.metalness = 0.05;
        m.emissive = new THREE.Color(look.top ?? 0x445566); m.emissiveIntensity = 0.42; topMats.push(m);
      }
    }
  });
  const mixer = new THREE.AnimationMixer(root);
  const act = {};
  // base clips (idle / walk / run) run permanently at weight 0; the retargeted UAL clips (U_*) and the pistol upper-body clips (UB_*) are created on first use so idle and unarmed actors do not pay for them
  const clipBy = new Map(A.soldier.animations.map((c) => [c.name, c]));
  for (const c of A.soldier.animations) if (c.name !== 'TPose' && !c.name.startsWith('U_') && !c.name.startsWith('UB_')) { act[c.name] = mixer.clipAction(c); act[c.name].play(); act[c.name].weight = 0; }
  const clip = (name) => { if (act[name]) return act[name]; const c = clipBy.get(name); if (!c) return null; const a = (act[name] = mixer.clipAction(c)); a.play(); a.weight = 0; return a; };
  act.Idle.weight = 1;
  mixer.update(Math.random() * 2);
  // weapon mount on right hand
  const hand = bones.RightHand;
  root.updateWorldMatrix(true, true);
  // frustum culling for the skinned body: a fixed sphere (2.6 m around the hips, given in each mesh's own space) holds every animated pose,
  // so people outside the view are no longer skinned and drawn; ragdolls (bones far from the frozen group) switch it off, see Game.cullSkins
  for (const o of skinMeshes) { const inv = o.matrixWorld.clone().invert(); o.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0).applyMatrix4(inv), 2.6 / o.matrixWorld.getMaxScaleOnAxis()); o.frustumCulled = true; }
  const ws = new THREE.Vector3(); hand.getWorldScale(ws);
  const mount = new THREE.Group(); mount.scale.setScalar(1 / ws.x); mount.rotation.set(-Math.PI / 2, 0, Math.PI / 2); mount.position.set(0, 0.06 / ws.x, 0.0);
  hand.add(mount);
  const { pistol, rifle, muzzle } = gunParts();
  mount.add(pistol, rifle);
  const mz = new THREE.Object3D(); mz.position.set(0, 0.03, 0.3); mount.add(mz);
  const stub = () => new THREE.Object3D();
  return {
    group: wrap, body, torso: stub(), head: stub(), armL: stub(), armR: stub(), legL: stub(), legR: stub(), hand: mount, pistol, rifle, muzzle: mz,
    applySit(k) { this.sit = k; },
    setTop(hex) { for (const mm of topMats) { mm.color.set(hex).multiplyScalar(3.2); mm.emissive.set(hex); } },
    // one-shot full-body clip (death, hit reaction): everything else fades out until stopOnce()
    playOnce(name, hold = true) {
      const a = clip(name); if (!a) return false;
      for (const k in act) act[k].weight = 0;
      a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = hold; a.weight = 1; a.enabled = true; a.play(); this.onceName = name; return true;
    },
    stopOnce() { const a = act[this.onceName]; if (a) { a.weight = 0; a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; } this.onceName = null; },
    // long guns live in the body frame (shouldered or low-ready) and both arms reach for them with IK
    rifleOn: false,
    setRifleMode(on) {
      if (on === this.rifleOn) return; this.rifleOn = on;
      if (on) { body.add(rifle); rifle.add(mz); mz.position.set(0, 0.02, 0.82); }
      else { mount.add(rifle); rifle.position.set(0, 0, 0); rifle.quaternion.identity(); mount.add(mz); mz.position.set(0, 0.03, 0.3); }
    },
    // k: aim weight (0 low ready, 1 shouldered); pitch: aim pitch (+ up); o: { recoil, pump 0..1, bolt 0..1, reload 0..1 }
    rifleIK(k, pitch, o = {}) {
      if (!this.rifleOn) return;
      wrap.updateMatrixWorld(true);
      const rs = body.worldToLocal(bones.RightArm.getWorldPosition(new THREE.Vector3())), ls = body.worldToLocal(bones.LeftArm.getWorldPosition(new THREE.Vector3()));
      const rs1 = Math.sign(rs.x - ls.x) || -1, right = new THREE.Vector3(rs1, 0, 0);
      const P = Math.max(-0.9, Math.min(0.9, pitch)) * k - 0.55 * (1 - k) + (o.recoil || 0) * 0.06;
      const f = new THREE.Vector3(0, Math.sin(P), Math.cos(P)), up = new THREE.Vector3(0, Math.cos(P), -Math.sin(P));
      const S = rs.clone().addScaledVector(right, -(0.04 + 0.06 * (1 - k))).add(new THREE.Vector3(0, -0.03 - 0.12 * (1 - k), 0.06 + 0.08 * (1 - k)));
      const p0 = S.clone().addScaledVector(f, 0.1 - (o.recoil || 0) * 0.05);
      rifle.position.copy(p0);
      rifle.quaternion.setFromRotationMatrix(RIFLE_M4.lookAt(f, ORIGIN, up));
      if (o.reload > 0) rifle.rotateZ(-Math.sin(Math.min(1, o.reload * 1.3) * Math.PI) * 0.45);
      rifle.updateMatrixWorld(true);
      const grip = p0.clone().addScaledVector(f, 0.06).addScaledVector(up, -0.07);
      if (o.bolt > 0) { const b = Math.sin(o.bolt * Math.PI); grip.addScaledVector(up, 0.07 * b).addScaledVector(f, -0.1 * b).addScaledVector(right, 0.05 * b); }
      let fore = p0.clone().addScaledVector(f, 0.42 - (o.pump || 0) * 0.13).addScaledVector(up, -0.035);
      if (o.reload > 0) { // left hand: magazine out, to the pouch, new magazine in, back to the handguard
        const u = o.reload, mag = p0.clone().addScaledVector(f, 0.22).addScaledVector(up, -0.13), pouch = new THREE.Vector3(-rs1 * 0.17, 0.98, 0.12);
        const L = (a, b, t) => a.clone().lerp(b, Math.min(1, Math.max(0, t)));
        fore = u < 0.25 ? L(fore, mag, u / 0.25) : u < 0.45 ? L(mag, pouch, (u - 0.25) / 0.2) : u < 0.65 ? L(pouch, mag, (u - 0.45) / 0.2) : u < 0.8 ? mag : L(mag, fore, (u - 0.8) / 0.2);
      }
      const W = (v) => body.localToWorld(v.clone());
      const poleR = W(rs.clone().addScaledVector(right, 0.45).add(new THREE.Vector3(0, -0.8, -0.15)));
      const poleL = W(ls.clone().addScaledVector(right, -0.25).add(new THREE.Vector3(0, -0.9, 0.1)));
      twoBoneIK(bones.RightArm, bones.RightForeArm, bones.RightHand, W(grip), poleR);
      twoBoneIK(bones.LeftArm, bones.LeftForeArm, bones.LeftHand, W(fore), poleL);
    },
    mixer, act, clip, bones, skinMeshes, skinned: true, aim: 0, aimYaw: 0, aimPitch: 0, phase: 0,
    // called after mixer update each frame
    applyPose(pose, pitch) {
      if (this.sit > 0.01 && !this.sitClip) {
        const k2 = this.sit; wrap.updateWorldMatrix(true, false); wrap.getWorldQuaternion(wq);
        const rot2 = (b, axis, ang) => { b.parent.updateWorldMatrix(true, false); b.parent.getWorldQuaternion(pq); pq.invert(); la.copy(axis).applyQuaternion(wq).applyQuaternion(pq).normalize(); qa.setFromAxisAngle(la, ang * k2); b.quaternion.premultiply(qa); };
        rot2(bones.LeftUpLeg, X, AIM.sitThigh); rot2(bones.RightUpLeg, X, AIM.sitThigh); rot2(bones.LeftLeg, X, AIM.sitKnee); rot2(bones.RightLeg, X, AIM.sitKnee);
        body.position.y = -0.5 * k2;
        return;
      }
      body.position.y = 0;
      if (pose < 0.01) return;
      const k = pose;
      wrap.updateWorldMatrix(true, false);
      wrap.getWorldQuaternion(wq);
      const rot = (b, axis, ang) => {
        b.parent.updateWorldMatrix(true, false);
        b.parent.getWorldQuaternion(pq); pq.invert();
        la.copy(axis).applyQuaternion(wq).applyQuaternion(pq).normalize();
        qa.setFromAxisAngle(la, ang * k); b.quaternion.premultiply(qa);
      };
      const up = clamp01(pitch);
      rot(bones.RightArm, X, AIM.rx - up * 0.9); rot(bones.RightArm, Y, AIM.ry);
      rot(bones.RightForeArm, X, AIM.rfx);
      rot(bones.LeftArm, X, AIM.lx - up * 0.9); rot(bones.LeftArm, Y, AIM.ly);
      rot(bones.LeftForeArm, X, AIM.lfx);
      if (bones.Spine1) rot(bones.Spine1, Y, AIM.spine);
    },
  };
}
const wq = new THREE.Quaternion(), pq = new THREE.Quaternion(), la = new THREE.Vector3();
// ---- two-bone IK (world space) ----
const ikA = new THREE.Vector3(), ikB = new THREE.Vector3(), ikD = new THREE.Vector3(), ikE = new THREE.Vector3(), ikN = new THREE.Vector3(), ikQ = new THREE.Quaternion(), ikQ2 = new THREE.Quaternion(), ikPW = new THREE.Quaternion();
// rotate `bone` so that the direction to `child` points at `target`
function aimBone(bone, child, target) {
  bone.getWorldPosition(ikA); child.getWorldPosition(ikB);
  ikD.subVectors(ikB, ikA).normalize(); ikE.subVectors(target, ikA).normalize();
  ikQ.setFromUnitVectors(ikD, ikE);
  bone.getWorldQuaternion(ikQ2); ikQ2.premultiply(ikQ);
  bone.parent.getWorldQuaternion(ikPW); bone.quaternion.copy(ikPW.invert().multiply(ikQ2));
  bone.updateMatrixWorld(true);
}
// upper/lower/end bones reach `target`, elbow bent towards `pole`
function twoBoneIK(up, lo, end, target, pole) {
  const a = up.getWorldPosition(new THREE.Vector3()), b = lo.getWorldPosition(new THREE.Vector3()), c = end.getWorldPosition(new THREE.Vector3());
  const L1 = a.distanceTo(b), L2 = b.distanceTo(c), dist = Math.min(L1 + L2 - 1e-3, Math.max(Math.abs(L1 - L2) + 1e-3, a.distanceTo(target)));
  const d = target.clone().sub(a).normalize();
  const cosA = Math.min(1, Math.max(-1, (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist))), sinA = Math.sqrt(1 - cosA * cosA);
  ikN.subVectors(pole, a); ikN.addScaledVector(d, -ikN.dot(d)); if (ikN.lengthSq() < 1e-8) ikN.set(0, -1, 0); ikN.normalize();
  const elbow = a.clone().addScaledVector(d, L1 * cosA).addScaledVector(ikN, L1 * sinA);
  aimBone(up, lo, elbow);
  aimBone(lo, end, a.clone().addScaledVector(d, dist));
}
const RIFLE_M4 = new THREE.Matrix4(), ORIGIN = new THREE.Vector3();
const clamp01 = (v) => Math.max(-0.7, Math.min(0.7, v));
export const AIM = { sitThigh: -1.45, sitKnee: 1.5, rx: -1.35, ry: 0.35, rfx: -0.2, lx: -1.25, ly: -0.55, lfx: -0.5, spine: 0 };
// ---- Ferrari ----
const glowTexLazy = {};
export function buildFerrariModel(color) {
  const root = A.ferrari.scene.clone(true);
  const wrap = new THREE.Group();
  root.rotation.y = Math.PI; // model faces -Z; game cars face +Z
  wrap.add(root);
  const wheels = {};
  let bodyMesh = null;
  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = o.name !== 'glass';
      if (o.material && o.material.name === 'Body_Color') {
        o.material = o.material.clone(); o.material.color.set(color); o.material.metalness = 0.7; o.material.roughness = 0.22;
        if (o.material.clearcoat !== undefined) o.material.clearcoat = 1;
        bodyMesh = bodyMesh || o;
      }
    }
    if (/^wheel_(fl|fr|rl|rr)$/.test(o.name)) wheels[o.name.slice(6)] = { node: o, base: o.quaternion.clone() };
  });
  // hide interior sound-alike clutter? keep; steering wheel visible through glass
  return { wrap, wheels, bodyMesh };
}
export function setFerrariWheels(w, spin, steer) {
  for (const k of ['fl', 'fr', 'rl', 'rr']) {
    const e = w[k]; if (!e) continue;
    q.copy(e.base);
    qa.setFromAxisAngle(X, -spin); q.multiply(qa);
    if (k[0] === 'f') { qb.setFromAxisAngle(Y, steer); q.premultiply(qb); }
    e.node.quaternion.copy(q);
  }
}
