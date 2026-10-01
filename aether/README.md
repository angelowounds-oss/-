# AETHER Wind Tunnel

크롬에서 도는 실시간 3D 풍동입니다. GPU CFD(엇갈린 MAC 격자 + LES)로 차량 주변 흐름과 연기를 계산하고, HDR 렌더러로 그립니다.
**정성적 시각화 도구이며 공학 해석 도구가 아닙니다.** 풍동 격자는 8~16 cm라 차량 Cd/Cl은 참고값입니다. 솔버 정확도는 원기둥·구 기준 문제로 따로 검증했습니다(VALIDATION.md).

## 열기

- **`dist/aether.html`** 하나만 크롬에서 열면 됩니다. 서버 불필요, 외부 요청 0건(에셋·셰이더·블루노이즈 전부 내장).
- 개발용은 `index.html`(여러 파일)입니다.
- 차량 모델은 사용자 제공 BMW M4 GT3 GLB입니다. **개인 사용 전용이며 공개 배포하지 않습니다**(QUESTIONS Q1).

### 주소 옵션 (`#` 뒤, `&`로 연결)

| 옵션 | 뜻 |
|---|---|
| (없음) | 시작 약 2.5 s 동안 GPU를 실제로 측정해 등급 선택, 이후 프레임 시간으로 자동 조절 |
| `q=LITE` `LOW` `MID` `HIGH` `ULTRA` | 전체 등급 고정 (LITE = 초저사양·모바일) |
| `sim=` `vol=` `render=` | CFD·연기 볼륨·렌더를 축별로 고정 (값은 등급 이름) |
| `perf=1` | 구간별 GPU ms, p95, 메모리, 조정 기록 표시 |
| `bench=perf` | 5개 고정 시점을 돌며 성능 JSON 생성(복사·저장 버튼) |
| `impl=COLLOCATED` | 이전 솔버(대체 경로)로 실행 |
| `vc=0` | LOW의 와도 보존력 보정 끄기 |
| `tone=ACES` | 톤매핑 AgX(기본) → ACES |
| `fx=0` | HDR 포스트 끄고 순방향 렌더 |
| `color=1` | 연기를 속도 색으로 표시 |
| `mobile=1` / `mobile=0` | 모바일 모드 강제 켜기/끄기 |
| `opt=novao,nocull,nosplit` | 렌더링 최적화(메쉬 VAO·프러스텀 컬링·그림자 정적/동적 분리)를 개별로 끔(문제 확인·비교용) |

내장그래픽 PC는 옵션 없이 열면 됩니다. 측정 결과로 LOW~MID에서 시작하고, 여유가 있으면 올립니다.

### 모바일 모드 (iPhone 등)

터치가 주 입력이고 화면이 폰 크기(짧은 변 820 px 이하)이면 자동으로 모바일 모드로 들어갑니다. 브라우저 문자열은 보지 않습니다. 아래 줄의 **"PC 화면 / 모바일 화면"** 버튼이나 `#mobile=1`, `#mobile=0`으로 직접 바꿀 수 있습니다(선택은 브라우저에 저장).

| 항목 | 모바일 모드 |
|---|---|
| 화면 | 전체 화면, 상단 HUD는 2줄(탭하면 펼침), 아래에 스크롤되는 버튼 줄 2개 |
| 조작 | 드래그: 회전 · 두 손가락: 확대 · 1인칭: 왼쪽 조이스틱 이동 + 오른쪽 화면 드래그 시점 |
| 화질 | **LITE** 등급(격자 80×26×38)에서 시작, 시작 GPU 측정으로 최대 MID까지 올림. 화면 해상도는 기기 배율 최대 1.5배로 제한 |
| 엔지니어 패널 | 아래에서 올라오는 시트. 모든 등급을 직접 고를 수 있음 |
| 지원 | iOS 15 이상(WebGL2). 미지원이면 이유를 화면에 안내 |

**실제 iPhone Safari에서는 확인하지 못했습니다.** 이 환경에서는 크롬으로 아이폰 크기·터치·배율 3을 흉내 낸 검증만 했습니다(`tests/mobile.mjs`).

### 첫 입장 시네마틱 (30초)
입장하기 또는 "시네마틱 재생" → 연기 흐름이 형성될 때까지 첫 구도에서 대기(촬영 시간 소모 없음) → 30초 재생: 0–4 s 앞 사선 낮은 시점 / 4–10 s 차 옆 이동(앞→지붕·측면) / 10–17 s 후방 사선에서 리어 스포일러 / 17–24 s 후류 관찰(거의 정지) / 24–30 s 상승·후퇴하며 풍동 전체. 드래그·휠·터치 또는 "건너뛰기 ›"(Esc)로 즉시 끝나며, 끝난 구도에서 바로 둘러볼 수 있습니다. 카메라는 `src/engine/89b-cinematic.js` 한 곳(`window.__CINE`)에서만 쓰며 검증은 `node tests/cinematic.mjs`.

### 엔지니어 패널 → 화질 · 해상도

