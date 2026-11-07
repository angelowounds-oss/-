# PERF — 성능·안정성·계측

현재: L2~L3, **취약**. 큰 병목(경로 탐색, 층 생성, 셰이더 컴파일, 고주사율 끊김)은 제거·테스트로 보호. 남은 것: 실기기 데이터 0,
메이저 GC 10~40 ms(걷기 25초에 약 10회), 29.3 MB 로딩, 예외 하나로 게임 정지. 기준선: `docs/PERF-BASELINE.md`.

### PERF-07 업데이트마다 약 4 MB, 태스크가 끝나야 풀리는 렌더러 메모리 — P1 · M · Backlog (2026-11-07)
- 관찰: 한 번의 긴 `page.evaluate` 안에서 `__upd`를 연달아 부르면 렌더러 RSS가 업데이트마다 약 4 MB씩 늘었다. 1,500~2,500번이면 6.5~7.2 GB에서 OOM으로 죽었다.
  - 해당 테스트: `war-craft`, `water`, `motion-realism`, `no-runtime-compile`, `highways`, `worldnav`.
  - 이벤트 루프에 한 번 양보하면 바로 풀린다(2틱마다 양보: 최고 3.0 GB).
- 배제한 것: 네트워크 요청 0, JS 힙(`usedJSHeapSize`)은 그대로, 오디오를 꺼도 같음, 이번 변경 전 JS(ccb0194)로도 같음.
- 플레이: 게임은 매 프레임 양보하므로 쌓이지 않는다. 다만 프레임마다 4 MB를 잡았다 놓는다면 그 자체로 비용이다.
- 할 일: 무엇이 잡는지 찾는다. 후보는 Blink 쪽 객체(캔버스·이미지), wasm-bindgen 객체 해제(FinalizationRegistry), 워커 메시지다. 업데이트를 부분별로 끄며 RSS를 비교한다.
- 그동안 테스트는 2틱마다 양보한다(위 6개).
- 양보해도 죽는 경우(2026-11-07): `highways`(그리고 `worldnav`)는 2틱마다 양보해도 렌더러가 죽었다. 이번 변경 전 JS(ccb0194)로도 똑같았다.
  - `highways`: 고속도로를 600틱 동안 달리면 RSS가 2.7 GB에서 4.9 GB로 일정하게 늘었다(초당 약 30 MB). 요금소로 순간이동하자 몇 초 만에 7.6 GB가 됐다.
  - 새 땅을 스트리밍해 들이는 만큼 늘고, 지나온 땅이 제때 풀리지 않는 것으로 보인다. 스트리밍 메모리 상한(지난 타일 해제)을 확인할 것.
  - 실기기에서 고속 주행이나 장거리 순간이동 뒤 메모리가 얼마나 남는지 재야 한다(PERF-01 오버레이).
- `transit`의 최악 프레임 450 ms 기준은 이 소프트웨어 GPU 컨테이너에서 이번 변경 전 빌드로도 595~804 ms가 나와 실패한다. 기능 항목(4종 탑승 도착)은 통과했다.

### PERF-01 실기기 성능 오버레이 v2 — P0 · M · M1 · Backlog
- 목적: GPU 최적화(RND)가 근거 없이 멈춰 있는 상태를 푼다.
- 범위: 설정의 FPS 표시를 확장. `EXT_disjoint_timer_query_webgl2`로 그림자/메인/블룸/출력+SMAA 패스별 GPU ms(지원 기기), CPU 구간(이미 있는 `frameDiag`), `PerformanceObserver('longtask')` 긴 작업, 로딩 단계별 시간. "보고서 복사" 버튼으로 JSON.
- AC: 지원 기기에서 패스별 GPU ms가 1초 평균으로 보인다. 미지원이면 "GPU 타이머 없음"으로 표시하고 나머지는 동작. 오버레이를 꺼두면 비용 0.
- 검증: `boot` 테스트에 오버레이 켠 상태 추가(오류 없음). 실기기 1대에서 보고서 JSON 확보.
- 관련 파일: `src/game.js` (`frameDiag`, `updateHUD` FPS), `src/engine.js` (`render`), `src/template.html`

### PERF-02 실기기 기준선 3종 — P0 · S · M1 · Backlog
- 범위: 데스크톱 내장 GPU, 중급 안드로이드(또는 iPhone), 고사양 데스크톱에서 정해진 시나리오(스폰 정지 30초, 걷기 1분, 주행 1분, 실내 1분, 5성 전투 1분)의 PERF-01 보고서를 `docs/PERF-BASELINE.md`에 기록.
- 의존: PERF-01, **사람이 기기에서 실행**

### PERF-03 예외 복구 — P0 · S · M0 · Backlog
- 목적: 업데이트 중 예외 하나가 `fatal()`로 게임 루프를 영구 정지시키는 문제.
- 범위: 프레임 단계별(`updatePlayer`, `updateVehicles`, …) try/catch 래퍼, 같은 단계에서 연속 N회 실패할 때만 치명 화면. 오류 링버퍼(최근 20개)와 "오류 복사" 버튼.
- AC: 테스트에서 한 NPC의 `update`가 예외를 던지게 해도 다음 프레임이 계속 돈다(새 테스트 `e2e/error-resilience.test.cjs`).
- 관련 파일: `src/main.js` (`fatal`, 루프), `src/game.js` (`update`)

### PERF-04 승격 할당 줄이기(메이저 GC) — P1 · L · Backlog
- 목적: 메이저 GC 정지(10~40 ms) 빈도 절반.
- 근거: 힙 샘플링(마이너 GC 생존 객체) 상위 — `AnimationAction._update`(three.js), `colliders.resolve`, `Human.update`, `driveAI`, `vehicleVsHumans`, `updateFakeLights`(쌍 배열). 프레임당 약 89 KB 승격.
- 범위: 프레임 임시 객체를 모듈 스크래치/풀로 교체(동작 동일). three.js 애니메이션은 활성 액션 수 줄이기(가중치 0 액션 정지).
- AC: `frame-time` 걷기 1,500프레임 동안 메이저 GC 횟수(트레이싱으로 측정) 50% 이상 감소, 결과 비트 동일성 테스트 녹색.
- 검증: GC 횟수를 내는 테스트를 추가(`e2e/gc-count.test.cjs`, Playwright tracing의 `MajorGC` 이벤트 집계).
- 하위 티켓으로 쪼갤 것(파일별).

### PERF-05 로딩 시간과 에셋 분리 옵션 — P1 · M · M1 · Backlog
- 범위: 로딩 단계별 시간 기록(디코딩, 월드 생성, 프리워밍). 에셋을 base64 대신 별도 파일로 두는 "멀티 파일 빌드" 옵션(단일 HTML 빌드는 유지) — ADR-0001 재검토.
- 메모(2026-10-28): 멀티 파일은 BLD-06(ADR-0034)으로 기본이자 유일한 빌드가 됐다. 단일 HTML은 없앴다. 이 컨테이너의 비교(힙 1020 → 905 MB, `#go.rdy`까지는 같음)는 ADR-0034에 있다. 남은 일은 실기기 비교와 단계별 시간 기록이다.
- AC: 두 빌드의 time-to-interactive와 메모리를 같은 기기에서 비교한 표.

### PERF-06 층별 내비 격자 캐시 — P2 · S · Backlog
- 범위: `navPath`가 매 호출 래스터화하는 격자를 (건물, 층, 영역)별로 캐시하고 콜라이더 변경(벽 파괴, 층 빌드/해제) 시 무효화.
- AC: `nav-perf` 평균 50% 감소, 결과 경로 동일.
