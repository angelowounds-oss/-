// The cars' dimensions and handling, as data (no three.js): models.js builds the bodies from them, physics.js drives them, and the Node
// vehicle lab (build/lab/carlab.mjs) measures them.
// Handling from real cars (ADR-0042, the physics-reality test): mass x 1300 kg (1.5 t sedan and sports car, 2 t SUV, 5 t truck), power kW, accel the
// launch limit m/s^2, maxSpeed the governor m/s, grip the tyres' friction coefficient, cda the drag area m^2, crr the rolling resistance
export const CAR_SPECS = {
  sedan: { L: 4.7, W: 1.88, belt: 0.95, roof: 1.46, wb: 1.4, cab: [-1.25, -0.8, 0.7, 1.15], hood: 0.82, mass: 1.15, maxSpeed: 58, accel: 4.2, grip: 0.95, hp: 100, track: 0.8, power: 125, cda: 0.65, crr: 0.011 },
  sport: { L: 4.5, W: 1.95, belt: 0.78, roof: 1.2, wb: 1.38, cab: [-1.1, -0.55, 0.55, 1.1], hood: 0.62, mass: 1.15, maxSpeed: 90, accel: 9.6, grip: 1.15, hp: 85, track: 0.85, power: 450, cda: 0.7, crr: 0.012 },
  suv: { L: 4.9, W: 2.0, belt: 1.12, roof: 1.78, wb: 1.5, cab: [-2.0, -1.8, 0.8, 1.35], hood: 1.02, mass: 1.54, maxSpeed: 57, accel: 3.9, grip: 0.9, hp: 140, track: 0.88, power: 200, cda: 0.95, crr: 0.012 },
  truck: { L: 6.3, W: 2.2, belt: 1.2, roof: 2.9, wb: 2.0, cab: [-0.2, -0.1, 2.1, 2.45], hood: 1.0, mass: 3.85, maxSpeed: 30.5, accel: 1.8, grip: 0.75, hp: 220, track: 0.95, boxy: true, power: 125, cda: 4.2, crr: 0.008 },
};

// absurdly fast electric roadster: the sport car's body with a rocket booster (boost: Shift, see Vehicle.applyDrive)
CAR_SPECS.roadster = { ...CAR_SPECS.sport, mass: 0.85, maxSpeed: 300, accel: 62, grip: 14, power: 40000, cda: 0.5, hp: 140, boost: true, title: '로드스터' };
