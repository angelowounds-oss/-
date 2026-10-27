import { landHeight } from './landfn.js';
import { region, regionPlaces } from './region.js';
import { Vehicle } from './vehicle.js';

// Reference views (AAA-PLAN Q0-3): twelve fixed scenes, each with its place, hour, weather and camera, so a change that alters the picture can be
// seen before and after (tests/tools/golden-views.cjs) and the player can take the same picture on a real GPU (?view=n). Applying a view stops
// the clock, sets the weather, puts the player near the spot (the world streams in around the player) and pins the camera (Game.viewCam).
const ground = (x, z) => { const h = landHeight(x, z, 8); return h === h ? h : 0; };
const at = (x, z, dy = 0) => ({ x, y: ground(x, z) + dy, z });
// a camera at `from` looking at `to`, both {x, y, z}
const look = (from, to, fov = 60) => ({ x: from.x, y: from.y, z: from.z, tx: to.x, ty: to.y, tz: to.z, fov });

// the longest bridge run of a compiled motorway (else of any road): its middle sample
function viaduct(g) {
  let best = null;
  for (const r of g.highways?.N?.roads || []) {
    let i = 0; const motor = r.hw === 'motorway';
    while (i < r.pts.length) { if (r.cls[i] !== 1) { i++; continue; } let j = i; while (j < r.pts.length && r.cls[j] === 1) j++; const score = (j - i) * (motor ? 3 : 1); if (!best || score > best.score) best = { r, i: (i + j) >> 1, score }; i = j; }
  }
  return best;
}
// the highest cell of the compiled region, away from its border
function summit() {
  const R = region(); if (!R) return null;
  let b = -1, bi = 0, bj = 0; const m = 40;
  for (let j = m; j < R.nz - m; j += 2) for (let i = m; i < R.nx - m; i += 2) { const h = R.h[j * R.nx + i]; if (h > b) { b = h; bi = i; bj = j; } }
  return { x: R.x0 + bi * R.g, z: R.z0 + bj * R.g, y: b / 10 };
}
const city = (g, id) => g.citysites?.cities.find((C) => C.c.id === id) || g.citysites?.cities[0];

