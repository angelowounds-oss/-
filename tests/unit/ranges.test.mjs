// The real mountain spines (src/ranges.js, WLD-20e): the crest heights at real places and flat ground at the capital and the coast.
import { rangeHeight } from '../../src/ranges.js';
import { project, CAPITAL } from '../../src/koreamap.js';

const bad = [];
const at = (lon, lat) => { const p = project(lon, lat); return rangeHeight(p.x, p.z); };
if (at(128.92, 37.10) < 1300) bad.push(['taebaek crest too low', at(128.92, 37.10)]);   // 태백산
if (at(127.49, 35.33) < 900) bad.push(['sobaek south end too low', at(127.49, 35.33)]);   // 지리산 end of the spine
if (rangeHeight(CAPITAL.x, CAPITAL.z) > 1) bad.push(['mountain under Seoul', rangeHeight(CAPITAL.x, CAPITAL.z)]);
if (at(129.075, 35.179) > 1) bad.push(['mountain under Busan', at(129.075, 35.179)]);
for (let i = 0; i < 2000; i++) { const h = rangeHeight(((i * 7919) % 200 - 100) * 500, ((i * 104729) % 200 - 100) * 500); if (!Number.isFinite(h) || h < 0 || h > 1400) bad.push(['range out of range', h]); }
console.log('RESULT ' + JSON.stringify({ test: 'ranges', pass: bad.length === 0, metrics: { taebaek: Math.round(at(128.92, 37.10)) }, note: bad.map((b) => b.join(' ')).join(' | ') }));
process.exitCode = bad.length ? 1 : 0;
