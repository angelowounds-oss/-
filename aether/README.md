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
| `q=LOW` `MID` `HIGH` `ULTRA` | 전체 등급 고정 |
| `sim=` `vol=` `render=` | CFD·연기 볼륨·렌더를 축별로 고정 (값은 등급 이름) |
| `perf=1` | 구간별 GPU ms, p95, 메모리, 조정 기록 표시 |
| `bench=perf` | 5개 고정 시점을 돌며 성능 JSON 생성(복사·저장 버튼) |
| `impl=COLLOCATED` | 이전 솔버(대체 경로)로 실행 |
| `vc=0` | LOW의 와도 보존력 보정 끄기 |
| `tone=ACES` | 톤매핑 AgX(기본) → ACES |
| `fx=0` | HDR 포스트 끄고 순방향 렌더 |
| `color=1` | 연기를 속도 색으로 표시 |

내장그래픽 PC는 옵션 없이 열면 됩니다. 측정 결과로 LOW~MID에서 시작하고, 여유가 있으면 올립니다.

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
