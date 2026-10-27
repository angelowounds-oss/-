import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

// High-detail assets (ADR-0028, ADR-0029): the optional pack (detail.js) carries GPU-compressed KTX2 textures under the keys `asset/tex/<name>`,
// plus the Basis transcoder itself (`asset/basis`), so the page carries none of it. A user of a texture registers its uniform under the texture's
// name with its embedded texture in it; loading the pack (during start-up, or when the pack is connected at the title screen) decodes every packed
// texture once, uploads it and puts it into the registered uniforms. Only the sampled texture changes, so no shader is compiled again.
const HI = new Map(), SLOTS = new Map();

// a uniform {value: texture} that takes the packed texture of `name` when there is one (now or when the pack is loaded later)
export function hiSlot(name, uniform) {
  (SLOTS.get(name) || SLOTS.set(name, []).get(name)).push(uniform);
  if (HI.has(name)) uniform.value = HI.get(name);
  return uniform;
}

// decode every packed texture and hand it to its slots; a failure leaves the embedded textures in place (the pack is a bonus, never a requirement)
export async function loadHiAssets(renderer, wd = globalThis.__WORLD) {
  if (!wd || !wd.has('asset/basis')) return 0;
  const t0 = performance.now(), names = wd.keys('asset/tex/').filter((k) => !HI.has(k.slice(10)));
  const urls = [];
  try {
    const basis = await wd.get('asset/basis'), blob = (b, type) => { const u = URL.createObjectURL(new Blob([b], { type })); urls.push(u); return u; };
    const map = { 'basis_transcoder.js': blob(basis.js, 'text/javascript'), 'basis_transcoder.wasm': blob(basis.wasm, 'application/wasm') };
    const manager = new THREE.LoadingManager(); manager.setURLModifier((u) => map[u.split('/').pop()] || u);
    const loader = new KTX2Loader(manager).setTranscoderPath('').detectSupport(renderer);
    for (const key of names) {
      const c = await wd.get(key), tex = await new Promise((res, rej) => loader.parse(c.data.slice().buffer, res, rej));
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8; tex.colorSpace = c.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      renderer.initTexture(tex);   // uploaded now, not on the first frame that samples it
      const name = key.slice(10); HI.set(name, tex); wd.drop(key);
      for (const u of SLOTS.get(name) || []) { const old = u.value; u.value = tex; if (old && old !== tex) old.dispose(); }
    }
    loader.dispose(); wd.drop('asset/basis');
  } catch (e) { console.warn('high-detail assets', e); }
  for (const u of urls) URL.revokeObjectURL(u);
  globalThis.__HI_ASSETS = { count: HI.size, ms: Math.round(performance.now() - t0) };
  return HI.size;
}

if (typeof window !== 'undefined') window.__hi = { load: (r) => loadHiAssets(r || window.__game?.eng?.renderer), names: () => [...HI.keys()], slots: () => [...SLOTS.keys()], slot: (n) => SLOTS.get(n)?.[0] || null, tex: (n) => HI.get(n) || null };   // test hook
