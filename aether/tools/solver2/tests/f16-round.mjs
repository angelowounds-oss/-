#!/usr/bin/env node
// Checks f16r (the binary16 store emulation in core3d-kernel.mjs) against a slow exact reference:
// every finite half value, every midpoint between neighbouring halves (ties to even), and random float32 values over the whole exponent range.
import { f16r, f16cr, roundSig } from '../core3d-kernel.mjs';
const f32 = x => Math.fround(x);
// exact reference: x is a float32 value (exact in double); round to the nearest binary16, ties to even
function ref(x) {
  if (x === 0 || !Number.isFinite(x)) return x;
  const a = Math.abs(x), s = x < 0 ? -1 : 1;
  let e = Math.floor(Math.log2(a)); if (2 ** e > a) e--; if (2 ** (e + 1) <= a) e++;
  const ulp = 2 ** (Math.max(e, -14) - 10), m = a / ulp; let r = Math.floor(m); const fr = m - r;
  if (fr > .5 || (fr === .5 && r % 2 === 1)) r++;
  const y = r * ulp; return y > 65504 ? s * Infinity : s * y;
}
const halves = []; // all non-negative finite halves: subnormals m * 2^-24, normals (1 + m/1024) * 2^e for e = -14..15
for (let m = 0; m < 1024; m++) halves.push(m * 2 ** -24);
for (let e = -14; e <= 15; e++) for (let m = 0; m < 1024; m++) halves.push((1 + m / 1024) * 2 ** e);
const uniq = [...new Set(halves)].sort((a, b) => a - b);
let n = 0, bad = 0; const fails = [];
const check = x => { n++; const a = f16r(x), b = ref(x); if (!(a === b || (Number.isNaN(a) && Number.isNaN(b)))) { bad++; if (fails.length < 8) fails.push({ x, got: a, want: b }); } };
for (const h of uniq) { check(h); check(-h); }
for (let i = 0; i + 1 < uniq.length; i++) { const mid = f32((uniq[i] + uniq[i + 1]) / 2); if (mid > uniq[i] && mid < uniq[i + 1]) { check(mid); check(-mid); check(f32(mid * (1 + 2 ** -20))); } }
check(65504); check(65519); check(65520); check(70000); check(1e-9); check(-1e-9); check(6.0e-8); check(2.9e-8); check(3.0e-8);
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
for (let i = 0; i < 400000; i++) { const x = f32((rnd() < .5 ? -1 : 1) * 2 ** (rnd() * 46 - 30) * (1 + rnd())); check(x); }
// the 12-bit-significand variant (f16c storage) against the generic exact rounding
let nc = 0, badc = 0; const failc = [];
for (let i = 0; i < 400000; i++) { const x = f32((rnd() < .5 ? -1 : 1) * 2 ** (rnd() * 40 - 30) * (1 + rnd())); nc++; const a = f16cr(x), b = roundSig(x, 11, -14); if (a !== b) { badc++; if (failc.length < 8) failc.push({ x, got: a, want: b }); } }
for (let m = 0; m < 4096; m++) { const x = f32((1 + (m + .5) / 2048) * 2 ** -3); nc++; if (f16cr(x) !== roundSig(x, 11, -14)) badc++; } // exact ties
console.log(JSON.stringify({ checked: n, mismatches: bad, halves: uniq.length, fails, f16c: { checked: nc, mismatches: badc, fails: failc } }));
process.exit(bad || badc ? 1 : 0);
