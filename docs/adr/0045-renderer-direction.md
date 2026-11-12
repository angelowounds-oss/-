# ADR-0045 렌더러 방향: WebGLRenderer 유지 vs WebGPURenderer 이전 (EV-40)

상태: 제안 (2026-11-12, EV-40 스파이크). 결정은 사용자 몫이다.

## 배경
- 게임은 three의 `WebGLRenderer`(WebGL2)와 `EffectComposer`로 그린다.
- 지침서(`docs/AAA-DIRECTIVE-2026-11-12.md`)의 Phase 1–2 목표에는 비용이 큰 기능이 있다. 밤 도시의 많은 광원, GPU 컬링·간접 그리기, 군중 수천 명이다.
  - 앞으로 갈 길은 둘이다. WebGL2에서 직접 만들거나, three의 `WebGPURenderer`(노드 재질, TSL)로 옮기는 것이다.
- 옮기는 비용(이 저장소 기준, 2026-11-12 집계):
  - `onBeforeCompile` 셰이더 패치 22곳과 `ShaderMaterial` 14개가 14개 파일에 있다. 청크 치환은 약 60곳, `customProgramCacheKey`는 16곳이다.
  - 노드 재질은 GLSL 청크 치환을 받지 않는다. 그래서 전부 TSL로 다시 써야 한다.
  - 후처리(Bloom, GTAO, SMAA, TRAA, SSR)는 TSL판이 있다. 타일 조명(`TiledLighting`)은 WebGPU 백엔드에서만 된다.

## 스파이크
- `build/lab/renderer-spike.mjs`와 `build/lab/renderer-spike/index.html`로 같은 장면을 세 경로에서 그렸다.
  - 장면: 건물 1,500채, 그림자 해, 반구광. `crowd`는 여기에 인스턴스 4 × 5,000을 더한다. `night`는 점광원 N개를 더한다.
  - 경로:
    - `gl`: `WebGLRenderer`, 지금 쓰는 경로.
    - `gpu-gl`: `WebGPURenderer({ forceWebGL: true })`, WebGL2 대체 경로.
    - `gpu`: `WebGPURenderer`, WebGPU 백엔드.
- 결과는 `tests/results/renderer-spike.json`에 있다. 이 컨테이너는 소프트웨어 GPU(SwiftShader)라 GPU 시간의 절대값은 실기기와 다르다. 비교할 것은 경로 사이의 비율이다.

960 × 540, 90프레임 중앙값. JS는 `render()` 호출 시간, GPU는 타이머 쿼리(SwiftShader)다.

| 장면 | 경로 | 첫 프레임 ms | JS ms (95%) | GPU ms | 드로우콜 |
|---|---|---|---|---|---|
| block | gl | 78 | 7.8 | 195 | 1,321 |
| block | gpu-gl | 296 | 20.0 (32.3) | 208 | 2,690 |
| crowd | gl | 103 | 8.2 | 1,143 | 1,325 |
| crowd | gpu-gl | 371 | 27.5 (42.3) | 1,430 | 2,698 |
| night 8 | gl | 79 | 8.5 | 435 | 1,321 |
| night 8 | gpu-gl | 388 | 25.3 (37.8) | 832 | 2,690 |
| night 32 | gl | 77 | 9.2 | 966 | 1,321 |
| night 32 | gpu-gl | 610 | 19.2 (28.5) | 1,127 | 2,690 |
| night 128 | gl | 102 | 11.3 | 3,022 | 1,321 |
| night 128 | gpu-gl | 2,569 | 25.8 (47.5) | 6,174 | 2,690 |
| 전부 | gpu (WebGPU) | 214–700 | — | — | — |

- `gpu` 행은 모든 장면에서 첫 프레임 뒤 장치를 잃었다("Device was destroyed"). 이 컨테이너의 WebGPU(SwiftShader Vulkan)로는 잴 수 없다.
- `gl`의 95% JS 시간(207–3,103 ms)은 GPU를 기다린 시간이다. 그래서 표에서 뺐다. 소프트웨어 GPU에서는 `render()`가 앞 프레임을 기다린다.
- 드로우콜은 두 렌더러가 세는 방식이 달라(그림자 패스 포함 여부) 직접 비교하지 않는다.

