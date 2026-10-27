# AAA — 품질 상향 (계획: `docs/AAA-PLAN.md`)

현재: Q0 착수. 결정(2026-10-27): 본체 HTML + 고화질 팩, 라이선스 CC0/CC-BY만, 사운드 샘플 + 합성, 보이는 화질 먼저.
시각이 달라지는 티켓은 기준 장면(Q0-3) 전후 대조를 보내고 사용자 승인 후 ADR에 남긴다.

### Q0-1 에셋 목록·검증·크레딧 — P0 · M · Q0 · Review (28항목, 확인 필요 7·교체 예정 1)
- 목적: 오픈소스 에셋을 대량으로 들이기 전에 출처·라이선스를 기계로 지킨다(BLD-04, UX-04 흡수).
- 범위: `build/assets/manifest.json`(id, url, author, licence, sha256, files), `build/assets/fetch.mjs`(받기·sha256·허용 라이선스 검사), `docs/ASSETS.md` 자동 절, 게임 크레딧 화면 데이터. 기존 에셋도 목록에 올린다.
- AC: 허용 목록(CC0-1.0, CC-BY-3.0/4.0, OFL-1.1, MIT, ODbL 데이터) 밖이면 빌드 실패. 크레딧이 CC-BY·OFL·ODbL 전부를 표기.
- 검증: `node build/assets/fetch.mjs --check`, 단위 `assets-manifest`.
- 의존: 출처 미확인 4건(player_female, Residential Buildings Set, Manhattan/Camellia, KSR-29)은 사용자 확인.

### Q0-2 압축 팩(KTX2·meshopt) — P0 · M · Q0 · Backlog
- 범위: gltf-transform + basisu로 텍스처 KTX2, 메시 meshopt. 청크 컨테이너(ADR-0013)에 `assets/*.pak`, KTX2Loader·transcoder 내장, 팩 없으면 본체 에셋으로 대체.
- AC: 같은 텍스처의 GPU 메모리 4배 이상 감소, 팩 없이도 게임 동작, 본체 크기 증가 1 MB 이하.

### Q0-3 기준 장면 하네스 — P0 · M · Q0 · Backlog
- 범위: 고정 카메라 12장면(`?view=n`), `tests/tools/golden-views.cjs` 촬영·대조 시트.
- AC: 같은 빌드 두 번 촬영이 픽셀 동일, 대조 시트 PNG 한 장.

### Q0-4 물 셰이더 교체(GPL 제거) — P0 · M · Q0 · Backlog
- 범위: three.js `Water`(MIT)를 바탕으로 다시 쓴다. Q2-4와 합친다.

### Q0-5 품질 등급 확장 — P1 · S · Q0 · Backlog
- 범위: `engine.js` `QUALITY`에 효과 스위치(CSM 단계, SSR, TAA, 볼류메트릭, 팩 유무).

### Q1-1 캐스케이드 그림자 — P1 · M · Q1 · Backlog (RND-02 흡수)
### Q1-2 반사(SSR·프로브·젖은 노면) — P1 · L · Q1 · Backlog
### Q1-3 TAA — P2 · M · Q1 · Backlog
### Q1-4 하늘·대기·HDRI 2K — P1 · M · Q1 · Backlog
### Q1-5 자동 노출·LUT·GTAO HIGH — P1 · S · Q1 · Backlog
### Q1-6 도시 조명(프로브 격자·전조등) — P2 · M · Q1 · Backlog
### Q2-1 지형 재질(삼면 투영 스플랫) — P1 · L · Q2 · Backlog
### Q2-2 나무(CC0 모델·임포스터) — P1 · L · Q2 · Backlog
### Q2-3 풀 — P2 · M · Q2 · Backlog
### Q2-4 물(거스트너·반사·흐름) — P1 · M · Q2 · Backlog
### Q3-1 도로 표현(R5) — P1 · L · Q3 · Backlog
### Q3-2 도시 뼈대(C1) — P1 · L · Q3 · Backlog
### Q3-3 한국 건축 키트 — P1 · L · Q3 · Backlog
### Q3-4 한글 간판(C2) — P1 · M · Q3 · Backlog
### Q3-5 거리 시설 — P2 · M · Q3 · Backlog
### Q3-6 도시 생활(C3) — P2 · M · Q3 · Backlog
### Q4-1 다양한 사람(CC0 모듈형) — P1 · L · Q4 · Backlog (CHR-01 흡수)
### Q4-2 군중 LOD(VAT·임포스터) — P1 · L · Q4 · Backlog (RND-04, CHR-03)
### Q4-3 애니메이션 품질 — P2 · M · Q4 · Backlog
### Q5-1 차량 모델 — P1 · L · Q5 · Backlog
### Q5-2 손상·주행감 — P2 · M · Q5 · Backlog
### Q6-1 사운드 샘플 — P1 · M · Q6 · Backlog (AUD-00 결정됨: 샘플 + 합성)
### Q6-2 공간음(HRTF·리버브) — P2 · M · Q6 · Backlog
### Q7 게임플레이·연출 — 기존 AI-01/02, GPL-02, UX-01, LIFE-05로 진행
### Q8 성능·안정 — 기존 PERF-01..04, SAV-01/02, BLD-01로 진행
