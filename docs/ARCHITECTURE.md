# 아키텍처

three.js r180(WebGL2) + Rapier 0.21(WASM) 기반 단일 페이지 게임. `src/`의 ES 모듈을 esbuild가 하나의 IIFE로 묶고, 에셋(glb/jpg/rgbe)을
base64/data URL로 내장해 `neon_city_v9.html` 한 파일로 만든다(ADR-0001). 서버 없이 파일을 열면 실행된다.

## 1. 모듈 지도

| 층 | 모듈 | 역할 |
|---|---|---|
| 진입 | `main.js` | 엔진·게임 생성, 로딩(프리워밍), 타이틀, rAF 루프(`game.update(dt)`), 치명 오류 화면 |
| 엔진 | `engine.js` | 렌더러·씬·카메라·조명·HDRI·후처리(Render → Bloom → Output+Grade → SMAA), 품질 단계(`QUALITY`), 동적 해상도(`setScale`), 조명 루프 패치 |
| 게임 허브 | `game.js` (+ `actions.js`, `garage.js` 프로토타입 믹스인) | `Game`: 상태, 입력 해석, 플레이어/차량/사람/경찰/미션/HUD 갱신, 카메라, 사격·폭발, 저장, 자동 품질 |
| 월드 | `world.js`, `terrain.js`, `skyline.js`, `facade.js`, `dressing.js`, `signs.js`, `instcull.js`, `shaders.js` | 도시 생성(도로·필지·파사드 인스턴스·가로등·신호등·나무·물), 외곽 지형, 외곽 타워 외피, 거리 소품, 간판, 원경 인스턴스 패킹, 공용 셰이더 유니폼 |
| 건물 | `building.js`, `rooms.js`, `furnish.js`, `livingset.js`, `gfx.js`, `breach.js` | 건물 활성화·층 스트리밍(생성기), 방 배치·가구, 층 지오메트리 Builder(풀 버퍼), 벽 파괴 |
| 물리 | `physics.js`, `character.js`, `vehicle.js`, `craft.js`, `carrider.js`, `ragdoll.js` | Rapier 월드(고정 60 Hz + 보간), 캐릭터 컨트롤러, 차량/비행체, 차 지붕·탈출, 랙돌 |
| 사람 | `human.js`, `ai.js`, `assets.js`, `attachments.js` | 인물(애니메이션·IK·피격), 전투/시민 AI, 캐릭터 모델 로딩, 무기 부착물 |
| 사회 | `society.js`, `citizens.js`, `life.js`, `memory.js`, `power.js`, `military.js`, `fire.js`, `jobs.js`, `needs.js` | 일과·목격·체포, 주민 2,000명, 층별 직원/주민 배치, 탄흔·뉴스·소문, 정전 구역, 군 투입, 일자리, 시계·욕구 |
| 상호작용·UI | `interact.js`, `items.js`, `panels.js`, `phone.js`, `input.js`, `mobility.js`, `sandbox.js`, `template.html` | 동사(F/G/T), 소품·인벤토리, 상점/ATM 패널, 휴대폰, 입력(키보드·마우스·터치·패드), 이동 장비, 샌드박스, HUD 마크업 |
| 기타 | `fx.js`, `audio.js`, `daynight.js`, `nav.js`, `models.js`, `modelinfo.js`, `util.js` | 비·파티클·트레이서·라이트 풀, 합성 오디오, 낮밤·안개, 격자 A*, 차량 모델, 공용 헬퍼 |

모든 시스템은 생성자에서 `Game`(`G`)을 받아 `G.player`, `G.world`, `G.phys` 등에 직접 접근한다(결합도가 높다 — ARC-01).

## 2. 프레임 순서 (`Game.update`)

순서가 정확성의 일부다. 바꿀 때는 아래 의존을 확인한다.

