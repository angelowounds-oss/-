# PERF

**이 문서의 모든 fps·ms 목표 판정은 ASSUMED입니다.** 작업 환경에는 GPU가 없고(SwiftShader, CPU 에뮬레이션) 성능은 실제 GPU 측정만 인정하기 때문입니다. 실측 방법은 `CHECKPOINT.md`에 있습니다(`#bench=perf`로 JSON 생성).

## 1. 목표와 현재 판정

| 등급 | 기준 기기 | 목표 | 판정 | 근거 |
|---|---|---|---|---|
| LOW | UHD 620 ~ Iris Xe, 1080p | p95 ≤ 33 ms | ASSUMED | 아래 §3 추정. 적응 제어기가 예산 초과 시 순서대로 강등 |
| LOW | 같음 | GPU 메모리 ≤ 512 MB | PASS(계산값) | 할당량 계산 186 MB(헤드리스 LOW, 캔버스 960×540). 1080p 캔버스는 +약 40 MB 추정 |
| LOW | 같음 | 첫 화면 ≤ 15 s | ASSUMED | SwiftShader 첫 프레임 2.4 s(CPU 에뮬레이션이 실제 iGPU보다 느림) |
| HIGH | RTX 5080급, 1440p | p95 ≤ 16.7 ms | ASSUMED | 실측 필요 |

## 2. 측정 체계 (구현됨, 동작 검증됨)

| 항목 | 방식 |
|---|---|
| GPU 시간 | `EXT_disjoint_timer_query_webgl2`로 구간별(sim·scene·smoke·post·overlay) 측정, disjoint 이벤트 처리 |
| 프레임 통계 | 최근 600프레임 p50/p95/p99 |
| 메모리 | texImage2D/3D·renderbuffer·buffer 할당을 가로채 계산(드라이버 실측 아님으로 표기) |
| 시작 벤치마크 | 약 2.5 s: CFD 1스텝, 최악조건 볼륨 레이마칭, 씬 렌더를 readPixels 동기화로 측정 → 등급별 예측 비용이 예산의 80% 이하인 최고 등급 선택. UA/렌더러 문자열 미사용 |
| 적응 제어 | 비용 > 예산×1.1이면 1단계 강등, < 0.7이 12회 연속이면 1단계 복구. 강등 순서: 볼륨 해상도 → 레이 스텝 → AO → SSR → 그림자 → 렌더 스케일 → 스칼라 해상도 → CFD 갱신율 → CFD 격자 |
| 수동 고정 | `#q=` (전체), `#sim=`, `#vol=`, `#render=` (축별) |
| 결과 출력 | `#bench=perf` → 5개 고정 시점(Hero·Side·Top·Fan·FPV) 순회, JSON 표시·복사·저장 |

## 3. 등급별 설정표 (`src/engine/84-perf-quality.js` QUALITY 한 곳)

| 항목 | LOW | MID | HIGH | ULTRA |
|---|---|---|---|---|
| CFD 격자 | 112×36×52 | 144×46×66 | 176×56×80 | 224×72×100 |
| 연기 스칼라 격자 | 속도 격자의 2배(각 축) | 2배 | 2배 | 2배 |
| 볼륨 해상도(렌더 대비) | 1/4 | 약 1/3 | 약 3/8 | 1/2 |
| 레이 스텝 배율 | 0.75 | 1 | 1 | 1.25 |
| 광선 그림자 탭 | 2 | 4 | 6 | 6 |
| 렌더 스케일 | 0.8 | 1.0 | 1.0 | 1.25(슈퍼샘플링) |
| AO | 없음 | GTAO 2슬라이스 | GTAO 4슬라이스 | 동일 |
| 그림자 | 단일 2048(정적) | CSM 3×1536 PCF | CSM 3×2048 PCSS | CSM 3×4096 PCSS |
| AA | FXAA | TAA | TAA | TAA |
| SSR | 없음 | 없음 | 24스텝 | 48스텝 |
| 예산 | 33.3 ms | 16.7 ms | 16.7 ms | 16.7 ms |

LOW 예산 배분 초안(물리 10 / 연기 8 / 씬 10 / 여유 5 ms)은 **ASSUMED**이며 실측 JSON으로 조정합니다.

## 4. 헤드리스 참고값 (성능 근거 아님)

SwiftShader 벽시계 시간은 알고리즘 간 **상대 비교**에만 씁니다.

| 비교 | 값 |
|---|---|
| 압력 솔버 1회(LOW, 같은 RHS, 0에서 시작) | Jacobi 32: 1.7 s(잔차 0.087) / RBGS-MG 2: 0.99 s(0.067) / MGPCG 8: 4.4 s(4.2e-4) |
| 60스텝 평균(웜스타트, 잔차) | RBGS-MG 2: 3.6 s/스텝(1.4e-4), MGPCG 4: 5.1 s/스텝(1.4e-4), GMG 2: 발산 |
| 검증 원기둥 8셀/D (RBGS-MG 5, vf) | 0.69 s/스텝 |
| LBM D3Q19 8셀/D | VALIDATION "LBM 비교" (같은 물리시간 기준 MAC 대비 약 3~5배) |

출처: `tests/out/m3/solver-compare.md`, `tests/out/m4/*.json`, `tests/out/m7/*.json`. 모두 SwiftShader 벽시계라 상대 비교만 의미가 있습니다.
