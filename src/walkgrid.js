// Walk check for a furnished room (building.js furnishRoom): no three.js, so the unit test runs it in node.
// A furnished room must let the player (radius 0.36, a little spare) walk from its door to its back door and over most of its floor.
export const WALK_BODY = 0.38, WALK_CELL = 0.1, WALK_SHARE = 0.7;
const WALK_BLOCK = new Set(['int', 'part', 'glass', 'furniture', 'decor']);

// A 0.1 m grid over the room and 0.7 m around it; a cell is blocked where a collider stands between 0.43 m (the controller steps over less) and
// 1.7 m within WALK_BODY of it. From just outside the door the walk must reach just inside it, the back doorway (when the room has one) and
// WALK_SHARE of the room's free floor. The same test as tests/tools/building-audit.cjs, so a room that passes here passes there.
export function roomWalkable(boxes, y, rm) {
  const CS = WALK_CELL, R2 = WALK_BODY * WALK_BODY, gx0 = rm.x0 - 0.7, gz0 = rm.z0 - 0.7, W = Math.ceil((rm.x1 - rm.x0 + 1.4) / CS), D = Math.ceil((rm.z1 - rm.z0 + 1.4) / CS);
  const free = new Uint8Array(W * D).fill(1);
  for (const b of boxes) {
    if (!WALK_BLOCK.has(b.tag) || !(b.y0 < y + 1.7 && b.h > y + 0.43)) continue;
    const i0 = Math.max(0, Math.floor((b.x0 - WALK_BODY - gx0) / CS)), i1 = Math.min(W - 1, Math.floor((b.x1 + WALK_BODY - gx0) / CS));
    const j0 = Math.max(0, Math.floor((b.z0 - WALK_BODY - gz0) / CS)), j1 = Math.min(D - 1, Math.floor((b.z1 + WALK_BODY - gz0) / CS));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = gx0 + (i + 0.5) * CS, z = gz0 + (j + 0.5) * CS, dx = Math.max(b.x0 - x, 0, x - b.x1), dz = Math.max(b.z0 - z, 0, z - b.z1);
      if (dx * dx + dz * dz < R2) free[j * W + i] = 0;
    }
  }
  const cell = (x, z) => { const i = Math.floor((x - gx0) / CS), j = Math.floor((z - gz0) / CS); return i < 0 || j < 0 || i >= W || j >= D ? -1 : j * W + i; };
  // the nearest free cell within 0.3 m of a point (a doorway point can fall on a grid line)
  const near = (x, z) => { let best = -1, bd = 1e9; for (let dz = -0.3; dz <= 0.3; dz += CS) for (let dx = -0.3; dx <= 0.3; dx += CS) { const c = cell(x + dx, z + dz); if (c >= 0 && free[c] && dx * dx + dz * dz < bd) { bd = dx * dx + dz * dz; best = c; } } return best; };
  const dirIn = rm.wall === 'n' ? 1 : -1, backZ = rm.wall === 'n' ? rm.z1 : rm.z0;
  const inDoor = near(rm.dx, rm.dz + dirIn * 0.55);
  if (inDoor < 0) return (rm.walkWhy = 'door'), false;   // walkWhy: why the last try failed (the building audit reports it)
  const seed = near(rm.dx, rm.dz - dirIn * 0.55);   // outside: the corridor or the room in front, furnished already
  const seen = new Uint8Array(W * D), q = new Int32Array(W * D); let qn = 0;
  const start = seed >= 0 ? seed : inDoor; seen[start] = 1; q[qn++] = start;
  for (let h = 0; h < qn; h++) {
    const c = q[h], i = c % W;
    if (i > 0 && free[c - 1] && !seen[c - 1]) { seen[c - 1] = 1; q[qn++] = c - 1; }
    if (i < W - 1 && free[c + 1] && !seen[c + 1]) { seen[c + 1] = 1; q[qn++] = c + 1; }
    if (c >= W && free[c - W] && !seen[c - W]) { seen[c - W] = 1; q[qn++] = c - W; }
    if (c + W < W * D && free[c + W] && !seen[c + W]) { seen[c + W] = 1; q[qn++] = c + W; }
  }
  if (!seen[inDoor]) return (rm.walkWhy = 'door'), false;
  if (rm.bx != null) { const b = near(rm.bx, backZ - dirIn * 0.55); if (b < 0 || !seen[b]) return (rm.walkWhy = 'back-door'), false; }
  let nFree = 0, nSeen = 0;
  for (let z = rm.z0 + 0.2; z < rm.z1 - 0.2; z += CS) for (let x = rm.x0 + 0.2; x < rm.x1 - 0.2; x += CS) { const c = cell(x, z); if (free[c]) { nFree++; if (seen[c]) nSeen++; } }
  if (nSeen < WALK_SHARE * nFree) return (rm.walkWhy = 'share ' + (nSeen / Math.max(1, nFree)).toFixed(2)), false;
  return true;
}
