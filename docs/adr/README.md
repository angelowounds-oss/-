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
