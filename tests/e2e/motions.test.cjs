// CHR-04: the life and combat motions. Every motion clip loads on the player's body, gestures play over standing and walking and end by
// themselves, prone movement uses the crawl clip, a grenade leaves the hand at the end of the throw swing, and a knife swing lands after its
// wind-up instead of at the click.
const { run, freeze, result } = require('../lib.cjs');
run('motions', { q: 1, width: 480, height: 270 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, pl = g.player, m = pl.m, o = {}; g.eng.render = () => {};
    const names = ['Greeting', 'Head_Nod', 'Yes', 'Reject', 'Confused', 'Insult', 'Salute', 'Bow', 'Help_One_Arm', 'Help_Two_Arms', 'Idle_Listening', 'Cheer_One_arm', 'Cheering_Two_Hands',
      'Victory', 'Angry', 'Dizzy', 'Shivering', 'Idle_FoldArms', 'Idle_TalkingPhone', 'Meditate', 'Sitting_Talking', 'Sleeping', 'Throw_Object', 'OverhandThrow', 'Walk_Carry', 'Consume',
      'Consume_Item', 'Chest_Open', 'Fixing_Kneeling', 'Farm_Harvest', 'Chop_Tree', 'Fishing_Cast', 'Golf_Drive', 'Jumping_Jacks', 'Pushup', 'Crawl', 'LayToIdle', 'Zombie_Rise',
      'Turn_Left_90', 'Walk_Backwards', 'Strafe_left', 'Walk_Stealth', 'Climb_Ladder', 'Ledge_Hang', 'Run_Jump', 'Hit_Knockback', 'Death_B', 'Fighting_Idle', 'Melee_Hook', 'Zombie_Walk',
      'Idle_Sword', 'Sword_Regular_A', 'Sword_Regular_B', 'Sword_Regular_C', 'Sword_Attack'];
    o.missing = names.filter((n) => !m.act['U_' + n] && !m.clip('U_' + n));
    o.clips = g.eng && Object.keys(m.act).length;
    // gesture over standing: starts, blends in, ends by itself
    o.upperMasks = ['Greeting', 'OverhandThrow', 'Sword_Regular_A'].filter((n) => !m.clip('UB_' + n));
    const step = (n) => { for (let i = 0; i < n; i++) window.__upd(1 / 60); };
    pl.dead = false; pl.reactT = 0; pl.speed = 0;
    // counter staff pick work motions on their own
    const npc = g.life.npc(null, { npcs: [], interact: [] }, pl.x + 3, pl.y || 0, pl.z + 3, { role: 'cashier' }); npc.group.visible = true; npc._ambT = 0; npc.m.setProp && 0;
    let seen = false; for (let i = 0; i < 30 && !seen; i++) { step(2); seen = !!(npc.proc || npc.gestUB || npc.reactT > 0); }
    o.staffGesture = seen;
    return o;
  });
  // the gesture module is bundled, not importable: drive it through the game's own player methods
  const o2 = await page.evaluate(async () => {
    const g = window.__game, pl = g.player, m = pl.m, o = {}, step = (n) => { for (let i = 0; i < n; i++) window.__upd(1 / 60); };
    pl.dead = false; pl.reactT = 0; pl.prone = false; pl.stance = 0; step(30);
    // crawl: prone uses the crawl clip, body low, no pseudo-prone tilt
    pl.stance = 2; step(60);
    o.crawling = !!pl.crawling; o.crawlW = +(m.act.U_Crawl ? m.act.U_Crawl.weight : 0).toFixed(2); o.proneTilt = +m.body.rotation.x.toFixed(2);
    pl.stance = 0; step(60);
    o.standsAgain = !pl.crawling && Math.abs(m.body.rotation.x) < 0.1;
    // grenade: delayed release
    g.items.add('grenade', 2); const have0 = g.items.count('grenade'); const nade = () => [...g.items.props.values()].filter((p) => p.id === 'grenade').length, n0 = nade();
    g.input.edges.nade = 1; step(2);
    o.throwT = +(pl.throwT || 0).toFixed(2); o.heldBack = nade() === n0 && g.items.count('grenade') === have0 - 1;
    step(60); o.released = nade() === n0 + 1 && !(pl.throwT > 0);
    // knife: wind-up, then the blow
    g.items.add('knife'); g.equipMelee('knife'); step(5);
    o.knifeShown = !!m.bones && pl.melee && pl.melee.name === '단검';
    pl.fireCd = 0; g.meleeAttack(); o.hitDelay = +(pl.meleeHitT || 0).toFixed(2); o.gesturing = !!pl.gestUB; step(40); o.hitDone = !(pl.meleeHitT > 0) && !pl.gestUB;
    // foot slide: the speed at which the stance foot moves back in a locomotion clip (a check on the clips; the game measures its own step
    // tables from them at load, assets.js measureGait)
    const THREE = window.__THREE; pl.group.rotation.set(0, 0, 0); pl.group.updateMatrixWorld(true); o.stance = {};
    for (const n of ['Walk', 'Run']) {
      const a = m.act[n] || m.clip(n); m.playOnce(n, true); const dur = a.getClip().duration, N = 120, z = [], y = [];
      for (let i = 0; i <= N; i++) { a.time = (i / N) * dur * 0.9999; m.mixer.update(0); pl.group.updateMatrixWorld(true); const p = pl.group.worldToLocal(m.bones.LeftFoot.getWorldPosition(new THREE.Vector3())), q = pl.group.worldToLocal(m.bones.RightFoot.getWorldPosition(new THREE.Vector3())); z.push([p.z, q.z]); y.push([p.y, q.y]); }
      const v = []; for (let i = 0; i < N; i++) for (let f = 0; f < 2; f++) if (y[i][f] < y[i][1 - f] && y[i][f] < Math.min(...y.map((r) => r[f])) + 0.02) v.push(-(z[i + 1][f] - z[i][f]) / (dur / N));
      v.sort((p, q) => p - q); o.stance[n] = +(v[v.length >> 1] || 0).toFixed(2);
    }
    m.stopOnce(); pl.reactT = 0;
    // procedural arm motion: bends the arm while it runs and ends by itself
    const { procGesture } = window.__gesture;
    const fa = () => m.bones.RightForeArm.quaternion.toArray().map((v) => +v.toFixed(3)).join();
    pl.speed = 0; step(3); const q0 = fa(); o.procStart = procGesture(pl, 'handshake'); step(40); o.procBends = fa() !== q0; step(240); o.procEnds = !pl.proc;
    // menu gesture, drinking
    pl.reactT = 0; pl.gestUB = null; step(5);
    pl.armed = true; pl.aimT = 0; pl.forceAim = false; o.menuWave = g.gestures.play('wave') && pl.gestUB === 'UB_Greeting'; step(40); o.armedKeeps = !!pl.armed && pl.gestUB === 'UB_Greeting' && m.act.UB_Greeting.weight > 10; step(380); o.menuDone = !pl.gestUB;
    g.items.add('water'); g.items.use('water'); o.drinks = pl.gestUB === 'UB_Consume_Item'; step(10); o.cup = m.prop; step(500); o.cupGone = !m.prop;
    return o;
  });
  const pass = o.missing.length === 0 && o.upperMasks.length === 0 &&
    o2.crawling && o2.crawlW > 0.5 && Math.abs(o2.proneTilt) < 0.2 && o2.standsAgain &&
    o2.throwT > 0.15 && o2.heldBack && o2.released && o2.knifeShown && o2.hitDelay > 0.05 && o2.gesturing && o2.hitDone && Math.abs(o2.stance.Walk - 0.9) < 0.25 && Math.abs(o2.stance.Run - 5.2) < 0.8 && o2.procStart && o2.procBends && o2.procEnds && o2.menuWave && o2.armedKeeps && o2.menuDone && o2.drinks && o2.cup === 'cup' && o2.cupGone && o.staffGesture;
  result('motions', pass, { ...o, ...o2 });
});
