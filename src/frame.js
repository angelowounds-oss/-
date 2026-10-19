// Coordinate frames (ADR-0017). The world data (worldmap, the baked tiles, the far land) is in map coordinates, centred on the middle of
// Korea. The game works in the local frame: the detailed capital (NEON CITY) is centred on the origin, so the city code keeps its numbers.
// local = map - CAPITAL. Every crossing between the two goes through these helpers, so no module adds the offset by hand.
import { CAPITAL } from './koreamap.js';

export const toMap = (x, z) => ({ x: x + CAPITAL.x, z: z + CAPITAL.z });
export const toLocal = (x, z) => ({ x: x - CAPITAL.x, z: z - CAPITAL.z });
// the edge of the map (WORLD_HALF in map coordinates) as local coordinates: a point is on the map when |local.x + CAPITAL.x| <= half
export const onMap = (x, z, half) => Math.abs(x + CAPITAL.x) <= half && Math.abs(z + CAPITAL.z) <= half;
