/* global __CINE, WheelEvent */
// Which code is never executed in a realistic session? V8 precise coverage over: load, enter, cinematic, dock buttons, walk, engineer panel.
// node tests/coverage.mjs [hash=#q=LITE] [steps=100]     -> tests/out/coverage.json + summary on stdout
import path from 'node:path'; import fs from 'node:fs';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { CHROME, sleep } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [hash = '#q=LITE', steps = '100'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox', '--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = []; page.on('pageerror', e => errs.push(String(e).slice(0, 200)));
await page.route('**/*', r => /^(file|data|blob):/.test(r.request().url()) ? r.continue() : r.abort());
await page.coverage.startJSCoverage({ resetOnNavigation: false });
const step = async (name, fn) => { try { await fn(); console.log('ok  ', name); } catch (e) { console.log('FAIL', name, String(e).slice(0, 160)); } };
await page.goto('file://' + path.join(root, 'dist/aether.html') + hash, { timeout: 240000 });
await step('load', () => page.waitForSelector('#scGo', { timeout: 240000 }));
await step('start live', async () => { await page.evaluate(() => document.querySelector('.viewport').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))); await page.waitForFunction(() => window.__LIVE && window.__LIVE.ok && window.__PERF?.cal?.done, null, { timeout: 300000 }); await page.evaluate(n => { __LIVE.api.run(n, 0.02); }, +steps); await page.waitForFunction(() => document.getElementById('scGo').classList.contains('rdy'), null, { timeout: 300000 }); });
await step('enter + cinematic', async () => { await page.evaluate(() => document.getElementById('scGo').click()); await page.waitForFunction(() => __CINE.state === 'PLAYING', null, { timeout: 300000 }); await page.evaluate(() => { __LIVE.freeze = true; __AETHER_DEBUG.renderOnce(); window.__vt = { ms: performance.now() + 500 }; for (let i = 0; i < 60 * 31; i++) { window.__vt.ms += 1000 / 60; __CINE.tick(window.__vt.ms); if (i % 450 === 0) __AETHER_DEBUG.renderOnce(); } }); });
const click = id => page.evaluate(id => { const e = document.getElementById(id); if (e && !e.disabled) e.click(); }, id);
const render = (n = 2) => page.evaluate(n => { for (let i = 0; i < n; i++) __AETHER_DEBUG.renderOnce(); }, n);
await step('orbit/zoom', async () => { await page.evaluate(() => { const cv = document.getElementById('view'); cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 3, clientX: 100, clientY: 100 })); cv.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 3, clientX: 160, clientY: 120 })); cv.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 3 })); cv.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true })); }); await render(); });
for (const id of ['scHero', 'scOut', 'scMore', 'scMode', 'scFlow', 'scCol', 'scCol', 'scMode', 'scMore', 'scFlow']) await step('dock ' + id, async () => { await click(id); await render(1); });
for (const v of ['Side', 'Top', 'Fan', 'Control', 'Outlet', 'Hero']) await step('preset ' + v, async () => { await page.evaluate(v => document.querySelector('[data-camera="' + v + '"]')?.click(), v); await render(1); });
await step('cutaway/road section', async () => { await click('cutaway'); await render(1); await click('roadSection'); await render(1); await click('roadSection'); await click('cutaway'); });
await step('door/walk/body', async () => { await click('scDoor'); await render(1); await page.keyboard.down('KeyW'); await render(2); await page.keyboard.up('KeyW'); await click('bdOut'); await render(1); await click('bdBack'); await render(1); await click('bdSnd'); await click('bdSnd'); await click('qualityMode'); await click('swayMode'); await click('walkMode'); await render(1); });
await step('engineer panel (UI only)', async () => { await click('scEng'); for (const id of ['m14FanToggle', 'm14RoadToggle', 'm14Estop', 'm14ResetEstop', 'streamPlayback', 'smokeDiagnosticsToggle', 'smokePlayback', 'smokePlayback']) await click(id); await page.evaluate(() => { for (const id of ['qAll', 'qScale', 'qVol', 'qRen']) { const s = document.getElementById(id); if (s && s.options.length > 2) { s.selectedIndex = 2; s.dispatchEvent(new Event('change', { bubbles: true })); } } }); await render(1); await click('scEng'); });
await step('s1/s2 buttons', async () => { await click('s1Verify'); await sleep(1500); await click('s2Inspect'); await sleep(2500); });
const cov = await page.coverage.stopJSCoverage();
fs.writeFileSync(path.join(root, 'tests/out/coverage.raw.json'), JSON.stringify(cov.map(c => ({ url: c.url, len: c.source?.length, functions: c.functions }))));
// ---- analysis: per-byte used mask, mapped to src files
const eng = cov.find(c => c.source && c.source.startsWith("(()=>{'use strict'; const now="));
const files = fs.readdirSync(path.join(root, 'src/engine')).filter(f => f.endsWith('.js')).sort();
let off = eng.source.indexOf(fs.readFileSync(path.join(root, 'src/engine', files[0]), 'utf8').slice(0, 80)); const spans = [];
for (const f of files) { const t = fs.readFileSync(path.join(root, 'src/engine', f), 'utf8'); spans.push({ f, a: off, b: off + t.length }); off += t.length; }
const used = new Uint8Array(eng.source.length); // 1 = executed
const ranges = eng.functions.flatMap(fn => fn.ranges).sort((x, y) => x.startOffset - y.startOffset || y.endOffset - x.endOffset);
for (const r of ranges) used.fill(r.count > 0 ? 1 : 0, r.startOffset, r.endOffset);
const per = spans.map(s => { let u = 0; for (let i = s.a; i < s.b; i++) u += used[i]; return { file: s.f, bytes: s.b - s.a, executed: u, pct: +(100 * u / (s.b - s.a)).toFixed(1) }; });
console.table(per);
// uncovered named functions (whole function never ran), biggest first
const dead = eng.functions.filter(fn => fn.functionName && fn.ranges[0].count === 0 && fn.ranges[0].endOffset - fn.ranges[0].startOffset > 400).map(fn => { const r = fn.ranges[0], sp = spans.find(s => r.startOffset >= s.a && r.startOffset < s.b); return { name: fn.functionName, file: sp?.f, bytes: r.endOffset - r.startOffset }; }).sort((a, b) => b.bytes - a.bytes);
fs.writeFileSync(path.join(root, 'tests/out/coverage.json'), JSON.stringify({ per, dead: dead.slice(0, 80), errors: errs }, null, 1));
console.log('never-executed named functions > 400 B:', dead.length, 'total', dead.reduce((a, b) => a + b.bytes, 0));
for (const d of dead.slice(0, 40)) console.log(String(d.bytes).padStart(7), d.file, d.name);
console.log('page errors', errs.slice(0, 3));
await browser.close();
