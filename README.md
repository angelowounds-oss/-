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
