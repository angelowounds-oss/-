import { registry } from './buildingid.js';
import { landHeight } from './landfn.js';

// Building numbers in the game (ADR-0030), for maintenance: `?ids=1` (or __bld.show(true)) shows the number of the building the player is in, or
// the one the camera looks at, on the clock line; __bld.find(uid) / __bld.go(uid) look a number up in the full list and stand the player at its
// street side; `?bld=<uid>` starts there. The list is made once, on first use.
let ROWS = null;
const rows = (G) => ROWS || (ROWS = registry(G.world.lots));

// the lot (capital or an open city tile) whose footprint holds the point the camera looks at, within 400 m
export function aimedLot(G) {
  const c = G.camera, d = c.getWorldDirection(G.tmpV2 || (G.tmpV2 = c.position.clone())), hit = G.world.colliders.raycast(c.position.x, c.position.y, c.position.z, d.x, d.y, d.z, 400);
  if (hit < 0) return null;
  const x = c.position.x + d.x * (hit + 0.5), z = c.position.z + d.z * (hit + 0.5), inside = (l) => x > l.x0 - 0.6 && x < l.x1 + 0.6 && z > l.z0 - 0.6 && z < l.z1 + 0.6;
  return G.world.lots.find(inside) || G.buildings.list.map((b) => b.lot).find((l) => l && l.uid && inside(l)) || null;
}

// the text for the clock line: the building's number, or '' when the numbers are not shown
export function idLabel(G) {
  if (!G.showIds) return '';
  if (G.where) return G.where.b.lot?.uid || '';
  const now = performance.now(); if (now - (G.aimAt || 0) > 250) { G.aimAt = now; const l = aimedLot(G); G.aimUid = l ? l.uid + (l.alias ? ' ' + l.alias : '') : ''; }
  return G.aimUid || '';
}

export function find(G, uid) { const u = String(uid).toUpperCase(); return rows(G).find((r) => r.uid === u || (u === 'NC-SKY' && r.kind === 'sky-tower')) || null; }
// stand the player 6 m beyond the building's east side, on the ground
export function go(G, uid) {
  const r = find(G, uid); if (!r) return null;
  const pl = G.player, x = r.x + r.w / 2 + 6, z = r.z, h = landHeight(x, z, 8), y = (h === h ? h : 0) + 0.6;
  pl.body3.teleport(x, y, z); pl.x = x; pl.y = y; pl.z = z; pl.vx = pl.vy = pl.vz = 0;
  return r;
}

export function initBuildingDev(G, params) {
  if (params.has('ids')) G.showIds = params.get('ids') !== '0';
  const api = { find: (u) => find(G, u), go: (u) => go(G, u), show: (on = true) => { G.showIds = !!on; }, list: () => rows(G), aim: () => aimedLot(G)?.uid || null };
  if (typeof window !== 'undefined') window.__bld = api;
  if (params.has('bld')) go(G, params.get('bld'));
  return api;
}
