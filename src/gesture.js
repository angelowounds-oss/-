import * as THREE from 'three';

// Named gestures and short actions on top of the retargeted clips (assets.js MOTIONS). Clips that also have a UB_ upper-body mask play over
// walking and standing; the rest take the whole body for their length, like the hit reactions do.
export const GESTURES = {
  wave: 'Greeting', nod: 'Head_Nod', yes: 'Yes', no: 'Reject', shrug: 'Confused', insult: 'Insult', salute: 'Salute', bow: 'Bow',
  help: 'Help_One_Arm', help2: 'Help_Two_Arms', listen: 'Idle_Listening', call: 'Idle_Rail_Call', cheer: 'Cheer_One_arm', cheer2: 'Cheering_Two_Hands',
  victory: 'Victory', fist: 'Victory_Fist_Pump', angry: 'Angry', dizzy: 'Dizzy', shake: 'Idle_ShakeOff', hurt: 'Idle_Hurt', shiver: 'Shivering',
  tired: 'Tired_Hunched', kneel: 'Kneeling_Tired', foldarms: 'Idle_FoldArms', fidget: 'Idle_Subtle', phone: 'Idle_TalkingPhone', lantern: 'Idle_Lantern',
  torch: 'Idle_Torch', lean: 'Idle_Rail', meditate: 'Meditate', sittalk: 'Sitting_Talking', sleep: 'Sleeping',
  throw: 'OverhandThrow', toss: 'Throw_Object', carry: 'Walk_Carry', eat: 'Consume', drink: 'Consume_Item', open: 'Chest_Open', kick: 'Kick_Breach',
  repair: 'Fixing_Kneeling', harvest: 'Farm_Harvest', plant: 'Farm_PlantSeed', water: 'Farm_Watering', chop: 'Chop_Tree',
  cast: 'Fishing_Cast', reel: 'Fishing_Reel', catch: 'Fishing_Catch', golf: 'Golf_Drive', jacks: 'Jumping_Jacks', pushup: 'Pushup', dance: 'Dance_Body_Roll',
  block: 'Sword_Block', pickup: 'PickUp_Table', interact: 'Interact', walkback: 'Walk_Backwards', getup: 'LayToIdle', rise: 'Zombie_Rise', yell: 'Zombie_Yell', scratch: 'Zombie_Scratch', knockback: 'Hit_Knockback',
};

const dur = (a) => a.getClip().duration / (a.timeScale || 1);

// Plays a gesture on a Human; returns false when it cannot (dead, hit reaction running, unknown name, clip missing). opts.speed scales the clip.
// gestures that hold something in the right hand while they play
export const PROPS = { phone: 'phone', drink: 'cup', eat: 'food', lantern: 'lantern', torch: 'torch', carry: 'box', repair: 'tool', chop: 'tool', harvest: 'tool', plant: 'tool', water: 'cup' };
export function gesture(h, name, opts = {}) {
  const clip = GESTURES[name] || name, m = h.m;
  if (!m || !m.skinned || h.dead || h.rag || h.reactT > 0 || h.landK || h.swimming) return false;
  const speed = opts.speed || 1;
  const moving = (h.speed || 0) > 0.8;
  const ub = m.clip('UB_' + clip);
  if (ub && (moving || opts.upper) && !m.sit && !h.prone) {
    h.gestName = name; ub.timeScale = speed; h.gestUB = 'UB_' + clip; h.gestT = dur(ub); h.gestStart = true; h.gestSpeed = speed;
    return true;
  }
  if (moving && !opts.moving) return false;
  const a = m.clip('U_' + clip); if (!a) return false;
  a.timeScale = speed;
  if (!m.playOnce('U_' + clip, false)) return false;
  h.gestName = name; h.reactT = dur(a); return true;
}

export function gestureBusy(h) { return !!h.gestUB || h.reactT > 0; }

