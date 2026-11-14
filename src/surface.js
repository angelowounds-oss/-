import { topAt } from './roadsurf.js';
import { biomeAt, cities } from './worldmap.js';
import { regionWeight, regionWater } from './region.js';
import { heightAt } from './terrainfn.js';
import { SURF } from './tyres.js';
export { SURF, SURF_NAME, SURF_MU, SURF_CRR } from './tyres.js';

// What the tyres stand on (EV-13): a drawn road is asphalt; the cities' and the compiled regions' ground off the roads is pavement; out in the
// country the biome decides (grass, dirt fields and forest floor, gravel on the mountains and the volcano, sand on beaches and in the desert, snow
// above the snow line), and shallow water is mud. Anything standing clear of the ground (a bridge, a car park deck, a test track) is concrete.
// The grip and rolling resistance of each surface are tyres.js's tables.
// the biome's ground (worldmap.biomeAt: 0 sea, 1 beach, 2 plains, 3 farmland, 4 forest, 5 hills, 6 mountain, 7 snow, 8 desert, 9 volcanic)
const BIOME = [SURF.MUD, SURF.SAND, SURF.GRASS, SURF.DIRT, SURF.DIRT, SURF.GRASS, SURF.GRAVEL, SURF.SNOW, SURF.SAND, SURF.GRAVEL];

// the surface under (x, z) for a wheel at height y
export function surfaceAt(x, z, y) {
  const top = topAt(x, z); if (top === top && Math.abs(top - y) < 1.5) return SURF.ASPHALT;
  if (Math.abs(heightAt(x, z) - y) > 1.5) return SURF.PAVEMENT;   // above the ground: a bridge, a deck, a roof, a test track (concrete)
  if (regionWeight(x, z) >= 0.5) { const w = regionWater(x, z); return w && w.cls ? SURF.MUD : SURF.PAVEMENT; }
  for (const c of cities()) { const dx = x - c.x, dz = z - c.z; if (dx * dx + dz * dz < c.r * c.r) return SURF.PAVEMENT; }
  return BIOME[biomeAt(x, z, y)] ?? SURF.GRASS;
}
