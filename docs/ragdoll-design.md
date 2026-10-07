# 랙돌(Ragdoll) 설계 지침서

> 대상: `neon-city-v9` 브랜치, three.js r180 + Rapier `@dimforge/rapier3d-compat` **0.21.0**
> 범위: 설계만 다룬다. 이 문서대로 구현하면 되도록 데이터·수식·연결 지점·검증 방법까지 적는다.
> 줄 번호는 작성 시점 기준이므로 함수 이름으로 찾는다.

---

## 0. 목표와 비목표

### 목표
1. 사람(NPC·플레이어)이 죽거나 크게 맞을 때 **관절마다 따로 꺾이는 물리 랙돌**로 쓰러진다.
2. 계단·난간·차 보닛·벽·건물 바닥(층 스트리밍 포함)·지형·호수 경사면과 **실제로 충돌**한다.
3. 죽기 직전의 **움직임이 이어진다**(달리다 죽으면 앞으로 구르고, 총 맞은 방향으로 밀린다).
4. 죽지 않은 넉다운(차에 살짝 치임, 폭발 여파, 밀치기, 고공 낙하 기절)은 랙돌 후 **다시 일어난다**.
5. 물에서는 **부력**으로 뜬다.
6. 프레임 부담은 **개수 상한 + 빠른 정지(굳히기)** 로 통제한다.

### 비목표(이번 범위 밖)
- 근육으로 균형을 잡는 "액티브 랙돌"(Euphoria식)은 하지 않는다. 넉다운 때 약한 근육 긴장(모터)만 쓴다.
- 신체 절단, 피 웅덩이 시뮬레이션은 하지 않는다.
- 저장(세이브)에 시체 자세를 남기지 않는다.

---

## 1. 현재 코드 현황(설계의 전제)

| 항목 | 현재 상태 | 위치 |
|---|---|---|
| 물리 엔진 | Rapier 0.21, 고정 스텝 1/60 s, 프레임당 최대 4 서브스텝, 중력 −9.81 | `src/physics.js` `PHYS`, `Physics.step` |
| 충돌 그룹 | `GR = { STATIC:1, VEH:2, CHAR:4, PROP:8, OBJ:16, GLASS:32 }`, `grp(member, filter)` | `src/physics.js` |
| 정적 충돌체 | 지면 타일(호수 구멍), 호수 경사면, 도시 박스·원기둥, 지형 트라이메시 | `initGround`, `addStatic`, `addTerrainPhysics` |
| 건물 내부 충돌체 | 층이 로드될 때 `world.colliders.addBox` → `sink`(Physics)로 Rapier에 추가, 층 언로드 때 `removeBox` | `building.js` `buildFloor` / `dropFloor` |
| 플레이어 이동 | Rapier 키네마틱 캐릭터 컨트롤러(캡슐) | `src/character.js` |
| NPC 이동 | Rapier를 쓰지 않는 2D 이동 + `floorY` | `src/human.js` |
| 현재 "넉백" | 몸 전체를 한 덩어리로 날리는 `ragdoll(vx,vz,up)` → `stepKnock` | `human.js` |
| 사망 | `die()` → `U_Death01` 클립 재생 | `human.js` |
| 뼈대 | Mixamo 49개 뼈, 이름에서 `mixamorig` 접두사 제거 후 `m.bones[이름]`. **각 뼈의 로컬 +Y 축이 다음 뼈를 향한다**(예: `LeftForeArm` 이동값 (0, 23.16, 0)) | `assets.js` `buildSoldier` |
| 뼈대 단위 | 원본은 cm 단위(`Hips` y≈106). 래퍼에서 `A.soldierScale`로 키 1.82 m로 맞춤. **런타임 월드 좌표만 쓰고 길이를 하드코딩하지 않는다** | `assets.js` |
| 애니메이션 | `AnimationMixer`, `playOnce/stopOnce`, `reactT`로 일회성 클립 보호 | `assets.js`, `human.js animate` |
| 절차적 사람 | 에셋 로드 실패 시 `models.js` 박스형 사람 → **랙돌 미지원, 기존 `stepKnock` 유지** | `models.js buildHuman` |

### Rapier 0.21 관절 기능(설계 제약)
- `JointData.revolute(anchor1, anchor2, axis)` → `RevoluteImpulseJoint.setLimits(min, max)` **지원**.
- `JointData.spherical(anchor1, anchor2)` → **각도 제한 API 없음**. 축별 모터(`configureMotorPosition/Velocity(axis, …)`)만 있다.
- `ImpulseJoint.setContactsEnabled(false)`로 관절로 이어진 두 몸체끼리의 충돌을 끌 수 있다.
- `createMultibodyJoint`(축소 좌표 방식)도 있다. 안정성은 좋지만 제한·모터 API가 다르다. → **P0에서 벤치마크로 비교 후 결정**(6절).
- 결론: **무릎·팔꿈치 = revolute + 제한**, **어깨·엉덩이·척추·목 = spherical + 직접 만든 원뿔/비틀림 제한(4.4절)**.

---

## 2. 전체 구조

```
src/ragdoll.js   (신규)
  ├─ RAG_SEGMENTS    몸 조각 정의표(뼈 매핑, 모양, 질량 비율)
  ├─ RAG_JOINTS      관절 정의표(종류, 축, 제한각)
  ├─ class Ragdoll   한 사람의 랙돌 인스턴스(몸체·관절·뼈 동기화·상태)
  └─ class RagdollSystem   전역 관리자(생성 예산, 갱신 순서, 정지·굳히기, 일어나기, 부력)

연결 지점: human.js / game.js / physics.js / building.js / society.js / engine.js(품질표)
```

### 2.1 상태 기계(사람 1명 기준)

