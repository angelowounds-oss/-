// Property-based interactions: anything registered here exposes verbs (F / G / T) that the HUD offers.
export class Interact {
  constructor(G) { this.G = G; this.set = new Set(); this.providers = []; }
  add(o) { this.set.add(o); return o; }
  remove(o) { this.set.delete(o); }
  // providers: functions (pl, out) pushing candidates {x,z,cy,r,verbs,name}
  query(pl) {
    let best = null, bs = 1e9;
    const eye = pl.y + 1.0;
    const test = (o) => {
      const dx = pl.x - o.x, dz = pl.z - o.z, d = Math.hypot(dx, dz);
      if (d > o.r) return;
      if (o.cy != null && Math.abs(o.cy - eye) > 1.9) return;
      const vs = o.verbs.filter((v) => !v.enabled || v.enabled());
      if (!vs.length) return;
      const s = d / o.r;
      if (s < bs) { bs = s; best = { obj: o, verbs: vs, name: o.name || '' }; }
    };
    for (const o of this.set) test(o);
    const tmp = [];
    for (const p of this.providers) { tmp.length = 0; p(pl, tmp); for (const o of tmp) test(o); }
    return best;
  }
  run(sel, key, pl) {
    if (!sel) return false;
    const v = sel.verbs.find((x) => x.key === key);
    if (!v) return false;
    v.run(pl, sel.obj); return true;
  }
}
