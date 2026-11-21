// The delivered game folder's own files and the zip (BLD-06, ADR-0034): README.txt (how to start it, in Korean), game/LICENSES.txt (every
// shipped asset and library with its licence, from build/assets/manifest.json, plus the licence texts that must travel with the files) and
// dist/Korea-<date>-<commit>.zip with the folder Korea/ at its top.
// usage: node build/package.mjs [dist/Korea]   zips a folder build/build.mjs has made (build.mjs --zip does the same at the end)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const crlf = (s) => s.replace(/\r?\n/g, '\r\n');   // Notepad on older Windows shows LF-only text as one line

// README.txt at the top of the folder: what to double-click, the first-run warning, where saves live, what to do when it does not start.
export function writeReadme(dist, info) {
  const t = `KOREA 1:1 (Korea)  —  빌드 ${info.date} (${info.commit})${info.regions ? `  —  일부 지역만 구움: ${info.regions.join(', ')}` : ''}

[실행]
1. 이 zip의 압축을 모두 풉니다 (zip 안에서 바로 실행하면 게임 파일을 찾지 못합니다).
2. Korea 폴더 안의 Korea.exe 를 더블클릭합니다.
3. Chrome(없으면 Edge)이 주소창 없는 게임 창으로 열립니다. 창을 닫으면 게임도 끝납니다.

[처음 실행할 때]
- "Windows의 PC 보호" 창이 뜨면 "추가 정보" → "실행"을 누릅니다 (서명하지 않은 프로그램이라 한 번 묻습니다).
- 방화벽 허용 창은 뜨지 않습니다: 이 컴퓨터 안(127.0.0.1)에서만 열고, 다른 컴퓨터에서는 접속할 수 없습니다.

[화질]
- 타이틀 화면 왼쪽 아래 "월드 화질"에서 노트북 / 고사양을 고릅니다. 고사양 팩(game\\world\\high 폴더)은 함께 들어 있습니다. 월드 파일은 시·도별로 나뉘어 있습니다(game\\world\\base, game\\world\\high).

[저장]
- 저장·설정·조작키는 %LOCALAPPDATA%\\Korea 에 남습니다. 새 버전 zip을 다른 곳에 풀어도 이어집니다.
- 예전 한 파일(neon_city_v9.html) 버전의 저장은 넘어오지 않습니다.

[안 될 때]
- 창이 안 뜨면: 브라우저에서 직접 http://127.0.0.1:47820/ 을 엽니다.
- 기록: %LOCALAPPDATA%\\Korea\\launcher.log
- game\\index.html 을 직접 열면 동작하지 않습니다. 꼭 Korea.exe 로 실행하세요.

[저작권]
- 사용한 에셋·라이브러리와 라이선스: game\\LICENSES.txt
- 이 빌드는 개인 확인용입니다. 외부 배포 전에 라이선스 확인(BLD-04)이 필요합니다.
`;
  fs.writeFileSync(path.join(dist, 'README.txt'), '﻿' + crlf(t));
}

// LICENSES.txt next to the page: the manifest's entries grouped by licence, then the full texts the licences ask to ship with the files.
export function writeLicences(game) {
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'build/assets/manifest.json'), 'utf8'));
  const by = new Map();
  for (const a of man.assets) { if (!by.has(a.licence)) by.set(a.licence, []); by.get(a.licence).push(a); }
  let t = 'Korea — third-party assets, data and libraries / 사용한 에셋·데이터·라이브러리\n\n';
  for (const [lic, list] of [...by].sort((a, b) => a[0].localeCompare(b[0]))) {
    t += `== ${lic} ==\n`;
    for (const a of list) t += `- ${a.title}${a.author ? ' — ' + a.author : ''}${a.url ? ' — ' + a.url : ''}${a.status === 'replace' ? '  (to be replaced, BLD-04)' : ''}\n`;
    t += '\n';
  }
  t += 'Licence texts: CC-BY-4.0 https://creativecommons.org/licenses/by/4.0/legalcode · ODbL-1.0 https://opendatacommons.org/licenses/odbl/1-0/ · '
    + 'GPL-2.0 https://www.gnu.org/licenses/old-licenses/gpl-2.0.html · CC0-1.0 https://creativecommons.org/publicdomain/zero/1.0/legalcode\n'
    + 'Map data © OpenStreetMap contributors, available under the Open Database License (ODbL).\n'
    + 'Crossings and signal mounts of Seoul: Seoul Metropolitan Government, Seoul Open Data Plaza (data.seoul.go.kr, OA-15554, OA-15546), Korea Open Government License Type 1 (https://www.kogl.or.kr/info/licenseType1.do).\n';
  const texts = [['three.js (MIT)', 'build/node_modules/three/LICENSE'], ['Rapier, Basis Universal transcoder (Apache-2.0)', 'build/node_modules/@dimforge/rapier3d-compat/LICENSE'],
    ['Anton font (SIL OFL 1.1)', 'build/licences/OFL-Anton.txt'], ['Space Mono font (SIL OFL 1.1)', 'build/licences/OFL-SpaceMono.txt']];
  for (const [name, f] of texts) t += `\n\n======== ${name} ========\n\n` + fs.readFileSync(path.join(ROOT, f), 'utf8').trim() + '\n';
  fs.writeFileSync(path.join(game, 'LICENSES.txt'), crlf(t));
}

