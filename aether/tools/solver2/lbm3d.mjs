// Solver V2 prototype A (3D): D3Q19 lattice Boltzmann, CPU reference implementation. Same numerics as lbm2d.mjs:
// TRT collision (magic 3/16), Bouzidi linear interpolated bounce-back on curved bodies, inlet x = 0 moving-wall bounce-back (uniform velocity, ramped),
// outlet x = nx-1 fixed density by non-equilibrium extrapolation, periodic in y and z. Momentum-exchange force. Float32 storage, Float64 arithmetic.
import fs from 'node:fs';
const C = [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1], [1, 1, 0], [-1, -1, 0], [1, -1, 0], [-1, 1, 0], [1, 0, 1], [-1, 0, -1], [1, 0, -1], [-1, 0, 1], [0, 1, 1], [0, -1, -1], [0, 1, -1], [0, -1, 1]];
const W = C.map((c, k) => k === 0 ? 1 / 3 : (Math.abs(c[0]) + Math.abs(c[1]) + Math.abs(c[2]) === 1 ? 1 / 18 : 1 / 36));
const OPP = C.map(c => C.findIndex(d => d[0] === -c[0] && d[1] === -c[1] && d[2] === -c[2]));
export function createLBM3D({ nx, ny, nz, nu, solid, linkQ, U, lambda = 3 / 16 }) {
  const N = nx * ny * nz, Q = 19, f = new Float32Array(Q * N), g = new Float32Array(Q * N), post = new Float32Array(Q * N);
  const id = (i, j, k) => i + nx * (j + ny * k), isSolid = new Uint8Array(N);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) isSolid[id(i, j, k)] = solid(i, j, k) ? 1 : 0;
  const tau = .5 + 3 * nu, wp = 1 / tau, wm = 1 / (lambda / (tau - .5) + .5);
  // pull source index per direction (periodic in y, z), -1 = from inlet, -2 = from outlet
  const src = new Int32Array(Q * N);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const n = id(i, j, k);
    for (let q = 0; q < Q; q++) { const a = i - C[q][0], b = (j - C[q][1] + ny) % ny, c = (k - C[q][2] + nz) % nz; src[q * N + n] = a < 0 ? -1 : (a >= nx ? -2 : id(a, b, c)); }
  }
  const links = [];
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const n = id(i, j, k); if (isSolid[n]) continue;
    for (let q = 1; q < Q; q++) {
      const a = i + C[q][0], b = (j + C[q][1] + ny) % ny, c = (k + C[q][2] + nz) % nz; if (a < 0 || a >= nx || !isSolid[id(a, b, c)]) continue;
      const a2 = i - C[q][0], b2 = (j - C[q][1] + ny) % ny, c2 = (k - C[q][2] + nz) % nz; const n2 = a2 >= 0 && a2 < nx && !isSolid[id(a2, b2, c2)] ? id(a2, b2, c2) : -1;
      links.push(n, q, n2, Math.round(linkQ(i, j, k, q) * 1e6));
    }
  }
  const L = new Int32Array(links), nL = L.length / 4;
  const PAIRS = []; for (let q = 1; q < Q; q++) if (OPP[q] > q) PAIRS.push(q, OPP[q]);
  for (let n = 0; n < N; n++) { const ux = isSolid[n] ? 0 : U; for (let q = 0; q < Q; q++) { const cu = C[q][0] * ux; f[q * N + n] = W[q] * (1 + 3 * cu + 4.5 * cu * cu - 1.5 * ux * ux); } }
  const st = { nx, ny, nz, N, isSolid, tau, step: 0, force: [0, 0, 0], links: nL };
  st.step1 = (ramp = 1) => {
    for (let n = 0; n < N; n++) {
      if (isSolid[n]) continue;
      let r = 0, ux = 0, uy = 0, uz = 0;
      for (let q = 0; q < Q; q++) { const v = f[q * N + n]; r += v; ux += v * C[q][0]; uy += v * C[q][1]; uz += v * C[q][2]; }
      ux /= r; uy /= r; uz /= r; const uu = 1.5 * (ux * ux + uy * uy + uz * uz);
      post[n] = f[n] - wp * (f[n] - W[0] * r * (1 - uu));
      for (let p = 0; p < PAIRS.length; p += 2) {
        const a = PAIRS[p], o = PAIRS[p + 1], cu = C[a][0] * ux + C[a][1] * uy + C[a][2] * uz, w = W[a] * r, ea = w * (1 + 3 * cu + 4.5 * cu * cu - uu), eo = w * (1 - 3 * cu + 4.5 * cu * cu - uu);
        const fa = f[a * N + n], fo = f[o * N + n], dp = wp * (.5 * (fa + fo) - .5 * (ea + eo)), dm = wm * (.5 * (fa - fo) - .5 * (ea - eo));
        post[a * N + n] = fa - dp - dm; post[o * N + n] = fo - dp + dm;
      }
    }
    const uin = U * ramp;
    for (let q = 0; q < Q; q++) {
      const base = q * N, ob = OPP[q] * N, inl = 6 * W[q] * C[q][0] * uin;
      for (let n = 0; n < N; n++) {
        if (isSolid[n]) continue; const s = src[base + n];
        if (s >= 0) { if (!isSolid[s]) g[base + n] = post[base + s]; }
        else if (s === -1) g[base + n] = post[ob + n] + inl; else g[base + n] = post[base + n];
      }
    }
    // outlet: fixed density 1, non-equilibrium extrapolation from the neighbour plane
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) {
      const n = id(nx - 1, j, k), p = id(nx - 2, j, k); if (isSolid[n] || isSolid[p]) continue;
      let r = 0, ux = 0, uy = 0, uz = 0; for (let q = 0; q < Q; q++) { const v = g[q * N + p]; r += v; ux += v * C[q][0]; uy += v * C[q][1]; uz += v * C[q][2]; } ux /= r; uy /= r; uz /= r;
      const uu = 1.5 * (ux * ux + uy * uy + uz * uz);
      for (let q = 1; q < Q; q++) if (C[q][0] < 0) { const cu = C[q][0] * ux + C[q][1] * uy + C[q][2] * uz, e = cu * (3 + 4.5 * cu) - uu; g[q * N + n] = W[q] * (1 + e) + (g[q * N + p] - W[q] * r * (1 + e)); }
    }
    // body: Bouzidi interpolated bounce-back + momentum exchange
    let fx = 0, fy = 0, fz = 0;
    for (let l = 0; l < nL; l++) {
      const n = L[4 * l], q = L[4 * l + 1], n2 = L[4 * l + 2], qq = L[4 * l + 3] * 1e-6, o = OPP[q];
      let v; const pq = post[q * N + n];
      if (qq < .5 && n2 >= 0) v = 2 * qq * pq + (1 - 2 * qq) * post[q * N + n2];
      else if (qq >= .5) v = pq / (2 * qq) + (2 * qq - 1) / (2 * qq) * post[o * N + n];
      else v = pq;
      g[o * N + n] = v; const m = pq + v; fx += C[q][0] * m; fy += C[q][1] * m; fz += C[q][2] * m;
    }
    st.force = [fx, fy, fz];
    f.set(g); st.step++;
  };
  // checkpoint: populations + step counter (resume after a killed job)
  st.save = file => { fs.writeFileSync(file + '.tmp', Buffer.concat([Buffer.from(new Float64Array([st.step]).buffer), Buffer.from(f.buffer)])); fs.renameSync(file + '.tmp', file); };
  st.load = file => { if (!fs.existsSync(file)) return false; const b = fs.readFileSync(file); if (b.length !== 8 + f.byteLength) return false; st.step = new Float64Array(b.buffer.slice(b.byteOffset, b.byteOffset + 8))[0]; f.set(new Float32Array(b.buffer.slice(b.byteOffset + 8, b.byteOffset + b.length))); return true; };
  // diagnostics: [mean density over fluid, mean ux on plane i = 1, mean ux on plane i = nx - 2]
  st.mass = () => {
    let m = 0, c = 0; const pl = [0, 0], pc = [0, 0];
    for (let n = 0; n < N; n++) {
      if (isSolid[n]) continue; let r = 0, ux = 0; for (let q = 0; q < Q; q++) { const v = f[q * N + n]; r += v; ux += v * C[q][0]; } m += r; c++;
      const i = n % nx, p = i === 1 ? 0 : (i === nx - 2 ? 1 : -1); if (p >= 0) { pl[p] += ux / r; pc[p]++; }
    }
    return [m / c, pl[0] / pc[0], pl[1] / pc[1]];
  };
  return st;
}
