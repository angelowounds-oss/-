# ARCHITECTURE

## 1. 빌드

```
src/engine/00-core.js ... 90-render-loop.js   이름순 연결 → js/engine.js (하나의 IIFE)
src/ui.js                                       → js/ui.js
assets/*.js (base64 GLB·워커)                   → 인라인
index.html + css/style.css                      → 개발용 (여러 파일)
tools/build.mjs                                 → dist/aether.html (단일 파일, 외부 요청 0)
```

- 명령: `node tools/build.mjs`. 외부 패키지 없음(Node 내장 모듈만). 저장소 접근이 막혀 esbuild를 쓸 수 없어서 선택(QUESTIONS Q2).
- 엔진 파일은 공유 스코프라 **순서가 의미**를 가짐. 번호 접두사로 고정.
- 빌드는 `src=`/`href=`에 원격 주소가 있으면 실패. 런타임 외부 요청 0건은 회귀 테스트가 네트워크 가로채기로 확인.

| 파일 | 내용 |
|---|---|
| 00-core | AETHER 전역 상태, 진단, 기준선 |
| 10-webgpu-s1-s3 | WebGPU 진단 솔버 S1~S3(원본 유지, 실시간 경로 아님) |
| 20-scene-assets | 씬 구성, 관제실 콘솔, GLB 파서, 차량 계약 검사 |
| 30-renderer-lighting | 메인 PBR 셰이더, 그림자, 반사 프로브, M13 시각화 셰이더 |
| 40-gl-walk-door | GL 초기화, 1인칭 보행, 자동문·계단, 차량 로딩 |
| 50-cfd-bridge-m13 | CFD 좌표 계약, M13 과학 시각화 |
| 60-fan-collector-layout | 팬·배기 수집기, 연기 노즐 배치 |
| 70-smoke-particles | 기존 입자·필라멘트 연기(실시간 CFD 꺼졌을 때 대체) |
| 80-body | 사람(이동 고체) 상태·마네킹 |
| 85-live-cfd | 실시간 GPU CFD, 연기 볼륨, 품질 조절, 힘 계산, 벤치마크 |
| 90-render-loop | 프레임 루프 `draw()`, 부팅, UI 연결 |

## 2. 렌더러 선택 (M0 결정)

| 기준 | 자체 WebGL2 렌더러 (현행) | three.js | Babylon.js |
|---|---|---|---|
| 프레임 비용 | 측정 기준선 | 같은 셰이더면 GPU 비용 동일, 씬 그래프 CPU 비용 추가 (ASSUMED) | 동일 + 엔진 오버헤드 큼 (ASSUMED) |
| 번들 크기 | 엔진 0.44 MB(에셋 제외) | 추가 약 0.6~0.7 MB min (공개 수치, ASSUMED) | 추가 수 MB (ASSUMED) |
| 셰이더 제어 | 전부 직접 | ShaderMaterial/onBeforeCompile로 가능, 포스트 체인 별도 | NodeMaterial/ShaderMaterial 가능 |
| 볼류메트릭 | CFD 텍스처를 같은 GL 컨텍스트에서 바로 레이마칭 | 기본 없음, 같은 컨텍스트 공유는 가능하나 상태 관리 충돌 위험 | 기본 없음 |
| CFD 연동 | 아틀라스 텍스처·FBO를 직접 공유 | 렌더러 상태 캐시와 원시 GL 호출 충돌 → `resetState()` 반복 필요 | 동일 문제 |
| 이전 비용 | 0 | 엔진 44만 자·씬/콘솔/문/보행/연기 전면 재작성 | 동일 이상 |
| 이 환경에서 설치 | — | **불가** (npm 403) | **불가** |

**결정: 자체 렌더러 유지.** 최종 품질은 셰이더와 포스트 체인이 결정하고, 두 라이브러리가 기본 제공하지 않는 볼류메트릭·CFD 연동이 핵심이라 이전 이득이 없음. 필요한 기법(HDR·톤매핑·TAA·GTAO·CSM·IBL)은 자체 렌더러에 직접 추가.
검증 상태: 번들·프레임 비용 비교는 **ASSUMED**(라이브러리를 받을 수 없어 실측 불가).

## 3. 프레임 순서 (현행, M5에서 변경 예정)

`liveStep`(CFD) → 그림자 맵 → 불투명(씬, 롤링로드, 팬, 차량, 사람) → 블렌딩(M13 오버레이, 입자 연기, CFD 연기 레이마칭) → 유리. 셰이더 안에서 톤매핑(ACES 근사) 후 sRGB 출력.
