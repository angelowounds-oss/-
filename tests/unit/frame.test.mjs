// The local frame (src/frame.js): round trips, the capital is the local origin, and the map edge moves with the offset (ADR-0017).
import { toMap, toLocal, onMap } from '../../src/frame.js';
import { CAPITAL } from '../../src/koreamap.js';
import { WORLD_HALF } from '../../src/worldmap.js';

const bad = [];
const m = toMap(0, 0);
if (m.x !== CAPITAL.x || m.z !== CAPITAL.z) bad.push(['capital is not the local origin', m]);
for (const [x, z] of [[123.5, -4500], [-30000, 17000], [0, 0]]) {
  const back = toLocal(toMap(x, z).x, toMap(x, z).z);
  if (Math.abs(back.x - x) > 1e-9 || Math.abs(back.z - z) > 1e-9) bad.push(['round trip', x, z]);
}
if (!onMap(0, 0, WORLD_HALF)) bad.push(['capital must be on the map']);
if (onMap(WORLD_HALF - CAPITAL.x + 1, 0, WORLD_HALF)) bad.push(['edge must move with the offset']);
if (!onMap(WORLD_HALF - CAPITAL.x - 1, 0, WORLD_HALF)) bad.push(['inside the edge must be on the map']);

console.log('RESULT ' + JSON.stringify({ test: 'frame', pass: bad.length === 0, metrics: { offset: [CAPITAL.x, CAPITAL.z] }, note: bad.map((b) => b.join(' ')).join(' | ') }));
process.exitCode = bad.length ? 1 : 0;
