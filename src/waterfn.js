import { SEA } from './worldmap.js';
import { landHeight, riverAt, riverPolys } from './landfn.js';
import { regionWeight, regionWater } from './region.js';

// Water outside the city, as a function (pure): the sea (the ground below SEA) and the rivers (inside the channel cut by landfn.js, up to the
// river's water level). Returns { y (surface), depth, fx, fz (flow direction), speed (m/s), kind } or null. The game's `waterAt` asks this
// where the city's own lakes do not answer; the river meshes (rivers.js) are drawn at the same levels.
export function farWater(x, z) {
  const g = landHeight(x, z, 16);
  if (regionWeight(x, z) >= 0.5) {   // a compiled region: its sea and inland water (rivers, lakes) at their own levels; still water
    const w = regionWater(x, z); if (!w || !w.cls) return null;
    const y = w.cls === 1 ? SEA : w.level; if (g > y - 0.05) return null;
    return { y, depth: y - g, fx: 0, fz: 0, speed: 0, kind: w.cls === 1 ? 'sea' : 'river' };
  }
  const r = riverAt(x, z);
  if (r && r.d < r.w / 2 + 3 && g < r.y - 0.05) return { y: r.y, depth: r.y - g, fx: r.fx, fz: r.fz, speed: 0.8 + Math.min(2.4, r.w * 0.012), kind: 'river' };
  if (g < SEA - 0.05) return { y: SEA, depth: SEA - g, fx: 0, fz: 0, speed: 0, kind: 'sea' };
  return null;
}

if (typeof window !== 'undefined') window.__waterfn = { farWater, rivers: riverPolys() };   // test hook
