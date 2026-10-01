# Clash Royale AI 학습 결과 요약

최종 업데이트: 2026-10-01  
프로젝트: 최적 균형 플레이 AI 탐색

## 개요

세 가지 학습 방식을 시도했습니다:

1. **MLP 신경망 학습 (ES)** - 4.1k 파라미터, 2.6 순호
   - 규칙형 AI에만 학습하면 과적합
   - 탐색형 AI에는 거의 대항 불가
   
2. **평가 가중치 학습 (RL)** - 19 파라미터, 전체 메타
   - 더 빠른 학습 (한 세대 ~6분)
   - 리그식 자기대전으로 균형 도모
   - 현재 진행 중 (1000세대)

3. **손제작 AI (정책 6+11)** - 파라미터 없음
   - 정책 6 (탐색형): 기본값
   - 정책 11 (탐색형+위치평가): 50.7% vs 정책 6

## 주요 결과

### 메타 덱 라운드 로빈 (정책 혼합, N=6)

| 덱 | 승률 | 구성 |
|---|---|---|
| 2.6 순호 | 42% | Cannon, Musketeer, Skeletons, Hog Rider, Fireball, Ice Golem, Ice Spirit, The Log |
| 광켓 | 51% | Skeletons, Dark Prince, Tesla, The Log, Rocket, Royal Delivery, Electro Spirit, Miner |
| 골렘 | 46% | Golem, Night Witch, Baby Dragon, Mega Minion, Lightning, Zap, Tombstone, Electro Wizard |
| 라바룬 | 71% | Lava Hound, Balloon, Skeleton Dragons, Mega Minion, Tombstone, Arrows, Zap, Barbarian Barrel |
| 페카 브릿지 | 86% | PEKKA, Battle Ram, Electro Wizard, Magic Archer, Zap, Dark Prince, Bats, Mini PEKKA |
| X보우 | 46% | X-Bow, Tesla, Archers, Knight, Skeletons, Ice Spirit, Fireball, The Log |
| 메가나이트 | 04% | Mega Knight, Elixir Collector, Bats, Skeleton Barrel, Minions, Inferno Tower, Zap, The Log |
| 모르타르 | 46% | Mortar, Knight, Archers, Skeleton Army, Bats, Ice Spirit, Fireball, The Log |
| 골렘(새) | 71% | 골렘 추가 아키형 |
| 로그배이트 | 12% | Spear Goblins, Goblins, Skeleton Barrel, Princess, Ice Spirit, Zap, The Log, Arrows |
| 배틀래리 | 56% | Battle Ram, Electro Wizard, ... |
| 마이너 영인물 | 51% | Miner, Poison, Valkyrie, Mega Minion, Skeletons, Ice Spirit, Bomb Tower, The Log |

평가: 정책 혼합에서 규칙형(0-2)과 탐색형(5-7)의 편향 뚜렷

### 장기 탐색 AI (정책 5-7, 100-240틱 롤아웃)

정책 5,6,7 장기 탐색 후:
- 페카 브릿지: 85% → 86% (변화 없음)
- 메가나이트: 5% → 4% (악화)
- 로그배이트: 12% → 84% (개선, AI가 치질 극복)
- 전체 편향성은 여전함

### 검색 AI v2 (정책 8-11, 상대 모델링)

정책 6 (기본 탐색) 대비 h2h 평가 (840판):
- 정책 8 (결정론화 + 혼합 + 위치): **47.1%** (개선 없음)
- 정책 10 (결정론화 + 혼합): **48.0%** (개선 없음)
- 정책 11 (위치평가): **50.5%** (정책 6 동등)

결론: value function과 rollout이 병목

### 현재 RL 학습 진행 상황

**명령:** `./build/real rl results/real_meta.txt 1000 results/rl_w.txt 10 48 0.12 0.05`

| 세대 | 누적 판수 | 정책 6 vs 승률 | 검증(고정) | 비고 |
|---|---|---|---|---|
| 0 | 960 | 50.7% | - | 기본값(log-mult=0) |
| 1 | 1920 | 48.6% | - | |
| 2 | 2880 | 43.0% | - | |
| 4 | 4800 | 47.9% | 54.0% | 오차 ±3.5% |
| 5+ | 진행중 | ... | ... | 리그식 자기대전 |

- 리그 체크포인트: 매 10세대 추가
- 학습률: 0.05, 시그마: 0.12, 한 세대당 960판 (24쌍 x 2 x 48)
- 예상 완료: ~50시간

## 카드 프로필

총 129장 스캔 완료 (진화/영웅 포함)
- 모든 카드 ok=1 (정상)
- 체력, DPS, 사거리, 공중 공격 등 주요 지표 확인됨

## 유명 덱 검증

22개 메타 덱 모두 유효:
- 2.6 순호, 2.9 순호, 광켓 (2종), X보우, 모르타르
- 페카 브릿지, 페카 도니, 골렘, 라바룬
- 메가나이트, 자이언트 프린스, 스팩키 (2종)
- 로그배이트 (2종), 엘릭서 파밍 (2종), 로열호그, 배틀래리, 3M, 빅배롤

상세: `results/famous_decks.txt`

## 결론

아직까지 "무상성 덱"(모든 상대에게 50% 근처)은 찾지 못했습니다.

- **규칙형 AI 편향**: 무거운 덱(페카, 라바룬) 우세
- **탐색형 AI 편향**: 가벼운 덱(사이클, 로그배이트) 우세
- **조화의 한계**: 두 플레이어를 섞어도 편향 유지

**현재 시도**: RL 학습으로 탐색형 AI의 평가 함수를 미세 조정하여, 정책 6 상대로 순수하게 강한 플레이어를 만드는 것. 다양한 덱과 상대 스냅샷(리그)으로 학습하면 더 균형잡힌 결과를 기대합니다.

---

**파일 목록:**
- `src/real/real.cpp` - 엔진 + 모든 플레이어 + 학습 모드
- `results/famous_decks.txt` - 22개 검증된 메타 덱
- `results/rl.log` - RL 세대별 진행 로그
- `results/rl_w.txt` - 현재 최고 가중치
- `results/rl_w.txt.league` - 리그 스냅샷 이력
