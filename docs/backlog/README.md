# 백로그 사용법

파트별 파일(`BLD.md`, `SAV.md`, …)에 티켓을 둔다. 우선순위·마일스톤은 `docs/ROADMAP.md`.

## 티켓 형식

```
### <ID> 제목 — P0|P1|P2 · S|M|L · M0..M3 · 상태
- 목적: 왜 하는가 (총평의 어떤 문제를 푸는가)
- 범위: 무엇을 바꾸는가 / 바꾸지 않는가
- 완료 기준(AC): 검증 가능한 문장으로
- 검증: 실행할 명령과 기대 결과
- 관련 파일: 시작점
- 의존: 먼저 끝나야 하는 티켓 / 필요한 사용자 결정
```

- 우선순위: **P0** 다음 마일스톤의 종료 조건 · **P1** 같은 마일스톤 안의 중요 작업 · **P2** 여유가 있을 때
- 크기: **S** 세션 1회 미만 · **M** 세션 1회 · **L** 여러 세션(착수 전에 하위 티켓으로 쪼갤 것)
- 상태: `Backlog` · `Ready` · `In progress` · `Review` · `Done (커밋, 수치)` · `Blocked (이유)`

## 상태 요약 (갱신 시 같이 고칠 것)

| 파트 | P0 | P1 | P2 |
|---|---|---|---|
| BLD | BLD-01, BLD-02, BLD-04 | BLD-03 | BLD-05 |
| SAV | SAV-01, SAV-02 | | SAV-03 |
| PERF | PERF-01, PERF-02, PERF-03 | PERF-04, PERF-05 | PERF-06 |
| GPL | GPL-01, GPL-02 | GPL-03, GPL-04 | GPL-05 |
| ARC | | ARC-01, ARC-02 | ARC-03, ARC-04 |
| RND | | RND-02, RND-03 | RND-04, RND-05 |
| WLD | | WLD-01, WLD-02 | WLD-03, WLD-04, WLD-05 |
| AI | | AI-01, AI-02 | AI-03, AI-04 |
| CHR | | CHR-01 | CHR-02, CHR-03 |
| PHY | | PHY-03 | PHY-01, PHY-02 |
| UX | | UX-01, UX-02, UX-04 | UX-03, UX-05 |
| AUD | | AUD-00 | AUD-01, AUD-02 |
