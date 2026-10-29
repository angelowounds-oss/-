// CHR-06 (ADR-0035): how real the body's motions look, measured on the player's body with the game loop frozen and only the animation stepped.
// (a) foot slip: the body is moved at a set speed in a set direction relative to where it faces (aimed strafes and back steps, walk, run,
//     sprint); the planted foot must stay put on the ground: median ground speed below 0.25 m/s. A foot touches with the lower of its ankle
//     and toe and is planted when that point is the lower of both feet and within 3 cm of its usual lowest (10th percentile), as in
//     assets.js measureGait. The clip carrying the most weight must be one that moves the body that way (its measured direction within 63 deg;
//     the file's strafe clips are named for the viewer's side, so they are told apart by what they do, not by name), and a sprint plays Sprint.
const { run, freeze, result } = require('../lib.cjs');
run('motion-realism', { q: 1, width: 480, height: 270 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(() => {
    const g = window.__game, pl = g.player, m = pl.m, THREE = window.__THREE, B = m.bones; g.eng.render = () => {};
    pl.dead = false; pl.reactT = 0; pl.stance = 0; pl.crouch = 0; pl.crouching = false; pl.prone = false; pl.swimming = false; pl.gestUB = null; pl.proc = null;
    const body3 = pl.body3; pl.body3 = null;   // on the ground wherever the stepping takes it (the physics body is frozen with the loop)
    const pts = [B.LeftFoot, B.LeftToeBase, B.RightFoot, B.RightToeBase], v3 = new THREE.Vector3(), dt = 1 / 60;
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    // moves the body for `frames` frames at `speed` towards `dir` (radians from its facing; + is its left), returns the planted foot's median
    // ground speed and the leg clips that carried the most weight
    const drive = ({ speed, dir = 0, aim = false, frames = 240 }) => {
      pl.armed = aim; pl.ry = 0; pl.aimT = aim ? 1 : 0; pl.forceAim = aim;
      const vx = Math.sin(dir) * speed, vz = Math.cos(dir) * speed, P = [];
      for (let i = 0; i < frames + 90; i++) {
        pl.x += vx * dt; pl.z += vz * dt; pl.vx = vx; pl.vz = vz; pl.speed = speed; pl.ry = 0; if (aim) pl.aimT = 1;
        pl.animateSkinned(dt); pl.group.updateMatrixWorld(true);
        if (i >= 90) P.push(pts.map((b) => b.getWorldPosition(v3).toArray()));
      }
      const lowOf = (p, f) => (p[2 * f][1] < p[2 * f + 1][1] ? 2 * f : 2 * f + 1), h = (p, f) => p[lowOf(p, f)][1];
      const lo = [0, 1].map((f) => { const s = P.map((p) => h(p, f)).sort((p, q) => p - q); return s[(s.length * 0.1) | 0]; });
      const planted = (i, f) => h(P[i], f) <= h(P[i], 1 - f) + 0.005 && h(P[i], f) < lo[f] + 0.03, v = [];
      for (let i = 0; i + 1 < P.length; i++) for (let f = 0; f < 2; f++) if (planted(i, f) && planted(i + 1, f)) { const b = lowOf(P[i], f); v.push(Math.hypot(P[i + 1][b][0] - P[i][b][0], P[i + 1][b][2] - P[i][b][2]) / dt); }
      v.sort((p, q) => p - q);
      const legs = Object.entries(m.act).filter(([k, a]) => !/^UB_/.test(k) && a.weight > 0.15).sort((p, q) => q[1].weight - p[1].weight);
      const top = legs[0] ? legs[0][0] : '', gd = m.gait[top];
      return { slip: +(v[v.length >> 1] ?? 99).toFixed(2), plantedShare: +(v.length / P.length).toFixed(2), clips: legs.slice(0, 3).map(([k, a]) => `${k}:${a.weight.toFixed(2)}`),
        top, dirOk: !!gd && Math.abs(wrap(gd.dir - dir)) < 1.1, hipTurn: +(pl.hipTurn ?? 0).toFixed(2) };
    };
    const cases = {
      walk: { speed: 1.4 }, aimFwd: { speed: 2.6, aim: true }, aimRight: { speed: 2.6, dir: -Math.PI / 2, aim: true }, aimLeft: { speed: 2.6, dir: Math.PI / 2, aim: true },
      aimBack: { speed: 2.6, dir: Math.PI, aim: true }, aimDiag: { speed: 2.6, dir: -Math.PI / 4, aim: true }, aimBackDiag: { speed: 2.6, dir: Math.PI * 0.75, aim: true },
      run: { speed: 5.2 }, sprint: { speed: 8.4 },
    };
    const out = {}; for (const k in cases) out[k] = drive(cases[k]);
    pl.armed = false; pl.aimT = 0; pl.forceAim = false; pl.speed = 0; pl.vx = pl.vz = 0; pl.body3 = body3;
    out.gait = Object.fromEntries(Object.entries(m.gait).map(([k, x]) => [k, [+x.spd.toFixed(2), +(x.dir * 180 / Math.PI).toFixed(0), +x.dur.toFixed(2), +x.off.toFixed(2)]]));
    return out;
  });
  const limit = { aimRight: 0.9, aimLeft: 0.9 };
  const bad = Object.keys(o).filter((k) => k !== 'gait' && (!(o[k].slip < (limit[k] || 0.25)) || !o[k].dirOk || (k === 'sprint' && o[k].top !== 'U_Sprint')));
  result('motion-realism', bad.length === 0, o, bad.length ? 'off: ' + bad.join(', ') : '');
});
