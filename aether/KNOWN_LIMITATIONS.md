# KNOWN LIMITATIONS

마일스톤마다 갱신합니다. 해결되면 줄을 지우지 않고 "해결(버전)"으로 표시합니다.

| # | 한계 | 영향 | 상태 |
|---|---|---|---|
| L1 | 성능 수치는 이 환경(GPU 없음, SwiftShader)에서 측정 불가 | 모든 fps·ms 목표는 실제 GPU 측정 전까지 ASSUMED | 열림 |
| L2 | npm/PyPI/apt 차단 → esbuild·glslangValidator·meshopt·Basis·three.js·Babylon.js 사용 불가 | 대체 수단 사용(QUESTIONS Q2) | 열림 |
| L3 | 차량은 사용자 제공 GLB, 재배포 권리 미확립 | 개인 사용 전용. 공개 배포 금지 | 사용자 결정으로 유지 |
| L4 | 기존 실시간 CFD: collocated 격자·비점성·발산 최대 47% | M3에서 MAC 격자로 교체 예정, 기존은 fallback | 열림 |
| L5 | 연기가 불투명 물체(관제실 콘솔·관측창 틀)를 뚫고 보임 (M0 Hero 스크린샷) | 장면 깊이 미사용 | M5에서 해결 예정 |
| L6 | WebGPU S1~S3 진단 모듈은 원본 그대로이며 실시간 경로와 무관 | 진단용 | 유지 |
