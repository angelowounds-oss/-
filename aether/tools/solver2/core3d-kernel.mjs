// Solver V2 S1: D3Q19 lattice Boltzmann kernel, shared by the main thread and the worker threads (SharedArrayBuffer, z-slab decomposition).
// One time step = 3 phases separated by barriers:
//   A  collision f -> post (per node; TRT or regularized + Smagorinsky; optional absorbing layers at inlet/outlet)
//   B  streaming post -> f (pull, in place: f is not read in this phase), inlet moving-wall bounce-back, periodic y/z, solid nodes skipped
//   C  outlet (fixed density, non-equilibrium extrapolation) + Bouzidi interpolated bounce-back on the body + momentum-exchange force
// Everything in lattice units. Float32 storage, Float64 arithmetic. The TRT path performs the same arithmetic as lbm3d.mjs (checked bit-for-bit in tests/mt-equivalence.mjs).
export const Q = 19;
export const C = [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 1, 0], [-1, -1, 0], [1, -1, 0], [-1, 1, 0], [1, 0, 1], [-1, 0, -1], [1, 0, -1], [-1, 0, 1], [0, 1, 1], [0, -1, -1], [0, 1, -1], [0, -1, 1]];
export const W = Float64Array.from(C, (c, k) => k === 0 ? 1 / 3 : (Math.abs(c[0]) + Math.abs(c[1]) + Math.abs(c[2]) === 1 ? 1 / 18 : 1 / 36));
export const OPP = Int8Array.from(C, c => C.findIndex(d => d[0] === -c[0] && d[1] === -c[1] && d[2] === -c[2]));
const CX = Int8Array.from(C, c => c[0]), CY = Int8Array.from(C, c => c[1]), CZ = Int8Array.from(C, c => c[2]);
const PAIRS = []; for (let q = 1; q < Q; q++) if (OPP[q] > q) PAIRS.push(q, OPP[q]);

// sh: plain object with the SharedArrayBuffers and the numeric parameters (structured-cloned to the workers)
export function createCtx(sh, rank) {
  const { nx, ny, nz, nu, lambda, model, cs, T } = sh, N = nx * ny * nz, tau0 = .5 + 3 * nu;
  const sp = sh.sponge || {}, Lo = sp.Lo || 0, Li = sp.Li || 0, sMax = sp.sigma || 0, dMax = sp.dtau || 0;
  const sig = new Float64Array(nx), tauI = new Float64Array(nx).fill(tau0), wpI = new Float64Array(nx), wmI = new Float64Array(nx);
  for (let i = 0; i < nx; i++) {
    let s = 0;
    if (Lo > 0 && i >= nx - Lo) s = Math.max(s, ((i - (nx - Lo) + 1) / Lo) ** 2);
    if (Li > 0 && i < Li) s = Math.max(s, ((Li - i) / Li) ** 2);
    sig[i] = sMax * s; tauI[i] = tau0 + dMax * s; wpI[i] = 1 / tauI[i]; wmI[i] = 1 / (lambda / (tauI[i] - .5) + .5);
  }
  return {
    rank, T, nx, ny, nz, N, U: sh.U, model, cs, tau0, sig, tauI, wpI, wmI, hasSponge: sMax > 0 || dMax > 0, spFull: !!sp.full,
    eqT: Float64Array.from(C, (c, q) => W[q] * (1 + 3 * c[0] * sh.U + 4.5 * (c[0] * sh.U) ** 2 - 1.5 * sh.U * sh.U)), // equilibrium of the free stream (rho = 1, u = (U, 0, 0))
    f: new Float32Array(sh.fBuf), post: new Float32Array(sh.postBuf), isSolid: new Uint8Array(sh.solidBuf), L: new Int32Array(sh.linkBuf), nL: sh.nL,
    ctl: new Int32Array(sh.ctlBuf), bar: new Int32Array(sh.barBuf), par: new Float64Array(sh.parBuf), forces: new Float64Array(sh.forceBuf), feq: new Float64Array(Q),
  };
}

