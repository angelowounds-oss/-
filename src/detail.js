import { openContainer, hash53 } from './bakefmt.js';
import { WorldData, fileReader, httpFile } from './chunkstore.js';

// World detail (ADR-0013, ADR-0034): the game folder carries the "laptop" world (world/base.pak: 16 m terrain, city tiles, forests...) and, next
// to it, the "high" pack (world/index.json + *.pak, made by `node build/bake.mjs --pack` and `build/assets/pack.mjs`: 8 m terrain, 4 m ground
// texture, denser cities, compressed textures). When the high detail is chosen, the pack's chunks are put in front of the base ones in the chunk
// store, so everything that reads the store gets the better data, and the base data where the pack has none. The page is served by the launcher,
// so the pack is read over http, a chunk at a time (Range requests). The detail is chosen at the title screen (never during play) and remembered.
const PREF = 'neon_detail', PACK_DIR = 'world/';
export const detail = { tier: 'laptop', pref: 'auto', state: 'none', files: 0, bytes: 0, available: 0 };   // state: none | ready | bad; available: pack bytes (0 = no pack)

const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } };

// what the machine suggests when the player has not chosen: a pack is only worth using with enough memory and cores
export function suggest() { return (navigator.deviceMemory || 4) >= 8 && (navigator.hardwareConcurrency || 4) >= 8 ? 'high' : 'laptop'; }

// the pack folder as {get(name) -> file-like | null} over http (chunkstore.js httpFile)
const fromHttp = (base) => ({ name: base, get: (n) => httpFile(base + n) });

// open every file the folder's index lists and add its chunks to the store; throws when the index is missing or a file does not match. A
// world file of the pack must have been baked with the base world in the store (the same world id, build/bake.mjs): an older pack's 8 m ground
// stood up to 1.4 km off the base ground (BLD-07). The asset pack holds no world data and is not tied to one
export async function mountPack(dir, wd = globalThis.__WORLD) {
  const ix = await dir.get('index.json'); if (!ix) throw new Error('index.json 없음');
  const idx = JSON.parse(await ix.text()), base = wd.sources.find((s) => !s.name.startsWith('pack:') && s.c.meta?.world); let bytes = 0;
  const opened = [];
  for (const f of idx.files) {
    const file = await dir.get(f.name); if (!file) throw new Error(f.name + ' 없음');
    if (file.size !== f.bytes) throw new Error(f.name + ' 크기가 다름');
    const c = await openContainer(fileReader(file));
    if (c.meta?.kind !== 'assets' && base && c.meta?.world !== base.c.meta.world) throw new Error(f.name + '이(가) 이 월드와 맞지 않음(다시 구워야 함)');
    opened.push([f.name, c]); bytes += file.size;
  }
  for (const [n, c] of opened) wd.add('pack:' + n, c, true);
  return { files: idx.files.length, bytes };
}
function drop(wd = globalThis.__WORLD) { for (const s of [...wd.sources]) if (s.name.startsWith('pack:')) wd.remove(s.name); }

function settle() {
  detail.pref = lsGet(PREF) || 'auto';
  const want = detail.pref === 'auto' ? suggest() : detail.pref;
  detail.tier = detail.state === 'ready' && want === 'high' ? 'high' : 'laptop';
  globalThis.__DETAIL = detail.tier;
}

// called once at start-up, after the base world is loaded: see whether the pack is there, and mount it when the high detail is wanted
export async function initDetail() {
  const wd = (globalThis.__WORLD = globalThis.__WORLD || new WorldData());
  detail.pref = lsGet(PREF) || 'auto';
  let idx = null; try { const r = await fetch(PACK_DIR + 'index.json', { cache: 'no-cache' }); if (r.ok) idx = await r.json(); } catch (e) { /* no pack */ }
  detail.available = idx ? idx.files.reduce((n, f) => n + f.bytes, 0) : 0;
  if (idx && (detail.pref === 'auto' ? suggest() : detail.pref) === 'high') await attach(fromHttp(PACK_DIR), wd);
  settle();
}
async function attach(dir, wd) {
  try { const r = await mountPack(dir, wd); detail.files = r.files; detail.bytes = r.bytes; detail.state = 'ready'; } catch (e) { drop(wd); detail.state = 'bad'; detail.error = String(e.message || e); }
}
export function setPref(p) { lsSet(PREF, p); settle(); }

// test hook; mount() attaches the pack now, whatever the choice (as the boot does when the high detail is chosen)
if (typeof window !== 'undefined') window.__detail = { detail, setPref, mountPack, mount: async () => { await attach(fromHttp(PACK_DIR), globalThis.__WORLD); settle(); return detail.state === 'ready'; } };
// the title screen's choice of detail; a change needs the world rebuilt, so the page reloads
export function initDetailUI(onChange) {
  const box = document.getElementById('detail'); if (!box) return;
  const tierName = { laptop: '노트북', high: '고사양' }, sel = box.querySelector('select'), msg = box.querySelector('.dmsg');
  sel.querySelector('option[value="high"]').disabled = !detail.available;
  sel.value = detail.pref;
  msg.textContent = `현재 ${tierName[detail.tier]}` + (detail.state === 'ready' ? ` · 고사양 팩 ${(detail.bytes / 1048576).toFixed(0)} MB 사용` : detail.state === 'bad' ? ` · 팩 오류: ${detail.error}` : detail.available ? ' · 고사양 팩 있음' : ' · 고사양 팩 없음');
  sel.onchange = (e) => { setPref(e.target.value); onChange?.(); };
  box.onclick = (e) => e.stopPropagation();
  box.style.display = 'flex';
}
export { hash53 };
