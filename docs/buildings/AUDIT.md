# 건물 전수 점검 (Q0-7, 2026-10-27)

도구: `tests/tools/building-audit.mjs`(패스 A, 외부, node), `tests/tools/building-audit.cjs`(패스 B, NEON 내부, 브라우저).
점검만 했고 생성기는 바꾸지 않았다(uid 불변). 결과 원본은 `tests/results/`(커밋 안 함).

## 패스 A — 외부 기하 (도시·마을·농장 16,294채)
| 코드 | 수 | 비고 |
|---|---|---|
| highway-through | 325 | 마을 고정 거리 배치가 컴파일된 도로를 무시, mid1/2/3 필지 |
| in-water | 318 | 항만 창고(HARBOR-0450.., 0465..) 부두 가장자리, mid1/2/4 |
| floating | 40 | |
| buried | 8 | V44(판교) 집 |
| road-through | 6 | AIRFIELD-0000..0005 터미널 (길이 최대 9 m 관통) |

## 패스 B — NEON 내부 (560채 전부)
오탐을 줄이려고 0.1 m 격자, 원형 팽창(반경 0.2/0.28/0.36), 실제 컨트롤러로 확인했다. 외곽 탑(NC-F###)·링(NC-B00/B10)은 층 표본.
| 코드 | 건물 수 | 비고 |
|---|---|---|
| room-squeeze | 193 | 아파트 주방, 호텔 침실 (소파 때문에 문 앞 0.5 m) |
| room-blocked-physically | 153 | 호텔 거실, 사무실 서버·회의실 |
| room-shut-in | 110 | 아파트 68, 호텔 35, 사무실 7 (예: NC-B01_01-2, NC-B01_08-3) |
| room-tight | 100 | |
| mesh-outside | 60 | 미검증, 오탐 가능 |
| floor-fragmented | 41 | NC-B00_00-0 등 1층 |
| collider-outside-plate | 29 | NC-RW00.. |
| collider-leak | 6 | NC-B05_06-0/1/4, NC-B06_05-0 .. |
| walk-skipped | 2 | NC-F106, NC-F107 |
문제 없는 건물 290채, 하나라도 걸린 건물 270채. 계단·승강기 구멍, 입구 문 막힘, 예외는 0건.

## Q0-8 수정 후 (2026-10-28, ADR-0031) — NEON 560채 재점검
| 코드 | 수정 전 | 수정 후 |
|---|---|---|
| room-shut-in | 110 | 0 |
| room-blocked-physically | 153 | 0 |
| room-squeeze | 193 | 0 |
| room-tight | 100 | 0 |
| floor-fragmented | 41 | 0 |
| room-bare (빈 방으로 둔 방) | — | 0 (욕실 칸 없이 다시 꾸미기 전에는 4채 28개) |
| mesh-outside | 60 | 55 (그대로, 미검증) |
| collider-outside-plate | 29 | 29 (NC-RW 로비, 별도) |
| collider-leak | 6 | 6 (점검 중 다른 시스템이 충돌체를 줄인 것, 별도) |

- 방 63,397개 중 첫 시도에 통과 99.1%, 통로를 넓혀 다시 꾸민 방 0.9%.
- 층 생성 단계 시간: 이전과 같은 수준. 사무실·호텔·대형 층 반복 5회의 중앙값으로, GC 스파이크와 구분되지 않는다.
- 가구 수: 사무실 층 −9%, 호텔 −6%, 아파트 3칸 32→28.

## 아직 안 한 것
- 패스 C(다른 도시·마을 내부), 패스 D(표본 시트): 미착수.
- `room-shut-in`/`mesh-outside`는 시드 고정 재현으로 눈 확인 필요(소파 배치가 원인으로 보임).
- 수정은 별도 티켓.
