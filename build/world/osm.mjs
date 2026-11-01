// OpenStreetMap data for the world compiler (ADR-0019) through Overpass, region by region, cached in build/.osm-cache/world (not committed: ODbL).
// The mirrors time out now and then: each query goes to them in turn, a few times, before giving up.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync, execFile } from 'node:child_process';

// mail.ru first: on 2026-11-01 kumi timed out and overpass-api.de reset every connection from the build container
const MIRRORS = ['https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
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

// the cache file of a query (the same name the synchronous call reads, so a prefetch fills it)
export const cacheFile = (name, ql) => path.join(CACHE, `${name}-${crypto.createHash('sha1').update(ql).digest('hex').slice(0, 10)}.json`);
// the same query without blocking, for fetching many tiles a few at a time; resolves to the cache file
export async function overpassFile(name, ql) {
  const f = cacheFile(name, ql); if (fs.existsSync(f)) return f;
  fs.mkdirSync(CACHE, { recursive: true });
  for (let k = 0; k < 8; k++) {
    const ok = await new Promise((res) => execFile('curl', ['-sS', '-f', '-m', '600', '-o', f + '.part', '--data-urlencode', `data=${ql}`, MIRRORS[k % MIRRORS.length]], (err) => res(!err)));
    if (ok && fs.readFileSync(f + '.part', 'utf8', { flag: 'r' }).startsWith('{')) { fs.renameSync(f + '.part', f); return f; }
    await new Promise((r) => setTimeout(r, 5000 * (k + 1)));   // a busy mirror answers 429 or a timeout: wait longer each time
  }
  throw new Error('overpass failed: ' + name);
}
