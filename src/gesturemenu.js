import { gesture, procGesture } from './gesture.js';

// The gesture key (B by default, keys.js) opens a short list of gestures and short actions; the digit keys play one, 0 turns the page (the game's own digit keys are held back while it
// is open). Nearby calm people answer a wave, a nod, a bow, a handshake, a hug or a clap, so the motions are visible from both sides.
const PAGES = [
  [['wave', '손 흔들기'], ['nod', '끄덕임'], ['yes', '맞아요'], ['no', '아니요'], ['shrug', '글쎄'], ['salute', '경례'], ['bow', '인사'], ['cheer2', '환호'], ['dance', '춤']],
  [['handshake', '악수'], ['hug', '포옹'], ['clap', '박수'], ['point', '가리키기'], ['think', '생각'], ['facepalm', '한숨(이마 짚기)'], ['wipe', '땀 닦기'], ['stretch', '기지개'], ['typing', '타이핑']],
  [['phone', '통화'], ['foldarms', '팔짱'], ['stir', '요리(젓기)'], ['eat', '먹기'], ['drink', '마시기'], ['listen', '경청'], ['angry', '화내기'], ['tired', '지침'], ['shiver', '떨기']],
];
const REPLY = { wave: 'wave', nod: 'nod', bow: 'bow', salute: 'nod', cheer2: 'cheer', handshake: 'handshake', hug: 'hug', clap: 'clap' };

export class GestureMenu {
  constructor(G) {
    this.G = G; this.open = false; this.page = 0;
    const el = this.el = document.createElement('div');
    el.style.cssText = 'position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:30;display:none;padding:8px 12px;background:rgba(10,14,22,.82);border:1px solid rgba(120,220,255,.5);border-radius:6px;color:#dff;font:12px/1.6 "Space Mono",monospace;columns:2;column-gap:18px';
    document.body.appendChild(el);
    addEventListener('keydown', (e) => {
      if (!this.open) return;
      const n = e.code.startsWith('Digit') ? +e.code.slice(5) : -1;
      if (n === 0) { e.stopPropagation(); e.preventDefault(); this.page = (this.page + 1) % PAGES.length; this.render(); }
      else if (n > 0) { e.stopPropagation(); e.preventDefault(); const it = PAGES[this.page][n - 1]; if (it) this.play(it[0]); this.toggle(false); }
      else if (e.code === 'Escape') this.toggle(false);
    }, true);
  }
  render() { this.el.innerHTML = PAGES[this.page].map(([, label], i) => `<div>${i + 1} · ${label}</div>`).join('') + `<div>0 · 다음 쪽 (${this.page + 1}/${PAGES.length})</div>`; }
  toggle(on = !this.open) { this.open = on; if (on) this.render(); this.el.style.display = on ? 'block' : 'none'; }
  play(name, who = this.G.player) {
    const G = this.G, pl = G.player;
    const ok = who === pl ? (procGesture(pl, name) || gesture(pl, name, { upper: true, moving: true })) : (procGesture(who, name) || gesture(who, name, { upper: true }));
    if (!ok) { if (who === pl) G.toast('지금은 할 수 없습니다'); return false; }
    const reply = REPLY[name]; if (!reply || who !== pl) return true;
    let best = null, bd = 64;
    for (const h of G.humans) { if (h === pl || h.dead || h.hidden || h.inside || h.team !== 'civ' || h.state === 'flee' || h.state === 'attack') continue; const d = (h.x - pl.x) ** 2 + (h.z - pl.z) ** 2; if (d < bd) { bd = d; best = h; } }
    if (best) setTimeout(() => { if (!best.dead) this.play(reply, best); }, 700);
    return true;
  }
}
