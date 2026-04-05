// ===== Data Layer =====
const STORAGE_KEY = 'todo-app-data';
const SETTINGS_KEY = 'todo-app-settings';

function loadTodos() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch { return []; }
}

function saveTodos(todos) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
}

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { defaultPriority: 'medium', haptics: true };
  } catch { return { defaultPriority: 'medium', haptics: true }; }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ===== State =====
let todos = loadTodos();
let settings = loadSettings();
let currentFilter = 'all';
let currentPriorityFilter = null;
let currentSort = 'createdAt';
let searchQuery = '';
let editingTodoId = null;
let viewingTodoId = null;

// ===== Priority/Category Config =====
const PRIORITIES = {
  high:   { label: 'High',   color: '#ff3b30', icon: 'arrow-up' },
  medium: { label: 'Medium', color: '#ff9500', icon: 'minus' },
  low:    { label: 'Low',    color: '#007aff', icon: 'arrow-down' }
};

const CATEGORIES = {
  Personal: { color: '#af52de', icon: 'person' },
  Work:     { color: '#007aff', icon: 'briefcase' },
  Shopping: { color: '#34c759', icon: 'cart' },
  Health:   { color: '#ff2d55', icon: 'heart' },
  Finance:  { color: '#ff9500', icon: 'dollar' },
  Other:    { color: '#8e8e93', icon: 'tag' }
};

// ===== DOM References =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const todoListEl = $('#todo-list');
const emptyStateEl = $('#empty-state');
const searchInput = $('#search-input');
const sortMenu = $('#sort-menu');
const modalOverlay = $('#modal-overlay');
const confirmOverlay = $('#confirm-overlay');

// ===== Haptic Feedback =====
function haptic() {
  if (settings.haptics && navigator.vibrate) {
    navigator.vibrate(10);
  }
}

// ===== Rendering =====
function getFilteredTodos() {
  let filtered = [...todos];

  // Status filter
  if (currentFilter === 'active') filtered = filtered.filter(t => !t.isCompleted);
  if (currentFilter === 'completed') filtered = filtered.filter(t => t.isCompleted);

  // Priority filter
  if (currentPriorityFilter) filtered = filtered.filter(t => t.priority === currentPriorityFilter);

  // Search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(t =>
      t.title.toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q)
    );
  }

  // Sort
  filtered.sort((a, b) => {
    switch (currentSort) {
      case 'createdAt': return new Date(b.createdAt) - new Date(a.createdAt);
      case 'dueDate': {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      }
      case 'priority': {
        const order = { high: 3, medium: 2, low: 1 };
        return (order[b.priority] || 0) - (order[a.priority] || 0);
      }
      case 'title': return a.title.localeCompare(b.title);
      default: return 0;
    }
  });

  return filtered;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (dateDay < today) return 'Overdue';
  if (dateDay.getTime() === today.getTime()) {
    return 'Today ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getDueBadgeColor(dateStr, isCompleted) {
  if (!dateStr || isCompleted) return '#8e8e93';
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (dateDay < today) return '#ff3b30';
  if (dateDay.getTime() === today.getTime()) return '#ff9500';
  return '#8e8e93';
}

