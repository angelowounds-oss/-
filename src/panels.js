import { ITEMS, itemName } from './items.js';
import { el } from './util.js';

// Generic two-column modal: left = backpack, right = container / shop / ATM
export class Panels {
  constructor(G) {
    this.G = G; this.mode = null; this.ctx = null;
    el('invX').onclick = () => this.close();
    addEventListener('keydown', (e) => {
      if (!this.mode) return;
      if (e.code === 'Escape' || e.code === 'Tab' || e.code === 'KeyI') { e.preventDefault(); e.stopImmediatePropagation(); this.close(); }
    }, true);
  }
  get open() { return !!this.mode; }
  show(mode, ctx) {
    const G = this.G;
    this.mode = mode; this.ctx = ctx; G.uiModal = true; G.input.unlock();
    el('inv').classList.add('on'); this.render();
  }
  close() {
    if (!this.mode) return;
    this.mode = null; this.ctx = null; this.G.uiModal = false; el('inv').classList.remove('on'); this.G.input.lock(); this.G.save();
  }
  row(ul, name, sub, buttons) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="n">${name}${sub ? `<small>${sub}</small>` : ''}</span>`;
    for (const b of buttons) { const bt = document.createElement('button'); bt.type = 'button'; bt.textContent = b[0]; bt.onclick = () => { b[1](); if (this.mode) this.render(); this.G.onItemChange?.(); }; li.appendChild(bt); }
    ul.appendChild(li);
  }
  render() {
    const G = this.G, W = G.items, inv = W.inv, m = this.mode, c = this.ctx;
    const L = el('invL'), Rr = el('invR'); L.innerHTML = ''; Rr.innerHTML = '';
    el('invT').textContent = { inv: '가방', container: c?.name || '보관함', shop: c?.name || '상점', atm: 'ATM', sell: c?.name || '매입', talk: c?.name || '대화' }[m] || '가방';
    el('invW').textContent = `무게 ${W.weight().toFixed(1)} / 25 kg · $${G.cash | 0}`;
    el('invRS').style.display = m === 'inv' ? 'none' : ''; el('invLS').style.display = m === 'talk' ? 'none' : '';
    // left: backpack
    const ids = Object.keys(inv.items);
    if (!ids.length) L.innerHTML = '<li style="color:var(--muted)">비어 있음</li>';
    for (const id of ids) {
      const d = ITEMS[id], n = inv.items[id], unpaid = inv.unpaid[id] || 0;
      const bt = [];
      if (m === 'inv' || m === 'container') {
        if (d.eat || d.heal || d.ammo || d.cash || d.fuelCan || d.gun !== undefined) bt.push(['사용', () => W.use(id)]);
        if (d.melee) bt.push(['장비', () => G.equipMelee?.(id)]);
        if (d.tool === 'flashlight') bt.push([G.flashlightOn ? '끄기' : '켜기', () => G.toggleFlashlight?.()]);
        bt.push(['버리기', () => W.dropFromInv(id)]);
      }
      if (m === 'container') bt.push(['보관 →', () => { W.take(id); c.ref.items[id] = (c.ref.items[id] || 0) + 1; }]);
      if (m === 'sell' && !unpaid) bt.push([`판매 $${Math.floor(d.price * (c.rate || 0.4))}`, () => { if (W.take(id)) { G.cash += Math.floor(d.price * (c.rate || 0.4)); G.audio.cash(); } }]);
      this.row(L, `${d.name} ×${n}`, unpaid ? `미결제 ${unpaid}개` : `${(d.mass * n).toFixed(1)}kg` + (d.price ? ` · 가치 $${d.price}` : ''), bt);
    }
    if (m === 'container') {
      el('invRT').textContent = c.name;
      const items = Object.keys(c.ref.items);
      if (!items.length) Rr.innerHTML = '<li style="color:var(--muted)">비어 있음</li>';
      for (const id of items) this.row(Rr, `${itemName(id)} ×${c.ref.items[id]}`, '', [['← 꺼내기', () => { if (c.ref.items[id] > 0) { c.ref.items[id]--; if (c.ref.items[id] <= 0) delete c.ref.items[id]; W.add(id); } }]]);
    } else if (m === 'shop') {
      el('invRT').textContent = '판매 중';
      for (const [id, price] of c.stock) this.row(Rr, itemName(id), `$${price}`, [['구매', () => { if (G.cash >= price) { G.cash -= price; W.add(id); G.audio.cash(); } else G.toast('돈이 부족합니다'); }]]);
    } else if (m === 'atm') {
      el('invRT').textContent = `계좌 잔액 $${G.state.bank | 0}`;
      for (const amt of [100, 500, 1000]) {
        this.row(Rr, `출금 $${amt}`, '', [['출금', () => { if ((G.state.bank | 0) >= amt) { G.state.bank -= amt; G.cash += amt; G.audio.cash(); } else G.toast('잔액 부족'); }]]);
      }
      for (const amt of [100, 500, 1000]) this.row(Rr, `입금 $${amt}`, '', [['입금', () => { if (G.cash >= amt) { G.cash -= amt; G.state.bank = (G.state.bank | 0) + amt; G.audio.cash(); } else G.toast('현금 부족'); }]]);
      this.row(Rr, '전액 입금', '', [['입금', () => { G.state.bank = (G.state.bank | 0) + Math.floor(G.cash); G.cash -= Math.floor(G.cash); }]]);
    } else if (m === 'talk') {
      el('invRT').textContent = c.text || '';
      for (const o of c.options) this.row(Rr, o.text, '', [['선택', () => o.fn()]]);
    } else if (m === 'sell') {
      el('invRT').textContent = '매입 시세 ' + Math.round((c.rate || 0.4) * 100) + '%';
      Rr.innerHTML = '<li style="color:var(--muted)">왼쪽 물건의 [판매]를 누르세요</li>';
    }
    el('invF').innerHTML = (G.needs ? `<span>식량 ${G.needs.s.food | 0}</span><span>수분 ${G.needs.s.water | 0}</span><span>에너지 ${G.needs.s.energy | 0}</span>` : '') + (inv.equipped ? `<span>장비: ${itemName(inv.equipped)}</span>` : '');
  }
}
