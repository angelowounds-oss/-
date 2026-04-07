// ========================================
// 훈련병 관리 — 종교 집계 + 명단 관리
// ========================================

const STORAGE_KEY = 'military-trainees';
const SETTINGS_KEY = 'military-settings';

// ===== Storage =====
function loadTrainees() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function saveTrainees(data) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }

function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { platoonCount: 3, squadCount: 4 }; }
  catch { return { platoonCount: 3, squadCount: 4 }; }
}
function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

function genId() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ===== State =====
let trainees = loadTrainees();
let settings = loadSettings();
let currentFilter = 'all';
let currentSort = 'name';
let editingId = null;
let searchQuery = '';

const RELIGIONS = ['기독교', '불교', '원불교', '천주교', '무교'];
const REL_COLORS = {
  '기독교': '#42a5f5',
  '불교': '#ffa726',
  '원불교': '#ab47bc',
  '천주교': '#ec407a',
  '무교': '#8e8e93'
};
const REL_ICONS = {
  '기독교': '✝️',
  '불교': '☸️',
  '원불교': '⊙',
  '천주교': '⛪',
  '무교': '—'
};

// ===== Helpers =====
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
function esc(str) { const d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
function haptic() { if (navigator.vibrate) navigator.vibrate(10); }

// ===== Religion Summary =====
function renderReligionView() {
  const grid = $('#religion-grid');
  const totalCount = trainees.length;

  // Count per religion
  const counts = {};
  RELIGIONS.forEach(r => counts[r] = 0);
  trainees.forEach(t => {
    const r = t.religion || '무교';
    if (counts[r] !== undefined) counts[r]++;
    else counts['무교']++;
  });

  // Total card + religion cards
  let html = `
    <div class="rel-card total">
      <div class="rel-card-icon" style="background:rgba(76,175,80,0.2);color:#66bb6a">👥</div>
      <div class="rel-card-count">${totalCount}</div>
      <div class="rel-card-label">전체 인원</div>
    </div>`;

  RELIGIONS.forEach(r => {
    const c = REL_COLORS[r];
    const icon = REL_ICONS[r];
    html += `
      <div class="rel-card">
        <div class="rel-card-icon" style="background:${c}20;color:${c}">${icon}</div>
        <div class="rel-card-count">${counts[r]}</div>
        <div class="rel-card-label">${r}</div>
      </div>`;
  });

  grid.innerHTML = html;
  $('#total-badge').textContent = totalCount + '명';

  // Platoon summary
  renderPlatoonSummary(counts);
}

function renderPlatoonSummary() {
  const container = $('#platoon-summary');
  if (trainees.length === 0) {
    container.innerHTML = '<div class="platoon-card"><p style="color:var(--text3);font-size:14px;text-align:center;padding:8px">훈련병을 추가하면 소대별 집계가 표시됩니다</p></div>';
    return;
  }

  let html = '';
  for (let p = 1; p <= settings.platoonCount; p++) {
    const platoonTrainees = trainees.filter(t => t.platoon === p);
    const counts = {};
    RELIGIONS.forEach(r => counts[r] = 0);
    platoonTrainees.forEach(t => {
      const r = t.religion || '무교';
      if (counts[r] !== undefined) counts[r]++;
      else counts['무교']++;
    });

    html += `
      <div class="platoon-card">
        <div class="platoon-card-header">${p}소대 <span>${platoonTrainees.length}명</span></div>
        <div class="platoon-rel-row">
          ${RELIGIONS.map(r => counts[r] > 0
            ? `<span class="platoon-rel-chip" style="background:${REL_COLORS[r]}20;color:${REL_COLORS[r]}">${r} ${counts[r]}</span>`
            : ''
          ).join('')}
          ${platoonTrainees.length === 0 ? '<span class="platoon-rel-chip">인원 없음</span>' : ''}
        </div>
      </div>`;
  }

  container.innerHTML = html;
}

// ===== Trainee List =====
function getFilteredTrainees() {
  let list = [...trainees];

  // Platoon filter
  if (currentFilter !== 'all') {
    list = list.filter(t => t.platoon === parseInt(currentFilter));
  }

  // Search
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(t =>
      t.name.toLowerCase().includes(q) ||
      (t.serviceNum && t.serviceNum.toLowerCase().includes(q))
    );
  }

  // Sort
  list.sort((a, b) => {
    switch (currentSort) {
      case 'name': return a.name.localeCompare(b.name, 'ko');
      case 'serviceNum': return (a.serviceNum || '').localeCompare(b.serviceNum || '');
      case 'platoon':
        if (a.platoon !== b.platoon) return a.platoon - b.platoon;
        if (a.squad !== b.squad) return a.squad - b.squad;
        return a.name.localeCompare(b.name, 'ko');
      case 'religion':
        const ri = r => RELIGIONS.indexOf(r || '무교');
        if (ri(a.religion) !== ri(b.religion)) return ri(a.religion) - ri(b.religion);
        return a.name.localeCompare(b.name, 'ko');
      default: return 0;
    }
  });

  return list;
}

