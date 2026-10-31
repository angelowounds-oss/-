// The delivered game folder's own files and the zip (BLD-06, ADR-0034): README.txt (how to start it, in Korean), game/LICENSES.txt (every
// shipped asset and library with its licence, from build/assets/manifest.json, plus the licence texts that must travel with the files) and
// dist/Korea-<date>-<commit>.zip with the folder Korea/ at its top.
// usage: node build/package.mjs [dist/Korea]   zips a folder build/build.mjs has made (build.mjs --zip does the same at the end)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
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
    + 'Map data © OpenStreetMap contributors, available under the Open Database License (ODbL).\n';
  const texts = [['three.js (MIT)', 'build/node_modules/three/LICENSE'], ['Rapier, Basis Universal transcoder (Apache-2.0)', 'build/node_modules/@dimforge/rapier3d-compat/LICENSE'],
    ['Anton font (SIL OFL 1.1)', 'build/licences/OFL-Anton.txt'], ['Space Mono font (SIL OFL 1.1)', 'build/licences/OFL-SpaceMono.txt']];
  for (const [name, f] of texts) t += `\n\n======== ${name} ========\n\n` + fs.readFileSync(path.join(ROOT, f), 'utf8').trim() + '\n';
  fs.writeFileSync(path.join(game, 'LICENSES.txt'), crlf(t));
}

// Zips the folder as Korea/... next to it; files that are compressed already are stored as they are. Returns the zip's path.
export function zipDist(dist, info) {
  if (!fs.existsSync(path.join(dist, 'Korea.exe'))) throw new Error('no Korea.exe in ' + dist + ' (Go missing or LAUNCHER=0): not zipping a folder that cannot start');
  const parent = path.dirname(path.resolve(dist)), name = path.basename(dist);
  const out = path.join(parent, `Korea-${info.date.replace(/-/g, '')}-${info.commit}.zip`);
  fs.rmSync(out, { force: true });
  // a fixed top folder name in the zip, whatever the local folder is called
  const top = path.join(parent, '.zip-stage'); fs.rmSync(top, { recursive: true, force: true }); fs.mkdirSync(top);
  fs.symlinkSync(path.resolve(dist), path.join(top, 'Korea'));
  try { execFileSync('zip', ['-r', '-X', '-q', '-n', '.pak:.glb:.jpg:.woff2:.exe:.rgbe', out, 'Korea'], { cwd: top }); } finally { fs.rmSync(top, { recursive: true, force: true }); }
  execFileSync('unzip', ['-tq', out]);
  return out;
}

export function buildInfo() {
  let commit = 'local'; try { commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim(); } catch { /* not a checkout */ }
  return { date: new Date().toISOString().slice(0, 10), commit };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dist = process.argv[2] || 'dist/Korea', out = zipDist(dist, buildInfo());
  console.log('zip', out, (fs.statSync(out).size / 1048576).toFixed(1) + ' MB');
}
