// CFD V3: per-cell kernels of refine.mjs (collision and pull streaming over a cell range), shared by the main thread and the worker threads.
// K: run constants { Q, d, cx, cy, cz, W, OPP, PAIRS, model, les, F0, eqTc, sig0, hrr, qp, qm }; LV: one level { l, N, f, post, mask, solid, coord, src, tau, tauEff, tauMin, mac }.
// tauMin (wall-model cells): lower bound of the relaxation time, so the eddy viscosity next to a wall is at least the log-law one.
// hrr < 1 (the stress blend of hybrid recursive regularization, Jacob, Malaspinas & Sagaut 2018, without its recursive third-order terms): the
// non-equilibrium stress of the regularized collision is hrr Pi(populations) + (1 - hrr) Pi(finite differences), Pi = -(2/3) rho tau S from the
// neighbours' velocities (mac, filled by macroRange). Grid-scale modes that the populations carry but the differences do not see then relax towards
// equilibrium instead of flipping sign every step near tau = 1/2; resolved flow keeps its stress. qp / qm: direction of +e_a / -e_a.
// Cell masks: 0 interior, 1 inactive (covered by a finer level), 2 ghost.
const INTERIOR = 0, GHOST = 2;

export function collideRange(K, LV, n0, n1) {
  const { Q, d, cx, cy, cz, W, PAIRS, model, les, F0, eqTc, sig0, hrr, qp, qm } = K, { N, f, post, mask, solid, tau, tauEff: te, tauMin: tm, coord, src, mac } = LV;
  const wp = 1 / tau, wm = 1 / (3 / 16 / (tau - .5) + .5), fs = 2 ** -LV.l, fe = new Float64Array(Q), G = new Float64Array(9), own = new Float64Array(3);
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
      if (hrr < 1) { // velocity gradient G[3 a + b] = d u_b / d x_a: central, one-sided next to a cell without a velocity (wall face, solid, ghost, inactive)
        let ok = true; own[0] = ux; own[1] = uy; own[2] = uz; G.fill(0);
        for (let a = 0; a < d && ok; a++) { const np = src[qm[a] * N + n], nm = src[qp[a] * N + n], hp = np >= 0 && mac[4 * np] > 0, hm = nm >= 0 && mac[4 * nm] > 0;
          if (!hp && !hm) { ok = false; break; }
          for (let b = 0; b < 3; b++) G[3 * a + b] = ((hp ? mac[4 * np + 1 + b] : own[b]) - (hm ? mac[4 * nm + 1 + b] : own[b])) / (hp && hm ? 2 : 1); }
        if (ok) { const k0 = -2 / 3 * rho * t, s = 1 - hrr;
          pxx = hrr * pxx + s * k0 * G[0]; pyy = hrr * pyy + s * k0 * G[4]; pzz = hrr * pzz + s * k0 * G[8];
          pxy = hrr * pxy + s * k0 * .5 * (G[1] + G[3]); pxz = hrr * pxz + s * k0 * .5 * (G[2] + G[6]); pyz = hrr * pyz + s * k0 * .5 * (G[5] + G[7]); }
      }
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

// density and velocity of the active fluid cells [n0, n1) from the pre-collision populations (rho = 0 marks cells without one); read by the HRR collision
export function macroRange(K, LV, n0, n1) {
  const { Q, cx, cy, cz } = K, { N, f, mask, solid, mac } = LV;
  for (let n = n0; n < n1; n++) {
    if (mask[n] !== INTERIOR || solid[n]) { mac[4 * n] = 0; continue; }
    let rho = 0, jx = 0, jy = 0, jz = 0; for (let q = 0; q < Q; q++) { const v = f[q * N + n]; rho += v; jx += v * cx[q]; jy += v * cy[q]; jz += v * cz[q]; }
    mac[4 * n] = rho; mac[4 * n + 1] = jx / rho; mac[4 * n + 2] = jy / rho; mac[4 * n + 3] = jz / rho;
  }
}

// pull streaming of the cells [n0, n1): src is the upstream cell per direction, -1 where there is none (inactive cells, domain or ghost edges)
export function streamRange(K, LV, n0, n1) {
  const { Q } = K, { N, f, post, src } = LV;
  for (let q = 0; q < Q; q++) { const b = q * N; for (let n = n0; n < n1; n++) { const s = src[b + n]; if (s >= 0) f[b + n] = post[b + s]; } }
}
