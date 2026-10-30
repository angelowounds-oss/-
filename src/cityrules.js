import { cities } from './worldmap.js';
import { Human } from './human.js';
import { rand } from './util.js';
import { cityPart } from './regions/index.js';

// What differs from city to city (ADR-0012 phase 5): each city has its own police and its own record of the player (heat is kept per jurisdiction:
// leaving one is leaving its wanted level behind, coming back finds it again, a little cooler), its own local time, weather and light colour, a pay
// level for jobs, and the people its facilities need (airport security, dock guards). Cities the player is not in are kept as a few numbers
// (a statistical simulation: how busy the streets are, an occasional incident that turns up in the news) and are brought up to date on arrival.
export const RULES = {
  neon:     cityPart('neon', 'rules'),   // src/regions/seoul.js
  harbor:   { police: '항만 경찰대',     econ: 1.25, wet: 0.45, tint: [0.86, 1.0, 1.12],    pop: 0.8,  tag: '항만' },
  airfield: cityPart('airfield', 'rules'),   // src/regions/incheon.js
  mid1:     { police: '레드우드 보안관', econ: 0.9,  wet: 0.25, tint: [1.06, 1.0, 0.86],    pop: 0.35, tag: '삼림' },
  mid2:     { police: '앰버 카운티 경찰', econ: 0.85, wet: -9,   tint: [1.2, 1.0, 0.76],     pop: 0.3,  tag: '사막' },
  mid3:     { police: '피오르드 경찰',   econ: 0.95, wet: 0.15, tint: [0.88, 1.0, 1.14],    pop: 0.3,  tag: '피오르드' },
  mid4:     { police: '신더 경찰',       econ: 1.0,  wet: 0,    tint: [1.14, 0.86, 0.86],   pop: 0.4,  tag: '화산' },
};
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const INCIDENTS = [['blaze', '부두 창고 화재'], ['murder', '강력 사건 발생'], ['assault', '길거리 폭행 신고'], ['theft', '상점가 절도 기승'], ['shots', '총성 신고 잇따라'], ['carjack', '차량 강탈 사건']];
const GUARD_LOOK = { top: 0x1b2a46, pants: 0x14192a, cap: 0x14192a, trim: [0.3, 0.6, 1], hair: 0x111111 }, DOCK_LOOK = { top: 0x4a3c2a, pants: 0x2a241c, cap: 0x2a241c, trim: [1, 0.6, 0.2], hair: 0x111111 };

export class CityRules {
  constructor(G) {
    this.G = G; this.cityId = null; this.t = 0; this.local = { hourOffset: 0, wet: 0, tint: [1, 1, 1], econ: 1 };
    const st = (G.state.cities = G.state.cities || {});
    for (const c of cities()) st[c.id] = st[c.id] || { heat: 0, seen: 0, guardsT: 0, stat: { traffic: 0.5, pop: 1, alert: 0 }, incident: 0 };
    this.crews = new Map(); this.statT = 0;
  }
  get st() { return this.G.state.cities; }
  cityAt(x, z, m = 1.1) { for (const c of cities()) if (Math.hypot(x - c.x, z - c.z) < c.r * m) return c; return null; }

  // ---- local conditions, blended by distance so nothing jumps at a border
  conditions(f) {
    const L = this.local, tint = [1, 1, 1]; let wet = 0, econ = 1, wsum = 0;
    for (const c of cities()) {
      const w = 1 - sm(c.r * 1.2, c.r * 4.5, Math.hypot(f.x - c.x, f.z - c.z)); if (w <= 0) continue; const r = RULES[c.id]; if (!r) continue;
      for (let k = 0; k < 3; k++) tint[k] += (r.tint[k] - 1) * w; wet += r.wet * w; econ += (r.econ - 1) * w; wsum += w;
    }
    L.hourOffset = f.x / 50000 * 1.5;   // the east is ahead of the west: about an hour either side of the capital's clock
    L.tint = tint; L.wet = wet; L.econ = econ; L.near = wsum;
    return L;
  }

