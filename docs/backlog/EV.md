# EV — AAA 진화 지침서 작업 (docs/AAA-DIRECTIVE-2026-11-12.md)

지침서의 EV 작업 상태와 실측. 상태: Done(AC 충족) · Review(구현·측정 완료, AC 일부 미달이나 다음 단계로 넘김) · In progress · Todo · Blocked(사용자 결정·실기기 필요).
측정 환경: 클라우드 컨테이너, 소프트웨어 GPU(SwiftShader), 메모리 15 GB, 수도권 빌드(`WORLD_PROVINCES=` → 수도권 + 경기 런타임 도로, 도로 147,140개).

## Phase 0 — 측정 가능한 기반

### 종료 조건 대비 (2026-11-12)

| 조건 | 목표 | 현재 | 판정 |
|---|---|---|---|
| 부팅 힙 | ≤ 900 MB | 2,835 MB (HEAD 3,229 MB) | 미달 — EV-01·EV-02 3단계 필요 |
| `window.gc()` | ≤ 150 ms | 약 580 ms (HEAD 708–1,275 ms) | 미달 |
| 전체 스위트 | ≤ 60분, 실패 0 | `ci` 40/41 → launcher 수정 뒤 전부 통과(단독 재실행), 단위의 worldnav는 지역 이음 수정 뒤 통과. 수도권 빌드의 도시 e2e는 이 컨테이너에서 렌더러가 죽는다(HEAD도 같음, 아래 EV-91) | 미달 — EV-01 필요 |
| CI 녹색 | light 작업 녹색 | `ci` 41/41(빈 체크아웃), 린트 변경 줄 0 오류 | 로컬 확인, 원격 미실행(푸시 전) |
| 실기기 기준선 | 표 1종 이상 | 오버레이 준비됨(F3, Shift+F3 복사) | Blocked — 사용자 측정 |
| vehicle-lab·traffic-audit | 현재 값 기록 | vehicle-lab 기록함. traffic-audit는 0.44 km에서 렌더러가 죽어 부분 기록 | 일부 충족 |
| EV-40 | ADR 초안 + 결정 | ADR-0045 초안 | Blocked — 사용자 결정 |

### EV-01 지역 래스터 스트리밍 — P0 · L · Todo
- 아직 시작 전. 부팅 힙의 남은 몫 대부분(지역 래스터, 건물·거리 기록)이 여기와 EV-02 3단계에 걸려 있다.

### EV-02 도로망 SoA와 타일화 — P0 · L · Review (1·2단계)
- 1단계(접근자): `r.pts[i][0]` → `r.x[i]`, `r.z[i]`. 사용처 전부(`carriage`, `highways`, `hwtraffic`, `worldnav`, `streetscape`, `transit`, `game`, `citizens`, `settlements`, `bridgeparts`, `views` 외)와 테스트를 옮겼다.
- 2단계(저장): 도로 표본은 `Float32Array x, z, y`, 격자는 CSR `Int32Array`. 굽기(`bakefmt.js`)에서 같은 배열을 한 번만 쓴다(중복 제거).
- 실측(같은 수도권 빌드, 같은 컨테이너):

  | | HEAD(38c0730) | EV-02 | 차이 |
  |---|---|---|---|
  | 부팅 힙(gc 후) | 3,229 MB | 2,835 MB | −394 MB (−12%) |
  | `window.gc()` | 708–1,275 ms | 약 580 ms | 약 −50% |

- 남은 것(3단계): 2,048 m 타일 질의(`regionRoads(range)`)와 LRU, 전국 거친 그래프. 힙 목표(≤ 900 MB)는 EV-01과 함께 가야 한다.

### EV-04 부동 원점 — P0 · M · Todo (EV-01·02 뒤)
### EV-05 다른 도시·타일 생성 예산 — P1 · S · Todo
### EV-06 렌더러 메모리 누적 원인 — P1 · S · Review
- `tests/tools/memdump.cjs`: Chrome memory-infra 할당자별(partition_alloc, malloc, gpu, v8, cc, skia) 덤프를 부팅 때와 고속도로 순간이동 NP곳에서 남긴다(`tests/results/memdump.json`).
- 원인 확정은 실기기 비교가 필요하다(SwiftShader 한정 여부). 덤프 도구가 그 비교의 기준이다.

