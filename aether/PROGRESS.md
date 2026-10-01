# PROGRESS

상태: **PASS** 실제 검증으로 기준 충족 · **PARTIAL** 구현됐으나 일부 기준 미달 · **ASSUMED** 직접 검증 불가, 근거 있는 가정 · **BLOCKED** 이 환경에서 구현 불가.
검증 환경: 헤드리스 Chromium 1194 + SwiftShader(ANGLE/Vulkan CPU). 성능 수치는 이 환경에서 주장하지 않습니다(PERF.md).

## 마일스톤

| M | 내용 | 상태 | 증거 |
|---|---|---|---|
| M0 | 구조 분리·빌드·렌더러 결정·회귀 기준선 | 완료 | `tests/out/m0/`, `dist/snapshots/M0.json`, ARCHITECTURE §2 |
| M1 | 계측 HUD·#bench·JSON | 완료 | `tests/out/m1/perf-smoke.json` |
| M2 | 적응 품질·동적 해상도 | 완료(로직 검증), 성능 ASSUMED | 84-perf-quality, PERF.md |
| M3A | MAC 격자 | 완료 | VALIDATION 발산 행 |
| M3B | 압력 솔버 비교 | 완료 | `tests/out/m3/solver-compare.md` (RBGS-MG 채택, GMG 발산 기록) |
| M3C | 부분체적 경계 | 완료 | cut vs vf 비교 후 vf 채택 (VALIDATION "경계 처리 비교") |
| M3D | 이동 고체 | 완료 | 회귀 "이동 사람 고체", 바퀴 ω=U/R, 롤링로드, 팬 |
| M4 | LES·힘·검증 | 완료 | VALIDATION.md 전 항목 PASS |
| M5 | 볼류메트릭·TAA·톤매핑 | 완료(화면 확인) | `tests/out/shots/`, `tests/out/m8/cam*.png` |
| M6 | 그림자·AO·IBL·재질 | 완료(화면 확인) | 같음 |
| M7 | LBM 비교 | 완료 | VALIDATION "LBM 비교", ARCHITECTURE §5 (MAC 유지) |
| M8 | 에셋·최종 빌드·문서 | 완료 | `tests/out/m8/regression.md` 전 항목 PASS(최신 빌드), `dist/snapshots/M8.json` |

## 요구사항 상태표