```
 ANIM ──(사망/넉다운 트리거)──▶ SIM ──(정지 감지 또는 시간 초과)──▶ SETTLED
                                  │                                   │
                                  │(넉다운이고 살아 있음)              ├─(사망) ▶ BAKED(뼈 고정, 물리 제거)
                                  └──────────────▶ GETUP ◀────────────┘(살아 있음)
                                                    │
                                                    ▼
                                                   ANIM
```

| 상태 | 의미 | 매 프레임 비용 |
|---|---|---|
| `ANIM` | 기존 애니메이션 | 기존과 같음 |
| `SIM` | 물리 몸체 12개가 움직이고 뼈가 따라감 | 물리 + 뼈 동기화 |
| `SETTLED` | 멈춤 판정 직후 0.3 s 유예 | 물리(대부분 잠듦) |
| `BAKED` | 물리 제거, 뼈 자세 고정(시체) | 0 |
| `GETUP` | 랙돌 자세에서 애니메이션 자세로 0.8 s 블렌드 | 뼈 블렌드만 |

---

## 3. 몸 조각(세그먼트) 설계

### 3.1 조각 표 (12개)

질량은 키 1.82 m·체중 75 kg 기준이다. 비율은 Winter 인체측정 표를 단순화한 값이다.

| id | 이름 | 시작 뼈 → 끝 뼈(길이 측정) | 모양 | 반지름(m) | 질량(kg) | 부모 조각 |
|---|---|---|---|---|---|---|
| 0 | pelvis | `Hips` → `Spine` | 가로 캡슐(좌우 엉덩이 관절 사이) | 0.12 | 11.0 | — (루트) |
| 1 | abdomen | `Spine` → `Spine2` | 캡슐(뼈 축) | 0.12 | 10.0 | pelvis |
| 2 | chest | `Spine2` → `Neck` | 캡슐(뼈 축) | 0.14 | 16.0 | abdomen |
| 3 | head | `Neck` → `Head` 끝(Head에서 +0.18 m) | 구 | 0.11 | 5.5 | chest |
| 4 | upperArmL | `LeftArm` → `LeftForeArm` | 캡슐 | 0.055 | 2.1 | chest |
| 5 | foreArmL | `LeftForeArm` → `LeftHand` 끝(Hand에서 +0.10 m) | 캡슐 | 0.045 | 1.6 | upperArmL |
| 6 | upperArmR | `RightArm` → `RightForeArm` | 캡슐 | 0.055 | 2.1 | chest |
| 7 | foreArmR | `RightForeArm` → `RightHand` 끝 | 캡슐 | 0.045 | 1.6 | upperArmR |
| 8 | thighL | `LeftUpLeg` → `LeftLeg` | 캡슐 | 0.075 | 7.5 | pelvis |
| 9 | shinL | `LeftLeg` → `LeftFoot` (+발 0.12 m 포함) | 캡슐 | 0.055 | 4.6 | thighL |
| 10 | thighR | `RightUpLeg` → `RightLeg` | 캡슐 | 0.075 | 7.5 | pelvis |
| 11 | shinR | `RightLeg` → `RightFoot` (+발) | 캡슐 | 0.055 | 4.6 | thighR |

합계 74.1 kg이다. 몸체마다 `setAdditionalMass`로 질량을 직접 지정하고, 충돌체 밀도는 0으로 둔다.

### 3.2 모양 계산(런타임)
1. 생성 순간 `root.updateWorldMatrix(true, true)` 후 각 뼈의 월드 위치 `P(bone)`를 얻는다.
2. 캡슐 조각: `a = P(시작뼈)`, `b = P(끝뼈)` 또는 끝 연장점이다.
   - 길이 `L = |b − a|`, 반높이 `half = max(0.01, L/2 − r)`.
   - 중심 `c = (a + b)/2`.
   - 방향: 몸체 로컬 +Y가 `(b − a)` 방향이 되도록 회전한다. **뼈의 월드 회전을 그대로 쓴다**. Mixamo 뼈는 로컬 +Y가 자식 방향이라 축이 이미 맞는다.
3. pelvis만 예외로, 가로 캡슐이다. 축은 `P(LeftUpLeg) − P(RightUpLeg)` 방향이고 중심은 `P(Hips)`다. 몸체 회전은 Hips 뼈의 월드 회전을 쓰고, 충돌체 쪽에 로컬 회전(+Y→+X)을 준다.
4. head는 구이고 중심은 `P(Head) + (머리 위 방향) × 0.09`이다.
5. **반지름 축소**: 생성 직후 0.12 s 동안 반지름을 85%로 쓴다. 벽에 붙어 죽을 때 몸체가 벽에 박혀 튀는 것을 막는 용도다. 그 뒤 원래 크기로 되돌린다. 충돌체는 `setRadius`가 없으니 처음부터 두 개를 만들고 하나를 지우는 방식을 쓴다. 대안은 4.6절의 최대 분리 속도 제한만 쓰는 것이다.

### 3.3 물리 재질
| 항목 | 값 | 이유 |
|---|---|---|
| friction | 0.8 | 미끄러짐 억제(옷과 바닥) |
| restitution | 0.0 (head 0.05) | 사람은 튀지 않는다 |
| linearDamping | 0.05(공중) → 0.6(지면 접촉 1 s 후) | 빠른 정지 |
| angularDamping | 0.9 → 3.0(지면 접촉 1 s 후) | 떨림 억제 |
| CCD | pelvis·chest·head만 `setCcdEnabled(true)` | 차에 치여 빠를 때 바닥을 뚫는 것 방지 |
| 추가 솔버 반복 | `setAdditionalSolverIterations(2)` (pelvis, chest) | 관절 늘어짐 방지 |
| canSleep | true, 정지 판정은 직접 함(4.7절) | |

### 3.4 충돌 그룹(신규 `RAG`)

`physics.js`에 `GR.RAG = 64`를 추가한다.

