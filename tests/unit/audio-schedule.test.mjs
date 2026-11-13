// The synthwave score never schedules notes into the past (src/audio.js schedule): with the audio clock 60 s ahead of the next note (a background
// tab, a stalled frame, the headless browser's clock jumping) the scheduler skips to the present and makes only the notes of the next quarter second,
// not 1,900 nodes at once (which held 2.6 GB of Web Audio nodes until the next collection and killed the renderer, heap-gate 2026-11-12); the bar
// keeps its place. One-shot sounds are rationed to ONESHOT_MAX chains per 50 ms. Runs in node over a counting stand-in for the AudioContext.
import { Audio, ONESHOT_MAX } from '../../src/audio.js';

const bad = [], m = {};
const made = { osc: 0, src: 0, filt: 0, gain: 0 }, starts = [];
const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {} });
const node = (kind) => ({ kind, frequency: param(), detune: param(), gain: param(), Q: param(), pan: param(), connect(n) { return n; }, disconnect() {}, start(t) { starts.push(t ?? ctx.currentTime); }, stop() {} });
const ctx = { currentTime: 60, sampleRate: 48000, createOscillator: () => (made.osc++, node('osc')), createBufferSource: () => (made.src++, node('src')), createBiquadFilter: () => (made.filt++, node('filt')), createGain: () => (made.gain++, node('gain')), createStereoPanner: () => node('pan') };
const a = new Audio(); a.ctx = ctx; a.music = node('music'); a.sfx = node('sfx'); a.noiseBuf = {}; a.intensity = 0; a.started = true;

// 1. the clock ran 60 s past the next note: the scheduler catches up by skipping, not by playing
a.nextNote = 0; a.step = 0; a.schedule(ctx.currentTime);
const nodes = made.osc + made.src + made.filt + made.gain, sp = 60 / 104 / 4;
m.nodesAfterStall = nodes; m.stepAfterStall = a.step; m.earliestStart = +Math.min(...starts).toFixed(3);
if (nodes > 40) bad.push(['a stall made too many nodes', nodes]);
if (Math.min(...starts) < ctx.currentTime - 0.05) bad.push(['a note scheduled into the past', Math.min(...starts)]);
if (Math.abs(a.step - Math.ceil(60 / sp) - Math.round((a.nextNote - 60) / sp)) > 1) bad.push(['the bar lost its place', a.step]);
if (!(a.nextNote >= ctx.currentTime + 0.25)) bad.push(['not scheduled a quarter second ahead', a.nextNote]);
// 2. steady state: a frame later only the sixteenths that came due are added
const n0 = made.osc + made.src + made.filt + made.gain; ctx.currentTime += 1 / 60; a.schedule(ctx.currentTime);
m.nodesPerFrame = made.osc + made.src + made.filt + made.gain - n0; if (m.nodesPerFrame > 12) bad.push(['too many nodes in one frame', m.nodesPerFrame]);
// 3. one-shots are rationed within 50 ms
const o0 = made.osc; for (let i = 0; i < 200; i++) a.tone(440, 0.1, 'sine', 0.1);
m.tonesIn50ms = made.osc - o0; if (made.osc - o0 !== ONESHOT_MAX) bad.push(['one-shot budget', made.osc - o0, ONESHOT_MAX]);
const t0 = performance.now(); while (performance.now() - t0 < 60) { /* the window passes */ }
const o1 = made.osc; a.tone(440, 0.1, 'sine', 0.1); if (made.osc - o1 !== 1) bad.push(['the budget did not reset after the window']);
console.log('RESULT ' + JSON.stringify({ test: 'audio-schedule', pass: !bad.length, metrics: m, bad }));
process.exit(bad.length ? 1 : 0);
