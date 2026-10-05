import * as THREE from 'three';
import { Human } from './human.js';
import { ITEMS } from './items.js';
import { mulberry32, rand, clamp } from './util.js';

const SHOPS = {
  convenience: { name: '편의점', stock: [['burger', 6], ['noodles', 4], ['sandwich', 5], ['soda', 2], ['water', 2], ['coffee', 3], ['energy', 4], ['cigarette', 8], ['newspaper', 2], ['bandage', 8]] },
  hardware: { name: '철물점', stock: [['lockpick', 35], ['crowbar', 30], ['flashlight', 18], ['bat', 25], ['brick', 2], ['knife', 30]] },
  pharmacy: { name: '약국', stock: [['medkit', 40], ['bandage', 8], ['pills', 15], ['water', 2], ['energy', 4]] },
  arms: { name: '무기상', stock: [['mag_pistol', 12], ['mag_rifle', 20], ['mag_smg', 16], ['shells', 14], ['mag_sniper', 25], ['w_smg', 520], ['w_shotgun', 640], ['w_sniper', 1500], ['knife', 30], ['grenade', 90], ['bat', 25]] },
  restaurant: { name: '식당', stock: [['meal', 18], ['noodles', 9], ['burger', 11], ['sandwich', 8], ['coffee', 4], ['water', 3], ['energy', 6]] },
  clothes: { name: '의류점', stock: [], clothes: true },
  pawn: { name: '전당포', stock: [['watch', 600], ['laptop', 700], ['lockpick', 40], ['gold', 1300]], buys: 0.5 },
};
const SHOP_KEYS = Object.keys(SHOPS);

const colorLook = (r) => ({ top: new THREE.Color().setHSL(r(), 0.5, 0.25).getHex(), pants: new THREE.Color().setHSL(r(), 0.2, 0.12).getHex(), hair: 0x111111 });

export class Life {
  constructor(G) { this.G = G; }

  // ---------- generic fixture ----------
  fix(fl, x, y, z, r, name, verbs) {
    const o = { x, z, cy: y, r, name, verbs };
    this.G.interact.add(o); (fl.interact || (fl.interact = [])).push(o); return o;
  }
  npc(b, fl, x, y, z, opts = {}) {
    const G = this.G;
    const h = new Human(G, 'civ', { hp: opts.hp || 50, weapon: opts.weapon, look: opts.look || colorLook(Math.random) });
    h.static = true; h.lookAtPlayer = opts.look !== false; h.x = x; h.z = z; h.y = y; h.floorY = y; h.ry = opts.ry ?? Math.random() * 6.28; h.state = 'stand'; h.home = { x, z }; h.node = null; h.role = opts.role;
    h.cash = opts.cash ?? Math.floor(rand(10, 90));
    if (opts.guard) { h.team = 'gang'; h.guard = true; h.detect = 22; h.patrol = false; h.hp = h.maxHp = 90; }
    h.group.visible = false; G.humans.push(h); G.scene.add(h.group);
    (fl.npcs || (fl.npcs = [])).push(h);
    return h;
  }
  dropFloor(b, fl) {
    const G = this.G;
    for (const o of fl.interact || []) G.interact.remove(o);
    for (const h of fl.npcs || []) { const i = G.humans.indexOf(h); if (i >= 0) G.humans.splice(i, 1); G.scene.remove(h.group); }
    const pre = `f${b.id}:${fl.k}:`;
    for (const [k, r] of [...G.items.recs]) if (k.startsWith(pre)) {
      const p = G.items.props.get(k);
      if (p) { p.record(); const m = Math.hypot(r.x - r.ox, r.y - r.oy, r.z - r.oz); if (m > 0.35) G.state.moved[k] = { x: r.x, y: r.y, z: r.z, q: r.q }; G.items.props.delete(k); p.dispose(); }
      G.items.recs.delete(k);
    }
  }
  item(b, fl, n, id, x, y, z, extra) {
    const key = `f${b.id}:${fl.k}:${n}`;
    const r = this.G.items.register(key, id, x, y, z, extra);
    if (r && r.ox === undefined) { r.ox = x; r.oy = y; r.oz = z; }
    return r;
  }

