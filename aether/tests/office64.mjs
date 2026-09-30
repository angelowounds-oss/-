// Reproduce the engineer-panel "S3 office CPU diagnostic" at 64^3: select it, run, poll the status line.
import path from 'node:path';
import { open, sleep } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const res = process.argv[2] || '64', maxS = +(process.argv[3] || 600);
const { browser, page, log } = await open('file://' + path.join(root, 'dist/aether.html') + '#q=LOW', { width: 1100, height: 700 });
try {
  await page.waitForSelector('#scGo.rdy', { timeout: 240000 });
  await page.evaluate(r => { const s = document.getElementById('officeResolution'); s.value = r; s.dispatchEvent(new Event('change', { bubbles: true })); document.getElementById('officeRun').click(); }, res);
  const t0 = Date.now(); let last = '';
  while ((Date.now() - t0) / 1000 < maxS) {
    await sleep(5000);
    const st = await page.evaluate(() => ({ s: document.getElementById('officeStatus')?.textContent, l: document.getElementById('officeLegend')?.textContent, rep: (document.getElementById('officeReport')?.textContent || '').slice(0, 300), dis: document.getElementById('officeRun')?.disabled }));
    const line = `${Math.round((Date.now() - t0) / 1000)}s | ${st.s}`; if (line.split('|')[1] !== last) { console.log(line); last = line.split('|')[1]; }
    if (/완료|중단|오류|ERROR|BLOCKED/.test(st.s || '') || /중단|BLOCKED/.test(st.rep)) { console.log('REPORT:', st.rep.replace(/\s+/g, ' ')); break; }
  }
} catch (e) { console.log('ERR', String(e).slice(0, 400)); }
console.log(log.pageErrors.slice(0, 3).join('\n'));
await browser.close();
