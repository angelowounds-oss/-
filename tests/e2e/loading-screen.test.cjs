// smoke (UX-06): the "Purge Day" loading screen shows real progress, ends on the start prompt, and starting the game hides it (no layer
// left over the game). Fonts ship with the game (no request leaves the local server), the 40-segment bar is full at 100, portrait gets its own stage.
const { pw, GL_ARGS, gameUrl, result } = require('../lib.cjs');
(async () => {
  const browser = await pw.chromium.launch({ args: GL_ARGS });
  let pass = false, o = {};
  try {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const errors = [], reqs = [];
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
    const base = await gameUrl(), local = new URL(base).origin;
    page.on('request', (r) => { if (/^https?:/.test(r.url()) && new URL(r.url()).origin !== local) reqs.push(r.url()); });
    await page.goto(base + '?q=0');
    await page.waitForSelector('#pdP', { timeout: 30000 });
    o.segments = await page.evaluate(() => document.querySelectorAll('#loadBar div').length);
    await page.waitForSelector('#go.rdy', { timeout: 240000 });
    await page.waitForFunction(() => +document.getElementById('pdP').textContent >= 100, null, { timeout: 30000 });
    Object.assign(o, await page.evaluate(() => ({ p: document.getElementById('pdP').textContent, txt: document.getElementById('loadTxt').textContent, lit: document.querySelectorAll('#loadBar div.on').length, now: document.getElementById('loadBar').getAttribute('aria-valuenow'), fonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')).sort().join('|'), stage: [document.getElementById('pd').offsetWidth, document.getElementById('pd').offsetHeight] })));
    await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(300);
    o.portraitStage = await page.evaluate(() => [document.getElementById('pd').offsetWidth, document.getElementById('pd').offsetHeight]);
    await page.setViewportSize({ width: 960, height: 540 });
    await page.keyboard.press('KeyJ');
    await page.waitForFunction(() => window.__game && window.__game.running, null, { timeout: 30000 });
    // the title hides from a 1.3 s timer that a busy first frame can delay: wait for it instead of sleeping a fixed time
    o.titleHidden = await page.waitForFunction(() => getComputedStyle(document.getElementById('title')).display === 'none', null, { timeout: 8000 }).then(() => true, () => false);
    o.externalRequests = reqs.length; o.errors = errors.length;
    pass = o.segments === 40 && o.p === '100' && o.lit === 40 && o.now === '100' && /Anton/.test(o.fonts) && /Space Mono/.test(o.fonts) && o.stage[0] === 1280 && o.portraitStage[0] === 720 && o.titleHidden && o.externalRequests === 0 && o.errors === 0;
  } catch (e) { o.error = String(e && e.stack || e).slice(0, 400); }
  await browser.close();
  result('loading-screen', pass, o);
})();
