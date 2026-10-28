// Keyboard bindings (UX-03, ADR-0033). Every keyboard action of the game, its default keys and the player's own choice from the settings
// screen. The defaults follow GTA V on PC, adjusted for the browser: crouch is C, not Ctrl, because Ctrl+W closes the tab and the page cannot stop it.
// Escape, the mouse buttons and the wheel are fixed. The digit keys inside the gesture menu and F9 (sandbox) are fixed too.
// Actions are named after the input edges the game already reads (Input.edges), so a binding only changes which key fires an action.

// [id, label, group, default codes (primary first, at most two)]
export const ACTIONS = [
  ['moveF', '앞으로 · 가속', '이동', ['KeyW']],
  ['moveB', '뒤로 · 브레이크/후진', '이동', ['KeyS']],
  ['moveL', '왼쪽 · 왼쪽 조향', '이동', ['KeyA']],
  ['moveR', '오른쪽 · 오른쪽 조향', '이동', ['KeyD']],
  ['sprint', '달리기 · 하강(헬기·VTOL)', '이동', ['ShiftLeft', 'ShiftRight']],
  ['jump', '점프·오르기 · 핸드브레이크 · 상승 · 낙하산', '이동', ['Space']],
  ['crouch', '웅크리기 · 구르기 · 잠수 · 낙하산 분리', '이동', ['KeyC']],
  ['prone', '엎드리기', '이동', ['KeyZ']],
  ['use', '상호작용 · 탑승/하차', '행동', ['KeyF']],
  ['horn', '보조 행동(문 따기 등) · 경적', '행동', ['KeyE']],
  ['verb3', '세 번째 행동(걷어차기 등) · 주유', '행동', ['KeyT']],
  ['sur', '항복 · 손 들기', '행동', ['KeyY']],
  ['gest', '제스처 메뉴', '행동', ['KeyB']],
  ['grapple', '그래플링 훅 (휠 클릭도)', '행동', ['KeyO']],
  ['reload', '재장전', '무기', ['KeyR']],
  ['swap', '직전 무기', '무기', ['KeyQ']],
  ['nade', '수류탄', '무기', ['KeyG']],
  ['w1', '무기 1', '무기', ['Digit1']],
  ['w2', '무기 2', '무기', ['Digit2']],
  ['w3', '무기 3', '무기', ['Digit3']],
  ['w4', '무기 4', '무기', ['Digit4']],
  ['w5', '무기 5', '무기', ['Digit5']],
  ['w6', '무기 6 (근접)', '무기', ['Digit6']],
  ['lights', '헤드라이트', '차량', ['KeyH']],
  ['alt', '고도 유지 (전투기·다크스타)', '차량', ['KeyU']],
  ['cam', '시점 전환', '화면', ['KeyV']],
  ['map', '세계 지도', '화면', ['KeyM', 'KeyJ']],
  ['phone', '휴대폰', '화면', ['ArrowUp']],
  ['inv', '인벤토리', '화면', ['Tab', 'KeyI']],
  ['help', '조작법 보기', '화면', ['F1']],
  ['pause', '일시정지 (Esc도)', '화면', ['KeyP']],
];
// interaction verbs carry a slot letter (building.js, life.js ...); the slot is fired by this action
export const VERB_ACTION = { F: 'use', G: 'horn', T: 'verb3' };

const STORE = 'neon_keys_v1';
const NAMES = { Space: 'Space', ShiftLeft: 'Shift', ShiftRight: '오른쪽 Shift', Tab: 'Tab', Enter: 'Enter', Backspace: 'Backspace', CapsLock: 'Caps Lock', AltLeft: 'Alt', AltRight: '오른쪽 Alt',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'",
  Comma: ',', Period: '.', Slash: '/', Insert: 'Insert', Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'Page Up', PageDown: 'Page Down', Escape: 'Esc' };
// codes the player may not bind: they belong to the browser or to fixed controls
export const RESERVED = new Set(['Escape', 'F5', 'F9', 'F11', 'F12', 'ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight', 'ContextMenu']);

// Human name of a key code (KeyF -> F, Digit1 -> 1, Numpad4 -> Num 4).
export function codeName(code) {
  if (!code) return '—';
  if (NAMES[code]) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}

export class KeyBinds {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage; this.listeners = [];
    this.defaults = Object.fromEntries(ACTIONS.map(([id, , , c]) => [id, c.slice()]));
    this.map = {};
    let saved = {}; try { saved = JSON.parse(this.storage?.getItem(STORE) || '{}') || {}; } catch { saved = {}; }
    for (const id in this.defaults) this.map[id] = Array.isArray(saved[id]) ? saved[id].filter((c) => typeof c === 'string' && !RESERVED.has(c)).slice(0, 2) : this.defaults[id].slice();
    this.index();
  }
  // code -> action ids
  index() { this.by = new Map(); for (const id in this.map) for (const c of this.map[id]) { if (!this.by.has(c)) this.by.set(c, []); this.by.get(c).push(id); } }
  actionsOf(code) { return this.by.get(code) || []; }
  codes(id) { return this.map[id] || []; }
  // true while any key of the action is down (keys: the Input's held-code set)
  held(keys, id) { for (const c of this.codes(id)) if (keys.has(c)) return true; return false; }
  is(code, id) { return this.codes(id).includes(code); }
  // name of the action's first key, for prompts ('F', 'Space', '↑')
  label(id) { return codeName(this.codes(id)[0]); }
  kbd(id) { return `<kbd>${this.label(id)}</kbd>`; }
  verbLabel(slot) { return VERB_ACTION[slot] ? this.label(VERB_ACTION[slot]) : slot; }
  // binds code to slot (0/1) of the action; another action holding the code gets this slot's old key instead (a swap, so nothing is left unbound
  // by accident). Returns the action ids that changed besides id.
  set(id, slot, code) {
    if (!this.map[id] || RESERVED.has(code)) return [];
    const cur = this.map[id], old = cur[slot] || null, moved = [];
    for (const other in this.map) {
      if (other === id) continue;
      const i = this.map[other].indexOf(code); if (i < 0) continue;
      if (old && !this.map[other].includes(old)) this.map[other][i] = old; else this.map[other].splice(i, 1);
      moved.push(other);
    }
    const j = cur.indexOf(code); if (j >= 0 && j !== slot) cur.splice(j, 1);
    if (slot >= cur.length) cur.push(code); else cur[slot] = code;
    this.map[id] = cur.slice(0, 2);
    this.save(); return moved;
  }
  clear(id, slot) { if (this.map[id] && this.map[id].length > 1) { this.map[id].splice(slot, 1); this.save(); } }
  reset() { for (const id in this.defaults) this.map[id] = this.defaults[id].slice(); this.save(); }
  // codes bound to more than one action (only possible from a hand-edited store)
  conflicts() { return [...this.by].filter(([, ids]) => ids.length > 1).map(([c, ids]) => ({ code: c, ids })); }
  save() { this.index(); try { this.storage?.setItem(STORE, JSON.stringify(this.map)); } catch { /* private mode */ } for (const f of this.listeners) f(); }
  onChange(f) { this.listeners.push(f); }
}

export const keys = new KeyBinds();