| 그룹 | 멤버 | 충돌 대상(filter) 변경 |
|---|---|---|
| RAG(신규) | 랙돌 조각 | `STATIC \| VEH \| PROP \| OBJ \| GLASS \| RAG` |
| VEH | 차량 | 기존 + **RAG** (차가 시체를 밀고 밟는다) |
| PROP / OBJ | 소품 | 기존 + **RAG** |
| CHAR | 플레이어 캡슐 | **변경 없음(RAG 제외)**. 시체에 걸려 플레이어가 흔들리지 않게 한다 |
| 레이캐스트 `RAY_DEFAULT` | — | **RAG 제외 유지**. 시체 사격은 별도 레이로 처리(9.3절) |

- 같은 랙돌 안에서 **관절로 이어진 두 조각**은 `joint.setContactsEnabled(false)`로 충돌을 끈다.
- 이어지지 않은 조각끼리(예: 팔과 가슴)는 충돌을 켠다. 팔이 몸통을 관통하지 않게 하기 위해서다. 단, 생성 순간 이미 겹쳐 있으면 튀므로 **생성 시 겹침 검사**를 한다. 겹친 쌍은 0.3 s 동안 `ActiveCollisionTypes`/충돌 이벤트로 무시하거나, 간단히 그 쌍의 반지름 축소 상태를 유지한다.
- 다른 사람 랙돌끼리는 충돌한다(시체가 쌓인다).

---

## 4. 관절 설계

### 4.1 기준 자세(rest)와 좌표
- **기준 자세 = 바인드 포즈(T 포즈)**. `SkinnedMesh.skeleton.boneInverses`로 바인드 월드 회전을 복원해 한 번만 계산하고 캐시한다(모든 사람이 같은 뼈대).
- 관절마다 `qRel0 = inverse(qParentBind) × qChildBind`(부모 조각 기준 자식의 기준 상대 회전)를 저장한다.
- 비틀림 축 = **자식 뼈의 로컬 +Y**(뼈 길이 방향)이다.
- 앵커: 생성 순간 관절 위치(자식 시작 뼈의 월드 위치)를 부모·자식 몸체 로컬 좌표로 각각 변환해 `anchor1`, `anchor2`로 쓴다.

### 4.2 관절 표

각도 단위는 도이고, 부호는 4.5절 검증 절차로 확정한다.

| 관절 | 부모 → 자식 | Rapier 종류 | 흔들림(swing) 제한 | 비틀림(twist) 제한 | 비고 |
|---|---|---|---|---|---|
| 허리 | pelvis → abdomen | spherical + 직접 제한 | 앞 40 / 뒤 20 / 옆 25 (타원 원뿔) | ±20 | |
| 가슴 | abdomen → chest | spherical + 직접 제한 | 앞 30 / 뒤 15 / 옆 20 | ±25 | |
| 목 | chest → head | spherical + 직접 제한 | 앞 50 / 뒤 40 / 옆 35 | ±60 | |
| 어깨 L/R | chest → upperArm | spherical + 직접 제한 | 원뿔 100 (T 포즈 수평 기준. 팔을 내린 자세 90°가 안에 들어감) | ±70 | |
| 팔꿈치 L/R | upperArm → foreArm | **revolute** | — | — | 축 = upperArm 로컬 X(검증), 0 ~ 145 굽힘, 한쪽으로만 |
| 엉덩이 L/R | pelvis → thigh | spherical + 직접 제한 | 앞(굴곡) 120 / 뒤(신전) 20 / 바깥 45 / 안 15 | ±30 | |
| 무릎 L/R | thigh → shin | **revolute** | — | — | 축 = thigh 로컬 X(검증), 0 ~ 150, 뒤로만 굽힘 |

어깨뼈(`LeftShoulder`/`RightShoulder`)는 시뮬레이션하지 않고 chest에 고정한다(9.1절).

### 4.3 관절 생성 코드 골격
```js
// 팔꿈치/무릎
const jd = R.JointData.revolute(a1, a2, axisInParent);
jd.limitsEnabled = true; jd.limits = [minRad, maxRad];
const j = world.createImpulseJoint(jd, parentBody, childBody, true);
j.setContactsEnabled(false);

// 어깨·엉덩이·척추·목
const js = world.createImpulseJoint(R.JointData.spherical(a1, a2), parentBody, childBody, true);
js.setContactsEnabled(false);
// 근육 긴장(사망 시 0, 넉다운 시 약하게): 축별 위치 모터 → 4.6절
```

### 4.4 원뿔·비틀림 제한(직접 구현) — 핵심 알고리즘

Rapier spherical에 제한이 없으므로 **매 물리 스텝 전에**(`Physics.step`의 `pre` 콜백) 다음을 한다.

1. 현재 상대 회전: `qRel = inverse(qParent) × qChild`
2. 기준 대비 변화: `qD = inverse(qRel0) × qRel`
3. **swing-twist 분해**(비틀림 축 `t` = 자식 로컬 +Y):
   ```
   p = dot((qD.x, qD.y, qD.z), t) · t
   twist = normalize(quat(p.x, p.y, p.z, qD.w))    // 길이 0이면 identity
   swing = qD × inverse(twist)
   twistAng = 2·atan2(dot(twist.xyz, t), twist.w)
   swingAxis, swingAng = toAxisAngle(swing)        // swingAxis ⟂ t
   ```
4. 타원 원뿔 제한각: swing 축을 부모 기준 앞/옆 성분으로 나눠(`sx`, `sz`) 해당 방향 제한 `(Lx, Lz)`로 타원 반지름을 구한다.
   ```
   limit = 1 / sqrt((cosφ/Lx)^2 + (sinφ/Lz)^2)    // φ = swing 방향각
   ```
   앞·뒤 제한이 다르면 `sx` 부호로 Lx를 고른다.
