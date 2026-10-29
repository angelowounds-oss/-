// gameplay (PHY-04): getting up from a knock-down must give back the body it started with. The mixer does not write every bone (Root, toes,
// fingers); those must end where they were before the fall, or the body faces away from the character and the feet twist, worse with every
// fall. The player (fall) and a civilian (shove) are knocked down twice each; after every get-up, each bone the mixer leaves alone must be
// within 1 degree of its pose before the first fall, and no bone may go non-finite during the blend.
const { run, freeze, result } = require('../lib.cjs');
run('ragdoll-getup', { q: 1 }, async ({ page }) => {
  await freeze(page);
  const res = await page.evaluate(() => {
    const g = window.__game, pl = g.player, H = g.humans[0].constructor; g.eng.render = () => {};
    const step = (n) => { for (let i = 0; i < n; i++) window.__upd(1 / 60); };
    // bones the mixer does not write: nudge them all, run the mixer once, see which came back. The mixer only writes a value that changed
    // since it last ran, and the leg and turn clips play on a set time (CHR-06a/b: timeScale 0), so every clip is first moved on by a step
    // no probe has used yet
    let probe = 0;
    const unwritten = (m) => {
      const names = Object.keys(m.bones), q0 = names.map((n) => m.bones[n].quaternion.clone()), e = 1e-4 * ++probe;
      for (const n of names) m.bones[n].quaternion.set(0.5, 0.5, 0.5, 0.5);
      for (const k in m.act) m.act[k].time += e; m.mixer.update(1e-6); for (const k in m.act) m.act[k].time -= e;
      const kept = names.filter((n) => { const q = m.bones[n].quaternion; return Math.abs(q.x - 0.5) < 1e-6 && Math.abs(q.w - 0.5) < 1e-6; });
      names.forEach((n, i) => m.bones[n].quaternion.copy(q0[i]));
      return kept;
    };
    const deg = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.dot(b)))) * 57.2958;
    const test = (h, knock) => {
      step(60);
      const names = unwritten(h.m), ref = Object.fromEntries(names.map((n) => [n, h.m.bones[n].quaternion.clone()]));
      const rounds = [];
      for (let r = 0; r < 2; r++) {
        if (!knock()) { rounds.push({ spawned: false }); continue; }
        let f = 0, sawGetUp = false, nonFinite = 0;
        for (; f < 900 && (h.rag || f < 5); f++) {
          window.__upd(1 / 60);
          if (h.rag && h.rag.state === 'GETUP') { sawGetUp = true; for (const n in h.m.bones) { const q = h.m.bones[n].quaternion; if (!Number.isFinite(q.x + q.y + q.z + q.w)) nonFinite++; } }
        }
        step(60);
        // a civilian runs off afterwards: bones the running clip writes are animated again, not left over from the fall
        const still = new Set(unwritten(h.m)); let worst = 0, worstBone = null;
        for (const n of names) { if (!still.has(n)) continue; const d = deg(ref[n], h.m.bones[n].quaternion); if (d > worst) { worst = d; worstBone = n; } }
        rounds.push({ spawned: true, sawGetUp, frames: f, back: !h.rag, nonFinite, worst: +worst.toFixed(2), worstBone });
      }
      return { unwritten: names.length, rounds };
    };
    const out = {};
    out.player = test(pl, () => !!g.ragdolls.spawn(pl, { cause: 'fall', alive: true, vel: { x: 4, y: 0, z: 1 } }));
    const h = new H(g, 'civ', { hp: 50 }); h.x = pl.x + 3; h.z = pl.z + 3; h.y = pl.y; h.static = true; h.group.visible = true; g.humans.push(h); g.scene.add(h.group);
    out.npc = test(h, () => { h.state = 'idle'; return g.ragdolls.knock(h, 6, -2, 3); });
    return out;
  });
  const ok = (t) => t.unwritten > 0 && t.rounds.every((r) => r.spawned && r.sawGetUp && r.back && r.nonFinite === 0 && r.worst < 1);
  result('ragdoll-getup', ok(res.player) && ok(res.npc), res);
});