// Per frame (called from Human.animateSkinned after the mask weights): fades the upper-body gesture in and out, ends it when its clip is over.
export function updateGesture(h, dt, armed) {
  const m = h.m, a = m.clip(h.gestUB);
  if (!a || h.dead || h.reactT > 0 || armed) { if (a) a.weight = 0; h.gestUB = null; return; }
  if (h.gestStart) { h.gestStart = false; a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.timeScale = h.gestSpeed || 1; a.play(); a.weight = 0; }
  h.gestT -= dt;
  const on = h.gestT > 0.12;
  a.weight = THREE.MathUtils.lerp(a.weight, on ? 40 : 0, 1 - Math.exp(-16 * dt));
  if (!on && a.weight < 0.4) { a.weight = 0; a.enabled = true; h.gestUB = null; }
}

// ---- Procedural arm motions for the things the clip library has none of (handshake, hug, clap, point, typing, stirring, stretching, thinking, facepalm).
// They are rotations of the arm bones about the character's own axes, added on top of the idle pose after the mixer ran: X swings an arm forward
// (negative) and up, Z swings it out to the side, Y turns it in. k is the fade (0..1), t the time in seconds, side +1 is the character's left arm.
// CHR-06h: `look` is where the head looks while the hands work (yaw from the way the body faces, + its left, and pitch, + up; rad), `bend`
// how far the chest leans in (+) or arches back (-).
const sin = Math.sin, TAU = Math.PI * 2;
export const PROC = {
  handshake: { dur: 2.4, look: [0, -0.1], bend: 0.05, f: (t, k) => [['RightArm', 'x', -1.0 * k], ['RightArm', 'y', 0.5 * k], ['RightForeArm', 'x', (-0.55 + 0.22 * sin(t * 13)) * k]] },
  hug: { dur: 3.0, look: [0, 0], bend: 0.12, f: (t, k) => { const c = Math.min(1, Math.max(0, Math.min(t / 0.9, (3.0 - t) / 0.7))); return [['RightArm', 'x', -1.15 * k], ['LeftArm', 'x', -1.15 * k], ['RightArm', 'y', (0.35 + 0.55 * c) * k], ['LeftArm', 'y', -(0.35 + 0.55 * c) * k], ['RightForeArm', 'x', -0.7 * k], ['LeftForeArm', 'x', -0.7 * k], ['RightArm', 'z', -0.5 * (1 - c) * k], ['LeftArm', 'z', 0.5 * (1 - c) * k]]; } },
  clap: { dur: 2.0, look: [0, -0.15], bend: 0.03, f: (t, k) => { const o = 0.22 * sin(t * 18); return [['RightArm', 'x', -1.15 * k], ['LeftArm', 'x', -1.15 * k], ['RightForeArm', 'x', -1.05 * k], ['LeftForeArm', 'x', -1.05 * k], ['RightArm', 'y', (0.35 + o) * k], ['LeftArm', 'y', -(0.35 + o) * k]]; } },
  point: { dur: 1.8, look: [0, 0.05], bend: 0, f: (t, k) => [['RightArm', 'x', -1.45 * k], ['RightArm', 'y', 0.1 * k], ['RightForeArm', 'x', -0.05 * k]] },
  typing: { dur: 4.0, look: [0, -0.4], bend: 0.08, f: (t, k) => [['RightArm', 'x', -0.55 * k], ['LeftArm', 'x', -0.55 * k], ['RightForeArm', 'x', -1.35 * k], ['LeftForeArm', 'x', -1.35 * k], ['RightHand', 'x', (0.1 * sin(t * 17)) * k], ['LeftHand', 'x', (0.1 * sin(t * 17 + 2.1)) * k]] },
  stir: { dur: 4.0, look: [-0.2, -0.45], bend: 0.08, f: (t, k) => [['RightArm', 'x', -0.75 * k], ['RightForeArm', 'x', -1.1 * k], ['RightArm', 'y', (0.3 + 0.22 * sin(t * 7)) * k], ['RightForeArm', 'z', 0.2 * sin(t * 7 + 1.6) * k]] },
  stretch: { dur: 3.0, look: [0, 0.35], bend: -0.15, f: (t, k) => { const u = Math.min(1, Math.max(0, Math.min(t / 0.8, (3.0 - t) / 0.7))) * k; return [['RightArm', 'x', -2.9 * u], ['LeftArm', 'x', -2.9 * u], ['RightArm', 'z', -0.25 * u], ['LeftArm', 'z', 0.25 * u]]; } },
  think: { dur: 3.0, look: [0.15, -0.15], bend: 0.04, f: (t, k) => [['RightArm', 'x', -0.9 * k], ['RightForeArm', 'x', -2.2 * k], ['LeftArm', 'x', -0.7 * k], ['LeftForeArm', 'x', -1.5 * k], ['LeftArm', 'y', -0.5 * k]] },
  facepalm: { dur: 2.2, look: [0, -0.35], bend: 0.06, f: (t, k) => [['RightArm', 'x', -1.55 * k], ['RightForeArm', 'x', -2.05 * k], ['RightArm', 'y', -0.1 * k]] },
  wipe: { dur: 2.2, look: [0, -0.1], bend: 0, f: (t, k) => [['RightArm', 'x', -1.7 * k], ['RightForeArm', 'x', -2.1 * k], ['RightForeArm', 'z', 0.25 * sin(t * 9) * k]] },
};
const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
const _wq = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _la = new THREE.Vector3();

