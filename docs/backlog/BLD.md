# BLD — 빌드·QA·릴리스·라이선스

현재: 성숙도 L1→L2, **취약**. 회귀 스위트는 `tests/`로 옮겼으나 CI 없음. 빌드 산출물 커밋은 2026-10-16에 멈췄다(`.git` 1.8 GB는 남아 있다). 배포는 게임 폴더 + `NeonCity.exe`를 zip으로 묶어 넘긴다(BLD-06).
GPL 코드 혼입, 게임 내 크레딧 없음.

### BLD-01 CI에서 빌드 + quick 스위트 — P0 · M · M0 · Backlog
- 목적: 회귀를 사람이 기억해서 돌리는 구조를 없앤다.
- 범위: `.github/workflows/ci.yml` — Node 22, `cd build && npm ci`, `npx playwright install --with-deps chromium`, `node build/build.mjs`, `node tests/run.cjs quick`. 주 1회(또는 수동) `node tests/run.cjs all` 잡. 결과 `tests/results/last-run.json`을 아티팩트로 업로드.
- AC: PR마다 quick 스위트가 돌고 실패하면 체크가 빨갛다. `all` 잡이 수동 실행으로 녹색.
- 검증: 의도적으로 깨뜨린 브랜치(예: `src/nav.js` 경로 탐색 무력화)에서 `nav-perf`가 실패하는 것을 확인 후 되돌림.
- 관련 파일: `tests/run.cjs`, `tests/lib.cjs`(Playwright 경로: `PLAYWRIGHT` 환경변수 지원)
- 의존: 없음

### BLD-02 빌드 산출물 커밋 중단, 릴리스로 배포 — P0 · M · M0 · Backlog
- 목적: 커밋마다 30 MB가 쌓이는 저장소 비대화(`.git` 1.8 GB)를 멈춘다.
- 범위: `neon_city_v9.html`을 `.gitignore`에 추가하고 CI가 빌드해 GitHub Release(또는 Pages)로 올린다. 기존 이력 재작성(force push)은 **소유자 승인 시에만** 별도 작업.
- AC: 새 커밋에 HTML이 없다. 태그를 달면 릴리스 페이지에 빌드 파일이 붙는다. README에 내려받는 위치가 적혀 있다.
- 검증: `git log --stat -1`에 HTML 없음, 릴리스 다운로드 파일을 열어 `boot` 테스트를 그 파일로 실행(`GAME_HTML=… node tests/e2e/boot.test.cjs`).
- 의존: BLD-01, 사용자 결정(배포 채널)
- 메모(2026-10-28): HTML 커밋은 2026-10-16에 멈췄다(ADR-0013). BLD-06 이후 릴리스에 붙일 것은 `node build/build.mjs --zip`이 만드는 `dist/NeonCity-<날짜>-<커밋>.zip`이다. 검증의 `GAME_HTML`은 이제 `GAME_DIR`(풀어 둔 `NeonCity/game`)이다.

### BLD-03 build/ 정리와 npm 스크립트 — P1 · S · M0 · Backlog
- 범위: 임시 스크립트(`t.mjs`, `tt.mjs`, `ct_tmp.mjs`, `skel_tmp.mjs`, `char_test.mjs`, `char_t2..t7.mjs`, `phys_t2.mjs`)를 `build/scratch/`로 옮기거나 삭제(소유자 확인). `package.json`에 `build`, `test`, `test:quick` 스크립트. 에셋 파이프라인 스크립트 목록을 README에 표로.
- AC: `npm run build`, `npm test -- quick`이 동작한다.

### BLD-04 라이선스 감사와 크레딧 — P0 · M · M0 · Backlog
- 목적: 배포 가능성 확보.
- 범위: (1) 물 셰이더(GPL-2.0-or-later 포팅, `buildWaters`·caustic 텍스처)를 자체 구현으로 교체하거나 프로젝트 전체 라이선스를 GPL로 정한다 — **사용자 결정**. (2) `docs/ASSETS.md`: 모든 에셋의 출처·라이선스·변환 스크립트 표(README 산문을 표로 이전). (3) CC-BY 표기 대상의 게임 내 크레딧(UX-04). (4) "소유자 제공" 자산의 사용 권리 근거 기록.
- AC: ASSETS.md에 누락 에셋 0, GPL 처리 방침이 ADR로 기록.
- 의존: 사용자 결정

### BLD-05 린트·포맷 (변경분만) — P2 · M · Backlog
- 범위: ESLint(오류 위주 규칙: no-undef, no-unused-vars 경고) + 변경 파일만 검사하는 CI 단계. 대량 재포맷 금지(blame 보존).
- AC: CI에서 신규 오류 0.

