// The asset manifest (ADR-0028): every file under assets/ and every downloaded source is listed with its origin, author, licence and sha256.
// usage: node build/assets/fetch.mjs [--check] [--fetch] [--docs] [--update]
//   --check  (default) fail on an unlisted file, a changed hash, a licence outside the allowed list or a missing credit; warn on entries to confirm or replace
//   --fetch  download the `fetch` sources of every entry into build/.asset-cache/<id>/ and verify their hashes (nothing downloaded is committed)
//   --docs   rewrite the generated table in docs/ASSETS.md (between the AUTO markers) from the manifest
//   --update record the current hashes of the listed committed files (after a pack script rebuilt them on purpose)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const MAN = path.join(ROOT, 'build/assets/manifest.json'), CACHE = path.join(ROOT, 'build/.asset-cache');
const ATTRIB = /^(CC-BY|OFL|ODbL|KOSTAT|PD)/;   // licences whose terms ask for (or the project chose to give) a credit line
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

export function check(man = JSON.parse(fs.readFileSync(MAN, 'utf8'))) {
  const errors = [], warnings = [], listed = new Set();
  const credit = (fs.readFileSync(path.join(ROOT, 'src/template.html'), 'utf8').match(/<div id="credit">([^<]*)<\/div>/) || [])[1] || '';
  for (const a of man.assets) {
    for (const [f, h] of Object.entries(a.files || {})) {
      listed.add(f); const p = path.join(ROOT, f);
      if (!fs.existsSync(p)) errors.push(`${a.id}: missing file ${f}`);
      else if (sha(p) !== h) errors.push(`${a.id}: ${f} changed (run --update if the rebuild was intended)`);
    }
    if (a.status === 'confirm') warnings.push(`${a.id}: licence to confirm (${a.source})`);
    else if (a.status === 'replace') warnings.push(`${a.id}: ${a.licence}, to be replaced (${a.note || ''})`);
    else if (!man.allowed.includes(a.licence)) errors.push(`${a.id}: licence ${a.licence} is not allowed`);
    if (a.status === 'ok' && ATTRIB.test(a.licence) && !a.credit) errors.push(`${a.id}: ${a.licence} needs a credit line`);
    if (a.credit && !credit.includes(a.credit)) errors.push(`${a.id}: the title-screen credit misses "${a.credit}"`);
  }
  for (const f of walk(path.join(ROOT, 'assets')).map((p) => path.relative(ROOT, p))) if (!listed.has(f)) errors.push(`unlisted file ${f}`);
  return { errors, warnings, entries: man.assets.length };
}

async function fetchAll(man) {
  for (const a of man.assets) for (const s of a.fetch || []) {
    const dst = path.join(CACHE, a.id, s.to); if (fs.existsSync(dst) && (!s.sha256 || sha(dst) === s.sha256)) continue;
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    const r = await fetch(s.url); if (!r.ok) throw new Error(`${a.id}: ${s.url} ${r.status}`);
    fs.writeFileSync(dst, Buffer.from(await r.arrayBuffer()));
    const h = sha(dst); if (s.sha256 && h !== s.sha256) throw new Error(`${a.id}: ${s.to} hash ${h} != ${s.sha256}`);
    if (!s.sha256) s.sha256 = h;   // first download pins the hash
    console.log('fetched', a.id, s.to);
  }
}

function docs(man) {
  const rows = man.assets.map((a) => `| ${a.title} | ${Object.keys(a.files || {}).map((f) => '`' + f + '`').join(', ') || '(빌드에 포함되는 파생 데이터)'} | ${a.url ? `[${a.source}](${a.url})` : a.source}${a.author ? ' · ' + a.author : ''} | ${a.licence} | ${a.status === 'ok' ? (a.credit ? '크레딧: ' + a.credit : '표기 불필요') : a.status === 'confirm' ? '**확인 필요**' : '**교체 예정** ' + (a.note || '')} |`);
  const body = ['<!-- AUTO:manifest (build/assets/fetch.mjs --docs) -->', '| 에셋 | 파일 | 출처 · 작가 | 라이선스 | 상태 |', '|---|---|---|---|---|', ...rows, '<!-- /AUTO:manifest -->'].join('\n');
  const p = path.join(ROOT, 'docs/ASSETS.md'), s = fs.readFileSync(p, 'utf8');
  const out = /<!-- AUTO:manifest[\s\S]*<!-- \/AUTO:manifest -->/.test(s) ? s.replace(/<!-- AUTO:manifest[\s\S]*<!-- \/AUTO:manifest -->/, body) : s.trimEnd() + '\n\n## 목록 (자동 생성)\n\n' + body + '\n';
  fs.writeFileSync(p, out);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const args = new Set(process.argv.slice(2)), man = JSON.parse(fs.readFileSync(MAN, 'utf8'));
  if (args.has('--update')) for (const a of man.assets) for (const f of Object.keys(a.files || {})) if (fs.existsSync(path.join(ROOT, f))) a.files[f] = sha(path.join(ROOT, f));
  if (args.has('--fetch')) await fetchAll(man);
  if (args.has('--update') || args.has('--fetch')) fs.writeFileSync(MAN, JSON.stringify(man, null, 1) + '\n');
  if (args.has('--docs')) docs(man);
  const r = check(man);
  for (const w of r.warnings) console.log('warn ', w);
  for (const e of r.errors) console.log('ERROR', e);
  console.log(`${r.entries} entries, ${r.errors.length} errors, ${r.warnings.length} warnings`);
  process.exitCode = r.errors.length ? 1 : 0;
}
