// Coordinates for the world compiler (ADR-0019): map metres (src/koreamap.js projection) <-> lon/lat, and Web Mercator pixels for map tiles.
import { KOREA_SCALE, KOREA_ORIGIN, project } from '../../src/koreamap.js';

const R = 6371000 / KOREA_SCALE;

// map metres -> lon/lat: the inverse of the azimuthal equidistant projection in koreamap.project (x east, z south)
export function unproject(x, z, origin = KOREA_ORIGIN) {
  const X = x, Y = -z, rho = Math.hypot(X, Y);
  if (rho < 1e-9) return { lon: origin.lon, lat: origin.lat };
  const c = rho / R, p0 = origin.lat * Math.PI / 180;
  const lat = Math.asin(Math.cos(c) * Math.sin(p0) + (Y * Math.sin(c) * Math.cos(p0)) / rho);
  const lon = origin.lon * Math.PI / 180 + Math.atan2(X * Math.sin(c), rho * Math.cos(p0) * Math.cos(c) - Y * Math.sin(p0) * Math.sin(c));
  return { lon: lon * 180 / Math.PI, lat: lat * 180 / Math.PI };
}

// global Web Mercator pixel of lon/lat at zoom z (256 px tiles)
export function mercPx(lon, lat, z) {
  const n = 256 * 2 ** z, r = lat * Math.PI / 180;
  return { px: ((lon + 180) / 360) * n, py: ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n };
}

// the map-metre box of a lon/lat box (corners and edge midpoints: the projection bends the edges a little)
export function mapBox(b) {
  const pts = [];
  for (const lon of [b.w, (b.w + b.e) / 2, b.e]) for (const lat of [b.s, (b.s + b.n) / 2, b.n]) pts.push(project(lon, lat));
  return { x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), z0: Math.min(...pts.map((p) => p.z)), z1: Math.max(...pts.map((p) => p.z)) };
}
