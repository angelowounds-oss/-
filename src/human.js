import * as THREE from 'three';
import { buildHuman, rifleLook } from './models.js';
import { N, R, SW, roadC, roadIdx } from './world.js';
import { clamp, lerp, damp, dampAngle, angDiff, rand, TAU } from './util.js';
import * as AI from './ai.js';
import { updateGesture, updateProc, gesture, procGesture, PROPS } from './gesture.js';

const STAFF = { cashier: ['typing', 'interact', 'fidget', 'nod'], reception: ['typing', 'listen', 'nod', 'phone'], nurse: ['listen', 'nod', 'fidget', 'wipe'] };
// small calm gestures that read well over a walk or stand
const AMBIENT = ['scratch', 'shrug', 'nod', 'phone', 'foldarms', 'fidget', 'lean'];

export const WEAPONS = [
  { name: '9MM PISTOL', scope: 'iron', zoom: 1.3, short: 'pistol', clip: 12, reserve: 96, damage: 34, head: 2.4, rate: 0.16, spread: 0.006, range: 160, reload: 1.2, recoil: 0.018, auto: false, tracer: [1, 0.85, 0.5], snd: 'pistol' },
  { name: 'CARBINE', scope: 'dot', zoom: 2.2, short: 'rifle', clip: 30, reserve: 180, damage: 21, head: 1.9, rate: 0.085, spread: 0.012, range: 200, reload: 1.7, recoil: 0.011, auto: true, tracer: [0.5, 0.95, 1], snd: 'rifle' },
  { name: 'SMG', scope: 'iron', zoom: 1.4, short: 'pistol', clip: 25, reserve: 0, damage: 13, head: 1.8, rate: 0.058, spread: 0.022, range: 110, reload: 1.4, recoil: 0.008, auto: true, tracer: [1, 0.7, 0.4], snd: 'smg' },
  { name: 'SHOTGUN', scope: 'iron', zoom: 1.25, short: 'rifle', clip: 6, reserve: 0, damage: 12, head: 1.5, rate: 0.85, spread: 0.055, range: 45, reload: 2.4, recoil: 0.04, auto: false, tracer: [1, 0.6, 0.3], snd: 'shotgun', pellets: 8 },
  { name: 'SNIPER', scope: 'sniper', zoom: 6, short: 'rifle', look: 'sniper', clip: 5, reserve: 0, damage: 125, head: 3, rate: 1.1, spread: 0.0008, range: 420, reload: 2.4, recoil: 0.05, auto: false, tracer: [0.8, 1, 1], snd: 'sniper' },
];
const SW_MID = R / 2 + SW / 2;
let uid = 0;

// CHR-06a (ADR-0035): stand-set legs. Aimed and fighting actors face one way and move another, so the leg clip is picked by the way the body
// moves relative to where it faces (ahead, back steps, or a side step: the clip whose measured direction is nearest, ahead favoured and the
// current one kept within a margin), and the hips are turned by what is left over (Model.turnHips) so the feet step exactly that way. Ahead
// splits into Walk / Run / Sprint by speed. All of them play on one step phase (each at its left foot's stance), advanced so the mix carries
// the body exactly as far as it moved (distance matching on the step tables measured per body at load, assets.js measureGait): the planted
// foot stays put on the ground.
const CARD = ['Walk', 'U_Walk_Backwards', 'U_Strafe_left', 'U_Strafe_right'];
const GAIT_TS = { Walk: [0.5, 3], Run: [0.6, 1.6], U_Sprint: [0.7, 1.3], U_Walk_Backwards: [0.5, 3.4], U_Strafe_left: [0.5, 3.4], U_Strafe_right: [0.5, 3.4] };
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function stepGait(h, dt, sp, move, wt) {
  const G = h.m.gait;
  if (!G.Walk) { wt.Walk = move; h.m.act.Walk.timeScale = clamp(sp / 0.94, 0.5, 3); return; }
  const vf = h.vx * Math.sin(h.ry) + h.vz * Math.cos(h.ry), vl = h.vx * Math.cos(h.ry) - h.vz * Math.sin(h.ry);
  if (sp > 0.15) h.gaitDir = Math.atan2(vl, vf);
  const th = h.gaitDir || 0;
  let cur = h.gaitCard || 'Walk', best = cur, bs = 1e9;
  for (const n of CARD) { if (!G[n]) continue; const s = Math.abs(wrapA(th - G[n].dir)) - (n === 'Walk' ? 0.26 : 0) - (n === cur ? 0.12 : 0); if (s < bs) { bs = s; best = n; } }
  h.gaitCard = cur = best;
  // ahead: Walk -> Run from 3.4 m/s, Run -> Sprint from 6.5 m/s
  const r = G.Run ? clamp((sp - 3.4) / 2, 0, 1) : 0, s = G.U_Sprint ? clamp((sp - 6.5) / 1.5, 0, 1) : 0;
  const share = cur === 'Walk' ? { Walk: 1 - r, Run: r * (1 - s), U_Sprint: r * s } : { [cur]: 1 };
  // the phase moves on by what carries the body sp*dt at this point of the mix's step table; the cadence limits (each active clip's
  // playback range) scale the whole cycle, so a clip past its range slides evenly rather than in one part of the step
  const ph = h.gaitPh ?? Math.random();
  let stride = 0, slope = 0, lo = 0, hi = 1e9;
  for (const n in share) {
    const w = share[n]; if (w <= 0) continue; const g = G[n]; wt[n] = move * w;
    stride += w * g.stride; slope += w * g.step[(((ph + g.off) % 1) * g.step.length) | 0];
    if (w > 0.05) { lo = Math.max(lo, GAIT_TS[n][0] / g.dur); hi = Math.min(hi, GAIT_TS[n][1] / g.dur); }
  }
  h.gaitPh = (ph + dt * clamp(sp / stride, lo, Math.max(lo, hi)) * stride / slope) % 1;
}
// after the weights eased: puts the leg clips on the shared phase and returns the hip turn, each clip's leftover angle by the weight it plays at
// (so a change of clip turns the hips over as the clips cross-fade, and an actor at a standstill keeps them straight)
function syncGait(h) {
  const G = h.m.gait, a = h.m.act, th = h.gaitDir || 0, ph = h.gaitPh || 0; let warp = 0;   // no phase yet: never stood (sat, swam ... since spawn)
  for (const n in GAIT_TS) {
    const ac = a[n], g = G[n]; if (!ac || !g) continue;
    ac.timeScale = 0; ac.time = ((ph + g.off) % 1) * g.dur;
    if (ac.weight > 0.001 && h.speed > 0.15) warp += ac.weight * clamp(wrapA(th - g.dir), -1.2, 1.2);
  }
  return warp;
}

