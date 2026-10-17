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
export function gesture(h, name, opts = {}) {
  const clip = GESTURES[name] || name, m = h.m;
  if (!m || !m.skinned || h.dead || h.rag || h.reactT > 0 || h.swimming) return false;
  const speed = opts.speed || 1;
  const moving = (h.speed || 0) > 0.8;
  const ub = m.clip('UB_' + clip);
  if (ub && (moving || opts.upper) && !m.sit && !h.prone) {
    ub.timeScale = speed; h.gestUB = 'UB_' + clip; h.gestT = dur(ub); h.gestStart = true; h.gestSpeed = speed;
    return true;
  }
  if (moving && !opts.moving) return false;
  const a = m.clip('U_' + clip); if (!a) return false;
  a.timeScale = speed;
  if (!m.playOnce('U_' + clip, false)) return false;
  h.reactT = dur(a); return true;
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
