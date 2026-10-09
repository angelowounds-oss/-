# PERF — 성능·안정성·계측

현재: L2~L3, **취약**. 큰 병목(경로 탐색, 층 생성, 셰이더 컴파일, 고주사율 끊김)은 제거·테스트로 보호. 남은 것: 실기기 데이터 0,
메이저 GC 10~40 ms(걷기 25초에 약 10회), 29.3 MB 로딩, 예외 하나로 게임 정지. 기준선: `docs/PERF-BASELINE.md`.

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
- AC: 두 빌드의 time-to-interactive와 메모리를 같은 기기에서 비교한 표.

### PERF-06 층별 내비 격자 캐시 — P2 · S · Backlog
- 범위: `navPath`가 매 호출 래스터화하는 격자를 (건물, 층, 영역)별로 캐시하고 콜라이더 변경(벽 파괴, 층 빌드/해제) 시 무효화.
- AC: `nav-perf` 평균 50% 감소, 결과 경로 동일.
