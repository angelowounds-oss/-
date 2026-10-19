// OpenStreetMap data for the world compiler (ADR-0019) through Overpass, region by region, cached in build/.osm-cache/world (not committed: ODbL).
// The mirrors time out now and then: each query goes to them in turn, a few times, before giving up.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const MIRRORS = ['https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const CACHE = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '.osm-cache', 'world');

// the elements of an Overpass QL query (with `out geom`), cached by the query text
export function overpass(name, ql) {
  const f = path.join(CACHE, `${name}-${crypto.createHash('sha1').update(ql).digest('hex').slice(0, 10)}.json`);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8')).elements;
  fs.mkdirSync(CACHE, { recursive: true });
  for (let k = 0; k < 6; k++) {
    try {
      execFileSync('curl', ['-sS', '-f', '-m', '300', '-o', f + '.part', '--data-urlencode', `data=${ql}`, MIRRORS[k % MIRRORS.length]], { stdio: ['ignore', 'ignore', 'pipe'] });
      const text = fs.readFileSync(f + '.part', 'utf8');
      if (text.startsWith('{')) { fs.renameSync(f + '.part', f); return JSON.parse(text).elements; }
    } catch { /* next mirror */ }
  }
  throw new Error('overpass failed: ' + name);
}
export const bbox = (b) => `${b.s},${b.w},${b.n},${b.e}`;
