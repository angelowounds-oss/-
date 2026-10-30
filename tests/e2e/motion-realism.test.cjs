// CHR-06 (ADR-0035): how real the body's motions look, measured on the player's body with the game loop frozen and only the animation stepped.
// (a) foot slip: the body is moved at a set speed in a set direction relative to where it faces (aimed strafes and back steps, walk, run,
//     sprint); the planted foot must stay put on the ground: median ground speed below 0.25 m/s. A foot touches with the lower of its ankle
//     and toe and is planted when that point is the lower of both feet and within 3 cm of its usual lowest (10th percentile), as in
//     assets.js measureGait. The clip carrying the most weight must be one that moves the body that way (its measured direction within 63 deg;
//     the file's strafe clips are named for the viewer's side, so they are told apart by what they do, not by name), and a sprint plays Sprint.
// (b) turning in place: standing, the body turns 90 deg left, 90 deg right or 180 deg within 0.2 s; a turn clip that turns that way must
//     carry the legs round (weight over 0.5), the pelvis must end within 10 deg of the new facing, the chest (across the shoulders) must keep
//     within 15 deg of it meanwhile, and the planted foot must stay put (median below 0.25 m/s). Idle stands with its feet apart front to
//     back and the turns start square, so the blends in and out drag both feet unless they are held (CHR-06c): the total both slide must stay
//     under 0.7 m for a quarter turn and 1.2 m for a half (it was 1.35 and 2.56 before CHR-06b, 2.29 and 2.14 with its turn clips alone).
//     Leaning: running at 5.2 m/s on a left curve (1.2 rad/s) leans the body left (between 3 and 12 deg); speeding up from a standstill
//     leans it forward, stopping leans it back.
// (c) stairs (CHR-06c): the body climbs a tower's stairs (NC-B00_08-0 in the default world) through the game loop, stands on them, turns and
//     goes back down; wherever a foot is slower than 0.3 m/s over a flight, its sole must be within 3 cm of the tread under its ball 95% of
//     the time (the capsule glides up the flight's ramp, the treads are drawn as 14 steps).
// (d) jumps, drops and falls (CHR-06d), through the game loop in the open where the game starts. A jump plays the take-off (Jump_Start over
//     half the pose within 0.12 s of leaving the ground). Dropped from 1 m, 2.5 m and 6 m the body lands as the impact calls for (game.land's
//     speed: a shallow squat, a deep one, onto a hand), and from 6 m running with crouch pressed in the air, it rolls. Nothing jumps from
//     the air pose into the landing: no main bone turns more than 30 deg in a frame from 0.1 s before the touchdown to 0.4 s after (the old
//     one-shot cut to the landing clip's first frame turned bones 70+ deg; the roll clip itself turns a shoulder up to ~28 deg a frame). Falling past 25 m/s the arms and legs are spread (hands at least 2.2 shoulder widths
//     apart), the body tipped forward 35 to 75 deg, and the wind's flutter moves a hand at most 3 cm a frame; under the canopy both hands are
//     above the head.
// (e) no whole-body tricks (CHR-06e), the animation stepped alone: after a punch the body does not tip (it leaned 19 deg for 0.2 s after the
//     clip); crouching down and back up as game.js eases it, the body is not lowered under the clips (it sank 8 and 17 cm) and the crouch
//     still takes the hips 30 cm or more down; lying, the Sleeping clip holds the body on its back on the support (no tip, no drop, hips
//     under 25 cm over it and nothing more than 5 cm under it: it lay 56 cm under before); prone and still, the Crawl clip holds it likewise.
// (f) getting up (CHR-06f), through the game loop. The player's ragdoll is tipped over its feet forward and back (chest pushed one way,
//     shins the other, so it lands on the belly and on the back): the get-up plays the clip for that side (LayToIdle from the back, the
//     push-up and crouch from the belly) with over 90% of the pose 0.4 s in, control comes back when it always did (0.9 s from the belly,
//     1.1 s from the back), a hand is down within 12 cm of the ground while the hips are under 0.5 m (the body pushes itself up; the old
//     get-up floated it up in a morph from the lying pose, hands 24-33 cm up), no bone the skin hangs on goes 10 cm into the ground once
//     the clip has taken over (LayToIdle props itself on an elbow 8 cm down; the old morph swung a toe 34 cm under), no main bone turns more
//     than 30 deg in a frame from the ragdoll's last pose until the clip has played out (the old morph flipped a bone 70-170 deg where the
//     shorter way round changed sides), and the body stands at the end (hips over 0.9 m). With no ragdoll to spare, a 10 m drop lands onto a hand ('hard')
//     instead of nothing, and a citizen knocked down (Human.ragdoll) is thrown onto its back by Hit_Knockback and gets up with LayToIdle (each
//     over 90% of the pose), never lies in the air, does not tumble (it spun 9 rad/s on its feet), faces the push while down (within 15 deg),
//     stands at the end and runs off, down under 4 s.
const { run, freeze, result } = require('../lib.cjs');
run('motion-realism', { q: 1, width: 480, height: 270 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(() => {
    const g = window.__game, pl = g.player, m = pl.m, THREE = window.__THREE, B = m.bones; g.eng.render = () => {};
    pl.dead = false; pl.reactT = 0; pl.stance = 0; pl.crouch = 0; pl.crouching = false; pl.prone = false; pl.swimming = false; pl.gestUB = null; pl.proc = null;
    const home = { x: pl.x, y: pl.y, z: pl.z };
    const body3 = pl.body3; pl.body3 = null;   // on the ground wherever the stepping takes it (the physics body is frozen with the loop)
    // (a) and (b) step the body on through whatever stands there at a fixed height: the feet are not put on that ground (CHR-06c), only held
    const footY = g.phys.footY; g.phys.footY = () => NaN;
    const pts = [B.LeftFoot, B.LeftToeBase, B.RightFoot, B.RightToeBase], v3 = new THREE.Vector3(), dt = 1 / 60, H = pl.constructor;
    // one animation step, the distance LOD's camera kept on the body (the cases walk it far from where the frozen camera stands)
    const anim = () => { H.camX = pl.x; H.camZ = pl.z; pl.animateSkinned(dt); };
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    // moves the body for `frames` frames at `speed` towards `dir` (radians from its facing; + is its left), returns the planted foot's median
    // ground speed and the leg clips that carried the most weight
    const drive = ({ speed, dir = 0, aim = false, frames = 240 }) => {
      pl.armed = aim; pl.ry = 0; pl.aimT = aim ? 1 : 0; pl.forceAim = aim;
      const vx = Math.sin(dir) * speed, vz = Math.cos(dir) * speed, P = [];
      for (let i = 0; i < frames + 90; i++) {
        pl.x += vx * dt; pl.z += vz * dt; pl.vx = vx; pl.vz = vz; pl.speed = speed; pl.ry = 0; if (aim) pl.aimT = 1;
        anim(); pl.group.updateMatrixWorld(true);
        if (i >= 90) P.push(pts.map((b) => b.getWorldPosition(v3).toArray()));
      }
      const { slip, share } = slipOf(P);
      const legs = Object.entries(m.act).filter(([k, a]) => !/^UB_/.test(k) && a.weight > 0.15).sort((p, q) => q[1].weight - p[1].weight);
      const top = legs[0] ? legs[0][0] : '', gd = m.gait[top];
      return { slip, plantedShare: share, clips: legs.slice(0, 3).map(([k, a]) => `${k}:${a.weight.toFixed(2)}`),
        top, dirOk: !!gd && Math.abs(wrap(gd.dir - dir)) < 1.1, hipTurn: +(pl.hipTurn ?? 0).toFixed(2) };
    };
    // planted foot's median ground speed over a run of foot samples
    const slipOf = (P) => {
      const lowOf = (p, f) => (p[2 * f][1] < p[2 * f + 1][1] ? 2 * f : 2 * f + 1), h = (p, f) => p[lowOf(p, f)][1];
      const lo = [0, 1].map((f) => { const s = P.map((p) => h(p, f)).sort((p, q) => p - q); return s[(s.length * 0.1) | 0]; });
      const planted = (i, f) => h(P[i], f) <= h(P[i], 1 - f) + 0.005 && h(P[i], f) < lo[f] + 0.03, v = [];
      for (let i = 0; i + 1 < P.length; i++) for (let f = 0; f < 2; f++) if (planted(i, f) && planted(i + 1, f)) { const b = lowOf(P[i], f); v.push(Math.hypot(P[i + 1][b][0] - P[i][b][0], P[i + 1][b][2] - P[i][b][2]) / dt); }
      const slide = v.reduce((a, x) => a + x * dt, 0); v.sort((p, q) => p - q);
      return { slip: +(v[v.length >> 1] ?? 99).toFixed(2), share: +(v.length / P.length).toFixed(2), slide: +slide.toFixed(2) };
    };
    // yaw of the line across two bones (thighs: pelvis, shoulders: chest), 0 when it faces +z like the body at ry 0
    const yawOf = (l, r) => { const L = l.getWorldPosition(new THREE.Vector3()), R = r.getWorldPosition(new THREE.Vector3()); return Math.atan2(L.x - R.x, L.z - R.z) - Math.PI / 2; };
    const deg = (a) => +(Math.abs(a) * 57.3).toFixed(1);
    const turn = (to) => {
      pl.armed = false; pl.aimT = 0; pl.forceAim = false; pl.vx = pl.vz = 0; pl.speed = 0;
      for (let i = 0; i < 90; i++) { pl.ry = 0; anim(); }
      pl.group.updateMatrixWorld(true);
      const p0 = yawOf(B.LeftUpLeg, B.RightUpLeg), c0 = yawOf(B.LeftArm, B.RightArm), P = [];
      let maxW = 0, clip = '', chest = 0;
      for (let i = 0; i < 180; i++) {
        pl.ry = to * Math.min(1, i / 12); anim(); pl.group.updateMatrixWorld(true);
        for (const n in m.turn) { const a = m.act[n]; if (a && a.weight > maxW) { maxW = a.weight; clip = n; } }
        if (i >= 12) chest = Math.max(chest, Math.abs(wrap(yawOf(B.LeftArm, B.RightArm) - c0 - pl.ry)));
        P.push(pts.map((b) => b.getWorldPosition(v3).toArray()));
      }
      const t = m.turn[clip];
      return { clip, weight: +maxW.toFixed(2), way: !!t && t.end * to > 0, pelvisErr: deg(wrap(yawOf(B.LeftUpLeg, B.RightUpLeg) - p0 - to)), chestErr: deg(chest), slip: slipOf(P).slip, slideM: slipOf(P).slide };
    };
    const lean = () => {
      let hd = 0, vz = 0, fwd = 0, back = 0;
      for (let i = 0; i < 150; i++) {   // a 5.2 m/s run curving left
        hd += 1.2 * dt; const vx = Math.sin(hd) * 5.2, vzz = Math.cos(hd) * 5.2;
        pl.x += vx * dt; pl.z += vzz * dt; pl.vx = vx; pl.vz = vzz; pl.speed = 5.2; pl.ry = hd; anim();
      }
      const side = m.body.rotation.z;
      pl.vx = pl.vz = 0; pl.speed = 0; for (let i = 0; i < 90; i++) { pl.ry = 0; anim(); }
      for (let i = 0; i < 240; i++) {   // from a standstill to 5.2 m/s and back, eased as the NPCs' velocity is (rate 9)
        vz += ((i < 120 ? 5.2 : 0) - vz) * (1 - Math.exp(-9 * dt));
        pl.z += vz * dt; pl.vx = 0; pl.vz = vz; pl.speed = vz; pl.ry = 0; anim();
        if (i < 120) fwd = Math.max(fwd, m.body.rotation.x); else back = Math.min(back, m.body.rotation.x);
      }
      return { sideDeg: +(side * 57.3).toFixed(1), startDeg: +(fwd * 57.3).toFixed(1), stopDeg: +(back * 57.3).toFixed(1) };
    };
    // (c) stairs, through the game's own loop (W held, the camera along the flight): the tallest open tower's first tower floor, flight A (the
    // core's west column, 14 steps up from south to north), run halfway up, stand a second, run to the landing, turn and run back down. Every
    // frame, each foot that is not moving (below 0.3 m/s) over the flight must stand with its sole (from its bones: the lower of ankle and toe
    // joint, less their height over the sole in Idle, m.feet) on the tread under the ball of the foot
    const stairs = () => {
      pl.body3 = body3; g.phys.footY = footY; const keys = g.input.keys, V = THREE.Vector3;
      const bd = g.buildings.list.filter((x) => x.lot.h > 60 && !x.lot.model && !x.lot.far).sort((p, q) => q.lot.h - p.lot.h)[0], d = bd.lot.door;
      body3.teleport(d.px + d.nx * 3, 0, d.pz + d.nz * 3); pl.x = d.px + d.nx * 3; pl.z = d.pz + d.nz * 3;
      for (let i = 0; i < 600 && !bd.open; i++) window.__upd(dt);
      const K = bd.levels.findIndex((l) => l.tier === 'tower'); bd.ensureRange(K - 1, K + 1, true); for (let i = 0; i < 400; i++) window.__upd(dt);
      const L = bd.levels[K], c = bd.core, y0 = L.y, ly = y0 + L.h * 0.45, za = c.zc, zb = c.z0 + 1.6, x = c.x0 + 0.8, n = 14;
      const tread = (z) => y0 + ((ly - y0) * (Math.min(n - 1, Math.max(0, Math.floor(((z - za) / (zb - za)) * n))) + 1)) / n;
      body3.teleport(x, y0, za + 1.5); pl.x = x; pl.y = body3.y; pl.z = za + 1.5; pl.vx = pl.vz = 0; pl.ry = Math.PI;
      const R = m.feet, gaps = [], prev = [null, null]; let top = y0;
      const sample = () => {
        pl.group.updateMatrixWorld(true); top = Math.max(top, pl.y);
        for (let f = 0; f < 2; f++) {
          const A = (f ? B.RightFoot : B.LeftFoot).getWorldPosition(new V()), T = (f ? B.RightToeBase : B.LeftToeBase).getWorldPosition(new V()), p = prev[f], mz = (A.z + T.z) / 2;
          prev[f] = A; if (!p || A.distanceTo(p) / dt > 0.3 || mz > za - 0.05 || mz < zb + 0.05) continue;
          gaps.push(Math.min(A.y - R.ankle, T.y - R.toe) - tread(mz));
        }
      };
      const go = (yaw, until, hold = true) => { for (let i = 0; i < 400; i++) { g.cam.yaw = yaw; if (hold) keys.add('KeyW'); else keys.delete('KeyW'); window.__upd(dt); sample(); if (until(i)) break; } keys.delete('KeyW'); };
      go(Math.PI, () => pl.z < (za + zb) / 2); go(Math.PI, (i) => i >= 60, false);
      go(Math.PI, () => pl.z < zb - 0.4); go(0, (i) => i >= 30, false); go(0, () => pl.z > za + 1);
      const s = gaps.map(Math.abs).sort((p, q) => p - q), pc = (k) => +((s[Math.min(s.length - 1, (s.length * k) | 0)] || 0) * 100).toFixed(1);
      return { uid: bd.uid || bd.lot.uid, samples: s.length, within3cm: +(s.filter((v) => v < 0.03).length / Math.max(1, s.length)).toFixed(3), p50cm: pc(0.5), p95cm: pc(0.95), maxCm: pc(1), climbed: +(top - y0).toFixed(2) };
    };
    // (d) and (f) run the game loop on the player, set back on the ground where the game starts (and dy over it)
    const keys = g.input.keys;
    let lastV = 0; const land0 = g.land; g.land = function (v, w) { lastV = v; return land0.call(this, v, w); };
    const reset = (dy = 0) => {
      keys.clear(); pl.dead = false; pl.hpv = 100; pl.vx = pl.vz = 0; pl.stunT = 0; pl.crouching = false; g.cam.yaw = 0; if (g.mobility.chute) g.mobility.cutAway('land');
      body3.teleport(home.x, home.y, home.z); pl.x = home.x; pl.y = body3.y; pl.z = home.z;
      for (let i = 0; i < 180 && (i < 60 || !body3.grounded); i++) window.__upd(dt);   // settled on the ground (a jump needs it)
      if (dy) { body3.teleport(pl.x, pl.y + dy, pl.z); pl.y = body3.y; }
    };
    // the biggest turn (deg) any main bone of h made since the last call: against its parent, or in the world (world: a get-up turns the
    // body's frame under the lying pose, the pose in the world goes on)
    const MAIN = ['Hips', 'Spine', 'Spine2', 'Neck', 'Head', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg'];
    const snapper = (h, world = false) => {
      const main = MAIN.map((n) => h.m.bones[n]), q = new THREE.Quaternion(), get = (b) => (world ? b.getWorldQuaternion(q) : b.quaternion);
      const prevQ = main.map((b) => get(b).clone());
      const fn = () => { let mx = 0; if (world) h.group.updateMatrixWorld(true); main.forEach((b, i) => { const c = get(b), a = 2 * Math.acos(Math.min(1, Math.abs(c.dot(prevQ[i])))); if (a > mx) { mx = a; fn.bone = MAIN[i]; } prevQ[i].copy(c); }); return mx * 57.2958; };
      return fn;
    };
    const air = () => {
      const V = THREE.Vector3, deg = 180 / Math.PI;
      const snap = snapper(pl);
      const LAND = ['U_Jump_Land', 'U_Land_Three_Point', 'U_Roll'];
      const share = () => { let l = 0, t = 0; for (const k in m.act) { if (k.startsWith('UB_')) continue; const w = m.act[k].weight; t += w; if (LAND.includes(k)) l += w; } return t > 0 ? l / t : 0; };
      const out = {};
      // take-off
      reset(); g.input.edges.jump = 1; let up = -1, js = 0, vy = 0, jt = -1;
      for (let i = 0; i < 60; i++) { window.__upd(dt); if (up < 0 && !body3.grounded) { up = i; vy = pl.vy; } if (up >= 0 && i - up <= 7) { js = Math.max(js, (m.act.U_Jump_Start && m.act.U_Jump_Start.weight) || 0); jt = Math.max(jt, pl.jumpT ?? -1); } }
      out.takeoff = { startW: +js.toFixed(2), upFrame: up, vy: +vy.toFixed(1), jumpT: +jt.toFixed(2), reactT: +(pl.reactT || 0).toFixed(2) };
      // drops (and the roll)
      for (const [name, H, roll] of [['drop1m', 1, false], ['drop2_5m', 2.5, false], ['drop6m', 6, false], ['roll6m', 6, true]]) {
        reset(); if (roll) { keys.add('KeyW'); for (let i = 0; i < 30; i++) window.__upd(dt); } body3.teleport(pl.x, pl.y + H, pl.z); pl.y = body3.y; lastV = 0;
        const snaps = []; let down = -1, kind = 'none', peak = 0;
        for (let i = 0; i < 60 * 3.5; i++) {
          if (roll && !body3.grounded && pl.vy < -7 && !(pl.rollReq > 0)) g.input.edges.crouch = 1;
          window.__upd(dt); snaps.push(snap());
          if (down < 0 && lastV > 0) { down = i; kind = pl.landK ? pl.landK.kind : pl.rag ? 'ragdoll' : 'none'; }
          if (down >= 0) peak = Math.max(peak, share());
          if (down >= 0 && i > down + 60) break;
        }
        keys.clear(); pl.rollReq = -9;
        out[name] = { v: +lastV.toFixed(1), kind, peak: +peak.toFixed(2), snapDeg: down < 0 ? 999 : +Math.max(...snaps.slice(Math.max(0, down - 6), down + 24)).toFixed(1) };
      }
      // freefall
      reset(200); let spread = 0, tip = 0, flut = 0, n = 0, prevH = null;
      for (let i = 0; i < 60 * 4; i++) {
        window.__upd(dt); if (pl.vy > -25) continue;
        pl.group.updateMatrixWorld(true);
        const L = B.LeftHand.getWorldPosition(new V()), R = B.RightHand.getWorldPosition(new V()), sw = B.LeftArm.getWorldPosition(new V()).distanceTo(B.RightArm.getWorldPosition(new V()));
        spread += L.distanceTo(R) / sw; tip += m.body.rotation.x; n++;
        const hl = m.body.worldToLocal(L); if (prevH) flut = Math.max(flut, hl.distanceTo(prevH)); prevH = hl;
      }
      out.freefall = { samples: n, spread: +(spread / Math.max(1, n)).toFixed(2), tipDeg: +(tip / Math.max(1, n) * deg).toFixed(0), flutterCm: +(flut * 100).toFixed(1) };
      // parachute
      reset(120); if (!g.items.count('parachute')) g.items.add('parachute');
      for (let i = 0; i < 90; i++) window.__upd(dt);
      g.mobility.deploy(); for (let i = 0; i < 120; i++) window.__upd(dt); pl.group.updateMatrixWorld(true);
      const hy = B.Head.getWorldPosition(new V()).y;
      out.canopy = { open: !!g.mobility.chute, handsUp: B.LeftHand.getWorldPosition(new V()).y > hy && B.RightHand.getWorldPosition(new V()).y > hy };
      reset();
      return out;
    };
    // (f) getting up. Bone heights are over the body's origin (the ground it gets up on)
    const getUp = () => {
      pl.body3 = body3; g.phys.footY = footY;
      const V = THREE.Vector3, w = new V(), r = (x) => +x.toFixed(2), cm = (x) => +(x * 100).toFixed(0);
      const UP = ['U_LayToIdle', 'U_Pushup', 'U_Land_Three_Point', 'U_Jump_Land', 'U_Hit_Knockback'];
      const shareOf = (h, names) => { let l = 0, t = 0; for (const k in h.m.act) { if (k.startsWith('UB_')) continue; const x = h.m.act[k].weight; t += x; if (names.includes(k)) l += x; } return t > 0 ? l / t : 0; };
      const over = (h, b) => b.getWorldPosition(w).y - h.group.position.y;
      // the bones the skin hangs on (the file's end markers, *_leaf, carry none and stick out past the toes and fingers)
      const skinBones = (h) => h.skinB || (h.skinB = [...new Set(h.m.skinMeshes.flatMap((o) => { const I = o.geometry.attributes.skinIndex, W = o.geometry.attributes.skinWeight, s = [];
        for (let i = 0; i < I.count; i++) { const ix = [I.getX(i), I.getY(i), I.getZ(i), I.getW(i)], wx = [W.getX(i), W.getY(i), W.getZ(i), W.getW(i)]; for (let c = 0; c < 4; c++) if (wx[c] > 0.05) s.push(o.skeleton.bones[ix[c]]); }
        return s; }))]);
      let lowB = ''; const lowest = (h) => { let lo = 9; for (const b of skinBones(h)) { const y = over(h, b); if (y < lo) { lo = y; lowB = b.name; } } return lo; };
      const out = {};
      // the player knocked down by a fall moving forward and backward (onto the belly and the back, as the ragdoll lands)
      for (const [name, sx] of [['fwd', 1], ['back', -1]]) {
        reset(); const snap = snapper(pl, true);
        // tipped over the feet: the chest pushed one way, the shins the other (a push alone lands either way up, by the pose it starts from)
        const d = { x: Math.sin(pl.ry) * sx, z: Math.cos(pl.ry) * sx }, R0 = g.ragdolls.spawn(pl, { cause: 'fall', alive: true, vel: { x: 0, y: 0, z: 0 } });
        if (!R0) { out[name] = { spawned: false }; continue; }
        R0.impulse('chest', { x: d.x * 30, y: 0, z: d.z * 30 }); for (const sg of ['shinL', 'shinR']) R0.impulse(sg, { x: -d.x * 10, y: 0, z: -d.z * 10 });
        let gu = -1, back = -1, end = -1, kind = 'none', front = null, share04 = 0, shareBack = 0, hand = 9, low = 9, snapDeg = 0, snapAt = '', lowAt = '', hipsBack = 0, hipsEnd = 0;
        for (let f = 0; f < 60 * 9 && (end < 0 || f < end + 30); f++) {
          window.__upd(dt); const s = snap(), R = pl.rag;
          if (gu < 0 && R && R.state === 'GETUP') { gu = f; kind = pl.landK ? pl.landK.kind : 'none'; front = R.chestDown; }
          if (gu < 0) continue;
          if (s > snapDeg) { snapDeg = s; snapAt = snap.bone + '@' + ((f - gu) / 60).toFixed(2); } pl.group.updateMatrixWorld(true);
          const hips = over(pl, B.Hips);
          if (f - gu === 24) share04 = shareOf(pl, UP);
          if (f - gu > 21) { const lo = lowest(pl); if (lo < low) { low = lo; lowAt = lowB + '@' + ((f - gu) / 60).toFixed(2); } if (hips < 0.5) hand = Math.min(hand, over(pl, B.LeftHand), over(pl, B.RightHand)); }
          if (back < 0 && !R) { back = f; shareBack = shareOf(pl, UP); hipsBack = hips; }
          if (back >= 0 && end < 0 && !(pl.landK && /^up/.test(pl.landK.kind))) { end = f; hipsEnd = hips; }
        }
        out[name] = { kind, chestDown: front, controlS: r((back - gu) / 60), layerS: r((end - back) / 60), share04: r(share04), shareBack: r(shareBack), handCm: cm(hand), lowCm: cm(low), lowAt, snapDeg: +snapDeg.toFixed(1), snapAt, hipsBackCm: cm(hipsBack), hipsEndCm: cm(hipsEnd) };
      }
      // the same with no ragdoll to spare: a hard landing from 10 m (v 14 m/s) comes down onto a hand instead
      const q = g.eng.q, cap0 = q.ragdolls; q.ragdolls = 0;
      reset(10); lastV = 0; let kind = 'none', rag = false;
      for (let i = 0; i < 240 && !(lastV > 0); i++) { window.__upd(dt); if (lastV > 0) { kind = pl.landK ? pl.landK.kind : 'none'; rag = !!pl.rag; } }
      out.hardNoRag = { v: +lastV.toFixed(1), kind, rag };
      for (let i = 0; i < 120; i++) window.__upd(dt);
      // a citizen knocked down with no ragdoll to spare (Human.ragdoll, legacy path), pushed along +x
      reset(); const C = g.humans[0].constructor, h = new C(g, 'civ', { hp: 50 });
      h.x = pl.x + 3; h.z = pl.z + 3; h.y = h.floorY = pl.y; h.ry = 0; h.static = true; h.group.visible = true; g.humans.push(h); g.scene.add(h.group);
      for (let i = 0; i < 30; i++) window.__upd(dt);
      const snap = snapper(h, true); h.ragdoll(4, 0, 3);
      let f = 0, spin = 0, kb = 0, lay = 0, airLying = 0, snapDeg = 0, snapAt = '', face = 9;
      for (; f < 60 * 6 && h.knock; f++) {
        window.__upd(dt); const s = snap(); if (s > snapDeg) { snapDeg = s; snapAt = snap.bone + '@' + (h.landK ? h.landK.kind + h.landK.t.toFixed(2) : f); } spin = Math.max(spin, Math.abs(h.m.body.rotation.x));
        kb = Math.max(kb, shareOf(h, ['U_Hit_Knockback'])); lay = Math.max(lay, shareOf(h, ['U_LayToIdle']));
        if (h.landK && h.landK.t > 0.31 && h.landK.t < 0.62 && h.y > (h.floorY || 0) + 0.05) airLying++;
        if (h.knock) face = Math.abs(Math.atan2(Math.sin(h.ry + Math.PI / 2), Math.cos(h.ry + Math.PI / 2)));   // while down (up, it runs off)
      }
      h.group.updateMatrixWorld(true);
      out.npcKnock = { rag: !!h.rag, downS: r(f / 60), spinDeg: +(spin * 57.3).toFixed(0), kbShare: r(kb), layShare: r(lay), airLying, snapDeg: +snapDeg.toFixed(1), snapAt,
        faceErrDeg: +(face * 57.3).toFixed(0), hipsEndCm: cm(over(h, h.m.bones.Hips)), state: h.state };
      if (cap0 === undefined) delete q.ragdolls; else q.ragdolls = cap0;
      g.humans.splice(g.humans.indexOf(h), 1); g.scene.remove(h.group);
      reset(); g.land = land0;
      return out;
    };
    const poses = () => {
      pl.body3 = null; g.phys.footY = () => NaN; pl.vx = pl.vz = 0; pl.speed = 0; pl.armed = false; pl.aimT = 0; pl.forceAim = false; pl.ry = 0;
      const ease = (to) => { pl.crouch += (to - pl.crouch) * (1 - Math.exp(-10 * dt)); };
      const loc = (b) => pl.group.worldToLocal(b.getWorldPosition(new THREE.Vector3())), bones = Object.values(B).filter((b) => b && b.isBone);
      const shape = () => { pl.group.updateMatrixWorld(true); let lo = 9; for (const b of bones) lo = Math.min(lo, loc(b).y); return { hipsCm: +(loc(B.Hips).y * 100).toFixed(0), lowCm: +(lo * 100).toFixed(0) }; };
      const cm = (v) => +(v * 100).toFixed(1), held = (n) => +((m.act[n] && m.act[n].weight) || 0).toFixed(2), r = {};
      for (let i = 0; i < 60; i++) anim();
      const stand = shape();
      m.playOnce('U_Punch_Jab', false); pl.reactT = 0.42; let rx = 0;   // as game.js's melee plays it
      for (let i = 0; i < 60; i++) { anim(); rx = Math.max(rx, Math.abs(m.body.rotation.x)); }
      r.punch = { tiltDeg: deg(rx) };
      let dn = 0, upd = 0; pl.stance = 1; pl.crouching = true;
      for (let i = 0; i < 60; i++) { ease(0.65); anim(); dn = Math.min(dn, m.body.position.y); }
      const low = shape(); pl.stance = 0; pl.crouching = false;
      for (let i = 0; i < 60; i++) { ease(0); anim(); upd = Math.min(upd, m.body.position.y); }
      pl.crouch = 0; r.crouch = { downDropCm: cm(dn), upDropCm: cm(upd), hipsDownCm: stand.hipsCm - low.hipsCm };
      pl.lying = true; for (let i = 0; i < 90; i++) anim();
      r.lie = { tiltDeg: deg(m.body.rotation.x), dropCm: cm(m.body.position.y), clipW: held('U_Sleeping'), ...shape() };
      pl.lying = false; for (let i = 0; i < 90; i++) anim();
      pl.stance = 2; pl.crouching = true; pl.prone = true; for (let i = 0; i < 90; i++) { ease(0.2); anim(); }
      r.prone = { tiltDeg: deg(m.body.rotation.x), dropCm: cm(m.body.position.y), clipW: held('U_Crawl'), ...shape() };
      pl.stance = 0; pl.crouching = false; pl.prone = false; pl.crouch = 0; for (let i = 0; i < 90; i++) anim();
      return r;
    };
    const cases = {
      walk: { speed: 1.4 }, aimFwd: { speed: 2.6, aim: true }, aimRight: { speed: 2.6, dir: -Math.PI / 2, aim: true }, aimLeft: { speed: 2.6, dir: Math.PI / 2, aim: true },
      aimBack: { speed: 2.6, dir: Math.PI, aim: true }, aimDiag: { speed: 2.6, dir: -Math.PI / 4, aim: true }, aimBackDiag: { speed: 2.6, dir: Math.PI * 0.75, aim: true },
      run: { speed: 5.2 }, sprint: { speed: 8.4 },
    };
    const out = {}; for (const k in cases) out[k] = drive(cases[k]);
    const turns = { left90: turn(Math.PI / 2), right90: turn(-Math.PI / 2), back180: turn(Math.PI * 0.98) };
    const leanOut = lean();
    pl.armed = false; pl.aimT = 0; pl.forceAim = false; pl.speed = 0; pl.vx = pl.vz = 0;
    const stairsOut = stairs();
    const airOut = air();
    const posesOut = poses();
    const upOut = getUp();
    const gait = Object.fromEntries(Object.entries(m.gait).map(([k, x]) => [k, [+x.spd.toFixed(2), +(x.dir * 180 / Math.PI).toFixed(0), +x.dur.toFixed(2), +x.off.toFixed(2)]]));
    const turnClips = Object.fromEntries(Object.entries(m.turn).map(([k, x]) => [k, [+(x.end * 57.3).toFixed(0), +x.t0.toFixed(2), +x.t1.toFixed(2)]]));
    return { move: out, turns, lean: leanOut, stairs: stairsOut, air: airOut, poses: posesOut, up: upOut, gait, turnClips, feet: m.feet };
  });
  const bad = Object.keys(o.move).filter((k) => { const c = o.move[k]; return !(c.slip < 0.25) || !c.dirOk || (k === 'sprint' && c.top !== 'U_Sprint'); });
  for (const k in o.turns) { const t = o.turns[k]; if (!(t.weight > 0.5 && t.way && t.pelvisErr < 10 && t.chestErr < 15 && t.slip < 0.25 && t.slideM < (k === 'back180' ? 1.2 : 0.7))) bad.push(k); }
  const L = o.lean; if (!(L.sideDeg <= -3 && L.sideDeg >= -12.1 && L.startDeg >= 1.5 && L.startDeg <= 7 && L.stopDeg <= -1)) bad.push('lean');
  const S = o.stairs; if (!(S.samples >= 40 && S.within3cm >= 0.95 && S.climbed > 1)) bad.push('stairs');
  const A = o.air, want = { drop1m: 'land', drop2_5m: 'land', drop6m: 'hard', roll6m: 'roll' };
  if (!(A.takeoff.startW > 0.5)) bad.push('takeoff');
  for (const k in want) if (!(A[k].kind === want[k] && A[k].snapDeg < 30)) bad.push(k);
  if (!(A.drop1m.peak < A.drop2_5m.peak)) bad.push('land depth');
  const F = A.freefall; if (!(F.samples > 20 && F.spread >= 2.2 && F.tipDeg >= 35 && F.tipDeg <= 75 && F.flutterCm <= 3)) bad.push('freefall');
  if (!(A.canopy.open && A.canopy.handsUp)) bad.push('canopy');
  const P = o.poses, flat = (q) => q.tiltDeg < 1 && Math.abs(q.dropCm) < 0.5 && q.clipW > 0.9 && q.hipsCm < 25 && q.lowCm > -5;
  if (!(P.punch.tiltDeg < 1)) bad.push('punch tilt');
  if (!(P.crouch.downDropCm > -0.5 && P.crouch.upDropCm > -0.5 && P.crouch.hipsDownCm >= 30)) bad.push('crouch drop');
  if (!flat(P.lie)) bad.push('lying');
  if (!flat(P.prone)) bad.push('prone');
  const U = o.up;
  for (const k of ['fwd', 'back']) {
    const u = U[k], dur = u.chestDown ? 0.9 : 1.1;
    if (!(u.kind === (u.chestDown ? 'upFront' : 'upBack') && u.share04 > 0.9 && Math.abs(u.controlS - dur) < 0.05 && u.snapDeg < 30 && u.handCm < 12 && u.lowCm > -10 && u.hipsEndCm > 90)) bad.push('get up ' + k);
  }
  if (U.fwd.kind === U.back.kind) bad.push('get up sides');
  if (!(U.hardNoRag.kind === 'hard' && !U.hardNoRag.rag)) bad.push('hard landing, no ragdoll');
  const N = U.npcKnock;
  if (!(!N.rag && N.spinDeg < 5 && N.kbShare > 0.9 && N.layShare > 0.9 && N.airLying === 0 && N.snapDeg < 30 && N.faceErrDeg < 15 && N.hipsEndCm > 85 && N.state === 'flee' && N.downS < 4)) bad.push('knock-down, no ragdoll');
  result('motion-realism', bad.length === 0, o, bad.length ? 'off: ' + bad.join(', ') : '');
});
