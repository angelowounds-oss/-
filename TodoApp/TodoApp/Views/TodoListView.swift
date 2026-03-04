// 할 일 목록을 표시하는 메인 화면입니다.
// 검색, 필터(상태/우선순위), 정렬 기능을 제공하며
// SwiftData의 @Query로 DB 데이터를 실시간으로 불러와 표시합니다.

import SwiftUI
import SwiftData

// MARK: - Filter & Sort State

// 완료 상태 필터 옵션 (all: 전체, active: 미완료, completed: 완료)
enum FilterStatus: String, CaseIterable {
    case all       = "All"
    case active    = "Active"
    case completed = "Done"
}

// 정렬 기준 옵션
enum SortOption: String, CaseIterable {
    case createdAt = "Date Added" // 추가된 날짜순
    case dueDate   = "Due Date"   // 마감일순
    case priority  = "Priority"   // 우선순위순
    case title     = "Title"      // 제목 가나다순
}

// MARK: - TodoListView

// 할 일 목록 메인 뷰: 네비게이션 스택, 검색바, 필터 칩, 정렬 메뉴를 포함합니다.
struct TodoListView: View {
    // SwiftData DB에 접근하기 위한 컨텍스트 (삭제 등에 사용)
    @Environment(\.modelContext) private var modelContext

    @State private var searchText    = ""                    // 현재 입력된 검색어
    @State private var filterStatus  = FilterStatus.all     // 선택된 완료 상태 필터
    @State private var filterPriority: Priority? = nil      // 선택된 우선순위 필터 (nil = 전체)
    @State private var sortOption    = SortOption.createdAt // 현재 정렬 기준
    @State private var showingAdd    = false                 // 새 할 일 추가 시트 표시 여부
    @State private var editingTodo: TodoItem? = nil          // 편집 중인 할 일 (nil이면 시트 닫힘)
    @State private var showSortMenu  = false                 // 정렬 메뉴 표시 여부

    var body: some View {
        NavigationStack {
            ZStack {
                AppBackground()

                VStack(spacing: 0) {
                    // Filter chips: 상태 필터 + 우선순위 필터 칩들
                    filterBar
                        .padding(.horizontal, 16)
                        .padding(.top, 8)
                        .padding(.bottom, 4)

                    // ✅ TodoQueryView: 현재 필터/정렬/검색어를 받아 DB를 조회해 목록을 표시합니다.
                    // 필터/정렬이 바뀔 때마다 새로운 @Query를 실행하기 위해 별도 뷰로 분리됩니다.
                    TodoQueryView(
                        searchText: searchText,
                        filterStatus: filterStatus,
                        filterPriority: filterPriority,
                        sortOption: sortOption,
                        onEdit: { todo in editingTodo = todo }
                    )
                }
            }
            .navigationTitle("My Todos")
            .navigationBarTitleDisplayMode(.large)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar) // 네비게이션 바 배경 블러
            .toolbarColorScheme(.dark, for: .navigationBar)             // 네비게이션 바 텍스트 흰색
            .searchable(text: $searchText, prompt: "Search todos…")     // 상단 검색바 추가
            .toolbar {
                // 왼쪽 상단: 정렬 메뉴 버튼
                ToolbarItem(placement: .navigationBarLeading) {
                    sortMenuButton
                }
                // 오른쪽 상단: 새 할 일 추가 버튼
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        showingAdd = true
                    } label: {
                        Image(systemName: "plus.circle.fill")
                            .font(.title2)
                            .foregroundStyle(.white)
                            .symbolRenderingMode(.hierarchical)
                    }
                }
            }
            // 새 할 일 추가 시트
            .sheet(isPresented: $showingAdd) {
                AddEditTodoView(existingTodo: nil) // nil → 새 항목 추가 모드
            }
            // 편집 시트: editingTodo가 설정되면 자동으로 시트를 표시합니다.
            .sheet(item: $editingTodo) { todo in
                AddEditTodoView(existingTodo: todo) // todo → 편집 모드
            }
        }
    }

    // MARK: - Filter Bar

    // 수평 스크롤 가능한 필터 칩 모음
    // 왼쪽: 상태 필터(All/Active/Done), 오른쪽: 우선순위 필터(High/Medium/Low)
    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                // 상태 필터 칩들 (All, Active, Done)
                ForEach(FilterStatus.allCases, id: \.self) { status in
                    FilterChip(
                        title: status.rawValue,
                        isSelected: filterStatus == status
                    ) {
                        withAnimation(.spring(response: 0.3)) {
                            filterStatus = status // 칩 탭 시 필터 변경
                        }
                    }
                }

                // 상태 필터와 우선순위 필터 사이의 구분선
                Divider()
                    .frame(height: 20)
                    .background(Color.white.opacity(0.3))
                    .padding(.horizontal, 4)

                // 우선순위 필터 칩들 (High, Medium, Low)
                // 같은 칩을 다시 누르면 필터 해제 (nil로 복귀)
                ForEach(Priority.allCases, id: \.self) { p in
                    FilterChip(
                        title: p.displayName,
                        isSelected: filterPriority == p,
                        color: p.color
                    ) {
                        withAnimation(.spring(response: 0.3)) {
                            filterPriority = filterPriority == p ? nil : p
                        }
                    }
                }
            }
            .padding(.vertical, 4)
        }
    }

    // MARK: - Sort Menu

    // 정렬 기준을 선택하는 메뉴 버튼
    // 현재 선택된 항목에는 체크마크가 표시됩니다.
    private var sortMenuButton: some View {
        Menu {
            ForEach(SortOption.allCases, id: \.self) { option in
                Button {
                    withAnimation { sortOption = option }
                } label: {
                    if sortOption == option {
                        Label(option.rawValue, systemImage: "checkmark") // 선택 중 항목에 체크마크
                    } else {
                        Text(option.rawValue)
                    }
                }
            }
        } label: {
            Image(systemName: "arrow.up.arrow.down")
                .font(.body.weight(.medium))
                .foregroundStyle(.white)
        }
    }
}

