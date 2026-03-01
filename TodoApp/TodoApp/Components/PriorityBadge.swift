import SwiftUI

struct PriorityBadge: View {
    let priority: Priority
    var compact: Bool = false

    var body: some View {
        if compact {
            Image(systemName: priority.systemImage)
                .font(.caption.weight(.semibold))
                .foregroundStyle(priority.color)
        } else {
            Label(priority.displayName, systemImage: priority.systemImage)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(priority.color)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(priority.color.opacity(0.18), in: Capsule())
                .overlay(Capsule().strokeBorder(priority.color.opacity(0.3), lineWidth: 0.5))
        }
    }
}

struct CategoryBadge: View {
    let category: TodoCategory

    var body: some View {
        Label(category.rawValue, systemImage: category.systemImage)
            .font(.caption2.weight(.medium))
            .foregroundStyle(category.color)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(category.color.opacity(0.18), in: Capsule())
    }
}

struct DueDateBadge: View {
    let date: Date
    let isCompleted: Bool

    private var isOverdue: Bool {
        !isCompleted && date < Date.now
    }

    private var isDueToday: Bool {
        Calendar.current.isDateInToday(date)
    }

    private var badgeColor: Color {
        if isOverdue  { return .red }
        if isDueToday { return .orange }
        return .secondary
    }

    private var formattedDate: String {
        if isOverdue  { return "Overdue" }
        if isDueToday { return "Today \(date.formatted(date: .omitted, time: .shortened))" }
        return date.formatted(date: .abbreviated, time: .omitted)
    }

    var body: some View {
        Label(formattedDate, systemImage: "calendar")
            .font(.caption2.weight(.medium))
            .foregroundStyle(badgeColor)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(badgeColor.opacity(0.15), in: Capsule())
    }
}
