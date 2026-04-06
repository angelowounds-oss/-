// ========================================
// Todo App — Full rewrite
// Ref: Reminders, Things 3, Todoist, TickTick
// ========================================

const STORAGE_KEY = 'todo-app-data';
const SETTINGS_KEY = 'todo-app-settings';

function loadTodos() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function saveTodos(data) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { defaultPriority: 'medium', haptics: true, notifications: false }; }
  catch { return { defaultPriority: 'medium', haptics: true, notifications: false }; }
}
function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

function genId() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ===== State =====
let todos = loadTodos();
let settings = loadSettings();
let currentFilter = 'all';
let currentSort = 'createdAt';
let editingId = null;
let viewingId = null;
let lastAddedId = null;

const PRI = {
  high:   { label: '높음',   color: '#ff3b30' },
  medium: { label: '보통', color: '#ff9500' },
  low:    { label: '낮음',    color: '#007aff' }
};
const CATS = {
  '개인': '#af52de', '업무': '#007aff', '쇼핑': '#34c759',
  '건강': '#ff2d55', '재정': '#ff9500'
};

// ===== Helpers =====
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
function esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function haptic() { if (settings.haptics && navigator.vibrate) navigator.vibrate(10); }

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d), now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dd = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  if (dd < today) return '기한 초과';
  if (dd.getTime() === today.getTime()) return '오늘 ' + dt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  const diff = (dd - today) / 86400000;
  if (diff === 1) return '내일';
  return dt.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

function dueStat(d, done) {
  if (!d || done) return 'normal';
  const dt = new Date(d), now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dd = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  if (dd < today) return 'overdue';
  if (dd.getTime() === today.getTime()) return 'today';
  return 'normal';
}

// ===== Filtering & Sorting =====
function getFiltered() {
  let list = [...todos];
  if (currentFilter === 'active') list = list.filter(t => !t.isCompleted);
  if (currentFilter === 'completed') list = list.filter(t => t.isCompleted);

  list.sort((a, b) => {
    switch (currentSort) {
      case 'createdAt': return new Date(b.createdAt) - new Date(a.createdAt);
      case 'dueDate':
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      case 'priority': {
        const o = { high: 3, medium: 2, low: 1 };
        return (o[b.priority] || 0) - (o[a.priority] || 0);
      }
      case 'title': return a.title.localeCompare(b.title);
      default: return 0;
    }
  });
  return list;
}

// Group by date section
function groupBySection(list) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tmrw = new Date(today.getTime() + 86400000);

  const sections = [];
  const groups = { overdue: [], today: [], tomorrow: [], upcoming: [], noDue: [], completed: [] };

  list.forEach(t => {
    if (t.isCompleted) { groups.completed.push(t); return; }
    if (!t.dueDate) { groups.noDue.push(t); return; }
    const dd = new Date(new Date(t.dueDate).getFullYear(), new Date(t.dueDate).getMonth(), new Date(t.dueDate).getDate());
    if (dd < today) groups.overdue.push(t);
    else if (dd.getTime() === today.getTime()) groups.today.push(t);
    else if (dd.getTime() === tmrw.getTime()) groups.tomorrow.push(t);
    else groups.upcoming.push(t);
  });

  if (groups.overdue.length) sections.push({ title: '기한 초과', items: groups.overdue });
  if (groups.today.length) sections.push({ title: '오늘', items: groups.today });
  if (groups.tomorrow.length) sections.push({ title: '내일', items: groups.tomorrow });
  if (groups.upcoming.length) sections.push({ title: '예정', items: groups.upcoming });
  if (groups.noDue.length) sections.push({ title: '기한 없음', items: groups.noDue });
  if (groups.completed.length) sections.push({ title: '완료', items: groups.completed });

  return sections;
}

