// Save files (SAV-01/02). Every save carries a schema version `v`; an older one is brought up to date on load, one step per version, and a save
// written by a newer build is read as it is but never overwritten. The slot's last good copy is kept as `<key>_bak` and read when the slot itself
// does not parse. A save over the size budget leaves out the oldest of the things that pile up during play (bullet holes, events, dropped items,
// memorials) until it fits. A write that fails (the browser's storage is full or refused) is reported to the caller instead of being ignored.
// A save can also leave the browser as a file and come back from one (SAV-03, importText).
// Pure apart from the storage object passed in, so a unit test drives it with an in-memory one.

export const SAVE_V = 1;
export const BUDGET = 1 << 20;   // 1 MiB of JSON per slot: a site gets ~5 MB of localStorage, shared by three slots, their backups and the settings

// one step per version: STEPS[k] turns a version-k save into version k + 1 (in place)
const STEPS = [
  // v0 -> v1: the 1:1 saves from before versioning. Missing parts are made empty; the modules' own fallbacks for older fields (gear1 etc.) stay.
  (d) => {
    const w = (d.world = d.world && typeof d.world === 'object' ? d.world : {});
    for (const k of ['doors', 'glass', 'taken', 'moved', 'homes']) if (!w[k] || typeof w[k] !== 'object') w[k] = {};
    d.cash = Number.isFinite(+d.cash) ? +d.cash : 0; d.mission = d.mission | 0; d.kills = d.kills | 0; w.bank = Number.isFinite(+w.bank) ? +w.bank : 0;
    return d;
  },
];

// a parsed save up to SAVE_V: { data, from, future } (future: written by a newer build; read as it is, and the caller must not save over it)
export function migrate(raw) {
  const d = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const from = Number.isInteger(d.v) && d.v >= 0 ? d.v : 0;
  if (from > SAVE_V) return { data: d, from, future: true };
  for (let k = from; k < SAVE_V; k++) STEPS[k](d);
  d.v = SAVE_V;
  return { data: d, from, future: false };
}

// read a slot: the slot, else its backup, else the legacy key; a text that does not parse counts as missing. → { data, from, future, source }
export function readSave(store, key, legacy = null) {
  for (const [k, source] of [[key, 'slot'], [key + '_bak', 'backup'], [legacy, 'legacy']]) {
    if (!k) continue;
    let text = null; try { text = store.getItem(k); } catch (e) { text = null; }
    if (text == null) continue;
    let obj; try { obj = JSON.parse(text); } catch (e) { continue; }
    if (!obj || typeof obj !== 'object') continue;
    return { ...migrate(obj), source };
  }
  return { ...migrate({}), source: 'new' };
}

// the arrays that grow during play, oldest first (paths into the save); trimmed from the front, half at a time, when the save is over budget
const GROWS = [['world', 'memory', 'holes'], ['world', 'memory', 'events'], ['world', 'holes'], ['world', 'dropped'], ['world', 'memory', 'scorch'], ['world', 'citizens', 'memorials']];
const at = (o, p) => p.reduce((a, k) => (a && typeof a === 'object' ? a[k] : undefined), o);

// the JSON to write for a snapshot, within the budget: { text, trimmed } (trimmed: how many old entries were left out of this copy; the game's
// own state keeps them, so a save that only just went over loses nothing until the next one)
export function encode(snap, budget = BUDGET) {
  let text = JSON.stringify(snap);
  if (text.length <= budget) return { text, trimmed: 0 };
  const copy = JSON.parse(text); let trimmed = 0;
  for (let round = 0; round < 12 && text.length > budget; round++) {
    let cut = 0;
    for (const p of GROWS) { const a = at(copy, p); if (Array.isArray(a) && a.length > 4) { const n = Math.ceil(a.length / 2); a.splice(0, n); cut += n; } }
    if (!cut) break;
    trimmed += cut; text = JSON.stringify(copy);
  }
  return { text, trimmed };
}

// write a snapshot to a slot: the slot's current text (if it parses) becomes the backup first. → { ok, bytes, trimmed, error }
export function writeSave(store, key, snap, budget = BUDGET) {
  const { text, trimmed } = encode(snap, budget);
  if (text.length > budget) return { ok: false, bytes: text.length, trimmed, error: 'over-budget' };
  try {
    const prev = store.getItem(key);
    if (prev != null) { let good = false; try { good = !!JSON.parse(prev); } catch (e) { good = false; } if (good) { try { store.setItem(key + '_bak', prev); } catch (e) { /* no room for the backup: the save itself matters more */ } } }
    store.setItem(key, text);
    return { ok: true, bytes: text.length, trimmed, error: null };
  } catch (e) {
    return { ok: false, bytes: text.length, trimmed, error: (e && (e.name === 'QuotaExceededError' || e.code === 22)) ? 'quota' : String((e && e.message) || e) };
  }
}

// a save file the player picked (SAV-03), checked and brought up to date. → { ok, data, from, error }: error 'parse' (not JSON), 'not-a-save'
// (none of a save's fields: some other JSON file) or 'future' (a newer build wrote it; this build would drop what it does not know when it saves)
export function importText(text) {
  let obj; try { obj = JSON.parse(text); } catch (e) { return { ok: false, error: 'parse' }; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || !('cash' in obj || 'world' in obj)) return { ok: false, error: 'not-a-save' };
  const r = migrate(obj);
  if (r.future) return { ok: false, error: 'future', from: r.from };
  return { ok: true, data: r.data, from: r.from };
}
