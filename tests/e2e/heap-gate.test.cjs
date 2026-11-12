// Heap and boot gates (EV-93): after boot, the page's JS heap after a full collection and the time of that collection, and the boot stages'
// times (performance marks 'boot:*' from main.js, recorded, not gated yet); then 600 stepped frames in place, the heap growth and the collections they needed (alloc). The limits are lowered phase by
// phase (docs/AAA-DIRECTIVE-2026-11-12.md: boot heap <= 900 MB and gc() <= 150 ms by the end of Phase 0); HEAP_MAX / GC_MAX override them.
const fs = require('fs');
const path = require('path');
const { run, freeze, result } = require('../lib.cjs');
const HEAP_MAX = +(process.env.HEAP_MAX || 3200), GC_MAX = +(process.env.GC_MAX || 800), GROW_MAX = +(process.env.GROW_MAX || 400);
run('heap-gate', { q: 1, width: 320, height: 180 }, async ({ page }) => {
  const boot = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0], marks = Object.fromEntries(performance.getEntriesByType('mark').filter((m) => m.name.startsWith('boot:')).map((m) => [m.name.slice(5), Math.round(m.startTime)]));
    return { domMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null, readyMs: Math.round(performance.now()), marks };
  });
  await freeze(page);
  const o = await page.evaluate(async () => {
    const T = window.__test, mb = () => Math.round(performance.memory.usedJSHeapSize / 1048576);
    const gcMs = []; for (let i = 0; i < 3; i++) { const t = performance.now(); window.gc(); gcMs.push(Math.round(performance.now() - t)); }
    const heapMB = mb(), g0 = window.__gcCount;
    // the harness's GC policy (tests/lib.cjs: every 30 steps) inside the loop: a heap this size reaches V8's limit before its own collector runs
    let gcIn = 0;
    for (let i = 0; i < 600; i++) { T.step(1); if (i % 30 === 29) { const t = performance.now(); window.gc(); gcIn = Math.max(gcIn, performance.now() - t); } if (i % 2) await new Promise((f) => setTimeout(f, 0)); }
    window.gc(); const after = mb();
    return { heapMB, gcMs, gcBest: Math.min(...gcMs), steps: 600, heapAfterMB: after, growMB: after - heapMB, gcsInSteps: window.__gcCount - g0, gcInStepsMaxMs: Math.round(gcIn), m: T.measure() };
  });
  const out = { ...o, boot };
  fs.mkdirSync(path.join(__dirname, '..', 'results'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'results', 'heap-gate.json'), JSON.stringify(out, null, 1));
  const bad = [];
  if (o.heapMB > HEAP_MAX) bad.push(`boot heap ${o.heapMB} MB > ${HEAP_MAX}`);
  if (o.gcBest > GC_MAX) bad.push(`gc ${o.gcBest} ms > ${GC_MAX}`);
  if (o.growMB > GROW_MAX) bad.push(`grew ${o.growMB} MB in 600 frames > ${GROW_MAX}`);
  result('heap-gate', bad.length === 0, { ...out, limits: { HEAP_MAX, GC_MAX, GROW_MAX } }, bad.join(' | '));
});
