// The real districts of the capital region as pure data (WLD-24a): where the city is tall, where it is apartments, factories or airfield. The building
// generator (build/world/blocks.mjs) reads it for floors and uses; the later systems (rules, signs, power) can ask the same table. Positions are the
// real lon/lat of each district's centre, turned into the local frame by project(); radii are rough real extents (metres). Floor ranges are the
// real order of magnitude (a business district 10-40 floors, a new-town apartment block 15-35), not a survey of single buildings.
import { project, CAPITAL } from './koreamap.js';

// types: core (offices and shops), tech (office parks), mixed (shops, offices, flats), apt (apartment complexes), aptHigh (tower apartments),
//        industrial, port, airport and park (nothing is built there)
const D = (id, name, lon, lat, r, type, fl = [0, 0]) => { const p = project(lon, lat); return { id, name, x: p.x - CAPITAL.x, z: p.z - CAPITAL.z, r, type, fl }; };
export const DISTRICTS = [
  // Seoul
  D('sichung', '시청·광화문', 126.978, 37.5665, 2200, 'core', [10, 28]),
  D('jongno', '종로·을지로', 126.992, 37.570, 1600, 'core', [8, 24]),
  D('dongdaemun', '동대문', 127.009, 37.571, 1100, 'core', [6, 18]),
  D('yongsan', '용산', 126.965, 37.529, 1500, 'core', [8, 22]),
  D('yeouido', '여의도', 126.9243, 37.5219, 1800, 'core', [15, 45]),
  D('yeongdeungpo', '영등포', 126.906, 37.516, 1300, 'mixed', [6, 20]),
  D('mapo', '마포·공덕', 126.9515, 37.544, 1300, 'core', [10, 25]),
  D('sinchon', '신촌·홍대', 126.936, 37.556, 1400, 'mixed', [5, 15]),
  D('gangnam', '강남·테헤란로', 127.0364, 37.5009, 3200, 'core', [14, 38]),
  D('samseong', '삼성·코엑스', 127.059, 37.5115, 1300, 'core', [14, 36]),
  D('jamsil', '잠실', 127.1, 37.5125, 2200, 'aptHigh', [25, 50]),
  D('seongsu', '성수', 127.045, 37.545, 1500, 'mixed', [5, 16]),
  D('sangam', '상암 DMC', 126.89, 37.577, 1400, 'core', [10, 30]),
  D('guro', '구로·가산 디지털', 126.886, 37.48, 2200, 'tech', [8, 24]),
  D('mokdong', '목동', 126.875, 37.529, 1800, 'aptHigh', [18, 35]),
  D('nowon', '노원', 127.056, 37.654, 2000, 'apt', [15, 25]),
  // Gyeonggi next to Seoul
  D('pangyo', '판교', 127.1115, 37.395, 1500, 'tech', [10, 30]),
  D('bundang', '분당', 127.12, 37.38, 3000, 'apt', [15, 30]),
  D('ilsan', '일산', 126.77, 37.659, 3000, 'apt', [15, 28]),
  D('jungdong', '부천 중동', 126.764, 37.498, 2200, 'aptHigh', [18, 30]),
  D('gwangmyeong', '광명', 126.865, 37.478, 1500, 'apt', [15, 25]),
  D('pyeongchon', '안양 평촌', 126.956, 37.39, 2200, 'apt', [15, 28]),
  D('suwon', '수원', 127.0286, 37.2636, 3000, 'mixed', [5, 20]),
  // Incheon
  D('guwol', '인천 구월', 126.7052, 37.4563, 2200, 'core', [8, 30]),
  D('songdo', '송도', 126.65, 37.39, 3200, 'aptHigh', [25, 60]),
  D('bupyeong', '부평', 126.7227, 37.4894, 1800, 'mixed', [5, 18]),
  D('cheongna', '청라', 126.65, 37.533, 2000, 'aptHigh', [18, 40]),
  D('gyeyang', '계양', 126.737, 37.537, 1500, 'apt', [15, 25]),
  D('namdong', '남동공단', 126.7, 37.4, 2600, 'industrial'),
  D('gajwa', '서구 가좌', 126.67, 37.49, 1500, 'industrial'),
  D('incheonport', '인천항', 126.62, 37.467, 1500, 'port'),
  // where nothing is built
  D('gimpo-airport', '김포공항', 126.7906, 37.5586, 2400, 'airport'),
  D('seoul-airport', '서울공항', 127.1133, 37.4458, 1800, 'airport'),
  D('olympic-park', '올림픽공원', 127.1215, 37.5205, 650, 'park'),
  D('childrens-park', '어린이대공원', 127.0815, 37.548, 500, 'park'),
];
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// the district that matters most at (x, z) and how strongly (t 1 in its core, 0 at its edge), or null; a no-build district answers with t 1 and `block`
export function districtAt(x, z) {
  let best = null, bt = 0;
  for (const d of DISTRICTS) {
    const dist = Math.hypot(x - d.x, z - d.z); if (dist >= d.r) continue;
    if (d.type === 'airport' || d.type === 'park') return { id: d.id, type: d.type, t: 1, fl: d.fl, block: true };
    const t = 1 - sstep(d.r * 0.55, d.r, dist);
    if (t > bt) { bt = t; best = d; }
  }
  return best && { id: best.id, type: best.type, t: bt, fl: best.fl, block: false };
}
