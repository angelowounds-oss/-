import { procGesture, gesture } from './gesture.js';
import * as THREE from 'three';
import { initLoading } from './loading.js';
import { createEngine } from './engine.js';
import { furnitureIds, furnitureInfo, furnitureMaterial, furnitureReady } from './furnish.js';
import { Game } from './game.js';
import { installTestApi } from './testapi.js';
import { initCredits } from './credits.js';
import { PerfOverlay } from './perfoverlay.js';
import { el } from './util.js';
import * as V from './vehicle.js';
import RAPIER from '@dimforge/rapier3d-compat';
import { AIM } from './assets.js';
import { loadBaked } from './bakedload.js';
import { initDetail, initDetailUI, detail } from './detail.js';
import { loadResident, setTileReader } from './heightmap.js';
import { mountRegionTiles, syncChunk } from './regionload.js';
import { regionLoad } from './region.js';
import { REG_REACH } from './regtile.js';
import { loadVeg } from './forest.js';
import { loadHiAssets } from './hiassets.js';
import { applyView } from './views.js';
import { initBuildingDev } from './buildingdev.js';
import { keys as binds } from './keys.js';
import { renderHelp, initKeyUI } from './keyui.js';
import { preloadFiles } from './files.js';
import { noteError, copyReport } from './errors.js';

const params = new URLSearchParams(location.search);
const mobile = matchMedia('(pointer:coarse)').matches;
let q = params.has('q') ? +params.get('q') : 1;
try { const s = +sessionStorage.getItem('neon_q'); if (s >= 0 && s <= 3 && sessionStorage.getItem('neon_q') !== null && !params.has('q')) q = s; } catch (e) { /* ignore */ }

// the launcher (launcher/main.go) ends itself once the page is gone: tell it we are here, and when we leave (a reload pings again)
function keepLauncher() {
  fetch('/__korea/id', { cache: 'no-store' }).then((r) => {
    if (!r.ok) return;
    const ping = () => fetch('/__korea/ping', { cache: 'no-store' }).catch(() => { /* launcher gone */ });
    ping(); setInterval(ping, 15000);
    addEventListener('pagehide', () => navigator.sendBeacon('/__korea/bye'));
  }).catch(() => { /* not served by the launcher (tests, dev server) */ });
}

// the error screen: what failed (loading, or a frame stage that kept failing during play) and a button that copies the report to send
function fatal(e, during = '초기화 오류') {
  const p = el('err'); p.style.display = 'block'; p.textContent = during + '\n' + (e && e.stack || e) + '\n\n';
  if (during !== '초기화 오류') noteError('치명', e, window.__game?.time || 0);
  const b = document.createElement('button'); b.type = 'button'; b.className = 'pbtn'; b.textContent = '오류 복사';
  b.onclick = () => copyReport(reportPlace()).then((ok) => { b.textContent = ok ? '복사했습니다' : '복사하지 못했습니다'; });
  p.appendChild(b);
  console.error(e);
}
// where the player was, for the error report
function reportPlace() { try { return window.__game?.reportPlace() || {}; } catch (e) { return {}; } }