// CHR-06b (ADR-0035): turning in place. Standing, the legs keep their own heading (legYaw) while the body (ry) turns: the hips stay over
// the feet and the spine takes the twist. Past TURN_AT the legs step round with a turn clip (one that really turns that way, of the size
// nearest the twist it is heading for; measured in assets.js measureTurns), its turn spread over what is left so it ends square under the
// body. A twist below that relaxes slowly once the body holds still; on the move the legs come square at once and the gait warp steers them.
const TURNS = ['U_Turn_Left_90', 'U_Turn_Right_90', 'U_Turn_Left_180', 'U_Turn_Right_180'];
const TURN_AT = 0.87, TURN_MAX = 2, TURN_RATE = 1.8;
const yawAt = (t, arr, time) => { const u = clamp(time / t.dur, 0, 1) * (arr.length - 1), i = Math.min(arr.length - 2, u | 0); return arr[i] + (arr[i + 1] - arr[i]) * (u - i); };
function stepTurn(h, dt, still, wt) {
  const T = h.m.turn;
  if (h.legYaw === undefined) h.legYaw = h.ry;
  const dry = wrapA(h.ry - (h.ryPrev ?? h.ry)); h.ryPrev = h.ry;
  h.ryStill = Math.abs(dry) < 0.2 * dt ? (h.ryStill || 0) + dt : 0;
  let off = wrapA(h.legYaw - h.ry);
  if (!still) { h.turnClip = null; off *= Math.exp(-12 * dt); }
  else if (h.turnClip) {
    // the clip's own turn this frame, scaled so what is left of it covers what is left of the twist
    const t = T[h.turnClip], y0 = yawAt(t, t.yaw, h.turnT); h.turnT = Math.min(t.t1, h.turnT + dt * TURN_RATE);
    const rest = yawAt(t, t.yaw, t.t1) - y0, s = Math.abs(rest) > 0.05 ? clamp(-off / rest, 0.5, 1.6) : 1;
    off += s * (yawAt(t, t.yaw, h.turnT) - y0);
    if (h.turnT >= t.t1) h.turnClip = null;
  } else if (Math.abs(off) > TURN_AT) {
    // sized for where the twist is heading (the body's turn rate 0.12 s on), so a quick about-face steps the 180
    const want = dt > 0 ? off - (dry / dt) * 0.12 : off;
    let best = null, bs = 1e9;
    for (const n of TURNS) { const t = T[n]; if (!t || t.end * off >= 0) continue; const s = Math.abs(Math.log(Math.abs(want / t.end))); if (s < bs) { bs = s; best = n; } }
    if (best) { h.turnClip = h.turnLast = best; h.turnT = T[best].t0; }
  } else if (h.ryStill > 1) off *= Math.exp(-dt);
  off = clamp(off, -TURN_MAX, TURN_MAX);   // past that the body drags the legs round
  h.legYaw = h.ry + off; h.legOff = off;
  if (h.turnClip) { wt[h.turnClip] = wt.Idle; wt.Idle = 0; }
}
// after the weights eased: holds the turn clips on their set time and keeps how far they turn the pelvis and the chest by the weight they play at
function syncTurn(h) {
  const T = h.m.turn, a = h.m.act; let p = 0, c = 0;
  for (const n of TURNS) {
    const ac = a[n], t = T[n]; if (!ac || !t) continue;
    ac.timeScale = 0; if (n === h.turnLast) ac.time = h.turnT;
    // the mixer blends a turned pose with the others the short way round, so a 180 held past half a turn blends from the other side
    if (ac.weight > 0.001) { const y = yawAt(t, t.yaw, ac.time), w = wrapA(y); p += ac.weight * w; c += ac.weight * (w + yawAt(t, t.chest, ac.time) - y); }
  }
  h.turnYaw = p; h.turnChest = c;
}

// CHR-06c (ADR-0035): the feet on what they stand over, for people within 35 m. Each foot goes up or down by how far the ground under it
// (Physics.footY: a stair's treads, not its ramp) lies from the level the clips stand on, eased while it swings and never below that
// ground; the pelvis drops to the lower foot so the other leg bends to reach, and a planted foot tips to the slope. Within 20 m a planted foot
// is also held where it came down (foot lock): the point it bears on stays put and the foot keeps pointing the way it did, 25 deg at most
// (past that it pivots on that point as the clip turns it). Once the clip lifts it, it eases back under the clip as it rises; one the clip
// drags 16 cm off on the ground (a blend between stances), or that a standing body has left off its place, steps there instead, a short
// lifted step while the other foot stays down. That takes out what the clips still slide or pivot (side steps past their cadence, back
// steps, the blend into and out of a turn in place).
const IK_NEAR = 35, LOCK_NEAR = 20, LOCK_OFF = 0.16, LOCK_YAW = 0.44, LIFT = 0.025, TILT_MAX = 0.42, STEP_T = 0.28, STEP_UP = 0.06;
const _fA = new THREE.Vector3(), _fT = new THREE.Vector3(), _fP = new THREE.Vector3(), _fQ = new THREE.Quaternion(), _fI = new THREE.Quaternion(), _fY = new THREE.Quaternion(), _fUp = new THREE.Vector3(0, 1, 0), _fN = new THREE.Vector3();
const FOOT = ['LeftFoot', 'LeftToeBase', 'RightFoot', 'RightToeBase'];
function stepFeet(h, dt, cd, on) {
  const m = h.m, rest = m.feet, P = h.G && h.G.phys;
  if (!rest || !P || !m.legIK) return;
  const F = h.feet || (h.feet = [0, 1].map(() => ({ d: 0, ox: 0, oz: 0, oy: 0, lx: NaN, lz: NaN, ly: 0, c: 0, st: -1, arc: 0, s0x: 0, s0z: 0, s0y: 0, off: 0, cx: NaN, cz: 0, cc: -1, qx: NaN, qz: 0, qb: 0, g: NaN, nx: 0, ny: 1, nz: 0 })));
  h.ikW = damp(h.ikW || 0, on && cd < IK_NEAR ? 1 : 0, 8, dt);
  if (h.ikW < 0.01) { h.ikW = 0; h.pelvis = 0; for (const f of F) { f.d = 0; f.ox = f.oz = f.oy = 0; f.lx = NaN; f.st = -1; f.arc = 0; } return; }
  // a roll or a landing run out of lets the feet go where the clip puts them (held, they would drag the body back)
  const lk = h.landK, w = h.ikW, base = h.y + m.body.position.y + rest.sole, lock = on && cd < LOCK_NEAR && !(lk && (lk.kind === 'roll' || h.speed > 1)), B = m.bones;
  // a jump in place (teleport, a ride's seat) lets go of everything held
  const jump = Math.hypot(h.x - (h._fx ?? h.x), h.z - (h._fz ?? h.z)) > 1; h._fx = h.x; h._fz = h.z;
  const still = h.speed < 0.1 && !h.turnClip;
  let low = 0, any = false; m.legsWorld();
  for (let i = 0; i < 2; i++) {
    const f = F[i], other = F[1 - i];
    _fA.setFromMatrixPosition(B[FOOT[2 * i]].matrixWorld); _fT.setFromMatrixPosition(B[FOOT[2 * i + 1]].matrixWorld);
    // how high the heel (ankle) and the ball (toe joint) are off the clips' ground, each less what it stands over the sole in Idle; the foot
    // bears on its ball whenever that is down, else on its heel
    const la = _fA.y - rest.ankle - base, lt = _fT.y - rest.toe - base, lift = Math.min(la, lt), c = lt < LIFT ? 1 : 0;
    const tx = _fT.x - _fA.x, tz = _fT.z - _fA.z, yaw = Math.atan2(tx, tz);
    if (jump) { f.lx = NaN; f.ox = f.oz = f.oy = 0; f.cc = -1; f.st = -1; f.arc = 0; }
    const cpx = c ? _fT.x : _fA.x, cpz = c ? _fT.z : _fA.z, cv = dt > 0 && f.cc === c ? Math.hypot(cpx - f.cx, cpz - f.cz) / dt : 99; f.cx = cpx; f.cz = cpz; f.cc = c;
    if (f.st >= 0) {
      // the step: up and over to where the clip has the foot
      f.st = Math.min(1, f.st + dt / STEP_T); const e = 1 - f.st * f.st * (3 - 2 * f.st);
      f.ox = f.s0x * e; f.oz = f.s0z * e; f.oy = f.s0y * e; f.arc = STEP_UP * Math.sin(Math.PI * f.st);
      if (f.st >= 1) { f.st = -1; f.arc = 0; }
    } else {
      // taken once the clip has slowed the point it bears on to a walk's pace over the ground (not while it still lands); rolling from the
      // heel onto the ball moves the hold to the ball where it is drawn, so nothing jumps
      const held = f.lx === f.lx, planted = lock && lift < LIFT && (held || cv < 1);
      const cs = Math.cos(f.oy), sn = Math.sin(f.oy);
      if (planted && (!held || c !== f.c)) { f.lx = _fA.x + f.ox + (c ? tx * cs + tz * sn : 0); f.lz = _fA.z + f.oz + (c ? -tx * sn + tz * cs : 0); f.ly = yaw + f.oy; f.c = c; }
      if (planted) {
        f.oy = wrapA(f.ly - yaw); if (Math.abs(f.oy) > LOCK_YAW) { f.oy = Math.sign(f.oy) * LOCK_YAW; f.ly = yaw + f.oy; }
        const c2 = Math.cos(f.oy), s2 = Math.sin(f.oy);
        f.ox = f.lx - _fA.x - (c ? tx * c2 + tz * s2 : 0); f.oz = f.lz - _fA.z - (c ? -tx * s2 + tz * c2 : 0);
        const far = Math.hypot(f.ox, f.oz); f.off = still && (far > 0.05 || Math.abs(f.oy) > 0.25) ? f.off + dt : 0;
        if ((far > LOCK_OFF || f.off > 0.35) && other.st < 0) { f.st = 0; f.s0x = f.ox; f.s0z = f.oz; f.s0y = f.oy; f.lx = NaN; f.off = 0; }
      } else {
        f.lx = NaN;
        // let go, the foot comes back under the clip as it rises (on the ground it moves as the clip moves it, no faster)
        const k = Math.exp(-14 * dt * clamp((lift - LIFT) / 0.04, 0, 1)); f.ox *= k; f.oz *= k; f.oy *= k;
      }
    }
    // the ground under the ball of the foot where it is drawn, asked again once the foot has moved 3 cm (15 cm while it swings high, half a tread) or the
    // body 1 cm up or down; a level within 2 cm of the clips' is left alone (the player's capsule stands 3 cm up, the clips sink the soles 1.6 cm)
    const gx = _fA.x + f.ox + tx * 0.5, gz = _fA.z + f.oz + tz * 0.5, qr = lift > 0.04 ? 0.15 : 0.03;
    if (!(Math.abs(gx - f.qx) < qr && Math.abs(gz - f.qz) < qr && Math.abs(base - f.qb) < 0.01)) {
      f.g = P.footY(gx, base + 0.6, gz, 1.2); f.qx = gx; f.qz = gz; f.qb = base; const n = f.g === f.g && P.footN; f.nx = n ? n.x : 0; f.ny = n ? n.y : 1; f.nz = n ? n.z : 0;
    }
    let want = f.g === f.g && f.g > base - 0.5 ? clamp(f.g - base, -0.45, 0.45) : 0; if (Math.abs(want) < 0.02) want = 0;
    f.d = damp(f.d, want, lift < 0.04 ? 30 : 12, dt); f.d = Math.max(f.d, want - Math.max(0, lift));
    f.lift = lift; f.px = _fA.x; f.py = _fA.y; f.pz = _fA.z;
    low = Math.min(low, f.d);
    if (Math.abs(f.d) > 0.004 || Math.abs(f.ox) > 0.004 || Math.abs(f.oz) > 0.004 || Math.abs(f.oy) > 0.01 || f.arc > 0) any = true;
  }
  h.pelvis = damp(h.pelvis || 0, low, 20, dt);
  if (!any && Math.abs(h.pelvis) < 0.004) return;
  // the hips go down with the pelvis (on level ground they stay, and the legs' matrices from above stand)
  if (Math.abs(h.pelvis * w) > 1e-4) { m.body.position.y += h.pelvis * w; m.legsWorld(); }
  const fx = Math.sin(h.ry + (h.hipTurn || 0)), fz = Math.cos(h.ry + (h.hipTurn || 0));
  for (let i = 0; i < 2; i++) {
    const f = F[i], pw = clamp(1 - (f.lift + f.arc) / 0.08, 0, 1) * w;
    _fP.set(f.px + f.ox * w, f.py + (f.d + f.arc) * w, f.pz + f.oz * w);
    // the foot's world turn: the held yaw, then tipped to the slope under it
    let tilt = null;
    if (Math.abs(f.oy) > 0.001) tilt = _fY.setFromAxisAngle(_fUp, f.oy * w);
    if (pw > 0.01 && f.ny < 0.9995) {
      _fN.set(f.nx, Math.max(f.ny, Math.cos(TILT_MAX)), f.nz).normalize(); _fQ.setFromUnitVectors(_fUp, _fN); _fI.identity().slerp(_fQ, pw);
      tilt = tilt ? _fI.multiply(tilt) : _fI;
    }
    m.legIK(i, _fP, tilt, fx, fz);
  }
}
// CHR-06f: getting up, no foot goes into the ground. The blends from the lying pose and between the get-up clips swing the legs through it
// (the push-up's straight legs into the crouch's bent ones took a toe 53 cm under); the ankle lifts by as much and the knee bends. The heel
// is taken as 6 cm round the ankle joint (a flat foot's sole is the toe's to hold up), so a foot on its heel or its toes rests where it is.
// A straight leg bends its knee the way the pelvis faces (down, on all fours), not the way the body stands
function liftFeet(h) {
  const m = h.m, rest = m.feet; if (!rest || !m.legIK) return;
  const base = h.y + m.body.position.y + rest.sole, B = m.bones;
  m.legsWorld(); _fN.set(0, 0, 1).applyQuaternion(B.Hips.getWorldQuaternion(_fQ));
  for (let i = 0; i < 2; i++) {
    _fA.setFromMatrixPosition(B[FOOT[2 * i]].matrixWorld); _fT.setFromMatrixPosition(B[FOOT[2 * i + 1]].matrixWorld);
    const under = base - Math.min(_fA.y - 0.06, _fT.y - rest.toe);
    if (under > 0.005) { _fA.y += under; m.legIK(i, _fA, null, _fN.x, _fN.z, _fN.y); }
  }
}

