# 에셋 출처와 라이선스 (BLD-04에서 전체 정리 중 — 지금은 새로 추가한 것부터 기록)

새 에셋을 넣으면 여기에 출처·라이선스·표기 의무를 적는다. 전체 목록(모델, 텍스처, HDRI, 물 셰이더 GPL 이슈 등)은 BLD-04.

| 에셋 | 파일 | 출처 | 라이선스 | 표기 |
|---|---|---|---|---|
| Anton (로딩 화면 제목·숫자) | `assets/fonts/Anton-400.woff2` (라틴 부분) | Google Fonts (Vernon Adams) | SIL Open Font License 1.1 | 로딩 화면 하단 크레딧에 표기 |
| Space Mono 400/700 (로딩 화면 보조 글자) | `assets/fonts/SpaceMono-{400,700}.woff2` (라틴 부분) | Google Fonts (Colophon Foundry) | SIL Open Font License 1.1 | 위와 같음 |
| 플레이어 캐릭터 (rig·메시·178 클립) | `assets/Character.glb` (원본, 보관), `assets/character_game.glb` (게임 사용분 33 클립, `build/prune_character.mjs`로 생성) | 사용자 제공 파일 | 사용자 확인 완료: 표기 의무 없음(CC0 계열) | 표기 불필요. 크레딧 줄에는 올리지 않는다 |
| 주거 건물 3종 (5·6·8층 아파트) | `assets/blocks/blocks.bin` (기하, `build/blocks_pack.mjs`로 OBJ 001~003에서 생성), `assets/blocks/ao.jpg` (AO 아틀라스 1024px) | 사용자가 제공한 "Residential Buildings Set" (Blender 2.78 OBJ 10종 + 텍스처, 2017). 마을의 아파트로 사용(`src/blocks.js`, `src/village.js`) | **미확인 — 제공자에게 출처·라이선스를 받아 이 칸을 채울 것** | 확인 전까지 외부 배포 금지 |
| 도시 랜드마크 타워 (Manhattan 14종 + Camellia 9종의 모양) | `assets/landmarks/landmarks.bin` (`build/landmarks_pack.mjs`), `src/landmarkdims.js` | 사용자가 제공한 "83-manhattan" (FBX/Blender, 2021)과 "40-camellia-city" (SketchUp OBJ, 2018). 모양만 쓰고 창 무늬는 게임이 직접 그린다(`src/landmarks.js`) | **미확인 — 제공자에게 출처·라이선스를 받을 것** (실존 건물을 본뜬 모델일 수 있음) | 확인 전까지 외부 배포 금지 |
| 저격 소총 KSR-29 (소총+스코프) | `assets/props/sniper_rifle.glb` (`build/sniper_pack.mjs`: 4096→1024 px webp, 350 KB) | 사용자가 제공한 "sniper_rifle / sniper_scope" glTF (2020, 같은 세트의 `Sniper_Ammo`는 이미 `sniper_mag.glb`로 사용 중) | **미확인 — 제공자에게 출처·라이선스를 받을 것** | 확인 전까지 외부 배포 금지 |
| Soldier (이전 캐릭터, 보관만) | `assets/Soldier.glb` | three.js examples | 이번 교체 전 사용, 현재 번들에 포함하지 않음 | 교체 전 크레딧 문구 참고 |

- 캐릭터: 게임은 `character_game.glb`를 쓴다. `Character.glb`는 원본 보관용이며 bone 이름과 프레임은 `src/assets.js`의 `adaptCharacter`가 게임 규약(Mixamo 이름, Soldier 기준 rest 프레임)으로 맞춘다.
- 글꼴은 `build/build.mjs`가 base64로 템플릿에 넣는다(단일 HTML, 오프라인에서도 같은 모양). 한글은 글꼴을 넣지 않고 시스템 글꼴(`Noto Sans KR`/`Malgun Gothic`/`Apple SD Gothic Neo`)을 쓴다.
- 로딩 화면 디자인 원본: 사용자가 준 `Purge Day — 로딩` 목업(1280×720 아트보드). 값(색·크기·간격)은 목업 그대로, 구현은 `src/template.html` + `src/loading.js`.
- 주거 건물: 원본 OBJ 10종(001~010)에서 001~003만 쓴다. 텍스처 `Hotel_Hous_AO.png`는 색이 아니라 AO(그림자) 맵이라 벽 색은 마을 팔레트의 정점 색으로 곱한다. 유리 패널은 창 단위로 켜짐/꺼짐을 정한다. `Camellia City`, `Manhattan`, 저격 탄창(`Sniper_Ammo`)은 아직 적용하지 않았다(저격 탄창은 `assets/props/sniper_mag.glb`로 이미 사용 중).
