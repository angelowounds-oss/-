# CHANGELOG

## 0.14.0-dev

### M0 구조·빌드·회귀 기준선
- 엔진을 `src/engine/` 11개 주제 파일로 분리, `tools/build.mjs`로 `dist/aether.html` 단일 파일 생성(Python 빌드 제거).
- 원본의 미정의 참조 3건 수정: `S2_TOPOLOGY`, `S2_BOUNDARY_COMPONENTS`(메시 위상 감사 신규 구현), `S2_CFD_PROXY_ASSET`(스코프 밖 참조). 중복 키 3건 제거.
- eslint 설정(`eslint.config.mjs`), 회귀 테스트 `tests/regression.mjs`(기존 기능 16항목 + 셰이더 컴파일 + 외부 요청 0건 + 고정 카메라 5곳).

## 이전 (브랜치 `풍동작업`, 이번 목표 이전)
- 파일 분리, 멀티그리드 압력(collocated), Cd/Cl HUD, 원기둥 벤치마크(실패 기록), 적응 품질, 풍동 내부 연기 미표시·풍속 0 수정.
