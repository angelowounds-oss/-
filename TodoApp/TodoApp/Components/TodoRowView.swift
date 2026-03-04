// 할 일 목록에서 각 항목을 표시하는 행(Row) 컴포넌트입니다.
// 완료 체크 버튼, 제목, 우선순위 뱃지, 마감일, 카테고리, 메모를 한 행에 표시합니다.

import SwiftUI
import SwiftData

// 목록의 각 할 일 항목을 나타내는 뷰
struct TodoRowView: View {
    // ✅ @Bindable: todo 객체의 프로퍼티를 이 뷰에서 직접 수정할 수 있게 해줍니다.
    // isCompleted를 토글하면 SwiftData가 자동으로 DB에 저장합니다.
    @Bindable var todo: TodoItem
    var onTap: () -> Void // 행 전체를 탭했을 때 실행할 콜백 (상위 뷰에서 주입)

    // 체크 버튼을 눌렀을 때 잠깐 커지는 바운스 애니메이션용 상태
    @State private var checkBounce = false

    var body: some View {
        // 전체 행을 탭하면 onTap() 실행 (상세 뷰 이동 등)
        Button(action: onTap) {
            HStack(spacing: 14) {

                // ─── 왼쪽: 완료 체크 버튼 ───
                Button {
                    // 스프링 애니메이션과 함께 완료 상태 토글
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.6)) {
                        todo.isCompleted.toggle()
                        checkBounce = true // 버튼 확대 시작
                    }
                    // 0.4초 후 원래 크기로 복원
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                        checkBounce = false
                    }
                } label: {
                    ZStack {
                        // 원형 테두리: 완료 시 초록, 미완료 시 흰색 반투명
                        Circle()
                            .strokeBorder(
                                todo.isCompleted ? Color.green : Color.white.opacity(0.3),
                                lineWidth: 2
                            )
                            .frame(width: 26, height: 26)

                        // 완료 상태일 때만 초록 채우기 + 체크마크 표시
                        if todo.isCompleted {
                            Circle()
                                .fill(Color.green)
                                .frame(width: 26, height: 26)

                            Image(systemName: "checkmark")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(.white)
                        }
                    }
                    // 버튼을 누를 때 1.2배로 잠깐 확대되는 바운스 효과
                    .scaleEffect(checkBounce ? 1.2 : 1.0)
                }
                .buttonStyle(.plain) // 기본 버튼 스타일 제거 (배경색 등 숨김)

                // ─── 가운데: 제목 + 메타데이터 뱃지 영역 ───
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .top) {
                        // 할 일 제목 텍스트
                        // 완료 시: 회색으로 변하고 취소선 표시
                        Text(todo.title)
                            .font(.body.weight(.medium))
                            .foregroundStyle(todo.isCompleted ? .secondary : .white)
                            .strikethrough(todo.isCompleted, color: .secondary) // 완료 시 취소선
                            .lineLimit(2)       // 최대 2줄
                            .multilineTextAlignment(.leading)

                        Spacer(minLength: 8)

                        // 우선순위 뱃지 (compact: 아이콘만 표시)
                        PriorityBadge(priority: todo.priority, compact: true)
                    }

                    // 메타데이터 뱃지 영역 (마감일, 카테고리)
                    HStack(spacing: 6) {
                        // 마감일이 있으면 날짜 뱃지 표시 (기한 초과 시 빨강, 오늘 시 주황)
                        if let dueDate = todo.dueDate {
                            DueDateBadge(date: dueDate, isCompleted: todo.isCompleted)
                        }
                        // 카테고리가 있으면 카테고리 뱃지 표시
                        if let category = todo.category {
                            CategoryBadge(category: category)
                        }
                    }

                    // 메모가 있을 때만 한 줄로 미리보기
                    if !todo.notes.isEmpty {
                        Text(todo.notes)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(1) // 목록에서는 1줄만 표시
                    }
                }

                // ─── 오른쪽: 상세 보기 진입 화살표 ───
                Image(systemName: "chevron.right")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            .padding(.vertical, 12)
            .padding(.horizontal, 16)
            .background {
                // 글래스 카드 스타일 배경 (완료 시 투명도 감소)
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .overlay {
                        // 테두리: 완료 시 더 투명하게
                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                            .strokeBorder(
                                todo.isCompleted
                                ? Color.white.opacity(0.08) // 완료: 거의 투명
                                : Color.white.opacity(0.15), // 미완료: 반투명
                                lineWidth: 1
                            )
                    }
                    .opacity(todo.isCompleted ? 0.6 : 1.0) // 완료 시 전체 투명도 60%
            }
        }
        .buttonStyle(.plain)
        // isCompleted 값 변경 시 스프링 애니메이션 적용
        .animation(.spring(response: 0.3), value: todo.isCompleted)
        // 접근성: 여러 하위 요소를 하나로 합쳐서 보이스오버에서 한 번에 읽히게 함
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(todo.title), \(todo.priority.displayName) priority, \(todo.isCompleted ? "completed" : "active")")
        .accessibilityHint("Double tap to view details")
    }
}
