import * as THREE from 'three';
import { WEAPONS } from './human.js';

// Weapon attachments: muzzle (suppressor), optic (red dot / 4x scope), magazine (extended). They belong to a weapon slot and are saved in
// G.state.att[weaponIndex] = { muzzle, optic, mag } (item ids). The player's effective weapon is the base entry with the modifiers applied;
// NPCs keep using the plain WEAPONS table.
export const ATT = {
  att_sup: { slot: 'muzzle', name: '소음기', compat: [0, 1, 2, 4], text: '총성 크기와 소음 범위 감소, 피해 −8%, 사거리 −5%' },
  att_reddot: { slot: 'optic', name: '도트 사이트', compat: [0, 1, 2, 3], text: '조준 시 점 조준기, 배율 1.6배, 조준 시 탄 퍼짐 −10%' },
  att_scope4: { slot: 'optic', name: '4배율 조준경', compat: [1, 2], text: '조준 시 4배율, 조준 시 탄 퍼짐 −15%' },
  att_mag: { slot: 'mag', name: '확장 탄창', compat: [0, 1, 2, 3], text: '탄창 용량 +60%, 재장전 +15% 느림' },
};
export const SLOT_NAME = { muzzle: '총구', optic: '광학', mag: '탄창' };
const cache = new Map();

export function effective(i, att) {
  const base = WEAPONS[i]; if (!base || !att) return base;
  const key = `${i}|${att.muzzle || ''}|${att.optic || ''}|${att.mag || ''}`; if (!att.muzzle && !att.optic && !att.mag) return base;
  let w = cache.get(key); if (w) return w;
  w = { ...base };
  if (att.muzzle === 'att_sup') { w.sup = true; w.damage = base.damage * 0.92; w.range = base.range * 0.95; w.noiseK = 0.3; w.tracer = base.tracer.map((c) => c * 0.45); }
  if (att.optic === 'att_reddot') { w.scope = 'dot'; w.zoom = Math.max(base.zoom, 1.6); w.aimSpread = 0.9; }
  if (att.optic === 'att_scope4') { w.scope = 'dot'; w.zoom = 4; w.aimSpread = 0.85; }
  if (att.mag === 'att_mag') { w.clip = Math.round(base.clip * 1.6); w.reload = base.reload * 1.15; }
  cache.set(key, w);
  return w;
}

export function attOf(G, i) { return (G.state.att && G.state.att[i]) || null; }

// fit an item from the backpack onto the weapon in hand
export function attach(G, id) {
  const d = ATT[id], pl = G.player, i = pl.cur;
  if (!d) return false;
  if (i === 9 || !WEAPONS[i]) { G.toast('무기를 들고 있어야 한다'); return false; }
  if (!d.compat.includes(i)) { G.toast(`${WEAPONS[i].name}에는 장착할 수 없다`, d.name); return false; }
  if (!G.items.take(id)) return false;
  const cur = G.state.att || (G.state.att = {}), a = cur[i] || (cur[i] = {});
  if (a[d.slot]) G.items.add(a[d.slot]);
  a[d.slot] = id;
  G.toast(`${d.name} 장착`, WEAPONS[i].name); G.audio.tone?.(420, 0.05, 'square', 0.06, 300);
  afterChange(G, i); return true;
}
export function detach(G, i, slot) {
  const a = attOf(G, i); if (!a || !a[slot]) return;
  G.items.add(a[slot]); delete a[slot];
  G.toast('부착물 해제', SLOT_NAME[slot]); afterChange(G, i);
}
function afterChange(G, i) {
  const w = effective(i, attOf(G, i)), am = G.player.ammo[i];
  if (am.clip > w.clip) { am.reserve += am.clip - w.clip; am.clip = w.clip; }
  G.onItemChange?.(); refreshVisuals(G);
}

// ------------------------------------------------------------------ 3D parts on the hand-held gun and the first-person copy
const metal = new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.4, metalness: 0.85 });
const lens = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.1, 0.1).multiplyScalar(3), toneMapped: false });
const glass = new THREE.MeshStandardMaterial({ color: 0x223040, roughness: 0.1, metalness: 0.6 });
const parts = {
  pistol: { sup: [0.018, 0.14, 0.048, 0.162], dot: [0.095, 0.02], scope: [0.1, 0.02] },
  rifle: { sup: [0.02, 0.2, 0.02, 0.77], dot: [0.09, 0.3], scope: [0.1, 0.3] },
};
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
function ensure(root, name, make) { let o = root.getObjectByName(name); if (!o) { o = make(); o.name = name; root.add(o); } return o; }
function setVis(root, kind, att) {
  const P = parts[kind];
  const sup = ensure(root, 'att_sup', () => { const [r, len, y, z] = P.sup; const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12).rotateX(Math.PI / 2), metal); m.position.set(0, y, z + len / 2 - 0.01); return m; });
  sup.visible = att.muzzle === 'att_sup';
  const dot = ensure(root, 'att_dot', () => {
    const g = new THREE.Group(), [y, z] = P.dot;
    g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.05), metal), 0, 0, 0));
    g.add(at(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.004), glass), 0, 0.004, 0.027));
    g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.004, 6, 4), lens), 0, 0.004, 0.03));
    g.position.set(0, y, z); return g;
  });
  dot.visible = att.optic === 'att_reddot';
  const sc = ensure(root, 'att_scope', () => {
    const g = new THREE.Group(), [y, z] = P.scope;
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.2, 14).rotateX(Math.PI / 2), metal));
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.03, 14).rotateX(Math.PI / 2), metal), 0, 0, 0.1));
    g.add(at(new THREE.Mesh(new THREE.CircleGeometry(0.026, 14), glass), 0, 0, 0.116));
    g.position.set(0, y + 0.02, z); return g;
  });
  sc.visible = att.optic === 'att_scope4';
  // extended magazine: the magazine part grows downward
  const mag = root.getObjectByName('mag');
  if (mag) { if (!mag.userData.b) mag.userData.b = { y: mag.scale.y, py: mag.position.y }; const k = att.mag === 'att_mag' ? 1.45 : 1; mag.scale.y = mag.userData.b.y * k; mag.position.y = mag.userData.b.py - (k - 1) * (kind === 'pistol' ? 0.03 : 0.045); }
}
export function refreshVisuals(G) {
  const pl = G.player; if (!pl?.m) return;
  const att = (pl.cur !== 9 && attOf(G, pl.cur)) || {};
  for (const k of ['pistol', 'rifle']) for (const root of [pl.m[k], G.vmGun?.[k]]) if (root) setVis(root, k, att);
}
