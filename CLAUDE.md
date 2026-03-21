# V8 Engine Interactive 3D — Claude Code 프로젝트

## 프로젝트 개요

V8 엔진 4행정 사이클 교육용 3D 인터렉티브. 모든 부품을 코드로 모델링하고,
물리 기반 연소/밸브/크랭크 시뮬레이션을 단일 파일 React+Three.js 아티팩트로 구현.

- **스택**: React JSX + Three.js r128 (CDN import)
- **원래 환경**: Claude.ai 아티팩트 (브라우저 내 렌더링)
- **현재 파일**: `src/v8-engine.jsx` (1631줄, 67KB)
- **설계서**: `docs/V8-ENGINE-DESIGN-DOC-v3.md`
- **Phase 12/12 전부 완료**

---

## 핵심 제약 사항 (반드시 지킬 것)

### Three.js r128 제약
- `THREE.CapsuleGeometry` 없음 (r142에서 도입) → CylinderGeometry 대체
- `OrbitControls` import 불가 → 커스텀 구면좌표 카메라 직접 구현
- 외부 3D 모델(GLTF 등) 로드 불가 → 모든 부품 Geometry 조합으로 모델링
- `attribute vec3 color` 자동 주입 → 커스텀 attribute는 `aColor` 등으로 리네임
- Global `new THREE.Vector3()` 호출은 init() 안에서만 (script load 시 불가)

### 물리/기하학 원칙
- **Z축 간섭 맵**: CW/웹은 핀 Z범위 바깥, 로드/피스톤은 핀 Z범위 안에서만 존재
- **행정 판별**: `d = (crankDeg - pinDeg + bankDeg) % 720` — bank 보정 필수
- **크로스플레인 PIN_ANGLES**: `[0, 90, 270, 180]` (인덱스 0~3)
- **R/L = 0.275** (throw=0.55, rod=2.0)

### 코드 스타일
- 단일 파일 (export default function 하나)
- React state는 UI만, Three.js 객체는 전부 useRef
- anim 루프에서 setState 최소화 (8프레임마다)
- deltaTime 프레임 독립적 (상한 50ms)

---

## 완료된 기능 (Phase 1~12)

| Phase | 내용 | 핵심 구현 |
|-------|------|----------|
| 1 | 씬 기초 | 카메라(구면좌표+관성), 조명4, ACES톤매핑, 모바일 대응 |
| 2 | 크랭크샤프트 | 저널5+핀4+웹8+CW4+필렛+스노트+플랜지+오일홀 |
| 3+4 | 8기통 실린더 | 피스톤(포켓+보스+스커트)+로드(테이퍼I빔+캡+볼트)×8 |
| 5 | 밸브트레인 | 밸브16(이중스프링+키퍼)+캠2(달걀형로브+저널) |
| 6 | 연소 시스템 | GLSL ShaderMaterial, 4단계 연소(Beretta/Maly), 불꽃 파티클 |
| 7 | 엔진 블록 | 반투명 V자블록+헤드+케이스, 토글 버튼 |
| 8 | UI 패널 | RPM슬라이더(0~8000), 수동모드, 카메라프리셋, deltaTime |
| 9 | Raycaster | 부품클릭→정보패널 (PART_INFO 8종), 탭감지 |
| 10 | 사운드 | Web Audio 3오실레이터+LP필터, RPM연동, 음소거토글 |
| 11 | Explode | 분리도 슬라이더(0~100%), 방사형 분리, 작동 유지 |
| 12 | 폴리싱 | PMREM envMap(커스텀 환경씬), 금속 반사 |

---

## 검증 완료 항목

```
[✓] Z축 분리: 모든 로드Z에 크랭크 부품 없음
[✓] XY 클리어런스: 피스톤하단 0.933 > CW 0.560
[✓] 행정 사이클: 8기통 TDC/BDC 정합, 운동방향 일치
[✓] 연소 타이밍: 8기통 전부 폭발행정 내 완료
[✓] deltaTime: 프레임독립적, 상한50ms
[✓] 메인축 제거: 관통축 없음 (실제 크랭크 구조)
[✓] anim timestamp: 첫프레임 undefined 방어
[✓] 괄호/중괄호 균형: Braces 405/405, Parens 1048/1048
```

---

## 파일 구조

```
v8-engine-project/
├── CLAUDE.md                          ← 이 파일
├── src/
│   └── v8-engine.jsx                  ← 메인 소스 (1631줄)
└── docs/
    └── V8-ENGINE-DESIGN-DOC-v3.md     ← 상세 설계서
```

---

## 치수 스펙 요약

```
크랭크: throw=0.55, 저널R=0.20, 핀R=0.15, CW_R=0.50
피스톤: H=0.35, R=0.36, 링3개
커넥팅로드: L=2.0, 빅엔드R=0.17, I빔
밸브: 줄기R=0.022, 헤드R=0.09, 이중스프링
캠: 달걀형 로브, R=0.05, 크랭크/2 속도
PIN_Z: [-1.8, -0.6, 0.6, 1.8]
PIN_ANGLES: [0, 90, 270, 180] (cross-plane)
LEFT_BANK = +π/4, RIGHT_BANK = -π/4
```

---

## 연소 셰이더 (GLSL) 스펙

```
화염 색상 (가솔린 연소 — 고속카메라 레퍼런스):
  코어: brightYellow (1.0, 0.85, 0.25)
  중간: deepOrange (1.0, 0.5, 0.08)
  외곽: flameRed (0.85, 0.18, 0.02)
  소멸: dimRed (0.45, 0.08, 0.01)

화염 vertex: noise displacement 0.05~0.08, 속도 ×1.8/3.0
화염 fragment: opacity ×0.6, AdditiveBlending
스파크 아크: 파란→흰, flickersin(t*60), opacity ×0.7
불꽃 파티클: 16개, pointSize ×150, 속도 0.2~0.6, opacity ×0.55
```

---

## 버그 이력 (재발 방지)

```
[BUG-1] 피스톤-CW 관통 → Z축 간섭맵 원칙 수립
[BUG-2] 행정 라벨 불일치 → bank 보정 필수 (V엔진 전역)
[BUG-3] Object.assign readonly → Three.js position은 .set() 사용
[BUG-4] 메인축 관통 → 실제 크랭크에 관통축 없음
[BUG-5] PIN_ANGLES 순서 → [0,90,270,180] 표준 크로스플레인
[BUG-6] BLK TDZ → PIN_Z 참조 전 선언 → 하드코딩
[BUG-7] anim timestamp undefined → 첫프레임 스킵 처리
```

---

## 개선 후보 (미구현)

```
[높음] 재질 풀 최적화 (~46개→~20개)
[높음] 밸브 오버랩 시각화
[높음] 4행정 스텝 모드 (교육용)
[중간] 실린더 헤드 가스켓, 타이밍 체인
[중간] 크랭크 각도 눈금, 부품 라벨 (3D)
[낮음] 오일팬, 흡배기 매니폴드, 단면뷰
[낮음] WebWorker 오프로딩
```

---

## 응답 규칙 (한국어)

- 한국어 존댓말 사용
- 의례적 칭찬/감탄사 금지, 바로 본론
- 코드 수정 시 정확한 줄 번호 참조
- 수정 후 반드시 괄호 균형 검증
- Three.js r128 제약 항상 확인
