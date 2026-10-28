// Room walk check (src/walkgrid.js, Q0-8): the test building.js runs on every furnished room before keeping its furniture.
// A room 6 x 6.4 m south of its door wall (z0), the door in the corridor wall and a doorway in the back wall to the next room; walls are 'part'
// boxes with the doorway gaps, as building.js builds them.
import { roomWalkable } from '../../src/walkgrid.js';

const y = 10, t = 0.18;
const box = (x0, z0, x1, z1, tag = 'furniture', h = 0.9, y0 = 0) => ({ x0, z0, x1, z1, tag, y0: y + y0, h: y + h });
// wall along x at z with one doorway of 1.05 m centred at u, the lintel above 2.15 m (out of the walk band)
const wallX = (z, x0, x1, u) => [box(x0, z - t / 2, u - 0.525, z + t / 2, 'part', 3.8), box(u + 0.525, z - t / 2, x1, z + t / 2, 'part', 3.8), box(u - 0.525, z - t / 2, u + 0.525, z + t / 2, 'part', 3.8, 2.15)];
const rm = { x0: 0, z0: 0, x1: 6, z1: 6.4, wall: 'n', dx: 3.2, dz: 0, bx: 0.85 };
const shell = [...wallX(0, -1, 7, rm.dx), ...wallX(6.4, -1, 7, rm.bx), box(-t / 2, -1, t / 2, 7.4, 'part', 3.8), box(6 - t / 2, -1, 6 + t / 2, 7.4, 'part', 3.8)];

const cases = [
  ['empty room', [], true],
  ['sofa in the middle', [box(1.8, 3, 4.2, 3.9)], true],
  ['low rug and a 0.4 m table are stepped over', [box(1, 1, 5, 5, 'decor', 0.02), box(2, 2, 4, 2.6, 'furniture', 0.4)], true],
  ['ceiling lamp over the doorway', [box(2.8, 0.1, 3.6, 0.6, 'decor', 3.6, 3.2)], true],
  ['cabinet run across the back doorway', [box(0.1, 5.7, 5.9, 6.3)], false, 'back-door'],
  ['cabinet just inside the door', [box(2.2, 0.1, 4.2, 0.9)], false, 'door'],
  ['wall of furniture cuts the room in two', [box(0.1, 3, 5.9, 3.6, 'furniture', 1.8)], false],
  ['gap of 0.6 m is too narrow for the player', [box(0.1, 3, 2.7, 3.6, 'furniture', 1.8), box(3.3, 3, 5.9, 3.6, 'furniture', 1.8)], false],
  ['gap of 1.0 m is wide enough', [box(0.1, 3, 2.5, 3.6, 'furniture', 1.8), box(3.5, 3, 5.9, 3.6, 'furniture', 1.8)], true],
  ['last room of a flat has no back doorway to reach', [box(0.1, 5.7, 5.9, 6.3)], true, null, { bx: undefined }],
];
const fails = [];
for (const [name, extra, want, why, patch] of cases) {
  const r = { ...rm, ...(patch || {}) }; delete r.walkWhy;
  const got = roomWalkable([...shell, ...extra], y, r);
  if (got !== want || (why && r.walkWhy !== why)) fails.push({ name, want, got, why: r.walkWhy });
}
const pass = fails.length === 0;
console.log('RESULT ' + JSON.stringify({ test: 'room-walkways', pass, metrics: { cases: cases.length, fails } }));
process.exit(pass ? 0 : 1);
