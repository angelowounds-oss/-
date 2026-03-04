import XCTest
import SwiftData
@testable import TodoApp

final class TodoItemTests: XCTestCase {

    // MARK: - TodoItem Initialization

    func testDefaultInitialization() {
        let item = TodoItem(title: "Test Todo")

        XCTAssertFalse(item.id.uuidString.isEmpty)
        XCTAssertEqual(item.title, "Test Todo")
        XCTAssertEqual(item.notes, "")
        XCTAssertFalse(item.isCompleted)
        XCTAssertEqual(item.priority, .medium)
        XCTAssertEqual(item.priorityRaw, "medium")
        XCTAssertNil(item.dueDate)
        XCTAssertNil(item.category)
        XCTAssertNil(item.categoryRaw)
    }

    func testFullInitialization() {
        let dueDate = Date.now.addingTimeInterval(86400)
        let createdAt = Date.now
        let customID = UUID()
        let item = TodoItem(
            id: customID,
            title: "Full Todo",
            notes: "Some notes",
            isCompleted: true,
            priority: .high,
            dueDate: dueDate,
            category: .work,
            createdAt: createdAt
        )

        XCTAssertEqual(item.id, customID)
        XCTAssertEqual(item.title, "Full Todo")
        XCTAssertEqual(item.notes, "Some notes")
        XCTAssertTrue(item.isCompleted)
        XCTAssertEqual(item.priority, .high)
        XCTAssertEqual(item.priorityRaw, "high")
        XCTAssertEqual(item.dueDate, dueDate)
        XCTAssertEqual(item.category, .work)
        XCTAssertEqual(item.categoryRaw, "Work")
        XCTAssertEqual(item.createdAt, createdAt)
    }

    func testUniqueIDsForDifferentItems() {
        let item1 = TodoItem(title: "Item 1")
        let item2 = TodoItem(title: "Item 2")
        XCTAssertNotEqual(item1.id, item2.id)
    }

    func testInitWithAllPriorities() {
        let lowItem = TodoItem(title: "Low", priority: .low)
        let medItem = TodoItem(title: "Med", priority: .medium)
        let highItem = TodoItem(title: "High", priority: .high)

        XCTAssertEqual(lowItem.priorityRaw, "low")
        XCTAssertEqual(medItem.priorityRaw, "medium")
        XCTAssertEqual(highItem.priorityRaw, "high")
    }

    func testInitWithAllCategories() {
        let categories: [TodoCategory] = [.personal, .work, .shopping, .health, .finance, .other]
        for cat in categories {
            let item = TodoItem(title: "Cat", category: cat)
            XCTAssertEqual(item.category, cat)
            XCTAssertEqual(item.categoryRaw, cat.rawValue)
        }
    }

    // MARK: - Title and Notes Mutation

    func testTitleMutation() {
        let item = TodoItem(title: "Original")
        item.title = "Updated"
        XCTAssertEqual(item.title, "Updated")
    }

    func testNotesMutation() {
        let item = TodoItem(title: "Test")
        XCTAssertEqual(item.notes, "")
        item.notes = "New notes"
        XCTAssertEqual(item.notes, "New notes")
    }

    func testEmptyTitle() {
        let item = TodoItem(title: "")
        XCTAssertEqual(item.title, "")
    }

    // MARK: - isCompleted Toggling

    func testIsCompletedToggle() {
        let item = TodoItem(title: "Task")
        XCTAssertFalse(item.isCompleted)

        item.isCompleted = true
        XCTAssertTrue(item.isCompleted)

        item.isCompleted = false
        XCTAssertFalse(item.isCompleted)
    }

    // MARK: - Priority Computed Property

    func testPriorityGetterAndSetter() {
        let item = TodoItem(title: "Test", priority: .low)
        XCTAssertEqual(item.priority, .low)
        XCTAssertEqual(item.priorityRaw, "low")

        item.priority = .high
        XCTAssertEqual(item.priority, .high)
        XCTAssertEqual(item.priorityRaw, "high")

        item.priority = .medium
        XCTAssertEqual(item.priority, .medium)
        XCTAssertEqual(item.priorityRaw, "medium")
    }

    func testPriorityDefaultsToMediumForInvalidRaw() {
        let item = TodoItem(title: "Test")
        item.priorityRaw = "invalid"
        XCTAssertEqual(item.priority, .medium)
    }

