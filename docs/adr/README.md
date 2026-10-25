# 결정 기록 (ADR)

구조·정책 결정을 남긴다. 형식: 상태 / 배경 / 결정 / 결과(얻은 것·치른 것) / 재검토 조건. 결정을 바꿀 때는 기존 파일을 고치지 말고
새 ADR로 "대체(Superseded by …)"를 표시한다.

| 번호 | 제목 | 상태 |
|---|---|---|
| [0001](0001-single-file-html.md) | 단일 HTML 파일 배포 | 채택 · 재검토 예정(PERF-05) |
| [0002](0002-fixed-light-count-no-runtime-compile.md) | 조명 수 고정, 플레이 중 셰이더 컴파일 0 | 채택 |
| [0003](0003-fixed-step-physics-render-interpolation.md) | 고정 스텝 물리 + 렌더 보간 | 채택 |
| [0004](0004-floor-streaming-generators.md) | 층 스트리밍은 생성기 단계(프레임당 3 ms) | 채택 |
| [0005](0005-lossless-optimizations-only.md) | 손실 없는 최적화 원칙, 인스턴스 패킹 적용 범위 | 채택 |
| [0006](0006-pooled-floor-buffers.md) | 층 지오메트리 버퍼 풀링 | 채택 |
| [0007](0007-test-strategy-swiftshader.md) | 테스트 전략: SwiftShader 동일성·로직 + 실기기 GPU | 채택 |
| [0008](0008-destructible-buildings-via-instances.md) | 건물 파괴는 외관 인스턴스·병합 메시 조작으로 | 채택 |
| [0009](0009-character-swap-frame-remap.md) | 캐릭터 교체: 뼈 프레임을 Soldier 규약에 맞춰 코드는 그대로 | 채택 |
| [0010](0010-building-stages-and-shape-variation.md) | 건물 단계 목록과 모양 변주(건물별 난수, 코어 모서리 고정) | 채택 |
| [0011](0011-war-craft.md) | 전차·공격헬기·전투기: 기존 차량 구조 위에 카메라=조준, 군 기지는 공원 블록 | 채택 |
| [0012](0012-world-archipelago.md) | 100 km 도시 군도: 좌표·월드 설계 데이터·원경 지형 클립맵 | 채택 · 1단계 구현 |
| [0013](0013-world-detail-tiers.md) | 월드 화질 2단계(노트북 내장 / 고사양 팩)와 청크 컨테이너 | 채택 |
| [0014](0014-life-simulation.md) | 생활 시뮬레이션: 결정론적 인물 + 변경분 저장 + 규칙 기반 사회, 미성년자 보호 | 제안 |
| [0021](0021-real-settlements.md) | 실제 읍·면·리를 한국어 마을로, 터 평탄화는 컴파일러 | 채택 |
| [0022](0022-road-deck-colliders.md) | 도로 노면 판 충돌체와 옛 고속도로 겹침 규칙 | 채택 |
| [0023](0023-crossing-clearance.md) | 도로 교차 높이 간격(다리 위로, 고속도로는 평면 교차 없음) | 채택 |
| [0024](0024-slip-roads.md) | 진출입로(`*_link`)를 컴파일 도로에 포함 | 채택 |
