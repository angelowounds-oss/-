# CHANGELOG

## 0.14.0-dev

### M7 LBM 비교
- `87-lbm.js`: D3Q19, 끌어오기 스트리밍, 저장 FP32/FP16/MIXED(f−wᵢ 저장), 운동량 교환 힘, 출구 스펀지, 입구 속도 램프(t*=0~5, 충격 시작의 압력파 방지).
- 충돌: TRT(Λ=1/4) + 정규화 BGK(Latt & Chopard 2006, 비평형을 2차 에르미트 성분으로 투영) 선택. Re=200·8셀/D에서 τ=0.507이라 TRT는 발산 → 정규화 BGK를 기본으로 비교.

### M4 힘 계산 수정
- 점성 힘을 "벽까지 거리 h/2" 가정에서 **확산 단계가 고체 면과 주고받는 운동량을 그대로 합산**하는 이산 일관형으로 교체. 이전 공식은 부분체적 셀의 접선 속도를 벽 속도로 착각해 마찰항력을 약 2배로 계산했음(구 Re=100: 마찰 1.10 vs 문헌 약 0.5~0.6).
- 결과 JSON에 `forceModel`을 기록하고, 보고서는 현재 공식으로 만든 결과만 표에 넣음.

### M5/M6 그래픽
- HDR MRT 파이프라인(88-post-fx): GTAO, 저해상도 볼류메트릭(블루노이즈·HG·광선 그림자·장면 깊이 가림·시간 재투영·깊이 인지 업샘플), SSR, TAA(YCoCg 분산 클립), 블룸, AgX/ACES, FXAA, CAS 업스케일.
- 89-lighting-hq: GGX 사전필터 큐브맵, SH9 조도, 3단 CSM + PCF/PCSS(ULTRA 4096), 클리어코트, 프레넬 유리. 차량 텍스처 타일별 PBR 재질표.

### M3 MAC 솔버
- 엇갈린 격자, 부분체적 고체(차량 2×2×2 슈퍼샘플), 이동 고체(사람·바퀴 ω=U/R·롤링로드·팬), MacCormack+제한자, Smagorinsky LES, RBGS-MG/GMG/MGPCG 비교 후 RBGS-MG 채택, 2배 연기 격자, 실패 시 collocated 자동 전환.

### M1/M2 계측·품질
- GPU timer query 구간 계측, 할당량 계산, 2.5 s 시작 벤치마크(UA 판정 제거), 강등 사다리, `#q/#sim/#vol/#render` 수동 고정, `#bench=perf` JSON.

### M0 구조·빌드·회귀 기준선
- 엔진을 `src/engine/` 11개 주제 파일로 분리, `tools/build.mjs`로 `dist/aether.html` 단일 파일 생성(Python 빌드 제거).
- 원본의 미정의 참조 3건 수정: `S2_TOPOLOGY`, `S2_BOUNDARY_COMPONENTS`(메시 위상 감사 신규 구현), `S2_CFD_PROXY_ASSET`(스코프 밖 참조). 중복 키 3건 제거.
- eslint 설정(`eslint.config.mjs`), 회귀 테스트 `tests/regression.mjs`(기존 기능 16항목 + 셰이더 컴파일 + 외부 요청 0건 + 고정 카메라 5곳).

## 이전 (브랜치 `풍동작업`, 이번 목표 이전)
- 파일 분리, 멀티그리드 압력(collocated), Cd/Cl HUD, 원기둥 벤치마크(실패 기록), 적응 품질, 풍동 내부 연기 미표시·풍속 0 수정.
