// The real motorway network (OpenStreetMap, ODbL; KOREA-PLAN D2) as a graph in map metres: the highway planner follows these lines
// between cities instead of inventing its own path. Lines are joined where their vertices fall in the same 40 m cell.
import { ROADS } from './korearoads.js';

const SNAP = 40;   // map m: vertices this close are one junction
const REACH = 3000;   // map m: a city farther than this from the network gets no road from it (about 20 km real)
let G = null;

// binary min-heap of [cost, node]
function heap() {
  const h = [];
  const push = (v) => { h.push(v); let c = h.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (h[p][0] <= h[c][0]) break; [h[p], h[c]] = [h[c], h[p]]; c = p; } };
  const pop = () => {
    const top = h[0], last = h.pop();
    if (h.length) { h[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === c) break; [h[m], h[c]] = [h[c], h[m]]; c = m; } }
    return top;
  };
  return { push, pop, get size() { return h.length; } };
}

function graph() {
  if (G) return G;
  const ids = new Map(), P = [], adj = [];
  const node = (x, z) => {
    const key = Math.round(x / SNAP) + ',' + Math.round(z / SNAP);
    let id = ids.get(key);
    if (id === undefined) { id = P.length; ids.set(key, id); P.push([x, z]); adj.push([]); }
    return id;
  };
  for (const r of ROADS.roads) {
    if (r.hw !== 'motorway') continue;
    for (let i = 1; i < r.pts.length; i++) {
      const a = node(r.pts[i - 1][0], r.pts[i - 1][1]), b = node(r.pts[i][0], r.pts[i][1]);
      if (a === b) continue;
      const d = Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1]);
      adj[a].push([b, d]); adj[b].push([a, d]);
    }
  }
  G = { P, adj };
  return G;
}

// nearest graph vertex to (x, z) within REACH, or -1
function nearest(g, x, z) {
  let best = -1, bd = REACH;
  for (let i = 0; i < g.P.length; i++) {
    const d = Math.hypot(g.P[i][0] - x, g.P[i][1] - z);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// the motorway polyline from (ax, az) to (bx, bz) in map metres (both ends snapped to the network), or null when no route exists
export function osmRoute(ax, az, bx, bz) {
  const g = graph(), s = nearest(g, ax, az), t = nearest(g, bx, bz);
  if (s < 0 || t < 0) return null;
  const dist = new Float64Array(g.P.length).fill(Infinity), from = new Int32Array(g.P.length).fill(-1), h = heap();
  dist[s] = 0; h.push([0, s]);
  while (h.size) {
    const [d, u] = h.pop();
    if (u === t) break;
    if (d > dist[u]) continue;
    for (const [v, w] of g.adj[u]) if (d + w < dist[v]) { dist[v] = d + w; from[v] = u; h.push([dist[v], v]); }
  }
  if (dist[t] === Infinity) return null;
  const path = [];
  for (let k = t; k >= 0; k = from[k]) { path.push(g.P[k]); if (k === s) break; }
  path.reverse();
  return [[ax, az], ...path.slice(1, -1), [bx, bz]];
}
