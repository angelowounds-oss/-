# 에셋 출처와 라이선스 (BLD-04에서 전체 정리 중 — 지금은 새로 추가한 것부터 기록)

새 에셋은 `build/assets/manifest.json`에 먼저 올린다(ADR-0028). 아래 "목록 (자동 생성)" 표는 `node build/assets/fetch.mjs --docs`가 만들고, 빌드는 목록 밖 파일·해시 변경·허용 밖 라이선스·빠진 크레딧이 있으면 멈춘다. 위 표는 사람용 설명(가공 방법, 주의)으로 남긴다.

| 에셋 | 파일 | 출처 | 라이선스 | 표기 |
|---|---|---|---|---|
| Anton (로딩 화면 제목·숫자) | `assets/fonts/Anton-400.woff2` (라틴 부분) | Google Fonts (Vernon Adams) | SIL Open Font License 1.1 | 로딩 화면 하단 크레딧에 표기 |
| 대한민국 행정구역 경계 (2013, 단순화) | `assets/korea/provinces_2013_simple.geojson`, 파생: `assets/korea/land.bin` (`build/korea_mask.mjs`) | southkorea/southkorea-maps (GitHub), 원자료 KOSTAT(통계청) 센서스용 행정구역경계 2013 | KOSTAT: "Free to share or remix" (저장소 README) | 표기: 통계청 원자료 출처 명시 |
| 한반도 표고 (Terrarium 타일, z=10 샘플) | `assets/korea/dem.bin`, `src/koreadem.js` (생성: `build/korea_dem.py`, 타일은 `build/.dem-tiles/`에 캐시하고 커밋하지 않음) | AWS Open Data `elevation-tiles-prod` (Terrarium 인코딩). 원자료 SRTM·USGS NED·GMTED2010·ETOPO1 등 미국 정부 공개 자료(퍼블릭 도메인). 출처 표기를 권장 |
| 월드 컴파일러 표고 (Terrarium 타일 z=11, ADR-0019) | `build/world/dem.mjs`가 받아 `build/.dem-cache/`에 캐시(커밋 안 함). 컴파일 결과만 빌드에 들어간다 | SRTM·GEBCO 등 공개 자료(AWS Open Data, 타일 출처 표기). 게임 크레딧의 Terrarium·SRTM 항목에 포함 |
| 미리보기 참고 지도 (OpenStreetMap 표준 타일) | `build/world/compile.mjs --preview`가 비교 그림에만 사용, `build/.dem-cache/osm/`에 소량 캐시. 게임·빌드에는 들어가지 않는다 | © OpenStreetMap contributors (ODbL). 타일 사용 정책에 따라 소량·캐시·식별 가능한 User-Agent |
| 월드 컴파일러 물 자료 (OSM 해안선·수면 면·강 중심선, ADR-0019) | `build/world/osm.mjs`가 지역 단위로 받아 `build/.osm-cache/world/`에 캐시(커밋 안 함). 컴파일 결과(수면·높이)만 빌드에 들어간다 | © OpenStreetMap contributors, **ODbL 1.0**(2026-10-19 승인 범위). 게임 크레딧의 OSM 항목에 포함 |
| 월드 컴파일러 정착지 자료 (OSM place 노드: 시·읍·면·리 이름과 위치, ADR-0021) | `build/world/places.mjs`가 `build/.osm-cache/world/`에 캐시(커밋 안 함). 이름·종류·인구·위치만 컴파일 결과(`region.places`)에 들어간다 | © OpenStreetMap contributors, **ODbL 1.0**(위 물 자료와 같은 승인 범위). 게임 크레딧의 OSM 항목에 포함 |
| 한국 고속도로 파생 데이터 `src/korearoads.js` (D1, 고속도로만; 국도는 D3에서 추가) | `build/korea_roads_convert.mjs`로 OSM 원자료에서 변환: 남한 육지 중심선 18,433개(고속도로 5,413 km, 국도 5,774 km 등 실거리 합 약 11,160 km). 상하행 쌍 합침 120 m, 단순화 160 m | © OpenStreetMap contributors, **ODbL 1.0**. 2026-10-19 사용자 승인으로 내장. 게임 안 크레딧에 표기, 파생 데이터는 같은 조건으로 공개 |
| 전국 도시·읍면 목록 `src/koreaplaces.js` (C 계열, 도시 84곳·읍면 1,379곳) | `build/korea_places_fetch.py`(Overpass `place=city/town`)로 받아 `build/korea_places_convert.mjs`로 변환. 남한 육지 밖과 2 km 안 중복 제거. 좌표·인구 값은 OSM 기준이며 인구는 비어 있는 곳이 많음 | © OpenStreetMap contributors, **ODbL 1.0**. 게임 안 크레딧 표기 대상 |
| 시골 도로 계획 `src/countryplan.js` (A2b) | `build/roads_pack.mjs`가 세계 설계에서 계산해 `assets/roads/country.bin`과 함께 쓰는 생성물. 외부 데이터 없음(OSM 아님). `src/roadgrade.js`가 읽어 지형을 도로에 맞춘다 | 자체 생성물, 라이선스 의무 없음 |
| 한국 도로망 (고속도로·국도, 미반영) | 저장소에 넣지 않음. `build/korea_roads_fetch.py`가 `build/.osm-cache/`에 받음 | OpenStreetMap contributors, Overpass 미러(maps.mail.ru). **ODbL**: 파생 데이터에 출처 표기와 같은 조건 공유 의무가 있다. 2026-10-19 사용자 승인: 파생 도로 데이터를 내장한다. 게임 안 크레딧에 "© OpenStreetMap contributors (ODbL)"를 표기하고, 파생 도로 자산(`assets/roads/…`)은 같은 조건으로 공개한다 |
| Space Mono 400/700 (로딩 화면 보조 글자) | `assets/fonts/SpaceMono-{400,700}.woff2` (라틴 부분) | Google Fonts (Colophon Foundry) | SIL Open Font License 1.1 | 위와 같음 |
| 플레이어 캐릭터 (rig·메시·178 클립) | `assets/Character.glb` (원본, 보관), `assets/character_game.glb` (게임 사용분 33 클립, `build/prune_character.mjs`로 생성) | 사용자 제공 파일 | 사용자 확인 완료: 표기 의무 없음(CC0 계열) | 표기 불필요. 크레딧 줄에는 올리지 않는다 |
| 주인공 몸 (여성 캐릭터) | `assets/player_female.glb` (`build/fit_female.mjs`가 사용자 제공 OBJ에서 생성; 원본은 보관하지 않음) | 사용자 제공(여성 캐릭터 3D 모델 zip, Tripo 변환 OBJ) | **라이선스 미확인**: 생성 도구 이용약관·상업 이용 가능 여부를 사용자가 확인해야 함 | 표기 여부 미정 |
| 주거 건물 3종 (5·6·8층 아파트) | `assets/blocks/blocks.bin` (기하, `build/blocks_pack.mjs`로 OBJ 001~003에서 생성), `assets/blocks/ao.jpg` (AO 아틀라스 1024px) | 사용자가 제공한 "Residential Buildings Set" (Blender 2.78 OBJ 10종 + 텍스처, 2017). 마을의 아파트로 사용(`src/blocks.js`, `src/village.js`) | **미확인 — 제공자에게 출처·라이선스를 받아 이 칸을 채울 것** | 확인 전까지 외부 배포 금지 |
| 도시 랜드마크 타워 (Manhattan 14종 + Camellia 9종의 모양) | `assets/landmarks/landmarks.bin` (`build/landmarks_pack.mjs`), `src/landmarkdims.js` | 사용자가 제공한 "83-manhattan" (FBX/Blender, 2021)과 "40-camellia-city" (SketchUp OBJ, 2018). 모양만 쓰고 창 무늬는 게임이 직접 그린다(`src/landmarks.js`) | **미확인 — 제공자에게 출처·라이선스를 받을 것** (실존 건물을 본뜬 모델일 수 있음) | 확인 전까지 외부 배포 금지 |
| 저격 소총 KSR-29 (소총+스코프) | `assets/props/sniper_rifle.glb` (`build/sniper_pack.mjs`: 4096→1024 px webp, 350 KB) | 사용자가 제공한 "sniper_rifle / sniper_scope" glTF (2020, 같은 세트의 `Sniper_Ammo`는 이미 `sniper_mag.glb`로 사용 중) | **미확인 — 제공자에게 출처·라이선스를 받을 것** | 확인 전까지 외부 배포 금지 |
| Soldier (이전 캐릭터, 보관만) | `assets/Soldier.glb` | three.js examples | 이번 교체 전 사용, 현재 번들에 포함하지 않음 | 교체 전 크레딧 문구 참고 |