### BLD-06 실행파일 하나 + zip 배포 — P0 · M · M0 · Review
- 목적: 사용자 요청 "실행파일 한 개만 실행하면 내가 원하는 게임이 되고, 제출할 때는 압축파일로". 결정: Windows, 앱 창, 고사양 팩까지 zip 하나, 한 파일 빌드 제거(ADR-0034, ADR-0001 대체).
- 범위:
  - `launcher/`(Go 런처): `game/`을 127.0.0.1:47820에서 서빙하고 Chrome/Edge 앱 창을 연다. 포트를 기억하고, 같은 폴더면 창만 다시 열고, 핑으로 종료한다.
  - 게임 코드에서 base64와 `file://` 가정을 없앴다(`src/files.js`, `bakedload.js`의 `world/base.pak`, `detail.js` 팩 자동 연결, `chunkstore.httpFile`).
  - `build/build.mjs`가 `dist/NeonCity/`를 만든다. `--zip`은 `build/package.mjs`(README.txt, LICENSES.txt, zip)를 부른다.
  - 테스트는 http로 옮겼다(`tests/lib.cjs`의 `serve`, `GAME_DIR`). `pack`, `hiassets`, `world-small`, `loading-screen`을 고쳤다.
- AC:
  - zip 하나를 풀고 `NeonCity.exe`만 실행하면 타이틀까지 간다.
  - 고사양을 고르면 팩이 자동으로 붙는다.
  - 저장이 새로고침과 재실행 뒤에도 남는다.
  - 런처가 외부 Host, POST, 목록, `..`를 막는다.
  - `unit/launcher`, `unit/package`가 통과한다.
- 검증: `node build/build.mjs --zip`, `node tests/run.cjs --only launcher package keys boot loading-screen world-small pack hiassets`. 실기기 확인은 사용자 PC(Windows)에서 zip을 풀어 실행한다(첫 실행 SmartScreen "추가 정보 → 실행").
- 결과(2026-10-28): 폴더 180 MB, zip 180.6 MB. 이 컨테이너에서 JS 힙은 1020 → 905 MB로 줄었고 `#go.rdy`까지 시간은 같다(ADR-0034 표).
- 남은 것:
  - exe 코드 서명(외부 배포 때, BLD-04와 같이).
  - Chrome·Edge가 모두 없는 PC의 기본 브라우저 모드는 창 닫힘을 핑으로만 안다(최대 3분 뒤 종료).


### BLD-07 고사양 팩을 기본 월드와 같은 빌드에서 굽기 — P0 · S · M0 · Review
- 문제(2026-10-30 확인): `build/build.mjs`가 고사양 팩 `high.pak`을 굽지 않고 `build/baked/pack`에 남아 있던 파일(2026-10-17)을 그대로 복사했다. 그 뒤 지형(한반도 DEM, 높이 축척 V, 수도권 구역)과 도시 배치가 바뀌었다.
  - 고사양을 고르면 플레이어 주변 8 m 지면이 그 옛 데이터다. 같은 지점의 기본(16 m) 지면과 비교한 결과:
    - 수도 중심: 79 m 차이
    - 로컬 (−8000, 4000): 445 m 차이
    - 로컬 (−20000, 9000): 1,379 m 차이. 지금은 바다인 곳이 팩에서는 산이다.
  - 도시 소품(같은 키의 2배 밀도 청크)도 옛 배치 기준이다.
  - 메모리 8 GB, 코어 8개 이상인 PC는 화질을 자동으로 고사양으로 고른다(`detail.suggest`).
- 바꾼 것:
  - 빌드가 기본 월드와 팩을 한 번에 굽는다. 캐시를 쓰므로 바뀐 작업만 다시 한다. `PACK=0`이면 팩을 넣지 않는다.
  - 기본 월드 컨테이너와 팩 컨테이너의 메타에 같은 월드 id를 적는다. id는 기본 청크의 해시에서 만든다.
  - `detail.mountPack`은 월드 id가 다른 월드 팩을 거부한다. 이때는 팩을 하나도 붙이지 않고, 화면에 "팩 오류"를 띄운 뒤 노트북 화질로 돌아간다. 애셋 팩(`assets.pak`)은 월드에 묶이지 않는다.
- AC:
  - `unit/chunkpack`이 통과한다. 같은 bake의 월드 id는 기본과 팩이 같고, 다른 기본 월드에 붙인 팩은 거부되며, 거부 뒤 붙은 것이 없다.
  - 새 빌드에서 같은 지점의 기본 지면과 팩 지면 차이가 셀 크기 수준(수 m)이다.
- 검증: `node tests/unit/chunkpack.test.mjs`, `node build/build.mjs --zip`, 비교 스크립트(`t16` 대 `t8` 지점 높이). 팩 e2e(`pack`, `hiassets`)는 사용자가 실행한다.
- 비용: 팩을 처음 다시 구울 때 약 15~25분이 걸린다(t8 2,401개, 고밀도 도시 496개, 4스레드). 그 뒤로는 바뀐 작업만 굽는다. 지형 원천이 바뀌면 t8 전부를 다시 굽는데, 이 비용은 WLD-21(지역별 무효화)이 줄인다.
