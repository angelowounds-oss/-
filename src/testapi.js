// window.__test (EV-96): the few verbs tests need (teleport, time, weather, spawn, step, measure), so a test does not reach into Game's fields
// and break when they move (EV-95 splits Game). Nothing here runs unless a test calls it; the player never sees it.
import { Vehicle } from './vehicle.js';
import { signalState } from './streetgeo.js';
import { regionLoad } from './region.js';
import { carriage } from './carriage.js';

// installs the API over one Game; returns it for tests that import it directly
export function installTestApi(G) {
  const api = {
    version: 1,
    // the player on foot at (x, z), on the ground there unless y is given; drops out of a car first
    teleport(x, z, y) {
      const pl = G.player; if (G.vehicle && G.exitVehicle) G.exitVehicle(true);
      const yy = y ?? G.groundY(x, z, 1e9); pl.body3.teleport(x, yy, z); pl.x = x; pl.y = yy; pl.z = z; pl.vx = pl.vy = pl.vz = 0; pl.dead = false;
      return { x, y: yy, z };
    },
    // the same after the streamed region tiles around (x, z) are in (EV-01): a jump that then reads none of them at once (regionload.js sync)
    async arrive(x, z, y, reach = 4000) { await regionLoad(x, z, reach); return api.teleport(x, z, y); },
    // the clock at an hour of today (0-24, fractions allowed)
    time(hour) { const c = G.clock; c.t = Math.floor(c.t / 1440) * 1440 + hour * 60; return c.hour; },
    // the weather held until changed: 'clear' | 'rain' | 'storm'; wet defaults to 0 / 1 / 1.4 as the daynight cycle sets it
    weather(type, wet) { G.state.weather = { type, until: G.clock.t + 1e9 }; G.daynight.wet = wet ?? ({ clear: 0, rain: 1, storm: 1.4 }[type] ?? 1); return type; },
    // a car of a type at (x, z) heading h (forward = (sin h, cos h)), standing on the surface at y when given (a deck); kind 'parked' sleeps,
    // 'drive' is awake for the player to take, 'lab' is stepped by the test itself; `as` builds it as another vehicle kind ('police', 'traffic')
    // with that kind's options ({ taxi: true }), for tests of a model
    spawn(type, x, z, h = 0, kind = 'parked', color = 0x777777, y, as = 'parked', opts = {}) {
      const v = new Vehicle(G, type, color, as, opts); v.x = x; v.z = z; v.h = h; v.awake = kind !== 'parked'; if (y !== undefined) v.spawnY = y;
      G.addVehicle(v); if (kind === 'lab') { v.kind = 'lab'; v.driver = 'lab'; }
      return v;
    },
    // n fixed steps of dt through the frozen loop (tests/lib.cjs freeze) or the game's own update
    step(n = 1, dt = 1 / 60) { const up = window.__upd || ((d) => G.update(d)); for (let i = 0; i < n; i++) up(dt); return G.time; },
    // the signalled junctions and the crossings of the street tiles built within r of (x, z) (streetscape.js auditOf), for the traffic audit
    streets(x, z, r = 200) {
      const S = G.streetscape, sig = [], xing = []; if (!S) return { sig, xing };
      for (const rec of S.tiles.values()) { const A = rec.tile && rec.tile.audit; if (!A) continue; for (const j of A.sig) if (Math.hypot(j.x - x, j.z - z) < r) sig.push(j); for (const c of A.xing) if (Math.hypot(c.x - x, c.z - z) < r) xing.push(c); }
      return { sig, xing };
    },
    // the half width of a compiled street's carriageway (carriage.js), for tests that check what stands on it (EV-25)
    carriageHalf(r) { return carriage(r).half; },
    // the light an arm of a signalled junction shows now: 0 red, 1 yellow, 2 green (the clock the signal heads use)
    signal(j, arm) { return signalState(j.arms[arm].g, G.streetscape ? G.streetscape.t : 0, j.phase); },
    // one snapshot of what tests watch: time, place, counts, memory and errors
    // the performance overlay (EV-92): switch it, and read its last window's numbers and the snapshot the player would copy
    perf(on) { if (on != null) G.perfOv.toggle(on); return { on: G.perfOv.on, text: G.perfOv.text, snapshot: G.perfOv.snapshot() }; },
    measure() {
      const pl = G.player, mem = performance.memory;
      return {
        t: G.time, hour: +G.clock.hour.toFixed(2), x: pl.x, y: pl.y, z: pl.z, inVehicle: !!G.vehicle,
        vehicles: G.vehicles.length, humans: G.humans.length, heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
        gcCount: window.__gcCount ?? null, errors: G.errors ? G.errors.length : 0,
        weather: G.state.weather?.type ?? null, wet: G.daynight.wet,
      };
    },
  };
  if (typeof window !== 'undefined') window.__test = api;
  return api;
}