- 캐릭터: 게임은 `character_game.glb`를 쓴다. `Character.glb`는 원본 보관용이며 bone 이름과 프레임은 `src/assets.js`의 `adaptCharacter`가 게임 규약(Mixamo 이름, Soldier 기준 rest 프레임)으로 맞춘다.
- 글꼴은 `build/build.mjs`가 base64로 템플릿에 넣는다(단일 HTML, 오프라인에서도 같은 모양). 한글은 글꼴을 넣지 않고 시스템 글꼴(`Noto Sans KR`/`Malgun Gothic`/`Apple SD Gothic Neo`)을 쓴다.
- 로딩 화면 디자인 원본: 사용자가 준 `Purge Day — 로딩` 목업(1280×720 아트보드). 값(색·크기·간격)은 목업 그대로, 구현은 `src/template.html` + `src/loading.js`.
- 주거 건물: 원본 OBJ 10종(001~010)에서 001~003만 쓴다. 텍스처 `Hotel_Hous_AO.png`는 색이 아니라 AO(그림자) 맵이라 벽 색은 마을 팔레트의 정점 색으로 곱한다. 유리 패널은 창 단위로 켜짐/꺼짐을 정한다. `Camellia City`, `Manhattan`, 저격 탄창(`Sniper_Ammo`)은 아직 적용하지 않았다(저격 탄창은 `assets/props/sniper_mag.glb`로 이미 사용 중).

