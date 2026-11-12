// Device performance overlay (EV-92). F3 shows it, Shift+F3 copies a snapshot (JSON) for docs/PERF-BASELINE.md §D: the player measures on their
// own machine and sends it, since the test container only has a software GPU. It shows, over the last ~2 s:
//   - frame time: average, 99th percentile, worst; and the main-thread work of the frame (Game.workMs)
//   - CPU per frame stage (Game.stage times each one while the overlay is on)
//   - GPU per render pass (EXT_disjoint_timer_query_webgl2, one query around every renderer.render call, labelled by the composer pass that
//     made it; results arrive a few frames late and are averaged per frame). Without the extension the line says so.
//   - draw calls and triangles of the whole frame (renderer.info summed over the passes), programs, geometries, textures
//   - JS heap and the collections seen (a drop of the heap between frames)
// Nothing is measured while it is off: the wrappers check `on` first and the timer queries are only made then.
const WINDOW = 2;   // seconds the averages cover

export class PerfOverlay {
  constructor(game) {
    this.game = game; this.on = false; this.el = null;
    const R = game.eng.renderer, gl = R.getContext();
    this.gl = gl; this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.frames = new Float32Array(600); this.fn = 0;      // frame times (ms), ring
    this.cpu = {}; this.gpu = {}; this.gpuFrames = 0;     // per-stage / per-pass sums over the window
    this.pending = []; this.free = []; this.label = null; this.active = null;
    this.gcs = 0; this.heap0 = 0; this.t = 0; this.n = 0; this.text = '';
    this.wrap(game.eng, R);
  }
  // hook the renderer once: each render() call is one GPU query; each composer pass names the calls it makes
  wrap(eng, R) {
    const self = this, render = R.render.bind(R);
    R.render = function (scene, camera) {
      if (!self.on) return render(scene, camera);
      const q = self.begin(); render(scene, camera); self.end(q);
    };
    const er = eng.render.bind(eng);
    eng.render = (dt) => { if (this.on) this.namePasses(eng.composer); return er(dt); };
  }
  // passes come and go with the quality tier (GTAO, SMAA): name each new one by wrapping its render
  namePasses(composer) {
    for (const p of composer.passes) {
      if (p.__perf) continue; p.__perf = true;
      const name = p.constructor.name.replace(/Pass$/, '') || 'pass', r = p.render.bind(p);
      p.render = (...a) => { const prev = this.label; this.label = name; try { r(...a); } finally { this.label = prev; } };
    }
  }
  // start a timer query for one render call (none when the extension is missing or a query is already running)
  begin() {
    if (!this.ext || this.active) return null;
    const gl = this.gl, q = this.free.pop() || gl.createQuery();
    gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q); this.active = q;
    return { q, label: this.label || 'Scene' };
  }
  // end it and keep it until the GPU has the answer
  end(rec) { if (!rec) return; this.gl.endQuery(this.ext.TIME_ELAPSED_EXT); this.active = null; this.pending.push(rec); }
  // read the queries that have finished; a disjoint event (GPU clock jump) throws the batch away
  collect() {
    const gl = this.gl, disjoint = this.ext && gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    let k = 0;
    for (; k < this.pending.length; k++) {
      const { q, label } = this.pending[k];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      if (!disjoint) this.gpu[label] = (this.gpu[label] || 0) + gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
      this.free.push(q);
    }
    if (k) this.pending.splice(0, k);
  }
  toggle(on = !this.on) {
    this.on = on;
    if (!this.el) { this.el = document.createElement('pre'); this.el.id = 'perfov'; document.body.appendChild(this.el); }
    this.el.style.display = on ? 'block' : 'none';
    const R = this.game.eng.renderer; R.info.autoReset = !on;   // while on, info sums every render call of the frame and frame() resets it
    this.reset(); this.gcs = 0;
  }
  reset() { this.cpu = {}; this.gpu = {}; this.gpuFrames = 0; this.fn = 0; this.n = 0; this.t = 0; this.callsSum = 0; this.trisSum = 0; this.workSum = 0; }
  // Game.stage reports each stage's time here
  stage(name, ms) { this.cpu[name] = (this.cpu[name] || 0) + ms; }
  // once per frame, after Game.update: record the frame and redraw the text twice a second
  frame(dt, workMs) {
    if (!this.on) return;
    const R = this.game.eng.renderer;
    this.frames[this.fn++ % this.frames.length] = dt * 1000; this.n++; this.t += dt; this.workSum += workMs;
    this.callsSum += R.info.render.calls; this.trisSum += R.info.render.triangles; R.info.reset();   // autoReset is off: info summed every pass of the frame
    if (this.ext) { this.collect(); this.gpuFrames++; }
    const mem = performance.memory, heap = mem ? mem.usedJSHeapSize : 0;
    if (mem && this.heap0 && heap < this.heap0 - 2097152) this.gcs++;
    this.heap0 = heap;
    if (this.t >= WINDOW) { this.text = this.report(); this.el.textContent = this.text; this.reset(); }
  }
  // the numbers of the window just ended, as an object (snapshot) and as text (overlay)
  stats() {
    const n = Math.min(this.fn, this.frames.length), f = Array.from(this.frames.subarray(0, n)).sort((a, b) => a - b), avg = f.reduce((s, x) => s + x, 0) / (n || 1);
    const per = (o, k) => Object.fromEntries(Object.entries(o).map(([a, v]) => [a, +(v / (k || 1)).toFixed(2)]).sort((a, b) => b[1] - a[1]));
    const R = this.game.eng.renderer, mem = performance.memory;
    return {
      fps: Math.round(1000 / (avg || 1)), frameMs: { avg: +avg.toFixed(1), p99: +(f[Math.floor(n * 0.99)] || 0).toFixed(1), max: +(f[n - 1] || 0).toFixed(1) },
      workMs: +(this.workSum / (this.n || 1)).toFixed(2), cpuMs: per(this.cpu, this.n),
      gpuMs: this.ext ? per(this.gpu, this.gpuFrames) : null, gpuTotalMs: this.ext ? +(Object.values(this.gpu).reduce((s, x) => s + x, 0) / (this.gpuFrames || 1)).toFixed(2) : null,
      drawCalls: Math.round(this.callsSum / (this.n || 1)), triangles: Math.round(this.trisSum / (this.n || 1)),
      programs: R.info.programs.length, geometries: R.info.memory.geometries, textures: R.info.memory.textures,
      heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null, gcSeen: this.gcs,
      tier: this.game.eng.q.name, scale: this.game.eng.scale, frames: this.n,
    };
  }
  report() {
    const s = this.stats(), line = (o) => Object.entries(o).slice(0, 7).map(([k, v]) => `  ${k.padEnd(10)} ${v.toFixed(2)}`).join('\n');
    this.last = s;
    return `${s.fps} fps · ${s.tier} ×${s.scale.toFixed(2)} · 프레임 평균 ${s.frameMs.avg} / 99% ${s.frameMs.p99} / 최악 ${s.frameMs.max} ms\n` +
      `CPU 작업 ${s.workMs} ms\n${line(s.cpuMs)}\n` +
      (s.gpuMs ? `GPU ${s.gpuTotalMs} ms\n${line(s.gpuMs)}\n` : 'GPU 시간: 이 브라우저는 타이머 쿼리를 지원하지 않음\n') +
      `드로우콜 ${s.drawCalls} · 삼각형 ${(s.triangles / 1e6).toFixed(2)}M · 프로그램 ${s.programs}\n지오메트리 ${s.geometries} · 텍스처 ${s.textures} · 힙 ${s.heapMB ?? '?'} MB · GC ${s.gcSeen}\nShift+F3: 기록 복사`;
  }
  // what the player sends for the baseline table: the last window's numbers, the machine and where they stood
  snapshot() {
    const gl = this.gl, dbg = gl.getExtension('WEBGL_debug_renderer_info'), g = this.game, f = g.vehicle || g.player;
    return {
      kind: 'perf-snapshot', v: 1, at: new Date().toISOString(), stats: this.last || this.stats(),
      device: { gpu: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), ua: navigator.userAgent, cores: navigator.hardwareConcurrency, memGB: navigator.deviceMemory ?? null,
        screen: [screen.width, screen.height], dpr: devicePixelRatio, canvas: [gl.drawingBufferWidth, gl.drawingBufferHeight] },
      place: { x: Math.round(f.x), y: Math.round(f.y || 0), z: Math.round(f.z), inVehicle: !!g.vehicle, hour: g.clock?.hour ?? null },
    };
  }
  // copy the snapshot to the clipboard (with a toast either way, so the player knows whether it worked)
  copy() {
    const s = JSON.stringify(this.snapshot());
    navigator.clipboard?.writeText(s).then(() => this.game.toast('성능 기록을 복사했습니다', '붙여 넣어 보내 주세요'), () => this.game.toast('복사하지 못했습니다', '브라우저가 클립보드를 막았습니다'));
    return s;
  }
}
