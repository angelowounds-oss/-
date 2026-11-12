# Vehicle targets (EV-10)

The vehicle lab runs the same scenarios in two places:

- **Node:** `node build/lab/vehicle-lab.mjs [type…] [--only skidpad,slalom]` and `tests/unit/vehicle-lab.test.mjs`. It runs on the game's `Physics` and `driveVehicle`, with the game's steering limit and lag.
- **Page:** `tests/e2e/vehicle-lab.test.cjs`. It runs on the game's own `Vehicle` (`control`, `applyDrive`, `post`).

The scenario code is `tests/lib/vlab.js`.

In Phase 0 the lab records values only. The pass bar is that every value is a finite number. Tuning against the ranges below is Phase 1 work (EV-11 to EV-14).

## Real-world ranges

These ranges come from published road tests of comparable vehicles: magazine skid pads and slaloms, ISO 3888 lane changes and 100–0 braking. They are bands, not single numbers. Rows marked *estimate* still need a cited source before they become a gate.

| Scenario | Sedan | Sport | SUV | 5 t truck | City bus | Motorbike |
|---|---|---|---|---|---|---|
| Skid pad lateral g (30 m radius) | 0.82–0.90 | 0.98–1.10 | 0.75–0.85 | 0.55–0.65 | 0.40–0.50 | 0.9–1.1 (leaned) |
| Side slip at the limit, deg | 3–6 | 2–5 | 3–6 | 3–7 | 3–8 | — |
| Slalom 18 m, km/h (*estimate*) | 60–68 | 70–80 | 58–65 | 45–55 | 40–50 | 65–80 |
| Brake 100–0 dry, m | 35–40 | 31–35 | 37–42 | 45–55 | 50–60 | 38–45 |
| Brake wet / dry ratio | 1.3–1.5 | 1.3–1.5 | 1.3–1.5 | 1.3–1.6 | 1.3–1.6 | 1.4–1.8 |
| Lift-off yaw gain (front-driven) | 1.05–1.2 | 1.0–1.3 | 1.0–1.1 | ≈1 | ≈1 | — |
| 20 % hill: slide while held, m | 0 | 0 | 0 | 0 | 0 | 0 |
| 20 % hill: climbs from rest | yes | yes | yes | yes, about 30 % gradeability | yes, 15–20 % gradeability | yes |
| 75 mm bump at 30 km/h, peak vertical g | 0.3–0.8 | 0.4–1.0 | 0.3–0.7 | 0.3–0.8 | 0.2–0.6 | 0.5–1.2 |
| 75 mm bump at 30 km/h, pitch deg | 1–3 | 1–3 | 1–3 | 0.5–2 | 0.5–2 | 1–4 |
| Lean on a 25 m circle at 30 km/h, deg | about 1 out of the turn | <1 | 1–2 | 1–2 | 1–2 | 15.8 into the turn (ideal) |

## Phase 0 values (Node lab, 2026-11-12)

| Scenario | Sedan | Sport | SUV | Truck | Bus | Moto (lab spec) |
|---|---|---|---|---|---|---|
| Skid pad g | 0.90 | 1.11 | 0.84 | **0.74** | **0.58** | **0.61** (rolls 67°) |
| Side slip, deg | **1.9** | **1.8** | **2.1** | **2.8** | 6.4 | 0.5 |
| Slalom km/h | **69** | 77 | **66** | **57** | **52** | 74 |
| ISO 3888-1 km/h (lanes gated by width) | 113 | 114 | 113 | 116 | 98 | 104 |
| Lift-off yaw gain | **0.98** | 0.98 | 0.98 | 0.99 | 0.98 | 1.01 |
| Brake dry m | **42.4** | **35.2** | **44.6** | 52.8 | 57.2 | 35.9 |
| Brake wet / storm m | 58.6 / 69.8 | 48.6 / 58.0 | 61.5 / 73.2 | 72.6 / 86.2 | 78.9 / 93.9 | 49.0 / 58.1 |
| 20 % hold slide m (idle / handbrake) | 0.06 / 0.06 | 0.06 / 0.06 | 0.06 / 0.06 | 0.06 / 0.06 | 0.06 / 0.06 | 0.06 / 0.06 |
| 20 % climb 10 m, s | 3.05 | 1.63 | 3.30 | **does not climb** | **does not climb** | 1.77 |
| Bump peak g / pitch deg | **0.23 / 0.6** | **0.23 / 0.6** | **0.23 / 0.5** | **0.27** / 0.5 | 0.22 / **0.3** | **0.23** / 1.2 |
| Lean deg (+ into the turn) | −0.1 | −0.1 | −0.1 | −0.1 | −0.1 | 13.6 into |

Values in **bold** are outside the band above.

## What the gaps say

- **Tyres are too stiff in slip.** Every car reaches its limit at about 2° of side slip; real tyres peak at 3–6°. The cars feel on rails and then let go at once. This is EV-11's tyre model work.
- **Heavy vehicles are too agile.** The truck and bus corner and lane-change like cars. The ISO lane change hardly separates them from the sedan: the truck manages 116 km/h against the sedan's 113. Roll is about 0, so nothing transfers load and nothing limits them. This is EV-11/EV-12: roll stiffness, load transfer and a rollover threshold.
- **The truck and bus cannot start on 20 %.** Real ones can. Their power or low gear is short.
- **The bump barely registers.** The body is a rigid box on raycast wheels with stiff, quick suspension. 0.23 g and 0.5° are about a third of a real car's. This is EV-12's suspension work.
- **No lift-off tuck-in.** The yaw gain is about 1.0, so lifting the throttle mid-corner changes nothing. Real front-driven cars tuck in.
- **Braking is 5–15 % long** for the sedan, sport and SUV. The ABS share (`PHYS.absK`) or grip under braking is low.
- **Bikes do not lean in the game.** The game's motorbike is a craft held upright by `motoAssist`; the lab's moto spec is carlab's and falls over on the skid pad. A real bike model is EV-14.
- **Surfaces.** Only wet asphalt exists (`wetGrip`). Gravel, grass, snow and ice need EV-13's surface model before the lab can add them.

## Notes on the lab itself

- **Hill hold.** The game's brake pedal is reverse at a standstill. The hill test therefore holds the car with no input (the idle brake) and with the handbrake, not the pedal.
- **ISO 3888-1 gating.** The test gates only the three lanes, at widths 1.1 W + 0.25, 1.2 W + 0.25 and 1.3 W + 0.25. The transitions are free, as on the real course. The bisection keeps the highest speed whose worst error stays within the room the lane leaves.
- **Bias.** The steering is a pure-pursuit driver, not a human. The speeds are therefore the driver's limit on this physics, and compare across vehicles better than against magazine numbers.
