// Distance packing for static instanced meshes (street furniture, trees, the pine forests around the city).
// three.js draws an InstancedMesh as one call with one bounding sphere around all of its instances, so every lamp post and pine of the map
// went down the pipeline each frame - most of them hundreds of metres into the fog, where FogExp2 leaves nothing of them on screen.
// Here the full instance list stays on the CPU and only instances that can still show are packed to the front of the GPU buffers
// (mesh.count = how many). "Can still show": FogExp2 = 1 - exp(-(density * depth)^2) passes 99.95 % beyond depth 2.76 / density; depth is
// measured along the view axis, so the distance limit is that divided by the cosine of the widest frustum corner (any view direction), plus a
// margin. The packing is redone only after the camera moved a quarter of the margin (or the fog thinned / the view widened), spread over
// a few frames at ~1 ms each - never a per-frame cost.
const SAFE_FOG = 2.76;
const MARGIN = 40;

class Packed {
  constructor(mesh) {
    this.mesh = mesh; this.n = mesh.count; this.ready = false;
    const geo = mesh.geometry;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    const attrs = [mesh.instanceMatrix];
    if (mesh.instanceColor) attrs.push(mesh.instanceColor);
    for (const k in geo.attributes) if (geo.attributes[k].isInstancedBufferAttribute) attrs.push(geo.attributes[k]);
    this.attrs = attrs.map((a) => ({ a, k: a.itemSize, src: a.array.slice(0, this.n * a.itemSize) }));
    this.slot = new Int32Array(this.n).fill(-1);   // packed position of each original instance (-1 = not drawn)
    mesh.frustumCulled = true;   // with an exact sphere around the packed instances (set in pack)
    this.shown = -1;
  }
  // world-space bounding spheres of the instances (once, when the mesh hangs in the scene with its final transform)
  prepare() {
    const m = this.mesh, e = this.attrs[0].src, s = m.geometry.boundingSphere, c = s.center;
    m.updateWorldMatrix(true, false);
    const w = m.matrixWorld.elements, ws = Math.max(Math.hypot(w[0], w[1], w[2]), Math.hypot(w[4], w[5], w[6]), Math.hypot(w[8], w[9], w[10]));
    const P = this.pos = new Float32Array(this.n * 4), L = this.loc = new Float32Array(this.n * 4);   // world (distance test) / mesh-local (bounds)
    for (let i = 0; i < this.n; i++) {
      const o = i * 16;
      const lx = e[o] * c.x + e[o + 4] * c.y + e[o + 8] * c.z + e[o + 12], ly = e[o + 1] * c.x + e[o + 5] * c.y + e[o + 9] * c.z + e[o + 13], lz = e[o + 2] * c.x + e[o + 6] * c.y + e[o + 10] * c.z + e[o + 14];
      const lr = s.radius * Math.max(Math.hypot(e[o], e[o + 1], e[o + 2]), Math.hypot(e[o + 4], e[o + 5], e[o + 6]), Math.hypot(e[o + 8], e[o + 9], e[o + 10]));
      L[i * 4] = lx; L[i * 4 + 1] = ly; L[i * 4 + 2] = lz; L[i * 4 + 3] = lr;
      P[i * 4] = w[0] * lx + w[4] * ly + w[8] * lz + w[12]; P[i * 4 + 1] = w[1] * lx + w[5] * ly + w[9] * lz + w[13]; P[i * 4 + 2] = w[2] * lx + w[6] * ly + w[10] * lz + w[14];
      P[i * 4 + 3] = lr * ws;
    }
    this.ready = true;
  }
  pack(x, y, z, cut) {
    if (!this.ready) this.prepare();
    const P = this.pos, slot = this.slot;
    let k = 0, same = true;
    if (this.maxCut) cut = Math.min(cut, this.maxCut);   // detail meshes (facade relief) stop earlier than the fog does
    for (let i = 0; i < this.n; i++) {
      const dx = P[i * 4] - x, dy = P[i * 4 + 1] - y, dz = P[i * 4 + 2] - z, lim = cut + P[i * 4 + 3];
      const on = dx * dx + dy * dy + dz * dz < lim * lim;
      const want = on ? k++ : -1;
      if (slot[i] !== want) { same = false; slot[i] = want; }
    }
    if (same && k === this.shown) return;
    this.shown = k;
    for (const t of this.attrs) {
      const src = t.src, dst = t.a.array, sz = t.k;
      for (let i = 0; i < this.n; i++) { const j = slot[i]; if (j >= 0) for (let c = 0; c < sz; c++) dst[j * sz + c] = src[i * sz + c]; }
      t.a.clearUpdateRanges(); if (k) t.a.addUpdateRange(0, k * sz); t.a.needsUpdate = true;
    }
    // bounding sphere of what is packed (three.js would recompute it per instance with matrix math): frustum culling then works per mesh, and
    // an empty mesh sits far below the map so it is never drawn (no program switch for zero instances)
    const m = this.mesh, bs = m.boundingSphere || (m.boundingSphere = m.geometry.boundingSphere.clone());
    if (!k) { bs.center.set(0, -1e7, 0); bs.radius = 0; }
    else {
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      const L = this.loc;
      for (let i = 0; i < this.n; i++) if (slot[i] >= 0) { const o = i * 4, r = L[o + 3]; x0 = Math.min(x0, L[o] - r); x1 = Math.max(x1, L[o] + r); y0 = Math.min(y0, L[o + 1] - r); y1 = Math.max(y1, L[o + 1] + r); z0 = Math.min(z0, L[o + 2] - r); z1 = Math.max(z1, L[o + 2] + r); }
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
      let rad = 0; for (let i = 0; i < this.n; i++) if (slot[i] >= 0) { const o = i * 4; rad = Math.max(rad, Math.hypot(L[o] - cx, L[o + 1] - cy, L[o + 2] - cz) + L[o + 3]); }
      bs.center.set(cx, cy, cz); bs.radius = rad;
    }
    m.count = k;
  }
  // a colour written by original index (zone power cuts on the lamp heads): kept in the full list and in the packed slot when drawn
  setColor(i, col) {
    const t = this.attrs.find((x) => x.a === this.mesh.instanceColor); if (!t) return;
    t.src[i * 3] = col.r; t.src[i * 3 + 1] = col.g; t.src[i * 3 + 2] = col.b;
    const j = this.slot[i]; if (j >= 0 || this.shown < 0) { const d = t.a.array, o = (this.shown < 0 ? i : j) * 3; d[o] = col.r; d[o + 1] = col.g; d[o + 2] = col.b; }
  }
  // overwrite one instance's matrix by original index (a building collapse hides its signs and rooftop clutter): kept in the full list and,
  // when it is currently drawn, in its packed slot too - no re-pack needed
  setMatrix(i, m16) {
    const t = this.attrs[0], o = i * 16; for (let c = 0; c < 16; c++) t.src[o + c] = m16[c];
    const j = this.shown < 0 ? i : this.slot[i]; if (j < 0) return;
    const d = t.a.array; for (let c = 0; c < 16; c++) d[j * 16 + c] = m16[c];
    t.a.clearUpdateRanges(); t.a.needsUpdate = true;
  }
  flushColor() { const c = this.mesh.instanceColor; if (c) { c.clearUpdateRanges(); c.needsUpdate = true; } }
}

