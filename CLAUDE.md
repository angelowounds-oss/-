# CLAUDE.md — 이 저장소에서 작업하는 방법

단일 HTML 네온 도시 오픈월드 게임(three.js r180 + Rapier 0.21). 소스는 `src/`, 빌드 산출물은 `neon_city_v9.html`.

## 먼저 읽을 것
1. `docs/ROADMAP.md` — 마일스톤, 작업 방식(DoR/DoD, 브랜치·PR 규칙)
2. 맡은 티켓이 있는 `docs/backlog/<파트>.md`
3. `docs/ARCHITECTURE.md` — 모듈 지도, **프레임 순서, 불변 조건**
4. 관련 `docs/adr/*.md`
5. 현재 상태 평가: `docs/REVIEW-2026-10.md`

## 명령
```bash
cd build && npm i && cd ..       # 의존성 (build/node_modules)
node build/build.mjs             # 빌드 → neon_city_v9.html (DEV=1 이면 비압축, 프로파일링용)
node tests/run.cjs quick         # 커밋 전 최소 확인 (약 5분)
node tests/run.cjs all           # 렌더링·성능·월드를 건드렸으면 (약 16분, 2026-10-09 컨테이너 기준)
node tests/run.cjs --only <이름> # 테스트 하나
```

## 규칙
- 티켓 하나 = 브랜치 하나 = PR 하나(`feat/<티켓ID>-<설명>`). 범위가 크면(L) 먼저 하위 티켓으로 쪼개 백로그에 적는다.
- DoD: AC 충족 + 티켓의 검증 명령 + `quick`(영역에 따라 해당 스위트/`all`) 통과 + 백로그 상태 갱신 + 필요 시 ADR·`docs/PERF-BASELINE.md` 갱신.
- 불변 조건(ARCHITECTURE.md §3)을 깨지 않는다: 플레이 중 셰이더 컴파일 0, 물리 보간(로직은 `v.x`, 화면은 `v.rx`), 층 생성 단계 8 ms 미만, 렌더 최적화는 픽셀 동일, 풀 버퍼는 dispose 시 한 번 반납.
- 렌더링 최적화는 같은 프레임을 두 방식으로 그려 비교하는 테스트를 함께 만든다. 시각이 달라지는 변경은 사용자 승인 후 ADR에 기록.
- 이 환경에는 GPU가 없다: GPU 시간은 재지 않는다(SwiftShader). 성능 주장은 렌더를 끈 JS 시간·할당·삼각형/드로우콜 수로만, 실기기 판단은 PERF-01/02.
- 코드 스타일: 주변 코드에 맞춘다(주석은 영어, 이유 중심). 새로 쓰거나 크게 고치는 함수는 한 줄 한 문장. 기존 코드 대량 재포맷 금지.
- 에셋을 추가하면 출처·라이선스를 `docs/ASSETS.md`(BLD-04)에 적는다. GPL·CC-BY 표기 의무에 주의.
- 사용자와의 대화는 한국어. 디자인·라이선스·에셋 도입 같은 결정은 선택지와 권고안을 정리해 묻는다.
- `neon_city_v9.html`(약 30 MB)의 커밋 여부는 BLD-02에서 정리 중이다. 정리 전까지는 기존 관행(빌드 후 함께 커밋)을 따른다.
