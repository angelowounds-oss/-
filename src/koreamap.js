// South Korea as data (pure, no three.js): the 17 administrative regions as lon/lat boxes, one detailed city per region (real names, city hall
// coordinates), the islands that get a town, and the projection from lon/lat to game metres (WLD-20). x runs east, z runs south, metres.
// The scale and origin are parameters of the projection and are not decided here: real Korea including Jeju and Ulleung is about 564 km wide and
// 601 km tall, which fits the 100 km map (worldmap WORLD_HALF = 50 km) only from about 1:6.5 down.
export const KOREA_SCALE = 6.5;
export const KOREA_ORIGIN = { lon: 127.77, lat: 35.9 };   // the centre of the country's lon/lat box: x = z = 0 (NEON CITY's place is still an open decision)

// [code, name, west, south, east, north] from the KOSTAT 2013 province outlines (simplified)
export const REGIONS = [
  ['11', '서울특별시', 126.77, 37.426, 127.184, 37.698], ['21', '부산광역시', 128.796, 35.01, 129.307, 35.385],
  ['22', '대구광역시', 128.353, 35.604, 128.765, 36.012], ['23', '인천광역시', 124.613, 37.081, 126.796, 37.981],
  ['24', '광주광역시', 126.654, 35.049, 127.023, 35.256], ['25', '대전광역시', 127.252, 36.186, 127.557, 36.497],
  ['26', '울산광역시', 128.973, 35.326, 129.467, 35.722], ['29', '세종특별자치시', 127.136, 36.405, 127.411, 36.731],
  ['31', '경기도', 126.517, 36.891, 127.852, 38.289], ['32', '강원특별자치도', 127.111, 37.026, 129.366, 38.611],
  ['33', '충청북도', 127.281, 36.011, 128.654, 37.255], ['34', '충청남도', 126.104, 35.975, 127.64, 37.062],
  ['35', '전북특별자치도', 126.25, 35.297, 127.911, 36.153], ['36', '전라남도', 125.096, 33.965, 127.813, 35.483],
  ['37', '경상북도', 127.8, 35.563, 130.921, 37.546], ['38', '경상남도', 127.58, 34.616, 129.222, 35.912],
  ['39', '제주특별자치도', 126.161, 33.191, 126.973, 33.564],
];

// one detailed city per region: the provincial or metropolitan city hall (approximate, from common knowledge; verify with KOSIS/공공데이터)
export const CITIES = [
  { id: 'seoul', name: '서울', region: '11', lon: 126.978, lat: 37.5665 }, { id: 'busan', name: '부산', region: '21', lon: 129.0756, lat: 35.1796 },
  { id: 'daegu', name: '대구', region: '22', lon: 128.6014, lat: 35.8714 }, { id: 'incheon', name: '인천', region: '23', lon: 126.7052, lat: 37.4563 },
  { id: 'gwangju', name: '광주', region: '24', lon: 126.8526, lat: 35.1595 }, { id: 'daejeon', name: '대전', region: '25', lon: 127.3845, lat: 36.3504 },
  { id: 'ulsan', name: '울산', region: '26', lon: 129.3114, lat: 35.5384 }, { id: 'sejong', name: '세종', region: '29', lon: 127.289, lat: 36.48 },
  { id: 'suwon', name: '수원', region: '31', lon: 127.0286, lat: 37.2636 }, { id: 'chuncheon', name: '춘천', region: '32', lon: 127.7298, lat: 37.8813 },
  { id: 'cheongju', name: '청주', region: '33', lon: 127.489, lat: 36.6424 }, { id: 'cheonan', name: '천안', region: '34', lon: 127.1139, lat: 36.8151 },
  { id: 'jeonju', name: '전주', region: '35', lon: 127.148, lat: 35.8242 }, { id: 'muan', name: '무안', region: '36', lon: 126.4488, lat: 34.99 },
  { id: 'andong', name: '안동', region: '37', lon: 128.7294, lat: 36.5684 }, { id: 'changwon', name: '창원', region: '38', lon: 128.6811, lat: 35.228 },
  { id: 'jeju', name: '제주', region: '39', lon: 126.5312, lat: 33.4996 },
];

// islands outside the detailed cities: towns with a ferry or bridge link (표식 수준)
export const ISLANDS = [
  { id: 'ulleung', name: '울릉도', lon: 130.9047, lat: 37.4845 }, { id: 'ganghwa', name: '강화도', lon: 126.487, lat: 37.7469 },
  { id: 'geoje', name: '거제도', lon: 128.6211, lat: 34.8806 },
];

// the capital's place in the world: Seoul City Hall (ADR-0017). The game's local frame (the detailed city) is centred here; far-world data is read at world = local + CAPITAL
export const CAPITAL = { x: -10741, z: -28553 };   // project(126.978, 37.5665), rounded to metres; unit/koreamap checks it

// lon/lat to game metres: x east, z south, the origin at KOREA_ORIGIN. Azimuthal equidistant, so distances from the origin are exact and
// distances between towns inside the country stay within about 1% (a plain equirectangular grid drifts by 2% at the north-east corner)
export function project(lon, lat, scale = KOREA_SCALE, origin = KOREA_ORIGIN) {
  const r = Math.PI / 180, p0 = origin.lat * r, p = lat * r, dl = (lon - origin.lon) * r;
  const cosc = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(dl), c = Math.acos(Math.min(1, Math.max(-1, cosc)));
  const k = c < 1e-9 ? 1 : c / Math.sin(c), R = 6371000 / scale;
  const x = R * k * Math.cos(p) * Math.sin(dl), y = R * k * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(dl));
  return { x, z: -y };
}

// the land mask of build/korea_mask.mjs: 200 x 200 cells of 500 m over the 100 km world (1 = land, 0 = sea)
import { LAND_B64 } from './korealand.js';

export const LAND_CELL = 500, LAND_N = 200, LAND_HALF = 50000;
let LAND = null;
// the mask as bytes (decoded once; the same in the page and in node)
export function koreaMask() { return LAND || (LAND = Uint8Array.from(atob(LAND_B64), (c) => c.charCodeAt(0))); }
export function landAt(mask, x, z) {
  const i = Math.floor((x + LAND_HALF) / LAND_CELL), j = Math.floor((z + LAND_HALF) / LAND_CELL);
  if (i < 0 || j < 0 || i >= LAND_N || j >= LAND_N) return 0;
  return mask[j * LAND_N + i];
}