// Starts a procedural motion (only while standing still, on foot); returns false otherwise.
export function procGesture(h, name) {
  const P = PROC[name], m = h.m;
  if (!P || !m || !m.skinned || !m.bones || h.dead || h.rag || h.reactT > 0 || h.landK || h.swimming || h.prone || (m.sit || 0) > 0.3 || m.rideOn || (h.speed || 0) > 0.8) return false;
  h.proc = { name, t: 0, dur: P.dur }; return true;
}

// CHR-06h (ADR-0035): the body goes with the arms. An arm reaching forward brings its shoulder with it: the chest turns by 30% of how much
// further one arm reaches than the other (its forward swing, less as the elbow folds the hand back to the face: cos^2 of half the bend;
// both alike: no turn), at most 13 deg, over the three spine bones (30/35/35%), and leans by
// the motion's `bend` the same way; the head looks where the hands work (`look`, through the look-at, CHR-06g, net of the chest's turn it
// rides on). Every turn is kept (Model.turnBone), so a bone the mixer leaves alone under a held clip never takes it twice
const FOLLOW = 0.3, TWIST_MAX = 0.22, SPINE = [['Spine', 0.3], ['Spine1', 0.35], ['Spine2', 0.35]];
// After the mixer and applyPose of a frame.
export function updateProc(h, dt) {
  const p = h.proc, m = h.m; if (!p) return;
  if (h.dead || h.reactT > 0 || h.rag || (h.speed || 0) > 1.2) { h.proc = null; return; }
  p.t += dt; if (p.t >= p.dur) { h.proc = null; return; }
  const P = PROC[p.name], k = Math.min(1, p.t / 0.35, (p.dur - p.t) / 0.35), wrap = m.group, list = P.f(p.t, k);
  wrap.updateWorldMatrix(true, false); wrap.getWorldQuaternion(_wq);
  const sw = { RightArm: 0, LeftArm: 0, RightForeArm: 0, LeftForeArm: 0 };
  for (const [bone, ax, ang] of list) if (ax === 'x' && bone in sw) sw[bone] -= ang;
  const reach = (a, f) => a * Math.cos(f / 2) ** 2;
  const twist = Math.max(-TWIST_MAX, Math.min(TWIST_MAX, FOLLOW * (reach(sw.RightArm, sw.RightForeArm) - reach(sw.LeftArm, sw.LeftForeArm)))), bend = (P.bend || 0) * k;
  p.twist = twist;
  const turn = (b, ax, ang) => {
    if (m.turnBone) return m.turnBone(b, _la.copy(AX[ax]).applyQuaternion(_wq), ang);
    b.parent.updateWorldMatrix(true, false); b.parent.getWorldQuaternion(_pq).invert();
    _la.copy(AX[ax]).applyQuaternion(_wq).applyQuaternion(_pq).normalize();
    _qa.setFromAxisAngle(_la, ang); b.quaternion.premultiply(_qa);
  };
  // the chest first, so the arms go with it
  for (const [bone, s] of SPINE) { const b = m.bones[bone]; if (!b) continue; if (twist) turn(b, 'y', twist * s); if (bend) turn(b, 'x', bend * s); }
  for (const [bone, ax, ang] of list) { const b = m.bones[bone]; if (b && ang) turn(b, ax, ang); }
}
