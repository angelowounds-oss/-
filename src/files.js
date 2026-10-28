// Game files next to the page (BLD-06, ADR-0034). The build copies imported .glb/.bin/.rgbe/.jpg files into game/assets/ and an import gives
// the file's URL. Most users load them when they need them (fetchBytes); a few decode them in synchronous code (engine set-up, the country
// road plan, block shapes, landmarks), so they register the URL when their module loads (need) and the boot fetches all of those before
// anything runs (preloadFiles), after which bytes() hands them out at once.
const wanted = new Set(), got = new Map();

// Fetches a file of the game folder as an ArrayBuffer.
export async function fetchBytes(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.arrayBuffer();
}

// Registers a file that synchronous code will read with bytes(); returns the URL so it can stand in for the import.
export function need(url) { wanted.add(url); return url; }

// Fetches every registered file; the boot awaits this before creating the engine.
export async function preloadFiles() {
  await Promise.all([...wanted].filter((u) => !got.has(u)).map(async (u) => { got.set(u, new Uint8Array(await fetchBytes(u))); }));
}

// The bytes of a registered file; throws when the boot has not fetched it.
export function bytes(url) {
  const b = got.get(url);
  if (!b) throw new Error('file not preloaded: ' + url);
  return b;
}