// ===== Render =====
function render() {
  const list = getFiltered();
  const el = $('#todo-list');
  const empty = $('#empty-state');

  if (list.length === 0) {
    el.innerHTML = '';
    el.style.display = 'none';
    empty.classList.remove('hidden');
    if (todos.length === 0) {
      $('#empty-title').textContent = '할 일이 없습니다';
      $('#empty-sub').textContent = '아래에서 새로운 할 일을 추가해보세요';
    } else {
      $('#empty-title').textContent = '결과 없음';
      $('#empty-sub').textContent = '다른 필터를 선택해보세요';
    }
    updateSummary();
    return;
  }

  empty.classList.add('hidden');
  el.style.display = 'block';

  // Group by section when sorted by date
  if (currentSort === 'createdAt' || currentSort === 'dueDate') {
    const sections = groupBySection(list);
    el.innerHTML = sections.map(sec => `
      <div class="section-header">${sec.title}</div>
      <div class="section-group">
        ${sec.items.map(t => todoHTML(t)).join('')}
      </div>
    `).join('');
  } else {
    el.innerHTML = `<div class="section-group">${list.map(t => todoHTML(t)).join('')}</div>`;
  }

  // Animate new item
  if (lastAddedId) {
    const newEl = el.querySelector(`[data-id="${lastAddedId}"]`);
    if (newEl) newEl.classList.add('entering');
    lastAddedId = null;
  }

  updateSummary();
}

function todoHTML(t) {
  const p = PRI[t.priority] || PRI.medium;
  let meta = '';

  if (t.dueDate) {
    const s = dueStat(t.dueDate, t.isCompleted);
    meta += `<span class="meta-tag ${s}">${fmtDate(t.dueDate)}</span>`;
  }
  if (t.category && CATS[t.category]) {
    if (meta) meta += '<span class="dot"></span>';
    meta += `<span class="meta-tag">${t.category}</span>`;
  }

  return `
    <div class="todo-item ${t.isCompleted ? 'completed' : ''}" data-id="${t.id}">
      <div class="check-circle ${t.isCompleted ? 'checked' : ''}" data-action="toggle">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div class="todo-body" data-action="detail">
        <div class="todo-title">${esc(t.title)}</div>
        ${meta ? `<div class="todo-meta">${meta}</div>` : ''}
      </div>
      <div class="todo-pri" style="background:${p.color}"></div>
      <svg class="chevron" width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="var(--text3)" stroke-width="2" stroke-linecap="round"><polyline points="1 1 7 7 1 13"/></svg>
    </div>`;
}

// ===== Summary =====
function updateSummary() {
  const card = $('#summary-card');
  if (todos.length === 0) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');

  const total = todos.length;
  const done = todos.filter(t => t.isCompleted).length;
  const remaining = total - done;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const circ = 113.1; // 2 * PI * 18
  $('#summary-ring-fill').setAttribute('stroke-dashoffset', circ - (circ * pct / 100));
  $('#summary-pct').textContent = pct + '%';
  $('#summary-remaining').textContent = remaining + '개 남음';

  // Nearest deadline
  const upcoming = todos.filter(t => !t.isCompleted && t.dueDate).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  const sub = $('#summary-deadline');
  if (upcoming.length > 0) {
    const next = upcoming[0];
    sub.textContent = '다음 마감: ' + fmtDate(next.dueDate);
  } else {
    sub.textContent = '';
  }
}

// ===== Segmented Control =====
function updateSegIndicator() {
  const btns = $$('.seg-btn');
  const indicator = $('#seg-indicator');
  btns.forEach((btn, i) => {
    if (btn.classList.contains('active')) {
      indicator.style.transform = `translateX(${i * 100}%)`;
    }
  });
}

// ===== Quick Add =====
function quickAdd() {
  const input = $('#quick-input');
  const title = input.value.trim();
  if (!title) return;

  const id = genId();
  lastAddedId = id;
  todos.unshift({
    id, title, notes: '', isCompleted: false,
    priority: settings.defaultPriority, dueDate: null,
    category: null, createdAt: new Date().toISOString()
  });
  saveTodos(todos);
  haptic();
  input.value = '';
  $('#quick-send').classList.remove('visible');
  render();

  // Scroll to top
  $('#todo-list').scrollTo({ top: 0, behavior: 'smooth' });
}