5. 위반량 `e = swingAng − limit`(>0일 때)과 `et = |twistAng| − twistLimit`(>0일 때)을 구한다.
6. 교정(속도 수준, Baumgarte 방식):
   - 위반 축(월드) `n = qParent · (qRel0 · swingAxis)`(비틀림은 `qChild · t`)
   - 상대 각속도 `w = ωchild − ωparent`. 위반이 커지는 방향 성분 `wn = dot(w, n)`이 양수면 제거한다.
   - 목표 교정 각속도 `Δ = wn + β·e/dt` (β = 0.2, 최대 8 rad/s)
   - 두 몸체 관성 비율로 나눠 적용한다(근사: 질량 비 사용).
     ```
     kc = mParent / (mParent + mChild)
     ωchild  -= n · Δ · kc
     ωparent += n · Δ · (1 − kc)
     ```
   - `body.setAngvel(…, true)`로 반영한다.
7. 비용: 스피어리컬 관절 8개 × 쿼터니언 연산 수십 회 = 랙돌 1개당 수 μs. 무시할 수준이다.

> 대안: P0에서 멀티바디 관절(`createMultibodyJoint`)의 축별 제한이 동작하면 직접 제한을 버리고 그쪽을 쓴다. 결정 기준은 6.2절.

### 4.5 축·부호 검증 절차(구현 전 필수)
1. 디버그 함수 `debugRagdollAxes(human)`를 만든다. T 포즈 사람을 공중에 띄우고 중력을 끈다.
2. 관절마다 자식 몸체에 +축 방향 각속도 1 rad/s를 0.5 s 준다.
3. 스크린샷 + 로그(swing/twist 각)로 확인한다.
   - 팔꿈치·무릎이 **해부학적으로 맞는 방향**으로 접히는지 확인한다. 반대면 축 부호를 뒤집는다.
   - 엉덩이 "앞" 방향이 실제 다리를 앞으로 드는 방향인지 확인한다.
4. 결과를 `RAG_JOINTS` 표에 축 부호로 고정한다. 왼쪽과 오른쪽은 대칭이므로 축 X 부호가 반대일 수 있다.

### 4.6 근육 긴장(모터)
| 상황 | spherical 모터(축별 `configureMotorPosition(axis, 0, k, d)` → 기준 자세 쪽 스프링) | revolute 모터 |
|---|---|---|
| 사망(완전 이완) | k = 0, d = 0.6 (관절 마찰만) | k = 0, d = 0.4 |
| 사망 직후 0.25 s | k = 8, d = 1.0 (갑자기 흐물거리지 않게 감쇠) | 같은 비율 |
| 넉다운(살아 있음) | k = 25, d = 3 — **목표 = 넉다운 순간 애니메이션 자세의 상대 회전**(기준 자세 아님) | k = 15, d = 2 |
| 수중 | k = 4, d = 1.5 | |

- spherical 모터의 목표는 축별 각도라 "임의 자세"를 정확히 표현하기 어렵다. 넉다운용은 4.4절과 같은 방식으로 **목표 상대 회전과의 차이를 직접 각속도로 보정하는 PD**로 구현한다: `Δω = k·(축각 오차) − d·(상대 각속도)`. 이 방식이 더 단순하고 예측 가능하다.
- **최대 교정 속도 제한**: `world.integrationParameters`의 최대 분리 보정 속도(`maxCorrectiveVelocity` 계열, 0.21 이름은 P0에서 확인)를 랙돌 생성 직후 1 s 동안 2 m/s로 낮춘다. 겹친 채 생성돼 폭발적으로 튀는 것을 막는다.

### 4.7 정지 판정
- 모든 조각에 대해 `|v| < 0.15 m/s` 그리고 `|ω| < 0.35 rad/s` 상태가 **0.6 s 연속**되면 `SETTLED`로 바꾼다.
- 또는 **생성 후 6 s**(물속은 20 s)가 지나면 강제로 `SETTLED`로 바꾼다.
- `SETTLED` 0.3 s 뒤:
  - 사망이면 `BAKED`로 넘긴다. 몸체·관절·충돌체를 지우고 뼈는 마지막 자세로 둔다.
  - 살아 있으면 `GETUP`으로 넘긴다.

---

## 5. 생성(스폰) 절차

### 5.1 `RagdollSystem.spawn(h, opt)`
```
opt = {
  cause: 'bullet' | 'explosion' | 'vehicle' | 'melee' | 'fall' | 'shove',
  alive: boolean,              // 넉다운이면 true
  hit: { seg, point:Vector3, dir:Vector3, j:number } | null,   // 총알/근접
  blast: { x, y, z, r, power } | null,
  carVel: { x, y, z } | null,
  bodyVel: { x, y, z }         // 사람 자체 속도(플레이어는 Character 속도)
}
```
1. **예산 검사**(7.1절)에 걸리면 레거시 경로(`stepKnock`/`U_Death01`)로 처리하고 끝낸다.
2. **거리 검사**: 카메라에서 60 m 넘으면 레거시 경로로 간다(어차피 잘 안 보인다).
3. **위치 검사**: 차 안(`h.inVehicle`), 승강기 안(이동 중), 앉은 상태(`m.sit`)면 레거시 경로로 간다. 앉은 사람은 3.3절 상태로 바로 쓰러뜨려도 되지만, 의자 충돌체가 없어 바닥으로 미끄러지므로 제외한다.
4. 애니메이션을 정지한다: `h.m.stopOnce()`, 모든 액션 weight 0, 그리고 `mixer.update`를 더 이상 호출하지 않는다(`h.rag` 플래그로 `animate` 우회).
5. **현재 뼈 월드 자세로 몸체 12개를 만든다**(3.2절).
6. 관절 11개를 만든다(4.3절).
7. **초기 속도**(5.2절)를 준다.
8. **충격**(5.3절)을 준다.
9. `h.rag = ragdoll`. 상태는 `SIM`이다.

