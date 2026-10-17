# LIFE — 생활 시뮬레이션 (관계·연애·결혼·가족·NPC 사회)

현재: 시민 일과·사망·추모(`citizens.js`), 목격·소문·뉴스(`memory.js`), 대화 한 줄(`society.js`, `village.js`). 관계·성격·대화 이력은 없음.
결정: `docs/adr/0014-life-simulation.md`(2026-10-17 사용자 결정). 구현 프롬프트: `docs/prompts/LIFE-SIM.md`(단계 1~10).
보호 테스트(추가 예정): `people-registry`, `bonds`, `dialogue`, `activities`, `romance`, `socialsim`, `scenes`, `events`, `grudges`, `family`, `minor-safety`.

### LIFE-01 인물 명부(수도·도시·마을), 성격·취향 — P1 · L · Backlog
- 목적: 등록된 모든 시민(약 5,800명)이 깊은 관계를 가질 수 있는 결정론적 원본 + 변경분 저장.
- 범위: `people.js`, `persona.js`, `schedule.js`(citizens에서 이전), `src/data/names.js`, `citylife.js`가 도시 명부를 사용. 수도 시민 데이터는 바뀌지 않음.
- AC: 원본 결정성, 수도 2,000명 동일성, 도시 명부 크기 식, 저장 왕복, 조회·생성 시간 예산(LIFE-SIM §2.16).
- 검증: `node tests/run.cjs --only people-registry` + quick.
- 의존: SAV-01. 단계 1.

### LIFE-02 사회 달력 — P1 · S · Backlog
- 범위: `calendar.js`(1년 = 28일, 4계절, 요일, 휴일, 나이: 성인 1배속·미성년 4배속), HUD 날짜 표시.
- AC: 나이 계산 테스트(성인 28일 = 1살, 미성년 7일 = 1살), 시작 시 나이 분포 유지.
- 의존: 단계 1에 포함.

### LIFE-03 관계 그래프 — P1 · M · Backlog
- 범위: `bonds.js` 초기 간선(가구·동료·이웃·친구·부부), 저장 간선, 읽기 감쇠, 전이 표. 원본 가구의 가족 관계.
- AC/검증: `bonds` 테스트(결정성, 가구 나이 타당성, 감쇠, 저장 왕복). 단계 2.

### LIFE-04 인물 기억·소문 — P1 · M · Backlog
- 범위: `pmemory.js` 고리 버퍼·망각·`opinion()`, `memory.js` 목격·knowers 연결, 하루 1회 소문 전파.
- AC: 범죄 목격 → 다음 날 가족이 앎. 기존 얼굴 반응 유지. 단계 2.

### LIFE-05 대화 엔진 — P1 · L · Backlog
- 범위: `dialogue.js` 의도 13종, 판정식, 대사 은행 700줄 이상(`src/data/lines/`), 조사·말투, 대화 이력, `talk` 패널 선택지, 기존 talk 대체.
- AC: `dialogue` 테스트(결정성, 궁합 통계, 미성년 금지 선택지, 말투, josa, 반복 없음). 단계 3.

### LIFE-06 휴대폰 "사람" 탭 — P1 · M · Backlog
- 범위: 연락처, 관계 막대, 알게 된 특성, 전화·문자·약속, 알림. 단계 3(가족 관계도는 단계 9).

### LIFE-07 함께 하는 활동 — P1 · M · Backlog
- 범위: `activities.js` 식사·술·카페(2인 좌석), 드라이브(조수석, 반응), 산책(손잡기), 말풍선 풀.
- AC: `activities` 테스트. frame-time 회귀 없음. 단계 4.

### LIFE-08 연애·결혼 — P1 · L · Backlog
- 범위: `romance.js` 단계·끌림 선호(성별 무관 성인)·데이트 평가·고백·청혼·질투·이별·이혼.
- AC: `romance` 테스트(선호 반영, 미성년 거부, 질투). 단계 5.

### LIFE-09 동거·집 생활·가계 — P1 · M · Backlog
- 범위: `household.js` 가구·동거·주 정산·이사, 배우자 집 일정(요리·TV·잠·대화), 기념일, 위험 알림.
- 단계 5.

### LIFE-10 보이지 않는 사회(하루 틱) — P1 · L · Backlog
- 범위: `socialsim.js` 지역 큐, 프레임 예산 1 ms, 사건 표(만남·연애·결혼·이별·이사·이직·출산·노환 사망·이주), 뉴스·알림.
- AC: `socialsim` 테스트(분포, 예산, 인구, 결정성, 저장 ≤ 300 KB). 단계 6.

### LIFE-11 보이는 장면 — P1 · M · Backlog
- 범위: `scenes.js` 인사·대화·함께 걷기·다툼·포옹·같이 식사, 동시 6개, 절차적 자세, 플레이어 끼어들기.
- AC: `scenes` 테스트(상한, ≤ 0.4 ms, 정리, 셰이더 0). 단계 6, `all` 스위트.

### LIFE-12 행사·의식 — P2 · M · Backlog
- 범위: `events.js` 생일·결혼식·장례식·계절 축제, 초대, 손님 실체화, 대본, 요약 처리, 중단.
- 단계 7.

### LIFE-13 원한·라이벌·복수·화해 — P2 · M · Backlog
- 범위: `grudges.js` 피해 기록, 성격별 반응(신고·따짐·소문·거래 거절·복수), 라이벌, 화해, NPC끼리 동일 규칙.
- 단계 8.

### LIFE-14 자녀·가족 — P2 · L · Backlog
- 범위: `family.js` 임신·입양·출생·성장 단계·양육 대화·성인화, 학교 지점, 가족 관계도, 절차적 아이 체형.
- 의존: 아이 GLB는 선택(받으면 교체). 단계 9.

### LIFE-15 미성년자 보호 — P0(LIFE-14 착수 시) · M · Backlog
- 범위: 피해 0, AI 표적 제외, 대피, 대화·동사 제한, 사망 사건 제외(LIFE-SIM §3.8).
- AC: `minor-safety` 테스트. LIFE-14와 같은 커밋 안에서 끝낸다.

### LIFE-16 통합 밸런스·측정·전달 — P1 · M · Backlog
- 범위: 1년 시뮬레이션 통계로 `src/data/social.js` 조정, PERF-BASELINE 기록, 문서, `all`, 스크린샷, 빌드 전달. 단계 10.
