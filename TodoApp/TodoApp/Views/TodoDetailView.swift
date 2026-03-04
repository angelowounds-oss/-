// 할 일 항목의 상세 정보를 표시하는 뷰입니다.
// 제목, 메모, 상태/우선순위/마감일/카테고리/생성일 정보를 보여주고
// 완료 상태를 바로 전환하거나 편집 시트를 열 수 있습니다.

import SwiftUI
import SwiftData

// 할 일 상세 뷰
struct TodoDetailView: View {
    // ✅ @Bindable: todo 객체의 프로퍼티를 이 뷰에서 직접 수정할 수 있게 해주는 매크로
    // isCompleted를 변경하면 SwiftData가 자동으로 DB에 반영합니다.
    @Bindable var todo: TodoItem
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    @State private var showingEdit = false // 편집 시트 표시 여부

    var body: some View {
        ZStack {
            AppBackground()

            ScrollView {
                VStack(spacing: 16) {
                    // ─── 헤더 카드: 제목 + 우선순위 뱃지 + 메모 ───
                    GlassCard {
                        VStack(alignment: .leading, spacing: 14) {
                            HStack(alignment: .top) {
                                // 제목 텍스트 (완료 시 취소선 + 회색)
                                Text(todo.title)
                                    .font(.title3.weight(.semibold))
                                    .foregroundStyle(todo.isCompleted ? .secondary : .white)
                                    .strikethrough(todo.isCompleted) // 완료 시 취소선
                                    .multilineTextAlignment(.leading)

                                Spacer()

                                // 우선순위 뱃지 (아이콘 + 이름 캡슐 형태)
                                PriorityBadge(priority: todo.priority)
                            }

                            // 메모가 있을 때만 구분선 + 메모 표시
                            if !todo.notes.isEmpty {
                                Divider().background(.white.opacity(0.2))
                                Text(todo.notes)
                                    .font(.body)
                                    .foregroundStyle(.white.opacity(0.75))
                            }
                        }
                    }

                    // ─── 메타 정보 그리드 (2열 배치) ───
                    // ✅ LazyVGrid: 2열 그리드로 정보 카드를 배치합니다.
                    LazyVGrid(
                        columns: [GridItem(.flexible()), GridItem(.flexible())],
                        spacing: 12
                    ) {
                        // 완료 상태 카드 (완료=초록, 미완료=주황)
                        DetailMetaCard(
                            icon: "checkmark.circle.fill",
                            iconColor: todo.isCompleted ? .green : .orange,
                            title: "Status",
                            value: todo.isCompleted ? "Completed" : "Active"
                        )

                        // 우선순위 카드
                        DetailMetaCard(
                            icon: todo.priority.systemImage,
                            iconColor: todo.priority.color,
                            title: "Priority",
                            value: todo.priority.displayName
                        )

                        // 마감일 카드 (마감일이 있을 때만 표시)
                        // 기한 초과 시 빨강, 정상 시 파랑
                        if let due = todo.dueDate {
                            DetailMetaCard(
                                icon: "calendar",
                                iconColor: todo.isOverdue ? .red : .blue,
                                title: "Due Date",
                                value: due.formatted(date: .abbreviated, time: .shortened)
                            )
                        }

                        // 카테고리 카드 (카테고리가 있을 때만 표시)
                        if let cat = todo.category {
                            DetailMetaCard(
                                icon: cat.systemImage,
                                iconColor: cat.color,
                                title: "Category",
                                value: cat.rawValue
                            )
                        }

                        // 생성일 카드 (항상 표시)
                        DetailMetaCard(
                            icon: "clock",
                            iconColor: .gray,
                            title: "Created",
                            value: todo.createdAt.formatted(date: .abbreviated, time: .shortened)
                        )
                    }

                    // ─── 완료 상태 전환 버튼 ───
                    // ✅ 누를 때마다 isCompleted를 뒤집고 스프링 애니메이션 실행
                    // 완료 상태면 주황(되돌리기), 미완료면 초록(완료하기)으로 표시됩니다.
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
            // 오른쪽 상단: 편집 버튼 → 편집 시트 열기
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Edit") { showingEdit = true }
                    .foregroundStyle(.white)
            }
        }
        // 편집 시트: showingEdit이 true가 되면 자동으로 표시됩니다.
        .sheet(isPresented: $showingEdit) {
            AddEditTodoView(existingTodo: todo)
        }
    }
}

// MARK: - Detail Meta Card

// ✅ 상세 화면의 그리드에서 사용하는 작은 정보 카드 컴포넌트
// 아이콘 + 제목 레이블 + 값 텍스트를 수직으로 배치합니다.
// private: 이 파일 안에서만 사용되는 내부 컴포넌트
private struct DetailMetaCard: View {
    let icon: String      // SF Symbol 아이콘 이름
    let iconColor: Color  // 아이콘 색상
    let title: String     // 항목 레이블 (예: "Status", "Priority")
    let value: String     // 항목 값 (예: "Completed", "High")

    var body: some View {
        GlassCard(cornerRadius: 14, padding: 12) {
            VStack(alignment: .leading, spacing: 8) {
                // 아이콘
                Image(systemName: icon)
                    .font(.title2)
                    .foregroundStyle(iconColor)

                VStack(alignment: .leading, spacing: 2) {
                    // 레이블 텍스트 (작고 흐리게)
                    Text(title)
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(.white.opacity(0.5))
                    // 값 텍스트 (굵게, 최대 2줄)
                    Text(value)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.white)
                        .lineLimit(2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading) // 카드 왼쪽 정렬
        }
    }
}
