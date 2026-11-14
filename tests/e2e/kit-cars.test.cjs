// KayKit taxi and police sedans (assets/patch-cc0, models.js buildKitCar): a police car and a taxi are built from the CC0 models, keep
// buildCar's return contract (the fields vehicle.js reads), sit on the ground at the sedan's length, and their wheels turn and steer as the car
// drives.
// Pass: both are kit models with four wheel nodes, 4.6-4.8 m long, lowest point within 5 cm of a procedural sedan's, wheels turned after 2 s of driving,
// and the front wheels steered while the rear ones are not.
const { run, freeze, result } = require('../lib.cjs');
run('kit-cars', { q: 1, width: 640, height: 360 }, async ({ page }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, T = window.__test, THREE = window.__THREE;
    const yieldN = async (n) => { for (let k = 0; k < n; k++) { T.step(1); if (k % 2) await new Promise((f) => setTimeout(f, 0)); } };
    const keys = ['group', 'spec', 'paint', 'dark', 'head', 'tail', 'brake', 'front', 'rear', 'fa', 'ra', 'ug', 'beams', 'headSprites', 'tailSprites', 'siren', 'wheelR', 'syncWheels'];
    const out = {};
    const x0 = g.player.x + 6, z0 = g.player.z + 6;
    // the box of the car's own meshes in its own frame (sprites and the glow planes are effects, not the car)
    const localBox = (m) => {
      const box = new THREE.Box3(), probe = new THREE.Box3(), inv = new THREE.Matrix4(), mm = new THREE.Matrix4();
      m.group.updateMatrixWorld(true); inv.copy(m.group.matrixWorld).invert();
      m.group.traverse((c) => { if (!c.isMesh || c.parent === m.group) return; if (!c.geometry.boundingBox) c.geometry.computeBoundingBox(); probe.copy(c.geometry.boundingBox).applyMatrix4(mm.multiplyMatrices(inv, c.matrixWorld)); box.union(probe); });
      return box;
    };
    // a procedural sedan for the ground line the kit cars must match
    const ref = T.spawn('sedan', x0 - 25, z0, 0, 'lab'); await yieldN(30); const rb = localBox(ref.model); out.refGround = +rb.min.y.toFixed(3);
    for (const [k, as, opts] of [['police', 'police', {}], ['taxi', 'traffic', { taxi: true }]]) {
      const v = T.spawn('sedan', x0 + (k === 'taxi' ? 25 : 0), z0, 0, 'lab', 0x777777, undefined, as, opts);
      const m = v.model, kit = !!m.syncWheels && !m.glass;
      await yieldN(30);
      const box = localBox(m);
      const wheels = []; m.group.traverse((c) => { if (/wheel_(front|rear)_(left|right)$/.test(c.name)) wheels.push(c); });
      const q0 = wheels.map((w) => w.quaternion.clone());
      v.throttle = 0.6; v.steer = 0.6; v.steerA = 0.3;
      await yieldN(120);
      v.throttle = 0; v.brake = 1;
      const turned = wheels.filter((w, i) => w.quaternion.angleTo(q0[i]) > 0.05).length;
      m.syncWheels(0, 0.3);
      const steerOf = (re) => wheels.filter((w) => re.test(w.name)).map((w) => { const e = new THREE.Euler().setFromQuaternion(w.quaternion, 'YXZ'); return +e.y.toFixed(2); });
      out[k] = { kit, missing: keys.filter((f) => m[f] === undefined), wheels: wheels.length, len: +(box.max.z - box.min.z).toFixed(2), wid: +(box.max.x - box.min.x).toFixed(2), ground: +box.min.y.toFixed(3),
        wheelR: +m.wheelR.toFixed(3), turned, frontSteer: steerOf(/front/), rearSteer: steerOf(/rear/), siren: !!m.siren, speed: +v.speed.toFixed(1) };
    }
    return out;
  });
  const ok = (r) => r && r.kit && !r.missing.length && r.wheels === 4 && r.len > 4.6 && r.len < 4.8 && Math.abs(r.ground - o.refGround) < 0.05 && r.turned === 4
    && r.frontSteer.every((s) => Math.abs(s) > 0.2) && r.rearSteer.every((s) => Math.abs(s) < 0.01);
  result('kit-cars', ok(o.police) && ok(o.taxi) && o.police.siren, o);
});
