# CHR — 캐릭터·애니메이션

현재: L2, **개선 여지**. 모든 인물이 한 메시(2026-10-16에 Soldier에서 새 마네킹형 캐릭터로 교체, [ADR-0009](../adr/0009-character-swap-frame-remap.md)) + 색 변경. 33개 게임 클립(UAL 이름), 장총 2본 IK, 권총 상체 클립(전신 클립에서 상체만 뽑음), 75 m 밖 스키닝 생략.
가장 눈에 띄는 약점은 군중 다양성(실루엣·체형·헤어·의상).

### CHR-01 캐릭터 다양성 — P1 · L · M3 · Backlog
- 범위: 같은 골격(또는 리타깃 가능한 골격)의 CC0 체형 4~6종 + 헤어/의상 변형(예: Quaternius 계열). 번들 증가 예산 +4 MB 이하, 인물당 드로우콜 증가 0~1.
- AC: 화면 속 20명 중 같은 외형(메시+색 조합) 비율이 현재 대비 크게 감소(측정 방식 착수 시 정의). `no-runtime-compile`, `boot` 녹색. 라이선스는 BLD-04 표에 등록.
- 의존: BLD-04(에셋 출처 관리), 사용자 확인(에셋 선택)

### CHR-02 이동 블렌딩 — P2 · M · Backlog
- 범위: 출발/정지/방향 전환 클립, 발 미끄러짐 측정(발 본의 지면 속도) 테스트.

### CHR-03 원거리 군중 임포스터 — P2 · S · Backlog
- 범위: 75 m 밖 인물을 빌보드 임포스터로(현재는 몸체 숨김). RND-04와 연계.

### CHR-04 제스처·물건 조작 모션 — P1 · L · In progress (A·B·C·E·F·G 1차 구현, 테스트 `motions`; 새 모션 팩·시민 일과 연결·발 미끄러짐 측정 남음)
- 목적: 서기·걷기·사격 외의 사소한 동작(물건 집기, 문·스위치 조작, 손 흔들기, 끄덕임, 전화, 먹고 마시기, 앉아 대화)이 없어 생활 시뮬레이션(LIFE-05/07/11)이 어색해진다.
- 현황: 원본 `assets/Character.glb`에 178개 클립이 이미 있고(같은 라이선스, 새 에셋 도입 없음) 게임에는 33개만 담았다. 쓸 만한 후보: Greeting, Head_Nod, Yes, Reject, Confused, Insult, Cheering_Two_Hands, Salute, Bow, Idle_Listening, Idle_FoldArms, Idle_TalkingPhone, Sitting_Talking, Consume, Consume_Item, PickUp_Table, Throw_Object, OverhandThrow, Walk_Carry, Walk_Backwards, Walk_Formal, Turn_Left/Right_90/180, Strafe, Sleeping, Meditate, Shivering, Tired_Hunched, Kneeling_Tired, Fixing_Kneeling, Dance_*, Help_*, Chest_Open, Zombie 계열(필요 시).
- 범위: (1) 클립 추가 선별(번들 증가 예산 +1.5 MB 이하, 클립은 상체 위주로 압축·키 줄이기) (2) `gesture.js`: 이름이 있는 제스처 API `play(person, 'wave'|'nod'|'pickup'|…)`와 상체 전용 레이어(걷는 중에도 손 흔들기·전화), 손에 물건 붙이기(손 본 소켓: 컵·가방·전화·음식) (3) 상황 연결: 상호작용 키(줍기·문·상점 계산), 시민 인사·대화 시작, 전화, 차량 승하차 (4) 정지·출발·방향 전환 클립으로 CHR-02 흡수.
- AC: `gestures` 테스트(모든 제스처 재생·복귀, 손 소켓 위치가 손 본 근처, 진행 중 제스처가 사격·피격·사망에 즉시 양보, 클립 누락 시 무동작 대체), `character`·`no-runtime-compile`·`frame-time` 녹색, 75 m 밖 인물은 제스처 계산 생략.
- 의존: CHR-00(완료), LIFE-07/11이 소비. 아이 체형(LIFE-14)은 같은 클립을 스케일로 재사용.

### CHR-00 캐릭터 교체 (새 리그·178 클립 원본) — Done · 2026-10-16
- 결과: `assets/character_game.glb`(33 클립)로 교체, `adaptCharacter`가 뼈 이름·프레임·클립을 Soldier 규약에 맞춤, 코드 변경 없음. `Soldier.glb`와 원본 `Character.glb`는 보관. 테스트 `character`.
- 남은 일: 발 미끄러짐 측정(CHR-02), 모델당 삼각형 +21%·뼈 +35%의 실기기 비용(PERF-01/02), 마네킹형이라 군중 다양성은 CHR-01 그대로, 대체 클립 품질(`Run`→`Jog`, 사망 `Death_A`) 눈으로 재확인.

### CHR-05 주인공 몸 교체(여성 캐릭터) — P1 · M · Review · 2026-10-17
- 결과: 사용자가 준 정적 T자세 OBJ(33개 조각, UV·스켈레톤 없음)를 `build/fit_female.mjs`로 조각별 단순화(약 2.2만 삼각형), 공유 리그의 바인드 포즈 비율로 휨(다리·몸통·팔 구간별), 가장 가까운 정점에서 스킨 가중치 복사, 조각별 정점 색(머리카락·피부·재킷·바지·부츠)을 입혀 `assets/player_female.glb`(1.1 MB)로 만든다. 주인공만 이 몸을 쓰고(`look.player`), 나머지 인물은 기존 몸. 모든 클립이 그대로 재생된다(같은 스켈레톤).
- 한계: 텍스처 없음(정점 색), 손가락·얼굴 표정 없음, 팔 길이는 리그에 맞춰 늘어남. 색 분류는 조각 번호 추정이라 `KIND()`에서 조정 가능.
- 의존: 라이선스 확인(ASSETS.md).

### 구현 현황 (2026-10-17)
- 제스처 메뉴: `K` → 숫자키(손 흔들기·끄덕임·맞아요·아니요·글쎄·경례·인사·환호·춤·통화·팔짱). 근처 평온한 시민이 손 흔들기·끄덕임·인사에 답한다. `src/gesturemenu.js`.
- 물건·상호작용: 줍기(PickUp_Table, 서 있을 때), 먹기·마시기(상체), 문 여닫기(Interact, 서 있을 때). 사다리(`Climb_Ladder`/`Ladder_Idle`)·난간 매달리기(`Ledge_Hang`) 자세.
- 남음: 새 모션 팩(악수·포옹·요리·운동·타이핑 등, 라이선스 확인 후), 시민 일과·대화 연결(LIFE), 발 미끄러짐 측정, 돌려 보지 않은 `frame-time`(이 컨테이너에서 변경 전 커밋도 중앙값 약 7 ms로 같아 변경 탓이 아님을 확인, 33 ms 초과 횟수가 8±1로 문턱 근처).
