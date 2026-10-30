// 서울특별시 (ADR-0036). NEON CITY, the capital, stands at Seoul City Hall (ADR-0017). Its streets, towers and landmarks come from the capital's
// own generator (world.js), not from the city recipe the other cities share, so it has no style or detail here.
import { CAPITAL } from '../koreamap.js';

export default {
  id: 'seoul',
  cities: [{
    def: { id: 'neon', name: 'NEON CITY', type: 'metropolis', x: CAPITAL.x, z: CAPITAL.z, r: 4200, fixed: true },
    rules: { police: 'NCPD 네온 경찰', econ: 1.0,  wet: 0,    tint: [1, 1, 1],             pop: 1.0,  tag: '수도' },   // cityrules.js
    villageLang: 'en',   // the names of the villages nearest to it (settlements.js)
  }],
};