// ===== Detail =====
function showDetail(id) {
  const t = todos.find(x => x.id === id);
  if (!t) return;
  viewingId = id;

  const p = PRI[t.priority] || PRI.medium;
  const statusColor = t.isCompleted ? '#34c759' : '#ff9500';
  const statusLabel = t.isCompleted ? '완료' : '진행중';

  let grid = `
    <div class="detail-meta">
      <div class="detail-meta-label">상태</div>
      <div class="detail-meta-val" style="color:${statusColor}">${statusLabel}</div>
    </div>
    <div class="detail-meta">
      <div class="detail-meta-label">우선순위</div>
      <div class="detail-meta-val" style="color:${p.color}">${p.label}</div>
    </div>`;

  if (t.dueDate) {
    const isOD = !t.isCompleted && new Date(t.dueDate) < new Date();
    const dc = isOD ? '#ff3b30' : '#007aff';
    const df = new Date(t.dueDate).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' }) +
      ' ' + new Date(t.dueDate).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    grid += `<div class="detail-meta"><div class="detail-meta-label">마감일</div><div class="detail-meta-val" style="color:${dc}">${df}</div></div>`;
  }
  if (t.category && CATS[t.category]) {
    grid += `<div class="detail-meta"><div class="detail-meta-label">카테고리</div><div class="detail-meta-val" style="color:${CATS[t.category]}">${t.category}</div></div>`;
  }

  const notes = t.notes ? `<div class="detail-notes">${esc(t.notes)}</div>` : '';
  const btnCls = t.isCompleted ? 'orange' : 'green';
  const btnTxt = t.isCompleted ? '진행중으로 변경' : '완료로 표시';

  $('#detail-content').innerHTML = `
    <div class="detail-card">
      <div class="detail-title ${t.isCompleted ? 'done' : ''}">${esc(t.title)}</div>
      ${notes}
    </div>
    <div class="detail-grid">${grid}</div>
    <button class="detail-action-btn ${btnCls}" id="detail-toggle">${btnTxt}</button>`;

  $('#detail-toggle').addEventListener('click', () => {
    t.isCompleted = !t.isCompleted;
    saveTodos(todos);
    haptic();
    showDetail(id);
    render();
  });

  switchView('detail-view');
}

// ===== Modal =====
function openModal(id = null) {
  editingId = id;
  const t = id ? todos.find(x => x.id === id) : null;

  $('#modal-title').textContent = t ? '편집' : '새로운 할 일';
  $('#todo-title').value = t ? t.title : '';
  $('#todo-notes').value = t ? (t.notes || '') : '';
  $('#has-due-date').checked = !!(t && t.dueDate);
  $('#due-date-picker').classList.toggle('hidden', !(t && t.dueDate));

  if (t && t.dueDate) {
    const d = new Date(t.dueDate);
    $('#todo-due-date').value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  } else {
    const tmrw = new Date(Date.now() + 86400000);
    $('#todo-due-date').value = new Date(tmrw.getTime() - tmrw.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }

  const pri = t ? t.priority : settings.defaultPriority;
  $$('.pri-btn').forEach(b => b.classList.toggle('selected', b.dataset.priority === pri));

  const cat = t ? (t.category || '') : '';
  $$('.cat-btn').forEach(b => b.classList.toggle('selected', b.dataset.category === cat));

  const sc = $('#status-card');
  if (t) { sc.classList.remove('hidden'); $('#todo-completed').checked = t.isCompleted; }
  else sc.classList.add('hidden');

  checkSave();
  $('#modal-overlay').classList.remove('hidden');
  setTimeout(() => $('#todo-title').focus(), 350);
}

function closeModal() {
  const overlay = $('#modal-overlay');
  overlay.classList.add('dismissing');
  setTimeout(() => {
    overlay.classList.add('hidden');
    overlay.classList.remove('dismissing');
    editingId = null;
  }, 300);
}

function checkSave() {
  $('#modal-save').disabled = !$('#todo-title').value.trim();
}

function saveModal() {
  const title = $('#todo-title').value.trim();
  if (!title) return;

  const notes = $('#todo-notes').value;
  const priority = document.querySelector('.pri-btn.selected')?.dataset.priority || 'medium';
  const hasDue = $('#has-due-date').checked;
  const dueDate = hasDue ? new Date($('#todo-due-date').value).toISOString() : null;
  const category = document.querySelector('.cat-btn.selected')?.dataset.category || null;
  const isCompleted = $('#todo-completed')?.checked || false;

  if (editingId) {
    const t = todos.find(x => x.id === editingId);
    if (t) {
      Object.assign(t, { title, notes, priority, dueDate, category: category || null, isCompleted });
    }
  } else {
    const id = genId();
    lastAddedId = id;
    todos.unshift({
      id, title, notes, isCompleted: false,
      priority, dueDate, category: category || null,
      createdAt: new Date().toISOString()
    });
  }

  saveTodos(todos);
  haptic();
  closeModal();
  render();
  if (viewingId && editingId === viewingId) showDetail(viewingId);
}

// ===== View Switching =====
function switchView(viewId) {
  $$('.view').forEach(v => v.classList.remove('active'));
  $(`#${viewId}`).classList.add('active');
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === viewId));

  const tabBar = $('#tab-bar');
  const quickBar = $('#quick-add-bar');
  if (viewId === 'detail-view') {
    tabBar.classList.add('hidden-bar');
    if (quickBar) quickBar.style.display = 'none';
  } else {
    tabBar.classList.remove('hidden-bar');
    if (quickBar) quickBar.style.display = '';
  }

  // Hide quick bar in settings
  if (viewId === 'settings-view' && quickBar) quickBar.style.display = 'none';
  if (viewId === 'todo-view' && quickBar) quickBar.style.display = '';
}

