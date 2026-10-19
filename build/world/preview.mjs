// Pictures for checking a compiled region by eye (ADR-0019): shaded relief, the OpenStreetMap reference on the same grid, and a true-scale profile.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require('../node_modules/sharp');

// tint by real height (so the legend reads in real metres), shade by game height (so the steepness shown is the game's)
const STOPS = [[-60, [28, 70, 120]], [-1, [70, 130, 180]], [0, [120, 165, 95]], [60, [150, 180, 105]], [200, [190, 190, 120]], [450, [170, 140, 95]], [800, [150, 125, 110]], [1200, [235, 235, 235]]];
function tint(h, out) {
  let a = STOPS[0], b = STOPS[STOPS.length - 1];
  for (let k = 0; k + 1 < STOPS.length; k++) if (h >= STOPS[k][0] && h <= STOPS[k + 1][0]) { a = STOPS[k]; b = STOPS[k + 1]; break; }
  const t = b[0] === a[0] ? 0 : Math.min(1, Math.max(0, (h - a[0]) / (b[0] - a[0])));
  for (let q = 0; q < 3; q++) out[q] = a[1][q] + (b[1][q] - a[1][q]) * t;
  return out;
}

// RGB bytes of the relief: R is the raster (real metres), V the height scale, g the cell (map metres)
// with gh (game heights from the water pass) the shading reads it directly and the water classes get their own colours
export function relief(R, V, gh = null) {
  const { nx, nz, h, g } = R, rgb = Buffer.alloc(nx * nz * 3), c = [0, 0, 0], H = gh || h, s0 = gh ? 1 : V;
  const L = [-Math.SQRT1_2 * Math.cos(Math.PI / 4), Math.sin(Math.PI / 4), -Math.SQRT1_2 * Math.cos(Math.PI / 4)];   // light from the north-west, 45 degrees up
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, hh = h[k];
    const dx = (H[j * nx + Math.min(nx - 1, i + 1)] - H[j * nx + Math.max(0, i - 1)]) * s0 / (2 * g), dz = (H[Math.min(nz - 1, j + 1) * nx + i] - H[Math.max(0, j - 1) * nx + i]) * s0 / (2 * g);
    const wet = R.water ? R.water[k] : hh > 0.5 ? 0 : 1;   // without the water pass the DEM's 0 m over the shallow west sea is the sea
    const n = [-dx, 1, -dz], l = Math.hypot(...n), s = wet ? 0.75 : Math.max(0, (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / l);
    if (wet === 2) { c[0] = 64; c[1] = 140; c[2] = 205; } else tint(wet ? (gh ? Math.min(-1, gh[k]) * 2.4 : -20) : hh, c);
    const f = wet ? 1 : 0.35 + 0.85 * s;
    for (let q = 0; q < 3; q++) rgb[k * 3 + q] = Math.max(0, Math.min(255, c[q] * f));
  }
  return rgb;
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
// panels side by side with a title each, and marks (pixel positions) drawn on every panel
export async function sheet(file, panels, nx, nz, marks) {
  const pad = 28, W = panels.length * (nx + 12) + 12, H = nz + pad + 12;
  const layers = panels.map((p, n) => ({ input: p.rgb, raw: { width: nx, height: nz, channels: 3 }, left: 12 + n * (nx + 12), top: pad }));
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
  panels.forEach((p, n) => {
    const ox = 12 + n * (nx + 12);
    svg += `<text x="${ox}" y="20" font-family="sans-serif" font-size="15" font-weight="bold" fill="#111">${esc(p.title)}</text>`;
    if (p.svg) svg += `<svg x="${ox}" y="${pad}" width="${nx}" height="${nz}" overflow="hidden">${p.svg}</svg>`;   // overlay in the panel's own pixels, clipped to it
    for (const m of marks) svg += `<circle cx="${ox + m.px}" cy="${pad + m.py}" r="3.5" fill="#d0021b" stroke="#fff" stroke-width="1.2"/><text x="${ox + m.px + 6}" y="${pad + m.py + 4}" font-family="sans-serif" font-size="11" fill="#111" stroke="#fff" stroke-width="2.5" paint-order="stroke">${esc(m.label)}</text>`;
  });
  svg += '</svg>';
  await sharp({ create: { width: W, height: H, channels: 3, background: '#f4f4f0' } }).composite([...layers, { input: Buffer.from(svg), left: 0, top: 0 }]).png().toFile(file);
}

// a profile at true scale (one map metre across = one game metre up), one line per height scale
export async function profile(file, dist, series, title) {
  const W = 1400, H = 520, m = { l: 60, r: 20, t: 40, b: 40 }, len = dist[dist.length - 1];
  const sx = (W - m.l - m.r) / len, top = Math.max(...series.flatMap((s) => s.y)), sy = sx;   // same scale both ways
  const base = H - m.b, y = (v) => base - Math.max(0, v) * sy;
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#f4f4f0"/>`;
  svg += `<text x="${m.l}" y="24" font-family="sans-serif" font-size="15" font-weight="bold" fill="#111">${esc(title)}</text>`;
  svg += `<line x1="${m.l}" y1="${base}" x2="${W - m.r}" y2="${base}" stroke="#3a6ea5" stroke-width="2"/>`;
  for (let km = 0; km <= len / 1000; km++) svg += `<text x="${m.l + km * 1000 * sx}" y="${base + 18}" font-family="sans-serif" font-size="11" fill="#444" text-anchor="middle">${km} km</text>`;
  for (const s of series) {
    svg += `<polyline fill="none" stroke="${s.color}" stroke-width="2" points="${s.y.map((v, k) => `${(m.l + dist[k] * sx).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>`;
    const k = s.y.indexOf(Math.max(...s.y));
    const px = m.l + dist[k] * sx, end = px > W - 220;   // a peak at the right edge gets its label on the left
    svg += `<text x="${(px + (end ? -6 : 6)).toFixed(1)}" y="${(y(s.y[k]) - 6).toFixed(1)}" font-family="sans-serif" font-size="12" fill="${s.color}" text-anchor="${end ? 'end' : 'start'}">${esc(s.label)} ${Math.round(s.y[k])} m</text>`;
  }
  svg += `<text x="${W - m.r}" y="${H - 8}" font-family="sans-serif" font-size="11" fill="#444" text-anchor="end">true scale: 1 m across = 1 m up (game metres). top ${Math.round(top)} m</text></svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
}

// road lines as SVG for a panel: pixel = (map - origin) / cell * zoom, cropped to [0, w) x [0, h)
export function roadSvg(lines, x0, z0, g, zoom = 1) {
  const COL = { motorway: ['#c0182b', 2.4], trunk: ['#e8730c', 2], primary: ['#f3c400', 1.6], secondary: ['#ffffff', 1.1] };
  let s = '';
  for (const L of lines) {
    const [c, w] = COL[L.hw]; let run = [], k = -1;
    const flush = () => { if (run.length > 1) s += `<polyline fill="none" stroke="${k === 2 ? '#555' : c}" stroke-width="${w * Math.sqrt(zoom)}" ${k ? 'stroke-dasharray="4 3"' : ''} points="${run.join(' ')}"/>`; run = []; };
    for (let i = 0; i < L.n; i += 2) {
      if (L.cls[i] !== k) { const last = run[run.length - 1]; flush(); if (last) run.push(last); k = L.cls[i]; }
      run.push(`${(((L.X[i] - x0) / g) * zoom).toFixed(1)},${(((L.Z[i] - z0) / g) * zoom).toFixed(1)}`);
    }
    flush();
  }
  return s;
}
// an enlarged crop of an RGB panel (nearest neighbour, so cells stay visible)
export async function crop(rgb, nx, nz, i0, j0, w, h, zoom) {
  return sharp(rgb, { raw: { width: nx, height: nz, channels: 3 } }).extract({ left: i0, top: j0, width: w, height: h }).resize(w * zoom, h * zoom, { kernel: 'nearest' }).raw().toBuffer();
}