### 5.2 초기 속도(움직임 이어가기)
- 매 프레임 `ANIM` 상태의 사람은 **직전 프레임 12개 뼈 월드 위치**를 링버퍼에 저장한다. 비용이 크므로 카메라 40 m 안의 사람만, 그리고 `Float32Array(36)` 하나만 쓴다.
- 조각 선속도 = `(P_now − P_prev) / dtPrev`. 저장이 없으면 `bodyVel`을 쓴다.
- 모든 조각에 공통으로 `bodyVel`(사람 이동 속도, 플레이어는 vx, vy, vz)을 더한다.
- 상한: 조각 속도 30 m/s.

### 5.3 원인별 충격량(J, N·s)

| 원인 | 대상 조각 | 크기 | 방향 |
|---|---|---|---|
| 총알 | 맞은 조각(9.2절 판정) | `min(60, damage × 0.9)`. 샷건은 펠릿 합산, 저격총은 상한 60 | 총알 진행 방향 + 위로 0.1 |
| 근접(주먹) | chest(머리 판정이면 head) | 45 | 공격자 → 대상 수평 방향 + 위로 0.2 |
| 폭발 | 모든 조각 | `m_seg × 14 × k`, `k = (1 − d/r)^1.5` | 폭심 → 조각 중심, 위 성분 최소 0.4 |
| 차량 | 범퍼 높이(0~1.0 m) 안의 조각 | `m_seg × |v_car| × 0.9` | 차 속도 방향 |
|  | chest, head | `m_seg × 2.5` | 위쪽(보닛 위로 넘어가는 회전) |
| 밀치기(society) | chest | 35 | 수평 |
| 추락(플레이어) | — | 충격 없음, 초기 속도만 | |

`body.applyImpulseAtPoint(J, point, true)`를 쓴다. 맞은 지점이 있으면 회전이 자연스럽게 생긴다.

---

## 6. 물리 스텝 통합

### 6.1 순서(한 프레임)
```
game.update(dt)
 ├─ 사람 AI/애니메이션 (h.rag 상태인 사람은 animate 건너뜀)
 ├─ phys.step(dt, pre)      ← pre 안에서 ragdolls.preStep(PHYS.dt)
 │     · 원뿔/비틀림 제한(4.4)
 │     · 넉다운 근육 PD(4.6)
 │     · 부력/물 저항(8절)
 │     · 지면 접촉 후 감쇠 상향(3.3)
 ├─ ragdolls.postStep()      ← 정지 판정(4.7), 상태 전환
 └─ ragdolls.syncBones()     ← 몸체 → 뼈(9절), h.x/h.y/h.z 갱신
```
`Physics.step(dt, pre, list)`는 이미 `pre(PHYS.dt)`를 서브스텝마다 호출한다. 기존 `pre`(차량 구동)를 감싸서 랙돌 `preStep`을 함께 호출한다.

### 6.2 P0 벤치마크(구현 첫 단계, 결정용)
Node에서 `rapier3d-compat`으로 다음 장면을 만든다.
- 평면 지면, 박스 장애물 20개, 랙돌 N개(N = 1, 4, 8, 12, 16)를 높이 3 m에서 떨어뜨린다.
- 300 스텝 평균·최대 `world.step` 시간을 측정한다.
- 같은 장면을 **impulse joint + 직접 제한** 방식과 **multibody joint** 방식으로 각각 돌린다.
- 기록 항목: 스텝 시간, 관절 벌어짐(앵커 간 거리 평균/최대), 제한 위반 최대각, 정지까지 걸린 시간.
- 결정 기준:
  - 8개 기준 평균 ≤ 1.0 ms, 최대 ≤ 2.5 ms(데스크톱 Node)면 합격.
  - 두 방식 중 관절 벌어짐이 작고 시간이 합격인 쪽을 택한다.
- 결과를 이 문서 부록 B에 표로 남긴다.

---

## 7. 성능 예산

### 7.1 동시 랙돌 상한(`engine.js` 품질표에 `ragdolls` 추가)
| 품질 | 상한 `SIM`+`SETTLED` | 생성 거리 |
|---|---|---|
| LOW | 3 | 35 m |
| MEDIUM | 5 | 50 m |
| HIGH | 8 | 60 m |
| ULTRA | 10 | 70 m |

- 상한에 걸렸을 때:
  1. `SETTLED` 중인 것이 있으면 즉시 `BAKED`로 넘기고 자리를 만든다.
  2. 없으면 **가장 오래된 `SIM`** 을 강제 정지시킨다. 단, 생성 후 1.5 s 미만이면 건드리지 않는다.
  3. 그래도 자리가 없으면 레거시 경로를 쓴다.
- 폭발처럼 한 번에 여러 명이 생길 때는 **폭심에서 가까운 순**으로 랙돌을 배정하고, 나머지는 레거시로 처리한다.

### 7.2 프레임 시간 감시
- `G.dbg.ragMs`: `preStep`·`syncBones`·물리 스텝 중 랙돌 몫(전후 차이)을 이동 평균으로 기록하고, FPS 표시(F 설정)에 한 줄 추가한다.
- 적응 하향: 최근 2 s 평균 프레임이 33 ms를 넘으면 상한을 일시적으로 −2(최소 2) 줄이고, 5 s 동안 25 ms 아래면 되돌린다.

### 7.3 메모리·생성 비용
- 몸체/관절 생성은 사망 순간 1회이고 약 0.1~0.3 ms다.
- 기준 자세 회전(`qRel0`), 조각 반지름 표는 전역 캐시를 쓴다.
- 임시 벡터/쿼터니언은 모듈 상단 재사용 객체를 쓴다(GC 방지).

---

## 8. 물(부력·저항)

