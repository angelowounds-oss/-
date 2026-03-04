// 앱의 진입점(Entry Point) 파일입니다.
// @main 어노테이션이 붙은 이 구조체가 앱 실행 시 가장 먼저 호출됩니다.
// SwiftData의 ModelContainer를 설정해 앱 전역에서 데이터를 사용할 수 있게 합니다.

import SwiftUI
import SwiftData

// @main: 이 구조체가 앱 시작점임을 Swift에게 알려줍니다.
@main
struct TodoAppApp: App {

    // ✅ ModelContainer 초기화 (SwiftData 데이터베이스 설정)
    // 클로저 방식으로 앱 시작 시 단 한 번만 실행됩니다.
    var sharedModelContainer: ModelContainer = {
        // TodoItem 모델 하나만 사용하도록 스키마(DB 구조) 정의
        let schema = Schema([TodoItem.self])
        // isStoredInMemoryOnly: false → 기기 디스크에 영구 저장
        let config = ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)
        do {
            // 정상 경로: 디스크에 DB 파일 생성 및 로드
            return try ModelContainer(for: schema, configurations: [config])
        } catch {
            // 1차 실패 시: 메모리 전용 컨테이너로 폴백 (앱 재시작 시 데이터가 초기화됨)
            let fallbackConfig = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
            do {
                return try ModelContainer(for: schema, configurations: [fallbackConfig])
            } catch {
                // 2차 실패 시: 앱을 더 이상 실행할 수 없으므로 크래시 처리
                fatalError("Could not create ModelContainer: \(error)")
            }
        }
    }()

    var body: some Scene {
        // 앱의 메인 윈도우 그룹
        WindowGroup {
            ContentView() // 루트 뷰 설정
        }
        // sharedModelContainer를 모든 자식 뷰에서 @Environment(\.modelContext)로 접근 가능하게 주입
        .modelContainer(sharedModelContainer)
    }
}
