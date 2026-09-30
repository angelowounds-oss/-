# PROGRESS

상태: **PASS** 실제 검증으로 기준 충족 · **PARTIAL** 구현됐으나 일부 기준 미달 · **ASSUMED** 직접 검증 불가, 근거 있는 가정 · **BLOCKED** 이 환경에서 구현 불가.
검증 환경: 헤드리스 Chromium 1194 + SwiftShader(ANGLE/Vulkan CPU). 성능 수치는 이 환경에서 주장하지 않음.

## 마일스톤

| M | 내용 | 상태 | 증거 |
|---|---|---|---|
| M0 | 구조 분리·빌드·렌더러 결정·회귀 기준선 | 완료 | `tests/out/m0/`, `dist/snapshots/M0.json`, ARCHITECTURE §2 |
| M1 | 계측 HUD·#bench·JSON | 완료 | `tests/out/m1/perf-smoke.json` (5개 시점 JSON, 시작 벤치마크가 SwiftShader에서 LOW 선택) |
| M2 | 적응 품질·동적 해상도 | 완료(로직), 성능 ASSUMED | 84-perf-quality, PERF.md |
| M3A | MAC 격자 | 완료 | 발산 RMS 3.8e-5 (VALIDATION) |
| M3B | 압력 솔버 비교 | 완료 | `tests/out/m3/solver-compare.md` |
| M3C | 부분체적 경계 | 완료 | 구 체적 오차 0.1 % (φ 합 0.5243 vs 0.5236 m³) |
| M3D | 이동 고체 | 완료 | 사람 셀 45개·보행속도, 바퀴 ω=U/R, 롤링로드, 팬 |
| M4 | LES·힘·검증 | 진행 중 | VALIDATION.md (원기둥 St PASS, Cd PARTIAL) |
| M5 | 볼류메트릭·TAA·톤매핑 | 완료(화면 확인) | `tests/out/shots/` |
| M6 | 그림자·AO·IBL·재질 | 완료(화면 확인) | 같음 |
| M7 | LBM 비교 | 진행 중 | `tests/out/m7/` |
| M8 | 에셋·최종 빌드·문서 | 진행 중 | |

## 요구사항 상태표