1. `input.read` → `updatePlayer` (이동·사격·상호작용, 지붕 위 탑승 위치 계산 `carRider.before/after`)
2. `updateVehicles` → **`phys.step`(고정 60 Hz, 0~4회)** → 차량 `post`(바디 읽기, 보간된 메시 위치 `rx/rz/rh`) → 랙돌 동기화
3. `carRider.draw()` — 차량이 보간 위치로 그려진 **뒤에** 지붕 위 플레이어를 같은 위치에 그린다
4. `updateHumans` (AI, 애니메이션, 원거리 시민 1/3 빈도) → `updatePolice` → 미션·타이머·시계·욕구·사회·아이템(던진 물건 보간 동기화)
5. `buildings.update` (활성화·층 생성 생성기 3 ms 예산) → 시민·기억·정전·이동 장비·벽 파괴·군·샌드박스
6. `updateCamera` (보간된 차량·지붕 위치를 따라감) → `fxUpdate`
7. `updateHUD` (안에서 `autoQuality`) → `audioUpdate`
8. `renderFrame`: 월드 애니메이션 → 가짜 조명/신호등 → 낮밤(안개 밀도) → **`instCull.update`(안개 밀도·카메라 필요)** → 스킨 컬링 → 원거리 LOD → `eng.render`
9. `workMs` 기록(동적 해상도의 여유 판단)

## 3. 불변 조건 (깨면 회귀)

| 조건 | 이유 | 지키는 테스트 / 결정 |
|---|---|---|
| 플레이 중 새 셰이더 프로그램 0개: 조명 개수·종류는 로딩 때 확정, 모든 재질·텍스처는 `prewarmShaders`에서 컴파일·업로드 | 컴파일 한 번이 50~500 ms 정지 | `no-runtime-compile`, ADR-0002 |
| 물리는 고정 스텝, 화면은 `Physics.alpha` 보간. 게임 로직은 시뮬레이션 위치(`v.x`), 화면·카메라는 그려진 위치(`v.rx`) | 120/144 Hz 끊김 | `physics-interp`, ADR-0003 |
| 층 생성은 생성기 단계, 한 단계 8 ms 미만. 무거운 단일 호출(인물 생성, 가구 병합)은 자기 단계를 가진다 | 이동 중 끊김 | `floor-population`, ADR-0004 |
| 컬링·인스턴스 패킹·조명 루프 패치는 픽셀 동일 | 화질 손실 없는 최적화 | `cull-identity`, `pack-identity`, `light-skip-identity`, ADR-0005 |
| 층 지오메트리 버퍼는 풀에서 빌리고 `dispose` 때 한 번만 반납. 버린 층의 지오메트리를 다시 그리지 않는다 | 버퍼 재사용 충돌 = 형상 깨짐 | `pool-integrity`, `builder-bitexact`, ADR-0006 |
| 출입구 유리는 로비 층이 있을 때만 열린다 | 건물 1층 구멍 | `entrance-holes` |

## 4. 데이터·상태
- 저장: `localStorage['neon_city_v9_<slot>']` = `{cash, mission, kills, world: G.state}`. `G.state`에 각 시스템이 자기 영역을 쓴다(기억, 주민 사망, 정전, 아이템 위치, 시계, 설정 일부). 스키마 버전 없음 → SAV-01.
- 결정성: 도시·건물 계획·층 내용은 seed(mulberry32) 기반. 일부 장식은 `Math.random`(층 재생성 시 달라질 수 있음).

## 5. 확장 지점 (어디에 무엇을 넣는가)
- 새 실내 소품: `build/interior_pack.mjs`로 아틀라스에 추가 → `rooms.js`/`building.js`의 배치(`D.put`). 층당 병합 메시 1개 유지.
- 새 상호작용: `interact.js`에 등록되는 객체(동사 목록). 
- 새 셰이더/재질: 로딩 프리워밍에 포함되는지 `no-runtime-compile`로 확인.
- 새 인스턴스 메시(정적): 만든 곳에서 `instCull.add(mesh)` — 인덱스로 나중에 갱신하는 메시는 넣지 않거나 `userData.packed.setColor` 경로를 쓴다.
- 새 플레이 시스템: `Game` 생성자에서 만들고 `update`의 위 순서 중 의존에 맞는 곳에서 갱신(ARC-01 이후에는 스케줄 배열에 등록).
