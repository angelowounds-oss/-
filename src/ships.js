import * as THREE from 'three';
import { cities, SEA } from './worldmap.js';

// Ships in the harbour basin of the port city (ADR-0012): a freighter loaded with containers moored at the quay, and two that sail in from the open sea and
// out again on a slow timetable. Not physics objects: positions are a function of the clock; drawn only within 14 km of the camera.
const COLS = [0xb23a22, 0x2f5fa8, 0xd29a1c, 0x2f8a55, 0x8a8c92];
function freighter(tanker) {
  const g = new THREE.Group(), hull = new THREE.MeshStandardMaterial({ color: tanker ? 0x2a2f38 : 0x1d2a3d, roughness: 0.7, metalness: 0.3 }), deck = new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 0.8 });
  const add = (w, h, d, x, y, z, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
  add(26, 12, 170, 0, 2, 0, hull); add(22, 0.4, 150, 0, 8.2, -4, deck);
  add(18, 20, 20, 0, 18, -62, new THREE.MeshStandardMaterial({ color: 0xe8ecef, roughness: 0.6 }));
  { const w = new THREE.Mesh(new THREE.BoxGeometry(18.4, 1.6, 20.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.8, 0.5).multiplyScalar(2.2), toneMapped: false })); w.position.set(0, 21, -62); g.add(w); }
  if (!tanker) for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) { const h = 2.6 * (1 + ((i + j) % 3)); add(7, h, 13, -8 + j * 8, 8.4 + h / 2, 55 - i * 14, new THREE.MeshStandardMaterial({ color: COLS[(i * 3 + j) % 5], roughness: 0.6 })); }
  else add(20, 4, 120, 0, 10, 20, new THREE.MeshStandardMaterial({ color: 0x3a3d44, roughness: 0.5, metalness: 0.4 }));
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.2, 0.2).multiplyScalar(3), toneMapped: false })); lamp.position.set(0, 30, -62); g.add(lamp);
  return g;
}
export class Ships {
  constructor(G) {
    this.G = G; this.group = new THREE.Group(); this.ships = [];
    const c = cities().find((q) => q.seaDir); if (!c) return;
    const d = c.seaDir, R = c.r, at = (t) => ({ x: c.x + d.x * R * t, z: c.z + d.z * R * t }), heading = Math.atan2(d.x, d.z);
    // a moored one at the quay (0.9 R) lying along the shore, two sailing the lane from 2.6 R to 1.05 R and back
    const m = freighter(false); const p = at(0.98); m.position.set(p.x - d.z * 55, SEA + 2, p.z + d.x * 55); m.rotation.y = Math.atan2(-d.z, d.x) + Math.PI / 2 * 0 + 0; m.rotation.y = Math.atan2(d.x, d.z) + Math.PI / 2; this.group.add(m); this.ships.push({ g: m, moored: true });
    [0, 0.5].forEach((off, k) => { const s = freighter(k === 1); this.group.add(s); this.ships.push({ g: s, off, at, heading, P: 420 }); });
    G.scene.add(this.group);
  }
  update(dt) {
    const cam = this.G.camera.position, t = this.G.time;
    for (const s of this.ships) {
      if (s.moored) { s.g.visible = Math.hypot(s.g.position.x - cam.x, s.g.position.z - cam.z) < 14000; continue; }
      const ph = ((t / s.P + s.off) % 1) * 2, u = ph < 1 ? ph : 2 - ph, k = 2.7 - 1.65 * u, p = s.at(k);   // out of the open sea toward the quay and back (stern first on the way out)
      s.g.visible = Math.hypot(p.x - cam.x, p.z - cam.z) < 14000; s.g.position.set(p.x, SEA + 2, p.z); s.g.rotation.y = s.heading + (ph < 1 ? Math.PI : 0);
    }
  }
}