function priorityIconSVG(priority, size = 14) {
  const p = PRIORITIES[priority];
  if (!p) return '';
  let path = '';
  if (priority === 'high') path = `<circle cx="12" cy="12" r="10"/><polyline points="8 12 12 8 16 12"/>`;
  else if (priority === 'medium') path = `<circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/>`;
  else path = `<circle cx="12" cy="12" r="10"/><polyline points="8 12 12 16 16 12"/>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${p.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

function renderTodoList() {
  const filtered = getFilteredTodos();
  const hasSearch = searchQuery || currentFilter !== 'all' || currentPriorityFilter;

  if (filtered.length === 0) {
    todoListEl.innerHTML = '';
    todoListEl.style.display = 'none';
    emptyStateEl.classList.remove('hidden');

    const icon = $('#empty-icon');
    const title = $('#empty-title');
    const subtitle = $('#empty-subtitle');

    if (todos.length === 0 && !hasSearch) {
      icon.innerHTML = '<path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>';
      title.textContent = 'No Todos Yet';
      subtitle.textContent = 'Tap + to add your first todo';
    } else {
      icon.innerHTML = '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>';
      title.textContent = 'No Results';
      subtitle.textContent = 'Try adjusting your filters';
    }
    return;
  }

  emptyStateEl.classList.add('hidden');
  todoListEl.style.display = 'block';

  todoListEl.innerHTML = filtered.map(todo => {
    const p = PRIORITIES[todo.priority] || PRIORITIES.medium;
    let metaHTML = '';

    if (todo.dueDate) {
      const dueBadgeColor = getDueBadgeColor(todo.dueDate, todo.isCompleted);
      metaHTML += `<span class="badge due-badge" style="--badge-color: ${dueBadgeColor}">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        ${formatDate(todo.dueDate)}
      </span>`;
    }

    if (todo.category && CATEGORIES[todo.category]) {
      const cat = CATEGORIES[todo.category];
      metaHTML += `<span class="badge category-badge" style="--badge-color: ${cat.color}">${todo.category}</span>`;
    }

    const notesPreview = todo.notes ? `<div class="todo-notes-preview">${escapeHTML(todo.notes)}</div>` : '';

    return `
      <div class="todo-row ${todo.isCompleted ? 'completed' : ''}" data-id="${todo.id}">
        <div class="check-circle ${todo.isCompleted ? 'checked' : ''}" data-action="toggle" data-id="${todo.id}">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div class="todo-content" data-action="detail" data-id="${todo.id}">
          <div class="todo-title-row">
            <span class="todo-title">${escapeHTML(todo.title)}</span>
            <span class="priority-badge compact" style="--badge-color: ${p.color}">${priorityIconSVG(todo.priority)}</span>
          </div>
          ${metaHTML ? `<div class="todo-meta">${metaHTML}</div>` : ''}
          ${notesPreview}
        </div>
        <span class="todo-chevron">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
        </span>
      </div>
    `;
  }).join('');
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== Detail View =====
function showDetail(todoId) {
  const todo = todos.find(t => t.id === todoId);
  if (!todo) return;
  viewingTodoId = todoId;

  const p = PRIORITIES[todo.priority] || PRIORITIES.medium;
  const statusColor = todo.isCompleted ? '#34c759' : '#ff9500';
  const statusLabel = todo.isCompleted ? 'Completed' : 'Active';

  let metaCards = `
    <div class="meta-card glass-card">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="${statusColor}"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
      <div class="meta-label">Status</div>
      <div class="meta-value">${statusLabel}</div>
    </div>
    <div class="meta-card glass-card">
      ${priorityIconSVG(todo.priority, 24)}
      <div class="meta-label">Priority</div>
      <div class="meta-value">${p.label}</div>
    </div>
  `;

  if (todo.dueDate) {
    const isOverdue = !todo.isCompleted && new Date(todo.dueDate) < new Date();
    const dueColor = isOverdue ? '#ff3b30' : '#007aff';
    const dateFormatted = new Date(todo.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' ' + new Date(todo.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    metaCards += `
      <div class="meta-card glass-card">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${dueColor}" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <div class="meta-label">Due Date</div>
        <div class="meta-value">${dateFormatted}</div>
      </div>
    `;
  }

  if (todo.category && CATEGORIES[todo.category]) {
    const cat = CATEGORIES[todo.category];
    metaCards += `
      <div class="meta-card glass-card">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="${cat.color}"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/></svg>
        <div class="meta-label">Category</div>
        <div class="meta-value">${todo.category}</div>
      </div>
    `;
  }

  const createdFormatted = new Date(todo.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + new Date(todo.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  metaCards += `
    <div class="meta-card glass-card">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8e8e93" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <div class="meta-label">Created</div>
      <div class="meta-value">${createdFormatted}</div>
    </div>
  `;

  const notesHTML = todo.notes ?
    `<div class="detail-notes">${escapeHTML(todo.notes)}</div>` : '';

  const toggleBtnClass = todo.isCompleted ? 'undo' : 'complete';
  const toggleLabel = todo.isCompleted ? 'Mark as Active' : 'Mark as Complete';
  const toggleIcon = todo.isCompleted ?
    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 119 9 9.75 9.75 0 01-6.74-2.74L3 21"/><path d="M3 14V21h7"/></svg>` :
    `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 11l3 3L22 4"/></svg>`;

  $('#detail-content').innerHTML = `
    <div class="glass-card detail-header-card">
      <div class="detail-title-row">
        <span class="detail-title ${todo.isCompleted ? 'completed-text' : ''}">${escapeHTML(todo.title)}</span>
        <span class="priority-badge" style="--badge-color: ${p.color}; padding: 4px 8px; background: color-mix(in srgb, ${p.color} 18%, transparent); border-radius: 20px; font-size: 11px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
          ${priorityIconSVG(todo.priority, 12)}
          ${p.label}
        </span>
      </div>
      ${notesHTML}
    </div>
    <div class="meta-grid">${metaCards}</div>
    <button class="detail-toggle-btn ${toggleBtnClass}" id="detail-toggle-complete">
      ${toggleIcon}
      ${toggleLabel}
    </button>
  `;

  // Toggle complete handler
  $('#detail-toggle-complete').addEventListener('click', () => {
    todo.isCompleted = !todo.isCompleted;
    saveTodos(todos);
    haptic();
    showDetail(todoId);
    renderTodoList();
  });

  switchView('detail-view');
}

