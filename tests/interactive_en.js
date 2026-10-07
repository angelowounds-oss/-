// Usage: node tests/interactive_en.js http://localhost:8801/   (site root, not /en/)
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8801/';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium' });
  const ctx = await b.newContext({ locale: 'en-US', timezoneId: 'UTC', viewport: { width: 420, height: 900 } });
  const mk = async (u) => { const p = await ctx.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message)); await p.goto(BASE + u); return p; };
  const res = p => p.locator('#res').innerText();

  // home: search + sections
  let p = await mk('en/');
  ok((await p.locator('.pill').count()) === 52, 'home lists 52 calculators');
  await p.fill('#q', 'bmi'); await p.waitForTimeout(50);
  ok((await p.locator('.pill:visible').count()) >= 1 && (await p.locator('#popular').isHidden()), 'search filters + hides popular');
  await p.fill('#q', 'zzzz'); ok(await p.locator('#empty').isVisible(), 'empty state shows');
  await p.fill('#q', ''); ok(await p.locator('#popular').isVisible(), 'popular back');
  ok(p.errs.length === 0, 'no js errors on home ' + p.errs);
  ok((await p.locator('html').getAttribute('lang')) === 'en', 'html lang=en');
  ok((await p.locator('link[rel=canonical]').getAttribute('href')).endsWith('/en/'), 'canonical /en/');

  // language switch links
  p = await mk('en/bmi.html');
  ok((await p.locator('nav a[lang=ko]').getAttribute('href')) === '../bmi.html', 'en bmi -> ko bmi link');
  p = await mk('en/overtime.html');
  ok((await p.locator('nav a[lang=ko]').getAttribute('href')) === '../', 'unpaired page links to ko home');
  p = await mk('bmi.html');
  ok((await p.locator('nav a[lang=en]').getAttribute('href')) === 'en/bmi.html', 'ko bmi -> en bmi link');
  p = await mk('loan.html');
  ok((await p.locator('nav a[lang=en]').getAttribute('href')) === 'en/loan.html', 'ko loan -> en loan link');
  p = await mk('');
  ok((await p.locator('nav a[lang=en]').getAttribute('href')) === 'en/', 'ko home -> en home link');

  // currency selector
  p = await mk('en/compound.html');
  ok((await res(p)).includes('$'), 'default currency $');
  await p.selectOption('#cur', '€'); await p.waitForLoadState('load'); await p.waitForTimeout(200);
  let t = await res(p); ok(t.includes('€') && !t.includes('$'), 'euro after change: ' + t.slice(0, 60));
  await p.selectOption('#cur', ''); await p.waitForLoadState('load'); await p.waitForTimeout(200);
  t = await res(p); ok(!/[$€]/.test(t) && /Future value [0-9]/.test(t), 'no symbol: ' + t.slice(0, 40));
  ok((await p.locator('#cur').inputValue()) === '', 'selector keeps empty value');
  await p.selectOption('#cur', '$'); await p.waitForLoadState('load');

  // favourites are namespaced per language
  p = await mk('en/bmi.html'); await p.click('.favbtn');
  ok((await p.evaluate(() => localStorage.getItem('favs:en'))) !== null && (await p.evaluate(() => localStorage.getItem('favs'))) === null, 'fav stored under favs:en');
  p = await mk('en/'); ok((await p.locator('#minelist a').count()) >= 1 && (await p.locator('#mine').isVisible()), 'my calculators on en home');
  p = await mk(''); ok(!(await p.locator('#minelist a', { hasText: '\u2605' }).count()), 'ko home does not show en favourites');

  // hash restore + share
  p = await mk('en/percent.html#m=of&x=50&y=80'); ok((await res(p)).includes('40'), 'hash restore: ' + (await res(p)));
  // negative / blank
  p = await mk('en/tip.html'); await p.fill('#b', '-5'); ok((await res(p)).includes('0 or a positive'), 'negative message');
  await p.fill('#b', ''); ok((await res(p)).includes('fill in every field'), 'blank message');

  // pick / teams / random / coin
  p = await mk('en/pick.html'); t = await res(p); ok(/Alex|Blair|Casey|Drew|Emery/.test(t), 'pick picks a name: ' + t);
  await p.fill('#l', '<img src=x onerror=window.__x=1>\nBob'); await p.fill('#n', '2'); await p.waitForTimeout(50);
  ok(!(await p.evaluate(() => window.__x)) && (await p.locator('#res img').count()) === 0, 'pick escapes html');
  await p.fill('#n', '5'); ok((await res(p)).includes('between 1 and 2'), 'pick too many winners msg');
  p = await mk('en/teams.html'); t = await res(p); ok(/Team 1/.test(t) && /Team 2/.test(t), 'teams made');
  const names = t.match(/Alex|Blair|Casey|Drew|Emery|Finley|Gray/g) || []; ok(new Set(names).size === 7 && names.length === 7, 'every name exactly once: ' + names.length);
  await p.fill('#n', '3'); t = await res(p); const sizes = [...t.matchAll(/\((\d+)\)/g)].map(m => +m[1]); ok(Math.max(...sizes) - Math.min(...sizes) <= 1 && sizes.length === 3, 'balanced sizes ' + sizes);
  p = await mk('en/random.html');
  for (let i = 0; i < 20; i++) { await p.fill('#a', String(i)); const nums = (await res(p)).split(',').map(s => +s); ok(nums.length === 5 && new Set(nums).size === 5 && nums.every(n => n >= i && n <= 100), 'random in range'); }
  await p.fill('#a', '1'); await p.fill('#b', '3'); await p.fill('#n', '5'); ok((await res(p)).includes('more numbers'), 'random no-repeat overflow msg');
  await p.selectOption('#u', 'yes'); ok((await res(p)).split(',').length === 5, 'random with repeats');
  p = await mk('en/coinflip.html'); ok(/Heads|Tails/.test(await res(p)), 'coin flip');
  await p.fill('#n', '50'); const ht = await res(p); const hh = +ht.match(/(\d+) heads/)[1], tt = +ht.match(/(\d+) tails/)[1]; ok(hh + tt === 50, 'coin totals');
  await p.selectOption('#m', 'd6'); await p.fill('#n', '3'); const d = (await res(p)).split('\n')[0].split(',').map(s => +s); ok(d.length === 3 && d.every(x => x >= 1 && x <= 6), 'dice 1..6');

  // text case escape
  p = await mk('en/textcase.html'); await p.fill('#t', '<img src=x onerror=window.__y=1>'); await p.waitForTimeout(50);
  ok(!(await p.evaluate(() => window.__y)) && (await p.locator('#res img').count()) === 0, 'textcase escapes html');

  // share buttons + image card (English)
  p = await mk('en/compound.html'); ok(await p.locator('.sharebtn').isVisible(), 'share button visible');
  ok((await p.locator('.sharebtn').innerText()) === 'Copy result to share', 'share button text english');
  await p.click('.imgbtn'); await p.waitForSelector('.overlay img'); const src = await p.locator('.overlay img').getAttribute('src'); ok(src.startsWith('data:image/png'), 'image card renders');
  ok((await p.locator('.overlay .btnlink').innerText()) === 'Download', 'card download label english');
  // dark mode toggle
  await p.keyboard.press('Escape'); await p.locator('.overlay button').click();
  await p.click('.modebtn'); ok((await p.locator('.modebtn').innerText()).startsWith('Theme: '), 'mode button english');
  // feedback widget
  await p.click('.fb button[data-v=up]'); ok((await p.locator('.fbt').innerText()).includes('Thanks'), 'feedback thanks english');

  // static pages
  for (const u of ['en/about.html', 'en/terms.html', 'en/privacy.html']) { p = await mk(u); ok((await p.locator('h1').innerText()).length > 2 && p.errs.length === 0, u + ' renders'); }
  console.log(`\n${pass} passed, ${fail} failed`);
  await b.close(); process.exit(fail ? 1 : 0);
})();