function renderTraineeList() {
  const list = getFilteredTrainees();
  const el = $('#trainee-list');
  const empty = $('#empty-trainee');

  if (list.length === 0) {
    el.innerHTML = '';
    empty.classList.remove('hidden');
    if (trainees.length === 0) {
      $('.empty-title').textContent = '훈련병이 없습니다';
      $('.empty-sub').textContent = '+ 버튼으로 훈련병을 추가하세요';
    } else {
      $('.empty-title').textContent = '검색 결과 없음';
      $('.empty-sub').textContent = '다른 검색어나 필터를 사용해보세요';
    }
    return;
  }

  empty.classList.add('hidden');

  el.innerHTML = list.map(t => {
    const rel = t.religion || '무교';
    const color = REL_COLORS[rel] || '#8e8e93';
    const initial = t.name.charAt(0);

    return `
      <div class="trainee-item" data-id="${t.id}">
        <div class="trainee-avatar" style="background:${color}">${esc(initial)}</div>
        <div class="trainee-info">
          <div class="trainee-name">${esc(t.name)}</div>
          <div class="trainee-meta">
            <span>${esc(t.serviceNum || '교번 없음')}</span>
            <span class="dot"></span>
            <span>${t.platoon}소대 ${t.squad}분대</span>
          </div>
        </div>
        <span class="trainee-rel-badge" style="background:${color}20;color:${color}">${rel}</span>
        <svg class="trainee-chevron" width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="var(--text3)" stroke-width="2" stroke-linecap="round"><polyline points="1 1 7 7 1 13"/></svg>
      </div>`;
  }).join('');
}

// ===== Platoon Filter Tabs =====
function renderPlatoonFilter() {
  const container = $('#platoon-filter');
  let html = '<button class="seg-btn active" data-filter="all">전체</button>';
  for (let i = 1; i <= settings.platoonCount; i++) {
    html += `<button class="seg-btn" data-filter="${i}">${i}소대</button>`;
  }
  container.innerHTML = html;

  // Re-bind
  container.querySelectorAll('.seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      container.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b === btn));
      renderTraineeList();
      haptic();
    });
  });
}

// ===== Modal =====
function openModal(id = null) {
  editingId = id;
  const t = id ? trainees.find(x => x.id === id) : null;

  $('#modal-title').textContent = t ? '훈련병 편집' : '훈련병 추가';
  $('#f-name').value = t ? t.name : '';
  $('#f-service-num').value = t ? (t.serviceNum || '') : '';

  // Populate platoon/squad selects
  populatePlatoonSquadSelects();

  if (t) {
    $('#f-platoon').value = t.platoon;
    $('#f-squad').value = t.squad;
  }

  // Religion
  const rel = t ? (t.religion || '무교') : '무교';
  $$('.rel-btn').forEach(b => b.classList.toggle('selected', b.dataset.rel === rel));

  checkModalSave();
  $('#modal-overlay').classList.remove('hidden');
  setTimeout(() => $('#f-name').focus(), 350);
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

function checkModalSave() {
  $('#modal-save').disabled = !$('#f-name').value.trim();
}

function saveModal() {
  const name = $('#f-name').value.trim();
  if (!name) return;

  const serviceNum = $('#f-service-num').value.trim();
  const platoon = parseInt($('#f-platoon').value);
  const squad = parseInt($('#f-squad').value);
  const religion = document.querySelector('.rel-btn.selected')?.dataset.rel || '무교';

  if (editingId) {
    const t = trainees.find(x => x.id === editingId);
    if (t) Object.assign(t, { name, serviceNum, platoon, squad, religion });
  } else {
    trainees.push({
      id: genId(), name, serviceNum, platoon, squad, religion,
      createdAt: new Date().toISOString()
    });
  }

  saveTrainees(trainees);
  haptic();
  closeModal();
  renderAll();
}

function populatePlatoonSquadSelects() {
  const pSel = $('#f-platoon');
  const sSel = $('#f-squad');
  pSel.innerHTML = '';
  sSel.innerHTML = '';
  for (let i = 1; i <= settings.platoonCount; i++) {
    pSel.innerHTML += `<option value="${i}">${i}소대</option>`;
  }
  for (let i = 1; i <= settings.squadCount; i++) {
    sSel.innerHTML += `<option value="${i}">${i}분대</option>`;
  }
}

// ===== Settings Modal =====
function openSettings() {
  // Populate settings selects
  const pSel = $('#set-platoon-count');
  const sSel = $('#set-squad-count');
  pSel.innerHTML = '';
  sSel.innerHTML = '';
  for (let i = 1; i <= 10; i++) {
    pSel.innerHTML += `<option value="${i}" ${i === settings.platoonCount ? 'selected' : ''}>${i}개</option>`;
    sSel.innerHTML += `<option value="${i}" ${i === settings.squadCount ? 'selected' : ''}>${i}개</option>`;
  }
  $('#settings-overlay').classList.remove('hidden');
}

function closeSettings() {
  const overlay = $('#settings-overlay');
  overlay.classList.add('dismissing');
  setTimeout(() => {
    overlay.classList.add('hidden');
    overlay.classList.remove('dismissing');
  }, 300);
}

// ===== View Switching =====
function switchView(viewId) {
  $$('.view').forEach(v => v.classList.remove('active'));
  $(`#${viewId}`).classList.add('active');
  $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === viewId));
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
  const row = e.target.closest('.trainee-item');
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
      trainees = trainees.filter(t => t.id !== id);
      saveTrainees(trainees);
      renderAll();
      haptic();
    }, 300);
  } else {
    swipeRow.style.transform = '';
  }
  swipeRow = null;
  isSwiping = false;
}

