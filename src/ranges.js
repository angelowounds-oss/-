import { project, KOREA_SCALE } from './koreamap.js';

// The real mountain spines of South Korea (WLD-20e): the Taebaek and Sobaek ranges, as lon/lat polylines the map projects into metres.
// The envelope is the highest ridge line at (x, z): a Gaussian across each spine, so the crest is the peak and the flanks fall off by the half width.
// The positions are approximate (a few km); the heights are typical crest heights, not survey values. Half widths are in real metres (the map is 1:KOREA_SCALE).
export const RANGES = [
  { id: 'taebaek', peak: 1400, w: 15000, pts: [[128.62, 37.95], [128.72, 37.70], [128.92, 37.10], [129.05, 36.75]] },
  { id: 'sobaek', peak: 1000, w: 12000, pts: [[128.73, 36.95], [128.35, 36.60], [127.80, 36.20], [127.75, 35.85], [127.49, 35.33]] },
];

let LINES = null;
// each spine as map-metre segments [ax, az, bx, bz, peak, w], projected once
function lines() {
  if (LINES) return LINES;
  LINES = [];
  for (const R of RANGES) {
    const P = R.pts.map(([lon, lat]) => project(lon, lat));
    for (let i = 0; i + 1 < P.length; i++) LINES.push([P[i].x, P[i].z, P[i + 1].x, P[i + 1].z, R.peak, R.w / KOREA_SCALE]);
  }
  return LINES;
}

// distance from (x, z) to the segment a-b
function segDist(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}

// crest envelope in metres at map position (x, z): the highest spine line, 0 far from every range
export function rangeHeight(x, z) {
  let h = 0;
  for (const [ax, az, bx, bz, peak, w] of lines()) {
    const d = segDist(x, z, ax, az, bx, bz);
    if (d < w * 3) h = Math.max(h, peak * Math.exp(-(d / w) * (d / w)));
  }
  return h;
}
