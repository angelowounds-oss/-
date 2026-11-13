// Boot gate (EV-93): how long the page takes from navigation to a playable game, by stage (performance marks 'boot:*' from main.js), and what it
// fetched on the way (resource timing: bytes over the wire and the largest files). The limits are lowered phase by phase (EV-07: <= 15 s to the
// title on a real device by Phase 2; this container's software GPU and shared CPU are slower, so the container limit is its own); BOOT_MAX /
// STAGE_MAX override them. Every stage mark must be there: a missing one means a stage was skipped or renamed and the gate would read nothing.
const fs = require('fs');
const path = require('path');
const { run, result } = require('../lib.cjs');
const BOOT_MAX = +(process.env.BOOT_MAX || 60000), STAGE_MAX = +(process.env.STAGE_MAX || 20000);
const STAGES = ['preload', 'engine', 'baked', 'world-data', 'game', 'ready'];   // 'region' only on a build with compiled regions
run('boot-gate', { q: 1, width: 320, height: 180 }, async ({ page }) => {
  const o = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const marks = Object.fromEntries(performance.getEntriesByType('mark').filter((m) => m.name.startsWith('boot:')).map((m) => [m.name.slice(5), Math.round(m.startTime)]));
    const res = performance.getEntriesByType('resource'), MB = (b) => +(b / 1048576).toFixed(1);
    const big = res.map((r) => ({ name: r.name.replace(location.origin, ''), mb: MB(r.transferSize || r.encodedBodySize || 0), ms: Math.round(r.duration) })).sort((a, b) => b.mb - a.mb).slice(0, 8);
    return { domMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null, marks, requests: res.length, wireMB: MB(res.reduce((s, r) => s + (r.transferSize || 0), 0)), bodyMB: MB(res.reduce((s, r) => s + (r.encodedBodySize || 0), 0)), big };
  });
  // each stage's own time: from the mark before it (navigation start for the first)
  const order = Object.entries(o.marks).sort((a, b) => a[1] - b[1]); o.stageMs = {};
  order.forEach(([k, t], i) => { o.stageMs[k] = t - (i ? order[i - 1][1] : 0); });
  o.readyMs = o.marks.ready ?? null;
  fs.mkdirSync(path.join(__dirname, '..', 'results'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'results', 'boot-gate.json'), JSON.stringify(o, null, 1));
  const bad = [];
  for (const s of STAGES) if (o.marks[s] == null) bad.push(`no boot:${s} mark`);
  if (o.readyMs != null && o.readyMs > BOOT_MAX) bad.push(`ready at ${o.readyMs} ms > ${BOOT_MAX}`);
  for (const [k, ms] of Object.entries(o.stageMs)) if (ms > STAGE_MAX) bad.push(`stage ${k} ${ms} ms > ${STAGE_MAX}`);
  result('boot-gate', bad.length === 0, { ...o, limits: { BOOT_MAX, STAGE_MAX } }, bad.join(' | '));
});
