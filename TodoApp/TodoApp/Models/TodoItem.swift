import Foundation
import SwiftData
import SwiftUI

// MARK: - Priority Enum

enum Priority: String, Codable, CaseIterable, Comparable {
    case low    = "low"
    case medium = "medium"
    case high   = "high"

    static func < (lhs: Priority, rhs: Priority) -> Bool {
        let order: [Priority: Int] = [.low: 0, .medium: 1, .high: 2]
        return (order[lhs] ?? 0) < (order[rhs] ?? 0)
    }

    var displayName: String {
        switch self {
        case .high:   return "High"
        case .medium: return "Medium"
        case .low:    return "Low"
        }
    }

    var color: Color {
        switch self {
        case .high:   return Color(red: 1.0, green: 0.23, blue: 0.19)
        case .medium: return Color(red: 1.0, green: 0.58, blue: 0.0)
        case .low:    return Color(red: 0.0, green: 0.48, blue: 1.0)
        }
    }

    var systemImage: String {
        switch self {
        case .high:   return "arrow.up.circle.fill"
        case .medium: return "minus.circle.fill"
        case .low:    return "arrow.down.circle.fill"
        }
    }
}

// MARK: - Category Enum

enum TodoCategory: String, Codable, CaseIterable {
    case personal  = "Personal"
    case work      = "Work"
    case shopping  = "Shopping"
    case health    = "Health"
    case finance   = "Finance"
    case other     = "Other"

    var systemImage: String {
        switch self {
        case .personal:  return "person.fill"
        case .work:      return "briefcase.fill"
        case .shopping:  return "cart.fill"
        case .health:    return "heart.fill"
        case .finance:   return "dollarsign.circle.fill"
        case .other:     return "tag.fill"
        }
    }

    var color: Color {
        switch self {
        case .personal:  return .purple
        case .work:      return .blue
        case .shopping:  return .green
        case .health:    return .pink
        case .finance:   return .orange
        case .other:     return .gray
        }
    }
}

// MARK: - TodoItem Model

@Model
final class TodoItem {
    var id: UUID
    var title: String
    var notes: String
    var isCompleted: Bool
    var priorityRaw: String
    var dueDate: Date?
    var categoryRaw: String?
    var createdAt: Date

    var priority: Priority {
        get { Priority(rawValue: priorityRaw) ?? .medium }
        set { priorityRaw = newValue.rawValue }
    }

    var category: TodoCategory? {
        get {
            guard let raw = categoryRaw else { return nil }
            return TodoCategory(rawValue: raw)
        }
        set { categoryRaw = newValue?.rawValue }
    }

    var isOverdue: Bool {
        guard let due = dueDate, !isCompleted else { return false }
        return due < Date.now
    }

    var isDueToday: Bool {
        guard let due = dueDate else { return false }
        return Calendar.current.isDateInToday(due)
    }

    init(
        id: UUID = UUID(),
        title: String,
        notes: String = "",
        isCompleted: Bool = false,
        priority: Priority = .medium,
        dueDate: Date? = nil,
        category: TodoCategory? = nil,
        createdAt: Date = Date.now
    ) {
        self.id = id
        self.title = title
        self.notes = notes
        self.isCompleted = isCompleted
        self.priorityRaw = priority.rawValue
        self.dueDate = dueDate
        self.categoryRaw = category?.rawValue
        self.createdAt = createdAt
    }
}