  // ---------- floor population ----------
  populate(b, fl, L, rooms) {
    const G = this.G, rnd = mulberry32(b.id * 7919 + fl.k * 131 + 3), R = (a, c) => a + (c - a) * rnd();
    const y = L.y; let n = 0;
    fl.ctr = 0;
    if (L.type === 'lobby') {
      const rc = fl.reception;
      if (rc) {
        const h = this.npc(b, fl, rc.x - b.door.nx * 0.2, y, rc.z - b.door.nz * 0.2, { role: 'reception', look: { top: 0x233248, pants: 0x151a24, hair: 0x2a1a10 }, ry: Math.atan2(b.door.nx, b.door.nz) });
        this.fix(fl, rc.x, y + 1, rc.z, 2.6, '접수원', [
          { key: 'F', label: () => '대화', run: () => G.talk?.(h, b) },
          { key: 'G', label: () => '문의: 이 건물', run: () => G.toast(b.name, `${b.levels.length - 1}층 · ${b.kind === 'office' ? '오피스' : b.kind === 'hotel' ? '호텔' : '레지던스'}`) },
        ]);
      }
      if (G.hospital && G.hospital.lot === b.lot) {
        const n = this.npc(b, fl, b.cx + 3, y, b.cz + 3, { role: 'nurse', look: { top: 0xdfe8f0, pants: 0x9ab0c0, hair: 0x2a1a10 } });
        this.fix(fl, n.x, y + 1, n.z + 1, 2.6, '응급실 접수', [{ key: 'F', label: () => '응급 치료 $120', run: () => G.hospitalVisit() }]);
      }
      // ATM near the entrance
      const d = b.door, ax = b.pod.x0 + 2.2, az = b.pod.z1 - 2.2;
      this.item(b, fl, n++, 'newspaper', b.cx + R(-3, 3), y + 0.5, b.cz + R(-3, 3));
      const ap = { x: clamp(b.cx + d.nx * -2 + 3, b.pod.x0 + 1, b.pod.x1 - 1), z: clamp(b.pod.z0 + 1.4, b.pod.z0 + 1, b.pod.z1 - 1) };
      fl.B.ext('steel', ap.x - 0.4, y, ap.z - 0.3, ap.x + 0.4, y + 1.9, ap.z + 0.3, 0x2a3140);
      fl.B.ext('emit', ap.x - 0.3, y + 1.2, ap.z + 0.31, ap.x + 0.3, y + 1.6, ap.z + 0.33, new THREE.Color(0.2, 0.9, 0.6).multiplyScalar(1.6));
      fl.cc(ap.x - 0.4, ap.z - 0.3, ap.x + 0.4, ap.z + 0.3, y, y + 1.9);
      this.fix(fl, ap.x, y + 1.2, ap.z + 0.9, 1.7, 'ATM', [{ key: 'F', label: () => '이용', run: () => G.panels.show('atm', {}) }]);
      // vending machine
      const vp = { x: ap.x + 1.4, z: ap.z };
      fl.B.ext('decor', vp.x - 0.45, y, vp.z - 0.35, vp.x + 0.45, y + 1.9, vp.z + 0.35, 0x1a2230);
      fl.B.ext('emit', vp.x - 0.35, y + 0.6, vp.z + 0.36, vp.x + 0.35, y + 1.7, vp.z + 0.38, new THREE.Color(...b.accent).multiplyScalar(1.4));
      fl.cc(vp.x - 0.45, vp.z - 0.35, vp.x + 0.45, vp.z + 0.35, y, y + 1.9);
      this.fix(fl, vp.x, y + 1.0, vp.z + 0.9, 1.7, '자판기', [
        { key: 'F', label: () => '음료 $2', run: () => { if (G.cash >= 2) { G.cash -= 2; G.items.add(rnd() < 0.5 ? 'soda' : 'water'); G.audio.cash(); G.toast('음료 구매'); } else G.toast('돈이 부족합니다'); } },
        { key: 'G', label: () => '에너지 $4', run: () => { if (G.cash >= 4) { G.cash -= 4; G.items.add('energy'); G.audio.cash(); } else G.toast('돈이 부족합니다'); } },
      ]);
      // CCTV
      { const cx = b.pod.x1 - 0.8, cz = b.pod.z1 - 0.8, cy = y + L.h - 0.7; fl.B.ext('steel', cx - 0.15, cy, cz - 0.15, cx + 0.15, cy + 0.25, cz + 0.15, 0x303640); fl.B.ext('emit', cx - 0.05, cy + 0.1, cz - 0.17, cx + 0.05, cy + 0.15, cz - 0.15, new THREE.Color(1, 0.1, 0.1), 3);
        const cam = { x: cx, y: cy, z: cz, alive: true, t: 0 }; const bx = fl.cc(cx - 0.2, cz - 0.2, cx + 0.2, cz + 0.2, cy - 0.05, cy + 0.3, 'cctv'); bx.onShot = () => { if (!cam.alive) return; cam.alive = false; G.fx.sparks(cx, cy, cz, 6, [1, 0.8, 0.4], 10); G.audio.impact?.(0.6, 0); G.toast('CCTV 파괴'); }; (fl.cctv = fl.cctv || []).push(cam); }
      // lobby chairs and a plant as physical props
      for (let i = 0; i < 3; i++) this.item(b, fl, n++, 'chair', b.pod.x1 - 2.5 - i * 1.2, y + 0.5, b.pod.z0 + 2.5, {});
      if (rnd() < 0.7) { const gh = this.npc(b, fl, b.cx + R(-4, 4), y, b.cz + R(-4, 4), { guard: true, weapon: 1, look: { top: 0x1a1d29, pants: 0x0d0f16, cap: 0x0d0f16, trim: [1, 0.8, 0.2] }, ry: 0 }); void gh; }
      G.items.register?.call(G.items, `f${b.id}:${fl.k}:t`, 'brick', b.cx, y + 0.3, b.cz + 2);
    } else if (L.type === 'retail') this.shop(b, fl, L, rnd, R);
    else if (L.type === 'roof') {
      for (let i = 0; i < 4; i++) this.item(b, fl, n++, ['brick', 'can', 'bottle', 'cigarette'][i], b.tow.x1 - 4 - i * 0.6, b.roofY + 0.2, b.tow.z1 - 4 - R(0, 3));
      if (rnd() < 0.5) this.item(b, fl, n++, 'cashroll', b.tow.x1 - 3, b.roofY + 0.2, b.tow.z1 - 3);
    } else if (rooms) rooms.forEach((rm, i) => this.room(b, fl, L, rm, i, rnd, R));
  }

