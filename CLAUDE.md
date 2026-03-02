# TodoApp - Development Guide for AI Assistants

## Project Overview

**TodoApp** is a modern iOS task management application built with SwiftUI and SwiftData. It features an elegant glass morphism design with a dark theme, allowing users to create, organize, and manage their todos with priorities, categories, due dates, and advanced filtering/sorting capabilities.

- **Platform:** iOS 17+
- **Framework:** SwiftUI + SwiftData
- **Architecture:** MVVM-inspired, component-based UI
- **Design:** Glass morphism with dark theme
- **Deployment:** App Store (see `TodoApp/APPSTORE_METADATA.md`)

---

## Repository Structure

```
/
├── README.md                          # Project overview
├── CLAUDE.md                          # This file - AI assistant guidelines
├── .gitignore                         # iOS/Xcode standard exclusions
├── .git/                              # Git configuration
└── TodoApp/                           # Main Xcode project directory
    ├── TodoApp/                       # App source code
    │   ├── TodoAppApp.swift           # App entry point (@main)
    │   ├── ContentView.swift          # Root tab view (Todos & Settings)
    │   ├── Assets.xcassets/           # App icons, colors, images
    │   ├── Models/
    │   │   └── TodoItem.swift         # Core data model with Priority & Category enums
    │   ├── Views/                     # Full-screen & major views
    │   │   ├── TodoListView.swift     # Main list with filters/search
    │   │   ├── TodoDetailView.swift   # View details of a single todo
    │   │   ├── AddEditTodoView.swift  # Create/edit form
    │   │   └── SettingsView.swift     # App preferences
    │   └── Components/                # Reusable UI components
    │       ├── GlassCard.swift        # Glass morphism card + AppBackground
    │       ├── PriorityBadge.swift    # Priority indicator
    │       └── TodoRowView.swift      # List item cell
    ├── TodoAppTests/                  # Unit tests
    │   └── TodoItemTests.swift        # Tests for TodoItem model
    ├── TodoApp.xcodeproj/             # Xcode project configuration
    ├── APPSTORE_METADATA.md           # App Store submission guidelines
    └── Podfile (optional)             # Dependency management if needed
```

---

## Technology Stack & Key Technologies

### Core Frameworks
- **SwiftUI**: Modern declarative UI framework (required iOS 17+)
- **SwiftData**: Apple's modern persistence framework (replacing Core Data)
- **Foundation**: Date, UUID, Calendar utilities
- **Observation**: @Observable macro for state management (iOS 17+)

### Design Patterns
- **MVVM**: Models (TodoItem) + Views (UI components) + ViewModels (implicit via @State/@Query)
- **Component-Based Architecture**: Reusable UI components (GlassCard, PriorityBadge, TodoRowView)
- **Reactive UI**: SwiftUI's property wrappers for state management
- **Query-Based Data Fetching**: SwiftData @Query for dynamic data binding

### Key Design Elements
- **Glass Morphism**: Frosted glass effect using `.ultraThinMaterial` with gradient borders
- **Dark Theme**: Gradient background from dark blue to deeper blue
- **Accessibility**: Labels, accessibility modifiers on interactive elements
- **Animations**: Spring-based animations for transitions and interactions

---

## Code Conventions & Patterns

### 1. **File Organization**
Each Swift file should have a single primary type/feature. Use `// MARK:` comments to organize code sections:

```swift
import SwiftUI
import SwiftData

// MARK: - Priority Enum
enum Priority: String, Codable, CaseIterable, Comparable {
    // Implementation
}

// MARK: - TodoItem Model
@Model
final class TodoItem {
    // Implementation
}
```

### 2. **Model Architecture (SwiftData)**
- Use `@Model` macro for SwiftData persistence
- Store enum values as raw strings using `Raw` suffixed properties:
  ```swift
  @Model
  final class TodoItem {
      var priorityRaw: String  // Stored in database
      var priority: Priority {  // Computed property for type-safe access
          get { Priority(rawValue: priorityRaw) ?? .medium }
          set { priorityRaw = newValue.rawValue }
      }
  }
  ```
- Provide sensible defaults in initializers
- Include computed properties for derived values (`isOverdue`, `isDueToday`)