- 대상: 조각 중심이 `G.waterAt(x, z)` 안이고 `y < w.y + r`인 조각이다.
- 잠긴 비율 `s = clamp((w.y − (y − r)) / (2r), 0, 1)`
- 부력: `F = ρ · g · V · s · 1.05`(ρ = 1000, V = 캡슐 부피). 사람이 겨우 뜨도록 1.05를 곱한다.
- 저항: 선속도 `−v · 4 · s`(질량 곱), 각속도 감쇠 +2 · s
- 물에 처음 닿는 순간 `addRipple(x, z, clamp(|vy|/4, 1, 3))`와 첨벙 소리를 낸다(조각당 1회, 랙돌당 0.3 s 쿨다운).
- 정지 판정 시간 상한은 20 s다. 물 위에 떠 있는 시체는 `BAKED` 대신 **"부유 BAKED"** 로 둔다. 물리를 끄고 파도에 맞춰 pelvis 높이를 `sin`으로 ±3 cm 흔든다.

---

## 9. 뼈 동기화(몸체 → 메시)

### 9.1 뼈 매핑
| 뼈 | 소스 |
|---|---|
| Hips | pelvis 몸체(위치 + 회전) |
| Spine | abdomen 몸체 |
| Spine1 | abdomen과 chest 상대 회전의 **50% 보간**(slerp) |
| Spine2 | chest 몸체 |
| Neck | chest와 head 상대 회전의 50% |
| Head | head 몸체 |
| Left/RightShoulder | chest에 고정(사망 순간의 chest 기준 상대 회전 유지) |
| Left/RightArm | upperArm 몸체 |
| Left/RightForeArm | foreArm 몸체 |
| Left/RightHand, 손가락 | 사망 순간 로컬 회전 유지(손이 살짝 펴지도록 손가락 굽힘 50%로 lerp) |
| Left/RightUpLeg | thigh 몸체 |
| Left/RightLeg | shin 몸체 |
| Left/RightFoot, ToeBase | 사망 순간 로컬 회전 유지 |

### 9.2 변환 공식
조각마다 생성 때 `qOff = inverse(qBody0) × qBoneWorld0`와 `pOff = inverse(qBody0) × (P(bone)0 − pBody0)`를 저장한다.

매 프레임:
```
qBoneWorld = qBody × qOff
pBoneWorld = pBody + qBody × pOff          // Hips만 위치 사용
// 부모 순서(Hips → Spine → … → 말단)대로
parent.updateWorldMatrix(false, false)
bone.quaternion = inverse(parentWorldQ) × qBoneWorld
Hips.position  = parentWorldMatrixInverse × pBoneWorld   (스케일 포함 변환)
```
- **부모부터 자식 순서**로 처리하고, 각 뼈 처리 후 `bone.updateMatrixWorld()`를 호출한다(다음 자식의 부모 행렬이 필요).
- 래퍼 그룹(`h.group`, `m.body`)은 **사망 순간 변환에 고정**한다. `m.body.rotation`, `position` 같은 기존 연출(넘어짐 회전)을 0으로 초기화한 뒤 시작한다. 위 공식이 부모 월드 행렬을 쓰므로 래퍼가 어디 있어도 맞다.
- 동기화 후 `h.x, h.z = pelvis.x, pelvis.z`, `h.y = 바닥 추정값`(pelvis.y − 0.15)으로 둔다. 시체 루팅·경찰 판정·`noise()` 등 기존 시스템이 그대로 동작한다.

### 9.3 시체 사격
- `hitscan`의 사람 판정은 `h.dead` 시 건너뛴다. 그래서 별도로 `phys.ray(…, mask = GR.RAG)`를 쏘아 맞으면 그 조각에 `applyImpulseAtPoint(min(40, dmg×0.6))`를 준다.
- `BAKED` 상태 시체가 맞으면 **다시 `SIM`으로 깨운다**(예산 허용 시). 기준 자세로 몸체를 다시 만들고 뼈 현재 자세로 생성하면 된다(5.1절 재사용).

---

## 10. 일어나기(GETUP, 넉다운 전용)

1. 방향 판정: pelvis 몸체의 앞 방향(로컬 +Z를 월드로 변환)의 y 성분으로 앞어짐/엎드림을 판단한다. 일어나는 동작은 같지만 시간이 다르다(앞어짐 0.9 s, 뒤로 누움 1.1 s).
2. 현재 뼈 로컬 회전 전부를 `poseA`로 저장하고, 물리 몸체와 관절을 제거한다.
3. 플레이어는 `Character.teleport(pelvis.x, 바닥, pelvis.z)`, NPC는 `h.x, h.z, h.y` 설정한다.
   `h.ry = atan2(pelvis 앞 방향 x, z)`
4. 애니메이션을 재개한다: mixer weights를 `U_Crouch_Idle` 1로 두고 `mixer.update`를 시작한다.
5. 블렌드 시간 T 동안 매 프레임:
   - `mixer.update(dt)`로 목표 자세를 계산하고
   - 각 뼈 `quaternion = slerp(poseA[i], 애니메이션 결과, ease(t/T))`
   - Hips 높이: 누운 높이 → 서 있는 높이로 ease
6. 끝나면 `ANIM` 상태로 돌아가고 `crouch → stand` 전환은 기존 stance 로직이 처리한다.
7. 일어나는 동안 입력(플레이어)/AI(NPC)는 막는다. NPC는 끝난 뒤 `flee` 상태로 둔다(기존 `stepKnock` 종료 동작과 같다).

> 개선 여지: UAL 같은 애니메이션 묶음에 "GetUp_Front/Back" 클립이 있으면 `build/retarget_ual.mjs`로 리타깃해 4번 단계 목표 클립으로 쓴다. 블렌드 방식은 그대로 둔다.

---

## 11. 원인별 연결 지점(코드 변경 목록)

