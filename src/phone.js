import { el, clamp } from './util.js';
import { N, P, R, HALF, roadC } from './world.js';
import { ZONES } from './society.js';

const CSS = `
#phone{position:fixed;right:max(18px,3vw);bottom:max(18px,4vh);width:min(330px,92vw);height:min(600px,86vh);z-index:16;display:none;flex-direction:column;border-radius:34px;padding:14px;background:rgba(6,9,16,.92);border:2px solid rgba(255,255,255,.18);box-shadow:0 20px 60px rgba(0,0,0,.6);pointer-events:auto}
#phone.on{display:flex}
#phTop{display:flex;justify-content:space-between;font-size:11px;color:var(--muted);padding:2px 10px 8px}
#phBody{flex:1;overflow:auto;border-radius:20px;background:#0a0f1a;padding:10px;min-height:0}
#phTabs{display:flex;gap:6px;margin-top:10px}
#phTabs button{flex:1;padding:9px 0;border:0;border-radius:12px;background:#141c2c;color:#cfe;font:inherit;font-size:11px;cursor:pointer}
#phTabs button.on{background:#1e3a5a;color:var(--cyan)}
.ph-row{display:flex;gap:8px;align-items:center;padding:9px;border-radius:12px;background:rgba(255,255,255,.05);margin-bottom:6px;font-size:13px}
.ph-row .n{flex:1}.ph-row small{display:block;color:var(--muted);font-size:10px}
.ph-row button{border:1px solid var(--line);background:#0e1626;color:#fff;border-radius:8px;padding:5px 10px;font:inherit;font-size:11px;cursor:pointer}
#phMap{width:100%;aspect-ratio:1;border-radius:14px;background:#05080f;touch-action:none}
body.photo #hud,body.photo #mobile{display:none!important}
#phShot{position:fixed;left:50%;bottom:30px;transform:translateX(-50%);z-index:17;display:none;gap:10px}
body.photo #phShot{display:flex}
#phShot button{padding:12px 18px;border-radius:14px;border:1px solid var(--line);background:rgba(8,12,20,.8);color:#fff;font:inherit;cursor:pointer}
#job{position:absolute;left:max(16px,env(safe-area-inset-left));top:calc(max(16px,env(safe-area-inset-top)) + 232px);padding:7px 12px;border-radius:12px;font-size:12px;display:none;border-left:3px solid var(--gold);width:min(300px,calc(100vw - 32px))}
#job.on{display:block}
`;

