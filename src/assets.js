import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { fetchBytes } from './files.js';
import characterUrl from '../assets/character_game.glb';
import playerUrl from '../assets/player_female.glb';
import ferrariUrl from '../assets/ferrari.glb';
import hydrantUrl from '../assets/props/fire_hydrant.glb';
import trashUrl from '../assets/props/metal_trash_can.glb';
import boxUrl from '../assets/props/utility_box_01.glb';
import bagUrl from '../assets/props/trashbag.glb';
import plantUrl from '../assets/props/potted_plant_01.glb';
import sniperMagUrl from '../assets/props/sniper_mag.glb';
import sniperRifleUrl from '../assets/props/sniper_rifle.glb';
import livingUrl from '../assets/props/living_set.glb';
import streetPropsUrl from '../assets/props/street_props.glb';
import streetSignsUrl from '../assets/props/street_signs.glb';
import pistolUrl from '../assets/props/pistol.glb';
import furnitureUrl from '../assets/interior/furniture.glb';
import res01Url from '../assets/res/res_01.glb';
import res02Url from '../assets/res/res_02.glb';
import res03Url from '../assets/res/res_03.glb';
import res04Url from '../assets/res/res_04.glb';
import res05Url from '../assets/res/res_05.glb';
import res06Url from '../assets/res/res_06.glb';
import res07Url from '../assets/res/res_07.glb';
import res08Url from '../assets/res/res_08.glb';
import res09Url from '../assets/res/res_09.glb';
import res10Url from '../assets/res/res_10.glb';

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
// Life and combat motions from the same character file, played under the game name U_<file name> (gestures, hand work, locomotion variants, climbing, hits,
// fighting, knife and grenade). Gestures in UPPER also get a UB_ mask without the legs and root, so they can play on top of walking and standing.
const MOTIONS = [
  'Greeting', 'Head_Nod', 'Yes', 'Reject', 'Confused', 'Insult', 'Salute', 'Bow', 'Help_One_Arm', 'Help_Two_Arms', 'Idle_Listening', 'Idle_Rail_Call', 'Cheer_One_arm',
  'Cheering_Two_Hands', 'Victory', 'Victory_Fist_Pump', 'Angry', 'Dizzy', 'Idle_ShakeOff', 'Idle_Hurt', 'Shivering', 'Tired_Hunched', 'Kneeling_Tired',
  'Idle_FoldArms', 'Idle_Subtle', 'Idle_TalkingPhone', 'Idle_Lantern', 'Idle_Torch', 'Idle_Rail', 'Meditate', 'Sitting_Talking', 'Sleeping',
  'Throw_Object', 'OverhandThrow', 'Walk_Carry', 'Consume', 'Consume_Item', 'Chest_Open', 'Kick_Breach',
  'Fixing_Kneeling', 'Farm_Harvest', 'Farm_PlantSeed', 'Farm_Watering', 'Chop_Tree', 'Fishing_Cast', 'Fishing_Reel', 'Fishing_Catch', 'Golf_Drive', 'Golf_idle',
  'Jumping_Jacks', 'Pushup', 'Dance_Body_Roll', 'Crawl', 'Crawl_RM', 'LayToIdle', 'Zombie_Rise',
  'Turn_Left_90', 'Turn_Right_90', 'Turn_Left_180', 'Turn_Right_180', 'Walk_Backwards', 'Strafe_left', 'Strafe_right', 'Walk_Formal', 'Walk_Stealth', 'Run_Stealth', 'Walk_Female', 'Run_Female',
  'Climb_Ladder', 'Ladder_Idle', 'Climb_Wall', 'ClimbUp_1m_RM', 'Ledge_Hang', 'Pipe_Climb', 'Jump_2', 'Run_Jump', 'Land_Three_Point',
  'Hit_Knockback', 'Hit_Knockback_RM', 'Defend', 'Death_B', 'Death_C', 'Death_D', 'Fighting_Idle', 'Fighting_Left_Jab', 'Fighting_Right_Jab', 'Melee_Hook', 'Melee_Hook_Rec',
  'Zombie_Idle', 'Zombie_Idle_Crouch', 'Zombie_Walk', 'Zombie_Walk_2', 'Zombie_Scratch', 'Zombie_Yell',
  'Idle_Sword', 'Sword_Regular_A', 'Sword_Regular_B', 'Sword_Regular_C', 'Sword_Attack', 'Sword_Block',
];
const UPPER = new Set(['Greeting', 'Head_Nod', 'Yes', 'Reject', 'Confused', 'Insult', 'Salute', 'Help_One_Arm', 'Help_Two_Arms', 'Idle_Listening', 'Idle_Rail_Call', 'Cheer_One_arm',
  'Cheering_Two_Hands', 'Idle_FoldArms', 'Idle_TalkingPhone', 'Throw_Object', 'OverhandThrow', 'Consume', 'Consume_Item', 'Sword_Regular_A', 'Sword_Regular_B', 'Sword_Regular_C', 'Sword_Attack', 'Sword_Block', 'Defend']);
