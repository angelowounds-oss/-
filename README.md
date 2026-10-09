# NEON CITY V9 · NIGHTFALL

단일 HTML(`neon_city_v9.html`)로 실행되는 비 내리는 네온 도시 오픈월드 액션.

- 빌드: `cd build && npm i && cd .. && node build/build.mjs` (소스는 `src/`)
- 조작: WASD 이동 · Shift 달리기 · 좌/우클릭 사격/조준 · R 재장전 · F 탑승/하차 · Space 점프/핸드브레이크 · C 카메라 · L 라이트 · Esc 일시정지
- 모바일 터치/게임패드 지원, 품질 4단계 + 자동 저하(`?q=0..3`)
- 물리: Rapier(WASM 내장) 고정 60Hz — 레이캐스트 서스펜션 강체 차량, 정적 도시 콜라이더, 충돌로 밀리는 쓰레기통. 튜닝 테스트: `node build/phys_test.mjs`
- 테스트: `node tests/run.cjs quick` (빌드 후, 상세는 [docs/TESTING.md](docs/TESTING.md))

## 문서 (개발 진행)
- [CLAUDE.md](CLAUDE.md) — 작업 방법, 명령, 규칙 (사람·Claude 공통 시작점)
- [docs/REVIEW-2026-10.md](docs/REVIEW-2026-10.md) — 파트별 비판적 총평, 성숙도·정체/취약 구분
- [docs/ROADMAP.md](docs/ROADMAP.md) — 마일스톤(M0 기반 → M1 실측 → M2 핵심 루프 → M3 폴리시), 작업 방식
- [docs/backlog/](docs/backlog/README.md) — 파트별 티켓(완료 기준·검증 방법)
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 모듈 지도, 프레임 순서, 불변 조건
- [docs/adr/](docs/adr/README.md) — 결정 기록 · [docs/PERF-BASELINE.md](docs/PERF-BASELINE.md) — 성능 기준선

