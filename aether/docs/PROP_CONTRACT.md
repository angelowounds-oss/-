# 소품(GLB) 가져오기 계약 — AETHER 새 풍동

사용자가 Blender나 AI 3D 도구로 만든 소품(제어실 장비, 공구 카트, 표지판 등)을 풍동에 넣을 때 지켜야 할 규칙입니다.
현재 엔진이 직접 읽는 사용자 에셋은 BMW(`assets/vehicle-asset.js`), 콘솔(`assets/console-asset.js`), 팬(`assets/fan-asset.js`)이고, 새 소품도 같은 방식(base64 GLB를 `assets/*-asset.js`로 임베드)으로 연결합니다.

## 1. 파일 형식
| 항목 | 규칙 |
|---|---|
| 형식 | glTF 2.0 바이너리(.glb), 외부 URI·텍스처 이미지 없음(`images` 비어 있음) |
| 단위·축 | 미터, +Y 위, 풍동 좌표(+X 하류, +Z 관찰창 쪽). Blender에서 내보낼 때 "Y up" 체크 |
| 원점 | 바닥 접촉면 중앙(y=0). 회전 소품은 회전축이 원점 |
| 메쉬 | 삼각형만, 수밀(모든 모서리가 정확히 2면 공유), 법선 있음, 한 메쉬 ≤ 20만 정점, 전체 ≤ 60만 정점 |
| 재질 | 이름이 `materialLibrary` 키와 일치(PlenumPaint, GalvanizedSteel, BlackPowderCoat, StainlessSteel, AbsorberFoam, ABSPlastic, SafetyYellow, AcousticGlass 등). baseColorTexture 금지(색은 baseColorFactor) |
| 충돌 | 보행·시네마틱 카메라 충돌은 노드 `extras.obstacle=true`인 메쉬(또는 간단한 박스 프록시)만 사용 |
| 공력 영향 | 기본은 **시각 전용**. 계산에 넣으려면 `extras.solid=true`와 근사 박스(`extras.aabb`)를 주면 정적 고체로 복셀화(요청 시 구현) |

## 2. 검증(제가 대신 돌려 드립니다)
`node tools/gen/validate.mjs`와 같은 방식의 검사: 수밀·치수·법선 방향·정점 수·재질 이름. 실패하면 이유를 알려 드립니다.

## 3. 라이선스
직접 만들었거나 사용 허가를 받은 소품만 넣어 주세요. 이 저장소의 생성 에셋(`assets/tunnel-asset.js`)은 코드로 만든 것이며 제3자 콘텐츠를 포함하지 않습니다. BMW·팬·콘솔은 사용자 제공 에셋입니다(KNOWN_LIMITATIONS L3).

## 4. 왜 풍동 구조물은 코드로 만들고 소품은 사용자 제작인가
- 노즐·수집부·플레넘·턴테이블은 치수가 수식으로 정해져 있어 코드 생성이 정확하고, CFD 솔버가 같은 사양(`src/engine/09-tunnel-spec.js`)을 해석적으로 읽어 형상과 계산이 어긋나지 않습니다.
- 장비·소품은 모양에 정답이 없는 유기적 디테일이라 DCC 도구가 낫습니다. 차량(BMW 288개 메쉬)은 코드로 만들 수 없고, AI 3D 생성기는 하드서피스 형상·토폴로지가 약해 공력용으로 부적합합니다.