(async () => {
  let eng, game;
  const loading = initLoading();
  // opened as a file, the page cannot read the game files next to it
  if (location.protocol === 'file:') { loading.set(0, 'Korea.exe로 실행해 주세요 (index.html을 직접 열면 게임 파일을 읽을 수 없습니다)'); return; }
  keepLauncher();
  initCredits();   // the credits and licences screen, reachable from the title screen while loading (EV-84)
  try {
    const mark = (n) => { try { performance.mark('boot:' + n); } catch (e) { /* no marks */ } };   // boot stage times for the boot gate (EV-93)
    await preloadFiles(); mark('preload');   // files that synchronous set-up code decodes (engine HDRIs, block and landmark shapes, country roads)
    eng = createEngine(el('game'), q);
    await RAPIER.init(); mark('engine');
    await loadBaked(); mark('baked');   // the baked world must be in place before the first terrain/road query
    await initDetail();   // mounts the high pack next to the page (world/high/) when the high detail is chosen
    // the compiled regions' raster tiles (EV-01): mounted, and those around the start (the plaza by the origin) read before the world is built
    if (globalThis.__WORLD && await mountRegionTiles()) { await regionLoad(0, 0, REG_REACH); mark('region'); }
    // the high world detail starts at the 'high' graphics level (shadows, post-processing, textures) unless the player or the URL chose one
    { let stored = null; try { stored = sessionStorage.getItem('neon_q'); } catch (e) { /* ignore */ } if (detail.tier === 'high' && !params.has('q') && stored === null && !mobile) eng.setQuality(Math.max(q, 2)); }
    if (detail.tier === 'high') await loadHiAssets(eng.renderer);   // the pack's compressed textures, before the world that uses them is built
    // the baked ground tiles of the embedded world: their colours resident, their heights streamed and read at once when missing (heightmap.js)
    if (globalThis.__WORLD) { const wd = globalThis.__WORLD; setTileReader((k) => syncChunk(wd, k)); globalThis.__HM_TILES = await loadResident(wd); }
    if (globalThis.__WORLD) await loadVeg(globalThis.__WORLD);   // and where things grow
    mark('world-data');
    game = new Game(eng); game.RAPIER = RAPIER; initKeyUI();
    window.__game = game; window.__THREE = THREE; window.__furn = { ids: furnitureIds, info: furnitureInfo, mat: furnitureMaterial }; window.__V = V; window.__AIM = AIM; window.__gesture = { procGesture, gesture };
    game.perfOv = new PerfOverlay(game);   // F3 device performance overlay (EV-92)
    installTestApi(game);   // window.__test: the verbs tests use instead of Game's fields (EV-96)
    await game.init((p, t) => loading.set(p, t)); mark('game');
    furnitureReady();   // prepare the furniture models during loading, not in the middle of the first building that opens
    game.buildings.warm(game.player.x, game.player.z, game.player.y || 0);
    game.prewarmShaders(); mark('ready');
  } catch (e) { fatal(e); return; }
  const go = el('go');
  initDetailUI(() => location.reload());   // a change of world detail rebuilds the world: only offered here, before the game starts
  go.classList.add('rdy'); loading.ready();
  const begin = () => {
    if (game.running) return;
    const t = el('title'); t.classList.add('off');
    setTimeout(() => { t.style.display = 'none'; }, 1300);   // after the fade: no full-screen layer and no title animations ticking over the game
    game.start();
    initBuildingDev(game, params);   // building numbers: ?ids=1 shows them, ?bld=<uid> starts at that building, __bld in the console
    // ?view=n (1..12): a reference view (views.js) for comparing pictures across machines; the HUD is hidden as in the phone's photo mode
    if (params.has('view')) applyView(game, +params.get('view') - 1).then(() => document.body.classList.add('photo')).catch((e) => console.warn('view', e));
  };
  go.addEventListener('click', begin);
  addEventListener('keydown', (e) => {
    if (!game.running && go.classList.contains('rdy') && !e.metaKey && !e.ctrlKey && e.code !== 'F12') begin();
    else if (game.running && !e.repeat && binds.is(e.code, 'perf')) { e.preventDefault(); if (e.shiftKey) game.perfOv.copy(); else game.perfOv.toggle(); }
    else if (game.running && !e.repeat && (binds.is(e.code, 'help') || (e.code === 'Escape' && el('helpov').classList.contains('on')))) { const on = !el('helpov').classList.contains('on') && e.code !== 'Escape'; if (on) renderHelp(); el('helpov').classList.toggle('on', on); }
  });
  eng.onQuality = () => { try { sessionStorage.setItem('neon_q', String(eng.qIndex)); } catch (e) { /* ignore */ } };
  let last = performance.now();
  const loop = (now) => {
    const cap = game.opt?.fpsCap;   // the player's frame cap (settings.js): a frame that comes early is skipped, the time it left carries into the next
    if (cap && now - last < 1000 / cap - 1.5) { requestAnimationFrame(loop); return; }
    const dt = Math.min((now - last) / 1000, 0.1); last = now;
    try {
      if (!game.running) { /* black title: nothing is rendered */ } else game.update(dt);
    } catch (e) { fatal(e, '실행 오류 (같은 부분이 계속 실패해 게임을 멈췄습니다)'); return; }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})();
