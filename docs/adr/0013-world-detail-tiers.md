# ADR-0013: world detail tiers and the chunk container

Status: accepted (2026-10-16), step 1 of the bake expansion (plan: more baked data, "laptop" world embedded + optional "high" pack).
Amended 2026-10-30 (BLD-07): the build bakes the pack's world part together with the base world every time (through the cache), and both containers carry the same world id in their meta; `detail.mountPack` refuses a world pack whose id differs from the base world's (a pack copied from an older bake had put 8 m ground up to 1.4 km off the base ground).
Amended 2026-10-28 by [ADR-0034](0034-folder-launcher-zip.md) (BLD-06): the game ships as a folder served by `NeonCity.exe`; the laptop world is the file `game/world/base.pak` and the high pack always ships next to it and mounts by itself when the "high" detail is chosen. The folder picker, IndexedDB handle and file input below are gone.

## Decision
- **Two world details.** "laptop" is inside the page (`neon_city_v9.html`, target ≤150 MB); "high" is an optional folder `world/` (`index.json` + `*.pak`, made with `node build/bake.mjs --pack`) that is put in front of the embedded data. The detail is chosen at the title screen only (never during play), default by `navigator.deviceMemory`/`hardwareConcurrency`, remembered in `localStorage` (`neon_detail`). Mobile is not a target of this work.
- **Chunk container v2** (`src/bakefmt.js`): `[magic][indexLen][index JSON][chunks]`, each chunk its own `deflate-raw` block with a `cyrb53` hash in the index. A reader takes only the chunks it needs (`File.slice` for a pack of any size). The laptop world is the same container (`game/world/base.pak` since ADR-0034, fetched whole by `src/bakedload.js`; before that base64 in `<script id="baked">`); `WorldData` (`src/chunkstore.js`) finds a key in the first source that has it, verifies the hash, inflates in a worker, caches the decoded object. The `core` chunk (coarse world, roads, city layouts) is still published as `globalThis.__BAKED`.
- **Pack access** (since ADR-0034). The pack (`world/index.json`, `high.pak`, `assets.pak`) sits next to the page and is read over http with Range requests (`chunkstore.httpFile`), only when the chosen detail is "high". Before ADR-0034 a `file://` page could not read a sibling folder and the title screen had "고화질 팩 연결" (`showDirectoryPicker`, handle in IndexedDB).
- **Bake.** `build/bake.mjs` runs jobs (`JOBS`, generators in `build/jobs.mjs`) in up to 4 worker threads; each result is cached in `build/baked/cache` by the hash of the job's source files, so unchanged jobs are not redone. Same sources give the same bytes. Baked output is not committed; the built folder (`dist/`, as a zip) is delivered outside the repository.
- Saves may be reset when the world data changes (no compatibility code); the key is bumped by the step that changes the terrain.

## Consequences
New data goes in as chunks (`h8/…`, `city/…`, `forest/…`) with a job each; consumers read `__WORLD` and fall back to the embedded chunk (or the generator in `WORLD=small`) when a pack chunk is missing. Tests: `unit/bake` (determinism, container), `unit/chunkpack` (pack mount, hash/size refusal, parallel + cache).

## 구현 내용 (2026-10-17)
| 단계 | 데이터(구움) | 코드 | 비고 |
|---|---|---|---|
| 지형 | `t16/<i>_<j>` 16 m Int16(0.1 m) + 평면 예측 코딩, 물리 층(다리·터널 채움)은 있는 타일만, 지면 색 32 m RGB(감마 2) | `landfn.js`(순수 지면 함수·강 수로), `heightmap.js`(조회·상주/스트림), `groundfn.js`(색) | 팩: `t8/…` 8 m. 조회는 가장 가는 로드된 타일, 없으면 NaN → `landfn`이 계산(WORLD=small과 같은 월드). 셀 > 32 m(먼 고리)는 계산 |
| 수계 | 강은 폴리라인 + 수위, 수로는 수위 기준으로 깎음(산등성이를 지나면 협곡) | `waterfn.js`, `rivers.js`, `farland.js`(해안 거품) | 헤엄·잠수(Z 하강, Space 상승, 숨 45초, 익사), 강 흐름이 몸을 실어 나름 |
| 도시 | `city/<id>/<i>_<j>` 차선·횡단보도·정지선·신호등·벤치·쓰레기통·소화전·가로수·버스 쉼터·옥상 설비·박공 지붕 | `citydetail.js`, `citysites.js`(타일당 한 프레임, 가까운 곳만) | 팩은 같은 키로 2배 밀도. 고속도로 방음벽·표지석·델리니에이터는 `highways.js` |
| 자연 | `veg/<i>_<j>` 32 m 칸당 1바이트(종류<<5 \| 나무 수) | `vegfn.js`, `forest.js` | 칸의 해시로 나무·덤불·바위·풀, 가까이 모델·멀리 빌보드(안개 반경), 줄기 충돌체 24 m. 팩 단계: 2배 밀도·반경 |
| 마을·시설 | 평탄 패드(`roadnet.pads`), 흙길·마을 바닥 색 | `settlements.js`(배치·평면), `village.js`, `industry.js` | 마을 30(고속도로 8), 농장 20, 풍력 2·태양광 2·광산 2·정유소 1, 통신탑 12, 송전탑 223 |
| 파괴 | 세이브 `state.places`(`ruins`·`dead`·`fallen`·`bridges`) | `Game.explosion` → `villages/industry/highways.blast` | 집은 가라앉아 잔해(2일 후 복구), 탑·터빈·송전탑은 쓰러지고(5일), 교량 경간은 데크가 사라지고 아래 땅이 계곡으로 돌아옴 |

### 하지 않은 것과 이유
- **건물 내부 평면도 굽기(`interiors.pak`)는 만들지 않았다.** `Building.furnishRooms`는 방 배치 계산과 메시 조립이 한 생성기 안에 얽혀 있고 층 생성은 이미 8 ms 미만의 단계로 쪼개져 있어(불변 조건), 굽는다고 빨라지지 않는다. 의미 있는 굽기는 생성기를 "계획(순수) / 조립(three)"으로 가르는 작업이며 WLD-16으로 백로그에 올렸다.
- 고사양 팩의 지면 텍스처는 8 m 타일의 16 m 색 격자까지(4 m/px·도시 주변 1 m/px는 하지 않음): 먼 고리는 정점 색이라 4 m/px는 셰이더 샘플러 + 텍스처 스트리밍이 필요하다(WLD-17).
- 건물 개별 형태: 필지 기록(층 구성·왕관·들임·팔레트)에 옥상 설비·박공 지붕·가로수를 더했다. ㄱ자·원통 평면은 WLD-11(조사).

## 마을 아파트와 붕괴 (2026-10-17)
- 마을 30곳 중 약 3/4에 아파트 1~2동(`assets/blocks` 실제 모델 3종, 5·6·8층)이 거리 끝에 선다. 배치는 별도 난수열(`seed ^ 0xb10c`)이라 기존 집·주민 배치는 바뀌지 않는다.
- 모든 건물은 무너진다: 집·가게·교회·헛간·아파트(체력 700)·급수탑·주유소 지붕. 폭발로 체력이 0이 되면 충돌체는 즉시 사라지고, 건물은 1.5~4 s 동안 흔들리며 가라앉아 잔해가 된다(`Villages.collapse`). 잔해는 이틀 뒤 다시 지어진다.
- 아파트에는 침대가 없어서 주민은 문 앞에서 나오고 들어간다.
