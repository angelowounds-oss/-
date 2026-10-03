import * as THREE from 'three';
import { nightU, skyU } from './shaders.js';
import { clamp, lerp } from './util.js';

const C = (h) => new THREE.Color(h);
const NIGHT = { fog: C(0x0b0c22), bg: C(0x070816), hemiS: C(0x5a5cc8), hemiG: C(0x14202e), key: C(0x8ea4ff) };
const DAY = { fog: C(0x8a95a6), bg: C(0x9aa6b8), hemiS: C(0xa6bbd6), hemiG: C(0x4a4f58), key: C(0xfff0dc) };
const DUSK = C(0xff9a5c);
const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// 24h cycle: sky dome, sun/moon light, fog, city lighting uniforms, exposure
export class DayNight {
  constructor(G) { this.G = G; this.k = 0; this.tmp = new THREE.Color(); this.sun = new THREE.Vector3(); this.moon = new THREE.Vector3(); }
  update(dt, focus) {
    const G = this.G, e = G.eng, h = G.clock.hour;
    const th = (h - 6) / 12 * Math.PI;                    // sun arc: rises east(+x) at 06:00, sets west at 18:00
    const sinE = Math.sin((h - 6) / 24 * Math.PI * 2);
    const D = sm(-0.10, 0.28, sinE);                       // daylight
    const night = 1 - sm(-0.06, 0.30, sinE);
    const twi = Math.exp(-Math.pow(sinE / 0.2, 2));
    nightU.value = night; skyU.uDay.value = D; skyU.uTwi.value = twi;
    this.sun.set(Math.cos(th), Math.sin(th), -0.35).normalize(); this.moon.set(-Math.cos(th) * 0.8 - 0.2, Math.max(0.25, -Math.sin(th)), 0.5).normalize();
    skyU.uSun.value.copy(this.sun); skyU.uMoon.value.copy(this.moon);
    const useSun = D > 0.35;
    const dir = useSun ? this.sun : this.moon;
    const fx = focus.x, fz = focus.z, snap = 4, sx = Math.round(fx / snap) * snap, sz = Math.round(fz / snap) * snap;
    const moon = e.moon;
    moon.target.position.set(sx, 0, sz);
    moon.position.set(sx + dir.x * 120, Math.max(30, dir.y * 130), sz + dir.z * 120);
    const sunI = D * (0.55 + 0.9 * clamp(sinE, 0, 1)) * 1.25, moonI = 0.85 * (1 - D);
    moon.intensity = this.flashBase = Math.max(sunI, moonI) * (G.indoor ? 0.0 : 1);
    moon.color.copy(NIGHT.key).lerp(DAY.key, D).lerp(DUSK, twi * D * 0.7);
    const hemi = e.hemi, hb = lerp(0.22, 1.0, D);
    hemi.intensity = G.indoor ? Math.max(0.5, hb) : hb;
    hemi.color.copy(NIGHT.hemiS).lerp(DAY.hemiS, D); hemi.groundColor.copy(NIGHT.hemiG).lerp(DAY.hemiG, D);
    const fogC = this.tmp.copy(NIGHT.fog).lerp(DAY.fog, D).lerp(DUSK, twi * 0.18);
    e.scene.fog.color.copy(fogC); e.scene.fog.density = lerp(0.0105, 0.0072, D);
    e.scene.background.copy(NIGHT.bg).lerp(DAY.bg, D); e.renderer.setClearColor(e.scene.background, 1);
    e.renderer.toneMappingExposure = lerp(1.05, 0.88, D);
    e.scene.environmentIntensity = lerp(0.45, 0.85, D);
    e.bloom.strength = e.q.bloom * lerp(1, 0.5, D);
    for (const m of G.world.dayMats || []) m.color.setScalar(0.25 + 0.75 * night);
    G.world.sky.position.copy(G.camera.position);
    moon.intensity += (G.boltAdd || 0) * 2.6 * (G.indoor ? 0 : 1); hemi.intensity += (G.boltAdd || 0) * 0.8;
    G.dayK = D;
  }
}
