// gameplay: war machines (warcraft.js). The army base holds a tank, a VTOL fighter and an attack helicopter under guard; each can be boarded,
// driven / flown and fired (shells explode where they land, ammo is finite); an enemy unit shot up badly lets its crew out and can be taken;
// leaving an aircraft in the air ejects with a parachute; and a sniper scope stays up after the click.
const { run, freeze, result } = require('../lib.cjs');
run('war-craft', { q: 0, width: 480, height: 270 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(() => {
    const g = window.__game, W = g.war, pl = g.player, o = {}; g.eng.render = () => {};
    const real = g.input.read.bind(g.input), set = (p) => { g.input.read = (dt) => ({ ...real(dt), ...p }); }, step = (n) => { for (let i = 0; i < n; i++) window.__upd(1 / 60); };
    o.base = !!W.base; o.kinds = W.slots.map((s) => s.kind + (s.v ? '' : '!')).join(','); o.guards = (W.crew || []).length; o.hud = !!document.getElementById('warhud');
    const slot = (k) => W.slots.find((s) => s.kind === k).v;
    const board = (v) => { pl.body3.teleport(v.x + 6, 0, v.z); pl.x = v.x + 6; pl.z = v.z; step(20); g.enterVehicle(v); step(2); };

    // sniper scope: one click keeps it up (shots and reloads do not drop it), the next click puts it down
    pl.owned[4] = true; g.switchWeapon(4); step(5);
    set({ aim: true }); step(2); set({ aim: false }); step(5); o.scopeKept = pl.aiming === true; set({ fire: true }); step(1); set({}); step(10); o.scopeAfterShot = pl.aiming === true;
    set({ aim: true }); step(2); set({ aim: false }); step(5); o.scopeOff = pl.aiming === false; g.switchWeapon(0); set({}); step(2);

    // tank: boarding the guarded vehicle is a theft (wanted level), it drives, the turret follows the camera, a shell explodes where it lands
    const T = slot('tank'); const booms = []; const ex = g.explosion.bind(g); g.explosion = (x, y, z, r, d, src) => { booms.push({ x, y, z, r, d, mine: src === T }); return ex(x, y, z, r, d, src); };
    board(T); o.tankIn = g.vehicle === T; o.tankWanted = g.wanted; o.kit = T.war && T.war.w.map((w) => w.name);
    const x0 = T.x; set({ gas: 1, my: 1 }); step(200); o.tankMoved = +Math.abs(T.x - x0).toFixed(1);
    set({}); step(150); o.tankStopped = +T.speed.toFixed(2);
    g.cam.yaw = T.h + 1.0; g.cam.pitch = 0.05; set({}); step(150); o.turYaw = +(T.turYaw || 0).toFixed(2);
    const a0 = T.war.w[0].ammo; set({ fire: true }); step(3); set({}); o.shellAmmoUsed = a0 - T.war.w[0].ammo; o.shellsFlying = W.proj.length; step(240); o.shellExploded = booms.some((b) => b.mine && b.r >= 7);
    const m0 = T.war.w[1].ammo; set({ aim: true }); step(40); set({}); o.mgUsed = Math.round(m0 - T.war.w[1].ammo);
    const hud = document.getElementById('warhud'); o.hudOn = hud.classList.contains('on'); o.pipShown = document.getElementById('warPip').style.display !== 'none';
    g.exitVehicle(true); step(5);

    // fighter: vertical thrust lifts it off the pad, throttle gives speed, leaving it high up ejects with the parachute
    const J = slot('jet'); board(J); g.cam.yaw = -1.57; set({ hand: true }); step(200); o.jetAlt = +(J.by - J.spec.cy).toFixed(1);
    set({ hand: true, gas: 1, my: 1 }); step(90); o.jetSpeed = +J.speed.toFixed(1);
    const jm = J.war.w[1].ammo; set({ aim: true }); step(3); set({}); o.missileUsed = jm - J.war.w[1].ammo;
    J.by > 0 && (set({ hand: true }), step(120)); const alt = J.by - J.spec.cy; g.exitVehicle(); step(3);
    o.ejectAlt = +alt.toFixed(0); o.ejected = !!g.mobility.chute || pl.y > 5; o.chute = !!g.mobility.chute;
    g.mobility.cutAway?.('test'); pl.y = 0; pl.body3.teleport(pl.x, 0, pl.z);

    // attack helicopter: lifts off, fires rockets
    const H = slot('gunship'); if (!H.dead) { board(H); g.input.keys.add('Space'); step(240); o.gunshipAlt = +(H.by - H.spec.cy).toFixed(1); const r0 = H.war.w[1].ammo; set({ aim: true }); step(30); set({}); o.rocketsUsed = Math.round(r0 - H.war.w[1].ammo); g.input.keys.delete('Space'); set({ sprint: true }); step(400); set({}); g.exitVehicle(true); step(3); }

    // capture: a shot-up enemy tank leaves its crew behind and the machine can be boarded
    g.wanted = 5; pl.body3.teleport(0, 0, 0); pl.x = 0; pl.z = 0; step(5);
    g.military.spawnTank(); const e = g.military.tank[g.military.tank.length - 1];
    if (e) { e.hp = e.maxHp * 0.2; step(10); o.tankLeft = e.gone === true; const cap = g.vehicles.find((v) => v.captured && v.spec.war === 'tank'); o.tankCaptured = !!cap; if (cap) { board(cap); o.captureIn = g.vehicle === cap; g.exitVehicle(true); } }
    g.military.spawnHeli(); const he = g.military.heli[g.military.heli.length - 1];
    if (he) { he.hp = he.maxHp * 0.2; he.x = pl.x + 20; he.z = pl.z + 20; he.y = 6; he.vx = he.vz = 0; step(700); o.heliCaptured = g.vehicles.some((v) => v.captured && v.spec.war === 'gunship'); }
    return o;
  });
  const pass = o.base && o.kinds === 'tank,jet,gunship' && o.guards >= 6 && o.hud && o.scopeKept && o.scopeAfterShot && o.scopeOff
    && o.tankIn && o.tankWanted >= 4 && o.tankMoved > 8 && o.tankStopped < 0.5 && Math.abs(o.turYaw - 1.0) < 0.3 && o.shellAmmoUsed === 1 && o.shellExploded && o.mgUsed > 5 && o.hudOn && o.pipShown
    && o.jetAlt > 5 && o.jetSpeed > 30 && o.missileUsed === 1 && o.ejected && o.gunshipAlt > 4 && o.rocketsUsed >= 2 && o.tankLeft && o.tankCaptured && o.captureIn && o.heliCaptured;
  result('war-craft', pass, o);
});
