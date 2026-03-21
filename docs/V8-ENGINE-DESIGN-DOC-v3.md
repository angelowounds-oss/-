# V8 Engine Interactive 3D — 설계서 v3.0
> 최종 업데이트: Phase 12/12 완료 (2026.03.21)
> 코드: v8-engine.jsx (1631줄, 67KB)
> 스택: React JSX + Three.js r128

---

## 1. 프로젝트 개요

| 항목 | 내용 |
|------|------|
| 목표 | V8 엔진 작동 원리를 3D 인터렉티브로 교육 |
| 결과물 | 단일 .jsx 파일 (React + Three.js r128) |
| 플랫폼 | 데스크톱 + 모바일 반응형 |
| 총 Phase | 12/12 완료 |

---

## 2. 좌표계 & 기본 규칙

```
좌표계: Y-up (Three.js 기본)
  Y = 위, X = 오른쪽, Z = 앞 (카메라 방향)

크랭크샤프트: Z축 방향으로 누움
크랭크 회전: Z축 둘레 (XY 평면에서 rotation.z)

V뱅크:
  좌뱅크 = Y축에서 +X 방향 45° (bank = +π/4)
  우뱅크 = Y축에서 -X 방향 45° (bank = -π/4)

Z축 간섭 맵 (절대 원칙):
  [웹+CW] [===핀 앞(좌뱅크 로드)===|===핀 뒤(우뱅크 로드)===] [웹+CW]
  → CW/웹은 핀 Z 범위 바깥에만 존재
  → 로드/피스톤은 핀 Z 범위 안에서만 존재
```

---

## 3. 핵심 수식

### 3.1 슬라이더-크랭크 운동학

```
크랭크핀 월드좌표 (rotation.z = θ 후):
  cpx = R·sin(φ - θ)
  cpy = R·cos(φ - θ)
  (φ = 핀 초기 각도, R = throw)

피스톤 핀 거리 (크랭크 중심 → 뱅크 축 방향):
  proj = cp · 축벡터
  perp = cp × 축벡터
  dist = proj + √(L² - perp²)

범위: BDC(L-R) ≤ dist ≤ TDC(L+R)
```

### 3.2 행정 판별 (★ bank 보정 필수)

```
d = (crankDeg - pinDeg + bankDeg) % 720
  d < 180  → 흡입 (피스톤 하강)
  d < 360  → 압축 (피스톤 상승)
  d < 540  → 폭발 (피스톤 하강)
  d < 720  → 배기 (피스톤 상승)
```

### 3.3 밸브 리프트 (sin² 프로파일)

```
eff = (crankDeg - pinDeg + bankDeg) % 720
center = 흡기 90° / 배기 630°
duration = 200° (크랭크 기준)
lift = maxLift × sin²((diff + halfD) / duration × π)
```

### 3.4 연소 모델 (Beretta/Maly 논문 기반)

```
유효 크랭크 360° = TDC (폭발 시작)

Phase A: 스파크 아크    360°~362° (2°)   파란→흰 점
Phase B: 화염핵         362°~372° (10°)  노란 구, 층류 선형 성장
Phase C: 난류 전파      372°~400° (28°)  주황→빨강, 비선형 팽창
Phase D: 연소 완료      400°~420° (20°)  어두운 빨강 → 소멸
```

### 3.5 RPM → 시각적 회전 속도 (비선형 매핑)

```
rpmToVisualRadPerSec(r) = log(r/400 + 1) × 2.5
  500rpm  ≈ 0.6 rad/s
  2000rpm ≈ 4.1 rad/s
  8000rpm ≈ 7.6 rad/s
```

---

## 4. 치수 스펙

### 4.1 크랭크샤프트

```
throw(R): 0.55       R/L 비율: 0.275
메인 저널: R=0.20, L=0.28 × 5개
크랭크핀: R=0.15, L=0.75 × 4개
웹: T=0.18, W=0.42 × 8개
카운터웨이트: R=0.50 (앞뒤 ×1.12), T=0.18 × 4개
필렛: R=0.035 × 10개
스노트: 스텝 R=0.18 + 축 R=0.14
플랜지: R=0.34, 볼트 6개
PIN_Z: [-1.8, -0.6, 0.6, 1.8]
JOURNAL_Z: [-2.4, -1.2, 0, 1.2, 2.4]
PIN_ANGLES: [0, 90, 270, 180] (cross-plane)
```