for (const n of MOTIONS) CLIPS['U_' + n] = n;
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
function adaptCharacter(gltf, clips = gltf.animations) {
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
  const byName = new Map(clips.map((c) => [c.name, c]));
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
  for (const game of Object.keys(CLIPS)) if (game.startsWith('U_Pistol_') || UPPER.has(game.slice(2))) { const c = byName.get(CLIPS[game]); if (c) out.push(make('UB_' + game.slice(2), c, true)); }
  gltf.animations = out;
  return gltf;
}

// CHR-06a (ADR-0035): the leg clips the stand set mixes by direction and speed (forward by speed, then back steps and side steps)
const GAIT = ['Walk', 'Run', 'U_Sprint', 'U_Walk_Backwards', 'U_Strafe_left', 'U_Strafe_right'];
// The locomotion clips walk in place, so the planted foot slides back under the body by as much as the clip carries the body. Measured
// once per body on its template, so the game can play each clip at the pace that holds that foot still on the ground: per clip, at 96 steps
// of its cycle, how far the body goes (`step`, m per whole cycle, as the planted foot slides; in a run's flight the cycle's mean), the
// stride (m per cycle), the way it goes (dir: radians from ahead, + to its left) and the circular mean phase of the left foot's stance
// (off), so clips of different lengths play step for step. The artists' feet do not slide evenly (a side step lunges, then settles), hence
// the table rather than one speed. A foot touches with the lower of its ankle and toe (runs land on the forefoot); it is planted when that
// point is the lower of both feet and within 3 cm of its usual lowest (10th percentile).
function measureGait(S, scale) {
  const scene = S.scene, by = new Map(S.animations.map((c) => [c.name, c])), mixer = new THREE.AnimationMixer(scene), out = {};
  const pts = ['LeftFoot', 'LeftToeBase', 'RightFoot', 'RightToeBase'].map((n) => scene.getObjectByName(n));
  if (pts.some((b) => !b)) return out;
  scene.updateWorldMatrix(true, false);
  const inv = scene.matrixWorld.clone().invert(), v = new THREE.Vector3(), N = 96;
  for (const name of GAIT) {
    const c = by.get(name); if (!c) continue;
    const a = mixer.clipAction(c), dur = c.duration, P = []; a.play();
    for (let i = 0; i <= N; i++) {
      a.time = (i / N) * dur * 0.9999; mixer.update(0);
      P.push(pts.map((b) => { b.updateWorldMatrix(true, false); return v.setFromMatrixPosition(b.matrixWorld).applyMatrix4(inv).multiplyScalar(scale).toArray(); }));
    }
    a.stop(); mixer.uncacheAction(c);
    const lowOf = (p, f) => (p[2 * f][1] < p[2 * f + 1][1] ? 2 * f : 2 * f + 1), h = (p, f) => p[lowOf(p, f)][1];
    const lo = [0, 1].map((f) => { const s = P.map((p) => h(p, f)).sort((p, q) => p - q); return s[(s.length * 0.1) | 0]; });
    const planted = (i, f) => h(P[i], f) <= h(P[i], 1 - f) + 0.005 && h(P[i], f) < lo[f] + 0.03;
    // per step: how the body moves over the planted foot (null in flight); the sum gives the way it goes
    const d = []; let tx = 0, tz = 0, ps = 0, pc = 0, nd = 0;
    for (let i = 0; i < N; i++) {
      if (planted(i, 0)) { ps += Math.sin((i / N) * Math.PI * 2); pc += Math.cos((i / N) * Math.PI * 2); }
      const fs = [0, 1].filter((f) => planted(i, f) && planted(i + 1, f)); if (!fs.length) { d.push(null); continue; }
      const f = fs.length > 1 && h(P[i], 1) < h(P[i], 0) ? 1 : fs[0], b = lowOf(P[i], f);
      const dx = P[i][b][0] - P[i + 1][b][0], dz = P[i][b][2] - P[i + 1][b][2]; d.push([dx, dz]); tx += dx; tz += dz; nd++;
    }
    if (!nd) continue;
    const dir = Math.atan2(tx, tz), ux = Math.sin(dir), uz = Math.cos(dir), mean = Math.hypot(tx, tz) / nd;
    // along the way it goes, flight at the mean, never below a quarter of it (a foot settling back must not stall the clip), lightly smoothed
    const s = d.map((p) => Math.max(mean * 0.25, p ? p[0] * ux + p[1] * uz : mean));
    const step = new Float32Array(N); let stride = 0;
    for (let i = 0; i < N; i++) { step[i] = ((s[(i + N - 1) % N] + 2 * s[i] + s[(i + 1) % N]) / 4) * N; stride += step[i] / N; }
    out[name] = { stride, spd: stride / dur, dir, dur, step, off: ((Math.atan2(ps, pc) / (Math.PI * 2)) % 1 + 1) % 1 };
  }
  mixer.uncacheRoot(scene);
  return out;
}
// CHR-06b (ADR-0035): the turn-in-place clips, measured the same way: how far the pelvis (across the thighs) and the chest (across the
// shoulders) are turned at 48 steps of the clip (radians, + to the body's left) from where they stand in Idle (which stands a little
// bladed, the pelvis 13 deg and the chest 18 deg to the right, while the turns start square), how far the clip turns in all (end), and when
// the turn starts (t0: 4 % of the way) and is done (t1: 96 %), so the game can play just the turn, pick the clip by the way it really
// turns and scale it to fit
const TURNS = ['U_Turn_Left_90', 'U_Turn_Right_90', 'U_Turn_Left_180', 'U_Turn_Right_180'];
function measureTurns(S) {
  const scene = S.scene, by = new Map(S.animations.map((c) => [c.name, c])), mixer = new THREE.AnimationMixer(scene), out = {};
  const pts = ['LeftUpLeg', 'RightUpLeg', 'LeftArm', 'RightArm'].map((n) => scene.getObjectByName(n));
  if (pts.some((b) => !b) || !by.get('Idle')) return out;
  scene.updateWorldMatrix(true, false);
  const inv = scene.matrixWorld.clone().invert(), l = new THREE.Vector3(), r = new THREE.Vector3(), N = 48;
  const yawOf = (lb, rb) => { l.setFromMatrixPosition(lb.matrixWorld).applyMatrix4(inv); r.setFromMatrixPosition(rb.matrixWorld).applyMatrix4(inv); return Math.atan2(l.x - r.x, l.z - r.z) - Math.PI / 2; };
  const pose = (c, t) => { const a = mixer.clipAction(c); a.play(); a.time = t; mixer.update(0); for (const b of pts) b.updateWorldMatrix(true, false); return [yawOf(pts[0], pts[1]), yawOf(pts[2], pts[3]), a]; };
  const idle = pose(by.get('Idle'), 0); idle[2].stop(); mixer.uncacheAction(idle[2].getClip());
  const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
  for (const name of TURNS) {
    const c = by.get(name); if (!c) continue;
    const dur = c.duration, yaw = new Float32Array(N + 1), chest = new Float32Array(N + 1); let a = null;
    for (let i = 0; i <= N; i++) {
      const p = pose(c, (i / N) * dur * 0.9999); a = p[2];
      // unwrapped, from the Idle stance
      yaw[i] = i ? yaw[i - 1] + wrap(p[0] - idle[0] - yaw[i - 1]) : wrap(p[0] - idle[0]);
      chest[i] = i ? chest[i - 1] + wrap(p[1] - idle[1] - chest[i - 1]) : wrap(p[1] - idle[1]);
    }
    a.stop(); mixer.uncacheAction(c);
    const end = yaw[N] - yaw[0], at = (f) => { for (let i = 0; i <= N; i++) if (Math.abs(yaw[i] - yaw[0]) >= Math.abs(end) * f) return (i / N) * dur; return dur; };
    out[name] = { dur, yaw, chest, t0: at(0.04), t1: at(0.96), end };
  }
  mixer.uncacheRoot(scene);
  return out;
}
// CHR-06c (ADR-0035): where the sole is from the foot bones: how high the ankle and the toe joints stand over the lowest point of the skin
// the feet carry, and where that point is from the body's origin (sole: < 0 when the clips stand the feet a little into the ground), in Idle
function measureFeet(S, scale) {
  const scene = S.scene, idle = S.animations.find((c) => c.name === 'Idle'), fb = ['LeftFoot', 'LeftToeBase', 'RightFoot', 'RightToeBase'].map((n) => scene.getObjectByName(n));
  if (!idle || fb.some((b) => !b)) return null;
  const mixer = new THREE.AnimationMixer(scene), a = mixer.clipAction(idle); a.play(); mixer.update(0); scene.updateMatrixWorld(true);
  const inv = scene.matrixWorld.clone().invert(), v = new THREE.Vector3(); let sole = Infinity;
  scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const G = o.geometry.attributes, ids = fb.map((b) => o.skeleton.bones.indexOf(b));
    for (let i = 0; i < G.position.count; i++) {
      let w = 0; for (let k = 0; k < 4; k++) if (ids.includes(G.skinIndex.getComponent(i, k))) w += G.skinWeight.getComponent(i, k);
      if (w < 0.5) continue;
      o.getVertexPosition(i, v); o.localToWorld(v).applyMatrix4(inv); if (v.y < sole) sole = v.y;
    }
  });
  const y = (b) => v.setFromMatrixPosition(b.matrixWorld).applyMatrix4(inv).y;
  const out = sole < Infinity ? { ankle: ((y(fb[0]) + y(fb[2])) / 2 - sole) * scale, toe: ((y(fb[1]) + y(fb[3])) / 2 - sole) * scale, sole: sole * scale } : null;
  a.stop(); mixer.uncacheRoot(scene);
  return out;
}