// CHR-06d (ADR-0035): touchdowns (Human.landAnim, from game.land and the car roof). The landing part of a clip plays over the stand set as a
// layer, not a one-shot that cuts everything else: it comes in from the air pose as the feet meet the ground and goes out into whatever the
// player goes on to do. Segments [clip, from s, to s, rate, cross-fade in s (LAND_X)] play one after the other. Jump_Land squats from the
// feet's contact (hips 0.5 m down at 0.21 s) and is up by 1 s, played by as much of it as the drop calls for; Land_Three_Point comes down
// onto a hand and Jump_Land's rise lifts the body out of it; Roll goes over the shoulder from the landing crouch (its dive, quicker) and up.
// CHR-06f: getting up the same way (Human.upAnim, from the ragdoll's get-up). From the back LayToIdle sits up and stands; from the belly the
// arms push the chest up from Pushup's low point while the feet come in under the body to Land_Three_Point's crouch on one hand, and
// Jump_Land's rise stands up out of it. A knock-down with no ragdoll to spare (knock) is thrown onto its back by Hit_Knockback, whose
// lying pose at 0.62 s is LayToIdle's first frame within 2 cm at the hips, and gets up from there
const LANDS = {
  land: [['U_Jump_Land', 0, 1, 1]],
  hard: [['U_Land_Three_Point', 0.47, 1.2, 1], ['U_Jump_Land', 0.3, 1, 1]],
  roll: [['U_Roll', 0.06, 1.65, 1.3]],
  upBack: [['U_LayToIdle', 0, 1.5, 1]],
  upFront: [['U_Pushup', 0.72, 1.39, 1.2], ['U_Land_Three_Point', 0.69, 1.38, 1, 0.3], ['U_Jump_Land', 0.3, 1, 1]],
  knock: [['U_Hit_Knockback', 0.02, 0.62, 1], ['U_LayToIdle', 0, 1.5, 1]],
};
const LAND_X = 0.2, LAND_OUT = 0.3, LAND_CLIPS = new Set(Object.values(LANDS).flatMap((s) => s.map((g) => g[0])));
// getting up and knocked down: the feet go where the clip puts them (no lock, no ground IK) and the body does not turn in place
const UPS = new Set(['upBack', 'upFront', 'knock']);
// Hit_Knockback flies back with the feet up until 0.2 s and is down at 0.31 s: a knock-down holds the flight until the body comes down
const KNOCK_AIR = 0.2;
const ss01 = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
// an action held on one time of its clip (timeScale 0), whatever a one-shot left it in
function holdAt(ac, t) { ac.enabled = true; ac.paused = false; ac.timeScale = 0; ac.time = t; }
function endLand(h) {
  const L = h.landK; h.landK = null; if (!L) return;
  for (const sg of LANDS[L.kind]) { const ac = h.m.act[sg[0]]; if (ac) ac.weight = 0; }
}
// the layer's weight is a share of the pose (the mixer averages by weight): each segment's action gets w / (1 - share) times the rest
function stepLand(h, dt, sp, aim = false) {
  const L = h.landK, m = h.m, a = m.act, segs = LANDS[L.kind], w = L.w, n = segs.length;
  L.t = Math.min(L.t + dt, L.until ?? Infinity);
  // running on out of it cuts it short, and so does raising a weapon out of a get-up; a roll is seen through
  if (L.cut < 0 && L.kind !== 'roll' && (sp > 2.5 || (aim && L.kind.startsWith('up'))) && L.t > 0.25) L.cut = L.t;
  const fade = L.cut < 0 ? 1 : 1 - (L.t - L.cut) / 0.2;
  let s0 = 0, end = 0, share = 0, rest = 0;
  for (let i = 0; i < n; i++) {
    const [c, t0, t1, r0] = segs[i], r = r0 * L.rate, len = (t1 - t0) / r, u = L.t - s0, ac = m.clip(c);
    const xi = i ? segs[i][4] || LAND_X : L.in, xo = i === n - 1 ? LAND_OUT : segs[i + 1][4] || LAND_X;
    w[i] = ac ? (xi > 0 ? ss01(u / xi) : 1) * ss01((len - u) / xo) * L.peak * Math.max(0, fade) : 0;
    if (ac) holdAt(ac, t0 + r * clamp(u, 0, len));
    share += w[i]; end = s0 + len; s0 += len - xo;
  }
  if (L.t >= end || fade <= 0) { endLand(h); return; }
  for (const k in a) if (!LAND_CLIPS.has(k) && !k.startsWith('UB_')) rest += a[k].weight;
  share = Math.min(share, 0.995);
  for (let i = 0; i < n; i++) { const ac = a[segs[i][0]]; if (ac) ac.weight = (w[i] / (1 - share)) * rest; }
}
// CHR-06d (ADR-0035): in the air. Past 9 m/s down (a drop of 4 m or more) the limbs go out into the spread a body falls stable in (upper arms
// out level with the shoulders, forearms up by the head, thighs apart, knees bent so the shins trail), as far as the speed has built, with a
// flutter in the wind that grows with it; the body tips forward about the hips towards lying on the air (AIR_TIP at 30 m/s). Under the
// canopy the hands are up on the brake toggles and the legs hang together. Body-frame directions of the left limbs (+x), mirrored for the right.
const SPREAD = { arm: [0.93, 0.3, -0.15], fore: [0.3, 0.92, -0.22], thigh: [0.3, -0.94, -0.15], shin: [0.26, -0.38, -0.89] };
const CANOPY = { arm: [0.32, 0.94, 0.08], fore: [0.12, 0.99, 0.06], thigh: [0.06, -0.99, 0.1], shin: [0.05, -0.99, -0.06] };
const AIR_TIP = 1.2, HIP_H = 0.95;
const _bq = new THREE.Quaternion(), _ad = new THREE.Vector3(), _ax = new THREE.Vector3();
function poseAir(h, t) {
  const m = h.m, B = m.bones, f = h.ffK, c = h.chK, wl = Math.max(f, c), fl = f * (0.05 + 0.08 * clamp((-(h.vy || 0) - 15) / 30, 0, 1));
  m.body.getWorldQuaternion(_bq);
  const dir = (k, s, dy, dz) => _ad.set(s * (SPREAD[k][0] * f + CANOPY[k][0] * c), SPREAD[k][1] * f + CANOPY[k][1] * c + dy, SPREAD[k][2] * f + CANOPY[k][2] * c + dz).normalize().applyQuaternion(_bq);
  // the back arches and the head comes up to keep the eyes ahead of a tipped body
  _ax.set(1, 0, 0).applyQuaternion(_bq);
  if (f > 0.01) { m.turnBone(B.Spine1, _ax, -0.12 * f); m.turnBone(B.Spine2, _ax, -0.1 * f); }
  if (h.ffTip > 0.01) { m.turnBone(B.Neck, _ax, -0.45 * h.ffTip); m.turnBone(B.Head, _ax, -0.25 * h.ffTip); }
  for (const s of [1, -1]) {
    const L = s > 0, ph = L ? 0 : 2.1;
    m.pointBone(L ? B.LeftArm : B.RightArm, L ? B.LeftForeArm : B.RightForeArm, dir('arm', s, Math.sin(t * 6.3 + ph) * fl * 0.5, 0), wl);
    m.pointBone(L ? B.LeftForeArm : B.RightForeArm, L ? B.LeftHand : B.RightHand, dir('fore', s, 0, Math.sin(t * 9.1 + ph) * fl), wl);
    m.pointBone(L ? B.LeftUpLeg : B.RightUpLeg, L ? B.LeftLeg : B.RightLeg, dir('thigh', s, 0, Math.sin(t * 5.7 + ph) * fl * 0.5), wl);
    m.pointBone(L ? B.LeftLeg : B.RightLeg, L ? B.LeftFoot : B.RightFoot, dir('shin', s, 0, Math.sin(t * 8.3 + ph) * fl), wl);
  }
}