// ===== Export / Import =====
function exportData() {
  const data = { trainees, settings, exportDate: new Date().toISOString() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `훈련병_데이터_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.trainees && Array.isArray(data.trainees)) {
        trainees = data.trainees;
        saveTrainees(trainees);
        if (data.settings) {
          settings = { ...settings, ...data.settings };
          saveSettings(settings);
        }
        renderAll();
        renderPlatoonFilter();
        closeSettings();
        haptic();
      }
    } catch {
      alert('올바른 JSON 파일이 아닙니다.');
    }
  };
  reader.readAsText(file);
}

// ===== Render All =====
function renderAll() {
  renderReligionView();
  renderTraineeList();
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  renderAll();
  renderPlatoonFilter();

  // Tab switching
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchView(tab.dataset.tab);
      haptic();
    });
  });

  // Search toggle
  $('#search-toggle').addEventListener('click', () => {
    const bar = $('#search-bar');
    bar.classList.toggle('hidden');
    if (!bar.classList.contains('hidden')) {
      $('#search-input').focus();
    } else {
      searchQuery = '';
      $('#search-input').value = '';
      renderTraineeList();
    }
    haptic();
  });

  // Search input
  $('#search-input').addEventListener('input', e => {
    searchQuery = e.target.value;
    renderTraineeList();
  });

  // Sort button
  $('#sort-btn').addEventListener('click', () => {
    $('#sort-sheet').classList.remove('hidden');
    haptic();
  });

  $$('.sheet-opt').forEach(opt => {
    opt.addEventListener('click', () => {
      currentSort = opt.dataset.sort;
      $$('.sheet-opt').forEach(o => o.classList.toggle('active', o === opt));
      $('#sort-sheet').classList.add('hidden');
      renderTraineeList();
      haptic();
    });
  });

  $('#sort-cancel').addEventListener('click', () => {
    $('#sort-sheet').classList.add('hidden');
  });

  $('.sheet-backdrop').addEventListener('click', () => {
    $('#sort-sheet').classList.add('hidden');
  });

  // Settings
  $('#settings-btn').addEventListener('click', () => {
    openSettings();
    haptic();
  });

  $('#settings-close').addEventListener('click', closeSettings);

  $('#set-platoon-count').addEventListener('change', e => {
    settings.platoonCount = parseInt(e.target.value);
    saveSettings(settings);
    renderPlatoonFilter();
    renderAll();
  });

  $('#set-squad-count').addEventListener('change', e => {
    settings.squadCount = parseInt(e.target.value);
    saveSettings(settings);
  });

  // Export / Import
  $('#export-btn').addEventListener('click', exportData);

  $('#import-btn').addEventListener('click', () => {
    $('#import-file').click();
  });

  $('#import-file').addEventListener('change', e => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = '';
  });

  // Delete all
  $('#delete-all-btn').addEventListener('click', () => {
    showConfirm('모든 데이터를 삭제할까요?', '훈련병 데이터가 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다.', '모두 삭제', () => {
      trainees = [];
      saveTrainees(trainees);
      renderAll();
      closeSettings();
      haptic();
    });
  });

  // Confirm dialog
  $('#confirm-ok').addEventListener('click', () => {
    if (confirmCb) confirmCb();
    hideConfirm();
  });
  $('#confirm-cancel').addEventListener('click', hideConfirm);

  // FAB - add trainee
  $('#add-fab').addEventListener('click', () => {
    openModal();
    haptic();
  });

  // Modal
  $('#modal-cancel').addEventListener('click', closeModal);
  $('#modal-save').addEventListener('click', saveModal);
  $('#f-name').addEventListener('input', checkModalSave);

  // Religion buttons
  $$('.rel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.rel-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      haptic();
    });
  });

  // Trainee list click → edit
  const traineeList = $('#trainee-list');

  traineeList.addEventListener('click', e => {
    if (isSwiping) return;
    const row = e.target.closest('.trainee-item');
    if (row) {
      openModal(row.dataset.id);
      haptic();
    }
  });

  traineeList.addEventListener('touchstart', onTouchStart, { passive: true });
  traineeList.addEventListener('touchmove', onTouchMove, { passive: false });
  traineeList.addEventListener('touchend', onTouchEnd, { passive: true });

  // Register SW
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