### 4.2 실린더

```
피스톤: H=0.35, R=0.36, 핀↔하단=0.08
  링 3개 (오프셋: 0.04, 0.09, 0.17)
  밸브 포켓 2개, 핀 보스 2개, 스커트 테이퍼

커넥팅 로드: L=2.0
  I빔 테이퍼 (Shape+Extrude)
  빅엔드: R=0.17 (상/하 분리 + 볼트 2개)
  스몰엔드: R=0.08, 오일 홀 1개

실린더 벽: R=0.42, 반투명 0.12
```

### 4.3 밸브트레인

```
밸브 × 16:
  줄기 R=0.022, L=0.40
  헤드 R=0.09 (튤립형 콘+디스크+시트면)
  키퍼/코렛 + 리테이너
  이중 스프링 (외부 6턴 + 내부 4턴)

캠샤프트 × 2 (SOHC):
  샤프트 R=0.05
  달걀형 로브 (가우시안 노즈 Shape+Extrude)
  베어링 저널 × 4, 스프로켓
```

### 4.4 스파크 플러그 + 연소

```
플러그 × 8:
  전극 R=0.006 + 절연체 R=0.018 + 육각너트 R=0.035 + 본체 R=0.025

GLSL ShaderMaterial:
  FLAME_VERT: Simplex noise 2층 vertex displacement (0.05~0.08)
  FLAME_FRAG: 가솔린 연소 색상 (brightYellow→deepOrange→flameRed)
  SPARKS_VERT/FRAG: 16개 파티클, pointSize ×150, AdditiveBlending
  SPARK_VERT/FRAG: 아크 구 R=0.02, 파란→흰 flicker
```

---

## 5. 크로스플레인 V8 배치

```
핀   각도    Z위치    좌뱅크(+45°)  우뱅크(-45°)  좌로드Z      우로드Z
───────────────────────────────────────────────────────────────
#0   0°     -1.80    #1           #2           -1.9875      -1.6125
#1   90°    -0.60    #3           #4           -0.7875      -0.4125
#2   270°   +0.60    #5           #6           +0.4125      +0.7875
#3   180°   +1.80    #7           #8           +1.6125      +1.9875
```

---

## 6. 완료된 Phase (1~12 전부)

### Phase 1: 씬 기초 ✅
- PerspectiveCamera + 구면좌표 커스텀 OrbitControl (관성 0.08)
- 조명 4개 (ambient + directional ×2 + rim)
- ACES Filmic 톤매핑, exposure 1.2
- 모바일: 핀치 줌, 탭 감지, segment 축소, pixelRatio 1.5

### Phase 2: 크랭크샤프트 ✅
- 메인 저널 5 + 크랭크핀 4 + 웹 8 + CW 4
- 필렛, 스노트, 플랜지+볼트6, 오일홀

### Phase 3+4: 8기통 실린더 ✅
- 피스톤 (포켓+보스+스커트+링3) + 로드 (I빔+캡분리+볼트) × 8
- 크로스플레인 [0,90,270,180] 배치

### Phase 5: 밸브트레인 ✅
- 밸브 16 (튤립형, 이중스프링, 키퍼) + 캠 2 (달걀형로브)

### Phase 6: 연소 시스템 ✅
- GLSL 화염 셰이더 (가솔린 연소 색상: 노랑→주황→빨강)
- 4단계 연소 모델 (Beretta/Maly)
- 불꽃 파티클 16개 (AdditiveBlending)

### Phase 7: 엔진 블록 ✅
- 반투명 V자블록 + 헤드 + 크랭크케이스, 토글 on/off

### Phase 8: UI 패널 ✅
- RPM 슬라이더 (0~8000), 비선형 시각 매핑
- 수동 모드 (RPM=0): 크랭크 슬라이더 + Shift+휠
- 카메라 프리셋 (정면/측면/상단/45°)
- deltaTime 프레임 독립적

### Phase 9: Raycaster ✅
- 부품 클릭/탭 → 정보 패널 (PART_INFO 8종)
- 투명/셰이더 메시 스킵, 부모 5단계 탐색

