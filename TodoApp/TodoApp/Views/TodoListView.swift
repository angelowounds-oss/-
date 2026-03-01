import SwiftUI
import SwiftData

// MARK: - Filter & Sort State

enum FilterStatus: String, CaseIterable {
    case all       = "All"
    case active    = "Active"
    case completed = "Done"
}

enum SortOption: String, CaseIterable {
    case createdAt = "Date Added"
    case dueDate   = "Due Date"
    case priority  = "Priority"
    case title     = "Title"
}

// MARK: - TodoListView

struct TodoListView: View {
    @Environment(\.modelContext) private var modelContext

    @State private var searchText    = ""
    @State private var filterStatus  = FilterStatus.all
    @State private var filterPriority: Priority? = nil
    @State private var sortOption    = SortOption.createdAt
    @State private var showingAdd    = false
    @State private var editingTodo: TodoItem? = nil
    @State private var showSortMenu  = false

    var body: some View {
        NavigationStack {
            ZStack {
                AppBackground()

                VStack(spacing: 0) {
                    // Filter chips
                    filterBar
                        .padding(.horizontal, 16)
                        .padding(.top, 8)
                        .padding(.bottom, 4)

                    // Dynamic query view
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
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .searchable(text: $searchText, prompt: "Search todos…")
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    sortMenuButton
                }
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
            .sheet(isPresented: $showingAdd) {
                AddEditTodoView(existingTodo: nil)
            }
            .sheet(item: $editingTodo) { todo in
                AddEditTodoView(existingTodo: todo)
            }
        }
    }

    // MARK: - Filter Bar

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(FilterStatus.allCases, id: \.self) { status in
                    FilterChip(
                        title: status.rawValue,
                        isSelected: filterStatus == status
                    ) {
                        withAnimation(.spring(response: 0.3)) {
                            filterStatus = status
                        }
                    }
                }

                Divider()
                    .frame(height: 20)
                    .background(Color.white.opacity(0.3))
                    .padding(.horizontal, 4)

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

    private var sortMenuButton: some View {
        Menu {
            ForEach(SortOption.allCases, id: \.self) { option in
                Button {
                    withAnimation { sortOption = option }
                } label: {
                    if sortOption == option {
                        Label(option.rawValue, systemImage: "checkmark")
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

private struct TodoQueryView: View {
    @Environment(\.modelContext) private var modelContext

    let searchText: String
    let filterStatus: FilterStatus
    let filterPriority: Priority?
    let sortOption: SortOption
    let onEdit: (TodoItem) -> Void

    @Query private var todos: [TodoItem]

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

        let sortDescriptor: SortDescriptor<TodoItem>
        switch sortOption {
        case .createdAt: sortDescriptor = SortDescriptor(\.createdAt, order: .reverse)
        case .dueDate:   sortDescriptor = SortDescriptor(\.dueDate)
        case .priority:  sortDescriptor = SortDescriptor(\.priorityRaw, order: .reverse)
        case .title:     sortDescriptor = SortDescriptor(\.title)
        }

        _todos = Query(sort: [sortDescriptor], animation: .spring(response: 0.3))
    }

    var filteredTodos: [TodoItem] {
        todos.filter { todo in
            // Status filter
            switch filterStatus {
            case .all:       break
            case .active:    if todo.isCompleted { return false }
            case .completed: if !todo.isCompleted { return false }
            }

            // Priority filter
            if let p = filterPriority, todo.priority != p { return false }

            // Search
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
                emptyState
            } else {
                ScrollView {
                    LazyVStack(spacing: 10) {
                        ForEach(filteredTodos) { todo in
                            NavigationLink(destination: TodoDetailView(todo: todo)) {
                                TodoRowView(todo: todo, onTap: {})
                            }
                            .buttonStyle(.plain)
                            .transition(.asymmetric(
                                insertion: .opacity.combined(with: .move(edge: .top)),
                                removal: .opacity.combined(with: .scale(scale: 0.95))
                            ))
                            .contextMenu {
                                Button {
                                    withAnimation { todo.isCompleted.toggle() }
                                } label: {
                                    Label(
                                        todo.isCompleted ? "Mark Active" : "Mark Complete",
                                        systemImage: todo.isCompleted ? "arrow.uturn.backward" : "checkmark.circle"
                                    )
                                }
                                Button {
                                    onEdit(todo)
                                } label: {
                                    Label("Edit", systemImage: "pencil")
                                }
                                    Divider()
                                    Button(role: .destructive) {
                                        withAnimation(.spring()) { modelContext.delete(todo) }
                                    } label: {
                                        Label("Delete", systemImage: "trash")
                                    }
                                }
                                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                    Button(role: .destructive) {
                                        withAnimation(.spring()) { modelContext.delete(todo) }
                                    } label: {
                                        Label("Delete", systemImage: "trash.fill")
                                    }
                                }
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
                    .padding(.bottom, 100)
                }
                .scrollContentBackground(.hidden)
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 20) {
            Spacer()
            GlassCard {
                VStack(spacing: 16) {
                    Image(systemName: searchText.isEmpty && filterStatus == .all
                          ? "checklist" : "magnifyingglass")
                        .font(.system(size: 44))
                        .foregroundStyle(.white.opacity(0.4))

                    Text(searchText.isEmpty && filterStatus == .all
                         ? "No Todos Yet"
                         : "No Results")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(.white)

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

struct FilterChip: View {
    let title: String
    let isSelected: Bool
    var color: Color = .white
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(isSelected ? .semibold : .regular))
                .foregroundStyle(isSelected ? .black : color.opacity(0.8))
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .background {
                    if isSelected {
                        Capsule().fill(color)
                    } else {
                        Capsule().fill(.ultraThinMaterial)
                    }
                }
                .overlay {
                    if !isSelected {
                        Capsule().strokeBorder(color.opacity(0.3), lineWidth: 1)
                    }
                }
        }
        .buttonStyle(.plain)
        .animation(.spring(response: 0.25), value: isSelected)
    }
}
