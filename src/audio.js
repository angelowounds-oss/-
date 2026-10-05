// Procedural WebAudio: rain, engine, weapons, impacts, sirens and a synthwave score.
export class Audio {
  constructor() {
    this.ctx = null; this.vol = 0.7; this.musicOn = true; this.intensity = 0;
    this.nextNote = 0; this.step = 0; this.started = false;
  }
  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = (this.ctx = new C());
    this.master = ctx.createGain(); this.master.gain.value = this.vol;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 1;
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 20000; this.lp.Q.value = 0.5; this.sfx.connect(this.lp); this.lp.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = this.musicOn ? 0.5 : 0; this.music.connect(this.master);
    // noise buffers
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.brownBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brownBuf.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    // rain bed
    this.rainG = [this.loopNoise(this.noiseBuf, 'highpass', 1800, 0.07, 0.6), this.loopNoise(this.noiseBuf, 'bandpass', 700, 0.035, 0.4), this.loopNoise(this.brownBuf, 'lowpass', 220, 0.22, 0.5)];
    // engine
    this.eng = {};
    const g = ctx.createGain(); g.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 3;
    const o1 = ctx.createOscillator(); o1.type = 'sawtooth'; const o2 = ctx.createOscillator(); o2.type = 'square';
    const o3 = ctx.createOscillator(); o3.type = 'sine';
    const g1 = ctx.createGain(); g1.gain.value = 0.5; const g2 = ctx.createGain(); g2.gain.value = 0.2; const g3 = ctx.createGain(); g3.gain.value = 0.6;
    o1.connect(g1).connect(lp); o2.connect(g2).connect(lp); o3.connect(g3).connect(lp); lp.connect(g); g.connect(this.sfx);
    o1.start(); o2.start(); o3.start();
    Object.assign(this.eng, { g, lp, o1, o2, o3 });
    // siren
    const sg = ctx.createGain(); sg.gain.value = 0; const so = ctx.createOscillator(); so.type = 'triangle'; so.frequency.value = 800;
    const sf = ctx.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 1200; sf.Q.value = 0.6;
    so.connect(sf).connect(sg).connect(this.sfx); so.start();
    this.siren = { g: sg, o: so };
    // tire squeal
    const tg = ctx.createGain(); tg.gain.value = 0; const tf = ctx.createBiquadFilter(); tf.type = 'bandpass'; tf.frequency.value = 1500; tf.Q.value = 4;
    const ts = ctx.createBufferSource(); ts.buffer = this.noiseBuf; ts.loop = true; ts.connect(tf).connect(tg).connect(this.sfx); ts.start();
    this.squeal = { g: tg, f: tf };
    this.started = true;
    this.nextNote = ctx.currentTime + 0.2;
  }
  loopNoise(buf, type, f, gain, q = 0.7) {
    const ctx = this.ctx; const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gain; s.connect(fl).connect(g).connect(this.sfx); s.start(); return g;
  }
  setIndoor(on) { if (!this.ctx) return; const t = this.ctx.currentTime; this.indoor = on; this.lp.frequency.setTargetAtTime(on ? 2600 : 20000, t, 0.12); (this.rainG || []).forEach((g, i) => g.gain.setTargetAtTime(on ? [0.07, 0.035, 0.22][i] * 0.12 : [0.07, 0.035, 0.22][i], t, 0.15)); }
  ding() { this.tone(1320, 0.7, 'sine', 0.16); this.tone(1760, 0.9, 'sine', 0.12, 0, null, 0.18); }
  elevator(dur) { if (!this.ctx) return; this.noiseShot(dur, 'lowpass', 140, 0.35, 0.5); this.tone(70, dur, 'sine', 0.2, 62); this.tone(990, 0.25, 'sine', 0.08, 0, null, 0.1); }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }
  setMusic(on) { this.musicOn = on; if (this.music) this.music.gain.setTargetAtTime(on ? 0.5 : 0, this.ctx.currentTime, 0.2); }
  noiseShot(dur, type, f, gain, q = 1, dest, delay = 0, fEnd = 0) {
    const ctx = this.ctx; if (!ctx) return;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const t0 = ctx.currentTime + delay;
    if (fEnd) fl.frequency.exponentialRampToValueAtTime(fEnd, t0 + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    s.connect(fl).connect(g).connect(dest || this.sfx); s.start(t0); s.stop(t0 + dur + 0.05);
  }
  tone(freq, dur, type, gain, endFreq, dest, delay = 0) {
    const ctx = this.ctx; if (!ctx) return;
    const o = ctx.createOscillator(); o.type = type; const t0 = ctx.currentTime + delay; o.frequency.setValueAtTime(freq, t0);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g).connect(dest || this.sfx); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  pan(p) { const s = this.ctx.createStereoPanner?.(); if (s) { s.pan.value = Math.max(-1, Math.min(1, p)); s.connect(this.sfx); return s; } return this.sfx; }
  gun(kind, vol = 1, pan = 0) {
    if (!this.ctx) return; const d = this.pan(pan); if (vol > 0.5) this.duckFor(0.9);
    if (kind === 'pistol') {
      this.noiseShot(0.22, 'bandpass', 2400, 0.7 * vol, 0.7, d, 0, 500);
      this.tone(160, 0.14, 'sine', 0.8 * vol, 40, d);
      this.noiseShot(0.9, 'lowpass', 900, 0.18 * vol, 0.5, d, 0.02, 200);
    } else if (kind === 'shotgun') {
      this.noiseShot(0.35, 'bandpass', 1500, 0.95 * vol, 0.5, d, 0, 300);
      this.tone(90, 0.28, 'sine', 1.0 * vol, 28, d);
      this.noiseShot(1.3, 'lowpass', 700, 0.3 * vol, 0.5, d, 0.03, 140);
    } else if (kind === 'sniper') {
      this.noiseShot(0.12, 'highpass', 2600, 0.8 * vol, 0.8, d);
      this.tone(70, 0.35, 'sine', 1.0 * vol, 24, d);
      this.noiseShot(2.2, 'lowpass', 1000, 0.3 * vol, 0.5, d, 0.04, 90);
      this.tone(1800, 0.5, 'sine', 0.05 * vol, 900, d, 0.1);
    } else if (kind === 'smg') {
      this.noiseShot(0.1, 'bandpass', 3800, 0.55 * vol, 0.9, d, 0, 1200);
      this.tone(200, 0.07, 'square', 0.4 * vol, 70, d);
      this.noiseShot(0.4, 'lowpass', 1400, 0.1 * vol, 0.5, d, 0.01, 350);
    } else {
      this.noiseShot(0.18, 'bandpass', 3200, 0.6 * vol, 0.6, d, 0, 700);
      this.tone(120, 0.12, 'sawtooth', 0.55 * vol, 35, d);
      this.noiseShot(0.7, 'lowpass', 1200, 0.15 * vol, 0.5, d, 0.02, 250);
    }
  }
  impact(vol = 1, pan = 0) { if (!this.ctx) return; const d = this.pan(pan); this.noiseShot(0.12, 'highpass', 3000, 0.35 * vol, 1, d); this.tone(1800, 0.06, 'square', 0.05 * vol, 600, d); }
  hitMarker() { this.tone(1400, 0.05, 'square', 0.08); this.tone(2100, 0.05, 'square', 0.06, 0, null, 0.04); }
  reload() { this.noiseShot(0.05, 'highpass', 2000, 0.3); this.tone(300, 0.06, 'square', 0.1, 150, null, 0.45); this.noiseShot(0.08, 'highpass', 1500, 0.35, 1, null, 0.9); }
  pump() { this.noiseShot(0.05, 'highpass', 1500, 0.3); this.tone(180, 0.06, 'square', 0.14, 90, null, 0.02); this.tone(240, 0.05, 'square', 0.12, 120, null, 0.2); this.noiseShot(0.06, 'highpass', 1800, 0.3, 1, null, 0.2); }
  bolt() { this.tone(500, 0.04, 'square', 0.12, 250); this.noiseShot(0.07, 'highpass', 2200, 0.25, 1, null, 0.04); this.tone(320, 0.05, 'square', 0.14, 160, null, 0.3); this.noiseShot(0.06, 'highpass', 2000, 0.28, 1, null, 0.3); }
  // per-weapon reload: magazine out, magazine in, slide/bolt
  reloadW(kind, dur = 1.5) {
    if (!this.ctx) return;
    if (kind === 'shotgun') { for (let i = 0; i < 4; i++) { this.tone(260, 0.05, 'square', 0.1, 140, null, 0.2 + i * dur * 0.17); this.noiseShot(0.04, 'highpass', 2500, 0.2, 1, null, 0.2 + i * dur * 0.17); } this.pump(); return; }
    this.noiseShot(0.05, 'highpass', 2000, 0.3); this.tone(300, 0.06, 'square', 0.1, 150, null, dur * 0.3);
    this.noiseShot(0.08, 'highpass', 1500, 0.3, 1, null, dur * 0.55); this.tone(200, 0.08, 'square', 0.14, 90, null, dur * 0.55);
    this.tone(420, 0.04, 'square', 0.12, 200, null, dur * 0.8); this.noiseShot(0.05, 'highpass', 2600, 0.25, 1, null, dur * 0.8);
  }
  // footsteps: soft (grass/carpet), hard (asphalt/tile/concrete); vol 0..1
  footstep(kind = 'hard', vol = 1, pan = 0) {
    if (!this.ctx) return; const d = this.pan(pan), v = vol * (0.85 + Math.random() * 0.3);
    if (kind === 'soft') this.noiseShot(0.09, 'lowpass', 500 + Math.random() * 200, 0.22 * v, 0.6, d);
    else { this.noiseShot(0.05, 'bandpass', 1600 + Math.random() * 500, 0.2 * v, 1.2, d); this.tone(110 + Math.random() * 30, 0.07, 'sine', 0.2 * v, 60, d); }
  }
  empty() { this.tone(900, 0.04, 'square', 0.08, 500); }
  explosion(vol = 1, pan = 0) { if (!this.ctx) return; const d = this.pan(pan); this.noiseShot(1.6, 'lowpass', 1400, 1.0 * vol, 0.5, d, 0, 60); this.tone(90, 1.2, 'sine', 1.1 * vol, 25, d); this.noiseShot(0.4, 'bandpass', 800, 0.6 * vol, 0.7, d, 0, 200); }
  crash(power = 1, pan = 0) { if (!this.ctx) return; const d = this.pan(pan); this.noiseShot(0.35 + power * 0.3, 'lowpass', 1800, 0.6 * power, 0.7, d, 0, 150); this.noiseShot(0.25, 'highpass', 2500, 0.3 * power, 2, d, 0.01); this.tone(80, 0.3, 'sine', 0.5 * power, 40, d); }
  glass(dist = 0) { if (!this.ctx) return; const v = Math.max(0.15, 1 - dist / 70); this.noiseShot(0.35, 'highpass', 4500, 0.5 * v, 1); for (let i = 0; i < 6; i++) this.tone(2400 + Math.random() * 3000, 0.25 + Math.random() * 0.3, 'sine', 0.05 * v, 0, null, Math.random() * 0.25); }
  horn() { this.tone(420, 0.5, 'sawtooth', 0.12); this.tone(530, 0.5, 'sawtooth', 0.1); }
  cash() { this.tone(1200, 0.1, 'sine', 0.18, 0); this.tone(1800, 0.2, 'sine', 0.16, 0, null, 0.08); }
  door() { this.noiseShot(0.12, 'lowpass', 600, 0.4); this.tone(120, 0.1, 'square', 0.2, 60, null, 0.1); }
  hurt() { this.tone(200, 0.2, 'sawtooth', 0.15, 90); }
  star() { this.tone(660, 0.12, 'square', 0.1); this.tone(880, 0.12, 'square', 0.1, 0, null, 0.12); this.tone(1320, 0.2, 'square', 0.1, 0, null, 0.24); }
  complete() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.14, 0, null, i * 0.1)); }
  // human voices: pitch per person (0.75..1.4), distance fade, panning; vibrato sawtooth through a vowel-ish bandpass
  voice(kind = 'scream', pan = 0, vol = 1, pitch = 1) {
    if (!this.ctx || vol < 0.03) return; const ctx = this.ctx, d = this.pan(pan), t0 = ctx.currentTime;
    const dur = kind === 'scream' ? 0.7 : kind === 'death' ? 0.9 : 0.35, f0 = (kind === 'death' ? 380 : 520) * pitch;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t0);
    o.frequency.linearRampToValueAtTime(kind === 'death' ? f0 * 0.5 : f0 * 1.35, t0 + dur * 0.4); o.frequency.linearRampToValueAtTime(f0 * (kind === 'scream' ? 0.8 : 0.5), t0 + dur);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 6 + Math.random() * 3; lg.gain.value = f0 * 0.03; lfo.connect(lg).connect(o.frequency);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900 * Math.sqrt(pitch); bp.Q.value = 2.5;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.001, t0); g.gain.linearRampToValueAtTime(0.2 * vol, t0 + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(bp).connect(g).connect(d); o.start(t0); lfo.start(t0); o.stop(t0 + dur + 0.05); lfo.stop(t0 + dur + 0.05);
  }
  scream(pan = 0, vol = 1, pitch = 1) { this.voice('scream', pan, vol, pitch); }
  duckFor(sec) { this.duckT = Math.max(this.duckT || 0, sec); }

  update(dt, s) {
    if (!this.started) return;
    const ctx = this.ctx, t = ctx.currentTime;
    // engine
    const e = this.eng;
    const on = s.inCar;
    const rpm = s.rpm; // 0..1
    const f = 38 + rpm * 120;
    e.o1.frequency.setTargetAtTime(f, t, 0.05); e.o2.frequency.setTargetAtTime(f * 0.5, t, 0.05); e.o3.frequency.setTargetAtTime(f * 0.25, t, 0.05);
    e.lp.frequency.setTargetAtTime(300 + rpm * 1600 + s.throttle * 500, t, 0.08);
    e.g.gain.setTargetAtTime(on ? 0.1 + s.throttle * 0.1 + rpm * 0.05 : 0, t, 0.1);
    this.squeal.g.gain.setTargetAtTime(on ? Math.min(1, s.slip) * 0.09 : 0, t, 0.05);
    this.squeal.f.frequency.setTargetAtTime(1100 + s.slip * 700, t, 0.1);
    // siren
    const sirenOn = s.siren > 0.01;
    this.siren.g.gain.setTargetAtTime(sirenOn ? 0.05 * s.siren : 0, t, 0.1);
    this.siren.o.frequency.setTargetAtTime(700 + Math.abs(Math.sin(t * 3.2)) * 600, t, 0.02);
    // music: duck under gunfire / explosions
    this.duckT = Math.max(0, (this.duckT || 0) - dt);
    if (this.musicOn) { this.music.gain.setTargetAtTime(0.5 * (1 - 0.6 * Math.min(1, this.duckT * 2)), t, 0.08); this.schedule(t); }
  }

  schedule(t) {
    const ctx = this.ctx, bpm = 104 + this.intensity * 14, sp = 60 / bpm / 4;
    while (this.nextNote < t + 0.25) {
      const n = this.nextNote, st = this.step;
      const bar = Math.floor(st / 16) % 8, s16 = st % 16;
      // progressions rotate every 8 bars (midi roots, low register): A-F-G-E, then a darker and a brighter variation
      const sets = [[45, 45, 41, 41, 43, 43, 40, 40], [45, 48, 43, 40, 45, 48, 41, 43], [41, 41, 45, 45, 40, 40, 43, 43]];
      const roots = this.intensity > 0.6 ? sets[1] : sets[Math.floor(st / 128) % sets.length];
      const root = roots[bar];
      const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
      // bass: off-beat 8ths
      if (s16 % 2 === 0 || s16 % 4 === 3) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(root + (s16 % 8 === 6 ? 12 : 0));
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900, n); f.frequency.exponentialRampToValueAtTime(180, n + sp * 1.8);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.22, n); g.gain.exponentialRampToValueAtTime(0.001, n + sp * 1.9);
        o.connect(f).connect(g).connect(this.music); o.start(n); o.stop(n + sp * 2);
      }
      // arpeggio
      const chord = [0, 7, 12, 15, 19, 15, 12, 7];
      if (s16 % 2 === 0 && (this.intensity > 0.2 || bar % 2 === 1)) {
        const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = hz(root + 24 + chord[(s16 / 2) % 8]);
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.045, n); g.gain.exponentialRampToValueAtTime(0.001, n + sp * 1.6);
        o.connect(f).connect(g).connect(this.music); o.start(n); o.stop(n + sp * 2);
      }
      // pad
      if (s16 === 0) {
        for (const iv of [0, 7, 15]) {
          const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(root + 24 + iv); o.detune.value = (Math.random() - 0.5) * 14;
          const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
          const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, n); g.gain.linearRampToValueAtTime(0.035, n + sp * 4); g.gain.linearRampToValueAtTime(0.0001, n + sp * 15.5);
          o.connect(f).connect(g).connect(this.music); o.start(n); o.stop(n + sp * 16);
        }
      }
      // drums
      if (s16 % 4 === 0) { // kick
        const o = ctx.createOscillator(); o.frequency.setValueAtTime(140, n); o.frequency.exponentialRampToValueAtTime(40, n + 0.12);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.5, n); g.gain.exponentialRampToValueAtTime(0.001, n + 0.22);
        o.connect(g).connect(this.music); o.start(n); o.stop(n + 0.25);
      }
      if (s16 === 4 || s16 === 12) { // snare
        const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.3, n); g.gain.exponentialRampToValueAtTime(0.001, n + 0.2);
        s.connect(f).connect(g).connect(this.music); s.start(n, Math.random()); s.stop(n + 0.22);
      }
      if (s16 % 2 === 1 || this.intensity > 0.5) { // hat
        const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.07, n); g.gain.exponentialRampToValueAtTime(0.001, n + 0.04);
        s.connect(f).connect(g).connect(this.music); s.start(n, Math.random()); s.stop(n + 0.05);
      }
      this.nextNote += sp; this.step++;
    }
  }
}