// ===== Modal (Add/Edit) =====
function openModal(todoId = null) {
  editingTodoId = todoId;
  const todo = todoId ? todos.find(t => t.id === todoId) : null;

  $('#modal-title').textContent = todo ? 'Edit Todo' : 'New Todo';
  $('#todo-title').value = todo ? todo.title : '';
  $('#todo-notes').value = todo ? (todo.notes || '') : '';
  $('#has-due-date').checked = !!(todo && todo.dueDate);
  $('#due-date-picker').classList.toggle('hidden', !(todo && todo.dueDate));

  if (todo && todo.dueDate) {
    const d = new Date(todo.dueDate);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    $('#todo-due-date').value = local;
  } else {
    const tomorrow = new Date(Date.now() + 86400000);
    const local = new Date(tomorrow.getTime() - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    $('#todo-due-date').value = local;
  }

  // Priority
  const priority = todo ? todo.priority : settings.defaultPriority;
  $$('.priority-option').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.priority === priority);
  });

  // Category
  const category = todo ? (todo.category || '') : '';
  $$('.cat-chip').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.category === category);
  });

  // Status card
  const statusCard = $('#status-card');
  if (todo) {
    statusCard.classList.remove('hidden');
    $('#todo-completed').checked = todo.isCompleted;
  } else {
    statusCard.classList.add('hidden');
  }

  updateSaveButton();
  modalOverlay.classList.remove('hidden');
  setTimeout(() => $('#todo-title').focus(), 300);
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  editingTodoId = null;
}

function updateSaveButton() {
  const title = $('#todo-title').value.trim();
  $('#modal-save').disabled = !title;
}

function saveModal() {
  const title = $('#todo-title').value.trim();
  if (!title) return;

  const notes = $('#todo-notes').value;
  const priority = document.querySelector('.priority-option.selected')?.dataset.priority || 'medium';
  const hasDueDate = $('#has-due-date').checked;
  const dueDate = hasDueDate ? new Date($('#todo-due-date').value).toISOString() : null;
  const category = document.querySelector('.cat-chip.selected')?.dataset.category || null;
  const isCompleted = $('#todo-completed').checked;

  if (editingTodoId) {
    const todo = todos.find(t => t.id === editingTodoId);
    if (todo) {
      todo.title = title;
      todo.notes = notes;
      todo.priority = priority;
      todo.dueDate = dueDate;
      todo.category = category || null;
      todo.isCompleted = isCompleted;
    }
  } else {
    todos.push({
      id: generateId(),
      title,
      notes,
      isCompleted: false,
      priority,
      dueDate,
      category: category || null,
      createdAt: new Date().toISOString()
    });
  }

  saveTodos(todos);
  haptic();
  closeModal();
  renderTodoList();

  // Refresh detail if viewing
  if (viewingTodoId && editingTodoId === viewingTodoId) {
    showDetail(viewingTodoId);
  }
}

// ===== View Switching =====
function switchView(viewId) {
  $$('.view').forEach(v => v.classList.remove('active'));
  $(`#${viewId}`).classList.add('active');

  // Update tab bar
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === viewId));

  // Hide tab bar on detail view
  const tabBar = $('.tab-bar');
  tabBar.style.display = viewId === 'detail-view' ? 'none' : 'flex';
}

// ===== Confirm Dialog =====
let confirmCallback = null;

function showConfirm(title, message, okLabel, callback) {
  $('#confirm-title').textContent = title;
  $('#confirm-message').textContent = message;
  $('#confirm-ok').textContent = okLabel;
  confirmCallback = callback;
  confirmOverlay.classList.remove('hidden');
}

function hideConfirm() {
  confirmOverlay.classList.add('hidden');
  confirmCallback = null;
}

// ===== Swipe to Delete =====
let touchStartX = 0;
let touchStartY = 0;
let swipingRow = null;
let isSwiping = false;

function handleTouchStart(e) {
  const row = e.target.closest('.todo-row');
  if (!row) return;
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  swipingRow = row;
  isSwiping = false;
}

function handleTouchMove(e) {
  if (!swipingRow) return;
  const dx = e.touches[0].clientX - touchStartX;
  const dy = e.touches[0].clientY - touchStartY;

  // Determine if horizontal swipe
  if (!isSwiping && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
    isSwiping = true;
  }

  if (isSwiping && dx < 0) {
    e.preventDefault();
    const offset = Math.max(dx, -120);
    swipingRow.style.transform = `translateX(${offset}px)`;
  }
}

function handleTouchEnd(e) {
  if (!swipingRow) return;
  const dx = e.changedTouches[0].clientX - touchStartX;

  if (isSwiping && dx < -80) {
    const todoId = swipingRow.dataset.id;
    swipingRow.classList.add('deleting');
    setTimeout(() => {
      todos = todos.filter(t => t.id !== todoId);
      saveTodos(todos);
      renderTodoList();
      haptic();
    }, 250);
  } else if (swipingRow) {
    swipingRow.style.transform = '';
  }

  swipingRow = null;
  isSwiping = false;
}

