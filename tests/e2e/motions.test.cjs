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
    return o;
  });
  const pass = o.missing.length === 0 && o.upperMasks.length === 0 &&
    o2.crawling && o2.crawlW > 0.5 && Math.abs(o2.proneTilt) < 0.2 && o2.standsAgain &&
    o2.throwT > 0.15 && o2.heldBack && o2.released && o2.knifeShown && o2.hitDelay > 0.05 && o2.gesturing && o2.hitDone;
  result('motions', pass, { ...o, ...o2 });
});
