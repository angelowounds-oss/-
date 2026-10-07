// Usage: node tests/interactive.js http://localhost:8800/
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8800/';
let pass = 0, fail = 0;
const ok = (cond, name, detail) => { if (cond) pass++; else { fail++; console.log('FAIL', name, detail === undefined ? '' : '-> ' + JSON.stringify(detail)); } };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  const mk = async (opts = {}) => { const c = await b.newContext({ locale: 'ko-KR', timezoneId: 'Asia/Seoul', viewport: { width: 420, height: 900 }, ...opts }); return c; };
  const open = async (ctx, slug, time = '2026-10-07T12:00:00+09:00') => { const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.clock.install({ time: new Date(time) }); await p.goto(BASE + slug + '.html'); return p; };
  const txt = async (p, sel) => (await p.locator(sel).innerText()).replace(/\s+/g, ' ').trim();

  // ---------- ladder: every start maps to a distinct end ----------
  {
    const ctx = await mk(); const p = await open(ctx, 'ladder');
    for (const n of [2, 3, 5, 8]) {
      const names = Array.from({ length: n }, (_, i) => 'N' + (i + 1)), prizes = Array.from({ length: n }, (_, i) => 'P' + (i + 1));
      await p.fill('#names', names.join('\n')); await p.fill('#prizes', prizes.join('\n'));
      let bad = 0;
      for (let k = 0; k < 25; k++) {
        await p.click('#newlad'); await p.click('#showall');
        const lines = (await p.locator('#res').innerText()).split('\n').map(s => s.trim()).filter(Boolean);
        const ends = lines.map(l => l.split('→')[1].trim());
        if (lines.length !== n || new Set(ends).size !== n) bad++;
      }
      ok(bad === 0, `ladder permutation n=${n}`, bad);
    }
    await p.fill('#names', 'A\nB\nC\nD\nE\nF\nG\nH\nI\nJ'); await p.click('#showall');
    ok((await p.locator('#who button').count()) === 8, 'ladder caps names at 8', await p.locator('#who button').count());
    await p.fill('#names', 'Solo'); ok((await txt(p, '#res')).includes('2명 이상'), 'ladder single name message', await txt(p, '#res'));
    await p.fill('#names', 'A\nB\nC'); await p.fill('#prizes', 'only'); await p.click('#showall');
    ok((await txt(p, '#res')).includes('통과'), 'ladder fills missing prizes', await txt(p, '#res'));
    await p.fill('#names', '<b>x</b>\nB'); await p.click('#showall');
    ok((await p.locator('#res b').count()) <= 2 && !(await p.locator('#res').innerHTML()).includes('<b>x</b>'), 'ladder escapes html');
    ok(p.errs.length === 0, 'ladder js errors', p.errs); await ctx.close();
  }

  // ---------- roulette ----------
  {
    const ctx = await mk({ reducedMotion: 'reduce' }); const p = await open(ctx, 'roulette');
    const COL = ['#ffe14d', '#7ee0ff', '#ff9ec7', '#b9f27a', '#cdb8ff', '#ffb86b', '#7fe3c9', '#9db8ff'].map(h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)));
    let mism = 0, runs = 0;
    for (const n of [2, 3, 7, 12, 20]) {
      const opts = Array.from({ length: n }, (_, i) => 'M' + (i + 1));
      await p.fill('#opts', opts.join('\n'));
      for (let k = 0; k < 6; k++) {
        await p.click('#spin'); await p.waitForFunction(() => document.getElementById('res').textContent.includes('당첨'), null, { timeout: 4000 });
        const win = (await txt(p, '#res')).replace(' 당첨!', '').trim(); const idx = opts.indexOf(win);
        const px = await p.evaluate(() => { const c = document.getElementById('wheel'), x = c.getContext('2d'), d = x.getImageData(c.width / 2 + 10, 30, 1, 1).data; return [d[0], d[1], d[2]]; });
        runs++; if (idx < 0 || JSON.stringify(px) !== JSON.stringify(COL[idx % 8])) mism++;
      }
    }
    ok(mism === 0, `roulette result matches pointer (${runs} spins)`, mism);
    await p.fill('#opts', 'only one'); await p.click('#spin'); ok((await txt(p, '#res')).includes('2개 이상'), 'roulette needs 2+', await txt(p, '#res'));
    await p.fill('#opts', ''); await p.click('#spin'); ok((await txt(p, '#res')).includes('2개 이상'), 'roulette empty');
    await p.fill('#opts', Array.from({ length: 30 }, (_, i) => 'X' + i).join('\n')); await p.click('#spin'); await p.waitForFunction(() => document.getElementById('res').textContent.includes('당첨'));
    const w = (await txt(p, '#res')).replace(' 당첨!', ''); ok(/^X([0-9]|1[0-9])$/.test(w), 'roulette caps at 20 options', w);
    await p.fill('#opts', '<img src=x onerror=window.__q=1>\nB'); await p.click('#spin'); await p.waitForFunction(() => document.getElementById('res').textContent.includes('당첨'));
    ok(!(await p.evaluate(() => window.__q)), 'roulette escapes html'); ok(p.errs.length === 0, 'roulette js errors', p.errs); await ctx.close();
  }

  // ---------- quiz ----------
  {
    const ctx = await mk(); const p = await open(ctx, 'quiz'); const seen = {};
    for (const pick of [0, 1, 2, 3]) {
      for (let i = 0; i < 8; i++) await p.locator('#quiz .opt').nth(pick).click();
      const t = await txt(p, '#res'); seen[pick] = t.split(' ')[0] + ' ' + t.split(' ')[1];
      ok((await p.locator('#qlinks a').count()) === 2, `quiz links type ${pick}`);
      await p.click('#qlinks button');
      ok((await p.locator('#quiz .opt').count()) === 4, `quiz restarts after type ${pick}`);
    }
    ok(new Set(Object.values(seen)).size === 4, 'quiz reaches 4 different types', seen);
    for (let i = 0; i < 8; i++) await p.locator('#quiz .opt').nth(i % 2).click();
    ok((await txt(p, '#res')).startsWith('계획형'), 'quiz tie resolves to first type', await txt(p, '#res'));
    ok((await p.locator('.imgbtn').count()) === 1, 'quiz has image-card button'); ok(p.errs.length === 0, 'quiz js errors', p.errs); await ctx.close();
  }

  // ---------- habit + challenge (trackers) ----------
  for (const slug of ['habit', 'challenge']) {
    const ctx = await mk(); const p = await open(ctx, slug);
    const days = n => p.locator('#cal button').nth(n - 1);
    for (const d of [1, 2, 3, 6, 7]) await days(d).click();
    const t = await txt(p, '#res');
    ok(t.includes('5일') && t.includes('2일 연속'), `${slug} counts and streak`, t);
    ok(await days(8).isDisabled(), `${slug} future days disabled`);
    await p.reload(); ok((await txt(p, '#res')).includes('5일'), `${slug} persists`);
    await days(7).click(); ok((await txt(p, '#res')).includes('4일'), `${slug} unmark works`);
    await p.click('#reset'); ok((await txt(p, '#reset')).includes('한 번 더'), `${slug} reset needs 2nd click`);
    ok((await txt(p, '#res')).includes('4일'), `${slug} first reset click keeps data`);
    await p.click('#reset'); ok((await txt(p, '#res')).includes('0일'), `${slug} reset clears`, await txt(p, '#res'));
    ok(p.errs.length === 0, `${slug} js errors`, p.errs);
    await p.close();
    const p2 = await open(ctx, slug, '2026-11-01T09:00:00+09:00'); ok((await txt(p2, '#res')).includes('0일'), `${slug} new month starts empty`, await txt(p2, '#res'));
    ok((await p2.locator('#cal button').count()) === 30, `${slug} november has 30 days`, await p2.locator('#cal button').count());
    const p3 = await open(ctx, slug, '2024-02-15T09:00:00+09:00'); ok((await p3.locator('#cal button').count()) === 29, `${slug} leap february has 29`, await p3.locator('#cal button').count());
    await p3.evaluate(() => localStorage.setItem('habit:2024-2', 'garbage{{')); await p3.evaluate(() => localStorage.setItem('ns:2024-2', '###')); await p3.reload();
    ok(p3.errs.length === 0 && (await p3.locator('#cal button').count()) === 29, `${slug} survives corrupted storage`, p3.errs); await ctx.close();
  }
  { // habit name sanitised
    const ctx = await mk(); const p = await open(ctx, 'habit'); await p.fill('#hname', '<img src=x onerror=window.__h=1>운동'); await p.waitForTimeout(80);
    ok(!(await p.evaluate(() => window.__h)) && (await p.locator('#res img').count()) === 0, 'habit name cannot inject html'); await ctx.close();
  }

  // ---------- teams / pick / random ----------
  {
    const ctx = await mk(); let p = await open(ctx, 'teams');
    await p.fill('#names', 'a\nb\nc\nd\ne'); await p.fill('#k', '2'); await p.dispatchEvent('#k', 'input');
    let lines = (await p.locator('#res').innerText()).split('\n').filter(Boolean);
    const sizes = lines.map(l => l.replace(/^\d+팀 /, '').split(', ').length).sort();
    ok(lines.length === 2 && sizes.join() === '2,3', 'teams sizes 3+2', lines);
    await p.fill('#k', '6'); await p.dispatchEvent('#k', 'input'); ok((await txt(p, '#res')).includes('많습니다'), 'teams too many', await txt(p, '#res'));
    await p.fill('#k', '5'); await p.dispatchEvent('#k', 'input'); lines = (await p.locator('#res').innerText()).split('\n').filter(Boolean); ok(lines.length === 5, 'teams 5 singletons');
    await p.fill('#names', 'a\na\nb'); await p.fill('#k', '3'); await p.dispatchEvent('#k', 'input'); ok(!(await txt(p, '#res')).includes('NaN'), 'teams duplicate names fine');
    p = await open(ctx, 'pick'); await p.fill('#k', '3'); await p.dispatchEvent('#k', 'input'); let t = await txt(p, '#res'); ok(t.startsWith('당첨') && t.split(',').length === 3, 'pick 3 winners', t);
    await p.fill('#k', '9'); await p.dispatchEvent('#k', 'input'); ok((await txt(p, '#res')).includes('많이 뽑을 수 없어요'), 'pick too many', await txt(p, '#res'));
    await p.fill('#k', '1'); await p.fill('#n', ''); await p.dispatchEvent('#n', 'input'); ok((await txt(p, '#res')) === '', 'pick empty names -> nothing', await txt(p, '#res'));
    p = await open(ctx, 'random');
    await p.fill('#mn', '10'); await p.fill('#mx', '1'); await p.dispatchEvent('#mx', 'input'); ok((await txt(p, '#res')).includes('값을 확인'), 'random min>max', await txt(p, '#res'));
    await p.fill('#mn', '1'); await p.fill('#mx', '5'); await p.fill('#n', '9'); await p.dispatchEvent('#n', 'input'); ok((await txt(p, '#res')).includes('많이 뽑을 수 없어요') || (await txt(p, '#res')).includes('범위보다'), 'random unique > range', await txt(p, '#res'));
    await p.fill('#n', '5'); await p.dispatchEvent('#n', 'input'); t = (await txt(p, '#res')).split(', ').map(Number); ok(new Set(t).size === 5 && t.every(x => x >= 1 && x <= 5), 'random unique permutation', t);
    await p.selectOption('#u', 'd'); await p.fill('#n', '2000'); await p.dispatchEvent('#n', 'input'); ok((await txt(p, '#res')).includes('1000개'), 'random cap 1000', await txt(p, '#res'));
    await ctx.close();
  }

  // ---------- shared chrome: favorites, mode, accent, search ----------
  {
    const ctx = await mk(); let p = await open(ctx, 'loan'); await p.click('.favbtn'); p = await open(ctx, 'index');
    ok((await p.locator('#minelist a').count()) === 1 && !(await p.locator('#mine').isHidden()), 'favorite appears on home', await p.locator('#minelist a').allInnerTexts());
    for (const [fv, rc] of [['}{bad', 'null'], ['null', '[1,2]'], ['[{"s":"javascript:alert(1)","t":"x"}]', '{"a":1}'], ['[{"s":"loan.html","t":"대출"}]', '"str"']]) {
      await p.evaluate(([f, r]) => { localStorage.setItem('favs', f); localStorage.setItem('recent', r); }, [fv, rc]); await p.reload();
      ok(p.errs.length === 0, 'home survives corrupted favs ' + fv, p.errs);
      ok(!(await p.locator('#minelist a[href^="javascript"]').count()), 'no javascript: links from storage');
    }
    await p.fill('#q', '   '); ok((await p.locator('.pill:not([hidden])').count()) > 100, 'blank search shows all');
    await p.fill('#q', '.*+?[('); ok((await p.locator('#empty').isVisible()), 'regex chars do not break search');
    await p.fill('#q', '퇴직'); ok((await p.locator('#all .pill:not([hidden])').count()) === 1, 'search 퇴직 -> 1 result');
    await p.fill('#q', ''); await p.keyboard.press('Escape'); await p.locator('body').click({ position: { x: 5, y: 5 } }); await p.keyboard.press('/'); ok(await p.evaluate(() => document.activeElement.id === 'q'), 'slash focuses search');
    await p.click('.theme button[data-c="#ff9ec7"]'); const p2 = await ctx.newPage(); await p2.goto(BASE + 'age.html'); ok((await p2.evaluate(() => document.documentElement.style.getPropertyValue('--lime'))) === '#ff9ec7', 'accent persists across pages');
    await p2.click('.modebtn'); ok((await p2.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'mode toggle dark'); await ctx.close();
  }

  // ---------- housing clock ----------
  {
    const ctx = await mk(); const p = await open(ctx, 'housing-clock');
    await p.fill('#amt', '0'); await p.dispatchEvent('#amt', 'input'); ok((await txt(p, '#res')) === '' || (await txt(p, '#res')).includes('확인'), 'housing amt=0 -> no NaN', await txt(p, '#res'));
    await p.fill('#amt', '5000'); await p.selectOption('#freq', '0'); await p.dispatchEvent('#amt', 'input'); ok(!(await txt(p, '#res')).includes('1년 쌓이면'), 'housing one-time hides yearly');
    await p.selectOption('#region', '900'); ok((await p.inputValue('#pp')) === '900', 'region sets price');
    await p.fill('#save', '0'); await p.dispatchEvent('#save', 'input'); ok(!(await txt(p, '#res')).includes('NaN') && !(await txt(p, '#res')).includes('Infinity'), 'housing save=0 safe', await txt(p, '#res'));
    await p.fill('#name', "치킨 & '피자' <b>"); await p.selectOption('#freq', '52'); await p.fill('#save', '1000000'); await p.dispatchEvent('#save', 'input'); const html = await p.locator('#res').innerHTML();
    ok(!html.includes("<b>피자") && html.includes('&amp;'), 'housing escapes name'); ok(p.errs.length === 0, 'housing js errors', p.errs); await ctx.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