## 목록 (자동 생성)

<!-- AUTO:manifest (build/assets/fetch.mjs --docs) -->
| 에셋 | 파일 | 출처 · 작가 | 라이선스 | 상태 |
|---|---|---|---|---|
| Anton font (Latin subset) | `assets/fonts/Anton-400.woff2` | [Google Fonts](https://fonts.google.com/specimen/Anton) · Vernon Adams | OFL-1.1 | 크레딧: Fonts: Anton, Space Mono (SIL OFL) |
| Space Mono 400/700 (Latin subset) | `assets/fonts/SpaceMono-400.woff2`, `assets/fonts/SpaceMono-700.woff2` | [Google Fonts](https://fonts.google.com/specimen/Space+Mono) · Colophon Foundry | OFL-1.1 | 크레딧: Fonts: Anton, Space Mono (SIL OFL) |
| Korea provinces 2013 (simplified) and land mask | `assets/korea/provinces_2013_simple.geojson`, `assets/korea/land.bin` | [southkorea/southkorea-maps, KOSTAT 2013](https://github.com/southkorea/southkorea-maps) · KOSTAT | KOSTAT-free | 크레딧: Boundaries: KOSTAT |
| Korea elevation sample (Terrarium z10) | `assets/korea/dem.bin` | [AWS Open Data elevation-tiles-prod (SRTM, GMTED, ETOPO1)](https://registry.opendata.aws/terrain-tiles/) · USGS/NASA SRTM et al. | PD | 크레딧: Elevation: Terrarium tiles (SRTM, AWS Open Data) |
| OpenStreetMap derived roads, places, water (compiled into the build) | (빌드에 포함되는 파생 데이터) | [OpenStreetMap](https://www.openstreetmap.org/copyright) · OpenStreetMap contributors | ODbL-1.0 | 크레딧: Map data © OpenStreetMap contributors (ODbL) |
| Country road plan (generated) | `assets/roads/country.bin` | generated by build/roads_pack.mjs | own | 표기 불필요 |
| Player/NPC rig, mesh and clips | `assets/Character.glb`, `assets/character_game.glb` | user-supplied | CC0-1.0 | 표기 불필요 |
| Female protagonist body | `assets/player_female.glb` | user-supplied (Tripo conversion) | USER-PERMITTED | 표기 불필요 |
| Soldier (archived, not bundled) | `assets/Soldier.glb` | [three.js examples](https://github.com/mrdoob/three.js/tree/dev/examples/models/gltf) | MIT | 표기 불필요 |
| Ferrari 458 | `assets/ferrari.glb` | Sketchfab · vicent091036 | CC-BY-4.0 | 크레딧: Models: Ferrari 458 by vicent091036, CC-BY 4.0 |
| Poly Haven fire_hydrant | `assets/props/fire_hydrant.glb` | [Poly Haven](https://polyhaven.com/a/fire_hydrant) | CC0-1.0 | 표기 불필요 |
| Poly Haven metal_trash_can | `assets/props/metal_trash_can.glb` | [Poly Haven](https://polyhaven.com/a/metal_trash_can) | CC0-1.0 | 표기 불필요 |
| Poly Haven potted_plant_01 | `assets/props/potted_plant_01.glb` | [Poly Haven](https://polyhaven.com/a/potted_plant_01) | CC0-1.0 | 표기 불필요 |
| Poly Haven trashbag | `assets/props/trashbag.glb` | [Poly Haven](https://polyhaven.com/a/trashbag) | CC0-1.0 | 표기 불필요 |
| Poly Haven utility_box_01 | `assets/props/utility_box_01.glb` | [Poly Haven](https://polyhaven.com/a/utility_box_01) | CC0-1.0 | 표기 불필요 |
| Poly Haven Service Pistol | `assets/props/pistol.glb` | Poly Haven | CC0-1.0 | 표기 불필요 |
| Poly Haven furniture atlas (interiors) | `assets/interior/furniture.glb`, `assets/interior/defs.json` | [Poly Haven](https://polyhaven.com/models) | CC0-1.0 | 표기 불필요 |
| HDRIs hansaplatz, day street, interior suite (512x256 RGBE) | `assets/env/hansaplatz.rgbe`, `assets/env/day_street.rgbe`, `assets/env/interior_suite.rgbe` | [Poly Haven](https://polyhaven.com/hdris) | CC0-1.0 | 표기 불필요 |
| Poly Haven asphalt_04, concrete_pavers (512 px) | `assets/tex/asphalt_04_a.jpg`, `assets/tex/asphalt_04_n.jpg`, `assets/tex/concrete_pavers_a.jpg`, `assets/tex/concrete_pavers_n.jpg` | [Poly Haven](https://polyhaven.com/a/asphalt_04) | CC0-1.0 | 표기 불필요 |
| Water caustics texture | `assets/tex/water_caustic.jpg` | user-supplied "Water Shader Addon Free" (chuck cg) | GPL-2.0-or-later | **교체 예정** Q0-4 replaces the shader and this texture |
| Building facade texture sets (4) | `assets/facade/facade_color.jpg`, `assets/facade/facade_emis.jpg`, `assets/facade/facade_nr.jpg` | user-supplied | USER-PERMITTED | 표기 불필요 |
| Residential Buildings Set (Unity FBX/OBJ) | `assets/res/res_01.glb`, `assets/res/res_02.glb`, `assets/res/res_03.glb`, `assets/res/res_04.glb`, `assets/res/res_05.glb`, `assets/res/res_06.glb`, `assets/res/res_07.glb`, `assets/res/res_08.glb`, `assets/res/res_09.glb`, `assets/res/res_10.glb`, `assets/res/res_wall.jpg`, `assets/blocks/blocks.bin`, `assets/blocks/ao.jpg` | user-supplied | USER-PERMITTED | 표기 불필요 |
| Manhattan / Camellia City tower shapes | `assets/landmarks/landmarks.bin` | user-supplied | USER-PERMITTED | 표기 불필요 |
| KSR-29 sniper rifle, scope and magazine | `assets/props/sniper_rifle.glb`, `assets/props/sniper_mag.glb` | user-supplied glTF (2020) | USER-PERMITTED | 표기 불필요 |
| Street props and shop signs (street_props.blend) | `assets/props/street_props.glb`, `assets/props/street_signs.glb` | user-supplied | USER-PERMITTED | 표기 불필요 |
| Living room set (InteriorTest.blend) | `assets/props/living_set.glb` | user-supplied, Poly Haven textures | USER-PERMITTED | 표기 불필요 |
| three.js | (빌드에 포함되는 파생 데이터) | [npm three](https://threejs.org) · three.js authors | MIT | 크레딧: Three.js (MIT) |
| Rapier physics (WASM) | (빌드에 포함되는 파생 데이터) | [npm @dimforge/rapier3d-compat](https://rapier.rs) · Dimforge | Apache-2.0 | 표기 불필요 |
| Poly Haven asphalt_04, concrete_pavers (2K, high-detail pack) | (빌드에 포함되는 파생 데이터) | [Poly Haven](https://polyhaven.com/a/asphalt_04) | CC0-1.0 | 표기 불필요 |
| Basis Universal transcoder (in the high-detail pack) and encoder (build tool) | (빌드에 포함되는 파생 데이터) | [three.js examples/jsm/libs/basis, npm basisu](https://github.com/BinomialLLC/basis_universal) · Binomial LLC | Apache-2.0 | 표기 불필요 |
<!-- /AUTO:manifest -->
