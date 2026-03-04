// TodoItem 모델의 로직을 검증하는 단위 테스트 파일입니다.
// 초기화, 계산 속성, Priority 열거형, TodoCategory 열거형을 18개의 테스트 메서드로 검증합니다.

import XCTest
import SwiftData
@testable import TodoApp // TodoApp 모듈을 테스트에서 접근 가능하게 임포트

final class TodoItemTests: XCTestCase {

    // MARK: - Initialization

    // 기본값만으로 TodoItem을 생성했을 때 각 프로퍼티의 기본값을 검증합니다.
    func testDefaultInitialization() {
        let item = TodoItem(title: "Test Todo")

        XCTAssertFalse(item.id.uuidString.isEmpty) // id가 비어있지 않아야 함
        XCTAssertEqual(item.title, "Test Todo")    // 제목이 맞게 저장됐는지
        XCTAssertEqual(item.notes, "")             // 메모 기본값은 빈 문자열
        XCTAssertFalse(item.isCompleted)           // 기본값은 미완료
        XCTAssertEqual(item.priority, .medium)     // 기본 우선순위는 medium
        XCTAssertNil(item.dueDate)                 // 마감일 없음
        XCTAssertNil(item.category)                // 카테고리 없음
    }

    // 모든 매개변수를 명시적으로 설정했을 때 정확히 저장되는지 검증합니다.
    func testFullInitialization() {
        let dueDate = Date.now.addingTimeInterval(86400) // 내일
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

    // priority 계산 속성의 getter와 setter가 올바르게 동작하는지 검증합니다.
    // priorityRaw(String) ↔ Priority(enum) 변환이 정확해야 합니다.
    func testPriorityGetterAndSetter() {
        let item = TodoItem(title: "Test", priority: .low)
        XCTAssertEqual(item.priority, .low)      // getter 확인
        XCTAssertEqual(item.priorityRaw, "low")  // 내부 저장값 확인

        item.priority = .high                    // setter 호출
        XCTAssertEqual(item.priority, .high)     // getter로 다시 확인
        XCTAssertEqual(item.priorityRaw, "high") // 내부 저장값 업데이트 확인
    }

    // priorityRaw에 잘못된 문자열을 넣으면 기본값 .medium을 반환하는지 검증합니다.
    func testPriorityDefaultsToMediumForInvalidRaw() {
        let item = TodoItem(title: "Test")
        item.priorityRaw = "invalid"           // 존재하지 않는 rawValue
        XCTAssertEqual(item.priority, .medium) // 폴백: .medium
    }

    // MARK: - Category Computed Property

    // category 계산 속성의 getter와 setter가 올바르게 동작하는지 검증합니다.
    func testCategoryGetterAndSetter() {
        let item = TodoItem(title: "Test", category: .shopping)
        XCTAssertEqual(item.category, .shopping)       // getter 확인
        XCTAssertEqual(item.categoryRaw, "Shopping")   // 내부 저장값 확인

        item.category = .health                        // setter 호출
        XCTAssertEqual(item.category, .health)         // getter로 다시 확인
        XCTAssertEqual(item.categoryRaw, "Health")     // 내부 저장값 업데이트 확인
    }

    // categoryRaw가 nil이면 category도 nil을 반환하는지 검증합니다.
    func testCategoryNilWhenRawNil() {
        let item = TodoItem(title: "Test")
        XCTAssertNil(item.category)    // category는 nil
        XCTAssertNil(item.categoryRaw) // 내부 저장값도 nil
    }

    // categoryRaw에 잘못된 문자열을 넣으면 nil을 반환하는지 검증합니다.
    func testCategoryNilWhenRawInvalid() {
        let item = TodoItem(title: "Test")
        item.categoryRaw = "InvalidCategory" // 존재하지 않는 카테고리
        XCTAssertNil(item.category)          // 폴백: nil
    }

    // MARK: - Overdue Logic

    // 마감일이 과거이고 미완료인 경우 isOverdue가 true인지 검증합니다.
    func testIsOverdueWhenPastDueAndNotCompleted() {
        let item = TodoItem(
            title: "Overdue",
            dueDate: Date.now.addingTimeInterval(-86400) // 어제
        )
        XCTAssertTrue(item.isOverdue) // 기한 초과 확인
    }

    // 완료된 항목은 마감일이 지났어도 isOverdue가 false인지 검증합니다.
    func testIsNotOverdueWhenCompleted() {
        let item = TodoItem(
            title: "Done",
            isCompleted: true,
            dueDate: Date.now.addingTimeInterval(-86400) // 어제
        )
        XCTAssertFalse(item.isOverdue) // 완료됐으면 초과 표시 안 함
    }

    // 마감일이 없으면 isOverdue가 false인지 검증합니다.
    func testIsNotOverdueWhenNoDueDate() {
        let item = TodoItem(title: "No Due")
        XCTAssertFalse(item.isOverdue) // 마감일 없으면 초과 없음
    }

    // 마감일이 미래이면 isOverdue가 false인지 검증합니다.
    func testIsNotOverdueWhenFutureDueDate() {
        let item = TodoItem(
            title: "Future",
            dueDate: Date.now.addingTimeInterval(86400) // 내일
        )
        XCTAssertFalse(item.isOverdue) // 미래 마감일은 초과 아님
    }

    // MARK: - Due Today Logic

    // 마감일이 오늘이면 isDueToday가 true인지 검증합니다.
    func testIsDueTodayWhenDueDateIsToday() {
        let item = TodoItem(title: "Today", dueDate: Date.now)
        XCTAssertTrue(item.isDueToday)
    }

    // 마감일이 없으면 isDueToday가 false인지 검증합니다.
    func testIsNotDueTodayWhenNoDueDate() {
        let item = TodoItem(title: "No Due")
        XCTAssertFalse(item.isDueToday)
    }

    // 마감일이 내일이면 isDueToday가 false인지 검증합니다.
    func testIsNotDueTodayWhenDueTomorrow() {
        // 내일 정오 시각 계산
        let tomorrow = Calendar.current.date(
            byAdding: .day, value: 1,
            to: Calendar.current.startOfDay(for: .now)
        )!.addingTimeInterval(43200) // +12시간 = 정오
        let item = TodoItem(title: "Tomorrow", dueDate: tomorrow)
        XCTAssertFalse(item.isDueToday)
    }

    // MARK: - Priority Enum

    // Priority가 Comparable을 올바르게 구현했는지 검증합니다. (low < medium < high)
    func testPriorityComparable() {
        XCTAssertTrue(Priority.low < Priority.medium)  // low는 medium보다 작음
        XCTAssertTrue(Priority.medium < Priority.high) // medium은 high보다 작음
        XCTAssertFalse(Priority.high < Priority.low)   // high는 low보다 크므로 false
    }

    // 각 Priority의 displayName이 올바른 문자열을 반환하는지 검증합니다.
    func testPriorityDisplayName() {
        XCTAssertEqual(Priority.high.displayName, "High")
        XCTAssertEqual(Priority.medium.displayName, "Medium")
        XCTAssertEqual(Priority.low.displayName, "Low")
    }

    // Priority.allCases가 정확히 3개인지 검증합니다. (low, medium, high)
    func testPriorityAllCasesCount() {
        XCTAssertEqual(Priority.allCases.count, 3)
    }

    // MARK: - TodoCategory Enum

    // TodoCategory.allCases가 정확히 6개인지 검증합니다.
    func testTodoCategoryAllCasesCount() {
        XCTAssertEqual(TodoCategory.allCases.count, 6)
    }

    // 각 카테고리의 rawValue(표시 문자열)가 올바른지 검증합니다.
    func testTodoCategoryRawValues() {
        XCTAssertEqual(TodoCategory.personal.rawValue, "Personal")
        XCTAssertEqual(TodoCategory.work.rawValue, "Work")
        XCTAssertEqual(TodoCategory.shopping.rawValue, "Shopping")
        XCTAssertEqual(TodoCategory.health.rawValue, "Health")
        XCTAssertEqual(TodoCategory.finance.rawValue, "Finance")
        XCTAssertEqual(TodoCategory.other.rawValue, "Other")
    }

    // 각 카테고리의 systemImage(SF Symbol 이름)가 올바른지 검증합니다.
    func testTodoCategorySystemImages() {
        XCTAssertEqual(TodoCategory.personal.systemImage, "person.fill")
        XCTAssertEqual(TodoCategory.work.systemImage, "briefcase.fill")
        XCTAssertEqual(TodoCategory.shopping.systemImage, "cart.fill")
        XCTAssertEqual(TodoCategory.health.systemImage, "heart.fill")
        XCTAssertEqual(TodoCategory.finance.systemImage, "dollarsign.circle.fill")
        XCTAssertEqual(TodoCategory.other.systemImage, "tag.fill")
    }
}
