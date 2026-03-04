// 앱 설정 화면입니다.
// 기본 우선순위, 햅틱 피드백 설정, 앱 버전 정보,
// 전체 삭제(위험 구역) 기능을 제공합니다.

import SwiftUI
import SwiftData

// 설정 화면 뷰
struct SettingsView: View {
    // SwiftData DB 컨텍스트 (전체 삭제에 사용)
    @Environment(\.modelContext) private var modelContext

    // ✅ @AppStorage: UserDefaults에 값을 영구 저장하는 래퍼
    // 앱을 재시작해도 설정이 유지됩니다.
    @AppStorage("defaultPriority") private var defaultPriorityRaw: String = Priority.medium.rawValue
    @AppStorage("enableHaptics") private var enableHaptics: Bool = true

    @State private var showDeleteConfirm = false // 전체 삭제 확인 다이얼로그 표시 여부

    var body: some View {
        NavigationStack {
            ZStack {
                AppBackground()

                ScrollView {
                    VStack(spacing: 16) {

                        // ─── 기본 설정 카드 ───
                        GlassCard {
                            VStack(spacing: 0) {
                                // 기본 우선순위 선택 (Picker 메뉴 방식)
                                settingRow {
                                    Label("Default Priority", systemImage: "flag.fill")
                                        .foregroundStyle(.white)
                                } trailing: {
                                    Picker("", selection: $defaultPriorityRaw) {
                                        ForEach(Priority.allCases, id: \.rawValue) { p in
                                            Text(p.displayName).tag(p.rawValue)
                                        }
                                    }
                                    .pickerStyle(.menu)
                                    .tint(.white.opacity(0.7))
                                }

                                Divider().background(.white.opacity(0.15))

                                // 햅틱 피드백 켜기/끄기 토글
                                settingRow {
                                    Label("Haptic Feedback", systemImage: "hand.tap.fill")
                                        .foregroundStyle(.white)
                                } trailing: {
                                    Toggle("", isOn: $enableHaptics)
                                        .labelsHidden()
                                        .tint(.green)
                                }
                            }
                        }

                        // ─── 앱 정보 카드 ───
                        GlassCard {
                            VStack(spacing: 0) {
                                // 앱 버전 표시 (예: 1.0)
                                settingRow {
                                    Label("Version", systemImage: "info.circle.fill")
                                        .foregroundStyle(.white)
                                } trailing: {
                                    Text(appVersion)
                                        .foregroundStyle(.white.opacity(0.6))
                                        .font(.subheadline)
                                }

                                Divider().background(.white.opacity(0.15))

                                // 빌드 번호 표시 (예: 42)
                                settingRow {
                                    Label("Build", systemImage: "hammer.fill")
                                        .foregroundStyle(.white)
                                } trailing: {
                                    Text(buildNumber)
                                        .foregroundStyle(.white.opacity(0.6))
                                        .font(.subheadline)
                                }
                            }
                        }

                        // ─── 위험 구역: 전체 삭제 ───
                        GlassCard {
                            Button(role: .destructive) {
                                showDeleteConfirm = true // 확인 다이얼로그 표시
                            } label: {
                                HStack {
                                    Label("Delete All Todos", systemImage: "trash.fill")
                                        .foregroundStyle(.red)
                                    Spacer()
                                    Image(systemName: "chevron.right")
                                        .font(.caption)
                                        .foregroundStyle(.red.opacity(0.6))
                                }
                            }
                            .buttonStyle(.plain)
                        }

                        // ─── 하단 앱 정보 푸터 ───
                        VStack(spacing: 4) {
                            Text("TodoApp")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.white.opacity(0.4))
                            Text("Built with SwiftUI & SwiftData")
                                .font(.caption2)
                                .foregroundStyle(.white.opacity(0.25))
                        }
                        .padding(.top, 8)
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 16)
                    .padding(.bottom, 40)
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.large)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            // ✅ confirmationDialog: 전체 삭제 전 사용자에게 한 번 더 확인하는 경고창
            .confirmationDialog(
                "Delete All Todos?",
                isPresented: $showDeleteConfirm,
                titleVisibility: .visible
            ) {
                Button("Delete All", role: .destructive) {
                    // TodoItem 모델의 모든 데이터를 DB에서 삭제 (되돌릴 수 없음)
                    try? modelContext.delete(model: TodoItem.self)
                }
            } message: {
                Text("This cannot be undone.")
            }
        }
    }

    // ✅ 설정 행 레이아웃 빌더 함수
    // @ViewBuilder를 통해 왼쪽(label)과 오른쪽(trailing) 뷰를 자유롭게 전달할 수 있습니다.
    // 제네릭 <L, T>를 사용해 어떤 뷰 타입이든 받을 수 있습니다.
    private func settingRow<L: View, T: View>(
        @ViewBuilder label: () -> L,    // 왼쪽: 아이콘 + 레이블
        @ViewBuilder trailing: () -> T  // 오른쪽: Picker/Toggle/Text 등
    ) -> some View {
        HStack {
            label()
            Spacer()
            trailing()
        }
        .padding(.vertical, 12)
    }

    // Info.plist에서 앱 버전 문자열을 읽습니다. (예: "1.0")
    // 없으면 "1.0"을 기본값으로 반환합니다.
    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
    }

    // Info.plist에서 빌드 번호를 읽습니다. (예: "42")
    // 없으면 "1"을 기본값으로 반환합니다.
    private var buildNumber: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
    }
}