### EV-10 차량 실험실 — P0 · S · Done
- `build/lab/vehicle-lab.mjs`(Node, 6종) + `tests/e2e/vehicle-lab.test.cjs`(게임 차량 4종). 스키드패드·슬라럼·ISO 3888·제동·과속방지턱·언덕 정지.
- 현재 값과 실제 범위·격차: `docs/design/vehicle-targets.md`. 주요 격차: 타이어 미끄럼 최대점이 약 2°(실차 3–6°), 트럭·버스가 너무 민첩하고 20% 경사를 못 오름, 방지턱 응답 약 1/3, 제동 5–15% 김.
- e2e 실측(게임 차량, 수도권 빌드, 2026-11-12):

  | 차종 | 스키드패드 횡G (미끄럼각) | 슬라럼 km/h | ISO 3888 km/h | 제동 100→0 건조/젖음 m | 10 m 오르막 20% s | 방지턱 최대 수직G |
  |---|---|---|---|---|---|---|
  | sedan | 0.90 (1.9°) | 68 | 119 | 44.7 / 60.8 | 3.05 | 0.23 |
  | sport | 1.11 (1.8°) | 75 | 116 | 37.5 / 50.9 | 1.63 | 0.23 |
  | suv | 0.84 (2.1°) | 65 | 116 | 46.8 / 63.7 | 3.30 | 0.24 |
  | truck | 0.74 (2.8°) | 57 | 118 | 55.1 / 74.7 | 못 오름 | 0.26 |

### EV-20 교통 감사 — P0 · S · Done(기록)
- `tests/e2e/traffic-audit.test.cjs`: 도로 등급을 돌아가며 자동 주행(기본 10 km), 150 m 안 AI 차의 신호 진입·적신호 진입·정지선 넘음·충돌·차간 시간·제한속도 대비·역주행, 보행자의 차도 위(횡단보도 안/밖).
- 신호·횡단보도는 `streetscape.js`의 타일 감사 기록(`auditOf`)을 읽는다.
- 실측(2026-11-12, 수도권 빌드): 첫 구간(고속도로) 0.44 km를 달린 뒤 렌더러가 메모리로 죽어 10 km를 채우지 못했다(아래 EV-91의 원인).
  - 그 0.44 km의 AI 차 1,181표본: 고속도로 평균 64 km/h(제한 100의 0.64), 과속 0, 역주행 0, 충돌 0.
  - 차간 시간 0.5 s 미만이 51%로 지나치게 붙어 달린다. EV-21 입력.
- 테스트가 구간마다 끝난 이유(`end`)와 게임 알림(`toasts`)을 남기도록 했다. 다음 실행에서 멈춘 원인을 바로 볼 수 있다.

### 경로 그래프 지역 이음 (EV-02 검증 중 발견)
- `worldnav.js RoadGraph`: 각 지역 컴파일러는 자기 지역 선만 잇는다. 그래서 수도권 성분이 고속도로·경기 성분과 끊겨 있었다(`neon`에서 harbor·mid1–3으로 가는 경로가 없었다).
- 수정: 간선의 열린 끝마다 다른 지역 간선의 60 m 안 가장 가까운 표본에 잇는다(일방통행은 방향대로).
- 효과: 주 성분 비율 0.569 → 0.839, 21쌍 모두 경로가 생겼다(직선거리 대비 1.16–1.51배, 3.5 s).

### EV-40 렌더러 방향 스파이크 — P0 · M · Blocked(사용자 결정)
- `build/lab/renderer-spike.mjs` + `build/lab/renderer-spike/index.html`: 같은 장면을 `WebGLRenderer`(현재)와 `WebGPURenderer`(WebGPU, WebGL2 대체 경로)로 그려 비교.
- 결과와 권고: `docs/adr/0045-renderer-direction.md`(초안).
- 요약(SwiftShader, 960 × 540):
  - WebGL2 대체 경로(`gpu-gl`)는 지금 경로보다 프레임당 JS가 2.3–3.3배, GPU가 1.1–2.0배, 첫 프레임이 3.8–25배 걸렸다.
  - WebGPU 백엔드는 이 컨테이너에서 장치를 잃어 잴 수 없었다.
  - 광원 8 → 128개에서 GPU 시간이 435 → 3,022 ms로 늘었다(전방 셰이딩).
  - 권고: C(WebGL2로 Phase 1–2, 클러스터 조명은 직접 만든다. 이전은 실기기 수치를 본 뒤 정한다).

