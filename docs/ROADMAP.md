# 로드맵 · 작업 방식

근거: `docs/REVIEW-2026-10.md`(파트별 총평). 작업 단위: `docs/backlog/<파트>.md`의 티켓. 결정 기록: `docs/adr/`.

## 1. 워크스트림(파트)과 백로그 파일

| 코드 | 파트 | 백로그 | 현재 상태 |
|---|---|---|---|
| BLD | 빌드·QA·릴리스·라이선스 | [backlog/BLD.md](backlog/BLD.md) | 취약 |
| SAV | 저장·데이터 | [backlog/SAV.md](backlog/SAV.md) | 취약 |
| PERF | 성능·안정성·계측 | [backlog/PERF.md](backlog/PERF.md) | 취약 |
| GPL | 게임플레이·콘텐츠 | [backlog/GPL.md](backlog/GPL.md) | 취약 |
| ARC | 아키텍처·코드 품질 | [backlog/ARC.md](backlog/ARC.md) | 개선 여지 |
| RND | 렌더링 | [backlog/RND.md](backlog/RND.md) | 정체(계측 대기) |
| WLD | 월드·건물 | [backlog/WLD.md](backlog/WLD.md) | 개선 여지 |
| AI | AI·사회 시스템 | [backlog/AI.md](backlog/AI.md) | 개선 여지 |
| CHR | 캐릭터·애니메이션 | [backlog/CHR.md](backlog/CHR.md) | 개선 여지 |
| PHY | 물리·차량 | [backlog/PHY.md](backlog/PHY.md) | 정체(피드백 대기) |
| UX | UX/UI·입력 | [backlog/UX.md](backlog/UX.md) | 개선 여지 |
| AUD | 오디오 | [backlog/AUD.md](backlog/AUD.md) | 정체(결정 대기) |

## 2. 마일스톤

각 마일스톤은 **종료 조건**이 모두 충족될 때 닫는다. 순서는 의존 관계 기준이며, 같은 마일스톤 안의 티켓은 병렬 진행 가능하다.

### M0 — 기반 (Foundation)
목표: 변경이 안전하게 쌓이고, 빌드가 배포 가능한 상태.
- BLD-01 CI(빌드 + `tests/run.cjs quick`), BLD-02 빌드 산출물 커밋 중단·릴리스 배포, BLD-03 build/ 정리·npm 스크립트, BLD-04 라이선스 감사
- SAV-01 저장 스키마 버전·마이그레이션, SAV-02 저장 실패 표시·용량 예산
- PERF-03 예외 복구(게임 루프 정지 제거)
- GPL-03 / PHY-03 10월 7일 WIP 기능(부착물, 차량 탈출·지붕, 샌드박스) 검증 테스트
- ARC-02 테스트 전용 API(`window.__test`)

**종료 조건**: PR마다 CI가 돈다 · 새 커밋에 30 MB HTML이 없다 · 저장에 `v` 필드와 구버전 픽스처 테스트가 있다 · 라이선스 표(docs/ASSETS.md)와 게임 내 크레딧이 있다 · 예외가 나도 게임이 계속된다.

### M1 — 실측 (Measure)
목표: 성능 판단을 실기기 데이터로.
- PERF-01 실기기 성능 오버레이(GPU 패스별 시간·CPU 구간·GC·로딩), PERF-02 기기 3종 기준선, PERF-05 로딩 시간 측정·에셋 분리 옵션

**종료 조건**: `docs/PERF-BASELINE.md`에 데스크톱 내장 GPU / 중급 모바일 / 고사양 기기의 시나리오별 수치가 있다.

### M2 — 핵심 루프 (Core loop)
목표: 30분 플레이에 목표·보상·성장이 이어지는 루프 하나.
- GPL-01 루프 정의(**결정됨: 자유 샌드박스**, docs/design/core-loop.md), GPL-06 행동 카탈로그, GPL-07 샌드박스 도구, GPL-02 데이터 기반 미션 시스템, GPL-04 경제 밸런스, AI-02 밸런스 데이터 테이블, UX-01 온보딩

**종료 조건**: 새 플레이어가 안내 없이 30분 동안 목표를 이어갈 수 있다(스크립트 플레이 테스트 + 사람 테스트 1회 이상).

### M3 — 폴리시 (Polish)
- CHR-01 캐릭터 다양성, WLD-02 랜드마크 실내, AUD-00/01 오디오 결정·공간화, UX-02 다국어, UX-03 접근성, RND-02/03(M1 데이터 기반)

### 병행 트랙 — 구조 개선
- ARC-01 `Game` 분리(프레임 스케줄 명시), WLD-01 `building.js` 분리, AI-01 전투 AI 구조화
- 원칙: **동작 변경 없음**, 전 스위트 녹색 유지, 콘텐츠 대형 작업(GPL-02, WLD-02) 전에 해당 영역 분리를 먼저.

## 3. 작업 방식

### 티켓 수명주기
`Backlog → Ready → In progress → Review → Done`
- **Ready 조건(DoR)**: 목적·범위·완료 기준(AC)·검증 방법·관련 파일·의존 관계가 티켓에 적혀 있다. 사용자 결정이 필요한 티켓은 결정이 기록된 뒤 Ready.
- **완료 조건(DoD)**
  1. AC를 모두 충족하고, 티켓에 적힌 검증 명령이 통과한다.
  2. `node build/build.mjs` 후 `node tests/run.cjs quick` 통과. 렌더링·성능·월드를 건드렸으면 해당 스위트(`render`/`perf`/`gameplay`) 또는 `all` 통과.
  3. 성능 관련이면 `docs/PERF-BASELINE.md`의 수치를 갱신하거나 회귀가 없음을 기록.
  4. 구조·정책 결정이 있었으면 ADR 추가(`docs/adr/NNNN-*.md`).
  5. 백로그 파일에서 티켓 상태를 Done으로 바꾸고 결과(수치, 커밋)를 한 줄 남긴다.

### 브랜치·PR
- 티켓 하나 = 브랜치 하나 = PR 하나: `feat/<티켓ID>-<짧은설명>` (예: `feat/SAV-01-save-version`). 버그는 `fix/…`.
- PR 본문: 티켓 링크 · 변경 요약 · 검증 결과(테스트 출력 요약, 수치) · 위험/롤백 방법.
- 커밋 메시지는 영어 명령형, 본문에 이유와 측정값. 대형 변경은 동작 무변경 리팩터링 커밋과 기능 커밋을 분리한다.

### Claude 세션으로 진행할 때
- 세션 하나에 티켓 하나. 시작할 때 `CLAUDE.md` → 해당 백로그 파일 → 관련 ADR 순으로 읽는다.
- 범위가 세션 하나를 넘으면(L 크기) 먼저 하위 티켓으로 쪼개 백로그에 적고 그중 하나만 진행한다.
- 사용자 결정이 필요한 지점(디자인·라이선스·에셋 도입)은 추측하지 말고 선택지와 권고안을 정리해 묻는다.

### 정기 점검
- 마일스톤 종료 시 `docs/REVIEW-*.md`를 새로 쓰고 스코어카드(성숙도·상태 태그)를 갱신한다.
- 백로그는 우선순위(P0 > P1 > P2)와 마일스톤 순으로 정렬해 둔다.