### 3. **View Architecture**
- **Small, Composable Views**: Each view component should have a single responsibility
- **State Management**:
  - `@State` for local, mutable UI state
  - `@Environment(\.modelContext)` for SwiftData operations
  - `@Query` for filtered data fetching with reactive updates
- **Nested Private Structs**: Organize sub-views as private structs within parent views:
  ```swift
  struct TodoListView: View {
      var body: some View { /* ... */ }

      private var filterBar: some View { /* ... */ }
      private var sortMenuButton: some View { /* ... */ }
  }

  private struct TodoQueryView: View { /* ... */ }
  ```

### 4. **Enumerations & Configuration**
Use enums with associated properties for UI presentation:

```swift
enum Priority: String, Codable, CaseIterable, Comparable {
    case low, medium, high

    var displayName: String { /* ... */ }
    var color: Color { /* ... */ }
    var systemImage: String { /* ... */ }
}
```

### 5. **Component Design**
Reusable components should use `@ViewBuilder` for flexible content:

```swift
struct GlassCard<Content: View>: View {
    var cornerRadius: CGFloat = 20
    @ViewBuilder var content: () -> Content

    var body: some View {
        content()
            .padding(padding)
            .background { /* glass morphism */ }
    }
}
```

### 6. **SwiftUI Best Practices**
- **Use ViewBuilder**: For composable, flexible content
- **Spring Animations**: `withAnimation(.spring(response: 0.3))`
- **Lightweight Transitions**: Asymmetric insertion/removal for smooth UX
- **Accessibility**: Add `.accessibilityLabel()` to interactive elements
- **Safe Area Handling**: Use `.ignoresSafeArea()` only when necessary
- **Lazy Loading**: Use `LazyVStack` for performance with large lists

### 7. **Naming Conventions**
- **Views**: PascalCase (`TodoListView`, `AddEditTodoView`)
- **State Properties**: camelCase (`searchText`, `filterStatus`, `showingAdd`)
- **Enums & Models**: PascalCase (`Priority`, `TodoCategory`, `TodoItem`)
- **Boolean Properties**: Use clear prefixes (`isCompleted`, `isDueToday`, `showingAdd`)
- **Computed Properties for UI**: Use descriptive names (`filteredTodos`, `emptyState`)

### 8. **Comments & Documentation**
- Use `// MARK: -` to organize logical sections
- Document complex logic inline
- Add comments for non-obvious filtering/sorting logic
- No excessive docstring comments for self-evident code

---

## Key Features & Components

### TodoItem Model
Located: `TodoApp/Models/TodoItem.swift`

The core data model with:
- **Enums**: `Priority` (low/medium/high) and `TodoCategory` (personal/work/shopping/health/finance/other)
- **Properties**: UUID, title, notes, priority, category, due date, completion status, timestamps
- **Computed Properties**: `isOverdue`, `isDueToday`, priority/category getters with defaults
- **Persistence**: Stored via SwiftData with fallback to in-memory storage

### Views
- **ContentView**: Root tab view switching between Todos and Settings
- **TodoListView**: Main list with search, filtering (status/priority), sorting, and add button
- **TodoDetailView**: Full-page view of a single todo item
- **AddEditTodoView**: Modal form for creating or editing todos
- **SettingsView**: User preferences (default priority, haptic feedback)

### Components
- **GlassCard**: Reusable container with glass morphism effect
- **AppBackground**: Gradient background (used globally)
- **PriorityBadge**: Visual indicator for priority levels
- **TodoRowView**: List item cell with completion state, priority, category
- **FilterChip**: Interactive filter button with selection state

---

## Development Workflows

### Setting Up Development Environment

1. **Clone & Install**:
   ```bash
   git clone <repo>
   cd TodoApp
   ```

2. **Open in Xcode**:
   ```bash
   open TodoApp.xcodeproj
   ```

3. **Build & Run**:
   - Select iPhone simulator (iOS 17+)
   - Cmd+R to build and run

### Making Changes

#### 1. **Adding a New Feature**
- Create feature branch: `git checkout -b claude/feature-name-S7d3X`
- Add model properties if needed (TodoItem)
- Create or modify views in `Views/` directory
- Add/update tests in `TodoAppTests/`
- Commit with clear message: `Add [feature]: Brief description`

