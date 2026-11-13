// Memory dump (EV-06): Chrome's memory-infra allocator breakdown per process (browser, renderer, GPU), at boot and after each of NP teleports
// along the highways (90 stepped frames at each). Shows where memory sits outside the JS heap: partition_alloc, malloc, gpu, v8, cc, skia.
// Usage: GAME_DIR=... NP=4 MIN_MB=30 node tests/tools/memdump.cjs   (writes tests/results/memdump.json too)
const fs = require('fs');
const path = require('path');
const { pw, GL_ARGS, NO_LOCK, gameUrl, GAME, freeze } = require('../lib.cjs');
const NP = +(process.env.NP || 2), MIN = +(process.env.MIN_MB || 30) * 1048576;
(async () => {
  const browser = await pw.chromium.launch({ args: GL_ARGS });
  const page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  await page.addInitScript(NO_LOCK);   // the game starts below: no pointer lock in headless (tests/lib.cjs)
  await page.goto((await gameUrl(GAME)) + '?q=1');
  await page.waitForSelector('#go.rdy', { timeout: 600000 }); await page.keyboard.press('KeyJ');
  await page.waitForFunction(() => window.__game && window.__game.running, null, { timeout: 60000 });
  await freeze(page);
  const bc = await browser.newBrowserCDPSession(), out = [];
  // one detailed dump: per process, the top-level allocators over MIN bytes, largest first
  const dump = async (label) => {
    const chunks = []; const on = (e) => chunks.push(...e.value); bc.on('Tracing.dataCollected', on);
    const done = new Promise((f) => bc.once('Tracing.tracingComplete', f));
    await bc.send('Tracing.start', { traceConfig: { includedCategories: ['disabled-by-default-memory-infra'], memoryDumpConfig: { triggers: [] } }, transferMode: 'ReportEvents' });
    await bc.send('Tracing.requestMemoryDump', { deterministic: false, levelOfDetail: 'detailed' });
    await bc.send('Tracing.end'); await done; bc.off('Tracing.dataCollected', on);
    const procName = {}; for (const e of chunks) if (e.ph === 'M' && e.name === 'process_name') procName[e.pid] = e.args.name;
    const heap = await page.evaluate(() => Math.round(performance.memory.usedJSHeapSize / 1048576));
    for (const e of chunks) {
      if (e.ph !== 'v' || !e.args?.dumps?.allocators) continue;
      const rows = [];
      for (const [k, v] of Object.entries(e.args.dumps.allocators)) { if (k.split('/').length > 2) continue; const sz = parseInt(v.attrs?.size?.value || '0', 16); if (sz > MIN) rows.push([k, Math.round(sz / 1048576)]); }
      rows.sort((a, b) => b[1] - a[1]);
      const rec = { label, process: procName[e.pid] || String(e.pid), jsHeapMB: heap, allocatorsMB: rows.slice(0, 16) }; out.push(rec);
      console.log(label.padEnd(8), rec.process.padEnd(10), JSON.stringify(rec.allocatorsMB));
    }
  };
  await dump('boot');
  await page.evaluate((NP) => { const g = window.__game; g.hurtPlayer = () => {}; g.eng.render = () => {}; window.__roads = g.highways.N.roads.filter((r) => r.kind !== 'arterial').filter((_, i) => i % 6 === 0).slice(0, Math.ceil(NP / 6) + 1); }, NP);
  for (let p = 0; p < NP; p++) {
    await page.evaluate(async (p) => {
      const r = window.__roads[Math.floor(p / 6) % window.__roads.length], k = (p % 6) + 1, n = r.x.length, i = Math.min(n - 2, Math.floor(n * k / 7));
      window.__test.teleport(r.x[i], r.z[i], r.y[i] + 1.5);
      for (let s = 0; s < 90; s++) { window.__upd(1 / 60); if (s % 2) await new Promise((f) => setTimeout(f, 0)); }
    }, p);
    await dump('probe' + p);
  }
  fs.mkdirSync(path.join(__dirname, '..', 'results'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'results', 'memdump.json'), JSON.stringify(out, null, 1));
  await browser.close();
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
