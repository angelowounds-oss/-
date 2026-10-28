# ADR-0034 배포: 게임 폴더 + 실행파일(NeonCity.exe) + zip 하나

## 상태
채택 (2026-10-28, BLD-06). ADR-0001(단일 HTML 파일)을 대체한다.
- 사용자 요청: "여러 가지 파일로 만들어도 좋아. 대신 실행파일 한 개만 실행하면 내가 원하는 게임이 됐으면 좋겠고, 제출할 때엔 압축파일로."
- 사용자 선택: "윈도우 사용해. 권고안대로 진행해". 권고안은 앱 창, 고사양 팩까지 zip 하나, 한 파일 빌드는 테스트를 옮긴 뒤 제거였다.

## 배경
- `neon_city_v9.html`은 108 MB였다. JS와 base64 에셋이 49 MB, base64 월드가 58 MB다.
  - 시작할 때 base64를 풀어 메모리에 같은 데이터가 두 벌 있었다.
  - 고사양 팩(98 MB)은 `file://`에서 옆 폴더를 읽을 수 없다. 그래서 사용자가 매번 폴더를 직접 연결해야 했다(ADR-0013의 "고화질 팩 연결").
- 빌드 결과를 무엇으로 넘길지(HTML, 팩 폴더, 따로따로)가 매번 헷갈렸다.

## 결정
- **배포 단위는 폴더 하나이고, 전달은 zip 하나다.**
  - 폴더 내용: `NeonCity/NeonCity.exe`, `README.txt`, `game/`. `game/` 안에는 `index.html`, `main.js`, `assets/`, `fonts/`, `world/`, `LICENSES.txt`가 있다.
  - zip 이름은 `dist/NeonCity-<날짜>-<커밋>.zip`이다. 이미 압축된 파일(pak, glb, jpg, woff2, exe, rgbe)은 다시 압축하지 않고 그대로 저장한다.
  - 파일 이름은 모두 ASCII다. 한글 이름은 Windows 탐색기의 zip 해제에서 깨진다.
- **런처는 Go 표준 라이브러리만 쓴다(`launcher/`).**
  - Windows amd64 GUI 프로그램이라 콘솔 창이 뜨지 않는다. 크기는 약 6.6 MB다.
  - exe 옆의 `game/`을 `127.0.0.1:47820`에서 서빙하고, Chrome을 앱 창으로 연다. Chrome이 없으면 Edge, 둘 다 없으면 기본 브라우저를 연다.
  - 포트를 고정하는 이유: localStorage(저장, 설정, 조작키)는 출처(포트 포함)마다 따로라서, 포트가 바뀌면 저장이 사라진 것처럼 보인다. 47820을 남이 쓰고 있으면 47821~47829 중 빈 곳을 쓰고, `%LOCALAPPDATA%\NeonCity\port.txt`에 기억한다.
  - 같은 폴더의 런처가 이미 돌고 있으면(`/__neoncity/id`) 창만 다시 열고 끝낸다. 다른 폴더의 런처라면 알리고 끝낸다. 두 버전이 같은 저장을 동시에 쓰지 않게 하기 위해서다.
  - 브라우저 프로필은 전용이다(`%LOCALAPPDATA%\NeonCity\Browser`). 그래서 저장은 게임 폴더와 상관없이 이어지고, 사용자 확장 프로그램의 영향을 받지 않는다.
- **런처의 보안 규칙:**
  - GET과 HEAD만 받는다.
  - Host 헤더가 127.0.0.1이나 localhost가 아니면 403을 돌려준다(DNS rebinding 방지).
  - 다른 사이트가 보낸 요청(`Sec-Fetch-Site`가 `cross-site`나 `same-site`)도 403이다. 다른 사이트는 답을 읽을 수 없지만 요청은 보낼 수 있다. 예를 들어 가짜 `bye`를 보내면 플레이 중에 게임이 꺼진다.
  - 일반 파일만 보낸다. Windows의 `CON`, `NUL` 같은 장치 이름은 열지 않는다.
  - 디렉터리 목록, 점으로 시작하는 파일, `..`, `\`, `:`는 404로 막는다.
  - MIME은 자체 표를 쓴다. Windows 레지스트리에서 .js가 text/plain으로 잡혀 있는 PC가 있기 때문이다.
  - `nosniff`를 보낸다. 해시 이름 에셋은 `immutable`, 나머지는 `no-cache`로 보낸다.
  - Range 요청에는 206으로 답한다(`http.ServeContent`).
- **런처가 끝나는 경우:**
  - 띄운 브라우저 프로세스가 끝났을 때. 단, 5초 넘게 돈 뒤여야 한다. 이미 열려 있는 Edge에 창이 붙으면 프로세스가 바로 끝나기 때문이다.
  - 페이지 핑(15 s 간격)이 3분 동안 없을 때.
  - 페이지가 닫히며 보낸 `bye`(sendBeacon) 뒤 10 s 안에 새 핑이 없을 때.
- **게임 코드:**
  - base64와 `file://`을 가정한 코드를 없앴다. 에셋은 esbuild `file` 로더로 `assets/<이름>-<해시>.*`가 되고, import는 그 URL을 준다.
  - 동기로 읽는 파일(HDRI 3개, 블록, 랜드마크, 국도 계획)은 부팅 때 한꺼번에 받는다(`src/files.js`의 `need/preloadFiles/bytes`).
  - glb는 쓸 때 받는다.
  - 노트북 월드 `world/base.pak`은 통째로 한 번 받는다. 부팅 때 16 m 지면과 식생 약 1250청크를 어차피 읽기 때문이다.
  - 고사양 팩(`world/index.json`, `high.pak`, `assets.pak`)은 화질을 '고사양'으로 골랐을 때만 Range 요청으로 붙는다(`chunkstore.httpFile`). 연결 버튼과 IndexedDB는 없앴다.
  - 페이지를 `file://`로 열면 "NeonCity.exe로 실행해 주세요"를 띄우고 멈춘다.