#### 2. **Fixing Bugs**
- Create fix branch: `git checkout -b claude/fix-issue-name-S7d3X`
- Identify root cause (check affected views/models)
- Make minimal, focused changes
- Add test case if missing
- Commit: `Fix: Brief description of bug`

#### 3. **Refactoring**
- Maintain backward compatibility
- Update related tests
- Use atomic commits for each refactoring step
- Commit: `Refactor: Brief description`

### Git Branching Strategy

**Branch Format**: `claude/<description>-S7d3X`

- `S7d3X` is a session identifier that should match the current session
- Always create feature branches before making changes
- Push commits regularly to avoid loss
- Create pull requests for code review before merging to main

**Example Workflow**:
```bash
# Start new feature
git checkout -b claude/add-due-date-notifications-S7d3X
git add <files>
git commit -m "Add due date notifications"
git push -u origin claude/add-due-date-notifications-S7d3X

# Create PR on GitHub
gh pr create --title "Add due date notifications" --body "..."
```

---

## Testing & Quality Assurance

### Unit Tests
Located: `TodoAppTests/TodoItemTests.swift`

Tests cover:
- Todo creation and initialization
- Priority comparison and display
- Category assignment
- Status and date calculations

### Running Tests
```bash
# In Xcode
Cmd+U                    # Run all tests
Cmd+Shift+U             # Run tests with coverage

# Or via command line
xcodebuild test -project TodoApp.xcodeproj
```

### Testing Guidelines
- Test data models (TodoItem) thoroughly
- Test edge cases: empty todos, overdue dates, priority combinations
- Use descriptive test names: `testPriorityComparison_HighGreaterThanMedium`
- Keep tests isolated and deterministic

---

## Common Development Tasks

### Adding a New Property to TodoItem
1. Edit `Models/TodoItem.swift`:
   ```swift
   @Model
   final class TodoItem {
       // ... existing properties ...
       var newProperty: String = "default"
   }
   ```
2. Update any affected views that display todos
3. Update AddEditTodoView form if user-editable
4. Add test case

### Creating a New View
1. Create file in `Views/` directory: `NewView.swift`
2. Use template:
   ```swift
   import SwiftUI

   struct NewView: View {
       @Environment(\.modelContext) private var modelContext

       var body: some View {
           ZStack {
               AppBackground()

               VStack {
                   Text("View Content")
               }
           }
       }
   }
   ```
3. Update navigation/routing in ContentView or parent view
4. Add to Tab navigation if top-level

### Adding a New Component
1. Create file in `Components/` directory: `NewComponent.swift`
2. Use `@ViewBuilder` for flexible content
3. Apply glass morphism styling with GlassCard if needed
4. Export from a Components module or import directly

### Modifying UI Styling
- **Colors**: Define in enums or use Color extensions
- **Glass Morphism**: Use `.ultraThinMaterial` + gradient borders (see GlassCard)
- **Animations**: Use `.spring()` for natural feel
- **Spacing**: Use consistent 8pt/16pt increments
- **Typography**: System fonts with appropriate weights

### Updating App Store Metadata
See `APPSTORE_METADATA.md` for:
- App description (English & Korean)
- Keywords and category
- Screenshots specifications
- Deployment checklist

---

## Performance Considerations

### SwiftData & Queries
- Use `@Query` with sort descriptors for efficient data fetching
- Filter in-memory for better performance on smaller datasets
- Avoid complex sorting on large datasets
- Test with 100+ todos to ensure responsiveness

### View Performance
- Use `LazyVStack` for long lists (already implemented)
- Avoid excessive `.sheet()` or `.popover()` modifiers
- Use `.buttonStyle(.plain)` to avoid re-renders
- Leverage SwiftUI's built-in diffing for ForEach updates

### Memory Management
- SwiftData automatically manages lifecycle
- Be cautious with @State bindings to large objects
- Use `withAnimation()` appropriately to avoid unnecessary re-renders

---

## Deployment