// ===== Confirm =====
let confirmCb = null;
function showConfirm(title, msg, okTxt, cb) {
  $('#confirm-title').textContent = title;
  $('#confirm-msg').textContent = msg;
  $('#confirm-ok').textContent = okTxt;
  confirmCb = cb;
  $('#confirm-overlay').classList.remove('hidden');
}
function hideConfirm() {
  $('#confirm-overlay').classList.add('hidden');
  confirmCb = null;
}

// ===== Swipe to Delete =====
let touchX0 = 0, touchY0 = 0, swipeRow = null, isSwiping = false;
function onTouchStart(e) {
  const row = e.target.closest('.todo-item');
  if (!row) return;
  touchX0 = e.touches[0].clientX;
  touchY0 = e.touches[0].clientY;
  swipeRow = row;
  isSwiping = false;
}
function onTouchMove(e) {
  if (!swipeRow) return;
  const dx = e.touches[0].clientX - touchX0;
  const dy = e.touches[0].clientY - touchY0;
  if (!isSwiping && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) isSwiping = true;
  if (isSwiping && dx < 0) {
    e.preventDefault();
    swipeRow.style.transform = `translateX(${Math.max(dx, -120)}px)`;
    swipeRow.style.transition = 'none';
  }
}
function onTouchEnd(e) {
  if (!swipeRow) return;
  const dx = e.changedTouches[0].clientX - touchX0;
  swipeRow.style.transition = '';
  if (isSwiping && dx < -80) {
    const id = swipeRow.dataset.id;
    swipeRow.classList.add('deleting');
    setTimeout(() => {
      todos = todos.filter(t => t.id !== id);
      saveTodos(todos);
      render();
      haptic();
    }, 300);
  } else {
    swipeRow.style.transform = '';
  }
  swipeRow = null;
  isSwiping = false;
}