    func testPriorityDefaultsToMediumForEmptyRaw() {
        let item = TodoItem(title: "Test")
        item.priorityRaw = ""
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

    func testCategorySetToNil() {
        let item = TodoItem(title: "Test", category: .work)
        XCTAssertEqual(item.category, .work)

        item.category = nil
        XCTAssertNil(item.category)
        XCTAssertNil(item.categoryRaw)
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

    func testCategoryNilWhenRawEmpty() {
        let item = TodoItem(title: "Test")
        item.categoryRaw = ""
        XCTAssertNil(item.category)
    }

    func testCategorySetterCyclesThroughAll() {
        let item = TodoItem(title: "Test")
        let allCategories: [TodoCategory] = [.personal, .work, .shopping, .health, .finance, .other]
        for cat in allCategories {
            item.category = cat
            XCTAssertEqual(item.category, cat)
            XCTAssertEqual(item.categoryRaw, cat.rawValue)
        }
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

    func testIsNotOverdueWhenNoDueDateAndCompleted() {
        let item = TodoItem(title: "No Due Done", isCompleted: true)
        XCTAssertFalse(item.isOverdue)
    }

    func testOverdueBecomesNotOverdueWhenCompleted() {
        let item = TodoItem(
            title: "Toggle",
            dueDate: Date.now.addingTimeInterval(-86400)
        )
        XCTAssertTrue(item.isOverdue)

        item.isCompleted = true
        XCTAssertFalse(item.isOverdue)
    }

    // MARK: - Due Today Logic

    func testIsDueTodayWhenDueDateIsToday() {
        let item = TodoItem(title: "Today", dueDate: Date.now)
        XCTAssertTrue(item.isDueToday)
    }

    func testIsDueTodayAtStartOfDay() {
        let startOfDay = Calendar.current.startOfDay(for: Date.now)
        let item = TodoItem(title: "Today Start", dueDate: startOfDay)
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

    func testIsNotDueTodayWhenDueYesterday() {
        let yesterday = Calendar.current.date(
            byAdding: .day, value: -1,
            to: Calendar.current.startOfDay(for: .now)
        )!.addingTimeInterval(43200)
        let item = TodoItem(title: "Yesterday", dueDate: yesterday)
        XCTAssertFalse(item.isDueToday)
    }

    func testDueDateMutation() {
        let item = TodoItem(title: "Test")
        XCTAssertNil(item.dueDate)

        let futureDate = Date.now.addingTimeInterval(86400)
        item.dueDate = futureDate
        XCTAssertEqual(item.dueDate, futureDate)

        item.dueDate = nil
        XCTAssertNil(item.dueDate)
        XCTAssertFalse(item.isOverdue)
        XCTAssertFalse(item.isDueToday)
    }

    // MARK: - Priority Enum

    func testPriorityComparable() {
        XCTAssertTrue(Priority.low < Priority.medium)
        XCTAssertTrue(Priority.medium < Priority.high)
        XCTAssertFalse(Priority.high < Priority.low)
        XCTAssertFalse(Priority.low < Priority.low)
        XCTAssertFalse(Priority.medium < Priority.medium)
        XCTAssertFalse(Priority.high < Priority.high)
    }

    func testPriorityComparableTransitivity() {
        XCTAssertTrue(Priority.low < Priority.high)
    }

    func testPriorityDisplayName() {
        XCTAssertEqual(Priority.high.displayName, "High")
        XCTAssertEqual(Priority.medium.displayName, "Medium")
        XCTAssertEqual(Priority.low.displayName, "Low")
    }

    func testPriorityColor() {
        let highColor = Priority.high.color
        let mediumColor = Priority.medium.color
        let lowColor = Priority.low.color

        XCTAssertNotNil(highColor)
        XCTAssertNotNil(mediumColor)
        XCTAssertNotNil(lowColor)
    }

    func testPrioritySystemImage() {
        XCTAssertEqual(Priority.high.systemImage, "arrow.up.circle.fill")
        XCTAssertEqual(Priority.medium.systemImage, "minus.circle.fill")
        XCTAssertEqual(Priority.low.systemImage, "arrow.down.circle.fill")
    }

    func testPriorityRawValues() {
        XCTAssertEqual(Priority.low.rawValue, "low")
        XCTAssertEqual(Priority.medium.rawValue, "medium")
        XCTAssertEqual(Priority.high.rawValue, "high")
    }

    func testPriorityInitFromRawValue() {
        XCTAssertEqual(Priority(rawValue: "low"), .low)
        XCTAssertEqual(Priority(rawValue: "medium"), .medium)
        XCTAssertEqual(Priority(rawValue: "high"), .high)
        XCTAssertNil(Priority(rawValue: "invalid"))
        XCTAssertNil(Priority(rawValue: ""))
        XCTAssertNil(Priority(rawValue: "HIGH"))
    }

    func testPriorityAllCasesCount() {
        XCTAssertEqual(Priority.allCases.count, 3)
    }

    func testPriorityAllCasesContainsAll() {
        XCTAssertTrue(Priority.allCases.contains(.low))
        XCTAssertTrue(Priority.allCases.contains(.medium))
        XCTAssertTrue(Priority.allCases.contains(.high))
    }

    func testPrioritySorting() {
        let unsorted: [Priority] = [.high, .low, .medium, .high, .low]
        let sorted = unsorted.sorted()
        XCTAssertEqual(sorted, [.low, .low, .medium, .high, .high])
    }

    // MARK: - TodoCategory Enum

    func testTodoCategoryAllCasesCount() {
        XCTAssertEqual(TodoCategory.allCases.count, 6)
    }

    func testTodoCategoryAllCasesContainsAll() {
        let expected: Set<TodoCategory> = [.personal, .work, .shopping, .health, .finance, .other]
        let actual = Set(TodoCategory.allCases)
        XCTAssertEqual(actual, expected)
    }

    func testTodoCategoryRawValues() {
        XCTAssertEqual(TodoCategory.personal.rawValue, "Personal")
        XCTAssertEqual(TodoCategory.work.rawValue, "Work")
        XCTAssertEqual(TodoCategory.shopping.rawValue, "Shopping")
        XCTAssertEqual(TodoCategory.health.rawValue, "Health")
        XCTAssertEqual(TodoCategory.finance.rawValue, "Finance")
        XCTAssertEqual(TodoCategory.other.rawValue, "Other")
    }

    func testTodoCategoryInitFromRawValue() {
        XCTAssertEqual(TodoCategory(rawValue: "Personal"), .personal)
        XCTAssertEqual(TodoCategory(rawValue: "Work"), .work)
        XCTAssertEqual(TodoCategory(rawValue: "Shopping"), .shopping)
        XCTAssertEqual(TodoCategory(rawValue: "Health"), .health)
        XCTAssertEqual(TodoCategory(rawValue: "Finance"), .finance)
        XCTAssertEqual(TodoCategory(rawValue: "Other"), .other)
        XCTAssertNil(TodoCategory(rawValue: "invalid"))
        XCTAssertNil(TodoCategory(rawValue: ""))
        XCTAssertNil(TodoCategory(rawValue: "personal"))
    }

    func testTodoCategorySystemImages() {
        XCTAssertEqual(TodoCategory.personal.systemImage, "person.fill")
        XCTAssertEqual(TodoCategory.work.systemImage, "briefcase.fill")
        XCTAssertEqual(TodoCategory.shopping.systemImage, "cart.fill")
        XCTAssertEqual(TodoCategory.health.systemImage, "heart.fill")
        XCTAssertEqual(TodoCategory.finance.systemImage, "dollarsign.circle.fill")
        XCTAssertEqual(TodoCategory.other.systemImage, "tag.fill")
    }

    func testTodoCategoryColors() {
        let personalColor = TodoCategory.personal.color
        let workColor = TodoCategory.work.color
        let shoppingColor = TodoCategory.shopping.color
        let healthColor = TodoCategory.health.color
        let financeColor = TodoCategory.finance.color
        let otherColor = TodoCategory.other.color

        XCTAssertNotNil(personalColor)
        XCTAssertNotNil(workColor)
        XCTAssertNotNil(shoppingColor)
        XCTAssertNotNil(healthColor)
        XCTAssertNotNil(financeColor)
        XCTAssertNotNil(otherColor)
    }

    // MARK: - Combined Scenarios

    func testOverdueItemWithCategory() {
        let item = TodoItem(
            title: "Overdue work task",
            priority: .high,
            dueDate: Date.now.addingTimeInterval(-3600),
            category: .work
        )
        XCTAssertTrue(item.isOverdue)
        XCTAssertEqual(item.priority, .high)
        XCTAssertEqual(item.category, .work)
    }

    func testCompletedItemWithAllFields() {
        let dueDate = Date.now.addingTimeInterval(-86400)
        let item = TodoItem(
            title: "Completed task",
            notes: "All done",
            isCompleted: true,
            priority: .low,
            dueDate: dueDate,
            category: .personal
        )
        XCTAssertTrue(item.isCompleted)
        XCTAssertFalse(item.isOverdue)
        XCTAssertEqual(item.notes, "All done")
        XCTAssertEqual(item.priority, .low)
        XCTAssertEqual(item.category, .personal)
    }

    func testMutateAllFieldsAfterCreation() {
        let item = TodoItem(title: "Original")

        item.title = "Updated Title"
        item.notes = "Added notes"
        item.isCompleted = true
        item.priority = .high
        item.dueDate = Date.now.addingTimeInterval(86400)
        item.category = .finance

        XCTAssertEqual(item.title, "Updated Title")
        XCTAssertEqual(item.notes, "Added notes")
        XCTAssertTrue(item.isCompleted)
        XCTAssertEqual(item.priority, .high)
        XCTAssertEqual(item.priorityRaw, "high")
        XCTAssertNotNil(item.dueDate)
        XCTAssertEqual(item.category, .finance)
        XCTAssertEqual(item.categoryRaw, "Finance")
    }

    func testCreatedAtIsPreservedAfterMutation() {
        let createdAt = Date.now.addingTimeInterval(-3600)
        let item = TodoItem(title: "Test", createdAt: createdAt)

        item.title = "Changed"
        item.priority = .high

        XCTAssertEqual(item.createdAt, createdAt)
    }
}
