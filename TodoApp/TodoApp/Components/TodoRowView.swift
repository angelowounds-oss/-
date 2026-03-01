import SwiftUI
import SwiftData

struct TodoRowView: View {
    @Bindable var todo: TodoItem
    var onTap: () -> Void

    @State private var checkBounce = false

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 14) {
                // Completion circle
                Button {
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.6)) {
                        todo.isCompleted.toggle()
                        checkBounce = true
                    }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                        checkBounce = false
                    }
                } label: {
                    ZStack {
                        Circle()
                            .strokeBorder(
                                todo.isCompleted ? Color.green : Color.white.opacity(0.3),
                                lineWidth: 2
                            )
                            .frame(width: 26, height: 26)

                        if todo.isCompleted {
                            Circle()
                                .fill(Color.green)
                                .frame(width: 26, height: 26)

                            Image(systemName: "checkmark")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(.white)
                        }
                    }
                    .scaleEffect(checkBounce ? 1.2 : 1.0)
                }
                .buttonStyle(.plain)

                // Content
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .top) {
                        Text(todo.title)
                            .font(.body.weight(.medium))
                            .foregroundStyle(todo.isCompleted ? .secondary : .white)
                            .strikethrough(todo.isCompleted, color: .secondary)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)

                        Spacer(minLength: 8)

                        PriorityBadge(priority: todo.priority, compact: true)
                    }

                    // Metadata badges
                    HStack(spacing: 6) {
                        if let dueDate = todo.dueDate {
                            DueDateBadge(date: dueDate, isCompleted: todo.isCompleted)
                        }
                        if let category = todo.category {
                            CategoryBadge(category: category)
                        }
                    }

                    if !todo.notes.isEmpty {
                        Text(todo.notes)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }

                Image(systemName: "chevron.right")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            .padding(.vertical, 12)
            .padding(.horizontal, 16)
            .background {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay {
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .strokeBorder(
                                todo.isCompleted
                                ? Color.white.opacity(0.08)
                                : Color.white.opacity(0.15),
                                lineWidth: 1
                            )
                    }
                    .opacity(todo.isCompleted ? 0.6 : 1.0)
            }
        }
        .buttonStyle(.plain)
        .animation(.spring(response: 0.3), value: todo.isCompleted)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(todo.title), \(todo.priority.displayName) priority, \(todo.isCompleted ? "completed" : "active")")
        .accessibilityHint("Double tap to view details")
    }
}
