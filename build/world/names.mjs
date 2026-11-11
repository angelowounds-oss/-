// Where something is, in words: the nearest named place of the compiled region (its real settlements, emit.mjs `places`, and the district table,
// src/districts.js). The reports of blockers.mjs, corridor.mjs and floaters.mjs use it, because a province box says "seoul" for Seongnam and Gwangmyeong
// (src/regions/index.js regionOf picks by lon/lat box and the nearest city hall).
import { DISTRICTS } from '../../src/districts.js';

// a function (x, z) -> name of the nearest place within `reach` metres (local frame), '' when none is that near
export function namer(R, reach = 9000) {
  const P = [...(R?.places || []).map((p) => ({ name: p.name, x: p.x, z: p.z })), ...DISTRICTS.map((d) => ({ name: d.name, x: d.x, z: d.z }))];
  return (x, z) => { let best = '', bd = reach; for (const p of P) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p.name; } } return best; };
}
