// 이 파일은 앱 전반에서 사용하는 핵심 데이터 타입을 정의합니다.
// Priority(우선순위), TodoCategory(카테고리), TodoItem(할 일 항목) 세 가지로 구성됩니다.

import Foundation
import SwiftData
import SwiftUI

// MARK: - Priority Enum

// 할 일의 우선순위를 나타내는 열거형 (낮음 / 보통 / 높음)
// - rawValue가 String이므로 SwiftData DB에 문자열로 그대로 저장됩니다.
// - Comparable을 구현해 low < medium < high 순서로 정렬에 활용할 수 있습니다.
enum Priority: String, Codable, CaseIterable, Comparable {
    case low    = "low"    // 낮은 우선순위
    case medium = "medium" // 보통 우선순위
    case high   = "high"   // 높은 우선순위

    // Comparable 구현: 딕셔너리로 순서값을 지정해 두 값의 크기를 비교합니다.
    static func < (lhs: Priority, rhs: Priority) -> Bool {
        let order: [Priority: Int] = [.low: 0, .medium: 1, .high: 2]
        return (order[lhs] ?? 0) < (order[rhs] ?? 0)
    }

    // 화면에 표시할 우선순위 이름 (영문)
    var displayName: String {
        switch self {
        case .high:   return "High"
        case .medium: return "Medium"
        case .low:    return "Low"
        }
    }

    // 우선순위에 해당하는 색상 (높음=빨강, 보통=주황, 낮음=파랑)
    var color: Color {
        switch self {
        case .high:   return Color(red: 1.0, green: 0.23, blue: 0.19) // 빨강
        case .medium: return Color(red: 1.0, green: 0.58, blue: 0.0)  // 주황
        case .low:    return Color(red: 0.0, green: 0.48, blue: 1.0)  // 파랑
        }
    }

    // 우선순위에 해당하는 SF Symbol 아이콘 이름
    var systemImage: String {
        switch self {
        case .high:   return "arrow.up.circle.fill"   // 위 화살표 (높음)
        case .medium: return "minus.circle.fill"      // 대시 (보통)
        case .low:    return "arrow.down.circle.fill" // 아래 화살표 (낮음)
        }
    }
}

// MARK: - Category Enum

// 할 일의 카테고리를 나타내는 열거형 (6가지 종류)
// rawValue는 영문 표시명으로, SwiftData에 문자열로 저장됩니다.
enum TodoCategory: String, Codable, CaseIterable {
    case personal  = "Personal"  // 개인
    case work      = "Work"      // 업무
    case shopping  = "Shopping"  // 쇼핑
    case health    = "Health"    // 건강
    case finance   = "Finance"   // 재정
    case other     = "Other"     // 기타

    // 각 카테고리에 해당하는 SF Symbol 아이콘 이름
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

    // 각 카테고리에 해당하는 색상
    var color: Color {
        switch self {
        case .personal:  return .purple  // 보라
        case .work:      return .blue    // 파랑
        case .shopping:  return .green   // 초록
        case .health:    return .pink    // 분홍
        case .finance:   return .orange  // 주황
        case .other:     return .gray    // 회색
        }
    }
}

// MARK: - TodoItem Model

// 앱의 핵심 데이터 모델 - 할 일 한 건을 나타냅니다.
// @Model 매크로를 통해 SwiftData가 자동으로 영속(디스크) 저장을 관리합니다.
@Model
final class TodoItem {
    var id: UUID          // 각 항목을 고유하게 식별하는 ID
    var title: String     // 할 일 제목
    var notes: String     // 메모 (없으면 빈 문자열)
    var isCompleted: Bool // 완료 여부
    var priorityRaw: String  // Priority enum의 rawValue를 저장하는 실제 DB 컬럼
    var dueDate: Date?       // 마감일 (없으면 nil)
    var categoryRaw: String? // TodoCategory enum의 rawValue (없으면 nil)
    var createdAt: Date      // 생성 시각

    // ✅ 우선순위 계산 속성
    // priorityRaw(String) ↔ Priority(enum) 변환을 담당합니다.
    // get: 문자열을 Priority enum으로 변환, 실패하면 기본값 .medium 반환
    // set: Priority enum을 문자열로 변환해 priorityRaw에 저장
    var priority: Priority {
        get { Priority(rawValue: priorityRaw) ?? .medium }
        set { priorityRaw = newValue.rawValue }
    }

    // ✅ 카테고리 계산 속성
    // categoryRaw(String?) ↔ TodoCategory?(enum) 변환을 담당합니다.
    // get: categoryRaw가 nil이거나 알 수 없는 값이면 nil 반환
    // set: enum을 문자열로 변환해 저장 (nil이면 nil 저장)
    var category: TodoCategory? {
        get {
            guard let raw = categoryRaw else { return nil }
            return TodoCategory(rawValue: raw)
        }
        set { categoryRaw = newValue?.rawValue }
    }

    // ✅ 마감 초과 여부
    // 마감일이 있고, 완료되지 않았고, 현재 시각보다 이전이면 true
    var isOverdue: Bool {
        guard let due = dueDate, !isCompleted else { return false }
        return due < Date.now
    }

    // ✅ 오늘 마감 여부
    // 마감일이 오늘과 같은 날이면 true
    var isDueToday: Bool {
        guard let due = dueDate else { return false }
        return Calendar.current.isDateInToday(due)
    }

    // 생성자: 기본값이 설정되어 있어 title만 넣어도 항목을 만들 수 있습니다.
    init(
        id: UUID = UUID(),              // 기본: 새 UUID 자동 생성
        title: String,                  // 필수: 할 일 제목
        notes: String = "",             // 기본: 빈 문자열
        isCompleted: Bool = false,      // 기본: 미완료
        priority: Priority = .medium,   // 기본: 보통 우선순위
        dueDate: Date? = nil,           // 기본: 마감일 없음
        category: TodoCategory? = nil,  // 기본: 카테고리 없음
        createdAt: Date = Date.now      // 기본: 현재 시각
    ) {
        self.id = id
        self.title = title
        self.notes = notes
        self.isCompleted = isCompleted
        self.priorityRaw = priority.rawValue        // enum → 문자열 변환 후 저장
        self.dueDate = dueDate
        self.categoryRaw = category?.rawValue       // enum → 문자열 변환 후 저장 (nil 가능)
        self.createdAt = createdAt
    }
}
