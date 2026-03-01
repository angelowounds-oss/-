# TodoApp - App Store 배포 가이드

## 앱 정보

| 항목 | 값 |
|------|------|
| 앱 이름 | TodoApp |
| 번들 ID | com.todoapp.TodoApp |
| 버전 | 1.0 |
| 빌드 번호 | 1 |
| 최소 iOS | 17.0 |
| 지원 기기 | iPhone, iPad |
| 카테고리 | 생산성 (Productivity) |
| 연령 등급 | 4+ |

## App Store 부제목 (30자 이내)
**한국어:** 깔끔한 할 일 관리
**영어:** Elegant Task Manager

## App Store 설명

### 한국어
TodoApp은 모던한 글래스 모피즘 디자인으로 만들어진 아름다운 할 일 관리 앱입니다.
직관적인 다크 테마 인터페이스로 할 일 관리를 즐겁게 해보세요.

**주요 기능:**
- 할 일 생성, 수정, 삭제 및 상세 관리
- 우선순위 설정 (높음, 보통, 낮음) 및 시각적 표시
- 카테고리 분류: 개인, 업무, 쇼핑, 건강, 재정, 기타
- 마감일 설정 및 지연 알림
- 상태별 필터링 (전체, 활성, 완료)
- 우선순위별 필터링
- 날짜, 우선순위, 제목, 마감일별 정렬
- 제목과 메모 전문 검색
- 스와이프로 빠른 완료 및 삭제
- SwiftData 기반 영구 저장
- 사용자 설정 (기본 우선순위, 햅틱 피드백)

### English
TodoApp is a beautifully designed task manager built with a modern glass morphism aesthetic.
Organize your life with an intuitive dark-themed interface that makes managing todos a pleasure.

**Features:**
- Create, edit, and manage todos with rich details
- Set priorities (High, Medium, Low) with visual indicators
- Organize by categories: Personal, Work, Shopping, Health, Finance
- Set due dates with overdue tracking
- Filter by status (All, Active, Completed) and priority
- Sort by date, priority, title, or due date
- Full-text search across titles and notes
- Swipe actions for quick completion and deletion
- Persistent storage with SwiftData
- Customizable settings (default priority, haptic feedback)

## 키워드 (100자 이내)
todo,tasks,planner,organizer,productivity,checklist,reminder,glass,dark,minimal

## 스크린샷 가이드

App Store에 제출할 스크린샷 사이즈:

| 디바이스 | 해상도 |
|---------|--------|
| iPhone 6.7" (15 Pro Max) | 1290 x 2796 |
| iPhone 6.5" (15 Plus) | 1284 x 2778 |
| iPad Pro 12.9" | 2048 x 2732 |

**권장 스크린샷 (5장):**
1. 메인 투두 리스트 (할 일 여러개 표시)
2. 할 일 추가/편집 화면
3. 할 일 상세 보기
4. 필터링/검색 기능
5. 설정 화면

---

## 배포 전 체크리스트

### Apple Developer 계정
- [ ] Apple Developer Program 가입 ($99/년)
- [ ] Certificates, Identifiers & Profiles에서 App ID 설정
- [ ] 배포용 서명 인증서 (Distribution Certificate) 생성
- [ ] App Store 프로비저닝 프로파일 생성

### App Store Connect
- [ ] App Store Connect에서 새 앱 생성
- [ ] 앱 설명, 키워드, 부제목 입력
- [ ] 가격 설정 (무료)
- [ ] 연령 등급 설정 (4+)
- [ ] 개인정보 처리방침 URL 제공
- [ ] 지원 URL 제공
- [ ] 모든 필수 디바이스 크기 스크린샷 업로드
- [ ] 앱 카테고리: 생산성

### Xcode 빌드
- [ ] DEVELOPMENT_TEAM 빌드 설정에 팀 ID 입력
- [ ] Release 설정으로 프로비저닝 프로파일 지정
- [ ] Product > Archive로 아카이브 빌드
- [ ] 아카이브 유효성 검사
- [ ] App Store Connect에 업로드
- [ ] 처리 완료 대기
- [ ] 심사 제출

### 제출 후
- [ ] App Store Connect에서 심사 상태 모니터링
- [ ] 심사원 질문에 신속 대응
- [ ] 사용자 피드백 기반 v1.1 계획

---

## 개인정보 처리방침 (템플릿)

TodoApp은 사용자의 개인정보를 수집하지 않습니다.

- 모든 데이터는 기기 내에서만 저장됩니다 (SwiftData)
- 네트워크 통신을 하지 않습니다
- 사용자 추적을 하지 않습니다
- 제3자에게 데이터를 공유하지 않습니다
- UserDefaults는 앱 내 설정 값 저장에만 사용됩니다

이 개인정보 처리방침에 대한 문의: [이메일 주소]

---

## 기술 스택
- SwiftUI (UI 프레임워크)
- SwiftData (데이터 영속성)
- iOS 17+ API
- 외부 의존성 없음
