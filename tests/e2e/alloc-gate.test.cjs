// Allocation gate (EV-93, the measure of EV-03): 1,500 frames walking a rectangle and 1,500 driving, with rendering stubbed (as frame-time), under
// V8's sampling heap profiler (CDP HeapProfiler, objects later collected included) and a trace of its collector. Per frame: the bytes allocated
// (the profile's sampled total), the bytes still there after a full collection (what survives: the promotion bound), and the collector's pauses
// (the main-thread mark-compact, V8.GCCompactor, and the scavenges). The ten largest allocation sites go to tests/results/alloc-gate.json,
// the list EV-03 works through. The harness's own collection every 30 steps (tests/lib.cjs) is held off while measuring, so every pause in the
// trace is V8's own; only a heap grown by 1 GB is collected by hand (counted, `forced`). The full collections the gate itself asks for, to read
// the heap before and after a phase, are marked in the trace and left out: a forced full collection is not incremental and stops the page for
// 0.4 s, which is not a pause the game ever takes (the old gate read V8.GCFinalizeMC, which this Chromium no longer emits, so it read nothing).
// The AC (docs/AAA-DIRECTIVE-2026-11-12.md EV-03): <= 200 KB/frame allocated, <= 10 KB/frame promoted, major GC final pause <= 8 ms. The gate's
// limits start at today's values and are lowered with EV-03 (ALLOC_KB / KEEP_KB / PAUSE_MS override them).
const fs = require('fs');
const path = require('path');
const { run, freeze, result } = require('../lib.cjs');
const ALLOC_KB = +(process.env.ALLOC_KB || 750), KEEP_KB = +(process.env.KEEP_KB || 100), PAUSE_MS = +(process.env.PAUSE_MS || 150), FRAMES = +(process.env.FRAMES || 1500);
run('alloc-gate', { q: 1, width: 320, height: 180 }, async ({ page }) => {
  await freeze(page);
  const cdp = await page.context().newCDPSession(page);
  // the collector's trace events, kept as they stream in (only the GC ones: the rest of the trace is dropped at once)
  const gcEv = [], marks = []; cdp.on('Tracing.dataCollected', (d) => { for (const e of d.value) { if (e.ph === 'X' && /GC|Scaveng|MarkCompact/.test(e.name)) gcEv.push({ name: e.name, ts: e.ts, dur: e.dur || 0 }); else if (/^gate-(gc|run)-[ab]$/.test(e.name)) marks.push({ name: e.name, ts: e.ts }); } });
  const done = new Promise((f) => cdp.once('Tracing.tracingComplete', f));
  // one walk or drive of FRAMES steps inside the page; returns its frame times and heap readings
  const phase = async (kind) => page.evaluate(async ({ kind, FRAMES }) => {
    const g = window.__game, pl = g.player, upd = window.__upd, mb = () => performance.memory.usedJSHeapSize;
    const gc0 = window.gc; let forced = 0; const start = mb();
    // the gate's own full collection, marked so its pause is left out of the game's
    const hgc = () => { performance.mark('gate-gc-a'); gc0(); performance.mark('gate-gc-b'); };
    hgc(); const base = mb();
    window.gc = () => { if (mb() - start > 1 << 30) { hgc(); forced++; } };   // the harness's collections held off (see the header)
    const fr = []; performance.mark('gate-run-a');
    if (kind === 'walk') {
      const wp = [[0, 1], [1, 0], [0, -1], [-1, 0]]; let dir = 0, x = pl.x, z = pl.z;
      for (let i = 0; i < FRAMES; i++) { if (i % 300 === 0) dir = (dir + 1) % 4; x += wp[dir][0] * 7 / 60; z += wp[dir][1] * 7 / 60; pl.body3.teleport(x, pl.y, z); pl.x = x; pl.z = z; const t = performance.now(); upd(1 / 60); fr.push(performance.now() - t); if (i % 50 === 49) await new Promise((r) => setTimeout(r, 0)); }
    } else {
      for (let i = 0; i < FRAMES; i++) { g.input.keys.add('KeyW'); if (i % 240 < 20) g.input.keys.add('KeyD'); else g.input.keys.delete('KeyD'); const t = performance.now(); upd(1 / 60); fr.push(performance.now() - t); if (i % 50 === 49) await new Promise((r) => setTimeout(r, 0)); }
      g.input.keys.delete('KeyW'); g.input.keys.delete('KeyD');
    }
    performance.mark('gate-run-b'); window.gc = gc0; hgc(); const keep = mb() - base;
    const s = fr.slice().sort((a, b) => a - b);
    return { frames: FRAMES, keepKBPerFrame: +(keep / 1024 / FRAMES).toFixed(1), forced, medianMs: +s[s.length >> 1].toFixed(1), maxMs: +s[s.length - 1].toFixed(1) };
  }, { kind, FRAMES });
  // the profile's samples, summed per allocation site (function, file:line), and the total
  const sites = (profile) => {
    const by = new Map(); let total = 0;
    // a builtin (no script: Math.hypot, an iterator's next) is named with the script function that called it, which is where the fix goes
    const name = (cf) => `${cf.functionName || '(anon)'} ${cf.url.replace(/^.*\//, '')}:${cf.lineNumber + 1}`;
    const walk = (n, up) => { const cf = n.callFrame, key = cf.url || !up ? name(cf) : `${name(cf)} < ${up}`; if (n.selfSize) { by.set(key, (by.get(key) || 0) + n.selfSize); total += n.selfSize; } for (const c of n.children || []) walk(c, cf.url ? name(cf) : up); };
    walk(profile.head);
    return { total, top: [...by].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([k, b]) => ({ site: k, MB: +(b / 1048576).toFixed(1) })) };
  };
  // the start: a walkable street spot (frame-time's start: where the game put the player) and a car near it for the drive
  await page.evaluate(() => { const g = window.__game; g.eng.render = () => {}; g.sandbox.on = true; g.sandbox.god = true; });
  await cdp.send('HeapProfiler.enable');
  await cdp.send('Tracing.start', { categories: '-*,v8,disabled-by-default-v8.gc,blink.user_timing', transferMode: 'ReportEvents' });
  const out = {};
  for (const kind of ['walk', 'drive']) {
    if (kind === 'drive') await page.evaluate(() => {
      const g = window.__game, pl = g.player, upd = window.__upd;
      const v = g.vehicles.filter((q) => !q.dead && !q.spec.craft).sort((a, b) => Math.hypot(a.x - pl.x, a.z - pl.z) - Math.hypot(b.x - pl.x, b.z - pl.z))[0];
      pl.body3.teleport(v.x + 2.5, pl.y, v.z); pl.x = v.x + 2.5; pl.z = v.z; for (let i = 0; i < 5; i++) upd(1 / 60); g.enterVehicle(v);
    });
    await cdp.send('HeapProfiler.startSampling', { samplingInterval: 16384, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
    const r = await phase(kind);
    const { profile } = await cdp.send('HeapProfiler.stopSampling');
    const S = sites(profile);
    r.allocKBPerFrame = +(S.total / 1024 / FRAMES).toFixed(1); r.top = S.top;
    out[kind] = r;
  }
  await cdp.send('Tracing.end'); await done;
  // the collector's pauses over both phases (the trace events stream in late, so they are not split by phase), without the gate's own collections
  // ... and only those inside a phase's frames (the profiler's own start and stop, and the setup between phases, collect too)
  const pairs = (n) => { const m = marks.filter((q) => q.name.startsWith(`gate-${n}-`)), w = []; for (let i = 0; i < m.length; i++) if (m[i].name.endsWith('-a') && m[i + 1]?.name.endsWith('-b')) w.push([m[i].ts, m[i + 1].ts]); return w; };
  marks.sort((a, b) => a.ts - b.ts); const win = pairs('gc'), runs = pairs('run'), inside = (w, e) => w.some(([a, b]) => e.ts >= a && e.ts <= b);
  const own = gcEv.filter((e) => !inside(win, e) && inside(runs, e));
  const outside = gcEv.filter((e) => e.name === 'V8.GCCompactor' && !inside(win, e) && !inside(runs, e)).map((e) => +(e.dur / 1000).toFixed(1));
  const by = {}; for (const e of own) { const b = (by[e.name] = by[e.name] || { n: 0, maxMs: 0, sumMs: 0 }); b.n++; b.maxMs = Math.max(b.maxMs, e.dur / 1000); b.sumMs += e.dur / 1000; }
  for (const b of Object.values(by)) { b.maxMs = +b.maxMs.toFixed(1); b.sumMs = +b.sumMs.toFixed(0); }
  const fin = by['V8.GCCompactor'] || by['V8.GCFinalizeMC'] || null, sc = by['V8.GCScavenger'] || null;
  if (!win.length) throw new Error('the gate\'s collection marks are missing from the trace');
  const o = { walk: out.walk, drive: out.drive, gc: by, majorFinalMaxMs: fin ? fin.maxMs : 0, majorN: fin ? fin.n : 0, scavengeMaxMs: sc ? sc.maxMs : 0, gateCollections: win.length, majorOutsideMs: outside };
  fs.mkdirSync(path.join(__dirname, '..', 'results'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '..', 'results', 'alloc-gate.json'), JSON.stringify(o, null, 1));
  const bad = [];
  for (const k of ['walk', 'drive']) {
    if (o[k].allocKBPerFrame > ALLOC_KB) bad.push(`${k}: ${o[k].allocKBPerFrame} KB/frame allocated > ${ALLOC_KB}`);
    if (o[k].keepKBPerFrame > KEEP_KB) bad.push(`${k}: ${o[k].keepKBPerFrame} KB/frame kept > ${KEEP_KB}`);
  }
  if (o.majorFinalMaxMs > PAUSE_MS) bad.push(`major GC final pause ${o.majorFinalMaxMs} ms > ${PAUSE_MS}`);
  // the top sites in the printed result too, short, so a run's log shows where to cut
  const short = (r) => ({ ...r, top: r.top.slice(0, 10).map((t) => `${t.MB} MB ${t.site}`) });
  result('alloc-gate', bad.length === 0, { walk: short(o.walk), drive: short(o.drive), majorFinalMaxMs: o.majorFinalMaxMs, majorN: o.majorN, scavengeMaxMs: o.scavengeMaxMs, gateCollections: o.gateCollections, majorOutsideMs: o.majorOutsideMs, gc: o.gc, limits: { ALLOC_KB, KEEP_KB, PAUSE_MS, FRAMES } }, bad.join(' | '));
});
