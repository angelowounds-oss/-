#!/usr/bin/env node
// 64x64 blue-noise threshold map by void-and-cluster (Ulichney 1993), toroidal Gaussian sigma 1.5.
// Output: assets/bluenoise.js (window.__ASSETS.BLUE_NOISE = base64 of 4096 ranked bytes). Deterministic (seeded).
import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const S = 64, N = S * S, sigma = 1.5;
let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const K = new Float64Array(N); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const dx = Math.min(x, S - x), dy = Math.min(y, S - y); K[y * S + x] = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma)); }
const E = new Float64Array(N), P = new Uint8Array(N);
const splat = (i, s) => { const px = i % S, py = (i / S) | 0; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) E[((py + y) % S) * S + (px + x) % S] += s * K[y * S + x]; };
const argmax = on => { let b = -1, v = -Infinity; for (let i = 0; i < N; i++) if (P[i] === on && E[i] > v) { v = E[i]; b = i; } return b; };
const argmin = on => { let b = -1, v = Infinity; for (let i = 0; i < N; i++) if (P[i] === on && E[i] < v) { v = E[i]; b = i; } return b; };
const ones = Math.round(N * 0.1);
while ([...P].reduce((a, b) => a + b, 0) < ones) { const i = Math.floor(rnd() * N); if (!P[i]) { P[i] = 1; splat(i, 1); } }
for (;;) { const c = argmax(1); P[c] = 0; splat(c, -1); const v = argmin(0); if (v === c) { P[c] = 1; splat(c, 1); break; } P[v] = 1; splat(v, 1); }
const rank = new Int32Array(N).fill(-1), P0 = P.slice(), E0 = E.slice();
for (let r = ones - 1; r >= 0; r--) { const c = argmax(1); P[c] = 0; splat(c, -1); rank[c] = r; }
P.set(P0); E.set(E0);
for (let r = ones; r < N; r++) { const v = argmin(0); P[v] = 1; splat(v, 1); rank[v] = r; }
const bytes = Buffer.from(Array.from(rank, r => Math.floor(r * 256 / N)));
fs.writeFileSync(path.join(root, 'assets/bluenoise.js'), `(window.__ASSETS=window.__ASSETS||{}).BLUE_NOISE=${JSON.stringify({ size: S, method: 'void-and-cluster sigma 1.5 (tools/make-bluenoise.mjs)', base64: bytes.toString('base64') })};\n`);
const hist = new Array(8).fill(0); for (const b of bytes) hist[b >> 5]++;
console.log('bluenoise ok', hist.join(','));