### Pre-Deployment Checklist
See full checklist in `APPSTORE_METADATA.md`:
- [ ] Update version number in Xcode
- [ ] Update build number
- [ ] Test on multiple iOS 17+ devices
- [ ] Verify all features work (filtering, sorting, search, categories)
- [ ] Check dark mode appearance
- [ ] Test swipe actions
- [ ] Verify persistence (quit and reopen app)
- [ ] Review App Store metadata
- [ ] Generate required screenshots

### Building for App Store
```bash
# Archive
Xcode: Product > Archive

# Validate & Upload
Xcode: Organizer > Validate App > Upload to App Store
```

---

## Architecture Decisions & Rationale

| Decision | Rationale |
|----------|-----------|
| **SwiftData over Core Data** | Modern, simpler API; better integration with SwiftUI |
| **@Query for data fetching** | Reactive updates without manual refresh logic |
| **Glass morphism design** | Contemporary aesthetic; improves visual hierarchy |
| **Enum-based configuration** | Type-safe, self-documenting, easy to maintain |
| **Component-based views** | Reusability, testability, separation of concerns |
| **Private nested views** | Logical grouping, prevents accidental external use |

---

## Troubleshooting

### Common Issues

**SwiftData not persisting data**
- Check that `ModelContainer` is properly initialized in TodoAppApp
- Verify `modelContext` is available in views via `@Environment`
- Reset simulator data if needed: `xcrun simctl erase all`

**Views not updating when data changes**
- Ensure `@Query` is used (not manual data fetching)
- Check that mutated objects are within `modelContext`
- Use `withAnimation()` when updating state

**Glass morphism not appearing**
- Verify `.ultraThinMaterial` is available (iOS 17+)
- Check background is set to `.ignoresSafeArea()` or ZStack usage
- Ensure gradient is applied as `.overlay()` not background

**App crashes on startup**
- Check ModelContainer initialization in TodoAppApp
- Verify all @Model classes are properly decorated
- Check console for SwiftData migration errors

---

## Key Files & Their Purposes

| File | Purpose | Key Responsibilities |
|------|---------|----------------------|
| `TodoAppApp.swift` | App entry point | Initialize SwiftData container, set up root WindowGroup |
| `ContentView.swift` | Root UI | Manage tab navigation between Todos and Settings |
| `Models/TodoItem.swift` | Data model | Define todo structure, enums, persistence schema |
| `Views/TodoListView.swift` | Main feature | Display list, filtering, sorting, search |
| `Views/TodoDetailView.swift` | Detail view | Display full todo information |
| `Views/AddEditTodoView.swift` | Form | Create/edit todos with validation |
| `Views/SettingsView.swift` | Preferences | User settings (default priority, haptic feedback) |
| `Components/GlassCard.swift` | UI component | Reusable glass morphism container + app background |
| `Components/PriorityBadge.swift` | UI component | Priority visual indicator |
| `Components/TodoRowView.swift` | UI component | List item cell rendering |

---

## Guidelines for AI Assistants

### When Making Changes
1. **Read before modifying**: Always read the affected file first
2. **Maintain conventions**: Follow existing code style and patterns
3. **Preserve functionality**: Don't remove or change unrelated code
4. **Test your changes**: Run unit tests and manual testing
5. **Minimal commits**: Keep commits focused and atomic
6. **Clear messages**: Write descriptive commit messages

### Code Quality Standards
- Follow Swift style guide (2-space indentation, no trailing whitespace)
- Use `@ViewBuilder` for flexible view content
- Apply glass morphism with GlassCard for UI consistency
- Add accessibility labels to interactive elements
- Use enums for configuration (Priority, TodoCategory)
- Handle optional values explicitly

### When in Doubt
- Check existing similar code for patterns
- Refer to this CLAUDE.md file
- Test thoroughly before committing
- Ask for clarification if requirements are ambiguous

---

## References & Documentation

- [SwiftUI Documentation](https://developer.apple.com/documentation/swiftui)
- [SwiftData Documentation](https://developer.apple.com/documentation/swiftdata)
- [iOS 17 Release Notes](https://developer.apple.com/documentation/ios-release-notes)
- [App Store Submission Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- Project-specific: `APPSTORE_METADATA.md` for deployment details

---

**Last Updated**: 2026-03-02
**Maintained By**: AI Assistant
**Project Version**: 1.0
