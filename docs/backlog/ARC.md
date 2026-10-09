# ARC — 아키텍처·코드 품질

현재: L2, **개선 여지**. `Game`(game.js 119 KB)이 갓 오브젝트, 51개 모듈이 `G.*`로 서로 직접 접근, 프레임 순서 의존이 암묵적
(`docs/ARCHITECTURE.md`에 문서화만 됨). 한 줄 압축 스타일, 린트·타입 검사 없음, 테스트가 `window.__game` 내부에 의존.

원칙: 구조 개선 티켓은 **동작 변경 없음**. 각 단계마다 `node tests/run.cjs all` 녹색, 렌더 동일성 테스트(픽셀 0 차이) 유지.

### ARC-01 `Game` 분리와 명시적 프레임 스케줄 — P1 · L · 병행 · Backlog
- 범위: `Game.update`의 단계들을 시스템 객체로 분리(PlayerSystem, VehicleSystem, PeopleSystem, PoliceSystem, MissionSystem, HudSystem, RenderLoop)하고, 실행 순서를 배열 하나(`FRAME_SCHEDULE`)로 명시. 각 시스템은 필요한 의존만 생성자로 받는다.
- AC: `game.js` 50 KB 이하, 스케줄 배열이 ARCHITECTURE.md의 순서와 일치, 전 스위트 녹색.
- 하위 티켓: (a) HUD/미니맵 분리 (b) 차량 루프 분리 (c) 사람 루프 분리 (d) 경찰·수배 분리 (e) 스케줄 배열 도입 — 순서대로.

### ARC-02 테스트 전용 API — P1 · S · M0 · Backlog
- 목적: 테스트가 내부 필드(`pl.body3.teleport`, `B.list`, `bd.levels`…)에 직접 의존해 리팩터링마다 깨지는 문제.
- 범위: `window.__test = { freeze(), step(n, dt), teleport(x,z,y), tallestTower(), openBuilding(b), floorAt(b,k), spawnArmed(team,x,z), shoot(n), … }`를 `?test=1`일 때만 노출. 기존 테스트를 이 API로 옮긴다.
- AC: `tests/`에서 `window.__game.` 직접 접근이 렌더 동일성 테스트(내부 비교가 본질인 것) 외에는 없다.

### ARC-03 이벤트 버스 — P2 · M · Backlog
- 범위: 범죄·소음·사망·폭발 같은 교차 시스템 알림을 `G.events.emit/on`으로(현재는 `G.noise`, `G.society.crime`, `memory.log` 등 직접 호출). 순서 보장 규칙 명시.

### ARC-04 코드 스타일 (변경분만) — P2 · S · Backlog
- 범위: 새로 쓰거나 크게 고치는 함수는 한 줄 한 문장, 매직 넘버는 이름 있는 상수. 기존 코드의 대량 재포맷은 하지 않는다(blame 보존). BLD-05 린트와 함께.