- **빌드:**
  - `node build/build.mjs`는 `dist/NeonCity/`를 만든다. `--zip`을 주면 zip도 만든다(`build/package.mjs`).
  - 환경 변수: `DIST`, `WORLD=small`, `PACK=0`, `LAUNCHER=0`, `DEV=1`.
  - Go가 없으면 exe 없이 폴더만 만든다. 이 폴더는 테스트에는 쓸 수 있지만, zip은 거부한다.
  - `dist/`는 커밋하지 않는다.

## 결과
- 크기(2026-10-28):

  | 항목 | 크기 |
  |---|---|
  | 폴더 | 180 MB |
  | `world/base.pak` | 43.8 MB |
  | `high.pak` + `assets.pak` | 98.6 MB |
  | `assets/` (41개) | 28 MB |
  | `main.js` | 10.5 MB |
  | exe | 6.6 MB |
  | zip | 180.6 MB |

  이전에는 HTML 108 MB와 팩 99 MB를 따로 넘겼다.
- 부팅 측정(이 컨테이너, SwiftShader, 노트북 화질; GPU 시간이 아니다):

  | 항목 | 이전 HTML | 새 폴더 |
  |---|---|---|
  | `#go.rdy`까지 | 87.6 s | 89.8 s (고사양 84.5 s) |
  | JS 힙 | 1020 MB | 905 MB |
  | `__BAKED_MS` | 1280 ms | 2258 ms (첫 실행) / 895 ms (두 번째 실행) |

  - `#go.rdy`까지의 시간은 셰이더 컴파일이 대부분이라 차이가 없다.
  - JS 힙은 base64 문자열이 없어진 만큼 줄었다.
  - `__BAKED_MS`는 이제 파일을 받는 시간까지 포함한다. 첫 실행 값이 큰 이유다.
- 테스트 영향:
  - e2e는 `tests/lib.cjs`의 `serve()`가 `GAME_DIR`(기본 `dist/NeonCity/game`)를 127.0.0.1에서 서빙해 연다. 서빙 방식은 런처와 같다(Range, MIME).
  - `e2e/pack`, `e2e/hiassets`는 폴더 고르기 대신 자동 연결을 확인한다.
  - `e2e/world-small`은 작은 폴더를 따로 빌드한다.
  - 새 테스트: `unit/launcher`, `unit/package`.
- 예전 `file://`로 연 HTML의 저장은 넘어오지 않는다. 출처가 다르기 때문이다.
- 처음 실행하면 SmartScreen이 묻는다("추가 정보 → 실행"). 서명하지 않은 exe라서다. 코드 서명은 외부 배포(BLD-04) 때 정한다.
- 외부에 배포하기 전에는 라이선스 확인이 필요하다(BLD-04). `game/LICENSES.txt`에 크레딧과 원문(MIT, Apache-2.0, OFL)을 넣었다.

## 대안
- **단일 HTML 유지(ADR-0001):** 메모리 두 벌 문제와 팩 연결 문제가 남는다. 사용자가 원한 "실행파일 하나"도 아니다.
- **Electron·Tauri:** 실행파일 하나로 끝나지만 크기가 크다(Electron 약 +150 MB). 웹뷰 버전이 PC마다 다르고(Tauri), 빌드 도구 체인도 무겁다. Go 런처와 사용자의 Chrome·Edge 조합이 더 작고 단순하다.
- **임의 포트:** 매번 출처가 바뀌어 저장이 사라진다. 그래서 고정 포트에 대체 포트를 기억하는 방식으로 했다.
- **base.pak을 Range로 나눠 받기:** 부팅 때 대부분을 읽으므로 요청 수만 늘어난다. 고사양 팩만 Range로 받는다.
