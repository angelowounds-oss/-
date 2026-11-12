// The title screen credits the data we ship (KOREA-PLAN A5): OpenStreetMap under ODbL, the elevation tiles, and the boundary source.
// The text lives in src/template.html; this checks the words are there, and that the credits screen (EV-84) lists every shipped asset.
// Pure file read, no browser.
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../../src/template.html', import.meta.url), 'utf8');
const credit = (html.match(/<div id="credit">([^<]*)<\/div>/) || [])[1] || '';
const need = ['OpenStreetMap contributors (ODbL)', 'Terrarium', 'SRTM', 'KOSTAT'];
const missing = need.filter((w) => !credit.includes(w));
const bad = missing.length ? [['credit line misses', missing.join(', ')]] : [];
// the credits screen (EV-84): the page has the panel, its button and the placeholder build.mjs fills; the list holds every shipped attribution asset
const { creditsList } = await import('../../build/assets/credits.mjs');
const man = JSON.parse(fs.readFileSync(new URL('../../build/assets/manifest.json', import.meta.url), 'utf8')), list = creditsList(man), titles = new Set(list.flatMap((g) => g.items.map((i) => i.title)));
for (const id of ['creditsPanel', 'creditsBtn', 'creditsList', 'creditsData']) if (!html.includes(`id="${id}"`)) bad.push(['credits screen misses', id]);
if (!html.includes('/*__CREDITS__*/') || !fs.readFileSync(new URL('../../build/build.mjs', import.meta.url), 'utf8').includes("'/*__CREDITS__*/'")) bad.push(['credits list not injected by the build']);
const lost = man.assets.filter((a) => a.status === 'ok' && !titles.has(a.title)).map((a) => a.id); if (lost.length) bad.push(['credits screen misses assets', lost.join(', ')]);
console.log('RESULT ' + JSON.stringify({ test: 'credits', pass: bad.length === 0, metrics: { lengthChars: credit.length, screenGroups: list.length, screenItems: titles.size }, note: bad.map((b) => b.join(' ')).join(' | ') }));
process.exitCode = bad.length ? 1 : 0;