// MARK: - Dynamic Query View

// ✅ SwiftData @Query를 동적으로 변경하기 위해 분리된 하위 뷰입니다.
// 정렬 기준이 바뀔 때마다 init()에서 새 SortDescriptor를 만들어 @Query에 전달합니다.
// (SwiftUI에서 @Query의 정렬을 런타임에 바꾸려면 이 패턴이 필요합니다)
private struct TodoQueryView: View {
    @Environment(\.modelContext) private var modelContext

    let searchText: String         // 검색어
    let filterStatus: FilterStatus // 완료 상태 필터
    let filterPriority: Priority?  // 우선순위 필터 (nil = 전체)
    let sortOption: SortOption     // 정렬 기준
    let onEdit: (TodoItem) -> Void // 편집 버튼 탭 시 상위 뷰에 알리는 콜백

    // ✅ @Query: SwiftData DB에서 데이터를 자동으로 불러오는 매크로
    // DB가 변경될 때마다 todos 배열이 자동으로 업데이트되고 뷰가 다시 그려집니다.
    @Query private var todos: [TodoItem]

    // ✅ init에서 정렬 기준에 따라 SortDescriptor를 동적으로 생성합니다.
    init(
        searchText: String,
        filterStatus: FilterStatus,
        filterPriority: Priority?,
        sortOption: SortOption,
        onEdit: @escaping (TodoItem) -> Void
    ) {
        self.searchText = searchText
        self.filterStatus = filterStatus
        self.filterPriority = filterPriority
        self.sortOption = sortOption
        self.onEdit = onEdit

        // 정렬 기준에 맞는 SortDescriptor 생성
        let sortDescriptor: SortDescriptor<TodoItem>
        switch sortOption {
        case .createdAt: sortDescriptor = SortDescriptor(\.createdAt, order: .reverse)  // 최신순
        case .dueDate:   sortDescriptor = SortDescriptor(\.dueDate)                     // 마감일 빠른 순
        case .priority:  sortDescriptor = SortDescriptor(\.priorityRaw, order: .reverse) // 높은 우선순위 먼저
        case .title:     sortDescriptor = SortDescriptor(\.title)                       // 가나다순
        }

        // 생성한 SortDescriptor로 @Query 초기화
        _todos = Query(sort: [sortDescriptor], animation: .spring(response: 0.3))
    }

    // ✅ filteredTodos: @Query로 가져온 전체 목록을 상태/우선순위/검색어로 걸러냅니다.
    var filteredTodos: [TodoItem] {
        todos.filter { todo in
            // Status filter: 완료 상태 필터
            switch filterStatus {
            case .all:       break                                  // 전체: 필터 없음
            case .active:    if todo.isCompleted { return false }  // 미완료만
            case .completed: if !todo.isCompleted { return false } // 완료만
            }

            // Priority filter: 우선순위 필터 (nil이면 전체)
            if let p = filterPriority, todo.priority != p { return false }

            // Search: 검색어 필터 (제목 또는 메모에 포함되면 통과)
            if !searchText.isEmpty {
                let q = searchText.lowercased()
                if !todo.title.lowercased().contains(q) &&
                   !todo.notes.lowercased().contains(q) {
                    return false
                }
            }

            return true
        }
    }

