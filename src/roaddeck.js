import { physHeight } from './landfn.js';

// Physics decks (the drawn asphalt as a thin triangle mesh to stand on). Pure (no three.js): highways.js turns the lists into colliders, the tests count them.
// Where the ground under a road is not at the road's surface (a viaduct, a stacked interchange, a tunnel, a road at another height than the ground there)
// a quad of the asphalt is kept, 0.25 m below its surface; where it is, the ground is the floor and no mesh is made.
const DECK_DY = 0.25, DECK_TOL = 0.3, LANE = 3.75, MED = 3.2, SHOULDER = 2.4;
export class Deck {
  constructor() { this.P = []; this.I = []; this.n = 0; }
  off(c) { const h = physHeight(c[0], c[2], 8); return h === h && Math.abs(h - (c[1] - DECK_DY)) > DECK_TOL; }
  quadIfOff(a, b, c, d) {
    if (!(this.off(a) || this.off(b) || this.off(c) || this.off(d) || this.off([(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2]))) return;
    const k = this.P.length / 3; for (const q of [a, b, c, d]) this.P.push(q[0], q[1] - DECK_DY, q[2]);
    this.I.push(k, k + 1, k + 2, k, k + 2, k + 3, k + 2, k + 1, k, k + 3, k + 2, k); this.n++;
  }
}
// the half width of the drawn asphalt of a highway, ring or connector (both carriageways and the median) and of a ramp
export const oldHalf = (r) => (r.kind === 'ramp' ? 4.6 : MED / 2 + 3 * LANE + SHOULDER);
// the deck of the samples c0 .. c0 + count of a road that is not a compiled line; spans in `broken` have none
export function oldDeck(r, c0, count, broken) {
  const D = new Deck(), P = r.pts, n = P.length, half = oldHalf(r), m = r.closed ? n : n - 1;
  const fr = (i) => { const a = P[r.closed ? (i + n - 1) % n : Math.max(0, i - 1)], b = P[r.closed ? (i + 1) % n : Math.min(n - 1, i + 1)]; let tx = b[0] - a[0], tz = b[1] - a[1]; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l; return { x: P[i][0], z: P[i][1], y: r.y[i], rx: tz, rz: -tx }; };
  for (let i = c0; i < Math.min(c0 + count, m); i++) {
    if (broken && broken.has(r.id + ':' + i)) continue;
    const f0 = fr(i), f1 = fr((i + 1) % n);
    D.quadIfOff([f0.x - f0.rx * half, f0.y, f0.z - f0.rz * half], [f1.x - f1.rx * half, f1.y, f1.z - f1.rz * half], [f1.x + f1.rx * half, f1.y, f1.z + f1.rz * half], [f0.x + f0.rx * half, f0.y, f0.z + f0.rz * half]);
  }
  return D;
}
