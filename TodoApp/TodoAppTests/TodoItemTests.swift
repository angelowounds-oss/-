import XCTest
import SwiftData
@testable import TodoApp

final class TodoItemTests: XCTestCase {

    // MARK: - Initialization

    func testDefaultInitialization() {
        let item = TodoItem(title: "Test Todo")

        XCTAssertFalse(item.id.uuidString.isEmpty)
        XCTAssertEqual(item.title, "Test Todo")
        XCTAssertEqual(item.notes, "")
        XCTAssertFalse(item.isCompleted)
        XCTAssertEqual(item.priority, .medium)
        XCTAssertNil(item.dueDate)
        XCTAssertNil(item.category)
    }

    func testFullInitialization() {
        let dueDate = Date.now.addingTimeInterval(86400)
        let item = TodoItem(
            title: "Full Todo",
            notes: "Some notes",
            isCompleted: true,
            priority: .high,
            dueDate: dueDate,
            category: .work
        )

        XCTAssertEqual(item.title, "Full Todo")
        XCTAssertEqual(item.notes, "Some notes")
        XCTAssertTrue(item.isCompleted)
        XCTAssertEqual(item.priority, .high)
        XCTAssertEqual(item.dueDate, dueDate)
        XCTAssertEqual(item.category, .work)
    }

    // MARK: - Priority Computed Property

    func testPriorityGetterAndSetter() {
        let item = TodoItem(title: "Test", priority: .low)
        XCTAssertEqual(item.priority, .low)
        XCTAssertEqual(item.priorityRaw, "low")

        item.priority = .high
        XCTAssertEqual(item.priority, .high)
        XCTAssertEqual(item.priorityRaw, "high")
    }

    func testPriorityDefaultsToMediumForInvalidRaw() {
        let item = TodoItem(title: "Test")
        item.priorityRaw = "invalid"
        XCTAssertEqual(item.priority, .medium)
    }

    // MARK: - Category Computed Property

    func testCategoryGetterAndSetter() {
        let item = TodoItem(title: "Test", category: .shopping)
        XCTAssertEqual(item.category, .shopping)
        XCTAssertEqual(item.categoryRaw, "Shopping")

        item.category = .health
        XCTAssertEqual(item.category, .health)
        XCTAssertEqual(item.categoryRaw, "Health")
    }

    func testCategoryNilWhenRawNil() {
        let item = TodoItem(title: "Test")
        XCTAssertNil(item.category)
        XCTAssertNil(item.categoryRaw)
    }

    func testCategoryNilWhenRawInvalid() {
        let item = TodoItem(title: "Test")
        item.categoryRaw = "InvalidCategory"
        XCTAssertNil(item.category)
    }

    // MARK: - Overdue Logic

    func testIsOverdueWhenPastDueAndNotCompleted() {
        let item = TodoItem(
            title: "Overdue",
            dueDate: Date.now.addingTimeInterval(-86400)
        )
        XCTAssertTrue(item.isOverdue)
    }

    func testIsNotOverdueWhenCompleted() {
        let item = TodoItem(
            title: "Done",
            isCompleted: true,
            dueDate: Date.now.addingTimeInterval(-86400)
        )
        XCTAssertFalse(item.isOverdue)
    }

    func testIsNotOverdueWhenNoDueDate() {
        let item = TodoItem(title: "No Due")
        XCTAssertFalse(item.isOverdue)
    }

    func testIsNotOverdueWhenFutureDueDate() {
        let item = TodoItem(
            title: "Future",
            dueDate: Date.now.addingTimeInterval(86400)
        )
        XCTAssertFalse(item.isOverdue)
    }

    // MARK: - Due Today Logic

    func testIsDueTodayWhenDueDateIsToday() {
        let item = TodoItem(title: "Today", dueDate: Date.now)
        XCTAssertTrue(item.isDueToday)
    }

    func testIsNotDueTodayWhenNoDueDate() {
        let item = TodoItem(title: "No Due")
        XCTAssertFalse(item.isDueToday)
    }

    func testIsNotDueTodayWhenDueTomorrow() {
        let tomorrow = Calendar.current.date(
            byAdding: .day, value: 1,
            to: Calendar.current.startOfDay(for: .now)
        )!.addingTimeInterval(43200)
        let item = TodoItem(title: "Tomorrow", dueDate: tomorrow)
        XCTAssertFalse(item.isDueToday)
    }

    // MARK: - Priority Enum

    func testPriorityComparable() {
        XCTAssertTrue(Priority.low < Priority.medium)
        XCTAssertTrue(Priority.medium < Priority.high)
        XCTAssertFalse(Priority.high < Priority.low)
    }

    func testPriorityDisplayName() {
        XCTAssertEqual(Priority.high.displayName, "High")
        XCTAssertEqual(Priority.medium.displayName, "Medium")
        XCTAssertEqual(Priority.low.displayName, "Low")
    }

    func testPriorityAllCasesCount() {
        XCTAssertEqual(Priority.allCases.count, 3)
    }

    // MARK: - TodoCategory Enum

    func testTodoCategoryAllCasesCount() {
        XCTAssertEqual(TodoCategory.allCases.count, 6)
    }

    func testTodoCategoryRawValues() {
        XCTAssertEqual(TodoCategory.personal.rawValue, "Personal")
        XCTAssertEqual(TodoCategory.work.rawValue, "Work")
        XCTAssertEqual(TodoCategory.shopping.rawValue, "Shopping")
        XCTAssertEqual(TodoCategory.health.rawValue, "Health")
        XCTAssertEqual(TodoCategory.finance.rawValue, "Finance")
        XCTAssertEqual(TodoCategory.other.rawValue, "Other")
    }

    func testTodoCategorySystemImages() {
        XCTAssertEqual(TodoCategory.personal.systemImage, "person.fill")
        XCTAssertEqual(TodoCategory.work.systemImage, "briefcase.fill")
        XCTAssertEqual(TodoCategory.shopping.systemImage, "cart.fill")
        XCTAssertEqual(TodoCategory.health.systemImage, "heart.fill")
        XCTAssertEqual(TodoCategory.finance.systemImage, "dollarsign.circle.fill")
        XCTAssertEqual(TodoCategory.other.systemImage, "tag.fill")
    }
}