### EV-50 애니메이션 보유 목록 — P0 · S · Done
- `build/lab/anim-inventory.mjs` → `docs/design/anim-inventory.md`. 클립 133개, 게임 이름 136개, 빠진 클립 0, 안 쓰는 클립 0.
- 없는 상호작용: 경사 보행, 계단, 문 열기, 차 승하차(EV-53 입력).

### EV-60 음원 파이프라인 — P0 · S · Done
- `build/assets/audio.mjs`: 매니페스트 `"kind": "audio"` → 2단계 loudnorm(−18 LUFS, TP −1.5 dBTP) → Opus 96k 48 kHz. `--measure`로 출하 파일 점검.
- `tests/unit/audio-pipeline.test.mjs`: 큰 소리·작은 소리 모두 −18.1 LUFS로 나온다.

### EV-84 크레딧·라이선스 화면 — P0 · S · Done
- 빌드가 매니페스트의 확인된 에셋과 라이브러리를 라이선스별로 묶어 `index.html`에 넣는다(`build/assets/credits.mjs`). 일시정지 메뉴와 타이틀의 출처 표기에서 연다(`src/credits.js`). 11묶음 32항목.

### EV-90 CI — P0 · M · Review
- `.github/workflows/ci.yml`: `light`(ubuntu, Node 22, ffmpeg, 변경 줄 린트, `node tests/run.cjs ci`) + `full`(자체 러너, `vars.FULL_CI == 'true'`일 때 빌드 → quick → 결과 업로드).
- 캐시·러너 방침(굽기 캐시 아티팩트 vs 자체 러너)은 사용자 결정. 원격 실행은 푸시 뒤 확인.

### EV-91 테스트 하네스 — P0 · S · Review
- GC: 5스텝마다 → 30스텝마다 또는 힙 256 MB 증가마다(`tests/lib.cjs`, `__gcCount`). 60스텝은 수도권 빌드에서 V8 한계까지 쌓여 렌더러가 죽었다.
- `highway-drive`: 도로 묶음 6개로 분할(`#HD_PART=k/6`). 플레이크 추적: `tests/results/history.json`(테스트마다 최근 20회, 같은 빌드에서 통과·실패가 섞이면 보고). 타임아웃은 `TIMEOUT` 한 곳.
- `world-small` 방침: 미정(아래 결정 목록).
- **수도권 빌드 e2e가 이 컨테이너에서 죽는다(HEAD 38c0730도 같음, 원인 조사 결과).**
  - 증상: 땅 위에서 단계를 밟으면 몇 프레임에서 몇십 프레임 안에 한 프레임이 30–70 s 걸린다. 그 사이 렌더러가 +3 GB, 브라우저가 +1.5 GB 늘고 커널이 죽인다.
    - perf-overlay, heap-gate, traffic-audit가 모두 이렇게 죽었다.
    - 땅에서 2 km 떨어진 시험장에서 도는 vehicle-lab은 통과한다.
  - 원인을 좁힌 과정:
    - 빈 프레임은 멀쩡했다. 렌더를 빼고 `update`만 돌려도 죽었다. JS 콜백 중 오래 걸린 것은 없었다(타이머·rAF 감싸기). 프레임마다 4 MB 넘는 typed array도 새로 만들지 않았다.
    - **매 프레임 `gc()`를 부르면 40프레임 동안 메모리가 3.4 GB에 머물고 멈춤도 없다.**
    - 결론: V8 바깥 ArrayBuffer가 2.4 GB인 상태에서 V8의 자동 GC가 한 번 돌 때 이렇게 된다.
  - 시도한 우회:
    - `GC_EVERY=2`: 빈 갱신 루프는 버텼으나 실제 테스트는 다시 죽었다.
    - `--no-memory-reducer`, `--no-incremental-marking`: 안정적이지 않았다.
  - 하네스에는 `GC_EVERY`, `GC_GROW_MB`, `JS_FLAGS` 환경 변수를 남겼다. 근본 해결은 EV-01이다.
  - 2026-11-09 리뷰의 "택시 한 경로 5–8 GB" 항목과 같은 현상으로 보인다. 그때는 한 경로에서만 나왔고, 지금은 다지역 런타임(WLD-25)이 들어간 뒤라 어디서나 난다.

