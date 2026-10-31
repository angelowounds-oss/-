# CLAUDE.md — 이 저장소에서 작업하는 방법

네온 도시 오픈월드 게임(three.js r180 + Rapier 0.21). 소스는 `src/`, 빌드 산출물은 게임 폴더 `dist/Korea/`(`Korea.exe` 런처 + `game/`)와 그 zip(ADR-0034).

## 먼저 읽을 것
1. `docs/ROADMAP.md` — 마일스톤, 작업 방식(DoR/DoD, 브랜치·PR 규칙)
2. 맡은 티켓이 있는 `docs/backlog/<파트>.md`
3. `docs/ARCHITECTURE.md` — 모듈 지도, **프레임 순서, 불변 조건**
4. 관련 `docs/adr/*.md`
5. 현재 상태 평가: `docs/REVIEW-2026-10.md`

## 명령
```bash
cd build && npm i && cd ..       # 의존성 (build/node_modules)
node build/build.mjs [--zip]     # 빌드 (월드를 구워 game/world/base/ 와 high/ 에 시·도별 파일로; WORLD=small 이면 굽지 않음) → dist/Korea/ (--zip 이면 dist/Korea-<날짜>-<커밋>.zip, DEV=1 이면 비압축)
REGIONS=seoul,incheon node build/build.mjs   # 그 시·도와 core만 굽고 싣는다(빠진 지역은 페이지가 계산, ADR-0036)
node tests/tools/region-check.cjs <id>     # 그 시·도를 부팅해 오류·NaN·식생·화면 확인 (GAME_DIR로 빌드 선택)
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
- 건물을 말할 때는 고유번호(uid, 예 `HARBOR-0123`, `NC-B04_06-2`)로 한다. 목록은 `docs/buildings/registry.csv`, 규칙은 ADR-0030. 생성기를 바꾸면 `node tests/tools/building-registry.cjs --check` 결과를 PR에 적고 목록을 다시 만든다.
- 지역(시·도)마다 다른 값은 `src/regions/<id>.js`에 둔다(ADR-0036, WLD-21). 그 지역의 도시 정의, 스타일, 규칙, 소품이 여기에 있다. 생성기는 모든 지역이 함께 쓴다. 지역 파일을 더하면 `src/regions/index.js`에 등록하고 `unit/regions`로 확인한다. 굽기 해시는 작업 소스의 import를 따라가고, 지역 파일은 데이터로 넣는다(WLD-21b). 그래서 굽기 작업에 소스를 손으로 더할 필요가 없다.
- 조작키는 `src/keys.js` 한 곳에서 정한다(GTA V 배치, ADR-0033). 코드에 키 코드를 쓰지 말고 `binds.is/held/label`을 쓴다. 기본: M·J 세계 지도(목적지·자동 주행·빠른 이동), U 고도 유지(전투기·다크스타), F 상호작용·키오스크·이동 건너뛰기, F1 조작법. 월드 구조는 `docs/adr/0012-world-archipelago.md`.
- 구운 데이터(`build/baked/`)와 빌드 산출물(`dist/`, zip)은 커밋하지 않는다(2026-10-16 결정, ADR-0013). 빌드 결과는 **zip 하나**(`node build/build.mjs --zip`)로 대화에 전달한다(ADR-0034). 월드 화질 2단계(노트북 내장 / 고사양 팩)와 청크 컨테이너는 `docs/adr/0013-world-detail-tiers.md`.