화면 아래 **엔지니어 패널** 버튼을 누르면 오른쪽 패널 맨 위에 있습니다. 어느 기기에서든 모든 등급을 고를 수 있고, 측정 추천보다 높으면 경고만 표시합니다. 선택은 이 브라우저에 저장됩니다(주소 옵션이 있으면 주소 옵션이 우선).

| 항목 | 내용 |
|---|---|
| 전체 등급 | 자동(측정) / LOW / MID / HIGH / ULTRA — 아래 세 축을 한 번에 |
| 화면 해상도 | 등급 기본값 또는 50·67·75·85·100·125·150 % (100 % 초과는 슈퍼샘플링) |
| 연기 품질 | 연기 레이마칭 해상도·스텝·광선 그림자 |
| 그래픽 | 그림자·AO·반사(SSR)·기본 해상도 |
| CFD 격자 | 112×36×52 ~ 224×72×100 (바꾸면 흐름을 처음부터 다시 계산) |
| 자동 조절 | 끄면 프레임이 떨어져도 설정을 바꾸지 않음 |

상태 줄에 측정 추천 등급, 현재 격자·연기·화면 배율, 프레임 p95, 최근 자동 조정 기록이 나옵니다.

## 무엇이 계산이고 무엇이 연출인가

| 구분 | 내용 |
|---|---|
| 계산값 | 속도·압력(MAC 투영), 연기 이동, 차량 힘(압력 + 점성), 사람·바퀴·롤링로드·팬의 경계 효과 |
| 근사 | Smagorinsky LES(벽 감쇠 없음), 부분체적 경계(셀보다 작은 형상은 뭉개짐), LOW의 와도 보존력 보정(화면 표기) |
| 연출 | 연기 색·밀도 표현, 연기 감쇠(스텝당 0.15 %, 화면 표기), 카메라 근처 연기 투명화 |

화면 하단에 같은 구분이 상시 표시됩니다.

## 검증 요약

자세한 수치와 근거 파일은 **VALIDATION.md**(결과 JSON에서 자동 생성)에 있습니다.

| 항목 | 기준 | 판정 위치 |
|---|---|---|
| 균일류 보존 | < 0.5 % | VALIDATION.md |
| 투영 후 발산(풍동) | RMS < 1e-3, 최대 < 1e-2 | VALIDATION.md |
| 원기둥 Re=200 St | 0.18~0.22 | VALIDATION.md |
| 원기둥·구 Cd | 문헌 ±20 % | VALIDATION.md |
| 격자 수렴 3단계 | 추이 보고 | VALIDATION.md |
| LBM D3Q19 FP32/FP16/혼합 | 비교 후 채택 결정 | VALIDATION.md, ARCHITECTURE §5 |

요구사항별 PASS/PARTIAL/ASSUMED/BLOCKED 표는 **PROGRESS.md**, 성능 판정은 **PERF.md**, 한계는 **KNOWN_LIMITATIONS.md**에 있습니다.
**성능(fps·ms)은 이 작업 환경에 GPU가 없어 전부 ASSUMED입니다.** 실측 방법은 CHECKPOINT.md.

## 폴더

```
dist/aether.html        최종 단일 파일 (빌드 산출물)
dist/snapshots/         마일스톤별 해시·크기 기록
index.html, css/, js/   개발용 (js/는 빌드 산출물)
src/engine/NN-*.js      엔진 (이름순으로 이어 붙여 하나의 IIFE)
src/ui.js               UI
assets/*.js             차량·팬·콘솔 GLB(base64), 워커, 블루노이즈
tools/build.mjs         빌드 (Node 내장 모듈만 사용)
tools/lint.mjs          빌드 + eslint
tools/validation-report.mjs   VALIDATION.md 생성
tools/snapshot.mjs      마일스톤 스냅샷
tests/                  회귀·성능·솔버 비교·검증·LBM·화면 캡처 (헤드리스 Chromium)
original/               원본 단일 HTML (기준본)
docs/                   작업 지침서
```

## 명령

| 목적 | 명령 |
|---|---|
| 빌드 | `node tools/build.mjs` |
| 린트 | `node tools/lint.mjs` |
| 회귀 테스트 | `node tests/regression.mjs dist/aether.html <이름>` |
| 검증 | `node tests/validate.mjs uniform cyl8 sphere` → `node tools/validation-report.mjs` |
| LBM 비교 | `node tests/lbm.mjs 8 FP32 FP16 MIXED` (`COLL=TRT`로 TRT 충돌) |
| 솔버 비교 | `node tests/solver-compare.mjs` |

테스트는 Playwright + 헤드리스 Chromium(SwiftShader)을 씁니다. 동시에 브라우저 3개 이상 띄우면 페이지가 종료되므로 2개까지만 돌립니다.

## 이전 작업 기록

풍동 내부 연기 미표시·풍속 0.00·사람 효과 미약 수정, collocated 멀티그리드, 초기 원기둥 벤치마크(실패 기록)는 CHANGELOG.md "이전" 항목과 git 이력(`5164a28` 이전)에 있습니다.