// ===== Event Listeners =====
document.addEventListener('DOMContentLoaded', () => {
  // Initial render
  renderTodoList();

  // Load settings into UI
  $('#default-priority').value = settings.defaultPriority;
  $('#haptic-toggle').checked = settings.haptics;

  // Tab navigation
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const viewId = tab.dataset.tab;
      switchView(viewId);
      haptic();
    });
  });

  // Add button
  $('#add-btn').addEventListener('click', () => {
    openModal();
    haptic();
  });

  // Sort button
  $('#sort-btn').addEventListener('click', () => {
    sortMenu.classList.toggle('hidden');
    haptic();
  });

  // Sort backdrop
  $('.sort-menu-backdrop').addEventListener('click', () => {
    sortMenu.classList.add('hidden');
  });

  // Sort options
  $$('.sort-option').forEach(opt => {
    opt.addEventListener('click', () => {
      currentSort = opt.dataset.sort;
      $$('.sort-option').forEach(o => o.classList.toggle('active', o.dataset.sort === currentSort));
      sortMenu.classList.add('hidden');
      renderTodoList();
      haptic();
    });
  });

  // Filter chips
  $$('.chip:not(.priority-chip)').forEach(chip => {
    chip.addEventListener('click', () => {
      currentFilter = chip.dataset.filter;
      $$('.chip:not(.priority-chip)').forEach(c => c.classList.toggle('active', c.dataset.filter === currentFilter));
      renderTodoList();
      haptic();
    });
  });

  // Priority filter chips
  $$('.chip.priority-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const p = chip.dataset.priority;
      if (currentPriorityFilter === p) {
        currentPriorityFilter = null;
        chip.classList.remove('active');
      } else {
        currentPriorityFilter = p;
        $$('.chip.priority-chip').forEach(c => c.classList.toggle('active', c.dataset.priority === p));
      }
      renderTodoList();
      haptic();
    });
  });

  // Search
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value;
    renderTodoList();
  });

  // Todo list clicks
  todoListEl.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-action="toggle"]');
    if (toggle) {
      e.stopPropagation();
      const todo = todos.find(t => t.id === toggle.dataset.id);
      if (todo) {
        todo.isCompleted = !todo.isCompleted;
        saveTodos(todos);
        haptic();
        renderTodoList();
      }
      return;
    }

    const detail = e.target.closest('[data-action="detail"]');
    if (detail) {
      showDetail(detail.dataset.id);
      return;
    }

    const row = e.target.closest('.todo-row');
    if (row && !isSwiping) {
      showDetail(row.dataset.id);
    }
  });

  // Swipe to delete
  todoListEl.addEventListener('touchstart', handleTouchStart, { passive: true });
  todoListEl.addEventListener('touchmove', handleTouchMove, { passive: false });
  todoListEl.addEventListener('touchend', handleTouchEnd, { passive: true });

  // Detail back
  $('#detail-back').addEventListener('click', () => {
    viewingTodoId = null;
    switchView('todo-view');
    renderTodoList();
  });

  // Detail edit
  $('#detail-edit').addEventListener('click', () => {
    if (viewingTodoId) {
      openModal(viewingTodoId);
    }
  });

  // Modal cancel
  $('#modal-cancel').addEventListener('click', closeModal);

  // Modal save
  $('#modal-save').addEventListener('click', saveModal);

  // Title input validation
  $('#todo-title').addEventListener('input', updateSaveButton);

  // Due date toggle
  $('#has-due-date').addEventListener('change', (e) => {
    $('#due-date-picker').classList.toggle('hidden', !e.target.checked);
  });

  // Priority options
  $$('.priority-option').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.priority-option').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      haptic();
    });
  });

  // Category chips
  $$('.cat-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.cat-chip').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      haptic();
    });
  });

  // Settings: default priority
  $('#default-priority').addEventListener('change', (e) => {
    settings.defaultPriority = e.target.value;
    saveSettings(settings);
  });

  // Settings: haptic toggle
  $('#haptic-toggle').addEventListener('change', (e) => {
    settings.haptics = e.target.checked;
    saveSettings(settings);
  });

  // Delete all
  $('#delete-all-btn').addEventListener('click', () => {
    showConfirm('Delete All Todos?', 'This cannot be undone.', 'Delete All', () => {
      todos = [];
      saveTodos(todos);
      renderTodoList();
      haptic();
    });
  });

  // Confirm dialog
  $('#confirm-ok').addEventListener('click', () => {
    if (confirmCallback) confirmCallback();
    hideConfirm();
  });

  $('#confirm-cancel').addEventListener('click', hideConfirm);

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