export const A = { soldier: null, player: null, ferrari: null, props: null, res: null, ok: false };

export async function loadAssets() {
  const loader = new GLTFLoader();
  const load = async (url) => loader.parseAsync(await fetchBytes(url), '');   // the build ships each model as its own file (files.js)
  try {
    const [s, f] = await Promise.all([load(characterUrl), load(ferrariUrl)]);
    const rawClips = s.animations;
    A.soldier = adaptCharacter(s); A.ferrari = f;
    // the player's own body: the same rig and bind pose with a different mesh (build/fit_female.mjs), so every clip plays on it; a failure keeps the shared body
    try { A.player = adaptCharacter(await load(playerUrl), rawClips); } catch (e) { console.warn('player body failed', e); }
    // CC0 Poly Haven street props (decimated, 256px textures); a failure here must not take the characters down with it
    try {
      const src = { fire_hydrant: hydrantUrl, metal_trash_can: trashUrl, utility_box_01: boxUrl, trashbag: bagUrl, potted_plant_01: plantUrl, sniper_mag: sniperMagUrl, sniper_rifle: sniperRifleUrl, living_set: livingUrl, street_props: streetPropsUrl, street_signs: streetSignsUrl, furniture: furnitureUrl, pistol: pistolUrl };
      const out = {};
      await Promise.all(Object.entries(src).map(async ([k, b]) => { out[k] = (await load(b)).scene; }));
      A.props = out;
    } catch (e) { console.warn('prop load failed', e); }
    try {
      const rs = [res01Url, res02Url, res03Url, res04Url, res05Url, res06Url, res07Url, res08Url, res09Url, res10Url], out = {};
      await Promise.all(rs.map(async (b, k) => { out[k + 1] = (await load(b)).scene; }));
      A.res = out;
    } catch (e) { console.warn('skyline load failed', e); }
    const box = new THREE.Box3().setFromObject(A.soldier.scene);
    A.soldierScale = 1.82 / (box.max.y - box.min.y);
    if (A.player) { const pb = new THREE.Box3().setFromObject(A.player.scene); A.playerScale = 1.82 / (pb.max.y - pb.min.y); }
    // after the boxes: these pose the templates
    for (const [S, s] of [[A.soldier, A.soldierScale], [A.player, A.playerScale]]) if (S) { S.gait = measureGait(S, s); S.turn = measureTurns(S); S.feet = measureFeet(S, s); }
    A.ok = true;
  } catch (e) { console.warn('asset load failed, procedural fallback', e); }
  return A.ok;
}

