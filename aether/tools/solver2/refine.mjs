// CFD V3 P1: lattice Boltzmann with 2:1 nested grid refinement, CPU reference (docs/CFD-V3-PLAN.md §2.3).
// Cell-centred levels; level l has cell size 2^-l (level-0 units) and time step 2^-l (convective scaling, same lattice velocity on every level),
// so the physical viscosity fixes tau_l - 1/2 = 2^l (tau_0 - 1/2). Recursive time stepping: one step of level l = two steps of level l + 1.
//
// Interface methods (chosen by the P1 tests):
//   'V0'  volumetric, exactly mass and momentum conserving. The coarse post-collision state of the ring cells (active coarse cells touching the
//         fine box) is copied unchanged into their 2^d fine children (two ghost layers), which are only transported (no collision) during the two
//         fine sub-steps, so a coarse packet travels 2h exactly as on the coarse grid. Afterwards every ring-cell population whose coarse upstream cell
//         is inside the fine box or is itself a ring cell is replaced by the mean of its children (packets that left the fine box, plus packets
//         that cut a box corner). Where no fine path touched the box the mean equals the coarse value bit for bit.
//   'N0'  non-conservative, non-equilibrium rescaled (Dupuis & Chopard 2003 type): fine ghosts are rebuilt every sub-step from the parent ring cell's
//         moments (rho, u, Pi_neq; piecewise constant in space, linear in time) with f_neq,fine = tau_f / (2 tau_c) f_neq,coarse; coarse cells just
//         inside the box are rebuilt from the mean moments of their children with the inverse factor. Regularized (second-order Hermite) reconstruction.
//   'N1'  as N0 but second-order in space: the ghost moments are the parent's plus a first-order Taylor term (gradient from central differences of the
//         coarse moments, one-sided second-order where the neighbour is inside the box); linear in time. Needs 3 parent cells of margin around the box.
//         o.interpSpace = 2 adds the second-derivative terms (diagonal and mixed), o.interpTime = 2 interpolates quadratically through t - dt, t, t + dt.
//         o.neq = 'grad': the non-equilibrium stress given to ghosts (and to the coarse cells inside the box) is not interpolated from the populations
//         but rebuilt from the velocity gradient, Pi = -(2/3) rho tau_l S_l (Chapman-Enskog, lattice units of the receiving level). This drops the
//         non-hydrodynamic part of f_neq, which near tau = 1/2 alternates in sign every step and decays only as (1 - 1/tau)^n.
//   'N1C' N1 + refluxing (Berger & Colella 1989 style): per ring cell, the mass and momentum the coarse grid sent into / received from the box during
//         the coarse step are compared with what the fine grid actually received / sent through that cell's ghost children over its two sub-steps;
//         the summed difference is returned to the ring cells as w_q (d_rho + 3 c_q . d_j), which carries exactly that mass and momentum. Exactly conservative.
//         o.restrict = 3: the coarse cells inside the box get a third/fourth-order Lagrange interpolation of the fine moments to their centre instead of
//         the mean of their children (the mean is off by (h_f^2 / 8) lap u, a systematic smoothing that accumulates when the viscosity is low).
// Body force (o.force, level-0 lattice units; level l uses 2^-l of it): Guo et al. 2002 forcing, u = (j + F/2) / rho in the equilibrium (Pi_neq is
// taken around the unshifted velocity, an O(u F) difference that is negligible for the weak driving forces used here).
// Wall model (o.body.wallModel, CFD V3 P2): every fluid cell with a Bouzidi link gets a tangential slip velocity for its links, u_s = |u_t| - u_tau^2 y / nu_eff,
// so that the stress the scheme produces between the wall and the cell equals the wall-law stress rho u_tau^2. u_tau solves Reichardt's law
// u+ = ln(1 + 0.41 y+) / 0.41 + 7.8 (1 - e^(-y+/11) - (y+/11) e^(-y+/3)) at the cell's wall distance y with the cell's tangential speed (Newton);
// nu_eff = molecular + Smagorinsky viscosity of the cell. Moving-wall Bouzidi terms after Lallemand & Luo 2003. Needs o.body.normal(p) (unit, into the
// fluid) and o.body.dist(p) (distance from the cell centre to the wall, level-0 units).
// Test hooks: o.oracleGhost(p, t, m, tau, h) / o.oracleCg(p, t, m, tau, h) may overwrite the 10 moments (rho, u, Pi_neq in the receiving level's lattice
// units) given to fine ghosts / coarse cells inside the box; t in level-0 steps. Used only to locate interface errors against analytic solutions.
// Collision per level: 'bgk', 'trt' (magic 3/16) or 'reg' (regularized, optional Smagorinsky). Level 0 may have an inlet (moving-wall bounce-back,
// x = 0), an outlet (fixed density, non-equilibrium extrapolation, x = last) and an outlet absorbing layer; other axes periodic.
// One body (Bouzidi interpolated bounce-back + momentum exchange) on one level. Float64 throughout (method error, not precision, is under test).
export const LAT = {};
{
  const mk = (d, C) => {
    const W = C.map(c => { const s = Math.abs(c[0]) + Math.abs(c[1]) + Math.abs(c[2]); return d === 2 ? (s === 0 ? 4 / 9 : s === 1 ? 1 / 9 : 1 / 36) : (s === 0 ? 1 / 3 : s === 1 ? 1 / 18 : 1 / 36); });
    const OPP = C.map(c => C.findIndex(e => e[0] === -c[0] && e[1] === -c[1] && e[2] === -c[2]));
    return { d, Q: C.length, C, W, OPP };
  };
  LAT.D2Q9 = mk(2, [[0, 0, 0], [1, 0, 0], [0, 1, 0], [-1, 0, 0], [0, -1, 0], [1, 1, 0], [-1, 1, 0], [-1, -1, 0], [1, -1, 0]]);
  LAT.D3Q19 = mk(3, [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 1, 0], [-1, -1, 0], [1, -1, 0], [-1, 1, 0], [1, 0, 1], [-1, 0, -1], [1, 0, -1], [-1, 0, 1], [0, 1, 1], [0, -1, -1], [0, 1, -1], [0, -1, 1]]);
}
const INTERIOR = 0, INACTIVE = 1, GHOST = 2;