// ---- the delivery zip (BD-1): one folder tree whose every entry starts with Korea/, so any number of parts extracted into one folder
// rebuilds the delivered tree. A build above the chat upload limit (500 MB) goes out as parts of at most 480 MB; each part opens on its own.
const SPLIT_ABOVE = 500 * 1024 * 1024, PART_BYTES = 480 * 1024 * 1024;
// payloads that are compressed already: deflate spends time and saves nothing (the same list the external zip's -n took)
const STORED_EXT = new Set(['.pak', '.glb', '.jpg', '.woff2', '.exe', '.rgbe']);
const ZIP_ROW = 120;   // a local header plus its central-directory row: the per-file cost the size estimate adds

const CRC_TABLE = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = (buf, seed = 0) => { let c = ~seed; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return ~c >>> 0; };
function crcOfFile(file) {
  const fd = fs.openSync(file, 'r'), chunk = Buffer.allocUnsafe(1 << 20); let crc = 0;
  try { for (;;) { const n = fs.readSync(fd, chunk, 0, chunk.length, null); if (n <= 0) break; crc = crc32(chunk.subarray(0, n), crc); } } finally { fs.closeSync(fd); }
  return crc;
}
// MS-DOS date and time, which is what a zip stores
function dosStamp(ms) {
  const d = new Date(Math.min(Math.max(ms, Date.UTC(1980, 0, 1)), Date.UTC(2107, 11, 31, 23, 59, 58)));
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}
const walkFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walkFiles(path.join(dir, e.name)) : [path.join(dir, e.name)]));

// one zip of `entries` ({ rel, size }), every entry named Korea/<rel> whatever the folder is called
function writeZip(out, dist, entries) {
  const fd = fs.openSync(out, 'w'), central = [], chunk = Buffer.allocUnsafe(1 << 20);
  let offset = 0;
  const put = (b) => { fs.writeSync(fd, b); offset += b.length; };
  try {
    for (const ent of entries) {
      const abs = path.join(dist, ent.rel), st = fs.statSync(abs), { time, date } = dosStamp(st.mtimeMs);
      const name = Buffer.from('Korea/' + ent.rel.split(path.sep).join('/'), 'utf8');
      let method = 0, data = null, crc, comp, size = st.size;
      if (STORED_EXT.has(path.extname(abs).toLowerCase())) crc = crcOfFile(abs);
      else {
        data = fs.readFileSync(abs); crc = crc32(data); size = data.length;
        const z = zlib.deflateRawSync(data, { level: 6 });
        if (z.length < data.length) { data = z; method = 8; }
        comp = data.length;
      }
      if (method === 0) comp = size;
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(method, 8);
      local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp, 18); local.writeUInt32LE(size, 22);
      local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
      const at = offset; put(local); put(name);
      if (data) put(data);
      else if (size) { const rfd = fs.openSync(abs, 'r'); let left = size; try { while (left > 0) { const n = fs.readSync(rfd, chunk, 0, Math.min(chunk.length, left), null); if (n <= 0) break; fs.writeSync(fd, chunk.subarray(0, n)); offset += n; left -= n; } } finally { fs.closeSync(rfd); } }
      central.push({ name, method, crc, comp, size, time, date, at });
    }
    const cdAt = offset;
    for (const c of central) {
      const h = Buffer.alloc(46);
      h.writeUInt32LE(0x02014b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(20, 6); h.writeUInt16LE(0, 8); h.writeUInt16LE(c.method, 10);
      h.writeUInt16LE(c.time, 12); h.writeUInt16LE(c.date, 14); h.writeUInt32LE(c.crc, 16); h.writeUInt32LE(c.comp, 20); h.writeUInt32LE(c.size, 24);
      h.writeUInt16LE(c.name.length, 28); h.writeUInt16LE(0, 30); h.writeUInt16LE(0, 32); h.writeUInt16LE(0, 34); h.writeUInt16LE(0, 36);
      h.writeUInt32LE(0, 38); h.writeUInt32LE(c.at, 42);
      put(h); put(c.name);
    }
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6); eocd.writeUInt16LE(central.length, 8); eocd.writeUInt16LE(central.length, 10);
    eocd.writeUInt32LE(offset - cdAt, 12); eocd.writeUInt32LE(cdAt, 16); eocd.writeUInt16LE(0, 20);
    put(eocd);
  } finally { fs.closeSync(fd); }
  return central.length;
}

