// CHR-01: the player character (assets/character_game.glb, rig adapted in src/assets.js adaptCharacter). It loads, faces +Z like the old Soldier,
// has every clip the game plays, stands / sits / crouches at the heights the vehicle and cover offsets were tuned for, keeps its feet out of the
// ground in the locomotion clips, holds the pistol in its hand, never produces a stretched (exploded) skin, and falls as a ragdoll without NaNs.
const { run, freeze, result } = require('../lib.cjs');
run('character', { q: 1, width: 480, height: 270 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(() => {
    const g = window.__game, THREE = window.__THREE, pl = g.player, m = pl.m, o = {}; g.eng.render = () => {};   // no drawing: SwiftShader frames are slow and nothing here needs pixels
    const wp = (b) => m.bones[b].getWorldPosition(new THREE.Vector3());
    o.loaded = !!(m.playOnce && m.bones && m.bones.Hips);
    if (!o.loaded) return o;
    o.bones = Object.keys(m.bones).length;
    const box = new THREE.Box3().setFromObject(m.group); o.height = +(box.max.y - box.min.y).toFixed(2);
    const need = ['U_Idle', 'U_Walk', 'U_Jog_Fwd', 'U_Sprint', 'U_Crouch_Idle', 'U_Crouch_Fwd', 'U_Jump_Start', 'U_Jump', 'U_Jump_Land', 'U_Roll', 'U_Swim_Idle', 'U_Swim_Fwd',
      'U_Sitting_Enter', 'U_Sitting_Idle', 'U_Sitting_Exit', 'U_Driving', 'U_Push', 'U_PickUp_Table', 'U_Interact', 'U_Punch_Jab', 'U_Punch_Cross', 'U_Hit_Chest', 'U_Hit_Head', 'U_Death01', 'U_Dance',
      'U_Pistol_Idle', 'U_Pistol_Aim_Up', 'U_Pistol_Aim_Neutral', 'U_Pistol_Aim_Down', 'U_Pistol_Shoot', 'U_Pistol_Reload',
      'UB_Pistol_Idle', 'UB_Pistol_Aim_Up', 'UB_Pistol_Aim_Neutral', 'UB_Pistol_Aim_Down', 'UB_Pistol_Shoot', 'UB_Pistol_Reload'];
    o.missing = need.filter((n) => !m.act[n] && !m.clip(n));
    for (const k of ['Idle', 'Walk', 'Run']) if (!m.act[k]) o.missing.push(k);
    // pose helper: group upright at the origin of its own frame, clip sampled at a fraction of its length
    pl.group.rotation.set(0, 0, 0); pl.group.updateMatrixWorld(true);
    const loc = (b) => pl.group.worldToLocal(wp(b)).toArray();
    const at = (name, f) => { const a = m.act[name] || m.clip(name); m.playOnce(name, true); a.time = f * a.getClip().duration * 0.999; m.mixer.update(0); pl.group.updateMatrixWorld(true); return a; };
    at('U_Idle', 0);
    const lf = loc('LeftFoot'), lt = loc('LeftToeBase'), la = loc('LeftArm'), ra = loc('RightArm'), hip = loc('Hips');
    o.faces = +(lt[2] - lf[2]).toFixed(2);              // toes ahead of the foot along +Z
    o.leftArmX = +(la[0] - ra[0]).toFixed(2);           // the Soldier's left arm is on +X
    o.hipIdle = hip.map((v) => +v.toFixed(2));
    at('U_Sitting_Idle', 0.5); o.hipSit = loc('Hips').map((v) => +v.toFixed(2));
    at('U_Driving', 0.5); o.hipDrive = loc('Hips').map((v) => +v.toFixed(2));
    at('U_Crouch_Idle', 0.5); o.hipCrouch = loc('Hips').map((v) => +v.toFixed(2));
    // ground clearance and skin sanity over locomotion clips (lowest bone >= -0.10 m, furthest bone from the hips < 1.6 m, everything finite)
    const lo = {}; let bad = 0, far = 0;
    const probe = ['Head', 'Hips', 'LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase', 'LeftHand', 'RightHand'];
    for (const n of ['U_Idle', 'U_Walk', 'U_Jog_Fwd', 'U_Sprint', 'U_Crouch_Fwd', 'U_Jump_Land', 'U_Roll', 'U_Punch_Jab', 'U_Hit_Chest', 'U_Dance', 'U_Pistol_Aim_Neutral', 'U_Pistol_Shoot']) {
      let low = 9;
      for (let i = 0; i <= 8; i++) {
        at(n, i / 8); const h = loc('Hips');
        for (const b of probe) { const p = loc(b); if (!p.every(Number.isFinite)) bad++; low = Math.min(low, p[1]); far = Math.max(far, Math.hypot(p[0] - h[0], p[1] - h[1], p[2] - h[2])); }
      }
      lo[n] = +low.toFixed(2);
    }
    o.lowest = Math.min(...Object.values(lo)); o.lowestClip = Object.keys(lo).find((k) => lo[k] === o.lowest);
    o.nonFinite = bad; o.farthest = +far.toFixed(2);
    // the pistol sits in the right hand
    at('U_Pistol_Aim_Neutral', 0.5);
    const gun = m.hand.getWorldPosition(new THREE.Vector3()); o.gunToHand = +gun.distanceTo(wp('RightHand')).toFixed(2); o.gunVisible = m.pistol.visible;
    m.stopOnce && m.stopOnce();
    // ragdoll: falls, stays finite
    g.ragdolls.spawn(pl, { cause: 'bail', alive: false, vel: { x: 0, y: 0, z: -3 } });
    for (let i = 0; i < 150; i++) window.__upd(1 / 60);
    pl.group.updateMatrixWorld(true);
    const rp = wp('Hips'), rh = wp('Head'), rf = wp('LeftFoot');
    o.ragFinite = [rp, rh, rf].every((p) => Number.isFinite(p.x + p.y + p.z)); o.ragHipsY = +(rp.y - pl.group.position.y).toFixed(2);
    return o;
  });
  const near = (a, b, t) => a.every((v, i) => Math.abs(v - b[i]) <= t);
  const pass = o.loaded && o.bones >= 60 && Math.abs(o.height - 1.82) < 0.1 && o.missing.length === 0 &&
    o.faces > 0.05 && o.leftArmX > 0.2 &&
    o.hipIdle[1] > 0.95 && o.hipIdle[1] < 1.1 &&
    near(o.hipSit, [0, 0.66, -0.28], 0.18) && near(o.hipDrive, [0, 0.66, -0.26], 0.18) && o.hipCrouch[1] > 0.45 && o.hipCrouch[1] < 0.7 &&
    o.lowest > -0.1 && o.nonFinite === 0 && o.farthest < 1.6 &&
    o.gunToHand < 0.2 && o.gunVisible && o.ragFinite && o.ragHipsY < 0.9;
  result('character', pass, o);
});