export const VIEWS = [
  { id: 'neon-plaza-night', name: 'NEON 광장 밤', hour: 22.5, weather: 'clear', place: (g) => { const p = g.world.plaza; return { p: at(p.cx + 20, p.cz + 20), cam: look({ x: p.x1 - 4, y: 8, z: p.z1 - 4 }, { x: p.x0, y: 30, z: p.z0 }) }; } },
  { id: 'neon-plaza-day', name: 'NEON 광장 낮', hour: 13, weather: 'clear', place: (g) => { const p = g.world.plaza; return { p: at(p.cx + 20, p.cz + 20), cam: look({ x: p.x1 - 4, y: 8, z: p.z1 - 4 }, { x: p.x0, y: 30, z: p.z0 }) }; } },
  { id: 'neon-street-rain', name: 'NEON 거리 비 밤', hour: 23, weather: 'rain', wet: 1, place: (g) => { const s = g.world.spawn; return { p: at(s.x, s.z), cam: look({ x: s.x + 1.5, y: 1.7, z: s.z + 4 }, { x: s.x + 1.5, y: 3, z: s.z - 60 }, 66) }; } },
  { id: 'sky-tower-dusk', name: '스카이타워 해질녘', hour: 18.6, weather: 'clear', place: (g) => { const l = g.world.skyTower || g.world.plaza, cx = l.cx ?? (l.x0 + l.x1) / 2, cz = l.cz ?? (l.z0 + l.z1) / 2; return { p: at(cx + 60, cz + 60), cam: look({ x: cx + 700, y: 420, z: cz + 800 }, { x: cx, y: 450, z: cz }, 55) }; } },
  { id: 'city-street-day', name: '지방 도시 거리 낮', hour: 11, weather: 'clear', place: (g) => { const c = city(g, 'mid1').c; return { p: { x: c.x + 40, y: c.y + 1, z: c.z + 40 }, cam: look({ x: c.x, y: c.y + 260, z: c.z + 520 }, { x: c.x, y: c.y, z: c.z - 100 }) }; } },
  { id: 'harbor-sunset', name: '부산 부두 해질녘', hour: 18.2, weather: 'clear', place: (g) => { const C = city(g, 'harbor'), c = C.c, d = C.L.seaDir || { x: 0, z: 1 }, R = C.L.R; return { p: { x: c.x, y: c.y + 1, z: c.z }, cam: look({ x: c.x + d.x * R * 0.2, y: c.y + 220, z: c.z + d.z * R * 0.2 - 260 }, { x: c.x + d.x * R * 0.6, y: c.y, z: c.z + d.z * R * 0.6 }) }; } },
  { id: 'viaduct-day', name: '고속도로 고가 낮', hour: 10, weather: 'clear', place: (g) => { const v = viaduct(g); if (!v) return null; const r = v.r, i = v.i, a = r.pts[Math.max(0, i - 1)], b = r.pts[Math.min(r.pts.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = (b[1] - a[1]) / l, nz = -(b[0] - a[0]) / l, [x, z] = r.pts[i];
    return { p: at(x + nx * 40, z + nz * 40), cam: look(at(x + nx * 90, z + nz * 90, 1.8), { x, y: r.y[i], z }, 62) }; } },
  { id: 'mountain-day', name: '산 낮', hour: 14, weather: 'clear', place: () => { const s = summit(); if (!s) return null; return { p: at(s.x + 300, s.z + 300), cam: look(at(s.x + 260, s.z + 260, 30), { x: s.x, y: s.y, z: s.z }, 60) }; } },
  { id: 'korea-town-day', name: '실제 읍·면 낮', hour: 12, weather: 'clear', place: () => { const q = regionPlaces().find((o) => o.kind === 'town') || regionPlaces()[0]; if (!q) return null; return { p: at(q.x, q.z, 1), cam: look(at(q.x + q.r * 0.9, q.z + q.r * 0.9, 45), { x: q.x, y: q.y, z: q.z }) }; } },
  { id: 'interior-night', name: '실내 밤', hour: 21, weather: 'clear', indoor: true, place: (g) => { const B = g.buildings, pl = g.player, bd = B.list.filter((x) => x.kind === 'apartment' && !x.lot.far && !x.lot.model && x.lot.h > 50).sort((a, b) => Math.hypot(a.cx - pl.x, a.cz - pl.z) - Math.hypot(b.cx - pl.x, b.cz - pl.z))[0]; if (!bd) return null; const d = bd.lot.door; return { p: { x: d.px + d.nx * 3, y: 0.6, z: d.pz + d.nz * 3 }, bd }; } },
  { id: 'crowd-day', name: '군중 낮', hour: 17, weather: 'clear', place: (g) => { const s = g.world.spawn; return { p: at(s.x, s.z), cam: look({ x: s.x - 2, y: 2.2, z: s.z + 8 }, { x: s.x - 6, y: 1.5, z: s.z - 40 }, 58) }; } },
  { id: 'car-night', name: '차량 근접 밤', hour: 22, weather: 'rain', wet: 0.6, car: true, place: (g) => { const s = g.world.spawn, rx = s.x - 8; return { p: at(s.x, s.z - 6), car: { x: rx, z: s.z - 12, h: 0.5 }, cam: look({ x: rx + 3.6, y: 1.25, z: s.z - 7.8 }, { x: rx, y: 0.7, z: s.z - 12 }, 50) }; } },
];

const frames = (n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
const tp = (pl, p) => { pl.body3.teleport(p.x, p.y, p.z); pl.x = p.x; pl.y = p.y; pl.z = p.z; pl.vx = pl.vy = pl.vz = 0; };

// put the game into view n (0-based); `wait(frames)` lets the world stream in (default: real frames, the tool passes its own stepping)
export async function applyView(g, n, wait = frames) {
  const V = VIEWS[n]; if (!V) throw new Error('view ' + n + ' does not exist (0..' + (VIEWS.length - 1) + ')');
  const pl = g.player;
  if (g.vehicle) g.exitVehicle?.();
  g.viewCam = null; g.hurtPlayer = () => {}; g.shakeAmt = 0; g.nextLightning = 1e12;
  const P = V.place(g); if (!P) return { id: V.id, skipped: true };
  tp(pl, P.p);
  const setSky = () => {
    g.clock.scale = 0; g.clock.t = Math.floor(g.clock.t / 1440) * 1440 + ((V.hour - (g.rules?.local?.hourOffset || 0) + 24) % 24) * 60;
    g.state.weather = { type: V.weather, until: g.clock.t + 1e9 }; g.daynight.wet = V.wet ?? (V.weather === 'clear' ? 0 : 1);
  };
  setSky();
  if (P.car && !g.viewCar) {
    const v = (g.viewCar = new Vehicle(g, 'sedan', 0x8a1f2b, 'parked')); v.x = P.car.x; v.z = P.car.z; v.h = P.car.h; v.awake = false; g.addVehicle(v);   // as the game parks its cars
  }
  if (P.bd) {   // an apartment: open it at the door, build a floor of its tower and stand in a room of it
    const bd = P.bd; await wait(1); for (let i = 0; i < 60 && !bd.open; i++) await wait(5);
    bd.plan(); const k = bd.levels.findIndex((l) => l.tier === 'tower') + 2; bd.ensureRange(k, k, true); while (bd.job) bd.finishJob(); bd.buildFloor(k);
    const fl = bd.floors.get(k), L = bd.levels[k], rm = (fl.rooms || [])[0] || { x0: L.rect.x0 + 2, x1: L.rect.x0 + 8, z0: L.rect.z0 + 2, z1: L.rect.z0 + 8 };
    const cx = (rm.x0 + rm.x1) / 2, cz = (rm.z0 + rm.z1) / 2; tp(pl, { x: cx, y: L.y + 0.2, z: cz });
    P.cam = look({ x: rm.x0 + 0.5, y: L.y + 1.55, z: rm.z0 + 0.5 }, { x: cx, y: L.y + 0.9, z: cz }, 70);
  }
  g.viewCam = P.cam;
  await wait(2); g.highways?.arterials(g.camera, true);   // the compiled roads around the camera at once (they stream in over seconds otherwise)
  await wait(30); setSky(); await wait(30);   // the city's hour offset is known once its rules apply: set the hour again
  return { id: V.id, name: V.name, x: Math.round(pl.x), z: Math.round(pl.z) };
}

if (typeof window !== 'undefined') window.__views = { VIEWS, applyView, count: VIEWS.length };   // test hook
