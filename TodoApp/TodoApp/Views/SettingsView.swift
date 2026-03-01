import SwiftUI
import SwiftData

struct SettingsView: View {
    @Environment(\.modelContext) private var modelContext
    @AppStorage("defaultPriority") private var defaultPriorityRaw: String = Priority.medium.rawValue
    @AppStorage("enableHaptics") private var enableHaptics: Bool = true
    @State private var showDeleteConfirm = false

    var body: some View {
        NavigationStack {
            ZStack {
                AppBackground()

                ScrollView {
                    VStack(spacing: 16) {
                        // Defaults
                        GlassCard {
                            VStack(spacing: 0) {
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

                        // About
                        GlassCard {
                            VStack(spacing: 0) {
                                settingRow {
                                    Label("Version", systemImage: "info.circle.fill")
                                        .foregroundStyle(.white)
                                } trailing: {
                                    Text(appVersion)
                                        .foregroundStyle(.white.opacity(0.6))
                                        .font(.subheadline)
                                }

                                Divider().background(.white.opacity(0.15))

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

                        // Danger zone
                        GlassCard {
                            Button(role: .destructive) {
                                showDeleteConfirm = true
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

                        // App info footer
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
            .confirmationDialog(
                "Delete All Todos?",
                isPresented: $showDeleteConfirm,
                titleVisibility: .visible
            ) {
                Button("Delete All", role: .destructive) {
                    try? modelContext.delete(model: TodoItem.self)
                }
            } message: {
                Text("This cannot be undone.")
            }
        }
    }

    private func settingRow<L: View, T: View>(
        @ViewBuilder label: () -> L,
        @ViewBuilder trailing: () -> T
    ) -> some View {
        HStack {
            label()
            Spacer()
            trailing()
        }
        .padding(.vertical, 12)
    }

    private var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
    }

    private var buildNumber: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
    }
}