export function barrier(ctx) {
  const b = ctx.bar, gen = Atomics.load(b, 1);
  if (Atomics.add(b, 0, 1) === ctx.T - 1) { Atomics.store(b, 0, 0); Atomics.add(b, 1, 1); Atomics.notify(b, 1); } else { while (Atomics.load(b, 1) === gen) Atomics.wait(b, 1, gen, 1000); }
}

export function runSteps(ctx, nSteps) {
  for (let s = 0; s < nSteps; s++) { collide(ctx); barrier(ctx); stream(ctx); barrier(ctx); boundary(ctx); barrier(ctx); }
}

function collide(ctx) {
  const { nx, ny, nz, N, f, post, isSolid, rank, T, model, cs, tau0, sig, tauI, wpI, wmI, feq } = ctx, k0 = Math.floor(nz * rank / T), k1 = Math.floor(nz * (rank + 1) / T);
  const les = cs * cs * 18 * Math.SQRT2;
  for (let k = k0; k < k1; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const n = i + nx * (j + ny * k); if (isSolid[n]) continue;
    let r = 0, ux = 0, uy = 0, uz = 0;
    for (let q = 0; q < Q; q++) { const v = f[q * N + n]; r += v; ux += v * CX[q]; uy += v * CY[q]; uz += v * CZ[q]; }
    ux /= r; uy /= r; uz /= r; const uu = 1.5 * (ux * ux + uy * uy + uz * uz);
    if (model === 'trt') {
      const wp = wpI[i], wm = wmI[i];
      post[n] = f[n] - wp * (f[n] - W[0] * r * (1 - uu));
      for (let p = 0; p < PAIRS.length; p += 2) {
        const a = PAIRS[p], o = PAIRS[p + 1], cu = CX[a] * ux + CY[a] * uy + CZ[a] * uz, w = W[a] * r, ea = w * (1 + 3 * cu + 4.5 * cu * cu - uu), eo = w * (1 - 3 * cu + 4.5 * cu * cu - uu);
        const fa = f[a * N + n], fo = f[o * N + n], dp = wp * (.5 * (fa + fo) - .5 * (ea + eo)), dm = wm * (.5 * (fa - fo) - .5 * (ea - eo));
        post[a * N + n] = fa - dp - dm; post[o * N + n] = fo - dp + dm;
      }
    } else {
      // regularized: the non-equilibrium part is replaced by its second-order Hermite projection (Latt & Chopard 2006), relaxed with the local tau
      let pxx = 0, pyy = 0, pzz = 0, pxy = 0, pxz = 0, pyz = 0;
      for (let q = 0; q < Q; q++) {
        const cx = CX[q], cy = CY[q], cz = CZ[q], cu = cx * ux + cy * uy + cz * uz, e = W[q] * r * (1 + 3 * cu + 4.5 * cu * cu - uu), fn = f[q * N + n] - e;
        feq[q] = e; pxx += cx * cx * fn; pyy += cy * cy * fn; pzz += cz * cz * fn; pxy += cx * cy * fn; pxz += cx * cz * fn; pyz += cy * cz * fn;
      }
      // Smagorinsky: tau = (tau0 + sqrt(tau0^2 + 18 sqrt(2) Cs^2 |Pi| / rho)) / 2 with |Pi| = sqrt(Pi_ab Pi_ab), Pi = non-equilibrium momentum flux (Hou et al. 1996)
      const t0 = tauI[i], pn = Math.sqrt(pxx * pxx + pyy * pyy + pzz * pzz + 2 * (pxy * pxy + pxz * pxz + pyz * pyz)), tau = cs > 0 ? .5 * (t0 + Math.sqrt(t0 * t0 + les * pn / r)) : t0, om1 = 1 - 1 / tau, tr = (pxx + pyy + pzz) / 3;
      for (let q = 0; q < Q; q++) {
        const cx = CX[q], cy = CY[q], cz = CZ[q], qp = cx * cx * pxx + cy * cy * pyy + cz * cz * pzz + 2 * (cx * cy * pxy + cx * cz * pxz + cy * cz * pyz) - tr;
        post[q * N + n] = feq[q] + om1 * 4.5 * W[q] * qp;
      }
    }
    // absorbing layer. full: relax the whole state towards the free stream (rho = 1, u = (U, 0, 0)); otherwise only the density towards 1 at the local velocity
    if (sig[i] > 0 && ctx.spFull) { const s = sig[i], eqT = ctx.eqT; for (let q = 0; q < Q; q++) post[q * N + n] += s * (eqT[q] - post[q * N + n]); }
    else if (sig[i] > 0) {
      const a = sig[i] * (1 - r);
      for (let q = 0; q < Q; q++) { const cu = CX[q] * ux + CY[q] * uy + CZ[q] * uz; post[q * N + n] += a * W[q] * (1 + 3 * cu + 4.5 * cu * cu - uu); }
    }
    void tau0;
  }
}

