// 할 일을 새로 추가하거나 기존 항목을 편집하는 폼 뷰입니다.
// existingTodo가 nil이면 "새 항목 추가" 모드, 값이 있으면 "편집" 모드로 동작합니다.

import SwiftUI
import SwiftData

// 할 일 추가/편집 폼 뷰
struct AddEditTodoView: View {
    // SwiftData DB 컨텍스트 (새 항목 삽입에 사용)
    @Environment(\.modelContext) private var modelContext
    // 시트를 닫을 때 사용하는 dismiss 함수
    @Environment(\.dismiss) private var dismiss

    // 편집 대상 항목 (nil이면 새 항목 추가 모드)
    let existingTodo: TodoItem?

    // ─── 폼 상태 변수들 ───
    @State private var title       = ""                               // 제목 입력값
    @State private var notes       = ""                               // 메모 입력값
    @State private var priority    = Priority.medium                  // 선택된 우선순위
    @State private var hasDueDate  = false                            // 마감일 사용 여부
    @State private var dueDate     = Date.now.addingTimeInterval(86400) // 마감일 (기본: 내일)
    @State private var category: TodoCategory? = nil                  // 선택된 카테고리
    @State private var isCompleted = false                            // 완료 여부 (편집 모드에서만 사용)

    // 편집 모드 여부: existingTodo가 있으면 true
    private var isEditing: Bool { existingTodo != nil }
    // 저장 가능 여부: 제목이 공백이 아닌 문자를 포함하면 true
    private var isValid:   Bool { !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var body: some View {
        NavigationStack {
            ZStack {
                AppBackground()

                ScrollView {
                    VStack(spacing: 16) {
                        // ─── 제목 카드 ───
                        GlassCard {
                            VStack(alignment: .leading, spacing: 10) {
                                Label("Title", systemImage: "text.cursor")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.white.opacity(0.6))

                                // 세로로 늘어나는 텍스트 입력 (최대 4줄)
                                TextField("What needs to be done?", text: $title, axis: .vertical)
                                    .font(.body)
                                    .foregroundStyle(.white)
                                    .lineLimit(1...4)
                                    .tint(.white)
                            }
                        }

                        // ─── 메모 카드 ───
                        GlassCard {
                            VStack(alignment: .leading, spacing: 10) {
                                Label("Notes", systemImage: "note.text")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.white.opacity(0.6))

                                // 세로로 늘어나는 텍스트 입력 (최대 6줄)
                                TextField("Add notes (optional)", text: $notes, axis: .vertical)
                                    .font(.body)
                                    .foregroundStyle(.white)
                                    .lineLimit(2...6)
                                    .tint(.white)
                            }
                        }

                        // ─── 우선순위 카드 ───
                        GlassCard {
                            VStack(alignment: .leading, spacing: 12) {
                                Label("Priority", systemImage: "flag.fill")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.white.opacity(0.6))

                                // 3개 우선순위 버튼을 가로로 나란히 배치
                                HStack(spacing: 10) {
                                    ForEach(Priority.allCases, id: \.self) { p in
                                        priorityOption(p)
                                    }
                                }
                            }
                        }

                        // ─── 마감일 카드 ───
                        GlassCard {
                            VStack(alignment: .leading, spacing: 12) {
                                HStack {
                                    Label("Due Date", systemImage: "calendar")
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(.white.opacity(0.6))
                                    Spacer()
                                    // 마감일 사용 여부 토글 (켜면 날짜 선택기 표시)
                                    Toggle("", isOn: $hasDueDate.animation())
                                        .labelsHidden()
                                        .tint(.green)
                                }

                                // hasDueDate가 true일 때만 날짜 선택기 표시
                                if hasDueDate {
                                    DatePicker(
                                        "",
                                        selection: $dueDate,
                                        in: Date.now...,  // 현재 이후만 선택 가능
                                        displayedComponents: [.date, .hourAndMinute]
                                    )
                                    .datePickerStyle(.graphical) // 달력 형태로 표시
                                    .colorScheme(.dark)
                                    .tint(.white)
                                    // 켜고 끌 때 슬라이드 애니메이션
                                    .transition(.asymmetric(
                                        insertion: .push(from: .top).combined(with: .opacity),
                                        removal: .push(from: .bottom).combined(with: .opacity)
                                    ))
                                }
                            }
                        }

                        // ─── 카테고리 카드 ───
                        GlassCard {
                            VStack(alignment: .leading, spacing: 12) {
                                Label("Category", systemImage: "tag.fill")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.white.opacity(0.6))

                                // 가로 스크롤 가능한 카테고리 칩 목록
                                ScrollView(.horizontal, showsIndicators: false) {
                                    HStack(spacing: 8) {
                                        // None option: 카테고리 없음 선택
                                        categoryChip(nil)
                                        ForEach(TodoCategory.allCases, id: \.self) { cat in
                                            categoryChip(cat)
                                        }
                                    }
                                }
                            }
                        }

                        // ─── 완료 상태 카드 (편집 모드에서만 표시) ───
                        if isEditing {
                            GlassCard {
                                HStack {
                                    Label("Mark as Complete", systemImage: "checkmark.circle.fill")
                                        .font(.body)
                                        .foregroundStyle(.white)
                                    Spacer()
                                    Toggle("", isOn: $isCompleted)
                                        .labelsHidden()
                                        .tint(.green)
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 16)
                    .padding(.bottom, 40)
                }
                .scrollContentBackground(.hidden)
            }
            // 편집 모드면 "Edit Todo", 추가 모드면 "New Todo"
            .navigationTitle(isEditing ? "Edit Todo" : "New Todo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                // 왼쪽: 취소 버튼 (저장 없이 닫기)
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(.white.opacity(0.8))
                }
                // 오른쪽: 저장 버튼 (제목이 비면 비활성화)
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        save()    // DB에 저장
                        dismiss() // 시트 닫기
                    }
                    .fontWeight(.semibold)
                    .foregroundStyle(isValid ? .white : .white.opacity(0.4)) // 유효하지 않으면 흐리게
                    .disabled(!isValid) // 제목이 없으면 탭 불가
                }
            }
        }
        // ✅ onAppear: 편집 모드 진입 시 기존 데이터로 상태 변수를 채워 넣습니다.
        // 새 항목 추가 모드에서는 existingTodo가 nil이라 이 블록이 실행되지 않습니다.
        .onAppear {
            if let todo = existingTodo {
                title       = todo.title
                notes       = todo.notes
                priority    = todo.priority
                hasDueDate  = todo.dueDate != nil
                dueDate     = todo.dueDate ?? Date.now.addingTimeInterval(86400)
                category    = todo.category
                isCompleted = todo.isCompleted
            }
        }
    }

    // MARK: - Priority Option

    // 우선순위 선택 버튼 하나를 생성합니다.
    // 선택된 우선순위는 색상 배경과 테두리로 강조 표시됩니다.
    private func priorityOption(_ p: Priority) -> some View {
        let selected = priority == p // 현재 버튼이 선택된 상태인지 확인
        return Button {
            withAnimation(.spring(response: 0.25)) { priority = p } // 탭 시 우선순위 변경
        } label: {
            VStack(spacing: 4) {
                // 우선순위 아이콘 (선택 시 해당 색상, 미선택 시 흰색 투명)
                Image(systemName: p.systemImage)
                    .font(.title2)
                    .foregroundStyle(selected ? p.color : .white.opacity(0.4))
                // 우선순위 이름 텍스트
                Text(p.displayName)
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(selected ? p.color : .white.opacity(0.4))
            }
            .frame(maxWidth: .infinity) // 가로로 균등하게 채우기
            .padding(.vertical, 10)
            .background {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(selected ? p.color.opacity(0.2) : Color.white.opacity(0.05))
                    .overlay {
                        // 선택된 버튼에만 색상 테두리 추가
                        if selected {
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .strokeBorder(p.color.opacity(0.6), lineWidth: 1.5)
                        }
                    }
            }
        }
        .buttonStyle(.plain)
        .animation(.spring(response: 0.25), value: priority)
    }

    // MARK: - Category Chip

    // 카테고리 선택 칩 하나를 생성합니다.
    // nil을 전달하면 "None"(카테고리 없음) 칩을 생성합니다.
    private func categoryChip(_ cat: TodoCategory?) -> some View {
        let selected = category == cat           // 현재 칩이 선택된 상태인지 확인
        let label = cat?.rawValue ?? "None"      // nil이면 "None" 표시
        let icon  = cat?.systemImage ?? "xmark.circle" // nil이면 X 아이콘
        let color = cat?.color ?? Color.white.opacity(0.4) // nil이면 흰색 반투명

        return Button {
            withAnimation(.spring(response: 0.25)) { category = cat } // 탭 시 카테고리 변경
        } label: {
            Label(label, systemImage: icon)
                .font(.caption.weight(.medium))
                .foregroundStyle(selected ? .black : color) // 선택: 검정, 미선택: 해당 색상
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background {
                    if selected {
                        Capsule().fill(color)                           // 선택: 색상으로 채우기
                    } else {
                        Capsule().fill(.ultraThinMaterial)              // 미선택: 블러 배경
                        Capsule().strokeBorder(color.opacity(0.4), lineWidth: 1) // 미선택: 테두리
                    }
                }
        }
        .buttonStyle(.plain)
        .animation(.spring(response: 0.25), value: category)
    }

    // MARK: - Save

    // ✅ 저장 함수: 편집 모드와 추가 모드에 따라 다르게 동작합니다.
    private func save() {
        // 제목 앞뒤 공백 제거 후 빈 문자열이면 저장 중단
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else { return }

        if let todo = existingTodo {
            // ─── 편집 모드: 기존 항목의 프로퍼티를 직접 수정 ───
            // SwiftData가 변경을 감지해 자동으로 DB에 저장합니다.
            todo.title       = trimmedTitle
            todo.notes       = notes
            todo.priority    = priority
            todo.dueDate     = hasDueDate ? dueDate : nil // 토글 꺼짐 시 마감일 제거
            todo.category    = category
            todo.isCompleted = isCompleted
        } else {
            // ─── 추가 모드: 새 TodoItem 생성 후 DB에 삽입 ───
            let newItem = TodoItem(
                title:    trimmedTitle,
                notes:    notes,
                priority: priority,
                dueDate:  hasDueDate ? dueDate : nil,
                category: category
            )
            modelContext.insert(newItem) // DB에 새 항목 추가
        }
    }
}
