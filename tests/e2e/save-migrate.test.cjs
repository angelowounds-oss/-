// SAV-01/02/03 in the game: an unversioned (v0) save in slot 1 loads with its money, mission and bank; the game knows it came from v0; the first save
// writes the current version and keeps the old text as the slot's backup; when the browser refuses a write the player sees "저장 실패" and the error
// log has it (it was swallowed); a save from a newer build is read but never written over. The game goes out to a file and a file comes back into
// the slot (a v0 file brought up to date; a JSON that is not a save, a broken file and a newer build's file are refused with the slot untouched).
const { run, freeze, result } = require('../lib.cjs');
const V0 = { cash: 4321, mission: 2, kills: 5, world: { doors: {}, glass: {}, taken: {}, moved: {}, homes: {}, bank: 77 } };
// seeded once per browser (the init script runs on every navigation of the page)
const init = `try { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); localStorage.setItem('neon_slot', '1'); localStorage.setItem('korea11_v1_1', ${JSON.stringify(JSON.stringify(V0))}); sessionStorage.setItem('seeded', '1'); } } catch (e) {}`;
run('save-migrate', { q: 1, init }, async ({ page, errors }) => {
  await freeze(page);
  const o = await page.evaluate(async () => {
    const g = window.__game, o = {}; g.eng.render = () => {};
    const slot = () => JSON.parse(localStorage.getItem('korea11_v1_1')), bak = () => JSON.parse(localStorage.getItem('korea11_v1_1_bak'));
    o.loaded = { cash: g.cash, mission: g.missionIndex, bank: g.state.bank, info: g.saveInfo };
    // the boot already saved once (the mission start): the slot is current and the backup is the v0 text
    o.afterBoot = { v: slot().v, bakV: bak().v ?? 0, bakCash: bak().cash };
    g.cash = 999; o.saved = g.save(); o.afterSave = { v: slot().v, cash: slot().cash, bakV: bak().v, bytes: localStorage.getItem('korea11_v1_1').length };
    // the browser refuses the write
    const real = Storage.prototype.setItem; Storage.prototype.setItem = function () { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; };
    g._saveWarnT = -1e9; g.cash = 5; o.refused = g.save(); Storage.prototype.setItem = real;
    o.toast = document.getElementById('toast').textContent; o.logged = !!g.errors.find((x) => x.stage === '저장'); o.slotKept = slot().cash;
    // a save from a newer build: read, never written over
    g.saveInfo.future = true; g.cash = 1; o.futureSaved = g.save(); o.futureKept = slot().cash; g.saveInfo.future = false;
    // SAV-03: out to a file (the blob the download is made of) and back in
    let blob = null; const realURL = URL.createObjectURL; URL.createObjectURL = (b) => { blob = b; return realURL.call(URL, b); };
    g.cash = 2468; const ex = g.exportSave(); URL.createObjectURL = realURL;
    const text = blob ? await blob.text() : '', ej = text ? JSON.parse(text) : {};
    o.exported = { name: ex && ex.name, v: ej.v, cash: ej.cash, same: !!ex && text.length === ex.bytes };
    const before = localStorage.getItem('korea11_v1_1');
    o.importJunk = g.importSave('{"hello": 1}', false).error; o.importBad = g.importSave('not json', false).error; o.importFuture = g.importSave(JSON.stringify({ v: 99, cash: 1 }), false).error;
    o.slotUntouched = localStorage.getItem('korea11_v1_1') === before;
    const imp = g.importSave(JSON.stringify({ cash: 1357, mission: 1, kills: 0, world: { bank: 5 } }), false);
    o.imported = { ok: imp.ok, from: imp.from, v: slot().v, cash: slot().cash, bank: slot().world.bank, bakCash: bak().cash, locked: g.save() === false };
    g.saveLocked = false;
    return o;
  });
  const L = o.loaded, pass = L.cash === 4321 && L.mission === 2 && L.bank === 77 && L.info.from === 0 && L.info.source === 'slot' && !L.info.future
    && o.afterBoot.v === 1 && o.afterBoot.bakV === 0 && o.afterBoot.bakCash === 4321
    && o.saved === true && o.afterSave.v === 1 && o.afterSave.cash === 999 && o.afterSave.bakV === 1
    && o.refused === false && /저장 실패/.test(o.toast) && o.logged && o.slotKept === 999
    && o.futureSaved === false && o.futureKept === 999
    && /^korea11-slot1-\d{4}-\d\d-\d\d\.json$/.test(o.exported.name || '') && o.exported.v === 1 && o.exported.cash === 2468 && o.exported.same
    && o.importJunk === 'not-a-save' && o.importBad === 'parse' && o.importFuture === 'future' && o.slotUntouched
    && o.imported.ok && o.imported.from === 0 && o.imported.v === 1 && o.imported.cash === 1357 && o.imported.bank === 5 && o.imported.bakCash === 999 && o.imported.locked;
  // the full storage the test sets up is logged with console.error by design (SAV-02); anything else is a real page error
  for (let i = errors.length - 1; i >= 0; i--) if (/save failed: quota/.test(errors[i])) errors.splice(i, 1);
  result('save-migrate', pass, o);
});
