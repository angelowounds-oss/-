# SAV — 저장·데이터

현재: L1~L2, **취약**. `game.js`의 `snapshot()`이 `{cash, mission, kills, world: state}`를 localStorage에 JSON으로 쓴다. 버전 필드 없음,
실패는 `catch { /* ignore */ }`, 누적 데이터(탄흔 700, 이벤트 200, 주민 기록) 크기 예산 없음.

### SAV-01 저장 스키마 버전과 마이그레이션 — P0 · S · M0 · Backlog
- 범위: `snapshot()`에 `v: <정수>` 추가. `load()`에서 `migrate(data)`가 v0(현재 형식)→v1… 순서로 변환. 지금 산발적인 호환 코드(`gear1` 등 "older saves" 처리)를 마이그레이션 함수로 모은다.
- AC: v 없는 기존 저장을 불러오면 v1로 변환되어 게임이 시작된다. 알 수 없는 미래 버전은 덮어쓰지 않고 경고.
- 검증: `tests/fixtures/saves/v0-*.json`(현재 형식 샘플 2~3개) + 새 테스트 `e2e/save-migrate.test.cjs`(로드 → 상태 확인 → 다시 저장 → v 확인).
- 관련 파일: `src/game.js` (`SAVE_KEY`, `load`, `save`, `snapshot`), 상태를 쓰는 모듈들(`memory.js`, `citizens.js`, `items.js`, `power.js`)

### SAV-02 저장 실패 표시와 용량 예산 — P0 · S · M0 · Backlog
- 범위: `save()` 실패(QuotaExceeded 등)를 토스트로 알리고 재시도. 저장 크기를 측정해 예산(예: 1 MB) 초과 시 오래된 탄흔·이벤트부터 정리. 설정 화면에 슬롯별 크기 표시.
- AC: 용량을 인위적으로 채운 상태에서 저장 실패가 화면에 보인다. 2시간 플레이 상당의 상태에서 저장 크기가 예산 이하.

### SAV-03 저장 내보내기/가져오기 — P2 · M · Backlog
- 범위: 휴대폰 설정에 파일로 내보내기/가져오기(JSON). 가져올 때 SAV-01 마이그레이션 통과.