export class Human {
  constructor(G, team, o = {}) {
    this.G = G; this.team = team; this.id = ++uid;
    const look = o.look || {};
    this.m = buildHuman(look);
    this.group = this.m.group;
    this.x = 0; this.z = 0; this.y = 0; this.vy = 0; this.ry = rand(0, TAU);
    this.vx = 0; this.vz = 0;
    this.hp = o.hp ?? 60; this.maxHp = this.hp;
    this.dead = false; this.deadT = 0; this.hidden = false;
    this.state = 'walk'; this.stateT = 0; this.phase = Math.random() * 10;
    this.speed = 0; this.moveSpeed = 0;
    this.node = null; this.target = null;
    this.armed = !!o.weapon; this.weapon = o.weapon ? WEAPONS[o.weapon - 1] : null;
    this.fireCd = rand(0, 1); this.burst = 0;
    this.threat = null; this.fleeT = 0;
    this.offset = rand(-1.6, 1.6);
    this.cash = Math.floor(rand(8, 60));
    this.aimT = 0; this.alert = 0;
    this.radius = 0.35;
    this.crouch = 0;
    this.pose = 0;
    this.group.userData.human = this;
    this.inCar = null;
    this.m.pistol.visible = this.armed && this.weapon.short === 'pistol';
    this.m.rifle.visible = this.armed && this.weapon.short === 'rifle'; rifleLook(this.m.rifle, this.weapon?.look === 'sniper');
  }
  get alive() { return !this.dead; }
  setWeapon(i) {
    if (i >= 100 || !WEAPONS[i]) { this.m.pistol.visible = this.m.rifle.visible = false; this.armed = false; return; }
    this.weapon = WEAPONS[i]; this.armed = true; rifleLook(this.m.rifle, this.weapon.look === 'sniper');
    this.m.pistol.visible = this.weapon.short === 'pistol'; this.m.rifle.visible = this.weapon.short === 'rifle';
  }
  // ---- sidewalk graph for civilians ----
  placeOnSidewalk(i, j, sx, sz) { this.node = { i, j, sx, sz }; this.x = roadC(i) + sx * SW_MID + this.offset; this.z = roadC(j) + sz * SW_MID; this.chooseNext(); }
  nodePos(n) { return [roadC(n.i) + n.sx * SW_MID, roadC(n.j) + n.sz * SW_MID]; }
  chooseNext() {
    const n = this.node; if (!n) return;
    const opts = [];
    // along road j (east-west) heading +x / -x
    if (n.i < N) opts.push([{ i: n.i + 1, j: n.j, sx: -1, sz: n.sz }, 2]);
    if (n.i > 0) opts.push([{ i: n.i - 1, j: n.j, sx: 1, sz: n.sz }, 2]);
    if (n.j < N) opts.push([{ i: n.i, j: n.j + 1, sx: n.sx, sz: -1 }, 2]);
    if (n.j > 0) opts.push([{ i: n.i, j: n.j - 1, sx: n.sx, sz: 1 }, 2]);
    opts.push([{ i: n.i, j: n.j, sx: -n.sx, sz: n.sz }, 1.2], [{ i: n.i, j: n.j, sx: n.sx, sz: -n.sz }, 1.2]);
    // prefer continuing straight
    const prev = this.prevNode;
    let tot = 0; for (const o of opts) { o.w = o[1] * (prev && o[0].i === prev.i && o[0].j === prev.j && o[0].sx === prev.sx && o[0].sz === prev.sz ? 0.15 : 1); tot += o.w; }
    let t = Math.random() * tot, pick = opts[0][0];
    for (const o of opts) { t -= o.w; if (t <= 0) { pick = o[0]; break; } }
    this.prevNode = n; this.node = pick;
  }
  // CHR-06d (ADR-0035): a touchdown at v m/s down (game.land, off a car roof); roll: the player rolled out of it. Below 3 m/s (a 0.5 m drop)
  // the legs take it unseen; to 10 a squat as deep as the drop calls for, shallower and quicker from a lighter one or at a run; harder, onto a hand
  landAnim(v, roll) {
    if (!this.m.skinned || this.dead || (!roll && v < 3)) return;
    endLand(this);
    const kind = roll ? 'roll' : v < 10 ? 'land' : 'hard', hs = Math.hypot(this.vx || 0, this.vz || 0);
    const peak = kind === 'land' ? clamp((v - 2.2) / 6.5, 0, 1) * clamp(1 - (hs - 2) / 4, 0.35, 1) : 1;
    this.landK = { kind, t: 0, cut: -1, peak, in: kind === 'land' ? 0.08 : 0.12, rate: kind === 'land' ? clamp(1 + (9 - v) / 8, 1, 1.6) : 1, w: [0, 0] };
  }
  // CHR-06f (ADR-0035): getting up from a knock-down (Ragdoll.startGetUp; front: on the belly). The clip starts at full weight, the ragdoll
  // blending the pose it lies in into it, and runs on as a layer once control is back, cut short by running off. False without the clips
  upAnim(front) {
    const kind = front ? 'upFront' : 'upBack';
    if (!this.m.skinned || !LANDS[kind].every((s) => this.m.clip(s[0]))) return false;
    endLand(this); this.landK = { kind, t: 0, cut: -1, peak: 1, in: 0, rate: 1, w: [0, 0, 0] };
    return true;
  }
  upTick(dt) { if (this.landK) stepLand(this, dt, 0); }
  liftFeet() { liftFeet(this); }
  hurt(dmg, from, headshot, src) {
    if (this.dead) return;
    const G = this.G;
    this.hp -= dmg;
    this.hitFlash = 0.12;
    if (this.team === 'civ' || this.team === 'gang') { this.threat = from; }
    if (this.team !== 'civ') { this.hurtT = 1.6; if (from && from.x != null) this.mem = { x: from.x, z: from.z, vx: from.vx || 0, vz: from.vz || 0, t: G.time }; }
    if (this.hp <= 0) { this.die(from, src); return true; }
    if (this.m.playOnce && !this.knock && this.speed < 4 && this.m.playOnce(headshot ? 'U_Hit_Head' : 'U_Hit_Chest', false)) this.reactT = 0.4;
    if (this.team === 'civ') { this.state = 'flee'; this.fleeT = rand(6, 10); G.voiceAt?.(this, 'scream'); }
    else if (this.team === 'gang') { this.alert = 1; if (this.state !== 'cover' && this.state !== 'retreat') this.state = 'attack'; G.alertGang?.(this, 'hit'); }
    return false;
  }
  die(from, src) {
    const sp0 = this.speed; endLand(this); this.knockClip = false;
    this.dead = true; this.deadT = 0; this.state = 'dead'; this.speed = 0;
    this.G.onHumanKilled?.(this, src);
    this.fallDir = rand(-1, 1);
    this.m.pistol.visible = false; this.m.rifle.visible = false;
    // physical ragdoll when there is room for one; otherwise the death clip
    const lh = this.lastHit && this.G.time - this.lastHit.t < 0.1 ? this.lastHit : null; this.speed = sp0;
    const rag = this.G.ragdolls?.spawn(this, { cause: lh ? 'bullet' : 'other', alive: false, hit: lh });
    this.speed = 0;
    if (rag) { this.clipDeath = false; return; }
    this.clipDeath = !!(this.m.playOnce && this.m.playOnce('U_Death01'));
    if (this.clipDeath) { this.m.body.rotation.set(0, 0, 0); this.m.body.position.y = 0; }
  }
  ragdoll(vx, vz, up = 4) {
    if (this.G.ragdolls?.knock(this, vx, vz, up)) return;
    const down = this.knock && this.landK && this.landK.kind === 'knock';
    this.knock = 1; this.vx = vx; this.vz = vz; this.vy = up;
    if (down) return;   // already going down: pushed on, the clip plays on
    // CHR-06f: no ragdoll to spare: the clips throw the body onto its back (turned to take the push in the chest) and get it up again; it
    // stays down until it is up, as long as a ragdoll's knock-down takes, where it used to tumble on its feet and run off once it slid to a stop
    this.knockClip = this.m.skinned && !this.dead && LANDS.knock.every((s) => this.m.clip(s[0]));
    if (this.knockClip) {
      endLand(this); if (this.reactT > 0) { this.reactT = 0; this.m.stopOnce(); }
      this.knockRy = Math.hypot(vx, vz) > 0.5 ? Math.atan2(-vx, -vz) : this.ry;
      this.landK = { kind: 'knock', t: 0, cut: -1, peak: 1, in: 0.12, rate: 1, w: [0, 0], until: KNOCK_AIR }; this.ikW = 0;
    }
  }

