// Solver V2 S1: multi-threaded D3Q19 LBM CPU reference (see core3d-kernel.mjs for the numerics).
// createLBM3DMT({ nx, ny, nz, nu, solid(i,j,k), linkQ(i,j,k,q), U, lambda = 3/16, model = 'trt' | 'reg', cs = 0, sponge = { Lo, Li, sigma, dtau }, threads })
//   model 'reg': regularized collision; cs > 0 adds the Smagorinsky eddy viscosity. sponge: absorbing layers of Lo planes at the outlet and Li planes at the inlet,
//   density relaxation rate sigma and extra relaxation time dtau at the layer end (quadratic ramp).
// The caller must call close() (terminates the workers).
import fs from 'node:fs'; import os from 'node:os';
import { Worker } from 'node:worker_threads';
import { createCtx, runSteps, C, Q } from './core3d-kernel.mjs';

export function createLBM3DMT(o) {
  const { nx, ny, nz, nu, solid, linkQ, U, lambda = 3 / 16, model = 'trt', cs = 0, sponge = {} } = o, T = Math.max(1, Math.min(o.threads || os.cpus().length, nz)), N = nx * ny * nz;
  const sab = n => new SharedArrayBuffer(n), fBuf = sab(4 * Q * N), postBuf = sab(4 * Q * N), solidBuf = sab(N);
  const isSolid = new Uint8Array(solidBuf), f = new Float32Array(fBuf), id = (i, j, k) => i + nx * (j + ny * k);
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) isSolid[id(i, j, k)] = solid(i, j, k) ? 1 : 0;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (const i of [nx - 2, nx - 1]) if (isSolid[id(i, j, k)]) throw Error('solid nodes in the outlet planes are not supported');
  const links = [];
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const n = id(i, j, k); if (isSolid[n]) continue;
    for (let q = 1; q < Q; q++) {
      const a = i + C[q][0], b = (j + C[q][1] + ny) % ny, c = (k + C[q][2] + nz) % nz; if (a < 0 || a >= nx || !isSolid[id(a, b, c)]) continue;
      const a2 = i - C[q][0], b2 = (j - C[q][1] + ny) % ny, c2 = (k - C[q][2] + nz) % nz, n2 = a2 >= 0 && a2 < nx && !isSolid[id(a2, b2, c2)] ? id(a2, b2, c2) : -1;
      links.push(n, q, n2, Math.round(linkQ(i, j, k, q) * 1e6));
    }
  }
  const linkBuf = sab(4 * Math.max(links.length, 4)); new Int32Array(linkBuf).set(links);
  const ctlBuf = sab(16), barBuf = sab(8), parBuf = sab(64), forceBuf = sab(8 * 3 * T);
  const sh = { nx, ny, nz, nu, lambda, model, cs, T, U, sponge, fBuf, postBuf, solidBuf, linkBuf, nL: links.length / 4, ctlBuf, barBuf, parBuf, forceBuf };
  // initial state: equilibrium with the free-stream velocity (default) or o.init(i, j, k) -> [rho, ux, uy, uz]
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const n = id(i, j, k), [r, ux, uy, uz] = isSolid[n] ? [1, 0, 0, 0] : (o.init ? o.init(i, j, k) : [1, U, 0, 0]), uu = 1.5 * (ux * ux + uy * uy + uz * uz);
    for (let q = 0; q < Q; q++) { const cu = C[q][0] * ux + C[q][1] * uy + C[q][2] * uz; f[q * N + n] = (q === 0 ? 1 / 3 : (Math.abs(C[q][0]) + Math.abs(C[q][1]) + Math.abs(C[q][2]) === 1 ? 1 / 18 : 1 / 36)) * r * (1 + 3 * cu + 4.5 * cu * cu - uu); }
  }
  const ctx = createCtx(sh, 0), workers = [];
  for (let r = 1; r < T; r++) workers.push(new Worker(new URL('./core3d-worker.mjs', import.meta.url), { workerData: { sh, rank: r } }));
  const st = { nx, ny, nz, N, T, isSolid, f, step: 0, links: sh.nL, tau: .5 + 3 * nu, model };
  st.advance = (n, ramp = 1) => { ctx.par[0] = ramp; Atomics.store(ctx.ctl, 1, n); Atomics.add(ctx.ctl, 0, 1); Atomics.notify(ctx.ctl, 0); runSteps(ctx, n); st.step += n; };
  Object.defineProperty(st, 'force', { get() { const s = [0, 0, 0]; for (let r = 0; r < T; r++) for (let d = 0; d < 3; d++) s[d] += ctx.forces[3 * r + d]; return s; } });
  st.probe = (i, j, k) => { const n = id(i, j, k); let r = 0, ux = 0, uy = 0, uz = 0; for (let q = 0; q < Q; q++) { const v = f[q * N + n]; r += v; ux += v * C[q][0]; uy += v * C[q][1]; uz += v * C[q][2]; } return [r, ux / r, uy / r, uz / r]; };
  st.save = file => { fs.writeFileSync(file + '.tmp', Buffer.concat([Buffer.from(new Float64Array([st.step]).buffer), Buffer.from(f.buffer)])); fs.renameSync(file + '.tmp', file); };
  st.load = file => { if (!fs.existsSync(file)) return false; const b = fs.readFileSync(file); if (b.length !== 8 + f.byteLength) return false; st.step = new Float64Array(b.buffer.slice(b.byteOffset, b.byteOffset + 8))[0]; f.set(new Float32Array(b.buffer.slice(b.byteOffset + 8, b.byteOffset + b.length))); return true; };
  st.mass = () => { let m = 0, c = 0; for (let n = 0; n < N; n++) { if (isSolid[n]) continue; let r = 0; for (let q = 0; q < Q; q++) r += f[q * N + n]; m += r; c++; } return m / c; };
  st.finite = () => { for (let n = 0; n < N; n += 7) if (!isSolid[n] && !Number.isFinite(f[n])) return false; return true; };
  st.close = async () => { Atomics.store(ctx.ctl, 2, 1); Atomics.add(ctx.ctl, 0, 1); Atomics.notify(ctx.ctl, 0); await Promise.all(workers.map(w => w.terminate())); };
  return st;
}