## Credits
- Soldier.glb — three.js examples (Mixamo rig)
- Ferrari 458 — vicent091036, CC-BY 4.0 (https://sketchfab.com/3d-models/ferrari-458-italia-model-5a0f0d6bf8ef43e08d4e6ea1d6f5a8e0 via three.js examples); decompressed and slimmed with gltf-transform (`build/undraco.mjs`, `quant.mjs`, `slim.mjs`)
- Three.js (MIT)

## 건물 내부 / 엘리베이터
- 14개 타워에 정문이 있고 `F`로 입장 (로비 → 엘리베이터 → 오피스/레지던스/스카이 라운지 층).
- 엘리베이터: 문이 열리고 안에서 `F` → 층 선택 UI(숫자키 1~9) → 이동 연출 후 해당 층 도착.
- 상호작용: 접수원 대화, 서버 해킹, 금고 따기, TV, 건물 출입. 경비는 무기를 꺼내면 공격.
- 미션 "데이터 침투": 잠입 → 서버 해킹 → 경보(3성) → 탈출. 건물 안에 숨으면 수배가 풀립니다.


## 확장 (0~6단계)
- 이동: 3D 캐릭터 컨트롤러(계단·경사·차 지붕), 웅크리기, 넘기/오르기(Space), 사다리, 수영(호수), 오토바이·보트·헬기(옥상 헬리패드), 택시 탑승.
- 건물: 도로변 건물 대부분(약 300채)에 물리 문, 로비/상점/오피스/레지던스, 계단, 엘리베이터, 옥상. 바닥 단위로 스트리밍.
- 상호작용: F/G/T 동사 시스템(문 열기·잠그기·따기·걷어차기), 소품 줍기/들기/던지기/차기, 유리 파손, 인벤토리·보관함·트렁크, 상점(구매·판매·흥정)·ATM·식당·옷가게·전당포, 집 구매, 잠자기/앉기.
- 세계: 24시간 낮밤 + 날씨, 시민의 건물 출입, 목격자 기반 신고, 체포/벌금, 대화, 갱단 구역, CCTV, 허기·갈증·피로(옵션).
- 전투: 맨손/근접/암살, 수류탄, 권총·카빈·SMG·샷건·저격, 출혈, 엄폐(저층 장애물 LOS), 폭발로 유리·문·소품 파괴.
- 메타: 휴대폰(지도·GPS·연락처·일자리·은행·카메라 모드·설정), 3개 세이브 슬롯, 모바일 버튼 확장.
- NPC 내비: 건물 바닥별 격자 내비메시(A*)로 시민이 로비→엘리베이터→층→방→복귀를 걷고 승강기를 탑니다. 엎드리기(Z 3단 전환), 버스, 차 문, 배수관 오르기 포함.

- 매달리기(2.5~3.7m 턱에 매달려 W로 올라가기), 차체 변형(충돌 지점 메시 찌그러짐), 방 조명 스위치(꺼면 해당 방 조명 제외).
- 눕기(침대 G), 병원(사망 시 리스폰·응급실 접수·휴대폰 위치 표시), 위협 대화, 항복(Y), 항만(두 번째 수역·보트), 조수석 시점(택시·버스).

## Third-party assets (street dressing)
`assets/props/*.glb` are CC0 models from [Poly Haven](https://polyhaven.com) (fire_hydrant, metal_trash_can, utility_box_01, trashbag, potted_plant_01), decimated with `build/propify.mjs` and baked to 256px WebP textures. They are instanced per city cell by `src/dressing.js`.
`assets/tex/*.jpg` are CC0 Poly Haven `asphalt_04` and `concrete_pavers`, packed by `build/packtex.mjs` (albedo + normal.xy/roughness) and layered into the ground shader.
`assets/env/hansaplatz.rgbe` is the CC0 Poly Haven `hansaplatz` night HDRI (512x256, flat RGBE via `build/hdrpack.mjs`) used for PBR reflections; `?env=0` switches back to the procedural neon environment.

## User-supplied assets
- `assets/res/*.glb`, `assets/res/res_wall.jpg`: "Residential Buildings Set" (Unity package supplied by the project owner), converted with `build/bake_buildings.py` + `build/res_pack.mjs`. They are the exterior skin of the 66 outer-ring towers: `world.js` creates a real lot for each (door facing the city, tiers matching the model height) so `building.js` generates the interior, stairs, elevator and roof as for any other tower, and `src/skyline.js` draws the one-sided model shell per side of the ring. The towers line a paved promenade (`world.promenade`) with boundary walls behind them.
- `assets/props/sniper_mag.glb`: "Sniper_Ammo" glTF (supplied by the project owner), textures reduced to 512px by `build/ammo_pack.mjs`; used as the model of the `mag_sniper` item.
- `assets/props/living_set.glb`: furniture pieces (TV, glass coffee table, piano, pot, rug) from the supplied `InteriorTest.blend` living room, re-textured with Poly Haven wood/marble and flat colours via `build/bake_livingroom.py` + `build/living_pack.mjs`; instanced into every apartment living room by `src/livingset.js`.
- `assets/facade/*.jpg`: "Building Displacement 01/02" facade texture sets (supplied by the project owner), packed by `build/facade_pack.mjs` (color 1024, emissive 512, normal+roughness 512) and sampled as WebGL2 array textures in the facade shader (`src/facade.js`, `createFacadeMaterial` in `src/world.js`).
- `assets/props/street_props.glb`, `street_signs.glb`: the supplied `street_props.blend` (vending machines, garbage container, garbage bags, cardboard boxes, 15 shop signs; textures reduced), baked by `build/bake_street_props.py`. Props are scattered by `src/dressing.js`, signs are mounted on every entrance by `src/signs.js`.

## Added in this round
- `assets/interior/furniture.glb`: 65 CC0 Poly Haven furniture models merged onto one 2048px atlas by `build/interior_pack.mjs`; placed per room type by `src/rooms.js` / `src/furnish.js` (one merged mesh per floor).
- `assets/Soldier.glb` now also carries 32 `U_*` clips retargeted from the CC0 Quaternius *Universal Animation Library (Standard)* by `build/retarget_ual.mjs` (world-space delta retarget, A-pose to T-pose reference; base rig kept in `build/Soldier_base.glb`). Used for death, hit reactions, crouch, swim and punches.
- Controls overlay: press **K** in game. Crouch **Z**, prone **P**, camera/first-person **C**, aim-down-sights with iron sights / red dot / sniper scope on right mouse.

## Living city systems
- **Irregular grid & pedestrian streets** (`src/world.js`): blocks vary from 0.65x to 1.26x the old pitch; six inner road segments are closed into tree-lined pedestrian streets (T-junctions), each with a subway entrance. Traffic, parking, GPS (BFS over open roads) and the minimap respect them.
- **Real citizens** (`src/citizens.js`): 2,000 registered residents with a name, age, job, home (building / floor / room) and workplace. Their position is a pure function of a daily plan (walk to the nearest bus stop or subway entrance, ride, walk), so only people near the player are spawned. Residents are placed in their own rooms (asleep in bed at night) and at their desks when a floor is built, take the real elevator home when the building is live, and can be looked up and tracked from the phone's **주민** tab. Deaths are permanent and leave a memorial.
- **The city remembers** (`src/memory.js`): bullet holes, blast scorches and wrecks persist in the save; witnessed crimes become Korean news headlines (car radio with speech synthesis where available, apartment TV, phone **뉴스** tab); witnesses spread rumours to neighbours and colleagues, and residents who know your face flee and report you.
- **Power grid** (`src/power.js`): one substation per zone. Hack it (F, 4 game hours) or wreck it with gunfire/explosives (8 hours): the zone's windows, signs, street lamps, signals and interior lights go dark, elevators stop, witnesses see less; a repair crew restores power and the news reports it.
- **Long guns** use two-bone IK for both arms (shouldered / low-ready, shotgun pump, sniper bolt, magazine reload); pistols use retargeted UAL upper-body clips; drivers are visible behind tinted car glass.

## Water
`buildWaters` in `src/world.js` is a port of the node setup in the supplied *Water Shader Addon Free 2.1.2* by chuck cg (GPL-2.0-or-later): noise-bump normals, Fresnel (IOR 1.3) sky reflection, teal absorption/emission body, shoreline foam driven by edge proximity, and the add-on's caustic texture (`assets/tex/water_caustic.jpg`, 512 px greyscale of `caustic anim_001.bmp`). The add-on is GPL, so this part of the code and the texture carry the same licence.
- `assets/env/interior_suite.rgbe`: Poly Haven CC0 HDRI *relax_inn_seaview_suite* (supplied as 4K EXR), reduced to 512x256 RGBE with `build/hdrpack.mjs`; it is the environment map used while the player is inside a building.
- `assets/env/day_street.rgbe`: Poly Haven CC0 HDRI *german_town_street* (supplied as 4K HDR) reduced to 512x256 RGBE; it is the daytime environment map outdoors (the night plaza HDRI stays for night).

- 권총 모델: Poly Haven "Service Pistol" (CC0), `assets/props/pistol.glb` (슬라이드 반동 애니메이션 포함).
- 추가 실내 소품(Poly Haven, CC0): 크루아상, 장기보존식품, 와인병, 빈티지 라이터, 조각 코끼리, 사자 머리 — 거실·침실·주방·로비 배치.
- 외곽 언덕 나무: 침엽수(약 70 삼각형) 7,000그루를 12개 섹터 인스턴싱으로 배치, 보행자 수 약 1.5배 증가.
- 물리 랙돌(src/ragdoll.js, 설계 docs/ragdoll-design.md): 사망·폭발·차량 충돌·밀침 시 12조각 관절 몸체로 쓰러지고, 살아 있으면 스스로 일어난다. 품질별 동시 상한 3~10명.
