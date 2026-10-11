# 에셋 출처와 라이선스 (BLD-04에서 전체 정리 중 — 지금은 새로 추가한 것부터 기록)

새 에셋을 넣으면 여기에 출처·라이선스·표기 의무를 적는다. 전체 목록(모델, 텍스처, HDRI, 물 셰이더 GPL 이슈 등)은 BLD-04.

| 에셋 | 파일 | 출처 | 라이선스 | 표기 |
|---|---|---|---|---|
| Anton (로딩 화면 제목·숫자) | `assets/fonts/Anton-400.woff2` (라틴 부분) | Google Fonts (Vernon Adams) | SIL Open Font License 1.1 | 로딩 화면 하단 크레딧에 표기 |
| Space Mono 400/700 (로딩 화면 보조 글자) | `assets/fonts/SpaceMono-{400,700}.woff2` (라틴 부분) | Google Fonts (Colophon Foundry) | SIL Open Font License 1.1 | 위와 같음 |

- 글꼴은 `build/build.mjs`가 base64로 템플릿에 넣는다(단일 HTML, 오프라인에서도 같은 모양). 한글은 글꼴을 넣지 않고 시스템 글꼴(`Noto Sans KR`/`Malgun Gothic`/`Apple SD Gothic Neo`)을 쓴다.
- 로딩 화면 디자인 원본: 사용자가 준 `Purge Day — 로딩` 목업(1280×720 아트보드). 값(색·크기·간격)은 목업 그대로, 구현은 `src/template.html` + `src/loading.js`.
