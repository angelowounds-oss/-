// 인천광역시 (ADR-0036). The airport city on Incheon City Hall (WLD-20d); its id stays 'airfield' for the saves, the bake keys and the tests.
import { project } from '../koreamap.js';

export default {
  id: 'incheon',
  cities: [{
    def: { id: 'airfield', name: '인천', type: 'airport', ...project(126.7052, 37.4563), r: 3400 },
    // the city recipe (citylayout.js): street pattern, block pitch, heights, palette, sign words
    style: { pattern: 'radial', pitch: [104, 104], jitter: 0.08, roadW: 18, hMax: 110,  hBase: 12,  palette: [0xb8bec6, 0xa4adb8, 0xc9ccd2, 0x8f99a6, 0xd5d8dc, 0x7d8794, 0x9aa5b1, 0xbfc3c8], accents: [1, 3, 5],   lang: 'en', words: ['SKYPORT', 'DEPARTURES', 'JET FUEL', 'AIR CAFE', 'HANGAR 3', 'CREW INN', 'DUTY FREE', 'RUNWAY BAR'],     density: 0.8 },
    rules: { police: '공항 경찰대',     econ: 1.15, wet: -0.2, tint: [1.0, 1.03, 1.1],     pop: 0.7,  tag: '공항' },   // cityrules.js
    pitched: 0,       // share of pitched roofs (citydetail.js)
    treeRows: 0.35,   // street trees, 1 = every row (citydetail.js)
    villageLang: 'en',
  }],
};
