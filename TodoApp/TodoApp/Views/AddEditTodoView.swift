import SwiftUI
import SwiftData

struct AddEditTodoView: View {
    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    let existingTodo: TodoItem?

    @State private var title       = ""
    @State private var notes       = ""
    @State private var priority    = Priority.medium
    @State private var hasDueDate  = false
    @State private var dueDate     = Date.now.addingTimeInterval(86400)
    @State private var category: TodoCategory? = nil
    @State private var isCompleted = false

    private var isEditing: Bool { existingTodo != nil }
    private var isValid:   Bool { !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    var body: some View {
        NavigationStack {
            ZStack {
                AppBackground()

                ScrollView {
                    VStack(spacing: 16) {
                        // Title card
                        GlassCard {
                            VStack(alignment: .leading, spacing: 10) {
                                Label("Title", systemImage: "text.cursor")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.white.opacity(0.6))

                                TextField("What needs to be done?", text: $title, axis: .vertical)
                                    .font(.body)
                                    .foregroundStyle(.white)
                                    .lineLimit(1...4)
                                    .tint(.white)
                            }
                        }

                        // Notes card
                        GlassCard {
                            VStack(alignment: .leading, spacing: 10) {
                                Label("Notes", systemImage: "note.text")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.white.opacity(0.6))

                                TextField("Add notes (optional)", text: $notes, axis: .vertical)
                                    .font(.body)
                                    .foregroundStyle(.white)
                                    .lineLimit(2...6)
                                    .tint(.white)
                            }
                        }

                        // Priority card
                        GlassCard {
                            VStack(alignment: .leading, spacing: 12) {
                                Label("Priority", systemImage: "flag.fill")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.white.opacity(0.6))

                                HStack(spacing: 10) {
                                    ForEach(Priority.allCases, id: \.self) { p in
                                        priorityOption(p)
                                    }
                                }
                            }
                        }

                        // Due Date card
                        GlassCard {
                            VStack(alignment: .leading, spacing: 12) {
                                HStack {
                                    Label("Due Date", systemImage: "calendar")
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(.white.opacity(0.6))
                                    Spacer()
                                    Toggle("", isOn: $hasDueDate.animation())
                                        .labelsHidden()
                                        .tint(.green)
                                }

                                if hasDueDate {
                                    DatePicker(
                                        "",
                                        selection: $dueDate,
                                        in: Date.now...,
                                        displayedComponents: [.date, .hourAndMinute]
                                    )
                                    .datePickerStyle(.graphical)
                                    .colorScheme(.dark)
                                    .tint(.white)
                                    .transition(.asymmetric(
                                        insertion: .push(from: .top).combined(with: .opacity),
                                        removal: .push(from: .bottom).combined(with: .opacity)
                                    ))
                                }
                            }
                        }

                        // Category card
                        GlassCard {
                            VStack(alignment: .leading, spacing: 12) {
                                Label("Category", systemImage: "tag.fill")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.white.opacity(0.6))

                                ScrollView(.horizontal, showsIndicators: false) {
                                    HStack(spacing: 8) {
                                        // None option
                                        categoryChip(nil)
                                        ForEach(TodoCategory.allCases, id: \.self) { cat in
                                            categoryChip(cat)
                                        }
                                    }
                                }
                            }
                        }

                        // Status card (edit only)
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
            .navigationTitle(isEditing ? "Edit Todo" : "New Todo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
            .toolbarColorScheme(.dark, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(.white.opacity(0.8))
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        save()
                        dismiss()
                    }
                    .fontWeight(.semibold)
                    .foregroundStyle(isValid ? .white : .white.opacity(0.4))
                    .disabled(!isValid)
                }
            }
        }
        .onAppear {
            if let todo = existingTodo {
                title      = todo.title
                notes      = todo.notes
                priority   = todo.priority
                hasDueDate = todo.dueDate != nil
                dueDate    = todo.dueDate ?? Date.now.addingTimeInterval(86400)
                category   = todo.category
                isCompleted = todo.isCompleted
            }
        }
    }

    // MARK: - Priority Option

    private func priorityOption(_ p: Priority) -> some View {
        let selected = priority == p
        return Button {
            withAnimation(.spring(response: 0.25)) { priority = p }
        } label: {
            VStack(spacing: 4) {
                Image(systemName: p.systemImage)
                    .font(.title2)
                    .foregroundStyle(selected ? p.color : .white.opacity(0.4))
                Text(p.displayName)
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(selected ? p.color : .white.opacity(0.4))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .fill(selected ? p.color.opacity(0.2) : Color.white.opacity(0.05))
                    .overlay {
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

    private func categoryChip(_ cat: TodoCategory?) -> some View {
        let selected = category == cat
        let label = cat?.rawValue ?? "None"
        let icon  = cat?.systemImage ?? "xmark.circle"
        let color = cat?.color ?? Color.white.opacity(0.4)

        return Button {
            withAnimation(.spring(response: 0.25)) { category = cat }
        } label: {
            Label(label, systemImage: icon)
                .font(.caption.weight(.medium))
                .foregroundStyle(selected ? .black : color)
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background {
                    if selected {
                        Capsule().fill(color)
                    } else {
                        Capsule().fill(.ultraThinMaterial)
                        Capsule().strokeBorder(color.opacity(0.4), lineWidth: 1)
                    }
                }
        }
        .buttonStyle(.plain)
        .animation(.spring(response: 0.25), value: category)
    }

    // MARK: - Save

    private func save() {
        let trimmedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTitle.isEmpty else { return }

        if let todo = existingTodo {
            todo.title       = trimmedTitle
            todo.notes       = notes
            todo.priority    = priority
            todo.dueDate     = hasDueDate ? dueDate : nil
            todo.category    = category
            todo.isCompleted = isCompleted
        } else {
            let newItem = TodoItem(
                title:    trimmedTitle,
                notes:    notes,
                priority: priority,
                dueDate:  hasDueDate ? dueDate : nil,
                category: category
            )
            modelContext.insert(newItem)
        }
    }
}
