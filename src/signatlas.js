import * as THREE from 'three';

// The road name plates of the streets (WLD-24g-4): every name is drawn once into a shared canvas atlas (one texture, one material, so a new name never
// compiles a program), counted by the tiles that use it and given back when the last of them is dropped. The text is the map's own name of the road
// (OpenStreetMap `name`, Korean in Korea) set in the system's Korean sans-serif: Malgun Gothic on Windows, Apple SD Gothic Neo on a Mac, Noto Sans KR or
// WenQuanYi Zen Hei on Linux. No font file ships with the game for it (docs/ASSETS.md). The plate is the blue of Korea's road name signs with white text.
const W = 2048, H = 2048, SW = 512, SH = 112, COLS = W / SW, ROWS = Math.floor(H / SH);
export const PLATE_BLUE = '#1b4a8c';
const FONT = "'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', 'Noto Sans CJK KR', 'WenQuanYi Zen Hei', sans-serif";

export class SignAtlas {
  constructor() {
    this.canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (this.canvas) { this.canvas.width = W; this.canvas.height = H; }
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
    this.tex = this.canvas ? new THREE.CanvasTexture(this.canvas) : new THREE.Texture();
    this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 4;
    this.slots = new Map();   // name -> { k, refs }
    this.free = []; for (let k = COLS * ROWS - 1; k >= 0; k--) this.free.push(k);
    this.dirty = false; this.full = 0;
  }
  get capacity() { return COLS * ROWS; }
  // the uv rectangle of a name (u0, v0, u1, v1), drawing it when it is new; null when the atlas is full
  take(name) {
    let s = this.slots.get(name);
    if (!s) {
      if (!this.free.length) { this.full++; return null; }
      s = { k: this.free.pop(), refs: 0 }; this.slots.set(name, s); this.draw(name, s.k);
    }
    s.refs++;
    const c = s.k % COLS, r = Math.floor(s.k / COLS);
    return [c * SW / W, 1 - (r + 1) * SH / H, (c + 1) * SW / W, 1 - r * SH / H];
  }
  give(name) { const s = this.slots.get(name); if (!s) return; if (--s.refs <= 0) { this.slots.delete(name); this.free.push(s.k); } }
  draw(name, k) {
    const g = this.ctx; if (!g) return;
    const x = (k % COLS) * SW, y = Math.floor(k / COLS) * SH;
    g.fillStyle = PLATE_BLUE; g.fillRect(x, y, SW, SH);
    g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.strokeRect(x + 7, y + 7, SW - 14, SH - 14);
    // as large as fits: the size drops for a long name so the whole name stays on the plate
    let size = 70; g.font = `bold ${size}px ${FONT}`;
    while (size > 30 && g.measureText(name).width > SW - 48) { size -= 4; g.font = `bold ${size}px ${FONT}`; }
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, x + SW / 2, y + SH / 2 + 3, SW - 40);
    this.dirty = true;
  }
  // the texture is uploaded at most once per call (the renderer calls it a few times a second), not once per new name
  flush() { if (this.dirty) { this.tex.needsUpdate = true; this.dirty = false; } }
}
export const PLATE = { w: 2.2, h: 0.48 };   // metres: an overhead road name plate on a signal arm
