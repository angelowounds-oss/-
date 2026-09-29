# PROGRESS

상태 정의: **PASS** 실제 검증으로 기준 충족 · **PARTIAL** 구현됐으나 일부 기준 미달 · **ASSUMED** 직접 검증 불가, 근거 있는 가정 · **BLOCKED** 이 환경에서 구현 불가 · **TODO** 아직 안 함.
검증 환경: 헤드리스 Chromium 1194 + SwiftShader(ANGLE/Vulkan CPU). 성능 수치는 이 환경에서 절대 주장하지 않음.

## 마일스톤

| M | 내용 | 상태 | 증거 |
|---|---|---|---|
| M0 | 구조 분리·빌드·렌더러 결정·회귀 기준선 | 완료 | `tests/out/m0/`, `dist/snapshots/M0.json`, ARCHITECTURE §2 |
| M1 | 계측 HUD·#bench·JSON | TODO | |
| M2 | 적응 품질·동적 해상도 | TODO | |
| M3A | MAC 격자 | TODO | |
| M3B | 압력 멀티그리드 비교 | TODO | |
| M3C | 부분체적 경계 | TODO | |
| M3D | 이동 고체 | TODO | |
| M4 | LES·힘·검증 | TODO | |
| M5 | 볼류메트릭·TAA·톤매핑 | TODO | |
| M6 | 그림자·AO·IBL·재질 | TODO | |
| M7 | LBM 비교 | TODO | |
| M8 | 에셋·최종 빌드 | TODO | |

## 요구사항 상태표

| 영역 | 요구사항 | 상태 | 근거 |
|---|---|---|---|
| 빌드 | 단일 self-contained `dist/aether.html` | PASS | M0 회귀: 부팅·외부 요청 0건 |
| 빌드 | src 모듈화 + 빌드 스크립트 | PASS | `src/engine/*`, `tools/build.mjs` |
| 빌드 | esbuild 사용 | BLOCKED | npm 403 → Node 내장 빌드로 대체 |
| 검사 | JS eslint | PASS | `eslint.config.mjs`, no-undef 0건 |
| 검사 | 셰이더 glslangValidator | BLOCKED | 설치 불가. 대체: ANGLE 실제 컴파일(회귀 테스트, 실패 0) |
| 보존 | 기존 기능 회귀 없음 | PASS(M0 기준) | `tests/out/m0/regression.md` |
| 에셋 | 공개 빌드는 라이선스 명확한 차량 | 사용자 결정으로 해당 없음 | 개인 사용 빌드(QUESTIONS Q1) |
| 렌더러 | 자체 vs three.js vs Babylon 비교 | ASSUMED | 설치 불가로 문서 비교 |
