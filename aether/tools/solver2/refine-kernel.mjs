// CFD V3: per-cell kernels of refine.mjs (collision and pull streaming over a cell range), shared by the main thread and the worker threads.
// K: run constants { Q, d, cx, cy, cz, W, OPP, PAIRS, model, les, F0, eqTc, sig0 }; LV: one level { l, N, f, post, mask, solid, coord, src, tau, tauEff, tauMin }.
// tauMin (wall-model cells): lower bound of the relaxation time, so the eddy viscosity next to a wall is at least the log-law one.
// Cell masks: 0 interior, 1 inactive (covered by a finer level), 2 ghost.
const INTERIOR = 0, GHOST = 2;

export function collideRange(K, LV, n0, n1) {
  const { Q, d, cx, cy, cz, W, PAIRS, model, les, F0, eqTc, sig0 } = K, { N, f, post, mask, solid, tau, tauEff: te, tauMin: tm, coord } = LV;
  const wp = 1 / tau, wm = 1 / (3 / 16 / (tau - .5) + .5), fs = 2 ** -LV.l, fe = new Float64Array(Q);
  const Fx = F0 ? F0[0] * fs : 0, Fy = F0 ? F0[1] * fs : 0, Fz = F0 ? F0[2] * fs : 0;
  const feqInto = (rho, ux, uy, uz) => { const uu = 1.5 * (ux * ux + uy * uy + uz * uz); for (let q = 0; q < Q; q++) { const cu = cx[q] * ux + cy[q] * uy + cz[q] * uz; fe[q] = W[q] * rho * (1 + 3 * cu + 4.5 * cu * cu - uu); } };
  const guo = (n, ux, uy, uz, k) => { for (let q = 0; q < Q; q++) { const cF = cx[q] * Fx + cy[q] * Fy + cz[q] * Fz, cu = cx[q] * ux + cy[q] * uy + cz[q] * uz; post[q * N + n] += k * W[q] * (3 * (cF - (ux * Fx + uy * Fy + uz * Fz)) + 9 * cu * cF); } };
  for (let n = n0; n < n1; n++) {
    if (mask[n] === GHOST) { for (let q = 0; q < Q; q++) post[q * N + n] = f[q * N + n]; continue; } // ghosts only transport (V0 second sub-step); the N methods overwrite them
    if (mask[n] !== INTERIOR || solid[n]) continue;
    if (model === 'reg') {
      // Pi_neq = sum c c f - rho (I/3 + u u): exact for the second-order equilibrium on D2Q9 / D3Q19, so no equilibrium loop is needed
      let rho = 0, jx = 0, jy = 0, jz = 0, pxx = 0, pyy = 0, pzz = 0, pxy = 0, pxz = 0, pyz = 0;
      for (let q = 0; q < Q; q++) { const v = f[q * N + n], a = cx[q], b = cy[q], c = cz[q]; rho += v; jx += v * a; jy += v * b; jz += v * c; pxx += v * a * a; pyy += v * b * b; pzz += v * c * c; pxy += v * a * b; pxz += v * a * c; pyz += v * b * c; }
      let ux = jx / rho, uy = jy / rho, uz = jz / rho; const r3 = rho / 3;
      pxx -= r3 + rho * ux * ux; pyy -= r3 + rho * uy * uy; pzz -= (d === 3 ? r3 : 0) + rho * uz * uz; pxy -= rho * ux * uy; pxz -= rho * ux * uz; pyz -= rho * uy * uz;
      let t = tau; if (les > 0) { const pn = Math.sqrt(pxx * pxx + pyy * pyy + pzz * pzz + 2 * (pxy * pxy + pxz * pxz + pyz * pyz)); t = .5 * (tau + Math.sqrt(tau * tau + les * pn / rho)); }
      if (tm && tm[n] > t) t = tm[n];
      if (te) te[n] = t;
      // Guo forcing: equilibrium at u + F/(2 rho); Pi_neq stays the one around the unshifted velocity (O(u F), negligible for weak forces)
      if (F0) { ux += .5 * Fx / rho; uy += .5 * Fy / rho; uz += .5 * Fz / rho; }
      const k = 4.5 * (1 - 1 / t), tr = (pxx + pyy + pzz) / 3, uu = 1.5 * (ux * ux + uy * uy + uz * uz);
      for (let q = 0; q < Q; q++) { const a = cx[q], b = cy[q], c = cz[q], cu = a * ux + b * uy + c * uz, w = W[q];
        post[q * N + n] = w * rho * (1 + 3 * cu + 4.5 * cu * cu - uu) + k * w * (a * a * pxx + b * b * pyy + c * c * pzz + 2 * (a * b * pxy + a * c * pxz + b * c * pyz) - tr); }
      if (F0) { guo(n, ux, uy, uz, 1 - .5 / t);
        // the regularized projection drops the first-order part of f - f_eq(u), whose momentum is -F/2; keep it (relaxed like the rest), else the
        // momentum gain per step is F (3/2 - 1/(2 tau)) instead of F
        const k1 = -1.5 * (1 - 1 / t); for (let q = 0; q < Q; q++) post[q * N + n] += k1 * W[q] * (cx[q] * Fx + cy[q] * Fy + cz[q] * Fz); }
    } else {
      let rho = 0, jx = 0, jy = 0, jz = 0; for (let q = 0; q < Q; q++) { const v = f[q * N + n]; rho += v; jx += v * cx[q]; jy += v * cy[q]; jz += v * cz[q]; }
      if (te) te[n] = tau;
      if (F0) { jx += .5 * Fx; jy += .5 * Fy; jz += .5 * Fz; }
      feqInto(rho, jx / rho, jy / rho, jz / rho);
      if (model === 'bgk') { for (let q = 0; q < Q; q++) post[q * N + n] = f[q * N + n] - wp * (f[q * N + n] - fe[q]); if (F0) guo(n, jx / rho, jy / rho, jz / rho, 1 - .5 * wp); }
      else { post[n] = f[n] - wp * (f[n] - fe[0]); for (let p = 0; p < PAIRS.length; p += 2) { const a = PAIRS[p], b = PAIRS[p + 1], fa = f[a * N + n], fb = f[b * N + n], dp = wp * (.5 * (fa + fb) - .5 * (fe[a] + fe[b])), dm = wm * (.5 * (fa - fb) - .5 * (fe[a] - fe[b])); post[a * N + n] = fa - dp - dm; post[b * N + n] = fb - dp + dm; } }
    }
    if (LV.l === 0 && sig0 && sig0[coord[3 * n]] > 0) { const s = sig0[coord[3 * n]]; for (let q = 0; q < Q; q++) post[q * N + n] += s * (eqTc[q] - post[q * N + n]); } // outlet absorbing layer
  }
}

// pull streaming of the cells [n0, n1): src is the upstream cell per direction, -1 where there is none (inactive cells, domain or ghost edges)
export function streamRange(K, LV, n0, n1) {
  const { Q } = K, { N, f, post, src } = LV;
  for (let q = 0; q < Q; q++) { const b = q * N; for (let n = n0; n < n1; n++) { const s = src[b + n]; if (s >= 0) f[b + n] = post[b + s]; } }
}