// Where it is applied: inside the city below rooftop height, where everything beyond the fog distance is fogged in front of fogged ground,
// buildings or hills (renders checked pixel-identical in every direction, at the edges too). Out on the terrain or high up, a fully fogged
// object can still stand as a fog-coloured silhouette against the sky dome, so there the instances are all drawn as before.
export const instCull = {
  list: [], x: 1e9, y: 0, z: 1e9, cut: 0, region: null,   // region: { half, maxY } set by the world
  job: null,   // a re-pack in progress: { x, y, z, cut, i } - spread over frames at ~1 ms each (all items use the same camera position)
  add(...meshes) { for (const m of meshes) if (m && m.isInstancedMesh && m.count > 0) { const p = new Packed(m); m.userData.packed = p; this.list.push(p); } },
  update(cam, fog) {
    if (!fog || !this.list.length) return;
    if (this.job) { this.work(); return; }
    const th = Math.tan(cam.fov * Math.PI / 360), tw = th * cam.aspect;
    const p = cam.position, R = this.region;
    const inside = R && Math.abs(p.x) < R.half && Math.abs(p.z) < R.half && p.y < R.maxY;
    const cut = inside ? SAFE_FOG / Math.max(fog.density, 1e-4) * Math.sqrt(1 + th * th + tw * tw) + MARGIN : 1e6;
    if (!inside) { if (this.cut < 1e6) this.start(p, 1e6); return; }
    // re-pack after a quarter of the margin: the job finishes within a few frames, well before the camera uses up the rest
    const moved = Math.hypot(p.x - this.x, p.y - this.y, p.z - this.z);
    if (moved + Math.max(0, cut - this.cut) < MARGIN / 4 && cut > this.cut - MARGIN) return;
    this.start(p, cut);
  },
  start(p, cut) { this.job = { x: p.x, y: p.y, z: p.z, cut, i: 0 }; this.work(); },
  work() {
    const j = this.job, t0 = performance.now();
    do { this.list[j.i++].pack(j.x, j.y, j.z, j.cut); } while (j.i < this.list.length && performance.now() - t0 < 1);
    if (j.i >= this.list.length) { this.x = j.x; this.y = j.y; this.z = j.z; this.cut = j.cut; this.job = null; }
  },
};
