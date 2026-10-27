// Building numbers (ADR-0030): every building outside the capital (other cities, landmarks, villages, farms, industry, service areas) gets a
// unique number, the same on a second computation, in the documented shapes; the capital's ids follow from assignNeonIds on a few made-up lots.
// The full list with the capital is checked in the browser (tests/tools/building-registry.cjs --check).
import '../../build/jobs.mjs';
const { registry, assignNeonIds } = await import('../../src/buildingid.js');
const bad = [], a = registry(), b = registry(), m = { rows: a.length };
const ids = new Set(a.map((r) => r.uid)); if (ids.size !== a.length) bad.push(['duplicate numbers', a.length - ids.size]);
if (a.some((r, i) => r.uid !== b[i].uid || r.x !== b[i].x || r.z !== b[i].z)) bad.push(['a second computation differs']);
const shape = /^([A-Z0-9]+-\d{4}|[A-Z0-9]+-L\d+|V\d+-(\d{3}|TOW|CAN)|F\d+-[HB]|[WSMRT]\d+|SA-[A-Z0-9]+-\d+)$/;
const odd = a.filter((r) => !shape.test(r.uid)).map((r) => r.uid); if (odd.length) bad.push(['numbers of an unknown shape', odd.slice(0, 5).join(' ')]);
m.cities = a.filter((r) => r.src === 'citylayout.js').length; m.villages = a.filter((r) => r.uid.startsWith('V')).length;
if (m.cities < 10000 || m.villages < 100) bad.push(['too few buildings', m.cities, m.villages]);
// the capital: block lots numbered within their block, model towers along their side, far towers in order, the sky tower aliased
const lots = [{ bi: 3, bj: 4 }, { bi: 3, bj: 4 }, { bi: -1, bj: 9 }, { model: { side: 'n' } }, { model: { side: 'n' } }, { far: true }, { bi: 9, bj: 2, landmark: 'SKY' }];
assignNeonIds(lots); m.neon = lots.map((l) => l.uid + (l.alias ? '=' + l.alias : '')).join(' ');
if (m.neon !== 'NC-B04_05-0 NC-B04_05-1 NC-B00_10-0 NC-RN00 NC-RN01 NC-F000 NC-B10_03-0=NC-SKY') bad.push(['capital numbers', m.neon]);
console.log('RESULT ' + JSON.stringify({ test: 'building-ids', pass: bad.length === 0, metrics: m, note: bad.map((x) => x.join(' ')).join(' | ') }));
process.exitCode = bad.length ? 1 : 0;
