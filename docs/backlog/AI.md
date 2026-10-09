# AI — AI·사회 시스템

현재: L2~L3, **개선 여지**. 시야·기억·조사·수색·엄폐/엿보기·측면·후퇴(`src/ai.js`), 시민 공포 전파, 경찰→군 확전(`military.js`),
주민 2,000명 일과(`citizens.js`), 목격 신고·뉴스·소문(`society.js`, `memory.js`). 약점: 전투 AI가 한 함수의 상태 분기로 누적,
조정값이 코드 곳곳의 숫자, 내비 격자 캐시 없음.

보호 테스트: `ai-behaviour`, `military`, `gunfire-load`, `nav-perf`.

### AI-01 전투 AI 구조화 — P1 · L · 병행 · Backlog
- 범위: `combat()`의 상태 분기를 행동 단위(조사·수색·교전·엄폐·후퇴·체포)와 점수 함수(유틸리티)로 분리. 상태 전이 규칙을 표로 문서화.
- AC: 기존 `ai-behaviour` 녹색 + 시나리오 테스트 3개 추가(분대 측면 우회, 엄폐 사용률, 체포 시도). `gunfire-load` 회귀 없음.

### AI-02 밸런스 데이터 테이블 — P1 · M · M2 · Backlog
- 범위: 감지 거리·시야각·사격 간격·명중률·수배 임계값·군 투입 조건 등을 `src/data/balance.js` 한 곳으로. 동작 변경 없음(값 동일).
- AC: `src/ai.js`, `src/military.js`, `src/game.js`(수배)에서 해당 매직 넘버 제거, 전 스위트 녹색.

### AI-03 경찰 추격 운전 — P2 · M · Backlog
- 범위: 바리케이드, 앞질러 막기, 차량 충돌 유도(PIT). 수배 감소 규칙 문서화.

### AI-04 내비 격자 캐시 — P2 · S · Backlog
- PERF-06과 같은 작업(그쪽에서 진행).
