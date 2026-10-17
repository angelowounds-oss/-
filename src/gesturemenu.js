import { gesture } from './gesture.js';

// K opens a short list of gestures and short actions; the digit keys play one (the game's own digit keys are held back while it is open).
// Nearby calm people answer a wave, a nod or a bow, so the motions are visible from both sides.
const LIST = [['wave', '손 흔들기'], ['nod', '끄덕임'], ['yes', '맞아요'], ['no', '아니요'], ['shrug', '글쎄'], ['salute', '경례'], ['bow', '인사'], ['cheer2', '환호'], ['dance', '춤'], ['phone', '통화'], ['foldarms', '팔짱']];
const REPLY = { wave: 'wave', nod: 'nod', bow: 'bow', salute: 'nod', cheer2: 'cheer' };

export class GestureMenu {
  constructor(G) {
    this.G = G; this.open = false;
    const el = this.el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:30;display:none;padding:8px 12px;background:rgba(10,14,22,.82);border:1px solid rgba(120,220,255,.5);border-radius:6px;color:#dff;font:12px/1.6 "Space Mono",monospace;columns:2;column-gap:18px';
    el.innerHTML = LIST.map(([, label], i) => `<div>${(i + 1) % 10} · ${label}</div>`).join('');
    document.body.appendChild(el);
    addEventListener('keydown', (e) => {
      if (!this.open) return;
      const n = e.code.startsWith('Digit') ? +e.code.slice(5) : -1;
      if (n >= 0) { e.stopPropagation(); e.preventDefault(); const i = (n + 9) % 10; if (LIST[i]) this.play(LIST[i][0]); this.toggle(false); }
      else if (e.code === 'Escape') this.toggle(false);
    }, true);
  }
  toggle(on = !this.open) { this.open = on; this.el.style.display = on ? 'block' : 'none'; }
  play(name) {
    const G = this.G, pl = G.player;
    if (!gesture(pl, name, { upper: true, moving: true })) { G.toast('지금은 할 수 없습니다'); return false; }
    const reply = REPLY[name]; if (!reply) return true;
    let best = null, bd = 64;
    for (const h of G.humans) { if (h === pl || h.dead || h.hidden || h.inside || h.team !== 'civ' || h.state === 'flee' || h.state === 'attack') continue; const d = (h.x - pl.x) ** 2 + (h.z - pl.z) ** 2; if (d < bd) { bd = d; best = h; } }
    if (best) setTimeout(() => { if (!best.dead) gesture(best, reply, { upper: true }); }, 700);
    return true;
  }
}
