import { openContainer, hash53 } from './bakefmt.js';
import { WorldData, fileReader } from './chunkstore.js';

// World detail (ADR-0013): the page carries the "laptop" world (16 m terrain, city tiles, forests...) inside it; an optional folder of pack files
// (world/index.json + *.pak, made by `node build/build.mjs --pack`) holds the "high" world on top of it (8 m terrain, 4 m ground texture, building
// interiors...). The pack's chunks are put in front of the embedded ones in the chunk store, so everything that reads the store gets the better
// data when it is there, and the embedded data when it is not. The detail is chosen at the title screen (never during play) and remembered.
// A web page cannot read a sibling folder by itself (file://), so the player connects the folder once; the browser handle is kept in IndexedDB.
const PREF = 'neon_detail', DB = 'neon_world', STORE = 'handles';
export const detail = { tier: 'laptop', pref: 'auto', pack: null, state: 'none', files: 0, bytes: 0 };   // state: none | needs-permission | ready | bad

const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };
const idb = () => new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function idbGet(k) { try { const d = await idb(); return await new Promise((res) => { const q = d.transaction(STORE).objectStore(STORE).get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }); } catch (e) { return null; } }
async function idbSet(k, v) { try { const d = await idb(); await new Promise((res) => { const t = d.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(v, k); t.oncomplete = res; t.onerror = res; }); } catch (e) { /* ignore */ } }

// what the machine suggests when the player has not chosen: a pack is only worth using with enough memory and cores
export function suggest() { return (navigator.deviceMemory || 4) >= 8 && (navigator.hardwareConcurrency || 4) >= 8 ? 'high' : 'laptop'; }

// a pack folder as {get(name) -> File | null}, from a directory handle or from the files of a <input webkitdirectory>
const fromHandle = (h) => ({ name: h.name, async get(n) { try { return await (await h.getFileHandle(n)).getFile(); } catch (e) { return null; } } });
const fromFiles = (list) => { const m = new Map(); for (const f of list) m.set(f.name, f); return { name: 'files', async get(n) { return m.get(n) || null; } }; };

// open every file the folder's index lists and add its chunks to the store; throws when the index is missing or a file does not match
export async function mountPack(dir, wd = globalThis.__WORLD) {
  const ix = await dir.get('index.json'); if (!ix) throw new Error('index.json 없음');
  const idx = JSON.parse(await ix.text()); let bytes = 0;
  for (const f of idx.files) {
    const file = await dir.get(f.name); if (!file) throw new Error(f.name + ' 없음');
    if (file.size !== f.bytes) throw new Error(f.name + ' 크기가 다름');
    wd.add('pack:' + f.name, await openContainer(fileReader(file)), true); bytes += file.size;
  }
  return { files: idx.files.length, bytes };
}
function drop(wd = globalThis.__WORLD) { for (const s of [...wd.sources]) if (s.name.startsWith('pack:')) wd.remove(s.name); }

function settle() {
  detail.pref = lsGet(PREF) || 'auto';
  const want = detail.pref === 'auto' ? suggest() : detail.pref;
  detail.tier = detail.state === 'ready' && want === 'high' ? 'high' : 'laptop';
  globalThis.__DETAIL = detail.tier;
}

// called once at start-up, after the embedded world is loaded: reconnect the pack if the browser lets us without asking
export async function initDetail() {
  const wd = (globalThis.__WORLD = globalThis.__WORLD || new WorldData());
  detail.pref = lsGet(PREF) || 'auto';
  const h = await idbGet('pack');
  if (h && h.queryPermission) {
    const p = await h.queryPermission({ mode: 'read' });
    if (p === 'granted') await attach(fromHandle(h)); else if (detail.pref !== 'laptop') detail.state = 'needs-permission';
  }
  settle();
}
async function attach(dir) {
  try { const r = await mountPack(dir); detail.files = r.files; detail.bytes = r.bytes; detail.state = 'ready'; } catch (e) { drop(); detail.state = 'bad'; detail.error = String(e.message || e); }
}
export function setPref(p) { lsSet(PREF, p); settle(); }

// buttons on the title screen: connect/allow the pack (needs a click), choose the detail; a change of tier needs the world rebuilt, so reload
export async function connectPack() {
  let dir = null;
  if (globalThis.showDirectoryPicker) {
    const stored = await idbGet('pack');
    if (stored && stored.requestPermission && (await stored.requestPermission({ mode: 'read' })) === 'granted') dir = fromHandle(stored);
    else { const h = await showDirectoryPicker({ id: 'neon-world', mode: 'read' }); await idbSet('pack', h); dir = fromHandle(h); }
  } else {
    dir = await new Promise((res) => { const i = document.createElement('input'); i.type = 'file'; i.multiple = true; i.accept = '.pak,.json'; i.onchange = () => res(i.files.length ? fromFiles(i.files) : null); i.click(); });
  }
  if (!dir) return false;
  drop(); await attach(dir); settle(); return detail.state === 'ready';
}

export function initDetailUI(onChange) {
  const box = document.getElementById('detail'); if (!box) return;
  const tierName = { laptop: '노트북', high: '고사양' };
  const paint = () => {
    const sel = box.querySelector('select'), msg = box.querySelector('.dmsg'), btn = box.querySelector('button');
    sel.value = detail.pref;
    btn.textContent = detail.state === 'needs-permission' ? '고화질 팩 허용' : detail.state === 'ready' ? '팩 다시 연결' : '고화질 팩 연결';
    msg.textContent = `현재 ${tierName[detail.tier]}` + (detail.state === 'ready' ? ` · 팩 ${detail.files}개 (${(detail.bytes / 1048576).toFixed(0)} MB)` : detail.state === 'bad' ? ` · 팩 오류: ${detail.error}` : detail.state === 'needs-permission' ? ' · 팩 권한 필요' : ' · 팩 없음');
  };
  box.querySelector('select').onchange = (e) => { setPref(e.target.value); onChange?.(); };
  box.querySelector('button').onclick = async () => { try { await connectPack(); } catch (e) { /* cancelled */ } paint(); onChange?.(); };
  box.onclick = (e) => e.stopPropagation();
  paint(); box.style.display = 'flex';
}
export { hash53 };