### Phase 10: 사운드 ✅
- Web Audio API: sawtooth + square + sine (기본음 + 2차/4차 고조파)
- LP 필터 RPM 연동 (200Hz + RPM×0.18)
- 음소거 토글 (기본: 음소거)
- AudioContext cleanup

### Phase 11: Explode 뷰 ✅
- 분리도 슬라이더 0%~100%
- 뱅크 방향 방사형 분리 (실린더 ×2.0, 밸브/스파크 ×2.5, 크랭크 ↓3.0)
- 분리 중 애니메이션 유지

### Phase 12: 폴리싱 ✅
- PMREM 환경맵 (커스텀 환경씬: 상부+하부+측면)
- 금속 반사 품질 향상

---

## 7. 파일 구조 (Phase 12)

```
v8-engine.jsx (1631줄)
├── 상수 (L1~160): COL, CMRA, K, P, VT, SP, BLK, CYLS[], PART_INFO
├── 유틸 (L161~200): getStroke, solve, valveLift, rpmToVisualRadPerSec
├── 빌더 (L201~820):
│   ├── buildCrank (저널+핀+웹+CW+필렛+스노트+플랜지)
│   ├── buildCyl (피스톤+로드+벽)
│   ├── buildValve (이중스프링+키퍼+시트면)
│   ├── mkCamLobeShape + buildCamshaft
│   ├── FLAME_VERT/FRAG + SPARK_VERT/FRAG + SPARKS_VERT/FRAG (GLSL)
│   ├── buildSparkPlug (ShaderMaterial + 파티클)
│   ├── getCombustionState
│   └── buildEngineBlock + mkAxes
├── React (L821~1631):
│   ├── state: mob, info, showDebug, showBlock, rpm, manualDeg, selectedPart, muted, explode
│   ├── ref: R, rpmRef, manualRef, explodeRef, lastTimeRef, raycaster, audioRef, ptrs, ctrl, uiF
│   ├── init (PMREM envMap 포함), updCam, anim(timestamp)
│   ├── 포인터이벤트 (드래그/핀치/탭/휠)
│   ├── toggleDebug, toggleBlock, toggleMute, initAudio
│   ├── setCamPreset, presets[]
│   └── JSX: 좌상단정보+우상단행정+부품정보패널+하단패널(RPM+수동+Explode+카메라+토글)
```

---

## 8. 입력 체계

```
데스크톱:
  마우스 드래그 → 카메라 회전
  스크롤 → 줌 (radius 4~30)
  RPM=0 + Shift+휠 → 크랭크 각도 ±5°
  클릭 → 부품 선택

모바일:
  1손가락 드래그 → 회전
  2손가락 핀치 → 줌
  탭 (<10px, <300ms) → 부품 선택
  핀치→드래그 자동 전환
```

---

## 9. 버그 이력 (교훈)

```
[BUG-1] 피스톤-CW 관통: R/L=0.4 과도 → Z축 간섭맵 원칙 수립
[BUG-2] 행정 라벨 불일치: bank 보정 누락 → V엔진 bank 보정 전역 적용
[BUG-3] Object.assign readonly: Three.js position → .set() 사용
[BUG-4] 메인축 관통: 실제 크랭크에 없는 관통축 → 제거
[BUG-5] PIN_ANGLES 순서: [0,270,90,180]→[0,90,270,180] 표준
[BUG-6] BLK TDZ: PIN_Z 참조 전 선언 → 하드코딩(-2.4/2.4)
[BUG-7] anim timestamp undefined: 첫프레임 스킵 처리
```

---

## 10. 개선 후보

```
[높음] 재질 풀 최적화 (~46개→~20개)
[높음] 밸브 오버랩 시각화
[높음] 4행정 스텝 모드 (교육용 팝업 + 단계별 설명)
[중간] 실린더 헤드 가스켓, 타이밍 체인/벨트
[중간] 크랭크 각도 눈금, 부품 라벨 (3D)
[중간] 단면뷰 (clippingPlanes)
[낮음] 오일팬, 흡배기 매니폴드
[낮음] WebWorker 물리 오프로딩
```