### 읽은 것
1. **WebGL2 대체 경로는 지금보다 느리다.** 같은 장면에서 `gpu-gl`은 프레임당 JS가 2.3–3.3배다(7.8 → 20.0 ms 등). GPU 시간은 1.1–2.0배다. 첫 프레임(셰이더 컴파일)은 3.8–25배다.
   - WebGPU가 없는 기기(구형 iOS·안드로이드, 일부 리눅스)에서는 B로 옮기는 순간 느려진다.
2. **광원 수에 비례하는 비용은 WebGL2 경로의 실제 한계다.** `gl`의 GPU 시간이 광원 8 → 32 → 128에서 435 → 966 → 3,022 ms로 늘었다(전방 셰이딩, 픽셀마다 모든 광원).
   - 밤 도시에 수백 개 광원을 쓰려면 어느 경로든 클러스터·타일 조명이 필요하다.
   - `gpu-gl`도 같은 모양으로 늘었다(832 → 6,174 ms). 타일 조명이 WebGPU 백엔드에서만 되기 때문이다.
3. **WebGPU 백엔드 자체의 이득은 이 컨테이너에서 확인할 수 없다.** 실기기 수치가 있어야 B를 판단할 수 있다.

## 선택지
| | A. WebGL2 유지 + 직접 확장 | B. WebGPURenderer로 이전 | C. 단계 이전 (A 먼저, B는 실기기 수치 뒤) |
|---|---|---|---|
| 셰이더 재작성 | 없음 | 패치 22 + 셰이더 14 전부 TSL로 | B 착수 때 |
| 많은 광원 | 클러스터·타일 조명을 직접 만든다(WebGL2, 텍스처로 광원 목록) | `TiledLighting`(WebGPU 백엔드만) | A로 먼저 |
| GPU 컬링·간접 그리기 | WebGL2에는 간접 그리기가 없다(멀티 드로우 확장 정도) | 컴퓨트 셰이더, 간접 그리기 | B의 이유 |
| 대체 경로 | 해당 없음 | WebGPU 없는 기기는 `forceWebGL`. 스파이크에서는 같은 장면의 JS 시간이 더 길었다 | — |
| 위험 | 기능 상한이 낮다 | 재작성 범위가 크다. three 노드 재질 API가 아직 자주 바뀐다 | 두 번 일할 수 있다 |

## 권고 (초안)
- **C.** Phase 1–2는 WebGL2에서 간다. 밤 광원은 Phase 2의 "EV-40 결과 구현" 몫으로 WebGL2 클러스터 조명을 직접 만든다.
- 이전 여부는 실기기 측정 뒤 다시 정한다. 필요한 것:
  - EV-92 오버레이로 기기 3종의 기준선을 잰다.
  - 스파이크를 실기기 WebGPU에서 다시 돌린다: `node build/lab/renderer-spike.mjs --headed`.
- 다시 정할 조건(하나라도 맞으면 B를 시작한다):
  1. 실기기 WebGPU에서 `gpu` 경로의 GPU 시간이 `gl`보다 30% 이상 짧다(block, crowd).
  2. 군중·도시 밀도 목표가 WebGL2의 CPU 드로우 비용으로는 안 된다. 기준: EV-92 측정에서 렌더 CPU가 8 ms를 넘는다.
- B로 가기로 하면 셰이더는 한 번에 옮기지 않는다. 패치를 기능별(땅, 도로, 물, 하늘, 건물 창, 사람 피부)로 TSL 노드 함수에 옮긴다. 순서는 회귀 테스트(`no-runtime-compile`, `views`)가 있는 것부터다.

## 결과
- 결정 전에는 새 셰이더 패치를 늘리지 않는다. 새 효과는 될 수 있으면 `ShaderMaterial` 한 곳에 모아 옮기기 쉽게 둔다.
- 스파이크 도구는 남긴다. three를 올릴 때마다 다시 돌려 비율 변화를 본다.
