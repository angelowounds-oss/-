import SwiftUI
import SwiftData

struct TodoDetailView: View {
    @Bindable var todo: TodoItem
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @State private var showingEdit = false

    var body: some View {
        ZStack {
            AppBackground()

            ScrollView {
                VStack(spacing: 16) {
                    // Header
                    GlassCard {
                        VStack(alignment: .leading, spacing: 14) {
                            HStack(alignment: .top) {
                                Text(todo.title)
                                    .font(.title3.weight(.semibold))
                                    .foregroundStyle(todo.isCompleted ? .secondary : .white)
                                    .strikethrough(todo.isCompleted)
                                    .multilineTextAlignment(.leading)

                                Spacer()

                                PriorityBadge(priority: todo.priority)
                            }

                            if !todo.notes.isEmpty {
                                Divider().background(.white.opacity(0.2))
                                Text(todo.notes)
                                    .font(.body)
                                    .foregroundStyle(.white.opacity(0.75))
                            }
                        }
                    }

                    // Meta grid
                    LazyVGrid(
                        columns: [GridItem(.flexible()), GridItem(.flexible())],
                        spacing: 12
                    ) {
                        DetailMetaCard(
                            icon: "checkmark.circle.fill",
                            iconColor: todo.isCompleted ? .green : .orange,
                            title: "Status",
                            value: todo.isCompleted ? "Completed" : "Active"
                        )

                        DetailMetaCard(
                            icon: todo.priority.systemImage,
                            iconColor: todo.priority.color,
                            title: "Priority",
                            value: todo.priority.displayName
                        )

                        if let due = todo.dueDate {
                            DetailMetaCard(
                                icon: "calendar",
                                iconColor: todo.isOverdue ? .red : .blue,
                                title: "Due Date",
                                value: due.formatted(date: .abbreviated, time: .shortened)
                            )
                        }

                        if let cat = todo.category {
                            DetailMetaCard(
                                icon: cat.systemImage,
                                iconColor: cat.color,
                                title: "Category",
                                value: cat.rawValue
                            )
                        }

                        DetailMetaCard(
                            icon: "clock",
                            iconColor: .gray,
                            title: "Created",
                            value: todo.createdAt.formatted(date: .abbreviated, time: .shortened)
                        )
                    }

                    // Complete toggle button
                    Button {
                        withAnimation(.spring(response: 0.4, dampingFraction: 0.65)) {
                            todo.isCompleted.toggle()
                        }
                    } label: {
                        Label(
                            todo.isCompleted ? "Mark as Active" : "Mark as Complete",
                            systemImage: todo.isCompleted
                                ? "arrow.uturn.backward.circle.fill"
                                : "checkmark.circle.fill"
                        )
                        .font(.headline)
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background {
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .fill(todo.isCompleted ? Color.orange : Color.green)
                                .shadow(color: (todo.isCompleted ? Color.orange : Color.green).opacity(0.4),
                                        radius: 12, x: 0, y: 4)
                        }
                    }
                    .buttonStyle(.plain)
                    .animation(.spring(response: 0.3), value: todo.isCompleted)
                }
                .padding(.horizontal, 16)
                .padding(.top, 16)
                .padding(.bottom, 40)
            }
            .scrollContentBackground(.hidden)
        }
        .navigationTitle("Detail")
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Edit") { showingEdit = true }
                    .foregroundStyle(.white)
            }
        }
        .sheet(isPresented: $showingEdit) {
            AddEditTodoView(existingTodo: todo)
        }
    }
}

// MARK: - Detail Meta Card

private struct DetailMetaCard: View {
    let icon: String
    let iconColor: Color
    let title: String
    let value: String

    var body: some View {
        GlassCard(cornerRadius: 14, padding: 12) {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundStyle(iconColor)

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(.white.opacity(0.5))
                    Text(value)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