  update(dt) {
    const G = this.G;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.rag) {   // physical ragdoll owns the body: skeleton is driven by the physics
      if (this.dead) { this.deadT += dt; if (this.deadT > 22) this.group.scale.setScalar(Math.max(0.001, 1 - (this.deadT - 22) * 0.8)); return; }
      if (this.rag.getUpTick(dt)) return;
      return;
    }
    if (this.dead) {
      this.deadT += dt;
      const k = Math.min(1, this.deadT * 3);
      if (this.clipDeath) {
        const cd = Math.hypot(this.x - Human.camX, this.z - Human.camZ);
        if (cd < 75) { if (this.m.unturnHips) this.m.unturnHips(); this.m.mixer.update(dt); this.m.applyPose(0, 0); }
        if (this.knock) { this.stepKnock(dt); }
        if (this.deadT > 22) this.group.scale.setScalar(Math.max(0.001, 1 - (this.deadT - 22) * 0.8));
        return;
      }
      this.m.body.rotation.x = lerp(this.m.body.rotation.x, -1.5, 1 - Math.exp(-10 * dt));
      this.m.body.rotation.z = lerp(this.m.body.rotation.z, this.fallDir * 0.4, 1 - Math.exp(-8 * dt));
      this.m.body.position.y = lerp(this.m.body.position.y, 0.17, 1 - Math.exp(-10 * dt));
      this.m.legL.rotation.x = this.m.legR.rotation.x = 0.2;
      if (this.knock) { this.stepKnock(dt); }
      if (this.deadT > 22) this.group.scale.setScalar(Math.max(0.001, 1 - (this.deadT - 22) * 0.8));
      return;
    }
    if (this.knock) { this.stepKnock(dt); if (this.knock) return; }
    const px = G.player.x, pz = G.player.z;
    const dxp = px - this.x, dzp = pz - this.z, dp = Math.hypot(dxp, dzp);
    let wantX = 0, wantZ = 0, spd = 0, face = null;
    if (this.team === 'civ' && this.static && this.state !== 'flee') {
      face = this.lookAtPlayer && dp < 9 ? Math.atan2(dxp, dzp) : null;
    } else if (this.team === 'civ') {
      if (this.report && this.state !== 'flee') {
        this.report.t -= dt; face = Math.atan2(dxp, dzp);
        if (this.report.t <= 0) { G.addHeat(this.report.heat); G.toast('신고가 접수되었다', '경찰이 출동한다'); this.report = null; this.state = 'walk'; }
      } else if (this.trip) {
        const r = G.society.tripStep(this, dt); wantX = r.x; wantZ = r.z; spd = r.s;
      } else if (this.state === 'route' && this.citizen && G.citizens) {
        const r = G.citizens.steer(this); wantX = r.x; wantZ = r.z; spd = r.s;
      } else if (this.state === 'gone') {
        spd = 0;
      } else if (this.state === 'visit') {
        const r = G.society.visitStep(this, dt); wantX = r.x; wantZ = r.z; spd = r.s;
      } else if (this.state === 'flee') {
        this.fleeT -= dt;
        const t = this.threat || G.player;
        const f = AI.flee(this, dt, t.x, t.z); wantX = f.x; wantZ = f.z; spd = f.s;
        if (this.fleeT <= 0) { if (this.citizen && !this.static) this.state = 'route'; else { this.state = 'walk'; this.snapToNode(); } }
      } else {
        const cm = AI.civMove(this, dt);
        if (cm) { wantX = cm.x; wantZ = cm.z; spd = cm.s; face = cm.face; }
        else if (this.node) {
          const [tx, tz] = this.nodePos(this.node);
          const dx = tx + (this.node.sx ? this.offset * (this.node.along ? 0 : 0) : 0) - this.x, dz = tz - this.z;
          const d = Math.hypot(dx, dz);
          if (d < 1.4) this.chooseNext(); else { wantX = dx / d; wantZ = dz / d; spd = this.stateT > 0 ? 0 : 1.5; }
        }
        if (!this.static) G.society.maybeVisit(this, dt);
        if (!cm) AI.civ(this, dt);
        // stop & stare
        if (this.stateT > 0) this.stateT -= dt;
        else if (Math.random() < dt * 0.04) this.stateT = rand(1.5, 4);
        // startled by nearby fast cars or player gun
        if (G.player.weaponDrawn && dp < 14 && G.playerOnFoot) { this.state = 'flee'; this.fleeT = 6; this.threat = G.player; }
      }
    } else if (this.team === 'gang' || this.team === 'cop') {
      this.updateCombat(dt);
      wantX = this.cmdX || 0; wantZ = this.cmdZ || 0; spd = this.cmdSpeed || 0; face = this.faceAngle;
    }
    // movement integration
    const tvx = wantX * spd, tvz = wantZ * spd;
    this.vx = damp(this.vx, tvx, 9, dt); this.vz = damp(this.vz, tvz, 9, dt);
    let nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    const r = G.world.colliders.resolve(nx, nz, this.radius, this.y);
    this.x = r.x; this.z = r.z; this.blocked = !!r.hit;
    // slide blocked sidewalk walkers: if blocked, pick another node
    if (r.hit && this.team === 'civ' && this.state !== 'flee') { if (Math.random() < 0.05) this.chooseNext(); }
    this.speed = Math.hypot(this.vx, this.vz);
    // vehicles block
    const vls = G.vehicles;
    for (let vi = 0; vi < vls.length; vi++) {
      const v = vls[vi];
      if (!v.group.visible) continue;
      const dx = this.x - v.x, dz = this.z - v.z;
      if (Math.abs(dx) > 4 || Math.abs(dz) > 4) continue;
      const s = Math.sin(v.h), c = Math.cos(v.h);
      const lf = dx * s + dz * c, ll = dx * c - dz * s;
      const hl = v.L / 2 + this.radius, hw = v.W / 2 + this.radius;
      if (Math.abs(lf) < hl && Math.abs(ll) < hw) {
        // push out nearest side
        if (hl - Math.abs(lf) < hw - Math.abs(ll)) { const k = Math.sign(lf) * hl; this.x += s * (k - lf); this.z += c * (k - lf); }
        else { const k = Math.sign(ll) * hw; this.x += c * (k - ll); this.z -= s * (k - ll); }
      }
    }
    // facing
    if (face != null) this.ry = dampAngle(this.ry, face, 12, dt);
    else if (this.speed > 0.4) this.ry = dampAngle(this.ry, Math.atan2(this.vx, this.vz), 9, dt);
    this.animate(dt, spd);
  }
  snapToNode() {
    // pick nearest sidewalk corner as new node
    const G = this.G;
    let best = null, bd = 1e9;
    const i0 = roadIdx(this.x), j0 = roadIdx(this.z);
    for (let i = Math.max(0, i0 - 1); i <= Math.min(N, i0 + 1); i++) for (let j = Math.max(0, j0 - 1); j <= Math.min(N, j0 + 1); j++) for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const n = { i, j, sx, sz }; const [x, z] = this.nodePos(n); const d = Math.hypot(x - this.x, z - this.z); if (d < bd) { bd = d; best = n; }
    }
    this.node = best; this.prevNode = null;
  }
  stepKnock(dt) {
    this.vy -= 9.81 * dt; this.vy -= Math.sign(this.vy) * this.vy * this.vy * (9.81 / 3025) * dt;
    this.x += this.vx * dt; this.z += this.vz * dt; this.y += this.vy * dt;
    const r = this.G.world.colliders.resolve(this.x, this.z, this.radius, this.y); this.x = r.x; this.z = r.z;
    const K = this.landK && this.landK.kind === 'knock' ? this.landK : null;
    const fy = this.floorY || 0; if (this.y <= fy) { this.y = fy; if (K) K.until = Infinity; if (this.vy < -9 && !this.dead) this.hurt((-this.vy - 9) * (-this.vy - 9) * 1.5, null, false, null); if (Math.abs(this.vy) > 3) this.vy *= -0.3; else { this.vy = 0; this.vx *= Math.exp(-6 * dt); this.vz *= Math.exp(-6 * dt); if (Math.hypot(this.vx, this.vz) < 0.3) { if (K) this.vx = this.vz = 0; else this.knock = 0; } } }
    this.group.position.set(this.x, this.y, this.z);
    if (this.knockClip && !K) this.knock = 0;   // up on its feet (or the clip cut short): done, slid to a stop or not
    if (this.dead) this.group.rotation.y = this.ry;
    else if (this.knock && K) { this.ry = dampAngle(this.ry, this.knockRy, 10, dt); this.speed = 0; this.animateSkinned(dt); }
    else { if (this.knock) this.m.body.rotation.x += dt * 9; this.group.rotation.y = this.ry; }   // no clips: the old tumble
    if (!this.knock && !this.dead) { this.m.body.rotation.x = 0; this.state = 'flee'; this.fleeT = 5; }
  }

  // armed AI
  updateCombat(dt) { AI.combat(this, dt); }
  doPatrol(dt) {
    this.patrolT = (this.patrolT || 0) - dt;
    if (this.patrolT <= 0) { this.patrolT = rand(2, 5); const a = rand(0, TAU); this.pdx = Math.sin(a); this.pdz = Math.cos(a); this.pmove = Math.random() < 0.6; }
    if (this.pmove) { this.cmdX = this.pdx; this.cmdZ = this.pdz; this.cmdSpeed = 1.2; this.faceAngle = Math.atan2(this.pdx, this.pdz); }
    // keep near home
    if (this.home) { const dx = this.home.x - this.x, dz = this.home.z - this.z, d = Math.hypot(dx, dz); if (d > 12) { this.cmdX = dx / d; this.cmdZ = dz / d; this.cmdSpeed = 1.6; } }
  }

  animateSkinned(dt) {
    const m = this.m, a = m.act;
    // CHR-06c: the player's legs step at the pace the body really covers the ground (the capsule climbs a stair flight at about three
    // quarters of a run, and stops at a wall), never faster than it is pushed; a jump of 0.5 m in a frame is a teleport, not a pace
    let sp = this.speed;
    if (this.body3 && dt > 0) {
      const real = Math.hypot(this.x - (this._gx ?? this.x), this.z - (this._gz ?? this.z)) / dt; this._gx = this.x; this._gz = this.z;
      this.gSp = real * dt > 0.5 ? sp : damp(this.gSp ?? sp, Math.min(sp, real), 16, dt); sp = Math.min(sp, this.gSp);
    }
    if (this.reactT > 0) {
      this.reactT -= dt;
      if (this.reactT <= 0) { m.stopOnce(); a.Idle.weight = 1; }
      else { if (m.unturnHips) m.unturnHips(); m.mixer.update(dt); m.applyPose(0, 0); this.group.position.set(this.x, this.y, this.z); this.group.rotation.y = this.ry; return; }
    }
    if (m.onceName && !this.dead) m.stopOnce();
    const idle = clamp(1 - sp / 0.6, 0, 1);
    // stance sets: retargeted UAL crouch / swim clips replace the stand set (idle+walk+run) while active
    const swimC = this.swimming, crouchC = !swimC && !this.prone && !this.lying && this.crouching !== false && this.crouch > 0.3 && !m.sit;
    // CHR-06e: lying (a bed, a bench) is the Sleeping clip, on its back with the hips 8 cm over the support at the body's origin
    const sitC = (m.sit || 0) > 0.5, lieC = (this.sleepC = !!this.lying && !sitC && !swimC && !!m.clip('U_Sleeping'));
    const airC = !sitC && !lieC && !swimC && !!this.body3 && !this.body3.grounded && !this.hang && !this.mantle && !this.ladder;
    // CHR-06d: a jump (the ground left going up fast) plays the take-off from where the legs push off, then the air loop; off a ledge, the
    // air loop alone. The take-off comes in quicker than the usual blend, the push lasting a tenth of a second
    if (airC !== !!this._air) { this._air = airC; this.jumpT = airC && (this.vy || 0) > 2 ? 0 : -1; this.jump0 = sp > 3 ? 0.14 : 0.08; }
    if (this.jumpT >= 0) this.jumpT += dt;
    if (this.landK && (airC || this.dead || this.rag || swimC || sitC || m.rideOn || this.inCar)) endLand(this);
    const k = 1 - Math.exp(-(this.jumpT >= 0 && this.jumpT < 0.3 ? 22 : 10) * dt);
    const crawlC = !swimC && !sitC && this.prone && !!m.clip('U_Crawl');
    this.crawling = crawlC;
    const hangC = !!this.hang && !!m.clip('U_Ledge_Hang'), ladC = !hangC && !!(this.mantle && this.mantle.ladder) && !!m.clip('U_Climb_Ladder');
    const set = hangC ? ['U_Ledge_Hang', 'U_Ledge_Hang'] : ladC ? ['U_Ladder_Idle', 'U_Climb_Ladder'] : sitC ? ['U_Sitting_Idle', 'U_Sitting_Idle'] : lieC ? ['U_Sleeping', 'U_Sleeping'] : airC ? ['U_Jump', 'U_Jump'] : swimC ? ['U_Swim_Idle', 'U_Swim_Fwd'] : crawlC ? ['U_Crawl', 'U_Crawl'] : crouchC ? ['U_Crouch_Idle', 'U_Crouch_Fwd'] : null;
    m.sitClip = sitC && !!m.clip('U_Sitting_Idle');
    this.stanceSet = set;
    const moving = ladC ? 1 : clamp(sp / 1.5, 0, 1);
    const wt = { Idle: set ? 0 : idle, Walk: 0, Run: 0, U_Sprint: 0, U_Walk_Backwards: 0, U_Strafe_left: 0, U_Strafe_right: 0, U_Turn_Left_90: 0, U_Turn_Right_90: 0, U_Turn_Left_180: 0, U_Turn_Right_180: 0, U_Swim_Idle: 0, U_Swim_Fwd: 0, U_Crouch_Idle: 0, U_Crouch_Fwd: 0, U_Sitting_Idle: 0, U_Sleeping: 0, U_Jump: 0, U_Jump_Start: 0, U_Crawl: 0, U_Ledge_Hang: 0, U_Ladder_Idle: 0, U_Climb_Ladder: 0 };
    if (set) { if (set[0] === set[1]) wt[set[0]] = 1; else { wt[set[0]] = 1 - moving; wt[set[1]] = moving; } }
    else stepGait(this, dt, sp, 1 - idle, wt);
    if (airC && this.jumpT >= 0) { const js = 1 - ss01((this.jumpT - 0.8) / 0.6); wt.U_Jump_Start = js; wt.U_Jump = 1 - js; }
    const upL = !!this.landK && UPS.has(this.landK.kind);
    stepTurn(this, dt, !set && sp < 0.15 && !m.rideOn && !this.dead && !upL, wt);
    // CHR-06b: the push on the ground that curves or changes the pace, in the body's frame (smoothed: the player's velocity comes from physics steps)
    if (dt > 0) {
      const ax = (this.vx - (this._pvx ?? this.vx)) / dt, az = (this.vz - (this._pvz ?? this.vz)) / dt, s = Math.sin(this.ry), c = Math.cos(this.ry);
      this.accF = damp(this.accF || 0, ax * s + az * c, 6, dt); this.accL = damp(this.accL || 0, ax * c - az * s, 6, dt);
    }
    this._pvx = this.vx; this._pvz = this.vz;
    for (const key in wt) { const act = a[key] || (wt[key] > 0 ? m.clip(key) : null); if (act) act.weight = lerp(act.weight, wt[key], k); }
    if (this.jumpT >= 0 && a.U_Jump_Start) holdAt(a.U_Jump_Start, Math.min(1.66, this.jump0 + this.jumpT));
    const aiming = (this.aimT > 0 || this.forceAim) && this.armed;
    if (this.landK) stepLand(this, dt, sp, aiming);
    if (set && a[set[1]]) a[set[1]].timeScale = crawlC ? clamp(sp / 0.8, 0, 1.6) : set[1] === 'U_Crouch_Fwd' ? clamp(sp / 0.66, 0.6, 3) : clamp(sp / 1.6, 0.6, 1.8);
    // pelvis to where the steps go (gait warp) or where the feet stand (turn in place), net of what a turn clip turns it itself; chest to ry
    syncTurn(this);
    const hipTurn = (this.hipTurn = syncGait(this) + this.legOff - this.turnYaw), backTurn = hipTurn + this.turnChest;
    this.pose = damp(this.pose, aiming ? 1 : 0, 12, dt);
    // distance LOD: fog hides far actors anyway, so skip their skinning and animation
    const cd = Math.hypot(this.x - Human.camX, this.z - Human.camZ);
    m.body.visible = cd < 75;
    const sh = cd < 38; if (sh !== m.shadowOn) { m.shadowOn = sh; for (const o of m.skinMeshes) o.castShadow = sh; }
    if (cd > 75) return;
    if (cd > 35) { this.lodT = (this.lodT || 0) + dt; if ((this.lodF = !this.lodF)) return; dt = this.lodT; this.lodT = 0; }
    // pistol-class weapons use the retargeted UAL upper-body clips (idle / aim up-neutral-down / shoot / reload); the limbs below keep walking
    const freeStance = !m.sit && !this.swimming && !this.prone && !this.lying && !m.rideOn;
    // a gesture or procedural arm motion takes the arms from the held-weapon pose until the weapon is raised again; getting up or knocked
    // down, the clip has them (on the ground) until it is over (CHR-06f: the weapon's upper-body clips under it took the arms back as it faded)
    const busy = !!this.proc || (!!this.gestUB && !aiming) || upL;
    const pistolish = this.armed && this.weapon && this.weapon.short === 'pistol' && freeStance && !busy;
    const riflish = this.armed && this.weapon && this.weapon.short === 'rifle' && freeStance && !!m.setRifleMode && !busy;
    if (m.setRifleMode) m.setRifleMode(riflish);
    if (this.recoil > (this._rc || 0) + 0.4) {
      this.shootT = 0.38;
      if (riflish && this.weapon.pellets) this.pumpT = 0.55;           // shotgun: rack the pump
      if (riflish && this.weapon.name === 'SNIPER') this.boltT = 0.8;  // sniper: work the bolt
    }
    if (this.pumpT > 0) this.pumpT -= dt; if (this.boltT > 0) this.boltT -= dt;
    this._rc = this.recoil;
    if (this.shootT > 0) this.shootT -= dt;
    {
      const pitch = this.aimPitch || 0, up = clamp(pitch / 0.5, 0, 1), dn = clamp(-pitch / 0.5, 0, 1), neu = 1 - Math.max(up, dn);
      const act = pistolish || riflish ? 1 : 0, shoot = this.shootT > 0 ? 1 : 0, rel = this.reloadT > 0 ? 1 : 0;
      const base = act * (rel ? 0 : 1) * (shoot ? 0 : 1), aimK = aiming ? 1 : 0;
      const tw = { UB_Pistol_Idle: base * (1 - aimK), UB_Pistol_Aim_Up: base * aimK * up, UB_Pistol_Aim_Neutral: base * aimK * neu, UB_Pistol_Aim_Down: base * aimK * dn, UB_Pistol_Shoot: act * shoot, UB_Pistol_Reload: act * rel * (1 - shoot) };
      for (const key in tw) {
        let ac = m.act[key]; if (!ac && tw[key] > 0) ac = m.clip(key); if (!ac) continue;
        if (key === 'UB_Pistol_Shoot' && shoot && this.shootT > 0.36) { ac.reset(); ac.play(); }
        if (key === 'UB_Pistol_Reload' && rel && !this._rl) { ac.reset(); ac.play(); }
        ac.weight = lerp(ac.weight, tw[key] * 40, 1 - Math.exp(-14 * dt)); if (ac.weight < 0.4 && tw[key] === 0) ac.weight = 0;
      }
      this._rl = rel;
    }
    // ambient gestures for calm citizens near the player so crowds do not move in lockstep; counter staff use work motions
    const idleStaff = this.static && this.state === 'stand' && !this.scared && !this.sleeping && !this.lying && !this.guard;
    if ((this.citizen || idleStaff) && !this.gestUB && !this.proc && !this.armed && !this.fleeT && (this.state === 'route' || idleStaff) && !this.dead) {
      this._ambT = (this._ambT === undefined ? 4 + Math.random() * 14 : this._ambT) - dt;
      if (this._ambT <= 0) {
        this._ambT = 12 + Math.random() * 25;
        const G = this.G, pl = G && G.player;
        if (pl && Math.hypot(this.x - pl.x, this.z - pl.z) < 45) {
          const list = STAFF[this.role] || AMBIENT, pick = list[(Math.random() * list.length) | 0];
          if (!(idleStaff && procGesture(this, pick))) gesture(this, pick, { upper: true, moving: idleStaff });
        }
      }
    }
    if (this.gestUB) updateGesture(this, dt, aiming);
    if (!this.gestUB && !(this.reactT > 0)) this.gestName = null;
    if (m.setProp) m.setProp((this.gestUB || this.reactT > 0) && !this.dead ? PROPS[this.gestName] || null : null);
    if (m.setMelee) m.setMelee(this.melee && this.cur === 9 ? this.melee.name : null);
    if (m.unturnHips) m.unturnHips();
    m.mixer.update(dt);
    if ((Math.abs(hipTurn) > 0.01 || Math.abs(backTurn) > 0.01) && m.turnHips) m.turnHips(hipTurn, backTurn);
    m.applyPose(pistolish || riflish ? 0 : this.pose, this.aimPitch || 0);
    if (this.proc) updateProc(this, dt);
    if (riflish) {
      const ph = (t, len, delay) => (t > 0 ? Math.max(0, Math.min(1, (len - t - delay) / (len - delay))) : 0);
      m.rifleIK(this.pose, this.aimPitch || 0, { recoil: this.recoil || 0, pump: this.pumpT > 0 ? Math.sin(ph(this.pumpT, 0.55, 0.12) * Math.PI) : 0, bolt: ph(this.boltT, 0.8, 0.15), reload: this.reloadT > 0 && this.weapon.reload ? 1 - this.reloadT / this.weapon.reload : 0 });
    }
    { const sl = m.pistol.userData.slide; if (sl) sl.node.position.x = sl.x0 - Math.min(1, this.recoil || 0) * 0.028; }
    if (this.recoil > 0) { this.recoil = Math.max(0, this.recoil - dt * 8); }
    // CHR-06e: the whole body is lowered or tipped only where no clip holds the pose. The crouch clips take the hips down themselves; a drop
    // under the stand set while the crouch eased in and out sank the body, feet and all, 8 cm going down and 17 cm getting up
    const crouchDrop = !this.stanceSet && this.crouch > 0 && !m.clip('U_Crouch_Idle') ? this.crouch * 0.3 : 0;
    m.body.position.y = -crouchDrop - (m.sitClip ? 0 : (m.sit || 0) * 0.5) - (this.prone && !this.crawling ? 0.62 : 0) - (this.lying && !this.sleepC ? 0.62 : 0);
    const mob = this.body3 && this.G && this.G.mobility, chute = !!(mob && mob.chute) && !this.body3.grounded;
    const freefall = !!this.body3 && !this.body3.grounded && !this.swimming && !this.hang && !chute && !(mob && mob.grap) && (this.vy || 0) < -9;
    this.ffK = damp(this.ffK || 0, freefall ? clamp((-(this.vy || 0) - 9) / 6, 0, 1) : 0, this.body3 && this.body3.grounded ? 14 : 5, dt); this.chK = damp(this.chK || 0, chute ? 1 : 0, 4, dt);
    this.ffTip = damp(this.ffTip || 0, freefall ? AIR_TIP * clamp((-(this.vy || 0) - 12) / 18, 0, 1) : 0, freefall ? 1.5 : 5, dt);
    if (this.ffTip < 1e-3) this.ffTip = 0;
    // CHR-06b: lean as far as that push tips a body (atan(a/g)), pivoting at the feet: into a curve from a walk up (12 deg at most), and
    // forward or back with a change of pace by about a third of it (7 deg at most), less from a standstill
    const lean = !this.stanceSet && !m.rideOn && !this.dead && !this.prone && !this.lying && !this.swimming && !upL ? 1 : 0;
    const leanZ = -lean * clamp(Math.atan(this.accL / 9.81) * clamp((sp - 1) / 3, 0, 1), -0.21, 0.21);
    const leanX = lean * clamp(Math.atan(this.accF / 9.81) * 0.35, -0.12, 0.12) * clamp(0.3 + sp / 3, 0.3, 1);
    m.body.rotation.z = damp(m.body.rotation.z, leanZ, 10, dt);
    // a falling body tips about its hips (the capsule's middle), not its feet
    if (this.ffTip > 0) { m.body.rotation.x = this.ffTip; m.body.position.y += HIP_H * (1 - Math.cos(this.ffTip)); }
    else m.body.rotation.x = damp(m.body.rotation.x, this.swimming ? 0 : this.prone && !this.crawling ? 1.35 : this.lying && !this.sleepC ? -1.5 : leanX, 14, dt);
    m.body.position.z = -HIP_H * Math.sin(this.ffTip);
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.ry;
    if ((this.ffK > 0.01 || this.chK > 0.01) && m.pointBone) { this.windT = (this.windT || 0) + dt; poseAir(this, this.windT); }
    // CHR-06c: standing or stepping on the ground in the stand set (or crouched), not carried, lying, falling or driven by a one-shot clip
    const feetOn = !this.dead && !m.rideOn && !this.inCar && !this.swimming && !this.prone && !this.lying && !m.sit && !this.knock && !this.rag && !this.hang && !this.mantle && !this.ladder && !(this.landK && UPS.has(this.landK.kind)) &&
      (!this.stanceSet || this.stanceSet[0] === 'U_Crouch_Idle') && (!this.body3 || this.body3.grounded) && !(this.G && this.G.carRider && this.G.carRider.roof && this === this.G.player);
    stepFeet(this, dt, cd, feetOn);
    if (upL && cd < IK_NEAR) liftFeet(this);
    if (this.aimT > 0) this.aimT -= dt * 0.5;
  }
  animate(dt, desired) {
    if (this.rag && this.rag.state !== 'GETUP') return;   // the ragdoll drives the skeleton
    if (this.m.skinned) return this.animateSkinned(dt);
    const m = this.m;
    this.phase += this.speed * dt * 2.1;
    const sw = Math.sin(this.phase), amp = clamp(this.speed / 3.2, 0, 1.25);
    m.legL.rotation.x = sw * 0.75 * amp; m.legR.rotation.x = -sw * 0.75 * amp;
    const aiming = this.aimT > 0 || this.forceAim;
    if (aiming && this.armed) {
      this.pose = damp(this.pose, 1, 14, dt);
    } else this.pose = damp(this.pose, 0, 10, dt);
    const swingA = -sw * 0.6 * amp * (1 - this.pose);
    m.armL.rotation.x = lerp(-swingA, -1.35, this.pose * 0.9); m.armL.rotation.z = lerp(0, 0.35, this.pose);
    m.armR.rotation.x = lerp(swingA, -1.5 - (this.recoil || 0) * 1.5, this.pose); m.armR.rotation.z = lerp(0, -0.05, this.pose);
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 8);
    m.body.rotation.x = lerp(0, 0.12 * clamp(this.speed / 5, 0, 1), 1) + (this.pitchLean || 0);
    m.body.rotation.z = 0;
    m.body.position.y = Math.abs(Math.cos(this.phase)) * 0.04 * amp - this.crouch * 0.3;
    m.torso.rotation.y = this.pose * 0.25;
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.y = this.ry;
    if (this.aimT > 0) this.aimT -= dt * 0.5;
  }
}
Human.camX = 0; Human.camZ = 0;
