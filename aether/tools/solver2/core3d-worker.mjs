// Worker thread of core3d.mjs: waits for commands on the shared control block and runs its slab of every phase.
import { workerData } from 'node:worker_threads';
import { createCtx, runSteps } from './core3d-kernel.mjs';
const ctx = createCtx(workerData.sh, workerData.rank);
let seen = 0;
for (;;) {
  Atomics.wait(ctx.ctl, 0, seen); seen = Atomics.load(ctx.ctl, 0);
  if (Atomics.load(ctx.ctl, 2) === 1) break;
  runSteps(ctx, Atomics.load(ctx.ctl, 1));
}
