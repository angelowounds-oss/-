// Grid navmesh for building interiors: rasterise collider boxes on a floor into 0.5m cells, A* with string-pulling.
const CS = 0.5;
export function navPath(G, y, x0, z0, x1, z1, maxR = 40) {
  const col = G.world.colliders, pad = 10;
  const minx = Math.min(x0, x1) - pad, maxx = Math.max(x0, x1) + pad, minz = Math.min(z0, z1) - pad, maxz = Math.max(z0, z1) + pad;
  const W = Math.ceil((maxx - minx) / CS), D = Math.ceil((maxz - minz) / CS);
  if (W * D > 40000) return null;
  const blocked = new Uint8Array(W * D);
  const list = col.near((minx + maxx) / 2, (minz + maxz) / 2, Math.max(maxx - minx, maxz - minz) / 2 + 4, []);
  const r = 0.38;
  for (const b of list) {
    if (b.kind !== 0 || b.tag === 'slab' || b.tag === 'ramp' || b.tag === 'cap') continue;
    if ((b.y0 || 0) > y + 1.9 || b.h < y + 0.35) continue;
    const i0 = Math.max(0, Math.floor((b.x0 - r - minx) / CS)), i1 = Math.min(W - 1, Math.floor((b.x1 + r - minx) / CS));
    const j0 = Math.max(0, Math.floor((b.z0 - r - minz) / CS)), j1 = Math.min(D - 1, Math.floor((b.z1 + r - minz) / CS));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) blocked[j * W + i] = 1;
  }
  const idx = (x, z) => Math.floor((z - minz) / CS) * W + Math.floor((x - minx) / CS);
  const s = idx(x0, z0), t = idx(x1, z1);
  blocked[s] = 0; blocked[t] = 0;
  const g = new Float32Array(W * D).fill(1e9), from = new Int32Array(W * D).fill(-1), open = [[0, s]]; g[s] = 0;
  const hz = (i) => Math.hypot((i % W) - (t % W), Math.floor(i / W) - Math.floor(t / W));
  let guard = 0;
  while (open.length && guard++ < 60000) {
    let bi = 0; for (let k = 1; k < open.length; k++) if (open[k][0] < open[bi][0]) bi = k;
    const [, cur] = open.splice(bi, 1)[0];
    if (cur === t) break;
    const cx = cur % W, cz = (cur / W) | 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz; if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
      const n = nz * W + nx; if (blocked[n]) continue;
      if (dx && dz && (blocked[cz * W + nx] || blocked[nz * W + cx])) continue;
      const ng = g[cur] + (dx && dz ? 1.414 : 1);
      if (ng < g[n]) { g[n] = ng; from[n] = cur; open.push([ng + hz(n), n]); }
    }
  }
  if (from[t] < 0 && s !== t) return null;
  const pts = []; for (let c = t; c !== -1 && c !== s; c = from[c]) pts.push([minx + ((c % W) + 0.5) * CS, minz + (((c / W) | 0) + 0.5) * CS]);
  pts.reverse();
  // string pulling: drop waypoints while a straight corridor stays free
  const free = (ax, az, bx, bz) => { const n = Math.ceil(Math.hypot(bx - ax, bz - az) / (CS * 0.5)); for (let k = 1; k < n; k++) { const f = k / n, c = idx(ax + (bx - ax) * f, az + (bz - az) * f); if (blocked[c]) return false; } return true; };
  const out = []; let ax = x0, az = z0, i = 0;
  while (i < pts.length) { let j = pts.length - 1; while (j > i && !free(ax, az, pts[j][0], pts[j][1])) j--; out.push(pts[j]); ax = pts[j][0]; az = pts[j][1]; i = j + 1; }
  return out;
}