    var body: some View {
        Group {
            if filteredTodos.isEmpty {
                // 결과가 없을 때 빈 상태 화면 표시
                emptyState
            } else {
                ScrollView {
                    LazyVStack(spacing: 10) {
                        // filteredTodos를 순서대로 행으로 표시
                        ForEach(filteredTodos) { todo in
                            // 탭하면 상세 뷰로 이동
                            NavigationLink(destination: TodoDetailView(todo: todo)) {
                                TodoRowView(todo: todo, onTap: {})
                            }
                            .buttonStyle(.plain)
                            // 항목 추가/삭제 시 애니메이션
                            .transition(.asymmetric(
                                insertion: .opacity.combined(with: .move(edge: .top)),
                                removal: .opacity.combined(with: .scale(scale: 0.95))
                            ))
                            // 길게 눌렀을 때 나타나는 컨텍스트 메뉴
                            .contextMenu {
                                // 완료/미완료 전환
                                Button {
                                    withAnimation { todo.isCompleted.toggle() }
                                } label: {
                                    Label(
                                        todo.isCompleted ? "Mark Active" : "Mark Complete",
                                        systemImage: todo.isCompleted ? "arrow.uturn.backward" : "checkmark.circle"
                                    )
                                }
                                // 편집 (상위 뷰의 onEdit 콜백 호출)
                                Button {
                                    onEdit(todo)
                                } label: {
                                    Label("Edit", systemImage: "pencil")
                                }
                                    Divider()
                                    // 삭제 (빨간색 파괴 버튼)
                                    Button(role: .destructive) {
                                        withAnimation(.spring()) { modelContext.delete(todo) }
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                                // 오른쪽으로 스와이프: 삭제
                                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                    Button(role: .destructive) {
                                        withAnimation(.spring()) { modelContext.delete(todo) }
                                    } label: {
                                        Label("Delete", systemImage: "trash.fill")
                                    }
                                }
                                // 왼쪽으로 스와이프: 완료/미완료 전환
                                .swipeActions(edge: .leading, allowsFullSwipe: true) {
                                    Button {
                                        withAnimation(.spring()) { todo.isCompleted.toggle() }
                                    } label: {
                                        Label(
                                            todo.isCompleted ? "Undo" : "Done",
                                            systemImage: todo.isCompleted ? "arrow.uturn.backward" : "checkmark.circle.fill"
                                        )
                                    }
                                    .tint(todo.isCompleted ? .orange : .green)
                                }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .padding(.bottom, 100) // 탭바 위 여백
                }
                .scrollContentBackground(.hidden) // 스크롤뷰 기본 배경 숨기기
            }
        }
    }

    // 검색/필터 결과가 없을 때 표시되는 빈 상태 화면
    private var emptyState: some View {
        VStack(spacing: 20) {
            Spacer()
            GlassCard {
                VStack(spacing: 16) {
                    // 검색/필터 중이면 돋보기, 아니면 체크리스트 아이콘
                    Image(systemName: searchText.isEmpty && filterStatus == .all
                          ? "checklist" : "magnifyingglass")
                        .font(.system(size: 44))
                        .foregroundStyle(.white.opacity(0.4))

                    // 상황에 맞는 제목
                    Text(searchText.isEmpty && filterStatus == .all
                         ? "No Todos Yet"
                         : "No Results")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.white)

                    // 상황에 맞는 안내 문구
                    Text(searchText.isEmpty && filterStatus == .all
                         ? "Tap + to add your first todo"
                         : "Try adjusting your filters")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.6))
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
            }
            .padding(.horizontal, 32)
            Spacer()
        }
    }
}

// MARK: - Filter Chip

// 필터 바에서 사용하는 선택 가능한 칩(버튼) 컴포넌트
// 선택 시 배경이 채워지고, 미선택 시 반투명 테두리만 표시됩니다.
struct FilterChip: View {
    let title: String       // 칩에 표시할 텍스트
    let isSelected: Bool    // 현재 선택 여부
    var color: Color = .white // 칩 색상 (기본 흰색, 우선순위 칩은 해당 색상)
    let action: () -> Void  // 탭 시 실행할 동작

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(isSelected ? .semibold : .regular))
                .foregroundStyle(isSelected ? .black : color.opacity(0.8)) // 선택: 검정, 미선택: 색상
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background {
                    if isSelected {
                        Capsule().fill(color)              // 선택: 색상으로 채우기
                    } else {
                        Capsule().fill(.ultraThinMaterial) // 미선택: 블러 배경
                    }
                }
                .overlay {
                    if !isSelected {
                        Capsule().strokeBorder(color.opacity(0.3), lineWidth: 1) // 미선택: 얇은 테두리
                    }
                }
        }
        .buttonStyle(.plain)
        .animation(.spring(response: 0.25), value: isSelected) // 선택 상태 변경 시 애니메이션
    }
}
