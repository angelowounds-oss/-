import { createEngine, QUALITY } from './engine.js';
import { Game } from './game.js';
import { el } from './util.js';
import * as V from './vehicle.js';
import { AIM } from './assets.js';

const params = new URLSearchParams(location.search);
const mobile = matchMedia('(pointer:coarse)').matches;
let q = params.has('q') ? +params.get('q') : mobile ? 1 : 2;
try { const s = +sessionStorage.getItem('neon_q'); if (s >= 0 && s <= 3 && sessionStorage.getItem('neon_q') !== null && !params.has('q')) q = s; } catch (e) { /* ignore */ }

function fatal(e) {
  const p = el('err'); p.style.display = 'block'; p.textContent = '초기화 오류\n' + (e && e.stack || e);
  console.error(e);
}

(async () => {
  let eng, game;
  try {
    eng = createEngine(el('game'), q);
    game = new Game(eng);
    window.__game = game; window.__V = V; window.__AIM = AIM;
    const bar = el('loadBar').firstElementChild, txt = el('loadTxt');
    await game.init((p, t) => { bar.style.width = p * 100 + '%'; txt.textContent = t; });
  } catch (e) { fatal(e); return; }
  const go = el('go');
  go.classList.add('rdy');
  const begin = () => {
    if (game.running) return;
    el('title').classList.add('off');
    game.start();
  };
  go.addEventListener('click', begin);
  addEventListener('keydown', (e) => { if ((e.code === 'Enter') && !game.running && go.classList.contains('rdy')) begin(); });
  eng.onQuality = () => { try { sessionStorage.setItem('neon_q', String(eng.qIndex)); } catch (e) { /* ignore */ } };
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min((now - last) / 1000, 0.1); last = now;
    try {
      if (!game.running) game.attract(dt); else game.update(dt);
    } catch (e) { fatal(e); return; }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
})();
