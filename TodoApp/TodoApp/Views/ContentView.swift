// 앱의 루트(최상위) 뷰입니다.
// 하단 탭바를 통해 "할 일 목록"과 "설정" 두 화면을 전환합니다.

import SwiftUI

// 앱 전체를 감싸는 루트 뷰 - 탭 기반 네비게이션 구조
struct ContentView: View {
    // 현재 선택된 탭을 추적하는 상태 변수
    @State private var selectedTab: Tab = .todos

    // 앱에서 사용하는 탭 종류를 정의하는 내부 열거형
    enum Tab {
        case todos, settings // todos: 할 일 목록, settings: 설정
    }

    var body: some View {
        // ZStack: 배경 위에 탭 뷰를 겹쳐 배치
        ZStack {
            // 앱 전체 배경 그라디언트 (가장 아래 레이어)
            AppBackground()

            // TabView: 하단 탭바로 두 화면을 전환하는 컨테이너
            TabView(selection: $selectedTab) {
                // 첫 번째 탭: 할 일 목록
                TodoListView()
                    .tabItem {
                        Label("Todos", systemImage: "checklist") // 탭 아이콘과 텍스트
                    }
                    .tag(Tab.todos)               // 이 탭의 고유 식별자
                    .accessibilityLabel("Todo list") // 접근성: 보이스오버 레이블

                // 두 번째 탭: 설정
                SettingsView()
                    .tabItem {
                        Label("Settings", systemImage: "gear") // 탭 아이콘과 텍스트
                    }
                    .tag(Tab.settings)                // 이 탭의 고유 식별자
                    .accessibilityLabel("App settings") // 접근성: 보이스오버 레이블
            }
            .tint(.white) // 탭 선택 색상을 흰색으로 설정
        }
    }
}
