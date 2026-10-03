# NEON CITY V9 · NIGHTFALL

단일 HTML(`neon_city_v9.html`)로 실행되는 비 내리는 네온 도시 오픈월드 액션.

- 빌드: `cd build && npm i && cd .. && node build/build.mjs` (소스는 `src/`)
- 조작: WASD 이동 · Shift 달리기 · 좌/우클릭 사격/조준 · R 재장전 · F 탑승/하차 · Space 점프/핸드브레이크 · C 카메라 · L 라이트 · Esc 일시정지
- 모바일 터치/게임패드 지원, 품질 4단계 + 자동 저하(`?q=0..3`)
- 물리: Rapier(WASM 내장) 고정 60Hz — 레이캐스트 서스펜션 강체 차량, 정적 도시 콜라이더, 충돌로 밀리는 쓰레기통. 튜닝 테스트: `node build/phys_test.mjs`

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