// ===== Notifications =====
function requestNotifPerm() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  render();
  updateSegIndicator();

  // Load settings
  $('#default-priority').value = settings.defaultPriority;
  $('#haptic-toggle').checked = settings.haptics;
  $('#notification-toggle').checked = settings.notifications || false;

  if (settings.notifications) requestNotifPerm();

  // Tabs
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchView(tab.dataset.tab);
      haptic();
    });
  });

  // Segmented control
  $$('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      $$('.seg-btn').forEach(b => b.classList.toggle('active', b === btn));
      updateSegIndicator();
      render();
      haptic();
    });
  });

  // Quick add
  const quickInput = $('#quick-input');
  const quickSend = $('#quick-send');
  const quickPlus = $('#quick-add-plus');

  quickPlus.addEventListener('click', () => {
    quickInput.focus();
    haptic();
  });

  quickInput.addEventListener('input', () => {
    quickSend.classList.toggle('visible', !!quickInput.value.trim());
  });

  quickInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && quickInput.value.trim()) {
      e.preventDefault();
      quickAdd();
    }
  });

  quickSend.addEventListener('click', quickAdd);

  // Sort
  $('#sort-btn').addEventListener('click', () => {
    $('#sort-sheet').classList.remove('hidden');
    haptic();
  });

  $$('.sheet-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      currentSort = opt.dataset.sort;
      $$('.sheet-opt').forEach(o => o.classList.toggle('active', o === opt));
      $('#sort-sheet').classList.add('hidden');
      render();
      haptic();
    });
  });

  $('#sort-cancel').addEventListener('click', () => {
    $('#sort-sheet').classList.add('hidden');
  });

  $('.sheet-backdrop').addEventListener('click', () => {
    $('#sort-sheet').classList.add('hidden');
  });

  // Todo list interactions
  const todoList = $('#todo-list');

  todoList.addEventListener('click', e => {
    if (isSwiping) return;

    const toggle = e.target.closest('[data-action="toggle"]');
    if (toggle) {
      e.stopPropagation();
      const item = toggle.closest('.todo-item');
      const t = todos.find(x => x.id === item.dataset.id);
      if (t) {
        t.isCompleted = !t.isCompleted;
        saveTodos(todos);
        haptic();
        // Animate check
        toggle.classList.toggle('checked', t.isCompleted);
        setTimeout(render, 400);
      }
      return;
    }

    const detail = e.target.closest('[data-action="detail"]');
    if (detail) {
      showDetail(detail.closest('.todo-item').dataset.id);
      return;
    }

    const row = e.target.closest('.todo-item');
    if (row) showDetail(row.dataset.id);
  });

  todoList.addEventListener('touchstart', onTouchStart, { passive: true });
  todoList.addEventListener('touchmove', onTouchMove, { passive: false });
  todoList.addEventListener('touchend', onTouchEnd, { passive: true });

  // Detail
  $('#detail-back').addEventListener('click', () => {
    viewingId = null;
    switchView('todo-view');
    render();
  });

  $('#detail-edit').addEventListener('click', () => {
    if (viewingId) openModal(viewingId);
  });

  // Modal
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#modal-save').addEventListener('click', saveModal);
  $('#todo-title').addEventListener('input', checkSave);
  $('#has-due-date').addEventListener('change', e => {
    $('#due-date-picker').classList.toggle('hidden', !e.target.checked);
  });

  $$('.pri-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.pri-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      haptic();
    });
  });

  $$('.cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.cat-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      haptic();
    });
  });

  // Settings
  $('#default-priority').addEventListener('change', e => {
    settings.defaultPriority = e.target.value;
    saveSettings(settings);
  });

  $('#haptic-toggle').addEventListener('change', e => {
    settings.haptics = e.target.checked;
    saveSettings(settings);
  });

  $('#notification-toggle').addEventListener('change', e => {
    settings.notifications = e.target.checked;
    saveSettings(settings);
    if (e.target.checked) requestNotifPerm();
  });

  // Delete all
  $('#delete-all-btn').addEventListener('click', () => {
    showConfirm('모든 할 일을 삭제할까요?', '이 작업은 되돌릴 수 없습니다.', '모두 삭제', () => {
      todos = [];
      saveTodos(todos);
      render();
      haptic();
    });
  });

  $('#confirm-ok').addEventListener('click', () => {
    if (confirmCb) confirmCb();
    hideConfirm();
  });
  $('#confirm-cancel').addEventListener('click', hideConfirm);

  // SW
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
