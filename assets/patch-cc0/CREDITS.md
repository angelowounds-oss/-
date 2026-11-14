# patch-cc0 — CC0 에셋 묶음 (2026-11-14)

도시 거리(차량·보행자·건물·가로등·노면·소리)를 채우는 CC0 에셋 10종이다. 원본 `assets/` 를
덮어쓰지 않도록 전용 폴더에 두었고, 아직 어느 모듈도 이 폴더를 import 하지 않는다(연결은
클로드 코드가 한다). 라이선스 전문은 `LICENSES/CC0-1.0.txt`.

## 폴더 구조

| 경로 | 내용 |
|---|---|
| `models/` | `carTaxi.glb`, `carPolice.glb`, `buildingA.glb`, `streetlight.glb`, `characterHuman.glb` (모두 glTF 2.0 바이너리, 텍스처 내장) |
| `tex/clean_asphalt/` | `clean_asphalt_{baseColor,normal,roughness,ao,arm,displacement}.jpg` (1024×1024 JPG) |
| `tex/paving_stones/` | `PavingStones003_1K-JPG_{Color,NormalGL,NormalDX,Roughness,Displacement}.jpg` (1024×1024 JPG) |
| `audio/` | `footstepOnConcrete1Short.ogg` (Opus/Vorbis, 약 0.10초), `carEngineLoop.wav` (모노 44.1 kHz 16-bit, 0.86초), `policeSiren.mp3` (모노 44.1 kHz 128 kbps CBR, 약 41초) |

## 모델 (KayKit City Builder Bits · Kay Lousberg)

세 가지 모두 같은 파일 하나를 고친 것이다 — GLB 재포장, 피벗을 바닥 중앙으로, 파일 안에 크레딧
추가, 실물 크기로 ×4.8 확대(자기 세단 0.94 단위 = 실제 약 4.5 m 로 맞춤). 원문 크레딧은 각 GLB 의
`asset.copyright` 와 `asset.extras.license` 에 그대로 들어 있다.

