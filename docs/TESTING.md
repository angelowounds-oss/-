# 테스트

`tests/run.cjs`가 실행하는 회귀 스위트. 모든 브라우저 테스트는 헤드리스 Chromium(SwiftShader WebGL2)으로 빌드된 `neon_city_v9.html`을
열고 `window.__game`을 직접 조작한다. 전략과 한계는 [ADR-0007](adr/0007-test-strategy-swiftshader.md).

## 실행

```bash
cd build && npm i && cd ..          # 처음 한 번 (three, rapier, esbuild …)
node build/build.mjs                # 테스트는 빌드 산출물을 연다
node tests/run.cjs quick            # 단위 + 부팅 + 컬링·조명 동일성 (약 5분)
node tests/run.cjs render gameplay  # 스위트 지정
node tests/run.cjs --only breach    # 테스트 하나
node tests/run.cjs                  # 전체 (약 16분, 4코어 컨테이너 기준 · 2026-10-09 18/18 통과)
```

- Playwright: `require('playwright')`가 안 되면 `PLAYWRIGHT` 환경변수 경로(기본 `/opt/node22/lib/node_modules/playwright`)를 쓴다. 다른 빌드 파일은 `GAME_HTML=/path/to.html`.
- 결과: 터미널 요약 + `tests/results/last-run.json`(git 제외).
- 테스트는 **하나씩 순서대로** 돈다. 병렬로 돌리면 시간 측정 테스트가 흔들린다.

## 목록

| 스위트 | 테스트 | 무엇을 지키는가 | 합격 기준 |
|---|---|---|---|
| unit | `builder-bitexact` | 층 Builder 출력이 기준 구현(`tests/fixtures/gfx_ref.js`)과 비트 동일(풀 버퍼 재사용 포함) | 차이 0 |
| smoke | `boot` | 로딩·시작·첫 프레임, 페이지 오류 없음 | 오류 0, 화면 40% 이상 내용 |
| render | `cull-identity` | 프러스텀 컬링이 픽셀을 바꾸지 않음(거리·실내, 두 방향) | 바이트 차이 0 |
| render | `pack-identity` | 원경 인스턴스 패킹이 도시 안에서 픽셀 동일(가장자리 바깥 보기 포함) | 바이트 차이 0 |
| render | `light-skip-identity` | 조명 루프 패치가 three.js 원본 청크와 동일(조명 꺼짐/켜짐) | 바이트 차이 0 |
| render | `sign-ctx-restore` | WebGL 컨텍스트 복구 후 간판 텍스처 배열 재업로드 | 레이어 해시 동일 |
| render | `no-runtime-compile` | 걷기·폭발·랙돌·5성·손전등·밤/비/낮·사격·수류탄·벽 파괴·운전·수영·실내·옥상에서 새 셰이더 0 | 새 프로그램 0 |
| gameplay | `entrance-holes` | 로비가 없는 건물의 출입구가 열려 보이지 않음(걷기·운전) | 구멍 프레임 0 |
| gameplay | `breach` | 바깥벽 3면·코어 벽 파괴, 구멍으로 통과 가능 | 모든 벽 구멍 + 레이 통과 |
| gameplay | `floor-population` | 탑 문 앞 15초 안에 로비 포함 3개 층 이상 생성, 인물 배치 | 층 3+, 인물 1+ |
| gameplay | `ai-behaviour` | 등 돌린 적 미인지, 총성 조사·접근, 피격 시 엄폐/교전, 시민 공포 전파 | 상태 전이 일치 |
| gameplay | `military` | 5성 헬기·탱크 투입, 폭발 피해, 수배 해제 시 철수 | 모두 충족 |
| gameplay | `pool-integrity` | 4,000프레임 보행 후 살아 있는 지오메트리끼리 버퍼 공유 없음 | 시작 시 공유 수와 동일 |
| gameplay | `fire-spread` | 폭발·화염병 불이 차량에 번져 피해→연소, 연료 웅덩이 인화, 주변 시민 도주, 불길 속 사람 피해와 불 옮김, 방화 범죄 기록, 저절로 소멸, 불 24개 갱신 1 ms 미만 | 위 항목 전부 |
| gameplay | `building-fire` | 정문 앞 불 → 건물 발화, 40초 뒤 3개 층 이상 연소·외관 aBurn·실내 불, 붕괴 → 폐허(충돌체 8 m 미만, 탑 인스턴스 0, 안의 시민 사망, 장식 숨김, 저장, 다시 열리지 않음), 재건 시 원상 복구, 저장 후 새로고침해도 폐허 유지, 붕괴 중 셰이더 컴파일 0, 동시 화재 6동 갱신 2 ms 미만 | 위 항목 전부 |
| gameplay | `shop-robbery` | 총을 겨눈 채 점원 위협 → $300~1500 획득, 가게를 떠나도 무음 경보로 열 상승, 같은 계산대 재강도 불가, 비무장이면 동사 없음 | 위 항목 전부 |
| perf | `frame-time` | 보행·주행 1,500프레임 JS 시간(렌더 제외) | 중앙값 < 8 ms, p99 < 30 ms, 33 ms 초과 ≤ 8 |
| perf | `physics-interp` | 144 Hz에서 차량이 매 프레임 고르게 이동 | 정지 프레임 ≤ 0.5%, 중앙 이동 1±0.05 |
| perf | `gunfire-load` | 연사 중·후 NPC 갱신 비용 | 사람 갱신 < 3 ms/프레임, p90 < 12 ms |
| perf | `nav-perf` | 경로 탐색 160건(도달 불가 포함) | 평균 < 3 ms, p95 < 10 ms, 최대 < 40 ms |
| perf | `autoquality` | 동적 해상도: 나쁜 순간 후 60 Hz에서 복귀, GPU 한계 시 백오프 | 복귀 1.0, 대기 48 s 이상 |

## 새 테스트 작성 규칙
- `tests/e2e/<이름>.test.cjs`: `run(name, {q, width, height}, async ({page}) => { … result(name, pass, metrics) })`. 게임을 손으로 진행할 때는 먼저 `freeze(page)`(rAF 루프 정지, 진짜 update는 `window.__upd`).
- 픽셀 비교는 `shot(page)` + `pixelDiff`. GPU 시간은 재지 않는다. 시간 측정은 렌더를 끄고(`g.eng.render = () => {}`) 한다.
- 합격 기준은 **수치로** 결과에 남긴다(metrics). 실패 시 원인을 볼 수 있게.
- 스위트 등록: `tests/run.cjs`의 `SUITES`.
- 내부 구조 의존을 줄이는 테스트 API는 ARC-02에서 도입 예정.
