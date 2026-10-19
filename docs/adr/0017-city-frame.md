# ADR-0017 수도 좌표계: 로컬 프레임 + 오프셋

상태: 채택 (2026-10-19), 구현은 단계별 (이 ADR의 1단계 시작 상태: 상수만 추가)

## 배경
ADR-0016으로 수도 NEON CITY를 실제 서울 위치에 두기로 했다. 서울은 한국 중심(원점)에서 서북쪽 약 11 km·남쪽 약 29 km에 있다. 한반도 전체가 100 km 맵 안에 들어가야 하므로 맵 중심을 서울로 옮길 수 없다(계산: 서울 중심이면 한국이 ±50 km를 넘는다).
그래서 수도의 상세 도시는 **자기 좌표(로컬 프레임)에서 원점 중심으로 만들고**, 맵 전체(원경 데이터)와의 관계는 오프셋으로 맞춘다.

## 결정
- **로컬 프레임**: 게임 좌표 `(x, z)`는 수도 중심이 원점인 좌표다. 상세 도시(건물·도로·지면·물리·셰이더 제외 영역)는 이 좌표를 그대로 쓴다.
- **오프셋 O = `CAPITAL` (서울 시청의 맵 좌표, `src/koreamap.js`)**: 맵 전체 데이터(고도·바이옴·도시 목록·고속도로·강·숲 타일)는 **맵 좌표 = 로컬 + O**로 읽는다.
- **변환은 경계에서만**: `worldmap`·`roadnet`·`settlements`·`vegfn`·베이크 데이터의 공개 함수는 로컬 좌표를 받고 돌려준다. 내부 생성은 맵 좌표로 한다. 경계 함수가 `+O` / `-O`를 한다.
- 원점(로컬 0,0)은 수도 도심이다. 한국 중심의 맵 좌표는 로컬 `(-O.x, -O.z)` = (10741, 28553)이다.

## 영향 지점 (1단계 목록)
- 맵 데이터 입구: `farHeight`, `biomeAt`, `surfaceColor`, `cities()`, `highways`, `rivers`, `roadsData()`, `settlements`, `vegCell`/`vegTile`, 베이크 타일 키.
- 원점 가정: `landfn.js`(근거리 블렌드 1.4~9 km), `roadnet.js`(`groundH`, 연결로), `farland.js`(셰이더 |x|,|z|<EXTENT 제외, 물리 높이 제외), `game.js`(`waterAt` 748행), `craft.js`(도시 위 판정 254행), `terrain.js`, `transit.js`, `aviation.js`.

## 대안 (기각)
- 전 월드 평행 이동(맵 중심 = 서울): 한국이 맵 밖으로 나간다.
- 수도를 원점에 두고 실제 지명만 쓰기: ADR-0016의 "실제 위치" 결정과 충돌한다.

## 검증 기준 (구현 시)
- 수도 중심 맵 좌표가 `CAPITAL`과 1 m 이내 일치(`unit/koreamap`에 `CAPITAL` 검사 추가됨).
- 도시 내부 픽셀 동일(위치만 바뀌고 도시 모습은 그대로).
- `farland`, `roadnet`, `worldnav`, `bake`, `citydetail`, `no-runtime-compile` 통과.

## 구현 상태 (2026-10-19)
- 완료: 맵 데이터의 공개 입출력을 로컬 프레임으로 전환. `worldmap`(`farHeight`·`biomeAt`·`surfaceColor` 입력, `cities`·`highways`·`rivers` 로컬 복사본), `heightmap`(타일 격자 원점 `TILE_ORIGIN`, 베이크 `build/jobs.mjs`도 같은 원점), `vegfn`·`forest`(셀 원점 `VEG_ORIGIN`, 셀 인덱스는 그대로), `craft`(고속 이동 경계는 맵 좌표), `worldmapui`(화면 중심 `MAP_C`), NEON CITY 위치를 서울(`CAPITAL`)로 이동.
- 그대로 쓰는 것: `landfn`·`roadnet`·`settlements`·`highways`는 로컬 좌표로 동작하므로 코드 변경 없음. 맵 생성 내부(`worldmap` build)만 맵 좌표.
- 베이크 타일 격자는 맵 좌표와 같은 타일을 같은 자리에 두고, 조회와 생성만 로컬 원점을 쓴다(그래서 타일 데이터의 위치는 바뀌지 않는다).
- 남은 것: 도로 생성기의 헤어핀 2곳(v4 마을 입구 근처, `unit/countryroads-quality` 실패 — WLD-19 기록), 정착지 생성 범위(±46 km, 맵 동쪽 끝 일부 제외), 베이크 재생성 후 `quick` 결과 확인.
