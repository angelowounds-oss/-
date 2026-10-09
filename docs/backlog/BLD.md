# BLD — 빌드·QA·릴리스·라이선스

현재: 성숙도 L1→L2, **취약**. 회귀 스위트는 `tests/`로 옮겼으나 CI 없음. 29.3 MB 빌드 산출물이 매 커밋 들어가 `.git` 1.8 GB.
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