- launcher 단위 테스트: 전체 스위트 부하에서 bye 뒤 종료(설계 10 s)가 15 s 한도를 넘겼다. 남은 런처 프로세스가 600 s 유휴 시간 동안 러너의 출력 파이프를 붙잡아 610 s가 걸렸다. 한도를 30 s로 늘리고, 끝날 때 띄운 런처를 모두 정리한다.

### EV-92 실기기 성능 오버레이 — P0 · M · Review(사용자 측정 대기)
- F3: 프레임 시간(평균·99%·최악), 단계별 CPU(`Game.stage`), 패스별 GPU(`EXT_disjoint_timer_query_webgl2`, 컴포저 패스 이름), 드로우콜·삼각형·프로그램·지오메트리·텍스처, 힙과 GC. Shift+F3: 기기·위치를 담은 JSON을 클립보드로.
- `tests/e2e/perf-overlay.test.cjs`(quick): 고속도로에서 잰다. 이 컨테이너에서는 EV-91의 메모리 문제로 아직 끝까지 돌지 못했다. 측정표는 사용자가 기기 3종 × 장면 5개로 채운다(`docs/PERF-BASELINE.md §D`).

### EV-93 성능·메모리·부팅 게이트 — P1 · S · Review
- `tests/e2e/heap-gate.test.cjs`: 부팅 힙·gc 시간·600프레임 힙 증가, 부팅 단계 표시(`boot:*`). 상한은 단계별로 내린다(현재 3,200 MB / 800 ms / 400 MB).
- 실측: 부팅 힙(gc 후) 2,835 MB, `gc()` 653–749 ms(`S/heap` 탐침, 같은 빌드). 600프레임 단계는 아래 EV-91 문제로 이 컨테이너에서 끝까지 돌지 못했다.
- `usedJSHeapSize`에는 V8 바깥의 ArrayBuffer가 들어 있다. memory-infra 덤프로 보면 부팅 때 V8 힙은 515 MB, ArrayBuffer는 2,428 MB다.
  - 그 가운데 `core` 청크(지역 래스터 등)가 825 MB다.
  - 힙 목표(≤ 900 MB)는 사실상 ArrayBuffer 목표다. EV-01(래스터 타일 스트리밍)이 가장 큰 몫이다.
- 남은 것: `alloc-gate`, `drive-hitch`.

### EV-94 린트 — P1 · S · Done
- `build/lint.mjs`(ESLint 9, 변경 줄만, `--all`은 빚 집계, `--json`), 규칙: 줄 끝 주석이 코드를 삼키는 패턴(`build/lint/no-code-in-comment.mjs`), 미사용·미정의 이름, 도달 불가, 중복 키, 자기 대입, `src`의 `console.log`.
- 이 브랜치가 main 대비 바꾼 줄의 오류 171건(미사용 169, 자기 대입 2)을 정리했다. 대부분 죽은 선언이고, 부작용 없는 것만 지웠다.

### EV-96 테스트 전용 API — P1 · S · Done
- `window.__test`(`src/testapi.js`): `teleport`, `time`, `weather`, `spawn`, `step`, `streets`, `signal`, `measure`, `perf`. 새 테스트(heap-gate, vehicle-lab, traffic-audit, perf-overlay, memdump)는 이것만 쓴다.

## 사용자 결정이 필요한 것
1. EV-40 렌더러 방향(ADR-0045 초안의 권고 참고).
2. EV-90 CI 방침: 굽기 캐시를 Actions 캐시·아티팩트로 둘지, 자체 러너로 전체 스위트를 돌릴지.
3. EV-91 `world-small`: 테스트 전용 소형 월드를 유지하고 기대값을 갱신할지, 지우고 수도권 빌드로만 볼지.
4. EV-92 실기기 측정: 기기 3종에서 F3 → Shift+F3 기록을 보내 주면 기준선 표를 채운다.
