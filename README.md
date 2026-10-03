# NEON CITY V9 · NIGHTFALL

단일 HTML(`neon_city_v9.html`)로 실행되는 비 내리는 네온 도시 오픈월드 액션.

- 빌드: `cd build && npm i && cd .. && node build/build.mjs` (소스는 `src/`)
- 조작: WASD 이동 · Shift 달리기 · 좌/우클릭 사격/조준 · R 재장전 · F 탑승/하차 · Space 점프/핸드브레이크 · C 카메라 · L 라이트 · Esc 일시정지
- 모바일 터치/게임패드 지원, 품질 4단계 + 자동 저하(`?q=0..3`)

## Credits
- Soldier.glb — three.js examples (Mixamo rig)
- Ferrari 458 — vicent091036, CC-BY 4.0 (https://sketchfab.com/3d-models/ferrari-458-italia-model-5a0f0d6bf8ef43e08d4e6ea1d6f5a8e0 via three.js examples); decompressed and slimmed with gltf-transform (`build/undraco.mjs`, `quant.mjs`, `slim.mjs`)
- Three.js (MIT)
