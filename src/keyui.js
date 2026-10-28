import { ACTIONS, RESERVED, codeName, keys as binds } from './keys.js';

// Key screens (UX-03, ADR-0033): the help overlay is written from the bindings, so it never lists a key that does something else, and the
// pause menu gets a "controls" page where every action takes up to two keys. A key already used elsewhere is swapped, not duplicated.
const el = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
// controls that are not keyboard bindings and cannot be changed
const FIXED = [['사격', '좌클릭'], ['조준', '우클릭'], ['무기 넘기기', '휠'], ['제스처 메뉴 안 선택', '숫자 키'], ['메뉴 닫기 · 일시정지', 'Esc']];

// Fills the help overlay (#keys) from the current bindings.
export function renderHelp() {
  const box = el('keys'); if (!box) return;
  const keysOf = (id) => binds.codes(id).map(codeName).join(' / ') || '—';
  const rows = ACTIONS.filter(([id]) => !/^w[2-6]$/.test(id)).map(([id, label]) => id === 'w1' ? ['무기 1~6', ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'].map((w) => binds.label(w)).join(' ')] : [label, keysOf(id)]);
  box.innerHTML = rows.concat(FIXED).map(([l, k]) => `<span>${esc(l)} <b>${esc(k)}</b></span>`).join('');
  const t = document.querySelector('#helpbox small'); if (t) t.textContent = binds.label('help') + ' 키로 닫기 · 일시정지 메뉴에서 바꾸기';
}

// Adds the "controls" page to the pause menu: groups of actions, two key slots each; a click on a slot waits for the next key.
export function initKeyUI() {
  const pc = el('pc'), resume = el('resume'); if (!pc || !resume || el('kc')) return;
  const open = document.createElement('button'); open.type = 'button'; open.className = 'pbtn'; open.id = 'keysBtn'; open.textContent = '조작키 설정';
  pc.insertBefore(open, resume);
  const kc = document.createElement('div'); kc.id = 'kc'; kc.className = 'glass';
  kc.innerHTML = '<h2>조작키 설정</h2><p class="kmsg">바꿀 칸을 누르고 새 키를 누르세요. 이미 쓰는 키는 서로 바뀝니다.</p><div id="kgrid"></div>'
    + '<div class="krow"><button type="button" class="pbtn" id="kReset">기본값 (GTA V 배치)</button><button type="button" class="pbtn p" id="kBack">돌아가기</button></div>';
  pc.parentNode.appendChild(kc);
  const grid = kc.querySelector('#kgrid'), msg = kc.querySelector('.kmsg');
  const say = (t) => { msg.textContent = t; };
  let wait = null;   // {id, slot, node} while a slot waits for its key
  const draw = () => {
    let g = null, html = '';
    for (const [id, label, group] of ACTIONS) {
      if (group !== g) { g = group; html += `<h3>${esc(group)}</h3>`; }
      const c = binds.codes(id), slot = (i) => `<button type="button" class="kslot${c[i] ? '' : ' empty'}" data-id="${id}" data-slot="${i}">${esc(c[i] ? codeName(c[i]) : '—')}</button>`;
      html += `<div class="kline"><span>${esc(label)}</span>${slot(0)}${slot(1)}</div>`;
    }
    grid.innerHTML = html;
  };
  const show = (on) => { kc.classList.toggle('on', on); pc.style.display = on ? 'none' : ''; if (on) { draw(); say('바꿀 칸을 누르고 새 키를 누르세요. 이미 쓰는 키는 서로 바뀝니다.'); } else stop(); };
  const stop = () => { if (wait) wait.node.classList.remove('wait'); wait = null; };
  open.onclick = () => show(true);
  kc.querySelector('#kBack').onclick = () => show(false);
  kc.querySelector('#kReset').onclick = () => { binds.reset(); stop(); draw(); say('기본 배치로 되돌렸습니다.'); };
  grid.onclick = (e) => {
    const b = e.target.closest('.kslot'); if (!b) return;
    stop(); wait = { id: b.dataset.id, slot: +b.dataset.slot, node: b }; b.classList.add('wait'); b.textContent = '키 입력…';
    say('새 키를 누르세요 · Esc 취소 · Backspace 칸 비우기');
  };
  // capture phase on window: runs before the game's own key handlers, so a key pressed for a binding does nothing else
  addEventListener('keydown', (e) => {
    if (!kc.classList.contains('on')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat) return;
    if (!wait) { if (e.code === 'Escape') show(false); return; }
    const { id, slot } = wait, name = ACTIONS.find((a) => a[0] === id)[1];
    if (e.code === 'Escape') { stop(); draw(); say('취소했습니다.'); return; }
    if (e.code === 'Backspace') { const n = binds.codes(id).length; binds.clear(id, slot); stop(); draw(); say(n > 1 ? `'${name}' 칸을 비웠습니다.` : '키가 하나뿐인 행동은 비울 수 없습니다.'); return; }
    if (RESERVED.has(e.code) || e.ctrlKey || e.metaKey) { say(`${codeName(e.code)} 키는 브라우저나 고정 조작이 쓰는 키라 지정할 수 없습니다.`); return; }
    const moved = binds.set(id, slot, e.code); stop(); draw();
    const other = moved.map((m) => `'${ACTIONS.find((a) => a[0] === m)[1]}'`).join(', ');
    say(moved.length ? `${codeName(e.code)} → '${name}'. ${other}에는 원래 키를 넘겼습니다.` : `${codeName(e.code)} → '${name}'.`);
  }, true);
  binds.onChange(() => { if (el('helpov')?.classList.contains('on')) renderHelp(); });
}