- "Car taxi" by Kay Lousberg (KayKit, https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0/blob/63976910ca04d16f0fc531b9c614244be8128713/addons/kaykit_city_builder_bits/Assets/gltf/car_taxi.gltf), licensed CC0 1.0 Universal (https://creativecommons.org/publicdomain/zero/1.0/). Changed by Patch: re-packed GLB, pivot moved to the bottom centre, credit added to the file, scaled ×4.8 to real-world size.
- "Car police" by Kay Lousberg (KayKit, https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0/blob/63976910ca04d16f0fc531b9c614244be8128713/addons/kaykit_city_builder_bits/Assets/gltf/car_police.gltf), licensed CC0 1.0 Universal (https://creativecommons.org/publicdomain/zero/1.0/). Changed by Patch: re-packed GLB, pivot moved to the bottom centre, credit added to the file, scaled ×4.8 to real-world size.
- "Building A" by Kay Lousberg (KayKit, https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0/blob/63976910ca04d16f0fc531b9c614244be8128713/addons/kaykit_city_builder_bits/Assets/gltf/building_A.gltf), licensed CC0 1.0 Universal (https://creativecommons.org/publicdomain/zero/1.0/). Changed by Patch: re-packed GLB, pivot moved to the bottom centre, credit added to the file, scaled ×4.8 to real-world size.
- "Streetlight" by Kay Lousberg (KayKit, https://github.com/KayKit-Game-Assets/KayKit-City-Builder-Bits-1.0/blob/63976910ca04d16f0fc531b9c614244be8128713/addons/kaykit_city_builder_bits/Assets/gltf/streetlight.gltf), licensed CC0 1.0 Universal (https://creativecommons.org/publicdomain/zero/1.0/). Changed by Patch: re-packed GLB, pivot moved to the bottom centre, credit added to the file, scaled ×4.8 to real-world size.

## 캐릭터 (Kenney · mini-dungeon)

- "Character human" by Kenney (Kenney, https://kenney.nl/assets/mini-dungeon), licensed CC0 1.0 Universal (https://creativecommons.org/publicdomain/zero/1.0/). Changed by Patch: re-packed GLB, pivot moved to the bottom centre, credit added to the file, textures embedded, scaled ×2.4 to real-world size (캐릭터 키 약 1.81 m).
- 리깅: 조인트 7개(`root`, `leg-left`, `leg-right`, `torso`, `arm-left`, `arm-right`, `head`), 클립 32개(`idle`, `walk`, `sprint`, `jump`, `fall`, `crouch`, `sit`, `drive`, `die`, `pick-up`, `emote-yes/no`, `holding-*`, `attack-*`, `interact-*`, 휠체어 계열). 이 게임의 캐릭터 리그(`character_game.glb`, Mixamo 이름·Soldier 기준 rest 프레임)와는 다른 리그라서, 그대로 갈아 끼우면 `src/assets.js` 의 `adaptCharacter` 규약을 맞추지 못한다.

## 노면 텍스처 (Poly Haven · Dimitrios Savva)

- "Clean Asphalt" by Dimitrios Savva (Poly Haven, https://polyhaven.com/a/clean_asphalt), licensed CC0 1.0 Universal (https://creativecommons.org/publicdomain/zero/1.0/). Changed by Patch: 1K JPEG maps selected, credit added to each file.
- 6장 전부 왔다: `baseColor`(sRGB), `normal`(OpenGL +Y), `roughness`, `ao`, `arm`(AO/Roughness/Metallic 팩), `displacement`. 게임은 지금 색·노멀 두 장만 쓰므로(`src/world.js` 의 `tAsph`/`tAsphN`) 나머지는 필요할 때 쓴다.

## 보도블록 텍스처 (ambientCG)

- "Paving Stones 003" by ambientCG (Lennart Demes, https://ambientcg.com/a/PavingStones003), licensed CC0 1.0 Universal (https://creativecommons.org/publicdomain/zero/1.0/). 2018-02-06 공개. 이 zip 에는 크레딧·라이선스 파일이 들어 있지 않아 출처를 ambientCG 원본 페이지로 확인해 적었다(파일 이름 규칙 `PavingStones003_1K-JPG` 와 동봉된 `PavingStones003_1K-JPG.tres`(Godot)·`.mtlx`(MaterialX)·`.usdc` 가 ambientCG 배포본 그대로다).
- 5장만 넣었다: `Color`, `NormalGL`, `NormalDX`, `Roughness`, `Displacement`. 뺀 것: `.blend`(원본 작업 파일), `.usdc`, `.mtlx`, `.tres`(다른 엔진용 재질 정의), `PavingStones003.png`(미리보기).
- 참고: ambientCG 는 표기를 요구하지 않는다("You don't need to give credit").

## 소리

- "Footstep on concrete 1 (short, soft)" by Kenney (Kenney, https://kenney.nl/assets/impact-sounds), licensed CC0 1.0 Universal (https://creativecommons.org/publicdomain/zero/1.0/). Changed by Patch: credit added to the Ogg comments (not re-encoded). 원본: impact-sounds/footstep_concrete_000.ogg.
- `carEngineLoop.wav`, `policeSiren.mp3` — **출처·라이선스 미확인.** 둘은 다른 8종처럼 크레딧 파일과 함께 온 묶음이 아니라 낱개 파일로 전달됐다(압축 안에 CREDITS/LICENSES 없음). WAV 의 INFO 태그에는 `INAM: start up car with seat belt warning beep`, `ICRD: 2007` 만 있고 라이선스 표시가 없다. 배포 전에 출처를 확인해야 한다 — `build/assets/manifest.json` 에는 `"status": "confirm"` 으로 올려 경고로 남긴다.
- `carEngineLoop.wav` 길이 0.86초는 이음매 없는 루프로 쓰기엔 짧다(그대로 반복하면 1초에 한 번 꼬리가 들린다). 원본을 더 길게 받거나 크로스페이드가 필요하다.