// the zip's entries as the central directory lists them; the verification when the container has no `unzip`
export function readZip(zip) {
  const fd = fs.openSync(zip, 'r'), size = fs.fstatSync(fd).size;
  try {
    const tailLen = Math.min(size, 1 << 17), tail = Buffer.allocUnsafe(tailLen);
    fs.readSync(fd, tail, 0, tailLen, size - tailLen);
    const at = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    if (at < 0) throw new Error('not a zip: ' + zip);
    const count = tail.readUInt16LE(at + 10), cdSize = tail.readUInt32LE(at + 12), cdAt = tail.readUInt32LE(at + 16);
    const cd = Buffer.allocUnsafe(cdSize); fs.readSync(fd, cd, 0, cdSize, cdAt);
    const out = []; let p = 0;
    for (let i = 0; i < count; i++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory at ' + p);
      const nameLen = cd.readUInt16LE(p + 28), extra = cd.readUInt16LE(p + 30), comment = cd.readUInt16LE(p + 32);
      out.push({ name: cd.toString('utf8', p + 46, p + 46 + nameLen), method: cd.readUInt16LE(p + 10), crc: cd.readUInt32LE(p + 16), comp: cd.readUInt32LE(p + 20), size: cd.readUInt32LE(p + 24) });
      p += 46 + nameLen + extra + comment;
    }
    return out;
  } finally { fs.closeSync(fd); }
}

// the files in the order they go into the parts, so the same folder always splits the same way
function distFiles(dist) {
  return walkFiles(dist).map((abs) => ({ rel: path.relative(path.resolve(dist), abs), size: fs.statSync(abs).size })).sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}
// greedy by the estimate the stored bytes give; a file larger than the budget gets a part of its own
function packParts(files, limit) {
  const parts = []; let cur = [], curSize = 0;
  for (const f of files) {
    const cost = f.size + ZIP_ROW;
    if (cur.length && curSize + cost > limit) { parts.push(cur); cur = []; curSize = 0; }
    cur.push(f); curSize += cost;
  }
  if (cur.length) parts.push(cur);
  return parts;
}

// Zips the folder as Korea/... next to it, one part per 480 MB when the build passes 500 MB. Returns every part's path.
export function zipDist(dist, info, opts = {}) {
  if (!fs.existsSync(path.join(dist, 'Korea.exe'))) throw new Error('no Korea.exe in ' + dist + ' (Go missing or LAUNCHER=0): not zipping a folder that cannot start');
  const parent = path.dirname(path.resolve(dist)), files = distFiles(dist);
  const limit = opts.partBytes || PART_BYTES, above = opts.splitAbove === undefined ? SPLIT_ABOVE : opts.splitAbove;
  const total = files.reduce((a, f) => a + f.size, 0);
  const parts = total > above || opts.parts ? packParts(files, limit) : [files];
  const base = `Korea-${info.date.replace(/-/g, '')}-${info.commit}`, outs = [];
  for (let i = 0; i < parts.length; i++) {
    const out = path.join(parent, parts.length === 1 ? `${base}.zip` : `${base}-${i + 1}of${parts.length}.zip`);
    fs.rmSync(out, { force: true });
    const entries = writeZip(out, dist, parts[i]);
    if (entries !== parts[i].length) throw new Error(`zip ${out}: ${entries} entries, ${parts[i].length} written`);
    const listed = readZip(out);
    if (listed.some((e) => !e.name.startsWith('Korea/'))) throw new Error('zip entry outside Korea/: ' + out);
    if (listed.length !== parts[i].length) throw new Error(`zip ${out}: ${listed.length} listed, ${parts[i].length} expected`);
    const mb = fs.statSync(out).size / 1048576;
    if (parts.length > 1 && mb > limit / 1048576) console.warn(`zip ${out}: ${mb.toFixed(1)} MB over the ${(limit / 1048576).toFixed(0)} MB part budget (a single file larger than it)`);
    if (opts.unzip !== false) { try { execFileSync('unzip', ['-tq', out], { stdio: 'ignore' }); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
    outs.push(out);
  }
  return outs;
}

export function buildInfo() {
  let commit = 'local'; try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim(); } catch { /* not a checkout */ }
  return { date: new Date().toISOString().slice(0, 10), commit };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dist = process.argv[2] || 'dist/Korea', out = zipDist(dist, buildInfo());
  console.log('zip', out, (fs.statSync(out).size / 1048576).toFixed(1) + ' MB');
}