  shop(b, fl, L, rnd, R) {
    const G = this.G, r = L.rect, y = L.y;
    const kind = SHOP_KEYS[Math.floor(rnd() * SHOP_KEYS.length)], def = SHOPS[kind];
    fl.shop = { kind, def, name: `${def.name} · ${b.name}`, rect: { x0: r.x0 + 0.5, z0: r.z0 + 0.5, x1: r.x1 - 0.5, z1: r.z1 - 0.5 } };
    // stock sits on the shelves built in furnishOpen
    let n = 0;
    for (const sh of def.stock.length ? fl.shelves || [] : []) {
      for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) {
        const [id, price] = def.stock[Math.floor(rnd() * def.stock.length)];
        this.item(b, fl, n++, id, sh.x + (rnd() - 0.5) * 0.3, y + 0.55 + row * 0.55 + (ITEMS[id].shape[2] || 0.1) / 2 + 0.02, sh.z0 + 0.6 + i * ((sh.z1 - sh.z0 - 1.2) / 3), { sale: price });
      }
    }
    // counter + cashier
    const c = fl.counter;
    if (c) {
      const cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2;
      const h = this.npc(b, fl, cx, y, c.z0 - 0.7, { role: 'cashier', ry: 0, look: { top: 0x2a2f50, pants: 0x14161f, hair: 0x2a1a10 }, weapon: kind === 'arms' || kind === 'pawn' ? 1 : 0 });
      fl.shop.cashier = h;
      const sale = () => Object.entries(G.items.inv.unpaid);
      this.fix(fl, cx, y + 1, c.z1 + 0.2, 3.0, fl.shop.name, [
        { key: 'F', label: () => { const t = this.unpaidTotal(); return t > 0 ? `계산 $${t}` : '인사'; }, run: () => this.checkout(fl) },
        { key: 'G', label: () => (def.clothes ? '옷 갈아입기' : '상점 이용'), run: () => { if (def.clothes) this.outfitMenu(); else G.panels.show('shop', { name: fl.shop.name, stock: def.stock.map(([id, p]) => [id, Math.round(p * 1.25)]), mult: 1 }); } },
        { key: 'T', label: () => '물건 팔기', run: () => G.panels.show('sell', { name: fl.shop.name, rate: def.buys || 0.4 }) },
      ]);
    }
  }
  outfitMenu() {
    const G = this, g = this.G, cols = [['블랙', 0x1a2230], ['네이비', 0x1c3a6a], ['버건디', 0x6a1c2c], ['포레스트', 0x1c5a3a], ['머스타드', 0x8a6a1c], ['퍼플', 0x4a2a7a], ['화이트', 0xb8bcc8]];
    g.panels.show('talk', { name: '의류점', text: '상의 색상 ($40)', options: cols.map(([n, c]) => ({ text: n, fn: () => { if (g.cash < 40) return g.toast('돈이 부족합니다'); g.cash -= 40; g.state.outfit = c; g.player.m.setTop?.(c); g.audio.cash(); g.toast('옷 구매', n); } })) });
  }
  unpaidTotal() { return Math.round(this.G.items.inv.unpaidCost || 0); }
  checkout(fl) {
    const G = this.G, t = this.unpaidTotal();
    if (t <= 0) { G.toast('점원', '어서 오세요'); return; }
    if (G.cash < t) { G.toast('돈이 부족합니다', `$${t} 필요`); return; }
    G.cash -= t; G.items.inv.unpaid = {}; G.items.inv.unpaidCost = 0; G.audio.cash(); G.toast('결제 완료', `-$${t}`);
  }
  // leaving a shop with unpaid goods = shoplifting
  checkTheft(pl) {
    const G = this.G; if (!this.unpaidTotal()) return;
    const w = G.where; const fl = w?.b?.floors?.get(w.k);
    const inShop = fl && fl.shop;
    if (!inShop) {
      G.items.inv.unpaid = {}; G.items.inv.unpaidCost = 0; G.toast('절도!', '계산하지 않은 물건'); G.addHeat(18); G.noise?.(pl.x, pl.z, 30);
    }
  }

  room(b, fl, L, rm, i, rnd, R) {
    const G = this.G, y = L.y, cx = (rm.x0 + rm.x1) / 2, cz = (rm.z0 + rm.z1) / 2;
    const dirIn = rm.wall === 'n' ? 1 : -1, back = rm.wall === 'n' ? rm.z1 - 0.4 : rm.z0 + 0.4;
    let n = fl.ctr || 0;
    const it = (id, x, yy, z) => this.item(b, fl, n++, id, x, yy, z);
    const unitKey = `u${b.id}:${fl.k}:${i}`;
    // light switch beside the door
    const sx = rm.dx + 0.9, sz = rm.dz + dirIn * 0.2;
    rm.lightState = { on: true };
    this.fix(fl, sx, y + 1.3, sz, 1.5, '조명 스위치', [{ key: 'F', label: () => (rm.lightState.on ? '불 끄기' : '불 켜기'), run: () => { rm.lightState.on = !rm.lightState.on; G.audio.tone?.(700, 0.05, 'square', 0.06); } }]);
    for (const f of fl.fixtures) if (f.room === undefined && f[0] >= rm.x0 && f[0] <= rm.x1 && f[2] >= rm.z0 && f[2] <= rm.z1) f.room = rm.lightState;
    const kind = rm.kind;
    if (kind === 'bedroom') {
      const bx = cx, bz = back - dirIn * 1.2;
      this.fix(fl, bx, y + 0.6, bz - dirIn * 1.5, 2.4, '침대', [
        { key: 'F', label: () => '잠자기', run: () => G.sleep(bx, y, bz) },
        { key: 'G', label: () => '눕기', run: () => G.sitOn?.({ x: bx, y: y + 0.55, z: bz - dirIn * 1.3 }, null, true) },
        { key: 'T', label: () => '앉기', run: () => G.sitOn?.({ x: bx, y: y + 0.5, z: bz - dirIn * 1.0 }, null) },
      ]);
      if (rnd() < 0.5) it(rnd() < 0.5 ? 'watch' : 'cashroll', cx + 1.5, y + 0.6, back - dirIn * 0.5);
      this.stash(b, fl, y, rm.x0 + 0.7, back - dirIn * 0.5, '옷장', rnd);
    } else if (kind === 'living') {
      this.fix(fl, cx, y + 0.9, back - dirIn * 3.0, 3, 'TV', [
        { key: 'F', label: () => '채널 변경', run: () => (G.memory?.st.events.length && Math.random() < 0.6 ? G.toast('📺 뉴스', G.memory.latest(1)[0].text) : G.toast('📺', ['네온시티 뉴스: 폭우 경보', '사이버 격투기 중계', '드라마 재방송', '광고: NEXUS 임플란트'][Math.floor(Math.random() * 4)])) },
      ]);
      this.fix(fl, cx, y + 0.5, back - dirIn * 0.9, 2.4, '소파', [{ key: 'F', label: () => '앉기', run: () => G.sitOn?.({ x: cx, y: y + 0.5, z: back - dirIn * 1.0 }, null) }]);
      it('chair', rm.x0 + 1.3, y + 0.5, cz); it('houseplant', rm.x1 - 0.8, y + 0.3, cz + dirIn * 0.5);
      if (rnd() < 0.5) it('newspaper', cx, y + 0.45, back - dirIn * 3.4);
      if (rnd() < 0.3) it('bottle', cx + 0.4, y + 0.45, back - dirIn * 3.5);
      // apartment for sale
      if (L.type === 'apartment') this.forSale(b, fl, y, rm, i, unitKey, rnd);
    } else if (kind === 'kitchen') {
      const ref = { key: `fr:${b.id}:${fl.k}:${i}` };
      this.fix(fl, rm.x1 - 0.5, y + 1, back - dirIn * 1.2, 1.9, '냉장고', [{ key: 'F', label: () => '열기', run: () => G.openContainer(this.fridge(ref, rnd)) }]);
      it(['burger', 'noodles', 'sandwich', 'coffee'][i % 4], cx, y + 0.93, back - dirIn * 0.6);
      it('soda', cx + 0.5, y + 0.95, back - dirIn * 0.6);
      it('trash', rm.x0 + 0.7, y + 0.35, cz);
      if (rnd() < 0.3) it('knife', cx - 0.6, y + 0.93, back - dirIn * 0.5);
    } else if (kind === 'office') {
      this.fix(fl, cx, y + 0.9, back - dirIn * 1.5, 2.2, '업무용 컴퓨터', [
        { key: 'F', label: () => '컴퓨터 이용', run: () => G.toast('💻', '업무 메일이 가득하다…') },
        { key: 'G', label: () => '데이터 빼내기', enabled: () => !rm.looted, run: () => G.beginTimed('데이터 복사 중…', 6, () => { rm.looted = true; G.items.add('docs'); G.toast('기밀 문서 확보', '경보 가능성…'); if (Math.random() < 0.4) { G.alarmBuilding?.(b, fl); } else G.noteCrime(G.player, 'hack', 6); }, 2.4) },
      ]);
      for (let k = 0; k < 3; k++) it('chair', rm.x0 + 1.5 + k * 2.2, y + 0.5, back - dirIn * 2.4);
      it('coffee', cx - 0.8, y + 0.78, back - dirIn * 1.0); if (rnd() < 0.5) it('laptop', cx + 0.4, y + 0.78, back - dirIn * 1.0);
      if (rnd() < 0.5) this.npc(b, fl, cx + R(-1, 1), y, cz + dirIn * 0.2, { ry: dirIn > 0 ? 0 : Math.PI });
    } else if (kind === 'meeting') {
      it('chair', cx - 1.1, y + 0.5, cz - 1.2); it('chair', cx + 1.1, y + 0.5, cz + 1.2); it('water', cx, y + 0.8, cz);
    } else if (kind === 'server') {
      this.fix(fl, cx, y + 1, back - dirIn * 1.6, 2.4, '서버 랙', [
        { key: 'F', label: () => '서버 해킹', enabled: () => !rm.looted, run: () => G.beginTimed('서버 접속 중…', 7, () => { rm.looted = true; G.items.add('docs', 2); G.cash += 400; G.toast('데이터 탈취', '+$400 · 경보 작동'); G.alarmBuilding?.(b, fl); G.jobs?.event('server', b); }, 2.6) },
      ]);
      if (rnd() < 0.6) this.npc(b, fl, cx, y, cz, { guard: true, weapon: 1, look: { top: 0x1a1d29, pants: 0x0d0f16, cap: 0x0d0f16 }, ry: Math.PI });
    }
    fl.ctr = n;
  }
  stash(b, fl, y, x, z, name, rnd) {
    const G = this.G, key = `st:${b.id}:${fl.k}:${Math.round(x)}:${Math.round(z)}`;
    this.fix(fl, x, y + 1, z, 1.7, name, [{ key: 'F', label: () => '열기', run: () => { const st = G.state.containers; if (!st[key]) { st[key] = { name, items: {} }; const r = mulberry32(key.length * 31 + b.id); if (r() < 0.45) st[key].items[['cashroll', 'watch', 'bandage', 'pills', 'flashlight'][Math.floor(r() * 5)]] = 1; } G.openContainer({ key, ...st[key], ref: st[key] }); } }]);
  }
  fridge(ref, rnd) {
    const G = this.G, st = G.state.containers;
    if (!st[ref.key]) { const it = {}; const k = 1 + Math.floor(rnd() * 4); for (let i = 0; i < k; i++) { const id = ['burger', 'noodles', 'sandwich', 'soda', 'water', 'energy'][Math.floor(rnd() * 6)]; it[id] = (it[id] || 0) + 1; } st[ref.key] = { name: '냉장고', items: it }; }
    return { key: ref.key, ...st[ref.key], ref: st[ref.key] };
  }
  forSale(b, fl, y, rm, i, unitKey, rnd) {
    const G = this.G, price = 8000 + Math.floor(rnd() * 12) * 500 + fl.k * 400;
    const o = this.fix(fl, rm.dx - 0.9, y + 1.2, rm.dz + (rm.wall === 'n' ? 0.5 : -0.5), 1.6, '', [
      { key: 'F', label: () => (G.state.homes[unitKey] ? '내 집' : `이 집 구매 $${price}`), run: () => {
        if (G.state.homes[unitKey]) { G.toast('내 집', '침대에서 잠자고 저장할 수 있습니다'); return; }
        if (G.cash >= price) { G.cash -= price; G.state.homes[unitKey] = { x: rm.dx, z: rm.dz, y }; G.toast('집 구매 완료', `-$${price}`); G.audio.complete(); G.save(); } else G.toast('돈이 부족합니다', `$${price} 필요`);
      } },
    ]);
    Object.defineProperty(o, 'name', { get: () => (G.state.homes[unitKey] ? '내 집' : '매물') });
  }
}
