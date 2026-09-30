| 항목 | 결과 | 상세 |
|---|---|---|
| 인트로 스플래시 | PASS | {"splash":true,"title":"AETHER"} |
| 시네마틱 투어 시작·중지 | PASS |  |
| 실시간 CFD 부팅 | PASS | {"ok":true,"err":null,"q":"LOW","N":[112,36,52],"solver":"MG"} |
| PBR 풍동 씬 | PASS | {"objects":417,"vehicleParts":5,"fanParts":35,"roadParts":4,"consoleLike":23,"stage":"READY"} |
| 관제실 장비 | PASS | {"consoleLike":23} |
| 자동문·계단 | PASS | {"built":true,"steps":4,"landZ":3.72} |
| HUD·상시 고지 | PASS | 실시간 GPU CFD · 비압축성 유동(비점성) · 112×36×52 (21.0만 셀) · 등급 LOW
풍속 5 m/s · 모의시간 0.05 s · 6 스텝 · 연기원 7개
정성적 시각화이며 공학 해석 도구가 아닙니다 |
| 한국어 UI | PASS | {"hangulChars":192} |
| 시네마틱 버튼 | PASS |  |
| 스모크 레이크 세로7/가로9 | PASS | {"RAKE_V":7,"RAKE_H":9,"BOTH":16} |
| 1인칭 보행·풍동 진입 | PASS | {"fpv":true,"active":true,"inTunnel":true,"emitters":8} |
| 스모크 완드 | PASS | {"emitters":8} |
| 이동 사람 고체(유동 경계) | PASS | {"flags":{"fluid":186831,"car":2180,"fan":20608,"body":45},"speedAt":4.070029151723129,"hud":"내 위치 풍속 4.36 m/s  ·  몸이 흐름을 가르는 중"} |
| 테스트 실행 | FAIL | TimeoutError: page.screenshot: Timeout 30000ms exceeded.
Call log:
[2m  - taking page screenshot[22m
[2m  - waiting for fonts to load... |
