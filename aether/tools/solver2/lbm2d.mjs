// Solver V2 prototype A: 2D lattice Boltzmann (D2Q9), CPU reference implementation for the S0 method comparison.
// Collision: TRT with magic parameter 3/16 (wall location independent of viscosity for bounce-back). Curved walls: Bouzidi linear interpolated bounce-back
// (uses the true wall distance q along each link, falls back to halfway bounce-back when the second fluid node is missing). Straight channel walls: halfway
// bounce-back. Inlet: moving-wall (Ladd) bounce-back carrying the prescribed velocity. Outlet: fixed density by non-equilibrium extrapolation.
// Force on the body: momentum exchange summed over the cut links. Everything in lattice units (dx = dt = 1); the caller converts.
const C = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [-1, -1], [1, -1]];
const W = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
const OPP = [0, 3, 4, 1, 2, 7, 8, 5, 6];
export function createLBM2D({ nx, ny, nu, solid, linkQ, inletU, uInit, lambda = 3 / 16 }) {
  const N = nx * ny, f = new Float64Array(9 * N), g = new Float64Array(9 * N), post = new Float64Array(9 * N);
  const isSolid = new Uint8Array(N), id = (i, j) => i + nx * j;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) isSolid[id(i, j)] = solid(i, j) ? 1 : 0;
  const tau = .5 + 3 * nu, wp = 1 / tau, wm = 1 / (lambda / (tau - .5) + .5);
  // links from a fluid node towards a solid node: [node, dir towards wall, q, second node (one step away from the wall) or -1]
  const links = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const n = id(i, j); if (isSolid[n]) continue;
    for (let k = 1; k < 9; k++) {
      const a = i + C[k][0], b = j + C[k][1]; if (a < 0 || b < 0 || a >= nx || b >= ny || !isSolid[id(a, b)]) continue;
      const q = linkQ(i, j, k); const a2 = i - C[k][0], b2 = j - C[k][1];
      const n2 = a2 >= 0 && b2 >= 0 && a2 < nx && b2 < ny && !isSolid[id(a2, b2)] ? id(a2, b2) : -1;
      links.push([n, k, q, n2]);
    }
  }
  const feq = (k, r, ux, uy) => { const cu = C[k][0] * ux + C[k][1] * uy; return W[k] * r * (1 + 3 * cu + 4.5 * cu * cu - 1.5 * (ux * ux + uy * uy)); };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const n = id(i, j), u = isSolid[n] ? [0, 0] : uInit(i, j); for (let k = 0; k < 9; k++) f[k * N + n] = feq(k, 1, u[0], u[1]); }
  const st = { nx, ny, N, f, isSolid, links, tau, step: 0, force: [0, 0] };
  st.macro = n => { let r = 0, ux = 0, uy = 0; for (let k = 0; k < 9; k++) { const v = f[k * N + n]; r += v; ux += v * C[k][0]; uy += v * C[k][1]; } return [r, ux / r, uy / r]; };
  st.step1 = (ramp = 1) => {
    // collision (TRT) into post; equilibria computed inline per opposite pair (no allocation in the loop)
    const PAIRS = [1, 3, 2, 4, 5, 7, 6, 8];
    for (let n = 0; n < N; n++) {
      if (isSolid[n]) continue;
      let r = 0, ux = 0, uy = 0; for (let k = 0; k < 9; k++) { const v = f[k * N + n]; r += v; ux += v * C[k][0]; uy += v * C[k][1]; } ux /= r; uy /= r;
      const uu = 1.5 * (ux * ux + uy * uy);
      post[n] = f[n] - wp * (f[n] - W[0] * r * (1 - uu));
      for (let p = 0; p < 8; p += 2) {
        const k = PAIRS[p], o = PAIRS[p + 1], cu = C[k][0] * ux + C[k][1] * uy, a = W[k] * r, ek = a * (1 + 3 * cu + 4.5 * cu * cu - uu), eo = a * (1 - 3 * cu + 4.5 * cu * cu - uu);
        const fk = f[k * N + n], fo = f[o * N + n], dp = wp * (.5 * (fk + fo) - .5 * (ek + eo)), dm = wm * (.5 * (fk - fo) - .5 * (ek - eo));
        post[k * N + n] = fk - dp - dm; post[o * N + n] = fo - dp + dm;
      }
    }
    // streaming (pull) with domain boundaries
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const n = id(i, j); if (isSolid[n]) continue;
      g[n] = post[n];
      for (let k = 1; k < 9; k++) {
        const a = i - C[k][0], b = j - C[k][1], o = OPP[k];
        if (b < 0 || b >= ny) { g[k * N + n] = post[o * N + n]; continue; } // channel wall, halfway bounce-back
        if (a < 0) { const u = inletU(j); g[k * N + n] = post[o * N + n] + 6 * W[k] * (C[k][0] * u[0] * ramp + C[k][1] * u[1] * ramp); continue; } // inlet, moving-wall bounce-back
        if (a >= nx) { g[k * N + n] = post[k * N + n]; continue; } // outlet placeholder, fixed below
        const m = id(a, b); if (isSolid[m]) continue; // filled by the interpolated bounce-back below
        g[k * N + n] = post[k * N + m];
      }
    }
    // outlet: fixed density rho = 1 (non-equilibrium extrapolation, Guo et al. 2002): unknown = feq(1, u_p) + (f_p - feq(rho_p, u_p)) from the neighbour column
    for (let j = 0; j < ny; j++) {
      const n = id(nx - 1, j), p = id(nx - 2, j); if (isSolid[n] || isSolid[p]) continue;
      let r = 0, ux = 0, uy = 0; for (let k = 0; k < 9; k++) { const v = g[k * N + p]; r += v; ux += v * C[k][0]; uy += v * C[k][1]; } ux /= r; uy /= r;
      for (let k = 1; k < 9; k++) if (C[k][0] < 0) g[k * N + n] = feq(k, 1, ux, uy) + (g[k * N + p] - feq(k, r, ux, uy));
    }
    // curved wall: Bouzidi linear interpolation; momentum exchange force
    let fx = 0, fy = 0;
    for (const [n, k, q, n2] of links) {
      const o = OPP[k]; let v; // unknown population at n is direction o (coming back from the wall)
      if (q < .5 && n2 >= 0) v = 2 * q * post[k * N + n] + (1 - 2 * q) * post[k * N + n2];
      else if (q >= .5) v = post[k * N + n] / (2 * q) + (2 * q - 1) / (2 * q) * post[o * N + n];
      else v = post[k * N + n];
      g[o * N + n] = v;
      fx += C[k][0] * (post[k * N + n] + v); fy += C[k][1] * (post[k * N + n] + v);
    }
    st.force = [fx, fy];
    f.set(g); st.step++;
  };
  st.rhoAt = (x, y) => { // bilinear interpolation of density at lattice position (node centres at integer coordinates)
    const i = Math.floor(x), j = Math.floor(y), tx = x - i, ty = y - j, r = (a, b) => st.macro(id(a, b))[0];
    return (1 - tx) * (1 - ty) * r(i, j) + tx * (1 - ty) * r(i + 1, j) + (1 - tx) * ty * r(i, j + 1) + tx * ty * r(i + 1, j + 1);
  };
  return st;
}