| 파일 | 함수/위치 | 변경 |
|---|---|---|
| `src/physics.js` | `GR` | `RAG: 64` 추가. VEH/PROP/OBJ filter에 RAG 추가. `RAY_DEFAULT`는 그대로 |
| `src/physics.js` | `Physics.step` | 변경 없음(`pre` 콜백으로 연결) |
| `src/engine.js` | `QUALITY` | `ragdolls`, `ragDist` 항목 추가(7.1절) |
| `src/ragdoll.js` | 신규 | 2~10절 전체 |
| `src/game.js` | 생성자 | `this.ragdolls = new RagdollSystem(this)` |
| `src/game.js` | `phys.step(...)` 호출부(차량 갱신) | `pre`를 `(dt) => { 차량 구동; this.ragdolls.preStep(dt); }`로 감싸고, 직후 `postStep()`, `syncBones()` |
| `src/game.js` | `hitscan` 사람 명중 | 사망 유발 시 `hit = {seg, point, dir, j}`를 `h.hurt(…)`에 전달(맞은 높이로 조각 추정: y < 0.9 다리, 0.9~1.45 몸통, > 1.45 머리, 좌우는 진행 방향 외적으로) |
| `src/game.js` | `meleeAttack` | `best.ragdoll(…)` → `ragdolls.spawn(best, {cause:'melee', alive: !best.dead, …})` |
| `src/game.js` | `explosion` | 사람 루프의 `h.ragdoll(…)` → 거리순 정렬 후 `spawn(… blast …)`, 예산 초과는 레거시 |
| `src/game.js` | `vehicleVsHumans` | `h.ragdoll(…)` → `spawn(… carVel …)` |
| `src/game.js` | `playerDie` | 플레이어 랙돌 생성(`bodyVel = Character 속도`), 카메라 대상 = pelvis 몸체(데스 캠) |
| `src/game.js` | `land()` | `v > 17`(사망) 또는 stun 대상이면 랙돌(`cause:'fall'`, alive = 생존 여부) |
| `src/game.js` | `respawn` | 플레이어 랙돌 `destroy` + 뼈 리셋(`mixer` 재개, `Idle` weight 1, `mixer.update(0)`) |
| `src/game.js` | 사람 제거 루프(`h.deadT > 24`) | `ragdolls.destroy(h)` 먼저 호출 |
| `src/game.js` | `updateCamera` 사망 분기 | 카메라 회전 중심 = `h.rag ? pelvis 위치 : pl 위치` |
| `src/human.js` | `die()` | `this.rag`가 생성될 예정이면 `U_Death01` 재생 생략(`die(from, src, opt)`에 `noClip`) |
| `src/human.js` | `hurt()` | 사망 시 `G.ragdolls.spawn(this, {cause, hit, …})` 시도, 실패하면 기존 동작 |
| `src/human.js` | `ragdoll(vx,vz,up)` | 내부에서 `G.ragdolls.spawn(this,{cause:'shove', alive:true, bodyVel:{vx,up,vz}})` 시도 → 실패 시 기존 `knock` |
| `src/human.js` | `update()` / `animate()` | `if (this.rag && this.rag.state !== 'GETUP') return;`(AI·애니메이션 건너뜀), GETUP은 10절 블렌드 |
| `src/society.js` | 밀치기 `h.ragdoll(…)` | 그대로(위 `ragdoll()`이 처리) |
| `src/building.js` | `dropFloor(k)` | 층 충돌체 제거 **전에** `G.ragdolls.bakeInBox(층 rect, y범위)` 호출(바닥이 사라져 시체가 떨어지는 것 방지) |
| `src/building.js` | 승강기 이동 시작 | 칸 안의 랙돌 `bake` |
| `src/items.js` | (선택) 무기 떨어뜨리기 | 사망 랙돌 시 손의 총을 소품(OBJ)으로 떨어뜨리기 — 범위 밖, 후속 |

---

## 12. 플레이어 전용 사항
- 플레이어 사망: 랙돌을 만들고 `Character` 캡슐은 그대로 둔다(충돌 그룹 CHAR는 RAG와 안 부딪힌다). 카메라는 3인칭 데스 캠으로 pelvis를 2.5 m 거리에서 천천히 돈다. 기존 `cam.yaw += dt*0.15` 연출을 재사용한다.
- 1인칭(`cam.fp`)에서 죽으면 사망 순간 3인칭으로 바꾼다.
- 고공 추락 넉다운(`stunT`): 랙돌(alive) → GETUP 후 입력을 되돌린다. `stunT`는 GETUP 끝 시점까지 연장한다.
- 리스폰 시 `ragdolls.destroy(pl)`, 뼈 리셋, `pl.group` 변환을 원래대로 되돌린다.

---

## 13. 엣지 케이스

| 상황 | 처리 |
|---|---|
| 벽·차에 몸이 겹친 채 생성 | 반지름 축소(3.2-5), 최대 보정 속도 제한(4.6), 그래도 0.2 s 안에 조각 속도 > 25 m/s면 속도를 15로 자른다 |
| 바닥 아래로 빠짐 | pelvis.y < 지면(`heightAt` 또는 층 바닥) − 2 m면 즉시 BAKE + 바닥 위로 올림 |
| 층 언로드 | 11절 `dropFloor` 처리 |
| 이동 중 승강기 | 생성 금지(레거시), 이미 있으면 bake |
| 차 안 사망(운전자) | 랙돌 금지, 기존 처리(차 안 늘어짐/하차) |
| 앉은 사람 | 레거시(5.1-3) |
| NaN 발생 | `syncBones`에서 몸체 위치에 NaN이 있으면 즉시 destroy + 레거시 시체 처리(클립 마지막 프레임) |
| 사람 제거/재사용(인구 관리) | 제거 전에 destroy를 반드시 호출. `this.humans.splice` 경로 모두 확인 |
| 같은 사람 중복 생성 | `h.rag`가 있으면 새로 만들지 않고 충격만 추가 |
| 절차적(박스) 사람 | `m.skinned`가 아니면 항상 레거시 |
| 일시정지/메뉴 | 물리 스텝이 멈추므로 자동 정지. 별도 처리 없음 |
| 시간 가속(수면 등) | 수면 시작 시 모든 랙돌을 bake |

---

## 14. 시험(검증) 계획

