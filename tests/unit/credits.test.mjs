// The title screen credits the data we ship (KOREA-PLAN A5): OpenStreetMap under ODbL, the elevation tiles, and the boundary source.
// The text lives in src/template.html; this checks the words are there. Pure file read, no browser.
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../../src/template.html', import.meta.url), 'utf8');
const credit = (html.match(/<div id="credit">([^<]*)<\/div>/) || [])[1] || '';
const need = ['OpenStreetMap contributors (ODbL)', 'Terrarium', 'SRTM', 'KOSTAT'];
const missing = need.filter((w) => !credit.includes(w));
const bad = missing.length ? [['credit line misses', missing.join(', ')]] : [];
console.log('RESULT ' + JSON.stringify({ test: 'credits', pass: bad.length === 0, metrics: { lengthChars: credit.length }, note: bad.map((b) => b.join(' ')).join(' | ') }));
process.exitCode = bad.length ? 1 : 0;
