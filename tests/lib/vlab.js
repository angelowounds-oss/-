// Vehicle lab scenarios (EV-10): skid pad, slalom, ISO 3888-1 double lane change, lift-off in a turn, braking dry / wet / storm, a 20 % hill
// start, a speed bump, and a bike's lean. One plain function with no imports, so the same code runs in Node on the game's physics
// (build/lab/vehicle-lab.mjs) and in the page on the game's own Vehicle (tests/e2e/vehicle-lab.test.cjs, which evaluates this file's text).
//
// The adapter A (all lengths m, speeds m/s, angles rad, the track along +x at z = 0 on flat ground y = A.Y):
//   A.place(x, z, h, speed, y?, quat?)  puts the car at rest or moving forward, heading h (forward = (sin h, cos h))
//   A.step(ctl)                          one 1/60 s step with ctl = { t, b, s, hand } (s: the steering input -1..1 as the player gives it)
//   A.state()                            { x, y, z, vx, vy, vz, fwd, h, yaw, roll, pitch, up }
//   A.maxSteer(v)                        the wheel angle the steering input 1 gives at forward speed v
//   A.wb, A.W                            wheelbase, body width (W optional, 1.8 m)
//   A.wet(w)                             road wetness (0 dry, 1 rain, 1.4 storm)
//   A.box(cx, cy, cz, hx, hy, hz, q)     a static box collider (q: rotation quaternion {x, y, z, w} or null)
//   A.yield()                            optional: give the page a breath
async function vehicleLab(A, only) {
  const out = {}, G = 9.81, DT = 1 / 60, clamp = (v, a, b) => Math.max(a, Math.min(b, v)), wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const want = (k) => !only || only.includes(k);
  let steps = 0;
  const step = async (ctl, n = 1) => { for (let i = 0; i < n; i++) { A.step(ctl); if (++steps % 120 === 0 && A.yield) await A.yield(); } };
  // the sign of the steering input that turns the car left (+yaw): found once by a short pulse, so the lab needs no convention from the game
  A.place(0, 0, Math.PI / 2, 10); await step({ t: 0.2, b: 0, s: 0 }, 20); await step({ t: 0.2, b: 0, s: 0.5 }, 20);
  const SGN = A.state().yaw > 0 ? 1 : -1;
  // steering input for a wanted wheel angle d (rad, + turns left) at forward speed v
  const sIn = (d, v) => clamp(SGN * d / Math.max(0.02, A.maxSteer(Math.abs(v))), -1, 1);
  // pure pursuit: the wheel angle that bends the path through a point (tx, tz) ahead
  const pursue = (S, tx, tz) => { const dx = tx - S.x, dz = tz - S.z, ld = Math.hypot(dx, dz) || 1, a = wrap(Math.atan2(dx, dz) - S.h); return Math.atan(2 * A.wb * Math.sin(a) / ld); };
  // speed hold: throttle / brake toward v
  const hold = (S, v) => { const e = v - S.fwd; return { t: clamp(0.15 + e * 0.6, 0, 1), b: clamp(-e * 0.4, 0, 1) }; };
  // a path z = f(x) along the track, followed at speed v (coast: throttle off after the start, as ISO 3888 asks); returns the worst
  // cross-track error over [x0, x1] and whether the car spun or left the path for good
  const follow = async (f, v, x0, x1, coast = false, gate = null) => {   // gate(x): the half-room the car's centre has there (null: free), errors scaled by it
    A.place(x0 - 60, f(x0 - 60), Math.PI / 2, v); let worst = 0, spun = false, guard = 0;
    while (true) {
      const S = A.state(); if (S.x > x1 || ++guard > 60 * 40) break;
      const ld = Math.max(5, 0.55 * Math.abs(S.fwd)), d = pursue(S, S.x + ld, f(S.x + ld));
      const sp = coast && S.x > x0 ? { t: 0, b: 0 } : hold(S, v);
      await step({ ...sp, s: sIn(d, S.fwd) });
      if (S.x >= x0) { const e = Math.abs(S.z - f(S.x)), g = gate ? gate(S.x) : 1; if (g !== null) worst = Math.max(worst, e / g); }
      if (Math.abs(wrap(S.h - Math.PI / 2)) > 1.3 || S.up < 0.6) { spun = true; break; }
    }
    return { worst, spun };
  };
  // the highest speed (km/h, 1 km/h steps by bisection between lo and hi) at which follow() stays within tol
  const maxSpeed = async (f, x0, x1, tol, lo, hi, coast, gate) => {
    let ok = null; const tries = [];
    while (hi - lo > 1) { const m = Math.round((lo + hi) / 2), r = await follow(f, m / 3.6, x0, x1, coast, gate); tries.push([m, +r.worst.toFixed(2), r.spun]); if (!r.spun && r.worst <= tol) { ok = m; lo = m; } else hi = m; }
    return { kmh: ok, tries };
  };

  // ---- skid pad: a 30 m circle, the speed raised 1 km/h every 1.5 s; the last speed still on the circle (within 1 m) gives the lateral g, with the
  // body's side slip and roll there
  if (want('skidpad')) {
    const R = 30, cx = 0, cz = R; let v = 25 / 3.6, best = null, off = 0, t = 0;
    A.place(0, 0, Math.PI / 2, v);
    for (let k = 0; k < 60 * 120; k++) {
      const S = A.state(), a = Math.atan2(S.x - cx, S.z - cz), r = Math.hypot(S.x - cx, S.z - cz), ah = a - Math.max(5, 0.5 * S.fwd) / R;   // counter-clockwise seen from above: angle decreasing
      const d = pursue(S, cx + Math.sin(ah) * R, cz + Math.cos(ah) * R);
      await step({ ...hold(S, v), s: sIn(d, S.fwd) });
      t += DT; if (t > 1.5) { t = 0; v += 1 / 3.6; }
      if (Math.abs(r - R) < 1) { off = 0; if (S.fwd > 5) { const beta = wrap(Math.atan2(S.vx, S.vz) - S.h); best = { kmh: +(S.fwd * 3.6).toFixed(1), latG: +(S.fwd * S.fwd / R / G).toFixed(3), slipDeg: +(Math.abs(beta) * 57.3).toFixed(1), rollDeg: +(Math.abs(S.roll) * 57.3).toFixed(1) }; } }
      else if (++off > 90 || S.up < 0.6) break;
    }
    out.skidpad = best;
  }
  // ---- slalom: cones every 18 m, the car weaving 1.5 m either side of them; the highest speed through 10 cones within 0.7 m of the line
  if (want('slalom')) out.slalom = await maxSpeed((x) => (x < 0 ? 0 : 1.5 * Math.sin(Math.PI * x / 18)), 0, 180, 0.7, 30, 100);
  // ---- ISO 3888-1 double lane change (3.5 m offset; 15 m lane, 30 m change, 25 m lane, 25 m change, 30 m lane), throttle off from the entry.
  // Only the three lanes are gated, as the cones are: lane widths 1.1 W + 0.25, 1.2 W + 0.25 and 1.3 W + 0.25 for a car W wide, so the centre
  // has (lane - W) / 2 either side; the transitions are free (cutting them is allowed, as on the real course)
  if (want('iso3888')) {
    const W = A.W || 1.8, f = (x) => (x < 15 ? 0 : x < 45 ? 1.75 * (1 - Math.cos(Math.PI * (x - 15) / 30)) : x < 70 ? 3.5 : x < 95 ? 1.75 * (1 + Math.cos(Math.PI * (x - 70) / 25)) : 0);
    const room = (k) => (k * W + 0.25 - W) / 2, gate = (x) => (x < 15 ? room(1.1) : x < 45 ? null : x < 70 ? room(1.2) : x < 95 ? null : room(1.3));
    out.iso3888 = await maxSpeed(f, 0, 125, 1, 40, 130, true, gate);
  }
  // ---- lift-off in a turn: a 40 m circle at 0.6 g, then the throttle shut with the steering held; the yaw rate after 1 s over before
  // (> 1: the car tucks in, the lift-off oversteer of a front-driven or balanced car; < 1: it runs wide)
  if (want('liftoff')) {
    const R = 40, cx = 0, cz = R, v = Math.sqrt(0.6 * G * R); let s = 0, y0 = 0, r0 = 0;
    A.place(0, 0, Math.PI / 2, v);
    for (let k = 0; k < 60 * 8; k++) { const S = A.state(), a = Math.atan2(S.x - cx, S.z - cz), ah = a - Math.max(5, 0.5 * S.fwd) / R; s = sIn(pursue(S, cx + Math.sin(ah) * R, cz + Math.cos(ah) * R), S.fwd); await step({ ...hold(S, v), s }); }
    { const S = A.state(); y0 = Math.abs(S.yaw); r0 = Math.hypot(S.x - cx, S.z - cz); }
    await step({ t: 0, b: 0, s }, 60);
    const S = A.state();
    out.liftoff = { kmh: +(v * 3.6).toFixed(1), radiusBefore: +r0.toFixed(1), yawGain: +(Math.abs(S.yaw) / (y0 || 1)).toFixed(3), radiusAfter: +Math.hypot(S.x - cx, S.z - cz).toFixed(1) };
  }
  // ---- braking 100-0 km/h, full pedal, dry / rain / storm (other surfaces need a surface model: EV-13)
  if (want('brake')) {
    out.brake = {};
    for (const [k, w] of [['dry', 0], ['wet', 1], ['storm', 1.4]]) {
      A.wet(w); A.place(-600, 0, Math.PI / 2, 100 / 3.6); await step({ t: 0.3, b: 0, s: 0 }, 2);
      const x0 = A.state().x; let n = 0; while (A.state().fwd > 0.3 && n++ < 60 * 20) await step({ t: 0, b: 1, s: 0 });
      out.brake[k] = +(A.state().x - x0).toFixed(1);
    }
    A.wet(0);
  }
  // ---- hill start: a 20 % ramp (11.3 deg). Held for 3 s with no input and with the handbrake (how far it slides back), then full throttle from rest: the time to climb 10 m
  if (want('hill')) {
    const th = Math.atan(0.2), cx = 1500, cy = A.Y - 40, hx = 200, s2 = Math.sin(th / 2), c2 = Math.cos(th / 2);
    A.box(cx, cy, 0, hx, 1, 20, { x: 0, y: 0, z: s2, w: c2 });
    const ys = (x) => cy + Math.cos(th) + (x - (cx - Math.sin(th))) * Math.tan(th);   // the ramp's top surface at x
    const x = cx - 40, q1 = Math.sin(Math.PI / 4), p1 = Math.cos(Math.PI / 4);
    // the game's brake pedal reverses at a standstill, so a held car is one with no input (the idle brake) or the handbrake
    const held = async (ctl) => { A.place(x, 0, Math.PI / 2, 0, ys(x) + 0.95, { x: -s2 * q1, y: c2 * q1, z: p1 * s2, w: c2 * p1 }); await step(ctl, 60); const xa = A.state().x; await step(ctl, 120); return xa - A.state().x; };
    const slide = await held({ t: 0, b: 0, s: 0 }), slideHand = await held({ t: 0, b: 0, s: 0, hand: true });
    const x0 = A.state().x; let t = 0; while (A.state().x < x0 + 10 * Math.cos(th) && t < 20) { await step({ t: 1, b: 0, s: 0 }); t += DT; }
    out.hill = { gradePct: 20, holdSlideM: +slide.toFixed(2), handSlideM: +slideHand.toFixed(2), climb10mS: t >= 20 ? null : +t.toFixed(2) };
  }
  // ---- speed bump: 75 mm high, 0.9 m long, crossed at 30 km/h; the peak vertical acceleration of the body and the most it pitched
  if (want('bump')) {
    const bx = -300; A.box(bx, A.Y + 0.0375, 0, 0.45, 0.0375, 6, null);
    A.place(bx - 15, 0, Math.PI / 2, 30 / 3.6); let vy = A.state().vy, peak = 0, pitch = 0, lift = 0, y0 = null;
    for (let k = 0; k < 60 * 4; k++) { const S0 = A.state(); await step({ ...hold(S0, 30 / 3.6), s: 0 }); const S = A.state(); if (S.x > bx - 3 && S.x < bx + 8) { if (y0 === null) y0 = S0.y; peak = Math.max(peak, Math.abs(S.vy - vy) / DT); pitch = Math.max(pitch, Math.abs(S.pitch)); lift = Math.max(lift, S.y - y0); } vy = S.vy; }
    out.bump = { kmh: 30, peakVertG: +(peak / G).toFixed(2), pitchDeg: +(pitch * 57.3).toFixed(1), bodyRiseM: +lift.toFixed(3) };
  }
  // ---- lean: a 25 m circle at 30 km/h; a bike leans atan(v^2 / g r) into it (16 deg), a car rolls out of it a little
  if (want('lean')) {
    const R = 25, cx = 0, cz = R, v = 30 / 3.6; let roll = 0, n = 0;
    A.place(0, 0, Math.PI / 2, v);
    for (let k = 0; k < 60 * 8; k++) { const S = A.state(), a = Math.atan2(S.x - cx, S.z - cz), ah = a - Math.max(5, 0.5 * S.fwd) / R; await step({ ...hold(S, v), s: sIn(pursue(S, cx + Math.sin(ah) * R, cz + Math.cos(ah) * R), S.fwd) }); if (k > 300) { roll += S.roll; n++; } }
    out.lean = { kmh: 30, radius: R, rollDeg: +(roll / n * 57.3).toFixed(1), idealBikeLeanDeg: +(Math.atan(v * v / (G * R)) * 57.3).toFixed(1) };
  }
  out.steps = steps;
  return out;
}
if (typeof module !== 'undefined') module.exports = { vehicleLab };