export class Phone {
  constructor(G) {
    this.G = G; this.tab = 'map'; this.path = null;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const root = document.createElement('div'); root.id = 'phone'; root.className = 'glass';
    root.innerHTML = '<div id="phTop"><span id="phClock"></span><span>NEON-OS</span></div><div id="phBody"></div><div id="phTabs"></div>';
    document.body.appendChild(root);
    const shot = document.createElement('div'); shot.id = 'phShot'; shot.innerHTML = '<button id="phSnap" type="button">📷 촬영</button><button id="phExit" type="button">종료</button>'; document.body.appendChild(shot);
    el('hud').insertAdjacentHTML('beforeend', '<div id="job" class="glass"></div>');
    this.root = root; this.body = el('phBody');
    const tabs = [['map', '지도'], ['contacts', '연락처'], ['jobs', '일자리'], ['bank', '은행'], ['cam', '카메라'], ['set', '설정']];
    const tb = el('phTabs'); tabs.forEach(([k, n]) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = n; b.dataset.k = k; b.onclick = () => { this.tab = k; this.render(); }; tb.appendChild(b); });
    el('phSnap').onclick = () => this.snap(); el('phExit').onclick = () => this.photo(false);
    addEventListener('keydown', (e) => { if (this.open && (e.code === 'Escape' || e.code === 'KeyM')) { e.stopImmediatePropagation(); e.preventDefault(); this.close(); } }, true);
  }
  get open() { return this.root.classList.contains('on'); }
  show() { if (this.G.uiModal) return; this.root.classList.add('on'); this.G.uiModal = true; this.G.input.unlock(); this.render(); }
  close() { this.root.classList.remove('on'); this.G.uiModal = false; this.G.input.lock(); this.G.save(); }
  row(name, sub, btns) {
    const d = document.createElement('div'); d.className = 'ph-row'; d.innerHTML = `<span class="n">${name}${sub ? `<small>${sub}</small>` : ''}</span>`;
    for (const [t, f] of btns || []) { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.onclick = () => { f(); if (this.open) this.render(); }; d.appendChild(b); }
    this.body.appendChild(d);
  }
  render() {
    const G = this.G, B = this.body; B.innerHTML = '';
    el('phClock').textContent = G.clock.fmt();
    for (const b of el('phTabs').children) b.classList.toggle('on', b.dataset.k === this.tab);
    if (this.tab === 'map') this.renderMap();
    else if (this.tab === 'contacts') {
      this.row('택시 호출', '현재 위치로 택시가 옵니다 · 탑승 후 지도 목적지로 이동', [['호출', () => { G.callTaxi(); this.close(); }]]);
      this.row('정비사 호출', '가까운 내 차량 수리 $180', [['요청', () => { const v = G.lastVehicle; if (v && !v.dead && Math.hypot(v.x - G.player.x, v.z - G.player.z) < 40 && G.cash >= 180) { G.cash -= 180; v.hp = v.maxHp; v.burn = 0; G.toast('정비사', '수리 완료'); } else G.toast('수리 불가', '차량이 40m 안에 있어야 합니다'); }]]);
      this.row('병원 응급 처치', 'HP 전부 회복 $120', [['요청', () => { if (G.cash >= 120) { G.cash -= 120; G.player.hpv = 100; G.player.bleed = 0; G.toast('치료 완료'); } else G.toast('돈이 부족합니다'); }]]);
      this.row('경찰 자수', '수배 해제 · 벌금 $200×★', [['자수', () => { if (G.wanted > 0) { const f = Math.min(G.cash, 200 * G.wanted); G.cash -= f; G.clearWanted(); G.toast('자수', `벌금 $${f | 0}`); } else G.toast('수배 중이 아닙니다'); }]]);
    } else if (this.tab === 'jobs') {
      const J = G.jobs, c = J.cur;
      if (c) this.row(c.title, c.text, [['포기', () => J.finish(false)]]);
      for (const [t, n, d] of [['delivery', '배달 대행', '소포를 받아 제한 시간 내에 전달'], ['taxi', '택시 승객 운송', '내 차로 승객을 태워 목적지까지'], ['patrol', '경비 순찰', '빌딩 세 층의 계단 앞을 순찰'], ['repair', '노상 수리', '고장 난 차를 수리'], ['hack', '해킹 의뢰', '오피스 서버에서 데이터를 탈취']]) this.row(n, d, [['수락', () => { J.start(t); this.close(); }]]);
    } else if (this.tab === 'bank') {
      this.row('현금', `$${G.cash | 0}`, []); this.row('계좌 잔액', `$${G.state.bank | 0}`, [['전액 입금', () => { G.state.bank = (G.state.bank | 0) + Math.floor(G.cash); G.cash -= Math.floor(G.cash); }], ['$500 출금', () => { if ((G.state.bank | 0) >= 500) { G.state.bank -= 500; G.cash += 500; } }]]);
      this.row('소유 부동산', `${Object.keys(G.state.homes).length}채`, []);
    } else if (this.tab === 'cam') {
      this.row('사진 모드', 'HUD를 숨기고 촬영합니다', [['시작', () => { this.close(); this.photo(true); }]]);
    } else if (this.tab === 'set') {
      const slot = +(localStorage.getItem('neon_slot') || 1);
      for (let s = 1; s <= 3; s++) {
        const raw = localStorage.getItem(`neon_city_v9_${s}`); let info = '비어 있음'; try { const d = JSON.parse(raw); if (d) info = `$${d.cash | 0} · 미션 ${d.mission ?? 0}`; } catch (e) { /* ignore */ }
        this.row(`슬롯 ${s}${s === slot ? ' (현재)' : ''}`, info, [['저장', () => { G.saveSlot(s); G.toast('저장됨', `슬롯 ${s}`); }], ['불러오기', () => { if (raw) { localStorage.setItem('neon_slot', s); location.reload(); } }]]);
      }
      this.row('현실성 모드 (허기·갈증·피로)', G.needs.s.on ? '켜짐' : '꺼짐', [['전환', () => { G.needs.s.on = !G.needs.s.on; }]]);
    }
  }
  // ---- map ----
  renderMap() {
    const G = this.G, cv = document.createElement('canvas'); cv.id = 'phMap'; cv.width = cv.height = 300; this.body.appendChild(cv);
    const g = cv.getContext('2d'), S = 300 / (N * P + P * 3), half = (N * P + P * 3) / 2;
    const tx = (x) => (x + half) * S, tz = (z) => (z + half) * S;
    g.drawImage(G.mapCanvas, 0, 0, 300, 300);
    g.globalAlpha = 0.18; ZONES.forEach((z, i) => { g.fillStyle = z.c; const cxz = [[0, 0, 90], [0, 200, 0], [200, 0, 0], [-200, 0, 0], [0, -200, 0]][i]; }); g.globalAlpha = 1;
    if (this.G.gpsPath) { g.strokeStyle = '#4de3ff'; g.lineWidth = 3; g.beginPath(); this.G.gpsPath.forEach((p, i) => (i ? g.lineTo(tx(p[0]), tz(p[1])) : g.moveTo(tx(p[0]), tz(p[1])))); g.stroke(); }
    if (G.markerPos) { g.fillStyle = '#ffc94d'; g.beginPath(); g.arc(tx(G.markerPos.x), tz(G.markerPos.z), 5, 0, 7); g.fill(); }
    const pl = G.player; g.fillStyle = '#4de3ff'; g.strokeStyle = '#000'; g.beginPath(); g.arc(tx(pl.x), tz(pl.z), 5, 0, 7); g.fill(); g.stroke();
    cv.onpointerdown = (e) => { const r = cv.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * 300 / S - half, z = ((e.clientY - r.top) / r.height) * 300 / S - half; G.setWaypoint(x, z); this.render(); };
    this.row('지도를 눌러 목적지 설정', G.markerPos ? `거리 ${Math.hypot(G.markerPos.x - pl.x, G.markerPos.z - pl.z) | 0}m` : '목적지 없음', [['해제', () => { G.hideBeacon(); G.gpsPath = null; }]]);
  }
  photo(on) {
    document.body.classList.toggle('photo', on);
    this.G.uiModal = false; if (on) this.G.input.lock();
  }
  snap() {
    const G = this.G; G.eng.render(0.016);
    G.eng.renderer.domElement.toBlob((b) => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `neon-city-${Date.now()}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); G.toast('📷 저장됨'); });
  }
}

// grid GPS: L-shaped route along road centrelines
export function gpsRoute(x0, z0, x1, z1) {
  const ni = (x) => clamp(Math.round((x + HALF) / P), 0, N);
  const i0 = ni(x0), j0 = ni(z0), i1 = ni(x1), j1 = ni(z1);
  const pts = [[x0, z0], [roadC(i0), roadC(j0)]];
  pts.push([roadC(i1), roadC(j0)], [roadC(i1), roadC(j1)], [x1, z1]);
  return pts;
}
