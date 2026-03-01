import SwiftUI

struct ContentView: View {
    @State private var selectedTab: Tab = .todos

    enum Tab {
        case todos, settings
    }

    var body: some View {
        ZStack {
            AppBackground()

            TabView(selection: $selectedTab) {
                TodoListView()
                    .tabItem {
                        Label("Todos", systemImage: "checklist")
                    }
                    .tag(Tab.todos)
                    .accessibilityLabel("Todo list")

                SettingsView()
                    .tabItem {
                        Label("Settings", systemImage: "gear")
                    }
                    .tag(Tab.settings)
                    .accessibilityLabel("App settings")
            }
            .tint(.white)
        }
    }
}