function stream(ctx) {
  const { nx, ny, nz, N, f, post, isSolid, rank, T, U } = ctx, k0 = Math.floor(nz * rank / T), k1 = Math.floor(nz * (rank + 1) / T), uin = U * ctx.par[0];
  // Rows along x are contiguous. Populations that would come out of the body (and all populations of solid nodes) are written with stale but finite values here
  // and overwritten by the Bouzidi step, so no solid test is needed in the inner loop.
  void isSolid;
  for (let k = k0; k < k1; k++) for (let j = 0; j < ny; j++) {
    const dst = nx * (j + ny * k);
    for (let q = 0; q < Q; q++) {
      const cx = CX[q]; let b = j - CY[q], c = k - CZ[q]; if (b < 0) b += ny; else if (b >= ny) b -= ny; if (c < 0) c += nz; else if (c >= nz) c -= nz;
      const pq = q * N, d = pq + dst, s = pq + nx * (b + ny * c) - cx, i0 = cx > 0 ? 1 : 0, i1 = cx < 0 ? nx - 1 : nx;
      for (let i = i0; i < i1; i++) f[d + i] = post[s + i];
      if (cx > 0) f[d] = post[OPP[q] * N + dst] + 6 * W[q] * cx * uin; // inlet: moving-wall bounce-back
      else if (cx < 0) f[d + nx - 1] = post[d + nx - 1]; // outlet placeholder, replaced in boundary()
    }
  }
}

function boundary(ctx) {
  const { nx, ny, nz, N, f, post, isSolid, rank, T, L, nL } = ctx, k0 = Math.floor(nz * rank / T), k1 = Math.floor(nz * (rank + 1) / T);
  for (let k = k0; k < k1; k++) for (let j = 0; j < ny; j++) {
    const n = nx - 1 + nx * (j + ny * k), p = nx - 2 + nx * (j + ny * k); if (isSolid[n] || isSolid[p]) continue;
    let r = 0, ux = 0, uy = 0, uz = 0; for (let q = 0; q < Q; q++) { const v = f[q * N + p]; r += v; ux += v * CX[q]; uy += v * CY[q]; uz += v * CZ[q]; } ux /= r; uy /= r; uz /= r;
    const uu = 1.5 * (ux * ux + uy * uy + uz * uz);
    for (let q = 1; q < Q; q++) if (CX[q] < 0) { const cu = CX[q] * ux + CY[q] * uy + CZ[q] * uz, e = cu * (3 + 4.5 * cu) - uu; f[q * N + n] = W[q] * (1 + e) + (f[q * N + p] - W[q] * r * (1 + e)); }
  }
  const l0 = Math.floor(nL * rank / T), l1 = Math.floor(nL * (rank + 1) / T);
  let fx = 0, fy = 0, fz = 0;
  for (let l = l0; l < l1; l++) {
    const n = L[4 * l], q = L[4 * l + 1], n2 = L[4 * l + 2], qq = L[4 * l + 3] * 1e-6, o = OPP[q];
    let v; const pq = post[q * N + n];
    if (qq < .5 && n2 >= 0) v = 2 * qq * pq + (1 - 2 * qq) * post[q * N + n2];
    else if (qq >= .5) v = pq / (2 * qq) + (2 * qq - 1) / (2 * qq) * post[o * N + n];
    else v = pq;
    f[o * N + n] = v; const m = pq + v; fx += CX[q] * m; fy += CY[q] * m; fz += CZ[q] * m;
  }
  ctx.forces[3 * rank] = fx; ctx.forces[3 * rank + 1] = fy; ctx.forces[3 * rank + 2] = fz;
}