| 영역 | 요구사항 | 상태 | 근거 |
|---|---|---|---|
| 빌드 | 단일 self-contained `dist/aether.html` | PASS | 회귀 테스트 부팅·외부 요청 0건 |
| 빌드 | src 모듈화 + 빌드 스크립트 | PASS | `src/engine/*`, `tools/build.mjs` |
| 빌드 | esbuild | BLOCKED | npm 403 → Node 내장 빌드로 대체 |
| 빌드 | dist ≤ 12 MB (한도 20 MB) | PARTIAL | 15.6 MB: 사용자 차량 GLB 6.7 MB + 콘솔 7.1 MB가 base64로 포함. 한도 20 MB 이내 |
| 검사 | JS eslint | PASS | `node tools/lint.mjs` 0건 |
| 검사 | 셰이더 glslangValidator | BLOCKED | 설치 불가. 대체: ANGLE 실제 컴파일 결과 수집(실패 0) |
| 보존 | 기존 기능 회귀 없음 | PASS(M0), M5 재실행 대기 | `tests/out/m0/regression.md` |
| 품질 | UA 추측 없이 GPU 실측 벤치마크로 등급 선택 | PASS(동작) | 렌더러 문자열 판정 코드 제거, 2.5 s 측정 |
| 품질 | timer query 기반 실행 중 조정 | PASS(동작) | 84-perf-quality |
| 품질 | 수동 고정, sim/vol/render 독립 조절 | PASS | `#q`, `#sim`, `#vol`, `#render` |
| 품질 | 강등 순서 준수 | PASS | QUALITY.ladder (SSR은 AO 다음에 추가) |
| 성능 | LOW p95 ≤ 33 ms / 첫 화면 ≤ 15 s | ASSUMED | 실측 필요 (CHECKPOINT.md) |
| 성능 | LOW GPU 메모리 ≤ 512 MB | PASS(계산값) | 186 MB 할당 계산 |
| 성능 | HIGH p95 ≤ 16.7 ms | ASSUMED | 실측 필요 |
| 안정성 | 흰 화면/크래시 금지, 실패 시 강등+UI 표시 | PASS | MAC 실패 → collocated 자동 전환(HUD 표기), FX 실패 → 순방향 경로 |
| 표기 | 계산값/근사/연출 구분, 상시 고지 | PASS | HUD 하단 줄 |
| WebGPU | 이득 입증 시에만 추가 | ASSUMED(추가 안 함) | 실측 불가 → WebGL2 단일 경로 |
| 에셋 | 공개 빌드 라이선스 | 사용자 결정으로 해당 없음 | QUESTIONS Q1 |
| 렌더러 | 자체 vs three.js vs Babylon 비교 | ASSUMED | 설치 불가로 문서 비교 |
| CFD | MAC 격자 | PASS | |
| CFD | 제한자 포함 MacCormack | PASS | 속도·연기 모두 |
| CFD | GMG/MGPCG/RBGS-MG 비교 후 선택 | PASS | RBGS-MG 채택 |
| CFD | 상대 잔차 ≤ 1e-3 | PASS(풍동) | 6.5e-4 |
| CFD | 부분체적 경계 | PASS | |
| CFD | 차량·팬·사람·회전 바퀴·이동 바닥 | PASS | |
| CFD | LES | PASS(구현) | Smagorinsky |
| CFD | LOW 와도 보존력 선택 보정 명시 | PASS | LOW만 ε=0.25, HUD 표기, `#vc=0`으로 끔 |
| CFD | Cd/Cl 시간평균·표준편차 | PASS | HUD 최근 8 s |
| CFD | 연기 스칼라 ≥ 속도 격자 2배 | PASS | 각 축 2배 |
| CFD | 기존 솔버 fallback 유지 | PASS | `#impl=COLLOCATED` |
| 검증 | 균일류 < 0.5 % | PASS | 0 % |
| 검증 | 발산 RMS < 1e-3, 최대 < 1e-2 | PASS(풍동) | 3.8e-5 / 1.7e-3 |
| 검증 | 원기둥 St 0.18~0.22 | PASS(8셀/D) | 0.2075 |
| 검증 | 원기둥·구 Cd ±20 % | PARTIAL / 진행 중 | 원기둥 +20.3 % |
| 검증 | 격자 수렴 3단계 | 진행 중 | |
| 그래픽 | 선형 HDR + AgX/ACES + 노출 | PASS | `#tone=ACES` 선택 가능 |
| 그래픽 | GGX PBR, IBL 사전필터, SH 조도, 클리어코트, 프레넬 유리 | PASS(화면 확인) | 89-lighting-hq |
| 그래픽 | HIGH CSM + PCF/PCSS, TAA | PASS(화면 확인) | |
| 그래픽 | MID+ GTAO | PASS(구현) | |
| 그래픽 | LOW 저해상도 그림자 + FXAA | PASS | |
| 그래픽 | 볼류메트릭: 저해상도·블루노이즈·시간재투영·깊이 인지 업샘플·HG·광선 그림자 | PASS(화면 확인) | 88-post-fx |
| 그래픽 | 장면 깊이로 모든 불투명 물체가 연기를 가림 | PASS | 관측창 예외 처리 제거, 콘솔 가림 스크린샷 |
| 그래픽 | 약한 블룸, 동적 해상도 | PASS | |
| 에셋 | meshopt·KTX2/Basis 검토 | BLOCKED | 라이브러리 설치 불가 |
| LBM | D3Q19 구현·FP32/FP16/혼합 비교 | 진행 중 | |