### 14.1 자동 시험(Node, P0~P1)
1. **관절 무결성**: 랙돌 8개를 3 m에서 떨어뜨리고 300 스텝 진행한다. 모든 관절의 앵커 간 거리가 2 cm 이하이고 제한 위반이 5° 이하여야 한다.
2. **정지 시간**: 평지 낙하 시 4 s 안에 정지해야 한다.
3. **NaN 없음**: 1,000 스텝 무작위 충격(±80 N·s) 후에도 위치·회전이 유한값이어야 한다.
4. **성능**: 6.2절 기준.

### 14.2 브라우저 시험(playwright, 기존 스크립트 방식)
| 시나리오 | 확인 |
|---|---|
| NPC 정면 사격 사망 | 뒤로 넘어짐, 맞은 쪽 어깨가 먼저 꺾임(스크린샷 3장 시간차) |
| 달리는 NPC 사격 | 앞으로 구름(pelvis 속도 방향 = 이동 방향) |
| 폭발 5명 | 거리순 랙돌 배정, 상한 초과분 레거시, `G.dbg.ragMs` 기록 |
| 차량 충돌 30 km/h, 60 km/h | 다리부터 걸려 보닛 위로 넘어감, 60 km/h에서 더 멀리 날아감 |
| 계단 위 사망 | 몸이 계단에 걸쳐 굳음(바닥 관통 없음) |
| 난간 옆 폭발 | 난간에 몸이 꺾여 걸림 |
| 호수 사망 | 떠오름, 파문 발생 |
| 플레이어 20 m 추락 | 사망 랙돌 + 데스 캠 |
| 플레이어 12 m 추락(생존 기절) | 랙돌 → 1 s 내 GETUP → 조작 복귀 |
| 층 이동으로 층 언로드 | 시체 bake, 떨어지지 않음 |
| 품질 LOW | 동시 랙돌 3개 이하 |

### 14.3 수치 로그
- 생성 수, 레거시 대체 수, 평균 SIM 시간, 강제 정지 수, `ragMs` 평균/최대를 `window.__ragStats`로 노출해 시험 스크립트가 읽게 한다.

---

## 15. 구현 단계(순서와 완료 기준)

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| **P0** | Node 벤치마크(6.2), impulse vs multibody 결정, `GR.RAG` 추가, 축 부호 검증(4.5) | 부록 A·B 채움, 결정 기록 |
| **P1** | `ragdoll.js` 골격: 조각·관절 생성, 직접 제한, 뼈 동기화, 정지/BAKE, 예산. NPC 사망(총·폭발·차·근접)에 연결 | 14.1 전부 통과, 14.2 사격·폭발·차량·계단 통과 |
| **P2** | 플레이어 사망·추락 랙돌, 데스 캠, 리스폰 리셋 | 14.2 플레이어 항목 통과 |
| **P3** | 넉다운(살아 있음) + 근육 PD + GETUP 블렌드, `society` 밀치기·차 저속 충돌 연결 | 기절 후 1.5 s 내 조작 복귀, 자세 튐 없음 |
| **P4** | 물 부력·저항, 시체 사격 재활성화, 층 언로드/승강기 bake | 14.2 호수·층 항목 통과 |
| **P5** | 품질별 상한·적응 하향, `ragMs` 표시, 튜닝(제한각·감쇠), README 갱신 | 7.2 동작 확인, 사용자 체감 피드백 반영 |

각 단계마다 빌드 → 회귀 스크립트(`all.js`, `reach.js`, `ent.js`) → 커밋/푸시한다.

---

## 16. 튜닝 표(초기값, 한곳에 모음)

`ragdoll.js` 상단 `RAG_TUNE` 객체에 모은다.

```js
export const RAG_TUNE = {
  linDampAir: 0.05, linDampGround: 0.6, angDampAir: 0.9, angDampGround: 3.0,
  friction: 0.8, restitution: 0.0,
  limitBeta: 0.2, limitMaxW: 8,           // 4.4 교정
  deathTone: { k: 0, d: 0.6 }, deathToneStart: { k: 8, d: 1.0, t: 0.25 },
  knockTone: { k: 25, d: 3 },
  settleV: 0.15, settleW: 0.35, settleT: 0.6, maxSimT: 6, maxSimTWater: 20,
  spawnShrink: 0.85, spawnShrinkT: 0.12, maxSegV: 30,
  bulletJ: 0.9, bulletJMax: 60, meleeJ: 45, blastK: 14, carK: 0.9, carLift: 2.5, shoveJ: 35,
  buoyancy: 1.05, waterDrag: 4,
  getUpFront: 0.9, getUpBack: 1.1,
};
```

---

## 부록 A. 축·부호 검증 결과(P0에서 채움)
| 관절 | 축(로컬) | +방향 의미 | 확정 제한 |
|---|---|---|---|
| 팔꿈치 L | | | |
| 팔꿈치 R | | | |
| 무릎 L | | | |
| 무릎 R | | | |
| 엉덩이 L/R 앞 방향 | | | |
| 어깨 원뿔 기준축 | | | |

## 부록 B. 벤치마크 결과(P0에서 채움)
| 방식 | N=1 | N=4 | N=8 | N=12 | N=16 | 관절 벌어짐 최대 | 위반각 최대 | 정지 시간 |
|---|---|---|---|---|---|---|---|---|
| impulse + 직접 제한 | | | | | | | | |
| multibody | | | | | | | | |

## 부록 C. 용어
- **랙돌**: 관절로 이어진 여러 물리 몸체로 사람 몸을 흉내 내는 것.
- **BAKE(굳히기)**: 물리를 지우고 마지막 자세로 뼈를 고정하는 것.
- **swing-twist 분해**: 회전을 "축 방향 비틀림"과 "축을 기울이는 흔들림"으로 나누는 계산.
- **충격량(N·s)**: 질량 × 속도 변화. 75 kg 사람에게 75 N·s면 몸 전체가 1 m/s 움직인다.
