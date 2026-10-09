// Solver V2 prototype B: 2D incompressible projection method on a staggered (MAC) grid, CPU reference implementation for the S0 method comparison.
// Momentum: conservative convection with QUICK (3rd-order upwind) face values, diffusion implicit (Gauss-Seidel sweeps), pressure-free predictor + projection.
// Pressure: Poisson with Neumann at inlet and walls, Dirichlet p = 0 at the outlet face; PCG with an incomplete-Cholesky IC(0) preconditioner, warm started.
// Body: direct-forcing immersed boundary with linear interpolation along grid lines (Fadlun et al. 2000): a fluid velocity node next to the body is set from the
// boundary (zero) and the next fluid node using the true distance to the wall; nodes inside the body are zero. Force: momentum balance on a control box.
export function createProj2D({ nx, ny, h, nu, inside, wallDist, inletU }) {
  const U = new Float64Array((nx + 1) * ny), V = new Float64Array(nx * (ny + 1)), P = new Float64Array(nx * ny);
  const Us = new Float64Array(U.length), Vs = new Float64Array(V.length);
  const iu = (i, j) => i + (nx + 1) * j, iv = (i, j) => i + nx * (j + 0), ip = (i, j) => i + nx * j;
  // node positions and solid masks
  const uPos = (i, j) => [i * h, (j + .5) * h], vPos = (i, j) => [(i + .5) * h, j * h];
  const uSolid = new Uint8Array(U.length), vSolid = new Uint8Array(V.length);
  for (let j = 0; j < ny; j++) for (let i = 0; i <= nx; i++) uSolid[iu(i, j)] = inside(...uPos(i, j)) ? 1 : 0;
  for (let j = 0; j <= ny; j++) for (let i = 0; i < nx; i++) vSolid[iv(i, j)] = inside(...vPos(i, j)) ? 1 : 0;
  // forcing points: [index, far index, weight] with value = weight * value(far)
  const force = (pos, solidAt, idx, ni, nj, imax, jmax) => {
    const list = [];
    for (let j = 0; j < nj; j++) for (let i = 0; i < ni; i++) {
      const n = idx(i, j); if (solidAt[n]) continue; let best = null;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, b = j + dj; if (a < 0 || b < 0 || a > imax || b > jmax || !solidAt[idx(a, b)]) continue;
        const d = wallDist(...pos(i, j), di, dj); if (best === null || d < best.d) best = { d, di, dj };
      }
      if (!best) continue;
      const a = i - best.di, b = j - best.dj; const far = (a < 0 || b < 0 || a > imax || b > jmax || solidAt[idx(a, b)]) ? -1 : idx(a, b);
      list.push([n, far, far < 0 ? 0 : best.d / (best.d + h)]);
    }
    return list;
  };
  const uF = force(uPos, uSolid, iu, nx + 1, ny, nx, ny - 1), vF = force(vPos, vSolid, iv, nx, ny + 1, nx - 1, ny);
  const uForced = new Uint8Array(U.length), vForced = new Uint8Array(V.length); for (const [n] of uF) uForced[n] = 1; for (const [n] of vF) vForced[n] = 1;
  const applyIBM = (A, solidAt, F) => { for (let n = 0; n < A.length; n++) if (solidAt[n]) A[n] = 0; for (const [n, far, w] of F) A[n] = far < 0 ? 0 : w * A[far]; };
  // initial state: inflow profile everywhere
  for (let j = 0; j < ny; j++) for (let i = 0; i <= nx; i++) U[iu(i, j)] = inletU((j + .5) * h);
  applyIBM(U, uSolid, uF); applyIBM(V, vSolid, vF);
  // ghost-aware accessors
  const gu = (A, i, j) => { if (i < 0) i = 0; if (i > nx) i = nx; if (j < 0) return -gu(A, i, -1 - j); if (j >= ny) return -gu(A, i, 2 * ny - 1 - j); return A[iu(i, j)]; };
  const gv = (A, i, j) => { if (j < 0 || j > ny) return 0; if (i < 0) return -gv(A, -1 - i, j); if (i >= nx) return gv(A, nx - 1, j); return A[iv(i, j)]; };
  const quick = (vel, um, u0, u1, u2) => vel >= 0 ? .75 * u0 + .375 * u1 - .125 * um : .75 * u1 + .375 * u0 - .125 * u2;
  // Poisson operator (negative Laplacian, SPD): diag and neighbour couplings
  const N = nx * ny, diag = new Float64Array(N);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { let d = 0; if (i > 0) d++; if (i < nx - 1) d++; else d += 2; if (j > 0) d++; if (j < ny - 1) d++; diag[ip(i, j)] = d; }
  const Aop = (x, y) => { for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const n = ip(i, j); let s = diag[n] * x[n]; if (i > 0) s -= x[n - 1]; if (i < nx - 1) s -= x[n + 1]; if (j > 0) s -= x[n - nx]; if (j < ny - 1) s -= x[n + nx]; y[n] = s; } };
  // IC(0) for the 5-point stencil: L has diagonal l and off-diagonals -1/l(west), -1/l(south)
  const l = new Float64Array(N); for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const n = ip(i, j); let d = diag[n]; if (i > 0) d -= 1 / (l[n - 1] * l[n - 1]); if (j > 0) d -= 1 / (l[n - nx] * l[n - nx]); l[n] = Math.sqrt(d); }
  const precond = (r, z) => { // solve L L^T z = r
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const n = ip(i, j); let s = r[n]; if (i > 0) s += z[n - 1] / l[n - 1]; if (j > 0) s += z[n - nx] / l[n - nx]; z[n] = s / l[n]; }
    for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) { const n = ip(i, j); let s = z[n]; if (i < nx - 1) s += z[n + 1] / l[n]; if (j < ny - 1) s += z[n + nx] / l[n]; z[n] = s / l[n]; }
  };
  const r = new Float64Array(N), z = new Float64Array(N), pd = new Float64Array(N), Ap = new Float64Array(N), b = new Float64Array(N);
  const pcg = (x, tol, maxIt) => {
    Aop(x, Ap); let bn = 0; for (let n = 0; n < N; n++) { r[n] = b[n] - Ap[n]; bn += b[n] * b[n]; } bn = Math.sqrt(bn) || 1;
    precond(r, z); pd.set(z); let rz = 0; for (let n = 0; n < N; n++) rz += r[n] * z[n]; let it = 0;
    for (; it < maxIt; it++) {
      let rn = 0; for (let n = 0; n < N; n++) rn += r[n] * r[n]; if (Math.sqrt(rn) < tol * bn) break;
      Aop(pd, Ap); let pAp = 0; for (let n = 0; n < N; n++) pAp += pd[n] * Ap[n]; const al = rz / pAp;
      for (let n = 0; n < N; n++) { x[n] += al * pd[n]; r[n] -= al * Ap[n]; }
      precond(r, z); let rz2 = 0; for (let n = 0; n < N; n++) rz2 += r[n] * z[n]; const be = rz2 / rz; rz = rz2; for (let n = 0; n < N; n++) pd[n] = z[n] + be * pd[n];
    }
    return it;
  };
  const st = { nx, ny, h, U, V, P, step: 0, t: 0, cgIt: 0, uF, vF };
  st.step1 = (dt, sweeps = 4) => {
    const a = nu * dt / (h * h);
    // explicit convection terms for u and v (conservative, QUICK)
    const cu = new Float64Array(U.length), cv = new Float64Array(V.length);
    for (let j = 0; j < ny; j++) for (let i = 1; i <= nx; i++) {
      const n = iu(i, j); if (uSolid[n] || uForced[n]) continue;
      const ue = .5 * (gu(U, i, j) + gu(U, i + 1, j)), uw = .5 * (gu(U, i - 1, j) + gu(U, i, j));
      const vn = .5 * (gv(V, i - 1, j + 1) + gv(V, i, j + 1)), vs = .5 * (gv(V, i - 1, j) + gv(V, i, j));
      const fe = ue * quick(ue, gu(U, i - 1, j), gu(U, i, j), gu(U, i + 1, j), gu(U, i + 2, j)), fw = uw * quick(uw, gu(U, i - 2, j), gu(U, i - 1, j), gu(U, i, j), gu(U, i + 1, j));
      const fn = vn * quick(vn, gu(U, i, j - 1), gu(U, i, j), gu(U, i, j + 1), gu(U, i, j + 2)), fs = vs * quick(vs, gu(U, i, j - 2), gu(U, i, j - 1), gu(U, i, j), gu(U, i, j + 1));
      cu[n] = (fe - fw + fn - fs) / h;
    }
    for (let j = 1; j < ny; j++) for (let i = 0; i < nx; i++) {
      const n = iv(i, j); if (vSolid[n] || vForced[n]) continue;
      const vn = .5 * (gv(V, i, j) + gv(V, i, j + 1)), vs = .5 * (gv(V, i, j - 1) + gv(V, i, j));
      const ue = .5 * (gu(U, i + 1, j - 1) + gu(U, i + 1, j)), uw = .5 * (gu(U, i, j - 1) + gu(U, i, j));
      const fn = vn * quick(vn, gv(V, i, j - 1), gv(V, i, j), gv(V, i, j + 1), gv(V, i, j + 2)), fs = vs * quick(vs, gv(V, i, j - 2), gv(V, i, j - 1), gv(V, i, j), gv(V, i, j + 1));
      const fe = ue * quick(ue, gv(V, i - 1, j), gv(V, i, j), gv(V, i + 1, j), gv(V, i + 2, j)), fw = uw * quick(uw, gv(V, i - 2, j), gv(V, i - 1, j), gv(V, i, j), gv(V, i + 1, j));
      cv[n] = (fe - fw + fn - fs) / h;
    }
    // implicit diffusion by Gauss-Seidel sweeps: (1 + 4a) x - a sum(nb) = old - dt * conv
    Us.set(U); Vs.set(V);
    for (let s = 0; s < sweeps; s++) {
      for (let j = 0; j < ny; j++) for (let i = 1; i <= nx; i++) {
        const n = iu(i, j); if (uSolid[n] || uForced[n]) continue;
        if (i === nx) { Us[n] = Us[iu(nx - 1, j)]; continue; }
        const nb = gu(Us, i - 1, j) + gu(Us, i + 1, j) + gu(Us, i, j - 1) + gu(Us, i, j + 1);
        Us[n] = (U[n] - dt * cu[n] + a * nb) / (1 + 4 * a);
      }
      for (let j = 1; j < ny; j++) for (let i = 0; i < nx; i++) {
        const n = iv(i, j); if (vSolid[n] || vForced[n]) continue;
        const nb = gv(Vs, i - 1, j) + gv(Vs, i + 1, j) + gv(Vs, i, j - 1) + gv(Vs, i, j + 1);
        Vs[n] = (V[n] - dt * cv[n] + a * nb) / (1 + 4 * a);
      }
      applyIBM(Us, uSolid, uF); applyIBM(Vs, vSolid, vF);
    }
    for (let j = 0; j < ny; j++) Us[iu(0, j)] = inletU((j + .5) * h);
    // projection
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) b[ip(i, j)] = -((Us[iu(i + 1, j)] - Us[iu(i, j)]) + (Vs[iv(i, j + 1)] - Vs[iv(i, j)])) * h / dt;
    st.cgIt = pcg(P, 1e-8, 2000);
    for (let j = 0; j < ny; j++) for (let i = 1; i <= nx; i++) { const pr = i < nx ? P[ip(i, j)] : -P[ip(nx - 1, j)]; U[iu(i, j)] = Us[iu(i, j)] - dt * (pr - P[ip(i - 1, j)]) / h; }
    for (let j = 0; j < ny; j++) U[iu(0, j)] = Us[iu(0, j)];
    for (let j = 1; j < ny; j++) for (let i = 0; i < nx; i++) V[iv(i, j)] = Vs[iv(i, j)] - dt * (P[ip(i, j)] - P[ip(i, j - 1)]) / h;
    for (let i = 0; i < nx; i++) { V[iv(i, 0)] = 0; V[iv(i, ny)] = 0; }
    st.step++; st.t += dt;
  };
  // control-box momentum balance (steady): F = -sum over box faces of [u (u.n) + p n - nu (grad u).n] (density 1); box edges on cell faces
  st.boxForce = (i0, i1, j0, j1) => {
    const pc = (i, j) => P[ip(i, j)], uc = (i, j) => .5 * (U[iu(i, j)] + U[iu(i + 1, j)]), vc = (i, j) => .5 * (V[iv(i, j)] + V[iv(i, j + 1)]);
    let fx = 0, fy = 0;
    for (const [side, i] of [[-1, i0], [1, i1]]) for (let j = j0; j < j1; j++) { // vertical faces at x = i h, normal (side, 0)
      const u = U[iu(i, j)], v = .25 * (V[iv(i - 1, j)] + V[iv(i, j)] + V[iv(i - 1, j + 1)] + V[iv(i, j + 1)]), p = .5 * (pc(i - 1, j) + pc(i, j));
      const dudx = (uc(i, j) - uc(i - 1, j)) / h, dvdx = (vc(i, j) - vc(i - 1, j)) / h;
      fx -= side * (u * u + p - 2 * nu * dudx) * h; fy -= side * (v * u - nu * (dvdx + (gu(U, i, j + 1) - gu(U, i, j - 1)) / (2 * h))) * h;
    }
    for (const [side, j] of [[-1, j0], [1, j1]]) for (let i = i0; i < i1; i++) { // horizontal faces at y = j h, normal (0, side)
      const v = V[iv(i, j)], u = .25 * (U[iu(i, j - 1)] + U[iu(i + 1, j - 1)] + U[iu(i, j)] + U[iu(i + 1, j)]), p = .5 * (pc(i, j - 1) + pc(i, j));
      const dvdy = (vc(i, j) - vc(i, j - 1)) / h, dudy = (uc(i, j) - uc(i, j - 1)) / h;
      fx -= side * (u * v - nu * (dudy + (gv(V, i + 1, j) - gv(V, i - 1, j)) / (2 * h))) * h; fy -= side * (v * v + p - 2 * nu * dvdy) * h;
    }
    return [fx, fy];
  };
  st.cellSolid = (i, j) => inside((i + .5) * h, (j + .5) * h);
  return st;
}
