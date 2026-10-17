import { procGesture, gesture } from './gesture.js';
import * as THREE from 'three';
import { initLoading } from './loading.js';
import { createEngine, QUALITY } from './engine.js';
import { furnitureIds, furnitureInfo, furnitureMaterial, furnitureReady } from './furnish.js';
import { Game } from './game.js';
import { el } from './util.js';
import * as V from './vehicle.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { AIM } from './assets.js';
import { loadBaked } from './bakedload.js';
import { initDetail, initDetailUI, detail } from './detail.js';
import { loadResident } from './heightmap.js';
import { loadVeg } from './forest.js';

const params = new URLSearchParams(location.search);
const mobile = matchMedia('(pointer:coarse)').matches;
let q = params.has('q') ? +params.get('q') : 1;
try { const s = +sessionStorage.getItem('neon_q'); if (s >= 0 && s <= 3 && sessionStorage.getItem('neon_q') !== null && !params.has('q')) q = s; } catch (e) { /* ignore */ }

function fatal(e) {
  const p = el('err'); p.style.display = 'block'; p.textContent = '초기화 오류\n' + (e && e.stack || e);
  console.error(e);
}

(async () => {
  let eng, game;
  const loading = initLoading();
  try {
    eng = createEngine(el('game'), q);
    await RAPIER.init();
    await loadBaked();   // the baked world must be in place before the first terrain/road query
    await initDetail();   // reconnect the optional high-detail pack when the browser allows it without asking
    // the high world detail starts at the 'high' graphics level (shadows, post-processing, textures) unless the player or the URL chose one
    { let stored = null; try { stored = sessionStorage.getItem('neon_q'); } catch (e) { /* ignore */ } if (detail.tier === 'high' && !params.has('q') && stored === null && !mobile) eng.setQuality(Math.max(q, 2)); }
    if (globalThis.__WORLD) globalThis.__HM_TILES = await loadResident(globalThis.__WORLD);   // the baked ground tiles of the embedded world
    if (globalThis.__WORLD) await loadVeg(globalThis.__WORLD);   // and where things grow
    game = new Game(eng); game.RAPIER = RAPIER;
    window.__game = game; window.__THREE = THREE; window.__furn = { ids: furnitureIds, info: furnitureInfo, mat: furnitureMaterial }; window.__V = V; window.__AIM = AIM; window.__gesture = { procGesture, gesture };
    await game.init((p, t) => loading.set(p, t));
    furnitureReady();   // prepare the furniture models during loading, not in the middle of the first building that opens
    game.buildings.warm(game.player.x, game.player.z, game.player.y || 0);
    game.prewarmShaders();
  } catch (e) { fatal(e); return; }
  const go = el('go');
  initDetailUI(() => location.reload());   // a change of world detail rebuilds the world: only offered here, before the game starts
  go.classList.add('rdy'); loading.ready();
  const begin = () => {
    if (game.running) return;
    const t = el('title'); t.classList.add('off');
    setTimeout(() => { t.style.display = 'none'; }, 1300);   // after the fade: no full-screen layer and no title animations ticking over the game
    game.start();
  };
  go.addEventListener('click', begin);
  addEventListener('keydown', (e) => {
    if (!game.running && go.classList.contains('rdy') && !e.metaKey && !e.ctrlKey && e.code !== 'F12') begin();
    else if (e.code === 'KeyK' && game.running) el('helpov').classList.toggle('on');
  });
  eng.onQuality = () => { try { sessionStorage.setItem('neon_q', String(eng.qIndex)); } catch (e) { /* ignore */ } };
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min((now - last) / 1000, 0.1); last = now;
    try {
      if (!game.running) { /* black title: nothing is rendered */ } else game.update(dt);
    } catch (e) { fatal(e); return; }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})();
