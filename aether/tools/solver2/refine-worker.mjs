// Worker thread of refine.mjs: runs its share of the per-cell kernels (collision, streaming) of one level on command.
// ctl (Int32Array on a SharedArrayBuffer): [0] command generation, [1] phase (0 collide, 1 stream, 2 macroscopic fields, 9 quit), [2] level index, [3] finished-worker count.
import { workerData } from 'node:worker_threads';
import { collideRange, streamRange, macroRange } from './refine-kernel.mjs';
const { K, levels, ctlBuf, rank, T } = workerData, ctl = new Int32Array(ctlBuf);
let seen = 0;
for (;;) {
  Atomics.wait(ctl, 0, seen); seen = Atomics.load(ctl, 0);
  const phase = Atomics.load(ctl, 1); if (phase === 9) break;
  const LV = levels[Atomics.load(ctl, 2)], n0 = Math.floor(LV.N * rank / T), n1 = Math.floor(LV.N * (rank + 1) / T);
  if (phase === 0) collideRange(K, LV, n0, n1); else if (phase === 2) macroRange(K, LV, n0, n1); else streamRange(K, LV, n0, n1);
  Atomics.add(ctl, 3, 1); Atomics.notify(ctl, 3);
}
