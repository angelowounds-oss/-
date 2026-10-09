/* global __REF __DISP __CINE __VEHICLE */
// Precomputed reference results option: label is mandatory, unlabeled or malformed files are rejected, the card and the wall display show the label, off really turns it off. node tests/reference.mjs
import path from 'node:path';
import { open, sleep } from './lib.mjs';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const { browser, page, log } = await open('file://' + path.join(root, 'dist/aether.html') + '#q=LITE', { width: 1280, height: 720 });
const res = []; const check = (n, ok, d) => { res.push({ n, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); };
try {
  await page.waitForSelector('#scGo.rdy', { timeout: 400000 }); await page.evaluate(() => { document.getElementById('scGo').click(); }); await sleep(1500);
  await page.waitForFunction(() => window.__LIVE && __LIVE.ok && window.__DISP && __DISP.draws >= 1, null, { timeout: 400000, polling: 1000 });
  await page.evaluate(() => { const sp = document.getElementById('scSplash'); if (sp) sp.style.display = 'none'; __CINE.cancel('ref'); });
  const R = await page.evaluate(() => {
    const good = { schema: 'aether-reference-v1', car: __VEHICLE.id, label: { method: 'external CFD (test fixture)', source: 'unit test', gridCellM: 0.02, U: 5, yawDeg: 0, date: '2026-10-08', limits: 'test fixture, not a real result' }, forces: { Cd: 0.31, CdStd: 0.01, Cl: 0.05 }, gridStudy: [{ cellM: 0.24, Cd: 0.7 }, { cellM: 0.11, Cd: 0.5 }, { cellM: 0.02, Cd: 0.31 }] };
    const clone = o => JSON.parse(JSON.stringify(o)), out = {};
    const noLabel = clone(good); delete noLabel.label; out.noLabel = __REF.validate(noLabel).ok;
    const noSource = clone(good); delete noSource.label.source; out.noSource = __REF.validate(noSource).ok;
    const nanCd = clone(good); nanCd.forces.Cd = 'x'; out.nanCd = __REF.validate(nanCd).ok;
    const wrongSchema = clone(good); wrongSchema.schema = 'x'; out.wrongSchema = __REF.validate(wrongSchema).ok;
    out.good = __REF.validate(good).ok;
    out.badJson = __REF.loadText('{not json'); out.badJsonErr = __REF.err;
    out.tooBig = __REF.loadText('x'.repeat(2e6)); out.tooBigErr = __REF.err;
    out.noLabelLoad = __REF.loadText(JSON.stringify(noLabel)); out.noLabelErr = __REF.err;
    out.activeAfterRejects = !!__REF.active && __REF.mode === 'file';
    out.loaded = __REF.loadText(JSON.stringify(good)); out.mode = __REF.mode; out.activeCd = __REF.active?.forces.Cd; out.line = __REF.labelLine(__REF.active);
    return out;
  });
  check('라벨(method·source·date·limits)이 없거나 형식이 틀린 결과는 거부', R.noLabel === false && R.noSource === false && R.nanCd === false && R.wrongSchema === false && R.good === true, R);
  check('깨진 JSON·1 MB 초과·라벨 없는 파일은 불러오기 실패 + 사유 표시, 활성 결과 없음', R.badJson === false && /JSON/.test(R.badJsonErr) && R.tooBig === false && /1 MB/.test(R.tooBigErr) && R.noLabelLoad === false && /label/.test(R.noLabelErr), { e1: R.badJsonErr, e2: R.tooBigErr, e3: R.noLabelErr });
  check('올바른 파일은 불러와져 활성화(파일 모드)', R.loaded === true && R.mode === 'file' && R.activeCd === 0.31, { mode: R.mode, cd: R.activeCd });
  check('라벨 줄에 방법·격자·조건·날짜·출처가 모두 있고 "실시간 아님" 표시', /실시간 아님/.test(R.line) && /external CFD/.test(R.line) && /2\.0 cm/.test(R.line) && /5 m\/s/.test(R.line) && /2026-10-08/.test(R.line) && /unit test/.test(R.line), R.line);
  await page.waitForFunction(() => /test fixture/.test(document.getElementById('refStat')?.textContent || ''), null, { timeout: 120000, polling: 1000 }).catch(() => null);
  const ui = await page.evaluate(() => ({ stat: document.getElementById('refStat')?.textContent, sel: document.getElementById('refMode')?.value, draws: __DISP.draws, err: __DISP.err || null }));
  check('카드에 라벨 + Cd + 한계 문구 표시', /실시간 아님/.test(ui.stat) && /Cd 0\.310/.test(ui.stat) && /test fixture/.test(ui.stat) && ui.sel === 'file', ui.stat?.slice(0, 200));
  check('벽면 디스플레이는 오류 없이 갱신됨(기준 결과 줄 포함해 그림)', ui.err === null && ui.draws >= 2, ui);
  const off = await page.evaluate(() => { __REF.setMode('off'); return { active: __REF.active, mode: __REF.mode }; }); await page.waitForFunction(() => /꺼져/.test(document.getElementById('refStat')?.textContent || ''), null, { timeout: 120000, polling: 1000 }).catch(() => null);
  const offUi = await page.evaluate(() => document.getElementById('refStat')?.textContent);
  check('끄기: 활성 결과 없음, 카드에 "꺼져 있습니다"', off.active === null && off.mode === 'off' && /꺼져/.test(offUi), { off, offUi });
  const b = await page.evaluate(() => { __REF.setMode('builtin'); return { n: __REF.builtin().length, active: __REF.active ? __REF.active.label.title : null }; }); await page.waitForFunction(() => !/꺼져/.test(document.getElementById('refStat')?.textContent || '꺼져'), null, { timeout: 120000, polling: 1000 }).catch(() => null);
  const bUi = await page.evaluate(() => document.getElementById('refStat')?.textContent);
  check('내장 모드: 내장 결과가 있으면 라벨과 함께, 없으면 없다고 표시(만들어 내지 않음)', (b.n === 0 && /없습니다/.test(bUi) && b.active === null) || (b.n > 0 && /실시간 아님|오프라인/.test(bUi)), { b, bUi: bUi?.slice(0, 160) });
} catch (e) { check('reference test completed', false, String(e).slice(0, 300)); }
check('페이지 오류·콘솔 오류·외부 요청 0', log.pageErrors.length === 0 && log.consoleErrors.length === 0 && log.external.length === 0, { p: log.pageErrors.slice(0, 2), c: log.consoleErrors.slice(0, 2), x: log.external.slice(0, 2) });
await browser.close();
const f = res.filter(r => !r.ok).length; console.log(`${res.length - f}/${res.length} PASS`); process.exit(f ? 1 : 0);