const q = new THREE.Quaternion(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

export function buildSoldier(look = {}, gunParts) {
  const S = look.player && A.player ? A.player : A.soldier, scale = S === A.player ? A.playerScale : A.soldierScale;
  const root = skClone(S.scene);
  const wrap = new THREE.Group(), body = new THREE.Group();
  root.scale.multiplyScalar(scale);
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
      if (m.name === 'Female') { m.roughness = 0.7; m.metalness = 0; m.emissive = new THREE.Color(0x151a22); m.emissiveIntensity = 0.5; }   // vertex-coloured body: keeps its own colours
      else if (/visor/i.test(o.name)) {
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
  const clipBy = new Map(S.animations.map((c) => [c.name, c]));
  for (const c of S.animations) if (c.name !== 'TPose' && !c.name.startsWith('U_') && !c.name.startsWith('UB_')) { act[c.name] = mixer.clipAction(c); act[c.name].play(); act[c.name].weight = 0; }
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
  // hand-held melee tools reuse the pistol's material (same shader program, so showing one never compiles anything); built on first use
  let meleeMesh = null, meleeName = null;
  const gunMat = (() => { let mm = null; pistol.traverse((o) => { if (!mm && o.isMesh) mm = o.material; }); return mm; })();
  const meleeShape = (name) => {
    const g = new THREE.Group(), box = (x, y, z, px, py, pz) => { const o = new THREE.Mesh(new THREE.BoxGeometry(x, y, z), gunMat); o.position.set(px, py, pz); o.castShadow = true; g.add(o); };
    if (name === '단검') { box(0.026, 0.012, 0.1, 0, 0.03, 0.02); box(0.018, 0.004, 0.19, 0, 0.03, 0.17); }
    else if (name === '방망이') { box(0.03, 0.03, 0.2, 0, 0.03, 0.05); box(0.075, 0.075, 0.5, 0, 0.03, 0.4); }
    else { box(0.026, 0.026, 0.62, 0, 0.03, 0.26); box(0.026, 0.08, 0.04, 0, 0.03, 0.57); }
    return g;
  };
  // gesture props (phone, cup, food ...) share the same material for the same reason; each shape is built once on first use
  let propMesh = null, propName = null; const propCache = {};
  const propShape = (name) => {
    const g = new THREE.Group(), box = (x, y, z, px, py, pz) => { const o = new THREE.Mesh(new THREE.BoxGeometry(x, y, z), gunMat); o.position.set(px, py, pz); g.add(o); };
    if (name === 'phone') box(0.04, 0.012, 0.08, 0, 0.04, 0.03);
    else if (name === 'cup') box(0.05, 0.05, 0.09, 0, 0.04, 0.03);
    else if (name === 'food') box(0.06, 0.04, 0.06, 0, 0.04, 0.03);
    else if (name === 'lantern') { box(0.1, 0.1, 0.14, 0, 0.04, 0.0); box(0.02, 0.02, 0.1, 0, 0.04, 0.12); }
    else if (name === 'torch') box(0.03, 0.03, 0.3, 0, 0.04, 0.12);
    else if (name === 'box') box(0.3, 0.2, 0.2, 0, 0.12, 0.1);
    else box(0.03, 0.03, 0.26, 0, 0.04, 0.1);
    return g;
  };
  const stub = () => new THREE.Object3D();
  const hipChain = [bones.Hips, bones.Spine, bones.Spine1, bones.Spine2], turned = hipChain.map(() => new THREE.Quaternion());
  const legChain = [bones.LeftUpLeg, bones.LeftLeg, bones.LeftFoot, bones.RightUpLeg, bones.RightLeg, bones.RightFoot], legQ = legChain.map(() => new THREE.Quaternion());
  // bones a procedural pose turned after the mixer (keep), with the clips' turn to put back before the next mixer update
  const keptB = [], keptQ = []; let kept = 0;
  const keep = (b) => { for (let i = 0; i < kept; i++) if (keptB[i] === b) return; if (!keptQ[kept]) keptQ[kept] = new THREE.Quaternion(); keptB[kept] = b; keptQ[kept++].copy(b.quaternion); };
  return {
    group: wrap, body, torso: stub(), head: stub(), armL: stub(), armR: stub(), legL: stub(), legR: stub(), hand: mount, pistol, rifle, muzzle: mz,
    applySit(k) { this.sit = k; },
    setMelee(name) {
      if (name === meleeName) return; meleeName = name;
      if (meleeMesh) { mount.remove(meleeMesh); meleeMesh = null; }
      if (name) { meleeMesh = meleeShape(name); mount.add(meleeMesh); }
    },
    setProp(name) {
      if (name === propName) return; propName = name; this.prop = name;
      if (propMesh) { mount.remove(propMesh); propMesh = null; }
      if (name) { propMesh = propCache[name] || (propCache[name] = propShape(name)); mount.add(propMesh); }
    },
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
    // CHR-06a/b (ADR-0035): orientation warp. Turns the hips (so both legs) by `ang` about the vertical and the spine back by `back` over
    // its three bones, so the legs step the way the body goes (or stay planted while it turns) while the chest and arms face where it looks
    turnHips(ang, back = ang) {
      for (let i = 0; i < 4; i++) turned[i].copy(hipChain[i].quaternion); this.hipsTurned = true;
      const r = (b, a) => { b.parent.updateWorldMatrix(true, false); b.parent.getWorldQuaternion(pq).invert(); la.copy(Y).applyQuaternion(pq).normalize(); qa.setFromAxisAngle(la, a); b.quaternion.premultiply(qa); };
      r(bones.Hips, ang); r(bones.Spine, -back * 0.4); r(bones.Spine1, -back * 0.3); r(bones.Spine2, -back * 0.3);
    },
    // before the mixer runs: the mixer writes a bone only when its blended value changed since its last frame, so under a held clip last
    // frame's turn would stay and this frame's would add to it; put back the pose the clips gave
    unturnHips() {
      // the last turned first: the leg IK, then the poses kept, then the hips' turn
      if (this.legsMoved) { for (let i = 0; i < 6; i++) legChain[i].quaternion.copy(legQ[i]); this.legsMoved = false; }
      while (kept > 0) { kept--; keptB[kept].quaternion.copy(keptQ[kept]); }
      if (this.hipsTurned) { for (let i = 0; i < 4; i++) hipChain[i].quaternion.copy(turned[i]); this.hipsTurned = false; }
    },
    // CHR-06d (ADR-0035): turns bone b so the bone towards `child` points along the world direction d, by w (the shortest turn, so it keeps
    // its twist); the bone and what hangs from it are brought up to date for the next one down the limb
    pointBone(b, child, d, w) {
      keep(b); b.parent.updateWorldMatrix(true, false); b.updateMatrixWorld(true); b.parent.matrixWorld.decompose(lA, pq, lB);
      lA.setFromMatrixPosition(b.matrixWorld); lB.setFromMatrixPosition(child.matrixWorld);
      ikQ.setFromUnitVectors(ikD.subVectors(lB, lA).normalize(), d); kpQ.identity().slerp(ikQ, w);
      b.quaternion.premultiply(kpQ.premultiply(lq.copy(pq).invert()).multiply(pq)); b.updateMatrixWorld(true);
    },
    // turns bone b about the body-frame axis (world direction) by a, as a procedural pose (kept like pointBone)
    turnBone(b, axis, a) {
      keep(b); b.parent.updateWorldMatrix(true, false); b.parent.matrixWorld.decompose(lA, pq, lB);
      la.copy(axis).applyQuaternion(lq.copy(pq).invert()).normalize(); kpQ.setFromAxisAngle(la, a); b.quaternion.premultiply(kpQ); b.updateMatrixWorld(true);
    },
    // CHR-06c: the legs' world matrices brought up to date from the hips down, once for both (getWorldPosition walks up to the scene on
    // every call, and the IK runs for every leg near the camera); legIK reads them, so this goes after anything that moves the hips
    legsWorld() {
      const hp = legChain[0].parent; hp.updateWorldMatrix(true, false); hp.matrixWorld.decompose(lA, hipQ, lB);
      legChain[0].updateMatrixWorld(true); legChain[3].updateMatrixWorld(true);
    },
    // CHR-06c (ADR-0035): leg i (0 left, 1 right) reaches with its ankle for `t` (world), the knee bent the way it already bends (fx, fz: the
    // way the body faces, for a straight leg); the foot keeps pointing where the clip points it, tipped by `tilt` (a world rotation, or null).
    // Two-bone IK as twoBoneIK, on the world matrices legsWorld left and the world turns chained down from the hips'
    legIK(i, t, tilt, fx, fz) {
      if (!this.legsMoved) { for (let k = 0; k < 6; k++) legQ[k].copy(legChain[k].quaternion); this.legsMoved = true; }
      const up = legChain[i * 3], lo = legChain[i * 3 + 1], ft = legChain[i * 3 + 2];
      lqU.multiplyQuaternions(hipQ, up.quaternion); lqL.multiplyQuaternions(lqU, lo.quaternion); lq.multiplyQuaternions(lqL, ft.quaternion);
      const a = lA.setFromMatrixPosition(up.matrixWorld), b = lB.setFromMatrixPosition(lo.matrixWorld), c = lC.setFromMatrixPosition(ft.matrixWorld);
      lP.addVectors(a, c).multiplyScalar(0.5).sub(b).multiplyScalar(-4).add(b); lP.x += fx * 0.15; lP.z += fz * 0.15;
      const L1 = a.distanceTo(b), L2 = b.distanceTo(c), dist = Math.min(L1 + L2 - 1e-3, Math.max(Math.abs(L1 - L2) + 1e-3, a.distanceTo(t)));
      const d = tkD.copy(t).sub(a).normalize();
      const cosA = Math.min(1, Math.max(-1, (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist))), sinA = Math.sqrt(1 - cosA * cosA);
      ikN.subVectors(lP, a); ikN.addScaledVector(d, -ikN.dot(d)); if (ikN.lengthSq() < 1e-8) ikN.set(0, -1, 0); ikN.normalize();
      // the thigh turns the knee onto its circle; the shin and ankle go round with it
      tkE.copy(a).addScaledVector(d, L1 * cosA).addScaledVector(ikN, L1 * sinA);
      ikQ.setFromUnitVectors(ikD.subVectors(b, a).normalize(), ikE.subVectors(tkE, a).normalize());
      lqU.premultiply(ikQ); up.quaternion.copy(pq.copy(hipQ).invert().multiply(lqU)); lqL.premultiply(ikQ);
      c.sub(a).applyQuaternion(ikQ).add(a);
      // the shin turns the ankle onto the target (as far as the leg reaches)
      ikQ.setFromUnitVectors(ikD.subVectors(c, tkE).normalize(), ikE.copy(a).addScaledVector(d, dist).sub(tkE).normalize());
      lqL.premultiply(ikQ); lo.quaternion.copy(pq.copy(lqU).invert().multiply(lqL));
      if (tilt) lq.premultiply(tilt);
      ft.quaternion.copy(pq.copy(lqL).invert().multiply(lq)); up.updateMatrixWorld(true);
    },
    mixer, act, clip, bones, skinMeshes, skinned: true, aim: 0, aimYaw: 0, aimPitch: 0, phase: 0, gait: S.gait || {}, turn: S.turn || {}, feet: S.feet || null,
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
const kpQ = new THREE.Quaternion(), lq = new THREE.Quaternion(), lqU = new THREE.Quaternion(), lqL = new THREE.Quaternion(), hipQ = new THREE.Quaternion(), lA = new THREE.Vector3(), lB = new THREE.Vector3(), lC = new THREE.Vector3(), lP = new THREE.Vector3();
// ---- two-bone IK (world space) ----
const ikA = new THREE.Vector3(), ikB = new THREE.Vector3(), ikD = new THREE.Vector3(), ikE = new THREE.Vector3(), ikN = new THREE.Vector3(), ikQ = new THREE.Quaternion(), ikQ2 = new THREE.Quaternion(), ikPW = new THREE.Quaternion();
const tkA = new THREE.Vector3(), tkB = new THREE.Vector3(), tkC = new THREE.Vector3(), tkD = new THREE.Vector3(), tkE = new THREE.Vector3();
// rotate `bone` so that the direction to `child` points at `target`
function aimBone(bone, child, target) {
  bone.getWorldPosition(ikA); child.getWorldPosition(ikB);
  ikD.subVectors(ikB, ikA).normalize(); ikE.subVectors(target, ikA).normalize();
  ikQ.setFromUnitVectors(ikD, ikE);
  bone.getWorldQuaternion(ikQ2); ikQ2.premultiply(ikQ);
  bone.parent.getWorldQuaternion(ikPW); bone.quaternion.copy(ikPW.invert().multiply(ikQ2));
  bone.updateMatrixWorld(true);
}
// upper/lower/end bones reach `target`, elbow bent towards `pole` (scratch vectors only)
function twoBoneIK(up, lo, end, target, pole) {
  const a = up.getWorldPosition(tkA), b = lo.getWorldPosition(tkB), c = end.getWorldPosition(tkC);
  const L1 = a.distanceTo(b), L2 = b.distanceTo(c), dist = Math.min(L1 + L2 - 1e-3, Math.max(Math.abs(L1 - L2) + 1e-3, a.distanceTo(target)));
  const d = tkD.copy(target).sub(a).normalize();
  const cosA = Math.min(1, Math.max(-1, (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist))), sinA = Math.sqrt(1 - cosA * cosA);
  ikN.subVectors(pole, a); ikN.addScaledVector(d, -ikN.dot(d)); if (ikN.lengthSq() < 1e-8) ikN.set(0, -1, 0); ikN.normalize();
  aimBone(up, lo, tkE.copy(a).addScaledVector(d, L1 * cosA).addScaledVector(ikN, L1 * sinA));
  aimBone(lo, end, tkE.copy(a).addScaledVector(d, dist));
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