| 영역 | 요구사항 | 상태 | 근거 |
|---|---|---|---|
| 빌드 | 단일 self-contained `dist/aether.html`, 더블클릭 실행 | PASS | 회귀: 부팅, 외부 요청 0건 |
| 빌드 | src 모듈화 + 빌드 스크립트 | PASS | `src/engine/*`, `tools/build.mjs` |
| 빌드 | esbuild | BLOCKED | npm 403 → Node 내장 빌드로 대체(QUESTIONS Q2) |
| 빌드 | dist ≤ 12 MB (한도 20 MB) | PARTIAL | 15.6 MB: 사용자 차량 GLB 6.7 MB + 콘솔 7.1 MB가 base64로 포함. 한도 20 MB 이내, 품질 훼손 없이 줄일 도구(meshopt·KTX2) 설치 불가 |
| 검사 | JS eslint | PASS | `node tools/lint.mjs` 0건 |
| 검사 | 셰이더 glslangValidator | BLOCKED | 설치 불가. 대체: ANGLE 실제 컴파일 124개, 실패 0 (회귀) |
| 보존 | 기존 기능 회귀 없음(PBR 풍동·관제실·자동문/계단·1인칭·이동 사람 고체·레이크/완드·HUD·마네킹·인트로·한국어 UI) | PASS | `tests/out/m8/regression.md` 전 항목 PASS |
| 보존 | 원본 16MB HTML 직접 편집 금지 | PASS | `original/` 기준본 유지, 빌드로만 생성 |
| 품질 | UA 추측 없이 GPU 실측 벤치마크로 등급 선택 | PASS(동작) | 렌더러 문자열 판정 코드 제거, 2.5 s 측정 |
| 품질 | timer query 기반 실행 중 조정 | PASS(동작) | 84-perf-quality |
| 품질 | 수동 고정, sim/vol/render 독립 조절 | PASS | 엔지니어 패널 "화질 · 해상도"(등급·해상도·자동 조절, 브라우저에 저장) + 주소 옵션 `#q`, `#sim`, `#vol`, `#render` |
| 품질 | 강등 순서(볼륨→스텝→AO→그림자→스케일→스칼라→갱신율→격자) | PASS | QUALITY.ladder (SSR은 AO 다음에 추가) |
| 성능 | LOW p95 ≤ 33 ms / 첫 화면 ≤ 15 s | ASSUMED | 실측 필요(CHECKPOINT.md). SwiftShader 부팅 28.6 s는 CPU 에뮬레이션 값 |
| 성능 | LOW GPU 메모리 ≤ 512 MB | PASS(계산값) | 할당량 계산 186 MB |
| 성능 | HIGH p95 ≤ 16.7 ms | ASSUMED | 실측 필요 |
| 안정성 | 흰 화면/크래시 금지, 실패 시 강등+UI 표시 | PASS | MAC 실패 → collocated 자동 전환(HUD 표기), FX 실패 → 순방향 경로 |
| 표기 | 계산값/근사/연출 구분, "정성적 시각화이며 공학 해석 도구가 아님" 상시 | PASS | HUD 하단 줄, 회귀 검사 항목 |
| WebGPU | 이득 입증 시에만 추가 | ASSUMED(추가 안 함) | 실측 불가 → WebGL2 단일 경로 |
| 렌더러 | 자체 vs three.js vs Babylon 비교 | ASSUMED | 설치 불가로 문서 비교(ARCHITECTURE §2) |
| 에셋 | 공개 빌드는 라이선스 명확한 에셋만, 사용자 GLB는 로컬 전용 | PARTIAL | 사용자 지시로 개인용 빌드만 생성(사용자 GLB 포함). 공개 빌드 미생성(QUESTIONS Q1, Q4) |
| 에셋 | meshopt·KTX2/Basis 검토 | BLOCKED | 라이브러리 설치 불가 |
| CFD | 엇갈린 MAC 격자 | PASS | 86-mac-cfd |
| CFD | 제한자 포함 MacCormack | PASS | 속도·연기 모두 |
| CFD | GMG/MGPCG/RBGS-MG 같은 조건 비교 후 선택 | PASS | GMG 발산, RBGS-MG 2 채택(잔차 1.4e-4), MGPCG는 더 비쌈 |
| CFD | 상대 잔차 ≤ 1e-3 | PASS | 풍동 1.4e-4, 검증 원기둥 1.7e-4~5.3e-4(반축 조대화 멀티그리드) |
| CFD | 부분체적 경계 | PASS | cut·vf 비교, vf 채택 |
| CFD | 차량·팬·사람(보행속도)·회전 바퀴·이동 바닥 | PASS | |
| CFD | LES(Smagorinsky) | PASS(구현) | 풍동에서 사용. 검증(Re 100~200 층류)은 LES 끔 |
| CFD | LOW 와도 보존력 선택 보정 명시 | PASS | LOW만 ε=0.25, HUD 표기, `#vc=0` |
| CFD | Cd/Cl 시간평균·표준편차 | PASS | HUD 최근 8 s. 차량 Cl은 "신뢰 낮음" 표기(KNOWN_LIMITATIONS L4) |
| CFD | 연기 스칼라 ≥ 속도 격자 2배 | PASS | 각 축 2배 |
| CFD | 기존 솔버 fallback 유지 | PASS | `#impl=COLLOCATED`, 자동 전환 |
| 검증 | 균일류 < 0.5 % | PASS | 0 % |
| 검증 | 발산 RMS < 1e-3, 최대 < 1e-2 | PASS | 풍동 1.4e-6/5.5e-5, 원기둥·구 ≤ 7.2e-6/8.3e-5 |
| 검증 | 원기둥 St 0.18~0.22 | PASS | 6/8/12셀/D: 0.182/0.185/0.195, 폭 16D 0.180 |
| 검증 | 원기둥·구 Cd ±20 % | PASS | 원기둥 −0.7~+13.1 %(검사체적 +7.8~+16.9 %), 구 −1.6 %(검사체적 −14.6 %) |
| 검증 | 격자 수렴 3단계 | PASS(보고) | Cd 1.330→1.484→1.516, St 0.182→0.185→0.195 |
| 검증 | 차량 결과는 참고값 | PASS | HUD 표기 |
| 검증 | NaN/Inf를 성공으로 처리하지 않음 | PASS | 하네스가 비유한값에서 중단·실패 처리, 보고서 NaN 열 |
| 그래픽 | 선형 HDR + AgX/ACES + 노출 | PASS | `#tone=ACES` |
| 그래픽 | GGX PBR, IBL 사전필터, SH 조도, 클리어코트, 프레넬 유리 | PASS(화면 확인) | 89-lighting-hq |
| 그래픽 | HIGH CSM + PCF/PCSS, TAA | PASS(화면 확인) | |
| 그래픽 | MID+ GTAO | PASS(구현) | |
| 그래픽 | LOW 저해상도 그림자 + FXAA | PASS | |
| 그래픽 | 볼류메트릭: 1/2~1/4·블루노이즈·시간재투영·깊이 인지 업샘플·HG·광선 그림자 | PASS(화면 확인) | 88-post-fx |
| 그래픽 | 장면 깊이로 모든 불투명 물체가 연기를 가림 | PASS | 깊이 텍스처 레이 종료, 스크린샷 |
| 그래픽 | 약한 블룸, 동적 해상도 | PASS | |
| LBM | D3Q19 구현, FP32/MIXED/FP16 비교, 정확도·ms·메모리·안정성 | PASS(비교 완료) | St 0.195(3모드 모두), Cd +43 %(기준 밖 → 채택 안 함), MIXED=FP32 정확도·메모리 절반. VALIDATION "LBM 비교", ARCHITECTURE §5 |
| 산출물 | 고정 카메라 5곳 스크린샷, 수치표, 스냅샷 | PASS | `tests/out/m8/cam1~5.png`, VALIDATION.md, `dist/snapshots/` |
| 모바일 | 폰 화면에서 자동 모바일 모드, 터치 조작, 가벼운 등급 | PARTIAL | 크롬 에뮬레이션(아이폰 390×844, DPR 3, 터치)에서 감지·LITE·레이아웃·오류 없음 확인. 실제 iPhone Safari는 ASSUMED (KNOWN_LIMITATIONS L21) |

## 0.15 정리·UI 개편 (이전 버전 보존: archive/, 태그 v0.14-pre-cleanup)

| 항목 | 상태 | 근거 |
|---|---|---|
| 미사용 기능 삭제(구형 연기·M13·S3 진단·WebGPU S0~S3, LBM은 선택 모듈) | PASS | 엔진 596k→370k 문자, 린트 0건, tools/deps.mjs 의존성 지도 |
| 제어실 모듈(팬·롤링로드·비상정지·흐름·풍속) | 아래 회귀 결과 참조 | tests/regression.mjs |
| 롤링로드를 솔버 풍속으로 구동 | 아래 회귀 결과 참조 | 원본은 정지 상태였음 |
| 새 UI(조작 막대·설정 서랍·모바일 시트) | PARTIAL | 데스크톱·모바일 세로 캡처 확인, 실제 기기 미확인 |
