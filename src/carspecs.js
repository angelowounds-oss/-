// The cars' dimensions and handling, as data (no three.js): models.js builds the bodies from them, physics.js drives them, and the Node
// vehicle lab (build/lab/carlab.mjs) measures them.
// Handling from real cars (ADR-0042, the physics-reality test): mass x 1300 kg (1.5 t sedan and sports car, 2 t SUV, 5 t truck), power kW, accel the
// launch limit m/s^2, maxSpeed the governor m/s, grip the tyres' friction coefficient, cda the drag area m^2, crr the rolling resistance
// Drive trains (EV-12): the engine's torque over its revs as five points (share of the redline, share of the peak torque), the gear ratios and
// the shift time. The peak torque and the final drive are derived (drivetrain()): the curve's peak power is the spec's power, and the top gear
// at the redline reaches a little past the governor. Electric cars (gears: null) keep the ideal constant-power pull.
const PETROL = [[0.12, 0.6], [0.3, 0.86], [0.55, 1], [0.8, 0.95], [1, 0.8]], DIESEL = [[0.2, 0.7], [0.35, 1], [0.6, 1], [0.85, 0.86], [1, 0.7]];
export const DT = {
  sedan: { curve: PETROL, redline: 6500, idle: 750, gears: [4.1, 2.35, 1.52, 1.14, 0.87, 0.69], shift: 0.25, launch: 0.32, drive: 'F' },
  sport: { curve: PETROL, redline: 8000, idle: 900, gears: [3.6, 2.4, 1.75, 1.38, 1.12, 0.94, 0.79, 0.64], shift: 0.09, launch: 0.38, drive: 'A' },
  suv: { curve: PETROL, redline: 6000, idle: 700, gears: [4.7, 3.1, 2.1, 1.67, 1.29, 1.0, 0.84, 0.67], shift: 0.22, launch: 0.3, drive: 'A' },
  truck: { curve: DIESEL, redline: 3200, idle: 600, gears: [6.4, 3.8, 2.4, 1.55, 1.0, 0.78], shift: 0.5, launch: 0.38, drive: 'R' },
  bus: { curve: DIESEL, redline: 2600, idle: 550, gears: [4.2, 2.6, 1.7, 1.25, 1.0, 0.8], shift: 0.45, launch: 0.4, drive: 'R' },
  moto: { curve: PETROL, redline: 12500, idle: 1300, gears: [2.8, 2.05, 1.65, 1.4, 1.22, 1.1], shift: 0.07, launch: 0.35, drive: 'R' },
};
export const CAR_SPECS = {
  sedan: { L: 4.7, W: 1.88, belt: 0.95, roof: 1.46, wb: 1.4, cab: [-1.25, -0.8, 0.7, 1.15], hood: 0.82, mass: 1.15, maxSpeed: 58, accel: 4.2, grip: 0.95, hp: 100, track: 0.8, power: 125, cda: 0.65, crr: 0.011, dt: DT.sedan, peakDeg: 4.5 },
  sport: { L: 4.5, W: 1.95, belt: 0.78, roof: 1.2, wb: 1.38, cab: [-1.1, -0.55, 0.55, 1.1], hood: 0.62, mass: 1.15, maxSpeed: 90, accel: 9.6, grip: 1.2, hp: 85, track: 0.85, power: 450, cda: 0.7, crr: 0.012, dt: DT.sport, peakDeg: 4 },
  suv: { L: 4.9, W: 2.0, belt: 1.12, roof: 1.78, wb: 1.5, cab: [-2.0, -1.8, 0.8, 1.35], hood: 1.02, mass: 1.54, maxSpeed: 57, accel: 3.9, grip: 0.9, hp: 140, track: 0.88, power: 160, cda: 0.95, crr: 0.012, dt: DT.suv, peakDeg: 5 },
  truck: { L: 6.3, W: 2.2, belt: 1.2, roof: 2.9, wb: 2.0, cab: [-0.2, -0.1, 2.1, 2.45], hood: 1.0, mass: 3.85, maxSpeed: 30.5, accel: 1.8, grip: 0.75, hp: 220, track: 0.95, boxy: true, power: 125, cda: 4.2, crr: 0.008, dt: DT.truck, peakDeg: 6 },
};

// absurdly fast electric roadster: the sport car's body with a rocket booster (boost: Shift, see Vehicle.applyDrive)
CAR_SPECS.roadster = { ...CAR_SPECS.sport, mass: 0.85, maxSpeed: 300, accel: 62, grip: 14, power: 40000, cda: 0.5, hp: 140, boost: true, title: '로드스터', dt: null };

// the derived drive train of a spec (cached on the spec): peak torque N m from the power, the final drive from the governor (wheel radius r m)
export function drivetrain(spec, r) {
  const key = spec.power + '/' + spec.maxSpeed;   // tuning (engine mods) and the copies of a spec change these: derive again then
  if (spec._dtKey === key) return spec._dt;
  spec._dtKey = key;
  const d = spec.dt; if (!d || !d.gears) return (spec._dt = null);
  const rpmW = (f) => f * d.redline * Math.PI / 30;   // engine rad/s at a share of the redline
  let best = 0; for (let f = 0.1; f <= 1.0001; f += 0.01) best = Math.max(best, torqueShare(d.curve, f) * rpmW(f));
  const peak = (spec.power ?? 120) * 1000 / best, top = d.gears[d.gears.length - 1], final = rpmW(1) * r / (top * spec.maxSpeed * 1.06);
  return (spec._dt = { ...d, peak, final, r });
}
// the torque curve's share of the peak at a share of the redline (linear between the five points, flat beyond them)
export function torqueShare(curve, f) {
  if (f <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) if (f <= curve[i][0]) { const [a, ta] = curve[i - 1], [b, tb] = curve[i]; return ta + (tb - ta) * (f - a) / (b - a); }
  return curve[curve.length - 1][1];
}
