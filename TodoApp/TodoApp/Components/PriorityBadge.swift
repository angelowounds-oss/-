// 할 일 목록 행에서 우선순위, 카테고리, 마감일을 작게 표시하는 뱃지 컴포넌트들입니다.
// PriorityBadge, CategoryBadge, DueDateBadge 세 가지 뷰로 구성됩니다.

import SwiftUI

// 우선순위를 표시하는 뱃지 컴포넌트
struct PriorityBadge: View {
    let priority: Priority  // 표시할 우선순위
    var compact: Bool = false // true이면 아이콘만, false이면 아이콘+텍스트 캡슐 형태

    var body: some View {
        if compact {
            // compact 모드: 아이콘만 표시 (목록 행에서 공간 절약)
            Image(systemName: priority.systemImage)
                .font(.caption.weight(.semibold))
                .foregroundStyle(priority.color)
        } else {
            // 일반 모드: 아이콘 + 텍스트를 캡슐 형태로 표시 (상세 뷰 등에서 사용)
            Label(priority.displayName, systemImage: priority.systemImage)
                .font(.caption2.weight(.semibold))
                .foregroundStyle(priority.color)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(priority.color.opacity(0.18), in: Capsule()) // 반투명 배경
                .overlay(Capsule().strokeBorder(priority.color.opacity(0.3), lineWidth: 0.5)) // 얇은 테두리
        }
    }
}

// 카테고리를 표시하는 캡슐형 뱃지 컴포넌트
struct CategoryBadge: View {
    let category: TodoCategory // 표시할 카테고리

    var body: some View {
        // 카테고리 아이콘 + 이름을 캡슐 배경으로 표시
        Label(category.rawValue, systemImage: category.systemImage)
            .font(.caption2.weight(.medium))
            .foregroundStyle(category.color)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(category.color.opacity(0.18), in: Capsule()) // 반투명 배경
    }
}

// 마감일을 표시하는 뱃지 컴포넌트
// 기한 초과/오늘 마감/미래에 따라 색상과 텍스트가 자동으로 바뀝니다.
struct DueDateBadge: View {
    let date: Date         // 마감일
    let isCompleted: Bool  // 완료 여부 (완료된 항목은 기한 초과 표시 안 함)

    // 완료되지 않았고 현재 시각보다 이전이면 기한 초과
    private var isOverdue: Bool {
        !isCompleted && date < Date.now
    }

    // 마감일이 오늘인지 확인
    private var isDueToday: Bool {
        Calendar.current.isDateInToday(date)
    }

    // ✅ 상황에 따른 뱃지 색상 분기
    // 기한 초과 → 빨강, 오늘 마감 → 주황, 이후 → 회색
    private var badgeColor: Color {
        if isOverdue  { return .red }
        if isDueToday { return .orange }
        return .secondary
    }

    // ✅ 상황에 따른 표시 텍스트 분기
    // 기한 초과 → "Overdue", 오늘 → "Today HH:mm", 이후 → "월 일" 형식
    private var formattedDate: String {
        if isOverdue  { return "Overdue" }
        if isDueToday { return "Today \(date.formatted(date: .omitted, time: .shortened))" }
        return date.formatted(date: .abbreviated, time: .omitted)
    }

    var body: some View {
        // 달력 아이콘 + 날짜 텍스트를 캡슐 형태로 표시
        Label(formattedDate, systemImage: "calendar")
            .font(.caption2.weight(.medium))
            .foregroundStyle(badgeColor)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(badgeColor.opacity(0.15), in: Capsule()) // 반투명 배경
    }
}