// o: { lattice, E: [ex, ey, ez] level-0 cells, inletOutlet: bool (x not periodic), boxes: [{ lo, hi }] child box of each level in its parent's cell coordinates,
//      tau0, model = 'reg', cs = 0, U = 0 (inlet velocity), sponge = { Lo, sigma } (level 0, outlet), method = 'V0' | 'N0', init(p) -> [rho, ux, uy, uz],
//      body = { level, solid(p), frac(p, c) -> fraction of the link from cell centre p along c (level-l lattice vector, level-0 units) to the surface } }
export function createRefined(o) {
  const lat = LAT[o.lattice], { d, Q, C, W, OPP } = lat, model = o.model || 'reg', method = o.method || 'V0', U = o.U || 0, io = !!o.inletOutlet, interpSpace = o.interpSpace || 1, interpTime = o.interpTime || 1, neqGrad = o.neq === 'grad', restrictOrder = o.restrict || 2;
  const cx = C.map(c => c[0]), cy = C.map(c => c[1]), cz = C.map(c => c[2]);
  const r = [2, 2, d === 3 ? 2 : 1]; // refinement factor per axis
  const levels = [];
  // ---------- level geometry ----------
  {
    const E = o.E.slice(); if (d === 2) E[2] = 1;
    levels.push({ l: 0, lo: [0, 0, 0], hi: E.slice(), ext: E.slice(), per: [!io, true, true], g: [0, 0, 0] });
    (o.boxes || []).forEach((b, i) => {
      const P = levels[i], lo = [0, 0, 0], hi = [0, 0, 0], per = [false, false, false], g = [0, 0, 0], ext = P.ext.map((e, a) => e * r[a]);
      for (let a = 0; a < 3; a++) {
        const blo = a < d ? b.lo[a] : 0, bhi = a < d ? b.hi[a] : 1;
        per[a] = P.per[a] && blo === P.lo[a] && bhi === P.hi[a] && P.hi[a] - P.lo[a] === P.ext[a];
        lo[a] = blo * r[a]; hi[a] = bhi * r[a]; g[a] = per[a] || a >= d ? 0 : 2;
        const mg = /^N1/.test(o.method || 'V0') ? 3 : 2; if (!per[a] && a < d && (blo - P.lo[a] < mg || P.hi[a] - bhi < mg)) throw Error(`level ${i + 1} box must be at least ${mg} parent cells inside level ${i} on axis ${a}`);
      }
      levels.push({ l: i + 1, lo, hi, ext, per, g, plo: b.lo.concat(d === 2 ? [0] : []).slice(0, 3), phi: b.hi.concat(d === 2 ? [1] : []).slice(0, 3) });
    });
  }
  const L0tau = o.tau0;
  for (const L of levels) {
    L.n = [0, 1, 2].map(a => L.hi[a] - L.lo[a] + 2 * L.g[a]); L.N = L.n[0] * L.n[1] * L.n[2];
    L.tau = .5 + 2 ** L.l * (L0tau - .5); L.vol = 2 ** (-d * L.l); L.h = 2 ** -L.l;
    L.f = new Float64Array(Q * L.N); L.post = new Float64Array(Q * L.N); L.mask = new Uint8Array(L.N); L.solid = new Uint8Array(L.N);
    L.child = null; L.parent = null; L.force = [0, 0, 0]; L.forceAcc = [0, 0, 0]; L.forceN = 0;
  }
  for (let i = 1; i < levels.length; i++) { levels[i].parent = levels[i - 1]; levels[i - 1].child = levels[i]; }
  // coordinates <-> index
  const idx = (L, x, y, z) => {
    const c = [x, y, z], n = L.n; let s = 0, m = 1;
    for (let a = 0; a < 3; a++) {
      let v = c[a] - (L.lo[a] - L.g[a]);
      if (L.per[a]) { v = ((v % n[a]) + n[a]) % n[a]; } else if (v < 0 || v >= n[a]) return -1;
      s += v * m; m *= n[a];
    }
    return s;
  };
  const coord = (L, n) => { const i = n % L.n[0], j = Math.floor(n / L.n[0]) % L.n[1], k = Math.floor(n / (L.n[0] * L.n[1])); return [i + L.lo[0] - L.g[0], j + L.lo[1] - L.g[1], k + L.lo[2] - L.g[2]]; };
  const centre = (L, c) => [(c[0] + .5) * L.h, (c[1] + .5) * L.h, d === 3 ? (c[2] + .5) * L.h : 0];
  for (const L of levels) {
    L.coord = new Int32Array(3 * L.N);
    for (let n = 0; n < L.N; n++) {
      const c = coord(L, n); L.coord.set(c, 3 * n);
      let inside = true; for (let a = 0; a < 3; a++) if (!L.per[a] && (c[a] < L.lo[a] || c[a] >= L.hi[a])) inside = false;
      L.mask[n] = inside ? INTERIOR : GHOST;
      const ch = L.child; if (ch && inside) { let cov = true; for (let a = 0; a < 3; a++) if (c[a] < ch.plo[a] || c[a] >= ch.phi[a]) cov = false; if (cov) L.mask[n] = INACTIVE; }
    }
    L.src = new Int32Array(Q * L.N).fill(-1);
    for (let n = 0; n < L.N; n++) { if (L.mask[n] === INACTIVE) continue; const x = L.coord[3 * n], y = L.coord[3 * n + 1], z = L.coord[3 * n + 2]; for (let q = 0; q < Q; q++) L.src[q * L.N + n] = idx(L, x - cx[q], y - cy[q], z - cz[q]); }
  }
  // ring cells (interior active cells with an inactive lattice neighbour) and their children; coarse "ghost" cells (inactive cells with an active neighbour)
  for (const L of levels) {
    if (!L.child) continue; const ch = L.child, ring = [], cg = [];
    for (let n = 0; n < L.N; n++) {
      const x = L.coord[3 * n], y = L.coord[3 * n + 1], z = L.coord[3 * n + 2];
      if (L.mask[n] === INTERIOR) { for (let q = 1; q < Q; q++) { const s = idx(L, x + cx[q], y + cy[q], z + cz[q]); if (s >= 0 && L.mask[s] === INACTIVE) { ring.push(n); break; } } }
      else if (L.mask[n] === INACTIVE) { for (let q = 1; q < Q; q++) { const s = idx(L, x + cx[q], y + cy[q], z + cz[q]); if (s >= 0 && L.mask[s] === INTERIOR) { cg.push(n); break; } } }
    }
    const kids = n => { const x = L.coord[3 * n], y = L.coord[3 * n + 1], z = L.coord[3 * n + 2], out = []; for (let k = 0; k < r[2]; k++) for (let j = 0; j < r[1]; j++) for (let i = 0; i < r[0]; i++) { const s = idx(ch, 2 * x + i, 2 * y + j, r[2] * z + k); if (s < 0) throw Error('missing child cell'); out.push(s); } return out; };
    L.ring = Int32Array.from(ring); L.ringKids = ring.map(kids); L.cg = Int32Array.from(cg); L.cgKids = cg.map(kids);
    L.isRing = new Uint8Array(L.N); for (const n of ring) L.isRing[n] = 1;
    // restriction stencils (o.restrict = 3): per coarse cell inside the box, fine interior cells and weights of a tensor-product Lagrange interpolation
    // to the coarse cell centre (offsets in fine cells: symmetric -1.5..1.5 cubic, else one-sided quadratic towards the box, else the 2-point mean)
    if (restrictOrder === 3) L.cgSten = cg.map(n => {
      const c = [L.coord[3 * n], L.coord[3 * n + 1], L.coord[3 * n + 2]], fineOk = f => { const s2 = idx(ch, f[0], f[1], f[2]); return s2 >= 0 && ch.mask[s2] === INTERIOR && !ch.solid[s2]; };
      const axes = [0, 1, 2].map(a => { if (a >= d) return [[r[2] * c[2], 1]]; const b = 2 * c[a], line = off => { const f = [2 * c[0], 2 * c[1], r[2] * c[2]]; f[a] = b + off; return fineOk(f); };
        if (line(-1) && line(2)) return [[b - 1, -1 / 16], [b, 9 / 16], [b + 1, 9 / 16], [b + 2, -1 / 16]];
        if (line(2)) return [[b, .375], [b + 1, .75], [b + 2, -.125]];
        if (line(-1)) return [[b - 1, -.125], [b, .75], [b + 1, .375]];
        return [[b, .5], [b + 1, .5]]; });
      const out = []; for (const [x, wx] of axes[0]) for (const [y, wy] of axes[1]) for (const [z, wz] of axes[2]) { const s2 = idx(ch, x, y, z); if (s2 < 0 || ch.mask[s2] !== INTERIOR) return null; out.push(s2, wx * wy * wz); }
      return out; });
    for (const ks of L.ringKids) for (const s of ks) if (ch.mask[s] !== GHOST) throw Error('ring child is not a ghost cell');
    // every ghost cell of the child must have a ring parent
    ch.ghostParent = new Int32Array(ch.N).fill(-1); ch.ghostRing = new Int32Array(ch.N).fill(-1); L.ringKids.forEach((ks, i) => { for (const s of ks) { ch.ghostParent[s] = ring[i]; ch.ghostRing[s] = i; } });
    // ghosts in the 3D box corners (offset on all three axes) have no D3Q19 path into the box and stay unused; every ghost an interior cell pulls from must have a parent
    for (let n2 = 0; n2 < ch.N; n2++) if (ch.mask[n2] === INTERIOR) for (let q = 0; q < Q; q++) { const s2 = ch.src[q * ch.N + n2]; if (s2 >= 0 && ch.mask[s2] === GHOST && ch.ghostParent[s2] < 0) throw Error('ghost cell without a ring parent'); }
    // V0 coalescence links: ring cell n, direction q, when the coarse upstream cell is inside the box or a ring cell
    const co = []; ring.forEach((n, i) => { for (let q = 1; q < Q; q++) { const s = L.src[q * L.N + n]; if (s >= 0 && (L.mask[s] === INACTIVE || L.isRing[s])) co.push(i, q); } });
    L.coal = Int32Array.from(co);
    if (method === 'N1C') {
      // coarse links of each ring cell into the box (out) and from the box (in): [ringIdx, q, sign]
      const cl = []; ring.forEach((n, i) => { const x = L.coord[3 * n], y = L.coord[3 * n + 1], z = L.coord[3 * n + 2]; for (let q = 1; q < Q; q++) { const dn = idx(L, x + cx[q], y + cy[q], z + cz[q]); if (dn >= 0 && L.mask[dn] === INACTIVE) cl.push(i, q, 1); const s2 = L.src[q * L.N + n]; if (s2 >= 0 && L.mask[s2] === INACTIVE) cl.push(i, q, -1); } });
      L.rcl = Int32Array.from(cl);
      // fine links between ghost children and interior fine cells: [ringIdx, q, from, sign] (+1 ghost -> interior, -1 interior -> ghost)
      const fl = [];
      for (let n2 = 0; n2 < ch.N; n2++) for (let q = 1; q < Q; q++) { const s2 = ch.src[q * ch.N + n2]; if (s2 < 0) continue;
        if (ch.mask[n2] === INTERIOR && ch.mask[s2] === GHOST) fl.push(ch.ghostRing[s2], q, s2, 1);
        else if (ch.mask[n2] === GHOST && ch.mask[s2] === INTERIOR) fl.push(ch.ghostRing[n2], q, s2, -1); }
      L.rfl = Int32Array.from(fl); L.rf = new Float64Array(4 * ring.length);
    }
    L.M0 = new Float64Array(10 * ring.length); L.M1 = new Float64Array(10 * ring.length);
    if (method === 'N1' || method === 'N1C') {
      L.MF0 = new Float64Array(10 * L.N); L.MF1 = new Float64Array(10 * L.N); L.MFm = new Float64Array(10 * L.N); L.hasMFm = false;
      // per ring cell and axis: [kind, n1, n2] (kind 0 central: n1 = +1, n2 = -1; 1 backward: n1 = -1, n2 = -2; 2 forward: n1 = +1, n2 = +2; 3 unused axis)
      L.sten = new Int32Array(9 * ring.length);
      // per ring cell and axis pair (xy, xz, yz): [kind, sa, sb, nA, nB, nAB, nC] kind 0 central (nA..nC = ++, +-, -+, --), 1 one-sided towards (sa, sb), 2 none
      L.mix = new Int32Array(21 * ring.length);
      const ok = s2 => s2 >= 0 && L.mask[s2] === INTERIOR;
      ring.forEach((n, i) => { const c = [L.coord[3 * n], L.coord[3 * n + 1], L.coord[3 * n + 2]], at = (da, db, ea, eb) => { const v = c.slice(); v[ea] += da; if (eb >= 0) v[eb] += db; return idx(L, v[0], v[1], v[2]); };
        for (let a = 0; a < 3; a++) { if (a >= d) { L.sten.set([3, -1, -1], 9 * i + 3 * a); continue; }
          const p1 = at(1, 0, a, -1), m1 = at(-1, 0, a, -1);
          if (ok(p1) && ok(m1)) L.sten.set([0, p1, m1], 9 * i + 3 * a);
          else if (!ok(p1) && ok(m1) && ok(at(-2, 0, a, -1))) L.sten.set([1, m1, at(-2, 0, a, -1)], 9 * i + 3 * a);
          else if (ok(p1) && !ok(m1) && ok(at(2, 0, a, -1))) L.sten.set([2, p1, at(2, 0, a, -1)], 9 * i + 3 * a);
          else throw Error('no gradient stencil for ring cell'); }
        [[0, 1], [0, 2], [1, 2]].forEach(([a, b], k) => { const o7 = 21 * i + 7 * k;
          if (a >= d || b >= d) { L.mix.set([2, 0, 0, -1, -1, -1, -1], o7); return; }
          const pp = at(1, 1, a, b), pm = at(1, -1, a, b), mp = at(-1, 1, a, b), mm = at(-1, -1, a, b);
          if ([pp, pm, mp, mm].every(ok)) { L.mix.set([0, 0, 0, pp, pm, mp, mm], o7); return; }
          for (const sa of [1, -1]) for (const sb of [1, -1]) { const nA = at(sa, 0, a, -1), nB = at(sb, 0, b, -1), nAB = at(sa, sb, a, b); if (ok(nA) && ok(nB) && ok(nAB)) { L.mix.set([1, sa, sb, nA, nB, nAB, -1], o7); return; } }
          L.mix.set([2, 0, 0, -1, -1, -1, -1], o7); });
      });
      // cells whose moments the reconstruction reads (ring cells and their stencils)
      const sc = new Set(ring); for (let t = 0; t < L.sten.length; t += 3) if (L.sten[t] !== 3) { sc.add(L.sten[t + 1]); sc.add(L.sten[t + 2]); }
      for (let t = 0; t < L.mix.length; t += 7) if (L.mix[t] !== 2) for (let u = 3; u < 7; u++) if (L.mix[t + u] >= 0) sc.add(L.mix[t + u]);
      L.stenCells = Int32Array.from(sc);
    }
  }
  // ---------- body ----------
  const B = o.body ? levels[o.body.level] : null;
  if (B) {
    for (let n = 0; n < B.N; n++) if (B.mask[n] === INTERIOR && o.body.solid(centre(B, B.coord.subarray(3 * n, 3 * n + 3)))) B.solid[n] = 1;
    const links = [];
    for (let n = 0; n < B.N; n++) {
      if (B.mask[n] !== INTERIOR || B.solid[n]) continue; const c = B.coord.subarray(3 * n, 3 * n + 3), p = centre(B, c);
      for (let q = 1; q < Q; q++) {
        const s = idx(B, c[0] + cx[q], c[1] + cy[q], c[2] + cz[q]); if (s < 0 || !B.solid[s]) continue;
        if (B.mask[s] !== INTERIOR) throw Error('body touches the edge of its level');
        const s2 = idx(B, c[0] - cx[q], c[1] - cy[q], c[2] - cz[q]), n2 = s2 >= 0 && B.mask[s2] === INTERIOR && !B.solid[s2] ? s2 : -1;
        links.push(n, q, n2); links.push(Math.round(1e6 * Math.min(1, Math.max(1e-6, o.body.frac(p, [cx[q] * B.h, cy[q] * B.h, cz[q] * B.h])))));
      }
    }
    B.links = Int32Array.from(links); B.nL = links.length / 4;
    if (o.body.wallModel) {
      const cells = [...new Set(Array.from({ length: B.nL }, (_, l) => B.links[4 * l]))]; B.bc = Int32Array.from(cells); B.bcIndex = new Int32Array(B.N).fill(-1); cells.forEach((n, i) => { B.bcIndex[n] = i; });
      B.bcN = new Float64Array(3 * cells.length); B.bcY = new Float64Array(cells.length); B.uw = new Float64Array(3 * cells.length); B.utau = new Float64Array(cells.length); B.tauEff = new Float64Array(B.N).fill(B.tau);
      cells.forEach((n, i) => { const p = centre(B, B.coord.subarray(3 * n, 3 * n + 3)), nv = o.body.normal(p), ln = Math.hypot(nv[0], nv[1], nv[2]) || 1; B.bcN.set([nv[0] / ln, nv[1] / ln, nv[2] / ln], 3 * i); B.bcY[i] = Math.max(1e-3, o.body.dist(p) / B.h); });
    }
  }
  // ---------- helpers ----------
  const feqInto = (out, rho, ux, uy, uz) => { const uu = 1.5 * (ux * ux + uy * uy + uz * uz); for (let q = 0; q < Q; q++) { const cu = cx[q] * ux + cy[q] * uy + cz[q] * uz; out[q] = W[q] * rho * (1 + 3 * cu + 4.5 * cu * cu - uu); } };
  const fe = new Float64Array(Q);
  // moments of f at cell n of level L into m[off..off+9]: rho, ux, uy, uz, Pi_neq xx yy zz xy xz yz
  const moments = (L, arr, n, m, off) => {
    const N = L.N; let rho = 0, jx = 0, jy = 0, jz = 0; for (let q = 0; q < Q; q++) { const v = arr[q * N + n]; rho += v; jx += v * cx[q]; jy += v * cy[q]; jz += v * cz[q]; }
    const ux = jx / rho, uy = jy / rho, uz = jz / rho; feqInto(fe, rho, ux, uy, uz);
    let xx = 0, yy = 0, zz = 0, xy = 0, xz = 0, yz = 0;
    for (let q = 0; q < Q; q++) { const v = arr[q * N + n] - fe[q]; xx += cx[q] * cx[q] * v; yy += cy[q] * cy[q] * v; zz += cz[q] * cz[q] * v; xy += cx[q] * cy[q] * v; xz += cx[q] * cz[q] * v; yz += cy[q] * cz[q] * v; }
    m[off] = rho; m[off + 1] = ux; m[off + 2] = uy; m[off + 3] = uz; m[off + 4] = xx; m[off + 5] = yy; m[off + 6] = zz; m[off + 7] = xy; m[off + 8] = xz; m[off + 9] = yz;
  };
  // post-collision populations from moments: feq + k * f_neq(Pi) (regularized), written to arr at cell n
  const fromMoments = (L, arr, n, m, off, k) => {
    feqInto(fe, m[off], m[off + 1], m[off + 2], m[off + 3]); const N = L.N, xx = m[off + 4], yy = m[off + 5], zz = m[off + 6], xy = m[off + 7], xz = m[off + 8], yz = m[off + 9], tr = (xx + yy + zz) / 3;
    for (let q = 0; q < Q; q++) { const qp = cx[q] * cx[q] * xx + cy[q] * cy[q] * yy + cz[q] * cz[q] * zz + 2 * (cx[q] * cy[q] * xy + cx[q] * cz[q] * xz + cy[q] * cz[q] * yz) - tr; arr[q * N + n] = fe[q] + k * 4.5 * W[q] * qp; }
  };
  // Chapman-Enskog stress into m[4..9]: Pi = -(2/3) rho tau (S * scale), S = (G + G^T) / 2 with G[3 a + b] = d u_b / d x_a in the source lattice units,
  // scale converts the gradient to the receiving level's lattice units (1/2 coarse -> fine, 2 fine -> coarse)
  const stressFromGrad = (m, G, scale, tau) => { const k0 = -2 / 3 * m[0] * tau * scale;
    m[4] = k0 * G[0]; m[5] = k0 * G[4]; m[6] = k0 * G[8]; m[7] = k0 * .5 * (G[1] + G[3]); m[8] = k0 * .5 * (G[2] + G[6]); m[9] = k0 * .5 * (G[5] + G[7]); };
  // Guo forcing term added to post-collision populations: k w_q [3 (c - u) . F + 9 (c . u)(c . F)], k = 1 - 1 / (2 tau)
  const guo = (post, N, n, ux, uy, uz, Fx, Fy, Fz, k) => { for (let q = 0; q < Q; q++) { const cF = cx[q] * Fx + cy[q] * Fy + cz[q] * Fz, cu = cx[q] * ux + cy[q] * uy + cz[q] * uz; post[q * N + n] += k * W[q] * (3 * (cF - (ux * Fx + uy * Fy + uz * Fz)) + 9 * cu * cF); } };
  // Reichardt's wall law and its derivative in y+
  const reich = yp => Math.log(1 + .41 * yp) / .41 + 7.8 * (1 - Math.exp(-yp / 11) - yp / 11 * Math.exp(-yp / 3));
  const reichD = yp => 1 / (1 + .41 * yp) + 7.8 * (Math.exp(-yp / 11) / 11 - Math.exp(-yp / 3) / 11 + yp / 33 * Math.exp(-yp / 3));
  // u_tau from the tangential speed ut at wall distance y (lattice units), molecular viscosity nu: Newton on ut_ = u_tau * u+(y u_tau / nu)
  const solveUtau = (ut, y, nu) => { if (!(ut > 0)) return 0; let u = Math.sqrt(nu * ut / y); for (let i = 0; i < 30; i++) { const yp = y * u / nu, g = u * reich(yp) - ut, dg = reich(yp) + yp * reichD(yp); const un = Math.max(u - g / dg, .1 * u); if (Math.abs(un - u) < 1e-12 * u) { u = un; break; } u = un; } return u; };
  // ---------- per-level operations ----------
  const sig0 = new Float64Array(levels[0].n[0]); if (o.sponge && o.sponge.Lo > 0) { const nx = levels[0].n[0], Lo = o.sponge.Lo; for (let i = nx - Lo; i < nx; i++) sig0[i] = o.sponge.sigma * ((i - (nx - Lo) + 1) / Lo) ** 2; }
  const eqT = new Float64Array(Q); feqInto(eqT, 1, U, 0, 0); const eqTc = eqT.slice();
  const PAIRS = []; for (let q = 1; q < Q; q++) if (OPP[q] > q) PAIRS.push(q, OPP[q]);
  const les = (o.cs || 0) ** 2 * 18 * Math.SQRT2, F0 = o.force || null;
  function collide(L) {
    const { N, f, post, mask, solid, tau } = L, wp = 1 / tau, wm = 1 / (3 / 16 / (tau - .5) + .5), m = new Float64Array(10), fs = 2 ** -L.l;
    const Fx = F0 ? F0[0] * fs : 0, Fy = F0 ? F0[1] * fs : 0, Fz = F0 ? F0[2] * fs : 0, te = L.tauEff;
    for (let n = 0; n < N; n++) {
      if (mask[n] === GHOST) { for (let q = 0; q < Q; q++) post[q * N + n] = f[q * N + n]; continue; } // ghosts only transport (V0 second sub-step); N* overwrite them
      if (mask[n] !== INTERIOR || solid[n]) continue;
      if (model === 'reg' && !F0) { // fast path: Pi_neq = sum c c f - rho (I/3 + u u) (exact for the second-order equilibrium on D2Q9 / D3Q19)
        let rho = 0, jx = 0, jy = 0, jz = 0, pxx = 0, pyy = 0, pzz = 0, pxy = 0, pxz = 0, pyz = 0;
        for (let q = 0; q < Q; q++) { const v = f[q * N + n], a = cx[q], b = cy[q], c = cz[q]; rho += v; jx += v * a; jy += v * b; jz += v * c; pxx += v * a * a; pyy += v * b * b; pzz += v * c * c; pxy += v * a * b; pxz += v * a * c; pyz += v * b * c; }
        const ux = jx / rho, uy = jy / rho, uz = jz / rho, r3 = rho / 3;
        pxx -= r3 + rho * ux * ux; pyy -= r3 + rho * uy * uy; pzz -= (d === 3 ? r3 : 0) + rho * uz * uz; pxy -= rho * ux * uy; pxz -= rho * ux * uz; pyz -= rho * uy * uz;
        let t = tau; if (les > 0) { const pn = Math.sqrt(pxx * pxx + pyy * pyy + pzz * pzz + 2 * (pxy * pxy + pxz * pxz + pyz * pyz)); t = .5 * (tau + Math.sqrt(tau * tau + les * pn / rho)); }
        if (te) te[n] = t;
        const k = 4.5 * (1 - 1 / t), tr = (pxx + pyy + pzz) / 3, uu = 1.5 * (ux * ux + uy * uy + uz * uz);
        for (let q = 0; q < Q; q++) { const a = cx[q], b = cy[q], c = cz[q], cu = a * ux + b * uy + c * uz, w = W[q];
          post[q * N + n] = w * rho * (1 + 3 * cu + 4.5 * cu * cu - uu) + k * w * (a * a * pxx + b * b * pyy + c * c * pzz + 2 * (a * b * pxy + a * c * pxz + b * c * pyz) - tr); }
      } else if (model === 'reg') {
        moments(L, f, n, m, 0); let t = tau;
        if (les > 0) { const pn = Math.sqrt(m[4] * m[4] + m[5] * m[5] + m[6] * m[6] + 2 * (m[7] * m[7] + m[8] * m[8] + m[9] * m[9])); t = .5 * (tau + Math.sqrt(tau * tau + les * pn / m[0])); }
        if (te) te[n] = t;
        if (F0) { m[1] += .5 * Fx / m[0]; m[2] += .5 * Fy / m[0]; m[3] += .5 * Fz / m[0]; }
        fromMoments(L, post, n, m, 0, 1 - 1 / t);
        if (F0) { guo(post, N, n, m[1], m[2], m[3], Fx, Fy, Fz, 1 - .5 / t);
          // the regularized projection drops the first-order part of f - f_eq(u), whose momentum is -F/2; keep it (relaxed like the rest), else the
          // momentum gain per step is F (3/2 - 1/(2 tau)) instead of F
          const k1 = -1.5 * (1 - 1 / t); for (let q = 0; q < Q; q++) post[q * N + n] += k1 * W[q] * (cx[q] * Fx + cy[q] * Fy + cz[q] * Fz); }
      } else {
        let rho = 0, jx = 0, jy = 0, jz = 0; for (let q = 0; q < Q; q++) { const v = f[q * N + n]; rho += v; jx += v * cx[q]; jy += v * cy[q]; jz += v * cz[q]; }
        if (te) te[n] = tau;
        if (F0) { jx += .5 * Fx; jy += .5 * Fy; jz += .5 * Fz; }
        feqInto(fe, rho, jx / rho, jy / rho, jz / rho);
        if (model === 'bgk') { for (let q = 0; q < Q; q++) post[q * N + n] = f[q * N + n] - wp * (f[q * N + n] - fe[q]); if (F0) guo(post, N, n, jx / rho, jy / rho, jz / rho, Fx, Fy, Fz, 1 - .5 * wp); }
        else { post[n] = f[n] - wp * (f[n] - fe[0]); for (let p = 0; p < PAIRS.length; p += 2) { const a = PAIRS[p], b = PAIRS[p + 1], fa = f[a * N + n], fb = f[b * N + n], dp = wp * (.5 * (fa + fb) - .5 * (fe[a] + fe[b])), dm = wm * (.5 * (fa - fb) - .5 * (fe[a] - fe[b])); post[a * N + n] = fa - dp - dm; post[b * N + n] = fb - dp + dm; } }
      }
      if (L.l === 0 && sig0[L.coord[3 * n]] > 0) { const s = sig0[L.coord[3 * n]]; for (let q = 0; q < Q; q++) post[q * N + n] += s * (eqTc[q] - post[q * N + n]); }
    }
  }
  function stream(L, uin) {
    const { N, f, post, src } = L;
    for (let q = 0; q < Q; q++) { const b = q * N; for (let n = 0; n < N; n++) { const s = src[b + n]; if (s >= 0) f[b + n] = post[b + s]; } } // src is -1 for inactive cells
    if (L.l === 0 && io) for (let q = 1; q < Q; q++) { if (!(cx[q] > 0)) continue; const b = q * N, ob = OPP[q] * N, k = 6 * W[q] * cx[q] * uin; for (let n = 0; n < N; n += L.n[0]) f[b + n] = post[ob + n] + k; } // inlet (x = 0): moving-wall bounce-back
    if (L.l === 0 && io) { // outlet: fixed density, non-equilibrium extrapolation from the previous plane
      const nx = L.n[0];
      for (let n = 0; n < N; n++) {
        if (L.coord[3 * n] !== nx - 1) continue; const p = n - 1; let rho = 0, jx = 0, jy = 0, jz = 0;
        for (let q = 0; q < Q; q++) { const v = f[q * N + p]; rho += v; jx += v * cx[q]; jy += v * cy[q]; jz += v * cz[q]; }
        const ux = jx / rho, uy = jy / rho, uz = jz / rho, uu = 1.5 * (ux * ux + uy * uy + uz * uz);
        for (let q = 1; q < Q; q++) if (cx[q] < 0) { const cu = cx[q] * ux + cy[q] * uy + cz[q] * uz, e = cu * (3 + 4.5 * cu) - uu; f[q * N + n] = W[q] * (1 + e) + (f[q * N + p] - W[q] * rho * (1 + e)); }
      }
    }
    if (L === B && B.bc) { // wall model: slip velocity per boundary cell from the post-collision state
      const nu = (B.tau - .5) / 3, bc = B.bc;
      for (let i = 0; i < bc.length; i++) { const n = bc[i]; let rho = 0, jx = 0, jy = 0, jz = 0; for (let q = 0; q < Q; q++) { const v = post[q * N + n]; rho += v; jx += v * cx[q]; jy += v * cy[q]; jz += v * cz[q]; }
        const ux = jx / rho, uy = jy / rho, uz = jz / rho, nx = B.bcN[3 * i], ny = B.bcN[3 * i + 1], nz = B.bcN[3 * i + 2], un = ux * nx + uy * ny + uz * nz, tx = ux - un * nx, ty = uy - un * ny, tz = uz - un * nz, ut = Math.hypot(tx, ty, tz), y = B.bcY[i];
        const utau = solveUtau(ut, y, nu), nuE = Math.max(nu, (B.tauEff[n] - .5) / 3), us = ut > 0 ? Math.min(ut, Math.max(0, ut - utau * utau * y / nuE)) : 0, k = ut > 0 ? us / ut : 0;
        B.utau[i] = utau; B.uw[3 * i] = k * tx; B.uw[3 * i + 1] = k * ty; B.uw[3 * i + 2] = k * tz; }
    }
    if (L === B) { // Bouzidi interpolated bounce-back + momentum exchange (moving-wall terms when the wall model is on)
      const { links, nL } = B; let fx = 0, fy = 0, fz = 0;
      for (let l = 0; l < nL; l++) {
        const n = links[4 * l], q = links[4 * l + 1], n2 = links[4 * l + 2], qq = links[4 * l + 3] * 1e-6, oq = OPP[q], pq = post[q * N + n]; let v;
        if (qq < .5 && n2 >= 0) v = 2 * qq * pq + (1 - 2 * qq) * post[q * N + n2]; else if (qq >= .5) v = pq / (2 * qq) + (2 * qq - 1) / (2 * qq) * post[oq * N + n]; else v = pq;
        if (B.bc) { const i = B.bcIndex[n], cw = cx[oq] * B.uw[3 * i] + cy[oq] * B.uw[3 * i + 1] + cz[oq] * B.uw[3 * i + 2]; v += (qq >= .5 ? 1 / (2 * qq) : 1) * 6 * W[oq] * cw; }
        f[oq * N + n] = v; const mm = pq + v; fx += cx[q] * mm; fy += cy[q] * mm; fz += cz[q] * mm;
      }
      B.force = [fx, fy, fz]; B.forceAcc[0] += fx; B.forceAcc[1] += fy; B.forceAcc[2] += fz; B.forceN++;
    }
  }
  // ---------- interface ----------
  function fillGhosts(L, k) { // L: child level, before its stream
    const P = L.parent, N = L.N, PN = P.N;
    if (method === 'V0') { if (k !== 0) return; for (let s = 0; s < N; s++) { const pn = L.ghostParent[s]; if (pn < 0) continue; for (let q = 0; q < Q; q++) L.post[q * N + s] = P.post[q * PN + pn]; } return; }
    if (method === 'N1' || method === 'N1C') {
      const kf = (1 - 1 / L.tau) * L.tau / (2 * P.tau), m = new Float64Array(10), t1 = new Float64Array(10), sten = P.sten, mix = P.mix, quad = interpSpace === 2;
      // Taylor reconstruction of the 10 moments of ring cell i at offset off (coarse units): first derivatives, and with interpSpace 2 also second derivatives
      const recon = (MF, i, pn, off, out) => {
        for (let j = 0; j < 10; j++) out[j] = MF[10 * pn + j];
        for (let a = 0; a < 3; a++) { const k0 = sten[9 * i + 3 * a], n1 = sten[9 * i + 3 * a + 1], n2 = sten[9 * i + 3 * a + 2]; if (k0 === 3) continue; const oa = off[a];
          for (let j = 0; j < 10; j++) { const v0 = MF[10 * pn + j], v1 = MF[10 * n1 + j], v2 = MF[10 * n2 + j];
            const g = k0 === 0 ? .5 * (v1 - v2) : k0 === 1 ? 1.5 * v0 - 2 * v1 + .5 * v2 : -1.5 * v0 + 2 * v1 - .5 * v2;
            out[j] += oa * g; if (quad) out[j] += .5 * oa * oa * (k0 === 0 ? v1 - 2 * v0 + v2 : v0 - 2 * v1 + v2); } }
        if (quad) for (let k = 0; k < 3; k++) { const o7 = 21 * i + 7 * k, kind = mix[o7]; if (kind === 2) continue; const a = k === 2 ? 1 : 0, b = k === 0 ? 1 : 2, oab = off[a] * off[b];
          for (let j = 0; j < 10; j++) { let h; const v0 = MF[10 * pn + j];
            if (kind === 0) h = .25 * (MF[10 * mix[o7 + 3] + j] - MF[10 * mix[o7 + 4] + j] - MF[10 * mix[o7 + 5] + j] + MF[10 * mix[o7 + 6] + j]);
            else h = mix[o7 + 1] * mix[o7 + 2] * (MF[10 * mix[o7 + 5] + j] - MF[10 * mix[o7 + 3] + j] - MF[10 * mix[o7 + 4] + j] + v0);
            out[j] += oab * h; } }
      };
      const off = [0, 0, 0], G0 = new Float64Array(9), G1 = new Float64Array(9);
      // velocity gradient (coarse lattice units) at ring cell i: G[3 a + b] = d u_b / d x_a
      const gradU = (MF, i, pn, G) => { G.fill(0); for (let a = 0; a < 3; a++) { const k0 = sten[9 * i + 3 * a], n1 = sten[9 * i + 3 * a + 1], n2 = sten[9 * i + 3 * a + 2]; if (k0 === 3) continue;
        for (let b = 0; b < 3; b++) { const j = 1 + b, v0 = MF[10 * pn + j], v1 = MF[10 * n1 + j], v2 = MF[10 * n2 + j]; G[3 * a + b] = k0 === 0 ? .5 * (v1 - v2) : k0 === 1 ? 1.5 * v0 - 2 * v1 + .5 * v2 : -1.5 * v0 + 2 * v1 - .5 * v2; } } };
      for (let s = 0; s < N; s++) { const i = L.ghostRing[s]; if (i < 0) continue; const pn = L.ghostParent[s];
        for (let a = 0; a < 3; a++) off[a] = a < d ? (L.coord[3 * s + a] - 2 * P.coord[3 * pn + a]) / 2 - .25 : 0;
        recon(P.MF0, i, pn, off, m);
        if (k === 1) { recon(P.MF1, i, pn, off, t1);
          if (interpTime === 2 && P.hasMFm) { const tm = new Float64Array(10); recon(P.MFm, i, pn, off, tm); for (let j = 0; j < 10; j++) m[j] = -.125 * tm[j] + .75 * m[j] + .375 * t1[j]; } // quadratic through t - 1, t, t + 1 at t + 1/2
          else for (let j = 0; j < 10; j++) m[j] = .5 * (m[j] + t1[j]); }
        if (neqGrad) { gradU(P.MF0, i, pn, G0); if (k === 1) { gradU(P.MF1, i, pn, G1); for (let j = 0; j < 9; j++) G0[j] = .5 * (G0[j] + G1[j]); } stressFromGrad(m, G0, .5, L.tau); }
        else for (let j = 4; j < 10; j++) m[j] *= kf / (1 - 1 / L.tau); // Pi_neq in the fine level's units (tau_f / (2 tau_c))
        if (o.oracleGhost) o.oracleGhost(centre(L, L.coord.subarray(3 * s, 3 * s + 3)), st.step + k / 2, m, L.tau, L.h);
        fromMoments(L, L.post, s, m, 0, 1 - 1 / L.tau); }
      return;
    }
    // N0: moments of the ring parent at time t + k/2 (linear in time), non-equilibrium rescaled to the fine level
    const kf = (1 - 1 / L.tau) * L.tau / (2 * P.tau), m = new Float64Array(10);
    for (let s = 0; s < N; s++) { const i = L.ghostRing[s]; if (i < 0) continue; for (let a = 0; a < 10; a++) m[a] = k === 0 ? P.M0[10 * i + a] : .5 * (P.M0[10 * i + a] + P.M1[10 * i + a]); fromMoments(L, L.post, s, m, 0, kf); }
  }
  function restrictN0(P) { // coarse cells just inside the box <- mean moments of their children (time t), inverse rescale
    const ch = P.child, kc = (1 - 1 / P.tau) * 2 * P.tau / ch.tau, m = new Float64Array(10), acc = new Float64Array(10), G = new Float64Array(9);
    P.cg.forEach((n, i) => { acc.fill(0); G.fill(0); const ks = P.cgKids[i], sten = P.cgSten && P.cgSten[i];
      if (sten) { for (let t = 0; t < sten.length; t += 2) { moments(ch, ch.f, sten[t], m, 0); for (let a = 0; a < 4; a++) acc[a] += sten[t + 1] * m[a]; }
        for (const s2 of ks) { moments(ch, ch.f, s2, m, 0); for (let a = 4; a < 10; a++) acc[a] += m[a] / ks.length; }
        for (let a = 4; a < 10; a++) acc[a] *= kc / (1 - 1 / P.tau); // Pi_neq in the coarse level's units (2 tau_c / tau_f)
        if (o.oracleCg) o.oracleCg(centre(P, P.coord.subarray(3 * n, 3 * n + 3)), st.step, acc, P.tau, P.h);
        fromMoments(P, P.post, n, acc, 0, 1 - 1 / P.tau); return; }
      ks.forEach((s, c) => { moments(ch, ch.f, s, m, 0); for (let a = 0; a < 10; a++) acc[a] += m[a];
        if (neqGrad) for (let a = 0; a < d; a++) { const sg = ((c >> a) & 1) ? 1 : -1; for (let b = 0; b < 3; b++) G[3 * a + b] += sg * m[1 + b]; } }); // children ordered x fastest: bit a of c = offset along a
      for (let a = 0; a < 10; a++) acc[a] /= ks.length;
      if (neqGrad) { for (let j = 0; j < 9; j++) G[j] /= ks.length / 2; stressFromGrad(acc, G, 2, P.tau); }
      else for (let a = 4; a < 10; a++) acc[a] *= kc / (1 - 1 / P.tau);
      if (o.oracleCg) o.oracleCg(centre(P, P.coord.subarray(3 * n, 3 * n + 3)), st.step, acc, P.tau, P.h);
      fromMoments(P, P.post, n, acc, 0, 1 - 1 / P.tau); });
  }
  // refluxing (N1C). rf[4 i ..] accumulates, per ring cell, (sent by coarse - received by fine) of mass and momentum, in coarse-cell density units
  function refluxCoarse(P) { // after the coarse stream: post of the ring cell went into the box (+), f pulled from the box came out (-)
    const N = P.N, cl = P.rcl, rf = P.rf;
    for (let t = 0; t < cl.length; t += 3) { const i = cl[t], q = cl[t + 1], sg = cl[t + 2], n = P.ring[i], v = sg > 0 ? P.post[q * N + n] : -P.f[q * N + n]; rf[4 * i] += v; rf[4 * i + 1] += v * cx[q]; rf[4 * i + 2] += v * cy[q]; rf[4 * i + 3] += v * cz[q]; }
  }
  function refluxFine(L) { // before each fine stream: packets crossing between ghost children and the box, weighted by the fine/coarse volume ratio
    const P = L.parent, N = L.N, fl = P.rfl, rf = P.rf, wv = 2 ** -d;
    for (let t = 0; t < fl.length; t += 4) { const i = fl[t], q = fl[t + 1], from = fl[t + 2], v = -fl[t + 3] * wv * L.post[q * N + from]; rf[4 * i] += v; rf[4 * i + 1] += v * cx[q]; rf[4 * i + 2] += v * cy[q]; rf[4 * i + 3] += v * cz[q]; }
  }
  // The per-cell balance is not local at box corners (a fine diagonal path through a ghost child of one ring cell corresponds to a coarse link of a
  // neighbouring ring cell), so the summed imbalance of the whole interface is returned, shared equally by its ring cells.
  function refluxApply(P) { const N = P.N, rf = P.rf, nr = P.ring.length; let dm = 0, jx = 0, jy = 0, jz = 0; for (let i = 0; i < nr; i++) { dm += rf[4 * i]; jx += rf[4 * i + 1]; jy += rf[4 * i + 2]; jz += rf[4 * i + 3]; }
    dm /= nr; jx /= nr; jy /= nr; jz /= nr; P.reflux = [dm, jx, jy, jz]; for (const n of P.ring) for (let q = 0; q < Q; q++) P.f[q * N + n] += W[q] * (dm + 3 * (cx[q] * jx + cy[q] * jy + cz[q] * jz)); }
  function ringMoments(P, M) { P.ring.forEach((n, i) => moments(P, P.f, n, M, 10 * i)); }
  function fieldMoments(P, MF) { for (const n of P.stenCells) moments(P, P.f, n, MF, 10 * n); }
  function coalesceV0(P) {
    const ch = P.child, N = P.N, CN = ch.N, co = P.coal;
    for (let t = 0; t < co.length; t += 2) { const i = co[t], q = co[t + 1], ks = P.ringKids[i]; let s = 0; for (const c of ks) s += ch.f[q * CN + c]; P.f[q * N + P.ring[i]] = s / ks.length; }
  }
  function advance(L, k) {
    if (L.child && method === 'N0') { restrictN0(L); ringMoments(L, L.M0); }
    if (L.child && (method === 'N1' || method === 'N1C')) { restrictN0(L); if (L.stepped) { const t = L.MFm; L.MFm = L.MF0; L.MF0 = t; L.hasMFm = true; } /* MFm <- moments at t - dt */ fieldMoments(L, L.MF0); L.stepped = true; }
    if (L.child && method === 'N1C') L.rf.fill(0);
    collide(L);
    if (L.parent) fillGhosts(L, k);
    if (L.parent && method === 'N1C') refluxFine(L);
    stream(L, U * st.ramp);
    if (L.child) {
      if (method === 'N0') ringMoments(L, L.M1);
      if (method === 'N1' || method === 'N1C') fieldMoments(L, L.MF1);
      if (method === 'N1C') refluxCoarse(L);
      advance(L.child, 0); advance(L.child, 1);
      if (method === 'V0') coalesceV0(L);
      if (method === 'N1C') refluxApply(L);
    }
  }
  // ---------- initial state ----------
  // o.initNeq: add the Navier-Stokes non-equilibrium part, Pi = -rho tau_l / 3 * h_l * (grad u + grad u^T) (velocity gradient of o.init by central differences)
  const im = new Float64Array(10);
  for (const L of levels) for (let n = 0; n < L.N; n++) {
    if (L.mask[n] === INACTIVE) continue; const p = centre(L, L.coord.subarray(3 * n, 3 * n + 3)), [rho, ux, uy, uz] = L.solid[n] ? [1, 0, 0, 0] : (o.init ? o.init(p) : [1, U, 0, 0]);
    im.fill(0); im[0] = rho; im[1] = ux; im[2] = uy; im[3] = uz;
    if (o.initNeq && o.init && !L.solid[n]) {
      const e = 1e-4, g = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (let a = 0; a < d; a++) { const pp = p.slice(), pm = p.slice(); pp[a] += e; pm[a] -= e; const up = o.init(pp), um = o.init(pm); for (let b = 0; b < 3; b++) g[a][b] = (up[1 + b] - um[1 + b]) / (2 * e) * L.h; }
      const k0 = -rho * L.tau / 3; im[4] = k0 * 2 * g[0][0]; im[5] = k0 * 2 * g[1][1]; im[6] = k0 * 2 * g[2][2]; im[7] = k0 * (g[0][1] + g[1][0]); im[8] = k0 * (g[0][2] + g[2][0]); im[9] = k0 * (g[1][2] + g[2][1]);
    }
    fromMoments(L, L.f, n, im, 0, 1); for (let q = 0; q < Q; q++) L.post[q * L.N + n] = L.f[q * L.N + n];
  }
  for (const L of levels) if (L.child) { for (const n of L.cg) { const p = centre(L, L.coord.subarray(3 * n, 3 * n + 3)), [rho, ux, uy, uz] = o.init ? o.init(p) : [1, U, 0, 0]; feqInto(fe, rho, ux, uy, uz); for (let q = 0; q < Q; q++) L.post[q * L.N + n] = fe[q]; } }
  const st = { levels, lat, method, model, step: 0, ramp: 1 };
  st.advance = (n = 1) => { for (let s = 0; s < n; s++) { if (B) { B.forceAcc = [0, 0, 0]; B.forceN = 0; } advance(levels[0], 0); st.step++; } };
  // force averaged over the body level's sub-steps of the last coarse step, in the body level's lattice units
  Object.defineProperty(st, 'force', { get() { return B ? B.forceAcc.map(v => v / B.forceN) : [0, 0, 0]; } });
  st.mass = () => { let m = 0; for (const L of levels) for (let n = 0; n < L.N; n++) { if (L.mask[n] !== INTERIOR || L.solid[n]) continue; let r0 = 0; for (let q = 0; q < Q; q++) r0 += L.f[q * L.N + n]; m += r0 * L.vol; } return m; };
  // visit every active interior fluid cell: cb(p, rho, ux, uy, uz, vol, level)
  st.forEachCell = cb => { for (const L of levels) for (let n = 0; n < L.N; n++) { if (L.mask[n] !== INTERIOR || L.solid[n]) continue; let rho = 0, jx = 0, jy = 0, jz = 0; for (let q = 0; q < Q; q++) { const v = L.f[q * L.N + n]; rho += v; jx += v * cx[q]; jy += v * cy[q]; jz += v * cz[q]; } cb(centre(L, L.coord.subarray(3 * n, 3 * n + 3)), rho, jx / rho, jy / rho, jz / rho, L.vol, L.l); } };
  st.cells = () => levels.map(L => { let a = 0; for (let n = 0; n < L.N; n++) if (L.mask[n] === INTERIOR) a++; return a; });
  st.taus = () => levels.map(L => L.tau);
  st.wall = () => B && B.bc ? { cells: B.bc.length, utauMean: B.utau.reduce((a, b) => a + b, 0) / B.bc.length } : null;
  return st;
}