  update(dt) {
    const G = this.G; this.t -= dt; if (this.t > 0) return; this.t = 0.5;
    const f = G.focusPos(), c = this.cityAt(f.x, f.z), id = c ? c.id : null;
    this.conditions(f);
    if (id !== this.cityId) this.changeJurisdiction(this.cityId, id, c);
    // heat decays in the cities the player is not in (statistically: -1.2 per game-minute) and the saved record keeps up
    this.statT -= 0.5; if (this.statT <= 0) { this.statT = 5; this.farSim(); }
    this.reap(f); if (c) this.guards(c, f);
  }
  changeJurisdiction(prev, id, c) {
    const G = this.G, S = this.st, now = G.clock.t;
    if (prev) { const s = S[prev]; s.heat = Math.max(s.heat, G.heat); s.seen = now; }   // the record stays with the city it was made in
    if (G.heat > 0 && prev !== id && (prev || id)) {
      // wanted level does not follow the player over a border: the new police do not know him; the old ones still do
      G.clearWanted?.();
      if (prev) G.toast('관할 이탈', `${RULES[prev]?.police || '경찰'}의 수배는 그 도시에 남았다`);
    }
    this.cityId = id; G.cityNow = id;
    if (id) {
      const s = S[id], away = Math.max(0, now - (s.seen || now)), keep = Math.max(0, s.heat - away * 1.2);   // cooled while away
      if (keep > 5 && id !== prev) { G.addHeat(keep); G.toast(c.name, `${RULES[id].police}이(가) 당신을 알아본다`); } else if (c) G.toast(c.name, `${RULES[id]?.police || ''} · ${RULES[id]?.tag || ''}`);
      s.heat = keep; s.seen = now;
      // time away: the city moved on; its incidents are in the news, ruins older than the rebuild time are gone (Blaze.addLot)
    }
  }

  // ---- the statistical simulation of the cities the player is not in
  farSim() {
    const G = this.G, h = G.clock.hour, day = 0.45 + 0.55 * Math.max(0, Math.sin((h - 5) / 24 * Math.PI * 2 * 0.5 + 0.4));
    for (const c of cities()) {
      const s = this.st[c.id], r = RULES[c.id]; if (!r) continue;
      s.stat = { traffic: +(day * (0.6 + 0.4 * r.pop)).toFixed(2), pop: Math.round(r.pop * 1000 * (0.7 + 0.3 * day)), alert: s.heat > 20 ? 1 : 0 };
      if (c.id === this.cityId) continue;
      // an incident now and then in a city nobody watches: it reaches the news with the city's name
      s.incident = (s.incident || 0) - 5; if (s.incident > 0) continue;
      s.incident = rand(900, 2400);
      const [type, text] = INCIDENTS[Math.floor(Math.random() * INCIDENTS.length)];
      G.memory?.log(type, c.x, c.z, { city: c.name, text: `${c.name} ${text}` });
    }
  }

  // ---- facility staff: airport security at the terminal and hangars, dock guards in the yards; made when the player is near, dropped when he is gone
  // the shift ends: staff of a facility the player has left are taken out of the world (fresh ones next visit)
  reap(f) {
    const G = this.G;
    for (const [id, crew] of this.crews) {
      const C = G.citysites?.cities.find((q) => q.c.id === id), pts = C ? this.facilityPoints(C) : [];
      if (!pts.length || Math.min(...pts.map((p) => Math.hypot(f.x - p.x, f.z - p.z))) > 900) { for (const h of crew) h.remove = true; this.crews.delete(id); }
    }
  }
  guards(c, f) {
    const G = this.G, C = G.citysites?.cities.find((q) => q.c.id === c.id); if (!C) return;
    const pts = this.facilityPoints(C); if (!pts.length) return;
    const dmin = Math.min(...pts.map((p) => Math.hypot(f.x - p.x, f.z - p.z))); let crew = this.crews.get(c.id);
    if (dmin > 450 || crew) return;   // made once, when the player comes within 450 m
    crew = []; this.crews.set(c.id, crew); const port = c.type === 'port';
    for (const p of pts) for (let k = 0; k < 2; k++) {
      const h = new Human(G, 'gang', { hp: 90, weapon: port ? 2 : 1, look: port ? DOCK_LOOK : GUARD_LOOK });
      h.x = p.x + rand(-5, 5); h.z = p.z + rand(-5, 5); h.y = 0; h.floorY = 0; h.ry = rand(0, 6.28); h.home = { x: h.x, z: h.z }; h.patrol = true; h.state = 'idle'; h.detect = port ? 30 : 24; h.guard = true; h.static = false; h.lookAtPlayer = false; h.cash = Math.floor(rand(30, 90)); h.facility = c.id;
      G.humans.push(h); G.scene.add(h.group); crew.push(h);
    }
  }
  // where the staff stand: the airport terminal and hangars, the middle of each container yard
  facilityPoints(C) {
    if (C.fac) return C.fac;
    const L = C.L, out = [];
    if (C.c.type === 'airport') { const R = C.c.r; out.push({ x: C.c.x, z: C.c.z + R * 0.28 - 345 }, { x: C.c.x - 470, z: C.c.z + R * 0.28 - 115 }, { x: C.c.x + 60, z: C.c.z + R * 0.28 - 115 }); }
    if (C.c.type === 'port') { for (let i = 0; i < L.areas.length; i += 6) if (L.areas[i] === 13 && (i / 6) % 3 === 0) out.push({ x: C.c.x + (L.areas[i + 1] + L.areas[i + 3]) / 2, z: C.c.z + (L.areas[i + 2] + L.areas[i + 4]) / 2 }); }
    return (C.fac = out);
  }
}
