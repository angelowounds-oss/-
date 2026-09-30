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
| 84-perf-quality | 계측(GPU timer·프레임 통계·할당량), 시작 벤치마크, 품질표 QUALITY, 적응 제어기, `#bench=perf` |
| 85-live-cfd | 실시간 CFD 관리자(LIVE): 등급·방출기·볼륨·힘·API. collocated 솔버(대체 경로) 포함 |
| 86-mac-cfd | **기본 솔버**: 엇갈린 MAC 격자, 부분체적 경계, MacCormack, Smagorinsky LES, RBGS-MG/GMG/MGPCG, 2배 연기 격자, 검증 API |
| 87-lbm | D3Q19 TRT 격자 볼츠만(비교용, 검증 하네스 전용) |
| 88-post-fx | HDR 포스트: GTAO, 볼류메트릭, 합성+SSR, TAA, 블룸, AgX/ACES, FXAA, 업스케일 |
| 89-lighting-hq | GGX 사전필터 큐브맵, SH9 조도, CSM+PCF/PCSS, 클리어코트, 유리 프레넬 |
| 90-render-loop | 프레임 루프 `draw()`, 부팅, 카메라 프리셋, UI 연결 |

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

## 3. 프레임 순서

```
liveStep            CFD 서브스텝(MAC) → 볼륨 텍스처 복사(2배 격자) → 힘 비동기 읽기(PBO+fence)
renderLightingShadow / hqCsm   단일 그림자(LOW) 또는 3단 CSM(MID+)
fxBegin             HDR 타깃 바인드(RGBA16F 색 + RGBA16F 간접광·거칠기 + 깊이 텍스처), TAA 지터
불투명 씬           메인 PBR 셰이더(선형 HDR 출력, MRT)
fxAfterOpaque       GTAO(1/2) → 볼류메트릭(1/4~1/2, 장면 깊이로 가림) → 시간 재투영 → 합성(AO·SSR·깊이 인지 업샘플)
유리                합성 타깃에 프레넬 유리
fxPost              TAA → 블룸 → AgX 톤매핑 → LDR 타깃
오버레이            M13 선/입자(LDR, 장면 깊이 테스트)
fxPresent           FXAA(LOW) → 캔버스로 업스케일+CAS 샤프닝
```

`#fx=0`이면 기존 순방향 경로(셰이더 내 톤매핑)로 동작하며, 포스트 초기화 실패 시 자동으로 그 경로를 씁니다.

## 4. CFD 이산화 (86-mac-cfd)

| 항목 | 내용 |
|---|---|
| 격자 | 엇갈린 MAC. 속도는 셀 면(−x/−y/−z 면), 압력은 셀 중심. 아틀라스 2D 텍스처에 z 슬라이스 타일링 |
| 경계 | 입구 균일류 U, 출구 p=0(디리클레)+예측속도 0기울기, 바닥은 롤링로드 구간만 이동벽(U), 나머지 벽 slip |
| 고체 | 셀 고체 비율 φ(차량 2×2×2 슈퍼샘플, 팬 구동영역 φ=1, 사람 해석적). 면 개방률 θ=1−(φa+φb)/2. 고체 속도: 팬 U, 사람 보행속도, 바퀴 ω×r(ω=U/R) |
| 연산자 | 컷셀 발산 Σ±[θu+(1−θ)us]/h, θ 가중 라플라시안. 둘이 호환되어 정확히 풀면 이산 발산이 0 |
| 이류 | MacCormack(전·후진 반라그랑주, RK2 역추적) + 이웃 8점 최소/최대 제한자 |
| 확산 | 분자점성 + Smagorinsky(Cs=0.16) 명시적, 안정 한계로 ν 상한 |
| 압력 | RBGS-MG(기본, V-cycle, 적-흑 SOR 평활) / GMG(가중 야코비) / MGPCG(적-흑 V-cycle 전처리) / Jacobi |
| 힘 | φ 램프를 가로지르는 압력 도약 적분 + 벽 전단(ν_eff) |
| 연기 | 수동 스칼라, 속도 격자의 2배 해상도, MacCormack+제한자, 레이크/완드 방출원 |
| 대체 | 초기화 실패 또는 발산 감지 시 RBGS → collocated 솔버 순으로 자동 전환, HUD에 표시 |
