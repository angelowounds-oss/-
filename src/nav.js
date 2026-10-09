// Grid navmesh for building interiors and streets: rasterise collider boxes on a floor into 0.5m cells, A* with string-pulling.
// The search runs often (NPCs re-path while chasing), so it allocates nothing per call: grid, costs and parents live in grow-only typed
// arrays validated by a per-search stamp, and the open set is a binary heap (the old linear scan + splice was O(n^2) per search).
const CS = 0.5;
let cap = 0, blocked = null, gCost = null, from = null, seen = null, closed = null, gen = 0;
let hF = new Float32Array(4096), hN = new Int32Array(4096), hLen = 0;
const NEAR = [];
function ensure(n) {
  if (n <= cap) return;
  cap = n; blocked = new Uint8Array(n); gCost = new Float32Array(n); from = new Int32Array(n); seen = new Uint32Array(n); closed = new Uint32Array(n); gen = 0;
}
function push(f, n) {
  if (hLen === hF.length) { const F = new Float32Array(hLen * 2), M = new Int32Array(hLen * 2); F.set(hF); M.set(hN); hF = F; hN = M; }
  let i = hLen++;
  while (i > 0) { const p = (i - 1) >> 1; if (hF[p] <= f) break; hF[i] = hF[p]; hN[i] = hN[p]; i = p; }
  hF[i] = f; hN[i] = n;
}
function pop() {
  const top = hN[0], f = hF[--hLen], n = hN[hLen];
  let i = 0;
  for (;;) {
    let c = 2 * i + 1; if (c >= hLen) break;
    if (c + 1 < hLen && hF[c + 1] < hF[c]) c++;
    if (hF[c] >= f) break;
    hF[i] = hF[c]; hN[i] = hN[c]; i = c;
  }
  if (hLen > 0) { hF[i] = f; hN[i] = n; }
  return top;
}
export function navPath(G, y, x0, z0, x1, z1, maxR = 40) {
  const col = G.world.colliders, pad = 10;
  const minx = Math.min(x0, x1) - pad, maxx = Math.max(x0, x1) + pad, minz = Math.min(z0, z1) - pad, maxz = Math.max(z0, z1) + pad;
  const W = Math.ceil((maxx - minx) / CS), D = Math.ceil((maxz - minz) / CS);
  if (W * D > 40000) return null;
  ensure(W * D);
  if (++gen === 0xffffffff) { seen.fill(0); closed.fill(0); gen = 1; }
  blocked.fill(0, 0, W * D);
  const ln = col.nearN((minx + maxx) / 2, (minz + maxz) / 2, Math.max(maxx - minx, maxz - minz) / 2 + 4, NEAR);
  const r = 0.38;
  for (let k = 0; k < ln; k++) {
    const b = NEAR[k];
    if (b.kind !== 0 || b.tag === 'slab' || b.tag === 'ramp' || b.tag === 'cap') continue;
    if ((b.y0 || 0) > y + 1.9 || b.h < y + 0.35) continue;
    const i0 = Math.max(0, Math.floor((b.x0 - r - minx) / CS)), i1 = Math.min(W - 1, Math.floor((b.x1 + r - minx) / CS));
    const j0 = Math.max(0, Math.floor((b.z0 - r - minz) / CS)), j1 = Math.min(D - 1, Math.floor((b.z1 + r - minz) / CS));
    if (i1 >= i0) for (let j = j0; j <= j1; j++) blocked.fill(1, j * W + i0, j * W + i1 + 1);   // (fill with a negative end would count from the array's end)
  }
  const idx = (x, z) => Math.floor((z - minz) / CS) * W + Math.floor((x - minx) / CS);
  const s = idx(x0, z0), t = idx(x1, z1), tx = t % W, tz = (t / W) | 0;
  blocked[s] = 0; blocked[t] = 0;
  const hz = (i) => Math.hypot((i % W) - tx, ((i / W) | 0) - tz);
  hLen = 0; seen[s] = gen; gCost[s] = 0; from[s] = -1; push(hz(s), s);
  let guard = 0;
  while (hLen && guard++ < 60000) {
    const cur = pop();
    if (closed[cur] === gen) continue;   // a stale heap entry: this cell was already expanded with a lower cost
    closed[cur] = gen;
    if (cur === t) break;
    const cx = cur % W, cz = (cur / W) | 0, gc = gCost[cur];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
      const n = nz * W + nx; if (blocked[n] || closed[n] === gen) continue;
      if (dx && dz && (blocked[cz * W + nx] || blocked[nz * W + cx])) continue;
      const ng = gc + (dx && dz ? 1.414 : 1);
      if (seen[n] !== gen || ng < gCost[n]) { seen[n] = gen; gCost[n] = ng; from[n] = cur; push(ng + hz(n), n); }
    }
  }
  if ((seen[t] !== gen || from[t] < 0) && s !== t) return null;
  const pts = []; for (let c = t; c !== -1 && c !== s; c = from[c]) pts.push([minx + ((c % W) + 0.5) * CS, minz + (((c / W) | 0) + 0.5) * CS]);
  pts.reverse();
  // string pulling: drop waypoints while a straight corridor stays free
  const free = (ax, az, bx, bz) => { const n = Math.ceil(Math.hypot(bx - ax, bz - az) / (CS * 0.5)); for (let k = 1; k < n; k++) { const f = k / n, c = idx(ax + (bx - ax) * f, az + (bz - az) * f); if (blocked[c]) return false; } return true; };
  const out = []; let ax = x0, az = z0, i = 0;
  while (i < pts.length) { let j = pts.length - 1; while (j > i && !free(ax, az, pts[j][0], pts[j][1])) j--; out.push(pts[j]); ax = pts[j][0]; az = pts[j][1]; i = j + 1; }
  return out;
}
