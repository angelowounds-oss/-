import { mulberry32 } from './util.js';

// Building shape variation (WLD-07/09). A building's walkable tower is one or more stacked stages; every stage lies inside the one below and
// keeps the corner where the lift / stair core stands (x0, z0 of the lowest stage), so the core reaches every floor. A wide, low first stage
// reads as an annex (a wing next to the tall part); its floors are enterable like all the others.
// Everything here is a pure function of the building's own seed: the same building always has the same shape, and no random number comes from
// the city's shared stream, so no other building moves.
export const CORE_MIN_X = 7.3, CORE_MIN_Z = 6.7;   // the core's footprint from the stage corner (WALL + CORE_W, WALL + CORE_D in building.js)
export const MIN_SIDE = 14;                          // a stage side is never shorter (rooms and corridors need it)
export const ZONE_MULTI = [0.9, 0.75, 0.7, 0.7, 0.75];   // chance of a multi-stage tower per zone (0 = central plaza)

// input: the lowest tower stage (x0, z0, x1, z1, y0, y1), the building seed and the zone index; output: stages from the bottom up
export function planTowerStages({ x0, z0, x1, z1, y0, y1, seed, zone = 1 }) {
  const rnd = mulberry32(Math.floor(seed * 100003) + 7919);
  const th = y1 - y0, w = x1 - x0, d = z1 - z0;
  const first = { x0, z0, x1, z1, y0, y1 };
  const roll = rnd(), threeRoll = rnd(), modeRoll = rnd(), wingRoll = rnd();
  const fr = [rnd(), rnd(), rnd(), rnd()], hf = [rnd(), rnd(), rnd()];
  if (th < 26 || Math.max(w, d) < MIN_SIDE * 1.4 || roll >= (ZONE_MULTI[zone] ?? 0.5)) return [first];
  const n = th >= 80 && threeRoll < 0.4 ? 3 : 2;
  const mode = modeRoll < 0.5 ? 'both' : modeRoll < 0.75 ? 'x' : 'z';
  const wing = wingRoll < 0.35;
  // heights: the lowest stage takes 22-38 % (a wing) or 50-68 %, the others share the rest
  let cut;
  if (n === 2) cut = [wing ? 0.22 + 0.16 * hf[0] : 0.5 + 0.18 * hf[0]];
  else { const a = wing ? 0.2 + 0.12 * hf[0] : 0.3 + 0.15 * hf[0]; cut = [a, a + 0.25 + 0.1 * hf[1]]; }
  const out = [first];
  let cur = first;
  for (let i = 1; i < n; i++) {
    const f0 = 0.62 + 0.23 * fr[(i - 1) * 2], f1 = 0.62 + 0.23 * fr[(i - 1) * 2 + 1];
    let nx1 = cur.x1, nz1 = cur.z1;
    const canX = (cur.x1 - cur.x0) * f0 >= MIN_SIDE, canZ = (cur.z1 - cur.z0) * f1 >= MIN_SIDE;
    // the chosen axis (or both); a short axis falls back to the other one so a narrow lot still steps back along its long side
    const useX = canX && (mode !== 'z' || !canZ), useZ = canZ && (mode !== 'x' || !canX);
    if (useX) nx1 = cur.x0 + (cur.x1 - cur.x0) * f0;
    if (useZ) nz1 = cur.z0 + (cur.z1 - cur.z0) * f1;
    if (nx1 === cur.x1 && nz1 === cur.z1) break;   // no room to step back any more
    const yA = y0 + th * cut[i - 1], yB = i === n - 1 ? y1 : y0 + th * cut[i];
    out[i - 1] = { ...out[i - 1], y1: yA };
    cur = { x0: cur.x0, z0: cur.z0, x1: nx1, z1: nz1, y0: yA, y1: yB };
    out.push(cur);
  }
  // the loop may have stopped early: the last stage reaches the original top
  out[out.length - 1].y1 = y1;
  return out;
}
