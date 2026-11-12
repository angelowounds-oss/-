// The credits and licences screen (EV-84): the list build.mjs embeds (build/assets/credits.mjs) drawn into a panel, opened from the pause menu
// and from the title screen's credit line. Text only through textContent, so nothing in the manifest becomes markup.
const LIC = { 'ODbL-1.0': 'Open Database License 1.0 (출처 표기·동일 조건)', 'CC-BY-4.0': 'CC BY 4.0 (출처 표기)', 'CC-BY-3.0': 'CC BY 3.0 (출처 표기)', 'OFL-1.1': 'SIL Open Font License 1.1', 'KOGL-1': '공공누리 제1유형 (출처 표시)', 'KOSTAT-free': '통계청 자료 (출처 표시)', MIT: 'MIT', 'Apache-2.0': 'Apache 2.0', 'CC0-1.0': 'CC0 (퍼블릭 도메인)', PD: '퍼블릭 도메인', own: '자체 제작', 'USER-PERMITTED': '소유자 허락' };

// fills the panel once and wires its buttons; returns open/close for tests
export function initCredits(doc = document) {
  const panel = doc.getElementById('creditsPanel'), list = doc.getElementById('creditsList'), data = doc.getElementById('creditsData'); if (!panel || !list) return null;
  let groups = []; try { groups = JSON.parse(data && data.textContent.trim().startsWith('[') ? data.textContent : '[]'); } catch (e) { groups = []; }
  for (const g of groups) {
    const h = doc.createElement('h3'); h.textContent = LIC[g.licence] || g.licence; list.appendChild(h);
    const ul = doc.createElement('ul');
    for (const it of g.items) {
      const li = doc.createElement('li'), name = it.url ? doc.createElement('a') : doc.createElement('span'); name.textContent = it.title; if (it.url) { name.href = it.url; name.target = '_blank'; name.rel = 'noopener'; }
      li.appendChild(name); const rest = [it.author, it.source !== 'library' ? it.source : ''].filter(Boolean).join(' · '); if (rest) li.appendChild(doc.createTextNode(' — ' + rest)); ul.appendChild(li);
    }
    list.appendChild(ul);
  }
  if (!groups.length) list.textContent = '크레딧 목록이 빌드에 없습니다. game/LICENSES.txt를 보세요.';
  const open = () => panel.classList.add('on'), close = () => panel.classList.remove('on');
  for (const id of ['creditsBtn', 'credit']) { const b = doc.getElementById(id); if (b) b.addEventListener('click', (e) => { e.stopPropagation(); open(); }); }
  doc.getElementById('creditsClose')?.addEventListener('click', close);
  panel.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (e.target === panel) close(); });
  doc.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel.classList.contains('on')) { e.stopPropagation(); close(); } }, true);
  return { open, close, groups: groups.length };
}
